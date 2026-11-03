/**
 * © 2026 Supervisório MQTT — Inova Agro UFPel EMBRAPII. Código aberto; cópias permitidas desde que citadas.
 *
 * HISTÓRICO DO AGENTE (Node): a mesma interface de js/historico.js, mas em memória (últimos dias) e gravado em disco
 * no mesmo formato da nuvem: um ZIP por planta e por dia (amostras.csv, eventos.csv, variaveis.json), que o supervisório
 * importa ("Importar arquivo de dia") ou baixa do MEGA.
 */

'use strict';

const HIST = { amostras: new Map(), eventos: [], meta: new Map(), memoria: new Map(), disponivel: true, filaA: [], filaE: [] };
const MEMORIA_PONTOS = 1800;
function _serie(g) { let s = HIST.amostras.get(g); if (!s) { s = []; HIST.amostras.set(g, s); } return s; }
function _inserir(s, t, v) {
    if (!s.length || s[s.length - 1][0] < t) { s.push([t, v]); return true; }
    let lo = 0, hi = s.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (s[m][0] < t) lo = m + 1; else hi = m; }
    if (s[lo] && s[lo][0] === t) { s[lo][1] = v; return false; }
    s.splice(lo, 0, [t, v]); return true;
}
function abrirHistorico() { return Promise.resolve(null); }
function histGravar(g, t, v) {
    if (!Number.isFinite(v)) return;
    _inserir(_serie(g), t, v);
    let m = HIST.memoria.get(g); if (!m) { m = []; HIST.memoria.set(g, m); }
    if (!m.length || m[m.length - 1][0] < t) m.push([t, v]);
    if (m.length > MEMORIA_PONTOS) m.splice(0, m.length - MEMORIA_PONTOS);
}
function histEvento(e) { const ev = Object.assign({ t: Date.now(), tipo: 'sistema', planta: '', texto: '', nivel: 'info' }, e); HIST.eventos.push(ev); return ev; }
async function histDescarregar() {}
async function histPontos(g, t0, t1, limite = 200000) {
    const s = HIST.amostras.get(g) || [], out = [];
    for (const p of s) { if (p[0] < t0) continue; if (p[0] > t1 || out.length >= limite) break; out.push([p[0], p[1]]); }
    return out;
}
async function histAnterior(g, t) { const s = HIST.amostras.get(g) || []; let r = null; for (const p of s) { if (p[0] >= t) break; r = p; } return r ? [r[0], r[1]] : null; }
async function histEventos(t0, t1, filtro = () => true, limite = 20000) {
    return HIST.eventos.filter(e => e.t >= t0 && e.t <= t1 && filtro(e)).sort((a, b) => b.t - a.t).slice(0, limite);
}
async function histMetaLer(k) { return HIST.meta.get(k); }
async function histMetaGravar(k, v) { HIST.meta.set(k, v); }
async function histAmostrasDe(ids, t0, t1) { const out = []; for (const g of ids) (await histPontos(g, t0, t1)).forEach(p => out.push([g, p[0], p[1]])); out.sort((a, b) => a[1] - b[1]); return out; }
async function histImportar(amostras) { let n = 0; amostras.forEach(a => { if (Number.isFinite(a.v)) { _inserir(_serie(a.g), a.t, a.v); n++; } }); return n; }
async function histImportarEventos(evs) {
    const ja = new Set(HIST.eventos.map(e => e.t + '|' + e.texto));
    const novos = evs.filter(e => !ja.has(e.t + '|' + e.texto)); HIST.eventos.push(...novos); return novos.length;
}
async function histLimpar(dias) {
    const lim = Date.now() - dias * 86400000; let n = 0;
    for (const [g, s] of HIST.amostras) { const i = s.findIndex(p => p[0] >= lim); const k = i < 0 ? s.length : i; n += k; s.splice(0, k); if (!s.length) HIST.amostras.delete(g); }
    HIST.eventos = HIST.eventos.filter(e => e.t >= lim);
    return n;
}
async function histApagarTudo() { HIST.amostras.clear(); HIST.eventos = []; HIST.meta.clear(); HIST.memoria.clear(); }
function reduzirSerie(pts, alvo = 1500) {
    if (pts.length <= alvo) return pts;
    const passo = Math.ceil(pts.length / alvo); return pts.filter((p, i) => i % passo === 0);
}
function estatisticas(pts, lim) {
    if (!pts.length) return null;
    let mn = Infinity, mx = -Infinity, soma = 0, dur = 0;
    for (let i = 0; i < pts.length; i++) { const v = pts[i][1]; if (v < mn) mn = v; if (v > mx) mx = v; const d = i < pts.length - 1 ? Math.min(pts[i + 1][0] - pts[i][0], 600000) : 0; soma += v * d; dur += d; }
    const media = dur ? soma / dur : pts.reduce((s, p) => s + p[1], 0) / pts.length;
    return { min: mn, max: mx, media, n: pts.length, ultimo: pts[pts.length - 1][1], desvio: 0, foraPct: 0 };
}
function csvDe(linhas, cab) {
    const celula = v => { if (v == null) return ''; if (typeof v === 'number') return Number.isFinite(v) ? String(v).replace('.', ',') : ''; const s = String(v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return '﻿' + [cab, ...linhas].map(l => l.map(celula).join(';')).join('\r\n');
}
function lerCsv(texto) {
    const t = texto.replace(/^﻿/, ''); const linhas = []; let campo = '', linha = [], aspas = false;
    for (let i = 0; i < t.length; i++) {
        const c = t[i];
        if (aspas) { if (c === '"' && t[i + 1] === '"') { campo += '"'; i++; } else if (c === '"') aspas = false; else campo += c; continue; }
        if (c === '"') aspas = true; else if (c === ';') { linha.push(campo); campo = ''; } else if (c === '\n') { linha.push(campo.replace(/\r$/, '')); linhas.push(linha); linha = []; campo = ''; } else campo += c;
    }
    if (campo || linha.length) { linha.push(campo.replace(/\r$/, '')); linhas.push(linha); }
    return linhas;
}
