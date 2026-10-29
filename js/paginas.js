/**
 * © 2026 Supervisório MQTT — Inova Agro UFPel EMBRAPII. Código aberto; cópias permitidas desde que citadas.
 *
 * PÁGINAS DE OPERAÇÃO: visão geral, painel da planta, sinótico, gráficos, alarmes, logs/MQTT e horímetros.
 * Regra de tela (ISA-101): valores em texto escuro sobre fundo neutro; cor só para alarme e estado anormal;
 * cada valor tem a barra da faixa com os limites marcados, para ver "onde está" sem ler o número.
 */

'use strict';

function cabecalho(titulo, sub = '', extra = '') {
    return `<div class="page-titulo"><div><h1>${titulo}</h1>${sub ? `<p>${sub}</p>` : ''}</div>${extra ? `<div class="page-titulo-acoes">${extra}</div>` : ''}</div>`;
}
function chipConexao(pl) {
    if (typeof ehGemeo === 'function' && ehGemeo(pl)) {
        const id = idadeGemeo(pl), velho = id == null || id > 3 * gemeoOpcoes(pl).intervaloS * 1000, ge = gemeoEstado(pl.id);
        return `<span class="chip-con con-${velho ? 'erro' : 'conectado'}" title="${escAttr(ge.erro || 'Gêmeo: os dados vêm do original pela nuvem da equipe')}" data-chipcon="${pl.id}"><i class="ponto-con con-${velho ? 'erro' : 'conectado'}"></i>Gêmeo · ${id == null ? 'sem dados ainda' : 'dados de há ' + formatarDuracao(Math.round(id / 1000))}</span>`;
    }
    const e = estadoConexao(pl.id), r = RT.con.get(pl.id);
    const txt = { conectado: pl.conexao.tipo === 'simulado' ? 'Simulação rodando' : 'Conectado', conectando: 'Conectando…', erro: 'Sem conexão', desconectado: 'Desconectado' }[e];
    const tit = r && r.detalhe ? r.detalhe : '';
    return `<span class="chip-con con-${e}" title="${escAttr(tit)}" data-chipcon="${pl.id}"><i class="ponto-con con-${e}"></i>${txt}</span>`;
}
function botaoConexao(pl, pequeno = true) {
    if (typeof ehGemeo === 'function' && ehGemeo(pl)) return `<a class="btn btn-secondary ${pequeno ? 'btn-sm' : ''}" href="#/nuvem">${icone('nuvem')} Gêmeo pela nuvem</a>`;
    const e = estadoConexao(pl.id);
    return e === 'desconectado'
        ? `<button type="button" class="btn btn-primary ${pequeno ? 'btn-sm' : ''}" data-acao="conectar" data-pl="${pl.id}">${icone('conectar')} ${pl.conexao.tipo === 'simulado' ? 'Iniciar simulação' : 'Conectar'}</button>`
        : `<button type="button" class="btn btn-secondary ${pequeno ? 'btn-sm' : ''}" data-acao="desconectar" data-pl="${pl.id}">${e === 'conectado' ? 'Desconectar' : 'Parar de tentar'}</button>`;
}
function chipEstadoEquip(eq) {
    if (!eq.horimetro.ativo) return '';
    const e = RT.equip.get(eq.id), est = e ? e.estado : 'sem';
    return `<span class="chip-est est-${est}" data-esteq="${eq.id}">${NOMES_ESTADO[est]}</span>`;
}

// ---------------------------------------------------------------- cartão de variável
function cartaoVar(pl, t) {
    const erro = RT.errosCalc.get(t.id);
    return `<div class="cartao-var" data-cv="${t.id}" data-balao="${t.id}" role="button" tabindex="0" data-acao="abrir-grafico" data-tag="${t.id}" aria-label="${escAttr(t.nome)}: abrir o gráfico">
        <div class="cv-topo"><span class="cv-ico">${icone(t.tipo)}</span><span class="cv-nome">${esc(t.nome)}</span>
            <button type="button" class="btn-icone cv-editar" data-acao="renomear-tag" data-tag="${t.id}" title="Renomear">${icone('editar')}</button></div>
        <div class="cv-valor"><span data-val>—</span> <small>${esc(t.unidade)}</small></div>
        <div class="cv-barra" title="Faixa ${formatarNumero(t.faixa[0], t.dec)} a ${formatarNumero(t.faixa[1], t.dec)} ${escAttr(t.unidade)}">${marcasLimites(t)}<i data-barra></i></div>
        <div class="cv-rodape"><span data-tempo>${erro ? `<span class="falta">✗ ${esc(erro)}</span>` : t.origem === 'mqtt' ? 'aguardando dado' : ORIGENS[t.origem]}</span></div>
    </div>`;
}
function marcasLimites(t) {
    const L = t.limites; if (!L.ativo) return '';
    const [a, b] = t.faixa, pos = v => Math.max(0, Math.min(100, (v - a) / ((b - a) || 1) * 100));
    return ['ll', 'l', 'h', 'hh'].filter(k => L[k] != null && L[k] !== '').map(k => `<b class="lim lim-${k}" style="left:${pos(+L[k])}%"></b>`).join('');
}
function atualizarCartoes(raiz, sujos, forcar) {
    const agora = Date.now();
    $$('[data-cv]', raiz).forEach(c => {
        const id = c.dataset.cv;
        const t = SUP.tag(id); if (!t) return;
        const inf = infoTag(id);
        if (forcar || sujos.has(id) || RT.tick % 5 === 0) {
            const vEl = c.querySelector('[data-val]');
            vEl.textContent = inf && inf.v != null ? (t.tipo === 'estado' ? (inf.v ? 'Ligado' : 'Desligado') : formatarNumero(inf.v, t.dec)) : '—';
            const barra = c.querySelector('[data-barra]');
            if (barra) { const [a, b] = t.faixa; barra.style.width = inf && inf.v != null ? Math.max(0, Math.min(100, (inf.v - a) / ((b - a) || 1) * 100)) + '%' : '0'; }
            const al = alarmeDaTag(id);
            [1, 2, 3, 4].forEach(p => c.classList.toggle('al-p' + p, !!al && al.prioridade === p));
            c.classList.toggle('al-piscar', !!al && !al.reconhecido);
            c.classList.toggle('velho', !!inf && inf.q !== 'ok');
            const tp = c.querySelector('[data-tempo]');
            const erro = RT.errosCalc.get(id);
            if (tp) tp.innerHTML = erro ? `<span class="falta">✗ ${esc(erro)}</span>` : al ? `<span class="al-txt">${esc(TIPOS_ALARME[al.tipo])}${al.reconhecido ? '' : ' — reconhecer'}</span>` : inf ? (inf.q === 'velho' ? `<span class="falta">sem dados há ${formatarDuracao((agora - inf.t) / 1000)}</span>` : `há ${formatarDuracao((agora - inf.t) / 1000)}`) : (t.origem === 'mqtt' ? 'aguardando dado' : ORIGENS[t.origem]);
        }
    });
    $$('[data-esteq]', raiz).forEach(s => { const e = RT.equip.get(s.dataset.esteq), est = e ? e.estado : 'sem'; s.className = 'chip-est est-' + est; s.textContent = NOMES_ESTADO[est]; });
    $$('[data-hor]', raiz).forEach(s => { const e = RT.equip.get(s.dataset.hor); s.textContent = e ? formatarDuracao(e.acum.trabalhando) + ' trabalhando' : ''; });
    $$('[data-cmdbtn]', raiz).forEach(b => {
        const pl = SUP.planta(b.dataset.pl), cm = pl && pl.comandos.find(c => c.id === b.dataset.cmdbtn); if (!cm) return;
        if (cm.tipo === 'chave') { const e = estadoComando(pl, cm); b.classList.toggle('ligado', e === 1); b.querySelector('span').textContent = e === 1 ? 'Ligado' : e === 0 ? 'Desligado' : '?'; b.setAttribute('aria-pressed', e === 1); }
        else if (cm.tipo === 'setpoint') { const v = cm.tagEstado ? valorTag(cm.tagEstado) : cm.ultimo && cm.ultimo.valor; b.querySelector('span').textContent = v != null && v !== '' ? `${formatarNumero(+v, 1)} ${cm.unidade || ''}` : '—'; }
    });
    $$('[data-chipcon]', raiz).forEach(ch => { const pl = SUP.planta(ch.dataset.chipcon); if (pl) ch.outerHTML = chipConexao(pl); });
}
function botaoComando(pl, cm) {
    if (cm.tipo === 'chave') return `<button type="button" class="btn-chave" data-acao="comando" data-pl="${pl.id}" data-cmd="${cm.id}" data-cmdbtn="${cm.id}" title="${escAttr(cm.nome)}" aria-pressed="false"><i></i><b>${esc(cm.nome)}</b><span>?</span></button>`;
    if (cm.tipo === 'setpoint') return `<button type="button" class="btn-setpoint" data-acao="comando" data-pl="${pl.id}" data-cmd="${cm.id}" data-cmdbtn="${cm.id}" title="Ajustar"><b>${esc(cm.nome)}</b><span>—</span>${icone('editar')}</button>`;
    return `<button type="button" class="btn btn-secondary btn-sm" data-acao="comando" data-pl="${pl.id}" data-cmd="${cm.id}">${esc(cm.nome)}</button>`;
}

