import { useState, useRef, useEffect, useCallback } from "react";
import { useRealtimeChannel } from "@/hooks/useRealtimeChannel";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  MapPin, Github, Globe, Twitter, Edit, Check, X, Handshake, Camera,
  Eye, EyeOff, Shield, Lock, Heart, MessageCircle,
  ChevronRight, ArrowLeft, Bookmark, Sun, Moon, Users, HelpCircle,
  Mail, FileText, UserX, MoreHorizontal, Edit3, Trash2,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import Layout from "@/components/Layout";
import { toast } from "@/hooks/use-toast";
import { useTheme } from "@/context/ThemeContext";
import { useUser } from "@/context/UserContext";
import { supabase } from "@/lib/supabase";
import { SKILL_CATEGORIES } from "@/lib/skills";
import { LOCATIONS } from "@/lib/locations";

export const TERMS_AND_PRIVACY = `TERMS OF SERVICE

Last updated: March 2025

1. Acceptance of Terms
By using Prolifier ("the App"), you agree to be bound by these Terms of Service. If you do not agree, please discontinue use of the App immediately.

2. User Accounts
You are responsible for maintaining the confidentiality of your account credentials. You must be at least 18 years of age to use Prolifier. You agree to provide accurate information when creating your account.

3. User Content
You retain ownership of content you post. By posting content on Prolifier, you grant us a non-exclusive license to display and share it within the platform. You agree not to post content that is illegal, harmful, defamatory, or violates the rights of others.

4. Prohibited Conduct
You may not use Prolifier to spam, harass, impersonate others, or engage in any fraudulent activity. You may not attempt to gain unauthorized access to any part of the service.

5. Termination
We reserve the right to suspend or terminate your account at any time for violations of these terms or for any other reason at our discretion.

6. Disclaimer of Warranties
Prolifier is provided "as is" without warranties of any kind. We do not guarantee uninterrupted or error-free service.

7. Limitation of Liability
To the maximum extent permitted by law, Prolifier shall not be liable for any indirect, incidental, or consequential damages arising from your use of the App.

8. Changes to Terms
We may update these terms at any time. Continued use of the App after changes constitutes acceptance of the new terms.

9. Contact
For questions about these terms, contact us at prolifiersupport@gmail.com

─────────────────────────────────────────────────

PRIVACY POLICY

Last updated: March 2025

1. Information We Collect
We collect information you provide directly, including your name, email address, profile details (bio, skills, location, project), and any content you post. We also collect usage data such as login activity and features accessed.

2. How We Use Your Information
We use your information to operate and improve the App, to connect you with other users, and to send important service-related communications. We do not use your information for advertising purposes.

3. Sharing Your Information
We do not sell your personal data to third parties. We may share data with service providers (such as Supabase for database and authentication services) who assist in operating the App, under strict confidentiality agreements.

4. Data Storage and Security
Your data is stored securely using industry-standard encryption and security practices. We cannot guarantee absolute security of any internet-based service.

5. Your Rights
You may update or delete your account and associated data at any time from your profile settings. Upon account deletion, your data will be permanently removed within 7 days.

6. Cookies and Local Storage
We use essential session cookies for authentication purposes only. We do not use tracking or advertising cookies. Some preferences (such as theme and blocked users) are stored locally on your device.

7. Children's Privacy
Prolifier is not intended for users under the age of 18. We do not knowingly collect information from minors.

8. Changes to This Policy
We may update this Privacy Policy from time to time. We will notify you of significant changes via in-app notification.

9. Contact
For privacy-related questions or concerns, please contact us at prolifiersupport@gmail.com`;

const DELETE_REASONS = [
  "I'm not getting value from Prolifier",
  "I found a better platform",
  "Privacy concerns",
  "Too many notifications",
  "Prefer not to say",
];

const TAG_COLORS: Record<string, string> = {
  Launch: "bg-emerald-100 text-emerald-700",
  Progress: "bg-sky-100 text-sky-700",
  Question: "bg-amber-100 text-amber-700",
  Idea: "bg-violet-100 text-violet-700",
  Milestone: "bg-primary/10 text-primary",
  Feedback: "bg-rose-100 text-rose-700",
  Story: "bg-pink-100 text-pink-700",
  Resource: "bg-teal-100 text-teal-700",
};

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

type BlockedUser = { id: string; name: string; avatar: string; color: string; avatarUrl?: string };
type Connection  = { id: string; name: string; avatar: string; color: string; avatarUrl?: string; location?: string };
type PostItem    = { id: string; tag: string; content: string; image?: string; video?: string; time: string; likes: number; commentCount: number; created_at: string; };
type CollabItem  = { id: string; title: string; looking: string; description: string; skills: string[] };
type SavedPost   = { id: string; tag: string; content: string; time: string; likes: number };
type ViewType    = null | "connections" | "posts" | "saved" | "blocked" | "terms" | "settings";

