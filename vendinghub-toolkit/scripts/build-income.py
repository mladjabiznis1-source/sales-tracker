"""
Median household income per census tract (ACS 5-year, B19013), for the Dwell Check "who shops
there" test. Free static download from census.gov; no API key. Writes public/income/{state}.json
mapping tract (county+tract code) -> median household income in dollars.
  curl -s <URL below> | python3 scripts/build-income.py -     (or just: python3 scripts/build-income.py)
"""
import json
import os
import sys
import urllib.request

URL = "https://www2.census.gov/programs-surveys/acs/summary_file/2023/table-based-SF/data/5YRData/acsdt5y2023-b19013.dat"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "income")

states: dict[str, dict[str, int]] = {}
src = sys.stdin.buffer if sys.argv[1:] == ["-"] else urllib.request.urlopen(URL, timeout=120)
with src as r:
    for raw in r:
        line = raw.decode().strip()
        if not line.startswith("1400000US"):
            continue
        geo, est, *_ = line.split("|")
        code = geo[len("1400000US"):]  # SS CCC TTTTTT
        if not est.isdigit():
            continue  # suppressed / no data
        states.setdefault(code[:2], {})[code[2:]] = int(est)

os.makedirs(OUT, exist_ok=True)
for st, tracts in states.items():
    with open(os.path.join(OUT, f"{st}.json"), "w") as f:
        json.dump(tracts, f, separators=(",", ":"))
print(f"{sum(len(t) for t in states.values()):,} tracts in {len(states)} states")
