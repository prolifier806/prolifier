import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { validate } from "../middleware/validate";
import {
  createGroup, updateGroup, deleteGroup,
  joinGroup, leaveGroup, removeMember, banMember,
  getBannedUsers, unbanMember, assignRole,
  sendGroupMessage, deleteGroupMessage,
  requestToJoin, getJoinRequests, respondJoinRequest,
  addMember,
  createGroupSchema, updateGroupSchema, sendGroupMessageSchema,
  assignRoleSchema, respondJoinRequestSchema, addMemberSchema,
} from "../controllers/groupsController";

const router = Router();
router.use(requireAuth as any);

router.post("/", validate(createGroupSchema), createGroup as any);
router.patch("/:id", validate(updateGroupSchema), updateGroup as any);
router.delete("/:id", deleteGroup as any);

router.post("/:id/join", joinGroup as any);
router.delete("/:id/leave", leaveGroup as any);

// Join requests (private communities)
router.post("/:id/join-request", requestToJoin as any);
router.get("/:id/join-requests", getJoinRequests as any);
router.put("/:id/join-requests/:requestId", validate(respondJoinRequestSchema), respondJoinRequest as any);

// Member management
router.post("/:id/members", validate(addMemberSchema), addMember as any);
router.delete("/:id/members/:memberId", removeMember as any);
router.post("/:id/members/:memberId/ban", banMember as any);
router.put("/:id/members/:memberId/role", validate(assignRoleSchema), assignRole as any);

router.get("/:id/bans", getBannedUsers as any);
router.delete("/:id/bans/:userId", unbanMember as any);

router.post("/:id/messages", validate(sendGroupMessageSchema), sendGroupMessage as any);
router.delete("/:id/messages/:messageId", deleteGroupMessage as any);

export default router;
