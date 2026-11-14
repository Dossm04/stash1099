import { quotePayout } from "./quote";
import { accruedTax, safeToSpend, stashStatus, taxFromSelfEmployment, taxReadyScore } from "./stash";
import type { PlanState } from "./state";
import { buildPlan } from "./tax/engine";

/**
 * Everything the screens show, derived from the user's state for a given day.
 * One function so the landing widget, the quiz result and the app can never disagree.
 */
export function snapshot(state: PlanState, asOf: string) {
  const input = { ...state, asOf };
  const plan = buildPlan(input);
  const hasIncome = state.payments.length > 0 || (state.expectedRestOfYear ?? 0) > 0;
  const stash = stashStatus(
    state.payments,
    state.stashDeposits,
    state.estimatedPayments,
    { toDate: accruedTax(input), forYear: taxFromSelfEmployment(input) },
    asOf,
  );
  const safe = safeToSpend(state.checkingBalance ?? 0, stash, plan, state.w2Withholding, state.billsDue);
  const received = state.payments.filter((p) => p.date <= asOf);
  const lastPayoutDate = received.length
    ? received
        .map((p) => p.date)
        .sort()
        .at(-1)!
    : null;
  const score = taxReadyScore(stash, plan, lastPayoutDate, asOf);
  // Share of the next payout that is tax: what each new dollar really costs.
  const nextRate = hasIncome ? quotePayout(state, 1000, asOf).stash / 1000 : 0;
  return { plan, stash, safe, score, nextRate, hasIncome, lastPayoutDate };
}

export type Snapshot = ReturnType<typeof snapshot>;
