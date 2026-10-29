# Planta virtual (o "campo" de mentira)

© 2026 Supervisório MQTT — Inova Agro UFPel EMBRAPII. Código aberto; cópias permitidas desde que citadas.

Faz o papel dos CLPs e sensores num broker MQTT de verdade: publica as medidas, segue os comandos (liga/desliga com
retorno de estado, setpoints) e responde ao **status**.

## No navegador
Início → **Exemplo: UBG de arroz completa → Abrir no broker.emqx.io**. O supervisório conecta em
`wss://broker.emqx.io:8084/mqtt` e um segundo cliente (a planta virtual) publica com um prefixo próprio
(ex.: `inovaagro/ubg_arroz/a1b2`). A planta virtual só roda enquanto a página está aberta.

## Sem navegador (24 h, num PC ou Raspberry Pi)
Precisa só do Node.js 22 ou mais novo (nada para instalar):

    node campo/planta-virtual.js --prefixo inovaagro/ubg_arroz/minha
    node campo/planta-virtual.js --url wss://broker.emqx.io:8084/mqtt --prefixo inovaagro/ubg_arroz/minha --periodo 2
    node campo/planta-virtual.js --planta meu-projeto.json        (qualquer planta com planta virtual)

No supervisório, use o mesmo broker e o mesmo prefixo (Configurar → Conexão) com a opção "Rodar a planta virtual
neste navegador" **desligada** (senão são dois campos publicando).

## Status: todos os tópicos
Publique qualquer coisa em `<prefixo>/status/get`. A resposta chega em `<prefixo>/status` (JSON):

    { "planta": "...", "prefixo": "...", "total": 216,
      "topicos": [ { "topico": ".../engenho/descascador/corrente", "sentido": "publica", "nome": "Corrente — Descascador",
                     "unidade": "A", "tipo": "corrente", "faixa": [0, 15], "elemento": "Descascador", "valor": "7.9" },
                   { "topico": ".../engenho/descascador/cmd", "sentido": "assina", "payload": "1 liga / 0 desliga", ... } ] }

`publica` = o campo manda; `assina` = o campo recebe. No supervisório: Configurar → Conexão → **Pedir status**.
`<prefixo>/campo/online` = 1 enquanto a planta virtual está no ar (0 pelo Last Will quando cai).

## Tópicos da UBG de arroz
Sempre `área/elemento/grandeza`, por exemplo:
`recebimento/balanca_rodoviaria/peso`, `secagem/secador/t_ar`, `secagem/secador/sp_t_ar` (setpoint),
`armazenagem/silo_1/temp_max`, `.../co2`, `.../metano`, `.../fosfina`, `.../o2`, `.../ur_intergranular`,
`engenho/elevador_do_despedregador/rotacao`, `.../escorregamento`, `engenho/descascador/cmd`, `.../sp_pressao_rolos`,
`engenho/balanca_de_fluxo/sp_vazao`, `subprodutos/balanca_de_casca/vazao`, `expedicao/ensacadora/sacos_min`.

**Broker público: qualquer pessoa pode ler e publicar.** Só para demonstração e aula; nunca para comandar equipamento real.
