// Downloads the big static data the source folder doesn't keep (public/places/ and public/income/)
// from the live site, so a redeploy doesn't wipe the Locations and Dwell Check data.
//   node scripts/pull-live-data.mjs            (then ./scripts/deploy.sh)
// To rebuild the data from scratch instead: scripts/build-places.py and scripts/build-income.py.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = process.env.SITE_URL || "https://pack-placement-inner-circle.netlify.app";
const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
// State FIPS codes (50 states + DC + Puerto Rico); the ones the site doesn't have are skipped.
const STATES = ["01", "02", "04", "05", "06", "08", "09", "10", "11", "12", "13", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30", "31", "32", "33", "34", "35", "36", "37", "38", "39", "40", "41", "42", "44", "45", "46", "47", "48", "49", "50", "51", "53", "54", "55", "56", "72"];

async function save(path, optional = false) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${SITE}/${path}`);
    if (res.status === 404 && optional) return false;
    if (res.ok) {
      const file = join(PUBLIC, path);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, Buffer.from(await res.arrayBuffer()));
      return true;
    }
    if (attempt === 4) throw new Error(`${path}: HTTP ${res.status}`);
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
  }
}

async function pool(items, n, fn) {
  let i = 0, done = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) {
      await fn(items[i++]);
      if (++done % 200 === 0) console.log(`  ${done}/${items.length}`);
    }
  }));
}

await save("places/index.json");
const { tiles } = JSON.parse(await readFile(join(PUBLIC, "places/index.json"), "utf8"));
const files = Object.entries(tiles).flatMap(([kind, keys]) => Object.keys(keys).map((k) => `places/${kind}/${k}.json`));
console.log(`places: ${files.length} tiles`);
await pool(files, 12, (f) => save(f));
let states = 0;
await pool(STATES, 8, async (s) => { if (await save(`income/${s}.json`, true)) states++; });
console.log(`income: ${states} states. Done: public/places and public/income are ready to deploy.`);
