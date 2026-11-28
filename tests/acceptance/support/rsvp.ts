import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { rsvpIpKey } from "@/features/rsvp/limiter";
import { deriveRsvpToken, hashRsvpToken } from "@/features/rsvp/token";
import { FAKE_RSVP_LINK_SECRET } from "@/lib/app-config";
import { versionedUpdate } from "@/lib/supabase/versioned-update";
import {
  createWedding,
  serviceClient,
  stackEnv,
  type TestClient,
  type TestWedding,
} from "../../support/supabase";
import { byteaLiteral, sql } from "./sql";

/**
 * Helpers of the RSVP QA tests (FEAT-2026-004, T10): per-test data (own wedding and links, so
 * parallel runs never collide), a synthetic client IP per test with cleanup of
 * `private.rsvp_attempts` (QA-2), SQL shifts instead of waiting, a database fingerprint for "opening
 * does not modify" (QA-11) and a `next start` of the built app. Local stack only. Tokens are always
 * derived with `token.ts` from a link id made here: never the seed token of `05_rsvp.sql`.
 */

export const RSVP_SECRET = process.env["RSVP_LINK_SECRET"] ?? FAKE_RSVP_LINK_SECRET;

// ------------------------------------------------------------------------------------ IP + limiter

/** A synthetic private IPv4 (the proxy reads it from `x-forwarded-for`, like Vercel would). */
export const fakeIp = (): string =>
  `10.${randomBytes(1)[0]}.${randomBytes(1)[0]}.${randomBytes(1)[0]}`;

/** The key the SERVER derives for an IP (its HMAC secret is the Supabase secret key). */
const ipKeyLiteral = (ip: string): string => byteaLiteral(rsvpIpKey(stackEnv().secretKey, ip)!);

export type AttemptRow = { failed: number; locked: boolean };

/** The limiter row of an IP: `null` when none exists (no failure was ever counted for it). */
export function ipAttempt(ip: string): AttemptRow | null {
  const out = sql(
    `select failed_count || '|' || (locked_until is not null and locked_until > now()) from private.rsvp_attempts where key_hash = ${ipKeyLiteral(ip)}`,
  );
  if (out === "") return null;
  const [failed, locked] = out.split("|");
  return { failed: Number(failed), locked: locked === "true" };
}

/** Moves an IP row `minutes` into the past (window and lock), like the time passing. */
export function ageIp(ip: string, minutes: number): void {
  sql(
    `update private.rsvp_attempts set window_start = window_start - interval '${minutes} minutes', locked_until = locked_until - interval '${minutes} minutes' where key_hash = ${ipKeyLiteral(ip)}`,
  );
}

/** Rows of the per-link limiter (key = sha256 of the link id) and cleanup of both kinds. */
const linkKeyLiteral = (linkId: string): string => `extensions.digest('${linkId}','sha256')`;

export function linkAttempt(linkId: string): AttemptRow | null {
  const out = sql(
    `select failed_count || '|' || (locked_until is not null and locked_until > now()) from private.rsvp_attempts where key_hash = ${linkKeyLiteral(linkId)}`,
  );
  if (out === "") return null;
  const [failed, locked] = out.split("|");
  return { failed: Number(failed), locked: locked === "true" };
}

/** Deletes the limiter rows a test made (QA-2): its synthetic IPs and its link keys. */
export function cleanupAttempts(ips: readonly string[], linkIds: readonly string[] = []): void {
  for (const ip of ips) {
    sql(`delete from private.rsvp_attempts where key_hash = ${ipKeyLiteral(ip)}`);
  }
  for (const id of linkIds) {
    sql(`delete from private.rsvp_attempts where key_hash = ${linkKeyLiteral(id)}`);
  }
}

// ------------------------------------------------------------------------------------ data

export type Json = Parameters<TestClient["rpc"]>[1];

export async function newWedding(
  options: { date?: string; themeId?: string } = {},
): Promise<TestWedding> {
  const w = await createWedding();
  if (options.themeId) {
    const set = await w.founderClient
      .from("weddings")
      .update({ theme_id: options.themeId })
      .eq("id", w.weddingId);
    if (set.error) throw new Error(`theme: ${set.error.message}`);
  }
  if (options.date) await chooseDate(w, options.date);
  return w;
}

