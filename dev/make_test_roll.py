"""Build a synthetic Samsung Galaxy camera roll for testing the sorter.

Usage: python3 -I make_test_roll.py SRC_DIR OUT_DIR [--big]
Creates DCIM/Camera (EXIF date + GPS + Samsung make/model + 512px EXIF thumbnail),
DCIM/Screenshots, WhatsApp Images, duplicates, blurry and night shots, and a video.
"""
import io
import os
import random
import shutil
import subprocess
import sys
from datetime import datetime, timedelta, timezone

import piexif
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

SRC, OUT = sys.argv[1], sys.argv[2]
BIG = "--big" in sys.argv
random.seed(7)

CAM = os.path.join(OUT, "DCIM", "Camera")
SHOTS = os.path.join(OUT, "DCIM", "Screenshots")
WA = os.path.join(OUT, "Android", "media", "com.whatsapp", "WhatsApp", "Media", "WhatsApp Images")
for d in (CAM, SHOTS, WA):
    os.makedirs(d, exist_ok=True)

IST = timezone(timedelta(hours=5, minutes=30))
CET = timezone(timedelta(hours=2))  # CEST in October

PLACES = {
    "mumbai": (19.0760, 72.8777, IST),
    "goa": (15.5523, 73.7517, IST),       # Calangute beach
    "zurich": (47.3769, 8.5417, CET),
    "zermatt": (46.0207, 7.7491, CET),
    "como": (45.8081, 9.0852, CET),
    "rome": (41.9028, 12.4964, CET),
}


def deg(v):
    v = abs(v)
    d = int(v)
    m = int((v - d) * 60)
    s = round(((v - d) * 60 - m) * 60 * 100)
    return ((d, 1), (m, 1), (s, 100))


def exif_bytes(dt, place, thumb_src):
    lat, lon, tz = PLACES[place] if place else (None, None, IST)
    jitter = lambda: random.uniform(-0.01, 0.01)
    local = dt.replace(tzinfo=tz)
    off = local.strftime("%z")
    off = off[:3] + ":" + off[3:]
    zeroth = {
        piexif.ImageIFD.Make: b"samsung",
        piexif.ImageIFD.Model: b"SM-S938B",
        piexif.ImageIFD.Orientation: 1,
        piexif.ImageIFD.DateTime: dt.strftime("%Y:%m:%d %H:%M:%S").encode(),
    }
    exif = {
        piexif.ExifIFD.DateTimeOriginal: dt.strftime("%Y:%m:%d %H:%M:%S").encode(),
        piexif.ExifIFD.OffsetTimeOriginal: off.encode(),
        piexif.ExifIFD.LensModel: b"Samsung Galaxy S25 Ultra Rear Wide Camera",
    }
    gps = {}
    if place:
        la, lo = lat + jitter(), lon + jitter()
        utc = local.astimezone(timezone.utc)
        gps = {
            piexif.GPSIFD.GPSLatitudeRef: b"N" if la >= 0 else b"S",
            piexif.GPSIFD.GPSLatitude: deg(la),
            piexif.GPSIFD.GPSLongitudeRef: b"E" if lo >= 0 else b"W",
            piexif.GPSIFD.GPSLongitude: deg(lo),
            piexif.GPSIFD.GPSDateStamp: utc.strftime("%Y:%m:%d").encode(),
            piexif.GPSIFD.GPSTimeStamp: ((utc.hour, 1), (utc.minute, 1), (utc.second, 1)),
        }
    th = thumb_src.copy()
    th.thumbnail((512, 512))
    for q in (75, 60, 45, 30):  # EXIF APP1 caps the thumbnail at 64 kB
        buf = io.BytesIO()
        th.save(buf, "JPEG", quality=q)
        if buf.tell() < 60000:
            break
    return piexif.dump({"0th": zeroth, "Exif": exif, "GPS": gps, "1st": {}, "thumbnail": buf.getvalue()})


