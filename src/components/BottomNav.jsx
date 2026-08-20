import { useLocation, useNavigate } from "react-router-dom";
import { Compass, Heart, UserCircle } from "lucide-react";

const tabs = [
  { path: "/guest?tab=discover", icon: Compass, label: "Discover" },
  { path: "/friends", icon: Heart, label: "Activity" },
  { path: "/profile", icon: UserCircle, label: "Profile" },
];

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  // Hide on full-screen pages
  const hidden = ["/scanner", "/pass/"].some((p) => location.pathname.startsWith(p));
  if (hidden) return null;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* Glow line at top */}
      <div className="h-px w-full" style={{ background: "linear-gradient(90deg, transparent, hsl(270 90% 65% / 0.5), hsl(180 100% 50% / 0.4), transparent)" }} />
      <div className="bg-black/80 backdrop-blur-2xl border-t border-white/5">
        <div className="flex items-stretch max-w-lg mx-auto">
          {tabs.map(({ path, icon: Icon, label }) => {
            const tabPath = path.split("?")[0];
            const active = tabPath === "/" ? location.pathname === "/" : location.pathname === tabPath || location.pathname.startsWith(tabPath + "/");
            return (
              <button
                key={path}
                onClick={() => {
                  if (location.pathname === path) return;
                  navigate(path);
                }}
                className="flex-1 flex flex-col items-center justify-center py-2.5 gap-1 select-none transition-all min-h-[52px] relative"
              >
                {active && (
                  <div
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-px"
                    style={{ background: "linear-gradient(90deg, transparent, hsl(270 90% 65%), transparent)", boxShadow: "0 0 8px hsl(270 90% 65%)" }}
                  />
                )}
                <Icon
                  className={`w-5 h-5 transition-all ${active ? "text-primary drop-shadow-[0_0_6px_hsl(270_90%_65%/0.9)]" : "text-muted-foreground"}`}
                />
                <span
                  className={`text-[9px] font-mono tracking-widest uppercase transition-all ${
                    active ? "text-primary" : "text-muted-foreground/60"
                  }`}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}