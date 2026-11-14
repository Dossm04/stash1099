import { addDays, daysBetween, parseIso } from "./tax/dates";

/* ------------------------------- Pricing -------------------------------- */

export interface ProPlan {
  id: "1w" | "4w" | "12w";
  label: string;
  weeks: number;
  price: number;
  badge?: string;
}

export const PLANS: ProPlan[] = [
  { id: "1w", label: "1 week", weeks: 1, price: 6.99 },
  { id: "4w", label: "4 weeks", weeks: 4, price: 19.99, badge: "Most popular" },
  { id: "12w", label: "12 weeks", weeks: 12, price: 39.99, badge: "Best value" },
];

export const pricePerDay = (p: ProPlan) => Math.round((p.price / (p.weeks * 7)) * 100) / 100;

/** What Pro adds on top of the free numbers. Shown on the paywall and used for the lock labels. */
export const PRO_FEATURES = [
  ["Bank import", "Drop in your bank export: payouts are found and withheld automatically"],
  ["Catch-up plan", "Spread what you are behind over your next payouts instead of one painful transfer"],
  ["Deadline autopilot", "IRS deadlines with exact amounts and a weekly payday check-in in your calendar"],
  ["Tax-pro export", "One file with your income log and estimates for your CPA or tax software"],
] as const;

/* ------------------------- Demo unlock (no backend) ---------------------- */

const PRO_KEY = "stash1099:pro";
const CHECKIN_KEY = "stash1099:checkins";

export interface ProStatus {
  plan: ProPlan["id"];
  /** ISO date the demo plan was activated. */
  since: string;
}

export function loadPro(): ProStatus | null {
  try {
    const raw = localStorage.getItem(PRO_KEY);
    const v = raw ? JSON.parse(raw) : null;
    return v && PLANS.some((p) => p.id === v.plan) && typeof v.since === "string" ? v : null;
  } catch {
    return null;
  }
}

export function savePro(status: ProStatus | null) {
  try {
    if (status) localStorage.setItem(PRO_KEY, JSON.stringify(status));
    else localStorage.removeItem(PRO_KEY);
  } catch {
    /* storage unavailable: Pro stays unlocked for this page view only */
  }
}

/* --------------------------- Weekly payday ritual ------------------------ */

/** Monday of the week that contains `iso`. */
export function weekStart(iso: string): string {
  const dow = (parseIso(iso).getUTCDay() + 6) % 7; // Mon = 0 … Sun = 6
  return addDays(iso, -dow);
}

/**
 * Consecutive weeks with a check-in, counting back from this week.
 * A streak survives until the end of the following week, so checking in on Friday one week
 * and Monday ten days later still counts as two in a row.
 */
export function checkinStreak(checkins: string[], today: string): number {
  const weeks = new Set(checkins.filter((d) => d <= today).map(weekStart));
  let cursor = weekStart(today);
  if (!weeks.has(cursor)) cursor = addDays(cursor, -7);
  let streak = 0;
  while (weeks.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -7);
  }
  return streak;
}

export const checkedInThisWeek = (checkins: string[], today: string) =>
  checkins.some((d) => weekStart(d) === weekStart(today));

/** Days until the coming Friday (0 on Friday): the suggested weekly payday. */
export function daysToFriday(today: string): number {
  const friday = addDays(weekStart(today), 4);
  const d = daysBetween(today, friday);
  return d >= 0 ? d : d + 7;
}

export function loadCheckins(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(CHECKIN_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(-200) : [];
  } catch {
    return [];
  }
}

export function saveCheckins(checkins: string[]) {
  try {
    localStorage.setItem(CHECKIN_KEY, JSON.stringify(checkins.slice(-200)));
  } catch {
    /* ignore */
  }
}
