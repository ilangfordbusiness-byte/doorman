import { Link } from "react-router-dom";
import { Calendar, Clock, MapPin, Users } from "lucide-react";
import moment from "moment";

export default function EventCard({ event, variant = "default" }) {
  const eventDate = moment(event.date);
  const isPast = eventDate.isBefore(moment(), "day");

  return (
    <Link
      to={`/event/${event.id}`}
      className="block group"
    >
      <div className="relative rounded-2xl overflow-hidden bg-card border border-border hover:border-primary/30 transition-all duration-300">
        {/* Cover Image */}
        <div className="relative h-44 overflow-hidden">
          {event.cover_image ? (
            <img
              src={event.cover_image}
              alt={event.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary/30 via-primary/10 to-accent/20" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent" />
          
          {/* Date badge */}
          <div className="absolute top-3 left-3 bg-card/80 backdrop-blur-md rounded-xl px-3 py-1.5 border border-border/50">
            <p className="text-[10px] font-semibold text-primary uppercase tracking-wider">
              {eventDate.format("MMM")}
            </p>
            <p className="text-lg font-bold font-heading text-foreground leading-tight">
              {eventDate.format("DD")}
            </p>
          </div>

          {isPast && (
            <div className="absolute top-3 right-3 bg-muted/80 backdrop-blur-md rounded-full px-3 py-1">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase">Past</span>
            </div>
          )}

          {event.status === "draft" && (
            <div className="absolute top-3 right-3 bg-accent/20 backdrop-blur-md rounded-full px-3 py-1 border border-accent/30">
              <span className="text-[10px] font-semibold text-accent uppercase">Draft</span>
            </div>
          )}
        </div>

        {/* Details */}
        <div className="p-4 space-y-2">
          <h3 className="font-heading font-bold text-lg text-foreground truncate group-hover:text-primary transition-colors">
            {event.title}
          </h3>
          
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              {event.start_time}
            </span>
            {event.venue_name && (
              <span className="flex items-center gap-1.5 truncate">
                <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                {event.venue_name}
              </span>
            )}
          </div>

          {event.host_name && variant !== "minimal" && (
            <p className="text-xs text-muted-foreground">
              by <span className="text-foreground font-medium">{event.host_name}</span>
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}