import "server-only";

/**
 * Injectable clock (plan §1.1, risk R18).
 *
 * Pure domain functions always receive `today`/`now` as a parameter; only the edges of the app
 * (server components, server actions, the daily job) call `getNow()`.
 *
 * The e2e cookie `r2y-test-now` is honoured ONLY when `E2E_CLOCK=1` AND `VERCEL` is not defined
 * (double guard: it can never move time on Vercel, whatever the env says).
 */
export const TEST_NOW_COOKIE = "r2y-test-now";

type Env = Readonly<Record<string, string | undefined>>;

export function isTestClockAllowed(env: Env = process.env): boolean {
  return env["E2E_CLOCK"] === "1" && env["VERCEL"] === undefined;
}

/**
 * Pure resolution of "now". The cookie value must be an ISO-8601 instant (`2027-03-28T23:30:00Z`);
 * anything unparsable is ignored and the real clock is used.
 */
export function resolveNow(options: {
  cookieValue?: string | undefined;
  env?: Env;
  real?: () => Date;
}): Date {
  const { cookieValue, env = process.env, real = () => new Date() } = options;
  if (cookieValue && isTestClockAllowed(env)) {
    const parsed = new Date(cookieValue);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return real();
}

/** Current instant, honouring the e2e cookie only when allowed. Server-only. */
export async function getNow(): Promise<Date> {
  if (!isTestClockAllowed()) return new Date();
  // Dynamic import: `next/headers` is only needed (and only valid) in a request scope.
  const { cookies } = await import("next/headers");
  const store = await cookies();
  return resolveNow({ cookieValue: store.get(TEST_NOW_COOKIE)?.value });
}
