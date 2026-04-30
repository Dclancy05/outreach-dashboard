#!/bin/bash
# Wraps the per-session command (claude / bash / etc.) under hard resource
# limits so one runaway terminal can't OOM the box and take down siblings.
#
# Strategy:
#   1. Prefer systemd-run --scope (cgroup-based MemoryMax + CPUQuota — the
#      kernel enforces; child processes can't escape).
#   2. Fall back to prlimit --as (virtual memory cap; respected by glibc
#      malloc but soft — child can lower).
#   3. If neither works, just exec the command and log a warning. The service
#      still works; sibling sessions just lose the OOM safety net.
#
# Defaults: 1 GB RAM, 200% CPU (= 2 cores).
# Override with env vars TERMINAL_MEM_LIMIT, TERMINAL_CPU_QUOTA.

set -euo pipefail

MEM_LIMIT="${TERMINAL_MEM_LIMIT:-1G}"
CPU_QUOTA="${TERMINAL_CPU_QUOTA:-200%}"

if [[ $# -eq 0 ]]; then
  echo "agent-bootstrap.sh: no command given" >&2
  exit 64
fi

# Path 1: systemd-run --scope (best — cgroup hard cap)
if command -v systemd-run >/dev/null 2>&1 && [[ -d /run/systemd/system ]]; then
  exec systemd-run \
    --scope \
    --quiet \
    --collect \
    --property="MemoryMax=$MEM_LIMIT" \
    --property="CPUQuota=$CPU_QUOTA" \
    --property="OOMScoreAdjust=500" \
    -- "$@"
fi

# Path 2: prlimit virtual memory cap (best-effort)
if command -v prlimit >/dev/null 2>&1 && command -v numfmt >/dev/null 2>&1; then
  MEM_BYTES=$(numfmt --from=iec "$MEM_LIMIT" 2>/dev/null || echo 1073741824)
  exec prlimit --as="$MEM_BYTES" -- "$@"
fi

# Path 3: no resource limits available — log + run unconfined.
echo "[agent-bootstrap] WARNING: neither systemd-run nor prlimit found — running unconfined" >&2
exec "$@"
