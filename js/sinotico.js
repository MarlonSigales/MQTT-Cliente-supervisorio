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
    if (S.instrumento) return `<svg viewBox="-2 -2 ${S.w + 4} ${S.h + 4}" class="sin-mini">${svgInstrumento(S.w, S.h, S.instrumento, 'TT', '101')}</svg>`;
    if (S.sensor && !S.svg) return `<svg viewBox="-2 -2 ${S.w + 4} ${S.h + 4}" class="sin-mini"><circle class="bolha" cx="${S.w / 2}" cy="${S.h / 2}" r="${S.w / 2 - 2}"/><text class="sensor-sigla" x="${S.w / 2}" y="${S.h / 2 + 4}" text-anchor="middle">${S.sigla || 'XT'}</text></svg>`;
    if (!S.svg) return `<svg viewBox="0 0 60 40" class="sin-mini"><rect class="corpo" x="6" y="10" width="48" height="20" rx="4"/><text x="30" y="24" text-anchor="middle" font-size="10">${s === 'texto' ? 'Abc' : s === 'area' ? '▭' : s === 'chave' ? 'I/O' : s === 'setpoint' ? 'SP' : '12,3'}</text></svg>`;
    return `<svg viewBox="-4 -4 ${S.w + 8} ${S.h + 8}" class="sin-mini sin-simbolo est-desligado">${S.svg(S.w, S.h, {})}</svg>`;
}

