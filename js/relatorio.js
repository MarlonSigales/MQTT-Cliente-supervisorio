/**
 * © 2026 Supervisório MQTT — Inova Agro UFPel EMBRAPII. Código aberto; cópias permitidas desde que citadas.
 *
 * RELATÓRIOS DO PERÍODO — mesmo design dos relatórios do Gestão de Projetos, QFD e Projeto Conceitual (capa pontilhada
 * com os quadrados verde e limão, títulos numerados com linha limão, tabelas de cabeçalho verde). Um só gerador para a
 * prévia, o PDF (imprimir do navegador) e o arquivo HTML.
 * Seções: resumo, energia (consumo, custo, energia em vazio), horímetros (tempo por estado, partidas, utilização),
 * variáveis (mín., média ponderada no tempo, máx., % fora dos limites), gráficos, alarmes (contagem, mais frequentes,
 * taxa EEMUA) e comandos/controle. Também calcula os horímetros de qualquer período a partir do histórico.
 */

'use strict';

const RELATORIO_CSS = `.rel { font-family: Roboto, "Segoe UI", Arial, sans-serif; color: #1d2b2b; background: #e9efed; padding: 1rem; border-radius: 8px; }
.rel * { box-sizing: border-box; }
.rel .pagina { background: #fff; max-width: 210mm; margin: 0 auto 1rem; box-shadow: 0 6px 24px rgba(16,24,40,.10); border: 1px solid #d5e0dd; border-radius: 4px; overflow: hidden; }
.rel .capa { position: relative; min-height: 270mm; display: flex; flex-direction: column; padding: 2.2rem 2.6rem 2.4rem; background: #fff; overflow: hidden; }
.rel .capa .fundo { position: absolute; left: 0; top: 0; width: 42%; }
.rel .capa::before { content: ""; position: absolute; right: 0; bottom: 9%; width: 11%; height: 31%; background: #409580; }
.rel .capa::after { content: ""; position: absolute; right: 0; bottom: 0; width: 28.5%; height: 9.5%; background: #a8e156; }
.rel .capa-logos { display: flex; gap: 1.4rem; flex-wrap: wrap; position: relative; }
.rel .capa-logos img { height: 46px; width: auto; }
.rel .capa-centro { margin-top: 30%; position: relative; padding-left: 4.2rem; }
.rel .capa-centro::before { content: ""; position: absolute; left: 0; top: 0.1rem; width: 2.6rem; height: 2.6rem; background: #409580; }
.rel .capa-centro::after { content: ""; position: absolute; left: 2.2rem; top: 2.3rem; width: 1.9rem; height: 1.9rem; background: #a8e156; }
.rel .capa-tipo { color: #085357; font-size: 1.9rem; line-height: 1.2; margin: 0 0 1.4rem; text-transform: uppercase; }
.rel .capa h1 { font-size: 1.45rem; color: #085357; margin: 0 0 0.9rem; }
.rel .capa-centro p { margin: 0.1rem 0; color: #085357; font-size: 0.92rem; }
.rel .capa-centro p b { color: #1d2b2b; }
.rel .capa-equipe { margin-top: 2.2rem; padding-left: 4.2rem; font-size: 0.92rem; position: relative; }
.rel .capa-equipe ul { margin: 0.2rem 0 0; padding-left: 1.1rem; }
.rel .capa-rodape { margin-top: auto; padding-right: 32%; font-size: 0.92rem; position: relative; }
.rel .capa-rodape p:first-child { font-size: 1.15rem; color: #085357; margin-bottom: 0.2rem; }
.rel .capa-rodape small { color: #5f6f6d; }
.rel .secao { padding: 1rem 2.25rem 0.9rem; }
.rel h2 { border-bottom: 2px solid #a8e156; padding: 0 0 0.3rem; margin: 0.5rem 0 0.8rem; color: #085357; font-size: 1.15rem; text-transform: uppercase; letter-spacing: 0.01em; }
.rel h2 .n { margin-right: 0.35rem; }
.rel h3 { color: #409580; font-size: 0.98rem; margin: 0.9rem 0 0.35rem; }
.rel p, .rel li { font-size: 0.92rem; line-height: 1.5; }
.rel .pre { white-space: pre-wrap; }
.rel table { width: 100%; border-collapse: collapse; border: 1px solid #cfdcda; margin: 0.4rem 0 0.6rem; }
.rel th { background: #409580; color: #fff; font-size: 0.8rem; font-weight: 700; text-align: left; padding: 0.4rem 0.5rem; border: 1px solid #cfdcda; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.rel td { font-size: 0.82rem; padding: 0.35rem 0.5rem; border: 1px solid #cfdcda; vertical-align: top; }
.rel tbody tr:nth-child(even) { background: #f4f8f7; }
.rel .num { text-align: right; white-space: nowrap; }
.rel .centro { text-align: center; }
.rel .figura { margin: 0.6rem 0 1rem; text-align: center; break-inside: avoid; }
.rel .figura svg, .rel .figura img { max-width: 100%; height: auto; }
.rel .figura figcaption { font-size: 0.8rem; color: #5f6f6d; margin-top: 0.3rem; }
.rel .destaque { border-left: 4px solid #409580; background: #eef7f4; padding: 0.6rem 0.8rem; margin: 0.5rem 0; }
.rel .ponto { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 4px; vertical-align: middle; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.rel .mm td { text-align: center; vertical-align: middle; }
.rel .mm th[scope=row] { background: #eef7f4; color: #0b3b3e; }
.rel .mm img { display: block; max-width: 90px; max-height: 64px; margin: 0 auto 3px; object-fit: contain; }
.rel .mm .marcas { display: block; margin-top: 2px; }
.rel .foto { max-width: 120px; max-height: 90px; object-fit: contain; }
.rel .galeria { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 0.6rem; }
.rel .galeria figure { margin: 0; text-align: center; border: 1px solid #d5e0dd; padding: 0.4rem; break-inside: avoid; }
.rel .galeria img { max-width: 100%; max-height: 160px; object-fit: contain; }
.rel .galeria figcaption { font-size: 0.78rem; }
.rel .ok { color: #1f5f45; font-weight: 700; }
.rel .nok { color: #b3261e; font-weight: 700; }
.rel .melhor { background: #eef7d9 !important; }
.rel .legenda-fluxos { font-size: 0.8rem; color: #5f6f6d; }
.rel .referencias li { margin-bottom: 0.3rem; }
@media print {
  @page { size: A4; margin: 14mm 12mm; }
  .rel { background: #fff; padding: 0; }
  .rel .pagina { box-shadow: none; border: 0; max-width: none; margin: 0; }
  .rel .capa { min-height: 0; height: 268mm; break-after: page; -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 1.2rem 1.4rem; }
  .rel .secao { padding: 0.2rem 0; }
  .rel h2 { break-after: avoid; }
  .rel tr, .rel .figura { break-inside: avoid; }
}

.rel .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.5rem; margin: 0.5rem 0 0.8rem; }
.rel .kpi { border: 1px solid #d5e0dd; border-left: 4px solid #409580; padding: 0.45rem 0.6rem; break-inside: avoid; }
.rel .kpi b { display: block; font-size: 1.2rem; color: #085357; }
.rel .kpi small { color: #5f6f6d; font-size: 0.75rem; }
.rel .barra-estados { display: flex; height: 12px; min-width: 120px; border-radius: 3px; overflow: hidden; background: #e3ecea; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.rel .barra-estados i { display: block; height: 100%; }
.rel .est-trabalhando { background: #085357; } .rel .est-vazio { background: #9fb3ae; } .rel .est-desligado { background: #e3ecea; } .rel .est-sem { background: repeating-linear-gradient(45deg,#fff,#fff 3px,#d5e0dd 3px,#d5e0dd 5px); }
.rel .legenda-est { font-size: 0.75rem; color: #5f6f6d; display: flex; gap: 0.8rem; flex-wrap: wrap; }
.rel .legenda-est i { display: inline-block; width: 10px; height: 10px; margin-right: 3px; vertical-align: middle; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.rel .p1 { color: #b3261e; font-weight: 700; } .rel .p2 { color: #c2570c; font-weight: 700; } .rel .p3 { color: #8a6700; font-weight: 700; } .rel .p4 { color: #2f6fb3; font-weight: 700; }
.rel .grafico-rel svg { width: 100%; height: auto; }`;

