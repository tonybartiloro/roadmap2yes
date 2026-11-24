"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { FormFeedback, SubmitButton, fieldError } from "@/features/auth/form-parts";
import { IDLE } from "@/features/auth/form-state";
import { changePendingEmailAction } from "@/features/invitations/actions";
import type { InviteFormState } from "@/features/invitations/form-state";
import { LinkBox } from "@/features/invitations/InviteForms";
import { TextField } from "@/features/onboarding/PersonForm";

function linkOf(state: InviteFormState): string | null {
  return state.status === "success" && "link" in state ? state.link : null;
}

/**
 * A changes B's email while B has never entered (AC58, plan §4.6). The operation is T7b's
 * `changePendingEmailAction` (DB first, then Auth, with compensation): this form only calls it,
 * shows its result and refreshes the page. With an email invite pending the action sends the new link.
 */
export function PartnerEmailForm({ currentEmail }: { currentEmail: string }) {
  const router = useRouter();
  const [state, action] = useActionState(changePendingEmailAction, IDLE);
  const [email, setEmail] = useState("");

  // Clear the field once per new success (state adjusted during render, no effect).
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state.status === "success") setEmail("");
  }
  // The page shows the email too: fetch it again after a change.
  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [state, router]);

  const link = linkOf(state);
  return (
    <form action={action} className="flex flex-col gap-4" data-testid="profile-email-form">
      <p className="text-muted-foreground">
        Finché non entra puoi cambiare la sua email. Dopo il primo accesso la cambia solo lui.
      </p>
      <TextField
        id="profile-partner-email"
        name="email"
        label="Nuova email"
        type="email"
        required
        value={email}
        onChange={setEmail}
        hint={`Ora è ${currentEmail}.`}
        error={fieldError(state, "email")}
      />
      <FormFeedback state={state} testId="profile-email-feedback" />
      {link ? <LinkBox link={link} /> : null}
      <SubmitButton>Cambia email</SubmitButton>
    </form>
  );
}
