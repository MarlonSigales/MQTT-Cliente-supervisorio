/**
 * © 2026 Supervisório MQTT — Inova Agro UFPel EMBRAPII. Código aberto; cópias permitidas desde que citadas.
 *
 * PLANTA VIRTUAL ("campo" de mentira): publica nos mesmos tópicos que os sensores publicariam e responde aos comandos
 * e às saídas dos controladores. Roda em dois modos:
 *   - Simulação (sem broker): dentro da página, num broker local em memória;
 *   - Planta virtual no broker: conecta num broker de verdade (ex.: wss://broker.emqx.io:8084/mqtt), como se fosse o
 *     campo; qualquer cliente MQTT (este supervisório, outro computador, o MQTT Explorer) vê e comanda a planta.
 *     O mesmo código roda sem navegador: node campo/planta-virtual.js (ver campo/LEIAME.md).
 *
 * STATUS: publicar qualquer coisa em <prefixo>/status/get faz a planta virtual responder em <prefixo>/status com todos os
 * tópicos (sentido, nome, unidade, tipo, faixa e o último valor). "Pedir status" no supervisório faz isso pela tela.
 *
 * pl.simulacao.modelos = lista de modelos (avaliados na ordem):
 *   { nome, tipo: 'chave',   cmd: 'tópico do comando', estado: 'tópico do estado', inicial: 0 }  → segue o comando
 *   { nome, tipo: 'entrada', topico, inicial, publicarInicial } → recebe número (ex.: saída de um controlador ou setpoint)
 *   { nome, tipo: 'alg',     expr, topico, ruido, periodo }    → valor = equação (usa os nomes dos outros modelos)
 *   { nome, tipo: 'din',     deriv, inicial, topico, ruido }   → dx/dt = equação (x = o próprio valor)
 * As equações usam a mesma linguagem das variáveis (expr.js), incluindo onda(período) e pulso(período, fração).
 */

'use strict';

const SIM = new Map();       // plId → planta virtual rodando

function ruidoGauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

/** Lista de todos os tópicos da planta, do ponto de vista do campo (publica = o campo manda; assina = o campo recebe). */
function topicosDaPlanta(pl, ultimos = new Map()) {
    const out = new Map();
    const por = (topico, x) => { if (!topico) return; const k = topicoCompleto(pl, topico); if (!out.has(k)) out.set(k, Object.assign({ topico: k }, x, ultimos.has(k) ? { valor: ultimos.get(k) } : {})); };
    const eqNome = id => { const e = pl.equipamentos.find(x => x.id === id); return e ? e.nome : ''; };
    const arNome = id => { const a = pl.areas.find(x => x.id === id); return a ? a.nome : ''; };
    pl.tags.filter(t => t.origem === 'mqtt').forEach(t => por(t.topico, { sentido: 'publica', tipo: t.tipo, nome: t.nome, unidade: t.unidade || '', faixa: t.faixa, elemento: eqNome(t.equipId), area: arNome(t.areaId) }));
    pl.comandos.forEach(c => por(c.topico, { sentido: 'assina', tipo: 'comando:' + c.tipo, nome: c.nome, unidade: c.unidade || '', faixa: c.tipo === 'setpoint' ? [c.min, c.max] : undefined, elemento: eqNome(c.equipId),
        payload: c.tipo === 'chave' ? `${c.payloadLiga} liga / ${c.payloadDesliga} desliga` : c.tipo === 'botao' ? c.payloadLiga : 'número' }));
    pl.controladores.forEach(c => c.saidas.forEach(s => por(s.topico, { sentido: 'assina', tipo: 'controle', nome: `Saída de ${c.nome}`, unidade: '' })));
    pl.publicacoes.forEach(p => por(p.topico, { sentido: 'assina', tipo: 'publicação', nome: p.nome, unidade: '' }));
    ((pl.simulacao && pl.simulacao.modelos) || []).forEach(m => {
        if (m.tipo === 'chave') { por(m.cmd, { sentido: 'assina', tipo: 'comando:chave', nome: m.nome }); por(m.estado, { sentido: 'publica', tipo: 'estado', nome: m.nome }); }
        else if (m.tipo === 'entrada') por(m.topico, { sentido: 'assina', tipo: 'entrada', nome: m.nome });
        else por(m.topico, { sentido: 'publica', tipo: 'medida', nome: m.nome, unidade: m.un || '' });
    });
    por('status/get', { sentido: 'assina', tipo: 'status', nome: 'Pedido de status (qualquer conteúdo)' });
    por('status', { sentido: 'publica', tipo: 'status', nome: 'Resposta de status: esta lista' });
    return [...out.values()].sort((a, b) => a.topico.localeCompare(b.topico));
}

