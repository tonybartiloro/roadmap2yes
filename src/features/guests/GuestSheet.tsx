"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  CATEGORY_LABELS,
  findDuplicates,
  GUEST_CATEGORIES,
  liveTableOf,
  LIMITS,
  validateGuest,
  type GuestCategory,
  type GuestErrors,
  type GuestSide,
  type GuestTable,
} from "@/domain/guests";
import { Field, NativeSelect, Textarea } from "@/features/decisions/form-bits";
import { useConflict } from "@/features/budget/use-conflict";
import { PanelContent } from "@/features/timeline/PanelContent";
import { addGuestAction, updateGuestAction } from "./actions";
import type { GroupView, GuestValues, GuestView, TableView } from "./data";
import { formatConflictValue, GUEST_FIELD_LABELS } from "./field-labels";
import {
  groupChoiceError,
  GroupPicker,
  NO_GROUP,
  resolveGroup,
  type GroupChoice,
} from "./GroupPicker";
import { fullName, liveGroupId, type PartnerNames } from "./view";

interface Form {
  firstName: string;
  lastName: string;
  category: GuestCategory;
  side: GuestSide | "";
  phone: string;
  email: string;
  notes: string;
  group: GroupChoice;
  /** Id of the chosen live table, "" = Senza tavolo. */
  tableId: string;
}

const orNull = (text: string): string | null => (text.trim() === "" ? null : text.trim());

function toValues(form: Form): GuestValues {
  return {
    firstName: form.firstName.trim(),
    lastName: orNull(form.lastName),
    category: form.category,
    side: form.side === "" ? null : form.side,
    phone: orNull(form.phone),
    email: orNull(form.email),
    notes: orNull(form.notes),
  };
}

function initialForm(
  guest: GuestView | null,
  groups: readonly GroupView[],
  groupId: string | null,
  tables: readonly GuestTable[],
): Form {
  const group = guest ? liveGroupId(guest, groups) : groupId;
  return {
    firstName: guest?.firstName ?? "",
    lastName: guest?.lastName ?? "",
    category: guest?.category ?? "adult",
    side: guest?.side ?? "",
    phone: guest?.phone ?? "",
    email: guest?.email ?? "",
    notes: guest?.notes ?? "",
    group: group ? { kind: "existing", id: group } : NO_GROUP,
    tableId: guest ? (liveTableOf(guest, tables)?.id ?? "") : "",
  };
}

/**
 * Add or edit a person (AC2-AC5). Mount with `key`. "Salva e aggiungi un altro" keeps type, side and
 * group, clears the rest and puts the focus back on the name. A duplicate is a warning, never a
 * block (BR4). Editing uses the version check and the conflict dialog (AC6). Table field: T9.
 */
