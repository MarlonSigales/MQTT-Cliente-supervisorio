/**
 * © 2026 Supervisório MQTT — Inova Agro UFPel EMBRAPII. Código aberto; cópias permitidas desde que citadas.
 *
 * EQUAÇÕES DO USUÁRIO E MATRIZES — sem eval(): a equação vira uma árvore e depois uma função.
 *  Operadores: + - * / ^ %   comparações < <= > >= == !=   lógicos && || ! (ou "e", "ou", "nao")   condição  c ? a : b
 *  Funções: abs sqrt exp ln log10 log sin cos tan asin acos atan atan2 min max pow floor ceil round clamp se(c,a,b)
 *           orvalho(T,UR) [Magnus] · umidade_absoluta(T,UR) [g/m³] · entalpia(T,UR,P) [kJ/kg] · pot_tri(V,I,FP) [kW]
 *           pot_mono(V,I,FP) [kW] · media(a,b,...) · entre(x,a,b)
 *  Constantes: pi, e;  t = tempo em s desde a meia-noite;  hora = 0..23;  dt = passo do cálculo em s.
 *  As variáveis da planta entram pelo nome de variável (ex.: temperatura_silo_1).
 *
 *  Matrizes no formato do MATLAB/Octave: [1 2; 3 4], [1, 2; 3, 4], ou JSON [[1,2],[3,4]].
 *  Atribuições: "A = [1 0.1; 0 1]; B = [0; 0.1]; K = [3 4]" (arquivo .m, .txt ou colado).
 */

'use strict';

