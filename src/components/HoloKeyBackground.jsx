// A holographic field of little DoorMan keys: the brand keyhole-tie logo outline
// tiled as a repeating mask over an iridescent gradient that drifts, so the
// background shimmers with lots of little keys. Sits behind page content (parent
// must be a stacking context, e.g. `relative isolate`, for the -z-10 layer to show
// over the app background). Decorative only; honors prefers-reduced-motion.
//
// The tile is the exact DoorMan mark: an OPEN keyhole ring (open at the bottom)
// flowing into a hanging necktie, drawn twice (outer + inner) as strokes.
const KEY_TILE =
  "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='42'%20height='63'%20viewBox='0%200%20100%20150'%3E%3Cg%20fill='none'%20stroke='black'%20stroke-width='5'%20stroke-linecap='round'%20stroke-linejoin='round'%3E%3Cpath%20d='M58%2063%20A22%2022%200%201%200%2042%2063%20L37%20100%20L50%20122%20L63%20100%20Z'/%3E%3Cpath%20d='M55%2058%20A15%2015%200%201%200%2045%2058%20L42%2096%20L50%20112%20L58%2096%20Z'/%3E%3C/g%3E%3C/svg%3E";

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
        WebkitMaskSize: "42px 63px",
        maskSize: "42px 63px",
      }}
    />
  );
}
