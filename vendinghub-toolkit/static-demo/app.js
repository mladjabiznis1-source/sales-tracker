/* Pack Placement Student Hub: the road from zero to the first machine, and running it after. */
(() => {
  "use strict";

  // ------------------------------------------------------------------ utils
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // Browser storage can be missing or throw (private mode, blocked site data): never rely on it.
  const store = {
    get(k, fallback) {
      try {
        const v = localStorage.getItem(k);
        return v == null ? fallback : JSON.parse(v);
      } catch { return fallback; }
    },
    set(k, v) {
      try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; }
    },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
  };

  let accessCode = store.get("ic_code", "");
  // Leaflet map for the location finder (created on first search; tab switching resizes it).
  let map = null, markerLayer = null, circleLayer = null;

  async function api(path, opts = {}) {
    const headers = { ...(opts.headers || {}), "x-access-code": accessCode };
    const res = await window.__vhFetch(path, { ...opts, headers });
    if (res.status === 401) {
      store.del("ic_code");
      accessCode = "";
      showGate("Your access code stopped working. Enter it again.");
      throw new Error("Wrong access code.");
    }
    return res;
  }
  async function apiJSON(path, opts) {
    const res = await api(path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  // ------------------------------------------------------------------ content you edit
  // Cold Calling videos. Paste a Loom share link (https://www.loom.com/share/...) into `url`.
  // An empty url shows a "coming soon" card in its place.
  const LOOMS = [
    { title: "How to cold call an owner", sub: "The method, step by step: who to call, the opener, the pitch, the close.", url: "" },
    { title: "A real cold call, start to finish", sub: "What it actually sounds like when an owner picks up.", url: "" },
  ];
  // Cold Calling script(s): Google Docs shared "anyone with the link". More than one shows as tabs.
  const SCRIPTS = [
    { title: "Cold call script", doc: "1jgJ0UT-oixOo0gXzJIUnGb2nlOfceAEJ5Uibk0Gt4-A" },
  ];
  // Supplier lists. Paste a Google Sheets link (shared "anyone with the link can view") into `sheet`.
  // An empty sheet shows "list coming soon".
  const SUPPLIERS = [
    { key: "machines", title: "Machines", sub: "Card vending machines: full-size, countertop and wall-mount.", sheet: "" },
    { key: "cards", title: "Pokémon cards", sub: "Sealed product to stock your machines: packs, boxes and bundles.", sheet: "" },
    { key: "squishies", title: "Squishies", sub: "Squishies and other add-on products for your machines.", sheet: "" },
  ];
  // Dwell Check: the "100 proven spots" list. Paste a Google Sheets link into `sheet`.
  const PROVEN_SPOTS = { sheet: "" };
  // Call Analyzer: our Claude connector (MCP server). Paste its URL into `url`, and a Loom of the
  // setup into `loom`. Empty url shows "coming soon" in place of the URL.
  const CLAUDE_CONNECTOR = { name: "Pack Placement", url: "", loom: "" };
  // Got a Yes: the placement agreement template (a Google Doc link) and the e-signature tool students
  // send it with (its name and a link). Empty shows "coming soon".
  const AGREEMENT = { doc: "", esignName: "", esignUrl: "" };
  // Order a Machine: our supplier, the program discount code and the ordering steps (one string each).
  const ORDERING = { supplier: "", url: "", code: "", loom: "", steps: [] };
  // Skip & Trace team: how students reach them. Fill in what you have; empty fields are hidden.
  const SKIP_TRACE = { loom: "", email: "", phone: "", text: "", hours: "", turnaround: "" };
  // Start Here: the welcome video every new student watches first (Loom share link).
  const ONBOARDING = { welcomeLoom: "" };
  // Optional short "how this page works" video per page (any link: Loom, YouTube...). Empty = no button.
  const PAGE_VIDEOS = { finder: "", dwell: "", leads: "", skiptrace: "", calling: "", objections: "", analyzer: "", yes: "", order: "", suppliers: "", setup: "", care: "", trends: "" };
  // Restock & Care videos (Loom share links).
  const CARE_VIDEOS = [
    { title: "Load products into the machine", sub: "How to fill each slot so nothing jams.", url: "" },
    { title: "Your weekly visit", sub: "Clean, check, restock: the 10-minute routine.", url: "" },
    { title: "Fix a jam or payment problem", sub: "The common problems and how to fix them on the spot.", url: "" },
  ];
  // "How much should I order?" starting values. Fill in your standard machine's numbers so students
  // see real defaults; leave empty and students type their own.
  const ORDER_CALC = { slots: "", perSlot: "", perWeek: "", weeks: "" };
  // Setup & Install videos, in order. Paste Loom share links into `url`.
  const SETUP_VIDEOS = [
    { title: "Unbox it", sub: "What's in the box and how to unpack without damage.", url: "" },
    { title: "Set it up", sub: "Power, payments, Wi-Fi and loading the first stock.", url: "" },
    { title: "Pack it for the drive", sub: "Securing the machine so it arrives in one piece.", url: "" },
    { title: "Install on location", sub: "Placing, mounting and testing it at the owner's spot.", url: "" },
  ];

  // ------------------------------------------------------------------ session (per-student code)
  // Each student's code is their login. Profile and dwell checks live on the server under that
  // code, so they follow the student to any device.
  let profile = null;
  let isAdmin = false; // the owner's ACCESS_CODE: can post Trends

  function showOnly(id) {
    ["#gate", "#setup", "#app"].forEach((s) => ($(s).hidden = s !== id));
  }
  function showGate(msg = "") {
    showOnly("#gate");
    $("#gateErr").textContent = msg;
    $("#gateCode").focus();
  }

  async function boot() {
    if (!accessCode) return showGate();
    try {
      const r = await window.__vhFetch("/api/check", { headers: { "x-access-code": accessCode } });
      const j = await r.json().catch(() => ({}));
      if (r.status === 401) { store.del("ic_code"); accessCode = ""; return showGate("That code didn't work. Check it and try again."); }
      if (!r.ok) throw new Error(j.error || "Couldn't sign you in.");
      profile = j.profile;
      isAdmin = !!j.admin;
      if (!profile) return showSetup();
      await enterApp();
    } catch (err) {
      showGate(err.message);
    }
  }

  $("#gateForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    accessCode = $("#gateCode").value.trim().toUpperCase();
    store.set("ic_code", accessCode);
    $("#gateErr").textContent = "";
    await boot();
  });

  $("#logoutBtn").addEventListener("click", () => {
    ["ic_code", "ic_origin", "ic_tab"].forEach((k) => store.del(k));
    location.reload();
  });

  // ---- profile form (first-time setup and the Profile page share it)
  function profileFormHTML(p = {}, first = false) {
    const f = (name, label, attrs = "", full = false) =>
      `<label class="${full ? "full" : ""}"><span class="label">${label}</span><input name="${name}" value="${esc(p[name] ?? "")}" ${attrs}></label>`;
    return `
      ${f("name", "Your name *", 'required maxlength="80" autocomplete="name"', true)}
      ${f("city", "City", 'maxlength="80" autocomplete="address-level2"')}
      ${f("state", "State", 'maxlength="40" autocomplete="address-level1"')}
      ${f("phone", "Phone", 'maxlength="30" autocomplete="tel" inputmode="tel"')}
      ${f("email", "Email", 'maxlength="120" autocomplete="email" type="email"')}
      ${f("machines", "Machines placed so far", 'maxlength="10" inputmode="numeric" placeholder="0"')}
      <label class="full"><span class="label">Your goal</span><textarea name="goal" rows="3" maxlength="400" placeholder="e.g. first location in 30 days, 5 machines by summer">${esc(p.goal ?? "")}</textarea></label>
      <div class="form-foot">
        <button class="btn btn-primary" type="submit">${first ? "Save and continue" : "Save profile"}</button>
        <span class="small t4 form-msg"></span>
      </div>
      ${first ? "" : `<div class="full" style="border-top:1px solid var(--line);padding-top:18px"><span class="label">Your access code</span><span class="code-box">${esc(accessCode)}</span><p class="small t4">This is your login on any device. Don't share it: anyone with it can see your profile.</p></div>`}`;
  }

  async function saveProfileFrom(form) {
    const data = Object.fromEntries(new FormData(form));
    const msg = $(".form-msg", form);
    msg.textContent = "Saving…";
    msg.style.color = "";
    // Turn their city into a map point so the location finder starts there.
    const place = [data.city, data.state].filter(Boolean).join(", ");
    if (place && place !== [profile?.city, profile?.state].filter(Boolean).join(", ")) {
      try {
        const r = await window.__vhFetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=us&q=${encodeURIComponent(place)}`);
        const hits = r.ok ? await r.json() : [];
        const hit = hits.find((h) => !["county", "state", "country"].includes(h.addresstype)) || hits[0];
        if (hit) data.home = { lat: Number(hit.lat), lng: Number(hit.lon), label: hit.display_name.split(",").slice(0, 3).join(",") };
      } catch { /* the profile still saves without a map point */ }
    }
    try {
      const j = await apiJSON("/api/me", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
      profile = j.profile;
      msg.textContent = "Saved ✓";
      return true;
    } catch (err) {
      msg.textContent = err.message;
      msg.style.color = "var(--danger)";
      return false;
    }
  }

  function showSetup() {
    showOnly("#setup");
    $("#setupForm").innerHTML = profileFormHTML({}, true);
    $("[name=name]", $("#setupForm")).focus();
  }
  $("#setupForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (await saveProfileFrom(e.target)) { store.set("ic_tab", "dashboard"); await enterApp(); }
  });
  $("#profileForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (await saveProfileFrom(e.target)) renderSidebarProfile();
  });

  function renderSidebarProfile() {
    const name = profile?.name || "Your profile";
    $("#sideName").textContent = name;
    $("#sideMeta").textContent = [profile?.city, profile?.state].filter(Boolean).join(", ") || "Edit profile";
    $("#sideAvatar").textContent = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
  }

  async function enterApp() {
    showOnly("#app");
    renderSidebarProfile();
    // Location finder starts at their home city unless they've searched somewhere else.
    if (!finder.origin && profile?.home) setOrigin(profile.home);
    await Promise.all([loadDwell(), loadLeads()]);
    addPageHelp();
    addPageNext();
    selectTab(store.get("ic_tab", "dashboard"));
  }

  // ------------------------------------------------------------------ motion helpers
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Scroll reveal: .reveal fades up when it enters view; children of .stagger follow one by one.
  const revealer = "IntersectionObserver" in window && !reduceMotion
    ? new IntersectionObserver((entries) => entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add("in-view"); revealer.unobserve(e.target); }
      }), { rootMargin: "0px 0px -8% 0px" })
    : null;
  function observeReveals(root = document) {
    $$(".stagger", root).forEach((s) => [...s.children].forEach((c, i) => c.style.setProperty("--i", Math.min(i, 12))));
    $$(".reveal, .stagger", root).forEach((el) => (revealer ? revealer.observe(el) : el.classList.add("in-view")));
  }

  // Count-up numbers: [data-count] animates 0 -> target (ease-out cubic), with data-prefix/data-suffix.
  function countUps(root = document, ms = 1400) {
    $$("[data-count]", root).forEach((el) => {
      const to = Number(el.dataset.count) || 0;
      const fmt = (v) => `${el.dataset.prefix || ""}${Math.round(v).toLocaleString()}${el.dataset.suffix || ""}`;
      if (reduceMotion) return (el.textContent = fmt(to));
      const t0 = performance.now();
      const tick = (t) => {
        const p = Math.min(1, (t - t0) / ms);
        el.textContent = fmt(to * (1 - (1 - p) ** 3));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  // Mouse-follow glow on hero sections.
  $$(".glow-zone").forEach((zone) =>
    zone.addEventListener("mousemove", (e) => {
      const r = zone.getBoundingClientRect();
      zone.style.setProperty("--mx", `${e.clientX - r.left}px`);
      zone.style.setProperty("--my", `${e.clientY - r.top}px`);
    }),
  );

  // ------------------------------------------------------------------ sidebar navigation
  const TOOL_NAMES = {
    dashboard: "Start Here", finder: "Find Spots", dwell: "Check a Spot", calling: "Call Scripts", objections: "Practice Pushback",
    analyzer: "Grade My Calls", yes: "They Said Yes", order: "Buy a Machine", suppliers: "Suppliers & Ordering", setup: "Set Up Machine",
    trends: "What's Selling", leads: "My Leads", skiptrace: "Find the Owner", care: "Restock & Care", profile: "Profile",
  };
  // Pages that were renamed or removed, so a remembered tab still lands somewhere sensible.
  const OLD_TABS = { scripts: "calling", coach: "analyzer", gage: "analyzer" };
  const sidebar = $("#sidebar");

  function selectTab(name) {
    name = OLD_TABS[name] || name;
    if (!TOOL_NAMES[name]) name = "dashboard";
    $$("[data-tab]", sidebar).forEach((b) => (b.dataset.tab === name ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current")));
    $$(".tab-panel").forEach((p) => (p.hidden = p.id !== `tab-${name}`));
    document.title = `${TOOL_NAMES[name]} · Pack Placement`;
    store.set("ic_tab", name);
    window.scrollTo(0, 0);
    // Replay the hero entrance for the page that just opened.
    $$(`#tab-${name} .hero-in`).forEach((el) => { el.style.animation = "none"; void el.offsetWidth; el.style.animation = ""; });
    if (name === "dashboard") renderDashboard();
    if (name === "calling") renderCalling();
    if (name === "objections") openObjections();
    if (name === "suppliers") renderSuppliers();
    if (name === "analyzer") renderAnalyzer();
    if (name === "yes") renderYes();
    if (name === "order") renderOrder();
    if (name === "setup") renderSetup();
    if (name === "trends") openTrends();
    if (name === "leads") openLeads();
    if (name === "skiptrace") renderSkip();
    if (name === "care") renderCare();
    if (name === "dwell") { openDwell(dwell.prefill || {}); dwell.prefill = null; renderProven(); }
    if (name === "profile") $("#profileForm").innerHTML = profileFormHTML(profile || {});
    observeReveals($(`#tab-${name}`));
    if (name === "finder" && map) requestAnimationFrame(() => map.invalidateSize());
  }
  // Sidebar items, dashboard tool cards, and inline links all switch pages the same way.
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-tab], [data-tab-link]");
    if (!el || $("#app").hidden) return;
    e.preventDefault();
    selectTab(el.dataset.tab || el.dataset.tabLink);
  });


  // =================================================================== LOCATION FINDER
  // Free: business data is pre-built from Overture Maps into 1x1 degree tile files served by this
  // site (scripts/build-places.py). No API, no per-search cost. Students tap "Google Maps" on a place
  // to see its reviews, rating, photos and hours.
  // Type codes in the tiles: k korean, m mall, g gas, l liquor, b bowling, a arcade, r restaurant.
  // $ ranges are Gage's own route numbers per type (monthly sales, from the Pack Placement one-pager).
  const CATS = [
    { key: "korean_bbq", label: "Korean BBQ", color: "#FF6AD5", weight: 5.5, ref: "$5,000–6,000/mo" },
    { key: "mall", label: "Malls", color: "#AD8CFF", weight: 4, ref: "$4,000+/mo, busy malls only" },
    { key: "gas", label: "Gas stations", color: "#5AB0FF", weight: 3, ref: "$2,000–4,000/mo with hot food" },
    { key: "liquor_hot", label: "Liquor + hot food", color: "#FF9A62", weight: 3, ref: "$2,000–4,000/mo" },
    { key: "bowling", label: "Bowling alleys", color: "#71F0C4", weight: 2.5, ref: "~$2,500/mo" },
    { key: "arcade", label: "Arcades", color: "#F5B301", weight: 2.25, ref: "$2,000–2,500/mo" },
    { key: "restaurant", label: "Restaurants", color: "#94D0FF", weight: 1.75, ref: "$1,000–2,500/mo" },
    { key: "liquor_nofood", label: "Liquor, no food", color: "#C774E8", weight: 1.35, ref: "$1,000–1,700/mo" },
  ];
  const CAT = Object.fromEntries(CATS.map((c) => [c.key, c]));
  const HOT_FOOD = /\b(deli|kitchen|grill|grille|food|foods|taco|tacos|taqueria|pizza|chicken|burger|subs?|sandwich|bbq|cafe|café|eatery|wings|market\s*&\s*deli)\b/i;
  const KBBQ = /\b(bbq|b\.b\.q|barbecue|bar-b-q|kbbq|gogi)\b|고기|구이/i;
  const SMOKE = /smoke|vape|hookah|tobacco|cigar/i;

  const finder = {
    origin: null, // {lat,lng,label}
    radius: store.get("ic_radius", 150),
    cats: new Set(store.get("ic_cats", CATS.map((c) => c.key))),
    places: [],
    hiddenCats: new Set(),
    shown: 60,
    running: false,
    stop: false,
    index: null,
  };

  // chips
  $("#catChips").innerHTML = CATS.map(
    (c) => `<button class="chip ${finder.cats.has(c.key) ? "active" : ""}" data-k="${c.key}"><span class="dot" style="background:${c.color}"></span>${c.label}</button>`,
  ).join("");
  $$("#catChips .chip").forEach((b) =>
    b.addEventListener("click", () => {
      const k = b.dataset.k;
      finder.cats.has(k) ? finder.cats.delete(k) : finder.cats.add(k);
      b.classList.toggle("active", finder.cats.has(k));
      store.set("ic_cats", [...finder.cats]);
      updateEstimate();
    }),
  );
  $$("#radiusChips .chip").forEach((b) => {
    b.classList.toggle("active", Number(b.dataset.r) === finder.radius);
    b.addEventListener("click", () => {
      finder.radius = Number(b.dataset.r);
      store.set("ic_radius", finder.radius);
      $$("#radiusChips .chip").forEach((x) => x.classList.toggle("active", x === b));
      updateEstimate();
    });
  });
  $("#legendList").innerHTML = CATS.map(
    (c) => `<div class="trow"><span class="dot" style="background:${c.color}"></span><span class="grow">${c.label}</span><span class="num small">${c.ref}</span></div>`,
  ).join("");

  function setOrigin(o) {
    finder.origin = o;
    store.set("ic_origin", o);
    $("#originLabel").innerHTML = `Searching around <b>${esc(o.label)}</b>`;
    updateEstimate();
  }
  $("#useMyLoc").addEventListener("click", () => {
    $("#finderErr").textContent = "";
    if (!navigator.geolocation) return ($("#finderErr").textContent = "This browser can't share location. Type your city instead.");
    $("#originLabel").textContent = "Getting your location…";
    navigator.geolocation.getCurrentPosition(
      (p) => setOrigin({ lat: p.coords.latitude, lng: p.coords.longitude, label: `your current location (${p.coords.latitude.toFixed(3)}, ${p.coords.longitude.toFixed(3)})` }),
      (e) => {
        $("#originLabel").textContent = "";
        $("#finderErr").textContent = e.code === 1 ? "Location permission was blocked. Allow it in your browser, or type your city." : "Couldn't get your location. Type your city instead.";
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 },
    );
  });
  $("#addrForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const qv = $("#addrInput").value.trim();
    if (!qv) return;
    $("#finderErr").textContent = "";
    $("#originLabel").textContent = "Looking that up…";
    try {
      // OpenStreetMap's free geocoder (US only, since the location data is US only).
      const r = await window.__vhFetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=us&q=${encodeURIComponent(qv)}`);
      const hits = r.ok ? await r.json() : [];
      // "Ventura, CA" also matches Ventura County: prefer the city/ZIP/address over a county or state.
      const hit = hits.find((h) => !["county", "state", "country"].includes(h.addresstype)) || hits[0];
      if (!hit) throw new Error(`Couldn't find "${qv}". Try a city and state, like "Ventura, CA".`);
      setOrigin({ lat: Number(hit.lat), lng: Number(hit.lon), label: hit.display_name.split(",").slice(0, 3).join(",") });
    } catch (err) {
      $("#originLabel").textContent = "";
      $("#finderErr").textContent = err.message.startsWith("Couldn't") ? err.message : "Couldn't look that up right now. Try again, or use your location.";
    }
  });

  // ---- geometry
  const R_MI = 3958.8;
  const rad = (d) => (d * Math.PI) / 180;
  function miles(aLat, aLng, bLat, bLng) {
    const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R_MI * Math.asin(Math.sqrt(h));
  }
  /** 1x1 degree tiles that touch the search circle, nearest first. */
  function tilesFor(lat, lng, R) {
    const out = [];
    const dLat = R / 69, dLng = R / (69.172 * Math.max(0.05, Math.cos(rad(lat))));
    for (let la = Math.floor(lat - dLat); la <= Math.floor(lat + dLat); la++) {
      for (let lo = Math.floor(lng - dLng); lo <= Math.floor(lng + dLng); lo++) {
        const nLat = Math.min(Math.max(lat, la), la + 1), nLng = Math.min(Math.max(lng, lo), lo + 1);
        const d = miles(lat, lng, nLat, nLng);
        if (d <= R) out.push({ key: `${la}_${lo}`, d });
      }
    }
    return out.sort((a, b) => a.d - b.d);
  }
  const wantRestaurants = () => finder.cats.has("restaurant");
  function updateEstimate() {
    const ok = finder.origin && finder.cats.size;
    $("#findGo").disabled = !ok || finder.running;
    $("#estimate").textContent = !ok
      ? finder.origin ? "Pick at least one location type." : "Set your location first."
      : "Free · no limits";
  }

  // ---- scoring
  function classify(code, name) {
    switch (code) {
      case "k": return "korean_bbq";
      case "m": return "mall";
      case "g": return "gas";
      case "l": return HOT_FOOD.test(name) ? "liquor_hot" : "liquor_nofood";
      case "b": return "bowling";
      case "a": return "arcade";
      default: return "restaurant";
    }
  }
  function makePlace(row) {
    const [name, lat, lng, code, phone, street, city, state] = row;
    const dist = miles(finder.origin.lat, finder.origin.lng, lat, lng);
    if (dist > finder.radius) return null;
    const cat = classify(code, name);
    if (!finder.cats.has(cat)) return null;
    let w = CAT[cat].weight;
    const flags = [];
    let tag = "";
    if (cat === "korean_bbq") {
      if (KBBQ.test(name)) tag = "BBQ";
      else { w = 3; flags.push("Korean, check if it's BBQ"); }
    }
    if (cat === "gas") {
      if (HOT_FOOD.test(name)) tag = "Hot food (likely)";
      else { w = 1.8; flags.push("Hot food? Check on Maps"); } // Gage: hot food is what makes gas stations good
    }
    if (cat === "liquor_hot") tag = "Hot food (likely)";
    if (cat === "liquor_nofood") flags.push("Hot food? Check on Maps");
    if (cat === "mall") flags.push("Check reviews: dead malls lose money");
    if (SMOKE.test(name)) { w *= 0.3; flags.push("Smoke shop: Gage skips these"); }
    const score = Math.round(100 * (0.75 * (w / 5.5) + 0.25 * (1 - dist / finder.radius)));
    const address = [street, city, state].filter(Boolean).join(", ");
    return { name, lat, lng, cat, phone, address, city, state, dist, flags, tag, score };
  }

  function mapsUrl(p) {
    // With an address Google lands on the exact business; without one, search the name at the pin.
    return p.address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name}, ${p.address}`)}`
      : `https://www.google.com/maps/search/${encodeURIComponent(p.name)}/@${p.lat},${p.lng},17z`;
  }
  function prettyPhone(ph) {
    const d = (ph || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
    return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : ph || "";
  }

  // ---- run
  $("#findGo").addEventListener("click", runSearch);
  $("#findStop").addEventListener("click", () => (finder.stop = true));

  async function loadIndex() {
    if (finder.index) return finder.index;
    const r = await window.__vhFetch("places/index.json");
    if (!r.ok) throw new Error("Location data isn't available right now. Try again in a minute.");
    return (finder.index = await r.json());
  }

  async function runSearch() {
    if (!finder.origin || finder.running) return;
    $("#finderErr").textContent = "";
    finder.running = true;
    finder.stop = false;
    finder.places = [];
    finder.hiddenCats = new Set();
    finder.shown = 60;
    $("#finderStats").innerHTML = "";
    updateEstimate();
    $("#finderProgress").hidden = false;
    $("#finderResults").hidden = false;
    ensureMap();

    try {
      const index = await loadIndex();
      const tiles = tilesFor(finder.origin.lat, finder.origin.lng, finder.radius);
      const files = [];
      for (const t of tiles) {
        if (index.tiles.core[t.key]) files.push(`places/core/${t.key}.json`);
        if (wantRestaurants() && index.tiles.rest[t.key]) files.push(`places/rest/${t.key}.json`);
      }
      let done = 0, lastRender = 0;
      const progress = () => {
        $("#fProgBar").style.width = `${files.length ? (done / files.length) * 100 : 100}%`;
        $("#fProgSub").textContent = `${finder.places.length.toLocaleString()} places found`;
      };
      progress();
      let i = 0;
      async function worker() {
        while (i < files.length && !finder.stop) {
          const f = files[i++];
          try {
            const r = await window.__vhFetch(f);
            if (r.ok) for (const row of await r.json()) { const p = makePlace(row); if (p) finder.places.push(p); }
          } catch { /* one missing tile shouldn't sink the search */ }
          done++;
          progress();
          if (Date.now() - lastRender > 400) { lastRender = Date.now(); renderResults(); }
        }
      }
      await Promise.all(Array.from({ length: 4 }, worker));
      if (finder.stop) $("#finderErr").textContent = "Stopped. Showing what was found so far.";
    } catch (err) {
      $("#finderErr").textContent = err.message;
    }

    finder.running = false;
    $("#finderProgress").hidden = true;
    renderResults(true);
    renderStats();
    fitMap();
    updateEstimate();
  }

  // ---- map
  function ensureMap() {
    if (typeof L === "undefined") return;
    if (!map) {
      map = L.map("map", { preferCanvas: true, zoomControl: true });
      // Standard OSM tiles, darkened in CSS (.leaflet-tile-pane) to match the app.
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · Places: <a href="https://overturemaps.org">Overture Maps</a>',
        maxZoom: 19,
      }).addTo(map);
      markerLayer = L.layerGroup().addTo(map);
    }
    if (circleLayer) circleLayer.remove();
    const o = finder.origin;
    map.setView([o.lat, o.lng], 8); // the map needs a view before a circle can be projected onto it
    circleLayer = L.layerGroup([
      L.circle([o.lat, o.lng], { radius: finder.radius * 1609.34, color: "#2FE3E6", weight: 1, fillOpacity: 0.03 }),
      L.circleMarker([o.lat, o.lng], { radius: 7, color: "#fff", weight: 2, fillColor: "#2FE3E6", fillOpacity: 1 }).bindTooltip("You"),
    ]).addTo(map);
    requestAnimationFrame(fitMap);
  }
  /** Leaflet measures its box once; re-measure after the results area becomes visible. */
  function fitMap() {
    if (!map || !circleLayer) return;
    map.invalidateSize();
    map.fitBounds(circleLayer.getLayers()[0].getBounds(), { padding: [10, 10] });
  }

  // ---- results list
  ["input", "change"].forEach((ev) => {
    $("#resFilter").addEventListener(ev, () => { finder.shown = 60; renderResults(true); });
    $("#resSort").addEventListener(ev, () => { finder.shown = 60; renderResults(true); });
  });
  $("#moreBtn").addEventListener("click", () => { finder.shown += 60; renderResults(false); });

  function filtered() {
    const f = $("#resFilter").value.trim().toLowerCase();
    let list = finder.places.filter((p) => !finder.hiddenCats.has(p.cat));
    if (f) list = list.filter((p) => (p.name + " " + p.address).toLowerCase().includes(f));
    const sort = $("#resSort").value;
    list.sort((a, b) => (sort === "dist" ? a.dist - b.dist : sort === "phone" ? !!b.phone - !!a.phone || b.score - a.score : b.score - a.score));
    return list;
  }

  /** Stat cards above the map: counts animate up once a search finishes. */
  function renderStats() {
    const all = finder.places;
    const withPhone = all.filter((p) => p.phone).length;
    const top = all.filter((p) => ["korean_bbq", "mall", "bowling", "arcade", "liquor_hot"].includes(p.cat) || (p.cat === "gas" && p.tag)).length;
    $("#finderStats").innerHTML = `
      <div class="stat"><span class="label">Places found</span><div class="stat-num gold-num pop"><span data-count="${all.length}">0</span></div><p class="stat-cap">within ${finder.radius} miles</p></div>
      <div class="stat"><span class="label">With a phone number</span><div class="stat-num sm okc"><span data-count="${withPhone}">0</span></div><p class="stat-cap">ready to call</p></div>
      <div class="stat"><span class="label">Top-tier spots</span><div class="stat-num sm"><span data-count="${top}">0</span></div><p class="stat-cap">KBBQ, malls, bowling, arcades, hot food</p></div>`;
    countUps($("#finderStats"));
  }

  function renderResults(updateMap = true) {
    const all = finder.places;
    const counts = {};
    all.forEach((p) => (counts[p.cat] = (counts[p.cat] || 0) + 1));
    $("#resultCats").innerHTML = CATS.filter((c) => counts[c.key]).map(
      (c) => `<button class="chip ${finder.hiddenCats.has(c.key) ? "" : "active"}" data-k="${c.key}"><span class="dot" style="background:${c.color}"></span>${c.label} · ${counts[c.key].toLocaleString()}</button>`,
    ).join("");
    $$("#resultCats .chip").forEach((b) =>
      b.addEventListener("click", () => {
        const k = b.dataset.k;
        finder.hiddenCats.has(k) ? finder.hiddenCats.delete(k) : finder.hiddenCats.add(k);
        finder.shown = 60;
        renderResults(true);
      }),
    );

    const list = filtered();
    $("#resCount").textContent = all.length
      ? `${list.length.toLocaleString()} of ${all.length.toLocaleString()} places${finder.running ? " (still loading…)" : ""}`
      : finder.running ? "Loading…" : "Nothing found. Try a bigger radius or more location types.";

    $("#resList").innerHTML = list.slice(0, finder.shown).map(placeCard).join("");
    renderSelBar();
    $("#moreBtn").hidden = list.length <= finder.shown;

    if (updateMap && markerLayer) {
      markerLayer.clearLayers();
      list.slice(0, 6000).forEach((p) => {
        L.circleMarker([p.lat, p.lng], { radius: 5, weight: 1, color: "#0A0A0C", fillColor: CAT[p.cat].color, fillOpacity: 0.95 })
          .bindPopup(`<b>${esc(p.name)}</b><br>${esc(CAT[p.cat].label)} · ${p.dist.toFixed(1)} mi${p.phone ? `<br>${esc(prettyPhone(p.phone))}` : ""}<br><a href="${esc(mapsUrl(p))}" target="_blank" rel="noopener">Open in Google Maps</a>`)
          .addTo(markerLayer);
      });
    }
  }

  function placeCard(p) {
    const c = CAT[p.cat];
    const ownerQ = encodeURIComponent(`who owns ${p.name} ${p.city} ${p.state}`);
    const phone = prettyPhone(p.phone);
    const k = placeKey(p);
    const picked = finder.sel.has(k);
    return `<div class="res ${picked ? "sel" : ""}">
      <input type="checkbox" class="res-check" data-psel="${esc(k)}" ${picked ? "checked" : ""} aria-label="Select ${esc(p.name)}">
      <div>
        <div class="res-name">${esc(p.name)}</div>
        <div class="res-meta">${p.dist.toFixed(1)} mi${p.address ? ` · ${esc(p.address)}` : ""}</div>
        <div class="res-tags">
          <span class="badge mute"><span class="dot" style="background:${c.color}"></span>${c.label}</span>
          ${p.tag ? `<span class="badge ok">${esc(p.tag)}</span>` : ""}
          ${p.flags.map((f) => `<span class="badge">${esc(f)}</span>`).join("")}
        </div>
      </div>
      <div class="res-score"><div class="n">${p.score}</div><div class="l">match</div></div>
      <div class="res-actions">
        <a href="${esc(mapsUrl(p))}" target="_blank" rel="noopener" class="maps-link">Google Maps · reviews</a>
        ${phone ? `<a href="tel:${esc(p.phone.replace(/[^\d+]/g, ""))}">${esc(phone)}</a>` : ""}
        <a href="https://www.google.com/search?q=${ownerQ}" target="_blank" rel="noopener">Find owner</a>
        <a href="#" data-dwell-name="${esc(p.name)}" data-dwell-cat="${p.cat}">Dwell check</a>
        ${leadIds.has(k) ? `<a href="#" class="saved" data-tab-link="leads">Saved ✓</a>` : `<a href="#" data-psave="${esc(k)}">Save</a>`}
      </div>
    </div>`;
  }

  $("#csvBtn").addEventListener("click", () => {
    const rows = [["Name", "Type", "Match score", "Miles", "Phone", "Address", "Google Maps", "Notes"]];
    filtered().forEach((p) =>
      rows.push([p.name, CAT[p.cat].label, p.score, p.dist.toFixed(1), prettyPhone(p.phone), p.address, mapsUrl(p), [p.tag, ...p.flags].filter(Boolean).join("; ")]),
    );
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    downloadCsv(csv, `locations-${finder.radius}mi.csv`).catch((err) => ($("#finderErr").textContent = err.message));
  });

  // Runs last so everything setOrigin touches (geometry helpers, estimate) is defined.
  const savedOrigin = store.get("ic_origin", null);
  if (savedOrigin?.lat) setOrigin(savedOrigin);
  else updateEstimate();

  // =================================================================== DWELL CHECK
  // Rule-based ($0): scores a spot on what Gage says made his machines sell (people stuck waiting,
  // hot food, a spot everyone walks past) and what killed them (card shop nearby, smoke shops,
  // wealthy areas, rent/leases, no Wi-Fi). Quotes are Gage's own words from the knowledge pack.
  const DWELL_TYPES = [
    { v: "kbbq", label: "Korean BBQ", pts: 22, ref: "$5,000–6,000/mo" },
    { v: "arcade", label: "Arcade", pts: 20, ref: "$2,000–2,500/mo" },
    { v: "bowling", label: "Bowling alley", pts: 18, ref: "~$2,500/mo" },
    { v: "family", label: "Trampoline park / mini golf / family fun", pts: 16, ref: "" },
    { v: "mall", label: "Mall", pts: 14, ref: "$4,000+/mo, busy malls only" },
    { v: "convenience", label: "Convenience store / 7-Eleven", pts: 14, ref: "$1,500–2,000/mo (his 7-Eleven)" },
    { v: "gas", label: "Gas station", pts: 12, ref: "$2,000–4,000/mo with hot food" },
    { v: "liquor", label: "Liquor store", pts: 12, ref: "$1,000–1,700/mo, more with hot food" },
    { v: "restaurant", label: "Restaurant", pts: 12, ref: "$1,000–2,500/mo" },
    { v: "smoke", label: "Smoke / vape shop", pts: 0, ref: "" },
    { v: "other", label: "Something else", pts: 8, ref: "" },
  ];
  // Each option: [value, label, points, ✓/✕ line (empty = say nothing), deal-breaker name (forces red)]
  const DWELL_QS = [
    { k: "wait", q: "Do customers wait or hang around?", opts: [
      ["long", "Yes, 5+ minutes (food, tables, games, lanes)", 22, "✓ People are stuck there. Gage: \"They have to sit there, they have to wait, they have to be present, and it forces them to have a higher chance of seeing the machine and impulsively buying.\""],
      ["some", "A few minutes", 10, ""],
      ["no", "In and out", -10, "✕ In and out means almost no time to notice the machine. Gage's best spots all have people waiting around."] ] },
    { k: "hot", q: "Do they serve hot food?", opts: [
      ["yes", "Yes", 12, "✓ Hot food means people wait. Gage: \"If they are serving hot food inside of the gas station it can do $3,000+ a month.\""],
      ["no", "No", 0, ""],
      ["na", "Not a food place", 0, ""] ] },
    { k: "busy", q: "How busy is it? (the Google review count is a good tell)", opts: [
      ["high", "Always busy / 500+ reviews", 14, "✓ Busy and people stay: that's the combo."],
      ["mid", "Steady / 100–500 reviews", 8, ""],
      ["low", "Quiet / under 100 reviews", 0, "✕ Low traffic. Check it at its busiest time before you pitch."],
      ["unsure", "Not sure yet", 6, ""],
      ["dead", "Dead / mostly empty", -20, "✕ Dead traffic is how Gage lost thousands on a mall spot. Skip dead locations.", "Dead foot traffic"] ] },
    { k: "spot", q: "Is there a spot every customer walks past? (front door, register, waiting area)", opts: [
      ["yes", "Yes", 12, "✓ Gage: \"The machine has to sit where every single customer sees it at least once, or better, twice.\""],
      ["maybe", "Maybe", 4, "✕ Find the exact spot by the register or front door before you pitch. Corners kill sales."],
      ["unsure", "Not sure yet", 4, ""],
      ["no", "No, it'd be tucked away", -8, "✕ Tucked away means fewer eyeballs. Gage: \"More eyeballs equal more sales.\""] ] },
    { k: "wifi", q: "Reliable Wi-Fi and an outlet near that spot?", opts: [
      ["yes", "Yes", 6, ""],
      ["unsure", "Not sure", 0, "✕ Check the Wi-Fi at the exact spot. About 1 in 5 of Gage's spots needed a Wi-Fi booster."],
      ["no", "No", -6, "✕ No Wi-Fi means no card sales. Bring a booster or skip it. Gage's mall spot failed partly because it had no Wi-Fi."] ] },
    { k: "cards", q: "Is there a card shop nearby that sells Pokémon cards?", opts: [
      ["no", "No", 6, "✓ No card shop nearby, so your machine is the convenient option."],
      ["unsure", "Not sure", 0, "✕ Check Google Maps for card shops within a couple of miles."],
      ["yes", "Yes", -18, "✕ Gage: \"I did place a machine kind of close to a Pokémon shop that sold cards and it didn't perform.\"", "Card shop nearby"] ] },
    { k: "area", q: "Who shops there?", opts: [
      ["everyday", "Everyday people, families, impulse buyers", 8, "✓ The machine runs on impulse buys from everyday customers."],
      ["mixed", "A mix", 3, ""],
      ["wealthy", "Mostly a wealthy crowd", -10, "✕ High-income areas underperformed on Gage's route. Impulse buyers are who buys packs."] ] },
    { k: "cost", q: "What would the owner want?", opts: [
      ["share", "A revenue share, no rent", 6, "✓ Free placement plus a revenue share is how Gage does every spot."],
      ["unsure", "Don't know yet", 0, ""],
      ["rent", "Rent or a lease I'd have to sign", -14, "✕ Careful. Gage's mall lease was $600/month on a 6-month term and he \"ended up taking a big loss of multiple thousands of dollars.\"", "Rent or a lease"] ] },
    { k: "kids", q: "Do families, kids or groups come in?", opts: [
      ["yes", "Yes, a lot", 6, "✓ Kids ask, parents pay, groups buy together."],
      ["some", "Some", 3, ""],
      ["no", "Not really", 0, ""] ] },
  ];
  const DWELL_MAX = 22 + DWELL_QS.reduce((n, q) => n + Math.max(...q.opts.map((o) => o[2])), 0);
  const dwell = { prefill: null, last: null, list: [] };

  // ---- auto Dwell Check from a pasted Google Maps link ($0: our place tiles + census income)
  const CARD_RADIUS_MI = 2; // shops listed within this; only those within 1 mile count against the spot
  const CARD_SHOP = /card|pok[eé]mon|\btcg\b|comic|game|collect/i;
  const tileCache = new Map();
  async function loadTile(kind, la, lo) {
    const key = `${kind}/${la}_${lo}`;
    if (!tileCache.has(key)) {
      tileCache.set(key, (async () => {
        if (!finder.index) await loadIndex();
        if (!finder.index.tiles[kind]?.[`${la}_${lo}`]) return [];
        const r = await window.__vhFetch(`places/${kind}/${la}_${lo}.json`);
        return r.ok ? r.json() : [];
      })());
    }
    return tileCache.get(key);
  }
  /** Rows from every tile within `mi` miles of a point. */
  async function rowsNear(kind, lat, lng, mi) {
    const dLat = mi / 69, dLng = mi / (69.172 * Math.max(0.05, Math.cos(rad(lat))));
    const jobs = [];
    for (let la = Math.floor(lat - dLat); la <= Math.floor(lat + dLat); la++)
      for (let lo = Math.floor(lng - dLng); lo <= Math.floor(lng + dLng); lo++) jobs.push(loadTile(kind, la, lo));
    return (await Promise.all(jobs)).flat();
  }
  const normName = (s) => (s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 1 && !["the", "and", "inc", "llc"].includes(w));
  function nameSim(a, b) {
    const A = new Set(normName(a)), B = new Set(normName(b));
    if (!A.size || !B.size) return 0;
    let hit = 0;
    A.forEach((w) => B.has(w) && hit++);
    return hit / Math.min(A.size, B.size);
  }
  function typeFromName(n) {
    const s = (n || "").toLowerCase();
    if (/smoke|vape|hookah|tobacco|cigar/.test(s)) return "smoke";
    if (/korean|k-?bbq|gogi/.test(s)) return "kbbq";
    if (/arcade|round ?1|dave ?& ?buster|main event|game ?works/.test(s)) return "arcade";
    if (/bowl/.test(s)) return "bowling";
    if (/trampoline|sky ?zone|mini ?golf|golf n|fun ?center|family fun|laser tag/.test(s)) return "family";
    if (/liquor|wine|spirits|beer/.test(s)) return "liquor";
    if (/7-?eleven|circle k|ampm|am\/pm|food mart|mini ?mart|market/.test(s)) return "convenience";
    if (/\b(gas|fuel|chevron|shell|arco|mobil|exxon|76|valero|speedway|sunoco|bp)\b/.test(s)) return "gas";
    if (/\bmall\b|town center|galleria|outlets?/.test(s)) return "mall";
    if (/cafe|café|grill|restaurant|diner|kitchen|bbq|taqueria|pizza|burger|sushi|ramen|pho|bistro|eatery|wings|tacos?/.test(s)) return "restaurant";
    return "other";
  }
  const CODE_TO_DWELL = { k: "kbbq", m: "mall", g: "gas", l: "liquor", b: "bowling", a: "arcade", r: "restaurant" };

  async function autoDwell(link) {
    const msg = $("#dwellLinkMsg");
    msg.style.color = "";
    msg.textContent = "Reading the link…";
    const place = await apiJSON(`/api/place-lookup?url=${encodeURIComponent(link)}`);
    msg.textContent = `Found ${place.name || "the spot"}. Checking the area…`;

    const [core, rest, cards] = await Promise.all([
      rowsNear("core", place.lat, place.lng, 0.3), rowsNear("rest", place.lat, place.lng, 0.3), rowsNear("cards", place.lat, place.lng, CARD_RADIUS_MI),
    ]);
    // Match the pasted business to our data: closest place with a similar name within ~0.25 mi.
    let match = null, best = 0;
    for (const row of [...core, ...rest]) {
      const d = miles(place.lat, place.lng, row[1], row[2]);
      if (d > 0.25) continue;
      const sim = nameSim(place.name, row[0]) - d; // a tie on name goes to the closer one
      if (sim > best && nameSim(place.name, row[0]) >= 0.5) { best = sim; match = { row, d }; }
    }
    let type = match ? CODE_TO_DWELL[match.row[3]] : typeFromName(place.name);
    if (type === "kbbq" && !KBBQ.test(place.name || match?.row[0] || "")) type = "restaurant";
    if (type !== "smoke" && SMOKE.test(place.name || "")) type = "smoke";

    const name = place.name || match?.row[0] || "";
    const hotByName = HOT_FOOD.test(name);
    const answers = {};
    answers.hot = ["restaurant", "kbbq"].includes(type) ? "yes" : ["gas", "liquor", "convenience"].includes(type) ? (hotByName ? "yes" : "no") : "na";
    answers.wait = ["kbbq", "restaurant", "bowling", "arcade", "family"].includes(type) ? "long"
      : type === "mall" || answers.hot === "yes" ? "some" : type === "smoke" ? "no" : ["gas", "liquor", "convenience"].includes(type) ? "no" : "some";
    answers.busy = "unsure";
    answers.spot = "unsure";
    answers.wifi = "unsure";
    answers.cost = "unsure";
    const nearCards = cards
      .map((c) => ({ name: c[0], d: miles(place.lat, place.lng, c[1], c[2]) }))
      // "Hobby shop" also covers RC-car and model shops; only count names that point to cards/comics/games.
      .filter((c) => c.d <= CARD_RADIUS_MI && CARD_SHOP.test(c.name) && nameSim(c.name, name) < 0.5)
      .sort((a, b) => a.d - b.d);
    // Within a mile is a deal-breaker (Gage: "kind of close"); 1-2 miles is listed so the student can judge.
    answers.cards = nearCards.some((c) => c.d <= 1) ? "yes" : "no";
    answers.area = place.income == null ? "mixed" : place.income >= 150000 ? "wealthy" : place.income >= 100000 ? "mixed" : "everyday";
    answers.kids = ["kbbq", "bowling", "arcade", "family", "mall"].includes(type) ? "yes" : ["liquor", "smoke"].includes(type) ? "no" : "some";

    const auto = {
      matched: match ? `${match.row[0]}${match.row[5] ? `, ${match.row[5]}` : ""}${match.row[6] ? `, ${match.row[6]}` : ""}` : "",
      phone: match?.row[4] || "",
      income: place.income,
      cards: nearCards.slice(0, 3),
      link,
      lat: place.lat, lng: place.lng,
    };
    msg.textContent = "";
    return { name, type, answers, auto };
  }

  function autoSummaryHTML(rec) {
    const a = rec.auto;
    if (!a) return "";
    const typeLabel = DWELL_TYPES.find((t) => t.v === rec.type)?.label ?? "Unknown";
    const inc = a.income == null ? "Not available" : `$${a.income.toLocaleString()} median household income${a.income >= 150000 ? " (wealthy area)" : a.income >= 100000 ? " (above average)" : ""}`;
    const cardsLine = a.cards.length
      ? a.cards.map((c) => `${esc(c.name)} (${c.d.toFixed(1)} mi)`).join(", ")
      : `None found within ${CARD_RADIUS_MI} miles`;
    return `<div class="section reveal"><h2 class="section-title">What we checked</h2>
      <p class="section-lead">Pulled automatically from the link. The ones marked "not sure" need your eyes on a visit or a call.</p>
      <div class="table">
        <div class="trow"><span class="label" style="margin:0;min-width:130px">Type</span><span class="grow">${esc(typeLabel)}${a.matched ? ` <span class="t4 small">· matched ${esc(a.matched)}</span>` : ""}</span></div>
        <div class="trow"><span class="label" style="margin:0;min-width:130px">Card / game shops nearby</span><span class="grow" style="white-space:normal">${cardsLine}</span></div>
        <div class="trow"><span class="label" style="margin:0;min-width:130px">Area</span><span class="grow" style="white-space:normal">${inc}</span></div>
        ${a.phone ? `<div class="trow"><span class="label" style="margin:0;min-width:130px">Phone</span><span class="grow"><a href="tel:${esc(a.phone.replace(/[^\d+]/g, ""))}">${esc(prettyPhone(a.phone))}</a></span></div>` : ""}
        <div class="trow"><span class="label" style="margin:0;min-width:130px">Check on a visit</span><span class="grow" style="white-space:normal">How busy it is (<a href="${esc(a.link)}" target="_blank" rel="noopener">see Google reviews</a>), the exact spot by the register, Wi-Fi, and what the owner wants</span></div>
      </div></div>`;
  }

  function renderDwellForm(pre = {}) {
    const ans = pre.answers || {};
    $("#dwellForm").innerHTML = `
      <div class="dq link-box"><span class="label">Fastest: paste a Google Maps link</span>
        <div class="addr-form"><input id="dwellLink" placeholder="https://maps.app.goo.gl/…" inputmode="url" value="${esc(pre.auto?.link || "")}"><button type="button" class="btn btn-primary" id="dwellLinkGo">Check link</button></div>
        <span class="small t4" id="dwellLinkMsg">In Google Maps: open the business → Share → Copy link.</span></div>
      <div class="or-line"><span>or answer the questions</span></div>
      <label class="dq full"><span class="label">Business name (optional)</span><input name="name" maxlength="120" value="${esc(pre.name || "")}" placeholder="e.g. Speedy Mart on Telegraph"></label>
      <div class="dq"><span class="label">What kind of place?</span>
        <div class="chips">${DWELL_TYPES.map((t) => `<button type="button" class="chip ${pre.type === t.v ? "active" : ""}" data-q="type" data-v="${t.v}">${t.label}</button>`).join("")}</div></div>
      ${DWELL_QS.map((q, i) => `<div class="dq"><span class="label">${String(i + 1).padStart(2, "0")} · ${q.q}</span>
        <div class="chips">${q.opts.map((o) => `<button type="button" class="chip ${ans[q.k] === o[0] ? "active" : ""}" data-q="${q.k}" data-v="${o[0]}">${o[1]}</button>`).join("")}</div></div>`).join("")}
      <div class="form-foot"><button class="btn btn-primary" type="submit">Check this spot</button><span class="small t4" id="dwellMissing"></span></div>`;
  }
  async function runLinkCheck() {
    const link = $("#dwellLink").value.trim();
    const msg = $("#dwellLinkMsg");
    if (!link) return (msg.textContent = "Paste a Google Maps link first.");
    $("#dwellLinkGo").disabled = true;
    try {
      const { name, type, answers, auto } = await autoDwell(link);
      const rec = { name, type, answers, auto, ...scoreDwell(type, answers) };
      showDwellResult(rec);
      saveDwell(rec);
    } catch (err) {
      msg.textContent = err.message;
      msg.style.color = "var(--danger)";
    } finally {
      if ($("#dwellLinkGo")) $("#dwellLinkGo").disabled = false;
    }
  }
  $("#dwellForm").addEventListener("click", (e) => { if (e.target.closest("#dwellLinkGo")) runLinkCheck(); });
  $("#dwellForm").addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.id === "dwellLink") { e.preventDefault(); runLinkCheck(); } });

  // One answer per question: clicking a chip selects it and clears its siblings.
  $("#dwellForm").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip[data-q]");
    if (!chip) return;
    $$(`.chip[data-q="${chip.dataset.q}"]`, $("#dwellForm")).forEach((c) => c.classList.toggle("active", c === chip));
    $("#dwellMissing").textContent = "";
  });

  function dwellAnswers() {
    const out = {};
    $$("#dwellForm .chip.active").forEach((c) => (out[c.dataset.q] = c.dataset.v));
    return out;
  }

  function scoreDwell(type, answers) {
    const t = DWELL_TYPES.find((x) => x.v === type);
    let pts = t.pts;
    const reasons = [];
    let hardRed = type === "smoke" ? "Smoke shop" : "";
    if (type === "smoke") reasons.push("✕ Gage on smoke shops: \"The people that go in there are looking to spend $15 on backwoods and vapes, not a pack of Pokémon. It's the demographic.\"");
    for (const q of DWELL_QS) {
      const o = q.opts.find((x) => x[0] === answers[q.k]);
      if (!o) continue;
      let p = o[2];
      // Hot food is what separates a $1k gas/liquor spot from a $3k one, so it counts extra there.
      if (q.k === "hot" && o[0] === "yes" && (type === "gas" || type === "liquor" || type === "convenience")) p += 4;
      pts += p;
      // For sit-down food spots the gas-station quote doesn't fit; say it plainly instead.
      if (q.k === "hot" && o[0] === "yes" && (type === "restaurant" || type === "kbbq")) reasons.push("✓ Sit-down food means people wait for it, and waiting is when they notice the machine.");
      else if (o[3]) reasons.push(o[3]);
      if (o[4]) hardRed ||= o[4];
    }
    if ((type === "gas" || type === "liquor") && answers.hot === "no") {
      reasons.push("✕ No hot food. Gage's beach liquor store with no hot food does \"$1,000 to $1,500, $1,700 a month\"; \"the one with hot food just does more.\"");
    }
    const score = Math.max(0, Math.min(100, Math.round((pts / DWELL_MAX) * 100)));
    const verdict = hardRed ? "red" : score >= 65 ? "green" : score >= 42 ? "yellow" : "red";
    return { score, verdict, reasons, ref: t.ref, typeLabel: t.label, hardRed };
  }

  const VERDICT = {
    green: { title: "Go get this spot.", badge: "ok", label: "Green light" },
    yellow: { title: "Check it first.", badge: "", label: "Worth a walk-in" },
    red: { title: "Skip it.", badge: "bad", label: "Red flag" },
  };
  const NEXT = {
    green: [
      "Find the owner, not the front desk. Skip trace the owner's name and call the first wireless number.",
      "Open like Gage: \"Hey [name]\", then \"I don't know if we've met yet.\"",
      "Ask for the spot by the register or front door, and offer a two-month trial so they don't feel locked in.",
    ],
    yellow: [
      "Walk in at their busiest time and see if people actually wait around.",
      "Fix every ✕ above before you pitch (find the exact spot, check the Wi-Fi, check for card shops).",
      "If it still looks good, call the owner. If not, move on to the next spot on your list.",
    ],
    red: [
      "Don't spend your first machine here. Gage still pulls about 1 in 10 machines, so start with your strongest spot.",
      "Go back to Locations and run a Dwell Check on your next best option.",
    ],
  };

  function showDwellResult(rec) {
    const v = VERDICT[rec.verdict];
    $("#dwellForm").hidden = true;
    $("#dwellHistoryWrap").hidden = true;
    const box = $("#dwellResult");
    box.innerHTML = `
      <div class="stats stagger">
        <div class="stat"><span class="label">Dwell score</span><div class="stat-num gold-num pop"><span data-count="${rec.score}">0</span><small class="t4" style="font-size:.35em">/100</small></div><p class="stat-cap">${esc(rec.name || rec.typeLabel)}</p></div>
        <div class="stat"><span class="label">Verdict</span><div style="margin:10px 0 4px"><span class="badge ${v.badge}">${v.label}</span></div><p class="stat-cap">${rec.hardRed ? `Deal-breaker: ${esc(rec.hardRed)}` : "Based on Gage's route"}</p></div>
        <div class="stat"><span class="label">Gage's route, this type</span><div class="stat-num sm">${rec.ref ? esc(rec.ref.split(/, | with /)[0]) : "–"}</div><p class="stat-cap">His own numbers in monthly sales, not a promise</p></div>
      </div>
      <div class="quote-block reveal"><span class="label">${esc(rec.typeLabel)}</span><p class="quote-big">${v.title}</p></div>
      ${autoSummaryHTML(rec)}
      ${rec.reasons.length ? `<div class="section reveal"><h2 class="section-title">Why</h2><div style="height:22px"></div><ul class="check-list">${rec.reasons.map((r) => {
        const ok = r.startsWith("✓");
        return `<li><span class="mk ${ok ? "yes" : "no"}">${ok ? "✓" : "✕"}</span><span>${esc(r.slice(2))}</span></li>`;
      }).join("")}</ul></div>` : ""}
      <div class="section reveal"><h2 class="section-title">Next</h2><div style="height:22px"></div>
        <div class="num-list stagger">${NEXT[rec.verdict].map((n, i) => `<div class="num-row"><span class="marker">${i + 1}</span><p>${esc(n)}</p></div>`).join("")}</div></div>
      <div class="result-actions">
        <button class="btn btn-primary" id="dwellAgain">Check another spot</button>
        <button class="btn" id="dwellEdit">Change answers</button>
      </div>`;
    box.hidden = false;
    box.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    observeReveals(box);
    countUps(box);
    $("#dwellAgain").addEventListener("click", () => openDwell({}));
    $("#dwellEdit").addEventListener("click", () => openDwell({ name: rec.name, type: rec.type, answers: rec.answers, auto: rec.auto }));
  }

  function openDwell(pre) {
    dwell.auto = pre.auto || null;
    $("#dwellResult").hidden = true;
    $("#dwellForm").hidden = false;
    renderDwellForm(pre);
    renderDwellHistory();
    window.scrollTo(0, 0);
  }

  $("#dwellForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const answers = dwellAnswers();
    const type = answers.type;
    delete answers.type;
    const missing = (type ? 0 : 1) + DWELL_QS.filter((q) => !answers[q.k]).length;
    if (missing) return ($("#dwellMissing").textContent = `Answer ${missing} more question${missing > 1 ? "s" : ""} to get a verdict.`);
    const name = $("[name=name]", $("#dwellForm")).value.trim();
    const rec = { name, type, answers, auto: dwell.auto, ...scoreDwell(type, answers) };
    showDwellResult(rec);
    saveDwell(rec);
  });

  async function saveDwell(rec) {
    const body = { name: rec.name, type: rec.type, answers: rec.answers, score: rec.score, verdict: rec.verdict, auto: rec.auto || null };
    try {
      const j = await apiJSON("/api/dwell", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      dwell.list.unshift({ id: j.id, at: j.at, ...body });
    } catch { /* result still shows; it just isn't saved */ }
  }

  async function loadDwell() {
    try { dwell.list = (await apiJSON("/api/dwell")).checks || []; } catch { dwell.list = []; }
  }
  const dwellRow = (c) => `<div class="trow click" data-dwell-id="${esc(c.id)}" tabindex="0" role="button">
        <span class="grow">${esc(c.name || (DWELL_TYPES.find((t) => t.v === c.type)?.label ?? "Spot"))}</span>
        <span class="badge ${VERDICT[c.verdict]?.badge ?? "mute"}">${esc(VERDICT[c.verdict]?.label ?? "")}</span>
        <span class="score" style="color:var(--accent)">${esc(c.score)}</span></div>`;
  function renderDwellHistory() {
    $("#dwellHistoryWrap").hidden = !dwell.list.length;
    $("#dwellHistory").innerHTML = dwell.list.map(dwellRow).join("");
    bindDwellRows($("#dwellHistory"));
  }
  // Rows open the saved check (from the dashboard too, which switches to Dwell Check first).
  function bindDwellRows(root) {
    $$(".trow[data-dwell-id]", root).forEach((el) => {
      const c = dwell.list.find((x) => x.id === el.dataset.dwellId);
      const open = () => {
        if ($("#tab-dwell").hidden) selectTab("dwell");
        showDwellResult({ name: c.name, type: c.type, answers: c.answers, auto: c.auto || null, ...scoreDwell(c.type, c.answers) });
      };
      el.addEventListener("click", open);
      el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
    });
  }

  // "Dwell check" on a place card in Locations jumps here with the name and type filled in.
  const FINDER_TO_DWELL = { korean_bbq: "kbbq", mall: "mall", gas: "gas", liquor_hot: "liquor", liquor_nofood: "liquor", bowling: "bowling", arcade: "arcade", restaurant: "restaurant" };
  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-dwell-name]");
    if (!a) return;
    e.preventDefault();
    dwell.prefill = { name: a.dataset.dwellName, type: FINDER_TO_DWELL[a.dataset.dwellCat] || "other" };
    selectTab("dwell");
  });

  // =================================================================== SHARED PAGE PIECES
  const loomId = (link) => (String(link).match(/loom\.com\/(?:share|embed)\/([0-9a-f]{20,})/i) || [])[1] || "";
  const sheetId = (link) => (String(link).match(/\/spreadsheets\/d\/([\w-]+)/) || [])[1] || (/^[\w-]{25,}$/.test(link) ? link : "");
  const docId = (link) => (String(link).match(/\/document\/d\/([\w-]+)/) || [])[1] || (/^[\w-]{25,}$/.test(link) ? link : "");
  function videoCard(v) {
    const id = loomId(v.url);
    return `<div class="video-card">
      ${id
        ? `<div class="video-frame"><iframe src="https://www.loom.com/embed/${id}?hide_owner=true&hide_share=true&hide_title=true" title="${esc(v.title)}" allow="fullscreen; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`
        : `<div class="video-frame video-empty"><span class="drop-ico" aria-hidden="true">▶</span><span class="small t4">Video coming soon</span></div>`}
      <p class="card-title">${esc(v.title)}</p>
      ${v.sub ? `<p class="small t3">${esc(v.sub)}</p>` : ""}
    </div>`;
  }
  const emptyCard = (label, title, text) => `<div class="card empty-card"><span class="label">${esc(label)}</span><p class="card-title">${esc(title)}</p><p class="small t3">${esc(text)}</p></div>`;
  function sheetEmbed(link, title) {
    const id = sheetId(link);
    return `<div class="card doc-card"><iframe title="${esc(title)}" loading="lazy" src="https://docs.google.com/spreadsheets/d/${id}/preview"></iframe></div>
      <div class="obj-actions" style="justify-content:flex-start">
        <a class="btn" target="_blank" rel="noopener" href="https://docs.google.com/spreadsheets/d/${id}/edit?usp=sharing">Open in Google Sheets</a>
        <a class="btn" target="_blank" rel="noopener" href="https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx">Download .xlsx</a>
      </div>`;
  }
  // Saves a generated file. On the site it's a normal download; when the page runs inside a
  // claude.ai preview (which blocks plain downloads) it asks the viewer to save it instead.
  async function saveFile(name, blob) {
    const dl = window.claude?.use ? await window.claude.use("downloads").catch(() => null) : null;
    if (dl) {
      try { await dl.save({ filename: name, data: blob }); } catch (e) { if (e?.code !== "declined") throw new Error("Couldn't save the file here."); }
      return;
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // A block of text with a Copy button (templates, URLs, prompts, the discount code).
  let copySeq = 0;
  function copyBlock(text, { label = "", big = false } = {}) {
    const id = `cp${++copySeq}`;
    return `<div class="copy-block ${big ? "big" : ""}">
      ${label ? `<span class="label">${esc(label)}</span>` : ""}
      <pre id="${id}" class="copy-text">${esc(text)}</pre>
      <button class="btn btn-sm copy-btn" type="button" data-copy="${id}">Copy</button>
    </div>`;
  }
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-copy]");
    if (!b) return;
    const el = document.getElementById(b.dataset.copy);
    try {
      await navigator.clipboard.writeText(el.textContent);
      b.textContent = "Copied ✓";
    } catch {
      // Clipboard blocked: select the text so Cmd/Ctrl+C works.
      const r = document.createRange(); r.selectNodeContents(el);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      b.textContent = "Selected, press Ctrl+C";
    }
    setTimeout(() => (b.textContent = "Copy"), 1800);
  });
  const stepList = (items) => `<ol class="step-list">${items.map(([t, body]) => `<li><span class="step-n" aria-hidden="true"></span><div><p class="step-t">${t}</p>${body ? `<div class="small t3">${body}</div>` : ""}</div></li>`).join("")}</ol>`;
  const block = (label, inner) => `<div class="section-tight reveal"><p class="label">${label}</p>${inner}</div>`;

  // =================================================================== DWELL CHECK: PROVEN SPOTS
  function renderProven() {
    $("#provenBody").innerHTML = sheetId(PROVEN_SPOTS.sheet)
      ? sheetEmbed(PROVEN_SPOTS.sheet, "100 proven spots")
      : emptyCard("Coming soon", "100 proven spots", "Real locations where machines are doing well: the type of business, where the machine sits and why it works. Use them to calibrate your own checks.");
  }

  // =================================================================== CALL ANALYZER (Claude)
  const ANALYZER_PROMPTS = [
    ["Grade a call", "Grade this cold call on Gage's method. Tell me my score, what I did well, and exactly what to say instead where I slipped:\n\n[paste the transcript, or attach the recording]"],
    ["Practice an objection", "Play a gas station owner who says he doesn't have room for a machine. Push back like a real owner would. After 5 turns, grade how I handled it."],
    ["Write the follow-up", "This owner said \"send me some info\". Write the text I send right after the call, with photos mentioned and a specific time to come by."],
    ["Ask Gage", "I have a Korean BBQ spot that said yes but only has room by the bathrooms. Is it worth placing there?"],
  ];
  function renderAnalyzer() {
    const c = CLAUDE_CONNECTOR;
    const urlBox = c.url ? copyBlock(c.url, { label: "Connector URL" }) : `<div class="copy-block"><span class="label">Connector URL</span><p class="t3">Coming soon. The team will post it here.</p></div>`;
    $("#analyzerBody").innerHTML =
      block("Watch first", `<div class="video-grid one">${videoCard({ title: "Connect Claude to Pack Placement", sub: "Two minutes, once. Then it's always there.", url: c.loom })}</div>`) +
      block("Connect it (one time)", `<div class="card">${stepList([
        ["Open Claude and sign in", 'Go to <a href="https://claude.ai" target="_blank" rel="noopener">claude.ai</a> or open the Claude app.'],
        ["Open Settings, then Connectors", "Choose <b>Add custom connector</b>."],
        [`Name it <b>${esc(c.name)}</b> and paste the URL below`, urlBox],
        ["Click Add, then Connect", "Sign in if it asks. If you don't see the option, tell the team which Claude plan you're on."],
        ["Turn it on in a chat", "In a new chat, open the tools menu and make sure Pack Placement is switched on."],
      ])}</div>`) +
      block("Then ask it", `<div class="prompt-grid">${ANALYZER_PROMPTS.map(([t, p]) => `<div class="card prompt-card"><p class="card-title">${esc(t)}</p>${copyBlock(p)}</div>`).join("")}</div>`);
    observeReveals($("#analyzerBody"));
  }

  // =================================================================== GOT A YES
  const YES_EMAILS = [
    ["Same day: thank you + agreement", "Subject: Your Pokémon card machine at [Business name]",
     "Hi [Owner name],\n\nThanks again for today. Here's what we agreed:\n\n- Machine: [size / wall-mount or countertop]\n- Spot: [where it goes, e.g. by the front register]\n- Cost to you: nothing. I place, stock and maintain it.\n- Your share: [X]% of sales, paid by [check / deposit / Venmo / Zelle]\n- Trial: two months. If it's not a fit, I pick it up.\n\nThe agreement is attached [or: here's the link to sign]. It takes about two minutes.\n\nI'm planning to install on [day, date] at [time]. Does that still work?\n\nThanks,\n[Your name]\n[Your phone]"],
    ["Day before install", "Subject: See you tomorrow at [time]",
     "Hi [Owner name],\n\nQuick reminder that I'll be at [Business name] tomorrow, [day], at [time] to install the machine. It takes about [30–60] minutes and I'll need the outlet by [spot] and your Wi-Fi details.\n\nSee you then,\n[Your name]"],
    ["Agreement not signed after 2 days", "Subject: Quick one on the card machine",
     "Hi [Owner name],\n\nJust checking you got the agreement for the machine at [Business name]. Here's the link again: [link]\n\nHappy to walk through it on a quick call if that's easier. Still good for [install day]?\n\n[Your name]"],
  ];
  function renderYes() {
    const a = AGREEMENT;
    const agreement = docId(a.doc)
      ? `<div class="card doc-card"><iframe title="Placement agreement" loading="lazy" src="https://docs.google.com/document/d/${docId(a.doc)}/preview"></iframe></div>
         <div class="obj-actions" style="justify-content:flex-start"><a class="btn" target="_blank" rel="noopener" href="https://docs.google.com/document/d/${docId(a.doc)}/copy">Make my copy</a></div>`
      : emptyCard("Coming soon", "Placement agreement", "The team's agreement template goes here. Make your own copy, fill in the owner's details and send it for e-signature.");
    $("#yesBody").innerHTML =
      block("Before you hang up", `<div class="card">${stepList([
        ["Confirm the spot", "Where exactly it goes (by the door or register, where every customer sees it), and that there's an outlet and Wi-Fi."],
        ["Get their details", "Owner's full name, the best email for the agreement, and the business's legal name."],
        ["Ask how they want to get paid", "Gage's close: \"How do you want to get paid? Check, deposit, cash, Venmo, Zelle?\""],
        ["Book the install", "A specific day and time, said back to them before you hang up."],
      ])}</div>`) +
      block("Send the agreement the same day", `${agreement}
        <p class="small t3" style="margin-top:12px">${a.esignName
          ? `Send it with <a href="${esc(a.esignUrl)}" target="_blank" rel="noopener">${esc(a.esignName)}</a> so the owner can sign from their phone.`
          : "Send it with the e-signature tool the team uses, so the owner can sign from their phone."}</p>`) +
      block("Emails to send", YES_EMAILS.map(([t, subj, body]) => `<details class="card obj-item"><summary><span class="grow obj-q">${esc(t)}</span></summary>${copyBlock(`${subj}\n\n${body}`)}</details>`).join("")) +
      block("Then", `<p class="t3">Order the machine as soon as the agreement is signed. <a href="#" data-tab-link="order">Order a machine →</a></p>`);
    observeReveals($("#yesBody"));
  }

  // =================================================================== ORDER A MACHINE
  function renderOrder() {
    const o = ORDERING;
    const code = o.code
      ? `<div class="card hl hl-glow">${copyBlock(o.code, { label: "Your discount code", big: true })}<p class="small t4" style="margin-top:10px">For inner circle students only. Don't share it outside the program.</p></div>`
      : emptyCard("Discount code", "Coming soon", "The program's discount code will show here once you're logged in.");
    const steps = o.steps.length
      ? `<div class="card">${stepList(o.steps.map((s) => [esc(s), ""]))}</div>`
      : emptyCard("Coming soon", "Ordering steps", "Step by step: which machine to pick, where to enter the code, shipping and what to expect.");
    $("#orderBody").innerHTML =
      block("Your discount code", code) +
      block(o.supplier ? `Order from ${esc(o.supplier)}` : "How to order", steps + (o.url ? `<a class="btn btn-primary" style="margin-top:14px" target="_blank" rel="noopener" href="${esc(o.url)}">Go to ${esc(o.supplier || "the supplier")} →</a>` : "")) +
      block("Watch it done", `<div class="video-grid one">${videoCard({ title: "Ordering a machine, start to finish", sub: "", url: o.loom })}</div>`) +
      block("Need cards and squishies too?", `<p class="t3">Stock comes from our other suppliers. <a href="#" data-tab-link="suppliers">See suppliers →</a></p>`);
    observeReveals($("#orderBody"));
  }

  // =================================================================== SETUP & INSTALL
  const SETUP_CHECKS = [
    ["Before you leave", ["Machine powers on and takes a test payment", "Stocked and priced", "Keys, charger and cleaning cloth packed", "Machine strapped and padded for the drive", "Owner told you're on the way"]],
    ["At the location", ["Spot confirmed with the owner: by the door or register, where everyone sees it", "Outlet in reach without a loose cord across the floor", "Wi-Fi connects and a test payment goes through", "Mounted or placed level and secure", "Photo of the machine in place"]],
    ["After", ["Thank-you text to the owner with the photo", "Install date and spot logged", "First restock date in your calendar"]],
  ];
  const setupDone = new Set(store.get("ic_setup_checks", []));
  function renderSetup() {
    const total = SETUP_CHECKS.reduce((n, [, items]) => n + items.length, 0);
    $("#setupBody").innerHTML =
      block("Watch, in order", `<div class="video-grid">${SETUP_VIDEOS.map(videoCard).join("")}</div>`) +
      block(`Install checklist · <span id="setupCount">${setupDone.size}</span> of ${total}`, `<div class="card setup-list">${SETUP_CHECKS.map(([g, items], gi) => `
        <div class="setup-group"><p class="step-t">${esc(g)}</p>${items.map((t, ii) => {
          const k = `${gi}.${ii}`;
          return `<label class="check-row"><input type="checkbox" id="chk${gi}_${ii}" data-chk="${k}" ${setupDone.has(k) ? "checked" : ""}><span>${esc(t)}</span></label>`;
        }).join("")}</div>`).join("")}
        <div class="obj-actions"><button class="btn btn-sm" id="setupReset" type="button">Start a new install</button></div></div>`);
    $$("[data-chk]", $("#setupBody")).forEach((c) => c.addEventListener("change", () => {
      c.checked ? setupDone.add(c.dataset.chk) : setupDone.delete(c.dataset.chk);
      store.set("ic_setup_checks", [...setupDone]);
      $("#setupCount").textContent = setupDone.size;
    }));
    $("#setupReset").addEventListener("click", () => { setupDone.clear(); store.set("ic_setup_checks", []); renderSetup(); });
    observeReveals($("#setupBody"));
  }

  // =================================================================== TRENDS
  // Weekly posts live on the server so the team can post without a redeploy. Anyone logged in can
  // read them; only the admin code sees the posting form.
  let trends = null;
  async function loadTrends() {
    try { trends = (await apiJSON("/api/trends")).posts || []; } catch { trends = trends || []; }
  }
  function renderTrendAdmin() {
    if (!isAdmin) return ($("#trendAdmin").innerHTML = "");
    $("#trendAdmin").innerHTML = `<form id="trendForm" class="card trend-form">
        <span class="label">Post this week's update (only you see this)</span>
        <input id="trendTitle" name="title" maxlength="120" placeholder="Headline, e.g. Prismatic Evolutions is selling out" required>
        <textarea id="trendBody" name="body" rows="5" maxlength="4000" placeholder="What's moving, what to stock, what prices are doing" required></textarea>
        <input id="trendTags" name="tags" maxlength="120" placeholder="Tags, comma separated (e.g. Pokémon, Pricing)">
        <div class="form-foot"><button class="btn btn-primary" type="submit">Post update</button><span class="small t4" id="trendMsg"></span></div>
      </form>`;
    $("#trendForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      $("#trendMsg").textContent = "Posting…";
      try {
        const j = await apiJSON("/api/trends", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f) });
        trends = [j.post, ...trends];
        e.target.reset();
        $("#trendMsg").textContent = "Posted ✓";
        renderTrendList();
      } catch (err) { $("#trendMsg").textContent = err.message; }
    });
  }
  function renderTrendList() {
    const list = trends || [];
    $("#trendList").innerHTML = list.length
      ? `<div class="trend-list">${list.map((t) => `<article class="card trend">
          <div class="trend-head"><span class="label">${esc(new Date(t.at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }))}</span>
            ${isAdmin ? `<button class="btn btn-sm" type="button" data-trend-del="${esc(t.id)}">Delete</button>` : ""}</div>
          <h2 class="card-title">${esc(t.title)}</h2>
          <p class="trend-body">${esc(t.body)}</p>
          ${t.tags?.length ? `<div class="chips">${t.tags.map((x) => `<span class="badge mute">${esc(x)}</span>`).join("")}</div>` : ""}
        </article>`).join("")}</div>`
      : emptyCard("No updates yet", "First update coming soon", "The team posts here every week: what's selling, what to stock and what prices are doing.");
    $$("[data-trend-del]").forEach((b) => b.addEventListener("click", async () => {
      if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Tap again to delete"; return; }
      try {
        await apiJSON(`/api/trends?id=${encodeURIComponent(b.dataset.trendDel)}`, { method: "DELETE" });
        trends = trends.filter((t) => t.id !== b.dataset.trendDel);
        renderTrendList();
      } catch (err) { b.textContent = err.message; }
    }));
  }
  async function openTrends() {
    renderTrendAdmin();
    renderTrendList();
    await loadTrends();
    renderTrendList();
  }

  // =================================================================== MY LEADS (CRM)
  // Saved places live on the server under the student's code (/api/leads), so they follow the
  // student to any device. Selection is in memory only.
  const LEAD_STATUS = [
    { k: "new", label: "To call", cls: "mute" },
    { k: "noanswer", label: "No answer", cls: "mute" },
    { k: "followup", label: "Follow up", cls: "" },
    { k: "no", label: "Said no", cls: "bad" },
    { k: "yes", label: "Said yes", cls: "ok" },
    { k: "placed", label: "Machine placed", cls: "ok" },
  ];
  const STATUS_BY = Object.fromEntries(LEAD_STATUS.map((s) => [s.k, s]));
  const leads = { list: [], loaded: false, sel: new Set(), filter: "all", q: "", sort: "new", open: null };
  const leadIds = new Set();
  const placeKey = (p) => `${p.name}|${p.lat.toFixed(5)}|${p.lng.toFixed(5)}`;
  const leadFromPlace = (p) => ({
    id: placeKey(p), name: p.name, cat: p.cat, catLabel: CAT[p.cat]?.label || "", phone: p.phone || "", address: p.address,
    city: p.city || "", state: p.state || "", lat: p.lat, lng: p.lng, score: p.score, maps: mapsUrl(p),
  });
  const leadMaps = (l) => l.maps || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${l.name}, ${l.address}`)}`;
  const fmtDate = (d) => (d ? new Date(d.length === 10 ? d + "T12:00:00" : d).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "");

  async function loadLeads() {
    try { leads.list = (await apiJSON("/api/leads")).leads || []; leads.loaded = true; } catch { leads.list = leads.list || []; }
    leadIds.clear(); leads.list.forEach((l) => leadIds.add(l.id));
  }
  async function saveLeads(places) {
    const fresh = places.filter((p) => !leadIds.has(placeKey(p))).map(leadFromPlace);
    if (!fresh.length) return { added: 0, skipped: places.length };
    let added = 0;
    for (let i = 0; i < fresh.length; i += 1000) {
      const j = await apiJSON("/api/leads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ leads: fresh.slice(i, i + 1000) }) });
      leads.list = [...j.added, ...leads.list];
      j.added.forEach((l) => leadIds.add(l.id));
      added += j.added.length;
    }
    return { added, skipped: places.length - added };
  }
  async function patchLeads(ids, set) {
    const j = await apiJSON("/api/leads", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids, set }) });
    const by = new Map(j.leads.map((l) => [l.id, l]));
    leads.list = leads.list.map((l) => by.get(l.id) || l);
  }
  async function deleteLeads(ids) {
    await apiJSON("/api/leads", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids }) });
    const gone = new Set(ids);
    leads.list = leads.list.filter((l) => !gone.has(l.id));
    ids.forEach((id) => { leadIds.delete(id); leads.sel.delete(id); });
  }

  function visibleLeads() {
    const q = leads.q.toLowerCase();
    let list = leads.list.filter((l) => (leads.filter === "all" || l.status === leads.filter) && (!q || `${l.name} ${l.address} ${l.owner || ""} ${l.notes || ""}`.toLowerCase().includes(q)));
    if (leads.sort === "follow") list = [...list].sort((a, b) => (a.followUp || "9999").localeCompare(b.followUp || "9999"));
    else if (leads.sort === "name") list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    return list; // "new" = newest first, the order the server keeps
  }
  // Exports and bulk edits act on the selection, or on everything shown when nothing is selected.
  const actionTargets = () => (leads.sel.size ? leads.list.filter((l) => leads.sel.has(l.id)) : visibleLeads());

  function renderLeads() {
    const counts = Object.fromEntries(LEAD_STATUS.map((s) => [s.k, 0]));
    leads.list.forEach((l) => (counts[l.status] = (counts[l.status] || 0) + 1));
    $("#leadPipe").innerHTML = [{ k: "all", label: "All", n: leads.list.length }, ...LEAD_STATUS.map((s) => ({ ...s, n: counts[s.k] }))]
      .map((s) => `<button class="pipe-step ${leads.filter === s.k ? "active" : ""}" data-pipe="${s.k}"><span class="pipe-n">${s.n}</span><span class="label">${esc(s.label)}</span></button>`).join("");
    $$("[data-pipe]").forEach((b) => b.addEventListener("click", () => { leads.filter = b.dataset.pipe; leads.sel.clear(); renderLeads(); }));

    const list = visibleLeads();
    const n = leads.sel.size;
    const scope = n ? `${n} selected` : `all ${list.length} shown`;
    $("#leadTools").innerHTML = leads.list.length ? `
      <div class="lead-search">
        <input id="leadQ" placeholder="Search name, address, owner or notes" value="${esc(leads.q)}" aria-label="Search leads">
        <select id="leadSort" aria-label="Sort">
          <option value="new" ${leads.sort === "new" ? "selected" : ""}>Newest saved</option>
          <option value="follow" ${leads.sort === "follow" ? "selected" : ""}>Follow-up date</option>
          <option value="name" ${leads.sort === "name" ? "selected" : ""}>Name</option>
        </select>
      </div>
      <div class="lead-bulk">
        <label class="check-row inline"><input type="checkbox" id="leadAll" ${list.length && list.every((l) => leads.sel.has(l.id)) ? "checked" : ""}><span>Select all shown</span></label>
        <span class="small t4">Actions apply to ${scope}:</span>
        <select id="leadSetStatus" aria-label="Set status"><option value="">Set status…</option>${LEAD_STATUS.map((s) => `<option value="${s.k}">${esc(s.label)}</option>`).join("")}</select>
        <button class="btn btn-sm btn-primary" id="leadPdf" type="button">PDF</button>
        <button class="btn btn-sm" id="leadCsv" type="button">CSV</button>
        <button class="btn btn-sm" id="leadSkip" type="button">Send to Skip &amp; Trace</button>
        ${n ? `<button class="btn btn-sm" id="leadDel" type="button">Delete ${n}</button>` : ""}
        <span id="leadMsg" class="small t4"></span>
      </div>` : "";

    $("#leadList").innerHTML = !leads.list.length
      ? emptyCard("No leads yet", "Save spots from Locations", "Search for places, tick the ones you like (or select all), and tap Save to My Leads. They show up here with their phone numbers and map links.") +
        `<a href="#" class="btn btn-primary" data-tab-link="finder">Find locations →</a>`
      : !list.length ? `<p class="t3">No leads match. <a href="#" id="leadReset">Show all</a></p>`
      : `<div class="lead-list">${list.slice(0, 300).map(leadRow).join("")}</div>${list.length > 300 ? `<p class="small t4" style="margin-top:12px">Showing 300 of ${list.length}. Search or filter to narrow it down. Exports include all ${list.length}.</p>` : ""}`;
    bindLeads();
  }

  function leadRow(l) {
    const s = STATUS_BY[l.status] || STATUS_BY.new;
    const open = leads.open === l.id;
    const due = l.followUp && l.followUp <= new Date().toISOString().slice(0, 10);
    return `<div class="card lead ${leads.sel.has(l.id) ? "sel" : ""}" data-lead="${esc(l.id)}">
      <div class="lead-main">
        <input type="checkbox" class="lead-check" data-lsel="${esc(l.id)}" ${leads.sel.has(l.id) ? "checked" : ""} aria-label="Select ${esc(l.name)}">
        <div class="grow">
          <p class="lead-name">${esc(l.name)}</p>
          <p class="res-meta">${esc([l.catLabel, l.address].filter(Boolean).join(" · "))}</p>
          ${l.owner || l.ownerPhone ? `<p class="small lead-owner">Owner: <b>${esc(l.owner || "")}</b> ${l.ownerPhone ? `· <a href="tel:${esc(l.ownerPhone.replace(/[^\d+]/g, ""))}">${esc(prettyPhone(l.ownerPhone))}</a>` : ""}</p>` : ""}
          ${l.notes && !open ? `<p class="small t3 lead-note">${esc(l.notes.slice(0, 140))}${l.notes.length > 140 ? "…" : ""}</p>` : ""}
        </div>
        <div class="lead-side">
          <select class="lead-status ${s.cls}" data-lstatus="${esc(l.id)}" aria-label="Status">${LEAD_STATUS.map((x) => `<option value="${x.k}" ${x.k === l.status ? "selected" : ""}>${esc(x.label)}</option>`).join("")}</select>
          ${l.followUp ? `<span class="badge ${due ? "" : "mute"}">Follow up ${esc(fmtDate(l.followUp))}</span>` : ""}
        </div>
      </div>
      <div class="res-actions">
        <a href="${esc(leadMaps(l))}" target="_blank" rel="noopener" class="maps-link">Google Maps</a>
        ${l.phone ? `<a href="tel:${esc(l.phone.replace(/[^\d+]/g, ""))}">${esc(prettyPhone(l.phone))}</a>` : ""}
        <a href="#" data-ledit="${esc(l.id)}">${open ? "Close" : "Notes &amp; owner"}</a>
        ${l.lastContact ? `<span class="small t4 lead-last">Last update ${esc(fmtDate(l.lastContact))}</span>` : ""}
      </div>
      ${open ? `<form class="lead-edit" data-lform="${esc(l.id)}">
        <label><span class="label">Owner name</span><input name="owner" id="lo_${esc(l.id)}" maxlength="80" value="${esc(l.owner || "")}"></label>
        <label><span class="label">Owner cell</span><input name="ownerPhone" maxlength="30" inputmode="tel" value="${esc(l.ownerPhone || "")}"></label>
        <label><span class="label">Follow up on</span><input name="followUp" type="date" value="${esc(l.followUp || "")}"></label>
        <label class="full"><span class="label">Notes</span><textarea name="notes" rows="3" maxlength="2000" placeholder="What they said, who to ask for, best time to call">${esc(l.notes || "")}</textarea></label>
        <div class="form-foot full"><button class="btn btn-primary btn-sm" type="submit">Save</button><span class="small t4 form-msg"></span></div>
      </form>` : ""}
    </div>`;
  }

  function bindLeads() {
    const msg = (t) => { const m = $("#leadMsg"); if (m) m.textContent = t; };
    $("#leadQ")?.addEventListener("input", (e) => { leads.q = e.target.value; const pos = e.target.selectionStart; renderLeads(); const q = $("#leadQ"); q.focus(); q.setSelectionRange(pos, pos); });
    $("#leadSort")?.addEventListener("change", (e) => { leads.sort = e.target.value; renderLeads(); });
    $("#leadReset")?.addEventListener("click", (e) => { e.preventDefault(); leads.filter = "all"; leads.q = ""; renderLeads(); });
    $("#leadAll")?.addEventListener("change", (e) => {
      const list = visibleLeads();
      list.forEach((l) => (e.target.checked ? leads.sel.add(l.id) : leads.sel.delete(l.id)));
      renderLeads();
    });
    $$("[data-lsel]").forEach((c) => c.addEventListener("change", () => { c.checked ? leads.sel.add(c.dataset.lsel) : leads.sel.delete(c.dataset.lsel); renderLeads(); }));
    $$("[data-lstatus]").forEach((sel) => sel.addEventListener("change", async () => {
      try { await patchLeads([sel.dataset.lstatus], { status: sel.value }); renderLeads(); } catch (err) { msg(err.message); }
    }));
    $$("[data-ledit]").forEach((a) => a.addEventListener("click", (e) => {
      e.preventDefault();
      leads.open = leads.open === a.dataset.ledit ? null : a.dataset.ledit;
      renderLeads();
      if (leads.open) document.getElementById(`lo_${leads.open}`)?.focus();
    }));
    $$("[data-lform]").forEach((f) => f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const set = Object.fromEntries(new FormData(f));
      $(".form-msg", f).textContent = "Saving…";
      try { await patchLeads([f.dataset.lform], set); leads.open = null; renderLeads(); } catch (err) { $(".form-msg", f).textContent = err.message; }
    }));
    $("#leadSetStatus")?.addEventListener("change", async (e) => {
      const st = e.target.value; if (!st) return;
      const ids = actionTargets().map((l) => l.id);
      try { await patchLeads(ids, { status: st }); leads.sel.clear(); renderLeads(); msg(`${ids.length} set to ${STATUS_BY[st].label}`); } catch (err) { msg(err.message); }
    });
    $("#leadCsv")?.addEventListener("click", () => downloadCsv(leadsCsv(actionTargets()), "my-leads.csv").catch((err) => msg(err.message)));
    $("#leadSkip")?.addEventListener("click", () => downloadCsv(skipCsv(actionTargets()), "skip-trace-request.csv").then(() => msg("Saved. Send the file to the Skip & Trace team."), (err) => msg(err.message)));
    $("#leadPdf")?.addEventListener("click", async () => {
      msg("Making your PDF…");
      try { await leadsPdf(actionTargets()); msg(""); } catch (err) { msg(err.message); }
    });
    const del = $("#leadDel");
    del?.addEventListener("click", async () => {
      if (del.dataset.armed !== "1") { del.dataset.armed = "1"; del.textContent = `Tap again to delete ${leads.sel.size}`; return; }
      try { await deleteLeads([...leads.sel]); renderLeads(); } catch (err) { msg(err.message); }
    });
  }

  // ---- exports
  const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const toCsv = (rows) => rows.map((r) => r.map(csvCell).join(",")).join("\n");
  const downloadCsv = (csv, name) => saveFile(name, new Blob(["\ufeff" + csv], { type: "text/csv" }));
  const leadsCsv = (list) => toCsv([
    ["Business", "Type", "Status", "Address", "Business phone", "Owner", "Owner cell", "Follow up", "Last update", "Notes", "Google Maps"],
    ...list.map((l) => [l.name, l.catLabel, STATUS_BY[l.status]?.label, l.address, prettyPhone(l.phone), l.owner, prettyPhone(l.ownerPhone), l.followUp, l.lastContact?.slice(0, 10), l.notes, leadMaps(l)]),
  ]);
  // The file the Skip & Trace team fills in and sends back; "Lead ID" lets the import match rows.
  const skipCsv = (list) => toCsv([
    ["Lead ID", "Business", "Address", "City", "State", "Business phone", "Google Maps", "Owner name", "Owner cell"],
    ...list.map((l) => [l.id, l.name, l.address, l.city, l.state, prettyPhone(l.phone), leadMaps(l), l.owner || "", l.ownerPhone || ""]),
  ]);

  const loadScript = (src) => new Promise((ok, fail) => {
    if ([...document.scripts].some((s) => s.src === src)) return ok();
    const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => fail(new Error("Couldn't load the PDF maker. Check your connection and try again."));
    document.head.appendChild(s);
  });
  async function leadsPdf(list) {
    if (!list.length) throw new Error("Nothing to export yet.");
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js");
    const doc = new window.jspdf.jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
    const W = doc.internal.pageSize.getWidth();
    const gold = [47, 227, 230];
    // jsPDF's built-in font has no glyphs beyond Latin-1; swap the few typographic marks students paste.
    const clean = (s) => String(s ?? "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/[^\x00-\xFF]/g, "");
    doc.setFillColor(15, 19, 23); doc.rect(0, 0, W, 64, "F");
    doc.setTextColor(...gold); doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.text("PACK PLACEMENT  ·  MY LEADS", 36, 40);
    doc.setTextColor(200); doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
    doc.text(clean(`${profile?.name || ""}   ·   ${list.length} location${list.length === 1 ? "" : "s"}   ·   ${new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}`), W - 36, 40, { align: "right" });
    const counts = LEAD_STATUS.map((s) => [s.label, list.filter((l) => l.status === s.k).length]).filter(([, n]) => n);
    doc.setTextColor(60); doc.setFontSize(9);
    doc.text(clean(counts.map(([k, n]) => `${k}: ${n}`).join("     ")), 36, 84);
    doc.autoTable({
      startY: 96,
      margin: { left: 36, right: 36, bottom: 40 },
      head: [["#", "Business", "Type", "Address", "Phone", "Status", "Owner", "Follow up", "Map"]],
      body: list.map((l, i) => [i + 1, clean(l.name), clean(l.catLabel), clean(l.address), prettyPhone(l.phone),
        STATUS_BY[l.status]?.label || "", clean([l.owner, prettyPhone(l.ownerPhone)].filter(Boolean).join("\n")), fmtDate(l.followUp), "Open map"]),
      styles: { font: "helvetica", fontSize: 8.5, cellPadding: 5, textColor: 30, lineColor: 225, lineWidth: 0.5, overflow: "linebreak" },
      headStyles: { fillColor: [20, 20, 20], textColor: gold, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [240, 250, 251] },
      columnStyles: { 0: { cellWidth: 22, halign: "right", textColor: 140 }, 1: { cellWidth: 140, fontStyle: "bold" }, 2: { cellWidth: 70 }, 3: { cellWidth: 160 }, 4: { cellWidth: 74 }, 5: { cellWidth: 62 }, 6: { cellWidth: 82 }, 7: { cellWidth: 52 }, 8: { cellWidth: 58, textColor: [0, 140, 150], fontStyle: "bold" } },
      didDrawCell: (d) => {
        if (d.section === "body" && d.column.index === 8) doc.link(d.cell.x, d.cell.y, d.cell.width, d.cell.height, { url: leadMaps(list[d.row.index]) });
      },
      didDrawPage: () => {
        doc.setFontSize(8); doc.setTextColor(150);
        doc.text(`Page ${doc.internal.getNumberOfPages()}`, W - 36, doc.internal.pageSize.getHeight() - 20, { align: "right" });
        doc.text("Tap \"Open map\" to see the place on Google Maps.", 36, doc.internal.pageSize.getHeight() - 20);
      },
    });
    await saveFile(`pack-placement-leads-${new Date().toISOString().slice(0, 10)}.pdf`, doc.output("blob"));
  }

  async function openLeads() {
    renderLeads();
    await loadLeads();
    renderLeads();
  }

  // ---- Locations: select places and save them in bulk
  finder.sel = new Set();
  function renderSelBar() {
    const list = filtered();
    const n = finder.sel.size;
    const shownAll = list.length && list.every((p) => finder.sel.has(placeKey(p)));
    $("#selBar").innerHTML = finder.places.length ? `
      <label class="check-row inline"><input type="checkbox" id="selAll" ${shownAll ? "checked" : ""}><span>Select all ${list.length.toLocaleString()} shown</span></label>
      <span class="small t3">${n ? `${n.toLocaleString()} selected` : "Tick places to save them"}</span>
      <button class="btn btn-primary btn-sm" id="selSave" type="button" ${n ? "" : "disabled"}>Save ${n ? n.toLocaleString() + " " : ""}to My Leads</button>
      ${n ? `<button class="btn btn-sm" id="selClear" type="button">Clear</button>` : ""}
      <span id="selMsg" class="small t4"></span>` : "";
    $("#selAll")?.addEventListener("change", (e) => {
      filtered().forEach((p) => (e.target.checked ? finder.sel.add(placeKey(p)) : finder.sel.delete(placeKey(p))));
      renderResults(false);
    });
    $("#selClear")?.addEventListener("click", () => { finder.sel.clear(); renderResults(false); });
    $("#selSave")?.addEventListener("click", async () => {
      const picked = finder.places.filter((p) => finder.sel.has(placeKey(p)));
      $("#selMsg").textContent = "Saving…";
      try {
        const r = await saveLeads(picked);
        finder.sel.clear();
        renderResults(false);
        $("#selMsg").innerHTML = `Saved ${r.added.toLocaleString()}${r.skipped ? ` (${r.skipped.toLocaleString()} already saved)` : ""}. <a href="#" data-tab-link="leads">Open My Leads →</a>`;
      } catch (err) { $("#selMsg").textContent = err.message; }
    });
  }
  $("#resList").addEventListener("change", (e) => {
    const c = e.target.closest("[data-psel]");
    if (!c) return;
    c.checked ? finder.sel.add(c.dataset.psel) : finder.sel.delete(c.dataset.psel);
    c.closest(".res").classList.toggle("sel", c.checked);
    renderSelBar();
  });
  $("#resList").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-psave]");
    if (!b) return;
    e.preventDefault();
    const p = finder.places.find((x) => placeKey(x) === b.dataset.psave);
    if (!p || leadIds.has(b.dataset.psave)) return;
    b.textContent = "Saving…";
    try { await saveLeads([p]); b.textContent = "Saved ✓"; b.classList.add("saved"); } catch (err) { b.textContent = err.message; }
  });

  // =================================================================== SKIP & TRACE TEAM
  function renderSkip() {
    const t = SKIP_TRACE;
    const contacts = [["Email", t.email], ["Phone", t.phone], ["Text / WhatsApp", t.text], ["Hours", t.hours], ["Turnaround", t.turnaround]].filter(([, v]) => v);
    $("#skipBody").innerHTML =
      block("Watch first", `<div class="video-grid one">${videoCard({ title: "How the Skip & Trace team works", sub: "What to send, what you get back, and how long it takes.", url: t.loom })}</div>`) +
      block("Contact the team", contacts.length
        ? `<div class="card contact-card">${contacts.map(([k, v]) => k === "Hours" || k === "Turnaround" ? `<div class="contact-row"><span class="label">${k}</span><p class="t1">${esc(v)}</p></div>` : copyBlock(v, { label: k })).join("")}</div>`
        : emptyCard("Coming soon", "Team contact", "The team's email and phone number will be posted here.")) +
      block("How it works", `<div class="card">${stepList([
        ["Save the spots you want to call", 'In <a href="#" data-tab-link="finder">Locations</a>, tick the places and tap <b>Save to My Leads</b>.'],
        ["Export them for the team", 'In <a href="#" data-tab-link="leads">My Leads</a>, select the leads and tap <b>Send to Skip &amp; Trace</b>. You get a spreadsheet file.'],
        ["Send the file to the team", "Email or text it to the contact above with the message below."],
        ["Get owner names and cell numbers back", `The team fills in the owner's name and cell for each spot${t.turnaround ? ` (usually ${esc(t.turnaround)})` : ""} and sends the file back.`],
        ["Import it and start calling", "Use <b>Import results</b> below. Each lead gets the owner's name and cell, and you call the owner, not the front desk."],
      ])}</div>`) +
      block("Message to send", copyBlock(`Hi Skip & Trace team,\n\nAttached are [number] locations I'd like owner names and cell numbers for. I'm in [your city].\n\nName: ${profile?.name || "[your name]"}\nPhone: ${profile?.phone || "[your phone]"}\n\nThanks!`)) +
      block("Import results", `<div class="card">
          <p class="small t3">Got the file back? Choose it here and the owner names and cell numbers go straight into My Leads.</p>
          <div class="obj-actions" style="justify-content:flex-start;margin-top:12px"><input type="file" id="skipFile" accept=".csv,text/csv" aria-label="Skip trace results file"></div>
          <p id="skipMsg" class="small t4"></p>
        </div>`) +
      block("Why it matters", `<p class="t3">Gage: "A lot of people make the big mistake of calling the front desk." The person at the counter can't say yes. The owner can.</p>`);
    $("#skipFile").addEventListener("change", importSkip);
    observeReveals($("#skipBody"));
  }

  // Small CSV reader (quoted fields, commas and newlines inside quotes).
  function parseCsv(text) {
    const rows = []; let row = [], cell = "", q = false;
    text = text.replace(/^﻿/, "");
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
      else if (c === '"') q = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
      else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((x) => x.trim()));
  }
  async function importSkip(e) {
    const file = e.target.files[0];
    const m = $("#skipMsg");
    if (!file) return;
    try {
      if (!leads.loaded) await loadLeads();
      const rows = parseCsv(await file.text());
      const head = rows.shift().map((h) => h.trim().toLowerCase());
      const col = (name) => head.indexOf(name);
      const [ci, co, cp] = [col("lead id"), col("owner name"), col("owner cell")];
      if (ci < 0 || (co < 0 && cp < 0)) throw new Error('That file needs the "Lead ID", "Owner name" and "Owner cell" columns from the Send to Skip & Trace export.');
      const updates = [];
      for (const r of rows) {
        const id = r[ci]?.trim(), owner = co >= 0 ? r[co]?.trim() : "", ownerPhone = cp >= 0 ? r[cp]?.trim() : "";
        if (!id || !leadIds.has(id) || (!owner && !ownerPhone)) continue;
        const set = {}; if (owner) set.owner = owner; if (ownerPhone) set.ownerPhone = ownerPhone;
        updates.push({ id, set });
      }
      const updated = updates.length;
      if (updated) {
        const j = await apiJSON("/api/leads", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ updates }) });
        const by = new Map(j.leads.map((l) => [l.id, l]));
        leads.list = leads.list.map((l) => by.get(l.id) || l);
      }
      m.innerHTML = updated ? `Added owner details to ${updated} lead${updated === 1 ? "" : "s"}. <a href="#" data-tab-link="leads">Open My Leads →</a>` : "No matching leads with owner details in that file.";
    } catch (err) { m.textContent = err.message; }
    e.target.value = "";
  }

  // =================================================================== START HERE (the road to machine #1)
  // Each step ticks itself off from what the student has actually done; "manual" steps get a button.
  const ROAD = [
    { k: "video", tab: "dashboard", title: "Watch the welcome video", how: "It's right below. 5 minutes, and you'll know how to use this whole site.", manual: true },
    { k: "spots", tab: "finder", title: "Save 10 spots near you", how: "Open Find Spots, type your city, tick the places you like, press Save.", goal: 10, count: () => leads.list.length },
    { k: "check", tab: "dwell", title: "Check your 3 best spots", how: "Open Check a Spot and answer the questions. Green means call them first.", goal: 3, count: () => dwell.list.length },
    { k: "owner", tab: "skiptrace", title: "Get the owners' phone numbers", how: "Send your spots to our Find the Owner team. They send back the owner's name and cell.", goal: 1, count: () => leads.list.filter((l) => l.owner || l.ownerPhone).length },
    { k: "learn", tab: "objections", title: "Learn the script and practice pushback", how: "Read the Call Scripts, then practice until you know half the answers by heart.", goal: 7, count: () => mastered.size },
    { k: "calls", tab: "leads", title: "Make 10 calls", how: "Call from My Leads. After each call, change the status: no answer, follow up, said no or said yes.", goal: 10, count: () => leads.list.filter((l) => l.status !== "new").length },
    { k: "yes", tab: "yes", title: "Get your first yes", how: "When an owner says yes, open They Said Yes and send the agreement the same day.", goal: 1, count: () => leads.list.filter((l) => l.status === "yes" || l.status === "placed").length },
    { k: "machine", tab: "order", title: "Buy and set up your machine", how: "Order with our discount code, then follow Set Up Machine step by step. Mark the lead as Machine placed.", goal: 1, count: () => Math.max(leads.list.filter((l) => l.status === "placed").length, Number(profile?.machines) || 0) },
  ];
  const roadTicks = new Set(store.get("ic_road", []));
  // No welcome video uploaded yet: don't send students to watch something that isn't there.
  const stepDone = (s) => (s.manual ? roadTicks.has(s.k) || (s.k === "video" && !ONBOARDING.welcomeLoom) : s.count() >= s.goal);

  function renderDashboard() {
    const first = (profile?.name || "").split(/\s+/)[0] || "there";
    $("#dashName").textContent = first;
    if (!$("#startVideo").childElementCount) $("#startVideo").innerHTML = videoCard({ title: "Welcome: how to use your toolkit", sub: "Watch once. It walks through every page from A to Z.", url: ONBOARDING.welcomeLoom });
    const done = ROAD.filter(stepDone).length;
    const next = ROAD.find((s) => !stepDone(s));
    $("#roadCount").textContent = `${done} of ${ROAD.length} done`;
    $("#roadBar").style.width = `${(done / ROAD.length) * 100}%`;
    $("#nextStep").innerHTML = next
      ? `<div class="card hl hl-glow next-step">
          <span class="label">Your next step · step ${ROAD.indexOf(next) + 1} of ${ROAD.length}</span>
          <p class="next-title">${esc(next.title)}</p>
          <p class="t2">${esc(next.how)}</p>
          ${next.manual
            ? `<button class="btn btn-primary btn-lg" data-road-tick="${next.k}">I watched it ✓</button>`
            : `<button class="btn btn-primary btn-lg" data-tab-link="${next.tab}">Do this step →</button>`}
        </div>`
      : `<div class="card hl hl-glow next-step"><span class="label">You did it</span><p class="next-title">Your first machine is live. 🎉</p><p class="t2">Now keep it stocked: open Restock &amp; Care and do the checklist every visit.</p><button class="btn btn-primary btn-lg" data-tab-link="care">Restock &amp; Care →</button></div>`;
    $("#road").innerHTML = ROAD.map((s, i) => {
      const ok = stepDone(s), cur = s === next;
      const prog = s.manual ? "" : `<span class="road-prog">${Math.min(s.count(), s.goal)} / ${s.goal}</span>`;
      return `<li class="road-step ${ok ? "done" : ""} ${cur ? "current" : ""}">
        <span class="road-n" aria-hidden="true">${ok ? "✓" : i + 1}</span>
        <div class="grow"><p class="road-title">${esc(s.title)}</p><p class="small t3">${esc(s.how)}</p></div>
        ${prog}
        ${s.manual
          ? `<button class="btn btn-sm" data-road-tick="${s.k}">${ok ? "Done ✓" : "Mark done"}</button>`
          : `<button class="btn btn-sm ${cur ? "btn-primary" : ""}" data-tab-link="${s.tab}">${ok ? "Open" : "Go →"}</button>`}
      </li>`;
    }).join("");
    $$("[data-road-tick]").forEach((b) => b.addEventListener("click", () => {
      roadTicks.has(b.dataset.roadTick) ? roadTicks.delete(b.dataset.roadTick) : roadTicks.add(b.dataset.roadTick);
      store.set("ic_road", [...roadTicks]);
      renderDashboard();
    }));
    $("#phase2").innerHTML = [
      ["order", "Buy a Machine", "Which machine, where to order, your discount code."],
      ["suppliers", "Suppliers & Ordering", "Where to get cards and squishies, and how much to order."],
      ["setup", "Set Up Machine", "Unbox, set up and install it at the store."],
      ["care", "Restock & Care", "Your checklist for every visit, so it keeps selling."],
    ].map(([t, a, b]) => `<button class="card card-hover tool-card" data-tab="${t}"><span class="card-title">${esc(a)}</span><span class="small t3">${esc(b)}</span></button>`).join("");
    const machines = Number(profile?.machines) || 0;
    const yeses = leads.list.filter((l) => l.status === "yes" || l.status === "placed").length;
    $("#dashStats").innerHTML = `
      <div class="stat"><span class="label">Machines placed</span><div class="stat-num gold-num pop"><span data-count="${machines}">0</span></div><p class="stat-cap">${esc(profile?.goal ? profile.goal.slice(0, 60) : "Set a goal in your profile")}</p></div>
      <div class="stat"><span class="label">Spots saved</span><div class="stat-num sm"><span data-count="${leads.list.length}">0</span></div><p class="stat-cap">${yeses} said yes</p></div>
      <div class="stat"><span class="label">Pushback mastered</span><div class="stat-num sm okc"><span data-count="${mastered.size}">0</span><small class="t4" style="font-size:.5em">/${OBJECTIONS.length}</small></div><p class="stat-cap">Practice in Practice Pushback</p></div>`;
    countUps($("#dashStats"));
  }

  // =================================================================== "HOW THIS PAGE WORKS" on every page
  const PAGE_HELP = {
    finder: ["Find businesses near you that are good spots for a machine.", ["Type your city (or press Use my location) and press Set.", "Press Find locations. The best spots are at the top.", "Tick the ones you like and press Save to My Leads."]],
    dwell: ["See if a spot is worth calling before you spend time on it.", ["Paste the business's Google Maps link, or answer the questions yourself.", "Press Check this spot.", "Green: call them. Yellow: visit first. Red: skip it."]],
    leads: ["Every spot you saved, in one list. This is where you track your calls.", ["Press the phone number or Google Maps to look a spot up.", "After each call, change the status (no answer, said no, said yes...).", "Press Notes & owner to write down the owner's name and when to call back."]],
    skiptrace: ["Our team finds the owner's name and cell number for you.", ["In My Leads, tick the spots and press Send to Skip & Trace.", "Email or text that file to the team (contact below).", "When they send it back, press Import results. The owners show up in My Leads."]],
    calling: ["Learn what to say when the owner picks up.", ["Watch the two videos.", "Read the script. Keep it open while you call.", "Owner pushing back? Go to Practice Pushback."]],
    objections: ["Practice what to say when an owner says no or \"send me info\".", ["Read the list once.", "Press Flashcards: say your answer out loud, then check it.", "Do the Quiz until you get most right."]],
    analyzer: ["Get your calls graded by our AI coach inside Claude.", ["Follow the 5 steps once to connect it.", "Copy one of the prompts.", "Paste your call and send. You get a score and what to say next time."]],
    yes: ["What to do the moment an owner says yes.", ["Before you hang up, confirm the 4 things in the list.", "Send the agreement the same day.", "Copy the emails and send them at the right time."]],
    order: ["Buy your machine the right way, with our discount.", ["Copy your discount code.", "Follow the ordering steps.", "Watch the video if you get stuck."]],
    suppliers: ["Where to get your machine, cards and squishies, and how much to order.", ["Pick a tab: Machines, Pokémon cards or Squishies.", "Use How much should I order? to get your number.", "Copy the message and send it to the supplier."]],
    setup: ["Get your machine from the box into the store.", ["Watch the 4 videos in order.", "Tick the checklist as you go.", "Send the owner a photo when it's installed."]],
    care: ["Keep your machine full, clean and working so it keeps making money.", ["Do the checklist every time you visit.", "Use the calculator to know how much to reorder.", "Something broken? Watch the fix-it video."]],
    trends: ["What's selling right now, from our team every week.", ["Read the newest post at the top.", "Use it when you restock.", "Check back every week."]],
  };
  // "What's next" button at the bottom of each page, so nobody has to guess where to go.
  const PAGE_NEXT = {
    finder: ["dwell", "Check your best spots before you call them."],
    dwell: ["leads", "See every spot you saved, in one list."],
    leads: ["skiptrace", "Get the owner's name and cell number."],
    skiptrace: ["calling", "Learn exactly what to say on the call."],
    calling: ["objections", "Practice what to say when they push back."],
    objections: ["leads", "Start calling. Update each spot after the call."],
    analyzer: ["yes", "What to do the moment an owner says yes."],
    yes: ["order", "Buy your machine with the program discount."],
    order: ["setup", "Get it from the box into the store."],
    suppliers: ["care", "Load it, restock it and keep it working."],
    setup: ["care", "Keep it full, clean and selling."],
    care: ["trends", "See what's selling before you restock."],
    trends: ["dashboard", "Back to your road and your next step."],
  };
  const GLOSSARY = [
    ["Spot / location", "A business where your machine could go: a gas station, bowling alley, restaurant..."],
    ["Placement", "Getting an owner to say yes and putting your machine in their store."],
    ["Foot traffic", "How many people walk in. More people, more sales."],
    ["Dwell time", "How long people stay inside. People who wait around buy more."],
    ["Revenue share", "The cut of sales you give the owner, usually 10 to 20%. No rent."],
    ["Skip trace", "Finding the owner's real name and cell number, so you skip the front desk."],
    ["Pushback / objection", "When the owner says \"not interested\" or \"send me info\". You'll practice these."],
    ["Restock", "Refilling the machine with cards and products."],
    ["Gage", "The coach behind this program. Every rule on this site comes from his own machines."],
  ];
  function addPageNext() {
    for (const [tab, [to, why]] of Object.entries(PAGE_NEXT)) {
      const panel = $(`#tab-${tab}`);
      if (!panel || $(".page-next", panel)) continue;
      panel.insertAdjacentHTML("beforeend", `<div class="card page-next"><div class="grow"><span class="label">When you're done here</span><p class="page-next-title">Next: ${esc(TOOL_NAMES[to])}</p><p class="small t3">${esc(why)}</p></div><button class="btn btn-primary" data-tab-link="${to}">Go →</button></div>`);
    }
    const g = $("#gloss");
    if (g && !g.childElementCount) g.innerHTML = GLOSSARY.map(([w, d]) => `<div class="gloss-item"><b>${esc(w)}</b><span class="small t3">${esc(d)}</span></div>`).join("");
  }
  function addPageHelp() {
    for (const [tab, [what, steps]] of Object.entries(PAGE_HELP)) {
      const hero = $(`#tab-${tab} .hero`);
      if (!hero || $(`#tab-${tab} .help-box`)) continue;
      const video = PAGE_VIDEOS[tab];
      hero.insertAdjacentHTML("afterend", `<details class="card help-box" ${store.get("ic_help_seen", []).includes(tab) ? "" : "open"} data-help="${tab}">
        <summary><span class="help-q" aria-hidden="true">?</span><b>How this page works</b><span class="small t3 grow">${esc(what)}</span></summary>
        <ol class="help-steps">${steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
        ${video ? `<a class="btn btn-sm" href="${esc(video)}" target="_blank" rel="noopener">▶ Watch how (1 min)</a>` : ""}
      </details>`);
    }
    // Open the first time; once closed it stays closed for that page.
    $$(".help-box").forEach((d) => d.addEventListener("toggle", () => {
      const seen = new Set(store.get("ic_help_seen", []));
      d.open ? seen.delete(d.dataset.help) : seen.add(d.dataset.help);
      store.set("ic_help_seen", [...seen]);
    }));
  }

  // =================================================================== HOW MUCH TO ORDER (calculator)
  function calcHTML(id) {
    const d = ORDER_CALC;
    const f = (k, label, hint) => `<label><span class="label">${label}</span><input type="number" min="0" inputmode="numeric" id="${id}_${k}" data-calc="${k}" value="${d[k] ?? ""}" placeholder="${hint}"></label>`;
    return `<div class="card calc" data-calc-box="${id}">
      <p class="card-title">How much should I order?</p>
      <p class="small t3">Type your machine's numbers. Not sure? Ask the team or check your machine's manual.</p>
      <div class="calc-grid">
        ${f("slots", "Slots in your machine", "e.g. 20")}
        ${f("perSlot", "Items that fit in one slot", "e.g. 8")}
        ${f("perWeek", "Items you sell per week", "your best guess")}
        ${f("weeks", "Weeks until your next order", "e.g. 2")}
      </div>
      <div class="calc-out" id="${id}_out"></div>
    </div>`;
  }
  function bindCalc(root) {
    $$("[data-calc-box]", root).forEach((box) => {
      const id = box.dataset.calcBox;
      const run = () => {
        const v = (k) => Number($(`#${id}_${k}`).value) || 0;
        const cap = v("slots") * v("perSlot");
        const reorder = Math.ceil(v("perWeek") * v("weeks") * 1.2);
        const parts = [];
        if (cap) parts.push(`<div><span class="label">First fill (empty machine)</span><b class="calc-n">${cap}</b> items</div>`);
        if (reorder) parts.push(`<div><span class="label">Each reorder</span><b class="calc-n">${cap ? Math.min(reorder, cap) : reorder}</b> items</div>`);
        $(`#${id}_out`).innerHTML = parts.length
          ? parts.join("") + `<p class="small t4 full">Reorder = items per week × weeks × 1.2 (a little extra so you never run empty)${cap && reorder > cap ? ", capped at what fits in the machine" : ""}.</p>`
          : `<p class="small t4 full">Fill in the boxes and your numbers show up here.</p>`;
      };
      $$("[data-calc]", box).forEach((i) => i.addEventListener("input", run));
      run();
    });
  }

  // =================================================================== RESTOCK & CARE
  const CARE_CHECKS = [
    ["Every visit", ["Check how much sold since last time", "Refill empty slots, best sellers at the front", "Wipe the glass and the keypad", "Test one payment (card or tap)", "Check the power light and Wi-Fi", "Say hi to the owner and ask how it's going"]],
    ["Every month", ["Pay the owner their share on time", "Swap slow sellers for what's on What's Selling", "Write down this month's sales"]],
  ];
  const careDone = new Set(store.get("ic_care_checks", []));
  function renderCare() {
    const total = CARE_CHECKS.reduce((n, [, items]) => n + items.length, 0);
    $("#careBody").innerHTML =
      block("Watch how", `<div class="video-grid">${CARE_VIDEOS.map(videoCard).join("")}</div>`) +
      block(`Visit checklist · <span id="careCount">${careDone.size}</span> of ${total}`, `<div class="card setup-list">${CARE_CHECKS.map(([g, items], gi) => `
        <div class="setup-group"><p class="step-t">${esc(g)}</p>${items.map((t, ii) => {
          const k = `${gi}.${ii}`;
          return `<label class="check-row"><input type="checkbox" id="care${gi}_${ii}" data-care="${k}" ${careDone.has(k) ? "checked" : ""}><span>${esc(t)}</span></label>`;
        }).join("")}</div>`).join("")}
        <div class="obj-actions"><button class="btn btn-sm" id="careReset" type="button">Start a new visit</button></div></div>`) +
      block("Reorder", calcHTML("careCalc") + `<p class="t3" style="margin-top:12px">Running low? <a href="#" data-tab-link="suppliers">Order from our suppliers →</a></p>`);
    $$("[data-care]", $("#careBody")).forEach((c) => c.addEventListener("change", () => {
      c.checked ? careDone.add(c.dataset.care) : careDone.delete(c.dataset.care);
      store.set("ic_care_checks", [...careDone]);
      $("#careCount").textContent = careDone.size;
    }));
    $("#careReset").addEventListener("click", () => { careDone.clear(); store.set("ic_care_checks", []); renderCare(); });
    bindCalc($("#careBody"));
    observeReveals($("#careBody"));
  }

  // =================================================================== OBJECTIONS
  // What owners say on the phone and how Gage answers (from his calls and videos, the same method the
  // old call coach graded against). `say` is the line to use, `why` the reasoning, `traps` the common
  // wrong answers (used as the quiz's wrong options, so keep them believable).
  const OBJECTIONS = [
    {
      id: "space", tag: "Space",
      q: "We don't have room for a machine.",
      say: "Totally get it. It's wall-mounted, by the way, if that changes anything. And I can wrap it to match your shop, so it looks like it belongs there.",
      why: "Gage doesn't fold on the first no. The smaller wall-mount or countertop unit is much easier to say yes to, and a custom wrap kills the \"it'll look out of place\" worry. Got more than one location? Ask about the other one.",
      traps: [
        "No worries, I understand. Thanks for your time!",
        "It really doesn't take up much space, trust me. Most owners find room somewhere.",
      ],
    },
    {
      id: "vendor", tag: "Competition",
      q: "We already have a vending machine guy.",
      say: "Totally fair. The way we do it out here, we'll take care of you a little better. I promise you that. Are you locked into a contract with them?",
      why: "Gage's line to a gas station that already had machines. Often there's no contract at all. Offer better service or a better deal, and remember a card machine isn't a snack machine: it doesn't replace what they already have.",
      traps: [
        "Oh, okay. Well, if anything changes, give me a call.",
        "Honestly, most of those vendors are terrible. You should switch to us.",
      ],
    },
    {
      id: "sell-cards", tag: "Competition",
      q: "We already sell Pokémon cards here.",
      say: "That's actually perfect. Your customers already buy cards here. The machine sits by the door and catches the impulse buys, and your own cards can stay right where they are.",
      why: "Gage calls this one of his easiest closes. The demand is already proven in that store.",
      traps: [
        "Oh, then you probably don't need a machine. Sorry to bother you.",
        "Our cards are cheaper than yours, so customers will buy from the machine instead.",
      ],
    },
    {
      id: "cost", tag: "Money",
      q: "How much does it cost me?",
      say: "Nothing. I place it for free, I stock it for free, I maintain it for free. You come out of pocket nothing.",
      why: "Gage's exact pitch. Say it plainly and confidently. \"Free\" and \"zero cost\" is the point owners need to hear.",
      traps: [
        "Just a small setup fee, then it pays for itself.",
        "Well, it depends. There are a few different options we can go over.",
      ],
    },
    {
      id: "cut", tag: "Money",
      q: "What's in it for me? What's my cut?",
      say: "First, it's something fun your customers won't find anywhere else nearby, and it shows up on Google Maps like an ATM does, so card people come in. On top of that you get a share of every sale.",
      why: "Lead with the value add, then the revenue share (usually 10 to 20% of sales). Gage: \"Half of the time they actually don't even ask for money.\" Never promise a dollar amount.",
      traps: [
        "You'll make at least a few hundred bucks a month, easy.",
        "Honestly, not much. It's more of a favor to me.",
      ],
    },
    {
      id: "how-much", tag: "Money",
      q: "So how much will I make a month?",
      say: "Every spot's different, so I'm not going to throw a number at you. What I can tell you is it costs you nothing, you get a cut of every sale, and if it's not working we pull it.",
      why: "Promising an income is a hard red flag in Gage's method. It hurts your reputation and the spot when the number doesn't hit. Be honest about the cut and the zero risk.",
      traps: [
        "My machines do about $2,000 a month, so you'd get a few hundred.",
        "Enough to cover your rent, probably.",
      ],
    },
    {
      id: "info", tag: "Stall",
      q: "Just send me some info.",
      say: "For sure. I'll text you a few photos and a mockup of how it'd look by your register. Are you around Thursday afternoon so I can swing by for five minutes?",
      why: "\"Send me info\" with no next step is a soft no. Say yes, AND lock in a specific day and time to talk or come by.",
      traps: [
        "Sounds good, what's your email? I'll send it over.",
        "I don't really have anything to send, it's easier if I just explain it now.",
      ],
    },
    {
      id: "later", tag: "Stall",
      q: "I need to think about it. Call me back later.",
      say: "Totally, no rush. What would you want to know to make it an easy yes? And when's good for me to call back? Tuesday morning work?",
      why: "Find out what's really holding them up, then pin a time. Gage: \"Sometimes it takes up to five, six, seven times.\" Log it and follow up around what they said.",
      traps: [
        "Okay, sounds good. I'll call you sometime.",
        "There's really nothing to think about. It's free.",
      ],
    },
    {
      id: "not-owner", tag: "Gatekeeper",
      q: "I'm not the owner. I can't make that call.",
      say: "No problem at all. Who's the best person to talk to about something like this, and what's the best number or time to reach them?",
      why: "Gage: \"A lot of people make the big mistake of calling the front desk.\" Don't pitch someone who can't say yes. Getting the owner's name and number is the win.",
      traps: [
        "Oh, okay. Well, let me tell you about it anyway so you can pass it along.",
        "Can you just ask them and call me back?",
      ],
    },
    {
      id: "number", tag: "Gatekeeper",
      q: "How did you get my number?",
      say: "Off the internet. Anyway, I've been placing these card machines around town and your spot came up as a really strong fit.",
      why: "Stay calm and keep it moving, like Gage does. Don't get defensive or over-explain.",
      traps: [
        "I'm so sorry, I didn't mean to bother you. I'll take you off my list.",
        "I used a skip-trace tool that finds owners' cell phones.",
      ],
    },
    {
      id: "not-interested", tag: "Brush-off",
      q: "Not interested.",
      say: "Totally fair. Just so I know, is it the space, or just not something you've thought about? It costs you nothing, so most owners are surprised once they hear how it works.",
      why: "One calm reframe or question to find the real reason before you let it go. If it's still a no, leave the door open for a follow-up. Never get pushy or rude after a no.",
      traps: [
        "Okay, have a good one.",
        "You're honestly missing out. Everyone else around here is doing it.",
      ],
    },
    {
      id: "locked-in", tag: "Risk",
      q: "I don't want to be locked into anything.",
      say: "You won't be. Let's do a two-month trial. If it's not a fit, I come pick it up, no hard feelings.",
      why: "Gage uses a trial so owners \"don't feel like you're locked in.\" Lowering the risk makes yes easy.",
      traps: [
        "It's a standard one-year agreement, but it's really easy.",
        "Don't worry about the contract stuff, we can figure that out later.",
      ],
    },
    {
      id: "work", tag: "Risk",
      q: "Who deals with it if it breaks or runs out?",
      say: "That's all me. I stock it, I maintain it, I fix it. All you need is an outlet and Wi-Fi.",
      why: "Hands-off is part of the offer. The owner only provides an outlet and Wi-Fi.",
      traps: [
        "Your staff would just need to refill it now and then.",
        "It basically never breaks, so it won't be an issue.",
      ],
    },
    {
      id: "official", tag: "Trust",
      q: "Is this an official Pokémon thing?",
      say: "No, I'm an independent operator. I buy the cards and run the machines myself, and I take care of everything.",
      why: "Claiming any official Pokémon Company connection is a hard red flag. Honest confidence beats sounding bigger than you are.",
      traps: [
        "Yeah, we partner with Pokémon directly.",
        "Kind of. We're one of their approved vendors.",
      ],
    },
  ];

  // Mastery (ids answered right in flashcards or the quiz) is a per-device convenience, so it's in
  // browser storage. Missing storage just means progress isn't remembered.
  const mastered = new Set(store.get("ic_obj_mastered", []).filter((id) => OBJECTIONS.some((o) => o.id === id)));
  const saveMastered = () => store.set("ic_obj_mastered", [...mastered]);
  const obj = { mode: "list", deck: [], i: 0, flipped: false, right: 0, missed: [] };
  const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const ownerLine = (o) => `<span class="label">Owner says</span><p class="obj-q">"${esc(o.q)}"</p>`;

  function renderMastery() {
    $("#objMastery").textContent = `${mastered.size} of ${OBJECTIONS.length} mastered`;
  }

  function setObjMode(mode) {
    obj.mode = mode;
    $$("[data-obj-mode]").forEach((b) => b.classList.toggle("active", b.dataset.objMode === mode));
    if (mode === "list") renderObjList();
    else startDeck(OBJECTIONS);
  }
  $$("[data-obj-mode]").forEach((b) => b.addEventListener("click", () => setObjMode(b.dataset.objMode)));

  function renderObjList() {
    $("#objBody").innerHTML = `<div class="obj-list stagger">${OBJECTIONS.map((o, n) => `
      <details class="card obj-item">
        <summary>
          <span class="marker">${String(n + 1).padStart(2, "0")}</span>
          <span class="grow obj-q">"${esc(o.q)}"</span>
          ${mastered.has(o.id) ? '<span class="badge ok">Mastered</span>' : `<span class="badge mute">${esc(o.tag)}</span>`}
        </summary>
        <div class="fix"><span class="label">Say this</span>${esc(o.say)}</div>
        <p class="obj-why">${esc(o.why)}</p>
        <p class="label" style="margin-top:16px">Don't say</p>
        <ul class="check-list">${o.traps.map((t) => `<li><span class="mk no">✕</span><span class="t3">"${esc(t)}"</span></li>`).join("")}</ul>
      </details>`).join("")}</div>`;
    observeReveals($("#objBody"));
  }

  function startDeck(items) {
    obj.deck = shuffle(items);
    obj.i = 0; obj.right = 0; obj.missed = []; obj.flipped = false;
    renderCard();
  }

  function deckProgress() {
    const pct = Math.round((obj.i / obj.deck.length) * 100);
    return `<div class="obj-progress"><span class="label">${obj.i + 1} of ${obj.deck.length}</span><div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div></div>`;
  }

  function renderCard() {
    if (obj.i >= obj.deck.length) return renderDeckDone();
    const o = obj.deck[obj.i];
    if (obj.mode === "cards") {
      $("#objBody").innerHTML = `${deckProgress()}
        <button class="card flash ${obj.flipped ? "flipped" : ""}" id="flashCard" aria-live="polite">
          ${obj.flipped
            ? `<span class="label">Say this</span><p class="flash-a">${esc(o.say)}</p><p class="obj-why">${esc(o.why)}</p>`
            : `${ownerLine(o)}<p class="small t4 flash-hint">Say your answer out loud, then tap to check it.</p>`}
        </button>
        <div class="obj-actions">
          ${obj.flipped
            ? `<button class="btn" id="cardAgain">↺ Practice again</button><button class="btn btn-primary" id="cardGot">Got it ✓</button>`
            : `<button class="btn btn-primary" id="cardFlip">Show answer</button>`}
        </div>
        <p class="small t5 obj-keys">Keys: space to flip, → got it, ← again</p>`;
      $("#flashCard").addEventListener("click", () => { obj.flipped = !obj.flipped; renderCard(); });
      $("#cardFlip")?.addEventListener("click", () => { obj.flipped = true; renderCard(); });
      $("#cardGot")?.addEventListener("click", () => gradeCard(true));
      $("#cardAgain")?.addEventListener("click", () => gradeCard(false));
    } else {
      // Quiz: Gage's answer vs. the two common mistakes, in random order.
      const opts = shuffle([{ t: o.say, ok: true }, ...o.traps.map((t) => ({ t, ok: false }))]);
      $("#objBody").innerHTML = `${deckProgress()}
        <div class="card">${ownerLine(o)}<p class="small t4" style="margin-top:6px">Pick the best answer.</p>
          <div class="quiz-opts">${opts.map((x, k) => `<button class="quiz-opt" data-k="${k}">${esc(x.t)}</button>`).join("")}</div>
          <div id="quizWhy"></div>
        </div>
        <div class="obj-actions"><button class="btn btn-primary" id="quizNext" hidden>Next →</button></div>`;
      $$(".quiz-opt").forEach((b) => b.addEventListener("click", () => {
        if ($(".quiz-opt.picked")) return;
        const ok = opts[Number(b.dataset.k)].ok;
        b.classList.add("picked");
        $$(".quiz-opt").forEach((x) => { x.disabled = true; x.classList.add(opts[Number(x.dataset.k)].ok ? "right" : "wrong"); });
        $("#quizWhy").innerHTML = `<div class="fix"><span class="label">${ok ? "Nice. That's Gage's answer" : "Not quite. Gage would say"}</span>${esc(o.say)}</div><p class="obj-why">${esc(o.why)}</p>`;
        gradeCard(ok, true);
        $("#quizNext").hidden = false;
        $("#quizNext").focus();
        $("#quizNext").addEventListener("click", () => { obj.i++; renderCard(); });
      }));
    }
  }

  function gradeCard(ok, stay = false) {
    const o = obj.deck[obj.i];
    if (ok) { obj.right++; mastered.add(o.id); } else { obj.missed.push(o); mastered.delete(o.id); }
    saveMastered();
    renderMastery();
    if (stay) return;
    obj.i++; obj.flipped = false;
    renderCard();
  }

  function renderDeckDone() {
    const n = obj.deck.length, missed = obj.missed.length;
    $("#objBody").innerHTML = `<div class="card hl hl-glow obj-done">
        <span class="label">${obj.mode === "quiz" ? "Quiz" : "Flashcards"} done</span>
        <div class="stat-num gold-num pop"><span data-count="${obj.right}">0</span><span class="t4" style="font-size:.5em">/ ${n}</span></div>
        <p class="verdict">${missed ? `${missed} to work on. Run them again until they're automatic.` : "Clean run. You've got these down."}</p>
        <div class="obj-actions">
          ${missed ? `<button class="btn btn-primary" id="deckMissed">Practice the ${missed} I missed</button>` : ""}
          <button class="btn" id="deckAgain">Start over</button>
          <button class="btn" id="deckList">Back to the list</button>
        </div>
      </div>`;
    countUps($("#objBody"));
    $("#deckMissed")?.addEventListener("click", () => startDeck(obj.missed));
    $("#deckAgain").addEventListener("click", () => startDeck(OBJECTIONS));
    $("#deckList").addEventListener("click", () => setObjMode("list"));
  }

  document.addEventListener("keydown", (e) => {
    if ($("#tab-objections").hidden || obj.mode !== "cards" || obj.i >= obj.deck.length) return;
    if (e.target.closest("input, textarea, select")) return;
    if (e.key === " " && !e.target.closest("button")) { e.preventDefault(); obj.flipped = !obj.flipped; renderCard(); }
    else if (e.key === "ArrowRight" && obj.flipped) gradeCard(true);
    else if (e.key === "ArrowLeft" && obj.flipped) gradeCard(false);
  });

  function openObjections() {
    renderMastery();
    if (obj.mode === "list") renderObjList();
  }

  // =================================================================== SUPPLIERS
  function renderSuppliers(key = store.get("ic_supplier", SUPPLIERS[0].key)) {
    const s = SUPPLIERS.find((x) => x.key === key) || SUPPLIERS[0];
    store.set("ic_supplier", s.key);
    $("#supplierTabs").innerHTML = SUPPLIERS.map((x) => `<button class="chip ${x.key === s.key ? "active" : ""}" data-sup="${x.key}">${esc(x.title)}</button>`).join("");
    $$("#supplierTabs .chip").forEach((b) => b.addEventListener("click", () => renderSuppliers(b.dataset.sup)));
    const id = sheetId(s.sheet || "");
    const what = s.key === "machines" ? "vending machines" : s.title.toLowerCase();
    $("#supplierBody").innerHTML = (id
      ? sheetEmbed(s.sheet, `${s.title} suppliers`)
      : emptyCard(s.title, "List coming soon", `${s.sub} The team is putting the spreadsheet together. It'll show up right here.`)) +
      block("How to reach out and order", `<div class="card">${stepList([
        ["Pick a supplier from the list", "Start with the one the team marks as preferred."],
        ["Email or call them with the message below", "Mention the program if the list says there's a program deal."],
        ["Confirm price, minimum order and shipping time", "Get it in writing before you pay."],
        ["Order and log it", "Write down the order date, what you ordered and the tracking number."],
      ])}</div>` + copyBlock(`Subject: Wholesale order: ${what}\n\nHi,\n\nI run Pokémon card vending machines in [city] and I'm looking to order ${what} from you.\n\nCould you send me:\n- Your wholesale price list\n- Minimum order quantity\n- Shipping cost and time to [ZIP]\n- Whether you offer repeat-order or volume pricing\n\nThanks,\n[Your name]\n[Your phone]`, { label: "Message to send" })) +
      (s.key === "machines" ? "" : block(`How much ${esc(s.title.toLowerCase())} to order`, calcHTML("supCalc")));
    bindCalc($("#supplierBody"));
    observeReveals($("#supplierBody"));
  }

  // =================================================================== COLD CALLING
  function renderCalling(i = 0) {
    if (!$("#loomList").childElementCount) {
      $("#loomList").innerHTML = LOOMS.map(videoCard).join("");
    }
    const s = SCRIPTS[i];
    $("#scriptsTabs").innerHTML = SCRIPTS.length > 1
      ? SCRIPTS.map((x, j) => `<button class="chip ${j === i ? "active" : ""}" data-i="${j}">${esc(x.title)}</button>`).join("")
      : "";
    $$("#scriptsTabs .chip").forEach((b) => b.addEventListener("click", () => renderCalling(Number(b.dataset.i))));
    const src = `https://docs.google.com/document/d/${s.doc}/preview`;
    if ($("#scriptFrame").src !== src) $("#scriptFrame").src = src;
    $("#scriptOpen").href = `https://docs.google.com/document/d/${s.doc}/edit?usp=sharing`;
  }

  // Sign in last: everything boot() touches is defined by now.
  boot();
})();
