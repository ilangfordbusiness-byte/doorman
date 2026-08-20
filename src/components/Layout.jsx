import { Outlet, Navigate, useLocation } from "react-router-dom";
import PhoneSetupGate from "./PhoneSetupGate";
import BottomNav from "./BottomNav";
import { useCurrentUser } from "@/hooks/useCurrentUser";

const PERSONAL_ONLY = ["/", "/host", "/guest", "/friends", "/staff", "/profile", "/create-event"];

export default function Layout() {
  const { data: me } = useCurrentUser();
  const location = useLocation();

  // In business mode, block personal-only pages and send the user to the business hub.
  if (me?.active_business_id && PERSONAL_ONLY.includes(location.pathname)) {
    return <Navigate to="/business/create-event" replace />;
  }

  return (
    <PhoneSetupGate>
      <div className="min-h-screen bg-background pb-[calc(52px+env(safe-area-inset-bottom))]">
        <Outlet />
      </div>
      {!me?.active_business_id && <BottomNav />}
    </PhoneSetupGate>
  );
}