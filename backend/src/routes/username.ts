import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { checkUsername, setUsername } from "../controllers/usernameController";

const router = Router();

// Public — no auth needed so onboarding can check before profile is complete
router.get("/check", checkUsername as any);

// Authenticated — set/change username
router.post("/set", requireAuth as any, setUsername as any);

export default router;
