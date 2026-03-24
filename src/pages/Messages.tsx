import { useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Search, Send, ArrowLeft, Image, Video, Paperclip,
  X, Play, Pause, PenSquare, Mic, StopCircle, RefreshCw, Check, CheckCheck,
} from "lucide-react";
import Layout from "@/components/Layout";
import { toast } from "@/hooks/use-toast";
import { useUser } from "@/context/UserContext";
import { supabase } from "@/lib/supabase";

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
};

type Message = {
  id: string;
  sender_id: string;
  text: string | null;
  media_url: string | null;
  media_type: string | null;
  created_at: string;
  read: boolean;
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

import { createNotification } from "@/lib/notifications";

// ══════════════════════════════════════════════════════════════════════════
export default function Messages() {
  const { user } = useUser();
  const [searchParams] = useSearchParams();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [msg, setMsg] = useState("");
  const [loadingConvos, setLoadingConvos] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sending, setSending] = useState(false);
  const [convSearch, setConvSearch] = useState("");
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [mediaPreview, setMediaPreview] = useState<{ type: string; url: string } | null>(null);
  const [showNewConvo, setShowNewConvo] = useState(false);
  const [newConvoSearch, setNewConvoSearch] = useState("");
  const [allUsers, setAllUsers] = useState<{ id: string; name: string; avatarUrl?: string; color: string }[]>([]);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const selectedConvo = conversations.find(c => c.id === selectedId) ?? null;

  // ── Fetch conversations ──────────────────────────────────────────────
  const fetchConversations = useCallback(async () => {
    if (!user.id) return;
    setLoadingConvos(true);
    try {
      // Get recent messages involving current user (capped to prevent large payloads)
      const { data, error } = await (supabase as any)
        .from("messages")
        .select("id, sender_id, receiver_id, text, media_type, created_at, read")
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order("created_at", { ascending: false })
        .limit(300);
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
          lastMsg: m.text || (m.media_type ? `[${m.media_type}]` : ""),
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
          ? (supabase as any).from("profiles").select("id, name, avatar_url, color").in("id", convList.map(c => c.id))
          : Promise.resolve({ data: [] }),
        needWithProfile
          ? (supabase as any).from("profiles").select("name, avatar_url, color").eq("id", withId).single()
          : Promise.resolve({ data: null }),
      ]);

      const profileMap: Record<string, any> = {};
      (profilesRes.data || []).forEach((p: any) => { profileMap[p.id] = p; });
      convList.forEach(c => {
        const p = profileMap[c.id];
        if (p) { c.name = p.name; c.avatar = initials(p.name); c.avatarUrl = p.avatar_url || undefined; c.color = p.color || "bg-primary"; }
      });

      setConversations(convList);

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
          .order("created_at", { ascending: true });
        setMessages((msgs || []).map((m: any) => ({ ...m, deleted: false })));
        setLoadingMsgs(false);
        await (supabase as any).from("messages")
          .update({ read: true })
          .eq("sender_id", withId).eq("receiver_id", user.id).eq("read", false);
      }
    } catch (err) {
      console.error("fetchConversations:", err);
    } finally {
      setLoadingConvos(false);
    }
  }, [user.id]);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);



  // ── Fetch messages for selected conversation ─────────────────────────
  const fetchMessages = useCallback(async (otherId: string) => {
    if (!user.id) return;
    setLoadingMsgs(true);
    setMessages([]);
    try {
      const { data, error } = await (supabase as any)
        .from("messages")
        .select("id, sender_id, text, media_url, media_type, created_at, read")
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${user.id})`)
        .order("created_at", { ascending: true });
      if (error) throw error;
      setMessages(data || []);

      // Mark received messages as read
      await (supabase as any).from("messages")
        .update({ read: true })
        .eq("sender_id", otherId)
        .eq("receiver_id", user.id)
        .eq("read", false);

      // Clear unread count in local state
      setConversations(prev => prev.map(c => c.id === otherId ? { ...c, unread: 0 } : c));
    } catch (err) {
      console.error("fetchMessages:", err);
    } finally {
      setLoadingMsgs(false);
    }
  }, [user.id]);

  // ── Realtime for incoming messages + read receipts ───────────────────
  useEffect(() => {
    if (!user.id) return;
    const channel = supabase
      .channel(`dm-${user.id}`)
      // New messages sent TO current user
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `receiver_id=eq.${user.id}`,
      }, async (payload) => {
        const row = payload.new as any;
        if (row.sender_id === selectedId) {
          setMessages(prev => [...prev, {
            id: row.id, sender_id: row.sender_id, text: row.text,
            media_url: row.media_url, media_type: row.media_type,
            created_at: row.created_at, read: false,
          }]);
          // Mark as read immediately since the chat is open
          await (supabase as any).from("messages").update({ read: true }).eq("id", row.id);
        } else {
          setConversations(prev => prev.map(c =>
            c.id === row.sender_id ? { ...c, unread: c.unread + 1, lastMsg: row.text || "", lastTime: fmtTime(row.created_at) } : c
          ));
          if (!conversations.find(c => c.id === row.sender_id)) {
            fetchConversations();
          }
        }
      })
      // Read receipts: messages sent BY current user that the recipient marked read
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "messages",
        filter: `sender_id=eq.${user.id}`,
      }, (payload) => {
        const row = payload.new as any;
        if (row.read) {
          setMessages(prev => prev.map(m => m.id === row.id ? { ...m, read: true } : m));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, selectedId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // ── Select conversation ──────────────────────────────────────────────
  const selectConvo = (otherId: string) => {
    setSelectedId(otherId);
    setShowMobileChat(true);
    fetchMessages(otherId);
    setTimeout(() => inputRef.current?.focus(), 150);
  };

  // ── Send message ─────────────────────────────────────────────────────
  const sendMessage = async (text?: string, mediaUrl?: string, mediaType?: string) => {
    const trimmed = text?.trim();
    if ((!trimmed && !mediaUrl) || !selectedId || sending) return;
    setSending(true);

    // Optimistic
    const tempId = `tmp-${Date.now()}`;
    const optimistic: Message = {
      id: tempId, sender_id: user.id, text: trimmed || null,
      media_url: mediaUrl || null, media_type: mediaType || null,
      created_at: new Date().toISOString(), read: false,
    };
    setMessages(prev => [...prev, optimistic]);
    setMsg("");
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });

    const { data, error } = await (supabase as any).from("messages").insert({
      sender_id: user.id,
      receiver_id: selectedId,
      text: trimmed || null,
      media_url: mediaUrl || null,
      media_type: mediaType || null,
    }).select().single();

    if (error) {
      console.error("Send failed:", error);
      setMessages(prev => prev.filter(m => m.id !== tempId));
      setMsg(trimmed || "");
      toast({ title: "Failed to send", variant: "destructive" });
    } else {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...optimistic, id: data.id, created_at: data.created_at } : m));
      setConversations(prev => prev.map(c => c.id === selectedId
        ? { ...c, lastMsg: trimmed || `[${mediaType}]`, lastTime: "now" } : c
      ));
      // Notify recipient
      createNotification({
        userId: selectedId,
        type: "message",
        text: `${user.name} sent you a message`,
        subtext: trimmed?.slice(0, 60),
        action: `message:${user.id}`,
      });
    }
    setSending(false);
    setTimeout(() => inputRef.current?.focus(), 30);
  };

  // ── File upload ──────────────────────────────────────────────────────
  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>, type: "image" | "video" | "file") => {
    const file = e.target.files?.[0];
    if (!file || !selectedId) return;
    try {
      const path = `dm/${user.id}/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("media").upload(path, file);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("media").getPublicUrl(path);
      await sendMessage(undefined, urlData.publicUrl, type);
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    }
    e.target.value = "";
  };

  // ── Voice recorder ───────────────────────────────────────────────────
  const { recording, seconds, start: startRec, stop: stopRec, cancel: cancelRec } = useVoiceRecorder(
    async (blob) => {
      if (!selectedId) return;
      const path = `dm/${user.id}/${Date.now()}.webm`;
      const { error } = await supabase.storage.from("media").upload(path, blob);
      if (error) { toast({ title: "Voice upload failed", variant: "destructive" }); return; }
      const { data: urlData } = supabase.storage.from("media").getPublicUrl(path);
      await sendMessage(undefined, urlData.publicUrl, "audio");
    }
  );

  // ── Fetch all users for new conversation ─────────────────────────────
  const fetchAllUsers = async () => {
    if (allUsers.length > 0) return;
    const { data } = await (supabase as any).from("profiles")
      .select("id, name, avatar_url, color")
      .neq("id", user.id)
      .limit(50);
    setAllUsers((data || []).map((p: any) => ({ id: p.id, name: p.name, avatarUrl: p.avatar_url || undefined, color: p.color || "bg-primary" })));
  };

  const startNewConvo = (u: typeof allUsers[0]) => {
    const existing = conversations.find(c => c.id === u.id);
    if (!existing) {
      setConversations(prev => [{
        id: u.id, name: u.name, avatar: initials(u.name),
        avatarUrl: u.avatarUrl,
        color: u.color, lastMsg: "Start a conversation…", lastTime: "now", unread: 0,
      }, ...prev]);
    }
    setShowNewConvo(false);
    setNewConvoSearch("");
    selectConvo(u.id);
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const filteredConvos = conversations.filter(c => !convSearch || c.name.toLowerCase().includes(convSearch.toLowerCase()));
  const filteredNewUsers = allUsers.filter(u =>
    !conversations.find(c => c.id === u.id) &&
    (!newConvoSearch || u.name.toLowerCase().includes(newConvoSearch.toLowerCase()))
  );

  const renderMessage = (m: Message) => {
    const isMe = m.sender_id === user.id;
    return (
      <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
        <div className="flex flex-col gap-0.5 max-w-[75%]">
          {m.text && (
            <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${isMe ? "bg-primary text-primary-foreground rounded-br-md" : "bg-secondary text-secondary-foreground rounded-bl-md"}`}>
              {m.text}
            </div>
          )}
          {m.media_type === "image" && m.media_url && (
            <div className="rounded-2xl overflow-hidden cursor-pointer" onClick={() => setMediaPreview({ type: "image", url: m.media_url! })}>
              <img src={m.media_url} alt="shared" className="max-w-full max-h-56 object-cover" loading="lazy" />
            </div>
          )}
          {m.media_type === "video" && m.media_url && (
            <video src={m.media_url} controls className="max-w-full max-h-56 rounded-2xl bg-black" />
          )}
          {m.media_type === "file" && m.media_url && (
            <a href={m.media_url} download className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm ${isMe ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
              <Paperclip className="h-4 w-4 shrink-0" /><span className="truncate max-w-[180px]">File</span>
            </a>
          )}
          {m.media_type === "audio" && m.media_url && <AudioPlayer src={m.media_url} isMe={isMe} />}
          <div className={`flex items-center gap-1 ${isMe ? "justify-end" : "justify-start"}`}>
            <span className="text-xs text-muted-foreground">{fmtTime(m.created_at)}</span>
            {isMe && (m.read
              ? <CheckCheck className="h-3 w-3 text-primary" />
              : <Check className="h-3 w-3 text-muted-foreground" />
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <Layout>
      <input ref={imageRef} type="file" accept="image/*" className="hidden" onChange={e => handleFileInput(e, "image")} />
      <input ref={videoRef} type="file" accept="video/*" className="hidden" onChange={e => handleFileInput(e, "video")} />
      <input ref={fileRef} type="file" className="hidden" onChange={e => handleFileInput(e, "file")} />

      <div className="max-w-4xl mx-auto flex h-[calc(100vh-4rem)] md:h-screen">

        {/* ── Sidebar ── */}
        <div className={`${showMobileChat ? "hidden" : "flex"} md:flex w-full md:w-80 border-r border-border flex-col`}>
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between mb-3">
              <h1 className="text-xl font-bold">Messages</h1>
              <div className="flex items-center gap-1">
                <button onClick={fetchConversations} className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
                  <RefreshCw className={`h-4 w-4 ${loadingConvos ? "animate-spin" : ""}`} />
                </button>
                <button onClick={() => { setShowNewConvo(v => !v); fetchAllUsers(); }}
                  className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors" title="New message">
                  <PenSquare className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search…" value={convSearch} onChange={e => setConvSearch(e.target.value)} className="pl-10 h-9 text-sm" />
            </div>
          </div>

          {/* New convo panel */}
          {showNewConvo && (
            <div className="border-b border-border bg-muted/40 p-3">
              <p className="text-xs font-semibold text-muted-foreground mb-2">New conversation</p>
              <Input placeholder="Search people…" value={newConvoSearch}
                onChange={e => setNewConvoSearch(e.target.value)}
                className="h-8 text-sm mb-2" autoFocus />
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {filteredNewUsers.length === 0
                  ? <p className="text-xs text-muted-foreground text-center py-2">No users found</p>
                  : filteredNewUsers.map(u => (
                    <button key={u.id} onClick={() => startNewConvo(u)}
                      className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-muted transition-colors text-left">
                      <div className={`h-7 w-7 rounded-full ${u.avatarUrl ? "" : u.color} flex items-center justify-center text-white text-xs font-semibold shrink-0 overflow-hidden`}>
                        {u.avatarUrl ? <img src={u.avatarUrl} alt={initials(u.name)} className="w-full h-full object-cover" /> : initials(u.name)}
                      </div>
                      <span className="text-sm text-foreground">{u.name}</span>
                    </button>
                  ))
                }
              </div>
            </div>
          )}

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto">
            {loadingConvos ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              </div>
            ) : filteredConvos.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p className="text-sm font-medium mb-1">No conversations yet</p>
                <p className="text-xs">Use the pencil icon to start one</p>
              </div>
            ) : filteredConvos.map(c => (
              <button key={c.id} onClick={() => selectConvo(c.id)}
                className={`w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted transition-colors border-b border-border/50 ${selectedId === c.id ? "bg-muted" : ""}`}>
                <div className="relative shrink-0">
                  <div className={`h-10 w-10 rounded-full ${c.avatarUrl ? "" : c.color} flex items-center justify-center text-white text-sm font-semibold overflow-hidden`}>
                    {c.avatarUrl ? <img src={c.avatarUrl} alt={c.avatar} className="w-full h-full object-cover" /> : c.avatar}
                  </div>
                  {c.unread > 0 && <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-accent text-accent-foreground text-[9px] font-bold flex items-center justify-center border-2 border-background">{c.unread}</span>}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center justify-between">
                    <p className={`text-sm truncate ${c.unread > 0 ? "font-semibold" : "font-medium"}`}>{c.name}</p>
                    <span className="text-xs text-muted-foreground shrink-0 ml-2">{c.lastTime}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{c.lastMsg}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ── Chat panel ── */}
        <div className={`${showMobileChat ? "flex" : "hidden"} md:flex flex-1 flex-col`}>
          {!selectedConvo ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <PenSquare className="h-8 w-8 mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium mb-1">No conversation selected</p>
                <p className="text-xs">Pick one or start a new one</p>
              </div>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="p-4 border-b border-border flex items-center gap-3 shrink-0 bg-card/80 backdrop-blur-sm">
                <button className="md:hidden text-muted-foreground hover:text-foreground" onClick={() => setShowMobileChat(false)}>
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <div className={`h-9 w-9 rounded-full ${selectedConvo.avatarUrl ? "" : selectedConvo.color} flex items-center justify-center text-white text-xs font-semibold shrink-0 overflow-hidden`}>
                  {selectedConvo.avatarUrl
                    ? <img src={selectedConvo.avatarUrl} alt={selectedConvo.avatar} className="w-full h-full object-cover" />
                    : selectedConvo.avatar}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-foreground truncate">{selectedConvo.name}</p>
                  <p className="text-xs text-muted-foreground">Active recently</p>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {loadingMsgs ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <p className="text-sm font-medium mb-1">No messages yet</p>
                    <p className="text-xs">Say hi to {selectedConvo.name}! 👋</p>
                  </div>
                ) : messages.map(renderMessage)}
                <div ref={bottomRef} />
              </div>

              {/* Voice recording bar */}
              {recording && (
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

              {/* Input bar */}
              {!recording && (
                <div className="p-3 border-t border-border shrink-0">
                  <div className="flex items-center gap-2 bg-muted rounded-2xl px-3 py-1.5">
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => imageRef.current?.click()}
                        className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" title="Image">
                        <Image className="h-4 w-4" />
                      </button>
                      <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => videoRef.current?.click()}
                        className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" title="Video">
                        <Video className="h-4 w-4" />
                      </button>
                      <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => fileRef.current?.click()}
                        className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" title="File">
                        <Paperclip className="h-4 w-4" />
                      </button>
                      <button type="button" onMouseDown={e => e.preventDefault()} onClick={startRec}
                        className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-rose-500 hover:bg-rose-50 transition-colors" title="Voice message">
                        <Mic className="h-4 w-4" />
                      </button>
                    </div>
                    <input ref={inputRef} value={msg}
                      onChange={e => setMsg(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(msg); } }}
                      placeholder={`Message ${selectedConvo.name}…`}
                      className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none min-w-0 py-1" />
                    <button type="button" onClick={() => sendMessage(msg)} disabled={!msg.trim() || sending}
                      className="h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-30 shrink-0">
                      {sending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {mediaPreview && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setMediaPreview(null)}>
          <button className="absolute top-4 right-4 h-9 w-9 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20">
            <X className="h-5 w-5" />
          </button>
          {mediaPreview.type === "image" && <img src={mediaPreview.url} alt="full" className="max-w-full max-h-full rounded-xl object-contain" />}
          {mediaPreview.type === "video" && <video src={mediaPreview.url} controls autoPlay className="max-w-full max-h-full rounded-xl" />}
        </div>
      )}
    </Layout>
  );
}