"use client";

import { useActionState, useState } from "react";
import { AccessCodeField } from "@/components/AccessCodeField";
import { confirmRecoveryAction } from "./actions";
import { IDLE } from "./form-state";
import { FormFeedback, SubmitButton, fieldError } from "./form-parts";

/**
 * `/auth/conferma`: the link carries only the one-time token (a hidden field); it is consumed by
 * the POST of this form together with the NEW code, never by opening the page (GET changes nothing).
 */
export function RecoveryConfirmForm({ tokenHash }: { tokenHash: string }) {
  const [state, action] = useActionState(confirmRecoveryAction, IDLE);
  const [code, setCode] = useState("");
  return (
    <form action={action} className="flex flex-col gap-5" data-testid="recovery-confirm-form">
      <input type="hidden" name="tokenHash" value={tokenHash} />
      <AccessCodeField
        label="Il tuo nuovo codice"
        name="newCode"
        mode="new"
        value={code}
        onChange={setCode}
        error={fieldError(state, "newCode")}
      />
      <FormFeedback state={state} testId="recovery-confirm-feedback" />
      <SubmitButton>Entra</SubmitButton>
    </form>
  );
}
