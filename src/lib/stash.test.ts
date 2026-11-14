import { describe, expect, it } from "vitest";
import { buildIcs, nextFriday } from "./ics";
import { quotePayout } from "./quote";
import { snapshot } from "./snapshot";
import { accruedTax, catchUpPlan, safeToSpend, stashStatus, taxFromSelfEmployment, taxReadyScore } from "./stash";
import { EMPTY_STATE, MAYA_STATE, decodeShare, encodeShare, sanitize, type PlanState } from "./state";

const TODAY = "2026-11-15";
const pay = (date: string, amount: number) => ({ id: date + amount, date, source: "x", amount });
const dep = (date: string, amount: number) => ({ id: date + amount, date, amount });
const targets = { toDate: 2_000, forYear: 10_000 };

describe("accruedTax (tax already incurred on money received)", () => {
  it("is zero before any income arrives", () => {
    expect(accruedTax({ ...EMPTY_STATE, asOf: TODAY })).toBe(0);
  });

  it("is only self-employment tax while income is under the standard deduction", () => {
    const s = { ...EMPTY_STATE, payments: [pay("2026-01-20", 5_000)], expectedRestOfYear: 0, asOf: "2026-02-10" };
    // 5,000 × 92.35% × 15.3%
    expect(accruedTax(s)).toBeCloseTo(706.48, 1);
  });

  it("equals the full-year figure once nothing more is expected", () => {
    const s = { ...EMPTY_STATE, payments: [pay("2026-03-01", 60_000)], expectedRestOfYear: 0, asOf: TODAY };
    expect(accruedTax(s)).toBeCloseTo(taxFromSelfEmployment(s), 2);
  });

  it("is lower than the projected-year tax while more income is still expected", () => {
    const s = { ...MAYA_STATE, asOf: TODAY };
    expect(accruedTax(s)).toBeLessThan(taxFromSelfEmployment(s));
    expect(accruedTax(s)).toBeGreaterThan(0.8 * taxFromSelfEmployment(s));
  });

  it("ignores payouts dated in the future", () => {
    const s = { ...EMPTY_STATE, payments: [pay("2026-12-20", 9_000)], expectedRestOfYear: 0, asOf: TODAY };
    expect(accruedTax(s)).toBe(0);
  });
});

describe("stashStatus", () => {
  it("is behind by the tax accrued minus what is covered", () => {
    const s = stashStatus([pay("2026-02-01", 10_000)], [], [], targets, TODAY);
    expect(s.status).toBe("behind");
    expect(s.gap).toBe(-2_000);
    expect(s.targetForYear).toBe(10_000);
  });

  it("IRS payments come out of tax savings by default", () => {
    const s = stashStatus(
      [pay("2026-02-01", 10_000)],
      [dep("2026-02-02", 2_500)],
      [dep("2026-04-15", 1_000)],
      targets,
      TODAY,
    );
    expect(s.balance).toBe(1_500);
    expect(s.covered).toBe(2_500);
    expect(s.status).toBe("on-track");
    expect(s.progress).toBeCloseTo(0.25);
  });

  it("an IRS payment made from checking adds to what is covered", () => {
    const irs = [{ ...dep("2026-04-15", 1_000), fromChecking: true }];
    const s = stashStatus([pay("2026-02-01", 10_000)], [dep("2026-02-02", 2_500)], irs, targets, TODAY);
    expect(s.balance).toBe(2_500);
    expect(s.covered).toBe(3_500);
  });

  it("never shows a negative tax savings balance", () => {
    const s = stashStatus(
      [pay("2026-02-01", 10_000)],
      [dep("2026-02-02", 500)],
      [dep("2026-04-15", 3_000)],
      targets,
      TODAY,
    );
    expect(s.balance).toBe(0);
    expect(s.covered).toBe(3_000);
  });
});

