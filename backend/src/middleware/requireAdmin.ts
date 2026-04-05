import { Response, NextFunction } from "express";
import { AuthRequest } from "../lib/types";

const ADMIN_ROLES = ["admin", "moderator"];

/**
 * Must be used AFTER requireAuth.
 * Rejects requests from users whose profile role is not admin/moderator.
 */
export function requireAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user || !ADMIN_ROLES.includes(req.user.role ?? "")) {
    res.status(403).json({ success: false, error: "Forbidden: admin access required" });
    return;
  }
  next();
}
