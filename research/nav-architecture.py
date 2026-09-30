"""
NAVIGATION ARCHITECTURE TEST — the V-model's system-level checks against the
information architecture in docs/IA_SYSTEM_DESIGN.md.

Builds the platform's navigation graph FROM SOURCE:
  nodes  = routes in App.tsx (+ terminal tabs /t?tab=x)
  edges  = every link target in the client (href, Link, setLocation, navigate,
           window.location, nav-model, palettes) plus the legacy redirect table
and runs these tests. Each maps to a requirement id in the design doc (§4).

  HARD (exit 1 on failure)
  N1  Dead links          a link target that resolves to no route, no redirect, no tab      (R-NAV-1)
  N3  Orphan page files   a file under pages/ that nothing imports                          (R-NAV-2)
  N4  Unreachable routes  a routed page no nav surface or page links to                     (R-NAV-2)
  N6  One owner/function  each FUNCTION in the registry has exactly one owning TOOL,
                          and no tool owns two functions                                     (R-FN-1)
  N7  Phantom chrome      publicPages / full-bleed / skipPaths lists name only real routes   (R-NAV-3)
  N8  One-hop redirects   every legacy row lands on a live route in one hop                 (R-MIG-1)
  N9  Tab preserved       retired pages with a successor tab land ON that tab                (R-MIG-2)
  N10 Workflows <=2 clicks every step of every operator workflow is reachable in <=2
                          clicks from the step before (global chrome, palette, or a link)   (R-FLOW-1)
  N11 Search everywhere   every chrome (NexusFrame, terminal) has a desktop AND a phone
                          trigger for search / the palette                                   (R-NAV-4)
  N12 Dead UI state       a useState whose setter is only ever called with null/false
                          (a panel that can never open) — allowlisted debt only              (R-NAV-5)
  N14 Phone dock order    the bottom dock reads TODAY, NEXUS, FLOW, GEX, CHART (no More —
                          the rest opens from the top-bar menu); on the desktop rail CHART
                          sits in the Research group                                          (R-NAV-6)

  REPORT (tracked debt; trend must go down phase over phase)
  N2  Redirect links      live code still linking to a retired URL (costs a hop)
  N3b Dead modules        client modules unreachable from main.tsx
  N6b Redundancy debt     functions still served by >1 CURRENT surface
  N5  Nav model           tabs + pages as the chrome sees them

Run: python3 research/nav-architecture.py → research/nav-architecture.json
"""
import json, os, re, glob, collections, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "client", "src")
rd = lambda p: open(p, encoding="utf-8", errors="ignore").read()
rel = lambda p: os.path.relpath(p, ROOT)

app = rd(os.path.join(SRC, "App.tsx"))
routes = re.findall(r'<Route path="([^"]+)"\s+component=\{(?:withBetaProtection\(|withAdminProtection\()?(\w+)', app)
route_paths = [p for p, _ in routes]
comp_of = dict(routes)

red_src = rd(os.path.join(SRC, "lib", "legacy-redirects.ts"))
redirects = re.findall(r'\["(/[^"]*)",\s*"([^"]+)"\]', red_src)
redirect_param = re.findall(r'\["(/[^"]*:[^"]*)",\s*\(', red_src)
redirect_paths = [a for a, _ in redirects] + redirect_param

nav = rd(os.path.join(SRC, "components", "shell", "nav-model.tsx"))
tabs = re.findall(r"\{ id: '(\w+)',\s+label: '([A-Z]+)' \}", nav)
nav_pages = re.findall(r"href: '(/[^']+)'", nav)
TAB_IDS = {t for t, _ in tabs}
MOVED_TABS = {"prism", "heatmap"}  # terminal-shell MOVED_TABS → gex

def to_regex(p):
    return re.compile("^" + re.sub(r":\w+", r"[^/]+", p.rstrip("/") or "/") + "/?$")
R_ROUTE = [(p, to_regex(p)) for p in route_paths]
R_REDIR = [(p, to_regex(p)) for p in redirect_paths]

def resolve(target):
    path, _, q = target.partition("?")
    path = path.split("#")[0].rstrip("/") or "/"
    if path == "/t":
        m = re.search(r"tab=(\w+)", q)
        if m and m.group(1) not in TAB_IDS and m.group(1) not in MOVED_TABS:
            return "dead-tab"
        return "route"
    # static files served from client/public (e.g. the PDF guide) are not SPA routes
    if os.path.isfile(os.path.join("client", "public", path.lstrip("/"))):
        return "route"
    for p, rx in R_ROUTE:
        if rx.match(path): return "route"
    for p, rx in R_REDIR:
        if rx.match(path): return "redirect"
    return "dead"

