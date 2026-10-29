/**
 * © 2026 Supervisório MQTT — Inova Agro UFPel EMBRAPII. Código aberto; cópias permitidas desde que citadas.
 *
 * ENTRADAS E SAÍDAS (PORTAS) DOS SÍMBOLOS E LIGAÇÕES TIPADAS.
 * Cada símbolo tem portas de um tipo: material (grão/sólido), ar (ar e gases), líquido (água, leite, óleo), vapor,
 * ar comprimido (pneumático), elétrico (potência) e sinal (dados/instrumentação). A linha herda o tipo da porta e o
 * formato da porta segue o tipo de linha (quadrado = material, retângulo largo = duto de ar, círculo = líquido,
 * triângulo = vapor, hexágono = ar comprimido, losango = elétrico, círculo pequeno = sinal). Saída é cheia; entrada é vazada.
 *
 * Regra da tubulação (atalho L): começa obrigatoriamente numa SAÍDA e termina obrigatoriamente numa ENTRADA do MESMO
 * tipo. A linha fica presa às portas: mover ou girar o símbolo leva a linha junto.
 *
 * Notação das portas: "tipo:e|s@x,y[:direção]" com x e y de 0 a 1 no símbolo (antes de girar); direção t, b, l, r
 * (deduzida da borda quando omitida). "tipo:s@N" = N saídas embaixo (bicas); "tipo:e@T" = N entradas em cima.
 */

'use strict';

const TIPOS_PORTA = {
    material: { nome: 'Material (grão / sólido)', estilo: 'material' },
    ar: { nome: 'Ar / gases (duto)', estilo: 'ar' },
    liquido: { nome: 'Líquido (água, leite, óleo)', estilo: 'liquido' },
    vapor: { nome: 'Vapor', estilo: 'vapor' },
    ar_comprimido: { nome: 'Ar comprimido (pneumático)', estilo: 'pneumatico' },
    eletrico: { nome: 'Elétrico (potência)', estilo: 'eletrico' },
    sinal: { nome: 'Sinal / dados', estilo: 'dados' }
};
Object.assign(ESTILOS_TUBO, { liquido: 'Líquido (água, leite, óleo)', vapor: 'Vapor' });

