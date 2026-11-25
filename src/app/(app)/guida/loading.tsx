/** Skeleton of the Guida index and pages (the shared `(app)/loading.tsx` is the Home's). */
export default function GuideLoading() {
  return (
    <div className="flex max-w-xl flex-col gap-6" role="status" aria-label="Sto caricando">
      <div className="bg-muted h-8 w-24 animate-pulse rounded-md motion-reduce:animate-none" />
      <div className="bg-muted h-14 animate-pulse rounded-lg motion-reduce:animate-none" />
      <div className="bg-muted h-14 animate-pulse rounded-lg motion-reduce:animate-none" />
      <div className="bg-muted h-14 animate-pulse rounded-lg motion-reduce:animate-none" />
    </div>
  );
}
