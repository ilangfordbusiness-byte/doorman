import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import moment from "moment";
import { ArrowLeft, Check, Pencil, Sparkles, Link2, Sun } from "lucide-react";
import { api } from "@/api/data";
import { appBaseUrl, withPreviewVersion } from "@/lib/appUrl";
import Avatar from "@/components/Avatar";
import LoadingSpinner from "@/components/LoadingSpinner";
import SocialLinks from "@/components/profile/SocialLinks";
import ConfettiBurst from "@/components/profile/ConfettiBurst";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { coverStyleFor } from "@/lib/eventCover";
import { SignedOutTopBar, LockedTeaser, SignupBar } from "@/components/SignedOutPreview";

// Date stickers on the archive posters cycle through these, and the posters
// lean alternately, like flyers pinned to a wall.
const STICKERS = ["bg-amber-300 text-amber-950", "bg-pink-300 text-pink-950", "bg-cyan-300 text-cyan-950", "bg-violet-300 text-violet-950"];
const TILTS = ["-rotate-3", "rotate-2", "-rotate-[1.5deg]", "rotate-[2.5deg]"];

// On the host's own page "IGNIGHT - Oktoberfest" reads as just "Oktoberfest".
function withoutHostPrefix(title, host) {
  const t = String(title || "");
  if (!host) return t;
  const esc = host.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const short = t.replace(new RegExp(`^\\s*${esc}\\s*[-–—:|·]\\s*`, "i"), "").trim();
  return short || t;
}

// A preset cover is a gradient style; an upload is an image URL.
function cover(event) {
  const style = coverStyleFor(event?.cover_image);
  const img = event?.cover_image && !event.cover_image.startsWith("__cover__") ? event.cover_image : null;
  return { style, img };
}

// Fill an absolutely positioned box with an event's cover (or a fallback wash).
function CoverFill({ event, className = "" }) {
  const { style, img } = cover(event);
  if (img) return <img src={img} alt="" loading="lazy" className={`absolute inset-0 w-full h-full object-cover ${className}`} />;
  return <div className={`absolute inset-0 ${style ? "" : "bg-gradient-to-br from-primary/50 via-card to-accent/30"} ${className}`} style={style || undefined} />;
}

