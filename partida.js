/* ============================================================
   PARTIDA — estado general, tiempo, puntos, mapa y motor de estaciones

   El contenido de cada estación vive en su propio archivo
   (archivo.js) y se registra con EA.registerStation({...}).
   Las estaciones sin registrar muestran "ESTACIÓN EN PREPARACIÓN".

   No hay conexión con servicios externos: el estado vive en memoria.
   Las funciones públicas (EA.updatePoints, EA.markStationCompleted…)
   son los puntos donde más adelante se conectará Supabase.
   ============================================================ */
(() => {
  'use strict';

  const EA = window.EA;
  const $ = (id) => document.getElementById(id);

  const TOTAL_STATIONS = 4;
  const POINTS_CORRECT = 100;       // respuesta correcta; la incorrecta suma 0 (sin penalización)
  const POINTS_STATION = 500;       // bonus al completar una estación
  const DELAY_OK = 500;             // ms que se ve "CORRECTO" antes de avanzar (casi inmediato)
  const DELAY_BAD = 1500;           // ms que se ve "INCORRECTO"; tocar el aviso lo salta al instante

  const stations = EA.stations = {};
  EA.registerStation = (def) => { stations[def.id] = def; };

  const state = EA.state = {
    running: false,
    startedAt: 0,
    points: 0,
    completed: new Set(),      // ids de estaciones completadas
    progress: {},              // id -> { index, results: [bool] }
    currentStation: null,
    locked: false,             // true mientras se muestra la retroalimentación
    playerName: null,
    clockId: 0,
    nextTimer: 0,
    speedTimer: 0,
  };

  /* ---------------- utilidades ---------------- */
  const pad2 = (n) => String(n).padStart(2, '0');
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
  const instr = (id) => (EA.INSTRUMENTS && EA.INSTRUMENTS[id]) || { name: id, icon: '' };

  /* ---------------- tiempo ---------------- */
  let shownTime = '';
  function formatTime(ms) {
    const s = Math.floor(ms / 1000);
    return pad2(Math.floor(s / 60)) + ':' + pad2(s % 60);
  }

  // Sigue contando en el mapa, dentro de una estación y en la pantalla de completado
  function updateTime() {
    if (!state.running) return;
    const t = formatTime(Date.now() - state.startedAt);
    if (t !== shownTime) {
      shownTime = t;
      $('hud-time').textContent = t;
    }
  }

  function startTimer() {
    state.startedAt = Date.now();
    state.running = true;
    shownTime = '';
    updateTime();
    clearInterval(state.clockId);
    state.clockId = setInterval(updateTime, 250);
  }

  /* ---------------- puntos y estaciones ---------------- */
  function bump(el) {
    el.classList.remove('bump');
    void el.offsetWidth;            // reinicia la animación
    el.classList.add('bump');
  }

  function updatePoints(delta) {
    state.points += delta;
    $('hud-points').textContent = state.points;
    if (delta) bump($('hud-points'));
  }

  function updateStationsHud() {
    $('hud-stations').textContent = `${state.completed.size}/${TOTAL_STATIONS}`;
    bump($('hud-stations'));
  }

  function markStationCompleted(id) {
    state.completed.add(id);
    updateStationsHud();
    const el = document.querySelector(`.station[data-station="${id}"]`);
    if (el) {
      el.classList.add('done');
      if (!el.querySelector('.badge')) {
        const b = h('span', 'badge', '✔ COMPLETADA');
        el.appendChild(b);
      }
    }
  }

  function resetGameState(playerName) {
    clearInterval(state.clockId);
    clearTimeout(state.nextTimer);
    clearTimeout(state.speedTimer);
    state.running = false;
    state.points = 0;
    state.completed = new Set();
    state.progress = {};
    state.currentStation = null;
    state.locked = false;
    state.playerName = playerName || null;
    $('hud-time').textContent = '00:00';
    $('hud-points').textContent = '0';
    $('hud-stations').textContent = `0/${TOTAL_STATIONS}`;
    document.querySelectorAll('.station.done').forEach((el) => {
      el.classList.remove('done');
      const b = el.querySelector('.badge');
      if (b) b.remove();
    });
  }

  /* ---------------- transición y avisos ---------------- */
  const WIPE_COLORS = ['#2a7de1', '#2fd1b0', '#4cc94c', '#ffe14d', '#5cc6fa'];

  function buildWipe() {
    const grid = $('wipe-grid');
    if (grid.children.length) return;
    for (let i = 0; i < 16 * 10; i++) {
      const c = h('i');
      c.style.background = WIPE_COLORS[(i + Math.floor(i / 16)) % WIPE_COLORS.length];
      c.style.transitionDelay = Math.floor(Math.random() * 400) + 'ms';
      grid.appendChild(c);
    }
  }

  // Cubre la pantalla con un mosaico de píxeles, cambia de pantalla por debajo y lo retira.
  function transition(title, sub, onMid, onDone) {
    buildWipe();
    const wipe = $('wipe');
    const text = $('wipe-text');
    text.innerHTML = '';
    text.append(h('strong', '', title), h('span', '', sub));
    EA.fixAccents(text);
    wipe.classList.add('cover');
    setTimeout(() => {
      onMid();
      setTimeout(() => {
        wipe.classList.remove('cover');
        if (onDone) setTimeout(onDone, 500);
      }, 1100);
    }, 750);
  }

  let toastTimer = 0;
  function showToast(msg) {
    const t = $('toast');
    t.textContent = msg;
    EA.fixAccents(t);
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 1900);
  }

  /* ---------------- inicio de la partida ---------------- */
  function startMission(opts = {}) {
    resetGameState(opts.playerName);
    transition('¡MISIÓN INICIADA!', 'Recupera las claves de seguridad', () => {
      EA.showScreen('room-screen');
    }, () => {
      startTimer();             // el cronómetro arranca cuando el mapa ya es visible
    });
  }

  /* ---------------- estaciones ---------------- */
  function openStation(id) {
    if (!state.running) return;
    const def = stations[id];
    if (!def) { showToast('ESTACIÓN EN PREPARACIÓN'); return; }
    if (state.completed.has(id)) { showToast('✔ ESTACIÓN YA COMPLETADA'); return; }

    state.currentStation = id;
    if (!state.progress[id]) state.progress[id] = { index: 0, results: [] };

    const screen = $('station-screen');
    screen.style.setProperty('--accent', def.accent || '#c9873a');
    screen.dataset.theme = def.theme || '';
    if (def.onOpen) def.onOpen(screen);            // decoración propia de la estación (opcional)
    $('st-title').textContent = `${def.icon} ${def.name}`;
    $('st-sub').textContent = def.subtitle;
    const banner = $('shelf');
    banner.hidden = !def.drawBanner;
    if (def.drawBanner) {
      const c = banner.getContext('2d');
      c.clearRect(0, 0, banner.width, banner.height);
      def.drawBanner(c, banner.width, banner.height);
    }
    EA.fixAccents($('st-title'));
    EA.fixAccents($('st-sub'));
    EA.showScreen('station-screen');
    showChallenge(state.progress[id].index);
  }

  function closeStation() {
    if (state.locked) return;
    clearTimeout(state.speedTimer);
    state.currentStation = null;
    $('feedback').hidden = true;
    EA.showScreen('room-screen');
  }

  function renderDots(def, prog) {
    const dots = $('st-dots');
    dots.innerHTML = '';
    def.challenges.forEach((_, i) => {
      const d = h('i');
      if (i < prog.results.length) d.className = prog.results[i] ? 'ok' : 'bad';
      else if (i === prog.index) d.className = 'now';
      dots.appendChild(d);
    });
  }

  // Muestra el desafío número `i` de la estación abierta
  function showChallenge(i) {
    const def = stations[state.currentStation];
    const prog = state.progress[state.currentStation];
    const ch = def.challenges[i];
    clearTimeout(state.speedTimer);
    state.locked = false;
    $('st-exit').disabled = false;
    $('feedback').hidden = true;
    $('st-count').textContent = `DESAFÍO ${i + 1}/${def.challenges.length}`;
    EA.fixAccents($('st-count'));
    $('station-screen').classList.toggle('compact', i > 0);   // cabecera reducida: más sitio para el desafío
    renderDots(def, prog);

    const box = $('challenge');
    box.innerHTML = '';
    box.append(h('p', 'ch-type', ch.title));
    renderers[ch.type](box, ch, {
      locked: () => state.locked,
      finish: (ok, note) => resolveChallenge(ok, ch, note),
    });
    EA.fixAccents(box);
    box.classList.remove('enter');
    void box.offsetWidth;
    box.classList.add('enter');
    $('station-screen').scrollTop = 0;
  }

  // ¿Es correcta la respuesta? (se usa desde todas las mecánicas)
  function validateAnswer(ch, answer) {
    switch (ch.type) {
      case 'match':
      case 'connect': {
        const pair = ch.pairs.find((p) => p.id === answer.concept);
        return !!pair && pair.instrument === answer.instrument;
      }
      default:                       // choice, truefalse, cards, speed… (answer puede ser una lista de respuestas válidas)
        return Array.isArray(ch.answer) ? ch.answer.includes(answer) : answer === ch.answer;
    }
  }

  // Registra el resultado, suma puntos, muestra ✅/❌ y avanza
  function resolveChallenge(ok, ch, note) {
    if (state.locked) return;
    state.locked = true;
    clearTimeout(state.speedTimer);
    $('st-exit').disabled = true;
    const def = stations[state.currentStation];
    const prog = state.progress[state.currentStation];
    prog.results[prog.index] = ok;
    prog.index += 1;
    if (ok) updatePoints(POINTS_CORRECT);
    renderDots(def, { ...prog, index: prog.index });
    showFeedback(ok, ch, note);

    const id = state.currentStation;
    state.advance = () => {
      clearTimeout(state.nextTimer);
      state.nextTimer = 0;
      $('feedback').hidden = true;
      if (prog.index >= def.challenges.length) completeStation(id);
      else showChallenge(prog.index);
    };
    state.nextTimer = setTimeout(state.advance, ok ? DELAY_OK : DELAY_BAD);
  }

  function showFeedback(ok, ch, note) {
    const f = $('feedback');
    f.innerHTML = '';
    f.className = 'feedback ' + (ok ? 'ok' : 'bad');
    f.append(h('div', 'fb-big', ok ? (ch.okText || '✅ CORRECTO') : (ch.badText || '❌ INCORRECTO')));
    if (ok) f.append(h('div', 'fb-pts', `+${POINTS_CORRECT}`));
    else {
      if (note) f.append(h('div', 'fb-note', note));
      if (ch.explain) f.append(h('div', 'fb-note', ch.explain));
      f.append(h('div', 'fb-skip', 'Toca para continuar ▶'));
    }
    EA.fixAccents(f);
    f.hidden = false;
  }

  function completeStation(id) {
    if (state.completed.has(id)) return;          // nunca se otorgan los +500 dos veces
    const def = stations[id];
    const prog = state.progress[id];
    const correct = prog.results.filter(Boolean).length;
    updatePoints(POINTS_STATION);
    markStationCompleted(id);
    $('done-title').textContent = def.doneTitle || `🎉 ¡${def.name} COMPLETADO!`;
    $('done-detail').textContent =
      `Aciertos: ${correct}/${def.challenges.length} (+${correct * POINTS_CORRECT}) · Bonus de estación: +${POINTS_STATION}`;
    $('done-stations').textContent = `${state.completed.size}/${TOTAL_STATIONS}`;
    EA.fixAccents($('done-title'));
    EA.fixAccents($('done-detail'));
    state.currentStation = null;
    EA.showScreen('complete-screen');
  }

  /* ---------------- mecánicas de desafío ---------------- */
  const renderers = EA.renderers = {};

  // Selección rápida: una pregunta y varias opciones
  renderers.choice = (box, ch, ctx) => {
    box.append(h('p', 'prompt', ch.prompt));
    const list = h('div', 'options');
    shuffle(ch.options).forEach((id) => {
      const b = h('button', 'opt');
      b.type = 'button';
      b.dataset.id = id;
      b.append(h('span', 'opt-ico', instr(id).icon), h('span', 'opt-txt', instr(id).name));
      b.addEventListener('click', () => {
        if (ctx.locked()) return;
        const ok = EA.validateAnswer(ch, id);
        b.classList.add(ok ? 'ok' : 'bad');
        if (!ok) list.querySelector(`[data-id="${ch.answer}"]`).classList.add('ok');
        ctx.finish(ok);
      });
      list.append(b);
    });
    box.append(list);
  };

  // Relacionar: tocar un concepto y luego su instrumento (sin arrastrar)
  renderers.match = (box, ch, ctx) => {
    box.append(h('p', 'prompt', ch.prompt));
    const cols = h('div', 'match');
    const left = h('div', 'match-col');
    const right = h('div', 'match-col');
    let pickedC = null;
    let pickedI = null;
    let matched = 0;
    let mistakes = 0;

    const clearPick = () => {
      [pickedC, pickedI].forEach((b) => b && b.classList.remove('sel'));
      pickedC = pickedI = null;
    };
    const attempt = () => {
      if (!pickedC || !pickedI) return;
      const ok = EA.validateAnswer(ch, { concept: pickedC.dataset.id, instrument: pickedI.dataset.id });
      const a = pickedC;
      const b = pickedI;
      clearPick();
      if (ok) {
        [a, b].forEach((x) => { x.classList.add('matched'); x.disabled = true; });
        matched += 1;
        if (matched === ch.pairs.length) {
          ctx.finish(mistakes === 0, mistakes ? `Tuviste ${mistakes} error${mistakes > 1 ? 'es' : ''} al relacionar.` : '');
        }
      } else {
        mistakes += 1;
        [a, b].forEach((x) => {
          x.classList.add('bad');
          setTimeout(() => x.classList.remove('bad'), 500);
        });
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

  // Verdadero / Falso
  renderers.truefalse = (box, ch, ctx) => {
    box.append(h('p', 'prompt statement', ch.statement));
    const row = h('div', 'tf');
    const labels = ch.labels || ['✔ VERDADERO', '✘ FALSO'];
    [[true, labels[0], 'tf-yes'], [false, labels[1], 'tf-no']].forEach(([val, label, cls]) => {
      const b = h('button', 'opt big ' + cls, label);
      b.type = 'button';
      b.addEventListener('click', () => {
        if (ctx.locked()) return;
        const ok = EA.validateAnswer(ch, val);
        b.classList.add(ok ? 'ok' : 'bad');
        if (!ok) row.querySelector(val ? '.tf-no' : '.tf-yes').classList.add('ok');
        ctx.finish(ok);
      });
      row.append(b);
    });
    box.append(row);
  };

  // Tarjetas: situación + varias tarjetas de instrumentos (también sirve para el reto con cuenta atrás)
  function renderCards(box, ch, ctx, timed) {
    if (ch.situation) {
      const s = h('div', 'situation');
      s.append(h('span', 'sit-k', '📋 SITUACIÓN'), h('p', 'prompt', ch.situation));
      box.append(s);
    } else {
      box.append(h('p', 'prompt', ch.prompt));
    }
    let bar = null;
    if (timed) {
      bar = h('div', 'countdown');
      const fill = h('i');
      fill.style.animationDuration = ch.seconds + 's';
      bar.append(fill);
      box.append(bar);
    }
    const grid = h('div', 'cards');
    shuffle(ch.options).forEach((id) => {
      const b = h('button', 'card-opt');
      b.type = 'button';
      b.dataset.id = id;
      b.append(h('span', 'card-ico', instr(id).icon), h('span', 'card-txt', instr(id).name));
      b.addEventListener('click', () => {
        if (ctx.locked()) return;
        const ok = EA.validateAnswer(ch, id);
        b.classList.add(ok ? 'ok' : 'bad');
        if (!ok) grid.querySelector(`[data-id="${ch.answer}"]`).classList.add('ok');
        if (bar) bar.classList.add('stop');
        ctx.finish(ok);
      });
      grid.append(b);
    });
    box.append(grid);
    if (timed) {
      state.speedTimer = setTimeout(() => {
        if (ctx.locked()) return;
        grid.querySelector(`[data-id="${ch.answer}"]`).classList.add('ok');
        bar.classList.add('stop');
        ctx.finish(false, '⏱ ¡Se acabó el tiempo!');
      }, ch.seconds * 1000);
    }
  }
  renderers.cards = (box, ch, ctx) => renderCards(box, ch, ctx, false);
  renderers.speed = (box, ch, ctx) => renderCards(box, ch, ctx, true);

  /* ---------------- API pública y eventos ---------------- */
  EA.startMission = startMission;
  EA.updatePoints = updatePoints;
  EA.updateTime = updateTime;
  EA.markStationCompleted = markStationCompleted;
  EA.openStation = openStation;
  EA.closeStation = closeStation;
  EA.showChallenge = showChallenge;
  EA.validateAnswer = validateAnswer;
  EA.showToast = showToast;

  document.querySelectorAll('.station[data-station]').forEach((el) => {
    el.addEventListener('click', () => openStation(el.dataset.station));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openStation(el.dataset.station);
      }
    });
  });
  // Tocar el aviso de "INCORRECTO" salta la espera y pasa al siguiente desafío
  $('feedback').addEventListener('click', () => { if (state.nextTimer && state.advance) state.advance(); });
  $('st-exit').addEventListener('click', closeStation);
  $('done-back').addEventListener('click', () => EA.showScreen('room-screen'));
})();
