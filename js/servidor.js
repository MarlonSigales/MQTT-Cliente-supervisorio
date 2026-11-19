/**
 * © 2026 Supervisório MQTT — Inova Agro UFPel EMBRAPII. Código aberto; cópias permitidas desde que citadas.
 *
 * SERVIDOR AGRÍCOLA (Orange Pi com o servidor MQTT de baixo custo do TCC de Jean Pietro Colet De Carli):
 * quando o broker de uma planta é esse servidor, ele publica SERVIDOR/info (retido) e aparece no menu a página
 * "Servidor agrícola", para configurar o e-mail de envio, o horário do envio diário, os usuários e o Wi-Fi.
 *
 * Pedido:   SERVIDOR/<ação>   JSON { id, ... }      (config/get, config/set, usuarios/get, usuarios/add, usuarios/del, enviar, wifi)
 * Resposta: SERVIDOR/resposta JSON { id, acao, ok, msg, ... }
 * A senha do e-mail nunca volta da placa (config/get só diz se está definida) e não vai para o log nem para o monitor.
 */

'use strict';

const SRV = new Map();          // plId → { info, config, estado, usuarios, pend: Map(id → {resolver, tm}), carregado }

function srvDe(plId) {
    if (!SRV.has(plId)) SRV.set(plId, { info: null, config: null, estado: null, usuarios: null, pend: new Map(), carregado: false });
    return SRV.get(plId);
}
/** Plantas conectadas a um servidor agrícola que está no ar. */
function plantasComServidor() {
    return SUP.p.plantas.filter(pl => { const s = SRV.get(pl.id); return s && s.info && s.info.online !== false && estadoConexao(pl.id) === 'conectado'; });
}
/** Tópicos que toda planta MQTT assina (só o servidor agrícola publica neles). */
function servidorFiltros(pl) { return pl.conexao.tipo === 'mqtt' ? ['SERVIDOR/info', 'SERVIDOR/resposta'] : []; }

function servidorReceber(pl, topico, bytes) {
    let d;
    try { d = JSON.parse(_dec.decode(bytes)); } catch (e) { return; }
    const s = srvDe(pl.id);
    if (topico === 'SERVIDOR/info') {
        const antes = !!(s.info && s.info.online !== false);
        s.info = d && d.servidor === 'mqtt-agricola' ? d : null;
        const agora = !!(s.info && s.info.online !== false);
        if (agora !== antes) {
            logar('conexao', agora ? `Servidor agrícola encontrado (${d.placa || 'placa'}, versão ${d.versao || '?'}): página "Servidor agrícola" no menu` : 'Servidor agrícola fora do ar (o programa principal da placa parou)', pl.nome, agora ? 'info' : 'erro');
            s.carregado = false;
            if (typeof renderMenu === 'function') renderMenu();
            if (App.rota === 'servidor') renderPagina(true);
        }
        return;
    }
    if (topico === 'SERVIDOR/resposta' && d && d.id) {
        const p = s.pend.get(d.id);
        if (!p) return;
        s.pend.delete(d.id); clearTimeout(p.tm); p.resolver(d);
    }
}

/** Faz um pedido ao servidor e espera a resposta. A descrição vai para o log (nunca o conteúdo, que pode ter senha). */
async function pedirServidor(pl, acao, dados = {}, descricao = '', esperaS = 25) {
    const r = RT.con.get(pl.id);
    if (!r || r.estado !== 'conectado') throw new Error(`a planta "${pl.nome}" está sem conexão`);
    const s = srvDe(pl.id), id = Math.random().toString(36).slice(2, 10);
    const resposta = new Promise((resolver, rejeitar) => {
        const tm = setTimeout(() => { s.pend.delete(id); rejeitar(new Error(`o servidor não respondeu em ${esperaS} s`)); }, esperaS * 1000);
        s.pend.set(id, { resolver, tm });
    });
    await r.cliente.publicar('SERVIDOR/' + acao, JSON.stringify({ ...dados, id }), { qos: 1 });
    if (descricao) logar('config', `Servidor agrícola: ${descricao}`, pl.nome);
    const d = await resposta;
    if (d.config) s.config = d.config;
    if (d.estado) s.estado = d.estado;
    if (d.usuarios) s.usuarios = d.usuarios;
    if (!d.ok) throw new Error(d.msg || 'o servidor recusou o pedido');
    return d;
}
async function carregarServidor(pl) {
    const s = srvDe(pl.id);
    await pedirServidor(pl, 'config/get');
    await pedirServidor(pl, 'usuarios/get');
    s.carregado = true;
}

