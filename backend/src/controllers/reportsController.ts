import { Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase";
import { AuthRequest } from "../lib/types";

export const createReportSchema = z.object({
  targetId: z.string().uuid(),
  targetType: z.enum(["post", "collab", "comment", "user", "group"]),
  reason: z.string().min(1).max(200),
  details: z.string().max(1000).optional(),
});

export async function createReport(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user.id;
  const body = req.body as z.infer<typeof createReportSchema>;

  if (body.targetType === "user" && body.targetId === userId) {
    res.status(400).json({ success: false, error: "Cannot report yourself" });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("reports")
    .insert({
      reporter_id: userId,
      target_id: body.targetId,
      target_type: body.targetType,
      reason: body.reason,
      details: body.details ?? null,
      status: "pending",
    })
    .select("id")
    .single();

  if (error?.code === "23505") {
    res.status(409).json({ success: false, error: "You have already reported this" });
    return;
  }
  if (error) { res.status(500).json({ success: false, error: error.message }); return; }

  res.status(201).json({ success: true, data });
}