// ---------------------------------------------------------------- cálculos do período
/** Pontos de [t0, t1] com o ponto anterior a t0 trazido para t0 (estado no início do período). */
async function pontosComInicio(g, t0, t1) {
    const pts = await histPontos(g, t0, t1);
    const ant = await histAnterior(g, t0);
    if (ant && (!pts.length || pts[0][0] > t0)) pts.unshift([t0, ant[1]]);
    return pts;
}
/** Horímetro de um período, a partir da série de estado gravada (0 desligado, 1 vazio, 2 trabalhando, −1 sem dados). */
async function horasNoPeriodo(eq, t0, t1) {
    const r = { desligado: 0, vazio: 0, trabalhando: 0, sem: 0, partidas: 0, energia: null, energiaVazio: null };
    const pts = await pontosComInicio('est:' + eq.id, t0, Math.min(t1, Date.now()));
    const nome = v => (v === 2 ? 'trabalhando' : v === 1 ? 'vazio' : v === 0 ? 'desligado' : 'sem');
    const fim = Math.min(t1, Date.now());
    if (!pts.length) { r.sem = (fim - t0) / 1000; return r; }
    if (pts[0][0] > t0) r.sem += (pts[0][0] - t0) / 1000;
    for (let i = 0; i < pts.length; i++) {
        const a = pts[i][0], b = i < pts.length - 1 ? pts[i + 1][0] : fim;
        // trecho muito longo sem registro (página fechada) conta como sem dados: o estado é regravado a cada 10 min
        const dur = (b - a) / 1000, est = nome(pts[i][1]);
        if (dur > 1800) { r[est] += 600; r.sem += dur - 600; } else r[est] += dur;
        if (i > 0 && pts[i - 1][1] === 0 && pts[i][1] >= 1) r.partidas++;
    }
    if (eq.tagPotencia) {
        const pp = await pontosComInicio(eq.tagPotencia, t0, fim);
        let e = 0, ev = 0;
        for (let i = 0; i < pp.length - 1; i++) {
            const dt = Math.min(pp[i + 1][0] - pp[i][0], 1800000) / 3600000;
            e += pp[i][1] * dt;
            const k = buscaTempo(pts, pp[i][0]); const st = k >= 0 && pts[k][0] > pp[i][0] && k > 0 ? pts[k - 1][1] : k >= 0 ? pts[k][1] : null;
            if (st === 1) ev += pp[i][1] * dt;
        }
        r.energia = e; r.energiaVazio = ev;
    }
    return r;
}
/** Consumo de um contador (energia integrada ou medidor kWh): soma os aumentos; queda = contador zerado. */
async function consumoContador(tagId, t0, t1) {
    const pts = await pontosComInicio(tagId, t0, t1);
    let tot = 0;
    for (let i = 1; i < pts.length; i++) { const d = pts[i][1] - pts[i - 1][1]; tot += d >= 0 ? d : pts[i][1]; }
    return pts.length > 1 ? tot : null;
}
/** Energia de uma potência (kW → kWh) integrando no tempo. */
async function energiaDePotencia(tagId, t0, t1) {
    const pts = await pontosComInicio(tagId, t0, t1);
    let e = 0;
    for (let i = 0; i < pts.length - 1; i++) e += pts[i][1] * Math.min(pts[i + 1][0] - pts[i][0], 1800000) / 3600000;
    return pts.length > 1 ? e : null;
}

