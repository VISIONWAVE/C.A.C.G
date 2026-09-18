-- RECORDINGS: uploaded after a live session ends
create table recordings (
  id bigint generated always as identity primary key,
  created_at timestamptz default now(),
  title text not null,
  session_type text not null, -- 'bible_study' or 'prophetic'
  session_date date,
  video_url text,
  published boolean default false
);

-- APPOINTMENTS: booking requests for a 1-on-1 Prophetic session
create table appointments (
  id bigint generated always as identity primary key,
  created_at timestamptz default now(),
  name text not null,
  contact text,
  requested_date date,
  message text,
  status text default 'pending' -- 'pending', 'confirmed', 'declined'
);

alter table recordings enable row level security;
alter table appointments enable row level security;

create policy "Public can read published recordings" on recordings for select using (published = true);
-- No public read policy on appointments — only the admin dashboard (service role key) can see booking requests
