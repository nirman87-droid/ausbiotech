"use client";

import { useId } from "react";
import type { QueuedOp } from "@/lib/client/save-queue";
import { useAutoField, useMarker } from "./ParticipantProvider";

// Autosaved inputs for participant screens. Each one is a real labelled control.

type Base<T> = {
  opKey: string;
  server: T;
  toOp: (v: T) => QueuedOp;
  label: string;
  hint?: string;
  error?: string | null;
  className?: string;
  required?: boolean;
};

export function EditingBadge({ opKey }: { opKey: string }) {
  const who = useMarker(opKey);
  if (!who) return null;
  return (
    <span className="pill pill-teal ml-2 align-middle text-xs" role="status">
      {who} is editing
    </span>
  );
}

function LabelRow({ id, label, required, opKey }: { id: string; label: string; required?: boolean; opKey: string }) {
  return (
    <label htmlFor={id} className="field-label">
      {label}
      {required && <span className="ml-1 font-normal text-muted">(required)</span>}
      <EditingBadge opKey={opKey} />
    </label>
  );
}

export function AutoText({
  multiline,
  maxLength,
  placeholder,
  showCount,
  validate,
  showValidation,
  ...p
}: Base<string> & {
  multiline?: boolean;
  maxLength?: number;
  placeholder?: string;
  showCount?: boolean;
  validate?: (v: string) => string | null;
  showValidation?: boolean;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const { value, set, focus, locked } = useAutoField(p.opKey, p.server ?? "", p.toOp);
  const error = p.error ?? (validate && showValidation ? validate(value ?? "") : null);
  const common = {
    id,
    value: value ?? "",
    maxLength,
    placeholder,
    disabled: locked,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": p.hint || error || showCount ? hintId : undefined,
    className: "input",
    ...focus,
  };
  return (
    <div className={p.className}>
      <LabelRow id={id} label={p.label} required={p.required} opKey={p.opKey} />
      {multiline ? (
        <textarea {...common} rows={3} onChange={(e) => set(e.target.value)} />
      ) : (
        <input {...common} type="text" onChange={(e) => set(e.target.value)} />
      )}
      {(p.hint || error || showCount) && (
        <span id={hintId} className={`field-hint ${error ? "text-warning" : ""}`}>
          {error ?? p.hint}
          {showCount && maxLength ? (
            <span className="float-right font-mono text-xs">
              {(value ?? "").length}/{maxLength}
            </span>
          ) : null}
        </span>
      )}
    </div>
  );
}

export function AutoSelect({
  options,
  emptyLabel = "Choose one",
  ...p
}: Base<string | null> & { options: readonly { value: string; label: string }[]; emptyLabel?: string }) {
  const id = useId();
  const { value, set, focus, locked } = useAutoField<string | null>(p.opKey, p.server ?? null, p.toOp, true);
  return (
    <div className={p.className}>
      <LabelRow id={id} label={p.label} required={p.required} opKey={p.opKey} />
      <select
        id={id}
        className="input"
        value={value ?? ""}
        disabled={locked}
        aria-describedby={p.hint ? `${id}-hint` : undefined}
        onChange={(e) => set(e.target.value || null)}
        {...focus}
      >
        <option value="">{emptyLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {p.hint && (
        <span id={`${id}-hint`} className="field-hint">
          {p.hint}
        </span>
      )}
    </div>
  );
}

export function AutoCheckbox({ ...p }: Base<boolean>) {
  const id = useId();
  const { value, set, focus, locked } = useAutoField<boolean>(p.opKey, Boolean(p.server), p.toOp, true);
  return (
    <div className={`flex items-start gap-3 ${p.className ?? ""}`}>
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 h-6 w-6 shrink-0 accent-teal"
        checked={Boolean(value)}
        disabled={locked}
        aria-describedby={p.hint ? `${id}-hint` : undefined}
        onChange={(e) => set(e.target.checked)}
        {...focus}
      />
      <div>
        <label htmlFor={id} className="font-medium text-ink">
          {p.label}
        </label>
        <EditingBadge opKey={p.opKey} />
        {p.hint && (
          <span id={`${id}-hint`} className="field-hint">
            {p.hint}
          </span>
        )}
      </div>
    </div>
  );
}

// A row of 1 to 5 buttons that behaves as a radio group.
export function SegmentedControl({
  label,
  labels,
  value,
  onChange,
  disabled,
  focus,
  badge,
  className,
}: {
  label: string;
  labels: Record<number, string>;
  value: number | null;
  onChange: (n: number) => void;
  disabled?: boolean;
  focus?: { onFocus: () => void; onBlur: () => void };
  badge?: React.ReactNode;
  className?: string;
}) {
  const name = useId();
  return (
    <fieldset className={className}>
      <legend className="field-label">
        {label}
        {badge}
      </legend>
      <div className="grid grid-cols-5 gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => {
          const checked = value === n;
          return (
            <label
              key={n}
              className={`flex min-h-[44px] cursor-pointer items-center justify-center rounded-[8px] border text-base font-semibold has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-teal ${
                checked ? "border-teal bg-teal text-white" : "border-input bg-white text-ink hover:bg-tint"
              } ${disabled ? "cursor-not-allowed opacity-70" : ""}`}
              title={labels[n]}
            >
              <input
                type="radio"
                name={name}
                value={n}
                checked={checked}
                disabled={disabled}
                onChange={() => onChange(n)}
                className="sr-only"
                aria-label={`${n}: ${labels[n]}`}
                {...focus}
              />
              {n}
            </label>
          );
        })}
      </div>
      <p className="field-hint flex justify-between gap-2">
        <span>1: {labels[1]}</span>
        <span>5: {labels[5]}</span>
      </p>
    </fieldset>
  );
}

