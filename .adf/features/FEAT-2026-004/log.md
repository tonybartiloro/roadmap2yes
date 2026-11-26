# FEAT-2026-004 — decision log

<!-- One section per phase transition, checkpoint or discussion round: who decided what, and why, in a few lines. Details stay in reviews/ and in the commits. Length target: method → Keep files short. -->

## F0 intake — 2026-11-26
- Request: roadmap R-04 "Conferme di presenza (RSVP) con link personale" (`.adf/roadmap.md → Details → R-04`), roadmap approved 2026-11-25.
- Size: L — public page without login that reads and writes third-party personal data, abuse protection, additive migration; same size as in the roadmap. Confirmed by the developer.
- Team: product-owner, architect, designer, developer(s), qa-engineer, reviewer (+ security round), technical-writer, release-manager.
- Housekeeping: FEAT-2026-003 closed (PR #5 merged, production 2026-11-26), R-03 done (ff24f30).
- Code findings for the team:
  - `src/features/invitations/token.ts`: partner-invite tokens = 32 random bytes base64url, DB stores only sha256 (`\x…` bytea). Reusable pattern.
  - `/invito/[token]` is taken by the partner invite (`src/app/(public)/invito/[token]/page.tsx`): RSVP needs its own path.
  - `src/features/auth/guards.ts:46` `PUBLIC_PREFIXES` (+ `isPlainPath`) and `src/proxy.ts:26` `NO_REFERRER_PREFIXES` must include the new public path; proxy sets `Cache-Control: private, no-store`.
  - Abuse: login limiter `private.login_attempts` (core migration ~253, ~1242-1340) with HMAC keys in `src/features/auth/limiter-keys.ts` (email/IP) — reusable for RSVP.
  - `src/app/robots.ts` already disallows everything (+ `X-Robots-Tag`).
  - `public.guests` (`supabase/migrations/20261202100000_guests.sql:73`): no RSVP fields; groups `guest_groups`; categories adult/child/infant; notes ≤500 (allergies today). ADR-0002 governs guest personal data (audit log, purge).
  - Email off until Resend is active: links shared by hand (copy / WhatsApp).

## F1 round 1 — 2026-11-26
- PO brief: 19 AC, 3 steps, 8 questions. Architect ARC-1..10 (`reviews/f1-architect.md`; blocking ARC-3 token in Vercel request logs, ARC-4 link created on first use breaks iOS share; Q8 → derived token HMAC(`RSVP_LINK_SECRET`, id), ADR-0003; ARC-8 split). Designer DES-1..23 (`design.md` draft; blocking DES-1 theme/RsvpShell, DES-2 where share actions live).
- PO response: 30 accepted, 1 in part (DES-17: per-IP limit only on invalid links, 429 instead of the neutral page when blocked), 2 rejected (ARC-7 simple bulk No without undo → DES-7 undo restores preferences; DES-21 "last 7 days" → follow-up). Brief now 21 AC: step 1 AC1-14 (shippable core), step 2 AC15-21 (couple tools). Open questions D1-D13 in `brief.md → Decisions`.
- design.md is 26 KB (target 25 KB for L): the designer condenses it when finalising in F2.

## F1 decisions and Gate A — 2026-11-26
- Developer: "Accetto tutte" → D1-D13 accepted as proposed (`brief.md → Decisions`).
- D1 split: FEAT-2026-004 = step 1 only (AC1-AC14); old AC15-AC21 → new roadmap item R-07 (M, depends on R-04). Roadmap re-approved 2026-11-26 (`adf roadmap approve`).
- Answer deadline moved to R-07; here guests can answer until the link expires (BR7). New secret `RSVP_LINK_SECRET` (D4) and ADR-0003 (D3, D5) go into the plan.
- Gate A recorded via roadmap R-04.

## F2 round 1 — 2026-11-26
- Architect plan: 13 tasks in 5 steps (S1 data, S2 server, S3 public page, S4 couple side, S5 tests/docs/release), 2 additive migrations, no new dependency, ADR-0003 drafted (proposed); `public-rpc.ts` = fifth secret-key scope; `undo_guest_import` replaced to keep people who answered.
- Challenge: QA-1..17 (`reviews/f2-qa.md`; blocking QA-1 clock, QA-2 limiter isolation, QA-3 closed lifecycle matrix, QA-4 normalized neutral comparison), DES-24..36 (`reviews/f2-designer.md`, 0 blocking; design.md finalised, 16 KB), PO-1..7 (`reviews/f2-po.md`, 0 blocking; PO corrected D4 wording in brief).
- Architect accepted all 37 (QA-15 refined). Technical decisions P1-P7 in `plan.md → Decisions`. AC amendments AC3, AC6, AC10, AC12 to approve at Gate B. plan.md 39 KB (target 40 KB).

## Gate B — 2026-11-26
- Developer: "Approvo" → plan, AC3/AC6/AC10/AC12 amendments, ADR-0003 (accepted), `public-rpc.ts` as fifth secret-key scope, P5/P6, D4 correction, routine git work (commits, push of the branch — public repo, PR, fix commits). Merge to main = production → Gate C. No new dependency.
- Developer must create `RSVP_LINK_SECRET` in Vercel (Production + Preview, different values, Sensitive) before the merge.
