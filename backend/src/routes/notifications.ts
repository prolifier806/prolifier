import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { validate } from "../middleware/validate";
import {
  getNotifications, createNotification, markRead,
  deleteNotification, clearAllNotifications, createNotificationSchema,
} from "../controllers/notificationsController";

const router = Router();
router.use(requireAuth as any);

router.get("/", getNotifications as any);
router.post("/", validate(createNotificationSchema), createNotification as any);
router.patch("/:id/read", markRead as any);
router.delete("/", clearAllNotifications as any);
router.delete("/:id", deleteNotification as any);

export default router;
