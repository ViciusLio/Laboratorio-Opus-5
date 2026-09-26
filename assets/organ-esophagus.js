/* Esofago — dalla faringe allo stomaco, con trachea, aorta e diaframma attorno.
   Il pulsante "Deglutisci" fa scendere un boccone spinto dall'onda peristaltica. Scala reale in centimetri.
   +x = sinistra del paziente, +y = alto, +z = davanti. */
(function () {
  'use strict';

  // Lunghezza dell'esofago modellato, in cm (tre curve di Bézier nello shader).
  const LEN = 27;

  const GLSL = `
const vec3 CENTER = vec3(0.8, 1.5, -1.0);
const float BOUND = 17.0;
const float STEP = 0.75;

const vec3 EA[3] = vec3[3](vec3(0.0, 15.5, -1.6), vec3(0.4, 4.5, -2.2), vec3(1.2, -6.0, -1.2));
const vec3 EB[3] = vec3[3](vec3(0.2, 10.0, -2.0), vec3(0.6, -1.0, -2.4), vec3(1.8, -9.0, -0.2));
const vec3 EC[3] = vec3[3](vec3(0.4, 4.5, -2.2), vec3(1.2, -6.0, -1.2), vec3(3.4, -11.2, 0.6));
const float EL[3] = float[3](11.0, 10.6, 5.4);

// Raggio lungo l'esofago (s in cm dalla faringe): tre restringimenti fisiologici e l'onda che spinge il boccone.
float radiusAt(float s, out float distend) {
  float sb = uQ.x;                                              // posizione del boccone
  float relax = exp(-pow((sb - 24.0) / 2.5, 2.0));              // lo sfintere inferiore si apre all'arrivo
  float r = 1.0;
  r *= 1.0 - 0.3 * exp(-pow((s - 0.8) / 1.2, 2.0));             // sfintere esofageo superiore
  r *= 1.0 - 0.2 * exp(-pow((s - 11.5) / 1.5, 2.0));            // incrocio con arco aortico e bronco sinistro
  r *= 1.0 - (0.3 - 0.35 * relax) * exp(-pow((s - 24.0) / 1.5, 2.0));   // sfintere esofageo inferiore
  distend = exp(-pow((s - sb) / 1.5, 2.0));
  r += 0.75 * distend;                                          // il boccone dilata la parete
  r *= 1.0 - 0.3 * exp(-pow((s - (sb - 3.0)) / 1.3, 2.0));      // dietro, l'anello di contrazione
  return r;
}

vec2 esophagus(vec3 p, out float ang, out float distend) {
  float best = 1e5, s = 0.0, cum = 0.0;
  vec3 bq = vec3(0.0), bt = vec3(0.0, 1.0, 0.0);
  for (int i = uZero; i < 3; i++) {
    vec3 Q, T;
    vec2 b = bezierFrame(p, EA[i], EB[i], EC[i], Q, T);
    if (b.x < best) { best = b.x; s = cum + b.y * EL[i]; bq = Q; bt = T; }
    cum += EL[i];
  }
  ang = tubeAngle(p - bq, bt);
  float r = radiusAt(s, distend);
  return vec2((best - r) * 0.85, s);
}

vec3 bolusPos() {
  float sb = uQ.x;
  if (sb < 11.0) return bezierAt(EA[0], EB[0], EC[0], clamp(sb / 11.0, 0.0, 1.0));
  if (sb < 21.6) return bezierAt(EA[1], EB[1], EC[1], (sb - 11.0) / 10.6);
  return bezierAt(EA[2], EB[2], EC[2], clamp((sb - 21.6) / 5.4, 0.0, 1.0));
}

vec2 organ(vec3 p) {
  float ang, dist;
  vec2 e = esophagus(p, ang, dist);
  // Parete cava: a riposo il lume è una stella di pieghe; il boccone la distende.
  float rin = mix(0.32 + 0.2 * sin(7.0 * ang), 0.7, dist);
  float outer = e.x;
  float inner = -(outer + (radiusAt(e.y, dist) - rin) * 0.85);
  vec2 r = vec2(max(outer, inner), inner > outer ? 8.0 : 1.0);

  // Stomaco (solo la parte alta), dove l'esofago sbocca.
  float st = sdEllipsoid(p - vec3(5.6, -13.4, 0.8), vec3(4.8, 3.8, 3.8));
  st = smax(st, -15.8 - p.y, 1.0);
  r = SU(r, vec2(st, 2.0), 1.0);

  // Il boccone.
  if (uQ.x > -1.0 && uQ.x < 26.5) r = U(r, vec2(length(p - bolusPos()) - 0.72, 3.0));

  if (uP.x < 0.5) {
    // Trachea con anelli, e bronchi principali: davanti all'esofago.
    float tr = sdCapsule(p, vec3(0.0, 15.2, 0.6), vec3(0.0, 4.2, 0.4), 1.0);
    tr -= 0.07 * smoothstep(0.25, 0.0, abs(fract(p.y / 0.75) - 0.5) - 0.1) * smoothstep(-0.2, 0.4, p.z - 0.4);
    tr = min(tr, sdCapsule(p, vec3(0.0, 4.2, 0.4), vec3(-2.6, 1.3, 0.3), 0.72));
    tr = min(tr, sdCapsule(p, vec3(0.0, 4.2, 0.4), vec3(3.9, 2.2, 0.0), 0.6));
    r = U(r, vec2(tr, 4.0));
    // Aorta: l'arco passa sopra il bronco sinistro, poi scende a sinistra e dietro l'esofago.
    float ao = sdBezier(p, vec3(0.5, 2.8, 2.2), vec3(-0.2, 8.6, 1.0), vec3(2.2, 7.0, -2.6)).x - 1.25;
    ao = min(ao, sdBezier(p, vec3(2.2, 7.0, -2.6), vec3(2.4, -1.0, -3.8), vec3(1.0, -12.0, -3.4)).x - 1.15);
    r = U(r, vec2(ao, 5.0));
    // Diaframma: una lamina con lo iato esofageo e lo iato aortico.
    float surf = -8.6 - 0.02 * (p.x * p.x + (p.z + 0.5) * (p.z + 0.5));
    float dia = max(abs(p.y - surf) - 0.3, length(vec2(p.x / 7.5, (p.z + 0.8) / 6.0)) - 1.0);
    dia = max(dia, -(length(p.xz - vec2(1.75, -0.35)) - 1.45));
    dia = max(dia, -(length(p.xz - vec2(1.3, -3.4)) - 1.35));
    r = U(r, vec2(dia, 6.0));
  }
  return r;
}

vec4 material(float m, vec3 p, vec3 n) {
  if (m < 1.5) return vec4(vec3(0.62, 0.3, 0.27) * (0.9 + 0.2 * noise(p * 3.0)), 0.6);   // esofago
  if (m < 2.5) return vec4(0.66, 0.4, 0.34, 0.6);                                        // stomaco
  if (m < 3.5) return vec4(0.72, 0.55, 0.3, 0.4);                                        // boccone
  if (m < 4.5) return vec4(0.86, 0.78, 0.72, 0.55);                                      // trachea
  if (m < 5.5) return vec4(0.64, 0.07, 0.06, 0.7);                                       // aorta
  if (m < 6.5) return vec4(0.42, 0.13, 0.11, 0.45);                                      // diaframma
  return vec4(0.9, 0.72, 0.7, 0.35);                                                     // mucosa
}

vec3 cutColor(vec3 p, vec2 o) {
  if (o.y > 3.5 && o.y < 4.5) return vec3(0.92, 0.88, 0.82);
  if (o.y > 4.5 && o.y < 5.5) return o.x > -0.2 ? vec3(0.9, 0.8, 0.76) : vec3(0.45, 0.05, 0.05);
  if (o.y > 5.5 && o.y < 6.5) return vec3(0.5, 0.15, 0.13);
  if (o.y > 2.5 && o.y < 3.5) return vec3(0.7, 0.52, 0.28);
  // Parete: muscolare rossa all'esterno, mucosa chiara (epitelio pavimentoso) all'interno.
  float depth = -o.x;
  return mix(vec3(0.7, 0.24, 0.22), vec3(0.93, 0.8, 0.78), smoothstep(0.35, 0.45, depth));
}
`;

  const Es = (window.BodyOrgans = window.BodyOrgans || { list: {} });
  Es.list.esofago = {
    name: 'Esofago',
    kicker: 'Anatomia procedurale · l’esofago',
    title: 'Esofago',
    tagline: 'Un tubo muscolare di circa 25 centimetri che non si limita a far cadere il cibo: lo spinge con un’onda di contrazione, tanto che si può deglutire anche a testa in giù. Premi “Deglutisci”.',
    hint: 'Premi “Deglutisci” e segui il boccone · il taglio coronale mostra la parete e il lume',
    formula:
      '<div>t = L ⁄ v ≈ 25 cm ⁄ 3,5 cm/s ≈ 7 s</div>' +
      '<div>r(s, t) = r<sub>0</sub>(s) − a · e<sup>−((s − vt) ⁄ w)<sup>2</sup></sup></div>',
    how:
      '<p>Scala reale in centimetri. Si guarda il paziente di fronte, un po’ di lato.</p>' +
      '<ol>' +
      '<li><strong>Percorso.</strong> Tre curve di Bézier: il tratto cervicale dietro la trachea, quello toracico accanto all’aorta, quello addominale che attraversa il diaframma ed entra nello stomaco.</li>' +
      '<li><strong>Tre restringimenti.</strong> Lo sfintere superiore, il punto in cui l’arco aortico e il bronco sinistro lo incrociano, lo sfintere inferiore nel diaframma: sono i punti in cui un boccone troppo grande tende a fermarsi.</li>' +
      '<li><strong>Peristalsi.</strong> Il raggio del tubo dipende dalla posizione e dal tempo (la seconda formula): davanti al boccone la parete si dilata, dietro si stringe un anello di contrazione che viaggia a pochi centimetri al secondo. All’arrivo lo sfintere inferiore si rilascia.</li>' +
      '<li><strong>Parete.</strong> A riposo l’esofago è collassato e il lume, in sezione, è una stella di pieghe; fuori c’è lo strato muscolare, dentro una mucosa chiara e resistente.</li>' +
      '</ol>',
    center: [0.8, 1.5, -1.0],
    bound: 17,
    camera: { yaw: -2.35, pitch: 0.1, dist: 44 },
    cutStart: { coronale: -1.0, sagittale: -0.3, assiale: 3.0 },
    labels: [
      { t: 'Sfintere esofageo superiore', p: [-0.7, 14.9, -2.3], n: [-0.6, 0, -0.8] },
      { t: 'Trachea', p: [0.0, 10.5, 1.6], n: [0, 0, 1], when: (st) => st.p[0] < 0.5 },
      { t: 'Arco aortico', p: [0.0, 8.6, 2.2], n: [0, 0.5, 0.85], when: (st) => st.p[0] < 0.5 },
      { t: 'Restringimento aortico-bronchiale', p: [-0.5, 4.5, -2.8], n: [-0.7, 0, -0.7] },
      { t: 'Aorta discendente', p: [2.4, -2.0, -4.9], n: [0.2, 0, -1], when: (st) => st.p[0] < 0.5 },
      { t: 'Diaframma', p: [-5.0, -9.1, -3.0], n: [-0.3, 0.6, -0.7], when: (st) => st.p[0] < 0.5 },
      { t: 'Sfintere esofageo inferiore', p: [0.8, -8.0, -0.9], n: [-0.6, 0, -0.8] },
      { t: 'Stomaco', p: [6.0, -13.0, -2.8], n: [0.2, 0, -1] },
    ],
    stats: [
      ['Lunghezza', '≈ 25 cm'],
      ['Onda peristaltica', (st) => `${st.speed.toFixed(1)} cm/s`],
      ['Tempo di transito', (st) => `≈ ${(LEN / st.speed).toFixed(0)} s`],
      ['Boccone', (st) => (st.q[0] < 0 ? 'in attesa' : st.q[0] < LEN ? `a ${Math.round(st.q[0])} cm` : 'nello stomaco')],
    ],
    glsl: GLSL,

    setup(ui, st) {
      st.speed = 3.5;
      st.q[0] = -5;
      ui.actions([{ id: 'swallow', label: 'Deglutisci', primary: true, onClick: () => { st.q[0] = 0; } }]);
      ui.slider({ id: 'pspeed', label: 'Velocità dell’onda peristaltica', min: 1, max: 8, step: 0.1, value: st.speed, format: (v) => `${v.toFixed(1)} cm/s`, onInput: (v) => (st.speed = v) });
      ui.toggle({ id: 'alone', label: 'Solo l’esofago', value: false, onChange: (v) => (st.p[0] = v ? 1 : 0) });
      return {
        tick(dt) {
          if (st.q[0] >= 0 && st.q[0] < LEN + 2) st.q[0] += dt * st.speed;
          else if (st.q[0] >= LEN + 2) st.q[0] = -5;
        },
      };
    },
  };
})();