def load(name):
    im = Image.open(os.path.join(SRC, name)).convert("RGB")
    if BIG:  # phone-sized originals (12 MP) to test decode speed
        w, h = im.size
        s = 4000 / max(w, h)
        im = im.resize((int(w * s), int(h * s)), Image.LANCZOS)
    return im


def camera(name, dt, place, edit=None, suffix=""):
    im = load(name)
    if edit:
        im = edit(im)
    fn = dt.strftime("%Y%m%d_%H%M%S") + suffix + ".jpg"
    im.save(os.path.join(CAM, fn), "JPEG", quality=88, exif=exif_bytes(dt, place, im))
    return fn


def night(im):
    return ImageEnhance.Brightness(im).enhance(0.18)


def warm(im):
    r, g, b = im.split()
    r = r.point(lambda v: min(255, int(v * 1.25 + 20)))
    g = g.point(lambda v: int(v * 0.95 + 10))
    b = b.point(lambda v: int(v * 0.6))
    return Image.merge("RGB", (r, g, b))


def blur(im):
    return im.filter(ImageFilter.GaussianBlur(radius=max(im.size) / 120))


d = datetime
made = []
# --- Home life in Mumbai, spread over 2025-2026
home = [
    ("dog2.jpg", d(2025, 3, 2, 9, 14, 3)), ("coffee.png", d(2025, 3, 2, 9, 40, 0)),
    ("chelsea.png", d(2025, 5, 18, 19, 2, 11)), ("fruits.jpg", d(2025, 6, 7, 13, 21, 45)),
    ("astronaut.png", d(2025, 8, 15, 11, 5, 0)), ("grace_hopper.jpg", d(2025, 8, 15, 11, 6, 30)),
    ("dog.jpg", d(2025, 9, 9, 8, 30, 0)), ("building.jpg", d(2025, 11, 1, 16, 44, 0)),
    ("zidane.jpg", d(2026, 1, 26, 20, 10, 0)), ("messi.jpg", d(2026, 2, 14, 18, 30, 0)),
    ("bus.jpg", d(2026, 4, 3, 10, 0, 0)), ("eagle.jpg", d(2026, 6, 21, 7, 12, 0)),
    ("newspaper1.jpg", d(2026, 7, 2, 12, 0, 0)), ("sudoku.png", d(2026, 7, 2, 12, 5, 0)),
    ("baboon.jpg", d(2026, 8, 30, 15, 33, 0)), ("butterfly.jpg", d(2026, 9, 12, 10, 3, 0)),
]
for n, t in home:
    made.append(camera(n, t, "mumbai"))
made.append(camera("dog2.jpg", d(2025, 3, 2, 9, 14, 4), "mumbai", edit=lambda im: im.resize((im.width - 8, im.height - 6))))  # near-duplicate burst
made.append(camera("fruits.jpg", d(2025, 6, 7, 13, 21, 50), "mumbai", edit=blur))  # blurry retake
made.append(camera("bus.jpg", d(2026, 4, 3, 10, 0, 9), "mumbai", edit=blur))
made.append(camera("building.jpg", d(2025, 11, 1, 22, 40, 0), "mumbai", edit=night))  # night
made.append(camera("zidane.jpg", d(2026, 1, 26, 23, 5, 0), "mumbai", edit=night))

# --- Trip 1: Goa, 20-23 Dec 2025
goa = [
    ("beach_kites.jpg", d(2025, 12, 20, 16, 5, 0)), ("dogs_beach.jpg", d(2025, 12, 20, 16, 30, 0)),
    ("fruits.jpg", d(2025, 12, 21, 13, 0, 0)), ("coffee.png", d(2025, 12, 21, 9, 15, 0)),
    ("boat1.jpg", d(2025, 12, 22, 11, 0, 0)), ("boat2.jpg", d(2025, 12, 22, 11, 1, 0)),
    ("person.jpg", d(2025, 12, 22, 15, 0, 0)), ("messi.jpg", d(2025, 12, 23, 10, 0, 0)),
]
for n, t in goa:
    made.append(camera(n, t, "goa"))
