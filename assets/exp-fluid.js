/* Fluido — equazioni di Navier–Stokes incomprimibili risolte sulla GPU (WebGL2).
   Metodo "stable fluids" (Stam, 1999) con vorticity confinement. */
(function () {
  'use strict';

  const VS = `#version 300 es
precision highp float;
in vec2 aPos;
uniform vec2 uTexel;
out vec2 vUv;
out vec2 vL;
out vec2 vR;
out vec2 vT;
out vec2 vB;
void main() {
  vUv = aPos * 0.5 + 0.5;
  vL = vUv - vec2(uTexel.x, 0.0);
  vR = vUv + vec2(uTexel.x, 0.0);
  vT = vUv + vec2(0.0, uTexel.y);
  vB = vUv - vec2(0.0, uTexel.y);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

  const HEAD = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
out vec4 outColor;
`;

  const FS = {
    copy: `
uniform sampler2D uTex;
uniform float uValue;
void main() { outColor = uValue * texture(uTex, vUv); }`,

    splat: `
uniform sampler2D uTarget;
uniform float uAspect;
uniform vec3 uColor;
uniform vec2 uPoint;
uniform float uRadius;
void main() {
  vec2 p = vUv - uPoint;
  p.x *= uAspect;
  vec3 s = exp(-dot(p, p) / uRadius) * uColor;
  outColor = vec4(texture(uTarget, vUv).xyz + s, 1.0);
}`,

    // Advezione semi-lagrangiana: ogni cella guarda indietro lungo la velocità.
    advect: `
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 uVelTexel;
uniform float uDt;
uniform float uDissipation;
void main() {
  vec2 coord = vUv - uDt * texture(uVelocity, vUv).xy * uVelTexel;
  outColor = texture(uSource, coord) / (1.0 + uDissipation * uDt);
}`,

    divergence: `
uniform sampler2D uVelocity;
void main() {
  float L = texture(uVelocity, vL).x;
  float R = texture(uVelocity, vR).x;
  float T = texture(uVelocity, vT).y;
  float B = texture(uVelocity, vB).y;
  vec2 C = texture(uVelocity, vUv).xy;
  if (vL.x < 0.0) L = -C.x;
  if (vR.x > 1.0) R = -C.x;
  if (vT.y > 1.0) T = -C.y;
  if (vB.y < 0.0) B = -C.y;
  outColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}`,

    curl: `
uniform sampler2D uVelocity;
void main() {
  float L = texture(uVelocity, vL).y;
  float R = texture(uVelocity, vR).y;
  float T = texture(uVelocity, vT).x;
  float B = texture(uVelocity, vB).x;
  outColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
}`,

    // Vorticity confinement: restituisce i piccoli vortici che la griglia tende a smorzare.
    vorticity: `
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform float uStrength;
uniform float uDt;
void main() {
  float L = texture(uCurl, vL).x;
  float R = texture(uCurl, vR).x;
  float T = texture(uCurl, vT).x;
  float B = texture(uCurl, vB).x;
  float C = texture(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 1e-4;
  force *= uStrength * C;
  force.y *= -1.0;
  vec2 vel = texture(uVelocity, vUv).xy + force * uDt;
  outColor = vec4(clamp(vel, -1000.0, 1000.0), 0.0, 1.0);
}`,

    // Un'iterazione di Jacobi per l'equazione di Poisson della pressione.
    pressure: `
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
void main() {
  float L = texture(uPressure, vL).x;
  float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x;
  float B = texture(uPressure, vB).x;
  float div = texture(uDivergence, vUv).x;
  outColor = vec4((L + R + B + T - div) * 0.25, 0.0, 0.0, 1.0);
}`,

    // Proiezione: togliendo il gradiente di pressione il campo diventa a divergenza nulla.
    gradient: `
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
void main() {
  float L = texture(uPressure, vL).x;
  float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x;
  float B = texture(uPressure, vB).x;
  vec2 vel = texture(uVelocity, vUv).xy - vec2(R - L, T - B);
  outColor = vec4(vel, 0.0, 1.0);
}`,

    display: `
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform vec3 uBg;
uniform float uShading;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec3 c = texture(uTex, vUv).rgb;
  if (uShading > 0.5) {
    float dx = length(texture(uTex, vR).rgb) - length(texture(uTex, vL).rgb);
    float dy = length(texture(uTex, vT).rgb) - length(texture(uTex, vB).rgb);
    vec3 n = normalize(vec3(dx, dy, length(uTexel)));
    c *= clamp(n.z + 0.7, 0.7, 1.0);
  }
  vec3 t = 1.0 - exp(-c * 1.35);
  float a = max(t.r, max(t.g, t.b));
  vec3 col = uBg * (1.0 - a) + t;
  vec2 q = vUv - 0.5;
  col *= 1.0 - dot(q, q) * 0.4;
  col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  outColor = vec4(col, 1.0);
}`,
  };

  const PALETTES = {
    aurora: [[0.08, 0.95, 0.72], [0.1, 0.55, 1.0], [0.55, 0.25, 1.0], [1.0, 0.3, 0.6]],
    magma: [[1.0, 0.36, 0.06], [1.0, 0.72, 0.12], [0.92, 0.1, 0.22], [0.55, 0.05, 0.4]],
    oceano: [[0.04, 0.32, 0.95], [0.0, 0.72, 0.92], [0.55, 0.9, 1.0], [0.12, 0.22, 0.6]],
    spettro: null,
  };

  function hsv(h, s, v) {
    const i = Math.floor(h * 6), f = h * 6 - i;
    const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
  }

  Lab.register({
    id: 'fluido',
    name: 'Fluido',
    accent: '#7cc8ff',
    kicker: 'Fluidodinamica · WebGL2 · GPU',
    title: 'Fluido',
    tagline: 'Un fluido incomprimibile risolto in tempo reale sulla scheda grafica: ogni pixel della simulazione è una cella dove valgono le equazioni di Navier–Stokes. Trascina per mescolare.',
    hint: 'Trascina per mescolare · clic per uno schizzo di colore',
    stack: 'JavaScript + GLSL',
    formula:
      '<div>∂<b>u</b>/∂t + (<b>u</b>·∇)<b>u</b> = −∇p + ν∇²<b>u</b> + <b>f</b></div>' +
      '<div>∇·<b>u</b> = 0</div>',
    how:
      '<p>A ogni fotogramma la GPU esegue circa 30 passaggi di shader su una griglia di velocità e su una texture di colore ad alta risoluzione.</p>' +
      '<ol>' +
      '<li><strong>Vorticità.</strong> Calcola il rotore del campo e rinforza i vortici piccoli, che la griglia discreta tenderebbe a cancellare.</li>' +
      '<li><strong>Divergenza.</strong> Misura quanto fluido “nasce” o “sparisce” in ogni cella: in un fluido incomprimibile deve essere zero.</li>' +
      '<li><strong>Pressione.</strong> Risolve l’equazione di Poisson <em>∇²p = ∇·u</em> con iterazioni di Jacobi. Abbassa le iterazioni e il fluido diventa “gommoso”: la proiezione non converge.</li>' +
      '<li><strong>Proiezione.</strong> Sottrae il gradiente di pressione: la velocità torna a divergenza nulla.</li>' +
      '<li><strong>Advezione.</strong> Velocità e colore vengono trasportati dal campo stesso con il metodo semi-lagrangiano, stabile per qualsiasi passo temporale.</li>' +
      '</ol>',

    mount(stage, ui) {
      const canvas = document.createElement('canvas');
      stage.append(canvas);
      const gl = canvas.getContext('webgl2', { alpha: false, depth: false, stencil: false, antialias: false, powerPreference: 'high-performance' });
      if (!gl) return Lab.fail(stage, 'Il browser non supporta WebGL2.');
      if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) {
        return Lab.fail(stage, 'La scheda grafica non può disegnare su texture in virgola mobile.');
      }

      // ---------- programmi ----------
      function compile(type, src) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        return s;
      }
      const vs = compile(gl.VERTEX_SHADER, VS);
      function program(body) {
        const p = gl.createProgram();
        gl.attachShader(p, vs);
        gl.attachShader(p, compile(gl.FRAGMENT_SHADER, HEAD + body));
        gl.bindAttribLocation(p, 0, 'aPos');
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
        const u = {};
        const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < n; i++) {
          const name = gl.getActiveUniform(p, i).name;
          u[name] = gl.getUniformLocation(p, name);
        }
        return { p, u };
      }
      const P = {};
      for (const k in FS) P[k] = program(FS[k]);
      const use = (prog) => { gl.useProgram(prog.p); return prog.u; };

      // Quadrato a schermo intero.
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(0);

      function blit(target) {
        if (target) { gl.viewport(0, 0, target.w, target.h); gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo); }
        else { gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); gl.bindFramebuffer(gl.FRAMEBUFFER, null); }
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
      }

      // ---------- texture e framebuffer ----------
      function renderable(internal, format) {
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texImage2D(gl.TEXTURE_2D, 0, internal, 4, 4, 0, format, gl.HALF_FLOAT, null);
        const f = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, f);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
        const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.deleteFramebuffer(f);
        gl.deleteTexture(t);
        return ok;
      }
      if (!renderable(gl.RGBA16F, gl.RGBA)) return Lab.fail(stage, 'Texture RGBA16F non supportate.');
      const RGBA = { i: gl.RGBA16F, f: gl.RGBA };
      const RG = renderable(gl.RG16F, gl.RG) ? { i: gl.RG16F, f: gl.RG } : RGBA;
      const R = renderable(gl.R16F, gl.RED) ? { i: gl.R16F, f: gl.RED } : RG;

      function fbo(w, h, fmt) {
        const tex = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, fmt.i, w, h, 0, fmt.f, gl.HALF_FLOAT, null);
        const fb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        gl.viewport(0, 0, w, h);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        return {
          tex, fbo: fb, w, h, tx: 1 / w, ty: 1 / h,
          bind(unit) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); return unit; },
          free() { gl.deleteTexture(tex); gl.deleteFramebuffer(fb); },
        };
      }
      function doubleFbo(w, h, fmt) {
        let a = fbo(w, h, fmt), b = fbo(w, h, fmt);
        return {
          w, h, tx: 1 / w, ty: 1 / h,
          get read() { return a; },
          get write() { return b; },
          swap() { const t = a; a = b; b = t; },
          free() { a.free(); b.free(); },
        };
      }
      // Ridimensiona conservando il contenuto (niente reset quando si allarga la finestra).
      function resizeDouble(old, w, h, fmt) {
        const next = doubleFbo(w, h, fmt);
        const u = use(P.copy);
        gl.uniform2f(u.uTexel, 1 / w, 1 / h);
        gl.uniform1i(u.uTex, old.read.bind(0));
        gl.uniform1f(u.uValue, 1);
        blit(next.read);
        old.free();
        return next;
      }

      // ---------- stato ----------
      const cfg = {
        curl: 28, dyeDiss: 0.8, velDiss: 0.2, pressureDecay: 0.8, iterations: 20,
        radius: 0.25, force: 6000, shading: true, auto: true, palette: 'aurora', paused: false,
      };
      const SIM_RES = 128;
      let dyeRes = 1024;
      let velocity, dye, pressure, divergence, curl;

      function gridSize(res) {
        const w = Math.max(1, canvas.width), h = Math.max(1, canvas.height);
        const aspect = w > h ? w / h : h / w;
        const lo = Math.round(res), hi = Math.max(lo, Math.round(res * aspect));
        return w > h ? [hi, lo] : [lo, hi];
      }

      function initFramebuffers() {
        const [sw, sh] = gridSize(SIM_RES);
        const [dw, dh] = gridSize(dyeRes);
        if (!velocity) {
          velocity = doubleFbo(sw, sh, RG);
          dye = doubleFbo(dw, dh, RGBA);
        } else {
          if (velocity.w !== sw || velocity.h !== sh) velocity = resizeDouble(velocity, sw, sh, RG);
          if (dye.w !== dw || dye.h !== dh) dye = resizeDouble(dye, dw, dh, RGBA);
        }
        if (divergence) { divergence.free(); curl.free(); pressure.free(); }
        divergence = fbo(sw, sh, R);
        curl = fbo(sw, sh, R);
        pressure = doubleFbo(sw, sh, R);
      }

      function resize() {
        if (velocity && (!canvas.clientWidth || !canvas.clientHeight)) return;   // nascosto: tieni lo stato
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
        const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
        if (canvas.width === w && canvas.height === h && velocity) return;
        if (gl.isContextLost()) return;
        canvas.width = w;
        canvas.height = h;
        dyeRes = Math.min(w, h) < 700 ? 512 : 1024;
        initFramebuffers();
      }

      // ---------- colore e schizzi ----------
      let hueWalk = Math.random();
      function pickColor(intensity) {
        const pal = PALETTES[cfg.palette];
        let c;
        if (pal) {
          const base = pal[Math.floor(Math.random() * pal.length)];
          c = base.map((v) => Math.max(0, v + (Math.random() - 0.5) * 0.12));
        } else {
          hueWalk = (hueWalk + 0.13 + Math.random() * 0.2) % 1;
          c = hsv(hueWalk, 1, 1);
        }
        return c.map((v) => v * intensity);
      }

      function correctRadius(r) {
        const aspect = canvas.width / canvas.height;
        return aspect > 1 ? r * aspect : r;
      }

      function splat(x, y, dx, dy, color, radius = cfg.radius) {
        const u = use(P.splat);
        gl.uniform2f(u.uTexel, velocity.tx, velocity.ty);
        gl.uniform1i(u.uTarget, velocity.read.bind(0));
        gl.uniform1f(u.uAspect, canvas.width / canvas.height);
        gl.uniform2f(u.uPoint, x, y);
        gl.uniform3f(u.uColor, dx, dy, 0);
        gl.uniform1f(u.uRadius, correctRadius(radius / 100));
        blit(velocity.write);
        velocity.swap();
        gl.uniform2f(u.uTexel, dye.tx, dye.ty);
        gl.uniform1i(u.uTarget, dye.read.bind(0));
        gl.uniform3f(u.uColor, color[0], color[1], color[2]);
        blit(dye.write);
        dye.swap();
      }

      function burst(count) {
        for (let i = 0; i < count; i++) {
          const c = pickColor(1.4);
          splat(Math.random(), Math.random(), 1000 * (Math.random() - 0.5), 1000 * (Math.random() - 0.5), c);
        }
      }

      // Due "mani invisibili" che mescolano lungo curve di Lissajous quando nessuno tocca.
      const emitters = [0, 1].map((i) => ({
        a: 0.33 + i * 0.08, b: 0.47 - i * 0.11, pa: Math.random() * 6.28, pb: Math.random() * 6.28,
        rx: 0.34 - i * 0.06, ry: 0.3 + i * 0.04, color: pickColor(1), next: 0,
      }));
      function driveEmitters(t, dt) {
        for (const e of emitters) {
          const x = 0.5 + e.rx * Math.sin(t * e.a + e.pa);
          const y = 0.5 + e.ry * Math.sin(t * e.b + e.pb);
          let vx = e.rx * e.a * Math.cos(t * e.a + e.pa);
          let vy = e.ry * e.b * Math.cos(t * e.b + e.pb);
          const aspect = canvas.width / canvas.height;
          if (aspect > 1) vy /= aspect; else vx *= aspect;
          if (t > e.next) { e.color = pickColor(1); e.next = t + 2 + Math.random() * 3; }
          const k = Math.min(dt * 60, 2);
          splat(x, y, vx * 2600, vy * 2600, e.color.map((v) => v * 0.045 * k), 0.12);
        }
      }

      // ---------- simulazione ----------
      function step(dt) {
        let u;
        u = use(P.curl);
        gl.uniform2f(u.uTexel, velocity.tx, velocity.ty);
        gl.uniform1i(u.uVelocity, velocity.read.bind(0));
        blit(curl);

        u = use(P.vorticity);
        gl.uniform2f(u.uTexel, velocity.tx, velocity.ty);
        gl.uniform1i(u.uVelocity, velocity.read.bind(0));
        gl.uniform1i(u.uCurl, curl.bind(1));
        gl.uniform1f(u.uStrength, cfg.curl);
        gl.uniform1f(u.uDt, dt);
        blit(velocity.write);
        velocity.swap();

        u = use(P.divergence);
        gl.uniform2f(u.uTexel, velocity.tx, velocity.ty);
        gl.uniform1i(u.uVelocity, velocity.read.bind(0));
        blit(divergence);

        u = use(P.copy);
        gl.uniform2f(u.uTexel, velocity.tx, velocity.ty);
        gl.uniform1i(u.uTex, pressure.read.bind(0));
        gl.uniform1f(u.uValue, cfg.pressureDecay);
        blit(pressure.write);
        pressure.swap();

        u = use(P.pressure);
        gl.uniform2f(u.uTexel, velocity.tx, velocity.ty);
        gl.uniform1i(u.uDivergence, divergence.bind(0));
        for (let i = 0; i < cfg.iterations; i++) {
          gl.uniform1i(u.uPressure, pressure.read.bind(1));
          blit(pressure.write);
          pressure.swap();
        }

        u = use(P.gradient);
        gl.uniform2f(u.uTexel, velocity.tx, velocity.ty);
        gl.uniform1i(u.uPressure, pressure.read.bind(0));
        gl.uniform1i(u.uVelocity, velocity.read.bind(1));
        blit(velocity.write);
        velocity.swap();

        u = use(P.advect);
        gl.uniform2f(u.uTexel, velocity.tx, velocity.ty);
        gl.uniform2f(u.uVelTexel, velocity.tx, velocity.ty);
        gl.uniform1i(u.uVelocity, velocity.read.bind(0));
        gl.uniform1i(u.uSource, velocity.read.bind(0));
        gl.uniform1f(u.uDt, dt);
        gl.uniform1f(u.uDissipation, cfg.velDiss);
        blit(velocity.write);
        velocity.swap();

        gl.uniform2f(u.uTexel, dye.tx, dye.ty);
        gl.uniform1i(u.uVelocity, velocity.read.bind(0));
        gl.uniform1i(u.uSource, dye.read.bind(1));
        gl.uniform1f(u.uDissipation, cfg.dyeDiss);
        blit(dye.write);
        dye.swap();
      }

      function render() {
        const u = use(P.display);
        gl.uniform2f(u.uTexel, dye.tx, dye.ty);
        gl.uniform1i(u.uTex, dye.read.bind(0));
        gl.uniform3f(u.uBg, 0.027, 0.031, 0.047);
        gl.uniform1f(u.uShading, cfg.shading ? 1 : 0);
        blit(null);
      }

      // ---------- input ----------
      const pointers = new Map();
      let lastTouch = -1e9;
      function toUv(e) {
        const r = canvas.getBoundingClientRect();
        return { x: (e.clientX - r.left) / r.width, y: 1 - (e.clientY - r.top) / r.height };
      }
      const onDown = (e) => {
        canvas.setPointerCapture(e.pointerId);
        const p = toUv(e);
        const color = pickColor(0.15);
        pointers.set(e.pointerId, { x: p.x, y: p.y, dx: 0, dy: 0, moved: false, color, since: performance.now() });
        splat(p.x, p.y, 900 * (Math.random() - 0.5), 900 * (Math.random() - 0.5), color.map((v) => v * 9));
        lastTouch = performance.now();
      };
      const onMove = (e) => {
        const ptr = pointers.get(e.pointerId);
        if (!ptr) return;
        const p = toUv(e);
        const aspect = canvas.width / canvas.height;
        let dx = p.x - ptr.x, dy = p.y - ptr.y;
        if (aspect < 1) dx *= aspect;
        if (aspect > 1) dy /= aspect;
        ptr.dx = dx; ptr.dy = dy; ptr.x = p.x; ptr.y = p.y; ptr.moved = true;
        lastTouch = performance.now();
      };
      const onUp = (e) => pointers.delete(e.pointerId);
      canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerup', onUp);
      canvas.addEventListener('pointercancel', onUp);

      // ---------- interfaccia ----------
      ui.slider({ id: 'curl', label: 'Vorticità', min: 0, max: 60, step: 1, value: cfg.curl, onInput: (v) => (cfg.curl = v) });
      ui.slider({ id: 'iter', label: 'Iterazioni di pressione', min: 2, max: 60, step: 1, value: cfg.iterations, format: (v) => v + ' / frame', onInput: (v) => (cfg.iterations = v) });
      ui.slider({ id: 'dye', label: 'Dissolvenza del colore', min: 0, max: 3, step: 0.05, value: cfg.dyeDiss, format: (v) => v.toFixed(2), onInput: (v) => (cfg.dyeDiss = v) });
      ui.slider({ id: 'visc', label: 'Smorzamento della velocità', min: 0, max: 2, step: 0.05, value: cfg.velDiss, format: (v) => v.toFixed(2), onInput: (v) => (cfg.velDiss = v) });
      ui.select({
        id: 'pal', label: 'Tavolozza', value: cfg.palette,
        options: [{ value: 'aurora', label: 'Aurora' }, { value: 'magma', label: 'Magma' }, { value: 'oceano', label: 'Oceano' }, { value: 'spettro', label: 'Spettro completo' }],
        onChange: (v) => { cfg.palette = v; emitters.forEach((e) => (e.color = pickColor(1))); },
      });
      ui.toggle({ id: 'auto', label: 'Mescola da solo', value: cfg.auto, onChange: (v) => (cfg.auto = v) });
      ui.toggle({ id: 'shade', label: 'Rilievo della superficie', value: cfg.shading, onChange: (v) => (cfg.shading = v) });
      const btns = ui.actions([
        { id: 'burst', label: 'Esplosione', primary: true, onClick: () => burst(6 + Math.floor(Math.random() * 6)) },
        { id: 'pause', label: 'Pausa', onClick: (b) => { cfg.paused = !cfg.paused; b.textContent = cfg.paused ? 'Riprendi' : 'Pausa'; } },
        { id: 'clear', label: 'Pulisci', onClick: () => clearAll() },
      ]);
      void btns;

      function clearAll() {
        const u = use(P.copy);
        gl.uniform1f(u.uValue, 0);
        for (const d of [dye, velocity]) {
          gl.uniform2f(u.uTexel, d.tx, d.ty);
          gl.uniform1i(u.uTex, d.read.bind(0));
          blit(d.write);
          d.swap();
        }
      }

      const sFps = ui.stat('Fotogrammi/s');
      const sGrid = ui.stat('Griglia fisica');
      const sDye = ui.stat('Texture colore');
      const sPasses = ui.stat('Passaggi GPU/frame');
      const fps = Lab.fpsMeter();

      // ---------- ciclo ----------
      resize();
      burst(7);
      const stopObs = Lab.observeSize(canvas, resize);
      let raf = 0, last = performance.now(), nextBurst = performance.now() + 4000, statTick = 0;

      function frame(now) {
        raf = requestAnimationFrame(frame);
        const dt = Math.max(0, Math.min((now - last) / 1000, 1 / 60));
        last = Math.max(last, now);
        if (!cfg.paused) {
          const idle = now - lastTouch > 3500;
          if (cfg.auto && idle) {
            driveEmitters(now / 1000, dt);
            if (now > nextBurst) { burst(1 + Math.floor(Math.random() * 2)); nextBurst = now + 2500 + Math.random() * 3500; }
          }
          for (const p of pointers.values()) {
            if (performance.now() - p.since > 900) { p.color = pickColor(0.15); p.since = performance.now(); }
            if (p.moved) { p.moved = false; splat(p.x, p.y, p.dx * cfg.force, p.dy * cfg.force, p.color); }
          }
          step(dt);
        }
        render();

        const f = fps();
        if (++statTick % 10 === 0) {
          sFps(f ? f.toFixed(0) : '—');
          sGrid(`${velocity.w}×${velocity.h}`);
          sDye(`${dye.w}×${dye.h}`);
          sPasses(String(7 + cfg.iterations));
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
