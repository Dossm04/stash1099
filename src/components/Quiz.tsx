"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { newId } from "@/lib/parsePayments";
import { quotePayout } from "@/lib/quote";
import { snapshot } from "@/lib/snapshot";
import { EMPTY_STATE, saveLocal, type PlanState } from "@/lib/state";
import { FILING_STATUS_LABEL, TAX_2026, type FilingStatus } from "@/lib/tax/config2026";
import { formatShort, todayLocal } from "@/lib/tax/dates";
import { PayStubView } from "./PayStub";
import { useGate } from "./ProGate";
import { ScoreRing } from "./ThisWeek";
import { MoneyField, pct, usd } from "./ui";

type Kind = "freelance" | "gig" | "both" | "side";

interface Answers {
  kind: Kind | null;
  income: number | null;
  filing: FilingStatus;
  kids: number;
  stateTax: boolean | null;
  saved: number | null;
  paid: number | null;
  balance: number | null;
  w2Wages: number | null;
  w2Withheld: number | null;
  lastYear: "surprised" | "fine" | "first" | null;
  priorTax: number | null;
}

const START: Answers = {
  kind: null,
  income: null,
  filing: "single",
  kids: 0,
  stateTax: null,
  saved: null,
  paid: null,
  balance: null,
  w2Wages: null,
  w2Withheld: null,
  lastYear: null,
  priorTax: null,
};

type StepId = "kind" | "income" | "household" | "state" | "saved" | "balance" | "w2" | "lastYear";

export const PREFILL_KEY = "stash1099:prefill";

/** Turn quiz answers into the same state the app uses, so the result and the app can never disagree. */
export function stateFromAnswers(a: Answers, today: string): PlanState {
  // We do not ask for dates: assume estimated payments were made on the quarterly due dates already passed.
  const pastDue = TAX_2026.estimated.dueDates.filter((d) => d < today);
  const paidDates = pastDue.length ? pastDue : [today];
  const paid = a.paid ?? 0;
  return {
    ...EMPTY_STATE,
    filingStatus: a.filing,
    kidsUnder17: a.kids,
    stateRate: a.stateTax ? 0.05 : 0,
    payments: a.income
      ? [{ id: newId(), date: today, source: "Year-to-date total (from the quiz)", amount: a.income }]
      : [],
    stashDeposits: a.saved ? [{ id: newId(), date: today, amount: a.saved }] : [],
    estimatedPayments:
      paid > 0
        ? paidDates.map((date) => ({
            id: newId(),
            date,
            amount: Math.round((paid / paidDates.length) * 100) / 100,
            fromChecking: true,
          }))
        : [],
    checkingBalance: a.balance,
    w2Wages: a.kind === "side" ? (a.w2Wages ?? 0) : 0,
    w2Withholding: a.kind === "side" ? (a.w2Withheld ?? 0) : 0,
    priorYearTax: a.priorTax,
  };
}

