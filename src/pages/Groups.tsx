import { useState, useRef, useEffect, useCallback, memo } from "react";
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
  ShieldOff, UserCircle, RefreshCw,
} from "lucide-react";
import Layout from "@/components/Layout";
import { toast } from "@/hooks/use-toast";
import { useUser } from "@/context/UserContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { createNotification } from "@/lib/notifications";


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
  unsent: boolean; // true = show "This message was unsent" tombstone to everyone
  author_name: string;
  author_color: string;
};

type GroupMember = {
  id: string;
  name: string;
  color: string;
  role: "owner" | "admin" | "member";
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
};

const TOPICS = ["General", "AI", "Design", "Marketing", "Tech"];
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
        <p className="text-sm text-muted-foreground mb-3">Share this link to invite people to the group.</p>
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
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  // Chat
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [msgMenuId, setMsgMenuId] = useState<string | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editMsgText, setEditMsgText] = useState("");
  const [sending, setSending] = useState(false);
  const [wsStatus, setWsStatus] = useState<"connecting" | "connected" | "error">("connecting");

  // Create
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newBio, setNewBio] = useState("");
  const [newTopic, setNewTopic] = useState("General");
  const [newEmoji, setNewEmoji] = useState("🚀");
  const [newPrivate, setNewPrivate] = useState(false);
  const [creating, setCreating] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLInputElement>(null);
  // Profile cache: avoid re-fetching the same user's profile on every message
  const profileCache = useRef<Record<string, { name: string; color: string }>>({});

  const isOwner = activeGroup ? activeGroup.owner_id === user.id : false;
  const isJoined = activeGroup ? (joinedIds.has(activeGroup.id) || isOwner) : false;

  // ── Fetch groups + membership in parallel ────────────────────────────────
  const fetchGroups = useCallback(async () => {
    if (!user.id) return;
    setLoadingGroups(true);
    try {
      // Fetch groups first — this must succeed
      const { data: groupsData, error: groupsErr } = await (supabase as any)
        .from("groups")
        .select("*")
        .order("created_at", { ascending: false });
      if (groupsErr) throw groupsErr;
      setGroups(groupsData || []);

      // Fetch memberships separately — don't let it crash page if it fails
      try {
        const { data: memberData } = await (supabase as any)
          .from("group_members")
          .select("group_id")
          .eq("user_id", user.id);
        setJoinedIds(new Set((memberData || []).map((r: any) => r.group_id)));
      } catch (memberErr) {
        console.error("fetchGroups memberships:", memberErr);
        // Still show groups even if membership fetch fails
        setJoinedIds(new Set());
      }
    } catch (err) {
      console.error("fetchGroups:", err);
      toast({ title: "Failed to load groups", variant: "destructive" });
    } finally {
      setLoadingGroups(false);
    }
  }, [user.id]);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  // ── Fetch messages ───────────────────────────────────────────────────────
  const fetchMessages = useCallback(async (groupId: string) => {
    setLoadingMessages(true);
    setMessages([]);
    try {
      // Fetch messages and profiles in parallel - much faster than a join
      const { data: msgs, error } = await (supabase as any)
        .from("group_messages")
        .select("id, group_id, user_id, text, media_url, media_type, created_at, edited, unsent")
        .eq("group_id", groupId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      if (!msgs || msgs.length === 0) { setLoadingMessages(false); return; }

      // Get unique user ids then fetch profiles in one query
      const userIds = [...new Set(msgs.map((m: any) => m.user_id))] as string[];
      const { data: profiles } = await (supabase as any)
        .from("profiles")
        .select("id, name, color")
        .in("id", userIds);
      const profileMap: Record<string, { name: string; color: string }> = {};
      (profiles || []).forEach((p: any) => { profileMap[p.id] = { name: p.name, color: p.color }; });

      setMessages(msgs.map((row: any) => ({
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
        author_name: profileMap[row.user_id]?.name || "Unknown",
        author_color: profileMap[row.user_id]?.color || "bg-primary",
      })));
    } catch (err) {
      console.error("fetchMessages:", err);
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
        .select("id, user_id, role, profiles:user_id (name, color)", { count: "exact" })
        .eq("group_id", groupId)
        .order("joined_at", { ascending: true });
      if (error) throw error;

      setMembers((data || []).map((row: any) => ({
        id: row.user_id,
        name: row.profiles?.name || "Unknown",
        color: row.profiles?.color || "bg-primary",
        role: row.role || "member",
      })));

      // Fix member_count: use actual row count from DB
      const realCount = count ?? (data?.length ?? 0);
      setActiveGroup(prev => prev && prev.id === groupId ? { ...prev, member_count: realCount } : prev);
      setGroups(prev => prev.map(g => g.id === groupId ? { ...g, member_count: realCount } : g));

      // Sync the count in DB if it's wrong
      await (supabase as any).from("groups").update({ member_count: realCount }).eq("id", groupId);
    } catch (err) {
      console.error("fetchMembers:", err);
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
            .from("profiles").select("name, color").eq("id", uid).single();
          const p = { name: data?.name || "Unknown", color: data?.color || "bg-primary" };
          profileCache.current[uid] = p;
          return p;
        };
        if (payload.eventType === "INSERT") {
          const row = payload.new as any;
          setMessages(prev => {
            if (prev.find(m => m.id === row.id)) return prev;
            return [...prev, {
              id: row.id, group_id: row.group_id, user_id: row.user_id,
              text: row.text, media_url: row.media_url, media_type: row.media_type,
              created_at: row.created_at, edited: row.edited ?? false, deleted: false, unsent: row.unsent ?? false,
              author_name: profileCache.current[row.user_id]?.name || "…",
              author_color: profileCache.current[row.user_id]?.color || "bg-primary",
            }];
          });
          const profile = await getProfile(row.user_id);
          setMessages(prev => prev.map(m =>
            m.id === row.id ? { ...m, author_name: profile.name, author_color: profile.color } : m
          ));
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
        console.error("Realtime channel error:", err);
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
    // Fire message fetch without blocking view switch
    fetchMessages(group.id);
  };

  const openSettings = () => {
    if (!activeGroup) return;
    setShowSettings(true);
    fetchMembers(activeGroup.id);
  };

  // ── Join / Leave ─────────────────────────────────────────────────────────
  const toggleJoin = async (groupId: string, isCurrentlyJoined: boolean, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const g = groups.find(x => x.id === groupId);
    if (!g) return;
    if (!isCurrentlyJoined && g.visibility === "private") {
      toast({ title: "Private group", description: "You need an invite to join." });
      return;
    }
    // Optimistic update
    if (isCurrentlyJoined) {
      setJoinedIds(prev => { const s = new Set(prev); s.delete(groupId); return s; });
      setGroups(prev => prev.map(x => x.id === groupId ? { ...x, member_count: Math.max(0, x.member_count - 1) } : x));
    } else {
      setJoinedIds(prev => new Set([...prev, groupId]));
      setGroups(prev => prev.map(x => x.id === groupId ? { ...x, member_count: x.member_count + 1 } : x));
    }
    try {
      if (isCurrentlyJoined) {
        await supabase.from("group_members").delete().eq("group_id", groupId).eq("user_id", user.id);
        // Re-count and sync
        const { count } = await (supabase as any).from("group_members").select("*", { count: "exact", head: true }).eq("group_id", groupId);
        await (supabase as any).from("groups").update({ member_count: count ?? 0 }).eq("id", groupId);
        setGroups(prev => prev.map(x => x.id === groupId ? { ...x, member_count: count ?? 0 } : x));
        toast({ title: `Left ${g.name}` });
      } else {
        await (supabase as any).from("group_members").insert({ group_id: groupId, user_id: user.id, role: "member" });
        const { count } = await (supabase as any).from("group_members").select("*", { count: "exact", head: true }).eq("group_id", groupId);
        await (supabase as any).from("groups").update({ member_count: count ?? 1 }).eq("id", groupId);
        setGroups(prev => prev.map(x => x.id === groupId ? { ...x, member_count: count ?? x.member_count } : x));
        toast({ title: `Joined ${g.name}! 🎉` });
        // Notify group owner
        if (g.owner_id !== user.id) {
          createNotification({
            userId: g.owner_id,
            type: "group",
            text: `${user.name} joined your group "${g.name}"`,
            action: `group:${groupId}`,
            actorId: user.id,
          });
        }
      }
    } catch (err) {
      console.error(err);
      // Revert optimistic update
      fetchGroups();
      toast({ title: "Action failed", variant: "destructive" });
    }
  };

  // ── Send message ─────────────────────────────────────────────────────────
  const sendMessage = (text?: string, mediaUrl?: string, mediaType?: string) => {
    const trimmed = text?.trim();
    if ((!trimmed && !mediaUrl) || !activeGroup) return;

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
      author_name: user.name,
      author_color: user.color,
    }]);
    setChatInput("");
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    inputRef.current?.focus();

    // Fire insert in background — no await, no spinner
    (supabase as any).from("group_messages").insert({
      group_id: activeGroup.id,
      user_id: user.id,
      text: trimmed || null,
      media_url: mediaUrl || null,
      media_type: mediaType || null,
    }).then(({ error }: any) => {
      if (error) {
        console.error("Send failed:", error);
        // Remove the optimistic message
        setMessages(prev => prev.filter(m => m.id !== tempId));
        setChatInput(trimmed || "");
        toast({ title: "Failed to send", variant: "destructive" });
      }
      // Realtime INSERT event will replace tempId with real id automatically
    });
  };

  // ── File upload ──────────────────────────────────────────────────────────
  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>, type: MediaType) => {
    const file = e.target.files?.[0];
    if (!file || !activeGroup) return;
    try {
      const path = `group-media/${activeGroup.id}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("media").upload(path, file);
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("media").getPublicUrl(path);
      await sendMessage(undefined, urlData.publicUrl, type);
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
      console.error("Unsend failed:", error);
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
    try {
      await supabase.from("group_members").delete().eq("group_id", activeGroup.id).eq("user_id", memberId);
      // Re-count
      const { count } = await (supabase as any).from("group_members").select("*", { count: "exact", head: true }).eq("group_id", activeGroup.id);
      await (supabase as any).from("groups").update({ member_count: count ?? 0 }).eq("id", activeGroup.id);
      setActiveGroup(prev => prev ? { ...prev, member_count: count ?? 0 } : prev);
      setGroups(prev => prev.map(g => g.id === activeGroup.id ? { ...g, member_count: count ?? 0 } : g));
      toast({ title: `${memberName} removed` });
    } catch {
      fetchMembers(activeGroup.id); // revert
      toast({ title: "Remove failed", variant: "destructive" });
    }
  };

  // ── Admin: ban member ────────────────────────────────────────────────────
  const banMember = async (memberId: string, memberName: string) => {
    if (!activeGroup) return;
    setMembers(prev => prev.filter(m => m.id !== memberId));
    try {
      const { error } = await (supabase as any).from("group_members")
        .update({ banned: true }).eq("group_id", activeGroup.id).eq("user_id", memberId);
      if (error) {
        // Column may not exist yet — just remove
        await supabase.from("group_members").delete().eq("group_id", activeGroup.id).eq("user_id", memberId);
      }
      const { count } = await (supabase as any).from("group_members").select("*", { count: "exact", head: true }).eq("group_id", activeGroup.id);
      await (supabase as any).from("groups").update({ member_count: count ?? 0 }).eq("id", activeGroup.id);
      setActiveGroup(prev => prev ? { ...prev, member_count: count ?? 0 } : prev);
      toast({ title: `${memberName} banned` });
    } catch {
      fetchMembers(activeGroup.id);
      toast({ title: "Ban failed", variant: "destructive" });
    }
  };

  // ── Admin: delete group ──────────────────────────────────────────────────
  const deleteGroup = async () => {
    if (!activeGroup) return;
    if (!window.confirm(`Delete "${activeGroup.name}"? This cannot be undone.`)) return;
    try {
      await Promise.all([
        (supabase as any).from("group_messages").delete().eq("group_id", activeGroup.id),
        supabase.from("group_members").delete().eq("group_id", activeGroup.id),
      ]);
      await (supabase as any).from("groups").delete().eq("id", activeGroup.id);
      setGroups(prev => prev.filter(g => g.id !== activeGroup.id));
      setJoinedIds(prev => { const s = new Set(prev); s.delete(activeGroup.id); return s; });
      setView("list");
      setActiveGroup(null);
      toast({ title: "Group deleted" });
    } catch {
      toast({ title: "Delete failed", variant: "destructive" });
    }
  };

  // ── Admin: save group edit ───────────────────────────────────────────────
  const saveGroupEdit = async () => {
    if (!activeGroup) return;
    const updated = { ...activeGroup, description: editDesc, bio: editBio };
    setActiveGroup(updated);
    setGroups(prev => prev.map(g => g.id === activeGroup.id ? { ...g, description: editDesc, bio: editBio } : g));
    setEditingGroup(false);
    try {
      await (supabase as any).from("groups").update({ description: editDesc, bio: editBio }).eq("id", activeGroup.id);
      toast({ title: "Group updated ✓" });
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
      const { data, error } = await (supabase as any).from("groups").insert({
        name: newName.trim(),
        description: newDesc.trim() || "A new community.",
        bio: newBio.trim() || "Welcome to our group!",
        emoji: newEmoji,
        topic: newTopic,
        visibility: newPrivate ? "private" : "public",
        owner_id: user.id,
        member_count: 1,
      }).select().single();
      if (error) throw error;
      await (supabase as any).from("group_members").insert({ group_id: data.id, user_id: user.id, role: "owner" });
      setGroups(prev => [data, ...prev]);
      setJoinedIds(prev => new Set([...prev, data.id]));
      toast({ title: `${data.emoji} ${data.name} created!` });
      setNewName(""); setNewDesc(""); setNewBio(""); setNewTopic("General"); setNewEmoji("🚀"); setNewPrivate(false);
      openGroup(data);
    } catch (err) {
      console.error(err);
      toast({ title: "Failed to create group", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  // ── Message list ──────────────────────────────────────────────────────────
  const renderMessageList = () => {
    const els: React.ReactNode[] = [];
    let lastDate = "";

    // Show all messages including unsent tombstones; skip truly empty ones
    const visible = messages.filter(m =>
      m.unsent || m.text?.trim() || m.media_url
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

      // Tombstone — shown to everyone when a message is unsent
      if (m.unsent) {
        els.push(
          <div key={m.id} className={"flex gap-3 " + (grouped ? "mt-0.5" : "mt-4")}>
            <div className="w-9 shrink-0" />
            <p className="text-xs text-muted-foreground italic py-0.5 select-none">
              🚫 This message was unsent.
            </p>
          </div>
        );
        return;
      }

      els.push(
        <div key={m.id} className={"flex gap-3 group relative " + (grouped ? "mt-0.5" : "mt-4")}>
          {!grouped
            ? <div className={"h-9 w-9 rounded-full " + m.author_color + " flex items-center justify-center text-white text-xs font-semibold shrink-0 mt-0.5"}>{initials(m.author_name)}</div>
            : <div className="w-9 shrink-0" />
          }
          <div className="flex-1 min-w-0">
            {!grouped && (
              <div className="flex items-baseline gap-2 mb-0.5">
                <p className="text-sm font-semibold text-foreground">{m.author_name}</p>
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
                    {m.text.trim()}
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
          <h1 className="text-xl font-bold mb-6">Create a Group</h1>
          <div className="space-y-5">
            <div>
              <label className="text-sm font-medium block mb-2">Group icon</label>
              <div className="flex flex-wrap gap-2">
                {EMOJIS.map(e => (
                  <button key={e} onClick={() => setNewEmoji(e)}
                    className={`h-10 w-10 rounded-xl text-xl flex items-center justify-center transition-all ${newEmoji === e ? "bg-primary/20 ring-2 ring-primary" : "bg-muted hover:bg-secondary"}`}>
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1.5">Group name <span className="text-destructive">*</span></label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. AI Builders, Design Crew…" className="h-11" />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1.5">Short description</label>
              <Input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="One line about your group" className="h-11" />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1.5">Bio</label>
              <Textarea value={newBio} onChange={e => setNewBio(e.target.value)} placeholder="Tell people what this group is about…" rows={3} />
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
                    <p className="text-sm font-medium">{newPrivate ? "Private group" : "Public group"}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{newPrivate ? "Only invited members can join" : "Anyone can discover and join"}</p>
                  </div>
                </div>
                <Toggle checked={newPrivate} onChange={setNewPrivate} />
              </div>
            </div>
            <Button onClick={createGroup} disabled={!newName.trim() || creating} className="w-full h-11 font-semibold gap-2">
              {creating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Create Group
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
          <h2 className="text-lg font-bold mb-5">Group Settings</h2>

          <div className="space-y-3">
            {/* Group info */}
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center text-3xl">{activeGroup.emoji}</div>
                <div>
                  <p className="font-bold text-foreground">{activeGroup.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {activeGroup.visibility === "private" ? "🔒 Private" : "🌐 Public"} · {activeGroup.member_count} members
                  </p>
                  {isOwner && <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 dark:bg-amber-950 px-1.5 py-0.5 rounded-full mt-1 inline-block">Admin</span>}
                </div>
              </div>
              {editingGroup ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Description</label>
                    <Input value={editDesc} onChange={e => setEditDesc(e.target.value)} className="h-9 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Bio</label>
                    <Textarea value={editBio} onChange={e => setEditBio(e.target.value)} rows={3} className="text-sm" />
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
                      onClick={() => { setEditDesc(activeGroup.description); setEditBio(activeGroup.bio); setEditingGroup(true); }}>
                      <Edit3 className="h-3.5 w-3.5" /> Edit group info
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
              {loadingMembers ? (
                <div className="p-6 flex justify-center">
                  <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {members.map(m => (
                    <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                      <button onClick={() => navigate(`/profile/${m.id}`)}
                        className={`h-9 w-9 rounded-full ${m.color} flex items-center justify-center text-white text-xs font-semibold shrink-0 hover:opacity-80 transition-opacity`}>
                        {initials(m.name)}
                      </button>
                      <button onClick={() => navigate(`/profile/${m.id}`)}
                        className="text-sm text-foreground hover:underline flex-1 text-left min-w-0 truncate">
                        {m.name}{m.id === user.id ? " (You)" : ""}
                      </button>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {m.role === "owner" && <Crown className="h-3.5 w-3.5 text-amber-500" />}
                        {isOwner && m.id !== user.id && (
                          <>
                            <button onClick={() => navigate(`/profile/${m.id}`)} title="View profile"
                              className="h-7 w-7 rounded-lg text-muted-foreground border border-border hover:bg-muted transition-colors flex items-center justify-center">
                              <UserCircle className="h-3.5 w-3.5" />
                            </button>
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
                  ))}
                </div>
              )}
            </div>

            {isOwner && (
              <Button variant="outline" className="w-full gap-2" onClick={() => setShowShare(true)}>
                <Link2 className="h-4 w-4" /> Share invite link
              </Button>
            )}

            {isOwner ? (
              <Button variant="outline" className="w-full gap-2 text-destructive border-destructive/30 hover:bg-destructive/5" onClick={deleteGroup}>
                <Trash2 className="h-4 w-4" /> Delete group
              </Button>
            ) : (
              <button onClick={() => { toggleJoin(activeGroup.id, true); setView("list"); setActiveGroup(null); }}
                className="w-full h-10 rounded-xl border border-destructive/30 text-sm text-destructive hover:bg-destructive/5 transition-colors flex items-center justify-center gap-2">
                <LogOut className="h-4 w-4" /> Leave group
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

        <div className="flex h-[calc(100vh-4rem)] md:h-screen max-w-3xl mx-auto flex-col">
          {/* Header */}
          <div className="px-4 py-3 border-b border-border flex items-center gap-3 shrink-0 bg-card/80 backdrop-blur-sm">
            <button onClick={() => { setView("list"); setMsgMenuId(null); setEditingMsgId(null); }}
              className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="h-9 w-9 rounded-xl bg-muted flex items-center justify-center text-xl shrink-0">{activeGroup.emoji}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="font-semibold text-sm text-foreground truncate">{activeGroup.name}</p>
                {activeGroup.visibility === "private" && <Lock className="h-3 w-3 text-muted-foreground shrink-0" />}
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                {activeGroup.member_count} members{isOwner ? " · Admin" : ""}
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
              {isOwner && (
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
                <p className="text-sm text-muted-foreground mb-3">Join this group to participate in conversations.</p>
                <Button size="sm" onClick={() => toggleJoin(activeGroup.id, false)}>Join Group</Button>
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
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(chatInput); } }}
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
  const filtered = groups.filter(g => {
    const q = search.toLowerCase();
    return (!search || g.name.toLowerCase().includes(q) || g.topic.toLowerCase().includes(q))
      && (topic === "" || g.topic === topic)
      && (filter === "all" || joinedIds.has(g.id) || g.owner_id === user.id);
  });

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-display text-2xl font-bold">Groups</h1>
          <div className="flex items-center gap-2">
            <button onClick={fetchGroups} title="Refresh"
              className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
              <RefreshCw className={`h-4 w-4 ${loadingGroups ? "animate-spin" : ""}`} />
            </button>
            <Button size="sm" className="gap-1.5" onClick={() => setView("create")}>
              <Plus className="h-4 w-4" /> Create Group
            </Button>
          </div>
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search groups..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 h-11" />
        </div>

        <div className="flex gap-2 flex-wrap mb-4">
          {TOPICS.map(t => (
            <Badge key={t} variant={topic === t ? "default" : "outline"} className="cursor-pointer" onClick={() => setTopic(topic === t ? "" : t)}>{t}</Badge>
          ))}
        </div>

        <div className="flex gap-2 mb-6">
          <Badge variant={filter === "all" ? "default" : "outline"} className="cursor-pointer" onClick={() => setFilter("all")}>All Groups</Badge>
          <Badge variant={filter === "joined" ? "default" : "outline"} className="cursor-pointer" onClick={() => setFilter("joined")}>
            Joined ({groups.filter(g => joinedIds.has(g.id) || g.owner_id === user.id).length})
          </Badge>
        </div>

        {loadingGroups ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-14 text-muted-foreground">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-medium mb-1">No groups found</p>
            <p className="text-xs mb-3">{filter === "joined" ? "You haven't joined any groups yet." : "Try a different search or create one."}</p>
            {filter === "joined" && <button className="text-xs text-primary hover:underline" onClick={() => setFilter("all")}>Browse all groups</button>}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(g => {
              const joined = joinedIds.has(g.id);
              const isMine = g.owner_id === user.id;
              return (
                <div key={g.id} onClick={() => openGroup(g)}
                  className="flex flex-col rounded-2xl border border-border bg-card hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 cursor-pointer overflow-hidden group">
                  <div className="h-2 w-full bg-gradient-to-r from-primary/60 to-accent/60" />
                  <div className="flex flex-col flex-1 p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center text-2xl group-hover:scale-110 transition-transform duration-150">{g.emoji}</div>
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        {isMine && <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 dark:bg-amber-950 px-1.5 py-0.5 rounded-full">Admin</span>}
                        {g.visibility === "private" && (
                          <span className="flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                            <Lock className="h-2.5 w-2.5" /> Private
                          </span>
                        )}
                        {joined && !isMine && (
                          <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full dark:bg-emerald-950 dark:text-emerald-400">Joined</span>
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
                        onClick={e => { e.stopPropagation(); (joined || isMine) ? openGroup(g) : toggleJoin(g.id, false, e); }}
                        className={`h-7 px-3 rounded-lg text-xs font-medium transition-colors ${
                          joined || isMine ? "bg-muted text-foreground hover:bg-secondary"
                            : g.visibility === "private" ? "bg-muted text-muted-foreground cursor-default"
                              : "bg-primary text-primary-foreground hover:opacity-90"
                        }`}>
                        {joined || isMine ? "Open" : g.visibility === "private" ? "Private" : "Join"}
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