/**
 * Liga uma planta virtual a um cliente MQTT (local ou de verdade). O cliente já deve estar criado (não conectado).
 * o.real: broker de verdade (a referência inicial só é publicada se ninguém tiver publicado uma retida).
 */
function criarCampo(pl, cliente, o = {}) {
    const sim = pl.simulacao;
    const S = new Map(), comp = [], ultimos = new Map();
    for (const m of sim.modelos) {
        const c = Object.assign({}, m);
        S.set(m.nome, num(m.inicial, 0));
        try {
            if (m.tipo === 'alg') c.f = compilar(m.expr).f;
            if (m.tipo === 'din') c.f = compilar(m.deriv).f;
        } catch (e) { (o.aviso || console.warn)(`Modelo da planta virtual inválido: ${m.nome} — ${e.message}`); continue; }
        comp.push(c);
    }
    const reg = { cliente, S, comp, acum: 0, pl, ultimos, real: !!o.real, retidosVistos: new Set(), periodoS: num(sim.periodoS, 2) };
    const tStatusGet = topicoCompleto(pl, 'status/get'), tStatus = topicoCompleto(pl, 'status');
    const publicar = (topico, payload, op = {}) => { ultimos.set(topico, payload); return cliente.publicar(topico, payload, op).catch(() => {}); };
    reg.publicar = publicar;
    reg.responderStatus = () => {
        const lista = topicosDaPlanta(pl, ultimos);
        const corpo = { planta: pl.nome, prefixo: pl.conexao.prefixo || '', geradoEm: new Date().toISOString(), total: lista.length,
            ajuda: 'publique qualquer coisa em ' + tStatusGet + ' para receber esta lista; sentido: publica = o campo manda, assina = o campo recebe', topicos: lista };
        cliente.publicar(tStatus, JSON.stringify(corpo), { qos: 0, retain: false }).catch(() => {});
        if (o.aoLog) o.aoLog(`status pedido: ${lista.length} tópicos enviados em ${tStatus}`);
    };
    cliente.on('mensagem', (topico, bytes, info) => {
        if (topico === tStatusGet) { reg.responderStatus(); return; }
        if (info && info.retain) reg.retidosVistos.add(topico);
        const txt = _dec.decode(bytes);
        const v = lerPayload(bytes, '').v;
        comp.forEach(m => {
            if (m.tipo === 'chave' && m.cmd && topicoCompleto(pl, m.cmd) === topico && Number.isFinite(v)) {
                S.set(m.nome, v ? 1 : 0); ultimos.set(topico, txt);
                if (m.estado) publicar(topicoCompleto(pl, m.estado), v ? '1' : '0', { retain: true });
                if (o.aoLog) o.aoLog(`comando ${topico} = ${txt}`);
            }
            if (m.tipo === 'entrada' && m.topico && topicoCompleto(pl, m.topico) === topico && Number.isFinite(v)) { S.set(m.nome, v); ultimos.set(topico, txt); }
        });
    });
    cliente.on('estado', e => {
        if (o.aoLog) o.aoLog('conexão: ' + e);
        if (e !== 'conectado') return;
        const assinar = f => cliente.assinar(f, 1).catch(() => {});
        assinar(tStatusGet);
        comp.forEach(m => {
            if (m.tipo === 'chave' && m.cmd) assinar(topicoCompleto(pl, m.cmd));
            if (m.tipo === 'entrada' && m.topico) assinar(topicoCompleto(pl, m.topico));
        });
        const iniciais = () => comp.forEach(m => {
            // retorno do estado: se já existe comando retido, ele chega e acerta o estado; senão publica o inicial
            if (m.tipo === 'chave' && m.estado && !reg.retidosVistos.has(topicoCompleto(pl, m.cmd))) publicar(topicoCompleto(pl, m.estado), S.get(m.nome) ? '1' : '0', { retain: true });
            if (m.tipo === 'entrada' && m.topico && m.publicarInicial) {
                const t = topicoCompleto(pl, m.topico);
                const ja = reg.real ? reg.retidosVistos.has(t) : cliente.broker && cliente.broker.retidos.has(t);
                if (!ja) publicar(t, String(m.inicial), { retain: true });
            }
        });
        // no broker de verdade, espera as mensagens retidas chegarem antes de decidir os valores iniciais
        if (reg.real) setTimeout(iniciais, 2500); else iniciais();
    });
    return reg;
}

