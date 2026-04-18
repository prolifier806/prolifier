import { useState, useRef, useEffect, useCallback, useMemo, memo } from "react";
import { useParams } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import { useRealtimeChannel } from "@/hooks/useRealtimeChannel";
import { useGroupSocket } from "@/hooks/useGroupSocket";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Search, Users, ArrowLeft, Send, MessageCircle,
  Lock, Globe, Plus, Settings, X, Check,
  Crown, Image, Video, Paperclip,
  Link2, Copy, LogOut, Edit3, Trash2, UserX, MoreHorizontal,
  ShieldOff, RefreshCw, AtSign, ChevronsUp, UserPlus, Bell, SlidersHorizontal, Download, CornerUpLeft, Smile, Flag,
  ChevronUp, ChevronDown,
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
  getBannedUsers as apiGetBannedUsers,
  unbanUser as apiUnbanUser,
  requestToJoin as apiRequestToJoin,
  cancelJoinRequest as apiCancelJoinRequest,
  getJoinRequests as apiGetJoinRequests,
  respondJoinRequest as apiRespondJoinRequest,
  addMemberToGroup as apiAddMember,
  deleteGroupMessage as apiDeleteGroupMessage,
  toggleReaction as apiToggleReaction,
  getMessageReactions as apiGetMessageReactions,
  searchGroupMessages,
} from "@/api/groups";
import { uploadPostImage, uploadVideo, uploadFile } from "@/api/uploads";
import { createReport } from "@/api/reports";


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
  removed_by_admin: boolean;
  is_system: boolean;
  author_name: string;
  author_color: string;
  author_avatar_url?: string;
  author_role?: string;
  reply_to_id?: string | null;
  reply_to_text?: string | null;
  reply_to_author?: string | null;
};

type JoinRequest = {
  id: string;
  user_id: string;
  status: string;
  created_at: string;
  profile: { name: string; color: string; avatar_url?: string } | null;
};

type AdminPermissions = {
  removeUsers: boolean;
  changeChannelInfo: boolean;
  banUsers: boolean;
  addSubscribers: boolean;
  manageMessages: boolean;
  promoteAdmins: boolean;
};

const DEFAULT_ADMIN_PERMISSIONS: AdminPermissions = {
  removeUsers: true,
  changeChannelInfo: false,
  banUsers: true,
  addSubscribers: true,
  manageMessages: true,
  promoteAdmins: false,
};

type GroupMember = {
  id: string;
  name: string;
  color: string;
  avatarUrl?: string;
  role: "owner" | "admin" | "member";
  permissions?: AdminPermissions;
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

function renderTextWithLinks(text: string, validMentionNames?: string[], isOwn?: boolean) {
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
          className={`underline break-all hover:opacity-80 ${isOwn ? "text-white/95 decoration-white/60" : "text-blue-600 dark:text-blue-400"}`}
          onClick={e => e.stopPropagation()}>
          {part}
        </a>
      );
    }
    if (/^@/i.test(part)) {
      return <span key={i} className={isOwn ? "text-white font-medium" : "text-emerald-500 font-medium"}>{part}</span>;
    }
    return <span key={i}>{part}</span>;
  });
}
const EMOJIS = ["🤖", "🎨", "📈", "💡", "🚀", "🎵", "📚", "🌱", "⚡", "🔥", "🌍", "🎮"];

