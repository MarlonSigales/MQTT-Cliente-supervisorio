/**
 * © 2026 Supervisório MQTT — Inova Agro UFPel EMBRAPII. Código aberto; cópias permitidas desde que citadas.
 *
 * PÁGINA CONTROLE: comandos (chaves, setpoints, botões), publicações por equação e controladores discretos
 * (PID, liga/desliga, C(z), espaço de estados, realimentação de estados com observador), com carga de ganhos por
 * arquivo/MQTT e identificação de 1ª ordem + sintonia SIMC a partir de um degrau no histórico.
 */

'use strict';

const CTL = { pl: null };

PAGINAS.controle = {
    titulo: 'Controle',
    render(id) {
        const pls = SUP.p.plantas;
        if (!pls.length) return `<div class="container">${vazio('Crie uma planta primeiro. <a href="#/inicio">Início</a>')}</div>`;
        const pl = SUP.planta(id) || SUP.planta(CTL.pl) || pls[0];
        CTL.pl = pl.id;
        return `<div class="container">${cabecalho(`${icone('controle')} Controle`, 'Comandos, publicações calculadas e controladores discretos rodando no supervisório (ciclo de 1 s). O controle crítico e rápido deve ficar no CLP/embarcado; aqui ficam referências, malhas lentas e ensaios.',
            `<select id="ctl-planta" aria-label="Planta">${pls.map(p => `<option value="${p.id}"${p === pl ? ' selected' : ''}>${esc(p.nome)}</option>`).join('')}</select>${chipConexao(pl)}`)}
            <section class="card"><div class="card-topo"><h2>Comandos</h2><button type="button" class="btn btn-secondary btn-sm" data-acao="ctl-cmd-add" data-pl="${pl.id}">${icone('mais')} Comando</button></div>
                <p class="nota">Chave liga/desliga, setpoint (número com faixa permitida) ou botão. Com "confirmar", a tela pede confirmação antes de publicar. Use a variável de estado (retorno do campo) para a chave mostrar o estado real e não só o último comando.</p>
                ${pl.comandos.map(c => htmlComando(pl, c)).join('') || '<p class="nota">Nenhum comando.</p>'}</section>
            <section class="card"><div class="card-topo"><h2>Publicações por equação</h2><button type="button" class="btn btn-secondary btn-sm" data-acao="ctl-pub-add" data-pl="${pl.id}">${icone('mais')} Publicação</button></div>
                <p class="nota">Calcula uma equação com as variáveis e publica o resultado no tópico a cada período (ex.: aeração automática, setpoint calculado, média para outro sistema). A condição, se preenchida, precisa ser verdadeira para publicar.</p>
                ${pl.publicacoes.map(p => htmlPublicacao(pl, p)).join('') || '<p class="nota">Nenhuma.</p>'}</section>
            <section class="card"><div class="card-topo"><h2>Controladores</h2><button type="button" class="btn btn-secondary btn-sm" data-acao="ctl-add" data-pl="${pl.id}">${icone('mais')} Controlador</button></div>
                ${pl.controladores.map(c => htmlControlador(pl, c)).join('') || '<p class="nota">Nenhum controlador.</p>'}</section></div>`;
    },
    montar(raiz) { $('#ctl-planta', raiz).addEventListener('change', e => { location.hash = '#/controle/' + e.target.value; }); },
    atualizar(s, forcar) {
        atualizarCartoes($('#app'), s, forcar);
        const pl = SUP.planta(CTL.pl); if (!pl) return;
        pl.controladores.forEach(c => {
            const n = $(`[data-ctlest="${c.id}"]`); if (!n) return;
            n.innerHTML = estadoControladorHtml(pl, c);
        });
        pl.publicacoes.forEach(p => { const n = $(`[data-pubest="${p.id}"]`); if (n) { const r = RT.pubs.get(p.id); n.innerHTML = RT.errosCalc.get(p.id) ? `<span class="falta">✗ ${esc(RT.errosCalc.get(p.id))}</span>` : r && r.ultimo != null ? `último enviado: <b>${formatarNumero(r.ultimo, 3)}</b>` : p.ativo ? 'aguardando o período' : 'parada'; } });
    }
};

