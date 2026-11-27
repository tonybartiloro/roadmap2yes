import type { RsvpAnswer } from "../public-rpc";
import { DIET_VALUES, NOTE_MAX, type FormValues } from "./state";

/**
 * Form fields -> answers for `rsvp_submit` (pure). Field names: `p` (repeated: the id of each person
 * shown), then `status:<id>`, `diet:<id>` (repeated), `note:<id>`, `seen:<id>` (the `answered_at` the
 * page showed, sent back untouched). The ids are not trusted: the DB ignores any that is not a
 * current person of the link (AC11).
 */

const MAX_PEOPLE = 100;
const ID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RAW_NOTE_MAX = 1000;
/** An ISO timestamp with microseconds and offset is 32 characters; anything longer is not one. */
const SEEN_MAX = 40;

export type ParsedAnswers =
  | { ok: true; answers: RsvpAnswer[]; values: FormValues; chosen: number }
  | { ok: false; values: FormValues; reason: "shape" | "note" };

function text(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === "string" ? value : "";
}

/** A blank or whitespace-only note is `null`; NUL (rejected by jsonb) is dropped. */
export function cleanNote(raw: string): string | null {
  const note = raw.split("\u0000").join("").trim();
  return note === "" ? null : note;
}

export function parseAnswers(data: FormData): ParsedAnswers {
  const ids = [...new Set(data.getAll("p").filter((id): id is string => typeof id === "string"))];
  const values: FormValues = {};
  if (ids.length === 0 || ids.length > MAX_PEOPLE || ids.some((id) => !ID_SHAPE.test(id))) {
    return { ok: false, values, reason: "shape" };
  }
  const answers: RsvpAnswer[] = [];
  let tooLong = false;
  for (const id of ids) {
    const raw = text(data, `status:${id}`);
    const status = raw === "yes" || raw === "no" ? raw : null;
    const diet = [
      ...new Set(
        data
          .getAll(`diet:${id}`)
          .filter((v): v is string => typeof v === "string" && DIET_VALUES.includes(v)),
      ),
    ];
    const rawNote = text(data, `note:${id}`).slice(0, RAW_NOTE_MAX);
    values[id] = { status, diet, note: rawNote };
    const note = cleanNote(rawNote);
    if (status === "yes" && note !== null && note.length > NOTE_MAX) tooLong = true;
    const seen = text(data, `seen:${id}`);
    answers.push({
      id,
      status,
      diet: status === "yes" ? diet : [],
      diet_note: status === "yes" ? note : null,
      seen_at:
        seen !== "" && seen.length <= SEEN_MAX && !Number.isNaN(Date.parse(seen)) ? seen : null,
    });
  }
  if (tooLong) return { ok: false, values, reason: "note" };
  return { ok: true, answers, values, chosen: answers.filter((a) => a.status !== null).length };
}