// ---------------------------------------------------------------- desenho de um elemento
function svgElemento(pl, el, editando) {
    const S = SIMBOLOS[el.s];
    if (!S) return '';
    if (el.s === 'tubo') {
        const pts = lista(el.pts);
        if (pts.length < 2) return '';
        const d = 'M' + pts.map(p => `${p[0]} ${p[1]}`).join(' L');
        const estilo = ESTILOS_TUBO[el.estilo] ? el.estilo : 'material';
        return `<g class="sin-el sin-tubo tubo-${estilo}${el.eq ? '' : ' sem-eq'}" data-id="${el.id}" ${el.eq ? `data-eq="${el.eq}"` : ''}>
            <path class="tubo-fundo" d="${d}"/><path class="tubo-linha" d="${d}"${el.seta ? ' marker-end="url(#sin-seta)"' : ''}/><path class="tubo-fluxo" d="${d}"/>${marcasTubo(pts, estilo)}
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
    } else if (S.instrumento) {
        corpo = svgInstrumento(w, h, S.instrumento, el.codigo, el.numero) + (el.tag ? `<text class="sensor-valor" x="${w / 2}" y="${h + 14}" text-anchor="middle" data-v="${el.tag}">—</text>` : '');
    } else if (S.sensor) {
        const tg = SUP.tag(el.tag);
        const forma = S.svg ? S.svg(w, h, el) : `<circle class="bolha" cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 2 - 2}"/><text class="sensor-sigla" x="${w / 2}" y="${h / 2 + 4}" text-anchor="middle">${esc(S.sigla || siglaTipo(tg && tg.tipo))}</text>`;
        corpo = forma + `<text class="sensor-valor" x="${w / 2}" y="${h + 14}" text-anchor="middle" data-v="${el.tag || ''}">—</text>${rot ? `<text class="sin-rotulo pequeno" x="${w / 2}" y="-5" text-anchor="middle">${esc(rot)}</text>` : ''}`;
    } else if ((S.comando || S.entrada) && S.svg) {
        corpo = `<g class="sin-simbolo"${el.cmd ? ` data-cmd="${el.cmd}"` : ''}${el.tag ? ` data-entrada="${el.tag}"` : ''}>${S.svg(w, h, el)}</g><text class="sin-rotulo pequeno" x="${w / 2}" y="${h + 13}" text-anchor="middle">${esc(rot)}</text>`;
    } else if (el.s === 'chave' || el.s === 'setpoint') {
        const cm = pl.comandos.find(c => c.id === el.cmd);
        corpo = `<rect class="cmd-caixa" x="0" y="0" width="${w}" height="${h}" rx="${h / 2}" data-cmd="${el.cmd || ''}"/>
            <text class="cmd-texto" x="${w / 2}" y="${h / 2 + 4}" text-anchor="middle" data-cmdtxt="${el.cmd || ''}">${esc(rot || (cm ? cm.nome : 'escolha o comando'))}</text>`;
    } else {
        const desenho = S.svg ? S.svg(w, h, el) : '';
        corpo = `<g class="sin-simbolo">${desenho}</g>`;
        // nível (preenchimento) no silo/tanque/tulha
        const forma = desenho.match(/<path class="corpo"[^>]*>|<rect class="corpo"[^>]*>/);
        if (el.tagNivel) corpo = `<clipPath id="clip-${el.id}"><g>${forma ? forma[0] : ''}</g></clipPath>
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
    let n = tg.nome.replace(/\s+—\s+.*$/, '');      // "Corrente — Elevador 1" → "Corrente"
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
        <defs><marker id="sin-seta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="14" markerHeight="14" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z" class="seta-ponta"/></marker></defs>
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
    raiz.querySelectorAll('[data-entrada]').forEach(n => {
        const v = valorTag(n.getAttribute('data-entrada'));
        n.classList.toggle('aceso', !!v); const al = alarmeDaTag(n.getAttribute('data-entrada'));
        const g = n.closest('.sin-el'); if (g) { [1, 2, 3, 4].forEach(p => g.classList.toggle('al-p' + p, !!al && al.prioridade === p)); g.classList.toggle('al-piscar', !!al && !al.reconhecido); }
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
            const elc = alvo && pl.sinotico.elementos.find(x => x.id === alvo.dataset.id);
            if (elc && elc.cmd && SIMBOLOS[elc.s] && SIMBOLOS[elc.s].comando) { acionarComandoTela(pl, elc.cmd); return; }
            if (elc && elc.eq && !e.target.closest('[data-tag]')) { abrirFaceplate(pl, elc.eq); return; }
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
        if (pts.length >= 2) { sinGuardarDesfazer(); const el = { id: uid('el'), s: 'tubo', pts, eq: '', estilo: m.estilo || 'material', seta: ['processo', 'material'].includes(m.estilo) }; SinEd.pl.sinotico.elementos.push(el); SinEd.sel = el.id; SUP.alterado('sinotico'); }
    }
    sinRedesenhar(); atualizarBarraSinotico();
}

function sinAdicionar(s) {
    const pl = SinEd.pl, S = SIMBOLOS[s];
    if (s === 'tubo') { SinEd.modoTubo = { pts: [], estilo: SinEd.estiloTubo || 'material' }; document.body.classList.add('sin-desenhando'); avisar('Tubulação (L): clique para marcar os pontos; duplo clique, Enter ou L de novo para encerrar. Shift deixa a linha inclinada.', 'ok', 6000); atualizarBarraSinotico(); return; }
    sinGuardarDesfazer();
    const palco = document.getElementById('sin-palco');
    const cx = (palco.scrollLeft + palco.clientWidth / 2) / SinEd.zoom, cy = (palco.scrollTop + palco.clientHeight / 2) / SinEd.zoom;
    const g = pl.sinotico.grade || 10;
    const el = { id: uid('el'), s, x: naGrade(Math.max(10, cx - S.w / 2), g), y: naGrade(Math.max(20, cy - S.h / 2), g), w: S.w, h: S.h, rot: 0, rotulo: S.equip ? nomeCurtoSimbolo(S) : s === 'texto' ? 'Texto' : s === 'area' ? 'Área' : '', tags: [] };
    if (S.n) el.n = S.n;
    if (S.instrumento) { el.codigo = 'TT'; el.numero = String(100 + pl.sinotico.elementos.filter(x => SIMBOLOS[x.s] && SIMBOLOS[x.s].instrumento).length + 1); }
    // símbolo de equipamento, sensor ou botão já cria equipamento, variáveis e comandos com tópico base e unidade
    const criados = aplicarKitSimbolo(pl, el, S);
    pl.sinotico.elementos.push(el); SinEd.sel = el.id;
    SUP.alterado('sinotico'); sinRedesenhar();
    if (criados) avisar(`${criados} já com tópico pré-preenchido. Clique no símbolo para editar os tópicos.`, 'ok', 5000);
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
    if (S.valor || S.sensor || S.instrumento || S.entrada) h += `<label>Variável <select data-sinp="tag">${optsTag(el.tag)}</select></label>`;
    if (S.instrumento) h += `<div class="grade-mini"><label>Letras (ISA 5.1) <input type="text" value="${escAttr(el.codigo || '')}" data-sinp="codigo" maxlength="5" spellcheck="false"></label><label>Número <input type="text" value="${escAttr(el.numero || '')}" data-sinp="numero" maxlength="8"></label></div>
        <small>1ª letra: T temperatura, P pressão, F vazão, L nível, W peso, M umidade, A análise, S velocidade, V vibração, J potência, E tensão, I corrente, Z posição. Seguintes: T transmissor, I indicador, C controlador, S chave, A alarme, V válvula.</small>`;
    if (S.n && !(S.kit && S.kit.fixoN)) h += `<label>Número de saídas <input type="number" min="2" max="16" value="${nSaidas(el, S)}" data-sinp="n"></label>`;
    if (el.s === 'tubo') h += `<label>Tipo de linha <select data-sinp="estilo">${Object.entries(ESTILOS_TUBO).map(([k, n]) => `<option value="${k}"${(el.estilo || 'material') === k ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
        <label class="check"><input type="checkbox" data-sinp="seta"${el.seta ? ' checked' : ''}> Seta no fim (sentido do fluxo)</label>`;
    h += htmlTopicosElemento(pl, el, S);
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
    else if (campo === 'n') { el.n = Math.max(2, Math.min(16, num(valor, 2) | 0)); ajustarSaidasComando(pl, el); }
    else if (campo === 'seta') el.seta = !!valor;
    else if (campo === 'rotulo') { const antigo = el.rotulo; el.rotulo = valor; renomearPeloRotulo(pl, el, antigo, valor); }
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
    else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'l') { if (SinEd.modoTubo) sinTerminarTubo(); else sinAdicionar('tubo'); e.preventDefault(); }
    else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'r' && SinEd.sel) { sinAcao('girar'); e.preventDefault(); }
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

// ---------------------------------------------------------------- tubulações: tipos de linha (P&ID, ISA 5.1)
const ESTILOS_TUBO = {
    material: 'Material (grão) — tubo de queda / transporte',
    ar: 'Ar — duto',
    processo: 'P&ID — linha de processo',
    pneumatico: 'P&ID — sinal pneumático (//)',
    eletrico: 'P&ID — sinal elétrico (tracejado)',
    dados: 'P&ID — ligação de dados / software (o-o)',
    capilar: 'P&ID — tubo capilar (×)',
    hidraulico: 'P&ID — sinal hidráulico (L)'
};
/** Marcas ao longo da linha (barras do pneumático, × do capilar, círculos de dados, L do hidráulico). */
function marcasTubo(pts, estilo) {
    if (!['pneumatico', 'capilar', 'dados', 'hidraulico'].includes(estilo)) return '';
    let d = '', circ = '';
    for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
        const L = Math.hypot(x1 - x0, y1 - y0); if (L < 20) continue;
        const ux = (x1 - x0) / L, uy = (y1 - y0) / L, nx = -uy, ny = ux;
        for (let s = 18; s < L - 8; s += 36) {
            const cx = x0 + ux * s, cy = y0 + uy * s;
            if (estilo === 'pneumatico') [-3, 3].forEach(o => { const bx = cx + ux * o, by = cy + uy * o; d += `M${(bx - nx * 6 - ux * 3).toFixed(1)} ${(by - ny * 6 - uy * 3).toFixed(1)} L${(bx + nx * 6 + ux * 3).toFixed(1)} ${(by + ny * 6 + uy * 3).toFixed(1)} `; });
            if (estilo === 'capilar') d += `M${(cx - 5).toFixed(1)} ${(cy - 5).toFixed(1)} L${(cx + 5).toFixed(1)} ${(cy + 5).toFixed(1)} M${(cx + 5).toFixed(1)} ${(cy - 5).toFixed(1)} L${(cx - 5).toFixed(1)} ${(cy + 5).toFixed(1)} `;
            if (estilo === 'hidraulico') d += `M${(cx - nx * 6).toFixed(1)} ${(cy - ny * 6).toFixed(1)} L${(cx + nx * 6).toFixed(1)} ${(cy + ny * 6).toFixed(1)} L${(cx + nx * 6 + ux * 6).toFixed(1)} ${(cy + ny * 6 + uy * 6).toFixed(1)} `;
            if (estilo === 'dados') circ += `<circle class="tubo-marca-c" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="3"/>`;
        }
    }
    return (d ? `<path class="tubo-marca" d="${d}"/>` : '') + circ;
}

