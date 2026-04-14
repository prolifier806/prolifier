import { Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase";
import { AuthRequest } from "../lib/types";

export const submitFeedbackSchema = z.object({
  category: z.string().min(1).max(50),
  rating: z.number().int().min(1).max(5),
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(2000),
});

export async function submitFeedback(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user.id;
  const body = req.body as z.infer<typeof submitFeedbackSchema>;

  const { data, error } = await supabaseAdmin
    .from("feedback")
    .insert({
      user_id: userId,
      category: body.category,
      rating: body.rating,
      title: body.title,
      message: body.message,
    })
    .select("id")
    .single();

  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  res.status(201).json({ success: true, data });
}

export async function getAllFeedback(req: AuthRequest, res: Response): Promise<void> {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const PAGE = 50;
  const from = (page - 1) * PAGE;

  const { data, error, count } = await supabaseAdmin
    .from("feedback")
    .select("id, category, rating, title, message, created_at, user_id, profiles:user_id(name, avatar_url, color)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + PAGE - 1);

  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  res.json({ success: true, data, total: count ?? 0 });
}

export async function getMyFeedback(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user.id;

  const { data, error } = await supabaseAdmin
    .from("feedback")
    .select("id, category, rating, title, message, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  res.json({ success: true, data });
}
