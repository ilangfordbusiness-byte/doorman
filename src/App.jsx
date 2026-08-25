import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import Layout from './components/Layout';
import Login from './pages/Login';

const Home = lazy(() => import('./pages/Home'));
const CreateEvent = lazy(() => import('./pages/CreateEvent'));
const EventDetails = lazy(() => import('./pages/EventDetails'));
const GuestlistManagement = lazy(() => import('./pages/GuestlistManagement'));
const GuestPass = lazy(() => import('./pages/GuestPass'));
const DoormanScanner = lazy(() => import('./pages/DoormanScanner'));
const InvitePage = lazy(() => import('./pages/InvitePage'));
const Profile = lazy(() => import('./pages/Profile'));
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

const PageLoader = () => (
  <div className="fixed inset-0 flex items-center justify-center bg-background">
    <div className="relative w-16 h-16">
      <div className="absolute inset-0 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
      <div className="absolute inset-0 flex items-center justify-center">
        <img
          src="https://media.base44.com/images/public/69d556d1ae7f4cada8ab83ef/e327a8610_logotransparent.png"
          alt="DoorMan"
          className="w-8 h-8 object-contain animate-pulse"
        />
      </div>
    </div>
  </div>
);

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

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
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/create-event" element={<CreateEvent />} />
        <Route path="/event/:id" element={<EventDetails />} />
        <Route path="/event/:id/guestlist" element={<GuestlistManagement />} />
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
        <Route path="*" element={<PageNotFound />} />
      </Route>
      <Route path="/pass/:id" element={<GuestPass />} />
      <Route path="/scanner" element={<DoormanScanner />} />
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
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App