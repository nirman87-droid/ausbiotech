"use client";

import { useEffect, useRef } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Calls onChange when any of the topics changes.
// Uses Supabase realtime broadcast when configured, and polls /api/live as a backstop
// (every 3 seconds without Supabase, every 20 seconds with it).

let supabase: SupabaseClient | null | undefined;
function getSupabase() {
  if (supabase === undefined) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    supabase = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  }
  return supabase;
}

export function useLive(topicList: string[], onChange: () => void, debounceMs = 300) {
  const cb = useRef(onChange);
  cb.current = onChange;
  const key = topicList.join(",");

  useEffect(() => {
    const list = key.split(",").filter(Boolean);
    if (list.length === 0) return;
    let stopped = false;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const versions = new Map<string, number>();
    const fire = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => !stopped && cb.current(), debounceMs);
    };

    const poll = async () => {
      try {
        const res = await fetch(`/api/live?t=${encodeURIComponent(key)}`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
        if (!res.ok) return;
        const { v } = (await res.json()) as { v: Record<string, number> };
        let changed = false;
        for (const [t, n] of Object.entries(v)) {
          const prev = versions.get(t);
          if (prev !== undefined && n !== prev) changed = true;
          versions.set(t, n);
        }
        if (changed) fire();
      } catch {
        // offline: try again next tick
      }
    };

    const client = getSupabase();
    const channels = client
      ? list.map((t) =>
          client
            .channel(t)
            .on("broadcast", { event: "bump" }, (msg) => {
              const n = Number((msg.payload as { v?: number })?.v);
              if (Number.isFinite(n)) versions.set(t, n);
              fire();
            })
            .subscribe(),
        )
      : [];

    poll();
    const interval = setInterval(poll, client ? 20_000 : 3_000);
    const onVisible = () => document.visibilityState === "visible" && poll();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", poll);
    return () => {
      stopped = true;
      clearInterval(interval);
      if (debounce) clearTimeout(debounce);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", poll);
      for (const ch of channels) client?.removeChannel(ch);
    };
  }, [key, debounceMs]);
}
