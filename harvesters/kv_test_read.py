import os
import requests

# ✅ KV Namespace (AIMATCHLAB_STATS) — ΜΗΝ ΤΟ ΑΛΛΑΞΕΙΣ
CF_KV_NAMESPACE_STATS = "830e99d5f21d4bb78a4ee13b4d04e842"

# ⚠️ ΑΛΛΑΖΕΙΣ ΜΟΝΟ ΑΥΤΟ ↓↓↓
CLOUDFLARE_ACCOUNT_ID = "3ae84689c002527bc182b870e4861ab4"
# ⚠️ ΑΛΛΑΖΕΙΣ ΜΟΝΟ ΑΥΤΟ ↑↑↑

API_TOKEN = os.getenv("CLOUDFLARE_API_TOKEN", "").strip()

if not API_TOKEN:
    raise RuntimeError(
        "\n[ERROR] Missing CLOUDFLARE_API_TOKEN.\n"
        'PowerShell: $env:CLOUDFLARE_API_TOKEN="PASTE_TOKEN_HERE"\n'
    )

if not CLOUDFLARE_ACCOUNT_ID or "PUT_YOUR_ACCOUNT_ID_HERE" in CLOUDFLARE_ACCOUNT_ID:
    raise RuntimeError(
        "\n[ERROR] Missing CLOUDFLARE_ACCOUNT_ID inside kv_test_read.py\n"
        'Edit: CLOUDFLARE_ACCOUNT_ID = "**PUT_YOUR_ACCOUNT_ID_HERE**"\n'
    )

BASE_API = (
    f"https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}"
    f"/storage/kv/namespaces/{CF_KV_NAMESPACE_STATS}/values"
)

def kv_get(key: str):
    url = f"{BASE_API}/{key}"
    r = requests.get(url, headers={"Authorization": f"Bearer {API_TOKEN}"}, timeout=30)
    print("\n=== KV GET ===")
    print("Key :", key)
    print("HTTP:", r.status_code)
    print("Body:", (r.text[:800] + ("..." if len(r.text) > 800 else "")))

def main():
    # αν δεν υπάρχει ακόμα θα βγάλει 404 (είναι ΟΚ)
    kv_get("TEAM_STATS:INDEX")

if __name__ == "__main__":
    main()