const FUNCOES_EXPR = {
    abs: Math.abs, sqrt: Math.sqrt, exp: Math.exp, ln: Math.log, log: Math.log, log10: Math.log10,
    sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2,
    min: Math.min, max: Math.max, pow: Math.pow, floor: Math.floor, ceil: Math.ceil, round: (x, d = 0) => { const k = 10 ** d; return Math.round(x * k) / k; },
    clamp: (x, a, b) => Math.min(Math.max(x, a), b),
    orvalho: pontoDeOrvalho,
    umidade_absoluta: (T, UR) => 216.7 * (UR / 100 * 6.112 * Math.exp(17.62 * T / (243.12 + T))) / (273.15 + T),
    entalpia: (T, UR, P = 101.325) => { const pv = UR / 100 * 0.61078 * Math.exp(17.27 * T / (T + 237.3)); const w = 0.622 * pv / (P - pv); return 1.006 * T + w * (2501 + 1.86 * T); },
    pot_tri: (V, I, FP = 1) => Math.sqrt(3) * V * I * FP / 1000,
    pot_mono: (V, I, FP = 1) => V * I * FP / 1000,
    media: (...a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN,
    entre: (x, a, b) => (x >= a && x <= b ? 1 : 0),
    // úteis para testes e simulação: dependem do relógio
    onda: (periodoS = 60) => Math.sin(2 * Math.PI * (Date.now() / 1000) / periodoS),
    pulso: (periodoS = 60, fracao = 0.5) => (((Date.now() / 1000) % periodoS) < fracao * periodoS ? 1 : 0)
};
const AJUDA_FUNCOES = [
    ['orvalho(T, UR)', 'ponto de orvalho em °C (Magnus: b = 17,62; c = 243,12 °C)'],
    ['pot_tri(V, I, FP)', 'potência trifásica em kW = √3·V·I·FP/1000 (V de linha)'],
    ['pot_mono(V, I, FP)', 'potência monofásica em kW = V·I·FP/1000'],
    ['umidade_absoluta(T, UR)', 'umidade absoluta do ar em g/m³'],
    ['entalpia(T, UR)', 'entalpia do ar úmido em kJ/kg de ar seco'],
    ['se(cond, a, b)', 'a quando a condição é verdadeira, senão b (também: cond ? a : b)'],
    ['media(a, b, …)', 'média dos valores'],
    ['clamp(x, mín, máx)', 'limita x entre mín e máx'],
    ['abs sqrt exp ln log10 sin cos min max pow round', 'funções matemáticas usuais']
];

/** Ponto de orvalho (fórmula de Magnus, Alduchov e Eskridge, 1996): válida de −45 °C a 60 °C. */
function pontoDeOrvalho(T, UR) {
    if (!(UR > 0)) return NaN;
    const b = 17.62, c = 243.12;
    const g = Math.log(Math.min(UR, 100) / 100) + b * T / (c + T);
    return c * g / (b - g);
}

// ---------------------------------------------------------------- analisador léxico
function tokens(s) {
    const out = []; let i = 0;
    const ops = ['<=', '>=', '==', '!=', '&&', '||', '+', '-', '*', '/', '^', '%', '(', ')', ',', '<', '>', '!', '?', ':'];
    while (i < s.length) {
        const c = s[i];
        if (/\s/.test(c)) { i++; continue; }
        if (/[0-9.]/.test(c)) {
            const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(s.slice(i));
            if (!m) throw erroExpr('número inválido', i);
            out.push({ t: 'num', v: parseFloat(m[0]), i }); i += m[0].length; continue;
        }
        if (/[A-Za-z_À-ÿ]/.test(c)) {
            const m = /^[A-Za-z_À-ÿ][A-Za-z0-9_À-ÿ.]*/.exec(s.slice(i));
            let nome = m[0];
            const baixo = nome.toLowerCase();
            const ant = out[out.length - 1];
            const depoisDeValor = ant && (ant.t === 'num' || ant.t === 'id' || (ant.t === 'op' && ant.v === ')'));
            if (baixo === 'e' && depoisDeValor) {
                out.push({ t: 'op', v: '&&', i }); i += 1; continue;          // "a e b"
            }
            if (baixo === 'ou') { out.push({ t: 'op', v: '||', i }); i += 2; continue; }
            if (baixo === 'nao' || baixo === 'não') { out.push({ t: 'op', v: '!', i }); i += nome.length; continue; }
            out.push({ t: 'id', v: nome, i }); i += nome.length; continue;
        }
        const op = ops.find(o => s.startsWith(o, i));
        if (!op) throw erroExpr(`símbolo "${c}" não reconhecido`, i);
        out.push({ t: 'op', v: op, i }); i += op.length;
    }
    return out;
}
function erroExpr(msg, pos) { const e = new Error(msg + (pos != null ? ` (posição ${pos + 1})` : '')); e.pos = pos; return e; }

// ---------------------------------------------------------------- analisador sintático (descida recursiva)
function analisar(texto) {
    const tk = tokens(String(texto || ''));
    if (!tk.length) throw erroExpr('equação vazia');
    let k = 0;
    const ver = () => tk[k], prox = () => tk[k++];
    const eh = v => tk[k] && tk[k].t === 'op' && tk[k].v === v;
    const exigir = v => { if (!eh(v)) throw erroExpr(`esperava "${v}"`, tk[k] ? tk[k].i : texto.length); k++; };

    function condicional() {
        const c = ou();
        if (eh('?')) { k++; const a = condicional(); exigir(':'); const b = condicional(); return { f: 'se', a: [c, a, b] }; }
        return c;
    }
    function ou() { let a = e(); while (eh('||')) { k++; a = { op: '||', a, b: e() }; } return a; }
    function e() { let a = comp(); while (eh('&&')) { k++; a = { op: '&&', a, b: comp() }; } return a; }
    function comp() {
        let a = soma();
        while (ver() && ver().t === 'op' && ['<', '<=', '>', '>=', '==', '!='].includes(ver().v)) { const op = prox().v; a = { op, a, b: soma() }; }
        return a;
    }
    function soma() { let a = prod(); while (eh('+') || eh('-')) { const op = prox().v; a = { op, a, b: prod() }; } return a; }
    function prod() { let a = unario(); while (eh('*') || eh('/') || eh('%')) { const op = prox().v; a = { op, a, b: unario() }; } return a; }
    function unario() {
        if (eh('-')) { k++; return { op: 'neg', a: unario() }; }
        if (eh('+')) { k++; return unario(); }
        if (eh('!')) { k++; return { op: '!', a: unario() }; }
        return potencia();
    }
    function potencia() {
        const base = primario();
        if (eh('^')) { k++; return { op: '^', a: base, b: unario() }; }   // associativa à direita
        return base;
    }
    function primario() {
        const t = prox();
        if (!t) throw erroExpr('equação terminou antes da hora', texto.length);
        if (t.t === 'num') return { n: t.v };
        if (t.t === 'op' && t.v === '(') { const x = condicional(); exigir(')'); return x; }
        if (t.t === 'id') {
            if (eh('(')) {
                k++;
                const nome = t.v.toLowerCase();
                const args = [];
                if (!eh(')')) { do { args.push(condicional()); } while (eh(',') && ++k); }
                exigir(')');
                if (nome === 'se' || nome === 'if') { if (args.length !== 3) throw erroExpr('se(condição, valor_se_sim, valor_se_não) precisa de 3 valores', t.i); return { f: 'se', a: args }; }
                if (!FUNCOES_EXPR[nome]) throw erroExpr(`função "${t.v}" não existe`, t.i);
                return { f: nome, a: args };
            }
            return { v: t.v, i: t.i };
        }
        throw erroExpr(`"${t.v}" fora de lugar`, t.i);
    }
    const arv = condicional();
    if (k < tk.length) throw erroExpr(`"${tk[k].v}" fora de lugar`, tk[k].i);
    return arv;
}

const CONST_EXPR = { pi: Math.PI, e: Math.E, verdadeiro: 1, falso: 0, true: 1, false: 0 };

/**
 * Compila a equação. Devolve { f(ambiente) → número, vars: [nomes usados] }.
 * ambiente(nome) devolve o valor da variável (ou undefined se não existir).
 */
function compilar(texto) {
    const arv = analisar(texto);
    const vars = new Set();
    function gerar(n) {
        if ('n' in n) { const v = n.n; return () => v; }
        if ('v' in n) {
            const nome = n.v, baixo = nome.toLowerCase();
            if (baixo in CONST_EXPR) { const c = CONST_EXPR[baixo]; return () => c; }
            vars.add(nome);
            return amb => { const x = amb(nome); return x == null ? NaN : +x; };
        }
        if (n.f) {
            const args = n.a.map(gerar);
            if (n.f === 'se') { const [c, a, b] = args; return amb => (c(amb) ? a(amb) : b(amb)); }
            const fn = FUNCOES_EXPR[n.f];
            return amb => fn(...args.map(g => g(amb)));
        }
        const a = gerar(n.a), b = n.b ? gerar(n.b) : null;
        switch (n.op) {
            case '+': return amb => a(amb) + b(amb);
            case '-': return amb => a(amb) - b(amb);
            case '*': return amb => a(amb) * b(amb);
            case '/': return amb => a(amb) / b(amb);
            case '%': return amb => a(amb) % b(amb);
            case '^': return amb => Math.pow(a(amb), b(amb));
            case 'neg': return amb => -a(amb);
            case '!': return amb => (a(amb) ? 0 : 1);
            case '<': return amb => (a(amb) < b(amb) ? 1 : 0);
            case '<=': return amb => (a(amb) <= b(amb) ? 1 : 0);
            case '>': return amb => (a(amb) > b(amb) ? 1 : 0);
            case '>=': return amb => (a(amb) >= b(amb) ? 1 : 0);
            case '==': return amb => (Math.abs(a(amb) - b(amb)) < 1e-9 ? 1 : 0);
            case '!=': return amb => (Math.abs(a(amb) - b(amb)) >= 1e-9 ? 1 : 0);
            case '&&': return amb => (a(amb) && b(amb) ? 1 : 0);
            case '||': return amb => (a(amb) || b(amb) ? 1 : 0);
        }
        throw erroExpr('operação desconhecida');
    }
    const f = gerar(arv);
    return { f, vars: [...vars] };
}

/** Confere a equação contra as variáveis conhecidas. Devolve null se estiver ok ou a mensagem de erro. */
function conferirExpr(texto, conhecidas) {
    try {
        const c = compilar(texto);
        const falta = c.vars.filter(v => !conhecidas.has(v) && !['t', 'dt', 'hora', 'dia'].includes(v));
        return falta.length ? `variável não encontrada: ${falta.join(', ')}` : null;
    } catch (e) { return e.message; }
}

/** Avalia uma vez (para os testes e a prévia na tela). */
function avaliarExpr(texto, valores = {}) {
    const c = compilar(texto);
    return c.f(n => valores[n]);
}

// ---------------------------------------------------------------- matrizes
/** Lê matriz: "[1 2; 3 4]", "1 2\n3 4", "[[1,2],[3,4]]", "5". Devolve array de linhas. */
function lerMatriz(s) {
    if (Array.isArray(s)) return normalizarMatriz(s);
    if (typeof s === 'number') return [[s]];
    let t = String(s == null ? '' : s).trim();
    if (!t) return null;
    if (/^\[\s*\[/.test(t)) { try { return normalizarMatriz(JSON.parse(t)); } catch (e) { /* tenta o formato do MATLAB */ } }
    t = t.replace(/^\[|\]$/g, '').replace(/\.\.\.\s*\n/g, ' ');
    const linhas = t.split(/;|\n/).map(l => l.trim()).filter(Boolean);
    const m = linhas.map(l => l.split(/[\s,]+/).filter(Boolean).map(x => {
        const v = Number(x.replace(/^\+/, ''));
        if (!Number.isFinite(v)) throw new Error(`"${x}" não é número`);
        return v;
    }));
    return normalizarMatriz(m);
}
function normalizarMatriz(m) {
    if (!Array.isArray(m)) return [[+m]];
    if (!m.length) return null;
    const mm = m.map(l => (Array.isArray(l) ? l.map(Number) : [Number(l)]));
    const n = mm[0].length;
    if (mm.some(l => l.length !== n)) throw new Error('as linhas da matriz têm números de colunas diferentes');
    if (mm.some(l => l.some(v => !Number.isFinite(v)))) throw new Error('a matriz tem valor que não é número');
    return mm;
}
const dims = M => [M.length, M[0].length];
function mMul(A, B) {
    const [n, k] = dims(A), [k2, m] = dims(B);
    if (k !== k2) throw new Error(`dimensões incompatíveis na multiplicação (${n}×${k} · ${k2}×${m})`);
    const C = Array.from({ length: n }, () => new Array(m).fill(0));
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) { let s = 0; for (let q = 0; q < k; q++) s += A[i][q] * B[q][j]; C[i][j] = s; }
    return C;
}
function mSoma(A, B, sinal = 1) {
    const [n, m] = dims(A), [n2, m2] = dims(B);
    if (n !== n2 || m !== m2) throw new Error(`dimensões incompatíveis na soma (${n}×${m} e ${n2}×${m2})`);
    return A.map((l, i) => l.map((v, j) => v + sinal * B[i][j]));
}
const coluna = v => v.map(x => [x]);
const vetor = M => M.map(l => l[0]);
function zeros(n, m = 1) { return Array.from({ length: n }, () => new Array(m).fill(0)); }
function matrizTexto(M) { return M ? '[' + M.map(l => l.map(v => +v.toPrecision(6)).join(' ')).join('; ') + ']' : ''; }

/** "A = [..]; B = [..]" ou JSON {"A": [[..]], "kp": 2} → { A: matriz, kp: número } */
function lerAtribuicoes(texto) {
    const t = String(texto || '').trim();
    const out = {};
    if (!t) return out;
    if (t.startsWith('{')) {
        const o = JSON.parse(t);
        for (const [k, v] of Object.entries(o)) out[k] = (Array.isArray(v) ? normalizarMatriz(Array.isArray(v[0]) ? v : [v]) : Number(v));
        return out;
    }
    const semComent = t.split('\n').map(l => l.replace(/[%#].*$/, '')).join('\n');
    const re = /([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(\[[\s\S]*?\]|[-+0-9.eE]+)/g;
    let m;
    while ((m = re.exec(semComent))) {
        const v = m[2].trim();
        const M = lerMatriz(v);
        out[m[1]] = v.startsWith('[') ? M : M[0][0];
    }
    if (!Object.keys(out).length) throw new Error('não encontrei nenhuma atribuição (ex.: K = [1 2]; kp = 0.5)');
    return out;
}
