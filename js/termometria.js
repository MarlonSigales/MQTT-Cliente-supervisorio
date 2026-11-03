/**
 * © 2026 Supervisório MQTT — Inova Agro UFPel EMBRAPII. Código aberto; cópias permitidas desde que citadas.
 *
 * TERMOMETRIA DE SILO: um sensor por cabo e por altura. Tópicos <base>/caboN/sM (M = 1 embaixo), número em °C.
 *   eq.termometria = { ativo, cabos, sensores, base: 'armazenagem/silo_1/termometria', limite: 28, subidaDia: 2 }
 * O que o armazenador olha: a maior temperatura (de cada cabo e do silo) e o "ponto quente": um sensor que sobe mais de
 * X °C por dia (calculado sobre as últimas 24 h; com menos histórico, a partir de 2 h, extrapolado para o dia).
 * Sensores acima da massa de grãos (pelo nível do silo) ficam marcados "no ar" e não entram no máximo nem no alerta.
 * Cada sensor vai para o histórico como "termo:<eq>:<cabo>:<sensor>" (no máximo a cada 10 min ou ao mudar 0,3 °C).
 */

'use strict';

const TERMO = { v: new Map(), subida: new Map(), reg: new Map() };   // eqId → Map("c:s" → {v,t}); "eq:c:s" → °C/dia

function termoCfg(eq) {
    const t = eq && eq.termometria;
    if (!t || !t.ativo) return null;
    t.cabos = Math.max(1, Math.min(30, Math.round(num(t.cabos, 5))));
    t.sensores = Math.max(1, Math.min(30, Math.round(num(t.sensores, 8))));
    t.limite = num(t.limite, 28); t.subidaDia = num(t.subidaDia, 2);
    return t;
}
function termoEquipamentos(pl) { return pl.equipamentos.filter(e => termoCfg(e)); }
function termoTopico(pl, eq, c, s) { return `${topicoCompleto(pl, termoCfg(eq).base)}/cabo${c}/s${s}`; }
/** Filtros MQTT a assinar (um por silo com termometria). */
function termoFiltros(pl) { return termoEquipamentos(pl).filter(e => e.termometria.base).map(e => `${topicoCompleto(pl, e.termometria.base)}/+/+`); }
/** Chamado pelo receber(): devolve true se a mensagem era da termometria. */
function termoReceber(pl, topico, bytes, t = Date.now()) {
    for (const eq of termoEquipamentos(pl)) {
        const base = topicoCompleto(pl, eq.termometria.base) + '/';
        if (!eq.termometria.base || !topico.startsWith(base)) continue;
        const m = /^cabo(\d+)\/s(\d+)$/.exec(topico.slice(base.length));
        if (!m) return false;
        const v = lerPayload(bytes, '').v;
        if (!Number.isFinite(v)) return true;
        let mapa = TERMO.v.get(eq.id); if (!mapa) { mapa = new Map(); TERMO.v.set(eq.id, mapa); }
        const k = `${+m[1]}:${+m[2]}`;
        mapa.set(k, { v, t });
        const g = `termo:${eq.id}:${k}`, ult = TERMO.reg.get(g);
        if (!ult || t - ult.t >= 600000 || Math.abs(v - ult.v) >= 0.3) { TERMO.reg.set(g, { t, v }); histGravar(g, t, v); }
        if (typeof agendarTela === 'function') agendarTela();
        return true;
    }
    return false;
}
/** Nível do silo (%), se o kit tiver. */
function termoNivel(pl, eq) { const t = pl.tags.find(x => x.equipId === eq.id && x.kitS === 'nivel'); const v = t ? valorTag(t.id) : null; return Number.isFinite(v) ? v : 100; }
function termoNoAr(pl, eq, s) { const cfg = termoCfg(eq); return (s - 0.5) / cfg.sensores * 100 > termoNivel(pl, eq) + 2; }
/** Resumo do silo: máximo, médio, máximo por cabo, pontos quentes. */
function termoResumo(pl, eq) {
    const cfg = termoCfg(eq), mapa = TERMO.v.get(eq.id) || new Map();
    const porCabo = [], quentes = [];
    let max = null, soma = 0, n = 0;
    for (let c = 1; c <= cfg.cabos; c++) {
        let mc = null;
        for (let s = 1; s <= cfg.sensores; s++) {
            const x = mapa.get(`${c}:${s}`);
            if (!x || termoNoAr(pl, eq, s)) continue;
            soma += x.v; n++;
            if (!mc || x.v > mc.v) mc = { v: x.v, s };
            if (!max || x.v > max.v) max = { v: x.v, c, s };
            const sub = TERMO.subida.get(`${eq.id}:${c}:${s}`);
            if (x.v > cfg.limite || (sub != null && sub > cfg.subidaDia)) quentes.push({ c, s, v: x.v, subida: sub });
        }
        porCabo.push(mc);
    }
    quentes.sort((a, b) => b.v - a.v);
    return { max, media: n ? soma / n : null, porCabo, quentes, lidos: mapa.size, total: cfg.cabos * cfg.sensores };
}
/** A cada minuto: subida em °C/dia de cada sensor e alarmes de ponto quente e de temperatura alta. */
async function termoCiclo() {
    const agora = Date.now();
    for (const pl of SUP.p.plantas) for (const eq of termoEquipamentos(pl)) {
        const cfg = termoCfg(eq), mapa = TERMO.v.get(eq.id);
        if (!mapa) continue;
        for (const [k, x] of mapa) {
            const ant = (await histAnterior(`termo:${eq.id}:${k}`, agora - 86400000)) || (await primeiroPonto(`termo:${eq.id}:${k}`, agora - 86400000));
            const dt = ant ? (x.t - ant[0]) / 3600000 : 0;
            TERMO.subida.set(`${eq.id}:${k}`, dt >= 2 ? (x.v - ant[1]) * 24 / dt : null);
        }
        const r = termoResumo(pl, eq);
        const kQ = chaveAlarme(pl.id, 'termo:' + eq.id, 'EXTRA'), kH = chaveAlarme(pl.id, 'termo:' + eq.id, 'H');
        const sobe = r.quentes.filter(q => q.subida != null && q.subida > cfg.subidaDia);
        if (sobe.length) { const q = sobe[0]; if (!ALM.ativos.has(kQ)) ativarAlarme(pl, { chave: kQ, alvo: 'termo:' + eq.id, tipo: 'EXTRA', prioridade: 2, texto: `${eq.nome}: ponto quente no cabo ${q.c}, altura ${q.s} (+${formatarNumero(q.subida, 1)} °C/dia, ${formatarNumero(q.v, 1)} °C)` }, agora); }
        else if (ALM.ativos.has(kQ)) normalizarAlarme(kQ, agora);
        if (r.max && r.max.v > cfg.limite) { if (!ALM.ativos.has(kH)) ativarAlarme(pl, { chave: kH, alvo: 'termo:' + eq.id, tipo: 'H', prioridade: 3, texto: `${eq.nome}: grão a ${formatarNumero(r.max.v, 1)} °C no cabo ${r.max.c}, altura ${r.max.s} (limite ${cfg.limite} °C)`, valor: r.max.v, limite: cfg.limite }, agora); }
        else if (ALM.ativos.has(kH) && (!r.max || r.max.v < cfg.limite - 0.5)) normalizarAlarme(kH, agora);
    }
}
/** Primeiro ponto depois de t (quando ainda não há 24 h de histórico). */
async function primeiroPonto(g, t0) { const p = await histPontos(g, t0, Date.now(), 1); return p && p.length ? p[0] : null; }

