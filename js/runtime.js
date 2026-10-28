/**
 * © 2026 Supervisório MQTT — Inova Agro UFPel EMBRAPII. Código aberto; cópias permitidas desde que citadas.
 *
 * TEMPO REAL: conexões MQTT (uma por planta), leitura dos tópicos, variáveis calculadas (equações, integrais),
 * horímetros (desligado / ligado em vazio / trabalhando), publicações por equação, controladores, alarmes e gravação
 * do histórico. Um ciclo por segundo; as mensagens chegam a qualquer momento.
 * Os acumuladores (energia integrada, horímetros) são guardados no navegador a cada 15 s e na saída da página.
 */

'use strict';

const RT_CHAVE = 'sup_rt_v1';
const ESTADOS_EQUIP = { desligado: 0, vazio: 1, trabalhando: 2 };
const NOMES_ESTADO = { desligado: 'Desligado', vazio: 'Ligado em vazio', trabalhando: 'Trabalhando', sem: 'Sem dados' };

const RT = {
    v: new Map(),             // tagId → { v, t, q: 'ok'|'velho'|'erro', bruto }
    con: new Map(),           // plId → { cliente, estado, detalhe, desde }
    topicos: new Map(),       // plId → Map(tópico completo → [tags])
    calc: new Map(),          // tagId → { f, vars }  (equações compiladas)
    ordemCalc: new Map(),     // plId → [tags calculadas em ordem de dependência]
    errosCalc: new Map(),     // tagId/objeto → mensagem
    motores: new Map(),       // ctlId → { motor, acum, u, erro }
    pubs: new Map(),          // pubId → { acum, ultimo, f, cond }
    extras: new Map(),        // alarme extra → f
    regs: new Map(),          // tagId → { t, v } último gravado no histórico
    equip: new Map(),         // eqId → { estado, desde, acum: {desligado, vazio, trabalhando, sem}, partidas, energia: {vazio, trabalhando} }
    acumIntegral: new Map(),  // tagId → valor acumulado (energia)
    monitor: [],              // últimas mensagens MQTT (tela Logs → Monitor)
    descobertos: new Map(),   // plId → Map(tópico → { n, ultimo, t })
    descobrindo: new Map(),   // plId → filtro assinado para descobrir
    log: [],                  // eventos recentes (memória)
    sujo: new Set(),          // variáveis que mudaram desde o último desenho da tela
    ouvintes: new Set(),
    tick: 0, _intervalo: null, rodando: false
};
const MONITOR_MAX = 600, LOG_MAX = 1500;

// ---------------------------------------------------------------- log
function logar(tipo, texto, plNome = '', nivel = 'info', dados = null, persistir = true) {
    const ev = { t: Date.now(), tipo, planta: plNome, texto, nivel, dados };
    RT.log.push(ev); if (RT.log.length > LOG_MAX) RT.log.splice(0, RT.log.length - LOG_MAX);
    if (persistir) histEvento(ev);
    RT.ouvintes.forEach(f => { try { f('log', ev); } catch (e) { /* ok */ } });
    return ev;
}

// ---------------------------------------------------------------- valores
function valorTag(id) { const x = RT.v.get(id); return x ? x.v : null; }
function infoTag(id) { return RT.v.get(id) || null; }

function definirValor(pl, tag, v, t = Date.now(), bruto) {
    if (!Number.isFinite(v)) { RT.v.set(tag.id, { v: null, t, q: 'erro', bruto }); RT.sujo.add(tag.id); return; }
    RT.v.set(tag.id, { v, t, q: 'ok', bruto });
    RT.sujo.add(tag.id);
    registrarHistorico(tag, v, t);
    avaliarLimites(pl, tag, v, t);
    const k = chaveAlarme(pl.id, tag.id, 'SEM');
    if (ALM.ativos.has(k)) normalizarAlarme(k, t);
}

/** Grava no histórico respeitando banda morta, intervalo mínimo e máximo da variável. */
function registrarHistorico(tag, v, t) {
    const r = tag.registro || {}, ult = RT.regs.get(tag.id);
    const minS = num(r.minS, 1), maxS = num(r.maxS, 60), banda = Math.abs(num(r.banda, 0));
    if (ult) {
        const dt = (t - ult.t) / 1000;
        if (dt < minS) return;
        const mudou = banda > 0 ? Math.abs(v - ult.v) > banda : v !== ult.v;
        if (!mudou && dt < maxS) return;
    }
    RT.regs.set(tag.id, { t, v });
    histGravar(tag.id, t, v);
}

