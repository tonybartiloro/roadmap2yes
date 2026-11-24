import Link from "next/link";
import { Countdown } from "@/components/Countdown";
import { EmailOffBanner } from "@/components/EmailOffBanner";
import { formatShortDate } from "@/components/format";
import { Button } from "@/components/ui/button";
import type { UpcomingPayment } from "@/domain/budget";
import type { NewsItem } from "@/domain/news";
import { todayInRome } from "@/lib/dates/plain-date";
import { formatEuro } from "@/lib/money";
import { showWelcome } from "./model";
import { NextStepCard } from "./NextStepCard";
import { SectionError } from "./SectionError";
import type { HomeData, PaymentsData, ReferenceData } from "./types";
import { WelcomeCard } from "./WelcomeCard";

/**
 * The Home (design §3.3), top to bottom: greeting, countdown, "Prossimo passo", payments,
 * "Novità" (or the welcome card), last export. A server component: every block already knows if it
 * loaded; a failed one shows its own error card and the others stay.
 */
export function HomeScreen({ data }: { data: HomeData }) {
  const welcome = showWelcome(data.visit, data.mySlot);
  const noDate = data.reference.ok && data.reference.data.value.kind === "none";
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl leading-8 font-semibold">
        {data.myName
          ? `Ciao ${data.myName}, ecco cosa ti aspetta oggi`
          : "Ciao, ecco cosa ti aspetta oggi"}
      </h1>

      <EmailOffBanner />

      <div className="grid gap-6 md:grid-cols-2 md:items-start">
        {data.reference.ok ? (
          <ReferenceBlock reference={data.reference.data} />
        ) : (
          <SectionError title="Non riesco a mostrarti il conto alla rovescia" />
        )}

        {data.steps.ok ? (
          <NextStepCard
            steps={data.steps.data}
            partnerName={data.partnerName}
            noDate={noDate}
            today={data.today}
          />
        ) : (
          <SectionError title="Non riesco a mostrarti il prossimo passo" />
        )}

        {data.payments.ok ? (
          <PaymentsBlock payments={data.payments.data} />
        ) : (
          <SectionError title="Non riesco a mostrarti i pagamenti" />
        )}

        {welcome ? (
          <WelcomeCard userId={data.userId} name={data.myName} partnerName={data.partnerName} />
        ) : data.news.ok ? (
          data.news.data === null ? null : (
            <NewsBlock items={data.news.data} />
          )
        ) : (
          <SectionError title="Non riesco a mostrarti le novità" />
        )}

        <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 text-sm md:col-span-2">
          <span>{data.lastExport.label}</span>
          {data.lastExport.reminder ? (
            <>
              <span>
                {data.lastExport.days === null
                  ? "Una copia di sicurezza ti fa dormire più tranquillo."
                  : "È passato un po': scarica una copia aggiornata."}
              </span>
              <Button asChild variant="link" className="h-11 px-0">
                <Link href="/altro/esporta">Esporta i dati</Link>
              </Button>
            </>
          ) : null}
        </p>
      </div>
    </div>
  );
}

function ReferenceBlock({ reference }: { reference: ReferenceData }) {
  const { value } = reference;
  return (
    <div className="flex flex-col gap-3">
      <Countdown value={value} setBy={reference.setBy} locationName={reference.locationName} />
      {value.kind === "provisional" ? (
        <Button asChild variant="link" className="h-11 self-start px-0">
          <Link href="/scelte/date">Cambia riferimento</Link>
        </Button>
      ) : null}
      {value.kind === "none" ? (
        <Button asChild className="self-start">
          <Link href="/scelte/date">Scegli la data</Link>
        </Button>
      ) : null}
    </div>
  );
}

function dueText(payment: UpcomingPayment): string {
  const date = formatShortDate(payment.dueDate);
  if (payment.overdue) return `Scaduto il ${date}`;
  if (payment.daysUntil === 0) return "Scade oggi";
  if (payment.daysUntil === 1) return "Scade domani";
  return `Entro il ${date}`;
}

function PaymentsBlock({ payments }: { payments: PaymentsData }) {
  return (
    <section
      aria-labelledby="home-payments"
      className="border-border bg-card flex flex-col gap-3 rounded-lg border p-4"
    >
      <h2 id="home-payments" className="text-[22px] leading-7 font-semibold">
        Pagamenti in evidenza ({payments.upcoming.length})
      </h2>
      {payments.upcoming.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {payments.upcoming.map((payment) => (
            <li key={payment.paymentId}>
              <Link
                href="/budget"
                className="hover:bg-muted focus-visible:ring-ring -mx-2 flex min-h-11 items-center justify-between gap-3 rounded-md px-2 py-1 focus-visible:ring-2 focus-visible:outline-none"
              >
                <span className="flex flex-col">
                  <span className="font-semibold">{payment.itemDescription}</span>
                  <span className="text-muted-foreground text-sm">
                    {payment.categoryName} · {dueText(payment)}
                  </span>
                </span>
                <span className="font-semibold tabular-nums">
                  {formatEuro(payment.amountCents)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">
          {payments.budgetDefined
            ? "Nessun pagamento in programma nei prossimi 14 giorni."
            : "Budget da definire. Parti da una cifra indicativa: potrai cambiarla."}
        </p>
      )}
      {!payments.budgetDefined ? (
        <Button asChild variant="outline" className="self-start">
          <Link href="/budget">Definisci il budget</Link>
        </Button>
      ) : null}
    </section>
  );
}

function NewsBlock({ items }: { items: readonly NewsItem[] }) {
  return (
    <section
      aria-labelledby="home-news"
      className="border-border bg-card flex flex-col gap-3 rounded-lg border p-4"
    >
      <h2 id="home-news" className="text-[22px] leading-7 font-semibold">
        Novità dall&apos;ultimo accesso
      </h2>
      {items.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col">
              <span>{item.text}</span>
              <span className="text-muted-foreground text-sm">
                {formatShortDate(todayInRome(new Date(item.at)))}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">Nessuna novità dall&apos;ultima volta.</p>
      )}
    </section>
  );
}
