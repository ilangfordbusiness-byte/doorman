import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "@/api/data";
import { Calendar, Clock, MapPin, Shirt, Share2, Check, Sparkles, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import StatusBadge from "../components/StatusBadge";
import LoadingSpinner from "../components/LoadingSpinner";
import EventJoinActions from "../components/EventJoinActions";
import { getLinkDomain } from "@/lib/promoterRef";
import moment from "moment";

export default function InvitePage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [event, setEvent] = useState(null);
  const [user, setUser] = useState(null);
  const [myEntry, setMyEntry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadInvite();
  }, [code]);

  async function loadInvite() {
    const me = await api.auth.me();
    setUser(me);

    const events = await api.entities.Event.filter({ invite_code: code });
    if (!events.length) {
      setLoading(false);
      return;
    }

    const evt = events[0];
    setEvent(evt);

    // Check if already on guestlist
    const entries = await api.entities.GuestlistEntry.filter({
      event_id: evt.id,
      guest_email: me.email,
    });
    if (entries.length) setMyEntry(entries[0]);

    setLoading(false);
  }

  async function handleShare() {
    const url = `${getLinkDomain()}/invite/${event.invite_code}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: event.title, text: `You're invited to ${event.title}!`, url });
        return;
      }
    } catch {}
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast({ title: "Link copied!" });
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) return <LoadingSpinner fullScreen />;

  if (!event) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center">
        <Sparkles className="w-12 h-12 text-muted-foreground mb-4" />
        <h1 className="font-heading font-bold text-xl text-foreground">Invite Not Found</h1>
        <p className="text-sm text-muted-foreground mt-2">This invite link may have expired or is invalid.</p>
        <Button variant="outline" className="mt-6 rounded-full" onClick={() => navigate("/")}>
          Go Home
        </Button>
      </div>
    );
  }

  const eventDate = moment(event.date);

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-8">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigate("/guest")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <button
          onClick={handleShare}
          className="w-9 h-9 rounded-full flex items-center justify-center bg-card/60 backdrop-blur-sm border border-border/50 hover:bg-secondary transition-colors"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4" />}
        </button>
      </div>
      {/* Event Preview */}
      <div className="text-center mb-6">
        <p className="text-xs text-primary uppercase tracking-widest font-semibold mb-2">You're Invited</p>
        <h1 className="font-heading font-bold text-3xl text-foreground">{event.title}</h1>
        <p className="text-sm text-muted-foreground mt-1">Hosted by {event.host_name}</p>
      </div>

      {event.cover_image && (
        <div className="rounded-2xl overflow-hidden aspect-square mb-6">
          <img src={event.cover_image} alt={event.title} className="w-full h-full object-cover" />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-secondary/50 rounded-xl p-3 border border-border/50">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <Calendar className="w-4 h-4" />
            <span className="text-[10px] uppercase tracking-wider">Date</span>
          </div>
          <p className="text-sm font-medium text-foreground">{eventDate.format("ddd, MMM D")}</p>
        </div>
        <div className="bg-secondary/50 rounded-xl p-3 border border-border/50">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <Clock className="w-4 h-4" />
            <span className="text-[10px] uppercase tracking-wider">Time</span>
          </div>
          <p className="text-sm font-medium text-foreground">{event.start_time}</p>
        </div>
        {event.venue_name && (
          <div className="bg-secondary/50 rounded-xl p-3 border border-border/50">
            <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
              <MapPin className="w-4 h-4" />
              <span className="text-[10px] uppercase tracking-wider">Venue</span>
            </div>
            <p className="text-sm font-medium text-foreground">{event.venue_name}</p>
          </div>
        )}
        {event.dress_code && (
          <div className="bg-secondary/50 rounded-xl p-3 border border-border/50">
            <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
              <Shirt className="w-4 h-4" />
              <span className="text-[10px] uppercase tracking-wider">Dress Code</span>
            </div>
            <p className="text-sm font-medium text-foreground">{event.dress_code}</p>
          </div>
        )}
      </div>

      {event.description && (
        <p className="text-sm text-foreground/80 leading-relaxed mb-6">{event.description}</p>
      )}

      {/* Action */}
      <EventJoinActions event={event} me={user} myEntry={myEntry} onChanged={loadInvite} />
      {myEntry && myEntry.status !== "denied" && (
        <div className="space-y-3 mt-4">
          <div className="bg-secondary/50 rounded-xl p-4 border border-border/50 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Your Status</p>
            <StatusBadge status={myEntry.status} size="lg" />
          </div>
          {["approved", "invited"].includes(myEntry.status) && (
            <Button
              className="w-full h-14 rounded-xl font-bold text-base bg-primary hover:bg-primary/90"
              onClick={() => navigate(`/pass/${event.id}`)}
            >
              Open QR Pass
            </Button>
          )}
          {myEntry.status === "requested" && (
            <p className="text-sm text-muted-foreground text-center">The host will review your request.</p>
          )}
        </div>
      )}
    </div>
  );
}