Object.assign(ACOES, {
    'abrir-grafico': (b, e) => { if (e.target.closest('.cv-editar')) return; location.hash = '#/graficos/' + b.dataset.tag; },
    'renomear-tag': async (b, e) => {
        e.stopPropagation();
        const t = SUP.tag(b.dataset.tag); if (!t) return;
        const novo = await confirmar('Renomear variável', `Tópico: <code>${esc(t.topico || t.expr || t.variavel)}</code>. O nome aparece nas telas, gráficos e relatórios.`, { botao: 'Salvar', campo: { rotulo: 'Nome', valor: t.nome } });
        if (novo == null || !novo.trim()) return;
        t.nome = novo.trim(); SUP.alterado('tag'); renderPagina(true);
    },
    'renomear-eq': async b => {
        const eq = SUP.equipamento(b.dataset.eq); if (!eq) return;
        const novo = await confirmar('Renomear equipamento', '', { botao: 'Salvar', campo: { rotulo: 'Nome', valor: eq.nome } });
        if (novo == null || !novo.trim()) return;
        eq.nome = novo.trim();
        SUP.p.plantas.forEach(pl => pl.sinotico.elementos.filter(el => el.eq === eq.id && SIMBOLOS[el.s].equip).forEach(el => { el.rotulo = eq.nome; }));
        SUP.alterado('eq'); renderPagina(true);
    }
});

// ---------------------------------------------------------------- visão geral
PAGINAS.inicio = {
    titulo: 'Visão geral',
    render() {
        const pls = SUP.p.plantas;
        if (!pls.length) return `<div class="container">${cabecalho('Supervisório MQTT', 'Acompanhe e comande plantas pelo MQTT: valores ao vivo, gráficos com zoom, alarmes, horímetros, controle e relatórios. Funciona só no navegador.')}
            ${htmlComecar()}</div>`;
        const lst = listaAlarmes();
        return `<div class="container">${cabecalho('Visão geral', `${pls.length} planta(s) · ${pls.reduce((s, p) => s + p.tags.length, 0)} variáveis`, `<button type="button" class="btn btn-secondary btn-sm" data-acao="conectar-todas">${icone('conectar')} Conectar todas</button>`)}
            <div class="grade-plantas">${pls.map(cartaoPlanta).join('')}</div>
            <section class="card"><div class="card-topo"><h2>${icone('alarmes')} Alarmes ativos</h2><a class="btn btn-secondary btn-sm" href="#/alarmes">Ver todos</a></div>
                <div id="inicio-alarmes">${htmlListaAlarmesCurta(lst.visiveis.slice(0, 8))}</div></section>
            <details class="card"><summary><h2 style="display:inline">${icone('mais')} Adicionar outra planta</h2></summary>${htmlComecar(true)}</details></div>`;
    },
    atualizar(sujos, forcar) {
        atualizarCartoes($('#app'), sujos, forcar);
        if (forcar || ALM.mudou || RT.tick % 3 === 0) { const a = $('#inicio-alarmes'); if (a) a.innerHTML = htmlListaAlarmesCurta(listaAlarmes().visiveis.slice(0, 8)); ALM.mudou = false; }
        SUP.p.plantas.forEach(pl => { const n = $(`[data-resumo="${pl.id}"]`); if (n) n.innerHTML = resumoPlanta(pl); });
    }
};
function htmlComecar(compacto = false) {
    return `<section class="${compacto ? '' : 'card'} comecar">
        ${compacto ? '' : '<h2>Comece por um modelo pronto</h2><p class="nota">Os modelos já trazem áreas, equipamentos, variáveis com tópicos, alarmes, horímetros, equações, controle, sinótico e uma simulação para testar sem broker. Depois é só apontar para o seu broker e trocar os tópicos.</p>'}
        <div class="exemplo-destaque">
            <div><span class="selo">Exemplo</span><h3>${esc(MODELOS_PRONTOS.ubg_arroz.nome.replace(/ \(.*\)$/, ''))}</h3><p>${esc(MODELOS_PRONTOS.ubg_arroz.resumo)}</p>
                <p class="nota">No broker público, cada exemplo ganha um prefixo próprio (ex.: <code>inovaagro/ubg_arroz/a1b2</code>); qualquer cliente MQTT pode ver e comandar publicando em <code>…/status/get</code> para listar todos os tópicos.</p></div>
            <div class="botoes"><button type="button" class="btn btn-primary" data-acao="usar-modelo" data-modelo="ubg_arroz">${icone('conectar')} Abrir no broker.emqx.io</button>
                <button type="button" class="btn btn-secondary" data-acao="usar-modelo" data-modelo="ubg_arroz" data-modo="simulado">Abrir sem internet (simulação)</button></div></div>
        <div class="comecar-opcoes">
            ${Object.entries(MODELOS_PRONTOS).filter(([k]) => k !== 'ubg_arroz').map(([k, M]) => `<button type="button" class="opcao" data-acao="usar-modelo" data-modelo="${k}"><b>${esc(M.nome)}</b><span>${esc(M.resumo)}</span></button>`).join('')}
            <button type="button" class="opcao" data-acao="planta-branco"><b>${icone('mais')} Planta em branco</b><span>Conecte no seu broker e use "Descobrir tópicos": o sistema lista o que chega e cria as variáveis com um clique (tipo e ícone adivinhados pelo nome).</span></button>
            <button type="button" class="opcao" data-acao="abrir-arquivo"><b>📂 Abrir arquivo</b><span>Configuração baixada antes (.zip ou .json).</span></button>
            <a class="opcao" href="#/nuvem"><b>${icone('nuvem')} Abrir da nuvem da equipe</b><span>Configurações e dados passados guardados no MEGA da equipe.</span></a>
        </div></section>`;
}
function resumoPlanta(pl) {
    const eqs = pl.equipamentos.filter(e => e.horimetro.ativo);
    const cont = { trabalhando: 0, vazio: 0, desligado: 0, sem: 0 };
    eqs.forEach(e => { const r = RT.equip.get(e.id); cont[r ? r.estado : 'sem']++; });
    const a = contagemAlarmes(pl.id);
    const pot = pl.tags.filter(t => t.tipo === 'potencia');
    const pTot = pot.find(t => /total/i.test(t.nome)) || null;
    return `<ul class="resumo-planta">
        <li><b class="${a.total ? 'txt-p' + (a.pior || 4) : ''}">${a.total}</b> alarme(s)${a.naoReconhecidos ? ` · ${a.naoReconhecidos} sem reconhecer` : ''}</li>
        ${eqs.length ? `<li><b>${cont.trabalhando}</b> trabalhando · <b>${cont.vazio}</b> em vazio · <b>${cont.desligado}</b> desligado(s)${cont.sem ? ` · ${cont.sem} sem dados` : ''}</li>` : ''}
        ${pTot ? `<li>${esc(pTot.nome)}: <b>${formatarNumero(valorTag(pTot.id), pTot.dec)}</b> ${esc(pTot.unidade)}</li>` : ''}
    </ul>`;
}
function cartaoPlanta(pl) {
    return `<section class="card cartao-planta" style="--cor:${escAttr(pl.cor)}">
        <div class="card-topo"><h2><a href="#/planta/${pl.id}">${esc(pl.nome)}</a></h2>${chipConexao(pl)}</div>
        <div data-resumo="${pl.id}">${resumoPlanta(pl)}</div>
        <div class="botoes">${botaoConexao(pl)}<a class="btn btn-secondary btn-sm" href="#/planta/${pl.id}">${icone('planta')} Painel</a><a class="btn btn-secondary btn-sm" href="#/sinotico/${pl.id}">${icone('sinotico')} Sinótico</a></div>
    </section>`;
}
function htmlListaAlarmesCurta(arr) {
    if (!arr.length) return '<p class="nota">Nenhum alarme ativo. 👍</p>';
    return `<ul class="lista-alarmes-curta">${arr.map(a => `<li class="al-linha p${a.prioridade}${a.reconhecido ? '' : ' nao-rec'}">
        <span class="al-prio">${PRIORIDADES[a.prioridade].nome}</span><span class="al-texto"><b>${esc(a.planta)}</b> · ${esc(a.texto)}${a.estado === 'normalizado' ? ' <small>(já normalizou)</small>' : ''}</span>
        <small>${horaCurta(a.desde)}</small>${a.reconhecido ? '' : `<button type="button" class="btn btn-secondary btn-sm" data-acao="reconhecer" data-k="${escAttr(a.chave)}">Reconhecer</button>`}</li>`).join('')}</ul>`;
}

