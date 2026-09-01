import { useState, useEffect } from "react";
import { api } from "@/api/data";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Users, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import AttendeeList from "./AttendeeList";
import AttendeesModal from "./AttendeesModal";

const PREVIEW = 10;

// Served by the get_event_attendees RPC (client RLS only exposes your own
// entry). Shows a 10-person preview; "View all" opens the full list paged by 50.
export default function WhoIsGoing({ eventId, myEmail, visibility = "show_names", unlocked = false }) {
  const { data: me } = useCurrentUser();
  const [preview, setPreview] = useState([]);
  const [goingCount, setGoingCount] = useState(0);
  const [friends, setFriends] = useState([]);
  const [sentSet, setSentSet] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [res, sent, received] = await Promise.all([
          api.functions.invoke("getEventAttendees", { event_id: eventId, offset: 0, limit: PREVIEW }),
          api.entities.FriendRequest.filter({ sender_email: myEmail }),
          api.entities.FriendRequest.filter({ receiver_email: myEmail, status: "accepted" }),
        ]);
        const d = res.data || {};
        setPreview(d.attendees || []);
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

  // show_names: the RPC returns names only to attendees/staff. Empty → teaser.
  if (preview.length === 0) {
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
        <h3 className="font-heading font-semibold text-sm">Who's Going ({goingCount})</h3>
      </div>

      <AttendeeList attendees={preview} myEmail={myEmail} friends={friends} sentSet={sentSet} onSend={sendRequest} />

      {goingCount > preview.length && (
        <Button variant="outline" className="w-full rounded-xl mt-3 text-sm" onClick={() => setShowAll(true)}>
          View all {goingCount} going
        </Button>
      )}

      {showAll && (
        <AttendeesModal
          eventId={eventId}
          myEmail={myEmail}
          friends={friends}
          sentSet={sentSet}
          onSend={sendRequest}
          goingCount={goingCount}
          onClose={() => setShowAll(false)}
        />
      )}
    </div>
  );
}
