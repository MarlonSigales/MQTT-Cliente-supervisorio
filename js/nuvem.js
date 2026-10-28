/**
 * © 2026 Supervisório MQTT — Inova Agro UFPel EMBRAPII. Código aberto; cópias permitidas desde que citadas.
 *
 * NUVEM DA EQUIPE (MEGA) — a mesma do Sistema de Projeto Conceitual: cada equipe usa a sua conta MEGA; só quem tem o
 * e-mail e a senha entra; nada fica público (nunca se cria link). O MEGA criptografa tudo no navegador.
 *
 * Pastas na conta:
 *   SupervisorioMQTT/Configuracao/<supervisório>/<supervisório>-<data>.json   (cada salvamento é uma versão)
 *   SupervisorioMQTT/Historico/<planta>/<AAAA-MM>/<planta>-<AAAA-MM-DD>.zip   (dados passados: um arquivo por dia)
 *        cada ZIP traz amostras.csv (data e hora; variável; valor), eventos.csv (log, alarmes, comandos) e variaveis.json
 *        (nome, unidade e tópico de cada variável — o arquivo se explica sozinho, abre no Excel).
 * O dia de hoje é reenviado a cada envio automático (substitui o anterior); os dias fechados vão uma vez só.
 * Ao pedir um período que não está mais no navegador (gráficos e relatórios), o sistema baixa esses dias da nuvem.
 * A senha é guardada pelo gerenciador de senhas do navegador (não por este sistema).
 * Biblioteca: megajs (cliente JavaScript do MEGA, código aberto, não oficial), carregada só quando a nuvem é usada.
 */

'use strict';

const NUVEM = {
    pastaRaiz: 'SupervisorioMQTT',
    fontes: ['https://cdn.jsdelivr.net/npm/megajs@1/dist/main.browser-es.mjs', 'https://esm.sh/megajs@1'],
    mega: null, storage: null, email: '', conectando: null,
    enviando: false, ultimoEnvio: null, ultimoErro: '', simulado: null   // simulado: usado pelos testes automáticos
};

function nuvemConectada() { return !!NUVEM.storage; }
function emailLembrado() { try { return localStorage.getItem('sup_nuvem_email') || ''; } catch (e) { return ''; } }

