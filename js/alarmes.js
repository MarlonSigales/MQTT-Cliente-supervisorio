/**
 * © 2026 Supervisório MQTT — Inova Agro UFPel EMBRAPII. Código aberto; cópias permitidas desde que citadas.
 *
 * ALARMES E AVISOS — ciclo de vida da ISA-18.2 / IEC 62682:
 *   normal → ATIVO não reconhecido (pisca) → ATIVO reconhecido → normal
 *                     └→ voltou ao normal sem reconhecer (continua na lista até alguém reconhecer)
 *   Suprimir ("shelve") tira o alarme da lista por um tempo, com registro de quem/quando.
 * Prioridades: 1 urgente · 2 alta · 3 média · 4 aviso. Atraso para entrar (s) e histerese para sair evitam alarme
 * "batendo" (chattering), que é o maior problema de ruído em supervisórios (EEMUA 191: ≤ 1 alarme a cada 10 min).
 * Tipos: HH, H, L, LL (limites da variável), SEM (sem dados há X s), EXTRA (equação do usuário), CON (conexão).
 */

'use strict';

const PRIORIDADES = {
    1: { nome: 'Urgente', cor: '#b3261e', fundo: '#fdeceb' },
    2: { nome: 'Alta', cor: '#c2570c', fundo: '#fff1e6' },
    3: { nome: 'Média', cor: '#a87d00', fundo: '#fff8db' },
    4: { nome: 'Aviso', cor: '#2f6fb3', fundo: '#eaf2fb' }
};
const TIPOS_ALARME = { HH: 'Muito alto', H: 'Alto', L: 'Baixo', LL: 'Muito baixo', SEM: 'Sem dados', EXTRA: 'Condição', CON: 'Conexão' };

const ALM = {
    ativos: new Map(),       // chave → alarme
    candidatos: new Map(),   // chave → desde (aguardando o atraso)
    mudou: false,
    _som: null
};

function chaveAlarme(plId, alvo, tipo) { return `${plId}|${alvo}|${tipo}`; }

/** Avalia os limites de uma variável com o valor novo. */
function avaliarLimites(pl, tag, v, t = Date.now()) {
    const L = tag.limites;
    if (!L || !L.ativo || !Number.isFinite(v)) return;
    const h = Math.abs(num(L.histerese, 0));
    const conds = [
        ['HH', L.hh, 1, num(L.prioridadeExtremos, 2)], ['H', L.h, 1, num(L.prioridadeAvisos, 3)],
        ['LL', L.ll, -1, num(L.prioridadeExtremos, 2)], ['L', L.l, -1, num(L.prioridadeAvisos, 3)]
    ];
    for (const [tipo, limite, sentido, prio] of conds) {
        if (limite == null || limite === '' || !Number.isFinite(+limite)) continue;
        const k = chaveAlarme(pl.id, tag.id, tipo);
        const ja = ALM.ativos.get(k);
        const ativo = ja && ja.estado !== 'normalizado';
        let passou = sentido > 0 ? v > +limite : v < +limite;
        // com o "muito alto" passando, o "alto" não entra junto (supressão por estado: um alarme por problema)
        if (tipo === 'H' && L.hh != null && L.hh !== '' && v > +L.hh) passou = false;
        if (tipo === 'L' && L.ll != null && L.ll !== '' && v < +L.ll) passou = false;
        const voltou = sentido > 0 ? v <= +limite - h : v >= +limite + h;
        const nomeTag = `${tag.nome}${tag.unidade ? ' (' + tag.unidade + ')' : ''}`;
        const txt = `${nomeTag}: ${TIPOS_ALARME[tipo].toLowerCase()} — ${formatarNumero(v, tag.dec)} ${sentido > 0 ? '>' : '<'} ${formatarNumero(+limite, tag.dec)}`;
        decidirAlarme(pl, { chave: k, alvo: tag.id, tipo, prioridade: prio, texto: txt, valor: v, limite: +limite }, passou && !ativo, ativo && voltou, num(L.atrasoS, 0), t);
        if (ativo && ja) ja.valor = v;
    }
}

/** Liga (depois do atraso) ou normaliza um alarme. */
function decidirAlarme(pl, a, entra, sai, atrasoS, t) {
    const k = a.chave;
    if (entra) {
        const desde = ALM.candidatos.get(k);
        if (desde == null) { ALM.candidatos.set(k, t); if (atrasoS > 0) return; }
        else if (t - desde < atrasoS * 1000) return;
        ALM.candidatos.delete(k);
        ativarAlarme(pl, a, t);
    } else if (!sai && ALM.candidatos.has(k) && !entra) {
        // condição sumiu antes do atraso: não alarma
    }
    if (!entra) ALM.candidatos.delete(k);
    if (sai) normalizarAlarme(k, t);
}

