/**
 * GET /api/my-appointment
 * Header: Authorization: Bearer <supabase access_token>
 * Returns the caller's own appointments, most recent first.
 */

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Not signed in.' });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !user) {
    return res.status(401).json({ error: 'Session is invalid or expired.' });
  }

  try {
    const { data: rows, error } = await supabase
      .from('appointments')
      .select('*')
      .eq('user_id', user.id)
      .order('id', { ascending: false });

    if (error) throw error;

    return res.status(200).json({ success: true, rows });
  } catch (err) {
    console.error('my-appointment error:', err);
    return res.status(500).json({ error: err.message || 'Could not load your appointments.' });
  }
}
