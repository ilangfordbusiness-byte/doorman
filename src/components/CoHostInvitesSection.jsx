import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import UserAvatar from "./UserAvatar";
import moment from "moment";

export default function CoHostInvitesSection({ invites }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(null);

  if (!invites || invites.length === 0) return null;

  async function respond(invite, action) {
    setBusy(invite.event_id);
    try {
      const res = await base44.functions.invoke("acceptCoHost", { event_id: invite.event_id, action });
      if (res.data?.error) throw new Error(res.data.error);
      toast({ title: action === "accept" ? "Co-host invite accepted!" : "Invite declined" });
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
        Co-Host Invites
      </h3>
      <div className="space-y-2">
        {invites.map((inv) => (
          <div key={inv.event_id} className="bg-secondary/40 rounded-xl p-3 border border-border/50">
            <div className="flex items-center gap-2.5 mb-2.5">
              <UserAvatar email={inv.host_email} fallbackSrc={inv.host_picture} name={inv.host_name} size="w-8 h-8" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{inv.title}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {moment(inv.date).format("ddd, MMM D")}{inv.start_time ? ` · ${inv.start_time}` : ""} · from {inv.host_name || "Host"}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="h-9 rounded-lg flex-1 gap-1.5" disabled={busy === inv.event_id} onClick={() => respond(inv, "accept")}>
                <Check className="w-4 h-4" /> Accept
              </Button>
              <Button size="sm" variant="outline" className="h-9 rounded-lg flex-1 gap-1.5" disabled={busy === inv.event_id} onClick={() => respond(inv, "decline")}>
                <X className="w-4 h-4" /> Decline
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}