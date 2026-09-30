"""Report v6 — SR 11-7 model validation: loss attribution, shakeouts, findings register, post-report updates.

Content source (read-only): docs/SR11-7_VALIDATION_v6.md (main report) and docs/LOSS_ATTRIBUTION_2026-09-30.md
(Appendix A). Styling is the v5 builder's (research/build-report-v5.py). Writes docs/QuantEdge-Validation-Report-v6.pdf.

The built-in Helvetica/Courier fonts only cover WinAnsi, so characters outside it (minus sign, arrows, >=, Delta)
are mapped to ASCII before rendering; otherwise they print as black boxes.
"""
import os, re, datetime
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, Preformatted, PageBreak

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAIN = os.path.join(ROOT, "docs", "SR11-7_VALIDATION_v6.md")
LOSS = os.path.join(ROOT, "docs", "LOSS_ATTRIBUTION_2026-09-30.md")
LOGO = os.path.join(ROOT, "attached_assets", "qe-mark-blue.png")
OUT = os.path.join(ROOT, "docs", "QuantEdge-Validation-Report-v6.pdf")
INK, MUTE, RULE, BLUE, GREEN, AMBER, RED = "#1b2330", "#5b6472", "#d9dee5", "#2f7cf0", "#1e8f63", "#b8862b", "#c43d50"
PAGE_W = 7.0  # usable width, inches

ss = getSampleStyleSheet()
H0 = ParagraphStyle("H0", parent=ss["Heading1"], fontName="Helvetica-Bold", fontSize=13, textColor=colors.HexColor(BLUE), spaceBefore=4, spaceAfter=4, keepWithNext=1)
H1 = ParagraphStyle("H1", parent=ss["Heading1"], fontName="Helvetica-Bold", fontSize=14, textColor=colors.HexColor(INK), spaceBefore=6, spaceAfter=7, keepWithNext=1)
H2 = ParagraphStyle("H2", parent=H1, fontSize=11, leading=14, spaceBefore=6, spaceAfter=4)
B = ParagraphStyle("B", parent=ss["BodyText"], fontName="Helvetica", fontSize=9.4, leading=13.4, textColor=colors.HexColor(INK), spaceAfter=5)
S = ParagraphStyle("S", parent=B, fontSize=8, leading=10.6, textColor=colors.HexColor(MUTE))
CELL = ParagraphStyle("CELL", parent=B, fontSize=8, leading=10.2, spaceAfter=0)
HEAD = ParagraphStyle("HEAD", parent=CELL, fontName="Helvetica-Bold", fontSize=7.8, textColor=colors.HexColor(MUTE))
CODE = ParagraphStyle("CODE", parent=B, fontName="Courier", fontSize=7.8, leading=10, leftIndent=18, spaceBefore=2, spaceAfter=6, textColor=colors.HexColor(INK))
NOTE = ParagraphStyle("NOTE", parent=B, fontSize=9, leading=12.6, backColor=colors.HexColor("#eef4fe"), borderColor=colors.HexColor(BLUE),
                      borderWidth=0.6, borderPadding=7, spaceBefore=8, spaceAfter=14)
P_ = lambda x, st=B: Paragraph(x, st)

# --- text cleaning: WinAnsi-safe, then markdown inline -> reportlab mini-markup ------------------------------------
ASCII_MAP = {"−": "-", "→": "->", "≥": ">=", "≤": "<=", "Δ": "Change in "}
def safe(t):
    for k, v in ASCII_MAP.items(): t = t.replace(k, v)
    return t
def inline(t):
    t = safe(t).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    t = re.sub(r"`([^`]+)`", lambda m: '<font name="Courier" size="7.8">' + m.group(1).replace("*", "&#42;").replace("_", "&#95;") + "</font>", t)
    t = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)
    t = re.sub(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])", r"<i>\1</i>", t)
    return t
plain = lambda t: re.sub(r"[*`]", "", safe(t)).strip()

# --- tables: v5 look (muted bold header, hairline rules); status/severity columns coloured ---------------------------
STATUS = [("Critical", RED), ("Not supported", RED), ("High", RED), ("Defects", RED), ("Suspended", AMBER), ("Medium", AMBER),
          ("Measuring", AMBER), ("mixed", AMBER), ("Improving", GREEN), ("Fixed", GREEN), ("Validated", GREEN), ("Low", MUTE)]
