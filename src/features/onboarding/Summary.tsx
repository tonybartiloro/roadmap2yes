"use client";

import Link from "next/link";
import { forwardRef } from "react";
import { DateScenarioList, type DateScenarioItem } from "@/components/DateScenarioList";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { formatLongDate, plural } from "@/components/format";
import { styleTipFor } from "@/content/style-tips";
import { LinkBox } from "@/features/invitations/InviteForms";
import { displayName } from "@/lib/display-name";
import { cn } from "@/lib/utils";
import type { InviteOutcome, OnboardingSummary } from "./types";

/** "Ecco il tuo percorso" (design §3.2): what was prepared, the reference, the invite, "Vai alla home". */

function scenarioItems(summary: OnboardingSummary): DateScenarioItem[] {
  return summary.state.answers.scenarios.map((scenario) => {
    const isReference =
      summary.referenceDate !== null &&
      scenario.dateFrom === summary.referenceDate &&
      summary.referenceStatus !== null;
    return {
      id: scenario.id,
      label: scenario.label ?? "",
      kind: scenario.kind,
      dateFrom: scenario.dateFrom,
      ...(scenario.dateTo ? { dateTo: scenario.dateTo } : {}),
      ...(isReference && summary.referenceStatus
        ? { isReference: true, referenceStatus: summary.referenceStatus }
        : {}),
    };
  });
}

function inviteText(invite: InviteOutcome, summary: OnboardingSummary): string {
  const partner = summary.state.partner;
  const name = displayName(partner ? { firstName: partner.firstName, label: partner.label } : null);
  switch (invite.kind) {
    case "none":
      return "Non hai ancora aggiunto il tuo partner: puoi invitarlo quando vuoi da Altro > Invito al partner.";
    case "joined":
      return `${name} è già dentro.`;
    case "later":
      return `L'invito a ${name} è da fare: lo trovi in Altro > Invito al partner.`;
    case "code_ready":
      return `L'accesso di ${name} è pronto: consegnagli il codice di persona.`;
    case "email_pending":
      return `L'invito a ${partner?.email ?? name} è già partito: lo trovi in Altro > Invito al partner.`;
    case "email_off":
      return "Le email dell'app sono spente, quindi l'invito non è partito. Da Altro > Invito al partner puoi dargli un codice di persona.";
    case "sent":
      return `Invito inviato a ${partner?.email ?? name}.`;
    case "not_sent":
      return "L'email non è partita. L'invito è in attesa: copia il link e mandalo tu.";
    case "failed":
      return `${invite.message} Puoi riprovare da Altro > Invito al partner.`;
  }
}

export const Summary = forwardRef<HTMLHeadingElement, { summary: OnboardingSummary }>(
  function Summary({ summary }, headingRef) {
    const tip = styleTipFor(summary.state.styleLabel);
    const invite = summary.invite;
    const reference =
      summary.referenceDate === null
        ? "Data da decidere: la scegli quando vuoi da Scelte."
        : `${formatLongDate(summary.referenceDate)} (${
            summary.referenceStatus === "definitive" ? "definitiva" : "provvisoria"
          })`;
    const items = scenarioItems(summary);

    return (
      <div className="flex flex-col gap-6" data-testid="onboarding-summary">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="font-heading text-[28px] leading-9 outline-none"
        >
          Ecco il tuo percorso
        </h1>
        <p data-testid="summary-tasks">
          Abbiamo preparato <strong>{plural(summary.tasksCreated, "tappa", "tappe")}</strong> per
          te.
        </p>

        <section aria-labelledby="summary-reference" className="flex flex-col gap-2">
          <h2 id="summary-reference" className="text-xl font-semibold">
            Data di riferimento
          </h2>
          <p data-testid="summary-reference">{reference}</p>
          {items.length > 0 ? <DateScenarioList items={items} /> : null}
        </section>

        <section aria-labelledby="summary-style" className="flex flex-col gap-1">
          <h2 id="summary-style" className="text-xl font-semibold">
            {tip.headline}
          </h2>
          <p className="text-muted-foreground" data-testid="summary-style-tip">
            {tip.tip}
          </p>
        </section>

        <section aria-labelledby="summary-invite" className="flex flex-col gap-2">
          <h2 id="summary-invite" className="text-xl font-semibold">
            Il tuo partner
          </h2>
          <p data-testid="summary-invite">{inviteText(invite, summary)}</p>
          {invite.kind === "sent" || invite.kind === "not_sent" ? (
            <LinkBox link={invite.link} />
          ) : null}
        </section>

        {summary.warnings.length > 0 ? (
          <Alert variant="warning" role="status" data-testid="summary-warning">
            <AlertDescription>
              {summary.warnings.includes("categories")
                ? "Le categorie del budget non sono state create: le troverai pronte aprendo Budget. "
                : ""}
              {summary.warnings.includes("budget_total")
                ? "Il budget totale non è stato salvato: puoi inserirlo da Budget."
                : ""}
            </AlertDescription>
          </Alert>
        ) : null}

        <Link
          href="/"
          className={cn(buttonVariants({ size: "lg" }), "self-start")}
          data-testid="summary-home"
        >
          Vai alla home
        </Link>
      </div>
    );
  },
);
