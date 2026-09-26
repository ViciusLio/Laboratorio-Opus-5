/* Sistema nervoso — corpo intero (175 cm) con encefalo, midollo spinale, nervi intercostali e i nervi
   di braccia e gambe generati dal kit anatomico. La sagoma del corpo è trasparente.
   Un impulso può viaggiare dal cervello al dito o dal piede al cervello. Scala reale in centimetri.
   +x = sinistra del paziente, +y = alto, +z = davanti. Spessori dei nervi ingranditi per visibilità. */
(function () {
  'use strict';

  const GLSL = `
#define HAS_GHOST
const vec3 CENTER = vec3(0.0, 0.0, 0.0);
const float BOUND = 95.0;
const float STEP = 0.85;

float ghostOn() { return uP.x; }

// Sagoma del corpo in posizione "ad A": serve solo per il contorno trasparente.
float ghost(vec3 p) {
  vec3 q = vec3(abs(p.x), p.y, p.z);
  float d = sdEllipsoid(p - vec3(0.0, 76.0, 1.0), vec3(7.8, 11.0, 9.6));                      // testa
  d = smin(d, sdCapsule(p, vec3(0.0, 60.0, -0.5), vec3(0.0, 68.0, 0.5), 5.6), 2.0);            // collo
  float torso = smin(sdEllipsoid(p - vec3(0.0, 40.0, 0.0), vec3(16.5, 20.0, 10.5)),
                     sdEllipsoid(p - vec3(0.0, 15.0, 0.5), vec3(14.5, 15.0, 10.0)), 6.0);
  torso = smin(torso, sdEllipsoid(p - vec3(0.0, -2.0, -0.5), vec3(17.0, 11.0, 10.5)), 6.0);
  d = smin(d, torso, 4.0);
  float arm = sdRoundCone(q, vec3(18.0, 52.0, 0.0), vec3(25.0, 24.0, -1.0), 5.4, 4.0);
  arm = smin(arm, sdRoundCone(q, vec3(25.0, 24.0, -1.0), vec3(30.0, -2.0, 2.0), 4.0, 2.7), 1.5);
  arm = smin(arm, sdEllipsoid(q - vec3(31.8, -10.5, 3.2), vec3(2.2, 7.5, 4.2)), 1.5);
  d = smin(d, arm, 3.0);
  float leg = sdRoundCone(q, vec3(9.0, -4.0, 0.0), vec3(11.0, -45.0, 1.0), 8.5, 5.4);
  leg = smin(leg, sdRoundCone(q, vec3(11.0, -45.0, 1.0), vec3(12.0, -83.0, 0.0), 5.4, 3.4), 1.5);
  leg = smin(leg, sdEllipsoid(q - vec3(12.4, -86.0, 6.5), vec3(4.2, 2.6, 10.5)), 1.5);
  return smin(d, leg, 3.0);
}

// Nervi intercostali: dodici archi che seguono le coste, scendendo verso lo sterno.
float intercostal(vec3 q, float k) {
  float yk = 54.0 - k * 2.4;
  float phi = clamp(atan(q.x / 14.0, -(q.z - 0.5) / 9.0), 0.25, 2.75);
  vec3 c = vec3(14.0 * sin(phi), yk - 6.0 * phi / 3.14159, 0.5 - 9.0 * cos(phi));
  return length(q - c) - 0.4;
}

// Midollo spinale: segue le curve della colonna, fino a L1–L2.
const vec3 MA[2] = vec3[2](vec3(0.0, 64.0, -3.0), vec3(0.0, 40.0, -7.5));
const vec3 MB[2] = vec3[2](vec3(0.0, 53.0, -7.5), vec3(0.0, 31.0, -7.8));
const vec3 MC[2] = vec3[2](vec3(0.0, 40.0, -7.5), vec3(0.0, 22.0, -6.0));

vec2 organ(vec3 p) {
  vec3 q = vec3(abs(p.x), p.y, p.z);
  // Encefalo semplificato, cervelletto, tronco encefalico, nervi ottici e occhi.
  float br = sdEllipsoid(q - vec3(3.2, 78.0, 1.0), vec3(3.3, 4.6, 7.6));
  br = smax(br, 0.12 - q.x, 0.4);
  if (br < 0.8) br += 0.22 * smoothstep(-0.4, -1.0, sin(3.4 * (p.y * 0.8 + p.z * 0.5) + 2.5 * noise(p * 0.5)));
  float cer = sdEllipsoid(q - vec3(2.2, 71.8, -5.2), vec3(2.8, 2.0, 2.4));
  float stem = sdCapsule(p, vec3(0.0, 73.5, -2.0), vec3(0.0, 64.5, -3.0), 1.2);
  float eye = length(q - vec3(3.2, 75.5, 8.0)) - 1.2;
  float optic = sdCapsule(q, vec3(0.6, 74.8, 3.6), vec3(3.1, 75.4, 7.0), 0.28);
  vec2 r = vec2(br, 1.0);
  r = U(r, vec2(cer, 1.0));
  r = SU(r, vec2(stem, 2.0), 0.6);
  r = U(r, vec2(eye, 4.0));
  r = SU(r, vec2(optic, 3.0), 0.2);

  // Midollo spinale e cauda equina.
  float cord = min(sdBezier(p, MA[0], MB[0], MC[0]).x, sdBezier(p, MA[1], MB[1], MC[1]).x) - 0.65;
  float cauda = 1e5;
  for (int i = uZero; i < 4; i++) {
    float fx = (float(i) - 1.5) * 0.35;
    cauda = min(cauda, sdCapsule(p, vec3(fx * 0.4, 22.0, -6.0), vec3(fx, 1.0, -7.2), 0.18));
  }
  r = SU(r, vec2(min(cord, cauda), 2.0), 0.3);

  // Nervi intercostali (solo i tre archi più vicini al punto).
  if (q.x < 17.0 && q.y > 14.0 && q.y < 58.0) {
    float phi = clamp(atan(q.x / 14.0, -(q.z - 0.5) / 9.0), 0.25, 2.75);
    float k0 = clamp(floor((54.0 - (q.y + 6.0 * phi / 3.14159)) / 2.4 + 0.5), 1.0, 12.0);
    float ic = min(intercostal(q, k0), min(intercostal(q, max(k0 - 1.0, 1.0)), intercostal(q, min(k0 + 1.0, 12.0))));
    r = U(r, vec2(ic, 3.0));
  }

  // Nervi di braccia e gambe dal kit (generati per il lato sinistro, specchiati).
  vec2 s = segments(q);
  r = SU(r, vec2(s.x, 3.0), 0.25);
  return r;
}

vec4 material(float m, vec3 p, vec3 n) {
  vec4 c;
  if (m < 1.5) c = vec4(vec3(0.78, 0.6, 0.56) * (0.9 + 0.2 * noise(p * 1.5)), 0.45);   // encefalo
  else if (m < 2.5) c = vec4(0.9, 0.84, 0.72, 0.5);                                     // midollo
  else if (m < 3.5) c = vec4(0.9, 0.74, 0.3, 0.6);                                      // nervi: gialli come negli atlanti
  else c = vec4(0.92, 0.92, 0.9, 0.9);                                                  // occhi
  // L'impulso nervoso: un tratto luminoso che corre lungo le fibre.
  float glow = uQ.w * exp(-dot(p - uQ.xyz, p - uQ.xyz) / 18.0);
  c.rgb = mix(c.rgb, vec3(1.6, 1.5, 1.1), clamp(glow, 0.0, 1.0));
  return c;
}

vec3 cutColor(vec3 p, vec2 o) {
  if (o.y < 1.5) return mix(vec3(0.56, 0.45, 0.45), vec3(0.93, 0.89, 0.82), smoothstep(0.25, 0.35, -o.x));
  // Nervo in sezione: fascicoli chiari nella guaina.
  return mix(vec3(0.95, 0.85, 0.5), vec3(0.8, 0.6, 0.25), smoothstep(0.4, 0.7, noise(p * 6.0)));
}
`;

  // ---------- geometria dei nervi periferici (lato sinistro, x > 0) ----------
  const R = 1.8;   // ingrandimento degli spessori, per vederli a figura intera
  const line = (kit, pts, r0, r1) => {
    const radii = pts.map((_, i) => (r0 + (r1 - r0) * (i / (pts.length - 1))) * R);
    return kit.polyline(pts, radii);
  };
  const AXILLA = [16, 48, -0.5];
  const PATHS = {
    plexus: [[1.2, 57, -5.5], [6, 54, -3], [12, 51, -1.5], AXILLA],
    median: [AXILLA, [21, 36, 1.2], [24.4, 24, 1.2], [27.4, 11, 2.8], [29.8, -2, 3.8], [31, -9, 4.6]],
    ulnar: [AXILLA, [20.5, 36, -1.5], [23.2, 24, -2.6], [27, 11, 0], [31.2, -2, 1.6], [34.2, -10, 2.4]],
    radial: [AXILLA, [21.5, 38, -3.2], [26.8, 25, -0.6], [29.5, 11, 0.6], [30.5, -4, 0.6], [28.5, -10, 2.0]],
    sciatic: [[1.0, 2, -7], [5, -2, -6], [8, -6, -8], [10, -25, -5], [11, -40, -4]],
    tibial: [[11, -40, -4], [11, -46, -3.5], [11.5, -65, -3.5], [11, -82, -1.5], [12, -86, 4], [12.5, -87, 11]],
    peroneal: [[11, -40, -4], [13.5, -47, -1.5], [13, -65, 2.5], [12.8, -84, 5], [13.5, -86.5, 11]],
    femoral: [[3, 10, -5], [7.5, -6, 5], [9.5, -22, 5.5], [9.8, -45, 2], [10.2, -80, 1.5]],
    vagus: [[1.8, 66, -1.5], [2.2, 58, 0.5], [2.6, 44, -1.5], [2.0, 30, -2.0], [1.5, 16, -1.0]],
  };
  const FINGERS = [
    [[31, -9, 4.6], [27.5, -12.5, 6.0]], [[31, -9, 4.6], [30.8, -18, 5.5]], [[31, -9, 4.6], [33, -18.5, 4.8]],
    [[34.2, -10, 2.4], [35.5, -16.5, 2.8]], [[34.2, -10, 2.4], [34.5, -18, 3.6]],
  ];

  // Percorsi degli impulsi: comando motorio al dito indice, sensazione dall'alluce al cervello.
  const MOTOR = [[2, 78, 1], [0.5, 66, -2.5], ...PATHS.plexus, ...PATHS.median.slice(1), [30.8, -18, 5.5]];
  const SENSORY = [[12.5, -87, 11], ...PATHS.tibial.slice(0, -1).reverse(), ...PATHS.sciatic.slice(0, -1).reverse(),
    [0, 22, -6], [0, 40, -7.5], [0, 52, -6.5], [0, 64, -3], [0.5, 72, -1.5], [2, 78, 1]];
  const lengthOf = (pts) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1], p[2] - pts[i][2]), 0);
  const pointAt = (pts, s) => {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      if (s <= l) { const t = s / l; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
      s -= l;
    }
    return pts[pts.length - 1];
  };
  const LM = lengthOf(MOTOR), LS = lengthOf(SENSORY);
  const fiber = (v) => (v < 3 ? 'fibre C, dolore lento' : v < 30 ? 'fibre Aδ, dolore acuto' : v < 70 ? 'fibre Aβ, tatto' : 'fibre Aα, muscoli');

  const Ne = (window.BodyOrgans = window.BodyOrgans || { list: {} });
  Ne.list.nervi = {
    name: 'Sistema nervoso',
    kicker: 'Anatomia procedurale · il sistema nervoso',
    title: 'Sistema nervoso',
    tagline: 'Dal cervello alla punta delle dita: encefalo, midollo spinale e nervi in un corpo di 175 centimetri. Manda un impulso e scopri quanto ci mette davvero ad arrivare, a seconda del tipo di fibra.',
    hint: 'Premi “Comando al dito” o “Tocco al piede” · rotella per avvicinarti a mano e gamba',
    formula:
      '<div>t = L ⁄ v ≈ 1 m ⁄ 60 m/s ≈ 17 ms</div>' +
      '<div>v ≈ 6 m/s per µm di diametro (fibre mieliniche)</div>',
    how:
      '<p>Scala reale in centimetri, con gli spessori dei nervi ingranditi di quasi due volte per vederli a figura intera. La sagoma del corpo è disegnata da un secondo raymarching, solo come contorno.</p>' +
      '<ol>' +
      '<li><strong>Sistema nervoso centrale.</strong> L’encefalo e il midollo spinale, spesso circa un centimetro, che segue le curve della colonna e finisce all’altezza della prima-seconda vertebra lombare; più in basso le radici continuano come “coda di cavallo”.</li>' +
      '<li><strong>Nervi periferici.</strong> Quelli di braccia e gambe non sono scritti nello shader: sono dati generati dal kit anatomico (sequenze di punti e raggi) e specchiati sui due lati. Il nervo ulnare passa dietro il gomito: è lui la “scossa” quando si batte il gomito.</li>' +
      '<li><strong>Nervi intercostali.</strong> Dodici archi calcolati al volo che seguono le coste, scendendo verso lo sterno.</li>' +
      '<li><strong>Velocità.</strong> Le fibre grosse e rivestite di mielina conducono fino a circa 120 m/s, le fibre sottili del dolore lento meno di 2 m/s. Nella scena l’impulso è rallentato perché si possa seguire; i tempi reali sono nel pannello.</li>' +
      '</ol>',
    center: [0, 0, 0],
    bound: 95,
    camera: { yaw: 0.3, pitch: 0.05, dist: 245 },
    cutStart: { coronale: -3.0, sagittale: 0.0, assiale: 40.0 },
    labels: [
      { t: 'Encefalo', p: [5.5, 81, 3], n: [0.6, 0.5, 0.6] },
      { t: 'Midollo spinale', p: [0.8, 44, -6.5], n: [0.4, 0, 0.9] },
      { t: 'Plesso brachiale', p: [9, 53, -1.5], n: [0.3, 0.3, 0.9] },
      { t: 'Nervo mediano', p: [26.2, 16, 3.6], n: [0.2, 0, 1] },
      { t: 'Nervo ulnare', p: [23.6, 24, -3.8], n: [-0.3, 0, -0.9] },
      { t: 'Nervo radiale', p: [27.8, 25, -0.5], n: [0.9, 0, 0.3] },
      { t: 'Nervi intercostali', p: [13.4, 38, 4], n: [0.8, 0, 0.6] },
      { t: 'Nervo sciatico', p: [10, -25, -6.5], n: [0.2, 0, -1] },
      { t: 'Nervo femorale', p: [9.5, -22, 6.8], n: [0.2, 0, 1] },
      { t: 'Nervo tibiale', p: [11.5, -65, -5], n: [0.2, 0, -1] },
      { t: 'Nervo peroneo comune', p: [14.5, -50, -1], n: [0.9, 0, 0.3] },
      { t: 'Nervo vago', p: [2.8, 44, -0.8], n: [0.5, 0, 0.9] },
    ],
    stats: [
      ['Fibra scelta', (st) => fiber(st.v)],
      ['Cervello → dito', (st) => `${((LM / 100 / st.v) * 1000).toFixed(st.v < 5 ? 0 : 1).replace('.', ',')} ms reali`],
      ['Alluce → cervello', (st) => `${((LS / 100 / st.v) * 1000).toFixed(st.v < 5 ? 0 : 1).replace('.', ',')} ms reali`],
      ['Nervi', '31 paia spinali, 12 cranici'],
    ],
    glsl: GLSL,

    buildSegments(kit) {
      const segs = [];
      segs.push(...line(kit, PATHS.plexus, 0.55, 0.45));
      segs.push(...line(kit, PATHS.median, 0.4, 0.3));
      segs.push(...line(kit, PATHS.ulnar, 0.38, 0.28));
      segs.push(...line(kit, PATHS.radial, 0.38, 0.26));
      for (const f of FINGERS) segs.push(...line(kit, f, 0.2, 0.12));
      segs.push(...line(kit, PATHS.sciatic, 0.8, 0.7));
      segs.push(...line(kit, PATHS.tibial, 0.5, 0.25));
      segs.push(...line(kit, PATHS.peroneal, 0.42, 0.22));
      segs.push(...line(kit, PATHS.femoral, 0.45, 0.2));
      segs.push(...line(kit, PATHS.vagus, 0.25, 0.2));
      return segs;
    },

    setup(ui, st) {
      st.v = 60;
      st.p[0] = 1;
      let path = null, s = 0;
      const VISUAL = 70;   // cm/s nella scena: l'impulso è rallentato per poterlo seguire
      ui.actions([
        { id: 'motor', label: 'Comando al dito', primary: true, onClick: () => { path = MOTOR; s = 0; } },
        { id: 'sensory', label: 'Tocco al piede', onClick: () => { path = SENSORY; s = 0; } },
      ]);
      ui.slider({ id: 'vel', label: 'Velocità della fibra', min: 1, max: 120, step: 1, value: st.v, format: (v) => `${v} m/s`, onInput: (v) => (st.v = v) });
      ui.toggle({ id: 'ghost', label: 'Sagoma del corpo', value: true, onChange: (v) => (st.p[0] = v ? 1 : 0) });
      return {
        tick(dt) {
          if (!path) { st.q[3] = Math.max(0, st.q[3] - dt * 2); return; }
          const L = path === MOTOR ? LM : LS;
          s += dt * VISUAL * Math.max(0.3, Math.sqrt(st.v / 60));
          const pos = pointAt(path, Math.min(s, L));
          const mirrored = [Math.abs(pos[0]), pos[1], pos[2]];
          st.q[0] = mirrored[0]; st.q[1] = mirrored[1]; st.q[2] = mirrored[2];
          st.q[3] = 1;
          if (s > L + 20) path = null;
        },
      };
    },
  };
})();
