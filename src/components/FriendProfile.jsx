import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { X, Instagram, Users, Calendar, Clock, PartyPopper } from "lucide-react";
import { Link } from "react-router-dom";
import LoadingSpinner from "./LoadingSpinner";
import UserAvatar from "./UserAvatar";
import moment from "moment";

export default function FriendProfile({ friend, myEmail, myFriends, onClose }) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({ hosted: 0, attended: 0, hoursPartied: 0, guestsEntertained: 0 });
  const [sharedEvents, setSharedEvents] = useState([]);
  const [mutualFriends, setMutualFriends] = useState([]);

  useEffect(() => {
    load();
  }, [friend.email]);

  async function load() {
    setLoading(true);

    // User entity is admin-only; use the friend data passed in (name/email/picture).
    const profileData = { email: friend.email, full_name: friend.name, profile_picture: friend.picture, instagram: friend.instagram };
    setProfile(profileData);

    // Load friend's guestlist entries & hosted events in parallel with my own
    const [friendEntries, friendHostedEvents, friendHostedCheckins, myEntries] = await Promise.all([
      base44.entities.GuestlistEntry.filter({ guest_email: friend.email }),
      base44.entities.Event.filter({ host_email: friend.email }),
      base44.entities.GuestlistEntry.filter({ checked_in_by: friend.email }),
      base44.entities.GuestlistEntry.filter({ guest_email: myEmail }),
    ]);

    // Stats
    let hoursPartied = 0;
    friendEntries.forEach((e) => {
      if (e.checked_in_at && e.checked_out_at) {
        hoursPartied += (new Date(e.checked_out_at) - new Date(e.checked_in_at)) / 3600000;
      }
    });

    const hostedEventIds = new Set(friendHostedEvents.map((ev) => ev.id));
    const guestsEntertained = new Set(
      friendHostedCheckins.filter((e) => hostedEventIds.has(e.event_id)).map((e) => e.guest_email)
    ).size;

    setStats({
      hosted: friendHostedEvents.length,
      attended: friendEntries.filter((e) => e.checked_in_at || ["checked_in", "checked_out"].includes(e.status)).length,
      hoursPartied: Math.round(hoursPartied * 10) / 10,
      guestsEntertained,
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
          base44.entities.Event.filter({ id: eid }).then((res) => res[0]).catch(() => null)
        )
      );
      setSharedEvents(eventsData.filter(Boolean));
    }

    // Mutual friends
    if (myFriends && myFriends.length > 0) {
      const friendEmailSet = new Set(myFriends.map((f) => f.email));

      // Get friend's friend list
      const [theirSent, theirReceived] = await Promise.all([
        base44.entities.FriendRequest.filter({ sender_email: friend.email }),
        base44.entities.FriendRequest.filter({ receiver_email: friend.email }),
      ]);

      const theirFriendEmails = new Set([
        ...theirSent.filter((r) => r.status === "accepted").map((r) => r.receiver_email),
        ...theirReceived.filter((r) => r.status === "accepted").map((r) => r.sender_email),
      ]);

      const mutuals = myFriends.filter((f) => theirFriendEmails.has(f.email));
      setMutualFriends(mutuals);
    }

    setLoading(false);
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end justify-center px-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}>
      <div className="bg-card rounded-3xl border border-border w-full max-w-lg max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-card/95 backdrop-blur-sm rounded-t-3xl px-5 pt-5 pb-3 flex items-center justify-between border-b border-border/50 z-10">
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
              <UserAvatar email={friend.email} fallbackSrc={profile?.profile_picture || friend.picture} name={profile?.full_name || friend.name} size="w-20 h-20" rounded="rounded-2xl" textClass="text-3xl" className="flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <h3 className="font-heading font-bold text-xl leading-tight">{profile?.full_name || friend.name}</h3>
                {profile?.instagram && (
                  <a
                    href={`https://instagram.com/${profile.instagram}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 mt-1 text-sm text-pink-400 hover:text-pink-300 transition-colors"
                  >
                    <Instagram className="w-3.5 h-3.5" />
                    @{profile.instagram}
                  </a>
                )}
              </div>
            </div>

            {/* Stats */}
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mb-2">Stats</p>
              <div className="grid grid-cols-2 gap-2">
                <StatCard label="Events Hosted" value={stats.hosted} color="text-primary" />
                <StatCard label="Events Attended" value={stats.attended} color="text-accent" />
                <StatCard label="Hours Partied" value={`${stats.hoursPartied}h`} color="text-emerald-400" />
                {stats.guestsEntertained > 0 && (
                  <StatCard label="Guests Entertained" value={stats.guestsEntertained} color="text-pink-400" />
                )}
              </div>
            </div>

            {/* Mutual Friends */}
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mb-2">
                Mutual Friends ({mutualFriends.length})
              </p>
              {mutualFriends.length === 0 ? (
                <p className="text-sm text-muted-foreground">No mutual friends</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {mutualFriends.map((mf) => (
                    <div key={mf.email} className="flex items-center gap-2 bg-secondary/50 rounded-full px-3 py-1.5 border border-border/50">
                      <UserAvatar email={mf.email} fallbackSrc={mf.picture} name={mf.name} size="w-5 h-5" textClass="text-[9px]" />
                      <span className="text-xs font-medium">{mf.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Shared Events */}
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mb-2">
                Events in Common ({sharedEvents.length})
              </p>
              {sharedEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No shared events yet</p>
              ) : (
                <div className="space-y-2">
                  {sharedEvents.map((evt) => (
                    <Link
                      key={evt.id}
                      to={`/event/${evt.id}`}
                      onClick={onClose}
                      className="flex items-center gap-3 bg-secondary/40 rounded-xl px-3 py-2.5 border border-border/50 hover:border-primary/30 transition-colors"
                    >
                      <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                        <PartyPopper className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{evt.title}</p>
                        <p className="text-[11px] text-muted-foreground">{moment(evt.date).format("MMM D, YYYY")}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className="bg-secondary/50 rounded-xl p-3 text-center border border-border/50">
      <p className={`text-xl font-bold font-heading ${color}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
    </div>
  );
}