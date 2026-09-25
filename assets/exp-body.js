/* Corpo — volo dentro un vaso sanguigno in raymarching. Scala reale: 1 unità = 1 micrometro.
   Vaso piegato lungo una curva, pareti di cellule endoteliali, globuli rossi con il profilo
   di Evans–Fung ripetuti nello spazio, flusso di Poiseuille pulsato dal battito cardiaco. */
(function () {
  'use strict';

  const VS = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

  const FS = `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uCam;
uniform mat3 uRot;
uniform float uFlow;      // µm percorsi dal sangue al centro del vaso
uniform float uBeat;      // fase del battito, in battiti
uniform float uR0;        // raggio del vaso a riposo, µm
uniform float uDensity;   // probabilità che una cella dello spazio contenga un globulo rosso
uniform float uLeuko;     // 1 = globuli bianchi presenti
uniform float uMode;      // 0 endoscopio, 1 microscopio elettronico
uniform float uSeed;

const float TAU = 6.2831853;
const float CELL = 10.0;  // lato delle celle di ripetizione dei globuli rossi, µm
vec3 gAux;                // materiale e parametri dell'ultimo punto valutato
float gBound;             // distanza dal bordo della cella di ripetizione: limita il passo, non è una superficie

// Hash senza seno (Dave Hoskins): stabili anche con coordinate grandi.
float hash11(float p) { p = fract(p * 0.1031 + uSeed * 0.0137); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031 + uSeed * 0.0137); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3) { p3 = fract(p3 * 0.1031 + uSeed * 0.0137); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973) + uSeed * 0.0137); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
vec3 hash33(vec3 p3) { p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973) + uSeed * 0.0137); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yxx) * p3.zyx); }

float noise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
float smin(float a, float b, float k) { float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }
float smax(float a, float b, float k) { return -smin(-a, -b, k); }

// ---------- battito e forma del vaso ----------
float systole(float ph) {
  ph = fract(ph);
  return 1.5 * smoothstep(0.0, 0.06, ph) * exp(-ph * 7.0) + 0.35 * smoothstep(0.26, 0.32, ph) * exp(-max(ph - 0.3, 0.0) * 9.0);
}

vec2 path(float z) {
  return vec2(16.0 * sin(z * 0.010 + uSeed) + 6.0 * sin(z * 0.023 + 1.3 + uSeed * 2.0),
              12.0 * cos(z * 0.008 + uSeed * 0.5) + 5.0 * sin(z * 0.019 + 0.4 + uSeed));
}

float vesselR(float z) {
  return uR0 * (1.0 + 0.06 * systole(uBeat - z * 0.0004)) + 1.5 * sin(z * 0.013 + uSeed * 3.0);
}

// Diramazione laterale ogni 320 µm: un secondo tubo che parte in avanti e verso l'esterno.
float branch(vec3 q) {
  const float P = 320.0;
  float k = floor(q.z / P);
  float ang = hash11(k * 3.7 + 11.0) * TAU;
  vec3 a = normalize(vec3(cos(ang), sin(ang), 0.9));
  vec3 lp = vec3(q.xy, q.z - (k + 0.5) * P);
  float t = max(dot(lp, a), 0.0);
  return uR0 * 0.5 - length(lp - a * t);
}

// Cellule endoteliali: Voronoi allungato nel verso del flusso, periodico attorno al vaso.
vec2 endothelium(vec2 x) {
  vec2 n = floor(x), f = fract(x);
  float F1 = 8.0, F2 = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(i, j);
      vec2 cell = n + g;
      cell.x = mod(cell.x, 12.0);
      vec2 r = g + hash22(cell) * 0.8 + 0.1 - f;
      float d = dot(r, r);
      if (d < F1) { F2 = F1; F1 = d; } else if (d < F2) { F2 = d; }
    }
  }
  F1 = sqrt(F1);
  return vec2(F1, sqrt(F2) - F1);
}

// ---------- cellule del sangue ----------
// Globulo rosso: toro + disco sottile raccordati. Diametro 7,8 µm, 2,6 µm al bordo, 0,9 µm al centro
// (le misure del profilo di Evans–Fung).
float sdRBC(vec3 p, out float rr) {
  vec2 q = vec2(length(p.xz), p.y);
  rr = q.x;
  float torus = length(q - vec2(2.65, 0.0)) - 1.28;
  float disc = length(vec2(q.x - min(q.x, 2.6), q.y)) - 0.45;
  return smin(torus, disc, 0.6);
}

vec4 leukoCenter(float z) {
  const float P = 240.0;
  float zz = z - uFlow * 0.12;
  float k = floor(zz / P);
  float ang = hash11(k * 1.7 + 4.0) * TAU;
  float present = step(0.3, hash11(k * 5.3 + 1.0)) * uLeuko;
  float rr = uR0 - 7.5;
  return vec4(cos(ang) * rr, sin(ang) * rr, (k + 0.5) * P + uFlow * 0.12, present);
}

// Globulo bianco: sfera increspata che rotola lungo la parete.
float leuko(vec3 q, vec3 c) {
  vec3 lp = q - c;
  float ds = length(lp) - 6.3;
  if (ds > 2.0) return ds;
  vec2 u = normalize(c.xy);
  vec2 ab = rot(-uFlow * 0.12 / 6.3) * vec2(dot(lp.xy, u), lp.z);
  vec3 rp = vec3(ab.x, dot(lp.xy, vec2(-u.y, u.x)), ab.y);
  float n = noise(rp * 1.4) * 0.6 + noise(rp * 3.1) * 0.3;
  return ds - n * 0.9 + 0.35;
}

// Globuli rossi ripetuti in una griglia di celle: ogni colonna scorre alla velocità di Poiseuille.
// Restituisce la distanza dal globulo della cella corrente; in gBound lascia la distanza dal bordo
// della cella, oltre il quale potrebbe esserci il globulo vicino.
float rbcField(vec3 q, vec4 lc, out float rr) {
  rr = 0.0;
  float tw = q.z * 0.006;                       // leggera torsione: niente corsie rigide
  vec2 xy = rot(tw) * q.xy;
  vec2 col = floor(xy / CELL);
  vec2 cc = (col + 0.5) * CELL;
  vec2 lxy = xy - cc;
  float bxy = CELL * 0.5 - max(abs(lxy.x), abs(lxy.y));
  float rc = length(cc);
  gBound = bxy;
  if (rc > uR0 - 6.6) return 1e5;              // strato di plasma vicino alla parete
  float sp = 1.0 - rc * rc / (uR0 * uR0);
  float off = hash12(col + 3.1) * CELL;
  float zz = q.z - uFlow * sp + off;
  float zi = floor(zz / CELL);
  float lz = zz - (zi + 0.5) * CELL;
  gBound = min(bxy, CELL * 0.5 - abs(lz));
  vec3 h = hash33(vec3(col, zi) + 0.37);
  if (h.x > uDensity) return 1e5;
  if (lc.w > 0.5) {
    float cz = (zi + 0.5) * CELL + uFlow * sp - off;
    vec3 center = vec3(rot(-cz * 0.006) * cc, cz);
    if (length(center - lc.xyz) < 11.0) return 1e5;
  }
  vec3 lp = vec3(lxy, lz) - (h - 0.5) * 0.5;
  lp.yz = rot(h.y * TAU + uTime * (h.z - 0.5) * 0.9) * lp.yz;
  lp.xy = rot(h.z * TAU + uTime * (h.y - 0.5) * 0.7) * lp.xy;
  return sdRBC(lp, rr);
}

float map(vec3 p) {
  vec3 q = vec3(p.xy - path(p.z), p.z);
  float dw = vesselR(q.z) - length(q.xy);       // positivo dentro il vaso
  dw = smax(dw, branch(q), 5.0);
  float nuc = 0.0, groove = 0.0;
  if (dw < 4.0) {
    vec2 e = endothelium(vec2(atan(q.y, q.x) / TAU * 12.0, q.z / 38.0));
    nuc = exp(-e.x * e.x * 10.0);
    groove = 1.0 - smoothstep(0.0, 0.07, e.y);
    dw += groove * 0.35 - nuc * 1.4 + (noise(q * 0.18) - 0.5) * 1.2;
  }
  float d = dw;
  gAux = vec3(0.0, nuc, groove);
  gBound = 1e5;
  vec4 lc = leukoCenter(q.z);
  float rr;
  float dc = rbcField(q, lc, rr);
  if (dc < d) { d = dc; gAux = vec3(1.0, rr, 0.0); }
  if (lc.w > 0.5) {
    float dl = leuko(q, lc.xyz);
    if (dl < d) { d = dl; gAux = vec3(2.0, 0.0, 0.0); }
  }
  return d;
}

vec3 calcNormal(vec3 p, float t) {
  float e = 0.004 + t * 0.0006;
  const vec2 k = vec2(1.0, -1.0);
  return normalize(k.xyy * map(p + k.xyy * e) + k.yyx * map(p + k.yyx * e) +
                   k.yxy * map(p + k.yxy * e) + k.xxx * map(p + k.xxx * e));
}

vec3 shade(vec3 p, vec3 n, vec3 rd, vec3 ro, vec3 aux) {
  vec3 V = -rd;
  float ao = clamp(0.35 + 0.65 * map(p + n * 1.2) / 1.2, 0.0, 1.0);
  ao *= clamp(0.5 + 0.5 * map(p + n * 3.0) / 3.0, 0.0, 1.0);

  if (uMode > 0.5) {
    // Microscopio elettronico: gli spigoli emettono più elettroni secondari, quindi appaiono più chiari.
    float edge = pow(1.0 - abs(dot(n, V)), 1.6);
    float top = max(dot(n, normalize(uRot * vec3(0.3, 1.0, -0.2))), 0.0);
    float b = 0.1 + 0.6 * edge + 0.35 * top;
    vec3 tint = aux.x < 0.5 ? vec3(0.62, 0.58, 0.53) : aux.x < 1.5 ? vec3(0.95, 0.17, 0.15) : vec3(0.97, 0.84, 0.33);
    return tint * b * 1.5 * ao;
  }

  // Endoscopio: una lampada montata sulla sonda, poco sopra l'obiettivo.
  vec3 lpos = ro + uRot * vec3(0.0, 1.5, 0.0);
  vec3 L = lpos - p;
  float dl = length(L);
  L /= dl;
  float att = 1.0 / (1.0 + dl * dl * 0.0009);
  float ndl = dot(n, L);
  float wrap = max((ndl + 0.45) / 1.45, 0.0);
  vec3 H = normalize(L + V);
  float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);

  vec3 alb, sss;
  float gloss;
  if (aux.x < 0.5) {
    alb = mix(vec3(0.72, 0.3, 0.28), vec3(0.52, 0.2, 0.33), aux.y * 0.8) * (1.0 - aux.z * 0.35);
    sss = vec3(0.9, 0.25, 0.15);
    gloss = 60.0;
  } else if (aux.x < 1.5) {
    float thin = 1.0 - smoothstep(0.6, 2.4, aux.y);
    alb = mix(vec3(0.55, 0.03, 0.03), vec3(0.85, 0.16, 0.12), thin * 0.6);
    sss = vec3(1.0, 0.12, 0.06);
    gloss = 90.0;
  } else {
    alb = vec3(0.86, 0.78, 0.74);
    sss = vec3(0.9, 0.7, 0.65);
    gloss = 30.0;
  }
  vec3 col = alb * wrap * wrap * vec3(1.0, 0.92, 0.85) * 2.4;
  col += sss * alb * pow(clamp(1.0 - ndl, 0.0, 1.0), 2.0) * 0.25;
  col += vec3(1.0, 0.9, 0.85) * pow(max(dot(n, H), 0.0), gloss) * 0.55;
  col += alb * fres * 0.35;
  return col * att * ao + alb * 0.015;
}

vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }

void main() {
  vec2 uv = (2.0 * gl_FragCoord.xy - uRes) / uRes.y;
  vec3 ro = uCam;
  vec3 rd = normalize(uRot * vec3(uv, 1.35));

  float t = 0.0;
  bool hit = false;
  for (int i = 0; i < 240; i++) {
    float d = map(ro + rd * t);
    if (d < 0.003 * t + 0.01) { hit = true; break; }
    // Un globulo della cella vicina resta ad almeno 0,6 µm dal bordo comune (raggio 3,9 + spostamento ≤ 0,45).
    t += min(d, gBound + 0.6) * 0.8;
    if (t > 320.0) break;
  }

  bool sem = uMode > 0.5;
  vec3 fogCol = sem ? vec3(0.0) : vec3(0.045, 0.006, 0.008);
  vec3 col = fogCol;
  if (hit) {
    vec3 p = ro + rd * t;
    map(p);
    vec3 aux = gAux;
    col = shade(p, calcNormal(p, t), rd, ro, aux);
  }
  col = sem ? col * exp(-t * 0.004) : mix(fogCol, col, exp(-t * 0.011));

  col = aces(col * 1.1);
  col = pow(col, vec3(1.0 / 2.2));
  vec2 q = gl_FragCoord.xy / uRes;
  col *= 0.35 + 0.65 * pow(16.0 * q.x * q.y * (1.0 - q.x) * (1.0 - q.y), 0.2);
  float grain = fract(sin(dot(gl_FragCoord.xy + fract(uTime) * 91.0, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  col += grain * (sem ? 0.035 : 1.0 / 255.0);
  outColor = vec4(col, 1.0);
}`;

  // ---------- le stesse funzioni in JavaScript, per telecamera e strumenti ----------
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  function systole(ph) {
    ph -= Math.floor(ph);
    return 1.5 * smooth(0, 0.06, ph) * Math.exp(-ph * 7) + 0.35 * smooth(0.26, 0.32, ph) * Math.exp(-Math.max(ph - 0.3, 0) * 9);
  }
  function path(z, seed) {
    return [
      16 * Math.sin(z * 0.01 + seed) + 6 * Math.sin(z * 0.023 + 1.3 + seed * 2),
      12 * Math.cos(z * 0.008 + seed * 0.5) + 5 * Math.sin(z * 0.019 + 0.4 + seed),
    ];
  }
  // Elettrocardiogramma stilizzato: onda P, complesso QRS, onda T (fase 0 = picco R).
  function ecg(ph) {
    const x = ph - Math.round(ph);
    const g = (c, w, a) => a * Math.exp(-((x - c) ** 2) / (2 * w * w));
    return g(-0.2, 0.025, 0.12) + g(-0.03, 0.008, -0.12) + g(0, 0.011, 1) + g(0.03, 0.01, -0.25) + g(0.28, 0.045, 0.3);
  }

  const R0 = 25;          // raggio a riposo: vaso di 50 µm
  const SLOW = 100;       // il flusso è mostrato 100 volte più lento del reale
  const ACCENT = '#ff6b81';

  // Scene della scheda: il vaso visto dall'interno e gli organi (definiti in organ-*.js).
  const SCENES = [
    ['cuore', 'Cuore'],
    ['cervello', 'Cervello'],
    ['fegato', 'Fegato'],
    ['reni', 'Reni'],
    ['intestino', 'Intestino'],
    ['vaso', 'Dentro un vaso sanguigno'],
  ];
  let scene = 'cuore';
  try { scene = localStorage.getItem('corpo-scena') || scene; } catch (e) { /* memoria del browser non disponibile */ }

  Lab.register({
    id: 'corpo',
    name: 'Corpo',
    accent: ACCENT,
    kicker: 'Anatomia procedurale · raymarching GLSL',
    title: 'Corpo',
    tagline: 'Un volo dentro un vaso sanguigno di 50 micrometri, più sottile di un capello. Pareti, globuli rossi e globuli bianchi sono calcolati da formule, pixel per pixel, con le misure reali delle cellule.',
    hint: 'Trascina per guardarti intorno · il flusso è rallentato 100 volte, il battito è in tempo reale',
    stack: 'JavaScript + GLSL + Web Audio',
    formula:
      '<div>v(r) = v<sub>max</sub> (1 − r<sup>2</sup> ⁄ R<sup>2</sup>)</div>' +
      '<div>T(ρ) = √(1 − ρ<sup>2</sup>) (C<sub>0</sub> + C<sub>1</sub>ρ<sup>2</sup> + C<sub>2</sub>ρ<sup>4</sup>)</div>',
    how:
      '<p>Scala reale: un’unità della scena è un micrometro. Il flusso è rallentato 100 volte per poterlo seguire con gli occhi, il battito no.</p>' +
      '<ol>' +
      '<li><strong>Il vaso.</strong> Un tubo definito da una funzione di distanza e piegato lungo una curva (<em>domain warping</em>). A ogni sistole il raggio si dilata di qualche punto percentuale; ogni 320 µm si apre una diramazione.</li>' +
      '<li><strong>La parete.</strong> È tappezzata di cellule endoteliali allungate nel verso del flusso, come nei vasi veri: un diagramma di Voronoi stirato, con i nuclei in rilievo verso l’interno.</li>' +
      '<li><strong>I globuli rossi.</strong> La forma ricalca il profilo di Evans–Fung, la seconda formula qui sopra: 7,8 µm di diametro, 2,6 µm di spessore al bordo, meno di 1 µm al centro. Una sola formula ne disegna migliaia: lo spazio è diviso in celle e ognuna riceve presenza, posizione e rotazione pseudo-casuali (<em>domain repetition</em>).</li>' +
      '<li><strong>Il flusso.</strong> Profilo parabolico di Poiseuille: al centro il sangue corre, vicino alle pareti quasi si ferma, e lungo la parete resta uno strato di plasma quasi senza cellule. Ogni sistole dà una spinta.</li>' +
      '<li><strong>I globuli bianchi.</strong> Più grandi (circa 12 µm) e increspati, rotolano lentamente lungo la parete, come fanno soprattutto nelle venule per pattugliare i tessuti.</li>' +
      '<li><strong>La luce.</strong> In modalità endoscopio una lampada sulla sonda illumina le superfici bagnate e il plasma assorbe la luce con la distanza. In modalità microscopio elettronico la luminosità dipende dall’inclinazione delle superfici, come nelle immagini SEM, con i falsi colori tipici.</li>' +
      '</ol>',

    mount(stage, ui) {
      const available = SCENES.filter(([id]) => id === 'vaso' || (window.BodyOrgans && BodyOrgans.list[id]));
      if (!available.some(([id]) => id === scene)) scene = 'vaso';
      ui.select({
        id: 'scene', label: 'Cosa esplorare', value: scene,
        options: available.map(([value, label]) => ({ value, label })),
        onChange: (v) => {
          scene = v;
          try { localStorage.setItem('corpo-scena', v); } catch (e) { /* memoria del browser non disponibile */ }
          Lab.remount();
        },
      });
      return scene === 'vaso' ? mountVessel(stage, ui) : BodyOrgans.mount(stage, ui, scene);
    },
  });

  // ---------- il volo dentro il vaso sanguigno ----------
  function mountVessel(stage, ui) {
    const canvas = document.createElement('canvas');
    stage.append(canvas);
    const gl = canvas.getContext('webgl2', { alpha: false, depth: false, antialias: false, powerPreference: 'high-performance' });
    if (!gl) return Lab.fail(stage, 'Il browser non supporta WebGL2.');

    function compile(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
    gl.bindAttribLocation(prog, 0, 'aPos');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const U = {};
    for (const n of ['uRes', 'uTime', 'uCam', 'uRot', 'uFlow', 'uBeat', 'uR0', 'uDensity', 'uLeuko', 'uMode', 'uSeed']) U[n] = gl.getUniformLocation(prog, n);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);

    // ---------- stato ----------
    const st = {
      bpm: 72, blood: 4, probe: 2.5, density: 0.55, leuko: true, mode: 0,
      seed: Math.random() * 50,
      z: 0, flow: 0, beat: 0, lastBeat: 0,
      yawOff: 0, pitchOff: 0, dragging: false, lastDrag: 0,
      scale: 0.6, sound: false,
    };

    function resize() {
      if (!canvas.clientWidth || !canvas.clientHeight) return;
      const w = Math.max(1, Math.round(canvas.clientWidth * st.scale));
      const h = Math.max(1, Math.round(canvas.clientHeight * st.scale));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    }

    // ---------- suono del cuore: primo e secondo tono ----------
    let actx = null;
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
    function heartSound() {
      if (!actx || !st.sound) return;
      const t = actx.currentTime + 0.01;
      thump(t, 50, 0.9);
      thump(t + 0.1 + 0.25 * (60 / st.bpm), 64, 0.55);
    }

    // ---------- input: guardarsi intorno ----------
    let px = 0, py = 0;
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      st.dragging = true; px = e.clientX; py = e.clientY;
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!st.dragging) return;
      st.yawOff += (e.clientX - px) * 0.0045;
      st.pitchOff = Math.max(-1.2, Math.min(1.2, st.pitchOff - (e.clientY - py) * 0.0045));
      px = e.clientX; py = e.clientY;
      st.lastDrag = performance.now();
    });
    const endDrag = () => { st.dragging = false; st.lastDrag = performance.now(); };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    // ---------- interfaccia ----------
    ui.slider({ id: 'bpm', label: 'Battito cardiaco', min: 40, max: 180, step: 1, value: st.bpm, format: (v) => `${v} bpm`, onInput: (v) => (st.bpm = v) });
    ui.slider({ id: 'blood', label: 'Velocità del sangue (reale)', min: 0.5, max: 8, step: 0.1, value: st.blood, format: (v) => `${v.toFixed(1)} mm/s`, onInput: (v) => (st.blood = v) });
    ui.slider({ id: 'probe', label: 'Velocità della sonda (reale)', min: 0, max: 8, step: 0.1, value: st.probe, format: (v) => `${v.toFixed(1)} mm/s`, onInput: (v) => (st.probe = v) });
    ui.slider({ id: 'dens', label: 'Densità di globuli rossi', min: 0.1, max: 0.9, step: 0.01, value: st.density, format: (v) => Math.round(v * 100) + '%', onInput: (v) => (st.density = v) });
    ui.select({
      id: 'mode', label: 'Strumento di osservazione', value: '0',
      options: [{ value: '0', label: 'Endoscopio · colori naturali' }, { value: '1', label: 'Microscopio elettronico · falsi colori' }],
      onChange: (v) => (st.mode = +v),
    });
    ui.toggle({ id: 'leuko', label: 'Globuli bianchi', value: st.leuko, onChange: (v) => (st.leuko = v) });
    ui.toggle({
      id: 'sound', label: 'Suono del battito', value: false,
      onChange: (v) => {
        st.sound = v;
        if (v && !actx) actx = new (window.AudioContext || window.webkitAudioContext)();
        if (actx) actx.resume();
      },
    });
    ui.actions([
      { id: 'seed', label: 'Nuovo vaso', primary: true, onClick: () => { st.seed = Math.random() * 50; } },
      { id: 'look', label: 'Guarda avanti', onClick: () => { st.yawOff = 0; st.pitchOff = 0; } },
    ]);

    const sBpm = ui.stat('Battito');
    const sDiam = ui.stat('Diametro del vaso');
    const sVel = ui.stat('Sangue al centro');
    const sDist = ui.stat('Percorso');
    const sFps = ui.stat('Fotogrammi/s');
    const sRes = ui.stat('Pixel calcolati');
    const ecgFig = ui.figure('Elettrocardiogramma, sincronizzato con la scena', 84);
    const profFig = ui.figure('Profilo di velocità nel vaso · Poiseuille', 112);

    function drawEcg() {
      const f = ecgFig.fit();
      const g = f.ctx, w = f.w, h = f.h;
      g.clearRect(0, 0, w, h);
      g.strokeStyle = '#1d212b';
      g.lineWidth = 1;
      for (let x = 0; x < w; x += 16) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, h); g.stroke(); }
      for (let y = 0; y < h; y += 16) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(w, y + 0.5); g.stroke(); }
      const span = 4;                                       // secondi mostrati
      const base = h * 0.68, amp = h * 0.52;
      g.strokeStyle = ACCENT;
      g.lineWidth = 1.6;
      g.lineJoin = 'round';
      g.beginPath();
      for (let x = 0; x <= w; x += 1) {
        const ph = st.beat - ((w - x) / w) * span * (st.bpm / 60);
        const y = base - ecg(ph) * amp;
        if (x) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.stroke();
      g.beginPath();
      g.arc(w - 1.5, base - ecg(st.beat) * amp, 3, 0, Math.PI * 2);
      g.fillStyle = ACCENT;
      g.fill();
    }

    function drawProfile(push) {
      const f = profFig.fit();
      const g = f.ctx, w = f.w, h = f.h;
      g.clearRect(0, 0, w, h);
      const top = 14, bot = h - 14, left = 56, right = w - 14;
      g.strokeStyle = '#7f8599';
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(left - 8, top); g.lineTo(right, top); g.moveTo(left - 8, bot); g.lineTo(right, bot); g.stroke();
      const n = 11, maxLen = right - left;
      g.strokeStyle = 'rgba(255,107,129,0.8)';
      g.fillStyle = 'rgba(255,107,129,0.8)';
      g.lineWidth = 1.4;
      const tips = [];
      for (let i = 0; i < n; i++) {
        const rn = (i / (n - 1)) * 2 - 1;                  // da −1 (parete) a +1 (parete)
        const y = top + ((rn + 1) / 2) * (bot - top);
        const len = maxLen * 0.78 * (1 - rn * rn) * push;
        tips.push([left + len, y]);
        if (len < 3) continue;
        g.beginPath(); g.moveTo(left, y); g.lineTo(left + len - 4, y); g.stroke();
        g.beginPath(); g.moveTo(left + len, y); g.lineTo(left + len - 6, y - 3); g.lineTo(left + len - 6, y + 3); g.closePath(); g.fill();
      }
      g.strokeStyle = '#e9ebf2';
      g.setLineDash([3, 3]);
      g.lineWidth = 1;
      g.beginPath();
      for (let i = 0; i <= 40; i++) {
        const rn = (i / 40) * 2 - 1;
        const x = left + maxLen * 0.78 * (1 - rn * rn) * push, y = top + ((rn + 1) / 2) * (bot - top);
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = '#7f8599';
      g.font = '500 9.5px "JetBrains Mono", Consolas, monospace';
      g.textBaseline = 'middle';
      g.fillText('parete', 0, top);
      g.fillText('centro', 0, (top + bot) / 2);
      g.fillText('parete', 0, bot);
    }

    // ---------- ciclo ----------
    resize();
    const stopObs = Lab.observeSize(canvas, resize);
    const fps = Lab.fpsMeter();
    const t0 = performance.now();
    let raf = 0, last = t0, ema = 16.7, frames = 0, lastAdapt = t0;

    function frame(now) {
      raf = requestAnimationFrame(frame);
      const rawDt = Math.max(0, now - last);
      last = Math.max(last, now);
      const dt = Math.min(rawDt / 1000, 0.1);
      frames++;

      ema += (rawDt - ema) * 0.08;
      if (frames > 40 && now - lastAdapt > 700) {
        if (ema > 26 && st.scale > 0.3) { st.scale = Math.max(0.3, st.scale * 0.85); resize(); lastAdapt = now; }
        else if (ema < 18.5 && st.scale < 1) { st.scale = Math.min(1, st.scale * 1.08); resize(); lastAdapt = now; }
      }

      // Battito in tempo reale; flusso e sonda rallentati 100 volte (mm/s → µm/s ÷ 100).
      const prevBeat = st.beat;
      st.beat += dt * (st.bpm / 60);
      if (Math.floor(st.beat) > Math.floor(prevBeat)) heartSound();
      const push = 0.75 + 0.5 * systole(st.beat);
      st.flow += ((st.blood * 1000) / SLOW) * push * dt;
      st.z += ((st.probe * 1000) / SLOW) * dt;

      // Telecamera sulla linea centrale del vaso, rivolta lungo la sua tangente.
      const [cx, cy] = path(st.z, st.seed);
      const [ax, ay] = path(st.z - 1, st.seed);
      const [bx, by] = path(st.z + 1, st.seed);
      let fx = (bx - ax) / 2, fy = (by - ay) / 2, fz = 1;
      const fl = Math.hypot(fx, fy, fz);
      fx /= fl; fy /= fl; fz /= fl;
      if (!st.dragging && now - st.lastDrag > 1800) {
        const k = Math.exp(-dt * 0.9);
        st.yawOff *= k;
        st.pitchOff *= k;
      }
      const yaw = Math.atan2(fx, fz) + st.yawOff;
      const pitch = Math.asin(fy) + st.pitchOff;
      const f = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
      const rl = Math.hypot(f[2], f[0]);
      const r = [f[2] / rl, 0, -f[0] / rl];
      const u = [f[1] * r[2] - f[2] * r[1], f[2] * r[0] - f[0] * r[2], f[0] * r[1] - f[1] * r[0]];

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(U.uRes, canvas.width, canvas.height);
      gl.uniform1f(U.uTime, (now - t0) / 1000);
      gl.uniform3f(U.uCam, cx, cy, st.z);
      gl.uniformMatrix3fv(U.uRot, false, [...r, ...u, ...f]);
      gl.uniform1f(U.uFlow, st.flow);
      gl.uniform1f(U.uBeat, st.beat);
      gl.uniform1f(U.uR0, R0);
      gl.uniform1f(U.uDensity, st.density);
      gl.uniform1f(U.uLeuko, st.leuko ? 1 : 0);
      gl.uniform1f(U.uMode, st.mode);
      gl.uniform1f(U.uSeed, st.seed);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      drawEcg();
      drawProfile(push);

      const fv = fps();
      if (frames % 8 === 0) {
        const diam = 2 * (R0 * (1 + 0.06 * systole(st.beat - st.z * 0.0004)) + 1.5 * Math.sin(st.z * 0.013 + st.seed * 3));
        sBpm(`${st.bpm} bpm`);
        sDiam(`${diam.toFixed(1)} µm`);
        sVel(`${(st.blood * push).toFixed(1)} mm/s`);
        sDist(st.z < 1000 ? `${Math.round(st.z)} µm` : `${(st.z / 1000).toFixed(2)} mm`);
        sFps(fv ? fv.toFixed(0) : '—');
        sRes(`${canvas.width}×${canvas.height} · ${Math.round(st.scale * 100)}%`);
      }
    }
    raf = requestAnimationFrame(frame);

    return {
      unmount() {
        cancelAnimationFrame(raf);
        stopObs();
        if (actx) actx.close().catch(() => {});
        const lose = gl.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
        canvas.remove();
      },
    };
  }
})();
