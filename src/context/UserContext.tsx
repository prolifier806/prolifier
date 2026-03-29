import { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { traceQuery, logger } from "@/lib/logger";

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
  updatedAt: string; // ISO — used to prevent stale DB sync from overwriting fresh local edits
  deletedAt: string | null; // ISO — set when account is soft-deleted; null = active
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

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<CurrentUser>(DEFAULT_USER);
  const [session, setSession] = useState<Session | null>(null);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  // Version counter prevents stale background fetches from overwriting newer data
  const syncVersionRef = useRef(0);

  // Fetches profile from DB and updates state + cache silently.
  // Never touches the loading flag — callers decide that.
  const syncProfile = async (userId: string, email: string, metadata?: Record<string, any>) => {
    const thisVersion = ++syncVersionRef.current;
    try {
      const { data: _row, error: _rowError } = await traceQuery(
        "profile.sync",
        () => (supabase as any).from("profiles").select("*").eq("id", userId).single(),
        { userId },
      );
      const row = _row as any;
      const rowError = _rowError as any;

      // Discard result if a newer sync has started (prevents flicker from stale fetches)
      if (thisVersion !== syncVersionRef.current) return;

      // Unexpected DB error (not "row not found") — keep current state, don't sign out
      if (rowError && rowError.code !== "PGRST116") return;

      // Account was permanently deleted by the server (pg_cron tombstone)
      if (row?.permanently_deleted) {
        localStorage.removeItem(cacheKey(userId));
        localStorage.setItem("prolifier_perm_deleted", "true");
        await supabase.auth.signOut();
        return;
      }

      // Lazy permanent deletion — triggers when the grace period has expired
      if (row?.deleted_at) {
        const elapsed = Date.now() - new Date(row.deleted_at).getTime();
        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        if (elapsed > sevenDays) {
          // ── Clean up storage before deleting rows ──────────────────────
          // Extract storage path from a Supabase public URL
          const storagePath = (url: string, bucket: string) => {
            try {
              const m = url.match(new RegExp(`/storage/v1/object/public/${bucket}/(.+?)(?:\\?|$)`));
              return m ? m[1] : null;
            } catch { return null; }
          };

          // Delete post & collab media files
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

          // Delete avatar (list the folder to catch any file extension)
          const { data: avatarFiles } = await (supabase as any).storage
            .from("avatars").list(userId);
          if (avatarFiles?.length > 0) {
            await (supabase as any).storage.from("avatars")
              .remove(avatarFiles.map((f: any) => `${userId}/${f.name}`));
          }
          // ───────────────────────────────────────────────────────────────

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
        // Profile row not found — determine why before acting
        const cached = readCache(userId);
        if (cached?.deletedAt) {
          // Soft-deleted account: row may be hidden by RLS — preserve current state
          // so ProtectedRoute keeps the user on /recover.
          return;
        }
        if (cached?.profileSetupDone) {
          // Profile was hard-deleted while user was authenticated → sign out immediately
          localStorage.removeItem(cacheKey(userId));
          await supabase.auth.signOut();
          return;
        }
        // Brand new user — use Google/OAuth metadata if available; leave name blank for email signups
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

      // If deleted_at is set, let the user stay authenticated so ProtectedRoute
      // can redirect them to /recover. Only permanently_deleted forces a sign-out.
      setUser(prev => {
        // If the user saved locally more recently than what the DB returned,
        // keep the local state — don't let a stale DB row overwrite fresh edits.
        // This is what causes the "bio blink" on rapid refresh.
        if (prev.updatedAt && next.updatedAt && prev.updatedAt > next.updatedAt) {
          return prev;
        }
        writeCache(next);
        return next;
      });
    } catch {
      // Network error — keep whatever is already in state/cache.
    }
  };

  useEffect(() => {
    // ── Seed from stored session first ───────────────────────────────────────
    // getSession() transparently refreshes an expired access token before
    // returning, so we never get a null-session flash during token refresh.
    // This prevents users being briefly redirected to the intro page on
    // tab focus or app resume when the access token has just expired.
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      const userId   = s?.user?.id;
      const email    = s?.user?.email ?? "";
      const metadata = s?.user?.user_metadata as Record<string, any> | undefined;

      setSession(s ?? null);
      setAuthUser(s?.user ?? null);

      if (!userId) { setLoading(false); return; }

      const cached = readCache(userId);
      if (cached) {
        setUser(cached);
        setLoading(false);
        syncProfile(userId, email, metadata);
      } else {
        syncProfile(userId, email, metadata).finally(() => setLoading(false));
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        // INITIAL_SESSION is already handled by getSession() above — skip it
        // to prevent the null-session flash that can occur during token refresh.
        if (event === "INITIAL_SESSION") return;

        setSession(newSession);
        setAuthUser(newSession?.user ?? null);

        // ── Signed out ─────────────────────────────────────────────────────
        if (!newSession?.user) {
          setUser(DEFAULT_USER);
          setLoading(false);
          return;
        }

        // ── Token refreshed (tab switch, auto-refresh) ─────────────────────
        if (event === "TOKEN_REFRESHED") {
          setLoading(false);
          return;
        }

        // ── Password recovery OTP verified ─────────────────────────────────
        if (event === "PASSWORD_RECOVERY") {
          setLoading(false);
          return;
        }

        // ── Initial session load or fresh sign-in ──────────────────────────
        const userId   = newSession.user.id;
        const email    = newSession.user.email ?? "";
        const metadata = newSession.user.user_metadata as Record<string, any> | undefined;

        // USER_UPDATED fires after profile/password edits — skip resetting to
        // potentially-stale cache (which causes visible data flash).
        if (event === "USER_UPDATED") {
          syncProfile(userId, email, metadata);
          setLoading(false);
          return;
        }

        // ── SIGNED_IN ──────────────────────────────────────────────────────
        const cached = readCache(userId);
        if (cached) {
          // Apply cache instantly → no spinner, routing works immediately.
          setUser(cached);
          setLoading(false);
          // Sync DB in background — updates state/cache silently if anything changed.
          syncProfile(userId, email, metadata);
        } else {
          // First ever login — no cache yet, must wait for DB before routing.
          setLoading(true);
          await syncProfile(userId, email, metadata);
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // Watch own profile row for deletion/soft-deletion via Realtime.
  // One persistent websocket event replaces a periodic HTTP poll — zero
  // extra PostgREST connections at any user count.
  useEffect(() => {
    if (!authUser?.id) return;
    const id = authUser.id;

    const handleProfileUpdate = (payload: any) => {
      const row = payload.new as any;
      if (!row) return;
      if (row.permanently_deleted) {
        localStorage.removeItem(cacheKey(id));
        localStorage.setItem("prolifier_perm_deleted", "true");
        supabase.auth.signOut();
      } else if (row.deleted_at) {
        setUser(prev => {
          const next = { ...prev, deletedAt: row.deleted_at };
          localStorage.removeItem(cacheKey(id));
          return next;
        });
      } else {
        // Account recovered — clear deleted state
        setUser(prev => {
          if (!prev.deletedAt) return prev;
          const next = { ...prev, deletedAt: null };
          writeCache(next);
          return next;
        });
      }
    };

    const channel = supabase
      .channel(`profile-deletion-${id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${id}`,
        },
        handleProfileUpdate,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [authUser?.id]);

  const updateUser = async (patch: Partial<CurrentUser>) => {
    if (!authUser) return;
    const now = new Date().toISOString();
    // Stamp updatedAt now so syncProfile won't overwrite with a stale DB row
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
    logger.info("auth.sign_out", { userId: authUser?.id });
    await supabase.auth.signOut();
    setUser(DEFAULT_USER);
    setSession(null);
    setAuthUser(null);
  };

  return (
    <UserContext.Provider value={{
      user,
      session,
      authUser,
      loading,
      profileComplete: user.profileSetupDone,
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
