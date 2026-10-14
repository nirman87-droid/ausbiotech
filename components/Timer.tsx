"use client";

import { useEffect, useState } from "react";
import { formatTimer, timerRemainingSeconds } from "@/lib/rules";

// Counts down on the device from timer_ends_at. The server never writes per second.
// serverNow corrects for a device clock that is a little fast or slow.
export function Timer({
  endsAt,
  pausedRemaining,
  serverNow,
  className = "",
  big = false,
}: {
  endsAt: string | null;
  pausedRemaining: number | null;
  serverNow: number;
  className?: string;
  big?: boolean;
}) {
  // First render uses the server time so server and browser HTML match.
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const offset = serverNow - Date.now();
    const tick = () => setNow(Date.now() + offset);
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [serverNow]);
  const state = timerRemainingSeconds({ timer_ends_at: endsAt, timer_paused_remaining_s: pausedRemaining }, now);
  if (!state) return null;
  const low = state.running && state.seconds <= 60;
  return (
    <span
      className={`font-mono tabular-nums ${big ? "text-3xl" : "text-sm"} ${low ? "text-warning" : "text-ink"} ${className}`}
      role="timer"
      aria-label={`${state.running ? "Time left" : "Timer paused"}: ${formatTimer(state.seconds)}`}
    >
      {formatTimer(state.seconds)}
      {!state.running && <span className="ml-1 text-xs text-muted">paused</span>}
    </span>
  );
}
