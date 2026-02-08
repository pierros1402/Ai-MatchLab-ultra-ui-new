import pandas as pd
from pathlib import Path
from collections import defaultdict
import json

# =====================================================
# CONFIG
# =====================================================

BASE_DIR = Path(__file__).parent

DATA_ROOT = BASE_DIR / "data"

# ✅ Βάλε εδώ όσες σεζόν θέλεις να βγάλει ΜΑΖΙ
SEASONS = [
    "2025-2026",
]


# ✅ Output pattern (1 JSON ανά σεζόν)
OUTPUT_PATTERN = "TEAM_STATS_ALL_{season}.json"

# =====================================================
# SCHEMA
# =====================================================

def empty_team():
    return {
        "matches": 0,
        "home_matches": 0,
        "away_matches": 0,
        "goals_for": 0,
        "goals_against": 0,
        "wins": 0,
        "draws": 0,
        "losses": 0,
        "points": 0,
        "btts_yes": 0,
        "over_15": 0,
        "over_25": 0,
        "over_35": 0
    }

# =====================================================
# CORE
# =====================================================

def read_csv_safe(csv_path: Path) -> pd.DataFrame:
    try:
        return pd.read_csv(csv_path, encoding="utf-8")
    except UnicodeDecodeError:
        return pd.read_csv(csv_path, encoding="latin1")

def process_csv(csv_path: Path):
    df = read_csv_safe(csv_path)
    teams = defaultdict(empty_team)

    required_cols = ["HomeTeam", "AwayTeam", "FTHG", "FTAG"]
    for col in required_cols:
        if col not in df.columns:
            raise RuntimeError(f"CSV missing required column '{col}': {csv_path.name}")

    for _, row in df.iterrows():
        # Skip matches without final score (future fixtures)
        if pd.isna(row["FTHG"]) or pd.isna(row["FTAG"]):
            continue

        home = row["HomeTeam"]
        away = row["AwayTeam"]

        try:
            hg = int(row["FTHG"])
            ag = int(row["FTAG"])
        except Exception:
            continue

        # matches
        teams[home]["matches"] += 1
        teams[away]["matches"] += 1
        teams[home]["home_matches"] += 1
        teams[away]["away_matches"] += 1

        # goals
        teams[home]["goals_for"] += hg
        teams[home]["goals_against"] += ag
        teams[away]["goals_for"] += ag
        teams[away]["goals_against"] += hg

        # result
        if hg > ag:
            teams[home]["wins"] += 1
            teams[home]["points"] += 3
            teams[away]["losses"] += 1
        elif hg < ag:
            teams[away]["wins"] += 1
            teams[away]["points"] += 3
            teams[home]["losses"] += 1
        else:
            teams[home]["draws"] += 1
            teams[away]["draws"] += 1
            teams[home]["points"] += 1
            teams[away]["points"] += 1

        # BTTS
        if hg > 0 and ag > 0:
            teams[home]["btts_yes"] += 1
            teams[away]["btts_yes"] += 1

        total = hg + ag
        if total >= 2:
            teams[home]["over_15"] += 1
            teams[away]["over_15"] += 1
        if total >= 3:
            teams[home]["over_25"] += 1
            teams[away]["over_25"] += 1
        if total >= 4:
            teams[home]["over_35"] += 1
            teams[away]["over_35"] += 1

    return teams

def build_season_json(season: str, season_dir: Path):
    output = {
        "season": season,
        "leagues": {}
    }

    csv_files = sorted(season_dir.glob("*.csv"))
    if not csv_files:
        print(f"[SKIP] No CSV files in {season_dir}")
        return None

    for csv in csv_files:
        league_code = csv.stem
        print(f"  Processing league: {league_code}")

        teams = process_csv(csv)
        league_block = {}

        for team, s in teams.items():
            m = s["matches"]
            if m <= 0:
                continue

            league_block[team] = {
                "matches": m,
                "home_matches": s["home_matches"],
                "away_matches": s["away_matches"],
                "goals_for": s["goals_for"],
                "goals_against": s["goals_against"],
                "goals_for_avg": round(s["goals_for"] / m, 3),
                "goals_against_avg": round(s["goals_against"] / m, 3),
                "wins": s["wins"],
                "draws": s["draws"],
                "losses": s["losses"],
                "points": s["points"],
                "btts_rate": round(s["btts_yes"] / m, 3),
                "over15_rate": round(s["over_15"] / m, 3),
                "over25_rate": round(s["over_25"] / m, 3),
                "over35_rate": round(s["over_35"] / m, 3)
            }

        output["leagues"][league_code] = league_block

    return output

# =====================================================
# RUN
# =====================================================

def main():
    print("\n=== TEAM STATS HARVEST (MULTI-SEASON) ===")
    print(f"Data root: {DATA_ROOT}")
    print(f"Seasons : {SEASONS}\n")

    for season in SEASONS:
        season_dir = DATA_ROOT / season
        print(f"\n=== Season: {season} ===")
        print(f"Input: {season_dir}")

        if not season_dir.exists():
            print(f"[SKIP] Season folder not found: {season_dir}")
            continue

        season_json = build_season_json(season, season_dir)
        if not season_json:
            continue

        out_file = BASE_DIR / OUTPUT_PATTERN.format(season=season)
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(season_json, f, ensure_ascii=False, indent=2)

        print(f"Saved: {out_file}")

    print("\nDONE.")

if __name__ == "__main__":
    main()
