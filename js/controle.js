/**
 * © 2026 Supervisório MQTT — Inova Agro UFPel EMBRAPII. Código aberto; cópias permitidas desde que citadas.
 *
 * CONTROLADORES DISCRETOS rodados no supervisório (a cada Ts segundos, enquanto a página estiver aberta):
 *  pid    PID paralelo  u = Kp·e + Ki·Σe·Ts + Kd·D; derivada na medida com filtro (N), anti-windup por saturação
 *         condicional e troca manual→automático sem salto (bumpless).
 *  tf     Função de transferência discreta no erro: C(z) = (b0 + b1 z⁻¹ + …)/(1 + a1 z⁻¹ + …)  (num e den em z⁻¹).
 *  ss     Controlador em espaço de estados: xc[k+1] = Ac xc + Bc e;  u = Cc xc + Dc e   (e = r − y, vetores).
 *  obs    Realimentação de estados com observador: x̂[k+1] = A x̂ + B u + L (y − C x̂ − D u);  u = −K x̂ + Nr r.
 *  onoff  Liga/desliga com histerese (ação direta: liga quando y < r − h/2; reversa: liga quando y > r + h/2).
 *
 * Os ganhos são digitados, colados no formato do MATLAB (A = [..]; K = [..]), lidos de arquivo .m/.txt/.json ou
 * recebidos por MQTT em JSON no "tópico de parâmetros". identificarPrimeiraOrdem() estima um modelo de 1ª ordem com
 * tempo morto a partir de um degrau no histórico e sugere o PI/PID (SIMC, Skogestad 2003).
 *
 * Segurança: o supervisório não é tempo real. O controle crítico deve ficar no CLP/embarcado; daqui é razoável mandar
 * referências, parâmetros e malhas lentas (aeração, secagem, temperatura de câmara). Com a página fechada ou sem
 * conexão, o equipamento de campo deve ir para o estado seguro (use o Last Will da planta).
 */

'use strict';

const TIPOS_CONTROLADOR = {
    pid: 'PID discreto',
    onoff: 'Liga/desliga com histerese',
    tf: 'Função de transferência C(z)',
    ss: 'Controlador em espaço de estados',
    obs: 'Realimentação de estados com observador'
};

const lim = (x, a, b) => Math.min(Math.max(x, a), b);

