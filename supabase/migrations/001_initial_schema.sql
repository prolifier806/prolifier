-- ============================================================
-- Prolifier Database Schema
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ── PROFILES ──────────────────────────────────────────────
create table if not exists public.profiles (
  id              uuid references auth.users(id) on delete cascade primary key,
  name            text not null default '',
  avatar          text not null default 'U',
  color           text not null default 'bg-primary',
  location        text,
  bio             text,
  project         text,
  skills          text[] default '{}',
  looking_for     text[] default '{}',
  github          text,
  website         text,
  twitter         text,
  primary_lang    text default 'en',
  open_to_collab  boolean default true,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Profiles are viewable by everyone"
  on public.profiles for select using (true);

create policy "Users can insert their own profile"
  on public.profiles for insert with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, avatar, color)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    upper(left(coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)), 2)),
    'bg-primary'
  );
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── POSTS ─────────────────────────────────────────────────
create table if not exists public.posts (
  id          uuid default uuid_generate_v4() primary key,
  user_id     uuid references public.profiles(id) on delete cascade not null,
  content     text not null,
  tag         text not null default 'Progress',
  image_url   text,
  video_url   text,
  likes       integer default 0,
  created_at  timestamptz default now()
);

alter table public.posts enable row level security;

create policy "Posts are viewable by everyone"
  on public.posts for select using (true);

create policy "Users can insert their own posts"
  on public.posts for insert with check (auth.uid() = user_id);

create policy "Users can update their own posts"
  on public.posts for update using (auth.uid() = user_id);

create policy "Users can delete their own posts"
  on public.posts for delete using (auth.uid() = user_id);

-- ── POST LIKES ────────────────────────────────────────────
create table if not exists public.post_likes (
  id          uuid default uuid_generate_v4() primary key,
  user_id     uuid references public.profiles(id) on delete cascade not null,
  post_id     uuid references public.posts(id) on delete cascade not null,
  created_at  timestamptz default now(),
  unique(user_id, post_id)
);

alter table public.post_likes enable row level security;

create policy "Likes are viewable by everyone"
  on public.post_likes for select using (true);

create policy "Users can like posts"
  on public.post_likes for insert with check (auth.uid() = user_id);

create policy "Users can unlike posts"
  on public.post_likes for delete using (auth.uid() = user_id);

-- Update likes count on post
create or replace function update_post_likes()
returns trigger language plpgsql security definer
as $$
begin
  if TG_OP = 'INSERT' then
    update public.posts set likes = likes + 1 where id = NEW.post_id;
  elsif TG_OP = 'DELETE' then
    update public.posts set likes = likes - 1 where id = OLD.post_id;
  end if;
  return null;
end;
$$;

create trigger on_post_like
  after insert or delete on public.post_likes
  for each row execute procedure update_post_likes();

-- ── COMMENTS ─────────────────────────────────────────────
create table if not exists public.comments (
  id          uuid default uuid_generate_v4() primary key,
  post_id     uuid references public.posts(id) on delete cascade not null,
  user_id     uuid references public.profiles(id) on delete cascade not null,
  text        text not null,
  created_at  timestamptz default now()
);

alter table public.comments enable row level security;

create policy "Comments are viewable by everyone"
  on public.comments for select using (true);

create policy "Users can insert comments"
  on public.comments for insert with check (auth.uid() = user_id);

create policy "Users can delete their own comments"
  on public.comments for delete using (auth.uid() = user_id);

-- ── COLLABS ──────────────────────────────────────────────
create table if not exists public.collabs (
  id          uuid default uuid_generate_v4() primary key,
  user_id     uuid references public.profiles(id) on delete cascade not null,
  title       text not null,
  looking     text not null,
  description text not null,
  skills      text[] default '{}',
  image_url   text,
  video_url   text,
  created_at  timestamptz default now()
);

alter table public.collabs enable row level security;

create policy "Collabs are viewable by everyone"
  on public.collabs for select using (true);

create policy "Users can insert their own collabs"
  on public.collabs for insert with check (auth.uid() = user_id);

create policy "Users can update their own collabs"
  on public.collabs for update using (auth.uid() = user_id);

create policy "Users can delete their own collabs"
  on public.collabs for delete using (auth.uid() = user_id);

-- ── MESSAGES ─────────────────────────────────────────────
create table if not exists public.messages (
  id          uuid default uuid_generate_v4() primary key,
  sender_id   uuid references public.profiles(id) on delete cascade not null,
  receiver_id uuid references public.profiles(id) on delete cascade not null,
  text        text,
  media_url   text,
  media_type  text,
  read        boolean default false,
  created_at  timestamptz default now()
);

alter table public.messages enable row level security;

create policy "Users can view their own messages"
  on public.messages for select
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

create policy "Users can send messages"
  on public.messages for insert with check (auth.uid() = sender_id);

create policy "Users can mark messages as read"
  on public.messages for update using (auth.uid() = receiver_id);

-- ── GROUPS ───────────────────────────────────────────────
create table if not exists public.groups (
  id           uuid default uuid_generate_v4() primary key,
  name         text not null,
  description  text not null default '',
  bio          text not null default '',
  emoji        text not null default '🚀',
  topic        text not null default 'General',
  visibility   text not null default 'public',
  owner_id     uuid references public.profiles(id) on delete cascade not null,
  member_count integer default 1,
  created_at   timestamptz default now()
);

