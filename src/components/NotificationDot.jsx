// Small red notification circle with a count, positioned absolutely by parent.
// Renders nothing when count is 0.
export default function NotificationDot({ count, className = "top-2 right-2 w-4 h-4" }) {
  if (!count) return null;
  return (
    <span
      className={`absolute ${className} flex items-center justify-center rounded-full bg-red-500 border-2 border-card z-10`}
      style={{ boxShadow: "0 0 8px hsl(0 85% 60% / 0.85)" }}
    >
      <span className="text-[9px] font-bold text-white leading-none">{count > 9 ? "9+" : count}</span>
    </span>
  );
}