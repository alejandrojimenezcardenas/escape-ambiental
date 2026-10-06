/* ============================================================
   LOBBY — vista anfitrión y vista jugador

   La conexión entre dispositivos todavía NO existe: LocalBackend
   guarda la partida en memoria y simula jugadores. Toda la interfaz
   habla únicamente con `backend` (createGame / joinGame / startGame /
   subscribe). Para pasar a Supabase Realtime basta con crear otro
   objeto con esos mismos métodos y asignarlo a EA.backend.
   ============================================================ */
(() => {
  'use strict';

  const EA = window.EA;
  const MAX_PLAYERS = 10;
  const CODE_LENGTH = 5;
  const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // sin O/0/I/1 para evitar confusiones
  const BOT_NAMES = ['Luna', 'Mateo', 'Sofía', 'Andrés', 'Valentina', 'Camilo', 'Isabela', 'Juan', 'Mariana', 'Santi'];
  const AVATAR_COLORS = ['#e8433f', '#2a7de1', '#4cc94c', '#ff9a3c', '#a35bd1', '#2fd1b0', '#ff6fa5', '#7b4fd1'];

  /* ---------------- Backend local (reemplazable por Supabase) ---------------- */
  const LocalBackend = {
    game: null,
    listeners: new Set(),

    snapshot() {
      if (!this.game) return null;
      return {
        code: this.game.code,
        status: this.game.status,                       // 'lobby' | 'started'
        players: this.game.players.map((p) => ({ ...p })),
      };
    },

    emit(type) {
      const snap = this.snapshot();
      this.listeners.forEach((cb) => cb(type, snap));
    },

    // cb(tipo, instantánea) con tipo = 'players' | 'started'
    subscribe(cb) {
      this.listeners.add(cb);
      return () => this.listeners.delete(cb);
    },

    async createGame() {
      if (this.game && this.game.status === 'lobby') return this.snapshot();
      let code = '';
      for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      this.game = { code, status: 'lobby', players: [], nextId: 1 };
      this.emit('players');
      return this.snapshot();
    },

    async joinGame(code, name, opts = {}) {
      const g = this.game;
      const cleanCode = String(code || '').trim().toUpperCase();
      const cleanName = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 12);
      if (!g || cleanCode !== g.code) return { ok: false, error: 'Ese código no existe. Revisa las 5 letras.' };
      if (g.status !== 'lobby') return { ok: false, error: 'La misión ya comenzó.' };
      if (!cleanName) return { ok: false, error: 'Escribe tu nombre o apodo.' };
      if (g.players.length >= MAX_PLAYERS) return { ok: false, error: 'La partida está llena (10/10).' };
      if (g.players.some((p) => p.name.toLowerCase() === cleanName.toLowerCase())) {
        return { ok: false, error: 'Ese nombre ya está en uso. Prueba otro.' };
      }
      const player = { id: 'p' + g.nextId++, name: cleanName, status: 'connecting', isBot: !!opts.bot };
      g.players.push(player);
      this.emit('players');
      // Simula la latencia de conexión: "Conectando…" -> "Listo"
      setTimeout(() => {
        if (this.game !== g) return;
        player.status = 'ready';
        this.emit('players');
      }, opts.bot ? 900 : 700);
      return { ok: true, player: { ...player }, code: g.code };
    },

    async startGame() {
      if (!this.game || this.game.status !== 'lobby') return;
      this.game.status = 'started';
      this.emit('started');
    },
  };

  const backend = EA.backend = LocalBackend;

  /* ---------------- Interfaz ---------------- */
  const $ = (id) => document.getElementById(id);
  let localPlayer = null;     // jugador que se unió desde la vista "Jugador" de este navegador
  let botTimers = [];
  let subscribed = false;

  const colorFor = (name) => {
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
  };

  function fillAvatar(el, name) {
    el.textContent = name.charAt(0).toUpperCase();
    el.style.background = colorFor(name);
  }

  function setMode(mode) {
    const host = mode === 'host';
    $('view-host').hidden = !host;
    $('view-player').hidden = host;
    $('tab-host').classList.toggle('on', host);
    $('tab-player').classList.toggle('on', !host);
    $('tab-host').setAttribute('aria-selected', host);
    $('tab-player').setAttribute('aria-selected', !host);
    if (host) backend.createGame();
    else if (!localPlayer) $('join-code').focus({ preventScroll: true });
  }

  function renderLobby(snap) {
    if (!snap) return;
    // código de partida: una casilla por carácter
    const codeBox = $('game-code');
    if (codeBox.dataset.code !== snap.code) {
      codeBox.dataset.code = snap.code;
      codeBox.innerHTML = [...snap.code].map((c) => `<span class="ch">${c}</span>`).join('');
      codeBox.setAttribute('aria-label', 'Código ' + snap.code.split('').join(' '));
    }
    $('player-count').textContent = `${snap.players.length}/${MAX_PLAYERS} jugadores`;

    // lista con las 10 plazas (ocupadas y libres)
    const roster = $('roster');
    roster.innerHTML = '';
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const p = snap.players[i];
      const li = document.createElement('li');
      if (!p) {
        li.className = 'slot empty';
        li.textContent = 'libre';
      } else {
        li.className = 'slot';
        const av = document.createElement('div');
        av.className = 'avatar';
        fillAvatar(av, p.name);
        const nm = document.createElement('span');
        nm.className = 'pname';
        nm.textContent = p.name + (localPlayer && localPlayer.id === p.id ? ' (TÚ)' : '');
        const st = document.createElement('span');
        st.className = 'chip ' + (p.status === 'ready' ? 'ready' : 'wait');
        st.textContent = p.status === 'ready' ? '✔ Listo' : 'Conectando…';
        li.append(av, nm, st);
      }
      roster.appendChild(li);
    }
    EA.fixAccents(roster);
  }

  function onBackendEvent(type, snap) {
    if (type === 'players') renderLobby(snap);
    if (type === 'started') {
      botTimers.forEach(clearTimeout);
      botTimers = [];
      EA.startMission({ playerName: localPlayer ? localPlayer.name : null });
    }
  }

  // Jugadores simulados que "entran" poco a poco para poder probar el lobby
  async function addBot() {
    const snap = backend.snapshot();
    if (!snap || snap.status !== 'lobby' || snap.players.length >= MAX_PLAYERS) return;
    const used = new Set(snap.players.map((p) => p.name.toLowerCase()));
    let name = BOT_NAMES.find((n) => !used.has(n.toLowerCase()));
    if (!name) name = 'Jugador' + (snap.players.length + 1);
    await backend.joinGame(snap.code, name, { bot: true });
  }

  function scheduleBots() {
    botTimers.forEach(clearTimeout);
    botTimers = [1200, 2800, 4400].map((ms) => setTimeout(addBot, ms));
  }

  /* ---------------- Vista jugador ---------------- */
  function showError(msg) {
    const box = $('join-error');
    box.textContent = msg;
    box.hidden = !msg;
    EA.fixAccents(box);
  }

  async function onJoin(e) {
    e.preventDefault();
    showError('');
    const btn = $('join-btn');
    btn.disabled = true;
    const res = await backend.joinGame($('join-code').value, $('join-name').value);
    btn.disabled = false;
    if (!res.ok) { showError(res.error); return; }
    localPlayer = res.player;
    $('join-form').hidden = true;
    $('join-done').hidden = false;
    fillAvatar($('join-avatar'), localPlayer.name);
    $('join-name-out').textContent = localPlayer.name;
    renderLobby(backend.snapshot());
  }

  /* ---------------- Entrada al lobby ---------------- */
  EA.goLobby = (mode = 'host') => {
    EA.showScreen('lobby-screen');
    if (!subscribed) {
      backend.subscribe(onBackendEvent);
      subscribed = true;
    }
    setMode(mode);
    renderLobby(backend.snapshot());
    if (mode === 'host' && botTimers.length === 0) scheduleBots();
  };

  $('tab-host').addEventListener('click', () => setMode('host'));
  $('tab-player').addEventListener('click', () => setMode('player'));
  $('start-mission').addEventListener('click', () => backend.startGame());
  $('add-test').addEventListener('click', addBot);
  $('sim-start').addEventListener('click', () => backend.startGame());
  $('join-form').addEventListener('submit', onJoin);
  $('join-code').addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });

  // Enlace directo para el celular: index.html?jugador (opcional &codigo=XXXXX). Salta la introducción.
  const params = new URLSearchParams(location.search);
  if (params.has('jugador')) {
    document.body.classList.add('solo-jugador');
    EA.goLobby('player');
    if (params.get('codigo')) $('join-code').value = params.get('codigo').toUpperCase().slice(0, CODE_LENGTH);
  }
})();
