/**
 * © 2026 Supervisório MQTT — Inova Agro UFPel EMBRAPII. Código aberto; cópias permitidas desde que citadas.
 *
 * BIBLIOTECA AMPLIADA DO SINÓTICO (v2) — baseada no fluxo de uma UBG de arroz (recepção, secagem, armazenagem,
 * beneficiamento e expedição, como no simulador Garten Flow) e nos símbolos de P&ID da ISA 5.1:
 *  caminhões e tombador, balanças (fluxo contínuo, ensacadora simples e dupla, expedição a granel, big bag, fita,
 *  resíduos, plataforma), máquinas da UBG de arroz (descascador, separador de marinheiros, separador de pedras,
 *  brunidor, polidor, peneira classificadora, classificador de espessura, trieur, selecionadora óptica com N saídas,
 *  separador magnético, parboilização), guilhotinas e comportas para material e para ar, desviadoras e distribuidores
 *  para N saídas, válvula rotativa, sistemas de ar e de proteção contra explosão, elétrica e automação, sensores,
 *  botões e o conjunto P&ID (válvulas, atuadores, equipamentos e instrumentos).
 *
 * Cada símbolo pode ter um KIT: ao ser inserido, o sistema cria o equipamento, as variáveis (com tópico base e unidade)
 * e os comandos já preenchidos — o tópico pode ser editado depois clicando no símbolo (modo edição).
 * Kit: { tags: [{ s: sufixo, tipo, nome, un?, lim?, faixa?, dec? }], cmds: [{ s, tipo, nome, ... }], motor: [iVazio, iCarga],
 *        mostrar: [sufixos exibidos embaixo], nivel: sufixo }
 * Os desenhos seguem a ISA-101: traço cinza e corpo neutro; a cor do estado e do alarme vem do CSS.
 */

'use strict';

// ---------------------------------------------------------------- ajudantes de desenho
const _p = (d, c = 'corpo') => `<path class="${c}" d="${d}"/>`;
const _r = (x, y, w, h, c = 'corpo', rx = 2) => `<rect class="${c}" x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"/>`;
const _c = (x, y, r, c = 'corpo') => `<circle class="${c}" cx="${x}" cy="${y}" r="${r}"/>`;
const _l = (x1, y1, x2, y2, c = 'detalhe') => `<path class="${c}" d="M${x1} ${y1} L${x2} ${y2}"/>`;
const _t = (x, y, txt, tam = 11) => `<text class="sin-letra" x="${x}" y="${y}" text-anchor="middle" style="font-size:${tam}px">${txt}</text>`;
/** Corpo de válvula (duas cunhas) centrado em (cx, cy). */
const _valv = (cx, cy, a, b) => _p(`M${cx - a} ${cy - b} L${cx} ${cy} L${cx - a} ${cy + b} Z M${cx + a} ${cy - b} L${cx} ${cy} L${cx + a} ${cy + b} Z`);
/** Haste e atuador acima da válvula. */
const _haste = (cx, y0, y1) => _l(cx, y0, cx, y1);
/** Bocais de saída (n) na base de um equipamento. */
function _saidas(w, h, n, y0, alt = 14) {
    n = Math.max(1, Math.min(16, n | 0));
    const passo = w / n;
    return Array.from({ length: n }, (_, i) => { const x = passo * (i + .5); return _p(`M${x - 5} ${y0} L${x + 5} ${y0} L${x + 3} ${y0 + alt} L${x - 3} ${y0 + alt} Z`) + _t(x, h - 1, i + 1, 8); }).join('');
}
const nSaidas = (el, S) => Math.max(1, Math.min(16, num(el && el.n, S.n || 2)));

// ---------------------------------------------------------------- kits (variáveis e comandos pré-preenchidos)
const K = {
    motor: (iV = 2, iC = 6, extra = []) => ({ motor: [iV, iC], tags: [{ s: 'corrente', tipo: 'corrente', nome: 'Corrente' }, { s: 'estado', tipo: 'estado', nome: 'Estado' }, ...extra], cmds: [{ s: 'cmd', tipo: 'chave', nome: 'Ligar' }], mostrar: ['corrente'] }),
    abreFecha: (nome = 'Abrir') => ({ tags: [{ s: 'aberta', tipo: 'estado', nome: 'Aberta (fim de curso)' }], cmds: [{ s: 'cmd', tipo: 'chave', nome, payloadLiga: '1', payloadDesliga: '0' }], mostrar: ['aberta'] }),
    posicao: (nome = 'Posição') => ({ tags: [{ s: 'posicao', tipo: 'percentual', nome }], cmds: [{ s: 'sp', tipo: 'setpoint', nome: 'Abertura', min: 0, max: 100, passo: 1, unidade: '%' }], mostrar: ['posicao'] }),
    saidaN: () => ({ tags: [{ s: 'saida', tipo: 'generico', nome: 'Saída atual', un: '', dec: 0 }], cmds: [{ s: 'sp_saida', tipo: 'setpoint', nome: 'Escolher saída', min: 1, max: 2, passo: 1, unidade: '' }], mostrar: ['saida'], ajustarN: true }),
    so: (tipo, nome, s, extra = {}) => ({ tags: [Object.assign({ s, tipo, nome }, extra)], mostrar: [s] })
};