/** Cria o "motor" do controlador a partir da configuração. Lança erro com mensagem clara se faltar algo. */
function criarMotorControle(c) {
    const P = c.params || {}, L = c.limites || {};
    const umin = num(L.min, -Infinity), umax = num(L.max, Infinity), taxa = num(L.taxa, 0);
    const Ts = Math.max(0.05, num(c.Ts, 1));
    const satura = (u, uAnt) => {
        let v = lim(u, umin, umax);
        if (taxa > 0 && uAnt != null) v = lim(v, uAnt - taxa * Ts, uAnt + taxa * Ts);
        return v;
    };
    const m = { Ts, u: null, tipo: c.tipo, estado: {} };

    if (c.tipo === 'pid') {
        const kp = num(P.kp, 0), ki = num(P.ki, 0), kd = num(P.kd, 0), N = Math.max(1, num(P.N, 10));
        const rev = P.acao === 'reversa' ? -1 : 1;
        let I = 0, D = 0, yAnt = null;
        m.passo = (r, y, uAnt) => {
            const e = rev * (r[0] - y[0]);
            const Pp = kp * e;
            // derivada filtrada da medida (não dá "chute" quando a referência muda)
            if (yAnt != null && kd) { const Tf = kd / (kp * N || N); D = (Tf / (Tf + Ts)) * D - rev * (kd / (Tf + Ts)) * (y[0] - yAnt); }
            yAnt = y[0];
            const Inovo = I + ki * Ts * e;
            const uSemLim = Pp + Inovo + D;
            const u = satura(uSemLim, uAnt);
            // anti-windup: só integra se não estiver saturado no sentido do erro
            if (u === uSemLim || (uSemLim > umax && e < 0) || (uSemLim < umin && e > 0)) I = Inovo;
            m.estado = { P: Pp, I, D, e };
            return [u];
        };
        m.inicializar = (uAtual, r, y) => { I = (uAtual || 0) - kp * rev * ((r[0] || 0) - (y[0] || 0)); D = 0; yAnt = y[0]; };
        return m;
    }
    if (c.tipo === 'onoff') {
        const h = Math.abs(num(P.histerese, 1)), dir = P.acao !== 'reversa';
        let ligado = 0;
        m.passo = (r, y) => {
            if (dir) { if (y[0] < r[0] - h / 2) ligado = 1; else if (y[0] > r[0] + h / 2) ligado = 0; }
            else { if (y[0] > r[0] + h / 2) ligado = 1; else if (y[0] < r[0] - h / 2) ligado = 0; }
            return [ligado ? (Number.isFinite(umax) ? umax : 1) : (Number.isFinite(umin) ? umin : 0)];
        };
        m.inicializar = u => { ligado = u > 0 ? 1 : 0; };
        return m;
    }
    if (c.tipo === 'tf') {
        const b = lerMatriz(P.num), a = lerMatriz(P.den);
        if (!b || !a) throw new Error('preencha o numerador e o denominador de C(z)');
        const bb = b.flat(), aa = a.flat();
        if (!aa[0]) throw new Error('o primeiro coeficiente do denominador não pode ser zero');
        const a0 = aa[0], B = bb.map(x => x / a0), A = aa.map(x => x / a0);
        const n = Math.max(B.length, A.length);
        const z = new Array(n).fill(0);     // forma direta II transposta
        m.passo = (r, y, uAnt) => {
            const e = r[0] - y[0];
            const u0 = (B[0] || 0) * e + z[0];
            for (let i = 0; i < n - 1; i++) z[i] = (B[i + 1] || 0) * e + z[i + 1] - (A[i + 1] || 0) * u0;
            const u = satura(u0, uAnt);
            m.estado = { e };
            return [u];
        };
        m.inicializar = () => z.fill(0);
        m.ordem = n - 1;
        return m;
    }
    if (c.tipo === 'ss') {
        const Ac = lerMatriz(P.Ac), Bc = lerMatriz(P.Bc), Cc = lerMatriz(P.Cc);
        const Dc = P.Dc ? lerMatriz(P.Dc) : null;
        if (!Ac || !Bc || !Cc) throw new Error('preencha Ac, Bc e Cc');
        const nx = Ac.length, ne = Bc[0].length, nu = Cc.length;
        if (Ac[0].length !== nx || Bc.length !== nx || Cc[0].length !== nx) throw new Error(`dimensões: Ac ${nx}×${nx}, Bc ${nx}×n.º de erros, Cc n.º de saídas×${nx}`);
        if (Dc && (Dc.length !== nu || Dc[0].length !== ne)) throw new Error(`Dc deve ser ${nu}×${ne}`);
        let x = zeros(nx);
        m.entradas = ne; m.saidas = nu;
        m.passo = (r, y, uAnt) => {
            const e = coluna(r.map((ri, i) => ri - y[i]));
            let u = mMul(Cc, x); if (Dc) u = mSoma(u, mMul(Dc, e));
            x = mSoma(mMul(Ac, x), mMul(Bc, e));
            return vetor(u).map((v, i) => satura(v, uAnt && uAnt[i]));
        };
        m.inicializar = () => { x = zeros(nx); };
        return m;
    }
    if (c.tipo === 'obs') {
        const A = lerMatriz(P.A), B = lerMatriz(P.B), C = lerMatriz(P.C), K = lerMatriz(P.K), Lo = lerMatriz(P.L);
        const D = P.D ? lerMatriz(P.D) : null, Nr = P.Nr ? lerMatriz(P.Nr) : null;
        if (!A || !B || !C || !K || !Lo) throw new Error('preencha A, B, C, K e L (D e Nr são opcionais)');
        const nx = A.length, nu = B[0].length, ny = C.length;
        if (A[0].length !== nx || B.length !== nx || C[0].length !== nx) throw new Error(`dimensões do modelo: A ${nx}×${nx}, B ${nx}×nu, C ny×${nx}`);
        if (K.length !== nu || K[0].length !== nx) throw new Error(`K deve ser ${nu}×${nx} (n.º de entradas × n.º de estados)`);
        if (Lo.length !== nx || Lo[0].length !== ny) throw new Error(`L deve ser ${nx}×${ny} (n.º de estados × n.º de medidas)`);
        let xh = zeros(nx);
        m.entradas = ny; m.saidas = nu; m.nr = Nr ? Nr[0].length : 0;
        m.passo = (r, y, uAnt) => {
            let u = mSoma(Nr ? mMul(Nr, coluna(r.slice(0, Nr[0].length))) : zeros(nu), mMul(K, xh), -1);
            u = coluna(vetor(u).map((v, i) => satura(v, uAnt && uAnt[i])));
            let yh = mMul(C, xh); if (D) yh = mSoma(yh, mMul(D, u));
            const inov = mSoma(coluna(y), yh, -1);
            xh = mSoma(mSoma(mMul(A, xh), mMul(B, u)), mMul(Lo, inov));
            m.estado = { xh: vetor(xh) };
            return vetor(u);
        };
        m.inicializar = () => { xh = zeros(nx); };
        return m;
    }
    throw new Error('tipo de controlador desconhecido');
}

