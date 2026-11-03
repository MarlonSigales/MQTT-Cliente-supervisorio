/**
 * © 2026 Supervisório MQTT — Inova Agro UFPel EMBRAPII. Código aberto; cópias permitidas desde que citadas.
 *
 * TÓPICOS EM LOTE: uma mensagem com várias leituras.
 *  - JSON: {"t1": 21.5, "motor": {"i": 8.2, "on": true}} → uma variável por campo (caminho "motor.i").
 *  - Sparkplug B (Eclipse Tahu, protobuf): spBv1.0/<grupo>/<NBIRTH|NDATA|DBIRTH|DDATA>/<nó>[/<dispositivo>].
 *    A variável aponta para o tópico de DADOS (NDATA/DDATA) e usa o nome da métrica como "caminho". O supervisório
 *    também assina o BIRTH correspondente: é nele que vêm os nomes e os apelidos (alias) das métricas — os DATA
 *    seguintes podem trazer só o apelido. Só leitura (o supervisório não publica NCMD/DCMD).
 * Decodificador protobuf mínimo, sem biblioteca: campos do Payload (timestamp 1, metrics 2, seq 3) e do Metric
 * (name 1, alias 2, timestamp 3, datatype 4, is_null 7, int 10, long 11, float 12, double 13, boolean 14, string 15).
 */

'use strict';

const SP_TIPOS = { 1: 'Int8', 2: 'Int16', 3: 'Int32', 4: 'Int64', 5: 'UInt8', 6: 'UInt16', 7: 'UInt32', 8: 'UInt64', 9: 'Float', 10: 'Double', 11: 'Boolean', 12: 'String', 13: 'DateTime', 14: 'Text' };
const SP_ALIAS = new Map();            // "grupo/nó[/dispositivo]" → Map(alias → nome)

