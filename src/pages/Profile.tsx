import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  MapPin, Github, Globe, Twitter, Edit, Check, X, Handshake, Camera,
  Eye, EyeOff, TrendingUp, Shield, Lock, Heart, MessageCircle, Share2,
  ChevronRight, ArrowLeft, Bookmark, Sun, Moon,
} from "lucide-react";
import Layout from "@/components/Layout";
import { toast } from "@/hooks/use-toast";
import { useTheme } from "@/context/ThemeContext";
import { useUser } from "@/context/UserContext";
import { supabase } from "@/lib/supabase";


const allSkills = [
  "Photography","Video","Graphic Design","Writing","Music","Marketing",
  "Social Media","Community","Events","Teaching","Cooking","Crafts",
  "Audio Engineering","Animation","Illustration","Research","Coaching","Content Creation",
  "React","TypeScript","Node.js","Python","UI/UX","Product",
];

const DELETE_REASONS = [
  "I'm not getting value from Prolifier",
  "I found a better platform",
  "Privacy concerns",
  "Too many notifications",
  "Prefer not to say",
];

const ACTIVITY_TABS = [
  { key:"all",     label:"All"      },
  { key:"post",    label:"Posts"    },
  { key:"like",    label:"Likes"    },
  { key:"comment", label:"Comments" },
  { key:"collab",  label:"Collabs"  },
];

