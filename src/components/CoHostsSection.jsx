import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, X, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import UserAvatar from "./UserAvatar";

export default function CoHostsSection({ event, onUpdated }) {
  const [email, setEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const coHosts = Array.isArray(event.co_hosts) ? event.co_hosts : [];

  async function invite() {
    const em = email.trim().toLowerCase();
    if (!em) return;
    setEmail("");
    if (em === event.host_email || coHosts.some((c) => c.email === em)) return;
    setAdding(true);
    const next = [...coHosts, { email: em, name: "", picture: "", status: "pending" }];
    try {
      await base44.entities.Event.update(event.id, { co_hosts: next });
      onUpdated();
    } catch (e) {
      console.error(e);
    }
    setAdding(false);
  }

  async function remove(em) {
    const next = coHosts.filter((c) => c.email !== em);
    const emails = Array.isArray(event.co_host_emails) ? event.co_host_emails.filter((e) => e !== em) : [];
    try {
      await base44.entities.Event.update(event.id, { co_hosts: next, co_host_emails: emails });
      onUpdated();
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div>
      <h3 className="font-heading font-semibold text-sm mb-3 flex items-center gap-2">
        <Crown className="w-4 h-4 text-amber-400" /> Co-Hosts
      </h3>
      <p className="text-xs text-muted-foreground mb-3">Co-hosts can edit this event and manage guests.</p>
      {coHosts.length > 0 && (
        <div className="space-y-2 mb-3">
          {coHosts.map((c) => (
            <div key={c.email} className="flex items-center gap-2 bg-secondary/50 rounded-xl px-3 py-2 border border-border/50">
              <UserAvatar email={c.email} fallbackSrc={c.picture} name={c.name || c.email} size="w-8 h-8" textClass="text-xs" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{c.name || c.email}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{c.status === "pending" ? "Pending invite" : "Co-host"}</p>
              </div>
              <button onClick={() => remove(c.email)} className="text-muted-foreground hover:text-destructive transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Invite co-host by email..."
          className="flex-1 h-10 px-3 text-sm bg-secondary/50 border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          onKeyDown={(e) => e.key === "Enter" && invite()}
        />
        <Button size="sm" className="h-10 rounded-xl" onClick={invite} disabled={adding}>
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}