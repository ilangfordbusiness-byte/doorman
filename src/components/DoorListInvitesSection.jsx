import { Link } from "react-router-dom";
import { ListChecks, ChevronRight } from "lucide-react";
import Avatar from "./Avatar";

// Door lists someone shared with you that you haven't opened yet (from
// get_notifications.doorListInvites). Opening the list clears it. Shown on
// Activity and Profile, like the business and co-host invites.
export default function DoorListInvitesSection({ invites, className = "mb-4" }) {
  if (!invites || invites.length === 0) return null;
  return (
    <div className={`bg-card rounded-2xl border border-emerald-500/25 p-4 ${className}`}>
      <h3 className="font-heading font-semibold text-sm flex items-center gap-2 mb-3">
        <span className="w-2 h-2 rounded-full bg-red-500" style={{ boxShadow: "0 0 6px hsl(0 85% 60% / 0.8)" }} />
        Door list invites
      </h3>
      <div className="space-y-2">
        {invites.map((inv) => (
          <Link key={inv.list_id} to={`/door-lists/${inv.list_id}`}
            className="flex items-center gap-3 bg-secondary/40 rounded-xl p-3 border border-border/50 active:scale-[0.99] transition-transform">
            <div className="relative flex-shrink-0">
              <Avatar src={inv.owner_picture} name={inv.owner_name} size="w-9 h-9" textClass="text-xs" />
              <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center border-2 border-card">
                <ListChecks className="w-3 h-3 text-white" />
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{inv.list_name}</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {inv.owner_name || "Someone"} added you to help check guests in
              </p>
            </div>
            <span className="text-xs font-semibold text-emerald-400 flex items-center gap-0.5 flex-shrink-0">
              Open <ChevronRight className="w-3.5 h-3.5" />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
