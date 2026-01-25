import time
import json
import requests
from pathlib import Path

BASE_DIR = Path(__file__).parent
OUT_FILE = BASE_DIR / "supported_leagues_2526.json"

BASE_URL = "https://www.football-data.co.uk/mmz4281/2526"
TIMEOUT = 20
SLEEP = 0.15

USER_AGENT = "Mozilla/5.0 (AI-MatchLab Probe)"

# ✅ Candidate list (EU-focused + known patterns)
CANDIDATES = [
    # England
    "E0", "E1", "E2", "E3", "EC",
    # Spain
    "SP1", "SP2",
    # Germany
    "D1", "D2",
    # Italy
    "I1", "I2",
    # France
    "F1", "F2",
    # Scotland
    "SC0", "SC1",
    # Netherlands, Belgium, Portugal, Turkey, Greece
    "N1", "B1", "P1", "T1", "G1",
    # Switzerland, Austria, Denmark, Sweden, Norway, Finland
    "SW1", "A1", "DN1", "S1", "N1", "F1",
    # Ireland, Poland, Czech, Hungary, Romania
    "IR1", "PL1", "CZ1", "HU1", "RO1",
    # Croatia, Serbia, Slovenia, Slovakia, Bulgaria
    "HR1", "SR1", "SI1", "SK1", "BU1",
]

def is_ok(league_code: str) -> bool:
    url = f"{BASE_URL}/{league_code}.csv"
    try:
        r = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=TIMEOUT)
        if r.status_code != 200:
            return False
        if "HomeTeam" not in r.text:
            return False
        return True
    except Exception:
        return False

def main():
    ok = []
    miss = []

    print("=== PROBE football-data (2526) ===")
    for code in sorted(set(CANDIDATES)):
        good = is_ok(code)
        if good:
            print(f"[OK]  {code}")
            ok.append(code)
        else:
            print(f"[NO]  {code}")
            miss.append(code)
        time.sleep(SLEEP)

    payload = {"seasonCode": "2526", "supported": ok, "missing": miss}
    OUT_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    print(f"\nSaved: {OUT_FILE}")
    print(f"Supported: {len(ok)}")
    print(f"Missing  : {len(miss)}")

if __name__ == "__main__":
    main()
