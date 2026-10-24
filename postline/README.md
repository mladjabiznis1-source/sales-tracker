# Postline

A small LinkedIn scheduler for one person, running on Cloudflare's free tier, that Claude can control over MCP.

- **Cloudflare Worker**: the MCP server, the OAuth pages and the status page, all on one Worker.
- **Cron Trigger**: runs every minute and publishes posts that are due.
- **D1**: stores posts, queue slots, settings and the encrypted LinkedIn token.
- **KV**: the MCP OAuth server's own storage, plus short-lived state for the LinkedIn sign-in.

## How it behaves

| Status       | Meaning                                                                                  |
| ------------ | ---------------------------------------------------------------------------------------- |
| `draft`      | No date set. Never publishes.                                                            |
| `planned`    | Has a date but **will not publish** until you `confirm_post`.                            |
| `scheduled`  | Publishes automatically at `scheduled_at`.                                               |
| `publishing` | Internal lock while the LinkedIn call is in flight (usually under a second).             |
| `published`  | Live. `linkedin_post_url` links to it.                                                   |
| `error`      | Not published, or the outcome is unknown. `error_message` says which and what to do.     |

**Safety rules:**

- **Each post is published at most once.**
  - Before publishing, a single atomic `UPDATE … WHERE status='scheduled'` claims the post. Only the run that claims it calls LinkedIn.
  - Failures are never retried automatically.
  - If a call fails in a way that might still have posted (network error, LinkedIn 5xx, or the Worker dying mid-call), the post becomes `error` with **OUTCOME UNKNOWN**. Check your profile before you retry it.
- **Late posts aren't published.** A scheduled post that is more than 60 minutes overdue (for example after an outage) becomes `error`. Reschedule it yourself.
- **A planned post whose time has passed can't be confirmed.** Reschedule it or use `publish_now`.
- **`publish_now` requires `confirm=true`.** Its tool description tells Claude to show you the text and ask first.

**Times:**

- Times are stored in UTC.
- Queue slots are wall-clock times in the queue timezone (default `America/New_York`), so 12:00 stays 12:00 across DST changes.
- Times you type without an offset (`2026-11-03T12:00`) are read in the queue timezone.

**Text handling:**

- Reserved characters in LinkedIn's "little text format" are escaped automatically, so `(`, `*`, `_`, `@` and the rest show up as typed: `\ | { } @ [ ] ( ) < > # * _ ~`.
- `#hashtags` are turned into LinkedIn hashtag links.
- @mentions are not supported (they need LinkedIn URNs).
- Posts are limited to 3,000 characters.

---

## Setup (one time, about 20 minutes)

You need Node 22+, a free Cloudflare account and a LinkedIn account.

### 1. Install

```bash
cd postline
npm install
npx wrangler login
```

### 2. Create the Cloudflare resources

```bash
npx wrangler d1 create postline            # prints a database_id
npx wrangler kv namespace create OAUTH_KV  # prints an id
```

Paste both IDs into `wrangler.jsonc`, replacing the `REPLACE-WITH-…` placeholders.

### 3. Deploy once to get your URL

```bash
npm run db:migrate:remote
npx wrangler deploy
```

Wrangler prints a URL like `https://postline.<your-subdomain>.workers.dev`. Set `PUBLIC_URL` in `wrangler.jsonc` to that URL, with no trailing slash. Until you do, every request returns an error on purpose.

### 4. Create the LinkedIn app

1. Go to <https://www.linkedin.com/developers/apps> and click **Create app**.
2. Fill in:
   - **App name:** anything, e.g. "Postline".
   - **LinkedIn Page:** LinkedIn requires every app to be linked to a Company Page. If you don't have one, create a placeholder page first (*For Business → Create a Company Page*). Posts still go to **your personal profile**.
   - **Logo:** any square image.
3. Accept the terms and click **Create app**.
4. On the **Settings** tab, click **Verify** next to the page and follow the link as the page admin. This approves the app for the page.
5. On the **Products** tab, click **Request access** on **Sign In with LinkedIn using OpenID Connect** and on **Share on LinkedIn**. Both are self-serve and are usually approved instantly.
6. On the **Auth** tab:
   - Under **Authorized redirect URLs for your app**, add exactly `https://postline.<your-subdomain>.workers.dev/linkedin/callback`.
   - Under **OAuth 2.0 scopes**, check that `openid`, `profile` and `w_member_social` are listed.
   - Copy the **Client ID** and the **Primary Client Secret**.

### 5. Set the secrets