export default function Profile() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { user, updateUser, signOut } = useUser();

  // Edit state
  const [editing, setEditing]             = useState(false);
  const [saving, setSaving]               = useState(false);
  const [draftName, setDraftName]         = useState("");
  const [draftLocation, setDraftLocation] = useState("");
  const [draftBio, setDraftBio]           = useState("");
  const [draftProject, setDraftProject]   = useState("");
  const [draftSkills, setDraftSkills]     = useState<string[]>([]);
  const [customSkillInput, setCustomSkillInput] = useState("");
  const [draftGithub, setDraftGithub]     = useState("");
  const [draftWebsite, setDraftWebsite]   = useState("");
  const [draftTwitter, setDraftTwitter]   = useState("");

  // Location autocomplete
  const [locationQuery, setLocationQuery]               = useState("");
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const locationRef = useRef<HTMLDivElement>(null);

  // Avatar
  const avatarRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl]         = useState<string | null>(user.avatarUrl || null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  useEffect(() => { if (user.avatarUrl) setAvatarUrl(user.avatarUrl); }, [user.avatarUrl]);

  // Analytics counts
  const [analytics, setAnalytics] = useState({ postCount: 0, connectionCount: 0, savedCount: 0 });

  // Sub-view
  const [view, setView]               = useState<ViewType>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [userPosts, setUserPosts]     = useState<PostItem[]>([]);
  const [userCollabs, setUserCollabs] = useState<CollabItem[]>([]);
  const [savedPosts, setSavedPosts]   = useState<SavedPost[]>([]);
  const [postsTab, setPostsTab]       = useState<"posts" | "collabs">("posts");
  const [blockedList, setBlockedList] = useState<BlockedUser[]>([]);
  const [editingPost, setEditingPost] = useState<PostItem | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editTag, setEditTag] = useState("");
  const [deletePostId, setDeletePostId] = useState<string | null>(null);

  // Password
  const [showChangePw, setShowChangePw]     = useState(false);
  const [currentPw, setCurrentPw]           = useState("");
  const [newPw, setNewPw]                   = useState("");
  const [confirmPw, setConfirmPw]           = useState("");
  const [showCurrentPw, setShowCurrentPw]   = useState(false);
  const [showNewPw, setShowNewPw]           = useState(false);
  const [pwLoading, setPwLoading]           = useState(false);

  // Delete
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteReason, setDeleteReason]       = useState("");
  const [deleteConfirm, setDeleteConfirm]     = useState("");
  const [deleteLoading, setDeleteLoading]     = useState(false);

  const initials = user.name.split(" ").filter(Boolean).map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";
  const blockedKey = user.id ? `prolifier_blocked_${user.id}` : null;

  const loadBlockedFromStorage = (): BlockedUser[] => {
    if (!blockedKey) return [];
    try { return JSON.parse(localStorage.getItem(blockedKey) || "[]"); }
    catch { return []; }
  };

  // Load analytics (Connections count both sides, Posts, Saved)
  const loadAnalytics = useCallback(async () => {
    if (!user.id) return;
    try {
      const [postsRes, connsReq, connsRec, savedRes] = await Promise.all([
        (supabase as any).from("posts").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        (supabase as any).from("connections").select("id", { count: "exact", head: true }).eq("requester_id", user.id).eq("status", "accepted"),
        (supabase as any).from("connections").select("id", { count: "exact", head: true }).eq("receiver_id", user.id).eq("status", "accepted"),
        (supabase as any).from("saved_posts").select("post_id", { count: "exact", head: true }).eq("user_id", user.id),
      ]);
      setAnalytics({
        postCount: postsRes.count || 0,
        connectionCount: (connsReq.count || 0) + (connsRec.count || 0),
        savedCount: savedRes.count || 0,
      });
    } catch { /* silent */ }
  }, [user.id]);

  const loadAnalyticsRef = useRef(loadAnalytics);
  useEffect(() => { loadAnalyticsRef.current = loadAnalytics; }, [loadAnalytics]);

  useEffect(() => {
    if (user.id) loadAnalytics();
  }, [user.id, loadAnalytics]);

  // Real-time: update connection count when connections change
  useRealtimeChannel(
    user.id ? `profile-connections-${user.id}` : null,
    ch => ch
      .on("postgres_changes", { event: "*", schema: "public", table: "connections", filter: `requester_id=eq.${user.id}` }, () => loadAnalyticsRef.current())
      .on("postgres_changes", { event: "*", schema: "public", table: "connections", filter: `receiver_id=eq.${user.id}` }, () => loadAnalyticsRef.current()),
  );

  // Close location dropdown on outside click
  useEffect(() => {
    if (!showLocationDropdown) return;
    const handler = (e: MouseEvent) => {
      if (locationRef.current && !locationRef.current.contains(e.target as Node)) {
        setShowLocationDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showLocationDropdown]);

  const openView = async (v: ViewType) => {
    setView(v);
    if (v === "blocked") {
      setBlockedList(loadBlockedFromStorage());
      return;
    }
    if (v === "terms") return;
    if (v === "settings") return;

    if (v === "connections") {
      setViewLoading(true);
      try {
        const [reqRes, recRes] = await Promise.all([
          (supabase as any).from("connections").select("receiver_id").eq("requester_id", user.id).eq("status", "accepted"),
          (supabase as any).from("connections").select("requester_id").eq("receiver_id", user.id).eq("status", "accepted"),
        ]);
        const ids = [
          ...(reqRes.data || []).map((r: any) => r.receiver_id),
          ...(recRes.data || []).map((r: any) => r.requester_id),
        ];
        if (ids.length === 0) { setConnections([]); setViewLoading(false); return; }
        const { data: profiles } = await (supabase as any).from("profiles")
          .select("id, name, avatar, color, avatar_url, location")
          .in("id", ids);
        setConnections((profiles || []).map((p: any) => ({
          id: p.id, name: p.name || "Unknown", avatar: p.avatar || "?",
          color: p.color || "bg-primary",
          avatarUrl: p.avatar_url || undefined,
          location: p.location || "",
        })));
      } catch { /* silent */ }
      setViewLoading(false);
    } else if (v === "posts") {
      setViewLoading(true);
      setPostsTab("posts");
      try {
        const [postsRes, collabsRes] = await Promise.all([
          (supabase as any).from("posts").select("id, tag, content, image_url, video_url, created_at, likes").eq("user_id", user.id).order("created_at", { ascending: false }).limit(30),
          (supabase as any).from("collabs").select("id, title, looking, description, skills").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
        ]);
        setUserPosts((postsRes.data || []).map((p: any) => ({
          id: p.id, tag: p.tag, content: p.content,
          image: p.image_url || undefined, video: p.video_url || undefined,
          time: timeAgo(p.created_at), likes: p.likes || 0, commentCount: 0,
          created_at: p.created_at,
        })));
        setUserCollabs((collabsRes.data || []).map((c: any) => ({
          id: c.id, title: c.title, looking: c.looking, description: c.description, skills: c.skills || [],
        })));
      } catch { /* silent */ }
      setViewLoading(false);
    } else if (v === "saved") {
      setViewLoading(true);
      try {
        const { data } = await (supabase as any)
          .from("saved_posts")
          .select("post_id, created_at, posts(id, tag, content, created_at, likes)")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(30);
        setSavedPosts((data || []).filter((r: any) => r.posts).map((r: any) => ({
          id: r.post_id, tag: r.posts.tag, content: r.posts.content,
          time: timeAgo(r.posts.created_at), likes: r.posts.likes || 0,
        })));
      } catch { /* silent */ }
      setViewLoading(false);
    }
  };

  const startEditing = () => {
    setDraftName(user.name);
    setDraftLocation(user.location);
    setLocationQuery(user.location);
    setDraftBio(user.bio);
    setDraftProject(user.project);
    setDraftSkills([...user.skills]);
    setDraftGithub(user.github);
    setDraftWebsite(user.website);
    setDraftTwitter(user.twitter);
    setEditing(true);
  };

  const saveEdits = async () => {
    if (!draftName.trim()) return;
    if (draftLocation.trim() && !LOCATIONS.includes(draftLocation.trim())) {
      toast({ title: "Please select a valid location from the list", variant: "destructive" }); return;
    }
    setSaving(true);
    await updateUser({
      name: draftName.trim(), location: draftLocation.trim(), bio: draftBio.trim(),
      project: draftProject.trim(), skills: draftSkills,
      github: draftGithub.trim(), website: draftWebsite.trim(), twitter: draftTwitter.trim(),
    });
    setSaving(false);
    setEditing(false);
    toast({ title: "Profile updated! ✓" });
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setAvatarUploading(true);
    // Remove any existing avatar files first (cleans up old extension-based files too)
    const { data: existing } = await (supabase as any).storage.from("avatars").list(user.id);
    if (existing?.length > 0) {
      await (supabase as any).storage.from("avatars").remove(existing.map((f: any) => `${user.id}/${f.name}`));
    }
    const path = `${user.id}/avatar`;
    const { error } = await (supabase as any).storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
    if (error) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
      setAvatarUploading(false);
      return;
    }
    const { data } = (supabase as any).storage.from("avatars").getPublicUrl(path);
    const url = data.publicUrl + "?t=" + Date.now();
    setAvatarUrl(url);
    await updateUser({ avatarUrl: url });
    setAvatarUploading(false);
    toast({ title: "Profile photo updated! 📸" });
  };

  const handleRemoveAvatar = async () => {
    setAvatarUploading(true);
    const { data: files } = await (supabase as any).storage.from("avatars").list(user.id);
    if (files?.length > 0) {
      await (supabase as any).storage.from("avatars").remove(files.map((f: any) => `${user.id}/${f.name}`));
    }
    setAvatarUrl(null);
    await updateUser({ avatarUrl: "" });
    setAvatarUploading(false);
    toast({ title: "Profile photo removed" });
  };

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
      toast({ title: "Password updated successfully! 🔒" });
    } catch {
      toast({ title: "Something went wrong", variant: "destructive" });
    }
    setPwLoading(false);
  };

  const handleForgotPassword = () => navigate("/forgot-password");

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== "delete" || !deleteReason) return;
    setDeleteLoading(true);
    try {
      await (supabase as any).from("profiles").update({ deleted_at: new Date().toISOString() }).eq("id", user.id);
      await signOut();
      navigate("/");
      toast({ title: "Account scheduled for deletion", description: "You can recover it within 7 days by logging back in." });
    } catch (err: any) {
      toast({ title: "Failed to delete account", description: err.message, variant: "destructive" });
      setDeleteLoading(false);
    }
  };

  const handleUnblock = async (userId: string) => {
    if (!blockedKey) return;
    const updated = blockedList.filter(u => u.id !== userId);
    localStorage.setItem(blockedKey, JSON.stringify(updated));
    setBlockedList(updated);
    await (supabase as any).from("blocks").delete().eq("blocker_id", user.id).eq("blocked_id", userId);
    toast({ title: "User unblocked" });
  };

  const handleEditPostSave = async () => {
    if (!editingPost || !editContent.trim()) return;
    await (supabase as any).from("posts").update({ content: editContent.trim(), tag: editTag }).eq("id", editingPost.id).eq("user_id", user.id);
    setUserPosts(prev => prev.map(p => p.id === editingPost.id ? { ...p, content: editContent.trim(), tag: editTag } : p));
    setEditingPost(null);
    toast({ title: "Post updated!" });
  };

  const handleDeletePost = async (postId: string) => {
    await (supabase as any).from("posts").delete().eq("id", postId).eq("user_id", user.id);
    setUserPosts(prev => prev.filter(p => p.id !== postId));
    setAnalytics(prev => ({ ...prev, postCount: Math.max(0, prev.postCount - 1) }));
    setDeletePostId(null);
    toast({ title: "Post deleted." });
  };

  const toggleSkill = (s: string, list: string[], setList: (v: string[]) => void) =>
    setList(list.includes(s) ? list.filter(x => x !== s) : [...list, s]);

  const locationSuggestions = locationQuery.length >= 1
    ? LOCATIONS.filter(l => l.toLowerCase().startsWith(locationQuery.toLowerCase())).slice(0, 6)
    : [];

  // ── Delete modal ──────────────────────────────────────────────────────────
  if (showDeleteModal) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto px-4 py-10">
          <button onClick={() => { setShowDeleteModal(false); setDeleteReason(""); setDeleteConfirm(""); }}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
            <ArrowLeft className="h-4 w-4" /> Back to Profile
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
                    }`}/>
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

  // ── Connections view ──────────────────────────────────────────────────────
  if (view === "connections") {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-4 py-6">
          <button onClick={() => setView(null)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-5">
            <ArrowLeft className="h-4 w-4" /> Back to Profile
          </button>
          <h1 className="text-xl font-bold text-foreground mb-4">Connections ({connections.length})</h1>
          {viewLoading ? (
            <div className="text-center py-12 text-sm text-muted-foreground">Loading…</div>
          ) : connections.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No connections yet.</p>
              <p className="text-xs mt-1">Connect with makers in Discover.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
              {connections.map(c => (
                <button key={c.id} onClick={() => navigate(`/profile/${c.id}`)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted transition-colors text-left">
                  <div className={`h-10 w-10 rounded-xl ${c.avatarUrl ? "" : c.color} flex items-center justify-center text-white font-bold text-sm shrink-0 overflow-hidden`}>
                    {c.avatarUrl
                      ? <img src={c.avatarUrl} alt={c.avatar} className="w-full h-full object-cover" />
                      : c.avatar}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{c.name}</p>
                    {c.location && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <MapPin className="h-3 w-3" />{c.location}
                      </p>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      </Layout>
    );
  }

  // ── Posts view ────────────────────────────────────────────────────────────
  if (view === "posts") {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-4 py-6">
          <button onClick={() => setView(null)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-5">
            <ArrowLeft className="h-4 w-4" /> Back to Profile
          </button>
          <h1 className="text-xl font-bold text-foreground mb-4">Your Posts</h1>
          {viewLoading ? (
            <div className="text-center py-12 text-sm text-muted-foreground">Loading…</div>
          ) : (
            <>
              <div className="flex gap-2 mb-4">
                {(["posts", "collabs"] as const).map(tab => (
                  <button key={tab} onClick={() => setPostsTab(tab)}
                    className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      postsTab === tab ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-secondary"
                    }`}>
                    {tab === "posts" ? `Feed (${userPosts.length})` : `Collabs (${userCollabs.length})`}
                  </button>
                ))}
              </div>
              {postsTab === "posts" ? (
                userPosts.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <MessageCircle className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No posts yet. Share something on the feed!</p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
                    {userPosts.map(post => (
                      <div key={post.id} className="px-5 py-4">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TAG_COLORS[post.tag] ?? "bg-muted text-muted-foreground"}`}>
                              {post.tag}
                            </span>
                            <span className="text-xs text-muted-foreground">{post.time}</span>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors shrink-0">
                                <MoreHorizontal className="h-4 w-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40">
                              <DropdownMenuItem onClick={() => { setEditingPost(post); setEditContent(post.content); setEditTag(post.tag); }} className="gap-2">
                                <Edit3 className="h-4 w-4" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => setDeletePostId(post.id)} className="gap-2 text-destructive focus:text-destructive">
                                <Trash2 className="h-4 w-4" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <button className="w-full text-left" onClick={() => navigate(`/feed?highlight=${post.id}`)}>
                          <p className="text-sm text-foreground leading-relaxed mb-2 line-clamp-3">{post.content}</p>
                          {post.image && (
                            <div className="mb-2 rounded-xl overflow-hidden">
                              <img src={post.image} alt="post" className="w-full max-h-48 object-cover rounded-xl" />
                            </div>
                          )}
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1.5"><Heart className="h-3.5 w-3.5" /> {post.likes}</span>
                            <span className="flex items-center gap-1.5"><MessageCircle className="h-3.5 w-3.5" /> {post.commentCount}</span>
                          </div>
                        </button>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                userCollabs.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Handshake className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No collabs yet. Post a collab on the feed!</p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
                    {userCollabs.map(collab => (
                      <button key={collab.id} onClick={() => navigate("/feed?tab=collabs")}
                        className="w-full px-5 py-4 text-left hover:bg-muted transition-colors">
                        <p className="text-sm font-semibold text-foreground mb-1">{collab.title}</p>
                        <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{collab.description}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {collab.skills.map(s => <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>)}
                        </div>
                      </button>
                    ))}
                  </div>
                )
              )}
            </>
          )}
          {editingPost && (
            <Dialog open={!!editingPost} onOpenChange={(v) => !v && setEditingPost(null)}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader><DialogTitle>Edit Post</DialogTitle></DialogHeader>
                <div className="space-y-3 py-2">
                  <div className="flex flex-wrap gap-2">
                    {["General","Launch","Progress","Question","Idea","Milestone","Feedback","Story","Resource"].map(t => (
                      <Badge key={t} variant={editTag === t ? "default" : "outline"} className="cursor-pointer text-xs" onClick={() => setEditTag(t)}>{t}</Badge>
                    ))}
                  </div>
                  <Textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={4} placeholder="What's on your mind?" />
                </div>
                <DialogFooter className="gap-2">
                  <Button variant="outline" onClick={() => setEditingPost(null)}>Cancel</Button>
                  <Button onClick={handleEditPostSave} disabled={!editContent.trim()} className="gap-1.5">
                    <Check className="h-4 w-4" /> Save
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          {deletePostId && (
            <Dialog open={!!deletePostId} onOpenChange={(v) => !v && setDeletePostId(null)}>
              <DialogContent className="sm:max-w-sm">
                <DialogHeader><DialogTitle>Delete Post?</DialogTitle><DialogDescription>This action cannot be undone.</DialogDescription></DialogHeader>
                <DialogFooter className="gap-2 pt-2">
                  <Button variant="outline" onClick={() => setDeletePostId(null)}>Cancel</Button>
                  <Button variant="destructive" onClick={() => handleDeletePost(deletePostId)}>Delete</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </Layout>
    );
  }

  // ── Saved view ────────────────────────────────────────────────────────────
  if (view === "saved") {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-4 py-6">
          <button onClick={() => setView(null)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-5">
            <ArrowLeft className="h-4 w-4" /> Back to Profile
          </button>
          <h1 className="text-xl font-bold text-foreground mb-4">Saved Posts ({savedPosts.length})</h1>
          {viewLoading ? (
            <div className="text-center py-12 text-sm text-muted-foreground">Loading…</div>
          ) : savedPosts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Bookmark className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No saved posts yet.</p>
              <p className="text-xs mt-1">Bookmark posts from the feed to see them here.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
              {savedPosts.map(post => (
                <button key={post.id} onClick={() => navigate(`/feed?highlight=${post.id}`)}
                  className="w-full px-5 py-4 text-left hover:bg-muted transition-colors">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TAG_COLORS[post.tag] ?? "bg-muted text-muted-foreground"}`}>
                      {post.tag}
                    </span>
                    <span className="text-xs text-muted-foreground">{post.time}</span>
                  </div>
                  <p className="text-sm text-foreground leading-relaxed mb-2 line-clamp-3">{post.content}</p>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Heart className="h-3.5 w-3.5" /> {post.likes}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </Layout>
    );
  }

  // ── Blocked users view ────────────────────────────────────────────────────
  if (view === "blocked") {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-4 py-6">
          <button onClick={() => setView(null)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-5">
            <ArrowLeft className="h-4 w-4" /> Back to Profile
          </button>
          <h1 className="text-xl font-bold text-foreground mb-1">Blocked Users</h1>
          <p className="text-sm text-muted-foreground mb-4">Blocked users cannot see your profile or contact you.</p>
          {blockedList.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <UserX className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No blocked users.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
              {blockedList.map(u => (
                <div key={u.id} className="flex items-center gap-3 px-4 py-3.5">
                  <div className={`h-10 w-10 rounded-xl ${u.avatarUrl ? "" : u.color} flex items-center justify-center text-white font-bold text-sm shrink-0 overflow-hidden`}>
                    {u.avatarUrl
                      ? <img src={u.avatarUrl} alt={u.avatar} className="w-full h-full object-cover" />
                      : u.avatar}
                  </div>
                  <p className="flex-1 text-sm font-semibold text-foreground min-w-0 truncate">{u.name}</p>
                  <Button size="sm" variant="outline" className="h-8 text-xs shrink-0"
                    onClick={() => handleUnblock(u.id)}>
                    Unblock
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Layout>
    );
  }

  // ── Terms & Privacy view ──────────────────────────────────────────────────
  if (view === "terms") {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-4 py-6">
          <button onClick={() => setView(null)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-5">
            <ArrowLeft className="h-4 w-4" /> Back to Profile
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

  // ── Settings view ─────────────────────────────────────────────────────────
  if (view === "settings") {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          <button onClick={() => setView(null)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back to Profile
          </button>
          <h1 className="text-xl font-bold text-foreground">Settings</h1>

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

          {/* Privacy & Safety */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Privacy & Safety</h2>
            </div>
            <div className="divide-y divide-border">
              <button onClick={() => openView("blocked")}
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
                    <span className="text-xs font-bold text-primary">{user.email[0].toUpperCase()}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Connected as</p>
                    <p className="text-sm font-medium text-foreground truncate">{user.email}</p>
                  </div>
                </div>
              )}
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
                  <button onClick={handleForgotPassword}
                    className="w-full text-center text-xs text-primary hover:underline">
                    Forgot password
                  </button>
                </div>
              )}
              <Button size="sm" variant="outline"
                onClick={async () => { await signOut(); navigate("/"); }}
                className="gap-1.5 h-9 w-full justify-start text-sm font-normal">
                <ArrowLeft className="h-4 w-4" /> Sign out
              </Button>
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
              <button
                onClick={() => openView("terms")}
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
        </div>
      </Layout>
    );
  }

  // ── Main profile view ─────────────────────────────────────────────────────
  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">

        {/* Profile card */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-start gap-4 mb-5">

            {/* Avatar */}
            <div className="relative shrink-0 group">
              <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
              <div className={`h-20 w-20 rounded-2xl overflow-hidden ${user.color} flex items-center justify-center text-white text-2xl font-bold ${editing ? "cursor-pointer" : ""}`}
                onClick={() => editing && !avatarUploading && avatarRef.current?.click()}>
                {avatarUrl
                  ? <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                  : initials}
              </div>
              {avatarUploading ? (
                <div className="absolute inset-0 rounded-2xl bg-black/50 flex items-center justify-center">
                  <div className="h-5 w-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                </div>
              ) : editing ? (
                <button onClick={() => avatarRef.current?.click()}
                  className="absolute inset-0 rounded-2xl bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                  <Camera className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ) : null}
              {editing && avatarUrl && !avatarUploading && (
                <button onClick={handleRemoveAvatar}
                  className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive flex items-center justify-center shadow-sm hover:opacity-90 transition-opacity z-10">
                  <X className="h-3 w-3 text-white" />
                </button>
              )}
            </div>

            <div className="flex-1 min-w-0">
              {editing ? (
                <div className="space-y-2">
                  <Input value={draftName} onChange={e => setDraftName(e.target.value)} className="h-9 font-semibold" placeholder="Your name" maxLength={20} />
                  {/* Location autocomplete */}
                  <div ref={locationRef} className="relative">
                    <Input
                      value={locationQuery}
                      onChange={e => {
                        const val = e.target.value;
                        setLocationQuery(val);
                        setDraftLocation(val);
                        setShowLocationDropdown(true);
                      }}
                      onFocus={() => setShowLocationDropdown(true)}
                      className="h-8 text-sm"
                      placeholder="Country / Location"
                    />
                    {showLocationDropdown && locationSuggestions.length > 0 && (
                      <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg overflow-hidden max-h-44 overflow-y-auto">
                        {locationSuggestions.map(loc => (
                          <button key={loc} type="button"
                            onMouseDown={e => {
                              e.preventDefault();
                              setDraftLocation(loc);
                              setLocationQuery(loc);
                              setShowLocationDropdown(false);
                            }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors text-foreground">
                            {loc}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <h1 className="text-xl font-bold text-foreground truncate">{user.name}</h1>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => { updateUser({ openToCollab: !user.openToCollab }); toast({ title: !user.openToCollab ? "You're open to collaborate 🤝" : "Status set to Not available" }); }}
                        className={`h-7 px-3 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 border ${
                          user.openToCollab
                            ? "bg-emerald-500 text-white border-emerald-500 hover:bg-emerald-600"
                            : "bg-secondary text-muted-foreground border-border hover:bg-muted"
                        }`}>
                        <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${user.openToCollab ? "bg-white" : "bg-muted-foreground"}`} />
                        {user.openToCollab ? "Open to collab" : "Not available"}
                      </button>
                      <Button variant="outline" size="sm" onClick={startEditing} className="h-7 text-xs gap-1 px-2.5">
                        <Edit className="h-3 w-3" /> Edit
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                    <MapPin className="h-3.5 w-3.5" /> {user.location || "No location set"}
                  </p>
                </>
              )}
            </div>
          </div>

          {/* About */}
          <div className="mb-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">About</p>
            {editing
              ? <>
                  <Textarea value={draftBio}
                    onChange={e => setDraftBio(e.target.value)}
                    maxLength={100}
                    rows={3} placeholder="Tell people about yourself..." />
                  <p className="text-xs text-muted-foreground text-right mt-1">
                    {draftBio.length}/100
                  </p>
                </>
              : <p className="text-sm text-foreground leading-relaxed">{user.bio || <span className="text-muted-foreground italic">No bio yet</span>}</p>}
          </div>

          {/* Building */}
          <div className="mb-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Currently building</p>
            {editing
              ? <Input value={draftProject} onChange={e => setDraftProject(e.target.value)} className="h-9" placeholder="Project name — short description" maxLength={25} />
              : <p className="text-sm text-primary font-medium">{user.project || <span className="text-muted-foreground italic font-normal">Nothing listed yet</span>}</p>}
          </div>

          {/* Skills */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Skills & expertise</p>
              {editing && <span className={`text-xs font-medium ${draftSkills.length >= 3 ? "text-primary" : "text-muted-foreground"}`}>{draftSkills.length}/3</span>}
            </div>
            {editing ? (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {SKILL_CATEGORIES.map(s => {
                    const selected = draftSkills.includes(s);
                    const maxed = !selected && draftSkills.length >= 3;
                    return (
                      <Badge key={s}
                        variant={selected ? "default" : "outline"}
                        className={`text-xs transition-all ${maxed ? "opacity-40 cursor-not-allowed" : "cursor-pointer hover:scale-105"}`}
                        onClick={() => { if (!maxed) toggleSkill(s, draftSkills, setDraftSkills); }}>
                        {s}{selected && <X className="h-2.5 w-2.5 ml-1" />}
                      </Badge>
                    );
                  })}
                  {draftSkills.filter(s => !(SKILL_CATEGORIES as readonly string[]).includes(s)).map(s => (
                    <Badge key={s} variant="default" className="text-xs cursor-pointer gap-1"
                      onClick={() => setDraftSkills(prev => prev.filter(x => x !== s))}>
                      {s} <X className="h-2.5 w-2.5" />
                    </Badge>
                  ))}
                </div>
                {draftSkills.length < 3 && (
                  <div className="flex gap-2">
                    <Input placeholder="Other skill…" value={customSkillInput}
                      onChange={e => setCustomSkillInput(e.target.value)}
                      className="h-8 text-sm"
                      maxLength={20}
                      onKeyDown={e => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const val = customSkillInput.trim();
                          if (val && !draftSkills.includes(val) && draftSkills.length < 3) setDraftSkills(prev => [...prev, val]);
                          setCustomSkillInput("");
                        }
                      }} />
                    <Button type="button" size="sm" variant="outline" className="h-8 px-3 shrink-0"
                      onClick={() => {
                        const val = customSkillInput.trim();
                        if (val && !draftSkills.includes(val) && draftSkills.length < 3) setDraftSkills(prev => [...prev, val]);
                        setCustomSkillInput("");
                      }}>Add</Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {user.skills.length > 0
                  ? user.skills.slice(0, 3).map(s => <Badge key={s} variant="outline" className="text-xs">{s}</Badge>)
                  : <span className="text-xs text-muted-foreground italic">No skills added yet</span>}
              </div>
            )}
          </div>

          {/* Links */}
          <div className="mb-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Links</p>
            {editing ? (
              <div className="space-y-2">
                {([
                  { Icon: Github,  val: draftGithub,  set: setDraftGithub,  ph: "github.com/username" },
                  { Icon: Globe,   val: draftWebsite, set: setDraftWebsite, ph: "yourwebsite.com" },
                  { Icon: Twitter, val: draftTwitter, set: setDraftTwitter, ph: "@handle" },
                ] as const).map(({ Icon, val, set, ph }) => (
                  <div key={ph} className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <Input value={val} onChange={e => (set as (v: string) => void)(e.target.value)} className="h-8 text-sm" placeholder={ph} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-4">
                {user.github  && <a href={`https://${user.github}`}  target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"><Github  className="h-4 w-4" />{user.github}</a>}
                {user.website && <a href={`https://${user.website}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"><Globe   className="h-4 w-4" />{user.website}</a>}
                {user.twitter && <a href={`https://twitter.com/${user.twitter.replace("@", "")}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"><Twitter className="h-4 w-4" />{user.twitter}</a>}
                {!user.github && !user.website && !user.twitter && <span className="text-xs text-muted-foreground italic">No links added</span>}
              </div>
            )}
          </div>

          {/* Save / Cancel */}
          {editing && (
            <div className="flex gap-2 mb-5">
              <Button onClick={saveEdits} disabled={!draftName.trim() || saving} className="flex-1 gap-1.5">
                <Check className="h-4 w-4" /> {saving ? "Saving…" : "Save changes"}
              </Button>
              <Button variant="outline" onClick={() => setEditing(false)} className="flex-1 gap-1.5">
                <X className="h-4 w-4" /> Cancel
              </Button>
            </div>
          )}

          {/* Stats tiles — Connections / Posts / Saved */}
          <div className="pt-4 border-t border-border grid grid-cols-3 gap-2">
            {[
              { n: analytics.connectionCount, label: "Connections", v: "connections" as ViewType },
              { n: analytics.postCount,        label: "Posts",       v: "posts"       as ViewType },
              { n: analytics.savedCount,       label: "Saved",       v: "saved"       as ViewType },
            ].map(({ n, label, v }) => (
              <button key={label} onClick={() => openView(v)}
                className="flex flex-col items-center justify-center bg-secondary/60 hover:bg-secondary active:scale-95 border border-border rounded-xl px-3 py-3 transition-all group shadow-sm">
                <p className="text-2xl font-bold text-foreground group-hover:text-primary transition-colors">{n}</p>
                <p className="text-xs text-muted-foreground mt-0.5 font-medium">{label}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Settings entry */}
        <button onClick={() => openView("settings")}
          className="w-full flex items-center justify-between px-5 py-4 rounded-xl border border-border bg-card hover:bg-muted transition-colors group">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Shield className="h-4 w-4 text-primary" />
            </div>
            <p className="text-sm font-semibold text-foreground">Settings</p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
        </button>

      </div>
    </Layout>
  );
}