// ---------------------------------------------------------------- gráfico em SVG (para o relatório impresso)
function svgSeries(series, t0, t1, { largura = 680, altura = 210, unidade = '' } = {}) {
    const ml = 50, mr = 10, mt = 10, mb = 26, W = largura - ml - mr, H = altura - mt - mb;
    let a = Infinity, b = -Infinity;
    series.forEach(s => s.pts.forEach(p => { a = Math.min(a, p[1]); b = Math.max(b, p[1]); }));
    if (!Number.isFinite(a)) return '';
    if (b - a < 1e-9) { a -= 1; b += 1; }
    const m = (b - a) * 0.08; a -= m; b += m;
    const X = t => ml + (t - t0) / (t1 - t0) * W, Y = v => mt + H - (v - a) / (b - a) * H;
    const pv = passosValor(a, b, 5), pt = passosTempo(t0, t1, 7);
    const grade = pv.marcas.map(v => `<line x1="${ml}" x2="${ml + W}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="#e3ecea"/><text x="${ml - 5}" y="${(Y(v) + 3).toFixed(1)}" text-anchor="end" font-size="10" fill="#5f6f6d">${v.toLocaleString('pt-BR')}</text>`).join('')
        + pt.marcas.map(t => `<text x="${X(t).toFixed(1)}" y="${altura - 8}" text-anchor="middle" font-size="10" fill="#5f6f6d">${formatarTempoEixo(t, pt.passo)}</text>`).join('');
    const linhas = series.map(s => {
        const pts = reduzirSerie(s.pts, 600);
        return `<polyline fill="none" stroke="${s.cor}" stroke-width="1.6" stroke-linejoin="round" points="${pts.map(p => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ')}"/>`;
    }).join('');
    return `<svg viewBox="0 0 ${largura} ${altura}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Gráfico ${escAttr(unidade)}">${grade}
        <line x1="${ml}" x2="${ml}" y1="${mt}" y2="${mt + H}" stroke="#8a9a97"/><line x1="${ml}" x2="${ml + W}" y1="${mt + H}" y2="${mt + H}" stroke="#8a9a97"/>
        <text x="12" y="${mt + H / 2}" font-size="10" fill="#5f6f6d" transform="rotate(-90 12 ${mt + H / 2})" text-anchor="middle">${esc(unidade)}</text>${linhas}</svg>`;
}