function plServidor(param) { const pls = plantasComServidor(); return pls.find(p => p.id === param) || pls[0] || null; }

PAGINAS.servidor = {
    titulo: 'Servidor agrícola',
    render(param) {
        const pls = plantasComServidor(), pl = plServidor(param);
        if (!pl) return `<div class="container">${cabecalho(`${icone('servidor')} Servidor agrícola`)}${vazio(`Nenhuma planta está conectada a um servidor agrícola no ar.<br>
            Conecte uma planta no broker do servidor (Configurar → Conexão → "Servidor MQTT agrícola (Orange Pi)") e esta página aparece sozinha.`)}</div>`;
        const s = srvDe(pl.id), c = s.config || {}, e = s.estado || {}, us = s.usuarios || [];
        const carregando = !s.carregado;
        const fato = (n, v, cls = '') => `<div class="srv-fato ${cls}"><span>${n}</span><b>${v}</b></div>`;
        return `<div class="container">${cabecalho(`${icone('servidor')} Servidor agrícola`, `Placa ${esc((s.info && s.info.placa) || '')} · versão ${esc((s.info && s.info.versao) || '?')} · broker da planta "${esc(pl.nome)}". O que for salvo aqui vale na hora na placa.`,
            `${pls.length > 1 ? `<select id="srv-planta" aria-label="Planta">${pls.map(p => `<option value="${p.id}"${p === pl ? ' selected' : ''}>${esc(p.nome)}</option>`).join('')}</select>` : ''}
             <button type="button" class="btn btn-secondary btn-sm" data-acao="srv-atualizar" data-pl="${pl.id}">${icone('conectar')} Atualizar</button>`)}
            ${carregando ? `<div class="card"><p class="nota">Lendo a configuração do servidor…</p></div>` : ''}

            <section class="card" id="srv-estado"><h2>Estado</h2><div class="srv-fatos">
                ${fato('IP', esc(e.ip || '—'))}
                ${fato('Internet', e.internet == null ? '—' : e.internet ? 'sim' : 'não', e.internet === false ? 'srv-ruim' : '')}
                ${fato('Wi-Fi', esc(e.wifi || 'cabo ou nenhum'))}
                ${fato('Usuários', e.usuarios == null ? '—' : e.usuarios)}
                ${fato('Dados no banco', e.dados == null ? '—' : e.dados)}
                ${fato('Envio diário', esc(c.hora_envio || '—'))}
            </div>${e.erro_banco ? `<p class="aviso-inline">Banco de dados: ${esc(e.erro_banco)}</p>` : ''}</section>

            <section class="card" id="srv-email"><h2>E-mail de envio</h2>
                <p class="nota">Conta do Gmail do projeto que envia os CSV. A senha é uma <b>senha de app</b> (Conta Google → Segurança → Verificação em duas etapas → Senhas de app), não a senha normal da conta.</p>
                <div class="grade-campos">
                    <label>Conta que envia (Gmail) <input type="email" id="srv-login" value="${escAttr(c.smtp_login || '')}" autocomplete="off"></label>
                    <label>Senha de app <input type="password" id="srv-senha" value="" autocomplete="new-password" placeholder="${c.senha_definida ? '•••••••• definida (vazio = manter)' : 'não definida'}">
                        <small>${c.senha_definida ? 'Deixe vazio para manter a atual.' : 'Sem senha o servidor não envia e-mail.'}</small></label>
                    <label>E-mail geral (recebe tudo, todo dia) <input type="email" id="srv-geral" value="${escAttr(c.email_geral || '')}" placeholder="${escAttr(c.smtp_login || '')}">
                        <small>Vazio = a própria conta que envia.</small></label>
                    <label>Horário do envio diário <input type="time" id="srv-hora" value="${escAttr(c.hora_envio || '23:00')}">
                        <small>Cada usuário recebe os seus dados; depois vai o geral e o banco é limpo.</small></label>
                </div>
                <details class="srv-avancado"><summary>Servidor de e-mail (avançado)</summary><div class="grade-campos">
                    <label>Servidor SMTP <input type="text" id="srv-host" value="${escAttr(c.smtp_host || 'smtp.gmail.com')}"></label>
                    <label>Porta <input type="number" id="srv-porta" min="1" max="65535" value="${escAttr(c.smtp_porta || 587)}"></label>
                </div></details>
                <div class="botoes"><button type="button" class="btn btn-primary" data-acao="srv-salvar" data-pl="${pl.id}">Salvar</button>
                    <button type="button" class="btn btn-secondary" data-acao="srv-teste" data-pl="${pl.id}">Enviar e-mail de teste</button></div>
            </section>

            <section class="card" id="srv-usuarios"><h2>Usuários (${us.length})</h2>
                <p class="nota">Cada usuário recebe por e-mail os dados publicados em <code>NOME/ensaio/grandeza</code> com o nome dele.</p>
                ${us.length ? `<div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Nome</th><th>E-mail</th><th class="col-num">Dados</th><th></th></tr></thead><tbody>
                    ${us.map(u => `<tr><td><b>${esc(u.nome)}</b></td><td>${esc(u.email)}</td><td class="col-num">${u.dados}</td>
                        <td class="col-acao"><div class="botoes"><button type="button" class="btn btn-secondary btn-sm" data-acao="srv-enviar-usuario" data-pl="${pl.id}" data-nome="${escAttr(u.nome)}"${u.dados ? '' : ' disabled'}>${icone('baixar')} Enviar dados</button>
                        <button type="button" class="btn btn-danger btn-sm" data-acao="srv-remover" data-pl="${pl.id}" data-nome="${escAttr(u.nome)}">${icone('lixo')} Remover</button></div></td></tr>`).join('')}
                </tbody></table></div>` : carregando ? '' : vazio('Nenhum usuário cadastrado.')}
                <div class="grade-campos srv-novo">
                    <label>Nome (como o ESP publica) <input type="text" id="srv-nome" placeholder="ex.: JEAN"></label>
                    <label>E-mail <input type="email" id="srv-email-novo" placeholder="nome@gmail.com"></label>
                </div>
                <div class="botoes"><button type="button" class="btn btn-secondary" data-acao="srv-adicionar" data-pl="${pl.id}">${icone('mais')} Cadastrar usuário</button></div>
            </section>

            <section class="card" id="srv-enviar"><h2>Enviar agora</h2>
                <p class="nota">Faz o mesmo que o envio diário: e-mail para cada usuário com os dados dele, depois o geral, e <b>limpa o banco da placa</b>. Precisa de internet na placa.</p>
                <div class="botoes"><button type="button" class="btn btn-danger" data-acao="srv-enviar-todos" data-pl="${pl.id}">Enviar tudo e limpar o banco</button></div>
            </section>

            <section class="card" id="srv-wifi"><h2>Wi-Fi da placa</h2>
                <p class="nota">Conecta a placa a uma rede Wi-Fi (por exemplo, para ter internet e enviar os e-mails). Se a placa estiver ligada a você por esse mesmo Wi-Fi, a conexão do Supervisório pode cair e voltar.</p>
                <div class="grade-campos">
                    <label>Rede (SSID) <input type="text" id="srv-ssid" autocomplete="off"></label>
                    <label>Senha <input type="password" id="srv-wsenha" autocomplete="new-password"></label>
                    <label class="largo srv-check"><input type="checkbox" id="srv-wenviar"> Depois de conectar, enviar tudo e limpar o banco</label>
                </div>
                <div class="botoes"><button type="button" class="btn btn-secondary" data-acao="srv-wifi" data-pl="${pl.id}">${icone('conectar')} Conectar a placa</button></div>
            </section>

            <p class="nota">Segurança: o broker do servidor aceita qualquer cliente da rede. A senha do e-mail passa pelo broker só quando é salva e nunca é devolvida; use em rede confiável (com <code>wss://</code>, ela vai criptografada até a placa).</p>
        </div>`;
    },
    montar(raiz, param) {
        const pl = plServidor(param);
        const sel = $('#srv-planta', raiz);
        if (sel) sel.addEventListener('change', () => { location.hash = '#/servidor/' + sel.value; });
        if (pl && !srvDe(pl.id).carregado) {
            carregarServidor(pl).then(() => { if (App.rota === 'servidor') renderPagina(true); })
                .catch(e => avisar(`Servidor agrícola: ${e.message}`, 'erro', 6000));
        }
    }
};