// ---------------------------------------------------------------- símbolos novos
const SIMBOLOS_V2 = {
    // ===== Recebimento e expedição
    caminhao_graneleiro: { nome: 'Caminhão graneleiro', grupo: 'Recebimento e caminhões', w: 230, h: 90,
        svg: (w, h) => _r(4, 18, w * .68, h * .5, 'corpo', 3) + _l(4, 30, w * .68 + 4, 30, 'detalhe fino') + _p(`M${w * .72} ${h * .32} H${w * .88} L${w - 4} ${h * .5} V${h * .68} H${w * .72} Z`) + _r(w * .76, h * .36, w * .09, h * .13, 'detalhe', 1) + _l(4, h * .68, w - 4, h * .68) + [.12, .26, .55, .86].map(f => _c(w * f, h * .8, 10) + _c(w * f, h * .8, 3, 'detalhe')).join('') },
    caminhao_basculante: { nome: 'Caminhão basculante (caçamba)', grupo: 'Recebimento e caminhões', w: 210, h: 100,
        svg: (w, h) => _p(`M6 ${h * .62} L${w * .12} ${h * .12} L${w * .66} ${h * .2} L${w * .64} ${h * .62} Z`) + _l(w * .12, h * .62, w * .3, h * .3) + _p(`M${w * .7} ${h * .34} H${w * .86} L${w - 4} ${h * .5} V${h * .7} H${w * .7} Z`) + _l(4, h * .7, w - 4, h * .7) + [.14, .3, .84].map(f => _c(w * f, h * .82, 10)).join('') },
    carreta_bitrem: { nome: 'Carreta bitrem', grupo: 'Recebimento e caminhões', w: 340, h: 90,
        svg: (w, h) => _r(4, 18, w * .38, h * .48) + _r(w * .41, 18, w * .38, h * .48) + _p(`M${w * .82} ${h * .32} H${w * .92} L${w - 4} ${h * .5} V${h * .68} H${w * .82} Z`) + _l(4, h * .68, w - 4, h * .68) + [.06, .14, .3, .48, .56, .72, .9].map(f => _c(w * f, h * .8, 9)).join('') },
    caminhao_bau: { nome: 'Caminhão baú (sacaria)', grupo: 'Recebimento e caminhões', w: 200, h: 92,
        svg: (w, h) => _r(4, 6, w * .66, h * .62, 'corpo', 3) + [.2, .4].map(f => _l(4, h * f + 6, w * .66 + 4, h * f + 6, 'detalhe fino')).join('') + _p(`M${w * .72} ${h * .3} H${w * .86} L${w - 4} ${h * .48} V${h * .68} H${w * .72} Z`) + _l(4, h * .68, w - 4, h * .68) + [.14, .3, .84].map(f => _c(w * f, h * .8, 10)).join('') },
    tombador: { nome: 'Tombador hidráulico', grupo: 'Recebimento e caminhões', w: 240, h: 90, equip: true, kit: { tags: [{ s: 'angulo', tipo: 'generico', nome: 'Ângulo da plataforma', un: '°', dec: 0, faixa: [0, 45] }, { s: 'pressao', tipo: 'pressao', nome: 'Pressão hidráulica', un: 'bar', faixa: [0, 250] }], cmds: [{ s: 'cmd', tipo: 'chave', nome: 'Tombar' }], mostrar: ['angulo'] },
        svg: (w, h) => _p(`M4 ${h * .52} L${w - 4} ${h * .18} L${w - 4} ${h * .3} L4 ${h * .64} Z`) + _p(`M${w * .45} ${h * .45} L${w * .48} ${h - 6} H${w * .56} L${w * .58} ${h * .4}`, 'detalhe') + _l(0, h - 4, w, h - 4) + _p(`M${w * .1} ${h - 4} L${w * .2} ${h * .62}`, 'detalhe') },
    amostrador: { nome: 'Amostrador (calador / coletor automático)', grupo: 'Recebimento e caminhões', w: 70, h: 120, equip: true, kit: { tags: [{ s: 'umidade', tipo: 'umidade_grao', nome: 'Umidade da amostra' }, { s: 'impureza', tipo: 'percentual', nome: 'Impureza da amostra' }], cmds: [{ s: 'cmd', tipo: 'botao', nome: 'Coletar amostra', payloadLiga: '1' }], mostrar: ['umidade'] },
        svg: (w, h) => _r(w * .4, 4, w * .2, h * .12) + _l(w * .5, h * .16, w * .5, h * .55) + _p(`M${w * .5} ${h * .2} H${w - 6} V${h * .35}`, 'detalhe') + _p(`M${w * .42} ${h * .55} H${w * .58} L${w * .54} ${h - 4} H${w * .46} Z`) },
    // ===== Balanças
    balanca_fluxo: { nome: 'Balança de fluxo contínuo (vertical)', grupo: 'Balanças', w: 80, h: 160, equip: true,
        kit: { tags: [{ s: 'vazao', tipo: 'vazao', nome: 'Vazão', un: 't/h' }, { s: 'total', tipo: 'peso', nome: 'Totalizador', un: 't', dec: 2, faixa: [0, 10000] }], cmds: [{ s: 'sp_vazao', tipo: 'setpoint', nome: 'Setpoint de produção', min: 0, max: 200, passo: 1, unidade: 't/h' }], mostrar: ['vazao', 'total'] },
        svg: (w, h) => _p(`M6 4 H${w - 6} V${h * .22} L${w * .66} ${h * .3} H${w * .34} L6 ${h * .22} Z`) + _r(w * .2, h * .34, w * .6, h * .34) + _t(w / 2, h * .54, 'W', 13) + _p(`M${w * .34} ${h * .72} H${w * .66} L${w * .58} ${h - 4} H${w * .42} Z`) + _l(w * .3, h * .31, w * .7, h * .31, 'detalhe grosso') + _l(w * .3, h * .7, w * .7, h * .7, 'detalhe grosso') },
    balanca_fita: { nome: 'Balança de fita (dosadora)', grupo: 'Balanças', w: 220, h: 50, equip: true,
        kit: { tags: [{ s: 'vazao', tipo: 'vazao', nome: 'Vazão', un: 't/h' }, { s: 'total', tipo: 'peso', nome: 'Totalizador', un: 't', dec: 2, faixa: [0, 10000] }], mostrar: ['vazao'] },
        svg: (w, h) => _r(h * .3, 6, w - h * .6, h * .36, 'corpo', 8) + _c(h * .3 + 8, h * .24, 8, 'detalhe') + _c(w - h * .3 - 8, h * .24, 8, 'detalhe') + _p(`M${w * .45} ${h * .5} L${w * .5} ${h - 4} L${w * .55} ${h * .5} Z`) + _t(w * .5, h * .34, 'W', 11) },
    ensacadora: { nome: 'Balança ensacadora', grupo: 'Balanças', w: 90, h: 170, equip: true,
        kit: { tags: [{ s: 'peso_saco', tipo: 'peso', nome: 'Peso do saco', faixa: [0, 60] }, { s: 'sacos_min', tipo: 'generico', nome: 'Sacos por minuto', un: 'sc/min', dec: 1, faixa: [0, 20] }, { s: 'contador', tipo: 'generico', nome: 'Contador de sacos', un: 'sc', dec: 0, faixa: [0, 10000] }], cmds: [{ s: 'sp_peso', tipo: 'setpoint', nome: 'Peso do saco', min: 1, max: 60, passo: 0.5, unidade: 'kg' }, { s: 'cmd', tipo: 'chave', nome: 'Ligar ensaque' }], mostrar: ['peso_saco', 'sacos_min'] },
        svg: (w, h) => _p(`M6 4 H${w - 6} V${h * .2} L${w * .64} ${h * .3} H${w * .36} L6 ${h * .2} Z`) + _r(w * .26, h * .32, w * .48, h * .2) + _t(w / 2, h * .45, 'W', 12) + _p(`M${w * .4} ${h * .52} H${w * .6} V${h * .62} H${w * .4} Z`) + _p(`M${w * .3} ${h * .64} H${w * .7} L${w * .76} ${h - 6} H${w * .24} Z`, 'corpo saco') },
    ensacadora_dupla: { nome: 'Balança de duplo ensaque', grupo: 'Balanças', w: 150, h: 170, equip: true,
        kit: { tags: [{ s: 'peso_saco_1', tipo: 'peso', nome: 'Peso do saco (bica 1)', faixa: [0, 60] }, { s: 'peso_saco_2', tipo: 'peso', nome: 'Peso do saco (bica 2)', faixa: [0, 60] }, { s: 'sacos_min', tipo: 'generico', nome: 'Sacos por minuto', un: 'sc/min', dec: 1, faixa: [0, 30] }], cmds: [{ s: 'sp_peso', tipo: 'setpoint', nome: 'Peso do saco', min: 1, max: 60, passo: 0.5, unidade: 'kg' }, { s: 'cmd', tipo: 'chave', nome: 'Ligar ensaque' }], mostrar: ['sacos_min'] },
        svg: (w, h) => _p(`M6 4 H${w - 6} V${h * .18} L${w * .6} ${h * .26} H${w * .4} L6 ${h * .18} Z`) + [.25, .75].map(f => _r(w * f - w * .15, h * .3, w * .3, h * .2) + _t(w * f, h * .43, 'W', 11) + _p(`M${w * f - w * .14} ${h * .62} H${w * f + w * .14} L${w * f + w * .17} ${h - 6} H${w * f - w * .17} Z`, 'corpo saco') + _l(w * f, h * .5, w * f, h * .62)).join('') },
    balanca_expedicao: { nome: 'Balança de expedição a granel (suspensa)', grupo: 'Balanças', w: 120, h: 170, equip: true,
        kit: { tags: [{ s: 'peso', tipo: 'peso', nome: 'Peso carregado', faixa: [0, 60000], dec: 0 }], cmds: [{ s: 'sp_carga', tipo: 'setpoint', nome: 'Carga programada', min: 0, max: 60000, passo: 100, unidade: 'kg' }, { s: 'cmd', tipo: 'chave', nome: 'Carregar' }], mostrar: ['peso'] },
        svg: (w, h) => _l(4, 4, w - 4, 4, 'detalhe grosso') + _l(w * .2, 4, w * .2, h * .14) + _l(w * .8, 4, w * .8, h * .14) + _p(`M8 ${h * .14} H${w - 8} V${h * .46} L${w * .6} ${h * .58} H${w * .4} L8 ${h * .46} Z`) + _t(w / 2, h * .34, 'W', 14) + _r(w * .42, h * .6, w * .16, h * .14) + _r(w * .44, h * .74, w * .12, h * .12) + _p(`M${w * .38} ${h * .86} H${w * .62} L${w * .58} ${h - 4} H${w * .42} Z`) },
    balanca_bigbag: { nome: 'Balança de big bag', grupo: 'Balanças', w: 120, h: 170, equip: true,
        kit: { tags: [{ s: 'peso', tipo: 'peso', nome: 'Peso do big bag', faixa: [0, 1500], dec: 0 }], cmds: [{ s: 'sp_peso', tipo: 'setpoint', nome: 'Setpoint kg big bag', min: 100, max: 1500, passo: 10, unidade: 'kg' }, { s: 'cmd', tipo: 'chave', nome: 'Encher big bag' }], mostrar: ['peso'] },
        svg: (w, h) => _p(`M6 4 V${h - 6} M${w - 6} 4 V${h - 6} M6 6 H${w - 6}`, 'detalhe grosso') + _p(`M${w * .44} 6 V${h * .3} H${w * .56} V6`) + _p(`M${w * .2} ${h * .36} H${w * .8} L${w * .84} ${h * .88} Q${w * .5} ${h * .98} ${w * .16} ${h * .88} Z`, 'corpo saco') + _l(w * .3, h * .3, w * .25, h * .36) + _l(w * .7, h * .3, w * .75, h * .36) + _t(w / 2, h * .66, 'W', 13) },
    balanca_residuo: { nome: 'Balança de casca / farelo (resíduos)', grupo: 'Balanças', w: 80, h: 110, equip: true,
        kit: { tags: [{ s: 'vazao', tipo: 'vazao', nome: 'Vazão de resíduo', un: 'kg/h', faixa: [0, 5000], dec: 0 }, { s: 'total', tipo: 'peso', nome: 'Totalizador', un: 't', dec: 2, faixa: [0, 10000] }], mostrar: ['vazao'] },
        svg: (w, h) => _p(`M6 4 H${w - 6} V${h * .4} L${w * .6} ${h * .55} H${w * .4} L6 ${h * .4} Z`) + _t(w / 2, h * .28, 'W', 12) + _r(w * .38, h * .57, w * .24, h * .2) + _p(`M${w * .4} ${h * .78} H${w * .6} L${w * .55} ${h - 4} H${w * .45} Z`) },
    balanca_plataforma: { nome: 'Balança de plataforma (sacaria)', grupo: 'Balanças', w: 120, h: 50, equip: true, kit: K.so('peso', 'Peso', 'peso', { faixa: [0, 3000], dec: 1 }),
        svg: (w, h) => _r(4, h * .55, w - 8, h * .25) + _l(w * .85, h * .55, w * .85, 4) + _r(w * .72, 2, w * .24, h * .22) + _t(w * .84, h * .2, 'kg', 9) + _l(4, h - 4, w - 4, h - 4) },
    // ===== UBG de arroz (beneficiamento)
    maquina_limpeza: { nome: 'Máquina de limpeza (peneiras + aspiração)', grupo: 'Beneficiamento de arroz', w: 130, h: 100, equip: true, kit: K.motor(2, 5),
        svg: (w, h) => _r(4, 10, w - 8, h * .64) + [.3, .45, .6].map(f => _l(12, h * f, w - 12, h * f + 8, 'detalhe')).join('') + _p(`M${w * .72} 10 V2 H${w * .9} V10`) + _l(w * .2, h * .74, w * .2, h - 4) + _l(w * .8, h * .74, w * .8, h - 4) + _p(`M${w * .45} ${h * .74} L${w * .5} ${h - 2} L${w * .55} ${h * .74}`, 'detalhe') },
    descascador: { nome: 'Descascador (rolos de borracha)', grupo: 'Beneficiamento de arroz', w: 100, h: 140, equip: true,
        kit: K.motor(3, 9, [{ s: 'pressao_rolos', tipo: 'percentual', nome: 'Pressão dos rolos', un: '%' }, { s: 'descasque', tipo: 'percentual', nome: 'Grau de descascamento', un: '%', faixa: [60, 100] }]),
        svg: (w, h) => _p(`M${w * .25} 4 H${w * .75} L${w * .62} ${h * .2} H${w * .38} Z`) + _r(6, h * .22, w - 12, h * .56) + _c(w * .38, h * .44, h * .12) + _c(w * .62, h * .44, h * .12) + _c(w * .38, h * .44, 3, 'detalhe') + _c(w * .62, h * .44, 3, 'detalhe') + _p(`M${w * .25} ${h * .78} L${w * .4} ${h - 4} H${w * .6} L${w * .75} ${h * .78}`, 'detalhe') + _p(`M${w - 6} ${h * .3} H${w + 4}`, 'detalhe') },
    separador_marinheiros: { nome: 'Separador de marinheiros (mesa paddy)', grupo: 'Beneficiamento de arroz', w: 150, h: 120, equip: true, kit: K.motor(1.5, 3),
        svg: (w, h) => [0, 1, 2, 3].map(i => _p(`M${10 + i * 4} ${h * .18 + i * 12} L${w - 10} ${h * .1 + i * 12} L${w - 14} ${h * .18 + i * 12} L${14 + i * 4} ${h * .26 + i * 12} Z`, i === 0 ? 'corpo' : 'corpo')).join('') + _l(w * .2, h * .66, w * .16, h - 4) + _l(w * .8, h * .6, w * .84, h - 4) + _p(`M${w * .45} ${h * .62} l10 10 l10 -10`, 'detalhe') },
    separador_pedras: { nome: 'Separador de pedras (despedregador)', grupo: 'Beneficiamento de arroz', w: 140, h: 110, equip: true, kit: K.motor(2, 4),
        svg: (w, h) => _p(`M8 ${h * .4} L${w - 8} ${h * .18} L${w - 8} ${h * .3} L8 ${h * .52} Z`) + [.25, .5, .75].map(f => _c(w * f, h * .38 - (f - .5) * 30, 2.2, 'detalhe')).join('') + _r(w * .3, h * .56, w * .4, h * .26) + _c(w * .5, h * .69, h * .1, 'detalhe') + _l(w * .12, h * .5, w * .1, h - 4) + _l(w * .88, h * .28, w * .9, h - 4) + _p(`M${w - 10} ${h * .18} V4 H${w * .7}`, 'detalhe') },
    brunidor: { nome: 'Brunidor', grupo: 'Beneficiamento de arroz', w: 100, h: 150, equip: true,
        kit: K.motor(10, 30, [{ s: 'pressao', tipo: 'pressao', nome: 'Pressão na câmara', un: 'kPa', faixa: [0, 100] }]),
        svg: (w, h) => _p(`M${w * .3} 4 H${w * .7} L${w * .6} ${h * .14} H${w * .4} Z`) + _r(w * .24, h * .15, w * .52, h * .52, 'corpo', 6) + [.25, .35, .45, .55].map(f => _l(w * .3, h * f, w * .7, h * f + 5, 'detalhe fino')).join('') + _r(w * .06, h * .7, w * .5, h * .2) + _c(w * .3, h * .8, 8, 'detalhe') + _l(w * .7, h * .67, w * .74, h - 4) + _l(w * .56, h * .9, w * .56, h - 4) },
    polidor: { nome: 'Polidor (a água)', grupo: 'Beneficiamento de arroz', w: 100, h: 150, equip: true,
        kit: K.motor(10, 28, [{ s: 'pressao', tipo: 'pressao', nome: 'Pressão na câmara', un: 'kPa', faixa: [0, 100] }, { s: 'agua', tipo: 'vazao', nome: 'Vazão de água', un: 'L/h', faixa: [0, 200], dec: 0 }]),
        svg: (w, h) => _p(`M${w * .3} 4 H${w * .7} L${w * .6} ${h * .14} H${w * .4} Z`) + _r(w * .24, h * .15, w * .52, h * .52, 'corpo', 6) + _p(`M${w * .5} ${h * .28} c-6 9 -8 13 0 18 c8 -5 6 -9 0 -18 Z`, 'detalhe') + _r(w * .06, h * .7, w * .5, h * .2) + _c(w * .3, h * .8, 8, 'detalhe') + _l(w * .7, h * .67, w * .74, h - 4) + _p(`M${w * .76} ${h * .2} H${w - 4}`, 'detalhe') },
    peneira_classificadora: { nome: 'Peneira classificadora (plansifter)', grupo: 'Beneficiamento de arroz', w: 140, h: 110, equip: true, kit: K.motor(2, 4), n: 3,
        svg: (w, h, el) => _l(w * .15, 2, w * .15, h * .12) + _l(w * .85, 2, w * .85, h * .12) + [0, 1, 2, 3].map(i => _r(8, h * .12 + i * h * .13, w - 16, h * .11)).join('') + _saidas(w, h, nSaidas(el, SIMBOLOS_V2.peneira_classificadora), h * .66, h * .2) },
    classificador_espessura: { nome: 'Classificador de espessura', grupo: 'Beneficiamento de arroz', w: 150, h: 90, equip: true, kit: K.motor(1.5, 3),
        svg: (w, h) => _r(8, h * .2, w - 16, h * .4, 'corpo', h * .2) + Array.from({ length: 8 }, (_, i) => _l(20 + i * (w - 40) / 7, h * .26, 20 + i * (w - 40) / 7, h * .54, 'detalhe fino')).join('') + _p(`M${w * .25} ${h * .6} L${w * .3} ${h - 4} H${w * .4} L${w * .45} ${h * .6}`) + _p(`M${w * .7} ${h * .6} L${w * .75} ${h - 4} H${w * .85} L${w * .9} ${h * .6}`) },
    trieur: { nome: 'Trieur (cilindro alveolado)', grupo: 'Beneficiamento de arroz', w: 160, h: 80, equip: true, kit: K.motor(1.5, 3),
        svg: (w, h) => _r(8, h * .15, w - 16, h * .5, 'corpo', h * .25) + Array.from({ length: 14 }, (_, i) => _c(20 + (i % 7) * (w - 40) / 6, h * (i < 7 ? .3 : .5), 2, 'detalhe')).join('') + _l(w * .25, h * .65, w * .25, h - 4) + _l(w * .75, h * .65, w * .75, h - 4) },
    selecionadora_optica: { nome: 'Selecionadora óptica (N saídas)', grupo: 'Beneficiamento de arroz', w: 150, h: 150, equip: true, n: 3,
        kit: { tags: [{ s: 'estado', tipo: 'estado', nome: 'Estado' }, { s: 'rejeito', tipo: 'percentual', nome: 'Rejeito', un: '%', faixa: [0, 20], lim: { h: 8, atrasoS: 60, histerese: 0.5 } }, { s: 'vazao', tipo: 'vazao', nome: 'Vazão', un: 't/h', faixa: [0, 20] }], cmds: [{ s: 'cmd', tipo: 'chave', nome: 'Ligar' }], mostrar: ['rejeito', 'vazao'] },
        svg: (w, h, el) => _p(`M${w * .1} 4 H${w * .9} L${w * .8} ${h * .2} H${w * .2} Z`) + _r(6, h * .2, w - 12, h * .5) + _p(`M${w * .18} ${h * .28} L${w * .5} ${h * .5}`, 'detalhe') + _c(w * .75, h * .36, 9, 'detalhe') + _c(w * .75, h * .36, 3.5, 'detalhe') + _p(`M${w * .75} ${h * .45} L${w * .55} ${h * .5}`, 'detalhe fino') + _saidas(w, h, nSaidas(el, SIMBOLOS_V2.selecionadora_optica), h * .7, h * .18) },
    separador_magnetico: { nome: 'Separador magnético rotativo', grupo: 'Beneficiamento de arroz', w: 80, h: 110, equip: true, kit: K.motor(0.5, 1.2),
        svg: (w, h) => _p(`M${w * .2} 4 H${w * .8} L${w * .7} ${h * .2} H${w * .3} Z`) + _r(8, h * .22, w - 16, h * .46) + _c(w / 2, h * .45, h * .14) + _p(`M${w / 2 - 6} ${h * .45} a6 6 0 0 1 12 0`, 'detalhe') + _p(`M${w * .3} ${h * .68} L${w * .36} ${h - 4} H${w * .46} L${w * .5} ${h * .68}`) + _p(`M${w * .6} ${h * .68} L${w * .66} ${h - 12} H${w * .74} L${w * .76} ${h * .68}`) },
    parboilizacao: { nome: 'Encharcamento / autoclave (parboilização)', grupo: 'Beneficiamento de arroz', w: 90, h: 160, equip: true,
        kit: { tags: [{ s: 'temperatura', tipo: 'temperatura', nome: 'Temperatura da água', faixa: [20, 90] }, { s: 'pressao', tipo: 'pressao', nome: 'Pressão do vapor', un: 'kPa', faixa: [0, 300] }, { s: 'nivel', tipo: 'nivel', nome: 'Nível' }], cmds: [{ s: 'sp_temp', tipo: 'setpoint', nome: 'Temperatura de encharque', min: 30, max: 75, passo: 1, unidade: '°C' }], mostrar: ['temperatura', 'nivel'], nivel: 'nivel' },
        svg: (w, h) => _p(`M8 ${h * .12} Q${w / 2} -2 ${w - 8} ${h * .12} V${h * .7} L${w * .6} ${h * .86} H${w * .4} L8 ${h * .7} Z`) + _l(w * .25, h * .86, w * .2, h - 4) + _l(w * .75, h * .86, w * .8, h - 4) + _p(`M${w - 8} ${h * .3} H${w + 4}`, 'detalhe') },
    aspirador_casca: { nome: 'Aspirador / exaustor de casca', grupo: 'Beneficiamento de arroz', w: 90, h: 80, equip: true, kit: K.motor(4, 12),
        svg: (w, h) => _p(`M${w * .5} ${h * .15} a${h * .35} ${h * .35} 0 1 0 ${h * .35} ${h * .35} V${h * .15} Z`) + _r(w * .5 + h * .35 - 4, 2, 18, h * .15) + _c(w * .5, h * .5, h * .12, 'detalhe') + _l(w * .2, h * .85, w * .8, h * .85) },
    // ===== Fluxo de material: guilhotinas, comportas, desviadoras e distribuidores
    guilhotina_manual: { nome: 'Guilhotina manual (registro de gaveta)', grupo: 'Fluxo de material', w: 60, h: 46, equip: true, kit: K.so('estado', 'Aberta (fim de curso)', 'aberta'),
        svg: (w, h) => _r(w * .2, h * .3, w * .6, h * .4) + _l(w * .2, h * .5, w * .8, h * .5, 'detalhe') + _l(w * .8, h * .5, w - 4, h * .5) + _c(w - 6, h * .5, 5, 'detalhe') + _l(w * .35, 2, w * .35, h * .3) + _l(w * .65, 2, w * .65, h * .3) + _l(w * .35, h * .7, w * .35, h - 2) + _l(w * .65, h * .7, w * .65, h - 2) },
    guilhotina_pneumatica: { nome: 'Guilhotina pneumática (abre/fecha)', grupo: 'Fluxo de material', w: 90, h: 46, equip: true, kit: K.abreFecha('Abrir guilhotina'),
        svg: (w, h) => _r(4, h * .3, w * .44, h * .4) + _l(4, h * .5, w * .44, h * .5, 'detalhe') + _l(w * .48, h * .5, w * .58, h * .5) + _r(w * .58, h * .32, w * .38, h * .36) + _t(w * .77, h * .6, 'P', 10) + _l(w * .14, 2, w * .14, h * .3) + _l(w * .34, 2, w * .34, h * .3) + _l(w * .14, h * .7, w * .14, h - 2) + _l(w * .34, h * .7, w * .34, h - 2) },
    comporta_onoff: { nome: 'Comporta liga/desliga (motorizada)', grupo: 'Fluxo de material', w: 90, h: 50, equip: true, kit: K.abreFecha('Abrir comporta'),
        svg: (w, h) => _r(4, h * .28, w * .5, h * .44) + _l(4, h * .5, w * .54, h * .5, 'detalhe') + _c(w * .72, h * .5, h * .22) + _t(w * .72, h * .5 + 4, 'M', 11) + _l(w * .14, 2, w * .14, h * .28) + _l(w * .44, 2, w * .44, h * .28) + _l(w * .14, h * .72, w * .14, h - 2) + _l(w * .44, h * .72, w * .44, h - 2) },
    comporta_proporcional: { nome: 'Comporta proporcional (controle de fluxo)', grupo: 'Fluxo de material', w: 90, h: 56, equip: true, kit: K.posicao('Abertura da comporta'),
        svg: (w, h) => _r(4, h * .28, w * .5, h * .44) + _l(4, h * .5, w * .32, h * .5, 'detalhe') + _c(w * .72, h * .5, h * .22) + _t(w * .72, h * .5 + 4, 'M', 11) + _p(`M${w * .58} ${h * .14} A${h * .4} ${h * .4} 0 0 1 ${w * .9} ${h * .3}`, 'detalhe fino') + _t(w * .74, 10, '%', 9) + _l(w * .14, 2, w * .14, h * .28) + _l(w * .44, 2, w * .44, h * .28) + _l(w * .14, h * .72, w * .14, h - 2) + _l(w * .44, h * .72, w * .44, h - 2) },
    comporta_fumigacao: { nome: 'Comporta de fumigação (vedação)', grupo: 'Fluxo de material', w: 70, h: 50, equip: true, kit: Object.assign(K.abreFecha('Fechar para fumigação'), { tags: [{ s: 'aberta', tipo: 'estado', nome: 'Aberta (fim de curso)' }, { s: 'tempo', tipo: 'generico', nome: 'Tempo de fumigação', un: 'h', dec: 0, faixa: [0, 240] }] }),
        svg: (w, h) => _r(4, h * .28, w * .6, h * .44) + _l(4, h * .5, w * .64, h * .5, 'detalhe grosso') + _r(w * .68, h * .3, w * .28, h * .4) + _t(w * .82, h * .58, 'F', 10) },
    desviadora_2: { nome: 'Válvula desviadora 2 vias (Y)', grupo: 'Fluxo de material', w: 70, h: 80, equip: true, kit: Object.assign(K.saidaN(), { fixoN: 2 }),
        svg: (w, h) => _p(`M${w * .38} 2 H${w * .62} V${h * .35} L${w - 4} ${h - 6} H${w * .7} L${w / 2} ${h * .55} L${w * .3} ${h - 6} H4 L${w * .38} ${h * .35} Z`) + _l(w / 2, h * .36, w * .28, h * .7, 'detalhe grosso') + _c(w / 2, h * .36, 3, 'detalhe') + _r(w * .64, h * .18, w * .32, h * .16) + _t(w * .8, h * .3, 'M', 9) },
    desvio_rapido: { nome: 'Válvula de desvio rápido', grupo: 'Fluxo de material', w: 70, h: 80, equip: true, kit: Object.assign(K.saidaN(), { fixoN: 2 }),
        svg: (w, h) => _p(`M${w * .38} 2 H${w * .62} V${h * .35} L${w - 4} ${h - 6} H${w * .7} L${w / 2} ${h * .55} L${w * .3} ${h - 6} H4 L${w * .38} ${h * .35} Z`) + _l(w / 2, h * .36, w * .72, h * .7, 'detalhe grosso') + _r(w * .64, h * .18, w * .32, h * .16) + _t(w * .8, h * .3, 'P', 9) + _p(`M${w * .1} ${h * .2} l6 -6 l0 12 l6 -6`, 'detalhe fino') },
    distribuidor_n: { nome: 'Distribuidor rotativo (N saídas)', grupo: 'Fluxo de material', w: 140, h: 110, equip: true, n: 4, kit: K.saidaN(),
        svg: (w, h, el) => _r(w * .42, 2, w * .16, h * .14) + _p(`M${w * .25} ${h * .16} H${w * .75} L${w * .85} ${h * .5} H${w * .15} Z`) + _c(w / 2, h * .33, h * .1, 'detalhe') + _l(w / 2, h * .33, w * .62, h * .44, 'detalhe grosso') + _saidas(w, h, nSaidas(el, SIMBOLOS_V2.distribuidor_n), h * .5, h * .34) },
    selecionador_n: { nome: 'Selecionador linear (N saídas)', grupo: 'Fluxo de material', w: 200, h: 80, equip: true, n: 5, kit: K.saidaN(),
        svg: (w, h, el) => _r(w * .44, 2, w * .12, h * .16) + _r(4, h * .18, w - 8, h * .3) + _l(10, h * .33, w - 10, h * .33, 'detalhe fino') + _r(w * .46, h * .22, w * .08, h * .22, 'detalhe') + _saidas(w, h, nSaidas(el, SIMBOLOS_V2.selecionador_n), h * .48, h * .36) },
    valvula_rotativa: { nome: 'Válvula rotativa (eclusa)', grupo: 'Fluxo de material', w: 60, h: 70, equip: true, kit: K.motor(0.5, 1.5),
        svg: (w, h) => _r(w * .3, 2, w * .4, h * .16) + _c(w / 2, h / 2, w * .34) + [0, 45, 90, 135].map(a => `<path class="detalhe" transform="rotate(${a} ${w / 2} ${h / 2})" d="M${w * .18} ${h / 2} H${w * .82}"/>`).join('') + _r(w * .3, h - 13, w * .4, 11) },
    bica_telescopica: { nome: 'Bica de carregamento telescópica', grupo: 'Fluxo de material', w: 60, h: 130, equip: true, kit: K.so('estado', 'Bica baixada', 'baixada'),
        svg: (w, h) => _r(w * .3, 2, w * .4, h * .2) + _r(w * .26, h * .22, w * .48, h * .22) + _r(w * .22, h * .44, w * .56, h * .22) + _p(`M${w * .18} ${h * .66} H${w * .82} L${w * .7} ${h - 4} H${w * .3} Z`) },
    calha_vibratoria: { nome: 'Calha / alimentador vibratório', grupo: 'Fluxo de material', w: 150, h: 50, equip: true, kit: K.posicao('Velocidade da calha'),
        svg: (w, h) => _p(`M4 ${h * .2} L${w - 8} ${h * .45} V${h * .62} L4 ${h * .4} Z`) + _p(`M${w * .3} ${h * .55} l4 8 l4 -8 l4 8 l4 -8`, 'detalhe fino') + _r(w * .58, h * .66, w * .18, h * .26) },
    // ===== Ar e segurança
    ventilador_centrifugo: { nome: 'Ventilador centrífugo', grupo: 'Ar e proteção', w: 90, h: 80, equip: true, kit: K.motor(4, 15, [{ s: 'pressao', tipo: 'pressao', nome: 'Pressão estática', un: 'Pa', faixa: [0, 3000], dec: 0 }]),
        svg: (w, h) => _p(`M${w * .45} ${h * .12} a${h * .38} ${h * .38} 0 1 0 ${h * .38} ${h * .38} V${h * .12} Z`) + _r(w * .45 + h * .38 - 2, 2, 22, h * .14) + _c(w * .45, h * .5, h * .14, 'detalhe') + _l(w * .45, h * .5, w * .45 + 8, h * .4) + _l(w * .18, h * .9, w * .72, h * .9) },
    exaustor_axial: { nome: 'Exaustor axial', grupo: 'Ar e proteção', w: 70, h: 70, equip: true, kit: K.motor(2, 8),
        svg: (w, h) => _r(4, 4, w - 8, h - 8, 'corpo', 4) + _c(w / 2, h / 2, w * .32, 'detalhe') + `<g class="helice-gira" style="transform-origin:${w / 2}px ${h / 2}px">${[0, 90, 180, 270].map(a => `<path class="pa" transform="rotate(${a} ${w / 2} ${h / 2})" d="M${w / 2} ${h / 2} q8 -6 2 -${w * .28} q-8 6 -2 ${w * .28} Z"/>`).join('')}</g>` },
    registro_borboleta_ar: { nome: 'Registro de ar borboleta (damper)', grupo: 'Ar e proteção', w: 60, h: 50, equip: true, kit: K.posicao('Abertura do registro'),
        svg: (w, h) => _r(4, h * .2, w - 8, h * .6, 'corpo duto', 2) + _c(w / 2, h / 2, 3, 'detalhe') + _l(w * .3, h * .76, w * .7, h * .24, 'detalhe grosso') },
    guilhotina_ar: { nome: 'Guilhotina de ar (gaveta no duto)', grupo: 'Ar e proteção', w: 70, h: 60, equip: true, kit: K.abreFecha('Abrir guilhotina de ar'),
        svg: (w, h) => _r(4, h * .3, w - 8, h * .5, 'corpo duto', 2) + _r(w * .44, 4, w * .12, h * .62, 'corpo') + _l(w * .5, h * .66, w * .5, h * .78, 'detalhe') + _r(w * .36, 0, w * .28, 8, 'detalhe', 1) },
    damper_motorizado: { nome: 'Registro de ar motorizado', grupo: 'Ar e proteção', w: 80, h: 60, equip: true, kit: K.posicao('Abertura do registro'),
        svg: (w, h) => _r(4, h * .35, w * .62, h * .5, 'corpo duto', 2) + _l(w * .18, h * .78, w * .52, h * .42, 'detalhe grosso') + _l(w * .35, h * .6, w * .35, h * .2) + _c(w * .35, h * .15, h * .12) + _t(w * .35, h * .15 + 4, 'M', 9) },
    ciclone: { nome: 'Ciclone', grupo: 'Ar e proteção', w: 70, h: 140,
        svg: (w, h) => _r(w * .35, 2, w * .3, h * .1) + _p(`M8 ${h * .12} H${w - 8} V${h * .4} L${w * .58} ${h * .86} H${w * .42} L8 ${h * .4} Z`) + _p(`M${w - 8} ${h * .18} H${w}`, 'detalhe') + _r(w * .42, h * .86, w * .16, h * .1) },
    filtro_mangas: { nome: 'Filtro de mangas', grupo: 'Ar e proteção', w: 100, h: 160, equip: true,
        kit: { tags: [{ s: 'dp', tipo: 'pressao', nome: 'Pressão diferencial', un: 'Pa', faixa: [0, 2500], dec: 0, lim: { h: 1500, hh: 2000, atrasoS: 60, histerese: 50 } }], cmds: [{ s: 'limpeza', tipo: 'botao', nome: 'Limpeza das mangas', payloadLiga: '1' }], mostrar: ['dp'] },
        svg: (w, h) => _r(6, 6, w - 12, h * .55) + [.25, .4, .55, .7].map(f => _r(w * f - 4, h * .1, 8, h * .44, 'detalhe', 3)).join('') + _p(`M6 ${h * .61} H${w - 6} L${w * .6} ${h * .86} H${w * .4} Z`) + _r(w * .42, h * .86, w * .16, h * .1) + _r(w * .2, 0, w * .6, 6, 'detalhe', 1) },
    alivio_explosao: { nome: 'Válvula de alívio de explosão (painel)', grupo: 'Ar e proteção', w: 60, h: 60, equip: true, kit: K.so('estado', 'Painel rompido', 'rompido', { lim: { h: 0.5, atrasoS: 0, prioridadeAvisos: 1 } }),
        svg: (w, h) => _r(4, h * .45, w - 8, h * .2) + _p(`M${w * .2} ${h * .45} L${w * .5} ${h * .12} L${w * .8} ${h * .45}`, 'detalhe') + _p(`M${w * .45} ${h * .24} l5 -8 l-3 8 l6 -6`, 'detalhe fino') },
    valvula_isolamento: { nome: 'Válvula de isolamento de explosão', grupo: 'Ar e proteção', w: 70, h: 50, equip: true, kit: K.so('estado', 'Válvula fechada (disparo)', 'disparo', { lim: { h: 0.5, atrasoS: 0, prioridadeAvisos: 1 } }),
        svg: (w, h) => _r(4, h * .25, w - 8, h * .5, 'corpo duto', 2) + _p(`M${w * .45} ${h * .25} L${w * .62} ${h * .75}`, 'detalhe grosso') + _c(w * .45, h * .25, 3, 'detalhe') + _t(w * .2, h * .58, 'Ex', 9) },
    gaveta_deslizante: { nome: 'Válvula de gaveta deslizante (Ex)', grupo: 'Ar e proteção', w: 80, h: 50, equip: true, kit: K.abreFecha('Abrir gaveta'),
        svg: (w, h) => _r(4, h * .3, w * .55, h * .4, 'corpo duto', 2) + _r(w * .26, h * .1, w * .1, h * .8) + _r(w * .62, h * .34, w * .34, h * .32) + _t(w * .79, h * .58, 'Ex', 9) },
    ventilacao_sem_chama: { nome: 'Dispositivo de ventilação sem chama', grupo: 'Ar e proteção', w: 70, h: 60,
        svg: (w, h) => _r(4, h * .55, w - 8, h * .16) + _r(w * .15, h * .15, w * .7, h * .4, 'corpo', 3) + [.25, .4, .55, .7].map(f => _l(w * f, h * .2, w * f, h * .5, 'detalhe fino')).join('') },
    supressao: { nome: 'Cilindro de supressão de explosão', grupo: 'Ar e proteção', w: 40, h: 90, equip: true, kit: K.so('pressao', 'Pressão do cilindro', 'pressao', { un: 'bar', faixa: [0, 120], lim: { l: 50, atrasoS: 60, histerese: 2 } }),
        svg: (w, h) => _p(`M${w * .2} ${h * .2} Q${w / 2} 4 ${w * .8} ${h * .2} V${h - 6} H${w * .2} Z`) + _r(w * .4, 0, w * .2, 8, 'detalhe', 1) + _t(w / 2, h * .62, 'S', 11) },
    // ===== Elétrica e automação
    transformador: { nome: 'Subestação / transformador', grupo: 'Elétrica e automação', w: 80, h: 100, equip: true,
        kit: { tags: [{ s: 'tensao', tipo: 'tensao', nome: 'Tensão secundária' }, { s: 'potencia', tipo: 'potencia', nome: 'Potência ativa', faixa: [0, 500] }, { s: 'temp_oleo', tipo: 'temperatura', nome: 'Temperatura do óleo', faixa: [20, 120], lim: { h: 85, hh: 95, atrasoS: 60, histerese: 2 } }], mostrar: ['potencia'] },
        svg: (w, h) => _c(w / 2, h * .32, w * .26) + _c(w / 2, h * .62, w * .26) + _l(w / 2, 2, w / 2, h * .32 - w * .26) + _l(w / 2, h * .62 + w * .26, w / 2, h - 2) },
    qgbt: { nome: 'Quadro geral de baixa tensão (medição)', grupo: 'Elétrica e automação', w: 80, h: 110, equip: true,
        kit: { tags: [{ s: 'tensao', tipo: 'tensao', nome: 'Tensão de linha', lim: { l: 361, h: 418, atrasoS: 20, histerese: 2 } }, { s: 'corrente', tipo: 'corrente', nome: 'Corrente', faixa: [0, 400] }, { s: 'fp', tipo: 'fp', nome: 'Fator de potência', lim: { l: 0.92, atrasoS: 300, histerese: 0.01 } }, { s: 'potencia', tipo: 'potencia', nome: 'Potência ativa', faixa: [0, 300] }, { s: 'frequencia', tipo: 'frequencia', nome: 'Frequência' }, { s: 'energia', tipo: 'energia', nome: 'Energia (medidor)', faixa: [0, 1e6] }], mostrar: ['potencia', 'fp'] },
        svg: (w, h) => _r(4, 4, w - 8, h - 8) + _l(w / 2, 8, w / 2, h - 8, 'detalhe fino') + _r(w * .15, h * .12, w * .28, h * .14, 'detalhe', 1) + _p(`M${w * .7} ${h * .3} L${w * .6} ${h * .5} H${w * .72} L${w * .62} ${h * .7}`, 'detalhe') },
    inversor: { nome: 'Inversor de frequência', grupo: 'Elétrica e automação', w: 60, h: 80, equip: true,
        kit: { tags: [{ s: 'frequencia', tipo: 'frequencia', nome: 'Frequência de saída', faixa: [0, 70] }, { s: 'corrente', tipo: 'corrente', nome: 'Corrente de saída' }, { s: 'falha', tipo: 'estado', nome: 'Falha do inversor', lim: { h: 0.5, atrasoS: 0, prioridadeAvisos: 2 } }], cmds: [{ s: 'cmd', tipo: 'chave', nome: 'Partir' }, { s: 'sp_freq', tipo: 'setpoint', nome: 'Frequência', min: 0, max: 60, passo: 0.5, unidade: 'Hz' }], mostrar: ['frequencia'] },
        svg: (w, h) => _r(4, 4, w - 8, h - 8, 'corpo', 3) + _r(w * .2, h * .12, w * .6, h * .22, 'detalhe', 1) + _t(w / 2, h * .62, '~/≈', 12) },
    clp: { nome: 'Painel de automação (CLP)', grupo: 'Elétrica e automação', w: 70, h: 100, equip: true, kit: K.so('estado', 'Comunicação OK', 'comunicacao', { lim: { l: 0.5, atrasoS: 30, prioridadeAvisos: 2 } }),
        svg: (w, h) => _r(4, 4, w - 8, h - 8) + [0, 1, 2, 3].map(i => _r(w * .16 + i * w * .17, h * .14, w * .13, h * .3, 'detalhe', 1)).join('') + _t(w / 2, h * .74, 'CLP', 11) },
    ihm: { nome: 'IHM / supervisório', grupo: 'Elétrica e automação', w: 80, h: 70,
        svg: (w, h) => _r(4, 4, w - 8, h * .68, 'corpo', 3) + _r(w * .12, h * .12, w * .76, h * .5, 'detalhe', 1) + _l(w / 2, h * .72, w / 2, h - 8) + _l(w * .3, h - 6, w * .7, h - 6) },
    quadro_comando: { nome: 'Quadro de comando (CCM)', grupo: 'Elétrica e automação', w: 90, h: 120, equip: true, kit: K.so('estado', 'Energizado', 'energizado'),
        svg: (w, h) => _r(4, 4, w - 8, h - 8) + [.2, .4, .6, .8].map(f => _r(w * .12, h * f - 8, w * .76, h * .14, 'detalhe', 1)).join('') },
    // ===== Sensores (um tipo de variável cada, tópico e unidade pré-preenchidos)
    sensor_temperatura: { nome: 'Sensor de temperatura', grupo: 'Sensores', w: 40, h: 40, sensor: 'temperatura', sigla: 'TT' },
    sensor_umidade: { nome: 'Sensor de umidade relativa', grupo: 'Sensores', w: 40, h: 40, sensor: 'umidade', sigla: 'MT' },
    sensor_umidade_grao: { nome: 'Medidor de umidade do grão', grupo: 'Sensores', w: 40, h: 40, sensor: 'umidade_grao', sigla: 'MT' },
    sensor_co2: { nome: 'Sensor de CO₂', grupo: 'Sensores', w: 40, h: 40, sensor: 'co2', sigla: 'AT' },
    sensor_pressao: { nome: 'Transmissor de pressão', grupo: 'Sensores', w: 40, h: 40, sensor: 'pressao', sigla: 'PT' },
    sensor_vazao: { nome: 'Medidor de vazão', grupo: 'Sensores', w: 40, h: 40, sensor: 'vazao', sigla: 'FT' },
    sensor_nivel: { nome: 'Sensor de nível contínuo', grupo: 'Sensores', w: 40, h: 40, sensor: 'nivel', sigla: 'LT' },
    sensor_nivel_pa: { nome: 'Chave de nível (pá rotativa)', grupo: 'Sensores', w: 40, h: 40, sensor: 'estado', sigla: 'LS', nomeTag: 'Nível alto (chave)' },
    sensor_peso: { nome: 'Célula de carga', grupo: 'Sensores', w: 40, h: 40, sensor: 'peso', sigla: 'WT' },
    sensor_rotacao: { nome: 'Sensor de rotação (velocidade zero)', grupo: 'Sensores', w: 40, h: 40, sensor: 'rotacao', sigla: 'SS' },
    sensor_desalinhamento: { nome: 'Sensor de desalinhamento / inclinação', grupo: 'Sensores', w: 40, h: 40, sensor: 'estado', sigla: 'ZS', nomeTag: 'Desalinhamento' },
    sensor_vibracao: { nome: 'Sensor de vibração', grupo: 'Sensores', w: 40, h: 40, sensor: 'aceleracao', sigla: 'VT', un: 'mm/s' },
    sensor_mancal: { nome: 'Temperatura de mancal', grupo: 'Sensores', w: 40, h: 40, sensor: 'temperatura', sigla: 'TT', nomeTag: 'Temperatura do mancal', lim: { h: 70, hh: 85, atrasoS: 10, histerese: 2 } },
    sensor_optico: { nome: 'Sensor óptico (presença)', grupo: 'Sensores', w: 40, h: 40, sensor: 'estado', sigla: 'XS', nomeTag: 'Presença' },
    sensor_corrente: { nome: 'Transformador de corrente (TC)', grupo: 'Sensores', w: 40, h: 40, sensor: 'corrente', sigla: 'IT' },
    sensor_tensao: { nome: 'Medidor de tensão', grupo: 'Sensores', w: 40, h: 40, sensor: 'tensao', sigla: 'ET' },
    sensor_potencia: { nome: 'Medidor de potência / energia', grupo: 'Sensores', w: 40, h: 40, sensor: 'potencia', sigla: 'JT' },
    sensor_termometria: { nome: 'Cabo de termometria', grupo: 'Sensores', w: 30, h: 120, sensor: 'temperatura', sigla: 'TT', nomeTag: 'Termometria (máx.)',
        svg: (w, h) => _l(w / 2, 4, w / 2, h - 4, 'cabo') + [.2, .4, .6, .8].map(f => _c(w / 2, h * f, 4, 'bolha')).join('') },
    sensor_generico: { nome: 'Sensor (outro)', grupo: 'Sensores', w: 40, h: 40, sensor: 'generico', sigla: 'XT' },
    // ===== Comandos e botões (pré-preenchidos; clique no símbolo em modo edição para mudar o tópico)
    botoeira: { nome: 'Botoeira liga/desliga', grupo: 'Comandos e botões', w: 70, h: 90, comando: 'chave',
        svg: (w, h) => _r(4, 4, w - 8, h - 8, 'corpo', 4) + _c(w / 2, h * .33, h * .13, 'botao-liga') + _t(w / 2, h * .33 + 4, 'I', 11) + _c(w / 2, h * .7, h * .13, 'botao-desliga') + _t(w / 2, h * .7 + 4, 'O', 11) },
    botao_pulso: { nome: 'Botão (pulso)', grupo: 'Comandos e botões', w: 56, h: 56, comando: 'botao',
        svg: (w, h) => _r(4, 4, w - 8, h - 8, 'corpo', 4) + _c(w / 2, h / 2, w * .28, 'botao-liga') },
    emergencia: { nome: 'Botão de emergência', grupo: 'Comandos e botões', w: 60, h: 60, entrada: { tipo: 'estado', nome: 'Emergência acionada', lim: { h: 0.5, atrasoS: 0, prioridadeAvisos: 1 } },
        svg: (w, h) => _r(4, 4, w - 8, h - 8, 'corpo emerg-fundo', 4) + _c(w / 2, h / 2, w * .3, 'emerg') + _p(`M${w * .3} ${h * .5} H${w * .7}`, 'detalhe fino') },
    seletor: { nome: 'Chave seletora manual/automático', grupo: 'Comandos e botões', w: 70, h: 60, comando: 'chave', payloads: ['auto', 'manual'], nomeCmd: 'Modo automático',
        svg: (w, h) => _r(4, 4, w - 8, h - 8, 'corpo', 4) + _c(w / 2, h * .55, h * .2) + _l(w / 2, h * .55, w * .62, h * .35, 'detalhe grosso') + _t(w * .22, h * .3, 'M', 9) + _t(w * .78, h * .3, 'A', 9) },
    sinaleiro: { nome: 'Sinaleiro (lâmpada de estado)', grupo: 'Comandos e botões', w: 44, h: 44, entrada: { tipo: 'estado', nome: 'Sinaleiro' },
        svg: (w, h) => _c(w / 2, h / 2, w * .4, 'lampada') + _l(w * .25, h * .25, w * .75, h * .75, 'detalhe fino') + _l(w * .75, h * .25, w * .25, h * .75, 'detalhe fino') },
    // ===== P&ID — válvulas (ISA 5.1)
    v_gaveta: { nome: 'Válvula gaveta', grupo: 'P&ID — válvulas', w: 50, h: 30, svg: (w, h) => _valv(w / 2, h / 2, w * .4, h * .4) },
    v_globo: { nome: 'Válvula globo', grupo: 'P&ID — válvulas', w: 50, h: 30, svg: (w, h) => _valv(w / 2, h / 2, w * .4, h * .4) + `<circle class="detalhe cheio" cx="${w / 2}" cy="${h / 2}" r="${h * .14}"/>` },
    v_esfera: { nome: 'Válvula esfera', grupo: 'P&ID — válvulas', w: 50, h: 30, svg: (w, h) => _valv(w / 2, h / 2, w * .4, h * .4) + _c(w / 2, h / 2, h * .2, 'bolha') },
    v_borboleta: { nome: 'Válvula borboleta', grupo: 'P&ID — válvulas', w: 50, h: 34, svg: (w, h) => _l(w * .1, h * .1, w * .1, h * .9) + _l(w * .9, h * .1, w * .9, h * .9) + _l(w * .1, h / 2, w * .9, h / 2) + _l(w * .3, h * .8, w * .7, h * .2, 'detalhe grosso') + _c(w / 2, h / 2, 2.5, 'detalhe') },
    v_retencao: { nome: 'Válvula de retenção', grupo: 'P&ID — válvulas', w: 50, h: 30, svg: (w, h) => _p(`M${w * .1} ${h * .1} L${w * .5} ${h / 2} L${w * .1} ${h * .9} Z`) + _l(w * .5, h * .1, w * .5, h * .9, 'detalhe grosso') + _p(`M${w * .58} ${h * .1} L${w * .9} ${h / 2} L${w * .58} ${h * .9}`, 'detalhe fino') },
    v_tres_vias: { nome: 'Válvula 3 vias', grupo: 'P&ID — válvulas', w: 50, h: 46, svg: (w, h) => _valv(w / 2, h * .35, w * .4, h * .26) + _p(`M${w / 2} ${h * .35} L${w * .3} ${h * .92} H${w * .7} Z`) },
    v_agulha: { nome: 'Válvula agulha', grupo: 'P&ID — válvulas', w: 50, h: 40, svg: (w, h) => _valv(w / 2, h * .6, w * .4, h * .3) + _p(`M${w / 2} ${h * .6} L${w * .42} ${h * .12} H${w * .58} Z`, 'detalhe') },
    v_alivio: { nome: 'Válvula de alívio / segurança (PSV)', grupo: 'P&ID — válvulas', w: 46, h: 60, equip: true, kit: K.so('estado', 'Abertura da PSV', 'aberta', { lim: { h: 0.5, atrasoS: 0, prioridadeAvisos: 2 } }),
        svg: (w, h) => _p(`M${w * .15} ${h * .75} L${w * .5} ${h * .58} L${w * .15} ${h * .95} Z`) + _p(`M${w * .5} ${h * .58} L${w * .85} ${h * .4} L${w * .85} ${h * .75} Z`) + _p(`M${w * .5} ${h * .58} V${h * .45} l-6 -4 l12 -6 l-12 -6 l12 -6 l-6 -4`, 'detalhe') },
    v_controle: { nome: 'Válvula de controle (atuador diafragma)', grupo: 'P&ID — válvulas', w: 50, h: 60, equip: true, kit: K.posicao('Posição da válvula'),
        svg: (w, h) => _valv(w / 2, h * .75, w * .4, h * .2) + _haste(w / 2, h * .75, h * .3) + _p(`M${w * .18} ${h * .3} A${w * .32} ${h * .26} 0 0 1 ${w * .82} ${h * .3} Z`) },
    v_solenoide: { nome: 'Válvula solenoide (liga/desliga)', grupo: 'P&ID — válvulas', w: 50, h: 60, equip: true, kit: K.abreFecha('Abrir válvula'),
        svg: (w, h) => _valv(w / 2, h * .75, w * .4, h * .2) + _haste(w / 2, h * .75, h * .36) + _r(w * .3, h * .1, w * .4, h * .26) + _t(w / 2, h * .29, 'S', 10) },
    v_motorizada: { nome: 'Válvula motorizada', grupo: 'P&ID — válvulas', w: 50, h: 60, equip: true, kit: K.abreFecha('Abrir válvula'),
        svg: (w, h) => _valv(w / 2, h * .75, w * .4, h * .2) + _haste(w / 2, h * .75, h * .38) + _c(w / 2, h * .24, h * .16) + _t(w / 2, h * .28, 'M', 10) },
    v_pneumatica: { nome: 'Válvula com atuador pneumático (on/off)', grupo: 'P&ID — válvulas', w: 50, h: 60, equip: true, kit: K.abreFecha('Abrir válvula'),
        svg: (w, h) => _valv(w / 2, h * .75, w * .4, h * .2) + _haste(w / 2, h * .75, h * .36) + _r(w * .22, h * .1, w * .56, h * .26) + _l(w * .22, h * .23, w * .78, h * .23, 'detalhe fino') },
    v_redutora: { nome: 'Válvula redutora de pressão', grupo: 'P&ID — válvulas', w: 50, h: 56, svg: (w, h) => _valv(w / 2, h * .72, w * .4, h * .2) + _haste(w / 2, h * .72, h * .4) + _p(`M${w * .25} ${h * .4} H${w * .75} L${w / 2} ${h * .14} Z`) + _l(w * .7, h * .52, w * .9, h * .52, 'detalhe fino') },
    // ===== P&ID — equipamentos
    pid_bomba: { nome: 'Bomba centrífuga', grupo: 'P&ID — equipamentos', w: 60, h: 56, equip: true, kit: K.motor(2, 8),
        svg: (w, h) => _c(w * .45, h * .45, h * .34) + _l(w * .45, h * .11, w - 4, h * .11) + _p(`M${w * .2} ${h - 4} L${w * .3} ${h * .7} M${w * .7} ${h - 4} L${w * .6} ${h * .7} M${w * .15} ${h - 4} H${w * .75}`, 'detalhe') },
    pid_bomba_dp: { nome: 'Bomba de deslocamento positivo', grupo: 'P&ID — equipamentos', w: 60, h: 56, equip: true, kit: K.motor(2, 8),
        svg: (w, h) => _c(w / 2, h * .45, h * .34) + _c(w / 2, h * .45, h * .14, 'detalhe') + _l(4, h * .45, w * .5 - h * .34, h * .45) + _l(w * .5 + h * .34, h * .45, w - 4, h * .45) },
    pid_compressor: { nome: 'Compressor', grupo: 'P&ID — equipamentos', w: 60, h: 56, equip: true, kit: K.motor(5, 20, [{ s: 'pressao', tipo: 'pressao', nome: 'Pressão de descarga', un: 'bar', faixa: [0, 12] }]),
        svg: (w, h) => _c(w / 2, h / 2, h * .4) + _l(w * .5 - h * .32, h * .26, w * .5 + h * .32, h * .38) + _l(w * .5 - h * .32, h * .74, w * .5 + h * .32, h * .62) },
    pid_trocador: { nome: 'Trocador de calor', grupo: 'P&ID — equipamentos', w: 70, h: 70, equip: true,
        kit: { tags: [{ s: 't_entrada', tipo: 'temperatura', nome: 'Temperatura de entrada' }, { s: 't_saida', tipo: 'temperatura', nome: 'Temperatura de saída' }], mostrar: ['t_saida'] },
        svg: (w, h) => _c(w / 2, h / 2, w * .4) + _p(`M4 ${h / 2} H${w * .22} L${w * .32} ${h * .3} L${w * .44} ${h * .7} L${w * .56} ${h * .3} L${w * .68} ${h * .7} L${w * .78} ${h / 2} H${w - 4}`, 'detalhe') },
    pid_vaso: { nome: 'Vaso de pressão', grupo: 'P&ID — equipamentos', w: 60, h: 130, equip: true, kit: K.so('pressao', 'Pressão do vaso', 'pressao', { un: 'bar', faixa: [0, 16] }),
        svg: (w, h) => _r(6, 4, w - 12, h - 8, 'corpo', w * .4) },
    pid_tanque: { nome: 'Tanque atmosférico', grupo: 'P&ID — equipamentos', w: 90, h: 110, equip: true, kit: Object.assign(K.so('nivel', 'Nível do tanque', 'nivel'), { nivel: 'nivel' }),
        svg: (w, h) => _p(`M4 ${h * .14} L${w / 2} 4 L${w - 4} ${h * .14} V${h - 4} H4 Z`) },
    pid_filtro_y: { nome: 'Filtro Y', grupo: 'P&ID — equipamentos', w: 50, h: 40, svg: (w, h) => _l(2, h * .3, w - 2, h * .3) + _p(`M${w * .3} ${h * .3} L${w * .6} ${h * .9} H${w * .75} L${w * .5} ${h * .3}`) },
    pid_orificio: { nome: 'Placa de orifício', grupo: 'P&ID — equipamentos', w: 50, h: 40, equip: true, kit: K.so('vazao', 'Vazão', 'vazao', { un: 'm³/h' }),
        svg: (w, h) => _l(2, h / 2, w - 2, h / 2) + _l(w * .45, h * .1, w * .45, h * .9, 'detalhe grosso') + _l(w * .55, h * .1, w * .55, h * .9, 'detalhe grosso') },
    pid_rotametro: { nome: 'Rotâmetro', grupo: 'P&ID — equipamentos', w: 30, h: 60, svg: (w, h) => _p(`M${w * .3} ${h - 4} L${w * .15} 4 H${w * .85} L${w * .7} ${h - 4} Z`) + _c(w / 2, h * .55, 4, 'detalhe') },
    pid_purgador: { nome: 'Purgador', grupo: 'P&ID — equipamentos', w: 40, h: 40, svg: (w, h) => _r(4, 4, w - 8, h - 8, 'corpo', 3) + _t(w / 2, h * .62, 'T', 12) },
    pid_flange_cego: { nome: 'Flange cego / raquete', grupo: 'P&ID — equipamentos', w: 40, h: 40, svg: (w, h) => _l(2, h / 2, w * .45, h / 2) + _l(w * .45, h * .15, w * .45, h * .85, 'detalhe grosso') + _l(w * .55, h * .15, w * .55, h * .85, 'detalhe grosso') },
    pid_redutor: { nome: 'Redução concêntrica', grupo: 'P&ID — equipamentos', w: 40, h: 30, svg: (w, h) => _p(`M4 4 L${w - 4} ${h * .3} V${h * .7} L4 ${h - 4} Z`) },
    // ===== P&ID — instrumentos (bolhas ISA 5.1; letras e número editáveis)
    pid_inst_campo: { nome: 'Instrumento de campo (bolha)', grupo: 'P&ID — instrumentos', w: 46, h: 46, instrumento: 'campo' },
    pid_inst_painel: { nome: 'Instrumento no painel (bolha com traço)', grupo: 'P&ID — instrumentos', w: 46, h: 46, instrumento: 'painel' },
    pid_inst_clp: { nome: 'Função no CLP / SDCD (bolha no quadrado)', grupo: 'P&ID — instrumentos', w: 46, h: 46, instrumento: 'clp' },
    pid_inst_software: { nome: 'Função de software (hexágono)', grupo: 'P&ID — instrumentos', w: 50, h: 46, instrumento: 'software' },
    pid_intertravamento: { nome: 'Intertravamento (losango)', grupo: 'P&ID — instrumentos', w: 46, h: 46, instrumento: 'intertravamento' }
};

