// A holographic field of tiny DoorMan keyholes: a repeating key mask over an
// iridescent gradient that slowly drifts, so the background shimmers with lots of
// little keys. Ambient and subtle — sits behind page content (parent must be a
// stacking context, e.g. `relative isolate`, for the -z-10 layer to show over the
// app background). Decorative only; honors prefers-reduced-motion.
const KEY_TILE =
  "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='46'%20height='46'%20viewBox='0%200%2046%2046'%3E%3Cg%20fill='black'%3E%3Ccircle%20cx='23'%20cy='17'%20r='7'/%3E%3Cpath%20d='M18%2021%20L15%2034%20L31%2034%20L28%2021%20Z'/%3E%3C/g%3E%3C/svg%3E";

export default function HoloKeyBackground({ opacity = 0.15, className = "" }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 -z-10 animate-holo-drift motion-reduce:animate-none ${className}`}
      style={{
        opacity,
        backgroundImage:
          "linear-gradient(120deg, hsl(270 90% 65%), hsl(180 100% 50%), hsl(330 100% 62%), hsl(200 100% 60%), hsl(270 90% 65%))",
        backgroundSize: "300% 300%",
        WebkitMaskImage: `url("${KEY_TILE}")`,
        maskImage: `url("${KEY_TILE}")`,
        WebkitMaskRepeat: "repeat",
        maskRepeat: "repeat",
        WebkitMaskSize: "46px 46px",
        maskSize: "46px 46px",
      }}
    />
  );
}