made.append(camera("beach_kites.jpg", d(2025, 12, 21, 18, 0, 0), "goa", edit=warm))  # golden hour
shutil.copy(os.path.join(SRC, "kite.jpg"), os.path.join(CAM, "20251220_160501.jpg"))  # exact duplicate file (no EXIF)

# --- Trip 2: Switzerland then Italy, 10-17 Oct 2026
eu = [
    ("building.jpg", d(2026, 10, 10, 12, 0, 0), "zurich"), ("bus.jpg", d(2026, 10, 10, 14, 0, 0), "zurich"),
    ("boat3.jpg", d(2026, 10, 11, 10, 0, 0), "zurich"), ("boat4.jpg", d(2026, 10, 11, 10, 2, 0), "zurich"),
    ("horses.jpg", d(2026, 10, 12, 11, 0, 0), "zermatt"), ("person.jpg", d(2026, 10, 12, 12, 0, 0), "zermatt"),
    ("giraffe.jpg", d(2026, 10, 13, 15, 0, 0), "zermatt"), ("coffee.png", d(2026, 10, 13, 8, 0, 0), "zermatt"),
    ("boat5.jpg", d(2026, 10, 14, 17, 0, 0), "como"), ("boat6.jpg", d(2026, 10, 14, 17, 5, 0), "como"),
    ("fruits.jpg", d(2026, 10, 15, 13, 0, 0), "como"), ("home.jpg", d(2026, 10, 16, 11, 0, 0), "rome"),
    ("s1.jpg", d(2026, 10, 16, 15, 0, 0), "rome"), ("s2.jpg", d(2026, 10, 17, 10, 0, 0), "rome"),
    ("grace_hopper.jpg", d(2026, 10, 17, 19, 0, 0), "rome"),
]
for n, t, p in eu:
    made.append(camera(n, t, p))
made.append(camera("home.jpg", d(2026, 10, 16, 21, 45, 0), "rome", edit=night))

# --- Screenshots (no camera EXIF, phone-screen size)
for i, t in enumerate([d(2025, 4, 1, 10, 1, 1), d(2025, 10, 9, 22, 0, 5), d(2026, 3, 12, 10, 15, 30), d(2026, 5, 5, 8, 0, 0)]):
    im = Image.new("RGB", (1440, 3120), (250, 250, 250))
    dr = ImageDraw.Draw(im)
    dr.rectangle((0, 0, 1440, 160), fill=(30, 30, 30))
    for y in range(260, 2900, 140):
        dr.rectangle((80, y, 80 + random.randint(500, 1250), y + 50), fill=(60, 60, 60))
    app = ["Instagram", "Chrome", "WhatsApp", "Maps"][i]
    im.save(os.path.join(SHOTS, f"Screenshot_{t:%Y%m%d_%H%M%S}_{app}.jpg"), "JPEG", quality=85)

# --- WhatsApp images (EXIF stripped, downscaled)
for i, (n, t) in enumerate([("dog.jpg", d(2025, 7, 1)), ("newspaper2.jpg", d(2025, 7, 3)), ("chelsea.png", d(2026, 2, 10)),
                             ("astronaut.png", d(2026, 2, 11)), ("notes.png", d(2026, 9, 1))]):
    im = Image.open(os.path.join(SRC, n)).convert("RGB")
    im.thumbnail((1600, 1600))
    im.save(os.path.join(WA, f"IMG-{t:%Y%m%d}-WA{i + 1:04d}.jpg"), "JPEG", quality=70)

# --- Video with Samsung-style location atom (Goa)
vid = os.path.join(CAM, "20251221_174512.mp4")
subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", os.path.join(SRC, "cockatoo.mp4"), "-c", "copy",
                "-metadata", "creation_time=2025-12-21T12:15:12Z", "-metadata", "location=+15.5523+073.7517/",
                "-movflags", "+use_metadata_tags", vid], check=True)

count = sum(len(f) for _, _, f in os.walk(OUT))
print("files:", count)
