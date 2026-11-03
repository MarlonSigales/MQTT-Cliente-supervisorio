/**
 * © 2026 Supervisório MQTT — Inova Agro UFPel EMBRAPII. Código aberto; cópias permitidas desde que citadas.
 *
 * SECAGEM POR LOTE: início e fim de cada carga do secador (à mão ou automático pelo ventilador), e o resumo do lote a
 * partir do histórico: umidade média de entrada e de saída, massa (integral da vazão ou informada), água evaporada,
 * combustível (diferença do totalizador) e energia (integral da potência ou diferença do medidor), com os indicadores
 * de eficiência por tonelada seca. Relatório por lote (imprimir/PDF) e CSV de todos.
 *   pl.secagem = { ativo, eqId, tagUgEnt, tagUgSai, tagVazao, tagComb, unComb, tagEnergia, tagPotencia, tagTar, tagTmassa,
 *                  auto: true/false, tagEstado }      pl.lotes = [{ id, nome, inicio, fim, massaInformada, obs, resumo }]
 * Massa seca = massa úmida × (100 − U entrada) / (100 − U saída); água = massa úmida − massa seca (base úmida).
 */

'use strict';

function lotesAtivo(pl) { return !!(pl && pl.secagem && pl.secagem.ativo); }
function loteAberto(pl) { return (pl.lotes || []).find(l => !l.fim) || null; }
function iniciarLote(pl, nome = '', t = Date.now()) {
    if (loteAberto(pl)) throw new Error('já existe um lote aberto; encerre antes');
    pl.lotes = pl.lotes || [];
    const n = pl.lotes.length + 1;
    const l = { id: uid('lote'), nome: nome || `Lote ${n} — ${new Date(t).toLocaleDateString('pt-BR')}`, inicio: t, fim: null, massaInformada: null, obs: '', resumo: null };
    pl.lotes.push(l);
    logar('estado', `Secagem: início do ${l.nome}`, pl.nome);
    SUP.alterado('pl');
    return l;
}
async function encerrarLote(pl, t = Date.now()) {
    const l = loteAberto(pl);
    if (!l) throw new Error('não há lote aberto');
    l.fim = t;
    l.resumo = await resumoLote(pl, l);
    logar('estado', `Secagem: fim do ${l.nome} (${formatarNumero(l.resumo.massaUmida, 1)} t, ${formatarNumero(l.resumo.ugEnt, 1)} → ${formatarNumero(l.resumo.ugSai, 1)} %)`, pl.nome);
    SUP.alterado('pl');
    return l;
}
/** Integral (trapézio, com buracos de no máximo 10 min) de pontos [t, v] em v·h. */
function integralHoras(pts, t0, t1) {
    let s = 0;
    for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const ta = Math.max(a[0], t0), tb = Math.min(b[0], t1);
        if (tb <= ta || b[0] - a[0] > 600000) continue;
        s += (a[1] + b[1]) / 2 * (tb - ta) / 3600000;
    }
    return s;
}
async function serie(id, t0, t1) { if (!id) return []; const ant = await histAnterior(id, t0); const p = await histPontos(id, t0, t1); return ant && (!p.length || p[0][0] > t0) ? [[t0, ant[1]], ...p] : p; }
async function delta(id, t0, t1) {
    if (!id) return null;
    const a = await histAnterior(id, t0 + 1), p = await histPontos(id, t0, t1);
    const ini = a ? a[1] : (p[0] && p[0][1]), fim = p.length ? p[p.length - 1][1] : null;
    return ini != null && fim != null ? Math.max(0, fim - ini) : null;
}
/** Resumo do lote (também serve para o lote ainda aberto, até agora). */
async function resumoLote(pl, l) {
    const c = pl.secagem || {}, t0 = l.inicio, t1 = l.fim || Date.now();
    await histDescarregar();
    const est = async id => { const p = await serie(id, t0, t1); return p.length ? estatisticas(p) : null; };
    const [eUe, eUs, eTar, eTm] = await Promise.all([est(c.tagUgEnt), est(c.tagUgSai), est(c.tagTar), est(c.tagTmassa)]);
    const vaz = await serie(c.tagVazao, t0, t1);
    const massaMedida = vaz.length ? integralHoras(vaz, t0, t1) : null;
    const informada = l.massaInformada === '' || l.massaInformada == null ? null : num(l.massaInformada, null);
    const massaUmida = informada != null && informada > 0 ? informada : massaMedida;
    const ugEnt = eUe ? eUe.media : null, ugSai = eUs ? eUs.media : null;
    const massaSeca = massaUmida != null && ugEnt != null && ugSai != null ? massaUmida * (100 - ugEnt) / (100 - ugSai) : null;
    const agua = massaUmida != null && massaSeca != null ? (massaUmida - massaSeca) * 1000 : null;
    const comb = await delta(c.tagComb, t0, t1);
    let energia = await delta(c.tagEnergia, t0, t1);
    if (energia == null && c.tagPotencia) { const p = await serie(c.tagPotencia, t0, t1); energia = p.length ? integralHoras(p, t0, t1) : null; }
    const horas = (t1 - t0) / 3600000;
    const por = (x, m) => (x != null && m ? x / m : null);
    return { horas, ugEnt, ugSai, pontos: ugEnt != null && ugSai != null ? ugEnt - ugSai : null, massaUmida, massaMedida, massaSeca, agua,
        comb, unComb: c.unComb || '', energia, tarMedia: eTar ? eTar.media : null, tMassaMax: eTm ? eTm.max : null,
        combPorT: por(comb, massaSeca), kwhPorT: por(energia, massaSeca), aguaPorH: por(agua, horas), combPorKgAgua: por(comb, agua), atualizado: Date.now() };
}
/** Automático: liga o ventilador → abre lote; desligado por mais de 10 min → encerra. */
let _lotesEst = new Map();
function lotesCiclo() {
    for (const pl of SUP.p.plantas) {
        const c = pl.secagem;
        if (!lotesAtivo(pl) || !c.auto || !c.tagEstado || (typeof ehGemeo === 'function' && ehGemeo(pl))) continue;
        const v = valorTag(c.tagEstado), r = _lotesEst.get(pl.id) || { v: null, desde: Date.now() };
        if (v == null) continue;
        if (r.v !== v) { r.v = v; r.desde = Date.now(); }
        _lotesEst.set(pl.id, r);
        const aberto = loteAberto(pl);
        if (v === 1 && !aberto) { try { iniciarLote(pl, '', r.desde); } catch (e) { /* ok */ } }
        if (v === 0 && aberto && Date.now() - r.desde > 600000) encerrarLote(pl, r.desde).catch(() => {});
    }
}

