import { Link, useNavigate } from "react-router-dom";
import moment from "moment";
import {
  ArrowLeft, Eye, Users, ScanLine, Share2, Check, Pencil, BarChart3, Megaphone, Plus, X, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import StatusBadge from "./StatusBadge";
import EventCountdown from "./EventCountdown";
import CoHostsSection from "./CoHostsSection";
import LineupSection from "./LineupSection";
import EventChat from "./EventChat";
import UserEmailField from "./UserEmailField";
import { coverStyleFor } from "@/lib/eventCover";

// What a host (or co-host / business manager) sees when they open their own
// event: a control panel instead of the public page. Header with status, a
// publish card for drafts, numbers at a glance, shortcuts, the team (co-hosts
// and door staff), lineup and chat. "View as guest" shows the public page.
// All data and handlers come from EventDetails, which owns loading and writes.
export default function HostEventView({
  event, id, user, stats, staff, isHost, isCoHost, stripeActive,
  publishing, onPublish, onShare, copied,
  newStaffEmail, setNewStaffEmail, addingStaff, onAddStaff, onRemoveStaff,
  onGuestView, onUpdated,
}) {
  const navigate = useNavigate();
  const coverStyle = coverStyleFor(event.cover_image);
  const coverImg = event.cover_image && !event.cover_image.startsWith("__cover__") ? event.cover_image : null;
  const going = stats.approved;
  const ringPct = event.capacity ? Math.min(1, going / event.capacity) : (going ? stats.checked_in / going : 0);
  const R = 42;
  const CIRC = 2 * Math.PI * R;
  const when = [
    moment(event.date).format("ddd D MMM"),
    event.start_time ? moment(event.start_time, "HH:mm").format("h:mma") : null,
    event.venue_name || null,
  ].filter(Boolean).join(" · ");

  const tiles = [
    { to: `/event/${id}/guestlist`, label: "Guestlist", icon: Users, tone: "bg-violet-500/15 text-violet-300", badge: stats.requested },
    { to: `/event/${id}/door`, label: "Door", icon: ScanLine, tone: "bg-emerald-500/15 text-emerald-300" },
    { onClick: onShare, label: copied ? "Copied" : "Share", icon: copied ? Check : Share2, tone: "bg-sky-500/15 text-sky-300" },
    { to: `/event/${id}/edit`, state: { from: "event" }, label: "Edit", icon: Pencil, tone: "bg-white/10 text-foreground/85" },
    ...(event.is_paid ? [
      { to: `/event/${id}/analytics`, label: "Analytics", icon: BarChart3, tone: "bg-fuchsia-500/15 text-fuchsia-300" },
      { to: `/event/${id}/promoters`, label: "Promoters", icon: Megaphone, tone: "bg-amber-500/15 text-amber-300" },
    ] : []),
  ];

  return (
    <div className="max-w-lg mx-auto pb-10">
      {/* Header: blurred cover backdrop, crisp cover, status and title */}
      <div className="relative">
        <div className="absolute inset-x-0 top-0 h-[250px] overflow-hidden"
          style={{ WebkitMaskImage: "linear-gradient(to bottom, #000 50%, transparent)", maskImage: "linear-gradient(to bottom, #000 50%, transparent)" }}>
          {coverImg
            ? <img src={coverImg} alt="" className="absolute inset-0 w-full h-full object-cover animate-drift motion-reduce:animate-none [filter:blur(28px)_saturate(1.4)]" />
            : <div className="absolute inset-0 animate-drift motion-reduce:animate-none [filter:blur(28px)]" style={coverStyle || undefined} />}
          <div className="absolute inset-0 bg-black/45" />
        </div>
        <div className="relative flex items-center justify-between px-4 pt-4">
          <button type="button" onClick={() => navigate(-1)} aria-label="Back"
            className="w-10 h-10 rounded-full bg-black/35 backdrop-blur-md border border-white/15 grid place-items-center text-white">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <button type="button" onClick={onGuestView}
            className="h-10 px-4 rounded-full bg-black/35 backdrop-blur-md border border-white/15 inline-flex items-center gap-2 text-[13px] font-semibold text-white">
            <Eye className="w-4 h-4" /> View as guest
          </button>
        </div>
        <div className="relative flex items-center gap-4 px-5 pt-6">
          <div className="relative w-[88px] h-[88px] rounded-2xl overflow-hidden border-2 border-white/80 shadow-2xl flex-shrink-0 bg-card"
            style={!coverImg && coverStyle ? coverStyle : undefined}>
            {coverImg && <img src={coverImg} alt="" className="absolute inset-0 w-full h-full object-cover" />}
          </div>
          <div className="min-w-0">
            {event.status === "draft" ? (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wider uppercase text-amber-300 bg-amber-500/15 border border-amber-500/30 rounded-full px-2 py-0.5">
                Draft · Only you
              </span>
            ) : event.status === "published" ? (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wider uppercase text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 rounded-full px-2 py-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse motion-reduce:animate-none" />
                Live · {event.is_public ? "Public" : "Private"}
              </span>
            ) : (
              <StatusBadge status={event.status} />
            )}
            <h1 className="mt-1.5 font-heading font-bold text-[24px] leading-tight text-white break-words">{event.title}</h1>
            <p className="text-[13px] text-white/65">{when}</p>
          </div>
        </div>
      </div>

      <div className="px-4 space-y-5 mt-5">
        {/* Draft: publish first */}
        {event.status === "draft" && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
            <p className="text-[15px] font-semibold">Ready to go live?</p>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              Only you can see this event. Publishing {event.is_public ? "makes it public and shows it on Discover" : "makes it live and shareable by link"}. You can change this any time in Edit.
            </p>
            {event.is_paid && !stripeActive && (
              <p className="text-xs text-amber-300/90 mt-2">Paid event: connect Stripe under Payouts &amp; Earnings before publishing.</p>
            )}
            <Button className="mt-3 w-full h-12 rounded-xl font-heading font-bold text-base shadow-lg shadow-primary/30"
              disabled={publishing} onClick={onPublish}>
              {publishing ? "Publishing…" : "Publish event"}
            </Button>
          </div>
        )}

        {/* At a glance */}
        <div className="rounded-[20px] bg-secondary/40 border border-border/60 p-4">
          <div className="flex items-center gap-4">
            <div className="relative w-[92px] h-[92px] flex-shrink-0">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90" aria-hidden="true">
                <defs>
                  <linearGradient id="host-ring" x1="0" x2="1">
                    <stop offset="0" stopColor="#c084fc" /><stop offset="1" stopColor="#22d3ee" />
                  </linearGradient>
                </defs>
                <circle cx="50" cy="50" r={R} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="10" />
                <circle cx="50" cy="50" r={R} fill="none" stroke="url(#host-ring)" strokeWidth="10" strokeLinecap="round"
                  strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - ringPct)} className="transition-[stroke-dashoffset] duration-700" />
              </svg>
              <div className="absolute inset-0 grid place-items-center text-center">
                <div>
                  <p className="font-heading font-bold text-[24px] leading-none">{event.capacity ? going : stats.checked_in}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{event.capacity ? `of ${event.capacity}` : `of ${going} in`}</p>
                </div>
              </div>
            </div>
            <div className="flex-1 grid grid-cols-2 gap-y-3 gap-x-2">
              <Stat value={going} label="Going" />
              <Stat value={stats.checked_in} label="Checked in" tone="text-cyan-300" />
              <Stat value={stats.invited} label="Invited" tone="text-sky-300" />
              <Stat value={stats.requested} label="Requests" tone="text-amber-300" />
            </div>
          </div>
        </div>
        <EventCountdown event={event} />

        {/* Shortcuts */}
        <div className="grid grid-cols-3 gap-2.5">
          {tiles.map((t) => {
            const Icon = t.icon;
            const body = (
              <>
                {t.badge > 0 && (
                  <span className="absolute top-2 right-2 min-w-5 h-5 px-1.5 rounded-full bg-amber-400 text-amber-950 text-[11px] font-bold grid place-items-center">{t.badge}</span>
                )}
                <span className={`w-[38px] h-[38px] rounded-xl grid place-items-center ${t.tone}`}><Icon className="w-5 h-5" /></span>
                {t.label}
              </>
            );
            const cls = "relative flex flex-col items-center justify-center gap-2 h-[88px] rounded-[18px] bg-secondary/40 border border-border/60 text-[13px] font-semibold hover:bg-secondary/70 active:scale-[0.98] transition";
            return t.to
              ? <Link key={t.label} to={t.to} state={t.state} className={cls}>{body}</Link>
              : <button key={t.label} type="button" onClick={t.onClick} className={cls}>{body}</button>;
          })}
        </div>

        {/* Team */}
        <Section title="Team">
          <div className="rounded-[20px] bg-secondary/40 border border-border/60 divide-y divide-border/60">
            <div className="p-4"><CoHostsSection event={event} onUpdated={onUpdated} /></div>
            <div className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">Door staff</p>
                  <p className="text-xs text-muted-foreground">Give your doormen this code to join</p>
                </div>
                {event.staff_code && (
                  <span className="rounded-xl bg-emerald-500/15 border border-emerald-500/30 px-3 py-1.5 font-heading font-bold text-xl tracking-[0.25em] text-emerald-200">
                    {event.staff_code}
                  </span>
                )}
              </div>
              {staff.length > 0 && (
                <div className="mt-3 space-y-2">
                  {staff.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 rounded-xl bg-background/50 px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium truncate">{s.staff_email}</p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.role}</p>
                      </div>
                      <button type="button" onClick={() => onRemoveStaff(s.id)} aria-label={`Remove ${s.staff_email}`}
                        className="text-muted-foreground hover:text-destructive p-1"><X className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 flex gap-2">
                <UserEmailField
                  value={newStaffEmail}
                  onChange={setNewStaffEmail}
                  onPick={(em) => onAddStaff(em)}
                  onEnter={() => onAddStaff()}
                  exclude={staff.map((s) => s.staff_email)}
                  placeholder="Add a doorman by name, email or phone"
                  className="w-full h-11 px-3 text-sm bg-background/50 border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <Button size="icon" className="h-11 w-11 rounded-xl flex-shrink-0" onClick={() => onAddStaff()} disabled={addingStaff} aria-label="Add doorman">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </Section>

        {/* Lineup */}
        <div className="rounded-[20px] bg-secondary/40 border border-border/60 p-4">
          <LineupSection event={event} onUpdated={onUpdated} />
        </div>

        {/* Chat */}
        <div className="rounded-[20px] bg-secondary/40 border border-border/60 p-4">
          <EventChat eventId={id} user={user} canPost={isHost || isCoHost}
            hostIsBusiness={event.host_is_business} businessName={event.host_name} businessPicture={event.host_picture} />
        </div>

        {/* The public page */}
        <button type="button" onClick={onGuestView}
          className="w-full flex items-center gap-3 rounded-[20px] bg-secondary/40 border border-border/60 px-4 py-4 text-left hover:bg-secondary/60 transition-colors">
          <span className="w-[38px] h-[38px] rounded-xl grid place-items-center bg-white/10"><Eye className="w-[18px] h-[18px]" /></span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold">See it as guests do</span>
            <span className="block text-xs text-muted-foreground">Details, about, lineup and tickets</span>
          </span>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}

function Stat({ value, label, tone = "" }) {
  return (
    <div>
      <p className={`font-heading font-bold text-[20px] leading-none ${tone}`}>{value}</p>
      <p className="text-[11px] text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <h2 className="font-heading font-semibold text-[17px] px-1 mb-2.5">{title}</h2>
      {children}
    </div>
  );
}
