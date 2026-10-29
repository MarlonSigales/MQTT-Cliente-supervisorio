/**
 * © 2026 Supervisório MQTT — Inova Agro UFPel EMBRAPII. Código aberto; cópias permitidas desde que citadas.
 *
 * GÊMEO PELA NUVEM (MEGA) — a mesma planta em dois lugares, sem broker no segundo.
 *   ORIGINAL: está na rede da planta e é o cliente MQTT (assina, publica, controla, grava).
 *   GÊMEO:    supervisório completo da mesma planta (telas, gráficos, alarmes, relatórios), sem broker; dados com atraso.
 *
 * Troca por arquivos que funcionam como uma "caixa de correio" com buffer (mutex):
 *   da_planta.zip  (original → gêmeo)  só as MUDANÇAS desde a última leitura do gêmeo: amostras.csv, eventos.csv e
 *                   estado.json (valores atuais, horímetros, alarmes, respostas aos comandos). Quem lê APAGA.
 *                   Se o gêmeo ainda não leu, o original sobrescreve juntando o que já estava (o buffer cresce);
 *                   se o arquivo sumiu, o gêmeo já leu e o próximo envio começa de onde o anterior parou.
 *   do_gemeo.json  (gêmeo → original)  comandos, reconhecimentos e o pedido "receber tudo". O original lê, executa e APAGA;
 *                   se ainda não leu, o gêmeo sobrescreve juntando os novos.
 *   planta.json    (original → gêmeo)  configuração da planta; só é reenviado quando a configuração muda (não é apagado:
 *                   é por ele que outro computador encontra a planta para abrir como gêmeo).
 * "Receber tudo" (no gêmeo, e automático ao abrir como gêmeo): o original manda o dia todo de uma vez; os dias anteriores
 * vêm do histórico normal da nuvem (um arquivo por dia). Ler duas vezes o mesmo dado não duplica (chave variável+instante).
 * Pasta: SupervisorioMQTT/Gemeo/<planta>__<id>/
 * O papel (original, gêmeo ou nenhum) é deste navegador (localStorage), não do arquivo de configuração.
 * Emergência e intertravamentos nunca devem depender do gêmeo: o atraso é de 1 a 2 intervalos e quem decide é o original.
 */

'use strict';

const GEMEO = {
    papeis: {},                 // plId → 'original' | 'gemeo'
    est: new Map(),             // plId → estado da troca nesta sessão
    ARQ_PLANTA: 'da_planta.zip', ARQ_GEMEO: 'do_gemeo.json', ARQ_CONFIG: 'planta.json', DIAS_MAX: 7
};
const GEMEO_CHAVE = 'sup_gemeo_papel', GEMEO_PEND = 'sup_gemeo_pend_', GEMEO_EXEC = 'sup_gemeo_exec_', GEMEO_CONF = 'sup_gemeo_conf_', GEMEO_BUF = 'sup_gemeo_buf_';

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
function gemeoEstado(plId) {
    let e = GEMEO.est.get(plId);
    if (!e) { e = { ultimoEnvio: 0, ultimoRecebido: 0, dadosDe: 0, bytes: 0, erro: '', ocupado: false, tsCfg: 0, dia: '', bytesDia: 0, arquivosDia: 0 }; GEMEO.est.set(plId, e); }
    return e;
}
function _contarBytes(e, n) { const d = diaISO(Date.now()); if (e.dia !== d) { e.dia = d; e.bytesDia = 0; e.arquivosDia = 0; } e.bytes = n; e.bytesDia += n; e.arquivosDia++; }
function definirPapel(pl, papel) {
    if (papel) GEMEO.papeis[pl.id] = papel; else delete GEMEO.papeis[pl.id];
    _lsGravar(GEMEO_CHAVE, GEMEO.papeis);
    gemeoOpcoes(pl);
    if (papel === 'gemeo') desconectarPlanta(pl.id, true);
    const e = gemeoEstado(pl.id); e.ultimoEnvio = 0; e.ultimoRecebido = 0; e.tsCfg = 0;
    logar('nuvem', papel === 'gemeo' ? 'Este navegador passou a ser o GÊMEO da planta (dados e comandos pela nuvem)' : papel === 'original' ? 'Este navegador passou a ser o ORIGINAL da planta (envia para o gêmeo pela nuvem)' : 'Gêmeo pela nuvem desligado nesta planta', pl.nome);
}
/** Idade dos dados no gêmeo (ms) ou null. */
function idadeGemeo(pl) { const e = GEMEO.est.get(pl.id); return e && e.dadosDe ? Date.now() - e.dadosDe : null; }

