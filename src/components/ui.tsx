"use client";

import { useEffect, useState, type ReactNode } from "react";

export const usd = (n: number, cents = false) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });

export const pct = (n: number, digits = 1) => `${(n * 100).toFixed(digits)}%`;

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-line bg-surface p-5 ${className}`}>{children}</div>;
}

export function Step({
  n,
  title,
  hint,
  children,
}: {
  n: number;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <div className="mb-4 flex items-start gap-3">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand">
          {n}
        </span>
        <div>
          <h2 className="font-semibold">{title}</h2>
          {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
        </div>
      </div>
      {children}
    </Card>
  );
}

/** Number input that lets the field be empty while typing and never emits NaN. */
export function MoneyField({
  label,
  value,
  onChange,
  prefix = "$",
  suffix,
  hint,
  placeholder = "0",
  nullable = false,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  prefix?: string;
  suffix?: string;
  hint?: string;
  placeholder?: string;
  nullable?: boolean;
}) {
  const [text, setText] = useState(value == null || value === 0 ? "" : String(value));
  useEffect(() => {
    const parsed = text === "" ? (nullable ? null : 0) : Number(text.replace(/,/g, ""));
    if (parsed !== value) setText(value == null || value === 0 ? "" : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <div className="mt-1 flex items-center rounded-xl border border-line bg-surface-2 px-3 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
        {prefix && <span className="text-muted">{prefix}</span>}
        <input
          inputMode="decimal"
          className="tnum w-full bg-transparent px-1.5 py-2.5 outline-none"
          value={text}
          placeholder={placeholder}
          onChange={(e) => {
            const t = e.target.value.replace(/[^\d.,]/g, "");
            setText(t);
            const n = Number(t.replace(/,/g, ""));
            if (t === "") onChange(nullable ? null : 0);
            else if (Number.isFinite(n)) onChange(n);
          }}
        />
        {suffix && <span className="text-sm text-muted">{suffix}</span>}
      </div>
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-xl bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
            value === o.value ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "default" | "brand" | "warn" | "danger";
}) {
  const tones = {
    default: "bg-surface-2",
    brand: "bg-brand-soft",
    warn: "bg-warn-soft",
    danger: "bg-danger-soft",
  };
  const ink = { default: "text-ink", brand: "text-brand", warn: "text-warn", danger: "text-danger" };
  return (
    <div className={`rounded-xl p-4 ${tones[tone]}`}>
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className={`tnum mt-1 text-2xl font-semibold ${ink[tone]}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}