async function carregarMega() {
    if (NUVEM.mega) return NUVEM.mega;
    let erro = null;
    for (const u of NUVEM.fontes) {
        try { NUVEM.mega = await import(u); if (NUVEM.mega && NUVEM.mega.Storage) return NUVEM.mega; } catch (e) { erro = e; }
    }
    throw new Error('Não consegui carregar o acesso ao MEGA (sem internet ou bloqueado pela rede). ' + (erro ? erro.message : ''));
}
async function nuvemEntrar(email, senha) {
    const mega = NUVEM.simulado || await carregarMega();
    const st = new mega.Storage({ email, password: senha, userAgent: 'SupervisorioMQTT/1.0', keepalive: false });
    try { await st.ready; }
    catch (e) { throw new Error(/EBLOCKED|ENOENT|EKEY|-9|-16|password|senha/i.test(String(e && e.message)) ? 'E-mail ou senha da nuvem não conferem.' : 'O MEGA recusou a entrada: ' + (e && e.message || e)); }
    NUVEM.storage = st; NUVEM.email = email;
    try { localStorage.setItem('sup_nuvem_email', email); } catch (e) { /* ok */ }
    logar('nuvem', `Entrou na nuvem da equipe (${email})`);
    return st;
}
function nuvemSair() {
    try { if (NUVEM.storage && NUVEM.storage.close) NUVEM.storage.close(); } catch (e) { /* ok */ }
    NUVEM.storage = null; NUVEM.email = '';
    try { localStorage.removeItem('sup_nuvem_email'); } catch (e) { /* ok */ }
    try { if (navigator.credentials && navigator.credentials.preventSilentAccess) { const r = navigator.credentials.preventSilentAccess(); if (r && r.catch) r.catch(() => {}); } } catch (e) { /* ok */ }
}
async function senhaDoNavegador() {
    try {
        if (!window.PasswordCredential || !navigator.credentials) return null;
        const c = await navigator.credentials.get({ password: true, mediation: 'optional' });
        return c && c.password ? { email: c.id, senha: c.password } : null;
    } catch (e) { return null; }
}
async function guardarNoNavegador(email, senha) {
    try { if (window.PasswordCredential && navigator.credentials) await navigator.credentials.store(new PasswordCredential({ id: email, password: senha, name: 'Nuvem da equipe (MEGA)' })); } catch (e) { /* o navegador oferece pelo formulário */ }
}
async function nuvemGarantir(perguntar = true) {
    if (NUVEM.storage) return NUVEM.storage;
    if (NUVEM.conectando) return NUVEM.conectando;
    NUVEM.conectando = (async () => {
        const g = await senhaDoNavegador();
        if (g) { try { return await nuvemEntrar(g.email, g.senha); } catch (e) { /* senha mudou */ } }
        if (!perguntar) throw new Error('nuvem não conectada');
        return formularioEntrada();
    })();
    try { return await NUVEM.conectando; } finally { NUVEM.conectando = null; }
}
function formularioEntrada() {
    return new Promise((resolve, reject) => {
        const fundo = document.createElement('div');
        fundo.className = 'janela-fundo';
        fundo.innerHTML = `<form class="janela nuvem-form" method="post" action="#" autocomplete="on">
            <h2>${icone('nuvem')} Nuvem da equipe (MEGA)</h2>
            <p class="nota">Entre com a conta MEGA <b>da equipe</b>. Só quem tem esta senha vê a configuração e os dados passados. O navegador vai oferecer para lembrar a senha.</p>
            <label>E-mail da conta <input type="email" name="username" autocomplete="username" required value="${escAttr(emailLembrado())}"></label>
            <label>Senha <input type="password" name="password" autocomplete="current-password" required></label>
            <p class="nuvem-erro" role="alert"></p>
            <div class="janela-rodape"><button type="button" class="btn btn-secondary" data-n="cancelar">Cancelar</button><button type="submit" class="btn btn-primary">Entrar</button></div>
            <p class="nota">Não tem conta? Crie uma conta grátis em mega.io com um e-mail da equipe, baixe a chave de recuperação e passe a senha só para quem é da equipe. Quando alguém sair, troque a senha.</p>
            ${htmlPorQueMega()}
        </form>`;
        document.body.appendChild(fundo);
        const form = fundo.querySelector('form'), erro = fundo.querySelector('.nuvem-erro');
        (form.username.value ? form.password : form.username).focus();
        const fechar = () => fundo.remove();
        fundo.querySelector('[data-n=cancelar]').addEventListener('click', () => { fechar(); reject(new Error('Entrada na nuvem cancelada.')); });
        form.addEventListener('submit', async e => {
            e.preventDefault();
            const email = form.username.value.trim(), senha = form.password.value;
            erro.textContent = 'Entrando…'; form.querySelector('[type=submit]').disabled = true;
            try { const st = await nuvemEntrar(email, senha); await guardarNoNavegador(email, senha); fechar(); resolve(st); }
            catch (er) { erro.textContent = er.message; form.querySelector('[type=submit]').disabled = false; }
        });
    });
}

