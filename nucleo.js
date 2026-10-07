/* ============================================================
   ESTACIÓN 4 — NÚCLEO AMBIENTAL  (estación independiente: se puede jugar en cualquier orden)

   Es una estación de integración: el jugador aplica lo trabajado en el resto del juego
   (instrumentos ambientales y análisis EPI) en situaciones y formatos NUEVOS.

   Reglas de contenido:
   - Sin rankings, puntajes, estadísticas ni posiciones EPI.
   - Sin las situaciones de las otras estaciones (barcos, plaguicidas, lluvia ácida,
     lagos con nutrientes, contaminación del aire, ozono, humedales, etc.).
   - Las relaciones conceptuales vienen de lo ya establecido en el proyecto.

   Las mecánicas (decide, connect, finderror, plan, code) se registran en EA.renderers;
   la decoración (planeta que gira, núcleo que pulsa) se crea con el gancho onOpen.
   ============================================================ */
(() => {
  'use strict';

  const EA = window.EA;
  const R = EA.renderers;

  const h = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // EPI no es un convenio: se describe aquí; el resto sale de EA.INSTRUMENTS
  const EXTRA = {
    epi: { name: 'EPI (análisis)', icon: '📊' },
    // Opciones de texto (reto 1 y reto 2)
    ren_a: { name: 'Impulsar energías renovables y reducir las emisiones.', icon: '☀️' },
    ren_b: { name: 'Aumentar el consumo de combustibles fósiles.',          icon: '🛢️' },
    ren_c: { name: 'Eliminar el control de emisiones.',                     icon: '🚫' },
    ren_d: { name: 'Aumentar únicamente el transporte contaminante.',       icon: '🚚' },
    alem_a: { name: 'Transporte de carga más limpio.',                      icon: '🚛' },
    alem_b: { name: 'Mayor contaminación.',                                 icon: '🏭' },
    alem_c: { name: 'Mayor consumo de combustibles fósiles.',               icon: '🛢️' },
    alem_d: { name: 'Eliminación del transporte de mercancías.',            icon: '📦' },
  };
  const instr = (id) => EXTRA[id] || EA.INSTRUMENTS[id];

  // Marca la opción tocada (y la correcta si falló) y avisa al motor: una sola oportunidad.
  function choose(btn, id, ch, ctx, scope, after) {
    if (ctx.locked()) return;
    const ok = EA.validateAnswer(ch, id);
    btn.classList.add(ok ? 'ok' : 'bad');
    if (!ok) scope.querySelector(`[data-id="${ch.answer}"]`).classList.add('ok');
    if (after) after(ok);
    ctx.finish(ok);
  }

  /* ---------------- 1 · Decisión ambiental (semáforo + situación) ---------------- */
  R.decide = (box, ch, ctx) => {
    const panel = h('div', 'traffic');
    const head = h('div', 'traffic-head');
    const tl = h('span', 'tl');
    tl.append(h('i', 'r'), h('i', 'y'), h('i', 'g'));
    head.append(h('span', '', '🚦 DECISIÓN RÁPIDA'), tl);
    panel.append(head, h('p', 'traffic-text', ch.situation));
    box.append(panel, h('p', 'prompt', ch.prompt));
    const list = h('div', 'options');
    shuffle(ch.options).forEach((id) => {
      const b = h('button', 'opt');
      b.type = 'button';
      b.dataset.id = id;
      b.append(h('span', 'opt-ico', instr(id).icon), h('span', 'opt-txt', instr(id).name));
      b.addEventListener('click', () => choose(b, id, ch, ctx, list));
      list.append(b);
    });
    box.append(list);
  };

  /* ---------------- 2 · Conecta el concepto (dos columnas; cada pareja se marca con un número) ---------------- */
  R.connect = (box, ch, ctx) => {
    box.append(h('p', 'prompt', ch.prompt));
    const cols = h('div', 'match');
    const left = h('div', 'match-col');
    const right = h('div', 'match-col');
    let pickedC = null;
    let pickedI = null;
    let linked = 0;
    let mistakes = 0;

    const clear = () => {
      [pickedC, pickedI].forEach((b) => b && b.classList.remove('sel'));
      pickedC = pickedI = null;
    };
    const attempt = () => {
      if (!pickedC || !pickedI) return;
      const a = pickedC;
      const b = pickedI;
      clear();
      if (EA.validateAnswer(ch, { concept: a.dataset.id, instrument: b.dataset.id })) {
        linked += 1;
        [a, b].forEach((x) => {
          x.classList.add('linked', 'link-' + linked);
          x.disabled = true;
          x.prepend(h('span', 'link-n', String(linked)));
        });
        if (linked === ch.pairs.length) {
          ctx.finish(mistakes === 0, mistakes ? `Tuviste ${mistakes} error${mistakes > 1 ? 'es' : ''} al conectar.` : '');
        }
      } else if (ch.extras) {          // una sola situación con varias opciones: fallo inmediato
        [a, b].forEach((x) => x.classList.add('bad'));
        right.querySelector(`[data-id="${ch.pairs[0].instrument}"]`).classList.add('linked', 'link-1');
        ctx.finish(false);
      } else {
        mistakes += 1;
        [a, b].forEach((x) => { x.classList.add('bad'); setTimeout(() => x.classList.remove('bad'), 350); });
      }
    };
    const pick = (btn, side) => {
      if (ctx.locked() || btn.disabled) return;
      const prev = side === 'c' ? pickedC : pickedI;
      if (prev) prev.classList.remove('sel');
      btn.classList.add('sel');
      if (side === 'c') pickedC = btn; else pickedI = btn;
      attempt();
    };

    ch.pairs.forEach((p) => {
      const b = h('button', 'opt small');
      b.type = 'button';
      b.dataset.id = p.id;
      b.append(h('span', 'opt-ico', p.icon), h('span', 'opt-txt', p.concept));
      b.addEventListener('click', () => pick(b, 'c'));
      left.append(b);
    });
    shuffle(ch.pairs.map((p) => p.instrument).concat(ch.extras || [])).forEach((id) => {
      const b = h('button', 'opt small');
      b.type = 'button';
      b.dataset.id = id;
      b.append(h('span', 'opt-ico', instr(id).icon), h('span', 'opt-txt', instr(id).name));
      b.addEventListener('click', () => pick(b, 'i'));
      right.append(b);
    });
    cols.append(left, right);
    box.append(cols);
  };

  /* ---------------- 3 · ¿Qué está mal? (informe con tres afirmaciones, una incorrecta) ---------------- */
  R.finderror = (box, ch, ctx) => {
    const paper = h('div', 'paper');
    paper.append(h('div', 'paper-head', '📄 INFORME RECIBIDO'));
    paper.append(h('p', 'paper-intro', ch.intro));
    const list = h('div', 'findings');
    shuffle(ch.options).forEach((o) => {
      const b = h('button', 'opt finding');
      b.type = 'button';
      b.dataset.id = o.id;
      b.append(h('span', 'tick', '☐'), h('span', 'opt-txt', o.text));
      b.addEventListener('click', () => choose(b, o.id, ch, ctx, list, () => {
        // la afirmación con el error queda marcada con ❌ y las coherentes con ✔
        list.querySelectorAll('.finding').forEach((x) => {
          const isAnswer = x.dataset.id === ch.answer;
          x.querySelector('.tick').textContent = (isAnswer !== !!ch.answerIsRight) ? '❌' : '✔';
        });
      }));
      list.append(b);
    });
    paper.append(list);
    box.append(paper);
    box.append(h('p', 'prompt decision-q', ch.prompt));
  };

  /* ---------------- 4 · Plan de acción (concepto + situación práctica + 3 acciones) ---------------- */
  R.plan = (box, ch, ctx) => {
    box.append(h('div', 'concept-chip', '🌎 CONCEPTO: ' + ch.concept));
    const s = h('div', 'situation');
    s.append(h('span', 'sit-k', '📍 SITUACIÓN'), h('p', 'prompt', ch.situation));
    box.append(s, h('p', 'prompt', ch.prompt));
    const list = h('div', 'options one');
    shuffle(ch.options).forEach((o) => {
      const b = h('button', 'opt');
      b.type = 'button';
      b.dataset.id = o.id;
      b.append(h('span', 'opt-ico', o.icon), h('span', 'opt-txt', o.text));
      b.addEventListener('click', () => choose(b, o.id, ch, ctx, list));
      list.append(b);
    });
    box.append(list);
  };

  /* ---------------- 5 · Código ambiental (tres pistas abren el candado) ---------------- */
  R.code = (box, ch, ctx) => {
    const panel = h('div', 'code-panel');
    panel.append(h('div', 'code-head', '🔐 CÓDIGO AMBIENTAL'));
    const slots = [];
    ch.clues.forEach((c, i) => {
      const p = h('div', 'pista');
      const top = h('div', 'pista-top');
      const lock = h('span', 'lock', '🔒');
      top.append(lock, h('span', '', `PISTA ${i + 1} · ${c.label}`));
      p.append(top, h('p', 'pista-text', c.text));
      panel.append(p);
      slots.push({ p, lock });
    });
    box.append(panel, h('p', 'prompt decision-q', ch.prompt));
    const grid = h('div', 'cards');
    shuffle(ch.options).forEach((id) => {
      const b = h('button', 'card-opt');
      b.type = 'button';
      b.dataset.id = id;
      b.append(h('span', 'card-ico', instr(id).icon), h('span', 'card-txt', instr(id).name));
      b.addEventListener('click', () => choose(b, id, ch, ctx, grid, (ok) => {
        slots.forEach((s) => { s.p.classList.add(ok ? 'open' : 'fail'); s.lock.textContent = ok ? '🔓' : '🔒'; });
      }));
      grid.append(b);
    });
    box.append(grid);
  };

  /* ---------------- decoración del núcleo: planeta que gira y núcleo que pulsa ---------------- */
  // Hoja de 8 fotogramas del planeta (esfera con continentes); se anima solo con CSS (steps)
  function planetSheet() {
    const F = 8, S = 16;
    const cv = document.createElement('canvas');
    cv.width = S * F; cv.height = S;
    const c = cv.getContext('2d');
    for (let f = 0; f < F; f++) {
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const nx = (x + .5 - S / 2) / (S / 2), ny = (y + .5 - S / 2) / (S / 2);
          const d2 = nx * nx + ny * ny;
          if (d2 > 1) continue;
          const lon = Math.atan2(nx, Math.sqrt(1 - d2)) + f / F * Math.PI * 2;
          const lat = Math.asin(ny);
          const land = Math.sin(lon * 2 + 1) * Math.cos(lat * 2) + 0.6 * Math.sin(lon * 3 - 2 + lat * 2) > 0.45;
          let col = land ? '#4cc94c' : '#2a7de1';
          if (d2 > 0.78) col = land ? '#2e9e3e' : '#1c55b0';
          else if (nx + ny < -0.9) col = land ? '#7fe06a' : '#5cb5ff';
          if (d2 > 0.9) col = '#12305f';
          c.fillStyle = col;
          c.fillRect(f * S + x, y, 1, 1);
        }
      }
    }
    return cv.toDataURL();
  }

  function orbCanvas() {
    const cv = document.createElement('canvas');
    cv.width = 16; cv.height = 16;
    cv.className = 'core-orb';
    const c = cv.getContext('2d');
    const disc = (r, col) => {
      c.fillStyle = col;
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++)
        if (x * x + y * y <= r * r + r * .5) c.fillRect(8 + x, 8 + y, 1, 1);
    };
    disc(7, '#7b4fd1'); disc(6, '#2fd1b0'); disc(4, '#5af0c8'); disc(2, '#c9fff0');
    c.fillStyle = '#ffffff'; c.fillRect(5, 4, 2, 1);
    return cv;
  }

  function onOpen(screen) {
    const head = screen.querySelector('.st-head');
    if (head.querySelector('.core-deco')) return;
    const deco = h('div', 'core-deco');
    deco.setAttribute('aria-hidden', 'true');
    const planet = h('div', 'planet-spin');
    planet.style.backgroundImage = `url(${planetSheet()})`;
    const lights = h('span', 'lights');
    lights.append(h('i'), h('i'), h('i'));
    deco.append(planet, orbCanvas(), lights);
    head.appendChild(deco);
  }

  // Franja: conducto de energía con nodos y el núcleo en el centro
  function drawBanner(ctx, w, hgt) {
    ctx.fillStyle = '#2fd1b0'; ctx.fillRect(0, 4, w, 2);
    ctx.fillStyle = '#8ff0dc'; ctx.fillRect(0, 4, w, 1);
    for (let x = 6; x < w; x += 14) {
      if (Math.abs(x - 48) < 10) continue;
      ctx.fillStyle = '#ffe14d'; ctx.fillRect(x, 2, 3, 6);
      ctx.fillStyle = '#fff3a0'; ctx.fillRect(x, 2, 3, 1);
    }
    for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) {
      const d = x * x + y * y;
      if (d > 18) continue;
      ctx.fillStyle = d > 12 ? '#7b4fd1' : d > 5 ? '#2fd1b0' : '#c9fff0';
      ctx.fillRect(48 + x, 5 + y, 1, 1);
    }
  }

  /* ---------------- registro de la estación ---------------- */
  EA.registerStation({
    id: 'nucleo',
    icon: '🔐',
    name: 'NÚCLEO AMBIENTAL',
    subtitle: 'El núcleo central necesita que uses lo que aprendiste. Analiza, decide y activa el código ambiental.',
    accent: '#7b4fd1',
    theme: 'core',
    doneTitle: '✓ ¡NÚCLEO AMBIENTAL COMPLETADO!',
    drawBanner,
    onOpen,
    challenges: [
      // 1 · Decisión ambiental
      {
        type: 'decide',
        title: '🚦 DECISIÓN AMBIENTAL',
        situation: 'Un país quiere avanzar hacia una economía con menor uso de combustibles fósiles y aumentar el uso de energías renovables.',
        prompt: '¿Cuál de estas acciones está más relacionada con ese objetivo?',
        options: ['ren_a', 'ren_b', 'ren_c', 'ren_d'],
        answer: 'ren_a',
        explain: 'Impulsar energías renovables y reducir las emisiones es lo que conduce a ese objetivo.',
      },
      // 2 · Conecta el concepto (una situación, cuatro opciones)
      {
        type: 'connect',
        title: '🧩 CONECTA EL CONCEPTO',
        prompt: 'Alemania utiliza un sistema de cobro para el transporte de carga que incorpora criterios relacionados con las emisiones de CO₂. ¿Qué busca favorecer este tipo de medida? Toca la situación y luego la respuesta.',
        pairs: [
          { id: 'alemania', concept: 'Alemania: cobro para el transporte de carga según las emisiones de CO₂', icon: '🚛', instrument: 'alem_a' },
        ],
        extras: ['alem_b', 'alem_c', 'alem_d'],
        explain: 'Este tipo de medida busca favorecer un transporte de carga más limpio.',
      },
      // 3 · ¿Qué está mal?
      {
        type: 'finderror',
        title: '⚠️ ¿QUÉ ESTÁ MAL?',
        intro: '"Si una empresa fabrica un producto, toda la responsabilidad ambiental termina cuando el producto se vende."',
        prompt: '¿Qué está mal en esta afirmación?',
        answerIsRight: true,
        options: [
          { id: 'a', text: 'Ignora la responsabilidad del productor sobre los impactos ambientales asociados al producto.' },
          { id: 'b', text: 'El producto deja de existir después de venderse.' },
          { id: 'c', text: 'El consumidor no utiliza productos.' },
          { id: 'd', text: 'Las empresas no producen residuos.' },
        ],
        answer: 'a',
        explain: 'La responsabilidad del productor sobre los impactos ambientales del producto no termina con la venta.',
      },
      // 4 · Plan de acción
      {
        type: 'plan',
        title: '🌎 PLAN DE ACCIÓN',
        concept: 'residuos y gestión de productos usados',
        situation: 'Una empresa quiere disminuir los residuos y mejorar la gestión de sus productos después de ser utilizados.',
        prompt: '¿Cuál acción sería más adecuada?',
        options: [
          { id: 'circular', icon: '♻️', text: 'Implementar medidas de economía circular y logística inversa.' },
          { id: 'final', icon: '🗑️', text: 'Aumentar los residuos enviados directamente a disposición final.' },
          { id: 'sinrec', icon: '🚫', text: 'Eliminar la recuperación de materiales.' },
          { id: 'masmat', icon: '🏭', text: 'Utilizar más materiales sin posibilidad de aprovechamiento.' },
        ],
        answer: 'circular',
        explain: 'La economía circular y la logística inversa permiten disminuir residuos y aprovechar los productos usados.',
      },
      // 5 · Código ambiental: tres pistas apuntan a un solo instrumento
      {
        type: 'code',
        title: '🔐 CÓDIGO AMBIENTAL',
        clues: [
          { label: 'PISTA', text: 'Protege ecosistemas de gran importancia como los humedales.' },
          { label: 'PISTA', text: 'Promueve su conservación y uso racional.' },
          { label: 'PISTA', text: 'Es un instrumento internacional.' },
        ],
        prompt: '¿Qué instrumento estás buscando?',
        options: ['ramsar', 'kioto', 'cites', 'basilea'],
        answer: 'ramsar',
        explain: 'El Convenio Ramsar protege los humedales y promueve su conservación y uso racional.',
      },
    ],
  });
})();
