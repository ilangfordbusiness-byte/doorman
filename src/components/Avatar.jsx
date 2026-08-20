import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

// Reusable avatar: shows a profile picture when available, otherwise the
// person's initial in a branded circle. If the image URL fails to actually
// load (broken link, expired, network failure), it falls back to the initial
// too — the same fallback used when no picture is set.
//
// Props:
//  - src:       image url
//  - name:      used for the initial + alt text
//  - size:      tailwind box size class (e.g. "w-10 h-10")
//  - rounded:   corner radius class (default "rounded-full")
//  - textClass: text sizing/color for the initial (e.g. "text-sm", "text-white text-[9px]")
//  - className: overrides container styles (bg, border, etc.) via tailwind-merge
export default function Avatar({ src, name = "?", size = "w-10 h-10", rounded = "rounded-full", textClass = "text-sm", className = "" }) {
  const [broken, setBroken] = useState(false);

  // Re-attempt the image whenever the url changes.
  useEffect(() => { setBroken(false); }, [src]);

  const initial = (name || "?").trim()?.[0]?.toUpperCase() || "?";
  const showImg = src && !broken;

  return (
    <div className={cn(`${size} ${rounded} bg-primary/20 flex items-center justify-center flex-shrink-0 overflow-hidden`, className)}>
      {showImg ? (
        <img src={src} alt={name} className="w-full h-full object-cover" onError={() => setBroken(true)} />
      ) : (
        <span className={cn("font-bold text-primary font-heading", textClass)}>{initial}</span>
      )}
    </div>
  );
}