/**
 * © 2026 Supervisório MQTT — Inova Agro UFPel EMBRAPII. Código aberto; cópias permitidas desde que citadas.
 *
 * HISTÓRICO NO NAVEGADOR (IndexedDB) — amostras das variáveis, eventos (log, alarmes, comandos, horímetros) e marcas
 * de envio para a nuvem. A cópia permanente fica na nuvem da equipe (MEGA, nuvem.js): um arquivo por planta e por dia.
 *
 *   amostras: chave [variável, t]   valor { g: variável, t: ms, v: número }   (gravar de novo o mesmo ponto não duplica)
 *   eventos:  chave automática      { t, tipo, planta, texto, nivel, dados }  índice por t
 *   meta:     chave texto           (ex.: "nuvem:<planta>:<dia>" → último envio)
 *
 * As gravações são juntadas e feitas a cada 2 s (uma transação por lote).
 */

'use strict';

const HIST = {
    db: null, nome: 'supervisorio_mqtt', versao: 1,
    filaA: [], filaE: [], _t: null, disponivel: true,
    memoria: new Map()      // últimos pontos de cada variável na memória (para o balão e a tela ao vivo)
};
const MEMORIA_PONTOS = 1800;

function abrirHistorico() {
    if (HIST.db) return Promise.resolve(HIST.db);
    if (HIST._abrindo) return HIST._abrindo;
    HIST._abrindo = new Promise(resolve => {
        if (!window.indexedDB) { HIST.disponivel = false; resolve(null); return; }
        const r = indexedDB.open(HIST.nome, HIST.versao);
        r.onupgradeneeded = () => {
            const db = r.result;
            if (!db.objectStoreNames.contains('amostras')) db.createObjectStore('amostras', { keyPath: ['g', 't'] });
            if (!db.objectStoreNames.contains('eventos')) { const s = db.createObjectStore('eventos', { keyPath: 'id', autoIncrement: true }); s.createIndex('t', 't'); }
            if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
        };
        r.onsuccess = () => { HIST.db = r.result; resolve(HIST.db); };
        r.onerror = () => { HIST.disponivel = false; console.warn('IndexedDB indisponível: o histórico fica só na memória'); resolve(null); };
    });
    return HIST._abrindo;
}

function _tx(stores, modo, f) {
    return abrirHistorico().then(db => new Promise((resolve, reject) => {
        if (!db) { resolve(null); return; }
        const tx = db.transaction(stores, modo);
        let res;
        Promise.resolve(f(tx)).then(v => { res = v; });
        tx.oncomplete = () => resolve(res);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('transação cancelada'));
    }));
}
const _pedido = r => new Promise((ok, erro) => { r.onsuccess = () => ok(r.result); r.onerror = () => erro(r.error); });

/** Guarda um ponto (vai para a fila e para a memória). */
function histGravar(g, t, v) {
    if (!Number.isFinite(v)) return;
    HIST.filaA.push({ g, t, v });
    let m = HIST.memoria.get(g);
    if (!m) { m = []; HIST.memoria.set(g, m); }
    if (m.length && m[m.length - 1][0] >= t) { if (m[m.length - 1][0] === t) m[m.length - 1][1] = v; }
    else m.push([t, v]);
    if (m.length > MEMORIA_PONTOS) m.splice(0, m.length - MEMORIA_PONTOS);
    _agendarHist();
}
/** Registra um evento no log permanente. */
function histEvento(e) {
    const ev = Object.assign({ t: Date.now(), tipo: 'sistema', planta: '', texto: '', nivel: 'info' }, e);
    HIST.filaE.push(ev);
    _agendarHist();
    return ev;
}
function _agendarHist() { if (!HIST._t) HIST._t = setTimeout(histDescarregar, 2000); }
async function histDescarregar() {
    HIST._t = null;
    const a = HIST.filaA.splice(0), e = HIST.filaE.splice(0);
    if (!a.length && !e.length) return;
    try {
        await _tx(['amostras', 'eventos'], 'readwrite', tx => {
            const sa = tx.objectStore('amostras'), se = tx.objectStore('eventos');
            a.forEach(x => sa.put(x)); e.forEach(x => se.add(x));
        });
    } catch (err) { console.warn('Falha ao gravar o histórico', err); }
}

