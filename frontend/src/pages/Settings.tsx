import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sun, Moon, Shield, Lock, UserX, ChevronRight, ArrowLeft,
  Eye, EyeOff, X, Mail, Heart, MessageCircle,
  Bell, Monitor, LogOut, Globe, HelpCircle, FileText, Smartphone,
} from "lucide-react";
import Layout from "@/components/Layout";
import { toast } from "@/hooks/use-toast";
import { useTheme } from "@/context/ThemeContext";
import { useUser } from "@/context/UserContext";
import { supabase } from "@/lib/supabase";
import { deleteMyAccount, unblockUser } from "@/api/users";
import { isAbortError } from "@/api/client";
import { TERMS_AND_PRIVACY } from "@/pages/Profile";

const PREFS_KEY = "notif_prefs";
const PREFS_DEFAULT = {
  matches: true, messages: true, collabs: true,
  likes: false, comments: true, groups: true,
  trending: false, weekly: true,
};

const PRIVACY_KEY = "privacy_prefs";
const PRIVACY_DEFAULT = {
  whoCanMessage: "anyone" as "anyone" | "connected",
  whoCanSeePost: "anyone" as "anyone" | "connected",
};

const DELETE_REASONS = [
  "I'm not getting value from Prolifier",
  "I found a better platform",
  "Privacy concerns",
  "Too many notifications",
  "Prefer not to say",
];

type BlockedUser = { id: string; name: string; avatar: string; color: string; avatarUrl?: string };

type SessionInfo = {
  signedInAt: string;
  browser: string;
  platform: string;
};

function detectBrowser(): string {
  const ua = navigator.userAgent;
  if (ua.includes("Chrome") && !ua.includes("Edg")) return "Chrome";
  if (ua.includes("Safari") && !ua.includes("Chrome")) return "Safari";
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Edg")) return "Edge";
  return "Browser";
}

function detectPlatform(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
  if (/Android/.test(ua)) return "Android";
  if (/Mac/.test(ua)) return "macOS";
  if (/Win/.test(ua)) return "Windows";
  if (/Linux/.test(ua)) return "Linux";
  return "Unknown";
}

