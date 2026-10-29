/**
 * © 2026 Supervisório MQTT — Inova Agro UFPel EMBRAPII. Código aberto; cópias permitidas desde que citadas.
 *
 * SÍMBOLOS DE AGROINDÚSTRIA EM GERAL (v3):
 *  - Leite / tambo: ordenhadeira, bomba de vácuo, medidor de leite, pré-resfriador de placas, tanque resfriador a granel,
 *    tarro (latão), caminhão-tanque isotérmico, silo de leite, pasteurizador de placas, homogeneizador, desnatadeira,
 *    envasadora, sistema CIP;
 *  - Rações e grãos: balança misturadora, misturador horizontal (helicoidal) e vertical, vagão misturador, moinho de
 *    martelos, peletizadora, extrusora, rosca dosadora com balança, picador de forragem;
 *  - Frutas e hortaliças: lavadora, classificadora por tamanho (N saídas), mesa/esteira de seleção, túnel de
 *    congelamento, embaladora;
 *  - Utilidades: caldeira, chiller (água gelada), caixa d'água, poço com bomba submersa, biodigestor.
 * Cada símbolo traz as entradas e saídas (portas) no formato "tipo:e|s@x,y[:direção]" (ver portas.js) e o kit de
 * variáveis/comandos com tópico e unidade pré-preenchidos (ver simbolos.js).
 */

'use strict';

const G_LEITE = 'Agroindústria — leite (tambo e laticínio)', G_RACAO = 'Agroindústria — rações e misturas', G_FRUTAS = 'Agroindústria — frutas e hortaliças', G_UTIL = 'Utilidades (água, vapor, frio, energia)';