# ── link extraction ─────────────────────────────────────────────────────────
LINK_PATTERNS = [
    r'href="(/[^"#]*)"', r"href='(/[^'#]*)'", r'href=\{"(/[^"#]*)"\}',
    r"setLocation\(\s*'(/[^']*)'", r'setLocation\(\s*"(/[^"]*)"', r"setLocation\(\s*`(/[^`$]*)",
    r"navigate\(\s*'(/[^']*)'", r'navigate\(\s*"(/[^"]*)"',
    r"window\.location\.href\s*=\s*'(/[^']*)'", r'window\.location\.href\s*=\s*"(/[^"]*)"',
    r'<Redirect to="(/[^"]*)"', r"path: '(/[^']+)'", r"href: '(/[^']+)'", r'href: "(/[^"]+)"',
    r"\['(/[a-z][^']*)',\s*'[A-Z]", r"url: '(/[^']+)'", r"url=\"(/[^\"]+)\"", r"a=\{\[([^\]]+)\]\}",
]
TEMPLATE = re.compile(r"(?:href=\{|setLocation\(|go\()`(/[^`]*)`")
files = [f for f in glob.glob(os.path.join(SRC, "**", "*.tsx"), recursive=True) + glob.glob(os.path.join(SRC, "**", "*.ts"), recursive=True)
         if "legacy-redirects" not in f and "/lib/journal/legacy-jtab" not in f]
links = collections.defaultdict(list)       # target -> [file]
links_by_file = collections.defaultdict(set)
def add_link(t, f):
    t = t.strip().strip("'\"")
    if not t.startswith("/") or t.startswith("//") or t.startswith("/api") or t.startswith("/assets"): return
    if re.search(r"\.(png|svg|jpg|json|webmanifest|ico)$", t): return
    links[t].append(rel(f)); links_by_file[rel(f)].add(t)
for f in files:
    s = rd(f)
    for pat in LINK_PATTERNS:
        for t in re.findall(pat, s):
            if pat.startswith("a=\\{"):
                for u in re.findall(r"'(/[^']+)'", t): add_link(u, f)
            else:
                add_link(t, f)
    for t in TEMPLATE.findall(s):
        add_link(re.sub(r"\$\{[^}]*\}", "x", t), f)

dead, via_redirect, ok = {}, {}, {}
for t, fs in links.items():
    r = resolve(t)
    (dead if r in ("dead", "dead-tab") else via_redirect if r == "redirect" else ok)[t] = sorted(set(fs))

# ── import graph (for N3 / N3b) ─────────────────────────────────────────────
IMP = re.compile(r"""(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]""")
def resolve_mod(spec, frm):
    if spec.startswith("@/"): base = os.path.join(SRC, spec[2:])
    elif spec.startswith("."): base = os.path.normpath(os.path.join(os.path.dirname(frm), spec))
    else: return None
    for c in (base + ".tsx", base + ".ts", base + "/index.tsx", base + "/index.ts", base):
        if os.path.isfile(c): return c
    return None
all_mods = [f for f in files + [os.path.join(SRC, "lib", "legacy-redirects.ts"), os.path.join(SRC, "lib", "journal", "legacy-jtab.ts")]
            if not f.endswith(".d.ts") and ".test." not in f and "/__tests__/" not in f]
graph = {f: {m for m in (resolve_mod(x, f) for x in IMP.findall(rd(f))) if m} for f in all_mods}
seen, stack = set(), [os.path.join(SRC, "main.tsx")]
while stack:
    f = stack.pop()
    if f in seen: continue
    seen.add(f); stack.extend(graph.get(f, ()))
dead_modules = sorted(rel(f) for f in all_mods if f not in seen and os.path.basename(f) != "main.tsx")
# Page files retired from the router whose deletion is left to the operator
# (Slate and Radar, 2026-09-29: routes, nav and links removed; /slate and
# /radar redirect to /today). Delete the files, then empty this list.
RETIRED_PAGE_FILES: set = set()
retired_present = sorted(m for m in dead_modules if m in RETIRED_PAGE_FILES)
orphans = sorted(m for m in dead_modules if "/pages/" in m and m not in RETIRED_PAGE_FILES)

