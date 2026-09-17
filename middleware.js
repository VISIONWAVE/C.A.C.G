/**
 * VERCEL EDGE MIDDLEWARE — protects /prophetic/* and /admin/*
 * -----------------------------------------------------------
 * This runs on Vercel's edge network BEFORE the static file is served.
 * If there's no valid signed session cookie for the relevant area, the
 * request is redirected to that area's own login page instead of ever
 * reaching the protected page's content. This is a real server-side
 * gate — it cannot be bypassed by disabling JavaScript or viewing page
 * source, unlike a client-side-only hide.
 *
 * Two completely separate, independent login areas:
 *   /prophetic/*  — cookie "cacg_session",       env var AUTH_SECRET
 *   /admin/*      — cookie "cacg_admin_session", env var ADMIN_AUTH_SECRET
 * Each has its own password (checked in api/login.js / api/admin-login.js)
 * and its own signing secret — one being compromised never affects the other.
 */

export const config = {
  matcher: ['/prophetic/:path*', '/admin/:path*'],
};

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
    const valid = await isValidSession(
      cookieHeader,
      'cacg_session',
      'AUTH_SECRET',
      'cacg-fallback-secret-change-me'
    );
    if (!valid) {
      const loginUrl = new URL(`/login.html?redirect=${encodeURIComponent(pathname)}`, request.url);
      return Response.redirect(loginUrl, 302);
    }
    return; // valid prophetic session — let the request through
  }
}
