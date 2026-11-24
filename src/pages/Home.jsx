import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Compass, Plus, Heart, User, Mail, UserPlus, Crown, Building2, ArrowLeftRight, ListChecks, Check, ChevronRight, Sparkles,
} from "lucide-react";
import { api } from "@/api/data";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useNotifications } from "@/hooks/useNotifications";
import Avatar from "@/components/Avatar";
import { coverStyleFor } from "@/lib/eventCover";
import { time12 } from "@/lib/eventDates";
import { formatMoney } from "@/lib/money";

// Home: deliberately simple. A greeting, your next night out (or, with no
// plans, the soonest event on Discover "Picked for you"), four big doors (Find a party, Host an event, Friends, Account),
// and a "Needs you" list of anything waiting on you.

function greeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "Good morning";
  if (h >= 12 && h < 18) return "Good afternoon";
  return "Good evening";
}

// TONIGHT / TOMORROW / SATURDAY (this week) / FRIDAY 12 DECEMBER.
function whenLabel(date) {
  if (!date) return "";
  const d = new Date(`${String(date).slice(0, 10)}T12:00:00`);
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const days = Math.round((d.getTime() - today.getTime()) / 864e5);
  if (days === 0) return "TONIGHT";
  if (days === 1) return "TOMORROW";
  /** @type {Intl.DateTimeFormatOptions} */
  const opts = days > 1 && days < 7 ? { weekday: "long" } : { weekday: "long", day: "numeric", month: "long" };
  return d.toLocaleDateString("en-GB", opts).toUpperCase();
}

// The DoorMan keyhole, top right: it floats and sways, a soft glow pulses
// behind it, and a streak of light runs along the keyhole's own lines (a
// spinning gradient masked to the logo's shape). Decorative only.
function DoorManMark() {
  const mask = { WebkitMask: "url(/logo-256.png) center / contain no-repeat", mask: "url(/logo-256.png) center / contain no-repeat" };
  return (
    <div aria-hidden className="relative w-14 h-14 flex-shrink-0 animate-float motion-reduce:animate-none">
      <div className="absolute -inset-2 rounded-full pointer-events-none animate-glow-pulse motion-reduce:animate-none"
        style={{ background: "radial-gradient(closest-side, rgba(192,132,252,.45), rgba(34,211,238,.2), transparent)" }} />
      <div className="relative w-14 h-14 animate-logo-sway motion-reduce:animate-none motion-reduce:scale-150">
        <img src="/logo-256.png" alt="" className="absolute inset-0 w-full h-full object-contain" />
        <div className="absolute inset-0 overflow-hidden" style={mask}>
          <div className="absolute inset-[-60%] animate-spin [animation-duration:2.6s] motion-reduce:hidden"
            style={{ background: "conic-gradient(from 0deg, transparent 0 62%, #ffffff 78%, #67e8f9 86%, #f0abfc 93%, transparent 100%)" }} />
        </div>
      </div>
    </div>
  );
}

// The moving light outline used on the plan cards (blue/purple for your own
// plans, gold/pink for a suggestion).
function CometBorder({ from = "#22d3ee", to = "#c084fc" }) {
  return (
    <div aria-hidden className="absolute inset-[-60%] animate-spin [animation-duration:4s] motion-reduce:animate-none"
      style={{ background: `conic-gradient(from 0deg, transparent 0 72%, ${from} 86%, ${to} 95%, transparent 100%)` }} />
  );
}

// "Ella, Sam +3" from a friends-going list.
function friendNames(friends) {
  const names = friends.slice(0, 2).map((f) => String(f.name || "").split(" ")[0]).filter(Boolean);
  const extra = friends.length - names.length;
  return names.length ? `${names.join(", ")}${extra > 0 ? ` +${extra}` : ""}` : "";
}

function Faces({ friends, max = 3 }) {
  if (!friends.length) return null;
  return (
    <div className="flex -space-x-2 flex-shrink-0">
      {friends.slice(0, max).map((f) => (
        <Avatar key={f.email || f.name} src={f.picture} name={f.name || "?"} size="w-7 h-7" textClass="text-[10px]" className="border-2 border-black" />
      ))}
    </div>
  );
}

