"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { STAGES, STAGE_INFO, type Stage } from "@/lib/copy";
import { canOpenStage } from "@/lib/rules";
import { Timer } from "@/components/Timer";
import { useSaveStatus } from "./ParticipantProvider";

export function SaveState() {
  const { status, error } = useSaveStatus();
  const text =
    status === "saving"
      ? "Saving"
      : status === "offline"
        ? "Offline. Your changes are kept on this device and will be sent when you reconnect."
        : status === "ended"
          ? (error ?? "Your session has ended.")
          : "All changes saved";
  return (
    <span
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-2 text-sm ${status === "saved" ? "text-success" : status === "saving" ? "text-muted" : "text-warning"}`}
    >
      <span
        aria-hidden="true"
        className={`inline-block h-2.5 w-2.5 rounded-full ${status === "saved" ? "bg-success" : status === "saving" ? "bg-input" : "bg-warning-line"}`}
      />
      {text}
    </span>
  );
}

export function ParticipantHeader({
  companyName,
  tableNumber,
  personName,
}: {
  companyName: string;
  tableNumber: number | null;
  personName: string;
}) {
  return (
    <header className="border-b border-line bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
        <div>
          <p className="mono-label">AI Use Case Builder</p>
          <p className="text-lg font-semibold text-ink">
            {companyName}
            {tableNumber != null && <span className="ml-2 font-normal text-muted">Table {tableNumber}</span>}
          </p>
          <p className="text-sm text-muted">Signed in as {personName}</p>
        </div>
        <SaveState />
      </div>
    </header>
  );
}

export function Stepper({
  slug,
  current,
  timer,
}: {
  slug: string;
  current: Stage;
  timer: { endsAt: string | null; pausedRemaining: number | null; serverNow: number };
}) {
  const pathname = usePathname();
  const showTimer = timer.endsAt || timer.pausedRemaining != null;
  // On a narrow screen, keep the page's own stage visible in the scrolling stepper.
  useEffect(() => {
    document.querySelector<HTMLElement>('nav[aria-label="Workshop stages"] [aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname]);
  return (
    <nav aria-label="Workshop stages" className="border-b border-line bg-white">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4">
        <ol className="relative flex min-w-0 flex-1 gap-1 overflow-x-auto py-2">
          {STAGES.map((stage, i) => {
            const info = STAGE_INFO[stage];
            const href = `/${slug}/${info.path}`;
            const here = pathname === href;
            const open = canOpenStage(current, stage);
            const live = stage === current;
            const body = (
              <>
                <span className="font-mono text-xs">{i + 1}</span>
                <span className="whitespace-nowrap">{info.short}</span>
                {live && <span className="sr-only">(current stage)</span>}
              </>
            );
            return (
              <li key={stage} className="relative shrink-0">
                {open ? (
                  <Link
                    href={href}
                    aria-current={here ? "page" : undefined}
                    className={`flex min-h-[44px] items-center gap-1.5 rounded-[8px] px-3 text-sm font-medium ${
                      here ? "bg-teal text-white" : live ? "bg-tint text-teal-hover" : "text-teal hover:bg-tint"
                    }`}
                  >
                    {body}
                  </Link>
                ) : (
                  <span
                    className="flex min-h-[44px] items-center gap-1.5 px-3 text-sm text-muted"
                    title="Opens when your facilitator starts this stage"
                  >
                    {body}
                    <span className="sr-only">(not open yet)</span>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        {showTimer && (
          <div className="shrink-0 py-2 text-right">
            <span className="mono-label block">Time left</span>
            <Timer endsAt={timer.endsAt} pausedRemaining={timer.pausedRemaining} serverNow={timer.serverNow} />
          </div>
        )}
      </div>
    </nav>
  );
}

// Shown on an earlier stage's page once the facilitator has opened a later stage.
export function StageBanner({ slug, current }: { slug: string; current: Stage }) {
  const pathname = usePathname();
  const pageStage = STAGES.find((s) => pathname === `/${slug}/${STAGE_INFO[s].path}`);
  if (!pageStage || pageStage === "arrival" || pageStage === current) return null;
  if (STAGES.indexOf(pageStage) > STAGES.indexOf(current)) return null;
  if (current === "done") return null;
  return (
    <div className="border-b border-line bg-tint" role="status">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2">
        <p className="font-medium text-teal-hover">{STAGE_INFO[current].label} is now open.</p>
        <Link className="btn btn-small" href={`/${slug}/${STAGE_INFO[current].path}`}>
          Go to {STAGE_INFO[current].label}
        </Link>
      </div>
    </div>
  );
}

// On the welcome page, move people on automatically when the first stage opens.
export function FollowStage({ slug, current, from }: { slug: string; current: Stage; from: Stage }) {
  const router = useRouter();
  const [start] = useState(current);
  useEffect(() => {
    if (start === from && current !== from) router.push(`/${slug}/${STAGE_INFO[current].path}`);
  }, [current, from, start, slug, router]);
  return null;
}
