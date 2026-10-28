/**
 * © 2026 Supervisório MQTT — Inova Agro UFPel EMBRAPII. Código aberto; cópias permitidas desde que citadas.
 *
 * BROKER MQTT DE TESTE (WebSocket), sem dependências: só Node.js. Serve para testar o supervisório sem internet
 * e para os testes automáticos. NÃO é para produção (sem TLS, sem persistência, QoS 2 não implementado).
 *
 *   node tests/broker-ws.js [porta=8090] [usuario] [senha]
 *   → ws://localhost:8090/mqtt   (no supervisório: Configurar → Conexão → "Broker de teste deste projeto")
 *
 * Aceita CONNECT (com usuário/senha opcionais), SUBSCRIBE com + e #, PUBLISH QoS 0/1, mensagens retidas,
 * Last Will, PING e DISCONNECT. Também imprime cada publicação, para acompanhar os comandos do supervisório.
 */

'use strict';

const http = require('http'), crypto = require('crypto');
const { topicoCasa, lerPacotes, mqttPacote, mqttU16, MQTT_TIPO, pacotePublish } = require('../js/mqtt.js');

global.TextDecoder = global.TextDecoder || require('util').TextDecoder;
const porta = +(process.argv[2] || 8090), usuario = process.argv[3] || '', senha = process.argv[4] || '';
const clientes = new Set(), retidos = new Map();

function quadro(dados) {        // quadro WebSocket binário (servidor não mascara)
    const n = dados.length;
    const cab = n < 126 ? Buffer.from([0x82, n]) : n < 65536 ? Buffer.from([0x82, 126, n >> 8, n & 255]) : (() => { const b = Buffer.alloc(10); b[0] = 0x82; b[1] = 127; b.writeBigUInt64BE(BigInt(n), 2); return b; })();
    return Buffer.concat([cab, Buffer.from(dados)]);
}
function entregar(topico, payload, retain, origem) {
    if (retain) { if (payload.length) retidos.set(topico, payload); else retidos.delete(topico); }
    for (const c of clientes) {
        for (const [f, q] of c.subs) if (topicoCasa(f, topico)) { c.enviar(pacotePublish(topico, payload, Math.min(q, 1), false, c.proxId())); break; }
    }
    if (!process.env.SILENCIO) console.log(`${new Date().toLocaleTimeString()} ${origem || ''} → ${topico} = ${Buffer.from(payload).toString().slice(0, 80)}${retain ? ' (retido)' : ''}`);
}

const srv = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Broker MQTT de teste (WebSocket). Use ws://localhost:' + porta + '/mqtt\n'); });
srv.on('upgrade', (req, sock) => {
    const chave = req.headers['sec-websocket-key'];
    const aceite = crypto.createHash('sha1').update(chave + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    const proto = (req.headers['sec-websocket-protocol'] || '').split(',').map(s => s.trim()).find(p => p === 'mqtt' || p === 'mqttv3.1');
    sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${aceite}\r\n${proto ? 'Sec-WebSocket-Protocol: ' + proto + '\r\n' : ''}\r\n`);
    let ws = Buffer.alloc(0), mq = new Uint8Array(0), id = 1;
    const c = { subs: new Map(), will: null, nome: '', enviar: b => { try { sock.write(quadro(b)); } catch (e) { /* caiu */ } }, proxId: () => (id = (id % 65535) + 1) };
    const fechar = (comWill = true) => {
        if (!clientes.has(c) && !c.conectado) { sock.destroy(); return; }
        clientes.delete(c); c.conectado = false;
        if (comWill && c.will) entregar(c.will.topic, c.will.payload, c.will.retain, '[LWT ' + c.nome + ']');
        sock.destroy();
    };
    sock.on('data', d => {
        ws = Buffer.concat([ws, d]);
        while (ws.length >= 2) {
            const op = ws[0] & 15, mascara = ws[1] & 128; let n = ws[1] & 127, k = 2;
            if (n === 126) { if (ws.length < 4) return; n = ws.readUInt16BE(2); k = 4; } else if (n === 127) { if (ws.length < 10) return; n = Number(ws.readBigUInt64BE(2)); k = 10; }
            const m = mascara ? ws.subarray(k, k + 4) : null; k += mascara ? 4 : 0;
            if (ws.length < k + n) return;
            const corpo = Buffer.from(ws.subarray(k, k + n)); if (m) for (let i = 0; i < n; i++) corpo[i] ^= m[i & 3];
            ws = ws.subarray(k + n);
            if (op === 8) { fechar(true); return; }
            if (op === 9) { sock.write(Buffer.from([0x8a, 0])); continue; }
            const b = new Uint8Array(mq.length + corpo.length); b.set(mq); b.set(corpo, mq.length);
            const r = lerPacotes(b); mq = r.resto;
            for (const p of r.pacotes) tratar(p);
        }
    });
    sock.on('close', () => fechar(true)); sock.on('error', () => fechar(true));
    function tratar(p) {
        switch (p.tipo) {
            case MQTT_TIPO.CONNECT: {
                if (usuario && (p.usuario !== usuario || p.senha !== senha)) { c.enviar(mqttPacote(MQTT_TIPO.CONNACK, 0, new Uint8Array([0, 4]))); setTimeout(() => fechar(false), 50); return; }
                c.nome = p.clientId; c.will = p.will || null; c.conectado = true; clientes.add(c);
                c.enviar(mqttPacote(MQTT_TIPO.CONNACK, 0, new Uint8Array([0, 0])));
                if (!process.env.SILENCIO) console.log(`+ ${p.clientId} conectou`);
                break;
            }
            case MQTT_TIPO.SUBSCRIBE:
                p.filtros.forEach(x => c.subs.set(x.f, x.q));
                c.enviar(mqttPacote(MQTT_TIPO.SUBACK, 0, new Uint8Array([p.id >> 8, p.id & 255, ...p.filtros.map(x => Math.min(1, x.q))])));
                p.filtros.forEach(x => retidos.forEach((v, t) => { if (topicoCasa(x.f, t)) { const pk = pacotePublish(t, v, Math.min(1, x.q), true, c.proxId()); c.enviar(pk); } }));
                break;
            case MQTT_TIPO.UNSUBSCRIBE: p.filtros.forEach(x => c.subs.delete(x.f)); c.enviar(mqttPacote(MQTT_TIPO.UNSUBACK, 0, mqttU16(p.id))); break;
            case MQTT_TIPO.PUBLISH:
                if (p.qos === 1) c.enviar(mqttPacote(MQTT_TIPO.PUBACK, 0, mqttU16(p.id)));
                entregar(p.topico, p.payload, p.retain, c.nome);
                break;
            case MQTT_TIPO.PINGREQ: c.enviar(mqttPacote(MQTT_TIPO.PINGRESP, 0, new Uint8Array(0))); break;
            case MQTT_TIPO.DISCONNECT: c.will = null; fechar(false); break;
            default: break;
        }
    }
});
srv.listen(porta, () => console.log(`Broker MQTT de teste em ws://localhost:${porta}/mqtt${usuario ? ' (com usuário e senha)' : ''}`));
