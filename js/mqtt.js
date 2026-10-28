/**
 * © 2026 Supervisório MQTT — Inova Agro UFPel EMBRAPII. Código aberto; cópias permitidas desde que citadas.
 *
 * CLIENTE MQTT 3.1.1 SOBRE WEBSOCKET, sem biblioteca externa. O navegador só fala MQTT por WebSocket:
 * use a porta WebSocket do broker (EMQX: 8083 ws:// e 8084 wss://, caminho /mqtt; Mosquitto: a porta do "listener ... websockets").
 * Página aberta em https (GitHub Pages) só conecta em wss:// (o navegador bloqueia ws:// em página segura).
 *
 *  Recebe QoS 0, 1 e 2; publica QoS 0 e 1 (QoS 2 é enviado como 1). Reconecta sozinho e refaz as assinaturas.
 *  Last Will (LWT): ao cair, o broker publica "offline" em <prefixo>/supervisorio/status — o equipamento de campo
 *  pode usar isso para voltar ao modo seguro.
 *
 * Também traz o BrokerLocal (broker dentro da página) usado pelo modo de demonstração/simulação.
 */

'use strict';

const MQTT_TIPO = { CONNECT: 1, CONNACK: 2, PUBLISH: 3, PUBACK: 4, PUBREC: 5, PUBREL: 6, PUBCOMP: 7, SUBSCRIBE: 8, SUBACK: 9,
    UNSUBSCRIBE: 10, UNSUBACK: 11, PINGREQ: 12, PINGRESP: 13, DISCONNECT: 14 };
const MQTT_CONNACK = { 1: 'versão do protocolo recusada', 2: 'identificador do cliente recusado', 3: 'servidor indisponível',
    4: 'usuário ou senha incorretos', 5: 'sem autorização' };

const _enc = new TextEncoder(), _dec = new TextDecoder();

/** O filtro de assinatura (com + e #) casa com o tópico? */
function topicoCasa(filtro, topico) {
    if (filtro === topico) return true;
    const f = filtro.split('/'), t = topico.split('/');
    if (t[0] && t[0].startsWith('$') && (f[0] === '#' || f[0] === '+')) return false;
    for (let i = 0; i < f.length; i++) {
        if (f[i] === '#') return true;
        if (i >= t.length) return false;
        if (f[i] !== '+' && f[i] !== t[i]) return false;
    }
    return f.length === t.length;
}

// ---------------------------------------------------------------- codificação dos pacotes
function mqttTexto(s) { const b = _enc.encode(String(s)); const o = new Uint8Array(2 + b.length); o[0] = b.length >> 8; o[1] = b.length & 255; o.set(b, 2); return o; }
function mqttBytes(b) { const o = new Uint8Array(2 + b.length); o[0] = b.length >> 8; o[1] = b.length & 255; o.set(b, 2); return o; }
function mqttU16(n) { return new Uint8Array([n >> 8, n & 255]); }
function juntar(partes) { const n = partes.reduce((s, p) => s + p.length, 0); const o = new Uint8Array(n); let k = 0; partes.forEach(p => { o.set(p, k); k += p.length; }); return o; }
function mqttPacote(tipo, flags, corpo) {
    const tam = []; let x = corpo.length;
    do { let d = x % 128; x = Math.floor(x / 128); if (x > 0) d |= 128; tam.push(d); } while (x > 0);
    return juntar([new Uint8Array([(tipo << 4) | flags]), new Uint8Array(tam), corpo]);
}
function paraBytes(payload) {
    if (payload instanceof Uint8Array) return payload;
    if (payload == null) return new Uint8Array(0);
    if (typeof payload === 'object') return _enc.encode(JSON.stringify(payload));
    return _enc.encode(String(payload));
}
function pacoteConnect(o) {
    let flags = 0x02;
    const carga = [mqttTexto(o.clientId)];
    if (o.will) { flags |= 0x04 | ((o.will.qos || 0) << 3) | (o.will.retain ? 0x20 : 0); carga.push(mqttTexto(o.will.topic), mqttBytes(paraBytes(o.will.payload))); }
    if (o.usuario) { flags |= 0x80; carga.push(mqttTexto(o.usuario)); }
    if (o.usuario && o.senha) { flags |= 0x40; carga.push(mqttBytes(_enc.encode(o.senha))); }
    return mqttPacote(MQTT_TIPO.CONNECT, 0, juntar([mqttTexto('MQTT'), new Uint8Array([4, flags]), mqttU16(o.keepalive || 30), ...carga]));
}
function pacotePublish(topico, payload, qos, retain, id, dup) {
    const partes = [mqttTexto(topico)];
    if (qos > 0) partes.push(mqttU16(id));
    partes.push(paraBytes(payload));
    return mqttPacote(MQTT_TIPO.PUBLISH, (dup ? 8 : 0) | (qos << 1) | (retain ? 1 : 0), juntar(partes));
}

