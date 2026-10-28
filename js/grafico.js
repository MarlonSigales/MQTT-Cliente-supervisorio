/**
 * © 2026 Supervisório MQTT — Inova Agro UFPel EMBRAPII. Código aberto; cópias permitidas desde que citadas.
 *
 * GRÁFICO DE TENDÊNCIA (canvas, sem biblioteca):
 *  - uma faixa por unidade (°C, %, A…) com o mesmo eixo de tempo — nunca dois eixos y no mesmo gráfico;
 *  - zoom em X: roda do mouse, botões, pinça na horizontal; zoom em Y: Shift + roda sobre a faixa, botões, pinça na vertical;
 *  - arrastar move (X e Y); modo "caixa" amplia a área desenhada; duplo clique ou "Ajustar" volta ao automático;
 *  - linha vertical com o valor de todas as séries no instante sob o cursor; legenda clicável (esconde/mostra);
 *  - limites de alarme da variável em linha tracejada (quando só há uma série na faixa).
 * Também traz desenharMini() para o histórico pequeno do balão ao passar o mouse.
 */

'use strict';

// paleta categórica validada (ordem fixa; a cor segue a variável, não a posição)
const CORES_SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];

function corDaSerie(i) { return CORES_SERIES[i % CORES_SERIES.length]; }

function formatarTempoEixo(t, passo) {
    const d = new Date(t);
    const z = n => String(n).padStart(2, '0');
    if (passo >= 86400000) return `${z(d.getDate())}/${z(d.getMonth() + 1)}`;
    if (passo >= 3600000) return `${z(d.getDate())}/${z(d.getMonth() + 1)} ${z(d.getHours())}h`;
    if (passo >= 60000) return `${z(d.getHours())}:${z(d.getMinutes())}`;
    return `${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`;
}
function passosTempo(t0, t1, alvo) {
    const opcoes = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400, 172800, 604800].map(s => s * 1000);
    const bruto = (t1 - t0) / Math.max(1, alvo);
    const passo = opcoes.find(p => p >= bruto) || opcoes[opcoes.length - 1];
    const fuso = new Date().getTimezoneOffset() * 60000;
    const out = [];
    for (let t = Math.ceil((t0 - fuso) / passo) * passo + fuso; t <= t1; t += passo) out.push(t);
    return { passo, marcas: out };
}
function passosValor(a, b, alvo) {
    const bruto = (b - a) / Math.max(1, alvo), p10 = Math.pow(10, Math.floor(Math.log10(bruto || 1)));
    const passo = [1, 2, 2.5, 5, 10].map(k => k * p10).find(p => p >= bruto) || 10 * p10;
    const out = [];
    for (let v = Math.ceil(a / passo) * passo; v <= b + passo * 1e-9; v += passo) out.push(+v.toPrecision(12));
    return { passo, marcas: out };
}
function buscaTempo(pts, t) {
    let lo = 0, hi = pts.length - 1;
    if (hi < 0) return -1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (pts[m][0] < t) lo = m + 1; else hi = m; }
    if (lo > 0 && Math.abs(pts[lo - 1][0] - t) < Math.abs(pts[lo][0] - t)) lo--;
    return lo;
}

