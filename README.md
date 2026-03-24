# Prolifier — Setup Guide

## Quick Start

```bash
npm install
npm run dev
```

## Supabase Setup (IMPORTANT — do this first)

### 1. Run the database migration

1. Go to Supabase dashboard → SQL Editor
2. Click New query
3. Copy everything from supabase/migrations/001_initial_schema.sql
4. Paste and click Run

This creates all tables, RLS policies, triggers, and storage buckets.

### 2. Enable Email auth

1. Go to Authentication → Providers
2. Make sure Email is enabled
3. Turn off "Confirm email" during development (optional)

### 3. Enable Google OAuth (optional for now)

1. Authentication → Providers → Google → Toggle on
2. Add your Google Client ID and Secret
3. Add this to Google OAuth redirect URIs:
   https://hulwdiqmcnhquxqnpdzr.supabase.co/auth/v1/callback

## Project Structure

```
prolifier-v8/
├── src/
│   ├── lib/
│   │   ├── supabase.ts           Supabase client
│   │   └── database.types.ts     TypeScript DB types
│   ├── context/
│   │   ├── UserContext.tsx        Auth + user state
│   │   └── ThemeContext.tsx       Dark/light mode
│   ├── pages/                    All app pages
│   └── components/               Layout + UI
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql  Run this in SQL Editor
├── server/
│   └── functions/                Edge functions (future)
└── .env                          Supabase keys
```

## What is connected to Supabase

- Auth: email/password signup, login, Google OAuth
- Protected routes: unauthenticated users go to login
- Profiles: saved to database on setup completion
- Profile edits: synced to Supabase instantly
- Sign out: full session cleanup

## What is still mock data (next steps)

- Posts and collabs
- Direct messages with Realtime
- Groups and group chat
- Notifications
- File uploads to Supabase Storage
