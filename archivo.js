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
    ginebra:    { name: 'Convenio de Ginebra de 1979', icon: '🌫️' },
    cites:      { name: 'CITES',                   icon: '🦜' },
    ramsar:     { name: 'Convenio Ramsar',         icon: '🦆' },
    paris:      { name: 'Acuerdo de París (COP21)', icon: '🌍' },
    montreal:   { name: 'Protocolo de Montreal',   icon: '🛡️' },
    brundtland: { name: 'Informe Brundtland',      icon: '📘' },

    // Opciones de texto de esta estación (respuestas largas y tarjetas de temas)
    bru_a: { name: 'El desarrollo sostenible, teniendo en cuenta las necesidades actuales sin comprometer las de las futuras generaciones.', icon: '🌱' },
    bru_b: { name: 'Aumentar únicamente la producción industrial.', icon: '🏭' },
    bru_c: { name: 'Reducir el comercio internacional.',            icon: '🚢' },
    bru_d: { name: 'Prohibir el uso de recursos naturales.',        icon: '🚫' },
    tema_cites:    { name: 'Comercio internacional de especies de fauna y flora silvestres', icon: '🦜' },
    tema_ramsar:   { name: 'Conservación y uso adecuado de humedales',                       icon: '💧' },
    tema_kioto:    { name: 'Reducción de emisiones de gases de efecto invernadero',          icon: '🌡️' },
    tema_basilea:  { name: 'Movimiento de residuos peligrosos entre países',                 icon: '♻️' },
    tema_escazu:   { name: 'Información, participación y justicia en asuntos ambientales',   icon: '🗣️' },
    tema_montreal: { name: 'Protección de la capa de ozono',                                 icon: '☀️' },
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
        prompt: '¿Qué busca promover el Informe Brundtland?',
        options: ['bru_a', 'bru_b', 'bru_c', 'bru_d'],
        answer: 'bru_a',
        explain: 'El Informe Brundtland relaciona el desarrollo actual con la protección de las necesidades de las futuras generaciones.',
      },
      // 2 · Relacionar situación con instrumento (una situación, cuatro instrumentos)
      {
        type: 'match',
        title: '🔗 RELACIONA',
        prompt: '¿Cuál instrumento está directamente relacionado con este objetivo? Toca la situación y luego el instrumento.',
        pairs: [
          { id: 'emisiones', concept: 'Un país necesita reducir sus emisiones de gases de efecto invernadero.', icon: '🌡️', instrument: 'kioto' },
        ],
        extras: ['ramsar', 'cites', 'basilea'],
        explain: 'El Protocolo de Kioto busca reducir las emisiones de gases de efecto invernadero.',
      },
      // 3 · Verdadero o falso
      {
        type: 'truefalse',
        title: '❓ VERDADERO O FALSO',
        statement: 'El Acuerdo de París busca limitar el aumento de la temperatura global y promover esfuerzos para enfrentar el cambio climático.',
        answer: true,
        explain: 'Verdadero: el Acuerdo de París busca limitar el aumento de la temperatura global y enfrentar el cambio climático.',
      },
      // 4 · Encuentra la tarjeta
      {
        type: 'cards',
        title: '🔎 ENCUENTRA LA TARJETA',
        prompt: 'Encuentra la tarjeta que corresponde a CITES.',
        options: ['tema_cites', 'tema_ramsar', 'tema_kioto', 'tema_basilea', 'tema_escazu', 'tema_montreal'],
        answer: 'tema_cites',
        explain: 'CITES regula el comercio internacional de especies de fauna y flora silvestres.',
      },
      // 5 · Decisión rápida (con cuenta atrás)
      {
        type: 'speed',
        title: '⏱ DECISIÓN RÁPIDA',
        situation: 'Un país quiere proteger y conservar sus humedales y promover su uso adecuado.',
        prompt: '¿Qué instrumento debe consultar?',
        options: ['ramsar', 'kioto', 'ginebra', 'montreal'],
        answer: 'ramsar',
        seconds: 15,
        explain: 'El Convenio Ramsar protege y conserva los humedales y promueve su uso adecuado.',
      },
    ],
  });
})();
