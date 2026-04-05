import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { validate } from "../middleware/validate";
import { createReport, createReportSchema } from "../controllers/reportsController";

const router = Router();
router.use(requireAuth as any);

router.post("/", validate(createReportSchema), createReport as any);

export default router;
