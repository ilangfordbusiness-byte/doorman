import { useState } from "react";
import { Link } from "react-router-dom";
import { MapPin, Clock, Bookmark, ArrowRight, Sparkles } from "lucide-react";
import { COVERS } from "@/components/CoverPicker";
import Avatar from "@/components/Avatar";
import moment from "moment";

function coverStyle(cover_image) {
  if (cover_image?.startsWith("__cover__")) {
    const id = cover_image.replace("__cover__", "");
    return COVERS.find((c) => c.id === id)?.style || null;
  }
  return null;
}

function relativeLabel(date) {
  const m = moment(date);
  if (m.isSame(moment(), "day")) return "TONIGHT";
  if (m.isSame(moment().add(1, "day"), "day")) return "TOMORROW";
  return m.format("ddd, MMM D").toUpperCase();
}

export default function UpcomingEventHero({ event, isHosting, friendsGoing, attendeeCount, loading }) {
  const [saved, setSaved] = useState(false);

  if (loading) {
    return (
      <div>
        <p className="text-[10px] font-mono text-muted-foreground tracking-widest uppercase mb-2">TONIGHT</p>
        <div className="h-64 rounded-2xl bg-card border border-border animate-pulse" />
      </div>
    );
  }

  if (!event) {
    return (
      <div>
        <p className="text-[10px] font-mono text-muted-foreground tracking-widest uppercase mb-2">NO PLANS YET</p>
        <Link to="/guest?tab=discover" className="block group">
          <div className="relative rounded-2xl border border-primary/30 bg-card overflow-hidden p-5 transition-all duration-300 active:scale-[0.99] group-hover:border-primary/60">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center border border-white/5">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-heading font-bold text-base text-foreground">Browse what's on</p>
                <p className="text-xs text-muted-foreground">Find events happening near you</p>
              </div>
              <ArrowRight className="w-4 h-4 text-primary" />
            </div>
          </div>
        </Link>
      </div>
    );
  }

  const bg = coverStyle(event.cover_image);
  const hasImg = event.cover_image && !event.cover_image.startsWith("__cover__");
  const label = relativeLabel(event.date);
  const shownFriends = friendsGoing.slice(0, 3);
  const extraFriends = Math.max(0, friendsGoing.length - 3);

  return (
    <div>
      <p className="text-[10px] font-mono text-muted-foreground tracking-widest uppercase mb-2">{label}</p>
      <Link to={`/event/${event.id}`} className="block group">
        <div className="relative rounded-2xl overflow-hidden border border-primary/30 h-64 transition-all duration-300 group-hover:border-primary/60">
          {/* Background */}
          {hasImg ? (
            <img src={event.cover_image} alt={event.title} className="absolute inset-0 w-full h-full object-cover" />
          ) : bg ? (
            <div className="absolute inset-0" style={bg} />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-card to-accent/20" />
          )}
          {/* Dark gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/20" />

          {/* Top row: badge + bookmark */}
          <div className="absolute top-3 left-3 right-3 flex items-start justify-between">
            <span className="bg-primary text-primary-foreground text-[10px] font-mono font-bold tracking-widest px-2 py-1 rounded-md">
              {isHosting ? "HOSTING" : "INVITE"}
            </span>
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSaved((s) => !s); }}
              className="w-8 h-8 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10"
            >
              <Bookmark className={`w-4 h-4 ${saved ? "fill-primary text-primary" : "text-white"}`} />
            </button>
          </div>

          {/* Bottom content */}
          <div className="absolute bottom-0 left-0 right-0 p-4">
            <h2 className="font-heading font-bold text-2xl text-white leading-tight drop-shadow-lg">{event.title}</h2>
            <div className="flex items-center gap-1.5 mt-1.5 text-xs text-white/80 font-mono">
              <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{event.venue_name || "TBA"}{event.address ? ` · ${event.address}` : ""}</span>
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-white/80 font-mono">
              <Clock className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{moment(event.date).format("MMM D")}{event.start_time ? ` · ${event.start_time}` : ""}{event.end_time ? ` – ${event.end_time}` : ""}</span>
            </div>

            {/* Friends going + view invite */}
            <div className="flex items-end justify-between mt-3 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {friendsGoing.length > 0 ? (
                  <>
                    <div className="flex -space-x-2 flex-shrink-0">
                      {shownFriends.map((f) => (
                        <Avatar key={f.email} src={f.picture} name={f.name} size="w-7 h-7" textClass="text-[9px] text-white" className="border-2 border-black/60 bg-secondary" />
                      ))}
                      {extraFriends > 0 && (
                        <div className="w-7 h-7 rounded-full bg-black/60 border-2 border-black/60 flex items-center justify-center">
                          <span className="text-[9px] font-bold text-white">+{extraFriends}</span>
                        </div>
                      )}
                    </div>
                    <span className="text-[11px] text-white/80 font-medium truncate">
                      {friendsGoing.length} friend{friendsGoing.length === 1 ? "" : "s"} going
                    </span>
                  </>
                ) : attendeeCount > 0 ? (
                  <span className="text-[11px] text-white/70 font-medium">{attendeeCount} going</span>
                ) : null}
              </div>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-white bg-white/10 border border-white/20 rounded-full px-3 py-1.5 backdrop-blur-md flex-shrink-0">
                VIEW INVITE <ArrowRight className="w-3 h-3" />
              </span>
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}