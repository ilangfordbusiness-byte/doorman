import { useLocation, useNavigate } from "react-router-dom";
import { Mic2, Users, ScanLine, HeartHandshake, UserCircle } from "lucide-react";

const tabs = [
  { path: "/host", icon: Mic2, label: "Host" },
  { path: "/guest", icon: Users, label: "Guest" },
  { path: "/staff", icon: ScanLine, label: "Staff" },
  { path: "/friends", icon: HeartHandshake, label: "Friends" },
  { path: "/profile", icon: UserCircle, label: "Account" },
];

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  // Hide on full-screen pages
  const hidden = ["/scanner", "/pass/"].some((p) => location.pathname.startsWith(p));
  if (hidden) return null;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-card/90 backdrop-blur-xl border-t border-border"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-stretch max-w-lg mx-auto">
        {tabs.map(({ path, icon: Icon, label }) => {
          const active = location.pathname === path || location.pathname.startsWith(path + "/");
          return (
            <button
              key={path}
              onClick={() => {
                if (location.pathname === path) return; // already here
                navigate(path);
              }}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 select-none transition-colors min-h-[52px] ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Icon className={`w-5 h-5 ${active ? "text-primary" : "text-muted-foreground"}`} />
              <span className={`text-[10px] font-semibold ${active ? "text-primary" : "text-muted-foreground"}`}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}