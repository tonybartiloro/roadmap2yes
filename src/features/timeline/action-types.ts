import type { TaskFields } from "./field-labels";

/**
 * Result contract of the Percorso server actions. Plain data only (it crosses the server/client
 * boundary): never an Error instance, never a row with secrets.
 */
export type ActionErrorCode =
  | "forbidden"
  | "invalid"
  | "not_found"
  | "decision_taken"
  | "invalid_option"
  | "too_many_tasks"
  | "unavailable"
  | "unknown";

export interface ConflictInfo {
  /** Version to send back with "Salva comunque". */
  readonly currentVersion: number;
  readonly changedByName: string | null;
  /** ISO instant of the other change. */
  readonly changedAt: string | null;
  /** The other partner's version of the task. */
  readonly theirs: TaskFields;
}

export type ActionResult<T = null> =
  | { readonly ok: true; readonly data: T }
  | {
      readonly ok: false;
      readonly code: ActionErrorCode;
      readonly message: string;
      /** Present when the write was refused because the task changed meanwhile (AC40). */
      readonly conflict?: ConflictInfo;
    };

export interface TaskSaved {
  readonly id: string;
  readonly version: number;
}

export interface ReferenceSet {
  /** The manual reference before the change (null = automatic): "Annulla" sends it back. */
  readonly previousOptionId: string | null;
  readonly referenceDate: string | null;
}

export const ERROR_MESSAGES: Record<ActionErrorCode, string> = {
  forbidden: "Non hai il permesso per farlo.",
  invalid: "Controlla i dati e riprova.",
  not_found: "Questo elemento non c'è più.",
  decision_taken: "La data è già stata scelta: per cambiare il riferimento riapri la scelta.",
  invalid_option: "Questo scenario non è più disponibile. Ricarica e riprova.",
  too_many_tasks: "Hai raggiunto il numero massimo di compiti.",
  unavailable: "Non riesco a raggiungere il servizio. Riprova tra poco.",
  unknown: "Non sono riuscito a salvare. Riprova.",
};
