# push-worker

Cloudflare Worker that relays daily "wake up" push notifications to the
Panchanga PWA. See `CLAUDE.md` in the repo root for the full design rationale.

## One-time setup

1. **Generate a VAPID keypair** (needs Node + `web-push` installed once, not
   committed to the repo):
   ```
   npx web-push generate-vapid-keys
   ```
   This gives you a base64url public key and private key.

2. **Convert the private key to JWK**, since this Worker signs with the
   Web Crypto API (no `nodejs_compat` needed). Easiest path: use any
   "VAPID key to JWK" conversion snippet, or generate directly in JWK form:
   ```js
   const keyPair = await crypto.subtle.generateKey(
     { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']
   );
   const privateJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
   const publicRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey);
   // publicRaw, base64url-encoded, is your VAPID_PUBLIC_KEY.
   // JSON.stringify(privateJwk) is your VAPID_PRIVATE_KEY_JWK secret.
   ```

3. **Create the KV namespace** and paste the id into `wrangler.toml`:
   ```
   wrangler kv namespace create SUBSCRIPTIONS
   ```

4. **Set secrets:**
   ```
   wrangler secret put VAPID_PRIVATE_KEY_JWK   # paste the JWK JSON string
   wrangler secret put VAPID_PUBLIC_KEY        # base64url public key
   wrangler secret put VAPID_SUBJECT           # e.g. mailto:you@example.com
   wrangler secret put ALLOWED_ORIGIN          # e.g. https://hgharsha.github.io
   ```

5. **Deploy:**
   ```
   wrangler deploy
   ```

6. **Wire up the client:** in `panchanga-pwa/index.html`, set
   `PUSH_WORKER_URL` to your deployed Worker URL and `VAPID_PUBLIC_KEY` to the
   same public key from step 2.

## Testing

- Trigger the cron manually from the Cloudflare dashboard (Workers & Pages →
  your worker → Triggers → Cron Triggers → "Trigger") or `wrangler dev` +
  hit `/__scheduled` locally.
- `wrangler tail` to watch subscribe/unsubscribe requests and cron runs live.
