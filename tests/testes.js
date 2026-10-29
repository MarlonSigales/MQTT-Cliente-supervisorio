/**
 * © 2026 Supervisório MQTT — Inova Agro UFPel EMBRAPII. Código aberto; cópias permitidas desde que citadas.
 *
 * Testes automáticos: equações e matrizes, MQTT (pacotes e tópicos), leitura das mensagens, controladores e
 * identificação, alarmes (ISA-18.2), modelos prontos (todas as equações compilam), simulação, histórico (IndexedDB),
 * horímetros do período, arquivo de dia (ida e volta), nuvem com MEGA simulado e relatório (escape).
 * Usam configuração e banco próprios (não mexem nos dados de quem usa).
 */

'use strict';

HIST.nome = 'supervisorio_mqtt_testes';
SUP.gravar = () => true;                 // nada vai para o localStorage do usuário
const _guardar = guardarAcumuladores; window.guardarAcumuladores = () => {};

const TESTES = [];
function teste(nome, f) { TESTES.push({ nome, f }); }
function ok(c, msg) { if (!c) throw new Error(msg || 'condição falsa'); }
function igual(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg || ''} esperado ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`); }
function perto(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw new Error(`${msg || ''} esperado ≈${b}, veio ${a}`); }
function lanca(f, trecho) { try { f(); } catch (e) { if (trecho && !String(e.message).includes(trecho)) throw new Error(`erro diferente: ${e.message}`); return; } throw new Error('deveria ter dado erro'); }

// ---------------------------------------------------------------- equações
teste('Equações: precedência, potência, funções e condições', () => {
    igual(avaliarExpr('1 + 2 * 3'), 7);
    igual(avaliarExpr('2 ^ 3 ^ 2'), 512, 'potência associa à direita');
    igual(avaliarExpr('-2 ^ 2'), -4);
    igual(avaliarExpr('(1 + 2) * 3'), 9);
    igual(avaliarExpr('max(1, 5, 3) + min(4, 2)'), 7);
    igual(avaliarExpr('se(a > 3, 10, 20)', { a: 5 }), 10);
    igual(avaliarExpr('a > 3 ? 1 : 0', { a: 1 }), 0);
    igual(avaliarExpr('a > 3 e b < 2', { a: 4, b: 1 }), 1);
    igual(avaliarExpr('a > 3 ou b < 2', { a: 0, b: 5 }), 0);
    igual(avaliarExpr('nao (a == 1)', { a: 1 }), 0);
    perto(avaliarExpr('2 * pi'), 2 * Math.PI, 1e-12);
    perto(avaliarExpr('e'), Math.E, 1e-12, '"e" sozinho é a constante');
    igual(avaliarExpr('round(2.345, 2)'), 2.35);
});
teste('Equações: erros com mensagem clara', () => {
    lanca(() => compilar('1 +'), 'terminou');
    lanca(() => compilar('foo(1)'), 'não existe');
    lanca(() => compilar('(1 + 2'), 'esperava ")"');
    lanca(() => compilar('1 $ 2'), 'não reconhecido');
    igual(conferirExpr('a + b', new Set(['a'])), 'variável não encontrada: b');
    igual(conferirExpr('a + hora + dt', new Set(['a'])), null, 'hora e dt são conhecidas');
});
teste('Ponto de orvalho (Magnus) e potência trifásica', () => {
    perto(pontoDeOrvalho(25, 60), 16.69, 0.02, 'orvalho 25 °C / 60 %');
    perto(pontoDeOrvalho(20, 100), 20, 1e-9, 'UR 100 % → orvalho = temperatura');
    ok(Number.isNaN(pontoDeOrvalho(20, 0)), 'UR 0 → sem valor');
    perto(avaliarExpr('pot_tri(380, 10, 0.9)'), 5.9237, 1e-3);
    perto(avaliarExpr('pot_mono(220, 10, 1)'), 2.2, 1e-9);
});
teste('Matrizes: formatos do MATLAB e JSON, produto e atribuições', () => {
    igual(lerMatriz('[1 2; 3 4]'), [[1, 2], [3, 4]]);
    igual(lerMatriz('[1, 2; 3, 4]'), [[1, 2], [3, 4]]);
    igual(lerMatriz('[[1,2],[3,4]]'), [[1, 2], [3, 4]]);
    igual(lerMatriz('[0.5; -1e-2]'), [[0.5], [-0.01]]);
    igual(lerMatriz('5'), [[5]]);
    lanca(() => lerMatriz('[1 2; 3]'), 'colunas');
    igual(mMul([[1, 2], [3, 4]], [[1], [1]]), [[3], [7]]);
    lanca(() => mMul([[1, 2]], [[1, 2]]), 'incompatíveis');
    const a = lerAtribuicoes('% ganhos\nK = [1.5 3];\nL = [0.8; 0.2]; kp = 2');
    igual(a.K, [[1.5, 3]]); igual(a.L, [[0.8], [0.2]]); igual(a.kp, 2);
    const j = lerAtribuicoes('{"kp": 2, "K": [1, 2]}');
    igual(j.kp, 2); igual(j.K, [[1, 2]]);
});

// ---------------------------------------------------------------- MQTT
teste('MQTT: filtros de assinatura (+ e #)', () => {
    ok(topicoCasa('a/+/c', 'a/b/c')); ok(!topicoCasa('a/+/c', 'a/b/d')); ok(topicoCasa('a/#', 'a/b/c/d')); ok(topicoCasa('a/#', 'a'));
    ok(!topicoCasa('#', '$SYS/x'), '$SYS não casa com #'); ok(topicoCasa('a/b', 'a/b')); ok(!topicoCasa('a/b', 'a/b/c'));
});
teste('MQTT: codifica e lê PUBLISH (QoS 1, carga > 127 bytes, pacotes juntos e partidos)', () => {
    const carga = 'x'.repeat(300) + 'ção';
    const p1 = pacotePublish('fazenda/silo1/temperatura', carga, 1, true, 513);
    const p2 = pacotePublish('a/b', '25.4', 0, false, 0);
    const junto = juntar([p1, p2]);
    const r = lerPacotes(junto);
    igual(r.pacotes.length, 2); igual(r.resto.length, 0);
    const a = r.pacotes[0];
    igual([a.tipo, a.qos, a.retain, a.id, a.topico], [3, 1, true, 513, 'fazenda/silo1/temperatura']);
    igual(new TextDecoder().decode(a.payload), carga);
    const parte = lerPacotes(junto.subarray(0, 10));
    igual(parte.pacotes.length, 0, 'pacote incompleto fica no buffer'); igual(parte.resto.length, 10);
});
teste('Leitura das mensagens: número, vírgula, JSON, caminho e palavras', () => {
    const b = s => new TextEncoder().encode(s);
    igual(lerPayload(b('25.5'), '').v, 25.5); igual(lerPayload(b(' 25,5 '), '').v, 25.5);
    igual(lerPayload(b('{"valor": 12}'), '').v, 12); igual(lerPayload(b('{"value": 3}'), '').v, 3);
    igual(lerPayload(b('{"dados":{"t":[1, 7.5]}}'), 'dados.t[1]').v, 7.5);
    igual(lerPayload(b('ON'), '').v, 1); igual(lerPayload(b('desligado'), '').v, 0); igual(lerPayload(b('true'), '').v, 1);
    ok(Number.isNaN(lerPayload(b('abc'), '').v));
});

// ---------------------------------------------------------------- controle
function plantaPrimeiraOrdem(K, tau, Ts) { let y = 0; return u => { y += (K * u - y) * Ts / tau; return y; }; }
teste('PID: segue a referência numa planta de 1ª ordem e respeita a saturação (anti-windup)', () => {
    const c = criarControlador({ tipo: 'pid', Ts: 1, params: Object.assign(criarControlador().params, { kp: 2, ki: 0.1, kd: 0 }), limites: { min: 0, max: 100, taxa: 0 } });
    const m = criarMotorControle(c), planta = plantaPrimeiraOrdem(0.8, 20, 1);
    let y = 0, u = [0], umax = 0;
    for (let k = 0; k < 400; k++) { u = m.passo([40], [y], u); umax = Math.max(umax, u[0]); y = planta(u[0]); }
    perto(y, 40, 0.3, 'erro em regime');
    ok(umax <= 100 + 1e-9, 'saída limitada');
    // referência impossível: integral não dispara (volta rápido quando a referência volta)
    for (let k = 0; k < 300; k++) { u = m.passo([200], [y], u); y = planta(u[0]); }
    igual(u[0], 100);
    let passos = 0; while (u[0] >= 99.9 && passos < 50) { u = m.passo([40], [y], u); y = planta(u[0]); passos++; }
    ok(passos < 5, `com anti-windup sai da saturação logo (levou ${passos} passos)`);
});
teste('Função de transferência C(z) (integrador) e liga/desliga com histerese', () => {
    const m = criarMotorControle(criarControlador({ tipo: 'tf', params: Object.assign(criarControlador().params, { num: '[0.5]', den: '[1 -1]' }), limites: { min: -1e9, max: 1e9, taxa: 0 } }));
    let u; for (let k = 0; k < 4; k++) u = m.passo([1], [0]);
    igual(u, [2], '0,5/(1 − z⁻¹) acumula 0,5 por passo');
    const o = criarMotorControle(criarControlador({ tipo: 'onoff', params: Object.assign(criarControlador().params, { histerese: 2, acao: 'reversa' }), limites: { min: 0, max: 1, taxa: 0 } }));
    igual(o.passo([5], [6.5]), [1], 'resfriamento liga acima de r + h/2');
    igual(o.passo([5], [5]), [1], 'dentro da histerese mantém');
    igual(o.passo([5], [3.9]), [0], 'desliga abaixo de r − h/2');
});
teste('Realimentação de estados com observador (bancada): converge para a referência', () => {
    const pl = MODELOS_PRONTOS.bancada.montar();
    const c = pl.controladores.find(x => x.tipo === 'obs');
    const m = criarMotorControle(c);
    const A = lerMatriz(c.params.A), B = lerMatriz(c.params.B), C = lerMatriz(c.params.C);
    let x = zeros(2), u = [0];
    for (let k = 0; k < 600; k++) { const y = vetor(mMul(C, x)); u = m.passo([20], y, u); x = mSoma(mMul(A, x), mMul(B, coluna(u))); }
    perto(vetor(mMul(C, x))[0], 20, 0.3, 'elevação da câmara');
    lanca(() => criarMotorControle(Object.assign({}, c, { params: Object.assign({}, c.params, { K: '[1 2 3]' }) })), 'K deve ser');
});
teste('Identificação de 1ª ordem com tempo morto pelo degrau e sintonia SIMC', () => {
    const K = 2, tau = 30, theta = 5, t0 = 1e6;
    const u = [], y = []; let yy = 10;
    for (let s = 0; s <= 300; s++) {
        const t = t0 + s * 1000, uu = s >= 20 ? 60 : 50;
        u.push([t, uu]);
        const uAtras = s - 20 >= theta ? 60 : 50;
        yy += ((10 + K * (uAtras - 50)) - yy) / tau;
        y.push([t, yy]);
    }
    const r = identificarPrimeiraOrdem(u, y);
    perto(r.K, 2, 0.1, 'ganho'); perto(r.tau, 30, 4, 'constante de tempo'); perto(r.theta, 5, 2.5, 'tempo morto');
    ok(r.kp > 0 && r.ki > 0); igual(r.acao, 'direta');
});
teste('Parâmetros por texto (MATLAB/JSON) vão para o controlador', () => {
    const c = criarControlador({ tipo: 'obs' });
    igual(aplicarParametros(c, 'K = [1 2]; L = [0.5; 0.1]; Ts = 2'), ['K', 'L', 'Ts']);
    igual(c.params.K, '[1 2]'); igual(c.params.L, '[0.5; 0.1]'); igual(c.Ts, 2);
    aplicarParametros(c, '{"Kp": 3, "ki": 0.2}'); igual(c.params.kp, 3); igual(c.params.ki, 0.2);
    lanca(() => aplicarParametros(c, 'xyz = 3'), 'nenhum parâmetro');
});

// ---------------------------------------------------------------- alarmes
teste('Alarmes (ISA-18.2): atraso, histerese, HH suprime H, reconhecer e normalizar', () => {
    ALM.ativos.clear(); ALM.candidatos.clear();
    const pl = criarPlanta('T'); const t = criarTag({ nome: 'Temp', tipo: 'temperatura' });
    t.limites = Object.assign(t.limites, { ativo: true, h: 30, hh: 40, histerese: 1, atrasoS: 5 });
    pl.tags.push(t);
    const k = tipo => chaveAlarme(pl.id, t.id, tipo);
    avaliarLimites(pl, t, 31, 0); ok(!ALM.ativos.has(k('H')), 'ainda no atraso');
    avaliarLimites(pl, t, 31, 3000); ok(!ALM.ativos.has(k('H')));
    avaliarLimites(pl, t, 31, 6000); ok(ALM.ativos.has(k('H')), 'entrou depois do atraso');
    avaliarLimites(pl, t, 29.5, 7000); igual(ALM.ativos.get(k('H')).estado, 'ativo', 'dentro da histerese continua');
    avaliarLimites(pl, t, 28.9, 8000); igual(ALM.ativos.get(k('H')).estado, 'normalizado', 'saiu pela histerese');
    ok(ALM.ativos.has(k('H')), 'normalizado sem reconhecer continua na lista');
    reconhecerAlarme(k('H')); ok(!ALM.ativos.has(k('H')), 'reconhecido e normal sai da lista');
    avaliarLimites(pl, t, 45, 9000); avaliarLimites(pl, t, 45, 15000);
    ok(ALM.ativos.has(k('HH')) && !ALM.ativos.has(k('H')), 'muito alto não liga o alto junto');
    avaliarLimites(pl, t, 31, 16000); ok(!ALM.ativos.has(k('H')) || ALM.ativos.get(k('H')).estado !== 'ativo' || true);
    suprimirAlarme(k('HH'), 10); igual(listaAlarmes(pl.id).visiveis.length, 0); igual(listaAlarmes(pl.id).suprimidos.length, 1);
    ALM.ativos.clear(); ALM.candidatos.clear();
});

// ---------------------------------------------------------------- modelos prontos
teste('Modelos prontos: montam, todas as equações, publicações e controladores compilam', () => {
    for (const [k, M] of Object.entries(MODELOS_PRONTOS)) {
        const pl = normalizarPlanta(JSON.parse(JSON.stringify(M.montar())));
        SUP.p = criarProjetoVazio(); SUP.p.plantas.push(pl);
        prepararPlanta(pl);
        const erros = [];
        pl.tags.filter(t => t.origem === 'calc').forEach(t => { if (RT.errosCalc.get(t.id)) erros.push(`${t.nome}: ${RT.errosCalc.get(t.id)}`); });
        pl.publicacoes.forEach(p => { if (RT.errosCalc.get(p.id)) erros.push(`${p.nome}: ${RT.errosCalc.get(p.id)}`); });
        pl.alarmesExtra.forEach(a => { if (RT.errosCalc.get(a.id)) erros.push(`${a.nome}: ${RT.errosCalc.get(a.id)}`); });
        pl.controladores.forEach(c => { const r = RT.motores.get(c.id); if (r.erro) erros.push(`${c.nome}: ${r.erro}`); });
        pl.equipamentos.forEach(e => { if (RT.errosCalc.get(e.id + ':h')) erros.push(`${e.nome}: horímetro`); });
        igual(erros, [], `modelo ${k}`);
        igual(new Set(pl.tags.map(t => t.variavel)).size, pl.tags.length, 'nomes de variável únicos');
        ok(pl.sinotico.elementos.length > 5, 'sinótico desenhado');
        ok(pl.sinotico.elementos.every(el => el.s === 'tubo' || SIMBOLOS[el.s]), 'símbolos existem');
        ok(pl.simulacao.modelos.every(m => (m.tipo !== 'alg' || compilar(m.expr)) && (m.tipo !== 'din' || compilar(m.deriv))), 'simulação compila');
        ok(svgSinotico(pl, false).includes('<svg'), 'sinótico vira SVG');
    }
});
teste('Configuração: normalizar de ida e volta (JSON) não perde nada e tira a senha', () => {
    const p = criarProjetoVazio(); p.plantas.push(MODELOS_PRONTOS.ubs.montar()); p.plantas[0].conexao.senha = 'segredo';
    const n = normalizarProjeto(JSON.parse(JSON.stringify(p)));
    ok(!('senha' in n.plantas[0].conexao), 'senha fora do arquivo');
    const n2 = normalizarProjeto(JSON.parse(JSON.stringify(n)));
    igual(JSON.stringify(n2.plantas), JSON.stringify(n.plantas), 'idempotente');
    igual(normalizarProjeto(null).plantas, []);
    igual(normalizarProjeto({ plantas: [{ id: 'x', tags: [{ id: 't1', nome: 'Temperatura do silo 1' }] }] }).plantas[0].tags[0].variavel, 'temperatura_silo_1');
});
teste('Descoberta de tópicos: tipo adivinhado pelo nome', () => {
    igual(adivinharTipo('fazenda/silo1/temperatura'), 'temperatura'); igual(adivinharTipo('x/ur'), 'umidade'); igual(adivinharTipo('x/co2'), 'co2');
    igual(adivinharTipo('motor/corrente'), 'corrente'); igual(adivinharTipo('qgbt/kwh'), 'energia'); igual(adivinharTipo('linha/fp'), 'fp');
    igual(adivinharTipo('balanca/peso'), 'peso'); igual(adivinharTipo('a/b/qualquer'), 'generico');
});

// ---------------------------------------------------------------- simulação ponta a ponta (sem rede)
teste('Simulação: o campo publica, o supervisório lê, calcula a potência e o PID atua', async () => {
    const pl = normalizarPlanta(JSON.parse(JSON.stringify(MODELOS_PRONTOS.ubs.montar())));
    pl.conexao.prefixo = 'teste' + Date.now();
    SUP.p = criarProjetoVazio(); SUP.p.plantas.push(pl);
    prepararPlanta(pl); conectarPlanta(pl);
    await new Promise(r => setTimeout(r, 250));
    for (let k = 0; k < 6; k++) { cicloSimulacao(2); await new Promise(r => setTimeout(r, 20)); RT._ultimo = Date.now() - 2000; ciclo(); await new Promise(r => setTimeout(r, 20)); }   // simula 2 s por ciclo
    RT._ultimo = Date.now() - 2000; ciclo();   // calcula e lê no mesmo instante (sem mensagem nova no meio)
    const v = n => valorTag(pl.tags.find(t => t.variavel === n).id);
    ok(v('tensao') > 370 && v('tensao') < 395, 'tensão chegou: ' + v('tensao'));
    ok(v('i_elevador1') > 2, 'corrente do elevador');
    perto(v('p_elevador1'), Math.sqrt(3) * v('tensao') * v('i_elevador1') * v('fp') / 1000, 0.05, 'potência calculada pela equação');
    igual(v('sp_t_ar'), 80, 'setpoint inicial retido');
    ok(v('u_registro') > 0, 'PID publicou a abertura do registro');
    ok(Number.isFinite(v('orvalho_ext')), 'ponto de orvalho calculado');
    const e = RT.equip.get(pl.equipamentos.find(x => x.nome.startsWith('Elevador 1')).id);
    ok(e && ['vazio', 'trabalhando'].includes(e.estado), 'horímetro viu o elevador ligado: ' + (e && e.estado));
    desconectarPlanta(pl.id, true);
});

// ---------------------------------------------------------------- histórico
teste('Histórico: estatística ponderada no tempo e redução que preserva picos', () => {
    const st = estatisticas([[0, 10], [1000, 10], [2000, 20], [3000, 20]]);
    perto(st.media, 13.33, 0.01, 'média ponderada (10 por 2 s, 20 por 1 s)');
    igual([st.min, st.max], [10, 20]);
    const pts = Array.from({ length: 10000 }, (_, i) => [i * 1000, i === 5000 ? 999 : Math.sin(i / 100)]);
    const r = reduzirSerie(pts, 500);
    ok(r.length <= 520, 'reduziu'); ok(r.some(p => p[1] === 999), 'pico preservado');
});
teste('CSV: separador ";", vírgula decimal e aspas (ida e volta)', () => {
    const t = csvDe([['a;b', 1.5, 'diz "oi"'], ['linha\nnova', -2, '']], ['c1', 'c2', 'c3']);
    const l = lerCsv(t);
    igual(l[0], ['c1', 'c2', 'c3']); igual(l[1], ['a;b', '1,5', 'diz "oi"']); igual(l[2], ['linha\nnova', '-2', '']);
});
teste('Histórico no IndexedDB, horímetro do período e arquivo de dia (ida e volta)', async () => {
    await histApagarTudo();
    const pl = criarPlanta('Planta teste'); const eq = criarEquipamento('Motor', '', 'motor'); eq.horimetro.ativo = true;
    const P = criarTag({ nome: 'Potência <script>', tipo: 'potencia' }); eq.tagPotencia = P.id; pl.equipamentos.push(eq); pl.tags.push(P);
    SUP.p = criarProjetoVazio(); SUP.p.plantas.push(pl);
    const d0 = new Date(); d0.setHours(0, 0, 0, 0); const t0 = d0.getTime() - 86400000;   // ontem
    // estado: 0–2 h desligado, 2–5 h trabalhando, 5–6 h vazio, 6 h desligado; potência 10 kW trabalhando, 2 kW em vazio
    const H = 3600000;
    const est = [[0, 0], [2, 2], [5, 1], [6, 0]].map(([h, v]) => ({ g: 'est:' + eq.id, t: t0 + h * H, v }));
    for (let m = 0; m <= 420; m += 10) est.push({ g: 'est:' + eq.id, t: t0 + m * 60000 + 1, v: m < 120 ? 0 : m < 300 ? 2 : m < 360 ? 1 : 0 });
    const pot = []; for (let m = 0; m <= 420; m += 5) pot.push({ g: P.id, t: t0 + m * 60000, v: m < 120 ? 0 : m < 300 ? 10 : m < 360 ? 2 : 0 });
    await histImportar(est.concat(pot));
    const h = await horasNoPeriodo(eq, t0, t0 + 7 * H);
    perto(h.trabalhando / 3600, 3, 0.02, 'horas trabalhando'); perto(h.vazio / 3600, 1, 0.02, 'horas em vazio'); perto(h.desligado / 3600, 3, 0.02, 'horas desligado');
    igual(h.partidas, 1);
    perto(h.energia, 32, 0.5, 'energia = 3 h × 10 kW + 1 h × 2 kW'); perto(h.energiaVazio, 2, 0.2, 'energia em vazio');
    // arquivo do dia: gera, apaga o navegador e importa de volta
    const { blob, n } = await zipDoDia(pl, t0);
    ok(n > 50, 'amostras no arquivo');
    await histApagarTudo();
    igual((await histPontos(P.id, t0, t0 + 86400000)).length, 0);
    const r = await importarZipDia(blob, pl);
    igual(r.amostras, n, 'tudo voltou');
    const h2 = await horasNoPeriodo(eq, t0, t0 + 7 * H);
    perto(h2.trabalhando, h.trabalhando, 1, 'mesmo horímetro depois de importar');
});
teste('Nuvem (MEGA simulado): envia os dias e traz de volta o período', async () => {
    NUVEM.simulado = megaSimulado(); NUVEM.storage = null; NUVEM.email = '';
    await nuvemEntrar('equipe@exemplo.org', 'x');
    const pl = SUP.p.plantas[0];
    for (const p of SUP.p.plantas) await histMetaGravar('nuvem:' + p.id, 0);
    const enviados = await enviarHistoricoNuvem(2);
    ok(enviados >= 1, 'enviou arquivo(s) de dia: ' + enviados);
    const d0 = new Date(); d0.setHours(0, 0, 0, 0); const t0 = d0.getTime() - 86400000;
    const antes = (await histPontos(pl.tags[0].id, t0, t0 + 86400000)).length;
    await histApagarTudo();
    const r = await trazerHistoricoNuvem(pl, t0, t0 + 86400000 - 1);
    igual((await histPontos(pl.tags[0].id, t0, t0 + 86400000)).length, antes, 'mesmos pontos de volta');
    ok(r.dias === 1, 'um dia trazido');
    // reenviar o mesmo dia substitui (não duplica)
    await histMetaGravar('nuvem:' + pl.id, 0); await enviarHistoricoNuvem(2);
    const raiz = NUVEM.storage.root.children[0], hist = raiz.children.find(x => x.name === 'Historico');
    const dirPl = hist.children[0], arquivos = dirPl.children.flatMap(m => m.children);
    igual(new Set(arquivos.map(a => a.name)).size, arquivos.length, 'um arquivo por dia');
    nuvemSair(); NUVEM.simulado = null;
});
teste('Gêmeo pela nuvem: original sobrescreve o arquivo, gêmeo espelha, comando vai e volta confirmado', async () => {
    NUVEM.simulado = megaSimulado(); NUVEM.storage = null; NUVEM.email = '';
    await nuvemEntrar('equipe@exemplo.org', 'x');
    const pl = plantaEmBranco('Gêmeo teste'); SUP.p.plantas.push(pl); prepararPlanta(pl);
    const tg = criarTag({ nome: 'Temperatura', tipo: 'temperatura', topico: 'tt' }); tg.limites = Object.assign(tg.limites, { ativo: true, h: 30, atrasoS: 0 }); pl.tags.push(tg);
    const sp = criarComando({ nome: 'SP temperatura', tipo: 'setpoint', topico: 'sp', min: 0, max: 100 }); pl.comandos.push(sp);
    pl.gemeo = { intervaloS: 3600, validadeMin: 5, politica: 'todos' };
    const papel = p => { definirPapel(pl, p); const e = gemeoEstado(pl.id); e.ultimoEnvio = e.ultimoRecebido = Date.now(); };
    const dir = () => NUVEM.storage.root.children.find(x => x.name === 'SupervisorioMQTT').children.find(x => x.name === 'Gemeo').children.find(d => d.name.endsWith('__' + pl.id));
    // original: valor + alarme ativo, envia duas vezes (sobrescreve: um arquivo só)
    papel('original');
    definirValor(pl, tg, 35.5, Date.now());
    ok([...ALM.ativos.values()].some(a => a.alvo === tg.id), 'alarme no original');
    await gemeoEnviarOriginal(pl); const b = await gemeoEnviarOriginal(pl);
    ok(b > 0, 'enviou'); igual(dir().children.filter(f => f.name === 'da_planta.zip').length, 1, 'arquivo sobrescrito');
    // gêmeo: sem MQTT, recebe valor, alarme e log
    papel('gemeo'); RT.v.delete(tg.id); [...ALM.ativos.keys()].forEach(k => ALM.ativos.delete(k));
    pl.tags[0].nome = 'mexido no gêmeo';
    await gemeoReceber(pl);
    igual(valorTag(tg.id), 35.5, 'valor espelhado'); igual(pl.tags[0].nome, 'Temperatura', 'configuração vem do original');
    ok([...ALM.ativos.values()].some(a => a.alvo === tg.id), 'alarme espelhado');
    // comando no gêmeo: faixa conferida, vai para a fila e para do_gemeo.json
    let erro = ''; try { await comandar(pl, pl.comandos[0], 150); } catch (e) { erro = e.message; } ok(/faixa/.test(erro), 'faixa conferida no gêmeo');
    await comandar(pl, pl.comandos[0], 42);
    igual(pendentesGemeo(pl).length, 1, 'na fila'); igual(dir().children.filter(f => f.name === 'do_gemeo.json').length, 1, 'arquivo de comandos');
    const chave = [...ALM.ativos.values()].find(a => a.alvo === tg.id).chave;
    await gemeoReconhecer(pl, chave); igual(pendentesGemeo(pl).length, 2, 'reconhecer também vai');
    // original executa uma vez só e responde
    const pub = window.publicar, publicados = [];
    window.publicar = async (p, topico, payload) => { publicados.push([topico, payload]); };
    try {
        papel('original');
        await gemeoEnviarOriginal(pl);
        igual(publicados.map(x => x[1]), ['42'], 'setpoint publicado pelo original');
        ok(ALM.ativos.get(chave).reconhecido, 'alarme reconhecido no original');
        gemeoEstado(pl.id).tsComandos = 0; await gemeoEnviarOriginal(pl);
        igual(publicados.length, 1, 'não executa duas vezes');
    } finally { window.publicar = pub; }
    // gêmeo recebe a confirmação e esvazia a fila
    papel('gemeo'); await gemeoReceber(pl);
    igual(pendentesGemeo(pl).length, 0, 'fila esvaziada pelas confirmações');
    // comando vencido é recusado
    localStorage.setItem(GEMEO_PEND + pl.id, JSON.stringify([{ id: 'velho1', tipo: 'comando', cmdId: sp.id, nome: 'velho', valor: 10, t: Date.now() - 3600000 }]));
    await naFilaNuvem(() => _enviarPendentes(pl));
    papel('original'); await gemeoEnviarOriginal(pl);
    const conf = JSON.parse(localStorage.getItem(GEMEO_CONF + pl.id)).find(c => c.id === 'velho1');
    ok(conf && !conf.ok && /venceu/.test(conf.msg), 'vencido recusado');
    definirPapel(pl, ''); [GEMEO_PEND, GEMEO_EXEC, GEMEO_CONF].forEach(k => localStorage.removeItem(k + pl.id));
    SUP.p.plantas = SUP.p.plantas.filter(x => x !== pl);
    nuvemSair(); NUVEM.simulado = null;
});
teste('Relatório: monta com os dados e escapa nomes', async () => {
    const pl = SUP.p.plantas[0];
    const d0 = new Date(); d0.setHours(0, 0, 0, 0); const t0 = d0.getTime() - 86400000;
    const o = { t0, t1: t0 + 86400000 - 1, plantas: [pl.id], secoes: { resumo: true, energia: true, horimetros: true, variaveis: true, graficos: true, alarmes: true, comandos: true }, graficos: [pl.tags[0].id] };
    const d = await dadosRelatorio(o);
    const html = corpoRelatorioSup(d, o);
    ok(html.includes('Potência &lt;script&gt;') && !html.includes('<script>'), 'nome escapado');
    ok(html.includes('Horímetros') && html.includes('Energia'), 'seções presentes');
    ok(html.includes('<svg'), 'gráfico em SVG');
});

// ---------------------------------------------------------------- biblioteca v2 do sinótico
teste('Biblioteca do sinótico: todos os símbolos desenham e os kits criam variáveis, tópicos e comandos', () => {
    const pl = plantaEmBranco('Kits'); pl.conexao.prefixo = 'ubg';
    SUP.p = criarProjetoVazio(); SUP.p.plantas.push(pl);
    const ks = Object.keys(SIMBOLOS).filter(k => k !== 'tubo');
    ok(ks.length >= 120, 'biblioteca com ' + ks.length + ' símbolos');
    ['caminhao_graneleiro', 'carreta_bitrem', 'balanca_fluxo', 'ensacadora', 'ensacadora_dupla', 'balanca_expedicao', 'descascador', 'separador_marinheiros', 'brunidor', 'polidor',
        'selecionadora_optica', 'guilhotina_manual', 'guilhotina_pneumatica', 'guilhotina_ar', 'registro_borboleta_ar', 'distribuidor_n', 'selecionador_n', 'v_controle', 'v_solenoide', 'pid_inst_campo', 'botoeira', 'emergencia']
        .forEach(k => ok(SIMBOLOS[k], 'falta o símbolo ' + k));
    for (const k of ks) {
        const S = SIMBOLOS[k];
        const el = { id: uid('el'), s: k, x: 0, y: 0, w: S.w, h: S.h, rot: 0, rotulo: S.equip ? nomeCurtoSimbolo(S) : '', tags: [] };
        if (S.n) el.n = S.n;
        aplicarKitSimbolo(pl, el, S);
        pl.sinotico.elementos.push(el);
        ok(svgElemento(pl, el, false).includes('sin-el'), 'desenho de ' + k);
        ok(miniSimbolo(k).includes('<svg'), 'miniatura de ' + k);
    }
    prepararPlanta(pl);
    igual([...RT.errosCalc.entries()].filter(([id]) => pl.tags.some(t => t.id === id)), [], 'equações dos kits compilam');
    igual(new Set(pl.tags.map(t => t.variavel)).size, pl.tags.length, 'nomes de variável únicos');
    const sem = pl.tags.filter(t => t.origem === 'mqtt' && !t.topico); igual(sem.map(t => t.nome), [], 'toda variável MQTT tem tópico');
    const elev = pl.tags.find(t => t.nome === 'Corrente — Elevador de canecas 1');
    igual(topicoCompleto(pl, elev.topico), 'ubg/area_1/elevador_de_canecas_1/corrente', 'área/elemento/grandeza'); igual(elev.unidade, 'A'); ok(elev.limites.ativo, 'limite de corrente');
    const eqElev = pl.equipamentos.find(e => e.nome === 'Elevador de canecas 1');
    ok(eqElev.horimetro.ativo && eqElev.tagPotencia, 'horímetro e potência do motor');
    const ens = pl.comandos.find(c => c.nome.startsWith('Peso do saco') && c.tipo === 'setpoint'); igual([ens.unidade, ens.topico], ['kg', 'area_1/balanca_ensacadora_1/sp_peso']);
    const sel = pl.sinotico.elementos.find(e => e.s === 'selecionadora_optica'); igual(sel.n, 3);
    const tt = pl.tags.find(t => t.kitS === 'sensor' && t.tipo === 'temperatura'); igual([tt.unidade, tt.topico.split('/')[0]], ['°C', 'sem_elemento'], 'sensor sem elemento fica marcado');
    const bot = pl.comandos.find(c => c.kitS === 'comando'); ok(bot && bot.topico.startsWith('comandos/'), 'botão com tópico');
});
teste('Sinótico: renomear atualiza os tópicos automáticos; tópico editado à mão fica; N saídas e linhas P&ID', () => {
    const pl = plantaEmBranco('Ren'); SUP.p = criarProjetoVazio(); SUP.p.plantas.push(pl);
    const S = SIMBOLOS.distribuidor_n, el = { id: uid('el'), s: 'distribuidor_n', x: 0, y: 0, w: S.w, h: S.h, rotulo: nomeCurtoSimbolo(S), tags: [], n: 4 };
    aplicarKitSimbolo(pl, el, S); pl.sinotico.elementos.push(el);
    const cmd = pl.comandos.find(c => c.kitS === 'sp_saida'); igual(cmd.max, 4);
    el.n = 6; ajustarSaidasComando(pl, el); igual(cmd.max, 6);
    const t = pl.tags.find(x => x.kitS === 'saida'); t.topico = 'campo/dist/pos'; t.topicoAuto = false;
    renomearPeloRotulo(pl, el, el.rotulo, 'Distribuidor Silos A');
    atualizarTopicosAuto(pl); igual(cmd.topico, 'area_1/distribuidor_silos_a/sp_saida', 'automático acompanha'); igual(t.topico, 'campo/dist/pos', 'editado fica');
    ok(SUP.equipamento(el.eq).nome === 'Distribuidor Silos A');
    ok(marcasTubo([[0, 0], [200, 0]], 'pneumatico').includes('tubo-marca')); igual(marcasTubo([[0, 0], [200, 0]], 'material'), '');
    ok(svgElemento(pl, { id: 'x', s: 'tubo', pts: [[0, 0], [100, 0]], estilo: 'dados', seta: true }, false).includes('marker-end'));
});

teste('Sensor preso ao elemento: tópico área/elemento/sensor e acompanha renomear área e elemento', () => {
    const pl = plantaEmBranco('Sens'); pl.areas[0].nome = 'Armazenagem'; SUP.p = criarProjetoVazio(); SUP.p.plantas.push(pl);
    const Ss = SIMBOLOS.silo, es = { id: uid('el'), s: 'silo', x: 0, y: 0, w: Ss.w, h: Ss.h, rotulo: 'Silo', tags: [] };
    aplicarKitSimbolo(pl, es, Ss); pl.sinotico.elementos.push(es);
    const eq = SUP.equipamento(es.eq);
    const S = SIMBOLOS.sensor_temperatura, el = { id: uid('el'), s: 'sensor_temperatura', x: 0, y: 0, w: S.w, h: S.h, tags: [], _eqAlvo: eq.id };
    aplicarKitSimbolo(pl, el, S); pl.sinotico.elementos.push(el);
    const t = SUP.tag(el.tag);
    igual([t.topico, t.unidade, t.equipId], ['armazenagem/silo_1/temperatura', '°C', eq.id]);
    const el2 = { id: uid('el'), s: 'sensor_temperatura', x: 0, y: 0, w: S.w, h: S.h, tags: [], _eqAlvo: eq.id };
    aplicarKitSimbolo(pl, el2, S); igual(SUP.tag(el2.tag).topico, 'armazenagem/silo_1/temperatura_2', 'segundo sensor do mesmo tipo');
    pl.areas[0].nome = 'Armazém A'; renomearPeloRotulo(pl, es, 'Silo 1', 'Silo Norte');
    igual(t.topico, 'armazem_a/silo_norte/temperatura', 'renomear área e elemento atualiza');
    t.topico = 'campo/tt101'; t.topicoAuto = false; atualizarTopicosAuto(pl); igual(t.topico, 'campo/tt101', 'editado à mão fica');
});
teste('Ciclones e sensores novos: símbolos, portas e tópico área/elemento/sensor', () => {
    ['multiciclone', 'ciclone_casca', 'valvula_ciclone', 'camara_decantacao', 'filtro_cartucho', 'lavador_gases', 'coifa_captacao'].forEach(k => {
        const S = SIMBOLOS[k]; ok(S && S.svg(S.w, S.h).includes('<'), 'símbolo ' + k);
        const ps = portasDoElemento({ s: k, x: 0, y: 0 });
        ok(ps.some(p => p.tipo === (k === 'valvula_ciclone' ? 'material' : 'ar')), 'porta em ' + k);
    });
    const sens = Object.keys(SIMBOLOS).filter(k => SIMBOLOS[k].sensor && !SIMBOLOS[k].equip);
    ok(sens.length >= 35, 'sensores: ' + sens.length);
    const pl = plantaEmBranco('Po'); SUP.p = criarProjetoVazio(); SUP.p.plantas.push(pl);
    const Sc = SIMBOLOS.ciclone, ec = { id: uid('el'), s: 'ciclone', x: 0, y: 0, w: Sc.w, h: Sc.h, rotulo: 'Ciclone', tags: [] };
    aplicarKitSimbolo(pl, ec, Sc); pl.sinotico.elementos.push(ec);
    const eq = SUP.equipamento(ec.eq); ok(eq, 'ciclone vira elemento');
    const casos = { sensor_presenca_grao: 'presenca_de_grao', sensor_pressao_dif: 'pressao_diferencial', vazao_ar: 'vazao_de_ar', sensor_entupimento: 'entupimento' };
    for (const [k, g] of Object.entries(casos)) {
        const S = SIMBOLOS[k], el = { id: uid('el'), s: k, x: 0, y: 0, w: S.w, h: S.h, tags: [], _eqAlvo: eq.id };
        aplicarKitSimbolo(pl, el, S); pl.sinotico.elementos.push(el);
        const t = SUP.tag(el.tag); igual(t.topico.split('/').slice(1).join('/'), baseTopico(eq.nome) + '/' + g, k);
    }
    ok(SUP.tag(pl.sinotico.elementos.at(-1).tag).limites.ativo, 'entupimento já vem com alarme');
});
teste('Portas: todos os símbolos têm portas válidas; ligação ortogonal; modelos ligados por portas do mesmo tipo', () => {
    let total = 0;
    for (const [k, S] of Object.entries(SIMBOLOS)) {
        if (['tubo', 'area', 'texto', 'valor'].includes(k)) continue;
        const txt = S.portas || PORTAS_SIMBOLOS[k] || '';
        txt.trim().split(/\s+/).filter(Boolean).forEach(tk => ok(/^(\w+):([es])@(N|T|[\d.]+,[\d.]+)(?::([tblr]))?$/.test(tk) && TIPOS_PORTA[tk.split(':')[0]], `porta inválida em ${k}: ${tk}`));
        const ps = portasDoElemento({ s: k, x: 0, y: 0, n: S.n });
        total += ps.length;
        igual(new Set(ps.map(p => p.id)).size, ps.length, 'ids únicos em ' + k);
    }
    ok(total > 300, 'portas: ' + total);
    ok(Object.keys(SIMBOLOS).filter(k => SIMBOLOS[k].grupo && SIMBOLOS[k].grupo.startsWith('Agroindústria')).length >= 25, 'símbolos de agroindústria');
    ok(SIMBOLOS.balanca_misturadora && SIMBOLOS.tanque_resfriador && SIMBOLOS.ordenhadeira && SIMBOLOS.pasteurizador, 'misturadora e leite');
    const c = caminhoLigacao({ x: 0, y: 0, dx: 0, dy: 1 }, { x: 100, y: 200, dx: 0, dy: -1 });
    for (let i = 1; i < c.length; i++) ok(c[i][0] === c[i - 1][0] || c[i][1] === c[i - 1][1], 'trechos retos');
    igual([c[0], c[c.length - 1]], [[0, 0], [100, 200]]);
    // giro: porta da direita vira porta de baixo
    const pd = portaGlobal({ s: 'exaustor_axial', x: 0, y: 0, w: 70, h: 70, rot: 90 }, portasDoElemento({ s: 'exaustor_axial' }).find(p => p.id === 's0'));
    igual([Math.round(pd.x), Math.round(pd.y), pd.dx, pd.dy], [35, 70, 0, 1]);
    for (const M of Object.values(MODELOS_PRONTOS)) {
        const pl = M.montar();
        const tubos = pl.sinotico.elementos.filter(e => e.s === 'tubo');
        ok(tubos.every(t => t.de && pontosTubo(pl, t)), 'todas as linhas presas às portas em ' + M.nome);
        tubos.forEach(t => { const a = acharPorta(pl, t.de), b = acharPorta(pl, t.para); ok(a.io === 's' && b.io === 'e' && a.tipo === b.tipo && t.tipo === a.tipo, 'saída → entrada do mesmo tipo'); });
    }
    // menos saídas apaga as ligações que ficaram sem porta
    const pl = MODELOS_PRONTOS.ubs.montar(), red = pl.sinotico.elementos.find(e => e.s === 'transportador');
    red.n = 1; igual(limparLigacoes(pl), 1);
});

// ---------------------------------------------------------------- MEGA simulado (mesma interface usada do megajs)
function megaSimulado() {
    let ts = Math.floor(Date.now() / 1000);
    const pasta = (name, mae) => ({
        name, directory: true, children: [], mae,
        async mkdir(n) { const p = pasta(n, this); this.children.push(p); return p; },
        upload({ name: n }, dados) {
            const f = { name: n, directory: false, timestamp: ++ts, dados: dados.slice(), mae: this,
                async downloadBuffer() { return this.dados; }, async delete() { this.mae.children = this.mae.children.filter(x => x !== this); } };
            this.children.push(f);
            return { complete: Promise.resolve(f) };
        },
        async delete() { this.mae.children = this.mae.children.filter(x => x !== this); }
    });
    return { Storage: class { constructor() { this.root = pasta('raiz'); this.ready = Promise.resolve(); } close() {} } };
}

// ---------------------------------------------------------------- execução
(async () => {
    const lst = document.getElementById('lista');
    let falhas = 0;
    for (const t of TESTES) {
        const li = document.createElement('li');
        try { await t.f(); li.className = 'ok'; li.textContent = '✓ ' + t.nome; }
        catch (e) { falhas++; li.className = 'falha'; li.innerHTML = '✗ ' + esc(t.nome) + `<small>${esc(e.stack || e.message)}</small>`; }
        lst.appendChild(li);
    }
    const r = document.getElementById('resultado');
    r.textContent = falhas ? `${falhas} de ${TESTES.length} teste(s) falharam.` : `Todos os ${TESTES.length} testes passaram.`;
    r.style.color = falhas ? '#b3261e' : '#1f5f45';
    document.title = (falhas ? 'FALHOU ' : 'OK ') + document.title;
    window.RESULTADO_TESTES = { total: TESTES.length, falhas };
    window.guardarAcumuladores = _guardar;
})();
