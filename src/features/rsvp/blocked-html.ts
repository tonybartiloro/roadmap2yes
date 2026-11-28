import { APP_NAME } from "@/components/app-name";

/**
 * Body of the 429 the proxy answers on `/rsvp/{token}` when an IP is over its limit (AC10, DES-29).
 * The proxy cannot render the React shell, so this is small hand-written HTML (pattern of
 * `app/(public)/email/disattiva/html.ts`): `lang`, viewport, `color-scheme`, light and dark colours
 * inline, a single h1 and text at 18 px, no script, nothing user-supplied. Contrast: foreground on
 * background is above 7:1 in both modes. Static text: the wording of AC10 does not depend on the wait.
 */

const STYLE = `
:root{color-scheme:light dark;--bg:#fbf7f0;--fg:#2b2a26;--muted:#5d5a52}
@media(prefers-color-scheme:dark){:root{--bg:#171611;--fg:#f2ede2;--muted:#c9c3b4}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:18px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
header{padding:24px 24px 0;font-size:18px;color:var(--muted)}
main{max-width:36rem;margin:0 auto;padding:40px 24px}
h1{font-size:24px;line-height:1.3;margin:0 0 12px}
p{margin:0 0 16px;font-size:18px}
`;

export function blockedHtml(): string {
  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>Troppi tentativi · ${APP_NAME}</title>
<style>${STYLE}</style>
</head>
<body>
<header>${APP_NAME}</header>
<main>
<h1>Troppi tentativi</h1>
<p>Troppi tentativi: riprova tra 15 minuti.</p>
<p>Se il link ti è stato mandato da poco, controlla di averlo copiato per intero.</p>
</main>
</body>
</html>`;
}
