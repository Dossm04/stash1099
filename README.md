# Stash1099

**72.9M US freelancers and gig workers have no employer withholding their taxes.** Every April millions get a surprise bill, and ~14M a year also pay an IRS underpayment penalty for not paying quarterly. Stash1099 tells them, in 60 seconds and without signing up, **how much of every payment to set aside** and **the minimum to pay by each deadline so the penalty is zero.**

Track: **Money**. User: a US freelancer/gig worker aged 25–45 with uneven 1099 income. Price: **$8/month or $59/year** (Pro).

## Try it

- Live: _see the repo description_ 
- Click **"See a real example"** to load Maya: a freelance UX designer in Austin who also drives for DoorDash, paid Q1 and missed Q2–Q3.
- Hit **"I just got paid"**, type `1200`, and watch it split into "yours" and "tax savings".

## What it actually computes (no hardcoded results)

All tax logic is pure TypeScript in [`src/lib/tax`](src/lib/tax), parameterized by a year config ([`config2026.ts`](src/lib/tax/config2026.ts)) with sources:

| Piece | Rule |
|---|---|
| Self-employment tax | 92.35% × net profit × 15.3%, Social Security part capped at the $184,500 wage base (after W-2 wages), $400 floor |
| Additional Medicare | 0.9% above $200k / $250k |
| Income tax | 2026 brackets & standard deduction (Rev. Proc. 2025-32), single / MFJ / HoH |
| Deductions | ½ SE tax, mileage (72.5¢ → 76¢ from Jul 1, 2026), **no tax on tips** (up to $25k, phase-out), **QBI 20%** incl. new $400 minimum |
| Projection | Rest-of-year income projected from your pace (or your own estimate) |
| Safe harbor | Lesser of 90% of this year's tax or 100% / 110% of last year's (IRC §6654) |
| Penalty | Form 2210 regular method, simulated day by day with the IRS quarterly rates; late payments fill the oldest shortfall first; W-2 withholding spread across due dates |
| Set-aside rate | Extra total tax caused by each 1099 dollar (plan computed with vs. without the 1099 income) |

Plus: a parser for pasted payout lines (`Mar 3 Upwork 2,400`, `2026-03-05, DoorDash, $412.50`, `03/09 Uber 312`), an `.ics` export with 3-day reminders, and a share link that stores the plan in the URL fragment. Nothing is sent to a server; state lives in `localStorage`.

## Run locally

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # 17 unit tests for the tax engine, penalty math and parser
```

Stack: Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 4, Vitest. Deployed on Vercel.

## Limits (honest list)

Estimates only, not tax advice. State tax is a flat-rate approximation. QBI is dropped (conservatively) above the income threshold. The annualized-income method for very uneven years and itemized deductions are on the Pro roadmap.
