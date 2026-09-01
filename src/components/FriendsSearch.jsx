import { useState, useEffect, useRef } from "react";
import { api } from "@/api/data";
import { Search, UserPlus, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import Avatar from "./Avatar";

// Search every user with an account (by name or Instagram handle), see
// mutual-friend counts, and send friend requests directly.
export default function FriendsSearch({ me, friendEmails, sentSet, onSend }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [mutuals, setMutuals] = useState({});
  const [sendingTo, setSendingTo] = useState(null);
  const mutualCache = useRef({});

  const q = query.trim();

  // Debounced server search over all accounts. Ignores stale responses when the
  // query changes mid-flight.
  useEffect(() => {
    if (q.length < 2) { setResults([]); setSearching(false); return; }
    setSearching(true);
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const people = await api.auth.searchProfiles(q);
        if (cancelled) return;
        setResults(people.filter((u) => u.email !== me?.email));
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, me?.email]);

  const resultsKey = results.map((r) => r.email).join("|");

  useEffect(() => {
    if (!results.length) return;
    const missing = results.filter((r) => !(r.email in mutualCache.current));
    if (!missing.length) return;
    Promise.all(
      missing.map(async (r) => {
        const [sent, received] = await Promise.all([
          api.entities.FriendRequest.filter({ sender_email: r.email, status: "accepted" }),
          api.entities.FriendRequest.filter({ receiver_email: r.email, status: "accepted" }),
        ]);
        const theirFriends = new Set([
          ...sent.map((x) => x.receiver_email),
          ...received.map((x) => x.sender_email),
        ]);
        let count = 0;
        theirFriends.forEach((e) => { if (friendEmails.has(e)) count++; });
        mutualCache.current[r.email] = count;
        return [r.email, count];
      })
    )
      .then((pairs) => {
        setMutuals((prev) => {
          const next = { ...prev };
          pairs.forEach(([e, c]) => { next[e] = c; });
          return next;
        });
      })
      .catch(() => {});
  }, [resultsKey, friendEmails]);

  async function handleSend(target) {
    setSendingTo(target.email);
    await onSend(target);
    setSendingTo(null);
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people by name or @instagram..."
          className="w-full h-11 pl-10 pr-3 text-sm bg-secondary/50 border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {searching && <p className="text-xs text-muted-foreground text-center py-4">Searching...</p>}

      {!searching && q.length >= 2 && results.length === 0 && (
        <div className="py-8 text-center">
          <p className="text-sm text-muted-foreground">No one found matching "{query}"</p>
        </div>
      )}

      {!searching && q.length < 2 && (
        <div className="py-8 text-center">
          <Search className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Search by name to find anyone on DoorMan and send a friend request.</p>
        </div>
      )}

      {results.map((u) => {
        const isFriend = friendEmails.has(u.email);
        const sent = sentSet.has(u.email);
        const mc = mutuals[u.email];
        return (
          <div key={u.email} className="flex items-center gap-3 bg-secondary/40 rounded-xl px-4 py-3 border border-border/50">
            <Avatar src={u.profile_picture} name={u.full_name || u.email} size="w-10 h-10" textClass="text-sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{u.full_name}</p>
              <p className="text-[11px] text-muted-foreground">
                {mc !== undefined ? `${mc} mutual friend${mc === 1 ? "" : "s"}` : "Checking mutuals..."}
              </p>
            </div>
            {isFriend ? (
              <UserCheck className="w-4 h-4 text-emerald-400" />
            ) : sent ? (
              <span className="text-xs text-muted-foreground font-medium">Sent</span>
            ) : (
              <Button size="sm" className="rounded-full h-8 gap-1 text-xs" onClick={() => handleSend(u)} disabled={sendingTo === u.email}>
                <UserPlus className="w-3.5 h-3.5" /> Add
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}