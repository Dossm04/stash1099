import { daysBetween } from "./tax/dates";
import { computeTax, type EstimatedPayment, type IncomePayment, type PlanResult, type TaxInput } from "./tax/engine";

export interface StashDeposit {
  id: string;
  /** ISO date the money was moved to the tax savings account. */
  date: string;
  amount: number;
}

export interface StashStatus {
  /** Total moved to tax savings so far. */
  deposited: number;
  /** Total already sent to the IRS. */
  paidToIrs: number;
  /** Still sitting in tax savings: deposits minus the IRS payments that were made from it. */
  balance: number;
  /** Money that already covers this year's tax: paid to the IRS + still in tax savings. */
  covered: number;
  /** Tax already incurred on the 1099 income received so far (what you would owe if the year ended today). */
  targetToDate: number;
  /** Projected tax caused by this year's 1099 income. */
  targetForYear: number;
  /** covered − targetToDate (negative = behind). */
  gap: number;
  /** 0..1 share of the full-year target already covered. */
  progress: number;
  status: "empty" | "on-track" | "behind";
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const r = (n: number) => Math.round(n * 100) / 100;

export interface TaxParts {
  /** Self-employment tax: Social Security + Medicare (incl. the additional 0.9%). */
  selfEmployment: number;
  /** Federal income tax, after credits. */
  federalIncome: number;
  state: number;
  total: number;
}

/** Tax caused by the 1099 income in `input`, split the way a pay stub would show it. */
export function taxPartsFromSelfEmployment(input: TaxInput): TaxParts {
  const withSe = computeTax(input);
  const without = computeTax({
    ...input,
    payments: [],
    expectedRestOfYear: 0,
    businessExpenses: 0,
    businessMiles: 0,
    qualifiedTips: 0,
  });
  const total = Math.max(0, withSe.totalTax - without.totalTax);
  const selfEmployment = Math.min(
    total,
    Math.max(0, withSe.seTax + withSe.additionalMedicare - without.seTax - without.additionalMedicare),
  );
  const state = Math.min(total - selfEmployment, Math.max(0, withSe.stateTax - without.stateTax));
  return { selfEmployment, state, federalIncome: total - selfEmployment - state, total };
}

/** Total tax caused by the 1099 income in `input`: tax with it minus tax without it. */
export function taxFromSelfEmployment(input: TaxInput): number {
  return taxPartsFromSelfEmployment(input).total;
}

/**
 * Tax already incurred on the 1099 income received so far: what would be owed if the year ended today.
 * This is an accrual, not an average: early in the year most income is sheltered by the standard deduction,
 * later every dollar is taxed at the marginal rate. Full-year deduction estimates (expenses, miles, tips)
 * are counted in proportion to the income earned so far.
 */
export function accruedTax(input: TaxInput): number {
  return accruedParts(input).total;
}

/** The same accrual, split into self-employment tax, federal income tax and state tax. */
export function accruedParts(input: TaxInput): TaxParts {
  const received = input.payments.filter((p) => p.date <= input.asOf);
  const receivedSum = sum(received.map((p) => p.amount));
  if (receivedSum <= 0) return { selfEmployment: 0, federalIncome: 0, state: 0, total: 0 };
  const yearGross = computeTax(input).grossSelfEmployment;
  const share = yearGross > 0 ? Math.min(1, receivedSum / yearGross) : 1;
  return taxPartsFromSelfEmployment({
    ...input,
    payments: received,
    expectedRestOfYear: 0,
    businessExpenses: input.businessExpenses * share,
    businessMiles: input.businessMiles * share,
    qualifiedTips: input.qualifiedTips * share,
  });
}

/**
 * The habit loop: every payout raises the target by the tax it adds; every transfer to tax savings
 * and every IRS payment raises `covered`. The gap tells the user, at any moment, whether the money
 * in their checking account is really theirs.
 */
export function stashStatus(
  payments: IncomePayment[],
  deposits: StashDeposit[],
  estimatedPayments: EstimatedPayment[],
  targets: { toDate: number; forYear: number },
  asOf: string,
): StashStatus {
  const received = sum(payments.filter((p) => p.date <= asOf).map((p) => p.amount));
  const deposited = sum(deposits.filter((d) => d.date <= asOf).map((d) => d.amount));
  const paid = estimatedPayments.filter((p) => p.date <= asOf);
  const paidToIrs = sum(paid.map((p) => p.amount));
  // IRS payments come out of tax savings unless the user says they paid from checking.
  const paidFromStash = sum(paid.filter((p) => !p.fromChecking).map((p) => p.amount));
  const balance = Math.max(0, deposited - paidFromStash);
  const covered = paidToIrs + balance;
  const gap = covered - targets.toDate;
  return {
    deposited: r(deposited),
    paidToIrs: r(paidToIrs),
    balance: r(balance),
    covered: r(covered),
    targetToDate: r(targets.toDate),
    targetForYear: r(targets.forYear),
    gap: r(gap),
    progress: targets.forYear > 0 ? Math.min(1, covered / targets.forYear) : 0,
    status: received === 0 ? "empty" : gap >= -1 ? "on-track" : "behind",
  };
}

export interface SafeToSpend {
  /** Tax on income already received that is NOT yet set aside or paid. */
  unstashedTax: number;
  /** checking balance − unstashed tax − bills due (negative = you have already spent tax money). */
  safe: number;
  /** Tax still to pay for the year (federal + state − withholding − already paid to IRS). */
  stillOwedForYear: number;
  /** What the April bill would be short by, given what sits in tax savings. */
  aprilShortfall: number;
}

/**
 * The number a freelancer needs every time they look at their bank app: how much of this balance is
 * really theirs. Checking balance minus the tax already earned-but-not-stashed (and, optionally, the
 * bills due before the next payout). The rest of the year's tax shows up as the April bill.
 */
export function safeToSpend(
  checkingBalance: number,
  stash: StashStatus,
  plan: Pick<PlanResult, "breakdown">,
  w2Withholding: number,
  billsDue = 0,
): SafeToSpend {
  const unstashedTax = Math.max(0, -stash.gap);
  const stillOwedForYear = Math.max(0, plan.breakdown.totalTax - w2Withholding - stash.paidToIrs);
  return {
    unstashedTax: r(unstashedTax),
    safe: r(checkingBalance - unstashedTax - Math.max(0, billsDue)),
    stillOwedForYear: r(stillOwedForYear),
    aprilShortfall: r(Math.max(0, stillOwedForYear - stash.balance)),
  };
}

export interface TaxReadyScore {
  score: number;
  level: "ready" | "close" | "at-risk";
  parts: { key: string; label: string; points: number; max: number }[];
}

/**
 * One number (0–100) for "am I ready for the IRS?", built only from the user's own data:
 *   50  tax on income already earned is covered (set aside or paid)
 *   20  no missed quarterly payments still outstanding
 *   15  the next IRS payment is already sitting in tax savings
 *   15  the income log was updated in the last 7 days (half credit up to 14 days)
 * Every action in the app (logging a payout, moving money, paying the IRS) moves it.
 */
export function taxReadyScore(
  stash: StashStatus,
  plan: Pick<PlanResult, "catchUpNow" | "requiredAnnualPayment" | "upcomingSafe">,
  lastPayoutDate: string | null,
  asOf: string,
): TaxReadyScore {
  const coverage = stash.targetToDate > 0 ? Math.min(1, stash.covered / stash.targetToDate) : 1;
  const missed = plan.requiredAnnualPayment > 0 ? Math.min(1, plan.catchUpNow / plan.requiredAnnualPayment) : 0;
  const next = plan.upcomingSafe[0]?.amount ?? 0;
  const funded = next > 0 ? Math.min(1, stash.balance / next) : 1;
  const age = lastPayoutDate ? daysBetween(lastPayoutDate, asOf) : Infinity;
  const fresh = age <= 7 ? 1 : age <= 14 ? 0.5 : 0;
  const parts = [
    { key: "coverage", label: "Tax on what you earned is set aside", points: Math.round(50 * coverage), max: 50 },
    { key: "deadlines", label: "No missed IRS deadlines outstanding", points: Math.round(20 * (1 - missed)), max: 20 },
    { key: "next", label: "Next IRS payment is funded", points: Math.round(15 * funded), max: 15 },
    { key: "fresh", label: "Income log updated this week", points: Math.round(15 * fresh), max: 15 },
  ];
  const score = sum(parts.map((p) => p.points));
  return { score, parts, level: score >= 80 ? "ready" : score >= 50 ? "close" : "at-risk" };
}

export interface CatchUpPlan {
  behind: number;
  averagePayout: number;
  extraPerPayout: number;
  /** Share of each of the next N payouts to stash: the normal rate plus the catch-up. */
  rate: number;
  baseRate: number;
  payouts: number;
  /** False when the plan would take more than 60% of every payout: spread it over more payouts. */
  feasible: boolean;
}

/** Spread the amount you are behind over your next N payouts instead of one painful transfer. */
export function catchUpPlan(gap: number, payments: IncomePayment[], baseRate: number, payouts: number): CatchUpPlan {
  const recent = [...payments].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  const averagePayout = recent.length ? sum(recent.map((p) => p.amount)) / recent.length : 0;
  const behind = Math.max(0, -gap);
  const n = Math.max(1, Math.floor(payouts));
  const extraPerPayout = behind / n;
  const rate = averagePayout > 0 ? baseRate + extraPerPayout / averagePayout : baseRate;
  return {
    behind: r(behind),
    averagePayout: r(averagePayout),
    extraPerPayout: r(extraPerPayout),
    rate: Math.min(1, rate),
    baseRate,
    payouts: n,
    feasible: rate <= 0.6,
  };
}