function htmlComando(pl, c) {
    return `<details class="linha-var" data-abre="${c.id}"${CFG.abertos.has(c.id) ? ' open' : ''}><summary><span class="lv-ico">${icone(c.tipo === 'chave' ? 'estado' : c.tipo === 'setpoint' ? 'percentual' : 'play')}</span><span class="lv-nome"><b>${esc(c.nome)}</b><small>${esc(c.tipo)} · <code>${esc(topicoCompleto(pl, c.topico) || 'sem tópico')}</code></small></span>${botaoComando(pl, c)}</summary>
        <div class="grade-campos">
            <label>Nome <input type="text" data-ref="cmd:${c.id}.nome" value="${escAttr(c.nome)}"></label>
            <label>Tipo <select data-ref="cmd:${c.id}.tipo" data-rerender><option value="chave"${c.tipo === 'chave' ? ' selected' : ''}>Chave liga/desliga</option><option value="setpoint"${c.tipo === 'setpoint' ? ' selected' : ''}>Setpoint (número)</option><option value="botao"${c.tipo === 'botao' ? ' selected' : ''}>Botão (pulso)</option></select></label>
            <label>Tópico <input type="text" data-ref="cmd:${c.id}.topico" value="${escAttr(c.topico)}" spellcheck="false"><small>${esc(topicoCompleto(pl, c.topico))}</small></label>
            <label>Equipamento <select data-ref="cmd:${c.id}.equipId">${optsEquip(pl, c.equipId)}</select></label>
            ${c.tipo !== 'setpoint' ? `<label>Mensagem ${c.tipo === 'chave' ? 'para ligar' : ''} <input type="text" data-ref="cmd:${c.id}.payloadLiga" value="${escAttr(c.payloadLiga)}"></label>` : ''}
            ${c.tipo === 'chave' ? `<label>Mensagem para desligar <input type="text" data-ref="cmd:${c.id}.payloadDesliga" value="${escAttr(c.payloadDesliga)}"></label>` : ''}
            ${c.tipo === 'setpoint' ? `<label>Mínimo <input type="number" step="any" data-ref="cmd:${c.id}.min" value="${c.min}"></label><label>Máximo <input type="number" step="any" data-ref="cmd:${c.id}.max" value="${c.max}"></label><label>Passo <input type="number" step="any" data-ref="cmd:${c.id}.passo" value="${c.passo}"></label><label>Unidade <input type="text" data-ref="cmd:${c.id}.unidade" value="${escAttr(c.unidade)}"></label>` : ''}
            <label>Estado/valor real (retorno) <select data-ref="cmd:${c.id}.tagEstado">${optsTags(pl, c.tagEstado)}</select></label>
            <label>QoS <select data-ref="cmd:${c.id}.qos" data-tipo="num"><option value="0"${+c.qos === 0 ? ' selected' : ''}>0</option><option value="1"${+c.qos === 1 ? ' selected' : ''}>1 (recomendado)</option></select></label>
            <label class="campo-inline"><input type="checkbox" data-ref="cmd:${c.id}.retain"${c.retain ? ' checked' : ''}> Reter (retain): o campo recebe o último comando ao religar</label>
            <label class="campo-inline"><input type="checkbox" data-ref="cmd:${c.id}.confirmar"${c.confirmar ? ' checked' : ''}> Pedir confirmação</label>
        </div><div class="botoes"><button type="button" class="btn btn-danger btn-sm" data-acao="ctl-cmd-del" data-pl="${pl.id}" data-id="${c.id}">${icone('lixo')} Excluir</button></div></details>`;
}
function htmlPublicacao(pl, p) {
    return `<div class="linha-pub">
        <label class="campo-inline"><input type="checkbox" data-ref="pub:${p.id}.ativo"${p.ativo ? ' checked' : ''}> Ativa</label>
        <div class="grade-campos">
            <label>Nome <input type="text" data-ref="pub:${p.id}.nome" value="${escAttr(p.nome)}"></label>
            <label>Tópico <input type="text" data-ref="pub:${p.id}.topico" value="${escAttr(p.topico)}" spellcheck="false"><small>${esc(topicoCompleto(pl, p.topico))}</small></label>
            <label class="campo largo">Equação (valor publicado) <input type="text" data-ref="pub:${p.id}.expr" data-expr-pl="${pl.id}" value="${escAttr(p.expr)}" spellcheck="false"><small class="expr-conf"></small></label>
            <label class="campo largo">Só publicar se (opcional) <input type="text" data-ref="pub:${p.id}.condicao" data-expr-pl="${pl.id}" value="${escAttr(p.condicao)}" spellcheck="false"><small class="expr-conf"></small></label>
            <label>A cada (s) <input type="number" min="1" data-ref="pub:${p.id}.periodoS" value="${p.periodoS}"></label>
            <label>Formato <select data-ref="pub:${p.id}.formato"><option value="numero"${p.formato === 'numero' ? ' selected' : ''}>número</option><option value="json"${p.formato === 'json' ? ' selected' : ''}>JSON {"valor", "t"}</option></select></label>
            <label class="campo-inline"><input type="checkbox" data-ref="pub:${p.id}.soQuandoMuda"${p.soQuandoMuda ? ' checked' : ''}> Só quando o valor muda</label>
            <label class="campo-inline"><input type="checkbox" data-ref="pub:${p.id}.retain"${p.retain ? ' checked' : ''}> Reter (retain)</label>
        </div><div class="botoes"><small data-pubest="${p.id}"></small><button type="button" class="btn btn-danger btn-sm" data-acao="ctl-pub-del" data-pl="${pl.id}" data-id="${p.id}">${icone('lixo')}</button></div></div>`;
}

