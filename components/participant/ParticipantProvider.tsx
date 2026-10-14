"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore, useState } from "react";
import { getSaveQueue, type QueuedOp, type SaveQueue } from "@/lib/client/save-queue";
import type { EditingMarker } from "@/lib/queries";

type Ctx = {
  queue: SaveQueue;
  slug: string;
  companyId: string;
  personId: string;
  locked: boolean;
  markers: EditingMarker[];
};

const ParticipantContext = createContext<Ctx | null>(null);

export function ParticipantProvider({
  slug,
  companyId,
  personId,
  locked,
  markers,
  children,
}: Omit<Ctx, "queue"> & { children: React.ReactNode }) {
  const queue = useMemo(() => getSaveQueue(`${companyId}-${personId}`), [companyId, personId]);
  const router = useRouter();
  // After our own changes are saved, refresh so server-computed values (scores, the
  // automatic shortlist) appear straight away.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const off = queue.onSaved(() => {
      if (t) clearTimeout(t);
      t = setTimeout(() => router.refresh(), 150);
    });
    return () => {
      off();
      if (t) clearTimeout(t);
    };
  }, [queue, router]);
  const value = useMemo(
    () => ({ queue, slug, companyId, personId, locked, markers }),
    [queue, slug, companyId, personId, locked, markers],
  );
  return <ParticipantContext.Provider value={value}>{children}</ParticipantContext.Provider>;
}

export function useParticipant(): Ctx {
  const ctx = useContext(ParticipantContext);
  if (!ctx) throw new Error("useParticipant must be used inside ParticipantProvider");
  return ctx;
}

export function useSaveStatus() {
  const { queue } = useParticipant();
  const status = useSyncExternalStore(queue.subscribe, queue.getStatus, () => "saved" as const);
  return { status, error: queue.lastError };
}

function valueFromOp(op: QueuedOp | undefined): { has: boolean; value: unknown } {
  if (!op || !("value" in op)) return { has: false, value: undefined };
  return { has: true, value: op.value };
}

// One autosaved field.
// * Starts from any unsent local change, otherwise from the server value.
// * Adopts new server values (teammates' edits) unless this person is editing the field
//   or still has an unsent change for it. That gives last write wins per field.
export function useAutoField<T>(key: string, serverValue: T, toOp: (v: T) => QueuedOp, immediate = false) {
  const { queue, locked } = useParticipant();
  const [value, setLocal] = useState<T>(() => {
    const pending = valueFromOp(queue.pendingValue(key));
    return pending.has ? (pending.value as T) : serverValue;
  });
  const focused = useRef(false);
  const toOpRef = useRef(toOp);
  toOpRef.current = toOp;

  useEffect(() => {
    if (!focused.current && !queue.isPending(key)) setLocal(serverValue);
  }, [serverValue, key, queue]);

  const set = (v: T) => {
    if (locked) return;
    setLocal(v);
    queue.set(key, toOpRef.current(v), immediate);
  };
  const focus = {
    onFocus: () => {
      focused.current = true;
      presence.start(key);
    },
    onBlur: () => {
      focused.current = false;
      presence.stop();
    },
  };
  return { value, set, focus, locked };
}

// Tells the server which field this person is editing. Refreshes every 15 seconds.
const presence = (() => {
  let current: string | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopTimer: ReturnType<typeof setTimeout> | null = null;
  const send = (field: string | null) =>
    fetch("/api/p/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field }),
      keepalive: true,
    }).catch(() => {});
  return {
    start(field: string) {
      const marker = field.replace(/[^a-z_.:0-9-]/gi, "").toLowerCase().slice(0, 120);
      if (stopTimer) clearTimeout(stopTimer);
      if (current !== marker) send(marker);
      current = marker;
      if (timer) clearInterval(timer);
      timer = setInterval(() => current && send(current), 15_000);
    },
    stop() {
      // Wait a moment: focus often moves straight to another field.
      if (stopTimer) clearTimeout(stopTimer);
      stopTimer = setTimeout(() => {
        if (timer) clearInterval(timer);
        timer = null;
        if (current) send(null);
        current = null;
      }, 400);
    },
  };
})();

export function markerKey(key: string) {
  return key.replace(/[^a-z_.:0-9-]/gi, "").toLowerCase().slice(0, 120);
}

export function useMarker(key: string): string | null {
  const { markers } = useParticipant();
  const m = markers.find((x) => x.field_key === markerKey(key));
  return m ? m.name : null;
}
