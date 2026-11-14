"use client";

import { checkedInThisWeek, checkinStreak, daysToFriday } from "@/lib/pro";
import type { Snapshot } from "@/lib/snapshot";
import { formatShort } from "@/lib/tax/dates";
import { Card, usd } from "./ui";

const LEVEL = {
  ready: { label: "IRS-ready", ring: "var(--brand)", text: "text-brand" },
  close: { label: "Almost there", ring: "var(--warn)", text: "text-warn" },
  "at-risk": { label: "At risk", ring: "var(--danger)", text: "text-danger" },
} as const;

export function ScoreRing({ score, level, size = 88 }: { score: number; level: keyof typeof LEVEL; size?: number }) {
  const r = 38;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox="0 0 88 88" role="img" aria-label={`Tax-ready score ${score} out of 100`}>
      <circle cx="44" cy="44" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="8" />
      <circle
        cx="44"
        cy="44"
        r={r}
        fill="none"
        stroke={LEVEL[level].ring}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={`${(score / 100) * c} ${c}`}
        transform="rotate(-90 44 44)"
        style={{ transition: "stroke-dasharray 0.5s ease" }}
      />
      <text x="44" y="50" textAnchor="middle" fontSize="24" fontWeight="700" fill="var(--ink)">
        {score}
      </text>
    </svg>
  );
}

/**
 * The weekly ritual: a score that moves with every action, three things to do this week,
 * and a streak for doing the Friday "payday" check-in.
 */
export function ThisWeek({
  snap,
  today,
  checkins,
  onCheckin,
}: {
  snap: Snapshot;
  today: string;
  checkins: string[];
  onCheckin: () => void;
}) {
  const { score, stash, plan, safe, lastPayoutDate } = snap;
  const streak = checkinStreak(checkins, today);
  const done = checkedInThisWeek(checkins, today);
  const toFriday = daysToFriday(today);
  const next = plan.upcomingSafe[0];
  const fresh = score.parts.find((p) => p.key === "fresh")!.points === 15;

  const tasks: { ok: boolean; text: string }[] = [
    {
      ok: fresh,
      text: fresh
        ? `Income log is up to date (last payout ${lastPayoutDate ? formatShort(lastPayoutDate) : "today"})`
        : `Log the payouts you received since ${lastPayoutDate ? formatShort(lastPayoutDate) : "January"}`,
    },
    {
      ok: stash.status !== "behind",
      text:
        stash.status === "behind"
          ? `Move ${usd(safe.unstashedTax)} to tax savings, or spread it with the catch-up plan`
          : "Tax on everything you earned is set aside",
    },
    plan.catchUpNow > 0
      ? { ok: false, text: `Pay the IRS ${usd(plan.catchUpNow)} to stop the penalty clock` }
      : {
          ok: !next || next.amount === 0 || stash.balance >= next.amount,
          text:
            next && next.amount > 0
              ? `${usd(next.amount)} due to the IRS on ${formatShort(next.dueDate)}`
              : "No IRS payment due",
        },
  ];

  return (
    <Card>
      <div className="flex items-center gap-4">
        <ScoreRing score={score.score} level={score.level} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2">
            <h2 className="font-semibold">Tax-ready score</h2>
            <span className={`text-sm font-semibold ${LEVEL[score.level].text}`}>{LEVEL[score.level].label}</span>
          </div>
          <p className="mt-0.5 text-sm text-muted">
            {toFriday === 0
              ? "Today is payday."
              : `Payday check-in in ${toFriday} day${toFriday === 1 ? "" : "s"} (Friday).`}{" "}
            {streak > 0 ? (
              <b className="text-ink">
                {streak}-week streak{streak >= 3 ? " 🔥" : ""}
              </b>
            ) : (
              "Start your streak this week."
            )}
          </p>
        </div>
      </div>

      <ul className="mt-4 space-y-2 text-sm">
        {tasks.map((t) => (
          <li key={t.text} className="flex items-start gap-2">
            <span
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                t.ok ? "bg-brand text-brand-ink" : "border border-line text-muted"
              }`}
              aria-hidden
            >
              {t.ok ? "✓" : ""}
            </span>
            <span className={t.ok ? "text-muted" : ""}>{t.text}</span>
          </li>
        ))}
      </ul>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-muted">How the score is built</summary>
        <ul className="tnum mt-2 space-y-1">
          {score.parts.map((p) => (
            <li key={p.key} className="flex justify-between gap-3">
              <span>{p.label}</span>
              <span className="font-medium">
                {p.points} / {p.max}
              </span>
            </li>
          ))}
        </ul>
      </details>

      <button
        onClick={onCheckin}
        disabled={done}
        className="mt-4 w-full rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-bg disabled:bg-brand-soft disabled:text-brand"
      >
        {done ? "✓ Checked in this week" : "Finish this week's payday check-in"}
      </button>
    </Card>
  );
}
