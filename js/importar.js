/**
 * © 2026 Supervisório MQTT — Inova Agro UFPel EMBRAPII. Código aberto; cópias permitidas desde que citadas.
 *
 * IMPORTAR CSV DE OUTRO SISTEMA (planilha, registrador, CLP, outro supervisório) para o histórico do navegador.
 * Entende os dois jeitos comuns:
 *   LARGO:  data e hora; variável 1; variável 2; …        (uma linha por instante)
 *   LONGO:  data e hora; variável; valor                  (uma linha por leitura)
 * Separador ; , ou tabulação; vírgula ou ponto decimal; data dd/mm/aaaa hh:mm[:ss], aaaa-mm-dd[Thh:mm[:ss]] ou
 * número de época (s ou ms). Cada coluna/variável é casada com uma variável da planta (pelo nome, nome de variável
 * ou fim do tópico) ou vira uma variável nova; dá para ignorar. Repetir a importação não duplica.
 */

'use strict';

function separadorCsv(linha) { const c = { ';': 0, ',': 0, '\t': 0 }; for (const ch of linha) if (ch in c) c[ch]++; return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0]; }
function lerCsvSep(texto, sep) {
    const t = texto.replace(/^﻿/, ''); const linhas = []; let campo = '', linha = [], aspas = false;
    for (let i = 0; i < t.length; i++) {
        const c = t[i];
        if (aspas) { if (c === '"' && t[i + 1] === '"') { campo += '"'; i++; } else if (c === '"') aspas = false; else campo += c; continue; }
        if (c === '"') aspas = true; else if (c === sep) { linha.push(campo.trim()); campo = ''; }
        else if (c === '\n') { linha.push(campo.replace(/\r$/, '').trim()); if (linha.some(x => x !== '')) linhas.push(linha); linha = []; campo = ''; }
        else campo += c;
    }
    if (campo || linha.length) { linha.push(campo.replace(/\r$/, '').trim()); if (linha.some(x => x !== '')) linhas.push(linha); }
    return linhas;
}
/** Número com vírgula ou ponto decimal (e milhar). */
function numeroCsv(s) {
    s = String(s == null ? '' : s).trim();
    if (!s) return NaN;
    if (/^(true|ligado|on|sim)$/i.test(s)) return 1;
    if (/^(false|desligado|off|nao|não)$/i.test(s)) return 0;
    if (/,\d+$/.test(s) && !/\.\d+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,(?=\d{3}\b)/g, '');
    return /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s) ? parseFloat(s) : NaN;
}
/** Data e hora → ms (null se não for data). */
function dataCsv(s) {
    s = String(s || '').trim();
    let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2})(?:[.,](\d+))?)?)?$/.exec(s);
    if (m) { const a = +m[3] < 100 ? 2000 + +m[3] : +m[3]; return new Date(a, +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0), +((m[7] || '0') + '00').slice(0, 3)).getTime(); }
    m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(s);
    if (m) { const t = Date.parse(m[8] ? s.replace(' ', 'T') : `${m[1]}-${m[2]}-${m[3]}T${m[4] || '00'}:${m[5] || '00'}:${m[6] || '00'}${m[7] ? '.' + m[7].slice(0, 3) : ''}`); return Number.isFinite(t) ? t : null; }
    if (/^\d{10}(\.\d+)?$/.test(s)) return Math.round(parseFloat(s) * 1000);
    if (/^\d{13}$/.test(s)) return +s;
    return null;
}
/** Analisa o CSV: formato, coluna de tempo, séries (nome → [[t, v]]). */
function analisarCsv(texto) {
    const sep = separadorCsv(texto.split(/\r?\n/).find(l => l.trim()) || '');
    const linhas = lerCsvSep(texto, sep);
    if (linhas.length < 2) throw new Error('o arquivo não tem linhas de dados');
    const cab = linhas[0], dados = linhas.slice(1);
    const amostra = dados.slice(0, 30);
    const ehData = j => amostra.filter(l => dataCsv(l[j]) != null).length >= Math.max(1, amostra.length * 0.8);
    const ehNum = j => amostra.filter(l => Number.isFinite(numeroCsv(l[j]))).length >= Math.max(1, amostra.length * 0.6);
    let jt = cab.findIndex((h, j) => /data|hora|time|tempo|timestamp|quando|date/i.test(h) && ehData(j));
    if (jt < 0) jt = cab.findIndex((h, j) => ehData(j));
    if (jt < 0) throw new Error('não achei a coluna de data e hora');
    // data e hora em duas colunas (data; hora)
    let jh = -1;
    if (/^data$|^date$/i.test(cab[jt]) && /^(hora|time)$/i.test(cab[jt + 1] || '')) jh = jt + 1;
    const tempo = l => dataCsv(jh >= 0 ? `${l[jt]} ${l[jh]}` : l[jt]);
    const outras = cab.map((h, j) => j).filter(j => j !== jt && j !== jh);
    const textuais = outras.filter(j => !ehNum(j)), numericas = outras.filter(ehNum);
    const series = new Map();
    const pôr = (nome, t, v) => { if (t == null || !Number.isFinite(v)) return; let s = series.get(nome); if (!s) { s = []; series.set(nome, s); } s.push([t, v]); };
    let formato;
    if (textuais.length === 1 && numericas.length >= 1 && new Set(amostra.map(l => l[textuais[0]])).size < amostra.length) {
        formato = 'longo';
        const jn = textuais[0], jv = numericas.find(j => /valor|value|v$/i.test(cab[j])) ?? numericas[0];
        dados.forEach(l => pôr(l[jn], tempo(l), numeroCsv(l[jv])));
    } else {
        formato = 'largo';
        dados.forEach(l => { const t = tempo(l); numericas.forEach(j => pôr(cab[j] || `coluna ${j + 1}`, t, numeroCsv(l[j]))); });
    }
    series.forEach(s => s.sort((a, b) => a[0] - b[0]));
    const ts = [...series.values()].flat().map(p => p[0]);
    return { formato, separador: sep, linhas: dados.length, series, de: Math.min(...ts), ate: Math.max(...ts) };
}
/** Sugere a variável da planta para cada série (pelo nome, variável ou fim do tópico). */
function casarSerie(pl, nome) {
    const n = baseTopico(nome);
    return pl.tags.find(t => baseTopico(t.nome) === n || t.variavel === n || baseTopico(String(t.topico).split('/').pop()) === n || baseTopico(t.nome.split(' — ')[0]) === n) || null;
}
async function importarSeries(pl, series, mapa) {
    const am = [];
    for (const [nome, pts] of series) {
        let alvo = mapa.get(nome);
        if (alvo === 'ignorar') continue;
        if (alvo === 'nova' || !alvo) {
            const t = criarTag({ nome, tipo: typeof adivinharTipo === 'function' ? adivinharTipo(nome) : 'generico', topico: `importado/${baseTopico(nome)}` });
            pl.tags.push(t); garantirVariaveis(pl); alvo = t.id;
        }
        pts.forEach(([t, v]) => am.push({ g: alvo, t, v }));
    }
    const n = await histImportar(am);
    SUP.alterado('tag');
    return n;
}
function janelaImportarCsv(pl, nomeArq, a) {
    return new Promise(resolve => {
        const fundo = document.createElement('div'); fundo.className = 'janela-fundo';
        const series = [...a.series];
        fundo.innerHTML = `<form class="janela janela-larga"><h2>📥 Importar ${esc(nomeArq)}</h2>
            <p class="nota">Formato <b>${a.formato === 'largo' ? 'largo (uma coluna por variável)' : 'longo (variável e valor por linha)'}</b> · separador "${a.separador === '\t' ? 'tab' : esc(a.separador)}" · ${a.linhas} linhas · de ${dataHora(a.de)} até ${dataHora(a.ate)} · planta <b>${esc(pl.nome)}</b></p>
            <div class="tabela-rolar"><table class="tabela status-tabela"><thead><tr><th>No arquivo</th><th>Pontos</th><th>Vai para</th></tr></thead><tbody>
            ${series.map(([nome, pts], i) => { const s = casarSerie(pl, nome); return `<tr><td>${esc(nome)}</td><td>${pts.length}</td><td><select data-i="${i}"><option value="nova"${s ? '' : ' selected'}>➕ variável nova "${esc(nome)}"</option><option value="ignorar">— ignorar</option>${pl.tags.map(t => `<option value="${t.id}"${s && s.id === t.id ? ' selected' : ''}>${esc(t.nome)}</option>`).join('')}</select></td></tr>`; }).join('')}
            </tbody></table></div>
            <div class="janela-rodape"><button type="button" class="btn btn-secondary" data-i="cancelar">Cancelar</button><button type="submit" class="btn btn-primary">Importar</button></div></form>`;
        document.body.appendChild(fundo);
        const fim = v => { fundo.remove(); resolve(v); };
        fundo.querySelector('[data-i=cancelar]').addEventListener('click', () => fim(null));
        fundo.querySelector('form').addEventListener('submit', e => { e.preventDefault(); const m = new Map(); fundo.querySelectorAll('select[data-i]').forEach(s => m.set(series[+s.dataset.i][0], s.value)); fim(m); });
    });
}
if (typeof ACOES !== 'undefined') ACOES['importar-csv'] = async () => {
    const pl = SUP.planta(($('#nv-pl') || {}).value) || SUP.p.plantas[0];
    if (!pl) throw new Error('crie uma planta primeiro');
    const arq = await escolherArquivo('.csv,.txt,.tsv');
    if (!arq) return;
    const a = analisarCsv(await arq.text());
    const mapa = await janelaImportarCsv(pl, arq.name, a);
    if (!mapa) return;
    const n = await importarSeries(pl, a.series, mapa);
    logar('sistema', `CSV importado (${arq.name}): ${n} pontos`, pl.nome);
    avisar(`${n.toLocaleString('pt-BR')} ponto(s) importado(s). Veja em Gráficos (de ${dataHora(a.de)} até ${dataHora(a.ate)}).`, 'ok', 8000);
};
