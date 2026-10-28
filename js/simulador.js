/**
 * © 2026 Supervisório MQTT — Inova Agro UFPel EMBRAPII. Código aberto; cópias permitidas desde que citadas.
 *
 * SIMULAÇÃO (modo demonstração, sem broker): um "campo" de mentira publica nos mesmos tópicos que os sensores
 * publicariam e responde aos comandos e às saídas dos controladores. Serve para aprender, testar telas, alarmes,
 * relatórios e sintonizar controladores antes de ligar no equipamento real.
 *
 * pl.simulacao.modelos = lista de modelos (avaliados na ordem):
 *   { nome, tipo: 'chave',   cmd: 'tópico do comando', estado: 'tópico do estado', inicial: 0 }  → segue o comando
 *   { nome, tipo: 'entrada', topico, inicial, publicarInicial } → recebe número (ex.: saída de um controlador ou setpoint)
 *   { nome, tipo: 'alg',     expr, topico, ruido, periodo }    → valor = equação (usa os nomes dos outros modelos)
 *   { nome, tipo: 'din',     deriv, inicial, topico, ruido }   → dx/dt = equação (x = o próprio valor)
 * As equações usam a mesma linguagem das variáveis (expr.js), incluindo onda(período) e pulso(período, fração).
 */

'use strict';

const SIM = new Map();       // plId → { cliente, S: Map nome → valor, acum, modelos compilados }

function ruidoGauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

function iniciarSimulacao(pl) {
    pararSimulacao(pl.id);
    const sim = pl.simulacao;
    if (!sim || !lista(sim.modelos).length) return;
    const S = new Map(), comp = [];
    const cliente = new ClienteLocal({});
    for (const m of sim.modelos) {
        const c = Object.assign({}, m);
        S.set(m.nome, num(m.inicial, 0));
        try {
            if (m.tipo === 'alg') c.f = compilar(m.expr).f;
            if (m.tipo === 'din') c.f = compilar(m.deriv).f;
        } catch (e) { console.warn('Modelo da simulação inválido', m.nome, e.message); continue; }
        comp.push(c);
    }
    const reg = { cliente, S, comp, acum: 0, pl };
    SIM.set(pl.id, reg);
    cliente.on('mensagem', (topico, bytes) => {
        const v = lerPayload(bytes, '').v;
        comp.forEach(m => {
            if (m.tipo === 'chave' && m.cmd && topicoCompleto(pl, m.cmd) === topico && Number.isFinite(v)) {
                S.set(m.nome, v ? 1 : 0);
                if (m.estado) cliente.publicar(topicoCompleto(pl, m.estado), v ? '1' : '0', { retain: true }).catch(() => {});
            }
            if (m.tipo === 'entrada' && m.topico && topicoCompleto(pl, m.topico) === topico && Number.isFinite(v)) S.set(m.nome, v);
        });
    });
    cliente.on('estado', e => {
        if (e !== 'conectado') return;
        comp.forEach(m => {
            if (m.tipo === 'chave' && m.cmd) cliente.assinar(topicoCompleto(pl, m.cmd));
            if (m.tipo === 'chave' && m.estado) cliente.publicar(topicoCompleto(pl, m.estado), S.get(m.nome) ? '1' : '0', { retain: true }).catch(() => {});
            if (m.tipo === 'entrada' && m.topico) {
                // referência inicial (ex.: setpoint): publica retida só se ninguém publicou ainda
                if (m.publicarInicial && !cliente.broker.retidos.has(topicoCompleto(pl, m.topico))) cliente.publicar(topicoCompleto(pl, m.topico), String(m.inicial), { retain: true }).catch(() => {});
                cliente.assinar(topicoCompleto(pl, m.topico));
            }
        });
    });
    cliente.conectar();
}
function pararSimulacao(plId) { const r = SIM.get(plId); if (r) { try { r.cliente.encerrar(); } catch (e) { /* ok */ } SIM.delete(plId); } }

function cicloSimulacao(dt) {
    SIM.forEach(reg => {
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
                    // passos menores para dinâmica rápida (motor da bancada)
                    const sub = Math.max(1, Math.min(50, Math.ceil(dt / num(m.passo, dt))));
                    let xx = x;
                    for (let k = 0; k < sub; k++) xx += (k === 0 ? d : m.f(n => (n === 'x' ? xx : amb(n)))) * dt / sub;
                    v = xx;
                }
            } catch (e) { v = NaN; }
            if (Number.isFinite(v)) S.set(m.nome, v);
        }
        reg.acum += dt;
        if (reg.acum < 1.999 && reg.ultimoEnvio) return;
        reg.acum = 0; reg.ultimoEnvio = Date.now();
        for (const m of comp) {
            if (!m.topico || m.tipo === 'entrada') continue;
            let v = S.get(m.nome);
            if (!Number.isFinite(v)) continue;
            if (m.ruido) v += ruidoGauss() * m.ruido;
            if (m.min != null) v = Math.max(m.min, v);
            if (m.max != null) v = Math.min(m.max, v);
            const casas = m.dec != null ? m.dec : 2;
            const payload = m.json ? JSON.stringify({ valor: +v.toFixed(casas), un: m.un || '' }) : v.toFixed(casas);
            reg.cliente.publicar(topicoCompleto(pl, m.topico), payload).catch(() => {});
        }
    });
}
