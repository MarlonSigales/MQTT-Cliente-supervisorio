/**
 * © 2026 Supervisório MQTT — Inova Agro UFPel EMBRAPII. Código aberto; cópias permitidas desde que citadas.
 *
 * APLICAÇÃO: casca (menu, rotas, topo com conexões e alarmes), ligação dos campos à configuração (data-ref),
 * ações dos botões (data-acao), arquivo (baixar/abrir), balão com o histórico ao passar o mouse, confirmações e tour.
 * As páginas estão em paginas.js, configurar.js, controle-ui.js e relatorio.js.
 */

'use strict';

const App = { rota: 'inicio', param: '', pagina: null, versao: '20261029a' };
const PAGINAS = {};        // nome → { titulo, render(param) → html, montar?(raiz, param), atualizar?(sujos, forcar) }
const ACOES = {};          // data-acao → função(botão, evento)

function $(s, r = document) { return r.querySelector(s); }
function $$(s, r = document) { return [...r.querySelectorAll(s)]; }

function avisar(msg, tipo = 'ok', ms = 3800) {
    const a = $('#aviso');
    if (!a) return;
    a.textContent = msg;
    a.className = 'aviso-flutuante visivel ' + tipo;
    clearTimeout(avisar._t);
    avisar._t = setTimeout(() => a.classList.remove('visivel'), ms);
}
function baixarArquivo(blob, nome) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function escolherArquivo(accept = '') {
    return new Promise(ok => {
        const el = document.createElement('input'); el.type = 'file'; if (accept) el.accept = accept;
        el.onchange = () => ok(el.files && el.files[0] ? el.files[0] : null);
        el.click();
    });
}
function vazio(html) { return `<div class="vazio">${html}</div>`; }
function selo(txt, cls = '') { return `<span class="selo ${cls}">${txt}</span>`; }

// ---------------------------------------------------------------- janela de confirmação (dois passos nos comandos)
function confirmar(titulo, texto, { botao = 'Confirmar', perigo = false, campo = null } = {}) {
    return new Promise(resolve => {
        const fundo = document.createElement('div');
        fundo.className = 'janela-fundo';
        fundo.innerHTML = `<form class="janela janela-pequena" role="dialog" aria-modal="true" aria-labelledby="jn-t">
            <h2 id="jn-t">${esc(titulo)}</h2><p>${texto}</p>
            ${campo ? `<label>${esc(campo.rotulo)} <input type="${campo.tipo || 'text'}" name="campo" value="${escAttr(campo.valor || '')}" ${campo.extra || ''}></label>` : ''}
            <div class="janela-rodape"><button type="button" class="btn btn-secondary" data-n="nao">Cancelar</button><button type="submit" class="btn ${perigo ? 'btn-perigo-cheio' : 'btn-primary'}">${esc(botao)}</button></div>
        </form>`;
        document.body.appendChild(fundo);
        const form = fundo.querySelector('form');
        const fim = v => { fundo.remove(); document.removeEventListener('keydown', esc_); resolve(v); };
        const esc_ = e => { if (e.key === 'Escape') fim(null); };
        document.addEventListener('keydown', esc_);
        (form.campo || form.querySelector('[type=submit]')).focus();
        if (form.campo && form.campo.select) form.campo.select();
        fundo.querySelector('[data-n=nao]').addEventListener('click', () => fim(null));
        fundo.addEventListener('click', e => { if (e.target === fundo) fim(null); });
        form.addEventListener('submit', e => { e.preventDefault(); fim(campo ? form.campo.value : true); });
    });
}

