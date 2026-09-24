/* Laboratorio Opus — guscio dell'interfaccia: schede, pannello, controlli, scorciatoie. */
(function () {
  'use strict';

  const experiments = [];
  let current = null;
  let currentId = null;
  let toastTimer = 0;

  const $ = (sel) => document.querySelector(sel);

  // Piccolo costruttore di elementi DOM: h('div', { class: 'x' }, figli...)
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'style') el.style.cssText = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null) el.append(kid);
    return el;
  }

  // Costruisce i controlli di un esperimento dentro il pannello laterale.
  function makeUI(exp) {
    const controls = $('#controls');
    const stats = $('#stats');
    const extras = $('#extras');
    const overlay = $('#stage-overlay');
    const hint = $('#hint');
    [controls, stats, extras, overlay].forEach((n) => n.replaceChildren());
    hint.textContent = exp.hint || '';
    hint.hidden = !exp.hint;

    const pid = (id) => `ctl-${exp.id}-${id}`;
    const field = (labelEl, valueEl, control) =>
      controls.appendChild(h('div', { class: 'ctl' }, h('div', { class: 'ctl-head' }, labelEl, valueEl), control));

    return {
      slider(o) {
        const id = pid(o.id);
        const fmt = o.format || String;
        const input = h('input', { type: 'range', id, min: o.min, max: o.max, step: o.step ?? 'any', value: o.value });
        const out = h('output', { class: 'ctl-val', for: id });
        const paint = () => {
          const v = parseFloat(input.value);
          out.textContent = fmt(v);
          input.style.setProperty('--p', ((v - o.min) / (o.max - o.min)) * 100 + '%');
          return v;
        };
        paint();
        input.addEventListener('input', () => { const v = paint(); if (o.onInput) o.onInput(v); });
        field(h('label', { for: id }, o.label), out, input);
        return { set(v) { input.value = v; paint(); } };
      },

      segmented(o) {
        const id = pid(o.id);
        const group = h('div', { class: 'seg', role: 'radiogroup', 'aria-labelledby': id + '-l' });
        const buttons = o.options.map((opt, i) => {
          const b = h('button', { type: 'button', role: 'radio', id: `${id}-${i}`, 'aria-checked': String(opt.value === o.value) }, opt.label);
          b.addEventListener('click', () => {
            buttons.forEach((x) => x.setAttribute('aria-checked', String(x === b)));
            if (o.onChange) o.onChange(opt.value);
          });
          return b;
        });
        group.append(...buttons);
        field(h('span', { class: 'ctl-label', id: id + '-l' }, o.label), h('span'), group);
      },

      select(o) {
        const id = pid(o.id);
        const sel = h('select', { id, class: 'select' }, o.options.map((opt) => h('option', { value: opt.value }, opt.label)));
        sel.value = o.value;
        sel.addEventListener('change', () => { if (o.onChange) o.onChange(sel.value); });
        field(h('label', { for: id }, o.label), h('span'), sel);
      },

      toggle(o) {
        const id = pid(o.id);
        const input = h('input', { type: 'checkbox', id, class: 'switch-input', role: 'switch' });
        input.checked = !!o.value;
        input.addEventListener('change', () => { if (o.onChange) o.onChange(input.checked); });
        controls.append(h('label', { class: 'switch', for: id },
          h('span', { class: 'switch-label' }, o.label), input, h('span', { class: 'switch-track', 'aria-hidden': 'true' })));
        return { set(v) { input.checked = !!v; } };
      },

      actions(list) {
        const row = h('div', { class: 'actions' });
        const out = {};
        for (const a of list) {
          const b = h('button', { type: 'button', class: 'btn' + (a.primary ? ' primary' : ''), id: pid(a.id) }, a.label);
          b.addEventListener('click', () => a.onClick(b));
          row.append(b);
          out[a.id] = b;
        }
        controls.append(row);
        return out;
      },

      // Ritorna una funzione che aggiorna il valore solo quando cambia (niente DOM inutile a 60 fps).
      stat(label, initial = '—') {
        const dd = h('dd', {}, initial);
        stats.append(h('div', { class: 'stat' }, h('dt', {}, label), dd));
        let last = initial;
        return (v) => { const s = String(v); if (s !== last) { dd.textContent = s; last = s; } };
      },

      // Un piccolo canvas nel pannello (grafici, rete neurale...). fit() gestisce DPR e larghezza.
      figure(label, height) {
        const canvas = h('canvas', { style: `height:${height}px` });
        extras.append(h('figure', { class: 'figure' }, h('figcaption', { class: 'figure-label' }, label), canvas));
        const ctx = canvas.getContext('2d');
        const f = {
          canvas, ctx, w: 0, h: height,
          fit() {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const w = canvas.clientWidth || 300;
            const pw = Math.round(w * dpr), ph = Math.round(height * dpr);
            if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
            f.w = w;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            return f;
          },
        };
        return f;
      },

      overlay(node) { overlay.append(node); return node; },
      hint(text) { hint.textContent = text || ''; hint.hidden = !text; },
    };
  }

  function select(id) {
    if (id === currentId) return;
    const exp = experiments.find((e) => e.id === id);
    if (!exp) return;
    if (current) {
      try { current.unmount(); } catch (err) { console.error(err); }
      current = null;
    }
    const stage = $('#stage-canvas');
    stage.replaceChildren();
    currentId = id;

    document.documentElement.style.setProperty('--accent', exp.accent);
    document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.id === 'tab-' + id)));
    $('#p-kicker').textContent = exp.kicker;
    $('#p-title').textContent = exp.title;
    $('#p-tagline').textContent = exp.tagline;
    $('#p-formula').innerHTML = exp.formula;
    $('#p-how').innerHTML = exp.how;
    $('#colophon').innerHTML =
      `Scritto da <strong>Claude Opus 5.5</strong> in una sessione.<br>` +
      `${exp.stack} · nessuna libreria esterna.`;
    if (location.hash.slice(1) !== id) history.replaceState(null, '', '#' + id);

    const ui = makeUI(exp);
    try {
      current = exp.mount(stage, ui) || { unmount() {} };
    } catch (err) {
      console.error(err);
      stage.replaceChildren();
      current = Lab.fail(stage, err.message);
    }
    $('#panel').scrollTop = 0;
  }

  function togglePresent() {
    document.body.classList.toggle('present');
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
  }

  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    const tag = (t.tagName || '').toLowerCase();
    if (tag === 'textarea' || tag === 'select' || (tag === 'input' && !['range', 'checkbox'].includes(t.type))) return;
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= experiments.length) select(experiments[n - 1].id);
    else if (e.key === 'h' || e.key === 'H') togglePresent();
    else if (e.key === 'f' || e.key === 'F') toggleFullscreen();
  }

  const Lab = {
    h,
    register(exp) { experiments.push(exp); },

    fail(stage, message) {
      stage.append(h('div', { class: 'fail' },
        h('p', { class: 'fail-title' }, 'Questo esperimento non può partire qui'),
        h('p', {}, message)));
      return { unmount() {} };
    },

    toast(text, ms = 3400) {
      const el = $('#toast');
      el.textContent = text;
      el.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => el.classList.remove('show'), ms);
    },

    // Contatore di fotogrammi al secondo, media su mezzo secondo.
    fpsMeter() {
      let frames = 0, last = performance.now(), fps = 0;
      return () => {
        frames++;
        const now = performance.now();
        if (now - last >= 500) { fps = (frames * 1000) / (now - last); frames = 0; last = now; }
        return fps;
      };
    },

    observeSize(el, cb) {
      const ro = new ResizeObserver(() => cb(el.clientWidth, el.clientHeight));
      ro.observe(el);
      return () => ro.disconnect();
    },

    boot() {
      const tabs = $('#tabs');
      experiments.forEach((exp, i) => {
        const b = h('button', {
          type: 'button', class: 'tab', role: 'tab', id: 'tab-' + exp.id,
          'aria-selected': 'false', 'aria-controls': 'stage',
          title: `${exp.name} (tasto ${i + 1})`, style: `--tab-accent:${exp.accent}`,
        }, h('span', { class: 'dot', 'aria-hidden': 'true' }), exp.name);
        b.addEventListener('click', () => select(exp.id));
        tabs.append(b);
      });
      $('#btn-present').addEventListener('click', togglePresent);
      $('#present-exit').addEventListener('click', togglePresent);
      $('#btn-full').addEventListener('click', toggleFullscreen);
      document.addEventListener('keydown', onKey);
      window.addEventListener('hashchange', () => select(location.hash.slice(1)));

      const fromHash = location.hash.slice(1);
      select(experiments.some((e) => e.id === fromHash) ? fromHash : experiments[0].id);
    },
  };

  window.Lab = Lab;
})();
