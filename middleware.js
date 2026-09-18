/**
 * VERCEL EDGE MIDDLEWARE — protects /prophetic/* and /admin/*
 * -----------------------------------------------------------
 * This runs on Vercel's edge network BEFORE the static file is served.
 * If there's no valid session for the relevant area, the request is
 * redirected to that area's own login page instead of ever reaching the
 * protected page's content. This is a real server-side gate — it cannot
 * be bypassed by disabling JavaScript or viewing page source, unlike a
 * client-side-only hide.
 *
 * Two completely separate, independent login areas:
 *
 *   /admin/*      — the Content Admin dashboard. Unchanged: still a single
 *                    shared password, cookie "cacg_admin_session", env var
 *                    ADMIN_AUTH_SECRET. See admin-login.html / api/admin-login.js.
 *
 *   /prophetic/*  — Prophetic School. Now backed by real Supabase Auth
 *                    accounts (email/password or Google) plus an approval
 *                    step — see admin-setup/auth-schema.sql and login.html.
 *                    The session is a normal Supabase JWT, stored in a
 *                    cookie named "sb-session" by auth-shared.js (Supabase's
 *                    own default is localStorage, which this Edge function
 *                    can't read — see the comment at the top of
 *                    auth-shared.js for why that had to change).
 *
 * Env vars used:
 *   ADMIN_AUTH_SECRET     — signs the /admin/* session cookie (unchanged).
 *   SUPABASE_JWT_SECRET   — verifies /prophetic/* Supabase session JWTs.
 *                           Find it in Supabase Dashboard -> Settings ->
 *                           API -> JWT Settings -> JWT Secret. This is
 *                           NOT the same as the publishable/anon key.
 *   ADMIN_EMAILS           — comma-separated emails that always count as
 *                           approved for /prophetic/*, even before anyone
 *                           manually approves them in Table Editor —
 *                           avoids an admin locking themselves out.
 */

export const config = {
  matcher: ['/prophetic/:path*', '/admin/:path*'],
};

const SUPABASE_URL = 'https://ergfvcminlpolxyirhff.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_NCTFg53pQ4EC0I1vb0IasQ_Cu85Y3qC';

async function verifySignature(payload, signatureHex, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  const expectedHex = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return expectedHex === signatureHex;
}

async function isValidSession(cookieHeader, cookieName, secretEnvVar, fallbackSecret) {
  const pattern = new RegExp(`(?:^|;\\s*)${cookieName}=([^;]+)`);
  const match = cookieHeader.match(pattern);
  if (!match) return false;

  const cookieValue = decodeURIComponent(match[1]);
  const parts = cookieValue.split('.');
  if (parts.length !== 2) return false;

  const [expiryStr, signature] = parts;
  const expiry = Number(expiryStr);
  const secret = process.env[secretEnvVar] || fallbackSecret;

  const isNotExpired = Number.isFinite(expiry) && expiry > Date.now();
  return isNotExpired && (await verifySignature(expiryStr, signature, secret));
}

function base64urlToBytes(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(str.length + ((4 - (str.length % 4)) % 4), '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function base64urlDecodeToString(str) {
  return new TextDecoder().decode(base64urlToBytes(str));
}

/** Verifies a Supabase Auth JWT (HS256) and returns its payload
 *  ({ sub, email, exp, ... }), or null if missing/invalid/expired. */
async function verifySupabaseJwt(accessToken) {
  if (!accessToken) return null;
  const parts = accessToken.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signatureB64] = parts;

  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    // Misconfiguration — fail closed (treat as unauthenticated) rather than
    // silently trusting an unverifiable token.
    console.error('SUPABASE_JWT_SECRET is not set — cannot verify /prophetic/ sessions.');
    return null;
  }

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const signingInput = enc.encode(`${headerB64}.${payloadB64}`);
  const signatureBytes = base64urlToBytes(signatureB64);
  const isValid = await crypto.subtle.verify('HMAC', key, signatureBytes, signingInput);
  if (!isValid) return null;

  let payload;
  try {
    payload = JSON.parse(base64urlDecodeToString(payloadB64));
  } catch {
    return null;
  }

  if (!payload.exp || Date.now() >= payload.exp * 1000) return null; // Supabase's exp is in seconds, not ms
  return payload;
}

function isAdminEmail(email) {
  const admins = (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  return !!email && admins.includes(String(email).toLowerCase());
}

/** Reads the "sb-session" cookie (written by auth-shared.js — the full
 *  supabase-js session object, JSON-stringified) and returns its
 *  access_token, or null if the cookie is missing/malformed. */
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

async function handleProphetic(request, pathname, cookieHeader) {
  const loginUrl = new URL(`/login.html?redirect=${encodeURIComponent(pathname)}`, request.url);
  const pendingUrl = new URL('/prophetic/pending.html', request.url);

  const accessToken = readSupabaseSessionCookie(cookieHeader);
  const claims = await verifySupabaseJwt(accessToken);

  if (!claims) {
    return Response.redirect(loginUrl, 302);
  }

  // pending.html itself is reachable by anyone with a valid session,
  // whatever their status — the page shows them exactly what that status
  // is. Everything else under /prophetic/ requires "approved".
  if (pathname === '/prophetic/pending.html') {
    return;
  }

  if (isAdminEmail(claims.email)) {
    return; // admins always get straight in, no need to wait on their own approval row
  }

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${claims.sub}&select=status`,
      { headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${accessToken}` } }
    );
    const rows = await res.json();
    const status = rows && rows[0] ? rows[0].status : 'pending';
    if (status !== 'approved') {
      return Response.redirect(pendingUrl, 302);
    }
  } catch (err) {
    console.error('Could not check profiles.status:', err);
    return Response.redirect(pendingUrl, 302); // fail closed
  }

  // Valid session, approved (or admin) — let the request through.
}

export default async function middleware(request) {
  const pathname = new URL(request.url).pathname;
  const cookieHeader = request.headers.get('cookie') || '';

  if (pathname.startsWith('/admin')) {
    const valid = await isValidSession(
      cookieHeader,
      'cacg_admin_session',
      'ADMIN_AUTH_SECRET',
      'cacg-admin-fallback-secret-change-me'
    );
    if (!valid) {
      const loginUrl = new URL(`/admin-login.html?redirect=${encodeURIComponent(pathname)}`, request.url);
      return Response.redirect(loginUrl, 302);
    }
    return; // valid admin session — let the request through
  }

  if (pathname.startsWith('/prophetic')) {
    return handleProphetic(request, pathname, cookieHeader);
  }
}
