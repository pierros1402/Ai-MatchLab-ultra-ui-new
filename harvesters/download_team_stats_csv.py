import time
import json
import requests
from pathlib import Path

# =====================================================
# CONFIG
# =====================================================

BASE_DIR = Path(__file__).parent
DATA_ROOT = BASE_DIR / "data"

BASE_URL = "https://www.football-data.co.uk/mmz4281"

# Seasons που θέλουμε
SEASONS = [
    "2025-2026",
    "2024-2025",
    "2023-2024",
    "2022-2023",
    "2021-2022",
    "2020-2021",
    "2019-2020",
    "2018-2019",
    "2017-2018",
    "2016-2017",
    "2015-2016",
    "2014-2015",
]

# Football-Data season code mapping
SEASON_CODE = {
    "2025-2026": "2526",
    "2024-2025": "2425",
    "2023-2024": "2324",
    "2022-2023": "2223",
    "2021-2022": "2122",
    "2020-2021": "2021",
    "2019-2020": "1920",
    "2018-2019": "1819",
    "2017-2018": "1718",
    "2016-2017": "1617",
    "2015-2016": "1516",
    "2014-2015": "1415",
}

# ✅ Supported leagues από το probe σου (seasonCode 2526)
# (σταθερή EU coverage για reliability tests)
LEAGUES = [
    "B1", "BU1",
    "D1", "D2",
    "E0", "E1", "E2", "E3", "EC",
    "F1", "F2",
    "G1",
    "I1", "I2",
    "IR1",
    "N1",
    "P1",
    "PL1",
    "SC0", "SC1",
    "SI1",
    "SP1", "SP2",
    "T1",
]

TIMEOUT = 25
SLEEP_BETWEEN = 0.15
USER_AGENT = "Mozilla/5.0 (AI-MatchLab CSV Downloader)"

REPORT_FILE = BASE_DIR / "download_report.json"

# =====================================================
# CORE
# =====================================================

def download_one(season: str, league: str) -> dict:
    """
    Returns a structured result dict:
    {
      ok: bool,
      season: "2025-2026",
      seasonCode: "2526",
      league: "E0",
      status: int | None,
      bytes: int,
      path: "..."
    }
    """
    code = SEASON_CODE.get(season)
    if not code:
        return {
            "ok": False,
            "season": season,
            "seasonCode": None,
            "league": league,
            "status": None,
            "bytes": 0,
            "path": None,
            "error": "missing-season-code"
        }

    season_dir = DATA_ROOT / season
    season_dir.mkdir(parents=True, exist_ok=True)

    url = f"{BASE_URL}/{code}/{league}.csv"
    out_path = season_dir / f"{league}.csv"

    headers = {"User-Agent": USER_AGENT}

    try:
        r = requests.get(url, headers=headers, timeout=TIMEOUT)
    except Exception as e:
        return {
            "ok": False,
            "season": season,
            "seasonCode": code,
            "league": league,
            "status": None,
            "bytes": 0,
            "path": str(out_path),
            "error": f"request-failed: {e}"
        }

    if r.status_code != 200:
        return {
            "ok": False,
            "season": season,
            "seasonCode": code,
            "league": league,
            "status": r.status_code,
            "bytes": len(r.content or b""),
            "path": str(out_path),
            "error": "http-non-200"
        }

    # sanity check
    txt = ""
    try:
        txt = r.text
    except Exception:
        txt = ""

    if len(txt) < 50 or "HomeTeam" not in txt:
        return {
            "ok": False,
            "season": season,
            "seasonCode": code,
            "league": league,
            "status": r.status_code,
            "bytes": len(r.content or b""),
            "path": str(out_path),
            "error": "bad-content"
        }

    out_path.write_bytes(r.content)

    return {
        "ok": True,
        "season": season,
        "seasonCode": code,
        "league": league,
        "status": r.status_code,
        "bytes": len(r.content or b""),
        "path": str(out_path),
        "error": None
    }

def main():
    print("\n=== DOWNLOAD FOOTBALL-DATA CSVs (EU RELIABILITY SET) ===")
    print(f"Root    : {DATA_ROOT}")
    print(f"Seasons : {len(SEASONS)}")
    print(f"Leagues : {len(LEAGUES)}")
    print(f"Report  : {REPORT_FILE}\n")

    report = {
        "meta": {
            "baseUrl": BASE_URL,
            "seasons": SEASONS,
            "leagues": LEAGUES,
            "generatedAtMs": int(time.time() * 1000),
        },
        "results": [],
        "summary": {
            "ok": 0,
            "miss": 0,
            "bySeason": {}
        }
    }

    for season in SEASONS:
        report["summary"]["bySeason"][season] = {"ok": 0, "miss": 0}
        print(f"\n--- Season {season} ---")

        for league in LEAGUES:
            res = download_one(season, league)
            report["results"].append(res)

            if res["ok"]:
                report["summary"]["ok"] += 1
                report["summary"]["bySeason"][season]["ok"] += 1
                print(f"[OK  ] {season} {league} ({res['bytes']} bytes)")
            else:
                report["summary"]["miss"] += 1
                report["summary"]["bySeason"][season]["miss"] += 1
                st = res["status"]
                err = res["error"]
                print(f"[MISS] {season} {league} -> {st} ({err})")

            time.sleep(SLEEP_BETWEEN)

    REPORT_FILE.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    print("\nDONE.")
    print(f"TOTAL OK   : {report['summary']['ok']}")
    print(f"TOTAL MISS : {report['summary']['miss']}")
    print(f"Saved report: {REPORT_FILE}")

if __name__ == "__main__":
    main()
