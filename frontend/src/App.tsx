import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/context/ThemeContext";
import { UserProvider, useUser } from "@/context/UserContext";
import { UploadQueueProvider } from "@/context/UploadQueueContext";

// Admin pages
const AdminDashboard = lazyWithReload(() => import("./pages/admin/Dashboard"));
const AdminUsers     = lazyWithReload(() => import("./pages/admin/Users"));
const AdminPosts     = lazyWithReload(() => import("./pages/admin/Posts"));
const AdminReports   = lazyWithReload(() => import("./pages/admin/Reports"));
const AdminActivity  = lazyWithReload(() => import("./pages/admin/Activity"));
const AdminFeedbacks = lazyWithReload(() => import("./pages/admin/Feedbacks"));

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
const GroupDetail     = lazyWithReload(() => import("./pages/GroupDetail"));
const Notifications   = lazyWithReload(() => import("./pages/Notifications"));
const Profile         = lazyWithReload(() => import("./pages/Profile"));
const UserProfile     = lazyWithReload(() => import("./pages/UserProfile"));
const Settings        = lazyWithReload(() => import("./pages/Settings"));
const Feedback        = lazyWithReload(() => import("./pages/Feedback"));
const AccountRecovery = lazyWithReload(() => import("./pages/AccountRecovery"));
const NotFound        = lazyWithReload(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
  </div>
);

const SuspendedScreen = () => {
  const { signOut } = useUser();
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-sm w-full text-center space-y-4">
        <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
          <svg className="h-8 w-8 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-foreground">Account Suspended</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Your account has been suspended. Kindly contact us at prolifiersupport@gmail.com
        </p>
        <button
          onClick={async () => { await signOut(); }}
          className="block w-full text-xs text-muted-foreground hover:text-foreground transition-colors pt-1"
        >
          Sign out
        </button>
      </div>
    </div>
  );
};

// Requires admin or moderator role — redirects others to /feed
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { session, loading, user } = useUser();
  if (loading || (session && !user.id)) return <PageLoader />;
  if (!session) return <Navigate to="/" replace />;
  if (!["admin", "moderator"].includes(user.role)) return <Navigate to="/feed" replace />;
  return <>{children}</>;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading, user, profileComplete } = useUser();
  if (loading || (session && !user.id)) return <PageLoader />;
  if (!session) return <Navigate to="/" replace />;
  if (user.deletedAt) return <Navigate to="/recover" replace />;
  if (user.accountStatus === "banned") return <SuspendedScreen />;
  if (!profileComplete) return <Navigate to="/setup" replace />;
  return <>{children}</>;
}

function RecoverRoute({ children }: { children: React.ReactNode }) {
  const { session, loading, user } = useUser();
  if (loading) return <PageLoader />;
  if (!session) return <Navigate to="/" replace />;
  if (!user.deletedAt) return <Navigate to="/feed" replace />;
  return <>{children}</>;
}

function SetupRoute({ children }: { children: React.ReactNode }) {
  const { session, loading, profileComplete, user } = useUser();
  if (loading || (session && !user.id)) return <PageLoader />;
  if (!session) return <Navigate to="/" replace />;
  if (profileComplete) return <Navigate to="/feed" replace />;
  return <>{children}</>;
}

function AuthRoute({ children }: { children: React.ReactNode }) {
  const { session, loading, profileComplete, user } = useUser();
  if (loading) return <PageLoader />;
  if (session && user.id && user.accountStatus === "banned") return <SuspendedScreen />;
  if (session) return <Navigate to={profileComplete ? "/feed" : "/setup"} replace />;
  return <>{children}</>;
}

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
        <Route path="/groups/:id"    element={<ProtectedRoute><Groups /></ProtectedRoute>} />
        <Route path="/group/:groupId" element={<ProtectedRoute><GroupDetail /></ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
        <Route path="/profile"       element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/profile/:id"   element={<ProtectedRoute><UserProfile /></ProtectedRoute>} />
        <Route path="/settings"      element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        <Route path="/feedback"      element={<ProtectedRoute><Feedback /></ProtectedRoute>} />
        <Route path="/recover"       element={<RecoverRoute><AccountRecovery /></RecoverRoute>} />

        {/* Admin panel — /admin/* only for admin/moderator roles */}
        <Route path="/admin"          element={<AdminRoute><AdminDashboard /></AdminRoute>} />
        <Route path="/admin/users"    element={<AdminRoute><AdminUsers /></AdminRoute>} />
        <Route path="/admin/posts"    element={<AdminRoute><AdminPosts /></AdminRoute>} />
        <Route path="/admin/reports"  element={<AdminRoute><AdminReports /></AdminRoute>} />
        <Route path="/admin/activity"   element={<AdminRoute><AdminActivity /></AdminRoute>} />
        <Route path="/admin/feedbacks"  element={<AdminRoute><AdminFeedbacks /></AdminRoute>} />

        <Route path="*"              element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

const App = () => (
  <ThemeProvider>
    <UserProvider>
      <UploadQueueProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <AppRoutes />
            </BrowserRouter>
          </TooltipProvider>
        </QueryClientProvider>
      </UploadQueueProvider>
    </UserProvider>
  </ThemeProvider>
);

export default App;