// ---------------------------------------------------------------- leitura das mensagens
function lerPayload(bytes, caminho) {
    const txt = _dec.decode(bytes).trim();
    let v = null;
    if (caminho) {
        try {
            let o = JSON.parse(txt);
            for (const parte of caminho.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean)) o = o == null ? undefined : o[parte];
            v = o;
        } catch (e) { return { v: NaN, txt }; }
    } else {
        if (/^[-+]?(\d+[.,]?\d*|[.,]\d+)([eE][-+]?\d+)?$/.test(txt)) v = parseFloat(txt.replace(',', '.'));
        else if (txt.startsWith('{') || txt.startsWith('[')) {
            try { const o = JSON.parse(txt); v = typeof o === 'number' ? o : (o && (o.valor ?? o.value ?? o.v ?? o.val)); } catch (e) { v = NaN; }
        } else v = txt;
    }
    if (typeof v === 'boolean') v = v ? 1 : 0;
    if (typeof v === 'string') {
        const s = v.trim().toLowerCase();
        if (['on', 'ligado', 'liga', 'true', 'ativo', 'aberto', 'open', 'run', 'sim'].includes(s)) v = 1;
        else if (['off', 'desligado', 'desliga', 'false', 'inativo', 'fechado', 'closed', 'stop', 'nao', 'não'].includes(s)) v = 0;
        else v = parseFloat(s.replace(',', '.'));
    }
    return { v: typeof v === 'number' ? v : NaN, txt };
}

function receber(pl, topico, bytes, info) {
    const t = Date.now();
    const txt = bytes.length > 300 ? _dec.decode(bytes.subarray(0, 300)) + '…' : _dec.decode(bytes);
    RT.monitor.push({ t, pl: pl.nome, plId: pl.id, dir: 'rx', topico, txt, qos: info.qos, retain: info.retain });
    if (RT.monitor.length > MONITOR_MAX) RT.monitor.splice(0, RT.monitor.length - MONITOR_MAX);
    const desc = RT.descobertos.get(pl.id);
    if (desc && RT.descobrindo.has(pl.id)) { const d = desc.get(topico) || { n: 0 }; d.n++; d.ultimo = txt; d.t = t; desc.set(topico, d); }
    // parâmetros de controladores por MQTT
    pl.controladores.forEach(c => {
        if (c.topicoParametros && topicoCompleto(pl, c.topicoParametros) === topico) {
            try { const usados = aplicarParametros(c, _dec.decode(bytes)); prepararControlador(pl, c); logar('controle', `${c.nome}: parâmetros recebidos por MQTT (${usados.join(', ')})`, pl.nome); SUP.alterado('parametros'); }
            catch (e) { logar('controle', `${c.nome}: parâmetros recebidos inválidos — ${e.message}`, pl.nome, 'erro'); }
        }
    });
    const tags = (RT.topicos.get(pl.id) || new Map()).get(topico);
    if (!tags) return;
    for (const tag of tags) {
        const { v } = lerPayload(bytes, tag.caminhoJson);
        definirValor(pl, tag, Number.isFinite(v) ? v * num(tag.escala, 1) + num(tag.deslocamento, 0) : NaN, t, txt);
    }
    agendarTela();
}

