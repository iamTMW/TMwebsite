"""Desktop and mobile browser tests for the built site (dist/).

Requires: python3 -m pip install 'playwright>=1.55,<2' && python3 -m playwright install chromium
Run:      npm run build && python3 scripts/browser_smoke.py
Remote:   SMOKE_BASE_URL=https://<preview>.vercel.app VERCEL_AUTOMATION_BYPASS_SECRET=... python3 scripts/browser_smoke.py
          (tests a deployed preview through Vercel Deployment Protection; real response headers are checked)

Production response headers (including the Content-Security-Policy) from vercel.json are
applied to every local response, so CSP violations fail the run. External form and email
services are always mocked: nothing is sent.
"""
import json
import re
from http.server import ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import os
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
os.environ.setdefault("PREVIEW_QUIET", "1")
from playwright.sync_api import sync_playwright  # noqa: E402
from preview import SiteHandler  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "test-screenshots"
ROUTES = ["/", "/work", "/work/opsrelay", "/about", "/experience", "/notes", "/contact",
          "/chatbot", "/grademan", "/privacy"]
VERCEL = json.loads((ROOT / "vercel.json").read_text())
PROD_HEADERS = {h["key"]: h["value"] for h in VERCEL["headers"][0]["headers"]}
PROD_HEADERS.pop("Strict-Transport-Security", None)
# The local server is plain http, so drop the https upgrade directive for the test only.
PROD_HEADERS["Content-Security-Policy"] = PROD_HEADERS["Content-Security-Policy"].replace("; upgrade-insecure-requests", "")


def check(cond, msg):
    if not cond:
        raise AssertionError(msg)


REMOTE = os.environ.get("SMOKE_BASE_URL", "").rstrip("/")
BYPASS = os.environ.get("VERCEL_AUTOMATION_BYPASS_SECRET", "")


def new_context(browser, **kw):
    if REMOTE and BYPASS:
        kw["extra_http_headers"] = {"x-vercel-protection-bypass": BYPASS, "x-vercel-set-bypass-cookie": "true"}
    return browser.new_context(**kw)


def with_prod_headers(context, base):
    # Safety net: only the site under test is reachable. Specific mocks (page.route) take precedence.
    allowed = re.escape(base)
    context.route(re.compile(rf"^(?!{allowed})"), lambda route: route.abort())
    if REMOTE:
        return   # real deployment: its own headers are under test

    def handler(route):
        if not route.request.url.startswith(base):
            return route.continue_()
        resp = route.fetch(max_redirects=0)
        headers = {**resp.headers, **PROD_HEADERS}
        route.fulfill(response=resp, headers=headers)
    context.route(base + "/**", handler)


def scroll_through(page):
    page.evaluate("""async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 40)); }
        window.scrollTo(0, 0);
    }""")
    page.wait_for_load_state("networkidle")


