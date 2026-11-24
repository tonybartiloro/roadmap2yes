/** Skeleton cards of the theme gallery. */
export default function AspettoLoading() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-label="Sto caricando i temi">
      <div className="bg-muted h-8 w-32 animate-pulse rounded-md motion-reduce:animate-none" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <div
            key={index}
            className="border-border bg-card h-44 animate-pulse rounded-lg border motion-reduce:animate-none"
          />
        ))}
      </div>
    </div>
  );
}
