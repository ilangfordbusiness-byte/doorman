import { cn } from "@/lib/utils";

// A "living" primary call-to-action: a flowing neon gradient (purple → pink →
// cyan) with a light sweeping across it and a soft glow. Used for the main
// purchase actions (Buy Tickets, Pay). A plain <button> so it can sit inside a
// <Link> like the old Buy button did. Honors prefers-reduced-motion.
export default function CtaButton({ className = "", children, ...props }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "relative overflow-hidden inline-flex items-center justify-center h-14 w-full rounded-xl font-bold text-base gap-2 text-white border-0",
        "bg-[linear-gradient(90deg,hsl(270_90%_65%),hsl(330_100%_62%),hsl(180_100%_50%),hsl(270_90%_65%))] bg-[length:300%_100%] animate-holo-pan",
        "shadow-[0_0_24px_-4px_hsl(270_90%_65%/0.55)] transition-[filter] hover:brightness-110 active:brightness-95",
        "disabled:opacity-60 disabled:animate-none motion-reduce:animate-none",
        className,
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-shine motion-reduce:hidden"
      />
      <span className="relative inline-flex items-center gap-2">{children}</span>
    </button>
  );
}
