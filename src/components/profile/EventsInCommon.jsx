import { Link } from "react-router-dom";
import moment from "moment";
import { coverStyleFor } from "@/lib/eventCover";

// Shared "Events in Common" section: cover-art cards for events both people
// are on. Renders nothing when there are none.
export default function EventsInCommon({ events, onClose }) {
  if (!events || events.length === 0) return null;
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mb-2">
        Events in Common ({events.length})
      </p>
      <div className="space-y-2.5">
        {events.map((evt) => {
          const coverStyle = coverStyleFor(evt.cover_image);
          const coverImg = evt.cover_image && !evt.cover_image.startsWith("__cover__") ? evt.cover_image : null;
          return (
            <Link
              key={evt.id}
              to={`/event/${evt.id}`}
              onClick={onClose}
              className="flex items-center gap-3 bg-secondary/60 rounded-2xl p-2.5 border-2 border-border hover:border-primary/40 hover:-translate-y-0.5 transition-all"
            >
              <div className="w-14 h-14 rounded-xl overflow-hidden border-2 border-white/60 flex-shrink-0 relative" style={coverStyle || undefined}>
                {coverImg ? (
                  <img src={coverImg} alt={evt.title} className="w-full h-full object-cover" />
                ) : !coverStyle ? (
                  <div className="w-full h-full bg-gradient-to-br from-primary/40 via-card to-accent/20" />
                ) : null}
                <div className="absolute inset-0" style={{ background: "radial-gradient(60% 60% at 30% 25%, rgba(255,255,255,0.35), transparent 60%)" }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{evt.title}</p>
                <p className="text-[11px] text-muted-foreground">{moment(evt.date).format("MMM D, YYYY")}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