// ---------------------------------------------------------------- conexões
function conectarPlanta(pl) {
    desconectarPlanta(pl.id, true);
    const c = pl.conexao;
    const prefixo = String(c.prefixo || '').replace(/\/+$/, '');
    const cliente = c.tipo === 'simulado'
        ? new ClienteLocal({})
        : new ClienteMQTT({
            url: c.url, clientId: (c.clientId || 'supervisorio') + '-' + Math.random().toString(16).slice(2, 7), usuario: c.usuario, senha: Senhas.de(pl.id),
            keepalive: num(c.keepalive, 30),
            will: c.lwt ? { topic: (prefixo ? prefixo + '/' : '') + 'supervisorio/status', payload: 'offline', qos: 1, retain: true } : null
        });
    const reg = { cliente, estado: 'conectando', detalhe: '', desde: Date.now() };
    RT.con.set(pl.id, reg);
    cliente.on('estado', (estado, detalhe) => {
        const anterior = reg.estado;
        reg.estado = estado; reg.detalhe = detalhe; reg.desde = Date.now();
        if (estado === 'conectado') {
            logar('conexao', `Conectado em ${detalhe}`, pl.nome);
            normalizarAlarme(chaveAlarme(pl.id, 'conexao', 'CON'));
            if (c.lwt) cliente.publicar((prefixo ? prefixo + '/' : '') + 'supervisorio/status', 'online', { qos: 1, retain: true }).catch(() => {});
            assinarTopicos(pl);
            if (c.tipo === 'simulado' && typeof iniciarSimulacao === 'function') iniciarSimulacao(pl);
        } else if (estado === 'erro' && anterior !== 'erro') {
            logar('conexao', `Falha na conexão: ${detalhe}`, pl.nome, 'erro');
            decidirAlarme(pl, { chave: chaveAlarme(pl.id, 'conexao', 'CON'), alvo: 'conexao', tipo: 'CON', prioridade: 2, texto: `Sem conexão com o broker — ${detalhe}` }, true, false, 10, Date.now());
        }
        agendarTela(true);
    });
    cliente.on('mensagem', (topico, bytes, info) => receber(pl, topico, bytes, info));
    cliente.conectar();
}
function desconectarPlanta(plId, silencioso = false) {
    const r = RT.con.get(plId);
    if (!r) return;
    try { r.cliente.encerrar(); } catch (e) { /* ok */ }
    RT.con.delete(plId);
    if (typeof pararSimulacao === 'function') pararSimulacao(plId);
    const pl = SUP.planta(plId);
    if (!silencioso && pl) logar('conexao', 'Desconectado pelo usuário', pl.nome);
    normalizarAlarme(chaveAlarme(plId, 'conexao', 'CON'));
    agendarTela(true);
}
function estadoConexao(plId) { const r = RT.con.get(plId); return r ? r.estado : 'desconectado'; }

/** Assina os tópicos das variáveis e dos parâmetros dos controladores (só a diferença em relação ao que já está assinado). */
function assinarTopicos(pl) {
    const r = RT.con.get(pl.id);
    if (!r) return;
    const quero = new Map();
    pl.tags.filter(t => t.origem === 'mqtt' && t.topico).forEach(t => quero.set(topicoCompleto(pl, t.topico), Math.max(quero.get(topicoCompleto(pl, t.topico)) || 0, num(pl.conexao.qos, 0))));
    pl.controladores.filter(c => c.topicoParametros).forEach(c => quero.set(topicoCompleto(pl, c.topicoParametros), 1));
    pl.comandos.filter(c => c.tagEstado === '' && c.topico).forEach(() => {});
    const desc = RT.descobrindo.get(pl.id);
    if (desc) quero.set(desc, 0);
    for (const f of [...r.cliente.assinaturas.keys()]) if (!quero.has(f)) r.cliente.cancelar(f).catch(() => {});
    for (const [f, q] of quero) if (!r.cliente.assinaturas.has(f) || r.cliente.assinaturas.get(f) !== q) r.cliente.assinar(f, q).catch(e => logar('conexao', `Assinatura de "${f}" recusada: ${e.message}`, pl.nome, 'erro'));
}
/** Descobrir tópicos: assina <prefixo>/# (ou o filtro dado) e guarda o que chegar. */
function descobrirTopicos(pl, filtro) {
    const f = filtro || ((pl.conexao.prefixo ? pl.conexao.prefixo.replace(/\/+$/, '') + '/' : '') + '#');
    RT.descobrindo.set(pl.id, f);
    if (!RT.descobertos.has(pl.id)) RT.descobertos.set(pl.id, new Map());
    assinarTopicos(pl);
    return f;
}
function pararDescoberta(pl) { RT.descobrindo.delete(pl.id); assinarTopicos(pl); }

/** Publica e registra no log. Lança erro se não houver conexão. */
async function publicar(pl, topico, payload, o = {}, motivo = '') {
    const r = RT.con.get(pl.id);
    if (!r || r.estado !== 'conectado') throw new Error(`a planta "${pl.nome}" está sem conexão`);
    await r.cliente.publicar(topico, payload, o);
    const txt = typeof payload === 'string' ? payload : JSON.stringify(payload);
    RT.monitor.push({ t: Date.now(), pl: pl.nome, plId: pl.id, dir: 'tx', topico, txt, qos: o.qos || 0, retain: !!o.retain });
    if (RT.monitor.length > MONITOR_MAX) RT.monitor.splice(0, RT.monitor.length - MONITOR_MAX);
    if (motivo) logar(o.tipoLog || 'comando', `${motivo} → ${topico} = ${txt}`, pl.nome, 'info', null, o.persistir !== false);
}