/** Roda uma ação da página com o botão desabilitado e mostra o resultado. */
async function acaoServidor(b, fn, recarregar = true) {
    const pl = SUP.planta(b.dataset.pl);
    if (!pl) return;
    const txt = b.innerHTML;
    b.disabled = true; b.textContent = 'Aguarde…';
    try {
        const msg = await fn(pl);
        if (msg) avisar(msg, 'ok', 5000);
        if (recarregar && App.rota === 'servidor') renderPagina(true);
    } catch (e) {
        avisar(`Servidor agrícola: ${e.message}`, 'erro', 7000);
        if (document.body.contains(b)) { b.disabled = false; b.innerHTML = txt; }
    }
}

Object.assign(ACOES, {
    'srv-atualizar': b => acaoServidor(b, async pl => { await carregarServidor(pl); return 'Atualizado'; }),
    'srv-salvar': b => acaoServidor(b, async pl => {
        const v = id => ($('#' + id) || {}).value;
        const cfg = { smtp_login: v('srv-login'), email_geral: v('srv-geral'), hora_envio: v('srv-hora'), smtp_host: v('srv-host'), smtp_porta: v('srv-porta') };
        const senha = v('srv-senha');
        if (senha) cfg.smtp_senha = senha;
        const d = await pedirServidor(pl, 'config/set', { config: cfg }, `configuração de e-mail salva${senha ? ' (com senha nova)' : ''}`);
        await pedirServidor(pl, 'config/get');
        return d.msg === 'nada mudou' ? 'Nada mudou' : 'Configuração salva na placa';
    }),
    'srv-teste': async b => {
        const pl = SUP.planta(b.dataset.pl), s = srvDe(pl.id);
        const para = await confirmar('E-mail de teste', 'Envia um e-mail de teste pela conta configurada (salve antes, se mudou algo).', { botao: 'Enviar', campo: { rotulo: 'Para', tipo: 'email', valor: (s.config && s.config.smtp_login) || '' } });
        if (!para) return;
        acaoServidor(b, async () => (await pedirServidor(pl, 'enviar', { teste: true, para }, `e-mail de teste para ${para}`, 90)).msg, false);
    },
    'srv-adicionar': b => acaoServidor(b, async pl => {
        const nome = ($('#srv-nome') || {}).value || '', email = ($('#srv-email-novo') || {}).value || '';
        const d = await pedirServidor(pl, 'usuarios/add', { nome: nome.trim(), email: email.trim() }, `cadastro de ${nome.trim()}`);
        await pedirServidor(pl, 'config/get');
        return d.msg;
    }),
    'srv-remover': async b => {
        const nome = b.dataset.nome;
        if (!(await confirmar(`Remover ${nome}?`, 'O usuário deixa de receber e-mails. Os dados dele continuam no banco até o próximo envio geral.', { botao: 'Remover', perigo: true }))) return;
        acaoServidor(b, async pl => { const d = await pedirServidor(pl, 'usuarios/del', { nome }, `remoção de ${nome}`); await pedirServidor(pl, 'config/get'); return d.msg; });
    },
    'srv-enviar-usuario': b => acaoServidor(b, async pl => (await pedirServidor(pl, 'enviar', { nome: b.dataset.nome }, `envio dos dados de ${b.dataset.nome}`, 90)).msg, false),
    'srv-enviar-todos': async b => {
        if (!(await confirmar('Enviar tudo e limpar o banco?', 'Cada usuário recebe os seus dados e o e-mail geral recebe tudo. Depois disso, os dados enviados são <b>apagados da placa</b>.', { botao: 'Enviar e limpar', perigo: true }))) return;
        acaoServidor(b, async pl => { const d = await pedirServidor(pl, 'enviar', { todos: true }, 'envio de tudo com limpeza do banco', 600); await carregarServidor(pl); return d.msg; });
    },
    'srv-wifi': async b => {
        const ssid = (($('#srv-ssid') || {}).value || '').trim(), senha = ($('#srv-wsenha') || {}).value || '', enviar = !!($('#srv-wenviar') || {}).checked;
        if (!ssid) { avisar('Informe a rede (SSID)', 'erro'); return; }
        if (!(await confirmar(`Conectar a placa em "${ssid}"?`, `A placa vai trocar de rede Wi-Fi${enviar ? ' e, com internet, enviar tudo e limpar o banco' : ''}. Se você usa esse Wi-Fi para falar com a placa, a conexão pode cair por alguns segundos.`, { botao: 'Conectar' }))) return;
        acaoServidor(b, async pl => (await pedirServidor(pl, 'wifi', { ssid, senha, enviar }, `Wi-Fi da placa → ${ssid}`, enviar ? 600 : 120)).msg);
    }
});
