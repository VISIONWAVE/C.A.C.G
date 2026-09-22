/**
 * POST /api/book-appointment
 * Body: { requested_date, requested_time, topic, notes }
 * Header: Authorization: Bearer <supabase access_token>  (client sends this
 * from client.auth.getSession() — see prophetic/book.html)
 */

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Not signed in.' });
  }

  // Service-role client so we can both verify the token and write past RLS
  // after confirming the caller's identity ourselves.
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !user) {
    return res.status(401).json({ error: 'Session is invalid or expired.' });
  }

  // Must be an approved Prophetic School member to book.
  const { data: profileRows, error: profileErr } = await supabase
    .from('profiles')
    .select('status')
    .eq('id', user.id)
    .limit(1);

  if (profileErr) {
    return res.status(500).json({ error: 'Could not verify approval status.' });
  }
  const status = profileRows && profileRows[0] ? profileRows[0].status : 'pending';
  if (status !== 'approved') {
    return res.status(403).json({ error: 'Your account is not yet approved for booking.' });
  }

  const { requested_date, requested_time, topic, notes } = req.body || {};
  if (!requested_date || !requested_time) {
    return res.status(400).json({ error: 'Please choose a date and time.' });
  }

  try {
    const { data: row, error } = await supabase
      .from('appointments')
      .insert({
        user_id: user.id,
        requested_date,
        requested_time,
        topic: topic || null,
        notes: notes || null,
        status: 'pending'
      })
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({ success: true, row });
  } catch (err) {
    console.error('book-appointment error:', err);
    return res.status(500).json({ error: err.message || 'Could not book the appointment.' });
  }
}
