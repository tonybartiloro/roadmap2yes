"use client";

import { Button } from "@/components/ui/button";
import { PAGE_SIZE } from "./view";

/** "Mostra altre 100 (ne restano 740)": never a silent cut (AC12). Renders nothing when all shown. */
export function ShowMore({ remaining, onClick }: { remaining: number; onClick: () => void }) {
  if (remaining <= 0) return null;
  return (
    <Button type="button" variant="outline" className="w-full" onClick={onClick}>
      Mostra altre {Math.min(PAGE_SIZE, remaining)} (ne restano {remaining})
    </Button>
  );
}
