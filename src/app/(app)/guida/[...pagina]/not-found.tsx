import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";

export default function GuidePageNotFound() {
  return (
    <EmptyState
      title="Pagina non trovata"
      description="Questa pagina della Guida non esiste (più). Torna all'elenco e cerca da lì."
      action={
        <Button asChild>
          <Link href="/guida">Torna alla Guida</Link>
        </Button>
      }
    />
  );
}
