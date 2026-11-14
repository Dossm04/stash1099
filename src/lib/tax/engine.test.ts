import { describe, expect, it } from "vitest";
import { TAX_2026 } from "./config2026";
import {
  bracketTax,
  buildPlan,
  computeTax,
  mileageDeduction,
  simulatePenalty,
  splitPayment,
  type TaxInput,
} from "./engine";
import { parsePayments } from "../parsePayments";
import { MAYA_STATE } from "../state";

const base: TaxInput = {
  filingStatus: "single",
  payments: [{ id: "a", date: "2026-03-01", source: "x", amount: 60_000 }],
  expectedRestOfYear: 0,
  businessExpenses: 0,
  businessMiles: 0,
  qualifiedTips: 0,
  w2Wages: 0,
  w2Withholding: 0,
  stateRate: 0,
  priorYearTax: null,
  priorYearAgiOver150k: false,
  estimatedPayments: [],
  asOf: "2026-11-14",
};

describe("bracketTax", () => {
  it("applies progressive 2026 single brackets", () => {
    // 12,400 × 10% + 37,600 × 12%
    expect(bracketTax(50_000, TAX_2026.brackets.single).tax).toBeCloseTo(5_752, 2);
    expect(bracketTax(50_000, TAX_2026.brackets.single).marginal).toBe(0.12);
    expect(bracketTax(0, TAX_2026.brackets.single).tax).toBe(0);
  });
});

describe("computeTax", () => {
  it("matches a hand-computed Schedule SE + 1040 for $60k net profit, single", () => {
    const t = computeTax(base);
    // SE: 60,000 × 0.9235 × 15.3%
    expect(t.seTax).toBeCloseTo(8_477.73, 1);
    // AGI = 60,000 − SE/2
    expect(t.agi).toBeCloseTo(55_761.14, 1);
    // QBI limited to 20% of (AGI − 16,100)
    expect(t.qbiDeduction).toBeCloseTo(7_932.23, 1);
    expect(t.incomeTax).toBeCloseTo(3_559.47, 1);
    expect(t.federalTotal).toBeCloseTo(12_037.2, 0);
  });

  it("caps Social Security part of SE tax at the wage base, counting W-2 wages first", () => {
    const t = computeTax({ ...base, w2Wages: 184_500 });
    // Only Medicare 2.9% remains on SE earnings.
    expect(t.seTax).toBeCloseTo(60_000 * 0.9235 * 0.029, 1);
  });

  it("owes no SE tax under $400 of net earnings", () => {
    const t = computeTax({ ...base, payments: [{ id: "a", date: "2026-02-01", source: "x", amount: 400 }] });
    expect(t.seTax).toBe(0);
  });

  it("deducts mileage at the blended 2026 rate (72.5¢ H1, 76¢ H2)", () => {
    const d = mileageDeduction(10_000);
    expect(d).toBeGreaterThan(7_250);
    expect(d).toBeLessThan(7_600);
  });

  it("applies the no-tax-on-tips deduction, capped by net profit", () => {
    const t = computeTax({ ...base, qualifiedTips: 5_000 });
    expect(t.tipsDeduction).toBe(5_000);
    expect(t.incomeTax).toBeLessThan(computeTax(base).incomeTax);
  });

  it("projects the rest of the year from the pace so far when no expectation is given", () => {
    const t = computeTax({
      ...base,
      payments: [{ id: "a", date: "2026-01-10", source: "x", amount: 30_000 }],
      expectedRestOfYear: null,
      asOf: "2026-07-02", // day 183 of 365
    });
    expect(t.grossSelfEmployment).toBeGreaterThan(59_000);
    expect(t.grossSelfEmployment).toBeLessThan(61_000);
  });
});

