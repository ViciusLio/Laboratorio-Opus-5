/* Visualizzatore anatomico della scheda Corpo: vista orbitale, piano di taglio, etichette, luce da studio.
   Ogni organo (file organ-*.js) si registra in BodyOrgans.list e fornisce in GLSL:
     const vec3 CENTER; const float BOUND; const float STEP;
     vec2 organ(vec3 p)                    -> (distanza in cm, materiale)
     vec4 material(float m, vec3 p, vec3 n) -> colore + lucentezza della superficie
     vec3 cutColor(vec3 p)                 -> colore della sezione, dove il piano di taglio entra nell'organo */
(function () {
  'use strict';

  const VS = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

  const COMMON = `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uCam;
uniform mat3 uRot;
uniform vec3 uCutN;
uniform float uCut;
uniform float uBeat;
uniform vec4 uP;
uniform int uZero;   // vale sempre 0: impedisce al compilatore di srotolare i cicli (e di esplodere)
uniform vec4 uQ;     // altri parametri dell'organo (respiro, riempimento, ...)

// Kit anatomico: tubi e alberi generati in JavaScript e passati come dati, in una texture.
// Riga 0: punto a e raggio; riga 1: punto b e raggio; riga 2: la sfera che contiene ogni gruppo di 8 segmenti.
precision highp sampler2D;
uniform sampler2D uSegTex;
uniform int uSegN;

const float TAU = 6.2831853;
const float PI = 3.1415927;
float gM;      // materiale dell'ultimo punto valutato
vec4 gA;       // dati ausiliari lasciati dall'organo
float gCut;    // 1 se la superficie è la sezione del piano di taglio

float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec3 hash33(vec3 p3) { p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yxx) * p3.zyx); }

float noise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}

// Rumore a gradiente in [-1, 1]: i suoi zeri formano linee sinuose (solchi, pieghe).
float gnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  #define G(o) dot(hash33(i + o) * 2.0 - 1.0, f - o)
  return mix(mix(mix(G(vec3(0, 0, 0)), G(vec3(1, 0, 0)), u.x), mix(G(vec3(0, 1, 0)), G(vec3(1, 1, 0)), u.x), u.y),
             mix(mix(G(vec3(0, 0, 1)), G(vec3(1, 0, 1)), u.x), mix(G(vec3(0, 1, 1)), G(vec3(1, 1, 1)), u.x), u.y), u.z) * 1.6;
  #undef G
}

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
float smin(float a, float b, float k) { float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }
float smax(float a, float b, float k) { return -smin(-a, -b, k); }
vec2 U(vec2 a, vec2 b) { return a.x < b.x ? a : b; }
vec2 SU(vec2 a, vec2 b, float k) { return vec2(smin(a.x, b.x, k), a.x < b.x ? a.y : b.y); }
float dot2(vec3 v) { return dot(v, v); }

float sdEllipsoid(vec3 p, vec3 r) { float k0 = length(p / r), k1 = length(p / (r * r)); return k0 * (k0 - 1.0) / k1; }
float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
  vec3 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)) - r;
}
float sdRoundCone(vec3 p, vec3 a, vec3 b, float r1, float r2) {
  vec3 ba = b - a;
  float l2 = dot(ba, ba), rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1.0 / l2;
  vec3 pa = p - a;
  float y = dot(pa, ba), z = y - l2;
  float x2 = dot2(pa * l2 - ba * y), y2 = y * y * l2, z2 = z * z * l2;
  float k = sign(rr) * rr * rr * x2;
  if (sign(z) * a2 * z2 > k) return sqrt(x2 + z2) * il2 - r2;
  if (sign(y) * a2 * y2 < k) return sqrt(x2 + y2) * il2 - r1;
  return (sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}
float sdTorus(vec3 p, vec2 t) { return length(vec2(length(p.xz) - t.x, p.y)) - t.y; }

// Distanza da una curva di Bézier quadratica (Inigo Quilez): x = distanza, y = parametro t.
vec2 sdBezier(vec3 pos, vec3 A, vec3 B, vec3 C) {
  vec3 a = B - A, b = A - 2.0 * B + C + vec3(1e-4, 0.0, 0.0), c = a * 2.0, d = A - pos;
  float kk = 1.0 / dot(b, b), kx = kk * dot(a, b), ky = kk * (2.0 * dot(a, a) + dot(d, b)) / 3.0, kz = kk * dot(d, a);
  vec2 res;
  float p = ky - kx * kx, p3 = p * p * p, q = kx * (2.0 * kx * kx - 3.0 * ky) + kz, h = q * q + 4.0 * p3;
  if (h >= 0.0) {
    h = sqrt(h);
    vec2 x = (vec2(h, -h) - q) / 2.0;
    vec2 uv = sign(x) * pow(abs(x), vec2(1.0 / 3.0));
    float t = clamp(uv.x + uv.y - kx, 0.0, 1.0);
    res = vec2(dot2(d + (c + b * t) * t), t);
  } else {
    float z = sqrt(-p), v = acos(clamp(q / (p * z * 2.0), -1.0, 1.0)) / 3.0, m = cos(v), n = sin(v) * 1.732050808;
    vec3 t = clamp(vec3(m + m, -n - m, n - m) * z - kx, 0.0, 1.0);
    float dis = dot2(d + (c + b * t.x) * t.x);
    res = vec2(dis, t.x);
    dis = dot2(d + (c + b * t.y) * t.y);
    if (dis < res.x) res = vec2(dis, t.y);
  }
  return vec2(sqrt(res.x), res.y);
}

// Kit: punto più vicino su una Bézier, con tangente, e angolo attorno al tubo (per pieghe e bande).
vec2 bezierFrame(vec3 p, vec3 A, vec3 B, vec3 C, out vec3 Q, out vec3 T) {
  vec2 b = sdBezier(p, A, B, C);
  float t = b.y;
  Q = mix(mix(A, B, t), mix(B, C, t), t);
  T = normalize(2.0 * (1.0 - t) * (B - A) + 2.0 * t * (C - B) + vec3(0.0, 1e-5, 0.0));
  return b;
}
float tubeAngle(vec3 v, vec3 T) {
  vec3 n1 = normalize(cross(T, abs(T.z) < 0.9 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0)));
  return atan(dot(v, cross(T, n1)), dot(v, n1));
}
vec3 bezierAt(vec3 A, vec3 B, vec3 C, float t) { return mix(mix(A, B, t), mix(B, C, t), t); }

// Distanza dal segmento del kit più vicino (x) e suo indice (y). Si esaminano solo i gruppi la cui
// sfera è più vicina di 'dMax': oltre, basta sapere che la distanza è almeno dMax (passo sicuro).
vec2 segmentsWithin(vec3 p, float dMax) {
  float d = dMax, idx = -1.0;
  int ng = uSegN / 8;
  for (int g = uZero; g < 96; g++) {
    if (g >= ng) break;
    vec4 s = texelFetch(uSegTex, ivec2(g, 2), 0);
    if (length(p - s.xyz) - s.w > d) continue;
    for (int j = uZero; j < 8; j++) {
      int i = g * 8 + j;
      vec4 a = texelFetch(uSegTex, ivec2(i, 0), 0);
      if (a.w < 0.0) continue;
      vec4 b = texelFetch(uSegTex, ivec2(i, 1), 0);
      float e = sdRoundCone(p, a.xyz, b.xyz, a.w, b.w);
      if (e < d) { d = e; idx = float(i); }
    }
  }
  return vec2(d, idx);
}
vec2 segments(vec3 p) { return segmentsWithin(p, 1e5); }
`;

  const MAIN = `
vec2 gO;       // ultimo risultato grezzo di organ()

float map(vec3 p) {
  vec2 o = organ(p);
  gO = o;
  gM = o.y;
  float c = dot(p - CENTER, uCutN) - uCut;
  if (c > o.x) { gCut = 1.0; return c; }
  gCut = 0.0;
  return o.x;
}

vec3 tetra(int i) { return 0.5773 * (2.0 * vec3(float(((i + 3) >> 1) & 1), float((i >> 1) & 1), float(i & 1)) - 1.0); }

vec3 background(vec2 uv) {
  float r = length(uv * vec2(0.8, 1.0));
  return mix(vec3(0.085, 0.088, 0.11), vec3(0.03, 0.032, 0.042), smoothstep(0.0, 1.35, r));
}

vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }

void main() {
  vec2 uv = (2.0 * gl_FragCoord.xy - uRes) / uRes.y;
  vec3 ro = uCam;
  vec3 rd = normalize(uRot * vec3(uv, 2.2));
  vec3 col = background(uv);
  vec3 L1 = normalize(uRot * vec3(-0.55, 0.7, -0.45));
  float glowAcc = 0.0;
  bool hitAny = false;

  // Si cammina solo dentro la sfera che contiene l'organo.
  vec3 oc = ro - CENTER;
  float b = dot(oc, rd), h = b * b - dot(oc, oc) + BOUND * BOUND;
  if (h > 0.0) {
    h = sqrt(h);
    float t = max(-b - h, 0.0), tmax = -b + h;

    // Un unico ciclo, in fasi: marcia del raggio, quattro campioni per la normale, ombra morbida,
    // occlusione ambientale. map() compare in un solo punto del codice: su Windows il compilatore
    // di DirectX copia ogni funzione in ogni chiamata, e così l'organo viene compilato una volta sola.
    int phase = 0, k = 0;
    vec3 pos = ro + rd * t, p = pos, n = vec3(0.0);
    float isCut = 0.0, m = 0.0, sh = 1.0, ts = 0.1, occ = 0.0, occW = 1.0;
    vec4 aux = vec4(0.0);
    vec2 oHit = vec2(0.0);
    bool hit = false;
    for (int i = uZero; i < 280; i++) {
      float d = map(pos);
      if (phase == 0) {
#ifdef HAS_GLOW
        glowAcc += glowAt(pos, d);
#endif
        if (d < 0.0012 * t) {
          hit = true; p = pos;
          isCut = gCut; m = gM; aux = gA; oHit = gO;
          phase = 1; k = 0; pos = p + tetra(0) * 0.004;
        } else {
          t += d * STEP;
          if (t > tmax) break;
          pos = ro + rd * t;
        }
      } else if (phase == 1) {
        n += tetra(k) * d;
        k++;
        if (k < 4) pos = p + tetra(k) * 0.004;
        else { n = normalize(n); phase = 2; k = 0; pos = p + n * 0.02 + L1 * ts; }
      } else if (phase == 2) {
        sh = min(sh, 9.0 * d / ts);
        ts += clamp(d, 0.05, 0.8);
        k++;
        if (sh < 0.01 || ts > BOUND * 2.0 || k >= 24) { phase = 3; k = 1; pos = p + n * 0.15; }
        else pos = p + n * 0.02 + L1 * ts;
      } else {
        occ += (0.15 * float(k) - d) * occW;
        occW *= 0.65;
        k++;
        if (k > 4) break;
        pos = p + n * (0.15 * float(k));
      }
    }

    hitAny = hit;
    if (hit) {
      if (phase < 2) n = normalize(n + vec3(1e-4));
      sh = clamp(sh, 0.0, 1.0);
      occ = clamp(1.0 - 1.4 * occ, 0.0, 1.0);
      gA = aux;
      vec4 mat;
      float edge = 1.0;
      if (isCut > 0.5) {
        mat = vec4(cutColor(p, oHit), 0.08);
        edge = mix(0.35, 1.0, smoothstep(0.0, 0.12, -oHit.x));               // contorno della sezione
      } else {
        mat = material(m, p, n);
      }
      vec3 V = -rd;
      vec3 L2 = normalize(uRot * vec3(0.8, 0.05, -0.35));
      vec3 L3 = normalize(uRot * vec3(0.3, 0.45, 1.0));
      float d1 = max((dot(n, L1) + 0.35) / 1.35, 0.0);
      float d2 = max(dot(n, L2), 0.0);
      float d3 = pow(max(dot(n, L3), 0.0), 2.0);
      float fres = pow(1.0 - max(dot(n, V), 0.0), 4.0);
      float spec = pow(max(dot(n, normalize(L1 + V)), 0.0), 56.0) * mat.a * sh;
      vec3 c = mat.rgb * (vec3(1.0, 0.96, 0.9) * 1.3 * d1 * mix(0.3, 1.0, sh) + vec3(0.55, 0.6, 0.78) * 0.32 * d2 + vec3(0.3, 0.28, 0.34) * 0.3);
      c += mat.rgb * mat.rgb * pow(1.0 - max(dot(n, L1), 0.0), 2.0) * 0.25;
      c += vec3(1.0, 0.95, 0.9) * spec * 0.9;
      c += vec3(0.75, 0.82, 1.0) * d3 * (0.1 + 0.5 * fres) * 0.45;
      col = c * mix(1.0, occ, 0.7) * edge;
    }
  }

#ifdef HAS_GHOST
  // Sagoma trasparente (per il corpo intero): un secondo raymarching, solo sulla sagoma,
  // che ne disegna il contorno luminoso sopra quello che c'è dentro.
  if (h > 0.0 && ghostOn() > 0.5) {
    float gt = max(-b - h, 0.0), gmax = -b + h;
    bool ghit = false;
    for (int i = uZero; i < 72; i++) {
      float d = ghost(ro + rd * gt);
      if (d < 0.004 * gt) { ghit = true; break; }
      gt += d;
      if (gt > gmax) break;
    }
    if (ghit) {
      vec3 gp = ro + rd * gt;
      vec3 gn = vec3(0.0);
      for (int i = uZero; i < 4; i++) { vec3 e = tetra(i); gn += e * ghost(gp + e * 0.3); }
      gn = normalize(gn);
      float rim = pow(1.0 - abs(dot(gn, rd)), 2.2);
      col = ghostShade(col, hitAny, rim, gn);
    }
  }
#endif

#ifdef HAS_GLOW
  col = applyGlow(col, glowAcc);      // fibre sottili rese visibili dal loro alone (o dal loro tratto)
#endif

  col = aces(col * 0.95);
  col = pow(col, vec3(1.0 / 2.2));
  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  outColor = vec4(col, 1.0);
}`;

  const CUTS = {
    nessuno: null,
    coronale: [0, 0, 1],
    sagittale: [1, 0, 0],
    assiale: [0, 1, 0],
  };
  const UNIFORMS = ['uRes', 'uTime', 'uCam', 'uRot', 'uCutN', 'uCut', 'uBeat', 'uP', 'uZero', 'uQ', 'uSegTex', 'uSegN'];

  const BodyOrgans = window.BodyOrgans || (window.BodyOrgans = { list: {} });
  BodyOrgans.shaderParts = { VS, COMMON, MAIN };   // utile per il debug dalla console

  // ---------- kit anatomico, lato JavaScript: genera tubi e alberi a partire da parametri ----------
  const v3 = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
    len: (a) => Math.hypot(a[0], a[1], a[2]),
    norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  };
  const kit = {
    v3,
    MAXSEG: 768,
    rng(seed) {
      let a = seed >>> 0;
      return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },
    // Una spezzata di punti con i rispettivi raggi.
    polyline(points, radii) {
      const out = [];
      for (let i = 0; i + 1 < points.length; i++) out.push({ a: points[i], b: points[i + 1], ra: radii[i], rb: radii[i + 1] });
      return out;
    },
    // Albero ramificato: ogni ramo si divide in due; il raggio dei figli segue la legge di Murray
    // (r_figlio = r_padre · 2^(−1/3)) e la lunghezza si accorcia di un fattore costante.
    tree({ start, dir, length, radius, generations, angle = 0.6, angle0 = angle, shrink = 0.8, pullK = 0.9, rand = Math.random, inside = null }) {
      const out = [];
      const murray = Math.pow(2, -1 / 3);
      const grow = (a, d, len, r, gen, twist) => {
        let b = v3.add(a, v3.mul(d, len));
        if (inside) {
          const pull = inside(b);
          if (pull) { d = v3.norm(v3.add(d, v3.mul(pull, pullK))); b = v3.add(a, v3.mul(d, len)); }
        }
        const rc = r * murray;
        out.push({ a, b, ra: r, rb: gen + 1 < generations ? rc : r * 0.85, gen });
        if (gen + 1 >= generations) return;
        const ref = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
        const u = v3.norm(v3.cross(d, ref)), w = v3.cross(d, u);
        const phi = twist + (rand() - 0.5) * 0.8;
        const axis = v3.add(v3.mul(u, Math.cos(phi)), v3.mul(w, Math.sin(phi)));
        for (const sgn of [-1, 1]) {
          const th = (gen === 0 ? angle0 : angle) * (0.75 + 0.5 * rand());
          const nd = v3.norm(v3.add(v3.mul(d, Math.cos(th)), v3.mul(axis, sgn * Math.sin(th))));
          grow(b, nd, len * shrink * (0.85 + 0.3 * rand()), rc, gen + 1, twist + Math.PI / 2);
        }
      };
      grow(start, v3.norm(dir), length, radius, 0, rand() * Math.PI);
      return out;
    },
    // Richiamo verso il centro di un ellissoide per i rami che ne escono.
    ellipsoidPull(c, r) {
      return (p) => {
        const q = [(p[0] - c[0]) / r[0], (p[1] - c[1]) / r[1], (p[2] - c[2]) / r[2]];
        return v3.len(q) > 0.82 ? v3.norm(v3.sub(c, p)) : null;
      };
    },
    // Curva liscia (Catmull–Rom) attraverso i punti: 'k' suddivisioni per tratto.
    smooth(pts, k = 3) {
      if (pts.length < 3) return pts;
      const out = [];
      for (let i = 0; i + 1 < pts.length; i++) {
        const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
        for (let j = 0; j < k; j++) {
          const t = j / k, t2 = t * t, t3 = t2 * t;
          out.push([0, 1, 2].map((c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
        }
      }
      out.push(pts[pts.length - 1]);
      return out;
    },
    // Un nervo o un vaso: spezzata liscia con raggio che si assottiglia lungo il percorso.
    path(pts, r0, r1, k = 2) {
      const sp = kit.smooth(pts, k);
      const out = [];
      for (let i = 0; i + 1 < sp.length; i++) {
        out.push({ a: sp[i], b: sp[i + 1], ra: r0 + (r1 - r0) * (i / (sp.length - 1)), rb: r0 + (r1 - r0) * ((i + 1) / (sp.length - 1)) });
      }
      return out;
    },
    // Rami laterali lungo un percorso: ogni 'every' cm un piccolo albero, orientato a caso ma
    // trattenuto dentro l'arto dalla funzione 'inside'.
    branches(segs, { every = 7, length = 4.5, radius = 0.1, generations = 2, bias = [0, -1, 0], rand = Math.random, inside = null }) {
      const out = [];
      let acc = every * 0.5;
      for (const s of segs) {
        acc += v3.len(v3.sub(s.b, s.a));
        if (acc < every) continue;
        acc = 0;
        const along = v3.norm(v3.sub(s.b, s.a));
        const ref = Math.abs(along[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
        const u = v3.norm(v3.cross(along, ref)), w = v3.cross(along, u);
        const phi = rand() * Math.PI * 2;
        const side = v3.add(v3.mul(u, Math.cos(phi)), v3.mul(w, Math.sin(phi)));
        const dir = v3.norm(v3.add(v3.add(side, v3.mul(along, 0.6)), v3.mul(bias, 0.5)));
        out.push(...kit.tree({ start: s.b, dir, length, radius, generations, angle: 0.55, shrink: 0.75, pullK: 1.2, rand, inside }));
      }
      return out;
    },
    // Richiamo verso l'asse di un arto (segmento a-b) per i rami che si allontanano più di 'r'.
    limbPull(a, b, r) {
      return (p) => {
        const ab = v3.sub(b, a), t = Math.max(0, Math.min(1, (v3.len(ab) ? ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / (ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2]) : 0)));
        const c = v3.add(a, v3.mul(ab, t));
        return v3.len(v3.sub(p, c)) > r ? v3.norm(v3.sub(c, p)) : null;
      };
    },
    // Impacchetta i segmenti in una texture 768×3: gruppi di 8 con la sfera che li contiene.
    pack(segs) {
      const W = kit.MAXSEG;
      const n = Math.min(segs.length, W);
      const data = new Float32Array(W * 3 * 4);
      for (let i = 0; i < W; i++) data[i * 4 + 3] = -1;
      for (let i = 0; i < n; i++) {
        const s = segs[i];
        data.set([s.a[0], s.a[1], s.a[2], s.ra], i * 4);
        data.set([s.b[0], s.b[1], s.b[2], s.rb], (W + i) * 4);
      }
      for (let g = 0; g * 8 < n; g++) {
        const part = segs.slice(g * 8, Math.min(n, g * 8 + 8));
        let c = [0, 0, 0];
        for (const s of part) c = v3.add(c, v3.mul(v3.add(s.a, s.b), 0.5 / part.length));
        let rad = 0;
        for (const s of part) rad = Math.max(rad, v3.len(v3.sub(s.a, c)) + s.ra, v3.len(v3.sub(s.b, c)) + s.rb);
        data.set([c[0], c[1], c[2], rad], (2 * W + g) * 4);
      }
      return { data, width: W, n: Math.ceil(n / 8) * 8 };
    },
  };
  BodyOrgans.kit = kit;

  // ---------- un solo contesto WebGL per tutti gli organi, con i programmi già compilati ----------
  // Su Windows il GLSL viene tradotto per DirectX e compilato: può richiedere secondi.
  // Per questo la compilazione avviene in parallelo (se il browser lo consente), i programmi restano
  // in memoria e, appena un organo è pronto, gli altri vengono preparati in sottofondo.
  const cache = { canvas: null, gl: null, par: null, progs: {} };

  function context() {
    if (cache.gl && !cache.gl.isContextLost()) return cache.gl;
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2', { alpha: false, depth: false, antialias: false, powerPreference: 'high-performance' });
    if (!gl) return null;
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);
    Object.assign(cache, { canvas, gl, par: gl.getExtension('KHR_parallel_shader_compile'), progs: {} });
    return gl;
  }

  function program(id) {
    const gl = cache.gl;
    let e = cache.progs[id];
    if (e) return e;
    const shader = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const vs = shader(gl.VERTEX_SHADER, VS);
    const fs = shader(gl.FRAGMENT_SHADER, COMMON + BodyOrgans.list[id].glsl + MAIN);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, 'aPos');
    gl.linkProgram(prog);
    e = cache.progs[id] = { prog, vs, fs, U: null, error: null, started: performance.now() };
    e.ready = () => {
      if (e.U || e.error) return true;
      if (cache.par && !gl.getProgramParameter(prog, cache.par.COMPLETION_STATUS_KHR)) return false;
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        e.error = gl.getShaderInfoLog(fs) || gl.getProgramInfoLog(prog) || 'compilazione non riuscita';
        return true;
      }
      e.U = {};
      for (const n of UNIFORMS) e.U[n] = gl.getUniformLocation(prog, n);
      e.ms = Math.round(performance.now() - e.started);
      return true;
    };
    return e;
  }

  // Prepara in sottofondo gli organi non ancora compilati, uno alla volta.
  function warmUp() {
    if (!cache.par || !cache.gl || cache.gl.isContextLost()) return;
    const next = Object.keys(BodyOrgans.list).find((k) => !cache.progs[k]);
    if (!next) return;
    const e = program(next);
    const wait = () => (e.ready() ? setTimeout(warmUp, 300) : setTimeout(wait, 250));
    setTimeout(wait, 250);
  }

  BodyOrgans.mount = function (stage, ui, id) {
    const organ = BodyOrgans.list[id];
    ui.header({ kicker: organ.kicker, title: organ.title, tagline: organ.tagline, formula: organ.formula, how: organ.how });
    ui.hint(organ.hint || 'Trascina per girare intorno all’organo · rotella per avvicinarti');

    const gl = context();
    if (!gl) return Lab.fail(stage, 'Il browser non supporta WebGL2.');
    const canvas = cache.canvas;
    stage.append(canvas);
    const labelLayer = Lab.h('div', { class: 'organ-labels', 'aria-hidden': 'true' });
    stage.append(labelLayer);
    const loading = Lab.h('div', { class: 'organ-loading', role: 'status' },
      Lab.h('span', { class: 'organ-spinner', 'aria-hidden': 'true' }),
      Lab.h('span', {}, `Preparo il modello: ${organ.name.toLowerCase()}…`));
    stage.append(loading);
    const entry = program(id);
    const listen = new AbortController();
    const on = (type, fn, opts) => canvas.addEventListener(type, fn, { ...opts, signal: listen.signal });

    // ---------- stato condiviso con l'organo ----------
    const cam0 = organ.camera;
    const st = {
      yaw: cam0.yaw, pitch: cam0.pitch, dist: cam0.dist,
      auto: true, labels: true, cut: 'nessuno', cutPos: 0,
      beat: 0, p: [0, 0, 0, 0], q: [0, 0, 0, 0], scale: 0.6, segs: null,
      dragging: false, lastInput: -1e9,
    };

    // ---------- controlli ----------
    const hooks = organ.setup ? organ.setup(ui, st) || {} : {};
    const cutPosCtl = ui.slider({
      id: 'cutpos', label: 'Posizione del taglio', min: -organ.bound, max: organ.bound, step: 0.1, value: 0,
      format: (v) => (st.cut === 'nessuno' ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)} cm`),
      onInput: (v) => (st.cutPos = v),
    });
    ui.select({
      id: 'cut', label: 'Piano di taglio', value: 'nessuno',
      options: [
        { value: 'nessuno', label: 'Nessun taglio' },
        { value: 'coronale', label: 'Coronale · toglie la parte anteriore' },
        { value: 'sagittale', label: 'Sagittale · toglie il lato sinistro' },
        { value: 'assiale', label: 'Assiale · toglie la parte superiore' },
      ],
      onChange: (v) => {
        st.cut = v;
        st.cutPos = organ.cutStart ? organ.cutStart[v] ?? 0 : 0;
        cutPosCtl.set(st.cutPos);
      },
    });
    ui.toggle({ id: 'labels', label: 'Etichette anatomiche', value: true, onChange: (v) => { st.labels = v; labelLayer.hidden = !v; } });
    ui.toggle({ id: 'auto', label: 'Rotazione automatica', value: true, onChange: (v) => (st.auto = v) });
    ui.actions([{ id: 'front', label: 'Vista frontale', onClick: () => { st.yaw = cam0.yaw; st.pitch = cam0.pitch; st.dist = cam0.dist; } }]);

    const statSetters = (organ.stats || []).map(([label, value]) => [ui.stat(label), value]);
    const sFps = ui.stat('Fotogrammi/s');
    const sRes = ui.stat('Pixel calcolati');

    // ---------- etichette ----------
    const labels = (organ.labels || []).map((l) => {
      const el = Lab.h('div', { class: 'olabel' }, Lab.h('span', { class: 'olabel-dot' }), Lab.h('span', { class: 'olabel-text' }, l.t));
      labelLayer.append(el);
      return { ...l, el };
    });

    // ---------- input: orbita e zoom ----------
    let px = 0, py = 0;
    on('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      st.dragging = true; px = e.clientX; py = e.clientY;
      st.lastInput = performance.now();
    });
    on('pointermove', (e) => {
      if (!st.dragging) return;
      st.yaw -= (e.clientX - px) * 0.007;
      st.pitch = Math.max(-1.35, Math.min(1.35, st.pitch + (e.clientY - py) * 0.006));
      px = e.clientX; py = e.clientY;
      st.lastInput = performance.now();
    });
    const endDrag = () => { st.dragging = false; st.lastInput = performance.now(); };
    on('pointerup', endDrag);
    on('pointercancel', endDrag);
    on('wheel', (e) => {
      e.preventDefault();
      st.dist = Math.max(cam0.dist * 0.4, Math.min(cam0.dist * 1.8, st.dist * Math.exp(e.deltaY * 0.001)));
      st.lastInput = performance.now();
    }, { passive: false });

    function resize() {
      if (!canvas.clientWidth || !canvas.clientHeight) return;
      const w = Math.max(1, Math.round(canvas.clientWidth * st.scale));
      const h = Math.max(1, Math.round(canvas.clientHeight * st.scale));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    }

    // ---------- ciclo ----------
    resize();
    const stopObs = Lab.observeSize(canvas, resize);
    const fps = Lab.fpsMeter();
    const t0 = performance.now();
    const C = organ.center;
    let raf = 0, last = t0, ema = 16.7, frames = 0, lastAdapt = t0, U = null;

    function frame(now) {
      raf = requestAnimationFrame(frame);
      const rawDt = Math.max(0, now - last);
      last = Math.max(last, now);
      const dt = Math.min(rawDt / 1000, 0.1);

      // Finché lo shader non è pronto la pagina resta libera: si mostra solo l'avviso.
      if (!U) {
        if (!entry.ready()) return;
        if (entry.error) {
          cancelAnimationFrame(raf);
          loading.remove();
          Lab.fail(stage, 'Lo shader non si è compilato: ' + entry.error.slice(0, 300));
          return;
        }
        U = entry.U;
        gl.useProgram(entry.prog);
        if (organ.buildSegments) st.segs = organ.buildSegments(kit, st);
        loading.remove();
        last = now;
        setTimeout(warmUp, 500);
      }
      frames++;
      ema += (rawDt - ema) * 0.08;
      if (frames > 40 && now - lastAdapt > 700) {
        if (ema > 26 && st.scale > 0.3) { st.scale = Math.max(0.3, st.scale * 0.85); resize(); lastAdapt = now; }
        else if (ema < 18.5 && st.scale < 1) { st.scale = Math.min(1, st.scale * 1.08); resize(); lastAdapt = now; }
      }
      if (st.auto && !st.dragging && now - st.lastInput > 2500) st.yaw += dt * 0.22;
      if (hooks.tick) hooks.tick(dt);

      // Telecamera in orbita attorno al centro dell'organo.
      const cp = Math.cos(st.pitch);
      const cam = [C[0] + st.dist * cp * Math.sin(st.yaw), C[1] + st.dist * Math.sin(st.pitch), C[2] + st.dist * cp * Math.cos(st.yaw)];
      let f = [C[0] - cam[0], C[1] - cam[1], C[2] - cam[2]];
      const fl = Math.hypot(...f);
      f = f.map((v) => v / fl);
      let r = [-f[2], 0, f[0]];                                  // f × (0, 1, 0)
      const rl = Math.hypot(...r);
      r = r.map((v) => v / rl);
      const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
      const cutN = CUTS[st.cut];

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(U.uRes, canvas.width, canvas.height);
      gl.uniform1f(U.uTime, (now - t0) / 1000);
      gl.uniform3f(U.uCam, cam[0], cam[1], cam[2]);
      gl.uniformMatrix3fv(U.uRot, false, [...r, ...u, ...f]);
      gl.uniform3f(U.uCutN, ...(cutN || [0, 0, 1]));
      gl.uniform1f(U.uCut, cutN ? st.cutPos : 1e3);
      gl.uniform1f(U.uBeat, st.beat);
      gl.uniform4f(U.uP, ...st.p);
      gl.uniform1i(U.uZero, 0);
      gl.uniform4f(U.uQ, ...st.q);
      if (st.segs) {                          // dati del kit: si caricano solo quando cambiano
        const pk = kit.pack(st.segs);
        if (!cache.segTex) cache.segTex = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, cache.segTex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, pk.width, 3, 0, gl.RGBA, gl.FLOAT, pk.data);
        gl.uniform1i(U.uSegTex, 0);
        gl.uniform1i(U.uSegN, pk.n);
        st.segs = null;
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // Etichette: proiezione degli stessi punti 3D sullo schermo.
      if (st.labels) {
        const W = canvas.clientWidth, H = canvas.clientHeight;
        const project = (pt) => {
          const v = [pt[0] - cam[0], pt[1] - cam[1], pt[2] - cam[2]];
          const z = v[0] * f[0] + v[1] * f[1] + v[2] * f[2];
          const sx = (2.2 * (v[0] * r[0] + v[1] * r[1] + v[2] * r[2])) / z;
          const sy = (2.2 * (v[0] * u[0] + v[1] * u[1] + v[2] * u[2])) / z;
          return [W / 2 + (sx * H) / 2, H / 2 - (sy * H) / 2, z, v];
        };
        const cx = project(C)[0];
        const shown = [];
        for (const l of labels) {
          const [x, y, z, v] = project(l.p);
          const facing = l.n[0] * -v[0] + l.n[1] * -v[1] + l.n[2] * -v[2];
          const cutAway = cutN && (l.p[0] - C[0]) * cutN[0] + (l.p[1] - C[1]) * cutN[1] + (l.p[2] - C[2]) * cutN[2] > st.cutPos;
          const show = z > 0.1 && facing > 0 && !cutAway && (!l.only || l.only === st.cut) && (!l.when || l.when(st)) && (!l.near || st.dist <= l.near);
          l.el.hidden = !show;
          if (show) shown.push({ l, x, y, left: x < cx, ty: y });
        }
        // Testi a sinistra o a destra del centro dell'organo, scostati in verticale se si toccano.
        for (const side of [true, false]) {
          const group = shown.filter((s) => s.left === side).sort((a, b) => a.y - b.y);
          for (let i = 1; i < group.length; i++) group[i].ty = Math.max(group[i].ty, group[i - 1].ty + 24);
        }
        for (const s of shown) {
          s.l.el.classList.toggle('flip', s.left);
          s.l.el.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px)`;
          s.l.el.style.setProperty('--dy', `${(s.ty - s.y).toFixed(1)}px`);
        }
      }

      if (hooks.draw) hooks.draw();
      const fv = fps();
      if (frames % 10 === 0) {
        for (const [set, value] of statSetters) set(typeof value === 'function' ? value(st) : value);
        sFps(fv ? fv.toFixed(0) : '—');
        sRes(`${canvas.width}×${canvas.height} · ${Math.round(st.scale * 100)}%`);
      }
    }
    raf = requestAnimationFrame(frame);

    return {
      unmount() {
        cancelAnimationFrame(raf);
        stopObs();
        listen.abort();
        if (hooks.dispose) hooks.dispose();
        canvas.remove();                     // il contesto e i programmi restano pronti per il prossimo organo
        labelLayer.remove();
        loading.remove();
      },
    };
  };
})();
