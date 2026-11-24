import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { KeyRound } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ChangeCodeForm, ChangeEmailForm } from "@/features/auth/AccountForms";
import { SignOutButton } from "@/features/auth/SignOutButton";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Il tuo accesso" };

type SearchParams = Promise<{ obbligatorio?: string | string[] }>;

type PartnerRow = { first_name: string | null; last_name: string | null };

/**
 * Altro > Account (AC56, AC58, D51, D53). Change of the OWN code (current code required) and of the
 * OWN login email (typed twice + current code). `?obbligatorio=1` is the forced change after a
 * temporary code: the proxy keeps the person here until the code is changed. The checks are all on
 * the server (limiter, DB step, admin step): this page only presents them.
 */
export default async function AccountPage({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  const email = data?.claims?.email;
  if (!userId || typeof email !== "string") redirect("/accesso");

  const raw = (await searchParams).obbligatorio;
  const forced = (Array.isArray(raw) ? raw[0] : raw) === "1";

  const { data: rows } = await supabase
    .from("wedding_partners")
    .select("first_name,last_name")
    .eq("user_id", userId)
    .limit(1);
  const person = (rows as PartnerRow[] | null)?.[0];

  return (
    <div className="flex max-w-xl flex-col gap-8">
      <h1 className="font-heading text-[28px] leading-9">Il tuo accesso</h1>

      {forced ? (
        <Alert variant="warning" data-testid="forced-change-banner">
          <KeyRound aria-hidden className="size-5" />
          <AlertTitle>Scegli un codice tutto tuo</AlertTitle>
          <AlertDescription>
            Hai un codice temporaneo. Per continuare scegline uno nuovo: da ora entri con quello.
          </AlertDescription>
        </Alert>
      ) : null}

      <section aria-labelledby="account-code" className="flex flex-col gap-4">
        <h2 id="account-code" className="text-xl font-semibold">
          Cambia il codice
        </h2>
        {forced ? null : (
          <p className="text-muted-foreground" data-testid="code-suggestion">
            Se il codice te l&apos;ha dato qualcun altro, ti conviene cambiarlo con uno solo tuo.
          </p>
        )}
        <ChangeCodeForm
          forced={forced}
          subject={{
            email,
            firstName: person?.first_name ?? null,
            lastName: person?.last_name ?? null,
          }}
        />
      </section>

      {forced ? null : (
        <section aria-labelledby="account-email" className="flex flex-col gap-4">
          <h2 id="account-email" className="text-xl font-semibold">
            Cambia l&apos;email di accesso
          </h2>
          <ChangeEmailForm currentEmail={email} />
        </section>
      )}

      <section aria-label="Esci">
        <SignOutButton>Esci</SignOutButton>
      </section>
    </div>
  );
}
