"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { FREQUENCIES, PROBLEM_TYPES, PROBLEM_TYPE_INFO, type ProblemType } from "@/lib/copy";
import { PROBLEM_LIMITS, titleError } from "@/lib/rules";
import { useAutoField, useParticipant, useMarker } from "@/components/participant/ParticipantProvider";
import { AutoSelect, AutoText } from "@/components/participant/fields";
import { AiSuggestion } from "@/components/participant/AiSuggestion";

type Problem = {
  id: string;
  position: number;
  title: string;
  today_state: string | null;
  future_state: string | null;
  type: string | null;
  affected_role: string | null;
  frequency: string | null;
};

type TypeSetter = (t: ProblemType) => void;

function TypeField({ p, register }: { p: Problem; register: (id: string, set: TypeSetter | null) => void }) {
  const key = `problem:${p.id}:type`;
  const { value, set, focus, locked } = useAutoField<string | null>(
    key,
    p.type,
    (v) => ({ kind: "problem.set", id: p.id, field: "type", value: v }),
    true,
  );
  const who = useMarker(key);
  useEffect(() => {
    register(p.id, (t) => set(t));
    return () => register(p.id, null);
  });
  const id = `type-${p.id}`;
  return (
    <div>
      <label htmlFor={id} className="field-label">
        Type of problem
        {who && <span className="pill pill-teal ml-2 text-xs">{who} is editing</span>}
      </label>
      <select id={id} className="input" value={value ?? ""} disabled={locked} onChange={(e) => set(e.target.value || null)} {...focus}>
        <option value="">Choose one, or tap a prompt in the guide</option>
        {PROBLEM_TYPES.map((t) => (
          <option key={t} value={t}>
            {PROBLEM_TYPE_INFO[t].label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ProblemCard({
  p,
  index,
  canDelete,
  aiEnabled,
  showErrors,
  onDelete,
  onActive,
  register,
}: {
  p: Problem;
  index: number;
  canDelete: boolean;
  aiEnabled: boolean;
  showErrors: boolean;
  onDelete: () => void;
  onActive: () => void;
  register: (id: string, set: TypeSetter | null) => void;
}) {
  const { queue, locked } = useParticipant();
  const set = (field: string) => (value: unknown) => ({ kind: "problem.set", id: p.id, field, value });
  const titleKey = `problem:${p.id}:title`;
  return (
    <article className="card p-4 sm:p-5" aria-labelledby={`p-${p.id}-h`} onFocus={onActive}>
      <div className="flex items-center justify-between gap-2">
        <h2 id={`p-${p.id}-h`} className="text-xl font-semibold">
          Problem {index + 1}
        </h2>
        {canDelete && !locked && (
          <button type="button" className="btn btn-danger btn-small" onClick={onDelete}>
            Remove<span className="sr-only"> problem {index + 1}</span>
          </button>
        )}
      </div>
      <div className="mt-4 grid gap-4">
        <AutoText
          opKey={titleKey}
          server={p.title}
          toOp={set("title")}
          label="In one sentence, what is the problem?"
          hint={`Between ${PROBLEM_LIMITS.titleMin} and ${PROBLEM_LIMITS.titleMax} characters.`}
          validate={titleError}
          showValidation={showErrors}
          maxLength={PROBLEM_LIMITS.titleMax}
          showCount
          required
        />
        <div className="grid gap-4 md:grid-cols-2">
          <AutoText
            opKey={`problem:${p.id}:today_state`}
            server={p.today_state ?? ""}
            toOp={set("today_state")}
            label="What happens today?"
            maxLength={2000}
            multiline
          />
          <AutoText
            opKey={`problem:${p.id}:future_state`}
            server={p.future_state ?? ""}
            toOp={set("future_state")}
            label="What would good look like?"
            maxLength={2000}
            multiline
          />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <TypeField p={p} register={register} />
          <AutoText
            opKey={`problem:${p.id}:affected_role`}
            server={p.affected_role ?? ""}
            toOp={set("affected_role")}
            label="Who does this work?"
            maxLength={120}
            placeholder="For example, QA officer"
          />
          <AutoSelect
            opKey={`problem:${p.id}:frequency`}
            server={p.frequency}
            toOp={set("frequency")}
            label="How often?"
            options={FREQUENCIES.map((f) => ({ value: f, label: f }))}
          />
        </div>
        {aiEnabled && !locked && (
          <AiSuggestion
            kind="sharpen"
            problemId={p.id}
            buttonLabel="Sharpen with AI"
            onAccept={(s) => {
              if (s.title) queue.set(titleKey, { kind: "problem.set", id: p.id, field: "title", value: s.title.slice(0, 150) }, true);
              if (s.today_state)
                queue.set(`problem:${p.id}:today_state`, { kind: "problem.set", id: p.id, field: "today_state", value: s.today_state }, true);
              if (s.future_state)
                queue.set(`problem:${p.id}:future_state`, { kind: "problem.set", id: p.id, field: "future_state", value: s.future_state }, true);
            }}
          />
        )}
      </div>
    </article>
  );
}

export function ProblemsBoard({
  problems,
  aiEnabled,
  shortlistHref,
}: {
  problems: Problem[];
  aiEnabled: boolean;
  shortlistHref: string | null;
}) {
  const { queue, locked } = useParticipant();
  const [created, setCreated] = useState<Problem[]>([]);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);
  const setters = useRef(new Map<string, TypeSetter>());
  const register = (id: string, set: TypeSetter | null) => {
    if (set) setters.current.set(id, set);
    else setters.current.delete(id);
  };

  // Server list plus problems created here that the server has not sent back yet.
  const list = useMemo(() => {
    const serverIds = new Set(problems.map((p) => p.id));
    return [...problems, ...created.filter((c) => !serverIds.has(c.id))]
      .filter((p) => !removed.has(p.id))
      .sort((a, b) => a.position - b.position);
  }, [problems, created, removed]);

  const active = list.find((p) => p.id === activeId) ?? list.find((p) => !p.type) ?? list[0];

  function add() {
    if (list.length >= PROBLEM_LIMITS.max) return;
    const id = crypto.randomUUID();
    const position = Math.max(0, ...list.map((p) => p.position)) + 1;
    queue.set(`problem.create:${id}`, { kind: "problem.create", id, position }, true);
    setCreated((c) => [
      ...c,
      { id, position, title: "", today_state: null, future_state: null, type: null, affected_role: null, frequency: null },
    ]);
    setActiveId(id);
    setTimeout(() => document.getElementById(`p-${id}-h`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  function remove(p: Problem, index: number) {
    if (!window.confirm(`Remove problem ${index + 1}? Your team will lose what is written in it.`)) return;
    queue.set(`problem.delete:${p.id}`, { kind: "problem.delete", id: p.id }, true);
    setRemoved((s) => new Set(s).add(p.id));
  }

  async function finish() {
    setShowErrors(true);
    const bad = list.filter((p) => {
      const t = (queue.pendingValue(`problem:${p.id}:title`)?.value as string | undefined) ?? p.title;
      return titleError(t);
    });
    if (list.length < PROBLEM_LIMITS.min) {
      setDoneMsg("Add at least one problem.");
      return;
    }
    if (bad.length) {
      setDoneMsg("Each problem needs a sentence of at least 10 characters.");
      return;
    }
    await queue.flushNow();
    setDoneMsg(
      shortlistHref ? null : "Nice work. Your facilitator will open the next stage soon. You can keep improving your problems.",
    );
    if (shortlistHref) window.location.assign(shortlistHref);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="grid gap-5">
        {list.length === 0 && (
          <div className="card p-6 text-center">
            <p className="text-lg">No problems yet. Start with the messiest one.</p>
            {!locked && (
              <button type="button" className="btn mt-4" onClick={add}>
                Add your first problem
              </button>
            )}
          </div>
        )}
        {list.map((p, i) => (
          <ProblemCard
            key={p.id}
            p={p}
            index={i}
            canDelete={list.length > 1}
            aiEnabled={aiEnabled}
            showErrors={showErrors}
            onDelete={() => remove(p, i)}
            onActive={() => setActiveId(p.id)}
            register={register}
          />
        ))}
        {!locked && list.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            {list.length < PROBLEM_LIMITS.max ? (
              <button type="button" className="btn btn-secondary" onClick={add}>
                Add another problem
              </button>
            ) : (
              <p className="text-muted">You have added the most problems allowed ({PROBLEM_LIMITS.max}).</p>
            )}
            <button type="button" className="btn" onClick={finish}>
              {shortlistHref ? "Continue to shortlist" : "We are done"}
            </button>
          </div>
        )}
        {doneMsg && (
          <p className={`notice ${showErrors && doneMsg.startsWith("Each") ? "notice-warning" : ""}`} role="status">
            {doneMsg}
          </p>
        )}
        {locked && shortlistHref && (
          <p>
            <Link className="btn" href={shortlistHref}>
              Go to shortlist
            </Link>
          </p>
        )}
      </div>

      <aside aria-labelledby="guide-title" className="h-fit lg:sticky lg:top-4">
        <div className="card p-4">
          <h2 id="guide-title" className="text-lg font-semibold">
            Discovery guide
          </h2>
          <p className="mt-1 text-sm">
            Does one of these sound familiar? Tap it to set the type for{" "}
            <strong>{active ? `problem ${list.indexOf(active) + 1}` : "your problem"}</strong>.
          </p>
          <ul className="mt-3 grid gap-2">
            {PROBLEM_TYPES.map((t) => {
              const selected = active?.type === t;
              return (
                <li key={t}>
                  <button
                    type="button"
                    disabled={!active || locked}
                    aria-pressed={selected}
                    onClick={() => active && setters.current.get(active.id)?.(t)}
                    className={`w-full rounded-[10px] border p-3 text-left disabled:cursor-not-allowed ${
                      selected ? "border-teal bg-tint" : "border-line bg-white hover:border-teal"
                    }`}
                  >
                    <span className="block font-semibold text-ink">{PROBLEM_TYPE_INFO[t].label}</span>
                    <span className="block text-sm text-muted">{PROBLEM_TYPE_INFO[t].prompt}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>
    </div>
  );
}
