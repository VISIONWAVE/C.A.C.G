/**
 * /api/admin-login — checks the admin password and issues a signed,
 * HttpOnly session cookie SEPARATE from the Prophetic Classes login
 * (different cookie name, different password, different secret).
 *
 * Env vars used:
 *   ADMIN_PASSWORD     — the password for the content admin dashboard
 *   ADMIN_AUTH_SECRET  — signs the session cookie (must match api/admin/content.js and middleware.js)
 */

import crypto from 'crypto';

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { password } = req.body || {};
  const CORRECT_PASSWORD = process.env.ADMIN_PASSWORD || 'VISIONWAVE0562';
  const SECRET = process.env.ADMIN_AUTH_SECRET || 'cacg-admin-fallback-secret-change-me';

  if (!password || password !== CORRECT_PASSWORD) {
    return res.status(401).json({ error: 'Incorrect password.' });
  }

  const sevenDaysMs = 1000 * 60 * 60 * 24 * 7;
  const expiry = Date.now() + sevenDaysMs;
  const payload = String(expiry);
  const signature = sign(payload, SECRET);
  const cookieValue = encodeURIComponent(`${payload}.${signature}`);

  res.setHeader(
    'Set-Cookie',
    `cacg_admin_session=${cookieValue}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${sevenDaysMs / 1000}`
  );

  return res.status(200).json({ success: true });
}
