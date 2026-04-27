import { Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase";
import { AuthRequest } from "../lib/types";
import { checkContent, recordModerationFlag } from "../services/moderation";

export const sendMessageSchema = z.object({
  text: z.string().max(5000).optional().default(""),
  chatId: z.string(),
  mediaType: z.enum(["text", "image", "video", "audio", "file", "shared_post"]).optional(),
  mediaUrl: z.string().url().optional(),
  replyToId: z.string().uuid().optional().nullable(),
});

function extractOtherId(userId: string, chatId: string): string | null {
  const UUID_LEN = 36;
  const otherId = chatId.slice(0, UUID_LEN) === userId
    ? chatId.slice(UUID_LEN + 1)
    : chatId.slice(0, UUID_LEN);
  return otherId?.length === UUID_LEN ? otherId : null;
}

export async function sendMessage(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user.id;
  const body = req.body as z.infer<typeof sendMessageSchema>;

  // Moderate text content
  let msgMod = { allowed: true, severity: undefined as string | undefined, category: undefined as string | undefined, matched: undefined as string | undefined };
  if (body.mediaType === "text" || !body.mediaType) {
    const mod = checkContent(body.text);
    if (!mod.allowed) {
      res.status(422).json({ success: false, error: "Message violates community guidelines" });
      return;
    }
    msgMod = mod as typeof msgMod;
  }

  const receiverId = extractOtherId(userId, body.chatId);
  if (!receiverId) {
    res.status(400).json({ success: false, error: "Invalid chatId" });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("messages")
    .insert({
      sender_id: userId,
      receiver_id: receiverId,
      text: body.text || null,
      media_type: body.mediaType ?? "text",
      media_url: body.mediaUrl ?? null,
    })
    .select()
    .single();

  if (error) { res.status(500).json({ success: false, error: error.message }); return; }

  if (msgMod.severity === "flag" && data) {
    recordModerationFlag({
      userId, contentType: "message", contentId: data.id,
      text: body.text, category: msgMod.category!, matched: msgMod.matched,
    });
  }

  res.status(201).json({ success: true, data });
}

export async function getMessages(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user.id;
  const { chatId } = req.params;
  const cursor = req.query.cursor as string | undefined;

  const otherId = extractOtherId(userId, chatId);
  if (!otherId) {
    res.status(400).json({ success: false, error: "Invalid chatId" });
    return;
  }

  let query = supabaseAdmin
    .from("messages")
    .select("*")
    .or(
      `and(sender_id.eq.${userId},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${userId})`
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (cursor) query = query.lt("created_at", cursor);

  const { data, error } = await query;
  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  res.json({ success: true, data });
}

/** POST /api/messages/:messageId/reactions — toggle a reaction on a DM */
export async function toggleDmReaction(req: AuthRequest, res: Response): Promise<void> {
  const { messageId } = req.params;
  const userId = req.user.id;
  const { emoji } = req.body as { emoji: string };

  if (!emoji || emoji.length > 8) {
    res.status(400).json({ success: false, error: "Invalid emoji" });
    return;
  }

  // Verify user is party to this message
  const { data: msg } = await supabaseAdmin
    .from("messages")
    .select("sender_id, receiver_id")
    .eq("id", messageId)
    .single();

  if (!msg || (msg.sender_id !== userId && msg.receiver_id !== userId)) {
    res.status(403).json({ success: false, error: "Not authorized" });
    return;
  }

  const { data: existing } = await supabaseAdmin
    .from("dm_message_reactions")
    .select("id")
    .eq("message_id", messageId)
    .eq("user_id", userId)
    .eq("emoji", emoji)
    .maybeSingle();

  const action: "added" | "removed" = existing ? "removed" : "added";

  if (existing) {
    await supabaseAdmin.from("dm_message_reactions").delete().eq("id", existing.id);
  } else {
    const { error } = await supabaseAdmin
      .from("dm_message_reactions")
      .insert({ message_id: messageId, user_id: userId, emoji });
    if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  }

  res.json({ success: true, data: { action } });
}

/** GET /api/messages/reactions?messageIds=id1,id2 — fetch reactions for multiple DMs */
export async function getDmReactions(req: AuthRequest, res: Response): Promise<void> {
  const ids = ((req.query.messageIds as string) ?? "").split(",").filter(Boolean).slice(0, 100);
  if (ids.length === 0) { res.json({ success: true, data: {} }); return; }

  const { data, error } = await supabaseAdmin
    .from("dm_message_reactions")
    .select("message_id, user_id, emoji")
    .in("message_id", ids);

  if (error) { res.status(500).json({ success: false, error: error.message }); return; }

  const result: Record<string, Record<string, { count: number; userIds: string[] }>> = {};
  for (const row of (data ?? [])) {
    if (!result[row.message_id]) result[row.message_id] = {};
    if (!result[row.message_id][row.emoji]) result[row.message_id][row.emoji] = { count: 0, userIds: [] };
    result[row.message_id][row.emoji].count++;
    result[row.message_id][row.emoji].userIds.push(row.user_id);
  }

  res.json({ success: true, data: result });
}

export async function editDmMessage(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user.id;
  const { messageId } = req.params;
  const { text } = req.body as { text: string };

  if (!text?.trim()) {
    res.status(400).json({ success: false, error: "Text is required" });
    return;
  }
  if (text.trim().length > 1500) {
    res.status(400).json({ success: false, error: "Message too long" });
    return;
  }

  const { data: msg } = await supabaseAdmin
    .from("messages")
    .select("sender_id, unsent")
    .eq("id", messageId)
    .single();

  if (!msg) { res.status(404).json({ success: false, error: "Message not found" }); return; }
  if (msg.sender_id !== userId) { res.status(403).json({ success: false, error: "Not authorized" }); return; }
  if (msg.unsent) { res.status(400).json({ success: false, error: "Cannot edit unsent message" }); return; }

  const { error } = await supabaseAdmin
    .from("messages")
    .update({ text: text.trim(), edited: true })
    .eq("id", messageId);

  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  res.json({ success: true, data: null });
}

export async function unsendDmMessage(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user.id;
  const { messageId } = req.params;

  const { data: msg } = await supabaseAdmin
    .from("messages")
    .select("sender_id")
    .eq("id", messageId)
    .single();

  if (!msg) { res.status(404).json({ success: false, error: "Message not found" }); return; }
  if (msg.sender_id !== userId) { res.status(403).json({ success: false, error: "Not authorized" }); return; }

  const { error } = await supabaseAdmin
    .from("messages")
    .update({ unsent: true, text: null, media_url: null, media_type: null })
    .eq("id", messageId);

  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  res.json({ success: true, data: null });
}

export async function hideConversation(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user.id;
  const { chatId } = req.params;

  const otherId = extractOtherId(userId, chatId);
  if (!otherId) {
    res.status(400).json({ success: false, error: "Invalid chatId" });
    return;
  }

  const { error } = await supabaseAdmin
    .from("hidden_conversations")
    .insert({ user_id: userId, other_id: otherId });

  if (error?.code === "23505") { res.json({ success: true, data: null }); return; }
  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  res.json({ success: true, data: null });
}
