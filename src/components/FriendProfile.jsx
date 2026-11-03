import { useState, useEffect } from "react";
import { api } from "@/api/data";
import { X } from "lucide-react";
import LoadingSpinner from "./LoadingSpinner";
import UserAvatar from "./UserAvatar";
import ProfileBadge from "./ProfileBadge";
import ProfilePanel from "./profile/ProfilePanel";
import SocialLinks from "./profile/SocialLinks";
import EventsInCommon from "./profile/EventsInCommon";

export default function FriendProfile({ friend, myEmail, myFriends, onClose }) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({ hosted: 0, attended: 0 });
  const [sharedEvents, setSharedEvents] = useState([]);
  const [mutualFriends, setMutualFriends] = useState([]);

  useEffect(() => {
    load();
  }, [friend.email]);

  async function load() {
    setLoading(true);

    // Seed identity from the passed-in friend data; instagram is backfilled from
    // the person's profile row below (profiles is readable by any signed-in user).
    const profileData = { email: friend.email, full_name: friend.name, profile_picture: friend.picture, instagram: friend.instagram, snapchat: friend.snapchat };
    setProfile(profileData);

    try {
      // Load friend's guestlist entries & hosted events, my own entries, and the
      // friend's public profile (for their instagram handle) in parallel.
      const [friendEntries, friendHostedEvents, myEntries, friendProfile] = await Promise.all([
        api.entities.GuestlistEntry.filter({ guest_email: friend.email }),
        api.entities.Event.filter({ host_email: friend.email }),
        api.entities.GuestlistEntry.filter({ guest_email: myEmail }),
        api.auth.getProfile(friend.email),
      ]);

      if (friendProfile?.instagram || friendProfile?.snapchat || friendProfile?.location) {
        setProfile((p) => ({
          ...p,
          instagram: friendProfile.instagram ?? p.instagram,
          snapchat: friendProfile.snapchat ?? p.snapchat,
          location: friendProfile.location ?? p.location,
        }));
      }

      setStats({
        hosted: friendHostedEvents.length,
        attended: friendEntries.filter((e) => e.checked_in_at || ["checked_in", "checked_out"].includes(e.status)).length,
      });

      // Shared events: events where both attended (approved/checked_in/invited)
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
            api.entities.Event.filter({ id: eid }).then((res) => res[0]).catch(() => null)
          )
        );
        setSharedEvents(eventsData.filter(Boolean));
      }

      // Mutual friends
      if (myFriends && myFriends.length > 0) {
        // Get friend's friend list
        const [theirSent, theirReceived] = await Promise.all([
          api.entities.FriendRequest.filter({ sender_email: friend.email }),
          api.entities.FriendRequest.filter({ receiver_email: friend.email }),
        ]);

        const theirFriendEmails = new Set([
          ...theirSent.filter((r) => r.status === "accepted").map((r) => r.receiver_email),
          ...theirReceived.filter((r) => r.status === "accepted").map((r) => r.sender_email),
        ]);

        const mutuals = myFriends.filter((f) => theirFriendEmails.has(f.email));
        setMutualFriends(mutuals);
      }
    } catch {
      // Render whatever loaded; never leave the modal stuck on the spinner.
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center px-4 py-4">
      <ProfilePanel className="w-full max-w-lg" fireConfetti={!loading}>
        {/* Header */}
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
                <UserAvatar email={friend.email} fallbackSrc={profile?.profile_picture || friend.picture} name={profile?.full_name || friend.name} size="w-20 h-20" rounded="rounded-2xl" textClass="text-3xl" enlargeable />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-heading font-bold text-xl leading-tight">{profile?.full_name || friend.name}</h3>
                <SocialLinks instagram={profile?.instagram} snapchat={profile?.snapchat} location={profile?.location} className="mt-2.5" />
              </div>
            </div>

            {/* Stats */}
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mb-2">Stats</p>
              <div className="grid grid-cols-2 gap-2">
                <ProfileBadge variant="hosted" value={stats.hosted} label="Parties Hosted" />
                <ProfileBadge variant="attended" value={stats.attended} label="Parties Attended" />
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
                      <UserAvatar email={mf.email} fallbackSrc={mf.picture} name={mf.name} size="w-5 h-5" textClass="text-[9px]" />
                      <span className="text-xs font-medium">{mf.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Events in Common — only when there are any */}
            <EventsInCommon events={sharedEvents} onClose={onClose} />
          </div>
        )}
      </ProfilePanel>
    </div>
  );
}