// ---------------------------------------------------------------- pastas e arquivos (mesma lógica do Projeto Conceitual)
const filhosDe = pasta => (pasta && pasta.children) || [];
const CRIANDO_PASTA = new Map();
async function pasta(mae, nome) {
    const ja = filhosDe(mae).find(f => f.directory && f.name === nome);
    if (ja) return ja;
    const porNome = CRIANDO_PASTA.get(mae) || new Map();
    CRIANDO_PASTA.set(mae, porNome);
    if (porNome.has(nome)) return porNome.get(nome);
    const pr = (async () => { try { return await mae.mkdir(nome); } finally { setTimeout(() => porNome.delete(nome), 2000); } })();
    porNome.set(nome, pr);
    return pr;
}
let filaNuvem = Promise.resolve();
function naFilaNuvem(f) { const r = filaNuvem.then(f, f); filaNuvem = r.catch(() => {}); return r; }
async function enviar(pastaDestino, nome, blob) {
    const dados = new Uint8Array(await blob.arrayBuffer());
    const up = pastaDestino.upload({ name: nome, size: dados.length }, dados);
    return up.complete;
}
/** Envia substituindo o arquivo de mesmo nome (envia o novo antes de apagar o velho: nunca fica sem nenhum). */
async function enviarSubstituindo(pastaDestino, nome, blob) {
    const velhos = filhosDe(pastaDestino).filter(f => !f.directory && f.name === nome);
    await enviar(pastaDestino, nome, blob);
    for (const v of velhos) { try { await v.delete(true); } catch (e) { /* fica a cópia antiga também */ } }
}
async function baixar(arquivo) { return new Blob([await arquivo.downloadBuffer()]); }
function carimboLocal(d = new Date()) { const z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}_${z(d.getHours())}h${z(d.getMinutes())}`; }
const quandoArquivo = f => (f.timestamp ? new Date(f.timestamp * 1000) : null);
async function pastasBase(perguntar = true) {
    const st = await nuvemGarantir(perguntar);
    const raiz = await pasta(st.root, NUVEM.pastaRaiz);
    return { st, raiz, config: await pasta(raiz, 'Configuracao'), historico: await pasta(raiz, 'Historico') };
}

// ---------------------------------------------------------------- configuração
function salvarConfigNuvem() { return naFilaNuvem(async () => {
    const { config } = await pastasBase();
    const nome = nomeSeguro(SUP.p.nome);
    const dir = await pasta(config, nome);
    await enviar(dir, `${nome}-${carimboLocal()}.json`, new Blob([JSON.stringify(SUP.p, null, 1)], { type: 'application/json' }));
    logar('nuvem', `Configuração salva na nuvem (pasta ${nome})`);
    return nome;
}); }
async function listarConfigNuvem() {
    const { config } = await pastasBase();
    return filhosDe(config).filter(f => f.directory).map(d => ({ nome: d.name, versoes: filhosDe(d).filter(f => !f.directory && /\.json$/i.test(f.name)).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)) }))
        .filter(x => x.versoes.length).sort((a, b) => (b.versoes[0].timestamp || 0) - (a.versoes[0].timestamp || 0));
}

// ---------------------------------------------------------------- histórico (dados passados)
function inicioDoDia(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
/** Monta o ZIP de um dia de uma planta. */
async function zipDoDia(pl, dia0) {
    const dia1 = dia0 + 86400000 - 1;
    const ids = pl.tags.map(t => t.id).concat(pl.equipamentos.map(e => 'est:' + e.id));
    const amostras = await histAmostrasDe(ids, dia0, dia1);
    const nomes = new Map(pl.tags.map(t => [t.id, t])); pl.equipamentos.forEach(e => nomes.set('est:' + e.id, { nome: `Estado de ${e.nome} (0 desligado, 1 vazio, 2 trabalhando)`, unidade: '' }));
    const evs = await histEventos(dia0, dia1, e => e.planta === pl.nome);
    const zip = new JSZip();
    zip.file('amostras.csv', csvDe(amostras.map(([g, t, v]) => [new Date(t).toLocaleString('pt-BR'), t, g, (nomes.get(g) || {}).nome || g, v, (nomes.get(g) || {}).unidade || '']), ['data e hora', 't_ms', 'id', 'variável', 'valor', 'unidade']));
    zip.file('eventos.csv', csvDe(evs.slice().reverse().map(e => [new Date(e.t).toLocaleString('pt-BR'), e.t, e.tipo, e.nivel, e.texto]), ['data e hora', 't_ms', 'tipo', 'nível', 'texto']));
    zip.file('variaveis.json', JSON.stringify({ planta: pl.nome, plantaId: pl.id, dia: diaISO(dia0), variaveis: pl.tags.map(t => ({ id: t.id, nome: t.nome, variavel: t.variavel, unidade: t.unidade, tipo: t.tipo, topico: topicoCompleto(pl, t.topico) })) }, null, 1));
    return { blob: await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }), n: amostras.length, ne: evs.length };
}
/** Envia os dias que faltam (e o dia de hoje). Devolve quantos arquivos foram enviados. */
function enviarHistoricoNuvem(forcarDias = 0) { return naFilaNuvem(async () => {
    const { historico } = await pastasBase(false);
    let enviados = 0;
    const hoje = inicioDoDia(Date.now());
    for (const pl of SUP.p.plantas) {
        const dirPl = await pasta(historico, nomeSeguro(pl.nome));
        const ultimoFechado = num(await histMetaLer('nuvem:' + pl.id), 0);
        // dias fechados pendentes (no máximo 30 por vez) + hoje
        let inicio = ultimoFechado ? ultimoFechado + 86400000 : hoje - Math.max(0, forcarDias) * 86400000;
        if (hoje - inicio > 30 * 86400000) inicio = hoje - 30 * 86400000;
        for (let dia = inicio; dia <= hoje; dia += 86400000) {
            const { blob, n, ne } = await zipDoDia(pl, dia);
            if (!n && !ne) { if (dia < hoje) await histMetaGravar('nuvem:' + pl.id, dia); continue; }
            const mes = diaISO(dia).slice(0, 7);
            const dirMes = await pasta(dirPl, mes);
            await enviarSubstituindo(dirMes, `${nomeSeguro(pl.nome)}-${diaISO(dia)}.zip`, blob);
            enviados++;
            if (dia < hoje) await histMetaGravar('nuvem:' + pl.id, dia);
        }
    }
    NUVEM.ultimoEnvio = Date.now(); NUVEM.ultimoErro = '';
    return enviados;
}); }
/** Chamado pelo ciclo a cada minuto: envia no intervalo configurado, só com a nuvem conectada. */
async function nuvemHistoricoAutomatico() {
    const op = SUP.p.opcoes;
    if (!op.nuvemHistorico || !nuvemConectada() || NUVEM.enviando) return;
    if (NUVEM.ultimoEnvio && Date.now() - NUVEM.ultimoEnvio < num(op.nuvemIntervaloMin, 30) * 60000) return;
    NUVEM.enviando = true;
    try { const n = await enviarHistoricoNuvem(); if (n) logar('nuvem', `Histórico enviado para a nuvem (${n} arquivo(s) de dia)`, '', 'info', null, false); }
    catch (e) { NUVEM.ultimoErro = e.message; NUVEM.ultimoEnvio = Date.now(); logar('nuvem', 'Falha ao enviar o histórico: ' + e.message, '', 'erro'); }
    finally { NUVEM.enviando = false; agendarTela(true); }
}
/** Traz da nuvem os dias de [t0, t1] que faltam no navegador. Devolve o número de amostras importadas. */
async function trazerHistoricoNuvem(pl, t0, t1, aoProgresso = () => {}) {
    const { historico } = await pastasBase();
    const dirPl = filhosDe(historico).find(d => d.directory && d.name === nomeSeguro(pl.nome));
    if (!dirPl) return { amostras: 0, dias: 0 };
    let amostras = 0, dias = 0;
    for (let dia = inicioDoDia(t0); dia <= t1; dia += 86400000) {
        const dirMes = filhosDe(dirPl).find(d => d.directory && d.name === diaISO(dia).slice(0, 7));
        const arq = dirMes && filhosDe(dirMes).filter(f => f.name === `${nomeSeguro(pl.nome)}-${diaISO(dia)}.zip`).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0];
        if (!arq) continue;
        aoProgresso(diaISO(dia));
        const r = await importarZipDia(await baixar(arq), pl);
        amostras += r.amostras; dias++;
    }
    return { amostras, dias };
}
/** Lê o ZIP de um dia (da nuvem ou escolhido no computador) e junta no histórico do navegador. */
async function importarZipDia(blob, pl = null) {
    const zip = await JSZip.loadAsync(blob);
    const meta = zip.file('variaveis.json') ? JSON.parse(await zip.file('variaveis.json').async('string')) : null;
    // as variáveis podem ter sido recriadas: casa pelo id e, se não achar, pelo tópico
    const plAlvo = pl || (meta && (SUP.planta(meta.plantaId) || SUP.p.plantas.find(p => p.nome === meta.planta)));
    const porTopico = new Map(); if (meta && plAlvo) meta.variaveis.forEach(v => { const t = plAlvo.tags.find(x => x.id === v.id) || plAlvo.tags.find(x => topicoCompleto(plAlvo, x.topico) === v.topico && v.topico); if (t) porTopico.set(v.id, t.id); });
    const linhas = lerCsv(await zip.file('amostras.csv').async('string')).slice(1);
    const amostras = linhas.filter(l => l.length >= 5).map(l => ({ g: porTopico.get(l[2]) || l[2], t: +l[1], v: num(l[4]) }));
    const n = await histImportar(amostras);
    let ne = 0;
    if (zip.file('eventos.csv')) {
        const evs = lerCsv(await zip.file('eventos.csv').async('string')).slice(1).filter(l => l.length >= 5).map(l => ({ t: +l[1], tipo: l[2], nivel: l[3], texto: l[4], planta: (plAlvo && plAlvo.nome) || (meta && meta.planta) || '' }));
        if (evs.length) ne = await histImportarEventos(evs);
    }
    return { amostras: n, eventos: ne };
}

// ---------------------------------------------------------------- interface
function htmlPorQueMega() {
    return `<details class="balao-info"><summary title="Por que usamos o MEGA?">ⓘ Por que o MEGA?</summary><div class="balao-info-corpo">
        <p><b>Os arquivos continuam seus.</b> Nos termos de uso do Google Drive, OneDrive, Dropbox e MEGA você mantém a propriedade e só dá uma licença para o serviço guardar e processar os arquivos.</p>
        <p><b>A diferença é quem consegue ler.</b> Google Drive, OneDrive e Dropbox criptografam, mas guardam a chave: tecnicamente podem ler o conteúdo. No MEGA a criptografia é de ponta a ponta: a chave vem da senha da equipe e o MEGA não consegue ler os arquivos nem os nomes deles.</p>
        <p><b>O que o MEGA ainda vê:</b> o e-mail da conta, o endereço de acesso (IP), o espaço usado e quando os arquivos foram enviados.</p>
        <p><b>Cuidados:</b></p>
        <ul>
            <li>Perdeu a senha sem a chave de recuperação, perdeu os dados. Ao criar a conta, baixe a <b>chave de recuperação</b>.</li>
            <li>Link público do MEGA leva a chave junto: este sistema nunca cria link; não crie links para estas pastas.</li>
            <li>Contas grátis muito tempo sem uso podem ser apagadas: entre de vez em quando.</li>
            <li>Espaço: o histórico grava quando o valor muda além da banda morta ou a cada "intervalo máximo" de cada variável; confira o tamanho dos arquivos de dia na tela Nuvem e ajuste a banda morta se crescer demais.</li>
        </ul>
        <p class="balao-info-fonte">Baseado nos termos de uso e na forma como cada serviço funciona (out/2026). Os termos mudam: confira os atuais.</p>
    </div></details>`;
}
document.addEventListener('click', e => { document.querySelectorAll('details.balao-info[open]').forEach(d => { if (!d.contains(e.target)) d.open = false; }); });