// portas dos símbolos (os novos de agro.js trazem as suas)
const PORTAS_SIMBOLOS = {
    silo: 'material:e@.5,0 material:s@.5,1 ar:e@.04,.74:l', silo_pulmao: 'material:e@.5,0 material:s@.5,1', armazem: 'material:e@.5,0 material:s@.5,1 ar:e@0,.8',
    ventilador: 'ar:e@0,.5 ar:s@1,.5 eletrico:e@.5,0', moega: 'material:e@.5,0 material:s@.5,1',
    caminhao_graneleiro: 'material:e@.35,.2:t material:s@.35,1', caminhao_basculante: 'material:e@.3,.12:t material:s@0,.62', carreta_bitrem: 'material:e@.4,.2:t material:s@.4,1', caminhao_bau: 'material:e@.35,.07:t material:s@.35,1',
    tombador: 'material:e@.6,.2:t material:s@.15,1', amostrador: 'material:s@.5,1 sinal:s@1,.35',
    balanca: 'sinal:s@1,.5', balanca_fluxo: 'material:e@.5,0 material:s@.5,1 sinal:s@1,.5', balanca_fita: 'material:e@.15,0 material:s@.5,1 eletrico:e@1,.2', ensacadora: 'material:e@.5,0 material:s@.5,1',
    ensacadora_dupla: 'material:e@.5,0 material:s@.25,1 material:s@.75,1', balanca_expedicao: 'material:e@.5,0 material:s@.5,1', balanca_bigbag: 'material:e@.5,0 material:s@.5,1',
    balanca_residuo: 'material:e@.5,0 material:s@.5,1', balanca_plataforma: 'sinal:s@1,.75',
    prelimpeza: 'material:e@.5,0 material:s@.5,1 material:s@.9,1 ar:s@1,.3 eletrico:e@0,.2', maquina_limpeza: 'material:e@.8,0 material:s@.5,1 material:s@.2,1 ar:s@1,.4 eletrico:e@0,.3',
    descascador: 'material:e@.5,0 material:s@.5,1 ar:s@1,.25 eletrico:e@0,.5', separador_marinheiros: 'material:e@.1,.12:t material:s@.16,1 material:s@.84,1 eletrico:e@1,.6',
    separador_pedras: 'material:e@.92,0 material:s@.1,1 material:s@.9,1 ar:e@.5,1 eletrico:e@0,.3', brunidor: 'material:e@.5,0 material:s@.74,1 ar:s@.56,1 eletrico:e@0,.8',
    polidor: 'material:e@.5,0 material:s@.74,1 ar:s@.56,1 liquido:e@1,.13 eletrico:e@0,.8', peneira_classificadora: 'material:e@.15,0 material:s@N eletrico:e@1,.3',
    classificador_espessura: 'material:e@0,.4 material:s@.35,1 material:s@.8,1 eletrico:e@1,.4', trieur: 'material:e@0,.4 material:s@.25,1 material:s@.75,1 eletrico:e@1,.4',
    selecionadora_optica: 'material:e@.5,0 material:s@N ar_comprimido:e@1,.5 sinal:s@0,.4', separador_magnetico: 'material:e@.5,0 material:s@.41,1 material:s@.7,1 eletrico:e@1,.4',
    parboilizacao: 'material:e@.5,0 material:s@.5,1 liquido:e@0,.3 vapor:e@1,.3', aspirador_casca: 'ar:e@0,.5 ar:s@.87,0 eletrico:e@.2,1',
    secador: 'material:e@.5,0 material:s@.5,1 ar:e@0,.5 ar:s@1,.3', fornalha: 'ar:s@1,.55 ar:e@0,.55', elevador: 'material:e@0,.95 material:s@1,.04 eletrico:e@.5,0',
    transportador: 'material:e@.05,0 material:s@N eletrico:e@0,.5', rosca: 'material:e@.05,0 material:s@.95,1 eletrico:e@0,.5', correia: 'material:e@.12,0 material:s@1,.5 eletrico:e@0,.5',
    motor: 'eletrico:e@.3,0', painel: 'eletrico:e@.5,0 eletrico:s@.5,1', transformador: 'eletrico:e@.5,0 eletrico:s@.5,1', qgbt: 'eletrico:e@.5,0 eletrico:s@.5,1 sinal:s@1,.2',
    inversor: 'eletrico:e@.5,0 eletrico:s@.5,1 sinal:e@0,.5', clp: 'sinal:e@0,.5 sinal:s@1,.5 eletrico:e@.5,0', ihm: 'sinal:e@0,.35 sinal:s@1,.35', quadro_comando: 'eletrico:e@.5,0 eletrico:s@.5,1 sinal:e@0,.5',
    bomba: 'liquido:e@0,.5 liquido:s@1,.08 eletrico:e@.45,1', tanque: 'liquido:e@.5,0 liquido:s@.5,1', pid_bomba: 'liquido:e@0,.45 liquido:s@1,.11 eletrico:e@.45,1', pid_bomba_dp: 'liquido:e@0,.45 liquido:s@1,.45 eletrico:e@.5,1',
    pid_compressor: 'ar:e@0,.5 ar_comprimido:s@1,.5 eletrico:e@.5,1', pid_trocador: 'liquido:e@0,.5 liquido:s@1,.5 liquido:e@.5,0 liquido:s@.5,1', pid_vaso: 'liquido:e@.5,0 liquido:s@.5,1',
    pid_tanque: 'liquido:e@.5,0 liquido:s@.5,1', pid_filtro_y: 'liquido:e@0,.3 liquido:s@1,.3', pid_orificio: 'liquido:e@0,.5 liquido:s@1,.5 sinal:s@.5,0', pid_rotametro: 'liquido:e@.5,1 liquido:s@.5,0',
    pid_purgador: 'vapor:e@0,.5 liquido:s@1,.5', pid_flange_cego: 'liquido:e@0,.5', pid_redutor: 'liquido:e@0,.5 liquido:s@1,.5',
    valvula: 'liquido:e@0,.5 liquido:s@1,.5', v_gaveta: 'liquido:e@0,.5 liquido:s@1,.5', v_globo: 'liquido:e@0,.5 liquido:s@1,.5', v_esfera: 'liquido:e@0,.5 liquido:s@1,.5', v_borboleta: 'liquido:e@0,.5 liquido:s@1,.5',
    v_retencao: 'liquido:e@0,.5 liquido:s@1,.5', v_tres_vias: 'liquido:e@0,.35 liquido:s@1,.35 liquido:s@.5,1', v_agulha: 'liquido:e@0,.6 liquido:s@1,.6', v_alivio: 'liquido:e@.3,1 liquido:s@1,.58',
    v_controle: 'liquido:e@0,.75 liquido:s@1,.75 ar_comprimido:e@.5,0', v_solenoide: 'liquido:e@0,.75 liquido:s@1,.75 sinal:e@.5,0', v_motorizada: 'liquido:e@0,.75 liquido:s@1,.75 eletrico:e@.5,0',
    v_pneumatica: 'liquido:e@0,.75 liquido:s@1,.75 ar_comprimido:e@.5,0', v_redutora: 'liquido:e@0,.72 liquido:s@1,.72',
    camara: 'liquido:e@1,.35 liquido:s@1,.65', compressor: 'liquido:e@0,.5 liquido:s@1,.5 eletrico:e@.5,0', evaporador: 'liquido:e@0,.5 liquido:s@1,.5 ar:s@.5,1',
    estacao: 'sinal:s@1,.45', sensor_termometria: 'sinal:s@.5,0',
    guilhotina_manual: 'material:e@.5,0 material:s@.5,1', guilhotina_pneumatica: 'material:e@.24,0 material:s@.24,1 ar_comprimido:e@.77,.32:t', comporta_onoff: 'material:e@.29,0 material:s@.29,1 eletrico:e@.72,.28:t',
    comporta_proporcional: 'material:e@.29,0 material:s@.29,1 eletrico:e@.72,.28:t', comporta_fumigacao: 'material:e@.34,0 material:s@.34,1', desviadora_2: 'material:e@.5,0 material:s@.17,1 material:s@.83,1',
    desvio_rapido: 'material:e@.5,0 material:s@.17,1 material:s@.83,1 ar_comprimido:e@1,.26', distribuidor_n: 'material:e@.5,0 material:s@N', selecionador_n: 'material:e@.5,0 material:s@N',
    valvula_rotativa: 'material:e@.5,0 material:s@.5,1 eletrico:e@1,.5', bica_telescopica: 'material:e@.5,0 material:s@.5,1', calha_vibratoria: 'material:e@.1,.2:t material:s@1,.55',
    ventilador_centrifugo: 'ar:e@0,.5 ar:s@.88,0 eletrico:e@.2,1', exaustor_axial: 'ar:e@0,.5 ar:s@1,.5 eletrico:e@.5,1', registro_borboleta_ar: 'ar:e@0,.5 ar:s@1,.5', guilhotina_ar: 'ar:e@0,.55 ar:s@1,.55',
    damper_motorizado: 'ar:e@0,.6 ar:s@.66,.6:r', ciclone: 'ar:e@1,.18 ar:s@.5,0 material:s@.5,1', filtro_mangas: 'ar:e@0,.3 ar:s@.5,0 material:s@.5,1 ar_comprimido:e@1,.15',
    alivio_explosao: 'ar:e@.5,1', valvula_isolamento: 'ar:e@0,.5 ar:s@1,.5', gaveta_deslizante: 'ar:e@0,.5 ar:s@.6,.5:r', ventilacao_sem_chama: 'ar:e@.5,1', supressao: 'sinal:e@.5,0',
    chave: 'sinal:s@1,.5', setpoint: 'sinal:s@1,.5', botoeira: 'sinal:s@1,.5', botao_pulso: 'sinal:s@1,.5', emergencia: 'sinal:s@1,.5', seletor: 'sinal:s@1,.5', sinaleiro: 'sinal:e@0,.5',
    pid_inst_campo: 'sinal:e@0,.5 sinal:s@1,.5', pid_inst_painel: 'sinal:e@0,.5 sinal:s@1,.5', pid_inst_clp: 'sinal:e@0,.5 sinal:s@1,.5', pid_inst_software: 'sinal:e@0,.5 sinal:s@1,.5', pid_intertravamento: 'sinal:e@0,.5 sinal:s@1,.5'
};
SIMBOLOS.transportador.n = 2;      // descargas do redler (ajustável)
// sensores: uma saída de sinal à direita
Object.keys(SIMBOLOS).filter(k => SIMBOLOS[k].sensor && !PORTAS_SIMBOLOS[k]).forEach(k => { PORTAS_SIMBOLOS[k] = 'sinal:s@1,.5'; });

