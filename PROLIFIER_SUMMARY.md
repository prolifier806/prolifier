# Prolifier — Full Product Summary

## What It Is

A social platform for **developers and creators** to discover co-founders, collaborate on projects, and build a community. Think LinkedIn meets Discord, purpose-built for indie builders and early-stage startups.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript + Vite |
| Styling | Tailwind CSS + shadcn/ui (dark mode) |
| Backend | Node.js + Express + Zod |
| Database | Supabase (PostgreSQL + Realtime + Storage) |
| Auth | Supabase Auth (email + Google OAuth) |
| Video | HLS transcoding via backend pipeline |
| Routing | React Router v6 (lazy-loaded routes) |
| State | UserContext (localStorage cache + Supabase DB sync) |

---

## Pages & Features

### `/feed` — Posts + Collab Feed

**Posts Tab**
- Share updates, milestones, questions, ideas tagged by category (General, Launch, Progress, Question, Idea, Milestone, Feedback, Story, Resource)
- Like, comment (threaded replies), save, share, report, hide posts
- **Relevant / Newest toggle** — Relevant boosts posts from connections + freshness decay + mild engagement boost; Newest is strict chronological
- Search by author, content, tag + category filter
- Infinite scroll with stale-cache (feed shows instantly from localStorage on return visits, refreshes in background)
- Image carousel (multi-image posts), HLS video playback

**Collab Tab**
- Post co-founder requests: project name, co-founder role, description, skills (up to 3), optional image/video, candidate location
- **Smart match labels** on every card: 🔥 Strong Match / 👍 Good Match / ⚠️ Low Match — based on your profile skills vs post's required role keywords + skill tags (rule-based, no ML)
- **Relevant / Newest toggle** — Relevant sorts Strong → Good → Low, newest-first within each tier
- Express interest, message author, save, share, report, hide
- Skill filter + search across title, role, description, skills

---

### `/discover` — Find People
- Browse developer profiles with name, skills, location, startup stage
- Send / cancel connection requests
- Filter by skills, location, startup stage
- Block / unblock users

---

### `/messages` — Direct Messages
- 1:1 messaging with text, image, video, voice note, file attachments
- Reply threading (quote a message), read receipts (✓ / ✓✓), mute notifications
- Delete entire chat conversation
- **Active today** (green, < 24h) / **Active this week** (muted, < 7 days) status in chat header — powered by `last_active` column updated on every session
- Share posts and collab cards directly into a message
- Block/report user from chat

---

### `/groups` — Communities

**Browse & Discovery**
- Grid of community cards with emoji/image icon, member count, topic badge
- **Sort:** Popular (member count) / Newest (created date) / Active (had a message in last 48h — filters to active only)
- **Active badge** on cards for recently active communities
- Search by name or topic + topic filter
- **Request to Join** flow for private communities with instant state change (no loading spinners)
- Real-time join request sync — admin panel updates without page refresh via Supabase Realtime

**Community Chat**
- Full chat with image, video, file attachments
- @mentions with highlight + jump navigation
- Reply threading
- Message edit / delete (own messages)
- System messages for join / leave / ban / unban events
- Unread count badges per community

**Community Settings (gear icon → separate settings page)**
- ✏️ Pencil icon top-right to edit: name, description, bio, emoji/image icon, public/private toggle
- **Four icon action buttons:**
  - 👥 **Members** — full searchable member list in popup modal; promote to admin (with custom permissions modal), revoke admin, remove member, ban member
  - ➕ **Add** — add your connections directly from popup modal
  - 🛡️ **Banned** — view banned users + unban from popup modal
  - 🔔 **Requests** — approve/decline join requests in popup modal (private communities only); badge shows live pending count
- Share invite link button
- Delete community (owner) / Leave community (member)

**Admin Permissions System**
- When promoting a member to admin, a modal lets owner select granular permissions:
  - Remove Users
  - Change Channel Info
  - Ban Users
  - Add Subscribers
  - Manage Messages
