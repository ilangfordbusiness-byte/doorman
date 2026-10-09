// A holographic field of little DoorMan keys: the brand keyhole-tie logo outline
// tiled as a repeating mask over an iridescent gradient that drifts, so the
// background shimmers with lots of little keys. Sits behind page content (parent
// must be a stacking context, e.g. `relative isolate`, for the -z-10 layer to show
// over the app background). Decorative only; honors prefers-reduced-motion.
//
// The tile is the logo outline: a ring (keyhole head) + a tapered necktie, drawn
// twice (outer + inner) as strokes — matching the DoorMan mark.
const KEY_TILE =
  "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='44'%20height='62'%20viewBox='0%200%20120%20170'%3E%3Cg%20fill='none'%20stroke='black'%20stroke-width='7'%20stroke-linecap='round'%20stroke-linejoin='round'%3E%3Ccircle%20cx='60'%20cy='54'%20r='26'/%3E%3Cpath%20d='M48%2074%20L42%20128%20L60%20150%20L78%20128%20L72%2074'/%3E%3Ccircle%20cx='60'%20cy='54'%20r='15'/%3E%3Cpath%20d='M54%2074%20L50%20124%20L60%20140%20L70%20124%20L66%2074'/%3E%3C/g%3E%3C/svg%3E";

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
        WebkitMaskSize: "44px 62px",
        maskSize: "44px 62px",
      }}
    />
  );
}
