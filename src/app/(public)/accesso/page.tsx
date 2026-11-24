import type { Metadata } from "next";
import { connection } from "next/server";
import { PublicShell } from "@/components/PublicShell";
import { emailEnabled } from "@/lib/email";
import { LoginForm } from "@/features/auth/LoginForm";

export const metadata: Metadata = {
  title: "Entra",
  robots: { index: false, follow: false },
};

/**
 * Login (design §3.1, AC54): email + access code, works without any email provider. Whether emails
 * are on is read per request (runtime configuration), so "Hai dimenticato il codice?" is right.
 */
export default async function AccessPage() {
  await connection();
  return (
    <PublicShell>
      <h1 className="font-heading mb-6 text-[28px] leading-9">Entra in roadmap2yes</h1>
      <LoginForm emailEnabled={emailEnabled()} />
    </PublicShell>
  );
}
