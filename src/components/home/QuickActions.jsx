import { Link } from "react-router-dom";
import { Instagram, Heart, Plus } from "lucide-react";

function Action({ to, icon: Icon, label, sub, color }) {
  return (
    <Link to={to} className="flex-1 flex flex-col items-center justify-center py-3.5 px-2 text-center hover:bg-secondary/40 transition-colors active:scale-[0.98]">
      <Icon className={`w-5 h-5 mb-1.5 ${color}`} />
      <p className="text-[11px] font-bold text-foreground leading-tight">{label}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight truncate w-full">{sub}</p>
    </Link>
  );
}

function Divider() {
  return <div className="w-px bg-border/60 my-2" />;
}

export default function QuickActions({ user }) {
  const hasIg = !!user?.instagram;
  return (
    <div className="flex items-stretch bg-card border border-border rounded-2xl overflow-hidden">
      <Action
        to="/profile"
        icon={Instagram}
        label={hasIg ? "Instagram" : "Connect Instagram"}
        sub={hasIg ? `@${user.instagram}` : "Add to your profile"}
        color="text-pink-400"
      />
      <Divider />
      <Action to="/friends" icon={Heart} label="Requests" sub="New activity" color="text-primary" />
      <Divider />
      <Action to="/create-event" icon={Plus} label="Create Event" sub="Host something" color="text-amber-400" />
    </div>
  );
}