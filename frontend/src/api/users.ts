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
