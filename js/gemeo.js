/**
 * © 2026 Supervisório MQTT — Inova Agro UFPel EMBRAPII. Código aberto; cópias permitidas desde que citadas.
 *
 * GÊMEO PELA NUVEM (MEGA) — a mesma planta em dois lugares, sem broker no segundo:
 *   ORIGINAL: está na rede da planta, é o cliente MQTT (assina, publica, controla, grava). A cada intervalo (padrão 1 min)
 *             SOBRESCREVE um arquivo "da_planta.zip" com o log do dia todo (amostras.csv, eventos.csv) e o estado.json
 *             (configuração da planta, valores atuais, horímetros, alarmes ativos e as respostas aos comandos do gêmeo).
 *             Lê "do_gemeo.json" e executa os comandos novos (com as mesmas faixas e regras da tela) dentro da validade.
 *   GÊMEO:    é um supervisório completo da mesma planta (telas, gráficos, alarmes, relatórios), mas não conecta no broker:
 *             os dados vêm do "da_planta.zip" (com atraso). Ao comandar ou reconhecer alarme, SOBRESCREVE "do_gemeo.json"
 *             com a lista de comandos pendentes; o original executa e responde no próximo "da_planta.zip".
 * Um escritor por arquivo (o original só escreve da_planta.zip, o gêmeo só escreve do_gemeo.json): não há conflito.
 * Pasta: SupervisorioMQTT/Gemeo/<planta>__<id>/
 * O papel (original, gêmeo ou nenhum) é deste navegador (localStorage), não do arquivo de configuração: o mesmo projeto
 * pode ser original num computador e gêmeo em outro. Comandos de segurança (emergência, intertravamentos) nunca devem
 * depender do gêmeo: o atraso é de 1 a 2 intervalos e a decisão final é sempre do original.
 */

'use strict';

const GEMEO = {
    papeis: {},                 // plId → 'original' | 'gemeo'
    est: new Map(),             // plId → { ultimoEnvio, ultimoRecebido, dadosDe, bytes, erro, ocupado, tsArquivo, tsComandos, ultimoT }
    ARQ_PLANTA: 'da_planta.zip', ARQ_GEMEO: 'do_gemeo.json'
};
const GEMEO_CHAVE = 'sup_gemeo_papel', GEMEO_PEND = 'sup_gemeo_pend_', GEMEO_EXEC = 'sup_gemeo_exec_', GEMEO_CONF = 'sup_gemeo_conf_';

function _lsLer(k, padrao) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : padrao; } catch (e) { return padrao; } }
function _lsGravar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ok */ } }
GEMEO.papeis = _lsLer(GEMEO_CHAVE, {});

function gemeoPapel(pl) { return (pl && GEMEO.papeis[pl.id]) || ''; }
function ehGemeo(pl) { return gemeoPapel(pl) === 'gemeo'; }
function gemeoOpcoes(pl) {
    if (!pl.gemeo) pl.gemeo = {};
    const g = pl.gemeo;
    if (!(num(g.intervaloS) >= 30)) g.intervaloS = 60;
    if (!(num(g.validadeMin) > 0)) g.validadeMin = 5;
    if (!['todos', 'setpoints', 'nenhum'].includes(g.politica)) g.politica = 'todos';
    return g;
}
function gemeoEstado(plId) { let e = GEMEO.est.get(plId); if (!e) { e = { ultimoEnvio: 0, ultimoRecebido: 0, dadosDe: 0, bytes: 0, erro: '', ocupado: false, tsArquivo: 0, tsComandos: 0, ultimoT: 0 }; GEMEO.est.set(plId, e); } return e; }
function definirPapel(pl, papel) {
    if (papel) GEMEO.papeis[pl.id] = papel; else delete GEMEO.papeis[pl.id];
    _lsGravar(GEMEO_CHAVE, GEMEO.papeis);
    gemeoOpcoes(pl);
    if (papel === 'gemeo') desconectarPlanta(pl.id, true);
    const e = gemeoEstado(pl.id); e.ultimoEnvio = 0; e.ultimoRecebido = 0; e.tsArquivo = 0; e.tsComandos = 0;
    logar('nuvem', papel === 'gemeo' ? 'Este navegador passou a ser o GÊMEO da planta (dados e comandos pela nuvem)' : papel === 'original' ? 'Este navegador passou a ser o ORIGINAL da planta (envia para o gêmeo pela nuvem)' : 'Gêmeo pela nuvem desligado nesta planta', pl.nome);
}
/** Idade dos dados no gêmeo (ms) ou null. */
function idadeGemeo(pl) { const e = GEMEO.est.get(pl.id); return e && e.dadosDe ? Date.now() - e.dadosDe : null; }

