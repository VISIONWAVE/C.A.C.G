/**
 * /api/book-appointment — lets anyone with an approved Prophetic account
 * request an appointment day. Protected by the real Supabase session
 * cookie ("sb-session", written by auth-shared.js) — same JWT-verification
 * approach as middleware.js's handleProphetic(), so this endpoint can't be
 * called by someone who never actually logged in through the real system.
 *
 * Env vars used:
 *   SUPABASE_JWT_SECRET        — verifies the session JWT (same one middleware.js uses)
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  — appointments has no public write policy, on purpose
 */

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

function base64urlToBuffer(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(str.length + ((4 - (str.length % 4)) % 4), '=');
  return Buffer.from(padded, 'base64');
}

/** Verifies a Supabase Auth JWT (HS256) and returns its payload, or null. */
function verifySupabaseJwt(accessToken) {
  if (!accessToken) return null;
  const parts = accessToken.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signatureB64] = parts;

  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    console.error('SUPABASE_JWT_SECRET is not set — cannot verify session.');
    return null;
  }

  const expectedSig = crypto.createHmac('sha256', secret).update(`${headerB64}.${payloadB64}`).digest();
  const actualSig = base64urlToBuffer(signatureB64);
  if (expectedSig.length !== actualSig.length || !crypto.timingSafeEqual(expectedSig, actualSig)) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(base64urlToBuffer(payloadB64).toString('utf8'));
  } catch {
    return null;
  }

  if (!payload.exp || Date.now() >= payload.exp * 1000) return null; // exp is in seconds
  return payload;
}

/** Reads the "sb-session" cookie (the full supabase-js session object,
 *  JSON-stringified by auth-shared.js) and returns its access_token. */
function readSupabaseSessionCookie(cookieHeader) {
  const match = cookieHeader.match(/(?:^|;\s*)sb-session=([^;]+)/);
  if (!match) return null;
  try {
    const session = JSON.parse(decodeURIComponent(match[1]));
    return session && session.access_token ? session.access_token : null;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cookieHeader = req.headers.cookie || '';
  const accessToken = readSupabaseSessionCookie(cookieHeader);
  const claims = verifySupabaseJwt(accessToken);

  if (!claims) {
    return res.status(401).json({ error: 'Not logged in.' });
  }

  const { name, contact, requested_date, message } = req.body || {};

  if (!name || !contact || !requested_date) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { error } = await supabase.from('appointments').insert({
      name,
      contact,
      requested_date,
      message: message || '',
      user_id: claims.sub,      // links the request back to who's actually logged in
      user_email: claims.email,
    });
    if (error) throw error;
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('book-appointment error:', err);
    return res.status(500).json({ error: 'Could not save your request.' });
  }
}
