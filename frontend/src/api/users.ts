/**
 * Users / Profiles API
 * Replaces direct supabase.from("profiles"/"blocks") calls
 */
import { apiGet, apiPost, apiPatch, apiDelete } from "./client";

export const discoverProfiles = (params?: { cursor?: string; skills?: string; rankSkills?: string; location?: string; search?: string; collabOnly?: string }) => {
  // Filter out undefined/empty values so URLSearchParams doesn't send empty keys
  const clean = Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v !== undefined && v !== ""));
  const qs = new URLSearchParams(clean as any).toString();
  return apiGet<any[]>(`/api/users/discover${qs ? `?${qs}` : ""}`);
};

export const getProfile   = (id: string) => apiGet<any>(`/api/users/${id}`);
export const getMyProfile = ()            => apiGet<any>("/api/users/me");

export const updateMyProfile = (body: {
  name?: string;
  bio?: string;
  location?: string;
  project?: string;
  skills?: string[];
  open_to_collab?: boolean;
  role?: string;
  avatar?: string;
  color?: string;
}) => apiPatch<any>("/api/users/me", body);

export const deleteMyAccount  = () => apiDelete("/api/users/me");
export const recoverMyAccount = () => apiPost("/api/users/me/recover", {});
export const purgeCheckAccount = () => apiPost("/api/users/me/purge-check", {});
export const blockUser        = (blockedId: string) => apiPost("/api/users/me/block", { blockedId });
export const unblockUser      = (id: string) => apiDelete(`/api/users/me/block/${id}`);

/** Check if a username is available. No auth required. */
export const checkUsername = (username: string) =>
  apiGet<{ available: boolean }>(`/api/username/check?username=${encodeURIComponent(username)}`);

/** Claim / change the authenticated user's username. */
export const setUsername = (username: string) =>
  apiPost<{ id: string; username: string }>("/api/username/set", { username });

/** Search users by username or name (for @mention autocomplete & global search). */
export const searchUsers = (q: string) =>
  apiGet<Array<{ id: string; name: string; username: string | null; avatar: string; color: string; avatar_url: string | null; role: string }>>(
    `/api/users/search?q=${encodeURIComponent(q)}`
  );
