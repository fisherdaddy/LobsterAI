/* Scenes: rung3 (interactive web page + lens lab), rung4 (explainer video, dark). */
(function () {
  const { clamp, lerp, prog, ease, ep, win, kf, S, E, W, WE, SC, TL, env, cue, h, sv, css, attr, show, fadeUp, pop, typer,
    prepDraw, draw, scene } = window.L;

  const CHECK_SVG = '<svg width="26" height="26" viewBox="0 0 26 26" style="vertical-align:-4px"><path d="M4 14 L10 20 L22 6" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  window.CHECK_SVG = CHECK_SVG;

  function cursorEl(root) {
    const el = h('div', { class: 'cursor', html: '<svg width="44" height="44" viewBox="0 0 44 44"><path d="M6 4 L6 34 L14 26 L20 40 L26 37 L20 24 L32 24 Z" fill="#1f1b17" stroke="#fff" stroke-width="2.6" stroke-linejoin="round"/></svg>' });
    root.append(el);
    return el;
  }

  // ===================================================================== RUNG 3 — interactive page
  scene('rung3', (root) => {
    const beb = window.makeBEB(root);
    const head = window.makeRungHead(root, '03', '网页', 'INTERACTIVE', '让它直接写一个网页');
    // prompt
    const PROMPT = '解释一下勾股定理。请用 HTML 来组织你的回答。';
    const pt = h('span', { class: 'pt' });
    const caret = h('span', { class: 'caret' });
    const prompt = h('div', { class: 'card abs', id: 'r3-prompt' }, h('div', { style: 'display:flex;align-items:center' }, pt), h('div', { class: 'send' }, '↑'));
    root.append(prompt);
    const typeP = typer(pt, PROMPT, caret);
    const chip = h('div', { class: 'filechip' }, h('div', { class: 'fi' }, 'HTML'), 'pythagoras.html');
    css(chip, { left: '1380px', top: '300px' });
    root.append(chip);
    // browser window
    const tab1 = h('div', { class: 'tab on' }, '勾股定理 · 交互演示');
    const tab2 = h('div', { class: 'tab' }, '镜头实验室 · 示意');
    const url = h('span', {}, 'file:///Users/me/pythagoras.html');
    const body = h('div', { class: 'win-body' });
    const winEl = h('div', { class: 'card abs', id: 'r3-win' },
      h('div', { class: 'win-bar' }, h('div', { class: 'dots', html: '<i style="background:#e4705f"></i><i style="background:#e9b44c"></i><i style="background:#6fb26a"></i>' }), tab1, tab2),
      h('div', { class: 'url' }, h('span', { class: 'lock', html: '<svg width="16" height="18" viewBox="0 0 16 18" style="vertical-align:-2px"><rect x="1.5" y="8" width="13" height="9" rx="2" fill="#968b7c"/><path d="M4.5 8 V5.5 a3.5 3.5 0 0 1 7 0 V8" fill="none" stroke="#968b7c" stroke-width="2"/></svg>' }), url), body);
    root.append(winEl);

    // --- page 1: pythagoras playground
    const pg1 = h('div', { style: 'position:absolute;inset:0' });
    body.append(pg1);
    const vis = sv('svg', { width: 610, height: 640, style: 'position:absolute;left:0;top:0' });
    pg1.append(vis);
    const sqA = sv('polygon', { fill: 'rgba(79,127,174,0.22)', stroke: '#4f7fae', 'stroke-width': 3, 'stroke-linejoin': 'round' }, vis);
    const sqB = sv('polygon', { fill: 'rgba(94,148,103,0.22)', stroke: '#5e9467', 'stroke-width': 3, 'stroke-linejoin': 'round' }, vis);
    const sqC = sv('polygon', { fill: 'rgba(217,119,87,0.22)', stroke: '#d97757', 'stroke-width': 3, 'stroke-linejoin': 'round' }, vis);
    const tri = sv('polygon', { fill: '#fffaf0', stroke: '#1f1b17', 'stroke-width': 3.5, 'stroke-linejoin': 'round' }, vis);
    const mk = (txt, col) => { const t = sv('text', { 'font-family': "'Instrument Serif', 'Noto Serif SC', serif", 'font-style': 'italic', 'font-size': 34, fill: col, 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, vis); t.textContent = txt; return t; };
    const tA = mk('a²', '#4f7fae'), tB = mk('b²', '#5e9467'), tC = mk('c²', '#b85a3a');
    const slA = h('div', { class: 'slider', style: 'left:650px;top:150px;width:300px;color:#4f7fae' }, h('div', { class: 'fill', style: 'background:#4f7fae' }), h('div', { class: 'knob' }));
    const slB = h('div', { class: 'slider', style: 'left:650px;top:270px;width:300px;color:#5e9467' }, h('div', { class: 'fill', style: 'background:#5e9467' }), h('div', { class: 'knob' }));
    const lA = h('div', { class: 'slbl', style: 'left:650px;top:84px;color:#4f7fae' }, 'a', h('span', { class: 'v' }, ''));
    const lB = h('div', { class: 'slbl', style: 'left:650px;top:204px;color:#5e9467' }, 'b', h('span', { class: 'v' }, ''));
    const eq = h('div', { class: 'eqbox', style: 'left:640px;top:350px;width:330px' });
    const eq1 = h('div', {}, ''), eq2 = h('div', {}, ''), ok = h('div', { class: 'ok', html: CHECK_SVG + ' 等式成立' });
    eq.append(h('div', { style: 'font-family:"Instrument Serif","Noto Serif SC",serif;font-style:italic;font-size:34px' }, 'a² + b² = c²'), eq1, eq2, ok);
    pg1.append(slA, slB, lA, lB, eq);
    const hint = h('div', { style: 'position:absolute;left:650px;top:30px;font-size:22px;color:#968b7c' }, '拖动滑块试试 →');
    pg1.append(hint);

    // --- page 2: lens lab (schematic re-creation)
    const pg2 = h('div', { style: 'position:absolute;inset:0;opacity:0' });
    body.append(pg2);
    const lens = sv('svg', { width: 1010, height: 650, style: 'position:absolute;left:0;top:0' });
    pg2.append(lens);
    const AX = 250, XO = 70, XS = 860, F = 150, HO = 100;
    sv('line', { x1: 30, y1: AX, x2: 980, y2: AX, stroke: '#cbbfae', 'stroke-width': 2, 'stroke-dasharray': '6 8' }, lens);
    // object: little tree/arrow
    const obj = sv('g', { transform: `translate(${XO} ${AX})` }, lens);
    sv('line', { x1: 0, y1: 0, x2: 0, y2: -HO, stroke: '#5e9467', 'stroke-width': 7, 'stroke-linecap': 'round' }, obj);
    sv('path', { d: `M-18 ${-HO + 22} L0 ${-HO - 6} L18 ${-HO + 22}`, fill: 'none', stroke: '#5e9467', 'stroke-width': 7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, obj);
    const rays = [0, 1, 2].map(() => sv('polyline', { fill: 'none', stroke: '#d97757', 'stroke-width': 2.6, opacity: 0.85 }, lens));
    const lensG = sv('g', {}, lens);
    sv('path', { d: 'M0 -120 C 34 -60, 34 60, 0 120 C -34 60, -34 -60, 0 -120 Z', fill: 'rgba(120,170,210,0.35)', stroke: '#4f7fae', 'stroke-width': 3 }, lensG);
    sv('path', { d: 'M-46 -96 L-46 96 M46 -96 L46 96', stroke: '#4f7fae', 'stroke-width': 3, opacity: 0.55 }, lensG);
    sv('rect', { x: -60, y: -134, width: 120, height: 16, rx: 6, fill: '#3b352e' }, lensG);
    sv('rect', { x: -60, y: 118, width: 120, height: 16, rx: 6, fill: '#3b352e' }, lensG);
    const sensor = sv('rect', { x: XS - 6, y: AX - 130, width: 12, height: 260, rx: 4, fill: '#3b352e' }, lens);
    const spot = sv('line', { x1: XS, x2: XS, stroke: '#d97757', 'stroke-width': 10, 'stroke-linecap': 'round' }, lens);
    const lbl = (txt, x, y, sz = 22, col = '#968b7c') => { const t = sv('text', { x, y, 'font-size': sz, fill: col, 'text-anchor': 'middle', 'font-family': 'Noto Sans SC' }, lens); t.textContent = txt; return t; };
    lbl('物体', XO, AX + 40); lbl('传感器', XS, AX + 165);
    const lensLbl = lbl('镜片组', 0, AX + 165);
    // focus ring dial
    const dial = sv('g', { transform: 'translate(190 440)' }, lens);
    sv('circle', { r: 104, fill: '#2d2823' }, dial);
    sv('circle', { r: 84, fill: '#3b352e', stroke: '#57504a', 'stroke-width': 2 }, dial);
    const ring = sv('g', {}, dial);
    const marks = ['∞', '5m', '2m', '1m', '0.5m'];
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * Math.PI * 2;
      sv('line', { x1: Math.cos(a) * 88, y1: Math.sin(a) * 88, x2: Math.cos(a) * (k % 5 ? 96 : 102), y2: Math.sin(a) * (k % 5 ? 96 : 102), stroke: '#a69a8a', 'stroke-width': 2 }, ring);
    }
    marks.forEach((m, k) => { const a = (-90 + k * 38) * Math.PI / 180; const t = sv('text', { x: Math.cos(a) * 60, y: Math.sin(a) * 60 + 7, 'font-size': 20, fill: '#efe7da', 'text-anchor': 'middle', 'font-family': 'Noto Sans SC' }, ring); t.textContent = m; });
    sv('path', { d: 'M0 -116 L-9 -132 L9 -132 Z', fill: '#d97757' }, dial);
    const dialLbl = sv('text', { x: 0, y: 134, 'font-size': 22, fill: '#968b7c', 'text-anchor': 'middle', 'font-family': 'Noto Sans SC' }, dial);
    dialLbl.textContent = '对焦环';
    // viewfinder
    const vf = h('div', { style: 'position:absolute;left:560px;top:404px;width:360px;height:190px;border-radius:14px;background:#2d2823;overflow:hidden' });
    const vfImg = h('div', { style: 'position:absolute;inset:0', html: '<svg width="360" height="190"><rect width="360" height="190" fill="#c9dbe6"/><rect y="132" width="360" height="58" fill="#9fbf8c"/><circle cx="292" cy="46" r="22" fill="#f3d27a"/><g transform="translate(150 140)"><rect x="-6" y="-52" width="12" height="52" fill="#7a5a3a"/><circle cx="0" cy="-74" r="38" fill="#5e9467"/><circle cx="-26" cy="-56" r="24" fill="#6fa776"/><circle cx="24" cy="-58" r="26" fill="#58905f"/></g></svg>' });
    const vfLbl = h('div', { style: 'position:absolute;left:14px;top:10px;font-size:19px;color:#fff;background:rgba(0,0,0,0.35);padding:2px 10px;border-radius:8px' }, '取景');
    const vfOk = h('div', { style: 'position:absolute;right:12px;bottom:10px;font-size:20px;color:#fff;background:#3f8a4c;padding:3px 12px;border-radius:8px;font-weight:700', html: CHECK_SVG + ' 合焦' });
    vf.append(vfImg, vfLbl, vfOk);
    pg2.append(vf);
    const credit = h('div', { class: 'credit' }, '示意重现 · 原作：用户用 Claude Opus 5.5 做的「镜头实验室」');
    css(credit, { left: '800px', top: '112px' });
    root.append(credit);

    const cursor = cursorEl(root);
    const anno = h('div', { class: 'anno' }, '自己动手，才真懂！');
    css(anno, { left: '122px', top: '790px' });

    // ---------------- timing
    const sc = SC('rung3');
    const tBeb = sc.start + 0.1, tZh = S('s12') - 0.05, tBebOut = S('s12') + 1.0, tHead = S('s12') + 1.05;
    const tPr = S('s13') - 0.2, tTy0 = S('s13') + 0.25, tTy1 = WE('s13', 'HTML') + 0.25;
    const tChip = W('s13', '再用') - 0.1, tWin = W('s13', '浏览器') + 0.1;
    const t14 = S('s14');
    const tEq = W('s14', '等式') - 0.1, tAnno = W('s14', '理解') - 0.1;
    const tTab = S('s15') - 0.25, tDial = W('s15', '能转') - 0.3;
    const tOkFocus = E('s15') + 0.1;
    cue('whoosh', tBeb, 0.7); cue('stamp', tZh, 0.9);
    cue('type', tTy0, 0.5, { dur: tTy1 - tTy0 }); cue('pop', tChip, 0.6); cue('whoosh', tWin, 0.5);
    cue('click', t14 + 0.35, 0.6); cue('slide', t14 + 0.4, 0.4, { dur: 1.4 }); cue('click', t14 + 2.2, 0.6); cue('slide', t14 + 2.25, 0.4, { dur: 1.4 });
    cue('ding', tEq, 0.6); cue('click', tTab, 0.5); cue('click', tDial + 0.45, 0.5); cue('slide', tDial + 0.5, 0.45, { dur: 2.2 }); cue('ding', tOkFocus, 0.7);

    // slider values over time
    const aVal = (t) => kf(t, [[t14 + 0.4, 3], [t14 + 1.15, 5.2], [t14 + 1.85, 2.0], [t14 + 2.15, 2.0]]);
    const bVal = (t) => kf(t, [[t14 + 2.25, 4], [t14 + 2.95, 2.2], [t14 + 3.75, 5.0]]);
    const knobX = (v) => 650 + ((v - 1) / 5) * 300;  // range 1..6
    // lens position over time
    const xL = (t) => kf(t, [[tDial + 0.5, 520], [tDial + 1.4, 700], [tDial + 2.4, 634]]);
    let lastDial = null;
    root.append(anno);
    return (t) => {
      beb(t, tBeb, tZh, tBebOut);
      head(t, tHead);
      // prompt card
      const pin = ep(t, tPr, 0.55), pout = ep(t, tWin - 0.1, 0.45, ease.inOutCubic);
      css(prompt, { opacity: f2(Math.min(pin, 1 - pout)), transform: `translateY(${((1 - pin) * 40 - pout * 30).toFixed(1)}px)` });
      typeP(lerp(0, PROMPT.length, prog(t, tTy0, tTy1)));
      css(caret, { opacity: (Math.floor(t * 2.4) % 2 === 0 || t < tTy1) ? '1' : '0' });
      // file chip → window
      const cp = ep(t, tChip, 0.45, ease.outBack), cq = ep(t, tWin + 0.15, 0.3);
      show(chip, Math.min(clamp(cp * 2), 1 - cq), 0, 0, lerp(0.7, 1, cp));
      const wp = ep(t, tWin, 0.7, ease.outQuart);
      css(winEl, { opacity: f2(clamp(wp * 1.5)), transform: `translate(${((1 - wp) * 300).toFixed(1)}px, ${((1 - wp) * 40).toFixed(1)}px) scale(${lerp(0.35, 1, wp).toFixed(4)})` });
      // page 1 playground
      const a = aVal(t), b = bVal(t), c = Math.hypot(a, b);
      const k = Math.min(560 / (2 * a + b), 520 / (a + 2 * b)) * 0.92;
      const cx = 305 - ((2 * a + b) * k) / 2 + a * k, cy = 330 - ((a + 2 * b) * k) / 2 + (a + b) * k;
      const C = [cx, cy], A = [cx, cy - a * k], B = [cx + b * k, cy];
      const n = [a * k, -b * k];
      const pts = (arr) => arr.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ');
      attr(tri, { points: pts([A, B, C]) });
      attr(sqA, { points: pts([[cx - a * k, cy - a * k], A, C, [cx - a * k, cy]]) });
      attr(sqB, { points: pts([C, B, [cx + b * k, cy + b * k], [cx, cy + b * k]]) });
      attr(sqC, { points: pts([A, B, [B[0] + n[0], B[1] + n[1]], [A[0] + n[0], A[1] + n[1]]]) });
      attr(tA, { x: cx - (a * k) / 2, y: cy - (a * k) / 2 });
      attr(tB, { x: cx + (b * k) / 2, y: cy + (b * k) / 2 });
      attr(tC, { x: (A[0] + B[0] + n[0]) / 2, y: (A[1] + B[1] + n[1]) / 2 });
      [[slA, a], [slB, b]].forEach(([sl, v]) => { const x = knobX(v) - 650; css(sl.children[0], { width: `${x.toFixed(1)}px` }); css(sl.children[1], { left: `${x.toFixed(1)}px` }); });
      lA.lastChild.textContent = '= ' + a.toFixed(1); lB.lastChild.textContent = '= ' + b.toFixed(1);
      eq1.textContent = `${(a * a).toFixed(2)} + ${(b * b).toFixed(2)}`;
      eq2.textContent = `= ${(c * c).toFixed(2)}`;
      const okp = ep(t, tEq, 0.5, ease.outBack);
      css(ok, { transform: `scale(${(1 + 0.18 * Math.sin(Math.PI * clamp(prog(t, tEq, tEq + 0.6)))).toFixed(3)})` });
      css(eq, { boxShadow: `0 0 0 ${(3 * Math.sin(Math.PI * prog(t, tEq, tEq + 0.8))).toFixed(1)}px rgba(63,138,76,0.5)` });
      css(hint, { opacity: f2(1 - prog(t, t14, t14 + 0.4)) });
      // page switch
      const sw = ep(t, tTab, 0.45, ease.inOutCubic);
      css(pg1, { opacity: f2(1 - sw) }); css(pg2, { opacity: f2(sw) });
      tab1.className = sw > 0.5 ? 'tab' : 'tab on'; tab2.className = sw > 0.5 ? 'tab on' : 'tab';
      css(tab2, { opacity: f2(clamp(prog(t, tTab - 0.35, tTab))) });
      url.textContent = sw > 0.5 ? 'file:///Users/me/lens-lab.html' : 'file:///Users/me/pythagoras.html';
      fadeUp(credit, t, tTab + 0.2, 0.5, 10);
      // lens physics
      const xl = xL(t), dO = xl - XO, dI = (F * dO) / (dO - F), xi = xl + dI, yi = AX + (HO * dI) / dO;
      attr(lensG, { transform: `translate(${xl.toFixed(1)} ${AX})` });
      attr(lensLbl, { x: xl.toFixed(1) });
      const tip = [XO, AX - HO];
      const ys = [];
      rays.forEach((r, i) => {
        const ly = AX - 90 + i * 90;
        const sx = XS, sy = ly + ((yi - ly) * (sx - xl)) / (xi - xl);
        ys.push(sy);
        attr(r, { points: `${tip[0]},${tip[1]} ${xl.toFixed(1)},${ly} ${sx},${sy.toFixed(1)}` });
      });
      const y0 = Math.min(...ys), y1 = Math.max(...ys);
      attr(spot, { y1: y0.toFixed(1), y2: Math.max(y1, y0 + 0.5).toFixed(1) });
      const blur = Math.min(14, (y1 - y0) * 0.11);
      css(vfImg, { filter: `blur(${blur.toFixed(2)}px)` });
      css(vfOk, { opacity: f2(ep(t, tOkFocus - 0.1, 0.3)) });
      const ang = (xl - 520) * 0.5;
      if (ang !== lastDial) { lastDial = ang; attr(ring, { transform: `rotate(${ang.toFixed(2)})` }); }
      // cursor path
      const winX = 790, winY = 150 + 108;
      const ka = [winX + knobX(aVal(t)) - 14 + 6, winY + 150 + 2], kb = [winX + knobX(bVal(t)) - 14 + 6, winY + 270 + 2];
      const dialPt = (deg) => [winX + 190 + Math.cos((deg - 90) * Math.PI / 180) * 94 - 6, winY + 440 + Math.sin((deg - 90) * Math.PI / 180) * 94 - 4];
      let cx2, cy2;
      if (t < t14 + 1.9) {
        const p = ep(t, t14 - 0.3, 0.6, ease.inOutCubic);
        cx2 = lerp(1300, ka[0], p); cy2 = lerp(800, ka[1], p);
      } else if (t < tTab - 0.4) {
        const p = ep(t, t14 + 1.9, 0.35, ease.inOutCubic);
        const pa = [winX + knobX(2.0) - 8, winY + 152];
        cx2 = lerp(pa[0], kb[0], p); cy2 = lerp(pa[1], kb[1], p);
        if (t > t14 + 2.25) { cx2 = kb[0]; cy2 = kb[1]; }
      } else {
        const p = ep(t, tDial - 0.2, 0.6, ease.inOutCubic);
        const d = dialPt(ang + 40);
        const from = [winX + knobX(5.0) - 8, winY + 272];
        cx2 = lerp(from[0], d[0], p); cy2 = lerp(from[1], d[1], p);
      }
      const ca = Math.min(ep(t, t14 - 0.35, 0.3), 1 - prog(t, E('s15') + 0.6, E('s15') + 0.9));
      show(cursor, ca, cx2, cy2, 1);
      pop(anno, t, tAnno, 0.5, sc.end - 0.2, 0.3, 'rotate(-4deg)');
    };
  });

  const f2 = (x) => (Math.round(x * 1000) / 1000).toString();

  // ===================================================================== RUNG 4 — explainer video (dark)
  scene('rung4', (root) => {
    const beb = window.makeBEB(root);
    const head = window.makeRungHead(root, '04', '视频', 'VIDEO', '做成一段解说视频');
    const tag = h('div', { class: 'dk-tag' }, '04 · VIDEO · 解说视频');
    root.append(tag);
    const player = h('div', { class: 'abs', id: 'r4-player' });
    root.append(player);
    const ttl = h('div', { class: 'pl-title' }, h('div', { class: 'a' }, '勾股定理：一个不用公式的证明'), h('div', { class: 'b', style: 'font-family:var(--mono);letter-spacing:0;font-size:18px' }, '“Create a 3b1b style video explainer on X. Use my ElevenLabs API key for audio narration”'));
    const progF = h('div', { class: 'f' });
    const timeTxt = h('span', {}, '0:00');
    const bar = h('div', { class: 'pl-bar' }, h('span', { html: '<svg width="22" height="22" viewBox="0 0 22 22"><path d="M5 3 L19 11 L5 19 Z" fill="#c9c2b6"/></svg>' }), timeTxt, h('div', { class: 'pl-prog' }, progF), h('span', {}, '1:24'));
    const svg = sv('svg', { width: 1320, height: 742, style: 'position:absolute;left:0;top:0' });
    player.append(svg, ttl, bar);
    const K = 60, X0 = 660 - 3.5 * K, Y0 = 150;
    const P = (x, y) => [X0 + x * K, Y0 + y * K];
    const ptsS = (arr) => arr.map(([x, y]) => P(x, y).map((v) => v.toFixed(1)).join(',')).join(' ');
    const big = sv('polygon', { points: ptsS([[0, 0], [7, 0], [7, 7], [0, 7]]), fill: 'none', stroke: '#ece6da', 'stroke-width': 3 }, svg);
    const cSq = sv('polygon', { points: ptsS([[3, 0], [7, 3], [4, 7], [0, 4]]), fill: 'rgba(240,172,95,0.86)', stroke: '#f6c27f', 'stroke-width': 3 }, svg);
    const aSq = sv('polygon', { points: ptsS([[0, 0], [3, 0], [3, 3], [0, 3]]), fill: 'rgba(131,193,103,0.62)', stroke: '#83c167', 'stroke-width': 3 }, svg);
    const bSq = sv('polygon', { points: ptsS([[3, 3], [7, 3], [7, 7], [3, 7]]), fill: 'rgba(252,98,85,0.55)', stroke: '#fc6255', 'stroke-width': 3 }, svg);
    const T = [
      { v: [[0, 0], [3, 0], [0, 4]], d: [0, 3] },
      { v: [[7, 0], [7, 3], [3, 0]], d: [0, 0] },
      { v: [[7, 7], [4, 7], [7, 3]], d: [-4, 0] },
      { v: [[0, 7], [0, 4], [4, 7]], d: [3, -4] },
    ];
    T.forEach((tr) => { tr.el = sv('polygon', { points: ptsS(tr.v), fill: 'rgba(88,196,221,0.5)', stroke: '#9fe3f2', 'stroke-width': 2.6, 'stroke-linejoin': 'round' }, svg); });
    const ghost = sv('polygon', { points: ptsS([[3, 0], [7, 3], [4, 7], [0, 4]]), fill: 'none', stroke: '#f0ac5f', 'stroke-width': 3, 'stroke-dasharray': '10 9' }, svg);
    const bigD = prepDraw([big]);
    const ml = (txt, x, y, col, sz = 54) => { const el = window.L.centered(h('div', { class: 'mathlbl', html: txt })); const [sx, sy] = P(x, y); css(el, { left: `${sx}px`, top: `${sy}px`, color: col, fontSize: `${sz}px` }); player.append(el); return el; };
    const lc = ml('c<sup style="font-size:.6em">2</sup>', 3.5, 3.5, '#fff3df', 66);
    const la = ml('a<sup style="font-size:.6em">2</sup>', 1.5, 1.5, '#effbe8', 60);
    const lb = ml('b<sup style="font-size:.6em">2</sup>', 5, 5, '#fff0ee', 66);
    const ea = ml('a', 1.5, -0.42, '#83c167', 40), eb = ml('b', -0.42, 2.0, '#fc6255', 40), ec = ml('c', 1.75, 2.25, '#f0ac5f', 40);
    const eqn = h('div', { class: 'eqn', html: '<span style="color:#83c167">a<sup>2</sup></span> + <span style="color:#fc6255">b<sup>2</sup></span> = <span style="color:#f0ac5f">c<sup>2</sup></span>' });
    css(eqn, { top: `${Y0 + 7 * K + 8}px` });
    player.append(eqn);
    // TTS cards + waveform (outside player)
    const card1 = h('div', { class: 'tts-card', html: '<div class="ic"><svg width="44" height="44" viewBox="0 0 44 44"><circle cx="14" cy="22" r="9" fill="none" stroke="#8c96a2" stroke-width="4"/><path d="M23 22 H40 M33 22 V30 M39 22 V28" stroke="#8c96a2" stroke-width="4" stroke-linecap="round"/></svg></div><div class="h">付费语音服务</div><div class="s">比如 ElevenLabs、MiniMax，效果好，需要 API 密钥</div>' });
    const card2 = h('div', { class: 'tts-card', html: '<div class="ic"><svg width="48" height="44" viewBox="0 0 48 44"><rect x="8" y="6" width="32" height="22" rx="3" fill="none" stroke="#83c167" stroke-width="4"/><path d="M3 34 H45" stroke="#83c167" stroke-width="5" stroke-linecap="round"/></svg></div><div class="h">免费 · 本地运行</div><div class="s">让大模型帮你找开源替代方案</div>' });
    css(card1, { left: '1180px', top: '170px' }); css(card2, { left: '1180px', top: '420px' });
    root.append(card1, card2);
    const waveSvg = sv('svg', { width: 1920, height: 1080, style: 'position:absolute;left:0;top:0' });
    root.append(waveSvg);
    const NB = 56, WX0 = 1180, WX1 = 1700, WY = 770;
    const bars = Array.from({ length: NB }, (_, i) => sv('rect', { x: WX0 + i * ((WX1 - WX0) / NB), width: ((WX1 - WX0) / NB) * 0.58, rx: 3, fill: '#f0ac5f' }, waveSvg));
    const engine = window.L.TTS.badge;
    const wl = h('div', { class: 'wave-lbl' }, '↑ 你正在听的声音');
    const wb = h('div', { class: 'wave-lbl', style: 'font-family:var(--sans);font-size:24px;color:#83c167' }, engine);
    css(wl, { left: '1180px', top: '840px' }); css(wb, { left: '1180px', top: '676px' });
    root.append(wl, wb);

    const sc = SC('rung4');
    const tBeb = sc.start + 0.1, tZh = S('s16') - 0.05, tBebOut = S('s16') + 1.0, tHead = S('s16') + 1.05;
    const tDark = E('s16') + 0.05, tPl = E('s16') + 0.45;
    const tTtl = S('s17') - 0.1, tTtlOut = E('s17') + 0.1;
    const tBig = W('s17', '形式') - 0.2, tTri = W('s17', '三蓝一棕') - 0.1, tC = W('s17', '旁白') - 0.2;
    const tPulse = W('s18', '四个') - 0.1, tMove = W('s18', '换个位置') - 0.05;
    const tGhost = W('s19', '斜边') - 0.15, tAB = W('s19', '两条直角边') - 0.15;
    const tEq = S('s20') - 0.1;
    const tShrink = S('s21') - 0.35, tCard1 = W('s21', '付费') - 0.2, tCard2 = W('s21', '免费') - 0.2;
    const tWave = S('s22') - 0.1, tWl = W('s22', '这个声音') - 0.1;
    const tLight = sc.end - 0.6;
    cue('whoosh', tBeb, 0.7); cue('stamp', tZh, 0.9);
    cue('swell', tDark - 0.2, 0.8, { dur: 1.6 });
    cue('scribble', tBig, 0.4, { dur: 0.9 });
    [0, 1, 2, 3].forEach((i) => cue('tick', tTri + i * 0.12, 0.5));
    cue('chime', tC, 0.6);
    [0, 1, 2, 3].forEach((i) => cue('tick', tPulse + i * 0.17, 0.5));
    cue('whoosh', tMove, 0.55); cue('whoosh', tMove + 0.3, 0.45);
    cue('chime', tAB, 0.7); cue('ding', tEq + 0.1, 0.8);
    cue('whoosh', tShrink, 0.4); cue('pop', tCard1, 0.5); cue('pop', tCard2, 0.6);
    cue('swell', tLight - 0.4, 0.5, { dur: 1.2 });
    const darkEl = document.getElementById('darkbg');
    window.__dark = (t) => Math.min(ep(t, tDark, 0.9, ease.inOutCubic), 1 - ep(t, tLight, 0.9, ease.inOutCubic));
    return (t) => {
      beb(t, tBeb, tZh, tBebOut);
      head(t, tHead, tDark + 0.2);
      fadeUp(tag, t, tPl + 0.3, 0.6, 10, tLight + 0.2, 0.4);
      // player in / shrink
      const pp = ep(t, tPl, 0.8, ease.outQuart);
      const sh = ep(t, tShrink, 0.9, ease.inOutCubic);
      const pq = 1 - prog(t, tLight - 0.1, tLight + 0.4);
      const s = lerp(0.9, 1, pp) * lerp(1, 0.62, sh);
      const dx = lerp(0, -390, sh), dy = lerp(0, -10, sh);
      css(player, { opacity: f2(Math.min(pp, pq)), transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${s.toFixed(4)})`, transformOrigin: '50% 50%' });
      fadeUp(ttl, t, tTtl, 0.6, 20, tTtlOut, 0.4);
      const vt = Math.max(0, t - tPl);
      timeTxt.textContent = `0:${String(Math.floor(vt)).padStart(2, '0')}`;
      css(progF, { width: `${clamp(vt / 84 * 100, 0, 100).toFixed(2)}%` });
      // big square + triangles
      draw(bigD, ep(t, tBig, 0.8, ease.inOutCubic));
      T.forEach((tr, i) => {
        const a = ep(t, tTri + i * 0.12, 0.4);
        const pulse = Math.sin(Math.PI * prog(t, tPulse + i * 0.17, tPulse + i * 0.17 + 0.45));
        const mv = ep(t, tMove + i * 0.13, 1.1, ease.inOutCubic);
        const lift = Math.sin(Math.PI * mv);
        const tx = tr.d[0] * K * mv, ty = tr.d[1] * K * mv;
        const cxy = tr.v.reduce((acc, p) => [acc[0] + p[0] / 3, acc[1] + p[1] / 3], [0, 0]);
        const [ccx, ccy] = P(cxy[0], cxy[1]);
        const sc2 = 1 + 0.06 * pulse + 0.05 * lift;
        attr(tr.el, { transform: `translate(${tx.toFixed(1)} ${ty.toFixed(1)}) translate(${ccx.toFixed(1)} ${ccy.toFixed(1)}) scale(${sc2.toFixed(4)}) translate(${(-ccx).toFixed(1)} ${(-ccy).toFixed(1)})`, opacity: f2(a), fill: `rgba(88,196,221,${(0.5 + 0.35 * pulse).toFixed(3)})` });
      });
      const cA = Math.min(ep(t, tC, 0.5), 1 - ep(t, tMove, 0.4));
      attr(cSq, { opacity: f2(cA) });
      pop(lc, t, tC + 0.1, 0.45, tMove + 0.3, 0.3);
      [ea, eb, ec].forEach((el, i) => pop(el, t, tTri + 0.45 + i * 0.1, 0.4, tPulse, 0.3));
      attr(ghost, { opacity: f2(Math.min(ep(t, tGhost, 0.4), 1 - ep(t, tAB + 0.6, 0.5)) * 0.95) });
      attr(aSq, { opacity: f2(ep(t, tAB, 0.5)) }); attr(bSq, { opacity: f2(ep(t, tAB + 0.2, 0.5)) });
      pop(la, t, tAB + 0.1, 0.45); pop(lb, t, tAB + 0.3, 0.45);
      fadeUp(eqn, t, tEq, 0.6, 24);
      // TTS cards + waveform
      fadeUp(card1, t, tCard1, 0.55, 30, tLight + 0.1, 0.4);
      fadeUp(card2, t, tCard2, 0.55, 30, tLight + 0.1, 0.4);
      // highlight the option this very narration was made with
      if (window.L.TTS.paid) card1.className = t > tWl ? 'tts-card hot' : 'tts-card';
      else card2.className = t > tCard2 + 0.3 ? 'tts-card hot' : 'tts-card';
      const wa = Math.min(ep(t, tWave, 0.5), 1 - prog(t, tLight, tLight + 0.4));
      bars.forEach((b, i) => {
        const v = env(t - (NB - 1 - i) * 0.035);
        const hh = 6 + 80 * Math.min(1, v) * wa;
        attr(b, { y: (WY - hh / 2).toFixed(1), height: hh.toFixed(1), opacity: f2(wa * (0.35 + 0.65 * (i / NB))) });
      });
      fadeUp(wl, t, tWl, 0.5, 14, tLight + 0.1, 0.35);
      fadeUp(wb, t, tWave + 0.2, 0.5, 14, tLight + 0.1, 0.35);
    };
  });
})();