// ---------------------------------------------------------------- pastas
async function _recarregarArvore(st) { if (st && typeof st.reload === 'function') { try { await st.reload(true); } catch (e) { /* segue com a árvore que tem */ } } }
async function pastaGemeo(pl, criar = true) {
    const st = await nuvemGarantir(false);
    await _recarregarArvore(st);
    const raiz = await pasta(st.root, NUVEM.pastaRaiz);
    const base = criar ? await pasta(raiz, 'Gemeo') : filhosDe(raiz).find(d => d.directory && d.name === 'Gemeo');
    if (!base) return null;
    const ja = filhosDe(base).find(d => d.directory && d.name.endsWith('__' + pl.id));
    if (ja || !criar) return ja || null;
    return pasta(base, `${nomeSeguro(pl.nome)}__${pl.id}`);
}
const _maisNovo = (dir, nome) => filhosDe(dir).filter(f => !f.directory && f.name === nome).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0] || null;

// ---------------------------------------------------------------- ORIGINAL
function _estadoOriginal(pl) {
    const valores = {};
    pl.tags.forEach(t => { const x = RT.v.get(t.id); if (x) valores[t.id] = [x.v, x.t, x.q]; });
    const equip = {}; pl.equipamentos.forEach(eq => { const x = RT.equip.get(eq.id); if (x) equip[eq.id] = x; });
    const integrais = {}; pl.tags.forEach(t => { if (RT.acumIntegral.has(t.id)) integrais[t.id] = RT.acumIntegral.get(t.id); });
    const alarmes = [...ALM.ativos.values()].filter(a => a.plId === pl.id);
    const cfg = JSON.parse(JSON.stringify(pl));
    return { formato: 'supervisorio-gemeo-1', plantaId: pl.id, planta: pl.nome, enviadoEm: Date.now(), config: cfg, valores, equip, integrais, alarmes, confirmacoes: _lsLer(GEMEO_CONF + pl.id, []) };
}
async function gemeoEnviarOriginal(pl) {
    const dir = await pastaGemeo(pl, true);
    // 1) comandos do gêmeo (antes de enviar: as respostas já vão neste envio)
    await gemeoLerComandos(pl, dir);
    // 2) log do dia todo + estado, sobrescrevendo o arquivo anterior
    await histDescarregar();
    const { blob } = await zipDoDia(pl, inicioDoDia(Date.now()), { 'estado.json': JSON.stringify(_estadoOriginal(pl)) });
    await enviarSubstituindo(dir, GEMEO.ARQ_PLANTA, blob);
    const e = gemeoEstado(pl.id); e.ultimoEnvio = Date.now(); e.bytes = blob.size; e.erro = '';
    return blob.size;
}
/** Lê do_gemeo.json e executa os comandos ainda não executados. Devolve quantos foram tratados. */
async function gemeoLerComandos(pl, dir) {
    const e = gemeoEstado(pl.id);
    const arq = _maisNovo(dir, GEMEO.ARQ_GEMEO);
    if (!arq || (arq.timestamp && arq.timestamp === e.tsComandos)) return 0;
    let dados;
    try { dados = JSON.parse(await (await baixar(arq)).text()); } catch (er) { logar('nuvem', 'Arquivo de comandos do gêmeo ilegível: ' + er.message, pl.nome, 'erro'); e.tsComandos = arq.timestamp; return 0; }
    e.tsComandos = arq.timestamp;
    if (!dados || dados.plantaId !== pl.id || !Array.isArray(dados.comandos)) return 0;
    const exec = _lsLer(GEMEO_EXEC + pl.id, {}), conf = _lsLer(GEMEO_CONF + pl.id, []);
    const op = gemeoOpcoes(pl), agora = Date.now();
    let n = 0;
    for (const c of dados.comandos) {
        if (!c || !c.id || exec[c.id]) continue;
        exec[c.id] = agora; n++;
        let ok = false, msg = '';
        try {
            if (agora - num(c.t, 0) > op.validadeMin * 60000) throw new Error(`venceu (mais de ${op.validadeMin} min desde que foi dado no gêmeo)`);
            if (op.politica === 'nenhum') throw new Error('o original não aceita comandos do gêmeo');
            if (c.tipo === 'reconhecer') {
                reconhecerAlarme(c.chave); msg = 'alarme reconhecido';
            } else {
                const cmd = pl.comandos.find(x => x.id === c.cmdId);
                if (!cmd) throw new Error('comando não existe no original');
                if (op.politica === 'setpoints' && cmd.tipo !== 'setpoint') throw new Error('o original só aceita setpoints do gêmeo');
                await comandar(pl, cmd, c.valor);
                msg = 'executado';
            }
            ok = true;
            logar('comando', `Pelo gêmeo: ${c.nome || c.tipo} — ${msg}`, pl.nome);
        } catch (er) {
            msg = er.message;
            logar('comando', `Pelo gêmeo: ${c.nome || c.tipo} — recusado: ${msg}`, pl.nome, 'erro');
        }
        conf.push({ id: c.id, ok, msg, t: Date.now() });
    }
    Object.keys(exec).forEach(k => { if (agora - exec[k] > 2 * 86400000) delete exec[k]; });
    _lsGravar(GEMEO_EXEC + pl.id, exec);
    _lsGravar(GEMEO_CONF + pl.id, conf.filter(x => agora - x.t < 86400000).slice(-200));
    return n;
}

