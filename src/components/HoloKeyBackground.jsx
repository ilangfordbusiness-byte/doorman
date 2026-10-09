// A holographic field of little DoorMan keys: the brand keyhole-tie logo outline
// tiled as a repeating mask over an iridescent gradient that drifts, so the
// background shimmers with lots of little keys. Sits behind page content (parent
// must be a stacking context, e.g. `relative isolate`, for the -z-10 layer to show
// over the app background). Decorative only; honors prefers-reduced-motion.
//
// The tile is the exact DoorMan mark: an OPEN keyhole ring (open at the bottom)
// flowing into a hanging necktie, drawn twice (outer + inner) as strokes.
const KEY_TILE =
  "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='72'%20height='101'%20viewBox='0%200%20100%20140'%3E%3Cg%20fill='none'%20stroke='black'%20stroke-width='5'%20stroke-linecap='round'%20stroke-linejoin='round'%3E%3Cpath%20d='M58%2061%20A23%2023%200%201%200%2042%2061%20L32%2093%20L50%20113%20L68%2093%20Z'/%3E%3Cpath%20d='M55%2056%20A15%2015%200%201%200%2045%2056%20L38%2090%20L50%20107%20L62%2090%20Z'/%3E%3C/g%3E%3C/svg%3E";

export default function HoloKeyBackground({ opacity = 0.32, className = "" }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed inset-0 -z-10 animate-holo-drift motion-reduce:animate-none ${className}`}
      style={{
        opacity,
        backgroundImage:
          "linear-gradient(120deg, hsl(270 95% 70%), hsl(180 100% 60%), hsl(330 100% 68%), hsl(200 100% 65%), hsl(270 95% 70%))",
        backgroundSize: "300% 300%",
        WebkitMaskImage: `url("${KEY_TILE}")`,
        maskImage: `url("${KEY_TILE}")`,
        WebkitMaskRepeat: "repeat",
        maskRepeat: "repeat",
        // Size each tile to a fraction of the viewport width so a whole number
        // of keys always fits across — no half-keys clipped at the edges. The
        // 1.4 keeps the key's proportions (viewBox is 100×140).
        WebkitMaskSize: "calc(100vw / 8) calc(100vw / 8 * 1.4)",
        maskSize: "calc(100vw / 8) calc(100vw / 8 * 1.4)",
      }}
    />
  );
}