/** Primeira letra da ISA 5.1 → tipo de variável (para o kit das bolhas). */
const ISA_LETRA = { T: 'temperatura', P: 'pressao', F: 'vazao', L: 'nivel', W: 'peso', M: 'umidade', A: 'co2', S: 'rotacao', V: 'aceleracao', J: 'potencia', E: 'tensao', I: 'corrente', Z: 'percentual', H: 'estado', X: 'generico', Q: 'energia' };

/** Desenho da bolha de instrumento conforme o tipo. */
function svgInstrumento(w, h, tipo, codigo, numero) {
    const r = Math.min(w, h) / 2 - 2, cx = w / 2, cy = h / 2;
    let forma = _c(cx, cy, r, 'bolha');
    if (tipo === 'painel') forma += _l(cx - r, cy, cx + r, cy, 'detalhe fino');
    if (tipo === 'clp') forma = `<rect class="bolha" x="${cx - r}" y="${cy - r}" width="${2 * r}" height="${2 * r}"/>` + _c(cx, cy, r, 'bolha') + _l(cx - r, cy, cx + r, cy, 'detalhe fino');
    if (tipo === 'software') forma = `<path class="bolha" d="M${cx - r} ${cy} L${cx - r / 2} ${cy - r} H${cx + r / 2} L${cx + r} ${cy} L${cx + r / 2} ${cy + r} H${cx - r / 2} Z"/>` + _l(cx - r, cy, cx + r, cy, 'detalhe fino');
    if (tipo === 'intertravamento') forma = `<path class="bolha" d="M${cx} ${cy - r} L${cx + r} ${cy} L${cx} ${cy + r} L${cx - r} ${cy} Z"/>`;
    const sup = tipo === 'campo' || tipo === 'intertravamento' ? cy - 1 : cy - 3, inf = cy + 11;
    return forma + `<text class="sensor-sigla" x="${cx}" y="${sup}" text-anchor="middle">${esc(codigo || 'TT')}</text><text class="sin-letra" x="${cx}" y="${inf}" text-anchor="middle" style="font-size:9px">${esc(numero || '')}</text>`;
}

