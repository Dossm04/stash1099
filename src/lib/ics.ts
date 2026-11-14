/** Build an .ics calendar with one all-day event (plus a 3-day reminder) per payment. */
export function buildIcs(items: { dueDate: string; amount: number }[], appUrl: string): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Stash1099//EN", "CALSCALE:GREGORIAN"];
  for (const it of items) {
    const d = it.dueDate.replace(/-/g, "");
    const next = new Date(Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8) + 1))
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, "");
    const amt = `$${Math.round(it.amount).toLocaleString("en-US")}`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:stash1099-${d}-${Math.round(it.amount)}@stash1099`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${d}`,
      `DTEND;VALUE=DATE:${next}`,
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
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
