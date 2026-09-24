/* Armonia — musica generativa: armonia da una catena di Markov sui gradi del modo,
   ritmi euclidei, sintesi sottrattiva e FM, riverbero a convoluzione con risposta all'impulso calcolata. */
(function () {
  'use strict';

  const SHARPS = ['Do', 'Do♯', 'Re', 'Re♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'];
  const FLATS = ['Do', 'Re♭', 'Re', 'Mi♭', 'Mi', 'Fa', 'Sol♭', 'Sol', 'La♭', 'La', 'Si♭', 'Si'];
  const MAJOR = [0, 2, 4, 5, 7, 9, 11];
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
  const FLAT_KEYS = new Set([5, 10, 3, 8, 1]);   // Fa, Si♭, Mi♭, La♭, Re♭ maggiore

  // Dal più scuro al più luminoso: ogni modo differisce dal vicino per una sola nota.
  // "color" è il grado che dà al modo il suo carattere, e viene favorito;
  // "offset" è il grado della scala maggiore da cui il modo parte (serve per l'armatura).
  const MODES = [
    { name: 'frigio', steps: [0, 1, 3, 5, 7, 8, 10], color: 1, offset: 4 },
    { name: 'eolio', steps: [0, 2, 3, 5, 7, 8, 10], color: 5, offset: 9 },
    { name: 'dorico', steps: [0, 2, 3, 5, 7, 9, 10], color: 3, offset: 2 },
    { name: 'misolidio', steps: [0, 2, 4, 5, 7, 9, 10], color: 6, offset: 7 },
    { name: 'ionio', steps: [0, 2, 4, 5, 7, 9, 11], color: 3, offset: 0 },
    { name: 'lidio', steps: [0, 2, 4, 6, 7, 9, 11], color: 1, offset: 5 },
  ];
  // Nomi delle note con diesis o bemolle secondo l'armatura della scala maggiore "madre".
  const noteNames = (key, mode) => (FLAT_KEYS.has(((key - mode.offset) % 12 + 12) % 12) ? FLATS : SHARPS);

  // Catena di Markov sui gradi: [grado successivo, peso].
  const MARKOV = [
    [[3, 3], [5, 3], [4, 2], [1, 2], [2, 1]],
    [[4, 4], [6, 1], [0, 2], [3, 1]],
    [[5, 3], [3, 2], [1, 1]],
    [[0, 3], [4, 3], [1, 2], [5, 1]],
    [[0, 4], [5, 2], [3, 1]],
    [[3, 3], [1, 3], [4, 2], [2, 1]],
    [[0, 3], [2, 2], [5, 1]],
  ];

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const mod = (a, n) => ((a % n) + n) % n;
  const angleOf = (pc) => -Math.PI / 2 + (mod(pc * 7, 12) / 12) * Math.PI * 2;

  function chordOf(key, mode, deg) {
    const s = mode.steps;
    const semis = (i) => s[i % 7] + 12 * Math.floor(i / 7);
    const rootSemi = semis(deg);
    const ivs = [0, 2, 4, 6].map((k) => semis(deg + k) - rootSemi);
    const nine = semis(deg + 8) - rootSemi;
    if (nine % 12 === 2) ivs.push(nine);
    const set = new Set(ivs.map((i) => i % 12));
    const third = set.has(4) ? 4 : 3;
    const fifth = set.has(7) ? 7 : set.has(6) ? 6 : 8;
    const sev = set.has(11) ? 11 : 10;
    const has9 = set.has(2);
    let q, minor = third === 3, dim = fifth === 6;
    if (third === 4 && fifth === 7) q = sev === 11 ? (has9 ? 'maj9' : 'maj7') : (has9 ? '9' : '7');
    else if (third === 3 && fifth === 7) q = sev === 10 ? (has9 ? 'm9' : 'm7') : 'm(maj7)';
    else if (third === 3 && fifth === 6) q = 'm7♭5';
    else q = 'maj7♯5';
    const rootPc = mod(key + rootSemi, 12);
    const acc = s[deg] < MAJOR[deg] ? '♭' : s[deg] > MAJOR[deg] ? '♯' : '';
    let numeral = acc + (minor ? ROMAN[deg].toLowerCase() : ROMAN[deg]) + (dim ? 'ø' : '');
    return {
      deg, dim, numeral,
      name: noteNames(key, mode)[rootPc] + q,
      rootPc,
      pcs: ivs.map((i) => mod(rootPc + i, 12)),
    };
  }

  Lab.register({
    id: 'armonia',
    name: 'Armonia',
    accent: '#b9a3ff',
    kicker: 'Composizione generativa · Web Audio',
    title: 'Armonia',
    tagline: 'Musica che non esiste finché non la ascolti. Le armonie le sceglie una catena di Markov, i ritmi nascono da un algoritmo euclideo, ogni suono è sintetizzato in tempo reale. Non c’è un solo file audio.',
    hint: 'Le note sono disposte sul circolo delle quinte: la forma al centro è l’accordo che senti',
    stack: 'JavaScript + Web Audio + Canvas 2D',
    formula:
      '<div>f = 440 Hz · 2<sup>(n − 69) ⁄ 12</sup></div>' +
      '<div>E<sub>i</sub>(k, n) = [ i·k mod n &lt; k ]</div>',
    how:
      '<p>Un piccolo compositore e un’orchestra di sintetizzatori, scritti da zero. Lo scheduler guarda 120 ms avanti e prenota ogni nota sull’orologio audio, così il tempo resta preciso anche se il browser è occupato.</p>' +
      '<ol>' +
      '<li><strong>Armonia.</strong> A ogni battuta una catena di Markov sceglie il grado successivo del modo, favorendo l’accordo che dà carattere al modo (il ♭VII nel misolidio, il II nel lidio…). Ogni otto battute si torna a casa.</li>' +
      '<li><strong>Condotta delle voci.</strong> Le note dell’accordo vengono sistemate nella stessa ottava, così passano da un accordo all’altro con movimenti minimi.</li>' +
      '<li><strong>Ritmo.</strong> L’arpeggio segue un ritmo euclideo: <em>k</em> colpi distribuiti il più uniformemente possibile su 16 sedicesimi. Sono gli stessi schemi di molta musica tradizionale africana e latina.</li>' +
      '<li><strong>Timbri.</strong> Pad con oscillatori a dente di sega leggermente stonati tra loro e filtro passa-basso; campanelle in sintesi FM; basso sinusoidale; una melodia che cammina sulla scala.</li>' +
      '<li><strong>Spazio.</strong> Il riverbero usa una risposta all’impulso generata con rumore che decade esponenzialmente, più un delay a tempo sulle campanelle.</li>' +
      '</ol>',

    mount(stage, ui) {
      const canvas = document.createElement('canvas');
      stage.append(canvas);
      const ctx = canvas.getContext('2d');

      // ---------- stato musicale ----------
      const st = {
        key: Math.floor(Math.random() * 12),
        modeIdx: 5,
        bpm: 76,
        density: 0.55,
        reverb: 0.55,
        volume: 0.8,
        playing: false,
      };
      let chord = chordOf(st.key, MODES[st.modeIdx], 0);
      let shown = chord;
      let poly = { pcs: chord.pcs, since: 0 }, prevPoly = null;
      let bar = 0, step = 0, nextTime = 0, notesPlayed = 0;
      let pattern = [], arpIdx = 0, leadDeg = 9, leadUntil = 0;
      const events = [];
      const particles = [];

      // ---------- audio ----------
      let actx = null, master, analyser, bus, pluckBus, revSend, delay, timer = 0;
      let wave = null;
      const sixteenth = () => 60 / st.bpm / 4;

      function impulse(seconds, decay) {
        const rate = actx.sampleRate, len = Math.floor(rate * seconds);
        const buf = actx.createBuffer(2, len, rate);
        for (let ch = 0; ch < 2; ch++) {
          const d = buf.getChannelData(ch);
          let lp = 0;
          for (let i = 0; i < len; i++) {
            const t = i / len;
            lp += (Math.random() * 2 - 1 - lp) * (0.85 - 0.7 * t);   // la coda si scurisce
            d[i] = lp * Math.pow(1 - t, decay);
          }
        }
        return buf;
      }

      function buildAudio() {
        actx = new (window.AudioContext || window.webkitAudioContext)();
        master = actx.createGain();
        master.gain.value = st.volume;
        const comp = actx.createDynamicsCompressor();
        comp.threshold.value = -16;
        comp.knee.value = 10;
        comp.ratio.value = 3;
        comp.attack.value = 0.01;
        comp.release.value = 0.25;
        analyser = actx.createAnalyser();
        analyser.fftSize = 2048;
        wave = new Float32Array(analyser.fftSize);

        bus = actx.createGain();
        pluckBus = actx.createGain();
        const dry = actx.createGain();
        dry.gain.value = 0.85;
        const reverb = actx.createConvolver();
        reverb.buffer = impulse(4.8, 2.6);
        revSend = actx.createGain();
        revSend.gain.value = st.reverb;
        delay = actx.createDelay(2);
        delay.delayTime.value = sixteenth() * 3;
        const fb = actx.createGain();
        fb.gain.value = 0.36;
        const dlp = actx.createBiquadFilter();
        dlp.type = 'lowpass';
        dlp.frequency.value = 2600;
        const dSend = actx.createGain();
        dSend.gain.value = 0.26;

        pluckBus.connect(bus);
        pluckBus.connect(dSend);
        dSend.connect(delay);
        delay.connect(dlp);
        dlp.connect(fb);
        fb.connect(delay);
        dlp.connect(bus);
        bus.connect(dry);
        dry.connect(comp);
        bus.connect(revSend);
        revSend.connect(reverb);
        reverb.connect(comp);
        comp.connect(master);
        master.connect(analyser);
        analyser.connect(actx.destination);
      }

      function panned(node, pan, dest) {
        if (actx.createStereoPanner) {
          const p = actx.createStereoPanner();
          p.pan.value = pan;
          node.connect(p);
          p.connect(dest);
        } else node.connect(dest);
      }

      function pad(midi, t, dur) {
        const f = mtof(midi);
        const g = actx.createGain();
        const lp = actx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.Q.value = 0.6;
        lp.frequency.setValueAtTime(380, t);
        lp.frequency.linearRampToValueAtTime(1500, t + 1.6);
        lp.frequency.linearRampToValueAtTime(650, t + dur + 2.4);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.03, t + 1.2);
        g.gain.setValueAtTime(0.03, t + dur);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 2.4);
        for (const [type, det, lvl] of [['sawtooth', -8, 1], ['sawtooth', 7, 1], ['triangle', 0, 1.4]]) {
          const o = actx.createOscillator();
          o.type = type;
          o.frequency.value = f;
          o.detune.value = det;
          const og = actx.createGain();
          og.gain.value = lvl;
          o.connect(og);
          og.connect(lp);
          o.start(t);
          o.stop(t + dur + 2.5);
        }
        lp.connect(g);
        panned(g, (Math.random() - 0.5) * 0.7, bus);
      }

      function fm(midi, t, vel, ratio, index, decay, dest) {
        const f = mtof(midi);
        const car = actx.createOscillator();
        car.frequency.value = f;
        const modu = actx.createOscillator();
        modu.frequency.value = f * ratio;
        const mi = actx.createGain();
        mi.gain.setValueAtTime(f * index, t);
        mi.gain.exponentialRampToValueAtTime(f * 0.02 + 0.01, t + decay * 0.4);
        modu.connect(mi);
        mi.connect(car.frequency);
        const g = actx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vel, t + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
        car.connect(g);
        panned(g, (Math.random() - 0.5) * 1.1, dest);
        car.start(t);
        modu.start(t);
        car.stop(t + decay + 0.05);
        modu.stop(t + decay + 0.05);
      }

      function bass(midi, t, dur) {
        const g = actx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.22, t + 0.06);
        g.gain.exponentialRampToValueAtTime(0.08, t + dur * 0.7);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.6);
        for (const [mult, lvl] of [[1, 1], [2, 0.18]]) {
          const o = actx.createOscillator();
          o.frequency.value = mtof(midi) * mult;
          const og = actx.createGain();
          og.gain.value = lvl;
          o.connect(og);
          og.connect(g);
          o.start(t);
          o.stop(t + dur + 0.7);
        }
        g.connect(bus);
      }

      function lead(midi, t, dur) {
        const o = actx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = mtof(midi);
        const vib = actx.createOscillator();
        vib.frequency.value = 5.2;
        const vg = actx.createGain();
        vg.gain.setValueAtTime(0, t);
        vg.gain.linearRampToValueAtTime(mtof(midi) * 0.006, t + 0.5);
        vib.connect(vg);
        vg.connect(o.frequency);
        const lp = actx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 2200;
        const g = actx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.07, t + 0.07);
        g.gain.setValueAtTime(0.07, t + dur);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.9);
        o.connect(lp);
        lp.connect(g);
        panned(g, (Math.random() - 0.5) * 0.4, pluckBus);
        o.start(t);
        vib.start(t);
        o.stop(t + dur + 1);
        vib.stop(t + dur + 1);
      }

      // ---------- compositore ----------
      function nextDegree() {
        if (bar % 8 === 0) return 0;
        const mode = MODES[st.modeIdx];
        let total = 0;
        const opts = MARKOV[chord.deg].map(([d, w]) => {
          const c = chordOf(st.key, mode, d);
          const wt = c.dim ? 0 : w * (d === mode.color ? 2.4 : 1);
          total += wt;
          return [d, wt];
        });
        let r = Math.random() * total;
        for (const [d, w] of opts) { r -= w; if (r <= 0) return d; }
        return 0;
      }

      function newPattern() {
        const k = 3 + Math.round(st.density * 8);
        const rot = Math.floor(Math.random() * 16);
        pattern = Array.from({ length: 16 }, (_, i) => ((((i + rot) * k) % 16) < k));
      }

      const placeIn = (pc, lo) => lo + mod(pc - lo, 12);

      function playStep(s, t) {
        const t16 = sixteenth();
        const human = () => t + Math.random() * 0.008;
        if (s === 0) {
          if (bar > 0) chord = chordOf(st.key, MODES[st.modeIdx], nextDegree());
          if (bar % 4 === 0) newPattern();
          const barDur = t16 * 16;
          const voicing = chord.pcs.map((pc) => placeIn(pc, 52));
          voicing.forEach((m) => pad(m, t, barDur));
          bass(placeIn(chord.rootPc, 36), t, barDur * 0.9);
          events.push({ t, kind: 'chord', chord, voicing });
          events.push({ t, kind: 'bass', pc: chord.rootPc });
          voicing.forEach((m) => events.push({ t, kind: 'pad', pc: mod(m, 12), dur: barDur }));
          notesPlayed += voicing.length + 1;
          bar++;
        }
        if (s === 10 && Math.random() < 0.35) {
          const m = placeIn(chord.pcs[2], 43);
          bass(m, t, t16 * 5);
          events.push({ t, kind: 'bass', pc: mod(m, 12) });
          notesPlayed++;
        }
        if (pattern[s] && Math.random() < 0.5 + st.density * 0.5) {
          const pool = [];
          for (const pc of chord.pcs) for (let m = placeIn(pc, 62); m <= 86; m += 12) pool.push(m);
          pool.sort((a, b) => a - b);
          arpIdx += Math.random() < 0.7 ? 1 : Math.random() < 0.5 ? -1 : 2;
          if (arpIdx >= pool.length) arpIdx = pool.length - 2;
          if (arpIdx < 0) arpIdx = 1;
          const m = pool[Math.max(0, Math.min(pool.length - 1, arpIdx))];
          const accent = s % 4 === 0 ? 1.3 : 1;
          fm(m, human(), 0.09 * accent * (0.7 + Math.random() * 0.3), 2, 2.4, 1.6, pluckBus);
          events.push({ t, kind: 'pluck', pc: mod(m, 12), midi: m });
          notesPlayed++;
        }
        if (t >= leadUntil && s % 2 === 0 && Math.random() < 0.04 + st.density * 0.1) {
          const mode = MODES[st.modeIdx];
          leadDeg += [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)];
          leadDeg = Math.max(4, Math.min(11, leadDeg));
          const tonic = 60 + (st.key > 5 ? st.key - 12 : st.key);
          const m = tonic + 12 * Math.floor(leadDeg / 7) + mode.steps[leadDeg % 7];
          const dur = t16 * (2 + 2 * Math.floor(Math.random() * 3));
          lead(m, human(), dur);
          leadUntil = t + dur;
          events.push({ t, kind: 'lead', pc: mod(m, 12), dur });
          notesPlayed++;
        }
        if (s % 4 === 2 && Math.random() < 0.07) {
          const m = placeIn(chord.pcs[Math.floor(Math.random() * chord.pcs.length)], 84);
          fm(m, human(), 0.035, 3.5, 3, 3.2, pluckBus);
          events.push({ t, kind: 'bell', pc: mod(m, 12) });
          notesPlayed++;
        }
      }

      function scheduler() {
        while (nextTime < actx.currentTime + 0.12) {
          playStep(step, nextTime);
          nextTime += sixteenth();
          step = (step + 1) % 16;
        }
      }

      async function start() {
        if (!actx) buildAudio();
        await actx.resume();
        if (st.playing) return;
        st.playing = true;
        step = 0;
        nextTime = actx.currentTime + 0.08;
        clearInterval(timer);
        timer = setInterval(scheduler, 25);
        startBtn.remove();
        btns.play.textContent = 'Ferma';
      }

      function stop() {
        st.playing = false;
        clearInterval(timer);
        btns.play.textContent = 'Riprendi';
      }

      // ---------- disegno ----------
      let W = 1, H = 1, dpr = 1;
      function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        W = canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
        H = canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
      }

      // Posizioni in frazioni del raggio del cerchio: restano giuste anche se cambia la risoluzione.
      function spawn(ev) {
        const a = angleOf(ev.pc);
        const jitter = (Math.random() - 0.5) * 0.06;
        switch (ev.kind) {
          case 'chord':
            shown = ev.chord;
            prevPoly = poly;
            poly = { pcs: ev.chord.pcs, since: performance.now() };
            break;
          case 'pluck':
            particles.push({ kind: 'pluck', a: a + jitter, r: 1, vr: 0.18 + ((ev.midi - 62) / 24) * 0.25, life: 2.6, age: 0, size: 3.2 });
            break;
          case 'bell':
            particles.push({ kind: 'bell', a: a + jitter, r: 1.32, vr: 0.03, life: 3.2, age: 0, size: 2.2 });
            break;
          case 'lead':
            particles.push({ kind: 'lead', a, r: 1, vr: -0.16, life: Math.max(1.4, ev.dur + 1), age: 0, size: 4.5 });
            break;
          case 'pad':
            particles.push({ kind: 'pad', a, r: 0.9, vr: -0.02, life: ev.dur + 2.2, age: 0, size: 0.16 });
            break;
          case 'bass':
            particles.push({ kind: 'bass', a: 0, r: 0.16, vr: 0.22, life: 2.2, age: 0, size: 0 });
            break;
        }
      }

      function polyPath(pcs, cx, cy, R) {
        const pts = [...new Set(pcs)].sort((x, y) => mod(x * 7, 12) - mod(y * 7, 12));
        ctx.beginPath();
        pts.forEach((pc, i) => {
          const a = angleOf(pc);
          const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        });
        ctx.closePath();
      }

      let lastFrame = performance.now();
      function draw(now) {
        const dt = Math.max(0, Math.min((now - lastFrame) / 1000, 0.1));
        lastFrame = Math.max(lastFrame, now);
        const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.33;
        const audioNow = actx ? actx.currentTime : 0;
        while (events.length && events[0].t <= audioNow) spawn(events.shift());

        let rms = 0;
        if (analyser) {
          analyser.getFloatTimeDomainData(wave);
          for (let i = 0; i < wave.length; i += 4) rms += wave[i] * wave[i];
          rms = Math.sqrt(rms / (wave.length / 4));
        }

        ctx.fillStyle = '#08080d';
        ctx.fillRect(0, 0, W, H);
        const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.6);
        glow.addColorStop(0, `rgba(185,163,255,${0.07 + Math.min(0.25, rms * 1.6)})`);
        glow.addColorStop(1, 'rgba(185,163,255,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, W, H);

        // Forma dell'accordo sul circolo delle quinte (dissolvenza tra un accordo e l'altro).
        const k = Math.max(0, Math.min(1, (performance.now() - poly.since) / 700));
        if (prevPoly && k < 1) {
          polyPath(prevPoly.pcs, cx, cy, R);
          ctx.fillStyle = `rgba(185,163,255,${0.1 * (1 - k)})`;
          ctx.fill();
        }
        polyPath(poly.pcs, cx, cy, R);
        ctx.fillStyle = `rgba(185,163,255,${0.1 * k})`;
        ctx.fill();
        ctx.lineWidth = 1.5 * dpr;
        ctx.strokeStyle = `rgba(185,163,255,${0.55 * k})`;
        ctx.stroke();

        // Anello della forma d'onda.
        ctx.beginPath();
        const N = 256;
        for (let i = 0; i <= N; i++) {
          const a = (i / N) * Math.PI * 2 - Math.PI / 2;
          const v = wave ? wave[(i % N) * 8] : 0;
          const r = R * 0.52 + v * R * 0.55;
          const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.strokeStyle = 'rgba(233,235,242,0.22)';
        ctx.lineWidth = 1.2 * dpr;
        ctx.stroke();

        // Particelle: ogni nota suonata.
        ctx.globalCompositeOperation = 'lighter';
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          p.age += dt;
          if (p.age >= p.life) { particles.splice(i, 1); continue; }
          p.r += p.vr * dt;
          const life = p.age / p.life;
          const pr = p.r * R;
          const x = cx + Math.cos(p.a) * pr, y = cy + Math.sin(p.a) * pr;
          if (p.kind === 'pad') {
            const env = Math.min(1, p.age / 1.2) * (1 - Math.pow(life, 3));
            const size = p.size * R;
            const g = ctx.createRadialGradient(x, y, 0, x, y, size);
            g.addColorStop(0, `rgba(185,163,255,${0.22 * env})`);
            g.addColorStop(1, 'rgba(185,163,255,0)');
            ctx.fillStyle = g;
            ctx.fillRect(x - size, y - size, size * 2, size * 2);
          } else if (p.kind === 'bass') {
            ctx.beginPath();
            ctx.arc(cx, cy, pr, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(124,200,255,${0.35 * (1 - life)})`;
            ctx.lineWidth = 2 * dpr * (1 - life) + 0.5;
            ctx.stroke();
          } else {
            const color = p.kind === 'lead' ? '255,206,160' : p.kind === 'bell' ? '233,235,242' : '214,200,255';
            const alpha = (1 - life) * (p.kind === 'bell' ? 0.6 + 0.4 * Math.sin(p.age * 20) : 1);
            const tail = p.kind === 'lead' ? -1 : 1;
            const r0 = (p.r - tail * Math.abs(p.vr) * 0.35) * R;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(p.a) * r0, cy + Math.sin(p.a) * r0);
            ctx.lineTo(x, y);
            ctx.strokeStyle = `rgba(${color},${alpha * 0.35})`;
            ctx.lineWidth = p.size * dpr * 0.6;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(x, y, p.size * dpr * (1 - life * 0.5), 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${color},${alpha})`;
            ctx.fill();
          }
        }
        ctx.globalCompositeOperation = 'source-over';

        // Circolo delle quinte: note del modo, note dell'accordo.
        const mode = MODES[st.modeIdx];
        const names = noteNames(st.key, mode);
        const inScale = new Set(mode.steps.map((s) => mod(st.key + s, 12)));
        const inChord = new Set(shown.pcs);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `500 ${11 * dpr}px "JetBrains Mono", Consolas, monospace`;
        for (let pc = 0; pc < 12; pc++) {
          const a = angleOf(pc);
          const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
          const chordTone = inChord.has(pc), scaleTone = inScale.has(pc);
          ctx.beginPath();
          ctx.arc(x, y, (chordTone ? 5.5 : scaleTone ? 3.2 : 2) * dpr, 0, Math.PI * 2);
          ctx.fillStyle = chordTone ? '#b9a3ff' : scaleTone ? '#b7bbc9' : '#3a3f52';
          ctx.fill();
          const lr = R + 24 * dpr;
          ctx.fillStyle = chordTone ? '#e9ebf2' : scaleTone ? '#7f8599' : '#3a3f52';
          ctx.fillText(names[pc], cx + Math.cos(a) * lr, cy + Math.sin(a) * lr);
        }

        // Nome dell'accordo al centro.
        const big = Math.max(26 * dpr, R * 0.2);
        ctx.fillStyle = '#e9ebf2';
        ctx.font = `650 ${big}px "Bricolage Grotesque", "Segoe UI", sans-serif`;
        ctx.fillText(shown.name, cx, cy - big * 0.12);
        ctx.fillStyle = '#b9a3ff';
        ctx.font = `500 ${11.5 * dpr}px "JetBrains Mono", Consolas, monospace`;
        ctx.fillText(`${shown.numeral} · ${names[st.key]} ${mode.name}`.toUpperCase(), cx, cy + big * 0.62);
      }

      // ---------- interfaccia ----------
      const btns = ui.actions([
        { id: 'play', label: 'Ascolta', primary: true, onClick: () => (st.playing ? stop() : start()) },
        {
          id: 'key', label: 'Cambia tonalità',
          onClick: () => {
            st.key = mod(st.key + [5, 7, 2, 10][Math.floor(Math.random() * 4)], 12);
            chord = chordOf(st.key, MODES[st.modeIdx], 0);
            if (!st.playing) { shown = chord; prevPoly = poly; poly = { pcs: chord.pcs, since: performance.now() }; }
          },
        },
      ]);
      ui.slider({
        id: 'mode', label: 'Luminosità del modo', min: 0, max: 5, step: 1, value: st.modeIdx,
        format: (v) => MODES[v].name,
        onInput: (v) => {
          st.modeIdx = v;
          if (!st.playing) { chord = chordOf(st.key, MODES[v], 0); shown = chord; prevPoly = poly; poly = { pcs: chord.pcs, since: performance.now() }; }
        },
      });
      ui.slider({
        id: 'bpm', label: 'Tempo', min: 50, max: 120, step: 1, value: st.bpm, format: (v) => `${v} bpm`,
        onInput: (v) => { st.bpm = v; if (delay) delay.delayTime.setTargetAtTime(sixteenth() * 3, actx.currentTime, 0.2); },
      });
      ui.slider({ id: 'dens', label: 'Densità delle note', min: 0, max: 1, step: 0.01, value: st.density, format: (v) => Math.round(v * 100) + '%', onInput: (v) => (st.density = v) });
      ui.slider({
        id: 'rev', label: 'Riverbero', min: 0, max: 1, step: 0.01, value: st.reverb, format: (v) => Math.round(v * 100) + '%',
        onInput: (v) => { st.reverb = v; if (revSend) revSend.gain.setTargetAtTime(v, actx.currentTime, 0.1); },
      });
      ui.slider({
        id: 'vol', label: 'Volume', min: 0, max: 1, step: 0.01, value: st.volume, format: (v) => Math.round(v * 100) + '%',
        onInput: (v) => { st.volume = v; if (master) master.gain.setTargetAtTime(v, actx.currentTime, 0.05); },
      });

      const sKey = ui.stat('Tonalità');
      const sChord = ui.stat('Accordo');
      const sBar = ui.stat('Battuta');
      const sNotes = ui.stat('Note suonate');

      const startBtn = ui.overlay(Lab.h('button', { type: 'button', class: 'btn primary big' }, 'Avvia l’ascolto'));
      startBtn.addEventListener('click', start);

      resize();
      const stopObs = Lab.observeSize(canvas, resize);
      let raf = 0, tick = 0;
      function frame(now) {
        raf = requestAnimationFrame(frame);
        draw(now);
        if (++tick % 8 === 0) {
          sKey(`${noteNames(st.key, MODES[st.modeIdx])[st.key]} ${MODES[st.modeIdx].name}`);
          sChord(`${shown.name} (${shown.numeral})`);
          sBar(st.playing || bar ? String(bar) : '—');
          sNotes(String(notesPlayed));
        }
      }
      raf = requestAnimationFrame(frame);

      return {
        unmount() {
          cancelAnimationFrame(raf);
          clearInterval(timer);
          stopObs();
          if (actx) actx.close().catch(() => {});
          canvas.remove();
        },
      };
    },
  });
})();
