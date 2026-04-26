import { ReactNode, useEffect, useState, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTheme } from "@/context/ThemeContext";
import { useUser } from "@/context/UserContext";
import { Home, Search, MessageCircle, Users, Bell, Settings, Leaf, Sun, Moon, MessageSquarePlus, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import UploadStatusBar from "@/components/UploadStatusBar";

const NAV_PATHS = [
  { to: "/feed",          icon: Home,          label: "Feed"          },
  { to: "/discover",      icon: Search,        label: "Discover"      },
  { to: "/messages",      icon: MessageCircle, label: "Messages"      },
  { to: "/groups",        icon: Users,         label: "Communities"   },
  { to: "/notifications", icon: Bell,          label: "Notifications" },
  { to: "/settings",      icon: Settings,      label: "Settings"      },
];


export default function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { user } = useUser();

  const handleNewPost = () => {
    if (pathname === "/feed") {
      window.dispatchEvent(new CustomEvent("prolifier:new-post"));
    } else {
      navigate("/feed");
      // Give Feed time to mount before firing the event
      setTimeout(() => window.dispatchEvent(new CustomEvent("prolifier:new-post")), 300);
    }
  };
  const [notifCount, setNotifCount] = useState(0);
  const [msgCount, setMsgCount] = useState(0);
  const [discoverCount, setDiscoverCount] = useState(0);
  const [groupsCount, setGroupsCount] = useState(0);

  // Rate-limit visibility refreshes
  const lastFetchRef = useRef<number>(0);
  // Ref to the server-filtered group_messages channel — recreated when joined groups change
  const groupMsgChannelRef = useRef<any>(null);

  // Track badges cleared this session — fetchCounts must NEVER restore these.
  // Only a new incoming realtime event (not on that page) removes the flag.
  const sessionClearedRef = useRef<Set<string>>(new Set());
  // Muted senders — badge increments are skipped for these
  const mutedByMeRef = useRef<Set<string>>(new Set());
  // Joined group IDs — used by group_messages realtime handler
  const joinedGroupIdsRef = useRef<Set<string>>(new Set());

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
          .eq("status", "pending")
          .eq("read", false),
      ]);

      const path = window.location.pathname;
      const cleared = sessionClearedRef.current;

      // Only apply a count if:
      //   1. User is NOT currently on that page, AND
      //   2. User has NOT already cleared it this session
      if (!path.startsWith("/notifications") && !cleared.has("/notifications"))
        setNotifCount(notifRes.count ?? 0);
      if (!path.startsWith("/messages") && !cleared.has("/messages"))
        setMsgCount(msgRes.count ?? 0);
      if (!path.startsWith("/discover") && !cleared.has("/discover"))
        setDiscoverCount(discoverRes.count ?? 0);
    };

    fetchCounts();

    // Load muted users so badge increments can skip them
    (supabase as any)
      .from("mutes")
      .select("muted_id")
      .eq("muter_id", user.id)
      .then(({ data }: any) => {
        mutedByMeRef.current = new Set((data || []).map((m: any) => m.muted_id));
      });

    // --- Realtime: increment badges on new events ---
    const channel = supabase
      .channel(`layout-badges-${user.id}`)
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
            const actorId = (payload.new as any).actor_id as string | undefined;
            // Skip badge if sender is muted
            if (actorId && mutedByMeRef.current.has(actorId)) return;
            if (!window.location.pathname.startsWith("/messages")) {
              // New message arrived — lift the session-cleared lock so future fetches work
              sessionClearedRef.current.delete("/messages");
              setMsgCount((c) => c + 1);
            }
          } else if (t !== "match") {
            if (!window.location.pathname.startsWith("/notifications")) {
              sessionClearedRef.current.delete("/notifications");
              setNotifCount((c) => c + 1);
            }
          }
        }
      )
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
            if (!window.location.pathname.startsWith("/discover")) {
              sessionClearedRef.current.delete("/discover");
              setDiscoverCount((c) => c + 1);
            }
          }
        }
      )
      // Connection accepted/declined → decrement badge (the pending request is now resolved)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "connections",
          filter: `receiver_id=eq.${user.id}`,
        },
        (payload) => {
          // Skip if user is on discover or cleared the badge themselves
          if (
            window.location.pathname.startsWith("/discover") ||
            sessionClearedRef.current.has("/discover")
          ) return;
          // If the status moved away from "pending", one request was resolved
          if ((payload.old as any)?.status === "pending" && (payload.new as any)?.status !== "pending") {
            setDiscoverCount(c => Math.max(0, c - 1));
          }
        }
      )
      .subscribe();

    // Visibility change: re-fetch ONLY if tab was away for 5+ minutes
    const onVisible = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - lastFetchRef.current > 5 * 60_000
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

  // Clear badge + mark-as-read in DB + lock this badge for the session
  const clearBadge = (to: string) => {
    if (!user.id) return;
    if (to === "/notifications") {
      sessionClearedRef.current.add("/notifications");
      setNotifCount(0);
      (supabase as any)
        .from("notifications")
        .update({ read: true })
        .eq("user_id", user.id)
        .eq("read", false)
        .not("type", "in", "(message,match)")
        .then(() => {});
    } else if (to === "/messages") {
      sessionClearedRef.current.add("/messages");
      setMsgCount(0);
      (supabase as any)
        .from("notifications")
        .update({ read: true })
        .eq("user_id", user.id)
        .eq("type", "message")
        .eq("read", false)
        .then(() => {});
    } else if (to === "/discover") {
      sessionClearedRef.current.add("/discover");
      setDiscoverCount(0);
      (supabase as any)
        .from("connections")
        .update({ read: true })
        .eq("receiver_id", user.id)
        .eq("status", "pending")
        .eq("read", false)
        .then(() => {});
    }
  };

  // Also clear on pathname change (handles direct URL navigation / back-button)
  useEffect(() => {
    if (!user.id) return;
    if (pathname.startsWith("/notifications")) clearBadge("/notifications");
    else if (pathname.startsWith("/messages"))    clearBadge("/messages");
    else if (pathname.startsWith("/discover"))    clearBadge("/discover");
    else if (pathname.startsWith("/groups")) {
      setGroupsCount(0);
      try { localStorage.setItem(`prf_groups_unread_${user.id}`, "0"); } catch { /* ignore */ }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, user.id]);

  // Clear discover badge when Requests tab opens inside Discover page
  useEffect(() => {
    const handler = () => {
      sessionClearedRef.current.add("/discover");
      setDiscoverCount(0);
    };
    window.addEventListener("prolifier:requests-opened", handler);
    return () => window.removeEventListener("prolifier:requests-opened", handler);
  }, []);

  // Clear message badge when all conversations are read (fired by Messages page)
  useEffect(() => {
    const handler = () => {
      sessionClearedRef.current.add("/messages");
      setMsgCount(0);
    };
    window.addEventListener("prolifier:messages-all-read", handler);
    return () => window.removeEventListener("prolifier:messages-all-read", handler);
  }, []);

  // Clear notification badge when Notifications page mounts (handles direct URL)
  useEffect(() => {
    const handler = () => {
      sessionClearedRef.current.add("/notifications");
      setNotifCount(0);
    };
    window.addEventListener("prolifier:notifications-opened", handler);
    return () => window.removeEventListener("prolifier:notifications-opened", handler);
  }, []);

  // Groups unread count — fetch from DB on mount, keep in sync via custom event from Groups.tsx
  useEffect(() => {
    if (!user.id) return;

    const fetchGroupsUnread = async () => {
      if (window.location.pathname.startsWith("/groups")) return;
      try {
        // Step 1: get all groups the user is a member of
        const { data: membership } = await (supabase as any)
          .from("group_members")
          .select("group_id")
          .eq("user_id", user.id);
        const groupIds: string[] = (membership || []).map((r: any) => r.group_id);
        joinedGroupIdsRef.current = new Set(groupIds);

        // (Re)create a server-filtered realtime channel for group_messages.
        // This replaces the previous platform-wide subscription — only messages
        // for groups the user has joined are pushed to this browser.
        if (groupMsgChannelRef.current) {
          supabase.removeChannel(groupMsgChannelRef.current);
          groupMsgChannelRef.current = null;
        }
        if (groupIds.length > 0) {
          groupMsgChannelRef.current = (supabase as any)
            .channel(`layout-group-msgs-${user.id}`)
            .on(
              "postgres_changes",
              {
                event: "INSERT",
                schema: "public",
                table: "group_messages",
                filter: `group_id=in.(${groupIds.join(",")})`,
              },
              (payload: any) => {
                const msg = payload.new as any;
                if (msg.user_id === user.id) return; // own message
                if (msg.is_system) return;            // system event
                // Groups.tsx fires prolifier:groups-unread when mounted.
                // Increment here covers pages where Groups.tsx is not mounted.
                if (!window.location.pathname.startsWith("/groups")) {
                  setGroupsCount(c => c + 1);
                }
              }
            )
            .subscribe();
        }

        if (groupIds.length === 0) { setGroupsCount(0); return; }

        // Step 2: fetch recent messages for those groups (last 30 days)
        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { data: msgs } = await (supabase as any)
          .from("group_messages")
          .select("id, group_id, created_at")
          .in("group_id", groupIds)
          .neq("user_id", user.id)
          .eq("is_system", false)
          .gt("created_at", since);

        // Step 3: group messages into a Map (O(n)) then count per group (O(m)) — not O(n×m)
        const msgsByGroup = new Map<string, string[]>();
        for (const m of (msgs || [])) {
          const arr = msgsByGroup.get(m.group_id) ?? [];
          arr.push(m.created_at);
          msgsByGroup.set(m.group_id, arr);
        }
        let total = 0;
        for (const gid of groupIds) {
          const lastRead = localStorage.getItem(`prf_read_${user.id}_${gid}`) ?? new Date(0).toISOString();
          total += (msgsByGroup.get(gid) ?? []).filter(t => t > lastRead).length;
        }
        setGroupsCount(total);
        try { localStorage.setItem(`prf_groups_unread_${user.id}`, String(total)); } catch { /* ignore */ }
      } catch { /* ignore */ }
    };

    fetchGroupsUnread();

    // Keep in sync when Groups.tsx updates the count (always — including while on /groups
    // so that reading chats clears the badge before the user navigates away)
    const handler = (e: Event) => {
      const total = (e as CustomEvent<number>).detail;
      setGroupsCount(total);
    };
    window.addEventListener("prolifier:groups-unread", handler);
    return () => {
      window.removeEventListener("prolifier:groups-unread", handler);
      if (groupMsgChannelRef.current) {
        supabase.removeChannel(groupMsgChannelRef.current);
        groupMsgChannelRef.current = null;
      }
    };
  }, [user.id]);

  const getBadge = (to: string) => {
    if (to === "/notifications") return notifCount;
    if (to === "/messages") return msgCount;
    if (to === "/discover") return discoverCount;
    if (to === "/groups") return groupsCount;
    return 0;
  };

  return (
    <>
    <UploadStatusBar />
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
            const active = to === "/feed" ? pathname === "/feed" : pathname.startsWith(to);
            const badge = getBadge(to);
            return (
              <Link
                key={to}
                to={to}
                onClick={() => clearBadge(to)}
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
            onClick={handleNewPost}
            className="w-full mt-1 flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold border-2 border-dashed border-primary/50 text-primary hover:border-primary hover:bg-primary/5 active:scale-[0.98] transition-all duration-150"
          >
            <span className="h-5 w-5 rounded-full border-2 border-primary/60 flex items-center justify-center shrink-0">
              <Plus className="h-3 w-3" />
            </span>
            New Post
          </button>
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
              onClick={() => clearBadge(to)}
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
    </>
  );
}
