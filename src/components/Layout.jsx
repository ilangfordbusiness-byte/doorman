import { Outlet } from "react-router-dom";
import PhoneSetupGate from "./PhoneSetupGate";
import BottomNav from "./BottomNav";

export default function Layout() {
  return (
    <PhoneSetupGate>
      <div className="min-h-screen bg-background pb-[calc(52px+env(safe-area-inset-bottom))]">
        <Outlet />
      </div>
      <BottomNav />
    </PhoneSetupGate>
  );
}