/**
 * Bank-statement import without a bank connection.
 *
 * Every US bank lets you download transactions as CSV, but each uses its own layout
 * (Chase: Details,Posting Date,Description,Amount…; Bank of America: Date,Description,Amount…;
 * Capital One: separate Debit/Credit columns; Wells Fargo: no header at all). We detect the
 * columns, keep only money coming IN, and classify each deposit:
 *   - "platform": a known gig/freelance payer (Uber, DoorDash, Upwork, Stripe…) → 1099 income
 *   - "maybe":    Zelle/Venmo/check/other deposits → could be a client, user decides
 *   - "excluded": transfers, refunds, interest, W-2 payroll → never 1099 income
 * The file is parsed in the browser and never uploaded anywhere.
 */

export interface BankRow {
  date: string; // ISO
  description: string;
  amount: number; // + = money in
}

export type DepositKind = "platform" | "maybe" | "excluded";

export interface Deposit extends BankRow {
  kind: DepositKind;
  /** Clean payer name for the income log. */
  source: string;
  reason: string;
  include: boolean;
}

export interface ImportResult {
  deposits: Deposit[];
  skippedOutflows: number;
  bankFormat: string;
  error?: string;
}

/* ----------------------------- CSV parsing ----------------------------- */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f.trim() !== "")) rows.push(row.map((f) => f.trim()));
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row.map((f) => f.trim()));
  return rows;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function toIsoDate(s: string): string | null {
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    if (+m[1] < 1 || +m[1] > 12 || +m[2] < 1 || +m[2] > 31) return null;
    return `${y}-${pad(+m[1])}-${pad(+m[2])}`;
  }
  return null;
}

export function toAmount(s: string): number | null {
  const t = s.replace(/[$\s]/g, "");
  if (t === "") return null;
  const neg = /^\(.*\)$/.test(t) || t.startsWith("-");
  const n = Number(t.replace(/[(),-]/g, ""));
  if (!Number.isFinite(n) || !/\d/.test(t)) return null;
  return neg ? -n : n;
}

/* -------------------------- column detection --------------------------- */

interface Layout {
  start: number;
  date: number;
  description: number;
  amount?: number;
  credit?: number;
  debit?: number;
  format: string;
}

/** First column matching the highest-priority pattern (patterns are tried in order). */
const find = (header: string[], ...names: RegExp[]) => {
  for (const n of names) {
    const i = header.findIndex((h) => n.test(h));
    if (i >= 0) return i;
  }
  return -1;
};

function detectLayout(rows: string[][]): Layout | null {
  // 1) Header row somewhere in the first 10 lines (BoA puts a summary block above it).
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const h = rows[i].map((c) => c.toLowerCase());
    const date = find(h, /posting date/, /transaction date/, /^date$/, /date/);
    const description = find(h, /description/, /^details$/, /payee/, /memo/, /^name$/);
    const amount = find(h, /^amount$/, /amount/);
    const credit = find(h, /credit/, /deposit/);
    const debit = find(h, /debit/, /withdrawal/);
    if (date >= 0 && description >= 0 && (amount >= 0 || credit >= 0)) {
      const format =
        h.includes("details") && h.includes("posting date")
          ? "Chase"
          : credit >= 0 && amount < 0
            ? "Capital One style (Debit/Credit)"
            : h.some((c) => c.includes("running bal"))
              ? "Bank of America"
              : "Generic CSV";
      return {
        start: i + 1,
        date,
        description,
        amount: amount >= 0 ? amount : undefined,
        credit: amount < 0 ? credit : undefined,
        debit: amount < 0 && debit >= 0 ? debit : undefined,
        format,
      };
    }
  }
  // 2) No header (Wells Fargo): guess by content of the first row.
  const first = rows[0];
  if (!first) return null;
  const date = first.findIndex((c) => toIsoDate(c) !== null);
  const amount = first.findIndex((c, i) => i !== date && toAmount(c) !== null);
  let description = -1;
  let longest = 0;
  first.forEach((c, i) => {
    if (i !== date && i !== amount && /[a-z]/i.test(c) && c.length > longest) {
      longest = c.length;
      description = i;
    }
  });
  if (date >= 0 && amount >= 0 && description >= 0) {
    return { start: 0, date, description, amount, format: "No-header CSV (Wells Fargo style)" };
  }
  return null;
}

/* ---------------------------- classification --------------------------- */

