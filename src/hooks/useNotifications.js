import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/data";
import { useCurrentUser } from "./useCurrentUser";

// Shared notification counts (co-host invites, friend requests, event invites)
// so badges across Home, BottomNav and Profile reuse one cached fetch.
export function useNotifications() {
  const { data: me } = useCurrentUser();
  return useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const res = await api.functions.invoke("getNotifications");
      return res.data;
    },
    enabled: !!me,
    staleTime: 60 * 1000,
  });
}