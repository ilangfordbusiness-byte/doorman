// Reusable avatar: shows a profile picture when available, otherwise the
// person's initial in a branded circle. Pass `src` (image url), `name` (for
// the initial + alt), and `size` (tailwind size class for the box, e.g. "w-10 h-10").
export default function Avatar({ src, name = "?", size = "w-10 h-10", textClass = "text-sm", className = "" }) {
  const initial = (name || "?").trim()[0]?.toUpperCase() || "?";
  return (
    <div className={`${size} rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 overflow-hidden ${className}`}>
      {src ? (
        <img src={src} alt={name} className="w-full h-full object-cover" />
      ) : (
        <span className={`${textClass} font-bold text-primary font-heading`}>{initial}</span>
      )}
    </div>
  );
}