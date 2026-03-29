import { useParams, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, MapPin, Github, Globe, Twitter, MessageCircle, UserPlus, Heart, Handshake, Check, UserX, ShieldOff, X } from "lucide-react";
import Layout from "@/components/Layout";
import { toast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { useUser } from "@/context/UserContext";
import { supabase } from "@/lib/supabase";
import { createNotification } from "@/lib/notifications";


type ProfileData = {
  id: string;
  name: string;
  avatar: string;
  avatarUrl?: string;
  color: string;
  location: string;
  bio: string;
  project: string;
  skills: string[];
  lookingFor: string[];
  github: string;
  website: string;
  twitter: string;
  openToCollab: boolean;
};

type UserPost = {
  id: string;
  tag: string;
  content: string;
  time: string;
  likes: number;
};

type UserCollab = {
  id: string;
  title: string;
  looking: string;
  description: string;
  skills: string[];
};

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
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
}

function ProfileSkeleton() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-6 animate-pulse">
        <div className="flex items-start gap-4 mb-5">
          <div className="h-20 w-20 rounded-2xl bg-muted shrink-0" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="h-4 bg-muted rounded w-36" />
            <div className="h-3 bg-muted rounded w-24" />
            <div className="flex gap-2 mt-3">
              <div className="h-8 bg-muted rounded-lg w-24" />
              <div className="h-8 bg-muted rounded-lg w-24" />
            </div>
          </div>
        </div>
        <div className="space-y-2 mb-4">
          <div className="h-3 bg-muted rounded w-full" />
          <div className="h-3 bg-muted rounded w-4/5" />
        </div>
        <div className="flex gap-2">
          <div className="h-6 bg-muted rounded-full w-16" />
          <div className="h-6 bg-muted rounded-full w-20" />
          <div className="h-6 bg-muted rounded-full w-14" />
        </div>
      </div>
    </div>
  );
}