/** Wrap query matches in a <mark> for in-chat search highlighting. */
function highlightText(text: string, query: string, isOwn?: boolean): React.ReactNode {
  const q = query.trim();
  if (!q) return <span>{text}</span>;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className={`rounded px-0.5 font-medium ${isOwn ? "bg-white/40 text-white" : "bg-yellow-300 dark:bg-yellow-600/70 text-foreground"}`}>
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

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

// Image message bubble — no colored background around the image.
// Portrait images (height > 1.2× width) are cropped to 3:4.
function ImageMsg({
  url, text, isMe, reply, onLightbox, renderCaption,
}: {
  url: string;
  text: string | null;
  isMe: boolean;
  reply?: { author?: string | null; text?: string | null } | null;
  onLightbox: () => void;
  renderCaption: (t: string) => React.ReactNode;
}) {
  const [portrait, setPortrait] = useState(false);
  const captionBg = isMe ? "hsl(var(--primary))" : "hsl(var(--muted))";
  const captionColor = isMe ? "hsl(var(--primary-foreground))" : "hsl(var(--foreground))";
  const replyBorder = isMe ? "rgba(255,255,255,0.45)" : "hsl(var(--primary))";
  const replyLabelColor = isMe ? "rgba(255,255,255,0.75)" : "hsl(var(--primary))";
  const replyTextColor = isMe ? "rgba(255,255,255,0.65)" : "hsl(var(--muted-foreground))";

  return (
    <div style={{ borderRadius: "18px", overflow: "hidden", maxWidth: "100%", position: "relative" }}>
      {reply && (
        <div style={{ background: captionBg, color: captionColor, padding: "6px 10px 4px 8px", borderLeft: `3px solid ${replyBorder}` }}>
          {reply.author && <p style={{ fontSize: 10, fontWeight: 700, color: replyLabelColor, marginBottom: 1 }}>{reply.author}</p>}
          <p style={{ fontSize: 11, color: replyTextColor }}>{reply.text ? reply.text.slice(0, 80) : "📎 Media"}</p>
        </div>
      )}
      <button onClick={onLightbox} className="block w-full" style={{ display: "block" }}>
        <img
          src={url}
          alt="shared"
          className="block w-full"
          style={{
            height: "auto",
            aspectRatio: portrait ? "3 / 4" : undefined,
            objectFit: portrait ? "cover" : undefined,
            objectPosition: "center top",
          }}
          onLoad={e => {
            const img = e.currentTarget;
            setPortrait(img.naturalHeight > img.naturalWidth * 1.2);
          }}
          loading="lazy"
        />
      </button>
      {text?.trim() ? (
        <div style={{ background: captionBg, color: captionColor, padding: "6px 12px 10px", fontSize: 13, lineHeight: 1.45, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {renderCaption(text.trim())}
        </div>
      ) : null}
    </div>
  );
}

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

// ── Promote Admin Modal ───────────────────────────────────────────────────
type PromoteAdminModalProps = {
  memberName: string;
  perms: AdminPermissions;
  onChange: (perms: AdminPermissions) => void;
  onConfirm: () => void;
  onClose: () => void;
};

const PERMISSION_LABELS: { key: keyof AdminPermissions; label: string; desc: string }[] = [
  { key: "removeUsers",      label: "Remove Users",       desc: "Can kick members from the community" },
  { key: "changeChannelInfo",label: "Change Channel Info", desc: "Can edit community name, description and icon" },
  { key: "banUsers",         label: "Ban Users",           desc: "Can permanently ban members" },
  { key: "addSubscribers",   label: "Add Subscribers",     desc: "Can invite and add new members" },
  { key: "manageMessages",   label: "Manage Messages",     desc: "Can delete any message in the community" },
  { key: "promoteAdmins",    label: "Promote New Admins",  desc: "Can promote members to admin" },
];

const PromoteAdminModal = memo(({ memberName, perms, onChange, onConfirm, onClose }: PromoteAdminModalProps) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
    <div className="bg-card border border-border rounded-2xl w-full max-w-sm shadow-2xl animate-in fade-in zoom-in-95 duration-150"
      onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border">
        <div>
          <p className="font-semibold text-foreground">Select Admin Rights</p>
          <p className="text-xs text-muted-foreground mt-0.5">Promoting <span className="font-medium text-foreground">{memberName}</span></p>
        </div>
        <button onClick={onClose}
          className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="px-5 py-3 space-y-1">
        {PERMISSION_LABELS.map(({ key, label, desc }) => (
          <label key={key} className="flex items-start gap-3 py-2.5 cursor-pointer group select-none">
            <input
              type="checkbox"
              checked={perms[key]}
              onChange={e => onChange({ ...perms, [key]: e.target.checked })}
              className="sr-only"
            />
            <div className={`mt-0.5 h-5 w-5 shrink-0 rounded-md border-2 flex items-center justify-center transition-colors ${
              perms[key] ? "bg-primary border-primary" : "border-border group-hover:border-primary/50"
            }`}>
              {perms[key] && <Check className="h-3 w-3 text-primary-foreground" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground leading-tight">{label}</p>
              <p className="text-xs text-muted-foreground leading-tight mt-0.5">{desc}</p>
            </div>
          </label>
        ))}
      </div>
      <div className="px-5 pb-5 pt-2 flex gap-2">
        <Button className="flex-1" onClick={onConfirm}>Confirm & Promote</Button>
        <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  </div>
));

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
  const [sort, setSort] = useState<"popular" | "newest" | "active">("popular");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [loadingGroups, setLoadingGroups] = useState(true);
  // Groups that had a message in the last 48 hours — loaded once alongside groups
  const [activeGroupIds, setActiveGroupIds] = useState<Set<string>>(new Set());

  // View routing
  const [view, setView] = useState<"list" | "group" | "create">("list");
  const [activeGroup, setActiveGroup] = useState<Group | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showShare, setShowShare] = useState(false);

  // Settings
  const [editingGroup, setEditingGroup] = useState(false);
  const [editName, setEditName] = useState("");
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
  // Reply-to
  const [replyTo, setReplyTo] = useState<GroupMessage | null>(null);
  // Reactions: messageId → emoji → { count, userIds }
  type ReactionMap = Record<string, Record<string, { count: number; userIds: string[] }>>;
  const [reactions, setReactions] = useState<ReactionMap>({});
  // Which message's emoji picker is open
  const [reactionPickerMsgId, setReactionPickerMsgId] = useState<string | null>(null);

  // Chat search
  type SearchResult = { id: string; text: string; snippet: string; media_url: string | null; media_type: string | null; created_at: string; sender: { id: string; name: string; color: string; avatar_url: string | null } };
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Local search: ordered list of message IDs that match the query + current position
  const [searchMatchIds, setSearchMatchIds] = useState<string[]>([]);
  const [searchMatchIndex, setSearchMatchIndex] = useState(0);
  // Track in-progress join request accept/decline to prevent double-clicks
  const [processingRequestIds, setProcessingRequestIds] = useState<Set<string>>(new Set());
  // Typing indicators — map of userId → name (ephemeral, not stored in DB)
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  // Typing debounce ref — stop typing after 3s of inactivity
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Online presence for active group
  const [onlineUsers, setOnlineUsers] = useState<Record<string, boolean>>({});

  // Banned users (settings panel)
  const [bannedUsers, setBannedUsers] = useState<BannedUser[]>([]);
  const [bannedLoading, setBannedLoading] = useState(false);
  const [showBanned, setShowBanned] = useState(false);

  // Join requests (private communities)
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [joinRequestsLoading, setJoinRequestsLoading] = useState(false);
  const [showJoinRequests, setShowJoinRequests] = useState(false);
  // Count of pending join requests — drives red dot on gear + badge on Requests button
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  // Track whether the current user has sent a join request per group
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set());
  // Synchronous ref-based lock to prevent spam clicks — state updates are async
  // and two rapid clicks can both pass a state-based check before it re-renders.
  const joiningRef = useRef<Set<string>>(new Set());

  // Admin permissions modal — shown when promoting a member to admin
  const [promoteModal, setPromoteModal] = useState<{ memberId: string; memberName: string } | null>(null);
  const [promotePerms, setPromotePerms] = useState<AdminPermissions>({ ...DEFAULT_ADMIN_PERMISSIONS });
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
  // Settings panel modal: which section is open
  const [settingsPanel, setSettingsPanel] = useState<null | "members" | "add" | "banned" | "requests">(null);

  // Delete community confirm modal
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Report community modal
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);

  // Report flow: type-picker sheet → in-chat selection mode
  const [showReportTypeSheet, setShowReportTypeSheet] = useState(false);
  const [reportType, setReportType] = useState("");
  const [reportSelectionMode, setReportSelectionMode] = useState(false);
  const [reportSelectedMsgIds, setReportSelectedMsgIds] = useState<Set<string>>(new Set());
  const [reportFlowSubmitting, setReportFlowSubmitting] = useState(false);

  // Community image upload (settings)
  const [editImageUrl, setEditImageUrl] = useState<string | null>(null);
  const [editImagePreview, setEditImagePreview] = useState<string | null>(null);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const settingsImageRef = useRef<HTMLInputElement>(null);

  // Image / Video send modals
  type ImgQuality = "480p" | "720p" | "hd";
  type VidQuality = "low" | "medium" | "original";
  const [imgModal, setImgModal] = useState<{ file: File; previewUrl: string } | null>(null);
  const [vidModal, setVidModal] = useState<{ file: File; previewUrl: string } | null>(null);
  const [fileModal, setFileModal] = useState<{ file: File } | null>(null);
  const [vidCaption, setVidCaption] = useState("");
  const [vidQuality, setVidQuality] = useState<VidQuality>("medium");
  const [vidUploading, setVidUploading] = useState(false);
  const [vidUploadPct, setVidUploadPct] = useState(0);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [imgCaption, setImgCaption] = useState("");
  const [imgQuality, setImgQuality] = useState<ImgQuality>("720p");
  const [imgUploading, setImgUploading] = useState(false);
  const [imgUploadPct, setImgUploadPct] = useState(0);
  const [fileCaption, setFileCaption] = useState("");
  const [fileUploading, setFileUploading] = useState(false);
  const [fileUploadPct, setFileUploadPct] = useState(0);

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
  const messagesAreaRef = useRef<HTMLDivElement>(null);
  const savedScrollRef = useRef<number>(-1); // -1 = scroll to bottom (default)
  const lightboxRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const editRef = useRef<HTMLInputElement>(null);
  // Profile cache: avoid re-fetching the same user's profile on every message
  const profileCache = useRef<Record<string, { name: string; color: string; avatar_url?: string; role?: string }>>({});
  // Cache of pending request counts per group — populated on open so the red dot is instant
  const pendingCountsCacheRef = useRef<Record<string, number>>({});
  // Ref to track current view without stale closure in realtime handlers
  // Kept as refs (not derived from state) so realtime handlers always read the latest value
  // without stale closures. Updated synchronously in openGroup + setView calls.
  const viewRef = useRef(view);
  const activeGroupIdRef = useRef<string | undefined>(undefined);

  const isOwner = activeGroup ? activeGroup.owner_id === user.id : false;
  const isAdmin = isOwner || members.find(m => m.id === user.id)?.role === "admin";
  const isJoined = activeGroup ? (joinedIds.has(activeGroup.id) || isOwner) : false;

  // ── Socket.IO — primary realtime transport ───────────────────────────────
  // Get the Supabase session token for Socket.IO auth
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

  const { sendMessage: socketSend, startTyping, stopTyping, markRead } = useGroupSocket({
    token: socketToken,
    activeGroupId: view === "group" ? (activeGroup?.id ?? null) : null,

    // New message from another user via Socket.IO
    onMessage: useCallback((msg) => {
      const isActive = viewRef.current === "group" && activeGroupIdRef.current === msg.group_id;
      if (!isActive && !msg.is_system) {
        setUnreadCounts(prev => ({ ...prev, [msg.group_id]: (prev[msg.group_id] ?? 0) + 1 }));
      } else if (isActive) {
        try { localStorage.setItem(`prf_read_${user.id}_${msg.group_id}`, new Date().toISOString()); } catch { /* ignore */ }
      }
      setMessages(prev => {
        if (prev.find(m => m.id === msg.id)) return prev;
        return [...prev, {
          id: msg.id, group_id: msg.group_id, user_id: msg.user_id,
          text: msg.text, media_url: msg.media_url, media_type: msg.media_type,
          created_at: msg.created_at, edited: msg.edited, deleted: false,
          unsent: msg.unsent, removed_by_admin: msg.removed_by_admin,
          is_system: msg.is_system, reply_to_id: msg.reply_to_id,
          reply_to_text: null, reply_to_author: null,
          author_name: msg.author_name, author_color: msg.author_color,
          author_avatar_url: msg.author_avatar_url ?? undefined,
          author_role: msg.author_role ?? undefined,
        }];
      });
      if (!msg.is_system && msg.text?.includes(`@${user.name}`)) {
        setMentionMsgIds(prev => prev.includes(msg.id) ? prev : [...prev, msg.id]);
      }
    }, [user.id, user.name]),

    // Server ack — replace temp UUID with real DB row
    onAck: useCallback((clientId, msg) => {
      setWsStatus("connected");
      setMessages(prev => prev.map(m =>
        m.id === clientId ? {
          ...m,
          id: msg.id,
          created_at: msg.created_at,
        } : m
      ));
    }, []),

    onMessageUpdated: useCallback((partial) => {
      setMessages(prev => prev.map(m =>
        m.id === partial.id
          ? { ...m, ...partial, id: (partial as any).new_id ?? partial.id }
          : m
      ));
    }, []),

    onMessageDeleted: useCallback((id) => {
      setMessages(prev => prev.filter(m => m.id !== id));
    }, []),

    onPresenceSnapshot: useCallback((_groupId, users) => {
      const map: Record<string, boolean> = {};
      users.forEach(u => { map[u.userId] = true; });
      setOnlineUsers(map);
    }, []),

    onPresenceUpdate: useCallback((_groupId, presenceUser, online) => {
      setOnlineUsers(prev => ({ ...prev, [presenceUser.userId]: online }));
    }, []),

    onTypingStart: useCallback((_groupId, userId, userName) => {
      if (userId === user.id) return;
      setTypingUsers(prev => ({ ...prev, [userId]: userName }));
    }, [user.id]),

    onTypingStop: useCallback((_groupId, userId) => {
      setTypingUsers(prev => { const s = { ...prev }; delete s[userId]; return s; });
    }, []),

    onReaction: useCallback(({ messageId, emoji, userId: reactorId, action }) => {
      setReactions(prev => {
        const msg = { ...(prev[messageId] ?? {}) };
        if (action === "removed") {
          const newUserIds = (msg[emoji]?.userIds ?? []).filter(id => id !== reactorId);
          if (newUserIds.length === 0) {
            const { [emoji]: _removed, ...rest } = msg;
            return { ...prev, [messageId]: rest };
          }
          return { ...prev, [messageId]: { ...msg, [emoji]: { count: newUserIds.length, userIds: newUserIds } } };
        } else {
          const existing = msg[emoji]?.userIds ?? [];
          if (existing.includes(reactorId)) return prev; // already there
          const userIds = [...existing, reactorId];
          return { ...prev, [messageId]: { ...msg, [emoji]: { count: userIds.length, userIds } } };
        }
      });
    }, []),
  });

  // ── Keep active group unread count at zero while viewing ────────────────
  useEffect(() => {
    if (view === "group" && activeGroup) {
      setUnreadCounts(prev => {
        if ((prev[activeGroup.id] ?? 0) === 0) return prev;
        return { ...prev, [activeGroup.id]: 0 };
      });
    }
  }, [view, activeGroup]);

  // ── Broadcast total unread count to Layout sidebar ───────────────────────
  useEffect(() => {
    const total = Object.values(unreadCounts).reduce((a, b) => a + b, 0);
    window.dispatchEvent(new CustomEvent("prolifier:groups-unread", { detail: total }));
    try { localStorage.setItem(`prf_groups_unread_${user.id}`, String(total)); } catch { /* ignore */ }
  }, [unreadCounts, user.id]);

  // Derive current user's own permissions (used in the members list to gate actions)
  const myPermissions = useMemo((): AdminPermissions | null => {
    if (isOwner) return null; // owner has all permissions implicitly
    const me = members.find(m => m.id === user.id);
    if (me?.role !== "admin") return null;
    return me.permissions ?? { ...DEFAULT_ADMIN_PERMISSIONS };
  }, [isOwner, members, user.id]);

  // Memoised derived values — must all be declared before any early returns
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const base = groups.filter(g =>
      (!search || g.name.toLowerCase().includes(q) || g.topic.toLowerCase().includes(q))
      && (topic === "" || g.topic === topic)
      && (filter === "all" || joinedIds.has(g.id) || g.owner_id === user.id)
    );
    if (sort === "newest") {
      return [...base].sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
    if (sort === "active") {
      return base
        .filter(g => activeGroupIds.has(g.id))
        .sort((a, b) => b.member_count - a.member_count);
    }
    // default: popular
    return [...base].sort((a, b) => b.member_count - a.member_count);
  }, [groups, search, topic, filter, sort, joinedIds, activeGroupIds, user.id]);

  const totalUnread = useMemo(
    () => Object.values(unreadCounts).reduce((a, b) => a + b, 0),
    [unreadCounts]
  );
  const joinedCount = useMemo(
    () => groups.filter(g => joinedIds.has(g.id) || g.owner_id === user.id).length,
    [groups, joinedIds, user.id]
  );

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
        // Always zero out the currently-open group regardless of DB count
        if (activeGroupIdRef.current) initialUnread[activeGroupIdRef.current] = 0;
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

        // Detect "active" groups using last_message_at on the groups table itself —
        // this avoids RLS blocking access to private group messages for non-members.
        try {
          const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
          const activeIds = (groupsData || [])
            .filter((g: any) => g.last_message_at && g.last_message_at > cutoff)
            .map((g: any) => g.id);
          setActiveGroupIds(new Set(activeIds));
        } catch { /* non-fatal */ }
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
        .select("id, group_id, user_id, text, media_url, media_type, created_at, edited, unsent, removed_by_admin, is_system, reply_to_id")
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
        .select("id, name, color, avatar_url, role")
        .in("id", userIds);
      const profileMap: Record<string, { name: string; color: string; avatar_url?: string; role?: string }> = {};
      (profiles || []).forEach((p: any) => {
        const entry = { name: p.name, color: p.color, avatar_url: p.avatar_url ?? undefined, role: p.role };
        profileMap[p.id] = entry;
        // Seed profileCache so CDC/Socket.IO path has data without an extra fetch
        profileCache.current[p.id] = entry;
      });

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
        removed_by_admin: row.removed_by_admin ?? false,
        is_system: row.is_system ?? false,
        reply_to_id: row.reply_to_id ?? null,
        reply_to_text: null,
        reply_to_author: null,
        author_name: profileMap[row.user_id]?.name || "Unknown",
        author_color: profileMap[row.user_id]?.color || "bg-primary",
        author_avatar_url: profileMap[row.user_id]?.avatar_url,
        author_role: profileMap[row.user_id]?.role,
      }));
      setMessages(mapped);

      const visibleIds = mapped.filter((m: GroupMessage) => !m.is_system && !m.unsent).map((m: GroupMessage) => m.id);
      if (visibleIds.length > 0) {
        // Fetch reactions for loaded messages
        apiGetMessageReactions(groupId, visibleIds)
          .then(res => { if (res.success && res.data) setReactions(res.data); })
          .catch(() => {});
      }

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
      // Try fetching with permissions column first; fall back without it if the
      // column doesn't exist yet in the DB (avoids blank member list on old schemas).
      let data: any[] | null = null;
      let count: number | null = null;
      const withPerms = await (supabase as any)
        .from("group_members")
        .select("id, user_id, role, permissions, profiles:user_id (name, color, avatar_url)", { count: "exact" })
        .eq("group_id", groupId)
        .order("joined_at", { ascending: true });

      if (withPerms.error) {
        // Column may not exist — retry without permissions
        const fallback = await (supabase as any)
          .from("group_members")
          .select("id, user_id, role, profiles:user_id (name, color, avatar_url)", { count: "exact" })
          .eq("group_id", groupId)
          .order("joined_at", { ascending: true });
        if (fallback.error) throw fallback.error;
        data = fallback.data;
        count = fallback.count;
      } else {
        data = withPerms.data;
        count = withPerms.count;
      }

      setMembers((data || []).map((row: any) => ({
        id: row.user_id,
        name: row.profiles?.name || "Unknown",
        color: row.profiles?.color || "bg-primary",
        avatarUrl: row.profiles?.avatar_url || undefined,
        role: row.role || "member",
        permissions: row.permissions ?? undefined,
      })));

      // Fix member_count: use actual row count from DB
      const realCount = count ?? (data?.length ?? 0);
      setActiveGroup(prev => prev && prev.id === groupId ? { ...prev, member_count: realCount } : prev);
      setGroups(prev => prev.map(g => g.id === groupId ? { ...g, member_count: realCount } : g));

      // Sync the count in DB only if it diverged — fire-and-forget, never block the UI
      const currentCount = groups.find(g => g.id === groupId)?.member_count;
      if (currentCount !== realCount) {
        (supabase as any).from("groups").update({ member_count: realCount }).eq("id", groupId).then(() => {});
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
            .from("profiles").select("name, color, avatar_url, role").eq("id", uid).single();
          const p = { name: data?.name || "Unknown", color: data?.color || "bg-primary", avatar_url: data?.avatar_url || undefined, role: data?.role };
          profileCache.current[uid] = p;
          return p;
        };
        if (payload.eventType === "INSERT") {
          const row = payload.new as any;

          // Own messages are handled by Socket.IO ack — skip to avoid duplicates.
          // The Socket.IO path adds the message optimistically with a UUID id and
          // then replaces it on ack; Supabase CDC would cause a double entry.
          if (row.user_id === user.id) return;

          // Only increment unread when the user is NOT currently viewing this group
          const isActiveAndViewing = viewRef.current === "group" && activeGroupIdRef.current === row.group_id;
          if (!row.is_system && !isActiveAndViewing) {
            setUnreadCounts(prev => {
              const cur = prev[row.group_id] ?? 0;
              return { ...prev, [row.group_id]: cur + 1 };
            });
          }
          // Keep localStorage read timestamp fresh while user is viewing
          if (isActiveAndViewing && !row.is_system) {
            try { localStorage.setItem(`prf_read_${user.id}_${row.group_id}`, new Date().toISOString()); } catch { /* ignore */ }
          }
          setMessages(prev => {
            // Already delivered by Socket.IO (real id or UUID since replaced) — skip
            if (prev.find(m => m.id === row.id)) return prev;
            // Append (Socket.IO message:new + message:updated should have already
            // replaced the UUID, but this catches any edge-case timing gap)
            const newMsg = {
              id: row.id, group_id: row.group_id, user_id: row.user_id,
              text: row.text, media_url: row.media_url, media_type: row.media_type,
              created_at: row.created_at, edited: row.edited ?? false, deleted: false,
              unsent: row.unsent ?? false, removed_by_admin: row.removed_by_admin ?? false, is_system: row.is_system ?? false,
              author_name: profileCache.current[row.user_id]?.name || "…",
              author_color: profileCache.current[row.user_id]?.color || "bg-primary",
              author_avatar_url: profileCache.current[row.user_id]?.avatar_url,
              author_role: profileCache.current[row.user_id]?.role,
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
              m.id === row.id ? { ...m, author_name: profile.name, author_color: profile.color, author_avatar_url: profile.avatar_url, author_role: profile.role } : m
            ));
          }
        } else if (payload.eventType === "UPDATE") {
          const row = payload.new as any;
          setMessages(prev => prev.map(m =>
            m.id === row.id ? { ...m, text: row.text, edited: row.edited ?? true, unsent: row.unsent ?? false, removed_by_admin: row.removed_by_admin ?? false } : m
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

  // ── Realtime: sync join requests for admin + own request status ─────────────
  // Subscribes to group_join_requests changes on the active group so that:
  //   • Admin panel updates instantly when a new request arrives or is cancelled
  //   • Requester's button reverts to "Request" if their pending request is deleted
  //     (e.g. admin accepted/rejected externally without them refreshing)
  useRealtimeChannel(
    activeGroup?.id ? `joinreq-${activeGroup.id}` : null,
    ch => ch.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "group_join_requests", filter: `group_id=eq.${activeGroup?.id}` },
      async (payload) => {
        if (payload.eventType === "INSERT") {
          const row = payload.new as any;
          // Update the admin's panel if it's open
          if (row.status === "pending") {
            // Fetch profile for the new requester
            const { data: profile } = await (supabase as any)
              .from("profiles").select("name, color, avatar_url").eq("id", row.user_id).single();
            const newReq: JoinRequest = {
              id: row.id,
              user_id: row.user_id,
              status: row.status,
              created_at: row.created_at,
              profile: profile ? { name: profile.name, color: profile.color, avatar_url: profile.avatar_url } : null,
            };
            setJoinRequests(prev => prev.find(r => r.id === row.id) ? prev : [...prev, newReq]);
            if (row.user_id !== user.id) {
            pendingCountsCacheRef.current[row.group_id] = (pendingCountsCacheRef.current[row.group_id] ?? 0) + 1;
            setPendingRequestCount(prev => prev + 1);
          }
          }
          // Update requestedIds if this is the current user's own request
          if (row.user_id === user.id && row.status === "pending") {
            setRequestedIds(prev => new Set([...prev, row.group_id]));
          }
        } else if (payload.eventType === "DELETE") {
          const row = payload.old as any;
          // Remove from admin's panel instantly
          setJoinRequests(prev => prev.filter(r => r.id !== row.id));
          pendingCountsCacheRef.current[activeGroup?.id ?? ""] = Math.max(0, (pendingCountsCacheRef.current[activeGroup?.id ?? ""] ?? 1) - 1);
          setPendingRequestCount(prev => Math.max(0, prev - 1));
          // Clear from requester's local state (cancellation or admin resolved it)
          if (row.user_id === user.id) {
            setRequestedIds(prev => { const s = new Set(prev); s.delete(row.group_id ?? activeGroup?.id); return s; });
          }
        } else if (payload.eventType === "UPDATE") {
          const row = payload.new as any;
          // Remove resolved requests from admin panel
          if (row.status !== "pending") {
            setJoinRequests(prev => prev.filter(r => r.id !== row.id));
            setPendingRequestCount(prev => Math.max(0, prev - 1));
          }
          // If this user's request was accepted, update joinedIds
          if (row.user_id === user.id) {
            if (row.status === "accepted") {
              setRequestedIds(prev => { const s = new Set(prev); s.delete(row.group_id); return s; });
              setJoinedIds(prev => new Set([...prev, row.group_id]));
            } else if (row.status === "rejected") {
              setRequestedIds(prev => { const s = new Set(prev); s.delete(row.group_id); return s; });
            }
          }
        }
      }
    ),
  );

  // Realtime: re-fetch members when any group_members row changes (role promotions/revocations)
  // This ensures a promoted user sees their new admin powers without needing to reopen the group.
  useRealtimeChannel(
    activeGroup?.id ? `members-${activeGroup.id}` : null,
    ch => ch.on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "group_members", filter: `group_id=eq.${activeGroup?.id}` },
      () => {
        if (activeGroup?.id) fetchMembers(activeGroup.id);
      }
    ),
  );

  // Scroll to bottom on new messages (skip if returning from settings with a saved position)
  useEffect(() => {
    if (messages.length > 0) {
      if (savedScrollRef.current >= 0) {
        // Restore position saved before opening settings
        const pos = savedScrollRef.current;
        savedScrollRef.current = -1;
        requestAnimationFrame(() => {
          if (messagesAreaRef.current) messagesAreaRef.current.scrollTop = pos;
        });
      } else {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    }
  }, [messages.length]);

  // Lightbox fullscreen
  useEffect(() => {
    if (lightboxUrl && lightboxRef.current) {
      lightboxRef.current.requestFullscreen?.().catch(() => {});
    } else if (!lightboxUrl && document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
  }, [lightboxUrl]);

  useEffect(() => {
    if (editingMsgId) setTimeout(() => editRef.current?.focus(), 30);
  }, [editingMsgId]);

  // ── Local chat search: filter loaded messages client-side ─────────────────
  useEffect(() => {
    if (!showSearch || searchQuery.trim().length < 2) {
      setSearchMatchIds([]);
      setSearchMatchIndex(0);
      return;
    }
    const q = searchQuery.toLowerCase();
    const matches = messages
      .filter(m => !m.is_system && !m.unsent && m.text?.toLowerCase().includes(q))
      .map(m => m.id);
    setSearchMatchIds(matches);
    setSearchMatchIndex(0);
  }, [searchQuery, messages, showSearch]);

  // Scroll to current search match whenever it changes
  useEffect(() => {
    if (searchMatchIds.length === 0) return;
    const id = searchMatchIds[searchMatchIndex];
    requestAnimationFrame(() => {
      document.getElementById(`msg-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [searchMatchIndex, searchMatchIds]);

  // ── Exit report selection mode on browser/hardware back ───────────────────
  useEffect(() => {
    if (!reportSelectionMode) return;
    const handlePopstate = () => {
      setReportSelectionMode(false);
      setReportSelectedMsgIds(new Set());
      setReportType("");
    };
    window.addEventListener("popstate", handlePopstate);
    return () => window.removeEventListener("popstate", handlePopstate);
  }, [reportSelectionMode]);

  // ── Open group — don't await; switch view instantly ──────────────────────
  const openGroup = (group: Group) => {
    // Update refs synchronously BEFORE any state setter so realtime handlers
    // immediately see the correct active group and don't increment unread counts.
    viewRef.current = "group";
    activeGroupIdRef.current = group.id;
    setActiveGroup(group);
    setShowSettings(false);
    setShowShare(false);
    setEditingGroup(false);
    setMsgMenuId(null);
    setEditingMsgId(null);
    setChatInput("");
    setReplyTo(null);
    setView("group");
    setMembers([]);
    setSettingsPanel(null);
    setMentionMsgIds([]);
    mentionJumpIdx.current = 0;
    // Reset chat search so reopening the same group doesn't show stale results
    setShowSearch(false);
    setSearchQuery("");
    setSearchResults([]);
    // Mark this group as read instantly — reset unread + mentions + persist timestamp
    setUnreadCounts(prev => ({ ...prev, [group.id]: 0 }));
    setMentionGroupIds(prev => { const s = new Set(prev); s.delete(group.id); return s; });
    try { localStorage.setItem(`prf_read_${user.id}_${group.id}`, new Date().toISOString()); } catch { /* storage full */ }
    markRead(group.id);
    // Show cached pending count instantly (no delay), then refresh from API
    const cached = pendingCountsCacheRef.current[group.id] ?? 0;
    setPendingRequestCount(cached);
    fetchMessages(group.id);
    fetchMembers(group.id);
    // Refresh pending request count for private groups — cache result for next open
    if (group.visibility === "private") {
      apiGetJoinRequests(group.id)
        .then(reqs => {
          pendingCountsCacheRef.current[group.id] = reqs.length;
          setPendingRequestCount(reqs.length);
        })
        .catch(() => { /* user isn't admin — ignore */ });
    }
  };

  const openSettings = () => {
    if (!activeGroup) return;
    // Save current scroll position so we can restore it when the user returns
    savedScrollRef.current = messagesAreaRef.current?.scrollTop ?? -1;
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
    if (!g || joiningRef.current.has(groupId)) return;
    joiningRef.current.add(groupId);
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
        } else {
          // Optimistic: mark as requested immediately
          setRequestedIds(prev => new Set([...prev, groupId]));
          try {
            await apiRequestToJoin(groupId);
            toast({ title: "Request sent!", description: "An admin will review your request." });
          } catch {
            setRequestedIds(prev => { const s = new Set(prev); s.delete(groupId); return s; }); // revert
            toast({ title: "Could not send request", variant: "destructive" });
          }
        }
        joiningRef.current.delete(groupId);
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
      joiningRef.current.delete(groupId);
    }
  };

  // ── Send message ─────────────────────────────────────────────────────────
  // Primary path: Socket.IO (immediate broadcast + DB persist on server).
  // The server acks with the real DB id; we replace the temp UUID via onAck.
  const sendMessage = (text?: string, mediaUrl?: string, mediaType?: string) => {
    const trimmed = text?.trim();
    if ((!trimmed && !mediaUrl) || !activeGroup) return;
    setMentionQuery("");
    setMentionResults([]);
    // Stop typing indicator on send
    if (typingTimerRef.current) { clearTimeout(typingTimerRef.current); typingTimerRef.current = null; }
    stopTyping(activeGroup.id);

    const replyRef = replyTo;
    setReplyTo(null);

    // Client-generated UUID — used for dedup on server + optimistic replacement
    const clientId = uuidv4();

    // Add to UI instantly with the UUID as the temp id
    setMessages(prev => [...prev, {
      id: clientId,
      group_id: activeGroup.id,
      user_id: user.id,
      text: trimmed || null,
      media_url: mediaUrl || null,
      media_type: mediaType || null,
      created_at: new Date().toISOString(),
      edited: false,
      deleted: false,
      unsent: false,
      removed_by_admin: false,
      is_system: false,
      author_name: user.name,
      author_color: user.color,
      author_avatar_url: user.avatarUrl || undefined,
      author_role: user.role,
      reply_to_id: replyRef?.id ?? null,
      reply_to_text: replyRef?.text ?? null,
      reply_to_author: replyRef?.author_name ?? null,
    }]);
    setChatInput("");
    // Reset textarea height after clearing input
    if (inputRef.current) { inputRef.current.style.height = "auto"; }
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    inputRef.current?.focus();

    // Send via Socket.IO — server broadcasts then persists, acks back with real id
    socketSend({
      clientId,
      groupId: activeGroup.id,
      text: trimmed || null,
      mediaUrl: mediaUrl || null,
      mediaType: mediaType || null,
      replyToId: replyRef?.id ?? null,
    });
  };

  // ── File upload ──────────────────────────────────────────────────────────

  // Resize image client-side before upload
  const resizeImage = (file: File, maxW: number, maxH: number): Promise<File> =>
    new Promise(resolve => {
      const img = new window.Image();
      const objUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objUrl);
        let { width, height } = img;
        const ratio = Math.min(maxW / width, maxH / height, 1);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
        canvas.toBlob(blob => resolve(new File([blob!], file.name, { type: "image/jpeg" })), "image/jpeg", 0.88);
      };
      img.src = objUrl;
    });

  // Called when user confirms send in the image modal
  const sendImageMsg = async () => {
    if (!imgModal || !activeGroup) return;
    setImgUploading(true);
    setImgUploadPct(0);
    try {
      let fileToUpload = imgModal.file;
      if (imgQuality === "480p")  fileToUpload = await resizeImage(imgModal.file, 854, 480);
      if (imgQuality === "720p")  fileToUpload = await resizeImage(imgModal.file, 1280, 720);
      const uploaded = await uploadPostImage(fileToUpload, "chat", pct => setImgUploadPct(pct));
      sendMessage(imgCaption.trim() || undefined, uploaded.url, "image");
      setImgModal(null);
      setImgCaption("");
      setImgQuality("720p");
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setImgUploading(false);
      setImgUploadPct(0);
    }
  };

  const sendVideoMsg = async () => {
    if (!vidModal || !activeGroup) return;
    setVidUploading(true);
    setVidUploadPct(0);
    try {
      const uploaded = await uploadVideo(vidModal.file, "chat", pct => setVidUploadPct(pct));
      sendMessage(vidCaption.trim() || undefined, uploaded.fallbackUrl, "video");
      setVidModal(null);
      setVidCaption("");
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setVidUploading(false);
      setVidUploadPct(0);
    }
  };

  const sendFileMsg = async () => {
    if (!fileModal || !activeGroup) return;
    setFileUploading(true);
    setFileUploadPct(0);
    try {
      const uploaded = await uploadFile(fileModal.file, pct => setFileUploadPct(pct));
      // Store as "filename\ndescription" — inbox splits on first \n
      const payload = fileCaption.trim()
        ? `${fileModal.file.name}\n${fileCaption.trim()}`
        : fileModal.file.name;
      sendMessage(payload, uploaded.url, "file");
      setFileModal(null);
      setFileCaption("");
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setFileUploading(false);
      setFileUploadPct(0);
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>, type: MediaType) => {
    const file = e.target.files?.[0];
    if (!file || !activeGroup) return;
    if (type === "image") {
      setImgModal({ file, previewUrl: URL.createObjectURL(file) });
      setImgCaption("");
      setImgQuality("720p");
      e.target.value = "";
      return;
    }
    if (type === "video") {
      setVidModal({ file, previewUrl: URL.createObjectURL(file) });
      setVidCaption("");
      setVidQuality("medium");
      setVidUploadPct(0);
      e.target.value = "";
      return;
    }
    if (type === "file") {
      setFileModal({ file });
      setFileCaption("");
      setFileUploadPct(0);
      e.target.value = "";
      return;
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
    if (!activeGroup) return;
    setMsgMenuId(null);
    // Show tombstone immediately (optimistic)
    setMessages(prev => prev.map(m =>
      m.id === msgId ? { ...m, unsent: true, text: null, media_url: null, media_type: null } : m
    ));

    try {
      // Use backend API — it uses supabaseAdmin so admins can delete any message (RLS bypass)
      await apiDeleteGroupMessage(activeGroup.id, msgId);
    } catch (err) {
      if (import.meta.env.DEV) console.error("Unsend failed:", err);
      // Revert
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, unsent: false } : m));
      fetchMessages(activeGroup.id);
      toast({ title: "Could not unsend", variant: "destructive" });
    }
  };

  // ── Chat search ───────────────────────────────────────────────────────────
  const runSearch = useCallback(async (q: string) => {
    if (!activeGroup || q.trim().length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    try {
      const res = await searchGroupMessages(activeGroup.id, q, 30);
      if (res.success) setSearchResults(res.data.results ?? []);
    } catch { /* ignore */ } finally {
      setSearchLoading(false);
    }
  }, [activeGroup]);

  // ── Jump to message (search result click) ────────────────────────────────
  // If the message is already loaded, just scroll. Otherwise fetch messages
  // anchored at that timestamp so the target is visible, then scroll.
  const jumpToMessage = useCallback(async (msgId: string, createdAt: string) => {
    setShowSearch(false);
    setSearchQuery("");
    setSearchResults([]);

    const alreadyLoaded = messages.find(m => m.id === msgId);
    if (alreadyLoaded) {
      setTimeout(() => {
        document.getElementById(`msg-${msgId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
      return;
    }

    if (!activeGroup) return;
    setLoadingMessages(true);
    try {
      // Fetch 50 messages up to and including the target timestamp
      const { data: msgsDesc, error } = await (supabase as any)
        .from("group_messages")
        .select("id, group_id, user_id, text, media_url, media_type, created_at, edited, unsent, removed_by_admin, is_system")
        .eq("group_id", activeGroup.id)
        .lte("created_at", createdAt)
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      const msgs = msgsDesc ? [...msgsDesc].reverse() : [];

      const userIds = [...new Set(msgs.map((m: any) => m.user_id))] as string[];
      const { data: profiles } = await (supabase as any)
        .from("profiles")
        .select("id, name, color, avatar_url, role")
        .in("id", userIds);
      const profileMap: Record<string, any> = {};
      (profiles || []).forEach((p: any) => { profileMap[p.id] = p; });

      const mapped: GroupMessage[] = msgs.map((row: any) => ({
        id: row.id, group_id: row.group_id, user_id: row.user_id,
        text: row.text, media_url: row.media_url, media_type: row.media_type,
        created_at: row.created_at, edited: row.edited ?? false,
        deleted: false, unsent: row.unsent ?? false,
        removed_by_admin: row.removed_by_admin ?? false, is_system: row.is_system ?? false,
        author_name: profileMap[row.user_id]?.name || "Unknown",
        author_color: profileMap[row.user_id]?.color || "bg-primary",
        author_avatar_url: profileMap[row.user_id]?.avatar_url,
        author_role: profileMap[row.user_id]?.role,
      }));
      setMessages(mapped);
      setTimeout(() => {
        document.getElementById(`msg-${msgId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 250);
    } catch (err) {
      if (import.meta.env.DEV) console.error("jumpToMessage:", err);
    } finally {
      setLoadingMessages(false);
    }
  }, [messages, activeGroup]);

  // ── Toggle reaction ───────────────────────────────────────────────────────
  const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

  const handleReaction = async (msgId: string, emoji: string) => {
    if (!activeGroup) return;
    setReactionPickerMsgId(null);
    const msgReactions = reactions[msgId] ?? {};
    const alreadyReacted = msgReactions[emoji]?.userIds.includes(user.id) ?? false;

    // Find any existing reaction by this user on a *different* emoji (1 reaction per user)
    const existingEmoji = Object.entries(msgReactions).find(
      ([e, data]) => e !== emoji && data.userIds.includes(user.id)
    )?.[0];

    // Optimistic update
    setReactions(prev => {
      let msg = { ...(prev[msgId] ?? {}) };

      // Remove their previous reaction on a different emoji
      if (existingEmoji) {
        const newUserIds = (msg[existingEmoji]?.userIds ?? []).filter(id => id !== user.id);
        if (newUserIds.length === 0) {
          const { [existingEmoji]: _removed, ...rest } = msg;
          msg = rest;
        } else {
          msg = { ...msg, [existingEmoji]: { count: newUserIds.length, userIds: newUserIds } };
        }
      }

      // Toggle the clicked emoji
      if (alreadyReacted) {
        const newUserIds = (msg[emoji]?.userIds ?? []).filter(id => id !== user.id);
        if (newUserIds.length === 0) {
          const { [emoji]: _removed, ...rest } = msg;
          return { ...prev, [msgId]: rest };
        }
        return { ...prev, [msgId]: { ...msg, [emoji]: { count: newUserIds.length, userIds: newUserIds } } };
      } else {
        const userIds = [...(msg[emoji]?.userIds ?? []), user.id];
        return { ...prev, [msgId]: { ...msg, [emoji]: { count: userIds.length, userIds } } };
      }
    });

    try {
      // If switching from a different emoji, remove that one first
      if (existingEmoji && !alreadyReacted) {
        await apiToggleReaction(activeGroup.id, msgId, existingEmoji);
      }
      await apiToggleReaction(activeGroup.id, msgId, emoji);
    } catch {
      // Revert by re-fetching reactions for this message
      apiGetMessageReactions(activeGroup.id, [msgId])
        .then(res => { if (res.success && res.data) setReactions(prev => ({ ...prev, ...res.data })); })
        .catch(() => {});
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

  // ── Admin: open permissions modal before promoting ────────────────────────
  const toggleAdmin = (memberId: string, memberName: string, currentRole: string) => {
    if (!activeGroup) return;
    if (currentRole === "admin") {
      // Revoke directly — no modal needed
      revokeAdmin(memberId, memberName);
      return;
    }
    // Promoting — open modal with defaults
    setPromotePerms({ ...DEFAULT_ADMIN_PERMISSIONS });
    setPromoteModal({ memberId, memberName });
  };

  const revokeAdmin = async (memberId: string, memberName: string) => {
    if (!activeGroup) return;
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: "member", permissions: undefined } : m));
    try {
      await apiAssignRole(activeGroup.id, memberId, "member");
      toast({ title: `${memberName} is no longer an admin` });
    } catch {
      fetchMembers(activeGroup.id);
      toast({ title: "Failed to update role", variant: "destructive" });
    }
  };

  const confirmPromoteAdmin = async () => {
    if (!activeGroup || !promoteModal) return;
    const { memberId, memberName } = promoteModal;
    setPromoteModal(null);
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: "admin", permissions: promotePerms } : m));
    try {
      await apiAssignRole(activeGroup.id, memberId, "admin", promotePerms);
      toast({ title: `${memberName} is now an admin` });
    } catch {
      fetchMembers(activeGroup.id);
      toast({ title: "Failed to update role", variant: "destructive" });
    }
  };

  // ── Admin: delete group ──────────────────────────────────────────────────
  const deleteGroup = async () => {
    if (!activeGroup) return;
    setDeleting(true);
    try {
      await apiDeleteGroup(activeGroup.id);
      setGroups(prev => prev.filter(g => g.id !== activeGroup.id));
      setJoinedIds(prev => { const s = new Set(prev); s.delete(activeGroup.id); return s; });
      viewRef.current = "list"; activeGroupIdRef.current = undefined;
      setView("list");
      setActiveGroup(null);
      setShowDeleteConfirm(false);
      toast({ title: "Community deleted" });
    } catch {
      toast({ title: "Delete failed", variant: "destructive" });
    } finally {
      setDeleting(false);
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
    const trimmedName = editName.trim() || activeGroup.name;
    const updated = { ...activeGroup, name: trimmedName, bio: editBio, emoji: editEmoji, visibility: editVisibility, image_url: editImageUrl };
    setActiveGroup(updated);
    setGroups(prev => prev.map(g => g.id === activeGroup.id ? { ...g, name: trimmedName, bio: editBio, emoji: editEmoji, visibility: editVisibility, image_url: editImageUrl } : g));
    setEditingGroup(false);
    try {
      await apiUpdateGroup(activeGroup.id, { name: trimmedName, bio: editBio, emoji: editEmoji, visibility: editVisibility, image_url: editImageUrl });
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
        description: newDesc.trim() || "",
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
      const canManageMsg = isOwner || (isAdmin && (myPermissions?.manageMessages ?? true));
      const canMenu = (isMe || canManageMsg) && !m.unsent;

      // System message
      if (m.is_system) {
        // JOINREQ messages are legacy — hide them from chat (requests live in settings now)
        if (m.text?.startsWith("||JOINREQ||")) return;
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
        const isMyTombstone = m.user_id === user.id;
        els.push(
          <div key={m.id} className={"flex items-end gap-2 " + (grouped ? "mt-1" : "mt-5") + (isMyTombstone ? " justify-end" : "")}>
            {!isMyTombstone && (!grouped
              ? (
                <button onClick={() => navigate(`/profile/${m.user_id}`)}
                  className={"h-8 w-8 rounded-full " + m.author_color + " flex items-center justify-center text-white text-xs font-semibold shrink-0 overflow-hidden hover:opacity-80 transition-opacity"}>
                  {m.author_avatar_url
                    ? <img src={m.author_avatar_url} alt={m.author_name} className="w-full h-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                    : initials(m.author_name)}
                </button>
              )
              : <div className="w-8 shrink-0" />
            )}
            <p className="text-xs text-muted-foreground italic py-1.5 px-3 select-none bg-muted rounded-2xl">
              {m.removed_by_admin ? "🚫 Message removed by admin." : "🚫 This message was unsent."}
            </p>
          </div>
        );
        return;
      }

      const isMentioned = !m.is_system && m.text?.includes(`@${user.name}`);

      const isSelected = reportSelectedMsgIds.has(m.id);
      // Can only report others' messages — not own, not system, not unsent
      const selectable = reportSelectionMode && !m.is_system && !m.unsent && m.user_id !== user.id;
      // Search match highlighting
      const isCurrentSearchMatch = searchMatchIds.length > 0 && searchMatchIds[searchMatchIndex] === m.id;
      const isAnySearchMatch = searchMatchIds.includes(m.id);

      if (isMe) {
        // ── Own message — right-aligned bubble ───────────────────────────────
        els.push(
          <div key={m.id} id={`msg-${m.id}`}
            onClick={selectable ? () => setReportSelectedMsgIds(prev => { const s = new Set(prev); isSelected ? s.delete(m.id) : s.add(m.id); return s; }) : undefined}
            className={"flex items-end justify-end gap-2 group relative " + (grouped ? "mt-1" : "mt-5") + (isMentioned && !reportSelectionMode ? " -mx-1 px-1 rounded-xl bg-emerald-500/5" : "") + (selectable ? " cursor-pointer select-none -mx-2 px-2 rounded-xl transition-colors " + (isSelected ? "bg-primary/10" : "hover:bg-muted/60") : "") + (isCurrentSearchMatch ? " -mx-1 px-1 rounded-xl bg-amber-400/10" : isAnySearchMatch ? " -mx-1 px-1 rounded-xl bg-amber-400/5" : "")}>
            {/* Selection checkbox — left side for own messages */}
            {selectable && (
              <div className={`h-5 w-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${isSelected ? "bg-primary border-primary" : "border-muted-foreground/40"}`}>
                {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
              </div>
            )}
            <div className="max-w-[72%] min-w-0 flex flex-col items-end">
              {!grouped && (
                <div className="flex items-center gap-1.5 mb-1 mr-1">
                  {m.edited && <span className="text-[10px] text-muted-foreground italic">edited ·</span>}
                  <span className="text-[10px] text-muted-foreground">{fmtTime(m.created_at)}</span>
                  <span className="text-xs font-semibold text-foreground">You</span>
                </div>
              )}
              {isEditingThis ? (
                <div className="flex items-center gap-2 w-full">
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
                <div className="relative group/bbl w-full flex flex-col items-end">
                  {/* Hover actions — appear to the left of own bubble; hidden in report mode */}
                  {!reportSelectionMode && (
                    <div className="absolute right-full top-0 pr-1 transition-opacity opacity-0 group-hover/bbl:opacity-100 flex items-center gap-0.5 z-10">
                      {isJoined && (
                        <button onClick={e => { e.stopPropagation(); setReactionPickerMsgId(reactionPickerMsgId === m.id ? null : m.id); }}
                          className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground">
                          <Smile className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {canMenu && (
                        <button onClick={e => { e.stopPropagation(); setMsgMenuId(menuOpen ? null : m.id); }}
                          className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground">
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {isJoined && (
                        <button onClick={e => { e.stopPropagation(); setReplyTo(m); inputRef.current?.focus(); }}
                          className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground">
                          <CornerUpLeft className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                  {m.media_type === "image" && m.media_url ? (
                    <ImageMsg
                      url={m.media_url} text={m.text} isMe={true}
                      reply={m.reply_to_id ? { author: m.reply_to_author, text: m.reply_to_text } : null}
                      onLightbox={() => setLightboxUrl(m.media_url!)}
                      renderCaption={t => renderTextWithLinks(t, members.map(mb => mb.name), true)}
                    />
                  ) : (
                    <div className="bg-primary text-primary-foreground rounded-2xl overflow-hidden max-w-full">
                      {m.reply_to_id && (
                        <div onClick={() => { const el = document.getElementById(`msg-${m.reply_to_id}`); el?.scrollIntoView({ behavior: "smooth", block: "center" }); }}
                          className="flex items-start gap-1.5 mx-3 mt-2 mb-1.5 pl-2 border-l-2 border-white/40 cursor-pointer hover:bg-white/10 rounded-r-lg transition-colors">
                          <div className="min-w-0">
                            {m.reply_to_author && <p className="text-[10px] font-semibold text-white/80 truncate">{m.reply_to_author}</p>}
                            <p className="text-[11px] text-white/60 truncate">{m.reply_to_text ? m.reply_to_text.slice(0, 80) : "📎 Media"}</p>
                          </div>
                        </div>
                      )}
                      {m.media_type === "video" && m.media_url && (
                        <div className="relative inline-block" style={{ maxWidth: "360px", width: "100%" }}>
                          <video src={m.media_url} controls controlsList="nodownload noplaybackrate nopictureinpicture nofullscreen" disablePictureInPicture className="block w-full bg-black" />
                          <button onClick={async e => { e.stopPropagation(); const blob = await fetch(m.media_url!).then(r => r.blob()); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "video.mp4"; a.click(); URL.revokeObjectURL(a.href); }}
                            className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition-colors"
                            title="Save video">
                            <Download className="h-3.5 w-3.5 text-white" />
                          </button>
                        </div>
                      )}
                      {m.media_type === "file" && m.media_url && (() => {
                        const nl = m.text?.indexOf("\n") ?? -1;
                        const fname = nl >= 0 ? m.text!.slice(0, nl) : (m.text || "File");
                        const desc = nl >= 0 ? m.text!.slice(nl + 1).trim() : null;
                        return (
                          <>
                            <a href={m.media_url} download={fname} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 mx-3 my-2 px-3 py-2 rounded-xl bg-white/10 text-sm text-white hover:bg-white/20 transition-colors max-w-xs">
                              <Paperclip className="h-4 w-4 shrink-0" /><span className="truncate">{fname}</span>
                            </a>
                            {desc && <p className="text-sm leading-relaxed whitespace-pre-wrap break-words px-3 pb-2 text-white/80">{desc}</p>}
                          </>
                        );
                      })()}
                      {m.text?.trim() && m.media_type !== "file" && (
                        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words px-3 pt-2 pb-2" style={{ maxWidth: "360px" }}>
                          {showSearch && searchQuery.trim().length >= 2
                            ? highlightText(m.text.trim(), searchQuery, true)
                            : renderTextWithLinks(m.text.trim(), members.map(mb => mb.name), true)}
                        </p>
                      )}
                    </div>
                  )}
                  {!reportSelectionMode && menuOpen && (
                    <div className="absolute right-0 bottom-full mb-1 z-40 bg-card border border-border rounded-xl shadow-xl overflow-hidden min-w-[170px]"
                      onClick={e => e.stopPropagation()}>
                      <button onClick={() => startEditMsg(m)}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors">
                        <Edit3 className="h-3.5 w-3.5" /> Edit message
                      </button>
                      <button onClick={() => unsendMsg(m.id)}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-destructive hover:bg-destructive/5 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                        Unsend
                      </button>
                    </div>
                  )}
                  {/* Emoji picker — hidden in report mode */}
                  {!reportSelectionMode && reactionPickerMsgId === m.id && (
                    <div className="absolute right-0 bottom-full mb-1 z-50 bg-card border border-border rounded-2xl shadow-xl px-2 py-1.5 flex gap-1"
                      onClick={e => e.stopPropagation()}>
                      {QUICK_EMOJIS.map(e => (
                        <button key={e} onClick={() => handleReaction(m.id, e)}
                          className="text-lg hover:scale-125 transition-transform px-0.5 leading-none">
                          {e}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Reaction pills — hidden in report mode */}
                  {!reportSelectionMode && reactions[m.id] && Object.keys(reactions[m.id]).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1 justify-end">
                      {Object.entries(reactions[m.id]).map(([emoji, { count, userIds }]) => (
                        <button key={emoji} onClick={() => handleReaction(m.id, emoji)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors ${
                            userIds.includes(user.id)
                              ? "bg-primary/15 border-primary/40 text-primary"
                              : "bg-muted border-border text-foreground hover:bg-muted/80"
                          }`}>
                          <span>{emoji}</span>
                          <span className="font-medium">{count}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      } else {
        // ── Other user's message — left-aligned bubble ────────────────────────
        els.push(
          <div key={m.id} id={`msg-${m.id}`}
            onClick={selectable ? () => setReportSelectedMsgIds(prev => { const s = new Set(prev); isSelected ? s.delete(m.id) : s.add(m.id); return s; }) : undefined}
            className={"flex items-start gap-2 group relative " + (grouped ? "mt-1" : "mt-5") + (isMentioned && !reportSelectionMode ? " -mx-1 px-1 rounded-xl bg-emerald-500/5" : "") + (selectable ? " cursor-pointer select-none -mx-2 px-2 rounded-xl transition-colors " + (isSelected ? "bg-primary/10" : "hover:bg-muted/60") : "") + (isCurrentSearchMatch ? " -mx-1 px-1 rounded-xl bg-amber-400/10" : isAnySearchMatch ? " -mx-1 px-1 rounded-xl bg-amber-400/5" : "")}>
            {/* Selection checkbox — before avatar for others' messages */}
            {selectable && (
              <div className={`h-5 w-5 rounded-full border-2 shrink-0 flex items-center justify-center mt-1.5 transition-colors ${isSelected ? "bg-primary border-primary" : "border-muted-foreground/40"}`}>
                {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
              </div>
            )}
            {/* Avatar */}
            {!grouped
              ? (
                <button onClick={() => navigate(`/profile/${m.user_id}`)}
                  className={"h-8 w-8 rounded-full mt-0.5 " + m.author_color + " flex items-center justify-center text-white text-xs font-semibold shrink-0 overflow-hidden hover:opacity-80 transition-opacity"}>
                  {m.author_avatar_url
                    ? <img src={m.author_avatar_url} alt={m.author_name} className="w-full h-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                    : initials(m.author_name)}
                </button>
              )
              : <div className="w-8 shrink-0" />
            }
            <div className="max-w-[72%] min-w-0">
              {!grouped && (
                <div className="flex items-center gap-1.5 mb-1 ml-1 flex-wrap">
                  <button onClick={() => navigate(`/profile/${m.user_id}`)}
                    className="text-xs font-semibold text-foreground hover:underline leading-none">{m.author_name}</button>
                  {m.author_role === "admin" && (
                    <span title="Admin" className="h-3.5 w-3.5 rounded-full bg-blue-500 inline-flex items-center justify-center shrink-0">
                      <Check className="h-2 w-2 text-white stroke-[3]" />
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground leading-none">{fmtTime(m.created_at)}</span>
                  {m.edited && <span className="text-[10px] text-muted-foreground italic">· edited</span>}
                </div>
              )}
              {isEditingThis ? (
                <div className="flex items-center gap-2">
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
                <div className="relative group/bbl">
                  {/* Hover actions — appear to the right of others' bubble; hidden in report mode */}
                  {!reportSelectionMode && (
                    <div className="absolute left-full top-0 pl-1 transition-opacity opacity-0 group-hover/bbl:opacity-100 flex items-center gap-0.5 z-10">
                    {isJoined && (
                      <button onClick={e => { e.stopPropagation(); setReplyTo(m); inputRef.current?.focus(); }}
                        className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground">
                        <CornerUpLeft className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {isJoined && (
                      <button onClick={e => { e.stopPropagation(); setReactionPickerMsgId(reactionPickerMsgId === m.id ? null : m.id); }}
                        className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground">
                        <Smile className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {canMenu && (
                      <button onClick={e => { e.stopPropagation(); setMsgMenuId(menuOpen ? null : m.id); }}
                        className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground">
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </button>
                    )}
                    </div>
                  )}
                  {m.media_type === "image" && m.media_url ? (
                    <ImageMsg
                      url={m.media_url} text={m.text} isMe={false}
                      reply={m.reply_to_id ? { author: m.reply_to_author, text: m.reply_to_text } : null}
                      onLightbox={() => setLightboxUrl(m.media_url!)}
                      renderCaption={t => renderTextWithLinks(t, members.map(mb => mb.name))}
                    />
                  ) : (
                    <div className="rounded-2xl overflow-hidden bg-muted border border-border/50">
                      {m.reply_to_id && (
                        <div onClick={() => { const el = document.getElementById(`msg-${m.reply_to_id}`); el?.scrollIntoView({ behavior: "smooth", block: "center" }); }}
                          className="flex items-start gap-1.5 mx-3 mt-2 mb-1.5 pl-2 border-l-2 border-primary/40 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 rounded-r-lg transition-colors">
                          <div className="min-w-0">
                            {m.reply_to_author && <p className="text-[10px] font-semibold text-primary truncate">{m.reply_to_author}</p>}
                            <p className="text-[11px] text-muted-foreground truncate">{m.reply_to_text ? m.reply_to_text.slice(0, 80) : "📎 Media"}</p>
                          </div>
                        </div>
                      )}
                      {m.media_type === "video" && m.media_url && (
                        <div className="relative inline-block" style={{ maxWidth: "360px", width: "100%" }}>
                          <video src={m.media_url} controls controlsList="nodownload noplaybackrate nopictureinpicture nofullscreen" disablePictureInPicture className="block w-full bg-black" />
                          <button onClick={async e => { e.stopPropagation(); const blob = await fetch(m.media_url!).then(r => r.blob()); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "video.mp4"; a.click(); URL.revokeObjectURL(a.href); }}
                            className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition-colors"
                            title="Save video">
                            <Download className="h-3.5 w-3.5 text-white" />
                          </button>
                        </div>
                      )}
                      {m.text?.trim() && m.media_type !== "file" && (
                        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words px-3 pt-2 pb-2" style={{ maxWidth: "360px" }}>
                          {showSearch && searchQuery.trim().length >= 2
                            ? highlightText(m.text.trim(), searchQuery)
                            : renderTextWithLinks(m.text.trim(), members.map(mb => mb.name))}
                        </p>
                      )}
                      {m.media_type === "file" && m.media_url && (() => {
                        const nl = m.text?.indexOf("\n") ?? -1;
                        const fname = nl >= 0 ? m.text!.slice(0, nl) : (m.text || "File");
                        const desc = nl >= 0 ? m.text!.slice(nl + 1).trim() : null;
                        return (
                          <>
                            <a href={m.media_url} download={fname} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 mx-3 my-2 px-3 py-2 rounded-xl bg-secondary text-sm text-foreground hover:bg-card transition-colors max-w-xs">
                              <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="truncate">{fname}</span>
                            </a>
                            {desc && <p className="text-sm leading-relaxed whitespace-pre-wrap break-words px-3 pb-2 text-muted-foreground">{desc}</p>}
                          </>
                        );
                      })()}
                    </div>
                  )}
                  {!reportSelectionMode && menuOpen && (
                    <div className="absolute left-0 bottom-full mb-1 z-40 bg-card border border-border rounded-xl shadow-xl overflow-hidden min-w-[170px]"
                      onClick={e => e.stopPropagation()}>
                      {canManageMsg && (
                        <button onClick={() => unsendMsg(m.id)}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-destructive hover:bg-destructive/5 transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                          Remove message
                        </button>
                      )}
                    </div>
                  )}
                  {/* Emoji picker — hidden in report mode */}
                  {!reportSelectionMode && reactionPickerMsgId === m.id && (
                    <div className="absolute left-0 bottom-full mb-1 z-50 bg-card border border-border rounded-2xl shadow-xl px-2 py-1.5 flex gap-1"
                      onClick={e => e.stopPropagation()}>
                      {QUICK_EMOJIS.map(e => (
                        <button key={e} onClick={() => handleReaction(m.id, e)}
                          className="text-lg hover:scale-125 transition-transform px-0.5 leading-none">
                          {e}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Reaction pills — hidden in report mode */}
                  {!reportSelectionMode && reactions[m.id] && Object.keys(reactions[m.id]).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {Object.entries(reactions[m.id]).map(([emoji, { count, userIds }]) => (
                        <button key={emoji} onClick={() => handleReaction(m.id, emoji)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors ${
                            userIds.includes(user.id)
                              ? "bg-primary/15 border-primary/40 text-primary"
                              : "bg-muted border-border text-foreground hover:bg-muted/80"
                          }`}>
                          <span>{emoji}</span>
                          <span className="font-medium">{count}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      }
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
            <div className="space-y-2">
              <p className="text-sm font-medium">Visibility</p>
              {([
                { value: false, icon: Globe, label: "Public", desc: "Anyone can find the channel in search and join" },
                { value: true,  icon: Lock,  label: "Private", desc: "Only people with an invite can join" },
              ] as const).map(({ value, icon: Icon, label, desc }) => (
                <button key={label} type="button" onClick={() => setNewPrivate(value)}
                  className={`w-full flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all ${newPrivate === value ? "border-primary bg-primary/5" : "border-border hover:border-foreground/20"}`}>
                  <div className={`mt-0.5 h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0 ${newPrivate === value ? "border-primary" : "border-muted-foreground/40"}`}>
                    {newPrivate === value && <div className="h-2 w-2 rounded-full bg-primary" />}
                  </div>
                  <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${newPrivate === value ? "text-primary" : "text-muted-foreground"}`} />
                  <div>
                    <p className={`text-sm font-medium ${newPrivate === value ? "text-primary" : "text-foreground"}`}>{label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                  </div>
                </button>
              ))}
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
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-foreground">{activeGroup.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {activeGroup.visibility === "private" ? "🔒 Private" : "🌐 Public"} · {activeGroup.member_count} members
                  </p>
                  {editingGroup && (
                    <p className="text-xs text-muted-foreground mt-1">Tap the icon to change it</p>
                  )}
                </div>
                {(isOwner || (isAdmin && (myPermissions?.changeChannelInfo ?? false))) && !editingGroup && (
                  <button
                    onClick={() => { setEditName(activeGroup.name); setEditBio(activeGroup.bio); setEditEmoji(activeGroup.emoji); setEditVisibility(activeGroup.visibility); setEditImageUrl(activeGroup.image_url ?? null); setEditImagePreview(activeGroup.image_url ?? null); setEditingGroup(true); }}
                    className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
                    title="Edit community info"
                  >
                    <Edit3 className="h-4 w-4" />
                  </button>
                )}
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
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Community Name</label>
                    <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-9 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Bio</label>
                    <Textarea value={editBio} onChange={e => setEditBio(e.target.value)} rows={3} className="text-sm" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Visibility</p>
                    {([
                      { value: "public" as const,  icon: Globe, label: "Public",  desc: "Anyone can find the channel in search and join" },
                      { value: "private" as const, icon: Lock,  label: "Private", desc: "Only people with an invite can join" },
                    ]).map(({ value, icon: Icon, label, desc }) => (
                      <button key={value} type="button" onClick={() => setEditVisibility(value)}
                        className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${editVisibility === value ? "border-primary bg-primary/5" : "border-border hover:border-foreground/20"}`}>
                        <div className={`mt-0.5 h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0 ${editVisibility === value ? "border-primary" : "border-muted-foreground/40"}`}>
                          {editVisibility === value && <div className="h-2 w-2 rounded-full bg-primary" />}
                        </div>
                        <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${editVisibility === value ? "text-primary" : "text-muted-foreground"}`} />
                        <div>
                          <p className={`text-sm font-medium ${editVisibility === value ? "text-primary" : "text-foreground"}`}>{label}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1 h-8 text-xs" onClick={saveGroupEdit}>Save changes</Button>
                    <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={() => setEditingGroup(false)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                activeGroup.bio ? (
                  <>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Bio</p>
                    <p className="text-sm text-foreground mb-3">{activeGroup.bio}</p>
                  </>
                ) : null
              )}
            </div>

            {/* Three icon buttons: Members | Add Members | Banned */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-around">
                {/* Members */}
                <button
                  onClick={() => { setSettingsPanel("members"); fetchMembers(activeGroup.id); }}
                  className="flex flex-col items-center gap-1.5 group"
                >
                  <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <span className="text-[11px] font-medium text-muted-foreground group-hover:text-foreground transition-colors">Members</span>
                </button>

                {/* Add Members — admin/owner only */}
                {(isOwner || members.find(m => m.id === user.id)?.role === "admin") && (
                  <button
                    onClick={async () => { setSettingsPanel("add"); if (connections.length === 0) await fetchConnections(); }}
                    className="flex flex-col items-center gap-1.5 group"
                  >
                    <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                      <UserPlus className="h-5 w-5 text-primary" />
                    </div>
                    <span className="text-[11px] font-medium text-muted-foreground group-hover:text-foreground transition-colors">Add</span>
                  </button>
                )}

                {/* Banned Users — owner or admin with banUsers permission */}
                {(isOwner || (isAdmin && (myPermissions?.banUsers ?? true))) && (
                  <button
                    onClick={async () => {
                      setSettingsPanel("banned");
                      if (bannedUsers.length === 0) {
                        setBannedLoading(true);
                        try { setBannedUsers(await apiGetBannedUsers(activeGroup.id)); }
                        catch { toast({ title: "Failed to load banned users", variant: "destructive" }); }
                        finally { setBannedLoading(false); }
                      }
                    }}
                    className="flex flex-col items-center gap-1.5 group"
                  >
                    <div className="h-12 w-12 rounded-2xl bg-destructive/10 flex items-center justify-center group-hover:bg-destructive/20 transition-colors">
                      <ShieldOff className="h-5 w-5 text-destructive" />
                    </div>
                    <span className="text-[11px] font-medium text-muted-foreground group-hover:text-foreground transition-colors">Banned</span>
                  </button>
                )}

                {/* Join Requests — private + admin/owner only */}
                {activeGroup.visibility === "private" && (isOwner || members.find(m => m.id === user.id)?.role === "admin") && (
                  <button
                    onClick={async () => {
                      setSettingsPanel("requests");
                      setPendingRequestCount(0); // mark as seen
                      setJoinRequestsLoading(true);
                      try { setJoinRequests(await apiGetJoinRequests(activeGroup.id)); }
                      catch { toast({ title: "Failed to load requests", variant: "destructive" }); }
                      finally { setJoinRequestsLoading(false); }
                    }}
                    className="flex flex-col items-center gap-1.5 group"
                  >
                    <div className="h-12 w-12 rounded-2xl bg-amber-500/10 flex items-center justify-center group-hover:bg-amber-500/20 transition-colors relative">
                      <Bell className="h-5 w-5 text-amber-500" />
                      {pendingRequestCount > 0 && (
                        <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center">
                          {pendingRequestCount > 9 ? "9+" : pendingRequestCount}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-medium text-muted-foreground group-hover:text-foreground transition-colors">Requests</span>
                  </button>
                )}
              </div>
            </div>

            {/* Share invite link */}
            {(isOwner || members.find(m => m.id === user.id)?.role === "admin") && (
              <Button variant="outline" className="w-full gap-2" onClick={() => setShowShare(true)}>
                <Link2 className="h-4 w-4" /> Share invite link
              </Button>
            )}

            {/* Settings panel modals */}
            {settingsPanel && (
              <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4 pb-4 sm:pb-0" onClick={e => { if (e.target === e.currentTarget) setSettingsPanel(null); }}>
                <div className="w-full max-w-md bg-card rounded-2xl border border-border shadow-xl overflow-hidden max-h-[80vh] flex flex-col">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
                    <p className="font-semibold text-base">
                      {settingsPanel === "members" && `Members (${activeGroup.member_count})`}
                      {settingsPanel === "add" && "Add Members"}
                      {settingsPanel === "banned" && "Banned Users"}
                      {settingsPanel === "requests" && `Join Requests${joinRequests.length > 0 ? ` (${joinRequests.length})` : ""}`}
                    </p>
                    <button onClick={() => setSettingsPanel(null)} className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Members panel */}
                  {settingsPanel === "members" && (
                    <div className="flex flex-col overflow-hidden">
                      <div className="px-4 py-2 border-b border-border shrink-0">
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
                        <div className="overflow-y-auto divide-y divide-border">
                          {members.filter(m => !memberSearch || m.name.toLowerCase().includes(memberSearch.toLowerCase())).map(m => {
                            const isSelf = m.id === user.id;
                            const targetIsAdmin = m.role === "admin" || m.role === "owner";
                            const canRemove = isOwner || (isAdmin && !targetIsAdmin && (myPermissions?.removeUsers ?? true));
                            const canBan    = isOwner || (isAdmin && !targetIsAdmin && (myPermissions?.banUsers ?? true));
                            const canPromote = !isSelf && m.role === "member" && (isOwner || (isAdmin && (myPermissions?.promoteAdmins ?? false)));
                            const canRevoke  = isOwner && !isSelf && m.role === "admin";
                            const canAct = !isSelf && (canRemove || canBan);
                            return (
                              <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                                <button onClick={() => navigate(`/profile/${m.id}`)}
                                  className={`h-9 w-9 rounded-full ${m.color} flex items-center justify-center text-white text-xs font-semibold shrink-0 hover:opacity-80 transition-opacity overflow-hidden`}>
                                  {m.avatarUrl ? <img src={m.avatarUrl} alt={m.name} className="w-full h-full object-cover" /> : initials(m.name)}
                                </button>
                                <div className="flex-1 min-w-0">
                                  <button onClick={() => navigate(`/profile/${m.id}`)}
                                    className="text-sm text-foreground hover:underline text-left truncate block w-full">
                                    {m.name}{isSelf ? " (You)" : ""}
                                  </button>
                                  {m.role === "admin" && m.permissions && (
                                    <p className="text-[10px] text-muted-foreground truncate">
                                      {[
                                        m.permissions.removeUsers && "Remove",
                                        m.permissions.changeChannelInfo && "Edit info",
                                        m.permissions.banUsers && "Ban",
                                        m.permissions.addSubscribers && "Add members",
                                        m.permissions.manageMessages && "Messages",
                                        m.permissions.promoteAdmins && "Promote admins",
                                      ].filter(Boolean).join(" · ")}
                                    </p>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {(m.role === "owner" || m.role === "admin") && <Crown className="h-3.5 w-3.5 text-amber-500" title={m.role === "owner" ? "Owner" : "Admin"} />}
                                  {canPromote && (
                                    <button onClick={() => toggleAdmin(m.id, m.name, m.role)} title="Appoint as admin"
                                      className="h-7 w-7 rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors flex items-center justify-center">
                                      <Crown className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                  {canRevoke && (
                                    <button onClick={() => toggleAdmin(m.id, m.name, m.role)} title="Revoke admin"
                                      className="text-xs px-2 py-0.5 rounded-md border border-amber-200 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950 transition-colors shrink-0">
                                      Revoke
                                    </button>
                                  )}
                                  {canAct && (
                                    <>
                                      {canRemove && (
                                        <button onClick={() => removeMember(m.id, m.name)} title="Remove"
                                          className="h-7 w-7 rounded-lg text-orange-500 border border-orange-200 hover:bg-orange-50 dark:hover:bg-orange-950 transition-colors flex items-center justify-center">
                                          <UserX className="h-3.5 w-3.5" />
                                        </button>
                                      )}
                                      {canBan && (
                                        <button onClick={() => banMember(m.id, m.name)} title="Ban"
                                          className="h-7 w-7 rounded-lg text-destructive border border-destructive/30 hover:bg-destructive/5 transition-colors flex items-center justify-center">
                                          <ShieldOff className="h-3.5 w-3.5" />
                                        </button>
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Add Members panel */}
                  {settingsPanel === "add" && (
                    connectionsLoading ? (
                      <div className="p-6 flex justify-center">
                        <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                      </div>
                    ) : (
                      <div className="flex flex-col overflow-hidden">
                        <div className="px-3 pt-3 pb-2 shrink-0">
                          <input value={addMemberSearch} onChange={e => setAddMemberSearch(e.target.value)}
                            placeholder="Search connections…" className="w-full px-3 py-1.5 text-xs rounded-lg bg-muted outline-none" />
                        </div>
                        <div className="overflow-y-auto divide-y divide-border">
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
                              >Add</button>
                            </div>
                          ))}
                          {connections.filter(c => !members.find(m => m.id === c.id)).length === 0 && (
                            <p className="px-4 py-3 text-xs text-muted-foreground">All your connections are already members.</p>
                          )}
                          {connections.length === 0 && (
                            <p className="px-4 py-3 text-xs text-muted-foreground">No connections to add.</p>
                          )}
                        </div>
                      </div>
                    )
                  )}

                  {/* Banned Users panel */}
                  {settingsPanel === "banned" && (
                    bannedLoading ? (
                      <div className="p-6 flex justify-center">
                        <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                      </div>
                    ) : bannedUsers.length === 0 ? (
                      <p className="px-4 py-4 text-sm text-muted-foreground text-center">No banned users.</p>
                    ) : (
                      <div className="overflow-y-auto divide-y divide-border">
                        {bannedUsers.map(b => (
                          <div key={b.user_id} className="flex items-center gap-3 px-4 py-3">
                            <div className={`h-8 w-8 rounded-full ${b.profiles?.color || "bg-muted"} flex items-center justify-center text-white text-xs font-semibold shrink-0`}>
                              {initials(b.profiles?.name || "?")}
                            </div>
                            <span className="text-sm text-foreground flex-1 min-w-0 truncate">{b.profiles?.name || "Unknown"}</span>
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
                            >Unban</button>
                          </div>
                        ))}
                      </div>
                    )
                  )}
                  {/* Join Requests panel */}
                  {settingsPanel === "requests" && (
                    joinRequestsLoading ? (
                      <div className="p-6 flex justify-center">
                        <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                      </div>
                    ) : joinRequests.length === 0 ? (
                      <p className="px-4 py-4 text-sm text-muted-foreground text-center">No pending requests.</p>
                    ) : (
                      <div className="overflow-y-auto divide-y divide-border">
                        {joinRequests.map(r => {
                          const isProcessing = processingRequestIds.has(r.id);
                          return (
                          <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                            <div className={`h-8 w-8 rounded-full ${r.profile?.color || "bg-muted"} flex items-center justify-center text-white text-xs font-semibold shrink-0 overflow-hidden`}>
                              {r.profile?.avatar_url
                                ? <img src={r.profile.avatar_url} alt={r.profile?.name} className="w-full h-full object-cover" />
                                : initials(r.profile?.name || "?")}
                            </div>
                            <span className="text-sm text-foreground flex-1 min-w-0 truncate">{r.profile?.name || "Unknown"}</span>
                            <div className="flex gap-1.5 shrink-0">
                              <button
                                disabled={isProcessing}
                                onClick={async () => {
                                  if (isProcessing) return;
                                  setProcessingRequestIds(prev => new Set([...prev, r.id]));
                                  // Optimistic remove
                                  setJoinRequests(prev => prev.filter(x => x.id !== r.id));
                                  try {
                                    await apiRespondJoinRequest(activeGroup.id, r.id, "accepted");
                                    fetchMembers(activeGroup.id);
                                    toast({ title: `${r.profile?.name || "User"} approved` });
                                  } catch (err: any) {
                                    setJoinRequests(prev => [...prev, r]); // revert
                                    toast({ title: err?.message || "Failed to accept", variant: "destructive" });
                                  } finally {
                                    setProcessingRequestIds(prev => { const s = new Set(prev); s.delete(r.id); return s; });
                                  }
                                }}
                                className="text-xs px-2.5 py-1 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                              >{isProcessing ? "…" : "Accept"}</button>
                              <button
                                disabled={isProcessing}
                                onClick={async () => {
                                  if (isProcessing) return;
                                  setProcessingRequestIds(prev => new Set([...prev, r.id]));
                                  setJoinRequests(prev => prev.filter(x => x.id !== r.id));
                                  try {
                                    await apiRespondJoinRequest(activeGroup.id, r.id, "rejected");
                                    toast({ title: "Request declined" });
                                  } catch (err: any) {
                                    setJoinRequests(prev => [...prev, r]);
                                    toast({ title: err?.message || "Failed to decline", variant: "destructive" });
                                  } finally {
                                    setProcessingRequestIds(prev => { const s = new Set(prev); s.delete(r.id); return s; });
                                  }
                                }}
                                className="text-xs px-2.5 py-1 rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
                              >{isProcessing ? "…" : "Decline"}</button>
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    )
                  )}
                </div>
              </div>
            )}

            {/* Report community — visible to non-owners only */}
            {!isOwner && (
              <button onClick={() => { setReportReason(""); setShowReportModal(true); }}
                className="w-full h-10 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted transition-colors flex items-center justify-center gap-2">
                <Flag className="h-4 w-4" /> Report community
              </button>
            )}

            {isOwner ? (
              <Button variant="outline" className="w-full gap-2 text-destructive border-destructive/30 hover:bg-destructive/5" onClick={() => setShowDeleteConfirm(true)}>
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
        {promoteModal && (
          <PromoteAdminModal
            memberName={promoteModal.memberName}
            perms={promotePerms}
            onChange={setPromotePerms}
            onConfirm={confirmPromoteAdmin}
            onClose={() => setPromoteModal(null)}
          />
        )}

        {/* Delete community confirm modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
            onClick={e => { if (e.target === e.currentTarget && !deleting) setShowDeleteConfirm(false); }}>
            <div className="w-full max-w-sm bg-card rounded-2xl border border-border shadow-xl overflow-hidden">
              <div className="p-6 text-center">
                <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
                  <Trash2 className="h-5 w-5 text-destructive" />
                </div>
                <p className="font-bold text-foreground text-lg mb-1">Delete community?</p>
                <p className="text-sm text-muted-foreground mb-6">
                  <span className="font-medium text-foreground">"{activeGroup.name}"</span> will be permanently deleted along with all messages and media. This cannot be undone.
                </p>
                <div className="flex gap-3">
                  <button onClick={() => setShowDeleteConfirm(false)} disabled={deleting}
                    className="flex-1 h-10 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50">
                    Cancel
                  </button>
                  <button onClick={deleteGroup} disabled={deleting}
                    className="flex-1 h-10 rounded-xl bg-destructive text-white text-sm font-medium hover:bg-destructive/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                    {deleting ? <><div className="h-3.5 w-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" /> Deleting…</> : "Delete"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Report community modal */}
        {showReportModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4 pb-4 sm:pb-0"
            onClick={e => { if (e.target === e.currentTarget) setShowReportModal(false); }}>
            <div className="w-full max-w-md bg-card rounded-2xl border border-border shadow-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <p className="font-semibold text-base">Report Community</p>
                <button onClick={() => setShowReportModal(false)} className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-5 space-y-2">
                <p className="text-xs text-muted-foreground mb-3">Why are you reporting this community?</p>
                {[
                  "Spam or misleading",
                  "Inappropriate content",
                  "Harassment or bullying",
                  "Hate speech",
                  "Misinformation",
                  "Violates community guidelines",
                  "Other",
                ].map(option => (
                  <button key={option} onClick={() => setReportReason(option)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left text-sm transition-all ${reportReason === option ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-foreground/20 text-foreground"}`}>
                    <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0 ${reportReason === option ? "border-primary" : "border-muted-foreground/40"}`}>
                      {reportReason === option && <div className="h-2 w-2 rounded-full bg-primary" />}
                    </div>
                    {option}
                  </button>
                ))}
              </div>
              <div className="px-5 pb-5">
                <Button
                  className="w-full"
                  disabled={!reportReason || reportSubmitting}
                  onClick={async () => {
                    if (!reportReason || !activeGroup) return;
                    setReportSubmitting(true);
                    try {
                      await createReport({ targetId: activeGroup.id, targetType: "group", reason: reportReason });
                      setShowReportModal(false);
                      toast({ title: "Report submitted", description: "Thank you for helping keep the community safe." });
                    } catch (err: any) {
                      toast({ title: err?.message || "Failed to submit report", variant: "destructive" });
                    } finally {
                      setReportSubmitting(false);
                    }
                  }}
                >
                  {reportSubmitting ? "Submitting…" : "Submit Report"}
                </Button>
              </div>
            </div>
          </div>
        )}
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
        {reactionPickerMsgId !== null && <div className="fixed inset-0 z-40" onClick={() => setReactionPickerMsgId(null)} />}
        {showShare && <ShareLinkModal group={activeGroup} onClose={() => setShowShare(false)} />}

        <div className="flex h-[calc(100vh-4rem)] md:h-screen max-w-3xl mx-auto flex-col relative">
          {/* Header */}
          <div className="px-4 py-3 border-b border-border flex items-center gap-3 shrink-0 bg-card/80 backdrop-blur-sm">
            <button onClick={() => {
              if (reportSelectionMode) {
                setReportSelectionMode(false);
                setReportSelectedMsgIds(new Set());
                setReportType("");
                return;
              }
              viewRef.current = "list"; activeGroupIdRef.current = undefined; setView("list"); setMsgMenuId(null); setEditingMsgId(null);
            }}
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
              <button onClick={() => { setShowSearch(s => !s); setSearchQuery(""); setSearchResults([]); setSearchLoading(false); if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); }}
                className={`h-8 w-8 rounded-full flex items-center justify-center transition-colors ${showSearch ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}>
                <Search className="h-4 w-4" />
              </button>
              {isJoined && !reportSelectionMode && (
                <button onClick={() => { setShowReportTypeSheet(true); setReportType(""); setReportSelectedMsgIds(new Set()); }}
                  className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
                  title="Report">
                  <Flag className="h-4 w-4" />
                </button>
              )}
              {reportSelectionMode && (
                <button onClick={() => { setReportSelectionMode(false); setReportSelectedMsgIds(new Set()); setReportType(""); }}
                  className="h-8 w-8 rounded-full flex items-center justify-center text-destructive hover:bg-destructive/10 transition-colors"
                  title="Cancel">
                  <X className="h-4 w-4" />
                </button>
              )}
              <button onClick={openSettings}
                className="relative h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
                <Settings className="h-4 w-4" />
                {pendingRequestCount > 0 && (isOwner || isAdmin) && (
                  <span className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-red-500" />
                )}
              </button>
            </div>
          </div>

          {/* Report selection mode banner */}
          {reportSelectionMode && (
            <div className="px-4 py-2 border-b border-border bg-primary/5 flex items-center gap-2 shrink-0">
              <Flag className="h-3.5 w-3.5 text-primary shrink-0" />
              <p className="text-xs text-primary font-medium flex-1">
                Reporting: <span className="font-semibold">{reportType}</span> — tap messages to select
              </p>
            </div>
          )}

          {/* Search bar — shown when search mode active */}
          {showSearch && (
            <div className="px-4 py-2 border-b border-border bg-card/80 shrink-0">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <input
                    autoFocus
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (searchMatchIds.length === 0) return;
                        setSearchMatchIndex(i => (i + 1) % searchMatchIds.length);
                      }
                      if (e.key === "Escape") { setShowSearch(false); setSearchQuery(""); }
                    }}
                    placeholder="Search in chat…"
                    className="w-full pl-8 pr-3 py-1.5 text-sm bg-muted rounded-xl outline-none text-foreground placeholder:text-muted-foreground"
                  />
                </div>
                {searchQuery.trim().length >= 2 && (
                  <>
                    <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums min-w-[46px] text-center">
                      {searchMatchIds.length === 0 ? "0 of 0" : `${searchMatchIndex + 1} of ${searchMatchIds.length}`}
                    </span>
                    <button
                      disabled={searchMatchIds.length === 0}
                      onClick={() => setSearchMatchIndex(i => (i - 1 + searchMatchIds.length) % searchMatchIds.length)}
                      className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-30 transition-colors shrink-0">
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      disabled={searchMatchIds.length === 0}
                      onClick={() => setSearchMatchIndex(i => (i + 1) % searchMatchIds.length)}
                      className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-30 transition-colors shrink-0">
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
              {searchQuery.trim().length >= 2 && searchMatchIds.length === 0 && (
                <p className="text-[11px] text-muted-foreground mt-1.5 pl-1">No messages found for "{searchQuery}"</p>
              )}
            </div>
          )}

          {/* Messages area */}
          <div ref={messagesAreaRef} className="flex-1 overflow-y-auto p-4">
            {!isJoined && (
              <div className="text-center py-10">
                <p className="text-sm text-muted-foreground mb-3">
                  {activeGroup.visibility === "private"
                    ? "Request to join this community to participate in conversations."
                    : "Join this community to participate in conversations."}
                </p>
                {activeGroup.visibility === "private" ? (
                  <Button size="sm" onClick={() => toggleJoin(activeGroup.id, false)}>
                    {requestedIds.has(activeGroup.id) ? "Requested" : "Request to Join"}
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => toggleJoin(activeGroup.id, false)}>
                    Join Community
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
                <ChevronsUp className="h-3 w-3" />
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

          {/* Typing indicator — hide during report selection */}
          {!reportSelectionMode && Object.keys(typingUsers).length > 0 && (
            <div className="px-5 py-1 flex items-center gap-1.5">
              <span className="flex gap-0.5 items-end shrink-0">
                <span className="h-1 w-1 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="h-1 w-1 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="h-1 w-1 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "300ms" }} />
              </span>
              <span className="text-xs text-muted-foreground truncate">
                {Object.values(typingUsers).length === 1
                  ? `${Object.values(typingUsers)[0]} is typing…`
                  : `${Object.values(typingUsers).slice(0, 2).join(", ")} are typing…`}
              </span>
            </div>
          )}

          {/* Sticky report action bar — shown in selection mode */}
          {reportSelectionMode && (
            <div className="border-t border-border bg-card shrink-0 px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">
                  Reported messages: <span className={reportSelectedMsgIds.size > 0 ? "text-primary font-semibold" : "text-muted-foreground"}>{reportSelectedMsgIds.size}</span>
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {reportSelectedMsgIds.size === 0 ? "Tap any message to select it" : `Type: ${reportType}`}
                </p>
              </div>
              <button
                disabled={reportSelectedMsgIds.size === 0 || reportFlowSubmitting}
                onClick={async () => {
                  setReportFlowSubmitting(true);
                  try {
                    await Promise.all([...reportSelectedMsgIds].map(id =>
                      createReport({ targetId: id, targetType: "message", reason: reportType })
                    ));
                    setReportSelectionMode(false);
                    setReportSelectedMsgIds(new Set());
                    setReportType("");
                    toast({ title: "Report submitted", description: "Thank you for helping keep the community safe." });
                  } catch (err: any) {
                    toast({ title: err?.message || "Failed to submit", variant: "destructive" });
                  } finally {
                    setReportFlowSubmitting(false);
                  }
                }}
                className="h-10 px-5 rounded-xl bg-destructive text-white text-sm font-semibold disabled:opacity-40 hover:bg-destructive/90 transition-colors flex items-center gap-2 shrink-0"
              >
                {reportFlowSubmitting
                  ? <><div className="h-3.5 w-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />Reporting…</>
                  : <><Flag className="h-3.5 w-3.5" />Report</>}
              </button>
            </div>
          )}

          {/* Input bar — voice removed */}
          {isJoined && !reportSelectionMode && (
            <div className="border-t border-border shrink-0">
              <input ref={imageRef} type="file" accept="image/*" className="hidden" onChange={e => handleFileInput(e, "image")} />
              <input ref={videoRef} type="file" accept="video/*" className="hidden" onChange={e => handleFileInput(e, "video")} />
              <input ref={fileRef} type="file" className="hidden" onChange={e => handleFileInput(e, "file")} />
              {/* Reply preview strip */}
              {replyTo && (
                <div className="flex items-center gap-2 px-4 py-1.5 bg-muted/60 border-b border-border">
                  <CornerUpLeft className="h-3.5 w-3.5 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-primary truncate">{replyTo.author_name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{replyTo.text ? replyTo.text.slice(0, 80) : "📎 Media"}</p>
                  </div>
                  <button onClick={() => setReplyTo(null)} className="h-5 w-5 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
              <div className="p-3">
                <div className="flex items-end gap-2 bg-muted rounded-xl px-3 py-1.5">
                  <div className="flex items-center gap-0.5 shrink-0 pb-0.5">
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
                  <textarea ref={inputRef} value={chatInput} rows={1}
                    onChange={e => {
                      const val = e.target.value;
                      setChatInput(val);
                      // Auto-resize
                      e.target.style.height = "auto";
                      e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
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
                      // Typing indicator — emit start, debounce stop after 3s
                      if (activeGroup && val.length > 0) {
                        startTyping(activeGroup.id);
                        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
                        typingTimerRef.current = setTimeout(() => {
                          stopTyping(activeGroup.id);
                          typingTimerRef.current = null;
                        }, 3000);
                      } else if (activeGroup && val.length === 0) {
                        if (typingTimerRef.current) { clearTimeout(typingTimerRef.current); typingTimerRef.current = null; }
                        stopTyping(activeGroup.id);
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
                      // Shift+Enter inserts newline naturally (default textarea behaviour)
                    }}
                    placeholder="Message here…"
                    className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none py-1 resize-none overflow-hidden leading-relaxed" />
                  <button onClick={() => sendMessage(chatInput)} disabled={!chatInput.trim()}
                    className="h-7 w-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-30 shrink-0 mb-0.5">
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        {promoteModal && (
          <PromoteAdminModal
            memberName={promoteModal.memberName}
            perms={promotePerms}
            onChange={setPromotePerms}
            onConfirm={confirmPromoteAdmin}
            onClose={() => setPromoteModal(null)}
          />
        )}

        {/* Lightbox */}
        {lightboxUrl && (
          <div ref={lightboxRef} className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
            onClick={() => setLightboxUrl(null)}>
            <button onClick={() => setLightboxUrl(null)}
              className="absolute top-4 right-4 h-9 w-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors z-10">
              <X className="h-5 w-5" />
            </button>
            <img src={lightboxUrl} alt="full size" className="max-w-[95vw] max-h-[90vh] object-contain rounded-xl shadow-2xl" onClick={e => e.stopPropagation()} />
            <a href={lightboxUrl} download target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
              className="absolute bottom-4 right-4 h-9 px-3 rounded-full bg-white/10 hover:bg-white/20 flex items-center gap-2 text-white text-xs transition-colors">
              <Download className="h-4 w-4" /> Save
            </a>
          </div>
        )}

        {/* Report type picker sheet — shown before entering selection mode */}
        {showReportTypeSheet && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4 pb-4 sm:pb-0"
            onClick={e => { if (e.target === e.currentTarget) setShowReportTypeSheet(false); }}>
            <div className="w-full max-w-sm bg-card rounded-2xl border border-border shadow-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <div>
                  <p className="font-semibold text-base">Report</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Select a reason to continue</p>
                </div>
                <button onClick={() => setShowReportTypeSheet(false)}
                  className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-4 space-y-2">
                {[
                  "Spam",
                  "Abuse",
                  "Harassment",
                  "Violence",
                  "Sexual content",
                  "Hate speech",
                  "Misinformation",
                  "Other",
                ].map(option => (
                  <button key={option}
                    onClick={() => {
                      setReportType(option);
                      setReportSelectedMsgIds(new Set());
                      setShowReportTypeSheet(false);
                      setReportSelectionMode(true);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-border hover:border-primary hover:bg-primary/5 text-left text-sm font-medium text-foreground transition-all">
                    <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/40 shrink-0" />
                    {option}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Image send modal */}
        {imgModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={e => { if (e.target === e.currentTarget && !imgUploading) setImgModal(null); }}>
            <div className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border">
                <p className="font-semibold text-foreground">Send Image</p>
                <button onClick={() => !imgUploading && setImgModal(null)}
                  className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="relative bg-black/10">
                <img src={imgModal.previewUrl} alt="preview" className="w-full max-h-64 object-contain" />
                {imgUploading && (
                  <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-2">
                    <p className="text-white text-sm font-medium">Uploading… {imgUploadPct}%</p>
                    <div className="w-48 h-1.5 bg-white/20 rounded-full overflow-hidden">
                      <div className="h-full bg-white rounded-full transition-all duration-200" style={{ width: `${imgUploadPct}%` }} />
                    </div>
                  </div>
                )}
              </div>
              <div className="px-4 py-3 space-y-3">
                <textarea value={imgCaption} onChange={e => setImgCaption(e.target.value)}
                  placeholder="Add a caption… (optional)" rows={2} disabled={imgUploading}
                  className="w-full bg-muted rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none" />
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Quality</p>
                  <div className="grid grid-cols-3 gap-2">
                    {([["480p", "480p", "Smaller"], ["720p", "720p", "Balanced"], ["hd", "HD", "Original"]] as [ImgQuality, string, string][]).map(([val, label, sub]) => (
                      <button key={val} onClick={() => setImgQuality(val)} disabled={imgUploading}
                        className={`flex flex-col items-center py-2 rounded-xl border text-xs transition-all ${imgQuality === val ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-foreground/30"}`}>
                        <span className="font-semibold">{label}</span>
                        <span className="text-[10px] opacity-70 mt-0.5">{sub}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={sendImageMsg} disabled={imgUploading}
                  className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2">
                  {imgUploading
                    ? <><div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Uploading…</>
                    : <><Send className="h-4 w-4" /> Send</>}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Video send modal */}
        {vidModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={e => { if (e.target === e.currentTarget && !vidUploading) setVidModal(null); }}>
            <div className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border">
                <p className="font-semibold text-foreground">Send Video</p>
                <button onClick={() => !vidUploading && setVidModal(null)}
                  className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="relative bg-black">
                <video src={vidModal.previewUrl} className="w-full max-h-48 object-contain" controls />
                {vidUploading && (
                  <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2">
                    <p className="text-white text-sm font-medium">Uploading… {vidUploadPct}%</p>
                    <div className="w-48 h-1.5 bg-white/20 rounded-full overflow-hidden">
                      <div className="h-full bg-white rounded-full transition-all duration-200" style={{ width: `${vidUploadPct}%` }} />
                    </div>
                  </div>
                )}
              </div>
              <div className="px-4 py-3 space-y-3">
                <textarea value={vidCaption} onChange={e => setVidCaption(e.target.value)}
                  placeholder="Add a caption… (optional)" rows={2} disabled={vidUploading}
                  className="w-full bg-muted rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none" />
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Quality</p>
                  <div className="grid grid-cols-3 gap-2">
                    {([["low", "Low", "Smaller"], ["medium", "Medium", "Balanced"], ["original", "Original", "Full size"]] as [VidQuality, string, string][]).map(([val, label, sub]) => (
                      <button key={val} onClick={() => setVidQuality(val)} disabled={vidUploading}
                        className={`flex flex-col items-center py-2 rounded-xl border text-xs transition-all ${vidQuality === val ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-foreground/30"}`}>
                        <span className="font-semibold">{label}</span>
                        <span className="text-[10px] opacity-70 mt-0.5">{sub}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={sendVideoMsg} disabled={vidUploading}
                  className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2">
                  {vidUploading
                    ? <><div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Uploading…</>
                    : <><Send className="h-4 w-4" /> Send</>}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* File send modal */}
        {fileModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={e => { if (e.target === e.currentTarget && !fileUploading) setFileModal(null); }}>
            <div className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border">
                <p className="font-semibold text-foreground">Send File</p>
                <button onClick={() => !fileUploading && setFileModal(null)}
                  className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="px-4 py-4 space-y-3">
                {/* File info row */}
                <div className="flex items-center gap-3 p-3 bg-muted rounded-xl">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Paperclip className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{fileModal.file.name}</p>
                    <p className="text-xs text-muted-foreground">{(fileModal.file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                </div>
                {/* Upload progress */}
                {fileUploading && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Uploading…</span>
                      <span>{fileUploadPct}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all duration-200" style={{ width: `${fileUploadPct}%` }} />
                    </div>
                  </div>
                )}
                <textarea value={fileCaption} onChange={e => setFileCaption(e.target.value)}
                  placeholder={`Add a description… (optional)`} rows={2} disabled={fileUploading}
                  className="w-full bg-muted rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none" />
                <div className="flex gap-2">
                  <button onClick={() => setFileModal(null)} disabled={fileUploading}
                    className="flex-1 h-10 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50">
                    Cancel
                  </button>
                  <button onClick={sendFileMsg} disabled={fileUploading}
                    className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2">
                    {fileUploading
                      ? <><div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Uploading…</>
                      : <><Send className="h-4 w-4" /> Send</>}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </Layout>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VIEW: Groups List
  // ══════════════════════════════════════════════════════════════════════════

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

        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search communities..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 h-11" />
          </div>
          {/* Sort dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowSortMenu(v => !v)}
              className={`h-11 px-3 rounded-xl border flex items-center gap-1.5 text-sm font-medium transition-colors ${
                showSortMenu ? "border-primary text-primary bg-primary/5" : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
              }`}>
              <SlidersHorizontal className="h-4 w-4" />
              <span className="hidden sm:inline">{sort === "popular" ? "Popular" : sort === "newest" ? "Newest" : "Active"}</span>
            </button>
            {showSortMenu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowSortMenu(false)} />
                <div className="absolute right-0 top-12 z-40 bg-card border border-border rounded-xl shadow-xl overflow-hidden w-36 animate-in fade-in zoom-in-95 duration-100">
                  {(["popular", "newest", "active"] as const).map(s => (
                    <button key={s} onClick={() => { setSort(s); setShowSortMenu(false); }}
                      className={`w-full px-4 py-2.5 text-sm text-left flex items-center justify-between transition-colors hover:bg-muted ${sort === s ? "text-primary font-medium" : "text-foreground"}`}>
                      {s === "popular" ? "Popular" : s === "newest" ? "Newest" : "Active"}
                      {sort === s && <Check className="h-3.5 w-3.5" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
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
              Joined ({joinedCount})
              {totalUnread > 0 && (
                <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {totalUnread > 99 ? "99+" : totalUnread}
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
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <p className="font-semibold text-foreground leading-snug truncate">{g.name}</p>
                      {activeGroupIds.has(g.id) && (
                        <span className="shrink-0 text-[9px] font-semibold tracking-wide text-emerald-600 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-400 px-1.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 flex-1">{g.bio || g.description}</p>
                    <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Users className="h-3 w-3" />{g.member_count.toLocaleString()}</span>
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5">{g.topic}</Badge>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); (joined || isMine) ? openGroup(g) : toggleJoin(g.id, false, e); }}
                        className={`h-7 px-3 rounded-lg text-xs font-medium transition-colors ${
                          joined || isMine ? "bg-muted text-foreground hover:bg-secondary"
                            : "bg-primary text-primary-foreground hover:opacity-90"
                        }`}>
                        {joined || isMine ? "Joined"
                          : requested ? "Requested"
                          : g.visibility === "private" ? "Request"
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