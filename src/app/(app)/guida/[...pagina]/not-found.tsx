import Link from "next/link";
import { Button } from "@/components/ui/button";

/** One H1 per page (AC6): the shared EmptyState titles with an H2, so this page has its own. */
export default function GuidePageNotFound() {
  return (
    <div className="flex max-w-xl flex-col items-start gap-4">
      <h1 className="font-heading text-[28px] leading-9">Pagina non trovata</h1>
      <p className="text-muted-foreground">
        Questa pagina della Guida non esiste (più). Torna all&apos;elenco e cerca da lì.
      </p>
      <Button asChild>
        <Link href="/guida">Torna alla Guida</Link>
      </Button>
    </div>
  );
}
