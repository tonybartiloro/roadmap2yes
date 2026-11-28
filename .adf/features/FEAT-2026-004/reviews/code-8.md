# FEAT-2026-004 — code review (security round), rounds 1 and 2

Verdict: round 1 approved with one should (REV-123), no blocking. Round 2 (069f9fc): approved, nothing open.
Scope reviewed: round 1 `git diff a2506d9..HEAD -- src` (S4, T8 + T9); round 2 `git diff aed2ce6..069f9fc -- src`. Security and personal data only. Server side (`actions.ts`, `data.ts`, `token.ts`, SQL) was closed in S2 and read here only for how the client code uses it.

| ID | Severity | Evidence | Finding | Why it matters | Proposal | Response (author) | Closed |
|---|---|---|---|---|---|---|---|
| REV-123 | should | `LinkSheet.tsx:183-195`, `:87-88`, `:261` | After "Nuovo link" succeeds, `linkId` is still the old (now revoked) id until `router.refresh()` returns, so `fetched.url` (the dead URL) stays rendered with Copia, Condividi and WhatsApp live. Revoke is handled (`revokedId`), rotate is not. If the refresh is slow or fails, the revoked URL stays on screen for as long as the sheet is open. A tap then puts a dead link in the clipboard or WhatsApp, and `markSharedAction` answers `link_not_found` with the generic `SHARE_ERROR`. | A credential the couple has just revoked is still offered as live. Not an exposure (the old token no longer opens anything), but it sends a dead link to a guest and breaks the "Nuovo link" promise. | Keep a `retiredId` set to the old `linkId` on rotate. While `link.id === retiredId`, hide the URL block and show the "Carico il link" skeleton; no "Crea link" in that window; it clears when `link.id` changes. Add a test. | Fixed (069f9fc). | ✅ Closed (round 2): with `retiring`, `linkId` is null, so no URL block, no Crea, no Nuovo/Revoca, skeleton shown; it clears on the new `link.id`; test `components.test.tsx:314`. |
| REV-124 | note | `data.ts:77-99`, `invitati/page.tsx:87-93`, `GuestsScreen.tsx:328` | `loadRsvp` puts `diet` and `diet_note` of every guest into the client props (RSC payload) at page load, although only the person sheet shows them. Access is correct (`guests/read`, same as the RLS select; `private, no-store`). | Data minimisation for health-related free text (ADR-0002). | Keep and record, or later fetch diet and note when the sheet opens. | Noted, residual. | Closed as a note; T12 must carry it. |
| REV-125 | note | `LinkSheet.tsx:266-272`, `:303-309` | The message textarea (contains the full URL) and the read-only fallback input had no `spellCheck={false}` or `autoComplete="off"`. | Chrome enhanced spellcheck (opt-in) or keyboard cloud services could send the token to a third party. | Set both attributes. | Fixed (069f9fc), trade-off accepted (no spellcheck while editing). | ✅ Closed (round 2): both fields have `spellCheck={false}` and `autoComplete="off"`. Keyboard cloud services stay a residual for `sicurezza.md`. |
| REV-126 | note | `LinkSheet.tsx:287-296`, `view.ts:243-245` | The WhatsApp button builds `https://wa.me/?text=` + `encodeURIComponent(message)`; `rel="noopener noreferrer"`, `target="_blank"`. The message with the token URL goes to WhatsApp and can stay in browser history. | Expected by D6/AC1, user-initiated. | Record in `sicurezza.md`. | Noted, residual. | Closed as a note; T12 must carry it. |
| REV-127 | note | `GuestSheet.tsx:55-74`, `components.test.tsx` | `PresenceSection` renders `diet` and `dietNote` as React text only; no unit test for markup in a note. The plan covers it in e2e. | The e2e must exist before S5 closes. | Keep the `<script>` e2e case on the T11 list. | Noted, e2e in T11. | Closed as a note; the coordinator keeps the case on the T11 list. |

