"use client";

/**
 * Last-resort error boundary (replaces the root layout): self-contained, no imports of data,
 * theme, fonts or the database (plan §9). Plain inline styles with the "Giardino" palette, light
 * and dark through `prefers-color-scheme`. Texts are static.
 */
const STYLES = `
  :root { color-scheme: light dark; }
  body { margin: 0; font-family: system-ui, sans-serif; background: #FBF7F0; color: #2B2A26; }
  main { max-width: 32rem; margin: 0 auto; padding: 4rem 1.5rem; }
  h1 { font-family: Georgia, serif; font-size: 1.75rem; line-height: 2.125rem; margin: 0 0 1rem; }
  p { font-size: 1rem; line-height: 1.5rem; margin: 0 0 1.5rem; }
  button { min-height: 44px; padding: 0 1.5rem; border: 0; border-radius: 12px; font-size: 1rem;
    font-weight: 600; background: #43573F; color: #FBF7F0; cursor: pointer; }
  button:focus-visible { outline: 2px solid #43573F; outline-offset: 2px; }
  @media (prefers-color-scheme: dark) {
    body { background: #171611; color: #F2EDE2; }
    button { background: #A9C3A5; color: #1A2418; }
    button:focus-visible { outline-color: #A9C3A5; }
  }
`;

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="it">
      <head>
        <meta name="robots" content="noindex" />
        <title>Qualcosa non va · roadmap2yes</title>
        <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      </head>
      <body>
        <main>
          <h1 role="alert">Qualcosa non è andato come doveva.</h1>
          <p>
            Non hai perso nulla di quello che era già salvato. Riprova: se continua, avvisa chi
            gestisce l&apos;app.
          </p>
          <button type="button" onClick={() => reset()}>
            Riprova
          </button>
        </main>
      </body>
    </html>
  );
}
