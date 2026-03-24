import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/context/UserContext";

interface BadgeContextValue {
  unreadMessages: number;
  unreadNotifications: number;
  clearMessages: () => void;
  clearNotifications: () => void;
}

const BadgeContext = createContext<BadgeContextValue>({
  unreadMessages: 0,
  unreadNotifications: 0,
  clearMessages: () => {},
  clearNotifications: () => {},
});

export function BadgeProvider({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  // Initial fetch of counts on mount / user change
  useEffect(() => {
    if (!user.id) return;

    async function fetchCounts() {
      const [{ count: msgCount }, { count: notifCount }] = await Promise.all([
        (supabase as any)
          .from("messages")
          .select("*", { count: "exact", head: true })
          .eq("receiver_id", user.id)
          .eq("read", false),
        (supabase as any)
          .from("notifications")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("read", false),
      ]);
      setUnreadMessages(msgCount ?? 0);
      setUnreadNotifications(notifCount ?? 0);
    }

    fetchCounts();

    // Realtime: new incoming message → bump message badge
    const msgChannel = supabase
      .channel(`badge-messages-${user.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `receiver_id=eq.${user.id}`,
      }, () => {
        setUnreadMessages(n => n + 1);
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "messages",
        filter: `receiver_id=eq.${user.id}`,
      }, (payload: any) => {
        // When messages get marked read (read: true), recalculate
        if (payload.new.read === true && payload.old.read === false) {
          setUnreadMessages(n => Math.max(0, n - 1));
        }
      })
      .subscribe();

    // Realtime: new notification → bump notification badge
    const notifChannel = supabase
      .channel(`badge-notifs-${user.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${user.id}`,
      }, () => {
        setUnreadNotifications(n => n + 1);
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${user.id}`,
      }, (payload: any) => {
        if (payload.new.read === true && payload.old.read === false) {
          setUnreadNotifications(n => Math.max(0, n - 1));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(notifChannel);
    };
  }, [user.id]);

  // Called by Messages page when user opens it (clears the dot)
  const clearMessages = () => setUnreadMessages(0);

  // Called by Notifications page when user opens it
  const clearNotifications = () => setUnreadNotifications(0);

  return (
    <BadgeContext.Provider value={{
      unreadMessages,
      unreadNotifications,
      clearMessages,
      clearNotifications,
    }}>
      {children}
    </BadgeContext.Provider>
  );
}

export const useBadges = () => useContext(BadgeContext);
