import type { Metadata } from "next";
import Link from "next/link";
import {
  Bell,
  BookOpen,
  ChevronRight,
  Download,
  Info,
  KeyRound,
  MailPlus,
  Palette,
  SlidersHorizontal,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import { HelpLink } from "@/components/HelpLink";
import { OPTIONS_SECTION_LABEL } from "@/components/section-label";
import { SignOutButton } from "@/features/auth/SignOutButton";

export const metadata: Metadata = { title: OPTIONS_SECTION_LABEL };

const LINKS: ReadonlyArray<{
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    href: "/altro/account",
    label: "Il tuo accesso",
    description: "Cambia il tuo codice o l'email con cui entri.",
    icon: KeyRound,
  },
  {
    href: "/altro/profili",
    label: "Profili",
    description: "I dati tuoi e del tuo partner.",
    icon: UserCog,
  },
  {
    href: "/altro/impostazioni",
    label: "Impostazioni nozze",
    description: "Rito, date, invitati, stile, luogo e budget iniziale.",
    icon: SlidersHorizontal,
  },
  {
    href: "/altro/invito",
    label: "Invito al partner",
    description: "Stato dell'invito, link e nuovo invio.",
    icon: MailPlus,
  },
  {
    href: "/altro/aspetto",
    label: "Aspetto",
    description: "Il tema dell'app, chiaro o scuro.",
    icon: Palette,
  },
  {
    href: "/altro/promemoria",
    label: "Promemoria email",
    description: "Scegli quali email ricevere.",
    icon: Bell,
  },
  {
    href: "/altro/esporta",
    label: "Esportazione",
    description: "Scarica tutti i dati del matrimonio.",
    icon: Download,
  },
  {
    href: "/altro/info",
    label: "Info",
    description: "Versione e stato del servizio.",
    icon: Info,
  },
];

/** Opzioni (route `/altro`): the index of the secondary areas, plus "Esci" (AC62). */
export default function AltroPage() {
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-heading text-[28px] leading-9">{OPTIONS_SECTION_LABEL}</h1>
        <HelpLink route="/altro" />
      </div>
      <Link
        href="/guida"
        className="border-primary bg-card hover:bg-muted focus-visible:ring-ring flex min-h-14 items-center gap-3 rounded-lg border-2 px-4 py-3 focus-visible:ring-2 focus-visible:outline-none"
      >
        <BookOpen aria-hidden className="text-primary size-6 shrink-0" />
        <span className="flex flex-1 flex-col">
          <span className="font-semibold">Guida</span>
          <span className="text-muted-foreground text-sm">Come si usa roadmap2yes, passo passo</span>
        </span>
        <ChevronRight aria-hidden className="text-muted-foreground size-5 shrink-0" />
      </Link>
      <ul className="border-border bg-card divide-border divide-y rounded-lg border">
        {LINKS.map(({ href, label, description, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="hover:bg-muted focus-visible:ring-ring flex min-h-14 items-center gap-3 px-4 py-3 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
            >
              <Icon aria-hidden className="text-primary size-5 shrink-0" />
              <span className="flex flex-1 flex-col">
                <span className="font-semibold">{label}</span>
                <span className="text-muted-foreground text-sm">{description}</span>
              </span>
              <ChevronRight aria-hidden className="text-muted-foreground size-5 shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
      <section aria-label="Esci">
        <SignOutButton>Esci</SignOutButton>
      </section>
    </div>
  );
}
