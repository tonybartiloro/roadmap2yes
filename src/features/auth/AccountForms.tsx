"use client";

import { useActionState, useState } from "react";
import { AccessCodeField } from "@/components/AccessCodeField";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AccessCodeSubject } from "@/lib/access-code";
import { changeCodeAction, changeEmailAction } from "./actions";
import { IDLE, type FormState } from "./form-state";
import { FormFeedback, SubmitButton, fieldError } from "./form-parts";

/**
 * `/altro/account` forms. The current code is always required (checked on the server under the
 * login limiter). Codes are never kept in drafts and the fields are cleared after a success.
 */

/** Runs `clear` once per new successful result (state adjusted during render, no effect). */
function useClearOnSuccess(state: FormState, clear: () => void) {
  const [seen, setSeen] = useState<FormState>(state);
  if (state !== seen) {
    setSeen(state);
    if (state.status === "success") clear();
  }
}

export function ChangeCodeForm({
  forced,
  subject,
}: {
  /** Arrived through the forced change after a temporary code. */
  forced: boolean;
  subject: AccessCodeSubject;
}) {
  const [state, action] = useActionState(changeCodeAction, IDLE);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");

  useClearOnSuccess(state, () => {
    setCurrent("");
    setNext("");
  });

  return (
    <form action={action} className="flex flex-col gap-5" data-testid="change-code-form">
      {forced ? <input type="hidden" name="forced" value="1" /> : null}
      {/* Lets password managers update the right entry (REV-13). */}
      <input
        type="text"
        name="username"
        autoComplete="username"
        value={subject.email ?? ""}
        readOnly
        tabIndex={-1}
        aria-hidden
        className="sr-only"
      />

      <AccessCodeField
        label={forced ? "Il codice temporaneo" : "Il codice di adesso"}
        name="currentCode"
        mode="current"
        value={current}
        onChange={setCurrent}
        error={fieldError(state, "currentCode")}
      />
      <AccessCodeField
        label="Il nuovo codice"
        name="newCode"
        mode="new"
        value={next}
        onChange={setNext}
        subject={subject}
        error={fieldError(state, "newCode")}
      />
      <FormFeedback state={state} testId="change-code-feedback" />
      <SubmitButton>Cambia il codice</SubmitButton>
    </form>
  );
}

export function ChangeEmailForm({ currentEmail }: { currentEmail: string }) {
  const [state, action] = useActionState(changeEmailAction, IDLE);
  const [email, setEmail] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");

  useClearOnSuccess(state, () => {
    setEmail("");
    setConfirm("");
    setCode("");
  });

  const emailError = fieldError(state, "newEmail");
  const confirmError = fieldError(state, "newEmailConfirm");
  return (
    <form action={action} className="flex flex-col gap-5" data-testid="change-email-form">
      <p className="text-muted-foreground" data-testid="email-is-login">
        L&apos;email è il tuo accesso: ora entri con <strong>{currentEmail}</strong>. Scrivila due
        volte per evitare refusi.
      </p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-email">La nuova email</Label>
        <Input
          id="new-email"
          name="newEmail"
          type="email"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          value={email}
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? "new-email-error" : undefined}
          onChange={(event) => setEmail(event.target.value)}
        />
        {emailError ? (
          <p id="new-email-error" className="text-destructive text-sm">
            {emailError}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-email-confirm">Scrivila di nuovo</Label>
        <Input
          id="new-email-confirm"
          name="newEmailConfirm"
          type="email"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          value={confirm}
          aria-invalid={confirmError ? true : undefined}
          aria-describedby={confirmError ? "new-email-confirm-error" : undefined}
          onChange={(event) => setConfirm(event.target.value)}
        />
        {confirmError ? (
          <p id="new-email-confirm-error" className="text-destructive text-sm">
            {confirmError}
          </p>
        ) : null}
      </div>
      <AccessCodeField
        label="Il tuo codice di adesso"
        name="currentCode"
        mode="current"
        id="email-current-code"
        value={code}
        onChange={setCode}
        error={fieldError(state, "currentCode")}
      />
      <FormFeedback state={state} testId="change-email-feedback" />
      <SubmitButton>Cambia l&apos;email</SubmitButton>
    </form>
  );
}
