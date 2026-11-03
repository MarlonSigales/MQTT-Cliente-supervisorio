#!/usr/bin/env node
/**
 * © 2026 Supervisório MQTT — Inova Agro UFPel EMBRAPII. Código aberto; cópias permitidas desde que citadas.
 *
 * AGENTE DE BORDA 24 h (Node.js 22+; PC, mini-PC ou Raspberry Pi): roda o supervisório SEM navegador, com a mesma
 * configuração e o mesmo código — conexão MQTT, variáveis calculadas, controladores, publicações, horímetros, alarmes,
 * termometria e lotes de secagem — e guarda o histórico em disco (um ZIP por planta e por dia, o mesmo formato da nuvem).
 * Opcional: envia o histórico para o MEGA da equipe (npm install megajs) e faz o papel de ORIGINAL do gêmeo pela nuvem.
 * Assim o supervisório no navegador pode ficar fechado: ao abrir, ele lê o histórico da nuvem (ou o ZIP do dia).
 *
 *   node agente/agente.js --projeto meu-projeto.json [--dados ./dados-agente]
 *        [--senha-broker X]                      senha do broker (a do arquivo do projeto nunca vem junto)
 *        [--mega-email E --mega-senha S]          histórico na nuvem da equipe (precisa de: npm install megajs)
 *        [--gemeo]                                este agente é o ORIGINAL do gêmeo das plantas (exige o MEGA)
 *        [--planta <id ou nome>]                  só uma planta (padrão: todas)
 * O arquivo do projeto é o "Baixar arquivo" do supervisório (.json ou o configuracao.json de dentro do .zip).
 */

'use strict';

const fs = require('fs'), path = require('path'), vm = require('vm');
const raiz = path.join(__dirname, '..');
const arg = (n, padrao) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : padrao; };
const tem = n => process.argv.includes('--' + n);
const pasta = path.resolve(arg('dados', path.join(process.cwd(), 'dados-agente')));
fs.mkdirSync(pasta, { recursive: true });

// localStorage em arquivo (horímetros, acumuladores, gêmeo): sobrevive a reinícios
const arqLS = path.join(pasta, 'armazenamento.json');
let LS = {}; try { LS = JSON.parse(fs.readFileSync(arqLS, 'utf8')); } catch (e) { LS = {}; }
let _gravLS = null;
const localStorage = { getItem: k => (k in LS ? LS[k] : null), setItem: (k, v) => { LS[k] = String(v); clearTimeout(_gravLS); _gravLS = setTimeout(() => fs.writeFileSync(arqLS, JSON.stringify(LS)), 500); }, removeItem: k => { delete LS[k]; } };
const noop = () => {};
const globais = {
    window: globalThis, localStorage, sessionStorage: localStorage, location: { protocol: 'node:', hash: '' },
    document: { addEventListener: noop, querySelectorAll: () => [], hidden: true, createElement: () => ({}) },
    addEventListener: noop, requestAnimationFrame: f => setTimeout(f, 0), SUP_TESTES: true
};
for (const [k, v] of Object.entries(globais)) Object.defineProperty(globalThis, k, { value: v, writable: true, configurable: true });
const carregar = f => vm.runInThisContext(fs.readFileSync(path.join(raiz, f), 'utf8').replace(/^if \(typeof module !== 'undefined'\).*$/m, ''), { filename: f });
carregar('lib/jszip.min.js');
if (!globalThis.JSZip) { console.error('JSZip não carregou'); process.exit(1); }
['js/dados.js', 'js/expr.js', 'js/mqtt.js', 'js/sparkplug.js', 'agente/hist-node.js', 'js/alarmes.js', 'js/controle.js', 'js/runtime.js', 'js/termometria.js', 'js/nuvem.js', 'js/gemeo.js', 'js/lotes.js'].forEach(carregar);