function dirDaBorda(x, y) {
    if (y <= 0.001) return 't'; if (y >= 0.999) return 'b'; if (x <= 0.001) return 'l'; if (x >= 0.999) return 'r';
    const d = [[y, 't'], [1 - y, 'b'], [x, 'l'], [1 - x, 'r']].sort((a, b) => a[0] - b[0]);
    return d[0][1];
}
/** Lista de portas do elemento (coordenadas locais em px, antes do giro). */
function portasDoElemento(el) {
    const S = SIMBOLOS[el.s];
    if (!S || el.s === 'tubo') return [];
    const txt = S.portas || PORTAS_SIMBOLOS[el.s] || '';
    if (!txt) return [];
    const w = el.w || S.w, h = el.h || S.h, n = nSaidas(el, S);
    const out = [], cont = { e: 0, s: 0 };
    const add = (tipo, io, fx, fy, dir) => out.push({ id: io + (cont[io]++), tipo, io, x: fx * w, y: fy * h, dir: dir || dirDaBorda(fx, fy) });
    for (const tk of txt.trim().split(/\s+/)) {
        const m = /^(\w+):([es])@(N|T|[\d.]+,[\d.]+)(?::([tblr]))?$/.exec(tk);
        if (!m || !TIPOS_PORTA[m[1]]) continue;
        if (m[3] === 'N') { for (let i = 0; i < n; i++) add(m[1], m[2], (i + .5) / n, 1, 'b'); continue; }
        if (m[3] === 'T') { for (let i = 0; i < n; i++) add(m[1], m[2], (i + .5) / n, 0, 't'); continue; }
        const [fx, fy] = m[3].split(',').map(Number);
        add(m[1], m[2], fx, fy, m[4]);
    }
    // motores ganham a entrada elétrica (se o símbolo ainda não tem)
    if (S.kit && S.kit.motor && !out.some(p => p.tipo === 'eletrico')) add('eletrico', 'e', .92, 0, 't');
    return out;
}
const VET_DIR = { t: [0, -1], b: [0, 1], l: [-1, 0], r: [1, 0] };
function girar(px, py, cx, cy, graus) {
    if (!graus) return [px, py];
    const a = graus * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), dx = px - cx, dy = py - cy;
    return [cx + dx * c - dy * s, cy + dx * s + dy * c];
}
/** Posição e direção da porta no desenho (com giro). */
function portaGlobal(el, porta) {
    const S = SIMBOLOS[el.s], w = el.w || S.w, h = el.h || S.h;
    const [gx, gy] = girar(porta.x, porta.y, w / 2, h / 2, el.rot || 0);
    const [vx, vy] = VET_DIR[porta.dir];
    const [rx, ry] = girar(vx, vy, 0, 0, el.rot || 0);
    return { x: el.x + gx, y: el.y + gy, dx: Math.round(rx), dy: Math.round(ry), tipo: porta.tipo, io: porta.io, id: porta.id };
}
function acharPorta(pl, ref) {
    const el = pl.sinotico.elementos.find(e => e.id === (ref && ref.el));
    if (!el) return null;
    const p = portasDoElemento(el).find(x => x.id === ref.p);
    return p ? portaGlobal(el, p) : null;
}

