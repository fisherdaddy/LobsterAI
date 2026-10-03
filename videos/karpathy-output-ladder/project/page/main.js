/* Stage wiring: background, HUD, subtitles, scene lifecycle, page contract. */
(function () {
  const { TL, clamp, lerp, prog, ease, ep, S, E, SC, css, h, scenes, sceneAlpha, f3 } = window.L;
  const stage = document.getElementById('stage');

  // ---------------- background paper (static)
  function paintPaper() {
    const c = document.getElementById('bgfx'); const g = c.getContext('2d');
    const grd = g.createRadialGradient(960, 470, 80, 960, 540, 1150);
    grd.addColorStop(0, '#f8f4ec'); grd.addColorStop(1, '#ebe3d5');
    g.fillStyle = grd; g.fillRect(0, 0, 1920, 1080);
    let s = 1234567;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < 26000; i++) {
      const x = rnd() * 1920, y = rnd() * 1080, a = rnd() * 0.05;
      g.fillStyle = rnd() < 0.5 ? `rgba(90,70,40,${a})` : `rgba(255,255,255,${a * 1.4})`;
      g.fillRect(x, y, 1.4, 1.4);
    }
    g.fillStyle = 'rgba(80,60,30,0.07)';
    for (let x = 40; x < 1920; x += 48) for (let y = 36; y < 1080; y += 48) { g.beginPath(); g.arc(x, y, 1.6, 0, Math.PI * 2); g.fill(); }
  }

  // ---------------- HUD
  const hudTL = h('div', { id: 'hud-tl' }, h('span', { class: 't1' }, '读懂 AI 的四级台阶'), h('span', { class: 't2' }, 'KARPATHY 推文解读'));
  const chips = ['文字', '图解', '网页', '视频'].map((z, i) => h('div', { class: 'rchip' }, h('b', {}, String(i + 1).padStart(2, '0')), z));
  const hudTR = h('div', { id: 'hud-tr' }, ...chips);
  // ---------------- subtitles
  const subText = h('span', { id: 'subtext' });
  const pill = h('div', { class: 'pill' }, subText);
  const subs = h('div', { id: 'subs' }, pill);

  // ---------------- scenes
  const built = [];
  function build() {
    for (const sc of scenes) {
      const el = h('div', { class: 'scene', id: 'sc-' + sc.name });
      stage.insertBefore(el, document.getElementById('hud-anchor'));
      sc.el = el;
      el.style.display = 'block';   // SVG geometry must be rendered while building (getTotalLength)
      sc.renderFn = sc.build(el);
      built.push(sc);
    }
    stage.append(hudTL, hudTR, subs);
  }

  const RUNGS = ['rung1', 'rung2', 'rung3', 'rung4'];
  const esc = (x) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  function breakSub(text) {
    if (text.length <= 31) return esc(text);
    const mid = text.length / 2; let best = -1, bd = 1e9;
    for (let i = 4; i < text.length - 4; i++) {
      if ('，。：；！？、'.includes(text[i]) && !'”」）'.includes(text[i + 1])) { const d = Math.abs(i + 1 - mid); if (d < bd) { bd = d; best = i + 1; } }
      else if ('”」）'.includes(text[i]) && '，。：；！？、'.includes(text[i - 1])) { const d = Math.abs(i + 1 - mid); if (d < bd) { bd = d; best = i + 1; } }
    }
    if (best < 0 || bd > text.length * 0.3) return esc(text);
    return esc(text.slice(0, best)) + '<br>' + esc(text.slice(best));
  }
  const segs = TL.segments;
  function renderSubs(t, dark) {
    let best = null, bestA = 0;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i], nx = segs[i + 1];
      const hold = nx ? Math.max(0.05, Math.min(0.45, nx.start - s.end - 0.08)) : 0.6;
      const a = Math.min(prog(t, s.start - 0.14, s.start + 0.02), 1 - prog(t, s.end + hold - 0.12, s.end + hold));
      if (a > bestA) { bestA = a; best = s; }
    }
    if (best && subText.__src !== best.text) { subText.__src = best.text; subText.innerHTML = breakSub(best.text); }
    const d = dark;
    css(pill, {
      opacity: f3(bestA),
      background: `rgba(${Math.round(lerp(255, 18, d))},${Math.round(lerp(252, 22, d))},${Math.round(lerp(246, 29, d))},${lerp(0.88, 0.82, d).toFixed(3)})`,
    });
    css(subText, { color: d > 0.5 ? '#efe9de' : '#29241e' });
  }

  function renderFrame(t) {
    const dark = window.__dark ? window.__dark(t) : 0;
    css(document.getElementById('darkbg'), { opacity: f3(dark) });
    for (const sc of built) {
      const a = sceneAlpha(sc.name, t);
      if (a <= 0.0005) { css(sc.el, { display: 'none' }); continue; }
      css(sc.el, { display: 'block', opacity: f3(a) });
      sc.renderFn(t);
    }
    // HUD
    const r1 = SC('rung1').start, bnEnd = SC('outro').start;   // HUD lives from the first rung until the outro
    const hudA = Math.min(prog(t, r1 + 0.2, r1 + 0.8), 1 - prog(t, bnEnd - 0.6, bnEnd - 0.1)) * (1 - dark);
    css(hudTL, { opacity: f3(hudA) });
    const trA = Math.min(prog(t, r1 + 0.2, r1 + 0.8), 1 - prog(t, SC('rung4').end - 0.4, SC('rung4').end)) * (1 - dark);
    css(hudTR, { opacity: f3(trA) });
    const cur = RUNGS.findIndex((r) => t >= SC(r).start && t < SC(r).end);
    chips.forEach((c, i) => { const cls = 'rchip' + (i === cur ? ' on' : (cur > i ? ' done' : '')); if (c.className !== cls) c.className = cls; });
    renderSubs(t, dark);
  }

  build();
  paintPaper();
  window.VIDEO = {
    width: 1920, height: 1080, fps: TL.fps, duration: TL.duration,
    preloadText: TL.segments.map((s) => s.text).join('') + '0123456789,.:= +-×²→↑↓…（）“”「」·—',
  };
  window.prepare = async () => { if (document.fonts) await document.fonts.ready; };
  window.renderFrame = (t) => { renderFrame(t); };
  // browser preview: ?t=12.5 renders a still; ?play=1 plays in real time
  if (!window.__RENDERER__) {
    const q = new URLSearchParams(location.search);
    if (q.has('play')) { const t0 = performance.now() - (parseFloat(q.get('t') || '0') * 1000); const loop = () => { renderFrame((performance.now() - t0) / 1000); requestAnimationFrame(loop); }; loop(); }
    else renderFrame(parseFloat(q.get('t') || '0'));
  }
})();
