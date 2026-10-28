/**
 * © 2026 Supervisório MQTT — Inova Agro UFPel EMBRAPII. Código aberto; cópias permitidas desde que citadas.
 *
 * SINÓTICO (desenho da planta) — biblioteca de símbolos de pós-colheita e armazenagem (moega, pré-limpeza, secador,
 * fornalha, elevador, transportadores, silos com aeração e termometria, balança, câmara fria…), editor (arrastar,
 * redimensionar, girar, ligar com tubos/dutos, desfazer) e visão ao vivo.
 * Cores conforme a ISA-101 (IHM de alto desempenho): fundo neutro, equipamento parado em cinza claro, em vazio em
 * cinza médio com contorno, trabalhando em verde-petróleo; cor forte só para alarme (borda piscando até reconhecer).
 */

'use strict';

const r1 = n => Math.round(n * 10) / 10;

const SIMBOLOS = {
    silo: { nome: 'Silo', grupo: 'Armazenagem', w: 110, h: 190, equip: true, tipoTag: 'temperatura',
        svg: (w, h) => `<path class="corpo" d="M${w * .5} 2 L${w - 4} ${h * .16} V${h * .78} L${w * .5} ${h - 2} L4 ${h * .78} V${h * .16} Z"/>
            <path class="detalhe" d="M4 ${h * .16} H${w - 4} M4 ${h * .78} H${w - 4}"/>
            ${[.3, .46, .62].map(f => `<path class="detalhe fino" d="M4 ${h * f} H${w - 4}"/>`).join('')}
            <g class="termometria">${[.32, .5, .68].map(fx => `<path class="cabo" d="M${w * fx} ${h * .17} V${h * .74}"/>`).join('')}</g>` },
    silo_pulmao: { nome: 'Silo pulmão / tulha', grupo: 'Armazenagem', w: 70, h: 120, equip: true, tipoTag: 'nivel',
        svg: (w, h) => `<path class="corpo" d="M3 3 H${w - 3} V${h * .62} L${w * .62} ${h - 3} H${w * .38} L3 ${h * .62} Z"/><path class="detalhe" d="M3 ${h * .62} H${w - 3}"/>` },
    armazem: { nome: 'Armazém graneleiro', grupo: 'Armazenagem', w: 220, h: 110, equip: true, tipoTag: 'temperatura',
        svg: (w, h) => `<path class="corpo" d="M3 ${h * .35} L${w * .5} 3 L${w - 3} ${h * .35} V${h - 3} H3 Z"/><path class="detalhe fino" d="M${w * .2} ${h - 3} L${w * .5} ${h * .55} L${w * .8} ${h - 3}"/>` },
    moega: { nome: 'Moega', grupo: 'Recebimento', w: 130, h: 70, equip: true,
        svg: (w, h) => `<path class="corpo" d="M3 3 H${w - 3} L${w * .62} ${h - 3} H${w * .38} Z"/>${[.2, .35, .5, .65, .8].map(f => `<path class="detalhe fino" d="M${w * f} 3 V12"/>`).join('')}<path class="detalhe" d="M3 12 H${w - 3}"/>` },
    balanca: { nome: 'Balança rodoviária', grupo: 'Recebimento', w: 170, h: 46, equip: true, tipoTag: 'peso',
        svg: (w, h) => `<rect class="corpo" x="3" y="${h * .45}" width="${w - 6}" height="${h * .4}" rx="3"/><path class="detalhe" d="M${w * .15} ${h * .45} V${h * .2} H${w * .4} L${w * .5} ${h * .45}"/><circle class="detalhe" cx="${w * .22}" cy="${h * .9}" r="3"/><circle class="detalhe" cx="${w * .78}" cy="${h * .9}" r="3"/>` },
    prelimpeza: { nome: 'Máquina de pré-limpeza / limpeza', grupo: 'Beneficiamento', w: 120, h: 80, equip: true,
        svg: (w, h) => `<rect class="corpo" x="3" y="3" width="${w - 6}" height="${h - 18}" rx="4"/>${[.3, .5, .7].map(f => `<path class="detalhe" d="M10 ${h * f - 6} L${w - 10} ${h * f + 2}"/>`).join('')}<path class="detalhe" d="M${w * .2} ${h - 15} V${h - 3} M${w * .8} ${h - 15} V${h - 3}"/>` },
    secador: { nome: 'Secador de coluna', grupo: 'Secagem', w: 100, h: 220, equip: true, tipoTag: 'temperatura',
        svg: (w, h) => `<rect class="corpo" x="8" y="3" width="${w - 16}" height="${h - 30}" rx="3"/><path class="detalhe" d="M8 ${h * .12} H${w - 8}"/>
            ${Array.from({ length: 7 }, (_, i) => { const y = h * .18 + i * h * .085; return `<path class="detalhe fino" d="M14 ${y} l8 6 l8 -6 l8 6 l8 -6 l8 6 l8 -6 l8 6"/>`; }).join('')}
            <path class="detalhe" d="M${w * .3} ${h - 27} L${w * .45} ${h - 3} H${w * .55} L${w * .7} ${h - 27}"/>` },
    fornalha: { nome: 'Fornalha / queimador', grupo: 'Secagem', w: 80, h: 76, equip: true, tipoTag: 'temperatura',
        svg: (w, h) => `<rect class="corpo" x="3" y="10" width="${w - 6}" height="${h - 13}" rx="4"/><path class="detalhe" d="M${w * .35} 10 V2 H${w * .55} V10"/><path class="chama" d="M${w * .5} ${h * .38} c-9 12 -12 18 -6 27 c-4 -9 6 -10 6 -18 c5 7 9 11 4 19 c9 -7 8 -18 -4 -28 Z"/>` },
    elevador: { nome: 'Elevador de canecas', grupo: 'Transporte', w: 46, h: 240, equip: true, tipoTag: 'corrente',
        svg: (w, h) => `<path class="corpo" d="M6 ${h * .1} H${w - 6} V${h - 18} H6 Z"/><path class="corpo" d="M2 3 H${w - 2} V${h * .1} H2 Z"/><path class="corpo" d="M2 ${h - 18} H${w - 2} V${h - 3} H2 Z"/>
            <path class="detalhe fino" d="M${w * .35} ${h * .12} V${h - 20} M${w * .65} ${h * .12} V${h - 20}"/>${Array.from({ length: 6 }, (_, i) => `<path class="detalhe fino" d="M${w * .35} ${h * .2 + i * h * .12} h-5"/>`).join('')}` },
    transportador: { nome: 'Transportador de corrente (redler)', grupo: 'Transporte', w: 220, h: 32, equip: true, tipoTag: 'corrente',
        svg: (w, h) => `<rect class="corpo" x="2" y="4" width="${w - 4}" height="${h - 8}" rx="4"/><path class="detalhe fino corrente" d="M10 ${h / 2} H${w - 10}"/>` },
    rosca: { nome: 'Rosca transportadora', grupo: 'Transporte', w: 190, h: 28, equip: true, tipoTag: 'corrente',
        svg: (w, h) => `<rect class="corpo" x="2" y="4" width="${w - 4}" height="${h - 8}" rx="${(h - 8) / 2}"/><path class="detalhe fino helice" d="${Array.from({ length: Math.floor(w / 14) }, (_, i) => `M${8 + i * 14} 6 l7 ${h - 12}`).join(' ')}"/>` },
    correia: { nome: 'Correia transportadora', grupo: 'Transporte', w: 210, h: 26, equip: true, tipoTag: 'corrente',
        svg: (w, h) => `<rect class="corpo" x="${h / 2}" y="3" width="${w - h}" height="${h - 6}" rx="${(h - 6) / 2}"/><circle class="detalhe" cx="${h / 2 + 8}" cy="${h / 2}" r="${h / 2 - 6}"/><circle class="detalhe" cx="${w - h / 2 - 8}" cy="${h / 2}" r="${h / 2 - 6}"/>` },
    ventilador: { nome: 'Ventilador (aeração)', grupo: 'Armazenagem', w: 64, h: 64, equip: true, tipoTag: 'corrente',
        svg: (w, h) => `<circle class="corpo" cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 2 - 3}"/><g class="helice-gira" style="transform-origin:${w / 2}px ${h / 2}px">${[0, 120, 240].map(a => `<path class="pa" transform="rotate(${a} ${w / 2} ${h / 2})" d="M${w / 2} ${h / 2} c-4 -8 -2 -${h * .3} 6 -${h * .32} c4 6 0 ${h * .2} -6 ${h * .32} Z"/>`).join('')}</g><circle class="detalhe" cx="${w / 2}" cy="${h / 2}" r="3"/>` },
    motor: { nome: 'Motor elétrico', grupo: 'Utilidades', w: 64, h: 42, equip: true, tipoTag: 'corrente',
        svg: (w, h) => `<rect class="corpo" x="3" y="3" width="${w - 18}" height="${h - 6}" rx="5"/><path class="detalhe" d="M${w - 15} ${h / 2} H${w - 2}"/>${[.3, .5, .7].map(f => `<path class="detalhe fino" d="M9 ${h * f} H${w - 24}"/>`).join('')}` },
    bomba: { nome: 'Bomba', grupo: 'Utilidades', w: 54, h: 46, equip: true,
        svg: (w, h) => `<circle class="corpo" cx="${w * .45}" cy="${h * .5}" r="${h * .42}"/><path class="detalhe" d="M${w * .45} ${h * .08} H${w - 2} M${w * .2} ${h - 3} H${w * .7}"/>` },
    valvula: { nome: 'Válvula / registro', grupo: 'Utilidades', w: 44, h: 32, equip: true, tipoTag: 'percentual',
        svg: (w, h) => `<path class="corpo" d="M3 3 L${w / 2} ${h / 2} L3 ${h - 3} Z M${w - 3} 3 L${w / 2} ${h / 2} L${w - 3} ${h - 3} Z"/>` },
    tanque: { nome: 'Tanque / reservatório', grupo: 'Utilidades', w: 76, h: 116, equip: true, tipoTag: 'nivel',
        svg: (w, h) => `<path class="corpo" d="M3 12 Q${w / 2} -4 ${w - 3} 12 V${h - 12} Q${w / 2} ${h + 4} 3 ${h - 12} Z"/>` },
    camara: { nome: 'Câmara fria', grupo: 'Frio', w: 170, h: 116, equip: true, tipoTag: 'temperatura',
        svg: (w, h) => `<rect class="corpo" x="3" y="3" width="${w - 6}" height="${h - 6}" rx="4"/><path class="detalhe fino" d="M${w * .5} ${h * .3} V${h * .7} M${w * .5 - 17} ${h * .4} L${w * .5 + 17} ${h * .6} M${w * .5 + 17} ${h * .4} L${w * .5 - 17} ${h * .6}"/><rect class="detalhe" x="${w - 30}" y="${h * .35}" width="18" height="${h * .55}"/>` },
    compressor: { nome: 'Compressor', grupo: 'Frio', w: 66, h: 56, equip: true, tipoTag: 'corrente',
        svg: (w, h) => `<circle class="corpo" cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 2 - 3}"/><path class="detalhe" d="M${w * .28} ${h * .3} L${w * .72} ${h * .42} M${w * .28} ${h * .7} L${w * .72} ${h * .58}"/>` },
    evaporador: { nome: 'Evaporador', grupo: 'Frio', w: 90, h: 34, equip: true,
        svg: (w, h) => `<rect class="corpo" x="2" y="3" width="${w - 4}" height="${h - 6}" rx="3"/><path class="detalhe fino" d="${Array.from({ length: 8 }, (_, i) => `M${10 + i * (w - 20) / 7} 7 V${h - 7}`).join(' ')}"/>` },
    painel: { nome: 'Quadro elétrico / medidor', grupo: 'Utilidades', w: 66, h: 96, equip: true, tipoTag: 'potencia',
        svg: (w, h) => `<rect class="corpo" x="3" y="3" width="${w - 6}" height="${h - 6}" rx="3"/><path class="detalhe" d="M${w * .55} ${h * .25} L${w * .38} ${h * .52} H${w * .62} L${w * .45} ${h * .78}"/>` },
    estacao: { nome: 'Estação meteorológica', grupo: 'Sensores', w: 56, h: 96, equip: true, tipoTag: 'temperatura',
        svg: (w, h) => `<path class="detalhe" d="M${w / 2} ${h * .3} V${h - 3} M${w * .25} ${h - 3} H${w * .75}"/><rect class="corpo" x="${w * .2}" y="${h * .3}" width="${w * .6}" height="${h * .3}" rx="3"/><path class="detalhe" d="M${w / 2} ${h * .3} V${h * .1} M${w * .2} ${h * .1} H${w * .8}"/><circle class="detalhe" cx="${w * .2}" cy="${h * .1}" r="4"/><circle class="detalhe" cx="${w * .8}" cy="${h * .1}" r="4"/>` },
    sensor: { nome: 'Sensor (bolha)', grupo: 'Sensores', w: 40, h: 40, valor: true,
        svg: (w, h) => `<circle class="bolha" cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 2 - 2}"/>` },
    valor: { nome: 'Valor (indicador)', grupo: 'Indicadores', w: 140, h: 50, valor: true },
    texto: { nome: 'Texto', grupo: 'Indicadores', w: 160, h: 30 },
    area: { nome: 'Área (moldura)', grupo: 'Indicadores', w: 400, h: 260 },
    chave: { nome: 'Chave liga/desliga', grupo: 'Comandos', w: 110, h: 38, comando: true },
    setpoint: { nome: 'Setpoint', grupo: 'Comandos', w: 150, h: 42, comando: true },
    tubo: { nome: 'Tubo / duto / fluxo', grupo: 'Ligações', w: 0, h: 0 }
};
const GRUPOS_SIMBOLOS = ['Recebimento', 'Beneficiamento', 'Secagem', 'Transporte', 'Armazenagem', 'Frio', 'Utilidades', 'Sensores', 'Indicadores', 'Comandos', 'Ligações'];