/** Lê pacotes completos de um buffer acumulado. Devolve { pacotes, resto }. */
function lerPacotes(buf) {
    const pacotes = []; let i = 0;
    while (i < buf.length) {
        if (buf.length - i < 2) break;
        let mult = 1, tam = 0, k = i + 1, b;
        do { if (k >= buf.length) return { pacotes, resto: buf.slice(i) }; b = buf[k++]; tam += (b & 127) * mult; mult *= 128; } while (b & 128);
        if (k + tam > buf.length) break;
        const tipo = buf[i] >> 4, flags = buf[i] & 15, corpo = buf.subarray(k, k + tam);
        pacotes.push(decodificar(tipo, flags, corpo));
        i = k + tam;
    }
    return { pacotes, resto: buf.slice(i) };
}
function decodificar(tipo, flags, c) {
    const u16 = j => (c[j] << 8) | c[j + 1];
    const p = { tipo, flags };
    if (tipo === MQTT_TIPO.CONNACK) { p.sessao = c[0] & 1; p.codigo = c[1]; }
    else if (tipo === MQTT_TIPO.PUBLISH) {
        p.qos = (flags >> 1) & 3; p.retain = !!(flags & 1); p.dup = !!(flags & 8);
        const n = u16(0); p.topico = _dec.decode(c.subarray(2, 2 + n)); let j = 2 + n;
        if (p.qos > 0) { p.id = u16(j); j += 2; }
        p.payload = c.slice(j);
    } else if ([MQTT_TIPO.PUBACK, MQTT_TIPO.PUBREC, MQTT_TIPO.PUBREL, MQTT_TIPO.PUBCOMP, MQTT_TIPO.UNSUBACK].includes(tipo)) p.id = u16(0);
    else if (tipo === MQTT_TIPO.SUBACK) { p.id = u16(0); p.codigos = [...c.subarray(2)]; }
    else if (tipo === MQTT_TIPO.CONNECT) {
        // usado só pelo broker de teste (tests/broker-ws.js reaproveita este decodificador)
        let j = 0; const n = u16(j); j += 2 + n; p.nivel = c[j++]; const fl = c[j++]; p.keepalive = u16(j); j += 2;
        const lerTxt = () => { const m = u16(j); const s = _dec.decode(c.subarray(j + 2, j + 2 + m)); j += 2 + m; return s; };
        const lerBin = () => { const m = u16(j); const s = c.slice(j + 2, j + 2 + m); j += 2 + m; return s; };
        p.clientId = lerTxt();
        if (fl & 4) p.will = { topic: lerTxt(), payload: lerBin(), qos: (fl >> 3) & 3, retain: !!(fl & 0x20) };
        if (fl & 0x80) p.usuario = lerTxt();
        if (fl & 0x40) p.senha = _dec.decode(lerBin());
    } else if (tipo === MQTT_TIPO.SUBSCRIBE || tipo === MQTT_TIPO.UNSUBSCRIBE) {
        p.id = u16(0); p.filtros = []; let j = 2;
        while (j < c.length) { const m = u16(j); const f = _dec.decode(c.subarray(j + 2, j + 2 + m)); j += 2 + m; let q = 0; if (tipo === MQTT_TIPO.SUBSCRIBE) q = c[j++]; p.filtros.push({ f, q }); }
    }
    return p;
}

