/** Skeleton of Altro > Account (the `(app)` one is the Home's). */
export default function AccountLoading() {
  return (
    <div
      className="flex max-w-xl flex-col gap-6"
      role="status"
      aria-busy="true"
      aria-label="Sto caricando il tuo accesso"
    >
      <div className="bg-muted h-8 w-48 animate-pulse rounded-md motion-reduce:animate-none" />
      <div className="border-border bg-card h-72 animate-pulse rounded-lg border motion-reduce:animate-none" />
    </div>
  );
}