/** Onboarding with one fixed date, then "chosen": the expiry (date + 30) starts to exist. */
export async function chooseDate(w: TestWedding, date: string): Promise<void> {
  const done = await w.founderClient.rpc("complete_onboarding", {
    p_scenarios: [{ kind: "fixed", date_from: date, label: "Data" }],
  });
  if (done.error) throw new Error(`complete_onboarding: ${done.error.message}`);
  const decision = await w.founderClient
    .from("decisions")
    .select("id")
    .eq("wedding_id", w.weddingId)
    .eq("key", "date")
    .single();
  const option = await w.founderClient
    .from("decision_options")
    .select("id")
    .eq("decision_id", decision.data!.id)
    .single();
  const chosen = await w.founderClient.rpc("choose_option", {
    p_decision_id: decision.data!.id,
    p_option_id: option.data!.id,
  });
  if (chosen.error) throw new Error(`choose_option: ${chosen.error.message}`);
}

export async function newGroup(w: TestWedding, name = "Famiglia"): Promise<string> {
  const r = await w.founderClient
    .from("guest_groups")
    .insert({ wedding_id: w.weddingId, name })
    .select("id")
    .single();
  if (r.error) throw new Error(`group: ${r.error.message}`);
  return r.data.id;
}

export async function newPerson(
  w: TestWedding,
  firstName: string,
  groupId: string | null = null,
  category: "adult" | "child" | "infant" = "adult",
): Promise<string> {
  const r = await w.founderClient
    .from("guests")
    .insert({
      wedding_id: w.weddingId,
      first_name: firstName,
      last_name: "Rossi",
      category,
      group_id: groupId,
    })
    .select("id")
    .single();
  if (r.error) throw new Error(`guest: ${r.error.message}`);
  return r.data.id;
}

export async function softDeletePerson(w: TestWedding, id: string): Promise<void> {
  const r = await w.founderClient
    .from("guests")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (r.error) throw new Error(`soft delete: ${r.error.message}`);
}

/** Group "together" -> "separate": the group's own link becomes dormant (BR4). */
export async function setSeparate(w: TestWedding, groupId: string): Promise<void> {
  const row = await w.founderClient
    .from("guest_groups")
    .select("version")
    .eq("id", groupId)
    .single();
  const r = await versionedUpdate(w.founderClient, "guest_groups", groupId, row.data!.version, {
    rsvp_mode: "separate",
  });
  if (r.conflict) throw new Error("group mode conflict");
}

export type TestLink = { linkId: string; token: string; hash: string };

/** A link made the way the app does: id from the client, derived token, only the hash is stored. */
export async function newLink(
  w: TestWedding,
  target: { groupId: string } | { guestId: string },
): Promise<TestLink> {
  const linkId = randomUUID();
  const token = deriveRsvpToken(RSVP_SECRET, linkId);
  const hash = hashRsvpToken(token);
  const item =
    "groupId" in target
      ? { link_id: linkId, token_hash: hash, group_id: target.groupId }
      : { link_id: linkId, token_hash: hash, guest_id: target.guestId };
  const r = await w.founderClient.rpc("rsvp_create_links", { p_items: [item] as never });
  if (r.error) throw new Error(`rsvp_create_links: ${r.error.message}`);
  if (!(r.data as { created: string[] }).created.includes(linkId)) throw new Error("link skipped");
  return { linkId, token, hash };
}

export async function revoke(w: TestWedding, linkId: string): Promise<void> {
  const r = await w.founderClient.rpc("rsvp_revoke_link", { p_link_id: linkId });
  if (r.error) throw new Error(`rsvp_revoke_link: ${r.error.message}`);
}

/** A token of the right shape that belongs to no link. */
export const unknownToken = (): string => deriveRsvpToken(RSVP_SECRET, randomUUID());

export type AnswerInput = {
  id: string;
  status: "yes" | "no" | null;
  diet?: string[];
  diet_note?: string | null;
  seen_at?: string | null;
};

/** `rsvp_submit` straight to the database with the secret key (what `public-rpc.ts` does). */
export async function submitRpc(
  hash: string,
  answers: AnswerInput[],
  ip: string | null = null,
  now?: string,
) {
  const payload = answers.map((a) => ({
    id: a.id,
    status: a.status,
    diet: a.diet ?? [],
    diet_note: a.diet_note ?? null,
    seen_at: a.seen_at ?? null,
  }));
  return serviceClient().rpc("rsvp_submit", {
    p_token_hash: hash,
    p_ip_key: (ip === null ? null : rsvpIpKey(stackEnv().secretKey, ip)) as string,
    p_answers: payload as never,
    ...(now ? { p_now: now } : {}),
  });
}

