"""Generate the web-optimised images the site references (images/opt/*.webp).

The originals stay in images/ untouched. Re-run after replacing a source photo:
    python3 -m pip install pillow
    python3 scripts/optimize_images.py [extra_source_dir]
Outputs are committed, so the Vercel build never needs Pillow.
"""
from pathlib import Path
import sys
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "images"
OUT = SRC / "opt"
EXTRA = Path(sys.argv[1]) if len(sys.argv) > 1 else None

# name: (source, max width, max height, quality)
JOBS = {
    "taha-portrait-800": ("Taha.PNG", 800, 1000, 80),
    "taha-portrait-480": ("Taha.PNG", 480, 600, 78),
    "about-portrait-720": ("abouttaha.jpg", 720, 900, 78),
    "logo-loblaw": ("loblaw3.png", 240, 96, 85),
    "logo-ies": ("ies.jpeg", 240, 96, 85),
    "logo-medheave": ("medheavelogo.jpeg", 240, 96, 85),
    "logo-codeninjas": ("codeninja2.jpeg", 240, 96, 85),
    "logo-guelph": ("guelph.png", 240, 96, 85),
    "logo-cambridge": ("cabrig.jpeg", 240, 96, 85),
    "logo-bishop": ("bishop.jpeg", 240, 96, 85),
    "note-promotion": ("superpic.jpg", 960, 960, 76),
    "note-niagara": ("nigarapic.jpg", 960, 960, 76),
    "cricket-batting": ("IMG_1604 2.jpg", 480, 640, 76),
    "cricket-1": ("cric1.jpg", 640, 640, 74),
    "cricket-2": ("cric2.jpg", 640, 640, 74),
    "cricket-3": ("cric3.jpg", 640, 640, 74),
    "cricket-4": ("cric4.jpg", 640, 640, 74),
}
# Optional sources that are not kept in images/ (screenshots captured during review).
EXTRA_JOBS = {
    "note-alarms": ("templobalw.jpg", 960, 960, 76),
    "edupro-home": ("edupro-home.png", 1440, 900, 80),
    "simply-login": ("simply-login.png", 780, 1688, 82),
    "simply-home": ("simply-home.png", 780, 1688, 82),
    "simply-insights": ("simply-insights.png", 780, 1688, 82),
    "simply-add": ("simply-add.png", 780, 1688, 82),
}


def convert(src: Path, name: str, w: int, h: int, q: int) -> None:
    im = ImageOps.exif_transpose(Image.open(src))
    im = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB")
    im.thumbnail((w, h), Image.LANCZOS)
    dest = OUT / f"{name}.webp"
    im.save(dest, "WEBP", quality=q, method=6)
    print(f"{dest.relative_to(ROOT)}  {im.width}x{im.height}  {dest.stat().st_size // 1024} KB")


# name: (source, crop height as a fraction of the image, aspect w/h, quality); anchored bottom-right
CROP_JOBS = {
    "about-portrait-crop": ("abouttaha.jpg", 0.62, 0.8, 80),
}


def crop_bottom_right(src: Path, name: str, frac: float, aspect: float, q: int) -> None:
    im = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
    h = int(im.height * frac)
    w = int(h * aspect)
    im = im.crop((im.width - w, im.height - h, im.width, im.height))
    im.thumbnail((720, 900), Image.LANCZOS)
    dest = OUT / f"{name}.webp"
    im.save(dest, "WEBP", quality=q, method=6)
    print(f"{dest.relative_to(ROOT)}  {im.width}x{im.height}  {dest.stat().st_size // 1024} KB")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (src, w, h, q) in JOBS.items():
        convert(SRC / src, name, w, h, q)
    for name, (src, frac, aspect, q) in CROP_JOBS.items():
        crop_bottom_right(SRC / src, name, frac, aspect, q)
    if EXTRA:
        for name, (src, w, h, q) in EXTRA_JOBS.items():
            if (EXTRA / src).is_file():
                convert(EXTRA / src, name, w, h, q)


if __name__ == "__main__":
    main()
