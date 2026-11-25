import { APP_NAME } from "@/components/app-name";
import { escapeHtml } from "@/lib/email/escape";
import type { UnsubscribableKind } from "@/lib/email";

/**
 * HTML of the unsubscribe page (plan §7, AC52). A route handler cannot render the React shell, so
 * the page is small hand-written HTML in the Giardino palette (light and dark), with the same
 * 44 px touch target and no script. Nothing user-supplied is echoed except a validated kind.
 */

const COPY: Record<UnsubscribableKind, { question: string; effect: string; done: string }> = {
  reminders: {
    question: "Vuoi disattivare i promemoria per email?",
    effect:
      "Non riceverai più le email con le scadenze dei compiti. Nell'app le scadenze restano sempre visibili.",
    done: "I promemoria per email sono disattivati.",
  },
  digest: {
    question: "Vuoi disattivare il riepilogo del lunedì?",
    effect:
      "Non riceverai più l'email con il riepilogo della settimana. Nell'app trovi sempre tutto.",
    done: "Il riepilogo del lunedì è disattivato.",
  },
};

const STYLE = `
:root{color-scheme:light dark;--bg:#fbf7f0;--fg:#2b2a26;--primary:#43573f;--on-primary:#fbf7f0;--muted:#5d5a52}
@media(prefers-color-scheme:dark){:root{--bg:#171611;--fg:#f2ede2;--primary:#a9c3a5;--on-primary:#1a2418;--muted:#c9c3b4}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
header{padding:24px 24px 0;font-size:22px}
main{max-width:36rem;margin:0 auto;padding:40px 24px}
h1{font-size:24px;line-height:1.3;margin:0 0 12px}
p{margin:0 0 16px}
.muted{color:var(--muted)}
button,a.button{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 20px;border:0;border-radius:8px;background:var(--primary);color:var(--on-primary);font:inherit;font-weight:600;text-decoration:none;cursor:pointer}
button:focus-visible,a:focus-visible{outline:3px solid var(--fg);outline-offset:3px}
a{color:var(--primary)}
`;

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(title)} · ${escapeHtml(APP_NAME)}</title>
<style>${STYLE}</style>
</head>
<body>
<header>${escapeHtml(APP_NAME)}</header>
<main>
${body}
</main>
</body>
</html>`;
}

/** GET: asks for confirmation. The form POSTs to the same URL (the token stays in the query). */
export function confirmationPage(kind: UnsubscribableKind, actionUrl: string): string {
  const copy = COPY[kind];
  return page(
    copy.question,
    `<h1>${escapeHtml(copy.question)}</h1>
<p>${escapeHtml(copy.effect)}</p>
<p class="muted">Puoi riattivarli quando vuoi da Opzioni &gt; Promemoria.</p>
<form method="post" action="${escapeHtml(actionUrl)}"><button type="submit">Sì, disattiva</button></form>`,
  );
}

/** POST done. */
export function donePage(kind: UnsubscribableKind): string {
  const copy = COPY[kind];
  return page(
    "Fatto",
    `<h1>Fatto</h1>
<p>${escapeHtml(copy.done)}</p>
<p class="muted">Puoi riattivare le email quando vuoi da Opzioni &gt; Promemoria, dentro l'app.</p>
<p><a class="button" href="/">Apri ${escapeHtml(APP_NAME)}</a></p>`,
  );
}

/** Malformed, tampered, other kind or other secret: one neutral message for all of them. */
export function invalidPage(): string {
  return page(
    "Link non valido",
    `<h1>Questo link non funziona</h1>
<p>Il link per disattivare le email non è valido. Puoi gestire i promemoria dall'app, in Opzioni &gt; Promemoria.</p>
<p><a class="button" href="/">Apri ${escapeHtml(APP_NAME)}</a></p>`,
  );
}

export function errorPage(): string {
  return page(
    "Qualcosa non ha funzionato",
    `<h1>Qualcosa non ha funzionato</h1>
<p>Non siamo riusciti a salvare la modifica. Riprova tra poco, oppure gestisci i promemoria dall'app, in Opzioni &gt; Promemoria.</p>
<p><a class="button" href="/">Apri ${escapeHtml(APP_NAME)}</a></p>`,
  );
}
