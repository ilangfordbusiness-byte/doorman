import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "@/api/data";
import { appBaseUrl } from "@/lib/appUrl";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import Avatar from "@/components/Avatar";
import EventCard from "@/components/EventCard";
import LoadingSpinner from "@/components/LoadingSpinner";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import {
  ArrowLeft, Share2, Check, Instagram, Music, Mail, Disc3, Calendar,
  UserPlus, UserCheck, Pencil, Clock,
} from "lucide-react";

function externalUrl(u) {
  if (!u) return null;
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

// Public DJ profile: bio + links + a résumé of the public events they've played
// (past) and are booked for (upcoming). Modeled on PublicBusiness.
export default function DjProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: me } = useCurrentUser();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const [rel, setRel] = useState("none"); // none | pending | friends | self
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const res = await api.djs.getProfile(id);
        if (!active) return;
        if (!res?.profile) { setNotFound(true); return; }
        setData(res);
      } catch {
        if (active) setNotFound(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [id]);

  const dj = data?.profile;

  useEffect(() => {
    if (!me || !dj) return;
    if (dj.id === me.id) { setRel("self"); return; }
    let active = true;
    (async () => {
      try {
        const [sent, received] = await Promise.all([
          api.entities.FriendRequest.filter({ sender_email: me.email }),
          api.entities.FriendRequest.filter({ receiver_email: me.email }),
        ]);
        const edge = [...sent, ...received].find(
          (r) => r.sender_email === dj.email || r.receiver_email === dj.email,
        );
        if (active) setRel(edge ? (edge.status === "accepted" ? "friends" : edge.status === "pending" ? "pending" : "none") : "none");
      } catch { /* leave as none */ }
    })();
    return () => { active = false; };
  }, [me, dj]);

  async function addFriend() {
    setSending(true);
    try {
      await api.entities.FriendRequest.create({
        sender_email: me.email,
        sender_name: me.full_name,
        sender_picture: me.profile_picture || "",
        receiver_email: dj.email,
        receiver_name: dj.full_name,
        receiver_picture: dj.profile_picture || "",
        status: "pending",
      });
      setRel("pending");
      toast({ title: "Friend request sent!" });
    } catch (e) {
      toast({ title: e?.message || "Couldn't send request", variant: "destructive" });
    }
    setSending(false);
  }

  function share() {
    navigator.clipboard.writeText(`${appBaseUrl()}/dj/${id}`);
    setCopied(true);
    toast({ title: "Link copied!" });
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) return <LoadingSpinner fullScreen />;
  if (notFound || !dj) return (
    <div className="max-w-lg mx-auto px-4 pt-20 text-center">
      <h2 className="font-heading font-bold text-lg mb-2">DJ not found</h2>
      <p className="text-sm text-muted-foreground mb-6">This profile doesn&apos;t exist or is no longer available.</p>
      <Button onClick={() => navigate("/guest")}>Browse events</Button>
    </div>
  );

  const { upcoming, past, setsPlayed } = data;
  const ig = dj.instagram?.replace(/^@/, "");
  const genreTags = (dj.genres || "").split(",").map((g) => g.trim()).filter(Boolean);

  return (
    <div className="max-w-lg mx-auto px-4 pb-8">
      <div className="flex items-center justify-between pt-4">
        <Button variant="ghost" size="icon" className="rounded-full" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-1">
          {rel === "self" && (
            <Button variant="ghost" size="icon" className="rounded-full" onClick={() => navigate("/profile")}>
              <Pencil className="w-5 h-5" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="rounded-full" onClick={share}>
            {copied ? <Check className="w-5 h-5 text-emerald-400" /> : <Share2 className="w-5 h-5" />}
          </Button>
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-col items-center text-center pt-2 pb-5">
        <Avatar src={dj.profile_picture} name={dj.full_name} size="w-24 h-24" textClass="text-2xl" className="mb-3" enlargeable />
        <div className="flex items-center gap-1.5">
          <Disc3 className="w-4 h-4 text-primary" />
          <h1 className="font-heading font-bold text-xl">{dj.full_name || "DJ"}</h1>
        </div>
        {setsPlayed > 0 && (
          <p className="text-xs text-muted-foreground mt-1">{setsPlayed} set{setsPlayed === 1 ? "" : "s"} played on DoorMan</p>
        )}
        {dj.bio && <p className="mt-3 text-sm text-muted-foreground whitespace-pre-line max-w-sm">{dj.bio}</p>}

        {genreTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 justify-center mt-3">
            {genreTags.map((g) => (
              <span key={g} className="text-[11px] bg-secondary/60 border border-border/50 rounded-full px-2.5 py-0.5">{g}</span>
            ))}
          </div>
        )}

        {/* Links */}
        <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
          {ig && (
            <a href={`https://instagram.com/${ig}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm bg-secondary/50 border border-border/50 rounded-full px-3 py-1.5 hover:border-primary/40 transition-colors">
              <Instagram className="w-4 h-4" />@{ig}
            </a>
          )}
          {dj.music_link && (
            <a href={externalUrl(dj.music_link)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm bg-secondary/50 border border-border/50 rounded-full px-3 py-1.5 hover:border-primary/40 transition-colors">
              <Music className="w-4 h-4" /> Music
            </a>
          )}
          {dj.booking_email && (
            <a href={`mailto:${dj.booking_email}`} className="inline-flex items-center gap-1.5 text-sm bg-secondary/50 border border-border/50 rounded-full px-3 py-1.5 hover:border-primary/40 transition-colors">
              <Mail className="w-4 h-4" /> Book
            </a>
          )}
        </div>

        {/* Follow */}
        {rel !== "self" && me && (
          <div className="mt-4">
            {rel === "friends" ? (
              <span className="inline-flex items-center gap-1.5 text-sm text-emerald-400"><UserCheck className="w-4 h-4" /> Friends</span>
            ) : rel === "pending" ? (
              <span className="text-sm text-muted-foreground">Request sent</span>
            ) : (
              <Button size="sm" className="rounded-full gap-1.5" disabled={sending} onClick={addFriend}>
                <UserPlus className="w-4 h-4" /> Follow
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Upcoming sets */}
      <h2 className="font-heading font-semibold text-sm flex items-center gap-2 mb-3">
        <Calendar className="w-4 h-4" /> Upcoming sets
      </h2>
      {upcoming.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No upcoming sets right now.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {upcoming.map((e) => <EventCard key={e.id} event={e} />)}
        </div>
      )}

      {/* Past sets */}
      {past.length > 0 && (
        <>
          <h2 className="font-heading font-semibold text-sm flex items-center gap-2 mb-3 mt-6">
            <Clock className="w-4 h-4" /> Past sets
          </h2>
          <div className="grid grid-cols-1 gap-4">
            {past.map((e) => <EventCard key={e.id} event={e} />)}
          </div>
        </>
      )}
    </div>
  );
}
