// Panchanga push relay — Cloudflare Worker.
//
// Deliberately dumb: stores nothing but anonymous Web Push subscription
// endpoints (no location, no watchlist, no personal data ever reaches this
// Worker) and, once a day via the Cron Trigger, sends every subscriber a
// content-free "wake up" push. Each device's own service worker (sw.js) does
// the actual panchanga computation and watchlist matching on-device, using
// the location + watchlist it already has in IndexedDB.
//
// Secrets required (wrangler secret put ...):
//   VAPID_PRIVATE_KEY_JWK  - JSON string of the ECDSA P-256 private key (JWK)
//   VAPID_PUBLIC_KEY       - base64url public key, must match the client's key
//   VAPID_SUBJECT          - e.g. "mailto:you@example.com"
//   ALLOWED_ORIGIN         - the PWA's origin, e.g. "https://hgharsha.github.io"

function corsHeaders(origin, allowedOrigin) {
  const headers = { 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
  if (origin === allowedOrigin) headers['Access-Control-Allow-Origin'] = allowedOrigin;
  return headers;
}

function base64urlToUint8Array(base64url) {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
  const raw = atob(padded);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
function uint8ArrayToBase64url(bytes) {
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function jsonToBase64url(obj) {
  return uint8ArrayToBase64url(new TextEncoder().encode(JSON.stringify(obj)));
}

async function importVapidPrivateKey(jwkString) {
  const jwk = JSON.parse(jwkString);
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

// Builds the VAPID Authorization header for a single push endpoint.
async function buildVapidAuthHeader(endpoint, env) {
  const endpointUrl = new URL(endpoint);
  const audience = `${endpointUrl.protocol}//${endpointUrl.host}`;
  const header = { typ: 'JWT', alg: 'ES256' };
  const payload = { aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT };
  const unsigned = `${jsonToBase64url(header)}.${jsonToBase64url(payload)}`;

  const privateKey = await importVapidPrivateKey(env.VAPID_PRIVATE_KEY_JWK);
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(unsigned)
  );
  const jwt = `${unsigned}.${uint8ArrayToBase64url(new Uint8Array(signature))}`;
  return `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`;
}

// Sends a content-free push (no payload, so no message encryption is needed).
async function sendWakePush(subscription, env) {
  const auth = await buildVapidAuthHeader(subscription.endpoint, env);
  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: { TTL: '86400', Authorization: auth, 'Content-Length': '0' }
  });
  return res;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const cors = corsHeaders(origin, env.ALLOWED_ORIGIN);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    if (url.pathname === '/subscribe' && request.method === 'POST') {
      const sub = await request.json().catch(() => null);
      if (!sub || !sub.endpoint || !sub.keys) {
        return new Response('Invalid subscription', { status: 400, headers: cors });
      }
      // Keyed by endpoint so re-subscribing (e.g. after browser rotation) just overwrites.
      await env.SUBSCRIPTIONS.put(sub.endpoint, JSON.stringify(sub));
      return new Response('OK', { status: 200, headers: cors });
    }

    if (url.pathname === '/unsubscribe' && request.method === 'POST') {
      const body = await request.json().catch(() => null);
      if (!body || !body.endpoint) {
        return new Response('Invalid request', { status: 400, headers: cors });
      }
      await env.SUBSCRIPTIONS.delete(body.endpoint);
      return new Response('OK', { status: 200, headers: cors });
    }

    return new Response('Not found', { status: 404, headers: cors });
  },

  // Daily Cron Trigger: ping every stored subscriber, prune dead ones.
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      const list = await env.SUBSCRIPTIONS.list();
      for (const key of list.keys) {
        const raw = await env.SUBSCRIPTIONS.get(key.name);
        if (!raw) continue;
        const sub = JSON.parse(raw);
        try {
          const res = await sendWakePush(sub, env);
          if (res.status === 404 || res.status === 410) {
            await env.SUBSCRIPTIONS.delete(key.name);
          }
        } catch (err) {
          // Network/signing errors: leave the subscription in place, try again tomorrow.
        }
      }
    })());
  }
};
