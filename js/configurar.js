/**
 * © 2026 Supervisório MQTT — Inova Agro UFPel EMBRAPII. Código aberto; cópias permitidas desde que citadas.
 *
 * CONFIGURAR: planta, conexão com o broker, áreas, equipamentos (com horímetro), variáveis (tópicos, equações,
 * integrais, alarmes, faixa e gravação) e alarmes por equação. E a página da NUVEM DA EQUIPE (configuração e histórico).
 * Tudo salva sozinho ao sair do campo (não há botão "salvar").
 */

'use strict';

const PRESETS_BROKER = [
    ['EMQX público — wss 8084', 'wss://broker.emqx.io:8084/mqtt'],
    ['HiveMQ público — wss 8884', 'wss://broker.hivemq.com:8884/mqtt'],
    ['EMQX na rede local — ws 8083', 'ws://192.168.0.10:8083/mqtt'],
    ['Mosquitto na rede local — ws 9001', 'ws://192.168.0.10:9001'],
    ['Broker de teste deste projeto — ws 8090', 'ws://localhost:8090/mqtt']
];
const CFG = { abertos: new Set() };

function optsTags(pl, sel, filtro = () => true, vazioTxt = '—') {
    return `<option value="">${vazioTxt}</option>` + pl.tags.filter(filtro).map(t => `<option value="${t.id}"${t.id === sel ? ' selected' : ''}>${esc(t.nome)}${t.unidade ? ' (' + esc(t.unidade) + ')' : ''}</option>`).join('');
}
function optsEquip(pl, sel) { return '<option value="">— sem equipamento —</option>' + pl.equipamentos.map(e => `<option value="${e.id}"${e.id === sel ? ' selected' : ''}>${esc(e.nome)}</option>`).join(''); }
function optsArea(pl, sel) { return '<option value="">— sem área —</option>' + pl.areas.map(a => `<option value="${a.id}"${a.id === sel ? ' selected' : ''}>${esc(a.nome)}</option>`).join(''); }

