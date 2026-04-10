-- Migration 031 — Collab candidate location + Profile startup stage

-- Add preferred candidate location to collabs
alter table public.collabs
  add column if not exists candidate_location text;

-- Add startup stage to profiles
alter table public.profiles
  add column if not exists startup_stage text
    check (startup_stage in ('Ideation', 'MVP', 'Traction', 'Scaling', 'None'));
