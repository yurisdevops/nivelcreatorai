# Nivel Creator AI

Aplicação SaaS independente para creators. Este projeto vive em sua própria pasta e não importa código nem recursos do `landing-pages`.

## O que está implementado

- Painel responsivo com tema azul-marinho e violeta baseado nas referências visuais fornecidas.
- Painel com quatro métricas vindas dos snapshots mais recentes, estado vazio quando ausentes, origem/período/sincronização e próximas ações derivadas de diagnósticos salvos.
- Cadastro, login, confirmação de e-mail e logout via Supabase Auth. O Worker guarda os tokens em cookies `HttpOnly`, `Secure` e `SameSite=Lax`; a página não lê esses tokens.
- Verificação da sessão consultando o endpoint autenticado do Supabase antes de autorizar operações privadas.
- Recuperação de senha sem revelar se um e-mail tem conta; a troca usa a sessão curta emitida pelo fluxo de recuperação do Supabase.
- Provisionamento idempotente de usuário, workspace, membership, perfil e trial de 168 horas depois da confirmação do e-mail.
- Perfil e consentimento versionado para processamento de briefings, métricas autorizadas e contexto pelo Gemini; geração fica bloqueada até o consentimento, que pode ser retirado no perfil.
- Estúdio Criativo com geração de roteiros via Gemini, briefings limitados e tratados como conteúdo não confiável, saída estruturada validada e roteiros salvos no workspace.
- Reserva de quota por ciclo antes da chamada de IA (10 roteiros no trial e 60 por ciclo pago); falhas liberam a reserva e roteiros persistidos consomem a quota.
- Lista de roteiros privada por workspace, com limite de consulta e sem credenciais de IA expostas ao navegador.
- Diagnóstico com quota (2 no trial, 8 no pago), que exige métricas com fonte e período e não inventa score quando os dados não existem.
- Planejamento editorial semanal via Gemini, histórico privado, sugestões revisáveis, envio idempotente da pauta ao calendário e quota de 1 plano no trial e 4 por ciclo pago.
- Calendário privado com fluxo de conteúdo em etapas e campanhas UGC para registrar marcas, entregáveis, prazos e status.
- Agente pessoal com histórico por workspace e quota (30 mensagens no trial, 200 no pago); conteúdo de conversa não autoriza ações externas.
- Notificações internas de encerramento do trial, agendadas por Cron com deduplicação; leitura e pausa por workspace.
- Migrações D1 versionadas para dados centrais, calendário, agente, consentimento de IA, planos editoriais e preferências de notificações.
- Cabeçalhos básicos de segurança, CSP sem scripts inline, validação de origem e limite de corpo nas rotas JSON.

## Desenvolvimento local

1. Instale Node.js e, nesta pasta, rode `npm install`.
2. Crie um projeto Supabase exclusivo para o Nivel Creator AI. Ative confirmação de e-mail e adicione `http://localhost:8787/auth/callback` às URLs de redirecionamento permitidas.
3. Copie `.dev.vars.example` para `.dev.vars` e preencha `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `GEMINI_API_KEY` com credenciais próprias. Nunca coloque credenciais de serviço no navegador nem versionadas no Git.
4. Crie uma base D1 exclusiva: `npx wrangler d1 create nivel-creator`. Substitua `replace-with-your-d1-database-id` em `wrangler.jsonc` pelo `database_id` retornado.
5. Aplique o esquema local: `npm run db:local`.
6. Rode `npm run dev` e abra `http://localhost:8787`.

Para produção, configure a URL de callback do domínio final no Supabase, defina `SUPABASE_URL` e `SUPABASE_ANON_KEY` como secrets do Worker e aplique as migrações remotas conscientemente com `npx wrangler d1 migrations apply nivel-creator --remote`.

O template de confirmação do Supabase deve enviar o link para `/auth/callback` com `token_hash` e `type=email`. O template de recuperação usa o mesmo callback com `type=recovery`. A rota valida o token no provedor e só então cria os cookies da sessão.

## Referência de implementação

Supabase recomenda validar JWTs com `getClaims` ou validar o token no Auth server com `getUser`; este Worker usa a validação do Auth server. Isso mantém a chave de assinatura fora do código do produto e detecta sessões revogadas no provedor.

## Próximas etapas do produto

- OAuth e permissões revisadas para Instagram profissional, armazenamento criptografado de tokens e importação de métricas permitidas; até lá, métricas e diagnósticos exibem estados sem dados.
- Aprovisionar e configurar os recursos reais de Supabase, D1 e Gemini para o ambiente de beta.
- E-mail transacional para notificações continua desativado até configurar um provedor e preferências de envio.
- Arquivos privados via R2 com limites, verificação de conteúdo e URLs curtas.
- Asaas em sandbox: checkout, webhooks autenticados, deduplicação e reconciliação.
- MFA para administradores, exportação/exclusão de dados, rotina de retenção, backups restauráveis, limites de tráfego/custo e observabilidade operacional.
- Revisão jurídica, LGPD, segurança e testes descritos na especificação mestre.

Não existe conexão com a conta Asaas ou Nivel Studio, OAuth do Instagram, publicação automática ou provisionamento de infraestrutura remota por este código. As migrações ainda não foram aplicadas.
