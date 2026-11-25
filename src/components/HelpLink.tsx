import Link from "next/link";
import { CircleHelp } from "lucide-react";

/**
 * Section route -> in-app guide page (the file name in `docs/functional`, without `.md`).
 * A test checks that every page here exists. Options sub-pages have no page of their own, so
 * they have no entry and no link (no generic link to the guide home).
 */
export const HELP_PAGES = {
  "/": "home-e-novita",
  "/percorso": "percorso",
  "/scelte": "scelte",
  "/budget": "budget",
  "/invitati": "invitati",
  "/altro": "opzioni",
} as const;

export type HelpRoute = keyof typeof HELP_PAGES;

/**
 * "Aiuto" in a section header: opens the guide page of that section. From 360 px the text is
 * visible; below it only the icon shows, and the accessible name stays "Aiuto" either way.
 * The hit area is at least 44 px.
 */
export function HelpLink({ route, className }: { route: HelpRoute; className?: string }) {
  return (
    <Link
      href={`/guida/${HELP_PAGES[route]}`}
      className={`text-primary focus-visible:ring-ring inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-md px-2 text-base underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:outline-none ${className ?? ""}`}
    >
      <CircleHelp aria-hidden className="size-5 shrink-0" />
      <span className="max-[359px]:sr-only">Aiuto</span>
    </Link>
  );
}
