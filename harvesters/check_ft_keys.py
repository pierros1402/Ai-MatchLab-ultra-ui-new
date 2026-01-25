import json

with open("ft_keys.json", "r", encoding="utf-16") as f:
    keys = json.load(f)


print("FT keys:", len(keys))
print("Sample:", keys[:3])
