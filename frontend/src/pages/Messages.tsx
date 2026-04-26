import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { v4 as uuidv4 } from "uuid";
import VideoPlayer from "@/components/VideoPlayer";
import { useRealtimeChannel } from "@/hooks/useRealtimeChannel";
import { useDmSocket } from "@/hooks/useDmSocket";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Search, Send, ArrowLeft, Image, Video, Paperclip,
  X, Play, Pause, Mic, StopCircle, RefreshCw, Check, CheckCheck,
  BellOff, Bell, Flag, Trash2, Reply, MessageCircle, MoreHorizontal,
  Smile, Download, Maximize2,
} from "lucide-react";
import Layout from "@/components/Layout";
import { toast } from "@/hooks/use-toast";
import { useUser } from "@/context/UserContext";
import { supabase } from "@/lib/supabase";
import { useUploadQueue } from "@/context/UploadQueueContext";

// ── Types ─────────────────────────────────────────────────────────────────
type Conversation = {
  id: string;          // the other user's id
  name: string;
  avatar: string;
  avatarUrl?: string;
  color: string;
  lastMsg: string;
  lastTime: string;
  unread: number;
  role?: string;
  lastActive?: string;
};

type Message = {
  id: string;
  sender_id: string;
  text: string | null;
  media_url: string | null;
  media_type: string | null;
  created_at: string;
  read: boolean;
  reply_to_id: string | null;
  reply_to_text: string | null;
  views?: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────
function fmtTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const yest = new Date(now); yest.setDate(yest.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return d.toLocaleDateString();
}

function initials(name: string) {
  return name ? name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase() : "?";
}

function previewText(text: string | null, mediaType: string | null): string {
  if (mediaType === "shared_post") return "📌 Shared a post";
  if (mediaType === "image") return "📷 Image";
  if (mediaType === "video") return "🎥 Video";
  if (mediaType === "audio") return "🎤 Voice message";
  if (mediaType === "file") return "📎 File";
  return text || "";
}

// ── Link-aware text renderer ──────────────────────────────────────────────
function renderTextWithLinks(text: string, isMe = false) {
  const URL_RE = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(URL_RE);
  return parts.map((part, i) =>
    URL_RE.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className={`underline break-all ${isMe ? "text-white/90 decoration-white/60 hover:decoration-white" : "text-primary decoration-primary/60 hover:opacity-80"}`}
        onClick={e => e.stopPropagation()}
      >
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

// ── Chat video player — HLS-aware with fallback ───────────────────────────
function VideoPlayerInMessage({ src }: { src: string }) {
  const [hlsSrc, setHlsSrc] = useState<string | null>(null);
  const [poster, setPoster] = useState<string | null>(null);

  useEffect(() => {
    if (!src) return;
    let mounted = true;
    (async () => {
      const { data } = await (supabase as any)
        .from("videos")
        .select("hls_url, thumbnail_url")
        .eq("fallback_url", src)
        .eq("status", "ready")
        .maybeSingle();
      if (!mounted) return;
      if (data?.hls_url) setHlsSrc(data.hls_url);
      if (data?.thumbnail_url) setPoster(data.thumbnail_url);
    })();
    return () => { mounted = false; };
  }, [src]);

  return (
    <VideoPlayer
      hlsSrc={hlsSrc}
      fallbackSrc={src}
      poster={poster}
      compact
    />
  );
}

// ── Audio player ──────────────────────────────────────────────────────────
function AudioPlayer({ src, isMe }: { src: string; isMe: boolean }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.play(); setPlaying(true); }
  };
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-2xl min-w-[160px] ${isMe ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
      <audio ref={audioRef} src={src}
        onTimeUpdate={e => { const a = e.currentTarget; if (a.duration) setProgress(a.currentTime / a.duration * 100); }}
        onEnded={() => { setPlaying(false); setProgress(0); }} />
      <button onClick={toggle} className="h-7 w-7 rounded-full bg-white/20 flex items-center justify-center shrink-0">
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </button>
      <div className="flex-1 h-1 bg-white/30 rounded-full overflow-hidden">
        <div className="h-full bg-white/80 rounded-full transition-all" style={{ width: `${progress}%` }} />
      </div>
      <Mic className="h-3 w-3 opacity-60 shrink-0" />
    </div>
  );
}

// ── Voice recorder ────────────────────────────────────────────────────────
function useVoiceRecorder(onStop: (blob: Blob) => void) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = e => chunksRef.current.push(e.data);
      recorder.onstop = () => {
        onStop(new Blob(chunksRef.current, { type: "audio/webm" }));
        stream.getTracks().forEach(t => t.stop());
      };
      recorder.start();
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
    } catch {
      toast({ title: "Microphone access needed", variant: "destructive" });
    }
  };

  const stop = () => { recorderRef.current?.stop(); setRecording(false); if (timerRef.current) clearInterval(timerRef.current); };
  const cancel = () => { recorderRef.current?.stop(); chunksRef.current = []; setRecording(false); if (timerRef.current) clearInterval(timerRef.current); };
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);
  return { recording, seconds, start, stop, cancel };
}

import { createReport } from "@/api/reports";
import { hideConversation, toggleDmReaction, getDmMessageReactions } from "@/api/messages";
import { uploadPostImage, uploadVideo as apiUploadVideo } from "@/api/uploads";
import { unblockUser } from "@/api/users";
import { apiPost, apiUpload, isAbortError } from "@/api/client";