// ---------------------------------------------------------------- pastas e arquivos
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
const _copias = (dir, nome) => filhosDe(dir).filter(f => !f.directory && f.name === nome).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
const _maisNovo = (dir, nome) => _copias(dir, nome)[0] || null;
/** Lê e apaga (consome) todas as cópias de um arquivo; devolve o conteúdo da mais nova. */
async function _consumir(dir, nome) {
    const cs = _copias(dir, nome);
    if (!cs.length) return null;
    const blob = await baixar(cs[0]);
    for (const c of cs) { try { await c.delete(true); } catch (e) { /* o outro lado já trocou: a próxima leitura traz de novo (sem duplicar) */ } }
    return blob;
}
function _hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); }

// ---------------------------------------------------------------- ORIGINAL
function _bufOriginal(pl) { return _lsLer(GEMEO_BUF + pl.id, null); }
function _estadoOriginal(pl, desde) {
    const valores = {};
    pl.tags.forEach(t => { const x = RT.v.get(t.id); if (x) valores[t.id] = [x.v, x.t, x.q]; });
    const equip = {}; pl.equipamentos.forEach(eq => { const x = RT.equip.get(eq.id); if (x) equip[eq.id] = x; });
    const integrais = {}; pl.tags.forEach(t => { if (RT.acumIntegral.has(t.id)) integrais[t.id] = RT.acumIntegral.get(t.id); });
    const alarmes = [...ALM.ativos.values()].filter(a => a.plId === pl.id);
    const confirmacoes = _lsLer(GEMEO_CONF + pl.id, []).filter(c => c.t >= desde - 60000);
    return { formato: 'supervisorio-gemeo-2', plantaId: pl.id, planta: pl.nome, desde, enviadoEm: Date.now(), valores, equip, integrais, alarmes, confirmacoes };
}
/** Um ciclo do original: consome os comandos, envia o buffer de mudanças e, se mudou, a configuração. */
async function gemeoEnviarOriginal(pl) {
    const dir = await pastaGemeo(pl, true), agora = Date.now();
    let buf = _bufOriginal(pl);
    // 1) o gêmeo já leu o envio anterior? (o arquivo sumiu) → começa de onde o anterior parou
    if (!buf) buf = { desde: inicioDoDia(agora), ate: 0, cfg: '' };
    else if (!_maisNovo(dir, GEMEO.ARQ_PLANTA) && buf.ate) buf.desde = buf.ate - 3000;   // 3 s de sobra: gravações atrasadas não se perdem (repetir não duplica)
    // 2) comandos do gêmeo (antes de enviar: as respostas já vão neste envio)
    const r = await gemeoLerComandos(pl, dir);
    if (r.tudo) buf.desde = Math.min(buf.desde, inicioDoDia(agora));
    buf.desde = Math.max(buf.desde, agora - GEMEO.DIAS_MAX * 86400000);
    // 3) buffer: tudo o que aconteceu desde "desde" (sobrescreve; se o gêmeo não leu, este já inclui o anterior)
    await histDescarregar();
    const ids = pl.tags.map(t => t.id).concat(pl.equipamentos.map(e => 'est:' + e.id));
    const amostras = await histAmostrasDe(ids, buf.desde, agora);
    const evs = await histEventos(buf.desde, agora, e => e.planta === pl.nome);
    const zip = new JSZip();
    zip.file('amostras.csv', amostras.map(([g, t, v]) => `${g};${t};${v}`).join('\n'));
    zip.file('eventos.csv', csvDe(evs.slice().reverse().map(e => [e.t, e.tipo, e.nivel, e.texto]), ['t_ms', 'tipo', 'nível', 'texto']));
    zip.file('estado.json', JSON.stringify(_estadoOriginal(pl, buf.desde)));
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    await enviarSubstituindo(dir, GEMEO.ARQ_PLANTA, blob);
    buf.ate = agora;
    // 4) configuração: só quando muda (ou se alguém apagou)
    const cfg = JSON.stringify(pl), h = _hash(cfg);
    if (h !== buf.cfg || !_maisNovo(dir, GEMEO.ARQ_CONFIG)) {
        await enviarSubstituindo(dir, GEMEO.ARQ_CONFIG, new Blob([JSON.stringify({ formato: 'supervisorio-gemeo-2', plantaId: pl.id, planta: pl.nome, enviadoEm: agora, config: pl })], { type: 'application/json' }));
        buf.cfg = h;
    }
    _lsGravar(GEMEO_BUF + pl.id, buf);
    const e = gemeoEstado(pl.id); e.ultimoEnvio = agora; e.erro = ''; e.desde = buf.desde; _contarBytes(e, blob.size);
    return blob.size;
}
/** Consome do_gemeo.json e executa os comandos ainda não executados. */
async function gemeoLerComandos(pl, dir) {
    const res = { n: 0, tudo: false };
    const blob = await _consumir(dir, GEMEO.ARQ_GEMEO);
    if (!blob) return res;
    let dados;
    try { dados = JSON.parse(await blob.text()); } catch (er) { logar('nuvem', 'Arquivo de comandos do gêmeo ilegível: ' + er.message, pl.nome, 'erro'); return res; }
    if (!dados || dados.plantaId !== pl.id || !Array.isArray(dados.comandos)) return res;
    const exec = _lsLer(GEMEO_EXEC + pl.id, {}), conf = _lsLer(GEMEO_CONF + pl.id, []);
    const op = gemeoOpcoes(pl), agora = Date.now();
    for (const c of dados.comandos) {
        if (!c || !c.id || exec[c.id]) continue;
        exec[c.id] = agora; res.n++;
        let ok = false, msg = '';
        try {
            if (c.tipo === 'tudo') { res.tudo = true; msg = 'enviando o dia todo'; }
            else {
                if (agora - num(c.t, 0) > op.validadeMin * 60000) throw new Error(`venceu (mais de ${op.validadeMin} min desde que foi dado no gêmeo)`);
                if (op.politica === 'nenhum') throw new Error('o original não aceita comandos do gêmeo');
                if (c.tipo === 'reconhecer') { reconhecerAlarme(c.chave); msg = 'alarme reconhecido'; }
                else {
                    const cmd = pl.comandos.find(x => x.id === c.cmdId);
                    if (!cmd) throw new Error('comando não existe no original');
                    if (op.politica === 'setpoints' && cmd.tipo !== 'setpoint') throw new Error('o original só aceita setpoints do gêmeo');
                    await comandar(pl, cmd, c.valor);
                    msg = 'executado';
                }
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
    _lsGravar(GEMEO_CONF + pl.id, conf.filter(x => agora - x.t < 86400000).slice(-300));
    return res;
}

// ---------------------------------------------------------------- GÊMEO: comandos (fila → arquivo → entregue → confirmado)
function pendentesGemeo(pl) { return _lsLer(GEMEO_PEND + pl.id, []); }
function _gravarPendentes(pl, lst) { _lsGravar(GEMEO_PEND + pl.id, lst); }
/** Se o original já consumiu o arquivo, o que estava nele foi entregue; os novos vão num arquivo novo (ou somam ao que ainda não foi lido). */
async function _sincronizarComandos(pl, dir) {
    const lst = pendentesGemeo(pl);
    const ainda = !!_maisNovo(dir, GEMEO.ARQ_GEMEO);
    if (!ainda) lst.forEach(c => { if (c.estado === 'arquivo') c.estado = 'entregue'; });
    const enviar = lst.filter(c => c.estado === 'fila' || c.estado === 'arquivo');
    if (enviar.some(c => c.estado === 'fila')) {
        const corpo = { formato: 'supervisorio-gemeo-2', plantaId: pl.id, enviadoEm: Date.now(), comandos: enviar.map(c => { const x = Object.assign({}, c); delete x.estado; return x; }) };
        await enviarSubstituindo(dir, GEMEO.ARQ_GEMEO, new Blob([JSON.stringify(corpo)], { type: 'application/json' }));
        enviar.forEach(c => { c.estado = 'arquivo'; });
    }
    _gravarPendentes(pl, lst);
}
async function _enfileirar(pl, c) {
    c.estado = 'fila';
    const lst = pendentesGemeo(pl); lst.push(c); _gravarPendentes(pl, lst);
    if (c.tipo !== 'tudo') logar('comando', `${c.nome} → enviado ao original pela nuvem (aguardando confirmação)`, pl.nome);
    try { await naFilaNuvem(async () => _sincronizarComandos(pl, await pastaGemeo(pl, true))); }
    catch (er) { gemeoEstado(pl.id).erro = er.message; throw new Error('ficou na fila, mas a nuvem falhou: ' + er.message); }
}
/** No gêmeo, comandar = pôr na fila e gravar do_gemeo.json (o original executa no próximo ciclo dele). */
async function gemeoComandar(pl, cmd, valor) {
    if (cmd.tipo === 'setpoint') {
        const v = num(valor);
        if (v == null) throw new Error('valor inválido');
        if (v < num(cmd.min, -Infinity) || v > num(cmd.max, Infinity)) throw new Error(`fora da faixa permitida (${cmd.min} a ${cmd.max})`);
        valor = v;
    }
    await _enfileirar(pl, { id: uid('gc'), tipo: 'comando', cmdId: cmd.id, nome: cmd.nome + (cmd.tipo === 'chave' ? (valor ? ': LIGAR' : ': DESLIGAR') : cmd.tipo === 'setpoint' ? ` = ${valor}` : ''), valor, t: Date.now() });
    cmd.ultimo = { t: Date.now(), valor, pendente: true };
}
async function gemeoReconhecer(pl, chave) {
    const al = ALM.ativos.get(chave);
    await _enfileirar(pl, { id: uid('gc'), tipo: 'reconhecer', chave, nome: 'Reconhecer ' + (al ? al.texto.split(' — ')[0] : 'alarme'), t: Date.now() });
    if (al) { al.reconhecido = true; al.reconhecidoEm = Date.now(); al.pendenteGemeo = true; ALM.mudou = true; }
}
/** "Receber tudo": pede ao original o dia todo e traz os dias anteriores do histórico da nuvem. */
async function gemeoPedirTudo(pl, diasAntes = GEMEO.DIAS_MAX) {
    await _enfileirar(pl, { id: uid('gc'), tipo: 'tudo', nome: 'Receber tudo', t: Date.now() });
    logar('nuvem', 'Pedido ao original: receber tudo (o dia todo chega no próximo envio dele)', pl.nome);
    let r = { amostras: 0, dias: 0 };
    if (diasAntes > 0) { try { const hoje = inicioDoDia(Date.now()); r = await trazerHistoricoNuvem(pl, hoje - diasAntes * 86400000, hoje - 1); } catch (e) { /* sem histórico na nuvem */ } }
    return r;
}

// ---------------------------------------------------------------- GÊMEO: receber
/** Um ciclo do gêmeo: configuração (se mudou), consome o buffer de mudanças e sincroniza os comandos. */
async function gemeoReceber(pl) {
    const e = gemeoEstado(pl.id);
    const dir = await pastaGemeo(pl, false);
    if (!dir) throw new Error('o original ainda não enviou nada desta planta para a nuvem');
    e.ultimoRecebido = Date.now();
    const cfg = _maisNovo(dir, GEMEO.ARQ_CONFIG);
    if (cfg && cfg.timestamp !== e.tsCfg) { const b = await baixar(cfg); aplicarConfigGemeo(pl, JSON.parse(await b.text())); e.tsCfg = cfg.timestamp; }
    const blob = await _consumir(dir, GEMEO.ARQ_PLANTA);
    if (blob) { await aplicarPacoteGemeo(pl, blob); _contarBytes(e, blob.size); }
    await _sincronizarComandos(pl, dir);
    e.erro = '';
    return !!blob;
}
function aplicarConfigGemeo(pl, dados) {
    if (!dados || dados.plantaId !== pl.id || !dados.config) return false;
    if (JSON.stringify(dados.config) === JSON.stringify(pl)) return false;
    Object.keys(pl).forEach(k => delete pl[k]); Object.assign(pl, dados.config);
    SUP.alterado('pl');
    return true;
}
async function aplicarPacoteGemeo(pl, blob) {
    const e = gemeoEstado(pl.id);
    const zip = await JSZip.loadAsync(blob);
    const est = JSON.parse(await zip.file('estado.json').async('string'));
    if (est.plantaId !== pl.id) throw new Error('o arquivo é de outra planta');
    // 1) valores atuais, horímetros e integrais
    Object.entries(est.valores || {}).forEach(([id, [v, t, q]]) => { RT.v.set(id, { v, t, q: q || 'ok' }); RT.sujo.add(id); });
    Object.entries(est.equip || {}).forEach(([id, x]) => RT.equip.set(id, x));
    Object.entries(est.integrais || {}).forEach(([id, x]) => RT.acumIntegral.set(id, x));
    // 2) alarmes: espelho do original (o que o gêmeo reconheceu e ainda não voltou confirmado continua reconhecido)
    const novos = new Map((est.alarmes || []).map(a => [a.chave, a]));
    [...ALM.ativos.keys()].forEach(k => { const a = ALM.ativos.get(k); if (a.plId === pl.id && a.alvo !== 'gemeo' && !novos.has(k)) ALM.ativos.delete(k); });
    novos.forEach((a, k) => {
        const ja = ALM.ativos.get(k);
        if (ja && ja.pendenteGemeo && !a.reconhecido) { a.reconhecido = true; a.pendenteGemeo = true; }
        ALM.ativos.set(k, a);
        if (!ja && !a.reconhecido && !(a.suprimidoAte > Date.now()) && typeof anunciar === 'function') anunciar(a);
    });
    ALM.mudou = true;
    // 3) mudanças do histórico e do log (ler de novo o mesmo ponto não duplica)
    if (zip.file('amostras.csv')) {
        const amostras = (await zip.file('amostras.csv').async('string')).split('\n').map(l => l.split(';')).filter(l => l.length === 3)
            .map(([g, t, v]) => ({ g, t: +t, v: +v })).filter(a => Number.isFinite(a.v) && Number.isFinite(a.t));
        await histImportar(amostras);
        amostras.sort((a, b) => a.t - b.t).forEach(a => {
            let m = HIST.memoria.get(a.g); if (!m) { m = []; HIST.memoria.set(a.g, m); }
            if (!m.length || a.t > m[m.length - 1][0]) m.push([a.t, a.v]);
            if (m.length > MEMORIA_PONTOS) m.splice(0, m.length - MEMORIA_PONTOS);
        });
    }
    if (zip.file('eventos.csv')) {
        const evs = lerCsv(await zip.file('eventos.csv').async('string')).slice(1).filter(l => l.length >= 4)
            .map(l => ({ t: +l[0], tipo: l[1], nivel: l[2], texto: l[3], planta: pl.nome })).filter(x => Number.isFinite(x.t));
        if (evs.length && await histImportarEventos(evs)) {
            const vistos = new Set(RT.log.map(x => x.t + '|' + x.texto));
            evs.filter(x => !vistos.has(x.t + '|' + x.texto)).forEach(x => RT.log.push(x));
            RT.log.sort((a, b) => a.t - b.t); if (RT.log.length > LOG_MAX) RT.log.splice(0, RT.log.length - LOG_MAX);
        }
    }
    e.dadosDe = num(est.enviadoEm, Date.now());
    // 4) respostas aos comandos
    const conf = new Map((est.confirmacoes || []).map(c => [c.id, c]));
    const pend = pendentesGemeo(pl), resta = [], op = gemeoOpcoes(pl);
    for (const c of pend) {
        const r = conf.get(c.id);
        if (r) { if (c.tipo !== 'tudo') logar('comando', `${c.nome}: ${r.ok ? 'confirmado pelo original' : 'recusado pelo original — ' + r.msg}`, pl.nome, r.ok ? 'info' : 'erro'); }
        else if (Date.now() - c.t > (op.validadeMin * 60 + 3 * op.intervaloS) * 1000) logar('comando', `${c.nome}: sem resposta do original (venceu)`, pl.nome, 'erro');
        else resta.push(c);
    }
    if (resta.length !== pend.length) _gravarPendentes(pl, resta);
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
        const cfg = _maisNovo(d, GEMEO.ARQ_CONFIG);
        return { dir: d, nome: d.name.split('__')[0].replace(/_/g, ' '), id: d.name.split('__').pop(), cfg, quando: cfg ? quandoArquivo(cfg) : null };
    }).filter(x => x.cfg);
}
/** Abre (ou atualiza) neste navegador a planta da nuvem, torna este navegador o gêmeo dela e pede tudo ao original. */
async function abrirComoGemeo(item) {
    const dados = JSON.parse(await (await baixar(item.cfg)).text());
    let pl = SUP.planta(dados.plantaId);
    if (!pl) { pl = JSON.parse(JSON.stringify(dados.config)); SUP.p.plantas.push(pl); SUP.alterado('pl'); }
    else aplicarConfigGemeo(pl, dados);
    definirPapel(pl, 'gemeo');
    gemeoEstado(pl.id).tsCfg = item.cfg.timestamp;
    await gemeoPedirTudo(pl);
    await naFilaNuvem(() => gemeoReceber(pl)).catch(() => {});
    return pl;
}
