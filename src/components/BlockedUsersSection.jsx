import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/data";
import { Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import CollapsibleSection from "./CollapsibleSection";
import UserAvatar from "./UserAvatar";

// People the user has blocked, with Unblock. Blocking is done from an event
// page, a host profile or a chat message (SafetyActions).
export default function BlockedUsersSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: blocked = [] } = useQuery({
    queryKey: ["blocked-users"],
    queryFn: () => api.safety.listBlocked(),
  });

  async function unblock(u) {
    try {
      await api.safety.unblock(u.id);
      queryClient.invalidateQueries();
      toast({ title: `${u.full_name || "User"} unblocked` });
    } catch (e) {
      toast({ title: e?.message || "Couldn't unblock", variant: "destructive" });
    }
  }

  return (
    <CollapsibleSection icon={Ban} title={`Blocked users${blocked.length ? ` (${blocked.length})` : ""}`} hasData={false}>
      <div className="px-4 pb-4 space-y-2">
        {blocked.length === 0 && (
          <p className="text-xs text-muted-foreground">
            You have not blocked anyone. To block someone, open their event, profile or chat message and tap Block.
          </p>
        )}
        {blocked.map((u) => (
          <div key={u.id} className="flex items-center gap-3">
            <UserAvatar email={u.email} fallbackSrc={u.picture} name={u.full_name} size="w-8 h-8" textClass="text-xs" />
            <span className="text-sm flex-1 truncate">{u.full_name || u.email}</span>
            <Button size="sm" variant="secondary" onClick={() => unblock(u)}>Unblock</Button>
          </div>
        ))}
      </div>
    </CollapsibleSection>
  );
}