PAGINAS.configurar = {
    titulo: 'Configurar',
    render(id) {
        const pls = SUP.p.plantas;
        if (!pls.length) return `<div class="container">${cabecalho(`${icone('configurar')} Configurar`)}${htmlComecar()}</div>`;
        const pl = SUP.planta(id) || pls[0];
        const c = pl.conexao, publico = /emqx\.io|hivemq\.com|mosquitto\.org/i.test(c.url);
        const ehHttps = location.protocol === 'https:';
        return `<div class="container">${cabecalho(`${icone('configurar')} Configurar`, 'Tudo é salvo sozinho neste navegador ao sair de cada campo. Para levar a outro computador: "Baixar arquivo" ou Nuvem da equipe.',
            `<select id="cfg-planta" aria-label="Planta">${pls.map(p => `<option value="${p.id}"${p === pl ? ' selected' : ''}>${esc(p.nome)}</option>`).join('')}</select>
             <button type="button" class="btn btn-secondary btn-sm" data-acao="planta-branco">${icone('mais')} Nova planta</button>`)}
            <nav class="ancoras">${[['geral', 'Planta'], ['conexao', 'Conexão'], ['areas', 'Áreas'], ['equipamentos', 'Equipamentos e horímetros'], ['variaveis', 'Variáveis'], ['alarmes-eq', 'Alarmes por equação'], ['arquivo', 'Arquivo']].map(([a, n]) => `<a href="#/configurar/${pl.id}" data-acao="ir-ancora" data-a="${a}">${n}</a>`).join('')}</nav>

            <section class="card" id="geral"><h2>Planta</h2><div class="grade-campos">
                <label>Nome <input type="text" data-ref="pl:${pl.id}.nome" value="${escAttr(pl.nome)}" data-rerender></label>
                <label>Cor <input type="color" data-ref="pl:${pl.id}.cor" value="${escAttr(pl.cor)}"></label>
                <label class="largo">Descrição <input type="text" data-ref="pl:${pl.id}.descricao" value="${escAttr(pl.descricao)}" placeholder="ex.: Unidade de Capão do Leão — safra 2026/27"></label>
                <label class="largo">Nome do supervisório (aparece no topo e nos relatórios) <input type="text" data-ref="proj.nome" value="${escAttr(SUP.p.nome)}"></label></div></section>

            <section class="card" id="conexao"><div class="card-topo"><h2>Conexão</h2>${chipConexao(pl)}<div class="botoes">${botaoConexao(pl)}</div></div>
                <div class="seg" role="group" aria-label="Tipo de conexão">
                    <button type="button" class="seg-btn${c.tipo === 'mqtt' ? ' ativo' : ''}" data-acao="cfg-tipo" data-pl="${pl.id}" data-tipo="mqtt">Broker MQTT</button>
                    <button type="button" class="seg-btn${c.tipo === 'simulado' ? ' ativo' : ''}" data-acao="cfg-tipo" data-pl="${pl.id}" data-tipo="simulado"${pl.simulacao ? '' : ' disabled title="Só os modelos prontos trazem simulação"'}>Simulação (sem broker)</button></div>
                ${c.tipo === 'simulado' ? `<p class="nota">A simulação publica nos mesmos tópicos que o campo publicaria e responde aos comandos e aos controladores. Para usar o equipamento real, escolha "Broker MQTT", preencha o endereço e conecte.</p>` : ''}
                <div class="grade-campos">
                    <label class="largo">Endereço WebSocket do broker <input type="text" data-ref="pl:${pl.id}.conexao.url" value="${escAttr(c.url)}" placeholder="wss://servidor:8084/mqtt" spellcheck="false">
                        <small>O navegador só fala MQTT por WebSocket. EMQX: 8083 (ws) e 8084 (wss), caminho /mqtt. Mosquitto: a porta do <code>listener … protocol websockets</code>.${ehHttps ? ' Esta página está em https: use <b>wss://</b>.' : ''}</small></label>
                    <div class="largo chips"><span class="chips-rotulo">Prontos:</span>${PRESETS_BROKER.map(([n, u]) => `<button type="button" class="chip" data-acao="cfg-preset" data-pl="${pl.id}" data-url="${escAttr(u)}">${esc(n)}</button>`).join('')}</div>
                    ${publico ? `<p class="largo aviso-inline">Broker público: qualquer pessoa na internet pode ler e publicar nestes tópicos. Use só para testes; para comandar equipamento real use um broker com usuário e senha (e TLS).</p>` : ''}
                    <label>Usuário <input type="text" data-ref="pl:${pl.id}.conexao.usuario" value="${escAttr(c.usuario)}" autocomplete="off"></label>
                    <label>Senha <input type="password" id="cfg-senha" value="${escAttr(Senhas.de(pl.id))}" autocomplete="new-password" placeholder="fica só neste navegador"></label>
                    <label>Prefixo dos tópicos <input type="text" data-ref="pl:${pl.id}.conexao.prefixo" value="${escAttr(c.prefixo)}" placeholder="ex.: fazenda/ubs" spellcheck="false"><small>É colocado na frente do tópico de cada variável. Tópico começando com "/" ignora o prefixo.</small></label>
                    <label>QoS das assinaturas <select data-ref="pl:${pl.id}.conexao.qos" data-tipo="num"><option value="0"${+c.qos === 0 ? ' selected' : ''}>0 — no máximo uma vez</option><option value="1"${+c.qos === 1 ? ' selected' : ''}>1 — pelo menos uma vez</option></select></label>
                    <label>Keepalive (s) <input type="number" min="5" max="600" data-ref="pl:${pl.id}.conexao.keepalive" value="${c.keepalive}"></label>
                    <label>Início do identificador <input type="text" data-ref="pl:${pl.id}.conexao.clientId" value="${escAttr(c.clientId)}" placeholder="supervisorio"><small>Um final aleatório é acrescentado (duas abas não se derrubam).</small></label>
                    <label class="campo-inline largo"><input type="checkbox" data-ref="pl:${pl.id}.conexao.lwt"${c.lwt ? ' checked' : ''}> Avisar o campo quando o supervisório cair (Last Will em <code>${esc((c.prefixo ? c.prefixo.replace(/\/+$/, '') + '/' : '') + 'supervisorio/status')}</code> = offline)</label>
                </div><p class="nota">Mudou a conexão? Clique em Desconectar e Conectar de novo.</p></section>

            <section class="card" id="areas"><div class="card-topo"><h2>Áreas</h2><button type="button" class="btn btn-secondary btn-sm" data-acao="cfg-area-add" data-pl="${pl.id}">${icone('mais')} Área</button></div>
                <ul class="lista-editavel">${pl.areas.map(a => `<li><input type="text" data-ref="area:${a.id}.nome" value="${escAttr(a.nome)}" aria-label="Nome da área"><button type="button" class="btn-icone" data-acao="cfg-area-del" data-pl="${pl.id}" data-id="${a.id}" title="Excluir">${icone('lixo')}</button></li>`).join('') || '<li class="nota">Sem áreas.</li>'}</ul></section>

            <section class="card" id="equipamentos"><div class="card-topo"><h2>Equipamentos e horímetros</h2><button type="button" class="btn btn-secondary btn-sm" data-acao="cfg-eq-add" data-pl="${pl.id}">${icone('mais')} Equipamento</button></div>
                <p class="nota">O horímetro conta o tempo <b>desligado</b> (abaixo do limite de ligado), <b>em vazio</b> (entre os limites) e <b>trabalhando</b> (acima do limite de trabalho), pela corrente, potência, estado ou por equações. Sem limite de trabalho, ligado conta como trabalhando.</p>
                ${pl.equipamentos.map(eq => htmlEquip(pl, eq)).join('') || '<p class="nota">Nenhum equipamento. Eles também são criados ao desenhar o sinótico.</p>'}</section>

            <section class="card" id="variaveis"><div class="card-topo"><h2>Variáveis (${pl.tags.length})</h2><a class="btn btn-secondary btn-sm" href="#/logs" data-acao="cfg-descobrir" data-pl="${pl.id}">${icone('zoom')} Descobrir tópicos</a></div>
                <div class="chips"><span class="chips-rotulo">Adicionar:</span>${['temperatura', 'umidade', 'orvalho', 'co2', 'pressao', 'peso', 'volume', 'nivel', 'velocidade', 'aceleracao', 'corrente', 'tensao', 'fp', 'potencia', 'energia', 'estado', 'equacao', 'generico'].map(k => `<button type="button" class="chip chip-ico" data-acao="cfg-tag-add" data-pl="${pl.id}" data-tipo="${k}">${icone(k)} ${esc(TIPOS_VAR[k].nome)}</button>`).join('')}</div>
                <details class="dicas"><summary>Equações: o que dá para usar</summary><div><p>Use o <b>nome de variável</b> de cada uma (aparece em cinza abaixo do nome). Ex.: <code>pot_tri(tensao, i_elevador1, fp)</code>, <code>orvalho(t_ext, ur_ext)</code>, <code>se(t_grao_s1 - t_ext &gt;= 3 e ur_ext &lt; 75, 1, 0)</code>. Variável de outra planta: <code>nome_da_planta.variavel</code>.</p><ul>${AJUDA_FUNCOES.map(([f, d]) => `<li><code>${esc(f)}</code> — ${esc(d)}</li>`).join('')}</ul><p>Operadores: + − * / ^ %, comparações &lt; &lt;= &gt; &gt;= == !=, e/ou/nao (&amp;&amp; || !), <code>cond ? a : b</code>. Constantes: pi, e; <code>hora</code> (0–23), <code>dt</code> (passo em s).</p></div></details>
                <div class="lista-vars">${pl.tags.map(t => htmlVariavel(pl, t)).join('') || '<p class="nota">Nenhuma variável. Use os botões acima ou "Descobrir tópicos".</p>'}</div></section>

            <section class="card" id="alarmes-eq"><div class="card-topo"><h2>Alarmes por equação</h2><button type="button" class="btn btn-secondary btn-sm" data-acao="cfg-ax-add" data-pl="${pl.id}">${icone('mais')} Alarme</button></div>
                <p class="nota">Alarma quando a equação dá verdadeiro (diferente de zero) por mais tempo que o atraso. Ex.: <code>est_silo1_ventilador == 1 e t_grao_s1 &lt; orvalho_ext</code>.</p>
                ${pl.alarmesExtra.map(a => `<div class="linha-ax"><input type="checkbox" data-ref="ax:${a.id}.ativo"${a.ativo ? ' checked' : ''} aria-label="Ativo">
                    <label>Mensagem <input type="text" data-ref="ax:${a.id}.nome" value="${escAttr(a.nome)}"></label>
                    <label class="campo">Condição <input type="text" data-ref="ax:${a.id}.expr" data-expr-pl="${pl.id}" value="${escAttr(a.expr)}" spellcheck="false"><small class="expr-conf"></small></label>
                    <label>Prioridade <select data-ref="ax:${a.id}.prioridade" data-tipo="num">${[1, 2, 3, 4].map(p => `<option value="${p}"${+a.prioridade === p ? ' selected' : ''}>${PRIORIDADES[p].nome}</option>`).join('')}</select></label>
                    <label>Atraso (s) <input type="number" min="0" data-ref="ax:${a.id}.atrasoS" value="${a.atrasoS}"></label>
                    <button type="button" class="btn-icone" data-acao="cfg-ax-del" data-pl="${pl.id}" data-id="${a.id}" title="Excluir">${icone('lixo')}</button></div>`).join('') || '<p class="nota">Nenhum.</p>'}</section>

            <section class="card" id="arquivo"><h2>Arquivo</h2><div class="botoes">
                <button type="button" class="btn btn-secondary btn-sm" data-acao="baixar-arquivo">${icone('baixar')} Baixar arquivo (todas as plantas)</button>
                <button type="button" class="btn btn-secondary btn-sm" data-acao="abrir-arquivo">📂 Abrir arquivo</button>
                <button type="button" class="btn btn-secondary btn-sm" data-acao="cfg-duplicar" data-pl="${pl.id}">⧉ Duplicar esta planta</button>
                <button type="button" class="btn btn-danger btn-sm" data-acao="cfg-excluir" data-pl="${pl.id}">${icone('lixo')} Excluir esta planta</button></div>
                <p class="nota">Excluir a planta não apaga o histórico dela (no navegador e na nuvem).</p></section></div>`;
    },
    montar(raiz) {
        $('#cfg-planta', raiz).addEventListener('change', e => { location.hash = '#/configurar/' + e.target.value; });
        const s = $('#cfg-senha', raiz);
        if (s) s.addEventListener('change', () => { Senhas.guardar(SUP.planta($('#cfg-planta').value).id, s.value); avisar('Senha guardada só neste navegador. Reconecte para usar.'); });
        raiz.addEventListener('toggle', e => { const d = e.target; if (d.dataset && d.dataset.abre) { if (d.open) CFG.abertos.add(d.dataset.abre); else CFG.abertos.delete(d.dataset.abre); } }, true);
        const ancora = sessionStorage.getItem('sup_ancora'); if (ancora) { sessionStorage.removeItem('sup_ancora'); setTimeout(() => { const a = document.getElementById(ancora); if (a) a.scrollIntoView(); }, 50); }
    },
    atualizar(sujos, forcar) {
        $$('[data-agora]').forEach(n => { const inf = infoTag(n.dataset.agora), t = SUP.tag(n.dataset.agora); if (t) n.textContent = inf && inf.v != null ? `agora: ${formatarNumero(inf.v, t.dec)} ${t.unidade}` : 'sem valor ainda'; });
        $$('[data-chipcon]').forEach(ch => { const pl = SUP.planta(ch.dataset.chipcon); if (pl && forcar) ch.outerHTML = chipConexao(pl); });
    }
};

