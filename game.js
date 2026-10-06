(() => {
  'use strict';

  const PX = 4; // tamaño de "pixel" del fondo, en píxeles CSS

  /* ---------------- Espacio compartido entre archivos (EA = Escape Ambiental) ---------------- */
  const EA = window.EA = window.EA || {};
  const GAME_SCREENS = ['room-screen', 'station-screen', 'complete-screen'];

  // Cambia de pantalla: solo una visible a la vez. El HUD aparece únicamente durante la partida.
  EA.showScreen = (id) => {
    document.querySelectorAll('.screen').forEach((s) => { s.hidden = s.id !== id; });
    document.body.classList.toggle('playing', GAME_SCREENS.includes(id));
    document.body.classList.toggle('in-room', id === 'room-screen');
    const target = document.getElementById(id);
    if (target) {
      target.scrollTop = 0;
      // si el contenido es más ancho que la pantalla (mapa en celular), empieza centrado
      target.scrollLeft = Math.max(0, (target.scrollWidth - target.clientWidth) / 2);
    }
  };

  // La fuente pixel dibuja las mayúsculas acentuadas como minúsculas diminutas (Ó -> ó).
  // Se sustituyen por la letra normal + una tilde dibujada con CSS (clase .acc).
  EA.fixAccents = (root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const n of nodes) {
      if (!/[ÁÉÍÓÚ]/.test(n.nodeValue)) continue;
      if (n.parentElement && n.parentElement.closest('.acc')) continue;
      const frag = document.createDocumentFragment();
      n.nodeValue.split(/([ÁÉÍÓÚ])/).forEach((part) => {
        if (/^[ÁÉÍÓÚ]$/.test(part)) {
          const s = document.createElement('span');
          s.className = 'acc';
          s.textContent = part.normalize('NFD')[0];
          frag.appendChild(s);
        } else if (part) {
          frag.appendChild(document.createTextNode(part));
        }
      });
      n.parentNode.replaceChild(frag, n);
    }
  };

  // Generador pseudoaleatorio con semilla: el paisaje no cambia al redimensionar
  function rng(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------------- Fondo: cielo, colinas, árboles ---------------- */
  function drawBackground() {
    const canvas = document.getElementById('bg');
    const w = Math.ceil(window.innerWidth / PX);
    const h = Math.ceil(window.innerHeight / PX);
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    const rand = rng(42);
    const px = (x, y, c) => { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, 1, 1); };

    // Cielo en bandas con tramado (dithering) en los bordes
    const sky = ['#3fb6f5', '#5cc6fa', '#7fd4fc', '#a3e1fd', '#c6efff'];
    const skyH = h * 0.8;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const t = (y / skyH) * sky.length;
        let i = Math.floor(t);
        if (t - i > 0.8 && (x + y) % 2 === 0) i++;
        px(x, y, sky[Math.min(i, sky.length - 1)]);
      }
    }

    // Sol
    const sx = Math.round(w * 0.82), sy = Math.round(h * 0.16);
    for (let y = -10; y <= 10; y++) {
      for (let x = -10; x <= 10; x++) {
        const d = Math.hypot(x, y);
        if (d <= 6.5) px(sx + x, sy + y, '#ffe14d');
        else if (d <= 8.5 && (x + y) % 2 === 0) px(sx + x, sy + y, '#fff3a0');
      }
    }

    // Halo y rayos del sol: capa aparte que solo pulsa cuando se ve la sala
    const glow = document.getElementById('sun-glow');
    const gctx = glow.getContext('2d');
    gctx.clearRect(0, 0, 25, 25);
    gctx.fillStyle = '#fff3a0';
    for (let y = -12; y <= 12; y++) {
      for (let x = -12; x <= 12; x++) {
        const d = Math.hypot(x, y);
        const ring = d > 8.5 && d <= 10.5 && (x + y) % 2 === 0;
        const ray = (x === 0 || y === 0) && d > 9 && d <= 12;
        if (ring || ray) gctx.fillRect(12 + x, 12 + y, 1, 1);
      }
    }
    glow.style.left = (sx - 12) * PX + 'px';
    glow.style.top = (sy - 12) * PX + 'px';

    // Colinas lejanas y cercanas
    const farLine = x => h * 0.68 + Math.sin(x * 0.045) * 3 + Math.sin(x * 0.11 + 2) * 1.5;
    const nearLine = x => h * 0.76 + Math.sin(x * 0.03 + 1) * 3 + Math.sin(x * 0.09) * 1;
    for (let x = 0; x < w; x++) {
      for (let y = Math.round(farLine(x)); y < h; y++) px(x, y, '#8ddc7a');
      for (let y = Math.round(nearLine(x)); y < h; y++) px(x, y, '#58c24d');
    }

    // Suelo con textura
    const groundTop = Math.round(h * 0.86);
    for (let y = groundTop; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dark = (y - groundTop) % 6 === 5 || rand() < 0.04;
        px(x, y, dark ? '#329a3c' : '#3fae45');
      }
    }

    // Árboles (copa redonda con luz arriba-izquierda)
    function tree(x, base, r) {
      for (let y = 0; y < r + 2; y++) { px(x, base - y, '#8b5a2b'); px(x + 1, base - y, '#6e431c'); }
      const cy = base - r - 3;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const d = Math.hypot(dx, dy);
          if (d > r + 0.3) continue;
          let c = '#2e9e3e';
          if (d > r - 0.8) c = '#1f7a31';
          else if (dx + dy < -r * 0.6) c = '#5fd35f';
          px(x + dx + 1, cy + dy, c);
        }
      }
    }
    for (let x = 6; x < w - 6; x += 9 + Math.floor(rand() * 14)) {
      tree(x, Math.round(nearLine(x)) + 2, 4 + Math.floor(rand() * 3));
    }

    // Flores
    const flowers = ['#ff6fa5', '#ffe14d', '#ffffff', '#ff9a3c'];
    for (let i = 0; i < w * 0.5; i++) {
      const x = Math.floor(rand() * w);
      const y = groundTop + 1 + Math.floor(rand() * (h - groundTop - 1));
      px(x, y, flowers[Math.floor(rand() * flowers.length)]);
    }
  }

  /* ---------------- Planeta Tierra (sprite 24x24) ---------------- */
  function drawPlanet() {
    const canvas = document.getElementById('planet');
    const ctx = canvas.getContext('2d');
    const N = 24, c = (N - 1) / 2, R = N / 2;
    const continents = [
      [8, 8, 5, 4], [14, 6, 3, 2], [12, 15, 4, 5],
      [5, 16, 3, 3], [18, 12, 2, 3]
    ];
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const dx = x - c, dy = y - c, d = Math.hypot(dx, dy);
        if (d > R) continue;

        let land = false;
        for (const [cx, cy, rx, ry] of continents) {
          // pequeña ondulación para que el contorno no sea una elipse perfecta
          const wob = 1 + 0.25 * Math.sin(x * 1.7 + y * 1.3);
          if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= wob) { land = true; break; }
        }

        const shade = dx + dy; // negativo = luz, positivo = sombra
        let color;
        if (d > R - 1) color = '#12305f';                       // contorno
        else if (land) color = shade > 7 ? '#2e9e3e' : shade < -6 ? '#7fe06a' : '#4cc94c';
        else color = shade > 7 ? '#1c55b0' : shade < -6 ? '#5cb5ff' : '#2a7de1';

        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    // Brillo
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(5, 4, 2, 1);
    ctx.fillRect(4, 5, 1, 2);
  }

  /* ---------------- Nubes que se desplazan ---------------- */
  function makeClouds() {
    const pattern = [
      '.....#####.......',
      '...#########.....',
      '..###########.##.',
      '.################',
      '#################',
      '.###############.'
    ];
    const holder = document.getElementById('clouds');
    const specs = [
      { top: '8%',  scale: 8, dur: 70, delay: -10 },
      { top: '22%', scale: 5, dur: 95, delay: -55 },
      { top: '40%', scale: 6, dur: 80, delay: -30 }
    ];
    for (const s of specs) {
      const cv = document.createElement('canvas');
      cv.width = pattern[0].length;
      cv.height = pattern.length;
      const ctx = cv.getContext('2d');
      pattern.forEach((row, y) => [...row].forEach((ch, x) => {
        if (ch !== '#') return;
        ctx.fillStyle = y === pattern.length - 1 ? '#cfe9ff' : '#ffffff';
        ctx.fillRect(x, y, 1, 1);
      }));
      cv.className = 'cloud';
      cv.style.top = s.top;
      cv.style.width = cv.width * s.scale + 'px';
      cv.style.height = cv.height * s.scale + 'px';
      cv.style.animationDuration = s.dur + 's';
      cv.style.animationDelay = s.delay + 's';
      holder.appendChild(cv);
    }
  }

  /* ---------------- Sala principal (256 x 200 px lógicos, casillas de 8) ---------------- */
  function drawRoom() {
    const W = 256, H = 200, COLS = 32, ROWS = 25;
    const canvas = document.getElementById('room-canvas');
    const mainCtx = canvas.getContext('2d');
    let ctx = mainCtx;                    // cambia temporalmente al dibujar sprites animados
    const rand = rng(7);
    const r = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
    const disc = (cx, cy, rad, c) => {
      ctx.fillStyle = c;
      for (let dy = -rad; dy <= rad; dy++)
        for (let dx = -rad; dx <= rad; dx++)
          if (dx * dx + dy * dy <= rad * rad + rad * 0.5) ctx.fillRect(cx + dx, cy + dy, 1, 1);
    };
    const ell = (cx, cy, rx, ry, c) => {
      ctx.fillStyle = c;
      for (let dy = -ry; dy <= ry; dy++)
        for (let dx = -rx; dx <= rx; dx++)
          if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1) ctx.fillRect(cx + dx, cy + dy, 1, 1);
    };

    /* ---- Capas animadas: sprites (canvas pequeños) y destellos (spans) sobre el lienzo.
       Cada una recibe duración y desfase propios para que no se muevan a la vez. ---- */
    const room = document.getElementById('room');
    const rand2 = rng(99);
    const cq = n => (n * 100 / 256).toFixed(3) + 'cqw';       // píxeles lógicos -> unidades del contenedor
    const place = (el, cls, x, y, w, h) => {
      el.className = 'at ' + cls;
      el.style.cssText = `--lx:${x};--ly:${y};--lw:${w};--lh:${h}`;
    };
    const timing = (el, base) => {
      el.style.animationDuration = (base * (0.8 + rand2() * 0.5)).toFixed(2) + 's';
      el.style.animationDelay = '-' + (rand2() * base).toFixed(2) + 's';
    };
    const sprite = (x, y, w, h, cls, base, draw) => {
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      place(cv, 'sprite ' + cls, x, y, w, h);
      timing(cv, base);
      ctx = cv.getContext('2d');
      draw();
      ctx = mainCtx;
      room.appendChild(cv);
    };
    const fx = (cls, x, y, w, h, bg, base, extra) => {
      const el = document.createElement('span');
      place(el, 'fx ' + cls, x, y, w, h);
      if (bg) el.style.background = bg;
      if (extra) el.style.cssText += ';' + extra;
      timing(el, base);
      room.appendChild(el);
    };

    // Colores
    const WALL = '#3f7fd0', WALL_D = '#2d5fa8', WALL_L = '#6db0f5';
    const PIPE = '#2fd1b0', PIPE_L = '#8ff0dc', PIPE_D = '#1fa88c';
    const SH = 'rgba(29, 43, 83, 0.16)';          // sombra sutil
    const shadow = (x, y, w, h) => r(x + 2, y + 2, w, h, SH);

    /* ================= PAREDES ================= */
    r(0, 0, W, H, WALL);

    // --- pared superior (y 0..24)
    r(0, 0, W, 3, WALL_D);
    r(0, 3, W, 2, WALL_L);
    for (let x = 32; x < W; x += 32) r(x, 5, 1, 14, WALL_D);
    r(0, 19, W, 1, WALL_L);
    r(0, 20, W, 4, WALL_D);
    // tubería turquesa con juntas y una válvula
    r(8, 15, 240, 3, PIPE); r(8, 15, 240, 1, PIPE_L);
    for (const x of [24, 64, 192, 232]) r(x, 14, 3, 5, PIPE_D);
    r(69, 10, 5, 2, '#e8433f'); r(71, 12, 1, 3, '#e8433f');
    // lámparas
    for (const x of [48, 192]) {
      r(x, 5, 12, 4, '#fff3a0'); r(x + 1, 6, 10, 2, '#ffe14d'); r(x + 3, 9, 6, 1, '#fff3a0');
    }
    // pantallas tecnológicas
    for (const x of [14, 222]) {
      r(x, 5, 20, 10, WALL_D);
      r(x + 1, 6, 18, 8, '#7fe6d2');
      r(x + 2, 7, 6, 1, WALL_D); r(x + 10, 7, 4, 1, WALL_D);       // las barras se animan aparte
    }
    // rejillas de ventilación
    for (const x of [84, 160]) {
      r(x, 6, 12, 7, WALL_D);
      for (let i = 0; i < 3; i++) r(x + 1, 7 + i * 2, 10, 1, WALL_L);
    }
    // cables que cuelgan
    r(34, 9, 8, 1, '#ff9a3c'); r(41, 9, 1, 4, '#ff9a3c');
    r(176, 12, 8, 1, '#ffe14d'); r(176, 8, 1, 5, '#ffe14d');
    // emblema central: planeta
    r(110, 2, 36, 17, WALL_D);
    r(111, 3, 34, 15, '#5aa0e6');
    disc(128, 11, 6, '#12305f'); disc(128, 11, 5, '#2a7de1');
    r(125, 8, 3, 3, '#4cc94c'); r(128, 11, 3, 3, '#4cc94c'); r(130, 8, 2, 2, '#4cc94c'); r(124, 12, 2, 2, '#4cc94c');
    r(124, 7, 2, 1, '#ffffff');
    r(114, 10, 4, 2, '#ffe14d'); r(138, 10, 4, 2, '#ffe14d');   // pequeñas luces

    // --- paredes laterales
    r(6, 0, 2, H, WALL_D); r(248, 0, 2, H, WALL_D);
    r(0, 0, 2, H, WALL_L); r(254, 0, 2, H, WALL_L);
    // tubería vertical turquesa (izquierda) y conducto naranja (derecha)
    r(2, 24, 3, 144, PIPE); r(2, 24, 1, 144, PIPE_L);
    for (const y of [40, 80, 120, 148]) r(1, y, 5, 3, PIPE_D);
    r(251, 24, 3, 144, '#ffb347'); r(251, 24, 1, 144, '#ffd98a');
    for (const y of [40, 80, 120, 148]) r(250, y, 5, 3, '#d9822b');

    // --- pared inferior (y 168..200)
    r(0, 168, W, 3, WALL_L);
    for (let x = 32; x < W; x += 32) r(x, 171, 1, 25, WALL_D);
    r(0, 196, W, 4, WALL_D);
    r(8, 176, 84, 3, PIPE); r(8, 176, 84, 1, PIPE_L);
    r(164, 176, 84, 3, PIPE); r(164, 176, 84, 1, PIPE_L);
    for (const x of [30, 70, 180, 220]) r(x, 175, 3, 5, PIPE_D);
    // ventanillas de plantas en la pared inferior
    for (const x of [20, 56, 196, 228]) {
      r(x, 184, 14, 9, WALL_D); r(x + 1, 185, 12, 7, '#7fe6d2');
      r(x + 3, 188, 2, 3, '#4cc94c'); r(x + 7, 187, 2, 4, '#2e9e3e'); r(x + 10, 189, 2, 2, '#4cc94c');
    }

    /* ================= SUELO ================= */
    for (let ty = 3; ty <= 20; ty++) {
      for (let tx = 1; tx <= 30; tx++) {
        const x = tx * 8, y = ty * 8;
        const rim = tx === 1 || tx === 30 || ty === 3 || ty === 20;
        const A = '#c9efd9', B = '#bde6cd';
        const base = rim ? ((tx + ty) % 2 ? '#b8e8d8' : '#aee2d2') : ((tx + ty) % 2 ? A : B);
        r(x, y, 8, 8, base);
        r(x, y, 8, 1, '#d8f7e4');
        r(x, y + 7, 8, 1, '#a9dcc0');
        r(x + 7, y, 1, 8, '#a9dcc0');
        const k = rand();
        if (rim) {
          if (k < 0.5) r(x + 2, y + 3, 4, 2, '#9fd8c8');                // borde punteado
        } else if (k < 0.12) {                                           // baldosa con recuadro
          r(x + 2, y + 2, 4, 4, base === A ? B : A);
        } else if (k < 0.2) {                                            // puntos
          r(x + 1, y + 1, 1, 1, '#a9dcc0'); r(x + 6, y + 6, 1, 1, '#a9dcc0'); r(x + 6, y + 1, 1, 1, '#a9dcc0');
        } else if (k < 0.25) {                                           // grieta
          r(x + 2, y + 2, 2, 1, '#a9dcc0'); r(x + 4, y + 3, 1, 2, '#a9dcc0'); r(x + 5, y + 5, 2, 1, '#a9dcc0');
        } else if (k < 0.31) {                                           // musgo con florecita
          r(x + 1, y + 5, 4, 2, '#8fdc8a'); r(x + 2, y + 4, 1, 1, '#6fcf7a');
          if (rand() < 0.5) r(x + 5, y + 5, 1, 1, '#ffe14d');
        }
      }
    }
    // sombras sutiles bajo las paredes
    r(8, 24, 240, 2, 'rgba(29, 43, 83, 0.2)');
    r(8, 26, 240, 2, SH);
    r(8, 28, 240, 1, 'rgba(29, 43, 83, 0.07)');
    r(8, 24, 3, 144, SH);
    r(245, 24, 3, 144, SH);

    /* ================= CAMINO CENTRAL ================= */
    const path = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    const setPath = (c0, r0, c1, r1) => {
      for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++) path[rr][cc] = true;
    };
    setPath(14, 3, 17, 20);      // vertical: del emblema a la salida
    setPath(2, 10, 29, 12);      // horizontal: conecta las cuatro estaciones
    setPath(12, 8, 19, 14);      // plaza central
    for (const [cc, rr] of [[12, 8], [19, 8], [12, 14], [19, 14]]) path[rr][cc] = false; // esquinas redondeadas
    const EDGE = '#e0a95e', MORT = '#e6d196';
    for (let ty = 3; ty <= 20; ty++) {
      for (let tx = 1; tx <= 30; tx++) {
        if (!path[ty][tx]) continue;
        const x = tx * 8, y = ty * 8;
        r(x, y, 8, 8, (tx + ty) % 2 ? '#f6e8b6' : '#f1dea0');
        r(x, y + 3, 8, 1, MORT); r(x, y + 7, 8, 1, MORT);
        r(x + (ty % 2 ? 2 : 5), y, 1, 3, MORT);
        r(x + (ty % 2 ? 5 : 2), y + 4, 1, 3, MORT);
        if (!path[ty - 1][tx]) r(x, y, 8, 1, EDGE);
        if (!path[ty + 1][tx]) r(x, y + 7, 8, 1, EDGE);
        if (!path[ty][tx - 1]) r(x, y, 1, 8, EDGE);
        if (!path[ty][tx + 1]) r(x + 7, y, 1, 8, EDGE);
      }
    }
    // mosaico del planeta en la plaza
    disc(128, 92, 13, EDGE);
    disc(128, 92, 12, '#fff6d6');
    disc(128, 92, 10, PIPE);
    disc(128, 92, 9, '#2a7de1');
    r(122, 86, 6, 5, '#4cc94c'); r(121, 90, 3, 3, '#4cc94c'); r(129, 93, 6, 4, '#4cc94c'); r(131, 87, 3, 3, '#4cc94c');
    r(121, 85, 2, 1, '#ffffff');
    r(127, 76, 2, 3, '#ffe14d'); r(127, 105, 2, 3, '#ffe14d');
    r(113, 91, 3, 2, '#ffe14d'); r(141, 91, 3, 2, '#ffe14d');

    /* ================= HELPERS DE DECORACIÓN ================= */
    const plant = (x, y) => {
      r(x + 1, y + 5, 6, 3, '#d9632f'); r(x + 1, y + 5, 6, 1, '#f08a4b');
      r(x + 3, y, 2, 5, '#2e9e3e'); r(x + 1, y + 1, 2, 4, '#4cc94c'); r(x + 5, y + 1, 2, 4, '#4cc94c');
    };
    const tree = (x, y) => {
      r(x + 2, y + 2, 5, 7, SH);
      r(x + 3, y + 5, 2, 3, '#8b5a2b');
      disc(x + 4, y + 3, 3, '#2e9e3e');
      r(x + 2, y + 1, 2, 2, '#5fd35f');
    };
    const bush = (x, y) => {
      r(x + 1, y + 3, 6, 4, '#3fae45'); r(x + 2, y + 2, 4, 2, '#5fd35f');
      r(x + 2, y + 4, 1, 1, '#ff6fa5'); r(x + 5, y + 3, 1, 1, '#ffe14d'); r(x + 4, y + 5, 1, 1, '#ffffff');
    };
    // árbol en maceta: base fija en el lienzo y copa como sprite que se balancea
    const potTree = (x, y) => {
      r(x + 3, y + 12, 9, 3, SH);
      r(x + 5, y + 9, 2, 3, '#8b5a2b');
      r(x + 2, y + 11, 8, 5, '#d9632f'); r(x + 2, y + 11, 8, 1, '#f08a4b');
      sprite(x, y, 12, 11, 'sway', 8, () => {
        disc(6, 5, 5, '#1f7a31'); disc(6, 5, 4, '#2e9e3e'); r(3, 2, 3, 2, '#5fd35f');
      });
    };
    const flask = (x, y, c) => { r(x + 1, y, 2, 2, '#ffffff'); r(x, y + 2, 4, 4, c); r(x, y + 2, 4, 1, '#ffffff'); };

    /* ================= ESTACIONES (plataformas de 72 x 48) ================= */
    const pad = (ox, oy, fill, border, dot) => {
      r(ox + 2, oy + 2, 72, 48, SH);                       // sombra proyectada
      r(ox, oy, 72, 48, border);
      r(ox + 1, oy + 1, 70, 46, fill);
      for (let y = 4; y < 46; y += 4)
        for (let x = 4 + ((y / 4) % 2) * 2; x < 70; x += 4) r(ox + x, oy + y, 1, 1, dot);
      r(ox + 1, oy + 1, 70, 1, 'rgba(255, 255, 255, 0.55)');   // relieve: luz arriba-izquierda
      r(ox + 1, oy + 1, 1, 46, 'rgba(255, 255, 255, 0.55)');
      r(ox + 1, oy + 46, 70, 1, SH);
      r(ox + 70, oy + 1, 1, 46, SH);
    };

    // 1) ARCHIVO AMBIENTAL (arriba izquierda): estantes, biblioteca lateral, escritorio
    (function (ox, oy) {
      const R = (x, y, w, h, c) => r(ox + x, oy + y, w, h, c);
      const S = (x, y, w, h) => shadow(ox + x, oy + y, w, h);
      pad(ox, oy, '#fbe3ae', '#c9873a', '#f1d08a');
      const books = ['#e8433f', '#2a7de1', '#ffe14d', '#4cc94c', '#a35bd1', '#ff9a3c'];
      // estantería trasera
      S(4, 19, 48, 15); R(4, 19, 48, 15, '#8b5a2b'); R(4, 19, 48, 2, '#c68a4c');
      R(5, 21, 46, 5, '#a9733a'); R(5, 27, 46, 5, '#a9733a');
      R(5, 26, 46, 1, '#6e431c'); R(5, 32, 46, 1, '#6e431c');
      for (let row = 0; row < 2; row++)
        for (let i = 0, x = 6; x < 49; i++, x += 3) {
          const h = 3 + ((i + row) % 3);
          R(x, 26 + row * 6 - h, 2, h, books[(i * 2 + row) % books.length]);
        }
      // biblioteca lateral
      S(56, 19, 12, 28); R(56, 19, 12, 28, '#8b5a2b'); R(56, 19, 12, 2, '#c68a4c');
      for (let k = 0; k < 4; k++) {
        const by = 22 + k * 6;
        R(57, by, 10, 5, '#a9733a'); R(57, by + 5, 10, 1, '#6e431c');
        for (let i = 0; i < 3; i++) R(58 + i * 3, by + 1 + (i % 2), 2, 4 - (i % 2), books[(i + k * 2) % books.length]);
      }
      // escritorio con papeles y lámpara
      S(14, 36, 30, 10); R(14, 36, 30, 7, '#d9a05b'); R(14, 36, 30, 1, '#f0c07a'); R(14, 43, 30, 3, '#8b5a2b');
      R(18, 37, 12, 5, '#fff6d6'); R(20, 38, 8, 1, '#c9873a'); R(20, 40, 6, 1, '#c9873a');
      R(36, 36, 5, 3, '#ffe14d'); R(38, 39, 1, 2, '#6e431c');
      // tubo de planos y planta
      R(48, 36, 4, 10, '#fff6d6'); R(48, 39, 4, 1, '#e8433f');
      R(31, 37, 4, 2, '#4cc94c'); R(31, 39, 4, 2, '#2a7de1');          // carpetas
      R(41, 38, 3, 3, '#ffffff'); R(41, 38, 3, 1, '#e8433f');          // taza
      R(52, 43, 4, 2, '#2a7de1'); R(52, 45, 4, 2, '#e8433f');          // pila de libros
      plant(ox + 4, oy + 38);
    })(16, 32);

    // 2) LABORATORIO EPI (arriba derecha): pantalla, mostrador, armario y depósito
    (function (ox, oy) {
      const R = (x, y, w, h, c) => r(ox + x, oy + y, w, h, c);
      const S = (x, y, w, h) => shadow(ox + x, oy + y, w, h);
      pad(ox, oy, '#c8ebf7', '#2a7de1', '#aedaf0');
      // pantalla grande
      S(8, 19, 38, 13); R(8, 19, 38, 13, '#d8dee9'); R(9, 20, 36, 10, '#1f4e8c');
      R(11, 21, 7, 1, '#5af0c8'); R(20, 21, 4, 1, '#7ec8ff'); R(40, 21, 3, 1, '#ffe14d');   // línea de datos (las barras se animan aparte)
      R(10, 29, 34, 1, '#2f6fb8');
      // mostrador con frascos y microscopio
      S(4, 34, 48, 10); R(4, 34, 48, 4, '#f2f6fb'); R(4, 38, 48, 6, '#9db5d0');
      for (const x of [16, 28, 40]) R(x, 38, 1, 6, '#7f98b7');
      R(4, 43, 48, 1, '#7f98b7');
      flask(ox + 10, oy + 32, '#4aa3ff'); flask(ox + 17, oy + 32, '#5ee06a'); flask(ox + 24, oy + 32, '#ff6fa5');
      R(38, 31, 2, 6, '#2a7de1'); R(38, 31, 5, 2, '#2a7de1'); R(36, 36, 8, 2, '#1c55b0');
      // armario/nevera lateral
      S(56, 19, 12, 28); R(56, 19, 12, 28, '#e9eef5'); R(56, 19, 12, 3, '#ffffff'); R(66, 19, 2, 28, '#c3cfdd');
      R(56, 32, 12, 1, '#9db5d0'); R(58, 26, 1, 4, '#2a7de1'); R(58, 36, 1, 5, '#2a7de1'); R(62, 22, 2, 2, '#4cc94c');
      R(60, 38, 4, 3, '#4cc94c'); R(61, 37, 2, 1, '#2e9e3e');
      R(59, 24, 6, 3, '#1f4e8c'); R(60, 25, 2, 1, '#5af0c8'); R(63, 25, 1, 1, '#ffe14d');   // pantallita de la nevera
      R(44, 36, 8, 1, '#9aa7b8');                                                            // gradilla con tubos de ensayo
      ['#ff6fa5', '#5ee06a', '#4aa3ff', '#ffe14d'].forEach((c, i) => R(45 + i * 2, 32, 1, 4, c));
      // depósito de agua y taburete
      S(4, 38, 9, 9); R(4, 38, 9, 9, '#2a7de1'); R(4, 38, 9, 2, '#7ec8ff'); R(6, 41, 2, 5, '#4aa3ff'); R(4, 44, 9, 1, '#1c55b0');
      R(13, 44, 3, 2, '#9aa7b8');
      disc(ox + 31, oy + 43, 3, '#ff6fa5'); disc(ox + 31, oy + 42, 2, '#ff9cc2');
    })(168, 32);

    // 3) CENTRO DE EMERGENCIAS (abajo izquierda): depósito, consola con sirena, extintores, botiquín
    (function (ox, oy) {
      const R = (x, y, w, h, c) => r(ox + x, oy + y, w, h, c);
      const S = (x, y, w, h) => shadow(ox + x, oy + y, w, h);
      pad(ox, oy, '#ffd9cc', '#e8433f', '#ffc2ae');
      // depósito de agua
      S(4, 19, 12, 28); R(4, 19, 12, 28, '#2a7de1'); R(4, 19, 12, 3, '#7ec8ff');
      for (const y of [25, 32, 39]) R(4, y, 12, 1, '#1c55b0');
      R(6, 22, 2, 22, '#4aa3ff'); R(10, 28, 4, 3, '#fff6d6');
      // consola con sirena
      S(20, 19, 36, 13); R(20, 19, 36, 13, '#7a8699'); R(21, 20, 34, 9, '#aab4c4'); R(20, 30, 36, 2, '#6b7488');
      R(34, 28, 8, 2, '#6b7488');
      disc(ox + 38, oy + 24, 4, '#e8433f'); disc(ox + 38, oy + 24, 3, '#ff4d4d'); R(36, 22, 2, 2, '#ffd9cc');
      R(22, 21, 10, 6, '#1f4e8c'); R(44, 21, 10, 6, '#1f4e8c');          // pantallitas (con datos animados aparte)
      R(45, 26, 8, 1, '#2f6fb8');
      R(24, 27, 2, 2, '#4cc94c'); R(28, 27, 2, 2, '#ffe14d'); R(46, 27, 2, 2, '#ffe14d'); R(50, 27, 2, 2, '#e8433f');
      // extintores
      for (const x of [21, 27]) {
        R(x, 37, 5, 9, '#e8433f'); R(x + 1, 35, 3, 2, '#4a4a4a'); R(x + 2, 40, 1, 2, '#ffffff');
      }
      R(20, 45, 13, 2, '#6b7488');
      // señal de aviso
      R(33, 36, 3, 3, '#ffe14d'); R(34, 36, 1, 2, '#1d2b53'); R(34, 39, 1, 6, '#7a8699');
      // botiquín
      S(37, 38, 12, 8); R(37, 38, 12, 8, '#ffffff'); R(37, 45, 12, 1, '#c9d2dc');
      R(42, 39, 2, 6, '#e8433f'); R(40, 41, 6, 2, '#e8433f');
      // conos de seguridad
      for (const x of [54, 62]) {
        R(x + 3, 40, 2, 2, '#ff9a3c'); R(x + 2, 42, 4, 2, '#ff9a3c'); R(x + 1, 44, 6, 2, '#ff9a3c');
        R(x + 2, 43, 4, 1, '#ffffff');
      }
    })(16, 104);

    // 4) NÚCLEO AMBIENTAL (abajo derecha): núcleo de energía, paneles solares y pilonos
    (function (ox, oy) {
      const R = (x, y, w, h, c) => r(ox + x, oy + y, w, h, c);
      const S = (x, y, w, h) => shadow(ox + x, oy + y, w, h);
      pad(ox, oy, '#e8dcff', '#7b4fd1', '#d4c2fa');
      const panel = (x, y) => {
        S(x, y, 18, 12); R(x, y, 18, 12, '#1c55b0'); R(x + 1, y + 1, 16, 10, '#2a7de1');
        R(x + 6, y + 1, 1, 10, '#7ec8ff'); R(x + 12, y + 1, 1, 10, '#7ec8ff'); R(x + 1, y + 5, 16, 1, '#7ec8ff');
        R(x + 8, y + 12, 2, 3, '#7a8699');
      };
      panel(4, 19); panel(50, 19);
      // pilonos con luces y cables
      for (const x of [6, 60]) {
        S(x, 34, 6, 13); R(x, 34, 6, 13, PIPE); R(x, 34, 6, 2, '#c9fff0'); R(x + 2, 38, 2, 2, '#ffe14d'); R(x + 2, 42, 2, 2, '#ffe14d');
      }
      R(12, 42, 10, 1, PIPE); R(50, 42, 10, 1, PIPE);
      // peana y núcleo
      R(20, 43, 32, 3, '#6b7488'); R(22, 41, 28, 3, '#7a8699'); R(24, 39, 24, 2, '#aab4c4');
      disc(ox + 36, oy + 30, 9, '#7b4fd1');
      disc(ox + 36, oy + 30, 8, PIPE);
      disc(ox + 36, oy + 30, 5, '#5af0c8');
      disc(ox + 36, oy + 30, 2, '#c9fff0');
      R(31, 25, 2, 2, '#ffffff');
      // pequeños detalles tecnológicos: pantallita en la peana, baterías y luces de esquina
      R(30, 43, 12, 2, '#1f4e8c');
      R(14, 44, 4, 3, '#ffe14d'); R(14, 44, 4, 1, '#fff3a0');
      R(4, 44, 2, 2, '#ffe14d'); R(66, 44, 2, 2, '#4cc94c');
    })(168, 104);

    // tuberías hacia las estaciones inferiores
    r(5, 135, 15, 3, PIPE); r(5, 135, 15, 1, PIPE_L); r(15, 134, 3, 5, PIPE_D);
    r(234, 137, 14, 3, '#ffb347'); r(234, 137, 14, 1, '#ffd98a');

    /* ================= ELEMENTOS ENTRE ESTACIONES ================= */
    // estanque (arriba, entre el Archivo y el camino)
    ell(100, 57, 10, 15, '#8f9cb0');
    ell(100, 57, 9, 14, '#2a7de1');
    ell(100, 57, 8, 13, '#4aa3ff');
    for (const [x, y] of [[96, 49], [102, 53], [97, 60], [101, 66]]) r(x, y, 3, 1, '#bfe8ff');
    ell(97, 54, 2, 1, '#4cc94c'); ell(103, 62, 2, 1, '#4cc94c'); r(103, 61, 1, 1, '#ff6fa5');
    sprite(90, 52, 3, 6, 'sway', 6, () => { r(2, 0, 1, 5, '#2e9e3e'); r(0, 2, 1, 2, '#2e9e3e'); });   // juncos
    sprite(108, 60, 2, 6, 'sway', 7, () => r(1, 0, 1, 5, '#2e9e3e'));
    sprite(96, 32, 9, 10, 'sway', 7, () => tree(0, 0));

    // huertos y barril de lluvia (arriba, entre el camino y el Laboratorio)
    const bed = (x, y) => {
      r(x + 2, y + 2, 16, 10, SH);
      r(x, y, 16, 10, '#8b5a2b'); r(x + 1, y + 1, 14, 8, '#6e431c');
      const fl = ['#ff6fa5', '#ffe14d', '#ffffff', '#ff9a3c'];
      for (let i = 0; i < 4; i++) {
        r(x + 2 + i * 3, y + 3, 2, 5, '#4cc94c'); r(x + 1 + i * 3, y + 5, 4, 1, '#2e9e3e'); r(x + 2 + i * 3, y + 2, 2, 1, fl[i]);
      }
    };
    bed(148, 38); bed(148, 54);
    r(152, 68, 10, 11, SH);
    r(150, 66, 10, 11, '#2a7de1'); r(150, 66, 10, 2, '#7ec8ff');
    r(150, 70, 10, 1, '#1c55b0'); r(150, 74, 10, 1, '#1c55b0'); r(160, 72, 2, 2, '#9aa7b8');

    // contenedores de reciclaje y banco (abajo, entre el Centro de Emergencias y el camino)
    [['#2a7de1', '#7ec8ff'], ['#4cc94c', '#8fe58a'], ['#ffe14d', '#fff3a0']].forEach(([c, l], i) => {
      const x = 91 + i * 7;
      r(x + 2, 114, 6, 10, SH);
      r(x, 112, 6, 2, l); r(x, 114, 6, 9, c); r(x + 2, 117, 2, 2, '#ffffff'); r(x, 122, 6, 1, 'rgba(29,43,83,0.25)');
    });
    r(93, 138, 16, 2, SH);
    r(92, 134, 16, 4, '#d9a05b'); r(92, 134, 16, 1, '#f0c07a'); r(93, 138, 2, 3, '#8b5a2b'); r(105, 138, 2, 3, '#8b5a2b');
    plant(90, 144);

    // árboles en maceta y farola solar (abajo, entre el camino y el Núcleo)
    potTree(146, 108);
    potTree(146, 132);
    r(160, 114, 3, 14, SH);
    r(159, 112, 2, 14, '#7a8699'); r(157, 108, 6, 4, '#ffe14d'); r(156, 106, 8, 2, '#2a7de1'); r(157, 112, 6, 1, '#fff3a0');

    // canales de agua bajo las estaciones inferiores
    for (const [x, w] of [[24, 76], [156, 76]]) {
      r(x, 156, w, 8, '#8f9cb0');
      r(x + 1, 157, w - 2, 6, '#2a7de1');
      r(x + 1, 158, w - 2, 4, '#4aa3ff');
      for (let i = 0; x + 4 + i * 9 < x + w - 5; i++) r(x + 4 + i * 9 + (i % 2) * 3, 159 + (i % 2) * 2, 4, 1, '#bfe8ff');
      ell(x + 20, 160, 2, 1, '#4cc94c'); ell(x + w - 20, 160, 2, 1, '#4cc94c');
    }

    // plantas y árboles en los márgenes
    [[8, 28], [240, 28], [8, 154], [240, 154]].forEach(([x, y], i) => sprite(x, y, 9, 10, 'sway', 6 + i, () => tree(0, 0)));
    [[8, 86], [240, 86]].forEach(([x, y], i) => sprite(x, y, 8, 8, 'sway', 8 + i, () => bush(0, 0)));
    [[8, 112], [240, 112], [86, 74], [162, 146]].forEach(([x, y], i) => sprite(x, y, 8, 8, 'sway', 7 + i, () => plant(0, 0)));

    /* ================= SALIDA BLOQUEADA ================= */
    // alfombrilla de advertencia sobre el camino
    for (let i = 0; i < 12; i++) r(104 + i * 4, 163, 4, 5, i % 2 ? '#1d2b53' : '#ffe14d');
    // marco con franja de peligro
    r(98, 180, 60, 20, '#ffe14d');
    for (let i = 0; i < 15; i++) r(98 + i * 4, 180, 4, 4, i % 2 ? '#1d2b53' : '#ffe14d');
    // hojas de la puerta
    r(101, 184, 26, 16, '#8f9cb0'); r(129, 184, 26, 16, '#8f9cb0'); r(127, 184, 2, 16, '#5a6678');
    for (const x of [103, 131]) {
      r(x, 186, 22, 5, '#a7b3c6'); r(x, 193, 22, 5, '#a7b3c6');
      r(x, 186, 22, 1, '#c9d3e0'); r(x, 193, 22, 1, '#c9d3e0');
      r(x + 1, 187, 1, 1, '#5a6678'); r(x + 20, 187, 1, 1, '#5a6678');
    }
    // barra de bloqueo y candado
    r(101, 191, 54, 3, '#e8433f'); r(101, 191, 54, 1, '#ff7a6a');
    r(126, 185, 4, 1, '#ffe14d'); r(125, 186, 1, 3, '#ffe14d'); r(130, 186, 1, 3, '#ffe14d');
    r(124, 189, 8, 7, '#ffe14d'); r(124, 195, 8, 1, '#e0a95e'); r(127, 191, 2, 3, '#1d2b53');
    // sirenas laterales y panel de claves
    r(92, 185, 6, 5, '#7a8699'); r(158, 185, 6, 5, '#7a8699');
    r(166, 182, 12, 14, WALL_D); r(167, 183, 10, 5, '#7fe6d2'); r(168, 184, 4, 1, WALL_D);
    for (let i = 0; i < 6; i++) r(168 + (i % 3) * 3, 190 + Math.floor(i / 3) * 3, 2, 2, i === 2 ? '#e8433f' : '#ffe14d');

    /* ================= MICROANIMACIONES =================
       Solo cambian opacity / transform mediante CSS: no hay bucles de JavaScript. */

    // Luces: lámparas que respiran y LEDs que se apagan de vez en cuando (el color de fondo "tapa" la luz)
    for (const x of [48, 192]) fx('glow', x, 5, 12, 4, '#ffffff', 7);
    fx('glow', 52, 68, 5, 3, '#fffbd0', 8);                       // lámpara del escritorio
    const led = (x, y, bg, base) => fx('off', x, y, 2, 2, bg, base);
    led(114, 10, '#5aa0e6', 13); led(138, 10, '#5aa0e6', 17);
    led(176, 142, PIPE, 11); led(176, 146, PIPE, 15); led(230, 142, PIPE, 12); led(230, 146, PIPE, 19);
    led(40, 131, '#aab4c4', 9); led(44, 131, '#aab4c4', 14); led(62, 131, '#aab4c4', 11); led(66, 131, '#aab4c4', 16);
    led(230, 54, '#e9eef5', 12);
    led(168, 190, WALL_D, 10); led(171, 193, WALL_D, 13); led(174, 190, WALL_D, 8);

    // Pantallas: barras que suben y bajan por escalones
    const bar = (x, y, w, h, bg, lo, base) => fx('bar', x, y, w, h, bg, base, `--lo:${lo}`);
    [[4, '#4cc94c', .5], [6, '#ffe14d', .45], [5, '#ff6fa5', .6], [8, '#5af0c8', .4], [6, '#4cc94c', .55], [7, '#ffe14d', .5]]
      .forEach(([h, c, lo], i) => bar(181 + i * 5, 61 - h, 3, h, c, lo, 5 + i * 0.7));
    for (const x of [14, 222])
      [[3, 11, 3, 2], [7, 9, 3, 4], [11, 8, 3, 5], [15, 10, 2, 3]].forEach(([dx, y, w, h], i) => bar(x + dx, y, w, h, WALL_D, .4, 4 + i * 1.1));
    bar(199, 147, 2, 2, '#5af0c8', .5, 3.1); bar(203, 147, 2, 2, '#ffe14d', .5, 4); bar(207, 147, 2, 2, '#5af0c8', .5, 3.6);

    // Centro de Emergencias: líneas de datos, puntos en la pantalla y sirena con pulso lento
    fx('slide', 39, 126, 4, 1, '#7fe6d2', 5, `--dx:${cq(2)}`);
    fx('slide', 41, 128, 5, 1, '#7fe6d2', 7, `--dx:${cq(1)}`);
    fx('twinkle', 62, 127, 2, 2, '#ffe14d', 6); fx('twinkle', 66, 128, 2, 2, '#ff6fa5', 9);
    sprite(49, 123, 11, 11, 'glow', 2.8, () => {
      ctx.fillStyle = '#ff4d4d';
      for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++)
        if (dx * dx + dy * dy <= 30 && (dx + dy) % 2 === 0) ctx.fillRect(5 + dx, 5 + dy, 1, 1);
      disc(5, 5, 3, '#ffd0c8');
    });

    // Núcleo ambiental: halo y brillo que respiran, chispas de energía por los cables
    sprite(192, 122, 25, 25, 'glow', 4.5, () => {
      ctx.fillStyle = '#c9fff0';
      for (let dy = -12; dy <= 12; dy++) for (let dx = -12; dx <= 12; dx++)
        if (dx * dx + dy * dy <= 144 && (dx + dy) % 2 === 0) ctx.fillRect(12 + dx, 12 + dy, 1, 1);
    });
    sprite(196, 126, 17, 17, 'glow-soft', 3.2, () => disc(8, 8, 8, '#c9fff0'));
    fx('travel', 180, 146, 1, 1, '#ffffff', 4, `--dx:${cq(9)}`);
    fx('travel', 227, 146, 1, 1, '#ffffff', 5.5, `--dx:${cq(-9)}`);

    // Planeta central de la pared y mosaico de la plaza: pulso suave y destellos
    sprite(120, 3, 17, 17, 'glow', 6, () => {
      ctx.fillStyle = '#c9fff0';
      for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) {
        const d = dx * dx + dy * dy;
        if (d >= 42 && d <= 56 && (dx + dy) % 2 === 0) ctx.fillRect(8 + dx, 8 + dy, 1, 1);
      }
    });
    fx('twinkle', 123, 9, 1, 1, '#ffffff', 9); fx('twinkle', 132, 13, 1, 1, '#ffffff', 12);
    fx('twinkle', 122, 86, 1, 1, '#ffffff', 10); fx('twinkle', 135, 97, 1, 1, '#ffffff', 14);

    // Agua: ondas que aparecen y se desvanecen (estanque y canales)
    const ripple = (x, y, w, base) => fx('ripple', x, y, w, 1, '#e3f6ff', base);
    [[95, 48], [101, 54], [95, 60], [100, 66]].forEach(([x, y], i) => ripple(x, y, 3, 6 + i));
    [[34, 159], [52, 160], [70, 159], [86, 160], [166, 159], [184, 160], [202, 159], [218, 160]]
      .forEach(([x, y], i) => ripple(x, y, 4, 5 + (i % 4) * 1.5));

    // Laboratorio: burbujas en los frascos
    fx('rise', 179, 68, 1, 1, '#ffffff', 4, `--dy:${cq(-2)}`);
    fx('rise', 186, 68, 1, 1, '#ffffff', 5.5, `--dy:${cq(-2)}`);
  }

  /* ---------------- Navegación entre pantallas ---------------- */
  function init() {
    drawBackground();
    drawPlanet();
    makeClouds();
    drawRoom();
    ['intro', 'host-screen', 'player-screen', 'station-screen', 'complete-screen', 'hud', 'rotate']
      .forEach((id) => EA.fixAccents(document.getElementById(id)));

    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(drawBackground, 100);
    });
    // Los botones ANFITRIÓN / JUGADOR los conecta lobby.js
  }

  init();
})();
