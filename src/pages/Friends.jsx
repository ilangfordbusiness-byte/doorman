import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, UserPlus, Users, Check, X, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

export default function Friends() {
  const { toast } = useToast();
  const [tab, setTab] = useState("suggestions");
  const [me, setMe] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [requests, setRequests] = useState([]);
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sentSet, setSentSet] = useState(new Set());

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const user = await base44.auth.me();
    setMe(user);

    // All friend requests involving me
    const [sent, received, allUsers, myEntries] = await Promise.all([
      base44.entities.FriendRequest.filter({ sender_email: user.email }),
      base44.entities.FriendRequest.filter({ receiver_email: user.email }),
      base44.entities.User.list(),
      base44.entities.GuestlistEntry.filter({ guest_email: user.email }),
    ]);

    // Friends = accepted requests
    const acceptedSent = sent.filter((r) => r.status === "accepted").map((r) => ({ email: r.receiver_email, name: r.receiver_name, picture: r.receiver_picture }));
    const acceptedReceived = received.filter((r) => r.status === "accepted").map((r) => ({ email: r.sender_email, name: r.sender_name, picture: r.sender_picture }));
    setFriends([...acceptedSent, ...acceptedReceived]);

    // Pending incoming requests
    setRequests(received.filter((r) => r.status === "pending"));

    // Already connected emails
    const sentEmails = new Set(sent.map((r) => r.receiver_email));
    setSentSet(sentEmails);
    const connectedEmails = new Set([
      user.email,
      ...sent.map((r) => r.receiver_email),
      ...received.map((r) => r.sender_email),
    ]);

    // Suggestion pool: people from same events first, then others
    const myEventIds = [...new Set(myEntries.map((e) => e.event_id))];
    let suggestedEmails = new Set();
    let suggestedUsers = [];

    if (myEventIds.length > 0) {
      const coAttendees = await Promise.all(
        myEventIds.map((eid) =>
          base44.entities.GuestlistEntry.filter({ event_id: eid })
        )
      );
      const flat = coAttendees.flat().filter((e) => e.guest_email && !connectedEmails.has(e.guest_email));
      flat.forEach((e) => {
        if (!suggestedEmails.has(e.guest_email)) {
          suggestedEmails.add(e.guest_email);
          const u = allUsers.find((u) => u.email === e.guest_email);
          if (u) suggestedUsers.push({ ...u, reason: "Attended same event" });
        }
      });
    }

    // Fill with other users
    allUsers.forEach((u) => {
      if (!connectedEmails.has(u.email) && !suggestedEmails.has(u.email)) {
        suggestedUsers.push({ ...u, reason: "On the app" });
      }
    });

    setSuggestions(suggestedUsers.slice(0, 20));
    setLoading(false);
  }

  async function sendRequest(target) {
    setSentSet((prev) => new Set([...prev, target.email]));
    await base44.entities.FriendRequest.create({
      sender_email: me.email,
      sender_name: me.full_name,
      sender_picture: me.profile_picture || "",
      receiver_email: target.email,
      receiver_name: target.full_name,
      receiver_picture: target.profile_picture || "",
      status: "pending",
    });
    toast({ title: "Friend request sent!" });
  }

  async function respond(req, status) {
    await base44.entities.FriendRequest.update(req.id, { status });
    setRequests((prev) => prev.filter((r) => r.id !== req.id));
    if (status === "accepted") {
      setFriends((prev) => [...prev, { email: req.sender_email, name: req.sender_name, picture: req.sender_picture }]);
      toast({ title: "Friend added!" });
    }
  }

  const tabs = [
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

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {tab === "suggestions" && (
            <div className="space-y-2">
              {suggestions.length === 0 && <Empty message="No suggestions right now" />}
              {suggestions.map((u) => (
                <UserRow key={u.email} user={u} reason={u.reason}>
                  {sentSet.has(u.email) ? (
                    <span className="text-xs text-muted-foreground font-medium">Sent</span>
                  ) : (
                    <Button size="sm" className="rounded-full h-8 gap-1 text-xs" onClick={() => sendRequest(u)}>
                      <UserPlus className="w-3.5 h-3.5" /> Add
                    </Button>
                  )}
                </UserRow>
              ))}
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
                <UserRow key={f.email} user={{ full_name: f.name, email: f.email, profile_picture: f.picture }} reason="Friend">
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

function UserRow({ user, reason, children }) {
  return (
    <div className="flex items-center gap-3 bg-secondary/40 rounded-xl px-4 py-3 border border-border/50">
      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
        {user.profile_picture ? (
          <img src={user.profile_picture} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="font-bold text-primary text-sm">{(user.full_name || "?")[0].toUpperCase()}</span>
        )}
      </div>
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