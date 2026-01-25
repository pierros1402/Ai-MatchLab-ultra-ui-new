import os
import json
import time
import requests
from pathlib import Path
from typing import Dict, Any

# =====================================================
# AIMATCHLAB TEAM STATS → KV LOADER (HTTP)
# =====================================================
# Writes:
#   TEAM_STATS:SEASON:2025-2026
#   TEAM_STATS:INDEX
#
# KV Namespace: AIMATCHLAB_STATS
# Namespace ID: 830e99d5f21d4bb78a4ee13b4d04e842
#
# IMPORTANT:
# - Today you got HTTP 429 (code 10048) free daily write limit.
# - This file is correct. Run again tomorrow after quota reset.
# =====================================================


# =====================================================
# CONFIG (LOCKED)
# =====================================================

BASE_DIR = Path(__file__).parent

# ✅ ΜΟΝΟ αυτό φορτώνουμε τώρα
ONLY_SEASON = "2025-2026"
INPUT_FILE = BASE_DIR / f"TEAM_STATS_ALL_{ONLY_SEASON}.json"

# KV keys
KEY_INDEX = "TEAM_STATS:INDEX"
KEY_SEASON_PREFIX = "TEAM_STATS:SEASON:"

# Retries
HTTP_TIMEOUT_SEC = 60
HTTP_RETRIES = 3


# =====================================================
# Cloudflare IDs (LOCKED)
# =====================================================

# ✅ KV Namespace (AIMATCHLAB_STATS) — ΜΗΝ ΤΟ ΑΛΛΑΞΕΙΣ
CF_KV_NAMESPACE_STATS = "830e99d5f21d4bb78a4ee13b4d04e842"

# ✅ Account ID (πρέπει να είναι αυτό από το URL σου)
# dash.cloudflare.com/<ACCOUNT_ID>/home/...
#
# ⚠️ ΑΛΛΑΖΕΙΣ ΜΟΝΟ ΑΥΤΟ ↓↓↓
CLOUDFLARE_ACCOUNT_ID = "3ae84689c002527bc182b870e4861ab4"
# ⚠️ ΑΛΛΑΖΕΙΣ ΜΟΝΟ ΑΥΤΟ ↑↑↑


# =====================================================
# ENV (TOKEN)
# =====================================================
# API Token πρέπει να υπάρχει στο ENV:
#   $env:CLOUDFLARE_API_TOKEN="...."
#
API_TOKEN = os.getenv("CLOUDFLARE_API_TOKEN", "").strip()

if not API_TOKEN:
    raise RuntimeError(
        "\n[ERROR] Missing CLOUDFLARE_API_TOKEN.\n\n"
        "PowerShell:\n"
        '  $env:CLOUDFLARE_API_TOKEN="PASTE_TOKEN_HERE"\n'
    )

if not CLOUDFLARE_ACCOUNT_ID or "PUT_YOUR_ACCOUNT_ID_HERE" in CLOUDFLARE_ACCOUNT_ID:
    raise RuntimeError(
        "\n[ERROR] Missing CLOUDFLARE_ACCOUNT_ID inside kv_load_team_stats_http.py\n\n"
        "Edit this line:\n"
        '  CLOUDFLARE_ACCOUNT_ID = "**PUT_YOUR_ACCOUNT_ID_HERE**"\n'
    )


# =====================================================
# Cloudflare API base
# =====================================================

BASE_API = (
    f"https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}"
    f"/storage/kv/namespaces/{CF_KV_NAMESPACE_STATS}/values"
)

HEADERS = {
    "Authorization": f"Bearer {API_TOKEN}",
    "Content-Type": "application/json",
}


# =====================================================
# Helpers
# =====================================================

def kv_put_json(key: str, payload: Dict[str, Any]) -> None:
    url = f"{BASE_API}/{key}"
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")

    last_err = None
    for attempt in range(1, HTTP_RETRIES + 1):
        try:
            r = requests.put(url, headers=HEADERS, data=body, timeout=HTTP_TIMEOUT_SEC)
            if r.status_code < 300:
                return

            last_err = RuntimeError(
                f"KV PUT failed: key={key} HTTP={r.status_code} body={r.text}"
            )
        except Exception as e:
            last_err = e

        if attempt < HTTP_RETRIES:
            time.sleep(0.8 * attempt)

    raise RuntimeError(f"[ERROR] kv_put_json failed after {HTTP_RETRIES} retries: {last_err}")


def kv_get_text(key: str) -> str:
    url = f"{BASE_API}/{key}"
    r = requests.get(
        url,
        headers={"Authorization": f"Bearer {API_TOKEN}"},
        timeout=HTTP_TIMEOUT_SEC
    )
    if r.status_code >= 300:
        raise RuntimeError(f"KV GET failed: key={key} HTTP={r.status_code} body={r.text}")
    return r.text


# =====================================================
# Main
# =====================================================

def main():
    if not INPUT_FILE.exists():
        raise RuntimeError(
            f"\n[ERROR] Missing input file:\n  {INPUT_FILE}\n\n"
            f"Expected file name:\n  TEAM_STATS_ALL_{ONLY_SEASON}.json\n"
            f"Folder:\n  {BASE_DIR}\n"
        )

    print("\n=== KV LOADER (HTTP): TEAM_STATS (SINGLE SEASON) ===")
    print(f"Account ID : {CLOUDFLARE_ACCOUNT_ID}")
    print(f"Namespace  : {CF_KV_NAMESPACE_STATS} (AIMATCHLAB_STATS)")
    print(f"File       : {INPUT_FILE.name}")
    print(f"Season     : {ONLY_SEASON}")
    print(f"Keys       : {KEY_SEASON_PREFIX}{ONLY_SEASON} + {KEY_INDEX}\n")

    payload = json.loads(INPUT_FILE.read_text(encoding="utf-8"))

    if payload.get("season") != ONLY_SEASON:
        raise RuntimeError(
            f"\n[ERROR] Season mismatch:\n"
            f"  expected season: {ONLY_SEASON}\n"
            f"  payload season : {payload.get('season')}\n"
        )

    leagues = payload.get("leagues", {})
    if not isinstance(leagues, dict) or len(leagues) == 0:
        raise RuntimeError("\n[ERROR] Invalid payload: leagues dict missing/empty\n")

    # 1) Put season
    season_key = f"{KEY_SEASON_PREFIX}{ONLY_SEASON}"
    print(f"Uploading season -> {season_key} (leagues={len(leagues)})")
    kv_put_json(season_key, payload)

    # 2) Put index
    index_payload = {
        "ok": True,
        "type": "team-stats-index",
        "seasons": [ONLY_SEASON],
        "latest": ONLY_SEASON,
        "updatedAtMs": int(time.time() * 1000),
        "seasonKeyPrefix": KEY_SEASON_PREFIX,
        "namespace": "AIMATCHLAB_STATS",
        "namespaceId": CF_KV_NAMESPACE_STATS,
    }

    print(f"Uploading index -> {KEY_INDEX}")
    kv_put_json(KEY_INDEX, index_payload)

    # 3) Verify index exists (optional)
    print("\nVerifying TEAM_STATS:INDEX ...")
    txt = kv_get_text(KEY_INDEX)
    print("[OK] INDEX exists (bytes=%d)" % len(txt.encode("utf-8")))

    print("\nDONE.")
    print(f"Season key : {season_key}")
    print(f"Index key  : {KEY_INDEX}")


if __name__ == "__main__":
    main()
