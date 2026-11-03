/**
 * © 2026 Supervisório MQTT — Inova Agro UFPel EMBRAPII. Código aberto; cópias permitidas desde que citadas.
 *
 * PERFIS DE ACESSO (ISA-101 / boas práticas de IHM: quem vê, quem comanda, quem configura)
 *   operador    vê tudo, reconhece e suprime alarmes, gera relatórios (sem senha)
 *   técnico     + comanda (chaves, setpoints, botões), conecta e desconecta
 *   engenheiro  + configura: plantas, variáveis, controle, sinótico, nuvem, gêmeo, excluir
 * Cada perfil acima do operador tem um PIN (guardado como resumo SHA-256 com sal, nunca o PIN). O perfil vale para esta
 * aba e volta para operador depois de X min sem uso. Com os perfis desligados, todo mundo é engenheiro (como antes).
 * Atenção: protege contra engano e uso indevido na sala de controle, não contra quem tem acesso ao computador e às
 * ferramentas do navegador. Para o campo, a proteção de verdade é usuário/senha e ACL no broker MQTT.
 */

'use strict';

const PERFIS = { operador: { n: 1, nome: 'Operador' }, tecnico: { n: 2, nome: 'Técnico' }, engenheiro: { n: 3, nome: 'Engenheiro' } };
const ACESSO = { perfil: 'operador', ultimoUso: Date.now() };
try { const s = sessionStorage.getItem('sup_perfil'); if (s && PERFIS[s]) ACESSO.perfil = s; } catch (e) { /* ok */ }

/** Ação de cada botão → perfil mínimo (o resto é livre). */
const ACOES_PERFIL = {
    comando: 'tecnico', conectar: 'tecnico', desconectar: 'tecnico', 'conectar-todas': 'tecnico', 'pedir-status': 'tecnico',
    'sin-editar': 'engenheiro', 'cfg-excluir': 'engenheiro', 'excluir-eq': 'engenheiro', 'usar-modelo': 'engenheiro', 'planta-branco': 'engenheiro',
    'abrir-arquivo': 'engenheiro', 'renomear-eq': 'engenheiro', 'limpar-conexao': 'engenheiro', 'gemeo-papel': 'engenheiro', 'nuvem-abrir-config': 'engenheiro',
    'hist-apagar': 'engenheiro', 'lote-iniciar': 'tecnico', 'lote-encerrar': 'tecnico', 'termo-config': 'engenheiro', 'importar-csv': 'engenheiro'
};
/** Telas que só abrem a partir de um perfil. */
const PAGINAS_PERFIL = { configurar: 'engenheiro', controle: 'engenheiro', nuvem: 'engenheiro' };

