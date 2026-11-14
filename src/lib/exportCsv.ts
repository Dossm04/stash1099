import type { Snapshot } from "./snapshot";
import type { PlanState } from "./state";
import { FILING_STATUS_LABEL, TAX_2026 } from "./tax/config2026";

const cell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const row = (...cells: (string | number)[]) => cells.map(cell).join(",");
const money = (n: number) => n.toFixed(2);

/**
 * One CSV a tax professional (or tax software) can read: the income log, what was set aside and
 * paid, and the estimates with the inputs behind them. Sections are separated by blank lines.
 */
export function buildTaxProCsv(state: PlanState, snap: Snapshot, today: string): string {
  const b = snap.plan.breakdown;
  const lines: string[] = [
    row("Stash1099 summary", `tax year ${TAX_2026.year}`, `prepared ${today}`),
    row("Estimates only. Not a tax return."),
    "",
    row("PROFILE"),
    row("Filing status", FILING_STATUS_LABEL[state.filingStatus]),
    row("Children under 17", state.kidsUnder17 ?? 0),
    row("State income tax rate", `${(state.stateRate * 100).toFixed(2)}%`),
    row("W-2 wages", money(state.w2Wages)),
    row("Federal tax withheld (W-2)", money(state.w2Withholding)),
    row("Prior-year total tax", state.priorYearTax == null ? "not provided" : money(state.priorYearTax)),
    "",
    row("1099 INCOME LOG"),
    row("Date", "Payer", "Amount"),
    ...[...state.payments]
      .sort((x, y) => x.date.localeCompare(y.date))
      .map((p) => row(p.date, p.source, money(p.amount))),
    row("Projected for the rest of the year", "", money(b.projectedRestOfYear)),
    "",
    row("DEDUCTIONS (full-year estimates)"),
    row("Business expenses", money(state.businessExpenses)),
    row("Business miles", state.businessMiles),
    row("Mileage deduction", money(b.mileageDeduction)),
    row("Qualified tips", money(state.qualifiedTips)),
    "",
    row("ESTIMATED TAX"),
    row("Net profit (Schedule C)", money(b.netProfit)),
    row("Self-employment tax", money(b.seTax)),
    row("Additional Medicare tax", money(b.additionalMedicare)),
    row("Adjusted gross income", money(b.agi)),
    row("QBI deduction", money(b.qbiDeduction)),
    row("Tips deduction", money(b.tipsDeduction)),
    row("Taxable income", money(b.taxableIncome)),
    row("Income tax", money(b.incomeTax)),
    row("Child tax credit", money(b.childTaxCredit)),
    row("Federal total", money(b.federalTotal)),
    row("State tax", money(b.stateTax)),
    row("Total tax", money(b.totalTax)),
    "",
    row("PAYMENTS AND SAVINGS"),
    row("Type", "Date", "Amount", "Note"),
    ...state.estimatedPayments.map((p) =>
      row("Estimated payment to IRS", p.date, money(p.amount), p.fromChecking ? "from checking" : "from tax savings"),
    ),
    ...state.stashDeposits.map((d) => row("Transfer to tax savings", d.date, money(d.amount), "")),
    row("Tax accrued on income received so far", today, money(snap.stash.targetToDate), ""),
    row("Covered so far (paid + in tax savings)", today, money(snap.stash.covered), ""),
    row(
      "Safe-harbor amount required for the year",
      "",
      money(snap.plan.requiredAnnualPayment),
      snap.plan.safeHarborBasis,
    ),
    row(
      "Underpayment penalty accrued to date",
      today,
      money(snap.plan.penaltyAccruedToDate),
      "Form 2210 regular method",
    ),
  ];
  return lines.join("\r\n");
}
