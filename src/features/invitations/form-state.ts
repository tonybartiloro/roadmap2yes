import type { FormState } from "@/features/auth/form-state";

/**
 * State of the invite forms. An email invite also returns the one-time link, once, so the partner
 * can copy it (only its sha256 is stored: it cannot be shown again).
 */
export type InviteFormState = FormState | { status: "success"; message: string; link: string };

/** Result of the typed actions used by the onboarding (T10): plain, serializable. */
export type PartnerActionResult =
  | { ok: true; message: string; delivery?: "sent" | "not_sent"; link?: string }
  | { ok: false; error: string; message: string; field?: string };
