"use client";

import { WifiOff } from "lucide-react";
import { useOnline } from "@/lib/hooks/use-online";

/** Shown while the browser has no network (AC39). The page stays usable; drafts are kept locally. */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div
      role="status"
      className="border-warning bg-card text-foreground sticky top-0 z-40 flex items-center gap-2 border-b-2 px-4 py-2 text-base"
    >
      <WifiOff aria-hidden className="size-5 shrink-0" />
      <span>Sei offline. Le modifiche non sono ancora salvate.</span>
    </div>
  );
}
