import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import moment from "moment";
import { ArrowLeft, Share2, Check, Instagram, Pencil, Calendar, History } from "lucide-react";
import { api } from "@/api/data";
import { appBaseUrl } from "@/lib/appUrl";
import Avatar from "@/components/Avatar";
import EventCard from "@/components/EventCard";
import LoadingSpinner from "@/components/LoadingSpinner";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { coverStyleFor } from "@/lib/eventCover";

// Past events show this many tiles until "Show all".
const PAST_PREVIEW = 6;

// Public, shareable business/host profile at /b/:id. Anyone signed in can view
// it (reached from an event's host, a shared link, or Search). Shows the
// business's name, picture, optional description, Instagram, its upcoming
// public events, and its past public events as a portfolio of cover tiles.
// Managers get an Edit shortcut into the business settings.
export default function PublicBusiness() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [biz, setBiz] = useState(null);
  const [events, setEvents] = useState([]);
  const [pastEvents, setPastEvents] = useState([]);
  const [showAllPast, setShowAllPast] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const b = await api.businesses.getPublic(id);
        if (!active) return;
        if (!b) { setNotFound(true); return; }
        setBiz(b);

        const all = await api.entities.Event.filter({ business_id: id }, "date");
        if (!active) return;
        const today = moment().startOf("day");
        const shown = all.filter((e) => e.status === "published" && e.is_public);
        setEvents(shown.filter((e) => moment(e.date).isSameOrAfter(today)));
        // Most recent first.
        setPastEvents(shown.filter((e) => moment(e.date).isBefore(today)).reverse());

        // Is the current viewer a manager? (mine() returns owned + member)
        try {
          const me = await api.auth.me();
          const mine = await api.businesses.mine(me.email);
          if (active) setCanManage(mine.some((x) => x.id === id));
        } catch { /* signed-out or no businesses — no edit shortcut */ }
      } catch {
        if (active) setNotFound(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [id]);

  function handleShare() {
    const url = `${appBaseUrl()}/b/${id}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast({ title: "Link copied!" });
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) return <LoadingSpinner fullScreen />;

  if (notFound || !biz) return (
    <div className="max-w-lg mx-auto px-4 pt-20 text-center">
      <h2 className="font-heading font-bold text-lg mb-2">Host not found</h2>
      <p className="text-sm text-muted-foreground mb-6">This host page doesn&apos;t exist or is no longer available.</p>
      <Button onClick={() => navigate("/guest")}>Browse events</Button>
    </div>
  );

  return (
    <div className="max-w-lg mx-auto px-4 pb-8">
      <div className="flex items-center justify-between pt-4">
        <Button variant="ghost" size="icon" className="rounded-full" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-1">
          {canManage && (
            <Button variant="ghost" size="icon" className="rounded-full" onClick={() => navigate(`/business/${id}/edit`)}>
              <Pencil className="w-5 h-5" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="rounded-full" onClick={handleShare}>
            {copied ? <Check className="w-5 h-5 text-emerald-400" /> : <Share2 className="w-5 h-5" />}
          </Button>
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-col items-center text-center pt-2 pb-6">
        <Avatar
          src={biz.business_picture}
          name={biz.business_name}
          size="w-24 h-24"
          textClass="text-2xl"
          className="mb-3"
          enlargeable
        />
        <h1 className="font-heading font-bold text-xl">{biz.business_name}</h1>
        {biz.instagram && (
          <a
            href={`https://instagram.com/${biz.instagram.replace(/^@/, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Instagram className="w-4 h-4" />@{biz.instagram.replace(/^@/, "")}
          </a>
        )}
        {biz.description && (
          <p className="mt-3 text-sm text-muted-foreground whitespace-pre-line max-w-sm">{biz.description}</p>
        )}
      </div>

      {/* Upcoming events */}
      <h2 className="font-heading font-semibold text-sm flex items-center gap-2 mb-3">
        <Calendar className="w-4 h-4" /> Upcoming events
      </h2>
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">No upcoming events right now.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {events.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </div>
      )}

      {/* Past events */}
      {pastEvents.length > 0 && (
        <div className="mt-8">
          <h2 className="font-heading font-semibold text-sm flex items-center gap-2 mb-3">
            <History className="w-4 h-4" /> Past events
            <span className="text-muted-foreground font-normal">· {pastEvents.length}</span>
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {(showAllPast ? pastEvents : pastEvents.slice(0, PAST_PREVIEW)).map((e) => (
              <PastEventTile key={e.id} event={e} />
            ))}
          </div>
          {pastEvents.length > PAST_PREVIEW && (
            <Button variant="outline" className="w-full h-11 rounded-xl mt-3" onClick={() => setShowAllPast((v) => !v)}>
              {showAllPast ? "Show fewer" : `Show all ${pastEvents.length}`}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// Square cover tile for a past event: cover art (upload or preset gradient)
// with the title and date over a bottom fade.
function PastEventTile({ event }) {
  const coverStyle = coverStyleFor(event.cover_image);
  const coverImg = event.cover_image && !event.cover_image.startsWith("__cover__") ? event.cover_image : null;
  return (
    <Link
      to={`/event/${event.id}`}
      className="group relative aspect-square rounded-2xl overflow-hidden border border-border bg-card active:scale-[0.98] transition-transform"
      style={coverStyle || undefined}
    >
      {coverImg ? (
        <img src={coverImg} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
      ) : !coverStyle ? (
        <div className="absolute inset-0 bg-gradient-to-br from-primary/40 via-card to-accent/20" />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-2.5">
        <p className="text-sm font-semibold text-white leading-tight line-clamp-2">{event.title}</p>
        <p className="text-[11px] text-white/70 mt-0.5">{moment(event.date).format("MMM D, YYYY")}</p>
      </div>
    </Link>
  );
}