/** Comando da tela (chave, setpoint ou botão). */
async function comandar(pl, cmd, valor) {
    const topico = topicoCompleto(pl, cmd.topico);
    if (!topico) throw new Error('o comando não tem tópico');
    let payload;
    if (cmd.tipo === 'chave') payload = valor ? cmd.payloadLiga : cmd.payloadDesliga;
    else if (cmd.tipo === 'botao') payload = cmd.payloadLiga;
    else {
        const v = num(valor);
        if (v == null) throw new Error('valor inválido');
        if (v < num(cmd.min, -Infinity) || v > num(cmd.max, Infinity)) throw new Error(`fora da faixa permitida (${cmd.min} a ${cmd.max})`);
        payload = String(v);
    }
    await publicar(pl, topico, payload, { qos: num(cmd.qos, 1), retain: !!cmd.retain }, `${cmd.nome}${cmd.tipo === 'chave' ? (valor ? ': LIGAR' : ': DESLIGAR') : cmd.tipo === 'setpoint' ? ': ajustar' : ''}`);
    cmd.ultimo = { t: Date.now(), valor };
}

// ---------------------------------------------------------------- equações
function ambientePlanta(pl, dt = 1) {
    const porNome = new Map(pl.tags.map(t => [t.variavel, t.id]));
    const agora = new Date();
    const extra = { t: agora.getHours() * 3600 + agora.getMinutes() * 60 + agora.getSeconds(), hora: agora.getHours(), dia: agora.getDay(), dt };
    return nome => {
        if (nome in extra) return extra[nome];
        let id = porNome.get(nome);
        if (!id && nome.includes('.')) {   // outra planta: nome_da_planta.variavel
            const [pn, vn] = nome.split('.');
            const outra = SUP.p.plantas.find(p => nomeVariavel(p.nome) === pn);
            if (outra) { const tg = outra.tags.find(x => x.variavel === vn); if (tg) return valorTag(tg.id); }
            return undefined;
        }
        return id ? valorTag(id) : undefined;
    };
}
function variaveisConhecidas(pl) {
    const s = new Set(pl.tags.map(t => t.variavel));
    SUP.p.plantas.filter(p => p !== pl).forEach(p => p.tags.forEach(t => s.add(nomeVariavel(p.nome) + '.' + t.variavel)));
    return s;
}

