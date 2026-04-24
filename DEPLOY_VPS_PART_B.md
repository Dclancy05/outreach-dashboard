# Deploy Part B — Cookie Capture Endpoint

The dashboard already ships the full Part B pipeline. The one remaining
piece is deploying the updated VPS Manager so `GET /cookies/dump?platform=...`
returns real data instead of the current 502.

## What changed on the VPS side

The `GET /cookies/dump` endpoint was added to the VPS Manager (our local
copy lives at `/home/clawd/.openclaw/workspace/recording-service/server.js`).
It uses Chrome DevTools Protocol on port 18800 to snapshot the live cookie
jar, filters by platform domain, and opportunistically grabs localStorage
when the current tab is already on the platform origin.

The endpoint matches the exact response shape the dashboard expects:

```json
{
  "platform": "instagram",
  "cookies": [{ "name": "sessionid", "value": "...", "domain": ".instagram.com", ... }],
  "localStorage": { "key": "value" } | null,
  "capturedAt": "2026-04-24T..."
}
```

## Deploy steps (once SSH is back)

Run these from Dylan's local machine. They push the updated server to the
VPS and restart the service.

```bash
# 1. Copy the updated server code up
scp /home/clawd/.openclaw/workspace/recording-service/server.js \
  root@srv1197943.hstgr.cloud:/opt/recording-service/server.js

# 2. Restart the service
ssh root@srv1197943.hstgr.cloud "systemctl restart recording-service"

# 3. Smoke-test that /cookies/dump answers (not 404/502)
ssh root@srv1197943.hstgr.cloud "curl -s http://127.0.0.1:10000/cookies/dump?platform=instagram | head -c 400"
```

Expected smoke-test output (cookies array may be empty if nothing is
signed in yet, that's fine):

```json
{"platform":"instagram","cookies":[...],"localStorage":null,"capturedAt":"..."}
```

## Alternate deploy path (if service name differs)

If the VPS has the recording-service under a different systemd unit, list
it first:

```bash
ssh root@srv1197943.hstgr.cloud "systemctl list-units --type=service | grep -i record"
```

Most likely names: `recording-service`, `vnc-manager`, or `vps-manager`.

## After deploy — verify from the dashboard side

From any machine (no VPS SSH needed):

```bash
curl -s "https://outreach-github.vercel.app/api/platforms/cookies-dump?platform=instagram"
```

Before deploy: returns 502 with `{"ok":false,"status":502,"error":"VPS returned 404"}`.
After deploy: returns 200 with real cookie JSON (or a 200 with an empty
`cookies` array if nothing's signed in yet).

## Fallback while the VPS is offline

The login modal already ships a manual-paste escape. After three
consecutive 502s from the VPS during a single session, it reveals an
"I pasted cookies manually" textarea that accepts cookie JSON (or the
raw `name=value; name2=value2` header format). Pasted cookies go
straight into Supabase via `/api/accounts/:id/cookies/snapshot` and
the Connected badge flips just like after a successful capture.

## Database migration (already applied)

`migrations/20260424_cookie_snapshots_platform.sql` adds a nullable
`platform` column to `account_cookie_snapshots`. It was applied to
production Supabase on 2026-04-24. The snapshot API route writes this
column on every capture so per-platform queries don't have to guess
which social a snapshot belongs to.
