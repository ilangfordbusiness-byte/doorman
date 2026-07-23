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
import {
  ArrowLeft, Calendar, Clock, MapPin, Shirt, Users, Share2,
  QrCode, Shield, Edit, Trash2, UserPlus, Copy, Check, Plus, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import StatusBadge from "../components/StatusBadge";
import WhoIsGoing from "../components/WhoIsGoing";
import EventChat from "../components/EventChat";
import moment from "moment";

export default function EventDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [event, setEvent] = useState(null);
  const [user, setUser] = useState(null);
  const [myEntry, setMyEntry] = useState(null);
  const [stats, setStats] = useState({ invited: 0, approved: 0, checked_in: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [staff, setStaff] = useState([]);
  const [newStaffEmail, setNewStaffEmail] = useState("");
  const [addingStaff, setAddingStaff] = useState(false);

  const isHost = user && event && event.host_email === user.email;

  useEffect(() => {
    loadEvent();
  }, [id]);

  async function loadEvent() {
    const me = await base44.auth.me();
    setUser(me);

    const events = await base44.entities.Event.filter({ id });
    if (!events.length) return navigate("/");
    let evt = events[0];

    // Generate staff_code if missing
    if (!evt.staff_code && evt.host_email === me.email) {
      const code = String(Math.floor(1000 + Math.random() * 9000));
      await base44.entities.Event.update(id, { staff_code: code });
      evt = { ...evt, staff_code: code };
    }

    setEvent(evt);

    const entries = await base44.entities.GuestlistEntry.filter({ event_id: id });
    const mine = entries.find((e) => e.guest_email === me.email);
    setMyEntry(mine);

    setStats({
      total: entries.length,
      invited: entries.filter((e) => e.status === "invited").length,
      approved: entries.filter((e) => ["approved", "checked_in"].includes(e.status)).length,
      checked_in: entries.filter((e) => e.status === "checked_in").length,
    });

    const staffList = await base44.entities.EventStaff.filter({ event_id: id });
    setStaff(staffList);

    setLoading(false);
  }

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
    const staffList = await base44.entities.EventStaff.filter({ event_id: id });
    setStaff(staffList);
    setNewStaffEmail("");
    setAddingStaff(false);
    toast({ title: "Staff added!" });
  }

  async function handleRemoveStaff(staffId) {
    await base44.entities.EventStaff.delete(staffId);
    setStaff((prev) => prev.filter((s) => s.id !== staffId));
  }

  async function handleRequestJoin() {
    setRequesting(true);
    const me = await base44.auth.me();
    const qr_secret = Math.random().toString(36).substring(2, 18);
    const entry = await base44.entities.GuestlistEntry.create({
      event_id: id,
      guest_email: me.email,
      guest_name: me.full_name,
      guest_phone: me.phone || "",
      status: "requested",
      source: "request",
      qr_secret,
    });
    setMyEntry(entry);
    setRequesting(false);
    toast({ title: "Request sent!" });
  }

  async function handleShare() {
    const url = `${window.location.origin}/invite/${event.invite_code}`;
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

  if (!event) return null;

  const eventDate = moment(event.date);

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
          {isHost && (
            <Button variant="ghost" size="icon" className="rounded-full bg-card/60 backdrop-blur-sm" onClick={handleShare}>
              {copied ? <Check className="w-5 h-5 text-emerald-400" /> : <Share2 className="w-5 h-5" />}
            </Button>
          )}
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
          <p className="text-sm text-muted-foreground mt-1">by {event.host_name}</p>
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-2 gap-3">
          <DetailChip icon={<Calendar className="w-4 h-4" />} label="Date" value={eventDate.format("ddd, MMM D")} />
          <DetailChip icon={<Clock className="w-4 h-4" />} label="Time" value={`${event.start_time}${event.end_time ? ` - ${event.end_time}` : ""}`} />
          {event.venue_name && <DetailChip icon={<MapPin className="w-4 h-4" />} label="Venue" value={event.venue_name} />}
          {event.dress_code && <DetailChip icon={<Shirt className="w-4 h-4" />} label="Dress Code" value={event.dress_code} />}
        </div>

        {event.address && (
          <div className="bg-secondary/50 rounded-xl p-3 border border-border/50">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Address</p>
            <p className="text-sm text-foreground">{event.address}</p>
          </div>
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

        {/* Host Dashboard */}
        {isHost && (
          <div className="space-y-4">
            <h2 className="font-heading font-bold text-lg">Event Dashboard</h2>
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
        {(isHost || (myEntry && ["approved", "invited", "checked_in"].includes(myEntry.status))) && (
          <EventChat eventId={id} user={user} isHost={isHost} canChat={isHost || myEntry?.can_chat === true} />
        )}

        {/* Guest Actions */}
        {!isHost && (
          <div className="space-y-3">
            {!myEntry && event.requests_open && (
              <Button
                className="w-full h-14 rounded-xl font-bold text-base bg-primary hover:bg-primary/90"
                onClick={handleRequestJoin}
                disabled={requesting}
              >
                <UserPlus className="w-5 h-5 mr-2" />
                {requesting ? "Requesting..." : "Request to Join"}
              </Button>
            )}
            {myEntry && ["approved", "invited", "checked_in"].includes(myEntry.status) && (
          <WhoIsGoing eventId={id} myEmail={user?.email} />
        )}

        {myEntry && (
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
                {myEntry.status === "denied" && (
                  <div className="bg-destructive/10 rounded-xl p-4 border border-destructive/20 text-center">
                    <p className="text-sm text-destructive font-medium">Your request was not approved</p>
                  </div>
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