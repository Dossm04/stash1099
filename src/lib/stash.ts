import type { IncomePayment, EstimatedPayment, PlanResult } from "./tax/engine";

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
  /** Money covered so far. IRS payments are assumed to come out of the stash first. */
  covered: number;
  /** Still sitting in the tax savings account. */
  balance: number;
  /** What should be covered by today: set-aside rate × 1099 income received so far. */
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

/**
 * The habit loop: every payout raises the target by `setAsideRate × amount`;
 * every transfer to tax savings raises `covered`. The gap tells the user,
 * at any moment, whether the money in their checking account is really theirs.
 */
export function stashStatus(
  payments: IncomePayment[],
  deposits: StashDeposit[],
  estimatedPayments: EstimatedPayment[],
  plan: Pick<PlanResult, "setAsideRate" | "breakdown">,
  asOf: string,
): StashStatus {
  const received = sum(payments.filter((p) => p.date <= asOf).map((p) => p.amount));
  const deposited = sum(deposits.filter((d) => d.date <= asOf).map((d) => d.amount));
  const paidToIrs = sum(estimatedPayments.filter((p) => p.date <= asOf).map((p) => p.amount));
  const covered = Math.max(deposited, paidToIrs);
  const balance = Math.max(0, deposited - paidToIrs);
  const targetToDate = received * plan.setAsideRate;
  const targetForYear = plan.breakdown.grossSelfEmployment * plan.setAsideRate;
  const gap = covered - targetToDate;
  return {
    deposited: r(deposited),
    paidToIrs: r(paidToIrs),
    covered: r(covered),
    balance: r(balance),
    targetToDate: r(targetToDate),
    targetForYear: r(targetForYear),
    gap: r(gap),
    progress: targetForYear > 0 ? Math.min(1, covered / targetForYear) : 0,
    status: received === 0 ? "empty" : gap >= -1 ? "on-track" : "behind",
  };
}

export interface SafeToSpend {
  /** Tax on income already received that is NOT yet set aside or paid. */
  unstashedTax: number;
  /** checking balance − unstashed tax (negative = you've already spent tax money). */
  safe: number;
  /** Tax still to pay for the year (federal + state − withholding − already paid to IRS). */
  stillOwedForYear: number;
  /** What the April bill would be short by, given what sits in tax savings. */
  aprilShortfall: number;
}

/**
 * The number a freelancer actually needs every time they look at their bank app:
 * how much of this balance is really theirs. Checking balance minus the tax already
 * earned-but-not-stashed. The rest of the year's tax shows up as the April bill.
 */
export function safeToSpend(
  checkingBalance: number,
  stash: StashStatus,
  plan: Pick<PlanResult, "breakdown">,
  w2Withholding: number,
): SafeToSpend {
  const unstashedTax = Math.max(0, -stash.gap);
  const stillOwedForYear = Math.max(0, plan.breakdown.totalTax - w2Withholding - stash.paidToIrs);
  return {
    unstashedTax: r(unstashedTax),
    safe: r(checkingBalance - unstashedTax),
    stillOwedForYear: r(stillOwedForYear),
    aprilShortfall: r(Math.max(0, stillOwedForYear - stash.balance)),
  };
}
