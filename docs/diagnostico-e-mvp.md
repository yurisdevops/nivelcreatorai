# Nível Creator IA: diagnóstico da pasta e proposta de MVP

Data: 18/10/2026. Documento de planejamento, sem mudanças de código.

## 1. Resumo em uma frase

A base técnica que o Codex deixou é grande e bem protegida (login, cobrança, IA com limite de gasto, Instagram, segurança), mas o produto ainda não foi publicado, nunca rodou com um criador real, cobra o preço errado (R$ 59,90) e ainda não tem as partes que mais vendem a ideia: métricas por Reel, roteiro baseado na opinião do criador sobre o produto e media kit.

## 2. O que já está pronto

Pronto aqui quer dizer "o código existe e tem teste", não "foi testado com usuário de verdade".

| Área | O que existe |
| --- | --- |
| Conta | Cadastro, login, confirmação de e-mail, recuperação de senha e verificação em duas etapas (Supabase). |
| Teste grátis | Ao confirmar o e-mail, o criador ganha 7 dias (168 horas) de teste automaticamente. |
| Perfil | Onboarding em 4 passos: nicho, objetivo, tom de voz e autorização para a IA usar os dados. |
| Instagram | Conexão pela API oficial da Meta (Instagram Login), com token guardado criptografado e leitura diária de alcance, interações, visitas ao perfil e seguidores. |
| Painel | Mostra 4 números da conta e o histórico das medições de 7, 30 e 90 dias. |
| Roteiros | IA (Gemini) gera roteiro com gancho, cenas, fala, CTA, legenda, hashtags e checklist de gravação. |
| Planejamento | IA gera a pauta da semana e manda para o calendário. |
| Calendário | Conteúdos com etapas (ideia, gravação, publicação etc.). |
| Campanhas UGC | Cadastro de marca, campanha, entregáveis, prazo, observações e status. |
| Diagnóstico IA | Análise da conta com base nas métricas salvas, sem inventar números. |
| Agente pessoal | Chat com a IA que conhece o perfil e as métricas do criador. |
| Controle de custo da IA | Limite por usuário (ex.: 10 roteiros no teste, 60 no pago) e teto de gasto diário global (US$ 10 por dia). |
| Cobrança | Assinatura no Asaas (cartão recorrente ou Pix mensal), só em ambiente de teste (sandbox). |
| Biblioteca | Upload de arquivos com antivírus (ClamAV) antes de salvar. |
| LGPD | Exportar dados, pedir exclusão da conta e retenção automática (desligada). |
| Qualidade | 62 testes automáticos e verificação de segurança no GitHub a cada envio. |

## 3. O que está pela metade

- **Nada foi publicado.** O site não está no ar; tudo roda só no seu computador.
- **Alterações locais não salvas no Git.** Há 14 arquivos modificados no seu computador (troca do Gemini para o Vertex AI do Google Cloud, correções no login e uma tela de entrada redesenhada). Com essas mudanças, 2 dos 62 testes falham, porque os testes ainda esperam o jeito antigo de checar a verificação em duas etapas. Antes de seguir, vale terminar e salvar esse trabalho.
- **Preço errado.** O código cobra R$ 59,90 (`src/billing.js`). Precisa virar R$ 29,90.
- **Instagram nunca conectou de verdade.** O app da Meta não foi criado nem aprovado.
- **Gemini nunca gerou um roteiro de verdade.** A chave existe só no seu computador, mas as gerações ainda não foram testadas.
- **Cobrança só em teste.** O Asaas não está ligado a uma conta real.
- **Biblioteca depende de Docker** e de um servidor de antivírus que custa por mês e ainda não roda aqui.
- **Comunidade** aparece no menu, mas não tem nada por trás.

## 4. O que falta para a sua visão