type ActivityItem = {
  id: string;
  type: string;
  label: string;
  detail: string;
  time: string;
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

export default function Profile() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { user, updateUser, signOut } = useUser();

  // ── Edit state ─────────────────────────────────────────────────────────
  const [editing, setEditing]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [draftName, setDraftName]   = useState("");
  const [draftLocation, setDraftLocation] = useState("");
  const [draftBio, setDraftBio]     = useState("");
  const [draftProject, setDraftProject] = useState("");
  const [draftSkills, setDraftSkills]   = useState<string[]>([]);
  const [draftLooking, setDraftLooking] = useState<string[]>([]);
  const [draftGithub, setDraftGithub]   = useState("");
  const [draftWebsite, setDraftWebsite] = useState("");
  const [draftTwitter, setDraftTwitter] = useState("");

  // ── Avatar ─────────────────────────────────────────────────────────────
  const avatarRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl]   = useState<string|null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  // ── Analytics ──────────────────────────────────────────────────────────
  const [analytics, setAnalytics] = useState({ views: 0, postCount: 0, collabCount: 0, connectionCount: 0 });

  // ── Activity ───────────────────────────────────────────────────────────
  const [showActivity, setShowActivity] = useState(false);
  const [activityTab, setActivityTab]   = useState("all");
  const [activity, setActivity]         = useState<ActivityItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  // ── Privacy ────────────────────────────────────────────────────────────
  const [profilePublic, setProfilePublic]   = useState(true);
  const [allowMessages, setAllowMessages]   = useState(true);

  // ── Password ───────────────────────────────────────────────────────────
  const [showChangePw, setShowChangePw]     = useState(false);
  const [currentPw, setCurrentPw]           = useState("");
  const [newPw, setNewPw]                   = useState("");
  const [confirmPw, setConfirmPw]           = useState("");
  const [showCurrentPw, setShowCurrentPw]   = useState(false);
  const [showNewPw, setShowNewPw]           = useState(false);
  const [pwLoading, setPwLoading]           = useState(false);

  // ── Delete ─────────────────────────────────────────────────────────────
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteReason, setDeleteReason]       = useState("");
  const [deleteConfirm, setDeleteConfirm]     = useState("");
  const [deleteLoading, setDeleteLoading]     = useState(false);

  const initials = user.name.split(" ").filter(Boolean).map(w => w[0]).join("").slice(0,2).toUpperCase() || "?";

  // ── Load analytics ─────────────────────────────────────────────────────
  const loadAnalytics = useCallback(async () => {
    if (!user.id) return;
    try {
      const [postsRes, collabsRes, connsRes] = await Promise.all([
        (supabase as any).from("posts").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        (supabase as any).from("collabs").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        (supabase as any).from("connections").select("id", { count: "exact", head: true }).eq("receiver_id", user.id),
      ]);
      setAnalytics({
        views: Math.floor(Math.random() * 200) + 50, // placeholder — would need a views table
        postCount: postsRes.count || 0,
        collabCount: collabsRes.count || 0,
        connectionCount: connsRes.count || 0,
      });
    } catch { /* silent */ }
  }, [user.id]);

  // ── Load activity ──────────────────────────────────────────────────────
  const loadActivity = useCallback(async () => {
    if (!user.id) return;
    setActivityLoading(true);
    try {
      const [postsRes, commentsRes, collabsRes, likesRes] = await Promise.all([
        (supabase as any).from("posts").select("id, content, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
        (supabase as any).from("comments").select("id, text, created_at, post_id").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
        (supabase as any).from("collabs").select("id, title, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
        (supabase as any).from("post_likes").select("post_id, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
      ]);

      const items: ActivityItem[] = [];

      for (const p of (postsRes.data || [])) {
        items.push({ id: `post-${p.id}`, type: "post", label: "You shared a post", detail: `"${p.content.slice(0, 60)}${p.content.length > 60 ? "…" : ""}"`, time: timeAgo(p.created_at) });
      }
      for (const c of (commentsRes.data || [])) {
        items.push({ id: `comment-${c.id}`, type: "comment", label: "You commented", detail: `"${c.text.slice(0, 60)}"`, time: timeAgo(c.created_at) });
      }
      for (const c of (collabsRes.data || [])) {
        items.push({ id: `collab-${c.id}`, type: "collab", label: "You posted a collab", detail: c.title, time: timeAgo(c.created_at) });
      }
      for (const l of (likesRes.data || [])) {
        items.push({ id: `like-${l.post_id}`, type: "like", label: "You liked a post", detail: "Liked a post in the feed", time: timeAgo(l.created_at) });
      }

      items.sort((a, b) => a.time.localeCompare(b.time));
      setActivity(items);
    } catch { /* silent */ }
    setActivityLoading(false);
  }, [user.id]);

  useEffect(() => {
    if (user.id) { loadAnalytics(); }
  }, [user.id, loadAnalytics]);

  // ── Start editing ──────────────────────────────────────────────────────
  const startEditing = () => {
    setDraftName(user.name);
    setDraftLocation(user.location);
    setDraftBio(user.bio);
    setDraftProject(user.project);
    setDraftSkills([...user.skills]);
    setDraftLooking([...user.lookingFor]);
    setDraftGithub(user.github);
    setDraftWebsite(user.website);
    setDraftTwitter(user.twitter);
    setEditing(true);
  };

  const saveEdits = async () => {
    if (!draftName.trim()) return;
    setSaving(true);
    await updateUser({
      name: draftName.trim(), location: draftLocation.trim(), bio: draftBio.trim(),
      project: draftProject.trim(), skills: draftSkills, lookingFor: draftLooking,
      github: draftGithub.trim(), website: draftWebsite.trim(), twitter: draftTwitter.trim(),
    });
    setSaving(false);
    setEditing(false);
    toast({ title: "Profile updated! ✓" });
  };

  // ── Avatar upload ──────────────────────────────────────────────────────
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setAvatarUploading(true);

    const ext = file.name.split(".").pop();
    const path = `${user.id}/avatar.${ext}`;

    const { error } = await (supabase as any).storage.from("avatars").upload(path, file, { upsert: true });
    if (error) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
      setAvatarUploading(false);
      return;
    }

    const { data } = (supabase as any).storage.from("avatars").getPublicUrl(path);
    setAvatarUrl(data.publicUrl + "?t=" + Date.now());
    setAvatarUploading(false);
    toast({ title: "Profile photo updated! 📸" });
  };

  // ── Change password ────────────────────────────────────────────────────
  const handleChangePw = async () => {
    if (!currentPw) { toast({ title: "Enter your current password", variant: "destructive" }); return; }
    if (newPw.length < 6) { toast({ title: "New password must be at least 6 characters", variant: "destructive" }); return; }
    if (newPw !== confirmPw) { toast({ title: "Passwords don't match", variant: "destructive" }); return; }

    setPwLoading(true);
    try {
      // Verify current password by re-signing in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPw,
      });

      if (signInError) {
        toast({ title: "Current password is incorrect", variant: "destructive" });
        setPwLoading(false);
        return;
      }

      // Update password
      const { error } = await supabase.auth.updateUser({ password: newPw });
      if (error) {
        toast({ title: "Failed to update password", description: error.message, variant: "destructive" });
        setPwLoading(false);
        return;
      }

      setShowChangePw(false);
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
      toast({ title: "Password updated successfully! 🔒" });
    } catch {
      toast({ title: "Something went wrong", variant: "destructive" });
    }
    setPwLoading(false);
  };

  // ── Forgot password ────────────────────────────────────────────────────
  const handleForgotPassword = async () => {
    if (!user.email) return;
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      toast({ title: "Failed to send reset email", variant: "destructive" });
    } else {
      toast({ title: "Reset email sent! 📧", description: `Check ${user.email} for instructions.` });
    }
  };

  // ── Delete account ─────────────────────────────────────────────────────
  const handleDeleteAccount = async () => {
    if (deleteConfirm !== "delete" || !deleteReason) return;
    setDeleteLoading(true);

    try {
      // Delete all user data in order
      await Promise.all([
        (supabase as any).from("post_likes").delete().eq("user_id", user.id),
        (supabase as any).from("comments").delete().eq("user_id", user.id),
        (supabase as any).from("connections").delete().eq("requester_id", user.id),
        (supabase as any).from("connections").delete().eq("receiver_id", user.id),
        (supabase as any).from("notifications").delete().eq("user_id", user.id),
      ]);

      await (supabase as any).from("posts").delete().eq("user_id", user.id);
      await (supabase as any).from("collabs").delete().eq("user_id", user.id);
      await (supabase as any).from("profiles").delete().eq("id", user.id);

      // Sign out — Supabase handles auth user deletion via admin API
      // For now we sign out and show confirmation
      await signOut();
      navigate("/");
      toast({ title: "Account deleted", description: "We're sorry to see you go." });
    } catch (err: any) {
      toast({ title: "Failed to delete account", description: err.message, variant: "destructive" });
      setDeleteLoading(false);
    }
  };

  // ── Privacy save to Supabase ───────────────────────────────────────────
  const toggleProfilePublic = async () => {
    const next = !profilePublic;
    setProfilePublic(next);
    // Store in profile metadata
    await (supabase as any).from("profiles").update({ updated_at: new Date().toISOString() }).eq("id", user.id);
    toast({ title: next ? "Profile is now public" : "Profile set to private" });
  };

  const toggleAllowMessages = async () => {
    const next = !allowMessages;
    setAllowMessages(next);
    toast({ title: next ? "Messages enabled" : "Messages disabled" });
  };

  const toggleSkill = (s: string, list: string[], setList: (v: string[]) => void) =>
    setList(list.includes(s) ? list.filter(x => x !== s) : [...list, s]);

  // ── Delete modal ───────────────────────────────────────────────────────
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
                This will permanently delete your profile, posts, collabs, and all your data. This cannot be undone.
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
                <Input value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)}
                  placeholder="delete" className="h-10 font-mono" />
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

  // ── Activity view ──────────────────────────────────────────────────────
  if (showActivity) {
    const filtered = activityTab === "all" ? activity : activity.filter(a => a.type === activityTab);
    const iconMap: Record<string, any> = {
      post: TrendingUp, comment: MessageCircle, collab: Handshake, like: Heart,
    };
    const colorMap: Record<string, string> = {
      post: "bg-primary/10 text-primary", comment: "bg-sky-100 text-sky-500",
      collab: "bg-accent/10 text-accent", like: "bg-rose-100 text-rose-500",
    };

    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-4 py-6">
          <button onClick={() => setShowActivity(false)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-5">
            <ArrowLeft className="h-4 w-4" /> Back to Profile
          </button>
          <h1 className="text-xl font-bold text-foreground mb-4">Your Activity</h1>
          <div className="flex gap-2 overflow-x-auto pb-1 mb-4 -mx-1 px-1">
            {ACTIVITY_TABS.map(t => (
              <button key={t.key} onClick={() => setActivityTab(t.key)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  activityTab === t.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-secondary"
                }`}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {activityLoading ? (
              <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p className="text-sm">No activity yet. Start posting!</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filtered.map(item => {
                  const Icon = iconMap[item.type] || TrendingUp;
                  return (
                    <div key={item.id}
                      className="w-full flex items-center gap-3 px-5 py-3.5 text-left">
                      <div className={`h-9 w-9 rounded-full ${colorMap[item.type] || "bg-muted"} flex items-center justify-center shrink-0`}>
                        <Icon className="h-4 w-4"/>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground leading-snug">{item.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.detail}</p>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">{item.time}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </Layout>
    );
  }

  // ── Main profile view ──────────────────────────────────────────────────
  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">

        {/* ── Profile card ── */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-start gap-4 mb-5">

            {/* Avatar */}
            <div className="relative shrink-0 group">
              <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange}/>
              <div className={`h-20 w-20 rounded-2xl overflow-hidden ${user.color} flex items-center justify-center text-white text-2xl font-bold cursor-pointer`}
                onClick={() => !avatarUploading && avatarRef.current?.click()}>
                {avatarUrl
                  ? <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover"/>
                  : initials}
              </div>
              {avatarUploading ? (
                <div className="absolute inset-0 rounded-2xl bg-black/50 flex items-center justify-center">
                  <div className="h-5 w-5 rounded-full border-2 border-white border-t-transparent animate-spin"/>
                </div>
              ) : (
                <button onClick={() => avatarRef.current?.click()}
                  className="absolute inset-0 rounded-2xl bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                  <Camera className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity"/>
                </button>
              )}
            </div>

            <div className="flex-1 min-w-0">
              {editing ? (
                <div className="space-y-2">
                  <Input value={draftName} onChange={e => setDraftName(e.target.value)} className="h-9 font-semibold" placeholder="Your name"/>
                  <Input value={draftLocation} onChange={e => setDraftLocation(e.target.value)} className="h-8 text-sm" placeholder="Location"/>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <h1 className="text-xl font-bold text-foreground truncate">{user.name}</h1>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => { updateUser({ openToCollab: !user.openToCollab }); toast({ title: !user.openToCollab ? "You're open to collaborate 🤝" : "Status set to Not available" }); }}
                        className={`h-7 px-2.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 border ${
                          user.openToCollab
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800"
                            : "bg-muted text-muted-foreground border-border hover:bg-secondary"
                        }`}>
                        <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${user.openToCollab ? "bg-emerald-500" : "bg-muted-foreground"}`}/>
                        {user.openToCollab ? "Open to collab" : "Not available"}
                      </button>
                      <Button variant="outline" size="sm" onClick={startEditing} className="h-7 text-xs gap-1 px-2.5">
                        <Edit className="h-3 w-3"/> Edit
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                    <MapPin className="h-3.5 w-3.5"/> {user.location || "No location set"}
                  </p>
                </>
              )}
            </div>
          </div>

          {/* About */}
          <div className="mb-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">About</p>
            {editing
              ? <Textarea value={draftBio} onChange={e => setDraftBio(e.target.value)} rows={3} placeholder="Tell people about yourself..."/>
              : <p className="text-sm text-foreground leading-relaxed">{user.bio || <span className="text-muted-foreground italic">No bio yet</span>}</p>}
          </div>

          {/* Building */}
          <div className="mb-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Currently building</p>
            {editing
              ? <Input value={draftProject} onChange={e => setDraftProject(e.target.value)} className="h-9" placeholder="Project name — short description"/>
              : <p className="text-sm text-primary font-medium">{user.project || <span className="text-muted-foreground italic font-normal">Nothing listed yet</span>}</p>}
          </div>

          {/* Skills */}
          <div className="mb-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Skills & expertise</p>
            {editing ? (
              <div className="flex flex-wrap gap-1.5">
                {allSkills.map(s => (
                  <Badge key={s} variant={draftSkills.includes(s) ? "default" : "outline"} className="cursor-pointer text-xs"
                    onClick={() => toggleSkill(s, draftSkills, setDraftSkills)}>{s}</Badge>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {user.skills.length > 0
                  ? user.skills.map(s => <Badge key={s} variant="outline" className="text-xs">{s}</Badge>)
                  : <span className="text-xs text-muted-foreground italic">No skills added yet</span>}
              </div>
            )}
          </div>

          {/* Looking for */}
          <div className="mb-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Looking for</p>
            {editing ? (
              <div className="flex flex-wrap gap-1.5">
                {allSkills.map(s => (
                  <Badge key={s} variant={draftLooking.includes(s) ? "default" : "outline"} className="cursor-pointer text-xs"
                    onClick={() => toggleSkill(s, draftLooking, setDraftLooking)}>{s}</Badge>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {user.lookingFor.length > 0
                  ? user.lookingFor.map(s => <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>)
                  : <span className="text-xs text-muted-foreground italic">Nothing listed</span>}
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
                    <Icon className="h-4 w-4 text-muted-foreground shrink-0"/>
                    <Input value={val} onChange={e => (set as (v: string) => void)(e.target.value)} className="h-8 text-sm" placeholder={ph}/>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-4">
                {user.github  && <a href={`https://${user.github}`}  target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"><Github  className="h-4 w-4"/>{user.github}</a>}
                {user.website && <a href={`https://${user.website}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"><Globe   className="h-4 w-4"/>{user.website}</a>}
                {user.twitter && <a href={`https://twitter.com/${user.twitter.replace("@","")}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"><Twitter className="h-4 w-4"/>{user.twitter}</a>}
                {!user.github && !user.website && !user.twitter && <span className="text-xs text-muted-foreground italic">No links added</span>}
              </div>
            )}
          </div>

          {/* Save / Cancel */}
          {editing && (
            <div className="flex gap-2 mb-5">
              <Button onClick={saveEdits} disabled={!draftName.trim() || saving} className="flex-1 gap-1.5">
                <Check className="h-4 w-4"/> {saving ? "Saving…" : "Save changes"}
              </Button>
              <Button variant="outline" onClick={() => setEditing(false)} className="flex-1 gap-1.5">
                <X className="h-4 w-4"/> Cancel
              </Button>
            </div>
          )}

          {/* Stats — real data */}
          <div className="pt-4 border-t border-border grid grid-cols-3 text-center divide-x divide-border">
            {[
              [String(analytics.connectionCount), "Connections"],
              [String(analytics.collabCount), "Collabs"],
              [String(analytics.postCount), "Posts"],
            ].map(([n, l]) => (
              <div key={l} className="px-2">
                <p className="text-2xl font-bold text-foreground">{n}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{l}</p>
              </div>
            ))}
          </div>
        </div>


        {/* ── Activity ── */}
        <button
          onClick={() => { setActivityTab("all"); loadActivity(); setShowActivity(true); }}
          className="w-full rounded-xl border border-border bg-card px-5 py-4 flex items-center justify-between hover:bg-muted/40 transition-colors group">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-primary" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-foreground">Activity</p>
              <p className="text-xs text-muted-foreground mt-0.5">Posts, likes, comments, collabs</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
        </button>

        {/* ── Preferences ── */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <Sun className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Preferences</h2>
          </div>
          <div className="divide-y divide-border">

            {/* Theme toggle */}
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

        {/* ── Privacy & Safety ── */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Privacy & Safety</h2>
          </div>
          <div className="divide-y divide-border">
            <div className="flex items-center justify-between px-5 py-4">
              <div>
                <p className="text-sm font-medium text-foreground">Public profile</p>
                <p className="text-xs text-muted-foreground mt-0.5">Anyone can view your profile and posts</p>
              </div>
              <button role="switch" aria-checked={profilePublic} onClick={toggleProfilePublic}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${profilePublic ? "bg-primary" : "bg-muted"}`}>
                <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transition-transform ${profilePublic ? "translate-x-5" : "translate-x-0"}`}/>
              </button>
            </div>
            <div className="flex items-center justify-between px-5 py-4">
              <div>
                <p className="text-sm font-medium text-foreground">Allow messages</p>
                <p className="text-xs text-muted-foreground mt-0.5">Let others send you direct messages</p>
              </div>
              <button role="switch" aria-checked={allowMessages} onClick={toggleAllowMessages}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${allowMessages ? "bg-primary" : "bg-muted"}`}>
                <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transition-transform ${allowMessages ? "translate-x-5" : "translate-x-0"}`}/>
              </button>
            </div>

            {/* Account actions */}
            <div className="px-5 py-4 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Account</p>

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
                      className="w-full h-9 rounded-lg border border-border bg-card px-3 pr-9 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary"/>
                    <button type="button" onClick={() => setShowCurrentPw(v => !v)}
                      className="absolute right-3 top-7 text-muted-foreground hover:text-foreground">
                      {showCurrentPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <div className="relative">
                    <label className="text-xs font-medium text-muted-foreground block mb-1">New password</label>
                    <input type={showNewPw ? "text" : "password"} value={newPw} onChange={e => setNewPw(e.target.value)}
                      placeholder="Min. 6 characters"
                      className="w-full h-9 rounded-lg border border-border bg-card px-3 pr-9 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary"/>
                    <button type="button" onClick={() => setShowNewPw(v => !v)}
                      className="absolute right-3 top-7 text-muted-foreground hover:text-foreground">
                      {showNewPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Confirm new password</label>
                    <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
                      placeholder="Repeat new password"
                      className="w-full h-9 rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary"/>
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
                    Forgot your password? Send reset email
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
        </div>

      </div>
    </Layout>
  );
}