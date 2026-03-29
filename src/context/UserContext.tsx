// src/context/UserContext.tsx
// KEY CHANGES FROM ORIGINAL:
// 1. Added isCacheFresh() — skips DB sync when localStorage cache < 5 min old
// 2. Exported blockedIds into context so Discover/Feed don't re-fetch blocks
// 3. Added CACHE_STALE_MS constant for easy tuning

import { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  avatar: string;
  avatarUrl: string;
  color: string;
  location: string;
  bio: string;
  project: string;
  skills: string[];
  lookingFor: string[];
  roles: string[];
  github: string;
  website: string;
  twitter: string;
  primaryLang: string;
  openToCollab: boolean;
  profileSetupDone: boolean;
  updatedAt: string;
  deletedAt: string | null;
};

const DEFAULT_USER: CurrentUser = {
  id: "",
  email: "",
  name: "",
  avatar: "",
  avatarUrl: "",
  color: "bg-primary",
  location: "",
  bio: "",
  project: "",
  skills: [],
  lookingFor: [],
  roles: [],
  github: "",
  website: "",
  twitter: "",
  primaryLang: "en",
  openToCollab: true,
  profileSetupDone: false,
  updatedAt: "",
  deletedAt: null,
};

interface UserContextValue {
  user: CurrentUser;
  session: Session | null;
  authUser: User | null;
  loading: boolean;
  profileComplete: boolean;
  // NEW: shared block set — avoids re-fetching blocks on every page
  blockedIds: Set<string>;
  updateUser: (patch: Partial<CurrentUser>) => Promise<void>;
  completeProfileSetup: () => Promise<void>;
  recoverAccount: () => Promise<void>;
  signOut: () => Promise<void>;
}

const UserContext = createContext<UserContextValue>({
  user: DEFAULT_USER,
  session: null,
  authUser: null,
  loading: true,
  profileComplete: false,
  blockedIds: new Set(),
  updateUser: async () => {},
  completeProfileSetup: async () => {},
  recoverAccount: async () => {},
  signOut: async () => {},
});

const COLORS = [
  "bg-primary", "bg-accent", "bg-emerald-600", "bg-violet-600",
  "bg-sky-500", "bg-rose-500", "bg-amber-500", "bg-teal-600",
];

