import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/data";
import { useSwitchAccount } from "@/hooks/useActiveAccount";
import { buttonVariants } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import LoadingSpinner from "@/components/LoadingSpinner";
import Avatar from "@/components/Avatar";
import { Building2, Check, X, Loader2 } from "lucide-react";

// Landing page for the invite email (/business/:id/invite). Shows the
// business and lets the invitee accept or decline. The invite row is looked
// up by the signed-in user's id or email, so this works whether they had an
// account when invited or signed up afterwards.
export default function BusinessInvite() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { switchToBusiness } = useSwitchAccount();
  const [business, setBusiness] = useState(null);
  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [b, inv] = await Promise.all([
          api.businesses.getPublic(id),
          api.businesses.myInvite(id),
        ]);
        if (cancelled) return;
        setBusiness(b);
        setInvite(inv);
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  async function respond(action) {
    setBusy(action);
    try {
      const res = await api.businesses.acceptInvite(id, action);
      if (res.data?.error) throw new Error(res.data.error);
      qc.invalidateQueries({ queryKey: ["notifications"] });
      if (action === "accept") {
        toast({ title: `You joined ${business?.business_name || "the business"}!` });
        await switchToBusiness(id);
        navigate("/business/create-event", { replace: true });
      } else {
        toast({ title: "Invite declined" });
        navigate("/profile", { replace: true });
      }
    } catch (e) {
      toast({ title: e?.message || "Something went wrong", variant: "destructive" });
      setBusy(null);
    }
  }

  async function switchNow() {
    await switchToBusiness(id);
    navigate("/business/create-event");
  }

  if (loading) return <LoadingSpinner fullScreen />;

  if (!business || !invite) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center">
        <Building2 className="w-12 h-12 text-muted-foreground mb-4" />
        <h1 className="font-heading font-bold text-xl text-foreground">Invite Not Found</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-sm">
          {business
            ? "This invite isn't for the account you're signed in with. Sign in with the email address the invite was sent to."
            : "This invite link may have expired or is invalid."}
        </p>
        <button type="button" className={cn(buttonVariants({ variant: "outline" }), "mt-6 rounded-full")} onClick={() => navigate("/profile")}>
          Go to Profile
        </button>
      </div>
    );
  }

  const accepted = invite.status === "accepted";
  const declined = invite.status === "declined";

  return (
    <div className="max-w-lg mx-auto px-4 pt-8 pb-8">
      <div className="bg-card rounded-2xl border border-border p-6 text-center">
        <p className="text-[11px] tracking-[0.2em] uppercase text-muted-foreground mb-4">Team Invite</p>
        <div className="flex justify-center mb-3">
          <Avatar src={business.business_picture} name={business.business_name} size="w-20 h-20" textClass="text-2xl" />
        </div>
        <h1 className="font-heading font-bold text-xl">{business.business_name}</h1>
        {business.description ? (
          <p className="text-sm text-muted-foreground mt-2 whitespace-pre-line">{business.description}</p>
        ) : null}

        <div className="bg-secondary/40 rounded-xl p-4 border border-border/50 mt-5 text-left">
          <p className="text-sm">
            {accepted
              ? "You're already a member of this business account."
              : declined
                ? "You declined this invite. You can still accept it below."
                : "You've been invited to help manage this business account."}
          </p>
          <p className="text-xs text-muted-foreground mt-1.5">
            Team members can create and run the business's events, manage guestlists and check guests in at the door.
          </p>
        </div>

        {accepted ? (
          <button type="button" className={cn(buttonVariants(), "w-full h-11 rounded-xl mt-5 gap-2")} onClick={switchNow}>
            <Building2 className="w-4 h-4" /> Switch to this business
          </button>
        ) : (
          <div className="flex gap-2 mt-5">
            <button type="button" className={cn(buttonVariants(), "h-11 rounded-xl flex-1 gap-1.5")} disabled={!!busy} onClick={() => respond("accept")}>
              {busy === "accept" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Accept
            </button>
            <button type="button" className={cn(buttonVariants({ variant: "outline" }), "h-11 rounded-xl flex-1 gap-1.5")} disabled={!!busy} onClick={() => respond("decline")}>
              {busy === "decline" ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />} Decline
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
