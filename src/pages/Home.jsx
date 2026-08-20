import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import moment from "moment";
import UpcomingEventHero from "@/components/home/UpcomingEventHero";
import QuickActions from "@/components/home/QuickActions";
import SectionGrid from "@/components/home/SectionGrid";

export default function Home() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState(null);
  const [isHosting, setIsHosting] = useState(false);
  const [friendsGoing, setFriendsGoing] = useState([]);
  const [attendeeCount, setAttendeeCount] = useState(0);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const me = await base44.auth.me();
    setUser(me);
    const today = moment().startOf("day").format("YYYY-MM-DD");

    const [entries, hosted] = await Promise.all([
      base44.entities.GuestlistEntry.filter({ guest_email: me.email }),
      base44.entities.Event.filter({ host_email: me.email }),
    ]);

    const attendingIds = [...new Set(
      entries.filter((e) => ["approved", "invited", "checked_in"].includes(e.status)).map((e) => e.event_id)
    )];

    const attendingEvents = await Promise.all(
      attendingIds.map((eid) =>
        base44.entities.Event.filter({ id: eid }).then((r) => r[0]).catch(() => null)
      )
    );

    const seen = new Set();
    const upcoming = [...attendingEvents.filter(Boolean), ...hosted]
      .filter((ev) => {
        if (seen.has(ev.id)) return false;
        seen.add(ev.id);
        return ev.date >= today && ev.status !== "cancelled";
      })
      .sort((a, b) => (a.date > b.date ? 1 : -1));

    if (upcoming.length > 0) {
      const ev = upcoming[0];
      setEvent(ev);
      setIsHosting(hosted.some((h) => h.id === ev.id));

      const [attendees, sent, received] = await Promise.all([
        base44.entities.GuestlistEntry.filter({ event_id: ev.id }),
        base44.entities.FriendRequest.filter({ sender_email: me.email }),
        base44.entities.FriendRequest.filter({ receiver_email: me.email }),
      ]);
      const going = new Set(
        attendees.filter((a) => ["approved", "invited", "checked_in"].includes(a.status)).map((a) => a.guest_email)
      );
      setAttendeeCount(going.size);
      const friends = [
        ...sent.filter((r) => r.status === "accepted").map((r) => ({ email: r.receiver_email, name: r.receiver_name, picture: r.receiver_picture })),
        ...received.filter((r) => r.status === "accepted").map((r) => ({ email: r.sender_email, name: r.sender_name, picture: r.sender_picture })),
      ];
      setFriendsGoing(friends.filter((f) => going.has(f.email)));
    }
    setLoading(false);
  }

  const firstName = user?.full_name?.split(" ")[0] || "";

  return (
    <div className="min-h-screen flex flex-col px-4 pt-5 pb-8 max-w-lg mx-auto">
      {/* Header */}
      <div className="relative flex items-center justify-center">
        <img
          src="https://media.base44.com/images/public/69d556d1ae7f4cada8ab83ef/e327a8610_logotransparent.png"
          alt="DoorMan"
          className="w-8 h-8 object-contain absolute left-0"
        />
        <span className="font-heading font-bold text-4xl tracking-widest text-foreground uppercase">
          Door<span className="text-primary" style={{ textShadow: "0 0 20px hsl(270 90% 65% / 0.8)" }}>Man</span>
        </span>
        <div className="absolute right-0 flex items-center gap-1.5 px-2 py-1 rounded-full border border-accent/30 bg-accent/5">
          <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" style={{ boxShadow: "0 0 6px hsl(180 100% 50%)" }} />
          <span className="text-[10px] font-mono text-accent tracking-widest">LIVE</span>
        </div>
      </div>

      {/* Greeting */}
      <div className="mt-3">
        <h1 className="font-heading font-bold text-base text-foreground leading-tight">
          Hey, {firstName ? <span className="text-primary">{firstName}</span> : "there"}
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">Your night starts here.</p>
      </div>

      {/* Upcoming event hero */}
      <div className="mt-5">
        <UpcomingEventHero
          event={event}
          isHosting={isHosting}
          friendsGoing={friendsGoing}
          attendeeCount={attendeeCount}
          loading={loading}
        />
      </div>

      {/* Quick actions */}
      <div className="mt-5">
        <QuickActions user={user} />
      </div>

      {/* Main sections 2x2 grid */}
      <div className="mt-5">
        <SectionGrid />
      </div>
    </div>
  );
}