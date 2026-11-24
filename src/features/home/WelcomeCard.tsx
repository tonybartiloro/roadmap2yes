"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { dismissWelcomeAction } from "./actions";
import { useLocalFlag } from "./local-flag";

/**
 * "Ciao {nome}, ti stavamo aspettando" (design §3.3, DES-20): the second partner's first visit,
 * instead of "Novità". "Ho capito" is saved with `dismiss_welcome`; if that fails the card is
 * hidden on this device (`localStorage`) so it never gets stuck.
 */
export function WelcomeCard({
  userId,
  name,
  partnerName,
}: {
  userId: string;
  name: string;
  partnerName: string;
}) {
  const [hiddenHere, hideHere] = useLocalFlag(`r2y-welcome-dismissed:${userId}`);
  const [closed, setClosed] = useState(false);
  const [pending, startTransition] = useTransition();
  if (hiddenHere || closed) return null;

  const dismiss = () =>
    startTransition(async () => {
      const result = await dismissWelcomeAction();
      if (result.ok) setClosed(true);
      else hideHere(true);
    });

  return (
    <section
      aria-labelledby="home-welcome"
      className="border-border bg-card flex flex-col gap-3 rounded-lg border p-4 md:col-span-2"
    >
      <h2 id="home-welcome" className="text-[22px] leading-7 font-semibold">
        {name ? `Ciao ${name}, ti stavamo aspettando` : "Ciao, ti stavamo aspettando"}
      </h2>
      <p>
        {partnerName} ha già preparato un po&apos; di cose. Dai un&apos;occhiata e correggi quello
        che non ti torna.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/percorso">Guarda il Percorso</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/altro/profili">Controlla i tuoi dati</Link>
        </Button>
        <Button type="button" variant="ghost" onClick={dismiss} disabled={pending}>
          Ho capito
        </Button>
      </div>
    </section>
  );
}
