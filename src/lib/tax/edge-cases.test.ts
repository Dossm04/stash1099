/**
 * Hard cases checked against hand calculations (worked out line by line from the 2026 rules).
 */
import { describe, expect, it } from "vitest";
import { buildPlan, computeTax, mileageDeduction, type TaxInput } from "./engine";
import { parsePayments } from "../parsePayments";
import { importBankCsv, parseCsv } from "../importCsv";
import { sanitize } from "../state";

const base: TaxInput = {
  filingStatus: "single",
  payments: [],
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
  asOf: "2026-11-15",
};
const income = (amount: number) => [{ id: "x", date: "2026-03-01", source: "x", amount }];

describe("hand-computed returns", () => {
  it("married filing jointly, $120k net profit", () => {
    const t = computeTax({ ...base, filingStatus: "mfj", payments: income(120_000) });
    // SE: 110,820 × 15.3% = 16,955.46 · AGI 111,522.27 · QBI capped at 20% × 79,322.27
    expect(t.seTax).toBeCloseTo(16_955.46, 1);
    expect(t.qbiDeduction).toBeCloseTo(15_864.45, 1);
    // 24,800 × 10% + (63,457.82 − 24,800) × 12%
    expect(t.incomeTax).toBeCloseTo(7_118.94, 1);
    expect(t.federalTotal).toBeCloseTo(24_074.4, 0);
  });

  it("above the Social Security wage base: SS capped, additional Medicare, QBI dropped", () => {
    const t = computeTax({ ...base, payments: income(250_000) });
    // 184,500 × 12.4% + 230,875 × 2.9%
    expect(t.seTax).toBeCloseTo(29_573.38, 1);
    // (230,875 − 200,000) × 0.9%
    expect(t.additionalMedicare).toBeCloseTo(277.88, 1);
    expect(t.qbiLimited).toBe(true);
    expect(t.qbiDeduction).toBe(0);
    expect(t.incomeTax).toBeCloseTo(46_572.26, 0);
    expect(t.marginalRate).toBe(0.32);
  });

  it("head of household, $40k: 10% bracket only", () => {
    const t = computeTax({ ...base, filingStatus: "hoh", payments: income(40_000) });
    expect(t.standardDeduction).toBe(24_150);
    expect(t.qbiDeduction).toBeCloseTo(2_604.82, 1);
    expect(t.incomeTax).toBeCloseTo(1_041.93, 1);
    expect(t.marginalRate).toBe(0.1);
  });

  it("no-tax-on-tips phases out by $100 per $1,000 of MAGI over $150k", () => {
    const t = computeTax({ ...base, payments: income(180_000), qualifiedTips: 25_000 });
    // AGI 167,283.40 → over by 17,283.40 → 17 full $1,000 steps × $100
    expect(t.tipsDeduction).toBe(23_300);
  });

  it("tips never exceed the cap or the net profit", () => {
    expect(computeTax({ ...base, payments: income(60_000), qualifiedTips: 40_000 }).tipsDeduction).toBe(25_000);
    expect(computeTax({ ...base, payments: income(8_000), qualifiedTips: 12_000 }).tipsDeduction).toBe(8_000);
  });

  it("W-2 wages fill the Social Security base before SE income", () => {
    const t = computeTax({ ...base, payments: income(50_000), w2Wages: 160_000 });
    // only 24,500 of SS room left
    expect(t.seTax).toBeCloseTo(24_500 * 0.124 + 46_175 * 0.029, 1);
  });

  it("mileage splits 181 days at 72.5¢ and 184 days at 76¢", () => {
    expect(mileageDeduction(10_000)).toBeCloseTo(7_426.44, 1);
  });

  it("expenses larger than income never produce negative tax", () => {
    const t = computeTax({ ...base, payments: income(5_000), businessExpenses: 9_000 });
    expect(t.netProfit).toBe(0);
    expect(t.totalTax).toBe(0);
  });

  it("zero income gives a calm, finite plan", () => {
    const p = buildPlan(base);
    expect(p.setAsideRate).toBe(0);
    expect(p.noPenaltyBecauseSmallBalance).toBe(true);
    expect(Number.isFinite(p.requiredAnnualPayment)).toBe(true);
    expect(p.penaltyIfNoMorePayments).toBe(0);
  });

  it("W-2 withholding that covers the safe harbor means no penalty", () => {
    const p = buildPlan({ ...base, payments: income(30_000), w2Wages: 60_000, w2Withholding: 20_000 });
    expect(p.penaltyIfNoMorePayments).toBe(0);
  });

  it("a payment made after the year still credits the oldest shortfall (Q1)", () => {
    const p = buildPlan({
      ...base,
      payments: income(60_000),
      priorYearTax: 4_000,
      estimatedPayments: [{ id: "a", date: "2026-08-01", amount: 1_000 }],
    });
    expect(p.installments[0].status).toBe("late");
    expect(p.installments[1].status).toBe("missed");
  });
});