// ---------------------------------------------------------------- emissor de eventos simples
class Emissor {
    constructor() { this._ev = {}; }
    on(n, f) { (this._ev[n] = this._ev[n] || []).push(f); return this; }
    emit(n, ...a) { (this._ev[n] || []).forEach(f => { try { f(...a); } catch (e) { console.error(e); } }); }
}

/**
 * Cliente MQTT.
 *   const c = new ClienteMQTT({ url, clientId, usuario, senha, keepalive, will });
 *   c.on('estado', (estado, detalhe) => …)   // conectando | conectado | desconectado | erro
 *   c.on('mensagem', (topico, bytes, { qos, retain }) => …)
 *   c.conectar(); c.assinar('fazenda/#', 0); c.publicar('t', '1', { qos: 1, retain: true }); c.encerrar();
 */
class ClienteMQTT extends Emissor {
    constructor(o) {
        super();
        this.o = Object.assign({ keepalive: 30, clientId: 'sup-' + Math.random().toString(16).slice(2, 10) }, o);
        this.estado = 'desconectado';
        this.assinaturas = new Map();          // filtro → qos
        this.pendentes = new Map();            // id → { resolve, reject, pacote, t }
        this.recebidosQoS2 = new Set();
        this._id = 1; this._buf = new Uint8Array(0); this._tentativas = 0; this._fim = false;
        this.contagem = { rx: 0, tx: 0, bytesRx: 0, bytesTx: 0 };
    }
    _proxId() { this._id = (this._id % 65535) + 1; return this._id; }
    _mudar(estado, detalhe) { this.estado = estado; this.emit('estado', estado, detalhe || ''); }
    conectar() {
        this._fim = false;
        clearTimeout(this._tReconexao);
        this._mudar('conectando', this.o.url);
        let ws;
        try { ws = new WebSocket(this.o.url, ['mqtt']); }
        catch (e) { this._mudar('erro', 'Endereço inválido: ' + e.message); this._agendar(); return; }
        ws.binaryType = 'arraybuffer';
        this.ws = ws;
        let abriu = false;
        ws.onopen = () => { abriu = true; this._enviar(pacoteConnect(this.o)); };
        ws.onmessage = ev => this._receber(new Uint8Array(ev.data));
        ws.onerror = () => { if (!abriu) this._erroAbertura = true; };
        ws.onclose = ev => {
            clearInterval(this._tPing); clearTimeout(this._tPong);
            const era = this.estado;
            this.ws = null;
            if (this._fim) { this._mudar('desconectado', 'encerrado'); return; }
            let msg = 'conexão perdida';
            if (!abriu) msg = location.protocol === 'https:' && /^ws:/i.test(this.o.url)
                ? 'página em https só conecta em wss:// (use a porta segura do broker, ex.: 8084)'
                : 'não consegui abrir o WebSocket (endereço, porta ou caminho /mqtt errados, broker fora do ar ou rede bloqueando)';
            else if (era === 'conectando') msg = this._recusa || 'o broker fechou a conexão durante a entrada';
            this._mudar('erro', msg + (ev && ev.code && ev.code !== 1006 ? ` (código ${ev.code})` : ''));
            this.pendentes.forEach(p => p.reject(new Error('conexão perdida antes da confirmação')));
            this.pendentes.clear();
            this._agendar();
        };
    }
    _agendar() {
        if (this._fim) return;
        const passos = [1, 2, 5, 10, 20, 30];
        const s = passos[Math.min(this._tentativas++, passos.length - 1)];
        this.proximaTentativa = Date.now() + s * 1000;
        this._tReconexao = setTimeout(() => this.conectar(), s * 1000);
    }
    _enviar(pacote) {
        if (!this.ws || this.ws.readyState !== 1) return false;
        this.ws.send(pacote); this.contagem.bytesTx += pacote.length; return true;
    }
    _receber(bytes) {
        this.contagem.bytesRx += bytes.length;
        const b = new Uint8Array(this._buf.length + bytes.length); b.set(this._buf); b.set(bytes, this._buf.length);
        const { pacotes, resto } = lerPacotes(b);
        this._buf = resto;
        pacotes.forEach(p => this._tratar(p));
    }
    _tratar(p) {
        clearTimeout(this._tPong);
        switch (p.tipo) {
            case MQTT_TIPO.CONNACK:
                if (p.codigo !== 0) { this._recusa = 'o broker recusou: ' + (MQTT_CONNACK[p.codigo] || 'código ' + p.codigo); this.ws.close(); return; }
                this._tentativas = 0; this._recusa = '';
                this._mudar('conectado', this.o.url);
                if (this.assinaturas.size) {
                    const filtros = [...this.assinaturas].map(([f, q]) => ({ f, q }));
                    this._enviar(this._pacoteSubscribe(filtros));
                }
                clearInterval(this._tPing);
                this._tPing = setInterval(() => {
                    this._enviar(mqttPacote(MQTT_TIPO.PINGREQ, 0, new Uint8Array(0)));
                    this._tPong = setTimeout(() => { if (this.ws) this.ws.close(); }, Math.max(5000, this.o.keepalive * 500));
                }, Math.max(5, this.o.keepalive) * 1000 * 0.9);
                break;
            case MQTT_TIPO.PUBLISH:
                this.contagem.rx++;
                if (p.qos === 1) this._enviar(mqttPacote(MQTT_TIPO.PUBACK, 0, mqttU16(p.id)));
                if (p.qos === 2) {
                    this._enviar(mqttPacote(MQTT_TIPO.PUBREC, 0, mqttU16(p.id)));
                    if (this.recebidosQoS2.has(p.id)) return;          // repetição: já entregue
                    this.recebidosQoS2.add(p.id);
                }
                this.emit('mensagem', p.topico, p.payload, { qos: p.qos, retain: p.retain });
                break;
            case MQTT_TIPO.PUBREL:
                this.recebidosQoS2.delete(p.id);
                this._enviar(mqttPacote(MQTT_TIPO.PUBCOMP, 0, mqttU16(p.id)));
                break;
            case MQTT_TIPO.PUBACK: case MQTT_TIPO.SUBACK: case MQTT_TIPO.UNSUBACK: {
                const pend = this.pendentes.get(p.id);
                if (pend) {
                    this.pendentes.delete(p.id);
                    if (p.tipo === MQTT_TIPO.SUBACK && p.codigos.some(c => c === 0x80)) pend.reject(new Error('o broker recusou a assinatura (sem permissão para o tópico?)'));
                    else pend.resolve(p);
                }
                break;
            }
            default: break;
        }
    }
    _pacoteSubscribe(filtros, id = this._proxId()) {
        return { id, bytes: mqttPacote(MQTT_TIPO.SUBSCRIBE, 2, juntar([mqttU16(id), ...filtros.flatMap(x => [mqttTexto(x.f), new Uint8Array([Math.min(2, x.q || 0)])])])) }.bytes;
    }
    _esperar(id, pacote) {
        return new Promise((resolve, reject) => {
            const t = setTimeout(() => { if (this.pendentes.has(id)) { this.pendentes.delete(id); reject(new Error('sem confirmação do broker em 10 s')); } }, 10000);
            this.pendentes.set(id, { resolve: v => { clearTimeout(t); resolve(v); }, reject: e => { clearTimeout(t); reject(e); }, pacote });
        });
    }
    assinar(filtro, qos = 0) {
        this.assinaturas.set(filtro, qos);
        if (this.estado !== 'conectado') return Promise.resolve();
        const id = this._proxId();
        const pac = mqttPacote(MQTT_TIPO.SUBSCRIBE, 2, juntar([mqttU16(id), mqttTexto(filtro), new Uint8Array([Math.min(2, qos)])]));
        const pr = this._esperar(id, pac); this._enviar(pac); return pr;
    }
    cancelar(filtro) {
        this.assinaturas.delete(filtro);
        if (this.estado !== 'conectado') return Promise.resolve();
        const id = this._proxId();
        const pac = mqttPacote(MQTT_TIPO.UNSUBSCRIBE, 2, juntar([mqttU16(id), mqttTexto(filtro)]));
        const pr = this._esperar(id, pac); this._enviar(pac); return pr;
    }
    /** Publica. QoS 1 resolve quando o broker confirma; desconectado rejeita (o comando não some em silêncio). */
    publicar(topico, payload, o = {}) {
        if (this.estado !== 'conectado') return Promise.reject(new Error('sem conexão com o broker'));
        const qos = Math.min(1, o.qos || 0);
        const id = qos ? this._proxId() : 0;
        const pac = pacotePublish(topico, payload, qos, !!o.retain, id);
        this.contagem.tx++;
        if (!qos) { this._enviar(pac); return Promise.resolve(); }
        const pr = this._esperar(id, pac); this._enviar(pac); return pr;
    }
    encerrar() {
        this._fim = true;
        clearTimeout(this._tReconexao); clearInterval(this._tPing); clearTimeout(this._tPong);
        if (this.ws) { this._enviar(mqttPacote(MQTT_TIPO.DISCONNECT, 0, new Uint8Array(0))); try { this.ws.close(); } catch (e) { /* ok */ } }
        else this._mudar('desconectado', 'encerrado');
    }
}