function htmlEquip(pl, eq) {
    const h = eq.horimetro;
    const fonte = SUP.tag(h.tagId);
    return `<details class="linha-equip" data-abre="${eq.id}"${CFG.abertos.has(eq.id) ? ' open' : ''}><summary><b>${esc(eq.nome)}</b> <small>${esc((pl.areas.find(a => a.id === eq.areaId) || {}).nome || 'sem área')} · ${esc((SIMBOLOS[eq.simbolo] || {}).nome || eq.simbolo)}${h.ativo ? ' · horímetro ligado' : ''}</small></summary>
        <div class="grade-campos">
            <label>Nome <input type="text" data-ref="eq:${eq.id}.nome" value="${escAttr(eq.nome)}"></label>
            <label>Área <select data-ref="eq:${eq.id}.areaId">${optsArea(pl, eq.areaId)}</select></label>
            <label>Símbolo <select data-ref="eq:${eq.id}.simbolo">${Object.entries(SIMBOLOS).filter(([, S]) => S.equip).map(([k, S]) => `<option value="${k}"${k === eq.simbolo ? ' selected' : ''}>${esc(S.nome)}</option>`).join('')}</select></label>
            <label>Potência deste equipamento <select data-ref="eq:${eq.id}.tagPotencia">${optsTags(pl, eq.tagPotencia, t => t.tipo === 'potencia', '— (sem energia por estado)')}</select></label>
            <label class="campo-inline largo"><input type="checkbox" data-ref="eq:${eq.id}.horimetro.ativo"${h.ativo ? ' checked' : ''} data-rerender> Horímetro ligado</label>
            ${h.ativo ? `<label>Indica o funcionamento por <select data-ref="eq:${eq.id}.horimetro.fonte" data-rerender><option value="tag"${h.fonte === 'tag' ? ' selected' : ''}>uma variável e limites</option><option value="expr"${h.fonte === 'expr' ? ' selected' : ''}>equações</option></select></label>
            ${h.fonte === 'tag' ? `<label>Variável <select data-ref="eq:${eq.id}.horimetro.tagId">${optsTags(pl, h.tagId, t => ['corrente', 'potencia', 'estado', 'rotacao', 'velocidade', 'vazao', 'percentual', 'generico'].includes(t.tipo) || t.equipId === eq.id)}</select></label>
                <label>Ligado a partir de ${fonte ? `(${esc(fonte.unidade)})` : ''} <input type="number" step="any" data-ref="eq:${eq.id}.horimetro.limLigado" value="${h.limLigado ?? ''}"></label>
                <label>Trabalhando a partir de <input type="number" step="any" data-ref="eq:${eq.id}.horimetro.limTrabalho" value="${h.limTrabalho ?? ''}" placeholder="vazio = ligado já é trabalhando"></label>`
            : `<label class="campo">Ligado quando <input type="text" data-ref="eq:${eq.id}.horimetro.exprLigado" data-expr-pl="${pl.id}" value="${escAttr(h.exprLigado)}" placeholder="ex.: est_elevador1 == 1"><small class="expr-conf"></small></label>
                <label class="campo">Trabalhando quando <input type="text" data-ref="eq:${eq.id}.horimetro.exprTrabalho" data-expr-pl="${pl.id}" value="${escAttr(h.exprTrabalho)}" placeholder="ex.: i_elevador1 > 6"><small class="expr-conf"></small></label>`}` : ''}
        </div><div class="botoes"><button type="button" class="btn btn-danger btn-sm" data-acao="cfg-eq-del" data-pl="${pl.id}" data-id="${eq.id}">${icone('lixo')} Excluir equipamento</button></div></details>`;
}

