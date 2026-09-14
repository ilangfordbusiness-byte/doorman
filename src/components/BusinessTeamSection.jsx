import { useEffect, useState } from "react";
import { api } from "@/api/data";
import { Plus, X, Users, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import UserAvatar from "./UserAvatar";
import { useToast } from "@/components/ui/use-toast";

// Manage who can co-run a business account. Any manager can invite an existing
// DoorMan user by email (they get FULL access, including payouts) and remove a
// member. Modeled on CoHostsSection.
export default function BusinessTeamSection({ businessId }) {
  const { toast } = useToast();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [adding, setAdding] = useState(false);

  async function load() {
    try {
      setMembers(await api.businesses.listMembers(businessId));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [businessId]);

  async function invite() {
    const em = email.trim().toLowerCase();
    if (!em) return;
    setAdding(true);
    try {
      await api.businesses.inviteMember(businessId, em);
      setEmail("");
      toast({ title: "Invite sent" });
      await load();
    } catch (e) {
      toast({ title: e?.message || "Couldn't invite", variant: "destructive" });
    } finally {
      setAdding(false);
    }
  }

  async function remove(m) {
    try {
      await api.businesses.removeMember(m.id);
      await load();
    } catch (e) {
      toast({ title: e?.message || "Couldn't remove", variant: "destructive" });
    }
  }

  return (
    <div>
      <h3 className="font-heading font-semibold text-sm mb-3 flex items-center gap-2">
        <Users className="w-4 h-4 text-primary" /> Team
      </h3>
      <p className="text-xs text-muted-foreground mb-3">
        Team members get full access to this business account — its page, events, and payouts. Invite an existing DoorMan user by email.
      </p>

      {loading ? (
        <div className="py-4 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
      ) : members.length > 0 ? (
        <div className="space-y-2 mb-3">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-2 bg-secondary/50 rounded-xl px-3 py-2 border border-border/50">
              <UserAvatar email={m.email} name={m.email} size="w-8 h-8" textClass="text-xs" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{m.email}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  {m.status === "pending" ? "Pending invite" : m.status === "declined" ? "Declined" : "Member"}
                </p>
              </div>
              <button onClick={() => remove(m)} className="text-muted-foreground hover:text-destructive transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex gap-2">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Invite a member by email..."
          className="flex-1 h-10 px-3 text-sm bg-secondary/50 border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          onKeyDown={(e) => e.key === "Enter" && invite()}
        />
        <Button size="sm" className="h-10 rounded-xl" onClick={invite} disabled={adding}>
          {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
}
