import { ReactNode, useEffect, useState, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTheme } from "@/context/ThemeContext";
import { useUser } from "@/context/UserContext";
import { Home, Search, MessageCircle, Users, Bell, Leaf, Sun, Moon, MessageSquarePlus } from "lucide-react";
import { supabase } from "@/lib/supabase";

const NAV_PATHS = [
  { to: "/feed",          icon: Home,          label: "Feed"          },
  { to: "/discover",      icon: Search,        label: "Discover"      },
  { to: "/messages",      icon: MessageCircle, label: "Messages"      },
  { to: "/groups",        icon: Users,         label: "Groups"        },
  { to: "/notifications", icon: Bell,          label: "Notifications" },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { user } = useUser();

  const [notifCount, setNotifCount] = useState(0);
  const [msgCount, setMsgCount] = useState(0);
  const [discoverCount, setDiscoverCount] = useState(0);

  // Track last fetch time to rate-limit visibility refreshes
  const lastFetchRef = useRef<number>(0);

  useEffect(() => {
    if (!user.id) return;

    // --- Initial fetch (one-time on mount) ---
    const fetchCounts = async () => {
      lastFetchRef.current = Date.now();
      const [notifRes, msgRes, discoverRes] = await Promise.all([
        (supabase as any)
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("read", false)
          .not("type", "in", "(message,match)"),
        (supabase as any)
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("read", false)
          .eq("type", "message"),
        (supabase as any)
          .from("connections")
          .select("id", { count: "exact", head: true })
          .eq("receiver_id", user.id)
          .eq("status", "pending"),
      ]);
      setNotifCount(notifRes.count ?? 0);
      setMsgCount(msgRes.count ?? 0);
      setDiscoverCount(discoverRes.count ?? 0);
    };

    fetchCounts();

    // --- Realtime: increment badges on new notifications (no polling) ---
    const channel = supabase
      .channel(`layout-badges-${user.id}`)
      // New notification inserted → increment the right badge
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const t = (payload.new as any).type as string;
          if (t === "message") {
            setMsgCount((c) => c + 1);
          } else if (t !== "match") {
            // Don't increment badge if user is already viewing notifications
            if (!window.location.pathname.startsWith("/notifications")) {
              setNotifCount((c) => c + 1);
            }
          }
        }
      )
      // New pending connection request → increment discover badge
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "connections",
          filter: `receiver_id=eq.${user.id}`,
        },
        (payload) => {
          if ((payload.new as any).status === "pending") {
            // Don't increment if user is already on the discover page
            if (!window.location.pathname.startsWith("/discover")) {
              setDiscoverCount((c) => c + 1);
            }
          }
        }
      )
      // Connection status changed (accepted/declined) → re-fetch connections count only
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "connections",
          filter: `receiver_id=eq.${user.id}`,
        },
        () => {
          (supabase as any)
            .from("connections")
            .select("id", { count: "exact", head: true })
            .eq("receiver_id", user.id)
            .eq("status", "pending")
            .then(({ count }: any) => setDiscoverCount(count ?? 0));
        }
      )
      .subscribe();

    // --- Visibility change: re-fetch ONLY if tab was away for 5+ minutes ---
    // Previously: re-fetch on EVERY tab switch (catastrophic at 200 users)
    const onVisible = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - lastFetchRef.current > 5 * 60_000 // 5 minutes minimum
      ) {
        fetchCounts();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user.id]);

  // Clear badges and mark-as-read when user navigates to the relevant page
  useEffect(() => {
    if (!user.id) return;
    if (pathname.startsWith("/notifications")) {
      setNotifCount(0);
      (supabase as any)
        .from("notifications")
        .update({ read: true })
        .eq("user_id", user.id)
        .eq("read", false)
        .not("type", "in", "(message,match)");
    } else if (pathname.startsWith("/messages")) {
      setMsgCount(0);
      (supabase as any)
        .from("notifications")
        .update({ read: true })
        .eq("user_id", user.id)
        .eq("type", "message")
        .eq("read", false);
    } else if (pathname.startsWith("/discover")) {
      setDiscoverCount(0);
    }
  }, [pathname, user.id]);

  // Also clear discover badge when the Requests tab is opened from within the page
  useEffect(() => {
    const handler = () => setDiscoverCount(0);
    window.addEventListener("prolifier:requests-opened", handler);
    return () => window.removeEventListener("prolifier:requests-opened", handler);
  }, []);

  const getBadge = (to: string) => {
    if (to === "/notifications") return notifCount;
    if (to === "/messages") return msgCount;
    if (to === "/discover") return discoverCount;
    return 0;
  };

  return (
    <div className="min-h-screen flex bg-background">

      {/* ── Desktop Sidebar ── */}
      <aside className="hidden md:flex flex-col w-64 border-r border-border bg-card fixed h-screen z-30">
        <Link to="/feed" className="flex items-center gap-2.5 px-6 py-5 border-b border-border">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <Leaf className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-display text-xl font-bold text-foreground">Prolifier</span>
        </Link>

        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {NAV_PATHS.map(({ to, icon: Icon, label }) => {
            const active = pathname.startsWith(to);
            const badge = getBadge(to);
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <div className="relative shrink-0">
                  <Icon className="h-4 w-4" />
                  {badge > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-0.5 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </div>
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-border space-y-1">
          <Link
            to="/profile"
            className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
              pathname === "/profile"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 overflow-hidden ${
              !user.avatarUrl ? `text-white ${user.color}` : ""
            } ${pathname === "/profile" ? "opacity-90" : ""}`}>
              {user.avatarUrl
                ? <img src={user.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                : user.avatar}
            </div>
            My Profile
          </Link>

          <Link
            to="/feedback"
            className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
              pathname === "/feedback"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            <MessageSquarePlus className="h-4 w-4 shrink-0" />
            Feedback
          </Link>

          <button
            onClick={toggleTheme}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-all duration-150"
          >
            {theme === "dark"
              ? <Sun className="h-4 w-4 shrink-0" />
              : <Moon className="h-4 w-4 shrink-0" />}
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 md:ml-64 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        {/* Mobile header */}
        <header
          className="md:hidden sticky top-0 z-20 bg-background/90 backdrop-blur-md border-b border-border px-4 flex items-center justify-between"
          style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))", paddingBottom: "0.75rem" }}
        >
          <Link to="/feed" className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center">
              <Leaf className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="font-display text-lg font-bold">Prolifier</span>
          </Link>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <Link to="/notifications" className="relative">
              {notifCount > 0 && (
                <span className="absolute -top-1 -right-1 h-4 min-w-4 px-0.5 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center z-10 leading-none">
                  {notifCount > 99 ? "99+" : notifCount}
                </span>
              )}
              <div className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors">
                <Bell className="h-4 w-4" />
              </div>
            </Link>
            <Link to="/profile">
              <div className={`h-8 w-8 rounded-full overflow-hidden flex items-center justify-center text-white text-xs font-semibold ${!user.avatarUrl ? user.color : ""}`}>
                {user.avatarUrl
                  ? <img src={user.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                  : user.avatar}
              </div>
            </Link>
          </div>
        </header>

        {children}
      </main>

      {/* ── Mobile bottom nav ── */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-background/95 backdrop-blur-md border-t border-border flex justify-around"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))", paddingTop: "0.5rem" }}
      >
        {NAV_PATHS.map(({ to, icon: Icon, label }) => {
          const active = pathname.startsWith(to);
          const badge = getBadge(to);
          return (
            <Link
              key={to}
              to={to}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 text-xs transition-colors min-w-0 ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <div className="relative">
                <Icon className={`h-5 w-5 transition-transform duration-150 ${active ? "scale-110" : ""}`} />
                {badge > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-0.5 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </div>
              <span className={`${active ? "font-medium" : ""}`}>{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
