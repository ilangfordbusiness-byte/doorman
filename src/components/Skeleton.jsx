// Neon shimmer loading placeholders — a light sweeps across dark blocks, matching
// the app's purple tint. Used in place of a spinner while content loads.
export function Skeleton({ className = "" }) {
  return (
    <div
      className={`rounded-xl bg-[linear-gradient(100deg,hsl(240_10%_12%)_30%,hsl(270_30%_20%)_50%,hsl(240_10%_12%)_70%)] bg-[length:200%_100%] animate-shimmer motion-reduce:animate-none ${className}`}
    />
  );
}

// A placeholder shaped like an EventCard (square cover + title/subtitle lines).
export function SkeletonEventCard() {
  return (
    <div className="rounded-2xl overflow-hidden bg-card border border-border">
      <Skeleton className="w-full aspect-square rounded-none" />
      <div className="p-4 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

// A stack of skeleton event cards for a loading list.
export function SkeletonEventList({ count = 3 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => <SkeletonEventCard key={i} />)}
    </div>
  );
}