/** Recompila tudo que depende da configuração. Chamado ao iniciar e a cada alteração. */
function prepararPlanta(pl) {
    garantirVariaveis(pl);
    const mapa = new Map();
    pl.tags.filter(t => t.origem === 'mqtt' && t.topico).forEach(t => { const k = topicoCompleto(pl, t.topico); (mapa.get(k) || mapa.set(k, []).get(k)).push(t); });
    RT.topicos.set(pl.id, mapa);
    const conhecidas = variaveisConhecidas(pl);
    // calculadas: compila e ordena por dependência (detecta ciclo)
    const calcs = pl.tags.filter(t => t.origem === 'calc');
    const porVar = new Map(pl.tags.map(t => [t.variavel, t]));
    calcs.forEach(t => {
        RT.calc.delete(t.id); RT.errosCalc.delete(t.id);
        if (!t.expr.trim()) { RT.errosCalc.set(t.id, 'equação vazia'); return; }
        const erro = conferirExpr(t.expr, conhecidas);
        if (erro) { RT.errosCalc.set(t.id, erro); return; }
        RT.calc.set(t.id, compilar(t.expr));
    });
    const ordem = [], visit = new Map();
    const visitar = t => {
        if (visit.get(t.id) === 2) return true;
        if (visit.get(t.id) === 1) { RT.errosCalc.set(t.id, 'dependência circular (uma equação depende dela mesma)'); RT.calc.delete(t.id); return false; }
        visit.set(t.id, 1);
        const c = RT.calc.get(t.id);
        if (c) for (const v of c.vars) { const dep = porVar.get(v); if (dep && dep.origem === 'calc' && !visitar(dep)) { RT.calc.delete(t.id); RT.errosCalc.set(t.id, 'dependência circular'); } }
        visit.set(t.id, 2); ordem.push(t); return true;
    };
    calcs.forEach(visitar);
    RT.ordemCalc.set(pl.id, ordem.filter(t => RT.calc.has(t.id)));
    pl.tags.filter(t => t.origem === 'manual').forEach(t => { if (!RT.v.has(t.id) || RT.v.get(t.id).v !== num(t.valorManual, 0)) definirValor(pl, t, num(t.valorManual, 0)); });
    pl.publicacoes.forEach(pb => prepararPublicacao(pl, pb, conhecidas));
    pl.controladores.forEach(c => prepararControlador(pl, c));
    pl.alarmesExtra.forEach(a => { RT.errosCalc.delete(a.id); const er = a.expr ? conferirExpr(a.expr, conhecidas) : 'condição vazia'; if (er) { RT.errosCalc.set(a.id, er); RT.extras.delete(a.id); } else RT.extras.set(a.id, compilar(a.expr)); });
    pl.equipamentos.forEach(eq => {
        const h = eq.horimetro;
        RT.errosCalc.delete(eq.id + ':h');
        if (h.ativo && h.fonte === 'expr') {
            const er = conferirExpr(h.exprLigado || '0', conhecidas) || (h.exprTrabalho ? conferirExpr(h.exprTrabalho, conhecidas) : null);
            if (er) RT.errosCalc.set(eq.id + ':h', er);
        }
    });
    assinarTopicos(pl);
}
function prepararPublicacao(pl, pb, conhecidas) {
    const reg = RT.pubs.get(pb.id) || { acum: 0, ultimo: null };
    RT.errosCalc.delete(pb.id);
    try {
        const er = conferirExpr(pb.expr, conhecidas) || (pb.condicao ? conferirExpr(pb.condicao, conhecidas) : null);
        if (er) throw new Error(er);
        reg.f = compilar(pb.expr).f; reg.cond = pb.condicao ? compilar(pb.condicao).f : null;
    } catch (e) { reg.f = null; RT.errosCalc.set(pb.id, e.message); }
    RT.pubs.set(pb.id, reg);
}
function prepararControlador(pl, c) {
    const ant = RT.motores.get(c.id);
    const reg = { acum: 0, u: ant ? ant.u : null, erro: '', motor: null, refs: [], hab: null };
    try {
        reg.motor = criarMotorControle(c);
        const conhecidas = variaveisConhecidas(pl);
        reg.refs = c.referencias.map(r => { const er = conferirExpr(String(r), conhecidas); if (er) throw new Error('referência: ' + er); return compilar(String(r)).f; });
        reg.hab = c.habilitarSe ? (() => { const er = conferirExpr(c.habilitarSe, conhecidas); if (er) throw new Error('intertravamento: ' + er); return compilar(c.habilitarSe).f; })() : null;
        if (!c.entradas.length || c.entradas.some(id => !pl.tags.find(t => t.id === id))) throw new Error('escolha a(s) variável(is) medida(s)');
        if (reg.motor.entradas && reg.motor.entradas !== c.entradas.length) throw new Error(`o modelo pede ${reg.motor.entradas} medida(s); foram escolhidas ${c.entradas.length}`);
        if (reg.motor.saidas && reg.motor.saidas !== c.saidas.length) throw new Error(`o modelo tem ${reg.motor.saidas} saída(s); configure ${reg.motor.saidas} tópico(s) de saída`);
        if (reg.u && reg.motor.inicializar) reg.motor.inicializar(reg.u[0], c.referencias.map(() => 0), c.entradas.map(id => valorTag(id) || 0));
    } catch (e) { reg.erro = e.message; reg.motor = null; }
    RT.motores.set(c.id, reg);
}

// ---------------------------------------------------------------- ciclo de 1 s
function ciclo() {
    const agora = Date.now(), dt = RT._ultimo ? Math.min(10, (agora - RT._ultimo) / 1000) : 1;
    RT._ultimo = agora; RT.tick++;
    for (const pl of SUP.p.plantas) {
        try { cicloPlanta(pl, agora, dt); } catch (e) { console.error(e); }
    }
    if (typeof cicloSimulacao === 'function') cicloSimulacao(dt);
    if (RT.tick % 15 === 0) guardarAcumuladores();
    if (RT.tick % 60 === 0 && typeof nuvemHistoricoAutomatico === 'function') nuvemHistoricoAutomatico();
    agendarTela();
}

