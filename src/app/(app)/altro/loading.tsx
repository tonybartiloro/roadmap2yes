/** Skeleton of the Altro index (the shared `(app)/loading.tsx` is the Home's). */
export default function AltroLoading() {
  return (
    <div className="flex max-w-xl flex-col gap-6" role="status" aria-label="Sto caricando">
      <div className="bg-muted h-8 w-24 animate-pulse rounded-md motion-reduce:animate-none" />
      <div className="border-border bg-card h-96 animate-pulse rounded-lg border motion-reduce:animate-none" />
    </div>
  );
}
