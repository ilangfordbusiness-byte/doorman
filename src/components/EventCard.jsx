import { Link } from "react-router-dom";
import { COVERS } from "./CoverPicker";

function getCoverStyle(cover_image) {
  if (cover_image?.startsWith("__cover__")) {
    const id = cover_image.replace("__cover__", "");
    return COVERS.find((c) => c.id === id)?.style || null;
  }
  return null;
}
import { Clock, MapPin } from "lucide-react";
import moment from "moment";

export default function EventCard({ event, variant = "default" }) {
  const eventDate = moment(event.date);
  const isPast = eventDate.isBefore(moment(), "day");

  return (
    <Link to={`/event/${event.id}`} className="block group">
      <div className={`relative rounded-2xl overflow-hidden bg-card border transition-all duration-300 active:scale-[0.98]
        ${isPast ? "border-border/50" : "border-border hover:border-primary/40"}
        hover:shadow-[0_0_25px_hsl(270_90%_65%/0.15)]`}
      >
        {!isPast && (
          <div className="h-px w-full bg-gradient-to-r from-transparent via-primary/50 to-transparent group-hover:via-primary transition-all" />
        )}

        <div className="relative aspect-[4/5] overflow-hidden">{
          (() => {
            const coverStyle = getCoverStyle(event.cover_image);
            return coverStyle ? (
              <div className="w-full h-full" style={coverStyle}>
                <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: "repeating-linear-gradient(0deg, rgba(255,255,255,1) 0px, rgba(255,255,255,1) 1px, transparent 1px, transparent 3px)" }} />
              </div>
            ) : event.cover_image && !event.cover_image.startsWith("__cover__") ? (
              <img src={event.cover_image} alt={event.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-primary/20 via-card to-accent/10" />
            );
          })()
        }
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/20 to-transparent" />

          <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md rounded-xl px-3 py-1.5 border border-white/10">
            <p className="text-[10px] font-mono font-bold text-primary uppercase tracking-widest">
              {eventDate.format("MMM")}
            </p>
            <p className="text-lg font-bold font-heading text-foreground leading-tight">
              {eventDate.format("DD")}
            </p>
          </div>

          {isPast && (
            <div className="absolute top-3 right-3 bg-black/50 backdrop-blur-md rounded-full px-3 py-1 border border-white/10">
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Past</span>
            </div>
          )}

          {event.status === "draft" && (
            <div className="absolute top-3 right-3 bg-amber-500/10 backdrop-blur-md rounded-full px-3 py-1 border border-amber-500/30">
              <span className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-widest">Draft</span>
            </div>
          )}
        </div>

        <div className="p-4 space-y-2">
          <h3 className="font-heading font-bold text-lg text-foreground truncate group-hover:text-primary transition-colors">
            {event.title}
          </h3>

          <div className="flex items-center gap-4 text-xs text-muted-foreground font-mono">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-primary/60" />
              {event.start_time}
            </span>
            {event.venue_name && (
              <span className="flex items-center gap-1.5 truncate">
                <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-accent/60" />
                {event.venue_name}
              </span>
            )}
          </div>

          {event.host_name && variant !== "minimal" && (
            <p className="text-xs text-muted-foreground font-mono">
              <span className="text-primary/50">host://</span>
              <span className="text-foreground/70">{event.host_name}</span>
            </p>
          )}
        </div>

        <div
          className="absolute inset-0 pointer-events-none opacity-[0.015]"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />
      </div>
    </Link>
  );
}