function htmlVariavel(pl, t) {
    const L = t.limites, R = t.registro, aberto = CFG.abertos.has(t.id);
    const campoOrigem = t.origem === 'mqtt'
        ? `<label class="campo">Tópico <input type="text" data-ref="tag:${t.id}.topico" value="${escAttr(t.topico)}" spellcheck="false" placeholder="ex.: silo1/temperatura"><small>${esc(topicoCompleto(pl, t.topico) || '—')}</small></label>`
        : t.origem === 'calc'
            ? `<label class="campo">Equação <input type="text" data-ref="tag:${t.id}.expr" data-expr-pl="${pl.id}" value="${escAttr(t.expr)}" spellcheck="false" placeholder="ex.: pot_tri(tensao, corrente, fp)"><small class="expr-conf"></small></label>`
            : t.origem === 'integral'
                ? `<label class="campo">Integral de <select data-ref="tag:${t.id}.fonteIntegral">${optsTags(pl, t.fonteIntegral, x => x.id !== t.id)}</select><small>Energia (kWh) = ∫ potência (kW) dt ÷ 3600 s/h. Fator: <input type="number" step="any" class="mini" data-ref="tag:${t.id}.fatorIntegral" value="${t.fatorIntegral}" aria-label="Fator"> por segundo.</small></label>`
                : t.origem === 'manual'
                    ? `<label class="campo">Valor <input type="number" step="any" data-ref="tag:${t.id}.valorManual" value="${t.valorManual}"></label>`
                    : `<label class="campo">Saída de controlador <small>${esc((pl.controladores.find(c => c.saidas.some(s => s.tagId === t.id)) || {}).nome || 'ligue em Controle → saída do controlador')}</small></label>`;
    return `<details class="linha-var" data-abre="${t.id}"${aberto ? ' open' : ''}>
        <summary><span class="lv-ico">${icone(t.tipo)}</span><span class="lv-nome"><b>${esc(t.nome)}</b><small><code>${esc(t.variavel)}</code> · ${esc(ORIGENS[t.origem])}${t.origem === 'mqtt' && t.topico ? ' · ' + esc(topicoCompleto(pl, t.topico)) : ''}${t.origem === 'calc' ? ' · ' + esc(t.expr) : ''}</small></span><small class="lv-agora" data-agora="${t.id}"></small>${L.ativo ? '<span class="selo selo-al">alarme</span>' : ''}${RT.errosCalc.has(t.id) ? `<span class="selo selo-erro" title="${escAttr(RT.errosCalc.get(t.id))}">erro</span>` : ''}</summary>
        <div class="grade-campos">
            <label>Nome <input type="text" data-ref="tag:${t.id}.nome" value="${escAttr(t.nome)}"></label>
            <label>Nome nas equações <input type="text" data-ref="tag:${t.id}.variavel" value="${escAttr(t.variavel)}" spellcheck="false" data-depois="cfg-var-ajustar"></label>
            <label>Tipo <select data-ref="tag:${t.id}.tipo" data-depois="cfg-tipo-mudou">${Object.entries(TIPOS_VAR).map(([k, T]) => `<option value="${k}"${k === t.tipo ? ' selected' : ''}>${esc(T.nome)}</option>`).join('')}</select></label>
            <label>Origem <select data-ref="tag:${t.id}.origem" data-rerender>${Object.entries(ORIGENS).map(([k, n]) => `<option value="${k}"${k === t.origem ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
            ${campoOrigem}
            <label>Equipamento <select data-ref="tag:${t.id}.equipId" data-depois="cfg-equip-area">${optsEquip(pl, t.equipId)}</select></label>
            ${t.equipId ? '' : `<label>Área <select data-ref="tag:${t.id}.areaId">${optsArea(pl, t.areaId)}</select></label>`}
            <label>Unidade <input type="text" data-ref="tag:${t.id}.unidade" value="${escAttr(t.unidade)}"></label>
            <label>Casas decimais <input type="number" min="0" max="6" data-ref="tag:${t.id}.dec" value="${t.dec}"></label>
            ${t.origem === 'mqtt' ? `<label>Campo do JSON <input type="text" data-ref="tag:${t.id}.caminhoJson" value="${escAttr(t.caminhoJson)}" placeholder="vazio = número puro" spellcheck="false"><small>ex.: dados.temp ou leituras[0].valor</small></label>` : ''}
            ${t.origem === 'mqtt' || t.origem === 'calc' ? `<label>Escala × <input type="number" step="any" data-ref="tag:${t.id}.escala" value="${t.escala}"></label><label>Somar <input type="number" step="any" data-ref="tag:${t.id}.deslocamento" value="${t.deslocamento}"><small>valor = bruto × escala + somar</small></label>` : ''}
        </div>
        <h4>Faixa e alarme</h4>
        <div class="grade-campos grade-estreita">
            <label>Faixa de ${'<input type="number" step="any" data-tipo="num" data-ref="tag:' + t.id + '.faixa.0" value="' + t.faixa[0] + '">'}</label>
            <label>até <input type="number" step="any" data-ref="tag:${t.id}.faixa.1" value="${t.faixa[1]}"></label>
            <label class="campo-inline"><input type="checkbox" data-ref="tag:${t.id}.limites.ativo"${L.ativo ? ' checked' : ''}> Alarme ligado</label>
            <label>LL (muito baixo) <input type="number" step="any" data-ref="tag:${t.id}.limites.ll" value="${L.ll ?? ''}"></label>
            <label>L (baixo) <input type="number" step="any" data-ref="tag:${t.id}.limites.l" value="${L.l ?? ''}"></label>
            <label>H (alto) <input type="number" step="any" data-ref="tag:${t.id}.limites.h" value="${L.h ?? ''}"></label>
            <label>HH (muito alto) <input type="number" step="any" data-ref="tag:${t.id}.limites.hh" value="${L.hh ?? ''}"></label>
            <label>Histerese <input type="number" step="any" min="0" data-ref="tag:${t.id}.limites.histerese" value="${L.histerese}"></label>
            <label>Atraso (s) <input type="number" min="0" data-ref="tag:${t.id}.limites.atrasoS" value="${L.atrasoS}"></label>
            ${t.origem === 'mqtt' ? `<label>Sem dados após (s) <input type="number" min="0" data-ref="tag:${t.id}.limites.semDadosS" value="${L.semDadosS}"><small>0 = não avisa</small></label>` : ''}
            <label>Prioridade LL/HH <select data-ref="tag:${t.id}.limites.prioridadeExtremos" data-tipo="num">${[1, 2, 3, 4].map(p => `<option value="${p}"${+L.prioridadeExtremos === p ? ' selected' : ''}>${PRIORIDADES[p].nome}</option>`).join('')}</select></label>
            <label>Prioridade L/H <select data-ref="tag:${t.id}.limites.prioridadeAvisos" data-tipo="num">${[1, 2, 3, 4].map(p => `<option value="${p}"${+L.prioridadeAvisos === p ? ' selected' : ''}>${PRIORIDADES[p].nome}</option>`).join('')}</select></label>
        </div>
        <h4>Gravação no histórico</h4>
        <div class="grade-campos grade-estreita">
            <label>Banda morta <input type="number" step="any" min="0" data-ref="tag:${t.id}.registro.banda" value="${R.banda}"><small>só grava se mudar mais que isto</small></label>
            <label>Intervalo mínimo (s) <input type="number" min="0" data-ref="tag:${t.id}.registro.minS" value="${R.minS}"></label>
            <label>Intervalo máximo (s) <input type="number" min="1" data-ref="tag:${t.id}.registro.maxS" value="${R.maxS}"><small>grava pelo menos a cada</small></label>
        </div>
        <div class="botoes"><a class="btn btn-secondary btn-sm" href="#/graficos/${t.id}">${icone('graficos')} Gráfico</a><button type="button" class="btn btn-secondary btn-sm" data-acao="cfg-tag-dup" data-pl="${pl.id}" data-id="${t.id}">⧉ Duplicar</button><button type="button" class="btn btn-danger btn-sm" data-acao="cfg-tag-del" data-pl="${pl.id}" data-id="${t.id}">${icone('lixo')} Excluir</button></div>
    </details>`;
}

/** Nova variável já pré-preenchida pelo tipo (equações de orvalho, potência e energia escolhem as variáveis que existem). */
function novaVariavel(pl, tipo) {
    const acha = tp => pl.tags.find(x => x.tipo === tp);
    const p = { tipo, nome: TIPOS_VAR[tipo].nome };
    if (tipo === 'orvalho') {
        const T = acha('temperatura'), U = acha('umidade');
        Object.assign(p, { origem: 'calc', expr: `orvalho(${T ? T.variavel : 'temperatura'}, ${U ? U.variavel : 'umidade'})` });
    } else if (tipo === 'potencia') {
        const V = acha('tensao'), I = acha('corrente'), F = acha('fp');
        Object.assign(p, { origem: 'calc', expr: `pot_tri(${V ? V.variavel : 'tensao'}, ${I ? I.variavel : 'corrente'}, ${F ? F.variavel : 'fp'})` });
    } else if (tipo === 'energia') {
        const P = acha('potencia');
        Object.assign(p, { origem: 'integral', fonteIntegral: P ? P.id : '' });
    } else if (tipo === 'equacao') Object.assign(p, { origem: 'calc', expr: '' });
    const t = criarTag(p);
    pl.tags.push(t); garantirVariaveis(pl);
    CFG.abertos.add(t.id);
    return t;
}

Object.assign(ACOES, {
    'ir-ancora': b => { const a = document.getElementById(b.dataset.a); if (a) a.scrollIntoView({ behavior: 'smooth' }); },
    'cfg-tipo': b => { const pl = SUP.planta(b.dataset.pl); const era = estadoConexao(pl.id) !== 'desconectado'; pl.conexao.tipo = b.dataset.tipo; SUP.alterado('pl'); if (era) conectarPlanta(pl); renderPagina(true); },
    'cfg-preset': b => { const pl = SUP.planta(b.dataset.pl); pl.conexao.url = b.dataset.url; pl.conexao.tipo = 'mqtt'; SUP.alterado('pl'); renderPagina(true); },
    'cfg-area-add': b => { const pl = SUP.planta(b.dataset.pl); pl.areas.push(criarArea('Área ' + (pl.areas.length + 1))); SUP.alterado('area'); renderPagina(true); },
    'cfg-area-del': async b => {
        const pl = SUP.planta(b.dataset.pl), a = pl.areas.find(x => x.id === b.dataset.id);
        if (!(await confirmar(`Excluir a área "${a.nome}"?`, 'Os equipamentos e variáveis dela ficam "sem área" (não são apagados).', { botao: 'Excluir', perigo: true }))) return;
        pl.areas = pl.areas.filter(x => x !== a); pl.equipamentos.forEach(e => { if (e.areaId === a.id) e.areaId = ''; }); pl.tags.forEach(t => { if (t.areaId === a.id) t.areaId = ''; });
        SUP.alterado('area'); renderPagina(true);
    },
    'cfg-eq-add': b => { const pl = SUP.planta(b.dataset.pl); const eq = criarEquipamento('Equipamento ' + (pl.equipamentos.length + 1), pl.areas[0] ? pl.areas[0].id : '', 'motor'); pl.equipamentos.push(eq); CFG.abertos.add(eq.id); SUP.alterado('eq'); renderPagina(true); },
    'cfg-eq-del': async b => {
        const pl = SUP.planta(b.dataset.pl), eq = pl.equipamentos.find(x => x.id === b.dataset.id);
        if (!(await confirmar(`Excluir "${eq.nome}"?`, 'As variáveis e comandos dele continuam (ficam sem equipamento); o símbolo no sinótico perde a ligação.', { botao: 'Excluir', perigo: true }))) return;
        pl.equipamentos = pl.equipamentos.filter(x => x !== eq);
        pl.tags.forEach(t => { if (t.equipId === eq.id) { t.equipId = ''; t.areaId = eq.areaId; } }); pl.comandos.forEach(c => { if (c.equipId === eq.id) c.equipId = ''; });
        pl.sinotico.elementos.forEach(el => { if (el.eq === eq.id) el.eq = ''; });
        SUP.alterado('eq'); renderPagina(true);
    },
    'cfg-tag-add': b => { const pl = SUP.planta(b.dataset.pl); const t = novaVariavel(pl, b.dataset.tipo); SUP.alterado('tag'); renderPagina(true); setTimeout(() => { const d = $(`[data-abre="${t.id}"]`); if (d) { d.scrollIntoView({ block: 'center' }); const i = d.querySelector('input[type=text]'); if (i) i.focus(); } }, 60); },
    'cfg-tag-dup': b => { const pl = SUP.planta(b.dataset.pl), t = pl.tags.find(x => x.id === b.dataset.id); const c = clonar(t); c.id = uid('tg'); c.nome += ' (cópia)'; c.variavel = ''; pl.tags.splice(pl.tags.indexOf(t) + 1, 0, criarTag(c)); garantirVariaveis(pl); SUP.alterado('tag'); renderPagina(true); },
    'cfg-tag-del': async b => {
        const pl = SUP.planta(b.dataset.pl), t = pl.tags.find(x => x.id === b.dataset.id);
        const usam = pl.tags.filter(x => x.origem === 'calc' && new RegExp('\\b' + t.variavel + '\\b').test(x.expr)).map(x => x.nome);
        if (!(await confirmar(`Excluir "${t.nome}"?`, `${usam.length ? `<b>Usada nas equações de:</b> ${esc(usam.join(', '))}.<br>` : ''}O histórico já gravado continua guardado.`, { botao: 'Excluir', perigo: true }))) return;
        pl.tags = pl.tags.filter(x => x !== t); SUP.alterado('tag'); renderPagina(true);
    },
    'cfg-ax-add': b => { const pl = SUP.planta(b.dataset.pl); pl.alarmesExtra.push({ id: uid('ax'), nome: 'Novo alarme', expr: '', prioridade: 3, atrasoS: 10, ativo: true }); SUP.alterado('ax'); renderPagina(true); },
    'cfg-ax-del': b => { const pl = SUP.planta(b.dataset.pl); pl.alarmesExtra = pl.alarmesExtra.filter(x => x.id !== b.dataset.id); SUP.alterado('ax'); renderPagina(true); },
    'cfg-tipo-mudou': el => {
        const t = SUP.tag(el.dataset.ref.split(':')[1].split('.')[0]), T = TIPOS_VAR[t.tipo];
        t.unidade = T.un; t.dec = T.dec; t.faixa = T.faixa.slice(); SUP.alterado('tag'); renderPagina(true);
    },
    'cfg-var-ajustar': el => { const t = SUP.tag(el.dataset.ref.split(':')[1].split('.')[0]); const pl = SUP.plantaDaTag(t.id); t.variavel = nomeVariavel(t.variavel); garantirVariaveis(pl); SUP.alterado('tag'); renderPagina(true); },
    'cfg-equip-area': el => { const t = SUP.tag(el.dataset.ref.split(':')[1].split('.')[0]); const eq = SUP.equipamento(t.equipId); if (eq) t.areaId = eq.areaId; SUP.alterado('tag'); renderPagina(true); },
    'cfg-descobrir': b => { LOGS.aba = 'descobrir'; const pl = SUP.planta(b.dataset.pl); if (estadoConexao(pl.id) === 'desconectado') conectarPlanta(pl); descobrirTopicos(pl); location.hash = '#/logs'; },
    'cfg-duplicar': b => {
        const pl = SUP.planta(b.dataset.pl);
        const txt = JSON.stringify(pl); const ids = new Map();
        const novo = JSON.parse(txt.replace(/"((?:pl|ar|eq|tg|cm|pb|ct|ax|el)_[a-z0-9]+)"/g, (m, id) => { if (!ids.has(id)) ids.set(id, uid(id.split('_')[0])); return `"${ids.get(id)}"`; }));
        novo.nome += ' (cópia)';
        SUP.p.plantas.push(normalizarPlanta(novo)); SUP.alterado('pl'); location.hash = '#/configurar/' + SUP.p.plantas[SUP.p.plantas.length - 1].id;
    },
    'cfg-excluir': async b => {
        const pl = SUP.planta(b.dataset.pl);
        const r = await confirmar(`Excluir "${pl.nome}"?`, 'Some a configuração desta planta neste navegador. Para confirmar, digite o nome da planta.', { botao: 'Excluir', perigo: true, campo: { rotulo: 'Nome da planta', valor: '' } });
        if (r == null) return;
        if (r.trim() !== pl.nome) throw new Error('o nome digitado não confere; nada foi excluído');
        desconectarPlanta(pl.id, true);
        SUP.p.plantas = SUP.p.plantas.filter(x => x !== pl); SUP.alterado('pl'); location.hash = '#/inicio';
    }
});

// ---------------------------------------------------------------- nuvem da equipe
PAGINAS.nuvem = {
    titulo: 'Nuvem da equipe',
    render() {
        const on = nuvemConectada(), em = NUVEM.email || emailLembrado(), op = SUP.p.opcoes;
        const hoje = diaISO(Date.now()), semana = diaISO(Date.now() - 7 * 86400000);
        return `<div class="container">${cabecalho(`${icone('nuvem')} Nuvem da equipe (MEGA)`, 'Guarda a configuração (com versões) e os dados passados (um arquivo por planta e por dia) na conta MEGA da equipe, protegida por senha; nada fica público.')}
            <section class="card cartao-nuvem"><div class="card-topo"><h2>Conta</h2><span class="contador">${on ? `conectado: ${esc(NUVEM.email)}` : em ? `conta: ${esc(em)} (desconectada)` : 'não conectada'}</span></div>
                <p class="nota">A mesma conta da nuvem do Sistema de Projeto Conceitual pode ser usada; as pastas ficam separadas (SupervisorioMQTT/…). ${htmlPorQueMega()}</p>
                <div class="botoes">${on ? '<button type="button" class="btn btn-secondary btn-sm" data-acao="nuvem-sair">Sair da nuvem</button>' : '<button type="button" class="btn btn-primary btn-sm" data-acao="nuvem-entrar">Entrar na nuvem</button>'}</div></section>
            <section class="card"><h2>Dados passados (histórico)</h2>
                <label class="campo-inline"><input type="checkbox" data-ref="op.nuvemHistorico"${op.nuvemHistorico ? ' checked' : ''}> Enviar o histórico automaticamente quando a nuvem estiver conectada</label>
                <div class="grade-campos grade-estreita">
                    <label>A cada (min) <input type="number" min="5" max="1440" data-ref="op.nuvemIntervaloMin" value="${op.nuvemIntervaloMin}"></label>
                    <label>Guardar no navegador por (dias) <input type="number" min="1" max="3650" data-ref="op.retencaoDias" value="${op.retencaoDias}"><small>o que for mais velho sai do navegador (continua na nuvem)</small></label></div>
                <p class="nota">Último envio: ${NUVEM.ultimoEnvio ? dataHora(NUVEM.ultimoEnvio) : 'nenhum nesta sessão'}${NUVEM.ultimoErro ? ` · <span class="falta">erro: ${esc(NUVEM.ultimoErro)}</span>` : ''}. O envio só acontece com esta página aberta: deixe um computador da unidade com o supervisório aberto para não haver buracos.</p>
                <div class="botoes"><button type="button" class="btn btn-primary btn-sm" data-acao="nuvem-enviar-hist">${icone('nuvem')} Enviar agora</button>
                    <button type="button" class="btn btn-secondary btn-sm" data-acao="nuvem-enviar-7">Reenviar os últimos 7 dias</button>
                    <button type="button" class="btn btn-secondary btn-sm" data-acao="hist-importar-zip">📂 Importar arquivo de dia (.zip)</button></div>
                <h3>Trazer da nuvem para este navegador</h3>
                <div class="grade-campos grade-estreita"><label>Planta <select id="nv-pl">${SUP.p.plantas.map(p => `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}</select></label>
                    <label>De <input type="date" id="nv-de" value="${semana}"></label><label>Até <input type="date" id="nv-ate" value="${hoje}"></label></div>
                <div class="botoes"><button type="button" class="btn btn-secondary btn-sm" data-acao="nuvem-trazer">${icone('baixar')} Trazer o período</button></div>
                <p class="nota">Gráficos e relatórios também oferecem buscar na nuvem quando o período não está no navegador.</p></section>
            <section class="card"><h2>Configuração</h2><p class="nota">Cada salvamento vira uma versão datada (a senha dos brokers não vai).</p>
                <div class="botoes"><button type="button" class="btn btn-primary btn-sm" data-acao="nuvem-salvar-config">${icone('nuvem')} Salvar a configuração na nuvem</button><button type="button" class="btn btn-secondary btn-sm" data-acao="nuvem-listar-config">Abrir configuração da nuvem</button></div>
                <div id="nv-lista"></div></section>
            <section class="card"><h2>Histórico neste navegador</h2><p class="nota">Fica no IndexedDB do navegador (não some ao fechar). Apagar não mexe na nuvem.</p>
                <div class="botoes"><button type="button" class="btn btn-danger btn-sm" data-acao="hist-apagar">${icone('lixo')} Apagar o histórico deste navegador</button></div></section></div>`;
    }
};
Object.assign(ACOES, {
    'nuvem-entrar': async () => { await nuvemGarantir(); renderPagina(true); avisar('Nuvem conectada.'); },
    'nuvem-sair': () => { nuvemSair(); renderPagina(true); },
    'nuvem-enviar-hist': async () => { await nuvemGarantir(); avisar('Enviando o histórico…', 'ok', 60000); const n = await enviarHistoricoNuvem(); avisar(`${n} arquivo(s) de dia enviados.`); renderPagina(true); },
    'nuvem-enviar-7': async () => {
        await nuvemGarantir();
        for (const pl of SUP.p.plantas) await histMetaGravar('nuvem:' + pl.id, 0);
        avisar('Reenviando os últimos 7 dias…', 'ok', 60000); const n = await enviarHistoricoNuvem(7); avisar(`${n} arquivo(s) de dia enviados.`); renderPagina(true);
    },
    'nuvem-trazer': async () => {
        const pl = SUP.planta($('#nv-pl').value); if (!pl) throw new Error('escolha a planta');
        const t0 = new Date($('#nv-de').value + 'T00:00').getTime(), t1 = new Date($('#nv-ate').value + 'T23:59:59').getTime();
        if (!(t1 >= t0)) throw new Error('período inválido');
        const r = await trazerHistoricoNuvem(pl, t0, t1, dia => avisar('Baixando ' + dia + '…', 'ok', 20000));
        avisar(r.dias ? `${r.dias} dia(s), ${r.amostras.toLocaleString('pt-BR')} amostra(s) trazidas.` : 'A nuvem não tem dados desta planta no período.', 'ok', 7000);
    },
    'hist-importar-zip': async () => { const arq = await escolherArquivo('.zip'); if (!arq) return; const r = await importarZipDia(arq); avisar(`Importado: ${r.amostras} amostra(s) e ${r.eventos} evento(s).`); },
    'nuvem-salvar-config': async () => { const n = await salvarConfigNuvem(); avisar(`Configuração salva na nuvem (pasta ${n}).`); },
    'nuvem-listar-config': async () => {
        const lst = await listarConfigNuvem();
        App.nuvemCfg = lst;
        $('#nv-lista').innerHTML = lst.length ? `<ul class="lista-nuvem">${lst.map((x, i) => `<li><b>${esc(x.nome)}</b> <select data-nvver="${i}" aria-label="Versão">${x.versoes.map((v, k) => `<option value="${k}">${esc(quandoArquivo(v) ? quandoArquivo(v).toLocaleString('pt-BR') : v.name)}</option>`).join('')}</select>
            <button type="button" class="btn btn-primary btn-sm" data-acao="nuvem-abrir-config" data-i="${i}">Abrir</button></li>`).join('')}</ul>` : vazio('Nenhuma configuração na nuvem ainda.');
    },
    'nuvem-abrir-config': async b => {
        const x = App.nuvemCfg[+b.dataset.i], v = x.versoes[+$(`[data-nvver="${b.dataset.i}"]`).value];
        if (SUP.p.plantas.length && !(await confirmar('Abrir esta configuração?', 'Substitui a configuração deste navegador (o histórico continua).', { botao: 'Abrir' }))) return;
        const dados = JSON.parse(await (await baixar(v)).text());
        SUP.substituir(dados); location.hash = '#/inicio'; renderPagina(); avisar('Configuração aberta da nuvem.');
    },
    'hist-apagar': async () => {
        if (!(await confirmar('Apagar o histórico deste navegador?', 'Amostras, eventos e marcas de envio deste navegador somem. O que já está na nuvem continua lá.', { botao: 'Apagar', perigo: true }))) return;
        await histApagarTudo(); avisar('Histórico do navegador apagado.');
    }
});
