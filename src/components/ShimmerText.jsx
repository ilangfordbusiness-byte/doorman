// Text with a flowing holographic sheen (purple → white → cyan → pink) sweeping
// through it. Reuses the `holo-pan` background-position animation. Honors
// prefers-reduced-motion (static gradient). Wrap any short-ish heading.
export default function ShimmerText({ children, className = "" }) {
  return (
    <span
      className={`bg-[linear-gradient(90deg,hsl(270_90%_72%),#ffffff,hsl(180_100%_62%),hsl(330_100%_68%),hsl(270_90%_72%))] bg-[length:200%_auto] bg-clip-text text-transparent animate-holo-pan motion-reduce:animate-none ${className}`}
    >
      {children}
    </span>
  );
}
