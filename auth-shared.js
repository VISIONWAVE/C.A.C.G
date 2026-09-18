/**
 * auth-shared.js
 * ----------------
 * Creates the ONE Supabase client used for sign-in/sign-up/sign-out across
 * the whole site (login.html, reset-password.html, and the logout button
 * on every /prophetic/ page).
 *
 * Why not just use Supabase's default session storage? By default
 * supabase-js keeps the session in the browser's localStorage — which
 * only the browser can read. middleware.js runs on Vercel's Edge network,
 * BEFORE any page loads, and has no access to localStorage at all. For
 * middleware to actually gate /prophetic/* pages server-side (the whole
 * point — a real gate that can't be bypassed by viewing page source),
 * the session has to live somewhere the server can read it too: a cookie.
 *
 * So this file swaps in a small custom `storage` adapter that keeps the
 * session in a cookie instead. Everything else about supabase-js's
 * behavior (auto-refresh, sign-in, sign-out) works exactly the same.
 *
 * Security note: this cookie can NOT be marked HttpOnly, because
 * supabase-js itself (running in the browser) needs to read and write it.
 * That means it's readable by any script running on the page, same as
 * Supabase's own default localStorage-based session — this isn't a new
 * risk, just a cookie-shaped version of the same trade-off every
 * client-side auth session has. The real protection is Row Level
 * Security on the database tables, not hiding this token.
 */

const CACG_AUTH_COOKIE = 'sb-session';
const CACG_SUPABASE_URL = 'https://ergfvcminlpolxyirhff.supabase.co';
const CACG_SUPABASE_KEY = 'sb_publishable_NCTFg53pQ4EC0I1vb0IasQ_Cu85Y3qC';

function cacgCookieStorage() {
  return {
    getItem(_key) {
      const match = document.cookie.match(new RegExp('(?:^|; )' + CACG_AUTH_COOKIE + '=([^;]*)'));
      if (!match) return null;
      try {
        return decodeURIComponent(match[1]);
      } catch {
        return null;
      }
    },
    setItem(_key, value) {
      const maxAge = 60 * 60 * 24 * 7; // 7 days — supabase-js auto-refreshes the token inside this window
      document.cookie = `${CACG_AUTH_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax; Secure`;
    },
    removeItem(_key) {
      document.cookie = `${CACG_AUTH_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax; Secure`;
    },
  };
}

function cacgCreateAuthClient() {
  if (typeof window.supabase === 'undefined') {
    throw new Error('Could not connect — please check your internet connection and try again.');
  }
  return window.supabase.createClient(CACG_SUPABASE_URL, CACG_SUPABASE_KEY, {
    auth: {
      storage: cacgCookieStorage(),
      storageKey: CACG_AUTH_COOKIE,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true, // required for the Google OAuth redirect back to work
    },
  });
}
