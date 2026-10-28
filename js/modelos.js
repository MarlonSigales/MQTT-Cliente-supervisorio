/**
 * © 2026 Supervisório MQTT — Inova Agro UFPel EMBRAPII. Código aberto; cópias permitidas desde que citadas.
 *
 * MODELOS PRONTOS ("meio prontos"): cada um monta a planta inteira — áreas, equipamentos, variáveis com tópicos,
 * limites de alarme, comandos, horímetros, equações (potência, ponto de orvalho, energia), controladores, sinótico e a
 * simulação para testar sem broker. A pessoa só troca os tópicos pelos do campo (ou usa o prefixo) e ajusta os limites.
 *
 * Limites usados como ponto de partida (conferir com o agrônomo/responsável técnico):
 *  - massa de grãos no secador: até ~45 °C para consumo e ~40–42 °C para sementes (Silva, 2008; Weber, 2005);
 *  - termometria de silo: atenção acima de ~28 °C ou aumento rápido; aeração quando o ar está ≥ 3 °C mais frio que
 *    o grão e com umidade relativa < ~75 % (regra prática de aeração de manutenção);
 *  - CO₂ no espaço livre do silo: < 600 ppm normal, 600–1.500 ppm atenção, > 1.500 ppm deterioração (Maier et al.);
 *  - câmara fria de maçã: 0 a 1 °C, UR 90–95 %; abaixo de −1 °C risco de congelamento.
 */

'use strict';