function cicloPlanta(pl, agora, dt) {
    const amb = ambientePlanta(pl, dt);
    // 1) calculadas e integrais
    for (const t of RT.ordemCalc.get(pl.id) || []) {
        const c = RT.calc.get(t.id);
        let v;
        try { v = c.f(amb); } catch (e) { v = NaN; }
        const ant = RT.v.get(t.id);
        if (!ant || ant.v !== v || agora - ant.t > 5000) definirValor(pl, t, Number.isFinite(v) ? v * num(t.escala, 1) + num(t.deslocamento, 0) : NaN, agora);
    }
    pl.tags.filter(t => t.origem === 'integral').forEach(t => {
        const fonte = pl.tags.find(x => x.id === t.fonteIntegral);
        const inf = fonte && infoTag(fonte.id);
        let acum = RT.acumIntegral.get(t.id) || 0;
        if (inf && inf.q === 'ok' && Number.isFinite(inf.v) && agora - inf.t < Math.max(30, num(fonte.limites.semDadosS, 120)) * 1000) acum += inf.v * dt * num(t.fatorIntegral, 1 / 3600);
        RT.acumIntegral.set(t.id, acum);
        definirValor(pl, t, acum, agora);
    });
    // 2) sem dados (variável recebida por MQTT que parou de chegar)
    if (estadoConexao(pl.id) === 'conectado') {
        pl.tags.filter(t => t.origem === 'mqtt' && t.limites.semDadosS > 0).forEach(t => {
            const inf = RT.v.get(t.id);
            const k = chaveAlarme(pl.id, t.id, 'SEM');
            const desde = inf ? inf.t : (RT.con.get(pl.id) || {}).desde || agora;
            if (agora - desde > t.limites.semDadosS * 1000) {
                if (inf && inf.q === 'ok') { inf.q = 'velho'; RT.sujo.add(t.id); }
                if (t.limites.ativo && !ALM.ativos.has(k)) ativarAlarme(pl, { chave: k, alvo: t.id, tipo: 'SEM', prioridade: 4, texto: `${t.nome}: sem dados há mais de ${formatarDuracao(t.limites.semDadosS)}` }, agora);
            }
        });
    }
    // 3) horímetros e energia por estado
    pl.equipamentos.forEach(eq => cicloHorimetro(pl, eq, amb, agora, dt));
    // 4) alarmes extras (equação)
    pl.alarmesExtra.forEach(a => {
        const f = RT.extras.get(a.id);
        if (!f || !a.ativo) return;
        let v; try { v = f.f(amb); } catch (e) { v = 0; }
        const k = chaveAlarme(pl.id, a.id, 'EXTRA');
        const ja = ALM.ativos.get(k), ativo = ja && ja.estado !== 'normalizado';
        decidirAlarme(pl, { chave: k, alvo: a.id, tipo: 'EXTRA', prioridade: num(a.prioridade, 3), texto: a.nome }, !!v && !ativo, ativo && !v, num(a.atrasoS, 0), agora);
    });
    // 5) controladores e publicações (só com conexão)
    const conectado = estadoConexao(pl.id) === 'conectado';
    pl.controladores.forEach(c => cicloControlador(pl, c, amb, dt, conectado));
    pl.publicacoes.forEach(pb => {
        const reg = RT.pubs.get(pb.id);
        if (!reg || !reg.f || !pb.ativo || !conectado) return;
        reg.acum += dt;
        if (reg.acum + 1e-6 < num(pb.periodoS, 10)) return;
        reg.acum = 0;
        if (reg.cond) { let ok = 0; try { ok = reg.cond(amb); } catch (e) { ok = 0; } if (!ok) return; }
        let v; try { v = reg.f(amb); } catch (e) { v = NaN; }
        if (!Number.isFinite(v)) { RT.errosCalc.set(pb.id, 'resultado não é número (alguma variável sem valor?)'); return; }
        RT.errosCalc.delete(pb.id);
        if (pb.soQuandoMuda && reg.ultimo === v) return;
        reg.ultimo = v;
        const payload = pb.formato === 'json' ? JSON.stringify({ valor: v, t: new Date().toISOString() }) : String(+v.toPrecision(10));
        publicar(pl, topicoCompleto(pl, pb.topico), payload, { qos: num(pb.qos, 0), retain: !!pb.retain, tipoLog: 'publicacao', persistir: false }, pb.nome).catch(() => {});
    });
}

