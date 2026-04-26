/**
 * Connections API
 * Replaces direct supabase.from("connections") calls in Discover.tsx
 */
import { apiGet, apiPost, apiPatch, apiDelete } from "./client";

export const getConnections    = () => apiGet<any[]>("/api/connections");
export const getPendingRequests = () => apiGet<any[]>("/api/connections/requests");
export const sendRequest       = (receiverId: string) => apiPost("/api/connections", { receiverId });
export const acceptRequest     = (requesterId: string) => apiPatch(`/api/connections/${requesterId}/accept`, {});
export const declineRequest    = (requesterId: string) => apiDelete(`/api/connections/${requesterId}/decline`);
export const removeConnection  = (otherId: string) => apiDelete(`/api/connections/${otherId}`);
export const markRequestsRead     = () => apiPatch("/api/connections/requests/read", {});
export const getUserConnections   = (userId: string) => apiGet<{ data: any[]; count: number }>(`/api/connections/user/${userId}`);
