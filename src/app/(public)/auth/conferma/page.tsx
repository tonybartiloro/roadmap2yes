import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { PublicShell } from "@/components/PublicShell";
import { Button } from "@/components/ui/button";
import { emailEnabled } from "@/lib/email";
import { RECOVERY_LINK_INVALID } from "@/features/auth/messages";
import { RecoveryConfirmForm } from "@/features/auth/RecoveryConfirmForm";

export const metadata: Metadata = {
  title: "Nuovo codice",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ token_hash?: string | string[]; type?: string | string[] }>;

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/**
 * Recovery link (plan §4.5.4b), only when emails are on. Opening the page changes nothing: the
 * one-time token is consumed by the POST of the form (so mail scanners that open links cannot burn
 * it). Without emails, or with an unknown link type, the page says the link is not valid.
 */
export default async function ConfirmPage({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const params = await searchParams;
  const tokenHash = first(params.token_hash);
  const valid = emailEnabled() && first(params.type) === "recovery" && !!tokenHash;

  return (
    <PublicShell>
      {valid && tokenHash ? (
        <>
          <h1 className="font-heading mb-2 text-[28px] leading-9">Sei quasi dentro.</h1>
          <p className="text-muted-foreground mb-6">
            Scegli un nuovo codice: da ora entri con quello.
          </p>
          <RecoveryConfirmForm tokenHash={tokenHash} />
        </>
      ) : (
        <>
          <h1 className="font-heading mb-4 text-[28px] leading-9">Link non valido</h1>
          <p className="text-muted-foreground mb-8" data-testid="recovery-link-invalid">
            {RECOVERY_LINK_INVALID}
          </p>
          <Button asChild size="lg">
            <Link href="/accesso">Torna al login</Link>
          </Button>
        </>
      )}
    </PublicShell>
  );
}