alter table public.groups enable row level security;

create policy "Public groups are viewable by everyone"
  on public.groups for select using (visibility = 'public' or owner_id = auth.uid());

create policy "Users can create groups"
  on public.groups for insert with check (auth.uid() = owner_id);

create policy "Owners can update their groups"
  on public.groups for update using (auth.uid() = owner_id);

create policy "Owners can delete their groups"
  on public.groups for delete using (auth.uid() = owner_id);

-- ── GROUP MEMBERS ─────────────────────────────────────────
create table if not exists public.group_members (
  id          uuid default uuid_generate_v4() primary key,
  group_id    uuid references public.groups(id) on delete cascade not null,
  user_id     uuid references public.profiles(id) on delete cascade not null,
  joined_at   timestamptz default now(),
  unique(group_id, user_id)
);

alter table public.group_members enable row level security;

create policy "Group members are viewable by everyone"
  on public.group_members for select using (true);

create policy "Users can join groups"
  on public.group_members for insert with check (auth.uid() = user_id);

create policy "Users can leave groups"
  on public.group_members for delete using (auth.uid() = user_id);

-- Update member count on join/leave
create or replace function update_group_member_count()
returns trigger language plpgsql security definer
as $$
begin
  if TG_OP = 'INSERT' then
    update public.groups set member_count = member_count + 1 where id = NEW.group_id;
  elsif TG_OP = 'DELETE' then
    update public.groups set member_count = member_count - 1 where id = OLD.group_id;
  end if;
  return null;
end;
$$;

create trigger on_group_member_change
  after insert or delete on public.group_members
  for each row execute procedure update_group_member_count();

-- ── GROUP MESSAGES ────────────────────────────────────────
create table if not exists public.group_messages (
  id          uuid default uuid_generate_v4() primary key,
  group_id    uuid references public.groups(id) on delete cascade not null,
  user_id     uuid references public.profiles(id) on delete cascade not null,
  text        text,
  media_url   text,
  media_type  text,
  created_at  timestamptz default now()
);

alter table public.group_messages enable row level security;

create policy "Group messages viewable by members"
  on public.group_messages for select
  using (
    exists (
      select 1 from public.group_members
      where group_id = group_messages.group_id and user_id = auth.uid()
    )
  );

create policy "Members can send group messages"
  on public.group_messages for insert
  with check (
    auth.uid() = user_id and
    exists (
      select 1 from public.group_members
      where group_id = group_messages.group_id and user_id = auth.uid()
    )
  );

-- ── NOTIFICATIONS ─────────────────────────────────────────
create table if not exists public.notifications (
  id          uuid default uuid_generate_v4() primary key,
  user_id     uuid references public.profiles(id) on delete cascade not null,
  type        text not null,
  text        text not null,
  subtext     text,
  read        boolean default false,
  action      text,
  created_at  timestamptz default now()
);

alter table public.notifications enable row level security;

create policy "Users can view their own notifications"
  on public.notifications for select using (auth.uid() = user_id);

create policy "System can insert notifications"
  on public.notifications for insert with check (true);

create policy "Users can mark notifications as read"
  on public.notifications for update using (auth.uid() = user_id);

create policy "Users can delete their notifications"
  on public.notifications for delete using (auth.uid() = user_id);

-- ── CONNECTIONS ───────────────────────────────────────────
create table if not exists public.connections (
  id           uuid default uuid_generate_v4() primary key,
  requester_id uuid references public.profiles(id) on delete cascade not null,
  receiver_id  uuid references public.profiles(id) on delete cascade not null,
  status       text default 'pending',
  created_at   timestamptz default now(),
  unique(requester_id, receiver_id)
);

alter table public.connections enable row level security;

create policy "Users can view their connections"
  on public.connections for select
  using (auth.uid() = requester_id or auth.uid() = receiver_id);

create policy "Users can send connection requests"
  on public.connections for insert with check (auth.uid() = requester_id);

create policy "Users can update connection status"
  on public.connections for update using (auth.uid() = receiver_id);

create policy "Users can delete connections"
  on public.connections for delete
  using (auth.uid() = requester_id or auth.uid() = receiver_id);

-- ── REALTIME ─────────────────────────────────────────────
-- Enable realtime for these tables
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.group_messages;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.posts;

-- ── STORAGE ──────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict do nothing;

insert into storage.buckets (id, name, public)
values ('posts', 'posts', true)
on conflict do nothing;

insert into storage.buckets (id, name, public)
values ('messages', 'messages', false)
on conflict do nothing;

create policy "Avatar images are publicly accessible"
  on storage.objects for select using (bucket_id = 'avatars');

create policy "Users can upload their own avatar"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Post media is publicly accessible"
  on storage.objects for select using (bucket_id = 'posts');

create policy "Users can upload post media"
  on storage.objects for insert
  with check (bucket_id = 'posts' and auth.uid() is not null);

create policy "Users can view their message media"
  on storage.objects for select
  using (bucket_id = 'messages' and auth.uid() is not null);

create policy "Users can upload message media"
  on storage.objects for insert
  with check (bucket_id = 'messages' and auth.uid() is not null);
