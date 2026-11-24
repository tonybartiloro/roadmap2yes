/** Skeleton of the two switches. */
export default function PromemoriaLoading() {
  return (
    <div className="flex max-w-xl flex-col gap-6" role="status" aria-label="Sto caricando">
      <div className="bg-muted h-8 w-48 animate-pulse rounded-md motion-reduce:animate-none" />
      {[0, 1].map((index) => (
        <div
          key={index}
          className="border-border bg-card h-24 animate-pulse rounded-lg border motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}
