import Link from "next/link";
import Countdown from "@/components/Countdown";
import HeroWidget from "@/components/HeroWidget";
import { PLANS, PRO_FEATURES, pricePerDay } from "@/lib/pro";

const STATS = [
  {
    big: "74.9M",
    text: "Americans now work independently, a record. Nobody withholds tax for them.",
    src: "MBO Partners, State of Independence 2026",
  },
  {
    big: "58%",
    text: "of self-employed adults have income that swings from month to month; 22% could not pay bills because of it.",
    src: "Federal Reserve, SHED 2025 (May 2026)",
  },
  {
    big: "3.16M",
    text: "new IRS payment plans in FY2025 for tax bills that could not be paid at once: $17.9B paid through them.",
    src: "IRS Data Book 2025, Table 4-1",
  },
];

const STEPS = [
  [
    "Tell us what you earned",
    "Type a number, paste payouts, or drop in your bank export: we find the deposits from Uber, DoorDash, Upwork, Stripe and more.",
  ],
  [
    "Every payout becomes a paycheck",
    "You get a pay stub: Social Security and Medicare, federal and state tax withheld, and the take-home that is really yours.",
  ],
  [
    "Friday is payday",
    "A two-minute weekly check-in: move the withheld tax, see your tax-ready score, and know the exact amount for the next IRS deadline.",
  ],
];

const DIFF = [
  [
    "Your real rate, not “save 30%”",
    "Each payout is withheld at the tax it actually adds: about 14% early in the year, 23% or more once your standard deduction is used up.",
  ],
  [
    "Safe to spend, computed",
    "Your balance minus the tax you already owe on money you already earned. One number to check before you spend.",
  ],
  [
    "The legal minimum for the IRS",
    "We find the cheapest safe harbor for each quarterly deadline and show what the penalty costs per day if you wait.",
  ],
  [
    "Built for 2026 rules",
    "No tax on tips for delivery drivers and servers, the mid-year mileage change, and the new $2,000 threshold for 1099 forms: in January your bank export may be your only record.",
  ],
  [
    "A score and a streak",
    "Your tax-ready score moves with every payout you log and every dollar you set aside. Keep the Friday streak alive.",
  ],
  [
    "Private by design",
    "All the math runs in your browser. No signup, no bank login; your plan is saved on your device or in a private link.",
  ],
];

export default function Home() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <div className="flex items-center gap-2 font-semibold">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-sm font-bold text-brand-ink">
            $
          </span>
          Stash1099
        </div>
        <Link href="/plan" className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-bg">
          Open app
        </Link>
      </header>

      <section className="mx-auto grid max-w-6xl items-start gap-10 px-4 pb-16 pt-8 lg:grid-cols-[1.15fr_1fr]">
        <div>
          <p className="mb-4 inline-block rounded-full bg-brand-soft px-3 py-1 text-sm font-medium text-brand">
            Payroll for one · for US freelancers & gig workers
          </p>
          <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            Nobody withholds your taxes. So part of your bank balance is not yours.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted">
            An employer takes tax out of every paycheck. With 1099 income nobody does, so the money in checking looks
            bigger than it is, until April sends a bill for thousands. Stash1099 turns every payout into a paycheck: tax
            withheld, the rest really yours.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/start"
              className="rounded-xl bg-brand px-6 py-3.5 font-semibold text-brand-ink shadow-sm hover:opacity-95"
            >
              Take the 60-second check
            </Link>
            <Link
              href="/plan?demo=maya"
              className="rounded-xl border border-line bg-surface px-6 py-3.5 font-semibold hover:bg-surface-2"
            >
              See Maya&apos;s example →
            </Link>
          </div>
          <p className="mt-3 text-sm text-muted">Free · No signup · Nothing leaves your browser</p>
          <div className="mt-8 max-w-sm">
            <Countdown />
          </div>
        </div>
        <HeroWidget />
      </section>

      <section className="border-y border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-12 sm:grid-cols-3">
          {STATS.map((s) => (
            <div key={s.big}>
              <div className="tnum text-4xl font-bold">{s.big}</div>
              <p className="mt-2 text-muted">{s.text}</p>
              <p className="mt-2 text-xs text-muted">{s.src}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-3xl font-bold tracking-tight">How it works</h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-3">
          {STEPS.map(([t, d], i) => (
            <li key={t} className="rounded-2xl border border-line bg-surface p-5">
              <span className="text-sm font-semibold text-brand">Step {i + 1}</span>
              <h3 className="mt-1 text-lg font-semibold">{t}</h3>
              <p className="mt-2 text-muted">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16">
        <h2 className="text-3xl font-bold tracking-tight">Not another tax calculator</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {DIFF.map(([t, d]) => (
            <div key={t} className="rounded-2xl border border-line bg-surface p-5">
              <h3 className="font-semibold">{t}</h3>
              <p className="mt-2 text-muted">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20" id="pricing">
        <h2 className="text-3xl font-bold tracking-tight">Pricing</h2>
        <p className="mt-2 max-w-2xl text-muted">
          Free shows you the numbers. Pro keeps you on plan every week. An IRS payment plan on a $5,000 bill costs about
          $300 a year, a credit card about $1,000.
        </p>
        <div className="mt-8 grid gap-4 lg:grid-cols-[1fr_1.6fr]">
          <div className="rounded-2xl border border-line bg-surface p-6">
            <h3 className="text-lg font-semibold">Free</h3>
            <div className="tnum mt-2 text-4xl font-bold">$0</div>
            <ul className="mt-4 space-y-2 text-muted">
              <li>✓ Safe to spend and your April bill</li>
              <li>✓ A pay stub for every payout you type in</li>
              <li>✓ The IRS minimum for each deadline</li>
              <li>✓ Tax-ready score</li>
            </ul>
          </div>
          <div className="rounded-2xl border-2 border-brand bg-surface p-6">
            <h3 className="text-lg font-semibold">Pro</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {PLANS.map((p) => (
                <div
                  key={p.id}
                  className={`rounded-xl border p-3 ${p.badge ? "border-brand bg-brand-soft" : "border-line"}`}
                >
                  <div className="text-sm font-semibold">{p.label}</div>
                  <div className="tnum mt-1 text-2xl font-bold">${pricePerDay(p).toFixed(2)}</div>
                  <div className="text-xs text-muted">per day · ${p.price.toFixed(2)} total</div>
                  {p.badge && <div className="mt-1 text-xs font-semibold text-brand">{p.badge}</div>}
                </div>
              ))}
            </div>
            <ul className="mt-4 space-y-2 text-muted">
              {PRO_FEATURES.map(([name, text]) => (
                <li key={name}>
                  ✓ <b className="text-ink">{name}.</b> {text}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-muted">30-day money-back guarantee · Cancel anytime</p>
          </div>
        </div>
        <div className="mt-10 text-center">
          <Link href="/start" className="rounded-xl bg-brand px-6 py-3.5 font-semibold text-brand-ink">
            Take the 60-second check
          </Link>
        </div>
      </section>

      <footer className="border-t border-line py-8 text-center text-xs text-muted">
        Stash1099 gives estimates using published IRS rules for tax year 2026. It is not tax, legal or financial advice.
        Hackathon demo: Pro checkout is simulated and nothing is charged.
      </footer>
    </div>
  );
}
