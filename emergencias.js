/* ============================================================
   ESTACIÓN 2 — CENTRO DE EMERGENCIAS

   Contenido distinto al de Archivo Ambiental:
   - Respuestas correctas: solo instrumentos que Archivo NO usó
     (Rotterdam, Kioto, Gotemburgo, Ginebra). Archivo ya usó
     Brundtland, Ramsar, CITES, Montreal, Basilea, Escazú y París.
   - Solo hay 4 instrumentos libres para 5 desafíos: Gotemburgo
     aparece dos veces, con problemas distintos (lluvia ácida y
     eutrofización/ozono) y en mecánicas distintas.
   - Sin fechas, cifras ni artículos concretos.

   Las mecánicas nuevas (scenario, relate, alert, decision) se
   registran en EA.renderers; el motor (partida.js) no cambia.
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
  // Categorías de CITES: no son instrumentos, se describen aquí
  const EXTRA = {
    ap1:  { name: 'Apéndice I',   icon: '1️⃣' },
    ap2:  { name: 'Apéndice II',  icon: '2️⃣' },
    ap3:  { name: 'Apéndice III', icon: '3️⃣' },
    ning: { name: 'Ninguna',      icon: '🚫' },
  };
  const instr = (id) => EXTRA[id] || EA.INSTRUMENTS[id];

  // Marca la respuesta tocada y, si falló, la correcta; avisa al motor.
  function choose(btn, id, ch, ctx, scope) {
    if (ctx.locked()) return;
    const ok = EA.validateAnswer(ch, id);
    btn.classList.add(ok ? 'ok' : 'bad');
    if (!ok) scope.querySelector(`[data-id="${ch.answer}"]`).classList.add('ok');
    ctx.finish(ok);
  }

  function situationBox(label, text, cls) {
    const s = h('div', 'situation' + (cls ? ' ' + cls : ''));
    s.append(h('span', 'sit-k', label), h('p', 'prompt', text));
    return s;
  }

  // 1 · Situación breve + pregunta + 4 opciones
  R.scenario = (box, ch, ctx) => {
    box.append(situationBox('🚨 SITUACIÓN', ch.situation));
    box.append(h('p', 'prompt', ch.prompt));
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

  // 2 · Relaciona: la situación apunta (⬇) a la lista de instrumentos
  R.relate = (box, ch, ctx) => {
    box.append(situationBox('📌 SITUACIÓN', ch.situation, 'relate-from'));
    box.append(h('div', 'relate-arrow', '⬇ ' + ch.prompt));
    const list = h('div', 'relate-list');
    shuffle(ch.options).forEach((id) => {
      const b = h('button', 'opt relate-opt');
      b.type = 'button';
      b.dataset.id = id;
      b.append(h('span', 'relate-to', '→'), h('span', 'opt-ico', instr(id).icon), h('span', 'opt-txt', instr(id).name));
      b.addEventListener('click', () => choose(b, id, ch, ctx, list));
      list.append(b);
    });
    box.append(list);
  };

  // 4 · Panel de alerta + 3 tarjetas
  R.alert = (box, ch, ctx) => {
    const panel = h('div', 'alert-box');
    panel.append(h('div', 'alert-head', '🚨 ALERTA DETECTADA'));
    panel.append(h('p', 'alert-text', ch.alertText || 'El sistema ha identificado una situación relacionada con ' + ch.topic));
    box.append(panel);
    box.append(h('p', 'alert-ask', ch.prompt || '¿Qué instrumento responde a la alerta?'));
    const grid = h('div', 'cards three');
    shuffle(ch.options).forEach((id) => {
      const b = h('button', 'card-opt');
      b.type = 'button';
      b.dataset.id = id;
      b.append(h('span', 'card-ico', instr(id).icon), h('span', 'card-txt', instr(id).name));
      b.addEventListener('click', () => choose(b, id, ch, ctx, grid));
      grid.append(b);
    });
    box.append(grid);
  };

  // 5 · Decisión final: situación más completa y opciones con letras
  R.decision = (box, ch, ctx) => {
    const head = h('div', 'decision-head', '📡 PANEL DE CONTROL');
    box.append(head);
    box.append(h('p', 'prompt', ch.situation));
    box.append(h('p', 'prompt decision-q', ch.prompt));
    const list = h('div', 'letters');
    shuffle(ch.options).forEach((id, i) => {
      const b = h('button', 'opt lettered');
      b.type = 'button';
      b.dataset.id = id;
      b.append(h('span', 'letter', 'ABCDEF'[i]), h('span', 'opt-txt', instr(id).name));
      b.addEventListener('click', () => choose(b, id, ch, ctx, list));
      list.append(b);
    });
    box.append(list);
  };

  // Franja de aviso: rayas rojas y crema con dos sirenas
  function drawBanner(ctx, w, hgt) {
    for (let y = 2; y < hgt - 2; y++) {
      for (let x = 0; x < w; x++) {
        ctx.fillStyle = (((x + y) >> 2) & 1) ? '#e8433f' : '#fff6d6';
        ctx.fillRect(x, y, 1, 1);
      }
    }
    for (const cx of [14, 82]) {
      ctx.fillStyle = '#7a8699'; ctx.fillRect(cx - 4, hgt - 3, 9, 3);
      ctx.fillStyle = '#e8433f'; ctx.fillRect(cx - 3, hgt - 6, 7, 3);
      ctx.fillStyle = '#ff9a8a'; ctx.fillRect(cx - 2, hgt - 7, 5, 1);
      ctx.fillStyle = '#ffe14d'; ctx.fillRect(cx - 1, 0, 3, 1); ctx.fillRect(cx - 6, 2, 1, 1); ctx.fillRect(cx + 6, 2, 1, 1);
    }
  }

  EA.registerStation({
    id: 'emergencias',
    icon: '🚨',
    name: 'CENTRO DE EMERGENCIAS',
    subtitle: 'Se han detectado nuevas alertas ambientales. Analiza la situación y toma la decisión correcta.',
    accent: '#e8433f',
    drawBanner,
    challenges: [
      // 1 · Selección con situación (respuesta: Basilea)
      {
        type: 'scenario',
        title: '⚠️ SELECCIÓN',
        situation: 'Una empresa necesita trasladar residuos peligrosos entre países.',
        prompt: '¿Qué convenio está relacionado directamente con este caso?',
        options: ['basilea', 'ramsar', 'cites', 'paris'],
        answer: 'basilea',
        explain: 'El Convenio de Basilea regula el movimiento de residuos peligrosos entre países.',
      },
      // 2 · Relaciona situación → instrumento (respuesta: Ginebra de 1979)
      {
        type: 'relate',
        title: '🔗 RELACIONA',
        situation: 'Contaminación del aire que puede desplazarse entre diferentes países y provocar problemas como la lluvia ácida.',
        prompt: '¿A qué instrumento corresponde?',
        options: ['ginebra', 'cites', 'ramsar', 'paris'],
        answer: 'ginebra',
        explain: 'El Convenio de Ginebra de 1979 trata la contaminación del aire que se desplaza entre países.',
      },
      // 3 · Verdadero o falso (sobre Escazú)
      {
        type: 'truefalse',
        title: '🧐 ¿VERDADERO O FALSO?',
        statement: 'El Acuerdo de Escazú está relacionado con el acceso a la información ambiental, la participación pública y el acceso a la justicia en asuntos ambientales.',
        labels: ['✅ VERDADERO', '❌ FALSO'],
        answer: true,
        explain: 'Verdadero: el Acuerdo de Escazú trata la información ambiental, la participación pública y el acceso a la justicia.',
      },
      // 4 · Alerta con tarjetas (respuesta: Apéndice II de CITES)
      {
        type: 'alert',
        title: '🚨 IDENTIFICA LA ALERTA',
        alertText: 'Una especie no está necesariamente amenazada actualmente, pero el comercio internacional debe controlarse para evitar que llegue a estarlo.',
        prompt: '¿A qué categoría de CITES corresponde?',
        options: ['ap1', 'ap2', 'ap3', 'ning'],
        answer: 'ap2',
        explain: 'El Apéndice II de CITES controla el comercio de especies que podrían llegar a estar amenazadas.',
      },
      // 5 · Decisión final (respuesta: Kioto)
      {
        type: 'decision',
        title: '🎯 DECISIÓN FINAL',
        situation: 'Varios países quieren cooperar para reducir las emisiones de gases de efecto invernadero y utilizar mecanismos de cooperación para alcanzar sus objetivos.',
        prompt: '¿Cuál instrumento está más relacionado con esta situación?',
        options: ['kioto', 'ramsar', 'cites', 'basilea'],
        answer: 'kioto',
        explain: 'El Protocolo de Kioto busca reducir las emisiones de gases de efecto invernadero con mecanismos de cooperación.',
      },
    ],
  });
})();
