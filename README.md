# Stash1099 — payroll for one

**Live: https://stash1099.vercel.app** · no signup, works on phone · Track: **Money** · Business Cup 2.0

**74.9M Americans work independently and nobody withholds their tax.** An employer takes tax out of every paycheck; with 1099 income nobody does, so the money in checking looks bigger than it is — until April sends a bill for thousands. In FY2025 the IRS opened **3.16M new payment plans** for tax bills people could not pay at once (IRS Data Book 2025, Table 4-1), and **58% of self-employed adults** say their income swings month to month (Fed SHED 2025).

Stash1099 turns every payout into a paycheck: **tax withheld, the rest really yours.**

- **User:** a US freelancer or gig worker aged 25–45 with uneven 1099 income (e.g. a designer who also drives DoorDash).
- **Free:** safe-to-spend, a pay stub for every payout, the IRS minimum for each deadline, a tax-ready score.
- **Pro ($0.48–$1.00 a day; 1, 4 or 12-week plans):** bank import that finds payouts, a catch-up plan, deadline autopilot (calendar with exact amounts + weekly check-in), tax-pro export. *Hackathon demo: checkout is simulated, nothing is charged.*
- **Comes back:** every payout, before spending (safe-to-spend), and every Friday — the payday check-in that keeps the score up and the streak alive.

## 60-second tour

1. **Landing:** type two numbers (1099 income so far, checking balance) → see what is really yours, computed by the real engine.
2. **/start:** a 7-step quiz → personal result: "You have already spent $X of the IRS's money", April bill, tax-ready score, your next $1,000 payout as a pay stub, a plan for this week, Pro plans.
3. **/plan?demo=maya** (freelance UX designer + DoorDash, Austin): safe to spend **−$1,257** on $4,200 in checking; **I just got paid $1,200 → pay stub: $170 SE tax + $107 federal income tax withheld, $923 take-home**; tax-ready score 47; "Unlock the catch-up plan" → paywall → demo checkout → Pro.

## What it computes (real IRS math, no hardcoded results)

Pure TypeScript in [`src/lib`](src/lib); every 2026 number lives in one config ([`config2026.ts`](src/lib/tax/config2026.ts)) with its source.

| Piece | Rule |
|---|---|
| Self-employment tax | 92.35% × net profit × 15.3%; Social Security part capped at $184,500 (W-2 wages reduce the cap except on joint returns, where they may be the spouse's); $400 floor |
| Additional Medicare | 0.9% above $200k / $250k |
| Income tax | 2026 brackets + standard deduction (Rev. Proc. 2025-32); single, MFJ, HoH |
| Credits & deductions | **Child Tax Credit** $2,200/child (≤ $1,700 refundable, phase-out); ½ SE tax; mileage 72.5¢ → 76¢; **no tax on tips** (≤ $25k, phase-out); **QBI 20%** incl. the $400 minimum |
| Tax accrued to date | Tax that would be owed if the year ended today on income already received — the "should be set aside by now" target (not an average) |
| Pay stub for a payout | Accrued tax with the payout minus without it, split into SE tax / federal / state; stashing exactly that keeps the user's gap unchanged |
| Safe to spend | Checking balance − tax accrued but not covered − bills due before the next payout |
| Covered | Paid to the IRS + still in tax savings (IRS payments come out of savings unless marked "from checking") |
| Safe harbor & penalty | Lesser of 90% this year / 100–110% last year (IRC §6654); Form 2210 regular method simulated day by day with IRS quarterly rates |
| Tax-ready score | 50 coverage + 20 no missed deadlines + 15 next payment funded + 15 log updated this week |
| Catch-up plan | Spread the gap over the next N payouts on top of the marginal rate |
| Bank CSV import | Chase / BofA / Capital One / Wells Fargo layouts; payer detection (Uber, DoorDash, Upwork, Stripe…); excludes transfers, refunds, interest, W-2 payroll; de-duplicates |

Also: payout-line parser, `.ics` export with exact amounts, 3-day alarms and a weekly check-in, tax-pro CSV export, private share link (URL fragment, sanitized on load). Nothing is sent to a server: state lives in `localStorage`.

## Code map

```
src/lib/tax/config2026.ts   all 2026 numbers + sources
src/lib/tax/engine.ts       computeTax, safe harbor, day-by-day penalty, payment plan
src/lib/stash.ts            accrued tax, coverage, safe-to-spend, tax-ready score, catch-up plan
src/lib/quote.ts            pay stub for a payout (marginal withholding)
src/lib/snapshot.ts         one derived view used by landing widget, quiz and app
src/lib/pro.ts              plans, demo unlock, weekly payday streak
src/lib/importCsv.ts        bank CSV import and payer classification
src/lib/exportCsv.ts        tax-pro summary
src/components/Quiz.tsx     /start quiz → personal result → paywall
src/components/PlanApp.tsx  the app
src/components/ProGate.tsx  paywall (1/4/12 weeks, price per day, demo checkout)
e2e/checks.mjs              105 end-to-end checks in a real Chrome (ru-RU locale)
docs/Stash1099-pitch.pdf    pitch deck
```

## Run locally

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # 86 unit tests: tax engine vs hand-computed returns (single/MFJ/HoH, SS wage base,
                #   add'l Medicare, QBI limit, tips, child tax credit), penalty cases, accrual, pay stub,
                #   score, catch-up, safe-to-spend, 4 bank CSV formats, parser, share link
npm run e2e     # 105 end-to-end checks against the live site: landing widget, quiz funnel, paywall,
                #   every button, demo math consistency, CSV import, calendar, export, mobile, a11y,
                #   no third-party requests, no console/hydration errors, repo + PDF
```

Stack: Next.js 15 (App Router, static), React 19, TypeScript, Tailwind CSS 4, Vitest, Puppeteer; deployed on Vercel.

## Honest limits

Estimates, not tax advice. State tax is a flat-rate approximation. QBI is conservatively dropped above the income threshold. The quiz assumes estimated payments were made on the due dates already passed. Pro checkout is a demo (no payments); the real product would use Stripe.
