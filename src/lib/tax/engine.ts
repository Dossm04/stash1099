import { TAX_2026, type Bracket, type FilingStatus, type TaxYearConfig } from "./config2026";
import { addDays, daysBetween, isoDate, parseIso } from "./dates";

export interface IncomePayment {
  id: string;
  /** ISO date (YYYY-MM-DD) the money arrived. */
  date: string;
  source: string;
  amount: number;
}

export interface EstimatedPayment {
  id: string;
  date: string;
  amount: number;
}

export interface TaxInput {
  filingStatus: FilingStatus;
  /** 1099 / gig income received so far this tax year. */
  payments: IncomePayment[];
  /** Expected 1099 income for the rest of the year. null = project from the pace so far. */
  expectedRestOfYear: number | null;
  /** Full-year business expenses (excluding mileage). */
  businessExpenses: number;
  /** Full-year business miles driven. */
  businessMiles: number;
  /** Qualified tips included in the income above (for the 2025–2028 "no tax on tips" deduction). */
  qualifiedTips: number;
  w2Wages: number;
  w2Withholding: number;
  /** Flat state income-tax rate applied to AGI (0 for no-income-tax states). */
  stateRate: number;
  /** Total tax from last year's Form 1040 (line 24). null = unknown. */
  priorYearTax: number | null;
  priorYearAgiOver150k: boolean;
  /** Federal estimated payments already sent this tax year. */
  estimatedPayments: EstimatedPayment[];
  /** "Today" — injected so the engine is pure and testable. */
  asOf: string;
}

export interface TaxBreakdown {
  grossSelfEmployment: number;
  projectedRestOfYear: number;
  mileageDeduction: number;
  netProfit: number;
  seTax: number;
  additionalMedicare: number;
  agi: number;
  standardDeduction: number;
  tipsDeduction: number;
  qbiDeduction: number;
  qbiLimited: boolean;
  taxableIncome: number;
  incomeTax: number;
  marginalRate: number;
  federalTotal: number;
  stateTax: number;
  totalTax: number;
}

export interface InstallmentRow {
  index: number;
  dueDate: string;
  /** Safe-harbor amount that must be credited by this date. */
  required: number;
  /** Amount still missing at the due date. */
  shortAtDue: number;
  /** Of that shortfall, how much is still unpaid as of today. */
  stillOwed: number;
  status: "paid" | "late" | "missed" | "upcoming";
}