# ── N4 unreachable routes ──────────────────────────────────────────────────
linked_paths = set(t.split("?")[0].rstrip("/") or "/" for t in links)
unreachable = []
for p in route_paths:
    rx = to_regex(p)
    if p in ("/", "/t"): continue
    if p.startswith("/admin") or p in ("/reset-password", "/invite", "/forgot-password"): continue
    if not any(rx.match(l) for l in linked_paths): unreachable.append(p)

# ── N6 function registry — ONE owning tool per function ────────────────────
# Mirrors docs/IA_SYSTEM_DESIGN.md §2. `owner` = the tool that will own the
# function in the target IA; `current` = the surfaces that serve it TODAY.
FUNCTIONS = {
    # FIND
    "Rank today's trade ideas":         {"owner": "ideas.ranked-book",   "current": ["/today Ranked setups", "/t NEXUS board"]},
    "Discover forming setups":          {"owner": "ideas.forming",       "current": ["NEXUS developing candidates"]},
    "Pre-market gap read":              {"owner": "ideas.gappers",       "current": []},  # /slate retired 2026-09-29; gap read to be re-homed on Today
    "Market regime + weekly path":      {"owner": "markets.weekly-path", "current": ["/today dealer map"]},
    "Sector rotation":                  {"owner": "markets.rotation",    "current": ["/today RotQuad", "RotationMap (terminal overlay, unreachable)", "landing RotQuad"]},
    "Market pulse / leadership":        {"owner": "markets.pulse",       "current": ["OracleMarketField (overlay, unreachable)", "SessionBrief (overlay, unreachable)"]},
    "Options flow tape":                {"owner": "flow.options-flow",   "current": ["/t?tab=flow flowdash", "ticker workup flow block"]},
    "Dealer positioning (GEX)":         {"owner": "gex.hub",             "current": ["/t?tab=gex GexHub", "/r/:s GEX surface", "flowdash GEX Chart"]},
    "GEX setups / magnets":             {"owner": "gex.setups",          "current": ["GexHub rankings panel", "flowdash GEX Setups"]},
    "Watchlist":                        {"owner": "markets.watchlist",   "current": ["NEXUS WatchlistRail", "flowdash Watchlist"]},
    "Catalysts / events":               {"owner": "markets.catalysts",   "current": ["/t?tab=catalyst"]},
    "Crypto transmission":              {"owner": "markets.crypto",      "current": ["/t?tab=crypto"]},
    "Long-dated (LEAPS) theses":        {"owner": "ideas.leaps",         "current": ["/t?tab=leaps"]},
    # UNDERSTAND
    "Per-ticker dossier":               {"owner": "research.dossier",    "current": ["/r/:s Dossier", "terminal workup overlay"]},
    "Price chart":                      {"owner": "research.chart",      "current": ["/t?tab=chart ChartLab", "FlowChartBoard", "workup chart"]},
    "Option chain / contract analysis": {"owner": "research.contract-lab", "current": ["/r/:s Contract lab", "workup options"]},
    "Strike x expiry matrix":           {"owner": "gex.matrix",          "current": ["gex-expiry-matrix", "research/terminal-heatmap"]},
    # ACT
    "Open positions / risk":            {"owner": "book.positions",      "current": ["/t?tab=positions"]},
    "Automation / paper bot":           {"owner": "book.bot",            "current": ["/t?tab=bot"]},
    "Alerts":                           {"owner": "book.alerts",      "current": ["/alerts page", "terminal Alerts drawer"]},
    # PROVE
    "Journal trades":                   {"owner": "journal.trades",      "current": ["/t?tab=journal Trades"]},
    "Journal analytics":                {"owner": "journal.analytics",   "current": ["/t?tab=journal Analytics"]},
    "Track record (model)":             {"owner": "journal.track-record", "current": ["Journal Track record", "/today Model record"]},
    "Backtest":                         {"owner": "journal.backtest",    "current": ["Journal backtest (pages/backtest)", "strategy-simulator"]},
    "Idea audit trail":                 {"owner": "journal.idea-audit",  "current": ["/trade-ideas/:id/audit"]},
    # PLATFORM
    "Search / command palette":         {"owner": "platform.palette",    "current": ["global CommandPalette", "terminal CommandPalette"]},
    "Account menu":                     {"owner": "platform.account-menu", "current": ["NexusFrame menu", "terminal menu"]},
    "Preferences / settings":           {"owner": "account.settings",    "current": ["/settings", "terminal Preferences drawer", "CustomizePanel"]},
    "Guide / how to use":               {"owner": "account.guide",       "current": ["/how-to", "terminal Guide drawer"]},
}
owners = collections.Counter(v["owner"] for v in FUNCTIONS.values())
multi_owner_tools = sorted(t for t, n in owners.items() if n > 1)
no_owner = sorted(f for f, v in FUNCTIONS.items() if not v.get("owner"))
redundancy_debt = {f: v["current"] for f, v in FUNCTIONS.items() if len(v["current"]) > 1}

