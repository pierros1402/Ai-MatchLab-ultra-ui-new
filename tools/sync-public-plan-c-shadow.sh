#!/usr/bin/env bash
set -euo pipefail

DAY_KEY="${1:-}"
REF="${2:-}"
ENGINE_BASE="${ENGINE_BASE:-https://ai-matchlab-engine.onrender.com}"
CRON_SECRET="${CRON_SECRET:-}"
MAX_ATTEMPTS="${PLAN_C_SYNC_MAX_ATTEMPTS:-60}"
SLEEP_SECONDS="${PLAN_C_SYNC_POLL_SECONDS:-5}"

if ! [[ "$DAY_KEY" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  echo "ERROR: invalid day key: $DAY_KEY" >&2
  exit 2
fi
if ! [[ "$REF" =~ ^[0-9a-fA-F]{40}$ ]]; then
  echo "ERROR: immutable 40-hex Git ref required" >&2
  exit 2
fi
if [[ -z "$CRON_SECRET" ]]; then
  echo "ERROR: CRON_SECRET is required" >&2
  exit 2
fi

ENGINE_BASE="${ENGINE_BASE%/}"
START_RESPONSE="$(curl -fsS --connect-timeout 20 --max-time 300 -X POST -H "X-Cron-Secret: ${CRON_SECRET}" "${ENGINE_BASE}/ops/sync-plan-c-shadow?date=${DAY_KEY}&ref=${REF}")"
JOB_ID="$(printf '%s' "$START_RESPONSE" | node -e '
let raw=""; process.stdin.on("data", c => raw += c); process.stdin.on("end", () => {
  const x=JSON.parse(raw); if(!x?.ok || !x?.job?.id) process.exit(2); process.stdout.write(String(x.job.id));
});')"

FINAL_RESPONSE=""
for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
  FINAL_RESPONSE="$(curl -fsS --connect-timeout 10 --max-time 20 -H "X-Cron-Secret: ${CRON_SECRET}" "${ENGINE_BASE}/ops/sync-plan-c-shadow/status?id=$(node -p 'encodeURIComponent(process.argv[1])' "$JOB_ID")")"
  STATUS="$(printf '%s' "$FINAL_RESPONSE" | node -e 'let r="";process.stdin.on("data",c=>r+=c);process.stdin.on("end",()=>process.stdout.write(String(JSON.parse(r)?.job?.status||"unknown")));')"
  echo "PLAN_C_SYNC_ATTEMPT=${attempt} STATUS=${STATUS}"
  case "$STATUS" in
    succeeded) break ;;
    failed) printf '%s\n' "$FINAL_RESPONSE"; exit 1 ;;
  esac
  if [[ "$attempt" -eq "$MAX_ATTEMPTS" ]]; then
    echo "ERROR: Plan C shadow sync did not finish in time" >&2
    exit 1
  fi
  sleep "$SLEEP_SECONDS"
done

RESULT="$(printf '%s' "$FINAL_RESPONSE" | node -e '
let r="";process.stdin.on("data",c=>r+=c);process.stdin.on("end",()=>{
  const x=JSON.parse(r)?.job?.result||{};
  if(x.ok!==true || x.dayKey!==process.argv[1] || x.ref!==process.argv[2].toLowerCase() || x.productionEligible!==false) process.exit(2);
  process.stdout.write([x.payloadSha256,x.count,x.pickCount].join("\t"));
});' "$DAY_KEY" "$REF")"
IFS=$'\t' read -r PAYLOAD_SHA COUNT PICK_COUNT <<< "$RESULT"
if ! [[ "$PAYLOAD_SHA" =~ ^[0-9a-f]{64}$ ]]; then
  echo "ERROR: invalid synchronized Plan C hash" >&2
  exit 1
fi

PUBLIC="$(curl -fsS --connect-timeout 20 --max-time 45 "${ENGINE_BASE}/plan-c-shadow?date=${DAY_KEY}")"
printf '%s' "$PUBLIC" | node -e '
let r="";process.stdin.on("data",c=>r+=c);process.stdin.on("end",()=>{
  const x=JSON.parse(r);
  if(x?.ok!==true || x?.available!==true || x?.mode!=="SHADOW" || x?.productionEligible!==false || x?.date!==process.argv[1] || x?.count!==Number(process.argv[2]) || x?.pickCount!==Number(process.argv[3])) process.exit(2);
});' "$DAY_KEY" "$COUNT" "$PICK_COUNT"

echo "PLAN_C_SHADOW_SYNC_VERIFIED=true"
echo "PLAN_C_SHADOW_SYNC_DAY=${DAY_KEY}"
echo "PLAN_C_SHADOW_SYNC_REF=${REF,,}"
echo "PLAN_C_SHADOW_SYNC_PAYLOAD_SHA256=${PAYLOAD_SHA}"
