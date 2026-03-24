-- ============================================================
-- Prolifier Content Moderation System
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================

-- ── BLOCKED WORDS ─────────────────────────────────────────
create table if not exists public.blocked_words (
  id         uuid default uuid_generate_v4() primary key,
  word       text not null unique,
  severity   text not null default 'block'
               check (severity in ('block', 'flag')),
  category   text not null default 'profanity'
               check (category in (
                 'hate_speech', 'threat', 'profanity', 'harassment',
                 'sexual', 'slur', 'casteist', 'other'
               )),
  created_at timestamptz default now()
);

alter table public.blocked_words enable row level security;

create policy "Authenticated users can read blocked words"
  on public.blocked_words for select
  using (auth.role() = 'authenticated');


-- ── MODERATION QUEUE ──────────────────────────────────────
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

create policy "Users can view their own moderation queue entries"
  on public.moderation_queue for select
  using (auth.uid() = user_id);

create policy "System can insert moderation queue entries"
  on public.moderation_queue for insert
  with check (true);


-- ── REPORTS ───────────────────────────────────────────────
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
create or replace function public.check_and_moderate(
  p_content      text,
  p_content_type text,
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
  if p_content is null or trim(p_content) = '' then
    return;
  end if;

  select bw.word, bw.severity, bw.category
  into v_word, v_severity, v_category
  from public.blocked_words bw
  where lower(p_content) ~* (
    '\m' || regexp_replace(lower(bw.word), '\s+', '\\s+', 'g') || '\M'
  )
  order by case bw.severity when 'block' then 1 else 2 end
  limit 1;

  if v_word is null then
    return;
  end if;

  if v_severity = 'block' then
    raise exception 'Content blocked: prohibited content detected'
      using errcode = 'P0001', hint = 'blocked', detail = v_category;
  else
    insert into public.moderation_queue (
      content_type, content_id, user_id,
      content_text, matched_word, severity, category
    )
    values (
      p_content_type, p_content_id, p_user_id,
      p_content, v_word, v_severity, v_category
    )
    on conflict do nothing;
  end if;
end;
$$;


-- ── TRIGGER FUNCTION ──────────────────────────────────────
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
    else
      return NEW;
  end case;

  perform public.check_and_moderate(v_content, TG_TABLE_NAME, NEW.id, v_user_id);
  return NEW;
end;
$$;


-- ── ATTACH TRIGGERS ───────────────────────────────────────
-- Private messages are NOT moderated — DMs are fully private.

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


-- ── SEED: ALL BLOCKED WORDS ────────────────────────────────
-- English — racial slurs
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
  -- English — homophobic / transphobic
  ('faggot',        'block', 'hate_speech'),
  ('fag',           'block', 'hate_speech'),
  ('dyke',          'block', 'hate_speech'),
  ('tranny',        'block', 'hate_speech'),
  ('shemale',       'block', 'hate_speech'),
  -- English — threats / self-harm
  ('kill yourself',    'block', 'threat'),
  ('go kill yourself', 'block', 'threat'),
  ('kys',              'block', 'threat'),
  ('i will kill you',  'block', 'threat'),
  ('i will hurt you',  'block', 'threat'),
  ('i want you dead',  'block', 'threat'),
  ('you should die',   'block', 'threat'),
  ('hope you die',     'block', 'threat'),
  ('go die',           'block', 'threat'),
  ('slit your wrists', 'block', 'threat'),
  ('hang yourself',    'block', 'threat'),
  ('shoot yourself',   'block', 'threat'),
  ('stab you',         'block', 'threat'),
  ('i will find you',  'block', 'threat'),
  -- English — doxxing
  ('i will dox',       'block', 'harassment'),
  ('doxx you',         'block', 'harassment'),
  -- English — profanity
  ('fuck',             'block', 'profanity'),
  ('fucking',          'block', 'profanity'),
  ('fucked',           'block', 'profanity'),
  ('fucker',           'block', 'profanity'),
  ('fck',              'block', 'profanity'),
  ('fuk',              'block', 'profanity'),
  ('shit',             'block', 'profanity'),
  ('asshole',          'block', 'profanity'),
  ('bitch',            'block', 'profanity'),
  ('cunt',             'block', 'profanity'),
  ('bastard',          'block', 'profanity'),
  ('motherfucker',     'block', 'profanity'),
  ('mf',               'block', 'profanity'),
  ('bullshit',         'block', 'profanity'),
  ('horseshit',        'block', 'profanity'),
  ('jackass',          'block', 'profanity'),
  ('dumbass',          'block', 'profanity'),
  ('ass',              'block', 'profanity'),
  ('piss',             'block', 'profanity'),
  ('cock',             'block', 'profanity'),
  ('dick',             'block', 'profanity'),
  ('pussy',            'block', 'profanity'),
  ('whore',            'block', 'profanity'),
  ('slut',             'block', 'profanity'),
  ('wtf',              'block', 'profanity'),
  ('stfu',             'block', 'profanity'),
  -- English — ableist
  ('retard',           'block', 'harassment'),
  ('retarded',         'block', 'harassment'),
  ('moron',            'block', 'harassment'),
  ('imbecile',         'block', 'harassment'),
  -- English — body-shaming
  ('fat pig',          'block', 'harassment'),
  ('ugly bitch',       'block', 'harassment')
on conflict (word) do nothing;

-- Hindi / Urdu
insert into public.blocked_words (word, severity, category) values
  ('bhenchod',         'block', 'sexual'),
  ('bhen chod',        'block', 'sexual'),
  ('bhnchd',           'block', 'sexual'),
  ('bc',               'block', 'sexual'),
  ('madarchod',        'block', 'sexual'),
  ('madar chod',       'block', 'sexual'),
  ('madarchut',        'block', 'sexual'),
  ('mc',               'block', 'sexual'),
  ('bmkb',             'block', 'sexual'),
  ('chutiya',          'block', 'sexual'),
  ('chut',             'block', 'sexual'),
  ('choot',            'block', 'sexual'),
  ('bhosdike',         'block', 'sexual'),
  ('bhosdiwale',       'block', 'sexual'),
  ('bhosdika',         'block', 'sexual'),
  ('lund',             'block', 'sexual'),
  ('loda',             'block', 'sexual'),
  ('lauda',            'block', 'sexual'),
  ('lodu',             'block', 'sexual'),
  ('gaand',            'block', 'sexual'),
  ('gand',             'block', 'sexual'),
  ('gaandu',           'block', 'sexual'),
  ('gandu',            'block', 'sexual'),
  ('randi',            'block', 'sexual'),
  ('rande',            'block', 'sexual'),
  ('randwa',           'block', 'sexual'),
  ('bitch teri maa',   'block', 'sexual'),
  ('teri maa ki',      'block', 'sexual'),
  ('teri maa',         'block', 'sexual'),
  ('teri behen',       'block', 'sexual'),
  ('tere baap',        'block', 'sexual'),
  ('haraami',          'block', 'harassment'),
  ('harami',           'block', 'harassment'),
  ('kutta',            'block', 'harassment'),
  ('kutte',            'block', 'harassment'),
  ('kamina',           'block', 'harassment'),
  ('kamine',           'block', 'harassment'),
  ('saala',            'block', 'harassment'),
  ('sali',             'block', 'harassment'),
  ('ullu',             'block', 'harassment'),
  ('ullu ka pattha',   'block', 'harassment'),
  ('nikamma',          'block', 'harassment'),
  ('napunsak',         'block', 'harassment'),
  ('hijra',            'block', 'slur'),
  ('hijda',            'block', 'slur'),
  ('chakka',           'block', 'slur'),
  ('behenke lode',     'block', 'sexual'),
  ('bklol',            'block', 'harassment'),
  ('mkbc',             'block', 'sexual'),
  ('lmao teri maa',    'block', 'sexual'),
  -- Casteist
  ('chamar',           'block', 'casteist'),
  ('chamaar',          'block', 'casteist'),
  ('bhangi',           'block', 'casteist'),
  ('maang',            'block', 'casteist'),
  ('dhed',             'block', 'casteist'),
  ('dhor',             'block', 'casteist'),
  ('neech jaat',       'block', 'casteist'),
  ('neech',            'block', 'casteist'),
  -- Religious slurs
  ('katua',            'block', 'slur'),
  ('katwa',            'block', 'slur'),
  ('kafir',            'block', 'slur'),
  ('mullah',           'block', 'slur'),
  ('jihadi',           'block', 'slur'),
  ('terrorist mullah', 'block', 'slur')
on conflict (word) do nothing;

-- Punjabi
insert into public.blocked_words (word, severity, category) values
  ('penchod',    'block', 'sexual'),
  ('pen chod',   'block', 'sexual'),
  ('mothchod',   'block', 'sexual'),
  ('mada chod',  'block', 'sexual'),
  ('dallay',     'block', 'sexual'),
  ('dalla',      'block', 'sexual'),
  ('gashti',     'block', 'sexual'),
  ('lun',        'block', 'sexual'),
  ('tatti',      'block', 'harassment'),
  ('khota',      'block', 'harassment')
on conflict (word) do nothing;

-- Tamil
insert into public.blocked_words (word, severity, category) values
  ('punda',        'block', 'sexual'),
  ('pundamavane',  'block', 'sexual'),
  ('pundachi',     'block', 'sexual'),
  ('oombu',        'block', 'sexual'),
  ('thevdiya',     'block', 'sexual'),
  ('thevdiyapaya', 'block', 'sexual'),
  ('sunni',        'block', 'sexual'),
  ('koothi',       'block', 'sexual'),
  ('soothu',       'block', 'sexual'),
  ('otha',         'block', 'sexual'),
  ('ottiya',       'block', 'sexual'),
  ('loosu',        'block', 'harassment'),
  ('baadu',        'block', 'harassment'),
  ('naye',         'block', 'harassment'),
  ('naaye',        'block', 'harassment'),
  ('parayan',      'block', 'casteist'),
  ('pallan',       'block', 'casteist'),
  ('sakkiliyar',   'block', 'casteist')
on conflict (word) do nothing;

-- Telugu
insert into public.blocked_words (word, severity, category) values
  ('dengey',      'block', 'sexual'),
  ('dengu',       'block', 'sexual'),
  ('dengina',     'block', 'sexual'),
  ('puku',        'block', 'sexual'),
  ('modda',       'block', 'sexual'),
  ('lanjha',      'block', 'sexual'),
  ('lanja',       'block', 'sexual'),
  ('lanjakodaka', 'block', 'sexual'),
  ('naakodaka',   'block', 'sexual'),
  ('gudda',       'block', 'sexual'),
  ('donga',       'block', 'harassment')
on conflict (word) do nothing;

-- Bengali
insert into public.blocked_words (word, severity, category) values
  ('bokachoda',     'block', 'sexual'),
  ('boka choda',    'block', 'sexual'),
  ('banchod',       'block', 'sexual'),
  ('khanki',        'block', 'sexual'),
  ('khanki magi',   'block', 'sexual'),
  ('magi',          'block', 'sexual'),
  ('khankir chele', 'block', 'sexual'),
  ('chudi',         'block', 'sexual'),
  ('chude',         'block', 'sexual'),
  ('tor maa',       'block', 'sexual'),
  ('toder maa',     'block', 'sexual'),
  ('haramzada',     'block', 'harassment'),
  ('haramjada',     'block', 'harassment'),
  ('shala',         'block', 'harassment'),
  ('shali',         'block', 'harassment'),
  ('chhagal',       'block', 'harassment'),
  ('kukur',         'block', 'harassment')
on conflict (word) do nothing;

-- Kannada
insert into public.blocked_words (word, severity, category) values
  ('tike',          'block', 'sexual'),
  ('thike',         'block', 'sexual'),
  ('hende',         'block', 'sexual'),
  ('sule',          'block', 'sexual'),
  ('sulemaganey',   'block', 'sexual'),
  ('boli',          'block', 'sexual'),
  ('bolimaga',      'block', 'sexual'),
  ('nin amma',      'block', 'sexual'),
  ('nin akka',      'block', 'sexual'),
  ('bekku',         'block', 'harassment'),
  ('muchkond hogi', 'block', 'harassment'),
  ('holeya',        'block', 'casteist')
on conflict (word) do nothing;

-- Arabic (Roman transliteration)
insert into public.blocked_words (word, severity, category) values
  ('kos omak',          'block', 'sexual'),
  ('kos ommak',         'block', 'sexual'),
  ('kos okhtak',        'block', 'sexual'),
  ('kos okhto',         'block', 'sexual'),
  ('kuss',              'block', 'sexual'),
  ('kus',               'block', 'sexual'),
  ('ayr',               'block', 'sexual'),
  ('zibbi',             'block', 'sexual'),
  ('zebbi',             'block', 'sexual'),
  ('teez',              'block', 'sexual'),
  ('tizz',              'block', 'sexual'),
  ('sharmouta',         'block', 'sexual'),
  ('sharmuta',          'block', 'sexual'),
  ('ibn el sharmouta',  'block', 'sexual'),
  ('ibn sharmouta',     'block', 'sexual'),
  ('bint el sharmouta', 'block', 'sexual'),
  ('ahba',              'block', 'sexual'),
  ('qahba',             'block', 'sexual'),
  ('kahba',             'block', 'sexual'),
  ('kahbe',             'block', 'sexual'),
  ('metnak',            'block', 'sexual'),
  ('metnakk',           'block', 'sexual'),
  ('nayek',             'block', 'sexual'),
  ('ayir fi',           'block', 'sexual'),
  ('da ayrr',           'block', 'sexual'),
  ('ibn el kalb',       'block', 'harassment'),
  ('ibn kelb',          'block', 'harassment'),
  ('ibn el himar',      'block', 'harassment'),
  ('khara alek',        'block', 'harassment'),
  ('ya khara',          'block', 'harassment'),
  ('weld el haram',     'block', 'harassment'),
  ('walad haram',       'block', 'harassment'),
  ('ibn haram',         'block', 'harassment'),
  ('yelan abu',         'block', 'harassment'),
  ('kalb',              'block', 'harassment'),
  ('kelb',              'block', 'harassment'),
  ('himaar',            'block', 'harassment'),
  ('himar',             'block', 'harassment'),
  ('khara',             'block', 'harassment'),
  ('gazma',             'block', 'harassment'),
  ('yel an',            'block', 'harassment')
on conflict (word) do nothing;

-- Turkish
insert into public.blocked_words (word, severity, category) values
  ('siktir',                  'block', 'sexual'),
  ('orospu',                  'block', 'sexual'),
  ('orospu cocugu',           'block', 'sexual'),
  ('orospunun dogurdugu',     'block', 'sexual'),
  ('amina koyayim',           'block', 'sexual'),
  ('amina koy',               'block', 'sexual'),
  ('amina',                   'block', 'sexual'),
  ('sikeyim',                 'block', 'sexual'),
  ('gotten sikeyim',          'block', 'sexual'),
  ('dalyarak',                'block', 'sexual'),
  ('yarak',                   'block', 'sexual'),
  ('yarrak',                  'block', 'sexual'),
  ('kahpe',                   'block', 'sexual'),
  ('pezevenk',                'block', 'sexual'),
  ('senin ananı',             'block', 'sexual'),
  ('anasini',                 'block', 'sexual'),
  ('koyayim',                 'block', 'sexual'),
  ('anan',                    'block', 'sexual'),
  ('anani',                   'block', 'sexual'),
  ('ibne',                    'block', 'slur'),
  ('ibni',                    'block', 'slur'),
  ('pust',                    'block', 'slur'),
  ('got oglani',              'block', 'slur'),
  ('pic',                     'block', 'harassment'),
  ('amk',                     'block', 'sexual'),
  ('bok',                     'block', 'harassment'),
  ('boktan',                  'block', 'harassment'),
  ('essek',                   'block', 'harassment'),
  ('aptal',                   'block', 'harassment'),
  ('salak',                   'block', 'harassment'),
  ('geri zekalı',             'block', 'harassment')
on conflict (word) do nothing;

-- Indonesian / Malay
insert into public.blocked_words (word, severity, category) values
  ('kontol',      'block', 'sexual'),
  ('kontool',     'block', 'sexual'),
  ('memek',       'block', 'sexual'),
  ('meki',        'block', 'sexual'),
  ('ngentot',     'block', 'sexual'),
  ('entot',       'block', 'sexual'),
  ('ngewe',       'block', 'sexual'),
  ('ngewek',      'block', 'sexual'),
  ('jembut',      'block', 'sexual'),
  ('pepek',       'block', 'sexual'),
  ('titit',       'block', 'sexual'),
  ('colmek',      'block', 'sexual'),
  ('coli',        'block', 'sexual'),
  ('jancok',      'block', 'sexual'),
  ('jancuk',      'block', 'sexual'),
  ('cuki mai',    'block', 'sexual'),
  ('cukimak',     'block', 'sexual'),
  ('pukimak',     'block', 'sexual'),
  ('bangsat',     'block', 'harassment'),
  ('bajingan',    'block', 'harassment'),
  ('keparat',     'block', 'harassment'),
  ('kurang ajar', 'block', 'harassment'),
  ('brengsek',    'block', 'harassment'),
  ('brengsek lu', 'block', 'harassment'),
  ('asu kowe',    'block', 'harassment'),
  ('anjing',      'block', 'harassment'),
  ('anjir',       'block', 'harassment'),
  ('asu',         'block', 'harassment'),
  ('babi',        'block', 'harassment'),
  ('tai',         'block', 'harassment'),
  ('tolol',       'block', 'harassment'),
  ('goblok',      'block', 'harassment'),
  ('sial',        'block', 'harassment'),
  ('kampret',     'block', 'harassment'),
  ('matamu',      'block', 'harassment'),
  ('matane',      'block', 'harassment'),
  ('mampus',      'block', 'harassment')
on conflict (word) do nothing;
