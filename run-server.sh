#!/usr/bin/env bash
set -euo pipefail

HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-3000}"
PUBLIC_FLAG="${PUBLIC_TUNNEL:-0}"

if [[ "$PUBLIC_FLAG" == "1" ]]; then
  python launcher.py --host "$HOST" --port "$PORT" --public
else
  python launcher.py --host "$HOST" --port "$PORT"
fi