const SIMBOLOS_AGRO = {
    // ===== leite
    ordenhadeira: { nome: 'Conjunto de ordenha (ordenhadeira)', grupo: G_LEITE, w: 90, h: 90, equip: true, portas: 'ar:e@.5,0 liquido:s@1,.7',
        kit: { tags: [{ s: 'vacuo', tipo: 'pressao', nome: 'Vácuo de ordenha', un: 'kPa', faixa: [0, 60], lim: { l: 38, h: 50, atrasoS: 10, histerese: 1 } }, { s: 'vazao', tipo: 'vazao', nome: 'Fluxo de leite', un: 'L/min', faixa: [0, 10] }, { s: 'estado', tipo: 'estado', nome: 'Ordenhando' }], mostrar: ['vacuo', 'vazao'] },
        svg: (w, h) => _r(w * .3, 4, w * .4, h * .22, 'corpo', 6) + [.18, .38, .62, .82].map(f => _p(`M${w * .5} ${h * .26} L${w * f} ${h * .55}`, 'detalhe') + _r(w * f - 5, h * .55, 10, h * .26, 'corpo', 4)).join('') + _p(`M${w * .5} ${h * .26} Q${w * .9} ${h * .3} ${w} ${h * .7}`, 'detalhe') },
    bomba_vacuo: { nome: 'Bomba de vácuo', grupo: G_LEITE, w: 80, h: 60, equip: true, portas: 'ar:e@0,.45 ar:s@1,.45', kit: K.motor(2, 6, [{ s: 'vacuo', tipo: 'pressao', nome: 'Vácuo na linha', un: 'kPa', faixa: [0, 60] }]),
        svg: (w, h) => _c(w * .4, h * .45, h * .36) + _c(w * .4, h * .45, h * .12, 'detalhe') + _r(w * .72, h * .25, w * .26, h * .4) + _t(w * .85, h * .52, 'M', 9) + _l(w * .15, h - 3, w * .9, h - 3) },
    medidor_leite: { nome: 'Medidor de leite', grupo: G_LEITE, w: 50, h: 80, equip: true, portas: 'liquido:e@.5,0 liquido:s@.5,1',
        kit: { tags: [{ s: 'volume', tipo: 'volume', nome: 'Volume ordenhado', un: 'L', faixa: [0, 50], dec: 1 }, { s: 'condutividade', tipo: 'generico', nome: 'Condutividade', un: 'mS/cm', faixa: [3, 8], lim: { h: 6.5, atrasoS: 30, histerese: 0.1 } }], mostrar: ['volume'] },
        svg: (w, h) => _r(w * .15, h * .12, w * .7, h * .76, 'corpo', w * .3) + [.35, .5, .65].map(f => _l(w * .3, h * f, w * .45, h * f, 'detalhe fino')).join('') + _l(w * .5, 0, w * .5, h * .12) + _l(w * .5, h * .88, w * .5, h) },
    pre_resfriador: { nome: 'Pré-resfriador de placas', grupo: G_LEITE, w: 90, h: 80, equip: true, portas: 'liquido:e@0,.3 liquido:s@1,.3 liquido:e@1,.75 liquido:s@0,.75',
        kit: { tags: [{ s: 't_leite_saida', tipo: 'temperatura', nome: 'Leite na saída', faixa: [0, 40] }, { s: 't_agua', tipo: 'temperatura', nome: 'Água de resfriamento', faixa: [0, 30] }], mostrar: ['t_leite_saida'] },
        svg: (w, h) => _r(w * .1, 4, w * .8, h - 8, 'corpo', 3) + Array.from({ length: 8 }, (_, i) => _l(w * .18 + i * w * .09, 10, w * .18 + i * w * .09, h - 10, 'detalhe fino')).join('') },
    tanque_resfriador: { nome: 'Tanque resfriador de leite (granel)', grupo: G_LEITE, w: 200, h: 110, equip: true, portas: 'liquido:e@.5,0 liquido:s@.06,1 eletrico:e@.85,0',
        kit: { tags: [{ s: 't_leite', tipo: 'temperatura', nome: 'Temperatura do leite', faixa: [0, 40], lim: { h: 4, hh: 7, atrasoS: 1800, histerese: 0.3 } }, { s: 'volume', tipo: 'volume', nome: 'Volume de leite', un: 'L', faixa: [0, 4000], dec: 0 }, { s: 'agitador', tipo: 'estado', nome: 'Agitador' }, { s: 'compressor', tipo: 'estado', nome: 'Refrigeração ligada' }],
            cmds: [{ s: 'cmd_agitador', tipo: 'chave', nome: 'Ligar agitador' }, { s: 'cmd_frio', tipo: 'chave', nome: 'Ligar refrigeração' }, { s: 'sp_temp', tipo: 'setpoint', nome: 'Temperatura do leite', min: 2, max: 6, passo: 0.5, unidade: '°C' }], mostrar: ['t_leite', 'volume'], nivel: 'volume' },
        svg: (w, h) => _r(6, h * .16, w - 12, h * .62, 'corpo', h * .3) + _l(w / 2, 2, w / 2, h * .45, 'detalhe') + _p(`M${w / 2 - 14} ${h * .45} h28`, 'detalhe grosso') + _r(w * .78, 2, w * .14, h * .14) + _t(w * .85, h * .11, 'M', 9) + _l(w * .2, h * .78, w * .16, h - 3) + _l(w * .8, h * .78, w * .84, h - 3) + _l(12, h * .62, 12, h) },
    tarro_leite: { nome: 'Tarro / latão de leite', grupo: G_LEITE, w: 40, h: 64, portas: 'liquido:e@.5,0 liquido:s@.5,1',
        svg: (w, h) => _p(`M${w * .32} 4 H${w * .68} V${h * .18} L${w * .86} ${h * .3} V${h - 4} H${w * .14} V${h * .3} L${w * .32} ${h * .18} Z`) + _l(w * .14, h * .5, w * .86, h * .5, 'detalhe fino') },
    caminhao_tanque_leite: { nome: 'Caminhão-tanque isotérmico (leite)', grupo: G_LEITE, w: 230, h: 90, portas: 'liquido:e@.35,.18 liquido:s@.05,.62',
        svg: (w, h) => _r(4, 16, w * .66, h * .5, 'corpo', h * .25) + _r(w * .3, 8, w * .1, 8, 'detalhe', 2) + _p(`M${w * .72} ${h * .32} H${w * .88} L${w - 4} ${h * .5} V${h * .68} H${w * .72} Z`) + _l(4, h * .68, w - 4, h * .68) + [.14, .28, .55, .86].map(f => _c(w * f, h * .8, 10)).join('') },
    silo_leite: { nome: 'Silo / tanque isotérmico de leite', grupo: G_LEITE, w: 90, h: 190, equip: true, portas: 'liquido:e@.5,0 liquido:s@.5,1',
        kit: { tags: [{ s: 't_leite', tipo: 'temperatura', nome: 'Temperatura do leite', faixa: [0, 20], lim: { h: 5, hh: 7, atrasoS: 900, histerese: 0.3 } }, { s: 'nivel', tipo: 'nivel', nome: 'Nível' }, { s: 'agitador', tipo: 'estado', nome: 'Agitador' }], cmds: [{ s: 'cmd_agitador', tipo: 'chave', nome: 'Ligar agitador' }], mostrar: ['t_leite', 'nivel'], nivel: 'nivel' },
        svg: (w, h) => _p(`M8 ${h * .1} Q${w / 2} -4 ${w - 8} ${h * .1} V${h * .78} Q${w / 2} ${h * .9} 8 ${h * .78} Z`) + _l(w * .2, h * .82, w * .16, h - 3) + _l(w * .8, h * .82, w * .84, h - 3) + _l(w / 2, h * .9, w / 2, h) },
    pasteurizador: { nome: 'Pasteurizador de placas (HTST)', grupo: G_LEITE, w: 150, h: 100, equip: true, portas: 'liquido:e@0,.4 liquido:s@1,.4 vapor:e@.3,0 liquido:s@.3,1',
        kit: { tags: [{ s: 't_pasteurizacao', tipo: 'temperatura', nome: 'Temperatura de pasteurização', faixa: [60, 85], lim: { ll: 71.5, l: 72, h: 78, atrasoS: 5, histerese: 0.2, prioridadeExtremos: 1 } }, { s: 't_saida', tipo: 'temperatura', nome: 'Leite na saída', faixa: [0, 20] }, { s: 'vazao', tipo: 'vazao', nome: 'Vazão', un: 'L/h', faixa: [0, 5000], dec: 0 }, { s: 'desvio', tipo: 'estado', nome: 'Válvula de desvio (refluxo)', lim: { h: 0.5, atrasoS: 0, prioridadeAvisos: 2 } }],
            cmds: [{ s: 'sp_temp', tipo: 'setpoint', nome: 'Temperatura de pasteurização', min: 72, max: 80, passo: 0.5, unidade: '°C' }], mostrar: ['t_pasteurizacao', 'vazao'] },
        svg: (w, h) => _r(w * .08, 6, w * .62, h - 12, 'corpo', 3) + Array.from({ length: 10 }, (_, i) => _l(w * .14 + i * w * .055, 12, w * .14 + i * w * .055, h - 12, 'detalhe fino')).join('') + _r(w * .76, h * .2, w * .2, h * .6, 'corpo', 6) + _t(w * .86, h * .55, 'R', 10) },
    homogeneizador: { nome: 'Homogeneizador', grupo: G_LEITE, w: 100, h: 80, equip: true, portas: 'liquido:e@0,.45 liquido:s@1,.45 eletrico:e@.85,0', kit: K.motor(15, 45, [{ s: 'pressao', tipo: 'pressao', nome: 'Pressão de homogeneização', un: 'bar', faixa: [0, 250] }]),
        svg: (w, h) => _r(4, h * .2, w * .6, h * .5) + [.18, .32, .46].map(f => _l(w * f, h * .2, w * f, h * .7, 'detalhe')).join('') + _r(w * .66, h * .25, w * .3, h * .4) + _t(w * .81, h * .52, 'M', 10) + _l(w * .1, h - 3, w * .9, h - 3) },
    desnatadeira: { nome: 'Desnatadeira / centrífuga', grupo: G_LEITE, w: 90, h: 120, equip: true, portas: 'liquido:e@.5,0 liquido:s@0,.55 liquido:s@1,.55 eletrico:e@.9,.7', kit: K.motor(5, 15),
        svg: (w, h) => _l(w / 2, 0, w / 2, h * .12) + _p(`M${w * .2} ${h * .12} H${w * .8} L${w * .7} ${h * .55} H${w * .3} Z`) + _l(0, h * .55, w * .3, h * .55) + _l(w * .7, h * .55, w, h * .55) + _r(w * .3, h * .6, w * .4, h * .34) + _c(w / 2, h * .77, 8, 'detalhe') },
    envasadora: { nome: 'Envasadora / embaladora de líquidos', grupo: G_LEITE, w: 110, h: 120, equip: true, portas: 'liquido:e@.5,0 material:s@1,.88',
        kit: { tags: [{ s: 'contador', tipo: 'generico', nome: 'Embalagens produzidas', un: 'un', dec: 0, faixa: [0, 100000] }, { s: 'ritmo', tipo: 'generico', nome: 'Ritmo', un: 'un/min', dec: 0, faixa: [0, 120] }, { s: 'estado', tipo: 'estado', nome: 'Em produção' }], cmds: [{ s: 'cmd', tipo: 'chave', nome: 'Ligar envase' }], mostrar: ['ritmo'] },
        svg: (w, h) => _p(`M${w * .3} 4 H${w * .7} L${w * .6} ${h * .2} H${w * .4} Z`) + _r(w * .15, h * .22, w * .7, h * .5) + _l(w * .5, h * .72, w * .5, h * .8) + _r(0, h * .82, w, h * .12, 'corpo', 6) + [.3, .5, .7].map(f => _r(w * f - 5, h * .74, 10, h * .08, 'detalhe', 1)).join('') },
    cip: { nome: 'Sistema de limpeza CIP', grupo: G_LEITE, w: 120, h: 110, equip: true, portas: 'liquido:s@1,.6 liquido:e@0,.6 vapor:e@.5,0',
        kit: { tags: [{ s: 't_solucao', tipo: 'temperatura', nome: 'Temperatura da solução', faixa: [20, 90], lim: { l: 60, atrasoS: 120, histerese: 1 } }, { s: 'condutividade', tipo: 'generico', nome: 'Condutividade', un: 'mS/cm', faixa: [0, 100] }, { s: 'etapa', tipo: 'generico', nome: 'Etapa do ciclo', un: '', dec: 0, faixa: [0, 6] }], cmds: [{ s: 'iniciar', tipo: 'botao', nome: 'Iniciar ciclo CIP', payloadLiga: '1' }], mostrar: ['t_solucao', 'etapa'] },
        svg: (w, h) => [.2, .5, .8].map(f => _r(w * f - w * .12, h * .1, w * .24, h * .6, 'corpo', w * .1)).join('') + _t(w * .2, h * .45, 'A', 9) + _t(w * .5, h * .45, 'S', 9) + _t(w * .8, h * .45, 'D', 9) + _l(w * .08, h * .82, w * .92, h * .82) + [.2, .5, .8].map(f => _l(w * f, h * .7, w * f, h * .82)).join('') },
    // ===== rações e misturas
    balanca_misturadora: { nome: 'Balança misturadora (batelada)', grupo: G_RACAO, w: 150, h: 160, equip: true, n: 3, portas: 'material:e@T material:s@.5,1 eletrico:e@1,.5',
        kit: Object.assign(K.motor(8, 25, [{ s: 'peso', tipo: 'peso', nome: 'Peso da batelada', faixa: [0, 3000], dec: 0 }, { s: 'tempo', tipo: 'generico', nome: 'Tempo de mistura', un: 's', dec: 0, faixa: [0, 900] }, { s: 'receita', tipo: 'generico', nome: 'Ingrediente atual', un: '', dec: 0, faixa: [0, 20] }]),
            { cmds: [{ s: 'cmd', tipo: 'chave', nome: 'Ligar misturador' }, { s: 'sp_batelada', tipo: 'setpoint', nome: 'Peso da batelada', min: 50, max: 3000, passo: 10, unidade: 'kg' }, { s: 'sp_tempo', tipo: 'setpoint', nome: 'Tempo de mistura', min: 30, max: 900, passo: 10, unidade: 's' }, { s: 'descarregar', tipo: 'botao', nome: 'Descarregar', payloadLiga: '1' }], mostrar: ['peso', 'tempo'] }),
        svg: (w, h, el) => { const n = nSaidas(el, SIMBOLOS_AGRO.balanca_misturadora); return Array.from({ length: n }, (_, i) => _r(w * (i + .5) / n - 7, 0, 14, h * .08, 'corpo', 1)).join('') + _r(6, h * .08, w - 12, h * .5, 'corpo', 8) + _p(`M${w * .14} ${h * .33} c${w * .12} -20 ${w * .24} 20 ${w * .36} 0 s${w * .24} -20 ${w * .36} 0`, 'detalhe') + _t(w * .5, h * .52, 'W', 12) + _p(`M${w * .35} ${h * .58} H${w * .65} L${w * .58} ${h * .8} H${w * .42} Z`) + _l(w * .1, h * .58, w * .1, h - 4) + _l(w * .9, h * .58, w * .9, h - 4) + _r(w * .44, h * .82, w * .12, h * .14); } },
    misturador_horizontal: { nome: 'Misturador horizontal (helicoidal)', grupo: G_RACAO, w: 190, h: 90, equip: true, portas: 'material:e@.3,0 material:e@.6,0 material:s@.5,1 eletrico:e@1,.4', kit: K.motor(8, 25),
        svg: (w, h) => _r(4, h * .14, w * .82, h * .56, 'corpo', h * .25) + _p(`M${w * .1} ${h * .42} c${w * .08} -22 ${w * .16} 22 ${w * .24} 0 s${w * .16} -22 ${w * .24} 0 s${w * .16} 22 ${w * .24} 0`, 'detalhe') + _r(w * .87, h * .26, w * .12, h * .3) + _t(w * .93, h * .46, 'M', 9) + _p(`M${w * .44} ${h * .7} H${w * .56} L${w * .53} ${h - 2} H${w * .47} Z`) },
    misturador_vertical: { nome: 'Misturador vertical', grupo: G_RACAO, w: 100, h: 170, equip: true, portas: 'material:e@.5,0 material:s@.5,1 eletrico:e@1,.12', kit: K.motor(5, 15),
        svg: (w, h) => _p(`M10 ${h * .06} H${w - 10} V${h * .6} L${w * .58} ${h * .86} H${w * .42} L10 ${h * .6} Z`) + _p(`M${w / 2} ${h * .08} V${h * .78} M${w * .38} ${h * .2} L${w * .62} ${h * .3} M${w * .38} ${h * .36} L${w * .62} ${h * .46} M${w * .38} ${h * .52} L${w * .62} ${h * .62}`, 'detalhe') + _r(w * .42, h * .86, w * .16, h * .12) },
    vagao_misturador: { nome: 'Vagão misturador / forrageiro', grupo: G_RACAO, w: 200, h: 100, equip: true, portas: 'material:e@.45,0 material:s@1,.55',
        kit: { tags: [{ s: 'peso', tipo: 'peso', nome: 'Peso no vagão', faixa: [0, 15000], dec: 0 }], cmds: [{ s: 'sp_carga', tipo: 'setpoint', nome: 'Carga do trato', min: 0, max: 15000, passo: 50, unidade: 'kg' }], mostrar: ['peso'] },
        svg: (w, h) => _p(`M${w * .12} 6 H${w * .82} L${w * .78} ${h * .68} H${w * .16} Z`) + _p(`M${w * .3} ${h * .18} c10 10 -10 20 0 30 c10 10 -10 20 0 25 M${w * .6} ${h * .18} c10 10 -10 20 0 30 c10 10 -10 20 0 25`, 'detalhe') + _r(w * .82, h * .46, w * .16, h * .14) + _l(0, h * .55, w * .12, h * .55) + _c(w * .3, h * .82, 11) + _c(w * .62, h * .82, 11) },
    moinho_martelos: { nome: 'Moinho de martelos', grupo: G_RACAO, w: 120, h: 120, equip: true, portas: 'material:e@.5,0 material:s@.5,1 ar:s@1,.75 eletrico:e@0,.5',
        kit: K.motor(30, 90, [{ s: 'temp_mancal', tipo: 'temperatura', nome: 'Temperatura do mancal', faixa: [20, 100], lim: { h: 70, hh: 85, atrasoS: 10, histerese: 2 } }]),
        svg: (w, h) => _p(`M${w * .35} 2 H${w * .65} L${w * .6} ${h * .16} H${w * .4} Z`) + _c(w / 2, h * .45, w * .3) + [0, 60, 120, 180, 240, 300].map(a => `<path class="detalhe" transform="rotate(${a} ${w / 2} ${h * .45})" d="M${w / 2} ${h * .45} L${w / 2} ${h * .45 - w * .24}"/>`).join('') + _p(`M${w * .3} ${h * .7} L${w * .4} ${h - 2} H${w * .6} L${w * .7} ${h * .7}`, 'detalhe') },
    peletizadora: { nome: 'Peletizadora (com condicionador)', grupo: G_RACAO, w: 150, h: 130, equip: true, portas: 'material:e@.2,0 vapor:e@0,.3 material:s@.7,1 eletrico:e@1,.5',
        kit: K.motor(40, 120, [{ s: 't_condicionador', tipo: 'temperatura', nome: 'Temperatura no condicionador', faixa: [40, 100], lim: { l: 75, atrasoS: 60, histerese: 1 } }]),
        svg: (w, h) => _r(4, h * .14, w * .5, h * .22, 'corpo', h * .1) + _p(`M${w * .1} ${h * .25} h${w * .38}`, 'detalhe') + _l(w * .45, h * .36, w * .55, h * .45) + _r(w * .48, h * .42, w * .4, h * .36) + _c(w * .68, h * .6, h * .13, 'detalhe') + _c(w * .68, h * .6, h * .04, 'detalhe') + _p(`M${w * .62} ${h * .78} L${w * .65} ${h - 2} H${w * .75} L${w * .78} ${h * .78}`, 'detalhe') },
    extrusora: { nome: 'Extrusora', grupo: G_RACAO, w: 200, h: 90, equip: true, portas: 'material:e@.12,0 vapor:e@.4,0 material:s@1,.5 eletrico:e@0,.6', kit: K.motor(30, 90, [{ s: 't_barril', tipo: 'temperatura', nome: 'Temperatura do barril', faixa: [40, 180] }]),
        svg: (w, h) => _p(`M${w * .04} 2 H${w * .2} L${w * .16} ${h * .26} H${w * .08} Z`) + _r(w * .04, h * .28, w * .9, h * .38, 'corpo', 4) + _p(`M${w * .1} ${h * .47} ${Array.from({ length: 10 }, (_, i) => `L${w * (.14 + i * .08)} ${i % 2 ? h * .34 : h * .6}`).join(' ')}`, 'detalhe fino') + _p(`M${w * .94} ${h * .36} L${w} ${h * .44} V${h * .56} L${w * .94} ${h * .62}`, 'detalhe') },
    rosca_dosadora: { nome: 'Rosca dosadora com balança', grupo: G_RACAO, w: 130, h: 110, equip: true, portas: 'material:e@.3,0 material:s@.95,1 eletrico:e@0,.75',
        kit: Object.assign(K.motor(1, 3, [{ s: 'vazao', tipo: 'vazao', nome: 'Vazão dosada', un: 'kg/h', faixa: [0, 5000], dec: 0 }]), { cmds: [{ s: 'cmd', tipo: 'chave', nome: 'Ligar dosagem' }, { s: 'sp_vazao', tipo: 'setpoint', nome: 'Vazão de dosagem', min: 0, max: 5000, passo: 10, unidade: 'kg/h' }], mostrar: ['vazao'] }),
        svg: (w, h) => _p(`M${w * .1} 2 H${w * .5} V${h * .3} L${w * .38} ${h * .52} H${w * .22} L${w * .1} ${h * .3} Z`) + _t(w * .3, h * .24, 'W', 10) + _r(w * .1, h * .54, w * .85, h * .2, 'corpo', h * .1) + _p(`${Array.from({ length: 8 }, (_, i) => `M${w * (.16 + i * .1)} ${h * .56} l${w * .05} ${h * .16}`).join(' ')}`, 'detalhe fino') + _l(w * .95, h * .74, w * .95, h) },
    picador_forragem: { nome: 'Picador / triturador de forragem', grupo: G_RACAO, w: 150, h: 100, equip: true, portas: 'material:e@0,.4 material:s@1,.15 eletrico:e@.5,1', kit: K.motor(10, 30),
        svg: (w, h) => _p(`M4 ${h * .25} H${w * .4} V${h * .6} H4 Z`) + _c(w * .55, h * .45, h * .26) + _p(`M${w * .55} ${h * .45} l${h * .18} ${-h * .1} M${w * .55} ${h * .45} l${-h * .18} ${h * .1}`, 'detalhe') + _p(`M${w * .66} ${h * .3} Q${w * .85} ${h * .05} ${w} ${h * .15}`, 'detalhe grosso') + _l(w * .3, h * .9, w * .8, h * .9) },
    // ===== frutas e hortaliças
    lavadora: { nome: 'Lavadora (frutas e hortaliças)', grupo: G_FRUTAS, w: 190, h: 100, equip: true, portas: 'material:e@0,.3 material:s@1,.55 liquido:e@.5,0 liquido:s@.4,1',
        kit: K.motor(1.5, 4, [{ s: 'cloro', tipo: 'generico', nome: 'Cloro livre na água', un: 'mg/L', faixa: [0, 200], lim: { l: 50, atrasoS: 300, histerese: 5 } }]),
        svg: (w, h) => _p(`M4 ${h * .25} L${w * .7} ${h * .25} L${w - 4} ${h * .5} V${h * .62} L${w * .7} ${h * .7} H4 Z`) + _p(`M8 ${h * .45} q12 -6 24 0 t24 0 t24 0 t24 0 t24 0`, 'detalhe fino') + [.2, .4, .6].map(f => _p(`M${w * f} ${h * .1} v${h * .1} M${w * f - 5} ${h * .16} l5 6 l5 -6`, 'detalhe fino')).join('') + _l(w * .1, h * .7, w * .1, h - 3) + _l(w * .6, h * .7, w * .6, h - 3) },
    classificadora_frutas: { nome: 'Classificadora por tamanho/peso (N saídas)', grupo: G_FRUTAS, w: 230, h: 100, equip: true, n: 4, portas: 'material:e@0,.3 material:s@N',
        kit: K.motor(1, 3, [{ s: 'ritmo', tipo: 'generico', nome: 'Frutos por minuto', un: 'un/min', dec: 0, faixa: [0, 2000] }]),
        svg: (w, h, el) => _r(4, h * .2, w - 8, h * .24, 'corpo', h * .12) + Array.from({ length: 12 }, (_, i) => _c(14 + i * (w - 28) / 11, h * .32, 4, 'detalhe')).join('') + _saidas(w, h, nSaidas(el, SIMBOLOS_AGRO.classificadora_frutas), h * .48, h * .36) },
    mesa_selecao: { nome: 'Mesa / esteira de seleção', grupo: G_FRUTAS, w: 200, h: 70, equip: true, portas: 'material:e@0,.35 material:s@1,.35 material:s@.5,1', kit: K.motor(0.5, 1.5),
        svg: (w, h) => _r(4, h * .22, w - 8, h * .26, 'corpo', h * .13) + [.25, .5, .75].map(f => _c(w * f, h * .35, 5, 'detalhe')).join('') + _l(w * .12, h * .48, w * .12, h - 3) + _l(w * .88, h * .48, w * .88, h - 3) + _p(`M${w * .44} ${h * .48} L${w * .47} ${h * .8} H${w * .53} L${w * .56} ${h * .48}`, 'detalhe') },
    tunel_congelamento: { nome: 'Túnel de congelamento', grupo: G_FRUTAS, w: 220, h: 90, equip: true, portas: 'material:e@0,.62 material:s@1,.62 liquido:e@.5,0 liquido:s@.6,0',
        kit: { tags: [{ s: 'temperatura', tipo: 'temperatura', nome: 'Temperatura do túnel', faixa: [-45, 10], lim: { h: -18, atrasoS: 600, histerese: 1 } }, { s: 't_produto', tipo: 'temperatura', nome: 'Temperatura do produto', faixa: [-30, 20] }, { s: 'estado', tipo: 'estado', nome: 'Esteira' }], cmds: [{ s: 'cmd', tipo: 'chave', nome: 'Ligar túnel' }], mostrar: ['temperatura'] },
        svg: (w, h) => _r(w * .08, 6, w * .84, h * .72, 'corpo', 4) + _l(0, h * .62, w, h * .62, 'detalhe grosso') + _p(`M${w * .5} ${h * .2} v${h * .3} M${w * .5 - 13} ${h * .27} l26 ${h * .16} M${w * .5 + 13} ${h * .27} l-26 ${h * .16}`, 'detalhe fino') },
    embaladora: { nome: 'Embaladora / seladora de pacotes', grupo: G_FRUTAS, w: 120, h: 110, equip: true, portas: 'material:e@.5,0 material:s@1,.85',
        kit: { tags: [{ s: 'contador', tipo: 'generico', nome: 'Pacotes produzidos', un: 'un', dec: 0, faixa: [0, 100000] }, { s: 'ritmo', tipo: 'generico', nome: 'Ritmo', un: 'un/min', dec: 0, faixa: [0, 120] }, { s: 'estado', tipo: 'estado', nome: 'Em produção' }], cmds: [{ s: 'cmd', tipo: 'chave', nome: 'Ligar embaladora' }], mostrar: ['ritmo'] },
        svg: (w, h) => _p(`M${w * .3} 2 H${w * .7} L${w * .6} ${h * .18} H${w * .4} Z`) + _r(w * .12, h * .2, w * .76, h * .52) + _r(w * .38, h * .3, w * .24, h * .3, 'detalhe', 2) + _r(0, h * .78, w, h * .14, 'corpo', 6) + _r(w * .7, h * .64, w * .14, h * .14, 'corpo saco', 1) },
    // ===== utilidades
    caldeira: { nome: 'Caldeira (vapor)', grupo: G_UTIL, w: 150, h: 110, equip: true, portas: 'liquido:e@0,.7 vapor:s@.7,0 ar:s@.15,0',
        kit: { tags: [{ s: 'pressao', tipo: 'pressao', nome: 'Pressão do vapor', un: 'bar', faixa: [0, 12], lim: { h: 9, hh: 10, atrasoS: 5, histerese: 0.2, prioridadeExtremos: 1 } }, { s: 'nivel', tipo: 'nivel', nome: 'Nível de água', lim: { ll: 20, l: 35, atrasoS: 5, histerese: 2, prioridadeExtremos: 1 } }, { s: 't_gases', tipo: 'temperatura', nome: 'Temperatura dos gases', faixa: [100, 400] }, { s: 'queimador', tipo: 'estado', nome: 'Queimador aceso' }],
            cmds: [{ s: 'cmd', tipo: 'chave', nome: 'Ligar caldeira' }, { s: 'sp_pressao', tipo: 'setpoint', nome: 'Pressão de trabalho', min: 1, max: 9, passo: 0.1, unidade: 'bar' }], mostrar: ['pressao', 'nivel'] },
        svg: (w, h) => _r(4, h * .18, w * .86, h * .6, 'corpo', h * .3) + _r(w * .1, 0, w * .1, h * .2) + _l(w * .7, h * .18, w * .7, 0) + _p(`M${w * .25} ${h * .62} c-8 -12 -6 -22 4 -28 c-2 8 6 10 4 18 c6 -6 6 -12 4 -18 c10 8 8 22 -4 28 Z`, 'chama') + _l(w * .2, h * .78, w * .2, h - 3) + _l(w * .75, h * .78, w * .75, h - 3) },
    chiller: { nome: 'Chiller / banco de gelo (água gelada)', grupo: G_UTIL, w: 140, h: 90, equip: true, portas: 'liquido:e@0,.4 liquido:s@0,.7 eletrico:e@1,.3',
        kit: K.motor(6, 20, [{ s: 't_agua', tipo: 'temperatura', nome: 'Água gelada', faixa: [-2, 15], lim: { h: 4, atrasoS: 300, histerese: 0.3 } }]),
        svg: (w, h) => _r(4, 4, w - 8, h - 8, 'corpo', 4) + _c(w * .72, h * .45, h * .26, 'detalhe') + `<g class="helice-gira" style="transform-origin:${w * .72}px ${h * .45}px">${[0, 120, 240].map(a => `<path class="pa" transform="rotate(${a} ${w * .72} ${h * .45})" d="M${w * .72} ${h * .45} q5 -4 1 -${h * .22} q-5 4 -1 ${h * .22} Z"/>`).join('')}</g>` + _p(`M${w * .25} ${h * .3} v${h * .4} M${w * .25 - 12} ${h * .38} l24 ${h * .24} M${w * .25 + 12} ${h * .38} l-24 ${h * .24}`, 'detalhe fino') },
    caixa_dagua: { nome: 'Caixa d\'água / reservatório', grupo: G_UTIL, w: 90, h: 90, equip: true, portas: 'liquido:e@.5,0 liquido:s@.5,1', kit: Object.assign(K.so('nivel', 'Nível do reservatório', 'nivel', { lim: { l: 20, ll: 10, atrasoS: 60, histerese: 2 } }), { nivel: 'nivel' }),
        svg: (w, h) => _p(`M6 ${h * .15} H${w - 6} L${w - 12} ${h * .8} H12 Z`) + _l(6, h * .15, w - 6, h * .15, 'detalhe grosso') + _l(w * .25, h * .8, w * .2, h - 2) + _l(w * .75, h * .8, w * .8, h - 2) },
    poco_bomba: { nome: 'Poço com bomba submersa', grupo: G_UTIL, w: 60, h: 150, equip: true, portas: 'liquido:s@.5,0 eletrico:e@1,.06', kit: K.motor(3, 9, [{ s: 'nivel_poco', tipo: 'nivel', nome: 'Nível do poço', un: 'm', faixa: [0, 100], dec: 1 }]),
        svg: (w, h) => _p(`M${w * .2} ${h * .1} V${h - 4} H${w * .8} V${h * .1}`, 'detalhe grosso') + _l(0, h * .1, w, h * .1) + _l(w / 2, 0, w / 2, h * .62) + _r(w * .36, h * .62, w * .28, h * .26, 'corpo', 3) + _p(`M${w * .22} ${h * .4} q8 -4 16 0 t16 0`, 'detalhe fino') },
    biodigestor: { nome: 'Biodigestor', grupo: G_UTIL, w: 180, h: 100, equip: true, portas: 'liquido:e@0,.65 liquido:s@1,.75 ar:s@.5,0',
        kit: { tags: [{ s: 'pressao_gas', tipo: 'pressao', nome: 'Pressão do biogás', un: 'mbar', faixa: [0, 50], lim: { h: 35, atrasoS: 60, histerese: 1 } }, { s: 'temperatura', tipo: 'temperatura', nome: 'Temperatura do lodo', faixa: [10, 45] }, { s: 'ch4', tipo: 'percentual', nome: 'Metano no biogás', un: '%', faixa: [0, 80] }], mostrar: ['pressao_gas', 'ch4'] },
        svg: (w, h) => _p(`M10 ${h * .45} Q${w / 2} ${-h * .25} ${w - 10} ${h * .45}`, 'corpo') + _r(10, h * .45, w - 20, h * .45, 'corpo', 4) + _p(`M20 ${h * .6} q${w * .1} -6 ${w * .2} 0 t${w * .2} 0 t${w * .2} 0 t${w * .18} 0`, 'detalhe fino') }
};
Object.assign(SIMBOLOS, SIMBOLOS_AGRO);
GRUPOS_SIMBOLOS.splice(GRUPOS_SIMBOLOS.indexOf('Frio'), 0, G_LEITE, G_RACAO, G_FRUTAS, G_UTIL);