describe("simulatePenalty (Form 2210 regular method)", () => {
  const onTime = TAX_2026.estimated.dueDates.map((date) => ({ date, amount: 1_000 }));

  it("is zero when every installment is paid on its due date", () => {
    expect(simulatePenalty(4_000, 0, onTime, "2027-04-15").penalty).toBe(0);
  });

  it("charges daily interest for a late installment at the quarter's rate", () => {
    const late = [{ date: "2026-04-25", amount: 1_000 }, ...onTime.slice(1)];
    // 10 days × 6% (Q2 2026) on $1,000
    expect(simulatePenalty(4_000, 0, late, "2027-04-15").penalty).toBeCloseTo((1_000 * 0.06 * 10) / 365, 2);
  });

  it("applies a late payment to the oldest shortfall first", () => {
    const r = simulatePenalty(4_000, 0, [{ date: "2026-07-01", amount: 1_000 }], "2026-07-01");
    expect(r.outstanding).toEqual([0, 1_000, 0, 0]);
  });

  it("treats W-2 withholding as paid evenly on the due dates", () => {
    expect(simulatePenalty(4_000, 4_000, [], "2027-04-15").penalty).toBe(0);
  });
});

describe("buildPlan", () => {
  it("uses the prior-year safe harbor when it is lower", () => {
    const p = buildPlan({ ...base, priorYearTax: 5_000 });
    expect(p.safeHarborBasis).toBe("prior-year-100");
    expect(p.requiredAnnualPayment).toBe(5_000);
    const hi = buildPlan({ ...base, priorYearTax: 5_000, priorYearAgiOver150k: true });
    expect(hi.requiredAnnualPayment).toBe(5_500);
  });

  it("following the plan stops all further penalty growth", () => {
    const p = buildPlan({ ...base, priorYearTax: 5_000 });
    expect(p.penaltyAccruedToDate).toBeGreaterThan(0);
    expect(p.penaltyIfNoMorePayments).toBeGreaterThan(p.penaltyIfFollowPlan);
    // Catching up today means only the interest already accrued remains (+ the same day).
    expect(p.penaltyIfFollowPlan).toBeCloseTo(p.penaltyAccruedToDate, 0);
    expect(p.upcomingSafe).toEqual([{ dueDate: "2027-01-15", amount: 1_250 }]);
  });

  it("no penalty when the balance after withholding is under $1,000", () => {
    const p = buildPlan({ ...base, payments: [{ id: "a", date: "2026-02-01", source: "x", amount: 3_000 }] });
    expect(p.noPenaltyBecauseSmallBalance).toBe(true);
    expect(p.penaltyIfNoMorePayments).toBe(0);
  });

  it("set-aside rate is the extra tax caused by each 1099 dollar", () => {
    const p = buildPlan(base);
    expect(p.setAsideRate).toBeCloseTo(p.breakdown.totalTax / 60_000, 4);
    expect(splitPayment(1_000, 0.2)).toEqual({ stash: 200, yours: 800 });
  });

  it("produces a sane plan for the Maya demo persona", () => {
    const p = buildPlan({ ...MAYA_STATE, asOf: "2026-11-14" });
    expect(p.breakdown.grossSelfEmployment).toBeGreaterThan(55_000);
    expect(p.setAsideRate).toBeGreaterThan(0.15);
    expect(p.setAsideRate).toBeLessThan(0.3);
    expect(p.installments.map((i) => i.status)).toEqual(["paid", "missed", "missed", "upcoming"]);
    expect(p.catchUpNow).toBeGreaterThan(0);
  });
});

describe("parsePayments", () => {
  it("reads common pasted formats", () => {
    const r = parsePayments("Mar 3 Upwork 2,400\n2026-03-05, DoorDash, $412.50\n03/09 Uber Eats 312\nbad line", 2026);
    expect(r.payments.map((p) => [p.date, p.source, p.amount])).toEqual([
      ["2026-03-03", "Upwork", 2400],
      ["2026-03-05", "DoorDash", 412.5],
      ["2026-03-09", "Uber Eats", 312],
    ]);
    expect(r.errors).toHaveLength(1);
  });
});
