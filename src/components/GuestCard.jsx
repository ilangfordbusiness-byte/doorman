import { Check, X, Clock, UserPlus, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import StatusBadge from "./StatusBadge";
import Avatar from "./Avatar";
import { formatPhoneDisplay } from "@/lib/phone";

export default function GuestCard({ guest, onApprove, onDeny, onWaitlist, onToggleChat, showActions = true, picture, onViewProfile }) {
  const canApprove = ["requested", "waitlist", "denied"].includes(guest.status);
  const canDeny = ["requested", "waitlist", "approved", "invited"].includes(guest.status);
  const canWaitlist = ["requested"].includes(guest.status);
  const chatEligible = ["approved", "invited", "checked_in"].includes(guest.status);

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary/50 border border-border/50">
      {/* Avatar + Info — clickable to open profile */}
      <button
        type="button"
        onClick={onViewProfile ? () => onViewProfile(guest) : undefined}
        disabled={!onViewProfile}
        className={`flex items-center gap-3 flex-1 min-w-0 text-left ${onViewProfile ? "cursor-pointer" : "cursor-default"}`}
      >
        <Avatar src={picture} name={guest.guest_name || guest.guest_email} size="w-10 h-10" textClass="text-sm" />

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-foreground truncate">
            {guest.guest_name || "Unknown"}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {formatPhoneDisplay(guest.guest_phone) || guest.guest_email}
          </p>
          {guest.plus_one && (
            <span className="inline-flex items-center gap-1 text-[10px] text-accent mt-0.5">
              <UserPlus className="w-3 h-3" /> +1 {guest.plus_one_name || ""}
            </span>
          )}
        </div>
      </button>

      {/* Status + Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <StatusBadge status={guest.status} />
        {showActions && onToggleChat && chatEligible && (
          <Button
            size="icon"
            variant="ghost"
            title={guest.can_chat ? "Revoke chat access" : "Allow chat access"}
            className={`h-11 w-11 ${guest.can_chat ? "text-accent hover:bg-accent/20" : "text-muted-foreground hover:bg-accent/10"}`}
            onClick={(e) => { e.stopPropagation(); onToggleChat(guest); }}
          >
            <MessageCircle className="w-5 h-5" />
          </Button>
        )}
        {showActions && (
          <div className="flex gap-1">
            {canApprove && (
              <Button
                size="icon"
                variant="ghost"
                className="h-11 w-11 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300"
                onClick={(e) => { e.stopPropagation(); onApprove?.(guest); }}
              >
                <Check className="w-5 h-5" />
              </Button>
            )}
            {canWaitlist && (
              <Button
                size="icon"
                variant="ghost"
                className="h-11 w-11 text-purple-400 hover:bg-purple-500/20 hover:text-purple-300"
                onClick={(e) => { e.stopPropagation(); onWaitlist?.(guest); }}
              >
                <Clock className="w-5 h-5" />
              </Button>
            )}
            {canDeny && (
              <Button
                size="icon"
                variant="ghost"
                className="h-11 w-11 text-red-400 hover:bg-red-500/20 hover:text-red-300"
                onClick={(e) => { e.stopPropagation(); onDeny?.(guest); }}
              >
                <X className="w-5 h-5" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}