/**
 * Skeleton of the Home (design §4: "skeleton card"), same grid as `HomeScreen`. Route-specific
 * `loading.tsx` files (percorso, scelte, budget) are nearer to their pages and win over this one.
 */
export default function AppLoading() {
  return (
    <div
      className="flex flex-col gap-6"
      role="status"
      aria-busy="true"
      aria-label="Sto caricando la home"
    >
      <div className="bg-muted h-8 w-64 max-w-full animate-pulse rounded-md motion-reduce:animate-none" />
      <div className="grid gap-6 md:grid-cols-2">
        {[0, 1, 2, 3].map((index) => (
          <div
            key={index}
            className="border-border bg-card h-40 animate-pulse rounded-lg border motion-reduce:animate-none"
          />
        ))}
      </div>
    </div>
  );
}
