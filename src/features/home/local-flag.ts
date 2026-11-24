"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * A boolean kept in this device's `localStorage` ("preferenza locale", design §3.3), read through
 * an external store so the server render and the first client render agree (`false`) and the real
 * value shows right after hydration. Storage that is blocked or full never throws: the flag then
 * lives only until the page is closed.
 */
const listeners = new Set<() => void>();
const memory = new Map<string, boolean>();

function read(key: string): boolean {
  try {
    const stored = window.localStorage.getItem(key);
    if (stored !== null) return stored === "1";
  } catch {
    // blocked storage: fall through to memory
  }
  return memory.get(key) ?? false;
}

function write(key: string, value: boolean): void {
  memory.set(key, value);
  try {
    if (value) window.localStorage.setItem(key, "1");
    else window.localStorage.removeItem(key);
  } catch {
    // keep the in-memory value only
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function useLocalFlag(key: string): [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => false,
  );
  const set = useCallback((next: boolean) => write(key, next), [key]);
  return [value, set];
}
