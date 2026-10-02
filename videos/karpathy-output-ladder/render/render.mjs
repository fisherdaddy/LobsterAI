#!/usr/bin/env node
/**
 * render.mjs -- frame-accurate HTML -> MP4 renderer (Playwright/Chromium + ffmpeg).
 *
 * Page contract (see README.md):
 *   window.VIDEO = { width, height, fps, duration, fonts?, preloadText?, seekCssAnimations? }
 *   window.renderFrame(t)      // required; puts DOM/SVG/canvas/WebGL into the state for time t (seconds); may return a Promise
 *   window.prepare()           // optional async hook, awaited once after load (preload assets, build scenes, ...)
 *
 * Usage:
 *   node render.mjs --page demo/index.html --out demo/demo.mp4 [--audio a.wav] [--workers 4]
 *                   [--start s] [--end s] [--scale 0.5] [--fps 30] [--format jpeg|png]
 *   node render.mjs --page demo/index.html --frames 0.5,3,5.5 [--out-dir demo/stills]
 */
import { parseArgs } from 'node:util';
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';

const execFileP = promisify(execFile);
// Captured frame -> BT.709 limited-range yuv420p. Measured against the lossless capture (PSNR, before x264):
//   JPEG: swscale default 36.9 dB @ 89 fps | swscale accurate 41.0 dB @ 18 fps | zscale spline36 40.7 dB @ 110 fps
//   PNG:  swscale accurate 43.7 dB @ 52 fps | zscale 43.2 dB @ 48 fps
const SWS = 'flags=lanczos+accurate_rnd+full_chroma_int+full_chroma_inp';
function yuvChain(format, w, h, hasZscale) {
  if (format === 'jpeg' && hasZscale) {
    // JPEG = BT.601 full range, centre-sited 4:2:0 chroma -> BT.709 limited, left-sited (H.264 default)
    return `zscale=w=${w}:h=${h}:filter=spline36:matrixin=470bg:rangein=full:chromalin=center:matrix=709:range=limited:chromal=left,format=yuv420p`;
  }
  return `scale=${w}:${h}:${SWS}:out_color_matrix=bt709:out_range=tv${format === 'jpeg' ? ':in_color_matrix=bt601:in_range=pc' : ''},format=yuv420p`;
}
let zscaleCache;
async function hasZscale() {
  if (zscaleCache === undefined) {
    try { const { stdout } = await execFileP('ffmpeg', ['-hide_banner', '-filters']); zscaleCache = /\szscale\s/.test(stdout); } catch { zscaleCache = false; }
  }
  return zscaleCache;
}
const RENDER_DIR = path.dirname(fileURLToPath(import.meta.url));
const IS_TTY = process.stderr.isTTY;

const HELP = `
render.mjs -- frame-accurate HTML -> MP4 renderer

  node render.mjs --page <index.html> --out <out.mp4> [options]
  node render.mjs --page <index.html> --frames 0.5,3,5.5 [--out-dir <dir>]

Options
  --page <path|url>     HTML page implementing the page contract (window.VIDEO + window.renderFrame(t))
  --out <file.mp4>      output video (H.264 High, yuv420p, CFR, crf 18, +faststart)
  --audio <file>        audio to mux (AAC 192k, 48 kHz stereo); padded/trimmed to the video length
  --workers <n>         parallel browser processes, each rendering one contiguous chunk (default ${defaultWorkers()})
  --start <s> --end <s> render only [start, end) seconds (quick previews; audio is offset to match)
  --scale <f>           capture scale in (0,1], e.g. 0.5 renders a 960x540 draft with identical layout (default 1)
  --fps <n>             override VIDEO.fps
  --duration <s>        override VIDEO.duration
  --format jpeg|png     frame capture format (default jpeg)
  --quality <n>         JPEG quality (default 95)
  --frames <t1,t2,...>  stills mode: save PNGs at the given times (plus a font-fallback audit) instead of a video
  --out-dir <dir>       stills output folder (default <page dir>/stills)
  --root <dir>          static server root (default: parent of the page's directory); render dir is also at /_render/
  --crf <n>             final x264 CRF (default 18)            --preset <p>  final x264 preset (default medium)
  --intermediate copy|x264  chunk files: copy = captured JPEG/PNG stream as-is (default), x264 = crf 12 H.264
  --audit-fonts         also run the platform-font audit (fallback-font detection) before rendering
  --allow-system-fonts  do not fail when a font-family has no @font-face (system font)
  --ignore-page-errors  keep rendering when the page throws uncaught errors
  --no-seed-random      do not replace Math.random with a seeded PRNG
  --browser shell|chromium  chromium-headless-shell (default) or full chromium in new headless mode
  --chrome-flags=<f>    extra Chromium flags, space separated (use "=": --chrome-flags="--foo --bar")
  --frame-timeout <s>   per-frame timeout (default 60)       --load-timeout <s>  page load timeout (default 120)
  --fast-capture        skip the history-independent capture path (~1.5x faster capture; text that was rotated
                        may then differ by <=0.5px between a chunked and a sequential render)
  --keep-temp           keep intermediate chunk files         -v, --verbose
`;

