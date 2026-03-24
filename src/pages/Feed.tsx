import { useState, useRef, useEffect, useCallback, memo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  Heart, MessageCircle, MapPin, Search, Plus, Send, MoreHorizontal,
  Trash2, Edit3, Bookmark, Share2, Flag, EyeOff, BellOff, Handshake,
  X, Check, BookmarkCheck, Users, ImageIcon, Link2, Video as VideoIcon, ZoomIn,
} from "lucide-react";
import Layout from "@/components/Layout";
import { toast } from "@/hooks/use-toast";
import { useUser } from "@/context/UserContext";
import { supabase } from "@/lib/supabase";
// OPT: import from the single consolidated helper instead of defining inline
import { createNotification } from "@/lib/notifications";

// ── Types ──────────────────────────────────────────────────────────────────
type Comment = { id: string; author: string; avatar: string; color: string; text: string; time: string; };
type Post = {
  id: string; user_id: string; author: string; avatar: string; avatarColor: string; location: string;
  tag: string; time: string; content: string; image?: string; video?: string; likes: number; isOwn: boolean;
  comments: Comment[];
};
type Collab = {
  id: string; user_id: string; author: string; avatar: string; avatarColor: string; location: string;
  title: string; looking: string; description: string; skills: string[]; image?: string; video?: string;
  isOwn: boolean;
};

// ── Constants ──────────────────────────────────────────────────────────────
const AVATAR_COLORS = ["bg-primary","bg-accent","bg-emerald-600","bg-violet-600","bg-sky-500","bg-rose-500","bg-amber-500","bg-teal-600"];
const POST_TAGS = ["Launch","Progress","Question","Idea","Milestone","Feedback","Story","Resource"];
const COLLAB_FILTERS = ["All","Photography","Music","Writing","Design","Marketing","Tech","Events","Education"];
const SKILL_OPTIONS = [
  "Photography","Video","Graphic Design","Writing","Music","Marketing",
  "Social Media","Community","Events","Teaching","Cooking","Crafts",
  "Audio Engineering","Animation","Illustration","Research","Coaching","Content Creation",
];
const REPORT_REASONS = [
  "Spam or misleading","Hate speech or discrimination","Harassment or bullying",
  "False information","Intellectual property violation","Inappropriate content","Other",
];
const SHARE_PLATFORMS = [
  {
    name: "WhatsApp", color: "#25D366",
    url: (link: string) => `https://wa.me/?text=${encodeURIComponent(link)}`,
    icon: () => (<svg viewBox="0 0 24 24" className="h-6 w-6" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>),
  },
  {
    name: "Twitter / X", color: "#000000",
    url: (link: string) => `https://twitter.com/intent/tweet?url=${encodeURIComponent(link)}`,
    icon: () => (<svg viewBox="0 0 24 24" className="h-5 w-5" fill="white"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>),
  },
  {
    name: "Instagram", color: "linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)",
    url: () => "https://instagram.com",
    icon: () => (<svg viewBox="0 0 24 24" className="h-6 w-6" fill="white"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>),
  },
  {
    name: "Facebook", color: "#1877F2",
    url: (link: string) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`,
    icon: () => (<svg viewBox="0 0 24 24" className="h-6 w-6" fill="white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>),
  },
  {
    name: "LinkedIn", color: "#0A66C2",
    url: (link: string) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link)}`,
    icon: () => (<svg viewBox="0 0 24 24" className="h-6 w-6" fill="white"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>),
  },
  {
    name: "Telegram", color: "#2CA5E0",
    url: (link: string) => `https://t.me/share/url?url=${encodeURIComponent(link)}`,
    icon: () => (<svg viewBox="0 0 24 24" className="h-6 w-6" fill="white"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>),
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────
function Avatar({ initials, color, size = "md" }: { initials: string; color: string; size?: "sm"|"md"|"lg" }) {
  const sz = size==="sm" ? "h-7 w-7 text-xs" : size==="lg" ? "h-14 w-14 text-lg" : "h-10 w-10 text-sm";
  return <div className={`${sz} ${color} rounded-full flex items-center justify-center text-white font-semibold shrink-0`}>{initials}</div>;
}

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

function getStoragePath(url: string): string | null {
  try {
    const match = url.match(/\/storage\/v1\/object\/public\/posts\/(.+)/);
    return match ? match[1] : null;
  } catch { return null; }
}

async function deleteFromStorage(url: string) {
  const path = getStoragePath(url);
  if (path) {
    await (supabase as any).storage.from("posts").remove([path]);
  }
}

// ── Image Lightbox ─────────────────────────────────────────────────────────
function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4"
      onClick={onClose}>
      <button onClick={onClose}
        className="absolute top-4 right-4 h-9 w-9 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors">
        <X className="h-5 w-5" />
      </button>
      <motion.img
        initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        src={src} alt="Full size"
        className="max-w-full max-h-[90vh] rounded-xl object-contain"
        onClick={e => e.stopPropagation()}
      />
    </motion.div>
  );
}

// ── Media Upload Bar ───────────────────────────────────────────────────────
function MediaUploadBar({ onImage, onVideo, onUploadingChange }: {
  onImage: (url: string) => void;
  onVideo: (url: string) => void;
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const imgRef = useRef<HTMLInputElement>(null);
  const vidRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadLabel, setUploadLabel] = useState("");

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>, cb: (url: string) => void, type: "image" | "video") => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setUploading(true);
    onUploadingChange?.(true);
    setUploadLabel(type === "image" ? "Uploading photo..." : "Uploading video...");

    const ext = file.name.split(".").pop();
    const path = `${Date.now()}.${ext}`;

    const { error } = await (supabase as any).storage
      .from("posts")
      .upload(path, file, { upsert: true });

    if (error) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
      setUploading(false);
      onUploadingChange?.(false);
      setUploadLabel("");
      return;
    }

    const { data } = (supabase as any).storage.from("posts").getPublicUrl(path);
    cb(data.publicUrl);
    setUploading(false);
    onUploadingChange?.(false);
    setUploadLabel(type === "image" ? "Photo uploaded ✓" : "Video uploaded ✓");
    setTimeout(() => setUploadLabel(""), 2000);
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={e => handleFile(e, onImage, "image")} />
        <input ref={vidRef} type="file" accept="video/*" className="hidden" onChange={e => handleFile(e, onVideo, "video")} />
        <button type="button" onClick={() => imgRef.current?.click()} disabled={uploading}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground border border-dashed border-border hover:border-primary rounded-lg px-3 py-2 transition-colors flex-1 justify-center disabled:opacity-50">
          <ImageIcon className="h-4 w-4" /> Photo
        </button>
        <button type="button" onClick={() => vidRef.current?.click()} disabled={uploading}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground border border-dashed border-border hover:border-primary rounded-lg px-3 py-2 transition-colors flex-1 justify-center disabled:opacity-50">
          <VideoIcon className="h-4 w-4" /> Video
        </button>
      </div>
      {uploading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
          <div className="h-3 w-3 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" />
          {uploadLabel}
        </div>
      )}
      {!uploading && uploadLabel && (
        <p className="text-xs text-emerald-600 px-1">{uploadLabel}</p>
      )}
    </div>
  );
}

