import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { validate } from "../middleware/validate";
import {
  getFeed, getDiscover,
  createPost, updatePost, deletePost,
  likePost, unlikePost, savePost, unsavePost,
  getComments, addComment, deleteComment,
  createCollab, updateCollab, deleteCollab,
  expressInterest, removeInterest, saveCollab, unsaveCollab,
  createPostSchema, updatePostSchema, createCollabSchema, updateCollabSchema, createCommentSchema,
} from "../controllers/postsController";

const router = Router();

// All routes require auth
router.use(requireAuth as any);

// Feed
router.get("/", getFeed as any);
router.get("/discover", getDiscover as any);

// Posts
router.post("/posts", validate(createPostSchema), createPost as any);
router.patch("/posts/:id", validate(updatePostSchema), updatePost as any);
router.delete("/posts/:id", deletePost as any);

// Likes
router.post("/posts/:id/like", likePost as any);
router.delete("/posts/:id/like", unlikePost as any);

// Saves
router.post("/posts/:id/save", savePost as any);
router.delete("/posts/:id/save", unsavePost as any);

// Comments
router.get("/posts/:id/comments", getComments as any);
router.post("/posts/:id/comments", validate(createCommentSchema), addComment as any);
router.delete("/posts/:id/comments/:commentId", deleteComment as any);

// Collabs
router.post("/collabs", validate(createCollabSchema), createCollab as any);
router.patch("/collabs/:id", validate(updateCollabSchema), updateCollab as any);
router.delete("/collabs/:id", deleteCollab as any);

// Collab interactions
router.post("/collabs/:id/interest", expressInterest as any);
router.delete("/collabs/:id/interest", removeInterest as any);
router.post("/collabs/:id/save", saveCollab as any);
router.delete("/collabs/:id/save", unsaveCollab as any);

export default router;
