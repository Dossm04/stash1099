"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FILING_STATUS_LABEL, TAX_2026, type FilingStatus } from "@/lib/tax/config2026";
import { buildPlan } from "@/lib/tax/engine";
import { quotePayout } from "@/lib/quote";
import { formatShort, todayLocal } from "@/lib/tax/dates";
import { newId, parsePayments } from "@/lib/parsePayments";
import { buildIcs } from "@/lib/ics";
import { safeToSpend, stashStatus, type StashStatus } from "@/lib/stash";
import { importBankCsv, type Deposit, type ImportResult } from "@/lib/importCsv";
import type { IncomePayment } from "@/lib/tax/engine";
import { EMPTY_STATE, MAYA_STATE, decodeShare, encodeShare, loadLocal, saveLocal, type PlanState } from "@/lib/state";
import { Card, MoneyField, Segmented, Stat, Step, pct, usd } from "./ui";

const YEAR = TAX_2026.year;

export default function PlanApp() {
  const [state, setState] = useState<PlanState>(EMPTY_STATE);
  const [ready, setReady] = useState(false);
  const [today, setToday] = useState("2026-11-14");
  const [toast, setToast] = useState<string | null>(null);

  // Load: shared link > ?demo=maya > local storage.
  useEffect(() => {
    setToday(todayLocal());
    const url = new URL(window.location.href);
    const shared = url.hash.startsWith("#s=") ? decodeShare(url.hash.slice(3)) : null;
    if (shared) setState(shared);
    else if (url.searchParams.get("demo") === "maya") setState(MAYA_STATE);
    else setState(loadLocal() ?? EMPTY_STATE);
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) saveLocal(state);
  }, [state, ready]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const plan = useMemo(() => buildPlan({ ...state, asOf: today }), [state, today]);
  const stash = useMemo(
    () => stashStatus(state.payments, state.stashDeposits, state.estimatedPayments, plan, today),
    [state, plan, today],
  );
  const set = <K extends keyof PlanState>(k: K, v: PlanState[K]) => setState((s) => ({ ...s, [k]: v }));

  const hasIncome = state.payments.length > 0 || (state.expectedRestOfYear ?? 0) > 0;
  // Marginal set-aside rate for the next payout (what each new dollar really costs in tax).
  const nextRate = useMemo(
    () => (hasIncome ? quotePayout(state, 1000, today).stash / 1000 : 0),
    [state, today, hasIncome],
  );

  return (
    <div className="min-h-screen">
      <Header
        onDemo={() => {
          setState(MAYA_STATE);
          setToast("Loaded Maya's example — freelance designer + DoorDash, Austin TX");
        }}
        onReset={() => {
          setState(EMPTY_STATE);
          setToast("Cleared. Your data never leaves this browser.");
        }}
        onShare={async () => {
          const link = `${window.location.origin}/plan#s=${encodeShare(state)}`;
          try {
            await navigator.clipboard.writeText(link);
            setToast("Private link copied — your plan lives in the link, not on our servers");
          } catch {
            window.prompt("Copy your private link:", link);
          }
        }}
      />

      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 pb-24 pt-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        {/* ------------------------------ INPUTS ------------------------------ */}
        <div className="min-w-0 space-y-4">
          {!hasIncome && (
            <QuickStart
              filingStatus={state.filingStatus}
              onDemo={() => setState(MAYA_STATE)}
              onStart={(q) =>
                setState((s) => ({
                  ...s,
                  filingStatus: q.filingStatus,
                  checkingBalance: q.balance,
                  payments: [
                    { id: newId(), date: today, source: "Year-to-date total (quick start)", amount: q.earned },
                  ],
                }))
              }
            />
          )}

          <Step n={1} title="About you" hint={`Tax year ${YEAR}. Used for brackets and the standard deduction.`}>
            <div className="min-w-0 space-y-4">
              <Segmented<FilingStatus>
                value={state.filingStatus}
                onChange={(v) => set("filingStatus", v)}
                options={(Object.keys(FILING_STATUS_LABEL) as FilingStatus[]).map((k) => ({
                  value: k,
                  label: FILING_STATUS_LABEL[k],
                }))}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <span className="text-sm font-medium">State income tax</span>
                  <div className="mt-1">
                    <Segmented
                      value={state.stateRate === 0 ? "none" : "rate"}
                      onChange={(v) => set("stateRate", v === "none" ? 0 : 0.05)}
                      options={[
                        { value: "none", label: "None (TX, FL, WA…)" },
                        { value: "rate", label: "My state's rate" },
                      ]}
                    />
                  </div>
                </div>
                {state.stateRate > 0 && (
                  <MoneyField
                    label="State rate"
                    prefix=""
                    suffix="%"
                    value={Math.round(state.stateRate * 1000) / 10}
                    onChange={(v) => set("stateRate", Math.min(15, v ?? 0) / 100 || 0.0001)}
                    hint="Flat-rate approximation, e.g. 4.95 for IL, 3.07 for PA"
                  />
                )}
              </div>
              <details className="group rounded-xl bg-surface-2 p-3 text-sm">
                <summary className="cursor-pointer font-medium">Also have a W-2 job?</summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <MoneyField
                    label="W-2 wages this year"
                    value={state.w2Wages}
                    onChange={(v) => set("w2Wages", v ?? 0)}
                  />
                  <MoneyField
                    label="Federal tax withheld"
                    value={state.w2Withholding}
                    onChange={(v) => set("w2Withholding", v ?? 0)}
                    hint="Withholding counts toward your quarterly payments"
                  />
                </div>
              </details>
            </div>
          </Step>

          <Step
            n={2}
            title="Your 1099 income this year"
            hint="Every payout from clients, Upwork, Uber, DoorDash, Etsy… No bank login needed."
          >
            <IncomeLog state={state} setState={setState} projected={plan.breakdown.projectedRestOfYear} today={today} />
          </Step>

          <Step n={3} title="Deductions" hint="Full-year estimates. Each one lowers both income tax and SE tax.">
            <div className="grid gap-3 sm:grid-cols-2">
              <MoneyField
                label="Business expenses"
                value={state.businessExpenses}
                onChange={(v) => set("businessExpenses", v ?? 0)}
                hint="Software, gear, phone, home office…"
              />
              <MoneyField
                label="Business miles"
                prefix=""
                suffix="mi"
                value={state.businessMiles}
                onChange={(v) => set("businessMiles", v ?? 0)}
                hint={`IRS rate: ${TAX_2026.mileage.periods.map((p) => `${p.centsPerMile}¢`).join(" → ")} (raised Jul 1)`}
              />
              <MoneyField
                label="Tips included in your income"
                value={state.qualifiedTips}
                onChange={(v) => set("qualifiedTips", v ?? 0)}
                hint="New “no tax on tips” deduction, up to $25,000 (2025–2028)"
              />
            </div>
          </Step>

          <Step
            n={4}
            title="Last year's tax (optional, but saves money)"
            hint="Paying 100% of last year's tax makes you penalty-proof, even if you earn more this year."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <MoneyField
                label="Total tax on 2025 Form 1040"
                value={state.priorYearTax}
                nullable
                placeholder="Line 24"
                onChange={(v) => set("priorYearTax", v)}
              />
              <label className="flex items-center gap-2 self-center text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--brand)]"
                  checked={state.priorYearAgiOver150k}
                  onChange={(e) => set("priorYearAgiOver150k", e.target.checked)}
                />
                2025 AGI was over $150,000 (rule becomes 110%)
              </label>
            </div>
          </Step>

          <Step
            n={5}
            title="Your tax money"
            hint="What you moved to a separate tax savings account, and what you already sent the IRS (Form 1040-ES / Direct Pay)."
          >
            <div className="space-y-5">
              <AmountLog
                field="stashDeposits"
                label="Moved to tax savings"
                empty="Nothing yet. Tip: open a free high-yield savings account just for taxes."
                state={state}
                setState={setState}
                today={today}
              />
              <AmountLog
                field="estimatedPayments"
                label="Paid to the IRS for 2026"
                empty="No payments yet. That is common in year one."
                state={state}
                setState={setState}
                today={today}
              />
            </div>
          </Step>
        </div>

        {/* ------------------------------ RESULTS ----------------------------- */}
        <div
          className={`min-w-0 space-y-4 lg:sticky lg:top-4 lg:self-start ${hasIncome ? "order-first lg:order-none" : ""}`}
        >
          {hasIncome && (
            <SafeCard
              balance={state.checkingBalance}
              onBalance={(v) => set("checkingBalance", v)}
              stash={stash}
              plan={plan}
              w2Withholding={state.w2Withholding}
            />
          )}

          <JustGotPaid
            quote={(amount) => quotePayout(state, amount, today)}
            onAdd={(amount, source) => {
              setState((s) => ({
                ...s,
                payments: [...s.payments, { id: newId(), date: today, source: source || "New payment", amount }],
              }));
            }}
            onStash={(amount) => {
              setState((s) => ({ ...s, stashDeposits: [...s.stashDeposits, { id: newId(), date: today, amount }] }));
              setToast(`Logged ${usd(amount)} in your tax stash`);
            }}
          />

          {hasIncome && <StashCard stash={stash} />}

          {hasIncome ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Stat
                  label="Set aside from new payouts"
                  value={hasIncome ? pct(nextRate, 0) : "—"}
                  sub={
                    hasIncome
                      ? `${pct(plan.setAsideRate, 0)} average for ${YEAR} · federal + SE${state.stateRate ? " + state" : ""}`
                      : "add income to calculate"
                  }
                  tone="brand"
                />
                <Stat
                  label="Next IRS deadline"
                  value={plan.nextDueDate ? `${plan.daysToNextDue} days` : "—"}
                  sub={plan.nextDueDate ? formatShort(plan.nextDueDate) : "All 2026 deadlines passed"}
                />
                <Stat
                  label="Penalty so far"
                  value={usd(plan.penaltyAccruedToDate, true)}
                  sub={
                    plan.dailyPenaltyNow > 0
                      ? `+${usd(plan.dailyPenaltyNow, true)} every day you wait`
                      : "You're on track"
                  }
                  tone={plan.penaltyAccruedToDate > 0 ? "danger" : "default"}
                />
                <Stat
                  label="Penalty by Apr 15 if you do nothing"
                  value={usd(plan.penaltyIfNoMorePayments, true)}
                  sub={`vs ${usd(plan.penaltyIfFollowPlan, true)} if you follow the plan`}
                  tone={plan.penaltyIfNoMorePayments > 0 ? "warn" : "default"}
                />
              </div>

              <ActionPlan plan={plan} today={today} nextRate={nextRate} />
              <Schedule plan={plan} />
              <Breakdown plan={plan} />
            </>
          ) : (
            <Card className="text-center">
              <div className="text-4xl">🧾</div>
              <h2 className="mt-2 font-semibold">Your plan shows up here</h2>
              <p className="mt-1 text-sm text-muted">
                Safe-to-spend, the IRS minimum for each deadline, your penalty so far and a calendar with exact amounts.
              </p>
            </Card>
          )}

          <p className="px-1 text-xs leading-relaxed text-muted">
            Estimates for tax year {YEAR} using IRS Rev. Proc. 2025-32, the{" "}
            {TAX_2026.se.socialSecurityWageBase.toLocaleString("en-US")} Social Security wage base, Form 2210 regular-method
            penalty math and IRS quarterly interest rates. Not tax advice. Everything is computed in your browser;
            nothing is sent to a server.
          </p>
        </div>
      </main>

      {toast && (
        <div className="animate-pop fixed inset-x-0 bottom-6 z-50 mx-auto w-fit max-w-[90vw] rounded-xl bg-ink px-4 py-3 text-sm text-bg shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

/* ================================================================== */

function Header({ onDemo, onReset, onShare }: { onDemo: () => void; onReset: () => void; onShare: () => void }) {
  return (
    <header className="border-b border-line bg-surface/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <Logo /> Stash1099
        </Link>
        <div className="flex flex-wrap justify-end gap-1 text-xs sm:gap-2 sm:text-sm">
          <button onClick={onDemo} className="rounded-lg px-3 py-1.5 font-medium text-brand hover:bg-brand-soft">
            Maya&apos;s example
          </button>
          <button onClick={onReset} className="rounded-lg px-3 py-1.5 text-muted hover:bg-surface-2">
            Reset
          </button>
          <button onClick={onShare} className="rounded-lg bg-ink px-3 py-1.5 font-medium text-bg hover:opacity-90">
            Share link
          </button>
        </div>
      </div>
    </header>
  );
}

export function Logo() {
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-sm font-bold text-brand-ink">
      $
    </span>
  );
}

function JustGotPaid({
  quote,
  onAdd,
  onStash,
}: {
  quote: (amount: number) => { stash: number; yours: number };
  onAdd: (amount: number, source: string) => void;
  onStash: (amount: number) => void;
}) {
  const [amount, setAmount] = useState<number | null>(null);
  const [source, setSource] = useState("");
  const [last, setLast] = useState<{ stash: number; yours: number; amount: number; moved?: boolean } | null>(null);
  return (
    <Card className="border-brand/30 bg-gradient-to-br from-brand-soft to-surface">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">💸 I just got paid</h2>
        <span className="text-xs text-muted">adds to your income log</span>
      </div>
      <form
        className="mt-3 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!amount || amount <= 0) return;
          const split = quote(amount);
          onAdd(amount, source);
          setLast({ ...split, amount });
          setAmount(null);
          setSource("");
        }}
      >
        <div className="sm:w-36">
          <MoneyField label="Amount" value={amount} nullable onChange={setAmount} placeholder="1,200" />
        </div>
        <label className="block flex-1">
          <span className="text-sm font-medium">From</span>
          <input
            className="mt-1 w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 outline-none focus:border-brand"
            placeholder="Upwork, Uber…"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />
        </label>
        <button
          className="self-end rounded-xl bg-brand px-4 py-2.5 font-semibold text-brand-ink disabled:opacity-40"
          disabled={!amount}
        >
          Split it
        </button>
      </form>
      {last && (
        <div key={last.amount + last.stash} className="animate-pop mt-4 grid grid-cols-2 gap-2 text-center">
          <div className="rounded-xl bg-surface p-3">
            <div className="text-xs text-muted">Yours to spend</div>
            <div className="tnum text-2xl font-bold">{usd(last.yours)}</div>
          </div>
          <div className="rounded-xl bg-brand p-3 text-brand-ink">
            <div className="text-xs opacity-80">Move to tax savings</div>
            <div className="tnum text-2xl font-bold">{usd(last.stash)}</div>
          </div>
          <button
            type="button"
            disabled={last.moved}
            onClick={() => {
              onStash(last.stash);
              setLast({ ...last, moved: true });
            }}
            className="col-span-2 rounded-xl border border-brand/40 bg-surface px-4 py-2.5 text-sm font-semibold text-brand hover:bg-brand-soft disabled:border-transparent disabled:bg-brand-soft"
          >
            {last.moved ? `✓ ${usd(last.stash)} logged in your tax stash` : `I moved ${usd(last.stash)} to tax savings`}
          </button>
          <p className="col-span-2 text-xs text-muted">
            That is {pct(last.stash / last.amount, 0)} of this payout: the exact extra {YEAR} tax it creates (SE tax +
            your bracket, after deductions). New dollars usually cost more than your yearly average once the standard
            deduction is used up.
          </p>
        </div>
      )}
    </Card>
  );
}

