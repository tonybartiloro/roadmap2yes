"use client";

import { useActionState, useRef, useState, type ComponentProps } from "react";
import { Check, Copy } from "lucide-react";
import { AccessCodeField } from "@/components/AccessCodeField";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormFeedback, SubmitButton, fieldError } from "@/features/auth/form-parts";
import { IDLE } from "@/features/auth/form-state";
import {
  changePendingEmailAction,
  createPartnerWithCodeAction,
  inviteByEmailAction,
  resendInviteAction,
  revokeInviteAction,
  setTemporaryCodeAction,
} from "./actions";
import type { InviteFormState } from "./form-state";

/**
 * Forms of Altro > Invito. Codes are typed or generated here, sent once and cleared after a
 * success: they are never shown again and never kept in drafts. The one-time link of an email
 * invite is shown right after sending (it is not stored, so it cannot be shown later).
 */

/** Runs `clear` once per new successful result (state adjusted during render, no effect). */
function useClearOnSuccess(state: InviteFormState, clear: () => void) {
  const [seen, setSeen] = useState<InviteFormState>(state);
  if (state !== seen) {
    setSeen(state);
    if (state.status === "success") clear();
  }
}

type TextFieldProps = {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  required?: boolean;
  type?: "text" | "email";
  autoComplete?: ComponentProps<typeof Input>["autoComplete"];
};

