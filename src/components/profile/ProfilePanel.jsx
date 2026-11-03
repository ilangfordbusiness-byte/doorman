import ConfettiBurst from "./ConfettiBurst";

// Shared outer shell for every profile modal: an animated comet-trail gradient
// border, a scrollable inner card, and a one-shot confetti burst on open — so
// all profile views (friend, suggestion, host) share one look.
//
// `onClick` passes through to the outer element (the host modal stops
// propagation so a click inside doesn't close the overlay).
export default function ProfilePanel({
  children,
  fireConfetti = false,
  onClick = undefined,
  className = "",
  innerClassName = "",
  maxHeightClass = "max-h-[85vh]",
  innerMaxHeightClass = "max-h-[calc(85vh-6px)]",
}) {
  return (
    <div
      onClick={onClick}
      className={`relative rounded-3xl p-[3px] overflow-hidden ${maxHeightClass} ${className}`}
      style={{
        background: "hsl(270 18% 15%)",
        boxShadow: "0 24px 60px -24px rgba(0,0,0,0.85), 0 0 46px -26px hsl(270 90% 65% / 0.75)",
      }}
    >
      {/* animated border — a comet of light races around the edge */}
      <div
        className="absolute inset-[-55%] animate-spin [animation-duration:3s] pointer-events-none"
        style={{ background: "conic-gradient(from 0deg, transparent 0 78%, #22d3ee 88%, #f0abfc 93%, #ffffff 95%, transparent 99%)" }}
      />
      <div className={`relative rounded-[21px] bg-card overflow-y-auto ${innerMaxHeightClass} ${innerClassName}`}>
        {children}
      </div>
      <ConfettiBurst fire={fireConfetti} />
    </div>
  );
}
