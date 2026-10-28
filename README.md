# Supervisório MQTT

Cliente MQTT supervisório que roda só no navegador (HTML, CSS e JavaScript puros, sem servidor e sem instalar nada).
Feito para unidades de pós-colheita e armazenagem, laboratórios e pequenas indústrias.

**Usar:** https://marlonsigales.github.io/MQTT-Cliente-supervisorio/ (GitHub Pages) ou abra `index.html` por um servidor local
(`python3 -m http.server`).

## O que faz

- **Várias plantas**, cada uma com a sua conexão (WebSocket MQTT), prefixo de tópicos, áreas e equipamentos.
- **Variáveis com nome próprio editável e ícone por tipo**: umidade, temperatura, CO₂, pressão, ponto de orvalho (equação de Magnus),
  peso, volume, nível, velocidade, aceleração, potência (equação do usuário, ex. `pot_tri(tensao, corrente, fp)`), energia
  (integral da potência), corrente, tensão, fator de potência e equações livres.
- **Passar o mouse** mostra o histórico da última hora; **gráficos** com zoom em X e Y, caixa, pinça no celular, CSV e PNG.
- **Alarmes e avisos** (ISA-18.2): prioridades, atraso, histerese, reconhecimento, supressão, taxa por 10 min.
- **Controle**: chaves, setpoints, publicações por equação e controladores discretos (PID, liga/desliga, C(z), espaço de estados,
  realimentação de estados com observador) com ganhos carregados de arquivo .m/.json, colados ou recebidos por MQTT, e
  sintonia pelo degrau no histórico.
- **Horímetros**: desligado, ligado em vazio e trabalhando; partidas, utilização e energia gasta em vazio.
- **Sinótico**: desenho da planta com símbolos de pós-colheita (moega, secador, fornalha, elevador, redler, silos com aeração…)
  e **modelos prontos** com simulação para testar sem broker.
- **Relatórios** do período (energia e custo, horímetros, variáveis, gráficos, alarmes, comandos) em PDF, HTML e CSV.
- **Logs**, monitor MQTT, publicar à mão e **descobrir tópicos** (cria as variáveis com um clique).
- **Nuvem da equipe (MEGA)**: configuração com versões e os **dados passados**, um arquivo por planta e por dia.

## Conectar no broker

O navegador só fala MQTT por **WebSocket**. EMQX: `ws://servidor:8083/mqtt` e `wss://servidor:8084/mqtt`; Mosquitto: a porta do
`listener ... protocol websockets`. Página em https (GitHub Pages) só conecta em `wss://`.

Para testar sem internet: `node tests/broker-ws.js 8090` e use `ws://localhost:8090/mqtt`.

## Segurança

O controle feito aqui roda enquanto a página está aberta (ciclo de 1 s): use para referências e malhas lentas; o controle
crítico fica no CLP/embarcado. Ative o Last Will para o campo saber quando o supervisório caiu. Broker público só para testes.

## Estrutura

`js/dados.js` modelo · `js/expr.js` equações e matrizes · `js/mqtt.js` cliente MQTT e broker da simulação ·
`js/runtime.js` tempo real · `js/alarmes.js` · `js/controle.js` · `js/historico.js` · `js/nuvem.js` · `js/sinotico.js` ·
`js/modelos.js` · `js/simulador.js` · `js/grafico.js` · telas em `js/app.js`, `js/paginas.js`, `js/configurar.js`,
`js/controle-ui.js`, `js/relatorio.js` · testes em `tests/` · pendências e histórico em `todoQA.txt`.

© 2026 Supervisório MQTT — Inova Agro UFPel EMBRAPII. Desenvolvedor: Marlon Soares Sigales. Código aberto; cópias permitidas
desde que citadas.
