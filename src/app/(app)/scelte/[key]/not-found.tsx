import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";

export default function DecisionNotFound() {
  return (
    <EmptyState
      title="Questa scelta non esiste"
      description="Forse il link non è più valido. Torna all'elenco e riparti da lì."
      action={
        <Button asChild>
          <Link href="/scelte">Vai alle scelte</Link>
        </Button>
      }
    />
  );
}
