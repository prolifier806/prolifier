-- Migration 017 — Add reply fields to messages
--
-- reply_to_id: the id of the message being replied to
-- reply_to_text: snapshot of the replied message text/label at send time
--   (snapshot so the quote still shows even if original is deleted)

alter table public.messages
  add column if not exists reply_to_id   uuid references public.messages(id) on delete set null,
  add column if not exists reply_to_text text;
