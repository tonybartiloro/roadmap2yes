"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { PlainDate } from "@/lib/dates/plain-date";
import { useLocalFlag } from "./local-flag";
import { stepView } from "./model";
import type { StepsData } from "./types";

/**
 * "Prossimo passo" (AC27): one main step and at most two more. By default only what concerns the
 * viewer plus what is shared; the switch adds the partner's tasks (a local preference). Both lists
 * were computed on the server with the same rules (`nextSteps`), so this only picks one.
 */
export function NextStepCard({
  steps,
  partnerName,
  noDate,
  today,
}: {
  steps: StepsData;
  partnerName: string;
  /** No reference date at all: the first step is "scegli la data" (design §7.1). */
  noDate: boolean;
  today: PlainDate;
}) {
  const [showPartner, setShowPartner] = useLocalFlag("r2y-home-partner-tasks");
  const { primary, secondary } = showPartner ? steps.all : steps.mine;

  return (
    <section
      aria-labelledby="home-next-step"
      // The saved switch is read after hydration and can swap the list: when there is something
      // to swap, reserve the height of a full card (primary + 2 + switch) so nothing jumps.
      className={`border-border bg-card flex flex-col gap-4 rounded-lg border p-4 ${
        steps.hasPartnerTasks ? "min-h-80" : ""
      }`}
    >
      <h2
        id="home-next-step"
        className="text-muted-foreground text-sm font-semibold tracking-wide uppercase"
      >
        Prossimo passo
      </h2>

      {primary ? (
        <PrimaryStep step={primary} noDate={noDate} today={today} />
      ) : (
        <p>{steps.quiet}</p>
      )}

      {secondary.length > 0 ? (
        <ul className="border-border flex flex-col gap-2 border-t pt-3">
          {secondary.map((step) => {
            const view = stepView(step, today);
            return (
              <li key={view.key}>
                <Link
                  href={view.href}
                  className="hover:bg-muted focus-visible:ring-ring -mx-2 flex min-h-11 flex-col justify-center rounded-md px-2 py-1 focus-visible:ring-2 focus-visible:outline-none"
                >
                  <span className="font-semibold">{view.title}</span>
                  <span className="text-muted-foreground text-sm">{view.detail}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}

      {steps.hasPartnerTasks ? (
        <div className="border-border flex items-center gap-3 border-t pt-3">
          <Switch id="home-partner-tasks" checked={showPartner} onCheckedChange={setShowPartner} />
          <Label htmlFor="home-partner-tasks">Mostra anche i compiti di {partnerName}</Label>
        </div>
      ) : null}
    </section>
  );
}

function PrimaryStep({
  step,
  noDate,
  today,
}: {
  step: NonNullable<StepsData["mine"]["primary"]>;
  noDate: boolean;
  today: PlainDate;
}) {
  const view = stepView(step, today);
  const first = step.kind === "decision" && step.decisionKind === "date" && noDate;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[22px] leading-7 font-semibold">
        {first ? "Il primo passo: scegli la data" : view.title}
      </h3>
      <p className="text-muted-foreground">{view.detail}</p>
      <div className="pt-1">
        <Button asChild>
          <Link href={view.href}>{first ? "Scegli la data" : view.cta}</Link>
        </Button>
      </div>
    </div>
  );
}