export default function Settings() {
  const { theme, toggleTheme } = useTheme();
  const { user, signOut } = useUser();
  const navigate = useNavigate();

  // Notification prefs
  const [prefs, setPrefs] = useState(() => {
    try {
      const saved = localStorage.getItem(PREFS_KEY);
      return saved ? { ...PREFS_DEFAULT, ...JSON.parse(saved) } : PREFS_DEFAULT;
    } catch { return PREFS_DEFAULT; }
  });

  useEffect(() => {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  }, [prefs]);

  // Privacy prefs
  const [privacy, setPrivacy] = useState(() => {
    try {
      const saved = localStorage.getItem(PRIVACY_KEY);
      return saved ? { ...PRIVACY_DEFAULT, ...JSON.parse(saved) } : PRIVACY_DEFAULT;
    } catch { return PRIVACY_DEFAULT; }
  });

  useEffect(() => {
    localStorage.setItem(PRIVACY_KEY, JSON.stringify(privacy));
  }, [privacy]);

  // Blocked users
  const [blockedList, setBlockedList] = useState<BlockedUser[]>([]);
  const [showBlocked, setShowBlocked] = useState(false);
  const [blockedLoading, setBlockedLoading] = useState(false);

  const loadBlocked = async () => {
    if (!user.id) return;
    setBlockedLoading(true);
    try {
      // Step 1: get blocked IDs
      const { data: blockRows, error: blockErr } = await (supabase as any)
        .from("blocks")
        .select("blocked_id")
        .eq("blocker_id", user.id);
      if (blockErr) throw blockErr;
      const ids: string[] = (blockRows || []).map((r: any) => r.blocked_id);
      if (ids.length === 0) { setBlockedList([]); return; }
      // Step 2: fetch profiles
      const { data: profiles, error: profErr } = await (supabase as any)
        .from("profiles")
        .select("id, name, avatar, color, avatar_url")
        .in("id", ids);
      if (profErr) throw profErr;
      setBlockedList((profiles || []).map((p: any) => ({
        id: p.id,
        name: p.name || "Unknown",
        avatar: p.avatar || "?",
        color: p.color || "bg-primary",
        avatarUrl: p.avatar_url || undefined,
      })));
    } catch {
      toast({ title: "Failed to load blocked users", variant: "destructive" });
    } finally {
      setBlockedLoading(false);
    }
  };

  useEffect(() => {
    if (showBlocked) loadBlocked();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showBlocked]);

  const handleUnblock = async (userId: string) => {
    setBlockedList(prev => prev.filter(u => u.id !== userId));
    await unblockUser(userId);
    toast({ title: "User unblocked" });
  };

  // Password
  const [showChangePw, setShowChangePw] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);

  const handleChangePw = async () => {
    if (!currentPw) { toast({ title: "Enter your current password", variant: "destructive" }); return; }
    if (newPw.length < 6) { toast({ title: "New password must be at least 6 characters", variant: "destructive" }); return; }
    if (newPw !== confirmPw) { toast({ title: "Passwords don't match", variant: "destructive" }); return; }
    setPwLoading(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPw });
      if (signInError) { toast({ title: "Current password is incorrect", variant: "destructive" }); setPwLoading(false); return; }
      const { error } = await supabase.auth.updateUser({ password: newPw });
      if (error) { toast({ title: "Failed to update password", description: error.message, variant: "destructive" }); setPwLoading(false); return; }
      setShowChangePw(false);
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
      toast({ title: "Password updated successfully!" });
    } catch {
      toast({ title: "Something went wrong", variant: "destructive" });
    }
    setPwLoading(false);
  };

  // Login activity
  const [showLoginActivity, setShowLoginActivity] = useState(false);
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [loggingOutOthers, setLoggingOutOthers] = useState(false);

  useEffect(() => {
    if (!showLoginActivity) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      setSessionInfo({
        signedInAt: session.user.last_sign_in_at || session.user.created_at,
        browser: detectBrowser(),
        platform: detectPlatform(),
      });
    });
  }, [showLoginActivity]);

  const handleSignOutOthers = async () => {
    setLoggingOutOthers(true);
    try {
      await supabase.auth.signOut({ scope: "others" });
      toast({ title: "Signed out from all other devices" });
      setShowLoginActivity(false);
    } catch {
      toast({ title: "Failed to sign out other devices", variant: "destructive" });
    } finally { setLoggingOutOthers(false); }
  };

  // Delete account
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== "delete" || !deleteReason) return;
    setDeleteLoading(true);
    try {
      await deleteMyAccount();
      toast({ title: "Account scheduled for deletion", description: "You have 7 days to recover it by logging back in." });
      await signOut();
      navigate("/");
    } catch (err: any) {
      if (!isAbortError(err)) toast({ title: "Failed to delete account", description: err.message, variant: "destructive" });
      setDeleteLoading(false);
    }
  };

  // Terms sub-view
  const [showTerms, setShowTerms] = useState(false);

  // ── Blocked Users sub-view ────────────────────────────────────────────────
  if (showBlocked) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-4 py-6">
          <button onClick={() => setShowBlocked(false)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-5">
            <ArrowLeft className="h-4 w-4" /> Back to Settings
          </button>
          <h1 className="text-xl font-bold text-foreground mb-1">Blocked Users</h1>
          <p className="text-sm text-muted-foreground mb-4">Blocked users cannot see your profile or contact you.</p>
          {blockedLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
          ) : blockedList.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <UserX className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No blocked users.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
              {blockedList.map(u => (
                <div key={u.id} className="flex items-center gap-3 px-4 py-3.5">
                  <div className={`h-9 w-9 rounded-xl ${u.avatarUrl ? "" : u.color} flex items-center justify-center text-white font-bold text-sm shrink-0 overflow-hidden`}>
                    {u.avatarUrl
                      ? <img src={u.avatarUrl} alt={u.avatar} className="w-full h-full object-cover" />
                      : u.avatar}
                  </div>
                  <p className="flex-1 text-sm font-medium text-foreground">{u.name}</p>
                  <button onClick={() => handleUnblock(u.id)}
                    className="text-xs text-primary font-semibold border border-primary/30 bg-primary/5 hover:bg-primary/10 px-3 py-1.5 rounded-lg transition-colors">
                    Unblock
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Layout>
    );
  }

  // ── Terms sub-view ────────────────────────────────────────────────────────
  if (showTerms) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-4 py-6">
          <button onClick={() => setShowTerms(false)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-5">
            <ArrowLeft className="h-4 w-4" /> Back to Settings
          </button>
          <h1 className="text-xl font-bold text-foreground mb-4">Terms & Privacy Policy</h1>
          <div className="rounded-xl border border-border bg-card p-5">
            <pre className="text-sm text-foreground leading-relaxed whitespace-pre-wrap font-sans">
              {TERMS_AND_PRIVACY}
            </pre>
          </div>
        </div>
      </Layout>
    );
  }

  // ── Delete Account sub-view ───────────────────────────────────────────────
  if (showDeleteModal) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto px-4 py-10">
          <button onClick={() => { setShowDeleteModal(false); setDeleteReason(""); setDeleteConfirm(""); }}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
            <ArrowLeft className="h-4 w-4" /> Back to Settings
          </button>
          <div className="rounded-xl border border-destructive/30 bg-card p-6 space-y-5">
            <div>
              <h2 className="text-lg font-bold text-foreground">Delete your account</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Your account will be scheduled for deletion. You can recover it within 7 days by logging back in. After that, all your data will be permanently deleted.
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground mb-2.5">Why are you leaving?</p>
              <div className="space-y-2">
                {DELETE_REASONS.map(r => (
                  <button key={r} onClick={() => setDeleteReason(r)}
                    className={`w-full text-left px-4 py-2.5 rounded-lg border text-sm transition-colors ${
                      deleteReason === r
                        ? "border-destructive bg-destructive/5 text-foreground"
                        : "border-border text-muted-foreground hover:border-destructive/40 hover:text-foreground"
                    }`}>
                    <span className={`inline-block h-3.5 w-3.5 rounded-full border mr-2.5 align-middle transition-colors ${
                      deleteReason === r ? "bg-destructive border-destructive" : "border-muted-foreground"
                    }`} />
                    {r}
                  </button>
                ))}
              </div>
            </div>
            {deleteReason && (
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">
                  Type <span className="font-mono bg-muted px-1 rounded text-xs">delete</span> to confirm
                </label>
                <Input value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} placeholder="delete" className="h-10 font-mono" />
              </div>
            )}
            <div className="flex gap-3 pt-1">
              <Button variant="outline" className="flex-1"
                onClick={() => { setShowDeleteModal(false); setDeleteReason(""); setDeleteConfirm(""); }}>
                Cancel
              </Button>
              <Button variant="destructive" className="flex-1"
                disabled={deleteConfirm !== "delete" || !deleteReason || deleteLoading}
                onClick={handleDeleteAccount}>
                {deleteLoading ? "Deleting…" : "Delete account"}
              </Button>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  // ── Main Settings view ────────────────────────────────────────────────────
  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <h1 className="font-display text-2xl font-bold text-foreground">Settings</h1>

        {/* Preferences */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <Sun className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Preferences</h2>
          </div>
          <div className="divide-y divide-border">
            <div className="flex items-center justify-between px-5 py-4">
              <div>
                <p className="text-sm font-medium text-foreground">Appearance</p>
                <p className="text-xs text-muted-foreground mt-0.5">{theme === "dark" ? "Dark mode is on" : "Light mode is on"}</p>
              </div>
              <button
                onClick={() => { toggleTheme(); toast({ title: theme === "dark" ? "Switched to light mode" : "Switched to dark mode" }); }}
                className="flex items-center gap-2 h-9 px-3 rounded-lg border border-border bg-secondary text-sm font-medium text-foreground hover:bg-muted transition-colors">
                {theme === "dark" ? <><Sun className="h-4 w-4" /> Light</> : <><Moon className="h-4 w-4" /> Dark</>}
              </button>
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Notifications</h2>
          </div>
          <div className="divide-y divide-border">
            {([
              { key: "likes",    label: "Likes",    desc: "When someone likes your posts",       icon: Heart },
              { key: "comments", label: "Comments", desc: "When someone comments on your posts", icon: MessageCircle },
              { key: "messages", label: "Messages", desc: "New message notifications",           icon: MessageCircle },
            ] as const).map(({ key, label, desc, icon: Icon }) => (
              <div key={key} className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                  </div>
                </div>
                <Switch checked={prefs[key]} onCheckedChange={v => setPrefs(p => ({ ...p, [key]: v }))} />
              </div>
            ))}
          </div>
        </div>

        {/* Privacy & Safety */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Privacy & Safety</h2>
          </div>
          <div className="divide-y divide-border">
            <button onClick={() => setShowBlocked(true)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted transition-colors group">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <UserX className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-foreground">Blocked Users</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Manage users you've blocked</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            </button>

            <div className="px-5 py-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <MessageCircle className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Who can message me</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Control who can send you messages</p>
                </div>
              </div>
              <div className="flex gap-2 ml-11">
                {(["anyone", "connected"] as const).map(opt => (
                  <button key={opt} onClick={() => setPrivacy(p => ({ ...p, whoCanMessage: opt }))}
                    className={`flex-1 h-8 rounded-lg text-xs font-medium border transition-colors ${
                      privacy.whoCanMessage === opt
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-secondary text-muted-foreground border-border hover:text-foreground"
                    }`}>
                    {opt === "anyone" ? "Anyone" : "Connected only"}
                  </button>
                ))}
              </div>
            </div>

            <div className="px-5 py-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Who can see my posts</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Control who can view your posts</p>
                </div>
              </div>
              <div className="flex gap-2 ml-11">
                {(["anyone", "connected"] as const).map(opt => (
                  <button key={opt} onClick={() => setPrivacy(p => ({ ...p, whoCanSeePost: opt }))}
                    className={`flex-1 h-8 rounded-lg text-xs font-medium border transition-colors ${
                      privacy.whoCanSeePost === opt
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-secondary text-muted-foreground border-border hover:text-foreground"
                    }`}>
                    {opt === "anyone" ? "Anyone" : "Connected only"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Account */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <Lock className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Account</h2>
          </div>
          <div className="px-5 py-4 space-y-3">
            {user.email && (
              <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-secondary/50 border border-border">
                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Mail className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Email linked</p>
                  <p className="text-sm font-medium text-foreground truncate">{user.email}</p>
                </div>
              </div>
            )}

            <Button size="sm" variant="outline" className="gap-1.5 h-9 w-full justify-start text-sm font-normal"
              onClick={() => setShowLoginActivity(true)}>
              <Monitor className="h-4 w-4 text-muted-foreground" /> Login Activity
            </Button>

            <Button size="sm" variant="outline" className="gap-1.5 h-9 w-full justify-start text-sm font-normal"
              onClick={() => setShowChangePw(v => !v)}>
              <Lock className="h-4 w-4 text-muted-foreground" /> Change password
            </Button>
            {showChangePw && (
              <div className="rounded-xl border border-border bg-background p-4 space-y-3">
                <div className="relative">
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Current password</label>
                  <input type={showCurrentPw ? "text" : "password"} value={currentPw} onChange={e => setCurrentPw(e.target.value)}
                    placeholder="Enter current password"
                    className="w-full h-9 rounded-lg border border-border bg-card px-3 pr-9 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary" />
                  <button type="button" onClick={() => setShowCurrentPw(v => !v)}
                    className="absolute right-3 top-7 text-muted-foreground hover:text-foreground">
                    {showCurrentPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
                <div className="relative">
                  <label className="text-xs font-medium text-muted-foreground block mb-1">New password</label>
                  <input type={showNewPw ? "text" : "password"} value={newPw} onChange={e => setNewPw(e.target.value)}
                    placeholder="Min. 6 characters"
                    className="w-full h-9 rounded-lg border border-border bg-card px-3 pr-9 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary" />
                  <button type="button" onClick={() => setShowNewPw(v => !v)}
                    className="absolute right-3 top-7 text-muted-foreground hover:text-foreground">
                    {showNewPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Confirm new password</label>
                  <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
                    placeholder="Repeat new password"
                    className="w-full h-9 rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary" />
                </div>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" className="flex-1 h-8 text-xs" onClick={handleChangePw} disabled={pwLoading}>
                    {pwLoading ? "Updating…" : "Update password"}
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 h-8 text-xs"
                    onClick={() => { setShowChangePw(false); setCurrentPw(""); setNewPw(""); setConfirmPw(""); }}>
                    Cancel
                  </Button>
                </div>
                <button onClick={() => navigate("/forgot-password")}
                  className="w-full text-center text-xs text-primary hover:underline">
                  Forgot password
                </button>
              </div>
            )}

            <Button size="sm" variant="outline"
              onClick={() => setShowDeleteModal(true)}
              className="gap-1.5 h-9 w-full justify-start text-sm font-normal text-destructive border-destructive/30 hover:bg-destructive/5 hover:border-destructive/60">
              <X className="h-4 w-4" /> Delete account
            </Button>
          </div>
        </div>

        {/* Help & Support */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Help & Support</h2>
          </div>
          <div className="divide-y divide-border">
            <div className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-foreground">Contact Us</p>
                  <p className="text-xs text-muted-foreground mt-0.5">prolifiersupport@gmail.com</p>
                </div>
              </div>
              <button
                onClick={() => { navigator.clipboard.writeText("prolifiersupport@gmail.com"); toast({ title: "Email copied!" }); }}
                className="flex items-center gap-1.5 text-xs font-medium text-primary border border-primary/30 bg-primary/5 hover:bg-primary/10 px-3 py-1.5 rounded-lg transition-colors">
                Copy
              </button>
            </div>
            <button onClick={() => setShowTerms(true)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted transition-colors group">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-foreground">Terms & Privacy Policy</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Read our terms and privacy policy</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            </button>
          </div>
        </div>

        {/* Log Out */}
        <Button variant="outline" className="w-full gap-2 h-11 text-sm font-medium"
          onClick={async () => { await signOut(); navigate("/"); }}>
          <LogOut className="h-4 w-4" /> Log Out
        </Button>
      </div>

      {/* Login Activity Modal */}
      {showLoginActivity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setShowLoginActivity(false)}>
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 animate-in zoom-in-95 duration-300"
            onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowLoginActivity(false)}
              className="absolute top-4 right-4 h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors">
              <X className="h-4 w-4" />
            </button>
            <h2 className="text-lg font-bold text-foreground mb-1">Login Activity</h2>
            <p className="text-xs text-muted-foreground mb-4">Active sessions on your account</p>

            {/* Current session */}
            <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3.5 mb-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Smartphone className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">This device</p>
                    <span className="text-xs text-primary font-medium px-2 py-0.5 rounded-full bg-primary/10">Active now</span>
                  </div>
                  {sessionInfo ? (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {sessionInfo.browser} · {sessionInfo.platform}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-0.5">Loading…</p>
                  )}
                </div>
              </div>
              {sessionInfo && (
                <p className="text-xs text-muted-foreground ml-12">
                  Signed in {new Date(sessionInfo.signedInAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                </p>
              )}
            </div>

            <p className="text-xs text-muted-foreground mb-3 text-center">
              If you don't recognise a session, sign out all other devices below.
            </p>

            <Button variant="outline" className="w-full h-10 text-sm gap-2"
              disabled={loggingOutOthers} onClick={handleSignOutOthers}>
              <LogOut className="h-4 w-4" />
              {loggingOutOthers ? "Signing out…" : "Sign out other devices"}
            </Button>
          </div>
        </div>
      )}
    </Layout>
  );
}