// ---------------------------------------------------------------- painel da planta
PAGINAS.planta = {
    titulo: p => (SUP.planta(p) || {}).nome || 'Planta',
    render(id) {
        const pl = SUP.planta(id);
        if (!pl) return `<div class="container">${vazio('Planta não encontrada. <a href="#/inicio">Voltar</a>')}</div>`;
        const filtro = (App.filtroPlanta || '').toLowerCase();
        const passa = t => !filtro || (t.nome + ' ' + t.topico + ' ' + t.variavel).toLowerCase().includes(filtro);
        const blocos = [];
        const semArea = { id: '', nome: 'Sem área' };
        [...pl.areas, semArea].forEach(ar => {
            const eqs = pl.equipamentos.filter(e => (e.areaId || '') === ar.id);
            const soltas = pl.tags.filter(t => !t.equipId && (t.areaId || '') === ar.id && passa(t));
            const html = eqs.map(eq => {
                const tags = pl.tags.filter(t => t.equipId === eq.id && passa(t));
                const cmds = pl.comandos.filter(c => c.equipId === eq.id);
                if (!tags.length && !cmds.length && filtro) return '';
                return `<div class="bloco-equip">
                    <div class="bloco-equip-topo"><h3>${esc(eq.nome)} <button type="button" class="btn-icone" data-acao="renomear-eq" data-eq="${eq.id}" title="Renomear">${icone('editar')}</button><button type="button" class="btn-icone" data-acao="excluir-eq" data-pl="${pl.id}" data-eq="${eq.id}" title="Excluir este elemento (variáveis, comandos e desenho)">${icone('lixo')}</button></h3>${chipEstadoEquip(eq)}${eq.horimetro.ativo ? `<small class="hor" data-hor="${eq.id}"></small>` : ''}
                        <div class="cmds">${cmds.map(c => botaoComando(pl, c)).join('')}</div></div>
                    <div class="grade-vars">${tags.map(t => cartaoVar(pl, t)).join('') || '<p class="nota">Sem variáveis.</p>'}</div></div>`;
            }).join('') + (soltas.length ? `<div class="bloco-equip"><div class="grade-vars">${soltas.map(t => cartaoVar(pl, t)).join('')}</div></div>` : '');
            if (html.trim()) blocos.push(`<section class="card bloco-area"><h2>${esc(ar.nome)}</h2>${html}</section>`);
        });
        const cmdsSoltos = pl.comandos.filter(c => !c.equipId);
        return `<div class="container">${cabecalho(esc(pl.nome), pl.descricao ? esc(pl.descricao) : `Prefixo dos tópicos: <code>${esc(pl.conexao.prefixo || '(nenhum)')}</code>`, `${chipConexao(pl)} ${botaoConexao(pl)}`)}
            <div class="barra-filtro"><input type="search" placeholder="Filtrar variáveis por nome ou tópico" value="${escAttr(App.filtroPlanta || '')}" id="filtro-planta" aria-label="Filtrar variáveis">
                <a class="btn btn-secondary btn-sm" href="#/sinotico/${pl.id}">${icone('sinotico')} Sinótico</a><a class="btn btn-secondary btn-sm" href="#/configurar/${pl.id}">${icone('configurar')} Configurar</a><button type="button" class="btn btn-danger btn-sm" data-acao="cfg-excluir" data-pl="${pl.id}">${icone('lixo')} Excluir planta</button></div>
            ${cmdsSoltos.length ? `<section class="card"><h2>Comandos</h2><div class="cmds">${cmdsSoltos.map(c => botaoComando(pl, c)).join('')}</div></section>` : ''}
            ${blocos.join('') || vazio(`Nenhuma variável ainda. <a class="btn btn-primary" href="#/configurar/${pl.id}">Adicionar variáveis</a>`)}</div>`;
    },
    montar(raiz) {
        const f = $('#filtro-planta', raiz);
        if (f) f.addEventListener('input', () => { App.filtroPlanta = f.value; clearTimeout(f._t); f._t = setTimeout(() => { renderPagina(true); const g = $('#filtro-planta'); g.focus(); g.setSelectionRange(g.value.length, g.value.length); }, 300); });
    },
    atualizar(sujos, forcar) { atualizarCartoes($('#app'), sujos, forcar); }
};
document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.cartao-var')) { e.preventDefault(); e.target.click(); } });

// ---------------------------------------------------------------- sinótico
PAGINAS.sinotico = {
    titulo: 'Sinótico',
    render(id) {
        const pls = SUP.p.plantas;
        if (!pls.length) return `<div class="container">${vazio('Crie uma planta primeiro. <a href="#/inicio">Início</a>')}</div>`;
        const pl = SUP.planta(id) || pls[0];
        if (SinEd.pl !== pl) { SinEd.pl = pl; SinEd.sel = null; SinEd.desfazer = []; SinEd.refazer = []; SinEd.modoTubo = null; }
        const ed = SinEd.editando;
        const aba = SinEd.aba || 'elementos', nAba = a => Object.entries(SIMBOLOS).filter(([k, S]) => abaSimbolo(k, S) === a).length;
        const paleta = `<div class="seg paleta-abas" role="tablist" aria-label="Tipo de símbolo">${[['elementos', 'Elementos'], ['acionamentos', 'Acionamentos'], ['sensores', 'Sensores']].map(([a, n]) => `<button type="button" role="tab" class="seg-btn${aba === a ? ' ativo' : ''}" aria-selected="${aba === a}" data-sin-aba="${a}">${n} <small>${nAba(a)}</small></button>`).join('')}</div>
            <p class="nota paleta-dica">${{ elementos: 'Máquinas, silos, transportadores, tubulações. Cada um tem o ponto dos sensores (círculo pequeno vazado).', acionamentos: 'Motores, inversores, CCM, CLP, válvulas atuadas, botoeiras e chaves: o que liga, desliga e posiciona.', sensores: 'Selecione o elemento antes (ou escolha depois): o sensor nasce ligado ao ponto dos sensores dele, com tópico área/elemento/sensor.' }[aba]}</p>
            <input type="search" id="sin-busca" placeholder="Procurar símbolo (ex.: balança, metano)" aria-label="Procurar símbolo">` + GRUPOS_SIMBOLOS.map(g => `<details class="paleta-grupo"${['Recebimento e caminhões', 'Ligações', 'Sensores', 'Elétrica e automação'].includes(g) ? ' open' : ''}><summary>${g} <small></small></summary><div class="paleta-itens">
            ${Object.entries(SIMBOLOS).filter(([, S]) => S.grupo === g).map(([k, S]) => `<button type="button" class="paleta-item" data-acao="sin-add" data-s="${k}" data-aba="${abaSimbolo(k, S)}" title="${escAttr(S.nome)}" data-busca="${escAttr((S.nome + ' ' + g).toLowerCase())}">${miniSimbolo(k)}<span>${esc(S.nome)}</span></button>`).join('')}</div></details>`).join('');
        return `<div class="container container-largo">${cabecalho(`${icone('sinotico')} Sinótico`, ed ? 'Editando: ao inserir um símbolo, o equipamento, as variáveis e os comandos já são criados com tópico e unidade; clique no símbolo para editar os tópicos.' : 'Passe o mouse nos valores para ver o histórico; clique num equipamento para abrir os valores e comandos dele; clique nas chaves para comandar.',
            `<select id="sin-planta" aria-label="Planta">${pls.map(p => `<option value="${p.id}"${p === pl ? ' selected' : ''}>${esc(p.nome)}</option>`).join('')}</select>${chipConexao(pl)}
             <button type="button" class="btn ${ed ? 'btn-primary' : 'btn-secondary'} btn-sm" data-acao="sin-editar">${icone('editar')} ${ed ? 'Concluir edição' : 'Editar desenho'}</button>`)}
            <div class="sin-barra">
                <button type="button" class="btn btn-secondary btn-sm" data-sin="zoom-" title="Diminuir">−</button><button type="button" class="btn btn-secondary btn-sm" data-sin="zoom-ajustar" title="Caber na tela">${icone('ajustar')}</button><button type="button" class="btn btn-secondary btn-sm" data-sin="zoom+" title="Aumentar">+</button>
                ${ed ? `<button type="button" class="btn btn-secondary btn-sm" data-sin="desfazer">↶ Desfazer</button><button type="button" class="btn btn-secondary btn-sm" data-sin="refazer">↷ Refazer</button>
                <button type="button" class="btn btn-secondary btn-sm" data-acao="sin-add" data-s="tubo" title="Ligar uma saída a uma entrada do mesmo tipo (atalho L)">╰ Tubulação <kbd>L</kbd></button>
                <button type="button" class="btn btn-danger btn-sm" data-sin="terminar-tubo" hidden>✕ Cancelar ligação</button>
                ${htmlLegendaPortas()}
                ${pl.sinotico.elementos.some(e => e.s === 'tubo' && !e.de) ? '<button type="button" class="btn btn-secondary btn-sm" data-acao="sin-prender" title="Prende as linhas antigas às portas mais próximas (até 40 px)">Prender linhas soltas</button>' : ''}
                <details class="balao-info"><summary>⌨ Atalhos</summary><div class="balao-info-corpo"><p><kbd>L</kbd> tubulação: clique numa saída, faça as curvas clicando no vazio e termine numa entrada do mesmo tipo · <kbd>Backspace</kbd> desfaz a última curva · <kbd>L</kbd>/<kbd>Esc</kbd> cancela · <kbd>Shift</kbd> curva inclinada</p><p><kbd>R</kbd> girar · <kbd>Delete</kbd> excluir · <kbd>Ctrl</kbd>+<kbd>D</kbd> duplicar · <kbd>Ctrl</kbd>+<kbd>Z</kbd> desfazer · <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> refazer · setas movem (Shift: 1 px)</p></div></details>` : ''}
                <button type="button" class="btn btn-secondary btn-sm" data-acao="sin-baixar">${icone('baixar')} SVG</button>
                ${pl.sinotico.elementos.length ? '' : `<span class="nota">Desenho vazio: clique em "Editar desenho" ou use um modelo pronto no Início.</span>`}
            </div>
            <div class="sin-layout${ed ? ' editando' : ''}">
                ${ed ? `<aside class="sin-paleta" aria-label="Símbolos">${paleta}</aside>` : ''}
                <div class="sin-palco" id="sin-palco"></div>
                ${ed ? '<aside class="sin-props card" id="sin-props"></aside>' : ''}
            </div></div>`;
    },
    montar(raiz) {
        $('#sin-planta', raiz).addEventListener('change', e => { location.hash = '#/sinotico/' + e.target.value; });
        raiz.addEventListener('click', e => { const b = e.target.closest('[data-sin]'); if (b) sinAcao(b.dataset.sin); });
        raiz.addEventListener('change', e => {
            const el = e.target;
            if (el.dataset.sinp) sinMudarPropriedade(el.dataset.sinp, el.type === 'checkbox' ? el.checked : el.value);
            if (el.dataset.sintag) sinMarcarTag(el.dataset.sintag, el.checked);
        });
        const busca = $('#sin-busca', raiz);
        // filtro da paleta: a aba escolhida; procurando, acha em todas as abas
        const filtrar = () => {
            const q = busca ? busca.value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') : '', aba = SinEd.aba || 'elementos';
            $$('.paleta-item', raiz).forEach(b => { b.hidden = q ? !b.dataset.busca.normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q) : b.dataset.aba !== aba; });
            $$('.paleta-grupo', raiz).forEach(d => { const n = $$('.paleta-item', d).filter(b => !b.hidden).length; d.hidden = !n; d.querySelector('summary small').textContent = `(${n})`; if (q) d.open = !!n; });
        };
        if (busca) { busca.addEventListener('input', filtrar); filtrar(); }
        raiz.addEventListener('click', e => { const b = e.target.closest('[data-sin-aba]'); if (!b) return; SinEd.aba = b.dataset.sinAba; $$('[data-sin-aba]', raiz).forEach(x => { x.classList.toggle('ativo', x === b); x.setAttribute('aria-selected', x === b); }); $('.paleta-dica', raiz).textContent = { elementos: 'Máquinas, silos, transportadores, tubulações. Cada um tem o ponto dos sensores (círculo pequeno vazado).', acionamentos: 'Motores, inversores, CCM, CLP, válvulas atuadas, botoeiras e chaves: o que liga, desliga e posiciona.', sensores: 'Selecione o elemento antes (ou escolha depois): o sensor nasce ligado ao ponto dos sensores dele, com tópico área/elemento/sensor.' }[SinEd.aba]; if (busca) busca.value = ''; filtrar(); });
        const palco = $('#sin-palco', raiz);
        if (SinEd.zoom === 1 && !SinEd._ajustado) { SinEd._ajustado = true; SinEd.zoom = Math.max(0.3, Math.min(1.2, (palco.clientWidth - 4) / SinEd.pl.sinotico.largura)); }
        sinRedesenhar();
    },
    atualizar() { atualizarSinotico($('#sin-palco'), SinEd.pl); }
};
Object.assign(ACOES, {
    'sin-editar': () => { SinEd.editando = !SinEd.editando; SinEd.sel = null; SinEd.modoTubo = null; renderPagina(true); },
    'sin-add': b => sinAdicionar(b.dataset.s),
    'sin-prender': () => { sinGuardarDesfazer(); const n = conectarTubosSoltos(SinEd.pl); SUP.alterado('sinotico'); renderPagina(true); avisar(n ? `${n} linha(s) presa(s) às portas.` : 'Nenhuma linha solta perto de uma saída e de uma entrada do mesmo tipo.', n ? 'ok' : 'erro', 5000); },
    'sin-baixar': () => baixarArquivo(new Blob([svgSinoticoArquivo(SinEd.pl)], { type: 'image/svg+xml' }), `sinotico-${nomeSeguro(SinEd.pl.nome)}.svg`)
});

