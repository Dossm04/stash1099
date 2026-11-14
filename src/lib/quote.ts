import { accruedParts } from "./stash";
import type { PlanState } from "./state";

export interface PayStub {
  gross: number;
  /** Self-employment tax withheld (Social Security + Medicare). */
  selfEmployment: number;
  /** Federal income tax withheld. */
  federalIncome: number;
  /** State income tax withheld. */
  state: number;
  /** Total to move to tax savings. */
  stash: number;
  /** Take-home: what is really yours. */
  yours: number;
}

/**
 * "Payroll for one": turn a payout that just landed into a pay stub.
 *
 * Not a flat "save 30%": the withholding is the tax this payout adds — the tax accrued on everything
 * received so far WITH the payout minus the same figure WITHOUT it. Early in the year, while the
 * standard deduction still shelters income, that is only self-employment tax (about 14%); later it is
 * SE tax plus the user's bracket, net of QBI. Because it is computed with the same function the app
 * uses for the "should be set aside by today" target, stashing exactly the quote leaves the user's
 * gap unchanged: nobody falls behind for doing what the app told them.
 */
export function quotePayout(state: PlanState, amount: number, asOf: string): PayStub {
  const input = { ...state, asOf };
  const before = accruedParts(input);
  const after = accruedParts({
    ...input,
    payments: [...state.payments, { id: "quote", date: asOf, source: "", amount }],
  });
  const gross = Math.round(amount);
  const stash = Math.min(gross, Math.max(0, Math.round(after.total - before.total)));
  // Whole-dollar lines that always add up to the total.
  const selfEmployment = Math.min(stash, Math.max(0, Math.round(after.selfEmployment - before.selfEmployment)));
  const state_ = Math.min(stash - selfEmployment, Math.max(0, Math.round(after.state - before.state)));
  return {
    gross,
    selfEmployment,
    state: state_,
    federalIncome: stash - selfEmployment - state_,
    stash,
    yours: gross - stash,
  };
}
