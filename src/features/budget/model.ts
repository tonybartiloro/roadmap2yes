import type { BudgetInput, ItemStatus, PaymentKind } from "@/domain/budget";
import { displayName } from "@/lib/display-name";
import { isPlainDate, type PlainDate } from "@/lib/dates/plain-date";
import { formatCents, MONEY_ERROR_MESSAGE, parseEuroToCents, type Cents } from "@/lib/money";
import type { Tables } from "@/lib/supabase/database.types";
import type {
  BudgetSnapshot,
  CategoryView,
  ItemInput,
  ItemView,
  PaymentInput,
  PaymentView,
  VersionView,
} from "./types";

export const SYSTEM_ACTOR = "Il sistema";
export const PARTNER_FALLBACK = "Il tuo partner";

/** Limits that mirror the table checks, shared by the forms and zod. */
export const CATEGORY_NAME_MAX = 60;
export const DESCRIPTION_MAX = 200;
export const REASON_MAX = 300;

/** Annulla toasts stay at least 8 s (design §8). */
export const UNDO_MS = 10_000;

/** "Scade oggi", "Scade tra 3 giorni", "Scaduto da 2 giorni": calm wording for a payment due date. */
export function dueText(daysUntil: number): string {
  if (daysUntil === 0) return "Scade oggi";
  if (daysUntil === 1) return "Scade domani";
  if (daysUntil > 1) return `Scade tra ${daysUntil} giorni`;
  return daysUntil === -1 ? "Scaduto ieri" : `Scaduto da ${-daysUntil} giorni`;
}

export const STATUS_LABELS: Readonly<Record<ItemStatus, string>> = {
  planned: "Previsto",
  agreed: "Concordato",
  cancelled: "Annullata",
};

export const KIND_LABELS: Readonly<Record<PaymentKind, string>> = {
  deposit: "Acconto",
  balance: "Saldo",
  other: "Altro",
};

export const ITEM_STATUSES: readonly ItemStatus[] = ["planned", "agreed", "cancelled"];
export const PAYMENT_KINDS: readonly PaymentKind[] = ["deposit", "balance", "other"];

export function asStatus(value: string): ItemStatus {
  return value === "agreed" || value === "cancelled" ? value : "planned";
}

export function asKind(value: string): PaymentKind {
  return value === "deposit" || value === "balance" ? value : "other";
}

// ---------------------------------------------------------------------------------------------
// Database errors to Italian messages. Allowlist: anything else becomes the generic text, so a
// raw database message never reaches the screen.
// ---------------------------------------------------------------------------------------------

export const GENERIC_ERROR = "Non sono riuscito a salvare. Riprova tra un attimo.";

const ERROR_MESSAGES: Readonly<Record<string, string>> = {
  category_not_empty: "Questa categoria ha ancora delle voci: spostale prima in un'altra.",
  category_deleted: "Questa categoria non c'è più: scegline un'altra.",
  category_not_found: "Questa categoria non c'è più: scegline un'altra.",
  same_category: "Scegli una categoria diversa da questa.",
  forbidden: "Non hai il permesso di farlo.",
  invalid_amount: MONEY_ERROR_MESSAGE,
  duplicate: "Esiste già.",
  not_found: "Questo elemento non c'è più. Ho ricaricato la pagina.",
};

export const STALE_CODES: ReadonlySet<string> = new Set([
  "category_deleted",
  "category_not_found",
  "not_found",
]);

/** `{ code, message }` of a Supabase/PostgREST error: our business codes arrive as the message. */
export function mapDbError(error: { code?: string; message?: string } | null | undefined): {
  code: string;
  message: string;
} {
  if (!error) return { code: "unknown", message: GENERIC_ERROR };
  if (error.code === "42501") return { code: "forbidden", message: ERROR_MESSAGES["forbidden"]! };
  // Check constraint (amount range, name length): the forms already say why, this is the net.
  if (error.code === "23514") return { code: "invalid_amount", message: MONEY_ERROR_MESSAGE };
  if (error.code === "23505") return { code: "duplicate", message: ERROR_MESSAGES["duplicate"]! };
  const code = (error.message ?? "").trim();
  const text = ERROR_MESSAGES[code];
  if (text) return { code, message: text };
  return { code: "unknown", message: GENERIC_ERROR };
}

// ---------------------------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------------------------

export interface PartnerRow {
  user_id: string | null;
  first_name: string | null;
  last_name: string | null;
  label: string | null;
}

export interface NameBook {
  nameOf(userId: string | null): string;
  partner: string;
}