// ---------------------------------------------------------------- montagem
async function dadosRelatorio(o) {
    const { t0, t1 } = o;
    const pls = SUP.p.plantas.filter(p => o.plantas.includes(p.id));
    const tar = num(SUP.p.opcoes.tarifa, 0);
    const d = { t0, t1, plantas: [] };
    for (const pl of pls) {
        const P = { pl, energia: [], horas: [], vars: [], alarmes: [], comandos: [], graficos: [] };
        // energia: contadores (energia) e potências sem contador
        for (const t of pl.tags.filter(x => x.tipo === 'energia')) { const c = await consumoContador(t.id, t0, t1); if (c != null) P.energia.push({ nome: t.nome, kwh: c, custo: c * tar, fonte: 'contador' }); }
        const comContador = new Set(pl.tags.filter(x => x.origem === 'integral').map(x => x.fonteIntegral));
        for (const t of pl.tags.filter(x => x.tipo === 'potencia' && !comContador.has(x.id))) { const e = await energiaDePotencia(t.id, t0, t1); if (e != null) P.energia.push({ nome: t.nome, kwh: e, custo: e * tar, fonte: 'potência' }); }
        if (o.secoes.horimetros || o.secoes.energia) for (const eq of pl.equipamentos.filter(e => e.horimetro.ativo)) P.horas.push({ eq, h: await horasNoPeriodo(eq, t0, t1) });
        if (o.secoes.variaveis || o.secoes.graficos) {
            for (const t of pl.tags) {
                if (t.tipo === 'estado') continue;
                const pts = await histPontos(t.id, t0, t1);
                const st = estatisticas(pts, t.limites);
                if (st) P.vars.push({ t, st, pts });
            }
        }
        const evs = await histEventos(t0, t1, e => e.planta === pl.nome);
        P.alarmes = evs.filter(e => e.tipo === 'alarme' && /^ATIVO/.test(e.texto)).reverse();
        P.comandos = evs.filter(e => ['comando', 'controle', 'horimetro'].includes(e.tipo)).reverse();
        // gráficos: os escolhidos ou, sem escolha, até 6 com alarme ligado
        const escolhidos = o.graficos && o.graficos.length ? P.vars.filter(v => o.graficos.includes(v.t.id)) : P.vars.filter(v => v.t.limites.ativo).slice(0, 6);
        const porUn = new Map();
        escolhidos.forEach(v => { const k = v.t.unidade || v.t.tipo; (porUn.get(k) || porUn.set(k, []).get(k)).push(v); });
        porUn.forEach((vs, un) => { for (let i = 0; i < vs.length; i += 4) P.graficos.push({ un, vs: vs.slice(i, i + 4) }); });
        d.plantas.push(P);
    }
    return d;
}

