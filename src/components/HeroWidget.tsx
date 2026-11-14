"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { snapshot } from "@/lib/snapshot";
import { EMPTY_STATE } from "@/lib/state";
import { todayLocal } from "@/lib/tax/dates";
import { PREFILL_KEY } from "./Quiz";
import { MoneyField, pct, usd } from "./ui";

/**
 * The whole product in two fields: type what you earned and what is in checking,
 * see how much of it is really yours. Runs the real engine in the browser.
 */
export default function HeroWidget() {
  const router = useRouter();
  const [income, setIncome] = useState<number | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => setToday(todayLocal()), []);

  const snap = useMemo(() => {
    if (!today || !income) return null;
    return snapshot(
      {
        ...EMPTY_STATE,
        checkingBalance: balance,
        payments: [{ id: "hero", date: today, source: "Year to date", amount: income }],
      },
      today,
    );
  }, [income, balance, today]);

  const start = () => {
    try {
      // Hand the numbers to the quiz without putting them in the URL.
      if (income) sessionStorage.setItem(PREFILL_KEY, JSON.stringify({ income, balance }));
    } catch {
      /* ignore */
    }
    router.push("/start");
  };

  return (
    <div className="rounded-3xl border border-line bg-surface p-5 shadow-sm">
      <h2 className="font-semibold">How much of your money is really yours?</h2>
      <p className="mt-0.5 text-sm text-muted">Two numbers. Nothing is sent anywhere.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <MoneyField
          label="1099 income so far in 2026"
          value={income}
          nullable
          onChange={setIncome}
          placeholder="48,000"
        />
        <MoneyField
          label="In your checking account now"
          value={balance}
          nullable
          onChange={setBalance}
          placeholder="4,200"
        />
      </div>

      <div className="mt-4 rounded-2xl bg-surface-2 p-4" aria-live="polite">
        {!snap ? (
          <p className="text-sm text-muted">Type your income to see what you already owe on it.</p>
        ) : balance == null ? (
          <>
            <div className="text-xs font-medium uppercase tracking-wide text-muted">
              Tax already owed on that income
            </div>
            <div className="tnum mt-1 text-4xl font-bold text-warn">{usd(snap.stash.targetToDate)}</div>
            <p className="mt-1 text-sm text-muted">Add your checking balance to see how much of it is yours.</p>
          </>
        ) : (
          <>
            <div className="text-xs font-medium uppercase tracking-wide text-muted">Really yours</div>
            <div className={`tnum mt-1 text-4xl font-bold ${snap.safe.safe < 0 ? "text-danger" : "text-brand"}`}>
              {usd(snap.safe.safe)}
            </div>
            <p className="mt-1 text-sm text-muted">
              {usd(snap.safe.unstashedTax)} is tax on money you already earned
              {snap.safe.safe < 0 ? ": you have spent some of the IRS's money." : "."} New payouts cost you{" "}
              {pct(snap.nextRate, 0)}.
            </p>
          </>
        )}
      </div>

      <button
        onClick={start}
        className="mt-4 w-full rounded-xl bg-brand px-5 py-3.5 font-semibold text-brand-ink shadow-sm hover:opacity-95"
      >
        {snap ? "Get my full plan in 60 seconds" : "Take the 60-second check"}
      </button>
      <p className="mt-2 text-center text-xs text-muted">
        Free · No signup · Assumes single filer with no savings until you tell us more
      </p>
    </div>
  );
}
