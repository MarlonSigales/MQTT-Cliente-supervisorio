# Agente de borda 24 h

© 2026 Supervisório MQTT — Inova Agro UFPel EMBRAPII. Código aberto; cópias permitidas desde que citadas.

Roda o supervisório **sem navegador** num PC, mini-PC ou Raspberry Pi ligado 24 h, com o mesmo arquivo de projeto e o
mesmo código: conexão MQTT, variáveis calculadas, controladores e publicações, horímetros e energia, alarmes, termometria
e lotes de secagem. O histórico fica em disco, um ZIP por planta e por dia (o mesmo formato da nuvem), e pode ir para o
MEGA da equipe. Assim o supervisório no navegador pode ficar fechado; ao abrir, ele busca os dados passados na nuvem
(ou use "Importar arquivo de dia" com o ZIP do agente).

## Instalar e rodar
1. Node.js 22 ou mais novo. Copie a pasta do projeto (ou só `agente/`, `js/` e `lib/`).
2. No supervisório: **Baixar arquivo** (o `configuracao.json` de dentro do .zip, ou o .json).
3. Rode:

        node agente/agente.js --projeto configuracao.json --dados ./dados-agente --senha-broker SENHA

4. Nuvem da equipe (opcional): `npm install megajs` na pasta e acrescente
   `--mega-email equipe@exemplo.org --mega-senha ...`. Com `--gemeo`, o agente também é o **original** do gêmeo pela nuvem.

Para iniciar com o computador (Linux), um serviço do systemd:

    [Unit]
    Description=Supervisorio MQTT - agente
    After=network-online.target
    [Service]
    WorkingDirectory=/home/pi/supervisorio
    ExecStart=/usr/bin/node agente/agente.js --projeto configuracao.json --dados /home/pi/dados-agente
    Restart=always
    [Install]
    WantedBy=multi-user.target

## Cuidados
- **Um só cérebro por planta:** se o agente roda os controladores e as publicações, deixe o supervisório do navegador só
  olhando (ou desligue os controladores lá). Dois supervisórios publicando nos mesmos tópicos brigam.
- A senha do broker nunca está no arquivo do projeto: passe com `--senha-broker` (ou deixe o broker sem senha só na rede local).
- Horímetros, acumuladores e o estado do gêmeo ficam em `dados-agente/armazenamento.json` e sobrevivem a reinícios.
- Testado com Node 22, broker local e a planta virtual da UBG; o envio ao MEGA foi testado com um MEGA simulado.