function corpoRelatorioSup(d, o, recurso = n => 'img/' + n) {
    const tar = num(SUP.p.opcoes.tarifa, 0), R = SUP.p.relatorio;
    let n = 0;
    const secao = (titulo, html) => html ? `<section class="secao"><h2><span class="n">${++n}</span>${esc(titulo)}</h2>${html}</section>` : '';
    const logo = (arq, alt) => recurso(arq) ? `<img src="${escAttr(recurso(arq))}" alt="${escAttr(alt)}">` : '';
    const periodoTxt = `${new Date(d.t0).toLocaleString('pt-BR')} a ${new Date(d.t1).toLocaleString('pt-BR')}`;
    const capa = `<div class="capa">
        ${recurso('relatorio-fundo-capa.png') ? `<img class="fundo" src="${escAttr(recurso('relatorio-fundo-capa.png'))}" alt="">` : ''}
        <div class="capa-logos">${logo('logo-inovaagro.png', 'Inova Agro')}${logo('logo-nimeq.png', 'NIMEq')}${logo('logo-instagri.png', 'InstAgri')}</div>
        <div class="capa-centro"><p class="capa-tipo">Relatório de<br>operação</p><h1>${esc(SUP.p.nome)}</h1>
            <p><b>Período:</b> ${esc(periodoTxt)}</p><p><b>Plantas:</b> ${esc(d.plantas.map(P => P.pl.nome).join(', '))}</p>
            ${R.empresa ? `<p><b>Empresa:</b> ${esc(R.empresa)}</p>` : ''}${R.responsavel ? `<p><b>Responsável:</b> ${esc(R.responsavel)}</p>` : ''}</div>
        <div class="capa-rodape"><p>${new Date().toLocaleDateString('pt-BR')}</p><small>Supervisório MQTT — Inova Agro UFPel EMBRAPII</small></div></div>`;
    const horasTot = d.plantas.reduce((s, P) => s + P.horas.reduce((a, x) => a + x.h.trabalhando, 0), 0);
    const vazioTot = d.plantas.reduce((s, P) => s + P.horas.reduce((a, x) => a + x.h.vazio, 0), 0);
    const kwh = d.plantas.reduce((s, P) => s + P.energia.filter(e => /total|consumida/i.test(e.nome) || e.fonte === 'contador').reduce((a, e) => a + e.kwh, 0), 0);
    const alarmes = d.plantas.reduce((s, P) => s + P.alarmes.length, 0);
    const horasPer = (d.t1 - d.t0) / 3600000;
    const resumo = o.secoes.resumo ? `<div class="kpis">
        <div class="kpi"><b>${formatarNumero(horasPer, 1)} h</b><small>período analisado</small></div>
        ${kwh ? `<div class="kpi"><b>${formatarNumero(kwh, 1)} kWh</b><small>energia${tar ? ` · R$ ${formatarNumero(kwh * tar, 2)}` : ''}</small></div>` : ''}
        ${horasTot + vazioTot ? `<div class="kpi"><b>${formatarNumero(100 * horasTot / (horasTot + vazioTot), 0)} %</b><small>utilização (trabalhando ÷ ligado)</small></div><div class="kpi"><b>${formatarDuracao(vazioTot)}</b><small>de equipamentos girando em vazio</small></div>` : ''}
        <div class="kpi"><b>${alarmes}</b><small>alarme(s) · ${formatarNumero(alarmes / Math.max(1, horasPer * 6), 2)} por 10 min</small></div></div>
        ${R.observacoes ? `<p class="destaque pre">${esc(R.observacoes)}</p>` : ''}` : '';
    let html = secao('Resumo', resumo);
    for (const P of d.plantas) {
        const pre = d.plantas.length > 1 ? P.pl.nome + ' — ' : '';
        if (o.secoes.energia && (P.energia.length || P.horas.some(x => x.h.energia != null))) {
            html += secao(pre + 'Energia', `<table><thead><tr><th>Medição</th><th>Origem</th><th class="num">kWh</th>${tar ? '<th class="num">R$</th>' : ''}</tr></thead><tbody>
                ${P.energia.map(e => `<tr><td>${esc(e.nome)}</td><td>${e.fonte === 'contador' ? 'contador de energia' : 'integral da potência'}</td><td class="num">${formatarNumero(e.kwh, 2)}</td>${tar ? `<td class="num">${formatarNumero(e.custo, 2)}</td>` : ''}</tr>`).join('')}</tbody></table>
                ${P.horas.some(x => x.h.energia > 0.001) ? `<h3>Energia gasta em vazio (equipamento ligado sem carga)</h3><table><thead><tr><th>Equipamento</th><th class="num">Total kWh</th><th class="num">Em vazio kWh</th><th class="num">% em vazio</th>${tar ? '<th class="num">R$ em vazio</th>' : ''}</tr></thead><tbody>
                ${P.horas.filter(x => x.h.energia > 0.001).map(({ eq, h }) => `<tr><td>${esc(eq.nome)}</td><td class="num">${formatarNumero(h.energia, 2)}</td><td class="num">${formatarNumero(h.energiaVazio, 2)}</td><td class="num">${h.energia ? formatarNumero(100 * h.energiaVazio / h.energia, 0) + ' %' : '—'}</td>${tar ? `<td class="num">${formatarNumero(h.energiaVazio * tar, 2)}</td>` : ''}</tr>`).join('')}</tbody></table>` : ''}
                ${tar ? `<p><small>Tarifa usada: R$ ${formatarNumero(tar, 2)}/kWh (sem demanda nem impostos).</small></p>` : ''}`);
        }
        if (o.secoes.horimetros && P.horas.length) {
            html += secao(pre + 'Horímetros', `<p class="legenda-est"><span><i class="est-trabalhando"></i>trabalhando</span><span><i class="est-vazio"></i>em vazio</span><span><i class="est-desligado"></i>desligado</span><span><i class="est-sem"></i>sem dados</span></p>
                <table><thead><tr><th>Equipamento</th><th>Distribuição</th><th class="num">Trabalhando</th><th class="num">Em vazio</th><th class="num">Desligado</th><th class="num">Sem dados</th><th class="num">Partidas</th><th class="num">Utilização</th></tr></thead><tbody>
                ${P.horas.map(({ eq, h }) => `<tr><td>${esc(eq.nome)}</td><td>${barraEstados(h)}</td><td class="num">${formatarDuracao(h.trabalhando)}</td><td class="num">${formatarDuracao(h.vazio)}</td><td class="num">${formatarDuracao(h.desligado)}</td><td class="num">${formatarDuracao(h.sem)}</td><td class="num">${h.partidas}</td><td class="num">${h.trabalhando + h.vazio ? formatarNumero(100 * h.trabalhando / (h.trabalhando + h.vazio), 0) + ' %' : '—'}</td></tr>`).join('')}</tbody></table>
                <p><small>"Sem dados": o supervisório estava fechado ou o equipamento sem sinal. Horímetros contados pelo supervisório só valem com ele aberto; para cobrança/garantia use o horímetro do equipamento.</small></p>`);
        }
        if (o.secoes.variaveis && P.vars.length) {
            html += secao(pre + 'Variáveis', `<table><thead><tr><th>Variável</th><th class="num">Mín.</th><th class="num">Média</th><th class="num">Máx.</th><th class="num">Desvio</th><th class="num">Fora dos limites</th><th class="num">Amostras</th></tr></thead><tbody>
                ${P.vars.map(({ t, st }) => `<tr><td>${esc(t.nome)}${t.unidade ? ` <small>(${esc(t.unidade)})</small>` : ''}</td><td class="num">${formatarNumero(st.min, t.dec)}</td><td class="num">${formatarNumero(st.media, t.dec)}</td><td class="num">${formatarNumero(st.max, t.dec)}</td><td class="num">${formatarNumero(st.desvio, t.dec)}</td><td class="num">${t.limites.ativo ? `<span class="${st.foraPct > 5 ? 'nok' : ''}">${formatarNumero(st.foraPct, 1)} %</span>` : '—'}</td><td class="num">${st.n}</td></tr>`).join('')}</tbody></table>
                <p><small>Média ponderada pelo tempo (amostragem irregular não distorce). "Fora dos limites" = tempo acima de H/HH ou abaixo de L/LL.</small></p>`);
        }
        if (o.secoes.graficos && P.graficos.length) {
            html += secao(pre + 'Gráficos', P.graficos.map(g => `<figure class="figura grafico-rel">${svgSeries(g.vs.map((v, i) => ({ pts: v.pts, cor: CORES_SERIES[i] })), d.t0, d.t1, { unidade: g.un })}
                <figcaption>${g.vs.map((v, i) => `<span class="ponto" style="background:${CORES_SERIES[i]}"></span>${esc(v.t.nome)}`).join(' · ')}</figcaption></figure>`).join(''));
        }
        if (o.secoes.alarmes) {
            const por = new Map(); P.alarmes.forEach(e => { const k = e.texto.replace(/ — .*$/, '').replace(/^ATIVO \[[^\]]+\] /, ''); por.set(k, (por.get(k) || 0) + 1); });
            html += secao(pre + 'Alarmes', P.alarmes.length ? `<p>${P.alarmes.length} alarme(s) no período.</p><h3>Mais frequentes</h3><table><thead><tr><th>Alarme</th><th class="num">Vezes</th></tr></thead><tbody>${[...por].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${v}</td></tr>`).join('')}</tbody></table>
                <h3>Lista</h3><table><thead><tr><th>Quando</th><th>Prioridade</th><th>Alarme</th></tr></thead><tbody>${P.alarmes.slice(0, 300).map(e => { const p = (e.dados && e.dados.prioridade) || 3; return `<tr><td>${dataHora(e.t)}</td><td class="p${p}">${PRIORIDADES[p].nome}</td><td>${esc(e.texto.replace(/^ATIVO \[[^\]]+\] /, ''))}</td></tr>`; }).join('')}</tbody></table>${P.alarmes.length > 300 ? '<p><small>Mostrando os 300 primeiros.</small></p>' : ''}` : '<p>Nenhum alarme no período.</p>');
        }
        if (o.secoes.comandos && P.comandos.length) {
            html += secao(pre + 'Comandos e controle', `<table><thead><tr><th>Quando</th><th>Tipo</th><th>Evento</th></tr></thead><tbody>${P.comandos.slice(0, 400).map(e => `<tr><td>${dataHora(e.t)}</td><td>${esc(e.tipo)}</td><td>${esc(e.texto)}</td></tr>`).join('')}</tbody></table>`);
        }
    }
    return `<div class="rel"><div class="pagina">${capa}</div><div class="pagina">${html || '<section class="secao"><p>Sem dados no período.</p></section>'}</div></div>`;
}
function documentoRelatorioSup(d, o, recurso) {
    return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Relatório de operação — ${esc(SUP.p.nome)}</title>
<style>body{margin:0;background:#e9efed}${RELATORIO_CSS}</style></head><body>${corpoRelatorioSup(d, o, recurso)}</body></html>`;
}

