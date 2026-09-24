/* Evoluzione — 60 auto guidate da piccole reti neurali, addestrate solo per selezione naturale.
   Nessun gradiente, nessun dataset: sensori → rete → sterzo e gas; le migliori si riproducono. */
(function () {
  'use strict';

  const W = 1600, H = 1000;                 // mondo in unità arbitrarie
  const POP = 60, ELITE = 3;
  const LAYERS = [8, 10, 6, 2];              // 7 sensori + velocità → sterzo, gas
  const SENSORS = [-90, -50, -22, 0, 22, 50, 90].map((d) => (d * Math.PI) / 180);
  const SENSOR_LEN = 240;
  const HALF_W = 32;                         // metà larghezza pista
  const CAR_R = 6;
  const CELL = 5;                            // passo della griglia di distanze
  const DT = 1 / 60;
  const GEN_TIME = 30;                       // secondi simulati per generazione
  const MAX_V = 400, ACC = 300, BRAKE = 560, DRAG = 0.3, TURN = 3.2;
  const N_PTS = 400;                         // punti della linea centrale

  const N_WEIGHTS = LAYERS.slice(1).reduce((s, n, i) => s + n * (LAYERS[i] + 1), 0);
  const IN_LABELS = ['−90°', '−50°', '−22°', '0°', '+22°', '+50°', '+90°', 'vel.'];
  const OUT_LABELS = ['sterzo', 'gas'];
  const AMBER = [255, 181, 71], BLUE = [124, 200, 255];

  function mulberry32(a) {
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function gauss() {
    let u = 0, v = 0;
    while (!u) u = Math.random();
    while (!v) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // ---------- rete neurale ----------
  function randomBrain() {
    const w = new Float32Array(N_WEIGHTS);
    for (let i = 0; i < N_WEIGHTS; i++) w[i] = Math.random() * 2 - 1;
    return w;
  }

  function forward(w, acts) {
    let off = 0;
    for (let l = 1; l < LAYERS.length; l++) {
      const nIn = LAYERS[l - 1], nOut = LAYERS[l], a = acts[l - 1], out = acts[l];
      for (let j = 0; j < nOut; j++) {
        let s = w[off + nIn];
        for (let i = 0; i < nIn; i++) s += w[off + i] * a[i];
        off += nIn + 1;
        out[j] = Math.tanh(s);
      }
    }
    return acts[acts.length - 1];
  }

  // Incrocio per neurone: ogni neurone del figlio arriva intero da uno dei due genitori.
  function crossover(a, b) {
    const c = new Float32Array(N_WEIGHTS);
    let off = 0;
    for (let l = 1; l < LAYERS.length; l++) {
      const block = LAYERS[l - 1] + 1;
      for (let j = 0; j < LAYERS[l]; j++) {
        const src = Math.random() < 0.5 ? a : b;
        for (let k = 0; k < block; k++) c[off + k] = src[off + k];
        off += block;
      }
    }
    return c;
  }

  function mutate(w, rate) {
    for (let i = 0; i < w.length; i++) {
      if (Math.random() < rate) w[i] += gauss() * 0.35;
      if (Math.random() < rate * 0.04) w[i] = Math.random() * 2 - 1;
    }
  }

  // ---------- pista procedurale ----------
  // Punti di controllo attorno a un'ellisse con raggi casuali, uniti da una spline
  // Catmull–Rom centripeta (niente cappi né cuspidi), poi ricampionati a passo costante.
  function makeTrack(seed) {
    const rnd = mulberry32(seed);
    const n = 10 + Math.floor(rnd() * 5);
    const dir = rnd() < 0.5 ? 1 : -1, th0 = rnd() * Math.PI * 2;
    const cp = [];
    for (let i = 0; i < n; i++) {
      const th = th0 + dir * ((i + (rnd() - 0.5) * 0.5) / n) * Math.PI * 2;
      const r = 0.52 + 0.48 * rnd();
      cp.push([W / 2 + 660 * r * Math.cos(th), H / 2 + 400 * r * Math.sin(th)]);
    }
    const SEG = 240, M = n * SEG;
    const rawX = new Float64Array(M), rawY = new Float64Array(M), cum = new Float64Array(M + 1);
    for (let s = 0; s < n; s++) {
      const P = [cp[(s + n - 1) % n], cp[s], cp[(s + 1) % n], cp[(s + 2) % n]];
      const t = [0];
      for (let k = 1; k < 4; k++) t.push(t[k - 1] + Math.sqrt(Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1])) + 1e-6);
      const lerp = (a, b, ta, tb, x) => [
        ((tb - x) * a[0] + (x - ta) * b[0]) / (tb - ta),
        ((tb - x) * a[1] + (x - ta) * b[1]) / (tb - ta),
      ];
      for (let i = 0; i < SEG; i++) {
        const x = t[1] + ((t[2] - t[1]) * i) / SEG;
        const A1 = lerp(P[0], P[1], t[0], t[1], x), A2 = lerp(P[1], P[2], t[1], t[2], x), A3 = lerp(P[2], P[3], t[2], t[3], x);
        const B1 = lerp(A1, A2, t[0], t[2], x), B2 = lerp(A2, A3, t[1], t[3], x);
        const C = lerp(B1, B2, t[1], t[2], x);
        rawX[s * SEG + i] = C[0];
        rawY[s * SEG + i] = C[1];
      }
    }
    for (let i = 0; i < M; i++) {
      const j = (i + 1) % M;
      cum[i + 1] = cum[i] + Math.hypot(rawX[j] - rawX[i], rawY[j] - rawY[i]);
    }
    // Ricampiona a passo costante: il progresso lungo la pista diventa una misura uniforme.
    const xs = new Float32Array(N_PTS), ys = new Float32Array(N_PTS);
    let j = 0;
    for (let i = 0; i < N_PTS; i++) {
      const target = (i / N_PTS) * cum[M];
      while (cum[j + 1] < target) j++;
      const t = (target - cum[j]) / (cum[j + 1] - cum[j] || 1);
      const k = (j + 1) % M;
      xs[i] = rawX[j] + (rawX[k] - rawX[j]) * t;
      ys[i] = rawY[j] + (rawY[k] - rawY[j]) * t;
    }
    return { xs, ys, length: cum[M], seed };
  }

  // Una pista è valida se non ha curve più strette di un raggio minimo
  // e se tratti lontani lungo il percorso non si toccano (niente scorciatoie).
  function trackIsFair(tr) {
    const { xs, ys, length } = tr;
    const ds = length / N_PTS, K = 4;
    const head = new Float64Array(N_PTS);
    for (let i = 0; i < N_PTS; i++) {
      const j = (i + 1) % N_PTS;
      head[i] = Math.atan2(ys[j] - ys[i], xs[j] - xs[i]);
    }
    for (let i = 0; i < N_PTS; i++) {
      let turn = 0;
      for (let k = 0; k < K; k++) {
        let d = head[(i + k + 1) % N_PTS] - head[(i + k) % N_PTS];
        d = Math.atan2(Math.sin(d), Math.cos(d));
        turn += d;
      }
      if ((K * ds) / Math.abs(turn || 1e-9) < 48) return false;
    }
    const gap = Math.ceil(260 / ds), minD2 = (HALF_W * 2 + 26) ** 2;
    for (let i = 0; i < N_PTS; i += 2) {
      for (let jj = i + gap; jj < i + N_PTS - gap; jj += 2) {
        const j = jj % N_PTS;
        const dx = xs[i] - xs[j], dy = ys[i] - ys[j];
        if (dx * dx + dy * dy < minD2) return false;
      }
    }
    return true;
  }

  function makeFairTrack(seed) {
    for (let k = 0; k < 200; k++) {
      const tr = makeTrack(seed + k);
      if (trackIsFair(tr)) return tr;
    }
    return makeTrack(seed);
  }

  Lab.register({
    id: 'evoluzione',
    name: 'Evoluzione',
    accent: '#ffb547',
    kicker: 'Neuroevoluzione · reti neurali + algoritmo genetico',
    title: 'Evoluzione',
    tagline: 'Sessanta auto, ognuna guidata da una piccola rete neurale che nessuno ha addestrato. Solo selezione naturale: le migliori si riproducono, con qualche mutazione. In pochi minuti imparano a guidare.',
    hint: 'Clicca sulla pista per mettere un ostacolo · clicca un ostacolo per toglierlo',
    stack: 'JavaScript + Canvas 2D',
    formula:
      '<div><b>h</b><sub>ℓ</sub> = tanh(W<sub>ℓ</sub> <b>h</b><sub>ℓ−1</sub> + <b>b</b><sub>ℓ</sub>), &nbsp;<b>h</b><sub>0</sub> = sensori</div>' +
      '<div>θ<sub>figlio</sub> = incrocio(θ<sub>A</sub>, θ<sub>B</sub>) + σ·𝒩(0, 1)</div>',
    how:
      '<p>Ogni auto ha un “cervello” di 170 numeri: i pesi di una rete neurale 8 → 10 → 6 → 2. All’inizio sono casuali, e si vede.</p>' +
      '<ol>' +
      '<li><strong>Percezione.</strong> Sette sensori misurano la distanza dai bordi. Il raggio avanza con lo <em>sphere tracing</em> su una mappa di distanze precalcolata: pochi passi, anche con 60 auto a velocità 48×.</li>' +
      '<li><strong>Decisione.</strong> Distanze e velocità entrano nella rete; escono sterzo e acceleratore. Nel pannello vedi la rete dell’auto in testa: i collegamenti si accendono quando il segnale passa.</li>' +
      '<li><strong>Selezione.</strong> Il punteggio è la distanza percorsa lungo la pista. Chi si schianta o si ferma è fuori.</li>' +
      '<li><strong>Riproduzione.</strong> Le 3 migliori passano intatte alla generazione successiva; le altre nascono da tornei a 4, incrocio neurone per neurone e mutazioni gaussiane.</li>' +
      '<li><strong>La prova.</strong> Premi “Nuova pista”: se le auto guidano bene su curve mai viste, hanno imparato a guidare, non a memoria il percorso.</li>' +
      '</ol>',

    mount(stage, ui) {
      const canvas = document.createElement('canvas');
      stage.append(canvas);
      const ctx = canvas.getContext('2d');
      const layer = document.createElement('canvas');
      const lctx = layer.getContext('2d');

      let track, grid, gw = 0, gh = 0;
      let cones = [];
      let cars = [];
      let leader = null;
      let crashes = [];
      let generation = 1, genTime = 0, speed = 4, mutation = 0.06, stepCount = 0;
      let history = [];
      let bestEver = 0;
      let bestLap = Infinity;
      let lapAnnounced = false;
      let chartDirty = true;
      const view = { s: 1, ox: 0, oy: 0 };

      // ---------- mappa delle distanze ----------
      function segDist(px, py, a, b) {
        const ax = track.xs[a], ay = track.ys[a], bx = track.xs[b], by = track.ys[b];
        const dx = bx - ax, dy = by - ay;
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
        return Math.hypot(px - ax - dx * t, py - ay - dy * t);
      }

      function buildGrid() {
        gw = W / CELL + 1;
        gh = H / CELL + 1;
        grid = new Float32Array(gw * gh);
        const { xs, ys } = track;
        for (let j = 0; j < gh; j++) {
          const y = j * CELL;
          for (let i = 0; i < gw; i++) {
            const x = i * CELL;
            let bi = 0, bd = Infinity;
            for (let k = 0; k < N_PTS; k++) {
              const dx = xs[k] - x, dy = ys[k] - y, d = dx * dx + dy * dy;
              if (d < bd) { bd = d; bi = k; }
            }
            const d = Math.min(segDist(x, y, (bi + N_PTS - 1) % N_PTS, bi), segDist(x, y, bi, (bi + 1) % N_PTS));
            grid[j * gw + i] = HALF_W - d;       // positivo dentro la pista
          }
        }
      }

      function sdfGrid(x, y) {
        const fx = x / CELL, fy = y / CELL;
        if (fx < 0 || fy < 0 || fx >= gw - 1 || fy >= gh - 1) return -50;
        const i = fx | 0, j = fy | 0, tx = fx - i, ty = fy - j, k = j * gw + i;
        const a = grid[k], b = grid[k + 1], c = grid[k + gw], d = grid[k + gw + 1];
        return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
      }

      function sdf(x, y) {
        let d = sdfGrid(x, y);
        for (let i = 0; i < cones.length; i++) {
          const o = cones[i];
          const e = Math.hypot(x - o.x, y - o.y) - o.r;
          if (e < d) d = e;
        }
        return d;
      }

      function castRay(x, y, dx, dy) {
        let t = 0;
        for (let i = 0; i < 40; i++) {
          const d = sdf(x + dx * t, y + dy * t);
          if (d < 1) return t;
          t += Math.max(d, 1.5);
          if (t >= SENSOR_LEN) return SENSOR_LEN;
        }
        return Math.min(t, SENSOR_LEN);
      }

      // ---------- auto ----------
      function makeCar(brain) {
        const { xs, ys } = track;
        return {
          brain,
          x: xs[0], y: ys[0], a: Math.atan2(ys[1] - ys[0], xs[1] - xs[0]), v: 0,
          alive: true, idx: 0, progress: 0, time: 0, checkT: 0, checkP: 0, laps: 0, lapStart: 0,
          hits: new Float32Array(SENSORS.length),
          acts: LAYERS.map((n) => new Float32Array(n)),
          trail: [],
        };
      }

      function stepCar(c) {
        const inp = c.acts[0];
        for (let k = 0; k < SENSORS.length; k++) {
          const ang = c.a + SENSORS[k];
          const d = castRay(c.x, c.y, Math.cos(ang), Math.sin(ang));
          c.hits[k] = d;
          inp[k] = d / SENSOR_LEN;
        }
        inp[7] = c.v / MAX_V;
        const out = forward(c.brain, c.acts);
        const steer = out[0], throttle = out[1];

        c.v += (throttle >= 0 ? throttle * ACC : throttle * BRAKE) * DT;
        c.v -= c.v * DRAG * DT;
        if (c.v < 0) c.v = 0;
        if (c.v > MAX_V) c.v = MAX_V;
        c.a += steer * TURN * DT * Math.min(1, c.v / 90);
        c.x += Math.cos(c.a) * c.v * DT;
        c.y += Math.sin(c.a) * c.v * DT;

        // Progresso: punto della linea centrale più vicino, cercato solo nei dintorni.
        const { xs, ys } = track;
        let best = c.idx, bestD = Infinity;
        for (let o = -6; o <= 14; o++) {
          const i = (c.idx + o + N_PTS) % N_PTS;
          const dx = xs[i] - c.x, dy = ys[i] - c.y, d = dx * dx + dy * dy;
          if (d < bestD) { bestD = d; best = i; }
        }
        let delta = best - c.idx;
        if (delta > N_PTS / 2) delta -= N_PTS;
        if (delta < -N_PTS / 2) delta += N_PTS;
        c.progress += delta;
        c.idx = best;

        c.time += DT;
        if (c.progress >= (c.laps + 1) * N_PTS) {
          c.laps++;
          const lap = c.time - c.lapStart;
          c.lapStart = c.time;
          if (lap < bestLap) bestLap = lap;
        }
        if (sdf(c.x, c.y) < CAR_R) c.alive = false;
        else if (c.progress < -3) c.alive = false;
        else if (c.time - c.checkT > 1.5) {
          if (c.progress - c.checkP < 5) c.alive = false;   // fermo o in retromarcia
          c.checkT = c.time;
          c.checkP = c.progress;
        }
        if (!c.alive) crashes.push(c.x, c.y);
      }

      // ---------- generazioni ----------
      function startGeneration(brains) {
        cars = brains.map(makeCar);
        genTime = 0;
        crashes = [];
        leader = cars[0];
      }

      function tournament(pool) {
        let best = null;
        for (let k = 0; k < 4; k++) {
          const c = pool[(Math.random() * pool.length) | 0];
          if (!best || c.fitness > best.fitness) best = c;
        }
        return best;
      }

      function evolve() {
        for (const c of cars) c.fitness = c.progress / N_PTS;
        const sorted = [...cars].sort((a, b) => b.fitness - a.fitness);
        const best = Math.max(0, sorted[0].fitness);
        const mean = Math.max(0, sorted.reduce((s, c) => s + c.fitness, 0) / sorted.length);
        history.push({ gen: generation, best, mean });
        if (history.length > 60) history.shift();
        bestEver = Math.max(bestEver, best);
        chartDirty = true;

        const next = [];
        for (let i = 0; i < ELITE; i++) next.push(sorted[i].brain.slice());
        while (next.length < POP) {
          const child = crossover(tournament(sorted).brain, tournament(sorted).brain);
          mutate(child, mutation);
          next.push(child);
        }
        generation++;
        startGeneration(next);
      }

      function simStep() {
        genTime += DT;
        stepCount++;
        let alive = 0;
        for (const c of cars) {
          if (!c.alive) continue;
          stepCar(c);
          if (c.alive) {
            alive++;
            if (stepCount % 3 === 0) { c.trail.push(c.x, c.y); if (c.trail.length > 360) c.trail.splice(0, 2); }
          }
        }
        for (const c of cars) if (c.alive && (!leader.alive || c.progress > leader.progress)) leader = c;

        if (!lapAnnounced && leader.progress >= N_PTS) {
          lapAnnounced = true;
          Lab.toast(`Generazione ${generation}: primo giro completo, senza che nessuno abbia insegnato niente.`);
        }
        if (alive === 0 || genTime >= GEN_TIME) evolve();
      }

      function reset(keepBrains) {
        const brains = keepBrains ? cars.map((c) => c.brain) : Array.from({ length: POP }, randomBrain);
        if (!keepBrains) { generation = 1; history = []; bestEver = 0; lapAnnounced = false; chartDirty = true; }
        bestLap = Infinity;
        startGeneration(brains);
      }

      function loadTrack(seed) {
        track = makeFairTrack(seed);
        buildGrid();
        cones = [];
        drawLayer();
      }

      // ---------- disegno ----------
      function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const cw = Math.max(1, Math.round(canvas.clientWidth * dpr));
        const ch = Math.max(1, Math.round(canvas.clientHeight * dpr));
        canvas.width = cw;
        canvas.height = ch;
        view.s = Math.min(cw / W, ch / H) * 0.95;
        view.ox = (cw - W * view.s) / 2;
        view.oy = (ch - H * view.s) / 2;
        if (track) drawLayer();
        chartDirty = true;
      }

      function drawLayer() {
        layer.width = canvas.width;
        layer.height = canvas.height;
        const { xs, ys } = track;
        lctx.setTransform(1, 0, 0, 1, 0, 0);
        lctx.fillStyle = '#090a0f';
        lctx.fillRect(0, 0, layer.width, layer.height);
        lctx.setTransform(view.s, 0, 0, view.s, view.ox, view.oy);

        lctx.fillStyle = 'rgba(255,255,255,0.05)';
        for (let x = 0; x <= W; x += 40) for (let y = 0; y <= H; y += 40) lctx.fillRect(x - 1.2, y - 1.2, 2.4, 2.4);

        const path = new Path2D();
        path.moveTo(xs[0], ys[0]);
        for (let i = 1; i < N_PTS; i++) path.lineTo(xs[i], ys[i]);
        path.closePath();
        lctx.lineJoin = 'round';
        lctx.strokeStyle = '#3a3f52';
        lctx.lineWidth = HALF_W * 2 + 4;
        lctx.stroke(path);
        lctx.strokeStyle = '#151821';
        lctx.lineWidth = HALF_W * 2 - 1;
        lctx.stroke(path);
        lctx.setLineDash([12, 16]);
        lctx.strokeStyle = 'rgba(255,255,255,0.08)';
        lctx.lineWidth = 1.5;
        lctx.stroke(path);
        lctx.setLineDash([]);

        // Traguardo a scacchi.
        const sq = (HALF_W * 2) / 10;
        lctx.save();
        lctx.translate(xs[0], ys[0]);
        lctx.rotate(Math.atan2(ys[1] - ys[0], xs[1] - xs[0]));
        for (let r = 0; r < 10; r++) {
          for (let c = 0; c < 2; c++) {
            lctx.fillStyle = (r + c) % 2 ? '#d9dce6' : '#151821';
            lctx.fillRect(-sq * 2 + c * sq, -HALF_W + r * sq, sq, sq);
          }
        }
        lctx.restore();
      }

      function drawCar(c, color) {
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.a);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(11, 0);
        ctx.lineTo(-7, 6.5);
        ctx.lineTo(-3.5, 0);
        ctx.lineTo(-7, -6.5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      function draw() {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(layer, 0, 0);
        ctx.setTransform(view.s, 0, 0, view.s, view.ox, view.oy);

        // Luoghi degli incidenti di questa generazione.
        ctx.strokeStyle = 'rgba(255,112,90,0.4)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let i = 0; i < crashes.length; i += 2) {
          const x = crashes[i], y = crashes[i + 1];
          ctx.moveTo(x - 4, y - 4); ctx.lineTo(x + 4, y + 4);
          ctx.moveTo(x + 4, y - 4); ctx.lineTo(x - 4, y + 4);
        }
        ctx.stroke();

        for (const o of cones) {
          ctx.beginPath();
          ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
          ctx.fillStyle = '#ff7a45';
          ctx.fill();
          ctx.beginPath();
          ctx.arc(o.x, o.y, o.r * 0.42, 0, Math.PI * 2);
          ctx.fillStyle = '#ffe2d3';
          ctx.fill();
        }

        const L = leader;
        if (L && L.trail.length > 3) {
          ctx.strokeStyle = 'rgba(255,255,255,0.28)';
          ctx.lineWidth = 2;
          ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(L.trail[0], L.trail[1]);
          for (let i = 2; i < L.trail.length; i += 2) ctx.lineTo(L.trail[i], L.trail[i + 1]);
          if (L.alive) ctx.lineTo(L.x, L.y);
          ctx.stroke();
        }

        for (const c of cars) if (c.alive && c !== L) drawCar(c, 'rgba(255,181,71,0.6)');

        if (L && L.alive) {
          ctx.lineWidth = 1.2;
          ctx.strokeStyle = 'rgba(255,181,71,0.45)';
          ctx.beginPath();
          for (let k = 0; k < SENSORS.length; k++) {
            const ang = L.a + SENSORS[k];
            ctx.moveTo(L.x, L.y);
            ctx.lineTo(L.x + Math.cos(ang) * L.hits[k], L.y + Math.sin(ang) * L.hits[k]);
          }
          ctx.stroke();
          ctx.fillStyle = '#ffb547';
          for (let k = 0; k < SENSORS.length; k++) {
            if (L.hits[k] >= SENSOR_LEN) continue;
            const ang = L.a + SENSORS[k];
            ctx.beginPath();
            ctx.arc(L.x + Math.cos(ang) * L.hits[k], L.y + Math.sin(ang) * L.hits[k], 3, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.shadowColor = 'rgba(255,181,71,0.9)';
          ctx.shadowBlur = 16 * view.s;
          drawCar(L, '#ffffff');
          ctx.shadowBlur = 0;
        }
      }

      function rgba(c, a) { return `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`; }

      function drawNet() {
        const f = netFig.fit();
        const g = f.ctx, w = f.w, hh = f.h;
        g.clearRect(0, 0, w, hh);
        const c = leader;
        if (!c) return;
        const padL = 40, padR = 50, padT = 10, padB = 10;
        const pos = LAYERS.map((n, l) => {
          const x = padL + ((w - padL - padR) * l) / (LAYERS.length - 1);
          return Array.from({ length: n }, (_, i) => [x, padT + ((hh - padT - padB) * (n === 1 ? 0.5 : i / (n - 1)))]);
        });
        let off = 0;
        for (let l = 1; l < LAYERS.length; l++) {
          const nIn = LAYERS[l - 1], a = c.acts[l - 1];
          for (let j = 0; j < LAYERS[l]; j++) {
            for (let i = 0; i < nIn; i++) {
              const wt = c.brain[off + i], sig = wt * a[i];
              g.strokeStyle = rgba(sig >= 0 ? AMBER : BLUE, Math.min(0.85, Math.abs(sig) * 0.55) + 0.04);
              g.lineWidth = 0.5 + Math.min(1.5, Math.abs(wt) * 0.6);
              g.beginPath();
              g.moveTo(pos[l - 1][i][0], pos[l - 1][i][1]);
              g.lineTo(pos[l][j][0], pos[l][j][1]);
              g.stroke();
            }
            off += nIn + 1;
          }
        }
        for (let l = 0; l < LAYERS.length; l++) {
          for (let i = 0; i < LAYERS[l]; i++) {
            const v = c.acts[l][i];
            const [x, y] = pos[l][i];
            g.beginPath();
            g.arc(x, y, 4.5, 0, Math.PI * 2);
            g.fillStyle = '#0b0c11';
            g.fill();
            g.fillStyle = rgba(v >= 0 ? AMBER : BLUE, 0.2 + 0.8 * Math.min(1, Math.abs(v)));
            g.fill();
          }
        }
        g.font = '500 9.5px "JetBrains Mono", Consolas, monospace';
        g.fillStyle = '#7f8599';
        g.textBaseline = 'middle';
        g.textAlign = 'right';
        pos[0].forEach(([x, y], i) => g.fillText(IN_LABELS[i], x - 9, y));
        g.textAlign = 'left';
        pos[LAYERS.length - 1].forEach(([x, y], i) => g.fillText(OUT_LABELS[i], x + 9, y));
      }

      function drawChart() {
        const f = chartFig.fit();
        const g = f.ctx, w = f.w, hh = f.h;
        g.clearRect(0, 0, w, hh);
        g.font = '500 9.5px "JetBrains Mono", Consolas, monospace';
        g.textBaseline = 'middle';
        if (!history.length) {
          g.fillStyle = '#7f8599';
          g.fillText('La prima generazione è in pista…', 10, hh / 2);
          return;
        }
        const padL = 10, padR = 46, padT = 10, padB = 20;
        const maxY = Math.max(1, ...history.map((p) => p.best)) * 1.1;
        const n = history.length;
        const X = (i) => padL + (w - padL - padR) * (n === 1 ? 1 : i / (n - 1));
        const Y = (v) => padT + (hh - padT - padB) * (1 - v / maxY);

        g.strokeStyle = '#22262f';
        g.lineWidth = 1;
        g.fillStyle = '#7f8599';
        g.textAlign = 'left';
        for (let k = 0; k <= Math.floor(maxY); k++) {
          const y = Math.round(Y(k)) + 0.5;
          g.beginPath(); g.moveTo(padL, y); g.lineTo(w - padR + 4, y); g.stroke();
          g.fillText(k === 1 ? '1 giro' : `${k} giri`, w - padR + 8, y);
        }

        g.strokeStyle = '#7f8599';
        g.lineWidth = 1.2;
        g.beginPath();
        history.forEach((p, i) => (i ? g.lineTo(X(i), Y(p.mean)) : g.moveTo(X(i), Y(p.mean))));
        g.stroke();

        g.beginPath();
        history.forEach((p, i) => (i ? g.lineTo(X(i), Y(p.best)) : g.moveTo(X(i), Y(p.best))));
        g.lineTo(X(n - 1), Y(0));
        g.lineTo(X(0), Y(0));
        g.closePath();
        g.fillStyle = 'rgba(255,181,71,0.12)';
        g.fill();
        g.strokeStyle = '#ffb547';
        g.lineWidth = 2;
        g.beginPath();
        history.forEach((p, i) => (i ? g.lineTo(X(i), Y(p.best)) : g.moveTo(X(i), Y(p.best))));
        g.stroke();
        const last = history[n - 1];
        g.beginPath();
        g.arc(X(n - 1), Y(last.best), 3.5, 0, Math.PI * 2);
        g.fillStyle = '#ffb547';
        g.fill();

        g.fillStyle = '#7f8599';
        g.textBaseline = 'alphabetic';
        g.fillText(`gen. ${history[0].gen}`, padL, hh - 5);
        g.textAlign = 'right';
        g.fillText(`gen. ${last.gen}`, w - padR, hh - 5);
      }

      // ---------- ostacoli ----------
      canvas.addEventListener('pointerdown', (e) => {
        const r = canvas.getBoundingClientRect();
        const k = canvas.width / r.width;
        const wx = ((e.clientX - r.left) * k - view.ox) / view.s;
        const wy = ((e.clientY - r.top) * k - view.oy) / view.s;
        const hit = cones.findIndex((o) => Math.hypot(o.x - wx, o.y - wy) < o.r + 8);
        if (hit >= 0) { cones.splice(hit, 1); return; }
        if (sdfGrid(wx, wy) < 6) return;
        if (Math.hypot(wx - track.xs[0], wy - track.ys[0]) < 90) { Lab.toast('Troppo vicino al traguardo: le auto partono da lì.'); return; }
        if (cones.length >= 16) { Lab.toast('Massimo 16 ostacoli.'); return; }
        cones.push({ x: wx, y: wy, r: 13 });
      });

      // ---------- interfaccia ----------
      ui.segmented({
        id: 'speed', label: 'Velocità della simulazione', value: speed,
        options: [1, 4, 16, 48].map((v) => ({ value: v, label: v + '×' })),
        onChange: (v) => (speed = v),
      });
      ui.slider({
        id: 'mut', label: 'Tasso di mutazione', min: 0.01, max: 0.25, step: 0.01, value: mutation,
        format: (v) => Math.round(v * 100) + '% dei pesi', onInput: (v) => (mutation = v),
      });
      ui.actions([
        {
          id: 'track', label: 'Nuova pista', primary: true,
          onClick: () => {
            loadTrack((Math.random() * 1e9) | 0);
            reset(true);
            Lab.toast('Pista mai vista prima: ora si capisce se hanno imparato a guidare.');
          },
        },
        { id: 'cones', label: 'Togli ostacoli', onClick: () => (cones = []) },
        { id: 'reset', label: 'Da capo', onClick: () => reset(false) },
      ]);

      const sGen = ui.stat('Generazione');
      const sAlive = ui.stat('In pista');
      const sBest = ui.stat('Record di distanza');
      const sLap = ui.stat('Giro più veloce');
      const chartFig = ui.figure('Distanza percorsa per generazione · migliore e media', 118);
      const netFig = ui.figure('Il cervello dell’auto in testa, in tempo reale', 176);

      // ---------- avvio ----------
      loadTrack((Math.random() * 1e9) | 0);
      reset(false);
      resize();
      const stopObs = Lab.observeSize(canvas, resize);

      let raf = 0, tick = 0;
      function frame() {
        raf = requestAnimationFrame(frame);
        for (let i = 0; i < speed; i++) simStep();
        draw();
        drawNet();
        if (chartDirty) { drawChart(); chartDirty = false; }
        if (++tick % 6 === 0) {
          sGen(generation);
          sAlive(`${cars.filter((c) => c.alive).length} / ${POP}`);
          sBest(`${bestEver.toFixed(2)} giri`);
          sLap(Number.isFinite(bestLap) ? `${bestLap.toFixed(2)} s` : 'nessuno');
        }
      }
      raf = requestAnimationFrame(frame);

      return {
        unmount() {
          cancelAnimationFrame(raf);
          stopObs();
          canvas.remove();
        },
      };
    },
  });
})();
