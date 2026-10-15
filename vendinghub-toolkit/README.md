# VendingHub - Toolkit

Live: https://pack-placement-inner-circle.netlify.app (Netlify site `pack-placement-inner-circle`, id `e80e2a51-c72a-4385-9e7c-10c507a9b467`)

A private web app for Pack Placement inner circle students. Gage's AI and the call coach now live in Claude, so this site has no AI features and no AI costs.

| Page | What it does |
|---|---|
| **Dashboard** | Welcome, stats (machines placed, spots checked, objections mastered), tool cards, recent spot checks. |
| **My Leads** | The student's CRM: places saved from Locations (one by one or select-all), status (to call, no answer, follow up, said no, said yes, placed), owner name and cell, follow-up date, notes. Bulk status change, delete, CSV, a clean PDF with clickable Google Maps links, and a Skip & Trace export. Stored server-side per student (`/api/leads`, up to 3,000). |
| **Skip & Trace Team** | Video, the team's contact, how it works, a message to copy, and **Import results**: the team's filled-in file (Lead ID, Owner name, Owner cell) goes straight into My Leads. |
| **Locations** | ~1M US businesses Gage recommends (Korean BBQ, malls, gas, liquor, bowling, arcades, restaurants) from Overture Maps open data, ranked by type and distance, with phone numbers and Google Maps links. Free: no API. |
| **Dwell Check** | Rule-based green/yellow/red grade of a spot on Gage's rules. Paste a Google Maps link to fill it in automatically (place lookup + census income + card shops within a mile). Below it: the 100 proven spots sheet. |
| **Cold Calling** | Loom videos (how to cold call, a real call), then the script (embedded Google Doc). |
| **Objections** | Common owner objections with Gage's answers. Study list, flashcards, and a quiz where the wrong options are the usual mistakes. Progress is saved per device. |
| **Call Analyzer** | How to connect Claude to our MCP connector (call grading, Gage AI), with ready-to-copy prompts. |
| **Got a Yes** | What to confirm before hanging up, the agreement template, and three copy-ready follow-up emails. |
| **Order a Machine** | Discount code (copy button), ordering steps, a Loom. |
| **Suppliers** | Machines, Pokémon cards and squishies. Each one shows an embedded Google Sheet once it's added, plus how to reach out and an inquiry email. |
| **Setup & Install** | Four Loom slots (unbox, set up, pack, install) and an install checklist saved per device. |
| **Trends** | Weekly posts. Log in with the admin code (`ACCESS_CODE`) to post or delete; students only read. Stored in Netlify Blobs, no redeploy needed. |
| **Profile** | Per-student profile, stored server-side under the student's code. |

## Editing content (all at the top of `public/app.js`, under "content you edit")
- **Loom videos:** paste the share link (`https://www.loom.com/share/...`) into `url` in `LOOMS`.
- **Script:** the Google Doc id in `SCRIPTS` (doc shared "anyone with the link"). Add more entries to get tabs.
- **Supplier spreadsheets:** paste the Google Sheets link into `sheet` in `SUPPLIERS` (shared "anyone with the link can view"). Students get the embedded sheet, an Open button and an .xlsx download.
- **100 proven spots (Dwell Check):** `PROVEN_SPOTS.sheet`.
- **Call Analyzer:** `CLAUDE_CONNECTOR.url` (the MCP server URL students paste into Claude) and `.loom`.
- **Agreement:** `AGREEMENT.doc` (Google Doc template; students get a "Make my copy" button), `esignName` / `esignUrl`.
- **Ordering:** `ORDERING` (supplier, url, discount `code`, `loom`, `steps` as a list of strings). The site is behind login, so the code is only shown to students.
- **Setup videos:** `SETUP_VIDEOS[].url`.
- **Skip & Trace team:** `SKIP_TRACE` (loom, email, phone, text, hours, turnaround). Empty fields are hidden.
- **Objections:** the `OBJECTIONS` list (search for `const OBJECTIONS`). Each has `q` (what the owner says), `say` (the answer), `why`, and two `traps` (common wrong answers, used as the quiz's wrong options).

Then bump `?v=N` on `styles.css` / `app.js` in `public/index.html` and deploy.

## Access codes
Each student has a personal code (`PP-XXXX-XXXX`) listed in `access-codes.xlsx` (never committed or deployed). The server only sees SHA-256 hashes in `netlify/edge-functions/_shared/code-hashes.js`. The `ACCESS_CODE` env var is the owner's admin code.
```
python3 -m venv .venv && .venv/bin/pip install openpyxl
.venv/bin/python scripts/make-codes.py 0 --add    # rebuild code-hashes.js from the existing sheet
.venv/bin/python scripts/make-codes.py 50 --add   # add 50 new codes
```
Never run `make-codes.py` without `--add`: that makes a brand new set of codes and locks every current student out.

## Deploy
```
npm install
node scripts/pull-live-data.mjs     # downloads public/places + public/income from the live site
./scripts/deploy.sh
```
`deploy.sh` refuses to run if `code-hashes.js` or the places/income data is missing, because deploying without them would lock students out or empty Locations and Dwell Check. It deploys from an isolated temp copy so the Netlify CLI never picks up another project's config.

Env vars on the Netlify site: `ACCESS_CODE`. (`ANTHROPIC_API_KEY` and `ASSEMBLYAI_API_KEY` are no longer used and can be deleted.)

## Refreshing the data (every month or two)
```
.venv/bin/pip install duckdb
.venv/bin/python scripts/build-places.py 2026-09-23.1   # ~30 min, Overture release tag
python3 scripts/build-income.py                         # census median income per tract
```

## Files
- `public/`: the single-page app (`index.html`, `styles.css`, `app.js`)
- `netlify/edge-functions/student.ts`: `/api/check`, `/api/me`, `/api/dwell`, `/api/leads`, `/api/trends` (and the old `/api/reviews`, `/api/chat`), stored in the Netlify Blobs store `students`
- `netlify/edge-functions/place-lookup.ts`: resolves a Google Maps link for Dwell Check
- `scripts/`: data builders, code generator, data pull, deploy

## Design rules
Pure black canvas, dot grid and soft light rays, hairline translucent cards, gold `#F5B301` as the only accent, Anton uppercase headings, Inter 300 body. Permanent left sidebar (no hamburger menu, no scroll-progress bar). The holo border is used once (login). Don't name a modifier class `hero`.