// ---------------------------------------------------------------- tela e relatório
const fmt = (v, d = 1, un = '') => (v == null || !Number.isFinite(v) ? '—' : formatarNumero(v, d) + (un ? ' ' + un : ''));
function linhasResumo(r) {
    return [['Duração', fmt(r.horas, 1, 'h')], ['Umidade de entrada (média)', fmt(r.ugEnt, 1, '%')], ['Umidade de saída (média)', fmt(r.ugSai, 1, '%')], ['Pontos removidos', fmt(r.pontos, 1, 'p.p.')],
        ['Massa úmida', fmt(r.massaUmida, 1, 't')], ['Massa seca', fmt(r.massaSeca, 1, 't')], ['Água evaporada', fmt(r.agua, 0, 'kg')], ['Água por hora', fmt(r.aguaPorH, 0, 'kg/h')],
        ['Combustível', fmt(r.comb, 2, r.unComb)], ['Combustível por t seca', fmt(r.combPorT, 3, r.unComb + '/t')], ['Energia elétrica', fmt(r.energia, 1, 'kWh')], ['Energia por t seca', fmt(r.kwhPorT, 2, 'kWh/t')],
        ['Ar de secagem (média)', fmt(r.tarMedia, 1, '°C')], ['Massa de grãos (máx.)', fmt(r.tMassaMax, 1, '°C')]];
}
function relatorioLoteHtml(pl, l) {
    const r = l.resumo || {};
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(l.nome)}</title><style>
        body{font:14px system-ui,sans-serif;color:#1d2b2b;margin:32px;max-width:760px} h1{font-size:20px;margin:0 0 4px} p{color:#5f6f6d;margin:0 0 16px}
        table{border-collapse:collapse;width:100%} td{padding:6px 8px;border-bottom:1px solid #e6edeb} td:last-child{text-align:right;font-variant-numeric:tabular-nums;font-weight:600}
        footer{margin-top:24px;font-size:11px;color:#5f6f6d}</style></head><body>
        <h1>${esc(l.nome)}</h1><p>${esc(pl.nome)} · ${esc(SUP.p.relatorio.empresa || '')} · ${new Date(l.inicio).toLocaleString('pt-BR')} até ${l.fim ? new Date(l.fim).toLocaleString('pt-BR') : 'em andamento'}</p>
        <table>${linhasResumo(r).map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join('')}</table>
        ${l.obs ? `<p style="margin-top:16px">Observações: ${esc(l.obs)}</p>` : ''}
        <footer>Massa seca = massa úmida × (100 − U entrada) / (100 − U saída), umidade em base úmida. Gerado pelo Supervisório MQTT em ${new Date().toLocaleString('pt-BR')}. © 2026 Supervisório MQTT — Inova Agro UFPel EMBRAPII.</footer>
        <script>window.onload=()=>window.print()</script></body></html>`;
}
function csvLotes(pl) {
    const cab = ['lote', 'início', 'fim', 'horas', 'U entrada %', 'U saída %', 'massa úmida t', 'massa seca t', 'água kg', `combustível ${pl.secagem.unComb || ''}`, 'combustível/t seca', 'energia kWh', 'kWh/t seca', 'ar médio °C', 'massa máx °C', 'observações'];
    return csvDe((pl.lotes || []).filter(l => l.resumo).map(l => { const r = l.resumo; return [l.nome, new Date(l.inicio).toLocaleString('pt-BR'), l.fim ? new Date(l.fim).toLocaleString('pt-BR') : '', r.horas, r.ugEnt, r.ugSai, r.massaUmida, r.massaSeca, r.agua, r.comb, r.combPorT, r.energia, r.kwhPorT, r.tarMedia, r.tMassaMax, l.obs]; }), cab);
}
if (typeof PAGINAS !== 'undefined') {
    PAGINAS.lotes = {
        titulo: 'Lotes de secagem',
        render(id) {
            const pls = SUP.p.plantas;
            const pl = SUP.planta(id) || pls.find(lotesAtivo) || pls[0];
            if (!pl) return `<div class="container">${vazio('Crie uma planta primeiro.')}</div>`;
            const c = pl.secagem = pl.secagem || {};
            const ab = loteAberto(pl), ls = (pl.lotes || []).slice().reverse();
            const sel = (k, filtro, vazioTxt = '—') => `<select data-ref="pl:${pl.id}.secagem.${k}">${optsTags(pl, c[k], filtro, vazioTxt)}</select>`;
            const tipo = (...ts) => t => ts.includes(t.tipo);
            return `<div class="container">${cabecalho(`${icone('umidade_grao')} Lotes de secagem`, 'Cada carga do secador vira um lote com umidade de entrada e saída, massa, água evaporada, combustível e energia por tonelada seca.',
                `<select id="lotes-pl" aria-label="Planta">${pls.map(p => `<option value="${p.id}"${p === pl ? ' selected' : ''}>${esc(p.nome)}</option>`).join('')}</select>`)}
                <section class="card"><div class="card-topo"><h2>Lote atual</h2>${ab ? `<span class="chip-con con-conectado"><i class="ponto-con con-conectado"></i>aberto desde ${dataHora(ab.inicio)}</span>` : '<span class="contador">nenhum lote aberto</span>'}</div>
                    ${ab ? `<div class="grade-campos grade-estreita"><label>Nome <input type="text" data-ref="lote:${pl.id}:${ab.id}.nome" value="${escAttr(ab.nome)}"></label><label>Massa informada (t) <input type="number" step="any" data-ref="lote:${pl.id}:${ab.id}.massaInformada" value="${ab.massaInformada ?? ''}" placeholder="vazio = pela vazão"></label><label class="largo">Observações <input type="text" data-ref="lote:${pl.id}:${ab.id}.obs" value="${escAttr(ab.obs)}"></label></div>
                        <div id="lote-parcial" class="lote-resumo"><p class="nota">Calculando…</p></div>` : ''}
                    <div class="botoes">${ab ? `<button type="button" class="btn btn-primary btn-sm" data-acao="lote-encerrar" data-pl="${pl.id}">Encerrar o lote</button>` : `<button type="button" class="btn btn-primary btn-sm" data-acao="lote-iniciar" data-pl="${pl.id}"${c.ativo ? '' : ' disabled title="Ligue e configure abaixo"'}>Iniciar lote</button>`}</div></section>
                <section class="card"><div class="card-topo"><h2>Lotes (${ls.length})</h2>${ls.some(l => l.resumo) ? `<button type="button" class="btn btn-secondary btn-sm" data-acao="lotes-csv" data-pl="${pl.id}">${icone('baixar')} CSV</button>` : ''}</div>
                    ${ls.filter(l => l.fim).length ? `<div class="tabela-rolar"><table class="tabela status-tabela"><thead><tr><th>Lote</th><th>Início</th><th>Horas</th><th>U ent. → saída</th><th>t seca</th><th>Comb./t</th><th>kWh/t</th><th></th></tr></thead><tbody>
                        ${ls.filter(l => l.fim).map(l => { const r = l.resumo || {}; return `<tr><td>${esc(l.nome)}</td><td>${dataHora(l.inicio)}</td><td>${fmt(r.horas)}</td><td>${fmt(r.ugEnt)} → ${fmt(r.ugSai)} %</td><td>${fmt(r.massaSeca)}</td><td>${fmt(r.combPorT, 3, r.unComb)}</td><td>${fmt(r.kwhPorT, 2)}</td><td><button type="button" class="btn btn-secondary btn-sm" data-acao="lote-relatorio" data-pl="${pl.id}" data-lote="${l.id}">Relatório</button></td></tr>`; }).join('')}</tbody></table></div>` : vazio('Nenhum lote encerrado ainda.')}</section>
                <section class="card"><h2>Configuração</h2>
                    <label class="campo-inline"><input type="checkbox" data-ref="pl:${pl.id}.secagem.ativo"${c.ativo ? ' checked' : ''} data-rerender> Registrar lotes de secagem nesta planta</label>
                    <div class="grade-campos">
                        <label>Secador <select data-ref="pl:${pl.id}.secagem.eqId">${optsEquip(pl, c.eqId)}</select></label>
                        <label>Umidade de entrada ${sel('tagUgEnt', tipo('umidade_grao', 'umidade'))}</label>
                        <label>Umidade de saída ${sel('tagUgSai', tipo('umidade_grao', 'umidade'))}</label>
                        <label>Vazão de grãos (t/h) ${sel('tagVazao', tipo('vazao'), '— (informar a massa)')}</label>
                        <label>Combustível (totalizador) ${sel('tagComb', () => true, '— (sem combustível)')}</label>
                        <label>Unidade do combustível <input type="text" data-ref="pl:${pl.id}.secagem.unComb" value="${escAttr(c.unComb || '')}" placeholder="m³ de lenha, kg de GLP"></label>
                        <label>Energia (medidor kWh) ${sel('tagEnergia', tipo('energia'), '— (usar a potência)')}</label>
                        <label>ou Potência (kW) ${sel('tagPotencia', tipo('potencia'))}</label>
                        <label>Temperatura do ar ${sel('tagTar', tipo('temperatura'))}</label>
                        <label>Temperatura da massa ${sel('tagTmassa', tipo('temperatura'))}</label>
                        <label class="campo-inline largo"><input type="checkbox" data-ref="pl:${pl.id}.secagem.auto"${c.auto ? ' checked' : ''}> Abrir e fechar o lote sozinho pelo estado:</label>
                        <label>Estado (1 = secando) ${sel('tagEstado', tipo('estado'))}</label></div>
                    <p class="nota">Desligado por mais de 10 min encerra o lote. Sem vazão, informe a massa no lote aberto.</p></section></div>`;
        },
        montar(raiz) {
            const s = $('#lotes-pl', raiz); if (s) s.addEventListener('change', () => { location.hash = '#/lotes/' + s.value; });
            const alvo = $('#lote-parcial', raiz);
            const pl = SUP.planta(s && s.value), ab = pl && loteAberto(pl);
            if (alvo && ab) resumoLote(pl, ab).then(r => { alvo.innerHTML = `<dl>${linhasResumo(r).map(([a, b]) => `<div><dt>${esc(a)}</dt><dd>${esc(b)}</dd></div>`).join('')}</dl>`; });
        }
    };
    Object.assign(ACOES, {
        'lote-iniciar': async b => { const pl = SUP.planta(b.dataset.pl); const n = await confirmar('Iniciar lote', 'O lote começa agora.', { botao: 'Iniciar', campo: { rotulo: 'Nome (opcional)', valor: '' } }); if (n == null) return; iniciarLote(pl, String(n).trim()); renderPagina(true); },
        'lote-encerrar': async b => { const pl = SUP.planta(b.dataset.pl); if (!(await confirmar('Encerrar o lote?', 'O resumo é calculado pelo histórico até agora.', { botao: 'Encerrar' }))) return; const l = await encerrarLote(pl); renderPagina(true); avisar(`${l.nome} encerrado.`); },
        'lote-relatorio': b => { const pl = SUP.planta(b.dataset.pl), l = pl.lotes.find(x => x.id === b.dataset.lote); const w = window.open(URL.createObjectURL(new Blob([relatorioLoteHtml(pl, l)], { type: 'text/html' })), '_blank'); if (!w) avisar('O navegador bloqueou a janela: permita pop-ups para este site.', 'erro'); },
        'lotes-csv': b => { const pl = SUP.planta(b.dataset.pl); baixarArquivo(new Blob([csvLotes(pl)], { type: 'text/csv' }), `lotes-${nomeSeguro(pl.nome)}.csv`); }
    });
}
