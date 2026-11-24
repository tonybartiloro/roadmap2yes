"use client";

import { useActionState, useState } from "react";
import { AccessCodeField } from "@/components/AccessCodeField";
import { FormFeedback, SubmitButton, fieldError } from "@/features/auth/form-parts";
import { IDLE } from "@/features/auth/form-state";
import { acceptInviteAction } from "./accept-action";

/**
 * `/invito/[token]`: the link carries only the one-time token (a hidden field), consumed by the POST
 * of this form together with the code B chooses; opening the page changes nothing.
 */
export function AcceptInviteForm({
  token,
  maskedEmail,
}: {
  token: string;
  maskedEmail: string | null;
}) {
  const [state, action] = useActionState(acceptInviteAction, IDLE);
  const [code, setCode] = useState("");
  return (
    <form action={action} className="flex flex-col gap-5" data-testid="accept-invite-form">
      <input type="hidden" name="token" value={token} />
      {maskedEmail ? (
        <p className="text-muted-foreground" data-testid="invite-masked-email">
          Entri con <strong>{maskedEmail}</strong> e con il codice che scegli adesso.
        </p>
      ) : null}
      <AccessCodeField
        label="Il tuo codice"
        name="code"
        mode="new"
        id="invite-code"
        value={code}
        onChange={setCode}
        error={fieldError(state, "code")}
      />
      <FormFeedback state={state} testId="accept-invite-feedback" />
      <SubmitButton>Continua con la tua email</SubmitButton>
    </form>
  );
}
