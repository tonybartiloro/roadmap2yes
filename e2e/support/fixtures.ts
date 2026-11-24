import { test as base, expect } from "@playwright/test";
import { randomInt } from "node:crypto";
import {
  addPartnerB,
  createUser,
  createWedding,
  serviceClient,
  type TestPartnerB,
  type TestUser,
  type TestWedding,
} from "../../tests/support/supabase";

/**
 * Fixtures for the e2e specs. Everything is created through the real RPCs / admin API of the LOCAL
 * stack with fake `@example.test` data; login in the browser goes through the real form (auth.ts).
 */
export { addPartnerB, createUser, createWedding, serviceClient, expect };
export type { TestPartnerB, TestUser, TestWedding };

/**
 * A fresh fake client IP per test. The login limiter keys on `x-forwarded-for` (plan 4.3): sharing
 * one IP across the suite would trip the per-IP block (20 failures / 15 min).
 */
export function uniqueIp(): string {
  return `10.${randomInt(1, 255)}.${randomInt(0, 255)}.${randomInt(1, 255)}`;
}

/** A couple ready for e2e: founder A with a wedding and partner B who has already entered once. */
export async function createCouple(): Promise<{ wedding: TestWedding; partnerB: TestPartnerB }> {
  const wedding = await createWedding("sposo");
  return { wedding, partnerB: await addPartnerB(wedding) };
}

/** A founder who has never entered: lands on /onboarding at the first login (no wedding yet). */
export const newFounder = (role: "sposo" | "sposa" = "sposo") =>
  createUser({ founder: true, role });

/** An account with no membership and no invitation: lands on /su-invito. */
export const strayAccount = () => createUser();

export const test = base.extend<{ ip: string }>({
  ip: async ({}, provide) => {
    await provide(uniqueIp());
  },
});
