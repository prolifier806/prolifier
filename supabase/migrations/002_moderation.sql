-- ============================================================
-- Prolifier Content Moderation System
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================

-- ── BLOCKED WORDS ─────────────────────────────────────────
-- Managed from Supabase dashboard. Add/remove words anytime.
-- severity = 'block' → INSERT is rejected with an error
-- severity = 'flag'  → INSERT proceeds + row logged to moderation_queue
create table if not exists public.blocked_words (
  id         uuid default uuid_generate_v4() primary key,
  word       text not null unique,            -- single word OR multi-word phrase
  severity   text not null default 'flag'
               check (severity in ('block', 'flag')),
  category   text not null default 'profanity'
               check (category in ('hate_speech', 'threat', 'profanity', 'harassment', 'other')),
  created_at timestamptz default now()
);

alter table public.blocked_words enable row level security;

-- Authenticated users can read the list (needed for client-side pre-filter)
create policy "Authenticated users can read blocked words"
  on public.blocked_words for select
  using (auth.role() = 'authenticated');

-- Only service-role / dashboard can insert/update/delete
-- (no INSERT/UPDATE/DELETE policy → only service_role bypasses RLS)


-- ── MODERATION QUEUE ──────────────────────────────────────
-- Receives flagged content for admin review.
create table if not exists public.moderation_queue (
  id           uuid default uuid_generate_v4() primary key,
  content_type text not null check (content_type in ('posts', 'comments', 'messages')),
  content_id   uuid not null,
  user_id      uuid references public.profiles(id) on delete cascade not null,
  content_text text not null,
  matched_word text not null,
  severity     text not null,
  category     text not null,
  status       text not null default 'pending'
                 check (status in ('pending', 'approved', 'rejected')),
  reviewed_at  timestamptz,
  created_at   timestamptz default now()
);

alter table public.moderation_queue enable row level security;

-- Users can only see their own flagged content
create policy "Users can view their own moderation queue entries"
  on public.moderation_queue for select
  using (auth.uid() = user_id);

-- Trigger function inserts on behalf of any user (security definer)
create policy "System can insert moderation queue entries"
  on public.moderation_queue for insert
  with check (true);


-- ── REPORTS ───────────────────────────────────────────────
-- Users report content they find harmful.
create table if not exists public.reports (
  id           uuid default uuid_generate_v4() primary key,
  reporter_id  uuid references public.profiles(id) on delete cascade not null,
  content_type text not null check (content_type in ('post', 'comment', 'message', 'profile')),
  content_id   uuid not null,
  reason       text not null check (
                 reason in ('spam', 'hate_speech', 'harassment', 'misinformation', 'inappropriate', 'other')
               ),
  details      text,
  status       text not null default 'pending'
                 check (status in ('pending', 'reviewed', 'dismissed', 'actioned')),
  created_at   timestamptz default now(),
  -- One report per user per piece of content
  unique (reporter_id, content_type, content_id)
);

alter table public.reports enable row level security;

create policy "Users can submit reports"
  on public.reports for insert
  with check (auth.uid() = reporter_id);

create policy "Users can view their own reports"
  on public.reports for select
  using (auth.uid() = reporter_id);