/** Ajudante para montar plantas com pouco código. */
function construtor(nome, prefixo) {
    const pl = criarPlanta(nome);
    pl.conexao.tipo = 'simulado'; pl.conexao.prefixo = prefixo; pl.conexao.url = 'wss://broker.emqx.io:8084/mqtt';
    const porVar = {};
    const b = {
        pl, porVar,
        area(nome) { const a = criarArea(nome); pl.areas.push(a); return a; },
        equip(nome, simbolo, area, extra = {}) { const e = criarEquipamento(nome, area.id, simbolo); Object.assign(e, extra); pl.equipamentos.push(e); return e; },
        tag(eq, p) {
            const t = criarTag(Object.assign({}, p, { equipId: eq ? eq.id : '', areaId: eq ? eq.areaId : '' }));
            if (p.lim) t.limites = Object.assign(t.limites, { ativo: true }, p.lim);
            if (p.semDados === false) t.limites.semDadosS = 0;
            pl.tags.push(t); porVar[p.variavel] = t; return t;
        },
        cmd(eq, p) { const c = criarComando(Object.assign({ equipId: eq ? eq.id : '' }, p)); pl.comandos.push(c); return c; },
        horimetro(eq, tag, lig, trab, pot) { Object.assign(eq.horimetro, { ativo: true, fonte: 'tag', tagId: tag.id, limLigado: lig, limTrabalho: trab }); if (pot) eq.tagPotencia = pot.id; },
        el(s, x, y, extra = {}) { const S = SIMBOLOS[s]; const e = Object.assign({ id: uid('el'), s, x, y, w: S.w, h: S.h, rot: 0, rotulo: '', tags: [] }, extra); pl.sinotico.elementos.push(e); return e; },
        tubo(pts, eq) { pl.sinotico.elementos.push({ id: uid('el'), s: 'tubo', pts, eq: eq ? eq.id : '' }); }
    };
    return b;
}
/** Motor padrão: corrente, estado (retorno), comando liga/desliga, potência calculada e horímetro. */
function motorPadrao(b, eq, base, rotulo, iVazio, iCarga, tensaoVar, fpVar) {
    const vb = base.replace(/\//g, '_');
    const I = b.tag(eq, { nome: `Corrente ${rotulo}`, variavel: `i_${vb}`, tipo: 'corrente', topico: `${base}/corrente`, lim: { h: +(iCarga * 1.15).toFixed(1), hh: +(iCarga * 1.3).toFixed(1), atrasoS: 10, histerese: 0.3 } });
    const E = b.tag(eq, { nome: `Estado ${rotulo}`, variavel: `est_${vb}`, tipo: 'estado', topico: `${base}/estado`, semDados: false });
    b.cmd(eq, { nome: `Ligar ${rotulo.replace(/^d[oa] /, '')}`, tipo: 'chave', topico: `${base}/cmd`, tagEstado: E.id });
    const P = b.tag(eq, { nome: `Potência ${rotulo}`, variavel: `p_${vb}`, tipo: 'potencia', origem: 'calc', expr: `pot_tri(${tensaoVar}, i_${vb}, ${fpVar})` });
    b.horimetro(eq, I, +(iVazio * 0.5).toFixed(1), +((iVazio + iCarga) / 2).toFixed(1), P);
    return { I, E, P };
}

const MODELOS_PRONTOS = {
    ubs: {
        nome: 'Unidade de recebimento, secagem e armazenagem de grãos',
        resumo: 'Balança, moega, elevadores, pré-limpeza, secador com fornalha (PID da temperatura do ar), redler, 2 silos com aeração, termometria, CO₂ e nível, estação meteorológica e quadro de energia.',
        montar(prefixo = 'fazenda/ubs') {
            const b = construtor('UBS — Recebimento, secagem e armazenagem', prefixo);
            const aRec = b.area('Recebimento'), aSec = b.area('Pré-limpeza e secagem'), aArm = b.area('Armazenagem'), aUt = b.area('Utilidades e clima');
            // utilidades primeiro (as potências usam a tensão e o FP do quadro)
            const qg = b.equip('Quadro geral (QGBT)', 'painel', aUt);
            b.tag(qg, { nome: 'Tensão de linha', variavel: 'tensao', tipo: 'tensao', topico: 'qgbt/tensao', lim: { l: 361, h: 418, ll: 342, hh: 437, atrasoS: 20, histerese: 2 } });
            b.tag(qg, { nome: 'Fator de potência', variavel: 'fp', tipo: 'fp', topico: 'qgbt/fp', lim: { l: 0.92, atrasoS: 300, histerese: 0.01 } });
            const est = b.equip('Estação meteorológica', 'estacao', aUt);
            b.tag(est, { nome: 'Temperatura externa', variavel: 't_ext', tipo: 'temperatura', topico: 'clima/temperatura' });
            b.tag(est, { nome: 'Umidade relativa externa', variavel: 'ur_ext', tipo: 'umidade', topico: 'clima/umidade' });
            b.tag(est, { nome: 'Ponto de orvalho externo', variavel: 'orvalho_ext', tipo: 'orvalho', origem: 'calc', expr: 'orvalho(t_ext, ur_ext)' });
            b.tag(est, { nome: 'Condição para aerar', variavel: 'pode_aerar', tipo: 'estado', origem: 'calc', expr: 'se(t_grao_s1 - t_ext >= 3 e ur_ext < 75, 1, 0)', dec: 0 });

            const bal = b.equip('Balança rodoviária', 'balanca', aRec);
            b.tag(bal, { nome: 'Peso na balança', variavel: 'peso_balanca', tipo: 'peso', topico: 'balanca/peso', dec: 0, faixa: [0, 60000] });
            const moega = b.equip('Moega', 'moega', aRec);
            const e1 = b.equip('Elevador 1 (recebimento)', 'elevador', aRec);
            const m1 = motorPadrao(b, e1, 'elevador1', 'do elevador 1', 3, 9, 'tensao', 'fp');
            const pre = b.equip('Pré-limpeza', 'prelimpeza', aSec);
            const m2 = motorPadrao(b, pre, 'prelimpeza', 'da pré-limpeza', 2.5, 6, 'tensao', 'fp');
            const sec = b.equip('Secador de coluna', 'secador', aSec);
            const ms = motorPadrao(b, sec, 'secador/ventilador', 'do ventilador do secador', 8, 18, 'tensao', 'fp');
            ms.E.variavel = 'est_vent_secador'; b.porVar.est_vent_secador = ms.E;
            const tAr = b.tag(sec, { nome: 'Temperatura do ar de secagem', variavel: 't_ar', tipo: 'temperatura', topico: 'secador/t_ar', faixa: [20, 130], lim: { h: 105, hh: 115, atrasoS: 15, histerese: 2 } });
            b.tag(sec, { nome: 'Temperatura da massa de grãos', variavel: 't_massa', tipo: 'temperatura', topico: 'secador/t_massa', faixa: [10, 60], lim: { h: 42, hh: 45, atrasoS: 30, histerese: 1 } });
            b.tag(sec, { nome: 'Umidade do grão na entrada', variavel: 'ug_entrada', tipo: 'umidade_grao', topico: 'secador/ug_entrada' });
            b.tag(sec, { nome: 'Umidade do grão na saída', variavel: 'ug_saida', tipo: 'umidade_grao', topico: 'secador/ug_saida', lim: { l: 12, ll: 11, h: 14.5, atrasoS: 120, histerese: 0.2 } });
            const spAr = b.tag(sec, { nome: 'Setpoint da temperatura do ar', variavel: 'sp_t_ar', tipo: 'temperatura', topico: 'secador/sp_t_ar', semDados: false });
            b.cmd(sec, { nome: 'Setpoint do ar de secagem', tipo: 'setpoint', topico: 'secador/sp_t_ar', tagEstado: spAr.id, min: 40, max: 110, passo: 1, unidade: '°C' });
            const forn = b.equip('Fornalha', 'fornalha', aSec);
            b.tag(forn, { nome: 'Temperatura da fornalha', variavel: 't_fornalha', tipo: 'temperatura', topico: 'fornalha/temperatura', faixa: [100, 900], lim: { h: 750, hh: 850, atrasoS: 10, histerese: 10 } });
            const reg = b.tag(forn, { nome: 'Abertura do registro de ar quente', variavel: 'u_registro', tipo: 'percentual', origem: 'controle' });
            const e2 = b.equip('Elevador 2 (silos)', 'elevador', aArm);
            motorPadrao(b, e2, 'elevador2', 'do elevador 2', 3, 9, 'tensao', 'fp');
            const red = b.equip('Transportador de corrente', 'transportador', aArm);
            motorPadrao(b, red, 'redler', 'do redler', 2, 5.5, 'tensao', 'fp');
            const silos = [1, 2].map(n => {
                const s = b.equip(`Silo ${n}`, 'silo', aArm);
                b.tag(s, { nome: `Temperatura do grão (máx.) silo ${n}`, variavel: `t_grao_s${n}`, tipo: 'temperatura', topico: `silo${n}/termometria/max`, faixa: [10, 40], lim: { h: 28, hh: 32, atrasoS: 300, histerese: 0.5 } });
                b.tag(s, { nome: `CO₂ no espaço livre silo ${n}`, variavel: `co2_s${n}`, tipo: 'co2', topico: `silo${n}/co2`, lim: { h: 1500, hh: 3000, atrasoS: 600, histerese: 50 } });
                b.tag(s, { nome: `Nível silo ${n}`, variavel: `nivel_s${n}`, tipo: 'nivel', topico: `silo${n}/nivel`, lim: { h: 95, atrasoS: 30, histerese: 1 } });
                b.tag(s, { nome: `Pressão estática da aeração silo ${n}`, variavel: `p_aer_s${n}`, tipo: 'pressao', topico: `silo${n}/aeracao/pressao`, faixa: [0, 2] });
                const v = b.equip(`Ventilador de aeração ${n}`, 'ventilador', aArm);
                const mv = motorPadrao(b, v, `silo${n}/ventilador`, `do ventilador ${n}`, 6, 14, 'tensao', 'fp');
                return { s, v, mv };
            });
            b.tag(qg, { nome: 'Corrente total', variavel: 'i_total', tipo: 'corrente', origem: 'calc', expr: 'i_elevador1 + i_prelimpeza + i_secador_ventilador + i_elevador2 + i_redler + i_silo1_ventilador + i_silo2_ventilador' });
            const pTot = b.tag(qg, { nome: 'Potência total', variavel: 'p_total', tipo: 'potencia', origem: 'calc', expr: 'pot_tri(tensao, i_total, fp)' });
            b.tag(qg, { nome: 'Energia consumida', variavel: 'energia_total', tipo: 'energia', origem: 'integral', fonteIntegral: pTot.id });
            // controle: PID da temperatura do ar com intertravamento pelo ventilador
            b.pl.controladores.push(criarControlador({ nome: 'Temperatura do ar de secagem', tipo: 'pid', Ts: 2, ativo: true, entradas: [tAr.id], referencias: ['sp_t_ar'],
                saidas: [{ topico: 'fornalha/registro', tagId: reg.id }], limites: { min: 0, max: 100, taxa: 5 }, habilitarSe: 'est_vent_secador == 1',
                params: Object.assign(criarControlador().params, { kp: 3, ki: 0.03, kd: 0, N: 10 }) }));
            b.pl.publicacoes.push(criarPublicacao({ nome: 'Aeração automática do silo 1', topico: 'silo1/ventilador/cmd', expr: 'pode_aerar', periodoS: 60, soQuandoMuda: true, retain: true, qos: 1, ativo: false }));
            b.pl.alarmesExtra.push({ id: uid('ax'), nome: 'Silo 1: aerando com o grão abaixo do ponto de orvalho do ar (risco de condensação)', expr: 'est_silo1_ventilador == 1 e t_grao_s1 < orvalho_ext', prioridade: 3, atrasoS: 120, ativo: true });
            b.pl.alarmesExtra.push({ id: uid('ax'), nome: 'Secador: fornalha acesa com o ventilador desligado', expr: 'est_vent_secador == 0 e t_ar > 60', prioridade: 1, atrasoS: 10, ativo: true });
            // sinótico (1600 × 900)
            const S = b.pl.sinotico; S.largura = 1600; S.altura = 900;
            b.el('area', 20, 30, { w: 360, h: 840, rotulo: 'Recebimento' }); b.el('area', 400, 30, { w: 470, h: 840, rotulo: 'Pré-limpeza e secagem' }); b.el('area', 890, 30, { w: 690, h: 640, rotulo: 'Armazenagem' }); b.el('area', 890, 690, { w: 690, h: 180, rotulo: 'Utilidades e clima' });
            b.el('balanca', 40, 120, { eq: bal.id, rotulo: 'Balança', tags: [b.porVar.peso_balanca.id] });
            b.el('moega', 60, 560, { eq: moega.id, rotulo: 'Moega' });
            b.el('elevador', 260, 330, { eq: e1.id, rotulo: 'Elevador 1', h: 340, tags: [m1.I.id, m1.P.id] });
            b.tubo([[190, 600], [260, 650]], e1);
            b.el('prelimpeza', 430, 120, { eq: pre.id, rotulo: 'Pré-limpeza', tags: [m2.I.id] });
            b.tubo([[306, 345], [380, 345], [380, 160], [430, 160]], e1);
            b.el('secador', 680, 160, { eq: sec.id, rotulo: 'Secador', h: 300, tags: [tAr.id, b.porVar.t_massa.id, b.porVar.ug_saida.id] });
            b.tubo([[550, 160], [690, 160]], pre);
            b.el('fornalha', 470, 400, { eq: forn.id, rotulo: 'Fornalha', tags: [b.porVar.t_fornalha.id, reg.id] });
            b.tubo([[550, 440], [690, 440]], sec);
            b.el('setpoint', 430, 640, { cmd: b.pl.comandos.find(c => c.tipo === 'setpoint').id });
            b.el('chave', 430, 700, { cmd: b.pl.comandos.find(c => c.topico === 'secador/ventilador/cmd').id, w: 230 });
            b.el('elevador', 910, 300, { eq: e2.id, rotulo: 'Elevador 2', h: 320 });
            b.tubo([[730, 520], [730, 600], [910, 600]], sec);
            b.el('transportador', 960, 120, { eq: red.id, rotulo: 'Redler', w: 560, tags: [] });
            b.tubo([[956, 310], [956, 160]], e2);
            silos.forEach((x, i) => {
                const X = 1060 + i * 260;
                b.el('silo', X, 230, { eq: x.s.id, rotulo: `Silo ${i + 1}`, w: 130, h: 230, tagNivel: b.porVar[`nivel_s${i + 1}`].id, tags: [b.porVar[`t_grao_s${i + 1}`].id, b.porVar[`co2_s${i + 1}`].id] });
                b.tubo([[X + 65, 152], [X + 65, 232]], red);
                b.el('ventilador', X - 70, 520, { eq: x.v.id, rotulo: `Aeração ${i + 1}`, tags: [x.mv.I.id] });
                b.tubo([[X - 6, 552], [X + 30, 552], [X + 30, 440]], x.v);
                b.el('chave', X - 70, 610, { cmd: b.pl.comandos.find(c => c.topico === `silo${i + 1}/ventilador/cmd`).id, w: 200 });
            });
            b.el('painel', 920, 740, { eq: qg.id, rotulo: 'QGBT', tags: [] });
            b.el('valor', 1010, 735, { tag: pTot.id }); b.el('valor', 1010, 795, { tag: b.porVar.energia_total.id });
            b.el('valor', 1170, 735, { tag: b.porVar.tensao.id }); b.el('valor', 1170, 795, { tag: b.porVar.fp.id });
            b.el('estacao', 1350, 735, { eq: est.id, rotulo: '', h: 110 });
            b.el('valor', 1420, 715, { tag: b.porVar.t_ext.id }); b.el('valor', 1420, 770, { tag: b.porVar.ur_ext.id }); b.el('valor', 1420, 825, { tag: b.porVar.orvalho_ext.id, h: 40 });
            // simulação
            b.pl.simulacao = { modelos: [
                ...['elevador1', 'prelimpeza', 'secador/ventilador', 'elevador2', 'redler', 'silo1/ventilador', 'silo2/ventilador'].map((k, i) => ({ nome: 'm' + i, tipo: 'chave', cmd: `${k}/cmd`, estado: `${k}/estado`, inicial: i < 5 ? 1 : 0 })),
                { nome: 'u_reg', tipo: 'entrada', topico: 'fornalha/registro', inicial: 0 },
                { nome: 'sp', tipo: 'entrada', topico: 'secador/sp_t_ar', inicial: 80, publicarInicial: true },
                { nome: 'carga', tipo: 'alg', expr: 'pulso(300, 0.7)' },
                { nome: 'carga2', tipo: 'alg', expr: 'pulso(420, 0.6)' },
                { nome: 'ia', tipo: 'alg', expr: 'm0 * (3 + 6 * carga)', topico: 'elevador1/corrente', ruido: 0.12, min: 0, dec: 1 },
                { nome: 'ib', tipo: 'alg', expr: 'm1 * (2.5 + 3.5 * carga)', topico: 'prelimpeza/corrente', ruido: 0.1, min: 0, dec: 1 },
                { nome: 'ic', tipo: 'alg', expr: 'm2 * 17', topico: 'secador/ventilador/corrente', ruido: 0.2, min: 0, dec: 1 },
                { nome: 'id', tipo: 'alg', expr: 'm3 * (3 + 6 * carga2)', topico: 'elevador2/corrente', ruido: 0.12, min: 0, dec: 1 },
                { nome: 'ie', tipo: 'alg', expr: 'm4 * (2 + 3.5 * carga2)', topico: 'redler/corrente', ruido: 0.1, min: 0, dec: 1 },
                { nome: 'if1', tipo: 'alg', expr: 'm5 * 13', topico: 'silo1/ventilador/corrente', ruido: 0.15, min: 0, dec: 1 },
                { nome: 'if2', tipo: 'alg', expr: 'm6 * 13', topico: 'silo2/ventilador/corrente', ruido: 0.15, min: 0, dec: 1 },
                { nome: 'v', tipo: 'alg', expr: '381 + 4 * onda(900)', topico: 'qgbt/tensao', ruido: 1, dec: 0 },
                { nome: 'f', tipo: 'alg', expr: '0.9 - 0.03 * carga', topico: 'qgbt/fp', ruido: 0.005, dec: 2 },
                { nome: 'text', tipo: 'alg', expr: '21 + 5 * onda(3600)', topico: 'clima/temperatura', ruido: 0.1 },
                { nome: 'urext', tipo: 'alg', expr: '68 - 14 * onda(3600)', topico: 'clima/umidade', ruido: 0.4, max: 100 },
                { nome: 'tar', tipo: 'din', deriv: '(text + 0.9 * m2 * u_reg - x) / 120', inicial: 25, topico: 'secador/t_ar', ruido: 0.3 },
                { nome: 'tforn', tipo: 'alg', expr: '180 + 5.5 * u_reg', topico: 'fornalha/temperatura', ruido: 4, dec: 0 },
                { nome: 'tmassa', tipo: 'din', deriv: '(0.5 * tar + 0.5 * text - x) / 600', inicial: 24, topico: 'secador/t_massa', ruido: 0.1 },
                { nome: 'uge', tipo: 'alg', expr: '19 + 1.5 * onda(2400)', topico: 'secador/ug_entrada', ruido: 0.1 },
                { nome: 'ugs', tipo: 'din', deriv: '(uge - 0.09 * max(0, tar - 35) - x) / 900', inicial: 17, topico: 'secador/ug_saida', ruido: 0.05 },
                { nome: 'tg1', tipo: 'din', deriv: 'se(m5, (text - x) / 1500, 0.0006)', inicial: 29, topico: 'silo1/termometria/max', ruido: 0.05 },
                { nome: 'tg2', tipo: 'din', deriv: 'se(m6, (text - x) / 1500, 0.0004)', inicial: 25, topico: 'silo2/termometria/max', ruido: 0.05 },
                { nome: 'co21', tipo: 'alg', expr: '450 + 140 * max(0, tg1 - 24)', topico: 'silo1/co2', ruido: 15, dec: 0 },
                { nome: 'co22', tipo: 'alg', expr: '450 + 140 * max(0, tg2 - 24)', topico: 'silo2/co2', ruido: 15, dec: 0 },
                { nome: 'n1', tipo: 'din', deriv: 'se(m4 * carga2 * (x < 98), 0.006, 0)', inicial: 64, topico: 'silo1/nivel', dec: 1 },
                { nome: 'n2', tipo: 'din', deriv: '0', inicial: 41, topico: 'silo2/nivel', dec: 1 },
                { nome: 'pa1', tipo: 'alg', expr: 'm5 * 1.1', topico: 'silo1/aeracao/pressao', ruido: 0.02, min: 0 },
                { nome: 'pa2', tipo: 'alg', expr: 'm6 * 1.0', topico: 'silo2/aeracao/pressao', ruido: 0.02, min: 0 },
                { nome: 'peso', tipo: 'alg', expr: 'pulso(600, 0.35) * 41800', topico: 'balanca/peso', ruido: 15, min: 0, dec: 0 }
            ] };
            return b.pl;
        }
    },
    camara: {
        nome: 'Câmaras frias de frutas e hortaliças',
        resumo: 'Duas câmaras com temperatura, umidade, CO₂ e porta; compressores com controle liga/desliga pela temperatura, horímetros, energia e alarmes de porta aberta e congelamento.',
        montar(prefixo = 'fazenda/frio') {
            const b = construtor('Câmaras frias', prefixo);
            const aC = b.area('Câmaras'), aM = b.area('Casa de máquinas');
            const qg = b.equip('Medidor de energia', 'painel', aM);
            b.tag(qg, { nome: 'Tensão de linha', variavel: 'tensao', tipo: 'tensao', topico: 'energia/tensao', lim: { l: 361, h: 418, atrasoS: 20, histerese: 2 } });
            b.tag(qg, { nome: 'Fator de potência', variavel: 'fp', tipo: 'fp', topico: 'energia/fp' });
            const cams = [1, 2].map(n => {
                const c = b.equip(`Câmara ${n}`, 'camara', aC);
                const T = b.tag(c, { nome: `Temperatura câmara ${n}`, variavel: `t_c${n}`, tipo: 'temperatura', topico: `camara${n}/temperatura`, faixa: [-4, 12], lim: { ll: -1, l: -0.5, h: 2, hh: 4, atrasoS: 300, histerese: 0.2 } });
                b.tag(c, { nome: `Umidade câmara ${n}`, variavel: `ur_c${n}`, tipo: 'umidade', topico: `camara${n}/umidade`, lim: { l: 85, h: 98, atrasoS: 600, histerese: 1 } });
                b.tag(c, { nome: `CO₂ câmara ${n}`, variavel: `co2_c${n}`, tipo: 'co2', topico: `camara${n}/co2`, lim: { h: 5000, hh: 10000, atrasoS: 600, histerese: 100 } });
                b.tag(c, { nome: `Porta câmara ${n}`, variavel: `porta_c${n}`, tipo: 'estado', topico: `camara${n}/porta`, lim: { h: 0.5, atrasoS: 300, prioridadeAvisos: 3 } });
                const sp = b.tag(c, { nome: `Setpoint câmara ${n}`, variavel: `sp_c${n}`, tipo: 'temperatura', topico: `camara${n}/sp`, semDados: false });
                b.cmd(c, { nome: `Setpoint câmara ${n}`, tipo: 'setpoint', topico: `camara${n}/sp`, tagEstado: sp.id, min: -2, max: 12, passo: 0.5, unidade: '°C' });
                const comp = b.equip(`Compressor ${n}`, 'compressor', aM);
                const m = motorPadrao(b, comp, `compressor${n}`, `do compressor ${n}`, 4, 11, 'tensao', 'fp');
                const evap = b.equip(`Evaporador ${n}`, 'evaporador', aC);
                b.pl.controladores.push(criarControlador({ nome: `Temperatura da câmara ${n} (liga/desliga)`, tipo: 'onoff', Ts: 5, ativo: true, entradas: [T.id], referencias: [`sp_c${n}`],
                    saidas: [{ topico: `compressor${n}/cmd`, tagId: '' }], limites: { min: 0, max: 1, taxa: 0 }, params: Object.assign(criarControlador().params, { histerese: 1, acao: 'reversa' }) }));
                return { c, T, comp, evap, m };
            });
            const pT = b.tag(qg, { nome: 'Potência total', variavel: 'p_total', tipo: 'potencia', origem: 'calc', expr: 'p_compressor1 + p_compressor2' });
            b.tag(qg, { nome: 'Energia consumida', variavel: 'energia_total', tipo: 'energia', origem: 'integral', fonteIntegral: pT.id });
            const S = b.pl.sinotico; S.largura = 1200; S.altura = 700;
            b.el('area', 20, 30, { w: 740, h: 640, rotulo: 'Câmaras' }); b.el('area', 780, 30, { w: 400, h: 640, rotulo: 'Casa de máquinas' });
            cams.forEach((x, i) => {
                const Y = 90 + i * 300;
                b.el('camara', 60, Y, { eq: x.c.id, rotulo: `Câmara ${i + 1}`, w: 260, h: 170, tags: [x.T.id, b.porVar[`ur_c${i + 1}`].id, b.porVar[`co2_c${i + 1}`].id, b.porVar[`porta_c${i + 1}`].id] });
                b.el('evaporador', 200, Y + 10, { eq: x.evap.id, rotulo: '' });
                b.el('setpoint', 400, Y + 20, { cmd: b.pl.comandos.find(c => c.topico === `camara${i + 1}/sp`).id, w: 220 });
                b.el('chave', 400, Y + 80, { cmd: b.pl.comandos.find(c => c.topico === `compressor${i + 1}/cmd`).id, w: 260 });
                b.el('compressor', 860, Y + 40, { eq: x.comp.id, rotulo: `Compressor ${i + 1}`, tags: [x.m.I.id, x.m.P.id] });
                b.tubo([[860, Y + 68], [700, Y + 68], [700, Y + 25], [290, Y + 25]], x.comp);
            });
            b.el('painel', 1050, 90, { eq: qg.id, rotulo: 'Medidor' });
            b.el('valor', 1000, 230, { tag: pT.id }); b.el('valor', 1000, 290, { tag: b.porVar.energia_total.id });
            b.pl.simulacao = { modelos: [
                { nome: 'c1', tipo: 'chave', cmd: 'compressor1/cmd', estado: 'compressor1/estado', inicial: 1 },
                { nome: 'c2', tipo: 'chave', cmd: 'compressor2/cmd', estado: 'compressor2/estado', inicial: 1 },
                { nome: 'sp1', tipo: 'entrada', topico: 'camara1/sp', inicial: 0.5, publicarInicial: true }, { nome: 'sp2', tipo: 'entrada', topico: 'camara2/sp', inicial: 1, publicarInicial: true },
                { nome: 'porta1', tipo: 'alg', expr: 'pulso(1500, 0.06)', topico: 'camara1/porta', dec: 0 },
                { nome: 'porta2', tipo: 'alg', expr: 'pulso(2100, 0.04)', topico: 'camara2/porta', dec: 0 },
                { nome: 't1', tipo: 'din', deriv: 'se(c1, (-7 - x) / 900, (16 - x) / 9000) + porta1 * 0.004', inicial: 1.5, topico: 'camara1/temperatura', ruido: 0.05 },
                { nome: 't2', tipo: 'din', deriv: 'se(c2, (-7 - x) / 1000, (16 - x) / 8000) + porta2 * 0.004', inicial: 2, topico: 'camara2/temperatura', ruido: 0.05 },
                { nome: 'u1', tipo: 'alg', expr: '92 - 3 * c1 + 2 * onda(1800)', topico: 'camara1/umidade', ruido: 0.3, max: 100 },
                { nome: 'u2', tipo: 'alg', expr: '91 - 3 * c2 + 2 * onda(2000)', topico: 'camara2/umidade', ruido: 0.3, max: 100 },
                { nome: 'g1', tipo: 'alg', expr: '2200 + 600 * onda(7200)', topico: 'camara1/co2', ruido: 30, dec: 0 },
                { nome: 'g2', tipo: 'alg', expr: '1800 + 500 * onda(6000)', topico: 'camara2/co2', ruido: 30, dec: 0 },
                { nome: 'i1', tipo: 'alg', expr: 'c1 * 10.5', topico: 'compressor1/corrente', ruido: 0.2, min: 0, dec: 1 },
                { nome: 'i2', tipo: 'alg', expr: 'c2 * 10.5', topico: 'compressor2/corrente', ruido: 0.2, min: 0, dec: 1 },
                { nome: 'v', tipo: 'alg', expr: '380 + 3 * onda(600)', topico: 'energia/tensao', ruido: 1, dec: 0 },
                { nome: 'f', tipo: 'alg', expr: '0.88', topico: 'energia/fp', ruido: 0.005, dec: 2 }
            ] };
            return b.pl;
        }
    },
    bancada: {
        nome: 'Bancada didática de controle (planta térmica)',
        resumo: 'Resistência + câmara (2ª ordem). Traz um PID e uma realimentação de estados com observador (matrizes A, B, C, K, L, Nr) para comparar; ganhos podem ser trocados por arquivo .m ou por MQTT.',
        montar(prefixo = 'lab/bancada') {
            const b = construtor('Bancada de controle térmico', prefixo);
            const a = b.area('Bancada');
            const pl = b.equip('Planta térmica', 'secador', a);
            b.tag(pl, { nome: 'Temperatura ambiente', variavel: 't_amb', tipo: 'temperatura', topico: 'ambiente' });
            const Tr = b.tag(pl, { nome: 'Temperatura da resistência', variavel: 't_res', tipo: 'temperatura', topico: 'resistencia/temperatura', faixa: [15, 120], lim: { h: 110, hh: 120, atrasoS: 5, histerese: 2 } });
            const Tc = b.tag(pl, { nome: 'Temperatura da câmara', variavel: 't_cam', tipo: 'temperatura', topico: 'camara/temperatura', faixa: [15, 80] });
            const sp = b.tag(pl, { nome: 'Referência', variavel: 'ref', tipo: 'temperatura', topico: 'referencia', semDados: false });
            b.cmd(pl, { nome: 'Referência da câmara', tipo: 'setpoint', topico: 'referencia', tagEstado: sp.id, min: 20, max: 70, passo: 1, unidade: '°C' });
            const y1 = b.tag(pl, { nome: 'Elevação da resistência', variavel: 'dy_res', tipo: 'temperatura', origem: 'calc', expr: 't_res - t_amb' });
            const y2 = b.tag(pl, { nome: 'Elevação da câmara', variavel: 'dy_cam', tipo: 'temperatura', origem: 'calc', expr: 't_cam - t_amb' });
            const u = b.tag(pl, { nome: 'Potência na resistência', variavel: 'u', tipo: 'percentual', origem: 'controle' });
            void y1;
            b.pl.controladores.push(criarControlador({ nome: 'PID da câmara', tipo: 'pid', Ts: 1, ativo: true, entradas: [Tc.id], referencias: ['ref'], saidas: [{ topico: 'resistencia/potencia', tagId: u.id }],
                limites: { min: 0, max: 100, taxa: 0 }, params: Object.assign(criarControlador().params, { kp: 4, ki: 0.06, kd: 0, N: 10 }) }));
            b.pl.controladores.push(criarControlador({ nome: 'Realimentação de estados com observador', tipo: 'obs', Ts: 1, ativo: false, entradas: [y2.id], referencias: ['ref - t_amb'], saidas: [{ topico: 'resistencia/potencia', tagId: u.id }],
                limites: { min: 0, max: 100, taxa: 0 },
                params: Object.assign(criarControlador().params, {
                    A: '[0.951229 0; 0.016121 0.983471]', B: '[0.039016; 0.000326]', C: '[0 1]', D: '', K: '[1.45263 3.07422]', L: '[0.86092; 0.26949]', Nr: '[5.77685]'
                }) }));
            const S = b.pl.sinotico; S.largura = 1000; S.altura = 560;
            b.el('area', 20, 20, { w: 960, h: 520, rotulo: 'Bancada de controle térmico (Ts = 1 s)' });
            b.el('secador', 120, 90, { eq: pl.id, rotulo: 'Planta térmica', h: 300, tags: [Tc.id, Tr.id, u.id] });
            b.el('setpoint', 420, 120, { cmd: b.pl.comandos[0].id, w: 240 });
            b.el('valor', 420, 200, { tag: Tc.id, w: 240 }); b.el('valor', 420, 260, { tag: u.id, w: 240 }); b.el('valor', 420, 320, { tag: b.porVar.t_amb.id, w: 240 });
            b.el('texto', 420, 420, { rotulo: 'Troque o controlador em Controle (só um ativo por vez).', w: 520, h: 24 });
            b.pl.simulacao = { modelos: [
                { nome: 'u', tipo: 'entrada', topico: 'resistencia/potencia', inicial: 0 },
                { nome: 'ref', tipo: 'entrada', topico: 'referencia', inicial: 45, publicarInicial: true },
                { nome: 'tamb', tipo: 'alg', expr: '22 + 0.5 * onda(3600)', topico: 'ambiente', ruido: 0.03 },
                { nome: 'x1', tipo: 'din', deriv: '(-x + 0.8 * u) / 20', inicial: 0 },
                { nome: 'x2', tipo: 'din', deriv: '(x1 - x) / 60', inicial: 0 },
                { nome: 'tr', tipo: 'alg', expr: 'tamb + x1', topico: 'resistencia/temperatura', ruido: 0.05 },
                { nome: 'tc', tipo: 'alg', expr: 'tamb + x2', topico: 'camara/temperatura', ruido: 0.05 }
            ] };
            return b.pl;
        }
    }
};

/** Planta em branco já com uma área (para não começar do nada). */
function plantaEmBranco(nome = 'Minha planta') {
    const pl = criarPlanta(nome);
    pl.areas.push(criarArea('Área 1'));
    pl.sinotico.largura = 1400; pl.sinotico.altura = 800;
    return pl;
}
