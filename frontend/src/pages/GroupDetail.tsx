import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Users, Lock, Globe, MessageCircle, Calendar, Crown } from "lucide-react";
import Layout from "@/components/Layout";
import { useUser } from "@/context/UserContext";
import { toast } from "@/hooks/use-toast";
import { getGroupById, joinGroup, leaveGroup, requestToJoin, cancelJoinRequest } from "@/api/groups";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
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
        // Navigate directly to inbox after joining
        navigate(`/groups/${group.id}`, { replace: true });
      }
    } catch (err: any) {
      toast({ title: err?.message || "Action failed", variant: "destructive" });
    } finally {
      setJoining(false);
    }
  };

  const openChat = () => navigate(`/groups/${group.id}`);

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
      <div className="max-w-xl mx-auto px-4 py-6 space-y-4">

        {/* Back */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        {/* Header card */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center text-3xl overflow-hidden shrink-0 shadow-sm">
              {group.image_url
                ? <img src={group.image_url} alt={group.name} className="w-full h-full object-cover" />
                : group.emoji}
            </div>

            {/* Name + meta */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-bold text-foreground leading-tight truncate">{group.name}</h1>
                {isOwner && (
                  <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 dark:bg-amber-950 dark:text-amber-400 px-1.5 py-0.5 rounded-full border border-amber-200 dark:border-amber-800 shrink-0">
                    Owner
                  </span>
                )}
                {isJoined && !isOwner && (
                  <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-400 px-1.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800 shrink-0">
                    Joined
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {group.member_count.toLocaleString()} member{group.member_count !== 1 ? "s" : ""}
                </span>
                <span className="flex items-center gap-1">
                  {group.visibility === "private"
                    ? <><Lock className="h-3 w-3" /> Private</>
                    : <><Globe className="h-3 w-3" /> Public</>}
                </span>
                {group.topic && (
                  <span className="px-1.5 py-0.5 rounded-full bg-muted border border-border font-medium">
                    {group.topic}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 mt-4">
            {isJoined && (
              <button
                onClick={openChat}
                className="flex-1 h-9 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5">
                <MessageCircle className="h-4 w-4" /> Open Chat
              </button>
            )}
            {isOwner && (
              <button
                onClick={openChat}
                className="flex-1 h-9 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors flex items-center justify-center gap-1.5">
                Manage
              </button>
            )}
            {!isOwner && (
              <button
                onClick={handleJoin}
                disabled={joining}
                className={`h-9 px-5 rounded-xl text-sm font-semibold transition-all flex items-center gap-1.5 disabled:opacity-60 ${
                  isJoined
                    ? "border border-border text-foreground hover:bg-muted"
                    : isRequested
                    ? "border border-border text-muted-foreground hover:bg-muted"
                    : "bg-primary text-primary-foreground hover:opacity-90"
                }`}>
                {joining && <div className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />}
                {isJoined ? "Leave" : isRequested ? "Requested" : group.visibility === "private" ? "Request to Join" : "Join"}
              </button>
            )}
          </div>
        </div>

        {/* About */}
        {(group.bio || group.description) && (
          <div className="bg-card border border-border rounded-2xl p-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">About</p>
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
              {group.bio || group.description}
            </p>
          </div>
        )}

        {/* Details */}
        <div className="bg-card border border-border rounded-2xl divide-y divide-border">
          {group.owner && (
            <div className="flex items-center gap-3 px-4 py-3">
              <Crown className="h-4 w-4 text-amber-500 shrink-0" />
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div className={`h-7 w-7 rounded-full ${group.owner.avatar_url ? "" : group.owner.color || "bg-primary"} flex items-center justify-center text-white text-xs font-semibold overflow-hidden shrink-0`}>
                  {group.owner.avatar_url
                    ? <img src={group.owner.avatar_url} alt={group.owner.name} className="w-full h-full object-cover" />
                    : (group.owner.name?.[0] || "?").toUpperCase()}
                </div>
                <span className="text-sm text-foreground font-medium truncate">{group.owner.name}</span>
                {group.owner.username && (
                  <span className="text-xs text-muted-foreground truncate">@{group.owner.username}</span>
                )}
              </div>
              <span className="text-xs text-muted-foreground shrink-0">Admin</span>
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

      </div>
    </Layout>
  );
}