/** Pontos de uma variável entre t0 e t1 (ms). */
async function histPontos(g, t0, t1, limite = 200000) {
    const r = await _tx(['amostras'], 'readonly', tx => new Promise(ok => {
        const out = [];
        const req = tx.objectStore('amostras').openCursor(IDBKeyRange.bound([g, t0], [g, t1]));
        req.onsuccess = () => { const c = req.result; if (c && out.length < limite) { out.push([c.value.t, c.value.v]); c.continue(); } else ok(out); };
        req.onerror = () => ok(out);
    }));
    let pts = r || [];
    // completa com o que ainda está na fila / memória (gravado há menos de 2 s)
    const mem = (HIST.memoria.get(g) || []).filter(p => p[0] >= t0 && p[0] <= t1 && (!pts.length || p[0] > pts[pts.length - 1][0]));
    if (mem.length) pts = pts.concat(mem);
    return pts;
}
/** Último ponto antes de t (para saber o estado no início do período). */
async function histAnterior(g, t) {
    const r = await _tx(['amostras'], 'readonly', tx => new Promise(ok => {
        const req = tx.objectStore('amostras').openCursor(IDBKeyRange.bound([g, 0], [g, t], false, true), 'prev');
        req.onsuccess = () => ok(req.result ? [req.result.value.t, req.result.value.v] : null);
        req.onerror = () => ok(null);
    }));
    return r || null;
}
/** Eventos entre t0 e t1, com filtro opcional. */
async function histEventos(t0, t1, filtro = () => true, limite = 20000) {
    await histDescarregar();
    const r = await _tx(['eventos'], 'readonly', tx => new Promise(ok => {
        const out = [];
        const req = tx.objectStore('eventos').index('t').openCursor(IDBKeyRange.bound(t0, t1), 'prev');
        req.onsuccess = () => { const c = req.result; if (c && out.length < limite) { if (filtro(c.value)) out.push(c.value); c.continue(); } else ok(out); };
        req.onerror = () => ok(out);
    }));
    return r || [];
}
async function histMetaLer(k) { return _tx(['meta'], 'readonly', tx => _pedido(tx.objectStore('meta').get(k))); }
async function histMetaGravar(k, v) { return _tx(['meta'], 'readwrite', tx => { tx.objectStore('meta').put(v, k); }); }

/** Reduz a série para o gráfico: mantém mínimo e máximo de cada faixa (não some com picos). */
function reduzirSerie(pts, alvo = 1500) {
    if (pts.length <= alvo) return pts;
    const t0 = pts[0][0], t1 = pts[pts.length - 1][0], faixas = Math.floor(alvo / 2), larg = (t1 - t0) / faixas || 1;
    const out = []; let k = 0;
    for (let f = 0; f < faixas && k < pts.length; f++) {
        const lim = t0 + (f + 1) * larg;
        let mn = null, mx = null;
        while (k < pts.length && (pts[k][0] <= lim || f === faixas - 1)) {
            const p = pts[k++];
            if (!mn || p[1] < mn[1]) mn = p;
            if (!mx || p[1] > mx[1]) mx = p;
        }
        if (mn) { if (mn === mx) out.push(mn); else if (mn[0] < mx[0]) out.push(mn, mx); else out.push(mx, mn); }
    }
    return out;
}

/** Estatísticas de uma série (média ponderada pelo tempo, que não engana quando a amostragem é irregular). */
function estatisticas(pts, lim) {
    if (!pts.length) return null;
    let mn = Infinity, mx = -Infinity, soma = 0, dur = 0, fora = 0;
    for (let i = 0; i < pts.length; i++) {
        const v = pts[i][1];
        if (v < mn) mn = v; if (v > mx) mx = v;
        const d = i < pts.length - 1 ? Math.min(pts[i + 1][0] - pts[i][0], 10 * 60000) : 0;
        soma += v * d; dur += d;
        if (lim && lim.ativo && ((lim.h != null && v > lim.h) || (lim.l != null && v < lim.l) || (lim.hh != null && v > lim.hh) || (lim.ll != null && v < lim.ll))) fora += d;
    }
    const media = dur ? soma / dur : pts.reduce((s, p) => s + p[1], 0) / pts.length;
    let q = 0; for (let i = 0; i < pts.length; i++) q += (pts[i][1] - media) ** 2;
    return { min: mn, max: mx, media, desvio: Math.sqrt(q / pts.length), n: pts.length, foraPct: dur ? 100 * fora / dur : 0, ultimo: pts[pts.length - 1][1] };
}

