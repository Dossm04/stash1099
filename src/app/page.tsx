import Link from "next/link";
import Countdown from "@/components/Countdown";

const STATS = [
  {
    big: "74.9M",
    text: "Americans now work independently, a record. Nobody withholds tax for them.",
    src: "MBO Partners, State of Independence 2026",
  },
  {
    big: "15.7M",
    text: "estimated-tax underpayment penalties in FY2025: $12.1B, ~$766 on average. Only 1.4% were forgiven.",
    src: "IRS Data Book 2025, Table 4-2",
  },
  {
    big: "49%",
    text: "of independent workers don’t pay quarterly at all, and 63% fear owing more than they expect.",
    src: "Independent Economy Council survey, n=1,000 (2022)",
  },
];

const STEPS = [
  ["Log what you earned", "Type or paste payouts from Upwork, Uber, DoorDash or clients. No bank login, no signup."],
  [
    "Get your number",
    "We run the real 2026 IRS math (SE tax, brackets, QBI, the new no-tax-on-tips deduction) and project your year.",
  ],
  [
    "Stash & pay on time",
    "Every new payment is split into “yours” and “tax”. Deadlines go to your calendar with the exact amount.",
  ],
];

const DIFF = [
  [
    "Your real rate, not “save 30%”",
    "Each payout is quoted at the exact tax it adds: SE tax plus your bracket, after the standard deduction, QBI and tips. Early in the year that can be 14%; later, 22%+.",
  ],
  [
    "A stash that tells you if you’re behind",
    "Log what you moved to tax savings. One bar shows how much of this year’s tax is covered and exactly how much to move to catch up.",
  ],
  [
    "Penalty-proof minimum",
    "We find the cheapest legal safe harbor (90% of this year or 100–110% of last year) so you keep more cash until April.",
  ],
  [
    "Live penalty counter",
    "See what you’ve already accrued and what it will be by April, computed day by day like IRS Form 2210.",
  ],
  ["Uneven income friendly", "Built for gig and freelance paychecks: each payout updates your set-aside rate instantly."],
  [
    "Private by design",
    "All math runs in your browser. Your plan is saved locally or in a private link, never on our servers.",
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

      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-10 lg:grid-cols-[1.3fr_1fr]">
        <div>
          <p className="mb-4 inline-block rounded-full bg-brand-soft px-3 py-1 text-sm font-medium text-brand">
            For US freelancers & gig workers
          </p>
          <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            Know exactly how much of every paycheck belongs to the IRS.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted">
            No employer withholds your taxes, so April brings a bill, plus a penalty for not paying quarterly.
            Stash1099 tells you what to set aside from each payment and the minimum to pay by each deadline so the
            penalty is zero.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/plan"
              className="rounded-xl bg-brand px-6 py-3.5 font-semibold text-brand-ink shadow-sm hover:opacity-95"
            >
              Build my plan in 60 seconds
            </Link>
            <Link
              href="/plan?demo=maya"
              className="rounded-xl border border-line bg-surface px-6 py-3.5 font-semibold hover:bg-surface-2"
            >
              See a real example →
            </Link>
          </div>
          <p className="mt-3 text-sm text-muted">Free · No signup · Nothing leaves your browser</p>
        </div>
        <div className="space-y-3">
          <Countdown />
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
            <div className="text-sm text-muted">Maya, a freelance designer, just got paid $1,200</div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-center">
              <div className="rounded-xl bg-surface-2 p-3">
                <div className="text-xs text-muted">Hers to spend</div>
                <div className="tnum text-2xl font-bold">$933</div>
              </div>
              <div className="rounded-xl bg-brand p-3 text-brand-ink">
                <div className="text-xs opacity-80">Tax savings</div>
                <div className="tnum text-2xl font-bold">$267</div>
              </div>
            </div>
            <div className="mt-3 rounded-xl bg-danger-soft p-3 text-sm text-danger">
              She missed 2 quarterly payments: <b>~$50 penalty already</b>, $153 by April if she does nothing.
            </div>
          </div>
        </div>
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
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {DIFF.map(([t, d]) => (
            <div key={t} className="rounded-2xl border border-line bg-surface p-5">
              <h3 className="font-semibold">{t}</h3>
              <p className="mt-2 text-muted">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20">
        <h2 className="text-3xl font-bold tracking-tight">Pricing</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-line bg-surface p-6">
            <h3 className="text-lg font-semibold">Free</h3>
            <div className="tnum mt-2 text-4xl font-bold">$0</div>
            <ul className="mt-4 space-y-2 text-muted">
              <li>✓ Full 2026 tax plan & safe-harbor minimum</li>
              <li>✓ Penalty counter & quarterly schedule</li>
              <li>✓ Calendar export</li>
            </ul>
          </div>
          <div className="rounded-2xl border-2 border-brand bg-surface p-6">
            <h3 className="text-lg font-semibold">Pro</h3>
            <div className="mt-2 text-4xl font-bold">
              <span className="tnum">$8</span>
              <span className="text-base font-normal text-muted">/month · or $59/year</span>
            </div>
            <ul className="mt-4 space-y-2 text-muted">
              <li>✓ SMS nudge with the exact amount on every payout & deadline</li>
              <li>✓ Exact state tax for all 50 states</li>
              <li>✓ Annualized-income method for very lumpy years</li>
              <li>✓ One-click export for your CPA</li>
            </ul>
            <p className="mt-4 text-sm text-muted">Avoiding one average IRS penalty (~$766) pays for 13 years of Pro.</p>
          </div>
        </div>
        <div className="mt-10 text-center">
          <Link href="/plan" className="rounded-xl bg-brand px-6 py-3.5 font-semibold text-brand-ink">
            Build my plan now
          </Link>
        </div>
      </section>

      <footer className="border-t border-line py-8 text-center text-xs text-muted">
        Stash1099 gives estimates using published IRS rules for tax year 2026. It is not tax, legal or financial
        advice.
      </footer>
    </div>
  );
}
