import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/data";
import { useCurrentUser } from "@/hooks/useCurrentUser";

// Returns the BusinessAccount the user is currently acting as (null in personal mode).
export function useActiveAccount() {
  const { data: me } = useCurrentUser();
  const activeId = me?.active_business_id || null;
  return useQuery({
    queryKey: ["activeBusiness", activeId],
    queryFn: async () => {
      if (!activeId) return null;
      const list = await api.entities.BusinessAccount.filter({ id: activeId });
      return list[0] || null;
    },
    enabled: !!activeId,
    staleTime: 60 * 1000,
  });
}

// Quick switch between personal and business without re-login.
export function useSwitchAccount() {
  const qc = useQueryClient();
  const switchToBusiness = async (id) => {
    await api.auth.updateMe({ active_business_id: id });
    const fresh = await api.auth.me();
    qc.setQueryData(["currentUser"], fresh);
    await qc.invalidateQueries(["activeBusiness"]);
  };
  const switchToPersonal = async () => {
    await api.auth.updateMe({ active_business_id: null });
    const fresh = await api.auth.me();
    qc.setQueryData(["currentUser"], fresh);
    await qc.invalidateQueries(["activeBusiness"]);
  };
  return { switchToBusiness, switchToPersonal };
}