export interface PlanResult {
  breakdown: TaxBreakdown;
  /** Share of every new 1099 dollar to set aside (federal + SE + state), 0..1. */
  setAsideRate: number;
  requiredAnnualPayment: number;
  safeHarborBasis: "current-year-90" | "prior-year-100" | "prior-year-110";
  noPenaltyBecauseSmallBalance: boolean;
  totalPaid: number;
  installments: InstallmentRow[];
  penaltyAccruedToDate: number;
  penaltyIfNoMorePayments: number;
  /** Pay this today to stop the penalty clock on past installments. */
  catchUpNow: number;
  /** Safe-harbor plan: what to pay on each upcoming due date (after catching up). */
  upcomingSafe: { dueDate: string; amount: number }[];
  /** "Exact" plan: cover the full projected federal balance by the last installment. */
  upcomingExact: { dueDate: string; amount: number }[];
  penaltyIfFollowPlan: number;
  /** Penalty by April if you catch up today but skip the next installment. */
  penaltyIfSkipNext: number;
  /** How fast the penalty is growing right now, $/day. */
  dailyPenaltyNow: number;
  /** Federal balance you'd still owe in April if you follow the safe-harbor plan (no penalty on it). */
  aprilBalanceSafe: number;
  nextDueDate: string | null;
  daysToNextDue: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function bracketTax(taxable: number, brackets: Bracket[]): { tax: number; marginal: number } {
  let tax = 0;
  let lower = 0;
  let marginal = brackets[0].rate;
  for (const b of brackets) {
    if (taxable <= lower) break;
    const slice = Math.min(taxable, b.upTo) - lower;
    tax += slice * b.rate;
    marginal = b.rate;
    lower = b.upTo;
  }
  return { tax, marginal };
}

export function mileageDeduction(miles: number, cfg: TaxYearConfig = TAX_2026): number {
  // Miles are entered for the whole year; spread them evenly across the rate periods by day count.
  const periods = cfg.mileage.periods;
  const totalDays = sum(periods.map((p) => daysBetween(p.from, p.to) + 1));
  return sum(periods.map((p) => ((miles * (daysBetween(p.from, p.to) + 1)) / totalDays) * (p.centsPerMile / 100)));
}

/** Project the remaining year's 1099 income from the pace so far. */
export function projectRestOfYear(payments: IncomePayment[], asOf: string, cfg: TaxYearConfig = TAX_2026): number {
  const yearStart = `${cfg.year}-01-01`;
  const yearEnd = `${cfg.year}-12-31`;
  if (asOf > yearEnd) return 0;
  const ytd = sum(payments.filter((p) => p.date <= asOf).map((p) => p.amount));
  const elapsed = Math.max(1, daysBetween(yearStart, asOf) + 1);
  const remaining = Math.max(0, daysBetween(asOf, yearEnd));
  return (ytd / elapsed) * remaining;
}

export function computeTax(input: TaxInput, cfg: TaxYearConfig = TAX_2026): TaxBreakdown {
  const fs = input.filingStatus;
  const received = sum(input.payments.map((p) => p.amount));
  const projected = input.expectedRestOfYear ?? projectRestOfYear(input.payments, input.asOf, cfg);
  const gross = received + projected;
  const miles = mileageDeduction(input.businessMiles, cfg);
  const netProfit = Math.max(0, gross - input.businessExpenses - miles);

  // Self-employment tax (Schedule SE)
  let seBase = netProfit * cfg.se.netEarningsFactor;
  if (seBase < cfg.se.minimumNetEarnings) seBase = 0;
  const ssRoom = Math.max(0, cfg.se.socialSecurityWageBase - input.w2Wages);
  const seTax = Math.min(seBase, ssRoom) * cfg.se.socialSecurityRate + seBase * cfg.se.medicareRate;
  const additionalMedicare =
    Math.max(0, seBase + input.w2Wages - cfg.additionalMedicare.threshold[fs]) * cfg.additionalMedicare.rate;

  const agi = Math.max(0, input.w2Wages + netProfit - seTax / 2);
  const standardDeduction = cfg.standardDeduction[fs];

  // No tax on tips (2025–2028): capped, limited to net profit, phased out by MAGI.
  const tipsRaw = Math.min(input.qualifiedTips, cfg.tips.cap, netProfit);
  const over = Math.max(0, agi - cfg.tips.phaseOutStart[fs]);
  const tipsDeduction = Math.max(0, tipsRaw - Math.ceil(over / 1000) * cfg.tips.phaseOutPer1000);

  const taxableBeforeQbi = Math.max(0, agi - standardDeduction - tipsDeduction);

  // QBI (§199A). Above the threshold the deduction depends on W-2 wages / SSTB status —
  // we conservatively drop it (overestimates tax, which is the safe direction).
  const qbi = Math.max(0, netProfit - seTax / 2);
  const qbiLimited = taxableBeforeQbi > cfg.qbi.threshold[fs];
  let qbiDeduction = 0;
  if (!qbiLimited && qbi > 0) {
    qbiDeduction = Math.min(qbi * cfg.qbi.rate, taxableBeforeQbi * cfg.qbi.rate);
    // OBBBA minimum deduction from 2026: $400 if active QBI ≥ $1,000.
    if (cfg.year >= 2026 && qbi >= 1000) qbiDeduction = Math.max(qbiDeduction, Math.min(400, taxableBeforeQbi));
  }

  const taxableIncome = Math.max(0, taxableBeforeQbi - qbiDeduction);
  const { tax: incomeTax, marginal } = bracketTax(taxableIncome, cfg.brackets[fs]);
  const federalTotal = incomeTax + seTax + additionalMedicare;
  const stateTax = agi * input.stateRate;

  return {
    grossSelfEmployment: round2(gross),
    projectedRestOfYear: round2(projected),
    mileageDeduction: round2(miles),
    netProfit: round2(netProfit),
    seTax: round2(seTax),
    additionalMedicare: round2(additionalMedicare),
    agi: round2(agi),
    standardDeduction,
    tipsDeduction: round2(tipsDeduction),
    qbiDeduction: round2(qbiDeduction),
    qbiLimited,
    taxableIncome: round2(taxableIncome),
    incomeTax: round2(incomeTax),
    marginalRate: marginal,
    federalTotal: round2(federalTotal),
    stateTax: round2(stateTax),
    totalTax: round2(federalTotal + stateTax),
  };
}

function interestRateOn(day: string, cfg: TaxYearConfig): number {
  let rate = cfg.estimated.interestRates[0].rate;
  for (const r of cfg.estimated.interestRates) if (day >= r.from) rate = r.rate;
  return rate;
}

interface SimResult {
  penalty: number;
  shortAtDue: number[];
  /** Outstanding per installment at the end date. */
  outstanding: number[];
}

/**
 * Form 2210 "regular method", simulated day by day: each installment must be credited with
 * required/4 by its due date; withholding counts as paid evenly on the due dates; later payments
 * fill the oldest shortfall first; each shortfall accrues interest at the quarterly IRS rate.
 */
export function simulatePenalty(
  requiredAnnual: number,
  withholding: number,
  payments: { date: string; amount: number }[],
  endDate: string,
  cfg: TaxYearConfig = TAX_2026,
): SimResult {
  const due = cfg.estimated.dueDates;
  const perInstallment = requiredAnnual / 4;
  const buckets = [0, 0, 0, 0];
  const shortAtDue = [0, 0, 0, 0];
  let credit = 0;
  let penalty = 0;

  const byDate = new Map<string, number>();
  const start = `${cfg.year}-01-01`;
  for (const p of payments) {
    const d = p.date < start ? start : p.date;
    byDate.set(d, (byDate.get(d) ?? 0) + p.amount);
  }

  const last = endDate < cfg.estimated.returnDueDate ? endDate : cfg.estimated.returnDueDate;
  for (let day = start; day <= last; day = addDays(day, 1)) {
    // 1. Interest for this day on everything still outstanding.
    const outstanding = sum(buckets);
    if (outstanding > 0) penalty += (outstanding * interestRateOn(day, cfg)) / 365;

    // 2. Payments made today fill the oldest shortfall first; the rest becomes credit.
    let paid = byDate.get(day) ?? 0;
    for (let i = 0; i < 4 && paid > 0; i++) {
      const take = Math.min(buckets[i], paid);
      buckets[i] -= take;
      paid -= take;
    }
    credit += paid;

    // 3. Installment due today.
    const idx = due.indexOf(day);
    if (idx >= 0) {
      credit += withholding / 4;
      const short = perInstallment - credit;
      if (short > 0) {
        buckets[idx] = short;
        shortAtDue[idx] = short;
        credit = 0;
      } else {
        credit = -short;
      }
    }
  }
  return { penalty: round2(penalty), shortAtDue: shortAtDue.map(round2), outstanding: buckets.map(round2) };
}

export function buildPlan(input: TaxInput, cfg: TaxYearConfig = TAX_2026): PlanResult {
  const breakdown = computeTax(input, cfg);

  // How much of the total tax is caused by the 1099 income? → set-aside rate per dollar earned.
  const withoutSe = computeTax(
    { ...input, payments: [], expectedRestOfYear: 0, businessExpenses: 0, businessMiles: 0, qualifiedTips: 0 },
    cfg,
  );
  const setAsideRate =
    breakdown.grossSelfEmployment > 0
      ? Math.max(0, (breakdown.totalTax - withoutSe.totalTax) / breakdown.grossSelfEmployment)
      : 0;

  // Safe harbor (IRC §6654(d)): lesser of 90% of this year's tax or 100%/110% of last year's.
  const est = cfg.estimated;
  const currentYear = breakdown.federalTotal * est.currentYearPct;
  const priorPct = input.priorYearAgiOver150k ? est.priorYearPctHighIncome : est.priorYearPct;
  const priorYear = input.priorYearTax == null ? Infinity : input.priorYearTax * priorPct;
  const requiredAnnualPayment = Math.min(currentYear, priorYear);
  const safeHarborBasis =
    priorYear < currentYear ? (input.priorYearAgiOver150k ? "prior-year-110" : "prior-year-100") : "current-year-90";

  const noPenaltyBecauseSmallBalance = breakdown.federalTotal - input.w2Withholding < est.minimumBalanceForPenalty;
  const effectiveRequired = noPenaltyBecauseSmallBalance ? 0 : requiredAnnualPayment;

  const paidPayments = input.estimatedPayments.map((p) => ({ date: p.date, amount: p.amount }));
  const totalPaid = sum(paidPayments.map((p) => p.amount));

  const today = input.asOf;
  const toDate = simulatePenalty(effectiveRequired, input.w2Withholding, paidPayments, today, cfg);
  const toApril = simulatePenalty(effectiveRequired, input.w2Withholding, paidPayments, est.returnDueDate, cfg);

  const installments: InstallmentRow[] = est.dueDates.map((d, i) => {
    const upcoming = d >= today;
    const shortAtDue = upcoming ? 0 : toDate.shortAtDue[i];
    const stillOwed = upcoming ? 0 : toDate.outstanding[i];
    return {
      index: i + 1,
      dueDate: d,
      required: round2(effectiveRequired / 4),
      shortAtDue,
      stillOwed,
      status: upcoming ? "upcoming" : shortAtDue <= 0.5 ? "paid" : stillOwed <= 0.5 ? "late" : "missed",
    };
  });

  // Catch-up: pay every past shortfall today.
  const catchUpNow = round2(sum(toDate.outstanding));

  // Credit already banked toward upcoming installments (overpayments + withholding share).
  const upcomingIdx = est.dueDates.map((d, i) => ({ d, i })).filter((x) => x.d >= today);
  const pastRequired = (4 - upcomingIdx.length) * (effectiveRequired / 4);
  const pastWithholding = ((4 - upcomingIdx.length) * input.w2Withholding) / 4;
  let banked = Math.max(0, totalPaid + pastWithholding + catchUpNow - pastRequired);

  const upcomingSafe = upcomingIdx.map(({ d }) => {
    const need = Math.max(0, effectiveRequired / 4 - input.w2Withholding / 4 - banked);
    banked = Math.max(0, banked - (effectiveRequired / 4 - input.w2Withholding / 4));
    return { dueDate: d, amount: round2(need) };
  });

  const fedBalance = Math.max(0, breakdown.federalTotal - input.w2Withholding - totalPaid);
  const exactRemaining = Math.max(0, fedBalance - catchUpNow);
  const upcomingExact = upcomingIdx.map(({ d }) => ({
    dueDate: d,
    amount: round2(upcomingIdx.length ? exactRemaining / upcomingIdx.length : 0),
  }));

  const planPayments = [
    ...paidPayments,
    ...(catchUpNow > 0 ? [{ date: today, amount: catchUpNow }] : []),
    ...upcomingSafe.map((u) => ({ date: u.dueDate, amount: u.amount })),
  ];
  const followPlan = simulatePenalty(effectiveRequired, input.w2Withholding, planPayments, est.returnDueDate, cfg);
  // "What if I skip the next payment?" — same plan without the next installment.
  const skipNext = simulatePenalty(
    effectiveRequired,
    input.w2Withholding,
    planPayments.filter((p, i) => !(i === planPayments.length - upcomingSafe.length && upcomingSafe.length > 0)),
    est.returnDueDate,
    cfg,
  );
  const paidUnderPlan = totalPaid + catchUpNow + sum(upcomingSafe.map((u) => u.amount));
  const aprilBalanceSafe = round2(Math.max(0, breakdown.federalTotal - input.w2Withholding - paidUnderPlan));

  const next = est.dueDates.find((d) => d >= today) ?? null;

  return {
    breakdown,
    setAsideRate,
    requiredAnnualPayment: round2(effectiveRequired),
    safeHarborBasis,
    noPenaltyBecauseSmallBalance,
    totalPaid: round2(totalPaid),
    installments,
    penaltyAccruedToDate: toDate.penalty,
    penaltyIfNoMorePayments: toApril.penalty,
    catchUpNow,
    upcomingSafe,
    upcomingExact,
    penaltyIfFollowPlan: followPlan.penalty,
    penaltyIfSkipNext: skipNext.penalty,
    dailyPenaltyNow: round2((catchUpNow * interestRateOn(today, cfg)) / 365),
    aprilBalanceSafe,
    nextDueDate: next,
    daysToNextDue: next ? daysBetween(today, next) : null,
  };
}

/** Split a fresh 1099 payment into "yours" and "tax stash". */
export function splitPayment(amount: number, setAsideRate: number) {
  const stash = Math.round(amount * setAsideRate);
  return { stash, yours: Math.round(amount) - stash };
}

export { isoDate, parseIso };
