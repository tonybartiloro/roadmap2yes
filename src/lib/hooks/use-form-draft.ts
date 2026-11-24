"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const PREFIX = "r2y-draft:";

/** Minimal storage surface (so the helpers are testable without a browser). */
export interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type DraftParser<T> = (raw: unknown) => T | null;

export function readDraft<T>(
  storage: DraftStorage,
  key: string,
  parse: DraftParser<T> = (raw) => raw as T,
): T | null {
  try {
    const text = storage.getItem(PREFIX + key);
    if (text === null) return null;
    return parse(JSON.parse(text));
  } catch {
    return null;
  }
}

export function writeDraft(storage: DraftStorage, key: string, value: unknown): boolean {
  try {
    storage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false; // quota or private mode: the draft is a convenience, never an error
  }
}

export function removeDraft(storage: DraftStorage, key: string): void {
  try {
    storage.removeItem(PREFIX + key);
  } catch {
    // ignore
  }
}

export interface UseFormDraftOptions<T> {
  /** Validates what comes out of storage (return `null` to discard a malformed draft). */
  parse?: DraftParser<T>;
  /** Debounce for `save` (ms). */
  debounceMs?: number;
}

/**
 * Local draft of a form (offline / failed save keeps what the person typed; AC39).
 *
 * - `draft` is `null` until the browser storage has been read (`ready`), so SSR and hydration match.
 * - `save(values)` is debounced; `clear()` after a successful save.
 * - NEVER store access codes or other secrets in a draft.
 */
export function useFormDraft<T>(key: string, options: UseFormDraftOptions<T> = {}) {
  const { parse, debounceMs = 400 } = options;
  const parseRef = useRef(parse);
  useEffect(() => {
    parseRef.current = parse;
  });
  const [draft, setDraft] = useState<T | null>(null);
  const [ready, setReady] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ value: unknown } | null>(null);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (pending.current) {
      writeDraft(window.localStorage, key, pending.current.value);
      pending.current = null;
    }
  }, [key]);

  useEffect(() => {
    setDraft(readDraft<T>(window.localStorage, key, parseRef.current));
    setReady(true);
    // Persist the last edit when the page goes away (offline tab closed, navigation).
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [key, flush]);

  const save = useCallback(
    (value: T) => {
      pending.current = { value };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, debounceMs);
    },
    [debounceMs, flush],
  );

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    pending.current = null;
    removeDraft(window.localStorage, key);
    setDraft(null);
  }, [key]);

  return { draft, ready, save, clear };
}