/** Aplica parâmetros recebidos (JSON ou texto no formato do MATLAB) à configuração do controlador. */
function aplicarParametros(c, texto) {
    const at = lerAtribuicoes(texto);
    const mapa = { kp: 'kp', Kp: 'kp', KP: 'kp', ki: 'ki', Ki: 'ki', KI: 'ki', kd: 'kd', Kd: 'kd', KD: 'kd', N: 'N', h: 'histerese', histerese: 'histerese',
        num: 'num', den: 'den', A: 'A', B: 'B', C: 'C', D: 'D', K: 'K', L: 'L', Nr: 'Nr', N_r: 'Nr', Ac: 'Ac', Bc: 'Bc', Cc: 'Cc', Dc: 'Dc', Ts: 'Ts' };
    const usados = [];
    for (const [k, v] of Object.entries(at)) {
        const alvo = mapa[k];
        if (!alvo) continue;
        if (alvo === 'Ts') { c.Ts = Array.isArray(v) ? v[0][0] : v; usados.push('Ts'); continue; }
        if (['kp', 'ki', 'kd', 'N', 'histerese'].includes(alvo)) c.params[alvo] = Array.isArray(v) ? v[0][0] : v;
        else c.params[alvo] = matrizTexto(Array.isArray(v) ? v : [[v]]);
        usados.push(alvo);
    }
    if (!usados.length) throw new Error('nenhum parâmetro reconhecido (use kp, ki, kd, N, num, den, A, B, C, D, K, L, Nr, Ac, Bc, Cc, Dc, Ts)');
    return usados;
}

/**
 * Identificação de 1ª ordem com tempo morto (FOPDT) a partir de um degrau na entrada u.
 * Método dos dois pontos (28,3 % e 63,2 % da resposta; Smith, 1972): τ = 1,5 (t63 − t28), θ = t63 − τ.
 * Sintonia SIMC (Skogestad, 2003) com τc = θ (ou o valor dado):  Kc = τ / (K (τc + θ)),  Ti = min(τ, 4(τc + θ)).
 * u e y: arrays [[t_ms, valor], ...]. Devolve { K, tau, theta, kp, ki, kd, mensagem }.
 */
function identificarPrimeiraOrdem(u, y, tauC = null) {
    if (u.length < 3 || y.length < 5) throw new Error('poucos pontos: escolha um intervalo com o degrau completo');
    // acha o maior degrau em u
    let melhor = null;
    for (let i = 1; i < u.length; i++) { const d = u[i][1] - u[i - 1][1]; if (!melhor || Math.abs(d) > Math.abs(melhor.d)) melhor = { i, d, t: u[i][0] }; }
    if (!melhor || Math.abs(melhor.d) < 1e-9) throw new Error('não encontrei um degrau na entrada (a saída do controlador não mudou)');
    const t0 = melhor.t, du = melhor.d;
    const antes = y.filter(p => p[0] <= t0), depois = y.filter(p => p[0] > t0);
    if (antes.length < 1 || depois.length < 5) throw new Error('faltam pontos antes ou depois do degrau');
    const y0 = antes.slice(-5).reduce((s, p) => s + p[1], 0) / Math.min(5, antes.length);
    const fim = depois.slice(-Math.max(3, Math.floor(depois.length / 10)));
    const yf = fim.reduce((s, p) => s + p[1], 0) / fim.length;
    const dy = yf - y0;
    if (Math.abs(dy) < 1e-9) throw new Error('a variável medida não respondeu ao degrau');
    const tempoEm = frac => {
        const alvo = y0 + frac * dy;
        for (let i = 1; i < depois.length; i++) {
            const a = depois[i - 1], b = depois[i];
            if ((a[1] - alvo) * (b[1] - alvo) <= 0 && a[1] !== b[1]) return a[0] + (alvo - a[1]) / (b[1] - a[1]) * (b[0] - a[0]);
        }
        return null;
    };
    const t28 = tempoEm(0.283), t63 = tempoEm(0.632);
    if (t28 == null || t63 == null) throw new Error('a resposta não chegou a 63 % do valor final no intervalo escolhido: aumente o intervalo');
    const tau = Math.max(1e-3, 1.5 * (t63 - t28) / 1000), theta = Math.max(0, (t63 - t0) / 1000 - tau), K = dy / du;
    const tc = tauC != null ? tauC : Math.max(theta, 0.1 * tau);
    const Kc = tau / (K * (tc + theta)), Ti = Math.min(tau, 4 * (tc + theta));
    // PID SIMC (série → paralelo) só quando o tempo morto é relevante
    let kd = 0;
    if (theta > 0.25 * tau) { const Td = theta / 2; kd = Kc * Td; }
    return {
        K, tau, theta, kp: Math.abs(Kc), ki: Math.abs(Kc / Ti), kd: Math.abs(kd),
        acao: K > 0 ? 'direta' : 'reversa',
        mensagem: `Modelo: G(s) = ${K.toPrecision(3)}·e^(−${theta.toPrecision(3)} s)/(${tau.toPrecision(3)} s + 1). SIMC com τc = ${tc.toPrecision(3)} s.`
    };
}
