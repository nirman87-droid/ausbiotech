"use client";

import Link from "next/link";
import { useState } from "react";
import { useAutoField, useParticipant } from "@/components/participant/ParticipantProvider";

type Question = { id: string; text: string; type: "single" | "scale"; options: string[] };

function PollQuestion({
  q,
  index,
  server,
  open,
  onAnswer,
  showError,
}: {
  q: Question;
  index: number;
  server: string | null;
  open: boolean;
  onAnswer: (id: string, v: string) => void;
  showError: boolean;
}) {
  const { value, set, locked } = useAutoField<string | null>(
    `poll:${q.id}`,
    server,
    (v) => ({ kind: "poll.answer", id: q.id, value: v ?? "" }),
    true,
  );
  const disabled = locked || !open;
  const scale = q.type === "scale";
  return (
    <fieldset className="card p-4" aria-describedby={showError && !value ? `err-${q.id}` : undefined}>
      <legend className="text-lg font-semibold text-ink">
        <span className="mr-2 font-mono text-sm text-muted" aria-hidden="true">{index + 1}</span>
        {q.text}
      </legend>
      {scale && <p className="text-sm text-muted">1 means not at all, 5 means fully.</p>}
      <div className={`mt-3 grid gap-2 ${scale ? "grid-cols-5" : "sm:grid-cols-2"}`}>
        {q.options.map((o) => {
          const checked = value === o;
          return (
            <label
              key={o}
              className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-[10px] border px-3 py-2 has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-teal ${
                scale ? "justify-center font-semibold" : ""
              } ${checked ? "border-teal bg-tint text-ink" : "border-line bg-white hover:border-input"} ${disabled ? "cursor-not-allowed" : ""}`}
            >
              <input
                type="radio"
                name={`q-${q.id}`}
                value={o}
                checked={checked}
                disabled={disabled}
                onChange={() => {
                  set(o);
                  onAnswer(q.id, o);
                }}
                className={scale ? "sr-only" : "h-5 w-5 shrink-0 accent-teal"}
              />
              {o}
            </label>
          );
        })}
      </div>
      {showError && !value && (
        <p id={`err-${q.id}`} className="mt-2 text-sm text-warning">
          Please answer this question.
        </p>
      )}
    </fieldset>
  );
}

export function PollForm({
  questions,
  answers,
  open,
  nextHref,
  nextLabel,
}: {
  questions: Question[];
  answers: Record<string, string>;
  open: boolean;
  nextHref: string | null;
  nextLabel: string | null;
}) {
  const { queue } = useParticipant();
  const [local, setLocal] = useState<Record<string, string>>(answers);
  const [tried, setTried] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const merged = { ...answers, ...local };
  const missing = questions.filter((q) => !merged[q.id]).length;

  async function submit() {
    setTried(true);
    if (missing > 0) return;
    setSaving(true);
    await queue.flushNow();
    setSaving(false);
    setSubmitted(true);
  }

  return (
    <div className="grid gap-4">
      {!open && (
        <p className="notice" role="status">
          The poll is closed. These are the answers you gave.
        </p>
      )}
      {questions.map((q, i) => (
        <PollQuestion
          key={q.id}
          q={q}
          index={i}
          server={answers[q.id] ?? null}
          open={open}
          showError={tried}
          onAnswer={(id, v) => {
            setLocal((s) => ({ ...s, [id]: v }));
            setSubmitted(false);
          }}
        />
      ))}
      {open && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn" onClick={submit} disabled={saving}>
            {saving ? "Sending" : "Submit answers"}
          </button>
          <span role="status" aria-live="polite">
            {tried && missing > 0
              ? `Please answer ${missing === 1 ? "1 more question" : `${missing} more questions`}.`
              : submitted
                ? "Thank you. Your answers are in. You can change them while the poll is open."
                : ""}
          </span>
        </div>
      )}
      {submitted && nextHref && nextLabel && (
        <p>
          <Link className="btn btn-secondary" href={nextHref}>
            Go to {nextLabel}
          </Link>
        </p>
      )}
    </div>
  );
}
