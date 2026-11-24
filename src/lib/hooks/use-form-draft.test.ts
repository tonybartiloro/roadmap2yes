// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readDraft,
  removeDraft,
  useFormDraft,
  writeDraft,
  type DraftStorage,
} from "./use-form-draft";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

function memoryStorage(): DraftStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

describe("draft storage helpers", () => {
  it("round-trips and namespaces keys", () => {
    const storage = memoryStorage();
    expect(writeDraft(storage, "task:1", { title: "Ciao" })).toBe(true);
    expect([...storage.data.keys()]).toEqual(["r2y-draft:task:1"]);
    expect(readDraft(storage, "task:1")).toEqual({ title: "Ciao" });
    removeDraft(storage, "task:1");
    expect(readDraft(storage, "task:1")).toBeNull();
  });

  it("discards malformed or invalid drafts", () => {
    const storage = memoryStorage();
    storage.setItem("r2y-draft:a", "{not json");
    expect(readDraft(storage, "a")).toBeNull();
    writeDraft(storage, "b", { x: 1 });
    expect(readDraft(storage, "b", () => null)).toBeNull();
  });

  it("never throws when the storage does (quota, private mode)", () => {
    const broken: DraftStorage = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    };
    expect(writeDraft(broken, "k", 1)).toBe(false);
    expect(readDraft(broken, "k")).toBeNull();
    expect(() => removeDraft(broken, "k")).not.toThrow();
  });
});

describe("useFormDraft (offline -> type -> reload -> restored)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it("saves debounced, restores on the next mount and clears after a successful save", () => {
    const first = renderHook(() => useFormDraft<{ title: string }>("task:new"));
    expect(first.result.current.ready).toBe(true);
    expect(first.result.current.draft).toBeNull();

    act(() => first.result.current.save({ title: "Prenotare" }));
    expect(window.localStorage.getItem("r2y-draft:task:new")).toBeNull();
    act(() => void vi.advanceTimersByTime(500));
    expect(window.localStorage.getItem("r2y-draft:task:new")).toBe('{"title":"Prenotare"}');
    first.unmount();

    const second = renderHook(() => useFormDraft<{ title: string }>("task:new"));
    expect(second.result.current.draft).toEqual({ title: "Prenotare" });
    act(() => second.result.current.clear());
    expect(second.result.current.draft).toBeNull();
    expect(window.localStorage.getItem("r2y-draft:task:new")).toBeNull();
  });

  it("flushes the pending edit on unmount", () => {
    const hook = renderHook(() => useFormDraft<{ n: number }>("k"));
    act(() => hook.result.current.save({ n: 2 }));
    hook.unmount();
    expect(window.localStorage.getItem("r2y-draft:k")).toBe('{"n":2}');
  });
});
