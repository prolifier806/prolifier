import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { validate } from "../middleware/validate";
import { sendMessage, getMessages, hideConversation, sendMessageSchema, toggleDmReaction, getDmReactions } from "../controllers/messagesController";
import { supabaseAdmin } from "../lib/supabase";

const router = Router();
router.use(requireAuth as any);

router.post("/", validate(sendMessageSchema), sendMessage as any);
router.get("/reactions", getDmReactions as any);
router.get("/:chatId", getMessages as any);
router.post("/:chatId/hide", hideConversation as any);
router.post("/:messageId/reactions", toggleDmReaction as any);

// Mark a single message as read (only if receiver matches)
router.post("/:id/read", (async (req: any, res: any) => {
  await supabaseAdmin
    .from("messages")
    .update({ read: true })
    .eq("id", req.params.id)
    .eq("receiver_id", req.user.id);
  res.json({ success: true, data: null });
}) as any);

export default router;
