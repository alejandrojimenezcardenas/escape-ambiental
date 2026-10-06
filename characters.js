/* ============================================================
   PERSONAJES — 10 criaturas originales en pixel art 16 x 16

   Cada criatura se dibuja por código con formas simples; después se
   aplican automáticamente el sombreado (luz arriba-izquierda) y el
   contorno. Para cada una se genera una hoja de sprites:

     filas    ↓ abajo · ↑ arriba · ← izquierda · → derecha
     columnas quieto · paso A · paso B · respiración

   La vista lateral izquierda es el reflejo de la derecha.
   ============================================================ */
(() => {
  'use strict';

  const EA = window.EA;
  const S = 16;
  const K = '#1d2b53';          // tinta de ojos
  const WH = '#ffffff';
  const DIR_ROW = { down: 0, up: 1, left: 2, right: 3 };
  const FRAMES = ['stand', 'stepA', 'stepB', 'idle'];

  /* ---------------- pintor sobre una cuadrícula de 16 x 16 ---------------- */
  function painter() {
    const g = {
      buf: Array.from({ length: S }, () => Array(S).fill(null)),
      oy: 0,                                   // desplazamiento vertical del cuerpo (saltito al caminar)
      px(x, y, c) {
        y += g.oy;
        if (x >= 0 && x < S && y >= 0 && y < S) g.buf[y][x] = c;
      },
      rect(x, y, w, h, c) {
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) g.px(x + i, y + j, c);
      },
      ell(cx, cy, rx, ry, c, ymin = -99) {
        for (let y = 0; y < S; y++) {
          for (let x = 0; x < S; x++) {
            const dx = (x + 0.5 - cx) / rx;
            const dy = (y + 0.5 - cy) / ry;
            if (dx * dx + dy * dy <= 1 && y >= ymin) g.px(x, y, c);
          }
        }
      },
      // filas a medida: rows = [[x0, x1], ...] empezando en la fila y
      rows(y, rows, c) {
        rows.forEach(([x0, x1], j) => g.rect(x0, y + j, x1 - x0 + 1, 1, c));
      },
      // solo pinta encima del cuerpo ya dibujado (caras, manchas, símbolos)
      on(x, y, w, h, c) {
        for (let j = 0; j < h; j++) {
          for (let i = 0; i < w; i++) {
            const X = x + i;
            const Y = y + j + g.oy;
            if (X >= 0 && X < S && Y >= 0 && Y < S && g.buf[Y][X]) g.buf[Y][X] = c;
          }
        }
      },
    };
    return g;
  }

  const empty = (buf, x, y) => x < 0 || y < 0 || x >= S || y >= S || !buf[y][x];

  // Sombreado automático: borde inferior/derecho más oscuro, superior/izquierdo más claro
  function shade(buf, map) {
    const out = buf.map((r) => r.slice());
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const m = map[buf[y][x]];
        if (!m) continue;
        if (empty(buf, x + 1, y) || empty(buf, x, y + 1)) out[y][x] = m[1];
        else if (empty(buf, x - 1, y) || empty(buf, x, y - 1)) out[y][x] = m[0];
      }
    }
    return out;
  }

  // Contorno de 1 píxel alrededor de toda la silueta
  function outline(buf, col) {
    const out = buf.map((r) => r.slice());
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        if (buf[y][x]) continue;
        if (!empty(buf, x + 1, y) || !empty(buf, x - 1, y) || !empty(buf, x, y + 1) || !empty(buf, x, y - 1)) out[y][x] = col;
      }
    }
    return out;
  }

  // Pies: en vista frontal/trasera se levanta uno; de perfil se separan y se cruzan
  function feet(g, [x1, x2, w, c], view, step) {
    let a = x1, b = x2, ya = 13, yb = 13;
    if (view === 'side') {
      if (step === 1) { a -= 1; b += 1; } else if (step === 2) { a += 1; b -= 1; }
    } else if (step === 1) ya = 12;
    else if (step === 2) yb = 12;
    g.rect(a, ya, w, 2, c);
    g.rect(b, yb, w, 2, c);
  }

  /* ---------------- las 10 criaturas ---------------- */
  const CHARACTERS = [
    {
      id: 'broti', name: 'BROTI', icon: '🌿', kind: 'Brote',
      outline: '#1f5a2a',
      shade: { '#6fd94f': ['#a6f08a', '#43a83a'], '#8ff07a': ['#c6ffb0', '#5fcf4f'] },
      feet: [5, 9, 2, '#2f8a3a'],
      body(g) {
        g.ell(8, 8.5, 6, 4.5, '#6fd94f');
        g.ell(5, 2.8, 2.4, 1, '#8ff07a');                 // dos hojas en la cabeza
        g.ell(11, 2.8, 2.4, 1, '#8ff07a');
        g.rect(7, 3, 2, 2, '#2f8a3a');                     // tallo
      },
      face: {
        front: [[5, 7, 1, 2, K], [10, 7, 1, 2, K], [3, 9, 2, 1, '#ff8fb0'], [11, 9, 2, 1, '#ff8fb0'], [7, 10, 2, 1, '#2f6a2a']],
        side: [[11, 7, 1, 2, K], [11, 9, 1, 1, '#ff8fb0'], [12, 10, 1, 1, '#2f6a2a']],
      },
    },
    {
      id: 'goti', name: 'GOTI', icon: '💧', kind: 'Gota',
      outline: '#173c7a',
      shade: { '#3b8ff0': ['#8fc8ff', '#2463c0'] },
      feet: [5, 9, 2, '#2463c0'],
      body(g) {
        g.rows(2, [[7, 8], [7, 8], [6, 9], [5, 10], [4, 11], [3, 12], [3, 12], [3, 12], [3, 12], [4, 11], [5, 10]], '#3b8ff0');
      },
      detail(g) { g.on(5, 5, 1, 2, '#e0f4ff'); },        // brillo de agua
      face: {
        front: [[5, 8, 2, 2, K], [9, 8, 2, 2, K], [5, 8, 1, 1, WH], [9, 8, 1, 1, WH], [4, 10, 1, 1, '#ff8fb0'], [11, 10, 1, 1, '#ff8fb0'], [7, 11, 2, 1, '#173c7a']],
        side: [[10, 8, 2, 2, K], [10, 8, 1, 1, WH], [12, 10, 1, 1, '#ff8fb0'], [11, 11, 1, 1, '#173c7a']],
      },
    },
    {
      id: 'soli', name: 'SOLI', icon: '⚡', kind: 'Energía solar',
      outline: '#8a3a10',
      shade: { '#ff8a2a': ['#ffb36a', '#e0601a'] },
      feet: [5, 9, 2, '#e0601a'],
      body(g) {
        const Y = '#ffd23a';                               // rayos
        g.rect(7, 2, 2, 2, Y);
        g.rect(3, 3, 2, 2, Y); g.rect(11, 3, 2, 2, Y);
        g.rect(1, 7, 2, 2, Y); g.rect(13, 7, 2, 2, Y);
        g.rect(3, 11, 2, 2, Y); g.rect(11, 11, 2, 2, Y);
        g.ell(8, 8, 4.5, 4.5, '#ff8a2a');
      },
      face: {
        front: [[6, 7, 1, 2, K], [9, 7, 1, 2, K], [5, 9, 1, 1, '#ff4d6d'], [10, 9, 1, 1, '#ff4d6d'], [7, 10, 2, 1, '#9c1f2a']],
        side: [[10, 7, 1, 2, K], [11, 9, 1, 1, '#ff4d6d'], [11, 10, 1, 1, '#9c1f2a']],
      },
    },
    {
      id: 'roco', name: 'ROCO', icon: '🪨', kind: 'Roca',
      outline: '#3a414b',
      shade: { '#9aa3ad': ['#c9d0d8', '#6b7480'], '#4cc94c': ['#8fe58a', '#2e9e3e'] },
      feet: [3, 10, 3, '#6b7480'],
      body(g) {
        g.rect(3, 4, 10, 1, '#9aa3ad');
        g.rect(2, 5, 12, 7, '#9aa3ad');
        g.rect(3, 12, 10, 1, '#9aa3ad');
        g.rect(4, 3, 7, 2, '#4cc94c');                     // musgo
        g.rect(9, 2, 1, 1, '#ff6fa5');                     // florecita
      },
      detail(g) { g.on(4, 10, 1, 1, '#6b7480'); g.on(5, 11, 1, 1, '#6b7480'); g.on(11, 7, 1, 1, '#6b7480'); },
      face: {
        front: [[4, 6, 3, 1, '#5a6370'], [9, 6, 3, 1, '#5a6370'], [5, 7, 1, 2, K], [10, 7, 1, 2, K], [7, 10, 2, 1, '#3a414b']],
        side: [[10, 6, 3, 1, '#5a6370'], [11, 7, 1, 2, K], [12, 10, 1, 1, '#3a414b']],
      },
    },
    {
      id: 'briso', name: 'BRISO', icon: '🍃', kind: 'Viento',
      outline: '#4a7a90',
      float: true,                                         // flota: no tiene pies
      shade: { '#eefcff': ['#ffffff', '#b8dcea'] },
      body(g) {
        const C = '#eefcff';
        g.ell(5, 9, 3.2, 3, C);
        g.ell(11, 9, 3.2, 3, C);
        g.ell(8, 7.5, 4, 3.8, C);
        g.ell(8, 10, 5.5, 2.5, C);
        g.rect(12, 3, 2, 1, '#5fd35f');                    // hojita llevada por el viento
      },
      detail(g) { g.on(7, 5, 2, 1, '#2fd1b0'); g.on(9, 6, 1, 1, '#2fd1b0'); },
      face: {
        front: [[6, 8, 1, 2, K], [9, 8, 1, 2, K], [4, 10, 2, 1, '#ffb3c8'], [10, 10, 2, 1, '#ffb3c8'], [7, 10, 2, 1, '#3a6a80']],
        side: [[10, 8, 1, 2, K], [10, 10, 1, 1, '#ffb3c8'], [12, 9, 1, 1, '#3a6a80']],
      },
    },
    {
      id: 'reci', name: 'RECI', icon: '♻️', kind: 'Reciclaje',
      outline: '#0d4f42',
      shade: { '#1fb59a': ['#5fe0c4', '#13876f'], '#13876f': ['#2fd1b0', '#0d5f4e'] },
      feet: [4, 10, 2, '#3a414b'],
      body(g) {
        g.rect(3, 5, 10, 8, '#1fb59a');
        g.rect(2, 3, 12, 2, '#13876f');                    // tapa
        g.rect(6, 2, 4, 1, '#13876f');                     // asa
      },
      detail(g, v) {
        const Wf = '#e6fff8';
        if (v.view === 'front') {                          // símbolo de reciclaje en la barriga
          g.on(7, 9, 2, 1, Wf); g.on(6, 10, 1, 1, Wf); g.on(9, 10, 1, 1, Wf); g.on(6, 11, 4, 1, Wf);
        } else if (v.view === 'back') {
          g.on(4, 7, 8, 1, '#13876f'); g.on(4, 10, 8, 1, '#13876f');
        } else {
          g.on(9, 10, 2, 1, Wf); g.on(9, 11, 3, 1, Wf);
        }
      },
      face: {
        front: [[5, 6, 1, 2, K], [10, 6, 1, 2, K], [7, 8, 2, 1, '#0d4f42']],
        side: [[11, 6, 1, 2, K], [12, 8, 1, 1, '#0d4f42']],
      },
    },
    {
      id: 'pilo', name: 'PILO', icon: '🔋', kind: 'Batería',
      outline: '#2a1f6b',
      shade: { '#7b5cf0': ['#a58cff', '#5538c0'] },
      feet: [5, 9, 2, '#5538c0'],
      body(g) {
        const Y = '#ffe14d';
        g.rect(4, 3, 8, 10, '#7b5cf0');
        g.rect(7, 2, 2, 1, '#c9d0d8');                     // borne
        g.rect(3, 7, 1, 1, Y); g.rect(2, 8, 1, 1, Y); g.rect(3, 9, 1, 1, Y);       // bracitos de rayo
        g.rect(12, 7, 1, 1, Y); g.rect(13, 8, 1, 1, Y); g.rect(12, 9, 1, 1, Y);
      },
      detail(g, v) {
        const G = '#5af07a';
        if (v.view === 'front') {                          // ventana de carga; una barra parpadea
          g.on(6, 8, 4, 4, '#2a1f6b');
          if (v.f !== 'idle') g.on(7, 9, 2, 1, G);
          g.on(7, 10, 2, 1, G);
        } else if (v.view === 'back') {
          g.on(8, 6, 1, 1, '#ffe14d'); g.on(7, 7, 2, 1, '#ffe14d'); g.on(7, 8, 1, 1, '#ffe14d');
        } else {
          g.on(9, 8, 2, 4, '#2a1f6b'); g.on(10, 9, 1, 2, G);
        }
      },
      face: {
        front: [[6, 5, 1, 2, K], [9, 5, 1, 2, K]],
        side: [[10, 5, 1, 2, K]],
      },
    },
    {
      id: 'mapi', name: 'MAPI', icon: '🐾', kind: 'Mapache',
      outline: '#3a281c',
      shade: { '#b5835a': ['#d9a77c', '#86603f'] },
      feet: [5, 9, 2, '#4a3426'],
      body(g, v) {
        const B = '#b5835a', T = '#2fd1b0', D = '#4a3426';
        if (v.view === 'side') { g.rect(1, 7, 2, 4, T); g.rect(1, 8, 2, 1, D); g.rect(1, 10, 2, 1, D); }   // cola anillada
        if (v.view === 'front') { g.rect(12, 9, 2, 3, T); g.rect(12, 10, 2, 1, D); }
        g.rect(4, 2, 2, 2, B); g.rect(10, 2, 2, 2, B);     // orejas
        g.ell(8, 6.5, 4.5, 3.2, B);
        g.ell(8, 10.5, 4, 2.5, B);
        if (v.view === 'back') { g.rect(7, 8, 2, 4, T); g.rect(7, 9, 2, 1, D); g.rect(7, 11, 2, 1, D); }
        g.rect(4, 2, 1, 1, D); g.rect(11, 2, 1, 1, D);
      },
      detail(g, v) {
        if (v.view === 'front') { g.on(4, 6, 8, 2, '#4a3426'); g.on(7, 10, 2, 2, '#f3dcc0'); }   // antifaz y barriga
        if (v.view === 'side') { g.on(8, 6, 5, 2, '#4a3426'); g.on(10, 10, 2, 2, '#f3dcc0'); }
      },
      face: {
        front: [[6, 6, 1, 2, WH], [9, 6, 1, 2, WH], [6, 7, 1, 1, K], [9, 7, 1, 1, K], [7, 8, 2, 1, K]],
        side: [[10, 6, 1, 2, WH], [10, 7, 1, 1, K], [12, 8, 1, 1, K]],
      },
    },
    {
      id: 'probi', name: 'PROBI', icon: '🧪', kind: 'Ciencia',
      outline: '#3a5577',
      shade: { '#dff4ff': ['#ffffff', '#a9cfe6'], '#ff5fb0': ['#ff9ccf', '#d93a8c'] },
      feet: [5, 9, 2, '#7b8fb0'],
      body(g) {
        g.rect(6, 2, 4, 4, '#dff4ff');                     // cuello del matraz
        g.rect(5, 2, 6, 1, '#bfe3f5');
        g.ell(8, 9.5, 5.5, 3.5, '#dff4ff');
        g.ell(8, 9.5, 5.5, 3.5, '#ff5fb0', 9);             // líquido
      },
      detail(g, v) {
        if (v.f === 'idle') { g.on(7, 10, 1, 1, WH); g.on(10, 11, 1, 1, WH); }   // burbujas
        else { g.on(6, 11, 1, 1, WH); g.on(9, 10, 1, 1, WH); }
        if (v.view === 'back') g.on(3, 7, 10, 1, '#ff9a3c');
      },
      face: {
        front: [[3, 7, 10, 1, '#ff9a3c'], [5, 6, 2, 2, '#1d6f8a'], [9, 6, 2, 2, '#1d6f8a'], [5, 6, 1, 1, WH], [9, 6, 1, 1, WH], [7, 9, 2, 1, '#7a2050']],
        side: [[3, 7, 8, 1, '#ff9a3c'], [10, 6, 2, 2, '#1d6f8a'], [10, 6, 1, 1, WH], [11, 9, 1, 1, '#7a2050']],
      },
    },
    {
      id: 'arbo', name: 'ARBO', icon: '🌳', kind: 'Bosque',
      outline: '#1d3a1f',
      shade: { '#2e8b3e': ['#5fc45f', '#1f6a2c'], '#9a6334': ['#c08a52', '#6e431c'] },
      feet: [4, 10, 2, '#6e431c'],
      body(g) {
        g.rect(5, 8, 6, 5, '#9a6334');                     // tronco
        g.ell(8, 5.5, 6, 3.6, '#2e8b3e');                  // copa
      },
      detail(g) {
        g.on(5, 3, 2, 1, '#5fc45f');
        g.on(4, 4, 1, 1, '#ff4d4d'); g.on(11, 3, 1, 1, '#ff4d4d'); g.on(8, 6, 1, 1, '#ff4d4d');   // frutos
      },
      face: {
        front: [[6, 9, 1, 2, K], [9, 9, 1, 2, K], [7, 11, 2, 1, '#3a2410']],
        side: [[9, 9, 1, 2, K], [10, 11, 1, 1, '#3a2410']],
      },
    },
  ];

  /* ---------------- generación de las hojas de sprites ---------------- */
  function makeFrame(def, view, f) {
    const g = painter();
    const step = f === 'stepA' ? 1 : f === 'stepB' ? 2 : 0;
    const bob = def.float
      ? (f === 'idle' || f === 'stepA' ? -1 : 0)
      : (step ? -1 : f === 'idle' ? 1 : 0);
    const v = { view, step, f };
    if (def.feet) feet(g, def.feet, view, step);
    g.oy = bob;
    def.body(g, v);
    g.buf = shade(g.buf, def.shade);
    if (def.detail) def.detail(g, v);
    if (view !== 'back') def.face[view === 'side' ? 'side' : 'front'].forEach(([x, y, w, h, c]) => g.on(x, y, w, h, c));
    return outline(g.buf, def.outline);
  }

  const sheets = {};
  function buildSheet(def) {
    const cv = document.createElement('canvas');
    cv.width = S * FRAMES.length;
    cv.height = S * 4;
    const ctx = cv.getContext('2d');
    const views = { down: 'front', up: 'back', left: 'side', right: 'side' };
    Object.keys(DIR_ROW).forEach((dir) => {
      FRAMES.forEach((f, col) => {
        const buf = makeFrame(def, views[dir], f);
        for (let y = 0; y < S; y++) {
          for (let x = 0; x < S; x++) {
            const c = buf[y][dir === 'left' ? S - 1 - x : x];
            if (!c) continue;
            ctx.fillStyle = c;
            ctx.fillRect(col * S + x, DIR_ROW[dir] * S + y, 1, 1);
          }
        }
      });
    });
    return cv;
  }

  EA.CHARACTERS = CHARACTERS.map((c, i) => ({ ...c, num: String(i + 1).padStart(2, '0') }));
  EA.CHAR_DIR_ROW = DIR_ROW;
  EA.charById = (id) => EA.CHARACTERS.find((c) => c.id === id);
  EA.charSheet = (id) => sheets[id] || (sheets[id] = buildSheet(EA.charById(id)));

  // Lienzo nuevo con un fotograma (para tarjetas y listas del lobby)
  EA.charCanvas = (id, dir = 'down', col = 0) => {
    const cv = document.createElement('canvas');
    cv.width = S;
    cv.height = S;
    cv.className = 'char-cv';
    cv.getContext('2d').drawImage(EA.charSheet(id), col * S, DIR_ROW[dir] * S, S, S, 0, 0, S, S);
    return cv;
  };

  // Tira de 4 fotogramas caminando hacia abajo, para la vista previa animada con CSS
  const strips = {};
  EA.charStrip = (id) => {
    if (strips[id]) return strips[id];
    const cv = document.createElement('canvas');
    cv.width = S * 4;
    cv.height = S;
    const ctx = cv.getContext('2d');
    [0, 1, 0, 2].forEach((col, i) => ctx.drawImage(EA.charSheet(id), col * S, 0, S, S, i * S, 0, S, S));
    return (strips[id] = cv.toDataURL());
  };
})();