- Permissions stored as JSONB on `group_members` table
- NULL = full legacy permissions (owner / original admins)
- Permission enforcement on all admin actions (remove, ban, etc.)

---

### `/profile` — Own Profile
- Edit name (24-hour change cooldown enforced), bio, location, skills, current project, social links (GitHub, website, Twitter), startup stage
- Avatar photo upload (JPG/PNG/WebP/GIF); auto-initials circle if no photo — **initials update instantly when name changes**
- Open to collaborate toggle (visible to others)
- Stats tiles: Posts count / Collab Posts count / Connections count (accepted only — pending requests excluded)
- Tab views: Posts, Collab Posts, Connections list, Saved Posts, Saved Collabs
- Password change
- Account deletion (7-day soft-delete with recovery window)

### `/profile/:id` — Other User's Profile
- View their posts, collabs, skills, bio, social links
- Connect / disconnect button
- Block / unblock, report user
- Connection count shows accepted connections only

---

### `/notifications`
- Real-time notifications for: likes, comments, connection requests accepted, community join approved/rejected, mentions, ban/unban events
- Mark individual or all as read

---

### `/setup` — Profile Setup
- Onboarding flow for new users: name, avatar, location, skills, role, startup stage
- Blocks access to rest of app until complete

---

## Security & Moderation

- **Content moderation** on all post/collab creation (keyword-based check)
- **Block system** — bidirectional, cached in localStorage + `blocks` DB table; blocked users' content hidden everywhere
- **Report system** — posts, collabs, comments, users → stored in `reports` table with status workflow
- **Soft-delete** — 7-day grace period with account recovery; after 7 days auto-purged
- **Admin role** — verified blue badge, platform-level moderation access
- **CORS** — all methods (GET, POST, PUT, DELETE, PATCH) properly configured
- **Row Level Security** on all Supabase tables

---

## Database Tables

| Table | Purpose |
|---|---|
| profiles | User data, skills, avatar, last_active |
| posts | Feed posts with tags, likes, comment count |
| collabs | Co-founder posts with role, skills, location |
| connections | status: pending / accepted |
| post_likes | Many-to-many likes |
| saved_posts / saved_collabs | Bookmarks |
| collab_interests | "I'm Interested" on collabs |
| comments | Threaded comments on posts |
| notifications | All notification types |
| messages | DMs with media support |
| blocks | Bidirectional block pairs |
| reports | Reports with status workflow |
| groups | Communities (name, topic, visibility, emoji) |
| group_members | Members with role (member/admin/owner) + permissions JSONB |
| group_messages | Chat messages + is_system flag |
| group_join_requests | Pending/accepted/rejected join requests |
| videos | HLS transcoded video metadata |
| hidden_conversations | Per-user hidden DM list |

---

## Core Architecture Patterns

- **Optimistic UI** — likes, joins, interests, connection requests update instantly with rollback on error
- **Stale cache** — all feeds load from localStorage instantly, then refresh from API in background
- **Infinite scroll** — all feeds auto-paginate via IntersectionObserver
- **Realtime** — Supabase Realtime channels for community chat + join requests
- **Rules of Hooks** — all useMemo/useEffect before any early returns (fixed previously)
- **Click-lock via useRef<Set>** — prevents double-submit spam without async state
- **Graceful degradation** — DB queries fall back when optional columns don't exist yet

---

## Migrations Requiring Manual Run on Supabase

| File | What it does |
|---|---|
| `033_admin_permissions.sql` | Adds `permissions` JSONB column to `group_members` |
| `034_last_active.sql` | Adds `last_active` timestamptz column to `profiles` |

---

## Core Mission

Build a platform where **indie developers and startup founders** can:

1. **Find co-founders** that genuinely match their needs (smart skill-based matching, no fake relevance)
2. **Build in public** through a clean posts feed
3. **Collaborate** inside niche communities with real-time chat
4. **Connect directly** without cold outreach friction
5. **Discover** like-minded builders globally or nearby

The goal is to replace scattered Discord servers, cold LinkedIn messages, and generic job boards with **one focused, relevant, and always-fresh platform** built specifically for early-stage builders.