// ---------------------------------------------------------------- gráficos
const GRAF = { sel: [], periodo: 3600000, aoVivo: true, grafico: null, busca: '', x0: null, x1: null };
try { const s = JSON.parse(sessionStorage.getItem('sup_graf') || 'null'); if (s) Object.assign(GRAF, { sel: lista(s.sel), periodo: s.periodo || 3600000, aoVivo: s.aoVivo !== false }); } catch (e) { /* ok */ }
function guardarGraf() { try { sessionStorage.setItem('sup_graf', JSON.stringify({ sel: GRAF.sel, periodo: GRAF.periodo, aoVivo: GRAF.aoVivo })); } catch (e) { /* ok */ } }
const PERIODOS = [[900000, '15 min'], [3600000, '1 h'], [8 * 3600000, '8 h'], [86400000, '24 h'], [7 * 86400000, '7 dias'], [30 * 86400000, '30 dias']];

function serieInfo(id) {
    if (id.startsWith('est:')) { const eq = SUP.equipamento(id.slice(4)); return eq ? { nome: 'Estado: ' + eq.nome, unidade: 'estado (0 deslig. · 1 vazio · 2 trab.)', dec: 0, degrau: true } : null; }
    const t = SUP.tag(id); return t ? { nome: t.nome, unidade: t.unidade || t.tipo, dec: t.dec, limites: t.limites, degrau: t.tipo === 'estado' } : null;
}
PAGINAS.graficos = {
    titulo: 'Gráficos',
    render(param) {
        if (param && !GRAF.sel.includes(param)) { GRAF.sel = [param].concat(GRAF.sel.filter(x => x !== param)).slice(0, 8); guardarGraf(); }
        const pls = SUP.p.plantas;
        const salvos = SUP.p.opcoes.graficosSalvos;
        return `<div class="container container-largo">${cabecalho(`${icone('graficos')} Gráficos`, 'Roda do mouse: zoom no tempo · Shift + roda: zoom no valor · arrastar: mover · Ctrl + arrastar (ou modo caixa): ampliar a área · duplo clique: ajustar. No celular, pinça na horizontal ou na vertical.')}
            <div class="graf-layout">
                <aside class="card graf-sel">
                    <input type="search" id="graf-busca" placeholder="Procurar variável" value="${escAttr(GRAF.busca)}" aria-label="Procurar variável">
                    <div id="graf-arvore">${arvoreVariaveis(pls)}</div>
                    ${salvos.length ? `<h3>Conjuntos salvos</h3><ul class="lista-salvos">${salvos.map((s, i) => `<li><button type="button" class="btn-link" data-acao="graf-abrir-salvo" data-i="${i}">${esc(s.nome)}</button><button type="button" class="btn-icone" data-acao="graf-apagar-salvo" data-i="${i}" title="Apagar">×</button></li>`).join('')}</ul>` : ''}
                </aside>
                <section class="card graf-principal">
                    <div class="graf-barra">
                        <div class="seg" role="group" aria-label="Período">${PERIODOS.map(([ms, n]) => `<button type="button" class="seg-btn${GRAF.periodo === ms ? ' ativo' : ''}" data-acao="graf-periodo" data-ms="${ms}">${n}</button>`).join('')}</div>
                        <label class="campo-inline"><input type="checkbox" id="graf-vivo"${GRAF.aoVivo ? ' checked' : ''}> Ao vivo</label>
                        <span class="graf-ferr">
                            <button type="button" class="btn btn-secondary btn-sm" data-acao="graf-zoom" data-z="x-" title="Menos zoom no tempo">X−</button><button type="button" class="btn btn-secondary btn-sm" data-acao="graf-zoom" data-z="x+" title="Mais zoom no tempo">X+</button>
                            <button type="button" class="btn btn-secondary btn-sm" data-acao="graf-zoom" data-z="y-" title="Menos zoom no valor">Y−</button><button type="button" class="btn btn-secondary btn-sm" data-acao="graf-zoom" data-z="y+" title="Mais zoom no valor">Y+</button>
                            <button type="button" class="btn btn-secondary btn-sm${GRAF.grafico && GRAF.grafico.modo === 'caixa' ? ' ativo' : ''}" data-acao="graf-caixa" title="Ampliar a área desenhada">${icone('zoom')} Caixa</button>
                            <button type="button" class="btn btn-secondary btn-sm" data-acao="graf-ajustar" title="Ajustar">${icone('ajustar')}</button></span>
                    </div>
                    <div class="graf-intervalo"><label>De <input type="datetime-local" id="graf-de"></label><label>Até <input type="datetime-local" id="graf-ate"></label><button type="button" class="btn btn-secondary btn-sm" data-acao="graf-intervalo">Aplicar</button>
                        <span class="graf-ferr"><button type="button" class="btn btn-secondary btn-sm" data-acao="graf-csv">${icone('baixar')} CSV</button><button type="button" class="btn btn-secondary btn-sm" data-acao="graf-png">${icone('baixar')} PNG</button><button type="button" class="btn btn-secondary btn-sm" data-acao="graf-salvar">Salvar conjunto</button></span></div>
                    <div id="graf-aviso"></div>
                    <div id="graf-alvo"></div>
                </section>
            </div></div>`;
    },
    montar(raiz) {
        const g = new Grafico($('#graf-alvo', raiz), { aoMudarVista: (x0, x1) => { GRAF.aoVivo = false; $('#graf-vivo').checked = false; GRAF.x0 = x0; GRAF.x1 = x1; carregarGrafico(); preencherIntervalo(); } });
        GRAF.grafico = g;
        const agora = Date.now();
        if (GRAF.aoVivo || !GRAF.x0) { GRAF.x1 = agora; GRAF.x0 = agora - GRAF.periodo; }
        g.definirVista(GRAF.x0, GRAF.x1);
        carregarGrafico(); preencherIntervalo();
        $('#graf-vivo', raiz).addEventListener('change', e => { GRAF.aoVivo = e.target.checked; guardarGraf(); if (GRAF.aoVivo) { GRAF.x1 = Date.now(); GRAF.x0 = GRAF.x1 - GRAF.periodo; g.zoomY.clear(); g.definirVista(GRAF.x0, GRAF.x1); carregarGrafico(); } });
        $('#graf-busca', raiz).addEventListener('input', e => { GRAF.busca = e.target.value; $('#graf-arvore').innerHTML = arvoreVariaveis(SUP.p.plantas); });
        $('#graf-arvore', raiz).addEventListener('change', e => {
            const c = e.target.closest('[data-gsel]'); if (!c) return;
            GRAF.sel = GRAF.sel.filter(x => x !== c.dataset.gsel);
            if (c.checked) GRAF.sel.push(c.dataset.gsel);
            if (GRAF.sel.length > 8) { GRAF.sel.shift(); avisar('No máximo 8 séries por gráfico (com mais, as cores se confundem). A mais antiga saiu.', 'erro', 5000); }
            guardarGraf(); $('#graf-arvore').innerHTML = arvoreVariaveis(SUP.p.plantas); carregarGrafico();
        });
        return () => { g.destruir(); GRAF.grafico = null; };
    },
    atualizar() {
        if (!GRAF.aoVivo || !GRAF.grafico || !GRAF.series) return;
        // ao vivo: desliza a janela e acrescenta os pontos da memória
        const agora = Date.now();
        GRAF.x1 = agora; GRAF.x0 = agora - GRAF.periodo;
        GRAF.series.forEach(s => {
            const mem = HIST.memoria.get(s.id) || [];
            const ult = s.pts.length ? s.pts[s.pts.length - 1][0] : 0;
            for (const p of mem) if (p[0] > ult) s.pts.push(p);
            while (s.pts.length > 4000) s.pts.shift();
        });
        GRAF.grafico.x0 = GRAF.x0; GRAF.grafico.x1 = GRAF.x1; GRAF.grafico.desenhar();
    }
};
function arvoreVariaveis(pls) {
    const b = GRAF.busca.toLowerCase();
    const passa = n => !b || n.toLowerCase().includes(b);
    const item = (id, nome, extra = '') => `<label class="arv-item"><input type="checkbox" data-gsel="${id}"${GRAF.sel.includes(id) ? ' checked' : ''}> ${nome}${extra}</label>`;
    return pls.map(pl => {
        const grupos = [...pl.areas, { id: '', nome: 'Sem área' }].map(ar => {
            const eqs = pl.equipamentos.filter(e => (e.areaId || '') === ar.id);
            const linhas = eqs.map(eq => {
                const ts = pl.tags.filter(t => t.equipId === eq.id && passa(t.nome + eq.nome));
                const est = eq.horimetro.ativo && passa('estado ' + eq.nome) ? item('est:' + eq.id, `<i>Estado (horímetro)</i>`) : '';
                return ts.length || est ? `<div class="arv-eq"><b>${esc(eq.nome)}</b>${ts.map(t => item(t.id, `${icone(t.tipo)}${esc(t.nome)}`)).join('')}${est}</div>` : '';
            }).join('') + pl.tags.filter(t => !t.equipId && (t.areaId || '') === ar.id && passa(t.nome)).map(t => item(t.id, `${icone(t.tipo)}${esc(t.nome)}`)).join('');
            return linhas ? `<div class="arv-area"><span>${esc(ar.nome)}</span>${linhas}</div>` : '';
        }).join('');
        return grupos ? `<details class="arv-planta" open><summary>${esc(pl.nome)}</summary>${grupos}</details>` : '';
    }).join('') || '<p class="nota">Nenhuma variável.</p>';
}
/** A cor segue a variável: quem já tem cor mantém; a nova pega a primeira cor livre (nunca repinta as outras). */
function corFixaGraf(id) {
    GRAF.cores = GRAF.cores || {};
    Object.keys(GRAF.cores).forEach(k => { if (!GRAF.sel.includes(k)) delete GRAF.cores[k]; });
    if (GRAF.cores[id] == null) { const usadas = new Set(Object.values(GRAF.cores)); let s = 0; while (usadas.has(s)) s++; GRAF.cores[id] = s; }
    return corDaSerie(GRAF.cores[id]);
}
async function carregarGrafico() {
    const g = GRAF.grafico; if (!g) return;
    const x0 = GRAF.x0, x1 = GRAF.x1, marg = (x1 - x0) * 0.5;
    const pedido = (GRAF._pedido = (GRAF._pedido || 0) + 1);
    const series = [];
    let maisVelho = Infinity, alguma = false;
    for (let i = 0; i < GRAF.sel.length; i++) {
        const id = GRAF.sel[i], inf = serieInfo(id); if (!inf) continue;
        const pts = await histPontos(id, x0 - marg, x1 + marg);
        if (pts.length) { maisVelho = Math.min(maisVelho, pts[0][0]); alguma = true; }
        const tg = SUP.tag(id);
        series.push(Object.assign({ id, cor: corFixaGraf(id), pts: reduzirSerie(pts, 2500), lacunaMs: Math.max(5 * 60000, ((tg && tg.registro && tg.registro.maxS) || 60) * 3000) }, inf));
    }
    if (pedido !== GRAF._pedido) return;
    GRAF.series = series;
    g.definirSeries(series);
    const av = $('#graf-aviso');
    if (av) {
        const faltaPassado = (nuvemConectada() || emailLembrado()) && GRAF.sel.length && (!alguma || maisVelho > x0 + 60000) && x0 < Date.now() - 3600000;
        av.innerHTML = faltaPassado ? `<p class="aviso-inline">O navegador não tem dados do começo deste período. ${nuvemConectada() || emailLembrado() ? `<button type="button" class="btn btn-secondary btn-sm" data-acao="graf-nuvem">${icone('nuvem')} Buscar na nuvem da equipe</button>` : ''}</p>` : '';
    }
}
function preencherIntervalo() {
    const f = t => { const d = new Date(t - new Date().getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };
    const de = $('#graf-de'), ate = $('#graf-ate');
    if (de && GRAF.x0) { de.value = f(GRAF.x0); ate.value = f(GRAF.x1); }
}
Object.assign(ACOES, {
    'graf-periodo': b => { GRAF.periodo = +b.dataset.ms; GRAF.x1 = GRAF.aoVivo ? Date.now() : (GRAF.x1 || Date.now()); GRAF.x0 = GRAF.x1 - GRAF.periodo; guardarGraf(); GRAF.grafico.zoomY.clear(); $$('.seg-btn').forEach(x => x.classList.toggle('ativo', x === b)); GRAF.grafico.definirVista(GRAF.x0, GRAF.x1); carregarGrafico(); preencherIntervalo(); },
    'graf-zoom': b => { const z = b.dataset.z, g = GRAF.grafico; if (z[0] === 'x') g.zoomX(z[1] === '+' ? 0.6 : 1.6); else g.zoomYTodos(z[1] === '+' ? 0.7 : 1.4); },
    'graf-caixa': b => { const g = GRAF.grafico; g.modo = g.modo === 'caixa' ? 'mover' : 'caixa'; b.classList.toggle('ativo', g.modo === 'caixa'); avisar(g.modo === 'caixa' ? 'Desenhe um retângulo no gráfico para ampliar (tempo e valor).' : 'Arrastar volta a mover o gráfico.'); },
    'graf-ajustar': () => { GRAF.grafico.zoomY.clear(); if (GRAF.aoVivo) GRAF.grafico.desenhar(); else GRAF.grafico.ajustar(); },
    'graf-intervalo': () => { const a = new Date($('#graf-de').value).getTime(), b = new Date($('#graf-ate').value).getTime(); if (!(b > a)) throw new Error('o "até" precisa ser depois do "de"'); GRAF.aoVivo = false; $('#graf-vivo').checked = false; GRAF.x0 = a; GRAF.x1 = b; GRAF.grafico.zoomY.clear(); GRAF.grafico.definirVista(a, b); carregarGrafico(); },
    'graf-png': () => { const a = document.createElement('a'); a.href = GRAF.grafico.pngUrl(); a.download = `grafico-${diaISO(Date.now())}.png`; a.click(); },
    'graf-csv': async () => {
        const linhas = [];
        for (const id of GRAF.sel) { const inf = serieInfo(id); if (!inf) continue; (await histPontos(id, GRAF.x0, GRAF.x1)).forEach(p => linhas.push([new Date(p[0]).toLocaleString('pt-BR'), p[0], inf.nome, p[1], inf.unidade])); }
        linhas.sort((a, b) => a[1] - b[1]);
        baixarArquivo(new Blob([csvDe(linhas, ['data e hora', 't_ms', 'variável', 'valor', 'unidade'])], { type: 'text/csv' }), `dados-${diaISO(GRAF.x0)}.csv`);
    },
    'graf-salvar': async () => {
        if (!GRAF.sel.length) throw new Error('escolha as variáveis antes');
        const nome = await confirmar('Salvar conjunto de variáveis', 'Fica na lista à esquerda para abrir de novo com um clique.', { botao: 'Salvar', campo: { rotulo: 'Nome', valor: 'Tendência ' + (SUP.p.opcoes.graficosSalvos.length + 1) } });
        if (!nome) return;
        SUP.p.opcoes.graficosSalvos.push({ nome, sel: GRAF.sel.slice(), periodo: GRAF.periodo }); SUP.alterado('op'); renderPagina(true);
    },
    'graf-abrir-salvo': b => { const s = SUP.p.opcoes.graficosSalvos[+b.dataset.i]; GRAF.sel = s.sel.slice(); GRAF.periodo = s.periodo || GRAF.periodo; GRAF.aoVivo = true; guardarGraf(); renderPagina(true); },
    'graf-apagar-salvo': b => { SUP.p.opcoes.graficosSalvos.splice(+b.dataset.i, 1); SUP.alterado('op'); renderPagina(true); },
    'graf-nuvem': async () => {
        const plIds = new Set(GRAF.sel.map(id => { const pl = id.startsWith('est:') ? SUP.p.plantas.find(p => p.equipamentos.some(e => 'est:' + e.id === id)) : SUP.plantaDaTag(id); return pl && pl.id; }).filter(Boolean));
        let total = 0;
        for (const id of plIds) { const r = await trazerHistoricoNuvem(SUP.planta(id), GRAF.x0, GRAF.x1, dia => avisar('Baixando ' + dia + '…', 'ok', 20000)); total += r.amostras; }
        avisar(total ? `${total.toLocaleString('pt-BR')} amostra(s) trazidas da nuvem.` : 'A nuvem não tem dados deste período.');
        carregarGrafico();
    }
});

// ---------------------------------------------------------------- alarmes
PAGINAS.alarmes = {
    titulo: 'Alarmes e avisos',
    render() {
        return `<div class="container">${cabecalho(`${icone('alarmes')} Alarmes e avisos`, 'Ciclo da ISA-18.2: ativo sem reconhecer (pisca) → reconhecido → normal. Se normalizar sem reconhecimento, continua na lista até alguém ver.',
            `<button type="button" class="btn btn-primary btn-sm" data-acao="reconhecer-todos">Reconhecer todos</button>`)}
            <section class="card"><div class="card-topo"><h2>Ativos</h2><span class="contador" id="al-cont"></span></div><div id="al-ativos"></div></section>
            <section class="card"><div class="card-topo"><h2>Histórico e indicadores</h2>
                <div class="seg" role="group">${[[86400000, '24 h'], [7 * 86400000, '7 dias'], [30 * 86400000, '30 dias']].map(([ms, n]) => `<button type="button" class="seg-btn${(App.alPeriodo || 86400000) === ms ? ' ativo' : ''}" data-acao="al-periodo" data-ms="${ms}">${n}</button>`).join('')}</div></div>
                <div id="al-hist"><p class="nota">Carregando…</p></div></section>
            <section class="card"><h2>Como os alarmes são configurados</h2><p class="nota">Os limites (LL, L, H, HH), a histerese, o atraso e o tempo sem dados ficam em cada variável (Configurar → variável → Alarme). Alarmes por equação (ex.: aerar com o grão abaixo do ponto de orvalho) ficam em Configurar → Alarmes por equação. Boa prática (EEMUA 191): no máximo ~1 alarme a cada 10 min por operador; alarme que se repete muito precisa de mais atraso, histerese ou de ser revisto.</p>
                <label class="campo-inline"><input type="checkbox" data-ref="op.somAlarme"${SUP.p.opcoes.somAlarme ? ' checked' : ''}> Som curto nos alarmes urgentes e altos</label>
                <label class="campo-inline"><input type="checkbox" data-ref="op.notificacao" data-depois="pedir-notificacao"${SUP.p.opcoes.notificacao ? ' checked' : ''}> Notificação do sistema quando a página estiver em segundo plano</label></section></div>`;
    },
    montar() { carregarHistoricoAlarmes(); },
    atualizar(s, forcar) {
        if (!forcar && !ALM.mudou && RT.tick % 2) return;
        ALM.mudou = false;
        const { visiveis, suprimidos } = listaAlarmes();
        const alvo = $('#al-ativos'); if (!alvo) return;
        $('#al-cont').textContent = `${visiveis.length} na lista${suprimidos.length ? ` · ${suprimidos.length} suprimido(s)` : ''}`;
        alvo.innerHTML = visiveis.length ? `<div class="tabela-rolagem"><table class="tabela tabela-alarmes"><thead><tr><th>Prioridade</th><th>Planta</th><th>Alarme</th><th class="col-num">Valor</th><th>Desde</th><th>Situação</th><th></th></tr></thead><tbody>
            ${visiveis.map(a => `<tr class="al-linha p${a.prioridade}${a.reconhecido ? '' : ' nao-rec'}"><td><span class="al-prio">${PRIORIDADES[a.prioridade].nome}</span></td><td>${esc(a.planta)}</td><td>${esc(a.texto)}${a.vezes > 1 ? ` <small>(${a.vezes}× nesta sessão)</small>` : ''}</td>
                <td class="col-num">${a.valor != null ? formatarNumero(a.valor, 2) : ''}</td><td>${horaCurta(a.desde)}</td><td>${a.estado === 'normalizado' ? 'normalizou' : a.reconhecido ? 'ativo, reconhecido' : '<b>ativo</b>'}</td>
                <td class="col-acao"><div class="botoes">${a.reconhecido ? '' : `<button type="button" class="btn btn-secondary btn-sm" data-acao="reconhecer" data-k="${escAttr(a.chave)}">Reconhecer</button>`}<button type="button" class="btn btn-secondary btn-sm" data-acao="suprimir" data-k="${escAttr(a.chave)}">Suprimir…</button></div></td></tr>`).join('')}
            </tbody></table></div>` : '<p class="nota">Nenhum alarme ativo.</p>';
        if (suprimidos.length) alvo.innerHTML += `<details><summary>Suprimidos (${suprimidos.length})</summary><ul>${suprimidos.map(a => `<li>${esc(a.texto)} — até ${horaCurta(a.suprimidoAte)} <button type="button" class="btn-link" data-acao="dessuprimir" data-k="${escAttr(a.chave)}">voltar à lista</button></li>`).join('')}</ul></details>`;
    }
};
async function carregarHistoricoAlarmes() {
    const per = App.alPeriodo || 86400000, t1 = Date.now(), t0 = t1 - per;
    const evs = (await histEventos(t0, t1, e => e.tipo === 'alarme' && /^ATIVO/.test(e.texto)));
    const alvo = $('#al-hist'); if (!alvo) return;
    if (!evs.length) { alvo.innerHTML = '<p class="nota">Nenhum alarme no período. 👍</p>'; return; }
    const porTexto = new Map();
    evs.forEach(e => { const k = e.texto.replace(/ — .*$/, '').replace(/^ATIVO \[[^\]]+\] /, ''); porTexto.set(k, (porTexto.get(k) || 0) + 1); });
    const top = [...porTexto].sort((a, b) => b[1] - a[1]).slice(0, 10);
    const taxa = evs.length / (per / 600000);
    alvo.innerHTML = `<p><b>${evs.length}</b> alarme(s) no período · média de <b>${formatarNumero(taxa, 2)}</b> a cada 10 min ${taxa > 1 ? '<span class="falta">(acima da meta de 1 por 10 min: reveja os mais frequentes)</span>' : '<span class="ok-txt">(dentro da meta)</span>'}</p>
        <h3>Os mais frequentes</h3><div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Alarme</th><th class="col-num">Vezes</th></tr></thead><tbody>${top.map(([k, n]) => `<tr><td>${esc(k)}</td><td class="col-num">${n}</td></tr>`).join('')}</tbody></table></div>
        <details><summary>Lista do período (${evs.length})</summary><div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Quando</th><th>Planta</th><th>Alarme</th></tr></thead><tbody>${evs.slice(0, 500).map(e => `<tr><td>${dataHora(e.t)}</td><td>${esc(e.planta)}</td><td>${esc(e.texto)}</td></tr>`).join('')}</tbody></table></div></details>`;
}
Object.assign(ACOES, {
    'reconhecer': async b => { const a = ALM.ativos.get(b.dataset.k), pl = a && SUP.planta(a.plId); if (pl && ehGemeo(pl)) await gemeoReconhecer(pl, b.dataset.k); else reconhecerAlarme(b.dataset.k); agendarTela(true); },
    'reconhecer-todos': async () => {
        for (const [k, a] of [...ALM.ativos]) { const pl = SUP.planta(a.plId); if (pl && ehGemeo(pl) && !a.reconhecido && !(a.suprimidoAte > Date.now())) await gemeoReconhecer(pl, k); }
        reconhecerTodos(); agendarTela(true);
    },
    'suprimir': async b => {
        const al = ALM.ativos.get(b.dataset.k); if (!al) return;
        const r = await confirmar('Suprimir alarme', `${esc(al.texto)}<br>Some da lista e não toca por um tempo; volta sozinho depois. Fica registrado no log.`, { botao: 'Suprimir', campo: { rotulo: 'Por quantos minutos?', tipo: 'number', valor: 60, extra: 'min="5" max="1440" step="5"' } });
        if (!r) return;
        const motivo = await confirmar('Motivo (opcional)', 'Ex.: sensor em manutenção.', { botao: 'Ok', campo: { rotulo: 'Motivo', valor: '' } });
        suprimirAlarme(b.dataset.k, num(r, 60), motivo || ''); agendarTela(true);
    },
    'dessuprimir': b => { const a = ALM.ativos.get(b.dataset.k); if (a) { a.suprimidoAte = 0; ALM.mudou = true; agendarTela(true); } },
    'al-periodo': b => { App.alPeriodo = +b.dataset.ms; renderPagina(true); },
    'pedir-notificacao': el => { if (el.checked && window.Notification && Notification.permission === 'default') Notification.requestPermission(); }
});

