import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { requireAdmin } from "../middleware/requireAdmin";
import { validate } from "../middleware/validate";
import {
  updateUserStatus, deleteContent, getReports, resolveReport,
  updateUserStatusSchema, resolveReportSchema,
} from "../controllers/adminController";

const router = Router();

// All admin routes require auth + admin role
router.use(requireAuth as any);
router.use(requireAdmin as any);

router.get("/reports", getReports as any);
router.patch("/reports/:id/resolve", validate(resolveReportSchema), resolveReport as any);
router.patch("/users/:id/status", validate(updateUserStatusSchema), updateUserStatus as any);
router.delete("/content/:type/:id", deleteContent as any);

export default router;
