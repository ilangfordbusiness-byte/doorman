import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/data";

// Caches the current user across the whole app so every page
// shares one fetch instead of re-calling api.auth.me() on each navigation.
export function useCurrentUser() {
  return useQuery({
    queryKey: ["currentUser"],
    queryFn: () => api.auth.me(),
    staleTime: 5 * 60 * 1000,
    cacheTime: 30 * 60 * 1000,
  });
}