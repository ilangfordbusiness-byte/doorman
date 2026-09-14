import { useState } from "react";
import { api } from "@/api/data";
import { useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import Avatar from "./Avatar";

// Pending invites to co-manage a business account, shown on the Profile.
// Accepting grants full access (page, events, payouts). Modeled on
// CoHostInvitesSection.
export default function BusinessMemberInvitesSection({ invites }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(null);

  if (!invites || invites.length === 0) return null;

  async function respond(inv, action) {
    setBusy(inv.business_id);
    try {
      const res = await api.businesses.acceptInvite(inv.business_id, action);
      if (res.data?.error) throw new Error(res.data.error);
      toast({ title: action === "accept" ? "You joined the business account!" : "Invite declined" });
      queryClient.invalidateQueries(["notifications"]);
    } catch (e) {
      toast({ title: e?.message || "Something went wrong", variant: "destructive" });
    }
    setBusy(null);
  }

  return (
    <div className="bg-card rounded-2xl border border-border p-4 mb-4">
      <h3 className="font-heading font-semibold text-sm flex items-center gap-2 mb-3">
        <span className="w-2 h-2 rounded-full bg-red-500" style={{ boxShadow: "0 0 6px hsl(0 85% 60% / 0.8)" }} />
        Business Invites
      </h3>
      <div className="space-y-2">
        {invites.map((inv) => (
          <div key={inv.business_id} className="bg-secondary/40 rounded-xl p-3 border border-border/50">
            <div className="flex items-center gap-2.5 mb-2.5">
              <Avatar src={inv.business_picture} name={inv.business_name} size="w-8 h-8" textClass="text-xs" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{inv.business_name}</p>
                <p className="text-[11px] text-muted-foreground truncate">Invited to help manage this business</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="h-9 rounded-lg flex-1 gap-1.5" disabled={busy === inv.business_id} onClick={() => respond(inv, "accept")}>
                <Check className="w-4 h-4" /> Accept
              </Button>
              <Button size="sm" variant="outline" className="h-9 rounded-lg flex-1 gap-1.5" disabled={busy === inv.business_id} onClick={() => respond(inv, "decline")}>
                <X className="w-4 h-4" /> Decline
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
