import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/api/data";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "./LoadingSpinner";
import ActivityFeedRow from "./ActivityFeedRow";
import { Sparkles, Users, Compass, Bell, ChevronRight, Loader2 } from "lucide-react";

const PAGE = 20;

// The social activity feed shown on the Activity tab. Reads the computed
// get_activity_feed RPC (friends going to / hosting events, new friendships),
// with a "Load more" pager and empty / loading / error fallbacks.
export default function ActivityFeed({ requestsCount = 0, onOpenProfile, onGoToRequests, onFindFriends }) {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => { load(0, true); }, []);

  async function load(from, reset) {
    reset ? setLoading(true) : setLoadingMore(true);
    if (reset) setError(false);
    try {
      const res = await api.functions.invoke("getActivityFeed", { offset: from, limit: PAGE });
      const d = res.data;
      if (d?.error) throw new Error(d.error);
      setItems((prev) => (reset ? d.items || [] : [...prev, ...(d.items || [])]));
      setHasMore(!!d.hasMore);
      setOffset(from + PAGE);
    } catch {
      if (reset) setError(true);
    }
    reset ? setLoading(false) : setLoadingMore(false);
  }

  if (loading) return <LoadingSpinner />;

  if (error) {
    return (
      <div className="py-12 text-center">
        <Bell className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground mb-3">Couldn&apos;t load activity.</p>
        <Button variant="outline" size="sm" onClick={() => load(0, true)}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {requestsCount > 0 && (
        <button
          onClick={onGoToRequests}
          className="w-full flex items-center gap-3 bg-primary/10 border border-primary/20 rounded-xl px-4 py-3 text-left hover:bg-primary/15 transition-colors"
        >
          <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
            <Users className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">{requestsCount} friend request{requestsCount === 1 ? "" : "s"}</p>
            <p className="text-[11px] text-muted-foreground">Tap to review</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        </button>
      )}

      {items.length === 0 ? (
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
      ) : (
        <>
          {items.map((it, i) => (
            <ActivityFeedRow
              key={i}
              item={it}
              onOpenProfile={onOpenProfile}
              onGoToEvent={(id) => navigate(`/event/${id}`)}
            />
          ))}
          {hasMore && (
            <div className="pt-2 flex justify-center">
              <Button variant="outline" size="sm" className="rounded-xl gap-1.5" disabled={loadingMore} onClick={() => load(offset, false)}>
                {loadingMore ? <><Loader2 className="w-4 h-4 animate-spin" /> Loading…</> : "Load more"}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