// ===== ciclones e afins (separação de pó e casca) e sensores adicionais
const SIMBOLOS_PO = {
    multiciclone: { nome: 'Multiciclone (bateria de ciclones)', grupo: 'Ar e proteção', w: 130, h: 150, portas: 'ar:e@0,.2 ar:s@.5,0 material:s@.5,1', equip: true,
        kit: K.so('pressao', 'Perda de carga', 'dp', { un: 'Pa', faixa: [0, 2500], dec: 0, lim: { h: 1500, atrasoS: 60, histerese: 50 } }),
        svg: (w, h) => _r(w * .42, 0, w * .16, h * .08) + _r(6, h * .08, w - 12, h * .2) + [.2, .4, .6, .8].map(f => _p(`M${w * f - 10} ${h * .28} H${w * f + 10} V${h * .45} L${w * f + 3} ${h * .7} H${w * f - 3} L${w * f - 10} ${h * .45} Z`)).join('') + _p(`M6 ${h * .72} H${w - 6} L${w * .58} ${h * .9} H${w * .42} Z`) + _r(w * .44, h * .9, w * .12, h * .1) },
    ciclone_casca: { nome: 'Ciclone de casca (separador de casca)', grupo: 'Ar e proteção', w: 90, h: 170, portas: 'ar:e@1,.16 ar:s@.5,0 material:s@.5,1',
        svg: (w, h) => _r(w * .36, 0, w * .28, h * .08) + _p(`M8 ${h * .1} H${w - 8} V${h * .36} L${w * .6} ${h * .82} H${w * .4} L8 ${h * .36} Z`) + _p(`M${w - 8} ${h * .13} H${w}`, 'detalhe') + _r(w * .38, h * .82, w * .24, h * .14) + _t(w / 2, h * .3, 'C', 12) },
    valvula_ciclone: { nome: 'Válvula rotativa sob ciclone / filtro', grupo: 'Ar e proteção', w: 50, h: 56, portas: 'material:e@.5,0 material:s@.5,1', equip: true, kit: K.motor(0.4, 1.2),
        svg: (w, h) => _r(w * .3, 0, w * .4, h * .14) + _c(w / 2, h / 2, w * .32) + [0, 60, 120].map(a => `<path class="detalhe" transform="rotate(${a} ${w / 2} ${h / 2})" d="M${w * .2} ${h / 2} H${w * .8}"/>`).join('') + _r(w * .3, h - 9, w * .4, 9) },
    camara_decantacao: { nome: 'Câmara de decantação de pó', grupo: 'Ar e proteção', w: 160, h: 100, portas: 'ar:e@0,.3 ar:s@1,.3 material:s@.3,1 material:s@.7,1',
        svg: (w, h) => _r(4, 6, w - 8, h * .55) + [.3, .5, .7].map(f => _l(w * f, 10, w * f, h * .4, 'detalhe fino')).join('') + _p(`M4 ${h * .61} L${w * .3} ${h - 4} L${w * .5} ${h * .61} L${w * .7} ${h - 4} L${w - 4} ${h * .61}`) },
    filtro_cartucho: { nome: 'Filtro de cartuchos', grupo: 'Ar e proteção', w: 90, h: 150, portas: 'ar:e@0,.35 ar:s@.5,0 material:s@.5,1 ar_comprimido:e@1,.12', equip: true,
        kit: { tags: [{ s: 'dp', tipo: 'pressao', nome: 'Pressão diferencial', un: 'Pa', faixa: [0, 2500], dec: 0, lim: { h: 1500, hh: 2000, atrasoS: 60, histerese: 50 } }], cmds: [{ s: 'limpeza', tipo: 'botao', nome: 'Pulso de limpeza', payloadLiga: '1' }], mostrar: ['dp'] },
        svg: (w, h) => _r(6, 6, w - 12, h * .55) + [.3, .5, .7].map(f => _r(w * f - 6, h * .14, 12, h * .38, 'detalhe', 6) + Array.from({ length: 5 }, (_, i) => _l(w * f - 6, h * (.18 + i * .07), w * f + 6, h * (.18 + i * .07), 'detalhe fino')).join('')).join('') + _p(`M6 ${h * .61} H${w - 6} L${w * .6} ${h * .86} H${w * .4} Z`) + _r(w * .42, h * .86, w * .16, h * .1) },
    lavador_gases: { nome: 'Lavador de gases (scrubber)', grupo: 'Ar e proteção', w: 80, h: 160, portas: 'ar:e@0,.75 ar:s@.5,0 liquido:e@1,.25 liquido:s@.5,1', equip: true,
        kit: K.so('vazao', 'Vazão de água', 'vazao', { un: 'L/min', faixa: [0, 200], lim: { l: 20, atrasoS: 30, histerese: 2 } }),
        svg: (w, h) => _r(w * .38, 0, w * .24, h * .08) + _r(8, h * .08, w - 16, h * .82, 'corpo', 8) + _l(w * .2, h * .25, w * .8, h * .25, 'detalhe') + [.3, .5, .7].map(f => _p(`M${w * f} ${h * .27} l-4 8 M${w * f} ${h * .27} l4 8`, 'detalhe fino')).join('') + _p(`M12 ${h * .45} L${w - 12} ${h * .55} M12 ${h * .55} L${w - 12} ${h * .45}`, 'detalhe fino') + _r(w * .4, h * .9, w * .2, h * .1) },
    coifa_captacao: { nome: 'Coifa / captor de pó', grupo: 'Ar e proteção', w: 90, h: 60, portas: 'ar:s@.5,0',
        svg: (w, h) => _r(w * .38, 0, w * .24, h * .3) + _p(`M${w * .38} ${h * .3} L4 ${h - 6} H${w - 4} L${w * .62} ${h * .3} Z`) },
    // ===== sensores adicionais (sempre de um elemento: tópico área/elemento/sensor)
    sensor_presenca_grao: { nome: 'Sensor de presença de grão (capacitivo)', grupo: 'Sensores', w: 40, h: 40, sensor: 'estado', sigla: 'LS', nomeTag: 'Presença de grão' },
    sensor_nivel_vibratorio: { nome: 'Chave de nível vibratória', grupo: 'Sensores', w: 40, h: 40, sensor: 'estado', sigla: 'LS', nomeTag: 'Nível (chave vibratória)' },
    sensor_nivel_radar: { nome: 'Nível por radar / ultrassom', grupo: 'Sensores', w: 40, h: 40, sensor: 'nivel', sigla: 'LT', nomeTag: 'Nível (radar)' },
    sensor_fluxo_grao: { nome: 'Sensor de fluxo de grão (micro-ondas)', grupo: 'Sensores', w: 40, h: 40, sensor: 'estado', sigla: 'FS', nomeTag: 'Fluxo de grão presente' },
    sensor_entupimento: { nome: 'Sensor de entupimento (bica/elevador)', grupo: 'Sensores', w: 40, h: 40, sensor: 'estado', sigla: 'LSH', nomeTag: 'Entupimento', lim: { h: 0.5, atrasoS: 2, prioridadeAvisos: 2 } },
    sensor_umidade_linha: { nome: 'Umidade do grão em linha (micro-ondas)', grupo: 'Sensores', w: 40, h: 40, sensor: 'umidade_grao', sigla: 'MT', nomeTag: 'Umidade em linha' },
    pressostato: { nome: 'Pressostato (chave de pressão)', grupo: 'Sensores', w: 40, h: 40, sensor: 'estado', sigla: 'PS', nomeTag: 'Pressão (chave)' },
    manometro: { nome: 'Manômetro (indicador local)', grupo: 'Sensores', w: 40, h: 40, sensor: 'pressao', sigla: 'PI', nomeTag: 'Pressão (indicação)' },
    sensor_pressao_dif: { nome: 'Transmissor de pressão diferencial', grupo: 'Sensores', w: 40, h: 40, sensor: 'pressao', sigla: 'PDT', nomeTag: 'Pressão diferencial', un: 'Pa' },
    sensor_vacuo: { nome: 'Transmissor de vácuo', grupo: 'Sensores', w: 40, h: 40, sensor: 'pressao', sigla: 'PT', nomeTag: 'Vácuo', un: 'kPa' },
    fluxostato: { nome: 'Fluxostato (chave de fluxo)', grupo: 'Sensores', w: 40, h: 40, sensor: 'estado', sigla: 'FS', nomeTag: 'Fluxo (chave)' },
    vazao_magnetico: { nome: 'Medidor de vazão eletromagnético', grupo: 'Sensores', w: 40, h: 40, sensor: 'vazao', sigla: 'FT', nomeTag: 'Vazão (eletromagnético)', un: 'm³/h' },
    vazao_massico: { nome: 'Medidor de vazão mássica (Coriolis)', grupo: 'Sensores', w: 40, h: 40, sensor: 'vazao', sigla: 'FT', nomeTag: 'Vazão mássica', un: 'kg/h' },
    vazao_ar: { nome: 'Medidor de vazão de ar (anemômetro de duto)', grupo: 'Sensores', w: 40, h: 40, sensor: 'vazao', sigla: 'FT', nomeTag: 'Vazão de ar', un: 'm³/h' },
    termostato: { nome: 'Termostato (chave de temperatura)', grupo: 'Sensores', w: 40, h: 40, sensor: 'estado', sigla: 'TS', nomeTag: 'Temperatura (chave)' },
    sensor_temp_ar: { nome: 'Temperatura e umidade do ar (termo-higrômetro)', grupo: 'Sensores', w: 40, h: 40, sensor: 'temperatura', sigla: 'TT', nomeTag: 'Temperatura do ar' },
    sensor_velocidade_correia: { nome: 'Sensor de velocidade da correia', grupo: 'Sensores', w: 40, h: 40, sensor: 'velocidade', sigla: 'ST', nomeTag: 'Velocidade da correia' },
    fim_curso: { nome: 'Fim de curso / sensor de posição', grupo: 'Sensores', w: 40, h: 40, sensor: 'estado', sigla: 'ZS', nomeTag: 'Posição (fim de curso)' },
    sensor_indutivo: { nome: 'Sensor indutivo (pulso/rotação)', grupo: 'Sensores', w: 40, h: 40, sensor: 'rotacao', sigla: 'SE', nomeTag: 'Pulsos / rotação' },
    detector_faisca: { nome: 'Detector de faísca (duto)', grupo: 'Sensores', w: 40, h: 40, sensor: 'estado', sigla: 'BS', nomeTag: 'Faísca detectada', lim: { h: 0.5, atrasoS: 0, prioridadeAvisos: 1 } },
    detector_gas: { nome: 'Detector de gás (CO, fosfina, GLP)', grupo: 'Sensores', w: 40, h: 40, sensor: 'generico', sigla: 'AT', nomeTag: 'Concentração de gás', un: 'ppm' },
    sensor_po: { nome: 'Sensor de pó / material particulado', grupo: 'Sensores', w: 40, h: 40, sensor: 'generico', sigla: 'AT', nomeTag: 'Material particulado', un: 'mg/m³' },
    sensor_ph: { nome: 'Sensor de pH', grupo: 'Sensores', w: 40, h: 40, sensor: 'generico', sigla: 'AT', nomeTag: 'pH', un: 'pH' },
    sensor_condutividade: { nome: 'Sensor de condutividade', grupo: 'Sensores', w: 40, h: 40, sensor: 'generico', sigla: 'AT', nomeTag: 'Condutividade', un: 'mS/cm' },
    sensor_turbidez: { nome: 'Sensor de turbidez', grupo: 'Sensores', w: 40, h: 40, sensor: 'generico', sigla: 'AT', nomeTag: 'Turbidez', un: 'NTU' },
    anemometro: { nome: 'Anemômetro (vento)', grupo: 'Sensores', w: 40, h: 40, sensor: 'velocidade', sigla: 'ST', nomeTag: 'Velocidade do vento' },
    pluviometro: { nome: 'Pluviômetro', grupo: 'Sensores', w: 40, h: 40, sensor: 'generico', sigla: 'LT', nomeTag: 'Chuva', un: 'mm' },
    piranometro: { nome: 'Radiação solar (piranômetro)', grupo: 'Sensores', w: 40, h: 40, sensor: 'generico', sigla: 'RT', nomeTag: 'Radiação solar', un: 'W/m²' }
};
Object.assign(SIMBOLOS, SIMBOLOS_PO);
// equipamentos passivos de pó também são elementos (para receber sensores: área/elemento/sensor)
['ciclone', 'ciclone_casca', 'camara_decantacao', 'coifa_captacao'].forEach(k => { if (SIMBOLOS[k]) SIMBOLOS[k].equip = true; });
