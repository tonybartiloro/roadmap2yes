"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const PREFIX = "r2y-draft:";

/** Drafts are a convenience, never a place for secrets: anything that looks like one is refused. */
const SECRET_NAME = /code|codice|password|passwd|token|secret|otp|pin\b/i;

/** Minimal storage surface (so the helpers are testable without a browser). */
export interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  /** Present on `Storage`; used by `clearAllFormDrafts`. */
  readonly length?: number;
  key?(index: number): string | null;
}

export type DraftParser<T> = (raw: unknown) => T | null;

/** True if the draft key, or any (nested) field name of the value, looks like a secret. */
export function containsSecretField(key: string, value: unknown, depth = 0): boolean {
  if (SECRET_NAME.test(key)) return true;
  if (depth > 5 || value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => containsSecretField("", item, depth + 1));
  return Object.entries(value).some(
    ([name, inner]) => SECRET_NAME.test(name) || containsSecretField("", inner, depth + 1),
  );
}

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

/** Returns false (and stores nothing) for secret-looking keys/fields, quota errors or private mode. */
export function writeDraft(storage: DraftStorage, key: string, value: unknown): boolean {
  if (containsSecretField(key, value)) return false;
  try {
    storage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeDraft(storage: DraftStorage, key: string): void {
  try {
    storage.removeItem(PREFIX + key);
  } catch {
    // ignore
  }
}

/**
 * Removes every draft of every user/wedding on this device. The sign-out flow ("Esci", T15)
 * MUST call it, so the next person on a shared device never sees the previous one's drafts.
 */
export function clearAllFormDrafts(
  storage: DraftStorage | undefined = typeof window === "undefined"
    ? undefined
    : window.localStorage,
): void {
  try {
    if (!storage || typeof storage.key !== "function" || storage.length === undefined) return;
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const name = storage.key(i);
      if (name?.startsWith(PREFIX)) keys.push(name);
    }
    for (const name of keys) storage.removeItem(name);
  } catch {
    // ignore
  }
}

export interface UseFormDraftOptions<T> {
  /** REQUIRED namespace: `${userId}:${weddingId}`. Two people on one device never share a draft. */
  scope: string;
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
 * - Namespaced by `scope` (`userId:weddingId`); `clearAllFormDrafts()` wipes all on sign-out.
 * - Secret-looking keys/fields (code, password, token...) are refused by `writeDraft`.
 */
export function useFormDraft<T>(key: string, options: UseFormDraftOptions<T>) {
  const { parse, debounceMs = 400, scope } = options;
  const storageKey = `${scope}:${key}`;
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
      writeDraft(window.localStorage, storageKey, pending.current.value);
      pending.current = null;
    }
  }, [storageKey]);

  useEffect(() => {
    setDraft(readDraft<T>(window.localStorage, storageKey, parseRef.current));
    setReady(true);
    // Persist the last edit when the page goes away (offline tab closed, navigation).
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [storageKey, flush]);

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
    removeDraft(window.localStorage, storageKey);
    setDraft(null);
  }, [storageKey]);

  return { draft, ready, save, clear };
}
