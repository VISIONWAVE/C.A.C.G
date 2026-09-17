/**
 * /api/admin-logout — clears the admin session cookie.
 */

export default async function handler(req, res) {
  res.setHeader('Set-Cookie', 'cacg_admin_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');
  return res.status(200).json({ success: true });
}
