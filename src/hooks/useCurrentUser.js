import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

// Caches the current user across the whole app so every page
// shares one fetch instead of re-calling base44.auth.me() on each navigation.
export function useCurrentUser() {
  return useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
    staleTime: 5 * 60 * 1000,
    cacheTime: 30 * 60 * 1000,
  });
}