// ---------------------------------------------------------------- GÊMEO
function pendentesGemeo(pl) { return _lsLer(GEMEO_PEND + pl.id, []); }
function _gravarPendentes(pl, lst) { _lsGravar(GEMEO_PEND + pl.id, lst); }
async function _enviarPendentes(pl) {
    const dir = await pastaGemeo(pl, true);
    const corpo = { formato: 'supervisorio-gemeo-1', plantaId: pl.id, enviadoEm: Date.now(), comandos: pendentesGemeo(pl) };
    await enviarSubstituindo(dir, GEMEO.ARQ_GEMEO, new Blob([JSON.stringify(corpo)], { type: 'application/json' }));
}
/** No gêmeo, comandar = pôr na fila e sobrescrever do_gemeo.json (o original executa no próximo ciclo dele). */
async function gemeoComandar(pl, cmd, valor) {
    if (cmd.tipo === 'setpoint') {
        const v = num(valor);
        if (v == null) throw new Error('valor inválido');
        if (v < num(cmd.min, -Infinity) || v > num(cmd.max, Infinity)) throw new Error(`fora da faixa permitida (${cmd.min} a ${cmd.max})`);
        valor = v;
    }
    const c = { id: uid('gc'), tipo: 'comando', cmdId: cmd.id, nome: cmd.nome + (cmd.tipo === 'chave' ? (valor ? ': LIGAR' : ': DESLIGAR') : cmd.tipo === 'setpoint' ? ` = ${valor}` : ''), valor, t: Date.now() };
    await _enfileirar(pl, c);
    cmd.ultimo = { t: Date.now(), valor, pendente: true };
}
async function gemeoReconhecer(pl, chave) {
    const al = ALM.ativos.get(chave);
    await _enfileirar(pl, { id: uid('gc'), tipo: 'reconhecer', chave, nome: 'Reconhecer ' + (al ? al.texto.split(' — ')[0] : 'alarme'), t: Date.now() });
    if (al) { al.reconhecido = true; al.reconhecidoEm = Date.now(); al.pendenteGemeo = true; ALM.mudou = true; }
}
async function _enfileirar(pl, c) {
    const lst = pendentesGemeo(pl); lst.push(c); _gravarPendentes(pl, lst);
    logar('comando', `${c.nome} → enviado ao original pela nuvem (aguardando confirmação)`, pl.nome);
    try { await naFilaNuvem(() => _enviarPendentes(pl)); }
    catch (er) { gemeoEstado(pl.id).erro = er.message; throw new Error('ficou na fila, mas a nuvem falhou: ' + er.message); }
}

