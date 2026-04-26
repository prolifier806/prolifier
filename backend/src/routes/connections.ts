import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { validate } from "../middleware/validate";
import {
  getConnections, getPendingRequests, sendRequest, acceptRequest,
  declineRequest, removeConnection, markRequestsRead, sendRequestSchema,
  getUserConnections,
} from "../controllers/connectionsController";

const router = Router();
router.use(requireAuth as any);

router.get("/", getConnections as any);
router.get("/requests", getPendingRequests as any);
router.get("/user/:userId", getUserConnections as any);
router.post("/", validate(sendRequestSchema), sendRequest as any);
router.patch("/:requesterId/accept", acceptRequest as any);
router.delete("/:requesterId/decline", declineRequest as any);
router.delete("/:otherId", removeConnection as any);
router.patch("/requests/read", markRequestsRead as any);

export default router;
