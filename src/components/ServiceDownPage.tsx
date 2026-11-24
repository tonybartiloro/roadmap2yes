"use client";

import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import type { DbErrorKind } from "@/lib/supabase/errors";

const RETRY_FLAG = "r2y-service-retry";
const RETRY_WINDOW_MS = 2 * 60_000;

const noopSubscribe = () => () => {};

function readRetryFlag(reason: DbErrorKind): boolean {
  try {
    const [flagReason, time] = (window.sessionStorage.getItem(RETRY_FLAG) ?? "").split(":");
    return flagReason === reason && Date.now() - Number(time) < RETRY_WINDOW_MS;
  } catch {
    return false;
  }
}

/** Texts of design §7.3. Nobody is named; no promise of an automatic wake-up. */
const COPY: Record<DbErrorKind, { title: string; stillTitle?: string; body: string }> = {
  paused: {
    title: "L'app è in pausa.",
    stillTitle: "È ancora in pausa.",
    body: "Il servizio gratuito che conserva i tuoi dati si ferma dopo qualche giorno senza uso e non riparte da solo. I dati non sono stati toccati: serve solo che chi gestisce l'app lo riattivi dal pannello.",
  },
  unreachable: {
    title: "Non riesco a raggiungere il servizio.",
    body: "Controlla la connessione e riprova tra poco. Se continua, avvisa chi gestisce l'app.",
  },
};

/**
 * Service paused / unreachable page (AC39, D43). Never reads the database. "Riprova" is manual
 * (no polling): it reloads the page the person was on; after a retry that fails again the
 * paused page says "È ancora in pausa".
 */
export function ServiceDownPage({ reason }: { reason: DbErrorKind }) {
  // The flag is `<reason>:<time>`: only a retry from the last couple of minutes counts, so an
  // old flag can never make a fresh outage say "ancora".
  const retried = useSyncExternalStore(
    noopSubscribe,
    () => readRetryFlag(reason),
    () => false,
  );

  function retry() {
    try {
      window.sessionStorage.setItem(RETRY_FLAG, `${reason}:${Date.now()}`);
    } catch {
      // ignore
    }
    // Rewritten pages keep the original URL, so a reload re-runs the guards. On /servizio itself
    // go to the start page.
    if (window.location.pathname.startsWith("/servizio"))
      window.location.assign(new URL("/", window.location.origin).href);
    else window.location.reload();
  }

  const copy = COPY[reason];
  const title = retried && copy.stillTitle ? copy.stillTitle : copy.title;

  return (
    <section className="flex flex-col gap-4" data-reason={reason}>
      <h1 role="alert">{title}</h1>
      <p className="text-muted-foreground">{copy.body}</p>
      <div>
        <Button type="button" onClick={retry}>
          Riprova
        </Button>
      </div>
      {reason === "paused" ? (
        <details className="border-border rounded-md border p-3">
          <summary className="min-h-6 cursor-pointer font-semibold">
            Per chi gestisce l&apos;app
          </summary>
          <p className="text-muted-foreground mt-2">
            Apri il pannello Supabase e premi «Ripristina progetto»; la guida è in
            docs/technical/ambienti-e-rilascio.md.
          </p>
        </details>
      ) : null}
    </section>
  );
}
