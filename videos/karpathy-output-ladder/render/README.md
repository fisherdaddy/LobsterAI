# HTML → MP4 renderer (frame-accurate, offline, CJK-ready)

Renders an HTML page that implements a tiny **page contract** into an H.264 MP4. Every frame is produced by
calling `window.renderFrame(t)` and capturing it with headless Chromium (Playwright). Frames are split across
parallel browser processes in contiguous chunks and joined with ffmpeg's concat demuxer. Fonts and JS libraries are
local, so a render needs no network access.

```
render/
  render.mjs                 the renderer CLI (also importable: exports CHROME_ARGS, startServer, auditFonts, ...)
  fonts/fonts.css            @font-face for every font below (relative URLs) + recommended stacks
  fonts/<family>/*.woff2     unicode-range slices (CJK) / variable fonts (Latin)
  vendor/                    gsap, three.js, rough.js, d3 (copied from npm)
  demo/index.html            6 s reference page (GSAP + rough.js + three.js + canvas + subtitles)
  demo/demo.mp4              final render (1920x1080, 30 fps)      demo/demo-draft.mp4   --scale 0.5 draft
  demo/stills/               QA stills (t = 0.5, 3, 5.5)
  tests/                     font coverage proof, WebGL check, frame-index/boundary check, benchmark
  scripts/setup-assets.mjs   rebuilds fonts/ + vendor/ from node_modules (+ fonts-extra/)
  scripts/build-cjk-gap-fonts.py   builds the CJK "gap" slices (see Fonts)
```

## Quick start

```bash
cd render
# final video (default: 4 workers, JPEG q95 capture, x264 crf 18 / preset medium)
node render.mjs --page demo/index.html --out demo/demo.mp4
# with narration / music (AAC 192 kb/s, 48 kHz stereo, padded or trimmed to exactly VIDEO.duration)
node render.mjs --page demo/index.html --out demo/demo.mp4 --audio voice.wav
# quick previews
node render.mjs --page demo/index.html --out /tmp/draft.mp4 --scale 0.5           # 960x540, same layout
node render.mjs --page demo/index.html --out /tmp/part.mp4 --start 2 --end 4      # frames [60, 120)
# QA stills (PNG) + font-fallback audit for each still
node render.mjs --page demo/index.html --frames 0.5,3,5.5 --out-dir demo/stills
```

Playwright is resolved from `node_modules`, then `NODE_PATH`, then `/opt/node22/lib/node_modules/playwright`
(override with `PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs`). Requires `ffmpeg`/`ffprobe` on `PATH`.

### CLI

