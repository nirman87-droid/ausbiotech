"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CHOICES_NEEDING_CONSENT, CONSENT_TEXT, NEXT_CHOICES, NEXT_CHOICE_LABELS, START_TIMINGS, type NextChoice } from "@/lib/copy";
import { useAutoField, useParticipant } from "@/components/participant/ParticipantProvider";
import { AutoSelect, AutoText, EditingBadge } from "@/components/participant/fields";
import { submitNextSteps } from "@/lib/actions/participant";

export function NextStepsForm({
  choice,
  startTiming,
  extraContact,
  consent,
  submittedAt,
  doneHref,
}: {
  choice: string | null;
  startTiming: string | null;
  extraContact: string | null;
  consent: boolean;
  submittedAt: string | null;
  doneHref: string;
}) {
  const router = useRouter();
  const { queue } = useParticipant();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const pick = useAutoField<string | null>("next:choice", choice, (v) => ({ kind: "next.set", field: "choice", value: v }), true);
  const agree = useAutoField<boolean>("person:marketing_consent", consent, (v) => ({ kind: "person.set", field: "marketing_consent", value: v }), true);

  const needsConsent = pick.value ? CHOICES_NEEDING_CONSENT.includes(pick.value as NextChoice) : false;
  const canFinish = Boolean(pick.value) && (!needsConsent || agree.value);

  const finish = () =>
    start(async () => {
      setError(null);
      if (!(await queue.flushNow())) {
        setError("We could not save your changes yet. Check your connection and try again.");
        return;
      }
      const r = await submitNextSteps();
      if (r.ok) router.push(doneHref);
      else setError(r.error);
    });

  return (
    <div className="grid max-w-3xl gap-6">
      <fieldset>
        <legend className="field-label text-lg">
          What would you like to happen next? <span className="font-normal text-muted">(required)</span>
          <EditingBadge opKey="next:choice" />
        </legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {NEXT_CHOICES.map((c) => {
            const checked = pick.value === c;
            return (
              <label key={c}
                className={`flex min-h-[44px] cursor-pointer items-start gap-3 rounded-[10px] border p-3 has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-teal ${
                  checked ? "border-teal bg-tint" : "border-line bg-white hover:border-input"}`}>
                <input type="radio" name="next-choice" value={c} checked={checked} disabled={pick.locked}
                  onChange={() => pick.set(c)} className="mt-1 h-5 w-5 shrink-0 accent-teal" {...pick.focus} />
                <span>
                  <span className="block font-semibold text-ink">{NEXT_CHOICE_LABELS[c].label}</span>
                  <span className="block text-sm text-muted">{NEXT_CHOICE_LABELS[c].hint}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <AutoSelect opKey="next:start_timing" server={startTiming}
          toOp={(v) => ({ kind: "next.set", field: "start_timing", value: v })}
          label="When could you start?" options={START_TIMINGS.map((s) => ({ value: s, label: s }))} />
        <AutoText opKey="next:extra_contact" server={extraContact ?? ""}
          toOp={(v) => ({ kind: "next.set", field: "extra_contact", value: v })}
          label="Anyone else we should include?" hint="Optional. A name and email." maxLength={300} />
      </div>

      <section className="card p-4" aria-labelledby="consent-title">
        <h2 id="consent-title" className="text-lg font-semibold">Can we contact you?</h2>
        <div className="mt-3 flex items-start gap-3">
          <input id="consent" type="checkbox" className="mt-0.5 h-6 w-6 shrink-0 accent-teal" checked={agree.value}
            disabled={agree.locked} onChange={(e) => agree.set(e.target.checked)} aria-describedby="consent-hint" {...agree.focus} />
          <div>
            <label htmlFor="consent" className="text-ink">{CONSENT_TEXT}</label>
            <p id="consent-hint" className="field-hint">
              This is just for you, not your whole team. Read our <Link className="link" href="/privacy" target="_blank">privacy statement</Link> (opens in a new tab).
              {needsConsent && " We need your consent for the option you chose."}
            </p>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn" onClick={finish} disabled={!canFinish || pending || pick.locked}>
          {pending ? "Finishing" : submittedAt ? "Update and finish" : "Finish"}
        </button>
        <span role="status" aria-live="polite" className="text-sm">
          {error ? <span className="text-warning">{error}</span> : !pick.value ? "Choose an option to finish." : needsConsent && !agree.value ? "Tick the consent box to finish." : ""}
        </span>
      </div>
    </div>
  );
}
