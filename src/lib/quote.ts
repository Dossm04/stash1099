import { buildPlan } from "./tax/engine";
import { stashStatus } from "./stash";
import type { PlanState } from "./state";

/**
 * How much of a payout that just landed belongs in the tax stash.
 *
 * Not the flat average rate: by the time a new payout arrives, the standard deduction is usually
 * used up, so each new dollar is taxed at the *marginal* rate (SE tax + your bracket, net of QBI).
 * We re-run the whole plan with the payout added — holding the rest-of-year projection fixed, so
 * one early payout doesn't inflate the forecast — and quote the exact increase in what should be
 * stashed by today.
 */
export function quotePayout(state: PlanState, amount: number, asOf: string) {
  const projected = buildPlan({ ...state, asOf }).breakdown.projectedRestOfYear;
  const pinned: PlanState = { ...state, expectedRestOfYear: state.expectedRestOfYear ?? projected };
  const status = (s: PlanState) =>
    stashStatus(s.payments, s.stashDeposits, s.estimatedPayments, buildPlan({ ...s, asOf }), asOf);
  const before = status(pinned);
  const after = status({
    ...pinned,
    payments: [...pinned.payments, { id: "quote", date: asOf, source: "", amount }],
  });
  const whole = Math.round(amount);
  const stash = Math.min(whole, Math.max(0, Math.round(after.targetToDate - before.targetToDate)));
  return { stash, yours: whole - stash };
}
