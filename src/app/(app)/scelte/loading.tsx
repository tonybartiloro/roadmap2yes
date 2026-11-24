/** Skeleton cards while the decisions load (design §4: "skeleton carte"). */
export default function ScelteLoading() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Sto caricando le scelte">
      <div className="bg-muted h-8 w-40 animate-pulse rounded-md motion-reduce:animate-none" />
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className="border-border bg-card h-24 animate-pulse rounded-lg border motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}