// ---------------------------------------------------------------- logs e MQTT
const LOGS = { aba: 'eventos', pausado: false, filtro: '', tipo: '', topicoFiltro: '' };
PAGINAS.logs = {
    titulo: 'Logs e MQTT',
    render() {
        const pls = SUP.p.plantas;
        const abas = [['eventos', 'Eventos'], ['monitor', 'Monitor MQTT'], ['publicar', 'Publicar'], ['descobrir', 'Descobrir tópicos']];
        let corpo = '';
        if (LOGS.aba === 'eventos') {
            corpo = `<div class="barra-filtro"><select id="log-tipo" aria-label="Tipo"><option value="">Todos os tipos</option>${['conexao', 'comando', 'controle', 'publicacao', 'alarme', 'estado', 'horimetro', 'nuvem', 'config', 'sistema'].map(t => `<option${LOGS.tipo === t ? ' selected' : ''}>${t}</option>`).join('')}</select>
                <input type="search" id="log-filtro" placeholder="Procurar no texto" value="${escAttr(LOGS.filtro)}">
                <button type="button" class="btn btn-secondary btn-sm" data-acao="log-csv">${icone('baixar')} CSV (7 dias)</button></div><div id="log-lista"></div>`;
        } else if (LOGS.aba === 'monitor') {
            corpo = `<div class="barra-filtro"><input type="search" id="mon-filtro" placeholder="Filtrar por tópico (ex.: silo1)" value="${escAttr(LOGS.topicoFiltro)}">
                <button type="button" class="btn btn-secondary btn-sm" data-acao="mon-pausar">${LOGS.pausado ? icone('play') + ' Continuar' : icone('pausa') + ' Pausar'}</button>
                <button type="button" class="btn btn-secondary btn-sm" data-acao="mon-limpar">Limpar</button></div><div id="mon-lista" class="mon-lista"></div>`;
        } else if (LOGS.aba === 'publicar') {
            corpo = pls.length ? `<form class="grade-campos" id="form-pub" autocomplete="off">
                <label>Planta (conexão) <select name="pl">${pls.map(p => `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}</select></label>
                <label>Tópico <input type="text" name="topico" required placeholder="ex.: fazenda/ubs/secador/sp_t_ar"></label>
                <label class="largo">Mensagem (payload) <textarea name="payload" rows="3" placeholder='ex.: 1   ou   {"valor": 75}'></textarea></label>
                <label>QoS <select name="qos"><option>0</option><option selected>1</option></select></label>
                <label class="campo-inline"><input type="checkbox" name="retain"> Reter no broker (retain)</label>
                <div class="largo botoes"><button type="submit" class="btn btn-primary">Publicar</button><span class="nota">O tópico é completo (o prefixo da planta não é acrescentado aqui). Fica registrado no log.</span></div></form>` : vazio('Crie uma planta primeiro.');
        } else {
            corpo = pls.length ? pls.map(pl => {
                const ativo = RT.descobrindo.has(pl.id), mapa = RT.descobertos.get(pl.id) || new Map();
                const jaUsados = new Set(pl.tags.map(t => topicoCompleto(pl, t.topico)));
                const linhas = [...mapa].filter(([t]) => !t.endsWith('/supervisorio/status')).sort((a, b) => a[0].localeCompare(b[0]));
                return `<section class="card"><div class="card-topo"><h2>${esc(pl.nome)}</h2>${chipConexao(pl)}
                    <div class="botoes">${ativo ? `<button type="button" class="btn btn-secondary btn-sm" data-acao="desc-parar" data-pl="${pl.id}">Parar</button>` : `<button type="button" class="btn btn-primary btn-sm" data-acao="desc-iniciar" data-pl="${pl.id}">${icone('zoom')} Descobrir tópicos</button>`}
                    ${linhas.some(([t]) => !jaUsados.has(t)) ? `<button type="button" class="btn btn-secondary btn-sm" data-acao="desc-criar-todos" data-pl="${pl.id}">Criar todas as novas</button>` : ''}</div></div>
                    <p class="nota">Assina <code>${esc(ativo ? RT.descobrindo.get(pl.id) : (pl.conexao.prefixo ? pl.conexao.prefixo + '/#' : '#'))}</code> e lista o que chega. O tipo (e o ícone) é adivinhado pelo nome do tópico; confira e troque em Configurar.</p>
                    ${linhas.length ? `<div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Tópico</th><th>Última mensagem</th><th class="col-num">Msgs</th><th>Tipo sugerido</th><th></th></tr></thead><tbody>
                    ${linhas.map(([t, d]) => `<tr><td><code>${esc(t)}</code></td><td class="pequeno">${esc(d.ultimo)}</td><td class="col-num">${d.n}</td><td>${icone(adivinharTipo(t))} ${esc(TIPOS_VAR[adivinharTipo(t)].nome)}</td>
                        <td>${jaUsados.has(t) ? '<small>já é variável</small>' : `<button type="button" class="btn btn-secondary btn-sm" data-acao="desc-criar" data-pl="${pl.id}" data-t="${escAttr(t)}">Criar variável</button>`}</td></tr>`).join('')}</tbody></table></div>` : `<p class="nota">${ativo ? 'Aguardando mensagens…' : 'Nada descoberto ainda.'}</p>`}</section>`;
            }).join('') : vazio('Crie uma planta primeiro.');
        }
        return `<div class="container">${cabecalho(`${icone('logs')} Logs e MQTT`, 'Eventos guardados (conexões, comandos, controle, alarmes, horímetros) e o cliente MQTT: ver o que chega, publicar e descobrir tópicos.')}
            <div class="abas" role="tablist">${abas.map(([k, n]) => `<button type="button" role="tab" class="aba${LOGS.aba === k ? ' ativa' : ''}" aria-selected="${LOGS.aba === k}" data-acao="log-aba" data-aba="${k}">${n}</button>`).join('')}</div>
            <section class="${LOGS.aba === 'descobrir' ? '' : 'card'}">${corpo}</section></div>`;
    },
    montar(raiz) {
        if (LOGS.aba === 'eventos') {
            const recarregar = () => carregarEventosLog();
            $('#log-tipo', raiz).addEventListener('change', e => { LOGS.tipo = e.target.value; recarregar(); });
            $('#log-filtro', raiz).addEventListener('input', e => { LOGS.filtro = e.target.value; clearTimeout(LOGS._t); LOGS._t = setTimeout(recarregar, 250); });
            recarregar();
            const f = ev => { if (ev && (!LOGS.tipo || ev.tipo === LOGS.tipo)) { clearTimeout(LOGS._t2); LOGS._t2 = setTimeout(recarregar, 800); } };
            const ouvinte = (tipo, ev) => { if (tipo === 'log') f(ev); };
            RT.ouvintes.add(ouvinte);
            return () => RT.ouvintes.delete(ouvinte);
        }
        if (LOGS.aba === 'monitor') $('#mon-filtro', raiz).addEventListener('input', e => { LOGS.topicoFiltro = e.target.value; desenharMonitor(true); });
        if (LOGS.aba === 'publicar' && $('#form-pub', raiz)) $('#form-pub', raiz).addEventListener('submit', async e => {
            e.preventDefault();
            const f = e.target, pl = SUP.planta(f.pl.value);
            try { await publicar(pl, f.topico.value.trim(), f.payload.value, { qos: +f.qos.value, retain: f.retain.checked }, 'Publicação manual'); avisar('Publicado.'); }
            catch (er) { avisar('Não publicado: ' + er.message, 'erro', 6000); }
        });
        return null;
    },
    atualizar() {
        if (LOGS.aba === 'monitor') desenharMonitor();
        if (LOGS.aba === 'descobrir' && RT.tick % 3 === 0 && [...RT.descobrindo.keys()].length) {
            if (!document.activeElement || !document.activeElement.closest('#app')) renderPagina(true);
        }
    }
};
function desenharMonitor(forcar = false) {
    const alvo = $('#mon-lista'); if (!alvo || (LOGS.pausado && !forcar)) return;
    const f = LOGS.topicoFiltro.toLowerCase();
    const msgs = RT.monitor.filter(m => !f || m.topico.toLowerCase().includes(f)).slice(-250).reverse();
    alvo.innerHTML = msgs.length ? msgs.map(m => `<div class="mon-linha ${m.dir}"><span class="mon-t">${horaCurta(m.t)}</span><span class="mon-dir">${m.dir === 'rx' ? '⬇' : '⬆'}</span><code class="mon-top">${esc(m.topico)}</code><span class="mon-msg">${esc(m.txt)}</span><small>${esc(m.pl)}${m.retain ? ' · retido' : ''}${m.qos ? ' · QoS ' + m.qos : ''}</small></div>`).join('') : '<p class="nota">Nenhuma mensagem ainda (conecte uma planta).</p>';
}
async function carregarEventosLog() {
    const alvo = $('#log-lista'); if (!alvo) return;
    const f = LOGS.filtro.toLowerCase();
    const evs = await histEventos(Date.now() - 7 * 86400000, Date.now() + 1000, e => (!LOGS.tipo || e.tipo === LOGS.tipo) && (!f || (e.texto + ' ' + e.planta).toLowerCase().includes(f)), 400);
    alvo.innerHTML = evs.length ? `<div class="tabela-rolagem"><table class="tabela tabela-log"><thead><tr><th>Quando</th><th>Tipo</th><th>Planta</th><th>Evento</th></tr></thead><tbody>${evs.map(e => `<tr class="log-${esc(e.nivel)}"><td>${dataHora(e.t)}</td><td>${esc(e.tipo)}</td><td>${esc(e.planta)}</td><td>${esc(e.texto)}</td></tr>`).join('')}</tbody></table></div>${evs.length >= 400 ? '<p class="nota">Mostrando os 400 mais recentes; use o filtro ou baixe o CSV.</p>' : ''}` : '<p class="nota">Nenhum evento nos últimos 7 dias com este filtro.</p>';
}
function criarTagDescoberta(pl, topico) {
    const pre = String(pl.conexao.prefixo || '').replace(/\/+$/, '');
    const rel = pre && topico.startsWith(pre + '/') ? topico.slice(pre.length + 1) : '/' + topico;
    const tipo = adivinharTipo(topico);
    const partes = topico.split('/');
    const nome = TIPOS_VAR[tipo].nome !== 'Outro' ? `${TIPOS_VAR[tipo].nome} ${partes.slice(-2, -1).join(' ')}`.trim() : partes.slice(-2).join(' ');
    const t = criarTag({ nome, tipo, topico: rel });
    const d = (RT.descobertos.get(pl.id) || new Map()).get(topico);
    if (d && /^\s*\{/.test(d.ultimo)) { try { const o = JSON.parse(d.ultimo); const k = ['valor', 'value', 'v', 'val'].find(x => x in o) || Object.keys(o).find(x => typeof o[x] === 'number'); if (k && !['valor', 'value', 'v', 'val'].includes(k)) t.caminhoJson = k; } catch (e) { /* ok */ } }
    pl.tags.push(t); garantirVariaveis(pl);
    return t;
}
Object.assign(ACOES, {
    'log-aba': b => { LOGS.aba = b.dataset.aba; renderPagina(true); },
    'mon-pausar': () => { LOGS.pausado = !LOGS.pausado; renderPagina(true); },
    'mon-limpar': () => { RT.monitor.length = 0; desenharMonitor(true); },
    'log-csv': async () => { const evs = await histEventos(Date.now() - 7 * 86400000, Date.now() + 1000); baixarArquivo(new Blob([csvDe(evs.reverse().map(e => [dataHora(e.t), e.tipo, e.nivel, e.planta, e.texto]), ['quando', 'tipo', 'nível', 'planta', 'evento'])], { type: 'text/csv' }), `eventos-${diaISO(Date.now())}.csv`); },
    'desc-iniciar': b => { const pl = SUP.planta(b.dataset.pl); if (estadoConexao(pl.id) === 'desconectado') conectarPlanta(pl); const f = descobrirTopicos(pl); avisar(`Escutando ${f}…`); renderPagina(true); },
    'desc-parar': b => { pararDescoberta(SUP.planta(b.dataset.pl)); renderPagina(true); },
    'desc-criar': b => { const pl = SUP.planta(b.dataset.pl); const t = criarTagDescoberta(pl, b.dataset.t); SUP.alterado('tag'); avisar(`Variável "${t.nome}" criada (${TIPOS_VAR[t.tipo].nome}). Renomeie e confira em Configurar.`); renderPagina(true); },
    'desc-criar-todos': b => {
        const pl = SUP.planta(b.dataset.pl), usados = new Set(pl.tags.map(t => topicoCompleto(pl, t.topico)));
        let n = 0; (RT.descobertos.get(pl.id) || new Map()).forEach((d, t) => { if (!usados.has(t) && !t.endsWith('/supervisorio/status')) { criarTagDescoberta(pl, t); n++; } });
        SUP.alterado('tag'); avisar(`${n} variável(is) criada(s).`); renderPagina(true);
    }
});

// ---------------------------------------------------------------- horímetros e energia
PAGINAS.horimetros = {
    titulo: 'Horímetros e energia',
    render() {
        const pls = SUP.p.plantas;
        const per = App.horPeriodo || 86400000;
        return `<div class="container">${cabecalho(`${icone('horimetro')} Horímetros e energia`, 'Tempo de cada equipamento desligado, ligado em vazio (girando sem carga, gastando energia à toa) e trabalhando, número de partidas e a energia gasta em vazio.',
            `<label class="campo-inline">Tarifa R$/kWh <input type="number" step="0.01" min="0" style="width:6rem" data-ref="op.tarifa" value="${SUP.p.opcoes.tarifa}"></label>`)}
            ${pls.map(pl => {
                const eqs = pl.equipamentos;
                return `<section class="card"><div class="card-topo"><h2>${esc(pl.nome)}</h2><a class="btn btn-secondary btn-sm" href="#/configurar/${pl.id}#equipamentos">${icone('configurar')} Configurar horímetros</a></div>
                ${eqs.some(e => e.horimetro.ativo) ? `<h3>Acumulado desde a última vez que foi zerado</h3><div class="tabela-rolagem"><table class="tabela tabela-hor"><thead><tr><th>Equipamento</th><th>Agora</th><th class="col-num">Trabalhando</th><th class="col-num">Em vazio</th><th class="col-num">Desligado</th><th class="col-num">Partidas</th><th class="col-num">Utilização</th><th class="col-num">Energia em vazio</th><th></th></tr></thead><tbody>
                ${eqs.filter(e => e.horimetro.ativo).map(eq => `<tr data-horlinha="${eq.id}">${linhaHorimetro(pl, eq)}</tr>`).join('')}</tbody></table></div>
                <p class="nota">Utilização = trabalhando ÷ (trabalhando + em vazio). Energia em vazio só aparece com a variável de potência do equipamento escolhida.</p>
                <h3>No período <span class="seg" role="group">${[[86400000, '24 h'], [7 * 86400000, '7 dias'], [30 * 86400000, '30 dias']].map(([ms, n]) => `<button type="button" class="seg-btn${per === ms ? ' ativo' : ''}" data-acao="hor-periodo" data-ms="${ms}">${n}</button>`).join('')}</span></h3>
                <div data-horper="${pl.id}"><p class="nota">Calculando…</p></div>`
                : `<p class="nota">Nenhum horímetro ligado. Em Configurar → Equipamentos, escolha a variável que indica funcionamento (corrente, potência ou estado) e os limites de "ligado" e "trabalhando".</p>`}</section>`;
            }).join('') || vazio('Crie uma planta primeiro.')}</div>`;
    },
    montar() { carregarHorimetrosPeriodo(); },
    atualizar() { SUP.p.plantas.forEach(pl => pl.equipamentos.filter(e => e.horimetro.ativo).forEach(eq => { const tr = $(`[data-horlinha="${eq.id}"]`); if (tr) tr.innerHTML = linhaHorimetro(pl, eq); })); }
};
function linhaHorimetro(pl, eq) {
    const e = estadoHorimetro(eq.id);
    const util = e.acum.trabalhando + e.acum.vazio > 0 ? 100 * e.acum.trabalhando / (e.acum.trabalhando + e.acum.vazio) : null;
    const tar = num(SUP.p.opcoes.tarifa, 0);
    return `<td><b>${esc(eq.nome)}</b>${RT.errosCalc.get(eq.id + ':h') ? `<br><small class="falta">${esc(RT.errosCalc.get(eq.id + ':h'))}</small>` : ''}</td><td>${chipEstadoEquip(eq)}<br><small>há ${formatarDuracao((Date.now() - e.desde) / 1000)}</small></td>
        <td class="col-num">${formatarDuracao(e.acum.trabalhando)}</td><td class="col-num">${formatarDuracao(e.acum.vazio)}</td><td class="col-num">${formatarDuracao(e.acum.desligado)}</td>
        <td class="col-num">${e.partidas}</td><td class="col-num">${util == null ? '—' : formatarNumero(util, 0) + ' %'}</td>
        <td class="col-num">${eq.tagPotencia ? `${formatarNumero(e.energia.vazio, 2)} kWh${tar ? `<br><small>R$ ${formatarNumero(e.energia.vazio * tar, 2)}</small>` : ''}` : '—'}</td>
        <td><button type="button" class="btn btn-secondary btn-sm" data-acao="hor-zerar" data-eq="${eq.id}" data-pl="${pl.id}">Zerar</button></td>`;
}
async function carregarHorimetrosPeriodo() {
    const per = App.horPeriodo || 86400000, t1 = Date.now(), t0 = t1 - per;
    for (const pl of SUP.p.plantas) {
        const alvo = $(`[data-horper="${pl.id}"]`); if (!alvo) continue;
        const linhas = [];
        for (const eq of pl.equipamentos.filter(e => e.horimetro.ativo)) linhas.push([eq, await horasNoPeriodo(eq, t0, t1)]);
        alvo.innerHTML = `<div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Equipamento</th><th>Distribuição do tempo</th><th class="col-num">Trabalhando</th><th class="col-num">Em vazio</th><th class="col-num">Partidas</th><th class="col-num">Energia total</th></tr></thead><tbody>
            ${linhas.map(([eq, h]) => `<tr><td>${esc(eq.nome)}</td><td>${barraEstados(h)}</td><td class="col-num">${formatarDuracao(h.trabalhando)}</td><td class="col-num">${formatarDuracao(h.vazio)}</td><td class="col-num">${h.partidas}</td><td class="col-num">${h.energia != null ? formatarNumero(h.energia, 2) + ' kWh' : '—'}</td></tr>`).join('')}</tbody></table></div>`;
    }
}
function barraEstados(h) {
    const tot = h.trabalhando + h.vazio + h.desligado + h.sem || 1;
    const seg = (k, t) => (h[k] > 0 ? `<i class="est-${k}" style="width:${100 * h[k] / tot}%" title="${t}: ${formatarDuracao(h[k])}"></i>` : '');
    return `<span class="barra-estados" role="img" aria-label="trabalhando ${formatarNumero(100 * h.trabalhando / tot, 0)} %, em vazio ${formatarNumero(100 * h.vazio / tot, 0)} %">${seg('trabalhando', 'Trabalhando')}${seg('vazio', 'Em vazio')}${seg('desligado', 'Desligado')}${seg('sem', 'Sem dados')}</span>`;
}
Object.assign(ACOES, {
    'hor-periodo': b => { App.horPeriodo = +b.dataset.ms; renderPagina(true); },
    'hor-zerar': async b => {
        const pl = SUP.planta(b.dataset.pl), eq = SUP.equipamento(b.dataset.eq);
        if (!(await confirmar(`Zerar o horímetro de ${eq.nome}?`, 'O valor atual fica registrado no log. O histórico do período não muda.', { botao: 'Zerar', perigo: true }))) return;
        zerarHorimetro(pl, eq); renderPagina(true);
    }
});