class Grafico {
    constructor(alvo, o = {}) {
        this.o = Object.assign({ alturaFaixa: 220, aoMudarVista: null }, o);
        this.raiz = alvo;
        alvo.classList.add('grafico');
        alvo.innerHTML = `<div class="grafico-legenda" role="list"></div>
            <div class="grafico-area"><canvas></canvas><div class="grafico-dica" hidden></div><div class="grafico-vazio" hidden>Escolha variáveis para ver o gráfico.</div></div>`;
        this.cv = alvo.querySelector('canvas'); this.ctx = this.cv.getContext('2d');
        this.dica = alvo.querySelector('.grafico-dica'); this.leg = alvo.querySelector('.grafico-legenda'); this.vazioEl = alvo.querySelector('.grafico-vazio');
        this.series = []; this.ocultas = new Set(); this.faixas = [];
        this.x0 = Date.now() - 3600000; this.x1 = Date.now();
        this.zoomY = new Map();     // unidade → [y0, y1] (ausente = automático)
        this.modo = 'mover'; this.cursor = null; this.ml = 58; this.mr = 14;
        this._eventos();
        this._ro = new ResizeObserver(() => this.desenhar());
        this._ro.observe(this.raiz);
    }
    destruir() { this._ro.disconnect(); }
    definirSeries(series) { this.series = series; this._legenda(); this.desenhar(); }
    definirVista(x0, x1, avisar = false) {
        if (!(x1 > x0)) return;
        this.x0 = x0; this.x1 = x1; this.desenhar();
        if (avisar && this.o.aoMudarVista) { clearTimeout(this._tv); this._tv = setTimeout(() => this.o.aoMudarVista(this.x0, this.x1), 250); }
    }
    ajustar() { this.zoomY.clear(); const ts = this.series.flatMap(s => (s.pts.length ? [s.pts[0][0], s.pts[s.pts.length - 1][0]] : [])); if (ts.length) this.definirVista(Math.min(...ts), Math.max(...ts) || Math.min(...ts) + 60000, true); else this.desenhar(); }
    zoomX(f, centro = 0.5) { const w = this.x1 - this.x0, c = this.x0 + w * centro; const nw = Math.max(2000, w * f); this.definirVista(c - nw * centro, c + nw * (1 - centro), true); }
    zoomYTodos(f) { this.faixas.forEach(fx => this._zoomYFaixa(fx, f, 0.5)); this.desenhar(); }
    _zoomYFaixa(fx, f, centro) { const [a, b] = fx.y; const c = a + (b - a) * centro, nw = (b - a) * f; this.zoomY.set(fx.un, [c - nw * centro, c + nw * (1 - centro)]); }

