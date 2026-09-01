import { useState, useEffect } from "react";
import { api } from "@/api/data";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Users, Lock, ChevronRight } from "lucide-react";
import Avatar from "./Avatar";
import SuggestionProfile from "./SuggestionProfile";

// The attendee list is served by the get_event_attendees RPC (client RLS only
// exposes your own entry), which honours the event's visibility and returns
// each attendee's profile fields so a row can open their full profile.
export default function WhoIsGoing({ eventId, myEmail, visibility = "show_names", unlocked = false }) {
  const { data: me } = useCurrentUser();
  const [attendees, setAttendees] = useState([]);
  const [goingCount, setGoingCount] = useState(0);
  const [friends, setFriends] = useState([]);
  const [sentSet, setSentSet] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [res, sent, received] = await Promise.all([
          api.functions.invoke("getEventAttendees", { event_id: eventId }),
          api.entities.FriendRequest.filter({ sender_email: myEmail }),
          api.entities.FriendRequest.filter({ receiver_email: myEmail, status: "accepted" }),
        ]);
        const d = res.data || {};
        setAttendees(d.attendees || []);
        setGoingCount(Number(d.going_count || 0));
        setFriends([
          ...sent.filter((r) => r.status === "accepted").map((r) => ({ email: r.receiver_email, name: r.receiver_name, picture: r.receiver_picture })),
          ...received.map((r) => ({ email: r.sender_email, name: r.sender_name, picture: r.sender_picture })),
        ]);
        setSentSet(new Set(sent.filter((r) => r.status === "pending").map((r) => r.receiver_email)));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [eventId, myEmail]);

  async function sendRequest(target) {
    await api.entities.FriendRequest.create({
      sender_email: me.email,
      sender_name: me.full_name,
      sender_picture: me.profile_picture || "",
      receiver_email: target.email,
      receiver_name: target.full_name,
      receiver_picture: target.profile_picture || "",
      status: "pending",
    });
    setSentSet((s) => new Set(s).add(target.email));
  }

  if (loading || visibility === "none") return null;

  if (visibility === "count_only") {
    return (
      <div className="flex items-center gap-2 mb-3">
        <Users className="w-4 h-4 text-muted-foreground" />
        <h3 className="font-heading font-semibold text-sm">{goingCount} going</h3>
      </div>
    );
  }

  // show_names: the RPC returns names only to attendees/staff. If empty, the
  // viewer isn't entitled yet — keep the teaser.
  if (attendees.length === 0) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-heading font-semibold text-sm">Who's Going</h3>
        </div>
        <div className="bg-secondary/40 rounded-xl px-4 py-3 border border-border/50 flex items-center gap-2">
          <Lock className="w-3.5 h-3.5 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            {unlocked ? "No one else is going yet." : "Buy a ticket to see who's going."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Users className="w-4 h-4 text-muted-foreground" />
        <h3 className="font-heading font-semibold text-sm">Who's Going ({attendees.length})</h3>
      </div>
      <div className="space-y-2">
        {attendees.slice(0, 30).map((g) => (
          <button
            key={g.email}
            onClick={() => setViewing(g)}
            className="w-full flex items-center gap-3 bg-secondary/40 rounded-xl px-3 py-2.5 border border-border/50 hover:border-primary/30 transition-colors active:scale-[0.99] text-left"
          >
            <Avatar src={g.avatar_url} name={g.name || g.email} size="w-8 h-8" textClass="text-xs" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{g.name || g.email}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                {g.status === "checked_in" ? "Checked In" : "Going"}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </button>
        ))}
        {attendees.length > 30 && (
          <p className="text-xs text-muted-foreground text-center pt-1">+{attendees.length - 30} more going</p>
        )}
      </div>

      {viewing && (
        <SuggestionProfile
          user={{ email: viewing.email, full_name: viewing.name, profile_picture: viewing.avatar_url, instagram: viewing.instagram }}
          myEmail={myEmail}
          myFriends={friends}
          sent={sentSet.has(viewing.email) || friends.some((f) => f.email === viewing.email)}
          onSend={() => { sendRequest({ email: viewing.email, full_name: viewing.name, profile_picture: viewing.avatar_url }); setViewing(null); }}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}
