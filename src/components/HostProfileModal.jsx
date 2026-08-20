import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { X, UserPlus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import UserAvatar from "./UserAvatar";

export default function HostProfileModal({ host, me, onClose }) {
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const isMe = me?.email === host.email;

  async function addFriend() {
    setSending(true);
    try {
      await base44.entities.FriendRequest.create({
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
        <UserAvatar email={host.email} fallbackSrc={host.picture} name={host.name} size="w-20 h-20" textClass="text-2xl" className="mx-auto mb-3" />
        <h2 className="font-heading font-bold text-lg">{host.name || "Host"}</h2>
        <p className="text-sm text-muted-foreground mb-2 truncate">{host.email}</p>
        <span className="inline-block text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-semibold mb-4 uppercase tracking-wider">Event Host</span>
        {!isMe && (
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