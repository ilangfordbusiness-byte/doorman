import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "@/api/data";
import { ArrowLeft, Search, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog";
import GuestCard from "../components/GuestCard";
import LoadingSpinner from "../components/LoadingSpinner";
import Avatar from "../components/Avatar";
import { useProfiles } from "@/hooks/useProfiles";
import FriendProfile from "../components/FriendProfile";

export default function GuestlistManagement() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [event, setEvent] = useState(null);
  const [guests, setGuests] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [newGuest, setNewGuest] = useState({ name: "", email: "", phone: "" });
  const [adding, setAdding] = useState(false);
  const [friends, setFriends] = useState([]);
  const [me, setMe] = useState(null);
  const [viewProfile, setViewProfile] = useState(null);
  const { data: profiles } = useProfiles(guests.map((g) => g.guest_email).filter(Boolean));

  useEffect(() => {
    loadData();
    loadFriends();
  }, [id]);

  async function loadFriends() {
    try {
      const user = await api.auth.me();
      setMe(user);
      const sent = await api.entities.FriendRequest.filter({ sender_email: user.email, status: "accepted" });
      const received = await api.entities.FriendRequest.filter({ receiver_email: user.email, status: "accepted" });
      const friendList = [
        ...sent.map((r) => ({ name: r.receiver_name, email: r.receiver_email, picture: r.receiver_picture })),
        ...received.map((r) => ({ name: r.sender_name, email: r.sender_email, picture: r.sender_picture })),
      ];
      setFriends(friendList);
    } catch (e) {
      console.error(e);
    }
  }

  async function loadData() {
    try {
      const events = await api.entities.Event.filter({ id });
      if (events.length) setEvent(events[0]);
      const entries = await api.entities.GuestlistEntry.filter({ event_id: id }, "-created_date");
      setGuests(entries);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(guest, status) {
    const updates = { status };
    if (status === "approved" && !guest.qr_secret) {
      updates.qr_secret = crypto.randomUUID();
    }
    await api.entities.GuestlistEntry.update(guest.id, updates);
    toast({ title: `Guest ${status}` });
    // Email the guest their free ticket (QR + pass link) once approved.
    if (status === "approved" && guest.guest_email && !event?.is_paid) {
      api.functions.invoke("sendTicketEmail", { entry_id: guest.id }).catch(() => {});
    }
    loadData();
  }

  async function toggleChat(guest) {
    await api.entities.GuestlistEntry.update(guest.id, { can_chat: !guest.can_chat });
    toast({ title: guest.can_chat ? "Chat access revoked" : `${guest.guest_name || "Guest"} can now chat` });
    loadData();
  }

  async function addFriendToGuestlist(friend) {
    const existing = guests.find((g) => g.guest_email === friend.email);
    if (existing) {
      toast({ title: "Already on guestlist", variant: "destructive" });
      return;
    }
    await api.entities.GuestlistEntry.create({
      event_id: id,
      guest_email: friend.email,
      guest_name: friend.name,
      guest_phone: "",
      status: "invited",
      source: "manual",
      qr_secret: crypto.randomUUID(),
    });
    toast({ title: `${friend.name} invited!` });
    loadData();
  }

  async function addGuest() {
    if (!newGuest.email && !newGuest.phone) {
      toast({ title: "Email or phone required", variant: "destructive" });
      return;
    }
    setAdding(true);

    const existing = guests.find(
      (g) =>
        (newGuest.email && g.guest_email === newGuest.email) ||
        (newGuest.phone && g.guest_phone === newGuest.phone)
    );
    if (existing) {
      toast({ title: "Guest already on list", variant: "destructive" });
      setAdding(false);
      return;
    }

    await api.entities.GuestlistEntry.create({
      event_id: id,
      guest_email: newGuest.email || "",
      guest_name: newGuest.name,
      guest_phone: newGuest.phone || "",
      status: "invited",
      source: "manual",
      qr_secret: crypto.randomUUID(),
    });

    toast({ title: "Guest added!" });
    setNewGuest({ name: "", email: "", phone: "" });
    setAddOpen(false);
    setAdding(false);
    loadData();
  }

  const filtered = guests.filter((g) => {
    const q = search.toLowerCase();
    return (
      (g.guest_name || "").toLowerCase().includes(q) ||
      (g.guest_email || "").toLowerCase().includes(q) ||
      (g.guest_phone || "").includes(q)
    );
  });

  const byStatus = (status) => filtered.filter((g) => g.status === status);
  const requests = byStatus("requested");
  const approved = [...byStatus("approved"), ...byStatus("invited")];
  const checkedIn = byStatus("checked_in");
  const denied = [...byStatus("denied"), ...byStatus("revoked")];
  const waitlist = byStatus("waitlist");

  if (loading) return <LoadingSpinner fullScreen />;

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="icon" className="rounded-full" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="font-heading font-bold text-lg">Guestlist</h1>
          <p className="text-xs text-muted-foreground">{event?.title} · {guests.length} guests</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="rounded-full gap-1.5 bg-primary hover:bg-primary/90">
              <UserPlus className="w-4 h-4" /> Add
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border max-w-sm">
            <DialogHeader>
              <DialogTitle className="font-heading">Add Guest</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-2">
              <div>
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">Quick Add from Friends</p>
                  {friends.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-3 bg-secondary/40 rounded-xl border border-border/50">No friends on the app yet — add friends from the Friends tab</p>
                  ) : (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {friends.map((f) => {
                      const alreadyAdded = guests.some((g) => g.guest_email === f.email);
                      return (
                        <div key={f.email} className="flex items-center gap-3 bg-secondary/50 rounded-xl px-3 py-2 border border-border/50">
                          <Avatar src={f.picture} name={f.name || f.email} size="w-7 h-7" textClass="text-xs" />
                          <span className="flex-1 text-sm font-medium text-foreground truncate">{f.name || f.email}</span>
                          <button
                            onClick={() => addFriendToGuestlist(f)}
                            disabled={alreadyAdded}
                            className={`text-xs font-semibold px-3 py-1 rounded-lg transition-colors ${
                              alreadyAdded
                                ? "text-muted-foreground bg-muted cursor-not-allowed"
                                : "text-primary-foreground bg-primary hover:bg-primary/80"
                            }`}
                          >
                            {alreadyAdded ? "Added" : "Invite"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  )}
                  <div className="border-t border-border/50 my-3" />
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">Add Manually</p>
                </div>
              <Input
                placeholder="Name"
                value={newGuest.name}
                onChange={(e) => setNewGuest((p) => ({ ...p, name: e.target.value }))}
                className="bg-secondary/50 border-border h-11 rounded-xl"
              />
              <Input
                placeholder="Email (or leave blank)"
                type="email"
                value={newGuest.email}
                onChange={(e) => setNewGuest((p) => ({ ...p, email: e.target.value }))}
                className="bg-secondary/50 border-border h-11 rounded-xl"
              />
              <Input
                placeholder="Phone (or leave blank)"
                value={newGuest.phone}
                onChange={(e) => setNewGuest((p) => ({ ...p, phone: e.target.value }))}
                className="bg-secondary/50 border-border h-11 rounded-xl"
              />
              <p className="text-xs text-muted-foreground text-center">At least one of email or phone is required</p>
              <Button className="w-full h-11 rounded-xl bg-primary" onClick={addGuest} disabled={adding}>
                {adding ? "Adding..." : "Add to Guestlist"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search guests..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 bg-secondary/50 border-border h-11 rounded-xl"
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue={requests.length > 0 ? "requests" : "approved"} className="w-full">
        <TabsList className="w-full bg-secondary/50 border border-border rounded-xl p-1 mb-4">
          <TabsTrigger value="requests" className="flex-1 rounded-lg text-[11px] font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Requests {requests.length > 0 && `(${requests.length})`}
          </TabsTrigger>
          <TabsTrigger value="approved" className="flex-1 rounded-lg text-[11px] font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Approved ({approved.length})
          </TabsTrigger>
          <TabsTrigger value="checked" className="flex-1 rounded-lg text-[11px] font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            In ({checkedIn.length})
          </TabsTrigger>
          <TabsTrigger value="other" className="flex-1 rounded-lg text-[11px] font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Other
          </TabsTrigger>
        </TabsList>

        <TabsContent value="requests" className="space-y-2">
          {requests.length === 0 ? (
            <EmptyTab message="No pending requests" />
          ) : (
            requests.map((g) => (
              <GuestCard
                key={g.id}
                guest={g}
                picture={profiles?.[g.guest_email?.toLowerCase()]?.picture}
                onViewProfile={setViewProfile}
                onApprove={(g) => updateStatus(g, "approved")}
                onDeny={(g) => updateStatus(g, "denied")}
                onWaitlist={(g) => updateStatus(g, "waitlist")}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="approved" className="space-y-2">
          {approved.length === 0 ? (
            <EmptyTab message="No approved guests yet" />
          ) : (
            approved.map((g) => (
              <GuestCard
                key={g.id}
                guest={g}
                picture={profiles?.[g.guest_email?.toLowerCase()]?.picture}
                onViewProfile={setViewProfile}
                onDeny={(g) => updateStatus(g, "revoked")}
                onToggleChat={toggleChat}
                showActions={true}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="checked" className="space-y-2">
          {checkedIn.length === 0 ? (
            <EmptyTab message="No check-ins yet" />
          ) : (
            checkedIn.map((g) => (
              <GuestCard key={g.id} guest={g} picture={profiles?.[g.guest_email?.toLowerCase()]?.picture}
                onViewProfile={setViewProfile} onToggleChat={toggleChat} showActions={true} />
            ))
          )}
        </TabsContent>

        <TabsContent value="other" className="space-y-2">
          {waitlist.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground uppercase font-semibold px-1">Waitlist</p>
              {waitlist.map((g) => (
                <GuestCard
                  key={g.id}
                  guest={g}
                  picture={profiles?.[g.guest_email?.toLowerCase()]?.picture}
                onViewProfile={setViewProfile}
                  onApprove={(g) => updateStatus(g, "approved")}
                  onDeny={(g) => updateStatus(g, "denied")}
                />
              ))}
            </>
          )}
          {denied.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground uppercase font-semibold px-1 mt-4">Denied / Revoked</p>
              {denied.map((g) => (
                <GuestCard
                  key={g.id}
                  guest={g}
                  picture={profiles?.[g.guest_email?.toLowerCase()]?.picture}
                onViewProfile={setViewProfile}
                  onApprove={(g) => updateStatus(g, "approved")}
                  showActions={true}
                />
              ))}
            </>
          )}
          {waitlist.length === 0 && denied.length === 0 && (
            <EmptyTab message="No waitlisted or denied guests" />
          )}
        </TabsContent>
      </Tabs>

      {viewProfile && (
        <FriendProfile
          friend={{
            email: viewProfile.guest_email,
            name: viewProfile.guest_name,
            picture: profiles?.[viewProfile.guest_email?.toLowerCase()]?.picture,
          }}
          myEmail={me?.email}
          myFriends={friends}
          onClose={() => setViewProfile(null)}
        />
      )}
    </div>
  );
}

function EmptyTab({ message }) {
  return (
    <div className="py-12 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}