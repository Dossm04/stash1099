"use client";

import { useEffect, useState } from "react";
import { TAX_2026 } from "@/lib/tax/config2026";
import { daysBetween, formatShort, todayLocal } from "@/lib/tax/dates";

/** Days until the next estimated-tax deadline, computed from the visitor's local date. */
export default function Countdown() {
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => setToday(todayLocal()), []);
  const next = today ? TAX_2026.estimated.dueDates.find((d) => d >= today) : null;
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">Next IRS estimated-tax deadline</div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="tnum text-5xl font-bold text-brand">{today && next ? daysBetween(today, next) : "—"}</span>
        <span className="text-lg text-muted">days</span>
      </div>
      <div className="mt-1 font-medium">{next ? `${formatShort(next)} · Q4 ${TAX_2026.year}` : "Q4 payment"}</div>
    </div>
  );
}
