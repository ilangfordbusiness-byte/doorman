// The DoorMan keyhole mark as inline SVG (the logo.png ships on a grey box, so
// this transparent, tintable version is used for decorative watermarks — e.g.
// the neon shape that glass tabs frost over). Outlined cyan + pink neon with a
// soft glow, matching the brand logo. Purely decorative (aria-hidden).
export default function KeyholeMark({ className = "" }) {
  return (
    <svg
      viewBox="0 0 100 150"
      fill="none"
      aria-hidden="true"
      className={className}
      style={{ filter: "drop-shadow(0 0 10px hsl(180 100% 50% / 0.45)) drop-shadow(0 0 16px hsl(330 100% 62% / 0.35))" }}
    >
      <g stroke="hsl(180 100% 55%)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="50" cy="42" r="28" />
        <path d="M40 64 L34 120 L50 146 L66 120 L60 64" />
      </g>
      <g stroke="hsl(330 100% 62%)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="50" cy="42" r="21" />
        <path d="M45 64 L40 118 L50 136 L60 118 L55 64" />
      </g>
    </svg>
  );
}
