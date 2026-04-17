import type { PresenceUser } from "./socketEvents";

/**
 * In-memory presence store.
 *
 * Structure:
 *   groupId → Map<userId, PresenceUser>
 *
 * When Redis adapter is added, swap this with a Redis hash:
 *   HSET presence:{groupId} {userId} {json}
 *   HDEL presence:{groupId} {userId}
 *   HGETALL presence:{groupId}
 *
 * The interface stays identical — only this file changes.
 */

const store = new Map<string, Map<string, PresenceUser>>();

export function userJoined(groupId: string, user: PresenceUser): void {
  if (!store.has(groupId)) store.set(groupId, new Map());
  store.get(groupId)!.set(user.userId, user);
}

export function userLeft(groupId: string, userId: string): void {
  store.get(groupId)?.delete(userId);
  if (store.get(groupId)?.size === 0) store.delete(groupId);
}

export function getGroupPresence(groupId: string): PresenceUser[] {
  return Array.from(store.get(groupId)?.values() ?? []);
}

/** Called on socket disconnect — remove user from ALL groups they were in */
export function userDisconnected(userId: string): string[] {
  const affected: string[] = [];
  for (const [groupId, users] of store) {
    if (users.has(userId)) {
      users.delete(userId);
      affected.push(groupId);
      if (users.size === 0) store.delete(groupId);
    }
  }
  return affected;
}
