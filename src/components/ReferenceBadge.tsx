import { Lock, MapPin, Pin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * "Riferimento · provvisorio" (pin) or "Riferimento · definitivo" (lock): text + icon, never
 * colour alone (design §3.8). `setBy` adds "scelto da {nome}" for a manual reference. When the
 * date is linked to a candidate location it is shown next to the badge (AC60).
 */
export function ReferenceBadge({
  status,
  setBy,
  locationName,
  className,
}: {
  status: "provisional" | "definitive";
  setBy?: string | null;
  locationName?: string | null;
  className?: string;
}) {
  const definitive = status === "definitive";
  const Icon = definitive ? Lock : Pin;
  const label = definitive ? "definitivo" : "provvisorio";
  return (
    <span
      data-slot="reference-badge"
      className={cn("inline-flex flex-wrap items-center gap-2", className)}
    >
      <Badge variant={definitive ? "default" : "outline"}>
        <Icon aria-hidden className="size-4" />
        <span>
          Riferimento · {label}
          {setBy ? ` · scelto da ${setBy}` : ""}
        </span>
      </Badge>
      {locationName ? (
        <span className="text-muted-foreground inline-flex items-center gap-1 text-sm">
          <MapPin aria-hidden className="size-4" />
          <span>
            <span className="sr-only">Location collegata: </span>
            {locationName}
          </span>
        </span>
      ) : null}
    </span>
  );
}