## Round 2: new code checked (069f9fc), no new finding
- **`invitati/page.tsx` `console.error`.** Two fixed strings; the only variable part is `error.infra`, which is `"paused" | "unreachable" | null`. No error object, message, name, token or hash. The `Promise.all` change sends any rejection to the same catch. `canWrite` still fails closed.
- **Inline Annulla and toast handover (`LinkSheet.tsx`).** The line and the toast carry `how` (fixed text: "Link copiato", "Link condiviso", "Aperto in WhatsApp") and the day. They never carry the URL or message. The `previous` snapshot (guest uuids, `shared_at`) stays in a ref and a closure; the server ignores its `shared_by` and checks the wedding. The unmount cleanup only toasts inside the Annulla window. `takeBack` shows `back.message` (a fixed server text) or `SHARE_ERROR`.
- **Offline path.** `getLinkUrlAction`, `markSharedAction`, `run` and `takeBack` catch rejections and drop the error object: `{code:"network", message: LINK_ERROR}`, `SHARE_ERROR`. Nothing from the thrown error reaches the UI, a log or a toast. The `refresh`/`hash` kinds use fixed texts. `CreateAllDialog` shows `result.message` only for `code === "session"` (a fixed text), otherwise `FAILURE`.
- **Rest of the diff.** `DIET_OPTIONS` moved to `rsvp/constants.ts` (no imports, client-safe). `rsvp-model.ts` is pure and carries presence only, with no diet. `GuestSheet` still shows diet as React text. No storage, console or analytics added beyond the line above.
- Minor, not a finding: if `router.refresh()` never returns after a rotate, the sheet shows the skeleton until closed. Failing closed is the right side of that trade.

## What was checked and found sound (round 1)
- **URL lifecycle.** The URL is never in props of any page or server component: `GuestsScreen`/`LinkSheet` get only link ids, state and `canWrite`. It is fetched by `getLinkUrlAction` in an effect only when `showActions` (`canWrite` and a working link), so read-only users never call it (test `components.test.tsx:217-222`), and the server refuses them anyway (`rsvp_link_matches` checks `guests/write`, wedding scope and hash). It lives in component state only.
- **Authorization.** Hidden buttons are UX only. Every write path re-checks session, zod `.strict()` shape and then RPCs that test `guests/write` on the caller's wedding. `unmarkSharedAction`'s client-held `previous` is not trusted for attribution. `canWriteGuests` fails closed.
- **Bundle boundary.** `RSVP_LINK_SECRET` is read only in `actions.ts` through `lib/app-config`. `data.ts` and `token.ts` are imported only by `actions.ts`, server pages, the proxy and tests. No client component imports `app-config`; no `NEXT_PUBLIC_` prefix.
- **Diet data.** Only for members that reach this page (`guests/read`), only for "yes"; not in any toast, aria-live or log.
- **Link ids** sent to read-only users are uuids, not secrets (token = HMAC(secret, id), ADR-0003).
- **Clipboard / Web Share.** Refused clipboard: the URL goes to a selectable field, nothing is marked. `AbortError` is silent, other share errors give a fixed text.

## AC coverage
AC1 ✅ · AC7 ✅ (rotate window closed by REV-123) · AC14 ✅ on this surface (payload note REV-124) · BR12 / D6 ✅.

## Residuals for `docs/technical/sicurezza.md` (T12)
1. REV-124: diet and note of all guests in the list's RSC payload for `guests/read` users. 2. REV-125: keyboard cloud services on the field that holds the URL (spellcheck itself is now off). 3. REV-126: the link leaves the app only through Copia, Condividi and WhatsApp (query string to wa.me, browser history). 4. The URL is recomputed on every sheet open; no audit or rate limit on `getLinkUrlAction` (only `guests/write` members can call it).

## Response (developer), fix round 069f9fc

| ID | Outcome |
|---|---|
| REV-123 | Fixed. `retiredId` (set on rotate, like `revokedId` on revoke): while `link.id === retiredId` the URL block, Copia/Condividi/WhatsApp and Crea are hidden and the "Carico il link" skeleton shows; it clears when the new `link` prop arrives and the new URL is fetched. Test: no "Copia link" after rotate until the rerender with the new id. |
| REV-124 | Noted (residual for `sicurezza.md`): diet and note stay in the list payload, same audience as the RLS select. |
| REV-125 | Fixed. `spellCheck={false}` and `autoComplete="off"` on the read-only URL input and on the message textarea. Trade-off: no spellcheck while editing the message (it contains the full URL); I chose the token over the prose. Residual note for `sicurezza.md`: keyboard cloud services are out of our control. |
| REV-126 | Noted (residual for `sicurezza.md`): the link leaves the app only through the couple's own Copia, Condividi and WhatsApp. No change. |
| REV-127 | Noted. Rendered as React text only; the `<script>` note case belongs to the T11 e2e list (coordinator to confirm). No unit assertion added this round. |