/** Apaga o que for mais velho que a retenção (só o que já foi para a nuvem, quando a nuvem é usada). */
async function histLimpar(dias) {
    if (!(dias > 0)) return 0;
    const limite = Date.now() - dias * 86400000;
    let n = 0;
    await _tx(['amostras', 'eventos'], 'readwrite', tx => new Promise(ok => {
        const req = tx.objectStore('amostras').openCursor();
        req.onsuccess = () => { const c = req.result; if (!c) { ok(); return; } if (c.value.t < limite) { c.delete(); n++; } c.continue(); };
        const r2 = tx.objectStore('eventos').index('t').openCursor(IDBKeyRange.upperBound(limite));
        r2.onsuccess = () => { const c = r2.result; if (c) { c.delete(); c.continue(); } };
    }));
    return n;
}

/** Todas as amostras de um conjunto de variáveis num intervalo (para o arquivo do dia e o CSV). */
async function histAmostrasDe(ids, t0, t1) {
    const out = [];
    for (const g of ids) (await histPontos(g, t0, t1)).forEach(p => out.push([g, p[0], p[1]]));
    out.sort((a, b) => a[1] - b[1]);
    return out;
}
/** Junta amostras trazidas da nuvem ou de um arquivo (não duplica: a chave é [variável, t]). */
async function histImportar(amostras) {
    let n = 0;
    for (let i = 0; i < amostras.length; i += 5000) {
        const lote = amostras.slice(i, i + 5000);
        await _tx(['amostras'], 'readwrite', tx => { const s = tx.objectStore('amostras'); lote.forEach(a => { if (Number.isFinite(a.v)) { s.put(a); n++; } }); });
    }
    return n;
}
async function histImportarEventos(evs) {
    const existentes = new Set((await histEventos(Math.min(...evs.map(e => e.t)), Math.max(...evs.map(e => e.t)))).map(e => e.t + '|' + e.texto));
    const novos = evs.filter(e => !existentes.has(e.t + '|' + e.texto)).map(e => { const c = Object.assign({}, e); delete c.id; return c; });
    if (novos.length) await _tx(['eventos'], 'readwrite', tx => { const s = tx.objectStore('eventos'); novos.forEach(e => s.add(e)); });
    return novos.length;
}
async function histApagarTudo() {
    await _tx(['amostras', 'eventos', 'meta'], 'readwrite', tx => { tx.objectStore('amostras').clear(); tx.objectStore('eventos').clear(); tx.objectStore('meta').clear(); });
    HIST.memoria.clear();
}

/** Gera o CSV (separador ; e vírgula decimal, como o Excel em português espera). */
function csvDe(linhas, cab) {
    const celula = v => {
        if (v == null) return '';
        if (typeof v === 'number') return Number.isFinite(v) ? String(v).replace('.', ',') : '';
        const s = String(v);
        return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return '﻿' + [cab, ...linhas].map(l => l.map(celula).join(';')).join('\r\n');
}
/** Lê CSV gerado por csvDe (para importar da nuvem/arquivo). */
function lerCsv(texto) {
    const t = texto.replace(/^﻿/, '');
    const linhas = []; let campo = '', linha = [], aspas = false;
    for (let i = 0; i < t.length; i++) {
        const c = t[i];
        if (aspas) { if (c === '"' && t[i + 1] === '"') { campo += '"'; i++; } else if (c === '"') aspas = false; else campo += c; continue; }
        if (c === '"') aspas = true;
        else if (c === ';') { linha.push(campo); campo = ''; }
        else if (c === '\n') { linha.push(campo.replace(/\r$/, '')); linhas.push(linha); linha = []; campo = ''; }
        else campo += c;
    }
    if (campo || linha.length) { linha.push(campo.replace(/\r$/, '')); linhas.push(linha); }
    return linhas;
}
