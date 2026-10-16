// Heat-diffusion graph background: a drifting random geometric graph where clicking a node
// starts heat diffusion from it. Ported from reference/heat-graph-reference.html.
// Markup: src/components/HeatGraph.astro. Styles and colours: src/styles/heat-graph.css.
// Loaded as a deferred module, so it creates no globals except window.HeatGraph (for debugging).

const HEAT_GRAPH_CONFIG = {
  nodes: 100, // node count on desktop
  nodesMobile: 100, // cap when viewport width < 600px
  avgDegree: 6, // target average degree of the random geometric graph
  alpha: 0.5, // diffusion rate, as a fraction of the stability limit 1/maxDeg
  gamma: 0.003, // decay per substep (heat fades instead of equalizing)
  substeps: 2, // diffusion steps per animation frame
  drift: 1, // multiplier on wander amplitude
  wander: 18, // px, amplitude of each node's wandering anchor
  pull: 1, // multiplier on cursor attraction
  pullRadius: 150, // px, radius of cursor influence
  clickRadius: 28, // px, max distance from click to nearest node
  injectAmount: 1, // heat added per click
  heatGain: 14, // display compression: h = 1 - exp(-u * heatGain)
  seedBurst: true, // inject one burst ~400ms after load so the first view shows the effect
  showTunePanel: true, // whether the Tune dropdown is rendered at all
  fadeContent: 0.7, // 0–1, how much the graph fades behind the text column (0 = no fade)
  fadeFeather: 64, // px, soft edge of that fade on each side of the column
  fadeTarget: 'main', // CSS selector of the text column to fade behind
};