/** Baixa da_planta.zip (se mudou) e aplica: configuração, valores, horímetros, alarmes, log do dia e respostas. */
async function gemeoReceber(pl) {
    const e = gemeoEstado(pl.id);
    const dir = await pastaGemeo(pl, false);
    if (!dir) throw new Error('o original ainda não enviou nada desta planta para a nuvem');
    const arq = _maisNovo(dir, GEMEO.ARQ_PLANTA);
    if (!arq) throw new Error('o original ainda não enviou nada desta planta para a nuvem');
    e.ultimoRecebido = Date.now();
    let mudou = false;
    if (!(arq.timestamp && arq.timestamp === e.tsArquivo)) {
        const blob = await baixar(arq);
        await aplicarPacoteGemeo(pl, blob);
        e.tsArquivo = arq.timestamp; e.bytes = blob.size; mudou = true;
    }
    // pendentes: some quem foi respondido; reenvia a fila se mudou (ou se ficou sem resposta)
    e.erro = '';
    return mudou;
}
async function aplicarPacoteGemeo(pl, blob) {
    const e = gemeoEstado(pl.id);
    const zip = await JSZip.loadAsync(blob);
    const est = JSON.parse(await zip.file('estado.json').async('string'));
    if (est.plantaId !== pl.id) throw new Error('o arquivo é de outra planta');
    // 1) configuração: a do original manda (o gêmeo não edita a planta)
    if (est.config && JSON.stringify(est.config) !== JSON.stringify(pl)) {
        Object.keys(pl).forEach(k => delete pl[k]); Object.assign(pl, est.config);
        SUP.alterado('pl');
    }
    // 2) valores atuais, horímetros e integrais
    Object.entries(est.valores || {}).forEach(([id, [v, t, q]]) => { RT.v.set(id, { v, t, q: q || 'ok' }); RT.sujo.add(id); });
    Object.entries(est.equip || {}).forEach(([id, x]) => RT.equip.set(id, x));
    Object.entries(est.integrais || {}).forEach(([id, x]) => RT.acumIntegral.set(id, x));
    // 3) alarmes: espelho do original (o que o gêmeo reconheceu e ainda não voltou confirmado continua reconhecido)
    const novos = new Map((est.alarmes || []).map(a => [a.chave, a]));
    [...ALM.ativos.keys()].forEach(k => { const a = ALM.ativos.get(k); if (a.plId === pl.id && !novos.has(k)) ALM.ativos.delete(k); });
    novos.forEach((a, k) => {
        const ja = ALM.ativos.get(k);
        if (ja && ja.pendenteGemeo && !a.reconhecido) { a.reconhecido = true; a.pendenteGemeo = true; }
        ALM.ativos.set(k, a);
        if (!ja && !a.reconhecido && !(a.suprimidoAte > Date.now()) && typeof anunciar === 'function') anunciar(a);
    });
    ALM.mudou = true;
    // 4) log do dia: só o que é mais novo que o último recebido (o arquivo traz o dia todo)
    const desde = e.ultimoT || 0;
    if (zip.file('amostras.csv')) {
        const linhas = lerCsv(await zip.file('amostras.csv').async('string')).slice(1).filter(l => l.length >= 5 && +l[1] > desde - 120000);
        const amostras = linhas.map(l => ({ g: l[2], t: +l[1], v: num(l[4]) })).filter(a => Number.isFinite(a.v));
        await histImportar(amostras);
        amostras.forEach(a => {
            let m = HIST.memoria.get(a.g); if (!m) { m = []; HIST.memoria.set(a.g, m); }
            if (!m.length || a.t > m[m.length - 1][0]) m.push([a.t, a.v]);
            if (m.length > MEMORIA_PONTOS) m.splice(0, m.length - MEMORIA_PONTOS);
        });
    }
    if (zip.file('eventos.csv')) {
        const evs = lerCsv(await zip.file('eventos.csv').async('string')).slice(1).filter(l => l.length >= 5 && +l[1] > desde - 120000)
            .map(l => ({ t: +l[1], tipo: l[2], nivel: l[3], texto: l[4], planta: pl.nome }));
        if (evs.length) {
            const n = await histImportarEventos(evs);
            if (n) { const vistos = new Set(RT.log.map(x => x.t + '|' + x.texto)); evs.filter(x => !vistos.has(x.t + '|' + x.texto)).forEach(x => RT.log.push(x)); RT.log.sort((a, b) => a.t - b.t); if (RT.log.length > LOG_MAX) RT.log.splice(0, RT.log.length - LOG_MAX); }
        }
    }
    e.ultimoT = Math.max(desde, num(est.enviadoEm, 0));
    e.dadosDe = num(est.enviadoEm, Date.now());
    // 5) respostas aos comandos
    const conf = new Map((est.confirmacoes || []).map(c => [c.id, c]));
    const pend = pendentesGemeo(pl), resta = [];
    const op = gemeoOpcoes(pl);
    for (const c of pend) {
        const r = conf.get(c.id);
        if (r) logar('comando', `${c.nome}: ${r.ok ? 'confirmado pelo original' : 'recusado pelo original — ' + r.msg}`, pl.nome, r.ok ? 'info' : 'erro');
        else if (Date.now() - c.t > (op.validadeMin * 60 + 3 * op.intervaloS) * 1000) logar('comando', `${c.nome}: sem resposta do original (venceu)`, pl.nome, 'erro');
        else resta.push(c);
    }
    if (resta.length !== pend.length) { _gravarPendentes(pl, resta); naFilaNuvem(() => _enviarPendentes(pl)).catch(() => {}); }
    agendarTela(true);
    return est;
}

