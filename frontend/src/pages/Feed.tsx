import { useState, useRef, useEffect, useCallback, memo, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
  Trash2, Edit3, Bookmark, Share2, Flag, EyeOff, Handshake,
  X, Check, BookmarkCheck, ImageIcon, Link2, Video as VideoIcon, ZoomIn,
  SlidersHorizontal, ChevronLeft, ChevronRight,
} from "lucide-react";
import Layout from "@/components/Layout";
import { toast } from "@/hooks/use-toast";
import { useUser } from "@/context/UserContext";
import { supabase } from "@/lib/supabase";
import { checkContent, parseModerationError } from "@/security/moderation";
import { createNotification } from "@/api/notifications";
import { logger } from "@/lib/logger";
import VideoPlayer from "@/components/VideoPlayer";
import {
  getFeed,
  createPost, updatePost, deletePost,
  likePost, unlikePost,
  savePost, unsavePost,
  getComments, addComment, deleteComment,
  createCollab, updateCollab, deleteCollab,
  expressInterest, removeInterest,
  saveCollab, unsaveCollab,
} from "@/api/posts";
import { uploadPostImage, uploadVideo } from "@/api/uploads";
import { createReport } from "@/api/reports";
import { sendMessage } from "@/api/messages";
import { apiGet, isAbortError } from "@/api/client";

// ── Types ──────────────────────────────────────────────────────────────────
type Comment = { id: string; user_id: string; author: string; avatar: string; avatarUrl?: string; color: string; text: string; time: string; parentId?: string | null; role?: string; };
type Post = {
  id: string; user_id: string; author: string; avatar: string; avatarUrl?: string; avatarColor: string; location: string;
  authorSkills?: string[]; authorDeleted?: boolean; authorRole?: string;
  tag: string; time: string; createdAt: string; content: string; images: string[]; video?: string; likes: number; commentCount: number; isOwn: boolean;
  comments: Comment[];
};
type Collab = {
  id: string; user_id: string; author: string; avatar: string; avatarUrl?: string; avatarColor: string; location: string;
  authorSkills?: string[]; authorDeleted?: boolean; authorRole?: string;
  title: string; looking: string; description: string; skills: string[]; image?: string; video?: string; createdAt: string;
  isOwn: boolean;
};

// ── Constants ──────────────────────────────────────────────────────────────
const AVATAR_COLORS = ["bg-primary","bg-accent","bg-emerald-600","bg-violet-600","bg-sky-500","bg-rose-500","bg-amber-500","bg-teal-600"];
const POST_TAGS = ["General","Launch","Progress","Question","Idea","Milestone","Feedback","Story","Resource"];
// Single source of truth — collab skills used everywhere (post creation + browse filters)
import { SKILL_CATEGORIES, COLLAB_FILTERS as COLLAB_FILTERS_CONST } from "@/lib/skills";
const COLLAB_FILTERS: string[] = [...COLLAB_FILTERS_CONST];
const SKILL_OPTIONS: string[]  = [...SKILL_CATEGORIES];
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
function Avatar({ initials, color, url, size = "md" }: { initials: string; color: string; url?: string; size?: "sm"|"md"|"lg" }) {
  const sz = size==="sm" ? "h-7 w-7 text-xs" : size==="lg" ? "h-14 w-14 text-lg" : "h-10 w-10 text-sm";
  if (url) return <div className={`${sz} rounded-full overflow-hidden shrink-0`}><img src={url} alt={initials} loading="lazy" className="w-full h-full object-cover" /></div>;
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

// Storage cleanup is handled server-side by deletePost / deleteCollab API
async function deleteFromStorage(_url: string) {}

// Module-level cache — shared across all SmartVideo instances.
// Same URL is never fetched twice even if the component remounts (e.g. feed scroll).
const videoMetaCache = new Map<string, { hls_url?: string; thumbnail_url?: string } | null>();

// ── Smart Video — HLS-aware, falls back to native MP4 ────────────────────────
function SmartVideo({ src, className }: { src: string; className?: string }) {
  const [portrait, setPortrait] = useState(false);
  const [hlsSrc, setHlsSrc] = useState<string | null>(null);
  const [poster, setPoster] = useState<string | null>(null);

  // Look up processed HLS from videos table (lazy, non-blocking)
  useEffect(() => {
    if (!src) return;
    // Return cached result immediately — avoids one API call per mount
    if (videoMetaCache.has(src)) {
      const cached = videoMetaCache.get(src);
      if (cached?.hls_url) setHlsSrc(cached.hls_url);
      if (cached?.thumbnail_url) setPoster(cached.thumbnail_url);
      return;
    }
    let mounted = true;
    (async () => {
      const data = await apiGet<any>(`/api/uploads/video/by-url?fallback_url=${encodeURIComponent(src)}`).catch(() => null);
      videoMetaCache.set(src, data);
      if (!mounted) return;
      if (data?.hls_url) setHlsSrc(data.hls_url);
      if (data?.thumbnail_url) setPoster(data.thumbnail_url);
    })();
    return () => { mounted = false; };
  }, [src]);

  if (hlsSrc) {
    return (
      <VideoPlayer
        hlsSrc={hlsSrc}
        fallbackSrc={src}
        poster={poster}
        className={`rounded-xl ${portrait ? "mx-auto max-h-[70vh] w-auto max-w-full" : "w-full max-h-72"} ${className ?? ""}`}
      />
    );
  }

  return (
    <div className={portrait ? "flex justify-center" : ""}>
      <video
        src={src}
        poster={poster ?? undefined}
        controls
        disablePictureInPicture
        controlsList="nodownload nopictureinpicture"
        className={`rounded-xl ${portrait ? "max-h-[70vh] w-auto max-w-full" : "w-full max-h-72"} ${className ?? ""}`}
        style={{ backgroundColor: "#000" }}
        onLoadedMetadata={e => {
          const v = e.currentTarget;
          setPortrait(v.videoHeight > v.videoWidth);
        }}
      />
    </div>
  );
}

// ── Smart Image — auto portrait/landscape sizing with optional zoom overlay ─
function SmartImage({ src, alt, onClick }: { src: string; alt: string; onClick?: () => void }) {
  const [portrait, setPortrait] = useState(false);
  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const i = e.currentTarget;
    setPortrait(i.naturalHeight > i.naturalWidth);
  };
  const overlay = onClick ? (
    <div className="absolute inset-0 rounded-xl bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
      <ZoomIn className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
    </div>
  ) : null;
  if (portrait) {
    return (
      <div className={`flex justify-center ${onClick ? "cursor-pointer" : ""}`} onClick={onClick}>
        <div className="relative group">
          <img src={src} alt={alt} loading="lazy" className="max-h-[70vh] w-auto max-w-full rounded-xl block" onLoad={handleLoad} />
          {overlay}
        </div>
      </div>
    );
  }
  return (
    <div className={`relative group ${onClick ? "cursor-pointer" : ""}`} onClick={onClick}>
      <img src={src} alt={alt} loading="lazy" className="w-full rounded-xl block" onLoad={handleLoad} />
      {overlay}
    </div>
  );
}

// ── Preview Image — for create/edit forms with remove button ───────────────
function PreviewImage({ src, alt, onRemove }: { src: string; alt: string; onRemove: () => void }) {
  const [portrait, setPortrait] = useState(false);
  return (
    <div className={`relative rounded-xl overflow-hidden ${portrait ? "flex justify-center bg-muted/40" : ""}`}>
      <img
        src={src}
        alt={alt}
        className={portrait ? "max-h-64 w-auto max-w-full rounded-xl block" : "w-full rounded-xl block"}
        onLoad={e => { const i = e.currentTarget; setPortrait(i.naturalHeight > i.naturalWidth); }}
      />
      <button
        onClick={onRemove}
        className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 z-10"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── Image Lightbox ─────────────────────────────────────────────────────────
function ImageLightbox({ images, startIndex, onClose }: { images: string[]; startIndex?: number; onClose: () => void }) {
  const [current, setCurrent] = useState(startIndex ?? 0);
  const prev = () => setCurrent(i => (i - 1 + images.length) % images.length);
  const next = () => setCurrent(i => (i + 1) % images.length);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && images.length > 1) prev();
      if (e.key === "ArrowRight" && images.length > 1) next();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, images.length]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      onClick={onClose}>
      <button onClick={onClose}
        className="absolute top-4 right-4 h-9 w-9 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors z-10">
        <X className="h-5 w-5" />
      </button>
      {images.length > 1 && (
        <>
          <button onClick={e => { e.stopPropagation(); prev(); }}
            className="absolute left-4 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors z-10">
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button onClick={e => { e.stopPropagation(); next(); }}
            className="absolute right-16 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors z-10">
            <ChevronRight className="h-6 w-6" />
          </button>
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
            {images.map((_, i) => (
              <button key={i} onClick={e => { e.stopPropagation(); setCurrent(i); }}
                className={`h-1.5 rounded-full transition-all ${i === current ? "w-5 bg-white" : "w-1.5 bg-white/40"}`} />
            ))}
          </div>
        </>
      )}
      <img
        src={images[current]} alt="Full size"
        className="max-w-full max-h-[90vh] rounded-xl object-contain"
        onClick={e => e.stopPropagation()}
      />
    </div>
  );
}

// ── Image ratio system ─────────────────────────────────────────────────────
type ImgRatio = "square" | "portrait" | "landscape";

function classifyRatio(w: number, h: number): ImgRatio {
  const r = w / h;
  if (r >= 1.3) return "landscape";  // wider than ~4:3
  if (r <= 0.9) return "portrait";   // taller than ~9:10
  return "square";
}

const RATIO_STYLE: Record<ImgRatio, string> = {
  portrait:  "4/5",
  square:    "1/1",
  landscape: "16/9",
};

// Detect image dimensions off-DOM via new Image() — works regardless of lazy/visibility
function useImageRatio(src: string): ImgRatio | null {
  const [ratio, setRatio] = useState<ImgRatio | null>(null);
  useEffect(() => {
    if (!src) return;
    const img = new Image();
    img.onload = () => setRatio(classifyRatio(img.naturalWidth, img.naturalHeight));
    img.src = src;
  }, [src]);
  return ratio;
}

