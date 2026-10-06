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
  const EXTRA = { epi: { name: 'EPI (análisis)', icon: '📊' } };
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
    shuffle(ch.pairs).forEach((p) => {
      const b = h('button', 'opt small');
      b.type = 'button';
      b.dataset.id = p.instrument;
      b.append(h('span', 'opt-ico', instr(p.instrument).icon), h('span', 'opt-txt', instr(p.instrument).name));
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
          x.querySelector('.tick').textContent = x.dataset.id === ch.answer ? '❌' : '✔';
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
      // 1 · Situación → instrumento (Basilea, situación nueva)
      {
        type: 'decide',
        title: '🚦 DECISIÓN AMBIENTAL',
        situation: 'Una empresa quiere enviar desechos peligrosos a otro país para tratarlos.',
        prompt: '¿Qué convenio está relacionado con esta situación?',
        options: ['basilea', 'kioto', 'escazu', 'cites'],
        answer: 'basilea',
        explain: 'Convenio de Basilea: movimiento de desechos peligrosos entre países.',
      },
      // 2 · Conectar ideas con instrumentos (3 parejas, redactadas de otra forma)
      {
        type: 'connect',
        title: '🧩 CONECTA EL CONCEPTO',
        prompt: 'Une cada idea con su instrumento: toca una y después la otra.',
        pairs: [
          { id: 'desempeno', concept: 'Medir cómo le va a un país en lo ambiental', icon: '🔎', instrument: 'epi' },
          { id: 'pantanos',  concept: 'Cuidar pantanos y lagunas con uso responsable', icon: '🌾', instrument: 'ramsar' },
          { id: 'calor',     concept: 'Reducir los gases que calientan el planeta',    icon: '🌡️', instrument: 'kioto' },
        ],
        explain: 'EPI: desempeño ambiental · Ramsar: uso responsable de pantanos · Kioto: gases que calientan el planeta.',
      },
      // 3 · Detectar el error conceptual (dos afirmaciones coherentes, una incorrecta)
      {
        type: 'finderror',
        title: '⚠️ ¿QUÉ ESTÁ MAL?',
        intro: 'El sistema recibió este informe. Dos afirmaciones son coherentes y una contiene un error.',
        prompt: '¿Qué afirmación es la incorrecta?',
        options: [
          { id: 'a', text: 'La comunidad recibió información ambiental y pudo participar (Acuerdo de Escazú).' },
          { id: 'b', text: 'Los países adoptaron el Acuerdo de París en la COP21, en 2015.' },
          { id: 'c', text: 'Para analizar su desempeño ambiental, el país usó el Protocolo de Montreal.' },
        ],
        answer: 'c',
        explain: 'El desempeño ambiental se analiza con el EPI; el Protocolo de Montreal es otro instrumento.',
      },
      // 4 · Plan de acción (CITES, situación práctica nueva)
      {
        type: 'plan',
        title: '🌎 PLAN DE ACCIÓN',
        concept: 'comercio internacional de animales y plantas en peligro',
        situation: 'Una comunidad costera descubre que un comerciante quiere vender a otro país animales silvestres en peligro de extinción.',
        prompt: '¿Qué acción es más coherente con el concepto?',
        options: [
          { id: 'avisar', icon: '📢', text: 'Avisar a las autoridades y no participar en esa venta.' },
          { id: 'revender', icon: '💰', text: 'Comprarlos para revenderlos a un precio más alto.' },
          { id: 'ignorar', icon: '🙈', text: 'Ignorarlo porque no afecta a la comunidad.' },
        ],
        answer: 'avisar',
        explain: 'Lo coherente es no participar en ese comercio y avisar a las autoridades (CITES).',
      },
      // 5 · Código: tres pistas (concepto, situación, decisión) apuntan a un solo instrumento
      {
        type: 'code',
        title: '🔐 CÓDIGO AMBIENTAL',
        clues: [
          { label: 'CONCEPTO', text: 'Es un informe de 1987, no un tratado.' },
          { label: 'SITUACIÓN', text: 'Un pueblo pesquero quiere seguir viviendo del mar durante muchos años.' },
          { label: 'DECISIÓN', text: 'Planificar pensando también en las generaciones futuras.' },
        ],
        prompt: '¿Qué instrumento abre el código?',
        options: ['brundtland', 'montreal', 'basilea', 'ramsar'],
        answer: 'brundtland',
        explain: 'Informe de Brundtland (1987): desarrollo sostenible, pensando en las generaciones futuras.',
      },
    ],
  });
})();
