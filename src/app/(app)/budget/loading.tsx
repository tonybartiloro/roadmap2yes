/** Skeleton bars while the budget loads (design §4: "skeleton barre"). */
export default function BudgetLoading() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Sto caricando il budget">
      <div className="bg-muted h-8 w-32 animate-pulse rounded-md motion-reduce:animate-none" />
      <div className="border-border bg-card h-40 animate-pulse rounded-lg border motion-reduce:animate-none" />
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className="border-border bg-card h-20 animate-pulse rounded-lg border motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}
