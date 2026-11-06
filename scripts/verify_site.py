"""Verify local links, image paths, anchors, and basic HTML structure.

No third-party dependencies. Run: python3 scripts/verify_site.py
"""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
ROUTES = {
    "": "index.html", "work": "portfolio.html", "experience": "services.html",
    "notes": "blog.html", "about": "about.html", "contact": "contact.html",
    "portfolio": "portfolio.html", "index": "index.html",
}
VOID = {"area", "base", "br", "col", "embed", "hr", "img",
        "input", "link", "meta", "param", "source", "track", "wbr"}


class Inspect(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids = set()
        self.duplicate_ids = set()
        self.refs = []
        self.title_count = 0
        self.headings = 0
        self.main_count = 0
        self.main_close = 0
        self.image_count = 0
        self.missing_alt = 0
        self.description = False
        self.viewport = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        id_value = attrs.get("id")
        if id_value:
            if id_value in self.ids:
                self.duplicate_ids.add(id_value)
            self.ids.add(id_value)
        if tag == "title":
            self.title_count += 1
        if tag == "meta" and attrs.get("name", "").lower() == "description":
            self.description = bool(attrs.get("content", "").strip())
        if tag == "meta" and attrs.get("name", "").lower() == "viewport":
            self.viewport = True
        if tag == "main":
            self.main_count += 1
        if tag in {"h1", "h2", "h3"}:
            self.headings += 1
        if tag == "img":
            self.image_count += 1
            if "alt" not in attrs:
                self.missing_alt += 1
        for key in ("href", "src", "poster"):
            if attrs.get(key):
                self.refs.append(attrs[key])

    def handle_endtag(self, tag):
        if tag == "main":
            self.main_close += 1


def resolve_local(value):
    parsed = urlsplit(value)
    if parsed.scheme or parsed.netloc or value.startswith("//"):
        return None, None
    if value.startswith(("mailto:", "tel:", "data:", "javascript:")):
        return None, None
    path = unquote(parsed.path).lstrip("/")
    path = ROUTES.get(path, path)
    if not path and parsed.fragment:
        return None, parsed.fragment
    if not path:
        path = "index.html"
    return path, parsed.fragment or None


def main():
    errors = []
    infos = {}
    pages = sorted(ROOT.glob("*.html"))
    for page in pages:
        parser = Inspect()
        try:
            parser.feed(page.read_text(encoding="utf-8"))
            parser.close()
        except Exception as exc:
            errors.append(f"{page.name}: HTML parse error {exc}")
        infos[page.name] = parser
        if parser.main_count != 1 or parser.main_close != 1:
            errors.append(f"{page.name}: expected one main element (found {parser.main_count}/{parser.main_close})")
        if parser.title_count != 1 or not parser.description or not parser.viewport:
            errors.append(f"{page.name}: title, description or viewport metadata is missing")
        if parser.duplicate_ids:
            errors.append(f"{page.name}: duplicate IDs {sorted(parser.duplicate_ids)}")
        if parser.missing_alt:
            errors.append(f"{page.name}: {parser.missing_alt} images missing alt attributes")

    count = 0
    for page in pages:
        for value in infos[page.name].refs:
            target, fragment = resolve_local(value)
            if target is None:
                if fragment and fragment not in infos[page.name].ids:
                    errors.append(f"{page.name}: missing in-page anchor {value}")
                continue
            # Only accept paths within the repository.
            file_path = (ROOT / target).resolve()
            if not file_path.is_relative_to(ROOT):
                errors.append(f"{page.name}: path escapes repository {value}")
                continue
            if not file_path.is_file():
                errors.append(f"{page.name}: missing file for {value}")
                continue
            count += 1
            if fragment and file_path.suffix == ".html" and target in infos:
                if fragment not in infos[target].ids:
                    errors.append(f"{page.name}: missing target {value}")

    try:
        vercel = json.loads((ROOT / "vercel.json").read_text(encoding="utf-8"))
        for rule in vercel.get("rewrites", []):
            dest = rule.get("destination", "").lstrip("/")
            if dest and not (ROOT / (dest + ".html" if "." not in dest else dest)).is_file():
                errors.append(f"vercel.json: missing rewrite destination {dest}")
    except Exception as exc:
        errors.append(f"Invalid vercel.json: {exc}")

    print(f"Checked {len(pages)} HTML pages, {count} resolved local references")
    if errors:
        for err in errors:
            print("FAIL:", err, file=sys.stderr)
        return 1
    print("PASS: local references, anchors, and basic HTML checks")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
