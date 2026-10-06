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
  const instr = (id) => EA.INSTRUMENTS[id];

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
    panel.append(h('p', 'alert-text', 'El sistema ha identificado una situación relacionada con ' + ch.topic));
    box.append(panel);
    box.append(h('p', 'alert-ask', '¿Qué instrumento responde a la alerta?'));
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
      // 1 · Selección con situación (respuesta: Rotterdam)
      {
        type: 'scenario',
        title: '⚠️ SELECCIÓN',
        situation: 'Un barco llega a un puerto con plaguicidas peligrosos para otro país.',
        prompt: '¿Qué convenio busca que el país receptor sea informado y dé su consentimiento antes?',
        options: ['rotterdam', 'basilea', 'ramsar', 'escazu'],
        answer: 'rotterdam',
        explain: 'Convenio de Rotterdam: consentimiento informado previo en el comercio de ciertos químicos y plaguicidas peligrosos.',
      },
      // 2 · Relaciona situación → instrumento (respuesta: Kioto)
      {
        type: 'relate',
        title: '🔗 RELACIONA',
        situation: 'Un país industrializado debe reducir sus emisiones de gases de efecto invernadero.',
        prompt: '¿A qué instrumento corresponde?',
        options: ['kioto', 'gotemburgo', 'rotterdam'],
        answer: 'kioto',
        explain: 'Protocolo de Kioto: reducción de gases de efecto invernadero por parte de los países industrializados.',
      },
      // 3 · Verdadero o falso (sobre Ginebra)
      {
        type: 'truefalse',
        title: '🧐 ¿VERDADERO O FALSO?',
        statement: 'El Convenio de Ginebra de 1979 trata sobre la contaminación del aire que cruza las fronteras entre países.',
        labels: ['✅ VERDADERO', '❌ FALSO'],
        answer: true,
        explain: 'Verdadero: el Convenio de Ginebra de 1979 es el marco sobre contaminación atmosférica transfronteriza.',
      },
      // 4 · Identifica la alerta con tarjetas (respuesta: Gotemburgo, lluvia ácida)
      {
        type: 'alert',
        title: '🚨 IDENTIFICA LA ALERTA',
        topic: 'lluvia ácida que daña bosques y lagos.',
        options: ['gotemburgo', 'kioto', 'rotterdam'],
        answer: 'gotemburgo',
        explain: 'Protocolo de Gotemburgo: reducir la acidificación, la eutrofización y el ozono a nivel del suelo.',
      },
      // 5 · Decisión final (respuesta: Gotemburgo, otro problema; integra los cuatro instrumentos anteriores)
      {
        type: 'decision',
        title: '🎯 DECISIÓN FINAL',
        situation: 'Varios países ya cooperan contra la contaminación del aire bajo el convenio de 1979. Ahora sus lagos reciben exceso de nutrientes (eutrofización) y hay ozono a nivel del suelo.',
        prompt: '¿Qué protocolo deben activar?',
        options: ['gotemburgo', 'kioto', 'rotterdam', 'ginebra'],
        answer: 'gotemburgo',
        explain: 'Gotemburgo concreta la reducción de acidificación, eutrofización y ozono a nivel del suelo; Ginebra es el marco de cooperación.',
      },
    ],
  });
})();
