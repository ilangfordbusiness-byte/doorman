import { currencySymbol } from "@/lib/money";
import { useState, useEffect } from "react";
import ShimmerText from "../components/ShimmerText";
import LoadingSpinner from "../components/LoadingSpinner";
import { normalizePhone, formatPhoneDisplay } from "@/lib/phone";
import { isOwnEntry } from "@/lib/ownEntry";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/api/data";
import { shareUrl, isNative, openInAppBrowser } from "@/lib/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { tierSoldOut, tierScheduled, nextTierRelease, tierRemaining } from "@/lib/tiers";
import { useStripeStatus } from "@/hooks/useStripeStatus";
import { useBusinessStripeStatus } from "@/hooks/useBusinessStripeStatus";
import {
  ArrowLeft, Calendar, MapPin, Shirt, Share2,
  QrCode, Check, ChevronRight, Info
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import StatusBadge from "../components/StatusBadge";
import WhoIsGoing from "../components/WhoIsGoing";
import EventChat from "../components/EventChat";
import UserAvatar from "../components/UserAvatar";
import Avatar from "../components/Avatar";
import HostProfileModal from "../components/HostProfileModal";
import SafetyActions from "../components/SafetyActions";
import FitText from "../components/FitText";
import { lineupStyle } from "@/lib/lineupStyles";
import EventJoinActions from "../components/EventJoinActions";
import { captureRef, getLinkDomain, discountLabel, promoterDiscountActive } from "@/lib/promoterRef";
import { withPreviewVersion } from "@/lib/appUrl";
import { SignedOutTopBar, SignupBar } from "@/components/SignedOutPreview";
import { queryClientInstance } from "@/lib/query-client";
import HostEventView from "@/components/HostEventView";
import EventCountdownCard from "@/components/EventCountdownCard";
import SocialLinks from "@/components/profile/SocialLinks";
import { coverStyleFor } from "@/lib/eventCover";
import { downloadIcs, googleCalendarUrl, mapsUrl, eventSpan, isIOS } from "@/lib/calendar";
import { eventLongDate, eventTimeRange, longDateTime, time12 } from "@/lib/eventDates";
import { loadPixel, trackPixel, captureMetaClick } from "@/lib/metaPixel";

async function loadEvent(id, authed, inviteCode) {
  // Signed-out visitors get a read-only preview (see below); signed-in users
  // get the full page (guestlist, their pass, manager tools…).
  if (!authed) return loadEventPreview(id, inviteCode);
  // Everything here only needs the event id, so it's fetched in one parallel
  // round instead of three in a row. The profile comes from the shared cache
  // (seeded at sign-in) when it's there.
  const [me, events, entries, staffList, tierList] = await Promise.all([
    queryClientInstance.ensureQueryData({ queryKey: ["currentUser"], queryFn: () => api.auth.me() }),
    api.entities.Event.filter({ id }),
    api.entities.GuestlistEntry.filter({ event_id: id }),
    api.entities.EventStaff.filter({ event_id: id }),
    api.entities.TicketTier.filter({ event_id: id }).catch(() => []),
  ]);
  if (!events.length) return { notFound: true };
  let evt = events[0];

  if (!evt.staff_code && evt.can_manage) {
    const code = String(Math.floor(1000 + Math.random() * 9000));
    await api.entities.Event.update(id, { staff_code: code });
    evt = { ...evt, staff_code: code };
  }

  // Door tiers are hidden from the public event page — they're sold only via
  // the scanner's door QR. RLS already hides them from everyone except this
  // event's managers, so drop them here too (a host must never see their own
  // door tier listed in the public ticket block).
  const publicTiers = tierList.filter((t) => !t.door_only);
  // A guest can hold several tickets (multi-quantity purchases); surface a
  // usable one ahead of an already-used one.
  const entryRank = (s) => (["approved", "invited"].includes(s) ? 0 : s === "checked_in" ? 1 : 2);
  // Match the viewer's own entry the same way the Guest tab does (by account,
  // or email ignoring case) — managers/admins load the whole guestlist here.
  const mine = entries
    .filter((e) => isOwnEntry(e, me))
    .sort((a, b) => entryRank(a.status) - entryRank(b.status))[0];
  publicTiers.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  return {
    notFound: false,
    event: evt,
    user: me,
    myEntry: mine,
    stats: {
      total: entries.length,
      invited: entries.filter((e) => e.status === "invited").length,
      approved: entries.filter((e) => ["approved", "checked_in"].includes(e.status)).length,
      checked_in: entries.filter((e) => e.status === "checked_in").length,
      requested: entries.filter((e) => e.status === "requested").length,
    },
    staff: staffList,
    tiers: publicTiers,
  };
}

// Read-only preview shown to a signed-out visitor who opens a shared link.
// Only PUBLIC published events open this way (private events preview through
// their invite link). Host/DJ/co-host come from the anon-readable people RPC
// since those relations are otherwise hidden from logged-out users.
async function loadEventPreview(id, inviteCode) {
  // Signed-out, full-page preview. The event's base columns are anon-readable by
  // id (published events, public or private). Host / DJ / co-host come from the
  // people RPC for public events, or from the invite RPC — authorised by the
  // event's secret invite code — for private ones. No embeds (anon can't read
  // profiles). A private event with no/invalid code falls to the sign-in prompt.
  const base = await api.entities.Event.previewBase(id);
  if (!base || base.status !== "published") return { preview: true, locked: true };

  let people = null;
  if (base.is_public) {
    people = await api.entities.Event.people(id).catch(() => null);
  } else {
    if (!inviteCode) return { preview: true, locked: true };
    const [inv] = await api.entities.Event.filter({ invite_code: inviteCode }).catch(() => []);
    if (!inv || inv.id !== id) return { preview: true, locked: true };
    people = {
      host_is_business: inv.host_is_business,
      host_name: inv.host_name,
      host_picture: inv.host_picture,
      host_email: inv.host_email,
      dj_lineup: inv.dj_lineup || [],
      co_hosts: inv.co_hosts || [],
    };
  }

  const event = people
    ? {
        ...base,
        ...people,
        co_host_emails: (people.co_hosts || [])
          .filter((c) => c.status === "accepted")
          .map((c) => c.email),
      }
    : base;
  const tierList = await api.entities.TicketTier.filter({ event_id: id }).catch(() => []);
  const publicTiers = tierList
    .filter((t) => !t.door_only)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  return {
    notFound: false,
    preview: true,
    event,
    user: null,
    myEntry: null,
    stats: { total: 0, invited: 0, approved: 0, checked_in: 0 },
    staff: [],
    tiers: publicTiers,
  };
}

export default function EventDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  // A private event opened from its invite link redirects here as
  // /event/:id?invite=<code>; the code authorises the signed-out preview.
  const [searchParams] = useSearchParams();
  const inviteCode = searchParams.get("invite");
  // null while we check for a session; the query waits for this so a logged-out
  // visitor loads the preview path rather than briefly trying the full page.
  const [authed, setAuthed] = useState(null);
  useEffect(() => {
    let alive = true;
    api.auth.isAuthenticated()
      .then((ok) => { if (alive) setAuthed(ok); })
      .catch(() => { if (alive) setAuthed(false); });
    return () => { alive = false; };
  }, []);
  const { data, isLoading: loading, isError } = useQuery({
    queryKey: ["event", id, authed, inviteCode],
    queryFn: () => loadEvent(id, authed, inviteCode),
    enabled: authed !== null,
    staleTime: 30 * 1000,
  });

  const event = data?.event ?? null;
  const user = data?.user ?? null;
  // Signed-out preview: anything that needs an account sends the visitor to
  // sign up, then straight back to this event.
  const promptSignup = () => api.auth.redirectToLogin(window.location.href);
  const myEntry = data?.myEntry ?? null;
  const stats = data?.stats ?? { invited: 0, approved: 0, checked_in: 0, total: 0, requested: 0 };
  const staff = data?.staff ?? [];
  const tiers = data?.tiers ?? [];
  // Nothing buyable right now → the CTA says why. A scheduled tier is not
  // sold out, so "On sale from …" wins over "Sold Out" whenever one is coming;
  // both revert automatically when a tier reopens or its release time passes.
  const nothingOnSale = !!event?.is_paid && tiers.length > 0
    && tiers.every((t) => tierScheduled(t) || tierSoldOut(t));
  const onSaleFrom = nothingOnSale ? nextTierRelease(tiers) : null;
  const allSoldOut = nothingOnSale && !onSaleFrom;
  const loadError = data?.notFound
    ? "This event is no longer available or the link is invalid."
    : isError
    ? "Something went wrong loading this event. Please try again."
    : null;

  const [copied, setCopied] = useState(false);
  // Managers land on the host view; this shows them the public page instead.
  const [guestView, setGuestView] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [newStaffEmail, setNewStaffEmail] = useState("");
  const [addingStaff, setAddingStaff] = useState(false);
  const [refStatus, setRefStatus] = useState(null);
  const [showHostModal, setShowHostModal] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [publishing, setPublishing] = useState(false);

  async function handlePublish() {
    if (event.is_paid && !stripeActive) {
      toast({
        title: "Connect Stripe to publish a paid event",
        description: "Finish payouts setup under Payouts & Earnings, then publish.",
        variant: "destructive",
      });
      return;
    }
    setPublishing(true);
    try {
      await api.entities.Event.update(id, { status: "published" });
      queryClient.invalidateQueries({ queryKey: ["event", id] });
      toast({ title: "Event published!", description: event.is_public ? "It's now public and discoverable." : "It's live — share the link to invite people." });
    } catch (e) {
      toast({ title: e?.message || "Couldn't publish", variant: "destructive" });
    }
    setPublishing(false);
  }

  const isHost = user && event && event.host_email === user.email;
  const coHosts = event ? (Array.isArray(event.co_hosts) ? event.co_hosts : []) : [];
  const acceptedCoHosts = coHosts.filter((c) => c.status === "accepted");
  const isCoHost = user && coHosts.some((c) => c.email === user.email && c.status === "accepted");
  const canManage = event?.can_manage || isHost || isCoHost;
  // Publishing a paid event needs payouts-enabled Stripe on the right account
  // (the business's for a business event, else the host's) — same rule as create.
  // Only managers of a paid event use it, so nobody else pays for the
  // edge-function round trips (they ran for every viewer, signed-out too).
  const needsStripe = !!canManage && !!event?.is_paid;
  const { active: personalStripeActive } = useStripeStatus(needsStripe && !event?.business_id);
  const { active: bizStripeActive } = useBusinessStripeStatus(needsStripe ? event?.business_id : null);
  const stripeActive = event?.business_id ? bizStripeActive : personalStripeActive;
  const myCoHostInvite = user ? coHosts.find((c) => c.email === user.email && c.status === "pending") : null;
  const hostId = event?.host_id;
  const { data: hostBlocked = false } = useQuery({
    queryKey: ["blocked", hostId],
    queryFn: () => api.safety.isBlocked(hostId),
    enabled: !!hostId && !canManage && !!user,
  });

  async function handleUnblockHost() {
    try {
      await api.safety.unblock(hostId);
      queryClient.invalidateQueries();
      toast({ title: `${event.host_name || "Host"} unblocked` });
    } catch (e) {
      toast({ title: e?.message || "Couldn't unblock", variant: "destructive" });
    }
  }

  async function handleAcceptCoHost() {
    setAccepting(true);
    try {
      await api.functions.invoke("acceptCoHost", { event_id: id });
      await queryClient.invalidateQueries(["event", id]);
      toast({ title: "You're now a co-host!" });
    } catch (e) {
      toast({ title: e?.message || "Could not accept", variant: "destructive" });
    }
    setAccepting(false);
  }

  // Organiser ad tracking: remember an ad click id (?fbclid) as soon as we
  // land, then load the business's own Meta Pixel, only on its events.
  useEffect(() => { captureMetaClick(); }, [id]);
  useEffect(() => {
    if (!event?.meta_pixel_id) return;
    loadPixel(event.meta_pixel_id);
    trackPixel(event.meta_pixel_id, "ViewContent", {
      content_ids: [event.id], content_type: "product", content_name: event.title,
    });
  }, [event?.id, event?.meta_pixel_id]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get("payment");
    if (payment === "success") {
      toast({ title: "Payment successful!", description: "Your ticket is being issued — refresh in a moment for your QR pass." });
    } else if (payment === "cancelled") {
      toast({ title: "Payment cancelled", variant: "destructive" });
    }
    if (payment) {
      window.history.replaceState({}, "", window.location.pathname);
    }
    const ref = params.get("ref");
    if (ref) {
      captureRef(id, ref)
        .then((res) => setRefStatus(res.valid ? { valid: true, name: res.promoter?.name, promoter: res.promoter } : { valid: false }))
        .catch(() => setRefStatus({ valid: false }));
    }
  }, [id]);

  async function handleAddStaff(override) {
    const val = String(override ?? newStaffEmail).trim();
    if (!val) return;
    setAddingStaff(true);
    const isPhone = /^[\+\d][\d\s\-().]{5,}$/.test(val);
    const phone = isPhone ? normalizePhone(val) : "";
    await api.entities.EventStaff.create({
      event_id: id,
      staff_email: isPhone ? "" : val.toLowerCase(),
      staff_phone: phone,
      staff_name: isPhone ? formatPhoneDisplay(phone) : val,
      role: "doorman",
    });
    queryClient.invalidateQueries(["event", id]);
    setNewStaffEmail("");
    setAddingStaff(false);
    toast({ title: "Staff added!" });
  }

  async function handleRemoveStaff(staffId) {
    await api.entities.EventStaff.delete(staffId);
    queryClient.invalidateQueries(["event", id]);
  }

  async function handleShare() {
    // Public events share the event page itself (recipients can scroll down and
    // buy a ticket). Private events aren't reachable without an invite, so they
    // keep the invite link. No promotional text — just the title + link.
    // A manager has the real invite_code; a signed-out previewer arrived with
    // it in the URL (?invite=) — use whichever we have for a private event.
    const code = event.invite_code || inviteCode;
    // Versioned by what the link card shows, so an edited event gets a fresh
    // preview in chat apps instead of their cached one.
    const url = withPreviewVersion(event.is_public
      ? `${getLinkDomain()}/event/${event.id}`
      : `${getLinkDomain()}/invite/${code}`, event.title, event.cover_image, event.description);
    // Native share sheet in the iOS app, Web Share API elsewhere, clipboard
    // as the last resort (see shareUrl).
    const result = await shareUrl({ title: event.title, url });
    if (result !== "copied") return;
    setCopied(true);
    toast({ title: "Link copied!" });
    setTimeout(() => setCopied(false), 2000);
  }

  if (authed === null || loading) return <LoadingSpinner fullScreen />;

  // Signed-out visitor opened a private / not-yet-public event by id: there's
  // nothing to preview, so point them at sign-in (or their invite link).
  if (data?.locked) return (
    <div className="max-w-lg mx-auto px-4 pt-20 text-center">
      <h2 className="font-heading font-bold text-lg mb-2">Sign in to view this event</h2>
      <p className="text-sm text-muted-foreground mb-6">This event is private or not public yet. Sign in to see it, or open it from your invite link.</p>
      <Button onClick={() => api.auth.redirectToLogin(window.location.href)}>Sign in</Button>
    </div>
  );

  if (loadError) return (
    <div className="max-w-lg mx-auto px-4 pt-20 text-center">
      <h2 className="font-heading font-bold text-lg mb-2">Event not found</h2>
      <p className="text-sm text-muted-foreground mb-6">{loadError}</p>
      <Button onClick={() => navigate("/guest")}>Browse events</Button>
    </div>
  );

  if (!event) return null;

  const sym = currencySymbol(event.currency);

  if (canManage && !guestView) {
    return (
      <HostEventView
        event={event} id={id} user={user} stats={stats} staff={staff}
        isHost={isHost} isCoHost={isCoHost} stripeActive={stripeActive}
        publishing={publishing} onPublish={handlePublish} onShare={handleShare} copied={copied}
        newStaffEmail={newStaffEmail} setNewStaffEmail={setNewStaffEmail} addingStaff={addingStaff}
        onAddStaff={handleAddStaff} onRemoveStaff={handleRemoveStaff}
        onGuestView={() => { setGuestView(true); window.scrollTo(0, 0); }}
        onUpdated={() => queryClient.invalidateQueries(["event", id])}
      />
    );
  }

  const signedOut = authed === false;
  const shareButton = (
    <Button variant="ghost" size="icon" className="rounded-full bg-card/60 backdrop-blur-sm" onClick={handleShare} aria-label="Share">
      {copied ? <Check className="w-5 h-5 text-emerald-400" /> : <Share2 className="w-5 h-5" />}
    </Button>
  );

  // Pinned bar for signed-in guests: what to do next, by state. The button
  // scrolls to the real join/buy controls (EventJoinActions), so every path
  // (tiers, promo codes, invites, waitlists) keeps its existing logic.
  const status = myEntry?.status;
  const eventOver = (() => { const end = eventSpan(event)?.end; return end != null && Date.now() > end; })();
  const buyable = tiers.filter((t) => !tierScheduled(t) && !tierSoldOut(t));
  const fromPrice = buyable.length ? Math.min(...buyable.map((t) => Number(t.price) || 0)) : null;
  const scrollToJoin = () => document.getElementById("join")?.scrollIntoView({ behavior: "smooth", block: "center" });
  const openHost = () => (event.host_is_business && event.business_id ? navigate(`/b/${event.business_id}`) : setShowHostModal(true));
  let bar = null;
  if (user && !canManage && !hostBlocked && !eventOver && status !== "denied") {
    if (status === "approved" || status === "checked_in") {
      bar = { title: status === "checked_in" ? "You're checked in ✓" : "You're going ✓", tone: "text-emerald-300",
        sub: eventTimeRange(event) ? `Doors ${time12(event.start_time)}` : "", action: { label: "View pass", to: `/pass/${id}`, light: true } };
    } else if (status === "invited") {
      bar = { title: "You're invited", tone: "text-sky-300", sub: "Accept to get your pass", action: { label: "Respond", onClick: scrollToJoin } };
    } else if (status === "requested") {
      bar = { title: "Request sent", tone: "text-amber-300", sub: "The host will review your request" };
    } else if (event.is_paid && onSaleFrom) {
      bar = { title: "Tickets on sale soon", tone: "text-sky-300", sub: longDateTime(onSaleFrom), action: { label: "＋ Calendar", onClick: () => addToCalendar(), subtle: true } };
    } else if (allSoldOut) {
      bar = { title: "Sold out", tone: "text-rose-300", sub: `Follow ${event.host_name || "the host"} for the next one`, action: { label: "See host", onClick: openHost, subtle: true } };
    } else if (event.is_paid) {
      bar = { kicker: "From", price: fromPrice != null ? `${sym}${fmtPrice(fromPrice)}` : "", action: { label: "Get tickets", onClick: scrollToJoin } };
    } else {
      bar = { kicker: "Free", price: "Free entry", action: { label: event.is_public ? "Join" : "Request to join", onClick: scrollToJoin } };
    }
  }
  const barBottom = user?.active_business_id ? "bottom-0" : "bottom-[calc(52px+env(safe-area-inset-bottom))]";

  function addToCalendar() {
    const url = `${getLinkDomain()}/event/${id}`;
    // iPhone (web or app): a real HTTPS .ics opens Calendar's "Add event"
    // sheet; the server can only build it for public published events.
    if (isIOS() && event.is_public && event.status === "published") {
      openInAppBrowser(`${getLinkDomain()}/api/ics?id=${id}`);
      return;
    }
    if (isNative()) {
      const g = googleCalendarUrl(event, url);
      if (g) openInAppBrowser(g);
      return;
    }
    if (!downloadIcs(event, url)) toast({ title: "This event has no date yet", variant: "destructive" });
  }

  const coverStyle = coverStyleFor(event.cover_image);
  const coverImg = event.cover_image && !event.cover_image.startsWith("__cover__") ? event.cover_image : null;
  const maps = mapsUrl(event);
  const soldOutTiers = tiers.filter((t) => !tierScheduled(t) && tierSoldOut(t));
  const liveTiers = tiers.filter((t) => !soldOutTiers.includes(t));
  const longAbout = (event.description || "").length > 220;
  const chip = event.status !== "published" ? null
    : event.is_paid && onSaleFrom ? { l: "On sale soon", c: "text-sky-300 bg-sky-500/15 border-sky-500/30" }
    : allSoldOut ? { l: "Sold out", c: "text-rose-300 bg-rose-500/15 border-rose-500/30" }
    : event.is_paid ? { l: "Tickets on sale", c: "text-emerald-300 bg-emerald-500/15 border-emerald-500/30" }
    : null;

  return (
    <div className={`max-w-lg mx-auto ${signedOut ? "pb-28" : bar ? "pb-32" : "pb-8"}`}>
      {/* Cover: blurred backdrop + the poster, near full width, in its own shape */}
      <div className="relative">
        <div className="absolute inset-x-0 top-0 h-[460px] overflow-hidden pointer-events-none"
          style={{ WebkitMaskImage: "linear-gradient(to bottom, #000 55%, transparent)", maskImage: "linear-gradient(to bottom, #000 55%, transparent)" }}>
          {coverImg
            ? <img src={coverImg} alt="" className="absolute inset-0 w-full h-full object-cover animate-drift motion-reduce:animate-none [filter:blur(30px)_saturate(1.5)]" />
            : <div className="absolute inset-0 [filter:blur(30px)]" style={coverStyle || undefined} />}
          <div className="absolute inset-0 bg-black/40" />
        </div>
        <div className="relative flex items-center justify-between px-4 pt-4">
          {signedOut ? <SignedOutTopBar extra={shareButton} /> : (
            <>
              <Button variant="ghost" size="icon" className="rounded-full bg-black/35 backdrop-blur-md border border-white/15 text-white" onClick={() => navigate(-1)} aria-label="Back">
                <ArrowLeft className="w-5 h-5" />
              </Button>
              {shareButton}
            </>
          )}
        </div>
        <div className="relative px-3 pt-3">
          {coverImg ? (
            <img src={coverImg} alt={event.title} className="w-full h-auto rounded-[24px] shadow-[0_30px_60px_-20px_rgba(0,0,0,.9)] border border-white/10" />
          ) : (
            <div className="w-full aspect-square rounded-[24px] shadow-[0_30px_60px_-20px_rgba(0,0,0,.9)] border border-white/10 flex items-end p-6"
              style={coverStyle || undefined}>
              <p className="font-heading font-bold text-3xl text-white drop-shadow-lg">{event.title}</p>
            </div>
          )}
        </div>
      </div>

      <div className="px-4 pt-5 relative z-10 space-y-5">
        {/* Title */}
        <div className="px-1">
          {(chip || event.status !== "published") && (
            <div className="flex items-center gap-2 mb-2">
              {event.status !== "published" && <StatusBadge status={event.status} />}
              {chip && <span className={`text-[11px] font-bold uppercase tracking-wider border rounded-full px-2 py-0.5 ${chip.c}`}>{chip.l}</span>}
            </div>
          )}
          <h1 className="font-heading font-bold text-[32px] leading-[1.05] tracking-tight"><ShimmerText>{event.title}</ShimmerText></h1>
          {hostBlocked && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2">
              <p className="text-xs text-muted-foreground">You blocked this host. Their events and messages are hidden.</p>
              <Button size="sm" variant="secondary" onClick={handleUnblockHost}>Unblock</Button>
            </div>
          )}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <button
              onClick={() =>
                // A business host's page is public (signed out too); a
                // person's profile needs an account.
                event.host_is_business && event.business_id
                  ? navigate(`/b/${event.business_id}`)
                  : !user
                  ? promptSignup()
                  : setShowHostModal(true)
              }
              className="flex items-center gap-2 group"
            >
              {event.host_is_business ? (
                <Avatar src={event.host_picture} name={event.host_name} size="w-7 h-7" textClass="text-[10px]" />
              ) : (
                <UserAvatar email={event.host_email} fallbackSrc={event.host_picture} name={event.host_name} size="w-7 h-7" textClass="text-[10px]" />
              )}
              <span className="text-sm text-muted-foreground">Hosted by <span className="text-foreground font-semibold group-hover:text-primary transition-colors">{event.host_name}</span></span>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
            {acceptedCoHosts.map((c) => (
              <span key={c.email} className="flex items-center gap-1.5 bg-secondary/50 rounded-full pl-1 pr-2.5 py-0.5 border border-border/50">
                <UserAvatar email={c.email} fallbackSrc={c.picture} name={c.name || c.email} size="w-5 h-5" textClass="text-[9px]" />
                <span className="text-xs text-muted-foreground">{c.name || c.email}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Countdown: ticket release first, then doors */}
        <EventCountdownCard event={event} releaseAt={event.is_paid ? onSaleFrom : null} />

        {/* Your pass / status */}
        {myEntry && myEntry.status !== "denied" && (
          ["approved", "invited", "checked_in"].includes(myEntry.status) ? (
            <Link to={`/pass/${id}`} className="block relative rounded-[22px] p-[2px] overflow-hidden active:scale-[0.99] transition-transform">
              <div className="absolute inset-0" style={{ background: "conic-gradient(from 0deg, #fde68a, #f9a8d4, #f0abfc, #c084fc, #a5b4fc, #67e8f9, #fde68a)" }} />
              <div className="relative rounded-[20px] bg-card p-4 flex items-center gap-4">
                <div className="w-16 h-16 rounded-xl bg-white grid place-items-center flex-shrink-0"><QrCode className="w-10 h-10 text-black" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                    {myEntry.status === "checked_in" ? "You're checked in" : myEntry.status === "invited" ? "You're invited" : "You're going"}
                  </p>
                  <p className="font-heading font-semibold text-[17px] truncate">Your pass</p>
                  <p className="text-xs text-muted-foreground">Show this at the door</p>
                </div>
                <span className="rounded-full bg-white text-black text-[13px] font-semibold px-3.5 py-2 flex-shrink-0">Open</span>
              </div>
            </Link>
          ) : (
            <div className="rounded-2xl bg-secondary/40 border border-border/60 p-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Your status</p>
                <StatusBadge status={myEntry.status} />
              </div>
              {myEntry.status === "requested" && <p className="text-xs text-muted-foreground text-right">The host will review your request.</p>}
            </div>
          )
        )}

        {myCoHostInvite && (
          <div className="bg-primary/10 border border-primary/30 rounded-xl p-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-primary">You're invited as a co-host</p>
              <p className="text-xs text-muted-foreground">Help run this event and edit its details.</p>
            </div>
            <Button size="sm" onClick={handleAcceptCoHost} disabled={accepting}>
              {accepting ? "Accepting..." : "Accept"}
            </Button>
          </div>
        )}

        {refStatus && (
          <div className={`rounded-xl p-3 border text-xs ${refStatus.valid ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300" : "bg-amber-500/10 border-amber-500/20 text-amber-300"}`}>
            {refStatus.valid
              ? (() => {
                  const label = discountLabel(refStatus.promoter, sym);
                  const active = promoterDiscountActive(refStatus.promoter);
                  const exhausted = refStatus.promoter && refStatus.promoter.discount_type && refStatus.promoter.discount_type !== "none" && Number(refStatus.promoter.discount_value || 0) > 0 && !active;
                  if (label && active) return `Referred by ${refStatus.name || "a promoter"} — ${label} your ticket at checkout.`;
                  if (exhausted) return `Referred by ${refStatus.name || "a promoter"} — promo code no longer active.`;
                  return `Referred by ${refStatus.name || "a promoter"} — your ticket will be credited to them.`;
                })()
              : "This referral code wasn't recognized — you can still buy tickets, but no promoter will be credited."}
          </div>
        )}

        {/* Key info */}
        <div className="rounded-[20px] bg-secondary/40 border border-border/60 divide-y divide-border/60">
          <InfoRow icon={Calendar} tone="bg-rose-500/15 text-rose-300" title={eventLongDate(event)} sub={eventTimeRange(event)}>
            <button type="button" onClick={addToCalendar}
              className="mt-2 text-xs font-semibold text-violet-200 bg-violet-500/15 border border-violet-400/25 px-3 py-1.5 rounded-full hover:bg-violet-500/25 transition-colors">
              + Add to calendar
            </button>
          </InfoRow>
          {(event.venue_name || event.address) ? (
            <InfoRow icon={MapPin} tone="bg-sky-500/15 text-sky-300" title={event.venue_name || event.address} sub={event.venue_name ? event.address : ""}>
              {maps && (
                <a href={maps} target="_blank" rel="noopener noreferrer"
                  className="mt-2 inline-block text-xs font-semibold text-sky-200 bg-sky-500/15 border border-sky-400/25 px-3 py-1.5 rounded-full hover:bg-sky-500/25 transition-colors">
                  Open in Maps ↗
                </a>
              )}
            </InfoRow>
          ) : event.hide_location_until_approved ? (
            // The server masks the venue until the host approves this guest.
            <InfoRow icon={MapPin} tone="bg-sky-500/15 text-sky-300" title="Location revealed on approval" sub="You'll see the venue once the host approves you" />
          ) : null}
          {event.dress_code && <InfoRow icon={Shirt} tone="bg-amber-500/15 text-amber-300" title={event.dress_code} sub="Dress code" />}
        </div>

        {event.entry_notes && (
          <div className="rounded-2xl border border-cyan-400/25 bg-cyan-400/[0.06] px-4 py-3 flex gap-3">
            <Info className="w-4 h-4 text-cyan-300 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-foreground/85 whitespace-pre-line">{event.entry_notes}</p>
          </div>
        )}

        {Array.isArray(event.dj_lineup) && event.dj_lineup.length > 0 && (
          <div className="px-1">
            <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground mb-3">Lineup</h2>
            <div className="space-y-1">
              {event.dj_lineup.map((d) => {
                const inner = (
                  <>
                    <div className="flex-1 min-w-0">
                      <FitText text={d.name} className={lineupStyle(event.lineup_style).className} style={lineupStyle(event.lineup_style).style} />
                    </div>
                    {d.set_time && <p className="text-xs text-muted-foreground flex-shrink-0">{d.set_time}</p>}
                    {d.user_id && <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                  </>
                );
                return d.user_id ? (
                  <button key={d.id} onClick={() => navigate(`/dj/${d.user_id}`)} className="w-full flex items-center gap-3 py-1.5 text-left active:scale-[0.99] transition-transform">
                    {inner}
                  </button>
                ) : (
                  <div key={d.id} className="flex items-center gap-3 py-1.5">{inner}</div>
                );
              })}
            </div>
          </div>
        )}

        {event.description && (
          <div className="px-1">
            <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground mb-2">About</h2>
            <p className={`text-[15px] text-foreground/80 leading-relaxed whitespace-pre-line ${longAbout && !aboutOpen ? "line-clamp-3" : ""}`}>{event.description}</p>
            {longAbout && (
              <button type="button" onClick={() => setAboutOpen((v) => !v)} className="mt-1 text-sm font-semibold text-primary">
                {aboutOpen ? "Show less" : "Read more"}
              </button>
            )}
          </div>
        )}

        {/* Tickets + join (managers previewing see the ticket list only) */}
        {(!canManage || guestView) && (
          <div className="space-y-3" id="join">
            {event.is_paid && (
              <div>
                <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground mb-3 px-1">Tickets</h2>
                <div className="rounded-[20px] bg-secondary/40 border border-border/60 divide-y divide-border/60">
                  {soldOutTiers.length > 0 && (
                    <div className="flex items-center justify-between px-4 py-3 text-muted-foreground/70">
                      <span className="text-[13px]">
                        {soldOutTiers.length === 1 ? `${soldOutTiers[0].name} · Sold out` : `${soldOutTiers.length} releases sold out`}
                      </span>
                      {soldOutTiers.length === 1 && <span className="text-[13px] line-through">{sym}{fmtPrice(soldOutTiers[0].price)}</span>}
                    </div>
                  )}
                  {liveTiers.map((t) => {
                    const scheduled = tierScheduled(t);
                    const left = tierRemaining(t);
                    return (
                      <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-3.5">
                        <div className="min-w-0">
                          <p className="text-[15px] font-semibold">{t.name}</p>
                          {t.description && <p className="text-xs text-muted-foreground whitespace-pre-line break-words">{t.description}</p>}
                          {scheduled
                            ? <p className="text-xs text-sky-300">On sale {longDateTime(t.release_at)}</p>
                            : left > 0 && left <= 20 && <p className="text-xs text-amber-300">Only {left} left</p>}
                        </div>
                        <p className={`font-heading font-bold text-lg flex-shrink-0 ${scheduled ? "text-muted-foreground" : ""}`}>{sym}{fmtPrice(t.price)}</p>
                      </div>
                    );
                  })}
                  {tiers.length === 0 && <p className="px-4 py-3 text-xs text-muted-foreground">Tickets coming soon.</p>}
                </div>
              </div>
            )}
            {!canManage && <EventJoinActions event={event} me={user} myEntry={myEntry} soldOut={allSoldOut} onSaleFrom={onSaleFrom} onChanged={() => queryClient.invalidateQueries(["event", id])} />}
          </div>
        )}

        {!canManage && event.visibility !== "none" && (myEntry || event.is_paid) && (
          <WhoIsGoing
            eventId={id}
            myEmail={user?.email}
            visibility={event.visibility}
            unlocked={!!myEntry && ["approved", "checked_in"].includes(myEntry.status)}
            anon={!user}
            onPrompt={promptSignup}
          />
        )}

        {/* Chat — approved/checked-in guests (managers have it in the host view) */}
        {!canManage && myEntry && ["approved", "invited", "checked_in"].includes(myEntry.status) && (
          <EventChat eventId={id} user={user} canPost={isHost || isCoHost}
            hostIsBusiness={event.host_is_business} businessName={event.host_name} businessPicture={event.host_picture} />
        )}

        {(event.instagram || (user && !canManage && !hostBlocked)) && (
          <div className="flex items-center justify-between gap-3 px-1">
            {event.instagram
              ? <SocialLinks instagram={event.instagram.replace(/^@/, "")} snapchat={null} location={null} />
              : <span />}
            {user && !canManage && !hostBlocked && (
              <SafetyActions
                target={{ type: "event", event_id: id }}
                userId={hostId}
                userName={event.host_name}
                onBlocked={() => navigate("/guest")}
              />
            )}
          </div>
        )}

        {/* Managers previewing the public page: a way back to the host view. */}
        {canManage && (
          <div className="sticky bottom-[calc(64px+env(safe-area-inset-bottom))] z-30 flex justify-center pointer-events-none">
            <button type="button" onClick={() => { setGuestView(false); window.scrollTo(0, 0); }}
              className="pointer-events-auto inline-flex items-center gap-2 h-11 px-5 rounded-full bg-foreground text-background text-sm font-semibold shadow-xl shadow-black/50">
              <ArrowLeft className="w-4 h-4" /> Back to host view
            </button>
          </div>
        )}
      </div>

      {/* Pinned next step for signed-in guests */}
      {bar && (
        <div className={`fixed inset-x-0 ${barBottom} z-30 pointer-events-none`}>
          <div className="max-w-lg mx-auto px-4 pt-6 pb-3 bg-gradient-to-t from-background via-background/95 to-transparent">
            <div className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-card/95 border border-white/10 backdrop-blur p-2 pl-4 shadow-2xl shadow-black/60">
              <div className="flex-1 min-w-0">
                {bar.kicker ? (
                  <>
                    <p className="text-[11px] text-muted-foreground">{bar.kicker}</p>
                    <p className="font-heading font-bold text-xl leading-none truncate">{bar.price}</p>
                  </>
                ) : (
                  <>
                    <p className={`text-[13px] font-semibold ${bar.tone}`}>{bar.title}</p>
                    {bar.sub && <p className="text-[11px] text-muted-foreground truncate">{bar.sub}</p>}
                  </>
                )}
              </div>
              {bar.action && (bar.action.to ? (
                <Link to={bar.action.to} className="h-12 px-6 rounded-xl bg-white text-black font-heading font-bold text-base grid place-items-center flex-shrink-0">
                  {bar.action.label}
                </Link>
              ) : (
                <button type="button" onClick={bar.action.onClick}
                  className={`h-12 px-6 rounded-xl font-heading font-bold text-base flex-shrink-0 ${bar.action.subtle ? "bg-white/10 text-foreground" : "bg-primary text-primary-foreground shadow-lg shadow-primary/30"}`}>
                  {bar.action.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {signedOut && (
        <SignupBar picture={event.host_picture} name={event.host_name}
          title={allSoldOut ? "Don't miss the next one" : event.is_paid ? "Get tickets on DoorMan" : "Join this event on DoorMan"} />
      )}
      {showHostModal && (
        <HostProfileModal
          host={{ id: hostId, name: event.host_name, email: event.host_email, picture: event.host_picture }}
          isBusiness={event.host_is_business}
          me={user}
          onClose={() => setShowHostModal(false)}
        />
      )}
    </div>
  );
}

// "12" for whole amounts, "12.50" otherwise.
function fmtPrice(p) {
  const n = Number(p) || 0;
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

// A key-info row: icon, a bold line, a quieter line, and optional actions.
function InfoRow({ icon: Icon, tone, title, sub = "", children = null }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3.5">
      <span className={`w-10 h-10 rounded-xl grid place-items-center flex-shrink-0 ${tone}`}><Icon className="w-[18px] h-[18px]" /></span>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-semibold break-words">{title}</p>
        {sub && <p className="text-[13px] text-muted-foreground break-words">{sub}</p>}
        {children}
      </div>
    </div>
  );
}
