// Per-student data, keyed by the student's access code (hashed). Nobody can read a profile
// or its history without that exact code.
//   GET  /api/check            -> { ok, admin, profile | null }
//   PUT  /api/me               -> save profile
//   GET  /api/reviews          -> call review summaries (newest first)
//   GET  /api/reviews?id=...   -> one full review
//   POST /api/reviews          -> save a review
//   DELETE /api/reviews?id=... -> delete a review
//   GET  /api/chat             -> saved Ask Gage conversation
//   PUT  /api/chat             -> replace saved conversation
//   GET  /api/dwell            -> saved Dwell Checks
//   POST /api/dwell            -> save a Dwell Check
//   GET  /api/leads            -> the student's saved locations / CRM (newest first)
//   POST /api/leads            -> save places in bulk { leads: [...] } (skips ones already saved)
//   PATCH /api/leads           -> bulk edit { ids: [...], set: { status, owner, ... } }
//                                 or one change per lead { updates: [{ id, set }] } (skip-trace import)
//   DELETE /api/leads          -> bulk delete { ids: [...] }
//   GET  /api/trends           -> weekly trend posts, shared by everyone (newest first)
//   POST /api/trends           -> post an update (admin code only)
//   DELETE /api/trends?id=...  -> delete a post (admin code only)
import type { Config } from "@netlify/edge-functions";
import { getStore } from "@netlify/blobs";
import { getUser, json } from "./_shared/util.ts";

const MAX_REVIEWS = 60;
const MAX_CHAT = 100;
const MAX_DWELL = 100;
const MAX_TRENDS = 200;
const MAX_LEADS = 3000;
const LEAD_STATUSES = ["new", "noanswer", "followup", "no", "yes", "placed"];
// What a saved place carries (from the Locations data) and what the student edits on it.
const LEAD_PLACE: Record<string, number> = { name: 120, cat: 40, catLabel: 60, phone: 30, address: 200, city: 80, state: 40, maps: 400 };
const LEAD_EDIT: Record<string, number> = { owner: 80, ownerPhone: 30, notes: 2000, followUp: 10 };
const PROFILE_FIELDS: Record<string, number> = { name: 80, city: 80, state: 40, phone: 30, email: 120, goal: 400, machines: 10 };

const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

