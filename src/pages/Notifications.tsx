import { useState, useEffect, useCallback } from "react";
import { useRealtimeChannel } from "@/hooks/useRealtimeChannel";
import { useNavigate } from "react-router-dom";
import { Switch } from "@/components/ui/switch";
import {
  Heart, MessageCircle, UserPlus, Users,
  Settings, X, Bell, Handshake, Star, TrendingUp, ArrowLeft, RefreshCw,
} from "lucide-react";
import Layout from "@/components/Layout";
import { toast } from "@/hooks/use-toast";
import { useUser } from "@/context/UserContext";

import { supabase } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────
type Notif = {
  id: string;
  type: string;
  text: string;
  subtext: string | null;
  read: boolean;
  action: string | null;
  created_at: string;
};

// ── Icon map ──────────────────────────────────────────────────────────────
const TYPE_META: Record<string, { icon: any; color: string }> = {
  match:    { icon: UserPlus,      color: "bg-primary text-primary-foreground" },
  message:  { icon: MessageCircle, color: "bg-sky-500 text-white" },
  collab:   { icon: Handshake,     color: "bg-accent text-accent-foreground" },
  like:     { icon: Heart,         color: "bg-rose-500 text-white" },
  comment:  { icon: MessageCircle, color: "bg-sky-400 text-white" },
  endorse:  { icon: Star,          color: "bg-amber-500 text-white" },
  group:    { icon: Users,         color: "bg-emerald-600 text-white" },
  trending: { icon: TrendingUp,    color: "bg-violet-600 text-white" },
  default:  { icon: Bell,          color: "bg-muted text-muted-foreground" },
};

function fmtTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

const PREFS_KEY = "notif_prefs";
const PREFS_DEFAULT = {
  matches: true, messages: true, collabs: true,
  likes: false, comments: true, groups: true,
  trending: false, weekly: true,
};

// ── Exported helper — call this from anywhere to create a notification ────
export async function createNotification({
  userId, type, text, subtext, action, actorId,
}: {
  userId: string;
  type: string;
  text: string;
  subtext?: string;
  action?: string;
  actorId?: string;
}) {
  try {
    await (supabase as any).from("notifications").insert({
      user_id: userId,
      type,
      text,
      subtext: subtext || null,
      action: action || null,
      actor_id: actorId || null,
      read: false,
    });
  } catch (err) {
    console.error("createNotification failed:", err);
  }
}