# ── N7 phantom chrome lists ────────────────────────────────────────────────
def list_in_app(name):
    m = re.search(name + r"\s*=\s*\[([^\]]*)\]", app)
    return re.findall(r"'(/[^']*)'", m.group(1)) if m else []
phantom = {}
for lst in ("publicPages", "skipPaths"):
    bad = [p for p in list_in_app(lst) if resolve(p) not in ("route", "redirect")]
    if bad: phantom[lst] = bad
fb = re.findall(r"locationPath === '(/[^']*)'", app)
bad_fb = [p for p in fb if resolve(p) != "route"]
if bad_fb: phantom["isFullBleedShell"] = bad_fb

# ── N8 one-hop redirects ───────────────────────────────────────────────────
redirect_sources = [to_regex(p) for p in redirect_paths]
chains, dangling = [], []
for src, tgt in redirects:
    tp = tgt.split("?")[0]
    if any(rx.match(tp) for rx in redirect_sources): chains.append(f"{src} → {tgt}")
    elif resolve(tgt) != "route": dangling.append(f"{src} → {tgt}")

# ── N9 tab preservation ────────────────────────────────────────────────────
# Retired pages whose successor is a TAB. The row must land on that tab.
EXPECT_TAB = {
    "/pos": "tab=positions", "/j": "tab=journal", "/g": "tab=gex", "/btc": "tab=crypto", "/crypto": "tab=crypto",
    "/whale-flow": "tab=flow", "/smart-money": "tab=flow", "/automations": "tab=bot", "/watchlist-bot": "tab=bot",
    "/paper-trading": "tab=bot", "/geopolitical": "tab=catalyst",
    # /discovery, /ai-stock-picker (→ /today) and the scanner rows (→ /t, NEXUS
    # developing candidates) lost their Radar tabs when Radar was retired
    # 2026-09-29; they land on the page that now owns the function.
    "/futures": "tab=chart", "/futures-research": "tab=chart",
    "/performance": "jtab=record", "/insights": "jtab=insights", "/analytics": "jtab=analytics",
    "/convictions/backtest": "jtab=backtest", "/history": "jtab=trades", "/options-analyzer": "tab=options",
}
rmap = dict(redirects)
tab_dropped = {s: rmap.get(s) for s, want in EXPECT_TAB.items() if want not in (rmap.get(s) or "")}

# ── N10 operator workflows ≤ 2 clicks ──────────────────────────────────────
pal = rd(os.path.join(SRC, "components", "command-palette.tsx"))
palette_targets = set(re.findall(r"href: '(/[^']+)'", pal))
GLOBAL = set(nav_pages) | {("/t" if t == "oracle" else f"/t?tab={t}") for t in TAB_IDS} | palette_targets | {"/r/:symbol"}
def norm(u):
    p, _, q = u.partition("?")
    keep = sorted(kv for kv in q.split("&") if kv.split("=")[0] in ("tab", "jtab")) if q else []
    return p + ("?" + "&".join(keep) if keep else "")
GLOBAL_N = {norm(u) for u in GLOBAL}
PAGE_FILES = {  # the files that render a workflow step (their links are 1-click exits)
    "/today": ["client/src/pages/today.tsx"],
    "/t?tab=gex": ["client/src/components/gex/gex-hub-nexus.tsx", "client/src/components/gex/gex-rankings-panel.tsx"],
    "/t": ["client/src/pages/nexus-prototype.tsx"],
}
WORKFLOWS = {
    "W1 magnet → research → trade → review": ["/t?tab=gex", "/r/:symbol", "/t?tab=positions", "/t?tab=journal"],
    "W2 morning routine": ["/today", "/t", "/t?tab=positions"],
    "W3 evening review": ["/today", "/r/:symbol", "/t?tab=journal&jtab=record"],
    "W4 check an idea's evidence": ["/today", "/trade-ideas/:id/audit"],
    "W5 flow → chart → research": ["/t?tab=flow", "/t?tab=chart", "/r/:symbol"],
}
def reachable(prev, step):
    if norm(step) in GLOBAL_N: return "chrome/palette"
    rx = to_regex(step.split("?")[0])
    for f in PAGE_FILES.get(prev, []):
        if any(rx.match(t.split("?")[0]) for t in links_by_file.get(f, ())): return f"link in {os.path.basename(f)}"
    return None
