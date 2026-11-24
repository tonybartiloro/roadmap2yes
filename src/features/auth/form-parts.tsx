"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { FormState } from "./form-state";

/** Submit button with a spinner while the action runs (design §3: spinner on the button). */
export function SubmitButton({ children, className }: { children: ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending} aria-busy={pending} className={className}>
      {pending ? <Loader2 aria-hidden className="size-5 animate-spin" /> : null}
      {children}
    </Button>
  );
}

/** Form-level feedback: errors are announced (`role=alert`), successes politely (`role=status`). */
export function FormFeedback({ state, testId }: { state: FormState; testId?: string }) {
  if (state.status === "idle") return null;
  // A field message is shown next to its field; the form-level text repeats it only when it is
  // about the whole form (login, limiter, outage).
  if (state.status === "error" && state.field) return null;
  return (
    <Alert
      variant={state.status === "error" ? "destructive" : "success"}
      role={state.status === "error" ? "alert" : "status"}
      {...(testId ? { "data-testid": testId } : {})}
    >
      <AlertDescription>{state.message}</AlertDescription>
    </Alert>
  );
}

export function fieldError(state: FormState, name: string): string | undefined {
  return state.status === "error" && state.field?.name === name ? state.field.message : undefined;
}
