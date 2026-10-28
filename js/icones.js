/**
 * © 2026 Supervisório MQTT — Inova Agro UFPel EMBRAPII. Código aberto; cópias permitidas desde que citadas.
 *
 * ÍCONES (SVG em linha, traço na cor do texto) — um por tipo de variável e os da interface.
 */

'use strict';

const ICONES = {
    temperatura: '<path d="M10 14.5V5a2 2 0 1 1 4 0v9.5a4 4 0 1 1-4 0Z"/><path d="M12 9v7"/><circle cx="12" cy="17.5" r="1.6" fill="currentColor"/>',
    umidade: '<path d="M12 3.5s-6 6.6-6 10.7a6 6 0 0 0 12 0C18 10.1 12 3.5 12 3.5Z"/><path d="M9.2 14.5a2.9 2.9 0 0 0 2.8 2.8"/>',
    umidade_grao: '<ellipse cx="9" cy="13" rx="3.2" ry="5" transform="rotate(-25 9 13)"/><path d="M17.5 5.5s-3 3.3-3 5.3a3 3 0 0 0 6 0c0-2-3-5.3-3-5.3Z"/>',
    orvalho: '<path d="M12 4s-5 5.6-5 9a5 5 0 0 0 10 0c0-3.4-5-9-5-9Z"/><path d="M4 20h16M7 17.5h2M15 17.5h2"/>',
    co2: '<path d="M7 18a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 8.5a4.5 4.5 0 0 1 .5 9H7Z"/><path d="M10.4 12.2a1.6 1.6 0 1 0 0 2.6M13.4 13.5a1.3 1.3 0 1 0 2.6 0 1.3 1.3 0 1 0-2.6 0"/>',
    pressao: '<path d="M4.5 16a8 8 0 1 1 15 0"/><path d="m12 13 3.5-4"/><circle cx="12" cy="13" r="1.2" fill="currentColor"/><path d="M6 19h12"/>',
    peso: '<path d="M7.5 9h9l2.5 11H5L7.5 9Z"/><circle cx="12" cy="6" r="2.2"/><path d="M10 15h4"/>',
    volume: '<ellipse cx="12" cy="6" rx="6.5" ry="2.5"/><path d="M5.5 6v12c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5V6"/><path d="M5.5 12c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5"/>',
    nivel: '<rect x="6" y="3.5" width="12" height="17" rx="2"/><path d="M6 12.5c2-1 4 1 6 0s4-1 6 0V18a2 2 0 0 1-2 2.5H8A2 2 0 0 1 6 18Z" fill="currentColor" fill-opacity=".2"/>',
    vazao: '<path d="M3 9h11a3 3 0 1 0-3-3M3 15h15a3 3 0 1 1-3 3"/>',
    velocidade: '<path d="M4 16.5a8 8 0 1 1 16 0"/><path d="m12 15 4-5"/><path d="M7 16.5h.01M17 16.5h.01M12 8.5v.01"/>',
    rotacao: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v3.7h-3.7"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/>',
    aceleracao: '<path d="M3 17h4l2-8 3 12 3-15 2 11h4"/>',
    potencia: '<path d="M13.5 3 6 13.5h5.5L10.5 21 18 10.5h-5.5L13.5 3Z"/>',
    energia: '<rect x="3.5" y="7" width="15" height="10" rx="2"/><path d="M21 10.5v3"/><path d="m11.5 8.5-2.5 4h3l-1 3.5"/>',
    corrente: '<circle cx="12" cy="12" r="8.5"/><path d="M8.6 16 12 7.5 15.4 16M9.8 13h4.4"/>',
    tensao: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 8 12 16.5 15.5 8"/>',
    fp: '<circle cx="12" cy="12" r="8.5"/><path d="M12 6.5v11M9 9.2a3 3 0 0 0 0 5.6h6a3 3 0 0 0 0-5.6"/>',
    frequencia: '<path d="M3 12c1.5-5 3-5 4.5 0s3 5 4.5 0 3-5 4.5 0 3 5 4.5 0"/>',
    estado: '<rect x="3.5" y="7.5" width="17" height="9" rx="4.5"/><circle cx="15.5" cy="12" r="2.6" fill="currentColor"/>',
    percentual: '<path d="M18 6 6 18"/><circle cx="7.5" cy="7.5" r="2.2"/><circle cx="16.5" cy="16.5" r="2.2"/>',
    equacao: '<path d="M15 4h-2.5a2 2 0 0 0-2 1.8L9 19a2 2 0 0 1-2 1.8H5M7.5 10H14M15 13l5 5M20 13l-5 5"/>',
    generico: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8v4.5l3 2"/>',
    // interface
    inicio: '<path d="M4 11 12 4l8 7v8.5a1 1 0 0 1-1 1h-4.5V15h-5v5.5H5a1 1 0 0 1-1-1V11Z"/>',
    planta: '<path d="M3 20.5h18M5 20.5V10l5 3V10l5 3V6h4v14.5"/>',
    sinotico: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 15V9h3v6M13.5 15h4M15.5 9v6"/>',
    graficos: '<path d="M4 4v16h16"/><path d="m7 15 3.5-4.5 3 2.5L19 7"/>',
    alarmes: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15l1.5-2Z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
    logs: '<path d="M6 3.5h9l4 4v13H6z"/><path d="M15 3.5v4h4M9 12h7M9 15.5h7M9 9h3"/>',
    controle: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2.2"/><circle cx="8" cy="17" r="2.2"/>',
    horimetro: '<circle cx="12" cy="13" r="7.5"/><path d="M12 9v4l2.5 2.5M10 2.5h4M12 2.5v3"/>',
    relatorio: '<path d="M6 3.5h12v17H6z"/><path d="M9 16v-3M12 16V9M15 16v-5"/>',
    configurar: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.3 3h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5.6 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.4 2.7h4l.4-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z"/>',
    nuvem: '<path d="M7 18.5a4.5 4.5 0 0 1-.7-8.94A6 6 0 0 1 17.8 9a4.5 4.5 0 0 1-.3 9.5H7Z"/>',
    editar: '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
    mais: '<path d="M12 5v14M5 12h14"/>',
    lixo: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    conectar: '<path d="M9 7 4 12l5 5M15 7l5 5-5 5"/>',
    play: '<path d="M7 5v14l11-7L7 5Z"/>',
    pausa: '<path d="M8 5v14M16 5v14"/>',
    baixar: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
    zoom: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5M8 10.5h5M10.5 8v5"/>',
    mover: '<path d="M12 3v18M3 12h18M12 3 9.5 5.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5"/>',
    ajustar: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    sino_off: '<path d="M6 16.5V11a6 6 0 0 1 9-5.2M18 11v5.5l1.5 2H9"/><path d="m4 4 16 16"/>'
};

function icone(nome, classe = '') {
    const d = ICONES[nome] || ICONES.generico;
    return `<svg class="ico ${classe}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
}
