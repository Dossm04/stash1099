import type { PayStub } from "@/lib/quote";
import { usd } from "./ui";

/** A payout shown the way an employer's pay stub would show it: gross, withholding lines, take-home. */
export function PayStubView({ stub, title = "Pay stub" }: { stub: PayStub; title?: string }) {
  const lines: [string, number][] = [
    ["Social Security & Medicare (self-employment tax)", stub.selfEmployment],
    ["Federal income tax", stub.federalIncome],
  ];
  if (stub.state > 0) lines.push(["State income tax", stub.state]);
  const rate = stub.gross > 0 ? Math.round((stub.stash / stub.gross) * 100) : 0;
  return (
    <div className="rounded-2xl border border-line bg-surface text-sm">
      <div className="flex items-center justify-between border-b border-dashed border-line px-4 py-2 text-xs uppercase tracking-wide text-muted">
        <span>{title}</span>
        <span>withheld {rate}%</span>
      </div>
      <dl className="tnum px-4 py-2">
        <div className="flex justify-between py-1">
          <dt>Gross payout</dt>
          <dd className="font-medium">{usd(stub.gross)}</dd>
        </div>
        {lines.map(([label, amount]) => (
          <div key={label} className="flex justify-between gap-3 py-1 text-muted">
            <dt>− {label}</dt>
            <dd>{usd(amount)}</dd>
          </div>
        ))}
        <div className="mt-1 flex justify-between border-t border-line py-2 text-base font-bold">
          <dt>Take-home: yours to spend</dt>
          <dd className="text-brand">{usd(stub.yours)}</dd>
        </div>
      </dl>
    </div>
  );
}
