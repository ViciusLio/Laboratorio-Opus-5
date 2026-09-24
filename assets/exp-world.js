/* Mondo — paesaggio infinito in raymarching: nessun modello 3D, nessuna texture.
   Una funzione di rumore frattale con "erosione" fa da terreno; ogni pixel cerca dove il suo raggio lo incontra. */
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
uniform vec3 uSun;
uniform vec3 uSunCol;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform float uSea;
uniform vec2 uSeed;
uniform float uNight;

const mat2 M2 = mat2(0.8, -0.6, 0.6, 0.8);
const float SCALE = 0.0022;
const float HEIGHT = 260.0;
const float TMAX = 4500.0;

float hash(vec2 p) {
  p = 50.0 * fract(p * 0.3183099 + vec2(0.71, 0.113));
  return -1.0 + 2.0 * fract(p.x * p.y * (p.x + p.y));
}

// Rumore di valore con derivate analitiche (interpolazione quintica).
vec3 noised(vec2 x) {
  vec2 p = floor(x);
  vec2 f = fract(x);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
  float a = hash(p);
  float b = hash(p + vec2(1.0, 0.0));
  float c = hash(p + vec2(0.0, 1.0));
  float d = hash(p + vec2(1.0, 1.0));
  float k1 = b - a, k2 = c - a, k4 = a - b - c + d;
  return vec3(a + k1 * u.x + k2 * u.y + k4 * u.x * u.y, du * vec2(k1 + k4 * u.y, k2 + k4 * u.x));
}

// fBm con "erosione": dove la pendenza accumulata è forte, i dettagli si attenuano.
float terrain(vec2 x, int oct) {
  vec2 p = x * SCALE + uSeed;
  float a = 0.0, b = 1.0;
  vec2 d = vec2(0.0);
  for (int i = 0; i < 12; i++) {
    if (i >= oct) break;
    vec3 n = noised(p);
    d += n.yz;
    a += b * n.x / (1.0 + dot(d, d));
    b *= 0.5;
    p = M2 * p * 2.0;
  }
  return HEIGHT * a;
}

float march(vec3 ro, vec3 rd, float tmin, float tmax, int steps, int oct) {
  float t = tmin;
  for (int i = 0; i < 300; i++) {
    if (i >= steps) break;
    vec3 p = ro + rd * t;
    if (p.y > 360.0 && rd.y > 0.0) return 1e9;
    float h = p.y - terrain(p.xz, oct);
    if (abs(h) < 0.0015 * t) return t;
    if (t > tmax) return 1e9;
    t += 0.4 * h;
  }
  return t < tmax ? t : 1e9;
}

vec3 normalAt(vec2 p, float t) {
  float e = 0.12 + 0.0015 * t;
  int oct = t < 500.0 ? 10 : (t < 1500.0 ? 8 : 6);
  float hx = terrain(p - vec2(e, 0.0), oct) - terrain(p + vec2(e, 0.0), oct);
  float hz = terrain(p - vec2(0.0, e), oct) - terrain(p + vec2(0.0, e), oct);
  return normalize(vec3(hx, 2.0 * e, hz));
}

float softShadow(vec3 ro, vec3 rd) {
  float res = 1.0, t = 2.0;
  for (int i = 0; i < 44; i++) {
    vec3 p = ro + rd * t;
    float h = p.y - terrain(p.xz, 5);
    res = min(res, 14.0 * h / t);
    t += clamp(h, 3.0, 70.0);
    if (res < 0.002 || p.y > 360.0) break;
  }
  return clamp(res, 0.0, 1.0);
}

