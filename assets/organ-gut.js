/* Intestino — tenue e crasso in funzioni di distanza, scala reale in centimetri.
   +x = sinistra del paziente, +y = alto, +z = davanti. Il colon ascendente sta a -x. */
(function () {
  'use strict';

  const GLSL = `
const vec3 CENTER = vec3(0.0, -4.0, 1.5);
const float BOUND = 17.5;
const float STEP = 0.7;

// ---------- intestino tenue: anse a serpentina in due strati, unite da curve a U ----------
const float S = 2.9;          // passo fra un'ansa e l'altra
const float RT = 1.25;        // raggio: circa 2,5 cm di diametro
const float NR = 4.0;         // anse per strato
const vec2 RC = vec2(0.3, -3.8);
const float RH = 7.2, RW = 6.6;

float halfW(float y) { float t = (y - RC.y) / RH; return RW * sqrt(max(1.0 - t * t, 0.12)); }
float rowY(float i, float off) { return RC.y - RH + 1.4 + i * S + off; }
float rEnd(float k, float off) { return RC.x + halfW(rowY(2.0 * k + 0.5, off)) - 1.6; }   // anse 2k e 2k+1
float lEnd(float k, float off) { return RC.x - halfW(rowY(2.0 * k - 0.5, off)) + 1.6; }   // anse 2k-1 e 2k

float rowDist(vec3 p, float i, float zL, float off) {
  if (i < 0.0 || i > NR - 1.0) return 1e5;
  float xr = rEnd(floor(i / 2.0), off);
  float xl = lEnd(floor((i + 1.0) / 2.0), off);
  float x = clamp(p.x, xl, xr);
  float env = smoothstep(xl, xl + 2.2, x) * smoothstep(xr, xr - 2.2, x);
  float yc = rowY(i, off) + 0.5 * sin(x * 0.95 + i * 1.7 + off) * env;
  float zc = zL + 0.7 * sin(x * 0.7 + i * 2.3 + off) * env;
  float wave = pow(0.5 + 0.5 * sin(x * 1.3 - uBeat * 6.2832 + i * 2.1), 6.0);   // anelli di contrazione che scorrono
  return length(vec3(p.x - x, p.y - yc, p.z - zc)) * 0.85 - RT * (1.0 - 0.3 * uP.y * wave);
}

float turnDist(vec3 p, float xe, float ym, float zL, float dir) {
  vec3 q = p - vec3(xe, ym, zL);
  float R = S * 0.5;
  if (q.x * dir >= 0.0) return length(vec2(length(q.xy) - R, q.z)) - RT;
  return length(vec3(q.x, abs(q.y) - R, q.z)) - RT;
}

float loops(vec3 p, float zL, float off) {
  float i = clamp(floor((p.y - rowY(0.0, off)) / S + 0.5), 0.0, NR - 1.0);
  float d = min(rowDist(p, i - 1.0, zL, off), min(rowDist(p, i, zL, off), rowDist(p, i + 1.0, zL, off)));
  for (int j = uZero - 1; j <= 1; j++) {
    float r = i + float(j);
    float k = floor(r / 2.0);
    if (k >= 0.0 && 2.0 * k + 1.0 <= NR - 1.0) d = min(d, turnDist(p, rEnd(k, off), rowY(2.0 * k + 0.5, off), zL, 1.0));
    float k2 = floor((r + 1.0) / 2.0);
    if (k2 >= 1.0 && 2.0 * k2 <= NR - 1.0) d = min(d, turnDist(p, lEnd(k2, off), rowY(2.0 * k2 - 0.5, off), zL, -1.0));
  }
  return d;
}

float smallBowel(vec3 p) {
  float d = min(loops(p, 2.6, 0.0), loops(p, 0.2, S * 0.5));
  // Ileo terminale fino al cieco, e inizio del digiuno che sale verso il duodeno, dietro.
  d = min(d, sdCapsule(p, vec3(lEnd(0.0, 0.0), rowY(0.0, 0.0), 2.6), vec3(-7.3, -8.1, 2.5), 1.15));
  d = min(d, sdCapsule(p, vec3(lEnd(2.0, 0.0), rowY(3.0, 0.0), 2.6), vec3(0.8, 1.4, -1.2), 1.15));
  return d;
}

// ---------- intestino crasso: otto curve di Bézier dal cieco al retto ----------
const vec3 CA[8] = vec3[8](vec3(-8.6, -8.5, 2.2), vec3(-9.0, 4.5, 0.8), vec3(-5.5, 6.6, 3.8), vec3(5.5, 6.8, 3.8),
                           vec3(9.8, 5.5, -0.2), vec3(9.4, -8.0, 0.4), vec3(4.5, -9.5, 3.6), vec3(0.6, -12.5, 1.2));
const vec3 CB[8] = vec3[8](vec3(-9.4, -2.0, 1.4), vec3(-8.8, 8.2, 1.5), vec3(0.0, 1.6, 6.5), vec3(9.8, 10.2, 1.2),
                           vec3(10.2, -1.5, -0.6), vec3(8.6, -12.5, 2.0), vec3(0.8, -7.2, 4.2), vec3(0.4, -15.0, -0.2));
const vec3 CC[8] = vec3[8](vec3(-9.0, 4.5, 0.8), vec3(-5.5, 6.6, 3.8), vec3(5.5, 6.8, 3.8), vec3(9.8, 5.5, -0.2),
                           vec3(9.4, -8.0, 0.4), vec3(4.5, -9.5, 3.6), vec3(0.6, -12.5, 1.2), vec3(0.0, -17.5, -1.2));
const vec2 CR[8] = vec2[8](vec2(3.0, 2.5), vec2(2.5, 2.3), vec2(2.3, 2.3), vec2(2.3, 2.1),
                           vec2(2.1, 1.9), vec2(1.9, 1.6), vec2(1.6, 1.6), vec2(1.7, 2.2));
const float CL[8] = float[8](13.0, 7.0, 14.0, 8.0, 14.0, 9.0, 8.0, 6.0);

float colon(vec3 p, out float tae) {
  float best = 1e5, bt = 0.0, br = 1.0, s = 0.0, cum = 0.0;
  int bi = 0;
  for (int i = uZero; i < 8; i++) {
    vec2 b = sdBezier(p, CA[i], CB[i], CC[i]);
    float r = mix(CR[i].x, CR[i].y, b.y);
    if (b.x - r < best) { best = b.x - r; bt = b.y; br = r; bi = i; s = cum + b.y * CL[i]; }
    cum += CL[i];
  }
  // Austre: il raggio si gonfia fra una plica e l'altra (non nel retto).
  float haus = bi == 7 ? 1.0 : 0.88 + 0.14 * sqrt(abs(sin(3.14159 * s / 3.2)));
  // Tenie: tre bande longitudinali a 120°, dove le austre non si gonfiano.
  vec3 A = CA[bi], B = CB[bi], C = CC[bi];
  vec3 Q = mix(mix(A, B, bt), mix(B, C, bt), bt);
  vec3 T = normalize(2.0 * (1.0 - bt) * (B - A) + 2.0 * bt * (C - B));
  vec3 N1 = normalize(cross(T, abs(T.z) < 0.9 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0)));
  vec3 N2 = cross(T, N1);
  vec3 v = p - Q;
  float ang = atan(dot(v, N2), dot(v, N1));
  tae = bi == 7 ? 0.0 : smoothstep(0.9, 0.975, cos(3.0 * ang + 0.6));
  float r = br * mix(haus, 0.9, tae);
  if (bi >= 4 && bi <= 6) r += uP.z * 0.9 * smoothstep(0.62, 0.8, noise(p * 1.7 + 10.0));   // diverticoli
  return (length(v) - r) * 0.9;
}

float hollow(float d, float w) { return max(d, -d - w); }

vec2 organ(vec3 p) {
  vec2 r = vec2(1e5, 0.0);
  if (uP.x < 1.5) {
    float sb = smallBowel(p);
    r = vec2(hollow(sb, 0.28), -sb - 0.28 > sb ? 6.0 : 1.0);
  }
  if (uP.x < 0.5 || uP.x > 1.5) {
    float tae;
    float c = colon(p, tae);
    float ap = sdBezier(p, vec3(-7.9, -10.4, 2.2), vec3(-6.6, -12.8, 3.0), vec3(-5.0, -13.2, 1.6)).x - 0.45;   // appendice
    c = smin(c, ap, 0.5);
    vec2 cr = vec2(hollow(c, 0.3), -c - 0.3 > c ? 7.0 : (ap < c + 0.05 ? 4.0 : (tae > 0.5 ? 3.0 : 2.0)));
    r = U(r, cr);
  }
  return r;
}

vec4 material(float m, vec3 p, vec3 n) {
  float g = noise(p * 2.0);
  if (m < 1.5) return vec4(vec3(0.6, 0.22, 0.2) * (0.9 + 0.2 * g), 0.75);     // tenue
  if (m < 2.5) return vec4(vec3(0.5, 0.29, 0.24) * (0.9 + 0.2 * g), 0.6);     // colon
  if (m < 3.5) return vec4(0.74, 0.62, 0.48, 0.5);                            // tenie
  if (m < 4.5) return vec4(0.5, 0.28, 0.24, 0.6);                             // appendice
  // Mucosa: il tenue è vellutato di villi, il colon più liscio.
  float vil = noise(p * 22.0);
  return m < 6.5 ? vec4(vec3(0.9, 0.42, 0.44) * (0.75 + 0.4 * vil), 0.3) : vec4(0.85, 0.5, 0.48, 0.4);
}

vec3 cutColor(vec3 p, vec2 o) {
  float depth = -o.x;                         // attraverso la parete: sierosa, muscolare, mucosa
  vec3 muscle = vec3(0.78, 0.36, 0.34);
  if (o.y < 1.5 || (o.y > 5.5 && o.y < 6.5)) {
    vec3 mucosa = vec3(0.93, 0.42, 0.45) * (0.8 + 0.35 * noise(p * 25.0));
    return mix(muscle, mucosa, smoothstep(0.13, 0.19, depth));
  }
  return mix(muscle * vec3(1.0, 1.08, 1.0), vec3(0.88, 0.55, 0.52), smoothstep(0.15, 0.21, depth));
}
`;

  const I = (window.BodyOrgans = window.BodyOrgans || { list: {} });
  I.list.intestino = {
    name: 'Intestino',
    kicker: 'Anatomia procedurale · l’intestino',
    title: 'Intestino',
    tagline: 'Metri di tubo ripiegati in pochi centimetri: le anse del tenue incorniciate dal colon. Nel tenue avviene quasi tutto l’assorbimento, nel crasso vivono decine di migliaia di miliardi di batteri.',
    hint: 'Trascina per girare · scegli il tratto da mostrare · il taglio coronale apre le anse',
    formula:
      '<div>pieghe × villi × microvilli ≈ 3 × 10 × 20 = ×600</div>' +
      '<div>r(s) = r<sub>0</sub> (0,88 + 0,14 √|sin(πs ⁄ λ)|)</div>',
    how:
      '<p>Scala reale in centimetri. Il colon ascendente è alla tua sinistra, perché il paziente ti guarda.</p>' +
      '<ol>' +
      '<li><strong>Tenue.</strong> Anse a serpentina su due strati, unite da curve a U in un unico tubo di circa 2,5 cm di diametro. Comincia in alto, dove il duodeno diventa digiuno, e finisce con l’ileo terminale che entra nel cieco.</li>' +
      '<li><strong>Crasso.</strong> Otto curve di Bézier disegnano la cornice: cieco con l’appendice, colon ascendente, trasverso che pende davanti, discendente, sigma, retto. Il diametro va dai 6–7 cm del cieco ai 3 del sigma.</li>' +
      '<li><strong>Austre e tenie.</strong> Lungo il colon il raggio si gonfia e si stringe a ritmo regolare (la seconda formula): sono le austre. Tre bande longitudinali a 120°, le tenie, tengono il colon arricciato.</li>' +
      '<li><strong>Superficie di assorbimento.</strong> I manuali classici moltiplicano pieghe, villi e microvilli per ottenere circa 600 volte la superficie di un tubo liscio. Le misure moderne danno in tutto circa 30 m² di mucosa: più o meno un monolocale.</li>' +
      '<li><strong>Sezione.</strong> Le pareti sono cave: il taglio mostra la tonaca muscolare e, all’interno del tenue, la mucosa vellutata di villi.</li>' +
      '</ol>',
    center: [0, -4.0, 1.5],
    bound: 17.5,
    camera: { yaw: 0.0, pitch: 0.08, dist: 50 },
    cutStart: { coronale: 1.1, sagittale: 0.0, assiale: 0.0 },
    labels: [
      { t: 'Intestino tenue', p: [1.0, -2.5, 5.3], n: [0, 0, 1], when: (st) => st.p[0] < 1.5 },
      { t: 'Colon ascendente', p: [-11.2, -1.0, 2.2], n: [-0.6, 0, 0.8], when: (st) => st.p[0] !== 1 },
      { t: 'Colon trasverso', p: [0.0, 4.2, 7.3], n: [0, 0.2, 1], when: (st) => st.p[0] !== 1 },
      { t: 'Colon discendente', p: [11.6, -1.0, 1.0], n: [0.6, 0, 0.8], when: (st) => st.p[0] !== 1 },
      { t: 'Colon sigmoideo', p: [4.6, -9.4, 5.3], n: [0, 0, 1], when: (st) => st.p[0] !== 1 },
      { t: 'Cieco', p: [-9.6, -9.0, 4.6], n: [-0.3, -0.3, 0.9], when: (st) => st.p[0] !== 1 },
      { t: 'Appendice', p: [-5.4, -13.5, 2.2], n: [0.2, -0.5, 0.8], when: (st) => st.p[0] !== 1 },
      { t: 'Retto', p: [0.2, -15.8, 1.5], n: [0, -0.2, 1], when: (st) => st.p[0] !== 1 },
    ],
    stats: [
      ['Tenue', '≈ 3–5 m nel vivente'],
      ['Crasso', '≈ 1,5 m'],
      ['Superficie interna', '≈ 30 m²'],
      ['Batteri ospiti', '≈ 38 000 miliardi'],
    ],
    glsl: GLSL,

    setup(ui, st) {
      ui.segmented({
        id: 'tract', label: 'Tratto da mostrare', value: 0,
        options: [{ value: 0, label: 'Tutto' }, { value: 1, label: 'Tenue' }, { value: 2, label: 'Crasso' }],
        onChange: (v) => (st.p[0] = v),
      });
      ui.toggle({ id: 'peri', label: 'Peristalsi del tenue', value: false, onChange: (v) => (st.p[1] = v ? 1 : 0) });
      ui.slider({ id: 'divert', label: 'Diverticoli (colon sinistro)', min: 0, max: 1, step: 0.01, value: 0, format: (v) => (v < 0.02 ? 'assenti' : Math.round(v * 100) + '%'), onInput: (v) => (st.p[2] = v) });
      return { tick(dt) { if (st.p[1] > 0.5) st.beat += dt * 0.35; } };
    },
  };
})();