- **Métricas por Reel.** Hoje só existem números da conta inteira. Falta puxar cada Reel (visualizações, alcance, curtidas, salvamentos, compartilhamentos) para mostrar "o que subiu e o que caiu".
- **Comparação de período.** Mostrar "seguidores +3% nesta semana", "alcance −12%" etc.
- **Sugestões de melhoria ligadas aos números.** O diagnóstico existe, mas precisa olhar os Reels que foram bem e mal.
- **Roteiro a partir da opinião do criador sobre o produto.** Hoje o roteiro parte de um briefing livre. Falta um formulário de campanha com: produto, o que você achou, o que gostou, o que não gostou, como usou e o que a marca exige. A IA deve escrever a partir dessas respostas e recusar gerar se elas estiverem vazias (nunca roteiro padrão).
- **Ideias de conteúdo** separadas do roteiro (lista de ideias que viram roteiro com um clique).
- **Campanhas que o criador está mirando.** Falta um status de prospecção e um funil simples: mirando, em contato, negociando, fechada, entregue.
- **Contatos de marcas.** Não existe agenda de contatos (nome, marca, e-mail, Instagram, última conversa).
- **Media kit / portfólio.** Não existe. Precisa de uma página pública com link próprio (ex.: `nivelcreator.ai/@fulana`) com bio, nicho, números atualizados do Instagram, melhores Reels, marcas atendidas e contato.
- **Página de lista de espera e pré-venda.**
- **Preço de R$ 29,90 e textos de venda.**

## 5. Instagram: Windsor x API oficial da Meta

| | Windsor.ai | API oficial do Instagram (Meta) |
| --- | --- | --- |
| Para que foi feito | Agências que puxam dados das próprias contas para relatórios. | Apps que leem dados de contas profissionais dos seus usuários. |
| Custo | Planos de US$ 23/mês (75 contas) até US$ 598/mês (500 contas), no plano mensal. Com 500 criadores, cerca de US$ 1,20 por criador por mês (perto de R$ 6,60, ou 22% dos R$ 29,90). Acima disso, só plano sob consulta. | Gratuito por chamada. O custo é só o seu servidor. |
| Revisão da Meta | Não precisa fazer a sua. | Precisa de verificação da empresa (CNPJ da Nível Studio) e revisão do app para acessar contas que não são suas. |
| Experiência do criador | O criador teria de autorizar uma empresa terceira (Windsor) e a conta precisa estar ligada a uma página do Facebook. Fica estranho e não é a sua marca. | O criador clica em "Conectar Instagram" e autoriza o Nível Creator. |
| Já está no código? | Não. | Sim, já está pronto e testado. |
| Risco | Os termos do Windsor não foram feitos para revender dados dentro de outro produto; precisaria confirmar com eles. | A revisão pode pedir ajustes e reenvio, o que atrasa. |

**Recomendação: usar a API oficial.** O código já existe, não tem custo por usuário e a conexão fica com a sua marca. O Windsor só faria sentido como teste rápido interno com 2 ou 3 contas, não como base do produto.

**Como não ficar travado esperando a Meta:**

1. Enquanto a revisão não sai, a Meta deixa o app funcionar com contas cadastradas como "testadoras" no painel do app. Dá para colocar os primeiros criadores do beta como testadores e usar o Instagram real com eles.
2. Para quem ainda não tiver acesso, oferecer um plano B: o criador envia prints da tela de insights do Instagram e o Gemini lê os números. É mais lento, mas mantém o painel útil.
3. O que a Meta pede na revisão: empresa verificada, site no ar com política de privacidade e página de exclusão de dados, um vídeo mostrando o uso de cada permissão e uma conta de teste. Isso só dá para fazer depois de publicar o site.

## 6. Proposta de escopo da primeira versão (MVP)

A ideia é lançar pequeno, com o que o criador sente valor em 5 minutos, e esconder (não apagar) o resto.

### Entra no MVP