function defaultWorkers() { return Math.max(1, Math.min(os.cpus().length, 4)); }

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------
function parseCli(argv) {
  let parsed;
  try { parsed = parseArgs({
    args: argv,
    strict: true,
    options: {
      page: { type: 'string' }, out: { type: 'string' }, audio: { type: 'string' },
      workers: { type: 'string' }, start: { type: 'string' }, end: { type: 'string' },
      scale: { type: 'string' }, fps: { type: 'string' }, duration: { type: 'string' },
      format: { type: 'string' }, quality: { type: 'string' },
      frames: { type: 'string' }, 'out-dir': { type: 'string' }, root: { type: 'string' },
      crf: { type: 'string' }, preset: { type: 'string' }, intermediate: { type: 'string' },
      'audit-fonts': { type: 'boolean' }, 'allow-system-fonts': { type: 'boolean' },
      'ignore-page-errors': { type: 'boolean' }, 'no-seed-random': { type: 'boolean' },
      browser: { type: 'string' }, 'frame-timeout': { type: 'string' }, 'load-timeout': { type: 'string' },
      'keep-temp': { type: 'boolean' }, 'fast-capture': { type: 'boolean' }, 'chrome-flags': { type: 'string' },
      verbose: { type: 'boolean', short: 'v' }, help: { type: 'boolean', short: 'h' },
    },
  }); } catch (e) { die(`${e.message}\n(see --help; option values starting with "-" need "=", e.g. --chrome-flags=--foo)`); }
  const { values } = parsed;
  if (values.help) { console.log(HELP); process.exit(0); }
  const num = (k, d) => {
    if (values[k] === undefined) return d;
    const n = Number(values[k]);
    if (!Number.isFinite(n)) die(`--${k} must be a number, got "${values[k]}"`);
    return n;
  };
  const o = {
    page: values.page, out: values.out, audio: values.audio,
    workers: Math.max(1, Math.floor(num('workers', defaultWorkers()))),
    start: num('start', undefined), end: num('end', undefined),
    scale: num('scale', 1), fps: num('fps', undefined), duration: num('duration', undefined),
    format: (values.format || 'jpeg').toLowerCase(), quality: Math.round(num('quality', 95)),
    frames: values.frames ? values.frames.split(',').map((s) => s.trim()).filter(Boolean).map(Number) : null,
    outDir: values['out-dir'], root: values.root,
    crf: num('crf', 18), preset: values.preset || 'medium', intermediate: values.intermediate || 'copy',
    auditFonts: !!values['audit-fonts'], allowSystemFonts: !!values['allow-system-fonts'],
    ignorePageErrors: !!values['ignore-page-errors'], seedRandom: !values['no-seed-random'],
    browser: values.browser || 'shell',
    frameTimeout: num('frame-timeout', 60) * 1000, loadTimeout: num('load-timeout', 120) * 1000,
    keepTemp: !!values['keep-temp'], fastCapture: !!values['fast-capture'], verbose: !!values.verbose,
    chromeFlags: (values['chrome-flags'] || '').split(/\s+/).filter(Boolean),
  };
  if (!o.page) die('--page is required (see --help)');
  if (!o.frames && !o.out) die('--out is required unless --frames is used');
  if (o.format === 'jpg') o.format = 'jpeg';
  if (!['jpeg', 'png'].includes(o.format)) die('--format must be jpeg or png');
  if (!['copy', 'x264'].includes(o.intermediate)) die('--intermediate must be copy or x264');
  if (!['shell', 'chromium'].includes(o.browser)) die('--browser must be shell or chromium');
  if (o.frames && o.frames.some((t) => !Number.isFinite(t) || t < 0)) die('--frames must be a comma-separated list of non-negative seconds');
  if (!(o.scale > 0 && o.scale <= 1)) die('--scale must be in (0, 1] (drafts; finals use 1)');
  if (o.audio && !fs.existsSync(o.audio)) die(`--audio file not found: ${o.audio}`);
  return o;
}

function die(msg, code = 2) { console.error(`[render] ERROR: ${msg}`); process.exit(code); }
const log = (...a) => console.error('[render]', ...a);
const fmtS = (ms) => `${(ms / 1000).toFixed(1)}s`;

// ---------------------------------------------------------------------------------------------
// Playwright loading (local node_modules -> NODE_PATH -> known global install)
// ---------------------------------------------------------------------------------------------
async function loadPlaywright() {
  const tries = [
    () => import('playwright'),
    () => createRequire(import.meta.url)('playwright'),
    () => import('/opt/node22/lib/node_modules/playwright/index.mjs'),
  ];
  if (process.env.PLAYWRIGHT_MODULE) tries.unshift(() => import(process.env.PLAYWRIGHT_MODULE));
  for (const t of tries) {
    try { const m = await t(); const pw = m.chromium ? m : m.default; if (pw?.chromium) return pw; } catch { /* next */ }
  }
  die('cannot load playwright (npm i playwright, set NODE_PATH, or PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs)');
}

// Flags: WebGL on CPU via ANGLE+SwiftShader, deterministic compositing, grayscale AA text.
// --disable-gpu-compositing matters a lot: without it Chromium composites every frame through
// SwiftShader (~105 ms/screenshot at 1080p); software compositing is ~3x faster (~33 ms) and
// WebGL canvases still render via SwiftShader.
const CHROME_ARGS = [
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl',
  '--disable-gpu-compositing',
  '--font-render-hinting=none', '--disable-lcd-text', '--force-color-profile=srgb',
  '--hide-scrollbars', '--mute-audio', '--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
  '--run-all-compositor-stages-before-draw', '--disable-checker-imaging', '--disable-image-animation-resync',
  '--disable-partial-raster', // re-raster whole tiles: removes history-dependent blending in partially re-rastered tiles
  '--disable-threaded-animation', '--disable-threaded-scrolling', '--disable-new-content-rendering-timeout',
  '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check',
];

// ---------------------------------------------------------------------------------------------
// Tiny static server (127.0.0.1, random port). Root = --root or parent of the page dir.
// The render directory itself is mounted at /_render/ so pages anywhere can use
// /_render/fonts/fonts.css and /_render/vendor/... regardless of the root.
// ---------------------------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.map': 'application/json', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
  '.hdr': 'application/octet-stream', '.bin': 'application/octet-stream', '.wasm': 'application/wasm',
  '.csv': 'text/csv; charset=utf-8', '.xml': 'application/xml',
};