function cicloControlador(pl, c, amb, dt, conectado) {
    const reg = RT.motores.get(c.id);
    if (!reg || !reg.motor) return;
    reg.acum += dt;
    if (reg.acum + 1e-6 < reg.motor.Ts) return;
    reg.acum = 0;
    const y = c.entradas.map(id => valorTag(id));
    const r = reg.refs.map(f => { try { return f(amb); } catch (e) { return NaN; } });
    let habilitado = c.ativo && conectado;
    if (habilitado && reg.hab) { try { habilitado = !!reg.hab(amb); } catch (e) { habilitado = false; } }
    reg.bloqueio = '';
    if (c.ativo && !conectado) reg.bloqueio = 'sem conexão';
    else if (c.ativo && !habilitado) reg.bloqueio = 'intertravamento';
    if (y.some(v => !Number.isFinite(v))) { if (c.ativo) reg.bloqueio = 'medida sem valor'; habilitado = false; }
    if (r.some(v => !Number.isFinite(v))) { if (c.ativo) reg.bloqueio = 'referência sem valor'; habilitado = false; }
    let u;
    if (c.modo === 'manual') {
        u = c.saidas.map(() => num(c.saidaManual, 0));
        if (reg.motor.inicializar && y.every(Number.isFinite)) reg.motor.inicializar(u[0], r, y);
    } else if (habilitado) {
        try { u = reg.motor.passo(r, y, reg.u); } catch (e) { reg.erro = e.message; return; }
    } else return;
    if (!habilitado && c.modo !== 'manual') return;
    if (c.modo === 'manual' && !(c.ativo && conectado)) return;
    reg.u = u; reg.r = r; reg.y = y; reg.t = Date.now();
    u.forEach((v, i) => {
        const s = c.saidas[i];
        if (!s) return;
        if (s.tagId) { const tg = pl.tags.find(x => x.id === s.tagId); if (tg) definirValor(pl, tg, v); }
        if (s.topico) publicar(pl, topicoCompleto(pl, s.topico), String(+v.toPrecision(8)), { qos: 0, persistir: false }, '').catch(() => {});
    });
}

// ---------------------------------------------------------------- horímetros
function estadoEquipamento(pl, eq, amb) {
    const h = eq.horimetro;
    if (h.fonte === 'expr') {
        let lig, trab;
        try { lig = compilarCache(h.exprLigado || '0').f(amb); trab = h.exprTrabalho ? compilarCache(h.exprTrabalho).f(amb) : lig; } catch (e) { return 'sem'; }
        if (!Number.isFinite(lig)) return 'sem';
        return !lig ? 'desligado' : trab ? 'trabalhando' : 'vazio';
    }
    const inf = infoTag(h.tagId);
    if (!inf || inf.q !== 'ok' || !Number.isFinite(inf.v)) return 'sem';
    const v = inf.v, l1 = num(h.limLigado, 0.5), l2 = num(h.limTrabalho, null);
    if (v < l1) return 'desligado';
    if (l2 == null) return 'trabalhando';
    return v >= l2 ? 'trabalhando' : 'vazio';
}
const _cacheExpr = new Map();
function compilarCache(s) { let c = _cacheExpr.get(s); if (!c) { c = compilar(s); _cacheExpr.set(s, c); if (_cacheExpr.size > 500) _cacheExpr.clear(); } return c; }

