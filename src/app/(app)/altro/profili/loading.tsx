/** Skeleton of Altro > Profili. */
export default function ProfilesLoading() {
  return (
    <div
      className="flex max-w-xl flex-col gap-6"
      role="status"
      aria-busy="true"
      aria-label="Sto caricando i profili"
    >
      <div className="bg-muted h-8 w-40 animate-pulse rounded-md motion-reduce:animate-none" />
      <div className="border-border bg-card h-80 animate-pulse rounded-lg border motion-reduce:animate-none" />
      <div className="border-border bg-card h-80 animate-pulse rounded-lg border motion-reduce:animate-none" />
    </div>
  );
}