vec3 sky(vec3 rd) {
  float y = max(rd.y, 0.0);
  vec3 col = mix(uHorizon, uZenith, pow(y, 0.45));
  float s = clamp(dot(rd, uSun), 0.0, 1.0);
  col += uSunCol * (0.22 * pow(s, 7.0) + 0.08 * pow(s, 2.0));
  col += uSunCol * pow(s, 1400.0) * 10.0;

  if (rd.y > 0.0) {
    // Nuvole su un piano, illuminate dal sole.
    float tc = (1500.0 - uCam.y) / rd.y;
    vec2 q = (uCam.xz + rd.xz * tc) * 0.00032 + vec2(uTime * 0.006, uTime * 0.002) + uSeed;
    float f = 0.0, amp = 0.55;
    for (int i = 0; i < 5; i++) { f += amp * noised(q).x; q = M2 * q * 2.03; amp *= 0.5; }
    float cl = smoothstep(-0.02, 0.6, f) * smoothstep(0.0, 0.18, rd.y);
    vec3 cc = uZenith * 0.5 + uHorizon * 0.45 + uSunCol * (0.22 + 0.7 * pow(s, 5.0));
    col = mix(col, cc, cl * 0.85);

    // Stelle: puntini rotondi in celle della volta celeste.
    if (uNight > 0.01) {
      vec2 sp = rd.xz / (rd.y + 0.35) * 240.0;
      vec2 cell = floor(sp);
      float st = hash(cell) * 0.5 + 0.5;
      float r = length(fract(sp) - 0.5);
      float bright = 0.5 + 0.5 * hash(cell + 13.1);
      col += vec3(0.8, 0.86, 1.0) * step(0.994, st) * smoothstep(0.28, 0.0, r) * bright * uNight * (1.0 - cl) * smoothstep(0.0, 0.25, rd.y);
    }
  }
  return col;
}

vec3 albedo(vec3 p, vec3 n) {
  float r = noised(p.xz * 0.02).x;
  vec3 rock = mix(vec3(0.075, 0.062, 0.052), vec3(0.15, 0.13, 0.11), 0.5 + 0.5 * r);
  vec3 grass = mix(vec3(0.04, 0.07, 0.02), vec3(0.1, 0.11, 0.035), 0.5 + 0.5 * r);
  vec3 col = rock;
  float g = smoothstep(0.72, 0.9, n.y) * (1.0 - smoothstep(100.0, 165.0, p.y + 25.0 * r));
  col = mix(col, grass, g);
  float beach = (1.0 - smoothstep(uSea + 1.0, uSea + 7.0, p.y)) * smoothstep(0.5, 0.8, n.y);
  col = mix(col, vec3(0.32, 0.27, 0.19), beach);
  float snow = smoothstep(145.0, 195.0, p.y + 45.0 * r) * smoothstep(0.45, 0.75, n.y + 0.1 * r);
  col = mix(col, vec3(0.8, 0.84, 0.9), snow);
  return col;
}

vec3 shade(vec3 p, vec3 n, vec3 rd, bool shadows) {
  vec3 alb = albedo(p, n);
  float dif = clamp(dot(n, uSun), 0.0, 1.0);
  float sh = 1.0;
  if (shadows && dif > 0.001 && uSun.y > 0.0) sh = softShadow(p + n * 0.8, uSun);
  float amb = 0.5 + 0.5 * n.y;
  float bac = clamp(dot(n, normalize(vec3(-uSun.x, 0.0, -uSun.z))), 0.0, 1.0);
  vec3 moon = normalize(vec3(-uSun.x, 0.45, -uSun.z));
  vec3 lin = uSunCol * dif * vec3(sh, pow(sh, 1.15), pow(sh, 1.4)) * 1.6;
  lin += uZenith * amb * 1.1;
  lin += uHorizon * bac * 0.18;
  lin += vec3(0.05, 0.07, 0.12) * uNight * clamp(dot(n, moon), 0.0, 1.0);
  vec3 col = alb * lin;
  // Riflesso della neve.
  float spec = pow(clamp(dot(reflect(rd, n), uSun), 0.0, 1.0), 24.0) * sh;
  col += uSunCol * spec * 0.25 * smoothstep(0.5, 0.7, alb.r);
  return col;
}

