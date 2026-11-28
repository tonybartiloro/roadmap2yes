"use client";

import { useEffect, useRef } from "react";
import { NEUTRAL_HEADING, NEUTRAL_TEXT } from "../neutral-html";

/**
 * The neutral view (AC6, design §1.1 C): same words for an unknown, revoked, expired or
 * recipient-less link, no name, date or brand, no button. The proxy answers the 404 with the same
 * texts (`neutral-html.ts`); this component is the 200 view: the page when the proxy let it through,
 * and the replacement of the whole page after a submit (DES-25). `moveFocus` puts the focus on the
 * heading when it replaces a form that held it (REV-22).
 */
export function LinkUnavailable({ moveFocus = false }: { moveFocus?: boolean }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (moveFocus) heading.current?.focus();
  }, [moveFocus]);
  return (
    <section data-testid="rsvp-unavailable">
      <h1
        ref={heading}
        tabIndex={-1}
        className="font-heading mb-4 text-[28px] leading-9 focus:outline-none"
      >
        {NEUTRAL_HEADING}
      </h1>
      <p>{NEUTRAL_TEXT}</p>
    </section>
  );
}
