-- PLAN A VISIT — allow the public form to save a booking request.
-- Run this once in the Supabase SQL Editor.
--
-- appointments already exists (from add-video-tables.sql) with RLS
-- enabled and NO policies at all — meaning right now, nothing can be
-- inserted into it via the publishable key. This is why "Plan a Visit"
-- only ever sent a WhatsApp message and never actually saved a record
-- anywhere the media team could see later.
--
-- Same safety pattern as the sermons/events/ministries submission
-- policies: the public can insert, but ONLY with status = 'pending' —
-- enforced by the database itself, not just the form. Nobody can submit
-- a booking that's already "confirmed". Only the admin dashboard
-- (service role key, bypasses RLS) can read the list or change status.

create policy "Public can submit a pending visit request" on appointments
  for insert
  with check (status = 'pending');
