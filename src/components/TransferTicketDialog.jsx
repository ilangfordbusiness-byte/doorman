import { useState, useEffect } from "react";
import { api } from "@/api/data";
import { X, Search, Send, ArrowLeft, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import LoadingSpinner from "./LoadingSpinner";
import Avatar from "./Avatar";

// Modal for a guest to send a ticket (GuestlistEntry) to a friend.
// The recipient is chosen from the sender's accepted-friends list. The transfer
// is sent as a pending request — ownership only moves when the recipient
// accepts (handled by the acceptTicketTransfer backend function).
export default function TransferTicketDialog({ entry, event, user, onClose, onTransferred }) {
  const { toast } = useToast();
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [stage, setStage] = useState("select"); // select | confirm
  const [sending, setSending] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => { loadFriends(); }, []);

  async function loadFriends() {
    try {
      const [sent, received] = await Promise.all([
        api.entities.FriendRequest.filter({ sender_email: user.email, status: "accepted" }),
        api.entities.FriendRequest.filter({ receiver_email: user.email, status: "accepted" }),
      ]);
      const fromSent = sent.map((r) => ({ email: r.receiver_email, name: r.receiver_name || r.receiver_email, picture: r.receiver_picture }));
      const fromReceived = received.map((r) => ({ email: r.sender_email, name: r.sender_name || r.sender_email, picture: r.sender_picture }));
      const seen = new Set();
      const all = [...fromSent, ...fromReceived].filter((f) => {
        if (!f.email || f.email === user.email) return false;
        if (seen.has(f.email)) return false;
        seen.add(f.email);
        return true;
      });
      setFriends(all);
    } catch {}
    setLoading(false);
  }

  const q = query.trim().toLowerCase();
  const filtered = q
    ? friends.filter((f) => String(f.name).toLowerCase().includes(q) || f.email.toLowerCase().includes(q))
    : friends;

  async function confirmTransfer() {
    setSending(true);
    try {
      const res = await api.functions.invoke("initiateTicketTransfer", {
        guestlist_entry_id: entry.id,
        recipient_email: selected.email,
        recipient_name: selected.name,
      });
      if (res.data?.error) throw new Error(res.data.error);
      toast({ title: "Transfer sent!", description: `${selected.name} will get an email to accept it.` });
      onTransferred?.();
      onClose();
    } catch (e) {
      toast({ title: "Couldn't send transfer", description: e.message, variant: "destructive" });
    }
    setSending(false);
  }

  const ticketLabel = entry.notes || entry.guest_name || "Ticket";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md bg-card border border-border rounded-t-3xl sm:rounded-3xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            {stage === "confirm" && (
              <button onClick={() => setStage("select")} className="text-muted-foreground hover:text-foreground"><ArrowLeft className="w-5 h-5" /></button>
            )}
            <h2 className="font-heading font-bold text-base">Transfer Ticket</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-4 py-3 bg-secondary/40 border-b border-border">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Sending</p>
          <p className="text-sm font-semibold">{event?.title}</p>
          <p className="text-xs text-muted-foreground">{ticketLabel}</p>
        </div>

        {stage === "select" && (
          <div className="flex-1 overflow-y-auto p-4">
            <p className="text-xs text-muted-foreground mb-3">Choose a friend to send this ticket to. They'll need to accept it before it leaves your account.</p>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search friends..." className="w-full h-10 pl-10 pr-3 text-sm bg-secondary/50 border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            {loading ? <LoadingSpinner /> : filtered.length === 0 ? (
              <div className="py-10 text-center"><p className="text-sm text-muted-foreground">{friends.length === 0 ? "You don't have any friends yet." : "No friends match your search."}</p></div>
            ) : (
              <div className="space-y-2">
                {filtered.map((f) => (
                  <button key={f.email} onClick={() => { setSelected(f); setStage("confirm"); }} className="w-full flex items-center gap-3 bg-secondary/40 rounded-xl px-3 py-2.5 border border-border/50 hover:border-primary/40 transition-colors text-left">
                    <Avatar src={f.picture} name={f.name || f.email} size="w-9 h-9" textClass="text-sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{f.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{f.email}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {stage === "confirm" && selected && (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 mb-4">
              <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-200/90">Are you sure you want to transfer this ticket to <strong>{selected.name}</strong>? You will no longer have access to it once they accept.</p>
            </div>
            <div className="bg-secondary/40 rounded-xl p-3 border border-border/50 text-sm space-y-2 mb-4">
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Event</span><span className="font-medium text-right">{event?.title}</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Ticket</span><span className="font-medium text-right">{ticketLabel}</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">To</span><span className="font-medium text-right">{selected.name}</span></div>
            </div>
            <p className="text-[11px] text-muted-foreground mb-4">The transfer is sent as a request — your ticket stays yours until they accept. Your QR remains valid for entry in the meantime.</p>
            <Button className="w-full h-12 rounded-xl gap-2" disabled={sending} onClick={confirmTransfer}>
              {sending ? "Sending..." : <><Send className="w-4 h-4" /> Confirm Transfer</>}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}