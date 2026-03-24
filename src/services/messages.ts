import { supabase } from "../lib/supabase";

export async function sendMessage(content: string, chatId: string) {
  if (!content.trim()) return;

  const { data, error } = await supabase
    .from("messages")
    .insert([{ content, chat_id: chatId }])
    .select()
    .single();

  if (error) throw error;
  return data;
}