/** Comando da tela: chave alterna (com confirmação), setpoint pede o valor, botão confirma. */
async function acionarComandoTela(pl, cmdId) {
    const cm = pl.comandos.find(c => c.id === cmdId);
    if (!cm) return;
    try {
        if (estadoConexao(pl.id) !== 'conectado') throw new Error(`a planta "${pl.nome}" está sem conexão — conecte antes de comandar`);
        if (cm.tipo === 'chave') {
            const atual = estadoComando(pl, cm), novo = atual === 1 ? 0 : 1;
            if (cm.confirmar && !(await confirmar(`${novo ? 'Ligar' : 'Desligar'}: ${cm.nome}?`, `Vai publicar <code>${esc(novo ? cm.payloadLiga : cm.payloadDesliga)}</code> em <code>${esc(topicoCompleto(pl, cm.topico))}</code>.<br>Confira se é seguro ${novo ? 'ligar' : 'desligar'} no local (pessoas, travas, NR-12).`, { botao: novo ? 'Ligar' : 'Desligar', perigo: !novo }))) return;
            await comandar(pl, cm, novo);
            avisar(`${cm.nome}: comando ${novo ? 'LIGAR' : 'DESLIGAR'} enviado.`);
        } else if (cm.tipo === 'setpoint') {
            const atual = cm.tagEstado ? valorTag(cm.tagEstado) : (cm.ultimo ? cm.ultimo.valor : '');
            const v = await confirmar(cm.nome, `Faixa permitida: ${cm.min} a ${cm.max} ${esc(cm.unidade || '')}. Publica em <code>${esc(topicoCompleto(pl, cm.topico))}</code>.`, { botao: 'Enviar', campo: { rotulo: `Novo valor${cm.unidade ? ' (' + cm.unidade + ')' : ''}`, tipo: 'number', valor: atual != null ? atual : '', extra: `step="${cm.passo || 'any'}" min="${cm.min}" max="${cm.max}" required` } });
            if (v == null) return;
            await comandar(pl, cm, v);
            avisar(`${cm.nome}: ${v} ${cm.unidade || ''} enviado.`);
        } else {
            if (cm.confirmar && !(await confirmar(cm.nome + '?', `Publica <code>${esc(cm.payloadLiga)}</code> em <code>${esc(topicoCompleto(pl, cm.topico))}</code>.`))) return;
            await comandar(pl, cm, 1); avisar(`${cm.nome}: enviado.`);
        }
        agendarTela(true);
    } catch (e) { avisar('Comando não enviado: ' + e.message, 'erro', 7000); logar('comando', `${cm.nome}: não enviado — ${e.message}`, pl.nome, 'erro'); }
}

// ---------------------------------------------------------------- ligação dos campos (data-ref="tipo:id.caminho")
function alvoRef(ref) {
    const m = /^([a-z]+)(?::([^.]+))?\.(.+)$/.exec(ref);
    if (!m) return null;
    const [, tipo, id, caminho] = m;
    let obj = null;
    const busca = campo => { for (const pl of SUP.p.plantas) { const o = pl[campo].find(x => x.id === id); if (o) return o; } return null; };
    if (tipo === 'tag') obj = SUP.tag(id);
    else if (tipo === 'eq') obj = SUP.equipamento(id);
    else if (tipo === 'pl') obj = SUP.planta(id);
    else if (tipo === 'cmd') obj = busca('comandos');
    else if (tipo === 'pub') obj = busca('publicacoes');
    else if (tipo === 'ctl') obj = busca('controladores');
    else if (tipo === 'ax') obj = busca('alarmesExtra');
    else if (tipo === 'area') obj = busca('areas');
    else if (tipo === 'op') obj = SUP.p.opcoes;
    else if (tipo === 'rel') obj = SUP.p.relatorio;
    else if (tipo === 'proj') obj = SUP.p;
    if (!obj) return null;
    const partes = caminho.split('.');
    for (let i = 0; i < partes.length - 1; i++) { if (obj[partes[i]] == null || typeof obj[partes[i]] !== 'object') obj[partes[i]] = {}; obj = obj[partes[i]]; }
    return { obj, chave: partes[partes.length - 1] };
}
function valorDoCampo(el) {
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'number' || el.dataset.tipo === 'num') { const v = el.value.trim(); return v === '' ? null : num(v); }
    if (el.dataset.tipo === 'lista') return [...el.selectedOptions].map(o => o.value);
    return el.value;
}
document.addEventListener('change', e => {
    const el = e.target.closest('[data-ref]');
    if (!el) return;
    const a = alvoRef(el.dataset.ref);
    if (!a) return;
    a.obj[a.chave] = valorDoCampo(el);
    if (a.chave === 'topico') a.obj.topicoAuto = false;     // editado à mão: não acompanha mais o nome do símbolo
    SUP.alterado(el.dataset.ref.split(':')[0]);
    if (el.dataset.depois && ACOES[el.dataset.depois]) ACOES[el.dataset.depois](el, e);
    if ('rerender' in el.dataset) renderPagina(true);
});
// campos de equação: confere enquanto digita
document.addEventListener('input', e => {
    const el = e.target.closest('[data-expr-pl]');
    if (!el) return;
    mostrarConferenciaExpr(el);
});
function mostrarConferenciaExpr(el) {
    const pl = SUP.planta(el.dataset.exprPl), saida = el.parentElement.querySelector('.expr-conf') || el.closest('td, label, .campo')?.querySelector('.expr-conf');
    if (!pl || !saida) return;
    const txt = el.value.trim();
    if (!txt) { saida.textContent = ''; saida.className = 'expr-conf'; return; }
    const erro = conferirExpr(txt, variaveisConhecidas(pl));
    if (erro) { saida.textContent = '✗ ' + erro; saida.className = 'expr-conf erro'; return; }
    let v; try { v = compilar(txt).f(ambientePlanta(pl)); } catch (er) { v = NaN; }
    saida.textContent = Number.isFinite(v) ? `✓ agora: ${formatarNumero(v, 3)}` : '✓ equação válida (aguardando valores)';
    saida.className = 'expr-conf ok';
}

