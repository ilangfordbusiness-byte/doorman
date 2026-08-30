import { useState, useEffect } from "react";
import { api } from "@/api/data";
import { X, UserPlus, Check, Instagram } from "lucide-react";
import { Button } from "@/components/ui/button";
import UserAvatar from "./UserAvatar";
import Avatar from "./Avatar";

// `isBusiness`: the event is hosted by a business account — show the business
// name + picture only, with no personal email / Instagram / add-friend.
export default function HostProfileModal({ host, me, onClose, isBusiness = false }) {
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [instagram, setInstagram] = useState(null);
  const isMe = me?.email === host.email;

  // Backfill the host's instagram handle from their public profile (personal
  // hosts only — a business isn't a person).
  useEffect(() => {
    if (isBusiness) return;
    let active = true;
    api.auth.getProfile(host.email)
      .then((p) => { if (active && p?.instagram) setInstagram(p.instagram); })
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
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center px-4" onClick={onClose}>
      <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-sm text-center relative" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
        {isBusiness ? (
          <Avatar src={host.picture} name={host.name} size="w-20 h-20" textClass="text-2xl" className="mx-auto mb-3" />
        ) : (
          <UserAvatar email={host.email} fallbackSrc={host.picture} name={host.name} size="w-20 h-20" textClass="text-2xl" className="mx-auto mb-3" />
        )}
        <h2 className="font-heading font-bold text-lg">{host.name || "Host"}</h2>
        {!isBusiness && <p className="text-sm text-muted-foreground mb-2 truncate">{host.email}</p>}
        {!isBusiness && instagram && (
          <a
            href={`https://instagram.com/${instagram}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 mb-2 text-sm text-pink-400 hover:text-pink-300 transition-colors"
          >
            <Instagram className="w-3.5 h-3.5" />@{instagram}
          </a>
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
      </div>
    </div>
  );
}