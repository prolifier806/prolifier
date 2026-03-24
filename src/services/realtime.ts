import { supabase } from "../lib/supabase";

export function subscribeToMessages(chatId: string, callback: any) {
  return supabase
    .channel("messages")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages", filter: `chat_id=eq.${chatId}` },
      callback
    )
    .subscribe();
}
