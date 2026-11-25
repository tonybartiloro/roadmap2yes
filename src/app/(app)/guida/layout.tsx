import type { ReactNode } from "react";
import { GuideShell } from "@/features/guide/FocusHeading";

/** Persists across Guide pages so FocusHeading can tell "from another Guide page" from the rest. */
export default function GuideLayout({ children }: { children: ReactNode }) {
  return <GuideShell>{children}</GuideShell>;
}