// FeedImage — single image, detects own ratio, blurred bg for landscape
function FeedImage({ src, alt, onClick }: { src: string; alt: string; onClick?: () => void }) {
  const ratio = useImageRatio(src);
  const [loaded, setLoaded] = useState(false);
  // Default to portrait skeleton until ratio is known
  const displayRatio = ratio ?? "portrait";

  return (
    <div
      className="relative w-full rounded-xl overflow-hidden bg-muted cursor-pointer select-none"
      style={{ aspectRatio: RATIO_STYLE[displayRatio] }}
      onClick={onClick}
    >
      {/* Blurred background for landscape — fills letterbox bars */}
      {ratio === "landscape" && loaded && (
        <img src={src} aria-hidden
          className="absolute inset-0 w-full h-full object-cover scale-110 blur-xl opacity-50 pointer-events-none" />
      )}
      {/* Skeleton */}
      {!loaded && <div className="absolute inset-0 bg-muted animate-pulse" />}
      {/* Main image */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className={`relative w-full h-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
      />
      {/* Zoom hint */}
      {onClick && loaded && (
        <div className="absolute inset-0 bg-black/0 hover:bg-black/15 transition-colors flex items-center justify-center group pointer-events-none">
          <ZoomIn className="h-7 w-7 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
        </div>
      )}
    </div>
  );
}

// ── Image Carousel ─────────────────────────────────────────────────────────
// Each slide uses its OWN detected ratio — landscape images show as landscape,
// portrait as portrait. Container smoothly adjusts height between slides.
function ImageCarousel({ images, onClickIndex }: { images: string[]; onClickIndex: (i: number) => void }) {
  const [current, setCurrent] = useState(0);
  // Detect ratios lazily — only for the current slide and its neighbours
  const [ratios, setRatios] = useState<Record<number, ImgRatio>>({});
  const [slidesLoaded, setSlidesLoaded] = useState<Record<number, boolean>>({});
  const ratiosRef = useRef<Record<number, ImgRatio>>({});

  useEffect(() => {
    if (images.length === 0) return;
    // Preload current, next, and previous — not the whole array
    const toLoad = [...new Set([
      current,
      (current + 1) % images.length,
      (current - 1 + images.length) % images.length,
    ])];
    toLoad.forEach(i => {
      if (ratiosRef.current[i] !== undefined) return; // already known
      const img = new Image();
      img.onload = () => {
        ratiosRef.current[i] = classifyRatio(img.naturalWidth, img.naturalHeight);
        setRatios({ ...ratiosRef.current });
      };
      img.src = images[i];
    });
  }, [current, images]);

  const prev = (e: React.MouseEvent) => { e.stopPropagation(); setCurrent(i => (i - 1 + images.length) % images.length); };
  const next = (e: React.MouseEvent) => { e.stopPropagation(); setCurrent(i => (i + 1) % images.length); };

  if (images.length === 0) return null;
  if (images.length === 1) return <FeedImage src={images[0]} alt="post image" onClick={() => onClickIndex(0)} />;

  const currentRatio: ImgRatio = ratios[current] ?? "portrait";
  const isLandscape = currentRatio === "landscape";

  return (
    <div
      className="relative rounded-xl overflow-hidden select-none bg-muted"
      style={{ aspectRatio: RATIO_STYLE[currentRatio], transition: "aspect-ratio 0.2s ease" }}
    >
      {/* Blurred background for landscape */}
      {isLandscape && slidesLoaded[current] && (
        <img src={images[current]} aria-hidden
          className="absolute inset-0 w-full h-full object-cover scale-110 blur-xl opacity-50 pointer-events-none" />
      )}
      {/* Skeleton until this slide's image loads */}
      {!slidesLoaded[current] && <div className="absolute inset-0 bg-muted animate-pulse" />}
      {/* Active slide */}
      <img
        src={images[current]}
        alt={`photo ${current + 1} of ${images.length}`}
        className={`relative w-full h-full object-cover cursor-pointer transition-opacity duration-200 ${slidesLoaded[current] ? "opacity-100" : "opacity-0"}`}
        onClick={() => onClickIndex(current)}
        loading="eager"
        onLoad={() => setSlidesLoaded(prev => ({ ...prev, [current]: true }))}
      />
      {/* Navigation arrows */}
      <button onClick={prev}
        className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black/40 flex items-center justify-center text-white hover:bg-black/60 transition-colors z-10">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button onClick={next}
        className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black/40 flex items-center justify-center text-white hover:bg-black/60 transition-colors z-10">
        <ChevronRight className="h-4 w-4" />
      </button>
      {/* Dot indicators */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1 z-10">
        {images.map((_, i) => (
          <button key={i} onClick={e => { e.stopPropagation(); setCurrent(i); }}
            className={`rounded-full transition-all ${i === current ? "w-4 h-1.5 bg-white" : "w-1.5 h-1.5 bg-white/50"}`} />
        ))}
      </div>
      {/* Counter */}
      <span className="absolute top-2 right-2 bg-black/50 text-white text-xs font-medium px-2 py-0.5 rounded-full z-10">
        {current + 1}/{images.length}
      </span>
    </div>
  );
}

// ── Media Upload Bar ───────────────────────────────────────────────────────
function MediaUploadBar({ images, onAddImage, onRemoveImage, onVideo, onUploadingChange, hasVideo, userId }: {
  images: string[];
  onAddImage: (url: string) => void;
  onRemoveImage: (i: number) => void;
  onVideo: (url: string) => void;
  onUploadingChange?: (uploading: boolean) => void;
  hasVideo?: boolean;
  userId: string;
}) {
  const imgRef = useRef<HTMLInputElement>(null);
  const vidRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadLabel, setUploadLabel] = useState("");

  const canAddMore = images.length < 4;

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>, cb: (url: string) => void, type: "image" | "video") => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setUploading(true);
    onUploadingChange?.(true);

    if (type === "video") {
      try {
        setUploadLabel("Uploading…  0%");
        const result = await uploadVideo(file, "feed", (pct) => setUploadLabel(`Uploading… ${pct}%`));
        setUploadLabel("Video ready ✓"); setTimeout(() => setUploadLabel(""), 2000);
        cb(result.fallbackUrl);
      } catch (err: any) {
        toast({ title: err.message || "Video upload failed.", variant: "destructive" });
        setUploadLabel("");
      } finally {
        setUploading(false); onUploadingChange?.(false);
      }
      return;
    }

    // Image upload via API
    try {
      setUploadLabel("Uploading…");
      const result = await uploadPostImage(file, "feed");
      cb(result.url);
      setUploadLabel("Photo uploaded ✓"); setTimeout(() => setUploadLabel(""), 2000);
    } catch (err: any) {
      toast({ title: err.message || "Upload failed, try again.", variant: "destructive" });
      setUploadLabel("");
    } finally {
      setUploading(false); onUploadingChange?.(false);
    }
  };

  return (
    <div className="space-y-2">
      {/* Image previews grid — fixed 112px height per cell, no layout shift */}
      {images.length > 0 && (
        <div className={`grid gap-2 ${images.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
          {images.map((url, i) => (
            <div key={i} className="relative rounded-xl overflow-hidden bg-muted" style={{ height: 112 }}>
              <img src={url} alt={`photo ${i + 1}`} className="w-full h-full object-cover" />
              <button
                onClick={() => onRemoveImage(i)}
                className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 z-10"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {/* Add more slot — same fixed height */}
          {canAddMore && !hasVideo && (
            <button
              type="button"
              onClick={() => imgRef.current?.click()}
              disabled={uploading}
              style={{ height: 112 }}
              className="rounded-xl border-2 border-dashed border-border hover:border-primary flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              <ImageIcon className="h-5 w-5" />
              <span className="text-xs">Add photo</span>
            </button>
          )}
        </div>
      )}
      {/* Buttons row — shown when no images yet or always for video */}
      {images.length === 0 && (
        <div className="flex gap-2">
          <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={e => handleFile(e, onAddImage, "image")} />
          <input ref={vidRef} type="file" accept="video/mp4,video/quicktime,.mp4,.mov" className="hidden" onChange={e => handleFile(e, onVideo, "video")} />
          <button type="button" onClick={() => imgRef.current?.click()} disabled={uploading || hasVideo}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground border border-dashed border-border hover:border-primary rounded-lg px-3 py-2 transition-colors flex-1 justify-center disabled:opacity-50">
            <ImageIcon className="h-4 w-4" /> Photo
          </button>
          <button type="button" onClick={() => vidRef.current?.click()} disabled={uploading || images.length > 0}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground border border-dashed border-border hover:border-primary rounded-lg px-3 py-2 transition-colors flex-1 justify-center disabled:opacity-50">
            <VideoIcon className="h-4 w-4" /> Video
          </button>
        </div>
      )}
      {/* Hidden inputs when images exist */}
      {images.length > 0 && (
        <input ref={imgRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => handleFile(e, onAddImage, "image")} />
      )}
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

// ── Share Sheet ────────────────────────────────────────────────────────────
function ShareDialog({ onClose, link, content }: {
  onClose: () => void;
  link: string;
  content?: { text: string; authorName: string; type: "post" | "collab"; postId?: string; imageUrl?: string; collabTitle?: string };
}) {
  const { user } = useUser();
  const [connections, setConnections] = useState<{ id: string; name: string; avatar: string; avatarUrl?: string; color: string }[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [connSearch, setConnSearch] = useState("");
  const [loadingConns, setLoadingConns] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!user.id) return;
    (async () => {
      const conns = await apiGet<any[]>("/api/connections").catch(() => []);
      const all = conns
        .filter((c: any) => c.status === "accepted")
        .map((c: any) => {
          const p = c.requester_id === user.id ? c.receiver_profile : c.requester_profile;
          return p ? { id: p.id, name: p.name || "Unknown", avatar: p.avatar || "?", avatarUrl: p.avatar_url || undefined, color: p.color || "bg-primary" } : null;
        })
        .filter(Boolean);
      setConnections(all);
      setLoadingConns(false);
    })();
  }, [user.id]);

  const toggleConn = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const handleSendToConnections = async () => {
    if (!selected.size || !user.id || sending || !content) return;
    setSending(true);
    const payload = JSON.stringify({
      type: content.type,
      id: content.postId || null,
      author: content.authorName,
      caption: content.text,
      image: content.imageUrl || null,
      title: content.collabTitle || null,
    });
    const chatIds = [...selected].map(receiverId => {
      const sorted = [user.id, receiverId].sort();
      return `${sorted[0]}_${sorted[1]}`;
    });
    await Promise.all(chatIds.map((chatId, i) =>
      sendMessage(payload, chatId, { mediaType: "shared_post" })
    ));
    toast({ title: `Sent to ${selected.size} connection${selected.size > 1 ? "s" : ""} ✓` });
    setSending(false);
    onClose();
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Fallback for browsers that block clipboard API
      const el = document.createElement("textarea");
      el.value = link;
      el.style.cssText = "position:fixed;opacity:0;top:0;left:0";
      document.body.appendChild(el);
      el.focus();
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    toast({ title: "Link copied! 🔗" });
    onClose();
  };

  const filteredConns = connections.filter(c => c.name.toLowerCase().includes(connSearch.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center animate-in fade-in duration-150">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm bg-background rounded-t-2xl sm:rounded-2xl shadow-2xl border border-border animate-in slide-in-from-bottom-4 duration-200 flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <h3 className="font-semibold text-foreground">Share</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Choose where to share</p>
          </div>
          <button onClick={onClose} className="h-7 w-7 rounded-full bg-muted flex items-center justify-center hover:bg-secondary transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {SHARE_PLATFORMS.map((p) => {
                const IconComp = p.icon;
                return (
                  <a key={p.name} href={p.url(link)} target="_blank" rel="noreferrer" onClick={onClose}
                    className="flex flex-col items-center gap-1.5 p-2 rounded-xl hover:bg-muted transition-colors cursor-pointer">
                    <div className="h-11 w-11 rounded-2xl flex items-center justify-center shadow-sm shrink-0"
                      style={{ background: p.color }}>
                      <IconComp />
                    </div>
                    <span className="text-[11px] text-muted-foreground text-center leading-tight">{p.name}</span>
                  </a>
                );
              })}
            </div>
            <button onClick={copyLink}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-muted hover:bg-secondary transition-colors">
              <div className="h-9 w-9 rounded-xl bg-background border border-border flex items-center justify-center shrink-0">
                <Link2 className="h-4 w-4 text-foreground" />
              </div>
              <div className="text-left min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">Copy link</p>
                <p className="text-xs text-muted-foreground truncate">{link}</p>
              </div>
            </button>
          </div>
          {content && (
            <>
              <div className="border-t border-border mx-4" />
              <div className="px-4 pt-3 pb-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Send to connections</p>
                {selected.size > 0 && <p className="text-xs text-primary mt-0.5">{selected.size} selected</p>}
              </div>
              <div className="px-4 pb-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    value={connSearch}
                    onChange={e => setConnSearch(e.target.value)}
                    placeholder="Search connections…"
                    className="w-full pl-9 pr-3 py-2 text-sm bg-muted rounded-lg outline-none placeholder:text-muted-foreground"
                  />
                </div>
              </div>
              <div className="pb-2">
                {loadingConns ? (
                  <div className="flex items-center justify-center py-6">
                    <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                  </div>
                ) : filteredConns.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">
                    {connections.length === 0 ? "No connections yet — connect with people on Discover!" : "No results"}
                  </div>
                ) : (
                  filteredConns.map(c => {
                    const isSel = selected.has(c.id);
                    return (
                      <button
                        key={c.id}
                        onClick={() => toggleConn(c.id)}
                        className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/60 transition-colors ${isSel ? "bg-primary/5" : ""}`}
                      >
                        <div className={`h-10 w-10 rounded-full flex items-center justify-center text-white font-semibold shrink-0 overflow-hidden ${c.avatarUrl ? "" : c.color}`}>
                          {c.avatarUrl ? <img src={c.avatarUrl} alt={c.name} className="w-full h-full object-cover" /> : c.avatar}
                        </div>
                        <span className="flex-1 text-left text-sm font-medium text-foreground">{c.name}</span>
                        <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${isSel ? "bg-primary border-primary" : "border-border"}`}>
                          {isSel && <Check className="h-3 w-3 text-primary-foreground" />}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
              <div className="px-4 pb-4">
                <Button className="w-full gap-2" disabled={!selected.size || sending} onClick={handleSendToConnections}>
                  {sending
                    ? <div className="h-4 w-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                    : <Send className="h-4 w-4" />}
                  {sending ? "Sending…" : `Send${selected.size > 0 ? ` (${selected.size})` : ""}`}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Report Dialog ──────────────────────────────────────────────────────────
function ReportDialog({ open, onClose, target, targetType, targetId }: {
  open: boolean; onClose: () => void; target: string;
  targetType: "post" | "collab" | "comment"; targetId: string;
}) {
  const { user } = useUser();
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!reason) return;
    setSubmitting(true);
    try {
      await createReport({
        targetId,
        targetType,
        reason,
        details: details.trim() || undefined,
      });
    } catch { /* non-fatal — still show success */ }
    setSubmitting(false);
    setSubmitted(true);
  };

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
              <Button onClick={submit} disabled={!reason || submitting} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                {submitting ? "Submitting…" : "Submit report"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Comment Sheet ──────────────────────────────────────────────────────────
function CommentSheet({ post, currentUserId, onClose, onAddComment, onDeleteComment, onEditComment, onReportComment }: {
  post: Post;
  currentUserId: string;
  onClose: () => void;
  onAddComment: (postId: string, text: string, parentId?: string | null) => void;
  onDeleteComment: (commentId: string, postId: string) => void;
  onEditComment: (commentId: string, postId: string, text: string) => void;
  onReportComment: (commentId: string) => void;
}) {
  const { user } = useUser();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [replyingTo, setReplyingTo] = useState<{ id: string; author: string } | null>(null);
  const [mentionSuggestions, setMentionSuggestions] = useState<{ id: string; name: string; avatar: string; color: string; avatar_url?: string }[]>([]);
  const [mentionStart, setMentionStart] = useState(-1);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string|null>(null);
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 100); }, []);

  // Build threaded structure
  const topLevel = post.comments.filter(c => !c.parentId);
  const repliesMap: Record<string, Comment[]> = {};
  post.comments.forEach(c => {
    if (c.parentId) {
      if (!repliesMap[c.parentId]) repliesMap[c.parentId] = [];
      repliesMap[c.parentId].push(c);
    }
  });

  const handleTextChange = (val: string) => {
    setText(val);
    const cursor = inputRef.current?.selectionStart ?? val.length;
    const before = val.slice(0, cursor);
    const atMatch = before.match(/@([\w][\w ]*)$/);
    if (atMatch) {
      const query = atMatch[1].trimEnd();
      setMentionStart(cursor - atMatch[0].length);
      if (query.length >= 1) {
        apiGet<any[]>(`/api/users/discover?search=${encodeURIComponent(query)}&limit=5`)
          .then(data => setMentionSuggestions(data || []))
          .catch(() => {});
      } else {
        setMentionSuggestions([]);
      }
    } else {
      setMentionSuggestions([]);
      setMentionStart(-1);
    }
  };

  const selectMention = (profile: { name: string }) => {
    const cursor = inputRef.current?.selectionStart ?? text.length;
    const before = text.slice(0, mentionStart);
    const after = text.slice(cursor);
    // Use non-breaking spaces in multi-word names so the mention is one token
    const newText = `${before}@${profile.name.replace(/ /g, '\u00A0')} ${after}`;
    setText(newText);
    setMentionSuggestions([]);
    setMentionStart(-1);
    setTimeout(() => {
      inputRef.current?.focus();
      const pos = before.length + profile.name.length + 2;
      inputRef.current?.setSelectionRange(pos, pos);
    }, 0);
  };

  const submit = () => {
    if (!text.trim()) return;
    onAddComment(post.id, text.trim(), replyingTo?.id ?? null);
    setText("");
    setReplyingTo(null);
    setMentionSuggestions([]);
  };

  const startReply = (c: Comment) => {
    setReplyingTo({ id: c.id, author: c.author });
    setText(`@${c.author.replace(/ /g, '\u00A0')} `);
    setTimeout(() => { inputRef.current?.focus(); inputRef.current?.setSelectionRange(9999, 9999); }, 50);
  };

  const startEdit = (c: Comment) => {
    setEditingId(c.id);
    setEditText(c.text);
    setTimeout(() => editRef.current?.focus(), 50);
  };

  const submitEdit = () => {
    if (!editText.trim() || !editingId) return;
    onEditComment(editingId, post.id, editText.trim());
    setEditingId(null);
  };

  const renderMentions = (txt: string) => {
    // Avoid \s — in modern JS \s matches \u00A0 (NBSP), which is used to join
    // multi-word names. Use explicit ASCII whitespace so NBSP stays in the token.
    const parts = txt.split(/(@[^ \t\n\r\f\v]+)/g);
    return parts.map((part, i) =>
      part.startsWith("@")
        ? <span key={i} className="text-primary font-medium mr-0.5">{part.replace(/\u00A0/g, ' ')}</span>
        : <span key={i}>{part}</span>
    );
  };

  const renderComment = (c: Comment, isReply = false) => (
    <div key={c.id} className={`flex gap-3 ${isReply ? "ml-8 mt-2.5" : ""}`}>
      <Avatar initials={c.avatar} color={c.color || AVATAR_COLORS[0]} url={c.avatarUrl} size="sm" />
      <div className="flex-1 min-w-0">
        {editingId === c.id ? (
          <div className="bg-secondary rounded-xl px-3 py-2.5">
            <textarea ref={editRef} value={editText} onChange={e => setEditText(e.target.value)}
              className="w-full text-sm bg-transparent resize-none outline-none leading-relaxed" rows={2}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitEdit(); } if (e.key === "Escape") setEditingId(null); }} />
            <div className="flex gap-3 mt-1.5">
              <button onClick={submitEdit} className="text-xs text-primary font-semibold hover:opacity-80">Save</button>
              <button onClick={() => setEditingId(null)} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
            </div>
          </div>
        ) : (
          <div className={`bg-secondary rounded-xl px-3 py-2.5 ${isReply ? "border-l-2 border-primary/30" : ""}`}>
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`inline-flex items-center gap-1 text-xs font-semibold text-foreground ${c.user_id !== currentUserId ? "cursor-pointer hover:underline" : ""}`}
                onClick={() => { if (c.user_id === currentUserId) navigate("/profile"); else navigate(`/profile/${c.user_id}`); }}
              >
                {c.author}
                {c.role === "admin" && (
                  <span title="Verified" className="shrink-0 h-3.5 w-3.5 rounded-full bg-blue-500 inline-flex items-center justify-center">
                    <Check className="h-2 w-2 text-white stroke-[3]" />
                  </span>
                )}
              </span>
              <span className="text-xs text-muted-foreground">{c.time}</span>
            </div>
            <p className="text-sm text-foreground leading-relaxed">{renderMentions(c.text)}</p>
          </div>
        )}
        {editingId !== c.id && (
          <div className="flex items-center gap-3 mt-1 ml-1">
            {c.user_id === currentUserId ? (
              <>
                <button onClick={() => startEdit(c)} className="text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors">Edit</button>
                <button onClick={() => onDeleteComment(c.id, post.id)} className="text-[11px] font-medium text-destructive/60 hover:text-destructive transition-colors">Delete</button>
              </>
            ) : (
              <>
                {!isReply && (
                  <button onClick={() => startReply(c)} className="text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors">Reply</button>
                )}
                {post.user_id === currentUserId ? (
                  <button onClick={() => onDeleteComment(c.id, post.id)} className="text-[11px] font-medium text-destructive/60 hover:text-destructive transition-colors">Delete</button>
                ) : (
                  <button onClick={() => onReportComment(c.id)} className="text-[11px] font-medium text-muted-foreground/60 hover:text-destructive transition-colors">Report</button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center animate-in fade-in duration-150">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg bg-background rounded-t-2xl sm:rounded-2xl shadow-2xl border border-border flex flex-col max-h-[80vh] animate-in slide-in-from-bottom-4 duration-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h3 className="font-semibold text-foreground">Comments · {post.commentCount}</h3>
          <button onClick={onClose} className="h-7 w-7 rounded-full bg-muted flex items-center justify-center hover:bg-secondary transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        {post.images.length > 0 && (
          <div className="px-5 pt-3">
            <img
              src={post.images[0]}
              alt="post"
              className="w-full max-h-40 object-cover rounded-xl cursor-pointer"
              onClick={() => setLightboxSrc(post.images[0])}
            />
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {post.comments.length === 0 && (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">No comments yet. Be the first!</p>
            </div>
          )}
          {topLevel.map(c => (
            <div key={c.id}>
              {renderComment(c, false)}
              {(repliesMap[c.id] || []).map(r => renderComment(r, true))}
            </div>
          ))}
        </div>
        <div className="px-5 py-4 border-t border-border shrink-0">
          {replyingTo && (
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-primary font-medium">Replying to @{replyingTo.author}</span>
              <button onClick={() => { setReplyingTo(null); setText(""); }} className="ml-auto text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
          {mentionSuggestions.length > 0 && (
            <div className="mb-2 bg-card border border-border rounded-lg shadow-lg overflow-hidden">
              {mentionSuggestions.map(p => (
                <button key={p.id} type="button" onMouseDown={() => selectMention(p)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-secondary transition-colors">
                  <Avatar initials={p.avatar || p.name?.slice(0,2).toUpperCase()} color={p.color || "bg-primary"} url={p.avatar_url} size="sm" />
                  <span className="font-medium text-foreground">{p.name}</span>
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Avatar initials={user.avatar} color={user.color} url={user.avatarUrl || undefined} size="sm" />
            <div className="flex-1 flex gap-2">
              <Textarea ref={inputRef} value={text} onChange={(e) => handleTextChange(e.target.value)}
                placeholder={replyingTo ? `Reply to @${replyingTo.author}…` : "Write a comment…"} rows={1}
                className="resize-none text-sm min-h-[38px] max-h-[100px] py-2"
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }} />
              <button onClick={submit} disabled={!text.trim()}
                className="h-9 w-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-40 shrink-0">
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
      {lightboxSrc && <ImageLightbox images={[lightboxSrc]} onClose={() => setLightboxSrc(null)} />}
    </div>
  );
}

// ── Edit Post Dialog ───────────────────────────────────────────────────────
function EditPostDialog({ post, open, onClose, onSave, userId }: {
  post: Post; open: boolean; onClose: () => void;
  onSave: (id: string, content: string, tag: string, images: string[], video?: string) => void;
  userId: string;
}) {
  const [content, setContent] = useState(post.content);
  const [tag, setTag] = useState(post.tag);
  const [images, setImages] = useState<string[]>(post.images);
  const [video, setVideo] = useState<string|undefined>(post.video);
  const [editUploading, setEditUploading] = useState(false);

  const removeImageAt = async (i: number) => {
    const url = images[i];
    if (url) await deleteFromStorage(url);
    setImages(p => p.filter((_, idx) => idx !== i));
  };
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
          {video && (
            <div className="relative rounded-xl overflow-hidden">
              <video src={video} controls className="w-full max-h-48 rounded-xl" />
              <button onClick={removeVideo} className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70"><X className="h-3.5 w-3.5"/></button>
            </div>
          )}
          {!video && (
            <MediaUploadBar
              images={images}
              onAddImage={url => setImages(p => [...p, url])}
              onRemoveImage={removeImageAt}
              onVideo={setVideo}
              onUploadingChange={setEditUploading}
              hasVideo={!!video}
              userId={userId}
            />
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { onSave(post.id, content, tag, images, video); onClose(); }} disabled={!content.trim() || editUploading} className="gap-1.5">
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
  const [customSkillInput, setCustomSkillInput] = useState("");
  const toggle = (s: string) => setSkills((p) => p.includes(s)?p.filter((x)=>x!==s):[...p,s]);

  const addCustomSkill = () => {
    const val = customSkillInput.trim();
    if (val && !skills.includes(val)) setSkills(p => [...p, val]);
    setCustomSkillInput("");
  };

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
            <div className="flex flex-wrap gap-2">
              {SKILL_OPTIONS.map((s)=><Badge key={s} variant={skills.includes(s)?"default":"outline"} className="cursor-pointer" onClick={()=>toggle(s)}>{s}</Badge>)}
              {skills.filter(s => !(SKILL_OPTIONS as readonly string[]).includes(s)).map(s => (
                <Badge key={s} variant="default" className="cursor-pointer gap-1" onClick={() => setSkills(p => p.filter(x => x !== s))}>
                  {s} <X className="h-2.5 w-2.5"/>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <Input placeholder="Other skill" value={customSkillInput} onChange={e => setCustomSkillInput(e.target.value)}
                className="h-8 text-sm" onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustomSkill(); } }}/>
              <Button type="button" size="sm" variant="outline" className="h-8 px-3 shrink-0" onClick={addCustomSkill}>Add</Button>
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={()=>{onSave(collab.id,{title,looking,description:desc,skills});onClose();}} disabled={!title.trim()} className="gap-1.5">
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
const PostCard = memo(function PostCard({ post, likedPosts, savedPosts, highlighted, onLike, onSave, onComment, onDelete, onEdit, onHide, onReport, onShare }: {
  post: Post; likedPosts: Set<string>; savedPosts: Set<string>; highlighted?: boolean;
  onLike:(id:string)=>void; onSave:(id:string)=>void; onComment:(p:Post)=>void;
  onDelete:(id:string)=>void; onEdit:(p:Post)=>void; onHide:(id:string)=>void;
  onReport:(id:string)=>void; onShare:(id:string)=>void;
}) {
  const isLiked = likedPosts.has(post.id);
  const isSaved = savedPosts.has(post.id);
  const navigate = useNavigate();
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const POST_PREVIEW_WORDS = 150;
  const postWords = post.content.split(/\s+/);
  const needsReadMore = postWords.length > POST_PREVIEW_WORDS;
  const displayContent = !expanded && needsReadMore
    ? postWords.slice(0, POST_PREVIEW_WORDS).join(" ") + "…"
    : post.content;

  const goToProfile = () => {
    if (post.authorDeleted) return;
    if (post.isOwn) { navigate("/profile"); return; }
    navigate(`/profile/${post.user_id}`);
  };

  return (
    <>
      <div data-post-id={post.id}
        className={`rounded-xl border border-border bg-card hover:shadow-sm transition-shadow overflow-hidden${highlighted ? " ring-2 ring-primary" : ""}`}>
        <div className="flex items-center gap-3 px-5 pt-5 pb-3">
          <div className={`shrink-0 ${!post.authorDeleted ? "cursor-pointer hover:opacity-80 transition-opacity" : ""}`} onClick={goToProfile}>
            <Avatar initials={post.authorDeleted ? "?" : post.avatar} color={post.authorDeleted ? "bg-muted" : post.avatarColor} url={post.authorDeleted ? undefined : post.avatarUrl}/>
          </div>
          <div className="flex-1 min-w-0">
            <span className={`inline-flex items-center gap-1 font-semibold text-sm text-left ${post.authorDeleted ? "text-muted-foreground italic" : "text-foreground cursor-pointer hover:underline"}`} onClick={goToProfile}>
              {post.author}
              {!post.authorDeleted && post.authorRole === "admin" && (
                <span title="Verified" className="shrink-0 h-4 w-4 rounded-full bg-blue-500 inline-flex items-center justify-center">
                  <Check className="h-2.5 w-2.5 text-white stroke-[3]" />
                </span>
              )}
            </span>
            {!post.authorDeleted && post.authorSkills && post.authorSkills.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-0.5">
                {post.authorSkills.map(s => <span key={s} className="text-xs font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full">{s}</span>)}
              </div>
            )}
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              {!post.authorDeleted && <><MapPin className="h-3 w-3 shrink-0"/> {post.location} · </>}{post.time}
            </p>
          </div>
          <span className="text-[10px] text-muted-foreground/70 shrink-0 font-normal">{post.tag}</span>
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
                  <DropdownMenuSeparator/>
                  <DropdownMenuItem onClick={()=>onReport(post.id)} className="gap-2 text-destructive focus:text-destructive"><Flag className="h-4 w-4"/> Report post</DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="px-5 pb-3">
          <p className="text-sm text-foreground leading-relaxed break-words">{displayContent}</p>
          {needsReadMore && (
            <button onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
              className="text-xs text-primary font-medium mt-1 hover:opacity-75 transition-opacity">
              {expanded ? "Show less" : "Read more"}
            </button>
          )}
        </div>
        {post.images.length > 0 && (
          <div className="px-5 pb-3">
            <ImageCarousel images={post.images} onClickIndex={i => setLightbox({ images: post.images, index: i })} />
          </div>
        )}
        {post.video && <div className="px-5 pb-3"><SmartVideo src={post.video} /></div>}
        <div className="flex items-center gap-1 border-t border-border px-3 py-2">
          <button onClick={()=>onLike(post.id)} className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors ${isLiked?"text-rose-500 bg-rose-50":"text-muted-foreground hover:bg-muted"}`}>
            <Heart className={`h-4 w-4 ${isLiked?"fill-current":""}`}/> {post.likes}
          </button>
          <button onClick={()=>onComment(post)} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg text-muted-foreground hover:bg-muted transition-colors">
            <MessageCircle className="h-4 w-4"/> {post.commentCount}
          </button>
          <button onClick={()=>onSave(post.id)} className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors ml-auto ${isSaved?"text-primary bg-primary/10":"text-muted-foreground hover:bg-muted"}`}>
            <Bookmark className={`h-4 w-4 ${isSaved?"fill-current":""}`}/><span className="hidden sm:inline">{isSaved?"Saved":"Save"}</span>
          </button>
          <button onClick={()=>onShare(post.id)} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg text-muted-foreground hover:bg-muted transition-colors" title="Share">
            <Share2 className="h-4 w-4"/>
          </button>
        </div>
      </div>
      {lightbox && <ImageLightbox images={lightbox.images} startIndex={lightbox.index} onClose={() => setLightbox(null)} />}
    </>
  );
}, (prev, next) => {
  // OPT: only re-render if this post's data, like, or save status changed
  return (
    prev.post === next.post &&
    prev.likedPosts.has(prev.post.id) === next.likedPosts.has(next.post.id) &&
    prev.savedPosts.has(prev.post.id) === next.savedPosts.has(next.post.id)
  );
});

// ── Collab Card ────────────────────────────────────────────────────────────
// OPT: same memo treatment as PostCard
const CollabCard = memo(function CollabCard({ collab, interestedSet, savedCollabs, highlighted, onInterest, onMessage, onSave, onDelete, onEdit, onHide, onReport, onShare }: {
  collab: Collab; interestedSet: Set<string>; savedCollabs: Set<string>; highlighted?: boolean;
  onInterest:(id:string,name:string)=>void; onMessage:(name:string)=>void; onSave:(id:string)=>void;
  onDelete:(id:string)=>void; onEdit:(c:Collab)=>void; onHide:(id:string)=>void;
  onReport:(id:string)=>void; onShare:(id:string)=>void;
}) {
  const isInterested = interestedSet.has(collab.id);
  const isSaved = savedCollabs.has(collab.id);
  const navigate = useNavigate();
  const [lightboxSrc, setLightboxSrc] = useState<string|null>(null);
  const [descExpanded, setDescExpanded] = useState(false);
  const DESC_PREVIEW = 100;
  const descLong = collab.description.length > DESC_PREVIEW;
  const displayDesc = !descExpanded && descLong ? collab.description.slice(0, DESC_PREVIEW) + "…" : collab.description;

  const goToProfile = () => {
    if (collab.authorDeleted) return;
    if (collab.isOwn) { navigate("/profile"); return; }
    navigate(`/profile/${collab.user_id}`);
  };

  return (
    <>
      <div data-collab-id={collab.id} className={`rounded-xl border bg-card hover:shadow-sm transition-shadow overflow-hidden ${highlighted ? "border-primary ring-2 ring-primary/30" : "border-border"}`}>
        <div className="flex items-center gap-3 px-5 pt-5 pb-3">
          <div className={`shrink-0 ${!collab.authorDeleted ? "cursor-pointer hover:opacity-80 transition-opacity" : ""}`} onClick={goToProfile}>
            <Avatar initials={collab.authorDeleted ? "?" : collab.avatar} color={collab.authorDeleted ? "bg-muted" : collab.avatarColor} url={collab.authorDeleted ? undefined : collab.avatarUrl}/>
          </div>
          <div className="flex-1 min-w-0">
            <span className={`inline-flex items-center gap-1 font-semibold text-sm text-left ${collab.authorDeleted ? "text-muted-foreground italic" : "text-foreground cursor-pointer hover:underline"}`} onClick={goToProfile}>
              {collab.author}
              {!collab.authorDeleted && collab.authorRole === "admin" && (
                <span title="Verified" className="shrink-0 h-4 w-4 rounded-full bg-blue-500 inline-flex items-center justify-center">
                  <Check className="h-2.5 w-2.5 text-white stroke-[3]" />
                </span>
              )}
            </span>
            {!collab.authorDeleted && collab.authorSkills && collab.authorSkills.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-0.5">
                {collab.authorSkills.map(s => <span key={s} className="text-xs font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full">{s}</span>)}
              </div>
            )}
            {!collab.authorDeleted && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><MapPin className="h-3 w-3 shrink-0"/> {collab.location}</p>}
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
                  <DropdownMenuSeparator/>
                  <DropdownMenuItem onClick={()=>onReport(collab.id)} className="gap-2 text-destructive focus:text-destructive"><Flag className="h-4 w-4"/> Report collab</DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="px-5 pb-4 space-y-2">
          <p className="text-sm font-medium text-foreground/70 leading-snug truncate">{collab.title}</p>
          <p className="text-[15px] leading-snug">
            <span className="text-muted-foreground">Looking for </span>
            <span className="font-semibold text-primary">{collab.looking}</span>
          </p>
          <div>
            <p className="text-xs text-muted-foreground/80 leading-relaxed break-words">{displayDesc}</p>
            {descLong && (
              <button onClick={e => { e.stopPropagation(); setDescExpanded(v => !v); }}
                className="text-xs text-primary font-medium mt-0.5 hover:opacity-75 transition-opacity">
                {descExpanded ? "Show less" : "Read more"}
              </button>
            )}
          </div>
          {collab.image && <SmartImage src={collab.image} alt="collab" onClick={() => setLightboxSrc(collab.image!)} />}
          {collab.video && <SmartVideo src={collab.video} />}
          {collab.skills.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {collab.skills.map((s)=><Badge key={s} variant="secondary" className="text-xs">{s}</Badge>)}
            </div>
          )}
        </div>
        {!collab.isOwn && (
          <div className="flex gap-2 px-5 pb-5 pt-1 border-t border-border mt-1">
            <Button size="sm" variant={isInterested?"outline":"default"} className={`flex-1 gap-1.5 ${isInterested?"border-primary text-primary":""}`} onClick={()=>onInterest(collab.id,collab.author)}>
              <Handshake className="h-3.5 w-3.5"/>{isInterested?"Interested ✓":"I'm Interested"}
            </Button>
            <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={()=>onMessage(collab.author)}>
              <MessageCircle className="h-3.5 w-3.5"/> Message
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 px-3" onClick={()=>onShare(collab.id)} title="Share">
              <Share2 className="h-3.5 w-3.5"/>
            </Button>
          </div>
        )}
        {collab.isOwn && (
          <div className="flex gap-2 px-5 pb-5 pt-1 border-t border-border mt-1 justify-end">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={()=>onShare(collab.id)} title="Share">
              <Share2 className="h-3.5 w-3.5"/> Share
            </Button>
          </div>
        )}
      </div>
      {lightboxSrc && <ImageLightbox images={[lightboxSrc]} onClose={() => setLightboxSrc(null)} />}
    </>
  );
}, (prev, next) => {
  return (
    prev.collab === next.collab &&
    prev.interestedSet.has(prev.collab.id) === next.interestedSet.has(next.collab.id) &&
    prev.savedCollabs.has(prev.collab.id) === next.savedCollabs.has(next.collab.id)
  );
});

// ── Send to Connections Dialog ─────────────────────────────────────────────


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
  const [searchParams] = useSearchParams();
  const { user } = useUser();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(() => searchParams.get("tab") === "collabs" ? "collabs" : "feed");
  const [search, setSearch] = useState("");
  const [postSearch, setPostSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("All");
  const [activePostTag, setActivePostTag] = useState("All");

  const [highlightedPostId, setHighlightedPostId] = useState<string|null>(null);
  const [highlightedCollabId, setHighlightedCollabId] = useState<string|null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [collabs, setCollabs] = useState<Collab[]>([]);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [savedPosts, setSavedPosts] = useState<Set<string>>(new Set());
  const [commentingPost, setCommentingPost] = useState<Post|null>(null);
  const [editingPost, setEditingPost] = useState<Post|null>(null);
  const [shareTarget, setShareTarget] = useState<{type:"post"|"collab";id:string;content?:{text:string;authorName:string;type:"post"|"collab";postId?:string;imageUrl?:string;collabTitle?:string}}|null>(null);
  const [reportTarget, setReportTarget] = useState<{type:"post"|"collab"|"comment";id:string}|null>(null);
  const [interestedCollabs, setInterestedCollabs] = useState<Set<string>>(new Set());
  const [savedCollabs, setSavedCollabs] = useState<Set<string>>(new Set());
  const [editingCollab, setEditingCollab] = useState<Collab|null>(null);
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());

  // Pagination
  const [postsHasMore, setPostsHasMore] = useState(false);
  const [collabsHasMore, setCollabsHasMore] = useState(false);
  const [loadingMorePosts, setLoadingMorePosts] = useState(false);
  const [loadingMoreCollabs, setLoadingMoreCollabs] = useState(false);
  const postsCursorRef = useRef<string | null>(null);
  const collabsCursorRef = useRef<string | null>(null);
  const deepLinkHandledRef = useRef<string | null>(null);

  // OPT: grouped compose state — fewer useState hooks, fewer re-renders when
  // one compose field changes (only the compose area re-renders, not the whole feed)
  const [postDialog, setPostDialog] = useState({
    open: false, content: "", tag: "General",
    images: [] as string[],
    video: undefined as string|undefined,
    uploading: false,
    publishing: false,
  });
  const [collabDialog, setCollabDialog] = useState({
    open: false, title: "", looking: "", desc: "", skills: [] as string[],
    image: undefined as string|undefined,
    video: undefined as string|undefined,
    uploading: false,
    publishing: false,
    customSkillInput: "",
  });

  // ── Deep-link: scroll + highlight post when ?post=<id> or ?highlight=<id> is in the URL ──
  // Two-layer guard: ref stores the handled post ID (survives posts state changes)
  // + URL is cleared so remounting Feed finds no param to trigger on
  useEffect(() => {
    const postId = searchParams.get("post") || searchParams.get("highlight");
    if (!postId || posts.length === 0) return;
    if (deepLinkHandledRef.current === postId) return; // already handled this link
    const target = posts.find(p => p.id === postId);
    if (target) {
      deepLinkHandledRef.current = postId; // mark before any state/nav call
      setHighlightedPostId(postId);
      setTimeout(() => {
        document.querySelector(`[data-post-id="${postId}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 300);
      navigate("/feed", { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts]);

  // ── Deep-link: scroll + highlight collab when ?collab=<id> is in the URL ──
  // Depends on both [collabs, searchParams] so it fires when:
  //   • Collabs finish loading on first mount (URL already has ?collab=)
  //   • User navigates here from a notification while Feed is already mounted
  useEffect(() => {
    const collabId = searchParams.get("collab");
    if (!collabId) return;
    // Reset ref when param changes so the same collab can be deep-linked again
    if (deepLinkHandledRef.current !== collabId) {
      deepLinkHandledRef.current = null;
    }
    if (collabs.length === 0) return;
    if (deepLinkHandledRef.current === collabId) return;
    const target = collabs.find(c => c.id === collabId);
    if (target) {
      deepLinkHandledRef.current = collabId;
      setActiveTab("collabs");
      setHighlightedCollabId(collabId);
      setTimeout(() => {
        document.querySelector(`[data-collab-id="${collabId}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 300);
      navigate("/feed", { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collabs, searchParams]);

  // ── Clear highlight rings after 2 seconds ──
  useEffect(() => {
    if (highlightedPostId) {
      const t = setTimeout(() => setHighlightedPostId(null), 2000);
      return () => clearTimeout(t);
    }
  }, [highlightedPostId]);

  useEffect(() => {
    if (highlightedCollabId) {
      const t = setTimeout(() => setHighlightedCollabId(null), 2000);
      return () => clearTimeout(t);
    }
  }, [highlightedCollabId]);

  // ── Feed stale cache — show last feed instantly on return visits ─────────────
  // WHY: Without this, every page visit shows a blank spinner until the API responds.
  // With it, the last known feed is shown immediately (within 5 minutes it's stale-ok).
  const FEED_CACHE_KEY = `prolifier:feed:${user.id}`;
  const FEED_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  const applyFeedData = useCallback((rawPosts: any[], rawCollabs: any[]) => {
    const mappedPosts: Post[] = (rawPosts || []).map((p: any) => ({
      id: p.id, user_id: p.user_id,
      author: p.profiles?.deleted_at ? "Deleted Account" : (p.profiles?.name || p.author || "Unknown"),
      avatar: p.profiles?.deleted_at ? "?" : (p.profiles?.avatar || p.avatar || "?"),
      avatarUrl: p.profiles?.deleted_at ? undefined : (p.profiles?.avatar_url || p.avatarUrl || undefined),
      avatarColor: p.profiles?.deleted_at ? "bg-muted-foreground" : (p.profiles?.color || p.avatarColor || "bg-primary"),
      location: p.profiles?.deleted_at ? "" : (p.profiles?.location || p.location || ""),
      authorSkills: p.profiles?.deleted_at ? [] : (p.profiles?.skills?.slice(0, 3) || p.authorSkills || []),
      authorDeleted: !!p.profiles?.deleted_at || !!p.authorDeleted,
      authorRole: p.profiles?.role || p.authorRole || "user",
      tag: p.tag, time: timeAgo(p.created_at), createdAt: p.created_at, content: p.content,
      images: p.image_urls?.length > 0 ? p.image_urls : (p.image_url ? [p.image_url] : (p.images || [])),
      video: p.video_url || p.video || undefined,
      likes: p.likes || 0, commentCount: p.comment_count || p.commentCount || 0,
      isOwn: p.isOwn ?? (p.user_id === user.id),
      comments: [],
    }));
    const mappedCollabs: Collab[] = (rawCollabs || []).map((c: any) => ({
      id: c.id, user_id: c.user_id,
      author: c.profiles?.deleted_at ? "Deleted Account" : (c.profiles?.name || c.author || "Unknown"),
      avatar: c.profiles?.deleted_at ? "?" : (c.profiles?.avatar || c.avatar || "?"),
      avatarUrl: c.profiles?.deleted_at ? undefined : (c.profiles?.avatar_url || c.avatarUrl || undefined),
      avatarColor: c.profiles?.deleted_at ? "bg-muted-foreground" : (c.profiles?.color || c.avatarColor || "bg-primary"),
      location: c.profiles?.deleted_at ? "" : (c.profiles?.location || c.location || ""),
      authorSkills: c.profiles?.deleted_at ? [] : (c.profiles?.skills?.slice(0, 3) || c.authorSkills || []),
      authorDeleted: !!c.profiles?.deleted_at || !!c.authorDeleted,
      authorRole: c.profiles?.role || c.authorRole || "user",
      title: c.title, looking: c.looking, description: c.description, createdAt: c.created_at,
      skills: c.skills || [], image: c.image_url || c.image || undefined,
      video: c.video_url || c.video || undefined,
      isOwn: c.isOwn ?? (c.user_id === user.id),
    }));
    setPosts(mappedPosts);
    setCollabs(mappedCollabs);
    setLikedPosts(new Set((rawPosts || []).filter((p: any) => p.isLiked).map((p: any) => p.id)));
    setSavedPosts(new Set((rawPosts || []).filter((p: any) => p.isSaved).map((p: any) => p.id)));
    setSavedCollabs(new Set((rawCollabs || []).filter((c: any) => c.isSaved).map((c: any) => c.id)));
    setInterestedCollabs(new Set((rawCollabs || []).filter((c: any) => c.isInterested).map((c: any) => c.id)));
    setPostsHasMore((rawPosts || []).length === 20);
    setCollabsHasMore((rawCollabs || []).length === 20);
    if ((rawPosts || []).length > 0) postsCursorRef.current = rawPosts[rawPosts.length - 1].created_at;
    if ((rawCollabs || []).length > 0) collabsCursorRef.current = rawCollabs[rawCollabs.length - 1].created_at;
  }, [user.id]);

  // ── Fetch via API — posts + collabs already enriched with isLiked/isSaved/isOwn ──
  const fetchFeed = useCallback(async () => {
    if (!user.id) return;

    // Show stale cache immediately so users see content at once
    try {
      const raw = localStorage.getItem(FEED_CACHE_KEY);
      if (raw) {
        const { ts, posts: cp, collabs: cc } = JSON.parse(raw);
        if (Date.now() - ts < FEED_CACHE_TTL) {
          applyFeedData(cp, cc);
          setLoading(false); // show stale, still revalidate below
        }
      }
    } catch { /* ignore cache read errors */ }

    setLoading(prev => prev); // keep loading true for fresh fetch unless cache hit
    logger.info("feed.load.start", { userId: user.id });
    try {
      const { posts: rawPosts, collabs: rawCollabs } = await getFeed();

      // isLiked/isSaved/isInterested come enriched from API
      applyFeedData(rawPosts, rawCollabs);

      // Persist fresh feed to localStorage for instant display on next visit
      try {
        localStorage.setItem(FEED_CACHE_KEY, JSON.stringify({ ts: Date.now(), posts: rawPosts, collabs: rawCollabs }));
      } catch { /* quota exceeded — ignore */ }

      setLoading(false);
      logger.info("feed.load.done", { userId: user.id, postCount: mappedPosts.length, collabCount: mappedCollabs.length });
    } catch (err: any) {
      if (isAbortError(err)) { setLoading(false); return; }
      logger.error("feed.load.error", { error: err.message });
      toast({ title: "Failed to load feed", description: err.message, variant: "destructive" });
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  // Re-fetch when user returns to the tab — catches posts missed while away
  useEffect(() => {
    let lastFetch = Date.now();
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastFetch > 90_000) {
        lastFetch = Date.now();
        fetchFeed();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [fetchFeed]);

  const fetchMorePosts = useCallback(async () => {
    if (!postsCursorRef.current || loadingMorePosts) return;
    setLoadingMorePosts(true);
    try {
      const { posts: rawPosts } = await getFeed(postsCursorRef.current);
      const more: Post[] = (rawPosts || []).map((p: any) => ({
        id: p.id, user_id: p.user_id,
        author: p.profiles?.deleted_at ? "Deleted Account" : (p.profiles?.name || p.author || "Unknown"),
        avatar: p.profiles?.deleted_at ? "?" : (p.profiles?.avatar || p.avatar || "?"),
        avatarUrl: p.profiles?.deleted_at ? undefined : (p.profiles?.avatar_url || p.avatarUrl || undefined),
        avatarColor: p.profiles?.deleted_at ? "bg-muted-foreground" : (p.profiles?.color || p.avatarColor || "bg-primary"),
        location: p.profiles?.deleted_at ? "" : (p.profiles?.location || p.location || ""),
        authorSkills: p.profiles?.deleted_at ? [] : (p.profiles?.skills?.slice(0, 3) || p.authorSkills || []),
        authorDeleted: !!p.profiles?.deleted_at || !!p.authorDeleted,
        authorRole: p.profiles?.role || p.authorRole || "user",
        tag: p.tag, time: timeAgo(p.created_at), createdAt: p.created_at, content: p.content,
        images: p.image_urls?.length > 0 ? p.image_urls : (p.image_url ? [p.image_url] : (p.images || [])),
        video: p.video_url || p.video || undefined,
        likes: p.likes || 0, commentCount: p.comment_count || p.commentCount || 0,
        isOwn: p.isOwn ?? (p.user_id === user.id), comments: [],
      }));
      setLikedPosts(prev => {
        const n = new Set(prev);
        (rawPosts || []).filter((p: any) => p.isLiked).forEach((p: any) => n.add(p.id));
        return n;
      });
      setSavedPosts(prev => {
        const n = new Set(prev);
        (rawPosts || []).filter((p: any) => p.isSaved).forEach((p: any) => n.add(p.id));
        return n;
      });
      setPosts(prev => [...prev, ...more.filter(p => !blockedUserIds.has(p.user_id))]);
      setPostsHasMore((rawPosts || []).length === 30);
      if ((rawPosts || []).length > 0) postsCursorRef.current = rawPosts[rawPosts.length - 1].created_at;
    } catch { /* silent */ }
    setLoadingMorePosts(false);
  }, [loadingMorePosts, user.id]);

  const fetchMoreCollabs = useCallback(async () => {
    if (!collabsCursorRef.current || loadingMoreCollabs) return;
    setLoadingMoreCollabs(true);
    try {
      const { collabs: rawCollabs } = await getFeed(collabsCursorRef.current);
      const more: Collab[] = (rawCollabs || []).map((c: any) => ({
        id: c.id, user_id: c.user_id,
        author: c.profiles?.deleted_at ? "Deleted Account" : (c.profiles?.name || c.author || "Unknown"),
        avatar: c.profiles?.deleted_at ? "?" : (c.profiles?.avatar || c.avatar || "?"),
        avatarUrl: c.profiles?.deleted_at ? undefined : (c.profiles?.avatar_url || c.avatarUrl || undefined),
        avatarColor: c.profiles?.deleted_at ? "bg-muted-foreground" : (c.profiles?.color || c.avatarColor || "bg-primary"),
        location: c.profiles?.deleted_at ? "" : (c.profiles?.location || c.location || ""),
        authorSkills: c.profiles?.deleted_at ? [] : (c.profiles?.skills?.slice(0, 3) || c.authorSkills || []),
        authorDeleted: !!c.profiles?.deleted_at || !!c.authorDeleted,
        authorRole: c.profiles?.role || c.authorRole || "user",
        title: c.title, looking: c.looking, description: c.description, createdAt: c.created_at,
        skills: c.skills || [], image: c.image_url || c.image || undefined,
        video: c.video_url || c.video || undefined,
        isOwn: c.isOwn ?? (c.user_id === user.id),
      }));
      setSavedCollabs(prev => {
        const n = new Set(prev);
        (rawCollabs || []).filter((c: any) => c.isSaved).forEach((c: any) => n.add(c.id));
        return n;
      });
      setInterestedCollabs(prev => {
        const n = new Set(prev);
        (rawCollabs || []).filter((c: any) => c.isInterested).forEach((c: any) => n.add(c.id));
        return n;
      });
      setCollabs(prev => [...prev, ...more.filter(c => !blockedUserIds.has(c.user_id))]);
      setCollabsHasMore((rawCollabs || []).length === 30);
      if ((rawCollabs || []).length > 0) collabsCursorRef.current = rawCollabs[rawCollabs.length - 1].created_at;
    } catch { /* silent */ }
    setLoadingMoreCollabs(false);
  }, [loadingMoreCollabs, user.id]);

  // Real-time removed to reduce Supabase Disk IO.
  // Feed refreshes on tab focus (90s throttle) and after own post/collab actions.

  // ── Post Actions ──────────────────────────────────────────────────────
  // OPT: optimistic UI — state updates instantly, DB write happens in background
  const handleLike = useCallback(async (id: string) => {
    // Block check — don't allow interaction with posts from blocked/blocking users
    const post = posts.find(p => p.id === id);
    if (post && blockedUserIds.has(post.user_id)) return;
    const was = likedPosts.has(id);
    // Optimistic update — instant feedback
    setLikedPosts(p => { const n = new Set(p); was ? n.delete(id) : n.add(id); return n; });
    setPosts(p => p.map(x => x.id === id ? { ...x, likes: was ? x.likes - 1 : x.likes + 1 } : x));

    if (was) {
      await unlikePost(id).catch(() => {});
    } else {
      await likePost(id).catch(() => {});
      const post = posts.find(p => p.id === id);
      if (post && post.user_id !== user.id) {
        createNotification({
          userId: post.user_id,
          type: "like",
          text: `${user.name} liked your post`,
          subtext: post.content?.slice(0, 60) || undefined,
          action: "feed",
          actorId: user.id,
        });
      }
    }

  }, [likedPosts, posts, user.id, user.name]);

  const handleSavePost = useCallback(async (id: string) => {
    const was = savedPosts.has(id);
    setSavedPosts(p => { const n = new Set(p); was ? n.delete(id) : n.add(id); return n; });
    if (was) {
      await unsavePost(id).catch(() => {});
      toast({ title: "Post unsaved" });
    } else {
      await savePost(id).catch(() => {});
      toast({ title: "Post saved! 🔖" });
    }
  }, [savedPosts, user.id]);

  // OPT: lazy comment loading — only fetch comments when the sheet is opened
  const handleOpenComments = useCallback(async (post: Post) => {
    // Block check — don't allow commenting on posts from blocked/blocking users
    if (blockedUserIds.has(post.user_id)) return;
    // If comments already loaded, open immediately
    if (post.comments.length > 0) {
      setCommentingPost(post);
      return;
    }
    // Fetch comments just for this post on demand
    const commentsData = await getComments(post.id).catch(() => [] as any[]);

    const loadedComments: Comment[] = (commentsData || []).map((c: any) => ({
      id: c.id,
      user_id: c.user_id || c.userId,
      author: c.profiles?.name || c.author || "Unknown",
      avatar: c.profiles?.avatar || c.avatar || "?",
      avatarUrl: c.profiles?.avatar_url || c.avatarUrl || undefined,
      color: c.profiles?.color || c.color || "bg-primary",
      text: c.text,
      time: c.time || timeAgo(c.created_at),
      parentId: c.parent_id || c.parentId || null,
      role: c.profiles?.role || c.role || "user",
    }));

    // Filter out comments from blocked users (both directions)
    const visibleComments = loadedComments.filter(c => !blockedUserIds.has(c.user_id));
    // Patch the post in state — sync count with real loaded count
    const updatedPost = { ...post, comments: visibleComments, commentCount: visibleComments.length };
    setPosts(p => p.map(x => x.id === post.id ? updatedPost : x));
    setCommentingPost(updatedPost);
  }, [blockedUserIds]);

  const handleAddComment = useCallback(async (postId: string, text: string, parentId?: string | null) => {
    const pre = checkContent(text);
    if (!pre.allowed) { toast({ title: pre.message!, variant: "destructive" }); return; }
    let data: any;
    try {
      data = await addComment(postId, { text, parentId: parentId ?? null });
    } catch (err: any) {
      const modMsg = parseModerationError(err);
      toast({ title: modMsg ?? "Failed to post comment", variant: "destructive" });
      return;
    }
    const newComment: Comment = {
      id: data.id, user_id: data.user_id || user.id,
      author: data.profiles?.name || data.author || user.name,
      avatar: data.profiles?.avatar || data.avatar || user.avatar,
      avatarUrl: data.profiles?.avatar_url || data.avatarUrl || user.avatarUrl || undefined,
      color: data.profiles?.color || data.color || user.color,
      text: data.text || text, time: "Just now",
      parentId: parentId ?? null,
      role: data.profiles?.role || data.role || user.role,
    };
    setPosts(p => p.map(x => x.id === postId ? { ...x, comments: [...x.comments, newComment], commentCount: x.commentCount + 1 } : x));
    setCommentingPost(prev => prev ? { ...prev, comments: [...prev.comments, newComment], commentCount: prev.commentCount + 1 } : null);
    const post = posts.find(p => p.id === postId);
    if (post && post.user_id !== user.id) {
      createNotification({
        userId: post.user_id,
        type: "comment",
        text: `${user.name} commented on your post`,
        subtext: text.slice(0, 60),
        action: `post:${postId}`,
        actorId: user.id,
      });
    }
    // When this is a reply, notify the parent comment's author
    if (parentId) {
      const allComments = commentingPost?.comments ?? post?.comments ?? [];
      const parentComment = allComments.find(c => c.id === parentId);
      if (parentComment && parentComment.user_id !== user.id && parentComment.user_id !== post?.user_id) {
        createNotification({
          userId: parentComment.user_id,
          type: "comment",
          text: `${user.name} replied to your comment`,
          subtext: text.slice(0, 60),
          action: `post:${postId}`,
          actorId: user.id,
        });
      }
    }
    // Notify @mentioned users
    const mentionMatches = [...new Set((text.match(/@([\w][\w ]*)/g) || []).map(m => m.slice(1).trim()))];
    if (mentionMatches.length > 0) {
      const mentioned = await Promise.all(
        mentionMatches.map(name => apiGet<any[]>(`/api/users/discover?search=${encodeURIComponent(name)}&limit=1`).catch(() => []))
      ).then(results => results.flat());
      (mentioned || []).forEach((p: any) => {
        if (p.id !== user.id) {
          createNotification({ userId: p.id, type: "comment", text: `${user.name} mentioned you in a comment`, subtext: text.slice(0, 60), action: "feed", actorId: user.id });
        }
      });
    }
  }, [posts, commentingPost, user.id, user.name, user.avatar, user.color, user.avatarUrl]);

  const handleDeleteComment = useCallback(async (commentId: string, postId: string) => {
    await deleteComment(postId, commentId).catch(() => {});
    // Remove the comment and any replies to it (cascaded in DB)
    const prune = (comments: Comment[]) => comments.filter(c => c.id !== commentId && c.parentId !== commentId);
    setPosts(p => p.map(x => {
      if (x.id !== postId) return x;
      const kept = prune(x.comments);
      return { ...x, comments: kept, commentCount: kept.length };
    }));
    setCommentingPost(prev => {
      if (!prev || prev.id !== postId) return prev;
      const kept = prune(prev.comments);
      return { ...prev, comments: kept, commentCount: kept.length };
    });
  }, []);

  const handleReportComment = useCallback((commentId: string) => {
    const c = commentingPost?.comments.find(x => x.id === commentId);
    setReportTarget({ type: "comment", id: commentId });
  }, []);

  const handleEditComment = useCallback(async (commentId: string, postId: string, newText: string) => {
    const pre = checkContent(newText);
    if (!pre.allowed) { toast({ title: pre.message!, variant: "destructive" }); return; }
    try {
      await apiGet<any>(`/api/feed/posts/_/comments/${commentId}/edit`); // placeholder — use direct for now
    } catch {}
    // Optimistic update — backend edit endpoint to be wired when added
    try {
      await (supabase as any).from("comments")
        .update({ text: newText }).eq("id", commentId).eq("user_id", user.id);
    } catch {
      toast({ title: "Failed to edit comment", variant: "destructive" }); return;
    }
    const patch = (c: Comment) => c.id === commentId ? { ...c, text: newText } : c;
    setPosts(p => p.map(x => x.id === postId ? { ...x, comments: x.comments.map(patch) } : x));
    setCommentingPost(prev => prev && prev.id === postId
      ? { ...prev, comments: prev.comments.map(patch) } : prev);
  }, [user.id]);

  const handleDeletePost = useCallback(async (id: string) => {
    await deletePost(id).catch(() => {});
    setPosts(p => p.filter(x => x.id !== id));
    toast({ title: "Post deleted" });
  }, []); // functional updater — no need for `posts` in deps

  const handleEditPost = useCallback(async (id: string, content: string, tag: string, images: string[], video?: string) => {
    const pre = checkContent(content);
    if (!pre.allowed) { toast({ title: pre.message!, variant: "destructive" }); return; }
    try {
      await updatePost(id, { content, tag, image_urls: images });
    } catch (err: any) {
      const modMsg = parseModerationError(err);
      toast({ title: modMsg ?? "Failed to update post", variant: "destructive" });
      return;
    }
    setPosts(p => p.map(x => x.id === id ? { ...x, content, tag, images, video: video || undefined } : x));
    toast({ title: "Post updated ✓" });
  }, []); // functional updater — no need for `posts` in deps

  const handleHidePost = useCallback((id: string) => {
    setPosts(p => p.filter(x => x.id !== id));
    toast({ title: "Post hidden", description: "You won't see posts like this." });
  }, []);

  const handleCreatePost = useCallback(async () => {
    if (!postDialog.content.trim() || postDialog.publishing) return;
    const pre = checkContent(postDialog.content);
    if (!pre.allowed) { toast({ title: pre.message!, variant: "destructive" }); return; }
    setPostDialog(d => ({ ...d, publishing: true }));
    try {
      let data: any;
      try {
        data = await createPost({
          content: postDialog.content,
          tag: postDialog.tag,
          image_urls: postDialog.images.length > 0 ? postDialog.images : undefined,
          video_url: postDialog.video || undefined,
        });
      } catch (err: any) {
        const modMsg = parseModerationError(err);
        toast({ title: modMsg ?? "Failed to create post", variant: "destructive" });
        return;
      }
      // OPT: prepend new post directly to state — no refetch needed
      setPosts(p => [{
        id: data.id, user_id: user.id, author: user.name, avatar: user.avatar,
        avatarUrl: user.avatarUrl || undefined,
        avatarColor: user.color, location: user.location,
        authorSkills: user.skills?.slice(0, 3) || [],
        authorDeleted: false, authorRole: user.role,
        tag: postDialog.tag, time: "Just now",
        content: postDialog.content, images: postDialog.images, video: postDialog.video,
        likes: 0, commentCount: 0, isOwn: true, comments: [],
      }, ...p]);
      setActiveTab("feed");
      setPostDialog({ open: false, content: "", tag: "General", images: [], video: undefined, uploading: false, publishing: false });
      toast({ title: "Post published! 🎉" });
    } finally {
      setPostDialog(d => ({ ...d, publishing: false }));
    }
  }, [postDialog, user]);

  const handleRemovePostImageAt = async (i: number) => {
    const url = postDialog.images[i];
    if (url) await deleteFromStorage(url);
    setPostDialog(d => ({ ...d, images: d.images.filter((_, idx) => idx !== i) }));
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
      await removeInterest(id).catch(() => {});
      toast({ title: "Interest withdrawn" });
    } else {
      await expressInterest(id).catch(() => {});
      const collab = collabs.find(c => c.id === id);
      if (collab && collab.user_id !== user.id) {
        // Send notification linking directly to the collab post
        createNotification({
          userId: collab.user_id,
          type: "collab",
          text: `${user.name} is interested in your collab`,
          subtext: collab.title,
          action: `collab:${collab.id}`,
          actorId: user.id,
        });
        // Silently send as a shared_post card so both sides see the collab
        // and can tap it to navigate to the post. No redirect for the sender.
        const sharePayload = JSON.stringify({
          type: "collab",
          id: collab.id,
          title: collab.title,
          caption: `Hi! I'm interested in your collab "${collab.title}" 🤝`,
          image: collab.image || null,
        });
        (() => {
          const sorted = [user.id, collab.user_id].sort();
          const chatId = `${sorted[0]}_${sorted[1]}`;
          sendMessage(sharePayload, chatId, { mediaType: "shared_post" }).then(() => {
            // Fire a message notification so the receiver's badge increments
            createNotification({
              userId: collab.user_id,
              type: "message",
              text: `${user.name} sent you a message`,
              subtext: `Interested in your collab "${collab.title}"`,
              action: `message:${user.id}`,
              actorId: user.id,
            });
          });
        })();
      }
      toast({ title: `Interest sent to ${name}! 🤝` });
    }
  }, [interestedCollabs, collabs, user.id, user.name]);

  const handleSaveCollab = useCallback(async (id: string) => {
    const was = savedCollabs.has(id);
    setSavedCollabs(p => { const n = new Set(p); was ? n.delete(id) : n.add(id); return n; });
    if (was) {
      await unsaveCollab(id).catch(() => {});
      toast({ title: "Collab unsaved" });
    } else {
      await saveCollab(id).catch(() => {});
      toast({ title: "Collab saved! 🔖" });
    }
  }, [savedCollabs, user.id]);

  const handleDeleteCollab = useCallback(async (id: string) => {
    await deleteCollab(id).catch(() => {});
    setCollabs(p => p.filter(x => x.id !== id));
    toast({ title: "Collab deleted" });
  }, [collabs, user.id]);

  const handleEditCollab = useCallback(async (id: string, updates: Partial<Collab>) => {
    const textToCheck = [updates.title, updates.description].filter(Boolean).join(" ");
    const pre = checkContent(textToCheck);
    if (!pre.allowed) { toast({ title: pre.message!, variant: "destructive" }); return; }
    try {
      await updateCollab(id, {
        title: updates.title,
        looking: updates.looking,
        description: updates.description,
        skills: updates.skills,
        image: updates.image || undefined,
        video: updates.video || undefined,
      });
    } catch (err: any) {
      const modMsg = parseModerationError(err);
      toast({ title: modMsg ?? "Failed to update collab", variant: "destructive" });
      return;
    }
    setCollabs(p => p.map(x => x.id === id ? { ...x, ...updates } : x));
    toast({ title: "Collab updated ✓" });
  }, [collabs, user.id]);

  const handleHideCollab = useCallback((id: string) => {
    setCollabs(p => p.filter(x => x.id !== id));
    toast({ title: "Hidden" });
  }, []);

  const handleCreateCollab = useCallback(async () => {
    if (!collabDialog.title.trim() || !collabDialog.looking.trim() || !collabDialog.desc.trim() || collabDialog.publishing) return;
    const pre = checkContent(`${collabDialog.title} ${collabDialog.desc}`);
    if (!pre.allowed) { toast({ title: pre.message!, variant: "destructive" }); return; }
    setCollabDialog(d => ({ ...d, publishing: true }));
    try {
      let data: any;
      try {
        data = await createCollab({
          title: collabDialog.title,
          looking: collabDialog.looking,
          description: collabDialog.desc,
          skills: collabDialog.skills,
          image: collabDialog.image || undefined,
          video: collabDialog.video || undefined,
        });
      } catch (err: any) {
        const modMsg = parseModerationError(err);
        toast({ title: modMsg ?? "Failed to create collab", variant: "destructive" });
        return;
      }
      setCollabs(p => [{
        id: data.id, user_id: user.id, author: user.name, avatar: user.avatar,
        avatarUrl: user.avatarUrl || undefined,
        avatarColor: user.color, location: user.location,
        authorSkills: user.skills?.slice(0, 3) || [],
        authorDeleted: false, authorRole: user.role,
        title: collabDialog.title,
        looking: collabDialog.looking, description: collabDialog.desc, skills: collabDialog.skills,
        image: collabDialog.image, video: collabDialog.video, isOwn: true, createdAt: new Date().toISOString(),
      }, ...p]);
      setActiveTab("collabs");
      setCollabDialog({ open: false, title: "", looking: "", desc: "", skills: [], image: undefined, video: undefined, uploading: false, publishing: false, customSkillInput: "" });
      toast({ title: "Collab posted! 🤝" });
    } finally {
      setCollabDialog(d => ({ ...d, publishing: false }));
    }
  }, [collabDialog, user]);

  const handleRemoveCollabImage = async () => {
    if (collabDialog.image) await deleteFromStorage(collabDialog.image);
    setCollabDialog(d => ({ ...d, image: undefined }));
  };
  const handleRemoveCollabVideo = async () => {
    if (collabDialog.video) await deleteFromStorage(collabDialog.video);
    setCollabDialog(d => ({ ...d, video: undefined }));
  };

  const openShareWithContent = (type: "post" | "collab", id: string) => {
    if (type === "post") {
      const p = posts.find(x => x.id === id);
      if (!p) return;
      setShareTarget({
        type: "post",
        id: p.id,
        content: {
          type: "post",
          postId: p.id,
          authorName: p.author,
          text: p.content.slice(0, 300) + (p.content.length > 300 ? "…" : ""),
          imageUrl: p.images?.[0] || undefined,
        },
      });
    } else {
      const c = collabs.find(x => x.id === id);
      if (!c) return;
      setShareTarget({
        type: "collab",
        id: c.id,
        content: {
          type: "collab",
          postId: c.id,
          authorName: c.author,
          collabTitle: c.title,
          text: c.description.slice(0, 200) + (c.description.length > 200 ? "…" : ""),
          imageUrl: c.image || undefined,
        },
      });
    }
  };

  const shareLink = shareTarget
    ? shareTarget.type === "post"
      ? `${window.location.origin}/feed?post=${shareTarget.id}`
      : `${window.location.origin}/feed?tab=collabs`
    : "";
  const filteredPosts = useMemo(() => posts.filter(p => {
    if (blockedUserIds.has(p.user_id)) return false;
    const matchTag = activePostTag === "All" || p.tag === activePostTag;
    const q = postSearch.toLowerCase().trim();
    const matchSearch = !q || p.author.toLowerCase().includes(q) || p.content.toLowerCase().includes(q) || p.tag.toLowerCase().includes(q);
    return matchTag && matchSearch;
  }), [posts, activePostTag, postSearch, blockedUserIds]);
  const filteredCollabs = useMemo(() => collabs.filter(c => {
    if (blockedUserIds.has(c.user_id)) return false;
    const q = search.toLowerCase();
    const ms = !search || c.author.toLowerCase().includes(q) || c.title.toLowerCase().includes(q) || c.looking.toLowerCase().includes(q) || c.description.toLowerCase().includes(q) || c.skills.some(s => s.toLowerCase().includes(q));
    const mf = activeFilter === "All"
      ? true
      : activeFilter === "Other"
        ? c.skills.some(s => !(SKILL_OPTIONS as readonly string[]).includes(s))
        : c.skills.some(s => s.toLowerCase().includes(activeFilter.toLowerCase())) || c.looking.toLowerCase().includes(activeFilter.toLowerCase());
    return ms && mf;
  }), [collabs, search, activeFilter, blockedUserIds]);

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
            <Dialog open={postDialog.open} onOpenChange={async (v) => {
              if (!v) {
                for (const url of postDialog.images) await deleteFromStorage(url);
                await handleRemovePostVideo();
                setPostDialog(d => ({ ...d, images: [] }));
              }
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
                    <label className="text-sm font-medium mb-1.5 block">What's on your mind?</label>
                    <Textarea
                      value={postDialog.content}
                      onChange={e => setPostDialog(d => ({ ...d, content: e.target.value }))}
                      maxLength={500}
                      placeholder="Share what you're working on, ask for advice, or celebrate a win..." rows={4}/>
                    <p className="text-xs text-muted-foreground text-right mt-1">
                      {postDialog.content.length}/500
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Category</label>
                    <div className="flex flex-wrap gap-2">
                      {POST_TAGS.map(t => <Badge key={t} variant={postDialog.tag===t?"default":"outline"} className="cursor-pointer" onClick={() => setPostDialog(d => ({ ...d, tag: t }))}>{t}</Badge>)}
                    </div>
                  </div>
                  {postDialog.video && (
                    <div className="relative rounded-xl overflow-hidden">
                      <video src={postDialog.video} controls className="w-full max-h-48 rounded-xl" style={{backgroundColor:"#000"}}/>
                      <button onClick={handleRemovePostVideo} className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70"><X className="h-3.5 w-3.5"/></button>
                    </div>
                  )}
                  {!postDialog.video && (
                    <MediaUploadBar
                      images={postDialog.images}
                      onAddImage={url => setPostDialog(d => ({ ...d, images: [...d.images, url] }))}
                      onRemoveImage={handleRemovePostImageAt}
                      onVideo={url => setPostDialog(d => ({ ...d, video: url }))}
                      onUploadingChange={v => setPostDialog(d => ({ ...d, uploading: v }))}
                      hasVideo={!!postDialog.video}
                      userId={user.id}
                    />
                  )}
                </div>
                <DialogFooter>
                  <Button onClick={handleCreatePost} disabled={!postDialog.content.trim() || postDialog.uploading || postDialog.publishing} className="gap-2">
                    {postDialog.publishing
                      ? <><div className="h-3.5 w-3.5 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" /> Publishing…</>
                      : <><Send className="h-4 w-4"/> {postDialog.uploading ? "Uploading..." : "Publish"}</>}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Post search + filter */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/>
                <Input placeholder="Search posts…" value={postSearch} onChange={e => setPostSearch(e.target.value)} className="pl-10 h-10"/>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant={activePostTag !== "All" ? "default" : "outline"} size="icon" className="h-10 w-10 shrink-0">
                    <SlidersHorizontal className="h-4 w-4"/>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  {["All", ...POST_TAGS].map(t => (
                    <DropdownMenuItem key={t} onClick={() => setActivePostTag(t)} className="flex items-center gap-2">
                      {activePostTag === t ? <Check className="h-3.5 w-3.5 shrink-0"/> : <span className="h-3.5 w-3.5 shrink-0"/>}
                      {t}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {loading ? <FeedSkeleton /> : filteredPosts.length === 0 ? (
                <div className="text-center py-14 text-muted-foreground">
                  <p className="text-sm font-medium mb-1">
                    {postSearch ? `No results for "${postSearch}"` : activePostTag !== "All" ? `No "${activePostTag}" posts yet` : "No posts yet"}
                  </p>
                  <p className="text-xs">
                    {postSearch || activePostTag !== "All" ? "Try a different search or filter." : "Be the first to share something with the community!"}
                  </p>
                  {(postSearch || activePostTag !== "All") && (
                    <button className="text-xs text-primary hover:underline mt-1" onClick={() => { setPostSearch(""); setActivePostTag("All"); }}>Clear</button>
                  )}
                </div>
              ) : filteredPosts.map(post => (
                <PostCard key={post.id} post={post} likedPosts={likedPosts} savedPosts={savedPosts}
                  highlighted={highlightedPostId === post.id}
                  onLike={handleLike} onSave={handleSavePost} onComment={handleOpenComments}
                  onDelete={handleDeletePost} onEdit={setEditingPost} onHide={handleHidePost}
                  onReport={id => setReportTarget({type:"post",id})}
                  onShare={id => openShareWithContent("post", id)}
                />
              ))}
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
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Project / idea name</label>
                    <Input value={collabDialog.title}
                      onChange={e => setCollabDialog(d => ({ ...d, title: e.target.value }))}
                      maxLength={20}
                      placeholder="e.g. Community Book Club" className="h-10"/>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Looking for</label>
                    <Input value={collabDialog.looking}
                      onChange={e => setCollabDialog(d => ({ ...d, looking: e.target.value }))}
                      maxLength={50}
                      placeholder="e.g. Designer, Sound Engineer" className="h-10"/>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Describe your project</label>
                    <Textarea value={collabDialog.desc}
                      onChange={e => setCollabDialog(d => ({ ...d, desc: e.target.value }))}
                      maxLength={500}
                      placeholder="What are you building? What kind of help do you need?" rows={3}/>
                    <p className="text-xs text-muted-foreground text-right mt-1">
                      {collabDialog.desc.length}/500
                    </p>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-sm font-medium">Relevant skills / areas</label>
                      <span className={`text-xs font-medium ${collabDialog.skills.length >= 3 ? "text-primary" : "text-muted-foreground"}`}>{collabDialog.skills.length}/3</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {SKILL_OPTIONS.map(s => {
                        const selected = collabDialog.skills.includes(s);
                        const maxed = !selected && collabDialog.skills.length >= 3;
                        return (
                          <Badge key={s} variant={selected ? "default" : "outline"}
                            className={`cursor-pointer transition-all ${maxed ? "opacity-40 cursor-not-allowed" : "hover:scale-105"}`}
                            onClick={() => { if (maxed) return; setCollabDialog(d => ({ ...d, skills: selected ? d.skills.filter(x => x !== s) : [...d.skills, s] })); }}>
                            {s}
                          </Badge>
                        );
                      })}
                      {/* Custom skills added via "Other" */}
                      {collabDialog.skills.filter(s => !(SKILL_OPTIONS as readonly string[]).includes(s)).map(s => (
                        <Badge key={s} variant="default" className="cursor-pointer gap-1"
                          onClick={() => setCollabDialog(d => ({ ...d, skills: d.skills.filter(x => x !== s) }))}>
                          {s} <X className="h-2.5 w-2.5"/>
                        </Badge>
                      ))}
                    </div>
                    {/* Other: custom skill input */}
                    <div className="flex gap-2 mt-2">
                      <Input
                        placeholder="Other skill (type and press Enter)"
                        value={collabDialog.customSkillInput}
                        onChange={e => setCollabDialog(d => ({ ...d, customSkillInput: e.target.value }))}
                        className="h-8 text-sm"
                        maxLength={20}
                        onKeyDown={e => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const val = collabDialog.customSkillInput.trim();
                            if (val && !collabDialog.skills.includes(val) && collabDialog.skills.length < 3) {
                              setCollabDialog(d => ({ ...d, skills: [...d.skills, val], customSkillInput: "" }));
                            } else {
                              setCollabDialog(d => ({ ...d, customSkillInput: "" }));
                            }
                          }
                        }}
                      />
                      <Button type="button" size="sm" variant="outline" className="h-8 px-3 shrink-0"
                        disabled={collabDialog.skills.length >= 3}
                        onClick={() => {
                          const val = collabDialog.customSkillInput.trim();
                          if (val && !collabDialog.skills.includes(val) && collabDialog.skills.length < 3) {
                            setCollabDialog(d => ({ ...d, skills: [...d.skills, val], customSkillInput: "" }));
                          } else {
                            setCollabDialog(d => ({ ...d, customSkillInput: "" }));
                          }
                        }}>
                        Add
                      </Button>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleCreateCollab} disabled={!collabDialog.title.trim()||!collabDialog.looking.trim()||!collabDialog.desc.trim()||collabDialog.uploading||collabDialog.publishing} className="gap-2">
                    <Send className="h-4 w-4"/> {collabDialog.uploading ? "Uploading..." : collabDialog.publishing ? "Posting..." : "Post collab"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/>
                <Input placeholder="Search collaborations…" value={search} onChange={e => setSearch(e.target.value)} className="pl-10 h-10"/>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant={activeFilter !== "All" ? "default" : "outline"} size="icon" className="h-10 w-10 shrink-0">
                    <SlidersHorizontal className="h-4 w-4"/>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  {COLLAB_FILTERS.map(f => (
                    <DropdownMenuItem key={f} onClick={() => setActiveFilter(f)} className="flex items-center gap-2">
                      {activeFilter === f ? <Check className="h-3.5 w-3.5 shrink-0"/> : <span className="h-3.5 w-3.5 shrink-0"/>}
                      {f}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <p className="text-xs text-muted-foreground">{filteredCollabs.length} collab{filteredCollabs.length!==1?"s":""}</p>
            {filteredCollabs.length === 0 ? (
              <div className="text-center py-14 text-muted-foreground">
                <p className="text-sm font-medium mb-1">No collaborations found</p>
                <button className="text-xs text-primary hover:underline mt-1" onClick={() => { setSearch(""); setActiveFilter("All"); }}>Clear filters</button>
              </div>
            ) : (
              <>
                {filteredCollabs.map(c => (
                  <CollabCard key={c.id} collab={c} interestedSet={interestedCollabs} savedCollabs={savedCollabs}
                    highlighted={highlightedCollabId === c.id}
                    onInterest={handleInterest} onMessage={() => navigate("/messages")}
                    onSave={handleSaveCollab} onDelete={handleDeleteCollab} onEdit={setEditingCollab}
                    onHide={handleHideCollab}
                    onReport={id => setReportTarget({type:"collab",id})}
                    onShare={id => openShareWithContent("collab", id)}
                  />
                ))}
              </>
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

      {commentingPost && <CommentSheet post={commentingPost} currentUserId={user.id} onClose={() => setCommentingPost(null)} onAddComment={handleAddComment} onDeleteComment={handleDeleteComment} onEditComment={handleEditComment} onReportComment={handleReportComment}/>}
      {editingPost && <EditPostDialog post={editingPost} open={!!editingPost} onClose={() => setEditingPost(null)} onSave={handleEditPost} userId={user.id}/>}
      {editingCollab && <EditCollabDialog collab={editingCollab} open={!!editingCollab} onClose={() => setEditingCollab(null)} onSave={handleEditCollab}/>}
      {shareTarget && <ShareDialog onClose={() => setShareTarget(null)} link={shareLink} content={shareTarget.content}/>}
      {reportTarget && <ReportDialog open={!!reportTarget} onClose={() => setReportTarget(null)} target={reportTarget.type==="post"?"this post":reportTarget.type==="collab"?"this collab":"this comment"} targetType={reportTarget.type} targetId={reportTarget.id}/>}

    </Layout>
  );
}
