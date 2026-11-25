/** Skeleton rows while the guests load (design §3). */
export default function GuestsLoading() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Sto caricando gli invitati">
      <div className="bg-muted h-8 w-32 animate-pulse rounded-md motion-reduce:animate-none" />
      <div className="bg-muted h-6 w-64 max-w-full animate-pulse rounded-md motion-reduce:animate-none" />
      {[0, 1, 2, 3, 4].map((index) => (
        <div
          key={index}
          className="border-border bg-card h-14 animate-pulse rounded-lg border motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}
