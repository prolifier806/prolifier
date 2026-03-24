import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/context/ThemeContext";
import { UserProvider, useUser } from "@/context/UserContext";

// Lazy-load every page so each route becomes its own chunk.
// Only the code for the current route is downloaded on first load.
const Onboarding      = lazy(() => import("./pages/Onboarding"));
const VerifyEmail     = lazy(() => import("./pages/VerifyEmail"));
const ForgotPassword  = lazy(() => import("./pages/ForgotPassword"));
const ProfileSetup = lazy(() => import("./pages/ProfileSetup"));
const Feed         = lazy(() => import("./pages/Feed"));
const Discover     = lazy(() => import("./pages/Discover"));
const Messages     = lazy(() => import("./pages/Messages"));
const Groups       = lazy(() => import("./pages/Groups"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Profile      = lazy(() => import("./pages/Profile"));
const UserProfile  = lazy(() => import("./pages/UserProfile"));
const NotFound     = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
  </div>
);

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useUser();
  if (loading) return <PageLoader />;
  if (!session) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AuthRoute({ children }: { children: React.ReactNode }) {
  const { session, loading, profileComplete } = useUser();
  if (loading) return <PageLoader />;
  if (session) return <Navigate to={profileComplete ? "/feed" : "/setup"} replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/"              element={<AuthRoute><Onboarding /></AuthRoute>} />
        <Route path="/verify-email"     element={<VerifyEmail />} />
        <Route path="/forgot-password"  element={<ForgotPassword />} />
        <Route path="/setup"         element={<ProtectedRoute><ProfileSetup /></ProtectedRoute>} />
        <Route path="/feed"          element={<ProtectedRoute><Feed /></ProtectedRoute>} />
        <Route path="/discover"      element={<ProtectedRoute><Discover /></ProtectedRoute>} />
        <Route path="/messages"      element={<ProtectedRoute><Messages /></ProtectedRoute>} />
        <Route path="/groups"        element={<ProtectedRoute><Groups /></ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
        <Route path="/profile"       element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/profile/:id"   element={<ProtectedRoute><UserProfile /></ProtectedRoute>} />
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
