/* ============================================================
   PARTIDA — estado individual, cuenta regresiva, puntos, salida y
   motor de estaciones

   El contenido de cada estación vive en su propio archivo
   (archivo.js…) y se registra con EA.registerStation({...}).
   El movimiento por el mapa y la entrada a las estaciones están en
   mapa.js: aquí solo se abre una estación cuando el jugador está cerca.

   Cada dispositivo controla a UN jugador (o es el anfitrión, que no
   juega). Su estado vive en EA.state.player con la misma forma que
   tendrá en Supabase; mientras tanto se publica con EA.backend.
   ============================================================ */
(() => {
  'use strict';

  const EA = window.EA;
  const $ = (id) => document.getElementById(id);

  const TOTAL_STATIONS = 4;
  const POINTS_CORRECT = 100;       // respuesta correcta; la incorrecta suma 0 (sin penalización)
  const POINTS_STATION = 500;       // bonus al completar una estación...
  const STATION_MIN_CORRECT = 3;    // ...pero solo si acierta al menos 3 de sus 5 retos (si no, 0 de bonus)
  const DELAY_OK = 500;             // ms que se ve "CORRECTO" antes de avanzar (casi inmediato)
  const DELAY_BAD = 1500;           // ms que se ve "INCORRECTO"; tocar el aviso lo salta al instante
  const GAME_MS = 15 * 60 * 1000;   // cuenta regresiva global de 15 minutos
  const EXIT_MIN_POINTS = 1200;     // salida: 4/4 + 1.200 puntos + estar entre los 3 mejores elegibles
  const EXIT_TOP = 3;

  const stations = EA.stations = {};
  EA.registerStation = (def) => { stations[def.id] = def; };

  const state = EA.state = {
    role: null,                // 'host' | 'player'
    game: null,                // instantánea de la partida al empezar
    startAt: 0,                // momento en que arrancan los 15:00 (lo fija el anfitrión)
    running: false,            // true entre el "¡COMIENZA!" y el 00:00
    ended: false,
    player: null,              // estado individual del jugador de este dispositivo
    currentStation: null,
    locked: false,             // true mientras se muestra la retroalimentación
    clockId: 0,
    nextTimer: 0,
    speedTimer: 0,
  };

  // Estado individual del jugador de este dispositivo. Se construye desde la fila del servidor,
  // así al reconectar recupera puntos, estaciones y respuestas ya dadas.
  const newPlayer = (p) => ({
    playerId: p.id,
    name: p.name,
    characterId: p.characterId,
    x: p.x,
    y: p.y,
    dir: 'down',
    score: p.score || 0,
    completedStations: (p.completed || []).slice(),    // ids de estaciones completadas
    stationScores: { ...(p.stationScores || {}) },     // id -> puntos de esa estación (aciertos + bonus)
    finishedChallenges: JSON.parse(JSON.stringify(p.challenges || {})),   // id -> [true/false por reto]; un solo intento
    finishedAt: p.finishedAt || 0,                     // momento en que completó 4/4
    eligibleForExit: false,
    reachedExit: p.exitStatus === 'reached',           // el servidor ya le concedió la salida
    escaped: p.exitStatus === 'reached',               // ya atravesó la puerta (se oculta del mapa)
  });

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
  const me = () => state.player;
  const results = (id) => (me().finishedChallenges[id] || (me().finishedChallenges[id] = []));
  const isDone = (id) => !!me() && me().completedStations.includes(id);

  /* ---------------- sincronización con Supabase ---------------- */
  const B = () => EA.backend;
  let lastSend = 0;
  let lastSave = 0;
  let wasMoving = false;

  // Posición: Broadcast (~5 por segundo, solo al moverse) + copia en la base cada 5 s y al detenerse
  function publishMe() {
    const p = me();
    if (!p || !state.running) return;
    const t = performance.now();
    const moving = !!p.moving;
    if (moving && t - lastSend >= 190) {
      lastSend = t;
      B().sendPos(p.x, p.y, p.dir, true);
    }
    if (!moving && wasMoving) {                    // se detuvo: último aviso y copia de la posición
      lastSend = t;
      B().sendPos(p.x, p.y, p.dir, false);
      B().savePosition(p.x, p.y);
      lastSave = t;
    } else if (moving && t - lastSave >= 5000) {
      lastSave = t;
      B().savePosition(p.x, p.y);
    }
    wasMoving = moving;
  }

  // Progreso (respuestas dadas): se envía el mapa completo cada vez, así un envío perdido se
  // recupera con el siguiente. El servidor recalcula puntos y estaciones.
  let syncing = false;
  let syncDirty = false;
  let syncRetry = 0;
  async function syncProgress() {
    const p = me();
    if (!p) return;
    syncDirty = true;
    if (syncing) return;
    syncing = true;
    while (syncDirty) {
      syncDirty = false;
      try {
        await B().reportProgress(JSON.parse(JSON.stringify(p.finishedChallenges)));
        clearTimeout(syncRetry);
      } catch (e) {
        if (/game_not_active/.test(e.code || '')) break;       // la partida ya terminó
        clearTimeout(syncRetry);
        syncRetry = setTimeout(syncProgress, 4000);            // sin conexión: reintenta
        break;
      }
    }
    syncing = false;
  }

  /* ---------------- tiempo: cuenta regresiva global ---------------- */
  // La hora de referencia es la del SERVIDOR (net.js corrige la diferencia de cada dispositivo)
  const nowMs = () => EA.backend.now();
  let shownTime = '';
  const remaining = () => Math.max(0, GAME_MS - Math.max(0, nowMs() - state.startAt));
  function formatTime(ms) {
    const s = Math.ceil(ms / 1000);
    return pad2(Math.floor(s / 60)) + ':' + pad2(s % 60);
  }

  // 3 · 2 · 1 · ¡COMIENZA! sincronizado con startAt (igual en todas las pestañas)
  function updateCountdown(now) {
    const box = $('count');
    const t = now - state.startAt;
    let txt = '';
    if (t < -2000) txt = '3';
    else if (t < -1000) txt = '2';
    else if (t < 0) txt = '1';
    else if (t < 900) txt = '¡COMIENZA!';
    if (!txt) { if (!box.hidden) box.hidden = true; return; }
    const n = $('count-n');
    if (n.dataset.v !== txt) {
      n.dataset.v = txt;
      n.textContent = txt;
      n.className = txt.length > 1 ? 'go' : '';
      void n.offsetWidth;                          // reinicia el "pop" de cada número
      n.classList.add('pop');
      EA.fixAccents(n);
    }
    box.hidden = false;
  }

  // Corre en el mapa, dentro de las estaciones y en la pantalla de completado
  function tick() {
    if (state.ended) return;                       // la partida terminó: el reloj ya no avanza
    const now = nowMs();
    updateCountdown(now);
    if (now >= state.startAt) state.running = true;
    const t = formatTime(remaining());
    if (t !== shownTime) {
      shownTime = t;
      const el = $('hud-time');
      el.textContent = t;
      el.classList.toggle('low', remaining() <= 60000);
      if (!$('escaped').hidden) $('esc-time').textContent = t;
    }
    if (state.running && remaining() === 0) endByTime();
  }

  /* ---------------- final de la partida ---------------- */
  // Bloquea todo en este dispositivo: movimiento, estaciones, respuestas, salida y reloj.
  function lockPlay() {
    if (state.ended) return;
    state.running = false;
    state.ended = true;
    clearInterval(state.clockId);
    clearTimeout(state.nextTimer);
    clearTimeout(state.speedTimer);
    state.locked = false;
    if (state.currentStation) {
      state.currentStation = null;
      $('feedback').hidden = true;
    }
    $('overlay').hidden = true;
    $('act').hidden = true;
    $('count').hidden = true;
    $('confirm-end').hidden = true;
    $('end-game').hidden = true;
    EA.showScreen('room-screen');
  }

  // 00:00: se bloquea el juego y se pide al SERVIDOR que cierre la partida. Quien la cierra la cierra
  // para todos: el podio aparece en cada dispositivo cuando la sala pasa a "finished" (Realtime).
  async function endByTime() {
    if (state.ended) return;
    lockPlay();
    showToast('⏱ ¡TIEMPO AGOTADO! Calculando el resultado…', 6000);
    for (let i = 0; i < 90 && !finalShown; i++) {
      try { await B().finishGame(); } catch (e) { /* sin conexión: reintenta */ }
      const g = B().snapshot();
      if (g && g.status === 'finished') { showFinal(); break; }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  // La sala pasó a "finished" (el anfitrión terminó la partida o se acabó el tiempo): todos al podio
  function onRoomFinished() {
    if (!state.role) return;
    lockPlay();
    showFinal();
  }

  /* ---------------- podio ---------------- */
  // El servidor calcula el podio al cerrar la partida (players.final_rank):
  // elegibles = 4/4 y 1.200+, máximo 3, por puntaje; desempate: llegada a la salida.
  function podiumRows(players) {
    return players.filter((q) => q.finalRank > 0).sort((a, b) => a.finalRank - b.finalRank).slice(0, EXIT_TOP);
  }

  function renderPodium(players) {
    const body = $('podium-body');
    body.innerHTML = '';
    const rows = podiumRows(players);
    if (!rows.length) {
      body.append(h('p', 'podium-none', 'NADIE LOGRÓ COMPLETAR EL PROTOCOLO'));
    } else {
      const medals = [['🥇', '1.º LUGAR'], ['🥈', '2.º LUGAR'], ['🥉', '3.º LUGAR']];
      const list = h('div', 'podium-list');
      rows.forEach((q, i) => {
        const row = h('div', 'podium-row place' + (i + 1) + (me() && q.id === me().playerId ? ' me' : ''));
        const spr = h('div', 'podium-spr');
        const ch = q.characterId ? EA.charById(q.characterId) : null;
        if (ch) spr.append(EA.charCanvas(ch.id));
        const info = h('div', 'podium-info');
        info.append(h('span', 'podium-place', `${medals[i][0]} ${medals[i][1]}`), h('span', 'podium-name', q.name),
          h('span', 'podium-char', ch ? `PERSONAJE: ${ch.name}` : ''), h('span', 'podium-pts', `${q.score} PUNTOS`));
        row.append(spr, info);
        list.append(row);
      });
      body.append(list);
    }
    EA.fixAccents($('podium'));
  }

  let finalShown = false;
  async function showFinal() {
    if (finalShown) return;
    finalShown = true;
    EA.backend.clearSession();                     // la partida terminó: no se retoma al recargar
    $('count').hidden = true;
    $('escaped').hidden = true;
    $('confirm-end').hidden = true;
    $('end-game').hidden = true;
    $('podium-body').innerHTML = '';
    $('podium-body').append(h('p', 'podium-none calc', 'CALCULANDO RESULTADO…'));
    $('podium').hidden = false;
    for (let i = 0; i < 3; i++) {
      try { await B().refresh(); } catch (e) { /* se reintenta */ }
      const g = B().snapshot();
      if (g && g.status === 'finished') { renderPodium(g.players); break; }
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  // Pantalla de espera de quien ya escapó: sigue dentro de la sala hasta el podio
  function showEscaped() {
    const p = me();
    if (!p || finalShown) return;
    const ch = EA.charById(p.characterId);
    if (ch) {
      $('esc-sprite').style.backgroundImage = `url(${EA.charStrip(ch.id)})`;
      $('esc-name').textContent = `${ch.icon} ${p.name} · ${ch.name}`;
    }
    $('esc-stats').textContent = `${p.score} PUNTOS · ${p.completedStations.length}/${TOTAL_STATIONS} ESTACIONES`;
    $('esc-time').textContent = shownTime || formatTime(remaining());
    $('act').hidden = true;
    $('escaped').hidden = false;
    EA.fixAccents($('escaped'));
  }

  /* ---------------- puntos y estaciones ---------------- */
  function bump(el) {
    el.classList.remove('bump');
    void el.offsetWidth;            // reinicia la animación
    el.classList.add('bump');
  }

  function updatePoints(delta) {
    const p = me();
    p.score += delta;
    $('hud-points').textContent = p.score;
    if (delta) bump($('hud-points'));
  }

  function updateStationsHud() {
    $('hud-stations').textContent = `${me().completedStations.length}/${TOTAL_STATIONS}`;
    bump($('hud-stations'));
  }

  // Marca de "completada" en el mapa: solo para el jugador de este dispositivo
  function markStationCompleted(id) {
    const el = document.querySelector(`.station[data-station="${id}"]`);
    if (!el) return;
    el.classList.add('done');
    if (!el.querySelector('.badge')) el.appendChild(h('span', 'badge', '✔ COMPLETADA'));
  }

  function clearStationMarks() {
    document.querySelectorAll('.station.done').forEach((el) => {
      el.classList.remove('done');
      const b = el.querySelector('.badge');
      if (b) b.remove();
    });
  }

  /* ---------------- salida ---------------- */
  // Jugadores elegibles (4/4 y 1.200+), ordenados por puntos; desempate: quién llegó antes a la salida.
  // Datos de la sala real (Realtime); el servidor repite este cálculo al intentar salir.
  function qualifiedPlayers() {
    const g = B().snapshot();
    const p = me();
    const rows = (g ? g.players : []).map((q) => ({ id: q.id, score: q.score, done: q.completed.length, exitAt: q.exitAt || Infinity }));
    if (p) {
      const mine = { id: p.playerId, score: p.score, done: p.completedStations.length };
      const r = rows.find((x) => x.id === p.playerId);
      if (r) Object.assign(r, mine); else rows.push({ ...mine, exitAt: Infinity });
    }
    return rows
      .filter((r) => r.done >= TOTAL_STATIONS && r.score >= EXIT_MIN_POINTS)
      .sort((a, b) => b.score - a.score || a.exitAt - b.exitAt);
  }

  function refreshEligibility() {
    const p = me();
    if (!p) return -1;
    const pos = qualifiedPlayers().findIndex((r) => r.id === p.playerId);
    p.eligibleForExit = pos >= 0 && pos < EXIT_TOP;
    const lock = document.querySelector('.exit-plate .locked');
    if (lock) lock.textContent = p.eligibleForExit ? '🔓 ACCESO' : '🔒 BLOQUEADA';
    return pos;
  }

  // El SERVIDOR decide si se puede salir (4/4 + 1.200 puntos + top 3 por puntaje)
  let exiting = false;
  async function tryExit() {
    const p = me();
    if (!p || !state.running || p.reachedExit || exiting) return;
    exiting = true;
    try {
      for (let i = 0; i < 30 && (syncing || syncDirty); i++) await new Promise((r) => setTimeout(r, 100));   // que el servidor tenga mi último progreso
      const res = await B().claimExit();
      const done = p.completedStations.length;
      if (res.status === 'reached') {
        // El servidor ya registró la salida. Se abre la puerta, el personaje sale y pasa a la pantalla
        // de espera DENTRO de la misma sala (no se pide el código otra vez).
        p.reachedExit = true;
        refreshEligibility();
        EA.map.playExit(() => { p.escaped = true; showEscaped(); });
      } else if (res.status === 'blocked') {
        showToast(`🔒 SALIDA BLOQUEADA · Cumples los requisitos, pero hay ${res.rank - 1} jugadores elegibles con más puntaje. Solo salen los 3 mejores.`, 4200);
      } else {
        const miss = [];
        if (done < TOTAL_STATIONS) miss.push(`4/4 estaciones (tienes ${done}/4)`);
        if (p.score < EXIT_MIN_POINTS) miss.push(`1.200 puntos (tienes ${p.score})`);
        showToast('🔒 SALIDA BLOQUEADA · Necesitas: ' + (miss.join(' · ') || 'completar tu progreso'), 3200);
      }
    } catch (e) {
      showToast('Sin conexión. Inténtalo de nuevo.', 2200);
    }
    exiting = false;
  }

  /* ---------------- avisos ---------------- */
  let toastTimer = 0;
  function showToast(msg, ms = 1900) {
    const t = $('toast');
    t.textContent = msg;
    EA.fixAccents(t);
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  function showOverlay(title, text) {
    $('ov-title').textContent = title;
    $('ov-text').textContent = text;
    EA.fixAccents($('overlay'));
    $('overlay').hidden = false;
  }

  /* ---------------- paneles del anfitrión: ranking en vivo y requisitos ---------------- */
  const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  // Se repinta con cada cambio de la sala (Realtime): cada respuesta suma puntos y mueve el ranking.
  // Solo existe para el anfitrión (los paneles solo se ven con body.role-host).
  function renderHostBoard(g) {
    const list = $('hb-list');
    if (!g || !list) return;
    const players = g.players.slice().sort((a, b) =>
      b.score - a.score || (a.exitAt || Infinity) - (b.exitAt || Infinity) || (a.finishedAt || Infinity) - (b.finishedAt || Infinity));
    const ready = (p) => p.completed.length >= TOTAL_STATIONS && p.score >= EXIT_MIN_POINTS;
    const out = players.filter((p) => p.exitStatus === 'reached').length;
    list.innerHTML = '';
    if (!players.length) list.append(h('li', 'hb-empty', 'SIN JUGADORES'));
    players.forEach((p, i) => {
      const c = EA.charById && p.characterId ? EA.charById(p.characterId) : null;
      let cls = 'hb-row';
      let status = `${p.completed.length}/${TOTAL_STATIONS} ESTACIONES`;
      if (p.exitStatus === 'reached') { cls += ' out'; status = '🚪 SALIÓ'; }
      else if (p.exitStatus === 'blocked') { cls += ' blocked'; status = '🔒 BLOQUEADO'; }
      else if (ready(p)) { cls += ' can'; status = '✔ PUEDE SALIR'; }
      const row = h('li', cls);
      const top = h('div', 'hb-top');
      top.append(h('span', 'hb-pos', `${i + 1}º`), h('span', 'hb-name', `${c ? c.icon + ' ' : ''}${p.name}`), h('span', 'hb-score', fmt(p.score)));
      const bar = h('div', 'hb-bar');
      const fill = h('i');
      fill.style.width = Math.min(100, Math.round(p.score / EXIT_MIN_POINTS * 100)) + '%';
      bar.append(fill);
      const meta = h('div', 'hb-meta');
      meta.append(h('span', 'hb-st', status), h('span', '', `${fmt(p.score)}/${fmt(EXIT_MIN_POINTS)}`));
      row.append(top, bar, meta);
      list.append(row);
    });
    $('hr-can').textContent = String(players.filter((p) => ready(p) && p.exitStatus !== 'reached' && p.exitStatus !== 'blocked').length);
    $('hr-out').textContent = `${out}/${EXIT_TOP}`;
    $('hr-min').textContent = fmt(EXIT_MIN_POINTS);
    if (state.role === 'host') $('hud-points').textContent = `${players.length}/10`;
    EA.fixAccents($('host-board'));
    EA.fixAccents($('host-rules'));
  }

  /* ---------------- inicio de la partida (lo dispara el anfitrión) ---------------- */
  function setupHud() {
    const host = state.role === 'host';
    $('hud-k1').textContent = 'TIEMPO';
    $('hud-k2').textContent = host ? 'JUGADORES' : 'PUNTOS';
    $('hud-k3').textContent = host ? 'PARA PASAR' : 'ESTACIONES';
    $('hud-time').textContent = '15:00';
    $('hud-time').classList.remove('low');
    const p = me();
    $('hud-points').textContent = host ? `${state.game.players.length}/10` : String(p.score);
    $('hud-stations').textContent = host ? fmt(EXIT_MIN_POINTS) : `${p.completedStations.length}/${TOTAL_STATIONS}`;
    EA.fixAccents($('hud'));
  }

  // Arranca (o retoma, si el dispositivo se reconectó) la partida de la sala real.
  // game = instantánea de EA.backend; el reloj usa start_at, fijado por el servidor.
  function startMission({ role, game, playerId }) {
    clearInterval(state.clockId);
    clearTimeout(state.nextTimer);
    clearTimeout(state.speedTimer);
    Object.assign(state, {
      role, game, startAt: game.startAt, running: false, ended: false,
      player: null, currentStation: null, locked: false,
    });
    finalShown = false;
    wasMoving = false;
    $('podium').hidden = true;
    $('escaped').hidden = true;
    $('confirm-end').hidden = true;
    $('end-game').hidden = !(role === 'host' && !EA.map.isTouch());   // solo el anfitrión, solo en computador
    document.body.classList.toggle('role-host', role === 'host');
    document.body.classList.toggle('role-player', role === 'player');
    clearStationMarks();
    $('overlay').hidden = true;

    if (role === 'player') {
      const idx = game.players.findIndex((p) => p.id === playerId);
      const row = game.players[idx];
      state.player = newPlayer(row);
      const fresh = row.x === 128 && row.y === 92;            // nunca se movió: sale de su puesto
      if (fresh) {
        const sp = EA.map.spawn(idx);
        state.player.x = sp.x;
        state.player.y = sp.y;
      }
      state.player.completedStations.forEach(markStationCompleted);
    }
    refreshEligibility();
    setupHud();
    if (role === 'host') renderHostBoard(game);
    shownTime = '';
    EA.showScreen('room-screen');
    EA.map.start(game, state.player);
    tick();
    state.clockId = setInterval(tick, 100);
    if (state.player && state.player.escaped) showEscaped();     // retomó la partida después de haber escapado
  }

  /* ---------------- estaciones ---------------- */
  // Solo se llama desde mapa.js cuando el jugador está junto a la estación
  function openStation(id) {
    const p = me();
    if (!p || !state.running || p.reachedExit || state.currentStation) return;
    const def = stations[id];
    if (!def) { showToast('ESTACIÓN EN PREPARACIÓN'); return; }
    if (isDone(id)) { showToast('✔ ESTACIÓN YA COMPLETADA'); return; }

    state.currentStation = id;
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
    showChallenge(results(id).length);
  }

  function closeStation() {
    if (state.locked) return;
    clearTimeout(state.speedTimer);
    state.currentStation = null;
    $('feedback').hidden = true;
    EA.showScreen('room-screen');
  }

  function renderDots(def, res, index) {
    const dots = $('st-dots');
    dots.innerHTML = '';
    def.challenges.forEach((_, i) => {
      const d = h('i');
      if (i < res.length) d.className = res[i] ? 'ok' : 'bad';
      else if (i === index) d.className = 'now';
      dots.appendChild(d);
    });
  }

  // Muestra el desafío número `i` de la estación abierta
  function showChallenge(i) {
    const def = stations[state.currentStation];
    const ch = def.challenges[i];
    clearTimeout(state.speedTimer);
    state.locked = false;
    $('st-exit').disabled = false;
    $('feedback').hidden = true;
    $('st-count').textContent = `DESAFÍO ${i + 1}/${def.challenges.length}`;
    EA.fixAccents($('st-count'));
    $('station-screen').classList.toggle('compact', i > 0);   // cabecera reducida: más sitio para el desafío
    renderDots(def, results(state.currentStation), i);

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

  // Registra el resultado (una sola vez), suma puntos, muestra ✅/❌ y avanza
  function resolveChallenge(ok, ch, note) {
    if (state.locked || !state.currentStation) return;
    state.locked = true;
    clearTimeout(state.speedTimer);
    $('st-exit').disabled = true;
    const id = state.currentStation;
    const def = stations[id];
    const res = results(id);
    res.push(ok);
    if (ok) updatePoints(POINTS_CORRECT);
    renderDots(def, res, res.length);
    showFeedback(ok, ch, note);

    syncProgress();                                // el servidor guarda la respuesta y recalcula el puntaje

    state.advance = () => {
      clearTimeout(state.nextTimer);
      state.nextTimer = 0;
      $('feedback').hidden = true;
      if (state.currentStation !== id) return;
      if (res.length >= def.challenges.length) completeStation(id);
      else showChallenge(res.length);
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
    const p = me();
    if (isDone(id)) return;                        // nunca se otorgan los +500 dos veces
    const def = stations[id];
    const correct = results(id).filter(Boolean).length;
    p.completedStations.push(id);
    const bonus = correct >= STATION_MIN_CORRECT ? POINTS_STATION : 0;
    p.stationScores[id] = correct * POINTS_CORRECT + bonus;
    if (p.completedStations.length >= TOTAL_STATIONS) p.finishedAt = Date.now();
    updatePoints(bonus);
    updateStationsHud();
    markStationCompleted(id);
    refreshEligibility();
    $('done-title').textContent = def.doneTitle || `🎉 ¡${def.name} COMPLETADO!`;
    $('done-bonus').textContent = bonus ? `+${bonus} PUNTOS DE BONUS` : 'SIN BONUS';
    $('done-detail').textContent =
      `Aciertos: ${correct}/${def.challenges.length} (+${correct * POINTS_CORRECT}) · ` +
      (bonus ? `Bonus de estación: +${bonus}` : `Para el bonus necesitas ${STATION_MIN_CORRECT} aciertos`);
    $('done-stations').textContent = `${p.completedStations.length}/${TOTAL_STATIONS}`;
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
      } else if (ch.extras) {          // una sola situación con varias opciones: fallo inmediato
        a.classList.add('bad'); b.classList.add('bad');
        right.querySelector(`[data-id="${ch.pairs[0].instrument}"]`).classList.add('matched');
        ctx.finish(false);
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
      if (ch.prompt) box.append(h('p', 'prompt', ch.prompt));
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
  EA.openStation = openStation;
  EA.closeStation = closeStation;
  EA.showChallenge = showChallenge;
  EA.validateAnswer = validateAnswer;
  EA.showToast = showToast;
  EA.tryExit = tryExit;
  EA.publishMe = publishMe;
  EA.syncProgress = syncProgress;
  EA.renderPodium = renderPodium;
  EA.isStationDone = isDone;

  // Tocar el aviso de "INCORRECTO" salta la espera y pasa al siguiente desafío
  $('feedback').addEventListener('click', () => { if (state.nextTimer && state.advance) state.advance(); });
  $('st-exit').addEventListener('click', closeStation);
  $('done-back').addEventListener('click', () => EA.showScreen('room-screen'));
  // El fin de la partida llega por la sala (Realtime): todos los dispositivos pasan al mismo podio
  EA.backend.subscribe((g) => {
    if (!g || !state.role) return;
    if (state.role === 'host') renderHostBoard(g);                 // ranking en vivo (solo anfitrión)
    if (g.status === 'finished') onRoomFinished();
    if (finalShown) renderPodium(g.players);                       // el podio se actualiza si llegan datos nuevos
  });

  // TERMINAR PARTIDA: solo el anfitrión (el servidor lo vuelve a comprobar)
  const hostCanEnd = () => state.role === 'host' && !EA.map.isTouch() && !state.ended;
  $('end-game').addEventListener('click', () => { if (hostCanEnd()) $('confirm-end').hidden = false; });
  $('end-cancel').addEventListener('click', () => { $('confirm-end').hidden = true; });
  $('end-confirm').addEventListener('click', async () => {
    if (!hostCanEnd()) return;
    $('end-confirm').disabled = true;
    try {
      await B().endGame();                         // el servidor cierra la sala; Realtime avisa a todos
      $('confirm-end').hidden = true;
    } catch (e) {
      showToast('No se pudo terminar la partida. Revisa tu conexión e inténtalo de nuevo.', 3500);
    }
    $('end-confirm').disabled = false;
  });

  const goHome = () => {
    EA.backend.clearSession('host');
    EA.backend.clearSession('player');
    location.href = location.pathname + '?nuevo';
  };
  $('ov-home').addEventListener('click', goHome);
  $('podium-home').addEventListener('click', goHome);
})();
