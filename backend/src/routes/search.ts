import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { searchGroupMessages, searchDmMessages } from "../controllers/searchController";

const router = Router();
router.use(requireAuth as any);

router.get("/groups/:groupId", searchGroupMessages as any);
router.get("/dms/:peerId", searchDmMessages as any);

export default router;
