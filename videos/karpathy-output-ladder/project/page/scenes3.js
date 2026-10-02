/* Scenes: why (discardable software), bottleneck (comprehension), outro (+ end card). */
(function () {
  const L = window.L;
  const { clamp, lerp, prog, ease, ep, win, kf, hash, S, E, W, WE, SC, TL, env, cue, h, sv, css, attr, show, fadeUp, pop, typer,
    prepDraw, draw, scene } = window.L;
  const f2 = (x) => (Math.round(x * 1000) / 1000).toString();

  // ===================================================================== WHY — discardable software
  scene('why', (root) => {
    const q = h('div', { class: 'abs', id: 'wy-q' }, '为什么直到现在，才能这样玩？');
    root.append(q);
    // chart
    const svg = sv('svg', { width: 1920, height: 1080, style: 'position:absolute;left:0;top:0' });
    root.append(svg);
    const O = [170, 800], XE = 960, YT = 250, TH = 560;
    const axes = sv('path', { d: `M${O[0]} ${YT} L${O[0]} ${O[1]} L${XE} ${O[1]}`, fill: 'none', stroke: '#1f1b17', 'stroke-width': 3.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, svg);
    const arrows = sv('path', { d: `M${O[0] - 10} ${YT + 14} L${O[0]} ${YT} L${O[0] + 10} ${YT + 14} M${XE - 14} ${O[1] - 10} L${XE} ${O[1]} L${XE - 14} ${O[1] + 10}`, fill: 'none', stroke: '#1f1b17', 'stroke-width': 3.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, svg);
    const thr = sv('line', { x1: O[0], y1: TH, x2: XE - 20, y2: TH, stroke: '#b85a3a', 'stroke-width': 3, 'stroke-dasharray': '12 10' }, svg);
    const txt = (s, x, y, o = {}) => { const t = sv('text', Object.assign({ x, y, 'font-size': 26, fill: '#4a433b', 'font-family': 'Noto Sans SC' }, o), svg); t.textContent = s; return t; };
    const yl = txt('做一个东西的成本', O[0] + 18, YT + 8, { 'font-weight': 700, fill: '#1f1b17' });
    const xl = txt('时间', XE - 10, O[1] + 44, { 'text-anchor': 'end' });
    const tl = txt('值得做的门槛', XE - 20, TH - 16, { 'text-anchor': 'end', fill: '#b85a3a', 'font-weight': 700 });
    let d = '';
    const curveY = (x) => { const k = 3.2, u = (x - 200) / 720; return 300 + (770 - 300) * (1 - Math.exp(-k * u)) / (1 - Math.exp(-k)); };
    for (let x = 200; x <= 920; x += 8) d += (x === 200 ? 'M' : 'L') + x + ' ' + curveY(x).toFixed(1) + ' ';
    const curve = sv('path', { d, fill: 'none', stroke: '#d97757', 'stroke-width': 7, 'stroke-linecap': 'round' }, svg);
    const curveD = prepDraw([curve]);
    const cl1 = txt('智能、代码：越来越充裕', 230, 286, { fill: '#b85a3a', 'font-size': 25 });
    const cl2 = txt('成本一路下降 ↘', 560, 336, { fill: '#b85a3a', 'font-size': 28, 'font-weight': 700 });
    // artifacts
    const ARTS = [['网页', 'web'], ['解说视频', 'video'], ['小工具', 'tool'], ['交互图解', 'chart']];
    const ICON = {
      web: '<svg width="40" height="32" viewBox="0 0 40 32"><rect x="2" y="2" width="36" height="28" rx="4" fill="none" stroke="currentColor" stroke-width="3"/><path d="M2 10 H38" stroke="currentColor" stroke-width="3"/></svg>',
      video: '<svg width="40" height="32" viewBox="0 0 40 32"><rect x="2" y="2" width="36" height="28" rx="5" fill="none" stroke="currentColor" stroke-width="3"/><path d="M16 10 L26 16 L16 22 Z" fill="currentColor"/></svg>',
      tool: '<svg width="40" height="32" viewBox="0 0 40 32"><path d="M8 26 L22 12 M22 12 a7 7 0 1 0 6 -6 l-4 4 l-2 -2 l4 -4 a7 7 0 0 0 -4 8" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
      chart: '<svg width="40" height="32" viewBox="0 0 40 32"><path d="M4 28 V16 M14 28 V8 M24 28 V18 M34 28 V4" stroke="currentColor" stroke-width="5" stroke-linecap="round"/></svg>',
    };
    const arts = ARTS.map(([zh, ic], i) => {
      const el = h('div', { class: 'art' }, h('div', { class: 'i', html: ICON[ic] }), zh);
      root.append(el);
      return { el, x: 300 + i * 175, ic };
    });
    const COLS = ['#4f7fae', '#d97757', '#5e9467', '#c58b2c'];
    // bin for "用完就扔"
    const bin = h('div', { class: 'abs', html: '<svg width="70" height="80" viewBox="0 0 70 80"><path class="lid" d="M6 16 H64 M26 16 V8 H44 V16" fill="none" stroke="#4a433b" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 24 L17 74 H53 L58 24 Z" fill="#e9dcc6" stroke="#4a433b" stroke-width="5" stroke-linejoin="round"/><path d="M28 34 V64 M42 34 V64" stroke="#4a433b" stroke-width="4" stroke-linecap="round"/></svg>' });
    css(bin, { left: '962px', top: '690px' });
    root.append(bin);
    // quote card
    const words = [
      ['as ', 0], ['intelligence and code are increasingly abundant', 1], [', you can ask for ', 0], ['large', 2], [', ', 0], ['custom', 3], [', ', 0],
      ['discardable', 4], [' ', 0], ['software artifacts', 5], [' ', 0], ['(e.g. web apps, video explainers)', 6], [' that would have ', 0], ['never made sense to create before', 7], ['.', 0],
    ];
    const qen = h('div', { class: 'qt-en' });
    const wEls = [];
    words.forEach(([w, k]) => { if (k) { const s = h('span', { class: 'w' }, w); wEls[k] = s; qen.append(s); } else qen.append(w); });
    const qcard = h('div', { class: 'card abs', id: 'wy-quote' },
      h('div', { class: 'qt-mark' }, '“'), qen,
      h('div', { class: 'qt-by' }, '— Andrej Karpathy · 2026.10.02（推文摘录）'),
      h('div', { class: 'qt-zh' }, '当智能和代码越来越充裕，你就可以要求那些又大、又定制、用完即弃的软件作品（比如网页应用、解说视频）——放在以前，做这些根本不划算。'));
    root.append(qcard);
    const zh = qcard.querySelector('.qt-zh');
    css(qen, { fontSize: '41px' });

    const sc = SC('why');
    const tQ = Math.min(S('s23') - 0.25, SC('why').start + 0.35), tQup = S('s24') - 0.35;
    const tAx = S('s24') - 0.2, tCurve0 = W('s24', '智能') - 0.1, tCurve1 = E('s24') + 0.2;
    const tArts = S('s24') + 0.4, tDrop = W('s25', '专门') - 0.1;
    const tToss = W('s25', '用完就扔') - 0.05;
    const tWeb = W('s26', '一个网页') - 0.1, tVid = W('s26', '解说视频') - 0.1, tNever = W('s26', '根本不值得') - 0.1;
    const hl = { 1: W('s24', '智能') - 0.05, 2: W('s25', '又大') - 0.05, 3: W('s25', '又定制') - 0.02, 4: W('s25', '用完就扔') - 0.05, 5: W('s25', '软件作品') - 0.05, 6: W('s26', '比如') - 0.05, 7: W('s26', '根本') - 0.1 };
    cue('whoosh', SC('why').start + 0.2, 0.5);
    cue('hit', tQ, 0.6); cue('scribble', tAx, 0.4, { dur: 0.6 }); cue('slide', tCurve0, 0.45, { dur: tCurve1 - tCurve0 });
    [0, 1, 2, 3].forEach((i) => cue('tick', tDrop + i * 0.18 + 0.4, 0.55));
    cue('whoosh', tToss, 0.5); cue('thud', tToss + 0.6, 0.6);
    Object.values(hl).forEach((x) => cue('hl', x, 0.35));
    return (t) => {
      // big question → title
      const pq = ep(t, tQ, 0.6, ease.outBack), up = ep(t, tQup, 0.8, ease.inOutCubic);
      css(q, { opacity: f2(clamp(pq * 1.5)), top: `${lerp(440, 66, up).toFixed(1)}px`, transform: `scale(${(lerp(0.85, 1, pq) * lerp(1, 0.6, up)).toFixed(4)})` });
      // axes
      const ap = ep(t, tAx, 0.7);
      [axes, arrows, thr, yl, xl, tl].forEach((el, i) => attr(el, { opacity: f2(ep(t, tAx + i * 0.08, 0.5)) }));
      draw(curveD, ep(t, tCurve0, tCurve1 - tCurve0, ease.inOutSine));
      attr(cl1, { opacity: f2(ep(t, tCurve0 + 0.2, 0.5)) });
      attr(cl2, { opacity: f2(ep(t, tCurve1 - 0.3, 0.5)) });
      // artifacts: start above threshold (gray, "not worth it"), drop below when cost falls
      arts.forEach((a, i) => {
        const pin = ep(t, tArts + i * 0.12, 0.5, ease.outBack);
        const dp = ep(t, tDrop + i * 0.18, 0.7, ease.outBack);
        let x = a.x, y = lerp(420, 680, dp);
        const col = dp > 0.5 ? COLS[i] : '#a89d8c';
        let o = clamp(pin * 1.6), s = lerp(0.7, 1, pin), rot = 0;
        if (a.ic === 'tool') {   // tossed into the bin
          const tp = ep(t, tToss, 0.7, ease.inOutQuad);
          x = lerp(x, 997, tp); y = lerp(y, 722, tp) - Math.sin(Math.PI * tp) * 170;
          s *= lerp(1, 0.25, tp); rot = 260 * tp; o *= 1 - prog(t, tToss + 0.55, tToss + 0.7);
        }
        const hot = (a.ic === 'web' && t > tWeb) || (a.ic === 'video' && t > tVid) ? 1 : 0;
        css(a.el, { left: `${x.toFixed(1)}px`, top: `${y.toFixed(1)}px`, opacity: f2(o), transform: `translate(-50%,-50%) scale(${(s * (1 + 0.08 * hot)).toFixed(4)}) rotate(${rot.toFixed(1)}deg)`,
          color: col, filter: dp > 0.5 ? 'none' : 'grayscale(1)', boxShadow: hot ? `0 0 0 4px ${COLS[i]}, 0 10px 30px rgba(60,40,20,0.18)` : '0 6px 20px rgba(60,40,20,0.12)' });
      });
      const bp = Math.min(ep(t, tToss - 0.4, 0.4, ease.outBack), 1 - prog(t, sc.end - 0.6, sc.end - 0.2));
      const wob = Math.sin(clamp(prog(t, tToss + 0.6, tToss + 1.1)) * Math.PI * 4) * 8 * (1 - prog(t, tToss + 0.6, tToss + 1.1));
      css(bin, { opacity: f2(clamp(bp * 1.5)), transform: `scale(${lerp(0.6, 1, bp).toFixed(3)}) rotate(${wob.toFixed(2)}deg)` });
      // quote card
      fadeUp(qcard, t, tQup + 0.1, 0.7, 40);
      for (const k in hl) css(wEls[k], { backgroundSize: `${(100 * ep(t, hl[k], 0.45)).toFixed(1)}% 100%` });
      css(zh, { opacity: f2(0.35 + 0.65 * ep(t, tNever + 0.3, 0.6)) });
    };
  });

  // ===================================================================== BOTTLENECK — comprehension
  scene('bottleneck', (root) => {
    const cv = h('canvas', { id: 'bn-canvas', width: 1920, height: 1080 });
    root.append(cv);
    const ctx = cv.getContext('2d');
    const svg = sv('svg', { width: 1920, height: 1080, style: 'position:absolute;left:0;top:0' });
    root.append(svg);
    const SRC = [300, 470], MOUTH = 1240, BRAIN = [1620, 520];
    // source box
    const src = sv('g', {}, svg);
    sv('rect', { x: SRC[0] - 120, y: SRC[1] - 80, width: 240, height: 160, rx: 26, fill: '#1f1b17' }, src);
    const st = sv('text', { x: SRC[0], y: SRC[1] + 12, 'font-size': 40, fill: '#fffaf0', 'text-anchor': 'middle', 'font-family': 'Noto Serif SC', 'font-weight': 900 }, src);
    st.textContent = '大模型';
    // the bottle: neck faces the stream, its width is the comprehension bandwidth
    const bottle = sv('path', { fill: 'rgba(255,255,255,0.55)', stroke: '#4a433b', 'stroke-width': 4, 'stroke-linejoin': 'round' }, svg);
    const clipId = 'bn-clip';
    const defs = sv('defs', {}, svg);
    const clip = sv('clipPath', { id: clipId }, defs);
    const clipPath = sv('path', {}, clip);
    const liquid = sv('rect', { x: 1240, width: 560, fill: 'rgba(217,119,87,0.55)', 'clip-path': `url(#${clipId})` }, svg);
    const shine = sv('path', { d: 'M1500 312 C1600 300 1680 304 1728 330', fill: 'none', stroke: 'rgba(255,255,255,0.9)', 'stroke-width': 8, 'stroke-linecap': 'round' }, svg);
    const bottlePath = (w) => {
      const y0 = 470, a = y0 - w / 2, b = y0 + w / 2;
      return `M1236 ${a - 10} L1252 ${a - 10} L1252 ${a} L1380 ${a} C1430 ${a} 1440 280 1500 280 L1700 280 C1770 280 1790 330 1790 470 C1790 610 1770 660 1700 660 L1500 660 C1440 660 1430 ${b} 1380 ${b} L1252 ${b} L1252 ${b + 10} L1236 ${b + 10} Z`;
    };
    // labels
    const lab = (s, x, y, cls) => { const el = h('div', { class: cls }, s); css(el, { left: `${x}px`, top: `${y}px` }); root.append(el); return el; };
    const l1 = lab('生成：几乎免费', 150, 250, 'bn-lbl'), l1s = lab('上万字，转眼就有', 152, 322, 'bn-sub');
    const l2 = lab('理解力：瓶颈', 1340, 158, 'bn-lbl'), l2s = lab('瓶口多宽，一次就只能进多少', 1344, 230, 'bn-sub');
    const lvl = h('div', { class: 'lvl' }, ...['文字', '图解', '网页', '视频'].map((s) => h('div', { class: 'c' }, s)));
    css(lvl, { left: '700px', top: '780px' });
    root.append(lvl);
    const lvlCaption = lab('瓶口宽度', 560, 792, 'bn-sub');
    const verify = h('div', { class: 'card abs', id: 'bn-verify' },
      h('div', { class: 'r' }, h('span', { class: 'x', style: 'background:#f6e2d7;color:#b85a3a' }, '!'), '形式越丰富，越难逐字核对'),
      h('div', { class: 'r' }, h('span', { class: 'x', style: 'background:#dcebd9;color:#2f6b3a', html: window.CHECK_SVG }), '关键结论，自己验证'));
    css(verify, { left: '140px', top: '600px' });
    root.append(verify);
    const rows = Array.from(verify.children);

    const sc = SC('bottleneck');
    const t0 = sc.start + 0.2;
    const tL1 = W('s27', '生成') - 0.1, tL2 = W('s27', '理解力') - 0.15;
    const tLv = W('s28', '台阶') - 0.1;
    const lvT = [tLv, tLv + 0.75, tLv + 1.5, tLv + 2.25];
    const WIDTHS = [26, 80, 150, 240];
    const aperture = (t) => kf(t, [[lvT[0], WIDTHS[0]], [lvT[1], WIDTHS[1]], [lvT[1] + 0.01, WIDTHS[1]], [lvT[2], WIDTHS[2]], [lvT[2] + 0.01, WIDTHS[2]], [lvT[3], WIDTHS[3]]], ease.outBack);
    const tV1 = W('s29', '形式') - 0.15, tV2 = W('s29', '关键') - 0.15;
    cue('stream', t0, 0.3, { dur: sc.end - t0 - 0.4 });
    cue('hit', tL1, 0.5); cue('hit', tL2, 0.5);
    lvT.forEach((x, i) => cue('step', x, 0.55 + i * 0.08));
    cue('pop', tV1, 0.55); cue('ding', tV2, 0.7);
    const N = 1250, DT = 0.0155;
    return (t) => {
      const fade = 1 - prog(t, sc.end - 0.5, sc.end);
      attr(src, { opacity: f2(ep(t, t0, 0.5)), transform: `translate(0 ${(Math.sin(t * 3) * 3).toFixed(1)})` });
      const w = aperture(t);
      const fy = 470;
      const bo = f2(ep(t, t0 + 0.2, 0.6));
      const bp = bottlePath(w);
      attr(bottle, { d: bp, opacity: bo }); attr(clipPath, { d: bp }); attr(shine, { opacity: bo });
      fadeUp(l1, t, tL1, 0.5, 20); fadeUp(l1s, t, tL1 + 0.2, 0.5, 20);
      fadeUp(l2, t, tL2, 0.5, 20); fadeUp(l2s, t, tL2 + 0.2, 0.5, 20);
      fadeUp(lvl, t, tLv - 0.4, 0.5, 20); fadeUp(lvlCaption, t, tLv - 0.4, 0.5, 20);
      Array.from(lvl.children).forEach((c, i) => { c.className = t >= lvT[i] ? 'c on' : 'c'; });
      fadeUp(verify, t, tV1 - 0.1, 0.5, 30);
      rows.forEach((r, i) => fadeUp(r, t, i ? tV2 : tV1, 0.45, 16));
      let fill = 0;
      // particles
      ctx.clearRect(0, 0, 1920, 1080);
      const vis = ep(t, t0, 0.6) * fade;
      if (vis > 0) {
        for (let i = 0; i < N; i++) {
          const te = t0 + i * DT;
          if (te > t) break;
          const yo = (hash(i) - 0.5) * 300, v = 560 + 260 * hash(i + 13);
          const x0 = SRC[0] + 110, y0 = SRC[1] + yo * 0.35;
          const d1 = (MOUTH - x0) / v, ta = te + d1;
          const age = t - te;
          let x, y, a = 1, col = '#4a433b';
          if (t < ta) {
            const p = age / d1;
            x = x0 + (MOUTH - x0) * p; y = y0 + (fy + yo - y0) * p;
          } else {
            const wa = aperture(ta);
            const ok = Math.abs(yo) < wa / 2;
            const a2 = t - ta;
            if (ok) {
              const p = clamp(a2 / 0.55);
              x = lerp(MOUTH, BRAIN[0] + (hash(i + 9) - 0.5) * 220, ease.inQuad(p)); y = lerp(fy + yo, BRAIN[1] + (hash(i + 5) - 0.5) * 120, p);
              a = 1 - prog(a2, 0.4, 0.55); col = '#d97757';
              if (p >= 1) { fill += 1; continue; }
            } else {
              x = MOUTH - 8 - (60 + 150 * hash(i + 21)) * a2;
              y = fy + yo + (Math.sign(yo || 1) * 70 + (hash(i + 17) - 0.5) * 120) * a2 + 340 * a2 * a2;
              a = 1 - clamp(a2 / 0.7);
              if (a <= 0) continue;
            }
          }
          ctx.globalAlpha = a * vis * 0.9;
          ctx.fillStyle = col;
          const wdt = 10 + 16 * hash(i + 3);
          ctx.fillRect(x - wdt / 2, y - 2.5, wdt, 5);
        }
        ctx.globalAlpha = 1;
      }
      const lvl2 = Math.min(1, fill / 520);
      const top = lerp(652, 330, lvl2);
      attr(liquid, { y: top.toFixed(1), height: (660 - top + 6).toFixed(1), opacity: f2(ep(t, t0 + 0.2, 0.6) * fade) });
    };
  });

  // ===================================================================== OUTRO
  scene('outro', (root) => {
    const PH = '问点什么…';
    const TXT = '解释一下勾股定理';
    const pt = h('span', { class: 'pt' }), extra = h('span', { class: 'pt hl' }), caret = h('span', { class: 'caret' }), ph = h('span', { class: 'pt ph' }, PH);
    const input = h('div', { class: 'card abs', id: 'ot-input' }, h('div', { style: 'display:flex;align-items:center' }, ph, pt, extra, caret));
    root.append(input);
    let lastN = -1;
    const typeA = (n) => { n = Math.round(n); if (n !== lastN) { lastN = n; pt.textContent = TXT.slice(0, n); } };
    const sTxt = h('div', { class: 'sugg', style: 'border-color:#c9bca6;color:#968b7c;background:#f4efe6' }, '只要一段文字');
    const s1 = h('div', { class: 'sugg' }, '用网页回答我'), s2 = h('div', { class: 'sugg' }, '给我做个视频');
    css(sTxt, { left: '360px', top: '470px' }); css(s1, { left: '760px', top: '470px' }); css(s2, { left: '1150px', top: '470px' });
    const strike = h('div', { class: 'abs', style: 'height:4px;background:#b85a3a;border-radius:2px;left:372px;top:510px;width:0' });
    root.append(sTxt, s1, s2, strike);
    const howT = h('div', { class: 'abs', style: 'left:0;right:0;top:150px;text-align:center;font-family:var(--serif);font-weight:900;font-size:66px' }, '这个视频，是怎么做出来的？');
    root.append(howT);
    const pre = (html) => { const p = document.createElement('pre'); p.innerHTML = html; return p; };
    const mk = (ic, title, body) => { const el = h('div', { class: 'card mk' }, h('div', { class: 'h' }, h('div', { class: 'ic' }, ic), title), body); root.append(el); return el; };
    const m1 = mk('1', '大模型写脚本', pre('<span class="c">// script.json</span>\n{\n  <span class="k">"id"</span>: <span class="s">"s18"</span>,\n  <span class="k">"text"</span>: <span class="s">"你看：四个一样的</span>\n<span class="s">   三角形，在大正方形</span>\n<span class="s">   里换个位置……"</span>\n}'));
    const m2 = mk('2', '用代码画动画', pre('<span class="c">// 每一帧都是 t 的函数</span>\n<span class="k">renderFrame</span> = (t) => {\n  const p = ease(t - W(<span class="s">"换个位置"</span>));\n  triangles.<span class="k">move</span>(p);\n  subtitle.<span class="k">show</span>(t);\n};\n<span class="c">// Chromium 逐帧截图 → MP4</span>'));
    const waveSvg = sv('svg', { width: 406, height: 200 });
    const m3 = mk('3', L.TTS.card, waveSvg);
    const NB = 34;
    const wbars = Array.from({ length: NB }, (_, i) => sv('rect', { x: i * 12, width: 7, rx: 3, fill: '#d97757' }, waveSvg));
    const eng = sv('text', { x: 0, y: 190, 'font-size': 22, fill: '#968b7c', 'font-family': 'Noto Sans SC' }, waveSvg);
    eng.textContent = L.TTS.detail;
    css(m1, { left: '150px', top: '300px' }); css(m2, { left: '725px', top: '300px' }); css(m3, { left: '1300px', top: '300px' });
    const stairWrap = h('div', { class: 'abs', style: 'inset:0' });
    root.append(stairWrap);
    const stairs = window.makeStairs(stairWrap, {});
    const end = h('div', { class: 'abs', id: 'ot-end' },
      h('div', { class: 't' }, '读懂 AI 的四级台阶'),
      h('div', { class: 's', html: '文字<b>→</b>图解<b>→</b>网页<b>→</b>视频' }),
      h('div', { class: 'c', html: '灵感来源：Andrej Karpathy（@karpathy）2026 年 10 月 2 日推文<br>本视频的脚本、动画与配音均由 AI 生成' }));
    root.append(end);

    const tIn = S('s30') - 0.35, tTy0 = S('s30') + 0.2, tTy1 = W('s30', '别只要') - 0.2;
    const tTxt = W('s30', '一段文字') - 0.2, tStrike = WE('s30', '一段文字') - 0.05;
    const tS1 = W('s31', '用网页') - 0.1, tS2 = W('s31', '给我做个视频') - 0.1;
    const tOut1 = S('s32') - 0.1, tHow = S('s32') + 0.25;
    const tM1 = W('s33', '大模型') - 0.15, tM2 = W('s33', '用代码') - 0.1, tM3 = W('s33', '再用') - 0.1;
    const tOut2 = E('s33') + 0.25;
    const tSt = E('s33') + 0.45, tHop = W('s34', '最上面') - 0.25;
    const tEnd = E('s34') + 0.55;
    cue('whoosh', tIn, 0.45); cue('type', tTy0, 0.45, { dur: tTy1 - tTy0 }); cue('pop', tTxt, 0.4); cue('thud', tStrike, 0.4);
    cue('pop', tS1, 0.6); cue('pop', tS2, 0.6); cue('type', tS1, 0.35, { dur: 0.5 });
    cue('hit', tHow, 0.5); cue('pop', tM1, 0.55); cue('pop', tM2, 0.55); cue('pop', tM3, 0.55);
    cue('whoosh', tSt, 0.45); cue('hop', tHop, 0.6); cue('chime', tHop + 0.45, 0.7); cue('swell', tEnd - 0.3, 0.7, { dur: 2.5 }); cue('final', tEnd, 0.8);
    return (t) => {
      const ip = ep(t, tIn, 0.6), iq = ep(t, tOut1, 0.5, ease.inOutCubic);
      css(input, { opacity: f2(Math.min(ip, 1 - iq)), transform: `translateY(${((1 - ip) * 40 - iq * 60).toFixed(1)}px)` });
      typeA(lerp(0, TXT.length, prog(t, tTy0, tTy1)));
      css(ph, { display: t < tTy0 ? 'inline' : 'none' });
      const ex = t >= tS2 ? '，给我做个视频' : t >= tS1 ? '，用网页回答我' : '';
      extra.textContent = ex;
      css(caret, { opacity: Math.floor(t * 2.4) % 2 === 0 ? '1' : '0.15' });
      [[sTxt, tTxt], [s1, tS1], [s2, tS2]].forEach(([el, tt]) => {
        const p = ep(t, tt, 0.45, ease.outBack);
        show(el, Math.min(clamp(p * 2), 1 - iq), 0, -iq * 60, lerp(0.7, 1, p));
      });
      css(strike, { width: `${(244 * ep(t, tStrike, 0.35)).toFixed(1)}px`, opacity: f2(1 - iq) });
      css(sTxt, { color: t > tStrike ? '#b9ae9e' : '#968b7c' });
      fadeUp(howT, t, tHow, 0.6, 30, tOut2 + 0.1, 0.4);
      [[m1, tM1], [m2, tM2], [m3, tM3]].forEach(([el, tt]) => fadeUp(el, t, tt, 0.55, 50, tOut2 + 0.1, 0.4));
      wbars.forEach((b, i) => { const v = env(t - (NB - 1 - i) * 0.04); const hh = 6 + 120 * Math.min(1, v); attr(b, { y: (85 - hh / 2).toFixed(1), height: hh.toFixed(1) }); });
      // stairs + climber
      const sa = ep(t, tSt, 0.6);
      css(stairWrap, { opacity: f2(sa * (1 - prog(t, tEnd - 0.2, tEnd + 0.4))) });
      const f = kf(t, [[tHop, 2], [tHop + 0.45, 3, ease.inOutQuad]]);
      stairs.render(t, { fig: sa > 0 ? f : null, figA: sa, hot: t > tHop + 0.4 ? 3 : -1, flagAt: tHop + 0.45 });
      const ea = ep(t, tEnd, 0.9, ease.inOutCubic);
      css(end, { opacity: f2(ea) });
      Array.from(end.children).forEach((c, i) => fadeUp(c, t, tEnd + 0.2 + i * 0.25, 0.7, 26));
    };
  });
})();
