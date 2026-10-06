/* ============================================================
   ESTACIÓN 3 — LABORATORIO EPI  (análisis del desempeño ambiental de un país)

   Los retos evalúan COMPRENSIÓN: qué se analiza con el EPI, qué información
   tiene sentido, qué hace un analista y qué conclusiones se pueden sostener.

   Contenido: el material solo menciona seis países (Estados Unidos, Colombia,
   Reino Unido, Alemania, Suiza, Japón) y el tema "análisis del desempeño
   ambiental de un país EPI". NO hay posiciones, puntajes, porcentajes,
   indicadores ni comparaciones reales. El único dato numérico que aparece
   (reto 4) se presenta explícitamente como DATO SOSPECHOSO sin verificar,
   y la respuesta correcta es que no se puede validar.

   Las banderas son solo decorativas (pixel art). Las mecánicas se registran
   en EA.renderers; el motor (partida.js) no cambia.
   ============================================================ */
(() => {
  'use strict';

  const EA = window.EA;
  const R = EA.renderers;

  /* ---------------- países del material (solo decoración) ---------------- */
  const COUNTRIES = {
    usa: 'Estados Unidos', col: 'Colombia', uk: 'Reino Unido', ger: 'Alemania', sui: 'Suiza', jpn: 'Japón',
  };

  /* ---------------- banderas en pixel art (24 x 16) ---------------- */
  const FLAGS = {
    col(r) { r(0, 0, 24, 8, '#ffd100'); r(0, 8, 24, 4, '#003893'); r(0, 12, 24, 4, '#ce1126'); },
    usa(r) {
      for (let y = 0; y < 16; y++) r(0, y, 24, 1, Math.floor(y * 13 / 16) % 2 === 0 ? '#b22234' : '#ffffff');
      r(0, 0, 10, 9, '#3c3b6e');
      for (let y = 1; y < 9; y += 2) for (let x = 1; x < 10; x += 2) r(x, y, 1, 1, '#ffffff');
    },
    uk(r) {
      r(0, 0, 24, 16, '#012169');
      for (let x = 0; x < 24; x++) {
        for (let y = 0; y < 16; y++) {
          const d = Math.min(Math.abs(y - x * 16 / 24), Math.abs(y - (16 - x * 16 / 24)));
          if (d < 1.7) r(x, y, 1, 1, '#ffffff');
          if (d < 0.8) r(x, y, 1, 1, '#c8102e');
        }
      }
      r(9, 0, 6, 16, '#ffffff'); r(0, 5, 24, 6, '#ffffff');
      r(10, 0, 4, 16, '#c8102e'); r(0, 6, 24, 4, '#c8102e');
    },
    ger(r) { r(0, 0, 24, 5, '#000000'); r(0, 5, 24, 6, '#dd0000'); r(0, 11, 24, 5, '#ffce00'); },
    sui(r) { r(0, 0, 24, 16, '#d52b1e'); r(10, 3, 4, 10, '#ffffff'); r(7, 6, 10, 4, '#ffffff'); },
    jpn(r) {
      r(0, 0, 24, 16, '#ffffff');
      for (let y = 0; y < 16; y++) for (let x = 0; x < 24; x++)
        if (Math.hypot(x + .5 - 12, y + .5 - 8) <= 4.6) r(x, y, 1, 1, '#bc002d');
    },
  };

  // Devuelve un <canvas> con la bandera, escalado a `width` píxeles CSS
  const flag = (code, width) => {
    const cv = document.createElement('canvas');
    cv.width = 24; cv.height = 16;
    cv.className = 'flag';
    cv.style.setProperty('--fw', width + 'px');
    cv.setAttribute('role', 'img');
    cv.setAttribute('aria-label', 'Bandera de ' + COUNTRIES[code]);
    const ctx = cv.getContext('2d');
    FLAGS[code]((x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); });
    return cv;
  };
  EA.flag = flag;

  /* ---------------- utilidades ---------------- */
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

  // Marca la opción tocada y, si falló, la correcta; avisa al motor (una sola oportunidad).
  function choose(btn, id, ch, ctx, scope) {
    if (ctx.locked()) return;
    const ok = EA.validateAnswer(ch, id);
    btn.classList.add(ok ? 'ok' : 'bad');
    if (!ok) scope.querySelector(`[data-id="${ch.answer}"]`).classList.add('ok');
    ctx.finish(ok);
  }

  // Lista de opciones con letra (A, B, C, D) en orden aleatorio
  function letterOptions(ch, ctx, cls) {
    const list = h('div', 'lab-opts');
    shuffle(ch.options).forEach((o, i) => {
      const b = h('button', 'opt lab ' + (cls || ''));
      b.type = 'button';
      b.dataset.id = o.id;
      b.append(h('span', 'letter', 'ABCD'[i]), h('span', 'opt-txt', o.text));
      b.addEventListener('click', () => choose(b, o.id, ch, ctx, list));
      list.append(b);
    });
    return list;
  }

  /* ---------------- 1 · Informe del laboratorio (ficha de informe + opciones con letra) ---------------- */
  R.report = (box, ch, ctx) => {
    const card = h('div', 'report');
    const head = h('div', 'report-head');
    head.append(h('span', '', '📄 INFORME EPI'), h('span', 'report-tag', 'EN ANÁLISIS'));
    const body = h('div', 'report-body');
    body.append(h('p', 'report-k', 'País analizado:'));
    const country = h('div', 'report-country');
    country.append(flag(ch.country, 48), h('span', '', COUNTRIES[ch.country].toUpperCase()));
    body.append(country, h('p', 'report-text', ch.text));
    card.append(head, body);
    box.append(card);
    box.append(h('p', 'prompt', ch.prompt));
    box.append(letterOptions(ch, ctx));
  };

  /* ---------------- 2 · Panel de análisis (panel con indicadores + tarjetas con icono) ---------------- */
  R.panel = (box, ch, ctx) => {
    const panel = h('div', 'panel-box');
    const head = h('div', 'panel-head');
    const lights = h('span', 'lights');
    lights.append(h('i'), h('i'), h('i'));
    head.append(h('span', '', '📊 ANÁLISIS EPI'), lights);
    const body = h('div', 'panel-body');
    body.append(h('p', 'report-k', 'País:'));
    const country = h('div', 'report-country');
    country.append(flag(ch.country, 48), h('span', '', COUNTRIES[ch.country].toUpperCase()));
    body.append(country, h('p', 'report-text', ch.text));
    const bar = h('div', 'shimmer'); bar.append(h('i'));
    body.append(bar);
    panel.append(head, body);
    box.append(panel);
    box.append(h('p', 'prompt', ch.prompt));
    const grid = h('div', 'tiles');
    shuffle(ch.options).forEach((o) => {
      const b = h('button', 'card-opt');
      b.type = 'button';
      b.dataset.id = o.id;
      b.append(h('span', 'card-ico', o.icon), h('span', 'card-txt', o.text));
      b.addEventListener('click', () => choose(b, o.id, ch, ctx, grid));
      grid.append(b);
    });
    box.append(grid);
  };

  /* ---------------- 3 · Consola del analista (situación + comandos) ---------------- */
  R.console = (box, ch, ctx) => {
    const con = h('div', 'console');
    const bar = h('div', 'console-bar');
    bar.append(h('i'), h('i'), h('i'), h('span', '', 'CONSOLA DEL ANALISTA'));
    const body = h('div', 'console-body');
    body.append(h('p', 'console-line', '> Nueva información recibida'), h('p', 'console-text', ch.situation));
    const q = h('p', 'console-line caret', '> ' + ch.prompt);
    body.append(q);
    con.append(bar, body);
    box.append(con);
    box.append(letterOptions(ch, ctx, 'cmd'));
  };

  /* ---------------- 4 · Alerta de dato sospechoso ---------------- */
  R.suspect = (box, ch, ctx) => {
    const card = h('div', 'suspect');
    card.append(h('div', 'suspect-bar'));
    const head = h('div', 'suspect-head');
    head.append(h('span', '', '⚠️ INFORME RECIBIDO'), h('span', 'stamp', 'SIN VERIFICAR'));
    card.append(head);
    card.append(h('p', 'suspect-note', 'Dato sospechoso: el analista debe verificarlo.'));
    card.append(h('blockquote', 'suspect-quote', '"' + ch.claim + '"'));
    card.append(h('p', 'suspect-q', ch.prompt));
    box.append(card);
    box.append(letterOptions(ch, ctx, 'warn'));
  };

  /* ---------------- 5 · Diagnóstico EPI (los seis países + decisión conceptual) ---------------- */
  R.diagnosis = (box, ch, ctx) => {
    const dx = h('div', 'dx');
    dx.append(h('div', 'dx-head', '🧩 LABORATORIO EPI'));
    dx.append(h('p', 'dx-text', 'Tenemos seis países en nuestro ejercicio:'));
    const grid = h('div', 'dx-countries');
    Object.keys(COUNTRIES).forEach((code) => {
      const c = h('div', 'dx-c');
      c.append(flag(code, 52), h('span', '', COUNTRIES[code]));
      grid.append(c);
    });
    dx.append(grid);
    dx.append(h('p', 'dx-text', ch.text));
    box.append(dx);
    box.append(h('p', 'prompt', ch.prompt));
    box.append(letterOptions(ch, ctx));
  };

  /* ---------------- franja decorativa: tubos de ensayo, planeta e informes ---------------- */
  function drawBanner(ctx, w, hgt) {
    const colors = ['#4aa3ff', '#5ee06a', '#ff6fa5', '#ffe14d', '#5af0c8'];
    for (let i = 0; i < 5; i++) {
      const x = 4 + i * 8;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x, 1, 5, 9);
      ctx.fillStyle = colors[i]; ctx.fillRect(x + 1, 4 + (i % 3), 3, 6 - (i % 3));
      ctx.fillStyle = '#c8e4f7'; ctx.fillRect(x, 1, 5, 1);
    }
    for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) {
      const d = x * x + y * y;
      if (d <= 17) { ctx.fillStyle = d > 12 ? '#12305f' : '#2a7de1'; ctx.fillRect(48 + x, 5 + y, 1, 1); }
    }
    ctx.fillStyle = '#4cc94c'; ctx.fillRect(46, 3, 3, 2); ctx.fillRect(48, 6, 3, 2);
    for (let i = 0; i < 3; i++) {                      // informes (hojas con líneas)
      const x = 64 + i * 10;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x, 1, 8, 9);
      ctx.fillStyle = '#7ec8ff'; ctx.fillRect(x + 1, 3, 6, 1); ctx.fillRect(x + 1, 5, 6, 1); ctx.fillRect(x + 1, 7, 4, 1);
    }
  }

  /* ---------------- registro de la estación ---------------- */
  EA.registerStation({
    id: 'laboratorio',
    icon: '📊',
    name: 'LABORATORIO EPI',
    subtitle: 'El laboratorio ha recibido información ambiental de diferentes países. Analiza los informes y completa el diagnóstico.',
    accent: '#2a7de1',
    theme: 'lab',
    doneTitle: '📊 ¡LABORATORIO EPI COMPLETADO!',
    drawBanner,
    challenges: [
      // 1 · ¿Qué se analiza?
      {
        type: 'report',
        title: '🔬 INFORME DEL LABORATORIO',
        country: 'col',
        text: 'El laboratorio está realizando un análisis del desempeño ambiental del país.',
        prompt: '¿Qué está analizando principalmente el laboratorio?',
        options: [
          { id: 'amb', text: 'El desempeño ambiental del país.' },
          { id: 'hab', text: 'La cantidad de habitantes del país.' },
          { id: 'ter', text: 'El tamaño territorial del país.' },
          { id: 'ciu', text: 'La cantidad de ciudades del país.' },
        ],
        answer: 'amb',
        explain: 'El laboratorio analiza el desempeño ambiental del país.',
      },
      // 2 · ¿Qué información tiene sentido en el EPI?
      {
        type: 'panel',
        title: '📊 LEE EL INFORME',
        country: 'jpn',
        text: 'El laboratorio está realizando un análisis ambiental del país.',
        prompt: 'Si estás trabajando con el EPI, ¿qué tipo de información tiene sentido analizar?',
        options: [
          { id: 'amb', icon: '🌿', text: 'Información relacionada con el desempeño ambiental.' },
          { id: 'fut', icon: '⚽', text: 'El equipo de fútbol favorito del país.' },
          { id: 'cine', icon: '🎬', text: 'El número de películas producidas.' },
          { id: 'fer', icon: '📅', text: 'La cantidad de feriados nacionales.' },
        ],
        answer: 'amb',
        explain: 'Con el EPI se analiza información relacionada con el desempeño ambiental.',
      },
      // 3 · Decisión del analista
      {
        type: 'console',
        title: '🧠 ANALISTA AMBIENTAL',
        situation: 'El laboratorio recibe información sobre un país y debe realizar un análisis de su desempeño ambiental.',
        prompt: '¿Cuál sería la acción más adecuada para el analista?',
        options: [
          { id: 'ana', text: 'Analizar la información ambiental disponible.' },
          { id: 'ter', text: 'Elegir automáticamente al país con mayor territorio.' },
          { id: 'hab', text: 'Elegir el país por su número de habitantes.' },
          { id: 'azar', text: 'Ignorar la información y escoger un país al azar.' },
        ],
        answer: 'ana',
        explain: 'El analista debe analizar la información ambiental disponible.',
      },
      // 4 · Conclusión no sustentada (el dato es inventado a propósito y se presenta como SOSPECHOSO)
      {
        type: 'suspect',
        title: '⚠️ DATO SOSPECHOSO',
        claim: 'Japón ocupa el puesto número 2 del EPI con 87,4 puntos.',
        prompt: '¿PUEDES VALIDAR ESTA CONCLUSIÓN CON LA INFORMACIÓN DISPONIBLE EN ESTE LABORATORIO?',
        options: [
          { id: 'si-datos', text: 'Sí, porque todos los datos del EPI están disponibles aquí.' },
          { id: 'no', text: 'No, porque el material disponible no proporciona ese ranking ni ese puntaje.' },
          { id: 'si-pais', text: 'Sí, porque Japón es uno de los países estudiados.' },
          { id: 'si-todos', text: 'Sí, porque todos los países tienen un puntaje conocido.' },
        ],
        answer: 'no',
        explain: 'Sin ranking ni puntaje en el material, esa conclusión no se puede validar.',
      },
      // 5 · Cierre conceptual
      {
        type: 'diagnosis',
        title: '🧩 DIAGNÓSTICO EPI',
        text: 'El sistema necesita seleccionar una opción que represente correctamente el objetivo del análisis.',
        prompt: '¿Cuál de estas opciones representa mejor el propósito del análisis EPI?',
        options: [
          { id: 'amb', text: 'Comparar y analizar el desempeño ambiental de los países.' },
          { id: 'ter', text: 'Clasificar los países solamente por tamaño territorial.' },
          { id: 'pob', text: 'Clasificar los países por población.' },
          { id: 'ciu', text: 'Ordenar los países por cantidad de ciudades.' },
        ],
        answer: 'amb',
        explain: 'El análisis EPI busca comparar y analizar el desempeño ambiental de los países.',
      },
    ],
  });
})();
