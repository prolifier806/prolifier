import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { validate } from "../middleware/validate";
import {
  createGroup, updateGroup, deleteGroup,
  joinGroup, leaveGroup, removeMember, updateMemberRole,
  sendGroupMessage, deleteGroupMessage,
  createGroupSchema, updateGroupSchema, sendGroupMessageSchema,
} from "../controllers/groupsController";

const router = Router();
router.use(requireAuth as any);

router.post("/", validate(createGroupSchema), createGroup as any);
router.patch("/:id", validate(updateGroupSchema), updateGroup as any);
router.delete("/:id", deleteGroup as any);
router.post("/:id/join", joinGroup as any);
router.delete("/:id/leave", leaveGroup as any);
router.delete("/:id/members/:memberId", removeMember as any);
router.patch("/:id/members/:memberId/role", updateMemberRole as any);
router.post("/:id/messages", validate(sendGroupMessageSchema), sendGroupMessage as any);
router.delete("/:id/messages/:messageId", deleteGroupMessage as any);

export default router;
