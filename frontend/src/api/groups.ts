import { apiPost, apiPatch, apiDelete, apiGet, apiPut } from "./client";

export const createGroup = (body: { name: string; description?: string; bio?: string; is_private?: boolean; emoji?: string; topic?: string; image_url?: string | null }) =>
  apiPost<any>("/api/groups", body);

export const updateGroup = (id: string, body: { description?: string; bio?: string; visibility?: "public" | "private"; emoji?: string; topic?: string; image_url?: string | null }) =>
  apiPatch<any>(`/api/groups/${id}`, body);

export const deleteGroup = (id: string) => apiDelete(`/api/groups/${id}`);

export const joinGroup  = (id: string) => apiPost(`/api/groups/${id}/join`);
export const leaveGroup = (id: string) => apiDelete(`/api/groups/${id}/leave`);

// Join requests (private communities)
export const requestToJoin = (id: string) =>
  apiPost<{ status: string }>(`/api/groups/${id}/join-request`);

export const getJoinRequests = (id: string) =>
  apiGet<any[]>(`/api/groups/${id}/join-requests`);

export const respondJoinRequest = (id: string, requestId: string, status: "accepted" | "rejected") =>
  apiPut(`/api/groups/${id}/join-requests/${requestId}`, { status });

// Member management
export const addMemberToGroup = (groupId: string, userId: string) =>
  apiPost(`/api/groups/${groupId}/members`, { userId });

export const removeMember = (groupId: string, memberId: string) =>
  apiDelete(`/api/groups/${groupId}/members/${memberId}`);

export const banMember = (groupId: string, memberId: string) =>
  apiPost(`/api/groups/${groupId}/members/${memberId}/ban`);

export const assignRole = (groupId: string, memberId: string, role: "admin" | "member") =>
  apiPut(`/api/groups/${groupId}/members/${memberId}/role`, { role });

export const sendGroupMessage = (groupId: string, body: {
  text: string;
  media_url?: string | null;
  media_type?: string;
  reply_to_id?: string | null;
}) => apiPost<any>(`/api/groups/${groupId}/messages`, body);

export const deleteGroupMessage = (groupId: string, messageId: string) =>
  apiDelete(`/api/groups/${groupId}/messages/${messageId}`);

export const getBannedUsers = (groupId: string) =>
  apiGet<any[]>(`/api/groups/${groupId}/bans`);

export const unbanUser = (groupId: string, userId: string) =>
  apiDelete(`/api/groups/${groupId}/bans/${userId}`);
