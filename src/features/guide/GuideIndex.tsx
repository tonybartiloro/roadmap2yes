import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { GuideIndexEntry } from "./markdown";

/** Cards for the Guide index: name + description, the whole row is the link. */
export function GuideIndex({ entries }: { entries: readonly GuideIndexEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-muted-foreground">Per ora non c&apos;è nulla da leggere.</p>;
  }
  return (
    <ul className="border-border bg-card divide-border divide-y rounded-lg border">
      {entries.map(({ slug, label, description }) => (
        <li key={slug}>
          <Link
            href={`/guida/${slug}`}
            className="hover:bg-muted focus-visible:ring-ring flex min-h-14 items-center gap-3 px-4 py-3 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
          >
            <span className="flex flex-1 flex-col">
              <span className="font-semibold">{label}</span>
              <span className="text-muted-foreground text-sm">{description}</span>
            </span>
            <ChevronRight aria-hidden className="text-muted-foreground size-5 shrink-0" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
