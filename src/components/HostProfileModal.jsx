import { useState, useEffect } from "react";
import { api } from "@/api/data";
import { X, UserPlus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import UserAvatar from "./UserAvatar";
import Avatar from "./Avatar";
import SafetyActions from "./SafetyActions";
import ProfilePanel from "./profile/ProfilePanel";
import SocialLinks from "./profile/SocialLinks";

// `isBusiness`: the event is hosted by a business account — show the business
// name + picture only, with no personal email / Instagram / add-friend.
export default function HostProfileModal({ host, me, onClose, isBusiness = false }) {
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [instagram, setInstagram] = useState(null);
  const [snapchat, setSnapchat] = useState(null);
  const [location, setLocation] = useState(null);
  const isMe = me?.email === host.email;

  // Backfill the host's instagram / snapchat handles and location from their
  // public profile (personal hosts only — a business isn't a person).
  useEffect(() => {
    if (isBusiness) return;
    let active = true;
    api.auth.getProfile(host.email)
      .then((p) => {
        if (!active) return;
        if (p?.instagram) setInstagram(p.instagram);
        if (p?.snapchat) setSnapchat(p.snapchat);
        if (p?.location) setLocation(p.location);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [host.email, isBusiness]);

  async function addFriend() {
    setSending(true);
    try {
      await api.entities.FriendRequest.create({
        sender_email: me.email,
        sender_name: me.full_name,
        sender_picture: me.profile_picture || "",
        receiver_email: host.email,
        receiver_name: host.name || "",
        receiver_picture: host.picture || "",
        status: "pending",
      });
      setSent(true);
    } catch (e) {
      console.error(e);
    }
    setSending(false);
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center px-4 py-4" onClick={onClose}>
      <ProfilePanel
        className="w-full max-w-sm"
        innerClassName="p-6 text-center"
        fireConfetti
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground z-10">
          <X className="w-4 h-4" />
        </button>
        <div className="animate-float mx-auto mb-3 w-fit">
          {isBusiness ? (
            <Avatar src={host.picture} name={host.name} size="w-20 h-20" textClass="text-2xl" enlargeable />
          ) : (
            <UserAvatar email={host.email} fallbackSrc={host.picture} name={host.name} size="w-20 h-20" textClass="text-2xl" enlargeable />
          )}
        </div>
        <h2 className="font-heading font-bold text-lg">{host.name || "Host"}</h2>
        {!isBusiness && <p className="text-sm text-muted-foreground mb-2 truncate">{host.email}</p>}
        {!isBusiness && (
          <SocialLinks instagram={instagram} snapchat={snapchat} location={location} align="center" className="mt-1 mb-3" />
        )}
        <span className="block text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-semibold mb-4 mt-2 uppercase tracking-wider w-fit mx-auto">Event Host</span>
        {!isBusiness && !isMe && (
          sent ? (
            <div className="flex items-center justify-center gap-2 text-emerald-400 text-sm font-medium">
              <Check className="w-4 h-4" /> Friend request sent
            </div>
          ) : (
            <Button onClick={addFriend} disabled={sending} className="w-full rounded-xl gap-2">
              <UserPlus className="w-4 h-4" /> {sending ? "Sending..." : "Add as friend"}
            </Button>
          )
        )}
        {!isMe && host.id && (
          <SafetyActions
            target={{ type: "user", user_id: host.id }}
            userId={host.id}
            userName={host.name}
            onBlocked={onClose}
            compact
            className="mt-4"
          />
        )}
      </ProfilePanel>
    </div>
  );
}
