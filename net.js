/* ============================================================
   NET — conexión real con Supabase (reemplaza al antiguo backend local)

   Expone EA.backend con la misma idea que antes, pero asíncrono:
     init(role) · createGame · joinGame · chooseCharacter · startGame
     reportProgress · savePosition · claimExit · finishGame
     snapshot() · subscribe(cb) · subscribeLive(cb) · now()

   Qué viaja por dónde:
   - Estado importante (sala, jugadores, puntos, estaciones, salida):
     tablas rooms/players, escritas SOLO mediante funciones del servidor,
     y avisadas por Realtime (postgres_changes) + una consulta de respaldo.
   - Posiciones: Realtime Broadcast en un canal privado por sala
     (unas 5 veces por segundo y solo mientras alguien se mueve).
   - Reloj: start_at lo fija el servidor; cada dispositivo corrige su
     hora con la del servidor (offset), no usa su reloj como autoridad.
   Solo se usan la Project URL y la Publishable key (públicas).
   ============================================================ */
(() => {
  'use strict';

  const EA = window.EA;
  const cfg = window.EA_SUPABASE || {};
  const lib = window.supabase;
  const SESSION = 'ea-session-';
  const POLL_MS = 6000;

  // Date.parse no acepta bien más de 3 decimales en todos los navegadores
  const ts = (s) => (s ? Date.parse(String(s).replace(/(\.\d{3})\d+/, '$1')) : 0);
  const mapRoom = (r) => ({ id: r.id, code: r.code, hostId: r.host_id, status: r.status, startAt: ts(r.start_at) });
  const mapPlayer = (r) => ({
    id: r.id,
    userId: r.user_id,
    name: r.name,
    characterId: r.character_id,
    x: r.x,
    y: r.y,
    score: r.score,
    completed: r.completed_stations || [],
    stationScores: r.station_scores || {},
    challenges: r.finished_challenges || {},
    finishedAt: ts(r.finished_at),
    exitStatus: r.exit_status,
    exitAt: ts(r.exit_at),
    joinedAt: ts(r.joined_at),
  });

  const net = EA.backend = {
    configured: !!(cfg.url && cfg.publishableKey && lib && !/PEGA_/.test(cfg.publishableKey)),
    sb: null,
    uid: null,
    role: null,
    offset: 0,                 // hora del servidor - hora de este dispositivo (ms)
    online: true,
    room: null,
    players: [],
    listeners: new Set(),
    liveListeners: new Set(),
    statusListeners: new Set(),
    chDb: null,
    chPos: null,
    posReady: false,
    pollId: 0,
    clockId: 0,

    now() { return Date.now() + this.offset; },

    me() { return this.players.find((p) => p.userId === this.uid) || null; },

    snapshot() {
      if (!this.room) return null;
      return { ...this.room, players: this.players.map((p) => ({ ...p })) };
    },

    emit() { const g = this.snapshot(); this.listeners.forEach((cb) => cb(g)); },
    subscribe(cb) { this.listeners.add(cb); return () => this.listeners.delete(cb); },
    subscribeLive(cb) { this.liveListeners.add(cb); return () => this.liveListeners.delete(cb); },
    subscribeStatus(cb) { this.statusListeners.add(cb); return () => this.statusListeners.delete(cb); },

    setOnline(v) {
      if (this.online === v) return;
      this.online = v;
      this.statusListeners.forEach((cb) => cb(v));
    },

    /* ---------- conexión e identidad anónima ---------- */
    async init(role) {
      if (this.sb && this.role === role) return;
      if (!this.configured) throw new Error('not_configured');
      this.role = role;
      // una identidad por rol: así un computador puede ser anfitrión en una pestaña y jugador en otra
      this.sb = lib.createClient(cfg.url, cfg.publishableKey, {
        auth: { storageKey: 'ea-auth-' + role, persistSession: true, autoRefreshToken: true },
        realtime: { params: { eventsPerSecond: 10 } },
      });
      let { data: { session } } = await this.sb.auth.getSession();
      if (!session) {
        const res = await this.sb.auth.signInAnonymously();
        if (res.error) throw new Error('auth_failed');
        session = res.data.session;
      }
      this.uid = session.user.id;
      await this.sb.realtime.setAuth(session.access_token);
      this.sb.auth.onAuthStateChange((_e, s) => { if (s) this.sb.realtime.setAuth(s.access_token); });
      // el reloj se sincroniza en segundo plano (hasta que empieza la partida hay tiempo de sobra)
      this.clockReady = this.syncClock().catch(() => {});
      clearInterval(this.clockId);
      this.clockId = setInterval(() => this.syncClock().catch(() => {}), 60000);

      window.addEventListener('online', () => { this.refresh().catch(() => {}); this.syncClock().catch(() => {}); });
      window.addEventListener('offline', () => this.setOnline(false));
      document.addEventListener('visibilitychange', () => { if (!document.hidden) this.refresh().catch(() => {}); });
    },

    async call(fn, args) {
      const { data, error } = await this.sb.rpc(fn, args || {});
      if (error) {
        const e = new Error(error.message || 'error');
        e.code = String(error.message || '').trim();
        throw e;
      }
      return data;
    },

    // El reloj de la partida es el del servidor: se mide con 3 muestras y se toma la de menor latencia
    async syncClock() {
      let best = null;
      for (let i = 0; i < 3; i++) {
        const t0 = Date.now();
        const data = await this.call('server_now');
        const t1 = Date.now();
        const rtt = t1 - t0;
        const off = ts(data) - (t0 + t1) / 2;
        if (!best || rtt < best.rtt) best = { rtt, off };
      }
      this.offset = best.off;
      return this.offset;
    },

    /* ---------- sala ---------- */
    saveSession(extra) {
      try { localStorage.setItem(SESSION + this.role, JSON.stringify(extra)); } catch (e) { /* sin almacenamiento: no se podrá reconectar */ }
    },
    loadSession(role) {
      try { return JSON.parse(localStorage.getItem(SESSION + role)); } catch (e) { return null; }
    },
    clearSession(role) {
      try { localStorage.removeItem(SESSION + (role || this.role)); } catch (e) { /* nada */ }
    },

    detach() {
      clearInterval(this.pollId);
      if (this.chDb) this.sb.removeChannel(this.chDb);
      if (this.chPos) this.sb.removeChannel(this.chPos);
      this.chDb = this.chPos = null;
      this.posReady = false;
      this.room = null;
      this.players = [];
    },

    async attach(roomRow) {
      this.detach();
      this.room = mapRoom(roomRow);
      const id = this.room.id;
      await this.refresh();

      this.chDb = this.sb.channel('db-' + id)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: 'room_id=eq.' + id }, (pl) => this.onPlayerChange(pl))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: 'id=eq.' + id }, (pl) => {
          if (pl.new && pl.new.id) { this.room = mapRoom(pl.new); this.emit(); }
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') { this.setOnline(true); this.refresh().catch(() => {}); }
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') this.setOnline(false);
        });

      // posiciones: canal privado de la sala (solo lo leen/escriben los miembros)
      this.chPos = this.sb.channel('room:' + id, { config: { private: true, broadcast: { self: false } } })
        .on('broadcast', { event: 'pos' }, ({ payload }) => this.liveListeners.forEach((cb) => cb(payload)))
        .subscribe((status) => { this.posReady = status === 'SUBSCRIBED'; });

      // respaldo: por si Realtime pierde un aviso
      this.pollId = setInterval(() => this.refresh().catch(() => {}), POLL_MS);
    },

    onPlayerChange(pl) {
      if (pl.eventType === 'DELETE') {
        const old = pl.old && pl.old.id;
        this.players = this.players.filter((p) => p.id !== old);
      } else if (pl.new && pl.new.id) {
        const row = mapPlayer(pl.new);
        const i = this.players.findIndex((p) => p.id === row.id);
        if (i >= 0) this.players[i] = row; else this.players.push(row);
        this.players.sort((a, b) => a.joinedAt - b.joinedAt);
      }
      this.emit();
    },

    async refresh() {
      if (!this.room) return;
      const id = this.room.id;
      const [r, p] = await Promise.all([
        this.sb.from('rooms').select('*').eq('id', id).maybeSingle(),
        this.sb.from('players').select('*').eq('room_id', id).order('joined_at'),
      ]);
      if (r.error || p.error) { this.setOnline(false); return; }
      this.setOnline(true);
      if (r.data) this.room = mapRoom(r.data);
      this.players = (p.data || []).map(mapPlayer);
      this.emit();
    },

    async createGame() {
      const row = await this.call('create_room');
      await this.attach(row);
      this.saveSession({ roomId: row.id, code: row.code });
      return this.snapshot();
    },

    async joinGame(code, name) {
      const prow = await this.call('join_room', { p_code: code, p_name: name });
      const { data, error } = await this.sb.from('rooms').select('*').eq('id', prow.room_id).maybeSingle();
      if (error || !data) throw new Error('room_not_found');
      await this.attach(data);
      this.saveSession({ roomId: data.id, code: data.code, name: prow.name });
      return this.me();
    },

    // Reconexión: recupera la sala (anfitrión) o al jugador (mismo dispositivo) tras recargar o perder la conexión
    async resume(role) {
      const s = this.loadSession(role);
      if (!s) return null;
      try {
        await this.init(role);
        await this.clockReady;                       // al retomar una partida en curso el reloj debe estar bien
        if (role === 'host') {
          const { data } = await this.sb.from('rooms').select('*').eq('id', s.roomId).maybeSingle();
          if (!data || data.status === 'finished' || data.host_id !== this.uid) { this.clearSession(role); return null; }
          await this.attach(data);
        } else {
          const prow = await this.call('join_room', { p_code: s.code, p_name: s.name });
          const { data } = await this.sb.from('rooms').select('*').eq('id', prow.room_id).maybeSingle();
          if (!data || data.status === 'finished') { this.clearSession(role); return null; }
          await this.attach(data);
        }
        return this.snapshot();
      } catch (e) {
        if (/room_not_found|host_cannot_play/.test(e.code || '')) this.clearSession(role);
        return null;
      }
    },

    upsertPlayer(row) {
      const p = mapPlayer(row);
      const i = this.players.findIndex((x) => x.id === p.id);
      if (i >= 0) this.players[i] = p; else this.players.push(p);
      this.players.sort((a, b) => a.joinedAt - b.joinedAt);
      this.emit();
      return p;
    },

    async chooseCharacter(characterId) {
      return this.upsertPlayer(await this.call('choose_character', { p_character: characterId }));
    },

    async startGame() {
      const row = await this.call('start_game', { p_room: this.room.id });
      this.room = mapRoom(row);
      await this.refresh();           // los personajes asignados a quien no eligió
    },

    async finishGame() {
      if (!this.room) return;
      const row = await this.call('finish_game', { p_room: this.room.id });
      this.room = mapRoom(row);
      this.emit();
    },

    /* ---------- durante la partida ---------- */
    // challenges: { archivo: [true,false,...], ... } — el servidor recalcula puntos y estaciones
    async reportProgress(challenges) {
      return this.upsertPlayer(await this.call('report_progress', { p_challenges: challenges }));
    },

    savePosition(x, y) {
      this.call('save_position', { p_x: x, p_y: y }).catch(() => {});
    },

    claimExit() { return this.call('claim_exit'); },

    sendPos(x, y, dir, moving) {
      const me = this.me();
      if (!this.posReady || !me) return;
      this.chPos.send({
        type: 'broadcast',
        event: 'pos',
        payload: { i: me.id, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, d: dir, m: moving ? 1 : 0 },
      });
    },
  };
})();