function ativarAlarme(pl, a, t) {
    const ja = ALM.ativos.get(a.chave);
    if (ja && ja.estado !== 'normalizado') return;
    const al = Object.assign({ plId: pl.id, planta: pl.nome, estado: 'ativo', reconhecido: false, desde: t, normalizouEm: null, reconhecidoEm: null, suprimidoAte: ja ? ja.suprimidoAte : 0, vezes: (ja ? ja.vezes : 0) + 1 }, a);
    ALM.ativos.set(a.chave, al);
    ALM.mudou = true;
    histEvento({ t, tipo: 'alarme', planta: pl.nome, nivel: 'p' + al.prioridade, texto: `ATIVO [${PRIORIDADES[al.prioridade].nome}] ${al.texto}`, dados: { chave: al.chave, tipo: al.tipo, alvo: al.alvo, prioridade: al.prioridade, valor: al.valor } });
    if (!(al.suprimidoAte > t)) anunciar(al);
}
function normalizarAlarme(k, t = Date.now()) {
    const al = ALM.ativos.get(k);
    if (!al || al.estado === 'normalizado') return;
    al.estado = 'normalizado'; al.normalizouEm = t;
    ALM.mudou = true;
    histEvento({ t, tipo: 'alarme', planta: al.planta, nivel: 'info', texto: `NORMAL ${al.texto.split(' — ')[0]}`, dados: { chave: k, tipo: al.tipo, alvo: al.alvo } });
    if (al.reconhecido) ALM.ativos.delete(k);
}
function reconhecerAlarme(k, t = Date.now()) {
    const al = ALM.ativos.get(k);
    if (!al || al.reconhecido) return;
    al.reconhecido = true; al.reconhecidoEm = t; ALM.mudou = true;
    histEvento({ t, tipo: 'alarme', planta: al.planta, nivel: 'info', texto: `RECONHECIDO ${al.texto.split(' — ')[0]}`, dados: { chave: k } });
    if (al.estado === 'normalizado') ALM.ativos.delete(k);
}
function reconhecerTodos() { [...ALM.ativos.keys()].forEach(k => { const a = ALM.ativos.get(k); if (!(a.suprimidoAte > Date.now())) reconhecerAlarme(k); }); }
function suprimirAlarme(k, minutos, motivo = '') {
    const al = ALM.ativos.get(k);
    if (!al) return;
    al.suprimidoAte = Date.now() + minutos * 60000; ALM.mudou = true;
    histEvento({ tipo: 'alarme', planta: al.planta, nivel: 'info', texto: `SUPRIMIDO por ${minutos} min ${al.texto.split(' — ')[0]}${motivo ? ' — motivo: ' + motivo : ''}`, dados: { chave: k } });
}

/** Lista para a tela: suprimidos ficam fora (aparecem num contador). Ordem: não reconhecidos, prioridade, mais novos. */
function listaAlarmes(plId = null) {
    const agora = Date.now();
    const todos = [...ALM.ativos.values()].filter(a => !plId || a.plId === plId);
    return {
        visiveis: todos.filter(a => !(a.suprimidoAte > agora)).sort((a, b) => (a.reconhecido - b.reconhecido) || (a.prioridade - b.prioridade) || (b.desde - a.desde)),
        suprimidos: todos.filter(a => a.suprimidoAte > agora)
    };
}
function contagemAlarmes(plId = null) {
    const { visiveis } = listaAlarmes(plId);
    const ativos = visiveis.filter(a => a.estado === 'ativo');
    return { total: visiveis.length, naoReconhecidos: visiveis.filter(a => !a.reconhecido).length, pior: ativos.length ? Math.min(...ativos.map(a => a.prioridade)) : null };
}
/** Pior alarme ativo de uma variável (para colorir o cartão e o sinótico). */
function alarmeDaTag(tagId) {
    let pior = null;
    ALM.ativos.forEach(a => { if (a.alvo === tagId && a.estado === 'ativo' && !(a.suprimidoAte > Date.now()) && (!pior || a.prioridade < pior.prioridade)) pior = a; });
    return pior;
}

// ---------------------------------------------------------------- anúncio: som curto e notificação do sistema (opcionais)
function anunciar(al) {
    const op = SUP.p.opcoes;
    if (op.somAlarme && al.prioridade <= 2) bip(al.prioridade === 1 ? 3 : 2);
    if (op.notificacao && window.Notification && Notification.permission === 'granted' && document.hidden) {
        try { new Notification(`Alarme ${PRIORIDADES[al.prioridade].nome} — ${al.planta}`, { body: al.texto, tag: al.chave }); } catch (e) { /* ok */ }
    }
}
function bip(vezes = 1) {
    try {
        const ctx = ALM._som || (ALM._som = new (window.AudioContext || window.webkitAudioContext)());
        for (let i = 0; i < vezes; i++) {
            const o = ctx.createOscillator(), g = ctx.createGain();
            o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
            const t0 = ctx.currentTime + i * 0.25;
            g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.2, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
            o.start(t0); o.stop(t0 + 0.2);
        }
    } catch (e) { /* navegador sem áudio */ }
}