function acessoAtivo() { return !!(SUP.p.acesso && SUP.p.acesso.ativo); }
function perfilAtual() { return acessoAtivo() ? ACESSO.perfil : 'engenheiro'; }
function temPerfil(min) { return PERFIS[perfilAtual()].n >= PERFIS[min].n; }
function definirPerfil(p) {
    ACESSO.perfil = p; ACESSO.ultimoUso = Date.now();
    try { sessionStorage.setItem('sup_perfil', p); } catch (e) { /* ok */ }
    logar('acesso', p === 'operador' ? 'Saiu do perfil (voltou para operador)' : `Entrou como ${PERFIS[p].nome.toLowerCase()}`);
    if (typeof atualizarTopo === 'function') atualizarTopo();
}
async function resumoPin(pin) {
    const a = SUP.p.acesso;
    if (!a.sal) a.sal = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const dados = new TextEncoder().encode(`sup:${a.sal}:${pin}`);
    const h = await crypto.subtle.digest('SHA-256', dados);
    return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function conferirPin(perfil, pin) {
    const a = SUP.p.acesso, alvo = a.pins && a.pins[perfil];
    if (!alvo) return false;
    return (await resumoPin(pin)) === alvo;
}
async function definirPin(perfil, pin) {
    if (!/^\d{4,8}$/.test(String(pin || ''))) throw new Error('o PIN tem de ter de 4 a 8 números');
    SUP.p.acesso.pins = Object.assign({}, SUP.p.acesso.pins, { [perfil]: await resumoPin(pin) });
    SUP.alterado('acesso');
}
/** Garante o perfil mínimo: se faltar, pede o PIN (de quem tem esse perfil ou acima). */
async function exigirPerfil(min, oQue = '') {
    if (temPerfil(min)) { ACESSO.ultimoUso = Date.now(); return true; }
    const r = await pedirPin(min, oQue);
    return !!r && temPerfil(min);
}
function pedirPin(min, oQue = '') {
    const a = SUP.p.acesso;
    const opcoes = Object.keys(PERFIS).filter(p => PERFIS[p].n >= PERFIS[min].n && a.pins && a.pins[p]);
    return new Promise(resolve => {
        const fundo = document.createElement('div');
        fundo.className = 'janela-fundo';
        fundo.innerHTML = `<form class="janela" autocomplete="off"><h2>🔒 Precisa do perfil ${esc(PERFIS[min].nome.toLowerCase())}</h2>
            <p class="nota">${oQue ? esc(oQue) + ' · ' : ''}Agora: <b>${esc(PERFIS[perfilAtual()].nome)}</b>.</p>
            ${opcoes.length ? `<label>Entrar como <select name="perfil">${opcoes.map(p => `<option value="${p}">${PERFIS[p].nome}</option>`).join('')}</select></label>
            <label>PIN <input type="password" name="pin" inputmode="numeric" pattern="[0-9]*" required autofocus></label>` : '<p class="falta">Nenhum PIN definido para este perfil. Peça ao engenheiro (Configurar → Acesso).</p>'}
            <p class="nuvem-erro" role="alert"></p>
            <div class="janela-rodape"><button type="button" class="btn btn-secondary" data-p="cancelar">Cancelar</button>${opcoes.length ? '<button type="submit" class="btn btn-primary">Entrar</button>' : ''}</div></form>`;
        document.body.appendChild(fundo);
        const form = fundo.querySelector('form'), erro = fundo.querySelector('.nuvem-erro');
        const fim = v => { fundo.remove(); resolve(v); };
        fundo.querySelector('[data-p=cancelar]').addEventListener('click', () => fim(false));
        if (form.pin) form.pin.focus();
        form.addEventListener('submit', async e => {
            e.preventDefault();
            const p = form.perfil.value;
            if (await conferirPin(p, form.pin.value)) { definirPerfil(p); fim(true); }
            else { erro.textContent = 'PIN não confere.'; form.pin.value = ''; form.pin.focus(); logar('acesso', `PIN errado para ${PERFIS[p].nome.toLowerCase()}`, '', 'erro'); }
        });
    });
}
/** Volta para operador depois de X min sem mexer. */
['click', 'keydown', 'pointerdown'].forEach(ev => document.addEventListener(ev, () => { ACESSO.ultimoUso = Date.now(); }, true));
setInterval(() => {
    if (!acessoAtivo() || ACESSO.perfil === 'operador') return;
    if (Date.now() - ACESSO.ultimoUso > num(SUP.p.acesso.saidaMin, 15) * 60000) { definirPerfil('operador'); if (typeof renderPagina === 'function') renderPagina(true); avisar('Perfil voltou para operador (tempo sem uso).', 'ok', 6000); }
}, 20000);

function htmlChipPerfil() {
    if (!acessoAtivo()) return '';
    const p = perfilAtual();
    return `<button type="button" class="topo-chip topo-perfil perfil-${p}" data-acao="perfil-menu" title="Perfil desta aba">👤 <span>${PERFIS[p].nome}</span></button>`;
}
/** Tela trancada (quando a página pede um perfil). */
function htmlTrancado(min) {
    return `<div class="container"><section class="card trancado"><h2>🔒 Esta tela é do perfil ${esc(PERFIS[min].nome.toLowerCase())}</h2>
        <p class="nota">Você está como <b>${esc(PERFIS[perfilAtual()].nome)}</b>. Operadores veem a planta, os gráficos, os alarmes e os relatórios; técnicos também comandam; engenheiros configuram.</p>
        <div class="botoes"><button type="button" class="btn btn-primary" data-acao="perfil-entrar" data-min="${min}">Entrar com PIN</button><a class="btn btn-secondary" href="#/inicio">Voltar</a></div></section></div>`;
}
function htmlAcessoConfig() {
    const a = SUP.p.acesso, pins = a.pins || {};
    return `<section class="card" id="acesso"><div class="card-topo"><h2>Acesso (perfis)</h2><span class="contador">${a.ativo ? 'ligado' : 'desligado'} · esta aba: ${PERFIS[perfilAtual()].nome}</span></div>
        <p class="nota">Operador vê, reconhece alarmes e gera relatórios; técnico também comanda; engenheiro configura. O PIN fica guardado como resumo (não o número). Protege contra engano na sala de controle; a proteção do campo é usuário/senha e ACL no broker.</p>
        <div class="grade-campos grade-estreita">
            <label>PIN do técnico <span class="nota">${pins.tecnico ? 'definido' : 'não definido'}</span><input type="password" inputmode="numeric" id="pin-tecnico" placeholder="4 a 8 números" autocomplete="new-password"></label>
            <label>PIN do engenheiro <span class="nota">${pins.engenheiro ? 'definido' : 'não definido'}</span><input type="password" inputmode="numeric" id="pin-engenheiro" placeholder="4 a 8 números" autocomplete="new-password"></label>
            <label>Voltar para operador após (min sem uso) <input type="number" min="1" max="480" data-ref="proj.acesso.saidaMin" value="${num(a.saidaMin, 15)}"></label></div>
        <div class="botoes"><button type="button" class="btn btn-secondary btn-sm" data-acao="acesso-pins">Gravar PINs</button>
            <button type="button" class="btn ${a.ativo ? 'btn-danger' : 'btn-primary'} btn-sm" data-acao="acesso-ligar">${a.ativo ? 'Desligar os perfis' : 'Ligar os perfis'}</button></div></section>`;
}
Object.assign(ACOES, {
    'perfil-entrar': async b => { if (await exigirPerfil(b.dataset.min || 'tecnico')) renderPagina(true); },
    'perfil-menu': async () => {
        if (ACESSO.perfil !== 'operador') { definirPerfil('operador'); renderPagina(true); avisar('Agora: operador.'); return; }
        if (await exigirPerfil('tecnico')) renderPagina(true);
    },
    'acesso-pins': async () => {
        const t = $('#pin-tecnico').value.trim(), e = $('#pin-engenheiro').value.trim();
        if (!t && !e) throw new Error('digite pelo menos um PIN');
        if (t) await definirPin('tecnico', t);
        if (e) await definirPin('engenheiro', e);
        logar('acesso', 'PINs alterados'); renderPagina(true); avisar('PIN(s) gravado(s).');
    },
    'acesso-ligar': async () => {
        const a = SUP.p.acesso;
        if (!a.ativo) {
            if (!a.pins || !a.pins.engenheiro) throw new Error('defina antes o PIN do engenheiro (senão ninguém volta a configurar)');
            a.ativo = true; definirPerfil('engenheiro');
            avisar('Perfis ligados. Esta aba está como engenheiro; clique no 👤 do topo para sair.', 'ok', 8000);
        } else { a.ativo = false; logar('acesso', 'Perfis desligados'); }
        SUP.alterado('acesso'); SUP.gravar(); renderPagina(true);
    }
});