// Public, shareable business/host profile at /b/:id. Anyone signed in can view
// it (reached from an event's host, a shared link, or Search). A blurred,
// drifting banner from their latest cover; the floating logo in the comet
// ring used on personal profiles; the next event as a featured
// card (or a "next one's cooking" card between events); and past events as a
// swipeable archive of tilted posters. Managers get an Edit shortcut.
export default function PublicBusiness() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [biz, setBiz] = useState(null);
  const [events, setEvents] = useState([]);
  const [pastEvents, setPastEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [copied, setCopied] = useState(false);
  const [authed, setAuthed] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const b = await api.businesses.getPublic(id);
        if (!active) return;
        if (!b) { setNotFound(true); return; }
        setBiz(b);

        // Published public events only; readable signed out (shared links).
        const [shown, signedIn] = await Promise.all([
          api.businesses.publicEvents(id),
          api.auth.isAuthenticated().catch(() => false),
        ]);
        if (!active) return;
        setAuthed(signedIn);
        const today = moment().startOf("day");
        setEvents(shown.filter((e) => moment(e.date).isSameOrAfter(today)));
        // Most recent first.
        setPastEvents(shown.filter((e) => moment(e.date).isBefore(today)).reverse());

        // Is the current viewer a manager? (mine() returns owned + member)
        if (signedIn) try {
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
    // Versioned by what the link card shows (name, picture, bio, event counts).
    const url = withPreviewVersion(`${appBaseUrl()}/b/${id}`,
      biz?.business_name, biz?.business_picture, biz?.description, events.length, pastEvents.length);
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast({ title: "Link copied!" });
    setTimeout(() => setCopied(false), 2000);
  }

  // Opened straight from a shared link there's no page to go back to.
  function goBack() {
    if (window.history.length > 1) navigate(-1);
    else navigate("/guest");
  }

  if (loading) return <LoadingSpinner fullScreen />;

  if (notFound || !biz) return (
    <div className="max-w-lg mx-auto px-4 pt-20 text-center">
      <h2 className="font-heading font-bold text-lg mb-2">Host not found</h2>
      <p className="text-sm text-muted-foreground mb-6">This host page doesn&apos;t exist or is no longer available.</p>
      <Button onClick={() => navigate("/guest")}>Browse events</Button>
    </div>
  );

  const [next, ...later] = events;
  const bannerEvent = next || pastEvents[0];
  const instagram = biz.instagram ? biz.instagram.replace(/^@/, "") : null;

  return (
    <div className={`max-w-lg mx-auto ${authed ? "pb-10" : "pb-32"}`}>
      {/* Banner: their latest cover, blurred and slowly drifting */}
      <div
        className="relative h-[230px] overflow-hidden"
        style={{ WebkitMaskImage: "linear-gradient(to bottom, #000 55%, transparent)", maskImage: "linear-gradient(to bottom, #000 55%, transparent)" }}
      >
        {bannerEvent ? (
          <CoverFill event={bannerEvent} className="animate-drift motion-reduce:animate-none [filter:blur(26px)_saturate(1.4)]" />
        ) : biz.business_picture ? (
          <img src={biz.business_picture} alt="" className="absolute inset-0 w-full h-full object-cover animate-drift motion-reduce:animate-none [filter:blur(26px)_saturate(1.4)]" />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/30 to-background" />
        <div
          className="absolute inset-0 opacity-40"
          style={{ background: "radial-gradient(60% 50% at 20% 20%, rgba(192,132,252,.55), transparent 70%), radial-gradient(50% 45% at 85% 30%, rgba(34,211,238,.4), transparent 70%)" }}
        />
        <div className="relative flex items-center justify-between px-4 pt-4">
          {!authed ? <SignedOutTopBar /> : <>
          <button type="button" onClick={goBack} aria-label="Back"
            className="w-10 h-10 rounded-full bg-black/35 backdrop-blur-md border border-white/15 grid place-items-center text-white">
            <ArrowLeft className="w-5 h-5" />
          </button>
          {canManage && (
            <button type="button" onClick={() => navigate(`/business/${id}/edit`)} aria-label="Edit page"
              className="w-10 h-10 rounded-full bg-black/35 backdrop-blur-md border border-white/15 grid place-items-center text-white">
              <Pencil className="w-4 h-4" />
            </button>
          )}
          </>}
        </div>
      </div>

      {/* Identity */}
      <div className="relative -mt-[96px] flex flex-col items-center text-center px-6">
        <ConfettiBurst fire originY={60} />
        <div className="animate-float motion-reduce:animate-none">
          <div className="relative rounded-full p-[4px] overflow-hidden" style={{ boxShadow: "0 18px 40px -14px rgba(192,132,252,.7)" }}>
            <div
              className="absolute inset-[-50%] animate-spin [animation-duration:3s] motion-reduce:animate-none"
              style={{ background: "conic-gradient(from 0deg, transparent 0 70%, #22d3ee 82%, #f0abfc 90%, #ffffff 94%, transparent 99%)" }}
            />
            <div className="relative rounded-full p-[3px] bg-background">
              <Avatar src={biz.business_picture} name={biz.business_name} size="w-[112px] h-[112px]" textClass="text-3xl" enlargeable />
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <h1 className="font-heading font-bold text-[28px] leading-none tracking-tight">{biz.business_name}</h1>
          <span className="w-6 h-6 rounded-full grid place-items-center shadow-md flex-shrink-0"
            style={{ background: "conic-gradient(from 0deg, #fde68a, #f9a8d4, #f0abfc, #c084fc, #a5b4fc, #67e8f9, #fde68a)" }}>
            <Sparkles className="w-3.5 h-3.5 text-violet-950" />
          </span>
        </div>
        <p className="mt-2 text-[11px] font-semibold tracking-[0.2em] uppercase bg-gradient-to-r from-amber-200 via-fuchsia-300 to-cyan-300 bg-clip-text text-transparent">
          Event host on DoorMan
        </p>

        {biz.description && (
          <p className="mt-3 text-[15px] text-foreground/80 leading-relaxed whitespace-pre-line max-w-sm">{biz.description}</p>
        )}

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <SocialLinks instagram={instagram} snapchat={null} location={null} align="center" />
          <button type="button" onClick={handleShare}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-black rounded-full px-3.5 py-2 border-2 border-white bg-white shadow-md shadow-black/30 hover:brightness-95 transition">
            {copied ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      </div>

      {/* Next up */}
      <div className="px-4 mt-8">
        <h2 className="font-heading font-semibold text-[17px] mb-3 flex items-center gap-2">
          {next && (
            <span className="relative flex w-2 h-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full w-2 h-2 bg-emerald-400" />
            </span>
          )}
          Next up
        </h2>
        {next ? <FeaturedEvent event={next} /> : <NextOneCooking name={biz.business_name} instagram={instagram} />}

        {later.length > 0 && (
          <div className="mt-3 space-y-2">
            {later.map((e) => (
              <Link key={e.id} to={`/event/${e.id}`}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-2.5 hover:border-primary/40 transition-colors">
                <div className="relative w-14 h-14 rounded-xl overflow-hidden flex-shrink-0"><CoverFill event={e} /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{e.title}</p>
                  <p className="text-xs text-muted-foreground">{moment(e.date).format("ddd D MMM")}{e.start_time ? ` · ${moment(e.start_time, "HH:mm").format("h:mma")}` : ""}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* The archive */}
      {pastEvents.length > 0 && (
        <div className="mt-8">
          <div className="px-4 mb-1 flex items-baseline justify-between">
            <h2 className="font-heading font-semibold text-[17px]">
              The archive <span className="text-muted-foreground font-normal">· {pastEvents.length}</span>
            </h2>
            {authed && pastEvents.length > 2 && <span className="text-xs text-muted-foreground">Swipe →</span>}
          </div>
          {authed ? (
            <div className="flex gap-4 overflow-x-auto px-5 pt-4 pb-5 snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {pastEvents.map((e, i) => <ArchivePoster key={e.id} event={e} i={i} host={biz.business_name} />)}
            </div>
          ) : (
            // Signed out: a blurred glimpse of the first few, behind sign-up.
            <LockedTeaser title={`See ${biz.business_name}'s past parties`}>
              <div className="flex gap-4 overflow-hidden px-5 pt-4 pb-5">
                {pastEvents.slice(0, 3).map((e, i) => <ArchivePoster key={e.id} event={e} i={i} host={biz.business_name} locked />)}
              </div>
            </LockedTeaser>
          )}
        </div>
      )}

      {!authed && (
        <SignupBar picture={biz.business_picture} name={biz.business_name}
          title={next ? "Get tickets on DoorMan" : `More from ${biz.business_name}`} />
      )}
    </div>
  );
}

// The next event: big cover, calendar stamp, comet-light border.
function FeaturedEvent({ event }) {
  const d = moment(event.date);
  return (
    <Link to={`/event/${event.id}`} className="relative block rounded-3xl p-[2px] overflow-hidden active:scale-[0.99] transition-transform">
      <div
        className="absolute inset-[-60%] animate-spin [animation-duration:4s] motion-reduce:animate-none"
        style={{ background: "conic-gradient(from 0deg, transparent 0 75%, #22d3ee 86%, #f0abfc 92%, #fff 95%, transparent 99%)" }}
      />
      <div className="relative rounded-[22px] overflow-hidden bg-card">
        <div className="relative aspect-[16/11]">
          <CoverFill event={event} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent" />
          <div className="absolute top-3 left-3 w-14 rounded-2xl overflow-hidden text-center shadow-lg -rotate-[4deg] border-2 border-white">
            <div className="bg-rose-500 text-[10px] font-bold tracking-widest text-white py-0.5">{d.format("MMM").toUpperCase()}</div>
            <div className="bg-white text-black font-heading font-bold text-[22px] leading-8">{d.format("D")}</div>
          </div>
          <div className="absolute bottom-0 inset-x-0 p-4">
            <p className="font-heading font-bold text-[22px] leading-tight text-white line-clamp-2">{event.title}</p>
            <p className="text-[13px] text-white/70 mt-0.5">
              {d.format("ddd D MMM")}{event.start_time ? ` · ${moment(event.start_time, "HH:mm").format("h:mma")}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-xs text-muted-foreground">On DoorMan</span>
          <span className="rounded-full bg-white text-black text-[13px] font-semibold px-4 py-2">See the event →</span>
        </div>
      </div>
    </Link>
  );
}

// Between events: an upbeat placeholder instead of an empty list.
function NextOneCooking({ name, instagram }) {
  return (
    <div className="relative rounded-3xl p-[2px] overflow-hidden">
      <div className="absolute inset-0 opacity-60"
        style={{ background: "conic-gradient(from 0deg, #fde68a, #f9a8d4, #f0abfc, #c084fc, #a5b4fc, #67e8f9, #fde68a)" }} />
      <div className="relative rounded-[22px] bg-card px-5 py-6 text-center">
        <div className="mx-auto w-12 h-12 rounded-2xl grid place-items-center -rotate-6 shadow-lg"
          style={{ background: "conic-gradient(from 0deg, #fde68a, #f9a8d4, #f0abfc, #c084fc, #a5b4fc, #67e8f9, #fde68a)" }}>
          <Sun className="w-6 h-6 text-violet-950" />
        </div>
        <p className="mt-3 font-heading font-semibold text-[17px]">The next one&apos;s cooking</p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {instagram ? `Follow ${name} on Instagram to hear about it first.` : `Check back soon for ${name}'s next party.`}
        </p>
      </div>
    </div>
  );
}

// A past event as a tilted poster with a date sticker; straightens on hover.
// `locked` renders a plain tile (it sits inside the sign-up teaser's button).
function ArchivePoster({ event, i, host, locked = false }) {
  const Tag = locked ? "div" : Link;
  return (
    <Tag to={locked ? undefined : `/event/${event.id}`}
      className={`snap-start shrink-0 w-[148px] ${TILTS[i % TILTS.length]} hover:rotate-0 hover:-translate-y-1.5 active:rotate-0 transition-transform duration-300 ease-[cubic-bezier(.3,1.3,.5,1)]`}>
      <div className="relative aspect-[3/4] rounded-2xl overflow-hidden border-[3px] border-white shadow-xl shadow-black/60 bg-card">
        <CoverFill event={event} />
        <span className={`absolute top-2 right-2 ${i % 2 ? "-rotate-[5deg]" : "rotate-[6deg]"} rounded-md text-[10px] font-bold px-1.5 py-0.5 shadow ${STICKERS[i % STICKERS.length]}`}>
          {moment(event.date).format("D MMM").toUpperCase()}
        </span>
      </div>
      <p className="mt-2.5 text-[13px] font-semibold leading-tight line-clamp-2">{withoutHostPrefix(event.title, host)}</p>
    </Tag>
  );
}
