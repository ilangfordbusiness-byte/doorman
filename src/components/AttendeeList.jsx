import { useState } from "react";
import { ChevronRight } from "lucide-react";
import Avatar from "./Avatar";
import SuggestionProfile from "./SuggestionProfile";

// Clickable attendee rows. Tapping a row opens the person's profile
// (SuggestionProfile — enlargeable photo, Instagram, mutual friends, Add
// Friend). Shared by the inline "Who's Going" preview and the full-list modal.
export default function AttendeeList({ attendees, myEmail, friends = [], sentSet = new Set(), onSend }) {
  const [viewing, setViewing] = useState(null);

  return (
    <div className="space-y-2">
      {attendees.map((g) => (
        <button
          key={g.email}
          onClick={() => setViewing(g)}
          className="w-full flex items-center gap-3 bg-secondary/40 rounded-xl px-3 py-2.5 border border-border/50 hover:border-primary/30 transition-colors active:scale-[0.99] text-left"
        >
          <Avatar src={g.avatar_url} name={g.name || g.email} size="w-8 h-8" textClass="text-xs" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{g.name || g.email}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              {g.status === "checked_in" ? "Checked In" : "Going"}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </button>
      ))}

      {viewing && (
        <SuggestionProfile
          user={{ email: viewing.email, full_name: viewing.name, profile_picture: viewing.avatar_url, instagram: viewing.instagram }}
          myEmail={myEmail}
          myFriends={friends}
          sent={sentSet.has(viewing.email) || friends.some((f) => f.email === viewing.email)}
          onSend={onSend ? () => { onSend({ email: viewing.email, full_name: viewing.name, profile_picture: viewing.avatar_url }); setViewing(null); } : undefined}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}
