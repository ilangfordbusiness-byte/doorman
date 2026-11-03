import { useState, useEffect } from "react";
import { api } from "@/api/data";
import { X, UserPlus } from "lucide-react";
import LoadingSpinner from "./LoadingSpinner";
import Avatar from "./Avatar";
import { Button } from "@/components/ui/button";
import ProfilePanel from "./profile/ProfilePanel";
import SocialLinks from "./profile/SocialLinks";
import EventsInCommon from "./profile/EventsInCommon";

// Pre-friend preview of a suggested user (or an incoming request): name,
// picture, instagram, events in common and mutual friends (each only when any
// exist). `footer` overrides the default Add-Friend button (e.g. Accept/Decline
// for a request); otherwise onSend/sent render the Add-Friend action.
export default function SuggestionProfile({ user, myEmail, myFriends, sent, onSend, onClose, footer }) {
  const [loading, setLoading] = useState(true);
  const [sharedEvents, setSharedEvents] = useState([]);
  const [mutualFriends, setMutualFriends] = useState([]);
  const [instagram, setInstagram] = useState(user.instagram || null);
  const [snapchat, setSnapchat] = useState(user.snapchat || null);
  const [location, setLocation] = useState(user.location || null);

  useEffect(() => { load(); }, [user.email]);

  async function load() {
    setLoading(true);
    try {
      // Backfill instagram / snapchat / location when the caller didn't supply
      // them (a friend request row has no socials, unlike a suggestion).
      if (!user.instagram || !user.snapchat || !user.location) {
        api.auth.getProfile(user.email)
          .then((p) => {
            if (p?.instagram) setInstagram((v) => v || p.instagram);
            if (p?.snapchat) setSnapchat((v) => v || p.snapchat);
            if (p?.location) setLocation((v) => v || p.location);
          })
          .catch(() => {});
      }
      const [friendEntries, myEntries] = await Promise.all([
        api.entities.GuestlistEntry.filter({ guest_email: user.email }),
        api.entities.GuestlistEntry.filter({ guest_email: myEmail }),
      ]);

      const myEventIds = new Set(
        myEntries
          .filter((e) => ["approved", "invited", "checked_in"].includes(e.status) || e.checked_in_at)
          .map((e) => e.event_id)
      );
      const friendEventIds = friendEntries
        .filter((e) => ["approved", "invited", "checked_in"].includes(e.status) || e.checked_in_at)
        .map((e) => e.event_id);
      const commonEventIds = [...new Set(friendEventIds.filter((eid) => myEventIds.has(eid)))];

      if (commonEventIds.length > 0) {
        const eventsData = await Promise.all(
          commonEventIds.slice(0, 10).map((eid) =>
            api.entities.Event.filter({ id: eid }).then((r) => r[0]).catch(() => null)
          )
        );
        setSharedEvents(eventsData.filter(Boolean));
      }

      if (myFriends && myFriends.length > 0) {
        const [theirSent, theirReceived] = await Promise.all([
          api.entities.FriendRequest.filter({ sender_email: user.email }),
          api.entities.FriendRequest.filter({ receiver_email: user.email }),
        ]);
        const theirFriendEmails = new Set([
          ...theirSent.filter((r) => r.status === "accepted").map((r) => r.receiver_email),
          ...theirReceived.filter((r) => r.status === "accepted").map((r) => r.sender_email),
        ]);
        setMutualFriends(myFriends.filter((f) => theirFriendEmails.has(f.email)));
      }
    } catch {}
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-end md:items-center justify-center px-4 pb-4 md:pb-0">
      <ProfilePanel
        className="w-full max-w-lg"
        fireConfetti={!loading}
        maxHeightClass="max-h-[85vh] md:max-h-[90vh]"
        innerMaxHeightClass="max-h-[calc(85vh-6px)] md:max-h-[calc(90vh-6px)]"
      >
        <div className="sticky top-0 bg-card/95 backdrop-blur-sm rounded-t-[21px] px-5 pt-5 pb-3 flex items-center justify-between border-b border-border/50 z-10">
          <h2 className="font-heading font-bold text-lg">Profile</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="py-16"><LoadingSpinner /></div>
        ) : (
          <div className="px-5 py-5 space-y-5">
            {/* Identity */}
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 animate-float">
                <Avatar src={user.profile_picture} name={user.full_name} size="w-20 h-20" rounded="rounded-2xl" textClass="text-3xl" enlargeable />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-heading font-bold text-xl leading-tight">{user.full_name}</h3>
                <SocialLinks instagram={instagram} snapchat={snapchat} location={location} className="mt-2.5" />
              </div>
            </div>

            {/* Mutual Friends — only when there are any */}
            {mutualFriends.length > 0 && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mb-2">
                  Mutual Friends ({mutualFriends.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {mutualFriends.map((mf) => (
                    <div key={mf.email} className="flex items-center gap-2 bg-secondary/50 rounded-full px-3 py-1.5 border border-border/50">
                      <Avatar src={mf.picture} name={mf.name} size="w-5 h-5" textClass="text-[9px]" />
                      <span className="text-xs font-medium">{mf.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Events in Common — only when there are any */}
            <EventsInCommon events={sharedEvents} onClose={onClose} />

            {/* Footer action: custom (e.g. Accept/Decline) or the default Add Friend */}
            <div className="pt-2">
              {footer ? footer : sent ? (
                <Button disabled className="w-full rounded-xl">
                  <UserPlus className="w-4 h-4" /> Request Sent
                </Button>
              ) : (
                <Button className="w-full rounded-xl" onClick={onSend}>
                  <UserPlus className="w-4 h-4" /> Add Friend
                </Button>
              )}
            </div>
          </div>
        )}
      </ProfilePanel>
    </div>
  );
}
