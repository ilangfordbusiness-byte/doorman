import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Calendar, Clock, MapPin, Shirt, UserPlus, Sparkles, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import StatusBadge from "../components/StatusBadge";
import LoadingSpinner from "../components/LoadingSpinner";
import moment from "moment";

export default function InvitePage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [event, setEvent] = useState(null);
  const [user, setUser] = useState(null);
  const [myEntry, setMyEntry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    loadInvite();
  }, [code]);

  async function loadInvite() {
    const me = await base44.auth.me();
    setUser(me);

    const events = await base44.entities.Event.filter({ invite_code: code });
    if (!events.length) {
      setLoading(false);
      return;
    }

    const evt = events[0];
    setEvent(evt);

    // Check if already on guestlist
    const entries = await base44.entities.GuestlistEntry.filter({
      event_id: evt.id,
      guest_email: me.email,
    });
    if (entries.length) setMyEntry(entries[0]);

    setLoading(false);
  }

  async function handleRequest() {
    setRequesting(true);
    const qr_secret = crypto.randomUUID();
    await base44.entities.GuestlistEntry.create({
      event_id: event.id,
      guest_email: user.email,
      guest_name: user.full_name,
      status: "requested",
      source: "invite_link",
      qr_secret,
    });
    toast({ title: "Request sent!" });
    loadInvite();
    setRequesting(false);
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
      {/* Back button */}
      <button
        onClick={() => navigate("/guest")}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      {/* Event Preview */}
      <div className="text-center mb-6">
        <p className="text-xs text-primary uppercase tracking-widest font-semibold mb-2">You're Invited</p>
        <h1 className="font-heading font-bold text-3xl text-foreground">{event.title}</h1>
        <p className="text-sm text-muted-foreground mt-1">Hosted by {event.host_name}</p>
      </div>

      {event.cover_image && (
        <div className="rounded-2xl overflow-hidden h-48 mb-6">
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
      {!myEntry && event.requests_open && (
        <Button
          className="w-full h-14 rounded-xl font-bold text-base bg-primary hover:bg-primary/90"
          onClick={handleRequest}
          disabled={requesting}
        >
          <UserPlus className="w-5 h-5 mr-2" />
          {requesting ? "Requesting..." : "Request to Join"}
        </Button>
      )}

      {myEntry && (
        <div className="space-y-3">
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