// ══════════════════════════════════════════════════════════════════════════
export default function Notifications() {
  const { user } = useUser();
  const navigate = useNavigate();

  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPrefs, setShowPrefs] = useState(false);
  const [prefs, setPrefs] = useState(() => {
    try {
      const saved = localStorage.getItem(PREFS_KEY);
      return saved ? { ...PREFS_DEFAULT, ...JSON.parse(saved) } : PREFS_DEFAULT;
    } catch { return PREFS_DEFAULT; }
  });

  // Save prefs to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  }, [prefs]);

  // ── Fetch notifications ────────────────────────────────────────────────
  const fetchNotifs = useCallback(async () => {
    if (!user.id) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .not("type", "in", "(message,match)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      const items: Notif[] = data || [];
      // Show all as read immediately — badge clears, no unread dots
      setNotifs(items.map(n => ({ ...n, read: true })));
      // Persist read state to DB so badge stays 0 after hard refresh
      if (items.some(n => !n.read)) {
        await (supabase as any)
          .from("notifications")
          .update({ read: true })
          .eq("user_id", user.id)
          .eq("read", false)
          .not("type", "in", "(message,match)");
      }
    } catch (err) {
      console.error("fetchNotifs:", err);
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => {
    fetchNotifs();
    // Signal Layout to clear notification badge immediately (handles direct URL navigation)
    window.dispatchEvent(new Event("prolifier:notifications-opened"));
  }, [fetchNotifs]);

  // ── Realtime subscription ─────────────────────────────────────────────
  // INSERT: live new notifications. DELETE: admin removal.
  // UPDATE omitted — mark-as-read is applied optimistically on this device.
  useRealtimeChannel(
    user.id ? `notifs-${user.id}` : null,
    ch => ch
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "notifications",
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        if (payload.new.type === "message" || payload.new.type === "match") return;
        // Mark read immediately since user is already on the page
        const notif = { ...(payload.new as Notif), read: true };
        setNotifs(prev => [notif, ...prev]);
        (supabase as any).from("notifications").update({ read: true }).eq("id", notif.id).then(() => {});
      })
      .on("postgres_changes", {
        event: "DELETE", schema: "public", table: "notifications",
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        setNotifs(prev => prev.filter(n => n.id !== payload.old.id));
      }),
  );

  // ── Actions ────────────────────────────────────────────────────────────
  const dismiss = async (id: string) => {
    setNotifs(prev => prev.filter(n => n.id !== id));
    await (supabase as any).from("notifications").delete().eq("id", id);
  };

  const clearAll = async () => {
    setNotifs([]);
    await (supabase as any).from("notifications").delete().eq("user_id", user.id);
    toast({ title: "Notifications cleared" });
  };

  const handleAction = (n: Notif) => {
    if (!n.action) return;

    if (n.action.startsWith("message:")) {
      const senderId = n.action.split(":")[1];
      navigate(senderId ? `/messages?with=${senderId}` : "/messages");
    } else if (n.action.startsWith("profile:")) {
      const id = n.action.split(":")[1];
      navigate(`/profile/${id}`);
    } else if (n.action.startsWith("group:")) {
      navigate("/groups");
    } else if (n.action.startsWith("post:")) {
      const postId = n.action.split(":")[1];
      navigate(`/feed?post=${postId}`);
    } else if (n.action === "feed") {
      navigate("/feed");
    } else if (n.action === "messages") {
      navigate("/messages");
    } else if (n.action === "groups") {
      navigate("/groups");
    }
  };

  const getActionLabel = (action: string | null) => {
    if (!action) return null;
    if (action.startsWith("message:") || action === "messages") return "Reply";
    if (action.startsWith("profile:")) return "View";
    if (action.startsWith("group:") || action === "groups") return "Open";
    if (action.startsWith("post:") || action === "feed") return "View";
    return "Open";
  };

  // ── Preferences view ───────────────────────────────────────────────────
  if (showPrefs) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto px-4 py-6">
          <button onClick={() => setShowPrefs(false)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <h1 className="text-xl font-bold mb-6">Notification Preferences</h1>
          <div className="rounded-xl border border-border bg-card divide-y divide-border">
            {([
              { key: "collabs",  label: "Collab interest",      desc: "When someone is interested in your collab" },
              { key: "likes",    label: "Likes",                desc: "When someone likes your posts" },
              { key: "comments", label: "Comments",             desc: "When someone comments on your posts" },
              { key: "groups",   label: "Group activity",       desc: "New messages in groups you've joined" },
              { key: "trending", label: "Trending posts",       desc: "When your post gains traction" },
              { key: "weekly",   label: "Weekly digest",        desc: "A summary of activity each week" },
            ] as const).map(({ key, label, desc }) => (
              <div key={key} className="flex items-center justify-between px-5 py-4">
                <div>
                  <p className="text-sm font-medium text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </div>
                <Switch
                  checked={prefs[key]}
                  onCheckedChange={v => setPrefs(p => ({ ...p, [key]: v }))}
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground text-center mt-4">Saved automatically</p>
        </div>
      </Layout>
    );
  }

  // ── Main view ──────────────────────────────────────────────────────────
  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="font-display text-2xl font-bold">Notifications</h1>
          <div className="flex items-center gap-1">
            <button onClick={fetchNotifs}
              className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button onClick={() => setShowPrefs(true)}
              className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Clear all */}
        {notifs.length > 0 && (
          <div className="flex justify-end mb-3">
            <button onClick={clearAll}
              className="text-xs text-muted-foreground hover:text-destructive transition-colors">
              Clear all
            </button>
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : notifs.length === 0 ? (
          <div className="text-center py-14 text-muted-foreground">
            <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-medium mb-1">No notifications yet</p>
            <p className="text-xs">Activity will appear here.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {notifs.map(n => {
              const meta = TYPE_META[n.type] || TYPE_META.default;
              const Icon = meta.icon;
              const actionLabel = getActionLabel(n.action);
              return (
                <div
                  key={n.id}
                  onClick={() => handleAction(n)}
                  className={`group flex items-start gap-3 px-4 py-3.5 rounded-xl transition-all duration-200 select-none ${n.action ? "cursor-pointer hover:bg-muted" : "hover:bg-muted/50"}`}
                >
                  <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${meta.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-snug text-foreground">{n.text}</p>
                    {n.subtext && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{n.subtext}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5">
                      <p className="text-xs text-muted-foreground">{fmtTime(n.created_at)}</p>
                      {actionLabel && (
                        <button
                          onClick={e => { e.stopPropagation(); handleAction(n); }}
                          className="text-xs text-primary font-semibold hover:underline"
                        >
                          {actionLabel} →
                        </button>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); dismiss(n.id); }}
                    className="h-6 w-6 rounded-full flex items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted transition-all shrink-0 mt-1"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}