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
  github: string;
  website: string;
  twitter: string;
  primaryLang: string;
  openToCollab: boolean;
  profileSetupDone: boolean;
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
  github: "",
  website: "",
  twitter: "",
  primaryLang: "en",
  openToCollab: true,
  profileSetupDone: false,
};

interface UserContextValue {
  user: CurrentUser;
  session: Session | null;
  authUser: User | null;
  loading: boolean;
  profileComplete: boolean;
  updateUser: (patch: Partial<CurrentUser>) => Promise<void>;
  completeProfileSetup: () => Promise<void>;
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
    github: row.github || "",
    website: row.website || "",
    twitter: row.twitter || "",
    primaryLang: row.primary_lang || "en",
    openToCollab: row.open_to_collab ?? true,
    profileSetupDone: row.profile_complete ?? false,
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
  const syncProfile = async (userId: string, email: string) => {
    const thisVersion = ++syncVersionRef.current;
    try {
      const { data: row } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single() as any;

      // Discard result if a newer sync has started (prevents flicker from stale fetches)
      if (thisVersion !== syncVersionRef.current) return;

      const next = row
        ? profileFromRow(userId, email, row)
        : {
            ...DEFAULT_USER,
            id: userId,
            email,
            name: email.split("@")[0],
            avatar: email.slice(0, 2).toUpperCase(),
            color: randomColor(),
            profileSetupDone: false,
          };

      setUser(next);
      writeCache(next);
    } catch {
      // Network error — keep whatever is already in state/cache.
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        setSession(newSession);
        setAuthUser(newSession?.user ?? null);

        // ── Signed out ───────────────────────────────────────────────────────
        if (!newSession?.user) {
          setUser(DEFAULT_USER);
          setLoading(false);
          return;
        }

        // ── Token refreshed (tab switch, auto-refresh) ───────────────────────
        // The session is already valid and the profile hasn't changed.
        // Skip DB fetch entirely — just clear loading if it somehow got stuck.
        if (event === "TOKEN_REFRESHED") {
          setLoading(false);
          return;
        }

        // ── Password recovery OTP verified ───────────────────────────────────
        // ForgotPassword handles its own flow; nothing to do here.
        if (event === "PASSWORD_RECOVERY") {
          setLoading(false);
          return;
        }

        // ── Initial session load or fresh sign-in ────────────────────────────
        const userId = newSession.user.id;
        const email  = newSession.user.email ?? "";

        // USER_UPDATED fires after profile/password edits — skip resetting to
        // potentially-stale cache (which causes visible data flash).
        if (event === "USER_UPDATED") {
          syncProfile(userId, email);
          setLoading(false);
          return;
        }

        const cached = readCache(userId);

        if (cached) {
          // Apply cache instantly → no spinner, routing works immediately.
          setUser(cached);
          setLoading(false);
          // Sync DB in background — updates state/cache silently if anything changed.
          syncProfile(userId, email);
        } else {
          // First ever login — no cache yet, must wait for DB before routing.
          setLoading(true);
          await syncProfile(userId, email);
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const updateUser = async (patch: Partial<CurrentUser>) => {
    if (!authUser) return;
    const next = { ...user, ...patch };
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
      github: next.github,
      website: next.website,
      twitter: next.twitter,
      primary_lang: next.primaryLang,
      open_to_collab: next.openToCollab,
      updated_at: new Date().toISOString(),
    };
    // Only include avatar_url if the column has been added to the DB
    if (next.avatarUrl) profileData.avatar_url = next.avatarUrl;
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

  const signOut = async () => {
    if (authUser) localStorage.removeItem(cacheKey(authUser.id));
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
      signOut,
    }}>
      {children}
    </UserContext.Provider>
  );
}

export const useUser = () => useContext(UserContext);
