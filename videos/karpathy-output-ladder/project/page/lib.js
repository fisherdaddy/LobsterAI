/* Shared helpers: math/easing, timeline anchors, cue registry, DOM/SVG utilities, scene manager. */
(function () {
  const TL = window.TIMELINE;
  if (!TL) throw new Error('timeline.js missing');

  // ---------------------------------------------------------------- math
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, p) => a + (b - a) * p;
  const prog = (t, t0, t1) => (t1 <= t0 ? (t >= t1 ? 1 : 0) : clamp((t - t0) / (t1 - t0)));
  const ease = {
    lin: (p) => p,
    inQuad: (p) => p * p,
    outQuad: (p) => 1 - (1 - p) * (1 - p),
    inOutQuad: (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2),
    inCubic: (p) => p * p * p,
    outCubic: (p) => 1 - Math.pow(1 - p, 3),
    inOutCubic: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
    outQuart: (p) => 1 - Math.pow(1 - p, 4),
    outExpo: (p) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p)),
    inOutSine: (p) => -(Math.cos(Math.PI * p) - 1) / 2,
    outBack: (p) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); },
    outBackS: (p) => { const c1 = 1.1, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); },
    outElastic: (p) => (p === 0 ? 0 : p === 1 ? 1 : Math.pow(2, -10 * p) * Math.sin((p * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
  };
  // eased progress in [t0, t0+d]
  const ep = (t, t0, d, fn = ease.outCubic) => fn(prog(t, t0, t0 + d));
  // appear/disappear window: 0→1 over [a, a+din], 1→0 over [b-dout, b]
  const win = (t, a, b, din = 0.4, dout = 0.4) => Math.min(prog(t, a, a + din), 1 - prog(t, b - dout, b));
  // deterministic hash → [0,1)
  const hash = (n) => { let x = Math.sin(n * 127.1 + 311.7) * 43758.5453123; return x - Math.floor(x); };
  // keyframes: [[t, v], ...] with per-segment easing (default inOutCubic)
  function kf(t, keys, fn = ease.inOutCubic) {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      if (t <= keys[i][0]) {
        const [t0, v0] = keys[i - 1], [t1, v1, f] = keys[i];
        return lerp(v0, v1, (f || fn)(prog(t, t0, t1)));
      }
    }
    return keys[keys.length - 1][1];
  }

  // ---------------------------------------------------------------- timeline anchors
  const SEG = Object.fromEntries(TL.segments.map((s) => [s.id, s]));
  const seg = (id) => { const s = SEG[id]; if (!s) throw new Error('no segment ' + id); return s; };
  const S = (id) => seg(id).start;
  const E = (id) => seg(id).end;
  const W = (id, phrase, off = 0) => {
    const s = seg(id); const k = s.say.indexOf(phrase);
    if (k < 0) throw new Error(`phrase "${phrase}" not in ${id}: ${s.say}`);
    return s.start + s.ct[k] + off;
  };
  const WE = (id, phrase) => {
    const s = seg(id); const k = s.say.indexOf(phrase);
    if (k < 0) throw new Error(`phrase "${phrase}" not in ${id}`);
    const j = k + phrase.length;
    let tt = s.end;
    for (let q = j; q < s.say.length; q++) { if (/[一-鿿A-Za-z0-9]/.test(s.say[q])) { tt = s.start + s.ct[q]; break; } }
    return tt;
  };
  const SC = (name) => TL.scenes[name];
  const ENV = TL.env || [];
  const env = (t) => { const f = t * TL.fps; const i = Math.floor(f); const a = ENV[i] || 0, b = ENV[i + 1] || 0; return lerp(a, b, f - i); };

  // ---------------------------------------------------------------- cues (sound effects), collected at build time
  const CUES = [];
  const cue = (type, t, gain = 1, extra) => { if (Number.isFinite(t)) CUES.push(Object.assign({ type, t: +t.toFixed(3), gain }, extra || {})); };

  // ---------------------------------------------------------------- DOM helpers
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'class') el.className = attrs[k];
      else if (k === 'html') el.innerHTML = attrs[k];
      else if (k === 'style') el.style.cssText = attrs[k];
      else el.setAttribute(k, attrs[k]);
    }
    for (const c of kids) if (c != null) el.append(c);
    return el;
  }
  const SVGNS = 'http://www.w3.org/2000/svg';
  function sv(tag, attrs, parent) {
    const el = document.createElementNS(SVGNS, tag);
    if (attrs) for (const k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  }
  // cached style setter
  function css(el, props) {
    const c = el.__css || (el.__css = {});
    for (const k in props) {
      const v = props[k];
      if (c[k] !== v) { c[k] = v; if (k.startsWith('--')) el.style.setProperty(k, v); else el.style[k] = v; }
    }
  }
  // cached attribute setter
  function attr(el, props) {
    const c = el.__attr || (el.__attr = {});
    for (const k in props) {
      const v = typeof props[k] === 'number' ? +props[k].toFixed(2) : props[k];
      if (c[k] !== v) { c[k] = v; el.setAttribute(k, v); }
    }
  }
  const f3 = (x) => (Math.round(x * 1000) / 1000).toString();
  // opacity + translate + scale in one go
  function show(el, o, x = 0, y = 0, s = 1, extra = '') {
    css(el, {
      opacity: f3(o),
      transform: `${el.__pre || ''} translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${s.toFixed(4)}) ${extra}`,
      visibility: o <= 0.001 ? 'hidden' : 'visible',
    });
  }
  // fade-up entrance (+ optional exit)
  function fadeUp(el, t, t0, d = 0.6, dy = 34, t1 = Infinity, d1 = 0.35) {
    const p = ep(t, t0, d, ease.outCubic);
    const q = 1 - prog(t, t1 - d1, t1);
    show(el, Math.min(p, q), 0, (1 - p) * dy);
  }
  function pop(el, t, t0, d = 0.45, t1 = Infinity, d1 = 0.3, extra = '') {
    const p = prog(t, t0, t0 + d);
    const q = 1 - prog(t, t1 - d1, t1);
    show(el, Math.min(clamp(p * 2.2), q), 0, 0, lerp(0.6, 1, ease.outBack(p)), extra);
  }
  // typewriter on an element: visible prefix + transparent remainder (keeps layout stable)
  function typer(el, text, caret) {
    el.textContent = '';
    const a = document.createElement('span'), b = document.createElement('span');
    b.style.color = 'transparent';
    el.append(a);
    if (caret) el.append(caret);
    el.append(b);
    let last = -1;
    return (n) => {
      n = Math.max(0, Math.min(text.length, Math.round(n)));
      if (n === last) return; last = n;
      a.textContent = text.slice(0, n); b.textContent = text.slice(n);
    };
  }
  // stroke draw-in for SVG paths
  function prepDraw(paths) {
    return paths.map((p) => { const L = p.getTotalLength ? p.getTotalLength() : 1000; p.style.strokeDasharray = `${L} ${L}`; p.style.strokeDashoffset = `${L}`; return [p, L]; });
  }
  function draw(prepped, p) {
    for (const [el, L] of prepped) {
      const v = (L * (1 - clamp(p))).toFixed(1); if (el.__dash !== v) { el.__dash = v; el.style.strokeDashoffset = v; }
      const vis = p > 0.0005 ? 'visible' : 'hidden';   // round caps would otherwise leave a dot at the path end
      if (el.__vis !== vis) { el.__vis = vis; el.style.visibility = vis; }
    }
  }
  // draw a list of prepped paths sequentially over p
  function drawSeq(prepped, p) {
    const n = prepped.length; if (!n) return;
    prepped.forEach((pp, i) => draw([pp], clamp(p * n - i)));
  }
  // seeded rough.js svg helper
  function roughSvg(svgEl) { return window.rough.svg(svgEl); }

  // ---------------------------------------------------------------- scene manager
  const scenes = [];
  function scene(name, build, render) { scenes.push({ name, build, render, el: null }); }
  function sceneAlpha(name, t) {
    const sc = SC(name); if (!sc) return 0;
    const fi = name === TL.order[0] ? 0 : 0.5, fo = name === TL.order[TL.order.length - 1] ? 0 : 0.5;
    if (fi === 0 && t < sc.start) return 1;
    return Math.min(fi ? prog(t, sc.start - fi / 2, sc.start + fi / 2) : 1, fo ? 1 - prog(t, sc.end - fo / 2, sc.end + fo / 2) : 1);
  }

  // mark elements whose left/top is their centre (or bottom-centre)
  const centered = (el, pre = 'translate(-50%,-50%)') => { el.__pre = pre; return el; };

  window.L = {
    centered,
    TL, clamp, lerp, prog, ease, ep, win, hash, kf, SEG, seg, S, E, W, WE, SC, env, CUES, cue,
    $, $$, h, sv, css, attr, show, fadeUp, pop, typer, prepDraw, draw, drawSeq, roughSvg, scenes, scene, sceneAlpha, f3,
  };
  window.CUES = CUES;
})();
