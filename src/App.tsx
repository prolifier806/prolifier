import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/context/ThemeContext";
import { UserProvider, useUser } from "@/context/UserContext";

// Wraps lazy() and auto-reloads once when a chunk fails to load after a deploy.
function lazyWithReload(fn: () => Promise<{ default: any }>) {
  return lazy(async () => {
    try {
      return await fn();
    } catch {
      const reloaded = sessionStorage.getItem("chunk_reload");
      if (!reloaded) {
        sessionStorage.setItem("chunk_reload", "1");
        window.location.reload();
      }
      return fn();
    }
  });
}

// Clears the reload flag once a chunk loads successfully
sessionStorage.removeItem("chunk_reload");

// Lazy-load every page so each route becomes its own chunk.
// Only the code for the current route is downloaded on first load.
const Onboarding      = lazyWithReload(() => import("./pages/Onboarding"));
const VerifyEmail     = lazyWithReload(() => import("./pages/VerifyEmail"));
const ForgotPassword  = lazyWithReload(() => import("./pages/ForgotPassword"));
const ProfileSetup    = lazyWithReload(() => import("./pages/ProfileSetup"));
const Feed            = lazyWithReload(() => import("./pages/Feed"));
const Discover        = lazyWithReload(() => import("./pages/Discover"));
const Messages        = lazyWithReload(() => import("./pages/Messages"));
const Groups          = lazyWithReload(() => import("./pages/Groups"));
const Notifications   = lazyWithReload(() => import("./pages/Notifications"));
const Profile         = lazyWithReload(() => import("./pages/Profile"));
const UserProfile     = lazyWithReload(() => import("./pages/UserProfile"));
const Feedback        = lazyWithReload(() => import("./pages/Feedback"));
const AccountRecovery = lazyWithReload(() => import("./pages/AccountRecovery"));
const NotFound        = lazyWithReload(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,          // data stays fresh for 1 min — prevents refetch spam
      refetchOnWindowFocus: false, // don't refetch on every tab switch
      retry: 1,                   // only retry once on failure (default 3 is too slow)
    },
  },
});

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
  </div>
);

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading, user } = useUser();
  // Also hold the loader while session is set but user data hasn't populated yet
  if (loading || (session && !user.id)) return <PageLoader />;
  if (!session) return <Navigate to="/" replace />;
  if (user.deletedAt) return <Navigate to="/recover" replace />;
  return <>{children}</>;
}

// Only accessible when the account is in the soft-delete grace period
function RecoverRoute({ children }: { children: React.ReactNode }) {
  const { session, loading, user } = useUser();
  if (loading) return <PageLoader />;
  if (!session) return <Navigate to="/" replace />;
  if (!user.deletedAt) return <Navigate to="/feed" replace />;
  return <>{children}</>;
}

// Redirects to /feed if profile is already complete (prevents re-entering setup)
function SetupRoute({ children }: { children: React.ReactNode }) {
  const { session, loading, profileComplete, user } = useUser();
  // Keep loader up until user data is populated — prevents flash of setup page
  // when returning user lands here after OAuth redirect
  if (loading || (session && !user.id)) return <PageLoader />;
  if (!session) return <Navigate to="/" replace />;
  if (profileComplete) return <Navigate to="/feed" replace />;
  return <>{children}</>;
}

// Redirects already-authenticated users away from auth pages
function AuthRoute({ children }: { children: React.ReactNode }) {
  const { session, loading, profileComplete } = useUser();
  if (loading) return <PageLoader />;
  if (session) return <Navigate to={profileComplete ? "/feed" : "/setup"} replace />;
  return <>{children}</>;
}

// Redirects to / (→ feed/setup) if user already has a session
function GuestOnlyRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useUser();
  if (loading) return <PageLoader />;
  if (session) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/"              element={<AuthRoute><Onboarding /></AuthRoute>} />
        <Route path="/verify-email"     element={<GuestOnlyRoute><VerifyEmail /></GuestOnlyRoute>} />
        <Route path="/forgot-password"  element={<ForgotPassword />} />
        <Route path="/setup"         element={<SetupRoute><ProfileSetup /></SetupRoute>} />
        <Route path="/feed"          element={<ProtectedRoute><Feed /></ProtectedRoute>} />
        <Route path="/discover"      element={<ProtectedRoute><Discover /></ProtectedRoute>} />
        <Route path="/messages"      element={<ProtectedRoute><Messages /></ProtectedRoute>} />
        <Route path="/groups"        element={<ProtectedRoute><Groups /></ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
        <Route path="/profile"       element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/profile/:id"   element={<ProtectedRoute><UserProfile /></ProtectedRoute>} />
        <Route path="/feedback"      element={<ProtectedRoute><Feedback /></ProtectedRoute>} />
        <Route path="/recover"       element={<RecoverRoute><AccountRecovery /></RecoverRoute>} />
        <Route path="*"              element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

const App = () => (
  <ThemeProvider>
    <UserProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <AppRoutes />
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </UserProvider>
  </ThemeProvider>
);

export default App;
