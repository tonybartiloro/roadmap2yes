import { describe, expect, it } from "vitest";
import { cleanNote, parseAnswers } from "./answers";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";

function form(entries: [string, string][]): FormData {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

describe("cleanNote", () => {
  it("sends blank or whitespace-only as null, trims, drops NUL", () => {
    expect(cleanNote("")).toBeNull();
    expect(cleanNote("  \n\t ")).toBeNull();
    expect(cleanNote("\u0000\u0000")).toBeNull();
    expect(cleanNote("  senza noci\u0000 ")).toBe("senza noci");
  });
});

describe("parseAnswers", () => {
  it("builds one answer per person, with seen_at untouched and null as no choice", () => {
    const seen = "2027-03-10T10:00:00.123456+00:00";
    const parsed = parseAnswers(
      form([
        ["p", A],
        ["p", B],
        [`status:${A}`, "yes"],
        [`diet:${A}`, "vegan"],
        [`diet:${A}`, "vegan"],
        [`diet:${A}`, "not-a-diet"],
        [`note:${A}`, "  poco sale "],
        [`seen:${A}`, seen],
        [`seen:${B}`, ""],
      ]),
    );
    expect(parsed).toMatchObject({ ok: true, chosen: 1 });
    if (!parsed.ok) return;
    expect(parsed.answers).toEqual([
      { id: A, status: "yes", diet: ["vegan"], diet_note: "poco sale", seen_at: seen },
      { id: B, status: null, diet: [], diet_note: null, seen_at: null },
    ]);
  });

  it("clears preferences and note unless the answer is yes (BR11)", () => {
    const parsed = parseAnswers(
      form([
        ["p", A],
        [`status:${A}`, "no"],
        [`diet:${A}`, "vegan"],
        [`note:${A}`, "x"],
      ]),
    );
    expect(parsed.ok && parsed.answers[0]).toMatchObject({
      status: "no",
      diet: [],
      diet_note: null,
    });
    // The typed text is kept for the form to show again.
    expect(parsed.values[A]).toMatchObject({ status: "no", note: "x" });
  });

  it("rejects missing, malformed or too many ids", () => {
    expect(parseAnswers(form([])).ok).toBe(false);
    expect(parseAnswers(form([["p", "not-an-id"]])).ok).toBe(false);
    const many = Array.from({ length: 101 }, (_, i) => [
      "p",
      `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    ]) as [string, string][];
    expect(parseAnswers(form(many)).ok).toBe(false);
  });

  it("rejects a note over 200 characters, but not 200", () => {
    const base: [string, string][] = [
      ["p", A],
      [`status:${A}`, "yes"],
    ];
    expect(parseAnswers(form([...base, [`note:${A}`, "x".repeat(200)]])).ok).toBe(true);
    expect(parseAnswers(form([...base, [`note:${A}`, "x".repeat(201)]]))).toMatchObject({
      ok: false,
      reason: "note",
    });
  });

  it("counts zero choices", () => {
    const parsed = parseAnswers(form([["p", A]]));
    expect(parsed).toMatchObject({ ok: true, chosen: 0 });
  });

  it("ignores an unreadable seen_at instead of forwarding it", () => {
    const parsed = parseAnswers(
      form([
        ["p", A],
        [`status:${A}`, "yes"],
        [`seen:${A}`, "garbage"],
      ]),
    );
    expect(parsed.ok && parsed.answers[0]?.seen_at).toBeNull();
  });
});