function miniSimbolo(s) {
    const S = SIMBOLOS[s];
    if (s === 'tubo') return `<svg viewBox="0 0 60 40" class="sin-mini"><path class="tubo-linha" d="M4 30 H30 V10 H56" fill="none"/></svg>`;
    if (!S.svg) return `<svg viewBox="0 0 60 40" class="sin-mini"><rect class="corpo" x="6" y="10" width="48" height="20" rx="4"/><text x="30" y="24" text-anchor="middle" font-size="10">${s === 'texto' ? 'Abc' : s === 'area' ? '▭' : s === 'chave' ? 'I/O' : s === 'setpoint' ? 'SP' : '12,3'}</text></svg>`;
    return `<svg viewBox="-4 -4 ${S.w + 8} ${S.h + 8}" class="sin-mini sin-simbolo est-desligado">${S.svg(S.w, S.h)}</svg>`;
}

// ---------------------------------------------------------------- desenho de um elemento
function svgElemento(pl, el, editando) {
    const S = SIMBOLOS[el.s];
    if (!S) return '';
    if (el.s === 'tubo') {
        const pts = lista(el.pts);
        if (pts.length < 2) return '';
        const d = 'M' + pts.map(p => `${p[0]} ${p[1]}`).join(' L');
        return `<g class="sin-el sin-tubo${el.eq ? '' : ' sem-eq'}" data-id="${el.id}" ${el.eq ? `data-eq="${el.eq}"` : ''}>
            <path class="tubo-fundo" d="${d}"/><path class="tubo-linha" d="${d}"/><path class="tubo-fluxo" d="${d}"/>
            ${editando ? `<path class="tubo-toque" d="${d}"/>` + pts.map((p, i) => `<circle class="sin-ponto" data-ponto="${i}" cx="${p[0]}" cy="${p[1]}" r="6"/>`).join('') : ''}
        </g>`;
    }
    const w = el.w || S.w, h = el.h || S.h;
    const tr = `translate(${r1(el.x)} ${r1(el.y)})${el.rot ? ` rotate(${el.rot} ${w / 2} ${h / 2})` : ''}`;
    let corpo = '';
    const rot = el.rotulo != null ? el.rotulo : '';
    if (el.s === 'area') corpo = `<rect class="area-moldura" x="0" y="0" width="${w}" height="${h}" rx="8"/><text class="area-rotulo" x="12" y="22">${esc(rot)}</text>`;
    else if (el.s === 'texto') corpo = `<text class="sin-texto" x="0" y="${h * .72}" style="font-size:${Math.max(10, h * .6)}px">${esc(rot || 'Texto')}</text>`;
    else if (el.s === 'valor') {
        const tg = SUP.tag(el.tag);
        corpo = `<rect class="valor-caixa" x="0" y="0" width="${w}" height="${h}" rx="5"/>
            <text class="valor-nome" x="8" y="15">${esc(rot || (tg ? tg.nome : 'escolha a variável'))}</text>
            <text class="valor-num" x="${w - 8}" y="${h - 12}" text-anchor="end" data-v="${el.tag || ''}">—</text>
            <rect class="valor-barra-fundo" x="8" y="${h - 7}" width="${w - 16}" height="3"/><rect class="valor-barra" data-barra="${el.tag || ''}" x="8" y="${h - 7}" width="0" height="3"/>`;
    } else if (el.s === 'sensor') {
        const tg = SUP.tag(el.tag);
        corpo = S.svg(w, h) + `<text class="sensor-sigla" x="${w / 2}" y="${h / 2 + 4}" text-anchor="middle">${esc(rot || siglaTipo(tg && tg.tipo))}</text>
            <text class="sensor-valor" x="${w / 2}" y="${h + 14}" text-anchor="middle" data-v="${el.tag || ''}">—</text>`;
    } else if (el.s === 'chave' || el.s === 'setpoint') {
        const cm = pl.comandos.find(c => c.id === el.cmd);
        corpo = `<rect class="cmd-caixa" x="0" y="0" width="${w}" height="${h}" rx="${h / 2}" data-cmd="${el.cmd || ''}"/>
            <text class="cmd-texto" x="${w / 2}" y="${h / 2 + 4}" text-anchor="middle" data-cmdtxt="${el.cmd || ''}">${esc(rot || (cm ? cm.nome : 'escolha o comando'))}</text>`;
    } else {
        corpo = `<g class="sin-simbolo">${S.svg(w, h)}</g>`;
        // nível (preenchimento) no silo/tanque/tulha
        if (el.tagNivel) corpo = `<clipPath id="clip-${el.id}"><g>${S.svg(w, h).match(/<path class="corpo"[^>]*>|<rect class="corpo"[^>]*>/) ? S.svg(w, h).match(/<path class="corpo"[^>]*>|<rect class="corpo"[^>]*>/)[0] : ''}</g></clipPath>
            ${corpo}<rect class="nivel-preench" clip-path="url(#clip-${el.id})" data-nivel="${el.tagNivel}" x="0" y="${h}" width="${w}" height="0"/>`;
        corpo += `<text class="sin-rotulo" x="${w / 2}" y="-6" text-anchor="middle">${esc(rot)}</text>`;
        const tags = lista(el.tags);
        corpo += tags.map((id, i) => {
            const tg = SUP.tag(id);
            return `<g class="sin-tagval" data-tag="${id}" transform="translate(${w / 2} ${h + 16 + i * 17})"><rect x="-62" y="-12" width="124" height="16" rx="3"/><text x="0" y="0" text-anchor="middle"><tspan class="tv-nome">${esc(tg ? abreviarNome(tg, el) : '?')}</tspan> <tspan class="tv-num" data-v="${id}">—</tspan></text></g>`;
        }).join('');
    }
    const eqAttr = el.eq ? ` data-eq="${el.eq}"` : '';
    const handles = editando ? `<rect class="sin-sel-caixa" x="-4" y="-4" width="${w + 8}" height="${h + 8}"/><rect class="sin-alca" data-alca="1" x="${w - 3}" y="${h - 3}" width="12" height="12"/>` : '';
    return `<g class="sin-el sin-${el.s}" data-id="${el.id}"${eqAttr} transform="${tr}">${corpo}${handles}<rect class="sin-toque" x="0" y="0" width="${w}" height="${h}"/></g>`;
}
/** Nome curto para caber no sinótico: "Temperatura da massa de grãos" → "T. massa grãos"; tira o nome do equipamento. */
function abreviarNome(tg, el) {
    let n = tg.nome;
    const eq = el && el.rotulo ? el.rotulo.toLowerCase() : '';
    const troca = [[/^Temperatura/i, 'T.'], [/^Umidade relativa/i, 'UR'], [/^Umidade/i, 'Umid.'], [/^Corrente/i, 'I'], [/^Potência/i, 'P'], [/^Pressão estática/i, 'P. est.'], [/^Pressão/i, 'P.'],
        [/^Tensão/i, 'V'], [/^Fator de potência/i, 'FP'], [/^Ponto de orvalho/i, 'T. orvalho'], [/^Abertura/i, 'Abert.'], [/^Energia/i, 'E']];
    for (const [re, s] of troca) if (re.test(n)) { n = n.replace(re, s); break; }
    n = n.split(' ').filter(p => !['do', 'da', 'de', 'dos', 'das', 'no', 'na', 'em'].includes(p.toLowerCase())).join(' ');
    if (eq) { const sem = n.replace(new RegExp('\\s*' + eq.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*', 'i'), ' ').trim(); if (sem.length >= 2) n = sem; }
    n = n.replace(/\s+(silo|câmara)\s+\d+$/i, '').trim();
    return n.length > 16 ? n.slice(0, 15) + '…' : n;
}
function siglaTipo(t) {
    return { temperatura: 'TT', umidade: 'MT', umidade_grao: 'MT', orvalho: 'TD', co2: 'AT', pressao: 'PT', peso: 'WT', volume: 'LT', nivel: 'LT', vazao: 'FT',
        velocidade: 'ST', rotacao: 'ST', aceleracao: 'VT', potencia: 'JT', energia: 'JQ', corrente: 'IT', tensao: 'ET', fp: 'JT', frequencia: 'ST', estado: 'XS', percentual: 'ZT' }[t] || 'XT';
}

function svgSinotico(pl, editando = false) {
    const s = pl.sinotico;
    const grade = editando ? `<defs><pattern id="sin-grade" width="${s.grade}" height="${s.grade}" patternUnits="userSpaceOnUse"><path d="M ${s.grade} 0 L 0 0 0 ${s.grade}" class="sin-grade"/></pattern></defs><rect width="${s.largura}" height="${s.altura}" fill="url(#sin-grade)"/>` : '';
    const ordem = [...s.elementos].sort((a, b) => (a.s === 'area' ? -1 : 0) - (b.s === 'area' ? -1 : 0) || (a.s === 'tubo' ? -1 : 0) - (b.s === 'tubo' ? -1 : 0));
    return `<svg class="sin-svg${editando ? ' editando' : ''}" viewBox="0 0 ${s.largura} ${s.altura}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Sinótico ${escAttr(pl.nome)}">
        <rect class="sin-fundo" width="${s.largura}" height="${s.altura}"/>${grade}
        <g class="sin-conteudo">${ordem.map(el => svgElemento(pl, el, editando)).join('')}</g></svg>`;
}

/** Atualiza valores e estados do sinótico já desenhado (sem redesenhar). */
function atualizarSinotico(raiz, pl) {
    if (!raiz) return;
    raiz.querySelectorAll('[data-v]').forEach(n => {
        const id = n.getAttribute('data-v'); if (!id) return;
        const tg = SUP.tag(id), inf = infoTag(id);
        n.textContent = tg && inf && inf.v != null ? `${formatarNumero(inf.v, tg.dec)}${tg.unidade ? ' ' + tg.unidade : ''}` : '—';
        const al = alarmeDaTag(id);
        const g = n.closest('.sin-tagval, .sin-valor, .sin-sensor');
        if (g) { g.classList.toggle('velho', !!inf && inf.q !== 'ok'); [1, 2, 3, 4].forEach(p => g.classList.toggle('al-p' + p, !!al && al.prioridade === p)); g.classList.toggle('al-piscar', !!al && !al.reconhecido); }
    });
    raiz.querySelectorAll('[data-barra]').forEach(n => {
        const id = n.getAttribute('data-barra'), tg = SUP.tag(id), v = valorTag(id);
        if (!tg || v == null) { n.setAttribute('width', 0); return; }
        const [a, b] = tg.faixa || [0, 100], fundo = n.previousElementSibling, W = +fundo.getAttribute('width');
        n.setAttribute('width', Math.max(0, Math.min(1, (v - a) / ((b - a) || 1))) * W);
    });
    raiz.querySelectorAll('[data-nivel]').forEach(n => {
        const id = n.getAttribute('data-nivel'), tg = SUP.tag(id), v = valorTag(id), g = n.closest('.sin-el');
        const el = pl.sinotico.elementos.find(e => e.id === g.dataset.id); if (!el || !tg) return;
        const h = el.h || SIMBOLOS[el.s].h, [a, b] = tg.faixa || [0, 100], f = v == null ? 0 : Math.max(0, Math.min(1, (v - a) / ((b - a) || 1)));
        n.setAttribute('y', h * (1 - f)); n.setAttribute('height', h * f);
    });
    raiz.querySelectorAll('.sin-el[data-eq]').forEach(g => {
        const e = RT.equip.get(g.dataset.eq), eq = SUP.equipamento(g.dataset.eq);
        const est = eq && eq.horimetro.ativo && e ? e.estado : 'sem';
        ['desligado', 'vazio', 'trabalhando', 'sem'].forEach(k => g.classList.toggle('est-' + k, est === k));
        let pior = null;
        if (eq) pl.tags.filter(t => t.equipId === eq.id).forEach(t => { const a = alarmeDaTag(t.id); if (a && (!pior || a.prioridade < pior.prioridade)) pior = a; });
        [1, 2, 3, 4].forEach(p => g.classList.toggle('al-p' + p, !!pior && pior.prioridade === p));
        g.classList.toggle('al-piscar', !!pior && !pior.reconhecido);
    });
    raiz.querySelectorAll('[data-cmd]').forEach(n => {
        const cm = pl.comandos.find(c => c.id === n.getAttribute('data-cmd')); if (!cm) return;
        const ligado = estadoComando(pl, cm);
        n.classList.toggle('ligado', ligado === 1); n.classList.toggle('desligado', ligado === 0);
        const t = raiz.querySelector(`[data-cmdtxt="${cm.id}"]`);
        if (t && cm.tipo === 'chave') t.textContent = `${cm.nome}: ${ligado === 1 ? 'LIGADO' : ligado === 0 ? 'DESLIGADO' : '?'}`;
        if (t && cm.tipo === 'setpoint') { const v = cm.tagEstado ? valorTag(cm.tagEstado) : cm.ultimo && cm.ultimo.valor; t.textContent = `${cm.nome}: ${v != null && v !== '' ? formatarNumero(+v, 1) : '—'} ${cm.unidade || ''}`; }
    });
}
/** Estado do comando: pela variável de estado (retorno do campo) ou pelo último comando enviado. */
function estadoComando(pl, cm) {
    if (cm.tagEstado) { const v = valorTag(cm.tagEstado); return v == null ? null : (v ? 1 : 0); }
    return cm.ultimo ? (cm.ultimo.valor ? 1 : 0) : null;
}

// ---------------------------------------------------------------- editor
const SinEd = { pl: null, editando: false, sel: null, desfazer: [], refazer: [], modoTubo: null, zoom: 1 };

function sinGuardarDesfazer() {
    SinEd.desfazer.push(JSON.stringify(SinEd.pl.sinotico.elementos));
    if (SinEd.desfazer.length > 60) SinEd.desfazer.shift();
    SinEd.refazer = [];
}
function sinDesfazer() {
    const pl = SinEd.pl; if (!SinEd.desfazer.length) return;
    SinEd.refazer.push(JSON.stringify(pl.sinotico.elementos));
    pl.sinotico.elementos = JSON.parse(SinEd.desfazer.pop());
    SinEd.sel = null; SUP.alterado('sinotico'); sinRedesenhar();
}
function sinRefazer() {
    const pl = SinEd.pl; if (!SinEd.refazer.length) return;
    SinEd.desfazer.push(JSON.stringify(pl.sinotico.elementos));
    pl.sinotico.elementos = JSON.parse(SinEd.refazer.pop());
    SinEd.sel = null; SUP.alterado('sinotico'); sinRedesenhar();
}

function sinRedesenhar() {
    const alvo = document.getElementById('sin-palco');
    if (!alvo) return;
    const pl = SinEd.pl;
    alvo.innerHTML = svgSinotico(pl, SinEd.editando);
    const svg = alvo.querySelector('svg');
    svg.style.width = (pl.sinotico.largura * SinEd.zoom) + 'px';
    if (SinEd.sel) { const g = svg.querySelector(`.sin-el[data-id="${SinEd.sel}"]`); if (g) g.classList.add('selecionado'); }
    atualizarSinotico(alvo, pl);
    sinEventos(svg);
    const props = document.getElementById('sin-props');
    if (props) props.innerHTML = SinEd.editando ? htmlPropriedades(pl) : '';
}

function pontoSvg(svg, e) {
    const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
    const q = p.matrixTransform(svg.getScreenCTM().inverse());
    return { x: q.x, y: q.y };
}
const naGrade = (v, g) => Math.round(v / g) * g;

function sinEventos(svg) {
    const pl = SinEd.pl, g = pl.sinotico.grade || 10;
    let arr = null;
    svg.addEventListener('pointerdown', e => {
        const alvo = e.target.closest('.sin-el');
        const p = pontoSvg(svg, e);
        if (!SinEd.editando) {
            if (alvo && (alvo.classList.contains('sin-chave') || alvo.classList.contains('sin-setpoint'))) { const el = pl.sinotico.elementos.find(x => x.id === alvo.dataset.id); if (el && el.cmd) acionarComandoTela(pl, el.cmd); return; }
            // arrastar o fundo rola a área
            const palco = svg.parentElement; arr = { tipo: 'rolar', cx: e.clientX, cy: e.clientY, sl: palco.scrollLeft, st: palco.scrollTop };
            svg.setPointerCapture(e.pointerId); return;
        }
        if (SinEd.modoTubo) {
            const pts = SinEd.modoTubo.pts;
            pts.push([naGrade(p.x, g), naGrade(p.y, g)]);
            if (pts.length === 1) pts.push([naGrade(p.x, g), naGrade(p.y, g)]);
            sinDesenharTuboTemp(svg); return;
        }
        if (!alvo) { SinEd.sel = null; sinRedesenhar(); return; }
        const el = pl.sinotico.elementos.find(x => x.id === alvo.dataset.id);
        if (!el) return;
        if (SinEd.sel !== el.id) { SinEd.sel = el.id; sinRedesenhar(); }
        const svg2 = document.querySelector('#sin-palco svg');
        sinGuardarDesfazer();
        const ponto = e.target.dataset && e.target.dataset.ponto;
        arr = { el, p, x: el.x, y: el.y, w: el.w || SIMBOLOS[el.s].w, h: el.h || SIMBOLOS[el.s].h, alca: !!(e.target.dataset && e.target.dataset.alca), ponto: ponto != null ? +ponto : null, pts: el.pts ? clonar(el.pts) : null, svg: svg2, moveu: false };
        svg2.setPointerCapture(e.pointerId);
        svg2.addEventListener('pointermove', mover); svg2.addEventListener('pointerup', soltar, { once: true });
    });
    const mover = e => {
        if (!arr || !arr.el) return;
        const p = pontoSvg(arr.svg, e), dx = p.x - arr.p.x, dy = p.y - arr.p.y;
        const el = arr.el;
        if (Math.abs(dx) + Math.abs(dy) > 2) arr.moveu = true;
        if (el.s === 'tubo') {
            if (arr.ponto != null) el.pts[arr.ponto] = [naGrade(arr.pts[arr.ponto][0] + dx, g), naGrade(arr.pts[arr.ponto][1] + dy, g)];
            else el.pts = arr.pts.map(q => [naGrade(q[0] + dx, g), naGrade(q[1] + dy, g)]);
        } else if (arr.alca) { el.w = Math.max(20, naGrade(arr.w + dx, g)); el.h = Math.max(16, naGrade(arr.h + dy, g)); }
        else { el.x = naGrade(arr.x + dx, g); el.y = naGrade(arr.y + dy, g); }
        const gEl = arr.svg.querySelector(`.sin-el[data-id="${el.id}"]`);
        if (gEl) { gEl.outerHTML = svgElemento(pl, el, true); const n = arr.svg.querySelector(`.sin-el[data-id="${el.id}"]`); n.classList.add('selecionado'); atualizarSinotico(arr.svg, pl); }
    };
    const soltar = () => {
        if (arr && arr.svg) arr.svg.removeEventListener('pointermove', mover);
        if (arr && !arr.moveu) SinEd.desfazer.pop();
        else SUP.alterado('sinotico');
        arr = null; sinRedesenhar();
    };
    svg.addEventListener('pointermove', e => {
        if (arr && arr.tipo === 'rolar') { const palco = svg.parentElement; palco.scrollLeft = arr.sl - (e.clientX - arr.cx); palco.scrollTop = arr.st - (e.clientY - arr.cy); return; }
        if (SinEd.modoTubo && SinEd.modoTubo.pts.length) {
            const p = pontoSvg(svg, e), pts = SinEd.modoTubo.pts, ant = pts[pts.length - 2];
            let x = naGrade(p.x, g), y = naGrade(p.y, g);
            if (ant && !e.shiftKey) { if (Math.abs(x - ant[0]) > Math.abs(y - ant[1])) y = ant[1]; else x = ant[0]; }   // ortogonal (Shift livre)
            pts[pts.length - 1] = [x, y]; sinDesenharTuboTemp(svg);
        }
    });
    svg.addEventListener('pointerup', () => { if (arr && arr.tipo === 'rolar') arr = null; });
    svg.addEventListener('dblclick', () => { if (SinEd.modoTubo) sinTerminarTubo(); });
    // balão com o histórico ao passar o mouse nos valores
    svg.addEventListener('pointerover', e => {
        const n = e.target.closest('[data-tag], .sin-valor, .sin-sensor');
        if (!n || SinEd.editando) return;
        let id = n.dataset.tag;
        if (!id) { const el = pl.sinotico.elementos.find(x => x.id === n.dataset.id); id = el && el.tag; }
        if (id) mostrarBalaoTag(id, n.getBoundingClientRect());
    });
    svg.addEventListener('pointerout', e => { if (e.target.closest('[data-tag], .sin-valor, .sin-sensor')) esconderBalaoTag(); });
}
function sinDesenharTuboTemp(svg) {
    let t = svg.querySelector('.tubo-temp');
    if (!t) { t = document.createElementNS('http://www.w3.org/2000/svg', 'path'); t.setAttribute('class', 'tubo-temp'); svg.appendChild(t); }
    const pts = SinEd.modoTubo.pts;
    t.setAttribute('d', 'M' + pts.map(p => p.join(' ')).join(' L'));
}
function sinTerminarTubo() {
    const m = SinEd.modoTubo; SinEd.modoTubo = null;
    document.body.classList.remove('sin-desenhando');
    if (m && m.pts.length >= 3) {
        m.pts.pop();
        const pts = m.pts.filter((p, i) => i === 0 || p[0] !== m.pts[i - 1][0] || p[1] !== m.pts[i - 1][1]);
        if (pts.length >= 2) { sinGuardarDesfazer(); const el = { id: uid('el'), s: 'tubo', pts, eq: '' }; SinEd.pl.sinotico.elementos.push(el); SinEd.sel = el.id; SUP.alterado('sinotico'); }
    }
    sinRedesenhar(); atualizarBarraSinotico();
}

function sinAdicionar(s) {
    const pl = SinEd.pl, S = SIMBOLOS[s];
    if (s === 'tubo') { SinEd.modoTubo = { pts: [] }; document.body.classList.add('sin-desenhando'); avisar('Clique para marcar os pontos do tubo; duplo clique (ou "Terminar tubo") para encerrar. Shift deixa a linha inclinada.', 'ok', 6000); atualizarBarraSinotico(); return; }
    sinGuardarDesfazer();
    const palco = document.getElementById('sin-palco');
    const cx = (palco.scrollLeft + palco.clientWidth / 2) / SinEd.zoom, cy = (palco.scrollTop + palco.clientHeight / 2) / SinEd.zoom;
    const g = pl.sinotico.grade || 10;
    const el = { id: uid('el'), s, x: naGrade(Math.max(10, cx - S.w / 2), g), y: naGrade(Math.max(20, cy - S.h / 2), g), w: S.w, h: S.h, rot: 0, rotulo: S.equip ? S.nome.split(' (')[0].split(' /')[0] : s === 'texto' ? 'Texto' : s === 'area' ? 'Área' : '', tags: [] };
    // símbolo de equipamento cria o equipamento junto (pré-preenchido; a pessoa só renomeia)
    if (S.equip) {
        const n = pl.equipamentos.filter(e => e.simbolo === s).length + 1;
        el.rotulo = `${el.rotulo} ${n}`;
        const eq = criarEquipamento(el.rotulo, pl.areas[0] ? pl.areas[0].id : '', s);
        pl.equipamentos.push(eq); el.eq = eq.id;
    }
    if (S.comando) { const c = pl.comandos.find(c => c.tipo === (s === 'chave' ? 'chave' : 'setpoint')); el.cmd = c ? c.id : ''; }
    pl.sinotico.elementos.push(el); SinEd.sel = el.id;
    SUP.alterado('sinotico'); sinRedesenhar();
}
function sinAcao(acao) {
    const pl = SinEd.pl, el = pl.sinotico.elementos.find(x => x.id === SinEd.sel);
    if (acao === 'desfazer') return sinDesfazer();
    if (acao === 'refazer') return sinRefazer();
    if (acao === 'terminar-tubo') return sinTerminarTubo();
    if (acao === 'zoom+') { SinEd.zoom = Math.min(3, SinEd.zoom * 1.25); return sinRedesenhar(); }
    if (acao === 'zoom-') { SinEd.zoom = Math.max(0.25, SinEd.zoom / 1.25); return sinRedesenhar(); }
    if (acao === 'zoom-ajustar') { const palco = document.getElementById('sin-palco'); SinEd.zoom = Math.max(0.25, Math.min(2, (palco.clientWidth - 4) / pl.sinotico.largura)); return sinRedesenhar(); }
    if (!el) return;
    sinGuardarDesfazer();
    if (acao === 'excluir') { pl.sinotico.elementos = pl.sinotico.elementos.filter(x => x !== el); SinEd.sel = null; }
    if (acao === 'duplicar') { const c = clonar(el); c.id = uid('el'); if (c.pts) c.pts = c.pts.map(p => [p[0] + 20, p[1] + 20]); else { c.x += 20; c.y += 20; } pl.sinotico.elementos.push(c); SinEd.sel = c.id; }
    if (acao === 'girar' && el.s !== 'tubo') el.rot = ((el.rot || 0) + 90) % 360;
    if (acao === 'frente') { pl.sinotico.elementos = pl.sinotico.elementos.filter(x => x !== el).concat([el]); }
    SUP.alterado('sinotico'); sinRedesenhar();
}

function htmlPropriedades(pl) {
    const el = pl.sinotico.elementos.find(x => x.id === SinEd.sel);
    if (!el) return `<p class="nota">Clique num símbolo para ver e mudar as propriedades. Arraste para mover; a alça do canto muda o tamanho.</p>
        <label>Largura do desenho <input type="number" min="400" step="50" value="${pl.sinotico.largura}" data-sinp="largura"></label>
        <label>Altura do desenho <input type="number" min="300" step="50" value="${pl.sinotico.altura}" data-sinp="altura"></label>`;
    const S = SIMBOLOS[el.s];
    const optsTag = (sel, filtro = () => true) => `<option value="">—</option>` + pl.tags.filter(filtro).map(t => `<option value="${t.id}"${t.id === sel ? ' selected' : ''}>${esc(t.nome)}${t.unidade ? ' (' + esc(t.unidade) + ')' : ''}</option>`).join('');
    const doEquip = el.eq ? pl.tags.filter(t => t.equipId === el.eq) : [];
    let h = `<h3>${esc(S.nome)}</h3>`;
    if (el.s !== 'tubo') h += `<label>Rótulo <input type="text" value="${escAttr(el.rotulo || '')}" data-sinp="rotulo"></label>`;
    if (S.equip || el.s === 'tubo') {
        h += `<label>Equipamento ${el.s === 'tubo' ? '<small>(o fluxo anima quando ele está trabalhando)</small>' : '<small>(estado e alarmes)</small>'}
            <select data-sinp="eq"><option value="">—</option>${pl.equipamentos.map(e => `<option value="${e.id}"${e.id === el.eq ? ' selected' : ''}>${esc(e.nome)}</option>`).join('')}</select></label>`;
    }
    if (S.equip) {
        h += `<fieldset class="sin-tags"><legend>Valores mostrados embaixo</legend>
            ${(doEquip.length ? doEquip : pl.tags).slice(0, 40).map(t => `<label class="check"><input type="checkbox" data-sintag="${t.id}"${lista(el.tags).includes(t.id) ? ' checked' : ''}> ${esc(t.nome)}</label>`).join('')}
            ${doEquip.length && pl.tags.length > doEquip.length ? '<small>Mostrando as variáveis deste equipamento.</small>' : ''}</fieldset>`;
        if (['silo', 'silo_pulmao', 'tanque', 'armazem'].includes(el.s)) h += `<label>Nível (preenchimento) <select data-sinp="tagNivel">${optsTag(el.tagNivel)}</select></label>`;
    }
    if (S.valor) h += `<label>Variável <select data-sinp="tag">${optsTag(el.tag)}</select></label>`;
    if (S.comando) h += `<label>Comando <select data-sinp="cmd"><option value="">—</option>${pl.comandos.map(c => `<option value="${c.id}"${c.id === el.cmd ? ' selected' : ''}>${esc(c.nome)} (${c.tipo})</option>`).join('')}</select></label>
        ${pl.comandos.length ? '' : '<p class="aviso-inline">Crie o comando em Controle → Comandos.</p>'}`;
    if (el.s !== 'tubo') h += `<div class="grade-mini"><label>Largura <input type="number" value="${el.w || S.w}" data-sinp="w"></label><label>Altura <input type="number" value="${el.h || S.h}" data-sinp="h"></label></div>`;
    h += `<div class="botoes"><button type="button" class="btn btn-secondary btn-sm" data-sin="girar"${el.s === 'tubo' ? ' disabled' : ''}>↻ Girar</button><button type="button" class="btn btn-secondary btn-sm" data-sin="duplicar">⧉ Duplicar</button><button type="button" class="btn btn-secondary btn-sm" data-sin="frente">⬆ Frente</button><button type="button" class="btn btn-danger btn-sm" data-sin="excluir">Excluir</button></div>`;
    return h;
}
function sinMudarPropriedade(campo, valor) {
    const pl = SinEd.pl;
    if (campo === 'largura' || campo === 'altura') { pl.sinotico[campo] = Math.max(300, num(valor, 800)); SUP.alterado('sinotico'); sinRedesenhar(); return; }
    const el = pl.sinotico.elementos.find(x => x.id === SinEd.sel); if (!el) return;
    sinGuardarDesfazer();
    if (campo === 'w' || campo === 'h') el[campo] = Math.max(10, num(valor, 50));
    else el[campo] = valor;
    if (campo === 'eq' && valor && SIMBOLOS[el.s].equip && !lista(el.tags).length) el.tags = pl.tags.filter(t => t.equipId === valor).slice(0, 3).map(t => t.id);
    SUP.alterado('sinotico'); sinRedesenhar();
}
function sinMarcarTag(id, marcado) {
    const el = SinEd.pl.sinotico.elementos.find(x => x.id === SinEd.sel); if (!el) return;
    sinGuardarDesfazer();
    el.tags = lista(el.tags).filter(x => x !== id); if (marcado) el.tags.push(id);
    SUP.alterado('sinotico'); sinRedesenhar();
}
function atualizarBarraSinotico() {
    const b = document.querySelector('[data-sin="terminar-tubo"]');
    if (b) b.hidden = !SinEd.modoTubo;
}
document.addEventListener('keydown', e => {
    if (!SinEd.editando || !document.getElementById('sin-palco') || /input|textarea|select/i.test(e.target.tagName)) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { sinAcao('excluir'); e.preventDefault(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { sinAcao(e.shiftKey ? 'refazer' : 'desfazer'); e.preventDefault(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { sinAcao('duplicar'); e.preventDefault(); }
    else if (e.key === 'Escape' && SinEd.modoTubo) sinTerminarTubo();
    else if (e.key === 'Enter' && SinEd.modoTubo) sinTerminarTubo();
    else if (e.key.startsWith('Arrow') && SinEd.sel) {
        const el = SinEd.pl.sinotico.elementos.find(x => x.id === SinEd.sel); if (!el || el.s === 'tubo') return;
        const d = e.shiftKey ? 1 : SinEd.pl.sinotico.grade;
        sinGuardarDesfazer();
        if (e.key === 'ArrowLeft') el.x -= d; if (e.key === 'ArrowRight') el.x += d; if (e.key === 'ArrowUp') el.y -= d; if (e.key === 'ArrowDown') el.y += d;
        SUP.alterado('sinotico'); sinRedesenhar(); e.preventDefault();
    }
});
