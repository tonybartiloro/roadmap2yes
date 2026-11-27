/**
 * The one neutral view (AC6, design §1.1 C): same words for an unknown, revoked, expired or
 * recipient-less link, no name, date or brand, no button. Used by `not-found.tsx` and, after a
 * submit, in place of the whole page (DES-25).
 */
export function LinkUnavailable() {
  return (
    <section data-testid="rsvp-unavailable">
      <h1 className="font-heading mb-4 text-[28px] leading-9">Questo link non funziona più</h1>
      <p>Se pensi sia un errore, scrivi a chi ti ha invitato.</p>
    </section>
  );
}