// ══════════════════════════════════════════════════════════════════════════
export default function Messages() {
  const { user } = useUser();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  // Ref kept in sync so fetchMessages callbacks read current conversations
  // without needing 'conversations' in their useCallback dep array
  const conversationsRef = useRef<Conversation[]>([]);
  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [msg, setMsg] = useState("");
  const [loadingConvos, setLoadingConvos] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [loadingOlderMsgs, setLoadingOlderMsgs] = useState(false);
  const [hasOlderMsgs, setHasOlderMsgs] = useState(false);
  const oldestMsgCursorRef = useRef<string | null>(null);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [convSearch, setConvSearch] = useState("");
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [mediaPreview, setMediaPreview] = useState<{ type: string; url: string } | null>(null);
  const uploadQueue = useUploadQueue();

  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollBehaviorRef = useRef<"smooth" | "instant">("instant");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const selectedIdRef = useRef<string | null>(null);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  const selectedConvo = conversations.find(c => c.id === selectedId) ?? null;

  // IDs of messages we inserted ourselves (optimistic → real). The realtime
  // sender INSERT handler must skip these to prevent duplicates.
  const sentMsgIdsRef = useRef<Set<string>>(new Set());

  // Track who the current user has blocked (DB-sourced)
  const [blockedByMe, setBlockedByMe] = useState<Set<string>>(new Set());
  // Track who has blocked the current user
  const [blockedByThem, setBlockedByThem] = useState<Set<string>>(new Set());
  // Track muted users (no badge/notification for their messages)
  const [mutedByMe, setMutedByMe] = useState<Set<string>>(new Set());

  // Bug 4A: refs kept in sync so realtime closures always read current values
  const blockedByMeRef = useRef<Set<string>>(new Set());
  const mutedByMeRef = useRef<Set<string>>(new Set());
  useEffect(() => { blockedByMeRef.current = blockedByMe; }, [blockedByMe]);
  useEffect(() => { mutedByMeRef.current = mutedByMe; }, [mutedByMe]);
  // Report modal state
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState("spam");
  // Delete chat confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingChat, setDeletingChat] = useState(false);
  // Target for sidebar-triggered delete (may differ from selectedId)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  // Reply-to state
  const [replyTo, setReplyTo] = useState<{ id: string; text: string } | null>(null);
  // Reactions
  type ReactionMap = Record<string, Record<string, { count: number; userIds: string[] }>>;
  const [reactions, setReactions] = useState<ReactionMap>({});
  const [reactionPickerMsgId, setReactionPickerMsgId] = useState<string | null>(null);
  const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];
  // Sidebar conversation context menu
  const [convoMenuId, setConvoMenuId] = useState<string | null>(null);

  // Socket.IO — primary realtime transport
  const [socketToken, setSocketToken] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSocketToken(data.session?.access_token ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSocketToken(session?.access_token ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Typing indicator — true when the other user is typing
  const [peerTyping, setPeerTyping] = useState(false);
  const peerTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Own typing debounce
  const myTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Socket.IO DM hook ────────────────────────────────────────────────────
  const { sendDm, startTyping: dmStartTyping, stopTyping: dmStopTyping, markRead: dmMarkRead } = useDmSocket({
    token: socketToken,
    activeDmId: selectedId,

    onMessage: useCallback((msg) => {
      // Only append if this conversation is open; otherwise bump unread
      if (msg.sender_id === selectedIdRef.current) {
        setMessages(prev => {
          if (prev.find(m => m.id === msg.id)) return prev;
          return [...prev, {
            id: msg.id, sender_id: msg.sender_id,
            text: msg.text, media_url: msg.media_url, media_type: msg.media_type,
            created_at: msg.created_at, read: false,
            reply_to_id: msg.reply_to_id, reply_to_text: msg.reply_to_text,
          }];
        });
        scrollBehaviorRef.current = "smooth";
        // Mark as read immediately since conversation is open
        dmMarkRead(msg.sender_id);
        // Unhide if this chat was hidden
        removeHiddenId(msg.sender_id);
      } else {
        setConversations(prev => {
          const exists = prev.find(c => c.id === msg.sender_id);
          if (exists) {
            return prev.map(c => c.id === msg.sender_id
              ? { ...c, unread: c.unread + 1, lastMsg: previewText(msg.text, msg.media_type), lastTime: fmtTime(msg.created_at) }
              : c
            );
          }
          // New conversation — trigger a full refresh to get profile info
          fetchConversations();
          return prev;
        });
        removeHiddenId(msg.sender_id);
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),

    onAck: useCallback((clientId, msg) => {
      // Replace temp UUID with real DB id
      setMessages(prev => prev.map(m =>
        m.id === clientId ? { ...m, id: msg.id, created_at: msg.created_at } : m
      ));
      // Update conversation sidebar with latest message
      setConversations(prev => prev.map(c =>
        c.id === msg.receiver_id
          ? { ...c, lastMsg: previewText(msg.text, msg.media_type), lastTime: fmtTime(msg.created_at) }
          : c
      ));
    }, []),

    onUpdated: useCallback((payload) => {
      // Receiver: replace temp UUID with real DB id
      setMessages(prev => prev.map(m =>
        m.id === payload.id ? { ...m, id: payload.new_id } : m
      ));
    }, []),

    onRead: useCallback(() => {
      // Mark all my sent messages in this conversation as read
      setMessages(prev => prev.map(m =>
        m.sender_id === user.id ? { ...m, read: true } : m
      ));
    }, [user.id]),

    onTypingStart: useCallback(() => {
      setPeerTyping(true);
      // Auto-clear after 4s in case stop event is missed
      if (peerTypingTimerRef.current) clearTimeout(peerTypingTimerRef.current);
      peerTypingTimerRef.current = setTimeout(() => {
        setPeerTyping(false);
        peerTypingTimerRef.current = null;
      }, 4000);
    }, []),

    onTypingStop: useCallback(() => {
      if (peerTypingTimerRef.current) { clearTimeout(peerTypingTimerRef.current); peerTypingTimerRef.current = null; }
      setPeerTyping(false);
    }, []),
  });

  // Load both block directions + mutes on mount
  useEffect(() => {
    if (!user.id) return;
    Promise.all([
      (supabase as any).from("blocks").select("blocked_id").eq("blocker_id", user.id),
      (supabase as any).from("blocks").select("blocker_id").eq("blocked_id", user.id),
      (supabase as any).from("mutes").select("muted_id").eq("muter_id", user.id),
    ]).then(([myRes, themRes, mutesRes]) => {
      setBlockedByMe(new Set((myRes.data || []).map((b: any) => b.blocked_id)));
      setBlockedByThem(new Set((themRes.data || []).map((b: any) => b.blocker_id)));
      setMutedByMe(new Set((mutesRes.data || []).map((m: any) => m.muted_id)));
    }).catch(() => {});
  }, [user.id]);

  const iBlockedThem = useMemo(() => selectedId ? blockedByMe.has(selectedId) : false, [selectedId, blockedByMe]);
  const theyBlockedMe = useMemo(() => selectedId ? blockedByThem.has(selectedId) : false, [selectedId, blockedByThem]);
  const isBlocked = iBlockedThem || theyBlockedMe;
  const isMuted = useMemo(() => selectedId ? mutedByMe.has(selectedId) : false, [selectedId, mutedByMe]);

  const handleUnblockHere = async () => {
    if (!selectedId) return;
    try {
      await unblockUser(selectedId);
      setBlockedByMe(prev => { const n = new Set(prev); n.delete(selectedId); return n; });
      toast({ title: "User unblocked" });
    } catch { /* ignore */ }
  };

  const handleToggleMute = async () => {
    if (!selectedId) return;
    try {
      if (isMuted) {
        await apiPost(`/api/users/me/mute/${selectedId}/remove`).catch(() => {});
        setMutedByMe(prev => { const n = new Set(prev); n.delete(selectedId); return n; });
        toast({ title: "Unmuted" });
      } else {
        await apiPost(`/api/users/me/mute/${selectedId}`).catch(() => {});
        setMutedByMe(prev => new Set([...prev, selectedId]));
        toast({ title: "Muted — you won't get message notifications from this user" });
      }
    } catch { /* ignore */ }
  };

  const handleReport = async () => {
    if (!selectedId) return;
    try {
      await createReport({ targetId: selectedId, targetType: "user", reason: reportReason });
      setShowReportModal(false);
      toast({ title: "Report submitted", description: "Thank you — our team will review it." });
    } catch {
      toast({ title: "Failed to submit report", variant: "destructive" });
    }
  };

  // ── Helpers for persisting deleted chats across refreshes ──────────────
  const HIDDEN_KEY = `hidden_chats_${user.id}`;
  const getHiddenIds = (): Set<string> => {
    try { return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || "[]")); }
    catch { return new Set(); }
  };
  const addHiddenId = (otherId: string) => {
    const ids = getHiddenIds();
    ids.add(otherId);
    localStorage.setItem(HIDDEN_KEY, JSON.stringify([...ids]));
  };
  const removeHiddenId = (otherId: string) => {
    const ids = getHiddenIds();
    ids.delete(otherId);
    localStorage.setItem(HIDDEN_KEY, JSON.stringify([...ids]));
  };

  const handleDeleteChat = async () => {
    const targetId = deleteTargetId ?? selectedId;
    if (!targetId) return;
    setDeletingChat(true);
    try {
      // Only hide the conversation on this user's side — do NOT delete messages
      // from the DB (the other person should still see everything).
      addHiddenId(targetId);
      hideConversation(targetId).catch(() => {});
      setConversations(prev => prev.filter(c => c.id !== targetId));
      // Only clear the chat view if we deleted the currently open conversation
      if (selectedId === targetId) {
        setMessages([]);
        setSelectedId(null);
        setShowMobileChat(false);
      }
      setShowDeleteConfirm(false);
      setDeleteTargetId(null);
      toast({ title: "Chat hidden" });
    } catch (err: any) {
      if (!isAbortError(err)) toast({ title: "Failed to delete chat", description: err.message, variant: "destructive" });
    } finally {
      setDeletingChat(false);
    }
  };

  // ── Fetch conversations ──────────────────────────────────────────────
  const fetchConversations = useCallback(async () => {
    if (!user.id) return;
    setLoadingConvos(true);
    try {
      // Fetch enough rows to surface one message per unique conversation partner.
      // 100 rows covers up to 100 distinct conversations — payload drops from
      // ~60 KB (old 300-row limit) to ~20 KB.
      const { data, error } = await (supabase as any)
        .from("messages")
        .select("id, sender_id, receiver_id, text, media_type, created_at, read")
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;

      // Build conversation list — one entry per unique other user
      const seen = new Set<string>();
      const convMap: Record<string, Conversation> = {};

      for (const m of (data || [])) {
        const otherId = m.sender_id === user.id ? m.receiver_id : m.sender_id;
        if (seen.has(otherId)) continue;
        seen.add(otherId);
        convMap[otherId] = {
          id: otherId,
          name: "Loading…",
          avatar: "?",
          color: "bg-primary",
          lastMsg: previewText(m.text, m.media_type),
          lastTime: fmtTime(m.created_at),
          unread: 0,
        };
      }

      // Count unread per conversation
      for (const m of (data || [])) {
        if (m.receiver_id === user.id && !m.read) {
          const otherId = m.sender_id;
          if (convMap[otherId]) convMap[otherId].unread++;
        }
      }

      const convList = Object.values(convMap);

      // Fetch profiles + ?with= lookup in parallel
      const params = new URLSearchParams(window.location.search);
      const withId = params.get("with");
      const needWithProfile = withId && !convList.find(c => c.id === withId);

      const [profilesRes, withProfileRes] = await Promise.all([
        convList.length > 0
          ? (supabase as any).from("profiles").select("id, name, avatar_url, color, role, last_active").in("id", convList.map(c => c.id))
          : Promise.resolve({ data: [] }),
        needWithProfile
          ? (supabase as any).from("profiles").select("name, avatar_url, color, last_active").eq("id", withId).single()
          : Promise.resolve({ data: null }),
      ]);

      const profileMap: Record<string, any> = {};
      (profilesRes.data || []).forEach((p: any) => { profileMap[p.id] = p; });
      convList.forEach(c => {
        const p = profileMap[c.id];
        if (p) { c.name = p.name; c.avatar = initials(p.name); c.avatarUrl = p.avatar_url || undefined; c.color = p.color || "bg-primary"; c.role = p.role || "user"; c.lastActive = p.last_active || undefined; }
      });

      // Fetch block state to anonymize blocked conversations
      let myBlockedIds = new Set<string>();
      let blockedByIds = new Set<string>();
      try {
        const [myB, theirB] = await Promise.all([
          (supabase as any).from("blocks").select("blocked_id").eq("blocker_id", user.id),
          (supabase as any).from("blocks").select("blocker_id").eq("blocked_id", user.id),
        ]);
        myBlockedIds = new Set((myB.data || []).map((b: any) => b.blocked_id));
        blockedByIds = new Set((theirB.data || []).map((b: any) => b.blocker_id));
        setBlockedByMe(myBlockedIds);
        setBlockedByThem(blockedByIds);
      } catch { /* ignore — show all convos */ }

      // Only anonymize convos where THEY blocked ME (blocked user's view)
      // Blocker (A) still sees real name/avatar of the person they blocked
      convList.forEach(c => {
        if (blockedByIds.has(c.id)) {
          c.name = "Prolifier User";
          c.avatar = "?";
          c.avatarUrl = undefined;
          c.color = "bg-muted";
        }
      });

      // Filter out conversations the user has deleted — localStorage is the
      // primary source (always works); DB table is best-effort bonus.
      const hiddenIds = getHiddenIds();
      try {
        const { data: hiddenData } = await (supabase as any)
          .from("hidden_conversations")
          .select("other_id")
          .eq("user_id", user.id);
        (hiddenData || []).forEach((h: any) => hiddenIds.add(h.other_id));
      } catch { /* table may not exist — localStorage already covers this */ }

      setConversations(convList.filter(c => !hiddenIds.has(c.id)));

      if (withId) {
        // If not in list yet, add a placeholder so it can be selected
        if (!convList.find(c => c.id === withId)) {
          const { data: profileData } = withProfileRes;
          const p = profileData || {};
          const name = p.name || "User";
          convList.push({
            id: withId, name, avatar: name.split(" ").map((w: string) => w[0]).slice(0,2).join("").toUpperCase(),
            avatarUrl: p.avatar_url || undefined,
            color: p.color || "bg-primary", lastMsg: "Start a conversation…", lastTime: "now", unread: 0,
            lastActive: p.last_active || undefined,
          });
          setConversations([...convList]);
        }
        setSelectedId(withId);
        setShowMobileChat(true);
        // fetch messages for this convo
        setLoadingMsgs(true);
        const { data: msgs } = await (supabase as any)
          .from("messages")
          .select("id, sender_id, text, media_url, media_type, created_at, read")
          .or(`and(sender_id.eq.${user.id},receiver_id.eq.${withId}),and(sender_id.eq.${withId},receiver_id.eq.${user.id})`)
          .order("created_at", { ascending: false })
          .limit(MSG_PAGE);
        const withMsgs: Message[] = (msgs || []).reverse();
        setMessages(withMsgs);
        if (withMsgs.length === MSG_PAGE) {
          setHasOlderMsgs(true);
          oldestMsgCursorRef.current = withMsgs[0].created_at;
        }
        setLoadingMsgs(false);
        await (supabase as any).from("messages")
          .update({ read: true })
          .eq("sender_id", withId).eq("receiver_id", user.id).eq("read", false);

      }
    } catch (err) {
      if (import.meta.env.DEV) console.error("fetchConversations:", err);
    } finally {
      setLoadingConvos(false);
    }
  }, [user.id]);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  // Pre-fill message input when navigating with ?msg= param (e.g. from collab interest).
  // Runs whenever selectedId becomes set AND a ?msg= param exists in the URL.
  // Using searchParams from useSearchParams() (reactive) is more reliable than
  // reading window.location.search inside the async fetchConversations body.
  useEffect(() => {
    if (!selectedId) return;
    const preMsg = searchParams.get("msg");
    if (!preMsg) return;
    setMsg(decodeURIComponent(preMsg));
    // Clean the URL so refreshing doesn't re-fill
    window.history.replaceState({}, "", `/messages?with=${selectedId}`);
  }, [selectedId, searchParams]);

  const MSG_PAGE = 50;

  // ── Fetch messages for selected conversation (paginated) ──────────────
  const fetchMessages = useCallback(async (otherId: string) => {
    if (!user.id) return;
    setLoadingMsgs(true);
    setMessages([]);
    oldestMsgCursorRef.current = null;
    setHasOlderMsgs(false);
    try {
      // Fetch the 50 most recent messages — descending then reverse in state
      const { data, error } = await (supabase as any)
        .from("messages")
        .select("id, sender_id, text, media_url, media_type, created_at, read")
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${user.id})`)
        .order("created_at", { ascending: false })
        .limit(MSG_PAGE);
      if (error) throw error;

      const rows: Message[] = (data || []).reverse();
      scrollBehaviorRef.current = "instant";
      setMessages(rows);
      setReactions({});
      if (rows.length > 0) {
        getDmMessageReactions(rows.map(m => m.id))
          .then(res => { if (res.success && res.data) setReactions(res.data); })
          .catch(() => {});
      }

      if (rows.length === MSG_PAGE) {
        setHasOlderMsgs(true);
        oldestMsgCursorRef.current = rows[0].created_at;
      }

      // Mark received messages as read + clear message notification badge
      await Promise.all([
        (supabase as any).from("messages")
          .update({ read: true })
          .eq("sender_id", otherId)
          .eq("receiver_id", user.id)
          .eq("read", false),
        // Mark message notifications from this sender as read so sidebar badge decrements
        (supabase as any).from("notifications")
          .update({ read: true })
          .eq("user_id", user.id)
          .eq("type", "message")
          .eq("actor_id", otherId)
          .eq("read", false),
      ]);

      // Clear per-conversation unread badge in sidebar
      setConversations(prev => prev.map(c => c.id === otherId ? { ...c, unread: 0 } : c));

      // Use ref (always current) to check if any other convo still has unread
      const hasAnyUnread = conversationsRef.current.some(c => c.id !== otherId && c.unread > 0);
      if (!hasAnyUnread) {
        window.dispatchEvent(new Event("prolifier:messages-all-read"));
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error("fetchMessages:", err);
    } finally {
      setLoadingMsgs(false);
    }
  }, [user.id]);

  // ── Load older messages (cursor-based, prepend to top) ────────────────
  const fetchOlderMessages = useCallback(async (otherId: string) => {
    if (!user.id || !oldestMsgCursorRef.current || loadingOlderMsgs) return;
    setLoadingOlderMsgs(true);
    try {
      const { data, error } = await (supabase as any)
        .from("messages")
        .select("id, sender_id, text, media_url, media_type, created_at, read")
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${user.id})`)
        .lt("created_at", oldestMsgCursorRef.current)
        .order("created_at", { ascending: false })
        .limit(MSG_PAGE);
      if (error) throw error;

      const older: Message[] = (data || []).reverse();
      setMessages(prev => [...older, ...prev]);

      if (older.length === MSG_PAGE) {
        oldestMsgCursorRef.current = older[0].created_at;
      } else {
        setHasOlderMsgs(false);
        oldestMsgCursorRef.current = null;
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error("fetchOlderMessages:", err);
    } finally {
      setLoadingOlderMsgs(false);
    }
  }, [user.id, loadingOlderMsgs]);

  // ── Supabase Realtime — fallback consistency layer ───────────────────
  // Socket.IO is the primary path. Supabase CDC fires after DB insert and
  // catches any messages that arrived while the socket was temporarily
  // disconnected or before the socket connection was established.
  useRealtimeChannel(
    user.id ? `dm-${user.id}` : null,
    ch => ch
      // Fallback: messages sent TO current user that Socket.IO may have missed
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "messages",
        filter: `receiver_id=eq.${user.id}`,
      }, (payload) => {
        const row = payload.new as any;
        // Drop if blocked
        if (blockedByMeRef.current.has(row.sender_id)) return;
        const senderMuted = mutedByMeRef.current.has(row.sender_id);
        removeHiddenId(row.sender_id);
        (supabase as any).from("hidden_conversations")
          .delete().eq("user_id", user.id).eq("other_id", row.sender_id)
          .then(() => {});
        if (row.sender_id === selectedIdRef.current) {
          setMessages(prev => {
            // Already delivered by Socket.IO — skip
            if (prev.find(m => m.id === row.id)) return prev;
            scrollBehaviorRef.current = "smooth";
            return [...prev, {
              id: row.id, sender_id: row.sender_id, text: row.text,
              media_url: row.media_url, media_type: row.media_type,
              created_at: row.created_at, read: false,
              reply_to_id: row.reply_to_id || null,
              reply_to_text: row.reply_to_text || null,
            }];
          });
        } else {
          setConversations(prev => prev.map(c =>
            c.id === row.sender_id
              ? { ...c, unread: senderMuted ? c.unread : c.unread + 1, lastMsg: previewText(row.text, row.media_type), lastTime: fmtTime(row.created_at) }
              : c
          ));
          if (!conversations.find(c => c.id === row.sender_id)) fetchConversations();
        }
      })
      // Read receipts: messages sent BY current user that recipient marked read
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "messages",
        filter: `sender_id=eq.${user.id}`,
      }, (payload) => {
        const row = payload.new as any;
        if (row.read) setMessages(prev => prev.map(m => m.id === row.id ? { ...m, read: true } : m));
      }),
  );

  useEffect(() => {
    // Double-rAF: first frame commits layout, second frame scrolls after paint
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: scrollBehaviorRef.current });
      });
    });
    return () => cancelAnimationFrame(id);
  }, [messages]);

  // ── Select conversation ──────────────────────────────────────────────
  const selectConvo = (otherId: string) => {
    setSelectedId(otherId);
    setShowMobileChat(true);
    setReplyTo(null);
    setPeerTyping(false);
    fetchMessages(otherId);
    // Tell server to mark DB rows + notify the other user via socket
    dmMarkRead(otherId);
    setTimeout(() => inputRef.current?.focus(), 150);
  };

  // ── Send message — primary path: Socket.IO ───────────────────────────
  // Server persists, broadcasts to receiver, acks sender with real DB id.
  const sendMessage = (text?: string, mediaUrl?: string, mediaType?: string) => {
    const trimmed = text?.trim();
    if ((!trimmed && !mediaUrl) || !selectedId) return;
    if (trimmed && trimmed.length > 1500) {
      toast({ title: "Message exceeds maximum character limit", variant: "destructive" });
      return;
    }
    // Block check uses in-memory state — no DB round-trip
    if (blockedByMe.has(selectedId) || blockedByThem.has(selectedId)) return;

    // Stop own typing indicator
    if (myTypingTimerRef.current) { clearTimeout(myTypingTimerRef.current); myTypingTimerRef.current = null; }
    dmStopTyping(selectedId);

    const replySnapshot = replyTo ? { replyToId: replyTo.id, replyToText: replyTo.text } : { replyToId: null, replyToText: null };
    const clientId = uuidv4();
    const optimistic: Message = {
      id: clientId, sender_id: user.id, text: trimmed || null,
      media_url: mediaUrl || null, media_type: mediaType || null,
      created_at: new Date().toISOString(), read: false,
      reply_to_id: replySnapshot.replyToId,
      reply_to_text: replySnapshot.replyToText,
    };

    scrollBehaviorRef.current = "smooth";
    setMessages(prev => [...prev, optimistic]);
    setMsg("");
    setReplyTo(null);
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    setTimeout(() => inputRef.current?.focus(), 30);

    // Fire via Socket.IO — server handles DB insert, notification, and ack
    sendDm({
      clientId,
      receiverId: selectedId,
      text: trimmed || null,
      mediaUrl: mediaUrl || null,
      mediaType: mediaType || null,
      ...replySnapshot,
    });
  };

  // ── File upload — instant preview, background upload ────────────────
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>, type: "image" | "video" | "file") => {
    const file = e.target.files?.[0];
    if (!file || !selectedId) return;
    e.target.value = "";

    const blobUrl = type !== "file" ? URL.createObjectURL(file) : null;
    const clientId = uuidv4();
    const convName = conversations.find(c => c.id === selectedId)?.name ?? "chat";
    const jobId = uploadQueue.addJob(`${type === "image" ? "Photo" : type === "video" ? "Video" : "File"} to ${convName}`);

    // Show message immediately with blob preview
    if (blobUrl) {
      scrollBehaviorRef.current = "smooth";
      setMessages(prev => [...prev, {
        id: clientId, sender_id: user.id,
        text: type === "file" ? file.name : null,
        media_url: blobUrl, media_type: type,
        created_at: new Date().toISOString(), read: false,
        reply_to_id: null, reply_to_text: null,
      }]);
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }

    // Upload in background — IIFE so component unmount doesn't matter
    (async () => {
      try {
        let realUrl: string;
        if (type === "image") {
          const { url } = await uploadPostImage(file, "chat", pct => uploadQueue.updateJob(jobId, { progress: pct }));
          realUrl = url;
        } else if (type === "video") {
          const result = await apiUploadVideo(file, "chat", pct => uploadQueue.updateJob(jobId, { progress: pct }));
          realUrl = result.fallbackUrl;
        } else {
          uploadQueue.updateJob(jobId, { progress: 30 });
          const form = new FormData();
          form.append("file", file);
          const data = await apiUpload<{ url: string }>("/api/uploads/file", form);
          realUrl = data.url;
          uploadQueue.updateJob(jobId, { progress: 90 });
        }

        if (blobUrl) {
          URL.revokeObjectURL(blobUrl);
          setMessages(prev => prev.map(m => m.id === clientId ? { ...m, media_url: realUrl } : m));
        }

        // Now send via socket with real URL
        const replySnapshot = replyTo ? { replyToId: replyTo.id, replyToText: replyTo.text } : { replyToId: null, replyToText: null };
        sendDm({
          clientId,
          receiverId: selectedId!,
          text: type === "file" ? file.name : null,
          mediaUrl: realUrl,
          mediaType: type,
          ...replySnapshot,
        });

        uploadQueue.updateJob(jobId, { status: "done", progress: 100 });
      } catch (err: any) {
        if (blobUrl) {
          URL.revokeObjectURL(blobUrl);
          setMessages(prev => prev.filter(m => m.id !== clientId));
        }
        uploadQueue.updateJob(jobId, { status: "failed" });
        toast({ title: err.message || "Upload failed, try again.", variant: "destructive" });
      }
    })();
  };

  // ── Voice recorder ───────────────────────────────────────────────────
  const { recording, seconds, start: startRec, stop: stopRec, cancel: cancelRec } = useVoiceRecorder(
    async (blob) => {
      if (!selectedId) return;
      setUploading(true);
      try {
        const form = new FormData();
        form.append("file", new File([blob], `voice-${Date.now()}.webm`, { type: "audio/webm" }));
        const data = await apiUpload<{ url: string }>("/api/uploads/file", form);
        await sendMessage(undefined, data.url, "audio");
      } catch {
        toast({ title: "Voice upload failed", variant: "destructive" });
      } finally {
        setUploading(false);
      }
    }
  );

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const filteredConvos = conversations.filter(c => !convSearch || c.name.toLowerCase().includes(convSearch.toLowerCase()));

  // Get a short label for quoting a message
  const quoteLabel = (m: Message): string => {
    if (m.media_type === "image") return "📷 Image";
    if (m.media_type === "video") return "🎥 Video";
    if (m.media_type === "audio") return "🎤 Voice message";
    if (m.media_type === "file") return `📎 ${m.text || "File"}`;
    if (m.media_type === "shared_post") return "📌 Shared post";
    return m.text?.slice(0, 80) || "";
  };

  const downloadFile = async (url: string, filename: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename || "file";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch {
      toast({ title: "Download failed", variant: "destructive" });
    }
  };

  // ── DM reaction handler ───────────────────────────────────────────────────
  const handleReaction = async (msgId: string, emoji: string) => {
    setReactionPickerMsgId(null);
    const msgReactions = reactions[msgId] ?? {};
    const alreadyReacted = msgReactions[emoji]?.userIds.includes(user.id) ?? false;
    const existingEmoji = Object.entries(msgReactions).find(
      ([e, data]) => e !== emoji && data.userIds.includes(user.id)
    )?.[0];

    // Optimistic update
    setReactions(prev => {
      const msg = { ...(prev[msgId] ?? {}) };
      if (existingEmoji) {
        const ids = (msg[existingEmoji]?.userIds ?? []).filter(id => id !== user.id);
        if (ids.length === 0) delete msg[existingEmoji];
        else msg[existingEmoji] = { count: ids.length, userIds: ids };
      }
      if (alreadyReacted) {
        const ids = (msg[emoji]?.userIds ?? []).filter(id => id !== user.id);
        if (ids.length === 0) delete msg[emoji];
        else msg[emoji] = { count: ids.length, userIds: ids };
      } else {
        const ids = msg[emoji]?.userIds ?? [];
        msg[emoji] = { count: ids.length + 1, userIds: [...ids, user.id] };
      }
      return { ...prev, [msgId]: msg };
    });

    try {
      await toggleDmReaction(msgId, emoji);
    } catch {
      // Revert on failure
      getDmMessageReactions([msgId])
        .then(res => { if (res.success && res.data) setReactions(prev => ({ ...prev, ...res.data })); })
        .catch(() => {});
    }
  };

  // ── Timestamp + tick row ──────────────────────────────────────────────────
  const Meta = ({ m, isMe }: { m: Message; isMe: boolean }) => (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"flex-end", gap:3,
      padding:"2px 10px 6px", fontSize:11, color: isMe ? "rgba(255,255,255,.65)" : "rgba(0,0,0,.4)", whiteSpace:"nowrap" }}>
      <span>{fmtTime(m.created_at)}</span>
      {isMe && (m.read
        ? <CheckCheck style={{ width:14, height:14 }} />
        : <Check style={{ width:14, height:14, opacity:.6 }} />)}
    </div>
  );

  const renderMessage = (m: Message) => {
    const isMe = m.sender_id === user.id;
    const onReply = () => { setReplyTo({ id: m.id, text: quoteLabel(m) }); setTimeout(() => inputRef.current?.focus(), 50); };

    // Bubble colors — solid primary for sent, muted for received
    const SENT_BG  = "hsl(var(--primary))";
    const RECV_BG  = "hsl(var(--muted))";
    const bgColor  = isMe ? SENT_BG : RECV_BG;
    const textColor = isMe ? "hsl(var(--primary-foreground))" : "hsl(var(--foreground))";

    // Uniform rounded corners — no tail, no directional pointer
    const radius = "18px";

    // Shared bubble style
    const textBubble: React.CSSProperties = {
      position: "relative",
      maxWidth: 320,
      background: bgColor,
      color: textColor,
      borderRadius: radius,
      overflow: "hidden",
    };

    // Reply-quote strip inside a bubble
    const ReplyStrip = ({ isMe: me }: { isMe: boolean }) => m.reply_to_text ? (
      <div style={{ margin:"8px 10px 0", padding:"6px 8px", borderRadius:8,
        borderLeft:`3px solid hsl(var(--primary))`,
        background: "hsl(var(--background) / 0.5)" }}>
        <p style={{ fontSize:10, fontWeight:700, textTransform:"uppercase",
          color:"hsl(var(--primary))", marginBottom:2 }}>
          {me ? "You replied" : "Reply"}
        </p>
        <p style={{ fontSize:12, opacity:.7, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
          {m.reply_to_text}
        </p>
      </div>
    ) : null;

    const replyBtn = (flip = false) => (
      <button onClick={onReply}
        className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground
          opacity-0 group-hover:opacity-100 hover:bg-muted/80 transition-all shrink-0 self-end mb-1">
        <Reply className={`h-3.5 w-3.5 ${flip ? "scale-x-[-1]" : ""}`} />
      </button>
    );

    const reactionBtn = (
      <button
        onClick={e => { e.stopPropagation(); setReactionPickerMsgId(reactionPickerMsgId === m.id ? null : m.id); }}
        className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground
          opacity-0 group-hover:opacity-100 hover:bg-muted/80 transition-all shrink-0 self-end mb-1">
        <Smile className="h-3.5 w-3.5" />
      </button>
    );

    const rowCls = `group flex items-end gap-1 ${isMe ? "justify-end" : "justify-start"}`;

    // Reaction picker + pills — shared for all message types
    const ReactionPicker = () => reactionPickerMsgId === m.id ? (
      <div
        className={`absolute ${isMe ? "right-0" : "left-0"} bottom-full mb-1 z-50 bg-card border border-border rounded-2xl shadow-xl px-2 py-1.5 flex gap-1`}
        onClick={e => e.stopPropagation()}>
        {QUICK_EMOJIS.map(emoji => (
          <button key={emoji} onClick={() => handleReaction(m.id, emoji)}
            className="text-lg hover:scale-125 transition-transform px-0.5">
            {emoji}
          </button>
        ))}
      </div>
    ) : null;

    const ReactionPills = () => reactions[m.id] && Object.keys(reactions[m.id]).length > 0 ? (
      <div className={`flex flex-wrap gap-1 mt-1 ${isMe ? "justify-end" : "justify-start"}`}>
        {Object.entries(reactions[m.id]).map(([emoji, { count, userIds }]) => (
          <button key={emoji} onClick={() => handleReaction(m.id, emoji)}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors ${
              userIds.includes(user.id)
                ? "bg-primary/10 border-primary/40 text-primary"
                : "bg-card border-border text-foreground hover:bg-muted"
            }`}>
            <span>{emoji}</span>
            {count > 1 && <span className="font-medium">{count}</span>}
          </button>
        ))}
      </div>
    ) : null;

    // ── Shared post card ──────────────────────────────────────────────────
    if (m.media_type === "shared_post" && m.text) {
      let share: any = null;
      try { share = JSON.parse(m.text); } catch { /* fallback */ }
      if (share) {
        const link = share.type === "post" && share.id ? `/feed?post=${share.id}`
          : share.type === "collab" && share.id ? `/feed?tab=collabs&collab=${share.id}` : "/feed";
        return (
          <div key={m.id} className={rowCls}>
            {!isMe && replyBtn()}
            {!isMe && reactionBtn}
            <div className="relative" style={{ maxWidth:300 }}>
              <ReactionPicker />
              <div style={{ ...textBubble, cursor:"pointer" }} onClick={() => navigate(link)}>
                {share.image && <img src={share.image} alt="preview" style={{ display:"block", width:"100%", height:"auto" }} loading="lazy" />}
                <div style={{ padding:"10px 12px 4px" }}>
                  <p style={{ fontSize:10, fontWeight:700, opacity:.6, textTransform:"uppercase", letterSpacing:".05em", marginBottom:3 }}>
                    {share.type === "collab" ? "🤝 Shared Collab" : "📌 Shared Post"}
                  </p>
                  {share.title && <p style={{ fontSize:14, fontWeight:600, lineHeight:1.35, marginBottom:4 }}>{share.title}</p>}
                  {share.caption && <p style={{ fontSize:12, opacity:.7, lineHeight:1.4, display:"-webkit-box", WebkitLineClamp:3, overflow:"hidden", WebkitBoxOrient:"vertical" as any, marginBottom:4 }}>{share.caption}</p>}
                  <p style={{ fontSize:11, opacity:.7, fontWeight:600 }}>Tap to view →</p>
                </div>
                <Meta m={m} isMe={isMe} />
              </div>
              <ReactionPills />
            </div>
            {isMe && reactionBtn}
            {isMe && replyBtn(true)}
          </div>
        );
      }
    }

    // ── Image message ─────────────────────────────────────────────────────
    if (m.media_type === "image" && m.media_url) {
      return (
        <div key={m.id} className={rowCls}>
          {!isMe && replyBtn()}
          {!isMe && reactionBtn}
          <div className="relative" style={{ maxWidth:300, borderRadius:radius, overflow:"hidden", background:bgColor }}>
            <ReactionPicker />
            <ReplyStrip isMe={isMe} />
            <img
              src={m.media_url}
              alt="image"
              style={{ display:"block", width:"100%", height:"auto", cursor:"pointer",
                marginTop: m.reply_to_text ? 6 : 0 }}
              loading="lazy"
              onClick={() => setMediaPreview({ type:"image", url:m.media_url! })}
            />
            {m.text && (
              <div style={{ padding:"6px 12px 2px", fontSize:14, lineHeight:1.4,
                whiteSpace:"pre-wrap", wordBreak:"break-word", color:textColor }}>
                {renderTextWithLinks(m.text, isMe)}
              </div>
            )}
            <Meta m={m} isMe={isMe} />
            <ReactionPills />
          </div>
          {isMe && reactionBtn}
          {isMe && replyBtn(true)}
        </div>
      );
    }

    // ── Text / video / file / audio ───────────────────────────────────────
    return (
      <div key={m.id} className={rowCls}>
        {!isMe && replyBtn()}
        {!isMe && reactionBtn}
        <div className="relative" style={{ maxWidth:300 }}>
          <ReactionPicker />

          {m.text && (!m.media_type || m.media_type === "text") && (
            <div style={textBubble}>
              <ReplyStrip isMe={isMe} />
              <div style={{ padding: m.reply_to_text ? "8px 12px 2px" : "10px 12px 2px",
                fontSize:15, lineHeight:1.45, whiteSpace:"pre-wrap", wordBreak:"break-word" }}>
                {renderTextWithLinks(m.text, isMe)}
              </div>
              <Meta m={m} isMe={isMe} />
            </div>
          )}

          {m.media_type === "video" && m.media_url && (
            <div style={textBubble}>
              <ReplyStrip isMe={isMe} />
              <div className="relative group/vid" style={{ marginTop: m.reply_to_text ? 8 : 0 }}>
                <video
                  src={m.media_url}
                  controls
                  controlsList="nodownload noplaybackrate nopictureinpicture nofullscreen"
                  disablePictureInPicture
                  className="block w-full bg-black"
                />
                <button
                  onClick={() => setMediaPreview({ type:"video", url:m.media_url! })}
                  className="absolute top-2 left-2 h-7 w-7 rounded-full bg-black/50 hover:bg-black/75 flex items-center justify-center text-white opacity-0 group-hover/vid:opacity-100 transition-opacity z-10"
                  title="Fullscreen">
                  <Maximize2 className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={async e => {
                    e.stopPropagation();
                    await downloadFile(m.media_url!, "video.mp4");
                  }}
                  className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white opacity-0 group-hover/vid:opacity-100 transition-opacity z-10"
                  title="Save video">
                  <Download className="h-3.5 w-3.5" />
                </button>
              </div>
              <Meta m={m} isMe={isMe} />
            </div>
          )}

          {m.media_type === "file" && m.media_url && (
            <div style={textBubble}>
              <ReplyStrip isMe={isMe} />
              <button onClick={() => downloadFile(m.media_url!, m.text || "file")}
                style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 14px 4px",
                  fontSize:14, width:"100%", cursor:"pointer", background:"none", border:"none", color:"inherit" }}>
                <div style={{ width:36, height:36, borderRadius:10, background:"hsl(var(--primary) / 0.15)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  <Paperclip style={{ width:16, height:16 }} />
                </div>
                <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontSize:13, fontWeight:500 }}>{m.text || "File"}</span>
              </button>
              <Meta m={m} isMe={isMe} />
            </div>
          )}

          {m.media_type === "audio" && m.media_url && (
            <div style={textBubble}>
              <div style={{ padding:"8px 10px 4px" }}>
                <AudioPlayer src={m.media_url} isMe={isMe} />
              </div>
              <Meta m={m} isMe={isMe} />
            </div>
          )}

          <ReactionPills />
        </div>
        {isMe && reactionBtn}
        {isMe && replyBtn(true)}
      </div>
    );
  };

  return (
    <Layout>
      <input ref={imageRef} type="file" accept="image/*" className="hidden" onChange={e => handleFileInput(e, "image")} />
      <input ref={videoRef} type="file" accept="video/mp4,video/quicktime,.mp4,.mov" className="hidden" onChange={e => handleFileInput(e, "video")} />
      <input ref={fileRef} type="file" className="hidden" onChange={e => handleFileInput(e, "file")} />

      <div className="max-w-4xl mx-auto flex h-[calc(100vh-4rem)] md:h-screen">

        {/* ── Sidebar ── */}
        <div className={`${showMobileChat ? "hidden" : "flex"} md:flex w-full md:w-80 border-r border-border flex-col`}>
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between mb-3">
              <h1 className="text-xl font-bold">Messages</h1>
              <button onClick={fetchConversations} className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
                <RefreshCw className={`h-4 w-4 ${loadingConvos ? "animate-spin" : ""}`} />
              </button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search…" value={convSearch} onChange={e => setConvSearch(e.target.value)} className="pl-10 h-9 text-sm" />
            </div>
          </div>

          {/* Conversation list */}
          {(convoMenuId !== null) && <div className="fixed inset-0 z-30" onClick={() => setConvoMenuId(null)} />}
          <div className="flex-1 overflow-y-auto">
            {loadingConvos ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              </div>
            ) : filteredConvos.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p className="text-sm font-medium mb-1">No conversations yet</p>
                <p className="text-xs">Message someone from their profile or a collab</p>
              </div>
            ) : filteredConvos.map(c => (
              <div key={c.id}
                className={`relative group flex items-center border-b border-border/50 transition-colors ${selectedId === c.id ? "bg-muted" : "hover:bg-muted/60"}`}>
                <button onClick={() => selectConvo(c.id)}
                  className="flex items-center gap-3 flex-1 min-w-0 px-4 py-3.5 text-left">
                  <div className="relative shrink-0">
                    <div className={`h-10 w-10 rounded-full ${c.avatarUrl ? "" : c.color} flex items-center justify-center text-white text-sm font-semibold overflow-hidden`}>
                      {c.avatarUrl ? <img src={c.avatarUrl} alt={c.avatar} className="w-full h-full object-cover" /> : c.avatar}
                    </div>
                    {c.unread > 0 && <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-accent text-accent-foreground text-[9px] font-bold flex items-center justify-center border-2 border-background">{c.unread}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className={`inline-flex items-center gap-1 text-sm truncate ${c.unread > 0 ? "font-semibold" : "font-medium"}`}>
                        {c.name}
                        {c.role === "admin" && (
                          <span title="Verified" className="shrink-0 h-3.5 w-3.5 rounded-full bg-blue-500 inline-flex items-center justify-center">
                            <Check className="h-2 w-2 text-white stroke-[3]" />
                          </span>
                        )}
                      </p>
                      <span className="text-xs text-muted-foreground shrink-0 ml-2">{c.lastTime}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{c.lastMsg}</p>
                  </div>
                </button>
                {/* 3-dot menu — visible on hover */}
                <div className="relative pr-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={e => { e.stopPropagation(); setConvoMenuId(convoMenuId === c.id ? null : c.id); }}
                    className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                  {convoMenuId === c.id && (
                    <div className="absolute right-0 top-full mt-0.5 z-50 bg-card border border-border rounded-xl shadow-lg min-w-[170px] py-1 overflow-hidden">
                      <button
                        onClick={e => { e.stopPropagation(); setConvoMenuId(null); setDeleteTargetId(c.id); setShowDeleteConfirm(true); }}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-rose-500 hover:bg-muted/80 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete conversation
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Chat panel ── */}
        <div className={`${showMobileChat ? "flex" : "hidden"} md:flex flex-1 flex-col`}>
          {!selectedConvo ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <MessageCircle className="h-8 w-8 mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium mb-1">No conversation selected</p>
                <p className="text-xs">Message someone from their profile or a collab</p>
              </div>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="p-4 border-b border-border flex items-center gap-3 shrink-0 bg-card/80 backdrop-blur-sm">
                <button className="md:hidden text-muted-foreground hover:text-foreground" onClick={() => setShowMobileChat(false)}>
                  <ArrowLeft className="h-5 w-5" />
                </button>
                {/* Clickable profile area — disabled when anonymized */}
                <button
                  className="flex items-center gap-3 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity disabled:opacity-100 disabled:cursor-default"
                  onClick={() => !theyBlockedMe && navigate(`/profile/${selectedId}`)}
                  disabled={theyBlockedMe}
                >
                  {/* Anonymize avatar only when THEY blocked ME (blocked user's view) */}
                  <div className={`h-9 w-9 rounded-full ${theyBlockedMe ? "bg-muted" : (selectedConvo.avatarUrl ? "" : selectedConvo.color)} flex items-center justify-center text-xs font-semibold shrink-0 overflow-hidden`}>
                    {theyBlockedMe
                      ? <span className="text-muted-foreground text-lg">?</span>
                      : selectedConvo.avatarUrl
                        ? <img src={selectedConvo.avatarUrl} alt={selectedConvo.avatar} className="w-full h-full object-cover" />
                        : <span className="text-white">{selectedConvo.avatar}</span>}
                  </div>
                  <div className="min-w-0">
                    <p className="inline-flex items-center gap-1 font-semibold text-sm text-foreground truncate">
                      {theyBlockedMe ? "Prolifier User" : selectedConvo.name}
                      {!theyBlockedMe && selectedConvo.role === "admin" && (
                        <span title="Verified" className="shrink-0 h-4 w-4 rounded-full bg-blue-500 inline-flex items-center justify-center">
                          <Check className="h-2.5 w-2.5 text-white stroke-[3]" />
                        </span>
                      )}
                    </p>
                    {peerTyping ? (
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <span className="flex gap-0.5 items-end">
                          <span className="h-1 w-1 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0ms" }} />
                          <span className="h-1 w-1 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "150ms" }} />
                          <span className="h-1 w-1 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "300ms" }} />
                        </span>
                        typing…
                      </p>
                    ) : !theyBlockedMe && (() => {
                      const la = selectedConvo.lastActive;
                      if (!la) return null;
                      const diffMs = Date.now() - new Date(la).getTime();
                      const diffDays = diffMs / (1000 * 60 * 60 * 24);
                      if (diffDays < 1) return <p className="text-xs text-emerald-500">Active today</p>;
                      if (diffDays < 7) return <p className="text-xs text-muted-foreground">Active this week</p>;
                      return null;
                    })()}
                  </div>
                </button>
                {/* Mute and Report buttons — hidden when anonymized */}
                {!theyBlockedMe && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={handleToggleMute}
                      title={isMuted ? "Unmute notifications" : "Mute notifications"}
                      className={`h-8 w-8 rounded-full flex items-center justify-center transition-colors ${isMuted ? "text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/30" : "text-muted-foreground hover:bg-muted"}`}
                    >
                      {isMuted ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={() => setShowReportModal(true)}
                      title="Report user"
                      className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-rose-500 transition-colors"
                    >
                      <Flag className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {loadingMsgs ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <p className="text-sm font-medium mb-1">No messages yet</p>
                    <p className="text-xs">Say hi to {selectedConvo.name}! 👋</p>
                  </div>
                ) : (
                  <>
                    {hasOlderMsgs && (
                      <div className="flex justify-center pb-2">
                        <button
                          onClick={() => selectedId && fetchOlderMessages(selectedId)}
                          disabled={loadingOlderMsgs}
                          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border hover:bg-muted transition-colors disabled:opacity-50"
                        >
                          {loadingOlderMsgs
                            ? <><div className="h-3 w-3 rounded-full border-2 border-primary border-t-transparent animate-spin" /> Loading…</>
                            : "Load older messages"}
                        </button>
                      </div>
                    )}
                    {messages.map(renderMessage)}
                  </>
                )}
                <div ref={bottomRef} />
              </div>

              {/* Voice recording bar */}
              {recording && !isBlocked && (
                <div className="px-4 py-3 border-t border-border bg-rose-50/60 dark:bg-rose-950/20 flex items-center gap-3">
                  <div className="flex items-center gap-[3px] shrink-0">
                    {[1,2,3,4,5].map(i => (
                      <div key={i} className="w-[3px] rounded-full bg-rose-500"
                        style={{ height: `${8 + (i % 3) * 6}px`, animation: `pulse ${0.6 + i * 0.15}s ease-in-out infinite alternate` }} />
                    ))}
                  </div>
                  <style>{`@keyframes pulse { from { transform: scaleY(0.4); } to { transform: scaleY(1.2); } }`}</style>
                  <span className="text-sm font-semibold text-rose-600 tabular-nums">{fmt(seconds)}</span>
                  <span className="text-xs text-rose-400 flex-1">Recording…</span>
                  <button onClick={cancelRec} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 rounded hover:bg-muted transition-colors">
                    <X className="h-3.5 w-3.5" /> Cancel
                  </button>
                  <button onClick={stopRec} className="h-8 px-3 rounded-lg bg-rose-500 text-white text-xs font-semibold flex items-center gap-1.5 hover:bg-rose-600 transition-colors">
                    <StopCircle className="h-3.5 w-3.5" /> Send
                  </button>
                </div>
              )}

              {/* Blocked banners — no input shown when any block is active */}
              {iBlockedThem && (
                <div className="p-4 border-t border-border shrink-0 flex items-center justify-center gap-3 bg-muted/40">
                  <p className="text-sm text-muted-foreground">You have blocked this user.</p>
                  <button onClick={handleUnblockHere} className="text-sm text-primary font-semibold hover:opacity-75 transition-opacity">Unblock</button>
                </div>
              )}
              {theyBlockedMe && (
                <div className="p-4 border-t border-border shrink-0 flex items-center justify-center bg-muted/40">
                  <p className="text-sm text-muted-foreground">You can't reply to this conversation.</p>
                </div>
              )}

              {/* Reply preview bar */}
              {replyTo && !isBlocked && (
                <div className="px-4 py-2 border-t border-border bg-muted/40 flex items-center gap-2 shrink-0">
                  <Reply className="h-3.5 w-3.5 text-primary shrink-0" />
                  <p className="flex-1 text-xs text-muted-foreground truncate">
                    <span className="font-medium text-foreground">Replying: </span>{replyTo.text}
                  </p>
                  <button onClick={() => setReplyTo(null)} className="h-5 w-5 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}


              {/* Input bar */}
              {!recording && !isBlocked && (
                <div className="p-3 border-t border-border shrink-0">
                  <div className="flex items-center gap-2 bg-muted rounded-2xl px-3 py-1.5">
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => imageRef.current?.click()}
                        className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-40" title="Image">
                        <Image className="h-4 w-4" />
                      </button>
                      <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => videoRef.current?.click()}
                        className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-40" title="Video">
                        <Video className="h-4 w-4" />
                      </button>
                      <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => fileRef.current?.click()}
                        className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-40" title="File">
                        <Paperclip className="h-4 w-4" />
                      </button>
                      <button type="button" disabled={uploading} onMouseDown={e => e.preventDefault()} onClick={startRec}
                        className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-rose-500 hover:bg-rose-50 transition-colors disabled:opacity-40" title="Voice message">
                        <Mic className="h-4 w-4" />
                      </button>
                    </div>
                    <textarea ref={inputRef} value={msg}
                      rows={1}
                      onChange={e => {
                        setMsg(e.target.value);
                        // Auto-resize up to ~120px
                        e.target.style.height = "auto";
                        e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                        // Typing indicator — emit start, debounce stop after 3s
                        if (selectedId && e.target.value.length > 0) {
                          dmStartTyping(selectedId);
                          if (myTypingTimerRef.current) clearTimeout(myTypingTimerRef.current);
                          myTypingTimerRef.current = setTimeout(() => {
                            dmStopTyping(selectedId);
                            myTypingTimerRef.current = null;
                          }, 3000);
                        } else if (selectedId && e.target.value.length === 0) {
                          if (myTypingTimerRef.current) { clearTimeout(myTypingTimerRef.current); myTypingTimerRef.current = null; }
                          dmStopTyping(selectedId);
                        }
                      }}
                      onKeyDown={e => {
                        // Enter sends; Shift+Enter inserts a newline
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          sendMessage(msg);
                          // Reset height after send
                          e.currentTarget.style.height = "auto";
                        }
                      }}
                      placeholder={uploading ? "Uploading…" : `Message ${selectedConvo.name}…`}
                      disabled={uploading}
                      className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none min-w-0 py-1 disabled:opacity-50 resize-none overflow-hidden leading-5" />
                    <button type="button" onClick={() => sendMessage(msg)} disabled={!msg.trim() || uploading || msg.trim().length > 1500}
                      className="h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-30 shrink-0">
                      <Send className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Reaction picker backdrop */}
      {reactionPickerMsgId !== null && (
        <div className="fixed inset-0 z-40" onClick={() => setReactionPickerMsgId(null)} />
      )}

      {/* Report modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowReportModal(false)}>
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-bold mb-1">Report user</h2>
            <p className="text-sm text-muted-foreground mb-4">Select a reason and we'll review this account.</p>
            <div className="space-y-2 mb-5">
              {["spam", "harassment", "inappropriate content", "fake account", "other"].map(r => (
                <label key={r} className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="radio"
                    name="report-reason"
                    value={r}
                    checked={reportReason === r}
                    onChange={() => setReportReason(r)}
                    className="accent-primary"
                  />
                  <span className="text-sm capitalize text-foreground">{r}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowReportModal(false)} className="flex-1 h-9 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
                Cancel
              </button>
              <button onClick={handleReport} className="flex-1 h-9 rounded-lg bg-rose-500 text-white text-sm font-semibold hover:bg-rose-600 transition-colors">
                Submit report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete chat confirmation */}
      {showDeleteConfirm && (() => {
        const targetName = (conversations.find(c => c.id === (deleteTargetId ?? selectedId)) ?? selectedConvo)?.name;
        return (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => { setShowDeleteConfirm(false); setDeleteTargetId(null); }}>
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-full bg-rose-100 dark:bg-rose-950/40 flex items-center justify-center shrink-0">
                <Trash2 className="h-5 w-5 text-rose-500" />
              </div>
              <div>
                <h2 className="text-base font-bold text-foreground">Delete chat?</h2>
                <p className="text-xs text-muted-foreground">With {targetName}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-5">
              This will hide the conversation from your inbox. The other person's messages won't be affected. The chat will reappear if they send you a new message.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => { setShowDeleteConfirm(false); setDeleteTargetId(null); }}
                className="flex-1 h-9 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteChat}
                disabled={deletingChat}
                className="flex-1 h-9 rounded-lg bg-rose-500 text-white text-sm font-semibold hover:bg-rose-600 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {deletingChat
                  ? <><div className="h-3.5 w-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" /> Deleting…</>
                  : "Delete chat"}
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Lightbox */}
      {mediaPreview && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setMediaPreview(null)}>
          <button className="absolute top-4 right-4 h-9 w-9 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20" onClick={() => setMediaPreview(null)}>
            <X className="h-5 w-5" />
          </button>
          {mediaPreview.type === "image" && <img src={mediaPreview.url} alt="full" className="max-w-full max-h-full rounded-xl object-contain" onClick={e => e.stopPropagation()} />}
          {mediaPreview.type === "video" && (
            <>
              <video src={mediaPreview.url} controls autoPlay disablePictureInPicture
                controlsList="nodownload nopictureinpicture noplaybackrate"
                className="max-w-[95vw] max-h-[90vh] rounded-xl" onClick={e => e.stopPropagation()} />
              <button onClick={async e => { e.stopPropagation(); const blob = await fetch(mediaPreview!.url).then(r => r.blob()); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "video.mp4"; a.click(); URL.revokeObjectURL(a.href); }}
                className="absolute top-4 right-16 h-9 w-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors z-10">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              </button>
            </>
          )}
        </div>
      )}
    </Layout>
  );
}