function SafeCard({
  balance,
  onBalance,
  stash,
  plan,
  w2Withholding,
}: {
  balance: number | null;
  onBalance: (v: number | null) => void;
  stash: StashStatus;
  plan: Plan;
  w2Withholding: number;
}) {
  const s = safeToSpend(balance ?? 0, stash, plan, w2Withholding);
  const negative = balance != null && s.safe < 0;
  return (
    <Card className="border-ink/10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Safe to spend</h2>
          {balance == null ? (
            <p className="mt-1 text-sm text-muted">
              Type what is in your checking account. We show how much of it is yours.
            </p>
          ) : (
            <div className={`tnum mt-1 text-4xl font-bold ${negative ? "text-danger" : "text-brand"}`}>
              {usd(s.safe)}
            </div>
          )}
        </div>
        <div className="w-44">
          <MoneyField label="Checking balance now" value={balance} nullable onChange={onBalance} placeholder="4,200" />
        </div>
      </div>
      {balance != null && (
        <p className="mt-2 text-sm">
          {negative ? (
            <>
              You have already spent <b className="text-danger">{usd(-s.safe)}</b> of the IRS&apos;s money.{" "}
            </>
          ) : null}
          <span className="text-muted">
            {usd(s.unstashedTax)} of your balance is tax on money you earned this year and have not set aside.
          </span>
        </p>
      )}
      <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-surface-2 p-3 text-center text-xs">
        <div>
          <div className="text-muted">Still owed for {YEAR}</div>
          <div className="tnum text-base font-semibold">{usd(s.stillOwedForYear)}</div>
        </div>
        <div>
          <div className="text-muted">In tax savings</div>
          <div className="tnum text-base font-semibold">{usd(stash.balance)}</div>
        </div>
        <div>
          <div className="text-muted">April 15 shortfall</div>
          <div className={`tnum text-base font-semibold ${s.aprilShortfall > 0 ? "text-danger" : "text-brand"}`}>
            {usd(s.aprilShortfall)}
          </div>
        </div>
      </div>
    </Card>
  );
}

