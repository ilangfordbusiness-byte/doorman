import { lazy, Suspense } from "react";
import { useAuth } from "@/lib/AuthContext";
import { needsProfileSetup } from "@/lib/profileSetup";

const ProfileSetupFlow = lazy(() => import("./ProfileSetupFlow"));

// Mandatory onboarding gate around the signed-in app (rules in
// lib/profileSetup.js). Decides from the profile AuthContext already loaded,
// so it adds no request and no spinner for the usual case of a complete
// profile; the onboarding screens load only for users who need them.
export default function PhoneSetupGate({ children }) {
  const { user } = useAuth();
  if (!needsProfileSetup(user)) return children;
  return (
    <Suspense fallback={<div className="fixed inset-0 flex items-center justify-center bg-background"><div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" /></div>}>
      <ProfileSetupFlow me={user}>{children}</ProfileSetupFlow>
    </Suspense>
  );
}
