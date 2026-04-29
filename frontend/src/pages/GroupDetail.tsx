import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Users, Lock, Globe, MessageCircle, Calendar, Crown, Image, Video, Paperclip, Mic } from "lucide-react";
import Layout from "@/components/Layout";
import { useUser } from "@/context/UserContext";
import { toast } from "@/hooks/use-toast";
import { getGroupById, joinGroup, leaveGroup, requestToJoin, cancelJoinRequest } from "@/api/groups";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function msgPreview(msg: any): string {
  if (msg.media_type === "image") return "📷 Image";
  if (msg.media_type === "video") return "🎥 Video";
  if (msg.media_type === "audio") return "🎤 Voice message";
  if (msg.media_type === "file") return "📎 File";
  return msg.text || "";
}

function MsgPreviewIcon({ type }: { type: string | null }) {
  if (type === "image") return <Image className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
  if (type === "video") return <Video className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
  if (type === "audio") return <Mic className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
  if (type === "file") return <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
  return null;
}

export default function GroupDetail() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const { user } = useUser();

  const [group, setGroup] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!groupId) return;
    setLoading(true);
    getGroupById(groupId)
      .then(res => {
        if (res) setGroup(res);
        else toast({ title: "Community not found", variant: "destructive" });
      })
      .catch(() => toast({ title: "Failed to load community", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [groupId]);

  const handleJoin = async () => {
    if (!group || joining) return;
    setJoining(true);
    try {
      if (group.joinStatus === "joined") {
        await leaveGroup(group.id);
        setGroup((g: any) => ({ ...g, joinStatus: "none", isJoined: false, member_count: Math.max(0, g.member_count - 1) }));
        toast({ title: "Left community" });
      } else if (group.joinStatus === "requested") {
        await cancelJoinRequest(group.id);
        setGroup((g: any) => ({ ...g, joinStatus: "none" }));
        toast({ title: "Request cancelled" });
      } else if (group.visibility === "private") {
        await requestToJoin(group.id);
        setGroup((g: any) => ({ ...g, joinStatus: "requested" }));
        toast({ title: "Join request sent" });
      } else {
        await joinGroup(group.id);
        setGroup((g: any) => ({ ...g, joinStatus: "joined", isJoined: true, member_count: g.member_count + 1 }));
        toast({ title: `Joined ${group.name}!` });
      }
    } catch (err: any) {
      toast({ title: err?.message || "Action failed", variant: "destructive" });
    } finally {
      setJoining(false);
    }
  };

  const openChat = () => {
    navigate(`/groups/${group.id}`);
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!group) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto px-4 py-12 text-center text-muted-foreground">
          <p className="font-medium">Community not found.</p>
          <button onClick={() => navigate("/groups")} className="mt-3 text-sm text-primary hover:underline">
            Back to Communities
          </button>
        </div>
      </Layout>
    );
  }

  const isOwner = group.joinStatus === "owner";
  const isJoined = group.joinStatus === "joined" || isOwner;
  const isRequested = group.joinStatus === "requested";

  return (
    <Layout>
      <div className="max-w-xl mx-auto px-4 py-6">
        {/* Back */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-5">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        {/* Cover strip */}
        <div className="h-24 w-full rounded-2xl bg-gradient-to-r from-primary/40 via-accent/30 to-primary/20 mb-0 overflow-hidden">
          {group.image_url && (
            <img src={group.image_url} alt={group.name} className="w-full h-full object-cover opacity-30" />
          )}
        </div>

        {/* Avatar + header */}
        <div className="-mt-8 px-4 flex items-end justify-between mb-4">
          <div className="h-16 w-16 rounded-2xl bg-card border-2 border-background shadow-md flex items-center justify-center text-3xl overflow-hidden shrink-0">
            {group.image_url
              ? <img src={group.image_url} alt={group.name} className="w-full h-full object-cover" />
              : group.emoji}
          </div>
          <div className="flex gap-2 pb-1">
            {isJoined && (
              <button
                onClick={openChat}
                className="h-9 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-1.5">
                <MessageCircle className="h-4 w-4" /> Open Chat
              </button>
            )}
            {!isOwner && (
              <button
                onClick={handleJoin}
                disabled={joining}
                className={`h-9 px-4 rounded-xl text-sm font-semibold transition-all flex items-center gap-1.5 ${
                  isJoined
                    ? "border border-border text-foreground hover:bg-muted"
                    : isRequested
                    ? "border border-border text-muted-foreground hover:bg-muted"
                    : "bg-primary text-primary-foreground hover:opacity-90"
                } disabled:opacity-60`}>
                {joining
                  ? <div className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                  : null}
                {isJoined ? "Leave" : isRequested ? "Requested" : group.visibility === "private" ? "Request to Join" : "Join"}
              </button>
            )}
            {isOwner && (
              <button
                onClick={openChat}
                className="h-9 px-4 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors flex items-center gap-1.5">
                Manage
              </button>
            )}
          </div>
        </div>

        {/* Name + badges */}
        <div className="mb-4">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h1 className="text-xl font-bold text-foreground">{group.name}</h1>
            {isOwner && (
              <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 dark:bg-amber-950 dark:text-amber-400 px-1.5 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
                Owner
              </span>
            )}
            {isJoined && !isOwner && (
              <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-400 px-1.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                Joined
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              {group.member_count.toLocaleString()} member{group.member_count !== 1 ? "s" : ""}
            </span>
            <span className="flex items-center gap-1">
              {group.visibility === "private"
                ? <><Lock className="h-3.5 w-3.5" /> Private</>
                : <><Globe className="h-3.5 w-3.5" /> Public</>}
            </span>
            {group.topic && (
              <span className="px-2 py-0.5 rounded-full bg-muted border border-border font-medium">
                {group.topic}
              </span>
            )}
          </div>
        </div>

        {/* Bio */}
        {(group.bio || group.description) && (
          <div className="bg-muted/50 rounded-2xl p-4 mb-4">
            <p className="text-sm font-semibold text-foreground mb-1">About</p>
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {group.bio || group.description}
            </p>
          </div>
        )}

        {/* Meta info */}
        <div className="bg-card border border-border rounded-2xl divide-y divide-border mb-4">
          {group.owner && (
            <div className="flex items-center gap-3 px-4 py-3">
              <Crown className="h-4 w-4 text-amber-500 shrink-0" />
              <div className="flex items-center gap-2 min-w-0">
                <div className={`h-7 w-7 rounded-full ${group.owner.avatar_url ? "" : group.owner.color || "bg-primary"} flex items-center justify-center text-white text-xs font-semibold overflow-hidden shrink-0`}>
                  {group.owner.avatar_url
                    ? <img src={group.owner.avatar_url} alt={group.owner.name} className="w-full h-full object-cover" />
                    : group.owner.avatar}
                </div>
                <span className="text-sm text-foreground font-medium truncate">{group.owner.name}</span>
                {group.owner.username && (
                  <span className="text-xs text-muted-foreground truncate">@{group.owner.username}</span>
                )}
              </div>
              <span className="ml-auto text-xs text-muted-foreground shrink-0">Admin</span>
            </div>
          )}
          {group.created_at && (
            <div className="flex items-center gap-3 px-4 py-3">
              <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground">Created {fmtDate(group.created_at)}</span>
            </div>
          )}
          <div className="flex items-center gap-3 px-4 py-3">
            <Users className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm text-muted-foreground">
              {group.member_count.toLocaleString()} / 250 members
            </span>
          </div>
        </div>

        {/* Recent activity */}
        {group.recentMessages?.length > 0 && (
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">Recent Activity</p>
              {isJoined && (
                <button onClick={openChat} className="text-xs text-primary hover:underline">
                  View all →
                </button>
              )}
            </div>
            <div className="divide-y divide-border">
              {group.recentMessages.map((msg: any) => (
                <div key={msg.id} className="flex items-start gap-3 px-4 py-3">
                  <div className={`h-7 w-7 rounded-full ${msg.profiles?.avatar_url ? "" : msg.profiles?.color || "bg-primary"} flex items-center justify-center text-white text-xs font-semibold overflow-hidden shrink-0 mt-0.5`}>
                    {msg.profiles?.avatar_url
                      ? <img src={msg.profiles.avatar_url} alt={msg.profiles?.name} className="w-full h-full object-cover" />
                      : (msg.profiles?.name?.[0] || "?").toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-semibold text-foreground truncate">{msg.profiles?.name || "Unknown"}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">{fmtTime(msg.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <MsgPreviewIcon type={msg.media_type} />
                      <p className="text-xs text-muted-foreground truncate">{msgPreview(msg)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {!isJoined && (
              <div className="px-4 py-3 bg-muted/30 text-center">
                <p className="text-xs text-muted-foreground">
                  {group.visibility === "private"
                    ? "Join this private community to participate."
                    : "Join to participate in the conversation."}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
