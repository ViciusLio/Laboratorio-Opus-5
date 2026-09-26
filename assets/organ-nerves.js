/* Sistema nervoso — corpo intero (175 cm): encefalo, midollo, radici spinali, plessi, nervi di tronco,
   arti, mani, piedi e volto. I nervi periferici (circa 260 segmenti) sono generati dal kit anatomico con
   rami laterali; spessori quasi reali, resi visibili da un alone luminoso calcolato lungo il raggio.
   Scala reale in centimetri. +x = sinistra del paziente, +y = alto, +z = davanti. */
(function () {
  'use strict';

  const GLSL = `
#define HAS_GHOST
#define HAS_GLOW
const vec3 CENTER = vec3(0.0, 0.0, 0.0);
const float BOUND = 95.0;
const float STEP = 0.85;

float ghostOn() { return uP.x; }

// Sagoma del corpo in posizione "ad A": contorno trasparente e limite esterno dei nervi.
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

// Nervi intercostali: dodici archi sottili lungo le coste, dalla colonna verso lo sterno.
float intercostal(vec3 q, float k) {
  float yk = 51.5 - k * 2.35;
  float phi = clamp(atan(q.x / 13.6, -(q.z - 0.5) / 8.8), 0.22, 2.7);
  vec3 c = vec3(13.6 * sin(phi), yk - 6.0 * phi / 3.14159 + 0.25 * sin(phi * 5.0 + k), 0.5 - 8.8 * cos(phi));
  return length(q - c) - 0.09;
}

// Midollo spinale lungo le curve della colonna, fino a L1–L2.
const vec3 MA[2] = vec3[2](vec3(0.0, 66.5, -2.6), vec3(0.0, 40.0, -7.4));
const vec3 MB[2] = vec3[2](vec3(0.0, 53.0, -7.4), vec3(0.0, 31.0, -7.8));
const vec3 MC[2] = vec3[2](vec3(0.0, 40.0, -7.4), vec3(0.0, 22.0, -6.0));

vec2 organ(vec3 p) {
  // Fuori dal corpo basta la distanza dalla sagoma: i nervi sono tutti dentro.
  float gb = ghost(p);
  if (gb > 1.0) return vec2(gb, 3.0);
  vec3 q = vec3(abs(p.x), p.y, p.z);

  // Encefalo: emisferi con circonvoluzioni, lobi temporali, cervelletto, tronco encefalico.
  float br = sdEllipsoid(q - vec3(3.35, 79.2, 0.4), vec3(3.55, 5.1, 8.1));
  br = smin(br, sdEllipsoid(q - vec3(4.7, 75.8, 1.8), vec3(2.2, 1.9, 3.7)), 1.2);
  br = smax(br, 0.12 - q.x, 0.4);
  br = smax(br, 74.0 - p.y + 0.12 * max(p.z - 3.0, 0.0), 0.8);
  if (br < 0.8) br += 0.2 * smoothstep(-0.45, -0.95, sin(5.2 * (p.y * 0.85 + p.z * 0.5) + 3.2 * gnoise(p * 0.3)));
  float cer = sdEllipsoid(q - vec3(2.2, 73.6, -5.6), vec3(2.9, 2.0, 2.4));
  if (cer < 0.5) cer += 0.08 * (0.5 + 0.5 * sin(length(p.yz - vec2(74.5, -3.8)) * 12.0));
  float stem = sdCapsule(p, vec3(0.0, 75.0, -2.0), vec3(0.0, 66.5, -2.6), 1.15);
  vec2 r = vec2(br, 1.0);
  r = U(r, vec2(cer, 1.0));
  r = SU(r, vec2(stem, 2.0), 0.6);

  // Midollo spinale e cauda equina.
  float cord = min(sdBezier(p, MA[0], MB[0], MC[0]).x, sdBezier(p, MA[1], MB[1], MC[1]).x) - 0.5;
  float cauda = 1e5;
  for (int i = uZero; i < 6; i++) {
    float fx = (float(i) - 2.5) * 0.28;
    cauda = min(cauda, sdCapsule(p, vec3(fx * 0.3, 22.0, -6.0), vec3(fx, -3.0, -7.4), 0.1));
  }
  r = SU(r, vec2(min(cord, cauda), 2.0), 0.3);

  // Nervi intercostali: solo i tre archi più vicini al punto.
  if (q.x < 17.0 && q.y > 14.0 && q.y < 56.0) {
    float phi = clamp(atan(q.x / 13.6, -(q.z - 0.5) / 8.8), 0.22, 2.7);
    float k0 = clamp(floor((51.5 - (q.y + 6.0 * phi / 3.14159)) / 2.35 + 0.5), 1.0, 12.0);
    float ic = min(intercostal(q, k0), min(intercostal(q, max(k0 - 1.0, 1.0)), intercostal(q, min(k0 + 1.0, 12.0))));
    r = U(r, vec2(ic, 3.0));
  }

  // Nervi periferici dal kit (lato sinistro, specchiati): solo i rami entro 2,5 cm.
  vec2 s = segmentsWithin(q, min(r.x, 2.5));
  // Se un nervo è vicino lo si unisce; altrimenti 2,5 cm restano comunque il passo massimo sicuro.
  if (s.y >= 0.0) r = SU(r, vec2(s.x, 3.0), 0.15);
  else r.x = min(r.x, s.x);
  return r;
}

// Stile (uP.y): 0 = "Tavola", come le illustrazioni anatomiche (nervi blu su una sagoma chiara,
// sistema nervoso centrale giallo); 1 = "Luminoso" (fibre dorate che brillano nel buio).
bool tavola() { return uP.y < 0.5; }

// Vicino ai nervi si accumula un alone; a parte, la luce dell'impulso nervoso.
float gPulse = 0.0;
float glowAt(vec3 p, float d) {
  float pd = dot(p - uQ.xyz, p - uQ.xyz);
  gPulse += uQ.w * 0.3 * exp(-pd / 30.0) * step(d, 2.4);
  if (gM < 2.5) return 0.0;                                   // solo i nervi periferici, non encefalo e midollo
  float k = tavola() ? 2.6 : 1.5;
  return max(exp(-d * k) - exp(-2.5 * k), 0.0) * 0.065;
}
vec3 applyGlow(vec3 col, float g) {
  if (tavola()) col = mix(col, vec3(0.1, 0.32, 0.78), clamp(g * 1.1, 0.0, 0.85));  // tratto blu, come a inchiostro
  else col += vec3(1.0, 0.64, 0.2) * g;                                            // bagliore dorato
  return col + vec3(1.2, 1.0, 0.45) * gPulse;
}

// Sagoma: in "Tavola" è un fondo chiaro con il contorno, e i nervi ci stanno sopra.
vec3 ghostShade(vec3 col, bool hitAny, float rim, vec3 gn) {
  if (!tavola()) return col * (1.0 - 0.25 * rim) + vec3(0.35, 0.65, 1.0) * (0.035 + 0.55 * rim);
  vec3 skin = vec3(0.46, 0.54, 0.64) * (0.88 + 0.12 * gn.y);
  return mix(hitAny ? col : skin, vec3(0.36, 0.5, 0.7), smoothstep(0.5, 0.95, rim));
}

vec4 material(float m, vec3 p, vec3 n) {
  vec4 c;
  if (tavola()) {
    if (m < 1.5) c = vec4(vec3(0.98, 0.72, 0.3) * (0.92 + 0.16 * noise(p * 1.5)), 0.4);  // SNC giallo
    else if (m < 2.5) c = vec4(0.98, 0.82, 0.36, 0.4);
    else c = vec4(0.12, 0.36, 0.84, 0.5);                                               // nervi blu
  } else {
    if (m < 1.5) c = vec4(vec3(0.8, 0.6, 0.56) * (0.9 + 0.2 * noise(p * 1.5)), 0.45);
    else if (m < 2.5) c = vec4(0.92, 0.86, 0.72, 0.5);
    else c = vec4(0.98, 0.7, 0.26, 0.6);                                                // nervi dorati
  }
  float pd = dot(p - uQ.xyz, p - uQ.xyz);
  c.rgb = mix(c.rgb, vec3(1.8, 1.7, 1.3), clamp(uQ.w * exp(-pd / 18.0), 0.0, 1.0));   // l'impulso
  return c;
}

vec3 cutColor(vec3 p, vec2 o) {
  if (o.y < 1.5) return mix(vec3(0.56, 0.45, 0.45), vec3(0.93, 0.89, 0.82), smoothstep(0.25, 0.35, -o.x));
  return mix(vec3(0.95, 0.85, 0.5), vec3(0.8, 0.6, 0.25), smoothstep(0.4, 0.7, noise(p * 6.0)));
}
`;

  // ---------- percorsi dei nervi (lato sinistro, x > 0) ----------
  const AX = [16, 48, -0.5];              // ascella
  const PLEX = [9, 52.5, -2.2];           // tronchi del plesso brachiale
  const PALM = [31, -9, 4.6];
  const SOLE = [12, -86, 4];
  const P = {
    median: [AX, [21, 36, 1.2], [24.4, 24, 1.2], [27.4, 11, 2.8], [29.8, -2, 3.8], PALM],
    ulnar: [AX, [20.5, 36, -1.5], [23.2, 24, -2.6], [27, 11, 0], [31.2, -2, 1.6], [33.8, -9.5, 2.6]],
    radial: [AX, [21.5, 38, -3.2], [26.8, 25, -0.6], [29.5, 11, 0.6], [30.5, -4, 0.8], [29.2, -9.5, 2.2]],
    musculocut: [AX, [20.5, 40, 1.8], [24.2, 28, 2.3], [27.6, 12, 2.6]],
    axillary: [[17, 49, -1], [19.4, 49.5, -3], [20.6, 47, 0.2]],
    sciatic: [[6, -4.5, -6.8], [8, -7, -7.6], [10, -25, -5], [11, -40, -4]],
    tibial: [[11, -40, -4], [11, -46, -3.5], [11.5, -65, -3.5], [11, -82, -1.5], SOLE],
    peroneal: [[11, -40, -4], [13.5, -47, -1.5]],
    superficialPeroneal: [[13.5, -47, -1.5], [13.9, -60, 1.2], [13.4, -78, 3.5], [12.8, -83.5, 5]],
    deepPeroneal: [[13.5, -47, -1.5], [12.5, -58, 2.6], [11.9, -78, 3.6], [11.7, -84.6, 8]],
    sural: [[11.2, -52, -4.5], [12.6, -70, -4.3], [14.2, -83.4, -1.0], [15.2, -86.3, 5]],
    iliohypogastric: [[4.5, 11, -3.8], [11, 8, -2], [12.8, 3, 3], [6.5, -2, 8.2]],
    ilioinguinal: [[4.3, 10, -3.8], [10.5, 5, -1.5], [10.6, -1, 5], [6.5, -6.5, 7.8]],
    genitofemoral: [[4, 7, -3], [4.8, -2, 1], [5.8, -8, 5.2]],
    lateralCutaneous: [[5, 5, -3.5], [12, -3, 2.5], [14.2, -20, 3], [14, -35, 2]],
    pudendal: [[6, -4.5, -6.8], [4.8, -9, -4.8], [3, -11.5, -1.5], [1.4, -12.5, 2]],
    femoral: [[4.5, 7, -3.5], [7.5, -6, 5], [8.6, -12, 5.6]],
    saphenous: [[8.6, -12, 5.6], [9, -30, 3], [9.8, -46, 1], [10.6, -66, 0.5], [10.4, -82, 1.5]],
    obturator: [[3.5, 6, -4], [6.2, -7, 1], [7.8, -22, 2]],
    vagus: [[1.6, 66.5, -1.8], [2.2, 60, 0.8], [2.6, 50, -0.5], [2.2, 40, -2.2], [1.8, 30, -1.5], [1.2, 20, 0.5]],
  };
  const FINGERS = [[27.8, -13.5, 6.5], [30.2, -18.2, 5.6], [32.0, -18.8, 4.8], [33.6, -18.0, 3.8], [34.9, -16.3, 2.9]];
  const TOES = [[11.2, -86.8, 12.5], [12.6, -86.9, 12.8], [13.8, -86.8, 12.4], [14.8, -86.8, 11.6], [15.6, -86.6, 10.6]];

  const MOTOR = [[2.5, 79, 1], [0.6, 68, -2.5], [0.5, 57.5, -5.5], PLEX, AX, ...P.median.slice(1), FINGERS[1]];
  const SENSORY = [TOES[0], SOLE, ...P.tibial.slice(0, -1).reverse(), ...P.sciatic.slice().reverse(), [1.2, 0, -7.2],
    [0, 22, -6], [0, 40, -7.4], [0, 53, -7], [0, 66, -2.6], [0.6, 74, -1.5], [2.5, 79, 1]];
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
    tagline: 'Dal cervello alla punta delle dita: encefalo, midollo spinale e centinaia di rami nervosi in un corpo di 175 centimetri. Manda un impulso e scopri quanto ci mette davvero ad arrivare.',
    hint: 'Avvicinati con la rotella per vedere i nomi di tutti i nervi · prova “Comando al dito”',
    formula:
      '<div>t = L ⁄ v ≈ 1 m ⁄ 60 m/s ≈ 17 ms</div>' +
      '<div>v ≈ 6 · d  (m/s, d in µm)</div>',
    how:
      '<p>Scala reale in centimetri, con la stessa organizzazione della classica tavola anatomica: sistema nervoso centrale in giallo, nervi periferici in blu, raggruppati per plesso. I nervi hanno spessori vicini a quelli reali, da un millimetro a un centimetro e mezzo per l’ischiatico: a figura intera li rende visibili un tratto calcolato lungo ogni raggio. Lo stile “Luminoso” lo trasforma in un bagliore.</p>' +
      '<ol>' +
      '<li><strong>Centrale.</strong> L’encefalo riempie il cranio; il midollo spinale, spesso circa un centimetro, segue le curve della colonna e finisce all’altezza della prima-seconda vertebra lombare. Sotto, le radici continuano come “coda di cavallo”.</li>' +
      '<li><strong>Radici e plessi.</strong> Le radici cervicali si intrecciano nel plesso brachiale (muscolocutaneo, radiale, mediano, ulnare); quelle lombari formano il plesso lombare (femorale, otturatorio, safeno, ileoipogastrico, ileoinguinale, genitofemorale, cutaneo laterale della coscia), quelle sacrali il plesso sacrale, da cui nascono l’ischiatico, il nervo più grosso del corpo, e il pudendo.</li>' +
      '<li><strong>Rami.</strong> I nervi periferici sono generati dal kit: percorsi lisciati con le curve di Catmull–Rom e, lungo ogni tronco, piccoli alberi di rami trattenuti dentro l’arto. Sotto il ginocchio l’ischiatico si divide in tibiale e peroniero comune, che a sua volta dà il profondo e il superficiale; il surale scende dietro il polpaccio. In più, dodici nervi intercostali (l’ultimo è il subcostale) calcolati al volo.</li>' +
      '<li><strong>Volto.</strong> Il trigemino porta la sensibilità di fronte, guance e mandibola; il faciale apre a ventaglio i suoi rami verso i muscoli della mimica. Il nervo vago scende dal collo fino all’addome.</li>' +
      '<li><strong>Velocità.</strong> Le fibre grosse e mielinizzate conducono fino a circa 120 m/s, le fibre sottili del dolore lento meno di 2 m/s. L’impulso nella scena è rallentato perché lo si possa seguire; i tempi reali sono nel pannello.</li>' +
      '</ol>',
    center: [0, 0, 0],
    bound: 95,
    camera: { yaw: 0.35, pitch: 0.04, dist: 235 },
    cutStart: { coronale: -3.0, sagittale: 0.0, assiale: 40.0 },
    labels: [
      { t: 'Cervello', p: [5.6, 81.5, 3.2], n: [0.6, 0.5, 0.6] },
      { t: 'Midollo spinale', p: [0.7, 44, -6.8], n: [0.4, 0, 0.9] },
      { t: 'Plesso brachiale', p: [9.5, 52.5, -1.8], n: [0.3, 0.3, 0.9] },
      { t: 'Nervo mediano', p: [26.2, 16, 3.3], n: [0.2, 0, 1] },
      { t: 'Nervo ulnare', p: [23.4, 24, -3.0], n: [-0.3, 0, -0.9] },
      { t: 'Nervo radiale', p: [27.2, 25, -0.4], n: [0.9, 0, 0.3] },
      { t: 'Nervi intercostali', p: [13.1, 36, 4.2], n: [0.8, 0, 0.6] },
      { t: 'Nervo vago', p: [2.6, 50, -0.2], n: [0.5, 0, 0.9] },
      { t: 'Plesso lombare', p: [4.6, 9.5, -3.4], n: [0.4, 0, 0.9] },
      { t: 'Plesso sacrale', p: [5.6, -4.2, -6.9], n: [0.3, 0, -0.95] },
      { t: 'Nervo femorale', p: [8.6, -12, 6.2], n: [0.2, 0, 1] },
      { t: 'Nervo ischiatico', p: [10, -25, -5.8], n: [0.2, 0, -1] },
      { t: 'Nervo tibiale', p: [11.5, -65, -4.1], n: [0.2, 0, -1] },
      { t: 'Nervo peroniero comune', p: [13.6, -47, -1.0], n: [0.9, 0, 0.3] },
      { t: 'Cervelletto', p: [4.2, 73.6, -7.4], n: [0.4, 0, -0.9], near: 150 },
      { t: 'Tronco encefalico', p: [1.1, 70, -2.4], n: [0.6, 0, 0.8], near: 150 },
      { t: 'Trigemino', p: [4.2, 74.5, 7.5], n: [0.4, 0, 0.9], near: 150 },
      { t: 'Nervo faciale', p: [6.3, 75.2, 3.6], n: [0.9, 0, 0.4], near: 150 },
      { t: 'Muscolocutaneo', p: [24.2, 28, 2.6], n: [0.3, 0, 0.95], near: 150 },
      { t: 'Subcostale', p: [13.7, 20.3, 0.6], n: [1, 0, 0.1], near: 150 },
      { t: 'Ileoipogastrico', p: [12.8, 3, 3.2], n: [0.8, 0, 0.6], near: 150 },
      { t: 'Ileoinguinale', p: [10.6, -1, 5.3], n: [0.4, 0, 0.9], near: 150 },
      { t: 'Genitofemorale', p: [5.8, -8, 5.6], n: [0.2, 0, 1], near: 150 },
      { t: 'Cutaneo laterale della coscia', p: [14.4, -20, 3.2], n: [0.9, 0, 0.4], near: 150 },
      { t: 'Otturatorio', p: [7.8, -22, 2.3], n: [-0.4, 0, 0.9], near: 150 },
      { t: 'Safeno', p: [9.9, -46, 1.2], n: [-0.5, 0, 0.8], near: 150 },
      { t: 'Pudendo', p: [1.4, -12.5, 2.3], n: [0, -0.3, 0.95], near: 150 },
      { t: 'Peroniero profondo', p: [12.5, -58, 2.9], n: [0.3, 0, 0.95], near: 150 },
      { t: 'Peroniero superficiale', p: [14.1, -60, 1.4], n: [0.9, 0, 0.3], near: 150 },
      { t: 'Surale', p: [12.6, -70, -4.6], n: [0.3, 0, -0.95], near: 150 },
    ],
    stats: [
      ['Fibra scelta', (st) => fiber(st.v)],
      ['Cervello → dito', (st) => `${((LM / 100 / st.v) * 1000).toFixed(st.v < 5 ? 0 : 1).replace('.', ',')} ms reali`],
      ['Alluce → cervello', (st) => `${((LS / 100 / st.v) * 1000).toFixed(st.v < 5 ? 0 : 1).replace('.', ',')} ms reali`],
      ['Nervi', '31 paia spinali, 12 cranici'],
    ],
    glsl: GLSL,

    // I nervi periferici del lato sinistro, dal kit: tronchi lisci, radici, rami laterali, dita, volto.
    buildSegments(kit) {
      const rand = kit.rng(29);
      const segs = [];
      const add = (list) => { for (const s of list) segs.push(s); };
      const upperArm = kit.limbPull([18, 52, 0], [25, 24, -1], 3.4);
      const forearm = kit.limbPull([25, 24, -1], [30, -2, 2], 2.2);
      const thigh = kit.limbPull([9, -4, 0], [11, -45, 1], 5.8);
      const shin = kit.limbPull([11, -45, 1], [12, -83, 0], 3.0);
      const armPull = (p) => (p[1] > 24 ? upperArm(p) : forearm(p));
      const legPull = (p) => (p[1] > -45 ? thigh(p) : shin(p));
      const withBranches = (pts, r0, r1, opts) => {
        const trunk = kit.path(pts, r0, r1, 2);
        for (const s of trunk) {
          segs.push(s);
          if (opts) add(kit.branches([s], { ...opts, rand }));
        }
      };

      // Radici del plesso brachiale (C5–T1) e rami del plesso cervicale (C1–C4).
      for (let i = 0; i < 5; i++) add(kit.path([[0.55, 57.5 - i * 1.5, -5.6], [4.5, 55.5 - i * 0.9, -3.8], PLEX], 0.2, 0.28, 2));
      for (let i = 0; i < 4; i++) add(kit.path([[0.55, 64 - i * 1.5, -3.6], [3.2, 63 - i * 1.4, -2.2], [5.2, 62 - i * 1.8, 0.5]], 0.12, 0.08, 2));
      add(kit.path([PLEX, [12.5, 50.8, -1.2], AX], 0.34, 0.32, 2));

      // Braccio: tronchi con rami laterali, nervo muscolocutaneo e ascellare.
      const armOpts = { every: 6, length: 3.6, radius: 0.08, generations: 2, bias: [0.1, -1, 0], inside: armPull };
      withBranches(P.median, 0.3, 0.2, armOpts);
      withBranches(P.ulnar, 0.28, 0.18, armOpts);
      withBranches(P.radial, 0.28, 0.16, armOpts);
      add(kit.path(P.musculocut, 0.18, 0.1, 2));
      add(kit.path(P.axillary, 0.16, 0.1, 2));
      // Mano: nervi digitali verso le cinque dita.
      for (const tip of FINGERS) {
        const base = tip[0] > 33 ? [33.8, -9.5, 2.6] : PALM;
        add(kit.path([base, [(base[0] + tip[0]) / 2, (base[1] + tip[1]) / 2 - 0.5, (base[2] + tip[2]) / 2 + 0.3], tip], 0.1, 0.05, 2));
      }

      // Radici lombari (L1–L4) e sacrali (S1–S4), plesso lombosacrale.
      for (let i = 0; i < 4; i++) add(kit.path([[0.5, 18 - i * 4, -6.9], [2.8, 15 - i * 4, -5.8], [4.5, 11 - i * 3, -3.8]], 0.16, 0.2, 2));
      for (let i = 0; i < 4; i++) add(kit.path([[0.7, 2 - i * 2.5, -7.3], [3.5, 0 - i * 1.8, -7.2], [6, -4.5, -6.8]], 0.2, 0.28, 2));

      // Gamba: sciatico, tibiale, peroneo, femorale a ventaglio, safeno, otturatorio.
      const legOpts = { every: 7, length: 4.5, radius: 0.1, generations: 2, bias: [0, -1, 0], inside: legPull };
      withBranches(P.sciatic, 0.75, 0.6, legOpts);
      withBranches(P.tibial, 0.45, 0.18, legOpts);
      add(kit.path(P.peroneal, 0.36, 0.34, 2));
      withBranches(P.superficialPeroneal, 0.24, 0.12, { ...legOpts, every: 9 });
      add(kit.path(P.deepPeroneal, 0.22, 0.1, 2));
      add(kit.path(P.sural, 0.16, 0.08, 2));
      // Nervi toraco-addominali e rami del plesso lombare verso addome, inguine e coscia.
      add(kit.path(P.iliohypogastric, 0.14, 0.07, 2));
      add(kit.path(P.ilioinguinal, 0.13, 0.07, 2));
      add(kit.path(P.genitofemoral, 0.13, 0.1, 2));
      add(kit.path([[5.8, -8, 5.2], [4.6, -10, 6.2], [3.6, -11.2, 6.6]], 0.08, 0.05, 2));
      add(kit.path([[5.8, -8, 5.2], [6.8, -9.6, 6.8], [7.6, -11.5, 7.0]], 0.08, 0.05, 2));
      add(kit.path(P.lateralCutaneous, 0.14, 0.07, 2));
      add(kit.path(P.pudendal, 0.16, 0.08, 2));
      add(kit.path(P.femoral, 0.35, 0.3, 2));
      for (let i = 0; i < 6; i++) {                     // il femorale si apre a ventaglio sotto l'inguine
        const a = -0.7 + i * 0.28;
        add(kit.path([[8.6, -12, 5.6], [8.6 + 2.2 * Math.sin(a), -20 - i, 5.2 + 1.2 * Math.cos(a)], [9.2 + 3 * Math.sin(a), -34 - i * 1.5, 3.6 + 1.5 * Math.cos(a)]], 0.14, 0.07, 2));
      }
      add(kit.path(P.saphenous, 0.12, 0.07, 2));
      add(kit.path(P.obturator, 0.18, 0.1, 2));
      // Piede: nervi plantari verso le dita, e dorsali dal peroneo.
      for (const tip of TOES) add(kit.path([SOLE, [(SOLE[0] + tip[0]) / 2, -87.2, (SOLE[2] + tip[2]) / 2], tip], 0.12, 0.05, 2));
      for (const tip of TOES) add(kit.path([[12.8, -83.5, 5], [(12.8 + tip[0]) / 2, -84.6, 8.5], [tip[0], -85.6, tip[2] - 0.5]], 0.08, 0.04, 2));

      // Nervo vago con rami cardiaco e gastrico.
      add(kit.path(P.vagus, 0.18, 0.12, 2));
      add(kit.path([[2.5, 46, -0.9], [1.6, 42, 1.5], [0.6, 40, 3.2]], 0.08, 0.05, 2));
      add(kit.path([[1.5, 24, -0.2], [3.2, 21, 2.2], [5.2, 19.5, 4.2]], 0.08, 0.05, 2));

      // Volto: trigemino (fronte, guancia, mandibola) e faciale a ventaglio; nervi ottici.
      const g = [2.2, 75.2, 0.8];
      add(kit.path([g, [2.8, 78.5, 5.8], [3.2, 82, 7.0]], 0.14, 0.06, 2));
      add(kit.path([g, [3.6, 75.8, 5.8], [4.6, 74.4, 7.8]], 0.14, 0.06, 2));
      add(kit.path([g, [3.4, 72.8, 3.2], [4.4, 69, 5.0]], 0.14, 0.06, 2));
      const f = [5.2, 72.5, -1.2];
      for (const tip of [[6.2, 78.6, 3.2], [6.4, 75.2, 3.8], [5.8, 72.2, 5.6], [4.8, 68.8, 4.0], [5.0, 65.5, 2.0]]) {
        add(kit.path([f, [(f[0] + tip[0]) / 2 + 0.6, (f[1] + tip[1]) / 2, (f[2] + tip[2]) / 2], tip], 0.1, 0.05, 2));
      }
      add(kit.path([[0.6, 75, 3.5], [2.2, 75.4, 5.5], [3.1, 75.5, 7.2]], 0.2, 0.18, 2));
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
      ui.segmented({
        id: 'style', label: 'Stile', value: 0,
        options: [{ value: 0, label: 'Tavola' }, { value: 1, label: 'Luminoso' }],
        onChange: (v) => (st.p[1] = v),
      });
      ui.toggle({ id: 'ghost', label: 'Sagoma del corpo', value: true, onChange: (v) => (st.p[0] = v ? 1 : 0) });
      return {
        tick(dt) {
          if (!path) { st.q[3] = Math.max(0, st.q[3] - dt * 2); return; }
          const L = path === MOTOR ? LM : LS;
          s += dt * VISUAL * Math.max(0.3, Math.sqrt(st.v / 60));
          const pos = pointAt(path, Math.min(s, L));
          st.q[0] = Math.abs(pos[0]); st.q[1] = pos[1]; st.q[2] = pos[2];
          st.q[3] = 1;
          if (s > L + 20) path = null;
        },
      };
    },
  };
})();
