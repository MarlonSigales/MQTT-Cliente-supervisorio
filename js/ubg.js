/**
 * © 2026 Supervisório MQTT — Inova Agro UFPel EMBRAPII. Código aberto; cópias permitidas desde que citadas.
 *
 * MODELO PRONTO: UBG DE ARROZ COMPLETA (recebimento → pré-limpeza → secagem → armazenagem → engenho → expedição),
 * montada com os mesmos símbolos e kits do editor (tópicos área/elemento/grandeza), linhas ligadas porta a porta e uma
 * PLANTA VIRTUAL que funciona num broker público (padrão: wss://broker.emqx.io:8084/mqtt) como se fosse o campo:
 * publica todos os sensores, segue os comandos (liga/desliga com retorno, setpoints) e responde ao pedido de status
 * (<prefixo>/status/get → <prefixo>/status com todos os tópicos).
 *
 * Balanço de massa do engenho (ponto de partida, arroz em casca → branco polido):
 *   casca ≈ 20 % × grau de descascamento; farelo ≈ 9 %; arroz branco ≈ 71 %, dividido em inteiros e quebrados;
 *   quebrados sobem com a pressão dos rolos do descascador (0,08 + 0,12·(p/100)²); a selecionadora rejeita 1–4 %.
 * Capacidades: recebimento 60 t/h, secador contínuo, 2 silos de 1.000 t, silo pulmão de 30 t (níveis em %), engenho 8 t/h (setpoint
 * na balança de fluxo). Para demonstrar alarmes, o elevador do despedregador "patina" por ~1 min a cada 30 min.
 * Broker público: qualquer pessoa pode ler e publicar. Use só para demonstração, nunca para comandar equipamento real.
 */

'use strict';