// ---------------------------------------------------------------- desenho das portas (formato pelo tipo de linha)
function formaPorta(tipo, cheia) {
    const c = `porta-forma ${cheia ? 'cheia' : 'vazada'}`;
    switch (tipo) {
        case 'material': return `<rect class="${c}" x="-5" y="-5" width="10" height="10"/>`;
        case 'ar': return `<rect class="${c}" x="-8" y="-4" width="16" height="8" rx="1"/>`;
        case 'liquido': return `<circle class="${c}" r="5"/>`;
        case 'vapor': return `<path class="${c}" d="M0 -6 L6 5 L-6 5 Z"/>`;
        case 'ar_comprimido': return `<path class="${c}" d="M-5.5 0 L-2.8 -5 H2.8 L5.5 0 L2.8 5 H-2.8 Z"/>`;
        case 'eletrico': return `<path class="${c}" d="M0 -6 L5 0 L0 6 L-5 0 Z"/>`;
        default: return `<circle class="${c}" r="3.5"/>`;
    }
}
function svgPortas(el) {
    return `<g class="portas">${portasDoElemento(el).map(p => {
        const ang = { t: 0, b: 0, l: 90, r: 90 }[p.dir];
        return `<g class="porta p-${p.tipo} porta-${p.io}" data-porta="${p.id}" data-tipo="${p.tipo}" data-io="${p.io}" transform="translate(${r1(p.x)} ${r1(p.y)})${p.tipo === 'ar' && ang ? ` rotate(${ang})` : ''}"><title>${p.io === 's' ? 'Saída' : 'Entrada'}: ${esc(TIPOS_PORTA[p.tipo].nome)}</title><circle class="porta-alvo" r="11"/>${formaPorta(p.tipo, p.io === 's')}</g>`;
    }).join('')}</g>`;
}
function htmlLegendaPortas() {
    return `<details class="balao-info legenda-portas"><summary>◧ Entradas e saídas</summary><div class="balao-info-corpo">
        <p>Saída = forma <b>cheia</b>; entrada = forma <b>vazada</b>. A tubulação (L) começa numa saída e termina numa entrada do mesmo tipo.</p>
        <ul class="lista-portas">${Object.entries(TIPOS_PORTA).map(([k, T]) => `<li><svg viewBox="-12 -9 24 18" width="26" height="18">${formaPorta(k, true)}</svg><svg viewBox="-12 -9 24 18" width="26" height="18">${formaPorta(k, false)}</svg> ${esc(T.nome)}</li>`).join('')}</ul></div></details>`;
}