describe("safeToSpend", () => {
  const stash = stashStatus([pay("2026-02-01", 10_000)], [dep("2026-02-02", 500)], [], targets, TODAY);
  const plan = { breakdown: { totalTax: 9_000 } } as never;

  it("subtracts tax earned-but-not-stashed from the checking balance", () => {
    const res = safeToSpend(4_000, stash, plan, 0);
    expect(res.unstashedTax).toBe(1_500);
    expect(res.safe).toBe(2_500);
    expect(res.stillOwedForYear).toBe(9_000);
    expect(res.aprilShortfall).toBe(8_500);
  });

  it("also holds back bills due before the next payout", () => {
    expect(safeToSpend(4_000, stash, plan, 0, 1_650).safe).toBe(850);
  });

  it("goes negative when tax money was already spent", () => {
    expect(safeToSpend(1_200, stash, plan, 0).safe).toBe(-300);
  });
});

describe("quotePayout", () => {
  it("stashing exactly the quote leaves the gap unchanged", () => {
    for (const state of [MAYA_STATE, { ...MAYA_STATE, expectedRestOfYear: 7_000 }] as PlanState[]) {
      const before = snapshot(state, TODAY).stash.gap;
      const q = quotePayout(state, 1_200, TODAY);
      expect(q.stash + q.yours).toBe(1_200);
      const next: PlanState = {
        ...state,
        payments: [...state.payments, pay(TODAY, 1_200)],
        stashDeposits: [...state.stashDeposits, dep(TODAY, q.stash)],
      };
      expect(Math.abs(snapshot(next, TODAY).stash.gap - before)).toBeLessThanOrEqual(1);
    }
  });

  it("quotes the real marginal cost: 14% early in the year, 23% for Maya in November", () => {
    const early: PlanState = { ...EMPTY_STATE, payments: [pay("2026-01-20", 500)], expectedRestOfYear: 0 };
    expect(quotePayout(early, 1_000, "2026-02-10").stash).toBe(141);
    // SE tax 169.55 + 12% bracket on (1,200 − half of SE tax) net of the 20% QBI deduction
    expect(quotePayout(MAYA_STATE, 1_200, TODAY).stash).toBe(277);
  });

  it("never quotes more than the payout or less than zero", () => {
    const q = quotePayout(MAYA_STATE, 3, TODAY);
    expect(q.stash).toBeGreaterThanOrEqual(0);
    expect(q.stash).toBeLessThanOrEqual(3);
  });
});