function startServer(root, verbose) {
  const mounts = [['/_render/', RENDER_DIR], ['/', root]];
  const notFound = [];
  const server = http.createServer(async (req, res) => {
    let rel;
    try {
      const u = new URL(req.url, 'http://localhost');
      rel = decodeURIComponent(u.pathname);
      if (rel === '/favicon.ico') { res.writeHead(204); return res.end(); }
      const [prefix, base] = mounts.find(([p]) => rel.startsWith(p));
      let file = path.resolve(base, '.' + rel.slice(prefix.length - 1));
      if (file !== base && !file.startsWith(base + path.sep)) { res.writeHead(403); return res.end(); }
      let st = await fsp.stat(file);
      if (st.isDirectory()) { file = path.join(file, 'index.html'); st = await fsp.stat(file); }
      const headers = {
        'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*', 'Accept-Ranges': 'bytes',
      };
      let start = 0; let end = st.size - 1; let status = 200;
      const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
      if (m) {
        if (m[1] === '') { start = Math.max(0, st.size - Number(m[2])); } else { start = Number(m[1]); if (m[2] !== '') end = Math.min(end, Number(m[2])); }
        if (start > end) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end(); }
        status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${st.size}`;
      }
      headers['Content-Length'] = end - start + 1;
      res.writeHead(status, headers);
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file, { start, end }).pipe(res);
    } catch {
      if (!notFound.includes(rel)) { notFound.push(rel); if (verbose || !/\.map$/.test(rel || '')) log(`WARN 404 ${rel}`); }
      res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found');
    }
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, notFound }));
  });
}

// ---------------------------------------------------------------------------------------------
// In-page functions (serialized by Playwright and executed in the page's main world)
// ---------------------------------------------------------------------------------------------

// Installed before any page script: seeded Math.random (identical in every worker) + renderer flag.
function initScript({ seedRandom, scale }) {
  window.__RENDERER__ = { active: true, scale };
  if (seedRandom) {
    let s = 0x9e3779b9 >>> 0; // mulberry32
    Math.random = function random() {
      s = (s + 0x6d2b79f5) >>> 0; let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
}

// Called once after load + prepare(): preload exactly the font slices the page's text needs,
// verify fonts loaded (fail loudly), decode all images.
async function pageReady({ allowSystemFonts, sampleTimes = [] }) {
  const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif',
    'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'emoji', 'math', 'fangsong', '-apple-system', 'blinkmacsystemfont',
    'inherit', 'initial', 'unset']);
  const errors = []; const warnings = [];
  const splitFamilies = (s) => (s.match(/"[^"]*"|'[^']*'|[^,]+/g) || []).map((x) => x.trim().replace(/^["']|["']$/g, '').trim()).filter(Boolean);
  const parseRange = (s) => {
    if (!s) return [[0, 0x10ffff]];
    return s.split(',').map((x) => x.trim().replace(/^u\+/i, '')).filter(Boolean).map((x) => {
      if (x.includes('?')) return [parseInt(x.replace(/\?/g, '0'), 16), parseInt(x.replace(/\?/g, 'f'), 16)];
      const [a, b] = x.split('-'); return [parseInt(a, 16), parseInt(b ?? a, 16)];
    }).sort((p, q) => p[0] - q[0]);
  };
  const inRanges = (ranges, cp) => {
    let lo = 0; let hi = ranges.length - 1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (cp < ranges[mid][0]) hi = mid - 1; else if (cp > ranges[mid][1]) lo = mid + 1; else return true; }
    return false;
  };
  const VIDEO = window.VIDEO || {};
  await document.fonts.ready;

  // 1) text per font stack (text nodes -> parent computed font-family), incl. SVG <text>.
  const stackText = new Map();
  const add = (stack, txt) => stackText.set(stack, (stackText.get(stack) || '') + txt);
  const collect = () => {
    const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const n = walker.currentNode; const el = n.parentElement;
      if (!el || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|TITLE)$/i.test(el.tagName) || !n.nodeValue.trim()) continue;
      add(getComputedStyle(el).fontFamily, n.nodeValue);
    }
  };
  collect();
  // warm-up scan: text that renderFrame(t) creates later (counters, subtitles, labels) is collected too
  for (const t of sampleTimes) {
    const r = window.renderFrame(t);
    if (r instanceof Promise) await r; // only native Promises: GSAP timelines are thenables that never settle when paused
    collect();
  }
  // text that only appears later (subtitle cues, canvas text): loaded for every family in use, but not used for
  // the per-stack coverage warnings below (it does not belong to any particular stack)
  const extraCps = new Set(Array.from(String(VIDEO.preloadText || ''), (c) => c.codePointAt(0)));

  // 2) faces by family
  const faces = [...document.fonts];
  const byFamily = new Map();
  for (const f of faces) {
    const fam = f.family.replace(/^["']|["']$/g, '').toLowerCase();
    if (!byFamily.has(fam)) byFamily.set(fam, []);
    byFamily.get(fam).push({ face: f, ranges: parseRange(f.unicodeRange) });
  }

  // 3) decide which faces to load; detect undeclared families and uncovered chars
  const toLoad = new Set(); const familyChars = new Map(); const uncovered = new Map();
  const addChars = (key, cps) => { if (!familyChars.has(key)) familyChars.set(key, new Set()); for (const cp of cps) familyChars.get(key).add(cp); };
  for (const fam of VIDEO.fonts || []) { // families used outside the DOM (e.g. canvas fillText)
    if (!byFamily.has(fam.toLowerCase())) errors.push(`VIDEO.fonts lists "${fam}" but there is no @font-face for it`);
    else addChars(fam.toLowerCase(), Array.from('AaBbCc0123456789', (c) => c.codePointAt(0)));
  }
  for (const [stack, txt] of stackText) {
    const fams = splitFamilies(stack);
    const declared = fams.filter((f) => byFamily.has(f.toLowerCase()));
    const first = fams[0];
    if (first && !GENERIC.has(first.toLowerCase()) && !byFamily.has(first.toLowerCase())) {
      (allowSystemFonts ? warnings : errors).push(`font-family "${first}" (stack: ${stack}) has no @font-face -> system font fallback`);
    }
    const cps = new Set(Array.from(txt, (c) => c.codePointAt(0)));
    for (const fam of declared) addChars(fam.toLowerCase(), cps);
    for (const cp of cps) {
      if (cp <= 0x20 || (cp >= 0x200b && cp <= 0x200f) || cp === 0xfeff || cp === 0xa0 || cp === 0x3000) continue;
      const covered = declared.some((fam) => byFamily.get(fam.toLowerCase()).some((e) => inRanges(e.ranges, cp)));
      if (!covered && declared.length) {
        if (!uncovered.has(stack)) uncovered.set(stack, new Set());
        uncovered.get(stack).add(String.fromCodePoint(cp));
      }
    }
  }
  for (const key of familyChars.keys()) addChars(key, extraCps);
  for (const [fam, cps] of familyChars) {
    for (const e of byFamily.get(fam)) {
      for (const cp of cps) { if (inRanges(e.ranges, cp)) { toLoad.add(e.face); break; } }
    }
  }
  for (const [stack, set] of uncovered) {
    warnings.push(`${set.size} char(s) not covered by any @font-face in stack ${stack}: "${[...set].slice(0, 40).join('')}" -> system fallback`);
  }

  const t0 = performance.now();
  await Promise.allSettled([...toLoad].map((f) => f.load()));
  await document.fonts.ready;
  const fontLoadMs = performance.now() - t0;

  // 4) fail loudly on broken faces + document.fonts.check() per family/weight/style on the chars it must render
  for (const f of faces) {
    if (f.status === 'error') errors.push(`font file failed to load: ${f.family} ${f.weight} ${f.style} [${f.unicodeRange.slice(0, 32)}...]`);
  }
  const checked = [];
  for (const [fam, cps] of familyChars) {
    const entries = byFamily.get(fam);
    const variants = new Map();
    for (const e of entries) variants.set(`${e.face.style}|${e.face.weight}`, e);
    for (const e of variants.values()) {
      const sample = [...cps].filter((cp) => entries.some((x) => inRanges(x.ranges, cp))).map((cp) => String.fromCodePoint(cp)).join('');
      if (!sample) continue;
      const w = String(e.face.weight).split(' ')[0];
      const spec = `${e.face.style === 'normal' ? '' : e.face.style + ' '}${w} 16px "${e.face.family.replace(/^["']|["']$/g, '')}"`;
      const ok = document.fonts.check(spec, sample);
      checked.push(`${spec}:${ok ? 'ok' : 'FAIL'}`);
      if (!ok) errors.push(`document.fonts.check('${spec}') is false for the page text -> font not ready`);
    }
  }

  // 5) images
  const imgs = [...document.images];
  await Promise.all(imgs.map((img) => img.decode().catch(() => {
    if (img.getAttribute('src')) errors.push(`image failed to decode: ${img.currentSrc || img.src}`);
  })));

  return {
    errors, warnings, checked, fontLoadMs: Math.round(fontLoadMs), facesLoaded: toLoad.size, facesDeclared: faces.length,
    families: [...familyChars.keys()], images: imgs.length,
  };
}

