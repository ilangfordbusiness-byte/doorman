import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/data";

// Fetches {email: {name, picture}} for a list of emails (server-side User lookup).
// Results are cached per unique email set so multiple components share data.
export function useProfiles(emails) {
  const key = Array.from(new Set((emails || []).filter(Boolean).map((e) => e.toLowerCase()))).sort().join(",");
  return useQuery({
    queryKey: ["profiles", key],
    queryFn: async () => {
      if (!key) return {};
      const res = await api.functions.invoke("getProfiles", { emails: key.split(",") });
      return res.data?.profiles || {};
    },
    enabled: !!key,
    staleTime: 5 * 60 * 1000,
  });
}