function TextField({
  id,
  name,
  label,
  value,
  onChange,
  error,
  required,
  type = "text",
  autoComplete = "off",
}: TextFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        type={type}
        inputMode={type === "email" ? "email" : undefined}
        autoComplete={autoComplete}
        autoCapitalize={type === "email" ? "none" : undefined}
        autoCorrect="off"
        spellCheck={false}
        required={required}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? (
        <p id={`${id}-error`} className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** The one-time link, readonly and copyable (WhatsApp and the like). */
export function LinkBox({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      input.current?.select();
    }
  }
  return (
    <div className="flex flex-col gap-1.5" data-testid="invite-link-box">
      <Label htmlFor="invite-link">Link dell&apos;invito (vale 7 giorni, una volta sola)</Label>
      <div className="flex gap-2">
        <Input
          id="invite-link"
          ref={input}
          readOnly
          value={link}
          onFocus={(e) => e.target.select()}
        />
        <Button type="button" variant="outline" onClick={copy} data-testid="invite-link-copy">
          {copied ? (
            <Check aria-hidden className="size-5" />
          ) : (
            <Copy aria-hidden className="size-5" />
          )}
          {copied ? "Copiato" : "Copia link"}
        </Button>
      </div>
    </div>
  );
}

function linkOf(state: InviteFormState): string | null {
  return state.status === "success" && "link" in state ? state.link : null;
}

type PartnerDefaults = { email: string; firstName: string; lastName: string; label: string };

// -------------------------------------------------------------------------------- B with a code

export function CreateWithCodeForm({ defaults }: { defaults: PartnerDefaults }) {
  const [state, action] = useActionState(createPartnerWithCodeAction, IDLE);
  const [email, setEmail] = useState(defaults.email);
  const [firstName, setFirstName] = useState(defaults.firstName);
  const [lastName, setLastName] = useState(defaults.lastName);
  const [label, setLabel] = useState(defaults.label);
  const [code, setCode] = useState("");

  useClearOnSuccess(state, () => setCode(""));

  return (
    <form action={action} className="flex flex-col gap-5" data-testid="create-with-code-form">
      <TextField
        id="partner-email"
        name="email"
        type="email"
        label="Email del tuo partner"
        required
        value={email}
        onChange={setEmail}
        error={fieldError(state, "email")}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          id="partner-first-name"
          name="firstName"
          label="Nome (facoltativo)"
          autoComplete="off"
          value={firstName}
          onChange={setFirstName}
        />
        <TextField
          id="partner-last-name"
          name="lastName"
          label="Cognome (facoltativo)"
          autoComplete="off"
          value={lastName}
          onChange={setLastName}
        />
      </div>
      <TextField
        id="partner-label"
        name="label"
        label="Come lo chiami (facoltativo, es. sposo)"
        value={label}
        onChange={setLabel}
      />
      <AccessCodeField
        label="Il codice iniziale"
        name="code"
        mode="new"
        id="partner-code"
        value={code}
        onChange={setCode}
        subject={{ email, firstName, lastName }}
        error={fieldError(state, "code")}
      />
      <p className="text-muted-foreground text-sm">
        Consegnalo di persona: dopo la conferma non lo rivedrai. Il tuo partner potrà cambiarlo
        quando vuole.
      </p>
      <FormFeedback state={state} testId="create-with-code-feedback" />
      <SubmitButton>Crea l&apos;accesso</SubmitButton>
    </form>
  );
}

// ------------------------------------------------------------------------------- B by email

export function InviteByEmailForm({ defaults }: { defaults: PartnerDefaults }) {
  const [state, action] = useActionState(inviteByEmailAction, IDLE);
  const [email, setEmail] = useState(defaults.email);
  const [firstName, setFirstName] = useState(defaults.firstName);
  const [lastName, setLastName] = useState(defaults.lastName);
  const link = linkOf(state);

  return (
    <form action={action} className="flex flex-col gap-5" data-testid="invite-by-email-form">
      <TextField
        id="invite-email"
        name="email"
        type="email"
        label="Email del tuo partner"
        required
        value={email}
        onChange={setEmail}
        error={fieldError(state, "email")}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          id="invite-first-name"
          name="firstName"
          label="Nome (facoltativo)"
          value={firstName}
          onChange={setFirstName}
        />
        <TextField
          id="invite-last-name"
          name="lastName"
          label="Cognome (facoltativo)"
          value={lastName}
          onChange={setLastName}
        />
      </div>
      <input type="hidden" name="label" value={defaults.label} />
      <FormFeedback state={state} testId="invite-by-email-feedback" />
      {link ? <LinkBox link={link} /> : null}
      <SubmitButton>Manda l&apos;invito</SubmitButton>
    </form>
  );
}

// ------------------------------------------------------------------------- pending invitation

export function ResendForm({ invitationId }: { invitationId: string }) {
  const [state, action] = useActionState(resendInviteAction, IDLE);
  const link = linkOf(state);
  return (
    <form action={action} className="flex flex-col gap-3" data-testid="resend-form">
      <input type="hidden" name="invitationId" value={invitationId} />
      <FormFeedback state={state} testId="resend-feedback" />
      {link ? <LinkBox link={link} /> : null}
      <SubmitButton>Invia di nuovo</SubmitButton>
      <p className="text-muted-foreground text-sm">Il link di prima smette di funzionare.</p>
    </form>
  );
}

export function RevokeForm({
  invitationId,
  partnerName,
}: {
  invitationId: string;
  partnerName: string;
}) {
  const [state, action] = useActionState(revokeInviteAction, IDLE);
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={action} className="flex flex-col gap-3" data-testid="revoke-form">
      <input type="hidden" name="invitationId" value={invitationId} />
      <FormFeedback state={state} testId="revoke-feedback" />
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button type="button" variant="outline" size="lg" data-testid="revoke-open">
            Revoca l&apos;invito
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vuoi revocare l&apos;invito?</AlertDialogTitle>
            <AlertDialogDescription>
              {partnerName} non potrà più entrare con questo invito o con il codice che gli hai
              dato. Potrai invitarlo di nuovo quando vuoi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No, lascia stare</AlertDialogCancel>
            {/* Submit FIRST: the dialog unmounts its content on click, so a native `type=submit`
                button would be gone before the browser submits (QA-1). */}
            <AlertDialogAction
              type="button"
              data-testid="revoke-confirm"
              onClick={() => formRef.current?.requestSubmit()}
            >
              Sì, revoca
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}

export function ChangePendingEmailForm({ currentEmail }: { currentEmail: string }) {
  const [state, action] = useActionState(changePendingEmailAction, IDLE);
  const [email, setEmail] = useState("");
  const link = linkOf(state);

  useClearOnSuccess(state, () => setEmail(""));

  return (
    <form action={action} className="flex flex-col gap-4" data-testid="change-pending-email-form">
      <p className="text-muted-foreground" data-testid="pending-email-current">
        Ora l&apos;invito è per <strong>{currentEmail}</strong>. Finché non entra puoi cambiarla.
      </p>
      <TextField
        id="pending-new-email"
        name="email"
        type="email"
        label="La nuova email"
        required
        value={email}
        onChange={setEmail}
        error={fieldError(state, "email")}
      />
      <FormFeedback state={state} testId="change-pending-email-feedback" />
      {link ? <LinkBox link={link} /> : null}
      <SubmitButton>Cambia email</SubmitButton>
    </form>
  );
}

// ---------------------------------------------------------------------------- temporary code

export function TemporaryCodeForm({
  partnerName,
  subject,
}: {
  partnerName: string;
  subject: { email: string; firstName: string | null; lastName: string | null };
}) {
  const [state, action] = useActionState(setTemporaryCodeAction, IDLE);
  const [code, setCode] = useState("");

  useClearOnSuccess(state, () => setCode(""));

  return (
    <form action={action} className="flex flex-col gap-5" data-testid="temp-code-form">
      <AccessCodeField
        label={`Il codice temporaneo per ${partnerName}`}
        name="code"
        mode="new"
        id="temp-code"
        value={code}
        onChange={setCode}
        subject={subject}
        error={fieldError(state, "code")}
      />
      <p className="text-muted-foreground text-sm">
        Consegnalo di persona. Chiude i suoi accessi attuali e, al prossimo ingresso, gli chiede di
        scegliere un codice tutto suo.
      </p>
      <FormFeedback state={state} testId="temp-code-feedback" />
      <SubmitButton>Imposta il codice temporaneo</SubmitButton>
    </form>
  );
}
