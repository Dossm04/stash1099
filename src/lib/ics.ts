import { addDays, parseIso } from "./tax/dates";

const compact = (iso: string) => iso.replace(/-/g, "");

/** First Friday on or after the given date. */
export function nextFriday(iso: string): string {
  const dow = parseIso(iso).getUTCDay(); // 0 = Sun … 5 = Fri
  return addDays(iso, (5 - dow + 7) % 7);
}

/**
 * Build an .ics calendar:
 *  - one all-day event (with a 3-day reminder) per IRS payment, with the exact amount;
 *  - optionally a weekly Friday check-in ("log payouts, move your %") until the return is due —
 *    the habit that keeps the stash on track between deadlines.
 */
export function buildIcs(
  items: { dueDate: string; amount: number }[],
  appUrl: string,
  weekly?: { from: string; until: string; rate: number },
): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Stash1099//EN", "CALSCALE:GREGORIAN"];
  for (const it of items) {
    const d = compact(it.dueDate);
    const amt = `$${Math.round(it.amount).toLocaleString("en-US")}`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:stash1099-${d}-${Math.round(it.amount)}@stash1099`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${d}`,
      `DTEND;VALUE=DATE:${compact(addDays(it.dueDate, 1))}`,
      `SUMMARY:Pay IRS estimated tax: ${amt}`,
      `DESCRIPTION:Pay ${amt} at https://www.irs.gov/payments/direct-pay (Form 1040-ES). Plan: ${appUrl}`,
      "BEGIN:VALARM",
      "TRIGGER:-P3D",
      "ACTION:DISPLAY",
      `DESCRIPTION:IRS estimated tax due in 3 days: ${amt}`,
      "END:VALARM",
      "END:VEVENT",
    );
  }
  if (weekly) {
    const start = nextFriday(weekly.from);
    const pct = `${Math.round(weekly.rate * 100)}%`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:stash1099-weekly-${compact(start)}@stash1099`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(start)}`,
      `DTEND;VALUE=DATE:${compact(addDays(start, 1))}`,
      `RRULE:FREQ=WEEKLY;UNTIL=${compact(weekly.until)}`,
      `SUMMARY:Tax check-in: log this week's payouts, move ${pct} to tax savings`,
      `DESCRIPTION:2 minutes: add this week's payouts and stash your share. ${appUrl}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
