/* ============================================================
   LOBBY — modo ANFITRIÓN y modo JUGADOR (separados), con sala real

   Toda la comunicación pasa por EA.backend (net.js → Supabase).
   - Computador: puede ser ANFITRIÓN (crea la sala y la controla) o JUGADOR.
   - Teléfono / tablet (pantalla táctil): entra directo como JUGADOR.
   - El anfitrión no ocupa personaje ni cuenta entre los 10 jugadores.
   ============================================================ */
(() => {
  'use strict';

  const EA = window.EA;
  const B = EA.backend;
  const MAX_PLAYERS = 10;
  const CODE_LENGTH = 5;

  const $ = (id) => document.getElementById(id);
  const h = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  const thumb = (charId) => (charId ? EA.charCanvas(charId) : h('span', 'char-cv unknown', '?'));
  const isTouch = () => matchMedia('(hover: none) and (pointer: coarse)').matches;

  const ERRORS = {
    room_not_found: 'Ese código no existe. Revisa las 5 letras.',
    room_full: 'La partida está llena (10/10).',
    game_started: 'La partida ya comenzó.',
    name_taken: 'Ese nombre ya está en uso. Prueba otro.',
    bad_name: 'Escribe tu nombre o apodo (máximo 12 letras).',
    host_cannot_play: 'Este dispositivo es el anfitrión de esa partida. Entra desde otro dispositivo para jugar.',
    character_taken: 'Ese personaje acaba de ser ocupado. Elige otro.',
    not_in_waiting_room: 'La partida ya no está disponible.',
    not_configured: 'El juego todavía no está conectado al servidor.',
  };
  const errText = (e) => ERRORS[e && e.code] || ERRORS[e && e.message] || 'No se pudo conectar. Revisa tu internet e inténtalo de nuevo.';

  let role = null;          // 'host' | 'player' — cada pestaña/dispositivo es una sola cosa
  let picked = null;        // personaje tocado, aún sin confirmar
  let started = false;
  let busy = false;

  function showError(id, msg) {
    const box = $(id);
    box.textContent = msg || '';
    box.hidden = !msg;
    EA.fixAccents(box);
  }

  /* ================= MODO ANFITRIÓN ================= */
  // Dirección pública del juego: la que pueden abrir los celulares. Si el anfitrión abrió el juego
  // desde su disco (file://) o desde un servidor local, el QR y el enlace usan igualmente esta.
  const PUBLIC_URL = 'https://alejandrojimenezcardenas.github.io/escape-ambiental/';
  const joinLink = () => {
    const local = location.protocol === 'file:' || /^(localhost|127\.|192\.168\.|10\.)/.test(location.hostname);
    return local ? PUBLIC_URL : location.href.split('?')[0].split('#')[0].replace(/index\.html$/, '');
  };
  const playerLink = (code) => `${joinLink()}?jugador&codigo=${code}`;     // abre el juego como jugador con el código escrito

  // QR del enlace de la partida: se dibuja módulo a módulo (negro sobre blanco, con margen) para que cualquier cámara lo lea
  function drawQR(text) {
    const cv = $('join-qr');
    if (typeof window.qrcode !== 'function') { cv.parentElement.hidden = true; return; }   // sin la librería: se usa el enlace
    cv.parentElement.hidden = false;
    const qr = window.qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    const margin = 4;
    const size = n + margin * 2;
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#000';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.fillRect(c + margin, r + margin, 1, 1);
    cv.style.width = cv.style.height = size * Math.max(4, Math.floor(280 / size)) + 'px';   // píxeles enteros: sin desenfoque
  }

  function renderHost(g) {
    const mine = !!g;
    $('host-new').hidden = mine;
    $('host-game').hidden = !mine;
    if (!mine) return;

    const codeBox = $('game-code');
    if (codeBox.dataset.code !== g.code) {
      codeBox.dataset.code = g.code;
      codeBox.innerHTML = [...g.code].map((c) => `<span class="ch">${c}</span>`).join('');
      codeBox.setAttribute('aria-label', 'Código ' + g.code.split('').join(' '));
      $('join-url').textContent = joinLink();
      drawQR(playerLink(g.code));
    }
    $('player-count').textContent = `${g.players.length}/${MAX_PLAYERS}`;

    // lista de las 10 plazas
    const roster = $('roster');
    roster.innerHTML = '';
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const p = g.players[i];
      const li = h('li', p ? 'slot' : 'slot empty');
      if (!p) li.textContent = 'libre';
      else {
        const av = h('div', 'avatar');
        av.append(thumb(p.characterId));
        const nm = h('span', 'pname', `J${i + 1} · ${p.name}`);
        const ch = p.characterId ? EA.charById(p.characterId) : null;
        const st = h('span', 'chip ' + (ch ? 'ready' : 'wait'), ch ? `✔ ${ch.name}` : 'Eligiendo…');
        li.append(av, nm, st);
      }
      roster.appendChild(li);
    }

    // estado de los 10 personajes
    const owners = new Map(g.players.filter((p) => p.characterId).map((p) => [p.characterId, p.name]));
    const strip = $('host-chars');
    strip.innerHTML = '';
    EA.CHARACTERS.forEach((c) => {
      const owner = owners.get(c.id);
      const cell = h('div', 'mini' + (owner ? ' taken' : ''));
      cell.append(EA.charCanvas(c.id), h('span', 'mini-name', c.name), h('span', 'mini-own', owner ? '🔒 ' + owner : 'libre'));
      strip.append(cell);
    });
    $('char-count').textContent = `${owners.size}/${EA.CHARACTERS.length} ocupados`;

    const ready = g.players.filter((p) => p.characterId).length;
    const choosing = g.players.length - ready;
    let status = 'Esperando jugadores…';
    if (g.players.length) {
      status = choosing
        ? `${ready} listo${ready === 1 ? '' : 's'} · ${choosing} eligiendo personaje. Si inicias ahora, recibirán uno libre.`
        : `Todos listos (${ready}). Tú decides cuándo empezar.`;
    }
    $('host-status').textContent = status;
    $('start-game').disabled = !g.players.length || g.status !== 'waiting' || busy;
    EA.fixAccents($('host-game'));
  }

  async function createGame() {
    if (busy) return;
    busy = true;
    showError('host-error', '');
    $('create-game').disabled = true;
    $('create-game').textContent = 'CREANDO…';
    try {
      await B.init('host');
      renderHost(await B.createGame());
    } catch (e) {
      showError('host-error', errText(e));
    }
    busy = false;
    $('create-game').disabled = false;
    $('create-game').textContent = 'CREAR PARTIDA';
  }

  async function startGame() {
    if (role !== 'host' || busy) return;
    busy = true;
    $('start-game').disabled = true;
    showError('host-error', '');
    try {
      await B.startGame();                       // el servidor fija start_at; todos lo reciben por Realtime
    } catch (e) {
      showError('host-error', errText(e));
    }
    busy = false;
    renderHost(B.snapshot());
  }

  /* ================= MODO JUGADOR ================= */
  function resetPlayer(msg) {
    picked = null;
    $('join-form').hidden = false;
    $('wait-room').hidden = true;
    $('player-back').hidden = isTouch();
    showError('join-error', msg);
  }

  function setWalker(el, charId) {
    el.style.backgroundImage = `url(${EA.charStrip(charId)})`;
  }

  function renderPlayer(g) {
    const mine = g && B.me();
    if (!mine) return;
    $('join-form').hidden = true;
    $('wait-room').hidden = false;
    $('player-back').hidden = true;

    $('wait-code').textContent = g.code;
    $('wait-count').textContent = `${g.players.length}/${MAX_PLAYERS}`;

    // participantes
    const list = $('wait-list');
    list.innerHTML = '';
    g.players.forEach((p, i) => {
      const li = h('li', 'wait-p' + (p.id === mine.id ? ' me' : ''));
      li.append(thumb(p.characterId), h('span', '', `J${i + 1} ${p.name}${p.id === mine.id ? ' (TÚ)' : ''}`));
      list.append(li);
    });

    const taken = new Map(g.players.filter((p) => p.characterId && p.id !== mine.id).map((p) => [p.characterId, p.name]));
    if (picked && taken.has(picked)) {
      picked = null;
      showError('choose-error', ERRORS.character_taken);
    }

    const chosen = mine.characterId;
    $('choose-box').hidden = !!chosen;
    $('ready-box').hidden = !chosen;

    if (chosen) {
      const c = EA.charById(chosen);
      setWalker($('ready-sprite'), chosen);
      $('ready-name').textContent = `${c.icon} ${c.name}`;
    } else {
      const grid = $('char-grid');
      grid.innerHTML = '';
      EA.CHARACTERS.forEach((c) => {
        const owner = taken.get(c.id);
        const b = h('button', 'char-card' + (owner ? ' taken' : '') + (picked === c.id ? ' sel' : ''));
        b.type = 'button';
        b.dataset.id = c.id;
        b.disabled = !!owner;
        b.title = owner ? `Ocupado por ${owner}` : c.name;
        b.append(EA.charCanvas(c.id), h('span', 'cn', c.name), h('span', 'ct', `#${c.num} ${c.icon}`));
        if (owner) b.append(h('span', 'lock', '🔒\nOCUPADO'));
        b.addEventListener('click', () => pickCharacter(c.id));
        grid.append(b);
      });
      const pv = $('char-preview');
      pv.hidden = !picked;
      if (picked) {
        const c = EA.charById(picked);
        setWalker($('preview-sprite'), picked);
        $('preview-name').textContent = `${c.icon} ${c.name} · ${c.kind}`;
      }
    }
    EA.fixAccents($('wait-room'));
  }

  function pickCharacter(id) {
    showError('choose-error', '');
    picked = id;
    renderPlayer(B.snapshot());
    const pv = $('char-preview');
    if (!pv.hidden && pv.scrollIntoView) pv.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  async function confirmCharacter() {
    if (!picked || busy) return;
    busy = true;
    const id = picked;
    try {
      await B.chooseCharacter(id);
      picked = null;
      $('player-screen').scrollTop = 0;
    } catch (e) {
      picked = null;
      showError('choose-error', errText(e));
    }
    busy = false;
    renderPlayer(B.snapshot());
  }

  async function changeCharacter() {
    if (busy) return;
    busy = true;
    try { await B.chooseCharacter(null); } catch (e) { showError('choose-error', errText(e)); }
    busy = false;
    renderPlayer(B.snapshot());
  }

  async function onJoin(e) {
    e.preventDefault();
    if (busy) return;
    showError('join-error', '');
    const code = $('join-code').value.trim();
    const name = $('join-name').value.trim();
    if (code.length < CODE_LENGTH) { showError('join-error', 'Escribe el código de 5 letras de la partida.'); return; }
    if (!name) { showError('join-error', 'Escribe tu nombre o apodo.'); return; }
    busy = true;
    $('join-btn').disabled = true;
    $('join-btn').textContent = 'CONECTANDO…';
    try {
      await B.init('player');
      await B.joinGame(code, name);
      picked = null;
      showError('choose-error', '');
      renderPlayer(B.snapshot());
      $('player-screen').scrollTop = 0;
    } catch (err) {
      showError('join-error', errText(err));
    }
    busy = false;
    $('join-btn').disabled = false;
    $('join-btn').textContent = 'UNIRME';
  }

  /* ================= cambios de la partida (Realtime) ================= */
  async function begin(g) {
    if (started) return;
    started = true;
    await B.clockReady;                              // el reloj del servidor ya está medido
    EA.startMission({ role, game: B.snapshot() || g, playerId: role === 'player' && B.me() ? B.me().id : null });
  }

  B.subscribe((g) => {
    if (!g || !role) return;
    if (role === 'host') {
      if (!started) renderHost(g);
      if (g.status === 'playing' && g.startAt) begin(g);
    } else if (role === 'player') {
      if (g.status === 'playing' && g.startAt && B.me()) { begin(g); return; }
      if (!started) renderPlayer(g);
    }
  });

  /* ================= navegación ================= */
  EA.goHost = () => {
    if (isTouch()) return;                          // el anfitrión solo funciona desde computador
    role = 'host';
    EA.showScreen('host-screen');
    renderHost(B.snapshot());
    if (!B.configured) showError('host-error', ERRORS.not_configured);
  };

  EA.goPlayer = () => {
    role = 'player';
    EA.showScreen('player-screen');
    $('player-back').hidden = isTouch() || !!B.me();
    if (!B.me()) $('join-code').focus({ preventScroll: true });
    if (!B.configured) showError('join-error', ERRORS.not_configured);
  };

  $('go-host').addEventListener('click', EA.goHost);
  $('go-player').addEventListener('click', EA.goPlayer);
  document.querySelectorAll('.back-intro').forEach((b) => b.addEventListener('click', () => {
    if (role === 'player' && B.me()) return;        // ya está dentro de una sala de espera
    role = null;
    EA.showScreen('intro');
  }));
  $('create-game').addEventListener('click', createGame);
  $('start-game').addEventListener('click', startGame);
  $('copy-link').addEventListener('click', () => {
    const g = B.snapshot();
    if (!g) return;
    const link = playerLink(g.code);
    const done = () => EA.showToast('📋 ENLACE COPIADO');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done, () => EA.showToast(link, 4000));
    else EA.showToast(link, 4000);
  });
  $('join-form').addEventListener('submit', onJoin);
  $('char-continue').addEventListener('click', confirmCharacter);
  $('char-change').addEventListener('click', changeCharacter);
  $('join-code').addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });

  // Indicador de conexión
  B.subscribeStatus((online) => { $('net-banner').hidden = online; });

  /* ================= arranque: reconexión, teléfono = jugador ================= */
  const params = new URLSearchParams(location.search);

  async function boot() {
    // 1) ¿había una partida en curso en este dispositivo? (recarga o pérdida de conexión)
    if (B.configured && !params.has('nuevo')) {
      const order = isTouch() ? ['player'] : ['host', 'player'];
      for (const r of order) {
        const saved = B.loadSession(r);
        if (!saved) continue;
        // entra con el QR/enlace de OTRA partida: se descarta la sala vieja en vez de reconectarse a ella
        const qrCode = (params.get('codigo') || '').toUpperCase();
        if (r === 'player' && qrCode && saved.code && saved.code !== qrCode) { B.clearSession(r); continue; }
        EA.showToast('Reconectando a la partida…', 6000);
        const g = await B.resume(r);
        if (!g) continue;
        role = r;
        if (r === 'host') {
          EA.showScreen('host-screen');
          renderHost(g);
          if (g.status === 'playing' && g.startAt) begin(g);
        } else {
          EA.showScreen('player-screen');
          if (g.status === 'playing' && g.startAt && B.me()) begin(g);
          else renderPlayer(g);
        }
        return;
      }
    }
    // 2) Teléfono / tablet: directo a la interfaz de jugador, sin elegir modo
    if (isTouch() || params.has('jugador')) {
      document.body.classList.add('solo-jugador');
      EA.goPlayer();
      if (params.get('codigo')) $('join-code').value = params.get('codigo').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
    }
  }
  // cuando ya están cargados todos los scripts (partida.js, mapa.js…)
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
