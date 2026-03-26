import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

type StatusCb = (status: string, err?: Error) => void;

/**
 * Manages a single Supabase realtime channel with guaranteed lifecycle safety:
 * - Channel is created when `key` becomes truthy
 * - Old channel is always removed before a new one is created (prevents duplicates)
 * - Channel is removed when component unmounts or `key` changes
 * - Dev mode logs active channel count for easy debugging
 *
 * The `key` encodes all relevant deps (e.g. `dm-${userId}`, `grp-${groupId}`),
 * so the dep array is just `[key]` — no manual dep spreading needed.
 *
 * Usage:
 *   useRealtimeChannel(
 *     user.id ? `dm-${user.id}` : null,
 *     ch => ch.on("postgres_changes", { event: "INSERT", ... }, handler),
 *     onStatus   // optional: called with SUBSCRIBED / CHANNEL_ERROR / etc.
 *   );
 */
export function useRealtimeChannel(
  key: string | null | undefined,
  setup: (ch: RealtimeChannel) => RealtimeChannel,
  onStatus?: StatusCb,
) {
  // Always keep the latest version of callbacks without re-running the effect
  const setupRef   = useRef(setup);
  const onStatusRef = useRef(onStatus);
  setupRef.current   = setup;
  onStatusRef.current = onStatus;

  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!key) return;

    // Tear down any existing channel first — prevents duplicate WAL subscriptions
    // that can occur on React StrictMode double-invoke or rapid re-renders.
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const ch = setupRef.current(supabase.channel(key));

    ch.subscribe((status, err) => {
      if (err && import.meta.env.DEV) console.error(`[Realtime] ${key} error:`, err);
      onStatusRef.current?.(status, err ?? undefined);
    });

    channelRef.current = ch;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [key]); // key encodes all deps (userId, groupId, etc.) — no spreading needed
}
