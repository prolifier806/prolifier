import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { requireAdmin } from "../middleware/requireAdmin";
import { validate } from "../middleware/validate";
import {
  updateUserStatus, deleteContent, getReports, resolveReport,
  getModerationFlags, resolveModerationFlag,
  updateUserStatusSchema, resolveReportSchema,
  getUsers, getStats, getPosts, getActivity,
  getNotices, createNotice, updateNotice, deleteNotice,
  createNoticeSchema, updateNoticeSchema,
} from "../controllers/adminController";
import { getAllFeedback } from "../controllers/feedbackController";

const router = Router();

// All admin routes require auth + admin/moderator role
router.use(requireAuth as any);
router.use(requireAdmin as any);

// ── Existing ──────────────────────────────────────────────────────────────────
router.get("/reports",                           getReports as any);
router.patch("/reports/:id/resolve",             validate(resolveReportSchema), resolveReport as any);
router.patch("/users/:id/status",                validate(updateUserStatusSchema), updateUserStatus as any);
router.delete("/content/:type/:id",              deleteContent as any);
router.get("/moderation-flags",                  getModerationFlags as any);
router.patch("/moderation-flags/:id/resolve",    resolveModerationFlag as any);

// ── New ───────────────────────────────────────────────────────────────────────
router.get("/users",                             getUsers as any);
router.get("/stats",                             getStats as any);
router.get("/posts",                             getPosts as any);
router.get("/activity",                          getActivity as any);
router.get("/notices",                           getNotices as any);
router.post("/notices",                          validate(createNoticeSchema), createNotice as any);
router.patch("/notices/:id",                     validate(updateNoticeSchema), updateNotice as any);
router.delete("/notices/:id",                    deleteNotice as any);
router.get("/feedback",                          getAllFeedback as any);

export default router;
