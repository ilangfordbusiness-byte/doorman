import { Outlet, Navigate, Link, useLocation } from "react-router-dom";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useActiveAccount, useSwitchAccount } from "@/hooks/useActiveAccount";
import LoadingSpinner from "./LoadingSpinner";
import Avatar from "./Avatar";
import { ArrowLeftRight, Plus, History } from "lucide-react";

export default function BusinessLayout() {
  const { data: me } = useCurrentUser();
  const { data: business } = useActiveAccount();
  const { switchToPersonal } = useSwitchAccount();
  const location = useLocation();

  if (!me) return <LoadingSpinner fullScreen />;
  if (!me.active_business_id) return <Navigate to="/" replace />;
  if (!business) return <LoadingSpinner fullScreen />;

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Avatar src={business.business_picture} name={business.business_name} size="w-9 h-9" textClass="text-sm" />
          <div className="flex-1 min-w-0">
            <p className="font-heading font-bold text-sm truncate">{business.business_name}</p>
            <p className="text-[10px] text-primary uppercase tracking-widest font-mono">Business Account</p>
          </div>
          <button
            onClick={switchToPersonal}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-secondary border border-border hover:bg-secondary/80"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" /> Personal
          </button>
        </div>
        <div className="max-w-lg mx-auto px-4 flex gap-2 pb-2">
          <TabLink to="/business/create-event" active={location.pathname === "/business/create-event"} icon={<Plus className="w-3.5 h-3.5" />} label="Events" />
          <TabLink to="/business/past-events" active={location.pathname === "/business/past-events"} icon={<History className="w-3.5 h-3.5" />} label="Past Events" />
        </div>
      </div>
      <div className="max-w-lg mx-auto px-4 pt-4 pb-8">
        <Outlet />
      </div>
    </div>
  );
}

function TabLink({ to, active, icon, label }) {
  return (
    <Link
      to={to}
      className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg ${active ? "bg-primary text-primary-foreground" : "bg-secondary/50 text-muted-foreground border border-border"}`}
    >
      {icon} {label}
    </Link>
  );
}