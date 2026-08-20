import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { ArrowLeft, UserPlus, Users, Check, X, UserCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import LoadingSpinner from "../components/LoadingSpinner";
import Avatar from "../components/Avatar";
import FriendProfile from "../components/FriendProfile";
import SuggestionProfile from "../components/SuggestionProfile";
import FriendsSearch from "../components/FriendsSearch";

const PAGE_SIZE = 20;

async function loadFriendsData(me) {
  const [sent, received] = await Promise.all([
    base44.entities.FriendRequest.filter({ sender_email: me.email }),
    base44.entities.FriendRequest.filter({ receiver_email: me.email }),
  ]);
  const acceptedSent = sent.filter((r) => r.status === "accepted").map((r) => ({ email: r.receiver_email, name: r.receiver_name, picture: r.receiver_picture }));
  const acceptedReceived = received.filter((r) => r.status === "accepted").map((r) => ({ email: r.sender_email, name: r.sender_name, picture: r.sender_picture }));
  return {
    me,
    friends: [...acceptedSent, ...acceptedReceived],
    requests: received.filter((r) => r.status === "pending"),
    sentSet: new Set(sent.map((r) => r.receiver_email)),
  };
}

export default function Friends() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("suggestions");
  const { data: me } = useCurrentUser();
  const { data: fd, isLoading: loading } = useQuery({
    queryKey: ["friendsData"],
    queryFn: () => loadFriendsData(me),
    enabled: !!me,
    staleTime: 60 * 1000,
  });
  const friends = fd?.friends ?? [];
  const requests = fd?.requests ?? [];
  const sentSet = fd?.sentSet ?? new Set();
  const [viewingFriend, setViewingFriend] = useState(null);
  const [viewingSuggestion, setViewingSuggestion] = useState(null);

  // Paginated suggestions state
  const [suggestions, setSuggestions] = useState([]);
  const [sugLoading, setSugLoading] = useState(false);
  const [sugHasMore, setSugHasMore] = useState(false);
  const [sugTotal, setSugTotal] = useState(0);
  const sentinelRef = useRef(null);

  useEffect(() => {
    loadSuggestions(true);
  }, []);

  async function loadSuggestions(reset) {
    if (sugLoading) return;
    setSugLoading(true);
    try {
      const offset = reset ? 0 : suggestions.length;
      const res = await base44.functions.invoke("getFriendSuggestions", { offset, limit: PAGE_SIZE });
      const data = res.data;
      if (data?.error) throw new Error(data.error);
      const items = data.items || [];
      setSuggestions(reset ? items : [...suggestions, ...items]);
      setSugHasMore(!!data.hasMore);
      setSugTotal(data.total || 0);
    } catch {
      if (reset) setSuggestions([]);
    }
    setSugLoading(false);
  }

  // Infinite scroll: when the sentinel is visible, load the next page.
  useEffect(() => {
    if (tab !== "suggestions" || !sugHasMore || sugLoading) return;
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadSuggestions(false); },
      { rootMargin: "300px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [tab, sugHasMore, sugLoading, suggestions.length]);

  async function sendRequest(target) {
    await base44.entities.FriendRequest.create({
      sender_email: me.email,
      sender_name: me.full_name,
      sender_picture: me.profile_picture || "",
      receiver_email: target.email,
      receiver_name: target.full_name,
      receiver_picture: target.profile_picture || "",
      status: "pending",
    });
    queryClient.invalidateQueries(["friendsData"]);
    toast({ title: "Friend request sent!" });
  }

  async function respond(req, status) {
    await base44.entities.FriendRequest.update(req.id, { status });
    queryClient.invalidateQueries(["friendsData"]);
    if (status === "accepted") {
      toast({ title: "Friend added!" });
    }
  }

  const tabs = [
    { id: "search", label: "Search" },
    { id: "suggestions", label: "Suggestions" },
    { id: "requests", label: `Requests${requests.length ? ` (${requests.length})` : ""}` },
    { id: "friends", label: `Friends${friends.length ? ` (${friends.length})` : ""}` },
  ];

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-8">
      <div className="flex items-center gap-3 mb-5">
        <Link to="/">
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <h1 className="font-heading font-bold text-xl">Friends</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-secondary/50 rounded-xl p-1 mb-5">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
              tab === t.id ? "bg-card text-foreground shadow" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {viewingFriend && (
        <FriendProfile
          friend={viewingFriend}
          myEmail={me?.email}
          myFriends={friends}
          onClose={() => setViewingFriend(null)}
        />
      )}

      {viewingSuggestion && (
        <SuggestionProfile
          user={viewingSuggestion}
          myEmail={me?.email}
          myFriends={friends}
          sent={sentSet.has(viewingSuggestion.email)}
          onSend={() => { sendRequest(viewingSuggestion); setViewingSuggestion(null); }}
          onClose={() => setViewingSuggestion(null)}
        />
      )}

      {loading ? (
        <LoadingSpinner />
      ) : (
        <>
          {tab === "search" && (
            <FriendsSearch
              me={me}
              friendEmails={new Set(friends.map((f) => f.email))}
              sentSet={sentSet}
              onSend={sendRequest}
            />
          )}

          {tab === "suggestions" && (
            <div className="space-y-2">
              {suggestions.length === 0 && !sugLoading && (
                <Empty message="No suggestions right now" />
              )}
              {suggestions.map((u) => {
                const mutual = Number(u.mutual || 0);
                const reason = mutual > 0 ? `${mutual} mutual friend${mutual === 1 ? "" : "s"}` : "";
                return (
                  <UserRow key={u.email} user={u} reason={reason} onClick={() => setViewingSuggestion(u)}>
                    {sentSet.has(u.email) ? (
                      <span className="text-xs text-muted-foreground font-medium">Sent</span>
                    ) : (
                      <Button size="sm" className="rounded-full h-8 gap-1 text-xs" onClick={(e) => { e.stopPropagation(); sendRequest(u); }}>
                        <UserPlus className="w-3.5 h-3.5" /> Add
                      </Button>
                    )}
                  </UserRow>
                );
              })}
              {sugHasMore && <div ref={sentinelRef} className="h-10" />}
              {sugLoading && (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
                </div>
              )}
              {!sugHasMore && suggestions.length > 0 && !sugLoading && (
                <p className="text-center text-xs text-muted-foreground py-4">
                  {sugTotal > 0 ? `That's everyone (${sugTotal})` : ""}
                </p>
              )}
            </div>
          )}

          {tab === "requests" && (
            <div className="space-y-2">
              {requests.length === 0 && <Empty message="No pending requests" />}
              {requests.map((req) => (
                <UserRow key={req.id} user={{ full_name: req.sender_name, email: req.sender_email, profile_picture: req.sender_picture }} reason="Wants to be friends">
                  <div className="flex gap-1.5">
                    <button onClick={() => respond(req, "accepted")} className="w-8 h-8 rounded-full bg-emerald-500/15 flex items-center justify-center text-emerald-400 hover:bg-emerald-500/25 transition-colors">
                      <Check className="w-4 h-4" />
                    </button>
                    <button onClick={() => respond(req, "declined")} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </UserRow>
              ))}
            </div>
          )}

          {tab === "friends" && (
            <div className="space-y-2">
              {friends.length === 0 && <Empty message="No friends yet — check Suggestions!" />}
              {friends.map((f) => (
                <UserRow
                  key={f.email}
                  user={{ full_name: f.name, email: f.email, profile_picture: f.picture }}
                  reason="Friend"
                  onClick={() => setViewingFriend(f)}
                >
                  <UserCheck className="w-4 h-4 text-emerald-400" />
                </UserRow>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function UserRow({ user, reason, children, onClick }) {
  return (
    <div
      className={`flex items-center gap-3 bg-secondary/40 rounded-xl px-4 py-3 border border-border/50 ${onClick ? "cursor-pointer hover:border-primary/30 transition-colors active:scale-[0.99]" : ""}`}
      onClick={onClick}
    >
      <Avatar src={user.profile_picture} name={user.full_name || user.email} size="w-10 h-10" textClass="text-sm" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{user.full_name || user.email}</p>
        {reason && <p className="text-[11px] text-muted-foreground">{reason}</p>}
      </div>
      {children}
    </div>
  );
}

function Empty({ message }) {
  return (
    <div className="py-12 text-center">
      <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}