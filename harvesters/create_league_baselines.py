import json
import math
import time
from pathlib import Path


SEASON = "2025-2026"
INPUT_FILE = f"TEAM_STATS_ALL_{SEASON}.json"
OUTPUT_DIR = Path("baseline_output")


METRICS = [
    "goals_for_avg",
    "goals_against_avg",
    "btts_rate",
    "over25_rate",
    "clean_sheet_rate"
]


def mean(values):
    return sum(values) / len(values) if values else 0.0


def std(values, avg):
    if not values:
        return 0.0
    variance = sum((x - avg) ** 2 for x in values) / len(values)
    return math.sqrt(variance)


def ensure_dir(path):
    path.mkdir(parents=True, exist_ok=True)


def build_baselines(data):
    baselines = {}

    leagues = data.get("leagues", {})

    for league_code, league_data in leagues.items():
        teams = league_data

        metric_values = {m: [] for m in METRICS}

        for team_name, stats in teams.items():
            for metric in METRICS:
                value = stats.get(metric)
                if value is not None:
                    metric_values[metric].append(value)

        league_baseline = {
            "league": league_code,
            "season": SEASON,
            "metrics": {},
            "computedAt": int(time.time())
        }

        for metric in METRICS:
            values = metric_values[metric]
            if not values:
                continue

            avg = mean(values)
            sd = std(values, avg)

            league_baseline["metrics"][metric] = {
                "mean": round(avg, 6),
                "std": round(sd, 6)
            }

        baselines[league_code] = league_baseline

    return baselines


def main():
    print(f"Loading {INPUT_FILE}...")

    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    baselines = build_baselines(data)

    ensure_dir(OUTPUT_DIR)

    for league_code, baseline in baselines.items():
        out_file = OUTPUT_DIR / f"{league_code}_{SEASON}.json"

        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(baseline, f, indent=2)

        print(f"Baseline written: {out_file}")

    print("Done.")


if __name__ == "__main__":
    main()
