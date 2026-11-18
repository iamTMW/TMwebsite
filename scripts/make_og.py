"""Render the 1200x630 social preview cards into images/og/.

Requires Playwright with Chromium: python3 -m pip install playwright && python3 -m playwright install chromium
Run: python3 scripts/make_og.py
"""
from pathlib import Path
import tempfile
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
FONTS = (ROOT / "fonts").as_uri()

CARDS = {
    "og-default": ("Taha Mohyuddin",
                   "Software engineering, applied AI and operations.",
                   "Computer Science, University of Guelph (2027) · Assistant Department Manager, Loblaw"),
    "og-opsrelay": ("OpsRelay",
                    "AI-assisted incident response, with a human in charge of every fix.",
                    "Case study · Next.js · FastAPI · Python agents · MongoDB Atlas"),
}

TEMPLATE = """<!doctype html><html><head><style>
@font-face{{font-family:F;src:url({fonts}/fraunces-latin.woff2)}}
@font-face{{font-family:FI;font-style:italic;src:url({fonts}/fraunces-italic-latin.woff2)}}
@font-face{{font-family:I;src:url({fonts}/inter-tight-latin.woff2)}}
html,body{{margin:0;width:1200px;height:630px}}
body{{background:#12100E;color:#F3EEE5;font-family:I;position:relative;overflow:hidden}}
body:before{{content:"";position:absolute;inset:0;background:radial-gradient(800px 500px at 0% 0%,rgba(237,168,58,.16),transparent 60%)}}
.w{{position:absolute;inset:72px 80px;display:flex;flex-direction:column}}
.m{{width:56px;height:56px;border:1.5px solid rgba(237,168,58,.6);border-radius:50%;display:grid;place-items:center;color:#EDA83A;font-family:F;font-size:20px}}
h1{{font-family:F;font-weight:400;font-size:96px;line-height:1;margin:auto 0 0;letter-spacing:-2px}}
p{{font-family:FI;font-size:40px;line-height:1.2;color:#EDA83A;margin:22px 0 0;max-width:24ch}}
small{{display:block;margin-top:34px;font-size:22px;color:#A0968A}}
</style></head><body><div class="w"><div class="m">TM</div><h1>{title}</h1><p>{line}</p><small>{meta}</small></div></body></html>"""

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1200, "height": 630})
    for name, (title, line, meta) in CARDS.items():
        with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False) as tmp:
            tmp.write(TEMPLATE.format(fonts=FONTS, title=title, line=line, meta=meta))
        page.goto(Path(tmp.name).as_uri())
        page.evaluate("document.fonts.ready")
        page.wait_for_timeout(200)
        Path(tmp.name).unlink()
        page.screenshot(path=str(ROOT / "images" / "og" / f"{name}.png"))
        print("wrote", name)
    browser.close()
