// Dwell Check from a pasted Google Maps link. Free: no Google API.
//   GET /api/place-lookup?url=<google maps link>
//   -> { name, lat, lng, income, tract }
// Resolves short links (maps.app.goo.gl) by following redirects, but only to Google Maps hosts,
// reads the business name and pin from the final URL, then finds the census tract (free Census
// geocoder) and its median household income from our static public/income/{state}.json files.
import type { Config } from "@netlify/edge-functions";
import { gate, json } from "./_shared/util.ts";

const ALLOWED = /^(maps\.app\.goo\.gl|goo\.gl|(www\.|maps\.)?google\.com)$/i;

function parsePlace(u: URL) {
  const path = decodeURIComponent(u.pathname);
  const name = (path.match(/\/maps\/place\/([^/]+)/)?.[1] ?? u.searchParams.get("q") ?? "").replace(/\+/g, " ").trim();
  // The business pin (!3d lat !4d lng) beats the map viewport center (@lat,lng).
  const pin = u.href.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  const view = u.href.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  const q = (u.searchParams.get("q") ?? "").match(/^(-?\d+\.\d+),\s*(-?\d+\.\d+)$/);
  const m = pin ?? q ?? view;
  return m ? { name, lat: Number(m[1]), lng: Number(m[2]) } : null;
}

async function resolve(link: string): Promise<URL> {
  let u = new URL(link.trim());
  for (let hop = 0; hop < 6; hop++) {
    if (u.protocol !== "https:" || !ALLOWED.test(u.hostname)) throw new Error("That doesn't look like a Google Maps link.");
    if (/google\.com$/i.test(u.hostname) && u.pathname.startsWith("/maps")) return u;
    const r = await fetch(u, { redirect: "manual", headers: { "user-agent": "Mozilla/5.0" } });
    const next = r.headers.get("location");
    if (!next) break;
    u = new URL(next, u);
  }
  if (/google\.com$/i.test(u.hostname) && u.pathname.startsWith("/maps")) return u;
  throw new Error("Couldn't open that link. Copy it again from Google Maps (Share → Copy link).");
}

export default async (req: Request) => {
  const denied = await gate(req);
  if (denied) return denied;
  const link = new URL(req.url).searchParams.get("url") ?? "";
  if (!link || link.length > 2000) return json({ error: "Paste a Google Maps link." }, 400);

  let place;
  try {
    place = parsePlace(await resolve(link));
  } catch (e) {
    return json({ error: e instanceof Error && e.message ? e.message : "That doesn't look like a Google Maps link." }, 400);
  }
  if (!place) return json({ error: "Couldn't find the location in that link. Open the business in Google Maps, then Share → Copy link." }, 400);

  // Neighborhood income (optional: the check still works without it).
  let income: number | null = null, tract = "";
  try {
    const g = await fetch(
      `https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x=${place.lng}&y=${place.lat}&benchmark=Public_AR_Current&vintage=Current_Current&layers=Census%20Tracts&format=json`,
    ).then((r) => r.json());
    const t = g?.result?.geographies?.["Census Tracts"]?.[0];
    if (t) {
      tract = t.NAME ?? "";
      const table = await fetch(new URL(`/income/${t.STATE}.json`, req.url)).then((r) => (r.ok ? r.json() : {}));
      income = table[`${t.COUNTY}${t.TRACT}`] ?? null;
    }
  } catch { /* income stays unknown */ }

  return json({ ...place, income, tract });
};

export const config: Config = { path: "/api/place-lookup" };