1. **Conta e teste grátis de 7 dias** (já pronto; só validar).
2. **Assinatura de R$ 29,90/mês** no Asaas, cartão recorrente. Pix mensal opcional.
3. **Conexão com o Instagram** pela API oficial, com testadores no começo e o plano B de prints.
4. **Painel de métricas:** seguidores, alcance, interações e visitas, com variação da semana; lista dos últimos Reels com o que subiu e o que caiu; 3 sugestões de melhoria da IA baseadas nesses números.
5. **Planejamento:** semana de conteúdo (já pronto), funil de campanhas (mirando, negociando, fechada, entregue) e contatos de marcas.
6. **Criação:** ideias de conteúdo e roteiro personalizado que exige a opinião do criador sobre o produto da campanha.
7. **Media kit:** página pública com link, números atualizados e botão de contato.
8. **IA:** Gemini no Google Cloud (créditos), com os limites e o teto de gasto que já existem.

### Fica fora do MVP (esconder do menu)

- Biblioteca de arquivos com antivírus (tem custo fixo de servidor e não é essencial agora).
- Comunidade.
- ~~Agente pessoal em formato de chat~~ (voltou para o MVP depois dos prints; veja a seção 6.1).
- Retenção automática de dados (já vem desligada).
- E-mails automáticos (exigem plano pago da Cloudflare e domínio configurado).

### Custo aproximado por criador pagante

Estimativa feita a partir das tarifas configuradas no projeto, sem medir uso real:

- Gemini: um roteiro custa perto de US$ 0,02. Com 30 roteiros, 4 planos, alguns diagnósticos e sugestões, fica entre US$ 1 e US$ 2 por mês (R$ 5 a R$ 11) no pior caso. Sugiro baixar o limite de 60 para 30 roteiros por mês.
- Asaas: taxa por cobrança no cartão, em torno de R$ 2 a R$ 3 em R$ 29,90 (confirmar a tabela da sua conta).
- Instagram pela API oficial: R$ 0.
- Servidor (Cloudflare e Supabase): custo fixo pequeno no começo, dividido entre todos.

Sobra boa margem nos R$ 29,90, desde que os limites de IA sejam mantidos.

### Ordem sugerida das etapas (cada uma termina com commit e push)

1. Salvar o trabalho local pendente, corrigir os 2 testes e trocar o preço para R$ 29,90.
2. Página de lista de espera e pré-venda (para começar a validar já, em paralelo).
3. Publicar o app num domínio, criar o app na Meta, cadastrar testadores e pedir a revisão.
4. Métricas por Reel, variação da semana e sugestões da IA no painel.
5. Campanhas com funil, contatos de marcas e roteiro a partir da opinião do criador.
6. Media kit público.
7. Ligar o Asaas real e abrir o beta pago.

## 6.1 Suas telas comparadas com o que já existe

Recebi 5 telas (Início, Estúdio Criativo, Planejamento, Campanhas UGC e Agente de Marketing). O visual atual do app (azul-marinho e violeta) já segue a mesma linha; o trabalho é principalmente de conteúdo e dados, não de recomeçar o design.

| Tela | Já existe no código | Falta para ficar igual ao print |
| --- | --- | --- |
| **Início** | Cartões de seguidores e alcance, resumo da IA (ponto forte, ponto fraco, oportunidade), próximos passos, conexão do Instagram e nicho. | Seta de "subiu/caiu" contra o período anterior, taxa de engajamento, "melhor formato" (exige dados por Reel), gráfico dos últimos 30 dias e filtro de período. |
| **Estúdio Criativo** | Campo de pedido, geração de roteiro com gancho, desenvolvimento e CTA, botão de copiar. | Gerar 3 ideias em cartões antes do roteiro, "por que a IA sugeriu isso", seletores de nicho/objetivo/formato no topo, ajustar tom e criar legenda. As imagens dos cartões ficam de fora no MVP (custo e direito de imagem); uso ícones ou cores por tipo de ideia. |
| **Planejamento** | Plano semanal pela IA, calendário com etapas (ideia, roteiro, gravado, agendado). | Grade da semana com cartões por dia, objetivo e progresso da semana ("3 de 7 postados"), fila de conteúdo com filtros e **melhores horários** (a API do Instagram informa quando os seguidores estão online; dá para incluir). |
| **Campanhas UGC** | Cadastro de marca, campanha, entregáveis, prazo, observações e status. | Contadores do topo, progresso por entregáveis marcáveis, checklist de gravação por campanha, aba de arquivos (usa a Biblioteca), funil "mirando/negociando" e contatos. A aba **Mensagens** com a marca fica fora do MVP, porque exigiria a marca entrar no app. |
| **Agente de Marketing** | Chat com histórico, que já usa perfil e métricas do criador. | Números de destaque no topo, atalhos ("me dê ideias de Reels", "analise meu último vídeo"), painel lateral de contexto editável e o botão "usar insights do Instagram". "Analise meu último vídeo" depende das métricas por Reel. |

