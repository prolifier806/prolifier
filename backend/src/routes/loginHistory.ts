import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { trackLogin, getDevices, getLoginHistory, signOutOthers } from "../controllers/loginHistoryController";

const router = Router();

router.post(  "/track",            requireAuth, trackLogin);
router.get(   "/devices",          requireAuth, getDevices);
router.get(   "/history",          requireAuth, getLoginHistory);
router.post(  "/sign-out-others",  requireAuth, signOutOthers);

export default router;
