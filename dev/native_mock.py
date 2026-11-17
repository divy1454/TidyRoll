"""Build what the Android app would serve for a folder of photos: the /api/media list and /meta/<id> JSON.
Usage: python3 -I native_mock.py ROLL_DIR OUT_JSON
"""
import json
import os
import sys
from datetime import datetime, timezone

import piexif

roll, out = sys.argv[1], sys.argv[2]
items, meta, paths = [], {}, {}
i = 1000
for dp, _, fs in os.walk(roll):
    for f in sorted(fs):
        p = os.path.join(dp, f)
        rel = os.path.relpath(dp, roll).replace(os.sep, "/") + "/"
        kind = "video" if f.lower().endswith(".mp4") else "photo"
        st = os.stat(p)
        i += 1
        item = {"id": i, "name": f, "path": rel + f, "size": st.st_size, "mtime": int(st.st_mtime * 1000), "kind": kind,
                "mime": "video/mp4" if kind == "video" else "image/jpeg", "taken": int(st.st_mtime * 1000)}
        m = {}
        if kind == "photo":
            try:
                e = piexif.load(p)
                dt = e["Exif"].get(piexif.ExifIFD.DateTimeOriginal)
                if dt:
                    wall = datetime.strptime(dt.decode(), "%Y:%m:%d %H:%M:%S").replace(tzinfo=timezone.utc)
                    m["wall"] = int(wall.timestamp() * 1000)
                    off = e["Exif"].get(piexif.ExifIFD.OffsetTimeOriginal)
                    if off:
                        s = off.decode()
                        mins = (int(s[1:3]) * 60 + int(s[4:6])) * (-1 if s[0] == "-" else 1)
                        m["off"] = mins
                        m["utc"] = m["wall"] - mins * 60000
                g = e["GPS"]
                if g.get(2):
                    d = lambda v: v[0][0] / v[0][1] + v[1][0] / v[1][1] / 60 + v[2][0] / v[2][1] / 3600
                    m["lat"] = d(g[2]) * (-1 if g.get(1) == b"S" else 1)
                    m["lon"] = d(g[4]) * (-1 if g.get(3) == b"W" else 1)
                if e["0th"].get(piexif.ImageIFD.Make):
                    m["make"] = e["0th"][piexif.ImageIFD.Make].decode()
            except Exception:
                pass
        else:
            m = {"utc": int(datetime(2025, 12, 21, 12, 15, 12, tzinfo=timezone.utc).timestamp() * 1000), "lat": 15.5523, "lon": 73.7517, "dur": 4.9}
        items.append(item)
        meta[str(i)] = m
        paths[str(i)] = p
json.dump({"items": items, "meta": meta, "paths": paths}, open(out, "w"))
print(len(items), "items")
