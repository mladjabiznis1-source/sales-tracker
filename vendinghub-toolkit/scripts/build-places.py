"""
Builds the location finder's data from Overture Maps (free, open data, no API key).

Pulls every US business of the types Gage recommends, then writes them as small
1x1 degree tile files the app loads straight from the site (no per-search cost).

  python3 -m venv .venv && .venv/bin/pip install duckdb
  .venv/bin/python scripts/build-places.py            # then ./scripts/deploy.sh

Re-run every month or two to pick up new businesses (Overture releases monthly).
Data: Overture Maps Foundation, CDLA Permissive 2.0. Attribution is shown in the app.
"""
import json
import math
import os
import shutil
import sys
import time
import urllib.request
import re

import duckdb

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "public", "places")

# App type code -> Overture taxonomy.primary values ("restaurant" is handled via basic_category).
TYPES = {
    "k": ["korean_restaurant"],
    "m": ["shopping_mall"],
    "g": ["gas_station", "truck_gas_station"],
    "l": ["liquor_store", "beer_wine_spirits_store"],
    "b": ["bowling_alley"],
    "a": ["arcade"],
}
MIN_CONFIDENCE = 0.6
# Card shops (for the Dwell Check "card shop nearby" test): these categories, or a name that says cards.
CARD_CATS = ["hobby_shop", "comic_books_store", "tabletop_games_store"]
CARD_NAME = r"pok[eé]mon|\btcg\b|trading card|sports card|card shop|cards (&|and) (games|collectibles)|collectibles"


def latest_release() -> str:
    url = "https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/?list-type=2&prefix=release/&delimiter=/"
    xml = urllib.request.urlopen(url, timeout=30).read().decode()
    releases = sorted(re.findall(r"<Prefix>release/([^/<]+)/</Prefix>", xml))
    return releases[-1]


def main() -> None:
    release = sys.argv[1] if len(sys.argv) > 1 else latest_release()
    src = f"s3://overturemaps-us-west-2/release/{release}/theme=places/type=place/*"
    print(f"Overture release {release}")

    case = " ".join(
        f"WHEN taxonomy.primary IN ({', '.join(repr(v) for v in vals)}) THEN '{code}'" for code, vals in TYPES.items()
    )
    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';")
    # One US-wide query stalls (it has to sift most of the world's files at once), so pull the
    # country in regional chunks. Each chunk only reads the files that overlap it.
    boxes = [(lat, lng, lat + 8, lng + 10) for lat in range(24, 50, 8) for lng in range(-125, -65, 10)]
    boxes += [(50, -170, 72, -129), (18, -161, 23, -154)]  # Alaska, Hawaii
    t = time.time()
    rows = []
    for i, (s_, w, n, e) in enumerate(boxes, 1):
        tb = time.time()
        part = con.execute(
            f"""
            SELECT names.primary AS name,
                   round((bbox.ymin + bbox.ymax) / 2, 5) AS lat,
                   round((bbox.xmin + bbox.xmax) / 2, 5) AS lng,
                   CASE {case} WHEN basic_category = 'restaurant' THEN 'r'
                        WHEN taxonomy.primary IN ({', '.join(repr(v) for v in CARD_CATS)}) OR regexp_matches(lower(names.primary), '{CARD_NAME}') THEN 'c' END AS t,
                   coalesce(phones[1], '') AS phone,
                   coalesce(addresses[1].freeform, '') AS street,
                   coalesce(addresses[1].locality, '') AS city,
                   coalesce(addresses[1].region, '') AS state
            FROM read_parquet('{src}', hive_partitioning=1)
            WHERE bbox.xmin >= {w} AND bbox.xmin < {e} AND bbox.ymin >= {s_} AND bbox.ymin < {n}
              AND addresses[1].country = 'US'
              AND confidence >= {MIN_CONFIDENCE}
              AND coalesce(operating_status, 'open') <> 'permanently_closed'
              AND names.primary IS NOT NULL
              AND (taxonomy.primary IN ({', '.join(repr(v) for vals in TYPES.values() for v in vals)})
                   OR basic_category = 'restaurant'
                   OR taxonomy.primary IN ({', '.join(repr(v) for v in CARD_CATS)})
                   OR regexp_matches(lower(names.primary), '{CARD_NAME}'))
            """
        ).fetchall()
        rows += part
        print(f"  chunk {i}/{len(boxes)} lat {s_}..{n} lng {w}..{e}: {len(part):,} places, {time.time() - tb:.0f}s", flush=True)
    print(f"{len(rows):,} places in {time.time() - t:.0f}s")

    # Tiles: "core" = Gage's main types, "rest" = restaurants (big, only loaded when that type is on).
    tiles: dict[tuple[str, int, int], list] = {}
    for name, lat, lng, t_code, phone, street, city, state in rows:
        if t_code is None:
            continue
        kind = {"r": "rest", "c": "cards"}.get(t_code, "core")
        key = (kind, math.floor(lat), math.floor(lng))
        tiles.setdefault(key, []).append([name, lat, lng, t_code, phone, street, city, state])

    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    index: dict[str, dict[str, int]] = {"core": {}, "rest": {}, "cards": {}}
    for (kind, la, lo), items in tiles.items():
        os.makedirs(os.path.join(OUT, kind), exist_ok=True)
        with open(os.path.join(OUT, kind, f"{la}_{lo}.json"), "w") as f:
            json.dump(items, f, separators=(",", ":"), ensure_ascii=False)
        index[kind][f"{la}_{lo}"] = len(items)
    with open(os.path.join(OUT, "index.json"), "w") as f:
        json.dump({"release": release, "built": time.strftime("%Y-%m-%d"), "tiles": index}, f, separators=(",", ":"))

    counts: dict[str, int] = {}
    for items in tiles.values():
        for r in items:
            counts[r[3]] = counts.get(r[3], 0) + 1
    print("by type:", counts)
    print(f"tiles: core {len(index['core'])}, rest {len(index['rest'])}, cards {len(index['cards'])}")


if __name__ == "__main__":
    main()