export function nameBook(partners: readonly PartnerRow[], meUserId: string): NameBook {
  const byUser = new Map(partners.filter((p) => p.user_id).map((p) => [p.user_id as string, p]));
  const other = partners.find((p) => p.user_id !== meUserId);
  const name = (p: PartnerRow | undefined, fallback: string) =>
    displayName(p ? { firstName: p.first_name, label: p.label } : null, fallback);
  return {
    nameOf: (userId) => (userId ? name(byUser.get(userId), PARTNER_FALLBACK) : SYSTEM_ACTOR),
    partner: name(other, PARTNER_FALLBACK),
  };
}

// ---------------------------------------------------------------------------------------------
// Rows to view models
// ---------------------------------------------------------------------------------------------

export function buildSnapshot(input: {
  weddingId: string;
  versions: readonly Tables<"budget_versions">[];
  categories: readonly Tables<"budget_categories">[];
  items: readonly Tables<"budget_items">[];
  payments: readonly Tables<"payments">[];
  partners: readonly PartnerRow[];
  meUserId: string;
}): BudgetSnapshot {
  const names = nameBook(input.partners, input.meUserId);

  const versions: VersionView[] = input.versions
    .toSorted(
      (a, b) =>
        (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0) ||
        (a.id < b.id ? 1 : -1),
    )
    .map((v) => ({
      id: v.id,
      totalCents: v.total_cents,
      createdAt: v.created_at,
      reason: v.reason,
      authorName: names.nameOf(v.created_by),
    }));

  const categories: CategoryView[] = input.categories
    .filter((c) => c.deleted_at === null)
    .toSorted((a, b) => a.sort_order - b.sort_order || (a.created_at < b.created_at ? -1 : 1))
    .map((c) => ({
      id: c.id,
      name: c.name,
      assignedCents: c.assigned_cents,
      sortOrder: c.sort_order,
      version: c.version,
      defaultKey: c.default_key,
    }));
  const liveCategories = new Set(categories.map((c) => c.id));

  const items: ItemView[] = input.items
    .filter((i) => i.deleted_at === null && liveCategories.has(i.category_id))
    .toSorted((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))
    .map((i) => ({
      id: i.id,
      categoryId: i.category_id,
      description: i.description,
      status: asStatus(i.status),
      plannedCents: i.planned_cents,
      agreedCents: i.agreed_cents,
      version: i.version,
    }));
  const liveItems = new Set(items.map((i) => i.id));

  const payments: PaymentView[] = input.payments
    .filter((p) => p.deleted_at === null && liveItems.has(p.item_id))
    .toSorted((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))
    .map((p) => ({
      id: p.id,
      itemId: p.item_id,
      kind: asKind(p.kind),
      amountCents: p.amount_cents,
      dueDate: p.due_date,
      paid: p.paid,
      paidOn: p.paid_on,
      version: p.version,
    }));

  return {
    weddingId: input.weddingId,
    versions,
    categories,
    items,
    payments,
    partnerName: names.partner,
  };
}

/** The snapshot as input of the pure budget code (`@/domain/budget`). */
export function budgetInput(snapshot: BudgetSnapshot): BudgetInput {
  return {
    versions: snapshot.versions,
    categories: snapshot.categories,
    items: snapshot.items,
    payments: snapshot.payments,
  };
}

// ---------------------------------------------------------------------------------------------
// Forms (mirror the table checks so the user sees the problem before the round trip)
// ---------------------------------------------------------------------------------------------

export type FormErrors<K extends string> = Partial<Record<K, string>>;

type Parsed<T, K extends string> = { ok: true; input: T } | { ok: false; errors: FormErrors<K> };

/** "" = no amount. Otherwise an amount or the AC38 error. */
function parseOptionalAmount(text: string): { ok: true; cents: Cents | null } | { ok: false } {
  if (text.trim() === "") return { ok: true, cents: null };
  const result = parseEuroToCents(text);
  return result.ok ? { ok: true, cents: result.cents } : { ok: false };
}

export function parseTotalForm(values: {
  totalText: string;
  reason: string;
}): Parsed<{ totalCents: Cents; reason: string | null }, "totalText" | "reason"> {
  const errors: FormErrors<"totalText" | "reason"> = {};
  const total = parseOptionalAmount(values.totalText);
  if (!total.ok) errors.totalText = MONEY_ERROR_MESSAGE;
  else if (total.cents === null) errors.totalText = "Scrivi il totale in euro, ad esempio 25.000.";
  const reason = values.reason.trim();
  if (reason.length > REASON_MAX)
    errors.reason = `Il motivo è troppo lungo (massimo ${REASON_MAX} caratteri).`;
  if (Object.keys(errors).length > 0 || !total.ok || total.cents === null) {
    return { ok: false, errors };
  }
  return { ok: true, input: { totalCents: total.cents, reason: reason === "" ? null : reason } };
}

