"use client";

import { TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * Error card with "Riprova" (AC39). Render it NEXT TO the data already shown, never instead of it
 * (the data stays visible). Calm tone: warning border, icon and text, never red fill.
 */
export function ErrorState({
  title = "Non sono riuscito a caricare questa parte",
  description = "Riprova tra un attimo.",
  onRetry,
  retryLabel = "Riprova",
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}) {
  return (
    <Alert variant="warning" className={className}>
      <TriangleAlert aria-hidden className="size-5" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{description}</p>
        {onRetry ? (
          <Button type="button" variant="outline" className="mt-3" onClick={onRetry}>
            {retryLabel}
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
