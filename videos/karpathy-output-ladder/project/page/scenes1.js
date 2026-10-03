/* Scenes: hook, intro (+ staircase component), rung1 (text), rung2 (diagram). */
(function () {
  const L = window.L;
  const { clamp, lerp, prog, ease, ep, win, kf, S, E, W, WE, SC, cue, h, sv, css, attr, show, fadeUp, pop, typer,
    prepDraw, draw, drawSeq, roughSvg, scene, f3 } = window.L;

  // ===================================================================== shared components
  // Rung header (left column)
  window.makeRungHead = function (root, num, zh, en, desc) {
    const el = h('div', { class: 'rhead' },
      h('div', { class: 'num' }, num), h('div', { class: 'ttl' }, zh), h('div', { class: 'en' }, en),
      h('div', { class: 'rule' }), h('div', { class: 'desc' }, desc));
    root.append(el);
    const parts = Array.from(el.children);
    return (t, t0, t1 = Infinity) => {
      parts.forEach((p, i) => fadeUp(p, t, t0 + i * 0.09, 0.6, 40, t1, 0.35));
      const r = parts[3]; css(r, { width: `${(72 * ep(t, t0 + 0.35, 0.6)).toFixed(1)}px` });
    };
  };
  // "BUT EVEN BETTER / 还能更好" stamp
  window.makeBEB = function (root) {
    const en = h('div', { class: 'en' }, 'But even better'), zh = h('div', { class: 'zh' }, '还能更好'), bar = h('div', { class: 'bar' });
    const el = h('div', { class: 'beb' }, en, zh, bar);
    root.append(el);
    return (t, tIn, tZh, tOut) => {
      const p = ep(t, tIn, 0.7, ease.outQuart), q = 1 - prog(t, tOut, tOut + 0.4);
      show(en, Math.min(p, q), (1 - p) * -160 + (1 - q) * 60, 0, 1);
      const z = ep(t, tZh, 0.45, ease.outBack);
      show(zh, Math.min(clamp(z * 1.5), q), 0, (1 - z) * 20, lerp(0.85, 1, z));
      css(bar, { width: `${(420 * ep(t, tZh + 0.1, 0.5)).toFixed(1)}px`, opacity: (q).toFixed(3) });
    };
  };

  // Isometric staircase (used by intro + outro). Labels are printed on the front faces.
  window.makeStairs = function (root, opt) {
    const o = Object.assign({ ox: 726, oy: 520, Lx: 170, Ly: 140, Hz: 140, labels: ['文字', '图解', '网页', '视频'] }, opt || {});
    const c = Math.cos(Math.PI / 6), s = 0.5;
    const P = (x, y, z) => [o.ox + (x - y) * c, o.oy + (x + y) * s - z];
    const svg = sv('svg', { width: 1920, height: 1080, style: 'position:absolute;left:0;top:0' });
    root.append(svg);
    const steps = [];
    const lblLayer = h('div', { class: 'abs', style: 'left:0;top:0' });
    for (let i = 0; i < 4; i++) {
      const g = sv('g', {}, svg);
      const x0 = i * o.Lx, x1 = (i + 1) * o.Lx, z1 = (i + 1) * o.Hz;
      const poly = (pts, fill) => sv('polygon', { points: pts.map((p) => P(...p).map((v) => v.toFixed(1)).join(',')).join(' '), fill, stroke: '#c4b397', 'stroke-width': 1.6, 'stroke-linejoin': 'round' }, g);
      const right = poly([[x1, 0, 0], [x1, o.Ly, 0], [x1, o.Ly, z1], [x1, 0, z1]], '#d6c4a6');
      const front = poly([[x0, o.Ly, 0], [x1, o.Ly, 0], [x1, o.Ly, z1], [x0, o.Ly, z1]], '#eadcc4');
      const top = poly([[x0, 0, z1], [x1, 0, z1], [x1, o.Ly, z1], [x0, o.Ly, z1]], '#fffaf0');
      const [fx, fy] = P((x0 + x1) / 2, o.Ly, z1 / 2);
      const lbl = h('div', { class: 'stair-lbl', style: 'display:flex;align-items:baseline;gap:10px;transform-origin:0 0' }, h('div', { class: 'n' }, '0' + (i + 1)), h('div', { class: 'z' }, o.labels[i]));
      css(lbl, { left: `${fx.toFixed(1)}px`, top: `${fy.toFixed(1)}px` });
      lblLayer.append(lbl);
      steps.push({ g, top, front, right, lbl, top3: P((i + 0.5) * o.Lx, o.Ly / 2, z1) });
    }
    root.append(lblLayer);
    const bebs = [];
    for (let i = 0; i < 3; i++) {
      const a = steps[i].top3, b = steps[i + 1].top3;
      const el = h('div', { class: 'beb-mini' }, '还能更好！', h('i', {}, 'but even better'));
      css(el, { left: `${((a[0] + b[0]) / 2 - 30).toFixed(1)}px`, top: `${((a[1] + b[1]) / 2 - 118).toFixed(1)}px` });
      root.append(el);
      bebs.push(el);
    }
    // little climber
    const fig = sv('g', {}, svg);
    sv('ellipse', { cx: 0, cy: 0, rx: 22, ry: 8, fill: 'rgba(60,40,20,0.18)' }, fig);
    const body = sv('g', {}, fig);
    sv('rect', { x: -14, y: -54, width: 28, height: 42, rx: 13, fill: '#1f1b17' }, body);
    sv('circle', { cx: 0, cy: -70, r: 14, fill: '#1f1b17' }, body);
    sv('circle', { cx: 5, cy: -72, r: 2.8, fill: '#fffaf0' }, body);
    const flag = sv('g', {}, svg);
    sv('line', { x1: 0, y1: 0, x2: 0, y2: -96, stroke: '#1f1b17', 'stroke-width': 4, 'stroke-linecap': 'round' }, flag);
    sv('path', { d: 'M2,-96 L58,-81 L2,-64 Z', fill: '#d97757' }, flag);
    const tops = steps.map((st) => st.top3);
    const SK = `matrix(${c.toFixed(4)}, ${s}, 0, 1, 0, 0)`;
    return {
      steps, bebs,
      render(t, { build = [], lblAt = [], bebAt = [], fig: f = null, figA = 1, hot = -1, flagAt = Infinity, out = Infinity }) {
        const q = 1 - prog(t, out, out + 0.45);
        steps.forEach((st, i) => {
          const p = build[i] == null ? 1 : ep(t, build[i], 0.55, ease.outBackS);
          const a = build[i] == null ? 1 : clamp(prog(t, build[i], build[i] + 0.25));
          const dy = (1 - p) * 70;
          attr(st.g, { transform: `translate(0 ${dy.toFixed(1)})`, opacity: (a * q).toFixed(3) });
          attr(st.top, { fill: i === hot ? '#f7d5c4' : '#fffaf0' });
          const lp = lblAt[i] == null ? clamp(prog(t, (build[i] ?? -1) + 0.15, (build[i] ?? -1) + 0.5)) : ep(t, lblAt[i], 0.45);
          css(st.lbl, { opacity: (lp * q).toFixed(3), transform: `translate(0px, ${dy.toFixed(1)}px) ${SK} translate(-50%, -50%)`, color: i === hot ? '#b85a3a' : '#1f1b17' });
        });
        bebs.forEach((el, i) => {
          const p = bebAt[i] == null ? 0 : ep(t, bebAt[i], 0.45, ease.outBack);
          css(el, { opacity: (clamp(p * 1.8) * q).toFixed(3), transform: `translate(-50%,-50%) rotate(-8deg) scale(${lerp(0.6, 1, p).toFixed(3)})` });
        });
        if (f == null) { attr(fig, { opacity: 0 }); } else {
          const ff = clamp(f, 0, 3), i0 = Math.min(2, Math.floor(ff)), fr = ff - i0;
          const a = tops[i0], b = tops[i0 + 1];
          const x = lerp(a[0], b[0], fr), y = lerp(a[1], b[1], fr) - Math.sin(Math.PI * fr) * 80;
          attr(fig, { transform: `translate(${x.toFixed(1)} ${(y + 4).toFixed(1)})`, opacity: (figA * q).toFixed(3) });
        }
        const fp = ep(t, flagAt, 0.5, ease.outBack);
        const tp = tops[3];
        attr(flag, { transform: `translate(${(tp[0] + 40).toFixed(1)} ${(tp[1] + 6).toFixed(1)}) scale(${fp.toFixed(3)})`, opacity: (clamp(fp * 2) * q).toFixed(3) });
      },
    };
  };

  // ===================================================================== HOOK
  const ANSWER = '勾股定理，又称毕达哥拉斯定理，是平面几何中最基本、也最著名的定理之一。它描述的是直角三角形三条边之间的数量关系：两条直角边的平方和，等于斜边的平方。用符号表示，就是 a² + b² = c²。\n\n' +
    '早在《周髀算经》中，就记载了“勾三股四弦五”的说法；古希腊的毕达哥拉斯学派则给出了一般性的证明。历史上，这个定理的证明方法多达数百种，其中包括欧几里得在《几何原本》中给出的经典证明、三国时期赵爽的“弦图”，以及美国总统加菲尔德的梯形证法。\n\n' +
    '从应用上看，勾股定理贯穿了测量、建筑、导航、计算机图形学等众多领域。比如，在平面直角坐标系中计算两点之间的距离，本质上就是在使用勾股定理；在三维空间中，它可以推广为 d² = x² + y² + z²；在更高维的欧几里得空间，乃至内积空间里，它同样成立，并成为向量范数与正交分解的基础。\n\n' +
    '此外，满足 a² + b² = c² 的正整数三元组被称为“勾股数”，例如 (3, 4, 5)、(5, 12, 13)、(8, 15, 17)。所有本原勾股数都可以由欧几里得公式生成：a = m² - n²，b = 2mn，c = m² + n²，其中 m > n > 0，且 m、n 互质、一奇一偶。费马大定理则进一步追问：把平方换成更高的次方，这个方程是否还有正整数解？这个问题困扰了数学家三百多年，直到 1994 年才由安德鲁·怀尔斯最终证明。\n\n' +
    '如果从教学的角度来理解，勾股定理还可以借助面积拼接、相似三角形、坐标计算、向量内积等多种视角来讲解，每一种视角都会揭示它与其他数学分支之间千丝万缕的联系……';

  scene('hook', (root) => {
    const chat = h('div', { class: 'card abs', id: 'hk-chat' },
      h('div', { class: 'chat-head' }, h('div', { class: 'spark', html: '<svg width="24" height="24" viewBox="0 0 24 24"><path d="M12 2 L13.6 10.4 L22 12 L13.6 13.6 L12 22 L10.4 13.6 L2 12 L10.4 10.4 Z" fill="#fff"/></svg>' }), '大模型', h('div', { class: 'sub' }, 'generating…')),
      h('div', { class: 'chat-body' },
        h('div', { class: 'bubble-u' }, '帮我解释一下勾股定理'),
        h('div', { class: 'answer-wrap' }, h('div', { id: 'hk-answer', style: 'white-space: pre-wrap' }))),
      h('div', { class: 'chat-fade' }),
      h('div', { class: 'chat-foot' }, '已生成', h('span', { class: 'big', id: 'hk-count' }, '0'), '字', h('span', { id: 'hk-time', style: 'margin-left:auto;letter-spacing:0.08em' }, '▶▶ 快进')));
    const q1 = h('div', { class: 'hk-q' }, '读得完', h('span', { class: 'qm' }, '？'));
    const q2 = h('div', { class: 'hk-q' }, '看得懂', h('span', { class: 'qm' }, '？'));
    css(q1, { left: '330px', top: '330px' });
    css(q2, { left: '1010px', top: '520px' });
    root.append(chat, q1, q2);
    const ans = chat.querySelector('#hk-answer');
    const type = typer(ans, ANSWER);
    const bubble = chat.querySelector('.bubble-u');
    const count = chat.querySelector('#hk-count'), time = chat.querySelector('#hk-time');
    const wrap = chat.querySelector('.answer-wrap');
    const t0 = 1.0, t1 = S('s02') + 0.6;
    cue('pop', 0.55, 0.6);
    cue('stream', t0, 0.55, { dur: t1 - t0 });
    cue('hit', W('s02', '读得完') - 0.05, 0.9);
    cue('hit', W('s02', '看得懂') - 0.05, 0.9);
    let lastScroll = null;
    return (t) => {
      const pin = ep(t, 0.1, 0.7, ease.outCubic);
      const blur = ep(t, S('s02') - 0.15, 0.7, ease.inOutCubic);
      css(chat, {
        opacity: (Math.min(1, pin * 1.2) * lerp(1, 0.22, blur)).toFixed(3),
        transform: `translateY(${((1 - pin) * 60).toFixed(1)}px) scale(${lerp(1, 0.93, blur).toFixed(4)})`,
        filter: blur > 0.001 ? `blur(${(blur * 7).toFixed(2)}px)` : 'none',
      });
      pop(bubble, t, 0.5, 0.4);
      const p = prog(t, t0, t1);
      const n = ANSWER.length * ease.inQuad(p);
      type(n);
      // keep the newest text in view
      const hh = ans.offsetHeight, vh = wrap.clientHeight;
      const lines = Math.max(0, hh - vh);
      // scroll in proportion to how much text is visible (prefix height ~ proportional)
      const vis = n / ANSWER.length;
      const sc = Math.max(0, hh * vis - vh + 40);
      const y = -Math.min(lines, sc);
      if (y !== lastScroll) { lastScroll = y; ans.style.transform = `translateY(${y.toFixed(1)}px)`; }
      count.textContent = Math.round(12846 * ease.inQuad(p)).toLocaleString('en-US');
      css(time, { opacity: t < t1 ? (Math.floor(t * 2) % 2 ? '0.45' : '1') : '0.45' });
      pop(q1, t, W('s02', '读得完') - 0.08, 0.5);
      pop(q2, t, W('s02', '看得懂') - 0.08, 0.5);
    };
  });

  // ===================================================================== INTRO
  scene('intro', (root) => {
    // the tweet's verbatim opening line + translation; 'understand' / 读懂 light up on the spoken word
    const body = h('div', { class: 'post-en' }, 'We’ll be spending a lot more time trying to ', h('span', { class: 'hl' }, 'understand'), ' the outputs of language models.');
    const zh = h('div', { class: 'post-zh' }, '以后，我们会花越来越多的时间，去', h('span', { class: 'hl' }, '读懂'), '大模型的输出。');
    const card = h('div', { class: 'card abs', id: 'in-card' },
      h('div', { class: 'post-top' }, h('div', { class: 'avatar' }, 'AK'),
        h('div', {}, h('div', { class: 'post-name' }, 'Andrej Karpathy'), h('div', { class: 'post-handle' }, '@karpathy · 2026年10月2日')),
        h('div', { class: 'post-tag' }, '推文原文 · 开头')),
      body, zh);
    root.append(card);
    const hls = [body, zh].map((el) => el.querySelector('.hl'));
    const stairs = window.makeStairs(root, {});
    const tCard = S('s03') - 0.35, tOut = S('s04') - 0.15;
    const build = [0, 1, 2, 3].map((i) => S('s04') + 0.2 + i * 0.3);
    const tb = W('s05', '还能更好');
    const hops = [W('s05', '每上一级') + 0.05, tb + 0.42, tb + 0.84];
    const bebAt = [tb - 0.02, hops[1] + 0.3, hops[2] + 0.3];
    cue('whoosh', tCard, 0.5);
    cue('hl', W('s03', '读懂'), 0.5);
    build.forEach((b) => cue('tick', b + 0.1, 0.7));
    hops.forEach((b) => cue('hop', b, 0.6));
    bebAt.forEach((b) => cue('chime', b + 0.05, 0.55));
    return (t) => {
      const p = ep(t, tCard, 0.7);
      const q = ep(t, tOut, 0.6, ease.inOutCubic);
      css(card, { opacity: (Math.min(p, 1 - q)).toFixed(3), transform: `translateY(${((1 - p) * 60 - q * 120).toFixed(1)}px) scale(${lerp(1, 0.9, q).toFixed(4)})` });
      const hp = `${(100 * ep(t, W('s03', '读懂'), 0.5)).toFixed(1)}% 100%`;
      hls.forEach((el) => css(el, { backgroundSize: hp }));
      let f = null;
      if (t >= hops[0] - 0.6) {
        f = kf(t, [[hops[0], 0], [hops[0] + 0.38, 1, ease.inOutQuad], [hops[1], 1], [hops[1] + 0.38, 2, ease.inOutQuad], [hops[2], 2], [hops[2] + 0.38, 3, ease.inOutQuad]]);
      }
      stairs.render(t, { build, bebAt, fig: f, figA: ep(t, hops[0] - 0.6, 0.4) });
    };
  });

  // ===================================================================== RUNG 1 — writing (ASD-STE100)
  scene('rung1', (root) => {
    const head = window.makeRungHead(root, '01', '文字', 'WRITING', '让它用 ASD-STE100 来写');
    const PLANE = '<svg width="74" height="74" viewBox="0 0 74 74"><circle cx="37" cy="37" r="36" fill="#1f1b17"/><path d="M37 13 C40 13 41 17 41 21 L41 31 L59 41 L59 46 L41 40 L41 52 L47 57 L47 61 L37 58 L27 61 L27 57 L33 52 L33 40 L15 46 L15 41 L33 31 L33 21 C33 17 34 13 37 13 Z" fill="#fffaf0"/></svg>';
    // --- spec card
    const year = (y, txt) => h('div', { class: 'yr' }, h('b', {}, y), h('span', {}, txt));
    const years = [year('1979', '航空业开始制定'), year('1986', '首版指南发布'), year('2005', '定名 ASD-STE100')];
    const spec = h('div', { class: 'card abs', id: 'r1-spec' },
      h('div', { class: 'sp-top' }, h('div', { class: 'plane', html: PLANE }),
        h('div', {}, h('div', { class: 'sp-name' }, 'ASD-STE100'), h('div', { class: 'sp-sub' }, 'Simplified Technical English · ', h('span', { class: 'hl' }, '简化技术英语')))),
      h('div', { class: 'sp-origin' }, '最早用途：', h('b', {}, '飞机维修手册'), h('span', { class: 'sp-src' }, '受控语言规范 · 由欧洲航空航天与防务工业协会维护')),
      h('div', { class: 'yrs' }, ...years));
    root.append(spec);
    const specHl = spec.querySelector('.hl'), plane = spec.querySelector('.plane'), origin = spec.querySelector('.sp-origin');
    // --- rule chips
    const rule = (zh, en) => h('div', { class: 'rule-chip' }, h('div', { class: 'z' }, zh), h('div', { class: 'e' }, en));
    const rules = [rule('一词一义', 'ONE WORD, ONE MEANING'), rule('一句一个指令', 'ONE INSTRUCTION PER SENTENCE'), rule('步骤句 ≤ 20 个词', 'MAX 20 WORDS')];
    const ruleRow = h('div', { class: 'abs', id: 'r1-rules' }, ...rules);
    root.append(ruleRow);
    // --- before / after
    const BEFORE = [['It is '], ['imperative', 1], [' that the operator '], ['ensures', 1], [' the hydraulic reservoir is '], ['replenished', 1], [' '], ['prior to', 1], [' '], ['commencing', 1], [' operation.']];
    const AFTER = [['Make sure', 2], [' that the hydraulic reservoir is '], ['full', 2], [' '], ['before', 2], [' you '], ['start', 2], [' the operation.']];
    const sentence = (parts, cls) => {
      const el = h('div', { class: 'ste-s' }); const marks = [];
      parts.forEach(([w, k]) => { if (k) { const m = h('span', { class: cls }, w); marks.push(m); el.append(m); } else el.append(w); });
      return [el, marks];
    };
    const [bS, bMarks] = sentence(BEFORE, 'bad');
    const [aS, aMarks] = sentence(AFTER, 'good');
    const before = h('div', { class: 'card abs ste-card', id: 'r1-before' },
      h('div', { class: 'ste-lbl bad-l' }, '× 原文：用词绕、一个词多种意思'), bS);
    const wc = h('div', { class: 'wc' }, h('b', {}, '13'), ' 个词 · 上限 20');
    const gloss = h('div', { class: 'ste-zh' }, '开始操作前，确认液压油箱是满的。');
    const after = h('div', { class: 'card abs ste-card', id: 'r1-after' },
      h('div', { class: 'ste-lbl good-l' }, '✓ ASD-STE100 改写', wc), aS, gloss);
    const arrow = h('div', { class: 'abs ste-arrow', html: '<svg width="60" height="54" viewBox="0 0 60 54"><path d="M30 4 V40 M14 26 L30 44 L46 26" fill="none" stroke="#b85a3a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>' });
    const srcNote = h('div', { class: 'abs credit', style: 'left:800px;top:146px' }, '例句来自 Karpathy 推文配图');
    root.append(before, arrow, after, srcNote);
    const llm = h('div', { class: 'abs llm-pill' }, '大模型对这套规范很熟 ✓');
    root.append(llm);
    // --- strictness meter: "80% of the way to ASD-STE100"
    const meter = h('div', { class: 'card abs', id: 'r1-meter' },
      h('div', { class: 'm-top' }, h('span', {}, '写作约束'), h('span', { class: 'm-q' }, '“80% of the way to ASD-STE100”')),
      h('div', { class: 'm-track' }, h('div', { class: 'm-fill' }), h('div', { class: 'm-knob' }), h('div', { class: 'm-tick', style: 'left:80%' })),
      h('div', { class: 'm-ends' }, h('span', {}, '随便写'), h('span', { class: 'm-80' }, '八成就好'), h('span', {}, '100% 原版规范')));
    root.append(meter);
    const mFill = meter.querySelector('.m-fill'), mKnob = meter.querySelector('.m-knob'), m80 = meter.querySelector('.m-80');
    // --- thought cloud + head (the picture you still have to draw yourself)
    const think = sv('svg', { width: 1920, height: 1080, style: 'position:absolute;left:0;top:0' });
    root.append(think);
    const cloud = sv('g', {}, think);
    const rc = roughSvg(think);
    cloud.appendChild(rc.ellipse(0, 0, 470, 270, { seed: 11, roughness: 1.6, stroke: '#4a433b', strokeWidth: 2.4, fill: '#fffaf0', fillStyle: 'solid' }));
    const tri = rc.polygon([[-110, 70], [-110, -60], [70, 70]], { seed: 3, roughness: 2.6, bowing: 3, stroke: '#b85a3a', strokeWidth: 3.2 });
    cloud.appendChild(tri);
    const triD = prepDraw(Array.from(tri.querySelectorAll('path')));
    const qs = [[110, -40, 52], [150, 30, 40], [40, -80, 34]].map(([x, y, sz]) => { const q = sv('text', { x, y, 'font-size': sz, 'font-family': 'LXGW WenKai', fill: '#b85a3a', 'text-anchor': 'middle' }, cloud); q.textContent = '?'; return q; });
    const dots = [[226, 168, 16], [254, 202, 11], [276, 230, 7]].map(([x, y, r]) => sv('circle', { cx: x, cy: y, r, fill: '#fffaf0', stroke: '#4a433b', 'stroke-width': 2.2 }, cloud));
    const lbl = sv('text', { x: -10, y: 125, 'font-size': 30, 'font-family': 'LXGW WenKai', fill: '#4a433b', 'text-anchor': 'middle' }, cloud);
    lbl.textContent = '脑内绘图中……';
    const headG = sv('g', {}, think);
    sv('path', { d: 'M0,0 C-8,-58 18,-112 70,-118 C120,-122 150,-88 150,-50 C150,-30 160,-22 168,-8 C172,0 164,4 156,6 L158,30 C158,46 142,50 128,48 L124,80 L40,80 L40,40 C14,30 2,18 0,0 Z', fill: '#2d2823' }, headG);

    // ---------------- timing
    const sc = SC('rung1');
    const tSpec = W('s06', 'ASD') - 0.25, tHl = W('s07', '简化') - 0.1, tPlane = W('s07', '飞机') - 0.2, tYears = W('s07', '最早') - 0.1;
    const tR = [W('s08', '一个词') - 0.1, W('s08', '一句话') - 0.1, W('s08', '二十') - 0.15];
    const tOut1 = S('s08a') - 0.35;
    const tBefore = S('s08a') - 0.1, tBad = W('s08a', '绕口') - 0.05, tAfter = W('s08a', '改写') - 0.1, tGloss = W('s08a', '开始操作前') - 0.1;
    const tLLM = W('s08b', '很熟') - 0.1, tUp = S('s08b') + 0.1, tMeter = W('s08b', '太死板') - 0.3, t80 = W('s08b', '八成') - 0.1;
    const tThink = W('s08c', '那张图') - 0.2;
    cue('whoosh', sc.start + 0.2, 0.4); cue('pop', tSpec, 0.55); cue('hl', tHl, 0.45); cue('whoosh', tPlane, 0.35);
    tR.forEach((x) => cue('tick', x, 0.7));
    cue('whoosh', tBefore, 0.4); bMarks.forEach((m, i) => cue('scribble', tBad + i * 0.16, 0.25, { dur: 0.18 }));
    cue('ding', tAfter + 0.15, 0.6); cue('pop', tLLM, 0.5); cue('slide', tMeter + 0.3, 0.45, { dur: 1.4 }); cue('chime', t80 + 0.05, 0.55);
    cue('pop', tThink, 0.6); cue('scribble', tThink + 0.45, 0.6, { dur: 1.4 });

    return (t) => {
      head(t, sc.start + 0.25);
      // phase 1-2: spec card + rules, then make room for the example
      const o1 = 1 - ep(t, tOut1, 0.45, ease.inOutCubic);
      const sp = ep(t, tSpec, 0.65);
      css(spec, { opacity: f3(Math.min(sp, o1)), transform: `translateY(${((1 - sp) * 50 - (1 - o1) * 40).toFixed(1)}px)` });
      css(specHl, { backgroundSize: `${(100 * ep(t, tHl, 0.5)).toFixed(1)}% 100%` });
      const pp = ep(t, tPlane, 0.9, ease.outCubic);
      css(plane, { transform: `translate(${((1 - pp) * -60).toFixed(1)}px, ${((1 - pp) * 30).toFixed(1)}px) rotate(${((1 - pp) * -25).toFixed(1)}deg)` });
      css(origin, { opacity: f3(0.25 + 0.75 * ep(t, tPlane, 0.5)) });
      years.forEach((y, i) => pop(y, t, tYears + i * 0.22, 0.4));
      rules.forEach((r, i) => pop(r, t, tR[i], 0.45));
      css(ruleRow, { opacity: f3(o1), transform: `translateY(${(-(1 - o1) * 40).toFixed(1)}px)` });
      // phase 3: before -> after
      const ob = 1 - ep(t, tUp, 0.5, ease.inOutCubic);
      fadeUp(srcNote, t, tBefore + 0.3, 0.5, 10, tThink, 0.4);
      const bp = ep(t, tBefore, 0.55);
      css(before, { opacity: f3(Math.min(bp, ob)), transform: `translateY(${((1 - bp) * 40 - (1 - ob) * 30).toFixed(1)}px)` });
      bMarks.forEach((m, i) => css(m, { backgroundSize: `${(100 * ep(t, tBad + i * 0.16, 0.25)).toFixed(1)}% 100%`, color: t > tBad + i * 0.16 ? '#b23a2a' : '#3a342d' }));
      const ap = ep(t, tAfter, 0.6);
      const up = ep(t, tUp, 0.8, ease.inOutCubic);
      css(after, { opacity: f3(ap), transform: `translateY(${((1 - ap) * 40 - up * 300).toFixed(1)}px)` });
      css(arrow, { opacity: f3(Math.min(ep(t, tAfter - 0.25, 0.3), ob)), transform: `translateY(${((1 - ep(t, tAfter - 0.25, 0.4)) * -16).toFixed(1)}px)` });
      aMarks.forEach((m, i) => css(m, { backgroundSize: `${(100 * ep(t, tAfter + 0.35 + i * 0.12, 0.3)).toFixed(1)}% 100%` }));
      pop(wc, t, tAfter + 0.7, 0.4);
      fadeUp(gloss, t, tGloss, 0.5, 12);
      pop(llm, t, tLLM, 0.45);
      // phase 4: strictness meter 0 -> 100% -> 80%
      fadeUp(meter, t, tMeter, 0.55, 30);
      const v = kf(t, [[tMeter + 0.3, 0], [tMeter + 1.1, 1, ease.inOutCubic], [t80, 1], [t80 + 0.6, 0.8, ease.outBack]]);
      css(mFill, { width: `${(v * 100).toFixed(2)}%` }); css(mKnob, { left: `${(v * 100).toFixed(2)}%` });
      css(m80, { opacity: f3(ep(t, t80, 0.4)) });
      // phase 5: still have to picture it yourself
      const dim = ep(t, tThink - 0.1, 0.5);
      [after, meter, llm].forEach((el) => { if (dim > 0) css(el, { filter: `blur(${(dim * 1.6).toFixed(2)}px)`, opacity: f3(lerp(1, 0.4, dim) * (el === after ? ap : 1)) }); else css(el, { filter: 'none' }); });
      const cp = ep(t, tThink, 0.55, ease.outBack);
      attr(cloud, { transform: `translate(1420 610) scale(${lerp(0.5, 1, cp).toFixed(3)})`, opacity: clamp(cp * 1.6).toFixed(3) });
      attr(headG, { transform: 'translate(1800 952) scale(-0.86 0.86)', opacity: clamp(ep(t, tThink - 0.2, 0.4)).toFixed(3) });
      dots.forEach((d, i) => attr(d, { opacity: clamp(prog(t, tThink + 0.05 * i, tThink + 0.05 * i + 0.2)).toFixed(2) }));
      drawSeq(triD, prog(t, tThink + 0.45, tThink + 1.6));
      qs.forEach((q, i) => attr(q, { opacity: clamp(prog(t, tThink + 1.0 + i * 0.25, tThink + 1.3 + i * 0.25)).toFixed(2), transform: `translate(0 ${(Math.sin((t + i) * 3) * 4).toFixed(1)})` }));
    };
  });

  // ===================================================================== RUNG 2 — diagram
  scene('rung2', (root) => {
    const beb = window.makeBEB(root);
    const head = window.makeRungHead(root, '02', '图解', 'DIAGRAM', '让它画一张图');
    const u = 54, C = [1176, 610];
    const A = [C[0], C[1] - 3 * u], B = [C[0] + 4 * u, C[1]];
    const n = [3 * u, -4 * u];
    const svg = sv('svg', { width: 1920, height: 1080, style: 'position:absolute;left:0;top:0' });
    root.append(svg);
    const rc = roughSvg(svg);
    const gGrid = sv('g', {}, svg);
    const gCells = sv('g', {}, svg);
    const gShapes = sv('g', {}, svg);
    const opts = (seed, stroke, w = 3) => ({ seed, roughness: 1.15, bowing: 1.2, stroke, strokeWidth: w });
    const sqA = [[C[0] - 3 * u, C[1] - 3 * u], [C[0], C[1] - 3 * u], [C[0], C[1]], [C[0] - 3 * u, C[1]]];
    const sqB = [[C[0], C[1]], [C[0] + 4 * u, C[1]], [C[0] + 4 * u, C[1] + 4 * u], [C[0], C[1] + 4 * u]];
    const sqC = [A, B, [B[0] + n[0], B[1] + n[1]], [A[0] + n[0], A[1] + n[1]]];
    const shA = rc.polygon(sqA, opts(21, '#4f7fae')), shB = rc.polygon(sqB, opts(22, '#5e9467')), shC = rc.polygon(sqC, opts(23, '#d97757', 3.4));
    const shT = rc.polygon([A, B, C], Object.assign(opts(24, '#1f1b17', 3.6), { fill: 'rgba(31,27,23,0.07)', fillStyle: 'solid' }));
    [shA, shB, shC, shT].forEach((s) => gShapes.appendChild(s));
    const strokes = (g) => Array.from(g.querySelectorAll('path')).filter((p) => p.getAttribute('stroke') && p.getAttribute('stroke') !== 'none');
    const dT = prepDraw(strokes(shT)), dA = prepDraw(strokes(shA)), dB = prepDraw(strokes(shB)), dC = prepDraw(strokes(shC));
    const fillT = Array.from(shT.querySelectorAll('path')).filter((p) => !strokes(shT).includes(p));
    // faint grid lines inside squares
    const gridLines = [];
    const gl = (x1, y1, x2, y2, col) => { const l = sv('line', { x1, y1, x2, y2, stroke: col, 'stroke-width': 1.2, 'stroke-dasharray': '3 5', opacity: 0 }, gGrid); gridLines.push(l); return l; };
    for (let k = 1; k < 3; k++) { gl(C[0] - 3 * u + k * u, C[1] - 3 * u, C[0] - 3 * u + k * u, C[1], '#4f7fae'); gl(C[0] - 3 * u, C[1] - 3 * u + k * u, C[0], C[1] - 3 * u + k * u, '#4f7fae'); }
    for (let k = 1; k < 4; k++) { gl(C[0] + k * u, C[1], C[0] + k * u, C[1] + 4 * u, '#5e9467'); gl(C[0], C[1] + k * u, C[0] + 4 * u, C[1] + k * u, '#5e9467'); }
    const ax = [0.8 * u, 0.6 * u], ay = [0.6 * u, -0.8 * u];
    for (let k = 1; k < 5; k++) {
      gl(A[0] + k * ax[0], A[1] + k * ax[1], A[0] + k * ax[0] + 5 * ay[0], A[1] + k * ax[1] + 5 * ay[1], '#d97757');
      gl(A[0] + k * ay[0], A[1] + k * ay[1], A[0] + k * ay[0] + 5 * ax[0], A[1] + k * ay[1] + 5 * ax[1], '#d97757');
    }
    // cells
    const ang = Math.atan2(3, 4) * 180 / Math.PI;
    const cells = [];
    const mkCell = (col) => { const g = sv('g', {}, gCells); sv('rect', { x: -(u - 10) / 2, y: -(u - 10) / 2, width: u - 10, height: u - 10, rx: 7, fill: col, opacity: 0.88 }, g); return g; };
    const tgt = (i, j) => [A[0] + (i + 0.5) * ax[0] + (j + 0.5) * ay[0], A[1] + (i + 0.5) * ax[1] + (j + 0.5) * ay[1]];
    const blueT = [], greenT = [];
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) ((i < 3 && j < 3) ? blueT : greenT).push(tgt(i, j));
    let bi = 0, gi = 0;
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) cells.push({ g: mkCell('#4f7fae'), from: [C[0] - 3 * u + (i + 0.5) * u, C[1] - 3 * u + (j + 0.5) * u], to: blueT[bi++], k: cells.length, grp: 0 });
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) cells.push({ g: mkCell('#5e9467'), from: [C[0] + (i + 0.5) * u, C[1] + (j + 0.5) * u], to: greenT[gi++], k: cells.length, grp: 1 });
    // labels
    const lbl = (txt, x, y, col) => { const el = L.centered(h('div', { class: 'calc' }, txt)); css(el, { left: `${x}px`, top: `${y}px`, color: col }); root.append(el); return el; };
    const lA = lbl('3×3 = 9', C[0] - 1.5 * u - 150, C[1] - 1.5 * u - 150, '#4f7fae');
    const lB = lbl('4×4 = 16', C[0] + 2 * u - 250, C[1] + 2 * u + 40, '#5e9467');
    const lC = lbl('9 + 16 = 25', 1690, 250, '#b85a3a');
    const lC2 = lbl('= 5 × 5', 1690, 314, '#b85a3a');
    const side = (txt, x, y) => { const el = L.centered(h('div', { class: 'calc' }, txt)); css(el, { left: `${x}px`, top: `${y}px`, color: '#1f1b17', fontSize: '40px' }); root.append(el); return el; };
    const sa = side('3', C[0] + 22, C[1] - 1.55 * u), sb = side('4', C[0] + 0.95 * u, C[1] - 24), sc5 = side('5', C[0] + 2.35 * u, C[1] - 0.72 * u);
    // check
    const chk = rc.linearPath([[1600, 520], [1650, 580], [1770, 430]], { seed: 9, roughness: 1.4, stroke: '#3f8a4c', strokeWidth: 9 });
    svg.appendChild(chk);
    const dChk = prepDraw(Array.from(chk.querySelectorAll('path')));
    const okTxt = h('div', { class: 'anno' }, '一眼看懂');
    css(okTxt, { left: '1610px', top: '600px', color: '#3f8a4c' });
    root.append(okTxt);

    const img = h('img', { src: 'assets/ste100_overview.png', alt: '' });
    const imgCard = h('div', { class: 'card abs', id: 'r2-img' }, h('div', { class: 'tw-clip' }, img),
      h('div', { class: 'tw-cap' }, h('b', {}, 'Karpathy 推文配图'), '：ASD-STE100 一页速览（结构 · 例句 · 词典 · 规则上限 · 历史）'));
    root.append(imgCard);
    const sc = SC('rung2');
    const tImg = S('s09a') - 0.25, tZoom = W('s09a', '整份') - 0.1, tImgOut = S('s10') - 0.8;
    cue('whoosh', tImg, 0.45); cue('hl', tZoom, 0.4);
    const tBeb = sc.start + 0.1, tZh = S('s09') - 0.05, tBebOut = S('s09') + 1.0;
    const tHead = S('s09') + 1.05;
    const tTri = S('s10') - 0.55, tSq = W('s10', '三条边') - 0.1;
    const tA = W('s10', '三乘三') - 0.1, tA9 = W('s10', '九') - 0.1;
    const tB = W('s10', '四乘四') - 0.1, tB16 = W('s10', '十六') - 0.1;
    const tFly = W('s11', '加起来') - 0.15, t25 = W('s11', '二十五') - 0.05, t55 = W('s11', '五乘五') - 0.1;
    const tOk = W('s11', '一眼') - 0.1;
    cue('whoosh', tBeb, 0.7); cue('stamp', tZh, 0.9);
    cue('scribble', tTri, 0.55, { dur: 0.8 }); cue('scribble', tSq, 0.5, { dur: 1.0 });
    for (let k = 0; k < 9; k++) cue('tick', tA + k * 0.055, 0.35);
    for (let k = 0; k < 16; k++) cue('tick', tB + k * 0.035, 0.3);
    cue('whoosh', tFly, 0.6); cue('chime', t25, 0.6); cue('ding', tOk + 0.2, 0.8);
    return (t) => {
      beb(t, tBeb, tZh, tBebOut);
      head(t, tHead);
      const ip = ep(t, tImg, 0.6), iq = 1 - ep(t, tImgOut, 0.45, ease.inOutCubic);
      css(imgCard, { opacity: f3(Math.min(ip, iq)), transform: `translateY(${((1 - ip) * 40).toFixed(1)}px) scale(${lerp(1, 0.94, 1 - iq).toFixed(4)})` });
      css(img, { transform: `scale(${(1 + 0.55 * ep(t, tZoom, 2.2, ease.inOutCubic)).toFixed(4)})` });
      draw(dT, ep(t, tTri, 0.8, ease.inOutCubic));
      fillT.forEach((f) => css(f, { opacity: ep(t, tTri + 0.5, 0.5).toFixed(3) }));
      draw(dA, ep(t, tSq, 0.55, ease.inOutCubic));
      draw(dB, ep(t, tSq + 0.3, 0.6, ease.inOutCubic));
      draw(dC, ep(t, tSq + 0.6, 0.7, ease.inOutCubic));
      [sa, sb, sc5].forEach((el, i) => pop(el, t, tTri + 0.5 + i * 0.12, 0.4));
      const gp = ep(t, tSq + 0.5, 0.6);
      gridLines.forEach((l) => attr(l, { opacity: (gp * 0.55).toFixed(3) }));
      const glow = ep(t, t55, 0.4);
      attr(shC, { opacity: 1 });
      cells.forEach((c) => {
        const tIn = c.grp === 0 ? tA + c.k * 0.055 : tB + (c.k - 9) * 0.035;
        const pin = ep(t, tIn, 0.35, ease.outBack);
        const pf = ep(t, tFly + c.k * 0.035, 0.85, ease.inOutCubic);
        const x = lerp(c.from[0], c.to[0], pf), y = lerp(c.from[1], c.to[1], pf) - Math.sin(Math.PI * pf) * 60;
        const r = ang * pf;
        attr(c.g, { transform: `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${r.toFixed(2)}) scale(${(pin * lerp(1, 0.98, pf)).toFixed(3)})`, opacity: clamp(pin * 2).toFixed(3) });
      });
      pop(lA, t, tA9, 0.45); pop(lB, t, tB16, 0.45);
      pop(lC, t, t25, 0.45); pop(lC2, t, t55, 0.45);
      attr(shC, { style: `filter: drop-shadow(0 0 ${(glow * 10).toFixed(1)}px rgba(217,119,87,${(glow * 0.6).toFixed(2)}))` });
      draw(dChk, ep(t, tOk, 0.45, ease.outCubic));
      pop(okTxt, t, tOk + 0.25, 0.45);
    };
  });
})();