vec3 fog(vec3 col, float t, vec3 rd) {
  float fo = 1.0 - exp(-pow(t * 0.00035, 1.5));
  float s = clamp(dot(rd, uSun), 0.0, 1.0);
  vec3 fc = uHorizon + uSunCol * 0.24 * pow(s, 7.0);
  col = mix(col, fc, fo);
  return mix(col, sky(rd), smoothstep(0.75 * TMAX, TMAX, t));
}

vec3 water(vec3 p, vec3 rd, float t) {
  vec2 q = p.xz * 0.03;
  vec3 n1 = noised(q + vec2(uTime * 0.3, uTime * 0.18));
  vec3 n2 = noised(M2 * q * 2.7 - vec2(uTime * 0.22, -uTime * 0.31));
  vec2 g = n1.yz * 0.5 + n2.yz * 0.25;
  float fade = 1.0 / (1.0 + t * 0.003);
  vec3 n = normalize(vec3(-g.x * 0.22 * fade, 1.0, -g.y * 0.22 * fade));
  float fre = 0.02 + 0.98 * pow(1.0 - clamp(dot(-rd, n), 0.0, 1.0), 5.0);
  vec3 rr = reflect(rd, n);
  rr.y = abs(rr.y);

  // Riflesso: un secondo raymarching, più economico, per specchiare le montagne.
  vec3 refl;
  float tr = march(p + vec3(0.0, 0.5, 0.0), rr, 1.0, 1800.0, 90, 5);
  if (tr < 1e8) {
    vec3 rp = p + rr * tr;
    refl = fog(shade(rp, normalAt(rp.xz, tr + t), rr, false), tr + t, rr);
  } else {
    refl = sky(rr);
  }

  float depth = uSea - terrain(p.xz, 5);
  vec3 body = mix(vec3(0.03, 0.13, 0.12), vec3(0.004, 0.02, 0.035), smoothstep(0.0, 45.0, depth));
  body *= uZenith * 1.4 + uSunCol * max(uSun.y, 0.0) * 0.9 + vec3(0.02) * uNight;
  vec3 col = mix(body, refl, fre);
  col += uSunCol * pow(clamp(dot(rr, uSun), 0.0, 1.0), 320.0) * 5.0 * fade;
  float foam = (1.0 - smoothstep(0.0, 2.2, depth)) * (0.55 + 0.45 * n1.x);
  col = mix(col, (uZenith + uSunCol * max(uSun.y, 0.0)) * 0.7, clamp(foam, 0.0, 1.0) * 0.55);
  return col;
}

vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }

