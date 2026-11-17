"""Draw the Tidyroll icon (darkroom square, tidyroll lamp, a white print) as SVG and PNGs.
Usage: python3 -I make_icons.py OUT_DIR [ANDROID_RES_DIR]
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFilter

out = sys.argv[1]
android = sys.argv[2] if len(sys.argv) > 2 else None
os.makedirs(out, exist_ok=True)

SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<rect width="512" height="512" rx="112" fill="#231815"/>
<circle cx="356" cy="150" r="92" fill="#ffa62b" opacity=".18"/>
<circle cx="356" cy="150" r="46" fill="#ffa62b"/>
<g transform="rotate(-8 210 320)"><rect x="96" y="196" width="232" height="232" rx="6" fill="#fbfaf7"/>
<rect x="118" y="218" width="188" height="188" fill="#7a3f22"/><path d="M118 406 L178 318 L222 362 L262 300 L306 370 L306 406 Z" fill="#ffa62b"/></g>
</svg>"""
open(os.path.join(out, "icon.svg"), "w").write(SVG)


def draw(size, pad=0.0, round_=True):
    S = 1024
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if round_:
        d.rounded_rectangle((0, 0, S - 1, S - 1), radius=224, fill="#231815")
    else:
        d.rectangle((0, 0, S, S), fill="#231815")
    inset = int(S * pad)
    sc = (S - 2 * inset) / 512

    def P(x, y):
        return (inset + x * sc, inset + y * sc)

    glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    cx, cy = P(356, 150)
    r = 92 * sc
    gd.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(255, 166, 43, 70))
    glow = glow.filter(ImageFilter.GaussianBlur(18 * sc))
    im.alpha_composite(glow)
    r = 46 * sc
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill="#ffa62b")
    pr = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    pd = ImageDraw.Draw(pr)
    pd.rounded_rectangle((*P(96, 196), *P(328, 428)), radius=int(6 * sc), fill="#fbfaf7")
    pd.rectangle((*P(118, 218), *P(306, 406)), fill="#7a3f22")
    pd.polygon([P(118, 406), P(178, 318), P(222, 362), P(262, 300), P(306, 370), P(306, 406)], fill="#ffa62b")
    pr = pr.rotate(8, center=P(210, 320), resample=Image.BICUBIC)
    im.alpha_composite(pr)
    return im.resize((size, size), Image.LANCZOS)


draw(192).save(os.path.join(out, "icon-192.png"))
draw(512).save(os.path.join(out, "icon-512.png"))
draw(512, pad=0.12, round_=False).save(os.path.join(out, "icon-512-maskable.png"))
draw(180).save(os.path.join(out, "apple-touch-icon.png"))

if android:
    for name, px in {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}.items():
        d = os.path.join(android, f"mipmap-{name}")
        os.makedirs(d, exist_ok=True)
        draw(px).save(os.path.join(d, "ic_launcher.png"))
        draw(px, pad=0.0, round_=False).save(os.path.join(d, "ic_launcher_square.png"))
print("icons written")


def foreground(px):
    """Adaptive-icon foreground: lamp and print centred in the 66% safe zone, transparent around."""
    S = 1024
    tmp = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(tmp)
    sc = (S * 0.62) / 512
    off = (S - 512 * sc) / 2

    def P(x, y):
        return (off + x * sc, off + y * sc)

    glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    cx, cy = P(356, 150)
    r = 92 * sc
    gd.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(255, 166, 43, 70))
    glow = glow.filter(ImageFilter.GaussianBlur(18 * sc))
    tmp.alpha_composite(glow)
    r = 46 * sc
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill="#ffa62b")
    pr = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    pd = ImageDraw.Draw(pr)
    pd.rounded_rectangle((*P(96, 196), *P(328, 428)), radius=int(6 * sc), fill="#fbfaf7")
    pd.rectangle((*P(118, 218), *P(306, 406)), fill="#7a3f22")
    pd.polygon([P(118, 406), P(178, 318), P(222, 362), P(262, 300), P(306, 370), P(306, 406)], fill="#ffa62b")
    pr = pr.rotate(8, center=P(210, 320), resample=Image.BICUBIC)
    tmp.alpha_composite(pr)
    return tmp.resize((px, px), Image.LANCZOS)


if android:
    for name, px in {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}.items():
        foreground(px).save(os.path.join(android, f"mipmap-{name}", "ic_launcher_foreground.png"))
    d = os.path.join(android, "mipmap-anydpi-v26")
    os.makedirs(d, exist_ok=True)
    open(os.path.join(d, "ic_launcher.xml"), "w").write(
        '<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
        '    <background android:drawable="@color/darkroom" />\n    <foreground android:drawable="@mipmap/ic_launcher_foreground" />\n'
        '    <monochrome android:drawable="@mipmap/ic_launcher_foreground" />\n</adaptive-icon>\n')
    print("adaptive icon written")
