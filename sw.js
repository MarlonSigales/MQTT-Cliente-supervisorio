/**
 * © 2026 Supervisório MQTT — Inova Agro UFPel EMBRAPII. Código aberto; cópias permitidas desde que citadas.
 *
 * SERVICE WORKER (aplicativo instalável, funciona sem internet): guarda os arquivos do supervisório no aparelho.
 * Estratégia: responde do cache na hora e atualiza por trás (stale-while-revalidate); trocar VERSAO limpa o cache velho.
 * Só arquivos deste site: o broker (WebSocket) e o MEGA não passam por aqui. Sem internet, o supervisório abre e
 * conversa com um broker da rede local; gráficos e relatórios usam o histórico guardado no navegador.
 */
'use strict';
const VERSAO = 'sup-20261103b';
const ARQUIVOS = ['css/style.css', 'img/app-192.png', 'img/app-512.png', 'img/icone-instagri-180.png', 'img/icone-instagri.png', 'img/logo-inovaagro.png', 'img/logo-instagri.png', 'img/logo-nimeq.png', 'img/relatorio-fundo-capa.png', 'index.html', 'js/acesso.js', 'js/agro.js', 'js/alarmes.js', 'js/app.js', 'js/configurar.js', 'js/controle-ui.js', 'js/controle.js', 'js/dados.js', 'js/expr.js', 'js/gemeo.js', 'js/grafico.js', 'js/historico.js', 'js/icones.js', 'js/importar.js', 'js/lotes.js', 'js/modelos.js', 'js/mqtt.js', 'js/nuvem.js', 'js/paginas.js', 'js/portas.js', 'js/relatorio.js', 'js/runtime.js', 'js/simbolos.js', 'js/simulador.js', 'js/sinotico.js', 'js/sparkplug.js', 'js/termometria.js', 'js/ubg.js', 'lib/jszip.min.js', 'manifest.webmanifest'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSAO).then(c => c.addAll(ARQUIVOS.map(a => './' + a))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
    const req = e.request, url = new URL(req.url);
    if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/tests/')) return;
    e.respondWith(caches.open(VERSAO).then(async c => {
        const ja = await c.match(req, { ignoreSearch: true });
        const rede = fetch(req).then(r => { if (r && r.ok) c.put(req.url.split('?')[0], r.clone()); return r; }).catch(() => null);
        if (ja) { e.waitUntil(rede); return ja; }
        return (await rede) || (req.mode === 'navigate' ? c.match('./index.html') : Response.error());
    }));
});