// ---------------------------------------------------------------- ciclo (chamado a cada 1 s pelo runtime; respeita o intervalo)
async function gemeoCiclo() {
    for (const pl of SUP.p.plantas) {
        const papel = gemeoPapel(pl);
        if (!papel) continue;
        const e = gemeoEstado(pl.id), op = gemeoOpcoes(pl);
        if (papel === 'gemeo') gemeoVigiarIdade(pl, e, op);
        if (!nuvemConectada()) continue;
        const ultimo = papel === 'original' ? e.ultimoEnvio : e.ultimoRecebido;
        if (e.ocupado || Date.now() - ultimo < op.intervaloS * 1000) continue;
        e.ocupado = true;
        try {
            if (papel === 'original') await naFilaNuvem(() => gemeoEnviarOriginal(pl));
            else await naFilaNuvem(() => gemeoReceber(pl));
        } catch (er) {
            e.erro = er.message;
            if (papel === 'original') e.ultimoEnvio = Date.now(); else e.ultimoRecebido = Date.now();
        } finally { e.ocupado = false; agendarTela(true); }
    }
}

/** No gêmeo: dado mais velho que 3 intervalos fica "velho" na tela e gera alarme (o original pode ter parado). */
function gemeoVigiarIdade(pl, e, op) {
    const k = chaveAlarme(pl.id, 'gemeo', 'CON'), lim = 3 * op.intervaloS * 1000;
    const idade = e.dadosDe ? Date.now() - e.dadosDe : null;
    if (idade != null && idade > lim) {
        pl.tags.forEach(t => { const x = RT.v.get(t.id); if (x && x.q === 'ok') { x.q = 'velho'; RT.sujo.add(t.id); } });
        if (!ALM.ativos.has(k)) ativarAlarme(pl, { chave: k, alvo: 'gemeo', tipo: 'CON', prioridade: 2, texto: `Gêmeo: sem dados novos do original há mais de ${formatarDuracao(Math.round(lim / 1000))} (original fechado, sem internet ou sem nuvem)` }, Date.now());
    } else if (ALM.ativos.has(k) && idade != null) normalizarAlarme(k);
}

/** Plantas que algum original está mandando para a nuvem (para abrir como gêmeo). */
async function listarGemeosNuvem() {
    const st = await nuvemGarantir();
    await _recarregarArvore(st);
    const raiz = filhosDe(st.root).find(d => d.directory && d.name === NUVEM.pastaRaiz);
    const base = raiz && filhosDe(raiz).find(d => d.directory && d.name === 'Gemeo');
    return filhosDe(base).filter(d => d.directory && d.name.includes('__')).map(d => {
        const arq = _maisNovo(d, GEMEO.ARQ_PLANTA);
        return { dir: d, nome: d.name.split('__')[0].replace(/_/g, ' '), id: d.name.split('__').pop(), arq, quando: arq ? quandoArquivo(arq) : null, bytes: arq && arq.size };
    }).filter(x => x.arq);
}
/** Abre (ou atualiza) neste navegador a planta da nuvem e torna este navegador o gêmeo dela. */
async function abrirComoGemeo(item) {
    const blob = await baixar(item.arq);
    const zip = await JSZip.loadAsync(blob);
    const est = JSON.parse(await zip.file('estado.json').async('string'));
    let pl = SUP.planta(est.plantaId);
    if (!pl) { pl = JSON.parse(JSON.stringify(est.config)); SUP.p.plantas.push(pl); SUP.alterado('pl'); }
    definirPapel(pl, 'gemeo');
    await aplicarPacoteGemeo(pl, blob);
    const e = gemeoEstado(pl.id); e.tsArquivo = item.arq.timestamp; e.ultimoRecebido = Date.now(); e.bytes = blob.size;
    return pl;
}