export function AutoSegmented({ labels, ...p }: Base<number | null> & { labels: Record<number, string> }) {
  const { value, set, focus, locked } = useAutoField<number | null>(p.opKey, p.server ?? null, p.toOp, true);
  return (
    <SegmentedControl
      label={p.label}
      labels={labels}
      value={value}
      onChange={set}
      disabled={locked}
      focus={focus}
      badge={<EditingBadge opKey={p.opKey} />}
      className={p.className}
    />
  );
}

export function AutoRadioCards({
  options,
  ...p
}: Base<string | null> & { options: readonly { value: string; label: string; hint?: string }[] }) {
  const name = useId();
  const { value, set, focus, locked } = useAutoField<string | null>(p.opKey, p.server ?? null, p.toOp, true);
  return (
    <fieldset className={p.className}>
      <legend className="field-label">
        {p.label}
        {p.required && <span className="ml-1 font-normal text-muted">(required)</span>}
        <EditingBadge opKey={p.opKey} />
      </legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((o) => {
          const checked = value === o.value;
          return (
            <label
              key={o.value}
              className={`flex min-h-[44px] cursor-pointer items-start gap-3 rounded-[10px] border p-3 has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-teal ${
                checked ? "border-teal bg-tint" : "border-line bg-white hover:border-input"
              }`}
            >
              <input
                type="radio"
                name={name}
                value={o.value}
                checked={checked}
                disabled={locked}
                onChange={() => set(o.value)}
                className="mt-1 h-5 w-5 shrink-0 accent-teal"
                {...focus}
              />
              <span>
                <span className="block font-semibold text-ink">{o.label}</span>
                {o.hint && <span className="block text-sm text-muted">{o.hint}</span>}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

// Presentational text input for forms that need the values themselves (for a meter).
export function TextControl({
  label,
  value,
  onChange,
  focus,
  disabled,
  multiline,
  maxLength,
  required,
  hint,
  opKey,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  focus?: { onFocus: () => void; onBlur: () => void };
  disabled?: boolean;
  multiline?: boolean;
  maxLength?: number;
  required?: boolean;
  hint?: string;
  opKey: string;
  placeholder?: string;
}) {
  const id = useId();
  const common = {
    id,
    value,
    maxLength,
    disabled,
    placeholder,
    className: "input",
    "aria-describedby": hint ? `${id}-hint` : undefined,
    ...focus,
  };
  return (
    <div>
      <LabelRow id={id} label={label} required={required} opKey={opKey} />
      {multiline ? (
        <textarea {...common} rows={3} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input {...common} type="text" onChange={(e) => onChange(e.target.value)} />
      )}
      {hint && (
        <span id={`${id}-hint`} className="field-hint">
          {hint}
        </span>
      )}
    </div>
  );
}
