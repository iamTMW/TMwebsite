"""Rendered-layout audit for the built site (dist/).

Loads every public route at 320, 375, 430, 768, 1024, 1440 and 1920 px in light and dark
themes and checks what the browser actually rendered:

  - squeezed text: any text run of 30+ characters averaging fewer than 14 characters per
    rendered line, for body-size text under 24px (catches the "one word per line" grid bug)
  - OpsRelay contribution bullets: label and description share a line, and the bullet text
    uses at least 70% of the list item width
  - horizontal page overflow, and text clipped by an overflow:hidden ancestor
  - elements wider than the viewport
  - SVG diagram text rendered smaller than 10.5 px
  - broken images and console errors

Run:  npm run build && python3 scripts/layout_audit.py [--shots DIR]
With --shots, saves a full-page screenshot for every route, width and theme.
"""
import argparse
import os
import sys
from http.server import ThreadingHTTPServer
from pathlib import Path
from threading import Thread

sys.path.insert(0, str(Path(__file__).resolve().parent))
os.environ.setdefault("PREVIEW_QUIET", "1")
from playwright.sync_api import sync_playwright  # noqa: E402
from preview import SiteHandler  # noqa: E402

ROUTES = ["/", "/work", "/work/opsrelay", "/experience", "/about", "/contact", "/notes",
          "/chatbot", "/grademan", "/privacy", "/does-not-exist"]
WIDTHS = [320, 375, 430, 768, 1024, 1440, 1920]

AUDIT_JS = r"""
() => {
  const issues = [];
  const vw = document.documentElement.clientWidth;
  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || el.closest('.sr-only,.hp,[hidden],[aria-hidden="true"]')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const label = (el) => (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '')).slice(0, 80);

  // 1. squeezed text runs
  const walker = document.createTreeWalker(document.querySelector('main'), NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const text = node.textContent.replace(/\s+/g, ' ').trim();
    if (text.length < 30 || !node.parentElement || !visible(node.parentElement)) continue;
    if (parseFloat(getComputedStyle(node.parentElement).fontSize) >= 24) continue;   // display type
    const range = document.createRange(); range.selectNodeContents(node);
    const tops = new Set([...range.getClientRects()].filter(r => r.width > 1).map(r => Math.round(r.top)));
    const lines = Math.max(tops.size, 1);
    if (text.length / lines < 14) issues.push(`squeezed text (${Math.round(text.length / lines)} chars/line) in ${label(node.parentElement)}: "${text.slice(0, 40)}"`);
  }

  // 2. OpsRelay contribution bullets: label + description must flow together
  document.querySelectorAll('.points li').forEach((li) => {
    if (!visible(li)) return;
    const b = li.querySelector('b,strong');
    const range = document.createRange(); range.selectNodeContents(li);
    const rects = [...range.getClientRects()].filter(r => r.width > 1);
    const used = Math.max(...rects.map(r => r.right)) - Math.min(...rects.map(r => r.left));
    const avail = li.getBoundingClientRect().width - parseFloat(getComputedStyle(li).paddingLeft);
    if (li.textContent.trim().length > 60 && used < avail * 0.7) issues.push(`bullet text uses ${Math.round(used)}/${Math.round(avail)}px in ${label(li)}`);
    if (b && b.nextSibling && b.nextSibling.nodeType === 3 && b.nextSibling.textContent.trim()) {
      const r2 = document.createRange(); r2.selectNodeContents(b.nextSibling);
      const first = [...r2.getClientRects()].find(r => r.width > 1);
      const bLines = [...b.getClientRects()]; const bLast = bLines[bLines.length - 1];
      if (first && bLast && Math.abs(first.top - bLast.top) > 4) issues.push(`bullet label and description split onto separate lines: "${b.textContent}"`);
    }
  });

  // 3. elements wider than the viewport, and clipped text
  document.querySelectorAll('main *, header *, footer *').forEach((el) => {
    if (!visible(el)) return;
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 && !el.closest('.cs-figure,.tabbar,.sheet')) issues.push(`overflows viewport by ${Math.round(r.right - vw)}px: ${label(el)}`);
    const s = getComputedStyle(el);
    if ((s.overflowX === 'hidden' || s.overflowX === 'clip') && el.scrollWidth > el.clientWidth + 2 && el.textContent.trim().length > 0 && !el.matches('.media,.media *,.portrait,figure,.browser,.phones'))
      issues.push(`text clipped horizontally in ${label(el)}`);
  });

  // 4. diagram readability
  document.querySelectorAll('svg.pipeline').forEach((svg) => {
    if (!visible(svg)) return;
    svg.querySelectorAll('text').forEach((t) => {
      const h = t.getBoundingClientRect().height;
      if (h > 0 && h < 10.5) issues.push(`diagram text too small (${h.toFixed(1)}px): "${t.textContent}"`);
    });
  });

  // 5. page-level overflow and broken images
  const over = document.documentElement.scrollWidth - window.innerWidth;
  if (over > 1) issues.push(`page scrolls horizontally by ${over}px`);
  document.querySelectorAll('img').forEach((img) => { if (img.getAttribute('src') && img.complete && img.naturalWidth === 0) issues.push(`broken image ${img.getAttribute('src')}`); });
  return [...new Set(issues)];
}
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--shots", help="directory to save full-page screenshots")
    ap.add_argument("--widths", default=",".join(map(str, WIDTHS)))
    args = ap.parse_args()
    widths = [int(w) for w in args.widths.split(",")]
    if args.shots:
        Path(args.shots).mkdir(parents=True, exist_ok=True)

    server = ThreadingHTTPServer(("127.0.0.1", 0), SiteHandler)
    Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_port}"
    failures, checked = [], 0
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            for scheme in ("dark", "light"):
                for w in widths:
                    ctx = browser.new_context(viewport={"width": w, "height": 900}, color_scheme=scheme, reduced_motion="reduce")
                    page = ctx.new_page()
                    errors = []
                    page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "404" not in m.text else None)
                    page.on("pageerror", lambda e: errors.append(str(e)))
                    for route in ROUTES:
                        page.goto(base + route, wait_until="networkidle")
                        page.evaluate("async () => { for (let y = 0; y < document.body.scrollHeight; y += 400) { scrollTo(0, y); await new Promise(r => setTimeout(r, 20)); } scrollTo(0, 0); }")
                        page.wait_for_load_state("networkidle")
                        for issue in page.evaluate(AUDIT_JS):
                            failures.append(f"[{scheme} {w}px {route}] {issue}")
                        if args.shots:
                            name = (route.strip("/") or "home").replace("/", "_")
                            page.screenshot(path=f"{args.shots}/{scheme}-{w}-{name}.png", full_page=True)
                        checked += 1
                    for e in errors:
                        failures.append(f"[{scheme} {w}px] console error: {e}")
                    ctx.close()
            browser.close()
    finally:
        server.shutdown()
        server.server_close()

    print(f"Audited {checked} page renders ({len(ROUTES)} routes x {len(widths)} widths x 2 themes)")
    for f in failures:
        print("FAIL:", f)
    if failures:
        return 1
    print("PASS: no squeezed text, overflow, clipping, unreadable diagram text, broken images or console errors")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
