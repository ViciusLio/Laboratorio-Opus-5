/* Reni — i due reni con surrenali, grandi vasi e ureteri, in funzioni di distanza. Scala reale in centimetri.
   +x = sinistra del paziente, +y = alto, +z = davanti. */
(function () {
  'use strict';

  const GLSL = `
const vec3 CENTER = vec3(0.0, -0.5, -1.0);
const float BOUND = 12.5;
const float STEP = 0.8;

// Sistema locale di un rene: lato mediale (ilo) sempre verso -x, asse lungo verticale.
vec3 kidneyLocal(vec3 p) {
  float side = p.x > 0.0 ? 1.0 : -1.0;
  vec3 q = p - (side > 0.0 ? vec3(5.2, 1.0, 0.0) : vec3(-5.2, -0.8, 0.0));   // il destro sta più in basso
  q.x *= side;
  q.xy = rot(-0.2) * q.xy;          // polo superiore inclinato verso la linea mediana
  q.xz = rot(0.35) * q.xz;          // ilo rivolto in avanti e verso il centro
  return q;
}

float kidney(vec3 q) {
  vec3 b = q;
  b.x += 0.22 * q.y * q.y / 5.6;                                   // curva a fagiolo
  float d = sdEllipsoid(b, vec3(3.0, 5.6, 1.7));
  return smax(d, -(length(q - vec3(-3.3, 0.0, 0.3)) - 1.6), 0.9);  // ilo
}

vec2 organ(vec3 p) {
  vec3 q = kidneyLocal(p);
  float k = kidney(q);
  vec3 aq = q - vec3(-0.9, 6.1, 0.0);
  aq.xy = rot(0.5) * aq.xy;
  float adr = sdEllipsoid(aq, vec3(1.7, 1.2, 0.45)) + 0.08 * noise(p * 3.0);   // surrenale

  // Aorta (appena a sinistra della linea mediana) con la biforcazione nelle iliache.
  float ao = sdCapsule(p, vec3(1.0, 9.5, -2.6), vec3(1.0, -8.5, -2.4), 1.1);
  ao = smin(ao, sdCapsule(p, vec3(1.0, -8.2, -2.4), vec3(4.2, -12.0, -1.6), 0.7), 0.5);
  ao = smin(ao, sdCapsule(p, vec3(1.0, -8.2, -2.4), vec3(-2.4, -12.0, -1.6), 0.7), 0.5);
  // Arterie renali: la destra passa dietro la vena cava.
  float ra = sdBezier(p, vec3(1.0, 1.0, -2.4), vec3(2.2, 1.2, -1.4), vec3(3.0, 1.1, 0.2)).x - 0.32;
  ra = min(ra, sdBezier(p, vec3(1.0, 0.6, -2.6), vec3(-1.6, 0.2, -4.2), vec3(-3.2, -0.6, 0.0)).x - 0.32);
  float art = smin(ao, ra, 0.4);

  // Vena cava inferiore e vene renali: la sinistra, più lunga, passa davanti all'aorta.
  float vc = sdCapsule(p, vec3(-1.6, 9.5, -2.0), vec3(-1.6, -8.5, -1.8), 1.2);
  vc = smin(vc, sdCapsule(p, vec3(-1.6, -8.2, -1.8), vec3(1.8, -12.0, -1.0), 0.8), 0.5);
  vc = smin(vc, sdCapsule(p, vec3(-1.6, -8.2, -1.8), vec3(-4.8, -12.0, -1.0), 0.8), 0.5);
  float rv = sdBezier(p, vec3(3.1, 1.4, 0.9), vec3(1.0, 1.9, 0.1), vec3(-1.4, 1.3, -1.2)).x - 0.45;
  rv = min(rv, sdBezier(p, vec3(-3.2, -0.3, 0.8), vec3(-2.4, 0.2, 0.2), vec3(-1.8, 0.4, -1.2)).x - 0.45);
  float ven = smin(vc, rv, 0.4);

  // Ureteri: dalla pelvi renale verso il basso, lungo il muscolo psoas.
  float ur = sdBezier(p, vec3(3.1, -0.6, 0.5), vec3(3.6, -6.0, 0.3), vec3(2.6, -12.0, -0.3)).x - 0.25;
  ur = min(ur, sdBezier(p, vec3(-3.2, -2.4, 0.4), vec3(-3.6, -7.0, 0.2), vec3(-2.9, -12.0, -0.3)).x - 0.25);

  vec2 r = vec2(k, 1.0);
  r = U(r, vec2(adr, 2.0));
  r = SU(r, vec2(art, 3.0), 0.3);
  r = SU(r, vec2(ven, 4.0), 0.3);
  r = SU(r, vec2(ur, 5.0), 0.3);
  return r;
}

vec4 material(float m, vec3 p, vec3 n) {
  if (m < 1.5) return vec4(vec3(0.42, 0.12, 0.09) * (0.9 + 0.2 * noise(p * 3.0)), 0.7);   // capsula renale
  if (m < 2.5) return vec4(vec3(0.84, 0.6, 0.24) * (0.85 + 0.3 * noise(p * 5.0)), 0.4);   // surrenale
  if (m < 3.5) return vec4(0.66, 0.07, 0.06, 0.7);
  if (m < 4.5) return vec4(0.12, 0.18, 0.5, 0.7);
  return vec4(0.86, 0.8, 0.64, 0.5);                                                       // uretere
}

vec3 cutColor(vec3 p) {
  vec2 o = organ(p);
  if (o.y > 4.5) return vec3(0.95, 0.9, 0.78);
  if (o.y > 3.5) return o.x > -0.15 ? vec3(0.8, 0.8, 0.85) : vec3(0.18, 0.1, 0.25);
  if (o.y > 2.5) return o.x > -0.2 ? vec3(0.9, 0.82, 0.78) : vec3(0.5, 0.06, 0.06);
  if (o.y > 1.5) return o.x > -0.2 ? vec3(0.9, 0.7, 0.3) : vec3(0.5, 0.3, 0.2);            // corticale e midollare del surrene

  // Sezione del rene, in 2D nel piano del rene.
  vec3 q = kidneyLocal(p);
  vec3 b = q;
  b.x += 0.22 * q.y * q.y / 5.6;
  float depth = -sdEllipsoid(vec3(b.xy, 0.0), vec3(3.0, 5.6, 100.0));
  vec2 h = q.xy - vec2(-1.4, 0.0);                 // centro del seno renale
  float r = length(h), th = atan(h.y, h.x);
  vec3 cortex = vec3(0.64, 0.23, 0.17);
  vec3 c = cortex;
  bool inSpan = abs(th) < 2.45;
  float sec = (th + 2.45) / 4.9 * 8.0;             // otto piramidi a ventaglio
  float f = fract(sec) - 0.5;
  float w = 0.44 * smoothstep(2.6, 0.9, depth);    // larghe alla base, strette verso la papilla
  if (inSpan && depth > 0.85 && depth < 2.55 && abs(f) < w)
    c = vec3(0.44, 0.09, 0.09) * (0.8 + 0.3 * sin(th * 90.0));                            // piramide striata
  if (depth > 2.4 && r > 1.25) c = vec3(0.9, 0.74, 0.38);                                  // grasso del seno
  if (inSpan && abs(f) < 0.13 && depth > 2.4) c = vec3(0.93, 0.87, 0.74);                  // calici minori
  if (r < 1.25 && q.x > -3.2) c = vec3(0.93, 0.87, 0.74);                                  // pelvi renale
  return c;
}
`;

  const K = (window.BodyOrgans = window.BodyOrgans || { list: {} });
  K.list.reni = {
    name: 'Reni',
    kicker: 'Anatomia procedurale · i reni',
    title: 'Reni',
    tagline: 'Due organi di 11 centimetri e 150 grammi che filtrano ogni giorno circa 180 litri di plasma, e ne restituiscono al corpo il 99%. Col taglio coronale compare la loro architettura interna.',
    hint: 'Trascina per girare · il taglio coronale mostra piramidi e pelvi renale',
    formula:
      '<div>VFG ≈ 125 mL/min × 1440 min ≈ 180 L/giorno</div>' +
      '<div>riassorbito ≈ 1 − 1,5 ⁄ 180 ≈ 99%</div>',
    how:
      '<p>Scala reale in centimetri. Si guarda il paziente di fronte: il rene sinistro è alla tua destra.</p>' +
      '<ol>' +
      '<li><strong>Forma.</strong> Un ellissoide curvato a fagiolo, con l’ilo scavato sul lato mediale. Il polo superiore è inclinato verso la colonna e l’ilo guarda in avanti. Il rene destro sta più in basso del sinistro perché sopra c’è il fegato.</li>' +
      '<li><strong>Vasi.</strong> Aorta e vena cava corrono al centro. La vena renale sinistra, più lunga, passa davanti all’aorta; l’arteria renale destra passa dietro la vena cava. Sopra ogni rene c’è la ghiandola surrenale.</li>' +
      '<li><strong>Sezione.</strong> Fuori la corticale, dove stanno i glomeruli che filtrano il sangue. Dentro le piramidi striate della midollare, con le colonne renali in mezzo. Le punte delle piramidi sboccano nei calici, che confluiscono nella pelvi e poi nell’uretere.</li>' +
      '<li><strong>Numeri.</strong> Circa un milione di nefroni per rene filtrano 125 mL di plasma al minuto, 180 litri al giorno. Ne diventa urina solo un litro e mezzo: tutto il resto viene riassorbito.</li>' +
      '</ol>',
    center: [0, -0.5, -1.0],
    bound: 12.5,
    camera: { yaw: 0.0, pitch: 0.12, dist: 37 },
    cutStart: { coronale: 0.3, sagittale: 5.2, assiale: 1.0 },
    labels: [
      { t: 'Rene sinistro', p: [8.1, 2.4, 0.2], n: [1, 0, 0.3] },
      { t: 'Rene destro', p: [-8.1, 0.6, 0.2], n: [-1, 0, 0.3] },
      { t: 'Ghiandola surrenale', p: [4.6, 7.3, 0.5], n: [0.2, 0.8, 0.5] },
      { t: 'Aorta', p: [1.0, 6.5, -1.4], n: [0, 0, 1] },
      { t: 'Vena cava inferiore', p: [-1.6, 6.5, -0.8], n: [0, 0, 1] },
      { t: 'Vena renale sinistra', p: [0.9, 1.9, 0.5], n: [0, 0.3, 1] },
      { t: 'Uretere', p: [3.4, -6.5, 0.6], n: [0.3, 0, 1] },
      { t: 'Corticale', p: [7.9, 3.4, -0.7], n: [0, 0, 1], only: 'coronale' },
      { t: 'Piramide renale', p: [6.9, 0.4, -0.7], n: [0, 0, 1], only: 'coronale' },
      { t: 'Pelvi renale', p: [4.3, 1.1, -0.7], n: [0, 0, 1], only: 'coronale' },
    ],
    stats: [
      ['Filtrazione', '≈ 180 L/giorno'],
      ['Urina prodotta', '≈ 1,5 L/giorno'],
      ['Nefroni', '≈ 1 milione per rene'],
      ['Flusso di sangue', '≈ 20% della gittata'],
    ],
    glsl: GLSL,
  };
})();
