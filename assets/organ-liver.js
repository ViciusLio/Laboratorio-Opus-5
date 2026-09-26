/* Fegato — organo in funzioni di distanza, scala reale in centimetri.
   +x = sinistra del paziente, +y = alto, +z = davanti. Il lobo destro sta a -x. */
(function () {
  'use strict';

  const GLSL = `
const vec3 CENTER = vec3(-1.5, -0.5, 0.0);
const float BOUND = 13.0;
const float STEP = 0.75;

// Albero vascolare interno: compare solo quando il piano di taglio lo attraversa.
float hepaticVeins(vec3 p) {
  float d = sdCapsule(p, vec3(-1.0, 5.0, -4.0), vec3(-6.8, 0.8, 1.2), 0.5);
  d = min(d, sdCapsule(p, vec3(-0.8, 5.0, -3.8), vec3(-2.0, -1.8, 3.2), 0.45));
  d = min(d, sdCapsule(p, vec3(-0.5, 5.2, -3.6), vec3(4.8, 3.0, 0.6), 0.4));
  d = min(d, sdCapsule(p, vec3(-3.9, 2.9, -1.4), vec3(-6.5, 4.6, 1.5), 0.3));
  return d;
}
float portalBranches(vec3 p) {
  float d = sdCapsule(p, vec3(-0.8, -3.2, -1.0), vec3(-6.2, -1.0, -0.4), 0.55);
  d = min(d, sdCapsule(p, vec3(-3.5, -2.1, -0.7), vec3(-5.0, 1.2, 2.5), 0.35));
  d = min(d, sdCapsule(p, vec3(-4.5, -1.6, -0.5), vec3(-8.0, -2.8, -2.6), 0.35));
  d = min(d, sdCapsule(p, vec3(-0.8, -3.2, -1.0), vec3(1.4, -1.4, 1.4), 0.45));
  d = min(d, sdCapsule(p, vec3(1.4, -1.4, 1.4), vec3(6.0, 1.6, 1.0), 0.38));
  return d;
}

float liverBody(vec3 p) {
  // Steatosi: il fegato si ingrossa. Cirrosi: si rimpicciolisce e diventa nodulare.
  float steat = clamp(uP.y, 0.0, 1.0), cirr = clamp(uP.y - 1.0, 0.0, 1.0);
  float sc = 1.0 + 0.12 * steat - 0.2 * cirr;
  p = (p - vec3(-1.5, 0.0, 0.0)) / sc + vec3(-1.5, 0.0, 0.0);
  // Un grande ellissoide trasversale più il lobo destro arrotondato...
  float whole = sdEllipsoid(p - vec3(-1.5, 0.8, -0.3), vec3(11.0, 7.2, 6.8));
  float right = sdEllipsoid(p - vec3(-5.0, -0.2, 0.0), vec3(6.8, 7.0, 6.4));
  float d = smin(whole, right, 2.5);
  // ...poi scolpiti a cuneo: cupola che scende verso sinistra, lobo sinistro più sottile,
  // faccia inferiore obliqua (dal basso a destra verso l'alto a sinistra), dorso appiattito.
  d = smax(d, p.y - (8.0 - 0.32 * max(p.x + 2.0, 0.0)), 2.0);
  d = smax(d, abs(p.z - 0.8) - (6.5 - 0.42 * max(p.x, 0.0)), 1.5);
  d = smax(d, (-6.5 + 0.38 * (p.x + 10.0)) - p.y, 1.0);
  d = smax(d, -5.8 - p.z, 1.5);
  d = smax(d, -(length(p - vec3(5.5, -2.8, -1.8)) - 4.2), 1.5);       // impronta dello stomaco
  d = smax(d, -(length(p - vec3(-7.0, -7.6, -3.6)) - 3.6), 1.2);      // impronta del rene destro
  // Legamento falciforme: solco sulla faccia anteriore e superiore.
  float fx = p.x - 1.1 - 0.08 * p.y;
  d += 0.16 * exp(-fx * fx / 0.05) * smoothstep(0.0, 2.0, p.z + p.y * 0.3);
  d -= 0.32 * cirr * smoothstep(0.35, 0.7, noise(p * 1.5));      // noduli di rigenerazione
  return (d + 0.05 * (noise(p * 1.5) - 0.5)) * sc;
}

vec2 organ(vec3 p) {
  float body = liverBody(p);
  float gb = sdRoundCone(p, vec3(-2.7, -4.5, 4.6), vec3(-1.8, -2.3, 2.0), 1.2, 0.6);    // cistifellea
  float ivc = sdCapsule(p, vec3(-1.2, -9.0, -4.8), vec3(-1.0, 8.0, -4.3), 1.2);
  float pv = sdCapsule(p, vec3(0.5, -9.5, -1.5), vec3(-0.8, -3.2, -1.0), 0.8);
  float ha = min(sdCapsule(p, vec3(1.9, -9.5, -0.5), vec3(0.3, -3.3, -0.3), 0.28),
                 sdCapsule(p, vec3(0.3, -3.3, -0.3), vec3(-1.6, -3.0, 0.2), 0.22));
  float bd = min(sdCapsule(p, vec3(-0.5, -3.4, -0.1), vec3(-0.2, -9.5, -0.1), 0.33),
                 sdCapsule(p, vec3(-1.8, -2.3, 2.0), vec3(-0.5, -4.2, -0.1), 0.2));
  vec2 r = vec2(body, 1.0);
  r = SU(r, vec2(gb, 2.0), 0.6);
  r = SU(r, vec2(ivc, 3.0), 0.5);
  r = SU(r, vec2(pv, 4.0), 0.3);
  r = U(r, vec2(ha, 5.0));
  r = U(r, vec2(bd, 6.0));
  float fx = p.x - 1.1 - 0.08 * p.y;
  if (r.y < 1.5 && abs(fx) < 0.12 && p.z + p.y * 0.3 > 1.0) r.y = 7.0;   // legamento
  return r;
}

// Segmenti di Couinaud: piani delle tre vene epatiche (verticali) e piano portale (orizzontale).
vec3 segmentColor(vec3 p) {
  bool sup = p.y > 0.4;
  if (p.z < -2.4 && p.x > -2.8 && p.x < 1.6 && p.y > -3.5) return vec3(0.9, 0.9, 0.45);            // I
  if (p.x > 1.2 + 0.08 * p.y) return sup ? vec3(0.35, 0.62, 0.9) : vec3(0.45, 0.8, 0.85);           // II, III
  if (p.x > -1.9 + 0.25 * p.z) return sup ? vec3(0.55, 0.45, 0.85) : vec3(0.72, 0.55, 0.9);         // IVa, IVb
  if (p.z > -1.0 - 0.45 * (p.x + 4.0)) return sup ? vec3(0.9, 0.5, 0.4) : vec3(0.95, 0.68, 0.45);  // VIII, V (settore anteriore)
  return sup ? vec3(0.45, 0.75, 0.45) : vec3(0.65, 0.85, 0.5);                                       // VII, VI
}

vec4 material(float m, vec3 p, vec3 n) {
  if (m < 1.5) {
    float steat = clamp(uP.y, 0.0, 1.0), cirr = clamp(uP.y - 1.0, 0.0, 1.0);
    vec3 base = mix(vec3(0.34, 0.1, 0.07), vec3(0.66, 0.5, 0.28), steat);
    base = mix(base, vec3(0.52, 0.28, 0.12) * (0.75 + 0.5 * noise(p * 1.5)), cirr);
    vec3 c = uP.x > 0.5 ? segmentColor(p) : base * (0.9 + 0.2 * noise(p * 2.5));
    return vec4(c, 0.35);                                                                            // capsula lucida
  }
  if (m < 2.5) return vec4(0.3, 0.5, 0.2, 0.9);          // cistifellea
  if (m < 3.5) return vec4(0.12, 0.18, 0.5, 0.7);        // vena cava inferiore
  if (m < 4.5) return vec4(0.28, 0.22, 0.52, 0.7);       // vena porta
  if (m < 5.5) return vec4(0.7, 0.07, 0.06, 0.8);        // arteria epatica
  if (m < 6.5) return vec4(0.45, 0.6, 0.2, 0.8);         // vie biliari
  return vec4(0.86, 0.8, 0.72, 0.5);                     // legamento falciforme
}

vec3 cutColor(vec3 p, vec2 o) {
  if (o.y > 1.5 && o.y < 2.5) return vec3(0.35, 0.55, 0.2);             // bile nella cistifellea
  if (o.y > 2.5) return vec3(0.35, 0.08, 0.08);                         // sangue nei grandi vasi
  float steat = clamp(uP.y, 0.0, 1.0), cirr = clamp(uP.y - 1.0, 0.0, 1.0);
  vec3 base = uP.x > 0.5 ? segmentColor(p) * 0.85 : mix(vec3(0.52, 0.2, 0.15), vec3(0.8, 0.66, 0.42), steat);
  if (cirr > 0.0) {                                                   // setti fibrosi fra i noduli
    float sept = 1.0 - smoothstep(0.02, 0.06, abs(noise(p * 1.5) - 0.5));
    base = mix(mix(base, vec3(0.6, 0.34, 0.16), cirr), vec3(0.88, 0.84, 0.78), sept * cirr);
  }
  base = mix(base, vec3(0.95, 0.92, 0.8), steat * smoothstep(0.8, 0.9, noise(p * 14.0)));   // gocce di grasso
  // Lobuli epatici: una trama fitta di piccoli poligoni.
  vec3 cell = floor(p * 2.2);
  float lob = hash13(cell);
  base *= 0.9 + 0.12 * lob;
  float hv = hepaticVeins(p), pb = portalBranches(p);
  if (hv < 0.0) return hv > -0.1 ? vec3(0.8, 0.8, 0.85) : vec3(0.16, 0.12, 0.3);    // vene epatiche
  if (pb < 0.0) return pb > -0.12 ? vec3(0.9, 0.85, 0.8) : vec3(0.3, 0.12, 0.3);    // rami portali, con parete più spessa
  return base;
}
`;

  const segs = (st) => st.p[0] > 0.5;
  const plain = (st) => st.p[0] < 0.5;

  const L = (window.BodyOrgans = window.BodyOrgans || { list: {} });
  L.list.fegato = {
    name: 'Fegato',
    kicker: 'Anatomia procedurale · il fegato',
    title: 'Fegato',
    tagline: 'L’organo interno più pesante: circa 1,5 kg e una ventina di centimetri. Riceve sangue da due parti, arteria epatica e vena porta. Accendi i segmenti di Couinaud per vederlo come lo vede un chirurgo.',
    hint: 'Trascina per girare · guardalo da sotto per vedere cistifellea e ilo · prova il taglio assiale',
    formula:
      '<div>Q = Q<sub>porta</sub> + Q<sub>arteria</sub> ≈ 1,5 L/min</div>' +
      '<div>3 + 1 piani → 8 segmenti (Couinaud)</div>',
    how:
      '<p>Scala reale in centimetri: circa 21 cm da destra a sinistra, 15 in altezza nel lobo destro.</p>' +
      '<ol>' +
      '<li><strong>Forma.</strong> Un grande ellissoide per il lobo destro e un cono arrotondato e schiacciato per il sinistro, fusi insieme. La faccia inferiore è appiattita e porta le impronte di stomaco e rene destro, come nel fegato reale.</li>' +
      '<li><strong>Doppia circolazione.</strong> Dalla vena porta arriva circa il 75% del sangue, ricco di nutrienti dall’intestino; dall’arteria epatica il resto, ricco di ossigeno. Tutto esce dalle vene epatiche nella vena cava inferiore.</li>' +
      '<li><strong>Vie biliari.</strong> La bile prodotta dal fegato si raccoglie nella cistifellea, il sacchetto verde il cui fondo sporge dal margine, e scende nel dotto coledoco verso l’intestino.</li>' +
      '<li><strong>Segmenti di Couinaud.</strong> I piani delle tre vene epatiche e quello dei rami portali dividono il fegato in otto segmenti indipendenti, ognuno con i propri vasi: per questo il chirurgo può asportarne uno e lasciare funzionare gli altri. Qui i confini sono approssimati.</li>' +
      '<li><strong>Sezione.</strong> Tagliandolo compaiono i rami delle vene epatiche e della vena porta, e la trama dei lobuli, le unità di cui è fatto il tessuto.</li>' +
      '</ol>',
    center: [-1.5, -0.5, 0.0],
    bound: 13,
    camera: { yaw: -0.35, pitch: -0.22, dist: 36 },
    cutStart: { coronale: 0.0, sagittale: -3.0, assiale: 0.0 },
    labels: [
      { t: 'Lobo destro', p: [-10.0, 2.0, 2.0], n: [-0.8, 0.3, 0.5], when: plain },
      { t: 'Lobo sinistro', p: [5.5, 3.4, 2.6], n: [0.3, 0.6, 0.7], when: plain },
      { t: 'Legamento falciforme', p: [1.2, 4.6, 3.9], n: [0, 0.5, 0.85], when: plain },
      { t: 'Cistifellea', p: [-2.9, -5.6, 5.4], n: [0, -0.5, 0.85] },
      { t: 'Vena porta', p: [0.4, -7.5, -0.7], n: [0.2, -0.2, 0.95] },
      { t: 'Arteria epatica', p: [1.8, -8.6, -0.2], n: [0.4, 0, 0.9] },
      { t: 'Dotto coledoco', p: [-0.4, -8.9, 0.25], n: [-0.3, 0, 0.95] },
      { t: 'Vena cava inferiore', p: [-1.1, -7.5, -6.0], n: [-0.2, -0.2, -0.95] },
      { t: 'I', p: [-0.6, -1.2, -5.2], n: [0, 0, -1], when: segs },
      { t: 'II', p: [6.2, 3.6, 0.8], n: [0.4, 0.8, 0.3], when: segs },
      { t: 'III', p: [5.2, 0.8, 3.4], n: [0.3, 0, 0.95], when: segs },
      { t: 'IVa', p: [-0.4, 4.6, 3.6], n: [0, 0.5, 0.85], when: segs },
      { t: 'IVb', p: [-0.3, -1.8, 5.0], n: [0, -0.2, 1], when: segs },
      { t: 'V', p: [-4.0, -3.0, 5.0], n: [0, -0.3, 0.95], when: segs },
      { t: 'VI', p: [-11.0, -2.5, -0.5], n: [-1, 0, -0.1], when: segs },
      { t: 'VII', p: [-9.5, 3.5, -3.0], n: [-0.8, 0.3, -0.5], when: segs },
      { t: 'VIII', p: [-4.5, 7.2, 1.2], n: [0, 0.95, 0.3], when: segs },
    ],
    stats: [
      ['Peso tipico', '1,4–1,6 kg'],
      ['Flusso di sangue', '≈ 1,5 L/min'],
      ['Dalla vena porta', '≈ 75%'],
      ['Rigenerazione', 'da circa ¼ del tessuto'],
      ['Stato del tessuto', (st) => (st.p[1] < 0.3 ? 'sano' : st.p[1] < 1.3 ? 'steatosi (fegato grasso)' : 'cirrosi')],
    ],
    glsl: GLSL,

    setup(ui, st) {
      ui.toggle({ id: 'segs', label: 'Segmenti di Couinaud', value: false, onChange: (v) => (st.p[0] = v ? 1 : 0) });
      ui.slider({ id: 'tissue', label: 'Stato del tessuto', min: 0, max: 2, step: 0.01, value: 0, format: (v) => (v < 0.3 ? 'sano' : v < 1.3 ? 'steatosi' : 'cirrosi'), onInput: (v) => (st.p[1] = v) });
      return {};
    },
  };
})();