function estadoHorimetro(eqId) {
    let e = RT.equip.get(eqId);
    if (!e) { e = { estado: 'sem', desde: Date.now(), acum: { desligado: 0, vazio: 0, trabalhando: 0, sem: 0 }, partidas: 0, energia: { vazio: 0, trabalhando: 0 }, zeradoEm: Date.now() }; RT.equip.set(eqId, e); }
    return e;
}
function cicloHorimetro(pl, eq, amb, agora, dt) {
    if (!eq.horimetro.ativo || RT.errosCalc.has(eq.id + ':h')) return;
    const e = estadoHorimetro(eq.id);
    const novo = estadoEquipamento(pl, eq, amb);
    e.acum[e.estado] = (e.acum[e.estado] || 0) + dt;
    if (eq.tagPotencia && (e.estado === 'vazio' || e.estado === 'trabalhando')) {
        const p = valorTag(eq.tagPotencia);
        if (Number.isFinite(p)) e.energia[e.estado] += p * dt / 3600;
    }
    if (novo !== e.estado) {
        if (e.estado === 'desligado' && (novo === 'vazio' || novo === 'trabalhando')) e.partidas++;
        if (e.estado !== 'sem' || novo !== 'desligado') logar('estado', `${eq.nome}: ${NOMES_ESTADO[e.estado]} → ${NOMES_ESTADO[novo]}`, pl.nome, 'info', { eq: eq.id, de: e.estado, para: novo }, true);
        e.estado = novo; e.desde = agora;
        histGravar('est:' + eq.id, agora, novo === 'sem' ? -1 : ESTADOS_EQUIP[novo]);
        RT.regs.set('est:' + eq.id, { t: agora });
    } else if (agora - ((RT.regs.get('est:' + eq.id) || {}).t || 0) > 600000) {
        histGravar('est:' + eq.id, agora, e.estado === 'sem' ? -1 : ESTADOS_EQUIP[e.estado]);
        RT.regs.set('est:' + eq.id, { t: agora });
    }
}
function zerarHorimetro(pl, eq) {
    const e = estadoHorimetro(eq.id), resumo = `${formatarDuracao(e.acum.trabalhando)} trabalhando, ${formatarDuracao(e.acum.vazio)} em vazio, ${e.partidas} partida(s)`;
    RT.equip.set(eq.id, { estado: e.estado, desde: Date.now(), acum: { desligado: 0, vazio: 0, trabalhando: 0, sem: 0 }, partidas: 0, energia: { vazio: 0, trabalhando: 0 }, zeradoEm: Date.now() });
    logar('horimetro', `Horímetro de ${eq.nome} zerado (tinha ${resumo})`, pl.nome);
    guardarAcumuladores();
}

// ---------------------------------------------------------------- acumuladores
function guardarAcumuladores() {
    try {
        localStorage.setItem(RT_CHAVE, JSON.stringify({
            t: Date.now(), integral: [...RT.acumIntegral], equip: [...RT.equip].map(([k, e]) => [k, Object.assign({}, e, { estado: 'sem' })]),
            cmds: SUP.p.plantas.flatMap(pl => pl.comandos.map(c => [c.id, c.ultimo]))
        }));
    } catch (e) { /* ok */ }
}
function carregarAcumuladores() {
    try {
        const d = JSON.parse(localStorage.getItem(RT_CHAVE) || 'null');
        if (!d) return;
        lista(d.integral).forEach(([k, v]) => RT.acumIntegral.set(k, num(v, 0)));
        lista(d.equip).forEach(([k, e]) => RT.equip.set(k, Object.assign({ estado: 'sem', desde: Date.now(), acum: { desligado: 0, vazio: 0, trabalhando: 0, sem: 0 }, partidas: 0, energia: { vazio: 0, trabalhando: 0 } }, e, { estado: 'sem', desde: Date.now() })));
        const ult = new Map(lista(d.cmds));
        SUP.p.plantas.forEach(pl => pl.comandos.forEach(c => { if (ult.has(c.id)) c.ultimo = ult.get(c.id); }));
    } catch (e) { /* começa do zero */ }
}

// ---------------------------------------------------------------- tela
let _telaPedida = false;
function agendarTela(forcar = false) {
    if (forcar) RT._forcar = true;
    if (_telaPedida) return;
    _telaPedida = true;
    setTimeout(() => requestAnimationFrame(() => {
        _telaPedida = false;
        const sujos = new Set(RT.sujo); RT.sujo.clear();
        const forc = RT._forcar; RT._forcar = false;
        RT.ouvintes.forEach(f => { try { f('valores', sujos, forc); } catch (e) { console.error(e); } });
    }), 250);
}

function iniciarRuntime() {
    if (RT.rodando) return;
    RT.rodando = true;
    carregarAcumuladores();
    SUP.p.plantas.forEach(prepararPlanta);
    SUP.ouvir(oQue => {
        if (oQue === 'tudo') { [...RT.con.keys()].forEach(id => desconectarPlanta(id, true)); SUP.p.plantas.forEach(prepararPlanta); return; }
        SUP.p.plantas.forEach(prepararPlanta);
    });
    RT._intervalo = setInterval(ciclo, 1000);
    window.addEventListener('beforeunload', () => { guardarAcumuladores(); histDescarregar(); });
    abrirHistorico().then(() => { if (SUP.p.opcoes.retencaoDias > 0) histLimpar(SUP.p.opcoes.retencaoDias).catch(() => {}); });
}