(() => {
  const root = document.querySelector('.hg');
  const canvas = root?.querySelector('.hg-canvas');
  const ctx = canvas?.getContext('2d');
  if (!root || !ctx) return;

  // ---- config: defaults, overridden by data-* attributes (data-nodes="400", data-tune="false") ----
  const cfg = { ...HEAT_GRAPH_CONFIG };
  for (const el of [root, canvas]) {
    for (const [key, raw] of Object.entries(el.dataset)) {
      const name = key === 'tune' ? 'showTunePanel' : key;
      if (!(name in cfg)) continue;
      if (typeof cfg[name] === 'boolean') cfg[name] = raw !== 'false';
      else if (typeof cfg[name] === 'string') cfg[name] = raw;
      else if (Number.isFinite(+raw)) cfg[name] = +raw;
    }
  }
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const applyReducedMotion = () => {
    if (motionQuery.matches) { cfg.drift = 0; cfg.pull = 0; syncControls?.(); }
  };
  let syncControls = null;
  applyReducedMotion();

  let W = 0, H = 0, dpr = 1;
  let N = 0, x, y, vx, vy, hx, hy, ph, u, lu, edges, rest, maxDeg = 1;
  let paused = false, t = 0;
  const mouse = { x: -1e4, y: -1e4, active: false };
  const stat = { edges: null, heat: null, fps: null };

  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

  // ---- theme colours, read from the --hg-* custom properties ----
  let col = {};
  function parseColor(value, fallback) {
    // Let the canvas normalise any CSS colour to #rrggbb or rgba(...), then read the channels.
    ctx.fillStyle = fallback;
    if (value.trim()) ctx.fillStyle = value.trim();
    const s = String(ctx.fillStyle);
    if (s[0] === '#') { const v = parseInt(s.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
    const m = s.match(/[\d.]+/g);
    return m ? [+m[0], +m[1], +m[2]] : [0, 0, 0];
  }
  function readTheme() {
    const s = getComputedStyle(root);
    const get = (name, fallback) => parseColor(s.getPropertyValue(name), fallback);
    col = {
      bg: get('--hg-bg', '#fdfdfb'), node: get('--hg-node', '#7c8a9c'), edge: get('--hg-edge', '#8592a3'),
      a: get('--hg-heat-a', '#f08a24'), b: get('--hg-heat-b', '#c2263a'),
    };
    col.dark = (col.bg[0] + col.bg[1] + col.bg[2]) / 3 < 100;
    col.bgCss = `rgb(${col.bg[0]},${col.bg[1]},${col.bg[2]})`;
    col.ringCss = `rgb(${col.a[0]},${col.a[1]},${col.a[2]})`;
    updateFade();
  }

  // ---- fade behind the text column: a band of background colour with feathered edges ----
  const fade = { left: 0, width: 0, fill: null };
  const fadeTarget = document.querySelector(cfg.fadeTarget);
  function updateFade() {
    if (!fadeTarget || !(cfg.fadeContent > 0) || !col.bg) { fade.fill = null; return; }
    const r = fadeTarget.getBoundingClientRect(), F = Math.max(0, cfg.fadeFeather);
    fade.left = r.left - F; fade.width = r.width + 2 * F;
    if (fade.width <= 0) { fade.fill = null; return; }
    const g = ctx.createLinearGradient(fade.left, 0, fade.left + fade.width, 0), e = F / fade.width;
    g.addColorStop(0, rgba(col.bg, 0));
    g.addColorStop(Math.min(0.5, e), rgba(col.bg, cfg.fadeContent));
    g.addColorStop(Math.max(0.5, 1 - e), rgba(col.bg, cfg.fadeContent));
    g.addColorStop(1, rgba(col.bg, 0));
    fade.fill = g;
  }
  if (fadeTarget) new ResizeObserver(() => updateFade()).observe(fadeTarget);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', readTheme);
  new MutationObserver(readTheme).observe(document.documentElement, {
    attributes: true, attributeFilter: ['data-theme', 'class', 'style'],
  });

  function resize() {
    const oW = W, oH = H;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    updateFade();
    if (N && oW) { // rescale positions so the graph keeps filling the screen; the edge set stays fixed
      const sx = W / oW, sy = H / oH;
      for (let i = 0; i < N; i++) { x[i] *= sx; y[i] *= sy; hx[i] *= sx; hy[i] *= sy; }
    }
  }

  // ---- random geometric graph: connect points within radius r chosen for the target avg degree ----
  const BUCKETS = 8, NODE_BUCKETS = 16;
  const edgeBuckets = Array.from({ length: BUCKETS }, () => []);
  const nodeBuckets = Array.from({ length: NODE_BUCKETS }, () => []);
  function build() {
    N = innerWidth < 600 ? Math.min(cfg.nodes, cfg.nodesMobile) : cfg.nodes;
    x = new Float32Array(N); y = new Float32Array(N); vx = new Float32Array(N); vy = new Float32Array(N);
    hx = new Float32Array(N); hy = new Float32Array(N); ph = new Float32Array(N * 2);
    u = new Float32Array(N); lu = new Float32Array(N);
    const pad = 20;
    for (let i = 0; i < N; i++) {
      hx[i] = x[i] = pad + Math.random() * (W - 2 * pad);
      hy[i] = y[i] = pad + Math.random() * (H - 2 * pad);
      ph[2 * i] = Math.random() * 6.283; ph[2 * i + 1] = Math.random() * 6.283;
    }
    // avg degree ≈ N·πr²/(W·H)  →  r = sqrt(deg·W·H/(N·π))
    const r = Math.sqrt(cfg.avgDegree * W * H / (N * Math.PI)), r2 = r * r;
    const list = [], deg = new Uint16Array(N);
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      const dx = x[i] - x[j], dy = y[i] - y[j];
      if (dx * dx + dy * dy < r2) { list.push(i, j); deg[i]++; deg[j]++; }
    }
    edges = new Uint32Array(list);
    rest = new Float32Array(edges.length / 2);
    for (let e = 0; e < rest.length; e++) {
      const i = edges[2 * e], j = edges[2 * e + 1];
      rest[e] = Math.hypot(x[i] - x[j], y[i] - y[j]);
    }
    maxDeg = 1; for (let i = 0; i < N; i++) if (deg[i] > maxDeg) maxDeg = deg[i];
    if (stat.edges) stat.edges.textContent = rest.length;
  }

  // ---- heat step: u ← u − (α/maxDeg)·Lu − γ·u   (α/maxDeg keeps explicit Euler stable) ----
  function diffuse() {
    const a = cfg.alpha / maxDeg, g = cfg.gamma, m = edges.length;
    for (let s = 0; s < cfg.substeps; s++) {
      lu.fill(0);
      for (let k = 0; k < m; k += 2) {
        const i = edges[k], j = edges[k + 1], d = u[i] - u[j];
        lu[i] += d; lu[j] -= d;
      }
      for (let i = 0; i < N; i++) { const v = u[i] - a * lu[i] - g * u[i]; u[i] = v < 1e-5 ? 0 : v; }
    }
  }

  // ---- motion: wandering anchors + edge springs + soft cursor pull ----
  function move() {
    t += 0.004;
    const kHome = 0.004, kEdge = 0.012, damp = 0.88, A = cfg.wander * cfg.drift;
    const R = cfg.pullRadius, pull = 0.18 * cfg.pull;
    for (let e = 0; e < rest.length; e++) {
      const i = edges[2 * e], j = edges[2 * e + 1];
      const dx = x[j] - x[i], dy = y[j] - y[i], d = Math.hypot(dx, dy) || 1;
      const f = kEdge * (d - rest[e]) / d;
      vx[i] += f * dx; vy[i] += f * dy; vx[j] -= f * dx; vy[j] -= f * dy;
    }
    for (let i = 0; i < N; i++) {
      const tx = hx[i] + A * Math.sin(t * 1.3 + ph[2 * i]), ty = hy[i] + A * Math.cos(t * 1.1 + ph[2 * i + 1]);
      vx[i] += (tx - x[i]) * kHome; vy[i] += (ty - y[i]) * kHome;
      if (mouse.active && pull > 0) {
        const dx = mouse.x - x[i], dy = mouse.y - y[i], d = Math.hypot(dx, dy);
        if (d < R && d > 1) { const w = 1 - d / R; vx[i] += pull * w * w * dx / d; vy[i] += pull * w * w * dy / d; }
      }
      vx[i] *= damp; vy[i] *= damp; x[i] += vx[i]; y[i] += vy[i];
    }
  }

  // ---- drawing ----
  const heatVis = (v) => 1 - Math.exp(-v * cfg.heatGain); // compress heat into [0,1) for display
  const mix = (p, q, s) => [p[0] + (q[0] - p[0]) * s, p[1] + (q[1] - p[1]) * s, p[2] + (q[2] - p[2]) * s];
  function heatColor(h) { // node colour → heat-a → heat-b (light) / → white-hot (dark)
    if (h < 0.5) return mix(col.node, col.a, h * 2);
    return col.dark ? mix(col.a, [255, 244, 220], (h - 0.5) * 2) : mix(col.a, col.b, (h - 0.5) * 2);
  }

  function draw() {
    ctx.fillStyle = col.bgCss; ctx.fillRect(0, 0, W, H);

    // edges, batched by heat bucket: one path and one stroke per bucket
    for (const b of edgeBuckets) b.length = 0;
    for (let e = 0; e < rest.length; e++) {
      const i = edges[2 * e], j = edges[2 * e + 1];
      const h = heatVis((u[i] + u[j]) / 2);
      edgeBuckets[Math.min(BUCKETS - 1, (h * BUCKETS) | 0)].push(i, j);
    }
    ctx.lineWidth = 1;
    for (let b = 0; b < BUCKETS; b++) {
      const list = edgeBuckets[b]; if (!list.length) continue;
      const h = (b + 0.5) / BUCKETS;
      ctx.strokeStyle = b === 0 ? rgba(col.edge, col.dark ? 0.55 : 0.35) : rgba(heatColor(h), 0.3 + 0.6 * h);
      ctx.beginPath();
      for (let k = 0; k < list.length; k += 2) { ctx.moveTo(x[list[k]], y[list[k]]); ctx.lineTo(x[list[k + 1]], y[list[k + 1]]); }
      ctx.stroke();
    }

    // glow for hot nodes
    ctx.globalCompositeOperation = col.dark ? 'lighter' : 'source-over';
    for (let i = 0; i < N; i++) {
      const h = heatVis(u[i]); if (h <= 0.08) continue;
      const c = heatColor(h), r = 4 + 14 * h;
      const g = ctx.createRadialGradient(x[i], y[i], 0, x[i], y[i], r);
      g.addColorStop(0, rgba(c, 0.35 * h)); g.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x[i], y[i], r, 0, 6.283); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    // nodes, batched by heat: radius 1.8 + 2.2h, colour heatColor(h)
    for (const b of nodeBuckets) b.length = 0;
    for (let i = 0; i < N; i++) nodeBuckets[Math.round(heatVis(u[i]) * (NODE_BUCKETS - 1))].push(i);
    for (let b = 0; b < NODE_BUCKETS; b++) {
      const list = nodeBuckets[b]; if (!list.length) continue;
      const h = b / (NODE_BUCKETS - 1), r = 1.8 + 2.2 * h;
      ctx.fillStyle = rgba(heatColor(h), 1);
      ctx.beginPath();
      for (let k = 0; k < list.length; k++) { const i = list[k]; ctx.moveTo(x[i] + r, y[i]); ctx.arc(x[i], y[i], r, 0, 6.283); }
      ctx.fill();
    }

    // fade behind the text column, then the hover ring on top
    if (fade.fill) { ctx.fillStyle = fade.fill; ctx.fillRect(fade.left, 0, fade.width, H); }

    // hover ring on the node a click would hit
    if (mouse.active) {
      const k = nearest(mouse.x, mouse.y);
      if (k >= 0) { ctx.strokeStyle = col.ringCss; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x[k], y[k], 7, 0, 6.283); ctx.stroke(); }
    }
  }

  function nearest(px, py) {
    let best = -1, bd = cfg.clickRadius * cfg.clickRadius;
    for (let i = 0; i < N; i++) { const dx = x[i] - px, dy = y[i] - py, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; } }
    return best;
  }

  // ---- input: links and controls keep their clicks; everything else can release heat ----
  const INTERACTIVE = 'a, button, input, select, textarea, label, summary, [role=menu], [contenteditable], .hg-tune';
  addEventListener('pointermove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = e.pointerType === 'mouse'; });
  addEventListener('pointerout', (e) => { if (!e.relatedTarget) mouse.active = false; });
  addEventListener('blur', () => { mouse.active = false; });
  addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest?.(INTERACTIVE)) return;
    const k = nearest(e.clientX, e.clientY);
    if (k >= 0) u[k] += cfg.injectAmount;
  });

  // ---- Tune dropdown ----
  function setupTune() {
    const tune = document.querySelector('.hg-tune');
    if (!tune) return;
    if (!cfg.showTunePanel) { tune.remove(); return; }
    const button = tune.querySelector('.hg-tune__toggle');
    const panel = tune.querySelector('.hg-tune__panel');
    const STORE = 'hg-tune-open';
    const setOpen = (open, focusButton = false) => {
      panel.hidden = !open;
      button.setAttribute('aria-expanded', String(open));
      try { localStorage.setItem(STORE, open ? '1' : '0'); } catch {}
      if (!open && focusButton) button.focus();
    };
    let stored = null;
    try { stored = localStorage.getItem(STORE); } catch {}
    setOpen(stored === '1');
    tune.hidden = false;

    button.addEventListener('click', () => setOpen(panel.hidden));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) setOpen(false, true); });
    // pointerdown (not click) so a slider drag that ends outside the panel doesn't close it
    document.addEventListener('pointerdown', (e) => { if (!panel.hidden && !tune.contains(e.target)) setOpen(false); });

    const fmt = {
      nodes: (v) => String(v), avgDegree: (v) => v.toFixed(1), alpha: (v) => v.toFixed(2),
      gamma: (v) => v.toFixed(3), drift: (v) => v.toFixed(1), pull: (v) => v.toFixed(1),
    };
    const sliders = [...tune.querySelectorAll('input[data-hg]')];
    syncControls = () => {
      for (const el of sliders) {
        const key = el.dataset.hg;
        el.value = String(cfg[key]);
        tune.querySelector(`[data-hg-out="${key}"]`).textContent = fmt[key](cfg[key]);
      }
    };
    for (const el of sliders) {
      const key = el.dataset.hg;
      el.addEventListener('input', () => {
        cfg[key] = +el.value;
        tune.querySelector(`[data-hg-out="${key}"]`).textContent = fmt[key](cfg[key]);
        if (key === 'nodes' || key === 'avgDegree') build();
      });
    }
    syncControls();

    const pauseButton = tune.querySelector('[data-hg-action="pause"]');
    tune.querySelector('[data-hg-action="regen"]').addEventListener('click', build);
    tune.querySelector('[data-hg-action="clear"]').addEventListener('click', () => u.fill(0));
    pauseButton.addEventListener('click', () => { paused = !paused; pauseButton.textContent = paused ? 'Resume' : 'Pause'; });

    stat.edges = tune.querySelector('[data-hg-stat="edges"]');
    stat.heat = tune.querySelector('[data-hg-stat="heat"]');
    stat.fps = tune.querySelector('[data-hg-stat="fps"]');
    if (stat.edges && rest) stat.edges.textContent = rest.length;
  }

  // ---- loop ----
  // Slow-device fallback: halve the node count once if the graph itself can't keep up.
  // A low frame rate alone is not enough: browsers cap animations at 30fps in power-saving modes,
  // and the first seconds after load are slow, even though the graph needs well under 1ms a frame.
  // So it also requires the graph's own script time to be high (a capable laptop needs ~0.2ms a
  // frame, even when capped at 30fps; struggling devices need well over 1ms), and ignores the warm-up.
  const WARMUP_MS = 3000, SLOW_FPS = 40, SLOW_WORK_MS = 1, SLOW_FOR_MS = 2000;
  const started = performance.now();
  let last = started, frames = 0, acc = 0, work = 0, sumTick = 0, slowSince = 0, degraded = false;
  const perf = { fps: 0, workMs: 0 };
  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden) { last = now; return; }
    const dt = now - last; last = now;
    if (dt > 250) { frames = 0; acc = 0; work = 0; slowSince = 0; } // returning from a pause or hidden tab
    else { frames++; acc += dt; }
    if (acc > 500) {
      const fps = Math.round(frames * 1000 / acc), workPerFrame = work / frames;
      if (stat.fps) stat.fps.textContent = fps;
      perf.fps = fps; perf.workMs = workPerFrame;
      frames = 0; acc = 0; work = 0;
      const slow = fps < SLOW_FPS && workPerFrame > SLOW_WORK_MS && !paused && now - started > WARMUP_MS;
      if (slow) {
        slowSince ||= now;
        if (!degraded && now - slowSince > SLOW_FOR_MS) {
          degraded = true;
          cfg.nodes = Math.max(100, Math.round(N / 2 / 50) * 50);
          cfg.nodesMobile = Math.min(cfg.nodesMobile, cfg.nodes);
          build(); syncControls?.();
        }
      } else slowSince = 0;
    }
    const t0 = performance.now();
    if (!paused) { move(); diffuse(); }
    draw();
    work += performance.now() - t0;
    if (stat.heat && ++sumTick % 10 === 0) { let s = 0; for (let i = 0; i < N; i++) s += u[i]; stat.heat.textContent = s.toFixed(2); }
  }

  readTheme(); resize(); build(); setupTune();
  motionQuery.addEventListener('change', applyReducedMotion);
  addEventListener('resize', resize);
  // seed one burst so the first view shows what the background does
  if (cfg.seedBurst) {
    setTimeout(() => { const k = nearest(W * 0.68, H * 0.45); u[k >= 0 ? k : (N / 2) | 0] += 1.5; }, 400);
  }
  requestAnimationFrame(frame);

  window.HeatGraph = {
    config: cfg,
    rebuild: build,
    clear: () => u.fill(0),
    inject: (k, amount = cfg.injectAmount) => { u[k] += amount; },
    state: () => ({ N, edges: rest.length, maxDeg, t, paused, x, y, u, dark: col.dark, perf: { ...perf }, degraded }), // read-only snapshot
  };
})();