**Ajustes na proposta do MVP por causa dos prints:**

- O **Agente de Marketing volta para o MVP**, porque aparece como tela principal e já está quase pronto. Os limites de mensagens continuam valendo.
- A **Biblioteca entra só como "arquivos da campanha"**, se o custo do antivírus couber. Se não couber, o criador cola um link do Drive no entregável na primeira versão.
- **Comunidade e Ajuda** ficam fora do MVP.
- O cartão **"Plano Pro / Ver planos"** vira o aviso do teste grátis e o botão de assinar os R$ 29,90 (há um plano só).
- **Media kit** não aparece nos prints, mas continua no MVP como página pública. Se você preferir deixar para a versão 2, ele é o item mais fácil de adiar.
- **Métricas por Reel** viram prioridade: elas alimentam "melhor formato", "o que subiu e o que caiu", "analise meu último vídeo" e o engajamento das telas de Início e Agente.

## 7. Como validar com criadores reais antes de construir tudo

1. **Página de lista de espera (1 a 2 dias).** Uma página simples com a promessa ("organize suas campanhas UGC, entenda seus números e receba roteiros com a sua opinião, por R$ 29,90/mês"), 3 telas de exemplo (os seus prints ajudam aqui) e um formulário com nome, Instagram, nicho e "quantas campanhas você fecha por mês".
2. **Pré-venda de fundador.** Na mesma página, oferecer "Plano Fundador": R$ 19,90/mês garantido por 12 meses, pago agora com cobrança só no lançamento, ou o primeiro mês pago adiantado com reembolso garantido se não lançar. Quem paga é o sinal mais forte de que a ideia vale.
3. **Divulgação.** Grupos e comunidades de UGC, seu Instagram e o da Nível Studio, e mensagem direta para 50 criadores do nicho que você mais conhece.
4. **Conversas com 8 a 10 criadores** (20 minutos cada). Perguntas sugeridas: como você organiza campanhas hoje? Onde perde mais tempo? Como escreve roteiros? Já perdeu campanha por falta de media kit? Pagaria R$ 29,90 por isso?
5. **Teste "feito à mão" com 5 criadores.** Antes de automatizar tudo, você mesmo usa o app (ou até o Gemini direto) para gerar roteiros e um media kit para eles por 2 semanas e observa se usam e se pedem mais.
6. **Metas para decidir seguir:** por exemplo, 150 pessoas na lista, 15 pré-vendas pagas e 3 dos 5 criadores do teste dizendo que pagariam. Se ficar bem abaixo, ajustar a promessa ou o público antes de construir mais.

## 8. Próximo passo que depende de você

- ~~Mandar os prints das telas que você imagina.~~ Recebidos (seção 6.1).
- Confirmar se posso começar pela etapa 1 (salvar o trabalho local, corrigir os testes e mudar o preço) e pela página de lista de espera.

## Fontes consultadas

- Preços do Windsor.ai: [mixedmetrics.com](https://mixedmetrics.com/blog/windsor-ai-pricing), [metricnexus.ai](https://metricnexus.ai/blog/windsor-ai-pricing), [windsor.ai/how-to-use-windsor-ai-for-social-media](https://windsor.ai/how-to-use-windsor-ai-for-social-media/). Confirmar no site oficial antes de contratar.
- Revisão da Meta: [Instagram Platform: App Review](https://developers.facebook.com/documentation/instagram-platform/app-review) e [Instagram Platform: visão geral](https://developers.facebook.com/documentation/instagram-platform/overview).
