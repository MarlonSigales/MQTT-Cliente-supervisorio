#!/usr/bin/env node
/**
 * © 2026 Supervisório MQTT — Inova Agro UFPel EMBRAPII. Código aberto; cópias permitidas desde que citadas.
 *
 * PLANTA VIRTUAL SEM NAVEGADOR (Node.js 22 ou mais novo, sem instalar nada): faz o papel do campo num broker MQTT de
 * verdade — publica os sensores, segue os comandos e responde ao status (<prefixo>/status/get → <prefixo>/status).
 * Usa o mesmo código do supervisório (js/expr.js, js/mqtt.js, js/simulador.js).
 *
 *   node campo/planta-virtual.js                                   (UBG de arroz, broker.emqx.io, prefixo do arquivo)
 *   node campo/planta-virtual.js --prefixo inovaagro/ubg_arroz/minha --url wss://broker.emqx.io:8084/mqtt
 *   node campo/planta-virtual.js --planta outra.json               (arquivo .json de planta ou de projeto do supervisório)
 *   opções: --usuario X --senha Y --periodo 2 (s entre publicações) --silencioso
 */

'use strict';

const fs = require('fs'), path = require('path'), vm = require('vm');
const raiz = path.join(__dirname, '..');
const arg = (n, padrao) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : padrao; };
const tem = n => process.argv.includes('--' + n);

// ambiente mínimo de navegador para os scripts do supervisório
Object.assign(globalThis, { window: globalThis, location: { protocol: 'node:' }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, console });
for (const f of ['js/dados.js', 'js/expr.js', 'js/mqtt.js', 'js/runtime.js', 'js/simulador.js']) {
    const codigo = fs.readFileSync(path.join(raiz, f), 'utf8').replace(/^if \(typeof module !== 'undefined'\).*$/m, '');
    vm.runInThisContext(codigo, { filename: f });
}

let dados = JSON.parse(fs.readFileSync(path.resolve(arg('planta', path.join(__dirname, 'ubg-arroz.json'))), 'utf8'));
const pl = dados.plantas ? (dados.plantas.find(p => p.simulacao) || dados.plantas[0]) : dados;
if (!pl || !pl.simulacao || !pl.simulacao.modelos || !pl.simulacao.modelos.length) { console.error('A planta não tem planta virtual (pl.simulacao.modelos).'); process.exit(1); }
pl.conexao = Object.assign({}, pl.conexao);
pl.conexao.url = arg('url', pl.conexao.url || 'wss://broker.emqx.io:8084/mqtt');
pl.conexao.prefixo = arg('prefixo', pl.conexao.prefixo || '');
if (arg('periodo')) pl.simulacao.periodoS = +arg('periodo');
const silencioso = tem('silencioso');
const log = m => { if (!silencioso) console.log(new Date().toLocaleTimeString('pt-BR'), m); };

const cliente = new ClienteMQTT({ url: pl.conexao.url, clientId: 'planta-virtual-' + Math.random().toString(16).slice(2, 8), usuario: arg('usuario', ''), senha: arg('senha', ''), keepalive: 30,
    will: { topic: topicoCompleto(pl, 'campo/online'), payload: '0', qos: 1, retain: true } });
const reg = criarCampo(pl, cliente, { real: true, aoLog: log, aviso: m => console.warn(m) });
cliente.on('estado', (e, d) => { if (e === 'conectado') { reg.publicar(topicoCompleto(pl, 'campo/online'), '1', { retain: true, qos: 1 }); log(`planta "${pl.nome}" no ar: ${pl.conexao.url} · prefixo ${pl.conexao.prefixo} · status: publique em ${topicoCompleto(pl, 'status/get')}`); } else if (e === 'erro') log('erro: ' + d); });
cliente.conectar();
let ult = Date.now();
setInterval(() => { const agora = Date.now(); passoCampo(reg, Math.min(10, (agora - ult) / 1000)); ult = agora; }, 1000);
const sair = () => { log('encerrando'); try { cliente.publicar(topicoCompleto(pl, 'campo/online'), '0', { retain: true, qos: 1 }).finally(() => { cliente.encerrar(); process.exit(0); }); } catch (e) { process.exit(0); } setTimeout(() => process.exit(0), 1500); };
process.on('SIGINT', sair); process.on('SIGTERM', sair);