workflow_fail, workflow_ok = {}, {}
for name, steps in WORKFLOWS.items():
    for a, b in zip(steps, steps[1:]):
        how = reachable(a, b)
        (workflow_ok if how else workflow_fail).setdefault(name, []).append(f"{a} → {b}" + (f" [{how}]" if how else ""))

# ── N11 search on every chrome, desktop + phone ────────────────────────────
frame = rd(os.path.join(SRC, "components", "shell", "nexus-frame.tsx"))
term = rd(os.path.join(SRC, "pages", "shells", "terminal-shell.tsx"))
search_fail = []
if "qe:open-command-palette" not in frame: search_fail.append("NexusFrame: no palette trigger")
if not re.search(r"lg:hidden[^>]*>\s*<Search|onClick=\{openPalette\}[\s\S]{0,300}lg:hidden", frame): search_fail.append("NexusFrame: no phone search trigger")
if "setPaletteOpen(true)" not in term: search_fail.append("terminal: no palette trigger")
if "setMobileSearchOpen" not in term: search_fail.append("terminal: no phone search")

# ── N12 dead UI state ──────────────────────────────────────────────────────
KNOWN_DEAD_STATE = {  # allowlisted debt: file → state, with the phase that removes it
    "client/src/pages/shells/terminal-shell.tsx:marketFocus": "Phase 2 (terminal UX branch owns the file): remove overlay; RotationMap/OracleMarketField/SessionBrief become Markets tools",
}
def call_args(src, fn):
    """Argument text of every `fn(...)` call, paren-balanced (handles nesting)."""
    out = []
    for m in re.finditer(r"\b" + re.escape(fn) + r"\(", src):
        i, depth = m.end(), 1
        while i < len(src) and depth:
            depth += {"(": 1, ")": -1}.get(src[i], 0); i += 1
        out.append(src[m.end():i - 1])
    return out
TRIVIAL = ("null", "false", "undefined", "")
dead_state, dead_state_new = [], []
for f in files:
    if not f.endswith(".tsx"): continue
    s = rd(f)
    for name, setter in re.findall(r"const \[(\w+), (set\w+)\] = useState", s):
        decl = f"const [{name}, {setter}] = useState"
        m = re.search(re.escape(decl) + r"(?:<[^>]*>)?\(", s)
        init_args = call_args(s[m.start():], "useState")[:1] if m else [""]
        body = s.replace(f"const [{name}, {setter}]", "")
        passed = re.findall(r"\b" + re.escape(setter) + r"\b(?!\()", body)  # setter passed by reference (e.g. onChange={setX})
        calls = call_args(body, setter)
        if calls and not passed and all(c.strip() in TRIVIAL for c in calls + init_args):
            key = f"{rel(f)}:{name}"
            dead_state.append(key)
            if key not in KNOWN_DEAD_STATE: dead_state_new.append(key)

# ── N14 phone dock order + CHART in Research (operator 2026-09-29) ─────────
menu_ok = "MobileMenuButton" in frame and "MobileMenuButton" in term
EXPECT_DOCK = ["page:/today", "tab:oracle", "tab:flow", "tab:gex", "tab:chart"]
dock_m = re.search(r"MOBILE_DOCK: DockItem\[\] = \[([\s\S]*?)\];", nav)
dock = [f"page:{h}" if k == "page" else f"tab:{t}" for k, h, t in
        re.findall(r"\{ kind: '(page|tab)', (?:href: '([^']+)'|tab: '(\w+)') \}", dock_m.group(1))] if dock_m else []
