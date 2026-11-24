import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { APP_NAME } from "@/components/app-name";
import { getNow } from "@/lib/clock";
import { createClient } from "@/lib/supabase/server";
import pkg from "../../../../../package.json";
import { checkLabel } from "./describe-check";

export const metadata: Metadata = { title: "Info" };

/** The newest run of the daily job, or `null` when there is none or it cannot be read. */
async function lastCheck(): Promise<Date | null> {
  try {
    const db = await createClient();
    const { data, error } = await db.rpc("last_heartbeat");
    if (error || typeof data !== "string") return null;
    const at = new Date(data);
    return Number.isNaN(at.getTime()) ? null : at;
  } catch {
    return null;
  }
}

/** Altro > Info: name, version, last check of the service (the daily job's heartbeat), links. */
export default async function InfoPage() {
  await connection();
  const [check, now] = await Promise.all([lastCheck(), getNow()]);
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <h1 className="font-heading text-[28px] leading-9">Info</h1>
      <dl className="border-border bg-card divide-border divide-y rounded-lg border">
        <div className="flex justify-between gap-4 px-4 py-3">
          <dt className="text-muted-foreground">App</dt>
          <dd data-testid="info-app-name">{APP_NAME}</dd>
        </div>
        <div className="flex justify-between gap-4 px-4 py-3">
          <dt className="text-muted-foreground">Versione</dt>
          <dd data-testid="info-version">{pkg.version}</dd>
        </div>
        <div className="flex justify-between gap-4 px-4 py-3">
          <dt className="text-muted-foreground">Ultimo controllo del servizio</dt>
          <dd data-testid="info-heartbeat">{checkLabel(check, now)}</dd>
        </div>
      </dl>
      <p className="text-muted-foreground text-sm">
        Se l&apos;app non risponde, il servizio gratuito potrebbe essere in pausa per inattività:
        <Link href="/servizio" className="text-primary ml-1 underline underline-offset-4">
          cosa succede in quel caso
        </Link>
        .
      </p>
    </div>
  );
}