describe("parser edge cases", () => {
  it("reads 'Jan 5, 2026' and two-digit years", () => {
    const r = parsePayments("Jan 5, 2026 Acme 1,000.50\n12/31/25 Old client 10", 2026);
    expect(r.payments.map((p) => [p.date, p.amount])).toEqual([
      ["2026-01-05", 1000.5],
      ["2025-12-31", 10],
    ]);
  });

  it("rejects impossible dates and non-positive amounts", () => {
    const r = parsePayments("13/40 Bad 100\nMar 3 Zero 0", 2026);
    expect(r.payments).toHaveLength(0);
    expect(r.errors).toHaveLength(2);
  });
});

describe("bank CSV edge cases", () => {
  it("handles an Excel byte-order mark at the start of the file", () => {
    const wf = '﻿"08/14/2026","1520.00","*","","UBER USA 6787 PAYMENT"';
    expect(importBankCsv(wf, 2026).deposits).toHaveLength(1);
    expect(parseCsv("﻿Date,Amount")[0][0]).toBe("Date");
  });

  it("ignores empty lines and trailing commas", () => {
    const csv = "Date,Description,Amount\n\n10/01/2026,STRIPE TRANSFER,500.00,,\n\n";
    expect(importBankCsv(csv, 2026).deposits).toEqual([expect.objectContaining({ source: "Stripe", amount: 500 })]);
  });
});

describe("state hardening", () => {
  it("caps huge shared payloads at 500 rows", () => {
    const many = Array.from({ length: 2_000 }, (_, i) => ({ id: `p${i}`, date: "2026-01-01", source: "x", amount: 1 }));
    expect(sanitize({ payments: many })?.payments).toHaveLength(500);
  });
});

describe("families", () => {
  it("child tax credit offsets income tax first, then self-employment tax (HoH, $40k, one child)", () => {
    const t = computeTax({ ...base, filingStatus: "hoh", payments: income(40_000), kidsUnder17: 1 });
    expect(t.childTaxCredit).toBe(2_200);
    // income tax 1,041.93 + SE tax 5,651.82 − credit 2,200
    expect(t.federalTotal).toBeCloseTo(4_493.75, 1);
  });

  it("refundable part is capped at $1,700 per child when there is no income tax", () => {
    const t = computeTax({ ...base, filingStatus: "hoh", payments: income(20_000), kidsUnder17: 1 });
    expect(t.incomeTax).toBe(0);
    expect(t.childTaxCredit).toBe(1_700);
    expect(t.federalTotal).toBeCloseTo(2_825.91 - 1_700, 1);
  });

  it("child tax credit phases out by $50 per $1,000 of AGI above $200k", () => {
    // AGI 235,213.31 → 36 steps × $50 = $1,800 off the $2,200 credit
    expect(computeTax({ ...base, payments: income(250_000), kidsUnder17: 1 }).childTaxCredit).toBe(400);
  });

  it("no children means no credit", () => {
    expect(computeTax({ ...base, payments: income(60_000) }).childTaxCredit).toBe(0);
  });

  it("joint filers: W-2 wages (possibly the spouse's) do not shrink the freelancer's Social Security cap", () => {
    const t = computeTax({ ...base, filingStatus: "mfj", payments: income(60_000), w2Wages: 184_500 });
    expect(t.seTax).toBeCloseTo(8_477.73, 1);
  });
});