// ---------------------------------------------------------------- kits: variáveis e comandos pré-preenchidos ao inserir
function nomeCurtoSimbolo(S) { return S.nome.split(' (')[0].split(' / ')[0]; }
/** Tópico base de um equipamento: "Elevador de canecas 2" → elevador_canecas_2 (o prefixo da planta entra na frente). */
function baseTopico(nome) { return String(nome || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'equipamento'; }

/**
 * Cria o que o símbolo precisa (equipamento, variáveis com tópico base e unidade, comandos, horímetro, potência) e liga
 * ao elemento. Devolve um texto curto do que foi criado (ou '' se nada).
 */
function aplicarKitSimbolo(pl, el, S) {
    const novasTags = [], novosCmds = [];
    const contar = filtro => pl.sinotico.elementos.filter(x => SIMBOLOS[x.s] && filtro(SIMBOLOS[x.s], x)).length + 1;
    // sensores avulsos: uma variável do tipo do sensor
    if (S.sensor && !S.equip) {
        const T = TIPOS_VAR[S.sensor] || TIPOS_VAR.generico;
        const nome = `${S.nomeTag || T.nome} ${contar(Z => Z.sensor === S.sensor && (Z.nomeTag || '') === (S.nomeTag || ''))}`;
        const t = criarTag({ nome, tipo: S.sensor, topico: `sensores/${baseTopico(nome)}`, unidade: S.un != null ? S.un : T.un, areaId: pl.areas[0] ? pl.areas[0].id : '' });
        t.topicoAuto = true; t.kitS = 'sensor';
        if (S.lim) t.limites = Object.assign(t.limites, { ativo: true }, S.lim);
        pl.tags.push(t); novasTags.push(t); el.tag = t.id;
    }
    // entradas (emergência, sinaleiro)
    if (S.entrada) {
        const nome = `${S.entrada.nome} ${contar(Z => Z.entrada && Z.entrada.nome === S.entrada.nome)}`;
        const t = criarTag({ nome, tipo: S.entrada.tipo, topico: `entradas/${baseTopico(nome)}` });
        t.topicoAuto = true; t.kitS = 'entrada'; t.limites.semDadosS = 0;
        if (S.entrada.lim) t.limites = Object.assign(t.limites, { ativo: true }, S.entrada.lim);
        pl.tags.push(t); novasTags.push(t); el.tag = t.id; el.rotulo = nome;
    }
    // comandos avulsos (chave, setpoint, botoeira, botão, seletor)
    if (S.comando && !S.equip) {
        const tipo = S.comando === 'setpoint' ? 'setpoint' : S.comando === 'botao' ? 'botao' : 'chave';
        const base = S.nomeCmd || (tipo === 'setpoint' ? 'Setpoint' : tipo === 'botao' ? 'Botão' : 'Comando');
        const nome = `${base} ${contar(Z => Z.comando === S.comando && (Z.nomeCmd || '') === (S.nomeCmd || ''))}`;
        const c = criarComando({ nome, tipo, topico: `comandos/${baseTopico(nome)}`, payloadLiga: S.payloads ? S.payloads[0] : '1', payloadDesliga: S.payloads ? S.payloads[1] : '0', retain: tipo !== 'botao', confirmar: true });
        c.topicoAuto = true; c.kitS = 'comando';
        pl.comandos.push(c); novosCmds.push(c); el.cmd = c.id; el.rotulo = nome;
    }
    // equipamento com kit
    if (S.equip) {
        const n = pl.equipamentos.filter(e => e.simbolo === el.s).length + 1;
        el.rotulo = `${el.rotulo || nomeCurtoSimbolo(S)} ${n}`;
        const eq = criarEquipamento(el.rotulo, pl.areas[0] ? pl.areas[0].id : '', el.s);
        pl.equipamentos.push(eq); el.eq = eq.id;
        const kit = S.kit || (S.sensor ? { tags: [{ s: 'valor', tipo: S.sensor, nome: S.nomeTag || TIPOS_VAR[S.sensor].nome }], mostrar: ['valor'] } : null);
        if (kit) {
            const base = baseTopico(eq.nome), porS = {};
            (kit.tags || []).forEach(k => {
                const T = TIPOS_VAR[k.tipo] || TIPOS_VAR.generico;
                const t = criarTag({ nome: `${k.nome} — ${eq.nome}`, tipo: k.tipo, topico: `${base}/${k.s}`, unidade: k.un != null ? k.un : T.un, dec: k.dec, faixa: k.faixa, equipId: eq.id, areaId: eq.areaId });
                t.topicoAuto = true; t.kitS = k.s;
                if (k.lim) t.limites = Object.assign(t.limites, { ativo: true }, k.lim);
                if (k.tipo === 'estado') t.limites.semDadosS = 0;
                pl.tags.push(t); novasTags.push(t); porS[k.s] = t;
            });
            garantirVariaveis(pl);
            if (kit.motor) {
                const [iV, iC] = kit.motor, I = porS.corrente;
                if (I) {
                    I.faixa = [0, Math.ceil(iC * 1.6)];
                    I.limites = Object.assign(I.limites, { ativo: true, h: +(iC * 1.15).toFixed(1), hh: +(iC * 1.3).toFixed(1), atrasoS: 10, histerese: +(iC * 0.03).toFixed(2) });
                    const V = pl.tags.find(x => x.tipo === 'tensao' && x.origem === 'mqtt'), F = pl.tags.find(x => x.tipo === 'fp' && x.origem === 'mqtt');
                    const P = criarTag({ nome: `Potência — ${eq.nome}`, tipo: 'potencia', origem: 'calc', expr: `pot_tri(${V ? V.variavel : 380}, ${I.variavel}, ${F ? F.variavel : 0.85})`, equipId: eq.id, areaId: eq.areaId, faixa: [0, Math.ceil(iC * 0.9)] });
                    P.kitS = 'potencia'; pl.tags.push(P); novasTags.push(P); porS.potencia = P;
                    Object.assign(eq.horimetro, { ativo: true, fonte: 'tag', tagId: I.id, limLigado: +(iV * 0.5).toFixed(2), limTrabalho: +((iV + iC) / 2).toFixed(2) });
                    eq.tagPotencia = P.id;
                }
            }
            (kit.calc || []).forEach(k => {
                const expr = k.expr.replace(/\{(\w+)\}/g, (m, s) => (porS[s] ? porS[s].variavel : s));
                const t = criarTag({ nome: `${k.nome} — ${eq.nome}`, tipo: k.tipo, origem: 'calc', expr, equipId: eq.id, areaId: eq.areaId });
                t.kitS = k.s; pl.tags.push(t); novasTags.push(t); porS[k.s] = t;
            });
            (kit.cmds || []).forEach(k => {
                const estado = porS.estado || porS.aberta;
                const c = criarComando({ nome: `${k.nome} — ${eq.nome}`, tipo: k.tipo, topico: `${base}/${k.s}`, equipId: eq.id, payloadLiga: k.payloadLiga || '1', payloadDesliga: k.payloadDesliga || '0',
                    tagEstado: k.tipo === 'chave' && estado ? estado.id : k.tipo === 'setpoint' ? '' : '', min: k.min != null ? k.min : 0, max: k.s === 'sp_saida' ? nSaidas(el, S) : (k.max != null ? k.max : 100),
                    passo: k.passo || 1, unidade: k.unidade || '', retain: k.tipo !== 'botao', confirmar: true });
                c.topicoAuto = true; c.kitS = k.s; pl.comandos.push(c); novosCmds.push(c);
            });
            if (kit.ajustarN && porS.saida) porS.saida.faixa = [1, nSaidas(el, S)];
            el.tags = (kit.mostrar || []).map(s => porS[s] && porS[s].id).filter(Boolean);
            if (kit.motor && porS.potencia && el.tags.length < 2) el.tags.push(porS.potencia.id);
            if (kit.nivel && porS[kit.nivel]) el.tagNivel = porS[kit.nivel].id;
        }
    }
    garantirVariaveis(pl);
    const partes = [];
    if (novasTags.length) partes.push(`${novasTags.length} variável(is)`);
    if (novosCmds.length) partes.push(`${novosCmds.length} comando(s)`);
    return partes.length ? partes.join(' e ') + ' criado(s)' : '';
}
/** Ao mudar o número de saídas, a faixa do setpoint "Escolher saída" acompanha. */
function ajustarSaidasComando(pl, el) {
    if (!el.eq) return;
    pl.comandos.filter(c => c.equipId === el.eq && c.kitS === 'sp_saida').forEach(c => { c.max = el.n; });
    pl.tags.filter(t => t.equipId === el.eq && t.kitS === 'saida').forEach(t => { t.faixa = [1, el.n]; });
}
/** Renomear o símbolo renomeia o equipamento e atualiza os tópicos que ainda são os automáticos. */
function renomearPeloRotulo(pl, el, antigo, novo) {
    novo = String(novo || '').trim();
    if (!novo) return;
    const troca = (txt, de, para) => (de && txt.includes(de) ? txt.split(de).join(para) : txt);
    if (el.eq) {
        const eq = SUP.equipamento(el.eq);
        if (!eq) return;
        const velho = eq.nome; eq.nome = novo;
        const base = baseTopico(novo);
        pl.tags.filter(t => t.equipId === eq.id).forEach(t => { t.nome = troca(t.nome, velho, novo); if (t.topicoAuto && t.kitS) t.topico = `${base}/${t.kitS}`; });
        pl.comandos.filter(c => c.equipId === eq.id).forEach(c => { c.nome = troca(c.nome, velho, novo); if (c.topicoAuto && c.kitS) c.topico = `${base}/${c.kitS}`; });
        return;
    }
    const t = el.tag && SUP.tag(el.tag);
    if (t && (t.kitS === 'entrada' || t.kitS === 'sensor')) { t.nome = novo; if (t.topicoAuto) t.topico = `${t.kitS === 'entrada' ? 'entradas' : 'sensores'}/${baseTopico(novo)}`; }
    const c = el.cmd && pl.comandos.find(x => x.id === el.cmd);
    if (c && c.kitS === 'comando') { c.nome = novo; if (c.topicoAuto) c.topico = `comandos/${baseTopico(novo)}`; }
    void antigo;
}
/** Painel "Tópicos" do símbolo selecionado: edita tópico, unidade e mensagens direto no desenho. */
function htmlTopicosElemento(pl, el, S) {
    const tags = el.eq ? pl.tags.filter(t => t.equipId === el.eq) : el.tag ? pl.tags.filter(t => t.id === el.tag) : [];
    const cmds = el.eq ? pl.comandos.filter(c => c.equipId === el.eq) : el.cmd ? pl.comandos.filter(c => c.id === el.cmd) : [];
    if (!tags.length && !cmds.length) return '';
    const pre = String(pl.conexao.prefixo || '').replace(/\/+$/, '');
    return `<fieldset class="sin-topicos"><legend>Tópicos MQTT ${pre ? `<small>(prefixo ${esc(pre)}/)</small>` : ''}</legend>
        ${tags.map(t => `<div class="sin-top-linha"><span class="sin-top-nome">${icone(t.tipo)} ${esc(t.nome.replace(/ — .*$/, ''))}${t.origem === 'calc' ? ' <small>(equação)</small>' : ''}</span>
            <input type="text" class="sin-top-un" data-ref="tag:${t.id}.unidade" value="${escAttr(t.unidade)}" aria-label="Unidade" title="Unidade">
            ${t.origem === 'mqtt' ? `<input type="text" class="sin-top-topico" data-ref="tag:${t.id}.topico" value="${escAttr(t.topico)}" spellcheck="false" title="${escAttr(topicoCompleto(pl, t.topico))}" aria-label="Tópico de ${escAttr(t.nome)}">` : t.origem === 'calc' ? `<input type="text" class="sin-top-topico" data-ref="tag:${t.id}.expr" data-expr-pl="${pl.id}" value="${escAttr(t.expr)}" spellcheck="false" aria-label="Equação"><small class="expr-conf"></small>` : ''}</div>`).join('')}
        ${cmds.map(c => `<div class="sin-top-linha cmd"><span class="sin-top-nome">${icone(c.tipo === 'chave' ? 'estado' : c.tipo === 'setpoint' ? 'percentual' : 'play')} ${esc(c.nome.replace(/ — .*$/, ''))} <small>(${c.tipo === 'chave' ? 'liga/desliga' : c.tipo})</small></span>
            <input type="text" data-ref="cmd:${c.id}.topico" value="${escAttr(c.topico)}" spellcheck="false" aria-label="Tópico do comando">
            ${c.tipo === 'chave' ? `<span class="sin-top-payloads"><input type="text" data-ref="cmd:${c.id}.payloadLiga" value="${escAttr(c.payloadLiga)}" title="Mensagem para ligar"><input type="text" data-ref="cmd:${c.id}.payloadDesliga" value="${escAttr(c.payloadDesliga)}" title="Mensagem para desligar"></span>`
                : c.tipo === 'setpoint' ? `<span class="sin-top-payloads"><input type="number" step="any" data-ref="cmd:${c.id}.min" value="${c.min}" title="Mínimo"><input type="number" step="any" data-ref="cmd:${c.id}.max" value="${c.max}" title="Máximo"></span>`
                : `<span class="sin-top-payloads"><input type="text" data-ref="cmd:${c.id}.payloadLiga" value="${escAttr(c.payloadLiga)}" title="Mensagem"></span>`}</div>`).join('')}
        <small>Os tópicos vêm prontos (equipamento/grandeza); mude se o campo usar outro. Renomear o símbolo atualiza os tópicos que ainda não foram editados.</small>
        <a class="btn-link" href="#/configurar/${pl.id}">Mais opções da variável (limites, escala, JSON) em Configurar</a></fieldset>`;
}

// ---------------------------------------------------------------- faceplate (clique no equipamento em operação)
function abrirFaceplate(pl, eqId) {
    const eq = SUP.equipamento(eqId); if (!eq) return;
    document.querySelectorAll('.faceplate-fundo').forEach(f => f.remove());
    const tags = pl.tags.filter(t => t.equipId === eq.id), cmds = pl.comandos.filter(c => c.equipId === eq.id);
    const fundo = document.createElement('div');
    fundo.className = 'janela-fundo faceplate-fundo';
    fundo.innerHTML = `<div class="janela faceplate" role="dialog" aria-modal="true" aria-label="${escAttr(eq.nome)}">
        <div class="card-topo"><h2>${esc(eq.nome)}</h2>${chipEstadoEquip(eq)}<button type="button" class="btn-icone" data-fp="fechar" aria-label="Fechar">×</button></div>
        ${cmds.length ? `<div class="cmds">${cmds.map(c => botaoComando(pl, c)).join('')}</div>` : ''}
        ${tags.length ? `<div class="grade-vars">${tags.map(t => cartaoVar(pl, t)).join('')}</div>` : '<p class="nota">Este equipamento ainda não tem variáveis.</p>'}
        <div class="botoes"><button type="button" class="btn btn-secondary btn-sm" data-fp="grafico">${icone('graficos')} Gráfico das variáveis</button><a class="btn btn-secondary btn-sm" href="#/configurar/${pl.id}">${icone('configurar')} Configurar</a></div></div>`;
    document.body.appendChild(fundo);
    const atualizar = () => { if (!document.body.contains(fundo)) { clearInterval(tm); return; } atualizarCartoes(fundo, new Set(), true); };
    const tm = setInterval(atualizar, 1000); atualizar();
    const fechar = () => { clearInterval(tm); fundo.remove(); };
    fundo.addEventListener('click', e => {
        if (e.target === fundo || e.target.closest('[data-fp="fechar"]')) fechar();
        else if (e.target.closest('[data-fp="grafico"]')) { GRAF.sel = tags.filter(t => t.tipo !== 'estado').slice(0, 6).map(t => t.id); GRAF.aoVivo = true; guardarGraf(); fechar(); location.hash = '#/graficos'; }
        else if (e.target.closest('a, .cartao-var')) setTimeout(fechar, 0);
    });
    document.addEventListener('keydown', function esc_(e) { if (e.key === 'Escape') { fechar(); document.removeEventListener('keydown', esc_); } });
}
