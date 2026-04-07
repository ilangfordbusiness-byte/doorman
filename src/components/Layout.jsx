import { Outlet, Link, useLocation } from "react-router-dom";
import { Home, Plus, ScanLine, User } from "lucide-react";

export default function Layout() {
  const location = useLocation();
  const path = location.pathname;

  const navItems = [
    { to: "/", icon: Home, label: "Home" },
    { to: "/create-event", icon: Plus, label: "Create" },
    { to: "/scanner", icon: ScanLine, label: "Scan" },
    { to: "/profile", icon: User, label: "Profile" },
  ];

  const hideNav = path.startsWith("/scanner") || path.startsWith("/pass/");

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <main className="flex-1 pb-20">
        <Outlet />
      </main>
      {!hideNav && (
        <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/80 backdrop-blur-xl border-t border-border safe-area-bottom">
          <div className="max-w-lg mx-auto flex items-center justify-around py-2 px-4">
            {navItems.map((item) => {
              const isActive = item.to === "/" ? path === "/" : path.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl transition-all duration-200 ${
                    isActive
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <item.icon className={`w-5 h-5 ${isActive ? "stroke-[2.5]" : ""}`} />
                  <span className="text-[10px] font-medium">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}