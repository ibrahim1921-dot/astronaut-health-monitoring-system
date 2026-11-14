"""
Builds next-app/public/skeleton-light.png (the body map image the app shows) from the source
drawing scripts/assets/skeleton.png, for the dark space theme.

    Run from the project root (needs Pillow: `pip install Pillow`):
        python scripts/make-skeleton-light.py

What it does (the source image is a black line drawing on a solid white background):
  - Line art      -> bone colour (#EDE6D6), opacity taken from how dark each pixel is,
                     so anti-aliased edges stay smooth.
  - White background connected to the image border -> fully transparent.
  - White areas enclosed by lines (bone interiors) -> faint bone fill (~12% opacity).
    Small gaps fully enclosed by bone (between ribs, inside the pelvis) can't be told
    apart from bone interiors, so they get the same faint fill.

skeleton.png is never modified.
"""

from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "scripts" / "assets" / "skeleton.png"
TARGET = ROOT / "next-app" / "public" / "skeleton-light.png"

BONE_RGB = (237, 230, 214)  # #EDE6D6
WHITE_THRESHOLD = 200       # grey values above this count as "paper"
LINE_GAIN = 1.15            # strengthens the line opacity slightly
INTERIOR_ALPHA = 30         # ~12% of 255

BACKGROUND, PAPER = 128, 255


def main() -> None:
    gray = Image.open(SOURCE).convert("L")
    width, height = gray.size

    # Opacity of the line art: darker source pixel -> more opaque bone colour.
    line_alpha = gray.point(lambda v: min(255, int((255 - v) * LINE_GAIN)))

    # Paper (white) vs ink, then flood-fill every paper pixel reachable from the border.
    regions = gray.point(lambda v: PAPER if v > WHITE_THRESHOLD else 0)
    border = (
        [(x, 0) for x in range(width)]
        + [(x, height - 1) for x in range(width)]
        + [(0, y) for y in range(height)]
        + [(width - 1, y) for y in range(height)]
    )
    for seed in border:
        if regions.getpixel(seed) == PAPER:
            ImageDraw.floodfill(regions, seed, BACKGROUND, thresh=0)

    # Whatever paper is left was enclosed by lines: give it a faint bone fill.
    interior_alpha = regions.point(lambda v: INTERIOR_ALPHA if v == PAPER else 0)

    alpha = ImageChops.lighter(line_alpha, interior_alpha)
    out = Image.new("RGBA", (width, height), BONE_RGB + (0,))
    out.putalpha(alpha)
    out.save(TARGET, optimize=True)
    print(f"Wrote {TARGET.relative_to(ROOT)} ({width}x{height})")


if __name__ == "__main__":
    main()