None of these go in the repo. Wrangler prompts for each value.

```bash
npx wrangler secret put LINKEDIN_CLIENT_ID
npx wrangler secret put LINKEDIN_CLIENT_SECRET
openssl rand -base64 32 | npx wrangler secret put TOKEN_ENCRYPTION_KEY
npx wrangler secret put ADMIN_PASSWORD  # 16+ characters; protects /status, /reauth and the MCP consent screen
```

Keep `ADMIN_PASSWORD` in your password manager. If you lose `TOKEN_ENCRYPTION_KEY`, set a new one and re-authorize LinkedIn.

Then redeploy so the new `PUBLIC_URL` takes effect:

```bash
npx wrangler deploy
```

### 6. Connect LinkedIn

1. Open `https://postline.<your-subdomain>.workers.dev/reauth`.
2. Log in with any username and your `ADMIN_PASSWORD`.
3. Approve on LinkedIn.

You should see "LinkedIn connected" with your name and the token's expiry date.

### 7. Add it to Claude as a custom connector

1. In Claude (web or desktop), go to **Settings → Connectors → Add custom connector**.
2. Enter:
   - **Name:** Postline
   - **URL:** `https://postline.<your-subdomain>.workers.dev/mcp`
   - Leave the OAuth client ID and secret blank. Claude registers itself automatically.
3. Click **Add**, then **Connect**. A Postline page opens.
4. Enter your `ADMIN_PASSWORD` and click **Allow**.
5. In a chat, enable the Postline connector and try "list my scheduled posts".

Connectors added on web or desktop also work in the mobile apps.

---

## Re-authorizing LinkedIn

- Self-serve LinkedIn apps get a **60-day access token and no refresh token**. LinkedIn only gives refresh tokens to approved Marketing Developer Platform partners.
- When fewer than 10 days remain, Postline warns you in `auth_status` and in red/amber on `/status`.
- To renew, open `/reauth` and approve again. It takes about 10 seconds, and posts already scheduled are unaffected.
- If LinkedIn ever does issue your app a refresh token, the cron job renews the access token automatically inside that 10-day window.
- If the token expires anyway, due posts become `error` with a re-authorize message instead of publishing late.

## The LinkedIn API version

`LINKEDIN_VERSION` in `wrangler.jsonc` is sent as the `Linkedin-Version` header.

- LinkedIn supports each monthly version for at least a year, then turns it off. After that, every post fails with HTTP 426.
- Bump it about once a year to a recent version from LinkedIn's versioning page (learn.microsoft.com → LinkedIn → Marketing → Versioning), then redeploy.

## Backing up the database

```bash
mkdir -p backups
npx wrangler d1 export postline --remote --output "backups/postline-$(date +%F).sql"
```

The export is plain SQL with your posts, slots and settings. LinkedIn tokens are only present encrypted, but treat the file as private anyway. `backups/` is git-ignored.

To restore into a fresh database:

```bash
npx wrangler d1 execute postline --remote --file backups/postline-YYYY-MM-DD.sql
```

D1 also keeps point-in-time history ("Time Travel"):

```bash
npx wrangler d1 time-travel info postline
npx wrangler d1 time-travel restore postline --timestamp <ISO time>
```

## Development

```bash
npm test             # Node's built-in test runner + node:sqlite running the real migration
npm run typecheck
cp .dev.vars.example .dev.vars   # fill in, PUBLIC_URL=http://localhost:8787
npm run db:migrate:local && npm run dev
curl "http://localhost:8787/cdn-cgi/handler/scheduled"   # fire the cron once (needs `wrangler dev --test-scheduled`)
```

What the tests cover:

- **Slot assignment:** next free slot, skipping taken and past slots, weekend rollover, local-vs-UTC day boundaries.
- **Timezones and DST:** transition days, the spring-forward gap, fall-back ambiguity, non-US zones.
- **No double publish:** overlapping cron runs, `publish_now` racing the cron, crash mid-publish, LinkedIn 5xx.
- **Token expiry:** the warning thresholds, encryption at rest, the refresh window.

## Free-tier budget

| Item            | Usage                                                                      |
| --------------- | -------------------------------------------------------------------------- |
| Cron            | 1 trigger, about 43,200 runs a month. Each run is 3 small D1 queries when nothing is due. |
| Workers free plan | 100,000 requests a day                                                   |
| D1 free plan    | 5 million row reads a day                                                  |
| Bundle size     | About 305 KB gzipped (the free limit is 3 MB)                              |