| option | meaning |
|---|---|
| `--page <path\|url>` | page implementing the contract (a local path is served over HTTP, see *Static server*) |
| `--out <file.mp4>` | output video |
| `--audio <file>` | wav / m4a / mp3 / ... → AAC 192k 48 kHz stereo, `apad` + `-t` so it is exactly the video length; with `--start` the audio is offset to match |
| `--workers <n>` | parallel browser processes (default `min(cpus, 4)`); each renders one contiguous chunk |
| `--start <s>` `--end <s>` | render only frames `[round(start*fps), round(end*fps))` |
| `--scale <f>` | capture scale in (0, 1]: `0.5` = 960×540 draft with identical CSS layout, rasterised natively at that size (Chromium renders the capture at `clip.scale`). Finals use 1 |
| `--fps <n>` / `--duration <s>` | override `VIDEO.fps` / `VIDEO.duration` |
| `--format jpeg\|png` `--quality <n>` | capture format (default `jpeg`, quality `95`; see Measured throughput) |
| `--frames t1,t2,...` `--out-dir <dir>` | stills mode: PNGs named `frame_<t>s.png` (default dir `<page dir>/stills`) |
| `--root <dir>` | static-server root (default: parent of the page's directory) |
| `--crf <n>` `--preset <p>` | final x264 settings (default `18`, `medium`) |
| `--intermediate copy\|x264` | chunk files: `copy` = the captured JPEG/PNG stream as-is in `.mov` (default), `x264` = crf 12 |
| `--audit-fonts` | run the CDP font audit (fallback detection) on the first frame before rendering |
| `--allow-system-fonts` | don't fail when a `font-family` has no `@font-face` |
| `--ignore-page-errors` | keep going on uncaught page exceptions (default: abort) |
| `--no-seed-random` | keep the native `Math.random` |
| `--fast-capture` | skip the history-independent capture path (see Gotchas #8); ~1.5× faster capture |
| `--chrome-flags="--a --b"` | extra Chromium flags (note the `=`) |
| `--browser shell\|chromium` | chromium-headless-shell (default) or full Chromium in new headless mode |
| `--frame-timeout <s>` `--load-timeout <s>` | default 60 / 120 |
| `--keep-temp` `-v` | keep chunk files; verbose (prints the ffmpeg command, WebGL renderer, console.log) |

Progress is printed as `capture 123/180 frames (68%) 27.1 fps ETA 2.1s`, then the encode, then a summary with the
probed output (codec/profile/size/frames/duration), a timing breakdown and per-worker ms/frame.

## Page contract

```html
<!doctype html>
<html lang="zh-CN">                       <!-- lang matters for CJK glyph selection -->
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="../fonts/fonts.css">
  <script src="../vendor/gsap/gsap.min.js"></script>
</head>
<body>
  <h1 id="title">标题</h1>
  <script>
    window.VIDEO = {
      width: 1920, height: 1080, fps: 30, duration: 6,   // required (duration in seconds)
      preloadText: '所有稍后才出现的文字（字幕等）',        // optional: text not in the DOM at load time
      fonts: ['LXGW WenKai'],                            // optional: families used only on <canvas>
      seekCssAnimations: true,                           // optional (default true), see below
    };
    window.prepare = async () => { /* optional, awaited once: build scenes, load textures, measure text */ };
    window.renderFrame = (t) => { /* required: put EVERYTHING into the state for time t (seconds) */ };
  </script>
</body>
</html>
```

Rules:

* `renderFrame(t)` must be a **pure function of `t`** and must work in **any order** (each worker starts in the
  middle of the timeline; stills mode jumps around). It may return a native `Promise` (e.g. to await a video seek).
  Return `undefined` otherwise — never `tl.seek(t)`'s return value (see Gotchas #6).
* No CSS animations/transitions, `setTimeout`, `requestAnimationFrame` or `Date.now()` for timing. As a safety net,
  the renderer pauses every Web Animation and sets `currentTime = t*1000` (CSS animations therefore behave as if they
  started at t = 0) and finishes CSS transitions instantly; opt out with `VIDEO.seekCssAnimations = false`.
* Randomness: the renderer replaces `Math.random` with a seeded PRNG before page scripts run, so init-time randomness is
  identical in every worker. Per-frame randomness must still be derived from `t` (or a seeded PRNG you own, as in the
  demo). Pass `seed` to rough.js shapes.
* Size layout from `VIDEO.width/height`, not `window.innerWidth`. `window.devicePixelRatio` is always 1 (drafts are
  scaled at capture time), so canvas/WebGL backing stores = CSS size; reading `devicePixelRatio` is still fine.
* `window.__RENDERER__` is defined while rendering (use it to disable a browser preview loop, as the demo does).

What the renderer does before frame 0, in every worker: waits for `load` and for `renderFrame`/`VIDEO`; awaits
`document.fonts.ready`; preloads the font slices needed by the DOM text; awaits `prepare()`; calls `renderFrame` at 13
evenly spaced times to discover text that appears later (counters, subtitles) and preloads those slices plus
`VIDEO.preloadText`; verifies fonts (below); `img.decode()`s every `<img>`. Per frame it calls `renderFrame(t)`, seeks
Web Animations, forces style+layout and **waits for any font slice that still started loading** (so even un-preloaded
text never renders in a fallback font) and for incomplete `<img>`s, then captures.

Font verification (fails loudly, exit 1): a `@font-face` file failed to load or decode; `document.fonts.check()` is
false for any (family, weight, style) on the characters the page uses; the **first** family of a used `font-family`
stack has no `@font-face` (it would silently use a system font; allow with `--allow-system-fonts`). Characters not
covered by any declared face of their stack are reported as warnings. Stills mode additionally runs a **CDP font
audit** (`CSS.getPlatformFontsForNode`) on every text node and prints which font actually rendered how many glyphs,
flagging any system font: `WARN fallback font "WenQuanYi Zen Hei" rendered 3 glyph(s) in <div.sub> "..."`.

### Deterministic GSAP

```js
gsap.ticker.lagSmoothing(0);           // no lag compensation (only matters if the ticker runs)
gsap.ticker.remove(gsap.updateRoot);   // GSAP's rAF ticker never advances anything on its own
gsap.config({ force3D: false });       // "auto" switches to translate3d (a compositor layer) mid-tween and back
const tl = gsap.timeline({ paused: true });          // ONE master timeline, everything goes in it
tl.fromTo('#title', { opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: 0.8 }, 0.2);
tl.set({}, {}, VIDEO.duration);                      // optional: pad timeline to full length
window.renderFrame = (t) => { tl.seek(t); };         // block body: don't return the (thenable) timeline
```

Prefer `fromTo` (explicit start values) over `to`/`from`, and no callbacks (`onUpdate`, `tl.call`) — `seek()`
suppresses them by default and state must not depend on which frames ran before. Continuous things (particles, 3D
rotation, counters) are simplest as direct functions of `t` next to `tl.seek(t)`, as in `demo/index.html`.

## Fonts

`<link rel="stylesheet" href="…/fonts/fonts.css">` (relative to the page; or `/_render/fonts/fonts.css` from anywhere).

| CSS `font-family` | weights / axes | source |
|---|---|---|
| `'Noto Sans SC'` | variable 100–900 | `@fontsource-variable/noto-sans-sc` 5.3.0 (101 slices) + 15 gap slices from google/fonts `NotoSansSC[wght].ttf` 2.004 |
| `'Noto Serif SC'` | variable 200–900 | `@fontsource-variable/noto-serif-sc` 5.3.0 (101 slices) + 15 gap slices from `NotoSerifSC[wght].ttf` 2.003 |
| `'LXGW WenKai'` (霞鹜文楷) | 300, 400, 500 (no 700; bold requests get 500 + synthetic bold) | `@callmebill/lxgw-wenkai-web` 1.522 (cn-font-split, ~220 slices/weight) |
| `'Inter'` | variable 100–900 + `opsz` 14–32, normal + italic | `@fontsource-variable/inter` |
| `'JetBrains Mono'` | variable 100–800, normal + italic | `@fontsource-variable/jetbrains-mono` |
| `'Instrument Serif'` | 400 normal + italic | `@fontsource/instrument-serif` |
| `'Fraunces'` | variable wght 100–900, opsz 9–144, `SOFT`, `WONK`, normal + italic | `@fontsource-variable/fraunces` |

Recommended stacks are defined as CSS variables in `fonts.css`: `--font-zh-sans`, `--font-zh-serif`,
`--font-zh-kai` (`'LXGW WenKai', 'Noto Serif SC', serif`), `--font-latin-sans` (`'Inter', 'Noto Sans SC'`),
`--font-mono`, `--font-display` (`'Instrument Serif', 'Noto Serif SC'`), `--font-display-alt`.
For Chinese text put the CJK family **first**: in `'Inter', 'Noto Sans SC'` the shared punctuation `“”‘’…—·` would come
from Inter (half-width Latin glyphs). `fonts.css` also sets `:root { text-spacing-trim: space-all; }` (Gotchas #4).

**Coverage proof** — `node tests/check-fonts.mjs` loads every family/weight with *all 6,763 GB2312 hanzi*, 51 core
Chinese punctuation marks (`，。、；：？！“”‘’《》〈〉【】「」『』（）……——·～￥％…`) and the 187 GB2312 symbol-row
characters, with no CJK fallback in the stack, and asks Chromium which font rendered every glyph: **all PASS, 0 glyphs
from any other font**; additionally all 20,902 CJK Unified Ideographs U+4E00–9FA5 render from Noto Sans SC, Noto Serif
SC and LXGW WenKai. Two positive controls (an explicit `WenQuanYi Zen Hei` node and an Ext-B character) are correctly
reported as system fonts. Specimen screenshot: `tests/out/fonts-specimen.png`.

Rebuild: `npm install && pip install fonttools brotli && python3 scripts/build-cjk-gap-fonts.py && node scripts/setup-assets.mjs`
(downloads the two full Noto TTFs from raw.githubusercontent.com into `assets-src/`). Licenses: `fonts/LICENSES/` (all OFL-1.1).

## Vendor libraries (no CDN)

| library | file(s) | how to load |
|---|---|---|
| GSAP 3.15.0 (+ all plugins, free since 3.13) | `vendor/gsap/gsap.min.js`; plugins `vendor/gsap/DrawSVGPlugin.min.js`, `SplitText.min.js`, `MorphSVGPlugin.min.js`, `MotionPathPlugin.min.js`, `CustomEase.min.js`, `TextPlugin.min.js`, … | `<script src="../vendor/gsap/gsap.min.js">` → `window.gsap`; plugins: add the script, then `gsap.registerPlugin(DrawSVGPlugin)` |
| three.js r186 (ES modules only; no UMD build exists any more) | `vendor/three/three.module.js` (imports `./three.core.js`), addons in `vendor/three/addons/` | `<script type="importmap">{"imports":{"three":"../vendor/three/three.module.js","three/addons/":"../vendor/three/addons/"}}</script>` then `<script type="module">import * as THREE from 'three';` |
| rough.js 4.6.6 | `vendor/rough/rough.js` (IIFE → `window.rough`), `vendor/rough/rough.esm.js` | `<script src="../vendor/rough/rough.js">` |
| d3 7.9.0 | `vendor/d3/d3.min.js` (UMD → `window.d3`) | `<script src="../vendor/d3/d3.min.js">` |

## Pipeline

1. **Static server**: Node `http` on `127.0.0.1:<random port>`, root = `--root` or the page directory's parent (so
   `../fonts/fonts.css`, `../vendor/...` work from `demo/index.html`). The render directory is additionally mounted at
   `/_render/` (`/_render/fonts/fonts.css`, `/_render/vendor/gsap/gsap.min.js`) for pages living anywhere. Range
   requests, correct MIME types (woff2, mjs, wasm, glb, ...), 404s are logged.
2. **Chromium**: one `chromium-headless-shell` *process* per worker (independent renderer/GPU processes). Flags
   (`CHROME_ARGS` in `render.mjs`): `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`
   (WebGL 1/2 on the CPU, 4× MSAA), `--disable-gpu-compositing` (3× faster captures, Gotchas #1),
   `--font-render-hinting=none --disable-lcd-text --force-color-profile=srgb`, and deterministic-compositing flags
   `--run-all-compositor-stages-before-draw --disable-checker-imaging --disable-partial-raster
   --disable-threaded-animation --disable-new-content-rendering-timeout ...`.
3. **Probe**: worker 0 loads the page, reads `VIDEO`, runs the readiness/font checks (relaunching with the page's own
   viewport if it isn't 1920×1080).
4. **Chunks**: frames `[start, end)` are split into `--workers` contiguous ranges; frame `f` is rendered at
   `t = f / fps`. Each worker pipes CDP `Page.captureScreenshot` output (`optimizeForSpeed`, full-viewport `clip` with
   `scale = --scale`) into
   its own `ffmpeg -f image2pipe -framerate <fps> -c:v mjpeg|png -i - -c:v copy chunk_NNN.mov`.
5. **Verify + join**: `ffprobe -count_packets` must report exactly the expected frames per chunk; then
   `ffmpeg -f concat -i chunks.ffconcat` → BT.709 limited-range yuv420p (`zscale` spline36 for JPEG input, read as
   BT.601 full range with centre-sited chroma; swscale `accurate_rnd+full_chroma_int` for PNG) →
   `libx264 -preset medium -crf 18 -profile:v high -pix_fmt yuv420p -fps_mode cfr -r <fps>`, BT.709
   tags, `-t <frames/fps>`, `-movflags +faststart`, optional `-af apad -c:a aac -b:a 192k -ar 48000 -ac 2`.
6. **Final check**: output frame count must equal `round(duration*fps)` (or the `--start/--end` range) — else exit 1.

## Measured throughput

**Caveat: this container was shared.** Another job used ~3.6 of the 4 CPUs (load average 7–17) during every run,
so absolute numbers are roughly half of what an idle 4-core box gives (a trivial page — `tests/frame-index.html` —
captured at 54 fps with 4 workers; the bare Chromium screenshot floor is ~33 ms/frame per worker).

Capture throughput — `node tests/bench.mjs` (demo page extended to 12 s = 360 frames at 1920×1080):

| run | capture config | load | capture fps | screenshot ms/frame/worker | total s (360 f) |
|---|---|---|---|---|---|
| A | JPEG q92, 1 worker | 9.8 | **10.6** | 83 | 49.4 |
| B | JPEG q92, 2 workers | 11.1 | 17.0 | 101 | 37.7 |
| C | JPEG q92, 4 workers | 12.5 | **21.5** | 151 | 34.1 |
| F | JPEG q95, 4 workers | 15.6 | 22.0 | 146 | 34.8 |
| D | PNG, 1 worker | 13.0 | **6.4** | 142 | 81.4 |
| E | PNG, 4 workers | 14.3 | **14.4** | 234 | 51.5 |
| G | JPEG q92, 4 workers, `--fast-capture` (no clip path) | 15.6 | 31.8 | 98 | 29.3 |
| H | JPEG q92, 4 workers, `--intermediate x264` | 15.6 | 14.6 | 149 | 41.8 |
| I | JPEG q92, 4 workers, `--scale 0.5` draft | 17.5 | 26.6 | 111 | 22.5 |

Final encode (concat → BT.709 yuv420p → x264 medium crf 18), re-measured after fixing the colour conversion (load ≈ 7–10):
JPEG input via `zscale` **35.7 fps**; PNG input via swscale-accurate ~21 fps; 960×540 drafts ~95 fps.
The final demo (180 frames) renders in 18.0 s with 4 workers (startup 3.8 s, capture 23.2 fps, encode 29.4 fps)
vs 25.2 s with 1 worker (capture 11.3 fps); the 0.5 draft takes 11.9 s.

Quality — final MP4 vs the lossless PNG capture of the same 360 frames (RGB PSNR / SSIM):

| capture | capture itself vs lossless | final MP4 (crf 18) | intermediate size |
|---|---|---|---|
| JPEG q92 | 42.0 dB / 0.9901 | 40.3 dB / 0.9896 | 166 KB/frame |
| **JPEG q95 (default)** | 42.9 dB / 0.9916 | **40.8 dB / 0.9905** | 214 KB/frame |
| PNG | lossless | 42.1 dB / 0.9919 | 1,588 KB/frame |
| JPEG q92 with ffmpeg's *default* swscale conversion (before the fix) | — | 36.8 dB / 0.9894 | — |

**Default: JPEG q95.** Same capture speed as q92 (22.0 vs 21.5 fps), 1.5× faster capture and ~1.7× faster final
encode than PNG, intermediates 7.5× smaller (a 3-minute video ≈ 1.2 GB instead of 8.6 GB), and the final MP4 is only
1.3 dB PSNR below the PNG path — x264 at crf 18 dominates the loss either way, and the difference is not visible. Use
`--format png` for footage with large smooth gradients you want to protect from JPEG banding. Worker scaling was
sub-linear here (1→2→4 workers: 10.6→17.0→21.5 fps) because the 4 Chromium processes competed with the other job.
`--fast-capture` is ~1.5× faster per frame but gives up the history-independence (Gotchas #8). `--intermediate x264`
is slower because the workers then also run x264.

## Verification (tests/)

| script | proves |
|---|---|
| `node tests/check-fonts.mjs` | glyph-level font coverage via `CSS.getPlatformFontsForNode` (above); writes `tests/out/fonts-specimen.png` |
| `node tests/check-webgl.mjs` | WebGL2 via SwiftShader: unlit red plane is exactly (255,0,0) in the *captured* frame, lit three.js mesh drawn, `t` drives rotation, re-render is byte-identical |
| `node render.mjs --page tests/frame-index.html --out tmp/fi.mp4 --workers 4 && node tests/verify-frames.mjs tmp/fi.mp4 --count 120` | every decoded frame carries a 12-bit frame code: exact sequence 0..N-1 across all chunk boundaries (no dup/missing/reordered frames); colour patches within ±2/255 after RGB→BT.709 yuv420p→RGB. Also verified: `--start 1.5 --end 3.2 --workers 3` yields exactly codes 45..95, and a beep at 2.0 s in `--audio` lands at 0.500 s of that clip (sample-accurate offset); short audio is padded to the full length |
| `node tests/bench.mjs` | throughput/quality table above |

Determinism: `demo.mp4` rendered with 1 worker vs 4 workers — 90/180 captured frames byte-identical, the rest differ
only at **PSNR ≥ 66 dB** (sub-LSB noise where a blurred `text-shadow` halo overlaps strokes that animated earlier;
invisible). Without the clip capture path the headline glyphs differed by up to 0.44 px (Gotchas #8).

## Gotchas found while building this

1. **SwiftShader GPU compositing is the bottleneck.** With WebGL enabled via SwiftShader, Chromium also composites
   every frame through SwiftShader: ~105 ms per 1080p screenshot even for a trivial page. `--disable-gpu-compositing`
   (software compositor, WebGL still on SwiftShader) → ~33 ms. `--disable-frame-rate-limit` makes the GPU process
   spin and captures stall — don't use it.
2. **Google Fonts / fontsource CJK slices are incomplete.** The ~100 unicode-range slices of Noto Sans SC / Noto
   Serif SC contain only ~13.6k of the fonts' ~30.9k code points: 8,734 CJK Unified Ideographs are in *no* slice,
   including 33 GB2312 hanzi (劐阢坶塥蒈蓰猸弪艴骣桊轷戤赇牿犋毪胲脶膪憝铴镩稆瘭耠耢耥蟓筢蹯鲰齄) — those silently fell back to
   WenQuanYi. Fixed with 15 subsetted "gap" slices per family (`scripts/build-cjk-gap-fonts.py`, variable axis kept).
3. **`lxgw-wenkai-webfont` (font v1.250) reuses Google's slice ranges** → same 33 hanzi missing *and* `‘’`
   (U+2018/2019) in no slice. Switched to `@callmebill/lxgw-wenkai-web` v1.522 (cn-font-split covers every glyph).
   GitHub release downloads for lxgw/LxgwWenKai were blocked by the proxy in this environment; npm worked.
4. **Adjacent punctuation from different slices collapses.** Chromium's default `text-spacing-trim: normal` trims
   adjacent full-width punctuation using the font's GPOS data; when `，` and `。` live in different slice files, Noto
   Serif SC rendered `，。、` on top of each other. `fonts.css` sets `text-spacing-trim: space-all` (full-width
   punctuation per GB/T 15834), which renders identically for sliced and unsliced fonts.
5. **Unicode-range slices load lazily** — text that first appears at t = 4 s would trigger a font download *during*
   the capture and render in a fallback font. The renderer preloads exactly the needed slices (DOM text + a 13-point
   `renderFrame` scan + `VIDEO.preloadText`) and, per frame, forces layout and awaits `document.fonts.ready` if a
   load started anyway (counted as "mid-render font waits" in the summary).
6. **GSAP timelines are thenables.** `renderFrame = (t) => tl.seek(t)` returns the timeline; `await`ing it waits for
   a paused timeline to finish — forever. The renderer only awaits native `Promise`s; write `(t) => { tl.seek(t); }`.
7. **GSAP `force3D: "auto"`** uses `translate3d` while a tween runs and 2D at the end, changing layerization (and
   text rasterization) exactly when an element comes to rest. Use `force3D: false` (or `true` + `will-change`).
8. **Render-history dependence in Blink.** Text that was *rotated* (e.g. a per-character `rotation` tween) and sits at a
   fractional x position paints up to 0.5 px shifted afterwards depending on which frames were painted before
   (`drawTextBlob` at x=0 vs x=-0.44 in identical DOM; sub-pixel paint-offset accumulation for transformed layers). A
   chunk starting mid-video therefore did not match a sequential render. A screenshot with a full-viewport `clip`
   goes through Chromium's emulation path, which rebuilds paint properties from scratch → history-independent frames
   (costs ~1/3 of capture throughput: 21.5 vs 31.8 fps in the benchmark; `--fast-capture` turns it off).
   `will-change: transform` on rotated elements also avoids it.
   `--disable-partial-raster` removed a second (smaller) history effect in partially re-rastered tiles.
9. **Seeded randomness across workers.** rough.js shapes, three.js and any `Math.random()`-based layout differ per
   browser process unless seeded; a chunk boundary would then "jump". The renderer seeds `Math.random`; use rough.js
   `seed` and your own PRNG for per-frame noise.
10. **Intermediate container**: Matroska has 1 ms timestamps (33/34 ms at 30 fps); `.mov` keeps exact `1/fps` steps,
    so concat + CFR never duplicates/drops a frame. The intermediate is the captured JPEG/PNG bitstream itself
    (`-c:v copy`), so workers spend no CPU on encoding.
11. **Colour conversion**: Chromium captures sRGB; ffmpeg's default RGB→YUV matrix is BT.601, so the final encode
    converts to BT.709 and tags the stream `bt709/tv` (frame-index colour patches come back within ±2/255). The
    *default* swscale path for JPEG (yuvj420p, BT.601) → yuv420p (BT.709) re-samples chroma badly: 36.8 dB final PSNR.
    `zscale` (libzimg) gets 40.3 dB at 4× the speed of swscale's accurate mode; the renderer falls back to
    `flags=accurate_rnd+full_chroma_int+full_chroma_inp` if the ffmpeg build lacks zscale.
12. **`deviceScaleFactor` < 1 does not make drafts.** With a 0.5 DSF context, headless Chromium rendered at 960×540
    but `captureScreenshot` returned a blurry 2× upscale at 1920×1080; and every clipped capture's emulation restore
    silently reset `devicePixelRatio` to 1. Drafts therefore keep DSF 1 and use `clip.scale` (crisp, cheaper raster).
13. **parseArgs**: option values starting with `--` need `=` (`--chrome-flags=--foo`).
14. **WebGL `preserveDrawingBuffer: true`** prints "GPU stall due to ReadPixels" console warnings under SwiftShader;
    harmless (filtered unless `-v`). A three.js object scaled to ~0 still rasterises its edge lines as a 1 px speck —
    toggle `.visible` instead.
15. **Shared machine**: all numbers above were measured while another job used ~3.6 of the 4 cores; on an idle box
    expect roughly 2× higher capture rates.
