# Developer tools

Scripts used to build the data files and to test Tidyroll. You need Python 3 (with `pillow`, `piexif`)
and Node.js with Playwright (`npm i -D playwright && npx playwright install chromium`).

| Script | What it does |
| --- | --- |
| `build_geo.py` | Rebuilds `web/data/countries.json` and `web/data/cities.tsv` from Natural Earth (npm `world-atlas`) and GeoNames `cities5000.txt`. |
| `make_icons.py` | Draws the app icons for the website and the Android launcher. |
| `make_test_roll.py` | Makes a fake Galaxy camera roll (trips, screenshots, WhatsApp, duplicates, a video) from a folder of sample pictures. |
| `run_engine_test.mjs` | Runs the sorting engine in headless Chromium on a folder and saves the result as JSON. |
| `run_ui_test.mjs` | Clicks through the whole website (choose folder, sort, edit an album, search, save, undo) and takes screenshots. |
| `native_mock.py` + `run_native_test.mjs` | Runs the website the way the Android app does, with a fake gallery, to test the app side without a phone. |

Serve the repository root first, for example `python -m http.server 8765`, then for example:

```
python dev/make_test_roll.py my-sample-pictures testroll
node dev/run_ui_test.mjs shots testroll
```
