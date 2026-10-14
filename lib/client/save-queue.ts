"use client";

// Autosave queue for participant screens.
// * Each field change waits 600 ms (debounce), then is sent with any other ready changes.
// * Unsent changes are kept in localStorage, so a sleeping laptop or a lost connection
//   does not lose them. They are sent when the connection comes back.
// * Failed sends are retried with a growing delay.

export type QueuedOp = { kind: string; [k: string]: unknown };
export type SaveStatus = "saved" | "saving" | "offline" | "ended";

type Entry = { key: string; op: QueuedOp; readyAt: number; at: number };

const DEBOUNCE_MS = 600;
const MAX_AGE_MS = 24 * 3_600_000;
const BACKOFF = [1000, 2000, 5000, 10000, 15000];

export class SaveQueue {
  private entries = new Map<string, Entry>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inflight = false;
  private failures = 0;
  private listeners = new Set<() => void>();
  private savedListeners = new Set<() => void>();
  private waiters: (() => void)[] = [];
  status: SaveStatus = "saved";
  lastError: string | null = null;

  constructor(
    private storageKey: string,
    private endpoint = "/api/p/save",
  ) {
    this.restore();
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => this.flush());
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") this.flush();
      });
    }
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getStatus = () => this.status;

  // Called after changes reach the server, so screens can fetch derived values (scores).
  onSaved = (fn: () => void) => {
    this.savedListeners.add(fn);
    return () => this.savedListeners.delete(fn);
  };

  private emit() {
    const next: SaveStatus =
      this.status === "ended"
        ? "ended"
        : this.entries.size === 0 && !this.inflight
          ? "saved"
          : this.failures > 0
            ? "offline"
            : "saving";
    this.status = next;
    if (this.entries.size === 0 && !this.inflight) {
      for (const w of this.waiters.splice(0)) w();
    }
    for (const fn of this.listeners) fn();
  }

  private persist() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify([...this.entries.values()]));
    } catch {
      // Storage can be full or blocked. The queue still works in memory.
    }
  }

  private restore() {
    if (typeof window === "undefined") return;
    try {
      const saved = JSON.parse(localStorage.getItem(this.storageKey) ?? "[]") as Entry[];
      for (const e of saved) {
        if (Date.now() - e.at < MAX_AGE_MS) this.entries.set(e.key, { ...e, readyAt: 0 });
      }
    } catch {
      // ignore corrupt storage
    }
    if (this.entries.size) {
      this.emit();
      this.schedule(0);
    }
  }

  isPending(key: string) {
    return this.entries.has(key);
  }

  pendingValue(key: string): QueuedOp | undefined {
    return this.entries.get(key)?.op;
  }

  // Adds or replaces the change for one field. `immediate` skips the debounce.
  set(key: string, op: QueuedOp, immediate = false) {
    this.entries.delete(key); // re-insert so ops keep the order they were made in
    this.entries.set(key, { key, op, readyAt: Date.now() + (immediate ? 0 : DEBOUNCE_MS), at: Date.now() });
    this.persist();
    this.emit();
    this.schedule(immediate ? 0 : DEBOUNCE_MS);
  }

  private schedule(ms: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), ms);
  }

  // Sends everything now, ignoring the debounce. Resolves when the queue is empty.
  async flushNow(timeoutMs = 8000): Promise<boolean> {
    for (const e of this.entries.values()) e.readyAt = 0;
    const done = new Promise<void>((resolve) => this.waiters.push(resolve));
    this.flush();
    if (this.entries.size === 0 && !this.inflight) return true;
    const timeout = new Promise<"timeout">((r) => setTimeout(() => r("timeout"), timeoutMs));
    return (await Promise.race([done, timeout])) !== "timeout";
  }

  async flush() {
    if (this.inflight || this.status === "ended") return;
    const now = Date.now();
    const ready = [...this.entries.values()].filter((e) => e.readyAt <= now);
    if (ready.length === 0) {
      const next = Math.min(...[...this.entries.values()].map((e) => e.readyAt));
      if (Number.isFinite(next)) this.schedule(Math.max(0, next - now));
      return;
    }
    this.inflight = true;
    this.emit();
    // Remember exactly what was sent, so a newer edit to the same field is not dropped.
    const sent = ready.map((e) => ({ key: e.key, at: e.at }));
    // A request that hangs (sleeping laptop, dead wifi) is abandoned after 15 seconds and retried.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ops: ready.map((e) => e.op) }),
        signal: controller.signal,
      });
      if (res.status === 401) {
        this.status = "ended";
        this.lastError = "Your session has ended. Scan the table code again to keep working.";
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { results } = (await res.json()) as { results: { ok: boolean; error?: string; permanent?: boolean }[] };
      results.forEach((r, i) => {
        const s = sent[i];
        const current = this.entries.get(s.key);
        const unchanged = current && current.at === s.at;
        if (r.ok || r.permanent) {
          if (unchanged) this.entries.delete(s.key);
          if (!r.ok) this.lastError = r.error ?? "A change was not saved.";
        }
      });
      this.failures = results.every((r) => r.ok || r.permanent) ? 0 : this.failures + 1;
      if (results.some((r) => r.ok)) for (const fn of this.savedListeners) fn();
    } catch {
      this.failures += 1;
    } finally {
      clearTimeout(timeout);
      this.inflight = false;
      this.persist();
      this.emit();
      if (this.status !== "ended" && this.entries.size) {
        this.schedule(this.failures ? BACKOFF[Math.min(this.failures - 1, BACKOFF.length - 1)] : 0);
      }
    }
  }
}

const queues = new Map<string, SaveQueue>();

export function getSaveQueue(scope: string, endpoint = "/api/p/save"): SaveQueue {
  const id = `${endpoint}|${scope}`;
  let q = queues.get(id);
  if (!q) {
    q = new SaveQueue(`ucb-unsent-${scope}`, endpoint);
    queues.set(id, q);
  }
  return q;
}
