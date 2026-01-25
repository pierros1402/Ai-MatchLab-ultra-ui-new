import json

FILES = [
    "keys_AIMATCHLAB_KV.json",
    "keys_AIMATCHLAB_STATS.json",
    "keys_HISTORICAL_DATA_KV.json",
]

for f in FILES:
    try:
        with open(f, "r", encoding="utf-16") as fh:
            keys = json.load(fh)
    except FileNotFoundError:
        continue

    ft = [k for k in keys if "FT" in k.upper()]
    print(f"\n{f}")
    print("Total keys:", len(keys))
    print("FT-like keys:", len(ft))
    print("Sample:", ft[:5])
