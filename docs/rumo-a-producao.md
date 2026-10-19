# Rumo à produção: o que falta para abrir o Nível Creator a qualquer criador

Atualizado em 19/10/2026.

Legenda: **[você]** só você pode fazer · **[eu]** eu faço · **[nós]** você faz e eu preparo/guio.

## Onde estamos

No ar e funcionando: lista de espera, beta fechado por aprovação, login com e-mails da marca (Resend), IA (Gemini) com limites e teto de gasto, campanhas, estúdio com roteiros e teleprompter, planejamento, media kit público, instalação como app, notificações no celular, guias de cada página, Termos e Privacidade, conexão com o Instagram e coleta diária de métricas.

**A resposta curta para a sua pergunta:** hoje, um criador qualquer **não consegue** conectar o Instagram, mesmo com conta profissional. O app da Meta está em modo de desenvolvimento, então só funcionam as contas cadastradas como **testadoras** (até 50). Para liberar a todos, a Meta exige **Acesso Avançado**, que depende de **verificação de empresa** e **análise do app** ([Meta: visão geral da plataforma](https://developers.facebook.com/documentation/instagram-platform/overview), [Meta: criar app do Instagram](https://developers.facebook.com/documentation/instagram-platform/create-an-instagram-app)).

## O caminho, em 4 fases

### Fase 1: beta com até 50 criadores (dá para começar já)

1. **[você]** Aprovar de 5 a 20 pessoas da lista: `npm run beta:aprovar -- email@exemplo.com`.
2. **[você]** Cadastrar o @ de cada uma como **Testador do Instagram** no painel da Meta (Funções do app → Testadores) e pedir que aceitem no Instagram (Configurações → Apps e sites → Convites de testador).
3. **[eu]** Mensagem/roteiro de boas-vindas para os beta testers, explicando os passos acima e o que testar.
4. **[nós]** Conversar com elas depois de 1 a 2 semanas (eu preparo as perguntas).

Custo: R$ 0.

### Fase 2: base legal e de pagamento (obrigatória para cobrar e para a Meta)

5. **[você] Abrir um CNPJ (MEI ou ME).** Recomendo fortemente: a verificação de empresa da Meta, o Asaas em produção, a emissão de nota fiscal e a credibilidade com marcas ficam muito mais simples com CNPJ. O MEI costuma ser aberto em um dia pelo gov.br; confirme com um contador se a atividade de software/SaaS se enquadra no MEI ou se precisa de ME (Simples Nacional).
6. **[você]** Atualizar a razão social e o CNPJ nos Termos e na Privacidade (me mande e eu troco).
7. **[você]** Criar a conta do **Asaas em produção** com o CNPJ e me avisar. **[eu]** configuro as chaves por comando, o webhook e testo cartão, Pix, cancelamento e inadimplência.
8. **[eu]** Plano Fundador (R$ 19,90 por 12 meses) para quem marcou interesse na lista.
9. **[você]** Revisão dos Termos e da Privacidade por um advogado.

Custo: MEI ~R$ 80/mês de imposto fixo (DAS); contador opcional; Asaas só cobra taxa por venda.

### Fase 3: liberar o Instagram para todo mundo (Meta)

10. **[você]** **Verificação de empresa** no Meta Business (Configurações da empresa → Central de segurança → Verificação), com o CNPJ e um documento. Leva de dias a algumas semanas.
11. **[nós]** **Análise do app** pedindo `instagram_business_basic` e `instagram_business_manage_insights`:
    - **[eu]** escrevo os textos de "como usamos cada permissão" e o roteiro do vídeo de demonstração;
    - **[você]** grava a tela (2 a 3 minutos) seguindo o roteiro e envia pelo painel.
12. **[você]** Depois de aprovado, mudar o app para **Publicado/Live** no painel da Meta.

A Meta pode pedir ajustes e reenvio; reserve de 1 a 4 semanas para esta fase.

### Fase 4: infraestrutura de produção e abertura

13. **[você]** Plano pago da Cloudflare Workers (US$ 5/mês): o plano grátis limita o processamento por requisição, o que pode derrubar a criptografia das notificações e a geração de páginas com mais usuários.
14. **[você]** Supabase Pro (US$ 25/mês) quando houver usuários pagantes: o projeto grátis "dorme" após 7 dias sem uso e não tem backup diário.
15. **[eu]** Teste real de backup e restauração do banco, alertas de erro e monitoramento.
16. **[eu]** Métricas por Reel ("o que subiu e o que caiu" vídeo a vídeo), que dependem da permissão aprovada.
17. **[eu]** Ajustes de layout e experiência que você anotou durante os testes.
18. **[eu]** Desligar o beta fechado (`BETA_INVITE_ONLY=false`) e abrir o cadastro com o teste de 7 dias.

## Custos mensais em produção (estimativa)

| Item | Custo |
| --- | --- |
| Cloudflare Workers Paid | US$ 5 (~R$ 28) |
| Supabase Pro (quando houver pagantes) | US$ 25 (~R$ 140) |
| Gemini (IA) | variável; teto de US$ 3/dia configurado; créditos do Google cobrem o começo |
| Resend (e-mails) | R$ 0 até 3 mil e-mails/mês |
| Asaas | só taxa por venda |
| Meta/Instagram | R$ 0 |
| MEI (DAS) | ~R$ 80 |

Com ~20 assinantes a R$ 29,90, a receita já cobre a infraestrutura.

## Ordem que eu sugiro

Fase 1 agora (em paralelo) → abrir o CNPJ → verificação na Meta + Asaas → análise do app → abrir para todos.