// Executed for every frame.
async function pageFrame([t, seekCss]) {
  const r = window.renderFrame(t);
  // await only native Promises: e.g. `renderFrame = (t) => tl.seek(t)` returns a GSAP timeline, which is a
  // thenable that resolves on completion -- a paused timeline would never resolve
  if (r instanceof Promise) await r;
  if (seekCss && document.getAnimations) {
    // CSS animations / WAAPI become deterministic: seek them to t (they are treated as starting at t=0)
    for (const a of document.getAnimations()) {
      try {
        if (typeof CSSTransition !== 'undefined' && a instanceof CSSTransition) a.finish();
        else { a.pause(); a.currentTime = t * 1000; }
      } catch { /* ignore */ }
    }
  }
  document.documentElement.getBoundingClientRect(); // flush style+layout -> starts lazy font-slice loads now
  let waited = 0;
  if (document.fonts.status === 'loading') { waited |= 1; await document.fonts.ready; }
  const pending = [];
  for (const img of document.images) if (!img.complete) pending.push(img.decode().catch(() => {}));
  if (pending.length) { waited |= 2; await Promise.all(pending); }
  return waited;
}

// ---------------------------------------------------------------------------------------------
// Browser worker
// ---------------------------------------------------------------------------------------------
class Worker {
  constructor(id, ctx) { this.id = id; this.ctx = ctx; this.pageErrors = []; this.stats = { evalMs: 0, shotMs: 0, writeMs: 0, frames: 0, fontWaits: 0 }; }