void main() {
  vec2 uv = (2.0 * gl_FragCoord.xy - uRes) / uRes.y;
  vec3 ro = uCam;
  vec3 rd = normalize(uRot * vec3(uv, 1.75));

  float tw = rd.y < 0.0 ? (uSea - ro.y) / rd.y : 1e9;
  float t = march(ro, rd, 1.0, min(TMAX, tw), 280, 6);
  vec3 col;
  if (t < 1e8) {
    vec3 p = ro + rd * t;
    col = fog(shade(p, normalAt(p.xz, t), rd, true), t, rd);
  } else if (tw < TMAX) {
    col = fog(water(ro + rd * tw, rd, tw), tw, rd);
  } else {
    col = sky(rd);
  }

  col = aces(col * 1.05);
  col = pow(col, vec3(1.0 / 2.2));
  vec2 q = gl_FragCoord.xy / uRes;
  col *= 0.55 + 0.45 * pow(16.0 * q.x * q.y * (1.0 - q.x) * (1.0 - q.y), 0.12);
  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  outColor = vec4(col, 1.0);
}`;

  // ---------- lo stesso terreno, in JavaScript, per guidare la telecamera ----------
  const f32 = Math.fround;
  const fract = (x) => x - Math.floor(x);
  function hash(x, y) {
    const px = f32(50 * fract(f32(x * 0.3183099 + 0.71)));
    const py = f32(50 * fract(f32(y * 0.3183099 + 0.113)));
    return -1 + 2 * fract(f32(px * py * f32(px + py)));
  }
  function noised(x, y, out) {
    const px = Math.floor(x), py = Math.floor(y), fx = x - px, fy = y - py;
    const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10), uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const dux = 30 * fx * fx * (fx * (fx - 2) + 1), duy = 30 * fy * fy * (fy * (fy - 2) + 1);
    const a = hash(px, py), b = hash(px + 1, py), c = hash(px, py + 1), d = hash(px + 1, py + 1);
    const k1 = b - a, k2 = c - a, k4 = a - b - c + d;
    out[0] = a + k1 * ux + k2 * uy + k4 * ux * uy;
    out[1] = dux * (k1 + k4 * uy);
    out[2] = duy * (k2 + k4 * ux);
  }
  const tmp = [0, 0, 0];
  function terrainJS(x, z, seed, oct = 6) {
    let px = x * 0.0022 + seed[0], py = z * 0.0022 + seed[1];
    let a = 0, b = 1, dx = 0, dy = 0;
    for (let i = 0; i < oct; i++) {
      noised(px, py, tmp);
      dx += tmp[1];
      dy += tmp[2];
      a += (b * tmp[0]) / (1 + dx * dx + dy * dy);
      b *= 0.5;
      const nx = 0.8 * px + 0.6 * py, ny = -0.6 * px + 0.8 * py;
      px = nx * 2;
      py = ny * 2;
    }
    return 260 * a;
  }

  // ---------- cielo in funzione dell'altezza del sole ----------
  const KEYS = [
    { s: -0.3, sun: [0, 0, 0], zen: [0.004, 0.007, 0.022], hor: [0.02, 0.028, 0.05] },
    { s: -0.08, sun: [0.35, 0.1, 0.06], zen: [0.03, 0.04, 0.11], hor: [0.3, 0.15, 0.17] },
    { s: 0.05, sun: [1.6, 0.62, 0.25], zen: [0.1, 0.15, 0.34], hor: [0.95, 0.5, 0.32] },
    { s: 0.25, sun: [1.65, 1.2, 0.85], zen: [0.14, 0.28, 0.6], hor: [0.66, 0.66, 0.7] },
    { s: 0.6, sun: [1.65, 1.52, 1.35], zen: [0.15, 0.32, 0.7], hor: [0.58, 0.7, 0.86] },
  ];
  function palette(sy) {
    if (sy <= KEYS[0].s) return KEYS[0];
    for (let i = 1; i < KEYS.length; i++) {
      if (sy <= KEYS[i].s) {
        const A = KEYS[i - 1], B = KEYS[i];
        let t = (sy - A.s) / (B.s - A.s);
        t = t * t * (3 - 2 * t);
        const mix = (k) => A[k].map((v, j) => v + (B[k][j] - v) * t);
        return { sun: mix('sun'), zen: mix('zen'), hor: mix('hor') };
      }
    }
    return KEYS[KEYS.length - 1];
  }

  function clock(h) {
    const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  Lab.register({
    id: 'mondo',
    name: 'Mondo',
    accent: '#ff9f6e',
    kicker: 'Grafica procedurale · raymarching GLSL',
    title: 'Mondo',
    tagline: 'Un paesaggio infinito nato da una sola funzione matematica. Non esiste nessun modello 3D e nessuna texture: per ogni pixel un raggio parte dalla telecamera e cerca il punto in cui incontra il terreno.',
    hint: 'Trascina per guardarti intorno · prova il tramonto',
    stack: 'JavaScript + GLSL',
    formula:
      '<div>h(<b>x</b>) = Σ<sub>i</sub> 2<sup>−i</sup> n(2<sup>i</sup>R<sup>i</sup><b>x</b>) ⁄ (1 + |Σ∇n|²)</div>' +
      '<div><b>p</b>(t) = <b>o</b> + t<b>d</b>, &nbsp;t ← t + 0.4 (p<sub>y</sub> − h(p<sub>xz</sub>))</div>',
    how:
      '<p>Tutto quello che vedi è calcolato da zero, ogni fotogramma, per ogni pixel, dentro un unico shader.</p>' +
      '<ol>' +
      '<li><strong>Terreno.</strong> Rumore frattale con derivate analitiche: ogni ottava aggiunge dettaglio, ma viene attenuata dove la pendenza accumulata è forte. Ne escono crinali e valli che sembrano scolpiti dall’erosione.</li>' +
      '<li><strong>Raymarching.</strong> Il raggio avanza di una frazione della sua altezza sul terreno, finché la distanza diventa trascurabile. Circa 100–250 passi per pixel.</li>' +
      '<li><strong>Luce.</strong> Normali per differenze finite, ombre morbide con un secondo raggio verso il sole, cielo e nebbia che cambiano con l’ora.</li>' +
      '<li><strong>Acqua.</strong> Onde da rumore animato, formula di Fresnel e un terzo raggio riflesso che specchia le montagne.</li>' +
      '<li><strong>Telecamera.</strong> La stessa funzione del terreno è riscritta in JavaScript per sapere a che quota volare senza schiantarsi. La risoluzione si adatta da sola alla potenza della scheda grafica.</li>' +
      '</ol>',

    mount(stage, ui) {
      const canvas = document.createElement('canvas');
      canvas.style.imageRendering = 'auto';
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
      for (const n of ['uRes', 'uTime', 'uCam', 'uRot', 'uSun', 'uSunCol', 'uZenith', 'uHorizon', 'uSea', 'uSeed', 'uNight']) U[n] = gl.getUniformLocation(prog, n);

      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(0);

      // ---------- stato ----------
      const st = {
        hour: 15.6, lapse: false, speed: 90, sea: -30,
        seed: [Math.random() * 60, Math.random() * 60],
        s: 0, camY: 0, yawOff: 0, pitchOff: 0, dragging: false, lastDrag: 0,
        scale: 0.55, flown: 0,
      };
      const pathZ = (s) => 520 * Math.sin(s * 0.00085) + 210 * Math.sin(s * 0.0023 + 1.7);

      function resize() {
        const w = Math.max(1, Math.round(canvas.clientWidth * st.scale));
        const h = Math.max(1, Math.round(canvas.clientHeight * st.scale));
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      }

      function placeCamera() {
        st.camY = Math.max(terrainJS(st.s, pathZ(st.s), st.seed), st.sea) + 110;
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
        st.pitchOff = Math.max(-0.7, Math.min(0.6, st.pitchOff - (e.clientY - py) * 0.0035));
        px = e.clientX; py = e.clientY;
        st.lastDrag = performance.now();
      });
      const endDrag = () => { st.dragging = false; st.lastDrag = performance.now(); };
      canvas.addEventListener('pointerup', endDrag);
      canvas.addEventListener('pointercancel', endDrag);

      // ---------- interfaccia ----------
      const hourCtl = ui.slider({ id: 'hour', label: 'Ora del giorno', min: 4.5, max: 20.5, step: 0.05, value: st.hour, format: clock, onInput: (v) => (st.hour = v) });
      ui.toggle({ id: 'lapse', label: 'Il tempo scorre da solo', value: st.lapse, onChange: (v) => (st.lapse = v) });
      ui.slider({ id: 'speed', label: 'Velocità di volo', min: 0, max: 260, step: 1, value: st.speed, format: (v) => `${v} m/s`, onInput: (v) => (st.speed = v) });
      ui.slider({ id: 'sea', label: 'Livello del mare', min: -120, max: 60, step: 1, value: st.sea, format: (v) => `${v > 0 ? '+' : ''}${v} m`, onInput: (v) => { st.sea = v; } });
      ui.actions([
        { id: 'seed', label: 'Nuovo mondo', primary: true, onClick: () => { st.seed = [Math.random() * 60, Math.random() * 60]; placeCamera(); } },
        { id: 'look', label: 'Guarda avanti', onClick: () => { st.yawOff = 0; st.pitchOff = 0; } },
      ]);
      const sFps = ui.stat('Fotogrammi/s');
      const sRes = ui.stat('Pixel calcolati');
      const sAlt = ui.stat('Quota');
      const sDist = ui.stat('Distanza volata');

      // ---------- ciclo ----------
      resize();
      placeCamera();
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

        // Risoluzione adattiva: punta a restare fluida su qualsiasi GPU.
        ema += (rawDt - ema) * 0.08;
        if (frames > 40 && now - lastAdapt > 700) {
          if (ema > 26 && st.scale > 0.3) { st.scale = Math.max(0.3, st.scale * 0.85); resize(); lastAdapt = now; }
          else if (ema < 18.5 && st.scale < 1) { st.scale = Math.min(1, st.scale * 1.08); resize(); lastAdapt = now; }
        }

        if (st.lapse) {
          st.hour += dt * 0.22;
          if (st.hour > 20.5) st.hour = 4.5;
          hourCtl.set(st.hour);
        }

        // Telecamera lungo un sentiero sinuoso, con quota che anticipa le montagne.
        st.s += st.speed * dt;
        st.flown += st.speed * dt;
        const x = st.s, z = pathZ(st.s);
        let fx = 2, fz = pathZ(st.s + 1) - pathZ(st.s - 1);
        const fl = Math.hypot(fx, fz);
        fx /= fl; fz /= fl;
        let target = st.sea + 90;
        for (const ahead of [0, 80, 180, 340]) target = Math.max(target, terrainJS(x + fx * ahead, z + fz * ahead, st.seed, 5) + 110 - ahead * 0.12);
        st.camY += (target - st.camY) * Math.min(1, dt * 1.1);
        st.camY = Math.max(st.camY, terrainJS(x, z, st.seed, 7) + 20, st.sea + 15);

        if (!st.dragging && now - st.lastDrag > 1800) {
          const k = Math.exp(-dt * 0.9);
          st.yawOff *= k;
          st.pitchOff *= k;
        }
        const yaw = Math.atan2(fz, fx) + st.yawOff;
        const pitch = -0.13 + st.pitchOff;
        const f = [Math.cos(pitch) * Math.cos(yaw), Math.sin(pitch), Math.cos(pitch) * Math.sin(yaw)];
        const rl = Math.hypot(f[2], f[0]);
        const r = [-f[2] / rl, 0, f[0] / rl];
        const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];

        // Sole: sorge alle 6, tramonta alle 18, di fronte a noi la sera.
        const el = 1.13 * Math.sin(((st.hour - 6) / 12) * Math.PI);
        const az = Math.PI / 2 + ((st.hour - 18) / 12) * Math.PI;
        const sun = [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
        const pal = palette(sun[1]);
        const night = Math.min(1, Math.max(0, (-sun[1] - 0.02) / 0.2));

        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniform2f(U.uRes, canvas.width, canvas.height);
        gl.uniform1f(U.uTime, (now - t0) / 1000);
        gl.uniform3f(U.uCam, x, st.camY, z);
        gl.uniformMatrix3fv(U.uRot, false, [...r, ...u, ...f]);
        gl.uniform3f(U.uSun, sun[0], sun[1], sun[2]);
        gl.uniform3fv(U.uSunCol, pal.sun);
        gl.uniform3fv(U.uZenith, pal.zen);
        gl.uniform3fv(U.uHorizon, pal.hor);
        gl.uniform1f(U.uSea, st.sea);
        gl.uniform2f(U.uSeed, st.seed[0], st.seed[1]);
        gl.uniform1f(U.uNight, night);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        const fv = fps();
        if (frames % 10 === 0) {
          sFps(fv ? fv.toFixed(0) : '—');
          sRes(`${canvas.width}×${canvas.height} · ${Math.round(st.scale * 100)}%`);
          sAlt(`${Math.round(st.camY - st.sea)} m s.l.m.`);
          sDist(`${(st.flown / 1000).toFixed(2)} km`);
        }
      }
      raf = requestAnimationFrame(frame);

      return {
        unmount() {
          cancelAnimationFrame(raf);
          stopObs();
          const lose = gl.getExtension('WEBGL_lose_context');
          if (lose) lose.loseContext();
          canvas.remove();
        },
      };
    },
  });
})();