describe("taxReadyScore", () => {
  it("is 100 when everything is covered, funded and fresh", () => {
    const stash = stashStatus([pay("2026-11-12", 10_000)], [dep("2026-11-12", 4_000)], [], targets, TODAY);
    const plan = {
      catchUpNow: 0,
      requiredAnnualPayment: 6_000,
      upcomingSafe: [{ dueDate: "2027-01-15", amount: 1_500 }],
    };
    expect(taxReadyScore(stash, plan, "2026-11-12", TODAY)).toMatchObject({ score: 100, level: "ready" });
  });

  it("drops for a stale log, missed deadlines and an unfunded payment", () => {
    const stash = stashStatus([pay("2026-06-01", 10_000)], [], [], targets, TODAY);
    const plan = {
      catchUpNow: 3_000,
      requiredAnnualPayment: 6_000,
      upcomingSafe: [{ dueDate: "2027-01-15", amount: 1_500 }],
    };
    const s = taxReadyScore(stash, plan, "2026-06-01", TODAY);
    expect(s.score).toBe(10); // 0 coverage + 10 of 20 deadlines + 0 funded + 0 fresh
    expect(s.level).toBe("at-risk");
    expect(s.parts.map((p) => p.max).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("rises when Maya catches up", () => {
    const before = snapshot(MAYA_STATE, TODAY);
    const caughtUp: PlanState = {
      ...MAYA_STATE,
      stashDeposits: [...MAYA_STATE.stashDeposits, dep(TODAY, before.safe.unstashedTax)],
    };
    expect(snapshot(caughtUp, TODAY).score.score).toBeGreaterThan(before.score.score + 25);
  });
});

describe("catchUpPlan", () => {
  it("spreads the gap over the next payouts on top of the normal rate", () => {
    const payouts = [pay("2026-10-01", 2_000), pay("2026-10-15", 2_000), pay("2026-11-01", 2_000)];
    const p = catchUpPlan(-1_200, payouts, 0.2, 6);
    expect(p.extraPerPayout).toBe(200);
    expect(p.rate).toBeCloseTo(0.3);
    expect(p.feasible).toBe(true);
  });

  it("flags a plan that would take most of every payout", () => {
    expect(catchUpPlan(-6_000, [pay("2026-11-01", 1_000)], 0.2, 4).feasible).toBe(false);
  });

  it("needs nothing extra when the user is on track", () => {
    expect(catchUpPlan(250, [pay("2026-11-01", 1_000)], 0.2, 4).extraPerPayout).toBe(0);
  });
});

describe("demo persona (Maya) tells one consistent story", () => {
  const snap = snapshot(MAYA_STATE, TODAY);

  it("she is behind and has already spent tax money", () => {
    expect(snap.stash.status).toBe("behind");
    expect(snap.stash.covered).toBe(3_000);
    expect(snap.stash.balance).toBe(1_000);
    expect(snap.safe.safe).toBeCloseTo(4_200 - snap.safe.unstashedTax, 2);
    expect(snap.safe.safe).toBeLessThan(0);
  });

  it("never paid the IRS more than was in tax savings at the time", () => {
    for (const p of MAYA_STATE.estimatedPayments) {
      const stashedByThen = MAYA_STATE.stashDeposits.filter((d) => d.date <= p.date).reduce((s, d) => s + d.amount, 0);
      expect(stashedByThen).toBeGreaterThanOrEqual(p.amount);
    }
  });

  it("new payouts cost more than her yearly average", () => {
    expect(snap.nextRate).toBeGreaterThan(snap.plan.setAsideRate);
  });
});

describe("calendar export", () => {
  it("finds the next Friday", () => {
    expect(nextFriday("2026-11-14")).toBe("2026-11-20");
    expect(nextFriday("2026-11-20")).toBe("2026-11-20");
  });

  it("writes deadline events with amounts and a weekly check-in until the return is due", () => {
    const ics = buildIcs([{ dueDate: "2027-01-15", amount: 1550 }], "https://x", {
      from: "2026-11-14",
      until: "2027-04-15",
      rate: 0.23,
    });
    expect(ics).toContain("DTSTART;VALUE=DATE:20270115");
    expect(ics).toContain("SUMMARY:Pay IRS estimated tax: $1,550");
    expect(ics).toContain("RRULE:FREQ=WEEKLY;UNTIL=20270415");
    expect(ics).toContain("move 23% to tax savings");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });
});

describe("share link and stored state", () => {
  it("round-trips the whole plan through the URL", () => {
    expect(decodeShare(encodeShare(MAYA_STATE))).toEqual(MAYA_STATE);
  });

  it("rejects garbage and clamps hostile values", () => {
    expect(decodeShare("not-base64!!")).toBeNull();
    const s = sanitize({
      stateRate: 9,
      kidsUnder17: 99,
      payments: [
        { date: "bad", amount: 5 },
        { date: "2026-01-01", amount: -3 },
      ],
    });
    expect(s?.stateRate).toBe(0.15);
    expect(s?.kidsUnder17).toBe(10);
    expect(s?.payments).toEqual([]);
    expect(s?.stashDeposits).toEqual([]);
    expect(s?.billsDue).toBe(0);
  });

  it("keeps the 'paid from checking' flag on IRS payments", () => {
    const s = sanitize({ estimatedPayments: [{ id: "a", date: "2026-04-15", amount: 100, fromChecking: true }] });
    expect(s?.estimatedPayments[0].fromChecking).toBe(true);
  });
});