  async open(viewport) {
    const { pw, url, opts } = this.ctx;
    this.viewport = viewport;
    const tag = `[w${this.id}]`;
    this.browser = await pw.chromium.launch({
      headless: true, args: [...CHROME_ARGS, ...opts.chromeFlags], ...(opts.browser === 'chromium' ? { channel: 'chromium' } : {}),
    });
    // DSF stays 1: drafts are scaled by the capture (clip.scale). A context DSF < 1 makes headless Chromium return an
    // upscaled (blurry) full-size image, and the clip path's emulation restore would reset DSF to 1 anyway.
    this.context = await this.browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: 'light', reducedMotion: 'no-preference' });
    await this.context.addInitScript(initScript, { seedRandom: opts.seedRandom, scale: opts.scale });
    this.page = await this.context.newPage();
    this.page.on('pageerror', (e) => { this.pageErrors.push(e); log(`${tag} PAGE ERROR: ${e.stack || e.message}`); });
    this.page.on('console', (m) => {
      // SwiftShader perf chatter ("GPU stall due to ReadPixels") is expected with preserveDrawingBuffer
      if (!opts.verbose && /GL Driver Message|GPU stall due to ReadPixels/.test(m.text())) return;
      if (m.type() === 'error' || m.type() === 'warning' || opts.verbose) log(`${tag} console.${m.type()}: ${m.text()}`);
    });
    this.page.on('requestfailed', (r) => log(`${tag} WARN request failed: ${r.url()} (${r.failure()?.errorText})`));
    const resp = await this.page.goto(url, { waitUntil: 'load', timeout: opts.loadTimeout });
    if (resp && !resp.ok()) throw new Error(`page load failed: HTTP ${resp.status()} ${url}`);
    await this.page.waitForFunction(() => typeof window.renderFrame === 'function' && window.VIDEO, null, { timeout: opts.loadTimeout })
      .catch(() => { throw new Error('page never defined window.VIDEO and window.renderFrame(t)'); });
    this.video = await this.page.evaluate(() => JSON.parse(JSON.stringify(window.VIDEO)));
    // fonts for the initial DOM first (prepare() may measure text), then prepare(), then again for anything
    // prepare() added + the loud checks (only the second report counts)
    const first = await this.page.evaluate(pageReady, { allowSystemFonts: true });
    const prep = performance.now();
    await this.page.evaluate(async () => { if (typeof window.prepare === 'function') await window.prepare(); });
    this.prepareMs = performance.now() - prep;
    const dur = opts.duration ?? Number(this.video.duration);
    const sampleTimes = dur > 0 ? Array.from({ length: 13 }, (_, i) => (dur * i) / 12 - (i === 12 ? 1e-3 : 0)) : [];
    this.ready = await this.page.evaluate(pageReady, { allowSystemFonts: opts.allowSystemFonts, sampleTimes });
    this.ready.fontLoadMs += first.fontLoadMs;
    this.cdp = await this.context.newCDPSession(this.page);
    this.checkErrors();
    return this;
  }

  checkErrors() {
    if (this.pageErrors.length && !this.ctx.opts.ignorePageErrors) {
      throw new Error(`uncaught page error in worker ${this.id}: ${this.pageErrors[0].message} (use --ignore-page-errors to continue)`);
    }
  }

  async seek(t) {
    const { opts } = this.ctx;
    const seekCss = this.video.seekCssAnimations !== false;
    let timer;
    const timeout = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`renderFrame(${t}) did not settle within ${opts.frameTimeout / 1000}s`)), opts.frameTimeout); });
    try {
      const waited = await Promise.race([this.page.evaluate(pageFrame, [t, seekCss]), timeout]);
      if (waited & 1) { this.stats.fontWaits++; if (opts.verbose) log(`[w${this.id}] t=${t.toFixed(3)} waited for a font slice to load (consider VIDEO.preloadText)`); }
    } finally { clearTimeout(timer); }
    this.checkErrors();
  }

  async capture(format, quality) {
    const params = { format, optimizeForSpeed: true, captureBeyondViewport: false, fromSurface: true };
    if (format === 'jpeg') params.quality = quality;
    // A full-viewport `clip` routes the capture through Chromium's emulation path, which rebuilds paint
    // properties from scratch. Without it, Blink's sub-pixel paint-offset handling of elements whose transform
    // was recently rotated/scaled depends on render HISTORY (text can paint up to 0.5px shifted), so a worker
    // that starts mid-video would not match a sequential render. Costs ~1/3 of capture throughput (benchmark:
    // 21.5 vs 31.8 fps with 4 workers); disable with --fast-capture.
    // clip.scale also renders --scale drafts natively at the smaller size (crisp, cheaper raster).
    const { scale, fastCapture } = this.ctx.opts;
    if (!fastCapture || scale !== 1) params.clip = { x: 0, y: 0, width: this.viewport.width, height: this.viewport.height, scale };
    const { data } = await this.cdp.send('Page.captureScreenshot', params);
    return Buffer.from(data, 'base64');
  }

  async close() { try { await this.browser?.close(); } catch { /* ignore */ } }
}

