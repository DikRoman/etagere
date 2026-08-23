# Вход через VK ID

PocketBase’s built-in **VK** provider talks to classic `oauth.vk.com`. New apps from the [VK ID](https://id.vk.com/) console only speak **VK ID** (`id.vk.ru`) with PKCE. Étagère uses that flow and then creates a PocketBase session on the server.

## 1. VK ID application

1. Open [id.vk.com](https://id.vk.com/) → your app (or create a **Web** app).
2. Copy **App ID** and **Защищённый ключ** (secret).
3. In **Trusted redirect URL** add exactly:

```
https://etagere.ru/api/auth/vk/callback
```

4. Base domain / site URL should include `etagere.ru`.
5. Do **not** paste the OneTap / `@vkid/sdk` widget HTML into the site — the button on `/login` already starts the correct redirect.

## 2. Environment

On the VPS (and in local `.env.local` if you test against production redirects):

```bash
NEXT_PUBLIC_VK_CLIENT_ID=54722382
VK_CLIENT_SECRET=your_protected_key
```

`NEXT_PUBLIC_VK_CLIENT_ID` must be present at **build** time (`scripts/deploy-vps.sh` exports it).  
`VK_CLIENT_SECRET` is optional for public PKCE clients but recommended; it is also used as pepper for stable VK-linked passwords.

Rebuild / redeploy after changing `NEXT_PUBLIC_*`.

## 3. PocketBase

Deploy migrations (deploy script syncs `pb_migrations`). Migration `1740000003_vk_id.js` adds `users.vkId`.

No OAuth2 provider in PocketBase admin is required for this flow. You can disable the old classic VK provider to avoid confusion.

## 4. Flow

1. User clicks **Продолжить с VK** → `/api/auth/vk/start`
2. Redirect to `https://id.vk.ru/authorize` (PKCE)
3. VK returns to `/api/auth/vk/callback`
4. Server exchanges code, loads user info, upserts PocketBase user (`verified`, `vkId`)
5. Redirect to `/auth/vk/complete` → client saves the session → `/account`

## If it fails

| Symptom | Check |
|---------|--------|
| `Security Error` on old flow | You were still on classic `oauth.vk.com` — use this VK ID path after deploy |
| Immediate error on login | `NEXT_PUBLIC_VK_CLIENT_ID` missing from the build |
| Fail after VK consent | Redirect URI must match **byte-for-byte**; see server logs `[vk/callback]` |
| `OAUTH_UNAVAILABLE` | Client id not set |
| No email from VK | Account gets `vk{id}@users.etagere.ru`; ask for `email` scope in the app if needed |