export default function UserProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useUser();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [posts, setPosts] = useState<UserPost[]>([]);
  const [collabs, setCollabs] = useState<UserCollab[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);
  const [connected, setConnected] = useState(false);
  const [pending, setPending] = useState(false);
  const [connectionLoading, setConnectionLoading] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [isBlockedByOwner, setIsBlockedByOwner] = useState(false);
  const [avatarLightbox, setAvatarLightbox] = useState(false);

  useEffect(() => {
    if (!id) { setNotFound(true); setLoading(false); return; }

    // If viewing own profile, redirect to /profile
    if (id === user.id) { navigate("/profile", { replace: true }); return; }

    const load = async () => {
      setLoading(true);
      setNotFound(false);

      try {
        // ── Step 1: fetch profile (required) ──────────────────────────────
        const profileRes = await (supabase as any)
          .from("profiles").select("*").eq("id", id).single();

        if (profileRes.error || !profileRes.data) { setNotFound(true); return; }

        const p = profileRes.data;
        if (p.deleted_at) { setIsDeleted(true); return; }

        setProfile({
          id: p.id,
          name: p.name || "Unknown",
          avatar: p.avatar || "?",
          avatarUrl: p.avatar_url || undefined,
          color: p.color || "bg-primary",
          location: p.location || "",
          bio: p.bio || "",
          project: p.project || "",
          skills: p.skills || [],
          lookingFor: p.looking_for || [],
          github: p.github || "",
          website: p.website || "",
          twitter: p.twitter || "",
          openToCollab: p.open_to_collab ?? true,
        });

        // ── Step 2: check block status (optional — never kills profile load)
        let ownerHasBlockedMe = false;
        let iHaveBlockedOwner = false;
        try {
          const [blockedByOwnerRes, iBlockedRes] = await Promise.all([
            (supabase as any).from("blocks").select("id").eq("blocker_id", id).eq("blocked_id", user.id).maybeSingle(),
            (supabase as any).from("blocks").select("id").eq("blocker_id", user.id).eq("blocked_id", id).maybeSingle(),
          ]);
          ownerHasBlockedMe = !!blockedByOwnerRes.data;
          iHaveBlockedOwner = !!iBlockedRes.data;
        } catch { /* blocks table may not exist — treat as no block */ }

        setIsBlockedByOwner(ownerHasBlockedMe);
        setIsBlocked(iHaveBlockedOwner);

        // ── Step 3: blocked user sees no content — stop here ─────────────
        if (ownerHasBlockedMe) return;

        // ── Step 4: load posts / collabs / connection state ───────────────
        const [postsRes, collabsRes, [connSentRes, connRecvRes]] = await Promise.all([
          (supabase as any).from("posts").select("id, tag, content, created_at, likes").eq("user_id", id).order("created_at", { ascending: false }).limit(20),
          (supabase as any).from("collabs").select("id, title, looking, description, skills").eq("user_id", id).order("created_at", { ascending: false }).limit(10),
          Promise.all([
            (supabase as any).from("connections").select("id, status").eq("requester_id", user.id).eq("receiver_id", id).maybeSingle(),
            (supabase as any).from("connections").select("id, status").eq("requester_id", id).eq("receiver_id", user.id).maybeSingle(),
          ]),
        ]);

        setPosts((postsRes.data || []).map((post: any) => ({
          id: post.id, tag: post.tag, content: post.content,
          time: timeAgo(post.created_at), likes: post.likes || 0,
        })));

        setCollabs((collabsRes.data || []).map((c: any) => ({
          id: c.id, title: c.title, looking: c.looking,
          description: c.description, skills: c.skills || [],
        })));

        const connSent = connSentRes.data;
        const connRecv = connRecvRes.data;
        const isAccepted = (connSent?.status === "accepted") || (connRecv?.status === "accepted");
        const isPending  = (connSent?.status === "pending")  || (connRecv?.status === "pending");
        setConnected(isAccepted);
        setPending(isPending && !isAccepted);
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id, user.id, navigate]);

  const handleBlock = async () => {
    if (!profile) return;
    try {
      if (isBlocked) {
        await (supabase as any).from("blocks").delete().eq("blocker_id", user.id).eq("blocked_id", profile.id);
        setIsBlocked(false);
        toast({ title: "User unblocked" });
      } else {
        await (supabase as any).from("blocks").upsert({ blocker_id: user.id, blocked_id: profile.id });
        setIsBlocked(true);
        // Clear connection so they no longer appear in connections list
        setConnected(false);
        setPending(false);
        toast({ title: "User blocked" });
      }
    } catch { /* ignore */ }
  };

  const handleConnect = async () => {
    if (!profile || connectionLoading) return;
    setConnectionLoading(true);

    if (connected) {
      await (supabase as any).from("connections").delete()
        .eq("requester_id", user.id).eq("receiver_id", profile.id);
      setConnected(false);
      toast({ title: "Connection removed" });
    } else {
      await (supabase as any).from("connections")
        .insert({ requester_id: user.id, receiver_id: profile.id, status: "pending" });
      setConnected(true);
      toast({ title: "Connection request sent! 🤝" });
      createNotification({
        userId: profile.id,
        type: "match",
        text: `${user.name} sent you a connection request`,
        subtext: user.bio?.slice(0, 60) || undefined,
        action: `profile:${user.id}`,
        actorId: user.id,
      });
    }

    setConnectionLoading(false);
  };

  if (loading) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          <div className="h-5 w-12 bg-muted rounded animate-pulse" />
          <ProfileSkeleton />
        </div>
      </Layout>
    );
  }

  if (isDeleted) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-4 py-12 text-center text-muted-foreground">
          <UserX className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium text-foreground mb-1">Account Deleted</p>
          <p className="text-xs mb-4">This account has been deleted and is no longer available.</p>
          <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Go back
          </Button>
        </div>
      </Layout>
    );
  }

  if (notFound || !profile) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-4 py-12 text-center text-muted-foreground">
          <p className="text-sm font-medium mb-3">Profile not found</p>
          <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Go back
          </Button>
        </div>
      </Layout>
    );
  }

  if (isBlockedByOwner) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          <button onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>

          {/* Anonymized profile card — looks like a real profile but no real data */}
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-start gap-4 mb-5">
              {/* Blank avatar — no initials, no color, no real photo */}
              <div className="h-20 w-20 rounded-2xl bg-muted flex items-center justify-center shrink-0">
                <UserX className="h-8 w-8 text-muted-foreground opacity-30" />
              </div>
              <div className="flex-1 min-w-0 pt-1">
                <h1 className="text-xl font-bold text-foreground">Prolifier User</h1>
                <p className="text-xs text-muted-foreground mt-1">@prolifier_user</p>
              </div>
            </div>

            {/* Content unavailable notice */}
            <div className="border border-dashed border-border rounded-xl py-10 text-center">
              <UserX className="h-8 w-8 mx-auto mb-3 text-muted-foreground opacity-30" />
              <p className="text-sm font-medium text-foreground mb-1">This content is unavailable.</p>
              <p className="text-xs text-muted-foreground">You can't view this profile right now.</p>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">

        <button onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        {/* Blocked-by-me notice */}
        {isBlocked && (
          <div className="rounded-xl border border-border bg-muted/50 px-4 py-3 flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">You have blocked this user.</p>
            <button onClick={handleBlock}
              className="text-xs font-medium text-primary hover:underline shrink-0">
              Unblock
            </button>
          </div>
        )}

        {/* Profile card */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-start gap-4 mb-5">
            <button
              onClick={() => setAvatarLightbox(true)}
              className={`h-20 w-20 rounded-2xl ${profile.avatarUrl ? "" : profile.color} flex items-center justify-center text-white text-2xl font-bold shrink-0 overflow-hidden cursor-pointer hover:opacity-90 transition-opacity`}>
              {profile.avatarUrl
                ? <img src={profile.avatarUrl} alt={profile.avatar} className="w-full h-full object-cover" />
                : profile.avatar}
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-foreground">{profile.name}</h1>
              {profile.location && (
                <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                  <MapPin className="h-3.5 w-3.5" /> {profile.location}
                </p>
              )}
              {profile.openToCollab && (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium mt-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />
                  Open to collab
                </span>
              )}
              <div className="flex gap-2 mt-3 flex-wrap">
                {!isBlocked && (
                  <>
                    <Button size="sm" variant={connected ? "outline" : pending ? "secondary" : "default"}
                      className="gap-1.5 h-8 text-xs" onClick={connected ? handleConnect : pending ? undefined : handleConnect}
                      disabled={connectionLoading || pending}>
                      {connected ? <><Check className="h-3.5 w-3.5" /> Connected</> : pending ? "Request Sent" : <><UserPlus className="h-3.5 w-3.5" /> Connect</>}
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs"
                      onClick={() => { navigate(`/messages?with=${profile.id}`); }}>
                      <MessageCircle className="h-3.5 w-3.5" /> Message
                    </Button>
                  </>
                )}
                <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs text-muted-foreground"
                  onClick={handleBlock}>
                  {isBlocked
                    ? <><ShieldOff className="h-3.5 w-3.5" /> Unblock</>
                    : <><UserX className="h-3.5 w-3.5" /> Block</>}
                </Button>
              </div>
            </div>
          </div>

          {profile.bio && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">About</p>
              <p className="text-sm text-foreground leading-relaxed">{profile.bio}</p>
            </div>
          )}

          {profile.project && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Currently building</p>
              <p className="text-sm text-primary font-medium">{profile.project}</p>
            </div>
          )}

          {profile.skills.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Skills & expertise</p>
              <div className="flex flex-wrap gap-1.5">
                {profile.skills.map(s => <Badge key={s} variant="outline" className="text-xs">{s}</Badge>)}
              </div>
            </div>
          )}

          {profile.lookingFor.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Looking for</p>
              <div className="flex flex-wrap gap-1.5">
                {profile.lookingFor.map(s => <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>)}
              </div>
            </div>
          )}

          {(profile.github || profile.website || profile.twitter) && (
            <div className="mb-5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Links</p>
              <div className="flex flex-wrap gap-4">
                {profile.github && <a href={`https://${profile.github}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"><Github className="h-4 w-4"/>{profile.github}</a>}
                {profile.website && <a href={`https://${profile.website}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"><Globe className="h-4 w-4"/>{profile.website}</a>}
                {profile.twitter && <a href={`https://twitter.com/${profile.twitter.replace("@","")}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"><Twitter className="h-4 w-4"/>{profile.twitter}</a>}
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-border grid grid-cols-2 text-center divide-x divide-border">
            {[[String(posts.length), "Posts"], [String(collabs.length), "Collabs"]].map(([n, l]) => (
              <div key={l} className="px-2">
                <p className="text-2xl font-bold text-foreground">{n}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{l}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Posts & Collabs */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <Tabs defaultValue="posts">
            <TabsList className="w-full rounded-none border-b border-border bg-transparent h-11">
              <TabsTrigger value="posts" className="flex-1 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none">
                Posts ({posts.length})
              </TabsTrigger>
              <TabsTrigger value="collabs" className="flex-1 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none">
                Collabs ({collabs.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="posts" className="p-0">
              {posts.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm">No posts yet</div>
              ) : (
                <div className="divide-y divide-border">
                  {posts.map(post => (
                    <div key={post.id} className="px-5 py-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TAG_COLORS[post.tag] ?? "bg-muted text-muted-foreground"}`}>
                          {post.tag}
                        </span>
                        <span className="text-xs text-muted-foreground">{post.time}</span>
                      </div>
                      <p className="text-sm text-foreground leading-relaxed mb-3">{post.content}</p>
                      <div className="flex items-center gap-3 text-muted-foreground">
                        <span className="flex items-center gap-1.5 text-xs">
                          <Heart className="h-3.5 w-3.5" /> {post.likes}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="collabs" className="p-0">
              {collabs.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm">No collabs yet</div>
              ) : (
                <div className="divide-y divide-border">
                  {collabs.map(collab => (
                    <div key={collab.id} className="px-5 py-4">
                      <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
                        <button
                          className="text-sm font-semibold text-foreground hover:underline text-left"
                          onClick={() => navigate(`/feed?tab=collabs&collab=${collab.id}`)}
                        >{collab.title}</button>
                        <Badge variant="outline" className="text-xs shrink-0">Looking for: {collab.looking}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed mb-3">{collab.description}</p>
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {collab.skills.map(s => <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>)}
                      </div>
                      <Button size="sm" variant="default" className="gap-1.5 h-7 text-xs"
                        onClick={() => {
                          navigate(`/messages?with=${profile.id}`);
                          createNotification({
                            userId: profile.id,
                            type: "collab",
                            text: `${user.name} is interested in your collab "${collab.title}"`,
                            subtext: `Looking for: ${collab.looking}`,
                            action: "messages",
                            actorId: user.id,
                          });
                        }}>
                        <Handshake className="h-3.5 w-3.5" /> Express Interest
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

      </div>

      {avatarLightbox && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm"
          onClick={() => setAvatarLightbox(false)}>
          <button className="absolute top-4 right-4 h-9 w-9 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
            onClick={() => setAvatarLightbox(false)}>
            <X className="h-5 w-5" />
          </button>
          {profile.avatarUrl ? (
            <img src={profile.avatarUrl} alt={profile.name}
              className="max-w-[90vw] max-h-[90vh] rounded-2xl object-contain"
              onClick={e => e.stopPropagation()} />
          ) : (
            <div className={`h-48 w-48 rounded-2xl ${profile.color} flex items-center justify-center text-white text-6xl font-bold`}
              onClick={e => e.stopPropagation()}>
              {profile.avatar}
            </div>
          )}
        </div>
      )}
    </Layout>
  );
}