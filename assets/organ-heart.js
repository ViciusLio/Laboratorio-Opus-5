/* Cuore — modello anatomico in funzioni di distanza, scala reale in centimetri.
   +x = sinistra del paziente, +y = alto, +z = davanti. Il cuore batte a tempo con l'ECG:
   gli atri si contraggono sull'onda P, i ventricoli subito dopo il complesso QRS. */
(function () {
  'use strict';

  const GLSL = `
const vec3 CENTER = vec3(0.4, 2.6, -0.4);
const float BOUND = 10.5;
const float STEP = 0.8;
const vec3 BASE = vec3(-0.4, 1.6, -0.6);

float ventSys() { float ph = fract(uBeat); return smoothstep(0.02, 0.12, ph) * (1.0 - smoothstep(0.3, 0.46, ph)); }
float atrSys() { float ph = fract(uBeat); return smoothstep(0.76, 0.84, ph) * (1.0 - smoothstep(0.88, 0.97, ph)); }

// Sistema locale dei ventricoli: l'asse lungo punta in basso, a sinistra e in avanti.
vec3 toVent(vec3 p) {
  vec3 q = p - BASE;
  q.xy = rot(-0.55) * q.xy;
  q.yz = rot(0.4) * q.yz;
  return q;
}

vec2 ventricles(vec3 p) {
  vec3 q = toVent(p);
  float vs = ventSys();
  float grow = 1.0 + 0.16 * uP.y + 0.06 * uP.x;          // dilatazione e ipertrofia ingrandiscono il cuore
  float k = (1.0 + 0.075 * vs) / grow;
  vec3 qo = vec3(q.x * k, q.y * (1.0 + 0.035 * vs), q.z * k);
  vec3 qf = vec3(qo.x, qo.y, qo.z * 1.2);                      // un po' schiacciato davanti-dietro
  float lv = sdRoundCone(qf, vec3(0.3, -0.6, -0.2), vec3(0.2, -7.4, 0.1), 3.5, 0.95) * 0.83;
  float rv = sdEllipsoid(qo - vec3(-1.7, -2.6, 1.0), vec3(2.5, 3.3, 1.9));
  float outer = smin(lv, rv, 1.2) / k;

  // In sistole la cavità si svuota più di quanto si stringa il cuore: la parete si ispessisce.
  // Ipertrofia: la parete cresce verso l'interno e la cavità si restringe. Dilatazione: il contrario.
  float kl = (1.0 + 0.24 * vs) / (grow * (1.0 + 0.32 * uP.y - 0.36 * uP.x));
  float kr = (1.0 + 0.24 * vs) / (grow * (1.0 + 0.15 * uP.y - 0.2 * uP.x));
  float lvc = sdEllipsoid(vec3(q.x * kl, q.y * (1.0 + 0.08 * vs) / grow, q.z * kl) - vec3(0.4, -3.4, -0.2), vec3(1.1, 2.8, 1.0)) / kl;
  float rvc = sdEllipsoid(vec3(q.x * kr, q.y * (1.0 + 0.08 * vs) / grow, q.z * kr) - vec3(-2.7, -2.6, 0.9), vec3(1.1, 2.4, 1.3)) / kr;
  float cav = min(lvc, rvc);
  float d = max(outer, -cav);
  float m = -cav > outer ? 8.0 : 1.0;

  if (m < 1.5 && d < 0.8) {
    // Solchi con grasso epicardico, arterie coronarie (rosse) e vene cardiache (blu).
    float xa = q.x - (-0.55 + 0.07 * -q.y);                    // solco interventricolare anteriore
    float front = smoothstep(0.2, 1.4, q.z) * smoothstep(-8.3, -6.9, q.y);
    float xp = q.x - (-0.9 + 0.05 * -q.y);                      // solco interventricolare posteriore
    float back = smoothstep(-0.4, -1.5, q.z) * smoothstep(-8.0, -6.5, q.y);
    float ya = q.y + 0.95;                                       // solco coronario, fra atri e ventricoli
    float av = exp(-ya * ya / 0.22);
    float diag = abs((q.y + 1.6) + 0.9 * (q.x - 0.2)) ;          // ramo diagonale verso la parete sinistra
    float dg = exp(-diag * diag / 0.02) * smoothstep(-0.2, 0.6, q.x) * smoothstep(3.0, 1.5, q.x) * front;
    float fat = max(max(exp(-xa * xa / 0.16) * front, exp(-xp * xp / 0.16) * back), av * 0.95);
    float art = max(max(exp(-xa * xa / 0.025) * front, exp(-xp * xp / 0.025) * back), max(exp(-ya * ya / 0.02), dg));
    float xv = xa - 0.3, yv = ya + 0.3;
    float vein = max(exp(-xv * xv / 0.012) * front, exp(-yv * yv / 0.01) * av);
    d -= fat * 0.07 + art * 0.14 + vein * 0.08;
    if (fat > 0.45) m = 3.0;
    if (vein > 0.5) m = 5.0;
    if (art > 0.5) m = 4.0;
  }
  return vec2(d, m);
}

vec2 atria(vec3 p) {
  float k = 1.0 + 0.06 * atrSys();
  vec3 c0 = vec3(-0.6, 2.6, -1.2);
  vec3 q = (p - c0) * k + c0;
  float ra = sdEllipsoid(q - vec3(-2.7, 2.3, -0.4), vec3(2.1, 2.3, 2.2));
  float la = sdEllipsoid(q - vec3(0.9, 2.7, -2.4), vec3(2.5, 1.7, 1.8));
  vec3 qa = q - vec3(-1.3, 3.7, 1.5);
  qa.xy = rot(-0.35) * qa.xy;
  float rau = sdEllipsoid(qa, vec3(1.6, 0.75, 1.1)) + 0.07 * noise(q * 4.0);   // auricola destra
  vec3 ql = q - vec3(2.7, 3.5, 0.5);
  ql.xy = rot(0.5) * ql.xy;
  float lau = sdEllipsoid(ql, vec3(1.3, 0.65, 0.95)) + 0.07 * noise(q * 4.0);   // auricola sinistra
  float d = smin(smin(ra, la, 0.9), min(rau, lau), 0.5);
  float cav = min(sdEllipsoid(q - vec3(-2.7, 2.3, -0.4), vec3(1.8, 2.0, 1.9)),
                  sdEllipsoid(q - vec3(0.9, 2.7, -2.4), vec3(2.2, 1.4, 1.5)));
  float m = -cav > d ? 8.0 : 2.0;
  return vec2(max(d, -cav) / k, m);
}

float hollow(float d, float w) { return max(d, -d - w); }

vec2 vessels(vec3 p) {
  // Aorta: ascendente, arco, discendente, con i tre rami dell'arco.
  vec2 b1 = sdBezier(p, vec3(-0.1, 2.2, 0.3), vec3(-0.6, 7.4, 0.9), vec3(1.4, 8.2, -1.2));
  vec2 b2 = sdBezier(p, vec3(1.4, 8.2, -1.2), vec3(3.1, 8.9, -3.0), vec3(2.6, 5.2, -3.6));
  float ao = min(b1.x, b2.x) - 1.3;
  ao = min(ao, sdCapsule(p, vec3(2.6, 5.2, -3.6), vec3(2.3, -3.5, -3.9), 1.2));
  float br = sdCapsule(p, vec3(0.1, 8.2, -0.2), vec3(-1.1, 11.2, 0.1), 0.62);
  br = min(br, sdCapsule(p, vec3(1.2, 8.6, -0.9), vec3(1.5, 11.4, -0.8), 0.42));
  br = min(br, sdCapsule(p, vec3(2.2, 8.6, -1.9), vec3(3.3, 11.1, -2.3), 0.5));
  float aorta = hollow(smin(ao, br, 0.4), 0.22);
  // Tronco polmonare e arterie polmonari.
  vec2 pt = sdBezier(p, vec3(0.8, 1.8, 2.0), vec3(1.5, 4.9, 2.0), vec3(1.1, 5.6, -0.1));
  float pa = pt.x - 1.25;
  pa = smin(pa, sdCapsule(p, vec3(1.1, 5.6, -0.1), vec3(4.0, 5.9, -1.0), 0.85), 0.5);
  pa = smin(pa, sdCapsule(p, vec3(1.1, 5.6, -0.1), vec3(-3.2, 5.5, -1.6), 0.85), 0.5);
  pa = hollow(pa, 0.18);
  // Vene cave.
  float vc = sdCapsule(p, vec3(-2.6, 3.6, -0.5), vec3(-2.5, 9.8, -0.7), 1.0);
  vc = hollow(min(vc, sdCapsule(p, vec3(-2.4, 0.9, -1.1), vec3(-2.2, -3.8, -1.7), 1.1)), 0.15);
  // Vene polmonari, due per lato.
  float pv = sdCapsule(p, vec3(1.8, 3.2, -3.3), vec3(4.6, 3.6, -4.2), 0.55);
  pv = min(pv, sdCapsule(p, vec3(1.8, 2.1, -3.2), vec3(4.4, 1.6, -4.1), 0.55));
  pv = min(pv, sdCapsule(p, vec3(-0.6, 3.2, -3.3), vec3(-3.2, 3.6, -4.3), 0.55));
  pv = min(pv, sdCapsule(p, vec3(-0.6, 2.1, -3.2), vec3(-3.0, 1.6, -4.2), 0.55));
  vec2 r = U(vec2(aorta, 6.0), vec2(pv, 6.0));
  r = U(r, vec2(pa, 7.0));
  return U(r, vec2(vc, 7.0));
}

vec2 organ(vec3 p) {
  vec2 r = SU(ventricles(p), atria(p), 0.6);
  return SU(r, vessels(p), 0.3);
}

vec4 material(float m, vec3 p, vec3 n) {
  float g = noise(p * 3.0);
  if (m < 1.5) return vec4(vec3(0.34, 0.06, 0.05) * (0.9 + 0.18 * g), 0.75);          // miocardio
  if (m < 2.5) return vec4(vec3(0.42, 0.1, 0.09) * (0.9 + 0.18 * g), 0.65);           // atri
  if (m < 3.5) return vec4(vec3(0.78, 0.58, 0.24) * (0.85 + 0.3 * noise(p * 7.0)), 0.8); // grasso
  if (m < 4.5) return vec4(0.7, 0.05, 0.04, 0.9);                                       // coronarie
  if (m < 5.5) return vec4(0.1, 0.13, 0.4, 0.9);                                        // vene cardiache
  if (m < 6.5) return vec4(0.62, 0.06, 0.05, 0.75);                                     // sangue ossigenato
  if (m < 7.5) return vec4(0.1, 0.17, 0.48, 0.75);                                      // sangue non ossigenato
  return vec4(0.8, 0.45, 0.42, 0.35);                                                   // endocardio
}

vec3 cutColor(vec3 p, vec2 o) {
  if (o.y > 5.5 && o.y < 7.5) return vec3(0.88, 0.76, 0.7);                            // parete dei vasi
  if (o.y > 2.5 && o.y < 3.5 && o.x > -0.2) return vec3(0.9, 0.72, 0.32);             // grasso, solo in superficie
  vec3 q = toVent(p);
  float fib = noise(vec3(q.x * 9.0, q.y * 2.5 + q.x * 3.0, q.z * 9.0));                 // fibre del miocardio
  return vec3(0.62, 0.14, 0.12) * (0.8 + 0.35 * fib);
}
`;

  const ecg = (ph) => {
    const x = ph - Math.round(ph);
    const g = (c, w, a) => a * Math.exp(-((x - c) ** 2) / (2 * w * w));
    return g(-0.2, 0.025, 0.12) + g(-0.03, 0.008, -0.12) + g(0, 0.011, 1) + g(0.03, 0.01, -0.25) + g(0.28, 0.045, 0.3);
  };

  const H = (window.BodyOrgans = window.BodyOrgans || { list: {} });
  H.list.cuore = {
    name: 'Cuore',
    kicker: 'Anatomia procedurale · il cuore',
    title: 'Cuore',
    tagline: 'Circa 12 centimetri e 300 grammi, costruiti con una trentina di forme matematiche fuse insieme. Batte al ritmo che scegli, sincronizzato con l’elettrocardiogramma. Taglialo per vedere dentro le camere.',
    hint: 'Trascina per girare · rotella per lo zoom · prova il taglio coronale',
    formula:
      '<div>Q = FC × VS ≈ 4,9 L/min</div>' +
      '<div>smin(a, b, k) = min(a, b) − h<sup>2</sup>k ⁄ 4</div>',
    how:
      '<p>Scala reale in centimetri. Nessun modello 3D: ogni punto dell’immagine è calcolato da funzioni di distanza.</p>' +
      '<ol>' +
      '<li><strong>Forme.</strong> Ventricoli, atri e auricole sono coni arrotondati ed ellissoidi fusi con un’unione morbida, la seconda formula: dove due forme si avvicinano, la superficie si raccorda invece di spigolare.</li>' +
      '<li><strong>Cavità.</strong> Le camere sono scavate dentro i volumi. La parete del ventricolo sinistro è spessa circa 1 cm, quella del destro circa 0,4 cm: il sinistro spinge il sangue in tutto il corpo, il destro solo nei polmoni.</li>' +
      '<li><strong>Vasi.</strong> Aorta e tronco polmonare sono tubi lungo curve di Bézier. Rosso è il sangue ossigenato (aorta, vene polmonari), blu quello povero di ossigeno (vene cave, arteria polmonare): per questo l’arteria polmonare è blu e le vene polmonari sono rosse.</li>' +
      '<li><strong>Superficie.</strong> Nei solchi fra le camere corrono le arterie coronarie e le vene cardiache, immerse nel grasso epicardico giallo, come nei cuori veri.</li>' +
      '<li><strong>Battito.</strong> Gli atri si contraggono sull’onda P dell’ECG, i ventricoli subito dopo il complesso QRS. In sistole la cavità si svuota più di quanto il cuore si stringa, quindi la parete si ispessisce, come succede davvero.</li>' +
      '</ol>',
    center: [0.4, 2.6, -0.4],
    bound: 10.5,
    camera: { yaw: 0.35, pitch: 0.12, dist: 27 },
    cutStart: { coronale: 0.6, sagittale: -0.8, assiale: 1.0 },
    labels: [
      { t: 'Aorta', p: [0.6, 9.4, -0.4], n: [0, 1, 0.25] },
      { t: 'Tronco polmonare', p: [1.3, 4.3, 2.7], n: [0.1, 0, 1] },
      { t: 'Vena cava superiore', p: [-3.5, 7.2, -0.6], n: [-1, 0, 0.1] },
      { t: 'Atrio destro', p: [-4.8, 2.3, -0.4], n: [-1, 0, 0.15] },
      { t: 'Auricola sinistra', p: [3.8, 3.9, 0.7], n: [0.7, 0.3, 0.6] },
      { t: 'Ventricolo destro', p: [-1.5, -0.8, 3.1], n: [-0.2, 0.33, 0.92] },
      { t: 'Ventricolo sinistro', p: [3.6, 0.3, 0.7], n: [0.85, 0.5, 0.1] },
      { t: 'Coronaria discendente anteriore', p: [0.56, -0.55, 2.88], n: [-0.2, 0.33, 0.92] },
      { t: 'Apice', p: [3.8, -5.3, 2.8], n: [0.48, -0.79, 0.39] },
    ],
    stats: [
      ['Battito', (st) => `${st.bpm} bpm`],
      ['Portata cardiaca', (st) => `${((st.bpm * st.sv) / 1000).toFixed(1)} L/min`],
      ['Parete del ventricolo sinistro', (st) => `≈ ${(1.1 + 0.8 * st.p[0] - 0.25 * st.p[1]).toFixed(1).replace('.', ',')} cm (stima)`],
      ['Frazione di eiezione', (st) => `≈ ${Math.round(62 - 30 * st.p[1] - 5 * st.p[0])}% (stima)`],
      ['Battiti in un giorno', (st) => (st.bpm * 1440).toLocaleString('it-IT')],
      ['Peso tipico', '250–350 g'],
    ],
    glsl: GLSL,

    setup(ui, st) {
      st.bpm = 72;
      st.sv = 70;
      let actx = null, sound = false;
      ui.slider({ id: 'hbpm', label: 'Battito cardiaco', min: 40, max: 180, step: 1, value: st.bpm, format: (v) => `${v} bpm`, onInput: (v) => (st.bpm = v) });
      ui.slider({ id: 'hsv', label: 'Gittata sistolica', min: 40, max: 120, step: 1, value: st.sv, format: (v) => `${v} mL`, onInput: (v) => (st.sv = v) });
      ui.toggle({
        id: 'hsound', label: 'Suono del battito', value: false,
        onChange: (v) => {
          sound = v;
          if (v && !actx) actx = new (window.AudioContext || window.webkitAudioContext)();
          if (actx) actx.resume();
        },
      });
      ui.slider({ id: 'hyp', label: 'Ipertrofia (parete spessa)', min: 0, max: 1, step: 0.01, value: 0, format: (v) => (v < 0.02 ? 'assente' : Math.round(v * 100) + '%'), onInput: (v) => (st.p[0] = v) });
      ui.slider({ id: 'dil', label: 'Dilatazione (cavità grandi)', min: 0, max: 1, step: 0.01, value: 0, format: (v) => (v < 0.02 ? 'assente' : Math.round(v * 100) + '%'), onInput: (v) => (st.p[1] = v) });
      const fig = ui.figure('Elettrocardiogramma, sincronizzato con il modello', 84);

      function thump(t, freq, gain) {
        const g = actx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        const lp = actx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 220;
        for (const [type, mult, lvl] of [['sine', 1, 1], ['triangle', 2, 0.35]]) {
          const o = actx.createOscillator();
          o.type = type;
          o.frequency.setValueAtTime(freq * mult * 1.6, t);
          o.frequency.exponentialRampToValueAtTime(freq * mult, t + 0.08);
          const og = actx.createGain();
          og.gain.value = lvl;
          o.connect(og);
          og.connect(g);
          o.start(t);
          o.stop(t + 0.25);
        }
        g.connect(lp);
        lp.connect(actx.destination);
      }

      return {
        tick(dt) {
          const prev = st.beat;
          st.beat += dt * (st.bpm / 60);
          if (sound && actx && Math.floor(st.beat) > Math.floor(prev)) {
            const t = actx.currentTime + 0.01;
            thump(t, 50, 0.9);
            thump(t + 0.1 + 0.25 * (60 / st.bpm), 64, 0.55);
          }
        },
        draw() {
          const f = fig.fit();
          const g = f.ctx, w = f.w, h = f.h;
          g.clearRect(0, 0, w, h);
          g.strokeStyle = '#1d212b';
          g.lineWidth = 1;
          for (let x = 0; x < w; x += 16) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, h); g.stroke(); }
          for (let y = 0; y < h; y += 16) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(w, y + 0.5); g.stroke(); }
          const base = h * 0.68, amp = h * 0.52;
          g.strokeStyle = '#ff6b81';
          g.lineWidth = 1.6;
          g.beginPath();
          for (let x = 0; x <= w; x++) {
            const y = base - ecg(st.beat - ((w - x) / w) * 4 * (st.bpm / 60)) * amp;
            if (x) g.lineTo(x, y); else g.moveTo(x, y);
          }
          g.stroke();
        },
        dispose() { if (actx) actx.close().catch(() => {}); },
      };
    },
  };
})();