export default async (req: Request) => {
  const user = await getUser(req);
  if (!user) return json({ error: "Wrong access code." }, 401);

  const store = getStore({ name: "students", consistency: "strong" });
  const key = (k: string) => `${user.id}/${k}`;
  const url = new URL(req.url);

  try {
    // ---- login check + profile
    if (url.pathname === "/api/check") {
      const profile = await store.get(key("profile"), { type: "json" });
      return json({ ok: true, admin: user.admin, profile: profile ?? null });
    }

    if (url.pathname === "/api/me" && req.method === "PUT") {
      const body = await req.json();
      const prev = (await store.get(key("profile"), { type: "json" })) ?? {};
      const profile: Record<string, unknown> = { ...prev };
      for (const [f, n] of Object.entries(PROFILE_FIELDS)) if (f in body) profile[f] = clip(body[f], n);
      if (!profile.name) return json({ error: "Add your name." }, 400);
      if (body.home && typeof body.home.lat === "number" && typeof body.home.lng === "number") {
        profile.home = { lat: body.home.lat, lng: body.home.lng, label: clip(body.home.label, 120) };
      }
      profile.createdAt ??= new Date().toISOString();
      profile.updatedAt = new Date().toISOString();
      await store.setJSON(key("profile"), profile);
      return json({ ok: true, profile });
    }

    // ---- call reviews
    if (url.pathname === "/api/reviews") {
      const list: any[] = (await store.get(key("reviews"), { type: "json" })) ?? [];
      const id = url.searchParams.get("id");

      if (req.method === "GET") {
        if (id) {
          const r = list.find((x) => x.id === id);
          return r ? json(r) : json({ error: "Review not found." }, 404);
        }
        return json({
          reviews: list.map((r) => ({ id: r.id, at: r.at, title: r.title, score: r.analysis?.overall_score ?? null, outcome: r.analysis?.outcome ?? null })),
        });
      }

      if (req.method === "POST") {
        const text = await req.text();
        if (text.length > 600_000) return json({ error: "Review too large to save." }, 413);
        const body = JSON.parse(text);
        if (!body.analysis) return json({ error: "Nothing to save." }, 400);
        const rec = {
          id: crypto.randomUUID().slice(0, 12),
          at: new Date().toISOString(),
          title: clip(body.title, 120) || "Call",
          analysis: body.analysis,
          transcript: clip(body.transcript, 200_000),
          talk: body.talk ?? null,
        };
        await store.setJSON(key("reviews"), [rec, ...list].slice(0, MAX_REVIEWS));
        return json({ ok: true, id: rec.id, at: rec.at });
      }

      if (req.method === "DELETE" && id) {
        await store.setJSON(key("reviews"), list.filter((r) => r.id !== id));
        return json({ ok: true });
      }
    }

    // ---- Dwell Checks
    if (url.pathname === "/api/dwell") {
      const list: any[] = (await store.get(key("dwell"), { type: "json" })) ?? [];
      if (req.method === "GET") return json({ checks: list });
      if (req.method === "POST") {
        const b = await req.json();
        const answers: Record<string, string> = {};
        for (const [k, v] of Object.entries(b.answers ?? {}).slice(0, 20)) answers[clip(k, 20)] = clip(v, 20);
        const rec = {
          id: crypto.randomUUID().slice(0, 12),
          at: new Date().toISOString(),
          name: clip(b.name, 120),
          type: clip(b.type, 20),
          answers,
          score: Math.max(0, Math.min(100, Number(b.score) || 0)),
          verdict: ["green", "yellow", "red"].includes(b.verdict) ? b.verdict : "yellow",
          // What a pasted-link check found (match, card shops, income); small, so keep it with the check.
          auto: b.auto && JSON.stringify(b.auto).length < 4000 ? b.auto : null,
        };
        await store.setJSON(key("dwell"), [rec, ...list].slice(0, MAX_DWELL));
        return json({ ok: true, id: rec.id, at: rec.at });
      }
    }

    // ---- Leads (the student's CRM). One JSON list per student.
    if (url.pathname === "/api/leads") {
      const list: any[] = (await store.get(key("leads"), { type: "json" })) ?? [];
      if (req.method === "GET") return json({ leads: list });
      const body = await req.json();
      const now = new Date().toISOString();

      if (req.method === "POST") {
        const have = new Set(list.map((l) => l.id));
        const added: any[] = [];
        for (const b of (Array.isArray(body.leads) ? body.leads : []).slice(0, 1000)) {
          const id = clip(b.id, 160);
          if (!id || have.has(id)) continue;
          const lead: Record<string, unknown> = { id, status: "new", createdAt: now, updatedAt: now };
          for (const [f, n] of Object.entries(LEAD_PLACE)) lead[f] = clip(b[f], n);
          for (const f of ["lat", "lng", "score"]) if (typeof b[f] === "number") lead[f] = b[f];
          if (!lead.name) continue;
          have.add(id);
          added.push(lead);
        }
        const next = [...added, ...list];
        if (next.length > MAX_LEADS) return json({ error: `You can save up to ${MAX_LEADS.toLocaleString()} leads. Delete some first.` }, 400);
        await store.setJSON(key("leads"), next);
        return json({ ok: true, added });
      }

      const ids = new Set((Array.isArray(body.ids) ? body.ids : []).map((x: unknown) => clip(x, 160)));
      if (req.method === "PATCH") {
        // Same change for every id in `ids`, or a change per lead in `updates`.
        const perLead = new Map<string, Record<string, unknown>>();
        const pairs: [string, any][] = Array.isArray(body.updates)
          ? body.updates.slice(0, MAX_LEADS).map((u: any) => [clip(u?.id, 160), u?.set ?? {}])
          : [...ids].map((id) => [id as string, body.set ?? {}]);
        for (const [id, set] of pairs) {
          const changes: Record<string, unknown> = {};
          if ("status" in set) {
            if (!LEAD_STATUSES.includes(set.status)) return json({ error: "Unknown status." }, 400);
            changes.status = set.status;
            if (set.status !== "new") changes.lastContact = now;
          }
          for (const [f, n] of Object.entries(LEAD_EDIT)) if (f in set) changes[f] = clip(set[f], n);
          perLead.set(id, changes);
        }
        const next = list.map((l) => {
          const changes = perLead.get(l.id);
          if (!changes) return l;
          const log = changes.status && changes.status !== l.status ? [{ at: now, status: changes.status }, ...(l.log ?? [])].slice(0, 30) : l.log;
          return { ...l, ...changes, log, updatedAt: now };
        });
        await store.setJSON(key("leads"), next);
        return json({ ok: true, leads: next.filter((l) => perLead.has(l.id)) });
      }
      if (req.method === "DELETE") {
        await store.setJSON(key("leads"), list.filter((l) => !ids.has(l.id)));
        return json({ ok: true });
      }
    }

    // ---- Trends: one shared list, not per student. Only the owner's admin code writes it.
    if (url.pathname === "/api/trends") {
      const list: any[] = (await store.get("shared/trends", { type: "json" })) ?? [];
      if (req.method === "GET") return json({ posts: list });
      if (!user.admin) return json({ error: "Only the team can post updates." }, 403);
      if (req.method === "POST") {
        const b = await req.json();
        const post = {
          id: crypto.randomUUID().slice(0, 12),
          at: new Date().toISOString(),
          title: clip(b.title, 120),
          body: clip(b.body, 4000),
          tags: clip(b.tags, 120).split(",").map((t) => t.trim()).filter(Boolean).slice(0, 6),
        };
        if (!post.title || !post.body) return json({ error: "Add a headline and the update." }, 400);
        await store.setJSON("shared/trends", [post, ...list].slice(0, MAX_TRENDS));
        return json({ ok: true, post });
      }
      const id = url.searchParams.get("id");
      if (req.method === "DELETE" && id) {
        await store.setJSON("shared/trends", list.filter((t) => t.id !== id));
        return json({ ok: true });
      }
    }

    // ---- Ask Gage conversation
    if (url.pathname === "/api/chat") {
      if (req.method === "GET") return json({ messages: (await store.get(key("chat"), { type: "json" })) ?? [] });
      if (req.method === "PUT") {
        const body = await req.json();
        const messages = (Array.isArray(body.messages) ? body.messages : [])
          .filter((m: any) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
          .slice(-MAX_CHAT)
          .map((m: any) => ({ role: m.role, content: m.content.slice(0, 8000) }));
        await store.setJSON(key("chat"), messages);
        return json({ ok: true });
      }
    }
  } catch (e) {
    console.error(e);
    return json({ error: "Couldn't reach your saved data. Try again in a moment." }, 500);
  }

  return json({ error: "Not found" }, 404);
};

export const config: Config = { path: ["/api/check", "/api/me", "/api/reviews", "/api/chat", "/api/dwell", "/api/trends", "/api/leads"] };