// ---------------------------------------------------------------- broker dentro da página (demonstração)
class BrokerLocal {
    constructor() { this.clientes = new Set(); this.retidos = new Map(); }
    entregar(topico, bytes, retain, origem) {
        if (retain) { if (bytes.length) this.retidos.set(topico, bytes); else this.retidos.delete(topico); }
        this.clientes.forEach(c => {
            for (const [f, q] of c.assinaturas) if (topicoCasa(f, topico)) { c._chegou(topico, bytes, { qos: q, retain: false }); break; }
        });
    }
}
const BROKER_LOCAL = new BrokerLocal();

/** Mesmo jeito de usar do ClienteMQTT, mas fala com o BrokerLocal (sem rede). */
class ClienteLocal extends Emissor {
    constructor(o = {}) { super(); this.o = o; this.estado = 'desconectado'; this.assinaturas = new Map(); this.contagem = { rx: 0, tx: 0, bytesRx: 0, bytesTx: 0 }; this.broker = o.broker || BROKER_LOCAL; }
    conectar() {
        this._mudar('conectando', 'simulação');
        setTimeout(() => { this.broker.clientes.add(this); this._mudar('conectado', 'simulação (sem broker)'); }, 50);
    }
    _mudar(e, d) { this.estado = e; this.emit('estado', e, d || ''); }
    _chegou(topico, bytes, info) {
        this.contagem.rx++; this.contagem.bytesRx += bytes.length;
        const copia = bytes.slice();
        queueMicrotask(() => this.emit('mensagem', topico, copia, info));
    }
    assinar(f, q = 0) {
        this.assinaturas.set(f, q);
        if (this.estado === 'conectado') this.broker.retidos.forEach((b, t) => { if (topicoCasa(f, t)) this._chegou(t, b, { qos: q, retain: true }); });
        return Promise.resolve();
    }
    cancelar(f) { this.assinaturas.delete(f); return Promise.resolve(); }
    publicar(topico, payload, o = {}) {
        if (this.estado !== 'conectado') return Promise.reject(new Error('simulação parada'));
        const b = paraBytes(payload); this.contagem.tx++; this.contagem.bytesTx += b.length;
        this.broker.entregar(topico, b, !!o.retain, this);
        return Promise.resolve();
    }
    encerrar() { this.broker.clientes.delete(this); this._mudar('desconectado', 'encerrado'); }
}

if (typeof module !== 'undefined') module.exports = { topicoCasa, lerPacotes, mqttPacote, mqttTexto, mqttU16, juntar, pacotePublish, MQTT_TIPO, paraBytes };