def tbl(rows, widths=None):
    ncol = len(rows[0])
    rows = [r + [""] * (ncol - len(r)) for r in rows]
    if widths is None:  # floor = longest unbreakable word (capped), remainder shared by content length
        word = lambda v: max((len(w) for w in plain(v).split()), default=1)
        floor = [min(max(max(word(r[c]) for r in rows) * 0.058 + 0.12, 0.42), 1.3) for c in range(ncol)]
        ln = [max(min(len(plain(r[c])), 60) for r in rows) + 2 for c in range(ncol)]
        if sum(floor) > PAGE_W * 0.8: floor = [f * PAGE_W * 0.8 / sum(floor) for f in floor]
        extra = PAGE_W - sum(floor)
        widths = [f + extra * x / sum(ln) for f, x in zip(floor, ln)]
    cc = {i for i, h in enumerate(rows[0]) if plain(h).lower() in ("status", "severity", "decision", "result")}
    data = [[P_(inline(c), HEAD) for c in rows[0]]]
    for r in rows[1:]:
        line = []
        for c, v in enumerate(r):
            col = next((k for w, k in STATUS if plain(v).startswith(w)), None) if c in cc else None
            line.append(P_(f'<font color="{col}"><b>{inline(v.replace("**", ""))}</b></font>', CELL) if col else P_(inline(v), CELL))
        data.append(line)
    t = Table(data, colWidths=[x * inch for x in widths], repeatRows=1)
    t.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, 0), 0.6, colors.HexColor(MUTE)), ("LINEBELOW", (0, 1), (-1, -1), 0.3, colors.HexColor(RULE)),
                           ("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                           ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4)]))
    return t

# --- a small markdown renderer (headings, paragraphs, nested bullets/numbers, tables, fenced code) ------------------
def depth_of(spaces):
    return 0 if spaces < 2 else 1 if spaces <= 3 else 2 if spaces <= 6 else 3
def md_flow(text, heading_prefix=""):
    out, lines, i, para = [], text.split("\n"), 0, []
    def flush():
        if para: out.append(P_(inline(" ".join(para)))); para.clear()
    while i < len(lines):
        raw = lines[i]; ln = raw.strip()
        if ln.startswith("```"):
            flush(); j = i + 1; code = []
            while j < len(lines) and not lines[j].strip().startswith("```"): code.append(safe(lines[j].strip())); j += 1
            out.append(Preformatted("\n".join(code), CODE)); i = j + 1; continue
        if ln.startswith("|"):
            flush(); rows = []; indent = len(raw) - len(raw.lstrip())
            while i < len(lines) and lines[i].strip().startswith("|"):
                cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                if not all(re.fullmatch(r":?-{2,}:?", c) for c in cells): rows.append(cells)
                i += 1
            if indent:  # a small table nested under a bullet: narrow and indented
                t = tbl(rows, [1.6] + [1.0] * (len(rows[0]) - 1)); t.hAlign = "LEFT"
                wrap = Table([["", t]], colWidths=[0.35 * inch, None]); wrap.hAlign = "LEFT"
                wrap.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0)])); out.append(wrap)
            else:
                out.append(tbl(rows))
            out.append(Spacer(1, 7)); continue
        if not ln: flush(); i += 1; continue
        if ln.startswith("# "): flush(); i += 1; continue  # document title is drawn in the header block
        if ln.startswith("## "): flush(); out.append(P_(heading_prefix + inline(ln[3:]), H1)); i += 1; continue
        if ln.startswith("### "): flush(); out.append(P_(inline(ln[4:]), H2)); i += 1; continue
        if ln == "---": flush(); out.append(Spacer(1, 6)); i += 1; continue
        m = re.match(r"^(\s*)([-*]|\d+\.)\s+(.*)$", raw)
        if m:
            flush(); d = depth_of(len(m.group(1))); body = [m.group(3)]; j = i + 1
            while j < len(lines) and lines[j].strip() and lines[j].startswith(" ") and not re.match(r"^\s*([-*]|\d+\.)\s+", lines[j]) \
                    and not lines[j].strip().startswith(("|", "```")):
                body.append(lines[j].strip()); j += 1
            bullet = m.group(2) if m.group(2)[0].isdigit() else ("•" if d == 0 else "–")
            st = ParagraphStyle(f"L{d}", parent=B, leftIndent=15 + 15 * d, bulletIndent=3 + 15 * d, spaceAfter=2.5)
            out.append(Paragraph(inline(" ".join(body)), st, bulletText=bullet)); i = j; continue
        if raw.startswith(" ") and out and not para:  # indented paragraph continuing a list item
            st = ParagraphStyle("LC", parent=B, leftIndent=15 + 15 * depth_of(len(raw) - len(raw.lstrip())), spaceAfter=3)
            para_lines = [ln]; j = i + 1
            while j < len(lines) and lines[j].strip() and not re.match(r"^\s*([-*]|\d+\.)\s+", lines[j]): para_lines.append(lines[j].strip()); j += 1
            out.append(P_(inline(" ".join(para_lines)), st)); i = j; continue
        para.append(ln); i += 1
    flush(); return out

def footer(c, doc):
    c.saveState(); c.setFont("Helvetica", 7.3); c.setFillColor(colors.HexColor(MUTE))
    c.drawImage(LOGO, 0.75 * inch, 0.42 * inch, 12, 12, mask="auto")
    c.drawString(0.75 * inch + 16, 0.5 * inch, "Quant Edge Labs · Report v6 · SR 11-7 model validation · not investment advice")
    c.drawRightString(7.75 * inch, 0.5 * inch, f"Page {doc.page}"); c.restoreState()

