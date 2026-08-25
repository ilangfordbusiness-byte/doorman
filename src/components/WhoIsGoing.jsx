import { useState, useEffect } from "react";
import { api } from "@/api/data";
import { Users, Lock } from "lucide-react";
import Avatar from "./Avatar";
import { useProfiles } from "@/hooks/useProfiles";

export default function WhoIsGoing({ eventId, myEmail, visibility = "show_names", unlocked = false }) {
  const [guests, setGuests] = useState([]);
  const [friends, setFriends] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const { data: profiles } = useProfiles(guests.map((g) => g.guest_email).filter(Boolean));

  useEffect(() => {
    (async () => {
      const [entries, sent, received] = await Promise.all([
        api.entities.GuestlistEntry.filter({ event_id: eventId }),
        api.entities.FriendRequest.filter({ sender_email: myEmail, status: "accepted" }),
        api.entities.FriendRequest.filter({ receiver_email: myEmail, status: "accepted" }),
      ]);
      const friendEmails = new Set([
        ...sent.map((r) => r.receiver_email),
        ...received.map((r) => r.sender_email),
      ]);
      setFriends(friendEmails);
      const visible = entries.filter(
        (e) => e.guest_email !== myEmail && ["approved", "checked_in", "invited"].includes(e.status)
      );
      setGuests(visible);
      setLoading(false);
    })();
  }, [eventId, myEmail]);

  if (loading) return null;
  if (visibility === "none") return null;

  if (visibility === "count_only") {
    return (
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-heading font-semibold text-sm">{guests.length} going</h3>
        </div>
      </div>
    );
  }

  // show_names
  let shown = guests;
  let label = `Who's Going (${guests.length})`;
  if (!unlocked) {
    shown = guests.filter((g) => friends.has(g.guest_email));
    label = shown.length > 0 ? `Friends going (${shown.length})` : "Who's Going";
  }

  if (shown.length === 0 && !unlocked) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-heading font-semibold text-sm">Who's Going</h3>
        </div>
        <div className="bg-secondary/40 rounded-xl px-4 py-3 border border-border/50 flex items-center gap-2">
          <Lock className="w-3.5 h-3.5 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Buy a ticket to see who's going.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Users className="w-4 h-4 text-muted-foreground" />
        <h3 className="font-heading font-semibold text-sm">{label}</h3>
      </div>
      <div className="space-y-2">
        {shown.slice(0, 10).map((g) => (
          <div key={g.id} className="flex items-center gap-3 bg-secondary/40 rounded-xl px-3 py-2.5 border border-border/50">
            <Avatar src={profiles?.[g.guest_email?.toLowerCase()]?.picture} name={g.guest_name || g.guest_email} size="w-8 h-8" textClass="text-xs" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{g.guest_name || g.guest_email}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                {g.status === "checked_in" ? "Checked In" : "Going"}
              </p>
            </div>
          </div>
        ))}
        {shown.length > 10 && (
          <p className="text-xs text-muted-foreground text-center pt-1">+{shown.length - 10} more going</p>
        )}
      </div>
    </div>
  );
}