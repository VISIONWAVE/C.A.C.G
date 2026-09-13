/**
 * VERCEL EDGE MIDDLEWARE — protects /prophetic-classes.html
 * -----------------------------------------------------------
 * This runs on Vercel's edge network BEFORE the static file is served.
 * If there's no valid signed session cookie, the request is redirected to
 * the login page instead of ever reaching the protected page's content.
 * This is a real server-side gate — it cannot be bypassed by disabling
 * JavaScript or viewing page source, unlike a client-side-only hide.
 *
 * Env vars used (set these in Vercel → Settings → Environment Variables):
 *   AUTH_SECRET — a long random string used to sign/verify session cookies.
 *                 Must be the SAME value used in api/login.js.
 */

export const config = {
  matcher: '/prophetic/:path*',
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

export default async function middleware(request) {
  const loginUrl = new URL(`/login.html?redirect=${encodeURIComponent(new URL(request.url).pathname)}`, request.url);

  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(/(?:^|;\s*)cacg_session=([^;]+)/);

  if (!match) {
    return Response.redirect(loginUrl, 302);
  }

  const cookieValue = decodeURIComponent(match[1]);
  const parts = cookieValue.split('.');
  if (parts.length !== 2) {
    return Response.redirect(loginUrl, 302);
  }

  const [expiryStr, signature] = parts;
  const expiry = Number(expiryStr);
  const secret = process.env.AUTH_SECRET || 'cacg-fallback-secret-change-me';

  const isNotExpired = Number.isFinite(expiry) && expiry > Date.now();
  const isSignatureValid = isNotExpired && (await verifySignature(expiryStr, signature, secret));

  if (!isSignatureValid) {
    return Response.redirect(loginUrl, 302);
  }

  // Valid session — let the request through to the actual protected page.
}
