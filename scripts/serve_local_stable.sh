#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-5176}"
LOG_FILE="${LOG_FILE:-/tmp/yardvision-local-stable.log}"
RESTART_DELAY_SECONDS="${RESTART_DELAY_SECONDS:-2}"
BUILD_ON_START="${BUILD_ON_START:-1}"

child_pid=""

cleanup() {
  if [[ -n "${child_pid}" ]]; then
    kill "${child_pid}" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

if [[ "${BUILD_ON_START}" == "1" ]]; then
  echo "[local-stable] Building local-auth bundle..."
  npm run build:local
fi

echo "[local-stable] Starting supervised preview on http://${HOST}:${PORT}"
echo "[local-stable] Logs: ${LOG_FILE}"

while true; do
  VITE_ENABLE_DEV_AUTH_SHIM=1 node ./node_modules/vite/bin/vite.js preview \
    --host "${HOST}" \
    --port "${PORT}" \
    --strictPort \
    >>"${LOG_FILE}" 2>&1 &

  child_pid="$!"
  if wait "${child_pid}"; then
    exit_code=0
  else
    exit_code=$?
  fi

  echo "[local-stable] Preview exited with code ${exit_code}. Restarting in ${RESTART_DELAY_SECONDS}s..." | tee -a "${LOG_FILE}"
  child_pid=""
  sleep "${RESTART_DELAY_SECONDS}"
done
