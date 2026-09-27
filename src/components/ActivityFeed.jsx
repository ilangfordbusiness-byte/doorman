import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import moment from "moment";
import { api } from "@/api/data";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "./LoadingSpinner";
import ActivityFeedRow from "./ActivityFeedRow";
import Avatar from "./Avatar";
import UserAvatar from "./UserAvatar";
import { COVERS } from "./CoverPicker";
import {
  Sparkles, Users, Compass, ChevronRight, Loader2, Check, X, UserPlus,
  Ticket, Calendar, MapPin,
} from "lucide-react";

const PAGE = 20;

function coverStyle(cover) {
  if (cover?.startsWith("__cover__")) {
    const id = cover.replace("__cover__", "");
    return COVERS.find((c) => c.id === id)?.style || null;
  }
  return null;
}

function SectionHeader({ icon: Icon, title, action, onAction }) {
  return (
    <div className="flex items-center justify-between mb-2 mt-5 first:mt-0">
      <h2 className="font-heading font-semibold text-sm flex items-center gap-2">
        <Icon className="w-4 h-4 text-muted-foreground" /> {title}
      </h2>
      {action && (
        <button onClick={onAction} className="text-xs text-primary font-medium hover:underline">{action}</button>
      )}
    </div>
  );
}

// The Activity centre: actionable modules (requests, transfers, a featured
// event, friend suggestions) plus the social feed. Each module is fetched
// independently and hidden when empty, so one failure never blanks the tab.
export default function ActivityFeed({
  sentSet = new Set(), requests = [],
  onRespond, onSendRequest, onOpenProfile, onGoToRequests, onFindFriends,
}) {
  const navigate = useNavigate();

  // Feed
  const [items, setItems] = useState([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [feedLoading, setFeedLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [feedError, setFeedError] = useState(false);

  // Modules
  const [transfers, setTransfers] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [busyReq, setBusyReq] = useState(null);
  const [busyTransfer, setBusyTransfer] = useState(null);
  const [sentLocal, setSentLocal] = useState(new Set());

  useEffect(() => {
    loadFeed(0, true);
    loadTransfers();
    loadSuggestions();
    loadUpcoming();
  }, []);

  async function loadFeed(from, reset) {
    reset ? setFeedLoading(true) : setLoadingMore(true);
    if (reset) setFeedError(false);
    try {
      const res = await api.functions.invoke("getActivityFeed", { offset: from, limit: PAGE });
      const d = res.data;
      if (d?.error) throw new Error(d.error);
      setItems((prev) => (reset ? d.items || [] : [...prev, ...(d.items || [])]));
      setHasMore(!!d.hasMore);
      setOffset(from + PAGE);
    } catch {
      if (reset) setFeedError(true);
    }
    reset ? setFeedLoading(false) : setLoadingMore(false);
  }

  async function loadTransfers() {
    try {
      const res = await api.functions.invoke("getGuestDashboard");
      setTransfers(res.data?.transfers?.incoming ?? []);
    } catch { /* module hidden on failure */ }
  }

  async function loadSuggestions() {
    try {
      const res = await api.functions.invoke("getFriendSuggestions", { offset: 0, limit: 6 });
      setSuggestions(res.data?.items ?? []);
    } catch { /* module hidden on failure */ }
  }

  async function loadUpcoming() {
    try {
      const all = await api.entities.Event.filter({ status: "published" }, "date");
      const today = moment().startOf("day");
      setUpcoming(all.filter((e) => e.is_public && moment(e.date).isSameOrAfter(today)));
    } catch { /* module hidden on failure */ }
  }

  async function acceptTransfer(t) {
    setBusyTransfer(t.id);
    try {
      const res = await api.functions.invoke("acceptTicketTransfer", { transfer_id: t.id });
      if (res.data?.error) throw new Error(res.data.error);
      setTransfers((prev) => prev.filter((x) => x.id !== t.id));
    } catch { /* leave it in place */ }
    setBusyTransfer(null);
  }

  async function declineTransfer(t) {
    setBusyTransfer(t.id);
    try {
      await api.entities.TicketTransfer.update(t.id, { status: "declined" });
      setTransfers((prev) => prev.filter((x) => x.id !== t.id));
    } catch { /* ignore */ }
    setBusyTransfer(null);
  }

  async function respondReq(req, status) {
    setBusyReq(req.id);
    try { await onRespond?.(req, status); } finally { setBusyReq(null); }
  }

  function addFriend(u) {
    setSentLocal((prev) => new Set(prev).add(u.email));
    onSendRequest?.(u);
  }

  // Featured event: prefer one friends are going to (from the feed), else soonest upcoming public.
  const friendGoing = useMemo(() => items.find((it) => it.type === "friend_going"), [items]);
  const featured = friendGoing?.event
    ? { event: friendGoing.event, actors: friendGoing.actors, count: friendGoing.actor_count }
    : upcoming[0]
      ? { event: {
            id: upcoming[0].id, title: upcoming[0].title, cover_image: upcoming[0].cover_image,
            date: upcoming[0].date, venue_name: upcoming[0].venue_name,
          } }
      : null;

  const pendingReqs = requests.slice(0, 3);
  const feedRows = items.filter((it) => it !== friendGoing); // don't repeat the featured one

  const nothing =
    !feedLoading && !feedError && pendingReqs.length === 0 && transfers.length === 0 &&
    suggestions.length === 0 && !featured && feedRows.length === 0;

  if (feedLoading && items.length === 0 && !transfers.length && !suggestions.length && !upcoming.length) {
    return <LoadingSpinner />;
  }

  if (nothing) {
    return (
      <div className="py-12 text-center">
        <Sparkles className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm font-semibold mb-1">No activity yet</p>
        <p className="text-sm text-muted-foreground mb-4 max-w-xs mx-auto">
          Add friends and explore events to see what everyone&apos;s up to.
        </p>
        <div className="flex gap-2 justify-center">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onFindFriends}>
            <Users className="w-4 h-4" /> Find friends
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => navigate("/guest?tab=discover")}>
            <Compass className="w-4 h-4" /> Discover events
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Friend requests */}
      {pendingReqs.length > 0 && (
        <>
          <SectionHeader icon={Users} title="Friend requests"
            action={requests.length > 3 ? `See all (${requests.length})` : null} onAction={onGoToRequests} />
          <div className="space-y-2">
            {pendingReqs.map((req) => (
              <div key={req.id} className="flex items-center gap-3 bg-secondary/40 rounded-xl px-4 py-3 border border-border/50">
                <button onClick={() => onOpenProfile?.({ email: req.sender_email, full_name: req.sender_name, profile_picture: req.sender_picture })}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left">
                  <UserAvatar email={req.sender_email} fallbackSrc={req.sender_picture} name={req.sender_name || req.sender_email} size="w-10 h-10" textClass="text-sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{req.sender_name || req.sender_email}</p>
                    <p className="text-[11px] text-muted-foreground">Wants to be friends</p>
                  </div>
                </button>
                <div className="flex gap-1.5 flex-shrink-0">
                  <button onClick={() => respondReq(req, "accepted")} disabled={busyReq === req.id}
                    className="w-9 h-9 rounded-full bg-emerald-500/15 flex items-center justify-center text-emerald-400 hover:bg-emerald-500/25 transition-colors">
                    <Check className="w-4 h-4" />
                  </button>
                  <button onClick={() => respondReq(req, "declined")} disabled={busyReq === req.id}
                    className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Incoming ticket transfers */}
      {transfers.length > 0 && (
        <>
          <SectionHeader icon={Ticket} title="Ticket transfers"
            action="View all" onAction={() => navigate("/guest?tab=transfers")} />
          <div className="space-y-2">
            {transfers.map((t) => (
              <div key={t.id} className="flex items-center gap-3 bg-secondary/40 rounded-xl px-4 py-3 border border-border/50">
                <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
                  <Ticket className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{t.event_title || "Ticket"}</p>
                  <p className="text-[11px] text-muted-foreground truncate">From {t.sender_name || t.sender_email}</p>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  <Button size="sm" className="h-9 rounded-lg gap-1" disabled={busyTransfer === t.id} onClick={() => acceptTransfer(t)}>
                    <Check className="w-4 h-4" /> Accept
                  </Button>
                  <Button size="sm" variant="outline" className="h-9 w-9 rounded-lg p-0" disabled={busyTransfer === t.id} onClick={() => declineTransfer(t)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Featured event */}
      {featured && (
        <>
          <SectionHeader icon={Calendar} title={featured.actors ? "Your friends are going" : "Happening soon"} />
          <button onClick={() => navigate(`/event/${featured.event.id}`)}
            className="w-full flex items-center gap-3 bg-secondary/40 rounded-xl p-3 border border-border/50 text-left hover:border-primary/30 transition-colors active:scale-[0.99]">
            {(() => {
              const style = coverStyle(featured.event.cover_image);
              if (style) return <div className="w-16 h-16 rounded-lg flex-shrink-0" style={style} />;
              if (featured.event.cover_image && !featured.event.cover_image.startsWith("__cover__"))
                return <img src={featured.event.cover_image} alt="" className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />;
              return <div className="w-16 h-16 rounded-lg flex-shrink-0 bg-gradient-to-br from-primary/30 to-accent/20" />;
            })()}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{featured.event.title}</p>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                <Calendar className="w-3 h-3" />{featured.event.date ? moment(featured.event.date).format("ddd, MMM D") : ""}
                {featured.event.venue_name ? <><MapPin className="w-3 h-3 ml-1" />{featured.event.venue_name}</> : null}
              </p>
              {featured.actors && (
                <div className="flex items-center gap-2 mt-1.5">
                  <div className="flex -space-x-2">
                    {featured.actors.slice(0, 3).map((a, i) => (
                      <Avatar key={i} src={a.picture} name={a.name} size="w-6 h-6" textClass="text-[9px]" className="ring-2 ring-card" />
                    ))}
                  </div>
                  <span className="text-[11px] text-primary font-medium">
                    {featured.count} friend{featured.count === 1 ? "" : "s"} going
                  </span>
                </div>
              )}
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          </button>
        </>
      )}

      {/* People you may know */}
      {suggestions.length > 0 && (
        <>
          <SectionHeader icon={UserPlus} title="People you may know" action="See all" onAction={onFindFriends} />
          <div className="space-y-2">
            {suggestions.map((u) => {
              const sent = sentLocal.has(u.email) || sentSet.has(u.email);
              const mutual = Number(u.mutual || 0);
              return (
                <div key={u.email} className="flex items-center gap-3 bg-secondary/40 rounded-xl px-4 py-3 border border-border/50">
                  <button onClick={() => onOpenProfile?.(u)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                    <UserAvatar email={u.email} fallbackSrc={u.profile_picture} name={u.full_name || u.email} size="w-10 h-10" textClass="text-sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{u.full_name || u.email}</p>
                      {mutual > 0 && <p className="text-[11px] text-muted-foreground">{mutual} mutual friend{mutual === 1 ? "" : "s"}</p>}
                    </div>
                  </button>
                  {sent ? (
                    <span className="text-xs text-muted-foreground font-medium flex-shrink-0">Sent</span>
                  ) : (
                    <Button size="sm" className="rounded-full h-8 gap-1 text-xs flex-shrink-0" onClick={() => addFriend(u)}>
                      <UserPlus className="w-3.5 h-3.5" /> Add
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Recent activity feed */}
      {(feedRows.length > 0 || feedError) && (
        <>
          <SectionHeader icon={Sparkles} title="Recent activity" />
          {feedError ? (
            <div className="bg-secondary/40 rounded-xl px-4 py-4 border border-border/50 flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">Couldn&apos;t load recent activity.</p>
              <Button variant="outline" size="sm" onClick={() => loadFeed(0, true)}>Retry</Button>
            </div>
          ) : (
            <div className="space-y-2">
              {feedRows.map((it, i) => (
                <ActivityFeedRow key={i} item={it} onOpenProfile={onOpenProfile} onGoToEvent={(id) => navigate(`/event/${id}`)} />
              ))}
              {hasMore && (
                <div className="pt-2 flex justify-center">
                  <Button variant="outline" size="sm" className="rounded-xl gap-1.5" disabled={loadingMore} onClick={() => loadFeed(offset, false)}>
                    {loadingMore ? <><Loader2 className="w-4 h-4 animate-spin" /> Loading…</> : "Load more"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
