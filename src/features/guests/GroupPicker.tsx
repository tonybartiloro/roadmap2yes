"use client";

import { Input } from "@/components/ui/input";
import { Field, NativeSelect } from "@/features/decisions/form-bits";
import { addGroupAction } from "./actions";
import type { GroupView } from "./data";
import { validateGroupName } from "./schemas";

export type GroupChoice =
  { kind: "none" } | { kind: "existing"; id: string } | { kind: "new"; name: string };

export const NO_GROUP: GroupChoice = { kind: "none" };

const NEW = "__new__";

/** Select of the groups with "Nuovo gruppo…", which opens an inline name field (AC5). */
export function GroupPicker({
  groups,
  value,
  onChange,
  error,
  allowNone = true,
}: {
  groups: readonly GroupView[];
  value: GroupChoice;
  onChange: (value: GroupChoice) => void;
  error?: string | undefined;
  /** "Senza gruppo" is a valid choice in the person form, not in a bulk assignment. */
  allowNone?: boolean;
}) {
  const live = groups
    .filter((g) => !g.deletedAt)
    .toSorted((a, b) => a.name.localeCompare(b.name, "it"));
  const selected = value.kind === "existing" ? value.id : value.kind === "new" ? NEW : "";
  return (
    <div className="flex flex-col gap-2">
      <Field label="Gruppo" error={value.kind === "new" ? undefined : error}>
        {(control) => (
          <NativeSelect
            {...control}
            value={selected}
            onChange={(event) => {
              const next = event.target.value;
              onChange(
                next === NEW
                  ? { kind: "new", name: value.kind === "new" ? value.name : "" }
                  : next === ""
                    ? NO_GROUP
                    : { kind: "existing", id: next },
              );
            }}
          >
            {allowNone ? (
              <option value="">Senza gruppo</option>
            ) : (
              <option value="" disabled>
                Scegli un gruppo
              </option>
            )}
            {live.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
            <option value={NEW}>Nuovo gruppo…</option>
          </NativeSelect>
        )}
      </Field>
      {value.kind === "new" ? (
        <Field label="Nome del nuovo gruppo" error={error}>
          {(control) => (
            <Input
              {...control}
              value={value.name}
              maxLength={80}
              placeholder="Famiglia Rossi"
              onChange={(event) => onChange({ kind: "new", name: event.target.value })}
            />
          )}
        </Field>
      ) : null}
    </div>
  );
}

/** Message when the choice is not usable yet (empty or too long new name, no group picked). */
export function groupChoiceError(choice: GroupChoice, required = false): string | null {
  if (choice.kind === "new") return validateGroupName(choice.name);
  return required && choice.kind === "none" ? "Scegli un gruppo." : null;
}

/** Creates the new group if needed; resolves to the group id (or `null`) or a fixed error text. */
export async function resolveGroup(
  choice: GroupChoice,
): Promise<{ ok: true; groupId: string | null } | { ok: false; message: string }> {
  if (choice.kind === "none") return { ok: true, groupId: null };
  if (choice.kind === "existing") return { ok: true, groupId: choice.id };
  const created = await addGroupAction({ name: choice.name });
  return created.ok
    ? { ok: true, groupId: created.data.groupId }
    : { ok: false, message: created.message };
}
