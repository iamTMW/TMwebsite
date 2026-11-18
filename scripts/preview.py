"""Preview the built site (dist/) with Vercel-like routing.

Run: npm run build && python3 scripts/preview.py      (or: npm run preview)
Then open http://127.0.0.1:8000

Mimics the parts of vercel.json that matter locally: clean URLs (/work -> work.html),
the redirects, and 404.html for unknown paths. /api/* is not served here; the visit
endpoint has its own mocked tests (npm test).
"""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
import json
import os

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
REDIRECTS = {r["source"]: r["destination"]
             for r in json.loads((ROOT / "vercel.json").read_text())["redirects"]}


class SiteHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIST), **kwargs)

    def log_message(self, fmt, *args):
        if os.environ.get("PREVIEW_QUIET") != "1":
            super().log_message(fmt, *args)

    def _route(self):
        parsed = urlsplit(self.path)
        path = parsed.path.rstrip("/") or "/"
        if path in REDIRECTS:
            self.send_response(307)
            self.send_header("Location", REDIRECTS[path])
            self.end_headers()
            return None
        if path == "/":
            return "/index.html"
        candidate = DIST / path.lstrip("/")
        if candidate.is_file():
            return path
        if (DIST / (path.lstrip("/") + ".html")).is_file():
            return path + ".html"
        return "__404__"

    def do_GET(self):
        target = self._route()
        if target is None:
            return
        if target == "__404__":
            body = (DIST / "404.html").read_bytes()
            self.send_response(404)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.path = target
        super().do_GET()

    def do_HEAD(self):
        self.do_GET()


def serve(port=8000):
    if not (DIST / "index.html").is_file():
        raise SystemExit("dist/ is missing. Run `npm run build` first.")
    server = ThreadingHTTPServer(("127.0.0.1", port), SiteHandler)
    print(f"Portfolio preview: http://127.0.0.1:{port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    serve(int(os.environ.get("PORT", "8000")))
