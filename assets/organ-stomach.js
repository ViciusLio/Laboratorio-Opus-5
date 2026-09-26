/* Stomaco — sacco a J dal cardias al piloro, con fondo, duodeno e parte finale dell'esofago.
   Parametrico: riempimento (le rughe della mucosa si distendono) e onde peristaltiche nell'antro.
   Scala reale in centimetri. +x = sinistra del paziente, +y = alto, +z = davanti. */
(function () {
  'use strict';

  const GLSL = `
const vec3 CENTER = vec3(1.5, -1.5, 0.5);
const float BOUND = 14.5;
const float STEP = 0.75;

// Linea centrale: cardias, corpo, antro, piloro con il bulbo duodenale.
const vec3 SA[4] = vec3[4](vec3(2.0, 6.0, 0.5), vec3(5.6, 1.0, 0.6), vec3(3.2, -6.2, 1.8), vec3(-2.4, -5.0, 2.2));
const vec3 SB[4] = vec3[4](vec3(5.2, 5.0, 0.4), vec3(6.0, -3.5, 1.0), vec3(0.0, -8.0, 2.4), vec3(-3.6, -3.6, 1.8));
const vec3 SC[4] = vec3[4](vec3(5.6, 1.0, 0.6), vec3(3.2, -6.2, 1.8), vec3(-2.4, -5.0, 2.2), vec3(-5.4, -3.8, 0.6));
const float SL[4] = float[4](6.5, 8.5, 8.0, 3.5);

float fillScale() { return mix(0.62, 1.18, uP.y); }

// Raggio lungo lo stomaco (s in cm dal cardias), con l'onda peristaltica dell'antro.
float stomachR(float s) {
  float r = mix(2.4, 4.4, smoothstep(0.0, 6.0, s));
  r = mix(r, 3.8, smoothstep(8.0, 15.0, s));
  r = mix(r, 1.9, smoothstep(15.0, 22.5, s));
  r *= mix(fillScale(), 1.0, smoothstep(20.0, 23.0, s));
  r = mix(r, 1.05, smoothstep(22.3, 23.6, s));          // piloro
  r = mix(r, 1.6, smoothstep(23.8, 25.0, s));           // bulbo duodenale
  if (uP.z > 0.5) {
    float sw = mix(9.0, 23.5, fract(uBeat));             // tre onde al minuto verso il piloro
    r *= 1.0 - 0.32 * smoothstep(9.0, 16.0, sw) * exp(-pow((s - sw) / 1.4, 2.0));
  }
  return r;
}

vec2 organ(vec3 p) {
  float best = 1e5, s = 0.0, cum = 0.0;
  vec3 bq = vec3(0.0), bt = vec3(0.0, 1.0, 0.0);
  for (int i = uZero; i < 4; i++) {
    vec3 Q, T;
    vec2 b = bezierFrame(p, SA[i], SB[i], SC[i], Q, T);
    if (b.x < best) { best = b.x; s = cum + b.y * SL[i]; bq = Q; bt = T; }
    cum += SL[i];
  }
  float r = stomachR(s);
  float outer = (best - r) * 0.85;
  // Il fondo: la cupola sopra il cardias, sotto il diaframma.
  float fs = fillScale();
  outer = smin(outer, length(p - vec3(4.6, 6.6 + 0.8 * fs, -0.4)) - 3.6 * fs, 2.5);
  // Esofago in arrivo e duodeno che scende.
  float oes = sdCapsule(p, vec3(1.0, 12.5, -1.0), vec3(2.0, 6.0, 0.5), 1.0);
  float duo = min(sdCapsule(p, vec3(-5.4, -3.8, 0.6), vec3(-6.0, -10.5, -0.5), 1.4),
                  sdCapsule(p, vec3(-6.0, -10.5, -0.5), vec3(-1.0, -12.0, -0.5), 1.3));
  outer = smin(outer, min(oes, duo), 0.8);

  // Parete cava di circa 5 mm; dentro, le rughe: pieghe longitudinali che spariscono a stomaco pieno.
  float ang = tubeAngle(p - bq, bt);
  float rugae = 0.45 * (1.0 - uP.y) * (0.5 + 0.5 * sin(12.0 * ang + 1.5 * sin(s * 0.8))) * smoothstep(23.0, 20.0, s);
  float inner = -(outer + 0.45 + rugae);
  gA = vec4(outer, 0.45 + rugae, s, 0.0);
  float m = inner > outer ? 8.0 : (oes < best - r + 0.2 && p.y > 6.5 ? 2.0 : (duo < outer + 0.05 ? 3.0 : 1.0));
  return vec2(max(outer, inner), m);
}

vec4 material(float m, vec3 p, vec3 n) {
  if (m > 7.5) return vec4(vec3(0.82, 0.38, 0.32) * (0.8 + 0.3 * noise(p * 6.0)), 0.5);   // mucosa gastrica
  if (m > 2.5) return vec4(0.52, 0.32, 0.26, 0.6);                                       // duodeno
  if (m > 1.5) return vec4(0.6, 0.3, 0.27, 0.6);                                         // esofago
  return vec4(vec3(0.58, 0.32, 0.27) * (0.9 + 0.2 * noise(p * 2.0)), 0.65);              // sierosa
}

vec3 cutColor(vec3 p, vec2 o) {
  // Dalla superficie esterna verso l'interno: sierosa, tre strati muscolari (longitudinale,
  // circolare, obliquo: lo stomaco è l'unico tratto del tubo digerente che ne ha tre), mucosa.
  float d = -gA.x, w = gA.y;
  if (d < 0.04) return vec3(0.9, 0.82, 0.76);
  if (d < 0.14) return vec3(0.68, 0.22, 0.2);
  if (d < 0.27) return vec3(0.6, 0.17, 0.16);
  if (d < 0.36) return vec3(0.7, 0.26, 0.23);
  return vec3(0.9, 0.46, 0.38) * (0.85 + 0.25 * noise(p * 12.0));
}
`;

  const St = (window.BodyOrgans = window.BodyOrgans || { list: {} });
  St.list.stomaco = {
    name: 'Stomaco',
    kicker: 'Anatomia procedurale · lo stomaco',
    title: 'Stomaco',
    tagline: 'Un sacco muscolare che si adatta al pasto: vuoto è raccolto e pieno di pieghe, pieno arriva a un litro e mezzo e le pieghe spariscono. Tre volte al minuto un’onda spinge il contenuto verso il piloro.',
    hint: 'Muovi “Riempimento” · il taglio coronale mostra le rughe e i tre strati muscolari',
    formula:
      '<div>pH ≈ 2 ⇒ [H<sup>+</sup>] ≈ 10 mmol/L</div>' +
      '<div>r<sub>int</sub>(θ) = r<sub>0</sub> − a (1 − f) · sin(12θ)</div>',
    how:
      '<p>Scala reale in centimetri. È il primo organo costruito interamente con i mattoni del kit: tubi lungo curve con un raggio che varia.</p>' +
      '<ol>' +
      '<li><strong>Forma.</strong> Quattro curve di Bézier dal cardias al piloro, con il raggio che cresce nel corpo e si stringe nell’antro; il fondo è una cupola che sporge sopra il cardias, sotto il diaframma.</li>' +
      '<li><strong>Riempimento.</strong> Il parametro f va da stomaco vuoto (circa 50 mL) a pieno (circa 1,5 L): il sacco si gonfia e le rughe, le pieghe della mucosa, si distendono fino a sparire (la seconda formula).</li>' +
      '<li><strong>Peristalsi.</strong> Onde di contrazione partono dal corpo e corrono verso il piloro circa tre volte al minuto, rimescolando il contenuto con il succo gastrico.</li>' +
      '<li><strong>Parete.</strong> In sezione si vedono la sierosa, tre strati muscolari (longitudinale, circolare e obliquo) e la mucosa. L’acido cloridrico porta il pH intorno a 1,5–3,5: 10 000 volte più acido dell’acqua (la prima formula).</li>' +
      '</ol>',
    center: [1.5, -1.5, 0.5],
    bound: 14.5,
    camera: { yaw: 0.15, pitch: 0.05, dist: 40 },
    cutStart: { coronale: 0.4, sagittale: 3.5, assiale: 0.0 },
    labels: [
      { t: 'Esofago', p: [0.4, 10.5, -0.2], n: [-0.3, 0, 0.95] },
      { t: 'Cardias', p: [1.0, 6.2, 1.5], n: [-0.5, 0.2, 0.85] },
      { t: 'Fondo', p: [5.0, 10.8, 0.4], n: [0.2, 0.9, 0.35] },
      { t: 'Corpo', p: [9.4, -2.3, 1.2], n: [0.95, 0, 0.3] },
      { t: 'Antro', p: [0.3, -9.4, 2.6], n: [0, -0.8, 0.6] },
      { t: 'Piloro', p: [-2.5, -5.0, 3.2], n: [0, 0.1, 1] },
      { t: 'Duodeno', p: [-7.2, -8.0, 0.0], n: [-1, 0, 0.3] },
      { t: 'Piccola curvatura', p: [1.9, -1.5, 2.2], n: [-0.8, 0.2, 0.6] },
      { t: 'Grande curvatura', p: [8.2, -6.5, 2.0], n: [0.7, -0.6, 0.4] },
    ],
    stats: [
      ['Contenuto', (st) => `≈ ${(0.05 + 1.45 * Math.pow(st.p[1], 1.5)).toFixed(2).replace('.', ',')} L`],
      ['Acidità', 'pH 1,5–3,5'],
      ['Succo gastrico', '≈ 2 L/giorno'],
      ['Onde peristaltiche', '3 al minuto'],
    ],
    glsl: GLSL,

    setup(ui, st) {
      st.p[1] = 0.35;
      st.p[2] = 1;
      ui.slider({ id: 'fill', label: 'Riempimento', min: 0, max: 1, step: 0.01, value: st.p[1], format: (v) => (v < 0.05 ? 'vuoto' : v > 0.95 ? 'pieno' : Math.round(v * 100) + '%'), onInput: (v) => (st.p[1] = v) });
      ui.toggle({ id: 'waves', label: 'Onde peristaltiche', value: true, onChange: (v) => (st.p[2] = v ? 1 : 0) });
      return { tick(dt) { st.beat += dt * (3 / 60); } };
    },
  };
})();