// ---------------------------------------------------------------- página
const REL = { periodo: 'ontem', de: '', ate: '', plantas: null, graficos: [], secoes: { resumo: true, energia: true, horimetros: true, variaveis: true, graficos: true, alarmes: true, comandos: true }, dados: null };
function intervaloRelatorio() {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const h = hoje.getTime(), D = 86400000;
    switch (REL.periodo) {
        case 'hoje': return [h, Date.now()];
        case 'ontem': return [h - D, h - 1];
        case '7d': return [h - 7 * D, h - 1];
        case 'mes': return [new Date(hoje.getFullYear(), hoje.getMonth(), 1).getTime(), Date.now()];
        case 'mesant': return [new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1).getTime(), new Date(hoje.getFullYear(), hoje.getMonth(), 1).getTime() - 1];
        default: return [new Date(REL.de + 'T00:00').getTime(), new Date(REL.ate + 'T23:59:59').getTime()];
    }
}
PAGINAS.relatorios = {
    titulo: 'Relatórios',
    render() {
        const pls = SUP.p.plantas;
        if (!REL.plantas) REL.plantas = pls.map(p => p.id);
        if (!REL.de) { REL.de = diaISO(Date.now() - 7 * 86400000); REL.ate = diaISO(Date.now()); }
        const R = SUP.p.relatorio;
        const nomesSec = { resumo: 'Resumo', energia: 'Energia e custo', horimetros: 'Horímetros', variaveis: 'Estatística das variáveis', graficos: 'Gráficos', alarmes: 'Alarmes', comandos: 'Comandos e controle' };
        return `<div class="container">${cabecalho(`${icone('relatorio')} Relatórios`, 'Escolha o período e as seções; a prévia aparece abaixo. Para PDF: "Imprimir / PDF" e "Salvar como PDF" (deixe "Gráficos de fundo" ligado).')}
            <section class="card relatorio-acoes"><div class="grade-2"><div>
                <h3>Período</h3><div class="seg" role="group">${[['hoje', 'Hoje'], ['ontem', 'Ontem'], ['7d', '7 dias'], ['mes', 'Este mês'], ['mesant', 'Mês passado'], ['outro', 'Outro']].map(([k, n2]) => `<button type="button" class="seg-btn${REL.periodo === k ? ' ativo' : ''}" data-acao="rel-periodo" data-p="${k}">${n2}</button>`).join('')}</div>
                ${REL.periodo === 'outro' ? `<div class="grade-campos grade-estreita"><label>De <input type="date" id="rel-de" value="${REL.de}"></label><label>Até <input type="date" id="rel-ate" value="${REL.ate}"></label></div>` : ''}
                <h3>Plantas</h3>${pls.map(p => `<label class="campo-inline"><input type="checkbox" data-relpl="${p.id}"${REL.plantas.includes(p.id) ? ' checked' : ''}> ${esc(p.nome)}</label>`).join('')}
                <h3>Seções</h3>${Object.entries(nomesSec).map(([k, n2]) => `<label class="campo-inline"><input type="checkbox" data-relsec="${k}"${REL.secoes[k] ? ' checked' : ''}> ${n2}</label>`).join('')}
            </div><div>
                <h3>Capa e observações</h3>
                <label>Empresa / unidade <input type="text" data-ref="rel.empresa" value="${escAttr(R.empresa)}"></label>
                <label>Responsável <input type="text" data-ref="rel.responsavel" value="${escAttr(R.responsavel)}"></label>
                <label>Observações do período <textarea rows="3" data-ref="rel.observacoes">${esc(R.observacoes)}</textarea></label>
                <label>Tarifa (R$/kWh) <input type="number" step="0.01" min="0" data-ref="op.tarifa" value="${SUP.p.opcoes.tarifa}"></label>
                <details><summary>Variáveis nos gráficos (${REL.graficos.length ? REL.graficos.length + ' escolhidas' : 'automático: as que têm alarme, até 6'})</summary>
                    <div class="lista-check">${pls.filter(p => REL.plantas.includes(p.id)).flatMap(p => p.tags.filter(t => t.tipo !== 'estado').map(t => `<label class="campo-inline"><input type="checkbox" data-relgraf="${t.id}"${REL.graficos.includes(t.id) ? ' checked' : ''}> ${esc(t.nome)}</label>`)).join('')}</div></details>
            </div></div>
            <div class="botoes"><button type="button" class="btn btn-primary" data-acao="rel-gerar">Gerar prévia</button>
                <button type="button" class="btn btn-secondary" data-acao="rel-imprimir">🖨 Imprimir / PDF</button>
                <button type="button" class="btn btn-secondary" data-acao="rel-html">${icone('baixar')} HTML</button>
                <button type="button" class="btn btn-secondary" data-acao="rel-csv">${icone('baixar')} Dados do período (CSV)</button>
                <button type="button" class="btn btn-secondary" data-acao="rel-nuvem">${icone('nuvem')} Completar com a nuvem</button></div>
            <p class="nota" id="rel-aviso"></p></section>
            <div id="rel-previa" class="relatorio-previa">${REL.dados ? '' : vazio('Clique em "Gerar prévia".')}</div></div>`;
    },
    montar(raiz) {
        raiz.addEventListener('change', e => {
            const t = e.target;
            if (t.dataset.relpl) { REL.plantas = REL.plantas.filter(x => x !== t.dataset.relpl); if (t.checked) REL.plantas.push(t.dataset.relpl); }
            if (t.dataset.relsec) REL.secoes[t.dataset.relsec] = t.checked;
            if (t.dataset.relgraf) { REL.graficos = REL.graficos.filter(x => x !== t.dataset.relgraf); if (t.checked) REL.graficos.push(t.dataset.relgraf); }
            if (t.id === 'rel-de') REL.de = t.value; if (t.id === 'rel-ate') REL.ate = t.value;
        });
        if (REL.dados) mostrarPrevia();
    }
};
function opcoesRel() { const [t0, t1] = intervaloRelatorio(); if (!(t1 > t0)) throw new Error('período inválido'); return { t0, t1, plantas: REL.plantas, secoes: REL.secoes, graficos: REL.graficos }; }
function mostrarPrevia() { const alvo = $('#rel-previa'); if (alvo && REL.dados) alvo.innerHTML = `<style>${RELATORIO_CSS}</style>${corpoRelatorioSup(REL.dados, REL.o)}`; }
async function gerarRelatorio() {
    REL.o = opcoesRel();
    if (!REL.o.plantas.length) throw new Error('escolha pelo menos uma planta');
    avisar('Montando o relatório…', 'ok', 20000);
    await histDescarregar();
    REL.dados = await dadosRelatorio(REL.o);
    const semDados = REL.dados.plantas.every(P => !P.vars.length && !P.horas.some(x => x.h.trabalhando + x.h.vazio + x.h.desligado > 0));
    const av = $('#rel-aviso'); if (av) av.innerHTML = semDados ? 'O navegador não tem dados deste período. ' + (nuvemConectada() || emailLembrado() ? 'Use "Completar com a nuvem".' : 'Conecte a nuvem da equipe para trazer os dados passados.') : '';
    mostrarPrevia(); avisar('Relatório pronto.');
}
Object.assign(ACOES, {
    'rel-periodo': b => { REL.periodo = b.dataset.p; renderPagina(true); },
    'rel-gerar': gerarRelatorio,
    'rel-imprimir': async () => { if (!REL.dados) await gerarRelatorio(); window.print(); },
    'rel-html': async () => {
        if (!REL.dados) await gerarRelatorio();
        // logos embutidos para o arquivo abrir sozinho
        const embutir = async n => { try { const b = await (await fetch('img/' + n)).blob(); return await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); }); } catch (e) { return ''; } };
        const mapa = {}; for (const n of ['logo-inovaagro.png', 'logo-nimeq.png', 'logo-instagri.png', 'relatorio-fundo-capa.png']) mapa[n] = await embutir(n);
        baixarArquivo(new Blob([documentoRelatorioSup(REL.dados, REL.o, n => mapa[n] || '')], { type: 'text/html' }), `relatorio-${nomeSeguro(SUP.p.nome)}-${diaISO(REL.o.t0)}.html`);
    },
    'rel-csv': async () => {
        const o = opcoesRel(); const linhas = [];
        for (const pl of SUP.p.plantas.filter(p => o.plantas.includes(p.id))) for (const t of pl.tags) (await histPontos(t.id, o.t0, o.t1)).forEach(p => linhas.push([new Date(p[0]).toLocaleString('pt-BR'), p[0], pl.nome, t.nome, p[1], t.unidade]));
        linhas.sort((a, b) => a[1] - b[1]);
        baixarArquivo(new Blob([csvDe(linhas, ['data e hora', 't_ms', 'planta', 'variável', 'valor', 'unidade'])], { type: 'text/csv' }), `dados-${diaISO(o.t0)}-a-${diaISO(o.t1)}.csv`);
    },
    'rel-nuvem': async () => {
        const o = opcoesRel(); let tot = 0, dias = 0;
        for (const id of o.plantas) { const r = await trazerHistoricoNuvem(SUP.planta(id), o.t0, o.t1, dia => avisar('Baixando ' + dia + '…', 'ok', 20000)); tot += r.amostras; dias += r.dias; }
        avisar(dias ? `${dias} dia(s), ${tot.toLocaleString('pt-BR')} amostra(s) trazidas da nuvem.` : 'A nuvem não tem dados deste período.', 'ok', 6000);
        await gerarRelatorio();
    }
});
