import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";

export default function BudgetCategoryNotFound() {
  return (
    <EmptyState
      title="Questa categoria non c'è più"
      description="Forse è stata eliminata o il link non è valido. Torna al budget e riparti da lì."
      action={
        <Button asChild>
          <Link href="/budget">Vai al budget</Link>
        </Button>
      }
    />
  );
}