def main():
    server = None
    if REMOTE:
        base = REMOTE
    else:
        server = ThreadingHTTPServer(("127.0.0.1", 0), SiteHandler)
        Thread(target=server.serve_forever, daemon=True).start()
        base = f"http://127.0.0.1:{server.server_port}"
    OUT.mkdir(exist_ok=True)
    passed = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()

            for label, w, h in (("desktop", 1366, 900), ("tablet", 820, 1180), ("mobile", 390, 844)):
                ctx = new_context(browser, viewport={"width": w, "height": h})
                with_prod_headers(ctx, base)
                page = ctx.new_page()
                problems = []
                page.on("pageerror", lambda e: problems.append(f"pageerror {e}"))
                page.on("console", lambda m: problems.append(f"console {m.text}") if m.type == "error" else None)
                for route in ROUTES:
                    r = page.goto(base + route, wait_until="load")
                    check(r and r.status == 200, f"{label} {route}: HTTP {r and r.status}")
                    scroll_through(page)
                    overflow = page.evaluate("document.documentElement.scrollWidth - window.innerWidth")
                    check(overflow <= 1, f"{label} {route}: {overflow}px horizontal overflow")
                    broken = page.eval_on_selector_all(
                        "img", "els => els.filter(i => i.complete && i.naturalWidth === 0).map(i => i.src)")
                    check(not broken, f"{label} {route}: broken images {broken}")
                    unlabeled = page.evaluate("""() => [...document.querySelectorAll('input,select,textarea')]
                        .filter(el => el.type !== 'hidden' && !el.closest('[aria-hidden=true]'))
                        .filter(el => !(el.labels && el.labels.length) && !el.getAttribute('aria-label')).map(el => el.name)""")
                    check(not unlabeled, f"{label} {route}: unlabeled fields {unlabeled}")
                    check(page.locator("h1").count() == 1, f"{label} {route}: expected one h1")
                check(not problems, f"{label}: console/page errors {problems[:5]}")
                passed.append(f"{label}: {len(ROUTES)} pages load, no overflow, images OK, CSP clean")

                for scheme in ("dark", "light"):
                    page.emulate_media(color_scheme=scheme)
                    page.goto(base + "/", wait_until="networkidle")
                    scroll_through(page)
                    page.screenshot(path=str(OUT / f"{label}-home-{scheme}.png"), full_page=True)
                page.emulate_media(color_scheme="dark")

                if label == "mobile":
                    page.goto(base + "/", wait_until="load")
                    opener = page.locator("[data-sheet-open]")
                    opener.click()
                    check(page.locator("#sheet.open").count() == 1, "mobile menu did not open")
                    check(page.evaluate("document.activeElement.closest('#sheet') !== null"), "focus not moved into menu")
                    page.keyboard.press("Escape")
                    check(page.locator("#sheet.open").count() == 0, "Escape did not close menu")
                    check(page.evaluate("document.activeElement.hasAttribute('data-sheet-open')"), "focus not returned to opener")
                    passed.append("mobile menu: open, focus, Escape, focus return")
                ctx.close()

            # ---- behaviour checks (desktop) ----
            ctx = new_context(browser, viewport={"width": 1280, "height": 900}, color_scheme="dark")
            with_prod_headers(ctx, base)
            page = ctx.new_page()

            # Redirects and 404
            for src, dest in (("/portfolio", "/work"), ("/blog", "/notes"), ("/services", "/experience"), ("/opsrelay", "/work/opsrelay")):
                page.goto(base + src, wait_until="load")
                check(page.url.endswith(dest), f"redirect {src} -> {page.url}")
            r = page.goto(base + "/does-not-exist", wait_until="load")
            check(r.status == 404 and "isn" in page.locator("h1").inner_text(), "custom 404 not served")
            r = page.request.get(base + "/resume", max_redirects=5)
            check(r.ok and r.headers.get("content-type", "").startswith("application/pdf"), "/resume does not serve a PDF")
            passed.append("redirects, /resume PDF and custom 404")

            if REMOTE:
                r = page.request.get(base + "/")
                hdr = r.headers
                for key in ("content-security-policy", "x-frame-options", "x-content-type-options",
                            "referrer-policy", "strict-transport-security", "permissions-policy"):
                    check(key in hdr, f"missing response header {key}")
                check("script-src 'self'" in hdr["content-security-policy"], "CSP script-src not strict")
                r = page.request.post(base + "/api/visit", data='{"sid":"' + "0" * 32 + '","path":"/"}',
                                      headers={"content-type": "application/json", "origin": base})
                check(r.status in (204, 403), f"/api/visit unexpected status {r.status}")
                check(r.headers.get("cache-control", "").startswith("no-store"), "/api/visit not no-store")
                r = page.request.get(base + "/api/visit")
                check(r.status == 405, f"GET /api/visit should be 405, got {r.status}")
                passed.append("remote: security headers present, /api/visit deployed (POST quiet, GET 405)")

            # Theme toggle persists
            page.goto(base + "/", wait_until="load")
            page.locator(".topbar [data-theme-toggle]").click()
            check(page.evaluate("document.documentElement.dataset.theme") == "light", "theme toggle failed")
            page.reload(wait_until="load")
            check(page.evaluate("document.documentElement.dataset.theme") == "light", "theme not persisted")
            bg = page.evaluate("getComputedStyle(document.body).backgroundColor")
            check(bg == "rgb(250, 247, 242)", f"light background not applied: {bg}")
            page.evaluate("localStorage.removeItem('theme')")
            passed.append("theme toggle and persistence")

            # About tabs: keyboard
            page.goto(base + "/about", wait_until="load")
            page.locator("#tab-path").focus()
            page.keyboard.press("ArrowRight")
            check(page.locator("#panel-education").is_visible(), "ArrowRight did not open Education tab")
            page.keyboard.press("End")
            check(page.locator("#panel-cricket").is_visible(), "End did not open last tab")
            passed.append("about tabs: keyboard navigation")

            # Contact form: validation, success, failure, honeypot (FormSubmit always mocked)
            calls = []
            CORS = {"access-control-allow-origin": "*"}
            mode = {"status": 200}
            def fake_formsubmit(route):
                calls.append(route.request.post_data_json)
                if mode["status"] == 200:
                    route.fulfill(status=200, content_type="application/json", body='{"success":"true"}', headers=CORS)
                else:
                    route.fulfill(status=500, content_type="application/json", body='{"success":"false"}', headers=CORS)
            reqlog = []
            page.on("request", lambda r: reqlog.append((r.method, r.url[:60])) if "127.0.0.1" not in r.url else None)
            page.on("requestfailed", lambda r: reqlog.append(("FAILED", r.url[:60], r.failure)))
            page.route("https://formsubmit.co/**", fake_formsubmit)
            page.goto(base + "/contact", wait_until="load")
            page.locator('#contact-form button[type="submit"]').click()
            check(page.locator("#name[aria-invalid=true]").count() == 1, "empty name not flagged")
            check(len(calls) == 0, "invalid form was submitted")
            page.fill("#name", "Portfolio Test")
            page.fill("#email", "test@example.com")
            page.fill("#message", "Automated test message, never sent anywhere.")
            page.locator('#contact-form button[type="submit"]').click()
            try:
                page.locator("#form-status.ok").wait_for(timeout=5000)
            except Exception:
                print("DEBUG button:", page.locator('#contact-form button[type="submit"]').inner_text(), "reqs:", reqlog)
                print("DEBUG status:", page.locator("#form-status").inner_text(), "calls:", calls,
                      page.evaluate("[...document.querySelectorAll('[aria-invalid=true]')].map(e => e.name)"))
                raise
            check(len(calls) == 1 and calls[0]["_honey"] == "", "valid submission not sent once")
            mode["status"] = 500
            page.fill("#name", "Portfolio Test")
            page.fill("#email", "test@example.com")
            page.fill("#message", "Second automated test message.")
            page.locator('#contact-form button[type="submit"]').click()
            page.locator("#form-status.err").wait_for(timeout=5000)
            check("email me directly" in page.locator("#form-status").inner_text(), "failure message missing")
            page.evaluate("document.getElementById('hp-field').value = 'spam'")
            page.fill("#name", "Bot"); page.fill("#email", "bot@example.com"); page.fill("#message", "buy cheap things now")
            before = len(calls)
            page.locator('#contact-form button[type="submit"]').click()
            page.wait_for_timeout(300)
            check(len(calls) == before, "honeypot submission was sent")
            passed.append("contact form: validation, mocked success, mocked failure, honeypot")
            ctx.close()

            # Visit beacon: once per session, mocked endpoint
            def beacon_context(gpc=False):
                c = new_context(browser, viewport={"width": 1280, "height": 900})
                c.add_init_script("""
                    Object.defineProperty(navigator, 'webdriver', { get: () => false });
                    window.__TM_VISIT_TEST__ = true;
                """ + ("Object.defineProperty(navigator, 'globalPrivacyControl', { get: () => true });" if gpc else ""))
                with_prod_headers(c, base)
                return c
            beacons = []
            def fake_visit(route):
                beacons.append(route.request.post_data_json)
                route.fulfill(status=204)
            c1 = beacon_context()
            c1.route(base + "/api/visit", fake_visit)
            pg = c1.new_page()
            pg.goto(base + "/work", wait_until="load", referer="https://www.linkedin.com/feed/")
            pg.wait_for_timeout(3200)
            pg.goto(base + "/about", wait_until="load")
            pg.wait_for_timeout(3200)
            check(len(beacons) == 1, f"expected 1 beacon per session, got {len(beacons)}")
            b = beacons[0]
            check(set(b) == {"sid", "path", "ref"} and len(b["sid"]) == 32, f"unexpected beacon shape {b}")
            check(b["path"] == "/work" and b["ref"] == "www.linkedin.com", f"beacon content {b}")
            c1.close()
            c2 = beacon_context()
            c2.route(base + "/api/visit", fake_visit)
            pg = c2.new_page(); pg.goto(base + "/", wait_until="load"); pg.wait_for_timeout(3200)
            check(len(beacons) == 2, "new session did not send a beacon")
            c2.close()
            c3 = beacon_context(gpc=True)
            c3.route(base + "/api/visit", fake_visit)
            pg = c3.new_page(); pg.goto(base + "/", wait_until="load"); pg.wait_for_timeout(3200)
            check(len(beacons) == 2, "beacon sent despite Global Privacy Control")
            c3.close()
            passed.append("visit beacon: one per session, minimal payload, GPC respected")

            # No JavaScript and reduced motion: content stays visible
            nojs = new_context(browser, java_script_enabled=False)
            pg = nojs.new_page(); pg.goto(base + "/", wait_until="load")
            check(float(pg.locator(".rv").first.evaluate("e => getComputedStyle(e).opacity")) > 0.95, "content hidden without JS")
            nojs.close()
            rm = new_context(browser, reduced_motion="reduce")
            pg = rm.new_page(); pg.goto(base + "/work", wait_until="load")
            check(float(pg.locator(".rv").first.evaluate("e => getComputedStyle(e).opacity")) > 0.95, "content hidden with reduced motion")
            rm.close()
            passed.append("no-JS and reduced-motion fallbacks")

            browser.close()
    finally:
        if server:
            server.shutdown()
            server.server_close()
    for line in passed:
        print("PASS:", line)


if __name__ == "__main__":
    main()
