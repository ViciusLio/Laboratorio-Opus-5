/* Cervello — encefalo in funzioni di distanza, scala reale in centimetri.
   +x = sinistra del paziente, +y = alto, +z = davanti.
   Le circonvoluzioni sono solchi scavati dove un rumore 3D si annulla. */
(function () {
  'use strict';

  const GLSL = `
const vec3 CENTER = vec3(0.0, -1.0, -0.5);
const float BOUND = 11.0;
const float STEP = 0.4;

// Circonvoluzioni: due famiglie di onde deformate da rumore (lo schema del "corallo cervello").
// Una maschera sceglie quale prevale in ogni zona, un'altra spezza i solchi: ne esce un labirinto.
// Il solco sta nel ventre dell'onda; la cresta arrotondata è il giro.
float sulci(vec3 p) {
  float warp = 3.2 * gnoise(p * 0.3) + 1.6 * gnoise(p * 0.65 + 9.0);
  float ga = sin(5.4 * (p.y * 0.85 + p.z * 0.5) + warp);
  float gb = sin(5.4 * (p.y * 0.35 - p.z * 0.9 + p.x * 0.3) + warp * 1.2 + 1.7);
  float mixAB = smoothstep(-0.3, 0.3, gnoise(p * 0.17 + 40.0));
  float ga2 = smoothstep(-0.45, -0.98, ga), gb2 = smoothstep(-0.45, -0.98, gb);
  float groove = mix(ga2, gb2, mixAB) * smoothstep(-0.65, -0.1, gnoise(p * 0.5 + 20.0));
  float fine = gnoise(p * 1.4 + 3.3);
  return 0.27 * groove - 0.035 * mix(ga, gb, mixAB) + 0.02 * exp(-fine * fine / 0.05);
}

// Lamelle del cervelletto: archi concentrici attorno a un asse trasversale.
float folia(vec3 p) {
  float w = sin(length(p.yz - vec2(-2.4, -3.0)) * 13.0 + 0.6 * gnoise(p * 0.8));
  return 0.13 * pow(0.5 + 0.5 * w, 3.0);
}

vec2 organ(vec3 p) {
  vec3 q = vec3(abs(p.x), p.y, p.z);

  // Emisfero (specchiato): ellissoide, lobo temporale, base appiattita, faccia mediale piatta.
  float hem = sdEllipsoid(q - vec3(3.4, 0.8, 0.0), vec3(3.6, 4.8, 8.2));
  hem = smin(hem, sdEllipsoid(q - vec3(4.6, -2.0, 1.2), vec3(2.4, 2.0, 3.8)), 1.6);
  float floorY = -2.3 - 1.5 * smoothstep(3.0, -1.0, p.z);
  hem = smax(hem, floorY - p.y, 1.0);
  hem = smax(hem, 0.13 - q.x, 0.5);                                   // scissura longitudinale

  // Scissura laterale (di Silvio) e solco centrale (di Rolando), più profondi degli altri.
  float lf = sdCapsule(q, vec3(6.9, -0.5, 3.0), vec3(6.5, 1.3, -2.2), 0.28);
  vec2 cs = sdBezier(q, vec3(0.3, 5.6, -0.5), vec3(4.5, 5.0, 0.2), vec3(6.8, 1.3, 1.3));
  hem = smax(hem, -min(lf, cs.x - 0.2), 0.35);

  float sc = 0.0;
  if (hem < 1.2) { sc = sulci(p); hem += sc; }

  // Corpo calloso: il ponte di fibre che unisce i due emisferi.
  // Arco a C: ginocchio davanti, splenio dietro, più spesso alle estremità.
  vec2 ccb = sdBezier(vec3(p.x * 0.55, p.y, p.z), vec3(0.0, 0.9, 3.0), vec3(0.0, 3.3, -0.2), vec3(0.0, 1.2, -3.5));
  float cc = ccb.x - (0.36 + 0.22 * abs(ccb.y - 0.5) * 2.0);
  hem = smin(hem, cc, 0.4);

  // Ventricoli laterali: cavità piene di liquor.
  float vent = smin(sdEllipsoid(q - vec3(1.0, 1.1, 0.3), vec3(0.45, 0.8, 3.0)),
                    sdEllipsoid(q - vec3(1.3, 0.1, -3.0), vec3(0.4, 0.9, 1.5)), 0.5);
  float m = -vent > hem ? 6.0 : 1.0;
  hem = max(hem, -vent);

  // Cervelletto con il verme centrale e le lamelle (folia).
  float cer = smin(sdEllipsoid(q - vec3(2.4, -3.4, -5.3), vec3(3.1, 2.2, 2.6)),
                   sdEllipsoid(p - vec3(0.0, -3.2, -4.9), vec3(1.2, 1.8, 2.0)), 1.0);
  float fo = 0.0;
  if (cer < 0.6) { fo = folia(p); cer += fo; }

  // Tronco encefalico: mesencefalo, ponte, midollo allungato.
  float bs = smin(sdEllipsoid(p - vec3(0.0, -3.5, -1.5), vec3(1.5, 1.4, 1.35)),
                  sdRoundCone(p, vec3(0.0, -4.3, -2.1), vec3(0.0, -8.2, -3.0), 1.05, 0.75), 0.6);
  bs = smin(bs, sdCapsule(p, vec3(0.0, -1.8, -1.3), vec3(0.0, -3.2, -1.5), 1.0), 0.6);

  float olf = sdCapsule(q, vec3(0.8, -2.1, 4.2), vec3(0.7, -2.3, 6.8), 0.25);   // bulbi olfattivi

  gA = vec4(sc, fo, 0.0, 0.0);
  vec2 r = vec2(hem, m);
  r = U(r, vec2(cer, 3.0));
  r = SU(r, vec2(bs, 4.0), 0.5);
  return U(r, vec2(olf, 5.0));
}

vec3 lobeColor(vec3 p) {
  float zcs = -0.5 + (5.4 - p.y) * 0.405;            // solco centrale
  float ylf = -0.4 + (2.8 - p.z) * 0.333;            // scissura laterale
  if (p.z < -4.6 + 0.3 * p.y) return vec3(0.82, 0.3, 0.3);                       // occipitale
  if (p.y < ylf && abs(p.x) > 2.2) return vec3(0.32, 0.68, 0.38);                // temporale
  if (p.z > zcs) return vec3(0.3, 0.48, 0.86);                                   // frontale
  return vec3(0.9, 0.74, 0.28);                                                   // parietale
}

vec4 material(float m, vec3 p, vec3 n) {
  bool lobes = uP.x > 0.5;
  if (m < 1.5) {
    vec3 base = lobes ? lobeColor(p) : vec3(0.74, 0.57, 0.53);
    base *= 1.0 - smoothstep(0.06, 0.28, gA.x) * 0.6;                              // solchi in ombra
    float v = gnoise(p * 0.33 + 20.0);
    float ves = exp(-v * v / 0.0008) * (1.0 - smoothstep(0.05, 0.2, gA.x));        // vasi della pia madre
    if (!lobes) base = mix(base, vec3(0.6, 0.16, 0.15), ves * 0.45);
    return vec4(base, 0.45);
  }
  if (m < 3.5) {
    vec3 base = lobes ? vec3(0.56, 0.38, 0.76) : vec3(0.7, 0.5, 0.48);
    return vec4(base * (0.6 + 3.0 * gA.y), 0.4);
  }
  if (m < 4.5) return vec4(lobes ? vec3(0.62, 0.62, 0.66) : vec3(0.76, 0.63, 0.58), 0.4);
  if (m < 5.5) return vec4(0.86, 0.76, 0.68, 0.4);
  return vec4(0.9, 0.85, 0.8, 0.3);                                               // pareti dei ventricoli
}

vec3 cutColor(vec3 p, vec2 o) {
  float depth = -o.x;
  vec3 GRAY = vec3(0.56, 0.45, 0.45), WHITE = vec3(0.93, 0.89, 0.82);
  if (o.y > 2.5 && o.y < 3.5) {                       // cervelletto: l'"albero della vita"
    float br = sin(length(p.yz - vec2(-2.4, -3.0)) * 13.0);
    return mix(GRAY, WHITE, smoothstep(0.35, 0.8, depth) * (0.4 + 0.6 * smoothstep(-0.3, 0.5, br)));
  }
  if (o.y > 3.5) return mix(WHITE, GRAY, 0.25);
  vec3 q = vec3(abs(p.x), p.y, p.z);
  vec3 c = mix(GRAY, WHITE, smoothstep(0.24, 0.34, depth));   // corteccia di circa 3 mm
  float nuc = min(sdEllipsoid(q - vec3(1.9, 0.3, 0.8), vec3(1.0, 1.2, 1.7)),
                  sdEllipsoid(q - vec3(0.8, -0.1, -0.9), vec3(0.8, 0.9, 1.4)));
  return mix(c, GRAY * 1.05, (1.0 - smoothstep(-0.05, 0.05, nuc)) * 0.85);       // nuclei della base e talamo
}
`;

  const B = (window.BodyOrgans = window.BodyOrgans || { list: {} });
  B.list.cervello = {
    name: 'Cervello',
    kicker: 'Anatomia procedurale · il cervello',
    title: 'Cervello',
    tagline: 'Circa 1,4 kg e 86 miliardi di neuroni. Le circonvoluzioni non sono disegnate a mano: nascono dove un rumore matematico si annulla. Taglialo per vedere la corteccia grigia sopra la sostanza bianca.',
    hint: 'Trascina per girare · prova il taglio sagittale, al centro, per la vista classica',
    formula:
      '<div>d(p) = d<sub>0</sub>(p) + a · e<sup>−(n(ωp) ⁄ w)<sup>2</sup></sup></div>' +
      '<div>P ≈ 20 W ≈ 20% del consumo a riposo</div>',
    how:
      '<p>Scala reale in centimetri: 16–17 cm dalla fronte alla nuca, circa 14 in larghezza.</p>' +
      '<ol>' +
      '<li><strong>Emisferi.</strong> Ellissoidi con il lobo temporale fuso sotto, la base appiattita e la faccia mediale piatta: in mezzo resta la scissura longitudinale.</li>' +
      '<li><strong>Circonvoluzioni.</strong> Un rumore 3D, deformato da un altro rumore, vale zero lungo linee sinuose. Lì la superficie viene scavata (la prima formula): ne escono giri e solchi larghi circa un centimetro, diversi in ogni emisfero, come nei cervelli veri.</li>' +
      '<li><strong>Solchi maggiori.</strong> La scissura laterale di Silvio e il solco centrale di Rolando sono scavati apposta, più profondi: sono i confini fra i lobi.</li>' +
      '<li><strong>Cervelletto.</strong> Le sue lamelle sottili sono gusci concentrici; in sezione compare l’“albero della vita”, la sostanza bianca ramificata al suo interno.</li>' +
      '<li><strong>Interno.</strong> In sezione la corteccia grigia spessa circa 3 mm segue ogni piega; sotto c’è la sostanza bianca, con i ventricoli laterali (cavità piene di liquor), i nuclei della base, il talamo e il corpo calloso.</li>' +
      '</ol>',
    center: [0, -1.0, -0.5],
    bound: 11,
    camera: { yaw: 1.0, pitch: 0.22, dist: 31 },
    cutStart: { coronale: 0.8, sagittale: 0.0, assiale: 1.6 },
    labels: [
      { t: 'Lobo frontale', p: [5.6, 3.0, 4.5], n: [0.6, 0.35, 0.5] },
      { t: 'Lobo parietale', p: [5.9, 3.6, -2.5], n: [0.7, 0.5, -0.2] },
      { t: 'Lobo temporale', p: [6.9, -2.0, 1.0], n: [1, -0.1, 0] },
      { t: 'Lobo occipitale', p: [4.8, 1.5, -7.1], n: [0.5, 0.1, -0.85] },
      { t: 'Solco centrale', p: [6.1, 3.6, 0.3], n: [0.8, 0.5, 0.1] },
      { t: 'Scissura laterale', p: [6.7, 0.4, 0.4], n: [1, 0.1, 0] },
      { t: 'Cervelletto', p: [5.1, -3.6, -6.1], n: [0.7, -0.2, -0.6] },
      { t: 'Tronco encefalico', p: [0.5, -5.2, -1.2], n: [0.4, -0.2, 0.9] },
      { t: 'Corpo calloso', p: [0.0, 2.2, -0.3], n: [1, 0, 0], only: 'sagittale' },
      { t: 'Ventricolo laterale', p: [1.0, 1.1, 0.3], n: [0, 0, 1], only: 'coronale' },
    ],
    stats: [
      ['Peso tipico', '1,3–1,4 kg'],
      ['Neuroni', '≈ 86 miliardi'],
      ['Corteccia', '2–4 mm di spessore'],
      ['Potenza', '≈ 20 W'],
    ],
    glsl: GLSL,

    setup(ui, st) {
      ui.toggle({ id: 'lobes', label: 'Colora i lobi', value: false, onChange: (v) => (st.p[0] = v ? 1 : 0) });
      return {};
    },
  };
})();
