-- PROPHETIC SCHOOL — USER ACCOUNTS & APPROVAL
-- Run this once in the Supabase SQL Editor.
--
-- This builds on Supabase's own built-in Auth (auth.users) rather than a
-- separate hand-rolled accounts table — Supabase already handles password
-- hashing, email/password sign-in, Google OAuth, and password-reset email
-- sending securely. This file just adds the one thing Supabase Auth
-- doesn't have out of the box: an approval step, since not everyone who
-- creates an account should automatically get into Prophetic Classes.

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  status text not null default 'pending', -- 'pending' | 'approved' | 'rejected'
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- A signed-in user can read their own profile (so pending.html can show
-- their status), but can never edit it themselves — status changes only
-- happen from Table Editor, by an admin, same as the sermons/events/
-- ministries approval pattern already used elsewhere on this site.
create policy "Users can read their own profile" on profiles
  for select using (auth.uid() = id);

-- Auto-create a `profiles` row the moment someone signs up (via password
-- OR Google) so there's always exactly one row per account and nobody has
-- to remember to create it manually.
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    'pending'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ADMIN APPROVAL: use Supabase Table Editor -> profiles table -> change
-- a row's `status` to "approved" or "rejected", same as flipping
-- `published` on a sermon/event/ministry. No separate admin page needed.
