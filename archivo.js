/* ============================================================
   ESTACIÓN 1 — ARCHIVO AMBIENTAL

   Contenido: solo reconocimiento y comprensión básica de los
   instrumentos ambientales del curso. No se usan fechas, cifras
   ni artículos concretos. Las estaciones 2, 3 y 4 se registrarán
   igual (EA.registerStation) en fases posteriores.
   ============================================================ */
(() => {
  'use strict';

  const EA = window.EA;

  // Instrumentos del curso (los reutilizarán las demás estaciones)
  EA.INSTRUMENTS = {
    rotterdam:  { name: 'Convenio de Rotterdam',   icon: '🧪' },
    kioto:      { name: 'Protocolo de Kioto',      icon: '🌡️' },
    gotemburgo: { name: 'Protocolo de Gotemburgo', icon: '🏭' },
    escazu:     { name: 'Acuerdo de Escazú',       icon: '🗣️' },
    basilea:    { name: 'Convenio de Basilea',     icon: '♻️' },
    ginebra:    { name: 'Convenio de Ginebra',     icon: '🌫️' },
    cites:      { name: 'CITES',                   icon: '🦜' },
    ramsar:     { name: 'Convenio de Ramsar',      icon: '🦆' },
    paris:      { name: 'Acuerdo de París (COP21)', icon: '🌍' },
    montreal:   { name: 'Protocolo de Montreal',   icon: '🛡️' },
    brundtland: { name: 'Informe Brundtland',      icon: '📘' },
  };

  // Franja decorativa de estantería con libros (pixel art)
  function drawBanner(ctx, w, h) {
    const colors = ['#e8433f', '#2a7de1', '#ffe14d', '#4cc94c', '#a35bd1', '#ff9a3c', '#2fd1b0'];
    let x = 1;
    let i = 0;
    while (x < w - 3) {
      const bw = 2 + (i % 2);
      const bh = 4 + ((i * 3) % 4);
      ctx.fillStyle = colors[i % colors.length];
      ctx.fillRect(x, h - 2 - bh, bw, bh);
      ctx.fillStyle = 'rgba(255,255,255,.45)';
      ctx.fillRect(x, h - 2 - bh, 1, bh);
      x += bw + (i % 5 === 4 ? 2 : 0);
      i += 1;
    }
    ctx.fillStyle = '#8b5a2b';
    ctx.fillRect(0, h - 2, w, 2);
    ctx.fillStyle = '#c68a4c';
    ctx.fillRect(0, h - 2, w, 1);
  }

  EA.registerStation({
    id: 'archivo',
    icon: '📜',
    name: 'ARCHIVO AMBIENTAL',
    subtitle: 'Recupera los protocolos ambientales.',
    accent: '#c9873a',
    drawBanner,
    challenges: [
      // 1 · Selección rápida
      {
        type: 'choice',
        title: '⚡ SELECCIÓN RÁPIDA',
        prompt: '¿Qué informe popularizó la idea de "desarrollo sostenible"?',
        options: ['brundtland', 'kioto', 'rotterdam', 'escazu'],
        answer: 'brundtland',
        explain: 'El Informe Brundtland ("Nuestro futuro común") planteó el desarrollo sostenible.',
      },
      // 2 · Relacionar concepto con instrumento
      {
        type: 'match',
        title: '🔗 RELACIONA',
        prompt: 'Toca un tema y luego el instrumento que le corresponde.',
        pairs: [
          { id: 'humedales', concept: 'Humedales',           icon: '💧', instrument: 'ramsar' },
          { id: 'especies',  concept: 'Especies amenazadas', icon: '🐾', instrument: 'cites' },
          { id: 'ozono',     concept: 'Capa de ozono',       icon: '☀️', instrument: 'montreal' },
        ],
        explain: 'Ramsar: humedales · CITES: especies amenazadas · Montreal: capa de ozono.',
      },
      // 3 · Verdadero o falso
      {
        type: 'truefalse',
        title: '❓ VERDADERO O FALSO',
        statement: 'El Convenio de Basilea regula el comercio internacional de especies amenazadas de fauna y flora.',
        answer: false,
        explain: 'Falso: eso corresponde a CITES. Basilea trata los desechos peligrosos y su movimiento entre países.',
      },
      // 4 · Encuentra el protocolo
      {
        type: 'cards',
        title: '🔎 ENCUENTRA EL PROTOCOLO',
        situation: 'Una comunidad quiere conocer la información ambiental de su país, participar en las decisiones y tener acceso a la justicia en temas ambientales.',
        options: ['escazu', 'kioto', 'rotterdam', 'ramsar', 'gotemburgo', 'basilea'],
        answer: 'escazu',
        explain: 'Acuerdo de Escazú: información, participación pública y justicia en asuntos ambientales.',
      },
      // 5 · Reto final relámpago (con cuenta atrás)
      {
        type: 'speed',
        title: '⏱ RETO FINAL RELÁMPAGO',
        prompt: '¡Rápido! ¿Qué acuerdo adoptado en la COP21 busca limitar el calentamiento global?',
        options: ['paris', 'kioto', 'montreal', 'ginebra', 'gotemburgo', 'cites'],
        answer: 'paris',
        seconds: 15,
        explain: 'El Acuerdo de París (COP21) busca limitar el calentamiento global.',
      },
    ],
  });
})();