// ---------------------------------------------------------------------------------------------
// ffmpeg helpers
// ---------------------------------------------------------------------------------------------
const children = new Set();
function runFfmpeg(args, { stdin = false, onStdout } = {}) {
  const proc = spawn('ffmpeg', args, { stdio: [stdin ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
  children.add(proc);
  let stderr = '';
  proc.stderr.on('data', (d) => { stderr += d; if (stderr.length > 200000) stderr = stderr.slice(-100000); });
  proc.stdout.on('data', (d) => onStdout?.(d.toString()));
  if (stdin) proc.stdin.on('error', () => { /* EPIPE surfaces via exit code */ });
  const done = new Promise((resolve, reject) => {
    proc.on('error', reject);
    proc.on('close', (code, sig) => {
      children.delete(proc);
      if (code === 0) resolve(stderr);
      else reject(new Error(`ffmpeg failed (${code ?? sig}): ffmpeg ${args.join(' ')}\n${stderr.slice(-4000)}`));
    });
  });
  return { proc, done };
}

async function ffprobeJson(file, extra = []) {
  const { stdout } = await execFileP('ffprobe', ['-v', 'error', ...extra, '-of', 'json', file], { maxBuffer: 64 << 20 });
  return JSON.parse(stdout);
}

async function countVideoPackets(file) {
  const j = await ffprobeJson(file, ['-count_packets', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_packets']);
  return Number(j.streams?.[0]?.nb_read_packets ?? -1);
}

// ---------------------------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------------------------
function makeProgress(total, label) {
  const p = { done: 0, total, t0: performance.now(), lastPrint: 0, lastPct: -1 };
  p.tick = (force = false) => {
    const now = performance.now();
    const el = now - p.t0; const fps = p.done / Math.max(el / 1000, 1e-6);
    const eta = fps > 0 ? (p.total - p.done) / fps : 0;
    const pct = Math.floor((p.done / p.total) * 100);
    const line = `${label} ${p.done}/${p.total} frames (${pct}%)  ${fps.toFixed(1)} fps  elapsed ${fmtS(el)}  ETA ${eta.toFixed(1)}s`;
    if (IS_TTY) { if (force || now - p.lastPrint > 250) { process.stderr.write(`\r[render] ${line}   `); p.lastPrint = now; } if (force) process.stderr.write('\n'); }
    else if (force || (pct >= p.lastPct + 10) || now - p.lastPrint > 5000) { log(line); p.lastPrint = now; p.lastPct = Math.floor(pct / 10) * 10; }
  };
  return p;
}

// ---------------------------------------------------------------------------------------------
// Font audit via CDP: which platform fonts actually render each text node (detects fallback fonts)
// ---------------------------------------------------------------------------------------------
async function auditFonts(cdp) {
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
  const targets = [];
  const walk = (n) => {
    if (n.nodeType === 1 && /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|HEAD|TITLE)$/i.test(n.nodeName)) return;
    const txt = (n.children || []).filter((c) => c.nodeType === 3).map((c) => c.nodeValue).join('');
    if (n.nodeType === 1 && txt.trim()) targets.push({ nodeId: n.nodeId, name: n.localName, cls: (n.attributes || []).join(' ').match(/class (\S+)/)?.[1], txt: txt.trim() });
    for (const c of n.children || []) walk(c);
    if (n.contentDocument) walk(n.contentDocument);
    for (const s of n.shadowRoots || []) walk(s);
  };
  walk(root);
  const usage = new Map(); const fallbacks = [];
  for (const tgt of targets) {
    let fonts;
    try { ({ fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId: tgt.nodeId })); } catch { continue; }
    for (const f of fonts) {
      const k = `${f.familyName}${f.isCustomFont ? '' : ' (SYSTEM)'}`;
      usage.set(k, (usage.get(k) || 0) + f.glyphCount);
      if (!f.isCustomFont) fallbacks.push({ family: f.familyName, glyphs: f.glyphCount, node: `${tgt.name}${tgt.cls ? '.' + tgt.cls : ''}`, text: tgt.txt.slice(0, 40) });
    }
  }
  await cdp.send('CSS.disable').catch(() => {}); await cdp.send('DOM.disable').catch(() => {});
  return { usage: Object.fromEntries(usage), fallbacks, nodes: targets.length };
}

function printAudit(label, audit) {
  const fams = Object.entries(audit.usage).map(([k, v]) => `${k}=${v}`).join(', ');
  log(`font audit ${label}: ${audit.nodes} text nodes; glyphs per font: ${fams || '(none)'}`);
  for (const f of audit.fallbacks) log(`  WARN fallback font "${f.family}" rendered ${f.glyphs} glyph(s) in <${f.node}> "${f.text}"`);
}

// ---------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------
async function main() {
  const T0 = performance.now();
  const opts = parseCli(process.argv.slice(2));
  const pw = await loadPlaywright();

  // page URL / server
  let url; let server = null;
  if (/^https?:\/\//i.test(opts.page)) {
    url = opts.page;
  } else {
    let pagePath = opts.page; let query = '';
    if (!fs.existsSync(pagePath) && pagePath.includes('?')) { query = pagePath.slice(pagePath.indexOf('?')); pagePath = pagePath.slice(0, pagePath.indexOf('?')); }
    const pageAbs = path.resolve(pagePath);
    if (!fs.existsSync(pageAbs)) die(`page not found: ${pageAbs}`);
    const root = path.resolve(opts.root || path.dirname(path.dirname(pageAbs)));
    const rel = path.relative(root, pageAbs);
    if (rel.startsWith('..') || path.isAbsolute(rel)) die(`page ${pageAbs} is outside --root ${root}`);
    server = await startServer(root, opts.verbose);
    url = `http://127.0.0.1:${server.port}/${rel.split(path.sep).map(encodeURIComponent).join('/')}${query}`;
    log(`serving ${root} at http://127.0.0.1:${server.port}/ (render dir at /_render/)`);
  }

  const workers = [];
  const cleanup = async () => {
    for (const c of children) { try { c.kill('SIGKILL'); } catch { /* ignore */ } }
    await Promise.all(workers.map((w) => w.close()));
    server?.server.close();
  };
  process.on('SIGINT', async () => { log('interrupted'); await cleanup(); process.exit(130); });

  try {
    // ---- probe (becomes worker 0) ----
    const ctx = { pw, url, opts };
    let w0 = new Worker(0, ctx);
    workers.push(w0);
    await w0.open({ width: 1920, height: 1080 });
    const v = w0.video;
    const width = Math.round(Number(v.width) || 1920); const height = Math.round(Number(v.height) || 1080);
    if (width !== 1920 || height !== 1080) { // relaunch with the page's own size so layout-at-init is right
      await w0.close(); workers.length = 0; w0 = new Worker(0, ctx); workers.push(w0); await w0.open({ width, height });
    }
    const fps = opts.fps ?? Number(v.fps ?? 30);
    const duration = opts.duration ?? Number(v.duration);
    if (!(fps > 0)) die(`invalid fps ${fps}`);
    if (!(duration > 0) && !opts.frames) die('VIDEO.duration must be > 0 (or pass --duration)');
    const viewport = { width, height };
    const r = w0.ready;
    log(`page ${width}x${height} @${fps}fps, ${duration}s | scale ${opts.scale} | fonts: ${r.facesLoaded}/${r.facesDeclared} faces preloaded in ${r.fontLoadMs}ms for [${r.families.join(', ')}] | ${r.images} img | prepare ${Math.round(w0.prepareMs)}ms`);
    if (opts.verbose) log(`fonts.check: ${r.checked.join('  ')}`);
    for (const wmsg of r.warnings) log(`WARN ${wmsg}`);
    if (r.errors.length) {
      for (const e of r.errors) log(`FONT/ASSET ERROR: ${e}`);
      throw new Error(`${r.errors.length} font/asset error(s) -- refusing to render (see above)`);
    }
    const gl = await w0.page.evaluate(() => {
      const c = document.createElement('canvas'); const g = c.getContext('webgl2') || c.getContext('webgl');
      if (!g) return null; const ext = g.getExtension('WEBGL_debug_renderer_info');
      return ext ? g.getParameter(ext.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER);
    });
    if (opts.verbose) log(`WebGL: ${gl || 'UNAVAILABLE'}`);

    // ---- stills mode ----
    if (opts.frames) {
      const outDir = path.resolve(opts.outDir || path.join(path.dirname(path.resolve(opts.page.split('?')[0])), 'stills'));
      await fsp.mkdir(outDir, { recursive: true });
      for (const t of opts.frames) {
        await w0.seek(t);
        const png = await w0.capture('png');
        const file = path.join(outDir, `frame_${t.toFixed(3)}s.png`);
        await fsp.writeFile(file, png);
        printAudit(`t=${t}`, await auditFonts(w0.cdp));
        log(`wrote ${file}`);
      }
      log(`done in ${fmtS(performance.now() - T0)}`);
      return;
    }

    // ---- frame range & chunks ----
    const totalFrames = Math.round(duration * fps);
    const startF = opts.start != null ? Math.max(0, Math.round(opts.start * fps)) : 0;
    const endF = opts.end != null ? Math.min(totalFrames, Math.round(opts.end * fps)) : totalFrames;
    if (!(endF > startF)) die(`empty frame range [${startF}, ${endF}) (duration ${duration}s @ ${fps}fps = ${totalFrames} frames)`);
    const nFrames = endF - startF;
    const nWorkers = Math.min(opts.workers, nFrames);
    const chunks = [];
    for (let i = 0; i < nWorkers; i++) {
      const a = startF + Math.floor((nFrames * i) / nWorkers); const b = startF + Math.floor((nFrames * (i + 1)) / nWorkers);
      chunks.push([a, b]);
    }
    if (opts.auditFonts) { await w0.seek(startF / fps); printAudit(`t=${startF / fps}`, await auditFonts(w0.cdp)); }

    const outAbs = path.resolve(opts.out);
    await fsp.mkdir(path.dirname(outAbs), { recursive: true });
    const tmpDir = await fsp.mkdtemp(path.join(path.dirname(outAbs), `.${path.basename(outAbs)}.parts-`));
    log(`rendering frames [${startF}, ${endF}) = ${nFrames} frames in ${nWorkers} chunk(s): ${chunks.map(([a, b]) => `${a}-${b - 1}`).join(' | ')} | ${opts.format}${opts.format === 'jpeg' ? ` q${opts.quality}` : ''} -> ${opts.intermediate} intermediates`);

    // ---- launch remaining workers in parallel ----
    const tLaunch = performance.now();
    const others = await Promise.all(chunks.slice(1).map(async (_, i) => {
      const w = new Worker(i + 1, ctx); workers.push(w); return w.open(viewport);
    }));
    const pool = [w0, ...others];
    for (const w of others) {
      if (w.ready.errors.length) throw new Error(`worker ${w.id}: ${w.ready.errors.join('; ')}`);
    }
    const launchMs = performance.now() - tLaunch;
    const startupMs = performance.now() - T0;

    // ---- render chunks ----
    const progress = makeProgress(nFrames, 'capture');
    const ticker = setInterval(() => progress.tick(), IS_TTY ? 250 : 1000);
    const codec = opts.format === 'jpeg' ? 'mjpeg' : 'png';
    const chunkFiles = chunks.map((_, i) => path.join(tmpDir, `chunk_${String(i).padStart(3, '0')}.${opts.intermediate === 'copy' ? 'mov' : 'mp4'}`));
    const sizeMatch = { w: Math.round(width * opts.scale), h: Math.round(height * opts.scale) };
    const zs = await hasZscale();
    const tCap = performance.now();
    await Promise.all(pool.map(async (w, i) => {
      const [a, b] = chunks[i];
      const encArgs = opts.intermediate === 'copy'
        ? ['-c:v', 'copy']
        : ['-vf', yuvChain(opts.format, sizeMatch.w, sizeMatch.h, zs),
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '12', '-threads', '2',
          '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];
      const ff = runFfmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', codec, '-i', 'pipe:0',
        ...encArgs, '-an', chunkFiles[i]], { stdin: true });
      let ffErr = null; ff.done.catch((e) => { ffErr = e; });
      for (let f = a; f < b; f++) {
        if (ffErr) throw ffErr;
        const t = f / fps;
        const s0 = performance.now();
        await w.seek(t);
        const s1 = performance.now();
        const img = await w.capture(opts.format, opts.quality);
        const s2 = performance.now();
        if (f === a && i === 0) {
          const dims = imageSize(img);
          if (dims && (dims.w !== sizeMatch.w || dims.h !== sizeMatch.h)) log(`WARN captured frame is ${dims.w}x${dims.h}, expected ${sizeMatch.w}x${sizeMatch.h}`);
          sizeMatch.actual = dims;
        }
        if (!ff.proc.stdin.write(img)) await Promise.race([once(ff.proc.stdin, 'drain'), ff.done]);
        const s3 = performance.now();
        w.stats.evalMs += s1 - s0; w.stats.shotMs += s2 - s1; w.stats.writeMs += s3 - s2; w.stats.frames++;
        progress.done++;
      }
      ff.proc.stdin.end();
      await ff.done;
      await w.close();
    }));
    clearInterval(ticker);
    progress.tick(true);
    const capMs = performance.now() - tCap;

    // ---- verify chunks: exact frame counts, contiguous ----
    let sum = 0;
    for (let i = 0; i < chunks.length; i++) {
      const n = await countVideoPackets(chunkFiles[i]);
      const want = chunks[i][1] - chunks[i][0];
      if (n !== want) throw new Error(`chunk ${i} has ${n} frames, expected ${want}`);
      sum += n;
    }
    if (sum !== nFrames) throw new Error(`chunks hold ${sum} frames, expected ${nFrames}`);

    // ---- concat + final encode ----
    const listFile = path.join(tmpDir, 'chunks.ffconcat');
    await fsp.writeFile(listFile, 'ffconcat version 1.0\n' + chunkFiles.map((f) => `file '${path.basename(f)}'\n`).join(''));
    const dur = nFrames / fps;
    const actual = sizeMatch.actual || sizeMatch;
    const evenW = actual.w - (actual.w % 2); const evenH = actual.h - (actual.h % 2);
    let vf;
    if (opts.intermediate === 'copy') {
      vf = (evenW !== actual.w || evenH !== actual.h ? `crop=${evenW}:${evenH}:0:0,` : '') + yuvChain(opts.format, evenW, evenH, zs);
    } else {
      vf = (evenW !== actual.w || evenH !== actual.h) ? `crop=${evenW}:${evenH}:0:0,format=yuv420p` : 'format=yuv420p';
    }
    const args = ['-hide_banner', '-nostdin', '-loglevel', 'error', '-y', '-progress', 'pipe:1', '-nostats',
      '-f', 'concat', '-safe', '0', '-i', listFile];
    if (opts.audio) {
      const off = startF / fps;
      if (off > 0) args.push('-ss', off.toFixed(6));
      args.push('-i', path.resolve(opts.audio));
    }
    args.push('-map', '0:v:0');
    if (opts.audio) args.push('-map', '1:a:0');
    args.push('-vf', vf, '-fps_mode', 'cfr', '-r', String(fps),
      '-c:v', 'libx264', '-preset', opts.preset, '-crf', String(opts.crf), '-profile:v', 'high', '-pix_fmt', 'yuv420p',
      '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv');
    if (opts.audio) args.push('-af', 'apad', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2');
    args.push('-t', dur.toFixed(6), '-movflags', '+faststart', outAbs);
    if (opts.verbose) log(`ffmpeg ${args.join(' ')}`);
    const enc = makeProgress(nFrames, 'encode ');
    enc.t0 = performance.now();
    const tEnc = performance.now();
    const ffFinal = runFfmpeg(args, {
      onStdout: (s) => { const m = s.match(/frame=(\d+)/g); if (m) { enc.done = Number(m[m.length - 1].slice(6)); enc.tick(); } },
    });
    await ffFinal.done;
    enc.done = nFrames; enc.tick(true);
    const encMs = performance.now() - tEnc;

    // ---- verify output ----
    const info = await ffprobeJson(outAbs, ['-count_packets', '-show_entries',
      'stream=codec_type,codec_name,profile,width,height,pix_fmt,r_frame_rate,avg_frame_rate,nb_read_packets,duration,sample_rate,channels:format=duration,size']);
    const vs = info.streams.find((s) => s.codec_type === 'video'); const as = info.streams.find((s) => s.codec_type === 'audio');
    const nOut = Number(vs.nb_read_packets);
    if (nOut !== nFrames) throw new Error(`output has ${nOut} frames, expected ${nFrames}`);
    if (!opts.keepTemp) await fsp.rm(tmpDir, { recursive: true, force: true });
    else log(`kept intermediates in ${tmpDir}`);

    // ---- report ----
    const totMs = performance.now() - T0;
    log(`OK ${outAbs}`);
    log(`   video: ${vs.codec_name} ${vs.profile} ${vs.width}x${vs.height} ${vs.pix_fmt} ${vs.r_frame_rate} fps, ${nOut} frames, ${Number(vs.duration).toFixed(3)}s` +
      (as ? ` | audio: ${as.codec_name} ${as.sample_rate}Hz ${as.channels}ch ${Number(as.duration).toFixed(3)}s` : '') +
      ` | ${(Number(info.format.size) / 1048576).toFixed(2)} MB`);
    log(`   timing: startup ${fmtS(startupMs)} (workers ${fmtS(launchMs)}) | capture ${fmtS(capMs)} = ${(nFrames / (capMs / 1000)).toFixed(1)} fps with ${nWorkers} worker(s) | encode ${fmtS(encMs)} = ${(nFrames / (encMs / 1000)).toFixed(1)} fps | total ${fmtS(totMs)}`);
    for (const w of pool) {
      const s = w.stats; const n = Math.max(1, s.frames);
      log(`   w${w.id}: ${s.frames} frames | renderFrame ${(s.evalMs / n).toFixed(1)}ms | screenshot ${(s.shotMs / n).toFixed(1)}ms | pipe ${(s.writeMs / n).toFixed(1)}ms per frame${s.fontWaits ? ` | ${s.fontWaits} mid-render font waits` : ''}`);
    }
  } finally {
    await cleanup();
  }
}

// width/height from a PNG or JPEG buffer
function imageSize(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1]; const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      i += 2 + len;
    }
  }
  return null;
}

export { CHROME_ARGS, RENDER_DIR, startServer, loadPlaywright, initScript, pageReady, pageFrame, auditFonts, printAudit };

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().catch((e) => { console.error(`[render] FAILED: ${e.stack || e.message}`); process.exit(1); });
