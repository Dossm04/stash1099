"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { PLANS, PRO_FEATURES, loadPro, pricePerDay, savePro, type ProPlan, type ProStatus } from "@/lib/pro";
import { todayLocal } from "@/lib/tax/dates";

interface Gate {
  pro: ProStatus | null;
  /** True when the feature may run. Otherwise opens the paywall and returns false. */
  allow: (feature: string) => boolean;
  open: (feature?: string) => void;
}

const GateContext = createContext<Gate>({ pro: null, allow: () => true, open: () => {} });
export const useGate = () => useContext(GateContext);

/** Holds the (demo) Pro status for the whole site and shows the paywall when a Pro feature is used. */
export function ProGateProvider({ children }: { children: ReactNode }) {
  const [pro, setPro] = useState<ProStatus | null>(null);
  const [wall, setWall] = useState<{ feature?: string } | null>(null);
  useEffect(() => setPro(loadPro()), []);

  const gate = useMemo<Gate>(
    () => ({
      pro,
      allow: (feature) => {
        if (pro) return true;
        setWall({ feature });
        return false;
      },
      open: (feature) => setWall({ feature }),
    }),
    [pro],
  );

  return (
    <GateContext.Provider value={gate}>
      {children}
      {wall && (
        <Paywall
          feature={wall.feature}
          current={pro}
          onClose={() => setWall(null)}
          onActivate={(plan) => {
            const status = { plan, since: todayLocal() };
            savePro(status);
            setPro(status);
            setWall(null);
          }}
          onCancel={() => {
            savePro(null);
            setPro(null);
            setWall(null);
          }}
        />
      )}
    </GateContext.Provider>
  );
}

export function ProTag() {
  return (
    <span className="rounded-full bg-ink px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-bg">Pro</span>
  );
}

const usd2 = (n: number) => `$${n.toFixed(2)}`;

function Paywall({
  feature,
  current,
  onClose,
  onActivate,
  onCancel,
}: {
  feature?: string;
  current: ProStatus | null;
  onClose: () => void;
  onActivate: (plan: ProPlan["id"]) => void;
  onCancel: () => void;
}) {
  const [planId, setPlanId] = useState<ProPlan["id"]>("4w");
  const [step, setStep] = useState<"plans" | "checkout">("plans");
  const plan = PLANS.find((p) => p.id === planId)!;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Stash1099 Pro"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="animate-pop max-h-[94vh] w-full max-w-lg overflow-auto rounded-t-3xl bg-surface p-6 shadow-xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {current ? (
          <>
            <h2 className="text-xl font-bold">You are on Pro (demo)</h2>
            <p className="mt-2 text-sm text-muted">
              {PLANS.find((p) => p.id === current.plan)?.label} plan, activated {current.since}. This is a hackathon
              demo: nothing was charged.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button onClick={onClose} className="rounded-xl bg-brand px-5 py-3 font-semibold text-brand-ink">
                Keep Pro
              </button>
              <button onClick={onCancel} className="rounded-xl border border-line px-5 py-3 font-semibold">
                Switch back to Free
              </button>
            </div>
          </>
        ) : step === "plans" ? (
          <>
            <p className="text-sm font-semibold text-brand">
              {feature ? `${feature} is part of Pro` : "Stash1099 Pro"}
            </p>
            <h2 className="mt-1 text-2xl font-bold leading-tight">Your payroll department for one</h2>
            <p className="mt-1 text-sm text-muted">Free shows you the numbers. Pro keeps you on plan every week.</p>
            <ul className="mt-4 space-y-2 text-sm">
              {PRO_FEATURES.map(([name, text]) => (
                <li key={name} className="flex gap-2">
                  <span className="mt-0.5 text-brand">✓</span>
                  <span>
                    <b>{name}.</b> <span className="text-muted">{text}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-5 space-y-2" role="radiogroup" aria-label="Choose a plan">
              {PLANS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={planId === p.id}
                  onClick={() => setPlanId(p.id)}
                  className={`flex w-full items-center justify-between rounded-2xl border-2 px-4 py-3 text-left transition ${
                    planId === p.id ? "border-brand bg-brand-soft" : "border-line"
                  }`}
                >
                  <span>
                    <span className="font-semibold">{p.label}</span>
                    {p.badge && (
                      <span className="ml-2 rounded-full bg-brand px-2 py-0.5 text-xs font-semibold text-brand-ink">
                        {p.badge}
                      </span>
                    )}
                    <span className="tnum block text-sm text-muted">{usd2(p.price)} total</span>
                  </span>
                  <span className="tnum text-right">
                    <span className="text-xl font-bold">{usd2(pricePerDay(p))}</span>
                    <span className="block text-xs text-muted">per day</span>
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-center text-xs text-muted">30-day money-back guarantee · Cancel anytime</p>
            <button
              onClick={() => setStep("checkout")}
              className="mt-4 w-full rounded-xl bg-brand px-5 py-3.5 font-semibold text-brand-ink"
            >
              Get my plan
            </button>
            <button onClick={onClose} className="mt-2 w-full rounded-xl px-5 py-2.5 text-sm font-medium text-muted">
              Not now, continue with Free
            </button>
          </>
        ) : (
          <>
            <h2 className="text-xl font-bold">Demo checkout</h2>
            <div className="mt-3 flex items-center justify-between rounded-2xl bg-surface-2 px-4 py-3">
              <span className="font-semibold">Stash1099 Pro · {plan.label}</span>
              <span className="tnum font-bold">{usd2(plan.price)}</span>
            </div>
            <p className="mt-3 rounded-xl border border-warn/40 bg-warn-soft p-3 text-sm">
              <b>Hackathon demo.</b> No card is needed and nothing is charged. In the real product this step is a Stripe
              checkout; here it simply unlocks Pro in this browser so you can try everything.
            </p>
            <button
              onClick={() => onActivate(plan.id)}
              className="mt-4 w-full rounded-xl bg-brand px-5 py-3.5 font-semibold text-brand-ink"
            >
              Activate Pro (demo)
            </button>
            <button
              onClick={() => setStep("plans")}
              className="mt-2 w-full rounded-xl px-5 py-2.5 text-sm font-medium text-muted"
            >
              Back to plans
            </button>
          </>
        )}
      </div>
    </div>
  );
}
