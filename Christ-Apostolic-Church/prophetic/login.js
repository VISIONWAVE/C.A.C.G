/**
 * /api/login — checks the submitted password and, if correct, issues a
 * signed, HttpOnly session cookie that middleware.js verifies on every
 * request to the protected page.
 *
 * Env vars used (set these in Vercel → Settings → Environment Variables):
 *   PROPHETIC_PASSWORD — the password required to view Prophetic Classes.
 *   AUTH_SECRET        — a long random string used to sign the session
 *                        cookie. Must be the SAME value used in middleware.js.
 */

const crypto = require('crypto');

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { password } = req.body || {};
  const CORRECT_PASSWORD = process.env.PROPHETIC_PASSWORD || 'VISIONWAVE';
  const SECRET = process.env.AUTH_SECRET || 'cacg-fallback-secret-change-me';

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
    `cacg_session=${cookieValue}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${sevenDaysMs / 1000}`
  );

  return res.status(200).json({ success: true });
};
