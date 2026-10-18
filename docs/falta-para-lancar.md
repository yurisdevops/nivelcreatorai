# O que falta para lançar o Nível Creator IA

Atualizado em 18/10/2026. Endereço: https://creator.nivelstudio.com.br

Legenda: **[você]** só você consegue fazer (painéis, contas, decisões) · **[eu]** eu faço no código ou no servidor · **[nós]** você faz e eu te guio.

## Já está pronto e no ar

- Site publicado no subdomínio da Nível Studio, com HTTPS.
- Lista de espera em `/lista`, com interesse no Plano Fundador e proteção contra spam.
- Beta fechado: só e-mails aprovados criam conta (`npm run beta:aprovar -- email`).
- Chaves do Supabase e do Gemini guardadas no servidor.
- Rotas privadas: toda a API exige login e cada criador só vê os próprios dados.
- Preço de R$ 29,90 e teto de gasto da IA de US$ 3 por dia.
- 66 testes automáticos passando.

## Fase A: beta fechado de teste (gratuito, 5 a 20 criadores)

O objetivo é colocar criadores reais usando o que já existe e aprender com eles.

### A1. Login funcionando de ponta a ponta

1. **[você]** No Supabase, em Authentication → URL Configuration, preencher Site URL com `https://creator.nivelstudio.com.br` e adicionar `https://creator.nivelstudio.com.br/auth/callback` em Redirect URLs.
2. **[você]** No Supabase, em Authentication → Providers → Email, conferir se "Confirm email" está ligado.
3. **[nós]** Ajustar os modelos de e-mail de confirmação e de recuperação de senha para apontarem para `/auth/callback`. Eu te passo o texto pronto.
4. **[você]** Configurar um SMTP próprio no Supabase (por exemplo, Resend ou Brevo, os dois com plano grátis), com remetente `@nivelstudio.com.br`. O envio padrão do Supabase grátis manda poucos e-mails por hora e costuma cair no spam.
5. **[nós]** Teste completo: aprovar seu e-mail, criar a conta, confirmar o e-mail, entrar, sair e recuperar a senha.

### A2. IA funcionando no servidor

6. **[eu]** Testar no ar a geração de roteiro, plano semanal, diagnóstico e agente com a sua conta.
7. **[você]** No Google Cloud, criar um alerta de orçamento (por exemplo, R$ 50 por mês) e conferir quanto resta dos créditos.
8. **[eu]** Baixar o limite de roteiros de 60 para 30 por mês no plano pago, como combinamos no MVP.

### A3. Telas do MVP (o que as telas que você mandou mostram e ainda não existe)

9. **[eu]** Esconder do menu o que está fora do MVP: Biblioteca, Comunidade e Seus Resultados (este volta quando o Instagram estiver ligado).
10. **[eu]** Campanhas: funil (mirando, negociando, fechada, entregue), entregáveis com marcação, checklist de gravação e contatos das marcas.
11. **[eu]** Estúdio Criativo: gerar 3 ideias em cartões e um roteiro que exige a opinião do criador sobre o produto da campanha.
12. **[eu]** Planejamento: grade da semana, progresso ("3 de 7 postados") e fila de conteúdo com filtros.
13. **[eu]** Início: cartões com a variação contra o período anterior, resumo da IA e próximos passos.
14. **[eu]** Agente de Marketing: atalhos e painel lateral de contexto.
15. **[eu]** Media kit: página pública com link próprio (pode ficar para depois do primeiro grupo de testes).

### A4. Instagram em modo de teste (opcional para o primeiro grupo)

16. **[você]** Criar um app no Meta for Developers com o produto "Instagram API with Instagram Login" e me passar só o ID do app. O segredo do app vai direto para o servidor por um comando que eu te passo.
17. **[você]** Cadastrar o Instagram de cada criador do beta como testador no app. O criador aceita o convite no próprio Instagram.
18. **[eu]** Configurar o endereço de retorno, gerar a chave de criptografia dos tokens e testar com a sua conta.
19. **[eu]** Puxar as métricas de cada Reel (visualizações, alcance, salvamentos, compartilhamentos) e mostrar o que subiu e o que caiu.

### A5. Mínimo legal e de segurança para gente de fora usar

20. **[nós]** Página de Termos de Uso e Política de Privacidade (LGPD). Eu escrevo uma versão inicial e você revisa. O ideal é passar por um advogado antes de cobrar.
21. **[eu]** Página de exclusão de dados (a Meta exige; a função de exclusão já existe no app).
22. **[você]** Ativar a verificação em duas etapas nas suas contas Cloudflare, Supabase, Google Cloud e GitHub.
23. **[eu]** Conferir os cabeçalhos de segurança e os limites de uso no endereço final e revisar os registros de erro na Cloudflare.

### A6. Rodar o beta

24. **[você]** Divulgar o link da lista de espera com etiquetas de origem (`?ref=instagram`, `?ref=grupo-ugc`).
25. **[você]** Escolher de 5 a 20 criadores da lista e aprovar com `npm run beta:aprovar`.
26. **[nós]** Conversar com cada um depois de 1 a 2 semanas. Eu preparo o roteiro de perguntas.

## Fase B: lançamento pago (R$ 29,90)

Só depois de o beta mostrar que as pessoas usam.

27. **[você]** Criar a conta do Asaas em produção, com o CNPJ da Nível Studio, e me avisar. Eu configuro as chaves e o webhook por comando, sem você colar nada no chat.
28. **[nós]** Testar no ambiente de teste do Asaas: assinatura no cartão, Pix, cancelamento e inadimplência.
29. **[eu]** Criar o Plano Fundador (R$ 19,90 por 12 meses) para quem marcou interesse na lista.
30. **[você]** Verificar a empresa no Meta Business (CNPJ) e pedir a revisão do app. Eu preparo o vídeo de demonstração e os textos de uso das permissões.
31. **[eu]** Desligar o beta fechado (`BETA_INVITE_ONLY` = `false`) para abrir o cadastro.
32. **[nós]** Backup do banco de dados testado (restauração de verdade, não só no papel).
33. **[você]** Revisão jurídica final dos Termos e da Política de Privacidade.

## Depois do lançamento (não bloqueia)

- E-mails automáticos de fim do teste grátis (exigem o plano pago da Cloudflare, US$ 5 por mês).
- Biblioteca de arquivos com antivírus (exige servidor próprio, com custo mensal).
- Comunidade, aba de mensagens com as marcas e códigos de recuperação da verificação em duas etapas.
- Retenção automática de dados (já existe e está desligada até a política ser aprovada).

## Custos até o lançamento pago

| Item | Custo |
| --- | --- |
| Cloudflare (site, banco e domínio) | R$ 0 no plano grátis |
| Supabase (login) | R$ 0 até 50 mil usuários por mês |
| SMTP (Resend ou Brevo) | R$ 0 no plano grátis |
| Gemini | Sai dos créditos do Google Cloud, com teto de US$ 3 por dia |
| Meta / Instagram | R$ 0 |
| Asaas | Sem mensalidade, só taxa por cobrança paga |
| Advogado para Termos e Privacidade | Opcional no beta; recomendado antes de cobrar |

## Próximos 3 passos

1. **[você]** Itens 1 e 2 no Supabase. Depois me avise para eu te passar o texto dos modelos de e-mail.
2. **[eu]** Itens 9 a 14: deixar as telas do MVP como nos seus prints.
3. **[você]** Item 16: criar o app na Meta, se quiser o Instagram já no primeiro grupo.
