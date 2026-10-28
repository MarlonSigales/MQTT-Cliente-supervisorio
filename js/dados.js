/**
 * © 2026 Supervisório MQTT — Inova Agro UFPel EMBRAPII. Código aberto; cópias permitidas desde que citadas.
 *
 * MODELO DE DADOS: projeto → plantas → áreas → equipamentos → variáveis (tópicos), comandos, publicações por equação,
 * controladores e sinótico. Toda leitura/gravação da configuração passa pelo objeto SUP. Os valores em tempo real ficam
 * em RT (runtime.js) e o histórico no IndexedDB (historico.js); aqui é só a configuração.
 * Mudou a estrutura: subir SUP_VERSAO e completar normalizarProjeto.
 */

'use strict';

const SUP_VERSAO = 1;
const SUP_FORMATO = 'supervisorio-mqtt';
const SUP_CHAVE = 'sup_projeto_v1';
const SUP_CHAVE_SENHAS = 'sup_senhas_v1';

// ---------------------------------------------------------------- utilidades
function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const escAttr = esc;
function uid(pre = 'id') { return pre + '_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3); }
function lista(x) { return Array.isArray(x) ? x : []; }
function num(x, padrao = null) { const n = typeof x === 'string' ? parseFloat(x.replace(',', '.')) : Number(x); return Number.isFinite(n) ? n : padrao; }
function texto(x, padrao = '') { return x == null ? padrao : String(x); }
function clonar(o) { return JSON.parse(JSON.stringify(o)); }
function nomeSeguro(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'sem-nome';
}
/** Nome de variável para as equações: "Temperatura do silo 1" → temperatura_silo_1 */
function nomeVariavel(s) {
    const pare = new Set(['de', 'do', 'da', 'dos', 'das', 'e', 'o', 'a', 'em', 'no', 'na']);
    let v = String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(p => p && !pare.has(p)).join('_');
    if (!v) v = 'var';
    if (/^[0-9]/.test(v)) v = 'v_' + v;
    return v.slice(0, 40);
}
function variavelUnica(base, usadas) {
    let v = nomeVariavel(base), i = 2;
    const raiz = v;
    while (usadas.has(v) || NOMES_RESERVADOS.has(v)) v = raiz + '_' + (i++);
    usadas.add(v);
    return v;
}
const NOMES_RESERVADOS = new Set(['pi', 'e', 't', 'dt', 'hora', 'dia', 'se', 'if', 'true', 'false', 'verdadeiro', 'falso']);

function formatarNumero(v, dec = 1) {
    if (v == null || !Number.isFinite(v)) return '—';
    return v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function formatarDuracao(seg) {
    seg = Math.max(0, Math.round(seg || 0));
    const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60);
    if (h >= 1) return `${h.toLocaleString('pt-BR')} h ${String(m).padStart(2, '0')} min`;
    if (m >= 1) return `${m} min ${String(seg % 60).padStart(2, '0')} s`;
    return `${seg} s`;
}
function dataHora(t) { return t ? new Date(t).toLocaleString('pt-BR') : '—'; }
function horaCurta(t) { return t ? new Date(t).toLocaleTimeString('pt-BR') : '—'; }
function diaISO(t) { const d = new Date(t); const z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; }

// ---------------------------------------------------------------- tipos de variável (ícones em icones.js)
/**
 * Cada tipo define unidade, casas decimais, faixa típica (para a barra analógica, ISA-101) e palavras que o identificam
 * no nome do tópico (usado pela descoberta de tópicos para pré-preencher).
 */
const TIPOS_VAR = {
    temperatura: { nome: 'Temperatura', un: '°C', dec: 1, faixa: [0, 60], palavras: ['temp', 'temperatura', 'tmp', 't_'] },
    umidade: { nome: 'Umidade relativa', un: '%', dec: 1, faixa: [0, 100], palavras: ['umid', 'ur', 'rh', 'hum'] },
    umidade_grao: { nome: 'Umidade do grão', un: '% b.u.', dec: 1, faixa: [10, 30], palavras: ['umidade_grao', 'ug', 'moisture'] },
    orvalho: { nome: 'Ponto de orvalho', un: '°C', dec: 1, faixa: [-10, 40], palavras: ['orvalho', 'dew', 'td'] },
    co2: { nome: 'CO₂', un: 'ppm', dec: 0, faixa: [300, 5000], palavras: ['co2', 'carbono'] },
    pressao: { nome: 'Pressão', un: 'kPa', dec: 2, faixa: [0, 200], palavras: ['press', 'pressao', 'bar', 'kpa', 'pa_'] },
    peso: { nome: 'Peso', un: 'kg', dec: 1, faixa: [0, 1000], palavras: ['peso', 'massa', 'kg', 'weight', 'balanca', 'load'] },
    volume: { nome: 'Volume', un: 'm³', dec: 2, faixa: [0, 100], palavras: ['volume', 'vol', 'm3'] },
    nivel: { nome: 'Nível', un: '%', dec: 1, faixa: [0, 100], palavras: ['nivel', 'level'] },
    vazao: { nome: 'Vazão', un: 't/h', dec: 1, faixa: [0, 100], palavras: ['vazao', 'flow', 'fluxo'] },
    velocidade: { nome: 'Velocidade', un: 'm/s', dec: 2, faixa: [0, 10], palavras: ['vel', 'speed', 'velocidade'] },
    rotacao: { nome: 'Rotação', un: 'rpm', dec: 0, faixa: [0, 1800], palavras: ['rpm', 'rotacao', 'rot'] },
    aceleracao: { nome: 'Aceleração', un: 'm/s²', dec: 2, faixa: [0, 20], palavras: ['acel', 'accel', 'vib', 'g_'] },
    potencia: { nome: 'Potência', un: 'kW', dec: 2, faixa: [0, 50], palavras: ['pot', 'power', 'kw', 'watt'] },
    energia: { nome: 'Energia', un: 'kWh', dec: 1, faixa: [0, 1000], palavras: ['energia', 'kwh', 'energy'] },
    corrente: { nome: 'Corrente', un: 'A', dec: 1, faixa: [0, 50], palavras: ['corr', 'current', 'amp', 'i_', 'ia', 'ib', 'ic'] },
    tensao: { nome: 'Tensão', un: 'V', dec: 0, faixa: [0, 440], palavras: ['tens', 'volt', 'v_', 'va', 'vb', 'vc'] },
    fp: { nome: 'Fator de potência', un: '', dec: 2, faixa: [0, 1], palavras: ['fp', 'pf', 'cosphi', 'fator'] },
    frequencia: { nome: 'Frequência', un: 'Hz', dec: 1, faixa: [55, 65], palavras: ['freq', 'hz'] },
    estado: { nome: 'Estado (liga/desliga)', un: '', dec: 0, faixa: [0, 1], palavras: ['estado', 'status', 'state', 'liga', 'on'] },
    percentual: { nome: 'Abertura / saída (%)', un: '%', dec: 1, faixa: [0, 100], palavras: ['abertura', 'saida', 'valv', 'duty', 'pwm'] },
    equacao: { nome: 'Equação do usuário', un: '', dec: 2, faixa: [0, 100], palavras: [] },
    generico: { nome: 'Outro', un: '', dec: 2, faixa: [0, 100], palavras: [] }
};

/** Adivinha o tipo pelo nome do tópico (só sugestão; a pessoa troca na lista). */
function adivinharTipo(topico) {
    const t = String(topico || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const ultimo = t.split('/').pop();
    const ordem = ['orvalho', 'umidade_grao', 'co2', 'energia', 'potencia', 'fp', 'frequencia', 'corrente', 'tensao', 'temperatura', 'umidade',
        'pressao', 'peso', 'volume', 'nivel', 'vazao', 'rotacao', 'aceleracao', 'velocidade', 'percentual', 'estado'];
    for (const alvo of [ultimo, t]) {
        for (const k of ordem) {
            if (TIPOS_VAR[k].palavras.some(p => (p.length <= 2 ? new RegExp('(^|[^a-z])' + p + '($|[^a-z])').test(alvo) : alvo.includes(p)))) return k;
        }
    }
    return 'generico';
}

// ---------------------------------------------------------------- criação
const ORIGENS = {
    mqtt: 'Recebida por MQTT',
    calc: 'Calculada (equação)',
    integral: 'Integral de outra variável (energia)',
    controle: 'Saída de controlador',
    manual: 'Digitada (constante/parâmetro)'
};

function criarProjetoVazio() {
    return {
        formato: SUP_FORMATO, versao: SUP_VERSAO,
        nome: 'Supervisório', criadoEm: new Date().toISOString(), alteradoEm: new Date().toISOString(),
        plantas: [],
        opcoes: {
            tarifa: 0.85,              // R$/kWh para os relatórios
            somAlarme: true,
            notificacao: false,
            retencaoDias: 90,          // histórico guardado no navegador
            nuvemHistorico: true,      // enviar o histórico para o MEGA quando a nuvem estiver ligada
            nuvemIntervaloMin: 30,
            graficosSalvos: []
        },
        relatorio: { empresa: '', responsavel: '', observacoes: '' }
    };
}

function criarPlanta(nome = 'Nova planta') {
    return {
        id: uid('pl'), nome, descricao: '', cor: '#409580',
        conexao: {
            tipo: 'mqtt',                                   // mqtt | simulado
            url: 'wss://broker.emqx.io:8084/mqtt',
            usuario: '', clientId: '', prefixo: '', keepalive: 30, qos: 0,
            lembrarSenha: true,
            lwt: true                                      // avisa o broker quando o supervisório cai (Last Will)
        },
        areas: [], equipamentos: [], tags: [], comandos: [], publicacoes: [], controladores: [], alarmesExtra: [],
        sinotico: { largura: 1600, altura: 900, grade: 10, elementos: [] },
        simulacao: null
    };
}

function criarArea(nome = 'Área') { return { id: uid('ar'), nome }; }
function criarEquipamento(nome = 'Equipamento', areaId = '', simbolo = 'motor') {
    return {
        id: uid('eq'), nome, areaId, simbolo, descricao: '',
        horimetro: { ativo: false, fonte: 'tag', tagId: '', limLigado: 0.5, limTrabalho: null, exprLigado: '', exprTrabalho: '' },
        tagPotencia: ''                                    // para a energia por estado (trabalhando / em vazio)
    };
}
function criarTag(p = {}) {
    const tipo = TIPOS_VAR[p.tipo] ? p.tipo : 'generico';
    const T = TIPOS_VAR[tipo];
    return {
        id: p.id || uid('tg'),
        nome: p.nome || T.nome,
        variavel: p.variavel || '',
        tipo, unidade: p.unidade != null ? p.unidade : T.un, dec: p.dec != null ? p.dec : T.dec,
        origem: ORIGENS[p.origem] ? p.origem : 'mqtt',
        topico: p.topico || '', caminhoJson: p.caminhoJson || '',
        escala: p.escala != null ? p.escala : 1, deslocamento: p.deslocamento != null ? p.deslocamento : 0,
        expr: p.expr || '', fonteIntegral: p.fonteIntegral || '', fatorIntegral: p.fatorIntegral != null ? p.fatorIntegral : 1 / 3600,
        valorManual: p.valorManual != null ? p.valorManual : 0,
        equipId: p.equipId || '', areaId: p.areaId || '',
        faixa: p.faixa || T.faixa.slice(),
        limites: Object.assign({ ativo: false, ll: null, l: null, h: null, hh: null, histerese: 0, atrasoS: 5, semDadosS: 120,
            prioridadeExtremos: 2, prioridadeAvisos: 3 }, p.limites || {}),
        registro: Object.assign({ banda: 0, minS: 1, maxS: 60 }, p.registro || {}),
        ctl: p.ctl || null
    };
}
function criarComando(p = {}) {
    return Object.assign({
        id: uid('cm'), nome: 'Comando', tipo: 'chave',             // chave | setpoint | botao
        topico: '', payloadLiga: '1', payloadDesliga: '0', retain: true, qos: 1,
        tagEstado: '', min: 0, max: 100, passo: 1, unidade: '', confirmar: true, equipId: '', ultimo: null
    }, p);
}
function criarPublicacao(p = {}) {
    return Object.assign({ id: uid('pb'), nome: 'Publicação', topico: '', expr: '', periodoS: 10, ativo: false, retain: false, qos: 0,
        formato: 'numero', soQuandoMuda: false, condicao: '' }, p);
}
function criarControlador(p = {}) {
    return Object.assign({
        id: uid('ct'), nome: 'Controlador', tipo: 'pid',               // pid | tf | ss | obs | onoff
        Ts: 1, ativo: false, modo: 'auto', saidaManual: 0,
        entradas: [],                 // ids das variáveis medidas (y)
        referencias: ['0'],           // equações das referências (r) — número, variável ou equação
        saidas: [{ topico: '', tagId: '' }],
        limites: { min: 0, max: 100, taxa: 0 },
        params: { kp: 1, ki: 0.1, kd: 0, N: 10, num: '[0.1]', den: '[1 -0.9]', A: '', B: '', C: '', D: '', K: '', L: '', Nr: '',
            Ac: '', Bc: '', Cc: '', Dc: '', histerese: 1, acao: 'direta' },
        topicoParametros: '',        // os ganhos podem chegar por MQTT (JSON) — carregados a partir dos dados
        habilitarSe: ''              // condição de intertravamento (equação); vazio = sempre
    }, p);
}

// ---------------------------------------------------------------- normalização (aceita arquivo antigo ou incompleto)
function normalizarProjeto(d) {
    const p = criarProjetoVazio();
    if (!d || typeof d !== 'object') return p;
    p.nome = texto(d.nome, p.nome) || 'Supervisório';
    p.criadoEm = texto(d.criadoEm, p.criadoEm);
    p.alteradoEm = texto(d.alteradoEm, p.alteradoEm);
    Object.assign(p.opcoes, typeof d.opcoes === 'object' && d.opcoes ? d.opcoes : {});
    p.opcoes.graficosSalvos = lista(p.opcoes.graficosSalvos);
    Object.assign(p.relatorio, typeof d.relatorio === 'object' && d.relatorio ? d.relatorio : {});
    p.plantas = lista(d.plantas).map(normalizarPlanta);
    return p;
}

function normalizarPlanta(d) {
    const pl = criarPlanta(texto(d && d.nome, 'Planta'));
    if (!d || typeof d !== 'object') return pl;
    pl.id = texto(d.id) || pl.id;
    pl.descricao = texto(d.descricao); pl.cor = texto(d.cor, pl.cor) || pl.cor;
    Object.assign(pl.conexao, typeof d.conexao === 'object' && d.conexao ? d.conexao : {});
    delete pl.conexao.senha;                                   // senha nunca fica no arquivo do projeto
    pl.areas = lista(d.areas).filter(a => a && a.id).map(a => ({ id: texto(a.id), nome: texto(a.nome, 'Área') }));
    pl.equipamentos = lista(d.equipamentos).filter(e => e && e.id).map(e => {
        const n = criarEquipamento(texto(e.nome, 'Equipamento'), texto(e.areaId), texto(e.simbolo, 'motor'));
        n.id = e.id; n.descricao = texto(e.descricao); n.tagPotencia = texto(e.tagPotencia);
        Object.assign(n.horimetro, e.horimetro || {});
        return n;
    });
    const usadas = new Set();
    pl.tags = lista(d.tags).filter(t => t && t.id).map(t => {
        const n = criarTag(t);
        n.variavel = variavelUnica(t.variavel || t.nome, usadas);
        return n;
    });
    pl.comandos = lista(d.comandos).filter(c => c && c.id).map(c => criarComando(c));
    pl.publicacoes = lista(d.publicacoes).filter(c => c && c.id).map(c => criarPublicacao(c));
    pl.controladores = lista(d.controladores).filter(c => c && c.id).map(c => {
        const n = criarControlador(c);
        n.params = Object.assign(criarControlador().params, c.params || {});
        n.limites = Object.assign(criarControlador().limites, c.limites || {});
        n.entradas = lista(c.entradas); n.referencias = lista(c.referencias).map(String); n.saidas = lista(c.saidas).map(s => ({ topico: texto(s && s.topico), tagId: texto(s && s.tagId) }));
        if (!n.referencias.length) n.referencias = ['0'];
        if (!n.saidas.length) n.saidas = [{ topico: '', tagId: '' }];
        return n;
    });
    pl.alarmesExtra = lista(d.alarmesExtra).filter(a => a && a.id).map(a => Object.assign({ id: a.id, nome: 'Alarme', expr: '', prioridade: 3, atrasoS: 5, ativo: true }, a));
    const s = d.sinotico || {};
    pl.sinotico = { largura: num(s.largura, 1600), altura: num(s.altura, 900), grade: num(s.grade, 10), elementos: lista(s.elementos).filter(e => e && e.id && e.s) };
    pl.simulacao = d.simulacao && typeof d.simulacao === 'object' ? d.simulacao : null;
    return pl;
}

// ---------------------------------------------------------------- o objeto SUP (configuração atual)
const SUP = {
    p: criarProjetoVazio(),
    ouvintes: [],
    _t: null,
    planta(id) { return this.p.plantas.find(x => x.id === id) || null; },
    tag(id) { for (const pl of this.p.plantas) { const t = pl.tags.find(x => x.id === id); if (t) return t; } return null; },
    plantaDaTag(id) { return this.p.plantas.find(pl => pl.tags.some(x => x.id === id)) || null; },
    equipamento(id) { for (const pl of this.p.plantas) { const e = pl.equipamentos.find(x => x.id === id); if (e) return e; } return null; },
    area(pl, id) { return pl.areas.find(a => a.id === id) || null; },
    todasTags() { return this.p.plantas.flatMap(pl => pl.tags.map(t => ({ pl, t }))); },
    /** Mudou a configuração: grava (com atraso) e avisa o runtime para recompilar equações e assinaturas. */
    alterado(oQue = 'config') {
        this.p.alteradoEm = new Date().toISOString();
        clearTimeout(this._t);
        this._t = setTimeout(() => this.gravar(), 400);
        this.ouvintes.forEach(f => { try { f(oQue); } catch (e) { console.error(e); } });
    },
    ouvir(f) { this.ouvintes.push(f); },
    gravar() {
        try { localStorage.setItem(SUP_CHAVE, JSON.stringify(this.p)); return true; }
        catch (e) { console.warn('Não consegui guardar a configuração no navegador', e); return false; }
    },
    carregar() {
        try { const s = localStorage.getItem(SUP_CHAVE); if (s) this.p = normalizarProjeto(JSON.parse(s)); }
        catch (e) { this.p = criarProjetoVazio(); }
        return this.p;
    },
    substituir(novo) { this.p = normalizarProjeto(novo); this.gravar(); this.ouvintes.forEach(f => { try { f('tudo'); } catch (e) { console.error(e); } }); }
};

// senhas dos brokers: só neste navegador, nunca no arquivo nem na nuvem
const Senhas = {
    ler() { try { return JSON.parse(localStorage.getItem(SUP_CHAVE_SENHAS) || '{}'); } catch (e) { return {}; } },
    de(plId) { return this.ler()[plId] || ''; },
    guardar(plId, s) { const m = this.ler(); if (s) m[plId] = s; else delete m[plId]; try { localStorage.setItem(SUP_CHAVE_SENHAS, JSON.stringify(m)); } catch (e) { /* ok */ } }
};

/** Garante que toda variável tenha nome de variável único na planta (para as equações). */
function garantirVariaveis(pl) {
    const usadas = new Set();
    pl.tags.forEach(t => { t.variavel = variavelUnica(t.variavel || t.nome, usadas); });
}

/** Tópico completo: prefixo da planta + tópico da variável (o tópico pode começar com "/" para ignorar o prefixo). */
function topicoCompleto(pl, topico) {
    const t = String(topico || '').trim();
    if (!t) return '';
    if (t.startsWith('/')) return t.slice(1);
    const pre = String(pl.conexao.prefixo || '').trim().replace(/\/+$/, '');
    return pre ? pre + '/' + t : t;
}
