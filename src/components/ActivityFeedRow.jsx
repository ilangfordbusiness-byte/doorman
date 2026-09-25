import moment from "moment";
import Avatar from "./Avatar";
import { COVERS } from "./CoverPicker";
import { UserPlus, Ticket, Sparkles } from "lucide-react";

// One row in the Activity feed. Three shapes: a friend going to an event, a
// friend hosting an event (both tap through to the event), and a new friendship
// (taps to open that person's profile).
function coverStyle(cover) {
  if (cover?.startsWith("__cover__")) {
    const id = cover.replace("__cover__", "");
    return COVERS.find((c) => c.id === id)?.style || null;
  }
  return null;
}

function EventThumb({ event }) {
  const style = coverStyle(event?.cover_image);
  if (style) return <div className="w-12 h-12 rounded-lg flex-shrink-0" style={style} />;
  if (event?.cover_image && !event.cover_image.startsWith("__cover__")) {
    return <img src={event.cover_image} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />;
  }
  return <div className="w-12 h-12 rounded-lg flex-shrink-0 bg-gradient-to-br from-primary/30 to-accent/20" />;
}

const rowClass =
  "w-full flex items-center gap-3 bg-secondary/40 rounded-xl px-4 py-3 border border-border/50 text-left hover:border-primary/30 transition-colors active:scale-[0.99]";

export default function ActivityFeedRow({ item, onOpenProfile, onGoToEvent }) {
  const actor = item.actors?.[0] || {};
  const when = item.ts ? moment(item.ts).fromNow() : "";

  if (item.type === "friend_added") {
    return (
      <button
        onClick={() => onOpenProfile?.({ email: actor.email, full_name: actor.name, profile_picture: actor.picture })}
        className={rowClass}
      >
        <Avatar src={actor.picture} name={actor.name} size="w-10 h-10" textClass="text-sm" />
        <div className="flex-1 min-w-0">
          <p className="text-sm truncate"><span className="font-semibold">You and {actor.name}</span> are now friends</p>
          <p className="text-[11px] text-muted-foreground">{when}</p>
        </div>
        <UserPlus className="w-4 h-4 text-emerald-400 flex-shrink-0" />
      </button>
    );
  }

  const ev = item.event || {};
  const extra = Math.max(0, (item.actor_count || 1) - 1);
  const who = extra > 0 ? `${actor.name} +${extra} other${extra === 1 ? "" : "s"}` : actor.name;
  const verb = item.type === "friend_hosting" ? "is hosting" : "is going to";
  const Icon = item.type === "friend_hosting" ? Sparkles : Ticket;

  return (
    <button onClick={() => ev.id && onGoToEvent?.(ev.id)} className={rowClass}>
      <div className="flex -space-x-2 flex-shrink-0">
        {(item.actors || []).slice(0, 3).map((a, i) => (
          <Avatar key={i} src={a.picture} name={a.name} size="w-8 h-8" textClass="text-[10px]" className="ring-2 ring-card" />
        ))}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate">
          <span className="font-semibold">{who}</span> {verb} <span className="font-semibold">{ev.title}</span>
        </p>
        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
          <Icon className="w-3 h-3" />
          {ev.date ? moment(ev.date).format("ddd, MMM D") : ""}{when ? ` · ${when}` : ""}
        </p>
      </div>
      <EventThumb event={ev} />
    </button>
  );
}