/** Um passo da planta virtual (dt em s); publica a cada periodoS. */
function passoCampo(reg, dt) {
    if (reg.cliente.estado !== 'conectado') return;
    const { S, comp, pl } = reg;
    const amb = n => (S.has(n) ? S.get(n) : n === 't' ? Date.now() / 1000 : undefined);
    for (const m of comp) {
        let v = S.get(m.nome);
        try {
            if (m.tipo === 'alg') v = m.f(amb);
            else if (m.tipo === 'din') {
                const x = S.get(m.nome);
                const d = m.f(n => (n === 'x' ? x : amb(n)));
                const sub = Math.max(1, Math.min(50, Math.ceil(dt / num(m.passo, dt))));
                let xx = x;
                for (let k = 0; k < sub; k++) xx += (k === 0 ? d : m.f(n => (n === 'x' ? xx : amb(n)))) * dt / sub;
                if (m.min != null) xx = Math.max(m.min, xx);
                if (m.max != null) xx = Math.min(m.max, xx);
                v = xx;
            }
        } catch (e) { v = NaN; }
        if (Number.isFinite(v)) S.set(m.nome, v);
    }
    reg.acum += dt;
    if (reg.acum < reg.periodoS - 0.001 && reg.ultimoEnvio) return;
    reg.acum = 0; reg.ultimoEnvio = Date.now();
    for (const m of comp) {
        if (!m.topico || m.tipo === 'entrada') continue;
        if (m.periodo && reg.tick && reg.tick % Math.round(m.periodo / reg.periodoS)) continue;
        let v = S.get(m.nome);
        if (!Number.isFinite(v)) continue;
        if (m.ruido && v !== 0) v += ruidoGauss() * m.ruido;   // parado é zero (sem ruído)
        if (m.min != null) v = Math.max(m.min, v);
        if (m.max != null) v = Math.min(m.max, v);
        const casas = m.dec != null ? m.dec : 2;
        const payload = m.json ? JSON.stringify({ valor: +v.toFixed(casas), un: m.un || '' }) : v.toFixed(casas);
        reg.publicar(topicoCompleto(pl, m.topico), payload, { retain: !!m.retido });
    }
    reg.tick = (reg.tick || 0) + 1;
}

/** No navegador: liga a planta virtual (local, ou no broker de verdade quando real = true). */
function iniciarSimulacao(pl, real = false) {
    pararSimulacao(pl.id);
    const sim = pl.simulacao;
    if (!sim || !lista(sim.modelos).length) return;
    const cliente = real
        ? new ClienteMQTT({ url: pl.conexao.url, clientId: 'planta-virtual-' + Math.random().toString(16).slice(2, 8), usuario: pl.conexao.usuario, senha: Senhas.de(pl.id), keepalive: 30,
            will: { topic: topicoCompleto(pl, 'campo/online'), payload: '0', qos: 1, retain: true } })
        : new ClienteLocal({});
    const reg = criarCampo(pl, cliente, { real, aviso: m => logar('sistema', m, pl.nome, 'erro') });
    if (real) cliente.on('estado', e => { if (e === 'conectado') reg.publicar(topicoCompleto(pl, 'campo/online'), '1', { retain: true, qos: 1 }); });
    SIM.set(pl.id, reg);
    cliente.conectar();
    if (real) logar('conexao', `Planta virtual ligada no broker ${pl.conexao.url} (prefixo ${pl.conexao.prefixo || '—'})`, pl.nome);
}
function pararSimulacao(plId) {
    const r = SIM.get(plId);
    if (!r) return;
    try { if (r.real) r.cliente.publicar(topicoCompleto(r.pl, 'campo/online'), '0', { retain: true, qos: 1 }).catch(() => {}); } catch (e) { /* ok */ }
    try { r.cliente.encerrar(); } catch (e) { /* ok */ }
    SIM.delete(plId);
}
function cicloSimulacao(dt) { SIM.forEach(reg => passoCampo(reg, dt)); }

if (typeof module !== 'undefined') module.exports = { criarCampo, passoCampo, topicosDaPlanta };
