"""Preview the static site locally with the same friendly routes used on Vercel.

Run from any directory: python3 scripts/preview.py
Then open http://localhost:8000
"""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
import os

ROOT = Path(__file__).resolve().parents[1]
ROUTES = {
    "/work": "/portfolio.html",
    "/experience": "/services.html",
    "/notes": "/blog.html",
    "/about": "/about.html",
    "/contact": "/contact.html",
    "/portfolio": "/portfolio.html",
    "/index": "/index.html",
}

class SiteHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        parsed = urlsplit(self.path)
        target = ROUTES.get(parsed.path)
        if target:
            self.path = target + (("?" + parsed.query) if parsed.query else "")
        super().do_GET()


def serve(port=8000):
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