function StashCard({ stash }: { stash: StashStatus }) {
  const behind = stash.status === "behind";
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Your tax stash</h2>
          <p className="mt-0.5 text-sm text-muted">Is the money in your checking account really yours?</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${
            behind ? "bg-danger-soft text-danger" : "bg-brand-soft text-brand"
          }`}
        >
          {behind ? `Behind ${usd(-stash.gap)}` : "On track ✓"}
        </span>
      </div>
      <div
        className="mt-4 h-3 overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-label="Share of this year's tax covered"
        aria-valuenow={Math.round(stash.progress * 100)}
      >
        <div
          className={`h-full rounded-full transition-all duration-500 ${behind ? "bg-warn" : "bg-brand"}`}
          style={{ width: `${Math.max(2, stash.progress * 100)}%` }}
        />
      </div>
      <div className="tnum mt-2 flex justify-between gap-2 text-sm">
        <span>
          <b>{usd(stash.covered)}</b> covered ({Math.round(stash.progress * 100)}%)
        </span>
        <span className="text-muted">
          {usd(stash.targetForYear)} needed for {YEAR}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-xl bg-surface-2 p-2">
          <div className="text-muted">In tax savings</div>
          <div className="tnum text-base font-semibold">{usd(stash.balance)}</div>
        </div>
        <div className="rounded-xl bg-surface-2 p-2">
          <div className="text-muted">Paid to IRS</div>
          <div className="tnum text-base font-semibold">{usd(stash.paidToIrs)}</div>
        </div>
        <div className="rounded-xl bg-surface-2 p-2">
          <div className="text-muted">Should be by today</div>
          <div className="tnum text-base font-semibold">{usd(stash.targetToDate)}</div>
        </div>
      </div>
      {behind && (
        <p className="mt-3 text-sm text-muted">
          Move <b className="text-ink">{usd(-stash.gap)}</b> to tax savings to catch up, then stash your % from every
          new payout. IRS payments are assumed to come out of the stash.
        </p>
      )}
    </Card>
  );
}

type Plan = ReturnType<typeof buildPlan>;

function ActionPlan({ plan, today, nextRate }: { plan: Plan; today: string; nextRate: number }) {
  const [mode, setMode] = useState<"safe" | "exact">("safe");
  const upcoming = mode === "safe" ? plan.upcomingSafe : plan.upcomingExact;
  const items = [
    ...(plan.catchUpNow > 0 ? [{ dueDate: today, amount: plan.catchUpNow, label: "Today — catch up" }] : []),
    ...upcoming.map((u) => ({ ...u, label: formatShort(u.dueDate) })),
  ].filter((i) => i.amount > 0);

  const download = () => {
    const ics = buildIcs(
      items.map((i) => ({ dueDate: i.dueDate, amount: i.amount })),
      window.location.origin + "/plan",
      { from: today, until: TAX_2026.estimated.returnDueDate, rate: nextRate },
    );
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "irs-estimated-tax-2026.ics";
    a.click();
    URL.revokeObjectURL(url);
  };

  const basis = {
    "current-year-90": "90% of this year's tax",
    "prior-year-100": "100% of last year's tax",
    "prior-year-110": "110% of last year's tax",
  }[plan.safeHarborBasis];

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Your payment plan</h2>
        <div className="w-full sm:w-64">
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: "safe", label: "Penalty-proof minimum" },
              { value: "exact", label: "Pay it all now" },
            ]}
          />
        </div>
      </div>

      {plan.noPenaltyBecauseSmallBalance ? (
        <p className="mt-3 text-sm text-muted">
          Your projected balance after withholding is under $1,000, so the IRS won&apos;t charge an underpayment
          penalty. Keep setting money aside for April.
        </p>
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Nothing due — you&apos;re covered for {YEAR}. 🎉</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {items.map((i) => (
            <li key={i.label} className="flex items-center justify-between rounded-xl bg-surface-2 px-4 py-3">
              <span className="font-medium">{i.label}</span>
              <span className="tnum text-lg font-semibold">{usd(i.amount)}</span>
            </li>
          ))}
        </ul>
      )}

      {!plan.noPenaltyBecauseSmallBalance && (
        <p className="mt-3 text-sm text-muted">
          {mode === "safe" ? (
            <>
              Safe harbor = <b className="text-ink">{basis}</b> ({usd(plan.requiredAnnualPayment)}). Pay this and the
              penalty stops. You&apos;ll still owe about <b className="text-ink">{usd(plan.aprilBalanceSafe)}</b> in
              April — penalty-free, so keep it in savings until then.
            </>
          ) : (
            <>
              Covers your full projected federal tax so April is $0. Costs more cash now, same penalty as the minimum.
            </>
          )}
        </p>
      )}

      {plan.upcomingSafe.length > 0 && !plan.noPenaltyBecauseSmallBalance && plan.upcomingSafe[0].amount > 0 && (
        <div className="mt-3 rounded-xl border border-warn/30 bg-warn-soft p-3 text-sm">
          <b>What if you skip {formatShort(plan.upcomingSafe[0].dueDate)}?</b> Penalty by April grows to{" "}
          <b className="tnum">{usd(plan.penaltyIfSkipNext, true)}</b> instead of{" "}
          <b className="tnum">{usd(plan.penaltyIfFollowPlan, true)}</b>.
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={download}
          title="IRS deadlines with exact amounts + a weekly Friday check-in"
          className="rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-bg disabled:opacity-40"
        >
          📅 Add deadlines + weekly check-in
        </button>
        <a
          href="https://www.irs.gov/payments/direct-pay"
          target="_blank"
          rel="noreferrer"
          className="rounded-xl border border-line px-4 py-2.5 text-sm font-semibold hover:bg-surface-2"
        >
          Pay on IRS Direct Pay ↗
        </a>
      </div>
    </Card>
  );
}

function Schedule({ plan }: { plan: Plan }) {
  const tone = {
    paid: "bg-brand-soft text-brand",
    late: "bg-warn-soft text-warn",
    missed: "bg-danger-soft text-danger",
    upcoming: "bg-surface-2 text-muted",
  } as const;
  const label = { paid: "Paid", late: "Paid late", missed: "Missed", upcoming: "Upcoming" } as const;
  return (
    <Card>
      <h2 className="font-semibold">{YEAR} quarterly deadlines</h2>
      <ol className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {plan.installments.map((i) => (
          <li key={i.index} className="rounded-xl border border-line p-3">
            <div className="text-xs text-muted">Q{i.index}</div>
            <div className="text-sm font-semibold">{formatShort(i.dueDate)}</div>
            <div className="tnum mt-1 text-sm">{usd(i.required)} due</div>
            <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${tone[i.status]}`}>
              {label[i.status]}
            </span>
            {i.stillOwed > 0 && <div className="tnum mt-1 text-xs text-danger">{usd(i.stillOwed)} short</div>}
          </li>
        ))}
      </ol>
    </Card>
  );
}

