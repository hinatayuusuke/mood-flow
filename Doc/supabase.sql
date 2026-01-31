-- MoodFlow: tasks table
-- Run this in the Supabase SQL editor.

create extension if not exists "pgcrypto";

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  estimated_time integer,
  energy_level integer,
  is_completed boolean not null default false,
  created_at timestamptz not null default now()
);

