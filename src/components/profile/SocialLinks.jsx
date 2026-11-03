import { Instagram, Ghost, MapPin } from "lucide-react";

// Glossy sticker pills for a person's socials, shared across every profile view
// so they look identical everywhere. Renders nothing when the person has none.
// `align="center"` centres the row (used by the host modal).
export default function SocialLinks({ instagram, snapchat, location, align = "start", className = "" }) {
  if (!instagram && !snapchat && !location) return null;
  const justify = align === "center" ? "justify-center" : "";
  return (
    <div className={`flex flex-wrap gap-2 ${justify} ${className}`}>
      {instagram && (
        <a
          href={`https://instagram.com/${instagram}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-white rounded-full px-3.5 py-2 border-2 border-white/80 shadow-md shadow-black/30 bg-gradient-to-br from-violet-500 via-pink-500 to-amber-400 hover:brightness-110 transition"
        >
          <Instagram className="w-3.5 h-3.5" />@{instagram}
        </a>
      )}
      {snapchat && (
        <a
          href={`https://www.snapchat.com/add/${snapchat}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-950 rounded-full px-3.5 py-2 border-2 border-white bg-amber-400 shadow-md shadow-black/30 hover:brightness-105 transition"
        >
          <Ghost className="w-3.5 h-3.5" />@{snapchat}
        </a>
      )}
      {location && (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground rounded-full px-3.5 py-2 border border-border bg-secondary">
          <MapPin className="w-3.5 h-3.5" />{location}
        </span>
      )}
    </div>
  );
}
