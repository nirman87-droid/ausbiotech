"use client";

import { useRouter } from "next/navigation";
import { useLive } from "@/lib/client/use-live";

// Re-renders the current page with fresh server data whenever a topic changes.
export function LiveRefresh({ topics, debounceMs = 300 }: { topics: string[]; debounceMs?: number }) {
  const router = useRouter();
  useLive(topics, () => router.refresh(), debounceMs);
  return null;
}
