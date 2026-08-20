import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useCurrentUser } from "./useCurrentUser";

// Shared notification counts (co-host invites, friend requests, event invites)
// so badges across Home, BottomNav and Profile reuse one cached fetch.
export function useNotifications() {
  const { data: me } = useCurrentUser();
  return useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const res = await base44.functions.invoke("getNotifications");
      return res.data;
    },
    enabled: !!me,
    staleTime: 60 * 1000,
  });
}