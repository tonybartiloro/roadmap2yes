"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useConflict } from "@/features/budget/use-conflict";
import type { VersionedResult } from "@/features/decisions/types";
import { Drafted } from "@/features/onboarding/form-bits";
import {
  PersonForm,
  labelOf,
  personValueOf,
  type PersonValue,
} from "@/features/onboarding/PersonForm";
import { displayName } from "@/lib/display-name";
import { savePersonAction } from "./actions";
import type { ProfilePerson, ProfilesView as View } from "./data";
import { PERSON_FIELD_LABELS } from "./field-labels";
import { GENERIC_ERROR } from "./model";
import { PartnerEmailForm } from "./PartnerEmailForm";

/**
 * Profili (AC46, AC58, design §3.7): label, first name and last name of both partners, editable by
 * either (no date of birth anywhere). Email rules: yours is your login (change it from the account
 * page); the partner's is editable only until they have entered.
 */
export function ProfilesView({ view, scope }: { view: View; scope: string }) {
  return (
    <div className="flex max-w-xl flex-col gap-10">
      <PersonCard person={view.me} scope={scope} partnerName={nameOf(view.other)} />
      {view.other ? (
        <PersonCard person={view.other} scope={scope} partnerName={nameOf(view.me)} />
      ) : (
        <EmptyState
          title="Il tuo partner non c'è ancora"
          description="Invita il tuo partner: potrai poi sistemare qui i dati."
          action={
            <Button asChild>
              <Link href="/altro/invito">Invita il tuo partner</Link>
            </Button>
          }
        />
      )}
    </div>
  );
}

const nameOf = (person: ProfilePerson | null): string =>
  displayName(person ? { firstName: person.firstName, label: person.label } : null);

function PersonCard({
  person,
  scope,
  partnerName,
}: {
  person: ProfilePerson;
  scope: string;
  /** Name of the OTHER partner (the one who may have saved first), for the conflict dialog. */
  partnerName: string;
}) {
  const saved = personValueOf(person);
  return (
    <Drafted draftKey={`profile-${person.id}`} scope={scope} saved={saved}>
      {({ initial, save, clear }) => (
        <CardForm
          key={`${person.id}-${person.version}`}
          person={person}
          initial={initial}
          save={save}
          clear={clear}
          partnerName={partnerName}
        />
      )}
    </Drafted>
  );
}

function CardForm({
  person,
  initial,
  save,
  clear,
  partnerName,
}: {
  person: ProfilePerson;
  initial: PersonValue;
  save: (value: PersonValue) => void;
  clear: () => void;
  partnerName: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missingName, setMissingName] = useState(false);

  const title = person.isMe
    ? "Tu"
    : displayName({ firstName: person.firstName, label: person.label });
  const change = (next: PersonValue) => {
    setValue(next);
    save(next);
  };

  const mine = () => ({
    firstName: value.firstName.trim() || null,
    lastName: value.lastName.trim() || null,
    label: labelOf(value),
  });
  const send = (version: number): Promise<VersionedResult> =>
    savePersonAction({ partnerId: person.id, version, ...mine() });

  const { handle, dialog } = useConflict({
    labels: PERSON_FIELD_LABELS,
    formatValue: (_field, raw) =>
      raw === null || raw === undefined || raw === "" ? "—" : String(raw),
    partnerName,
    onResolved: (result) => {
      if (result.ok) done();
      else setError(result.message);
    },
    onCancel: () => router.refresh(),
  });

  function done() {
    clear();
    toast.success("Salvato.");
    router.refresh();
  }

  async function onSubmit() {
    // Your own first name is required, like in the onboarding (it is how the app names you).
    if (person.isMe && value.firstName.trim() === "") {
      setMissingName(true);
      return;
    }
    setMissingName(false);
    setBusy(true);
    setError(null);
    try {
      const result = await send(person.version);
      if (handle(result, mine(), send)) return;
      if (result.ok) done();
      else setError(result.message);
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setBusy(false);
    }
  }

  const id = person.isMe ? "me" : "partner";
  const emailHint = person.isMe
    ? "L'email è il tuo accesso."
    : person.joined
      ? `${title} gestisce la propria email da sé, con il proprio accesso.`
      : undefined;

  return (
    <section aria-labelledby={`profile-${id}-title`} className="flex flex-col gap-5">
      {dialog}
      <h2 id={`profile-${id}-title`} className="text-xl font-semibold">
        {title}
      </h2>
      <form
        noValidate
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          void onSubmit();
        }}
        data-testid={`profile-${id}-form`}
      >
        <PersonForm
          idPrefix={`profile-${id}`}
          {...(person.isMe ? {} : { labelLegend: "Come vuoi chiamare il tuo partner?" })}
          value={value}
          onChange={change}
          firstNameRequired={person.isMe}
          firstNameError={missingName ? "Scrivi il tuo nome." : undefined}
          email={{
            kind: "readonly",
            value: person.email,
            ...(emailHint ? { hint: emailHint } : {}),
          }}
        />
        {error ? (
          <Alert variant="destructive" data-testid={`profile-${id}-error`}>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div>
          <Button
            type="submit"
            size="lg"
            disabled={busy}
            aria-busy={busy}
            data-testid={`profile-${id}-save`}
          >
            {busy ? <Loader2 aria-hidden className="size-5 animate-spin" /> : null}
            Salva
          </Button>
        </div>
      </form>

      {person.isMe ? (
        <p>
          <Link
            href="/altro/account"
            className="text-primary underline underline-offset-4"
            data-testid="profile-account-link"
          >
            Cambia la tua email o il tuo codice
          </Link>
        </p>
      ) : null}
      {!person.isMe && !person.joined ? (
        <div className="flex flex-col gap-3" data-testid="profile-partner-email-section">
          <h3 className="text-lg font-semibold">Cambia l&apos;email</h3>
          <PartnerEmailForm currentEmail={person.email} />
        </div>
      ) : null}
    </section>
  );
}