function Breakdown({ plan }: { plan: Plan }) {
  const b = plan.breakdown;
  const rows: [string, number, string?][] = [
    [
      "1099 income (received + projected)",
      b.grossSelfEmployment,
      b.projectedRestOfYear > 0 ? `incl. ${usd(b.projectedRestOfYear)} projected` : undefined,
    ],
    ["− Mileage deduction", -b.mileageDeduction],
    ["= Net profit (Schedule C)", b.netProfit],
    ["Self-employment tax (15.3%)", b.seTax],
    ["Adjusted gross income", b.agi],
    ["− Standard deduction", -b.standardDeduction],
    ["− No tax on tips", -b.tipsDeduction],
    ["− QBI deduction (20%)", -b.qbiDeduction, b.qbiLimited ? "limited above income threshold" : undefined],
    ["= Taxable income", b.taxableIncome, `top bracket ${pct(b.marginalRate, 0)}`],
    ["Income tax", b.incomeTax],
    ["Additional Medicare tax", b.additionalMedicare],
    ["State tax", b.stateTax],
  ];
  return (
    <Card>
      <details>
        <summary className="flex cursor-pointer items-center justify-between font-semibold">
          <span>How we got here</span>
          <span className="tnum text-base">
            Total {YEAR} tax: {usd(b.totalTax)}
          </span>
        </summary>
        <table className="mt-4 w-full text-sm">
          <tbody>
            {rows
              .filter(([, v], i) => v !== 0 || i < 3)
              .map(([k, v, note]) => (
                <tr key={k} className="border-t border-line">
                  <td className="py-2 pr-2">
                    {k}
                    {note && <div className="text-xs text-muted">{note}</div>}
                  </td>
                  <td className="tnum py-2 text-right">{usd(v)}</td>
                </tr>
              ))}
            <tr className="border-t-2 border-ink font-semibold">
              <td className="py-2">Total tax</td>
              <td className="tnum py-2 text-right">{usd(b.totalTax)}</td>
            </tr>
          </tbody>
        </table>
      </details>
    </Card>
  );
}

