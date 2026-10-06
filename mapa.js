/* ============================================================
   MAPA — personajes, movimiento, colisiones y entrada a estaciones

   Coordenadas en píxeles lógicos de la sala (256 x 200). La posición
   (x, y) de cada personaje es el centro de sus pies.

   PC:      W A S D / flechas para moverse · ESPACIO / ENTER para entrar.
   Táctil:  joystick (abajo a la izquierda) + botón para entrar.
            Solo en horizontal: en vertical se muestra "GIRA TU TELÉFONO".
   ============================================================ */
(() => {
  'use strict';

  const EA = window.EA;
  const $ = (id) => document.getElementById(id);

  const W = 256;
  const H = 200;
  const SPEED = 48;                      // píxeles lógicos por segundo
  const NEAR = 10;                       // distancia para "PULSA PARA ENTRAR"
  const SPR = 16;

  // Zona caminable (pies) y obstáculos [x, y, ancho, alto]
  const BOUNDS = { x0: 12, y0: 30, x1: 244, y1: 167 };
  const STATIONS = {
    archivo: [16, 32, 72, 48],
    laboratorio: [168, 32, 72, 48],
    emergencias: [16, 104, 72, 48],
    nucleo: [168, 104, 72, 48],
  };
  const SOLIDS = [
    ...Object.values(STATIONS),
    [91, 44, 19, 27],                    // estanque
    [98, 36, 6, 6],                      // árbol junto al estanque
    [148, 38, 16, 10], [148, 54, 16, 10], [150, 66, 10, 11],   // huertos y barril
    [91, 112, 20, 11],                   // contenedores de reciclaje
    [92, 134, 16, 6], [91, 147, 6, 5],   // banco y planta
    [147, 116, 10, 6], [147, 140, 10, 6], [157, 118, 6, 8],    // macetas y farola
    [24, 156, 76, 8], [156, 156, 76, 8], // canales de agua
    [10, 30, 6, 8], [240, 30, 6, 8], [10, 156, 6, 8], [240, 156, 6, 8],   // árboles de las esquinas
    [9, 88, 7, 6], [241, 88, 7, 6], [9, 113, 6, 7], [241, 113, 6, 7],
    [87, 75, 6, 7], [163, 147, 6, 7],
  ];
  const EXIT = [100, 150, 56, 18];       // frente a la puerta de salida
  const SPAWNS = [
    [112, 84], [144, 84], [112, 102], [144, 102], [128, 76],
    [128, 112], [100, 93], [156, 93], [120, 93], [136, 93],
  ];
  const WALK = [0, 1, 0, 2];             // columnas de la hoja: quieto, paso A, quieto, paso B
  const IDLE = [0, 3];

  /* ---------------- dispositivo y orientación ---------------- */
  const touchMq = matchMedia('(hover: none) and (pointer: coarse)');
  const portraitMq = matchMedia('(orientation: portrait)');
  const isTouch = () => touchMq.matches;
  const blocked = () => isTouch() && portraitMq.matches;      // teléfono en vertical: juego en pausa

  function applyDevice() {
    document.body.classList.toggle('touch', isTouch());
    document.body.classList.toggle('portrait', portraitMq.matches);
    $('map-hint').textContent = isTouch()
      ? 'Usa el joystick · Acércate a una estación'
      : 'Muévete con W A S D o las flechas · Acércate a una estación';
    if (blocked()) { releaseJoy(); clearKeys(); }
    target = undefined;                                         // vuelve a pintar el aviso de entrada
    frame.lastKey = null;
  }
  const listen = (mq) => (mq.addEventListener ? mq.addEventListener('change', applyDevice) : mq.addListener(applyDevice));
  listen(touchMq);
  listen(portraitMq);
  if (screen.orientation && screen.orientation.addEventListener) screen.orientation.addEventListener('change', applyDevice);

  /* ---------------- colisiones ---------------- */
  function hits(x, y) {
    const l = x - 4, r = x + 4, t = y - 3, b = y;
    if (l < BOUNDS.x0 || r > BOUNDS.x1 || t < BOUNDS.y0 || b > BOUNDS.y1) return true;
    for (const [sx, sy, sw, sh] of SOLIDS) {
      if (l < sx + sw && r > sx && t < sy + sh && b > sy) return true;
    }
    return false;
  }

  // Avanza por ejes separados: si choca de frente, se desliza junto a la pared
  function moveActor(a, dx, dy) {
    if (dx && !hits(a.x + dx, a.y)) a.x += dx;
    if (dy && !hits(a.x, a.y + dy)) a.y += dy;
  }

  const facing = (vx, vy) => (Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 'right' : 'left') : (vy > 0 ? 'down' : 'up'));

  /* ---------------- personajes en el mapa ---------------- */
  let actors = [];
  let mine = null;                       // personaje del jugador de este dispositivo
  let raf = 0;
  let last = 0;
  let lastPub = 0;
  let target;                            // estación o salida cercana (undefined = recalcular)

  const shortName = (n) => (n.length > 8 ? n.slice(0, 7) + '…' : n);

  function spawn(i) {
    const [x, y] = SPAWNS[i % SPAWNS.length];
    return { x, y };
  }

  function start(game, player) {
    $('labels').innerHTML = '';
    actors = game.players.filter((p) => p.characterId).map((p) => {
      const idx = game.players.indexOf(p);
      const never = p.x === 128 && p.y === 92;                  // aún no se ha movido: sale de su puesto
      const sp = never ? spawn(idx) : { x: p.x, y: p.y };
      const isMe = !!player && p.id === player.playerId;
      const label = document.createElement('span');
      label.className = 'plabel' + (isMe ? ' me' : '');
      label.textContent = (isMe ? '▼ ' : '') + shortName(p.name);
      $('labels').append(label);
      return {
        id: p.id, name: p.name, charId: p.characterId, isMe,
        x: sp.x, y: sp.y, tx: sp.x, ty: sp.y, dir: 'down', moving: false, remoteMoving: false, lastMsg: 0,
        hidden: p.exitStatus === 'reached',
        phase: Math.random() * 1000,
        label, lx: null, ly: null,
      };
    });
    mine = actors.find((a) => a.isMe) || null;
    if (mine && player) { mine.x = player.x; mine.y = player.y; }
    target = undefined;
    clearKeys();
    releaseJoy();
    cancelAnimationFrame(raf);
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  // Posición de otro jugador (Realtime Broadcast, ~5 veces por segundo mientras se mueve)
  function onLive(msg) {
    if (!msg) return;
    const a = actors.find((x) => x.id === msg.i);
    if (!a || a.isMe) return;
    a.tx = msg.x;
    a.ty = msg.y;
    a.dir = msg.d || a.dir;
    a.remoteMoving = !!msg.m;
    a.lastMsg = performance.now();
  }
  EA.backend.subscribeLive(onLive);

  // Cambios de la sala: quien llegó a la salida desaparece del mapa; las posiciones guardadas
  // corrigen a quien llevaba tiempo sin mandar avisos (por ejemplo, tras reconectar)
  EA.backend.subscribe((g) => {
    if (!g || !actors.length) return;
    g.players.forEach((p) => {
      const a = actors.find((x) => x.id === p.id);
      if (!a || a.isMe) return;
      a.hidden = p.exitStatus === 'reached';
      if (!a.remoteMoving && performance.now() - a.lastMsg > 3000) { a.tx = p.x; a.ty = p.y; }
    });
  });

  /* ---------------- entrada: teclado ---------------- */
  const KEYS = {
    ArrowUp: 'up', KeyW: 'up', w: 'up', W: 'up',
    ArrowDown: 'down', KeyS: 'down', s: 'down', S: 'down',
    ArrowLeft: 'left', KeyA: 'left', a: 'left', A: 'left',
    ArrowRight: 'right', KeyD: 'right', d: 'right', D: 'right',
  };
  const held = { up: false, down: false, left: false, right: false };
  function clearKeys() { Object.keys(held).forEach((k) => { held[k] = false; }); }

  const inRoom = () => document.body.classList.contains('in-room');
  const canPlay = () => !!mine && EA.state.running && !blocked() && !EA.state.player.reachedExit && $('overlay').hidden;

  window.addEventListener('keydown', (e) => {
    if (!mine || !inRoom()) return;
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const k = KEYS[e.code] || KEYS[e.key];
    if (k) { held[k] = true; e.preventDefault(); return; }
    if (e.code === 'Space' || e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (!e.repeat) interact();
    }
  });
  window.addEventListener('keyup', (e) => {
    const k = KEYS[e.code] || KEYS[e.key];
    if (k) held[k] = false;
  });
  window.addEventListener('blur', clearKeys);

  /* ---------------- entrada: joystick táctil ---------------- */
  const joy = { id: null, x: 0, y: 0 };
  const base = $('joy');
  const knob = $('joy-knob');

  function moveJoy(e) {
    const r = base.getBoundingClientRect();
    const R = r.width / 2;
    const max = R * 0.62;
    let dx = e.clientX - (r.left + R);
    let dy = e.clientY - (r.top + R);
    const d = Math.hypot(dx, dy);
    if (d > max) { dx = (dx / d) * max; dy = (dy / d) * max; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    joy.x = dx / max;
    joy.y = dy / max;
  }
  function releaseJoy() {
    joy.id = null;
    joy.x = 0;
    joy.y = 0;
    knob.style.transform = '';
    base.classList.remove('on');
  }

  base.addEventListener('pointerdown', (e) => {
    if (joy.id !== null) return;
    joy.id = e.pointerId;
    try { base.setPointerCapture(e.pointerId); } catch (err) { /* sin captura: sigue funcionando */ }
    base.classList.add('on');
    moveJoy(e);
    e.preventDefault();
  });
  base.addEventListener('pointermove', (e) => { if (e.pointerId === joy.id) moveJoy(e); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((t) => base.addEventListener(t, (e) => {
    if (e.pointerId === joy.id) releaseJoy();
  }));

  /* ---------------- entrar a estaciones y salida ---------------- */
  const act = $('act');

  function findTarget() {
    if (!mine || !canPlay()) return null;
    const fx = mine.x;
    const fy = mine.y - 2;
    let best = null;
    let bestD = NEAR;
    Object.entries(STATIONS).forEach(([id, [x, y, w, hh]]) => {
      const dx = Math.max(x - fx, 0, fx - (x + w));
      const dy = Math.max(y - fy, 0, fy - (y + hh));
      const d = Math.hypot(dx, dy);
      if (d <= bestD) { bestD = d; best = { type: 'station', id }; }
    });
    const [ex, ey, ew, eh] = EXIT;
    if (!best && fx >= ex && fx <= ex + ew && mine.y >= ey && mine.y <= ey + eh) best = { type: 'exit' };
    return best;
  }

  function renderPrompt(t) {
    document.querySelectorAll('.station.near').forEach((el) => el.classList.remove('near'));
    if (!t) { act.hidden = true; document.body.classList.remove('has-act'); return; }
    const touch = isTouch();
    const key = touch ? 'TOCA AQUÍ' : 'ESPACIO / ENTER';
    let html;
    act.classList.remove('info');
    if (t.type === 'station') {
      const def = EA.stations[t.id];
      const el = document.querySelector(`.station[data-station="${t.id}"]`);
      if (el) el.classList.add('near');
      const name = def ? `${def.icon} ${def.name}` : t.id;
      if (EA.isStationDone(t.id)) {
        act.classList.add('info');
        html = `<b>${name}</b><span>✔ YA COMPLETADA</span>`;
      } else {
        html = `<b>${name}</b><span class="go">▶ PULSA PARA ENTRAR</span><small>${key}</small>`;
      }
    } else {
      html = `<b>🚪 SALIDA</b><span class="go">▶ PULSA PARA SALIR</span><small>${key}</small>`;
    }
    act.innerHTML = html;
    EA.fixAccents(act);
    act.hidden = false;
    document.body.classList.add('has-act');
  }

  function interact() {
    if (!canPlay() || !target) return;
    if (target.type === 'station') {
      if (EA.isStationDone(target.id)) { EA.showToast('✔ ESTACIÓN YA COMPLETADA'); return; }
      clearKeys();
      releaseJoy();
      EA.openStation(target.id);
    } else {
      EA.tryExit();
    }
    target = undefined;
  }

  act.addEventListener('mousedown', (e) => e.preventDefault());     // no roba el foco del teclado
  act.addEventListener('click', interact);

  /* ---------------- simulación ---------------- */
  function updateMine(dt) {
    let vx = (held.right ? 1 : 0) - (held.left ? 1 : 0);
    let vy = (held.down ? 1 : 0) - (held.up ? 1 : 0);
    let mag = vx || vy ? 1 : 0;
    if (!mag && (joy.x || joy.y)) {
      vx = joy.x;
      vy = joy.y;
      mag = Math.min(1, Math.hypot(vx, vy));
      if (mag < 0.2) mag = 0;                                       // zona muerta
    }
    if (!mag) { mine.moving = false; return; }
    const n = Math.hypot(vx, vy);
    const step = SPEED * mag * dt;
    const ox = mine.x;
    const oy = mine.y;
    moveActor(mine, (vx / n) * step, (vy / n) * step);
    mine.dir = facing(vx, vy);
    mine.moving = true;                                             // aunque empuje contra una pared, anda en el sitio
    if (mine.x !== ox || mine.y !== oy) target = undefined;
  }

  // Otros jugadores: se acercan suavemente a la última posición recibida
  function updateRemote(a, dt, t) {
    const dx = a.tx - a.x;
    const dy = a.ty - a.y;
    const d = Math.hypot(dx, dy);
    if (d > 40) { a.x = a.tx; a.y = a.ty; }
    else if (d > 0.3) {
      const step = Math.min(d, SPEED * 1.4 * dt);
      a.x += (dx / d) * step;
      a.y += (dy / d) * step;
    }
    const fresh = t - a.lastMsg < 600;                 // si dejó de avisar, está quieto
    a.moving = d > 0.6 || (a.remoteMoving && fresh);
  }

  /* ---------------- dibujo ---------------- */
  const cv = $('actors');
  const ctx = cv.getContext('2d');
  const DIR_ROW = EA.CHAR_DIR_ROW;

  function draw(t) {
    ctx.clearRect(0, 0, W, H);
    const list = actors.filter((a) => !a.hidden).sort((a, b) => a.y - b.y);
    for (const a of list) {
      const x = Math.round(a.x);
      const y = Math.round(a.y);
      const def = EA.charById(a.charId);
      ctx.fillStyle = 'rgba(29, 43, 83, 0.28)';                     // sombra
      if (def.float) { ctx.fillRect(x - 3, y - 1, 6, 2); }
      else { ctx.fillRect(x - 4, y - 1, 8, 2); ctx.fillRect(x - 5, y, 10, 1); }
      const col = a.moving
        ? WALK[Math.floor((t + a.phase) / 130) % WALK.length]
        : IDLE[Math.floor((t + a.phase) / 480) % IDLE.length];
      ctx.drawImage(EA.charSheet(a.charId), col * SPR, DIR_ROW[a.dir] * SPR, SPR, SPR, x - 8, y - 15, SPR, SPR);
    }
    // etiquetas con el nombre (HTML para que se lean bien en cualquier tamaño)
    for (const a of actors) {
      if (a.label.hidden !== a.hidden) a.label.hidden = a.hidden;
      const x = Math.round(a.x);
      const y = Math.round(a.y);
      if (x !== a.lx || y !== a.ly) {
        a.lx = x;
        a.ly = y;
        a.label.style.left = (x / W) * 100 + '%';
        a.label.style.top = ((y - 16) / H) * 100 + '%';
      }
    }
  }

  function frame(t) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (t - last) / 1000));
    last = t;
    if (!inRoom()) { frame.away = true; return; }                  // dentro de una estación: no se simula ni dibuja
    if (frame.away) { frame.away = false; target = undefined; frame.lastKey = null; }   // al volver, recalcula el aviso

    if (mine) {
      if (canPlay()) updateMine(dt);
      else mine.moving = false;
      mine.hidden = EA.state.player.reachedExit;
      const p = EA.state.player;
      p.x = mine.x;
      p.y = mine.y;
      p.dir = mine.dir;
      p.moving = mine.moving;
    }
    for (const a of actors) {
      if (!a.isMe) updateRemote(a, dt, t);
    }

    if (mine) {
      if (target === undefined || t - (frame.lastScan || 0) > 200) {
        frame.lastScan = t;
        const nt = findTarget();
        const key = nt ? nt.type + (nt.id || '') : '';
        if (target === undefined || key !== frame.lastKey) {
          frame.lastKey = key;
          renderPrompt(nt);
        }
        target = nt;
      }
      // publica la posición (partida.js limita el envío a ~5 por segundo y solo al moverse)
      if (t - lastPub > 90) {
        lastPub = t;
        EA.publishMe();
      }
    }
    draw(t);
  }

  applyDevice();

  EA.map = { start, spawn, isTouch, blocked, actors: () => actors };
})();