// ---------------------------------------------------------------- tela (só no navegador)
// Escala sequencial de um tom só (laranja, do claro ao escuro), como pede a regra de magnitude: mais quente = mais escuro.
const TERMO_ESCALA = ['#fde7da', '#f9c7ab', '#f4a37b', '#eb6834', '#c9501f', '#9c3a13', '#6e270b'];
function termoCor(v, lo = 15, hi = 35) {
    const f = Math.max(0, Math.min(1, (v - lo) / (hi - lo))) * (TERMO_ESCALA.length - 1);
    return TERMO_ESCALA[Math.round(f)];
}
function termoTinta(v, lo = 15, hi = 35) { return (v - lo) / (hi - lo) > 0.5 ? '#ffffff' : '#1d2b2b'; }
/** Faixa da escala: do mais frio lido até um pouco acima do limite (cores com resolução onde importa). */
function termoFaixa(pl, eq) {
    const cfg = termoCfg(eq), vs = [...(TERMO.v.get(eq.id) || new Map()).values()].map(x => x.v);
    if (!vs.length) return [15, 35];
    return [Math.floor(Math.min(...vs)) - 1, Math.max(cfg.limite + 2, Math.ceil(Math.max(...vs)) + 1)];
}
function svgTermoMapa(pl, eq) {
    const cfg = termoCfg(eq), mapa = TERMO.v.get(eq.id) || new Map(), [lo, hi] = termoFaixa(pl, eq);
    const cw = 58, ch = 30, gx = 54, gy = 10, W = gx + cfg.cabos * cw + 10, H = gy + cfg.sensores * ch + 64;
    let h = `<svg class="termo-mapa" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Mapa de temperatura do ${escAttr(eq.nome)}">`;
    for (let s = cfg.sensores; s >= 1; s--) {
        const y = gy + (cfg.sensores - s) * ch;
        h += `<text class="termo-eixo" x="${gx - 8}" y="${y + ch / 2 + 4}" text-anchor="end">s${s}</text>`;
        for (let c = 1; c <= cfg.cabos; c++) {
            const x = gx + (c - 1) * cw, d = mapa.get(`${c}:${s}`), ar = termoNoAr(pl, eq, s);
            const sub = TERMO.subida.get(`${eq.id}:${c}:${s}`);
            const quente = d && !ar && (d.v > cfg.limite || (sub != null && sub > cfg.subidaDia));
            const tit = `Cabo ${c}, altura ${s}: ${d ? formatarNumero(d.v, 1) + ' °C' : 'sem leitura'}${sub != null ? ` · ${sub >= 0 ? '+' : ''}${formatarNumero(sub, 1)} °C/dia` : ''}${ar ? ' · acima da massa (no ar)' : ''}`;
            h += `<g class="termo-cel${quente ? ' quente' : ''}${ar ? ' no-ar' : ''}" data-termo="${c}:${s}" tabindex="0"><title>${esc(tit)}</title>
                <rect x="${x + 1}" y="${y + 1}" width="${cw - 2}" height="${ch - 2}" rx="4" fill="${d && !ar ? termoCor(d.v, lo, hi) : 'var(--grade)'}"/>
                ${d ? `<text x="${x + cw / 2}" y="${y + ch / 2 + 4}" text-anchor="middle" fill="${ar ? 'var(--suave)' : termoTinta(d.v, lo, hi)}">${formatarNumero(d.v, 1)}${quente ? ' !' : ''}</text>` : ''}</g>`;
        }
    }
    const r = termoResumo(pl, eq), yb = gy + cfg.sensores * ch + 18;
    for (let c = 1; c <= cfg.cabos; c++) {
        const x = gx + (c - 1) * cw + cw / 2, m = r.porCabo[c - 1];
        h += `<text class="termo-eixo" x="${x}" y="${yb}" text-anchor="middle">cabo ${c}</text><text class="termo-max" x="${x}" y="${yb + 18}" text-anchor="middle">${m ? 'máx ' + formatarNumero(m.v, 1) : '—'}</text>`;
    }
    return h + '</svg>';
}
function htmlTermoLegenda(lo = 15, hi = 35) {
    return `<div class="termo-legenda" aria-label="Escala de cores"><small>${lo} °C</small>${TERMO_ESCALA.map(c => `<span style="background:${c}"></span>`).join('')}<small>${hi} °C</small>
        <span class="termo-leg-item"><i class="leg-quente"></i> acima do limite ou subindo rápido</span><span class="termo-leg-item"><i class="leg-ar"></i> acima da massa (no ar)</span></div>`;
}
if (typeof PAGINAS !== 'undefined') {
    PAGINAS.termometria = {
        titulo: 'Termometria',
        render(id) {
            const silos = SUP.p.plantas.flatMap(pl => termoEquipamentos(pl).map(eq => ({ pl, eq })));
            if (!silos.length) return `<div class="container">${cabecalho(`${icone('temperatura')} Termometria`, 'Mapa de temperatura dos silos (um sensor por cabo e por altura).')}${vazio('Nenhum silo com termometria. Em Configurar → Equipamentos, num silo ou armazém, marque "Termometria por cabos" e diga quantos cabos e sensores e o tópico base (os sensores publicam em <code>base/caboN/sM</code>).')}</div>`;
            const sel = silos.find(x => x.eq.id === id) || silos[0], { pl, eq } = sel, cfg = termoCfg(eq), r = termoResumo(pl, eq);
            return `<div class="container">${cabecalho(`${icone('temperatura')} Termometria`, `Cada célula é um sensor (cabo × altura; s1 embaixo). Tópicos <code>${esc(topicoCompleto(pl, cfg.base))}/caboN/sM</code>. Limite ${cfg.limite} °C; ponto quente: subida acima de ${cfg.subidaDia} °C/dia.`,
                `<select id="termo-silo" aria-label="Silo">${silos.map(x => `<option value="${x.eq.id}"${x === sel ? ' selected' : ''}>${esc(x.eq.nome)} · ${esc(x.pl.nome)}</option>`).join('')}</select>`)}
                <div class="termo-topo">
                    <div class="stat"><small>Maior temperatura</small><b>${r.max ? formatarNumero(r.max.v, 1) + ' °C' : '—'}</b><span>${r.max ? `cabo ${r.max.c}, altura ${r.max.s}` : ''}</span></div>
                    <div class="stat"><small>Média da massa</small><b>${r.media != null ? formatarNumero(r.media, 1) + ' °C' : '—'}</b><span>${r.lidos} de ${r.total} sensores lidos</span></div>
                    <div class="stat"><small>Nível</small><b>${formatarNumero(termoNivel(pl, eq), 0)} %</b><span>sensores acima ficam "no ar"</span></div>
                    <div class="stat${r.quentes.length ? ' stat-alerta' : ''}"><small>Pontos de atenção</small><b>${r.quentes.length ? '⚠ ' : ''}${r.quentes.length}</b><span>${r.quentes.length ? 'veja a lista' : 'nenhum'}</span></div></div>
                <section class="card"><div class="termo-area"><div class="termo-svg" id="termo-svg">${svgTermoMapa(pl, eq)}</div>
                    <div class="termo-lado"><h3>Pontos de atenção</h3>${r.quentes.length ? `<ul class="termo-lista">${r.quentes.slice(0, 12).map(q => `<li><b>Cabo ${q.c}, altura ${q.s}</b> · ${formatarNumero(q.v, 1)} °C${q.subida != null ? ` · ${q.subida >= 0 ? '+' : ''}${formatarNumero(q.subida, 1)} °C/dia` : ''}</li>`).join('')}</ul>` : '<p class="nota">Nenhum sensor acima do limite nem subindo rápido.</p>'}
                        <h3>Histórico do sensor</h3><p class="nota" id="termo-graf-tit">Clique numa célula para ver os últimos 7 dias.</p><div id="termo-graf"></div></div></div>
                    <div id="termo-leg">${htmlTermoLegenda(...termoFaixa(pl, eq))}</div></section></div>`;
        },
        montar(raiz) {
            const s = $('#termo-silo', raiz); if (s) s.addEventListener('change', () => { location.hash = '#/termometria/' + s.value; });
            raiz.addEventListener('click', async e => {
                const g = e.target.closest('[data-termo]'); if (!g) return;
                const eqId = ($('#termo-silo', raiz) || {}).value, [c, sn] = g.dataset.termo.split(':');
                const pts = await histPontos(`termo:${eqId}:${c}:${sn}`, Date.now() - 7 * 86400000, Date.now());
                $('#termo-graf-tit', raiz).textContent = `Cabo ${c}, altura ${sn}: ${pts.length} leituras em 7 dias`;
                $('#termo-graf', raiz).innerHTML = svgLinhaSimples(pts, '°C');
            });
        },
        atualizar(sujos, forcar) {
            if (!forcar && RT.tick % 5) return;
            const s = $('#termo-silo'), alvo = $('#termo-svg'); if (!s || !alvo) return;
            for (const pl of SUP.p.plantas) { const eq = pl.equipamentos.find(x => x.id === s.value); if (eq && termoCfg(eq)) { alvo.innerHTML = svgTermoMapa(pl, eq); $('#termo-leg').innerHTML = htmlTermoLegenda(...termoFaixa(pl, eq)); } }
        }
    };
}
/** Linha simples (uma série, um eixo) para o histórico de um sensor. */
function svgLinhaSimples(pts, un) {
    if (!pts.length) return '<p class="nota">Sem histórico ainda.</p>';
    const W = 320, H = 140, m = { l: 34, r: 8, t: 8, b: 20 };
    const t0 = pts[0][0], t1 = pts[pts.length - 1][0] || t0 + 1, vs = pts.map(p => p[1]);
    let lo = Math.min(...vs), hi = Math.max(...vs); if (hi - lo < 1) { lo -= 0.5; hi += 0.5; }
    const X = t => m.l + (W - m.l - m.r) * (t - t0) / Math.max(1, t1 - t0), Y = v => m.t + (H - m.t - m.b) * (1 - (v - lo) / (hi - lo));
    const d = reduzirSerie(pts, 300).map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" class="termo-linha" role="img" aria-label="Histórico">
        <line x1="${m.l}" y1="${H - m.b}" x2="${W - m.r}" y2="${H - m.b}" class="eixo"/>
        <text x="${m.l - 4}" y="${Y(hi) + 4}" text-anchor="end">${formatarNumero(hi, 1)}</text><text x="${m.l - 4}" y="${Y(lo) + 4}" text-anchor="end">${formatarNumero(lo, 1)}</text>
        <text x="${m.l}" y="${H - 4}">${new Date(t0).toLocaleDateString('pt-BR')}</text><text x="${W - m.r}" y="${H - 4}" text-anchor="end">${un}</text>
        <path d="${d}" fill="none" stroke="#2a78d6" stroke-width="2" stroke-linejoin="round"/></svg>`;
}