// ---------------------------------------------------------------- caminho da ligação
const AFASTA = 16;
function limparPontos(pts) {
    const out = [];
    for (const p of pts) { const q = [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]; const u = out[out.length - 1]; if (!u || u[0] !== q[0] || u[1] !== q[1]) out.push(q); }
    // tira pontos do meio de trechos retos
    for (let i = out.length - 2; i > 0; i--) { const a = out[i - 1], b = out[i], c = out[i + 1]; if ((a[0] === b[0] && b[0] === c[0]) || (a[1] === b[1] && b[1] === c[1])) out.splice(i, 1); }
    return out;
}
/** Caminho ortogonal entre a saída e a entrada (com os pontos intermediários escolhidos, se houver). */
function caminhoLigacao(de, para, meio = []) {
    const a0 = [de.x, de.y], a = [de.x + de.dx * AFASTA, de.y + de.dy * AFASTA];
    const b0 = [para.x, para.y], b = [para.x + para.dx * AFASTA, para.y + para.dy * AFASTA];
    const pts = [a0, a];
    let ult = a, vert = de.dx === 0;
    for (const m of meio) {
        if (vert) pts.push([ult[0], m[1]], m); else pts.push([m[0], ult[1]], m);
        vert = !vert; ult = m;
    }
    const chegaVert = para.dx === 0;
    if (!meio.length) {
        if (vert && chegaVert) { const ym = (a[1] + b[1]) / 2; pts.push([a[0], ym], [b[0], ym]); }
        else if (!vert && !chegaVert) { const xm = (a[0] + b[0]) / 2; pts.push([xm, a[1]], [xm, b[1]]); }
        else if (vert) pts.push([a[0], b[1]]); else pts.push([b[0], a[1]]);
    } else if (chegaVert) pts.push([b[0], ult[1]]); else pts.push([ult[0], b[1]]);
    pts.push(b, b0);
    return limparPontos(pts);
}
/** Pontos de um tubo: ligado às portas (calcula) ou solto (antigo, guarda os pontos). */
function pontosTubo(pl, el) {
    if (el.de && el.para) {
        const de = acharPorta(pl, el.de), para = acharPorta(pl, el.para);
        if (!de || !para) return null;
        return caminhoLigacao(de, para, lista(el.meio));
    }
    return lista(el.pts);
}

// ---------------------------------------------------------------- ligar tubos soltos (desenhos antigos) às portas mais próximas
function conectarTubosSoltos(pl, tolerancia = 40) {
    let n = 0;
    const els = pl.sinotico.elementos.filter(e => e.s !== 'tubo');
    const todas = els.flatMap(el => portasDoElemento(el).map(p => Object.assign(portaGlobal(el, p), { el: el.id })));
    for (const t of pl.sinotico.elementos.filter(e => e.s === 'tubo' && !e.de && lista(e.pts).length >= 2)) {
        const p0 = t.pts[0], p1 = t.pts[t.pts.length - 1];
        const perto = (pt, io, tipo) => todas.filter(q => q.io === io && (!tipo || q.tipo === tipo)).map(q => [Math.hypot(q.x - pt[0], q.y - pt[1]), q]).filter(x => x[0] <= tolerancia).sort((a, b) => a[0] - b[0])[0];
        const s = perto(p0, 's'); if (!s) continue;
        const e = perto(p1, 'e', s[1].tipo); if (!e || e[1].el === s[1].el) continue;
        t.de = { el: s[1].el, p: s[1].id }; t.para = { el: e[1].el, p: e[1].id }; t.tipo = s[1].tipo; t.estilo = TIPOS_PORTA[s[1].tipo].estilo; t.meio = t.pts.slice(1, -1); t.seta = true; delete t.pts;
        n++;
    }
    return n;
}
