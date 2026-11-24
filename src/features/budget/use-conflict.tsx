"use client";

import { useState, type ReactNode } from "react";
import { ConflictDialog, type FieldLabels } from "@/components/ConflictDialog";
import type { ConflictInfo, VersionedResult } from "./types";

interface Pending {
  mine: Record<string, unknown>;
  info: ConflictInfo;
  retry: (version: number) => Promise<VersionedResult>;
}

/**
 * Edit conflict of a versioned row (AC40, BR9). `handle` returns true when the result was a
 * conflict (the dialog is then open); "Salva comunque" retries with the version the other partner
 * left, "Annulla" closes and asks the caller to reload.
 */
export function useConflict({
  labels,
  formatValue,
  partnerName,
  onResolved,
  onCancel,
}: {
  labels: FieldLabels;
  formatValue: (field: string, value: unknown) => string;
  partnerName: string;
  /** The retry ended (saved, or failed for another reason). */
  onResolved: (result: VersionedResult) => void;
  /** Conflict cancelled: the other version must be reloaded. */
  onCancel: () => void;
}): {
  handle: (
    result: VersionedResult,
    mine: Record<string, unknown>,
    retry: (version: number) => Promise<VersionedResult>,
  ) => boolean;
  dialog: ReactNode;
} {
  const [pending, setPending] = useState<Pending | null>(null);
  const [saving, setSaving] = useState(false);

  function handle(
    result: VersionedResult,
    mine: Record<string, unknown>,
    retry: (version: number) => Promise<VersionedResult>,
  ): boolean {
    if (result.ok || result.code !== "conflict" || !("conflict" in result)) return false;
    setPending({ mine, info: result.conflict, retry });
    return true;
  }

  async function forceSave(current: Pending) {
    const version = current.info.current?.["version"];
    if (typeof version !== "number") {
      // The row is gone: nothing to overwrite.
      setPending(null);
      onCancel();
      return;
    }
    setSaving(true);
    const result = await current.retry(version);
    setSaving(false);
    if (handle(result, current.mine, current.retry)) return;
    setPending(null);
    onResolved(result);
  }

  const dialog = pending ? (
    <ConflictDialog
      open
      partnerName={pending.info.changedByName ?? partnerName}
      changedAt={pending.info.changedAt ? new Date(pending.info.changedAt) : new Date()}
      labels={labels}
      mine={pending.mine}
      theirs={pending.info.current ?? {}}
      formatValue={formatValue}
      saving={saving}
      onForceSave={() => void forceSave(pending)}
      onCancel={() => {
        setPending(null);
        onCancel();
      }}
    />
  ) : null;

  return { handle, dialog };
}