// ---------------------------------------------------------------- ações
document.addEventListener('click', async e => {
    const b = e.target.closest('[data-acao]');
    if (!b || b.disabled) return;
    const f = ACOES[b.dataset.acao];
    if (!f) return;
    e.preventDefault();
    try { await f(b, e); }
    catch (er) { console.error(er); if (er && er.message !== 'Entrada na nuvem cancelada.') avisar(er.message || String(er), 'erro', 7000); }
});

// ---------------------------------------------------------------- balão com o histórico (passar o mouse / tocar)
let _balaoT = null, _balaoTag = null;
function mostrarBalaoTag(tagId, ret) {
    clearTimeout(_balaoT);
    _balaoT = setTimeout(async () => {
        const tg = SUP.tag(tagId); if (!tg) return;
        _balaoTag = tagId;
        let b = $('#balao-tag');
        if (!b) { b = document.createElement('div'); b.id = 'balao-tag'; b.className = 'balao-tag'; b.setAttribute('role', 'tooltip'); document.body.appendChild(b); }
        const inf = infoTag(tagId);
        const t1 = Date.now(), t0 = t1 - 3600000;
        let pts = (HIST.memoria.get(tagId) || []).filter(p => p[0] >= t0);
        if (pts.length < 20) pts = await histPontos(tagId, t0, t1);
        if (_balaoTag !== tagId) return;
        const st = estatisticas(pts, tg.limites);
        b.innerHTML = `<div class="balao-tag-topo">${icone(tg.tipo)}<b>${esc(tg.nome)}</b></div>
            <div class="balao-tag-valor">${inf && inf.v != null ? formatarNumero(inf.v, tg.dec) : '—'} <small>${esc(tg.unidade)}</small></div>
            <canvas></canvas>
            <div class="balao-tag-est">${st ? `última hora · mín. ${formatarNumero(st.min, tg.dec)} · média ${formatarNumero(st.media, tg.dec)} · máx. ${formatarNumero(st.max, tg.dec)}` : 'sem histórico na última hora'}</div>
            <div class="balao-tag-rodape">${inf ? 'atualizado ' + horaCurta(inf.t) : 'ainda sem dado'} · <code>${esc(tg.origem === 'mqtt' ? topicoCompleto(SUP.plantaDaTag(tagId), tg.topico) : tg.variavel)}</code></div>`;
        b.style.display = 'block';
        const w = b.offsetWidth, h = b.offsetHeight;
        let x = ret.left + ret.width / 2 - w / 2, y = ret.top - h - 8;
        if (y < 8) y = ret.bottom + 8;
        x = Math.max(8, Math.min(x, window.innerWidth - w - 8));
        b.style.left = x + 'px'; b.style.top = (y + window.scrollY) + 'px';
        desenharMini(b.querySelector('canvas'), reduzirSerie(pts, 300), CORES_SERIES[0], tg.limites);
    }, 180);
}
function esconderBalaoTag() { clearTimeout(_balaoT); _balaoTag = null; const b = $('#balao-tag'); if (b) b.style.display = 'none'; }
document.addEventListener('pointerover', e => {
    const n = e.target.closest('[data-balao]');
    if (n && e.pointerType === 'mouse') mostrarBalaoTag(n.dataset.balao, n.getBoundingClientRect());
});
document.addEventListener('pointerout', e => { const n = e.target.closest('[data-balao]'); if (n && !n.contains(e.relatedTarget)) esconderBalaoTag(); });
document.addEventListener('scroll', esconderBalaoTag, { passive: true });