    _legenda() {
        this.leg.innerHTML = this.series.map(s => `<button type="button" role="listitem" class="grafico-leg-item${this.ocultas.has(s.id) ? ' oculta' : ''}" data-id="${escAttr(s.id)}" title="Mostrar/esconder">
            <i style="background:${s.cor}"></i>${esc(s.nome)}${s.unidade ? ` <small>(${esc(s.unidade)})</small>` : ''}</button>`).join('');
        this.leg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { const id = b.dataset.id; if (this.ocultas.has(id)) this.ocultas.delete(id); else this.ocultas.add(id); this._legenda(); this.desenhar(); }));
    }

    _calcularFaixas(H) {
        const vis = this.series.filter(s => !this.ocultas.has(s.id));
        const uns = [...new Set(vis.map(s => s.unidade || '—'))];
        const n = Math.max(1, uns.length), gap = 22, topo = 8, baixo = 24;
        const h = (H - topo - baixo - gap * (n - 1)) / n;
        this.faixas = uns.map((un, i) => {
            const ss = vis.filter(s => (s.unidade || '—') === un);
            let y0 = Infinity, y1 = -Infinity;
            ss.forEach(s => { for (const p of s.pts) if (p[0] >= this.x0 - 1 && p[0] <= this.x1 + 1) { if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; } });
            if (!Number.isFinite(y0)) { y0 = 0; y1 = 1; }
            if (y1 - y0 < 1e-9) { const m = Math.abs(y0) * 0.05 || 0.5; y0 -= m; y1 += m; }
            const marg = (y1 - y0) * 0.08; y0 -= marg; y1 += marg;
            const fixo = this.zoomY.get(un);
            return { un, series: ss, y: fixo || [y0, y1], topo: topo + i * (h + gap), h };
        });
    }
    desenhar() {
        const r = this.raiz.querySelector('.grafico-area').getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const vis = this.series.filter(s => !this.ocultas.has(s.id));
        const nUn = new Set(vis.map(s => s.unidade || '—')).size || 1;
        const H = this.o.altura || Math.max(200, Math.min(this.o.alturaFaixa * nUn, 900));
        const W = Math.max(200, r.width);
        if (this.cv.width !== Math.round(W * dpr) || this.cv.height !== Math.round(H * dpr)) {
            this.cv.width = Math.round(W * dpr); this.cv.height = Math.round(H * dpr);
            this.cv.style.height = H + 'px';
        }
        this.W = W; this.H = H;
        const ctx = this.ctx; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const css = getComputedStyle(this.raiz);
        const corTexto = css.getPropertyValue('--texto').trim() || '#1d2b2b', corSuave = css.getPropertyValue('--suave').trim() || '#5f6f6d', corGrade = css.getPropertyValue('--grade').trim() || '#e6edeb', fundo = css.getPropertyValue('--superficie').trim() || '#fff';
        ctx.fillStyle = fundo; ctx.fillRect(0, 0, W, H);
        this.vazioEl.hidden = !!this.series.length;
        if (!this.series.length) return;
        this.ml = W < 480 ? 46 : 58;
        this._calcularFaixas(H);
        const X = t => this.ml + (t - this.x0) / (this.x1 - this.x0) * (W - this.ml - this.mr);
        this.X = X;
        const { passo, marcas } = passosTempo(this.x0, this.x1, Math.floor((W - this.ml) / 90));
        ctx.font = '11px "Segoe UI", Roboto, Arial, sans-serif';
        for (const fx of this.faixas) {
            const [a, b] = fx.y, Y = v => fx.topo + fx.h - (v - a) / (b - a) * fx.h;
            fx.Y = Y;
            // grade e eixos (recessivos)
            ctx.strokeStyle = corGrade; ctx.lineWidth = 1; ctx.fillStyle = corSuave; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
            const pv = passosValor(a, b, Math.max(2, Math.floor(fx.h / 40)));
            pv.marcas.forEach(v => { const y = Math.round(Y(v)) + 0.5; ctx.beginPath(); ctx.moveTo(this.ml, y); ctx.lineTo(W - this.mr, y); ctx.stroke(); ctx.fillText(v.toLocaleString('pt-BR', { maximumFractionDigits: 4 }), this.ml - 6, y); });
            marcas.forEach(t => { const x = Math.round(X(t)) + 0.5; ctx.beginPath(); ctx.moveTo(x, fx.topo); ctx.lineTo(x, fx.topo + fx.h); ctx.stroke(); });
            ctx.save(); ctx.translate(11, fx.topo + fx.h / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillStyle = corSuave; ctx.fillText(fx.un, 0, 0); ctx.restore();
            // limites de alarme (só com uma série na faixa, para não confundir)
            if (fx.series.length === 1 && fx.series[0].limites) {
                const L = fx.series[0].limites;
                ctx.setLineDash([5, 4]); ctx.lineWidth = 1;
                [['hh', PRIORIDADES[2].cor], ['h', PRIORIDADES[3].cor], ['l', PRIORIDADES[3].cor], ['ll', PRIORIDADES[2].cor]].forEach(([k, cor]) => {
                    const v = L[k]; if (v == null || v === '' || !(+v >= a && +v <= b)) return;
                    const y = Math.round(Y(+v)) + 0.5; ctx.strokeStyle = cor; ctx.beginPath(); ctx.moveTo(this.ml, y); ctx.lineTo(W - this.mr, y); ctx.stroke();
                    ctx.fillStyle = cor; ctx.textAlign = 'left'; ctx.fillText(k.toUpperCase(), this.ml + 4, y - 7);
                });
                ctx.setLineDash([]);
            }
            // séries
            ctx.save(); ctx.beginPath(); ctx.rect(this.ml, fx.topo, W - this.ml - this.mr, fx.h); ctx.clip();
            for (const s of fx.series) {
                ctx.strokeStyle = s.cor; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.beginPath();
                let i0 = Math.max(0, buscaTempo(s.pts, this.x0) - 1);
                let primeiro = true, ant = null;
                for (let i = i0; i < s.pts.length; i++) {
                    const p = s.pts[i]; const x = X(p[0]), y = Y(p[1]);
                    const lacuna = ant && s.lacunaMs && p[0] - ant[0] > s.lacunaMs;
                    if (primeiro || lacuna) { ctx.moveTo(x, y); primeiro = false; }
                    else if (s.degrau) { ctx.lineTo(x, Y(ant[1])); ctx.lineTo(x, y); }
                    else ctx.lineTo(x, y);
                    ant = p;
                    if (p[0] > this.x1) break;
                }
                ctx.stroke();
                if (s.pts.length === 1) { ctx.fillStyle = s.cor; ctx.beginPath(); ctx.arc(X(s.pts[0][0]), Y(s.pts[0][1]), 4, 0, 7); ctx.fill(); }
            }
            ctx.restore();
            ctx.strokeStyle = corSuave; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(this.ml + 0.5, fx.topo); ctx.lineTo(this.ml + 0.5, fx.topo + fx.h); ctx.lineTo(W - this.mr, fx.topo + fx.h + 0.5); ctx.stroke();
        }
        // eixo do tempo
        ctx.fillStyle = corSuave; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        const ult = this.faixas[this.faixas.length - 1];
        marcas.forEach(t => { const x = X(t); if (x > this.ml + 15 && x < W - this.mr - 15) ctx.fillText(formatarTempoEixo(t, passo), x, ult.topo + ult.h + 6); });
        // caixa de zoom e cursor
        if (this._caixa) { const c = this._caixa; ctx.fillStyle = 'rgba(64,149,128,.12)'; ctx.strokeStyle = '#409580'; ctx.lineWidth = 1; ctx.fillRect(c.x0, c.y0, c.x1 - c.x0, c.y1 - c.y0); ctx.strokeRect(c.x0, c.y0, c.x1 - c.x0, c.y1 - c.y0); }
        if (this.cursor && this.cursor.x >= this.ml) {
            const x = Math.round(this.cursor.x) + 0.5;
            ctx.strokeStyle = corTexto; ctx.globalAlpha = 0.35; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, 6); ctx.lineTo(x, ult.topo + ult.h); ctx.stroke(); ctx.globalAlpha = 1;
            this._mostrarDica();
        }
    }
    _mostrarDica() {
        const W = this.W, t = this.x0 + (this.cursor.x - this.ml) / (W - this.ml - this.mr) * (this.x1 - this.x0);
        const linhas = [];
        const ctx = this.ctx;
        for (const fx of this.faixas) for (const s of fx.series) {
            const i = buscaTempo(s.pts, t); if (i < 0) continue;
            const p = s.pts[i];
            if (Math.abs(p[0] - t) > Math.max((this.x1 - this.x0) / 40, (s.lacunaMs || 0))) continue;
            linhas.push(`<div><i style="background:${s.cor}"></i>${esc(s.nome)} <b>${formatarNumero(p[1], s.dec != null ? s.dec : 2)}</b> ${esc(s.unidade || '')}</div>`);
            ctx.fillStyle = s.cor; ctx.strokeStyle = getComputedStyle(this.raiz).getPropertyValue('--superficie').trim() || '#fff'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(this.X(p[0]), fx.Y(p[1]), 4, 0, 7); ctx.fill(); ctx.stroke();
        }
        this.dica.hidden = false;
        this.dica.innerHTML = `<div class="grafico-dica-t">${new Date(t).toLocaleString('pt-BR')}</div>${linhas.join('') || '<div>sem dados neste instante</div>'}`;
        const larg = this.dica.offsetWidth;
        this.dica.style.left = Math.min(Math.max(4, this.cursor.x + 14 + larg > W ? this.cursor.x - larg - 14 : this.cursor.x + 14), W - larg - 4) + 'px';
        this.dica.style.top = Math.max(4, Math.min(this.cursor.y - 10, this.H - this.dica.offsetHeight - 4)) + 'px';
    }
    _faixaEm(y) { return this.faixas.find(f => y >= f.topo - 10 && y <= f.topo + f.h + 10) || null; }
    _eventos() {
        const cv = this.cv;
        const pos = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
        cv.addEventListener('wheel', e => {
            if (!this.series.length) return;
            e.preventDefault();
            const p = pos(e), f = e.deltaY > 0 ? 1.25 : 0.8;
            if (e.shiftKey || e.altKey) {
                const fx = this._faixaEm(p.y); if (!fx) return;
                this._zoomYFaixa(fx, f, 1 - (p.y - fx.topo) / fx.h); this.desenhar();
            } else this.zoomX(f, Math.min(1, Math.max(0, (p.x - this.ml) / (this.W - this.ml - this.mr))));
        }, { passive: false });
        const toques = new Map(); let pinca = null, arrasto = null;
        cv.addEventListener('pointerdown', e => {
            cv.setPointerCapture(e.pointerId);
            const p = pos(e); toques.set(e.pointerId, p);
            if (toques.size === 2) {
                const [a, b] = [...toques.values()];
                pinca = { dx: Math.abs(a.x - b.x), dy: Math.abs(a.y - b.y), x0: this.x0, x1: this.x1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, fx: this._faixaEm((a.y + b.y) / 2) };
                if (pinca.fx) pinca.y = pinca.fx.y.slice();
                arrasto = null; this._caixa = null; return;
            }
            const fx = this._faixaEm(p.y);
            arrasto = { p, x0: this.x0, x1: this.x1, fx, y: fx ? fx.y.slice() : null, caixa: this.modo === 'caixa' || e.ctrlKey };
        });
        cv.addEventListener('pointermove', e => {
            const p = pos(e);
            if (toques.has(e.pointerId)) toques.set(e.pointerId, p);
            if (pinca && toques.size === 2) {
                const [a, b] = [...toques.values()];
                const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
                if (pinca.dx > pinca.dy) {
                    const f = pinca.dx / Math.max(10, dx), w = (pinca.x1 - pinca.x0), c = pinca.x0 + w * ((pinca.cx - this.ml) / (this.W - this.ml - this.mr));
                    this.definirVista(c - (c - pinca.x0) * f, c + (pinca.x1 - c) * f, true);
                } else if (pinca.fx) {
                    const f = pinca.dy / Math.max(10, dy), [y0, y1] = pinca.y, centro = 1 - (pinca.cy - pinca.fx.topo) / pinca.fx.h, c = y0 + (y1 - y0) * centro;
                    this.zoomY.set(pinca.fx.un, [c - (c - y0) * f, c + (y1 - c) * f]); this.desenhar();
                }
                return;
            }
            if (arrasto) {
                if (arrasto.caixa) { this._caixa = { x0: Math.min(arrasto.p.x, p.x), x1: Math.max(arrasto.p.x, p.x), y0: Math.min(arrasto.p.y, p.y), y1: Math.max(arrasto.p.y, p.y) }; this.desenhar(); return; }
                const dt = (p.x - arrasto.p.x) / (this.W - this.ml - this.mr) * (arrasto.x1 - arrasto.x0);
                this.x0 = arrasto.x0 - dt; this.x1 = arrasto.x1 - dt;
                if (arrasto.fx && e.pointerType === 'mouse' && Math.abs(p.y - arrasto.p.y) > 3) {
                    const dv = (p.y - arrasto.p.y) / arrasto.fx.h * (arrasto.y[1] - arrasto.y[0]);
                    this.zoomY.set(arrasto.fx.un, [arrasto.y[0] + dv, arrasto.y[1] + dv]);
                }
                this.desenhar();
                if (this.o.aoMudarVista) { clearTimeout(this._tv); this._tv = setTimeout(() => this.o.aoMudarVista(this.x0, this.x1), 300); }
                return;
            }
            this.cursor = p; this.desenhar();
        });
        const fim = e => {
            toques.delete(e.pointerId);
            if (toques.size < 2) pinca = null;
            if (arrasto && arrasto.caixa && this._caixa) {
                const c = this._caixa; this._caixa = null;
                if (c.x1 - c.x0 > 8) {
                    const T = x => this.x0 + (x - this.ml) / (this.W - this.ml - this.mr) * (this.x1 - this.x0);
                    const fx = this._faixaEm((c.y0 + c.y1) / 2);
                    if (fx && c.y1 - c.y0 > 8) { const V = y => fx.y[0] + (fx.topo + fx.h - y) / fx.h * (fx.y[1] - fx.y[0]); this.zoomY.set(fx.un, [V(c.y1), V(c.y0)]); }
                    this.definirVista(T(c.x0), T(c.x1), true);
                } else this.desenhar();
            }
            arrasto = null;
        };
        cv.addEventListener('pointerup', fim); cv.addEventListener('pointercancel', fim);
        cv.addEventListener('pointerleave', () => { if (!arrasto) { this.cursor = null; this.dica.hidden = true; this.desenhar(); } });
        cv.addEventListener('dblclick', () => this.ajustar());
        cv.style.touchAction = 'none';
    }
    pngUrl() { return this.cv.toDataURL('image/png'); }
}

