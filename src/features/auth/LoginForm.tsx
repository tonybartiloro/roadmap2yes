"use client";

import { useActionState, useState } from "react";
import { AccessCodeField } from "@/components/AccessCodeField";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestRecoveryAction, signInAction } from "./actions";
import { IDLE } from "./form-state";
import { FormFeedback, SubmitButton } from "./form-parts";

/**
 * `/accesso`: email + access code. Password-manager friendly (`autocomplete` username /
 * current-password, real field names, paste allowed). Errors are neutral and come from the server.
 * "Hai dimenticato il codice?" depends on whether emails are on (plan §4.5.4): with emails a
 * recovery link is offered, without them the page explains the temporary code of the partner.
 */
export function LoginForm({ emailEnabled }: { emailEnabled: boolean }) {
  const [state, action] = useActionState(signInAction, IDLE);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");

  return (
    <div className="flex flex-col gap-8">
      <form action={action} className="flex flex-col gap-5" data-testid="login-form">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="login-email">La tua email</Label>
          <Input
            id="login-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <AccessCodeField
          label="Il tuo codice d'accesso"
          name="code"
          mode="current"
          value={code}
          onChange={setCode}
        />
        <FormFeedback state={state} testId="login-feedback" />
        <SubmitButton>Entra</SubmitButton>
      </form>

      <details className="text-base" data-testid="forgot-code">
        <summary className="text-primary min-h-11 cursor-pointer py-2 font-medium underline underline-offset-4">
          Hai dimenticato il codice?
        </summary>
        <div className="mt-3">
          {emailEnabled ? (
            <RecoveryRequest />
          ) : (
            <p className="text-muted-foreground" data-testid="forgot-code-no-email">
              Chiedi al tuo partner di impostarti un codice temporaneo: lo fa da Opzioni, nella
              sezione del tuo accesso. Con quello entri e scegli subito il tuo. Se nessuno dei due
              ricorda il codice, serve un reset da parte di chi gestisce l&apos;app.
            </p>
          )}
        </div>
      </details>
    </div>
  );
}

function RecoveryRequest() {
  const [state, action] = useActionState(requestRecoveryAction, IDLE);
  return (
    <form action={action} className="flex flex-col gap-4" data-testid="recovery-form">
      <p className="text-muted-foreground">
        Scrivi la tua email: se può entrare, ti mandiamo un link per scegliere un nuovo codice.
      </p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="recovery-email">La tua email</Label>
        <Input
          id="recovery-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
        />
      </div>
      <FormFeedback state={state} testId="recovery-feedback" />
      <SubmitButton>Mandami il link</SubmitButton>
    </form>
  );
}