// ---------------------------------------------------------------- casca: menu e topo
function itensMenu() {
    const itens = [['inicio', 'Visão geral', 'inicio']];
    SUP.p.plantas.forEach(pl => itens.push(['planta/' + pl.id, pl.nome, 'planta', pl.id]));
    itens.push(['sinotico', 'Sinótico', 'sinotico'], ['graficos', 'Gráficos', 'graficos'], ['alarmes', 'Alarmes e avisos', 'alarmes'], ['logs', 'Logs e MQTT', 'logs'],
        ['controle', 'Controle', 'controle'], ['horimetros', 'Horímetros e energia', 'horimetro'], ['relatorios', 'Relatórios', 'relatorio'],
        ['configurar', 'Configurar', 'configurar'], ['nuvem', 'Nuvem da equipe', 'nuvem']);
    return itens;
}
function renderMenu() {
    const nav = $('#menu');
    const atual = App.rota + (App.param ? '/' + App.param : '');
    nav.innerHTML = itensMenu().map(([rota, nome, ic, plId]) => {
        const ativo = atual === rota || (rota === App.rota && !plId) || (plId && atual.startsWith('planta/' + plId));
        const sub = plId ? ' menu-sub' : '';
        const ponto = plId ? `<i class="ponto-con con-${estadoConexao(plId)}" title="${esc(estadoConexao(plId))}"></i>` : '';
        return `${rota === 'sinotico' ? '<span class="menu-grupo">Supervisão</span>' : rota === 'configurar' ? '<span class="menu-grupo">Ajustes</span>' : ''}
            <a class="menu-link${sub}${ativo ? ' ativo' : ''}" href="#/${rota}">${plId ? ponto : icone(ic)}<span>${esc(nome)}</span>${rota === 'alarmes' ? '<b class="menu-cont" id="menu-alarmes"></b>' : ''}</a>`;
    }).join('') + (SUP.p.plantas.length ? '' : '');
    atualizarTopo();
}
function atualizarTopo() {
    const c = contagemAlarmes();
    const b = $('#topo-alarmes');
    if (b) {
        b.className = 'topo-alarmes' + (c.total ? ' tem p' + (c.pior || 4) : '') + (c.naoReconhecidos ? ' piscar' : '');
        b.innerHTML = `${icone(c.total ? 'alarmes' : 'sino_off')}<span>${c.total ? `${c.total} alarme${c.total > 1 ? 's' : ''}${c.naoReconhecidos ? ` · ${c.naoReconhecidos} a reconhecer` : ''}` : 'Sem alarmes'}</span>`;
    }
    const m = $('#menu-alarmes'); if (m) m.textContent = c.total || '';
    const con = $('#topo-conexoes');
    if (con) {
        const pls = SUP.p.plantas;
        const ok = pls.filter(p => estadoConexao(p.id) === 'conectado').length;
        con.innerHTML = pls.length ? `<i class="ponto-con con-${ok === pls.length ? 'conectado' : ok ? 'conectando' : 'desconectado'}"></i><span>${ok}/${pls.length} conectada${pls.length > 1 ? 's' : ''}</span>` : '';
        con.hidden = !pls.length;
    }
    const nv = $('#topo-nuvem');
    if (nv) { nv.hidden = !nuvemConectada(); nv.title = nuvemConectada() ? `Nuvem: ${NUVEM.email}${NUVEM.ultimoEnvio ? ' · último envio do histórico ' + horaCurta(NUVEM.ultimoEnvio) : ''}${NUVEM.ultimoErro ? ' · erro: ' + NUVEM.ultimoErro : ''}` : ''; nv.classList.toggle('erro', !!NUVEM.ultimoErro); }
    const nome = $('#topo-nome'); if (nome) nome.textContent = SUP.p.nome;
    // pontos das plantas no menu
    $$('#menu .ponto-con').forEach((p, i) => { const pl = SUP.p.plantas[i]; if (pl) p.className = 'ponto-con con-' + estadoConexao(pl.id); });
}