function randomColor() {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

const cacheKey = (id: string) => `prolifier_profile_${id}`;

// How long a cached profile is considered fresh (no DB re-fetch needed)
// 5 minutes = tab switches, token refreshes don't re-hit the DB
const CACHE_STALE_MS = 5 * 60 * 1000;

function readCache(id: string): CurrentUser | null {
  try {
    const raw = localStorage.getItem(cacheKey(id));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(profile: CurrentUser) {
  try {
    localStorage.setItem(cacheKey(profile.id), JSON.stringify(profile));
  } catch { /* storage full — non-fatal */ }
}

/**
 * Returns true if the cached profile was updated within CACHE_STALE_MS.
 * When fresh, we skip the DB syncProfile call entirely.
 */
function isCacheFresh(cached: CurrentUser): boolean {
  if (!cached.updatedAt) return false;
  return Date.now() - new Date(cached.updatedAt).getTime() < CACHE_STALE_MS;
}

function profileFromRow(userId: string, email: string, row: any): CurrentUser {
  return {
    id: userId,
    email,
    name: row.name || "",
    avatar: row.avatar || "",
    avatarUrl: row.avatar_url || "",
    color: row.color || "bg-primary",
    location: row.location || "",
    bio: row.bio || "",
    project: row.project || "",
    skills: row.skills || [],
    lookingFor: row.looking_for || [],
    roles: row.roles || [],
    github: row.github || "",
    website: row.website || "",
    twitter: row.twitter || "",
    primaryLang: row.primary_lang || "en",
    openToCollab: row.open_to_collab ?? true,
    profileSetupDone: row.profile_complete ?? false,
    updatedAt: row.updated_at || "",
    deletedAt: row.deleted_at || null,
  };
}

/** Load blocked IDs from localStorage (sync, no DB call) */
function loadBlockedIdsFromStorage(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(`prolifier_blocked_${userId}`);
    const arr: { id: string }[] = JSON.parse(raw || "[]");
    return new Set(arr.map((b) => b.id));
  } catch {
    return new Set();
  }
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser]         = useState<CurrentUser>(DEFAULT_USER);
  const [session, setSession]   = useState<Session | null>(null);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [loading, setLoading]   = useState(true);
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
  const syncVersionRef = useRef(0);

  const syncProfile = async (userId: string, email: string, metadata?: Record<string, any>) => {
    const thisVersion = ++syncVersionRef.current;
    try {
      const { data: row, error: rowError } = await (supabase as any)
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (thisVersion !== syncVersionRef.current) return;
      if (rowError && rowError.code !== "PGRST116") return;

      if (row?.permanently_deleted) {
        localStorage.removeItem(cacheKey(userId));
        localStorage.setItem("prolifier_perm_deleted", "true");
        await supabase.auth.signOut();
        return;
      }

      if (row?.deleted_at) {
        const elapsed = Date.now() - new Date(row.deleted_at).getTime();
        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        if (elapsed > sevenDays) {
          const storagePath = (url: string, bucket: string) => {
            try {
              const m = url.match(new RegExp(`/storage/v1/object/public/${bucket}/(.+?)(?:\\?|$)`));
              return m ? m[1] : null;
            } catch { return null; }
          };
          const [{ data: userPosts }, { data: userCollabs }] = await Promise.all([
            (supabase as any).from("posts").select("image_url,video_url").eq("user_id", userId),
            (supabase as any).from("collabs").select("image_url,video_url").eq("user_id", userId),
          ]);
          const mediaPaths = [...(userPosts ?? []), ...(userCollabs ?? [])]
            .flatMap((r: any) => [r.image_url, r.video_url])
            .filter(Boolean)
            .map((url: string) => storagePath(url, "posts"))
            .filter(Boolean) as string[];
          if (mediaPaths.length > 0) {
            await (supabase as any).storage.from("posts").remove(mediaPaths);
          }
          const { data: avatarFiles } = await (supabase as any).storage.from("avatars").list(userId);
          if (avatarFiles?.length > 0) {
            await (supabase as any).storage.from("avatars")
              .remove(avatarFiles.map((f: any) => `${userId}/${f.name}`));
          }
          await Promise.all([
            (supabase as any).from("post_likes").delete().eq("user_id", userId),
            (supabase as any).from("comments").delete().eq("user_id", userId),
            (supabase as any).from("connections").delete().eq("requester_id", userId),
            (supabase as any).from("connections").delete().eq("receiver_id", userId),
            (supabase as any).from("notifications").delete().eq("user_id", userId),
            (supabase as any).from("messages").delete().eq("sender_id", userId),
            (supabase as any).from("messages").delete().eq("receiver_id", userId),
          ]);
          await (supabase as any).from("posts").delete().eq("user_id", userId);
          await (supabase as any).from("collabs").delete().eq("user_id", userId);
          await (supabase as any).from("profiles").delete().eq("id", userId);
          localStorage.removeItem(cacheKey(userId));
          await supabase.auth.signOut();
          return;
        }
      }

      if (!row) {
        const cached = readCache(userId);
        if (cached?.deletedAt) return;
        if (cached?.profileSetupDone) {
          localStorage.removeItem(cacheKey(userId));
          await supabase.auth.signOut();
          return;
        }
        const displayName = metadata?.full_name || metadata?.name || "";
        const googleAvatar = metadata?.avatar_url || metadata?.picture || "";
        const initials = displayName.trim().split(" ").filter(Boolean).map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
        setUser({
          ...DEFAULT_USER,
          id: userId,
          email,
          name: displayName,
          avatar: initials,
          avatarUrl: googleAvatar,
          color: randomColor(),
          profileSetupDone: false,
        });
        return;
      }

      const next = profileFromRow(userId, email, row);
      setUser(prev => {
        if (prev.updatedAt && next.updatedAt && prev.updatedAt > next.updatedAt) return prev;
        writeCache(next);
        return next;
      });
    } catch {
      // Network error — keep current state
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      const userId   = s?.user?.id;
      const email    = s?.user?.email ?? "";
      const metadata = s?.user?.user_metadata as Record<string, any> | undefined;

      setSession(s ?? null);
      setAuthUser(s?.user ?? null);

      if (!userId) { setLoading(false); return; }

      // Load blocked IDs from storage (sync — no DB call)
      setBlockedIds(loadBlockedIdsFromStorage(userId));

      const cached = readCache(userId);
      if (cached) {
        setUser(cached);
        setLoading(false);
        // CHANGED: only sync if cache is stale — saves 1 DB call per tab switch
        if (!isCacheFresh(cached)) {
          syncProfile(userId, email, metadata);
        }
      } else {
        syncProfile(userId, email, metadata).finally(() => setLoading(false));
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (event === "INITIAL_SESSION") return;

        setSession(newSession);
        setAuthUser(newSession?.user ?? null);

        if (!newSession?.user) {
          setUser(DEFAULT_USER);
          setBlockedIds(new Set());
          setLoading(false);
          return;
        }

        // TOKEN_REFRESHED and PASSWORD_RECOVERY don't need a profile re-fetch
        if (event === "TOKEN_REFRESHED" || event === "PASSWORD_RECOVERY") {
          setLoading(false);
          return;
        }

        const userId   = newSession.user.id;
        const email    = newSession.user.email ?? "";
        const metadata = newSession.user.user_metadata as Record<string, any> | undefined;

        if (event === "USER_UPDATED") {
          syncProfile(userId, email, metadata);
          setLoading(false);
          return;
        }

        // SIGNED_IN: use cache if fresh, otherwise sync
        const cached = readCache(userId);
        setBlockedIds(loadBlockedIdsFromStorage(userId));

        if (cached) {
          setUser(cached);
          setLoading(false);
          // CHANGED: skip DB fetch if cache is < 5 minutes old
          if (!isCacheFresh(cached)) {
            syncProfile(userId, email, metadata);
          }
        } else {
          setLoading(true);
          await syncProfile(userId, email, metadata);
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // Poll for deletion every 5 minutes + on visibility change
  useEffect(() => {
    if (!authUser?.id) return;
    const id = authUser.id;

    const checkDeletion = async () => {
      const { data } = await (supabase as any)
        .from("profiles")
        .select("deleted_at, permanently_deleted")
        .eq("id", id)
        .maybeSingle();
      if (!data || data.permanently_deleted) {
        localStorage.removeItem(cacheKey(id));
        await supabase.auth.signOut();
      } else if (data.deleted_at) {
        setUser(prev => {
          const next = { ...prev, deletedAt: data.deleted_at };
          localStorage.removeItem(cacheKey(id));
          return next;
        });
      }
    };

    const onVisible = () => { if (document.visibilityState === "visible") checkDeletion(); };
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(checkDeletion, 5 * 60_000);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, [authUser?.id]);

  const updateUser = async (patch: Partial<CurrentUser>) => {
    if (!authUser) return;
    const now = new Date().toISOString();
    const next = { ...user, ...patch, updatedAt: now };
    setUser(next);
    writeCache(next);
    const profileData: Record<string, any> = {
      id: authUser.id,
      name: next.name,
      avatar: next.avatar,
      color: next.color,
      location: next.location,
      bio: next.bio,
      project: next.project,
      skills: next.skills,
      looking_for: next.lookingFor,
      roles: next.roles,
      github: next.github,
      website: next.website,
      twitter: next.twitter,
      primary_lang: next.primaryLang,
      open_to_collab: next.openToCollab,
      updated_at: now,
    };
    profileData.avatar_url = next.avatarUrl || null;
    await (supabase.from("profiles") as any).upsert(profileData);
  };

  const completeProfileSetup = async () => {
    if (!authUser) return;
    await (supabase.from("profiles") as any)
      .update({ profile_complete: true, updated_at: new Date().toISOString() })
      .eq("id", authUser.id);
    setUser(prev => {
      const next = { ...prev, profileSetupDone: true };
      writeCache(next);
      return next;
    });
  };

  const recoverAccount = async () => {
    if (!authUser) return;
    await (supabase.from("profiles") as any)
      .update({ deleted_at: null })
      .eq("id", authUser.id);
    setUser(prev => {
      const next = { ...prev, deletedAt: null };
      writeCache(next);
      return next;
    });
  };

  const signOut = async () => {
    if (authUser) localStorage.removeItem(cacheKey(authUser.id));
    await supabase.auth.signOut();
    setUser(DEFAULT_USER);
    setSession(null);
    setAuthUser(null);
    setBlockedIds(new Set());
  };

  return (
    <UserContext.Provider value={{
      user,
      session,
      authUser,
      loading,
      profileComplete: user.profileSetupDone,
      blockedIds,
      updateUser,
      completeProfileSetup,
      recoverAccount,
      signOut,
    }}>
      {children}
    </UserContext.Provider>
  );
}

export const useUser = () => useContext(UserContext);
