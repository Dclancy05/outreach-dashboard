# VPS scripts

These scripts live on the VPS (`srv1197943`) and aren't deployed to Vercel. They're version-controlled here so the VPS can be rebuilt from scratch if it ever dies.

| File | Lives at on VPS | Purpose |
|---|---|---|
| `parse-session.ts` | `/root/services/parse-session.ts` | Convert a Claude Code session JSONL into a clean markdown transcript with credential redaction. Writes to `/root/memory-vault/Conversations/<date>-<short_id>-transcript.md`. |
| `checkpoint-active-session.sh` | `/root/services/checkpoint-active-session.sh` | Wrapper called by the systemd timer. Picks the most recently active JSONL (modified in last hour) and runs the parser on it. |
| `systemd/session-checkpoint.service` | `/etc/systemd/system/session-checkpoint.service` | One-shot systemd service that runs the checkpoint script. |
| `systemd/session-checkpoint.timer` | `/etc/systemd/system/session-checkpoint.timer` | Runs the service every 5 minutes (safety net for missed SessionEnd hooks). |

## When does the transcript get written?

1. **On session end (immediate):** the `.claude/session-end.sh` hook calls `parse-session.ts` directly. Fires when you type `/exit`, `/clear`, Ctrl-D, etc.
2. **Every 5 minutes (safety net):** the systemd timer re-runs the parser on whatever JSONL was most recently modified. Catches cases where SessionEnd doesn't fire (e.g., terminal force-killed). Worst case: you lose the last ~5 minutes of conversation.

The output filename is deterministic (`<date>-<short_id>-transcript.md`) so re-runs overwrite the same file in place — no duplicates.

## Install on a fresh VPS

```bash
sudo cp scripts/ai-vps/parse-session.ts /root/services/parse-session.ts
sudo cp scripts/ai-vps/checkpoint-active-session.sh /root/services/checkpoint-active-session.sh
sudo chmod +x /root/services/parse-session.ts /root/services/checkpoint-active-session.sh
sudo cp scripts/ai-vps/systemd/session-checkpoint.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now session-checkpoint.timer
```

## Manual one-off transcript

```bash
/root/services/checkpoint-active-session.sh
# or for a specific session ID:
bun /root/services/parse-session.ts <session_id>
```

## Credential redaction

`parse-session.ts` redacts strings matching common credential patterns BEFORE writing the markdown. Patterns:

- `ghp_*` (GitHub PATs)
- `sk-ant-*`, `sk-proj-*`, `sk-*` (Anthropic + OpenAI keys)
- `sb_secret_*`, `sb_publishable_*` (Supabase keys)
- JWTs (`eyJ*.*.* `)
- 64-char hex tokens
- bcrypt hashes

Edit `REDACT_PATTERNS` in `parse-session.ts` to add more.
