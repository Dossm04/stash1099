# Stash1099

**Live: https://stash1099.vercel.app** · no signup, works on phone · Track: **Money** · Business Cup 2.0

**74.9M Americans work independently and nobody withholds their tax.** Every April millions get a bill they didn't save for, and the IRS assessed **15.7M estimated-tax underpayment penalties ($12.1B) in FY2025**, only 1.4% of them forgiven (IRS Data Book 2025, Table 4-2). Stash1099 answers the question a freelancer has every time they look at their bank app: **"how much of this is actually mine?"** It shows a **safe-to-spend** number (balance minus tax already earned but not set aside), what to set aside from each payout, and the **minimum to pay by each IRS deadline**.

- **User:** a US freelancer or gig worker aged 25–45 with uneven 1099 income (e.g. a designer who also drives DoorDash).
- **Pays for:** Pro at **$8/month or $59/year**: SMS nudges with the exact amount on every payout and deadline, all 50 states, CPA export.
- **Comes back:** before spending (safe-to-spend), on every payout (gig apps pay weekly or instantly) and every Friday: drop in the bank CSV, payouts are detected automatically, stash the quoted amount.

## 60-second demo

1. Open https://stash1099.vercel.app/plan?demo=maya (Maya: freelance UX designer in Austin + DoorDash; paid Q1, missed Q2–Q3).
2. See: **safe to spend −$1,483** on $4,200 in checking (she already spent IRS money); April bill $7,935 with $1,000 saved.
3. **"I just got paid" → $1,200 → $933 yours / $267 to tax savings** (her marginal rate, 22%, not the 17% average).
4. Click **"I moved $267"** → the stash bar moves.
5. **Payment plan:** pay $2,650 today + $1,550 on Jan 15 → penalty stops. **Add deadlines + weekly check-in** to the calendar.

## What it computes (real IRS math, no hardcoded results)

Pure, framework-free TypeScript in [`src/lib/tax`](src/lib/tax); every rate lives in one year config ([`config2026.ts`](src/lib/tax/config2026.ts)) with its source.

| Piece | Rule |
|---|---|
| Self-employment tax | 92.35% × net profit × 15.3%; Social Security part capped at the $184,500 wage base after W-2 wages; $400 floor |
| Additional Medicare | 0.9% above $200k / $250k |
| Income tax | 2026 brackets + standard deduction (Rev. Proc. 2025-32); single, MFJ, HoH |
| Deductions | ½ SE tax; mileage 72.5¢ → 76¢ (raised Jul 1, 2026); **no tax on tips** (≤ $25k, MAGI phase-out); **QBI 20%** incl. the new $400 minimum |
| Projection | Rest-of-year income from your pace, or your own estimate |
| Safe harbor | Lesser of 90% of this year's tax or 100% / 110% of last year's (IRC §6654) |
| Penalty | Form 2210 regular method, **simulated day by day** with IRS quarterly rates; late payments fill the oldest shortfall first; W-2 withholding spread across due dates |
| Payout quote | Re-runs the full plan with the payout added (forecast pinned) → the exact extra tax this payout creates = its **marginal** set-aside |
| Tax stash | Target = average rate × income received so far; covered = max(stashed, paid to IRS); behind/on-track gap |
| Safe to spend | Checking balance − tax earned but not set aside; April shortfall = tax still owed − tax savings |
| Bank CSV import | Detects Chase / BofA / Capital One / Wells Fargo layouts; classifies deposits (gig & freelance payers vs transfers, refunds, interest, W-2 payroll); de-duplicates |

Also: a parser for pasted payout lines (`Mar 3 Upwork 2,400`, `2026-03-05, DoorDash, $412.50`, `03/09 Uber 312`) with per-line errors; `.ics` export with exact amounts, 3-day alarms and a weekly check-in; a private share link that stores the plan in the URL fragment (sanitized on load). Nothing is sent to a server: state lives in `localStorage`.

## Code map

```
src/lib/tax/config2026.ts   all 2026 numbers + sources
src/lib/tax/engine.ts       computeTax, safe harbor, day-by-day penalty, payment plan
src/lib/quote.ts            marginal quote for a new payout
src/lib/stash.ts            tax-stash coverage, gap, safe-to-spend
src/lib/importCsv.ts        bank CSV import and payer classification
src/lib/parsePayments.ts    free-text payout parser
src/lib/ics.ts              calendar export
src/lib/state.ts            app state, demo persona, share-link encode/sanitize
src/components/PlanApp.tsx  the app (one screen: inputs left, live results right)
src/app/page.tsx            landing page
docs/Stash1099-pitch.pdf    pitch deck
```

## Run locally

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # 55 unit tests: tax engine vs hand-computed returns (single/MFJ/HoH, SS wage base, add'l Medicare,
                #   QBI limit, tips phase-out), penalty cases, quote, stash, safe-to-spend, 4 bank CSV formats, parser
npm run e2e     # ~89 end-to-end checks against the live site in a real Chrome with a ru-RU locale:
                #   every button, demo math consistency, CSV import, calendar, share link, mobile, a11y,
                #   no third-party requests, no console/hydration errors, repo + PDF
```

Stack: Next.js 15 (App Router, static), React 19, TypeScript, Tailwind CSS 4, Vitest; deployed on Vercel. Before each deploy: `npx tsc --noEmit && npm run lint && npm test && npm run build`.

## Honest limits

Estimates, not tax advice. State tax is a flat-rate approximation. QBI is conservatively dropped above the income threshold. Itemized deductions and the annualized-income method (Form 2210 Schedule AI) are on the Pro roadmap.
