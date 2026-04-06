import { apiPost, apiPatch, apiDelete } from "./client";

export const createGroup = (body: { name: string; description?: string; bio?: string; is_private?: boolean; emoji?: string; topic?: string }) =>
  apiPost<any>("/api/groups", body);

export const updateGroup = (id: string, body: { description?: string; bio?: string }) =>
  apiPatch<any>(`/api/groups/${id}`, body);

export const deleteGroup = (id: string) => apiDelete(`/api/groups/${id}`);

export const joinGroup  = (id: string) => apiPost(`/api/groups/${id}/join`);
export const leaveGroup = (id: string) => apiDelete(`/api/groups/${id}/leave`);

export const removeMember     = (groupId: string, memberId: string) =>
  apiDelete(`/api/groups/${groupId}/members/${memberId}`);

export const updateMemberRole = (groupId: string, memberId: string, role: string) =>
  apiPatch(`/api/groups/${groupId}/members/${memberId}/role`, { role });

export const sendGroupMessage = (groupId: string, body: {
  text: string;
  media_url?: string | null;
  media_type?: string;
  reply_to_id?: string | null;
}) => apiPost<any>(`/api/groups/${groupId}/messages`, body);

export const deleteGroupMessage = (groupId: string, messageId: string) =>
  apiDelete(`/api/groups/${groupId}/messages/${messageId}`);
