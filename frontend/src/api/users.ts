/**
 * Users / Profiles API
 * Replaces direct supabase.from("profiles"/"blocks") calls
 */
import { apiGet, apiPost, apiPatch, apiDelete } from "./client";

export const discoverProfiles = (params?: { cursor?: string; skills?: string; location?: string }) => {
  const qs = new URLSearchParams(params as any).toString();
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

export const deleteMyAccount = () => apiDelete("/api/users/me");
export const blockUser       = (blockedId: string) => apiPost("/api/users/me/block", { blockedId });
export const unblockUser     = (id: string) => apiDelete(`/api/users/me/block/${id}`);