const PLATFORMS: [RegExp, string][] = [
  [/doordash|dasher/i, "DoorDash"],
  [/uber/i, "Uber"],
  [/lyft/i, "Lyft"],
  [/instacart|maplebear/i, "Instacart"],
  [/grubhub/i, "Grubhub"],
  [/amzn flex|amazon flex/i, "Amazon Flex"],
  [/spark driver|walmart spark/i, "Spark Driver"],
  [/shipt/i, "Shipt"],
  [/upwork/i, "Upwork"],
  [/fiverr/i, "Fiverr"],
  [/etsy/i, "Etsy"],
  [/shopify/i, "Shopify"],
  [/stripe/i, "Stripe"],
  [/square|sq \*/i, "Square"],
  [/paypal/i, "PayPal"],
  [/taskrabbit/i, "TaskRabbit"],
  [/rover\.com|rover pay/i, "Rover"],
  [/airbnb/i, "Airbnb"],
  [/turo/i, "Turo"],
  [/payoneer/i, "Payoneer"],
  [/deel/i, "Deel"],
  [/google adsense|youtube/i, "YouTube/AdSense"],
  [/twitch/i, "Twitch"],
  [/patreon/i, "Patreon"],
  [/substack/i, "Substack"],
];

const EXCLUDE: [RegExp, string][] = [
  [/transfer|xfer|from sav|from chk|online banking trans/i, "Transfer between your accounts"],
  [/refund|return|reversal|credit adj|cashback|cash back/i, "Refund or reversal"],
  [/interest|dividend/i, "Interest"],
  [/payroll|dir dep|direct dep|salary/i, "Looks like W-2 payroll (tax already withheld)"],
  [/irs|treas 310|tax ref/i, "Tax refund"],
];

const MAYBE = /zelle|venmo|cash app|cashapp|check|mobile deposit|remote deposit|ach credit|wire/i;

function cleanSource(description: string): string {
  return description
    .replace(/\s+/g, " ")
    .replace(/\b(ppd|ccd|web) id:?.*$/i, "")
    .replace(/\b(des|indn|co id|id):.*$/i, "")
    .trim()
    .slice(0, 60);
}

export function classify(description: string): { kind: DepositKind; source: string; reason: string } {
  for (const [re, name] of PLATFORMS) {
    // A platform name inside a transfer/refund line is still a transfer/refund.
    if (re.test(description) && !/refund|reversal|return/i.test(description)) {
      return { kind: "platform", source: name, reason: `Known payer: ${name}` };
    }
  }
  for (const [re, reason] of EXCLUDE)
    if (re.test(description)) return { kind: "excluded", source: cleanSource(description), reason };
  if (MAYBE.test(description))
    return { kind: "maybe", source: cleanSource(description), reason: "Could be a client payment" };
  return { kind: "maybe", source: cleanSource(description), reason: "Unknown deposit" };
}

/* -------------------------------- main --------------------------------- */

export function importBankCsv(text: string, year: number): ImportResult {
  const rows = parseCsv(text);
  const layout = detectLayout(rows);
  if (!layout) {
    return {
      deposits: [],
      skippedOutflows: 0,
      bankFormat: "unknown",
      error: "Could not find date, description and amount columns.",
    };
  }
  const deposits: Deposit[] = [];
  let skippedOutflows = 0;
  for (const r of rows.slice(layout.start)) {
    const date = toIsoDate(r[layout.date] ?? "");
    const description = r[layout.description] ?? "";
    let amount: number | null = null;
    if (layout.amount !== undefined) amount = toAmount(r[layout.amount] ?? "");
    else {
      const credit = toAmount(r[layout.credit!] ?? "");
      const debit = layout.debit !== undefined ? toAmount(r[layout.debit] ?? "") : null;
      amount = credit && credit > 0 ? credit : debit ? -Math.abs(debit) : null;
    }
    if (!date || amount === null) continue;
    if (amount <= 0) {
      skippedOutflows++;
      continue;
    }
    const c = classify(description);
    const wrongYear = !date.startsWith(String(year));
    deposits.push({
      date,
      description,
      amount,
      kind: wrongYear ? "excluded" : c.kind,
      source: c.source,
      reason: wrongYear ? `Not tax year ${year}` : c.reason,
      include: !wrongYear && c.kind === "platform",
    });
  }
  deposits.sort((a, b) => a.date.localeCompare(b.date));
  return { deposits, skippedOutflows, bankFormat: layout.format };
}