// ── Share Dialog ───────────────────────────────────────────────────────────
function ShareDialog({ open, onClose, link }: { open: boolean; onClose: () => void; link: string }) {
  const copyLink = () => {
    navigator.clipboard?.writeText(link).catch(() => {});
    toast({ title: "Link copied! 🔗" });
    onClose();
  };
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Share this post</DialogTitle>
          <DialogDescription>Choose where you'd like to share it.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-3 py-2">
          {SHARE_PLATFORMS.map((p) => {
            const IconComp = p.icon;
            const isGradient = p.color.includes("gradient");
            return (
              <a key={p.name} href={p.url(link)} target="_blank" rel="noreferrer" onClick={onClose}
                className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-muted transition-colors cursor-pointer">
                <div className="h-12 w-12 rounded-2xl flex items-center justify-center shadow-sm"
                  style={{ background: isGradient ? p.color : p.color }}>
                  <IconComp />
                </div>
                <span className="text-xs text-muted-foreground text-center leading-tight">{p.name}</span>
              </a>
            );
          })}
        </div>
        <div className="border-t border-border pt-3">
          <button onClick={copyLink}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-muted hover:bg-secondary transition-colors">
            <div className="h-10 w-10 rounded-xl bg-background border border-border flex items-center justify-center shrink-0">
              <Link2 className="h-4 w-4 text-foreground" />
            </div>
            <div className="text-left min-w-0">
              <p className="text-sm font-medium text-foreground">Copy link</p>
              <p className="text-xs text-muted-foreground truncate">{link}</p>
            </div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Report Dialog ──────────────────────────────────────────────────────────
function ReportDialog({ open, onClose, target }: { open: boolean; onClose: () => void; target: string }) {
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const submit = () => { if (!reason) return; setSubmitted(true); };
  const close = () => { onClose(); setTimeout(() => { setReason(""); setDetails(""); setSubmitted(false); }, 300); };
  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{submitted ? "Report submitted" : `Report ${target}`}</DialogTitle>
          {!submitted && <DialogDescription>Help us understand what's wrong. Your report is anonymous.</DialogDescription>}
        </DialogHeader>
        {submitted ? (
          <div className="py-6 text-center space-y-3">
            <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Check className="h-7 w-7 text-primary" />
            </div>
            <p className="text-sm text-foreground font-medium">Thanks for letting us know</p>
            <p className="text-xs text-muted-foreground leading-relaxed">We review all reports carefully. If this content violates our guidelines we'll take action within 24 hours.</p>
            <Button className="w-full mt-2" onClick={close}>Done</Button>
          </div>
        ) : (
          <>
            <div className="space-y-2 py-2">
              {REPORT_REASONS.map((r) => (
                <button key={r} onClick={() => setReason(r)}
                  className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-colors border ${reason === r ? "border-primary bg-primary/5 text-foreground font-medium" : "border-transparent hover:bg-muted text-foreground"}`}>
                  {r}
                </button>
              ))}
              {reason && <Textarea value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Add more details (optional)" rows={2} className="mt-2 text-sm" />}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={close}>Cancel</Button>
              <Button onClick={submit} disabled={!reason} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">Submit report</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Mute Dialog ────────────────────────────────────────────────────────────
function MuteDialog({ open, author, onClose, onConfirm }: { open: boolean; author: string; onClose: () => void; onConfirm: () => void; }) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Mute {author}?</DialogTitle>
          <DialogDescription>You won't see any more posts from <strong>{author}</strong> in your feed. They won't know they've been muted.</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { onConfirm(); onClose(); }} className="bg-foreground text-background hover:bg-foreground/90">Mute {author}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Comment Sheet ──────────────────────────────────────────────────────────
function CommentSheet({ post, onClose, onAddComment }: {
  post: Post; onClose: () => void; onAddComment: (postId: string, text: string) => void;
}) {
  const { user } = useUser();
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string|null>(null);
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 100); }, []);

  const submit = () => {
    if (!text.trim()) return;
    onAddComment(post.id, text.trim());
    setText("");
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
        transition={{ type: "spring", damping: 26, stiffness: 320 }}
        className="relative z-10 w-full max-w-lg bg-background rounded-t-2xl sm:rounded-2xl shadow-2xl border border-border flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h3 className="font-semibold text-foreground">Comments · {post.comments.length}</h3>
          <button onClick={onClose} className="h-7 w-7 rounded-full bg-muted flex items-center justify-center hover:bg-secondary transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        {post.image && (
          <div className="px-5 pt-4 relative group cursor-pointer" onClick={() => setLightboxSrc(post.image!)}>
            <img src={post.image} alt="post" className="w-full rounded-xl object-cover max-h-48" />
            <div className="absolute inset-0 mx-5 rounded-xl bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
              <ZoomIn className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {post.comments.length === 0 && (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">No comments yet. Be the first!</p>
            </div>
          )}
          {post.comments.map((c) => (
            <div key={c.id} className="flex gap-3">
              <Avatar initials={c.avatar} color={c.color || AVATAR_COLORS[0]} size="sm" />
              <div className="flex-1 bg-secondary rounded-xl px-3 py-2.5">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-foreground">{c.author}</span>
                  <span className="text-xs text-muted-foreground">{c.time}</span>
                </div>
                <p className="text-sm text-foreground leading-relaxed">{c.text}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="px-5 py-4 border-t border-border shrink-0 flex gap-2">
          <Avatar initials={user.avatar} color={user.color} size="sm" />
          <div className="flex-1 flex gap-2">
            <Textarea ref={inputRef} value={text} onChange={(e) => setText(e.target.value)}
              placeholder="Write a comment..." rows={1}
              className="resize-none text-sm min-h-[38px] max-h-[100px] py-2"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }} />
            <button onClick={submit} disabled={!text.trim()}
              className="h-9 w-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-40 shrink-0">
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </motion.div>
      <AnimatePresence>
        {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Edit Post Dialog ───────────────────────────────────────────────────────
function EditPostDialog({ post, open, onClose, onSave }: {
  post: Post; open: boolean; onClose: () => void;
  onSave: (id: string, content: string, tag: string, image?: string, video?: string) => void;
}) {
  const [content, setContent] = useState(post.content);
  const [tag, setTag] = useState(post.tag);
  const [image, setImage] = useState<string|undefined>(post.image);
  const [video, setVideo] = useState<string|undefined>(post.video);
  const [editUploading, setEditUploading] = useState(false);

  const removeImage = async () => { if (image) await deleteFromStorage(image); setImage(undefined); };
  const removeVideo = async () => { if (video) await deleteFromStorage(video); setVideo(undefined); };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Edit Post</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex flex-wrap gap-2">
            {POST_TAGS.map((t) => <Badge key={t} variant={tag===t?"default":"outline"} className="cursor-pointer" onClick={() => setTag(t)}>{t}</Badge>)}
          </div>
          <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={4} />
          {image && (
            <div className="relative rounded-xl overflow-hidden group cursor-pointer">
              <img src={image} alt="preview" className="w-full max-h-48 object-cover" />
              <button onClick={removeImage} className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70"><X className="h-3.5 w-3.5"/></button>
            </div>
          )}
          {video && (
            <div className="relative rounded-xl overflow-hidden">
              <video src={video} controls className="w-full max-h-48 rounded-xl" />
              <button onClick={removeVideo} className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70"><X className="h-3.5 w-3.5"/></button>
            </div>
          )}
          {!image && !video && <MediaUploadBar onImage={setImage} onVideo={setVideo} onUploadingChange={setEditUploading} />}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { onSave(post.id, content, tag, image, video); onClose(); }} disabled={!content.trim() || editUploading} className="gap-1.5">
            <Check className="h-4 w-4"/> Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit Collab Dialog ─────────────────────────────────────────────────────
function EditCollabDialog({ collab, open, onClose, onSave }: {
  collab: Collab; open: boolean; onClose: () => void; onSave: (id: string, updates: Partial<Collab>) => void;
}) {
  const [title, setTitle] = useState(collab.title);
  const [looking, setLooking] = useState(collab.looking);
  const [desc, setDesc] = useState(collab.description);
  const [skills, setSkills] = useState(collab.skills);
  const [image, setImage] = useState<string|undefined>(collab.image);
  const [video, setVideo] = useState<string|undefined>(collab.video);
  const [editUploading, setEditUploading] = useState(false);
  const toggle = (s: string) => setSkills((p) => p.includes(s)?p.filter((x)=>x!==s):[...p,s]);

  const removeImage = async () => { if (image) await deleteFromStorage(image); setImage(undefined); };
  const removeVideo = async () => { if (video) await deleteFromStorage(video); setVideo(undefined); };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit Collaboration</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div><label className="text-sm font-medium mb-1.5 block">Project title</label><Input value={title} onChange={(e)=>setTitle(e.target.value)} className="h-10"/></div>
          <div><label className="text-sm font-medium mb-1.5 block">Looking for</label><Input value={looking} onChange={(e)=>setLooking(e.target.value)} className="h-10"/></div>
          <div><label className="text-sm font-medium mb-1.5 block">Description</label><Textarea value={desc} onChange={(e)=>setDesc(e.target.value)} rows={3}/></div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Skills needed</label>
            <div className="flex flex-wrap gap-2">{SKILL_OPTIONS.map((s)=><Badge key={s} variant={skills.includes(s)?"default":"outline"} className="cursor-pointer" onClick={()=>toggle(s)}>{s}</Badge>)}</div>
          </div>
          {image && (
            <div className="relative rounded-xl overflow-hidden">
              <img src={image} alt="preview" className="w-full max-h-40 object-cover"/>
              <button onClick={removeImage} className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/50 text-white flex items-center justify-center"><X className="h-3.5 w-3.5"/></button>
            </div>
          )}
          {video && (
            <div className="relative rounded-xl overflow-hidden">
              <video src={video} controls className="w-full max-h-40 rounded-xl"/>
              <button onClick={removeVideo} className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/50 text-white flex items-center justify-center"><X className="h-3.5 w-3.5"/></button>
            </div>
          )}
          {!image && !video && <MediaUploadBar onImage={setImage} onVideo={setVideo} onUploadingChange={setEditUploading}/>}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={()=>{onSave(collab.id,{title,looking,description:desc,skills,image,video});onClose();}} disabled={!title.trim() || editUploading} className="gap-1.5">
            <Check className="h-4 w-4"/> Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Post Card ──────────────────────────────────────────────────────────────
// OPT: wrapped in memo with a custom comparator — only re-renders when this
// specific post's like/save status or content actually changes, not when any
// other state in the Feed changes (dialogs opening, search input, etc.)
const PostCard = memo(function PostCard({ post, likedPosts, savedPosts, mutedAuthors, onLike, onSave, onComment, onDelete, onEdit, onHide, onMute, onReport, onShare }: {
  post: Post; likedPosts: Set<string>; savedPosts: Set<string>; mutedAuthors: Set<string>;
  onLike:(id:string)=>void; onSave:(id:string)=>void; onComment:(p:Post)=>void;
  onDelete:(id:string)=>void; onEdit:(p:Post)=>void; onHide:(id:string)=>void;
  onMute:(author:string)=>void; onReport:(id:string)=>void; onShare:(id:string)=>void;
}) {
  const isLiked = likedPosts.has(post.id);
  const isSaved = savedPosts.has(post.id);
  const navigate = useNavigate();
  const [lightboxSrc, setLightboxSrc] = useState<string|null>(null);
  if (mutedAuthors.has(post.author) && !post.isOwn) return null;

  const goToProfile = () => {
    if (post.isOwn) { navigate("/profile"); return; }
    navigate(`/profile/${post.user_id}`);
  };

  return (
    <>
      <motion.div layout initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} exit={{opacity:0,scale:0.97}}
        className="rounded-xl border border-border bg-card hover:shadow-sm transition-shadow overflow-hidden">
        <div className="flex items-center gap-3 px-5 pt-5 pb-3">
          <button onClick={goToProfile} className="shrink-0 hover:opacity-80 transition-opacity">
            <Avatar initials={post.avatar} color={post.avatarColor}/>
          </button>
          <div className="flex-1 min-w-0">
            <button onClick={goToProfile} className="font-semibold text-sm text-foreground hover:underline text-left">{post.author}</button>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <MapPin className="h-3 w-3 shrink-0"/> {post.location} · {post.time}
            </p>
          </div>
          <Badge variant="secondary" className="text-xs shrink-0">{post.tag}</Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors ml-1">
                <MoreHorizontal className="h-4 w-4"/>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={()=>onSave(post.id)} className="gap-2">
                {isSaved?<BookmarkCheck className="h-4 w-4 text-primary"/>:<Bookmark className="h-4 w-4"/>}
                {isSaved?"Saved":"Save post"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={()=>onShare(post.id)} className="gap-2"><Share2 className="h-4 w-4"/> Share</DropdownMenuItem>
              {post.isOwn ? (
                <>
                  <DropdownMenuSeparator/>
                  <DropdownMenuItem onClick={()=>onEdit(post)} className="gap-2"><Edit3 className="h-4 w-4"/> Edit post</DropdownMenuItem>
                  <DropdownMenuItem onClick={()=>onDelete(post.id)} className="gap-2 text-destructive focus:text-destructive"><Trash2 className="h-4 w-4"/> Delete post</DropdownMenuItem>
                </>
              ) : (
                <>
                  <DropdownMenuSeparator/>
                  <DropdownMenuItem onClick={()=>onHide(post.id)} className="gap-2"><EyeOff className="h-4 w-4"/> Not interested</DropdownMenuItem>
                  <DropdownMenuItem onClick={()=>onMute(post.author)} className="gap-2"><BellOff className="h-4 w-4"/> Mute {post.author.split(" ")[0]}</DropdownMenuItem>
                  <DropdownMenuSeparator/>
                  <DropdownMenuItem onClick={()=>onReport(post.id)} className="gap-2 text-destructive focus:text-destructive"><Flag className="h-4 w-4"/> Report post</DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <p className="text-sm text-foreground leading-relaxed px-5 pb-3">{post.content}</p>
        {post.image && (
          <div className="px-5 pb-3 relative group cursor-pointer" onClick={() => setLightboxSrc(post.image!)}>
            <img src={post.image} alt="post" className="w-full rounded-xl object-cover max-h-72" loading="lazy"/>
            <div className="absolute inset-0 mx-5 rounded-xl bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
              <ZoomIn className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        )}
        {post.video && <div className="px-5 pb-3"><video src={post.video} controls className="w-full rounded-xl max-h-72" style={{backgroundColor:"#000"}}/></div>}
        <div className="flex items-center gap-1 border-t border-border px-3 py-2">
          <button onClick={()=>onLike(post.id)} className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors ${isLiked?"text-rose-500 bg-rose-50":"text-muted-foreground hover:bg-muted"}`}>
            <Heart className={`h-4 w-4 ${isLiked?"fill-current":""}`}/> {post.likes}
          </button>
          <button onClick={()=>onComment(post)} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg text-muted-foreground hover:bg-muted transition-colors">
            <MessageCircle className="h-4 w-4"/> {post.comments.length}
          </button>
          <button onClick={()=>onSave(post.id)} className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors ml-auto ${isSaved?"text-primary bg-primary/10":"text-muted-foreground hover:bg-muted"}`}>
            <Bookmark className={`h-4 w-4 ${isSaved?"fill-current":""}`}/><span className="hidden sm:inline">{isSaved?"Saved":"Save"}</span>
          </button>
          <button onClick={()=>onShare(post.id)} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg text-muted-foreground hover:bg-muted transition-colors">
            <Share2 className="h-4 w-4"/>
          </button>
        </div>
      </motion.div>
      <AnimatePresence>
        {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
      </AnimatePresence>
    </>
  );
}, (prev, next) => {
  // OPT: only re-render if this post's data, like, or save status changed
  return (
    prev.post === next.post &&
    prev.likedPosts.has(prev.post.id) === next.likedPosts.has(next.post.id) &&
    prev.savedPosts.has(prev.post.id) === next.savedPosts.has(next.post.id) &&
    prev.mutedAuthors === next.mutedAuthors
  );
});

// ── Collab Card ────────────────────────────────────────────────────────────
// OPT: same memo treatment as PostCard
const CollabCard = memo(function CollabCard({ collab, interestedSet, savedCollabs, mutedAuthors, onInterest, onMessage, onSave, onDelete, onEdit, onHide, onMute, onReport, onShare }: {
  collab: Collab; interestedSet: Set<string>; savedCollabs: Set<string>; mutedAuthors: Set<string>;
  onInterest:(id:string,name:string)=>void; onMessage:(name:string)=>void; onSave:(id:string)=>void;
  onDelete:(id:string)=>void; onEdit:(c:Collab)=>void; onHide:(id:string)=>void;
  onMute:(author:string)=>void; onReport:(id:string)=>void; onShare:(id:string)=>void;
}) {
  const isInterested = interestedSet.has(collab.id);
  const isSaved = savedCollabs.has(collab.id);
  const navigate = useNavigate();
  const [lightboxSrc, setLightboxSrc] = useState<string|null>(null);
  if (mutedAuthors.has(collab.author) && !collab.isOwn) return null;

  const goToProfile = () => {
    if (collab.isOwn) { navigate("/profile"); return; }
    navigate(`/profile/${collab.user_id}`);
  };

  return (
    <>
      <motion.div layout initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} exit={{opacity:0,scale:0.97}}
        className="rounded-xl border border-border bg-card hover:shadow-sm transition-shadow overflow-hidden">
        <div className="flex items-center gap-3 px-5 pt-5 pb-3">
          <button onClick={goToProfile} className="shrink-0 hover:opacity-80 transition-opacity">
            <Avatar initials={collab.avatar} color={collab.avatarColor}/>
          </button>
          <div className="flex-1 min-w-0">
            <button onClick={goToProfile} className="font-semibold text-sm text-foreground hover:underline text-left">{collab.author}</button>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><MapPin className="h-3 w-3 shrink-0"/> {collab.location}</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
                <MoreHorizontal className="h-4 w-4"/>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={()=>onSave(collab.id)} className="gap-2">
                {isSaved?<BookmarkCheck className="h-4 w-4 text-primary"/>:<Bookmark className="h-4 w-4"/>}
                {isSaved?"Saved":"Save collab"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={()=>onShare(collab.id)} className="gap-2"><Share2 className="h-4 w-4"/> Share</DropdownMenuItem>
              {collab.isOwn ? (
                <>
                  <DropdownMenuSeparator/>
                  <DropdownMenuItem onClick={()=>onEdit(collab)} className="gap-2"><Edit3 className="h-4 w-4"/> Edit collab</DropdownMenuItem>
                  <DropdownMenuItem onClick={()=>onDelete(collab.id)} className="gap-2 text-destructive focus:text-destructive"><Trash2 className="h-4 w-4"/> Delete collab</DropdownMenuItem>
                </>
              ) : (
                <>
                  <DropdownMenuSeparator/>
                  <DropdownMenuItem onClick={()=>onHide(collab.id)} className="gap-2"><EyeOff className="h-4 w-4"/> Not interested</DropdownMenuItem>
                  <DropdownMenuItem onClick={()=>onMute(collab.author)} className="gap-2"><BellOff className="h-4 w-4"/> Mute {collab.author.split(" ")[0]}</DropdownMenuItem>
                  <DropdownMenuSeparator/>
                  <DropdownMenuItem onClick={()=>onReport(collab.id)} className="gap-2 text-destructive focus:text-destructive"><Flag className="h-4 w-4"/> Report collab</DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="px-5 pb-4">
          <h3 className="font-semibold text-foreground mb-1">{collab.title}</h3>
          <p className="text-xs font-medium text-primary mb-2 flex items-center gap-1"><Users className="h-3 w-3"/> Looking for: {collab.looking}</p>
          <p className="text-sm text-foreground leading-relaxed mb-3">{collab.description}</p>
          {collab.image && (
            <div className="relative group cursor-pointer mb-3" onClick={() => setLightboxSrc(collab.image!)}>
              <img src={collab.image} alt="collab" className="w-full rounded-xl object-cover max-h-48" loading="lazy"/>
              <div className="absolute inset-0 rounded-xl bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                <ZoomIn className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
          )}
          {collab.video && <video src={collab.video} controls className="w-full rounded-xl max-h-48 mb-3" style={{backgroundColor:"#000"}}/>}
          <div className="flex flex-wrap gap-1.5">{collab.skills.map((s)=><Badge key={s} variant="secondary" className="text-xs">{s}</Badge>)}</div>
        </div>
        <div className="flex gap-2 px-5 pb-4">
          <Button size="sm" variant={isInterested?"outline":"default"} className={`flex-1 gap-1.5 ${isInterested?"border-primary text-primary":""}`} onClick={()=>onInterest(collab.id,collab.author)}>
            <Handshake className="h-3.5 w-3.5"/>{isInterested?"Interested ✓":"I'm Interested"}
          </Button>
          <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={()=>onMessage(collab.author)}>
            <MessageCircle className="h-3.5 w-3.5"/> Message
          </Button>
        </div>
      </motion.div>
      <AnimatePresence>
        {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
      </AnimatePresence>
    </>
  );
}, (prev, next) => {
  return (
    prev.collab === next.collab &&
    prev.interestedSet.has(prev.collab.id) === next.interestedSet.has(next.collab.id) &&
    prev.savedCollabs.has(prev.collab.id) === next.savedCollabs.has(next.collab.id) &&
    prev.mutedAuthors === next.mutedAuthors
  );
});

// ── Feed Skeleton ──────────────────────────────────────────────────────────
function FeedSkeleton() {
  return (
    <div className="space-y-4">
      {[1,2,3].map(i => (
        <div key={i} className="rounded-xl border border-border bg-card p-5 animate-pulse">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-full bg-muted shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-muted rounded w-32" />
              <div className="h-2.5 bg-muted rounded w-20" />
            </div>
          </div>
          <div className="space-y-2 mb-4">
            <div className="h-3 bg-muted rounded w-full" />
            <div className="h-3 bg-muted rounded w-4/5" />
            <div className="h-3 bg-muted rounded w-2/3" />
          </div>
          <div className="flex gap-4">
            <div className="h-3 bg-muted rounded w-12" />
            <div className="h-3 bg-muted rounded w-12" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Feed ──────────────────────────────────────────────────────────────
export default function Feed() {
  const navigate = useNavigate();
  const { user } = useUser();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("feed");
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("All");

  const [posts, setPosts] = useState<Post[]>([]);
  const [collabs, setCollabs] = useState<Collab[]>([]);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [savedPosts, setSavedPosts] = useState<Set<string>>(new Set());
  const [mutedAuthors, setMutedAuthors] = useState<Set<string>>(new Set());
  const [commentingPost, setCommentingPost] = useState<Post|null>(null);
  const [editingPost, setEditingPost] = useState<Post|null>(null);
  const [shareTarget, setShareTarget] = useState<{type:"post"|"collab";id:string}|null>(null);
  const [reportTarget, setReportTarget] = useState<{type:"post"|"collab";id:string}|null>(null);
  const [muteTarget, setMuteTarget] = useState<string|null>(null);
  const [interestedCollabs, setInterestedCollabs] = useState<Set<string>>(new Set());
  const [savedCollabs, setSavedCollabs] = useState<Set<string>>(new Set());
  const [editingCollab, setEditingCollab] = useState<Collab|null>(null);

  // Pagination
  const [postsHasMore, setPostsHasMore] = useState(false);
  const [collabsHasMore, setCollabsHasMore] = useState(false);
  const [loadingMorePosts, setLoadingMorePosts] = useState(false);
  const [loadingMoreCollabs, setLoadingMoreCollabs] = useState(false);
  const postsCursorRef = useRef<string | null>(null);
  const collabsCursorRef = useRef<string | null>(null);

  // OPT: grouped compose state — fewer useState hooks, fewer re-renders when
  // one compose field changes (only the compose area re-renders, not the whole feed)
  const [postDialog, setPostDialog] = useState({
    open: false, content: "", tag: "Progress",
    image: undefined as string|undefined,
    video: undefined as string|undefined,
    uploading: false,
  });
  const [collabDialog, setCollabDialog] = useState({
    open: false, title: "", looking: "", desc: "", skills: [] as string[],
    image: undefined as string|undefined,
    video: undefined as string|undefined,
    uploading: false,
  });

  // ── Fetch (OPT: parallelized — posts + collabs + likes fire simultaneously) ──
  const fetchFeed = useCallback(async () => {
    if (!user.id) return;
    setLoading(true);
    try {
      // OPT: all queries fire at the same time instead of sequentially
      const [postsRes, collabsRes, likesRes, savedPostsRes, savedCollabsRes, interestedRes] = await Promise.all([
        (supabase as any)
          .from("posts")
          .select(`*, profiles:user_id (name, avatar, color, location)`)
          .order("created_at", { ascending: false })
          .limit(30),
        (supabase as any)
          .from("collabs")
          .select(`*, profiles:user_id (name, avatar, color, location)`)
          .order("created_at", { ascending: false })
          .limit(30),
        (supabase as any)
          .from("post_likes")
          .select("post_id")
          .eq("user_id", user.id),
        (supabase as any).from("saved_posts").select("post_id").eq("user_id", user.id),
        (supabase as any).from("saved_collabs").select("collab_id").eq("user_id", user.id),
        (supabase as any).from("collab_interests").select("collab_id").eq("user_id", user.id),
      ]);

      if (postsRes.error) throw postsRes.error;
      if (collabsRes.error) throw collabsRes.error;

      setPostsHasMore((postsRes.data || []).length === 30);
      setCollabsHasMore((collabsRes.data || []).length === 30);
      if ((postsRes.data || []).length > 0)
        postsCursorRef.current = postsRes.data[postsRes.data.length - 1].created_at;
      if ((collabsRes.data || []).length > 0)
        collabsCursorRef.current = collabsRes.data[collabsRes.data.length - 1].created_at;

      // OPT: comments are NOT pre-fetched here — they load lazily when a post
      // is expanded (see handleOpenComments below). This removes a heavy query
      // from the critical path on every page load.
      const mappedPosts: Post[] = (postsRes.data || []).map((p: any) => ({
        id: p.id, user_id: p.user_id,
        author: p.profiles?.name || "Unknown",
        avatar: p.profiles?.avatar || "?",
        avatarColor: p.profiles?.color || "bg-primary",
        location: p.profiles?.location || "",
        tag: p.tag, time: timeAgo(p.created_at), content: p.content,
        image: p.image_url || undefined, video: p.video_url || undefined,
        likes: p.likes || 0, isOwn: p.user_id === user.id,
        comments: [], // loaded on-demand
      }));

      const mappedCollabs: Collab[] = (collabsRes.data || []).map((c: any) => ({
        id: c.id, user_id: c.user_id,
        author: c.profiles?.name || "Unknown",
        avatar: c.profiles?.avatar || "?",
        avatarColor: c.profiles?.color || "bg-primary",
        location: c.profiles?.location || "",
        title: c.title, looking: c.looking, description: c.description,
        skills: c.skills || [], image: c.image_url || undefined, video: c.video_url || undefined,
        isOwn: c.user_id === user.id,
      }));

      if (likesRes.data) setLikedPosts(new Set(likesRes.data.map((l: any) => l.post_id)));
      if (savedPostsRes.data) setSavedPosts(new Set(savedPostsRes.data.map((s: any) => s.post_id)));
      if (savedCollabsRes.data) setSavedCollabs(new Set(savedCollabsRes.data.map((s: any) => s.collab_id)));
      if (interestedRes.data) setInterestedCollabs(new Set(interestedRes.data.map((s: any) => s.collab_id)));

      setPosts(mappedPosts);
      setCollabs(mappedCollabs);
    } catch (err: any) {
      toast({ title: "Failed to load feed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  const fetchMorePosts = useCallback(async () => {
    if (!postsCursorRef.current || loadingMorePosts) return;
    setLoadingMorePosts(true);
    try {
      const { data, error } = await (supabase as any)
        .from("posts")
        .select(`*, profiles:user_id (name, avatar, color, location)`)
        .order("created_at", { ascending: false })
        .lt("created_at", postsCursorRef.current)
        .limit(30);
      if (error) throw error;
      const more: Post[] = (data || []).map((p: any) => ({
        id: p.id, user_id: p.user_id,
        author: p.profiles?.name || "Unknown",
        avatar: p.profiles?.avatar || "?",
        avatarColor: p.profiles?.color || "bg-primary",
        location: p.profiles?.location || "",
        tag: p.tag, time: timeAgo(p.created_at), content: p.content,
        image: p.image_url || undefined, video: p.video_url || undefined,
        likes: p.likes || 0, isOwn: p.user_id === user.id, comments: [],
      }));
      setPosts(prev => [...prev, ...more]);
      setPostsHasMore((data || []).length === 30);
      if ((data || []).length > 0) postsCursorRef.current = data[data.length - 1].created_at;
    } catch { /* silent */ }
    setLoadingMorePosts(false);
  }, [loadingMorePosts, user.id]);

  const fetchMoreCollabs = useCallback(async () => {
    if (!collabsCursorRef.current || loadingMoreCollabs) return;
    setLoadingMoreCollabs(true);
    try {
      const { data, error } = await (supabase as any)
        .from("collabs")
        .select(`*, profiles:user_id (name, avatar, color, location)`)
        .order("created_at", { ascending: false })
        .lt("created_at", collabsCursorRef.current)
        .limit(30);
      if (error) throw error;
      const more: Collab[] = (data || []).map((c: any) => ({
        id: c.id, user_id: c.user_id,
        author: c.profiles?.name || "Unknown",
        avatar: c.profiles?.avatar || "?",
        avatarColor: c.profiles?.color || "bg-primary",
        location: c.profiles?.location || "",
        title: c.title, looking: c.looking, description: c.description,
        skills: c.skills || [], image: c.image_url || undefined, video: c.video_url || undefined,
        isOwn: c.user_id === user.id,
      }));
      setCollabs(prev => [...prev, ...more]);
      setCollabsHasMore((data || []).length === 30);
      if ((data || []).length > 0) collabsCursorRef.current = data[data.length - 1].created_at;
    } catch { /* silent */ }
    setLoadingMoreCollabs(false);
  }, [loadingMoreCollabs, user.id]);

  // OPT: Realtime subscription — new posts and deletes are reflected instantly
  // without requiring a full refetch
  useEffect(() => {
    if (!user.id) return;
    const channel = supabase
      .channel("feed-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts" },
        (payload: any) => {
          // Don't add own posts via realtime (already added optimistically)
          if (payload.new.user_id === user.id) return;
          // Fetch the profile for this new post's author
          (supabase as any)
            .from("profiles")
            .select("name, avatar, color, location")
            .eq("id", payload.new.user_id)
            .single()
            .then(({ data: profile }: any) => {
              const newPost: Post = {
                id: payload.new.id,
                user_id: payload.new.user_id,
                author: profile?.name || "Unknown",
                avatar: profile?.avatar || "?",
                avatarColor: profile?.color || "bg-primary",
                location: profile?.location || "",
                tag: payload.new.tag,
                time: "just now",
                content: payload.new.content,
                image: payload.new.image_url || undefined,
                video: payload.new.video_url || undefined,
                likes: 0,
                isOwn: false,
                comments: [],
              };
              setPosts(prev => [newPost, ...prev]);
            });
        })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "posts" },
        (payload: any) => {
          setPosts(prev => prev.filter(p => p.id !== payload.old.id));
        })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "collabs" },
        (payload: any) => {
          if (payload.new.user_id === user.id) return;
          (supabase as any)
            .from("profiles")
            .select("name, avatar, color, location")
            .eq("id", payload.new.user_id)
            .single()
            .then(({ data: profile }: any) => {
              const newCollab: Collab = {
                id: payload.new.id,
                user_id: payload.new.user_id,
                author: profile?.name || "Unknown",
                avatar: profile?.avatar || "?",
                avatarColor: profile?.color || "bg-primary",
                location: profile?.location || "",
                title: payload.new.title,
                looking: payload.new.looking,
                description: payload.new.description,
                skills: payload.new.skills || [],
                image: payload.new.image_url || undefined,
                video: payload.new.video_url || undefined,
                isOwn: false,
              };
              setCollabs(prev => [newCollab, ...prev]);
            });
        })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "collabs" },
        (payload: any) => {
          setCollabs(prev => prev.filter(c => c.id !== payload.old.id));
        })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user.id]);

  // ── Post Actions ──────────────────────────────────────────────────────
  // OPT: optimistic UI — state updates instantly, DB write happens in background
  const handleLike = useCallback(async (id: string) => {
    const was = likedPosts.has(id);
    // Optimistic update — instant feedback
    setLikedPosts(p => { const n = new Set(p); was ? n.delete(id) : n.add(id); return n; });
    setPosts(p => p.map(x => x.id === id ? { ...x, likes: was ? x.likes - 1 : x.likes + 1 } : x));

    if (was) {
      await (supabase as any).from("post_likes").delete().eq("user_id", user.id).eq("post_id", id);
    } else {
      await (supabase as any).from("post_likes").insert({ user_id: user.id, post_id: id });
      const post = posts.find(p => p.id === id);
      if (post && post.user_id !== user.id) {
        createNotification({
          userId: post.user_id,
          type: "like",
          text: `${user.name} liked your post`,
          subtext: post.content?.slice(0, 60) || undefined,
          action: "feed",
        });
      }
    }

    // Sync real count from DB to fix concurrent-like race condition
    const { count } = await (supabase as any)
      .from("post_likes").select("*", { count: "exact", head: true }).eq("post_id", id);
    if (count !== null) setPosts(p => p.map(x => x.id === id ? { ...x, likes: count } : x));
  }, [likedPosts, posts, user.id, user.name]);

  const handleSavePost = useCallback(async (id: string) => {
    const was = savedPosts.has(id);
    setSavedPosts(p => { const n = new Set(p); was ? n.delete(id) : n.add(id); return n; });
    if (was) {
      await (supabase as any).from("saved_posts").delete().eq("user_id", user.id).eq("post_id", id);
      toast({ title: "Post unsaved" });
    } else {
      await (supabase as any).from("saved_posts").insert({ user_id: user.id, post_id: id });
      toast({ title: "Post saved! 🔖" });
    }
  }, [savedPosts, user.id]);

  // OPT: lazy comment loading — only fetch comments when the sheet is opened
  const handleOpenComments = useCallback(async (post: Post) => {
    // If comments already loaded, open immediately
    if (post.comments.length > 0) {
      setCommentingPost(post);
      return;
    }
    // Fetch comments just for this post on demand
    const { data: commentsData } = await (supabase as any)
      .from("comments")
      .select(`*, profiles:user_id (name, avatar, color)`)
      .eq("post_id", post.id)
      .order("created_at", { ascending: true });

    const loadedComments: Comment[] = (commentsData || []).map((c: any) => ({
      id: c.id,
      author: c.profiles?.name || "Unknown",
      avatar: c.profiles?.avatar || "?",
      color: c.profiles?.color || "bg-primary",
      text: c.text,
      time: timeAgo(c.created_at),
    }));

    // Patch the post in state so future opens are instant
    const updatedPost = { ...post, comments: loadedComments };
    setPosts(p => p.map(x => x.id === post.id ? updatedPost : x));
    setCommentingPost(updatedPost);
  }, []);

  const handleAddComment = useCallback(async (postId: string, text: string) => {
    const { data, error } = await (supabase as any)
      .from("comments")
      .insert({ post_id: postId, user_id: user.id, text })
      .select(`*, profiles:user_id (name, avatar, color)`)
      .single();
    if (error) { toast({ title: "Failed to post comment", variant: "destructive" }); return; }
    const newComment: Comment = {
      id: data.id, author: data.profiles?.name || user.name,
      avatar: data.profiles?.avatar || user.avatar,
      color: data.profiles?.color || user.color,
      text: data.text, time: "Just now",
    };
    setPosts(p => p.map(x => x.id === postId ? { ...x, comments: [...x.comments, newComment] } : x));
    setCommentingPost(prev => prev ? { ...prev, comments: [...prev.comments, newComment] } : null);
    const post = posts.find(p => p.id === postId);
    if (post && post.user_id !== user.id) {
      createNotification({
        userId: post.user_id,
        type: "comment",
        text: `${user.name} commented on your post`,
        subtext: text.slice(0, 60),
        action: "feed",
      });
    }
  }, [posts, user.id, user.name, user.avatar, user.color]);

  const handleDeletePost = useCallback(async (id: string) => {
    const post = posts.find(p => p.id === id);
    if (post?.image) await deleteFromStorage(post.image);
    if (post?.video) await deleteFromStorage(post.video);
    await (supabase as any).from("posts").delete().eq("id", id).eq("user_id", user.id);
    setPosts(p => p.filter(x => x.id !== id));
    toast({ title: "Post deleted" });
  }, [posts, user.id]);

  const handleEditPost = useCallback(async (id: string, content: string, tag: string, image?: string, video?: string) => {
    await (supabase as any).from("posts")
      .update({ content, tag, image_url: image || null, video_url: video || null })
      .eq("id", id).eq("user_id", user.id);
    setPosts(p => p.map(x => x.id === id ? { ...x, content, tag, image, video } : x));
    toast({ title: "Post updated ✓" });
  }, [user.id]);

  const handleHidePost = useCallback((id: string) => {
    setPosts(p => p.filter(x => x.id !== id));
    toast({ title: "Post hidden", description: "You won't see posts like this." });
  }, []);

  const handleMuteAuthor = useCallback((author: string) => {
    setMutedAuthors(p => { const n = new Set(p); n.add(author); return n; });
    toast({ title: `${author} muted` });
  }, []);

  const handleCreatePost = useCallback(async () => {
    if (!postDialog.content.trim()) return;
    const { data, error } = await (supabase as any)
      .from("posts")
      .insert({
        user_id: user.id, content: postDialog.content, tag: postDialog.tag,
        image_url: postDialog.image || null, video_url: postDialog.video || null,
      })
      .select().single();
    if (error) { toast({ title: "Failed to create post", variant: "destructive" }); return; }
    // OPT: prepend new post directly to state — no refetch needed
    setPosts(p => [{
      id: data.id, user_id: user.id, author: user.name, avatar: user.avatar,
      avatarColor: user.color, location: user.location, tag: postDialog.tag, time: "Just now",
      content: postDialog.content, image: postDialog.image, video: postDialog.video,
      likes: 0, isOwn: true, comments: [],
    }, ...p]);
    setPostDialog({ open: false, content: "", tag: "Progress", image: undefined, video: undefined, uploading: false });
    toast({ title: "Post published! 🎉" });
  }, [postDialog, user]);

  const handleRemovePostImage = async () => {
    if (postDialog.image) await deleteFromStorage(postDialog.image);
    setPostDialog(d => ({ ...d, image: undefined }));
  };
  const handleRemovePostVideo = async () => {
    if (postDialog.video) await deleteFromStorage(postDialog.video);
    setPostDialog(d => ({ ...d, video: undefined }));
  };

  // ── Collab Actions ────────────────────────────────────────────────────
  const handleInterest = useCallback(async (id: string, name: string) => {
    const was = interestedCollabs.has(id);
    setInterestedCollabs(p => { const n = new Set(p); was ? n.delete(id) : n.add(id); return n; });
    if (was) {
      await (supabase as any).from("collab_interests").delete().eq("user_id", user.id).eq("collab_id", id);
      toast({ title: "Interest withdrawn" });
    } else {
      await (supabase as any).from("collab_interests").insert({ user_id: user.id, collab_id: id });
      toast({ title: `Interest sent to ${name}! 🤝` });
      const collab = collabs.find(c => c.id === id);
      if (collab && collab.user_id !== user.id) {
        createNotification({
          userId: collab.user_id,
          type: "collab",
          text: `${user.name} is interested in your collab`,
          subtext: collab.title,
          action: "feed",
        });
      }
    }
  }, [interestedCollabs, collabs, user.id, user.name]);

  const handleSaveCollab = useCallback(async (id: string) => {
    const was = savedCollabs.has(id);
    setSavedCollabs(p => { const n = new Set(p); was ? n.delete(id) : n.add(id); return n; });
    if (was) {
      await (supabase as any).from("saved_collabs").delete().eq("user_id", user.id).eq("collab_id", id);
      toast({ title: "Collab unsaved" });
    } else {
      await (supabase as any).from("saved_collabs").insert({ user_id: user.id, collab_id: id });
      toast({ title: "Collab saved! 🔖" });
    }
  }, [savedCollabs, user.id]);

  const handleDeleteCollab = useCallback(async (id: string) => {
    const collab = collabs.find(c => c.id === id);
    if (collab?.image) await deleteFromStorage(collab.image);
    if (collab?.video) await deleteFromStorage(collab.video);
    await (supabase as any).from("collabs").delete().eq("id", id).eq("user_id", user.id);
    setCollabs(p => p.filter(x => x.id !== id));
    toast({ title: "Collab deleted" });
  }, [collabs, user.id]);

  const handleEditCollab = useCallback(async (id: string, updates: Partial<Collab>) => {
    await (supabase as any).from("collabs").update({
      title: updates.title, looking: updates.looking, description: updates.description,
      skills: updates.skills, image_url: updates.image || null, video_url: updates.video || null,
    }).eq("id", id).eq("user_id", user.id);
    setCollabs(p => p.map(x => x.id === id ? { ...x, ...updates } : x));
    toast({ title: "Collab updated ✓" });
  }, [user.id]);

  const handleHideCollab = useCallback((id: string) => {
    setCollabs(p => p.filter(x => x.id !== id));
    toast({ title: "Hidden" });
  }, []);

  const handleCreateCollab = useCallback(async () => {
    if (!collabDialog.title.trim() || !collabDialog.looking.trim() || !collabDialog.desc.trim()) return;
    const { data, error } = await (supabase as any)
      .from("collabs")
      .insert({
        user_id: user.id, title: collabDialog.title, looking: collabDialog.looking,
        description: collabDialog.desc, skills: collabDialog.skills,
        image_url: collabDialog.image || null, video_url: collabDialog.video || null,
      })
      .select().single();
    if (error) { toast({ title: "Failed to create collab", variant: "destructive" }); return; }
    setCollabs(p => [{
      id: data.id, user_id: user.id, author: user.name, avatar: user.avatar,
      avatarColor: user.color, location: user.location, title: collabDialog.title,
      looking: collabDialog.looking, description: collabDialog.desc, skills: collabDialog.skills,
      image: collabDialog.image, video: collabDialog.video, isOwn: true,
    }, ...p]);
    setCollabDialog({ open: false, title: "", looking: "", desc: "", skills: [], image: undefined, video: undefined, uploading: false });
    toast({ title: "Collab posted! 🤝" });
  }, [collabDialog, user]);

  const handleRemoveCollabImage = async () => {
    if (collabDialog.image) await deleteFromStorage(collabDialog.image);
    setCollabDialog(d => ({ ...d, image: undefined }));
  };
  const handleRemoveCollabVideo = async () => {
    if (collabDialog.video) await deleteFromStorage(collabDialog.video);
    setCollabDialog(d => ({ ...d, video: undefined }));
  };

  const shareLink = shareTarget ? `${window.location.origin}/${shareTarget.type}/${shareTarget.id}` : "";
  const filteredCollabs = collabs.filter(c => {
    const q = search.toLowerCase();
    const ms = !search || c.author.toLowerCase().includes(q) || c.title.toLowerCase().includes(q) || c.looking.toLowerCase().includes(q) || c.description.toLowerCase().includes(q) || c.skills.some(s => s.toLowerCase().includes(q));
    const mf = activeFilter === "All" || c.skills.some(s => s.toLowerCase().includes(activeFilter.toLowerCase())) || c.looking.toLowerCase().includes(activeFilter.toLowerCase());
    return ms && mf;
  });

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold mb-6 text-foreground">Community Feed</h1>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full mb-6">
            <TabsTrigger value="feed" className="flex-1">Feed</TabsTrigger>
            <TabsTrigger value="collabs" className="flex-1">Collabs</TabsTrigger>
          </TabsList>

          {/* ── FEED ── */}
          <TabsContent value="feed" className="space-y-4">
            <Dialog open={postDialog.open} onOpenChange={(v) => {
              if (!v) { handleRemovePostImage(); handleRemovePostVideo(); }
              setPostDialog(d => ({ ...d, open: v }));
            }}>
              <Button className="w-full h-12 gap-2 font-semibold" onClick={() => setPostDialog(d => ({ ...d, open: true }))}>
                <Plus className="h-4 w-4"/> Share an update
              </Button>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Share an update</DialogTitle>
                  <DialogDescription>Share your journey, ask a question, or celebrate a milestone.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Category</label>
                    <div className="flex flex-wrap gap-2">
                      {POST_TAGS.map(t => <Badge key={t} variant={postDialog.tag===t?"default":"outline"} className="cursor-pointer" onClick={() => setPostDialog(d => ({ ...d, tag: t }))}>{t}</Badge>)}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">What's on your mind?</label>
                    <Textarea value={postDialog.content} onChange={e => setPostDialog(d => ({ ...d, content: e.target.value }))} placeholder="Share what you're working on, ask for advice, or celebrate a win..." rows={4}/>
                  </div>
                  {postDialog.image && (
                    <div className="relative rounded-xl overflow-hidden">
                      <img src={postDialog.image} alt="preview" className="w-full max-h-48 object-cover"/>
                      <button onClick={handleRemovePostImage} className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70"><X className="h-3.5 w-3.5"/></button>
                    </div>
                  )}
                  {postDialog.video && (
                    <div className="relative rounded-xl overflow-hidden">
                      <video src={postDialog.video} controls className="w-full max-h-48 rounded-xl" style={{backgroundColor:"#000"}}/>
                      <button onClick={handleRemovePostVideo} className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70"><X className="h-3.5 w-3.5"/></button>
                    </div>
                  )}
                  {!postDialog.image && !postDialog.video && (
                    <MediaUploadBar
                      onImage={url => setPostDialog(d => ({ ...d, image: url }))}
                      onVideo={url => setPostDialog(d => ({ ...d, video: url }))}
                      onUploadingChange={v => setPostDialog(d => ({ ...d, uploading: v }))}
                    />
                  )}
                </div>
                <DialogFooter>
                  <Button onClick={handleCreatePost} disabled={!postDialog.content.trim() || postDialog.uploading} className="gap-2">
                    <Send className="h-4 w-4"/> {postDialog.uploading ? "Uploading..." : "Publish"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <AnimatePresence>
              {loading ? <FeedSkeleton /> : posts.length === 0 ? (
                <div className="text-center py-14 text-muted-foreground">
                  <p className="text-sm font-medium mb-1">No posts yet</p>
                  <p className="text-xs">Be the first to share something with the community!</p>
                </div>
              ) : posts.map(post => (
                <PostCard key={post.id} post={post} likedPosts={likedPosts} savedPosts={savedPosts} mutedAuthors={mutedAuthors}
                  onLike={handleLike} onSave={handleSavePost} onComment={handleOpenComments}
                  onDelete={handleDeletePost} onEdit={setEditingPost} onHide={handleHidePost}
                  onMute={setMuteTarget} onReport={id => setReportTarget({type:"post",id})}
                  onShare={id => setShareTarget({type:"post",id})}
                />
              ))}
            </AnimatePresence>
            {postsHasMore && !loading && (
              <div className="flex justify-center pt-2 pb-4">
                <Button variant="outline" onClick={fetchMorePosts} disabled={loadingMorePosts} className="gap-2">
                  {loadingMorePosts
                    ? <><div className="h-3.5 w-3.5 rounded-full border-2 border-primary border-t-transparent animate-spin" /> Loading…</>
                    : "Load more posts"}
                </Button>
              </div>
            )}
          </TabsContent>

          {/* ── COLLABS ── */}
          <TabsContent value="collabs" className="space-y-4">
            <Dialog open={collabDialog.open} onOpenChange={(v) => {
              if (!v) { handleRemoveCollabImage(); handleRemoveCollabVideo(); }
              setCollabDialog(d => ({ ...d, open: v }));
            }}>
              <Button className="w-full h-12 gap-2 font-semibold" onClick={() => setCollabDialog(d => ({ ...d, open: true }))}>
                <Plus className="h-4 w-4"/> Post a collaboration
              </Button>
              <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Post a collaboration</DialogTitle>
                  <DialogDescription>Tell the community what you're building and who you're looking for.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div><label className="text-sm font-medium mb-1.5 block">Project / idea name</label><Input value={collabDialog.title} onChange={e => setCollabDialog(d => ({ ...d, title: e.target.value }))} placeholder="e.g. Community Book Club Network" className="h-10"/></div>
                  <div><label className="text-sm font-medium mb-1.5 block">Looking for</label><Input value={collabDialog.looking} onChange={e => setCollabDialog(d => ({ ...d, looking: e.target.value }))} placeholder="e.g. Photographer, Sound Engineer, Marketing help" className="h-10"/></div>
                  <div><label className="text-sm font-medium mb-1.5 block">Describe your project</label><Textarea value={collabDialog.desc} onChange={e => setCollabDialog(d => ({ ...d, desc: e.target.value }))} placeholder="What are you building? What kind of help do you need?" rows={3}/></div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Relevant skills / areas</label>
                    <div className="flex flex-wrap gap-2">{SKILL_OPTIONS.map(s => <Badge key={s} variant={collabDialog.skills.includes(s)?"default":"outline"} className="cursor-pointer" onClick={() => setCollabDialog(d => ({ ...d, skills: d.skills.includes(s) ? d.skills.filter(x => x !== s) : [...d.skills, s] }))}>{s}</Badge>)}</div>
                  </div>
                  {collabDialog.image && (
                    <div className="relative rounded-xl overflow-hidden">
                      <img src={collabDialog.image} alt="preview" className="w-full max-h-40 object-cover"/>
                      <button onClick={handleRemoveCollabImage} className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/50 text-white flex items-center justify-center"><X className="h-3.5 w-3.5"/></button>
                    </div>
                  )}
                  {collabDialog.video && (
                    <div className="relative rounded-xl overflow-hidden">
                      <video src={collabDialog.video} controls className="w-full max-h-40 rounded-xl" style={{backgroundColor:"#000"}}/>
                      <button onClick={handleRemoveCollabVideo} className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/50 text-white flex items-center justify-center"><X className="h-3.5 w-3.5"/></button>
                    </div>
                  )}
                  {!collabDialog.image && !collabDialog.video && (
                    <MediaUploadBar
                      onImage={url => setCollabDialog(d => ({ ...d, image: url }))}
                      onVideo={url => setCollabDialog(d => ({ ...d, video: url }))}
                      onUploadingChange={v => setCollabDialog(d => ({ ...d, uploading: v }))}
                    />
                  )}
                </div>
                <DialogFooter>
                  <Button onClick={handleCreateCollab} disabled={!collabDialog.title.trim()||!collabDialog.looking.trim()||!collabDialog.desc.trim()||collabDialog.uploading} className="gap-2">
                    <Send className="h-4 w-4"/> {collabDialog.uploading ? "Uploading..." : "Post collab"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/>
              <Input placeholder="Search collaborations..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 h-10"/>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {COLLAB_FILTERS.map(f => <Badge key={f} variant={activeFilter===f?"default":"outline"} className="cursor-pointer shrink-0" onClick={() => setActiveFilter(f)}>{f}</Badge>)}
            </div>
            <p className="text-xs text-muted-foreground">{filteredCollabs.length} collab{filteredCollabs.length!==1?"s":""}</p>
            {filteredCollabs.length === 0 ? (
              <div className="text-center py-14 text-muted-foreground">
                <p className="text-sm font-medium mb-1">No collaborations found</p>
                <button className="text-xs text-primary hover:underline mt-1" onClick={() => { setSearch(""); setActiveFilter("All"); }}>Clear filters</button>
              </div>
            ) : (
              <AnimatePresence>
                {filteredCollabs.map(c => (
                  <CollabCard key={c.id} collab={c} interestedSet={interestedCollabs} savedCollabs={savedCollabs} mutedAuthors={mutedAuthors}
                    onInterest={handleInterest} onMessage={() => navigate("/messages")}
                    onSave={handleSaveCollab} onDelete={handleDeleteCollab} onEdit={setEditingCollab}
                    onHide={handleHideCollab} onMute={setMuteTarget}
                    onReport={id => setReportTarget({type:"collab",id})}
                    onShare={id => setShareTarget({type:"collab",id})}
                  />
                ))}
              </AnimatePresence>
            )}
            {collabsHasMore && !loading && (
              <div className="flex justify-center pt-2 pb-4">
                <Button variant="outline" onClick={fetchMoreCollabs} disabled={loadingMoreCollabs} className="gap-2">
                  {loadingMoreCollabs
                    ? <><div className="h-3.5 w-3.5 rounded-full border-2 border-primary border-t-transparent animate-spin" /> Loading…</>
                    : "Load more collabs"}
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <AnimatePresence>
        {commentingPost && <CommentSheet post={commentingPost} onClose={() => setCommentingPost(null)} onAddComment={handleAddComment}/>}
      </AnimatePresence>
      {editingPost && <EditPostDialog post={editingPost} open={!!editingPost} onClose={() => setEditingPost(null)} onSave={handleEditPost}/>}
      {editingCollab && <EditCollabDialog collab={editingCollab} open={!!editingCollab} onClose={() => setEditingCollab(null)} onSave={handleEditCollab}/>}
      {shareTarget && <ShareDialog open={!!shareTarget} onClose={() => setShareTarget(null)} link={shareLink}/>}
      {reportTarget && <ReportDialog open={!!reportTarget} onClose={() => setReportTarget(null)} target={reportTarget.type==="post"?"this post":"this collab"}/>}
      {muteTarget && <MuteDialog open={!!muteTarget} author={muteTarget} onClose={() => setMuteTarget(null)} onConfirm={() => handleMuteAuthor(muteTarget)}/>}
    </Layout>
  );
}
