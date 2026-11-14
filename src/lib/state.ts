import type { TaxInput } from "./tax/engine";
import type { StashDeposit } from "./stash";

/** Everything the user enters, minus "today" (which is always computed live). */
export type PlanState = Omit<TaxInput, "asOf"> & {
  /** Transfers the user made into a separate tax savings account. */
  stashDeposits: StashDeposit[];
  /** What is in the checking account right now (optional, never leaves the browser). */
  checkingBalance: number | null;
  /** Rent and bills that must be paid before the next payout (optional; makes safe-to-spend stricter). */
  billsDue: number;
};

export const EMPTY_STATE: PlanState = {
  filingStatus: "single",
  payments: [],
  expectedRestOfYear: null,
  businessExpenses: 0,
  businessMiles: 0,
  qualifiedTips: 0,
  w2Wages: 0,
  w2Withholding: 0,
  stateRate: 0,
  priorYearTax: null,
  priorYearAgiOver150k: false,
  kidsUnder17: 0,
  estimatedPayments: [],
  stashDeposits: [],
  checkingBalance: null,
  billsDue: 0,
};

/** Demo persona: Maya, 31, Austin TX — freelance UX designer who also delivers for DoorDash. */
export const MAYA_STATE: PlanState = {
  ...EMPTY_STATE,
  payments: [
    { id: "m1", date: "2026-01-09", source: "Upwork – Brightline UX audit", amount: 4200 },
    { id: "m2", date: "2026-01-31", source: "DoorDash weekly payouts (Jan)", amount: 1180 },
    { id: "m3", date: "2026-02-20", source: "Upwork – Nimbus onboarding flow", amount: 5600 },
    { id: "m4", date: "2026-02-28", source: "DoorDash weekly payouts (Feb)", amount: 960 },
    { id: "m5", date: "2026-03-27", source: "Direct client – Cedar Dental site", amount: 3800 },
    { id: "m6", date: "2026-04-30", source: "DoorDash weekly payouts (Apr)", amount: 1340 },
    { id: "m7", date: "2026-05-15", source: "Upwork – Fintech dashboard", amount: 7200 },
    { id: "m8", date: "2026-06-12", source: "Direct client – Cedar Dental retainer", amount: 2400 },
    { id: "m9", date: "2026-07-24", source: "Upwork – Mobile redesign sprint", amount: 6500 },
    { id: "m10", date: "2026-07-31", source: "DoorDash weekly payouts (Jul)", amount: 1420 },
    { id: "m11", date: "2026-08-28", source: "Direct client – Cedar Dental retainer", amount: 2400 },
    { id: "m12", date: "2026-09-18", source: "Upwork – SaaS pricing page", amount: 4800 },
    { id: "m13", date: "2026-10-16", source: "Upwork – Design system audit", amount: 5900 },
    { id: "m14", date: "2026-10-31", source: "DoorDash weekly payouts (Oct)", amount: 1510 },
    { id: "m15", date: "2026-11-06", source: "Direct client – Cedar Dental retainer", amount: 2400 },
  ],
  businessExpenses: 3400,
  businessMiles: 4800,
  qualifiedTips: 2900,
  stateRate: 0,
  priorYearTax: 6200,
  estimatedPayments: [{ id: "e1", date: "2026-04-14", amount: 2000 }],
  stashDeposits: [
    { id: "s1", date: "2026-01-10", amount: 800 },
    { id: "s2", date: "2026-02-21", amount: 1200 },
    { id: "s3", date: "2026-05-16", amount: 1000 },
  ],
  checkingBalance: 4200,
};

const STORAGE_KEY = "stash1099:v1";

export function saveLocal(state: PlanState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable (private mode) — app still works in memory */
  }
}

export function loadLocal(): PlanState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? sanitize(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function encodeShare(state: PlanState): string {
  const json = JSON.stringify(state);
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeShare(code: string): PlanState | null {
  try {
    const b64 = code.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return sanitize(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}

const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, v) : d);
const str = (v: unknown, d = "") => (typeof v === "string" ? v.slice(0, 120) : d);
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Never trust a shared link or old storage blindly. */
export function sanitize(raw: unknown): PlanState | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const fs = r.filingStatus === "mfj" || r.filingStatus === "hoh" ? r.filingStatus : "single";
  const list = (v: unknown) => (Array.isArray(v) ? v.slice(0, 500) : []);
  return {
    filingStatus: fs,
    payments: list(r.payments)
      .filter((p) => p && isDate(p.date) && num(p.amount) > 0)
      .map((p, i) => ({
        id: str(p.id, `p${i}`),
        date: p.date,
        source: str(p.source, "Client"),
        amount: num(p.amount),
      })),
    expectedRestOfYear: r.expectedRestOfYear == null ? null : num(r.expectedRestOfYear),
    businessExpenses: num(r.businessExpenses),
    businessMiles: num(r.businessMiles),
    qualifiedTips: num(r.qualifiedTips),
    w2Wages: num(r.w2Wages),
    w2Withholding: num(r.w2Withholding),
    stateRate: Math.min(0.15, num(r.stateRate)),
    priorYearTax: r.priorYearTax == null ? null : num(r.priorYearTax),
    priorYearAgiOver150k: r.priorYearAgiOver150k === true,
    kidsUnder17: Math.min(10, Math.floor(num(r.kidsUnder17))),
    billsDue: num(r.billsDue),
    estimatedPayments: list(r.estimatedPayments)
      .filter((p) => p && isDate(p.date) && num(p.amount) > 0)
      .map((p, i) => ({
        id: str(p.id, `e${i}`),
        date: p.date,
        amount: num(p.amount),
        ...(p.fromChecking === true ? { fromChecking: true } : {}),
      })),
    checkingBalance: r.checkingBalance == null ? null : num(r.checkingBalance),
    stashDeposits: list(r.stashDeposits)
      .filter((p) => p && isDate(p.date) && num(p.amount) > 0)
      .map((p, i) => ({ id: str(p.id, `s${i}`), date: p.date, amount: num(p.amount) })),
  };
}
