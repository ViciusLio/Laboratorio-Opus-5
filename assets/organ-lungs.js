/* Polmoni — due polmoni con lobi e scissure, trachea, diaframma e albero bronchiale generato
   dal kit anatomico (legge di Murray). Scala reale in centimetri.
   +x = sinistra del paziente, +y = alto, +z = davanti. */
(function () {
  'use strict';

  const GLSL = `
const vec3 CENTER = vec3(0.0, 1.0, -0.5);
const float BOUND = 18.0;
const float STEP = 0.8;

// Il respiro espande i polmoni soprattutto verso il basso (il diaframma scende) e un po' in avanti e di lato.
vec3 breathe(vec3 p) {
  float e = uQ.x * (1.0 + 0.8 * uP.w);                  // l'enfisema li tiene iperespansi
  float side = p.x < 0.0 ? -1.0 : 1.0;
  vec3 apex = vec3(side * 6.2, 12.5, -0.5);
  vec3 q = p - apex;
  q.y /= 1.0 + 0.9 * e;
  q.xz /= 1.0 + 0.3 * e;
  return q + apex;
}

float lung(vec3 q, float side, out float lobe) {
  // Un cono arrotondato: stretto all'apice, largo alla base (l'ellissoide è centrato in basso e affinato in alto).
  vec3 lq = q - vec3(side * 7.2, -4.0, -1.0);
  float k = mix(1.0, 1.55, smoothstep(-2.0, 13.0, q.y));
  lq.xz *= k;
  float d = sdEllipsoid(lq, vec3(side < 0.0 ? 6.6 : 6.0, 15.5, 8.2)) / k;
  d = smax(d, -(length(q - vec3(side * 6.5, -21.0 + 2.0 * uP.w, -0.5)) - 13.0 - 1.5 * uP.w), 1.5);   // base sul diaframma
  d = smax(d, side < 0.0 ? q.x + 1.8 : 1.8 - q.x, 1.0);                                             // faccia mediale
  d = side > 0.0 ? smax(d, -sdEllipsoid(q - vec3(1.8, -5.0, 3.0), vec3(5.2, 4.6, 4.4)), 1.0)          // incisura cardiaca
                 : smax(d, -sdEllipsoid(q - vec3(-1.0, -5.0, 2.5), vec3(3.0, 4.0, 3.5)), 1.0);
  // Scissure: l'obliqua in entrambi, l'orizzontale solo nel destro.
  float obl = dot(q - vec3(0.0, -2.0, -1.0), vec3(0.0, 0.7071, 0.7071));
  d = max(d, -(abs(obl) - 0.09));
  if (side < 0.0) d = max(d, -max(abs(q.y - 1.0) - 0.09, -obl));
  lobe = side < 0.0 ? (obl < 0.0 ? 3.0 : (q.y > 1.0 ? 1.0 : 2.0)) : (obl < 0.0 ? 5.0 : 4.0);
  // Enfisema: bolle (bolle d'aria) sulla superficie.
  d -= 0.6 * uP.w * smoothstep(0.62, 0.95, noise(q * 0.9));
  return d;
}

vec2 organ(vec3 p) {
  vec3 q = breathe(p);
  vec2 r = vec2(1e5, 0.0);
  if (uP.x < 0.5) {
    float lr, ll;
    float dr = lung(q, -1.0, lr), dl = lung(q, 1.0, ll);
    r = dr < dl ? vec2(dr, lr) : vec2(dl, ll);
    // Diaframma: due cupole sottili sotto le basi.
    float e = uQ.x * (1.0 + 0.8 * uP.w);
    vec3 c = vec3(sign(p.x) * 6.5, -21.4 - 2.6 * e + 2.0 * uP.w, -0.5);
    float dia = abs(length(p - c) - 13.4 - 1.5 * uP.w) - 0.25;
    dia = max(dia, (c.y + 9.4 + 1.2 * uP.w) - p.y);                   // solo la cupola
    dia = max(dia, abs(p.x) - 13.0);
    r = U(r, vec2(dia, 7.0));
  }
  // Trachea e bronchi dal kit; nella vista normale solo trachea e bronchi principali (i primi tre segmenti).
  vec2 s = segments(q);
  if (uP.x > 0.5 || s.y < 2.5) {
    float ds = s.x;
    if (s.y < 0.5) {                                   // anelli di cartilagine a C, aperti dietro
      float ring = smoothstep(0.25, 0.0, abs(fract(q.y / 0.75) - 0.5) - 0.1);
      ds -= 0.07 * ring * smoothstep(-0.2, 0.4, q.z - 0.6);
    }
    r = SU(r, vec2(ds, 6.0), 0.25);
  }
  return r;
}

vec4 material(float m, vec3 p, vec3 n) {
  if (m > 6.5) return vec4(0.36, 0.11, 0.1, 0.45);                         // diaframma (muscolo)
  if (m > 5.5) return vec4(0.86, 0.78, 0.72, 0.55);                        // trachea e bronchi
  vec3 q = breathe(p);
  vec3 c = vec3(0.8, 0.47, 0.47) * (0.9 + 0.2 * noise(q * 2.0));           // polmone sano: rosa
  if (uP.y > 0.5) {
    c = m < 1.5 ? vec3(0.35, 0.55, 0.9) : m < 2.5 ? vec3(0.95, 0.78, 0.3) : m < 3.5 ? vec3(0.35, 0.72, 0.42)
      : m < 4.5 ? vec3(0.62, 0.45, 0.85) : vec3(0.95, 0.55, 0.3);
  }
  // Fumo: depositi di carbone (antracosi) a chiazze scure.
  float soot = smoothstep(0.66 - 0.22 * uP.z, 0.72, noise(q * 3.2)) * uP.z;
  c = mix(c, vec3(0.12, 0.11, 0.12), soot * 0.9);
  c = mix(c, vec3(0.86, 0.8, 0.76), 0.35 * uP.w * smoothstep(0.62, 0.9, noise(q * 0.9)));   // bolle più chiare
  return vec4(c, 0.55);
}

vec3 cutColor(vec3 p, vec2 o) {
  vec3 q = breathe(p);
  if (o.y > 6.5) return vec3(0.55, 0.16, 0.14);
  // Bronchi in sezione: parete cartilaginea chiara, lume scuro.
  vec2 s = segments(q);
  if (s.x < 0.0) return s.x > -0.12 ? vec3(0.92, 0.88, 0.82) : vec3(0.12, 0.06, 0.07);
  if (o.y > 5.5) return vec3(0.9, 0.85, 0.8);
  // Tessuto spugnoso: gli alveoli sono pori minuscoli; con l'enfisema diventano grandi cavità.
  float f = mix(9.0, 3.5, uP.w);
  float pore = smoothstep(0.58 - 0.12 * uP.w, 0.7, noise(q * f));
  vec3 c = mix(vec3(0.82, 0.45, 0.46), vec3(0.35, 0.12, 0.14), pore);
  return mix(c, vec3(0.14, 0.12, 0.13), smoothstep(0.66 - 0.22 * uP.z, 0.72, noise(q * 3.2)) * uP.z * 0.8);
}
`;

  const Lu = (window.BodyOrgans = window.BodyOrgans || { list: {} });
  Lu.list.polmoni = {
    name: 'Polmoni',
    kicker: 'Anatomia procedurale · i polmoni',
    title: 'Polmoni',
    tagline: 'Circa 480 milioni di alveoli e una superficie di scambio grande come mezzo campo da tennis. Respirano davvero: scegli frequenza e profondità, poi guarda cosa fanno fumo ed enfisema.',
    hint: 'Trascina per girare · prova “Solo albero bronchiale” · il taglio coronale mostra i bronchi in sezione',
    formula:
      '<div>V̇ = FR × V<sub>C</sub> ≈ 12 × 0,5 L = 6 L/min</div>' +
      '<div>r<sub>figlio</sub> = r<sub>padre</sub> · 2<sup>−1/3</sup> (legge di Murray)</div>',
    how:
      '<p>Scala reale in centimetri. L’albero bronchiale non è disegnato: è generato dal kit anatomico a partire da pochi parametri.</p>' +
      '<ol>' +
      '<li><strong>Lobi.</strong> Il polmone destro ha tre lobi, divisi dalla scissura obliqua e da quella orizzontale; il sinistro ne ha due e lascia posto al cuore con l’incisura cardiaca.</li>' +
      '<li><strong>Trachea.</strong> Circa 2 cm di diametro, tenuta aperta da anelli di cartilagine a forma di C, aperti dietro dove poggia l’esofago. Il bronco principale destro è più largo e più verticale del sinistro: per questo ciò che si inala per sbaglio finisce più spesso a destra.</li>' +
      '<li><strong>Albero bronchiale.</strong> Ogni ramo si divide in due. Il raggio dei figli segue la legge di Murray, che minimizza il lavoro per far scorrere l’aria: 2<sup>−1/3</sup> ≈ 0,79 volte quello del padre. Qui ci sono 5 generazioni; nel polmone vero sono circa 23.</li>' +
      '<li><strong>Respiro.</strong> Il diaframma scende e i polmoni si allungano verso il basso: a riposo circa mezzo litro per atto, fino a tre litri in un respiro profondo.</li>' +
      '<li><strong>Fumo ed enfisema.</strong> Il fumo deposita carbone nel tessuto; l’enfisema distrugge le pareti degli alveoli, che si fondono in cavità: il polmone resta gonfio e il diaframma si appiattisce.</li>' +
      '</ol>',
    center: [0, 1.0, -0.5],
    bound: 18,
    camera: { yaw: 0.0, pitch: 0.1, dist: 52 },
    cutStart: { coronale: -0.5, sagittale: 7.4, assiale: 1.0 },
    labels: [
      { t: 'Trachea', p: [0, 11.5, 1.6], n: [0, 0, 1] },
      { t: 'Lobo superiore destro', p: [-11.6, 5.5, 2.8], n: [-0.7, 0.3, 0.6], when: (st) => st.p[0] < 0.5 },
      { t: 'Lobo medio', p: [-9.8, -3.2, 5.4], n: [-0.3, 0, 0.95], when: (st) => st.p[0] < 0.5 },
      { t: 'Lobo inferiore destro', p: [-12.2, -6.0, -3.0], n: [-0.85, -0.1, -0.5], when: (st) => st.p[0] < 0.5 },
      { t: 'Lobo superiore sinistro', p: [10.8, 5.5, 2.8], n: [0.7, 0.3, 0.6], when: (st) => st.p[0] < 0.5 },
      { t: 'Lobo inferiore sinistro', p: [11.4, -6.0, -3.0], n: [0.85, -0.1, -0.5], when: (st) => st.p[0] < 0.5 },
      { t: 'Incisura cardiaca', p: [3.9, -4.2, 5.2], n: [0, 0, 1], when: (st) => st.p[0] < 0.5 },
      { t: 'Diaframma', p: [0.0, -8.6, 5.0], n: [0, 0.6, 0.8], when: (st) => st.p[0] < 0.5 },
      { t: 'Bronco principale destro', p: [-2.2, 1.6, 1.1], n: [0, 0, 1], when: (st) => st.p[0] > 0.5 },
      { t: 'Bronco principale sinistro', p: [2.8, 2.5, 0.8], n: [0, 0, 1], when: (st) => st.p[0] > 0.5 },
    ],
    stats: [
      ['Frequenza', (st) => `${st.rr} atti/min`],
      ['Ventilazione', (st) => `${((st.rr * st.vt)).toFixed(1)} L/min`],
      ['Alveoli', '≈ 480 milioni'],
      ['Superficie di scambio', '≈ 70 m²'],
    ],
    glsl: GLSL,

    // Albero bronchiale dal kit: trachea, bronchi principali e cinque generazioni per lato.
    buildSegments(kit) {
      const rng = kit.rng(11);
      const carina = [0, 4.2, 0.6], rEnd = [-2.6, 1.3, 0.3], lEnd = [3.9, 2.2, 0.0];
      const segs = [
        { a: [0, 15.0, 1.2], b: carina, ra: 1.0, rb: 0.95 },          // trachea
        { a: carina, b: rEnd, ra: 0.8, rb: 0.72 },                    // bronco principale destro: più largo e verticale
        { a: carina, b: lEnd, ra: 0.65, rb: 0.6 },                    // sinistro: più stretto e orizzontale
      ];
      // La prima divisione si apre molto: un ramo sale verso il lobo superiore, l'altro scende.
      segs.push(...kit.tree({ start: rEnd, dir: [-0.75, -0.55, -0.1], length: 4.8, radius: 0.62, generations: 5, angle: 0.7, angle0: 1.3,
        shrink: 0.76, pullK: 0.5, rand: rng, inside: kit.ellipsoidPull([-7.4, -0.5, -1], [5.6, 11, 7]) }));
      segs.push(...kit.tree({ start: lEnd, dir: [0.8, -0.5, -0.1], length: 4.6, radius: 0.56, generations: 5, angle: 0.7, angle0: 1.3,
        shrink: 0.76, pullK: 0.5, rand: rng, inside: kit.ellipsoidPull([7.4, -0.5, -1], [5.0, 11, 7]) }));
      return segs;
    },

    setup(ui, st) {
      st.rr = 12;
      st.vt = 0.5;
      ui.slider({ id: 'rr', label: 'Frequenza respiratoria', min: 6, max: 30, step: 1, value: st.rr, format: (v) => `${v} atti/min`, onInput: (v) => (st.rr = v) });
      ui.slider({ id: 'vt', label: 'Volume di ogni respiro', min: 0.3, max: 3, step: 0.1, value: st.vt, format: (v) => `${v.toFixed(1)} L`, onInput: (v) => (st.vt = v) });
      ui.segmented({
        id: 'view', label: 'Cosa mostrare', value: 0,
        options: [{ value: 0, label: 'Polmoni' }, { value: 1, label: 'Solo albero bronchiale' }],
        onChange: (v) => (st.p[0] = v),
      });
      ui.toggle({ id: 'llobes', label: 'Colora i lobi', value: false, onChange: (v) => (st.p[1] = v ? 1 : 0) });
      ui.slider({ id: 'smoke', label: 'Fumo (antracosi)', min: 0, max: 1, step: 0.01, value: 0, format: (v) => (v < 0.02 ? 'nessuno' : Math.round(v * 100) + '%'), onInput: (v) => (st.p[2] = v) });
      ui.slider({ id: 'emph', label: 'Enfisema', min: 0, max: 1, step: 0.01, value: 0, format: (v) => (v < 0.02 ? 'assente' : Math.round(v * 100) + '%'), onInput: (v) => (st.p[3] = v) });
      return {
        tick(dt) {
          st.beat += dt * (st.rr / 60);
          const depth = 0.06 + 0.05 * (st.vt - 0.5) / 0.5;
          st.q[0] = depth * (0.5 - 0.5 * Math.cos(st.beat * Math.PI * 2));
        },
      };
    },
  };
})();
