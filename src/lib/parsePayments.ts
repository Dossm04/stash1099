import { monthIndex } from "./tax/dates";
import type { IncomePayment } from "./tax/engine";

export interface ParseResult {
  payments: IncomePayment[];
  errors: { line: number; text: string; reason: string }[];
}

const AMOUNT = /\$?\s*(-?\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|-?\d+(?:\.\d{1,2})?)\s*$/;

let counter = 0;
export const newId = () => `p${Date.now().toString(36)}${(counter++).toString(36)}`;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/**
 * Parse free-form lines pasted from a bank app, payout email or notes, e.g.
 *   "Mar 3 Upwork 2,400"   "2026-03-03, DoorDash, $412.50"   "03/03 Uber Eats 312"
 * Date first, amount last, anything in between is the source.
 */
export function parsePayments(text: string, year: number): ParseResult {
  const payments: IncomePayment[] = [];
  const errors: ParseResult["errors"] = [];

  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim().replace(/\t/g, " ");
    if (!line) return;

    const amountMatch = line.match(AMOUNT);
    if (!amountMatch) {
      errors.push({ line: i + 1, text: raw, reason: "No amount at the end of the line" });
      return;
    }
    const amount = Number(amountMatch[1].replace(/,/g, ""));
    let rest = line.slice(0, amountMatch.index).replace(/[,;|]+\s*$/, "").trim();

    let date: string | null = null;
    let m: RegExpMatchArray | null;
    if ((m = rest.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\b[,;|]?\s*/))) {
      date = `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
    } else if ((m = rest.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b[,;|]?\s*/))) {
      const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : year;
      date = `${y}-${pad(+m[1])}-${pad(+m[2])}`;
    } else if ((m = rest.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?\b[,;|]?\s*/))) {
      const mi = monthIndex(m[1]);
      if (mi >= 0) date = `${m[3] ?? year}-${pad(mi + 1)}-${pad(+m[2])}`;
    }
    if (!date || !m) {
      errors.push({ line: i + 1, text: raw, reason: "Couldn't read a date at the start" });
      return;
    }
    const [, mm, dd] = date.split("-").map(Number);
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) {
      errors.push({ line: i + 1, text: raw, reason: "Invalid date" });
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      errors.push({ line: i + 1, text: raw, reason: "Amount must be positive" });
      return;
    }
    rest = rest.slice(m[0].length).replace(/^[-–:,;|\s]+|[-–:,;|\s]+$/g, "");
    payments.push({ id: newId(), date, source: rest || "Client", amount });
  });

  return { payments, errors };
}