// grupos e reorganização dos símbolos que já existiam
const GRUPOS_V2 = ['Recebimento e caminhões', 'Balanças', 'Beneficiamento de arroz', 'Secagem', 'Transporte', 'Fluxo de material', 'Ar e proteção', 'Armazenagem',
    'Frio', 'Elétrica e automação', 'Sensores', 'Comandos e botões', 'P&ID — válvulas', 'P&ID — equipamentos', 'P&ID — instrumentos', 'Indicadores', 'Ligações'];
(function integrar() {
    const regrupar = { moega: 'Recebimento e caminhões', balanca: 'Balanças', prelimpeza: 'Beneficiamento de arroz', motor: 'Elétrica e automação', painel: 'Elétrica e automação',
        estacao: 'Sensores', sensor: 'Sensores', bomba: 'P&ID — equipamentos', valvula: 'P&ID — válvulas', tanque: 'P&ID — equipamentos', chave: 'Comandos e botões', setpoint: 'Comandos e botões' };
    Object.entries(regrupar).forEach(([k, g]) => { if (SIMBOLOS[k]) SIMBOLOS[k].grupo = g; });
    if (SIMBOLOS.valvula) SIMBOLOS.valvula.nome = 'Válvula / registro (genérica)';
    if (SIMBOLOS.balanca) SIMBOLOS.balanca.nome = 'Balança rodoviária';
    // kits dos símbolos antigos
    const kits = {
        elevador: K.motor(3, 9, [{ s: 'rotacao', tipo: 'rotacao', nome: 'Rotação do pé (velocidade zero)', faixa: [0, 120], lim: { l: 20, atrasoS: 5, histerese: 2 } }, { s: 'desalinhamento', tipo: 'estado', nome: 'Desalinhamento da correia', lim: { h: 0.5, atrasoS: 2, prioridadeAvisos: 2 } }]),
        transportador: K.motor(2, 6), rosca: K.motor(1.5, 4), correia: K.motor(2, 6, [{ s: 'desalinhamento', tipo: 'estado', nome: 'Desalinhamento da correia', lim: { h: 0.5, atrasoS: 2, prioridadeAvisos: 2 } }]),
        ventilador: K.motor(5, 14, [{ s: 'pressao', tipo: 'pressao', nome: 'Pressão estática', un: 'Pa', faixa: [0, 3000], dec: 0 }]),
        motor: K.motor(2, 8), bomba: K.motor(2, 8), compressor: K.motor(4, 11), evaporador: K.motor(0.5, 1.5), prelimpeza: K.motor(2.5, 6),
        silo: { tags: [{ s: 'temp_max', tipo: 'temperatura', nome: 'Temperatura do grão (máx.)', faixa: [10, 40], lim: { h: 28, hh: 32, atrasoS: 300, histerese: 0.5 } }, { s: 'temp_media', tipo: 'temperatura', nome: 'Temperatura média', faixa: [10, 40] }, { s: 'nivel', tipo: 'nivel', nome: 'Nível', lim: { h: 95, atrasoS: 30, histerese: 1 } }, { s: 'co2', tipo: 'co2', nome: 'CO₂ no espaço livre', lim: { h: 1500, hh: 3000, atrasoS: 600, histerese: 50 } }], mostrar: ['temp_max', 'co2'], nivel: 'nivel' },
        silo_pulmao: { tags: [{ s: 'nivel', tipo: 'nivel', nome: 'Nível', lim: { h: 95, atrasoS: 30, histerese: 1 } }], mostrar: ['nivel'], nivel: 'nivel' },
        armazem: { tags: [{ s: 'temp_max', tipo: 'temperatura', nome: 'Temperatura do grão (máx.)', faixa: [10, 40], lim: { h: 28, hh: 32, atrasoS: 300, histerese: 0.5 } }], mostrar: ['temp_max'] },
        moega: { tags: [{ s: 'nivel', tipo: 'estado', nome: 'Nível alto da moega' }], cmds: [{ s: 'grelha', tipo: 'chave', nome: 'Abrir comporta da moega' }], mostrar: ['nivel'] },
        balanca: K.so('peso', 'Peso na balança', 'peso', { faixa: [0, 80000], dec: 0 }),
        secador: { tags: [{ s: 't_ar', tipo: 'temperatura', nome: 'Temperatura do ar de secagem', faixa: [20, 130], lim: { h: 105, hh: 115, atrasoS: 15, histerese: 2 } }, { s: 't_massa', tipo: 'temperatura', nome: 'Temperatura da massa de grãos', faixa: [10, 60], lim: { h: 42, hh: 45, atrasoS: 30, histerese: 1 } }, { s: 'ug_saida', tipo: 'umidade_grao', nome: 'Umidade do grão na saída', lim: { l: 12, atrasoS: 120, histerese: 0.2 } }], cmds: [{ s: 'sp_t_ar', tipo: 'setpoint', nome: 'Setpoint do ar de secagem', min: 40, max: 110, passo: 1, unidade: '°C' }], mostrar: ['t_ar', 't_massa'] },
        fornalha: { tags: [{ s: 'temperatura', tipo: 'temperatura', nome: 'Temperatura da fornalha', faixa: [100, 900], lim: { h: 750, hh: 850, atrasoS: 10, histerese: 10 } }], mostrar: ['temperatura'] },
        camara: { tags: [{ s: 'temperatura', tipo: 'temperatura', nome: 'Temperatura', faixa: [-4, 12], lim: { ll: -1, h: 4, atrasoS: 300, histerese: 0.2 } }, { s: 'umidade', tipo: 'umidade', nome: 'Umidade' }, { s: 'porta', tipo: 'estado', nome: 'Porta', lim: { h: 0.5, atrasoS: 300 } }], mostrar: ['temperatura', 'umidade'] },
        tanque: Object.assign(K.so('nivel', 'Nível', 'nivel'), { nivel: 'nivel' }),
        valvula: K.abreFecha('Abrir'), painel: K.so('potencia', 'Potência ativa', 'potencia', { faixa: [0, 300] }),
        estacao: { tags: [{ s: 'temperatura', tipo: 'temperatura', nome: 'Temperatura externa' }, { s: 'umidade', tipo: 'umidade', nome: 'Umidade relativa externa' }, { s: 'pressao', tipo: 'pressao', nome: 'Pressão barométrica', un: 'hPa', faixa: [950, 1050], dec: 1 }], calc: [{ s: 'orvalho', tipo: 'orvalho', nome: 'Ponto de orvalho', expr: 'orvalho({temperatura}, {umidade})' }], mostrar: ['temperatura', 'umidade'] }
    };
    Object.entries(kits).forEach(([k, kit]) => { if (SIMBOLOS[k]) SIMBOLOS[k].kit = kit; });
    if (SIMBOLOS.sensor) { Object.assign(SIMBOLOS.sensor, { sensor: 'generico', sigla: 'XT', nome: 'Sensor (bolha genérica)' }); delete SIMBOLOS.sensor.svg; }
    if (SIMBOLOS.chave) SIMBOLOS.chave.comando = 'chave';
    if (SIMBOLOS.setpoint) SIMBOLOS.setpoint.comando = 'setpoint';
    Object.assign(SIMBOLOS, SIMBOLOS_V2);
    GRUPOS_SIMBOLOS.length = 0; GRUPOS_SIMBOLOS.push(...GRUPOS_V2);
})();
