import { useState, useEffect, useRef } from "react";
import { api } from "@/api/data";
import { X, Instagram, Ghost, MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import LoadingSpinner from "./LoadingSpinner";
import UserAvatar from "./UserAvatar";
import ProfileBadge from "./ProfileBadge";
import { COVERS } from "./CoverPicker";
import moment from "moment";

// Preset covers are stored as "__cover__<id>"; resolve to their gradient style
// (same mapping EventCard uses). Real uploads are plain image URLs.
function coverStyleFor(cover_image) {
  if (cover_image?.startsWith("__cover__")) {
    const id = cover_image.replace("__cover__", "");
    return COVERS.find((c) => c.id === id)?.style || null;
  }
  return null;
}

// One-shot confetti burst from the top of the card when a profile opens.
// Uses the Web Animations API directly so it leaves no React state behind.
const CONFETTI_COLORS = ["#f0abfc", "#67e8f9", "#fcd34d", "#fb7185", "#a5b4fc", "#86efac"];
function fireConfetti(container) {
  if (!container) return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const originX = container.clientWidth / 2;
  const originY = 72; // around the avatar / header area
  for (let i = 0; i < 26; i++) {
    const p = document.createElement("span");
    const c = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    p.style.cssText = `position:absolute;left:${originX}px;top:${originY}px;width:7px;height:7px;border-radius:2px;background:${c};will-change:transform,opacity;`;
    container.appendChild(p);
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.15;
    const dist = 55 + Math.random() * 120;
    const dx = Math.cos(ang) * dist;
    const dy = Math.sin(ang) * dist;
    const fall = 130 + Math.random() * 130;
    p.animate(
      [
        { transform: "translate(-50%,-50%) rotate(0deg)", opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) rotate(${Math.random() * 200}deg)`, opacity: 1, offset: 0.35 },
        { transform: `translate(${dx * 1.1}px, ${dy + fall}px) rotate(${Math.random() * 560}deg)`, opacity: 0 },
      ],
      { duration: 1100 + Math.random() * 500, easing: "cubic-bezier(.2,.7,.3,1)" }
    ).onfinish = () => p.remove();
  }
}

export default function FriendProfile({ friend, myEmail, myFriends, onClose }) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({ hosted: 0, attended: 0 });
  const [sharedEvents, setSharedEvents] = useState([]);
  const [mutualFriends, setMutualFriends] = useState([]);
  const confettiRef = useRef(null);
  const firedConfetti = useRef(false);

  useEffect(() => {
    load();
  }, [friend.email]);

  // Celebratory confetti the first time the profile finishes loading.
  useEffect(() => {
    if (loading || firedConfetti.current || !confettiRef.current) return;
    firedConfetti.current = true;
    fireConfetti(confettiRef.current);
  }, [loading]);

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
      <div
        className="relative rounded-3xl p-[3px] w-full max-w-lg max-h-[85vh] overflow-hidden"
        style={{ background: "hsl(270 18% 15%)", boxShadow: "0 24px 60px -24px rgba(0,0,0,0.85), 0 0 46px -26px hsl(270 90% 65% / 0.75)" }}
      >
        {/* animated border — a comet of light races around the edge */}
        <div
          className="absolute inset-[-55%] animate-spin [animation-duration:3s] pointer-events-none"
          style={{ background: "conic-gradient(from 0deg, transparent 0 78%, #22d3ee 88%, #f0abfc 93%, #ffffff 95%, transparent 99%)" }}
        />
        <div className="relative rounded-[21px] bg-card overflow-y-auto max-h-[calc(85vh-6px)]">
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
                {(profile?.instagram || profile?.snapchat || profile?.location) && (
                <div className="flex flex-wrap gap-2 mt-2.5">
                  {profile?.instagram && (
                    <a
                      href={`https://instagram.com/${profile.instagram}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-white rounded-full px-3.5 py-2 border-2 border-white/80 shadow-md shadow-black/30 bg-gradient-to-br from-violet-500 via-pink-500 to-amber-400 hover:brightness-110 transition"
                    >
                      <Instagram className="w-3.5 h-3.5" />
                      @{profile.instagram}
                    </a>
                  )}
                  {profile?.snapchat && (
                    <a
                      href={`https://www.snapchat.com/add/${profile.snapchat}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-950 rounded-full px-3.5 py-2 border-2 border-white bg-amber-400 shadow-md shadow-black/30 hover:brightness-105 transition"
                    >
                      <Ghost className="w-3.5 h-3.5" />
                      @{profile.snapchat}
                    </a>
                  )}
                  {profile?.location && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground rounded-full px-3.5 py-2 border border-border bg-secondary">
                      <MapPin className="w-3.5 h-3.5" />
                      {profile.location}
                    </span>
                  )}
                </div>
                )}
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
            {sharedEvents.length > 0 && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mb-2">
                  Events in Common ({sharedEvents.length})
                </p>
                <div className="space-y-2.5">
                  {sharedEvents.map((evt) => {
                    const coverStyle = coverStyleFor(evt.cover_image);
                    const coverImg = evt.cover_image && !evt.cover_image.startsWith("__cover__") ? evt.cover_image : null;
                    return (
                      <Link
                        key={evt.id}
                        to={`/event/${evt.id}`}
                        onClick={onClose}
                        className="flex items-center gap-3 bg-secondary/60 rounded-2xl p-2.5 border-2 border-border hover:border-primary/40 hover:-translate-y-0.5 transition-all"
                      >
                        <div className="w-14 h-14 rounded-xl overflow-hidden border-2 border-white/60 flex-shrink-0 relative" style={coverStyle || undefined}>
                          {coverImg ? (
                            <img src={coverImg} alt={evt.title} className="w-full h-full object-cover" />
                          ) : !coverStyle ? (
                            <div className="w-full h-full bg-gradient-to-br from-primary/40 via-card to-accent/20" />
                          ) : null}
                          <div className="absolute inset-0" style={{ background: "radial-gradient(60% 60% at 30% 25%, rgba(255,255,255,0.35), transparent 60%)" }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{evt.title}</p>
                          <p className="text-[11px] text-muted-foreground">{moment(evt.date).format("MMM D, YYYY")}</p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
        </div>
        <div ref={confettiRef} className="pointer-events-none absolute inset-0 z-20 overflow-hidden" />
      </div>
    </div>
  );
}
