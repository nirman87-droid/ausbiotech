"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { groupSmallOptions, POLL_MIN_RESPONSES } from "@/lib/rules";
import { eventControl } from "@/lib/actions/console-live";

type Q = { id: string; text: string; type: "single" | "scale"; counts: { option: string; count: number }[]; total: number };

// A3: projector view. Counts only, never names, and nothing until 5 people have answered.
export function PollScreen({ slug, questions, pollOpen, isAdmin }: { slug: string; questions: Q[]; pollOpen: boolean; isAdmin: boolean }) {
  const [index, setIndex] = useState(0);
  const [group, setGroup] = useState(false);
  const [full, setFull] = useState(false);
  const [pending, start] = useTransition();
  const stage = useRef<HTMLDivElement>(null);
  const q = questions[Math.min(index, questions.length - 1)];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,select,textarea")) return;
      if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, questions.length - 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    };
    const onFs = () => setFull(Boolean(document.fullscreenElement));
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFs);
    };
  }, [questions.length]);

  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else stage.current?.requestFullscreen?.();
  };

  if (!q) return <p className="notice">There are no poll questions. Add them in Setup.</p>;
  const counts = group && q.type === "single" ? groupSmallOptions(q.counts) : q.counts;
  const max = Math.max(1, ...counts.map((c) => c.count));
  const hidden = q.total < POLL_MIN_RESPONSES;

  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        {isAdmin && (
          <button className="btn" disabled={pending} onClick={() => start(async () => { await eventControl({ slug, action: "poll_open", open: !pollOpen }); })}>
            {pollOpen ? "Close poll" : "Open poll"}
          </button>
        )}
        <span className={`pill ${pollOpen ? "pill-success" : ""}`}>{pollOpen ? "Poll open" : "Poll closed"}</span>
        <div className="ml-2 flex items-center gap-2">
          <input id="group" type="checkbox" className="h-5 w-5 accent-teal" checked={group} onChange={(e) => setGroup(e.target.checked)} />
          <label htmlFor="group">Group small options as Other</label>
        </div>
        <button className="btn btn-secondary ml-auto" onClick={toggleFull}>Full screen</button>
      </div>

      <div ref={stage} className={`bg-white ${full ? "flex h-screen flex-col justify-center p-[5vw]" : "card p-8"}`}>
        <p className="font-mono text-lg text-muted">Question {index + 1} of {questions.length}</p>
        <h1 className={`mt-2 font-semibold text-ink ${full ? "text-[3.2vw] leading-tight" : "text-4xl"}`}>{q.text}</h1>
        {hidden ? (
          <p className={`mt-10 text-muted ${full ? "text-[2vw]" : "text-2xl"}`} role="status">
            Results appear after {POLL_MIN_RESPONSES} answers. {q.total} so far.
          </p>
        ) : (
          <ul className="mt-8 grid gap-4" aria-label="Results">
            {counts.map((c) => (
              <li key={c.option} className="grid grid-cols-[minmax(120px,28%)_1fr_auto] items-center gap-4">
                <span className={`font-medium text-ink ${full ? "text-[1.8vw]" : "text-2xl"}`}>{q.type === "scale" ? `${c.option}` : c.option}</span>
                <span className="h-12 overflow-hidden rounded-[8px] bg-tint" aria-hidden="true">
                  <span className="block h-full rounded-[8px] bg-teal transition-all duration-500" style={{ width: `${(c.count / max) * 100}%` }} />
                </span>
                <span className={`font-mono text-ink tabular-nums ${full ? "text-[1.8vw]" : "text-2xl"}`}>{c.count}</span>
              </li>
            ))}
          </ul>
        )}
        {!hidden && <p className="mt-6 text-lg text-muted">{q.total} answers</p>}
        <div className="no-print mt-8 flex gap-2">
          <button className="btn btn-secondary" disabled={index === 0} onClick={() => setIndex(index - 1)}>Previous question</button>
          <button className="btn btn-secondary" disabled={index >= questions.length - 1} onClick={() => setIndex(index + 1)}>Next question</button>
        </div>
      </div>
    </div>
  );
}
