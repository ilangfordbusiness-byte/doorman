import { useState, useEffect } from "react";
import { COVERS } from "../components/CoverPicker";
import LoadingSpinner from "../components/LoadingSpinner";

function getCoverStyle(cover_image) {
  if (cover_image?.startsWith("__cover__")) {
    const id = cover_image.replace("__cover__", "");
    return COVERS.find((c) => c.id === id)?.style || null;
  }
  return null;
}
import { useParams, Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import {
  ArrowLeft, Calendar, Clock, MapPin, Shirt, Users, Share2,
  QrCode, Shield, Edit, Trash2, Copy, Check, Plus, X, BarChart3, Megaphone, Instagram
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import StatusBadge from "../components/StatusBadge";
import WhoIsGoing from "../components/WhoIsGoing";
import EventChat from "../components/EventChat";
import UserAvatar from "../components/UserAvatar";
import HostProfileModal from "../components/HostProfileModal";
import CoHostsSection from "../components/CoHostsSection";
import EventJoinActions from "../components/EventJoinActions";
import moment from "moment";
import { captureRef, getLinkDomain, discountLabel, promoterDiscountActive } from "@/lib/promoterRef";

async function loadEvent(id, me) {
  const events = await base44.entities.Event.filter({ id });
  if (!events.length) return { notFound: true };
  let evt = events[0];

  if (!evt.staff_code && evt.host_email === me.email) {
    const code = String(Math.floor(1000 + Math.random() * 9000));
    await base44.entities.Event.update(id, { staff_code: code });
    evt = { ...evt, staff_code: code };
  }

  const [entries, staffList, tierList] = await Promise.all([
    base44.entities.GuestlistEntry.filter({ event_id: id }),
    base44.entities.EventStaff.filter({ event_id: id }),
    base44.entities.TicketTier.filter({ event_id: id }).catch(() => []),
  ]);
  const mine = entries.find((e) => e.guest_email === me.email);
  tierList.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

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
    },
    staff: staffList,
    tiers: tierList,
  };
}

