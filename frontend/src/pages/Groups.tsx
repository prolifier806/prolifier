import { useState, useRef, useEffect, useCallback, memo } from "react";
import { useParams } from "react-router-dom";
import { useRealtimeChannel } from "@/hooks/useRealtimeChannel";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Search, Users, ArrowLeft, Send, MessageCircle,
  Lock, Globe, Plus, Settings, X, Check,
  Crown, Image, Video, Paperclip,
  Link2, Copy, LogOut, Edit3, Trash2, UserX, MoreHorizontal,
  ShieldOff, RefreshCw, AtSign, ChevronsDown, UserPlus, Bell,
} from "lucide-react";
import Layout from "@/components/Layout";
import { toast } from "@/hooks/use-toast";
import { useUser } from "@/context/UserContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { createNotification } from "@/api/notifications";
import {
  joinGroup as apiJoinGroup,
  leaveGroup as apiLeaveGroup,
  removeMember as apiRemoveMember,
  banMember as apiBanMember,
  assignRole as apiAssignRole,
  deleteGroup as apiDeleteGroup,
  updateGroup as apiUpdateGroup,
  createGroup as apiCreateGroup,
  sendGroupMessage as apiSendGroupMessage,
  getBannedUsers as apiGetBannedUsers,
  unbanUser as apiUnbanUser,
  requestToJoin as apiRequestToJoin,
  cancelJoinRequest as apiCancelJoinRequest,
  getJoinRequests as apiGetJoinRequests,
  respondJoinRequest as apiRespondJoinRequest,
  addMemberToGroup as apiAddMember,
} from "@/api/groups";
import { uploadPostImage, uploadVideo, uploadFile } from "@/api/uploads";


// ── Types ─────────────────────────────────────────────────────────────────
type MediaType = "image" | "video" | "file";

type GroupMessage = {
  id: string;
  group_id: string;
  user_id: string;
  text: string | null;
  media_url: string | null;
  media_type: string | null;
  created_at: string;
  edited: boolean;
  deleted: boolean;
  unsent: boolean;
  is_system: boolean;
  author_name: string;
  author_color: string;
  author_avatar_url?: string;
};

type JoinRequest = {
  id: string;
  user_id: string;
  status: string;
  created_at: string;
  profile: { name: string; color: string; avatar_url?: string } | null;
};

type GroupMember = {
  id: string;
  name: string;
  color: string;
  avatarUrl?: string;
  role: "owner" | "admin" | "member";
};

type BannedUser = {
  user_id: string;
  profiles: { name: string; color: string; avatar_url?: string } | null;
};

type Group = {
  id: string;
  name: string;
  description: string;
  bio: string;
  emoji: string;
  topic: string;
  visibility: "public" | "private";
  owner_id: string;
  member_count: number;
  created_at: string;
  image_url?: string | null;
};

const TOPICS = ["General", "AI", "Design", "Marketing", "Tech"];

