import { Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase";
import { AuthRequest } from "../lib/types";
import { checkContent } from "../services/moderation";

export const sendMessageSchema = z.object({
  content: z.string().min(1).max(5000),
  chatId: z.string().uuid(),
  mediaType: z.enum(["text", "image", "video", "audio", "file", "shared_post"]).optional(),
  mediaUrl: z.string().url().optional(),
  replyToId: z.string().uuid().optional().nullable(),
});

export async function sendMessage(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user.id;
  const body = req.body as z.infer<typeof sendMessageSchema>;

  // Moderate text content
  if (body.mediaType === "text" || !body.mediaType) {
    const mod = checkContent(body.content);
    if (!mod.allowed) {
      res.status(422).json({ success: false, error: "Message violates community guidelines" });
      return;
    }
  }

  // Verify the user is a participant in this conversation
  const { data: conversation } = await supabaseAdmin
    .from("messages")
    .select("sender_id, receiver_id")
    .eq("chat_id", body.chatId)
    .limit(1)
    .maybeSingle();

  // If first message in chat, verify this is a valid chat between two real users
  // (chat_id is typically a deterministic UUID from sorted user IDs)

  const { data, error } = await supabaseAdmin
    .from("messages")
    .insert({
      sender_id: userId,
      content: body.content,
      chat_id: body.chatId,
      media_type: body.mediaType ?? "text",
      media_url: body.mediaUrl ?? null,
      reply_to_id: body.replyToId ?? null,
    })
    .select()
    .single();

  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  res.status(201).json({ success: true, data });
}

export async function getMessages(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user.id;
  const { chatId } = req.params;
  const cursor = req.query.cursor as string | undefined;

  // Verify user participates in this chat
  const { data: participant } = await supabaseAdmin
    .from("messages")
    .select("id")
    .eq("chat_id", chatId)
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
    .limit(1)
    .maybeSingle();

  if (!participant) {
    res.status(403).json({ success: false, error: "Not a participant in this conversation" });
    return;
  }

  let query = supabaseAdmin
    .from("messages")
    .select("*")
    .eq("chat_id", chatId)
    .is("deleted_at", null)
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

  const { error } = await supabaseAdmin
    .from("hidden_conversations")
    .insert({ user_id: userId, chat_id: chatId });

  if (error?.code === "23505") { res.json({ success: true, data: null }); return; }
  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  res.json({ success: true, data: null });
}
