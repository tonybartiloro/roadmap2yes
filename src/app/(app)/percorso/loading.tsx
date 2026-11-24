/** Skeleton rows while the Percorso loads (design §4). Static, no animation loop. */
export default function Loading() {
  return (
    <div
      className="flex flex-col gap-6"
      aria-busy="true"
      aria-live="polite"
      data-testid="percorso-loading"
    >
      <h1 className="text-[28px] leading-[34px]">Percorso</h1>
      <p className="sr-only">Sto caricando il Percorso…</p>
      <div className="flex flex-col gap-2" aria-hidden>
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="border-border bg-muted h-16 rounded-lg border" />
        ))}
      </div>
    </div>
  );
}
