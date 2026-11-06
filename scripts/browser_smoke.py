"""Desktop and mobile browser smoke tests for the original portfolio.

Requires: pip install playwright
          python -m playwright install --with-deps chromium
Run: python scripts/browser_smoke.py
"""
import os
from pathlib import Path
from threading import Thread

from playwright.sync_api import sync_playwright
from preview import SiteHandler
from http.server import ThreadingHTTPServer

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "test-screenshots"
ROUTES = ("/", "/work", "/about", "/experience", "/notes",
          "/contact", "/chatbot.html", "/grademan.html", "/test.html")


def check(condition, reason):
    if not condition:
        raise AssertionError(reason)


def main():
    server = ThreadingHTTPServer(("127.0.0.1", 0), SiteHandler)
    Thread(target=server.serve_forever, daemon=True).start()
    base = "http://127.0.0.1:" + str(server.server_port)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    checked = 0
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            for label, width, height in (("desktop", 1366, 900), ("mobile", 390, 844)):
                context = browser.new_context(viewport={"width": width, "height": height}, device_scale_factor=1)
                page = context.new_page()
                errors = []
                page.on("pageerror", lambda exc: errors.append(str(exc)))
                for route in ROUTES:
                    response = page.goto(base + route, wait_until="load", timeout=35000)
                    check(response is not None and response.status < 400, f"{label} {route}: HTTP failure")
                    check(page.locator("main").count() == 1, f"{label} {route}: main content missing")
                    overflow = page.evaluate("document.documentElement.scrollWidth - window.innerWidth")
                    if overflow > 5:
                        offenders = page.evaluate("""() => Array.from(document.querySelectorAll('*'))
                            .map(e => ({el:e.tagName.toLowerCase(), cls:String(e.className).slice(0,90),
                                left:Math.round(e.getBoundingClientRect().left),
                                right:Math.round(e.getBoundingClientRect().right)}))
                            .filter(x => x.right > innerWidth + 5 || x.left < -5)
                            .slice(0,16)""")
                        raise AssertionError(f"{label} {route}: {overflow}px horizontal overflow; elements={offenders}")
                    broken = page.locator("img").evaluate_all(
                        "(imgs) => imgs.filter(i => i.complete && i.naturalWidth === 0)"
                        ".map(i => i.getAttribute('src'))")
                    check(not broken, f"{label} {route}: broken images {broken}")
                    checked += 1

                page.goto(base + "/", wait_until="load")
                page.screenshot(path=str(OUTPUT / (label + "-home.png")), full_page=True, animations="disabled")

                page.goto(base + "/about", wait_until="load")
                page.locator("#tab-experience").click()
                check(page.locator("#panel-experience").is_visible(), f"{label}: Experience tab does not open")
                page.locator("#tab-cricket").click()
                check(page.locator("#panel-cricket").is_visible(), f"{label}: Cricket tab does not open")

                page.goto(base + "/experience", wait_until="load")
                if page.locator(".co").count():
                    page.locator(".co").first.click()
                    check("flipped" in (page.locator(".co").first.get_attribute("class") or ""),
                          f"{label}: Experience card did not flip")

                page.goto(base + "/contact", wait_until="load")
                page.route("https://formsubmit.co/ajax/**",
                           lambda route: route.fulfill(status=200, content_type="application/json",
                                                       body='{"success":true}'))
                page.locator("#name").fill("Portfolio Test")
                page.locator("#email").fill("test@example.com")
                page.locator("#message").fill("Automated test, not sent externally")
                page.locator('button[type="submit"]').click()
                page.locator("#toast.show").wait_for(timeout=7000)
                check("Message sent" in page.locator("#toast").inner_text(),
                      f"{label}: contact form success feedback missing")

                if label == "mobile":
                    page.goto(base + "/", wait_until="load")
                    page.locator("[data-sheet-open]").click()
                    check(page.locator("#sheet").evaluate("(el) => el.classList.contains('open')"),
                          "Mobile menu did not open")
                    page.locator("[data-sheet-close]").click()
                    check(not page.locator("#sheet").evaluate("(el) => el.classList.contains('open')"),
                          "Mobile menu did not close")

                check(not errors, f"{label}: JavaScript errors {errors[:5]}")
                context.close()

            nojs = browser.new_context(java_script_enabled=False, viewport={"width": 1200, "height": 800})
            page = nojs.new_page()
            page.goto(base + "/", wait_until="load")
            opacity = page.locator(".rv").first.evaluate("(el) => getComputedStyle(el).opacity")
            check(float(opacity) >= 0.95, "Content invisible with JavaScript disabled")
            nojs.close()
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
    print(f"PASS: {checked} desktop/mobile page loads, image checks, layout checks, tabs, cards, mobile menu and mocked contact form")


if __name__ == "__main__":
    main()
