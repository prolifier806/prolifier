import { Request } from "express";

export interface AuthUser {
  id: string;
  email: string;
  role?: string;
}

/** Express request with authenticated user attached by requireAuth middleware */
export interface AuthRequest extends Request {
  user: AuthUser;
}

export type ApiResponse<T = null> =
  | { success: true; data: T }
  | { success: false; error: string };