export function GuestSheet({
  open,
  onOpenChange,
  guest,
  groupId = null,
  groups,
  tables = [],
  guests,
  partners,
  onDelete,
  onStale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` to add. */
  guest: GuestView | null;
  /** Pre-selected group when adding ("Aggiungi persona" from a group). */
  groupId?: string | null;
  groups: readonly GroupView[];
  /** LIVE tables: the table field exists only when there is at least one (AC16). */
  tables?: readonly TableView[];
  /** All the guests, for the duplicate warning. */
  guests: readonly GuestView[];
  partners: PartnerNames;
  onDelete: (guest: GuestView) => void;
  onStale: () => void;
}) {
  const [form, setForm] = useState<Form>(() => initialForm(guest, groups, groupId, tables));
  const [errors, setErrors] = useState<GuestErrors & { group?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [pending, setPending] = useState(false);
  const [moreOpen, setMoreOpen] = useState(
    Boolean(guest && (guest.phone || guest.email || guest.notes)),
  );
  const groupTouched = useRef(false);
  const tableTouched = useRef(false);
  const firstRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const set = <K extends keyof Form>(field: K, value: Form[K]) =>
    setForm((current) => ({ ...current, [field]: value }));

  const duplicates = findDuplicates(
    { firstName: form.firstName, lastName: orNull(form.lastName) },
    guests,
    guest?.id,
  );

  function finish(result: { ok: boolean; message?: string }) {
    if (result.ok) {
      toast("Modifiche salvate.");
      onOpenChange(false);
    } else if (result.message) {
      setFormError(result.message);
    }
  }

  const groupNames = new Map(groups.map((g) => [g.id, g.name]));
  const conflict = useConflict({
    labels: GUEST_FIELD_LABELS,
    formatValue: (field, value) =>
      formatConflictValue(field, value, {
        partnerA: partners.a,
        partnerB: partners.b,
        groups: groupNames,
        tables: new Map(tables.map((t) => [t.id, t.name])),
      }),
    partnerName: "Il tuo partner",
    onResolved: finish,
    onCancel: () => {
      onOpenChange(false);
      onStale();
    },
  });

  function focusFirstError() {
    queueMicrotask(() =>
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
    );
  }

  async function submit(another: boolean) {
    setFormError(null);
    const values = toValues(form);
    const found: GuestErrors & { group?: string } = { ...validateGuest(values) };
    const groupError = groupChoiceError(form.group);
    if (groupError) found.group = groupError;
    setErrors(found);
    if (Object.keys(found).length > 0) {
      if (found.notes || found.phone || found.email) setMoreOpen(true);
      focusFirstError();
      return;
    }

    setPending(true);
    const resolved = await resolveGroup(form.group);
    if (!resolved.ok) {
      setPending(false);
      setFormError(resolved.message);
      return;
    }
    // The group that was just created stays chosen if the save fails.
    if (form.group.kind === "new" && resolved.groupId)
      set("group", { kind: "existing", id: resolved.groupId });

    if (!guest) {
      const added = await addGuestAction({
        guest: values,
        groupId: resolved.groupId,
        ...(tables.length > 0 ? { tableId: form.tableId || null } : {}),
      });
      setPending(false);
      if (!added.ok) return setFormError(added.message);
      if (!another) {
        toast("Aggiunto.");
        onOpenChange(false);
        return;
      }
      setForm((current) => ({
        ...current,
        firstName: "",
        lastName: "",
        phone: "",
        email: "",
        notes: "",
      }));
      setMoreOpen(false);
      setAnnouncement(`${fullName(values)} aggiunto`);
      firstRef.current?.focus();
      return;
    }

    const send = (version: number) =>
      updateGuestAction({
        guestId: guest.id,
        version,
        guest: values,
        ...(groupTouched.current ? { groupId: resolved.groupId } : {}),
        ...(tableTouched.current ? { tableId: form.tableId || null } : {}),
      });
    const mine = {
      ...values,
      groupId: groupTouched.current ? resolved.groupId : guest.groupId,
      tableId: tableTouched.current ? form.tableId || null : guest.tableId,
    };
    const result = await send(guest.version);
    setPending(false);
    if (conflict.handle(result, mine, send)) return;
    finish(result);
  }

  return (
    <>
      <Sheet open={open} onOpenChange={(next) => (pending ? undefined : onOpenChange(next))}>
        <PanelContent className="max-h-[92dvh] overflow-y-auto" aria-describedby="guest-sheet-hint">
          <SheetHeader>
            <SheetTitle>{guest ? "Modifica l'invitato" : "Nuovo invitato"}</SheetTitle>
            <SheetDescription id="guest-sheet-hint" className="sr-only">
              Nome, tipo, lato, gruppo e altri dati dell&apos;invitato.
            </SheetDescription>
          </SheetHeader>

          <form
            ref={formRef}
            noValidate
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submit(false);
            }}
          >
            <Field label="Nome" error={errors.firstName}>
              {(control) => (
                <Input
                  {...control}
                  ref={firstRef}
                  value={form.firstName}
                  maxLength={LIMITS.name}
                  required
                  aria-required="true"
                  autoComplete="off"
                  onChange={(event) => set("firstName", event.target.value)}
                />
              )}
            </Field>
            {duplicates.length > 0 && form.firstName.trim() !== "" ? (
              <p role="status" className="text-foreground bg-muted rounded-md px-3 py-2 text-base">
                Hai già un {fullName(duplicates[0]!)}. Puoi salvare lo stesso.
              </p>
            ) : null}
            <Field label="Cognome" error={errors.lastName}>
              {(control) => (
                <Input
                  {...control}
                  value={form.lastName}
                  maxLength={LIMITS.name}
                  autoComplete="off"
                  onChange={(event) => set("lastName", event.target.value)}
                />
              )}
            </Field>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-base leading-6 font-semibold">Tipo</legend>
              <div className="grid grid-cols-3 gap-2">
                {GUEST_CATEGORIES.map((value) => (
                  <label
                    key={value}
                    className="border-input has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:checked]:border-primary has-[:focus-visible]:ring-ring flex min-h-11 cursor-pointer items-center justify-center rounded-md border px-2 text-center text-base has-[:focus-visible]:ring-2"
                  >
                    <input
                      type="radio"
                      name="category"
                      value={value}
                      checked={form.category === value}
                      onChange={() => set("category", value)}
                      aria-describedby="category-hint"
                      className="sr-only"
                    />
                    {value === "infant" ? "Neonato" : CATEGORY_LABELS[value]}
                  </label>
                ))}
              </div>
              <p id="category-hint" className="text-muted-foreground text-sm">
                Neonato: 0-2 anni, conta nel totale ma non occupa un posto.
              </p>
            </fieldset>

            <Field label="Lato">
              {(control) => (
                <NativeSelect
                  {...control}
                  value={form.side}
                  onChange={(event) => set("side", event.target.value as GuestSide | "")}
                >
                  <option value="">Non indicato</option>
                  <option value="A">{partners.a}</option>
                  <option value="B">{partners.b}</option>
                  <option value="both">Entrambi</option>
                </NativeSelect>
              )}
            </Field>

            <GroupPicker
              groups={groups}
              value={form.group}
              error={errors.group}
              onChange={(group) => {
                groupTouched.current = true;
                set("group", group);
              }}
            />

            {tables.length > 0 ? (
              <Field
                label="Tavolo"
                hint={form.category === "infant" ? "I neonati non occupano posto." : undefined}
              >
                {(control) => (
                  <NativeSelect
                    {...control}
                    value={form.tableId}
                    onChange={(event) => {
                      tableTouched.current = true;
                      set("tableId", event.target.value);
                    }}
                  >
                    <option value="">Senza tavolo</option>
                    {tables.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
            ) : null}

            <div>
              <Button
                type="button"
                variant="ghost"
                aria-expanded={moreOpen}
                aria-controls="guest-more"
                onClick={() => setMoreOpen((current) => !current)}
              >
                Altri dati
              </Button>
              <div id="guest-more" hidden={!moreOpen} className="flex flex-col gap-4 pt-2">
                <Field label="Telefono" error={errors.phone}>
                  {(control) => (
                    <Input
                      {...control}
                      type="tel"
                      inputMode="tel"
                      autoComplete="off"
                      value={form.phone}
                      onChange={(event) => set("phone", event.target.value)}
                    />
                  )}
                </Field>
                <Field label="Email" error={errors.email}>
                  {(control) => (
                    <Input
                      {...control}
                      type="email"
                      inputMode="email"
                      autoComplete="off"
                      value={form.email}
                      onChange={(event) => set("email", event.target.value)}
                    />
                  )}
                </Field>
                <Field
                  label="Note"
                  error={errors.notes}
                  hint={`${form.notes.length} / ${LIMITS.notes}`}
                >
                  {(control) => (
                    <Textarea
                      {...control}
                      value={form.notes}
                      onChange={(event) => set("notes", event.target.value)}
                    />
                  )}
                </Field>
              </div>
            </div>

            {formError ? (
              <p role="alert" className="text-destructive text-base">
                {formError}
              </p>
            ) : null}
            <p role="status" className="sr-only">
              {announcement}
            </p>

            <SheetFooter>
              <Button type="submit" disabled={pending}>
                {pending ? "Un attimo…" : "Salva"}
              </Button>
              {!guest ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => void submit(true)}
                >
                  Salva e aggiungi un altro
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => onOpenChange(false)}
              >
                Annulla
              </Button>
              {guest ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  className="text-destructive"
                  onClick={() => onDelete(guest)}
                >
                  <Trash2 aria-hidden />
                  Elimina
                </Button>
              ) : null}
            </SheetFooter>
          </form>
        </PanelContent>
      </Sheet>
      {conflict.dialog}
    </>
  );
}