/** Mini-histórico (balão): uma linha, sem eixos, com mínimo e máximo. */
function desenharMini(cv, pts, cor = '#409580', limites = null) {
    const dpr = window.devicePixelRatio || 1, W = cv.clientWidth || 240, H = cv.clientHeight || 70;
    cv.width = W * dpr; cv.height = H * dpr;
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    if (pts.length < 2) { ctx.fillStyle = '#8a9a97'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('sem histórico ainda', W / 2, H / 2); return; }
    const t0 = pts[0][0], t1 = pts[pts.length - 1][0];
    let a = Infinity, b = -Infinity; pts.forEach(p => { a = Math.min(a, p[1]); b = Math.max(b, p[1]); });
    if (b - a < 1e-9) { a -= 1; b += 1; }
    const X = t => 2 + (t - t0) / (t1 - t0 || 1) * (W - 4), Y = v => H - 4 - (v - a) / (b - a) * (H - 8);
    if (limites && limites.ativo) {
        ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
        ['h', 'l'].forEach(k => { const v = limites[k]; if (v != null && v !== '' && +v >= a && +v <= b) { ctx.strokeStyle = PRIORIDADES[3].cor; ctx.beginPath(); ctx.moveTo(0, Y(+v)); ctx.lineTo(W, Y(+v)); ctx.stroke(); } });
        ctx.setLineDash([]);
    }
    ctx.strokeStyle = cor; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1]))));
    ctx.stroke();
}
