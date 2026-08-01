#!/usr/bin/env bash
set -euo pipefail

EXPECTED_SHA="${1:-}"
UI_BASE="${UI_BASE:-https://ai-matchlab-ultra-ui-new.onrender.com}"
MAX_ATTEMPTS="${UI_VERIFY_MAX_ATTEMPTS:-60}"
SLEEP_SECONDS="${UI_VERIFY_POLL_SECONDS:-10}"

if ! [[ "$EXPECTED_SHA" =~ ^[0-9a-fA-F]{40}$ ]]; then
  echo "ERROR: expected 40-hex commit SHA" >&2
  exit 2
fi
UI_BASE="${UI_BASE%/}"
FILES=(
  index.html
  assets/js/ui/app.js
  assets/js/live/operational-day.js
  assets/js/live/date-nav-loader.js
  assets/js/live/fixtures-loader.js
  assets/js/live/value-adapter.js
  assets/js/live/odds-loader.js
  assets/js/live/live-overlay.js
  assets/js/ui/date-nav.js
  assets/js/ui/system-health.js
)

for file in "${FILES[@]}"; do
  [[ -f "$file" ]] || { echo "ERROR: local release file missing: $file" >&2; exit 2; }
done

for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
  all_match=true
  for file in "${FILES[@]}"; do
    tmp="$(mktemp)"
    code="$(curl -sS -L --connect-timeout 10 --max-time 30 -o "$tmp" -w '%{http_code}' "${UI_BASE}/${file}?release=${EXPECTED_SHA}-${attempt}" || true)"
    local_hash="$(sha256sum "$file" | awk '{print $1}')"
    remote_hash="$(sha256sum "$tmp" | awk '{print $1}')"
    rm -f "$tmp"
    if [[ "$code" != "200" || "$local_hash" != "$remote_hash" ]]; then
      all_match=false
      echo "UI_RELEASE_ATTEMPT=${attempt} FILE=${file} HTTP=${code} MATCH=false"
      break
    fi
  done

  if [[ "$all_match" == "true" ]]; then
    echo "UI_PUBLIC_RELEASE_VERIFIED=true"
    echo "UI_PUBLIC_RELEASE_SHA=${EXPECTED_SHA,,}"
    exit 0
  fi
  sleep "$SLEEP_SECONDS"
done

echo "ERROR: public UI files did not converge to ${EXPECTED_SHA,,}" >&2
exit 1
