# Builds the GitHub Pages version: the real app plus parts/static-adapter.js. Output: dist/
import os, re, shutil
W = "../public/"
D = "dist/"
shutil.rmtree(D, ignore_errors=True); os.makedirs(D)
h = open(W + "index.html").read(); js = open(W + "app.js").read()
js = re.sub(r"(?<![\w.])fetch\(", "window.__vhFetch(", js)
open(D + "app.js", "w").write(js)
shutil.copy(W + "styles.css", D + "styles.css")
shutil.copy("adapter.js", D + "adapter.js")
open(D + "styles.css", "a").write("""
/* public demo banner */
.demo-bar { position: sticky; top: 0; z-index: 2000; background: var(--accent); color: #000; font-size: 12.5px; font-weight: 500; text-align: center; padding: 7px 16px; }
#app .sidebar { top: 32px; }
@media (max-width: 900px) { #app .sidebar { top: auto; } }
""")
n = 0
h, n = re.subn(r'<script src="app.js\?v=(\d+)"></script>', r'<script src="adapter.js?v=\1"></script>\n<script src="app.js?v=\1"></script>', h)
assert n == 1
h = h.replace("<body>\n", '<body>\n<div class="demo-bar">Live demo. Places come live from OpenStreetMap (up to 40 miles). Your leads are saved in this browser.</div>\n', 1)
open(D + "index.html", "w").write(h)
open(D + ".nojekyll", "w").write("")
print("ok", sorted(os.listdir(D)))
