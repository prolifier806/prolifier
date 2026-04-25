import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { trackLogin, getDevices, getLoginHistory } from "../controllers/loginHistoryController";

const router = Router();

router.post(  "/track",   requireAuth, trackLogin);
router.get(   "/devices", requireAuth, getDevices);
router.get(   "/history", requireAuth, getLoginHistory);

export default router;
