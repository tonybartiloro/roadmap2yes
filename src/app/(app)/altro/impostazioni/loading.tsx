/** Skeleton of Altro > Impostazioni nozze. */
export default function SettingsLoading() {
  return (
    <div
      className="flex max-w-xl flex-col gap-6"
      role="status"
      aria-busy="true"
      aria-label="Sto caricando le impostazioni"
    >
      <div className="bg-muted h-8 w-64 animate-pulse rounded-md motion-reduce:animate-none" />
      <div className="border-border bg-card h-40 animate-pulse rounded-lg border motion-reduce:animate-none" />
      <div className="border-border bg-card h-40 animate-pulse rounded-lg border motion-reduce:animate-none" />
      <div className="border-border bg-card h-56 animate-pulse rounded-lg border motion-reduce:animate-none" />
    </div>
  );
}