// ------------------------------------------------------------------------------------ fingerprint

/** Count and latest change of the tables that opening a link must not touch (QA-11). */
export function fingerprint(weddingId: string): string {
  const parts = [
    "select 'responses', count(*), max(updated_at) from public.rsvp_responses where wedding_id",
    "select 'links', count(*), max(updated_at) from public.rsvp_links where wedding_id",
    "select 'guests', count(*), max(updated_at) from public.guests where wedding_id",
    "select 'audit', count(*), max(at) from public.audit_log where wedding_id",
  ].map((s) => `${s} = '${weddingId}'`);
  return sql(parts.join(" union all ") + " order by 1");
}

// ------------------------------------------------------------------------------------ HTTP server

const ROOT = resolve(__dirname, "../../..");
export const APP_BUILT = existsSync(resolve(ROOT, ".next/BUILD_ID"));
export const RSVP_PORT = Number(process.env["RSVP_QA_PORT"] ?? 3311);

export type AppServer = { base: string; output: () => string; stop: () => void };

async function waitUntilReady(base: string, timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const response = await fetch(`${base}/servizio`, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // not listening yet
    }
    if (Date.now() > deadline) throw new Error(`next start did not answer on ${base}`);
    await new Promise((r) => setTimeout(r, 400));
  }
}

/**
 * `next start` of the built app on its own port, WITHOUT `E2E_CLOCK` and `VERCEL` (a server that
 * must ignore the clock cookie), keeping its stdout and stderr for the "nothing leaks" checks.
 * Never port 3000 or 3300 (Playwright's).
 */
export async function startApp(port: number = RSVP_PORT): Promise<AppServer> {
  const env = stackEnv();
  const base = `http://127.0.0.1:${port}`;
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "production",
    NEXT_PUBLIC_SUPABASE_URL: env.url,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: env.publishableKey,
    SUPABASE_SECRET_KEY: env.secretKey,
    NEXT_PUBLIC_SITE_URL: base,
    RSVP_LINK_SECRET: RSVP_SECRET,
  };
  // `.env.local` may set E2E_CLOCK=1 and Next loads it without overriding a defined variable: an
  // empty value defined here keeps the clock cookie OFF whatever the developer's file says.
  childEnv["E2E_CLOCK"] = "";
  delete childEnv["VERCEL"];
  delete childEnv["VERCEL_ENV"];
  const child: ChildProcess = spawn(
    process.execPath,
    [
      resolve(ROOT, "node_modules/next/dist/bin/next"),
      "start",
      "-H",
      "127.0.0.1",
      "-p",
      String(port),
    ],
    { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], env: childEnv },
  );
  let log = "";
  child.stdout?.on("data", (chunk: Buffer) => (log += chunk.toString()));
  child.stderr?.on("data", (chunk: Buffer) => (log += chunk.toString()));
  await waitUntilReady(base);
  return { base, output: () => log, stop: () => void child.kill("SIGTERM") };
}

export type Reply = { status: number; headers: Headers; bytes: Buffer; text: string };

export async function request(
  base: string,
  path: string,
  init: RequestInit & { ip?: string | null } = {},
): Promise<Reply> {
  const { ip, headers, ...rest } = init;
  const merged = new Headers(headers);
  if (ip) merged.set("x-forwarded-for", ip);
  const response = await fetch(`${base}${path}`, { redirect: "manual", ...rest, headers: merged });
  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    status: response.status,
    headers: response.headers,
    bytes,
    text: bytes.toString("utf8"),
  };
}

/** Every header but the ones that legitimately change per response. */
export function stableHeaders(headers: Headers): Record<string, string> {
  const skip = new Set(["date", "connection", "keep-alive"]);
  return Object.fromEntries([...headers.entries()].filter(([k]) => !skip.has(k)).sort());
}

const decodeEntities = (s: string): string =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/** The hidden fields of the page's `<form>` (server-action refs, person ids, `seen` stamps). */
export function hiddenFields(html: string): [string, string][] {
  const out: [string, string][] = [];
  for (const tag of html.match(/<input\b[^>]*>/g) ?? []) {
    if (!/type="hidden"/.test(tag)) continue;
    const name = /name="([^"]*)"/.exec(tag)?.[1];
    const value = /value="([^"]*)"/.exec(tag)?.[1] ?? "";
    if (name !== undefined) out.push([decodeEntities(name), decodeEntities(value)]);
  }
  return out;
}