export function parseCategoryNameForm(name: string): Parsed<{ name: string }, "name"> {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (trimmed === "") return { ok: false, errors: { name: "Scrivi un nome." } };
  if (trimmed.length > CATEGORY_NAME_MAX) {
    return {
      ok: false,
      errors: { name: `Il nome è troppo lungo (massimo ${CATEGORY_NAME_MAX} caratteri).` },
    };
  }
  return { ok: true, input: { name: trimmed } };
}

/** Assegnato: empty = "non assegnato" (D37). */
export function parseAssignedForm(
  text: string,
): Parsed<{ assignedCents: Cents | null }, "assignedText"> {
  const parsed = parseOptionalAmount(text);
  if (!parsed.ok) return { ok: false, errors: { assignedText: MONEY_ERROR_MESSAGE } };
  return { ok: true, input: { assignedCents: parsed.cents } };
}

export interface ItemFormValues {
  description: string;
  status: ItemStatus;
  plannedText: string;
  agreedText: string;
}

export type ItemFormField = keyof ItemFormValues;

export function parseItemForm(values: ItemFormValues): Parsed<ItemInput, ItemFormField> {
  const errors: FormErrors<ItemFormField> = {};
  const description = values.description.trim().replace(/\s+/g, " ");
  if (description === "") errors.description = "Scrivi cos'è questa voce.";
  else if (description.length > DESCRIPTION_MAX) {
    errors.description = `La descrizione è troppo lunga (massimo ${DESCRIPTION_MAX} caratteri).`;
  }
  const planned = parseOptionalAmount(values.plannedText);
  if (!planned.ok) errors.plannedText = MONEY_ERROR_MESSAGE;
  const agreed = values.status === "agreed" ? parseOptionalAmount(values.agreedText) : null;
  if (agreed && !agreed.ok) errors.agreedText = MONEY_ERROR_MESSAGE;
  if (Object.keys(errors).length > 0 || !planned.ok) return { ok: false, errors };
  return {
    ok: true,
    input: {
      description,
      status: values.status,
      plannedCents: planned.cents ?? 0,
      agreedCents: agreed && agreed.ok ? agreed.cents : null,
    },
  };
}

export function itemToFormValues(item: ItemView | null): ItemFormValues {
  return {
    description: item?.description ?? "",
    status: item?.status ?? "planned",
    plannedText: item && item.plannedCents > 0 ? centsText(item.plannedCents) : "",
    agreedText: item?.agreedCents != null ? centsText(item.agreedCents) : "",
  };
}

export interface PaymentFormValues {
  kind: PaymentKind;
  amountText: string;
  dueDate: PlainDate | "";
  paid: boolean;
  paidOn: PlainDate | "";
}

export type PaymentFormField = keyof PaymentFormValues;

export function parsePaymentForm(
  values: PaymentFormValues,
): Parsed<PaymentInput, PaymentFormField> {
  const errors: FormErrors<PaymentFormField> = {};
  const amount = values.amountText.trim() === "" ? null : parseEuroToCents(values.amountText);
  if (!amount || !amount.ok) errors.amountText = MONEY_ERROR_MESSAGE;
  if (values.dueDate !== "" && !isPlainDate(values.dueDate)) errors.dueDate = "Data non valida.";
  if (values.paid && values.paidOn !== "" && !isPlainDate(values.paidOn)) {
    errors.paidOn = "Data non valida.";
  }
  if (Object.keys(errors).length > 0 || !amount || !amount.ok) return { ok: false, errors };
  return {
    ok: true,
    input: {
      kind: values.kind,
      amountCents: amount.cents,
      dueDate: values.dueDate === "" ? null : values.dueDate,
      paid: values.paid,
      // A payment still to make never carries a payment date (table check).
      paidOn: values.paid && values.paidOn !== "" ? values.paidOn : null,
    },
  };
}

export function paymentToFormValues(
  payment: PaymentView | null,
  today: PlainDate,
): PaymentFormValues {
  return {
    kind: payment?.kind ?? "deposit",
    amountText: payment ? centsText(payment.amountCents) : "",
    dueDate: payment?.dueDate ?? "",
    paid: payment?.paid ?? false,
    paidOn: payment?.paidOn ?? (payment ? "" : today),
  };
}

/** Same text the MoneyInput shows after blur ("1.500,00"), for prefilled fields. */
export function centsText(cents: Cents): string {
  return formatCents(cents);
}