function camposParams(c) {
    const P = c.params, ref = k => `data-ref="ctl:${c.id}.params.${k}"`;
    const area = (k, rot, dica) => `<label class="campo">${rot} <textarea rows="2" ${ref(k)} spellcheck="false" data-depois="ctl-recompilar">${esc(P[k] || '')}</textarea>${dica ? `<small>${dica}</small>` : ''}</label>`;
    const nu = (k, rot, dica = '') => `<label>${rot} <input type="number" step="any" ${ref(k)} value="${P[k] ?? ''}" data-depois="ctl-recompilar">${dica ? `<small>${dica}</small>` : ''}</label>`;
    const acao = `<label>Ação <select ${ref('acao')} data-depois="ctl-recompilar"><option value="direta"${P.acao !== 'reversa' ? ' selected' : ''}>direta (aumenta u para aumentar y)</option><option value="reversa"${P.acao === 'reversa' ? ' selected' : ''}>reversa (aumenta u para baixar y — resfriamento)</option></select></label>`;
    if (c.tipo === 'pid') return nu('kp', 'Kp') + nu('ki', 'Ki (1/s)', 'Ki = Kp/Ti') + nu('kd', 'Kd (s)', 'Kd = Kp·Td') + nu('N', 'Filtro da derivada N', '8 a 20') + acao;
    if (c.tipo === 'onoff') return nu('histerese', 'Histerese (unid. da medida)') + acao;
    if (c.tipo === 'tf') return area('num', 'Numerador b0 b1 … (em z⁻¹)', 'ex.: [0.5 -0.45]') + area('den', 'Denominador 1 a1 … (em z⁻¹)', 'ex.: [1 -1] (integrador)');
    if (c.tipo === 'ss') return area('Ac', 'Ac') + area('Bc', 'Bc', 'colunas = n.º de erros (referências)') + area('Cc', 'Cc', 'linhas = n.º de saídas') + area('Dc', 'Dc (opcional)');
    return area('A', 'A (modelo discreto)') + area('B', 'B') + area('C', 'C', 'linhas = n.º de medidas') + area('D', 'D (opcional)') + area('K', 'K (ganho de estados)', 'u = −K x̂ + Nr r') + area('L', 'L (observador)', 'x̂ ← A x̂ + B u + L (y − C x̂ − D u)') + area('Nr', 'Nr (pré-compensação da referência)');
}
function htmlControlador(pl, c) {
    const reg = RT.motores.get(c.id) || {};
    return `<details class="cartao-ctl" data-abre="${c.id}"${CFG.abertos.has(c.id) ? ' open' : ''}>
        <summary><span class="lv-ico">${icone('controle')}</span><span class="lv-nome"><b>${esc(c.nome)}</b><small>${esc(TIPOS_CONTROLADOR[c.tipo])} · Ts ${c.Ts} s · ${c.modo === 'manual' ? 'manual' : 'automático'}</small></span>
            <span class="selo ${c.ativo ? 'selo-ok' : ''}">${c.ativo ? 'ligado' : 'desligado'}</span>${reg.erro ? '<span class="selo selo-erro">erro</span>' : ''}</summary>
        <div class="ctl-estado" data-ctlest="${c.id}">${estadoControladorHtml(pl, c)}</div>
        <div class="botoes"><button type="button" class="btn ${c.ativo ? 'btn-danger' : 'btn-primary'} btn-sm" data-acao="ctl-ligar" data-id="${c.id}" data-pl="${pl.id}">${c.ativo ? 'Desligar controlador' : 'Ligar controlador'}</button>
            <div class="seg" role="group" aria-label="Modo"><button type="button" class="seg-btn${c.modo !== 'manual' ? ' ativo' : ''}" data-acao="ctl-modo" data-id="${c.id}" data-modo="auto">Automático</button><button type="button" class="seg-btn${c.modo === 'manual' ? ' ativo' : ''}" data-acao="ctl-modo" data-id="${c.id}" data-modo="manual">Manual</button></div>
            ${c.modo === 'manual' ? `<label class="campo-inline">Saída manual <input type="number" step="any" style="width:6rem" data-ref="ctl:${c.id}.saidaManual" value="${c.saidaManual}"></label>` : ''}</div>
        <div class="grade-campos">
            <label>Nome <input type="text" data-ref="ctl:${c.id}.nome" value="${escAttr(c.nome)}"></label>
            <label>Tipo <select data-ref="ctl:${c.id}.tipo" data-rerender data-depois="ctl-recompilar">${Object.entries(TIPOS_CONTROLADOR).map(([k, n]) => `<option value="${k}"${k === c.tipo ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
            <label>Período Ts (s) <input type="number" step="any" min="1" data-ref="ctl:${c.id}.Ts" value="${c.Ts}" data-depois="ctl-recompilar"><small>mínimo efetivo 1 s (ciclo do supervisório)</small></label>
            <label>Medida(s) y <select multiple size="3" data-tipo="lista" data-ref="ctl:${c.id}.entradas" data-depois="ctl-recompilar">${pl.tags.map(t => `<option value="${t.id}"${c.entradas.includes(t.id) ? ' selected' : ''}>${esc(t.nome)}</option>`).join('')}</select><small>Ctrl/⌘ para mais de uma (espaço de estados)</small></label>
            <label class="campo largo">Referência(s) r — número, variável ou equação; uma por linha
                <textarea rows="${Math.max(1, c.referencias.length)}" data-ctlref="${c.id}" spellcheck="false">${esc(c.referencias.join('\n'))}</textarea><small class="expr-conf">${RT.errosCalc.get(c.id) || ''}</small></label>
            ${c.saidas.map((s, i) => `<label>Saída ${c.saidas.length > 1 ? i + 1 : 'u'}: tópico <input type="text" data-ctlsaida="${c.id}" data-i="${i}" data-k="topico" value="${escAttr(s.topico)}" spellcheck="false"><small>${esc(topicoCompleto(pl, s.topico))}</small></label>
                <label>… e guardar na variável <select data-ctlsaida="${c.id}" data-i="${i}" data-k="tagId">${optsTags(pl, s.tagId, t => t.origem === 'controle', '— (só publicar)')}</select></label>`).join('')}
            <div class="largo botoes"><button type="button" class="btn btn-secondary btn-sm" data-acao="ctl-saida-add" data-id="${c.id}">+ saída</button>${c.saidas.length > 1 ? `<button type="button" class="btn btn-secondary btn-sm" data-acao="ctl-saida-del" data-id="${c.id}">− saída</button>` : ''}<button type="button" class="btn btn-secondary btn-sm" data-acao="ctl-tag-saida" data-id="${c.id}" data-pl="${pl.id}">Criar variável para a saída</button></div>
            <label>Saída mínima <input type="number" step="any" data-ref="ctl:${c.id}.limites.min" value="${c.limites.min}" data-depois="ctl-recompilar"></label>
            <label>Saída máxima <input type="number" step="any" data-ref="ctl:${c.id}.limites.max" value="${c.limites.max}" data-depois="ctl-recompilar"></label>
            <label>Variação máxima por s <input type="number" step="any" min="0" data-ref="ctl:${c.id}.limites.taxa" value="${c.limites.taxa}" data-depois="ctl-recompilar"><small>0 = sem limite</small></label>
            ${camposParams(c)}
            <label class="campo largo">Intertravamento: só controlar se (opcional) <input type="text" data-ref="ctl:${c.id}.habilitarSe" data-expr-pl="${pl.id}" value="${escAttr(c.habilitarSe)}" data-depois="ctl-recompilar" spellcheck="false" placeholder="ex.: est_vent_secador == 1"><small class="expr-conf"></small></label>
            <label>Tópico de parâmetros (opcional) <input type="text" data-ref="ctl:${c.id}.topicoParametros" value="${escAttr(c.topicoParametros)}" spellcheck="false"><small>JSON {"kp":2,"ki":0.1} ou texto "K = [1 2]; L = [..]"</small></label>
        </div>
        <div class="botoes"><button type="button" class="btn btn-secondary btn-sm" data-acao="ctl-carregar" data-id="${c.id}">📂 Carregar ganhos (.m, .txt, .json)</button>
            <button type="button" class="btn btn-secondary btn-sm" data-acao="ctl-colar" data-id="${c.id}">📋 Colar ganhos</button>
            ${['pid', 'onoff'].includes(c.tipo) || c.entradas.length === 1 ? `<button type="button" class="btn btn-secondary btn-sm" data-acao="ctl-identificar" data-id="${c.id}" data-pl="${pl.id}">${icone('graficos')} Sintonizar pelo degrau no histórico</button>` : ''}
            <a class="btn btn-secondary btn-sm" href="#/graficos/${c.entradas[0] || ''}" data-acao="ctl-grafico" data-id="${c.id}">${icone('graficos')} Gráfico r, y, u</a>
            <button type="button" class="btn btn-danger btn-sm" data-acao="ctl-del" data-id="${c.id}" data-pl="${pl.id}">${icone('lixo')} Excluir</button></div>
        <div data-ident="${c.id}"></div>
    </details>`;
}
function estadoControladorHtml(pl, c) {
    const reg = RT.motores.get(c.id) || {};
    if (reg.erro) return `<p class="falta">✗ ${esc(reg.erro)}</p>`;
    const f = (arr, dec = 3) => (arr ? arr.map(v => formatarNumero(v, dec)).join(' · ') : '—');
    const cx = c.entradas.map(id => SUP.tag(id)).filter(Boolean);
    return `<div class="ctl-valores"><span>r = <b>${f(reg.r, 2)}</b></span><span>y = <b>${f(cx.map(t => valorTag(t.id)), 2)}</b></span><span>u = <b>${f(reg.u, 2)}</b></span>
        ${reg.estado && reg.estado.P != null ? `<span><small>P ${formatarNumero(reg.estado.P, 2)} · I ${formatarNumero(reg.estado.I, 2)} · D ${formatarNumero(reg.estado.D, 2)}</small></span>` : ''}
        ${reg.estado && reg.estado.xh ? `<span><small>x̂ = [${reg.estado.xh.map(v => formatarNumero(v, 2)).join('; ')}]</small></span>` : ''}
        ${reg.bloqueio ? `<span class="falta">parado: ${esc(reg.bloqueio)}</span>` : c.ativo ? `<span class="ok-txt">${c.modo === 'manual' ? 'manual' : 'controlando'}${reg.t ? ' · ' + horaCurta(reg.t) : ''}</span>` : '<span>desligado</span>'}</div>`;
}

document.addEventListener('change', e => {
    const r = e.target.closest('[data-ctlref]');
    if (r) { const c = acharCtl(r.dataset.ctlref); c.referencias = r.value.split('\n').map(x => x.trim()).filter(Boolean); if (!c.referencias.length) c.referencias = ['0']; SUP.alterado('ctl'); renderPagina(true); }
    const s = e.target.closest('[data-ctlsaida]');
    if (s) { const c = acharCtl(s.dataset.ctlsaida); c.saidas[+s.dataset.i][s.dataset.k] = s.value; SUP.alterado('ctl'); }
});
function acharCtl(id) { for (const pl of SUP.p.plantas) { const c = pl.controladores.find(x => x.id === id); if (c) return c; } return null; }
function plDoCtl(id) { return SUP.p.plantas.find(pl => pl.controladores.some(x => x.id === id)); }

Object.assign(ACOES, {
    'ctl-cmd-add': b => { const pl = SUP.planta(b.dataset.pl); const c = criarComando({ nome: 'Novo comando', topico: 'cmd/novo' }); pl.comandos.push(c); CFG.abertos.add(c.id); SUP.alterado('cmd'); renderPagina(true); },
    'ctl-cmd-del': async b => { const pl = SUP.planta(b.dataset.pl); if (!(await confirmar('Excluir comando?', '', { botao: 'Excluir', perigo: true }))) return; pl.comandos = pl.comandos.filter(x => x.id !== b.dataset.id); SUP.alterado('cmd'); renderPagina(true); },
    'ctl-pub-add': b => { const pl = SUP.planta(b.dataset.pl); pl.publicacoes.push(criarPublicacao({ nome: 'Nova publicação', topico: 'calc/novo' })); SUP.alterado('pub'); renderPagina(true); },
    'ctl-pub-del': b => { const pl = SUP.planta(b.dataset.pl); pl.publicacoes = pl.publicacoes.filter(x => x.id !== b.dataset.id); SUP.alterado('pub'); renderPagina(true); },
    'ctl-add': b => { const pl = SUP.planta(b.dataset.pl); const c = criarControlador({ nome: 'Novo controlador', entradas: pl.tags[0] ? [pl.tags[0].id] : [] }); pl.controladores.push(c); CFG.abertos.add(c.id); SUP.alterado('ctl'); renderPagina(true); },
    'ctl-del': async b => { const pl = SUP.planta(b.dataset.pl); if (!(await confirmar('Excluir controlador?', '', { botao: 'Excluir', perigo: true }))) return; pl.controladores = pl.controladores.filter(x => x.id !== b.dataset.id); SUP.alterado('ctl'); renderPagina(true); },
    'ctl-recompilar': () => { renderPagina(true); },
    'ctl-ligar': async b => {
        const c = acharCtl(b.dataset.id), pl = SUP.planta(b.dataset.pl);
        if (!c.ativo) {
            const reg = RT.motores.get(c.id);
            if (reg && reg.erro) throw new Error('corrija antes: ' + reg.erro);
            const outros = pl.controladores.filter(x => x !== c && x.ativo && x.saidas.some(s => s.topico && c.saidas.some(z => z.topico === s.topico)));
            if (!(await confirmar(`Ligar "${c.nome}"?`, `Vai publicar a saída em <code>${esc(c.saidas.map(s => topicoCompleto(pl, s.topico)).join(', '))}</code> a cada ${c.Ts} s enquanto esta página estiver aberta e conectada.${outros.length ? `<br><b>Atenção:</b> "${esc(outros.map(x => x.nome).join(', '))}" publica no mesmo tópico e será desligado.` : ''}`, { botao: 'Ligar' }))) return;
            outros.forEach(x => { x.ativo = false; });
            const r = RT.motores.get(c.id); if (r && r.motor && r.motor.inicializar) { const u0 = r.u ? r.u[0] : valorTag(c.saidas[0].tagId) || 0; const y = c.entradas.map(id => valorTag(id) || 0); r.motor.inicializar(u0, c.referencias.map(() => 0), y); }
        }
        c.ativo = !c.ativo;
        logar('controle', `${c.nome}: ${c.ativo ? 'LIGADO' : 'DESLIGADO'} pelo usuário`, pl.nome);
        SUP.alterado('ctl'); renderPagina(true);
    },
    'ctl-modo': b => { const c = acharCtl(b.dataset.id); c.modo = b.dataset.modo; const r = RT.motores.get(c.id); if (c.modo === 'manual' && r && r.u) c.saidaManual = +r.u[0].toFixed(3); logar('controle', `${c.nome}: modo ${c.modo === 'manual' ? 'manual' : 'automático'}`, plDoCtl(c.id).nome); SUP.alterado('ctl'); renderPagina(true); },
    'ctl-saida-add': b => { const c = acharCtl(b.dataset.id); c.saidas.push({ topico: '', tagId: '' }); SUP.alterado('ctl'); renderPagina(true); },
    'ctl-saida-del': b => { const c = acharCtl(b.dataset.id); c.saidas.pop(); SUP.alterado('ctl'); renderPagina(true); },
    'ctl-tag-saida': b => {
        const c = acharCtl(b.dataset.id), pl = SUP.planta(b.dataset.pl);
        c.saidas.forEach((s, i) => { if (!s.tagId) { const t = criarTag({ nome: `Saída ${c.saidas.length > 1 ? i + 1 + ' ' : ''}de ${c.nome}`, tipo: 'percentual', origem: 'controle' }); pl.tags.push(t); s.tagId = t.id; } });
        garantirVariaveis(pl); SUP.alterado('ctl'); renderPagina(true); avisar('Variável de saída criada: aparece nos gráficos e relatórios.');
    },
    'ctl-carregar': async b => {
        const arq = await escolherArquivo('.m,.txt,.json,.csv');
        if (!arq) return;
        const c = acharCtl(b.dataset.id);
        const usados = aplicarParametros(c, await arq.text());
        logar('controle', `${c.nome}: ganhos carregados de ${arq.name} (${usados.join(', ')})`, plDoCtl(c.id).nome);
        SUP.alterado('ctl'); renderPagina(true); avisar(`Carregado: ${usados.join(', ')}.`);
    },
    'ctl-colar': async b => {
        const c = acharCtl(b.dataset.id);
        const txt = await confirmar('Colar ganhos', 'Formato do MATLAB/Octave (<code>K = [1.2 3.4]; L = [0.8; 0.2]; kp = 2</code>) ou JSON (<code>{"kp": 2, "ki": 0.1}</code>).', { botao: 'Aplicar', campo: { rotulo: 'Texto', valor: '' } });
        if (!txt) return;
        const usados = aplicarParametros(c, txt);
        logar('controle', `${c.nome}: ganhos colados (${usados.join(', ')})`, plDoCtl(c.id).nome);
        SUP.alterado('ctl'); renderPagina(true); avisar(`Aplicado: ${usados.join(', ')}.`);
    },
    'ctl-grafico': (b) => { const c = acharCtl(b.dataset.id); GRAF.sel = [...c.entradas, ...c.saidas.map(s => s.tagId).filter(Boolean)]; const pl = plDoCtl(c.id); c.referencias.forEach(r => { const t = pl.tags.find(x => x.variavel === r.trim()); if (t && !GRAF.sel.includes(t.id)) GRAF.sel.push(t.id); }); GRAF.aoVivo = true; GRAF.periodo = 900000; guardarGraf(); location.hash = '#/graficos'; },
    'ctl-identificar': async b => {
        const c = acharCtl(b.dataset.id);
        const saida = c.saidas[0] && c.saidas[0].tagId;
        if (!saida) throw new Error('a saída do controlador precisa estar guardada numa variável (botão "Criar variável para a saída")');
        const min = await confirmar('Sintonia pelo degrau', 'Coloque o controlador em <b>manual</b>, espere estabilizar, mude a saída manual (degrau) e espere a medida estabilizar de novo. Depois diga quantos minutos para trás o sistema deve analisar.', { botao: 'Analisar', campo: { rotulo: 'Minutos', tipo: 'number', valor: 15, extra: 'min="1" max="1440"' } });
        if (!min) return;
        const t1 = Date.now(), t0 = t1 - num(min, 15) * 60000;
        const u = await histPontos(saida, t0, t1), y = await histPontos(c.entradas[0], t0, t1);
        const r = identificarPrimeiraOrdem(u, y);
        const alvo = $(`[data-ident="${c.id}"]`);
        alvo.innerHTML = `<div class="destaque"><p>${esc(r.mensagem)}</p><p>Sugestão PI${r.kd ? 'D' : ''}: <b>Kp = ${r.kp.toPrecision(3)}</b>, <b>Ki = ${r.ki.toPrecision(3)}</b>${r.kd ? `, <b>Kd = ${r.kd.toPrecision(3)}</b>` : ''}, ação ${r.acao}.</p>
            <div class="botoes"><button type="button" class="btn btn-primary btn-sm" data-acao="ctl-aplicar-ident" data-id="${c.id}" data-r='${escAttr(JSON.stringify(r))}'>Aplicar ao PID</button></div></div>`;
    },
    'ctl-aplicar-ident': b => {
        const c = acharCtl(b.dataset.id), r = JSON.parse(b.dataset.r);
        Object.assign(c.params, { kp: +r.kp.toPrecision(4), ki: +r.ki.toPrecision(4), kd: +r.kd.toPrecision(4), acao: r.acao }); c.tipo = 'pid';
        logar('controle', `${c.nome}: ganhos da identificação aplicados (Kp ${c.params.kp}, Ki ${c.params.ki}, Kd ${c.params.kd})`, plDoCtl(c.id).nome);
        SUP.alterado('ctl'); renderPagina(true);
    }
});
