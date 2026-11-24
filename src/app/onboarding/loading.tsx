/** Skeleton of the onboarding: progress line, title and the first card. */
export default function OnboardingLoading() {
  return (
    <div
      className="mx-auto flex w-full max-w-xl flex-col gap-6 px-6 py-10"
      role="status"
      aria-busy="true"
      aria-label="Sto preparando l'onboarding"
    >
      <div className="bg-muted h-5 w-28 animate-pulse rounded-md motion-reduce:animate-none" />
      <div className="bg-muted h-3 w-full animate-pulse rounded-full motion-reduce:animate-none" />
      <div className="bg-muted h-9 w-4/5 animate-pulse rounded-md motion-reduce:animate-none" />
      <div className="border-border bg-card h-64 animate-pulse rounded-lg border motion-reduce:animate-none" />
    </div>
  );
}