// ---------------------------------------------------------------- rotas
function lerRota() {
    const h = location.hash.replace(/^#\/?/, '');
    const [rota, ...resto] = h.split('/');
    App.rota = PAGINAS[rota] ? rota : 'inicio';
    App.param = decodeURIComponent(resto.join('/') || '');
}
function renderPagina(manterRolagem = false) {
    const y = window.scrollY;
    lerRota();
    const P = PAGINAS[App.rota];
    App.pagina = P;
    document.body.dataset.pagina = App.rota;
    if (App._limpar) { try { App._limpar(); } catch (e) { /* ok */ } App._limpar = null; }
    esconderBalaoTag();
    const raiz = $('#app');
    try { raiz.innerHTML = P.render(App.param); }
    catch (e) { console.error(e); raiz.innerHTML = `<div class="container"><div class="card"><h2>Algo deu errado nesta tela</h2><p class="nota">${esc(e.message)}</p></div></div>`; }
    renderMenu();
    if (P.montar) { try { App._limpar = P.montar(raiz, App.param) || null; } catch (e) { console.error(e); } }
    if (P.atualizar) P.atualizar(new Set(), true);
    $$('[data-expr-pl]', raiz).forEach(mostrarConferenciaExpr);
    if (manterRolagem) window.scrollTo(0, y); else window.scrollTo(0, 0);
    document.title = (P.titulo ? (typeof P.titulo === 'function' ? P.titulo(App.param) : P.titulo) + ' — ' : '') + 'Supervisório MQTT';
    document.body.classList.remove('menu-aberto');
}
window.addEventListener('hashchange', () => { document.querySelectorAll('.tour, .faceplate-fundo').forEach(t => t.remove()); renderPagina(); });

RT.ouvintes.add((tipo, sujos, forcar) => {
    if (tipo !== 'valores') return;
    atualizarTopo();
    if (App.pagina && App.pagina.atualizar) { try { App.pagina.atualizar(sujos, forcar); } catch (e) { console.error(e); } }
});

// ---------------------------------------------------------------- arquivo
async function arquivoProjeto() {
    const zip = new JSZip();
    zip.file('configuracao.json', JSON.stringify(SUP.p, null, 1));
    SUP.p.plantas.forEach(pl => { if (pl.sinotico.elementos.length) zip.file(`sinoticos/${nomeSeguro(pl.nome)}.svg`, svgSinoticoArquivo(pl)); });
    zip.file('LEIA-ME.txt', `Supervisório MQTT — ${SUP.p.nome}\nGerado em ${new Date().toLocaleString('pt-BR')}.\n\nconfiguracao.json: plantas, áreas, equipamentos, variáveis (tópicos), comandos, controladores e sinóticos.\nAbra em "Mais opções → Abrir arquivo". As senhas dos brokers NÃO vão no arquivo.\nO histórico (dados passados) fica no navegador e na nuvem da equipe (MEGA), um arquivo por dia e por planta.\n`);
    return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}
function svgSinoticoArquivo(pl) {
    const css = `.sin-fundo{fill:#f3f5f4}.corpo,.bolha,.valor-caixa,.cmd-caixa{fill:#e4e9e8;stroke:#4b5b59;stroke-width:2}.detalhe,.cabo{fill:none;stroke:#4b5b59;stroke-width:1.5}.fino{stroke-width:1}.tubo-linha{fill:none;stroke:#7d8c8a;stroke-width:6}.tubo-fundo,.tubo-fluxo,.tubo-toque,.sin-toque,.sin-sel-caixa,.sin-alca{display:none}.area-moldura{fill:none;stroke:#9fb3ae;stroke-dasharray:6 4}text{font-family:Arial,sans-serif;font-size:12px;fill:#1d2b2b}.sin-tagval rect{fill:#fff;stroke:#c9d4d2}.chama{fill:#c2570c}.pa{fill:#4b5b59}`;
    return svgSinotico(pl, false).replace('<rect class="sin-fundo"', `<style>${css}</style><rect class="sin-fundo"`);
}
async function abrirArquivoProjeto(arq) {
    let dados;
    if (/\.zip$/i.test(arq.name)) {
        const zip = await JSZip.loadAsync(arq);
        const f = zip.file('configuracao.json');
        if (!f) {
            if (zip.file('amostras.csv')) { const r = await importarZipDia(arq); avisar(`Histórico importado: ${r.amostras} amostra(s) e ${r.eventos} evento(s).`); return; }
            throw new Error('o ZIP não tem configuracao.json');
        }
        dados = JSON.parse(await f.async('string'));
    } else dados = JSON.parse(await arq.text());
    if (!dados || dados.formato !== SUP_FORMATO) throw new Error('este arquivo não é uma configuração do Supervisório MQTT');
    return dados;
}

Object.assign(ACOES, {
    'menu': () => document.body.classList.toggle('menu-aberto'),
    'fechar-menu': () => document.body.classList.remove('menu-aberto'),
    'baixar-arquivo': async () => { baixarArquivo(await arquivoProjeto(), `${nomeSeguro(SUP.p.nome)}-${diaISO(Date.now())}.zip`); avisar('Arquivo da configuração baixado (sem as senhas).'); },
    'abrir-arquivo': async () => {
        const arq = await escolherArquivo('.zip,.json');
        if (!arq) return;
        const dados = await abrirArquivoProjeto(arq);
        if (!dados) return;
        if (SUP.p.plantas.length && !(await confirmar('Abrir configuração?', 'A configuração atual deste navegador será substituída (o histórico continua). Baixe um arquivo antes se quiser guardar a atual.', { botao: 'Abrir' }))) return;
        SUP.substituir(dados); location.hash = '#/inicio'; renderPagina();
        avisar('Configuração aberta. Conecte as plantas na Visão geral.');
    },
    'conectar': b => { const pl = SUP.planta(b.dataset.pl); if (pl) { conectarPlanta(pl); renderPagina(true); } },
    'desconectar': b => { desconectarPlanta(b.dataset.pl); renderPagina(true); },
    'conectar-todas': () => { SUP.p.plantas.forEach(pl => { if (estadoConexao(pl.id) === 'desconectado') conectarPlanta(pl); }); renderPagina(true); },
    'comando': b => { const pl = SUP.planta(b.dataset.pl); if (pl) acionarComandoTela(pl, b.dataset.cmd); },
    'usar-modelo': async b => {
        const M = MODELOS_PRONTOS[b.dataset.modelo];
        const pl = M.montar();
        garantirVariaveis(pl);
        SUP.p.plantas.push(pl);
        if (SUP.p.plantas.length === 1 && SUP.p.nome === 'Supervisório') SUP.p.nome = pl.nome;
        SUP.alterado('tudo-local'); SUP.p.plantas.forEach(prepararPlanta);
        conectarPlanta(pl);
        location.hash = '#/planta/' + pl.id;
        avisar(`"${pl.nome}" criada em modo de simulação (sem broker). Troque para o broker real em Configurar → Conexão.`, 'ok', 8000);
        mostrarTour(true);
    },
    'planta-branco': async () => {
        const nome = await confirmar('Nova planta', 'Dê um nome (pode mudar depois).', { botao: 'Criar', campo: { rotulo: 'Nome da planta', valor: 'Minha planta' } });
        if (!nome) return;
        const pl = plantaEmBranco(nome.trim() || 'Minha planta');
        SUP.p.plantas.push(pl); SUP.alterado('planta');
        location.hash = '#/configurar/' + pl.id;
        avisar('Planta criada. Preencha a conexão com o broker e use "Descobrir tópicos" para criar as variáveis com um clique.', 'ok', 8000);
    },
    'tour': () => mostrarTour(true)
});

// ---------------------------------------------------------------- tour (até 5 balões na primeira visita)
function mostrarTour(forcar = false) {
    try { if (!forcar && localStorage.getItem('sup_tour')) return; localStorage.setItem('sup_tour', '1'); } catch (e) { /* ok */ }
    const passos = [
        ['#topo-alarmes', 'Alarmes ficam sempre aqui em cima. Pisca enquanto houver alarme sem reconhecer; clique para ver a lista.'],
        ['#menu', 'Cada planta aparece no menu com a bolinha da conexão (verde = conectada). Os painéis mostram os valores ao vivo.'],
        ['.cartao-var, .card', 'Passe o mouse sobre um valor para ver o histórico da última hora. Clique para abrir o gráfico com zoom.'],
        ['a[href="#/sinotico"]', 'No Sinótico você desenha a planta com símbolos prontos de pós-colheita e liga cada um ao equipamento.'],
        ['a[href="#/relatorios"]', 'Relatórios de energia, horímetros, variáveis e alarmes do período; saem em PDF pelo navegador.']
    ];
    let i = 0;
    const fundo = document.createElement('div'); fundo.className = 'tour';
    document.body.appendChild(fundo);
    const passo = () => {
        while (i < passos.length && !$(passos[i][0])) i++;
        if (i >= passos.length) { fundo.remove(); return; }
        const alvo = $(passos[i][0]); const r = alvo.getBoundingClientRect();
        const larg = Math.min(320, window.innerWidth - 24);
        const x = Math.max(12, Math.min(r.left, window.innerWidth - larg - 12)), y = r.bottom + 12 + 140 > window.innerHeight ? Math.max(12, r.top - 150) : r.bottom + 12;
        fundo.innerHTML = `<div class="tour-foco" style="left:${r.left - 4}px;top:${r.top - 4}px;width:${r.width + 8}px;height:${Math.min(r.height + 8, window.innerHeight)}px"></div>
            <div class="tour-balao" style="left:${x}px;top:${y}px;width:${larg}px"><small>${i + 1} de ${passos.length}</small><p>${passos[i][1]}</p>
            <div class="tour-botoes"><button type="button" class="btn btn-secondary btn-sm" data-t="sair">Fechar</button><button type="button" class="btn btn-primary btn-sm" data-t="prox">${i === passos.length - 1 ? 'Concluir' : 'Próximo'}</button></div></div>`;
        fundo.querySelector('[data-t=sair]').onclick = () => fundo.remove();
        fundo.querySelector('[data-t=prox]').onclick = () => { i++; passo(); };
    };
    setTimeout(passo, 400);
}

// ---------------------------------------------------------------- início
function iniciarApp() {
    SUP.carregar();
    iniciarRuntime();
    renderPagina();
    // reconecta o que estava conectado na última vez
    let conectar = [];
    try { conectar = JSON.parse(localStorage.getItem('sup_conectadas') || '[]'); } catch (e) { conectar = []; }
    SUP.p.plantas.filter(pl => conectar.includes(pl.id)).forEach(conectarPlanta);
    RT.ouvintes.add(() => {});
    setInterval(() => { try { localStorage.setItem('sup_conectadas', JSON.stringify([...RT.con.keys()])); } catch (e) { /* ok */ } }, 3000);
    // nuvem: entra sozinha se o navegador lembrar a senha (sem perguntar)
    if (emailLembrado()) nuvemGarantir(false).then(() => atualizarTopo()).catch(() => {});
    if (!SUP.p.plantas.length) setTimeout(() => mostrarTour(false), 800);
}
if (typeof window !== 'undefined' && !window.SUP_TESTES) document.addEventListener('DOMContentLoaded', iniciarApp);