-- ── MODERATION FUNCTION ────────────────────────────────────
-- Called by all three triggers. Checks p_content against
-- blocked_words using \m...\M word-boundary anchors so that
-- 'grass' does NOT trigger 'ass', and multi-word phrases like
-- 'kill yourself' are matched as complete phrases.
create or replace function public.check_and_moderate(
  p_content      text,
  p_content_type text,   -- 'posts' | 'comments' | 'messages'
  p_content_id   uuid,
  p_user_id      uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_word     text;
  v_severity text;
  v_category text;
begin
  -- Nothing to check
  if p_content is null or trim(p_content) = '' then
    return;
  end if;

  -- Find the most severe match first (block > flag).
  -- Pattern: \m<word>\M with internal spaces replaced by \s+
  -- so "kill yourself" becomes \mkill\s+yourself\M
  select
    bw.word,
    bw.severity,
    bw.category
  into v_word, v_severity, v_category
  from public.blocked_words bw
  where lower(p_content) ~* (
    '\m' || regexp_replace(lower(bw.word), '\s+', '\\s+', 'g') || '\M'
  )
  order by case bw.severity when 'block' then 1 else 2 end
  limit 1;

  -- Clean content — nothing to do
  if v_word is null then
    return;
  end if;

  if v_severity = 'block' then
    -- Abort the INSERT/UPDATE entirely.
    -- The client reads error.hint = 'blocked' to show the right message.
    raise exception 'Content blocked: prohibited content detected'
      using
        errcode = 'P0001',
        hint    = 'blocked',
        detail  = v_category;
  else
    -- Flag: log for admin review but let the row through.
    -- If the same content was already queued (e.g. user edits),
    -- reset it to pending so admins re-review the updated text.
    insert into public.moderation_queue (
      content_type, content_id, user_id,
      content_text, matched_word, severity, category
    )
    values (
      p_content_type, p_content_id, p_user_id,
      p_content,      v_word,       v_severity, v_category
    )
    on conflict do nothing;
  end if;
end;
$$;


-- ── TRIGGER FUNCTION ──────────────────────────────────────
-- Single function shared by all three triggers.
-- Extracts the text column and user_id per table, then delegates
-- to check_and_moderate().
create or replace function public.moderate_content_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_content text;
  v_user_id uuid;
begin
  case TG_TABLE_NAME
    when 'posts' then
      v_content := NEW.content;
      v_user_id := NEW.user_id;
    when 'comments' then
      v_content := NEW.text;
      v_user_id := NEW.user_id;
    when 'messages' then
      -- messages may be media-only (text is null); skip those
      v_content := coalesce(NEW.text, '');
      v_user_id := NEW.sender_id;
    else
      return NEW;
  end case;

  perform public.check_and_moderate(
    v_content,
    TG_TABLE_NAME,
    NEW.id,
    v_user_id
  );

  return NEW; -- only reached when content is clean or flagged (not blocked)
end;
$$;


-- ── ATTACH TRIGGERS ───────────────────────────────────────
-- BEFORE ensures blocked content never reaches the table.
-- OR UPDATE OF ... only re-checks when the text column changes.

drop trigger if exists trg_moderate_posts on public.posts;
create trigger trg_moderate_posts
  before insert or update of content
  on public.posts
  for each row execute function public.moderate_content_trigger();

drop trigger if exists trg_moderate_comments on public.comments;
create trigger trg_moderate_comments
  before insert or update of text
  on public.comments
  for each row execute function public.moderate_content_trigger();

drop trigger if exists trg_moderate_messages on public.messages;
create trigger trg_moderate_messages
  before insert
  on public.messages
  for each row execute function public.moderate_content_trigger();


-- ── SEED: BLOCK-LEVEL WORDS ───────────────────────────────
-- Racial slurs
insert into public.blocked_words (word, severity, category) values
  ('nigger',        'block', 'hate_speech'),
  ('nigga',         'block', 'hate_speech'),
  ('chink',         'block', 'hate_speech'),
  ('gook',          'block', 'hate_speech'),
  ('spic',          'block', 'hate_speech'),
  ('wetback',       'block', 'hate_speech'),
  ('kike',          'block', 'hate_speech'),
  ('towelhead',     'block', 'hate_speech'),
  ('sandnigger',    'block', 'hate_speech'),
  ('coon',          'block', 'hate_speech'),
  ('jigaboo',       'block', 'hate_speech'),
  ('porch monkey',  'block', 'hate_speech'),
  ('jungle bunny',  'block', 'hate_speech'),
  -- Homophobic / transphobic slurs
  ('faggot',        'block', 'hate_speech'),
  ('fag',           'block', 'hate_speech'),
  ('dyke',          'block', 'hate_speech'),
  ('tranny',        'block', 'hate_speech'),
  ('shemale',       'block', 'hate_speech'),
  -- Violent threats / self-harm encouragement
  ('kill yourself',     'block', 'threat'),
  ('go kill yourself',  'block', 'threat'),
  ('kys',               'block', 'threat'),
  ('i will kill you',   'block', 'threat'),
  ('i will hurt you',   'block', 'threat'),
  ('i want you dead',   'block', 'threat'),
  ('you should die',    'block', 'threat'),
  ('hope you die',      'block', 'threat'),
  ('go die',            'block', 'threat'),
  ('slit your wrists',  'block', 'threat'),
  ('hang yourself',     'block', 'threat'),
  ('shoot yourself',    'block', 'threat'),
  ('stab you',          'block', 'threat'),
  ('i will find you',   'block', 'threat'),
  -- Doxxing
  ('i will dox',        'block', 'harassment'),
  ('doxx you',          'block', 'harassment')
on conflict (word) do nothing;

-- ── SEED: FLAG-LEVEL WORDS ────────────────────────────────
-- Profanity (flagged for review, not hard-blocked)
insert into public.blocked_words (word, severity, category) values
  ('fuck',          'flag', 'profanity'),
  ('shit',          'flag', 'profanity'),
  ('asshole',       'flag', 'profanity'),
  ('bitch',         'flag', 'profanity'),
  ('cunt',          'flag', 'profanity'),
  ('bastard',       'flag', 'profanity'),
  ('motherfucker',  'flag', 'profanity'),
  ('bullshit',      'flag', 'profanity'),
  ('horseshit',     'flag', 'profanity'),
  ('jackass',       'flag', 'profanity'),
  ('dumbass',       'flag', 'profanity'),
  -- Ableist / demeaning language
  ('retard',        'flag', 'harassment'),
  ('retarded',      'flag', 'harassment'),
  ('moron',         'flag', 'harassment'),
  ('imbecile',      'flag', 'harassment'),
  -- Body-shaming phrases
  ('fat pig',       'flag', 'harassment'),
  ('ugly bitch',    'flag', 'harassment')
on conflict (word) do nothing;
