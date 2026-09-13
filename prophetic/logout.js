/**
 * /api/logout — clears the session cookie, ending access to protected pages.
 */

module.exports = async function handler(req, res) {
  res.setHeader('Set-Cookie', 'cacg_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');
  return res.status(200).json({ success: true });
};
