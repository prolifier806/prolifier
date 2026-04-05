import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { validate } from "../middleware/validate";
import { submitFeedback, getMyFeedback, submitFeedbackSchema } from "../controllers/feedbackController";

const router = Router();
router.use(requireAuth as any);

router.get("/", getMyFeedback as any);
router.post("/", validate(submitFeedbackSchema), submitFeedback as any);

export default router;