export default function Quiz() {
  const router = useRouter();
  const [a, setA] = useState<Answers>(START);
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<"quiz" | "building" | "result">("quiz");
  const [today, setToday] = useState("2026-11-15");

  useEffect(() => {
    setToday(todayLocal());
    // Numbers typed into the landing-page widget are handed over in session storage, never in the URL.
    try {
      const raw = sessionStorage.getItem(PREFILL_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        setA((prev) => ({
          ...prev,
          income: typeof p.income === "number" ? p.income : prev.income,
          balance: typeof p.balance === "number" ? p.balance : prev.balance,
        }));
        sessionStorage.removeItem(PREFILL_KEY);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const steps: StepId[] = useMemo(
    () => [
      "kind",
      "income",
      "household",
      "state",
      "saved",
      "balance",
      ...(a.kind === "side" ? (["w2"] as StepId[]) : []),
      "lastYear",
    ],
    [a.kind],
  );
  const step = steps[Math.min(i, steps.length - 1)];
  const set = <K extends keyof Answers>(k: K, v: Answers[K]) => setA((prev) => ({ ...prev, [k]: v }));
  const next = () => {
    if (i >= steps.length - 1) setPhase("building");
    else setI(i + 1);
  };

  const state = useMemo(() => stateFromAnswers(a, today), [a, today]);

  useEffect(() => {
    if (phase !== "building") return;
    saveLocal(state);
    const t = setTimeout(() => setPhase("result"), 1400);
    return () => clearTimeout(t);
  }, [phase, state]);

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-xl items-center justify-between px-4 py-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-sm font-bold text-brand-ink">
            $
          </span>
          Stash1099
        </Link>
        {phase === "quiz" && (
          <span className="text-sm text-muted">
            Step {i + 1} of {steps.length}
          </span>
        )}
      </header>

      {phase === "quiz" && (
        <main className="mx-auto max-w-xl px-4 pb-16">
          <div
            className="mb-6 h-1.5 overflow-hidden rounded-full bg-surface-2"
            role="progressbar"
            aria-label="Quiz progress"
            aria-valuenow={Math.round(((i + 1) / steps.length) * 100)}
          >
            <div
              className="h-full rounded-full bg-brand transition-all"
              style={{ width: `${((i + 1) / steps.length) * 100}%` }}
            />
          </div>

          {step === "kind" && (
            <Question title="How do you earn money that nobody withholds tax from?" sub="This is your 1099 income.">
              {(
                [
                  ["freelance", "Freelance or contract clients"],
                  ["gig", "Gig apps: Uber, DoorDash, Instacart…"],
                  ["both", "Both clients and gig apps"],
                  ["side", "A side hustle next to my regular job"],
                ] as [Kind, string][]
              ).map(([value, label]) => (
                <Choice
                  key={value}
                  selected={a.kind === value}
                  onClick={() => {
                    set("kind", value);
                    next();
                  }}
                >
                  {label}
                </Choice>
              ))}
            </Question>
          )}

          {step === "income" && (
            <Question
              title="How much 1099 income have you received so far in 2026?"
              sub="All clients and apps together, before expenses. A rough number is fine."
            >
              <MoneyField
                label="1099 income so far this year"
                value={a.income}
                nullable
                onChange={(v) => set("income", v)}
                placeholder="48,000"
              />
              <Chips values={[10_000, 25_000, 50_000, 75_000, 100_000]} onPick={(v) => set("income", v)} />
              <Continue disabled={!a.income} onClick={next} />
            </Question>
          )}

          {step === "household" && (
            <Question
              title="How will you file your taxes?"
              sub="Your filing status sets your brackets and standard deduction."
            >
              <div className="space-y-2">
                {(Object.keys(FILING_STATUS_LABEL) as FilingStatus[]).map((k) => (
                  <Choice key={k} selected={a.filing === k} onClick={() => set("filing", k)}>
                    {FILING_STATUS_LABEL[k]}
                  </Choice>
                ))}
              </div>
              <div>
                <p className="text-sm font-medium">Children under 17</p>
                <div className="mt-2 grid grid-cols-4 gap-2">
                  {[0, 1, 2, 3].map((n) => (
                    <Choice key={n} compact selected={a.kids === n} onClick={() => set("kids", n)}>
                      {n === 3 ? "3+" : String(n)}
                    </Choice>
                  ))}
                </div>
              </div>
              <Continue onClick={next} />
            </Question>
          )}

          {step === "state" && (
            <Question
              title="Does your state tax your income?"
              sub="Nine states do not. You can set your exact rate later."
            >
              <Choice
                selected={a.stateTax === false}
                onClick={() => {
                  set("stateTax", false);
                  next();
                }}
              >
                No (Texas, Florida, Washington, Tennessee, Nevada…)
              </Choice>
              <Choice
                selected={a.stateTax === true}
                onClick={() => {
                  set("stateTax", true);
                  next();
                }}
              >
                Yes (we will start with 5%)
              </Choice>
            </Question>
          )}

          {step === "saved" && (
            <Question
              title="How much have you put aside for this year's taxes?"
              sub="Be honest. Most people say less than they hoped."
            >
              <MoneyField
                label="In a savings account for taxes right now"
                value={a.saved}
                nullable
                onChange={(v) => set("saved", v)}
                placeholder="0"
              />
              <MoneyField
                label="Already paid to the IRS for 2026 (estimated payments)"
                value={a.paid}
                nullable
                onChange={(v) => set("paid", v)}
                placeholder="0"
              />
              <Continue onClick={next} label={a.saved || a.paid ? "Continue" : "Nothing yet"} />
            </Question>
          )}

          {step === "balance" && (
            <Question
              title="What is in your checking account right now?"
              sub="We use it to show how much of that balance is really yours. It never leaves your browser."
            >
              <MoneyField
                label="Checking balance today"
                value={a.balance}
                nullable
                onChange={(v) => set("balance", v)}
                placeholder="4,200"
              />
              <Continue onClick={next} label={a.balance != null ? "Continue" : "Skip"} />
            </Question>
          )}

          {step === "w2" && (
            <Question
              title="About your regular job"
              sub="From your latest pay stub (year to date). It changes your bracket and counts toward what you owe."
            >
              <MoneyField
                label="W-2 wages so far this year"
                value={a.w2Wages}
                nullable
                onChange={(v) => set("w2Wages", v)}
                placeholder="52,000"
              />
              <MoneyField
                label="Federal income tax withheld so far"
                value={a.w2Withheld}
                nullable
                onChange={(v) => set("w2Withheld", v)}
                placeholder="5,400"
              />
              <Continue onClick={next} label={a.w2Wages ? "Continue" : "Skip"} />
            </Question>
          )}

          {step === "lastYear" && (
            <Question
              title="How did tax time go last April?"
              sub="Last year's tax unlocks the cheapest penalty-proof plan."
            >
              {(
                [
                  ["surprised", "I owed more than I expected"],
                  ["fine", "About what I expected"],
                  ["first", "This is my first year with 1099 income"],
                ] as ["surprised" | "fine" | "first", string][]
              ).map(([value, label]) => (
                <Choice key={value} selected={a.lastYear === value} onClick={() => set("lastYear", value)}>
                  {label}
                </Choice>
              ))}
              {a.lastYear && a.lastYear !== "first" && (
                <MoneyField
                  label="Total tax on your 2025 return (Form 1040, line 24), optional"
                  value={a.priorTax}
                  nullable
                  onChange={(v) => set("priorTax", v)}
                  placeholder="6,200"
                />
              )}
              <Continue disabled={!a.lastYear} onClick={next} label="Show my numbers" />
            </Question>
          )}

          {i > 0 && (
            <button onClick={() => setI(i - 1)} className="mt-6 text-sm text-muted underline">
              Back
            </button>
          )}
        </main>
      )}

      {phase === "building" && (
        <main className="mx-auto max-w-xl px-4 pt-16 text-center">
          <h1 className="text-2xl font-bold">Running your payroll…</h1>
          <ul className="mx-auto mt-6 w-fit space-y-3 text-left">
            {[
              "Self-employment tax: Social Security and Medicare",
              "2026 federal brackets and your deductions",
              "IRS deadlines, safe harbor and penalty so far",
            ].map((t, k) => (
              <li
                key={t}
                className="animate-pop flex items-center gap-2"
                style={{ animationDelay: `${k * 0.35}s`, animationFillMode: "both" }}
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand text-xs font-bold text-brand-ink">
                  ✓
                </span>
                {t}
              </li>
            ))}
          </ul>
        </main>
      )}

      {phase === "result" && (
        <Result
          state={state}
          today={today}
          onOpen={() => router.push("/plan")}
          onRestart={() => {
            setA(START);
            setI(0);
            setPhase("quiz");
          }}
        />
      )}
    </div>
  );
}

/* --------------------------------- Result -------------------------------- */

function Result({
  state,
  today,
  onOpen,
  onRestart,
}: {
  state: PlanState;
  today: string;
  onOpen: () => void;
  onRestart: () => void;
}) {
  const gate = useGate();
  const snap = useMemo(() => snapshot(state, today), [state, today]);
  const { safe, stash, plan, score, nextRate } = snap;
  const stub = useMemo(() => quotePayout(state, 1000, today), [state, today]);
  const hasBalance = state.checkingBalance != null;
  const next = plan.upcomingSafe[0];

  const headline =
    hasBalance && safe.safe < 0
      ? `You have already spent ${usd(-safe.safe)} of the IRS's money`
      : safe.unstashedTax > 0
        ? `${usd(safe.unstashedTax)} of your money is not yours`
        : "You are on track. Let's keep it that way.";

  const steps = [
    safe.unstashedTax > 0
      ? `Move ${usd(safe.unstashedTax)} to a savings account for taxes, or spread it over your next payouts.`
      : "Keep your tax savings where they are.",
    plan.catchUpNow > 0
      ? `Pay the IRS ${usd(plan.catchUpNow)} now: it stops a penalty that grows ${usd(plan.dailyPenaltyNow, true)} every day.`
      : next && next.amount > 0
        ? `Send the IRS ${usd(next.amount)} by ${formatShort(next.dueDate)} (the penalty-proof minimum).`
        : "No IRS payment is due right now.",
    `From now on, hold back ${pct(nextRate, 0)} of every payout before you spend it.`,
  ];

  return (
    <main className="mx-auto max-w-xl px-4 pb-20">
      <p className="text-sm font-semibold text-brand">Your 2026 tax picture</p>
      <h1 className="mt-1 text-3xl font-bold leading-tight">{headline}</h1>
      <p className="mt-2 text-sm text-muted">Estimated from your answers with 2026 IRS rules. Not tax advice.</p>

      <div className="mt-5 grid grid-cols-2 gap-3">
        {hasBalance && (
          <Tile
            label="Safe to spend"
            value={usd(safe.safe)}
            tone={safe.safe < 0 ? "danger" : "brand"}
            sub={`of the ${usd(state.checkingBalance ?? 0)} in checking`}
          />
        )}
        <Tile
          label="Tax owed on what you earned"
          value={usd(stash.targetToDate)}
          sub={`${usd(stash.covered)} covered so far`}
        />
        <Tile
          label="April 15 bill at this pace"
          value={usd(safe.stillOwedForYear)}
          tone="warn"
          sub={`${usd(safe.aprilShortfall)} not saved yet`}
        />
        <Tile label="Withhold from each payout" value={pct(nextRate, 0)} sub="your real rate, not a 30% guess" />
        {plan.penaltyAccruedToDate > 0 && (
          <Tile
            className={hasBalance ? "col-span-2" : ""}
            label="IRS penalty so far"
            value={usd(plan.penaltyAccruedToDate, true)}
            tone="danger"
            sub={`+${usd(plan.dailyPenaltyNow, true)} every day`}
          />
        )}
      </div>

      <div className="mt-4 flex items-center gap-4 rounded-2xl border border-line bg-surface p-4">
        <ScoreRing score={score.score} level={score.level} />
        <div>
          <p className="font-semibold">Tax-ready score: {score.score} / 100</p>
          <p className="text-sm text-muted">It moves every time you log a payout, move money or pay the IRS.</p>
        </div>
      </div>

      <h2 className="mt-8 text-lg font-bold">This is what payroll would do for you</h2>
      <p className="mb-3 text-sm text-muted">Your next $1,000 payout, as a pay stub:</p>
      <PayStubView stub={stub} title="Next $1,000 payout" />

      <h2 className="mt-8 text-lg font-bold">Your plan for this week</h2>
      <ol className="mt-3 space-y-2">
        {steps.map((t, k) => (
          <li key={t} className="flex gap-3 rounded-2xl border border-line bg-surface p-3 text-sm">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand">
              {k + 1}
            </span>
            {t}
          </li>
        ))}
      </ol>

      <div className="mt-8 rounded-3xl border-2 border-brand bg-brand-soft p-5">
        {gate.pro ? (
          <>
            <h2 className="text-lg font-bold">Pro is unlocked (demo) ✓</h2>
            <p className="mt-1 text-sm text-muted">
              Bank import, the catch-up plan and deadline autopilot are ready in your plan.
            </p>
          </>
        ) : (
          <>
            <h2 className="text-lg font-bold">Stay on plan every week with Pro</h2>
            <p className="mt-1 text-sm text-muted">
              Bank import that finds your payouts, a catch-up plan, IRS deadlines in your calendar and a weekly payday
              check-in. From $0.48 a day.
            </p>
            <button
              onClick={() => gate.open()}
              className="mt-4 w-full rounded-xl bg-brand px-5 py-3.5 font-semibold text-brand-ink"
            >
              See Pro plans
            </button>
          </>
        )}
        <button
          onClick={onOpen}
          className={`mt-2 w-full rounded-xl px-5 py-3 font-semibold ${gate.pro ? "bg-brand text-brand-ink" : "border border-line bg-surface"}`}
        >
          {gate.pro ? "Open my plan" : "Continue with the free plan"}
        </button>
      </div>

      <button onClick={onRestart} className="mt-6 text-sm text-muted underline">
        Start over
      </button>
    </main>
  );
}

/* ------------------------------ Small pieces ------------------------------ */

function Question({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section>
      <h1 className="text-2xl font-bold leading-tight">{title}</h1>
      {sub && <p className="mt-2 text-muted">{sub}</p>}
      <div className="mt-6 space-y-3">{children}</div>
    </section>
  );
}

function Choice({
  children,
  onClick,
  selected,
  compact,
}: {
  children: ReactNode;
  onClick: () => void;
  selected?: boolean;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={!!selected}
      onClick={onClick}
      className={`w-full rounded-2xl border-2 bg-surface font-medium transition hover:border-brand ${
        compact ? "px-3 py-3 text-center" : "px-4 py-4 text-left"
      } ${selected ? "border-brand bg-brand-soft" : "border-line"}`}
    >
      {children}
    </button>
  );
}

function Chips({ values, onPick }: { values: number[]; onPick: (v: number) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {values.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onPick(v)}
          className="tnum rounded-full border border-line bg-surface px-3 py-1.5 text-sm hover:border-brand"
        >
          {usd(v)}
        </button>
      ))}
    </div>
  );
}

function Continue({
  onClick,
  disabled,
  label = "Continue",
}: {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-xl bg-brand px-5 py-3.5 font-semibold text-brand-ink disabled:opacity-40"
    >
      {label}
    </button>
  );
}

function Tile({
  label,
  value,
  sub,
  tone = "default",
  className = "",
}: {
  className?: string;
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "brand" | "warn" | "danger";
}) {
  const bg = { default: "bg-surface", brand: "bg-brand-soft", warn: "bg-warn-soft", danger: "bg-danger-soft" }[tone];
  const ink = { default: "text-ink", brand: "text-brand", warn: "text-warn", danger: "text-danger" }[tone];
  return (
    <div className={`rounded-2xl border border-line p-4 ${bg} ${className}`}>
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className={`tnum mt-1 text-2xl font-bold ${ink}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}