function _pbLer(b) {
    let i = 0;
    const varint = () => { let r = 0n, s = 0n, x; do { x = b[i++]; r |= BigInt(x & 127) << s; s += 7n; } while (x & 128 && i < b.length); return r; };
    const campos = [];
    while (i < b.length) {
        const ch = Number(varint()), num = ch >> 3, tipo = ch & 7;
        if (tipo === 0) campos.push({ num, tipo, v: varint() });
        else if (tipo === 1) { campos.push({ num, tipo, b: b.subarray(i, i + 8) }); i += 8; }
        else if (tipo === 2) { const n = Number(varint()); campos.push({ num, tipo, b: b.subarray(i, i + n) }); i += n; }
        else if (tipo === 5) { campos.push({ num, tipo, b: b.subarray(i, i + 4) }); i += 4; }
        else throw new Error('protobuf inválido');
    }
    return campos;
}
const _dv = b => new DataView(b.buffer, b.byteOffset, b.byteLength);
/** Decodifica o Payload do Sparkplug B. */
function decodificarSparkplug(bytes) {
    const out = { timestamp: null, seq: null, metricas: [] };
    for (const c of _pbLer(bytes)) {
        if (c.num === 1 && c.tipo === 0) out.timestamp = Number(c.v);
        else if (c.num === 3 && c.tipo === 0) out.seq = Number(c.v);
        else if (c.num === 2 && c.tipo === 2) {
            const m = { nome: null, alias: null, tipo: null, valor: null, nulo: false };
            for (const f of _pbLer(c.b)) {
                if (f.num === 1) m.nome = _dec.decode(f.b);
                else if (f.num === 2) m.alias = Number(f.v);
                else if (f.num === 4) m.tipo = Number(f.v);
                else if (f.num === 7) m.nulo = !!Number(f.v);
                else if (f.num === 10) m.valor = Number(m.tipo >= 1 && m.tipo <= 3 ? BigInt.asIntN(32, f.v) : BigInt.asUintN(32, f.v));
                else if (f.num === 11) m.valor = Number(m.tipo === 4 ? BigInt.asIntN(64, f.v) : f.v);
                else if (f.num === 12) m.valor = _dv(f.b).getFloat32(0, true);
                else if (f.num === 13) m.valor = _dv(f.b).getFloat64(0, true);
                else if (f.num === 14) m.valor = Number(f.v) ? 1 : 0;
                else if (f.num === 15) m.valor = _dec.decode(f.b);
            }
            out.metricas.push(m);
        }
    }
    return out;
}
/** Partes do tópico Sparkplug, ou null. */
function topicoSparkplug(topico) {
    const p = String(topico).split('/');
    if (p[0] !== 'spBv1.0' || p.length < 4) return null;
    return { grupo: p[1], tipo: p[2], no: p[3], dispositivo: p[4] || '', chave: p.slice(1, 2).concat(p.slice(3)).join('/') };
}
/** Tópico de dados (NDATA/DDATA) que corresponde a um BIRTH/DATA. */
function topicoDadosSparkplug(topico) { const s = topicoSparkplug(topico); if (!s) return null; const tipo = s.dispositivo ? 'DDATA' : 'NDATA'; return ['spBv1.0', s.grupo, tipo, s.no].concat(s.dispositivo ? [s.dispositivo] : []).join('/'); }
function topicoNascimentoSparkplug(topicoDados) { return topicoDados.replace(/\/(N|D)DATA\//, (m, x) => `/${x}BIRTH/`); }
/** Lê uma mensagem Sparkplug: devolve { dados: tópico DATA, valores: Map nome → número } (aprende os apelidos no BIRTH). */
function lerSparkplug(topico, bytes) {
    const s = topicoSparkplug(topico);
    if (!s || !/^(N|D)(BIRTH|DATA)$/.test(s.tipo)) return null;
    let d; try { d = decodificarSparkplug(bytes); } catch (e) { return null; }
    let apelidos = SP_ALIAS.get(s.chave);
    if (!apelidos || /BIRTH$/.test(s.tipo)) { apelidos = new Map(); SP_ALIAS.set(s.chave, apelidos); }
    const valores = new Map();
    for (const m of d.metricas) {
        if (m.nome != null && m.alias != null) apelidos.set(m.alias, m.nome);
        const nome = m.nome != null ? m.nome : apelidos.get(m.alias);
        if (nome == null || m.nulo) continue;
        const v = typeof m.valor === 'string' ? parseFloat(m.valor.replace(',', '.')) : m.valor;
        if (Number.isFinite(v)) valores.set(nome, v);
    }
    return { dados: topicoDadosSparkplug(topico), valores, timestamp: d.timestamp, tipo: s.tipo };
}
/** Codificador (para testes e para a planta virtual): métricas [{nome, alias, tipo: 'Double'|'Int32'|'Boolean'..., valor}]. */
function codificarSparkplug(metricas, seq = 0, ts = Date.now()) {
    const vint = n => { let x = BigInt(n); const o = []; do { let b = Number(x & 127n); x >>= 7n; if (x) b |= 128; o.push(b); } while (x); return o; };
    const chave = (num, tipo) => vint((num << 3) | tipo);
    const ld = (num, bytes) => [...chave(num, 2), ...vint(bytes.length), ...bytes];
    const tipoNum = t => +Object.keys(SP_TIPOS).find(k => SP_TIPOS[k] === t) || 10;
    const met = metricas.map(m => {
        const t = tipoNum(m.tipo || 'Double'), o = [];
        if (m.nome != null) o.push(...ld(1, [..._enc.encode(m.nome)]));
        if (m.alias != null) o.push(...chave(2, 0), ...vint(m.alias));
        o.push(...chave(4, 0), ...vint(t));
        if (t === 9) { const b = new Uint8Array(4); new DataView(b.buffer).setFloat32(0, m.valor, true); o.push(...chave(12, 5), ...b); }
        else if (t === 10) { const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, m.valor, true); o.push(...chave(13, 1), ...b); }
        else if (t === 11) o.push(...chave(14, 0), ...vint(m.valor ? 1 : 0));
        else if (t === 4 || t === 8) o.push(...chave(11, 0), ...vint(BigInt.asUintN(64, BigInt(Math.round(m.valor)))));
        else if (t === 12 || t === 14) o.push(...ld(15, [..._enc.encode(String(m.valor))]));
        else o.push(...chave(10, 0), ...vint(BigInt.asUintN(32, BigInt(Math.round(m.valor)))));
        return o;
    });
    return new Uint8Array([...chave(1, 0), ...vint(ts), ...met.flatMap(o => ld(2, o)), ...chave(3, 0), ...vint(seq)]);
}
/** Campos numéricos de um JSON (para criar uma variável por campo). */
function camposJson(o, pre = '', out = []) {
    if (out.length >= 80) return out;
    if (Array.isArray(o)) o.forEach((x, i) => camposJson(x, `${pre}[${i}]`, out));
    else if (o && typeof o === 'object') Object.entries(o).forEach(([k, x]) => camposJson(x, pre ? `${pre}.${k}` : k, out));
    else if (typeof o === 'number' || typeof o === 'boolean' || (typeof o === 'string' && /^[-+]?\d+([.,]\d+)?$/.test(o.trim()))) out.push(pre);
    return out;
}
/** Campos (caminhos ou métricas) de uma mensagem, para a tela "Descobrir". */
function camposDaMensagem(topico, bytes) {
    if (topicoSparkplug(topico)) { const r = lerSparkplug(topico, bytes); return r ? [...r.valores.keys()] : []; }
    const txt = _dec.decode(bytes).trim();
    if (!/^[{[]/.test(txt)) return [];
    try { const c = camposJson(JSON.parse(txt)); return c.length > 1 ? c : []; } catch (e) { return []; }
}
if (typeof module !== 'undefined') module.exports = { decodificarSparkplug, codificarSparkplug, lerSparkplug, camposJson };
