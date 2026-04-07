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
