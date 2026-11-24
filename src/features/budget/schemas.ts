import { z } from "zod";
import { isPlainDate } from "@/lib/dates/plain-date";
import { MAX_CENTS } from "@/lib/money";
import { CATEGORY_NAME_MAX, DESCRIPTION_MAX, REASON_MAX } from "./model";

/**
 * Shape of what the client sends to the server actions. The database checks stay the real guard
 * (RLS, constraints, RPC rules); this only rejects garbage early with a clean error.
 */
const uuid = z.string().uuid();
const version = z.number().int().min(1);
const cents = z.number().int().min(0).max(MAX_CENTS);
const plainDate = z.string().refine(isPlainDate, "data non valida");
const name = z.string().trim().min(1).max(CATEGORY_NAME_MAX);

export const itemInputSchema = z.object({
  description: z.string().trim().min(1).max(DESCRIPTION_MAX),
  status: z.enum(["planned", "agreed", "cancelled"]),
  plannedCents: cents,
  agreedCents: cents.nullable(),
});

export const paymentInputSchema = z
  .object({
    kind: z.enum(["deposit", "balance", "other"]),
    amountCents: cents,
    dueDate: plainDate.nullable(),
    paid: z.boolean(),
    paidOn: plainDate.nullable(),
  })
  .refine((p) => p.paid || p.paidOn === null, "paidOn senza pagamento");

export const schemas = {
  setTotal: z.object({ totalCents: cents, reason: z.string().trim().max(REASON_MAX).nullable() }),
  addCategory: z.object({ name, assignedCents: cents.nullable().optional() }),
  updateCategory: z.object({
    categoryId: uuid,
    version,
    name: name.optional(),
    assignedCents: cents.nullable().optional(),
  }),
  versionedCategory: z.object({ categoryId: uuid, version }),
  moveAndDelete: z.object({ fromId: uuid, toId: uuid }),
  addItem: z.object({ categoryId: uuid, item: itemInputSchema }),
  updateItem: z.object({ itemId: uuid, version, item: itemInputSchema }),
  versionedItem: z.object({ itemId: uuid, version }),
  addPayment: z.object({ itemId: uuid, payment: paymentInputSchema }),
  updatePayment: z.object({ paymentId: uuid, version, payment: paymentInputSchema }),
  versionedPayment: z.object({ paymentId: uuid, version }),
};
