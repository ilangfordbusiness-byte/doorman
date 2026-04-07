import { Outlet } from "react-router-dom";
import PhoneSetupGate from "./PhoneSetupGate";

export default function Layout() {
  return (
    <PhoneSetupGate>
      <div className="min-h-screen bg-background">
        <Outlet />
      </div>
    </PhoneSetupGate>
  );
}