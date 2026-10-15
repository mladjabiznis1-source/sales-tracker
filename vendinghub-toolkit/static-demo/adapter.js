// Static-hosting adapter (GitHub Pages): stands in for the Netlify server so the toolkit runs as a
// plain website. Saves to this browser (localStorage). Places come live from OpenStreetMap through
// the Overpass API instead of the pre-built Overture tiles. No student logins on this version.
(() => {
  const KEY = (k) => `vh_${k}`;
  const load = (k, d) => { try { const v = localStorage.getItem(KEY(k)); return v == null ? d : JSON.parse(v); } catch { return d; } };
  const keep = (k, v) => { try { localStorage.setItem(KEY(k), JSON.stringify(v)); } catch {} };
  try { if (!localStorage.getItem("ic_code")) localStorage.setItem("ic_code", JSON.stringify("PP-PUBLIC-DEMO")); } catch {}

  let profile = load("profile", null);
  let checks = load("dwell", []);
  let leads = load("leads", []);
  const posts = [{ id: "t1", at: "2026-10-13T15:00:00Z", title: "Example: what a weekly trend post looks like", body: "The team writes here every week: which sets are moving, what to restock, and what prices are doing.", tags: ["Example", "Pokémon"] }];

  // ---- live places from OpenStreetMap
  const MIRRORS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
  const MAX_MI = 40; // Overpass gets slow past this; the page says so
  const radiusMi = () => Math.min(MAX_MI, Number(document.querySelector("#radiusChips .chip.active")?.dataset.r) || 25);
  let lastPlace = null; // a business pasted into Dwell Check
  const centers = () => {
    const out = [];
    try { const o = JSON.parse(localStorage.getItem("ic_origin") || "null"); if (o?.lat) out.push({ ...o, r: radiusMi() }); } catch {}
    if (!out.length && profile?.home?.lat) out.push({ ...profile.home, r: radiusMi() });
    if (lastPlace) out.push({ ...lastPlace, r: 2 });
    return out;
  };
  const QUERIES = {
    core: (a) => `nwr["amenity"="fuel"]${a};nwr["shop"~"^(alcohol|wine)$"]${a};nwr["leisure"="bowling_alley"]${a};nwr["leisure"="amusement_arcade"]${a};nwr["shop"="mall"]${a};nwr["amenity"="restaurant"]["cuisine"~"korean",i]${a};`,
    rest: (a) => `nwr["amenity"="restaurant"]${a};`,
    cards: (a) => `nwr["shop"~"^(games|collector|hobby|comic|anime)$"]${a};`,
  };
  const cache = new Map();
  async function overpass(kind, c) {
    const r = kind === "rest" ? Math.min(c.r, 12) : c.r;
    const key = `${kind}:${c.lat.toFixed(3)},${c.lng.toFixed(3)}:${r}`;
    if (!cache.has(key)) cache.set(key, (async () => {
      const around = `(around:${Math.round(r * 1609)},${c.lat},${c.lng})`;
      const q = `[out:json][timeout:40];(${QUERIES[kind](around)});out center tags 4000;`;
      let lastErr;
      for (const m of MIRRORS) {
        try {
          const res = await fetch(m, { method: "POST", body: new URLSearchParams({ data: q }) });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return toRows(kind, (await res.json()).elements || []);
        } catch (e) { lastErr = e; }
      }
      cache.delete(key);
      throw lastErr;
    })());
    return cache.get(key);
  }
  function toRows(kind, els) {
    const rows = [];
    for (const e of els) {
      const t = e.tags || {};
      const lat = e.lat ?? e.center?.lat, lng = e.lon ?? e.center?.lon;
      if (!t.name || lat == null) continue;
      let code = "r";
      if (t.amenity === "fuel") code = "g";
      else if (t.shop === "alcohol" || t.shop === "wine") code = "l";
      else if (t.leisure === "bowling_alley") code = "b";
      else if (t.leisure === "amusement_arcade") code = "a";
      else if (t.shop === "mall") code = "m";
      else if (/korean/i.test(t.cuisine || "")) code = "k";
      else if (kind === "cards") code = "c";
      if (kind === "rest" && code === "k") continue; // Korean already came with core
      const street = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ");
      rows.push([t.name, lat, lng, code, t.phone || t["contact:phone"] || "", street, t["addr:city"] || "", t["addr:state"] || ""]);
    }
    return rows;
  }
  const index = { release: "osm-live", tiles: { core: {}, rest: {}, cards: {} } };
  for (let la = 18; la < 72; la++) for (let lo = -170; lo < -64; lo++) { const k = `${la}_${lo}`; index.tiles.core[k] = index.tiles.rest[k] = index.tiles.cards[k] = 1; }
  async function tile(kind, la, lo) {
    const mine = centers().filter((c) => Math.floor(c.lat) === la && Math.floor(c.lng) === lo);
    const lists = await Promise.all(mine.map((c) => overpass(kind, c)));
    const seen = new Set(), out = [];
    for (const r of lists.flat()) { const k = `${r[0]}|${r[1].toFixed(5)}`; if (!seen.has(k)) { seen.add(k); out.push(r); } }
    return out;
  }

  const json = (o, status = 200) => Promise.resolve(new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } }));
  const real = window.fetch.bind(window);
  window.__vhFetch = async (input, opts = {}) => {
    const url = String(input?.url || input);
    if (/^https?:/.test(url) && !url.startsWith(location.origin)) return real(input, opts); // geocoding etc. go out for real
    const u = new URL(url, location.href);
    const path = u.pathname.replace(/^.*?\/(api|places|income)\//, "/$1/");
    const method = (opts.method || "GET").toUpperCase();
    const b = opts.body ? JSON.parse(opts.body) : {};
    const now = new Date().toISOString();
    if (path === "/api/check") return json({ ok: true, admin: false, profile });
    if (path === "/api/me") {
      profile = { ...(profile || {}), ...b, updatedAt: now };
      if (!profile.name) return json({ error: "Add your name." }, 400);
      keep("profile", profile); return json({ ok: true, profile });
    }
    if (path === "/api/dwell") {
      if (method === "POST") { const rec = { id: "c" + Date.now(), at: now, ...b }; checks = [rec, ...checks].slice(0, 100); keep("dwell", checks); return json({ ok: true, id: rec.id, at: rec.at }); }
      return json({ checks });
    }
    if (path === "/api/trends") return json({ posts });
    if (path === "/api/leads") {
      if (method === "GET") return json({ leads });
      if (method === "POST") {
        const have = new Set(leads.map((l) => l.id));
        const added = b.leads.filter((l) => !have.has(l.id)).map((l) => ({ ...l, status: "new", createdAt: now, updatedAt: now }));
        leads = [...added, ...leads]; keep("leads", leads); return json({ ok: true, added });
      }
      if (method === "PATCH") {
        const per = new Map(b.updates ? b.updates.map((x) => [x.id, x.set]) : b.ids.map((id) => [id, b.set]));
        leads = leads.map((l) => (per.has(l.id) ? { ...l, ...per.get(l.id), ...(per.get(l.id).status && per.get(l.id).status !== "new" ? { lastContact: now } : {}), updatedAt: now } : l));
        keep("leads", leads); return json({ ok: true, leads: leads.filter((l) => per.has(l.id)) });
      }
      if (method === "DELETE") { const g = new Set(b.ids); leads = leads.filter((l) => !g.has(l.id)); keep("leads", leads); return json({ ok: true }); }
    }
    if (path === "/api/place-lookup") {
      const link = u.searchParams.get("url") || "";
      const at = link.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || link.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) || link.match(/[?&](?:q|ll|query)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
      const nm = (link.match(/\/place\/([^/@?]+)/) || [])[1];
      if (!at) return json({ error: /goo\.gl|g\.co/.test(link)
        ? "Short links need the full site. Open the link in your browser, copy the full address from the address bar (google.com/maps/place/...) and paste that here."
        : "Couldn't find the location in that link. Open the business in Google Maps and copy the full address from the address bar." }, 400);
      const lat = Number(at[1]), lng = Number(at[2]);
      lastPlace = { lat, lng, label: "" };
      const name = nm ? decodeURIComponent(nm.replace(/\+/g, " ")).split(",")[0].trim() : "";
      return json({ name, lat, lng, address: "", income: null, tract: null });
    }
    if (path.startsWith("/api/")) return json({ error: "Not available on this version." }, 404);
    if (path === "/places/index.json") return json(index);
    const m = path.match(/^\/places\/(core|rest|cards)\/(-?\d+)_(-?\d+)\.json$/);
    if (m) {
      try { return json(await tile(m[1], Number(m[2]), Number(m[3]))); }
      catch { return json({ error: "OpenStreetMap is busy. Try again in a minute." }, 503); }
    }
    if (path.startsWith("/income/")) return json({});
    return real(input, opts);
  };
})();
