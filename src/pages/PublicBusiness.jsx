import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import moment from "moment";
import { ArrowLeft, Share2, Check, Instagram, Pencil, Calendar } from "lucide-react";
import { api } from "@/api/data";
import Avatar from "@/components/Avatar";
import EventCard from "@/components/EventCard";
import LoadingSpinner from "@/components/LoadingSpinner";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

// Public, shareable business/host profile at /b/:id. Anyone signed in can view
// it (reached from an event's host, a shared link, or Search). Shows the
// business's name, picture, optional description, Instagram, and all upcoming
// public events. Managers get an Edit shortcut into the business settings.
export default function PublicBusiness() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [biz, setBiz] = useState(null);
  const [events, setEvents] = useState([]);
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
        setEvents(
          all.filter(
            (e) =>
              e.status === "published" &&
              e.is_public &&
              moment(e.date).isSameOrAfter(today),
          ),
        );

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
    const url = `${window.location.origin}/b/${id}`;
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
    </div>
  );
}
