"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { plural } from "@/components/format";
import type { ActionFailure } from "@/features/decisions/types";
import { UNDO_TOAST_MS } from "@/features/timeline/copy";
import {
  bulkGuestsAction,
  emptyDeletedAction,
  purgeEntityAction,
  removeEntityAction,
  restoreEntityAction,
  undoBulkAction,
} from "./actions";
import { STALE_CODES, type BulkOp, type EmptyScope, type EntityKind } from "./data";

export interface Target {
  kind: EntityKind;
  id: string;
  version: number;
}

const STALE = "Nel frattempo qualcosa è cambiato: ho ricaricato la versione attuale.";

/**
 * The writes of the list that end in a toast with "Annulla" (>= 8 s) or in a plain toast: delete,
 * restore, delete for good, "Svuota" and the bulk actions with their undo (AC7, AC10, AC11).
 * Every failure is a fixed text from the server action; the screen is reloaded when it is stale.
 */
export function useGuestActions() {
  const router = useRouter();

  /** Shows the fixed message; reloads only when the screen is stale (conflict, "partial", gone). */
  function fail(result: ActionFailure): false {
    toast.error(result.code === "conflict" ? STALE : result.message);
    if (result.code === "conflict" || STALE_CODES.has(result.code)) router.refresh();
    return false;
  }

  function undoToast(message: string, onUndo: () => Promise<void>) {
    toast(message, {
      duration: UNDO_TOAST_MS,
      action: { label: "Annulla", onClick: () => void onUndo() },
    });
  }

  async function restore(target: Target, message = "Ripristinato."): Promise<boolean> {
    const result = await restoreEntityAction(target);
    if (!result.ok) return fail(result);
    toast(message);
    return true;
  }

  /** Soft delete with the "Annulla" toast that puts it back. */
  async function remove(target: Target, label: string): Promise<boolean> {
    const result = await removeEntityAction(target);
    if (!result.ok) return fail(result);
    const version = result.data.version;
    undoToast(`${label} eliminato.`, async () => {
      const back = await restoreEntityAction({ ...target, version });
      if (!back.ok) fail(back);
    });
    return true;
  }

  async function purge(target: { kind: EntityKind; id: string }): Promise<boolean> {
    const result = await purgeEntityAction(target);
    if (!result.ok) return fail(result);
    toast("Eliminato per sempre.");
    return true;
  }

  async function empty(scope: EmptyScope): Promise<boolean> {
    const result = await emptyDeletedAction({ scope });
    if (!result.ok) return fail(result);
    toast("Eliminati per sempre.");
    return true;
  }

  /** Assign to a group/table, delete or restore many people; "Annulla" replays `previous`. */
  async function bulk(
    op: BulkOp,
    ids: readonly string[],
    message: (changed: number) => string,
    target?: string,
  ): Promise<boolean> {
    const result = await bulkGuestsAction({ ids, op, ...(target ? { target } : {}) });
    if (!result.ok) return fail(result);
    const { previous, changed } = result.data;
    undoToast(message(changed), async () => {
      const back = await undoBulkAction({ previous });
      if (back.ok)
        toast(
          `Annullato: ${plural(back.data.restored, "persona ripristinata", "persone ripristinate")}.`,
        );
      else fail(back);
    });
    return true;
  }

  return { remove, restore, purge, empty, bulk };
}