MODELOS_PRONTOS.ubg_arroz = {
    nome: 'UBG de arroz completa (planta virtual no broker.emqx.io)',
    resumo: 'Recebimento, pré-limpeza, secador com fornalha, 2 silos com termometria/CO₂/metano/fosfina, engenho (limpeza, despedregador, descascador, mesa de marinheiros, brunidor, polidor, trieur, selecionadora), subprodutos e ensaque. Planta virtual publica no broker público e responde ao status.',
    montar(prefixo) {
        prefixo = prefixo || `inovaagro/ubg_arroz/${Math.random().toString(16).slice(2, 6)}`;
        const b = construtor('UBG de arroz — beneficiamento completo', prefixo);
        const pl = b.pl;
        pl.conexao.tipo = 'mqtt'; pl.conexao.url = 'wss://broker.emqx.io:8084/mqtt'; pl.conexao.campoVirtual = true; pl.conexao.qos = 0;
        const A = { rec: b.area('Recebimento'), sec: b.area('Secagem'), arm: b.area('Armazenagem'), eng: b.area('Engenho'), sub: b.area('Subprodutos'), exp: b.area('Expedição'), ut: b.area('Utilidades') };
        const S = pl.sinotico; S.largura = 2300; S.altura = 1260; S.grade = 10;
        // ---- quadros de área (desenho)
        b.el('area', 20, 40, { w: 540, h: 520, rotulo: 'Recebimento' }); b.el('area', 580, 40, { w: 700, h: 520, rotulo: 'Pré-limpeza e secagem' });
        b.el('area', 1300, 40, { w: 700, h: 520, rotulo: 'Armazenagem' }); b.el('area', 2020, 40, { w: 260, h: 520, rotulo: 'Utilidades' });
        b.el('area', 20, 620, { w: 1540, h: 620, rotulo: 'Engenho e subprodutos' }); b.el('area', 1580, 620, { w: 360, h: 620, rotulo: 'Expedição' });
        // ---- elementos com kit (equipamento, variáveis e comandos com tópico área/elemento/grandeza)
        const ren = [];
        const K = (s, x, y, nome, area, extra = {}) => {
            const Sm = SIMBOLOS[s];
            const el = Object.assign({ id: uid('el'), s, x, y, w: Sm.w, h: Sm.h, rot: 0, rotulo: nome, tags: [] }, extra);
            if (Sm.n && el.n == null) el.n = Sm.n;
            aplicarKitSimbolo(pl, el, Sm);
            pl.sinotico.elementos.push(el);
            const eq = pl.equipamentos.find(e => e.id === el.eq);
            if (eq) {
                const velho = eq.nome; eq.nome = nome; eq.areaId = area.id; el.rotulo = nome;
                pl.tags.filter(t => t.equipId === eq.id).forEach(t => { t.nome = t.nome.split(velho).join(nome); t.areaId = area.id; ren.push(t); });
                pl.comandos.filter(c => c.equipId === eq.id).forEach(c => { c.nome = c.nome.split(velho).join(nome); });
            }
            el.eqObj = eq;
            return el;
        };
        // utilidades primeiro: as potências dos motores usam a tensão e o FP do QGBT
        const qg = K('qgbt', 2050, 110, 'QGBT', A.ut);
        const est = K('estacao', 2170, 110, 'Estação meteorológica', A.ut);
        // recebimento
        const cam = b.el('caminhao_graneleiro', 40, 170, { rotulo: 'Caminhão' });
        const bal = K('balanca', 40, 470, 'Balança rodoviária', A.rec);
        const cal = K('amostrador', 300, 80, 'Calador', A.rec);
        const moe = K('moega', 55, 330, 'Moega', A.rec);
        const e1 = K('elevador', 420, 160, 'Elevador da moega', A.rec);
        // secagem
        const pre = K('prelimpeza', 600, 110, 'Pré-limpeza', A.sec);
        const forn = K('fornalha', 780, 160, 'Fornalha', A.sec);
        const e2 = K('elevador', 740, 290, 'Elevador do secador', A.sec);
        const sec = K('secador', 900, 150, 'Secador', A.sec);
        const vsec = K('ventilador_centrifugo', 1040, 120, 'Ventilador do secador', A.sec);
        const e3 = K('elevador', 1150, 290, 'Elevador dos silos', A.sec);
        // armazenagem
        const red = K('transportador', 1375, 80, 'Redler dos silos', A.arm, { w: 400, n: 2 });
        const s1 = K('silo', 1420, 160, 'Silo 1', A.arm), s2 = K('silo', 1620, 160, 'Silo 2', A.arm);
        const va1 = K('ventilador', 1330, 270, 'Aeração do silo 1', A.arm), va2 = K('ventilador', 1545, 270, 'Aeração do silo 2', A.arm);
        const cor = K('correia', 1450, 440, 'Correia de descarga', A.arm);
        const e4 = K('elevador', 1900, 280, 'Elevador do engenho', A.arm);
        // engenho
        const pul = K('silo_pulmao', 50, 660, 'Silo pulmão', A.eng);
        const bfl = K('balanca_fluxo', 45, 820, 'Balança de fluxo', A.eng);
        const lim = K('maquina_limpeza', 40, 1040, 'Máquina de limpeza', A.eng);
        const e5 = K('elevador', 230, 930, 'Elevador do despedregador', A.eng);
        const ped = K('separador_pedras', 330, 680, 'Despedregador', A.eng);
        const des = K('descascador', 294, 850, 'Descascador', A.eng);
        const mar = K('separador_marinheiros', 329, 1075, 'Mesa de marinheiros', A.eng);
        const asp = K('aspirador_casca', 480, 860, 'Aspirador de casca', A.eng);
        const cic = K('ciclone_casca', 580, 640, 'Ciclone de casca', A.sub);
        const bca = K('balanca_residuo', 585, 850, 'Balança de casca', A.sub);
        const e6 = K('elevador', 720, 920, 'Elevador do brunidor', A.eng);
        const bru = K('brunidor', 820, 680, 'Brunidor', A.eng);
        const pol = K('polidor', 844, 900, 'Polidor', A.eng);
        const fil = K('filtro_mangas', 990, 660, 'Filtro de farelo', A.sub);
        const bfa = K('balanca_residuo', 1000, 860, 'Balança de farelo', A.sub);
        const e7 = K('elevador', 1120, 940, 'Elevador do trieur', A.eng);
        const tri = K('trieur', 1220, 690, 'Trieur', A.eng);
        const sel = K('selecionadora_optica', 1185, 850, 'Selecionadora óptica', A.eng, { n: 2 });
        const bqu = K('balanca_residuo', 1400, 820, 'Balança de quebrados', A.sub);
        const brj = K('balanca_residuo', 1257, 1070, 'Balança de rejeito', A.sub);
        const e8 = K('elevador', 1500, 990, 'Elevador do ensaque', A.eng);
        // expedição
        const ens = K('ensacadora', 1640, 690, 'Ensacadora', A.exp);
        const bau = b.el('caminhao_bau', 1610, 1010, { rotulo: 'Caminhão de expedição' });
        // os nomes das variáveis acompanham os nomes novos (e as equações de potência junto)
        const troca = new Map();
        ren.forEach(t => { const v = t.variavel; t.variavel = ''; troca.set(t, v); });
        garantirVariaveis(pl);
        const mapa = [...troca].map(([t, v]) => [v, t.variavel]).filter(([v, n]) => v && v !== n).sort((a, b) => b[0].length - a[0].length);
        pl.tags.forEach(t => { if (t.expr) mapa.forEach(([v, n]) => { t.expr = t.expr.replace(new RegExp(`\\b${v}\\b`, 'g'), n); }); });
        atualizarTopicosAuto(pl);
        // ---- ligações porta a porta (o tipo da linha vem das portas)
        const P = (el, tipo, io, i = 0) => portasDoElemento(el).filter(p => p.tipo === tipo && p.io === io)[i].id;
        const L = (a, ta, ia, c, tc, ic, meio) => b.liga(a, P(a, ta, 's', ia), c, P(c, tc || ta, 'e', ic || 0), a.eqObj, meio);
        L(cam, 'material', 0, moe); L(moe, 'material', 0, e1); L(e1, 'material', 0, pre); L(pre, 'material', 0, e2);
        L(e2, 'material', 0, sec); L(forn, 'ar', 0, sec); L(sec, 'ar', 0, vsec); L(sec, 'material', 0, e3); L(e3, 'material', 0, red);
        L(red, 'material', 0, s1); L(red, 'material', 1, s2); L(va1, 'ar', 0, s1); L(va2, 'ar', 0, s2);
        L(s1, 'material', 0, cor); L(s2, 'material', 0, cor); L(cor, 'material', 0, e4);
        L(e4, 'material', 0, pul, null, 0, [[1990, 290], [1990, 590], [85, 590]]);
        L(pul, 'material', 0, bfl); L(bfl, 'material', 0, lim); L(lim, 'material', 0, e5); L(e5, 'material', 0, ped);
        L(ped, 'material', 0, des); L(des, 'material', 0, mar); L(mar, 'material', 1, des);
        L(des, 'ar', 0, asp); L(asp, 'ar', 0, cic); L(cic, 'material', 0, bca);
        L(mar, 'material', 0, e6); L(e6, 'material', 0, bru); L(bru, 'material', 0, pol);
        L(bru, 'ar', 0, fil); L(pol, 'ar', 0, fil); L(fil, 'material', 0, bfa);
        L(pol, 'material', 0, e7); L(e7, 'material', 0, tri); L(tri, 'material', 0, sel); L(tri, 'material', 1, bqu);
        L(sel, 'material', 1, brj); L(sel, 'material', 0, e8); L(e8, 'material', 0, ens); L(ens, 'material', 0, bau);
        // ---- ajustes de variáveis e comandos que o processo pede
        const T = (el, s) => pl.tags.find(t => t.equipId === el.eq && t.kitS === s);
        const C = (el, s) => pl.comandos.find(c => c.equipId === el.eq && c.kitS === s);
        // rotação/velocidade parada com motor desligado não é alarme: a subvelocidade vira alarme por equação (só ligado)
        pl.tags.filter(t => ['rotacao', 'velocidade'].includes(t.kitS)).forEach(t => { t.limites.ativo = false; });
        const spRolos = b.cmd(des.eqObj, { nome: 'Pressão dos rolos — Descascador', tipo: 'setpoint', topico: `${topicoBaseEquip(pl, des.eqObj)}/sp_pressao_rolos`, min: 20, max: 100, passo: 1, unidade: '%' });
        spRolos.topicoAuto = true; spRolos.kitS = 'sp_pressao_rolos';
        C(bfl, 'sp_vazao').max = 12; C(bfl, 'sp_vazao').min = 0; C(ens, 'sp_peso').max = 60;
        const v = (el, s) => T(el, s).variavel;
        const rend = b.tag(sel.eqObj, { nome: 'Rendimento de inteiros', variavel: 'rendimento_inteiros', tipo: 'percentual', origem: 'calc', unidade: '%', expr: `se(${v(bfl, 'vazao')} > 0.5, 100 * ${v(sel, 'vazao')} / ${v(bfl, 'vazao')}, 0)`, faixa: [0, 70] });
        rend.limites = Object.assign(rend.limites, { ativo: true, l: 50, atrasoS: 600, histerese: 1, prioridadeAvisos: 3 });
        b.tag(bqu.eqObj, { nome: 'Quebrados sobre o branco', variavel: 'quebrados_pct', tipo: 'percentual', origem: 'calc', unidade: '%', expr: `se(${v(bfl, 'vazao')} > 0.5, 100 * ${v(bqu, 'vazao')} / (${v(bqu, 'vazao')} + 1000 * ${v(sel, 'vazao')} + 0.001), 0)`, faixa: [0, 30] });
        // alarmes por equação: subvelocidade com o motor ligado (speed switch) e aeração com ar úmido
        [e1, e2, e3, e4, e5, e6, e7, e8].forEach(e => pl.alarmesExtra.push({ id: uid('ax'), nome: `${e.eqObj.nome}: subvelocidade com o motor ligado (correia patinando ou rompida)`, expr: `${v(e, 'estado')} == 1 e ${v(e, 'rotacao')} < 55`, prioridade: 1, atrasoS: 5, ativo: true }));
        pl.alarmesExtra.push({ id: uid('ax'), nome: 'Correia de descarga: subvelocidade com o motor ligado', expr: `${v(cor, 'estado')} == 1 e ${v(cor, 'velocidade')} < 1.8`, prioridade: 1, atrasoS: 5, ativo: true });
        pl.alarmesExtra.push({ id: uid('ax'), nome: 'Secador: fornalha quente com o ventilador desligado', expr: `${v(vsec, 'estado')} == 0 e ${v(forn, 'temperatura')} > 400`, prioridade: 1, atrasoS: 10, ativo: true });
        [[s1, va1], [s2, va2]].forEach(([s, va]) => pl.alarmesExtra.push({ id: uid('ax'), nome: `${s.eqObj.nome}: aerando com o ar mais úmido que o grão aguenta (UR externa > 80 %)`, expr: `${v(va, 'estado')} == 1 e ${v(est, 'umidade')} > 80`, prioridade: 3, atrasoS: 300, ativo: true }));
        // ---- planta virtual (o "campo")
        const M = [], top = t => t.topico;
        const add = m => { M.push(m); return m.nome; };
        const nomeM = el => 'm_' + baseTopico(el.eqObj.nome);
        const motores = [e1, pre, e2, vsec, e3, red, va1, va2, cor, e4, lim, e5, ped, des, mar, asp, e6, bru, pol, e7, tri, e8];
        // chaves com retorno de estado (o comando fica retido no broker; o estado segue o comando)
        [...motores, sel].forEach(el => { const c = C(el, 'cmd'), est = T(el, 'estado'); add({ nome: nomeM(el), tipo: 'chave', cmd: c.topico, estado: est && est.topico, inicial: 1 }); });
        add({ nome: 'm_ensaque', tipo: 'chave', cmd: C(ens, 'cmd').topico, inicial: 1 });
        add({ nome: 'grelha', tipo: 'chave', cmd: C(moe, 'grelha').topico, inicial: 1 });
        add({ nome: 'amostra', tipo: 'chave', cmd: C(cal, 'cmd').topico });
        add({ nome: 'limpa_filtro', tipo: 'chave', cmd: C(fil, 'limpeza').topico });
        add({ nome: 'sp_t_ar', tipo: 'entrada', topico: C(sec, 'sp_t_ar').topico, inicial: 80, publicarInicial: true });
        add({ nome: 'sp_vazao', tipo: 'entrada', topico: C(bfl, 'sp_vazao').topico, inicial: 8, publicarInicial: true });
        add({ nome: 'sp_rolos', tipo: 'entrada', topico: spRolos.topico, inicial: 60, publicarInicial: true });
        add({ nome: 'sp_saco', tipo: 'entrada', topico: C(ens, 'sp_peso').topico, inicial: 30, publicarInicial: true });
        // clima e energia
        add({ nome: 't_ext', tipo: 'alg', expr: '24 + 5 * onda(86400)', topico: top(T(est, 'temperatura')), ruido: 0.1, dec: 1 });
        add({ nome: 'ur_ext', tipo: 'alg', expr: '70 - 15 * onda(86400)', topico: top(T(est, 'umidade')), ruido: 0.4, dec: 1, min: 5, max: 100 });
        add({ nome: 'p_atm', tipo: 'alg', expr: '101.3 + 0.2 * onda(43200)', topico: top(T(est, 'pressao')), dec: 2 });
        add({ nome: 'tensao', tipo: 'alg', expr: '381 + 3 * onda(600)', topico: top(T(qg, 'tensao')), ruido: 0.6, dec: 1 });
        add({ nome: 'fp', tipo: 'alg', expr: '0.93 + 0.02 * onda(1800)', topico: top(T(qg, 'fp')), ruido: 0.003, dec: 3, max: 1 });
        add({ nome: 'freq', tipo: 'alg', expr: '60 + 0.02 * onda(97)', topico: top(T(qg, 'frequencia')), dec: 2 });
        // vazões do processo (t/h)
        add({ nome: 'descarga', tipo: 'alg', expr: 'pulso(900, 0.55) * grelha' });
        add({ nome: 'q_rec', tipo: 'alg', expr: `60 * descarga * ${nomeM(e1)} * ${nomeM(pre)} * ${nomeM(e2)}` });
        add({ nome: 'q_arm', tipo: 'alg', expr: `q_rec * ${nomeM(e3)} * ${nomeM(red)}` });
        add({ nome: 'nivel_s1', tipo: 'din', deriv: '(se(x < 95, q_arm, 0) - q_des * sel1) / 36000', inicial: 46, topico: top(T(s1, 'nivel')), dec: 1, min: 0, max: 100 });
        add({ nome: 'nivel_s2', tipo: 'din', deriv: '(se(nivel_s1 >= 95, q_arm, 0) - q_des * (1 - sel1)) / 36000', inicial: 63, topico: top(T(s2, 'nivel')), dec: 1, min: 0, max: 100 });
        add({ nome: 'sel1', tipo: 'alg', expr: 'se(nivel_s1 >= nivel_s2 e nivel_s1 > 2, 1, 0)' });
        add({ nome: 'nivel_pul', tipo: 'din', deriv: '(q_des - q_eng) / 1080', inicial: 55, topico: top(T(pul, 'nivel')), dec: 1, min: 0, max: 100 });
        add({ nome: 'q_des', tipo: 'alg', expr: `14 * ${nomeM(cor)} * ${nomeM(e4)} * se(nivel_pul < 90, 1, 0) * se(nivel_s1 + nivel_s2 > 2, 1, 0)` });
        const linhaEng = [lim, e5, ped, des, mar, asp, e6, bru, pol, e7, tri, sel, e8].map(nomeM).join(' * ') + ' * m_ensaque';
        add({ nome: 'q_eng', tipo: 'alg', expr: `sp_vazao * ${linhaEng} * se(nivel_pul > 3, 1, 0)`, topico: top(T(bfl, 'vazao')), ruido: 0.05, dec: 2, min: 0 });
        add({ nome: 'tot_eng', tipo: 'din', deriv: 'q_eng / 3600', inicial: 1250, topico: top(T(bfl, 'total')), dec: 2 });
        add({ nome: 'descasque', tipo: 'alg', expr: `${nomeM(des)} * (70 + 25 * (1 - exp(-sp_rolos / 30)))`, topico: top(T(des, 'descasque')), ruido: 0.3, dec: 1, min: 0, max: 100 });
        add({ nome: 'p_rolos', tipo: 'alg', expr: `${nomeM(des)} * sp_rolos`, topico: top(T(des, 'pressao_rolos')), ruido: 0.4, dec: 1, min: 0 });
        add({ nome: 'q_frac', tipo: 'alg', expr: '0.08 + 0.12 * (sp_rolos / 100) ^ 2' });
        add({ nome: 'q_casca', tipo: 'alg', expr: 'q_eng * 1000 * 0.20 * descasque / 100', topico: top(T(bca, 'vazao')), ruido: 8, dec: 0, min: 0 });
        add({ nome: 'q_farelo', tipo: 'alg', expr: 'q_eng * 1000 * 0.09', topico: top(T(bfa, 'vazao')), ruido: 5, dec: 0, min: 0 });
        add({ nome: 'q_queb', tipo: 'alg', expr: 'q_eng * 1000 * 0.71 * q_frac', topico: top(T(bqu, 'vazao')), ruido: 5, dec: 0, min: 0 });
        add({ nome: 'rejeito', tipo: 'alg', expr: `${nomeM(sel)} * (2.5 + 1.5 * onda(1200))`, topico: top(T(sel, 'rejeito')), ruido: 0.1, dec: 2, min: 0 });
        add({ nome: 'q_int', tipo: 'alg', expr: 'q_eng * 0.71 * (1 - q_frac) * (1 - rejeito / 100)', topico: top(T(sel, 'vazao')), ruido: 0.03, dec: 2, min: 0 });
        add({ nome: 'q_rej', tipo: 'alg', expr: 'q_eng * 1000 * 0.71 * (1 - q_frac) * rejeito / 100', topico: top(T(brj, 'vazao')), ruido: 2, dec: 0, min: 0 });
        [[bca, 'q_casca', 812], [bfa, 'q_farelo', 365], [bqu, 'q_queb', 270], [brj, 'q_rej', 61]].forEach(([el, q, ini]) => add({ nome: 'tot_' + q, tipo: 'din', deriv: `${q} / 3600000`, inicial: ini, topico: top(T(el, 'total')), dec: 2 }));
        // recebimento
        add({ nome: 'peso_bal', tipo: 'alg', expr: 'pulso(900, 0.65) * (16200 + 29000 * (1 - descarga))', topico: top(T(bal, 'peso')), ruido: 8, dec: 0, min: 0 });
        add({ nome: 'ug_ent', tipo: 'alg', expr: '18.5 + 1.2 * onda(3600)', topico: top(T(cal, 'umidade')), ruido: 0.1, dec: 1 });
        add({ nome: 'impureza', tipo: 'alg', expr: '2.5 + 0.6 * onda(1500)', topico: top(T(cal, 'impureza')), ruido: 0.05, dec: 1 });
        add({ nome: 'moega_nivel', tipo: 'alg', expr: '0', topico: top(T(moe, 'nivel')), dec: 0 });
        add({ nome: 'moega_graos', tipo: 'alg', expr: 'descarga', topico: top(T(moe, 'presenca_grao')), dec: 0 });
        // secagem
        add({ nome: 't_ar', tipo: 'din', deriv: `(se(${nomeM(vsec)} == 1, sp_t_ar, t_ext) - x) / 90`, inicial: 78, topico: top(T(sec, 't_ar')), ruido: 0.4, dec: 1 });
        add({ nome: 't_massa', tipo: 'alg', expr: 't_ext + (t_ar - t_ext) * 0.38', topico: top(T(sec, 't_massa')), ruido: 0.2, dec: 1 });
        add({ nome: 'ug_ent_sec', tipo: 'alg', expr: 'ug_ent', topico: top(T(sec, 'ug_entrada')), ruido: 0.1, dec: 1 });
        add({ nome: 'ug_sai', tipo: 'alg', expr: '12 + (ug_ent - 12) * exp(-(t_ar - 25) / 20)', topico: top(T(sec, 'ug_saida')), ruido: 0.08, dec: 1 });
        add({ nome: 't_exaust', tipo: 'alg', expr: 't_ext + 0.3 * (t_ar - t_ext)', topico: top(T(sec, 't_exaustao')), ruido: 0.2, dec: 1 });
        add({ nome: 'ur_exaust', tipo: 'alg', expr: 'min(98, 88 - 0.25 * (t_ar - 40))', topico: top(T(sec, 'ur_exaustao')), ruido: 0.5, dec: 1 });
        add({ nome: 'faisca', tipo: 'alg', expr: '0', topico: top(T(sec, 'faisca')), dec: 0 });
        add({ nome: 't_forn', tipo: 'din', deriv: `(se(${nomeM(vsec)} == 1, 300 + 4.5 * sp_t_ar, 180) - x) / 120`, inicial: 650, topico: top(T(forn, 'temperatura')), ruido: 2, dec: 0 });
        add({ nome: 'depressao', tipo: 'alg', expr: `-35 * ${nomeM(vsec)} + 2`, topico: top(T(forn, 'depressao')), ruido: 1, dec: 0 });
        add({ nome: 'o2_fumos', tipo: 'alg', expr: `se(${nomeM(vsec)} == 1, 9 + onda(300), 20.9)`, topico: top(T(forn, 'o2_fumos')), ruido: 0.1, dec: 1 });
        // silos (termometria, gases, umidade)
        [[s1, 0, 'nivel_s1'], [s2, 1, 'nivel_s2']].forEach(([s, i, niv]) => {
            const k = 's' + (i + 1), tmax = `${k}_tmax`;
            add({ nome: tmax, tipo: 'alg', expr: `${i ? 26.5 : 22.5} + 1.2 * onda(${7200 + i * 900})`, topico: top(T(s, 'temp_max')), ruido: 0.05, dec: 1 });
            add({ nome: `${k}_tmed`, tipo: 'alg', expr: `${tmax} - 3`, topico: top(T(s, 'temp_media')), ruido: 0.05, dec: 1 });
            add({ nome: `${k}_tmin`, tipo: 'alg', expr: `${tmax} - 6.5`, topico: top(T(s, 'temp_min')), ruido: 0.05, dec: 1 });
            add({ nome: `${k}_tesp`, tipo: 'alg', expr: 't_ext + 3', topico: top(T(s, 'temp_espaco')), ruido: 0.1, dec: 1 });
            add({ nome: `${k}_ur`, tipo: 'alg', expr: `${i ? 72 : 66} + 2 * onda(5400)`, topico: top(T(s, 'ur_intergranular')), ruido: 0.3, dec: 1 });
            add({ nome: `${k}_ug`, tipo: 'alg', expr: `${i ? 13.2 : 12.6} + 0.1 * onda(9000)`, topico: top(T(s, 'umidade_grao')), ruido: 0.02, dec: 1 });
            add({ nome: `${k}_co2`, tipo: 'alg', expr: `${i ? 980 : 470} + ${i ? 260 : 40} * onda(3600)`, topico: top(T(s, 'co2')), ruido: 6, dec: 0 });
            add({ nome: `${k}_ch4`, tipo: 'alg', expr: `${i ? 60 : 12} + 8 * abs(onda(2400))`, topico: top(T(s, 'metano')), ruido: 1, dec: 0, min: 0 });
            add({ nome: `${k}_ph3`, tipo: 'alg', expr: '0', topico: top(T(s, 'fosfina')), dec: 2 });
            add({ nome: `${k}_o2`, tipo: 'alg', expr: '20.9', topico: top(T(s, 'o2')), ruido: 0.02, dec: 1 });
            add({ nome: `${k}_alto`, tipo: 'alg', expr: `se(${niv} > 95, 1, 0)`, topico: top(T(s, 'nivel_alto')), dec: 0 });
        });
        add({ nome: 'pul_alto', tipo: 'alg', expr: 'se(nivel_pul > 90, 1, 0)', topico: top(T(pul, 'nivel_alto')), dec: 0 });
        add({ nome: 'pul_baixo', tipo: 'alg', expr: 'se(nivel_pul < 10, 1, 0)', topico: top(T(pul, 'nivel_baixo')), dec: 0 });
        // motores: corrente pela carga, rotação/velocidade com escorregamento, vibração e mancal
        const carga = new Map([[e1, 'q_rec / 60'], [pre, 'q_rec / 60'], [e2, 'q_rec / 60'], [vsec, '0.85'], [e3, 'q_arm / 60'], [red, 'q_arm / 60'], [va1, '0.9'], [va2, '0.9'], [cor, 'q_des / 14'], [e4, 'q_des / 14']]);
        [lim, e5, ped, des, mar, asp, e6, bru, pol, e7, tri, e8].forEach(el => carga.set(el, 'q_eng / 10'));
        const correntes = [];
        motores.forEach(el => {
            const eq = el.eqObj, m = nomeM(el), I = T(el, 'corrente');
            const iV = 2 * eq.horimetro.limLigado, iC = 2 * eq.horimetro.limTrabalho - iV;
            const ci = add({ nome: 'i_' + m.slice(2), tipo: 'alg', expr: `${m} * (${iV} + ${(iC - iV).toFixed(2)} * min(1.1, ${carga.get(el)}))`, topico: top(I), ruido: +(iC * 0.012).toFixed(3), dec: 1, min: 0 });
            correntes.push(ci);
            const esc = T(el, 'escorregamento');
            if (esc) {
                const ev = el === e5 ? ' + 9 * pulso(1800, 0.035)' : '';
                add({ nome: 'esc_' + m.slice(2), tipo: 'alg', expr: `${m} * (0.9 + 0.5 * abs(onda(${97 + correntes.length * 7}))${ev})`, topico: top(esc), ruido: 0.05, dec: 1, min: 0 });
                const rot = T(el, 'rotacao'), vel = T(el, 'velocidade');
                if (rot) add({ nome: 'rot_' + m.slice(2), tipo: 'alg', expr: `${m} * ${el.s === 'elevador' ? 72 : 32} * (1 - esc_${m.slice(2)} / 100)`, topico: top(rot), ruido: 0.2, dec: 0, min: 0 });
                if (vel) add({ nome: 'vel_' + m.slice(2), tipo: 'alg', expr: `${m} * 2.2 * (1 - esc_${m.slice(2)} / 100)`, topico: top(vel), ruido: 0.01, dec: 2, min: 0 });
            }
            const vib = T(el, 'vibracao'), man = T(el, 'temp_mancal'), pr = T(el, 'pressao');
            if (vib) add({ nome: 'vib_' + m.slice(2), tipo: 'alg', expr: `${m} * (2.1 + 1.3 * min(1, ${carga.get(el)}))`, topico: top(vib), ruido: 0.08, dec: 2, min: 0 });
            if (man) add({ nome: 'man_' + m.slice(2), tipo: 'alg', expr: `t_ext + ${m} * (16 + 6 * min(1, ${carga.get(el)}))`, topico: top(man), ruido: 0.2, dec: 1 });
            if (pr) add({ nome: 'pr_' + m.slice(2), tipo: 'alg', expr: el.s === 'ventilador' || el.s === 'ventilador_centrifugo' ? `${m} * ${el === vsec ? 1800 : 1100}` : `${m} * (32 + 12 * min(1, ${carga.get(el)}))`, topico: top(pr), ruido: el.s.startsWith('ventilador') ? 10 : 0.3, dec: el.s.startsWith('ventilador') ? 0 : 1, min: 0 });
            ['desalinhamento', 'entupimento'].forEach(s => { const t = T(el, s); if (t) add({ nome: `${s}_${m.slice(2)}`, tipo: 'alg', expr: '0', topico: top(t), dec: 0 }); });
        });
        add({ nome: 'agua_pol', tipo: 'alg', expr: `${nomeM(pol)} * 60 * min(1, q_eng / 8)`, topico: top(T(pol, 'agua')), ruido: 0.5, dec: 0, min: 0 });
        add({ nome: 'dp_cic', tipo: 'alg', expr: `${nomeM(asp)} * 850`, topico: top(T(cic, 'dp')), ruido: 6, dec: 0, min: 0 });
        add({ nome: 'dp_fil', tipo: 'din', deriv: `se(x > 1400, -40, ${nomeM(bru)} * 0.12) - 25 * limpa_filtro`, inicial: 900, min: 350, topico: top(T(fil, 'dp')), ruido: 4, dec: 0 });
        // ensaque
        add({ nome: 'peso_saco', tipo: 'alg', expr: 'm_ensaque * sp_saco', topico: top(T(ens, 'peso_saco')), ruido: 0.04, dec: 2, min: 0 });
        add({ nome: 'sacos_min', tipo: 'alg', expr: 'm_ensaque * q_int * 1000 / 60 / max(1, sp_saco)', topico: top(T(ens, 'sacos_min')), ruido: 0.05, dec: 1, min: 0 });
        add({ nome: 'contador', tipo: 'din', deriv: 'sacos_min / 60', inicial: 0, topico: top(T(ens, 'contador')), dec: 0 });
        // quadro geral: corrente, potência e energia somadas
        add({ nome: 'i_total', tipo: 'alg', expr: correntes.join(' + '), topico: top(T(qg, 'corrente')), dec: 1 });
        add({ nome: 'p_total', tipo: 'alg', expr: 'pot_tri(tensao, i_total, fp)', topico: top(T(qg, 'potencia')), dec: 1 });
        add({ nome: 'energia', tipo: 'din', deriv: 'p_total / 3600', inicial: 18250, topico: top(T(qg, 'energia')), dec: 1 });
        // o que sobrou de algum kit sem modelo publica um valor neutro (todo tópico aparece no status e tem dado)
        const comModelo = new Set(M.filter(m => m.topico).map(m => m.topico).concat(M.filter(m => m.estado).map(m => m.estado)));
        pl.tags.filter(t => t.origem === 'mqtt' && t.topico && !comModelo.has(t.topico)).forEach(t => {
            const f = t.faixa || (TIPOS_VAR[t.tipo] || TIPOS_VAR.generico).faixa || [0, 100];
            add({ nome: 'x_' + baseTopico(t.topico), tipo: 'alg', expr: t.tipo === 'estado' ? '0' : String(+(f[0] + (f[1] - f[0]) * 0.3).toFixed(2)), topico: t.topico, ruido: t.tipo === 'estado' ? 0 : +((f[1] - f[0]) * 0.002).toFixed(3), dec: t.dec != null ? t.dec : 2 });
        });
        pl.simulacao = { modelos: M, periodoS: 2 };
        return pl;
    }
};
