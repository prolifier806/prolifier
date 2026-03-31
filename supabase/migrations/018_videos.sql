-- Migration 018 — Video processing pipeline
--
-- Table: videos
--   Tracks every video from initial upload through background processing.
--   status flow:  uploading → processing → ready
--                                        ↘ failed
--
-- Storage buckets (create these manually in the Supabase dashboard):
--   videos-raw   (private)  — original uploads before processing
--   videos       (public)   — processed HLS segments + thumbnails
--
-- The `process-video` Edge Function is invoked by the client after upload.
-- It transcodes the raw file, generates HLS playlists, and updates this row.

create table if not exists public.videos (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references public.profiles(id) on delete cascade,
  context       text        not null check (context in ('feed', 'chat')),
  status        text        not null default 'uploading'
                            check (status in ('uploading', 'processing', 'ready', 'failed')),

  -- Raw upload path (videos-raw bucket) — cleared after processing succeeds
  raw_path      text,

  -- Processed outputs (videos bucket)
  hls_url       text,         -- public URL of master.m3u8
  fallback_url  text,         -- public URL of the raw MP4 (served immediately on upload)
  thumbnail_url text,         -- WebP thumbnail extracted at ~1 s

  -- Video metadata (filled by edge function)
  duration_secs numeric,
  width         integer,
  height        integer,
  size_bytes    bigint,

  error_msg     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Auto-update updated_at on every row change
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists videos_updated_at on public.videos;
create trigger videos_updated_at
  before update on public.videos
  for each row execute procedure public.set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────

alter table public.videos enable row level security;

-- Owners can do anything with their own rows
create policy "video_owner_all"
  on public.videos for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Anyone can read videos that have finished processing
create policy "video_public_read"
  on public.videos for select
  using (status = 'ready');

-- Edge Function uses service_role key — bypasses RLS, no extra policy needed.

-- ── Indexes ───────────────────────────────────────────────────────────────

create index if not exists videos_user_id_idx    on public.videos (user_id);
create index if not exists videos_status_idx     on public.videos (status);
create index if not exists videos_created_at_idx on public.videos (created_at desc);
