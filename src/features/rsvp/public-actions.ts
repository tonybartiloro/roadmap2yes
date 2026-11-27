"use server";

import { headers } from "next/headers";
import { clientIp } from "@/features/auth/limiter-keys";
import { getNow } from "@/lib/clock";
import { rsvpSubmit } from "./public-rpc";
import { parseAnswers } from "./public/answers";
import type { RsvpFormState } from "./public/state";
import { isRsvpTokenShape } from "./token";

/**
 * Guest answer (T7, ADR-0003). Bound to the token in the page (`submitRsvp.bind(null, token)`), so
 * the browser never chooses which link it writes to. `now` comes from the server clock, the IP from
 * the proxy-trusted headers. It returns closed states only: nothing from Postgres, and nothing about
 * the token, the answers or the ids is ever logged. Any link problem is `unavailable`, the same for
 * every cause (AC6); a server action cannot change the HTTP status.
 */
export async function submitRsvp(
  token: string,
  _previous: RsvpFormState,
  formData: FormData,
): Promise<RsvpFormState> {
  // A server action is a public endpoint: the arguments come from the request whatever the types
  // say, so check them at runtime (REV-116). Only the bound `token` counts, never a form field.
  if (typeof token !== "string" || !isRsvpTokenShape(token) || !(formData instanceof FormData)) {
    return { status: "unavailable" };
  }

  const parsed = parseAnswers(formData);
  if (!parsed.ok) return { status: "error", kind: "invalid", values: parsed.values };
  // Zero choices is checked here, also for the no-JS form (AC4): nothing reaches the DB.
  if (parsed.chosen === 0) return { status: "error", kind: "none", values: parsed.values };

  const result = await rsvpSubmit({
    token,
    ip: clientIp(await headers()),
    answers: parsed.answers,
    now: await getNow(),
  });
  switch (result.state) {
    case "ok":
      return { status: "saved", people: result.people, changed: result.changedMeanwhile };
    case "neutral":
      return { status: "unavailable" };
    case "blocked":
      return { status: "error", kind: "blocked", values: parsed.values };
    case "invalid":
      return { status: "error", kind: "invalid", values: parsed.values };
    case "retry":
      return { status: "error", kind: "save", values: parsed.values };
  }
}
