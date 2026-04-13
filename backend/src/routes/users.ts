import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { validate } from "../middleware/validate";
import {
  getProfile, getMyProfile, updateMyProfile, discoverProfiles,
  blockUser, unblockUser, deleteMyAccount, recoverAccount, purgeExpiredAccount,
  updateProfileSchema, blockUserSchema,
} from "../controllers/usersController";
import { supabaseAdmin } from "../lib/supabase";

const router = Router();
router.use(requireAuth as any);

router.get("/discover", discoverProfiles as any);
router.get("/me", getMyProfile as any);
router.patch("/me", validate(updateProfileSchema), updateMyProfile as any);
router.delete("/me", deleteMyAccount as any);
router.post("/me/recover", recoverAccount as any);
router.post("/me/purge-check", purgeExpiredAccount as any);
router.post("/me/block", validate(blockUserSchema), blockUser as any);
router.delete("/me/block/:id", unblockUser as any);

// Mute / unmute a user in DMs (stored in mutes table)
router.post("/me/mute/:id", (async (req: any, res: any) => {
  const { error } = await supabaseAdmin
    .from("mutes")
    .insert({ muter_id: req.user.id, muted_id: req.params.id });
  if (error && error.code !== "23505") {
    res.status(500).json({ success: false, error: error.message }); return;
  }
  res.json({ success: true, data: null });
}) as any);

router.post("/me/mute/:id/remove", (async (req: any, res: any) => {
  await supabaseAdmin
    .from("mutes")
    .delete()
    .eq("muter_id", req.user.id)
    .eq("muted_id", req.params.id);
  res.json({ success: true, data: null });
}) as any);

router.get("/:id", getProfile as any);

export default router;