s = []
hdr = Table([[Image(LOGO, width=0.55 * inch, height=0.55 * inch), [P_("Quant Edge Labs", S), P_("Report v6 — SR 11-7 model validation: where the losses are, and what the record can prove", ParagraphStyle("T", parent=H1, fontSize=18, leading=22, spaceBefore=0))]]], colWidths=[0.7 * inch, 6.1 * inch])
hdr.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
s += [hdr, Spacer(1, 4)]
s.append(P_(f"SR 11-7 asks whether each model does what it claims, on independent evidence. This review covers every model that publishes, ranks or trades an idea, on the clean-era record (ideas published from 2026-08-26). Prepared {datetime.date(2026, 9, 30):%B %d, %Y}, after the close; post-report updates from the same evening are in section 10.", B))
s.append(P_("<b>Read this first.</b> Section 10 supersedes parts of the body. <b>F-0 (journal regression) is fixed</b>: 18:28 ET, 470 rows load. "
            "The memory restarts in F-16 have not recurred since the 18:11 ET deploy. Loss Rules v1.1 and the 0DTE sniper (watch mode) went live "
            "this evening and are <b>measuring</b>. <b>F-11 (the evidence score does not rank outcomes) is raised to High</b>.", NOTE))

s += md_flow(open(MAIN, encoding="utf-8").read())

# --- 10. Post-report updates -------------------------------------------------------------------------------------------
s.append(PageBreak())
s.append(P_("10. Post-report updates (2026-09-30 evening)", H1))
s.append(P_("Changes and results after sections 1-9 were written. The deploys and replays below were done by the operator; figures are as reported and were not re-run for this report. Status labels follow the same rules as the body.", B))
s.append(tbl([
    ["#", "Update", "Evidence", "Status", "Register"],
    ["1", "**Journal regression fixed.** The 18:11 ET deploy broke the NEXUS journal book for about 17 minutes (regex escaping in a `sql` template; section 5.7).",
     "Fixed at 18:28 ET. Verified that the desk book loads all 470 rows.", "Fixed", "F-0 closed. The `loadDesk`-against-Postgres test in its remediation remains the guard against a repeat."],
    ["2", "**Loss Rules v1.1 deployed 18:54 ET.** Flow-led bot picks are exempt from the confluence rule and may enter until 15:00 ET.",
     "The bot's own fills: single-source picks n=23, PF 1.67, +$4,235, against picks the rule kept n=17, PF 0.51, -$4,132.", "Measuring",
     "M3 / M9. Fitted on the same fills it is judged on, and n is small; it needs out-of-sample fills before it counts. Compare F-12."],
    ["3", "**Memory.** CBOE loader, 60-second GEX cache, convictions base boards, GC after heavy jobs, jemalloc decay, staggered worker boot.",
     "No memory restarts observed after the 18:11 ET deploy (worker 176-450 MB), against about 40 restarts earlier in the day.", "Improving",
     "F-16 stays open until a full regular session runs with 0 restarts."],
    ["4", "**0DTE classic-setup replay** (last 12 months, SPY and single names, real option bars).",
     "Only 'failed squeeze short, buy the nearest put, hold to close' survived both halves: +0.23 and +0.20 per $1 (marginal). Lottos expire worthless 93-97% of the time.",
     "Measuring", "M4. Sniper enabled in watch mode in the 18:50s ET, publishing only that setup (at most 8 per day). Live grading still depends on F-3 (expiry-date parse)."],
    ["5", "**Weekly bull-flag calls, replayed on real option prices.**",
     "Median +13.5% but average -3.8%; fails walk-forward.", "Not supported", "Confirms section 6: not an options strategy."],
    ["6", "**The evidence score does not rank outcomes.**",
     "S is the worst band per trade (-$388.81, n=6); B beats A (+$17.53 vs +$13.58). Section 2 (M2) and Appendix A.1.", "High",
     "F-11 severity raised from Medium to **High**. Stop showing the band as a quality signal until it is recalibrated with a halves split."],
], [0.25, 1.85, 1.95, 0.8, 2.15]))
s.append(Spacer(1, 8))
s.append(P_("Register after these updates: F-0 closed; F-11 High; F-16 improving but open; F-3 still blocks every 0DTE result, including the sniper's. All other findings are unchanged.", S))

# --- Appendix A: loss attribution --------------------------------------------------------------------------------------
s.append(PageBreak())
s.append(P_("Appendix A — Loss attribution, 2026-08-26 to 2026-09-30", H0))
s.append(P_("The companion write-up (docs/LOSS_ATTRIBUTION_2026-09-30.md), reproduced in full. Section numbers below are the appendix's own; findings F-n refer to section 7 of the report.", S))
s += md_flow(open(LOSS, encoding="utf-8").read(), heading_prefix="A. ")

SimpleDocTemplate(OUT, pagesize=letter, leftMargin=0.75 * inch, rightMargin=0.75 * inch, topMargin=0.7 * inch, bottomMargin=0.8 * inch,
                  title="Quant Edge Labs Report v6", author="Quant Edge Labs").build(s, onFirstPage=footer, onLaterPages=footer)
print(OUT)
