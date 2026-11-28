/**
 * The neutral page of a link that does not work (AC6). The proxy answers it itself with a 404,
 * because Next 16.4.6 sends an empty `<body>` for `notFound()` without JavaScript (Arbitrato S3).
 * Hand-written, script-free HTML in the pattern of `blocked-html.ts`: one constant string, so the
 * bytes are identical for every cause (unknown, revoked, expired, no recipient, malformed). No name,
 * date, theme or brand. The texts are shared with `LinkUnavailable` (the 200 view after a submit).
 */

export const NEUTRAL_TITLE = "Conferma la tua presenza";
export const NEUTRAL_HEADING = "Questo link non funziona più";
export const NEUTRAL_TEXT = "Se pensi sia un errore, scrivi a chi ti ha invitato.";

const STYLE = `
:root{color-scheme:light dark;--bg:#fbf7f0;--fg:#2b2a26}
@media(prefers-color-scheme:dark){:root{--bg:#171611;--fg:#f2ede2}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:18px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:36rem;margin:0 auto;padding:40px 24px}
h1{font-size:28px;line-height:1.3;margin:0 0 16px}
p{margin:0 0 16px;font-size:18px}
`;

const HTML = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>${NEUTRAL_TITLE}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<h1>${NEUTRAL_HEADING}</h1>
<p>${NEUTRAL_TEXT}</p>
</main>
</body>
</html>`;

export function neutralHtml(): string {
  return HTML;
}
