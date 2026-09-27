import { Toaster } from "@/components/ui/toaster"
import { Analytics } from '@vercel/analytics/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import { isNative, hideSplash } from '@/lib/native';
import { useDeepLinks } from '@/hooks/useDeepLinks';
import { usePushRegistration } from '@/hooks/usePushRegistration';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import Layout from './components/Layout';
import ImpersonationBanner from './components/ImpersonationBanner';
import Login from './pages/Login';
import Privacy from './pages/Privacy';
import AuthConfirm from './pages/AuthConfirm';
import NativeReturn from './pages/NativeReturn';
import { stashRefFromUrl } from '@/lib/promoterRef';

// Capture a promoter ?ref= before the auth gate decides what to render, so
// attribution survives sign-up flows that never mount EventDetails.
stashRefFromUrl();

const Home = lazy(() => import('./pages/Home'));
const CreateEvent = lazy(() => import('./pages/CreateEvent'));
const EventDetails = lazy(() => import('./pages/EventDetails'));
const GuestlistManagement = lazy(() => import('./pages/GuestlistManagement'));
const DoorList = lazy(() => import('./pages/DoorList'));
const GuestPass = lazy(() => import('./pages/GuestPass'));
const DoormanScanner = lazy(() => import('./pages/DoormanScanner'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const InvitePage = lazy(() => import('./pages/InvitePage'));
const Profile = lazy(() => import('./pages/Profile'));
const PublicBusiness = lazy(() => import('./pages/PublicBusiness'));
const HostHub = lazy(() => import('./pages/HostHub'));
const GuestHub = lazy(() => import('./pages/GuestHub'));
const StaffHub = lazy(() => import('./pages/StaffHub'));
const Friends = lazy(() => import('./pages/Friends'));
const EditEvent = lazy(() => import('./pages/EditEvent'));
const TicketCheckout = lazy(() => import('./pages/TicketCheckout'));
const EventAnalytics = lazy(() => import('./pages/EventAnalytics'));
const PromoterPanel = lazy(() => import('./pages/PromoterPanel'));
const PromoterDashboard = lazy(() => import('./pages/PromoterDashboard'));
const BusinessLayout = lazy(() => import('./components/BusinessLayout'));
const BusinessCreateEvent = lazy(() => import('./pages/business/BusinessCreateEvent'));
const BusinessPastEvents = lazy(() => import('./pages/business/BusinessPastEvents'));
const EditBusinessAccount = lazy(() => import('./pages/business/EditBusinessAccount'));
const Admin = lazy(() => import('./pages/Admin'));

const PageLoader = () => (
  <div className="fixed inset-0 flex items-center justify-center bg-background">
    <div className="relative w-16 h-16">
      <div className="absolute inset-0 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
      <div className="absolute inset-0 flex items-center justify-center">
        <img
          src="/logo.png"
          alt="DoorMan"
          className="w-8 h-8 object-contain animate-pulse"
        />
      </div>
    </div>
  </div>
);

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError } = useAuth();
  // Router location (not window.location) so deep links that navigate a
  // running iOS app to a public page re-render this gate.
  const { pathname } = useLocation();
  // iOS: OAuth callbacks, universal links and doorman:// links. No-op on web.
  useDeepLinks();
  // iOS: register this phone for push once signed in; route notification taps.
  usePushRegistration();
  // iOS: keep the splash up until we know whether there is a session.
  useEffect(() => {
    if (!isLoadingAuth) hideSplash();
  }, [isLoadingAuth]);

  // Public pages, reachable with no session (Google's consent screen links here).
  if (pathname === '/privacy') {
    return <Privacy />;
  }
  // Auth email links land here with a token hash; there is no session yet.
  if (pathname === '/auth/confirm') {
    return <AuthConfirm />;
  }
  // Stripe redirects the iOS app's browser sheet here; it hands back to the app.
  if (pathname === '/native/return') {
    return <NativeReturn />;
  }

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      return <Login />;
    }
  }

  // Render the main app
  return (
    <Suspense fallback={<PageLoader />}>
    <ImpersonationBanner />
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/create-event" element={<CreateEvent />} />
        <Route path="/event/:id" element={<EventDetails />} />
        <Route path="/event/:id/guestlist" element={<GuestlistManagement />} />
        <Route path="/event/:id/door" element={<DoorList />} />
        <Route path="/event/:id/edit" element={<EditEvent />} />
        <Route path="/event/:id/checkout" element={<TicketCheckout />} />
        <Route path="/event/:id/analytics" element={<EventAnalytics />} />
        <Route path="/event/:id/promoters" element={<PromoterPanel />} />
        <Route path="/promoter/:code" element={<PromoterDashboard />} />
        <Route path="/host" element={<HostHub />} />
        <Route path="/guest" element={<GuestHub />} />
        <Route path="/staff" element={<StaffHub />} />
        <Route path="/friends" element={<Friends />} />
        <Route path="/invite/:code" element={<InvitePage />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/b/:id" element={<PublicBusiness />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<PageNotFound />} />
      </Route>
      <Route path="/pass/:id" element={<GuestPass />} />
      <Route path="/scanner" element={<DoormanScanner />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/business/:id/edit" element={<EditBusinessAccount />} />
      <Route element={<BusinessLayout />}>
        <Route path="/business/create-event" element={<BusinessCreateEvent />} />
        <Route path="/business/past-events" element={<BusinessPastEvents />} />
      </Route>
      <Route path="/business" element={<Navigate to="/business/create-event" replace />} />
    </Routes>
    </Suspense>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
        {/* Vercel analytics only exists for the web deployment. */}
        {!isNative() && <Analytics />}
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App