/* ------------------------------ Logs ------------------------------- */

function IncomeLog({
  state,
  setState,
  projected,
  today,
}: {
  state: PlanState;
  setState: React.Dispatch<React.SetStateAction<PlanState>>;
  projected: number;
  today: string;
}) {
  const [paste, setPaste] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [draft, setDraft] = useState({ date: today, source: "", amount: null as number | null });
  useEffect(() => setDraft((d) => ({ ...d, date: today })), [today]);

  const sorted = [...state.payments].sort((a, b) => b.date.localeCompare(a.date));
  const total = state.payments.reduce((s, p) => s + p.amount, 0);

  return (
    <div className="space-y-3">
      <form
        className="grid grid-cols-2 gap-2 sm:grid-cols-[8.5rem_minmax(0,1fr)_6rem_auto] [&>*]:min-w-0"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.amount) return;
          setState((s) => ({
            ...s,
            payments: [
              ...s.payments,
              { id: newId(), date: draft.date, source: draft.source || "Client", amount: draft.amount! },
            ],
          }));
          setDraft({ date: draft.date, source: "", amount: null });
        }}
      >
        <input
          type="date"
          aria-label="Date"
          min={`${YEAR}-01-01`}
          max={`${YEAR}-12-31`}
          className="rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm"
          value={draft.date}
          onChange={(e) => setDraft({ ...draft, date: e.target.value })}
        />
        <input
          aria-label="Source"
          placeholder="Client / platform"
          className="rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm"
          value={draft.source}
          onChange={(e) => setDraft({ ...draft, source: e.target.value })}
        />
        <input
          aria-label="Amount"
          inputMode="decimal"
          placeholder="$ amount"
          className="tnum rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm"
          value={draft.amount ?? ""}
          onChange={(e) => {
            const n = Number(e.target.value.replace(/[^\d.]/g, ""));
            setDraft({ ...draft, amount: e.target.value === "" ? null : n });
          }}
        />
        <button className="rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-bg">Add</button>
      </form>

      <BankImport
        existing={state.payments}
        onImport={(rows) =>
          setState((s) => ({
            ...s,
            payments: [
              ...s.payments,
              ...rows.map((r) => ({ id: newId(), date: r.date, source: r.source, amount: r.amount })),
            ],
          }))
        }
      />

      <button className="text-sm font-medium text-brand" onClick={() => setShowPaste((v) => !v)}>
        {showPaste ? "Hide" : "📋 Paste lines"} {showPaste ? "" : "(payout emails, notes)"}
      </button>
      {showPaste && (
        <div className="space-y-2">
          <textarea
            rows={4}
            className="w-full rounded-xl border border-line bg-surface-2 p-3 font-mono text-sm"
            placeholder={"Mar 3 Upwork 2,400\n2026-03-05, DoorDash, $412.50\n03/09 Uber Eats 312"}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
          />
          <button
            className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-ink"
            onClick={() => {
              const r = parsePayments(paste, YEAR);
              setState((s) => ({ ...s, payments: [...s.payments, ...r.payments] }));
              setErrors(r.errors.map((e) => `Line ${e.line}: ${e.reason} — “${e.text.trim()}”`));
              if (r.errors.length === 0) {
                setPaste("");
                setShowPaste(false);
              }
            }}
          >
            Import lines
          </button>
          {errors.length > 0 && (
            <ul className="space-y-1 text-xs text-danger">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {sorted.length > 0 && (
        <ul className="max-h-72 divide-y divide-line overflow-auto rounded-xl border border-line">
          {sorted.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="w-24 shrink-0 text-muted">{formatShort(p.date).replace(`, ${YEAR}`, "")}</span>
              <span className="min-w-0 flex-1 truncate">{p.source}</span>
              <span className="tnum font-medium">{usd(p.amount)}</span>
              <button
                aria-label={`Remove ${p.source}`}
                className="text-muted hover:text-danger"
                onClick={() => setState((s) => ({ ...s, payments: s.payments.filter((x) => x.id !== p.id) }))}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-3 rounded-xl bg-surface-2 p-3 sm:grid-cols-2">
        <div className="text-sm">
          <div className="text-muted">Received so far</div>
          <div className="tnum text-lg font-semibold">{usd(total)}</div>
        </div>
        <MoneyField
          label="Expected for rest of year"
          value={state.expectedRestOfYear}
          nullable
          placeholder={`${Math.round(projected).toLocaleString("en-US")} (auto)`}
          onChange={(v) => setState((s) => ({ ...s, expectedRestOfYear: v }))}
          hint={state.expectedRestOfYear == null ? "Auto-projected from your pace so far" : "Clear to auto-project"}
        />
      </div>
    </div>
  );
}

type LogKey = "estimatedPayments" | "stashDeposits";

function AmountLog({
  field,
  state,
  setState,
  today,
  empty,
  label,
}: {
  field: LogKey;
  state: PlanState;
  setState: React.Dispatch<React.SetStateAction<PlanState>>;
  today: string;
  empty: string;
  label: string;
}) {
  const [draft, setDraft] = useState({ date: today, amount: null as number | null });
  useEffect(() => setDraft((d) => ({ ...d, date: today })), [today]);
  const items = state[field];
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{label}</div>
      <form
        className="grid grid-cols-[1fr_1fr_auto] gap-2 [&>*]:min-w-0"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.amount) return;
          setState((s) => ({
            ...s,
            [field]: [...s[field], { id: newId(), date: draft.date, amount: draft.amount! }],
          }));
          setDraft({ ...draft, amount: null });
        }}
      >
        <input
          type="date"
          aria-label={`${label} date`}
          className="rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm"
          value={draft.date}
          onChange={(e) => setDraft({ ...draft, date: e.target.value })}
        />
        <input
          aria-label={`${label} amount`}
          inputMode="decimal"
          placeholder="$ amount"
          className="tnum rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm"
          value={draft.amount ?? ""}
          onChange={(e) => {
            const n = Number(e.target.value.replace(/[^\d.]/g, ""));
            setDraft({ ...draft, amount: e.target.value === "" ? null : n });
          }}
        />
        <button className="rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-bg">Add</button>
      </form>
      {items.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {[...items]
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="flex-1">{formatShort(p.date)}</span>
                <span className="tnum font-medium">{usd(p.amount)}</span>
                <button
                  aria-label="Remove"
                  className="text-muted hover:text-danger"
                  onClick={() => setState((s) => ({ ...s, [field]: s[field].filter((x) => x.id !== p.id) }))}
                >
                  ✕
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

/* --------------------------- Bank CSV import --------------------------- */

function BankImport({ existing, onImport }: { existing: IncomePayment[]; onImport: (rows: Deposit[]) => void }) {
  const [result, setResult] = useState<ImportResult | null>(null);
  const [rows, setRows] = useState<Deposit[]>([]);
  const [done, setDone] = useState<string | null>(null);

  const load = (text: string) => {
    const r = importBankCsv(text, YEAR);
    // Mark deposits already in the log (same date + amount) so re-importing never doubles income.
    const seen = new Set(existing.map((p) => `${p.date}|${Math.round(p.amount * 100)}`));
    const deposits = r.deposits.map((d) =>
      seen.has(`${d.date}|${Math.round(d.amount * 100)}`)
        ? { ...d, include: false, kind: "excluded" as const, reason: "Already in your income log" }
        : d,
    );
    setResult(r);
    setRows(deposits);
    setDone(null);
  };

  const picked = rows.filter((r) => r.include);
  const total = picked.reduce((s, r) => s + r.amount, 0);
  const tone = { platform: "text-brand", maybe: "text-warn", excluded: "text-muted" } as const;

  return (
    <div className="rounded-xl border border-dashed border-line p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="cursor-pointer rounded-lg bg-brand px-3 py-2 font-semibold text-brand-ink">
          🏦 Import bank CSV
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) load(await f.text());
              e.target.value = "";
            }}
          />
        </label>
        <button
          type="button"
          className="rounded-lg px-2 py-2 font-medium text-brand underline"
          onClick={async () => load(await (await fetch("/sample-chase-export.csv")).text())}
        >
          try a sample Chase export
        </button>
        <span className="text-xs text-muted">
          Chase, BofA, Wells, Capital One… Read in your browser, never uploaded.
        </span>
      </div>

      {done && <p className="mt-2 text-sm font-medium text-brand">{done}</p>}
      {result?.error && <p className="mt-2 text-sm text-danger">{result.error}</p>}

      {result && !result.error && rows.length > 0 && !done && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-muted">
            {result.bankFormat}: {rows.length} deposits found, {result.skippedOutflows} spending rows ignored. Ticked
            rows look like 1099 income; check any client payments we could not be sure about.
          </p>
          <ul className="max-h-64 divide-y divide-line overflow-auto rounded-lg border border-line text-sm">
            {rows.map((r, i) => (
              <li key={`${r.date}-${i}`} className="flex items-center gap-2 px-2 py-1.5">
                <input
                  type="checkbox"
                  aria-label={`Include ${r.description}`}
                  className="h-4 w-4 accent-[var(--brand)]"
                  checked={r.include}
                  disabled={r.reason === "Already in your income log"}
                  onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))}
                />
                <span className="w-14 shrink-0 text-xs text-muted">{formatShort(r.date).replace(/, \d{4}$/, "")}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{r.source}</span>
                  <span className={`block truncate text-xs ${tone[r.kind]}`}>{r.reason}</span>
                </span>
                <span className="tnum font-medium">{usd(r.amount, true)}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={picked.length === 0}
              className="rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-bg disabled:opacity-40"
              onClick={() => {
                onImport(picked);
                setDone(`Added ${picked.length} payouts (${usd(total)}) to your income log.`);
              }}
            >
              Add {picked.length} payouts · {usd(total)}
            </button>
            <button type="button" className="text-sm text-muted" onClick={() => setResult(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ Quick start ----------------------------- */

function QuickStart({
  filingStatus,
  onStart,
  onDemo,
}: {
  filingStatus: FilingStatus;
  onStart: (q: { earned: number; balance: number | null; filingStatus: FilingStatus }) => void;
  onDemo: () => void;
}) {
  const [earned, setEarned] = useState<number | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [fs, setFs] = useState<FilingStatus>(filingStatus);
  return (
    <Card className="border-brand/40 bg-gradient-to-br from-brand-soft to-surface">
      <h2 className="text-lg font-semibold">How much of your money is actually yours?</h2>
      <p className="mt-1 text-sm text-muted">Three questions, 20 seconds. Add details later for an exact plan.</p>
      <form
        className="mt-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (earned && earned > 0) onStart({ earned, balance, filingStatus: fs });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <MoneyField
            label={`1. 1099 income so far in ${YEAR}`}
            value={earned}
            nullable
            onChange={setEarned}
            placeholder="48,000"
            hint="All clients and gig apps, before expenses"
          />
          <MoneyField
            label="2. In your checking account now"
            value={balance}
            nullable
            onChange={setBalance}
            placeholder="4,200"
            hint="Optional. Stays in your browser"
          />
        </div>
        <div>
          <span className="text-sm font-medium">3. You file as</span>
          <div className="mt-1">
            <Segmented<FilingStatus>
              value={fs}
              onChange={setFs}
              options={(Object.keys(FILING_STATUS_LABEL) as FilingStatus[]).map((k) => ({
                value: k,
                label: FILING_STATUS_LABEL[k],
              }))}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            disabled={!earned}
            className="rounded-xl bg-brand px-5 py-3 font-semibold text-brand-ink disabled:opacity-40"
          >
            Show my safe-to-spend
          </button>
          <button type="button" onClick={onDemo} className="text-sm font-medium text-brand underline">
            or see Maya&apos;s example
          </button>
        </div>
      </form>
    </Card>
  );
}