groups_src = rd(os.path.join(SRC, "components", "shell", "nav-groups.ts"))
research_m = re.search(r"id: 'research'[^\n]*tabs: \[([^\]]*)\]", groups_src)
research_tabs = re.findall(r"'(\w+)'", research_m.group(1)) if research_m else []
trade_m = re.search(r"id: 'trade'[^\n]*tabs: \[([^\]]*)\]", groups_src)
trade_tabs = re.findall(r"'(\w+)'", trade_m.group(1)) if trade_m else []
dock_fail = []
if dock != EXPECT_DOCK: dock_fail.append(f"dock={dock} want {EXPECT_DOCK}")
if "chart" not in research_tabs: dock_fail.append(f"chart not in Research group ({research_tabs})")
if "chart" in trade_tabs: dock_fail.append("chart still in Trade group")
if not menu_ok: dock_fail.append("top-bar menu button missing in NexusFrame or terminal")

# ── report ─────────────────────────────────────────────────────────────────
res = {
    "routes": len(route_paths), "redirects": len(redirect_paths), "tabs": len(tabs), "linkTargets": len(links),
    "N1_dead": dead, "N2_viaRedirect": via_redirect, "N3_orphanPageFiles": orphans, "N3b_deadModules": dead_modules,
    "N4_unreachableRoutes": unreachable, "N5_navModel": {"tabs": [l for _, l in tabs], "pages": nav_pages},
    "N6_multiOwnerTools": multi_owner_tools, "N6_functionsWithoutOwner": no_owner, "N6b_redundancyDebt": redundancy_debt,
    "N7_phantomChrome": phantom, "N8_chains": chains, "N8_dangling": dangling, "N9_tabDropped": tab_dropped,
    "N10_workflowFail": workflow_fail, "N10_workflowOk": workflow_ok, "N11_searchFail": search_fail,
    "N12_deadState": dead_state, "N12_knownDebt": KNOWN_DEAD_STATE,
    "N14_dock": dock, "N14_researchTabs": research_tabs, "N14_fail": dock_fail,
}
json.dump(res, open(os.path.join(ROOT, "research", "nav-architecture.json"), "w"), indent=2)

def line(tag, passed, detail=""):
    print(f"  {'PASS' if passed else 'FAIL'}  {tag}{('  ' + detail) if detail else ''}")
    return passed
print(f"routes {len(route_paths)}  redirects {len(redirect_paths)}  terminal tabs {len(tabs)}  link targets {len(links)}  functions {len(FUNCTIONS)}")
print("HARD")
hard = [
    line("N1  dead links", not dead, json.dumps(dead)[:600] if dead else ""),
    line("N3  orphan page files", not orphans, str(orphans) if orphans else ""),
    line("N4  unreachable routes", not unreachable, str(unreachable) if unreachable else ""),
    line("N6  one owner per function", not multi_owner_tools and not no_owner, f"{len(FUNCTIONS)} functions → {len(owners)} tools" + (f"  multi={multi_owner_tools} none={no_owner}" if multi_owner_tools or no_owner else "")),
    line("N7  phantom chrome entries", not phantom, json.dumps(phantom) if phantom else ""),
    line("N8  legacy URLs resolve in 1 hop", not chains and not dangling, f"{len(redirects)} static rows" + (f"  chains={chains} dangling={dangling}" if chains or dangling else "")),
    line("N9  retired pages keep their tab", not tab_dropped, f"{len(EXPECT_TAB)} checked" + (f"  dropped={tab_dropped}" if tab_dropped else "")),
    line("N10 workflows reachable in <=2 clicks", not workflow_fail, f"{len(WORKFLOWS)} workflows" + (f"  fail={workflow_fail}" if workflow_fail else "")),
    line("N11 search on every chrome (desktop+phone)", not search_fail, "; ".join(search_fail)),
    line("N12 no new dead UI state", not dead_state_new, (f"new={dead_state_new}" if dead_state_new else f"{len(dead_state)} allowlisted debt")),
    line("N14 phone dock TODAY·NEXUS·FLOW·GEX·CHART, rail CHART in Research", not dock_fail, "; ".join(dock_fail) if dock_fail else " · ".join(dock)),
]
print("REPORT (debt — must trend down)")
print(f"  N2  links through a redirect: {len(via_redirect)}  {sorted(via_redirect)[:12]}")
print(f"  N3b client modules unreachable from main.tsx: {len(dead_modules)}")
print(f"  N3c retired page files awaiting deletion: {retired_present}")
print(f"  N6b functions served by >1 current surface: {len(redundancy_debt)} / {len(FUNCTIONS)}")
print(f"  N12 allowlisted dead state: {dead_state}")
for name, steps in workflow_ok.items():
    print(f"  {name}: " + " | ".join(steps))
sys.exit(0 if all(hard) else 1)
