"""Static checks on the built site (dist/). No third-party dependencies.

Run after `npm run build`:  python3 scripts/verify_site.py

Checks: one <main> and one <h1> per page, title/description/canonical/viewport, image alt
attributes, duplicate IDs, internal links and assets resolve (Vercel clean URLs and redirects
included), in-page anchors exist, no inline executable scripts (CSP is script-src 'self'),
external links opened in new tabs use rel=noopener, no merge-conflict markers, and no
secret-looking strings anywhere in the deployable output.
"""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
REDIRECTS = {r["source"]: r["destination"]
             for r in json.loads((ROOT / "vercel.json").read_text())["redirects"]}
SECRET_PATTERNS = [
    re.compile(r"re_[A-Za-z0-9]{16,}"),                 # Resend keys
    re.compile(r"AX[A-Za-z0-9_-]{30,}"),                # Upstash REST tokens
    re.compile(r"(?i)(api[_-]?key|secret|token|password)\s*[:=]\s*['\"][^'\"]{12,}"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    re.compile(r"gh[pousr]_[A-Za-z0-9]{30,}"),
    re.compile(r"sk-[A-Za-z0-9]{20,}"),
]


class Inspect(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids, self.dups, self.refs = set(), set(), []
        self.counts = {"title": 0, "main": 0, "h1": 0}
        self.meta = set()
        self.missing_alt = 0
        self.inline_scripts = 0
        self.bad_blank = []
        self.canonical = False
        self.svg_depth = 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if a.get("id"):
            (self.dups if a["id"] in self.ids else self.ids).add(a["id"])
        if tag == "svg":
            self.svg_depth += 1
        if tag in self.counts and not (tag == "title" and self.svg_depth):
            self.counts[tag] += 1
        if tag == "meta" and a.get("name") in ("description", "viewport") and a.get("content"):
            self.meta.add(a["name"])
        if tag == "link" and a.get("rel") == "canonical":
            self.canonical = True
        if tag == "img" and "alt" not in a:
            self.missing_alt += 1
        if tag == "script" and not a.get("src") and a.get("type") != "application/ld+json":
            self.inline_scripts += 1
        if tag == "a" and a.get("target") == "_blank" and "noopener" not in (a.get("rel") or ""):
            self.bad_blank.append(a.get("href"))
        if any(k.startswith("on") for k in a):
            self.inline_scripts += 1
        for key in ("href", "src"):
            if a.get(key):
                self.refs.append(a[key])
        if a.get("srcset"):
            self.refs += [part.strip().split(" ")[0] for part in a["srcset"].split(",")]

    def handle_endtag(self, tag):
        if tag == "svg":
            self.svg_depth -= 1


def resolve(value):
    """Map a site-relative URL to a file in dist/, following redirects and clean URLs."""
    parsed = urlsplit(value)
    if parsed.scheme or parsed.netloc or value.startswith(("mailto:", "tel:", "data:", "#")):
        return None, parsed.fragment or None
    path = unquote(parsed.path)
    if not path.startswith("/"):
        return "RELATIVE", None
    path = REDIRECTS.get(path.rstrip("/") or "/", path)
    rel = "index.html" if path in ("", "/") else path.lstrip("/")
    for candidate in (DIST / rel, DIST / (rel + ".html")):
        if candidate.is_file():
            return candidate, parsed.fragment or None
    return "MISSING", None


def main():
    if not (DIST / "index.html").is_file():
        print("dist/ missing: run `npm run build` first", file=sys.stderr)
        return 1
    errors, infos = [], {}
    pages = sorted(DIST.rglob("*.html"))
    for page in pages:
        name = str(page.relative_to(DIST))
        text = page.read_text(encoding="utf-8")
        p = Inspect()
        p.feed(text)
        infos[page] = p
        if p.counts["main"] != 1:
            errors.append(f"{name}: expected one <main>")
        if p.counts["h1"] != 1:
            errors.append(f"{name}: expected one <h1> (found {p.counts['h1']})")
        if p.counts["title"] != 1 or p.meta != {"description", "viewport"} or not p.canonical:
            errors.append(f"{name}: title, description, viewport or canonical missing")
        if p.dups:
            errors.append(f"{name}: duplicate IDs {sorted(p.dups)}")
        if p.missing_alt:
            errors.append(f"{name}: {p.missing_alt} <img> without alt")
        if p.inline_scripts:
            errors.append(f"{name}: inline script or on* handler (blocked by CSP)")
        if p.bad_blank:
            errors.append(f"{name}: target=_blank without noopener {p.bad_blank}")
        if re.search(r"^(<<<<<<<|=======|>>>>>>>)", text, re.M):
            errors.append(f"{name}: merge-conflict marker")

    resolved = 0
    for page, p in infos.items():
        name = str(page.relative_to(DIST))
        for ref in p.refs:
            target, frag = resolve(ref)
            if target is None:
                if frag and ref.startswith("#") and frag not in p.ids:
                    errors.append(f"{name}: missing anchor {ref}")
                continue
            if target == "RELATIVE":
                errors.append(f"{name}: relative URL {ref} (use root-absolute paths)")
                continue
            if target == "MISSING":
                errors.append(f"{name}: broken link or asset {ref}")
                continue
            resolved += 1
            if frag and target in infos and frag not in infos[target].ids:
                errors.append(f"{name}: missing target {ref}")

    for f in DIST.rglob("*"):
        if f.is_file() and f.suffix in {".html", ".js", ".css", ".txt", ".xml", ".json"}:
            body = f.read_text(encoding="utf-8", errors="ignore")
            for pat in SECRET_PATTERNS:
                if pat.search(body):
                    errors.append(f"{f.relative_to(DIST)}: secret-like string matches {pat.pattern}")
        if f.name.startswith(".env") or f.suffix in {".pem", ".key"}:
            errors.append(f"{f.relative_to(DIST)}: sensitive file in output")

    print(f"Checked {len(pages)} pages, {resolved} internal references")
    for e in errors:
        print("FAIL:", e, file=sys.stderr)
    if errors:
        return 1
    print("PASS: structure, metadata, links, anchors, CSP-safe scripts, no secrets")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