function CoverArt({ event }) {
  const coverStyle = coverStyleFor(event.cover_image);
  const coverImg = event.cover_image && !event.cover_image.startsWith("__cover__") ? event.cover_image : null;
  return (
    <>
      {coverImg
        ? <img src={coverImg} alt="" className="absolute inset-0 w-full h-full object-cover" />
        : <div className="absolute inset-0 bg-gradient-to-br from-violet-700 to-slate-900" style={coverStyle || undefined} />}
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-transparent" />
    </>
  );
}

export default function Home() {
  const { data: me } = useCurrentUser();
  const { data: notifs } = useNotifications();
  const { data, isLoading } = useQuery({
    queryKey: ["home"],
    queryFn: async () => (await api.functions.invoke("getHomeDashboard")).data,
    enabled: !!me,
    staleTime: 60 * 1000,
  });

  const user = /** @type {any} */ (me ?? data?.user ?? null);
  const event = data?.event ?? null;
  const isHosting = data?.isHosting ?? false;
  const friendsGoing = data?.friendsGoing ?? [];
  const attendeeCount = data?.attendeeCount ?? 0;
  const suggested = data?.suggested ?? null;
  const firstName = user?.full_name?.split(" ")[0] || "there";
  const c = notifs?.counts ?? {};

  const needs = [
    { n: c.eventInvites, to: "/guest?tab=invites", icon: Mail, tone: "bg-emerald-500/15 text-emerald-300", one: "event invite", sub: "Accept to get your pass" },
    { n: c.transfers, to: "/guest?tab=transfers", icon: ArrowLeftRight, tone: "bg-cyan-500/15 text-cyan-300", one: "ticket sent to you", many: "tickets sent to you", sub: "Accept the transfer" },
    { n: c.friendRequests, to: "/friends?tab=requests", icon: UserPlus, tone: "bg-pink-500/15 text-pink-300", one: "friend request", sub: "Say yes or no" },
    { n: c.coHost, to: "/profile", icon: Crown, tone: "bg-amber-500/15 text-amber-300", one: "co-host invite", sub: "Help run an event" },
    { n: c.businessInvite, to: "/profile", icon: Building2, tone: "bg-sky-500/15 text-sky-300", one: "business invite", sub: "Join a team" },
    { n: c.doorListInvite, to: "/friends", icon: ListChecks, tone: "bg-violet-500/15 text-violet-300", one: "door list shared with you", many: "door lists shared with you", sub: "Help check guests in" },
  ].filter((x) => x.n > 0);
  const accountBadge = (c.coHost || 0) + (c.businessInvite || 0);

  return (
    <div className="relative min-h-screen max-w-lg mx-auto pb-10 overflow-x-hidden">
      {/* Soft drifting glow behind the page */}
      <div aria-hidden className="pointer-events-none absolute -top-24 -left-20 w-[420px] h-[420px] rounded-full opacity-50 animate-drift motion-reduce:animate-none"
        style={{ background: "radial-gradient(closest-side, rgba(139,92,246,.45), transparent)" }} />
      <div aria-hidden className="pointer-events-none absolute top-40 -right-32 w-[360px] h-[360px] rounded-full opacity-40 animate-drift motion-reduce:animate-none [animation-delay:-6s]"
        style={{ background: "radial-gradient(closest-side, rgba(34,211,238,.35), transparent)" }} />

      {/* Greeting */}
      <div className="relative flex items-center justify-between px-5 pt-8">
        <div className="min-w-0">
          <p className="text-[13px] text-muted-foreground">{greeting()}</p>
          <h1 className="font-heading font-bold text-[34px] leading-none tracking-tight truncate">{firstName}</h1>
        </div>
        <DoorManMark />
      </div>

      {/* Your next night out */}
      <div className="relative px-4 mt-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground mb-2.5 px-1 flex items-center gap-1.5">
          {event && isHosting ? "You're hosting" : !event && suggested?.event ? (
            <><Sparkles className="w-3.5 h-3.5 text-amber-300" /> Picked for you</>
          ) : "Your next night out"}
        </p>
        {isLoading ? (
          <div className="aspect-[4/5] rounded-[28px] bg-secondary/40 border border-border/60 animate-pulse" />
        ) : event ? (
          <PlanCard event={event} isHosting={isHosting} friendsGoing={friendsGoing} attendeeCount={attendeeCount} />
        ) : suggested?.event ? (
          <SuggestedCard suggested={suggested} />
        ) : (
          <Link to="/guest?tab=discover" className="block relative rounded-[28px] p-[2px] overflow-hidden active:scale-[0.99] transition-transform">
            <div className="absolute inset-0 rounded-[28px] bg-white/[0.08]" />
            <CometBorder />
            <div className="relative rounded-[26px] bg-card px-6 py-10 text-center">
              <p className="font-heading font-bold text-2xl">No plans yet</p>
              <p className="text-sm text-muted-foreground mt-1">See what&apos;s on this week and grab a ticket.</p>
              <span className="mt-5 inline-block rounded-full bg-white text-black text-sm font-bold px-5 py-2.5">Find a party</span>
            </div>
          </Link>
        )}
      </div>

      {/* Four big doors */}
      <div className="relative px-4 mt-4 grid grid-cols-2 gap-3">
        <BigTile to="/guest?tab=discover" icon={Compass} title="Find a party" sub="What's on near you" bg="from-amber-400 to-orange-600" />
        <BigTile to="/create-event" icon={Plus} title="Host an event" sub="Takes a minute" bg="from-violet-500 to-indigo-700" />
        <BigTile to="/friends" icon={Heart} title="Friends" sub="Activity & requests" bg="from-pink-500 to-rose-600" badge={c.friendRequests} badgeTone="text-rose-600" />
        <BigTile to="/profile" icon={User} title="Account" sub="Your profile" bg="from-emerald-500 to-teal-700" badge={accountBadge} badgeTone="text-teal-700" />
      </div>

      {/* Needs you */}
      <div className="relative px-4 mt-7">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground mb-2.5 px-1">Needs you</p>
        {needs.length ? (
          <div className="rounded-[20px] bg-secondary/40 border border-border/60 divide-y divide-border/60">
            {needs.map((x) => (
              <Link key={x.one} to={x.to} className="flex items-center gap-3 px-4 py-3.5 hover:bg-secondary/40 transition-colors">
                <span className={`w-10 h-10 rounded-xl grid place-items-center flex-shrink-0 ${x.tone}`}><x.icon className="w-[18px] h-[18px]" /></span>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold">{x.n} {x.n === 1 ? x.one : (x.many || `${x.one}s`)}</p>
                  <p className="text-xs text-muted-foreground">{x.sub}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-[20px] bg-secondary/20 border border-dashed border-border px-4 py-3.5">
            <span className="w-10 h-10 rounded-xl grid place-items-center bg-emerald-500/15 text-emerald-300 flex-shrink-0"><Check className="w-[18px] h-[18px]" /></span>
            <div>
              <p className="text-[15px] font-semibold">You&apos;re all caught up</p>
              <p className="text-xs text-muted-foreground">Invites and requests will show up here</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PlanCard({ event, isHosting, friendsGoing, attendeeCount }) {
  const meta = [time12(event.start_time), event.venue_name].filter(Boolean).join(" · ");
  const names = friendNames(friendsGoing);
  const social = isHosting
    ? `${attendeeCount} going`
    : names ? `${names}${friendsGoing.length > 2 ? ` friend${friendsGoing.length === 3 ? "" : "s"}` : ""}` : attendeeCount ? `${attendeeCount} going` : "";

  return (
    <Link to={isHosting ? `/event/${event.id}` : `/pass/${event.id}`} className="block relative rounded-[28px] p-[2px] overflow-hidden active:scale-[0.99] transition-transform">
      <CometBorder />
      <div className="relative rounded-[26px] overflow-hidden aspect-[4/5] bg-card">
        <CoverArt event={event} />
        <div className="absolute top-4 left-4 flex items-center gap-2">
          <span className="rounded-full bg-white text-black text-xs font-bold px-3 py-1">{whenLabel(event.date)}</span>
          <span className="rounded-full bg-black/50 backdrop-blur text-xs font-semibold text-white px-3 py-1 border border-white/15">
            {isHosting ? "Host" : "You're going"}
          </span>
        </div>
        <div className="absolute bottom-0 inset-x-0 p-5">
          <h2 className="font-heading font-bold text-[28px] leading-tight text-white line-clamp-2">{event.title}</h2>
          {meta && <p className="text-sm text-white/70 mt-1 truncate">{meta}</p>}
          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              {!isHosting && <Faces friends={friendsGoing} />}
              {social && <span className="text-xs text-white/75 truncate">{social}</span>}
            </div>
            <span className="rounded-full bg-white text-black text-[13px] font-bold px-4 py-2 flex-shrink-0">
              {isHosting ? "Manage" : "Your pass"}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

// No ticket and not hosting: the soonest upcoming event on Discover, with a
// way out to everything else that's on.
function SuggestedCard({ suggested }) {
  const { event, fromPriceMinor } = suggested;
  const friends = suggested.friendsGoing ?? [];
  const count = suggested.attendeeCount ?? 0;
  const meta = [time12(event.start_time), event.venue_name].filter(Boolean).join(" · ");
  const names = friendNames(friends);
  const social = names ? `${names} going` : count ? `${count} going` : "";
  const price = !event.is_paid ? "Free"
    : fromPriceMinor != null ? `From ${formatMoney(fromPriceMinor, event.currency).replace(/\.00$/, "")}` : null;
  const cta = event.is_paid ? "Get tickets" : event.is_public ? "Get on the list" : "Request to join";

  return (
    <>
      <Link to={`/event/${event.id}`} className="block relative rounded-[28px] p-[2px] overflow-hidden active:scale-[0.99] transition-transform">
        <CometBorder from="#fbbf24" to="#f472b6" />
        <div className="relative rounded-[26px] overflow-hidden aspect-[4/5] bg-card">
          <CoverArt event={event} />
          <div className="absolute top-4 inset-x-4 flex items-center justify-between gap-2">
            <span className="rounded-full bg-white text-black text-xs font-bold px-3 py-1">{whenLabel(event.date)}</span>
            {price && (
              <span className="rounded-full bg-black/50 backdrop-blur text-xs font-semibold text-white px-3 py-1 border border-white/15 flex-shrink-0">{price}</span>
            )}
          </div>
          <div className="absolute bottom-0 inset-x-0 p-5">
            <h2 className="font-heading font-bold text-[28px] leading-tight text-white line-clamp-2">{event.title}</h2>
            {meta && <p className="text-sm text-white/70 mt-1 truncate">{meta}</p>}
            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Faces friends={friends} max={2} />
                {social && <span className="text-xs text-white/75 truncate">{social}</span>}
              </div>
              <span className="rounded-full bg-white text-black text-[13px] font-bold px-4 py-2 flex-shrink-0">{cta}</span>
            </div>
          </div>
        </div>
      </Link>
      <Link to="/guest?tab=discover" className="mt-2.5 flex items-center justify-center gap-1 text-[13px] text-muted-foreground">
        Not your thing? <span className="text-foreground font-semibold">See what else is on</span>
        <ChevronRight className="w-3.5 h-3.5" />
      </Link>
    </>
  );
}

function BigTile({ to, icon: Icon, title, sub, bg, badge = 0, badgeTone = "" }) {
  return (
    <Link to={to} className={`relative rounded-[22px] overflow-hidden h-[120px] p-4 flex flex-col justify-between bg-gradient-to-br ${bg} text-white active:scale-[0.98] transition-transform shadow-lg shadow-black/30`}>
      <Icon className="w-[26px] h-[26px]" strokeWidth={2.2} />
      {badge > 0 && (
        <span className={`absolute top-3.5 right-3.5 min-w-6 h-6 px-1.5 rounded-full bg-white text-xs font-bold grid place-items-center ${badgeTone}`}>
          {badge > 9 ? "9+" : badge}
        </span>
      )}
      <div>
        <p className="font-heading font-bold text-lg leading-tight">{title}</p>
        <p className="text-xs text-white/85">{sub}</p>
      </div>
    </Link>
  );
}