// ---------------------------------------------------------------- projeto
const arqProj = arg('projeto');
if (!arqProj) { console.error('Use: node agente/agente.js --projeto meu-projeto.json'); process.exit(1); }
const bruto = JSON.parse(fs.readFileSync(path.resolve(arqProj), 'utf8'));
SUP.p = normalizarProjeto(bruto.plantas ? bruto : { plantas: [bruto] });
SUP.p.opcoes.somAlarme = false; SUP.p.opcoes.notificacao = false;
SUP.gravar = () => true;                             // a configuração vem do arquivo (o agente não edita)
const filtroPl = arg('planta');
if (filtroPl) SUP.p.plantas = SUP.p.plantas.filter(p => p.id === filtroPl || p.nome === filtroPl);
if (!SUP.p.plantas.length) { console.error('Nenhuma planta no projeto (ou o filtro --planta não achou).'); process.exit(1); }
const senhaBroker = arg('senha-broker'); if (senhaBroker) SUP.p.plantas.forEach(pl => Senhas.guardar(pl.id, senhaBroker));
const silencioso = tem('silencioso');
const msg = m => { if (!silencioso) console.log(new Date().toLocaleString('pt-BR'), m); };
RT.ouvintes.add((tipo, ev) => { if (tipo === 'log' && ev) msg(`[${ev.tipo}] ${ev.planta ? ev.planta + ': ' : ''}${ev.texto}`); });

// ---------------------------------------------------------------- histórico em disco (ZIP do dia) e retomada
const arqDia = (pl, dia0) => path.join(pasta, nomeSeguro(pl.nome), `${nomeSeguro(pl.nome)}-${diaISO(dia0)}.zip`);
async function gravarDia(pl, dia0) {
    const { blob, n, ne } = await zipDoDia(pl, dia0);
    if (!n && !ne) return 0;
    const f = arqDia(pl, dia0); fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f + '.tmp', Buffer.from(await blob.arrayBuffer())); fs.renameSync(f + '.tmp', f);
    return n;
}
async function gravarTudo() {
    const hoje = inicioDoDia(Date.now());
    for (const pl of SUP.p.plantas) { await gravarDia(pl, hoje); if (Date.now() - hoje < 15 * 60000) await gravarDia(pl, hoje - 86400000); }
}
async function retomar() {
    const hoje = inicioDoDia(Date.now());
    for (const pl of SUP.p.plantas) for (const dia of [hoje - 86400000, hoje]) {
        const f = arqDia(pl, dia);
        if (fs.existsSync(f)) { try { const r = await importarZipDia(new Uint8Array(fs.readFileSync(f)), pl); msg(`retomou ${path.basename(f)}: ${r.amostras} amostras`); } catch (e) { console.error(`não consegui ler ${f}:`, e.message); } }
    }
}

// ---------------------------------------------------------------- nuvem (opcional)
async function nuvem() {
    const email = arg('mega-email'), senha = arg('mega-senha');
    if (!email) { if (tem('gemeo')) console.warn('--gemeo precisa do MEGA (--mega-email e --mega-senha)'); return; }
    const modulo = arg('mega-modulo', 'megajs');
    try { NUVEM.mega = await import(modulo.startsWith('.') ? 'file://' + path.resolve(modulo) : modulo); NUVEM.mega = NUVEM.mega.Storage ? NUVEM.mega : NUVEM.mega.default; }
    catch (e) { console.error(`Não achei o módulo ${modulo} (rode: npm install megajs na pasta do agente).`, e.message); return; }
    if (arg('mega-modulo')) NUVEM.simulado = NUVEM.mega;
    await nuvemEntrar(email, senha);
    SUP.p.opcoes.nuvemHistorico = true;
    if (tem('gemeo')) SUP.p.plantas.forEach(pl => definirPapel(pl, 'original'));
}

// ---------------------------------------------------------------- início
(async () => {
    msg(`agente: ${SUP.p.plantas.length} planta(s), dados em ${pasta}`);
    await retomar();
    iniciarRuntime();
    SUP.p.plantas.forEach(pl => { pl.conexao.campoVirtual = false; if (pl.conexao.tipo === 'simulado') { msg(`${pl.nome}: está em simulação no arquivo — o agente usa o broker MQTT`); pl.conexao.tipo = 'mqtt'; } conectarPlanta(pl); });
    await nuvem().catch(e => console.error('nuvem:', e.message));
    setInterval(() => gravarTudo().catch(e => console.error('gravar:', e.message)), num(arg('gravar-s'), 300) * 1000);
    setInterval(() => histLimpar(3).catch(() => {}), 3600000);
    const sair = async () => { msg('encerrando: gravando o histórico'); try { guardarAcumuladores(); await gravarTudo(); fs.writeFileSync(arqLS, JSON.stringify(LS)); } catch (e) { console.error(e); } process.exit(0); };
    process.on('SIGINT', sair); process.on('SIGTERM', sair);
})();