function renderTextWithLinks(text: string, validMentionNames?: string[]) {
  // Build a regex that only matches @MemberName for real member names.
  // Sort longest-first so "John Doe" matches before "John".
  let TOKEN_RE: RegExp;
  if (validMentionNames && validMentionNames.length > 0) {
    const escaped = [...validMentionNames]
      .sort((a, b) => b.length - a.length)
      .map(n => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    TOKEN_RE = new RegExp(`(https?:\\/\\/[^\\s]+|@(?:${escaped.join("|")})(?=[\\s,!?.)]|$))`, "gi");
  } else {
    TOKEN_RE = /(https?:\/\/[^\s]+)/g; // no members — only linkify URLs
  }
  const parts = text.split(TOKEN_RE);
  return parts.map((part, i) => {
    if (/^https?:\/\//i.test(part)) {
      return (
        <a key={i} href={part} target="_blank" rel="noopener noreferrer"
          className="underline text-primary hover:opacity-80 break-all"
          onClick={e => e.stopPropagation()}>
          {part}
        </a>
      );
    }
    if (/^@/i.test(part)) {
      return <span key={i} className="text-emerald-500 font-medium">{part}</span>;
    }
    return <span key={i}>{part}</span>;
  });
}
const EMOJIS = ["🤖", "🎨", "📈", "💡", "🚀", "🎵", "📚", "🌱", "⚡", "🔥", "🌍", "🎮"];

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function fmtDate(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Today";
  const yest = new Date(today);
  yest.setDate(yest.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return d.toLocaleDateString();
}
function initials(name: string) {
  return name ? name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase() : "?";
}

// ── Small pure components (memoised to prevent re-renders) ────────────────
const Toggle = memo(({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
  <button role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${checked ? "bg-primary" : "bg-muted"}`}>
    <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`} />
  </button>
));

const DateDivider = memo(({ label }: { label: string }) => (
  <div className="flex items-center gap-3 py-2">
    <div className="flex-1 h-px bg-border" />
    <span className="text-[10px] font-medium text-muted-foreground px-2">{label}</span>
    <div className="flex-1 h-px bg-border" />
  </div>
));

const ShareLinkModal = memo(({ group, onClose }: { group: Group; onClose: () => void }) => {
  const link = `${window.location.origin}/groups/${group.id}`;
  const copy = () => { navigator.clipboard.writeText(link).then(() => toast({ title: "Link copied! 🔗" })); };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-xl animate-in fade-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-muted flex items-center justify-center text-xl">{group.emoji}</div>
            <div>
              <p className="font-semibold text-sm">{group.name}</p>
              <p className="text-xs text-muted-foreground">{group.member_count} members</p>
            </div>
          </div>
          <button onClick={onClose} className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <p className="text-sm text-muted-foreground mb-3">Share this link to invite people to the community.</p>
        <div className="flex items-center gap-2 p-3 bg-muted rounded-xl mb-4">
          <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-xs text-foreground flex-1 truncate font-mono">{link}</span>
        </div>
        <Button onClick={copy} className="w-full gap-2 h-10"><Copy className="h-4 w-4" /> Copy Link</Button>
      </div>
    </div>
  );
});

// ══════════════════════════════════════════════════════════════════════════
export default function Groups() {
  const { user } = useUser();
  const navigate = useNavigate();
  const { id: deepLinkId } = useParams<{ id?: string }>();

  // List
  const [groups, setGroups] = useState<Group[]>([]);
  const [joinedIds, setJoinedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [topic, setTopic] = useState(""); // "" = all topics
  const [filter, setFilter] = useState<"all" | "joined">("all");
  const [loadingGroups, setLoadingGroups] = useState(true);

  // View routing
  const [view, setView] = useState<"list" | "group" | "create">("list");
  const [activeGroup, setActiveGroup] = useState<Group | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showShare, setShowShare] = useState(false);

  // Settings
  const [editingGroup, setEditingGroup] = useState(false);
  const [editDesc, setEditDesc] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editEmoji, setEditEmoji] = useState("");
  const [editVisibility, setEditVisibility] = useState<"public" | "private">("public");
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");

  // Chat
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [msgMenuId, setMsgMenuId] = useState<string | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editMsgText, setEditMsgText] = useState("");
  const [sending, setSending] = useState(false);
  const [wsStatus, setWsStatus] = useState<"connecting" | "connected" | "error">("connecting");

  // Banned users (settings panel)
  const [bannedUsers, setBannedUsers] = useState<BannedUser[]>([]);
  const [bannedLoading, setBannedLoading] = useState(false);
  const [showBanned, setShowBanned] = useState(false);

  // Join requests (private communities)
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [joinRequestsLoading, setJoinRequestsLoading] = useState(false);
  const [showJoinRequests, setShowJoinRequests] = useState(false);
  // Track whether the current user has sent a join request per group
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set());
  // Track groups where a join/request action is in-flight (loading state)
  const [joiningIds, setJoiningIds] = useState<Set<string>>(new Set());
  // Track groups that have unread @mentions for the current user
  const [mentionGroupIds, setMentionGroupIds] = useState<Set<string>>(new Set());

  // Unread counts: keyed by group id — incremented by realtime on non-active groups
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  // Refs for mention message IDs in the current open chat
  const [mentionMsgIds, setMentionMsgIds] = useState<string[]>([]);
  const mentionJumpIdx = useRef(0);

  // Add members panel (admin)
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [connections, setConnections] = useState<{ id: string; name: string; color: string; avatarUrl?: string }[]>([]);
  const [connectionsLoading, setConnectionsLoading] = useState(false);
  const [addMemberSearch, setAddMemberSearch] = useState("");

  // Community image upload (settings)
  const [editImageUrl, setEditImageUrl] = useState<string | null>(null);
  const [editImagePreview, setEditImagePreview] = useState<string | null>(null);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const settingsImageRef = useRef<HTMLInputElement>(null);

  // @mention
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionResults, setMentionResults] = useState<GroupMember[]>([]);
  const [mentionIndex, setMentionIndex] = useState(0);

  // Create
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newBio, setNewBio] = useState("");
  const [newTopic, setNewTopic] = useState("General");
  const [newEmoji, setNewEmoji] = useState("🚀");
  const [newPrivate, setNewPrivate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newImageUrl, setNewImageUrl] = useState<string | null>(null);
  const [newImagePreview, setNewImagePreview] = useState<string | null>(null);
  const [uploadingCreateIcon, setUploadingCreateIcon] = useState(false);
  const createImageRef = useRef<HTMLInputElement>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLInputElement>(null);
  // Profile cache: avoid re-fetching the same user's profile on every message
  const profileCache = useRef<Record<string, { name: string; color: string; avatar_url?: string }>>({});

  const isOwner = activeGroup ? activeGroup.owner_id === user.id : false;
  const isAdmin = isOwner || members.find(m => m.id === user.id)?.role === "admin";
  const isJoined = activeGroup ? (joinedIds.has(activeGroup.id) || isOwner) : false;

  // ── Broadcast total unread count to Layout sidebar ───────────────────────
  useEffect(() => {
    const total = Object.values(unreadCounts).reduce((a, b) => a + b, 0);
    window.dispatchEvent(new CustomEvent("prolifier:groups-unread", { detail: total }));
    // Persist so Layout can read it on mount (before Groups.tsx is loaded)
    try { localStorage.setItem(`prf_groups_unread_${user.id}`, String(total)); } catch { /* ignore */ }
  }, [unreadCounts, user.id]);

  // ── Fetch groups + membership in parallel ────────────────────────────────
  const fetchGroups = useCallback(async () => {
    if (!user.id) return;
    setLoadingGroups(true);
    try {
      // Fetch groups first — this must succeed
      const { data: groupsData, error: groupsErr } = await (supabase as any)
        .from("groups")
        .select("*")
        .order("member_count", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(300);
      if (groupsErr) throw groupsErr;
      setGroups(groupsData || []);

      // Fetch memberships and pending join requests in parallel
      try {
        const [{ data: memberData }, { data: reqData }] = await Promise.all([
          (supabase as any).from("group_members").select("group_id").eq("user_id", user.id),
          (supabase as any).from("group_join_requests").select("group_id, status").eq("user_id", user.id),
        ]);
        const joined = new Set<string>((memberData || []).map((r: any) => r.group_id));
        setJoinedIds(joined);
        setRequestedIds(new Set(
          (reqData || []).filter((r: any) => r.status === "pending").map((r: any) => r.group_id)
        ));
        // Load unread counts — ONE batched query for all joined groups, not N sequential queries
        const initialUnread: Record<string, number> = {};
        const joinedArr = Array.from(joined);
        // Find the oldest last-read timestamp to use as a single lower bound
        const oldestLastRead = joinedArr.reduce((oldest, gid) => {
          const ts = localStorage.getItem(`prf_read_${user.id}_${gid}`);
          if (!ts) return oldest;
          return !oldest || ts < oldest ? ts : oldest;
        }, "");
        if (oldestLastRead && joinedArr.length > 0) {
          try {
            const { data: recentMsgs } = await (supabase as any)
              .from("group_messages")
              .select("group_id, created_at")
              .in("group_id", joinedArr)
              .neq("user_id", user.id)
              .eq("is_system", false)
              .gt("created_at", oldestLastRead);
            // Count per group using per-group timestamps
            for (const gid of joinedArr) {
              const lastRead = localStorage.getItem(`prf_read_${user.id}_${gid}`);
              if (!lastRead) continue;
              const c = (recentMsgs || []).filter((m: any) => m.group_id === gid && m.created_at > lastRead).length;
              if (c > 0) initialUnread[gid] = c;
            }
          } catch { /* non-fatal */ }
        }
        setUnreadCounts(initialUnread);

        // Detect groups with unread @mentions
        if (user.name && joinedArr.length > 0) {
          try {
            const mentionStr = `@${user.name}`;
            const { data: mentionMsgs } = await (supabase as any)
              .from("group_messages")
              .select("group_id, text, created_at")
              .in("group_id", joinedArr)
              .neq("user_id", user.id)
              .eq("is_system", false)
              .ilike("text", `%${mentionStr}%`);
            const mentionSet = new Set<string>();
            for (const msg of (mentionMsgs || [])) {
              const lastRead = localStorage.getItem(`prf_read_${user.id}_${msg.group_id}`);
              if (!lastRead || msg.created_at > lastRead) mentionSet.add(msg.group_id);
            }
            setMentionGroupIds(mentionSet);
          } catch { /* non-fatal */ }
        }
      } catch (memberErr) {
        if (import.meta.env.DEV) console.error("fetchGroups memberships:", memberErr);
        setJoinedIds(new Set());
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error("fetchGroups:", err);
      toast({ title: "Failed to load communities", variant: "destructive" });
    } finally {
      setLoadingGroups(false);
    }
  }, [user.id]);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  // Deep-link: /groups/:id — auto-open or prompt to join
  useEffect(() => {
    if (!deepLinkId || !user.id) return;
    (async () => {
      const { data } = await (supabase as any).from("groups").select("*").eq("id", deepLinkId).single();
      if (!data) { toast({ title: "Community not found", variant: "destructive" }); return; }
      setGroups(prev => prev.find(g => g.id === deepLinkId) ? prev : [data, ...prev]);
      openGroup(data);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkId, user.id]);

  // ── Fetch messages ───────────────────────────────────────────────────────
  const fetchMessages = useCallback(async (groupId: string) => {
    setLoadingMessages(true);
    setMessages([]);
    try {
      // Fetch messages and profiles in parallel - much faster than a join
      // Fetch the 100 most recent messages — descending so we get the latest,
      // then reverse to display oldest-first (bottom of chat).
      const { data: msgsDesc, error } = await (supabase as any)
        .from("group_messages")
        .select("id, group_id, user_id, text, media_url, media_type, created_at, edited, unsent, is_system")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false })
        .limit(100);
      const msgs = msgsDesc ? [...msgsDesc].reverse() : msgsDesc;
      if (error) throw error;
      if (!msgs || msgs.length === 0) { setLoadingMessages(false); return; }

      // Get unique user ids then fetch profiles in one query
      const userIds = [...new Set(msgs.map((m: any) => m.user_id))] as string[];
      const { data: profiles } = await (supabase as any)
        .from("profiles")
        .select("id, name, color, avatar_url")
        .in("id", userIds);
      const profileMap: Record<string, { name: string; color: string; avatar_url?: string }> = {};
      (profiles || []).forEach((p: any) => { profileMap[p.id] = { name: p.name, color: p.color, avatar_url: p.avatar_url || undefined }; });

      const mapped = msgs.map((row: any) => ({
        id: row.id,
        group_id: row.group_id,
        user_id: row.user_id,
        text: row.text,
        media_url: row.media_url,
        media_type: row.media_type,
        created_at: row.created_at,
        edited: row.edited ?? false,
        deleted: false,
        unsent: row.unsent ?? false,
        is_system: row.is_system ?? false,
        author_name: profileMap[row.user_id]?.name || "Unknown",
        author_color: profileMap[row.user_id]?.color || "bg-primary",
        author_avatar_url: profileMap[row.user_id]?.avatar_url,
      }));
      setMessages(mapped);
      // Detect unread messages that mention the current user
      // Only show mention button for messages AFTER the last-read timestamp
      if (user.name && groupId) {
        const mention = `@${user.name}`;
        const lastRead = localStorage.getItem(`prf_read_${user.id}_${groupId}`) ?? new Date(0).toISOString();
        const ids = mapped
          .filter((m: GroupMessage) => m.text?.includes(mention) && (m.created_at ?? "") > lastRead)
          .map((m: GroupMessage) => m.id);
        setMentionMsgIds(ids);
        mentionJumpIdx.current = 0;
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error("fetchMessages:", err);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  // ── Fetch members — count real rows ──────────────────────────────────────
  const fetchMembers = useCallback(async (groupId: string) => {
    setLoadingMembers(true);
    try {
      const { data, error, count } = await (supabase as any)
        .from("group_members")
        .select("id, user_id, role, profiles:user_id (name, color, avatar_url)", { count: "exact" })
        .eq("group_id", groupId)
        .order("joined_at", { ascending: true });
      if (error) throw error;

      setMembers((data || []).map((row: any) => ({
        id: row.user_id,
        name: row.profiles?.name || "Unknown",
        color: row.profiles?.color || "bg-primary",
        avatarUrl: row.profiles?.avatar_url || undefined,
        role: row.role || "member",
      })));

      // Fix member_count: use actual row count from DB
      const realCount = count ?? (data?.length ?? 0);
      setActiveGroup(prev => prev && prev.id === groupId ? { ...prev, member_count: realCount } : prev);
      setGroups(prev => prev.map(g => g.id === groupId ? { ...g, member_count: realCount } : g));

      // Sync the count in DB only if it diverged (avoid unnecessary writes on every open)
      const currentCount = groups.find(g => g.id === groupId)?.member_count;
      if (currentCount !== realCount) {
        await (supabase as any).from("groups").update({ member_count: realCount }).eq("id", groupId);
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error("fetchMembers:", err);
    } finally {
      setLoadingMembers(false);
    }
  }, []);

  // ── Realtime WebSocket for messages ─────────────────────────────────────
  // Reset status immediately when group changes so the UI shows "connecting"
  useEffect(() => {
    if (activeGroup?.id) setWsStatus("connecting");
  }, [activeGroup?.id]);

  useRealtimeChannel(
    activeGroup?.id ? `grp-${activeGroup.id}` : null,
    ch => ch.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "group_messages", filter: `group_id=eq.${activeGroup?.id}` },
      async (payload) => {
        const getProfile = async (uid: string) => {
          if (profileCache.current[uid]) return profileCache.current[uid];
          const { data } = await (supabase as any)
            .from("profiles").select("name, color, avatar_url").eq("id", uid).single();
          const p = { name: data?.name || "Unknown", color: data?.color || "bg-primary", avatar_url: data?.avatar_url || undefined };
          profileCache.current[uid] = p;
          return p;
        };
        if (payload.eventType === "INSERT") {
          const row = payload.new as any;
          // Increment unread for non-system messages (handled here via realtime for non-active groups)
          // (active group is always open so we don't increment it)
          if (!row.is_system && row.user_id !== user.id) {
            setUnreadCounts(prev => {
              const cur = prev[row.group_id] ?? 0;
              return { ...prev, [row.group_id]: cur + 1 };
            });
          }
          setMessages(prev => {
            // Already have the real message — skip (idempotent)
            if (prev.find(m => m.id === row.id)) return prev;
            // Replace the matching optimistic temp message from the same sender.
            // This prevents the double-message caused by optimistic add + realtime echo.
            const tempIdx = prev.findIndex(m =>
              m.id.startsWith("tmp-") &&
              m.user_id === row.user_id &&
              (m.text ?? null) === (row.text ?? null) &&
              (m.media_url ?? null) === (row.media_url ?? null)
            );
            if (tempIdx !== -1) {
              const next = [...prev];
              next[tempIdx] = {
                ...next[tempIdx],
                id: row.id,
                created_at: row.created_at,
                edited: row.edited ?? false,
                unsent: row.unsent ?? false,
              };
              return next;
            }
            // Message from someone else — append normally
            const newMsg = {
              id: row.id, group_id: row.group_id, user_id: row.user_id,
              text: row.text, media_url: row.media_url, media_type: row.media_type,
              created_at: row.created_at, edited: row.edited ?? false, deleted: false,
              unsent: row.unsent ?? false, is_system: row.is_system ?? false,
              author_name: profileCache.current[row.user_id]?.name || "…",
              author_color: profileCache.current[row.user_id]?.color || "bg-primary",
              author_avatar_url: profileCache.current[row.user_id]?.avatar_url,
            };
            // Detect new mention for the current user
            if (!row.is_system && row.text?.includes(`@${user.name}`)) {
              setMentionMsgIds(prev => prev.includes(row.id) ? prev : [...prev, row.id]);
            }
            return [...prev, newMsg];
          });
          // Only fetch profile if it wasn't already in cache — avoids a second
          // setMessages render for every message from a known sender.
          if (!profileCache.current[row.user_id]) {
            const profile = await getProfile(row.user_id);
            setMessages(prev => prev.map(m =>
              m.id === row.id ? { ...m, author_name: profile.name, author_color: profile.color, author_avatar_url: profile.avatar_url } : m
            ));
          }
        } else if (payload.eventType === "UPDATE") {
          const row = payload.new as any;
          setMessages(prev => prev.map(m =>
            m.id === row.id ? { ...m, text: row.text, edited: row.edited ?? true, unsent: row.unsent ?? false } : m
          ));
        } else if (payload.eventType === "DELETE") {
          setMessages(prev => prev.filter(m => m.id !== payload.old.id));
        }
      }
    ),
    (status, err) => {
      if (status === "SUBSCRIBED") setWsStatus("connected");
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        setWsStatus("error");
        if (import.meta.env.DEV) console.error("Realtime channel error:", err);
      }
    },
  );

  // Scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length]);

  useEffect(() => {
    if (editingMsgId) setTimeout(() => editRef.current?.focus(), 30);
  }, [editingMsgId]);

  // ── Open group — don't await; switch view instantly ──────────────────────
  const openGroup = (group: Group) => {
    setActiveGroup(group);
    setShowSettings(false);
    setShowShare(false);
    setEditingGroup(false);
    setMsgMenuId(null);
    setEditingMsgId(null);
    setChatInput("");
    setView("group");
    setMembers([]);
    setMentionMsgIds([]);
    mentionJumpIdx.current = 0;
    // Mark this group as read — reset unread counter + persist timestamp
    setUnreadCounts(prev => ({ ...prev, [group.id]: 0 }));
    setMentionGroupIds(prev => { const s = new Set(prev); s.delete(group.id); return s; });
    try { localStorage.setItem(`prf_read_${user.id}_${group.id}`, new Date().toISOString()); } catch { /* storage full */ }
    fetchMessages(group.id);
    fetchMembers(group.id);
  };

  const openSettings = () => {
    if (!activeGroup) return;
    setShowSettings(true);
    setShowBanned(false);
    setBannedUsers([]);
    setShowJoinRequests(false);
    setJoinRequests([]);
    setShowAddMembers(false);
    fetchMembers(activeGroup.id);
  };

  const fetchConnections = useCallback(async () => {
    if (!user.id) return;
    setConnectionsLoading(true);
    try {
      const { data } = await (supabase as any)
        .from("connections")
        .select("requester_id, receiver_id, profiles_requester:requester_id(id, name, color, avatar_url), profiles_receiver:receiver_id(id, name, color, avatar_url)")
        .eq("status", "accepted")
        .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`);
      const conns = (data || []).map((r: any) => {
        const isRequester = r.requester_id === user.id;
        const p = isRequester ? r.profiles_receiver : r.profiles_requester;
        return { id: p?.id, name: p?.name || "Unknown", color: p?.color || "bg-primary", avatarUrl: p?.avatar_url || undefined };
      }).filter((c: any) => c.id);
      setConnections(conns);
    } catch { /* non-fatal */ } finally { setConnectionsLoading(false); }
  }, [user.id]);

  // ── Join / Leave ─────────────────────────────────────────────────────────
  const toggleJoin = async (groupId: string, isCurrentlyJoined: boolean, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const g = groups.find(x => x.id === groupId);
    if (!g || joiningIds.has(groupId)) return;
    setJoiningIds(prev => new Set([...prev, groupId]));
    try {
      if (!isCurrentlyJoined && g.visibility === "private") {
        if (requestedIds.has(groupId)) {
          // Cancel the pending request — optimistic update first
          setRequestedIds(prev => { const s = new Set(prev); s.delete(groupId); return s; });
          try {
            await apiCancelJoinRequest(groupId);
            toast({ title: "Request cancelled" });
          } catch {
            setRequestedIds(prev => new Set([...prev, groupId])); // revert
            toast({ title: "Could not cancel request", variant: "destructive" });
          }
          return;
        }
        // Optimistic: mark as requested immediately
        setRequestedIds(prev => new Set([...prev, groupId]));
        try {
          await apiRequestToJoin(groupId);
          toast({ title: "Request sent!", description: "An admin will review your request." });
        } catch {
          setRequestedIds(prev => { const s = new Set(prev); s.delete(groupId); return s; }); // revert
          toast({ title: "Could not send request", variant: "destructive" });
        }
        return;
      }
      // Optimistic update for public join/leave
      if (isCurrentlyJoined) {
        setJoinedIds(prev => { const s = new Set(prev); s.delete(groupId); return s; });
        setGroups(prev => prev.map(x => x.id === groupId ? { ...x, member_count: Math.max(0, x.member_count - 1) } : x));
      } else {
        setJoinedIds(prev => new Set([...prev, groupId]));
        setGroups(prev => prev.map(x => x.id === groupId ? { ...x, member_count: x.member_count + 1 } : x));
      }
      try {
        if (isCurrentlyJoined) {
          await apiLeaveGroup(groupId);
          toast({ title: `Left ${g.name}` });
        } else {
          await apiJoinGroup(groupId);
          toast({ title: `Joined ${g.name}! 🎉` });
          if (g.owner_id !== user.id) {
            createNotification({
              userId: g.owner_id,
              type: "group",
              text: `${user.name} joined your community "${g.name}"`,
              action: `group:${groupId}`,
              actorId: user.id,
            });
          }
        }
      } catch (err) {
        if (import.meta.env.DEV) console.error(err);
        fetchGroups(); // revert optimistic update
        toast({ title: "Action failed", variant: "destructive" });
      }
    } finally {
      setJoiningIds(prev => { const s = new Set(prev); s.delete(groupId); return s; });
    }
  };

  // ── Send message ─────────────────────────────────────────────────────────
  const sendMessage = (text?: string, mediaUrl?: string, mediaType?: string) => {
    const trimmed = text?.trim();
    if ((!trimmed && !mediaUrl) || !activeGroup) return;
    setMentionQuery("");
    setMentionResults([]);

    // Add to UI instantly — no waiting at all
    const tempId = `tmp-${Date.now()}`;
    setMessages(prev => [...prev, {
      id: tempId,
      group_id: activeGroup.id,
      user_id: user.id,
      text: trimmed || null,
      media_url: mediaUrl || null,
      media_type: mediaType || null,
      created_at: new Date().toISOString(),
      edited: false,
      deleted: false,
      unsent: false,
      is_system: false,
      author_name: user.name,
      author_color: user.color,
      author_avatar_url: user.avatarUrl || undefined,
    }]);
    setChatInput("");
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    inputRef.current?.focus();

    // Fire insert in background — no await, no spinner
    apiSendGroupMessage(activeGroup.id, {
      text: trimmed || "",
      media_url: mediaUrl || null,
      media_type: mediaType || undefined,
    }).catch((err: any) => {
      if (import.meta.env.DEV) console.error("Send failed:", err);
      // Remove the optimistic message
      setMessages(prev => prev.filter(m => m.id !== tempId));
      setChatInput(trimmed || "");
      toast({ title: "Failed to send", variant: "destructive" });
    });
  };

  // ── File upload ──────────────────────────────────────────────────────────
  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>, type: MediaType) => {
    const file = e.target.files?.[0];
    if (!file || !activeGroup) return;
    try {
      let url: string;
      if (type === "video") {
        const uploaded = await uploadVideo(file, "chat");
        url = uploaded.fallbackUrl;
      } else if (type === "file") {
        const uploaded = await uploadFile(file);
        url = uploaded.url;
      } else {
        const uploaded = await uploadPostImage(file, "chat");
        url = uploaded.url;
      }
      sendMessage(undefined, url, type);
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    }
    e.target.value = "";
  };

  // ── Edit message — optimistic ─────────────────────────────────────────────
  const startEditMsg = (m: GroupMessage) => {
    setEditingMsgId(m.id);
    setEditMsgText(m.text || "");
    setMsgMenuId(null);
  };

  const saveEditMsg = async () => {
    const trimmed = editMsgText.trim();
    if (!trimmed || !editingMsgId) return;
    const prevMessages = messages;
    // Optimistic update immediately
    setMessages(prev => prev.map(m => m.id === editingMsgId ? { ...m, text: trimmed, edited: true } : m));
    setEditingMsgId(null);
    setEditMsgText("");
    try {
      const { error } = await (supabase as any).from("group_messages")
        .update({ text: trimmed, edited: true })
        .eq("id", editingMsgId);
      if (error) throw error;
    } catch {
      // Revert
      setMessages(prevMessages);
      toast({ title: "Edit failed — reverted", variant: "destructive" });
    }
  };

  // ── Unsend — optimistic soft-delete then hard delete ─────────────────────
  const unsendMsg = async (msgId: string) => {
    setMsgMenuId(null);
    // Show tombstone immediately for this user
    setMessages(prev => prev.map(m =>
      m.id === msgId ? { ...m, unsent: true, text: null, media_url: null, media_type: null } : m
    ));

    // UPDATE row — keeps it in DB as tombstone, realtime fires to ALL members
    const { error, data } = await (supabase as any)
      .from("group_messages")
      .update({ unsent: true, text: null, media_url: null, media_type: null })
      .eq("id", msgId)
      .select();

    if (error || !data || data.length === 0) {
      if (import.meta.env.DEV) console.error("Unsend failed:", error);
      // Revert
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, unsent: false } : m));
      if (activeGroup) fetchMessages(activeGroup.id);
      toast({ title: "Could not unsend", variant: "destructive" });
    }
  };

  // ── Admin: remove member ─────────────────────────────────────────────────
  const removeMember = async (memberId: string, memberName: string) => {
    if (!activeGroup) return;
    setMembers(prev => prev.filter(m => m.id !== memberId));
    // Optimistic decrement; server handles atomic count via RPC
    setActiveGroup(prev => prev ? { ...prev, member_count: Math.max(0, prev.member_count - 1) } : prev);
    setGroups(prev => prev.map(g => g.id === activeGroup.id ? { ...g, member_count: Math.max(0, g.member_count - 1) } : g));
    try {
      await apiRemoveMember(activeGroup.id, memberId);
      toast({ title: `${memberName} removed` });
    } catch {
      fetchMembers(activeGroup.id); // revert
      toast({ title: "Remove failed", variant: "destructive" });
    }
  };

  // ── Admin: ban member ────────────────────────────────────────────────────
  const banMember = async (memberId: string, memberName: string) => {
    if (!activeGroup) return;
    if (!window.confirm(`Ban ${memberName}? They won't be able to rejoin.`)) return;
    setMembers(prev => prev.filter(m => m.id !== memberId));
    // Optimistic decrement; server handles atomic count via RPC
    setActiveGroup(prev => prev ? { ...prev, member_count: Math.max(0, prev.member_count - 1) } : prev);
    setGroups(prev => prev.map(g => g.id === activeGroup.id ? { ...g, member_count: Math.max(0, g.member_count - 1) } : g));
    try {
      await apiBanMember(activeGroup.id, memberId);
      // Refresh banned list if it's open
      if (showBanned) setBannedUsers(await apiGetBannedUsers(activeGroup.id));
      toast({ title: `${memberName} has been banned` });
    } catch {
      fetchMembers(activeGroup.id);
      toast({ title: "Ban failed", variant: "destructive" });
    }
  };

  // ── Admin: assign/revoke admin role ─────────────────────────────────────
  const toggleAdmin = async (memberId: string, memberName: string, currentRole: string) => {
    if (!activeGroup) return;
    const newRole = currentRole === "admin" ? "member" : "admin";
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole as any } : m));
    try {
      await apiAssignRole(activeGroup.id, memberId, newRole);
      toast({ title: newRole === "admin" ? `${memberName} is now an admin` : `${memberName} is no longer an admin` });
    } catch {
      fetchMembers(activeGroup.id);
      toast({ title: "Failed to update role", variant: "destructive" });
    }
  };

  // ── Admin: delete group ──────────────────────────────────────────────────
  const deleteGroup = async () => {
    if (!activeGroup) return;
    if (!window.confirm(`Delete "${activeGroup.name}"? This cannot be undone.`)) return;
    try {
      await apiDeleteGroup(activeGroup.id);
      setGroups(prev => prev.filter(g => g.id !== activeGroup.id));
      setJoinedIds(prev => { const s = new Set(prev); s.delete(activeGroup.id); return s; });
      setView("list");
      setActiveGroup(null);
      toast({ title: "Community deleted" });
    } catch {
      toast({ title: "Delete failed", variant: "destructive" });
    }
  };

  // ── Admin: handle icon image selection ──────────────────────────────────
  const handleIconImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    // Show local preview immediately
    const blobUrl = URL.createObjectURL(file);
    setEditImagePreview(blobUrl);
    setUploadingIcon(true);
    try {
      const result = await uploadPostImage(file, "feed");
      setEditImageUrl(result.url);
      setEditImagePreview(result.url);
      URL.revokeObjectURL(blobUrl);
    } catch {
      setEditImagePreview(editImageUrl); // revert to previous
      toast({ title: "Icon upload failed", variant: "destructive" });
    } finally {
      setUploadingIcon(false);
    }
  };

  // ── Create form: handle icon image selection ────────────────────────────
  const handleCreateIconSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const blobUrl = URL.createObjectURL(file);
    setNewImagePreview(blobUrl);
    setUploadingCreateIcon(true);
    try {
      const result = await uploadPostImage(file, "feed");
      setNewImageUrl(result.url);
      setNewImagePreview(result.url);
      URL.revokeObjectURL(blobUrl);
    } catch {
      setNewImagePreview(null);
      toast({ title: "Icon upload failed", variant: "destructive" });
    } finally {
      setUploadingCreateIcon(false);
    }
  };

  // ── Admin: save group edit ───────────────────────────────────────────────
  const saveGroupEdit = async () => {
    if (!activeGroup) return;
    const updated = { ...activeGroup, description: editDesc, bio: editBio, emoji: editEmoji, visibility: editVisibility, image_url: editImageUrl };
    setActiveGroup(updated);
    setGroups(prev => prev.map(g => g.id === activeGroup.id ? { ...g, description: editDesc, bio: editBio, emoji: editEmoji, visibility: editVisibility, image_url: editImageUrl } : g));
    setEditingGroup(false);
    try {
      await apiUpdateGroup(activeGroup.id, { description: editDesc, bio: editBio, emoji: editEmoji, visibility: editVisibility, image_url: editImageUrl });
      toast({ title: "Community updated ✓" });
    } catch {
      setActiveGroup(activeGroup);
      toast({ title: "Update failed", variant: "destructive" });
    }
  };

  // ── Create group ─────────────────────────────────────────────────────────
  const createGroup = async () => {
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      const data = await apiCreateGroup({
        name: newName.trim(),
        description: newDesc.trim() || "A new community.",
        bio: newBio.trim() || "Welcome to our community!",
        is_private: newPrivate,
        emoji: newEmoji,
        topic: newTopic,
        image_url: newImageUrl || undefined,
      });
      setGroups(prev => [data, ...prev]);
      setJoinedIds(prev => new Set([...prev, data.id]));
      toast({ title: `${data.emoji ?? newEmoji} ${data.name} created!` });
      setNewName(""); setNewDesc(""); setNewBio(""); setNewTopic("General"); setNewEmoji("🚀"); setNewPrivate(false);
      setNewImageUrl(null); setNewImagePreview(null);
      openGroup(data);
    } catch (err) {
      if (import.meta.env.DEV) console.error(err);
      toast({ title: "Failed to create community", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  // ── Message list ──────────────────────────────────────────────────────────
  const renderMessageList = () => {
    const els: React.ReactNode[] = [];
    let lastDate = "";

    // Show all messages including unsent tombstones and system messages; skip truly empty ones
    const visible = messages.filter(m =>
      m.is_system || m.unsent || m.text?.trim() || m.media_url
    );

    visible.forEach((m, idx) => {
      const dateLabel = fmtDate(m.created_at);
      if (dateLabel !== lastDate) {
        els.push(<DateDivider key={"date-" + m.id} label={dateLabel} />);
        lastDate = dateLabel;
      }

      const prev = visible[idx - 1];
      // Group only if: same sender, same day, within 90 seconds
      const grouped =
        !!prev &&
        prev.user_id === m.user_id &&
        fmtDate(prev.created_at) === dateLabel &&
        new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 90 * 1000;

      const isMe = m.user_id === user.id;
      const isEditingThis = editingMsgId === m.id;
      const menuOpen = msgMenuId === m.id;
      const canMenu = (isMe || isOwner) && !m.unsent;

      // System message — handle JOINREQ specially (interactive card for admins)
      if (m.is_system) {
        const joinReqMatch = m.text?.match(/^\|\|JOINREQ\|\|([^|]+)\|\|([^|]+)\|\|(.+)$/);
        if (joinReqMatch) {
          const [, reqId, reqUserId, requesterName] = joinReqMatch;
          // Only show the interactive card to admins/owner; others see a plain pill
          if (isAdmin) {
            els.push(
              <div key={m.id} className="flex justify-center my-3">
                <div className="bg-muted border border-border rounded-2xl px-4 py-3 max-w-xs w-full">
                  <p className="text-xs text-muted-foreground mb-2 text-center">
                    <span className="font-semibold text-foreground">{requesterName}</span> wants to join
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        if (!activeGroup) return;
                        try {
                          await apiRespondJoinRequest(activeGroup.id, reqId, "accepted");
                          setMessages(prev => prev.filter(x => x.id !== m.id));
                          fetchMembers(activeGroup.id);
                          toast({ title: `${requesterName} accepted` });
                        } catch { toast({ title: "Failed", variant: "destructive" }); }
                      }}
                      className="flex-1 text-xs py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity font-medium"
                    >Accept</button>
                    <button
                      onClick={async () => {
                        if (!activeGroup) return;
                        try {
                          await apiRespondJoinRequest(activeGroup.id, reqId, "rejected");
                          setMessages(prev => prev.filter(x => x.id !== m.id));
                          toast({ title: "Request declined" });
                        } catch { toast({ title: "Failed", variant: "destructive" }); }
                      }}
                      className="flex-1 text-xs py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors font-medium"
                    >Decline</button>
                  </div>
                </div>
              </div>
            );
          }
          // Non-admins don't see JOINREQ messages at all
          return;
        }
        els.push(
          <div key={m.id} className="flex justify-center my-2">
            <span className="text-[11px] text-muted-foreground bg-muted px-3 py-1 rounded-full select-none">
              {m.text}
            </span>
          </div>
        );
        return;
      }

      // Tombstone — shown to everyone when a message is unsent
      if (m.unsent) {
        els.push(
          <div key={m.id} className={"flex gap-3 " + (grouped ? "mt-0.5" : "mt-4")}>
            {!grouped
              ? (
                <button onClick={() => navigate(`/profile/${m.user_id}`)}
                  className={"h-9 w-9 rounded-full " + m.author_color + " flex items-center justify-center text-white text-xs font-semibold shrink-0 mt-0.5 overflow-hidden hover:opacity-80 transition-opacity"}>
                  {m.author_avatar_url
                    ? <img src={m.author_avatar_url} alt={m.author_name} className="w-full h-full object-cover" />
                    : initials(m.author_name)}
                </button>
              )
              : <div className="w-9 shrink-0" />
            }
            <p className="text-xs text-muted-foreground italic py-0.5 select-none">
              🚫 This message was unsent.
            </p>
          </div>
        );
        return;
      }

      const isMentioned = !m.is_system && m.text?.includes(`@${user.name}`);
      els.push(
        <div key={m.id} id={`msg-${m.id}`} className={"flex gap-3 group relative " + (grouped ? "mt-0.5" : "mt-4") + (isMentioned ? " bg-emerald-500/5 rounded-xl -mx-1 px-1" : "")}>
          {!grouped
            ? (
              <button onClick={() => navigate(`/profile/${m.user_id}`)}
                className={"h-9 w-9 rounded-full " + m.author_color + " flex items-center justify-center text-white text-xs font-semibold shrink-0 mt-0.5 overflow-hidden hover:opacity-80 transition-opacity"}>
                {m.author_avatar_url
                  ? <img src={m.author_avatar_url} alt={m.author_name} className="w-full h-full object-cover" />
                  : initials(m.author_name)}
              </button>
            )
            : <div className="w-9 shrink-0" />
          }
          <div className="flex-1 min-w-0">
            {!grouped && (
              <div className="flex items-baseline gap-2 mb-0.5">
                <button onClick={() => navigate(`/profile/${m.user_id}`)}
                  className="text-sm font-semibold text-foreground hover:underline">{m.author_name}</button>
                <span className="text-xs text-muted-foreground">{fmtTime(m.created_at)}</span>
                {m.edited && <span className="text-[10px] text-muted-foreground italic">· edited</span>}
              </div>
            )}
            {isEditingThis ? (
              <div className="flex items-center gap-2 mt-0.5">
                <input ref={editRef} value={editMsgText}
                  onChange={e => setEditMsgText(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") saveEditMsg(); if (e.key === "Escape") { setEditingMsgId(null); setEditMsgText(""); } }}
                  className="flex-1 px-3 py-1.5 rounded-xl text-sm bg-secondary border border-primary outline-none text-foreground" />
                <button onClick={saveEditMsg} className="h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => { setEditingMsgId(null); setEditMsgText(""); }}
                  className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0 text-muted-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <>
                {m.text?.trim() && (
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words">
                    {renderTextWithLinks(m.text.trim(), members.map(mb => mb.name))}
                    {m.edited && grouped && <span className="text-[10px] text-muted-foreground italic ml-1">· edited</span>}
                  </p>
                )}
                {m.media_type === "image" && m.media_url && (
                  <div className="rounded-xl overflow-hidden mt-1 max-w-xs">
                    <img src={m.media_url} alt="shared" className="w-full max-h-56 object-cover" loading="lazy" />
                  </div>
                )}
                {m.media_type === "video" && m.media_url && (
                  <video src={m.media_url} controls className="rounded-xl mt-1 max-w-xs max-h-56 bg-black" />
                )}
                {m.media_type === "file" && m.media_url && (
                  <a href={m.media_url} download className="inline-flex items-center gap-2 mt-1 px-3 py-2 rounded-xl bg-secondary text-sm text-foreground hover:bg-muted transition-colors max-w-xs">
                    <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="truncate">File</span>
                  </a>
                )}
                {canMenu && (
                  <button onClick={e => { e.stopPropagation(); setMsgMenuId(menuOpen ? null : m.id); }}
                    className="absolute right-0 top-0 opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground z-10">
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>
                )}
                {menuOpen && (
                  <div className="absolute right-0 top-7 z-40 bg-card border border-border rounded-xl shadow-xl overflow-hidden min-w-[170px]"
                    onClick={e => e.stopPropagation()}>
                    {isMe && (
                      <button onClick={() => startEditMsg(m)}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors">
                        <Edit3 className="h-3.5 w-3.5" /> Edit message
                      </button>
                    )}
                    <button onClick={() => unsendMsg(m.id)}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-destructive hover:bg-destructive/5 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                      Unsend
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      );
    });

    return <>{els}</>;
  };

  // ══════════════════════════════════════════════════════════════════════════
  // VIEW: Create
  // ══════════════════════════════════════════════════════════════════════════
  if (view === "create") {
    return (
      <Layout>
        <div className="max-w-lg mx-auto px-4 py-6">
          <button onClick={() => setView("list")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <h1 className="text-xl font-bold mb-6">Create a Community</h1>
          <div className="space-y-5">
            <div>
              <label className="text-sm font-medium block mb-2">Community icon</label>
              {/* Hidden file input */}
              <input ref={createImageRef} type="file" accept="image/*" className="hidden" onChange={handleCreateIconSelect} />
              {/* Main icon circle — click to upload (live preview) */}
              <div className="flex items-center gap-4 mb-3">
                <div
                  onClick={() => !uploadingCreateIcon && createImageRef.current?.click()}
                  className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center text-3xl overflow-hidden shrink-0 relative cursor-pointer ring-2 ring-primary/30 hover:ring-primary transition-all"
                >
                  {newImagePreview
                    ? <img src={newImagePreview} alt="icon" className="w-full h-full object-cover" />
                    : newEmoji}
                  {uploadingCreateIcon && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <div className="h-5 w-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    </div>
                  )}
                  {!uploadingCreateIcon && (
                    <div className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors rounded-2xl" />
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs text-muted-foreground">Tap the icon to upload a custom image,<br/>or pick an emoji below.</p>
                  {newImageUrl && (
                    <button type="button" onClick={() => { setNewImageUrl(null); setNewImagePreview(null); }}
                      className="text-xs px-2.5 py-1 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/5 transition-colors self-start">
                      Remove image
                    </button>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {EMOJIS.map(e => (
                  <button key={e} onClick={() => { setNewEmoji(e); }}
                    className={`h-10 w-10 rounded-xl text-xl flex items-center justify-center transition-all ${newEmoji === e && !newImagePreview ? "bg-primary/20 ring-2 ring-primary" : "bg-muted hover:bg-secondary"}`}>
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1.5">Community name <span className="text-destructive">*</span></label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. AI Builders, Design Crew…" className="h-11" />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1.5">Short description</label>
              <Input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="One line about your community" className="h-11" />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1.5">Bio</label>
              <Textarea value={newBio} onChange={e => setNewBio(e.target.value)} placeholder="Tell people what this community is about…" rows={3} />
            </div>
            <div>
              <label className="text-sm font-medium block mb-2">Topic</label>
              <div className="flex flex-wrap gap-2">
                {TOPICS.map(t => (
                  <Badge key={t} variant={newTopic === t ? "default" : "outline"} className="cursor-pointer" onClick={() => setNewTopic(t)}>{t}</Badge>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-border p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  {newPrivate ? <Lock className="h-4 w-4 text-muted-foreground" /> : <Globe className="h-4 w-4 text-muted-foreground" />}
                  <div>
                    <p className="text-sm font-medium">{newPrivate ? "Private community" : "Public community"}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{newPrivate ? "Only invited members can join" : "Anyone can discover and join"}</p>
                  </div>
                </div>
                <Toggle checked={newPrivate} onChange={setNewPrivate} />
              </div>
            </div>
            <Button onClick={createGroup} disabled={!newName.trim() || creating} className="w-full h-11 font-semibold gap-2">
              {creating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Create Community
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VIEW: Settings
  // ══════════════════════════════════════════════════════════════════════════
  if (view === "group" && activeGroup && showSettings) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto px-4 py-6">
          <button onClick={() => { setShowSettings(false); setEditingGroup(false); }}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
            <ArrowLeft className="h-4 w-4" /> Back to chat
          </button>
          <h2 className="text-lg font-bold mb-5">Community Settings</h2>

          <div className="space-y-3">
            {/* Group info */}
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center gap-3 mb-4">
                {/* Main icon circle — clickable to upload when in edit mode (acts as live preview) */}
                <input ref={settingsImageRef} type="file" accept="image/*" className="hidden" onChange={handleIconImageSelect} />
                <div
                  onClick={() => editingGroup && settingsImageRef.current?.click()}
                  className={`h-14 w-14 rounded-2xl bg-muted flex items-center justify-center text-3xl overflow-hidden shrink-0 relative ${editingGroup ? "cursor-pointer ring-2 ring-primary/40 hover:ring-primary transition-all" : ""}`}
                >
                  {(editingGroup ? (editImagePreview || null) : activeGroup.image_url)
                    ? <img src={editingGroup ? editImagePreview! : activeGroup.image_url!} alt={activeGroup.name} className="w-full h-full object-cover" />
                    : (editingGroup ? editEmoji : activeGroup.emoji)}
                  {editingGroup && !uploadingIcon && (
                    <div className="absolute inset-0 bg-black/0 hover:bg-black/25 transition-colors rounded-2xl flex items-center justify-center">
                      <Image className="h-4 w-4 text-white opacity-0 hover:opacity-100 transition-opacity" />
                    </div>
                  )}
                  {uploadingIcon && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    </div>
                  )}
                </div>
                <div>
                  <p className="font-bold text-foreground">{activeGroup.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {activeGroup.visibility === "private" ? "🔒 Private" : "🌐 Public"} · {activeGroup.member_count} members
                  </p>
                  {editingGroup && (
                    <p className="text-xs text-muted-foreground mt-1">Tap the icon to change it</p>
                  )}
                </div>
              </div>
              {editingGroup ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1.5">Icon options</label>
                    <div className="flex items-center gap-2 mb-2">
                      {editImageUrl && (
                        <button type="button" onClick={() => { setEditImageUrl(null); setEditImagePreview(null); }}
                          className="text-xs px-3 py-1.5 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/5 transition-colors">
                          Remove custom image
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {EMOJIS.map(e => (
                        <button key={e} onClick={() => { setEditEmoji(e); if (!editImageUrl) setEditImagePreview(null); }}
                          className={`h-9 w-9 rounded-xl text-lg flex items-center justify-center transition-all ${editEmoji === e && !editImagePreview ? "bg-primary/20 ring-2 ring-primary" : "bg-muted hover:bg-secondary"}`}>
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Description</label>
                    <Input value={editDesc} onChange={e => setEditDesc(e.target.value)} className="h-9 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Bio</label>
                    <Textarea value={editBio} onChange={e => setEditBio(e.target.value)} rows={3} className="text-sm" />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl border border-border">
                    <div className="flex items-center gap-2">
                      {editVisibility === "private" ? <Lock className="h-3.5 w-3.5 text-muted-foreground" /> : <Globe className="h-3.5 w-3.5 text-muted-foreground" />}
                      <span className="text-sm font-medium">{editVisibility === "private" ? "Private" : "Public"}</span>
                    </div>
                    <Toggle checked={editVisibility === "private"} onChange={v => setEditVisibility(v ? "private" : "public")} />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1 h-8 text-xs" onClick={saveGroupEdit}>Save changes</Button>
                    <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={() => setEditingGroup(false)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Description</p>
                  <p className="text-sm text-foreground mb-3">{activeGroup.description}</p>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Bio</p>
                  <p className="text-sm text-foreground mb-3">{activeGroup.bio}</p>
                  {isOwner && (
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8"
                      onClick={() => { setEditDesc(activeGroup.description); setEditBio(activeGroup.bio); setEditEmoji(activeGroup.emoji); setEditVisibility(activeGroup.visibility); setEditImageUrl(activeGroup.image_url ?? null); setEditImagePreview(activeGroup.image_url ?? null); setEditingGroup(true); }}>
                      <Edit3 className="h-3.5 w-3.5" /> Edit community info
                    </Button>
                  )}
                </>
              )}
            </div>

            {/* Members */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <p className="text-sm font-semibold">
                  {loadingMembers ? "Loading…" : `Members (${activeGroup.member_count})`}
                </p>
                <button onClick={() => fetchMembers(activeGroup.id)}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                  <RefreshCw className={`h-3 w-3 ${loadingMembers ? "animate-spin" : ""}`} /> Refresh
                </button>
              </div>
              <div className="px-4 py-2 border-b border-border">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input value={memberSearch} onChange={e => setMemberSearch(e.target.value)}
                    placeholder="Search members…" className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-muted outline-none text-foreground placeholder:text-muted-foreground" />
                </div>
              </div>
              {loadingMembers ? (
                <div className="p-6 flex justify-center">
                  <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {members.filter(m => !memberSearch || m.name.toLowerCase().includes(memberSearch.toLowerCase())).map(m => {
                    const isSelf = m.id === user.id;
                    const isAdminInGroup = members.find(x => x.id === user.id)?.role === "admin" || isOwner;
                    const targetIsAdmin = m.role === "admin" || m.role === "owner";
                    // Can act on this member if: (I'm owner) OR (I'm admin AND target is not admin)
                    const canAct = !isSelf && isAdminInGroup && (isOwner || !targetIsAdmin);
                    return (
                    <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                      <button onClick={() => navigate(`/profile/${m.id}`)}
                        className={`h-9 w-9 rounded-full ${m.color} flex items-center justify-center text-white text-xs font-semibold shrink-0 hover:opacity-80 transition-opacity overflow-hidden`}>
                        {m.avatarUrl
                          ? <img src={m.avatarUrl} alt={m.name} className="w-full h-full object-cover" />
                          : initials(m.name)}
                      </button>
                      <button onClick={() => navigate(`/profile/${m.id}`)}
                        className="text-sm text-foreground hover:underline flex-1 text-left min-w-0 truncate">
                        {m.name}{isSelf ? " (You)" : ""}
                      </button>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {(m.role === "owner" || m.role === "admin") && <Crown className="h-3.5 w-3.5 text-amber-500" title={m.role === "owner" ? "Owner" : "Admin"} />}
                        {/* Promote button: any admin (including owner) can promote plain members */}
                        {isAdmin && !isSelf && m.role === "member" && (
                          <button onClick={() => toggleAdmin(m.id, m.name, m.role)} title="Appoint as admin"
                            className="h-7 w-7 rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors flex items-center justify-center">
                            <Crown className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {/* Revoke button: only for admins, separate from crown display */}
                        {isOwner && !isSelf && m.role === "admin" && (
                          <button onClick={() => toggleAdmin(m.id, m.name, m.role)} title="Revoke admin"
                            className="text-xs px-2 py-0.5 rounded-md border border-amber-200 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950 transition-colors shrink-0">
                            Revoke
                          </button>
                        )}
                        {canAct && (
                          <>
                            <button onClick={() => removeMember(m.id, m.name)} title="Remove"
                              className="h-7 w-7 rounded-lg text-orange-500 border border-orange-200 hover:bg-orange-50 dark:hover:bg-orange-950 transition-colors flex items-center justify-center">
                              <UserX className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => banMember(m.id, m.name)} title="Ban"
                              className="h-7 w-7 rounded-lg text-destructive border border-destructive/30 hover:bg-destructive/5 transition-colors flex items-center justify-center">
                              <ShieldOff className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>

            {(isOwner || members.find(m => m.id === user.id)?.role === "admin") && (
              <Button variant="outline" className="w-full gap-2" onClick={() => setShowShare(true)}>
                <Link2 className="h-4 w-4" /> Share invite link
              </Button>
            )}

            {/* Add Members — admin/owner can add connections */}
            {(isOwner || members.find(m => m.id === user.id)?.role === "admin") && (
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <UserPlus className="h-4 w-4 text-primary" /> Add Members
                  </p>
                  <button
                    onClick={async () => {
                      const next = !showAddMembers;
                      setShowAddMembers(next);
                      if (next && connections.length === 0) await fetchConnections();
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showAddMembers ? "Hide" : "Show"}
                  </button>
                </div>
                {showAddMembers && (
                  connectionsLoading ? (
                    <div className="p-4 flex justify-center">
                      <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                    </div>
                  ) : connections.length === 0 ? (
                    <p className="px-4 py-3 text-xs text-muted-foreground">No connections to add.</p>
                  ) : (
                    <div>
                      <div className="px-3 pt-2 pb-1">
                        <input value={addMemberSearch} onChange={e => setAddMemberSearch(e.target.value)}
                          placeholder="Search connections…" className="w-full px-3 py-1.5 text-xs rounded-lg bg-muted outline-none" />
                      </div>
                      <div className="divide-y divide-border max-h-52 overflow-y-auto">
                        {connections.filter(c => !members.find(m => m.id === c.id) && (!addMemberSearch || c.name.toLowerCase().includes(addMemberSearch.toLowerCase()))).map(c => (
                          <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                            <div className={`h-8 w-8 rounded-full ${c.color} flex items-center justify-center text-white text-xs font-semibold shrink-0 overflow-hidden`}>
                              {c.avatarUrl ? <img src={c.avatarUrl} alt={c.name} className="w-full h-full object-cover" /> : initials(c.name)}
                            </div>
                            <span className="text-sm text-foreground flex-1 min-w-0 truncate">{c.name}</span>
                            <button
                              onClick={async () => {
                                if (!activeGroup) return;
                                try {
                                  await apiAddMember(activeGroup.id, c.id);
                                  fetchMembers(activeGroup.id);
                                  toast({ title: `${c.name} added` });
                                } catch (err: any) {
                                  toast({ title: err.message || "Failed to add", variant: "destructive" });
                                }
                              }}
                              className="text-xs px-2.5 py-1 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity shrink-0"
                            >
                              Add
                            </button>
                          </div>
                        ))}
                        {connections.filter(c => !members.find(m => m.id === c.id)).length === 0 && (
                          <p className="px-4 py-3 text-xs text-muted-foreground">All your connections are already members.</p>
                        )}
                      </div>
                    </div>
                  )
                )}
              </div>
            )}

            {/* Join requests — owner/admin can approve/reject */}
            {activeGroup.visibility === "private" && (isOwner || members.find(m => m.id === user.id)?.role === "admin") && (
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <Bell className="h-4 w-4 text-amber-500" /> Join Requests
                  </p>
                  <button
                    onClick={async () => {
                      const next = !showJoinRequests;
                      setShowJoinRequests(next);
                      if (next) {
                        setJoinRequestsLoading(true);
                        try { setJoinRequests(await apiGetJoinRequests(activeGroup.id)); }
                        catch { toast({ title: "Failed to load requests", variant: "destructive" }); }
                        finally { setJoinRequestsLoading(false); }
                      }
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showJoinRequests ? "Hide" : "Show"}
                  </button>
                </div>
                {showJoinRequests && (
                  joinRequestsLoading ? (
                    <div className="p-4 flex justify-center">
                      <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                    </div>
                  ) : joinRequests.length === 0 ? (
                    <p className="px-4 py-3 text-xs text-muted-foreground">No pending requests.</p>
                  ) : (
                    <div className="divide-y divide-border">
                      {joinRequests.map(r => (
                        <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                          <div className={`h-8 w-8 rounded-full ${r.profile?.color || "bg-muted"} flex items-center justify-center text-white text-xs font-semibold shrink-0 overflow-hidden`}>
                            {r.profile?.avatar_url
                              ? <img src={r.profile.avatar_url} alt={r.profile?.name} className="w-full h-full object-cover" />
                              : initials(r.profile?.name || "?")}
                          </div>
                          <span className="text-sm text-foreground flex-1 min-w-0 truncate">{r.profile?.name || "Unknown"}</span>
                          <div className="flex gap-1.5 shrink-0">
                            <button
                              onClick={async () => {
                                try {
                                  await apiRespondJoinRequest(activeGroup.id, r.id, "accepted");
                                  setJoinRequests(prev => prev.filter(x => x.id !== r.id));
                                  fetchMembers(activeGroup.id);
                                  toast({ title: `${r.profile?.name || "User"} approved` });
                                } catch { toast({ title: "Failed", variant: "destructive" }); }
                              }}
                              className="text-xs px-2.5 py-1 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                            >Accept</button>
                            <button
                              onClick={async () => {
                                try {
                                  await apiRespondJoinRequest(activeGroup.id, r.id, "rejected");
                                  setJoinRequests(prev => prev.filter(x => x.id !== r.id));
                                  toast({ title: "Request declined" });
                                } catch { toast({ title: "Failed", variant: "destructive" }); }
                              }}
                              className="text-xs px-2.5 py-1 rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors"
                            >Decline</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            )}

            {/* Banned users — visible only to owner */}
            {isOwner && (
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <ShieldOff className="h-4 w-4 text-destructive" /> Banned Users
                  </p>
                  <button
                    onClick={async () => {
                      const next = !showBanned;
                      setShowBanned(next);
                      if (next && bannedUsers.length === 0) {
                        setBannedLoading(true);
                        try { setBannedUsers(await apiGetBannedUsers(activeGroup.id)); }
                        catch { toast({ title: "Failed to load banned users", variant: "destructive" }); }
                        finally { setBannedLoading(false); }
                      }
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showBanned ? "Hide" : "Show"}
                  </button>
                </div>
                {showBanned && (
                  bannedLoading ? (
                    <div className="p-4 flex justify-center">
                      <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                    </div>
                  ) : bannedUsers.length === 0 ? (
                    <p className="px-4 py-3 text-xs text-muted-foreground">No banned users.</p>
                  ) : (
                    <div className="divide-y divide-border">
                      {bannedUsers.map(b => (
                        <div key={b.user_id} className="flex items-center gap-3 px-4 py-3">
                          <div className={`h-8 w-8 rounded-full ${b.profiles?.color || "bg-muted"} flex items-center justify-center text-white text-xs font-semibold shrink-0`}>
                            {initials(b.profiles?.name || "?")}
                          </div>
                          <span className="text-sm text-foreground flex-1 min-w-0 truncate">
                            {b.profiles?.name || "Unknown"}
                          </span>
                          <button
                            onClick={async () => {
                              try {
                                await apiUnbanUser(activeGroup.id, b.user_id);
                                setBannedUsers(prev => prev.filter(x => x.user_id !== b.user_id));
                                toast({ title: `${b.profiles?.name || "User"} unbanned` });
                              } catch {
                                toast({ title: "Unban failed", variant: "destructive" });
                              }
                            }}
                            className="text-xs px-2.5 py-1 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
                          >
                            Unban
                          </button>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            )}

            {isOwner ? (
              <Button variant="outline" className="w-full gap-2 text-destructive border-destructive/30 hover:bg-destructive/5" onClick={deleteGroup}>
                <Trash2 className="h-4 w-4" /> Delete community
              </Button>
            ) : (
              <button onClick={() => { toggleJoin(activeGroup.id, true); setView("list"); setActiveGroup(null); }}
                className="w-full h-10 rounded-xl border border-destructive/30 text-sm text-destructive hover:bg-destructive/5 transition-colors flex items-center justify-center gap-2">
                <LogOut className="h-4 w-4" /> Leave community
              </button>
            )}
          </div>
        </div>
        {showShare && <ShareLinkModal group={activeGroup} onClose={() => setShowShare(false)} />}
      </Layout>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VIEW: Group Chat
  // ══════════════════════════════════════════════════════════════════════════
  if (view === "group" && activeGroup) {
    return (
      <Layout>
        {msgMenuId !== null && <div className="fixed inset-0 z-30" onClick={() => setMsgMenuId(null)} />}
        {showShare && <ShareLinkModal group={activeGroup} onClose={() => setShowShare(false)} />}

        <div className="flex h-[calc(100vh-4rem)] md:h-screen max-w-3xl mx-auto flex-col relative">
          {/* Header */}
          <div className="px-4 py-3 border-b border-border flex items-center gap-3 shrink-0 bg-card/80 backdrop-blur-sm">
            <button onClick={() => { setView("list"); setMsgMenuId(null); setEditingMsgId(null); }}
              className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="h-9 w-9 rounded-xl bg-muted flex items-center justify-center text-xl shrink-0 overflow-hidden">
              {activeGroup.image_url
                ? <img src={activeGroup.image_url} alt={activeGroup.name} className="w-full h-full object-cover" />
                : activeGroup.emoji}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="font-semibold text-sm text-foreground truncate">{activeGroup.name}</p>
                {activeGroup.visibility === "private" && <Lock className="h-3 w-3 text-muted-foreground shrink-0" />}
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                {activeGroup.member_count} members
                <span className={
                  "inline-block h-1.5 w-1.5 rounded-full " +
                  (wsStatus === "connected" ? "bg-emerald-500" :
                   wsStatus === "error" ? "bg-red-500 animate-pulse" :
                   "bg-yellow-400 animate-pulse")
                } title={
                  wsStatus === "connected" ? "Live" :
                  wsStatus === "error" ? "Connection error" : "Connecting…"
                } />
              </p>
            </div>
            <div className="flex items-center gap-1">
              {isAdmin && (
                <button onClick={() => setShowShare(true)}
                  className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-primary transition-colors">
                  <Link2 className="h-4 w-4" />
                </button>
              )}
              <button onClick={openSettings}
                className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
                <Settings className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto p-4">
            {!isJoined && (
              <div className="text-center py-10">
                <p className="text-sm text-muted-foreground mb-3">
                  {activeGroup.visibility === "private"
                    ? "Request to join this community to participate in conversations."
                    : "Join this community to participate in conversations."}
                </p>
                {activeGroup.visibility === "private" ? (
                  requestedIds.has(activeGroup.id) ? (
                    <Button size="sm" variant="outline"
                      className="border-emerald-500 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950 gap-1.5"
                      disabled={joiningIds.has(activeGroup.id)}
                      onClick={() => toggleJoin(activeGroup.id, false)}>
                      {joiningIds.has(activeGroup.id)
                        ? <><span className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />Cancelling…</>
                        : "Requested — Cancel Request"}
                    </Button>
                  ) : (
                    <Button size="sm"
                      className="bg-emerald-500 hover:bg-emerald-600 text-white gap-1.5"
                      disabled={joiningIds.has(activeGroup.id)}
                      onClick={() => toggleJoin(activeGroup.id, false)}>
                      {joiningIds.has(activeGroup.id)
                        ? <><span className="h-3 w-3 rounded-full border-2 border-white border-t-transparent animate-spin" />Requesting…</>
                        : "Request to Join"}
                    </Button>
                  )
                ) : (
                  <Button size="sm"
                    disabled={joiningIds.has(activeGroup.id)}
                    onClick={() => toggleJoin(activeGroup.id, false)}>
                    {joiningIds.has(activeGroup.id)
                      ? <><span className="h-3 w-3 rounded-full border-2 border-white border-t-transparent animate-spin" />Joining…</>
                      : "Join Community"}
                  </Button>
                )}
              </div>
            )}
            {isJoined && loadingMessages && (
              <div className="flex items-center justify-center py-12">
                <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              </div>
            )}
            {isJoined && !loadingMessages && messages.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-20" />
                <p className="text-sm font-medium">Welcome to {activeGroup.name}!</p>
                <p className="text-xs mt-1">Be the first to say something 👋</p>
              </div>
            )}
            {isJoined && !loadingMessages && renderMessageList()}
            <div ref={bottomRef} />
          </div>

          {/* Jump to mention button */}
          {mentionMsgIds.length > 0 && (
            <div className="absolute bottom-16 right-4 z-40">
              <button
                onClick={() => {
                  const idx = mentionJumpIdx.current % mentionMsgIds.length;
                  const id = mentionMsgIds[idx];
                  mentionJumpIdx.current++;
                  document.getElementById(`msg-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                  // Remove this mention from the list (consumed)
                  setMentionMsgIds(prev => prev.filter(x => x !== id));
                  mentionJumpIdx.current = 0;
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 text-white text-xs font-medium rounded-full shadow-lg hover:bg-emerald-600 transition-colors"
              >
                <AtSign className="h-3 w-3" />
                {mentionMsgIds.length > 1 ? `${mentionMsgIds.length} mentions` : "1 mention"} — jump
                <ChevronsDown className="h-3 w-3" />
              </button>
            </div>
          )}

          {/* @mention dropdown */}
          {mentionResults.length > 0 && (
            <div className="absolute bottom-16 left-4 right-4 z-40 bg-card border border-border rounded-xl shadow-xl overflow-hidden">
              {mentionResults.map((m, i) => (
                <button key={m.id} onMouseDown={e => { e.preventDefault(); const replaced = chatInput.replace(/@\w*$/, `@${m.name} `); setChatInput(replaced); setMentionResults([]); setMentionQuery(""); }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${i === mentionIndex ? "bg-primary/10 text-primary" : "hover:bg-muted text-foreground"}`}>
                  <div className={`h-7 w-7 rounded-full ${m.color} flex items-center justify-center text-white text-xs font-semibold shrink-0 overflow-hidden`}>
                    {m.avatarUrl ? <img src={m.avatarUrl} alt={m.name} className="w-full h-full object-cover" /> : initials(m.name)}
                  </div>
                  <span className="font-medium">{m.name}</span>
                  {(m.role === "admin" || m.role === "owner") && <Crown className="h-3 w-3 text-amber-500 ml-auto" />}
                </button>
              ))}
            </div>
          )}

          {/* Input bar — voice removed */}
          {isJoined && (
            <div className="border-t border-border shrink-0">
              <input ref={imageRef} type="file" accept="image/*" className="hidden" onChange={e => handleFileInput(e, "image")} />
              <input ref={videoRef} type="file" accept="video/*" className="hidden" onChange={e => handleFileInput(e, "video")} />
              <input ref={fileRef} type="file" className="hidden" onChange={e => handleFileInput(e, "file")} />
              <div className="p-3">
                <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-1.5">
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button type="button" onClick={() => imageRef.current?.click()}
                      className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" title="Send image">
                      <Image className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => videoRef.current?.click()}
                      className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" title="Send video">
                      <Video className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => fileRef.current?.click()}
                      className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" title="Send file">
                      <Paperclip className="h-4 w-4" />
                    </button>
                  </div>
                  <input ref={inputRef} value={chatInput}
                    onChange={e => {
                      const val = e.target.value;
                      setChatInput(val);
                      // @mention detection: find last @ segment
                      const atMatch = val.match(/@(\w*)$/);
                      if (atMatch) {
                        const q = atMatch[1].toLowerCase();
                        setMentionQuery(q);
                        setMentionResults(members.filter(m => m.id !== user.id && m.name.toLowerCase().includes(q)).slice(0, 5));
                        setMentionIndex(0);
                      } else {
                        setMentionQuery("");
                        setMentionResults([]);
                      }
                    }}
                    onKeyDown={e => {
                      if (mentionResults.length > 0) {
                        if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex(i => Math.min(i + 1, mentionResults.length - 1)); return; }
                        if (e.key === "ArrowUp") { e.preventDefault(); setMentionIndex(i => Math.max(i - 1, 0)); return; }
                        if (e.key === "Enter" || e.key === "Tab") {
                          e.preventDefault();
                          const m = mentionResults[mentionIndex];
                          const replaced = chatInput.replace(/@\w*$/, `@${m.name} `);
                          setChatInput(replaced);
                          setMentionResults([]);
                          setMentionQuery("");
                          return;
                        }
                        if (e.key === "Escape") { setMentionResults([]); setMentionQuery(""); return; }
                      }
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(chatInput); }
                    }}
                    placeholder={`Message ${activeGroup.name}…`}
                    className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none py-1" />
                  <button onClick={() => sendMessage(chatInput)} disabled={!chatInput.trim()}
                    className="h-7 w-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-30 shrink-0">
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </Layout>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VIEW: Groups List
  // ══════════════════════════════════════════════════════════════════════════
  const filtered = groups
    .filter(g => {
      const q = search.toLowerCase();
      return (!search || g.name.toLowerCase().includes(q) || g.topic.toLowerCase().includes(q))
        && (topic === "" || g.topic === topic)
        && (filter === "all" || joinedIds.has(g.id) || g.owner_id === user.id);
    })
    .sort((a, b) => b.member_count - a.member_count);

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-display text-2xl font-bold">Communities</h1>
          <div className="flex items-center gap-2">
            <button onClick={fetchGroups} title="Refresh"
              className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
              <RefreshCw className={`h-4 w-4 ${loadingGroups ? "animate-spin" : ""}`} />
            </button>
            <Button size="sm" className="gap-1.5" onClick={() => setView("create")}>
              <Plus className="h-4 w-4" /> Create Community
            </Button>
          </div>
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search communities..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 h-11" />
        </div>

        {/* Primary tabs: All / Joined */}
        <div className="flex bg-muted rounded-xl p-1 mb-4">
          <button onClick={() => setFilter("all")}
            className={`flex-1 text-sm font-medium py-1.5 rounded-lg transition-all ${filter === "all" ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            All Communities
          </button>
          <button onClick={() => setFilter("joined")}
            className={`flex-1 text-sm font-medium py-1.5 rounded-lg transition-all ${filter === "joined" ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            <span className="flex items-center justify-center gap-1.5">
              Joined ({groups.filter(g => joinedIds.has(g.id) || g.owner_id === user.id).length})
              {Object.values(unreadCounts).reduce((a, b) => a + b, 0) > 0 && (
                <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {Object.values(unreadCounts).reduce((a, b) => a + b, 0) > 99 ? "99+" : Object.values(unreadCounts).reduce((a, b) => a + b, 0)}
                </span>
              )}
            </span>
          </button>
        </div>

        {/* Secondary: topic filter pills */}
        <div className="flex gap-2 flex-wrap mb-4">
          <Badge variant={topic === "" ? "default" : "outline"} className="cursor-pointer" onClick={() => setTopic("")}>All</Badge>
          {TOPICS.map(t => (
            <Badge key={t} variant={topic === t ? "default" : "outline"} className="cursor-pointer" onClick={() => setTopic(topic === t ? "" : t)}>{t}</Badge>
          ))}
        </div>

        {loadingGroups ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-14 text-muted-foreground">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-medium mb-1">No communities found</p>
            <p className="text-xs mb-3">{filter === "joined" ? "You haven't joined any communities yet." : "Try a different search or create one."}</p>
            {filter === "joined" && <button className="text-xs text-primary hover:underline" onClick={() => setFilter("all")}>Browse all communities</button>}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(g => {
              const joined = joinedIds.has(g.id);
              const isMine = g.owner_id === user.id;
              const unread = unreadCounts[g.id] ?? 0;
              const requested = requestedIds.has(g.id);
              return (
                <div key={g.id} onClick={() => openGroup(g)}
                  className="flex flex-col rounded-2xl border border-border bg-card hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 cursor-pointer overflow-hidden group">
                  <div className="h-2 w-full bg-gradient-to-r from-primary/60 to-accent/60" />
                  <div className="flex flex-col flex-1 p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="relative">
                        <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center text-2xl group-hover:scale-110 transition-transform duration-150 overflow-hidden">
                          {g.image_url
                            ? <img src={g.image_url} alt={g.name} className="w-full h-full object-cover" />
                            : g.emoji}
                        </div>
                        {unread > 0 && (
                          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                            {unread > 99 ? "99+" : unread}
                          </span>
                        )}
                        {mentionGroupIds.has(g.id) && (
                          <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-emerald-500 text-white flex items-center justify-center" title="Unread mention">
                            <AtSign className="h-2.5 w-2.5" />
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        {g.visibility === "private" ? (
                          <span className="flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                            <Lock className="h-2.5 w-2.5" /> Private
                          </span>
                        ) : (
                          <span className="flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                            <Globe className="h-2.5 w-2.5" /> Public
                          </span>
                        )}
                        {(joined || isMine) && (
                          <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full dark:bg-emerald-950 dark:text-emerald-400">Joined</span>
                        )}
                        {requested && !joined && !isMine && (
                          <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full dark:bg-amber-950 dark:text-amber-400">Requested</span>
                        )}
                      </div>
                    </div>
                    <p className="font-semibold text-foreground mb-1 leading-snug">{g.name}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2 flex-1">{g.description}</p>
                    <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Users className="h-3 w-3" />{g.member_count.toLocaleString()}</span>
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5">{g.topic}</Badge>
                      </div>
                      <button
                        disabled={joiningIds.has(g.id)}
                        onClick={e => { e.stopPropagation(); (joined || isMine) ? openGroup(g) : toggleJoin(g.id, false, e); }}
                        className={`h-7 px-3 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed ${
                          joined || isMine ? "bg-muted text-foreground hover:bg-secondary"
                            : requested ? "bg-emerald-500 text-white hover:bg-emerald-600"
                              : g.visibility === "private" ? "bg-emerald-500 text-white hover:bg-emerald-600"
                                : "bg-primary text-primary-foreground hover:opacity-90"
                        }`}>
                        {joiningIds.has(g.id)
                          ? <><span className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />{requested ? "Cancelling…" : joined || isMine ? "Joined" : g.visibility === "private" ? "Requesting…" : "Joining…"}</>
                          : joined || isMine ? "Joined"
                          : requested ? "Requested ✕"
                          : g.visibility === "private" ? "Request to Join"
                          : "Join"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}