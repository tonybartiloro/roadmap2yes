"use client";

import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { clearAllFormDrafts } from "@/lib/hooks/use-form-draft";
import { signOutAction } from "./actions";

/**
 * "Esci" (AC62, Q12). Clears every form draft of this device first (a shared device must never
 * show the previous person's drafts), then ends the session on the server and goes to the login.
 * Used by Altro (T15) and by the account / "su invito" pages.
 */
export function SignOutButton({
  variant = "outline",
  children = "Esci",
  ...props
}: Omit<ComponentProps<typeof Button>, "type" | "onClick" | "formAction">) {
  return (
    <form action={signOutAction}>
      <Button
        type="submit"
        variant={variant}
        data-testid="sign-out"
        {...props}
        onClick={() => clearAllFormDrafts()}
      >
        {children}
      </Button>
    </form>
  );
}