export default function EventDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: me } = useCurrentUser();
  const { data, isLoading: loading } = useQuery({
    queryKey: ["event", id],
    queryFn: () => loadEvent(id, me),
    enabled: !!me,
    staleTime: 30 * 1000,
  });

  const event = data?.event ?? null;
  const user = data?.user ?? null;
  const myEntry = data?.myEntry ?? null;
  const stats = data?.stats ?? { invited: 0, approved: 0, checked_in: 0, total: 0 };
  const staff = data?.staff ?? [];
  const tiers = data?.tiers ?? [];
  const loadError = data?.notFound ? "This event is no longer available or the link is invalid." : null;

  const [copied, setCopied] = useState(false);
  const [newStaffEmail, setNewStaffEmail] = useState("");
  const [addingStaff, setAddingStaff] = useState(false);
  const [refStatus, setRefStatus] = useState(null);
  const [showHostModal, setShowHostModal] = useState(false);
  const [accepting, setAccepting] = useState(false);

  const isHost = user && event && event.host_email === user.email;
  const coHosts = event ? (Array.isArray(event.co_hosts) ? event.co_hosts : []) : [];
  const acceptedCoHosts = coHosts.filter((c) => c.status === "accepted");
  const isCoHost = user && coHosts.some((c) => c.email === user.email && c.status === "accepted");
  const canManage = isHost || isCoHost;
  const myCoHostInvite = user ? coHosts.find((c) => c.email === user.email && c.status === "pending") : null;

  async function handleAcceptCoHost() {
    setAccepting(true);
    try {
      await base44.functions.invoke("acceptCoHost", { event_id: id });
      await queryClient.invalidateQueries(["event", id]);
      toast({ title: "You're now a co-host!" });
    } catch (e) {
      toast({ title: e?.message || "Could not accept", variant: "destructive" });
    }
    setAccepting(false);
  }

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

  async function handleAddStaff() {
    if (!newStaffEmail.trim()) return;
    setAddingStaff(true);
    const val = newStaffEmail.trim();
    const isPhone = /^[\+\d][\d\s\-().]{5,}$/.test(val);
    await base44.entities.EventStaff.create({
      event_id: id,
      staff_email: isPhone ? "" : val.toLowerCase(),
      staff_phone: isPhone ? val : "",
      staff_name: val,
      role: "doorman",
    });
    queryClient.invalidateQueries(["event", id]);
    setNewStaffEmail("");
    setAddingStaff(false);
    toast({ title: "Staff added!" });
  }

  async function handleRemoveStaff(staffId) {
    await base44.entities.EventStaff.delete(staffId);
    queryClient.invalidateQueries(["event", id]);
  }

  async function handleShare() {
    const url = `${getLinkDomain()}/invite/${event.invite_code}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: event.title, text: `You're invited to ${event.title}!`, url });
        return;
      }
    } catch {
      // Fall through to clipboard
    }
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast({ title: "Link copied!" });
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) return <LoadingSpinner fullScreen />;

  if (loadError) return (
    <div className="max-w-lg mx-auto px-4 pt-20 text-center">
      <h2 className="font-heading font-bold text-lg mb-2">Event not found</h2>
      <p className="text-sm text-muted-foreground mb-6">{loadError}</p>
      <Button onClick={() => navigate("/guest")}>Browse events</Button>
    </div>
  );

  if (!event) return null;

  const eventDate = moment(event.date);
  const sym = ({ gbp: "£", eur: "€", usd: "$" })[String(event.currency || "gbp").toLowerCase()] || "";

  return (
    <div className="max-w-lg mx-auto">
      {/* Cover */}
      <div className="relative h-56">{
        (() => {
          const coverStyle = getCoverStyle(event.cover_image);
          return coverStyle ? (
            <div className="w-full h-full" style={coverStyle}>
              <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "repeating-linear-gradient(0deg, rgba(255,255,255,0.8) 0px, rgba(255,255,255,0.8) 1px, transparent 1px, transparent 3px)" }} />
            </div>
          ) : event.cover_image && !event.cover_image.startsWith("__cover__") ? (
            <img src={event.cover_image} alt={event.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary/40 via-primary/20 to-accent/20" />
          );
        })()
      }
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
        <div className="absolute top-4 left-4 right-4 flex justify-between">
          <Button variant="ghost" size="icon" className="rounded-full bg-card/60 backdrop-blur-sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" className="rounded-full bg-card/60 backdrop-blur-sm" onClick={handleShare}>
            {copied ? <Check className="w-5 h-5 text-emerald-400" /> : <Share2 className="w-5 h-5" />}
          </Button>
        </div>
      </div>

      <div className="px-4 -mt-8 relative z-10 pb-8 space-y-5">
        {/* Title & Status */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <StatusBadge status={event.status} />
            {event.is_public && <span className="text-[10px] text-muted-foreground uppercase font-semibold">Public</span>}
          </div>
          <h1 className="font-heading font-bold text-2xl text-foreground">{event.title}</h1>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <button onClick={() => setShowHostModal(true)} className="flex items-center gap-2 group">
              <UserAvatar email={event.host_email} fallbackSrc={event.host_picture} name={event.host_name} size="w-6 h-6" textClass="text-[10px]" />
              <span className="text-sm text-muted-foreground group-hover:text-primary transition-colors">by {event.host_name}</span>
            </button>
            {acceptedCoHosts.map((c) => (
              <span key={c.email} className="flex items-center gap-1.5 bg-secondary/50 rounded-full pl-1 pr-2.5 py-0.5 border border-border/50">
                <UserAvatar email={c.email} fallbackSrc={c.picture} name={c.name || c.email} size="w-5 h-5" textClass="text-[9px]" />
                <span className="text-xs text-muted-foreground">{c.name || c.email}</span>
              </span>
            ))}
          </div>
        </div>

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
                  const sym = ({ gbp: "£", eur: "€", usd: "$" })[String(event.currency || "gbp").toLowerCase()] || "";
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

        {/* Details Grid */}
        <div className="grid grid-cols-2 gap-3">
          <DetailChip icon={<Calendar className="w-4 h-4" />} label="Date" value={eventDate.format("ddd, MMM D")} />
          <DetailChip icon={<Clock className="w-4 h-4" />} label="Time" value={`${event.start_time}${event.end_time ? ` - ${event.end_time}` : ""}`} />
          {event.venue_name && <DetailChip icon={<MapPin className="w-4 h-4" />} label="Venue" value={event.venue_name} />}
          {event.dress_code && <DetailChip icon={<Shirt className="w-4 h-4" />} label="Dress Code" value={event.dress_code} />}
        </div>

        {event.address && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.address)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block bg-secondary/50 rounded-xl p-3 border border-border/50 hover:border-primary/50 hover:bg-secondary transition-colors group"
          >
            <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
              <MapPin className="w-3.5 h-3.5" />
              <p className="text-xs uppercase tracking-wider">Address · Tap to open in maps</p>
            </div>
            <p className="text-sm text-foreground group-hover:text-primary transition-colors">{event.address}</p>
          </a>
        )}

        {event.description && (
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5">About</p>
            <p className="text-sm text-foreground/80 leading-relaxed">{event.description}</p>
          </div>
        )}

        {event.entry_notes && (
          <div className="bg-accent/10 rounded-xl p-3 border border-accent/20">
            <p className="text-xs text-accent uppercase tracking-wider font-semibold mb-1">Entry Notes</p>
            <p className="text-sm text-foreground/80">{event.entry_notes}</p>
          </div>
        )}

        {event.instagram && (
          <a
            href={`https://instagram.com/${event.instagram.replace(/^@/, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 bg-secondary/50 rounded-xl p-3 border border-border/50 hover:border-primary/50 hover:bg-secondary transition-colors group"
          >
            <Instagram className="w-4 h-4 text-primary" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Instagram · Tap to view</p>
              <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate">@{event.instagram.replace(/^@/, "")}</p>
            </div>
          </a>
        )}

        {/* Host Dashboard */}
        {canManage && (
          <div className="space-y-4">
            <h2 className="font-heading font-bold text-lg">{isHost ? "Event Dashboard" : "Co-Host Dashboard"}</h2>
            <div className="grid grid-cols-4 gap-2">
              <StatCard label="Total" value={stats.total} />
              <StatCard label="Invited" value={stats.invited} color="text-blue-400" />
              <StatCard label="Approved" value={stats.approved} color="text-emerald-400" />
              <StatCard label="Checked In" value={stats.checked_in} color="text-accent" />
            </div>
            {event.capacity && (
              <div className="bg-secondary/50 rounded-xl p-3 border border-border/50">
                <div className="flex justify-between text-xs text-muted-foreground mb-2">
                  <span>Capacity</span>
                  <span>{stats.approved} / {event.capacity}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${Math.min(100, (stats.approved / event.capacity) * 100)}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Link to={`/event/${id}/edit`} className="flex-1">
                <Button variant="outline" className="w-full h-12 rounded-xl gap-2 font-semibold">
                  <Edit className="w-4 h-4" /> Edit Event
                </Button>
              </Link>
            </div>
            <div className="flex gap-2">
              <Link to={`/event/${id}/guestlist`} className="flex-1">
                <Button variant="outline" className="w-full h-12 rounded-xl gap-2 font-semibold">
                  <Users className="w-4 h-4" /> Guestlist
                </Button>
              </Link>
              <Button variant="outline" className="h-12 rounded-xl gap-2 font-semibold" onClick={handleShare}>
                <Share2 className="w-4 h-4" /> Share
              </Button>
            </div>
            {event.is_paid && (
              <div className="flex gap-2">
                <Link to={`/event/${id}/analytics`} className="flex-1">
                  <Button variant="outline" className="w-full h-12 rounded-xl gap-2 font-semibold">
                    <BarChart3 className="w-4 h-4" /> Analytics
                  </Button>
                </Link>
                <Link to={`/event/${id}/promoters`} className="flex-1">
                  <Button variant="outline" className="w-full h-12 rounded-xl gap-2 font-semibold">
                    <Megaphone className="w-4 h-4" /> Promoters
                  </Button>
                </Link>
              </div>
            )}

            {/* Co-Hosts */}
            <CoHostsSection event={event} onUpdated={() => queryClient.invalidateQueries(["event", id])} />

            {/* Staff Management */}
            <div>
              <h3 className="font-heading font-semibold text-sm mb-3">Door Staff</h3>
              {event.staff_code && (
                <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 mb-3">
                  <div>
                    <p className="text-[10px] text-emerald-400 uppercase tracking-widest font-semibold mb-0.5">Staff Entry Code</p>
                    <p className="text-3xl font-bold font-heading tracking-[0.3em] text-foreground">{event.staff_code}</p>
                  </div>
                  <p className="text-xs text-muted-foreground text-right max-w-[100px] leading-tight">Share with doormen to let them join</p>
                </div>
              )}
              {staff.length > 0 && (
                <div className="space-y-2 mb-3">
                  {staff.map((s) => (
                    <div key={s.id} className="flex items-center justify-between bg-secondary/50 rounded-xl px-3 py-2.5 border border-border/50">
                      <div>
                        <p className="text-sm font-medium">{s.staff_email}</p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.role}</p>
                      </div>
                      <button onClick={() => handleRemoveStaff(s.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  value={newStaffEmail}
                  onChange={(e) => setNewStaffEmail(e.target.value)}
                  placeholder="Add doorman by email or phone..."
                  className="flex-1 h-10 px-3 text-sm bg-secondary/50 border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  onKeyDown={(e) => e.key === "Enter" && handleAddStaff()}
                />
                <Button size="sm" className="h-10 rounded-xl" onClick={handleAddStaff} disabled={addingStaff}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Chat — visible to host and approved/checked-in guests */}
        {(canManage || (myEntry && ["approved", "invited", "checked_in"].includes(myEntry.status))) && (
          <EventChat eventId={id} user={user} isHost={isHost} canChat={isHost || myEntry?.can_chat === true} />
        )}

        {/* Guest Actions */}
        {!canManage && (
          <div className="space-y-3">
            {event.is_paid && (
              <div className="bg-secondary/40 rounded-2xl p-4 border border-border/50">
                <h3 className="font-heading font-semibold text-sm mb-3">Tickets</h3>
                <div className="space-y-2">
                  {tiers.map((t) => {
                    const left = Math.max(0, Number(t.quantity || 0) - Number(t.sold || 0));
                    return (
                      <div key={t.id} className="flex justify-between items-center text-sm">
                        <div>
                          <p className="font-medium">{t.name}</p>
                          <p className="text-xs text-muted-foreground">{left <= 0 ? "Sold out" : `${left} left`}</p>
                        </div>
                        <p className="font-bold">{sym}{Number(t.price).toFixed(2)}</p>
                      </div>
                    );
                  })}
                  {tiers.length === 0 && <p className="text-xs text-muted-foreground">Tickets coming soon.</p>}
                </div>
              </div>
            )}
            <EventJoinActions event={event} me={user} myEntry={myEntry} onChanged={() => queryClient.invalidateQueries(["event", id])} />
            {event.visibility !== "none" && (myEntry || event.is_paid) && (
              <WhoIsGoing
                eventId={id}
                myEmail={user?.email}
                visibility={event.visibility}
                unlocked={!!myEntry && ["approved", "checked_in"].includes(myEntry.status)}
              />
            )}
            {myEntry && myEntry.status !== "denied" && (
              <div className="space-y-3">
                <div className="bg-secondary/50 rounded-xl p-4 border border-border/50 text-center">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Your Status</p>
                  <StatusBadge status={myEntry.status} size="lg" />
                </div>
                {(myEntry.status === "approved" || myEntry.status === "invited") && (
                  <Link to={`/pass/${id}`}>
                    <Button className="w-full h-14 rounded-xl font-bold text-base bg-primary hover:bg-primary/90 gap-2">
                      <QrCode className="w-5 h-5" /> Open QR Pass
                    </Button>
                  </Link>
                )}
                {myEntry.status === "requested" && (
                  <p className="text-sm text-muted-foreground text-center">The host will review your request.</p>
                )}
                {myEntry.status === "checked_in" && (
                  <div className="bg-emerald-500/10 rounded-xl p-4 border border-emerald-500/20 text-center">
                    <p className="text-sm text-emerald-400 font-medium">✓ You're checked in!</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {showHostModal && (
          <HostProfileModal
            host={{ name: event.host_name, email: event.host_email, picture: event.host_picture }}
            me={user}
            onClose={() => setShowHostModal(false)}
          />
        )}
      </div>
    </div>
  );
}

function DetailChip({ icon, label, value }) {
  return (
    <div className="bg-secondary/50 rounded-xl p-3 border border-border/50">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
        {icon}
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-sm font-medium text-foreground truncate">{value}</p>
    </div>
  );
}

function StatCard({ label, value, color = "text-foreground" }) {
  return (
    <div className="bg-secondary/50 rounded-xl p-3 border border-border/50 text-center">
      <p className={`text-xl font-bold font-heading ${color}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
    </div>
  );
}