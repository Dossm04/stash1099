import { describe, expect, it } from "vitest";
import { stashStatus } from "./stash";
import { buildIcs, nextFriday } from "./ics";
import { buildPlan } from "./tax/engine";
import { MAYA_STATE, decodeShare, encodeShare, sanitize } from "./state";

const plan = { setAsideRate: 0.2, breakdown: { grossSelfEmployment: 50_000 } } as Parameters<typeof stashStatus>[3];
const pay = (date: string, amount: number) => ({ id: date, date, source: "x", amount });
const dep = (date: string, amount: number) => ({ id: date, date, amount });

describe("stashStatus", () => {
  it("targets set-aside rate × income received so far", () => {
    const s = stashStatus([pay("2026-02-01", 10_000), pay("2026-12-01", 5_000)], [], [], plan, "2026-11-14");
    expect(s.targetToDate).toBe(2_000); // future payout not counted yet
    expect(s.targetForYear).toBe(10_000);
    expect(s.status).toBe("behind");
    expect(s.gap).toBe(-2_000);
  });

  it("is on track once enough is stashed, and IRS payments come out of the stash", () => {
    const s = stashStatus(
      [pay("2026-02-01", 10_000)],
      [dep("2026-02-02", 2_500)],
      [dep("2026-04-15", 1_000)],
      plan,
      "2026-11-14",
    );
    expect(s.status).toBe("on-track");
    expect(s.covered).toBe(2_500);
    expect(s.balance).toBe(1_500);
    expect(s.progress).toBeCloseTo(0.25);
  });

  it("counts IRS payments made without stashing first", () => {
    const s = stashStatus([pay("2026-02-01", 10_000)], [], [dep("2026-04-15", 3_000)], plan, "2026-11-14");
    expect(s.covered).toBe(3_000);
    expect(s.balance).toBe(0);
  });

  it("shows Maya behind on her stash in the demo", () => {
    const p = buildPlan({ ...MAYA_STATE, asOf: "2026-11-14" });
    const s = stashStatus(MAYA_STATE.payments, MAYA_STATE.stashDeposits, MAYA_STATE.estimatedPayments, p, "2026-11-14");
    expect(s.status).toBe("behind");
    expect(s.covered).toBe(3_000);
  });
});

describe("calendar export", () => {
  it("finds the next Friday", () => {
    expect(nextFriday("2026-11-14")).toBe("2026-11-20"); // Saturday → next Friday
    expect(nextFriday("2026-11-20")).toBe("2026-11-20");
  });

  it("writes deadline events with amounts and a weekly check-in until the return is due", () => {
    const ics = buildIcs([{ dueDate: "2027-01-15", amount: 1550 }], "https://x", {
      from: "2026-11-14",
      until: "2027-04-15",
      rate: 0.17,
    });
    expect(ics).toContain("DTSTART;VALUE=DATE:20270115");
    expect(ics).toContain("SUMMARY:Pay IRS estimated tax: $1,550");
    expect(ics).toContain("RRULE:FREQ=WEEKLY;UNTIL=20270415");
    expect(ics).toContain("move 17% to tax savings");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });
});

describe("share link", () => {
  it("round-trips the whole plan through the URL", () => {
    expect(decodeShare(encodeShare(MAYA_STATE))).toEqual(MAYA_STATE);
  });

  it("rejects garbage and clamps hostile values", () => {
    expect(decodeShare("not-base64!!")).toBeNull();
    const s = sanitize({
      stateRate: 9,
      payments: [
        { date: "bad", amount: 5 },
        { date: "2026-01-01", amount: -3 },
      ],
    });
    expect(s?.stateRate).toBe(0.15);
    expect(s?.payments).toEqual([]);
    expect(s?.stashDeposits).toEqual([]);
  });
});

describe("quotePayout", () => {
  const today = "2026-11-15";
  const gapOf = (st: typeof MAYA_STATE) =>
    stashStatus(st.payments, st.stashDeposits, st.estimatedPayments, buildPlan({ ...st, asOf: today }), today).gap;

  it("stashing the quoted amount keeps the gap unchanged when the year forecast is fixed", async () => {
    const { quotePayout } = await import("./quote");
    const maya = { ...MAYA_STATE, expectedRestOfYear: 7_000 };
    const q = quotePayout(maya, 1200, today);
    expect(q.stash + q.yours).toBe(1200);
    const next = {
      ...maya,
      payments: [...maya.payments, pay(today, 1200)],
      stashDeposits: [...maya.stashDeposits, dep(today, q.stash)],
    };
    expect(Math.abs(gapOf(next) - gapOf(maya))).toBeLessThanOrEqual(1);
  });

  it("quotes the marginal rate: SE tax only while income is under the standard deduction", async () => {
    const { quotePayout } = await import("./quote");
    const low = {
      ...MAYA_STATE,
      payments: [pay("2026-01-20", 500)],
      expectedRestOfYear: 0,
      qualifiedTips: 0,
      businessMiles: 0,
      businessExpenses: 0,
    };
    // 92.35% × 15.3% = 14.13%
    expect(quotePayout(low, 1000, "2026-02-10").stash).toBe(141);
    // Maya in November: SE tax + 12% bracket net of QBI ≈ 22%, above her 17% average.
    const q = quotePayout(MAYA_STATE, 1200, today);
    expect(q.stash / 1200).toBeGreaterThan(0.2);
    expect(q.stash / 1200).toBeLessThan(0.25);
  });
});

describe("safeToSpend", () => {
  it("subtracts tax earned-but-not-stashed from the checking balance", async () => {
    const { safeToSpend } = await import("./stash");
    const s = stashStatus([pay("2026-02-01", 10_000)], [dep("2026-02-02", 500)], [], plan, "2026-11-14");
    // target 2,000, covered 500 → 1,500 of the balance belongs to the IRS
    const res = safeToSpend(4_000, s, { breakdown: { totalTax: 9_000 } } as never, 0);
    expect(res.unstashedTax).toBe(1_500);
    expect(res.safe).toBe(2_500);
    expect(res.stillOwedForYear).toBe(9_000);
    expect(res.aprilShortfall).toBe(8_500);
  });

  it("goes negative when tax money was already spent", async () => {
    const { safeToSpend } = await import("./stash");
    const s = stashStatus([pay("2026-02-01", 10_000)], [], [], plan, "2026-11-14");
    expect(safeToSpend(1_200, s, { breakdown: { totalTax: 2_500 } } as never, 0).safe).toBe(-800);
  });
});
