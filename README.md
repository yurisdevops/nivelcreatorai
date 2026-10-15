# Nivel Creator AI

Aplicação SaaS independente para creators. Este projeto vive em sua própria pasta e não importa código nem recursos do `landing-pages`.

## O que está implementado

- Painel responsivo com tema azul-marinho e violeta baseado nas referências visuais fornecidas.
- Painel com quatro métricas vindas dos snapshots mais recentes, estado vazio quando ausentes, origem/período/sincronização e próximas ações derivadas de diagnósticos salvos.
- Cadastro, login, confirmação de e-mail e logout via Supabase Auth. O Worker guarda os tokens em cookies `HttpOnly`, `Secure` e `SameSite=Lax`; a página não lê esses tokens.
- MFA TOTP opcional via Supabase Auth: cadastro e remoção de autenticadores, desafio no login e exigência de sessão AAL2 em todas as APIs privadas após a ativação. O Auth do Supabase valida o token antes de o Worker ler o nível de garantia.
- Verificação da sessão consultando o endpoint autenticado do Supabase antes de autorizar operações privadas.
- Recuperação de senha sem revelar se um e-mail tem conta; a troca usa a sessão curta emitida pelo fluxo de recuperação do Supabase.
- Provisionamento idempotente de usuário, workspace, membership, perfil e trial de 168 horas depois da confirmação do e-mail.
- Perfil e consentimento versionado para processamento de briefings, métricas autorizadas e contexto pelo Gemini; geração fica bloqueada até o consentimento, que pode ser retirado no perfil.
- Estúdio Criativo com geração de roteiros via Gemini, briefings limitados e tratados como conteúdo não confiável, saída estruturada validada e roteiros salvos no workspace.
- Reserva de quota por ciclo antes da chamada de IA (10 roteiros no trial e 60 por ciclo pago); falhas liberam a reserva e roteiros persistidos consomem a quota.
- Limites de borda para tentativas de acesso (30/minuto por rota e IP) e gerações de IA (8/minuto por workspace e rota); eles complementam as quotas do banco e não servem como contabilidade global exata.
- Lista de roteiros privada por workspace, com limite de consulta e sem credenciais de IA expostas ao navegador.
- Diagnóstico com quota (2 no trial, 8 no pago), que exige métricas com fonte e período e não inventa score quando os dados não existem.
- Conexão de conta profissional pelo Instagram Login da Meta, state OAuth de uso único, consentimento de insights separado do consentimento de IA, token AES-GCM vinculado ao workspace e renovação preventiva.
- Captura diária de alcance, visualizações, interações, visitas ao perfil e seguidores pela API oficial; métricas não retornadas para uma conta ou permissão ficam marcadas como indisponíveis.
- Biblioteca privada em R2, com verificação de assinatura dos arquivos, limite de 25 MB por upload, quota atômica de 250 MB no trial e 2 GB no plano pago, downloads autenticados e exclusão com trilha de auditoria.
- Planejamento editorial semanal via Gemini, histórico privado, sugestões revisáveis, envio idempotente da pauta ao calendário e quota de 1 plano no trial e 4 por ciclo pago.
- Calendário privado com fluxo de conteúdo em etapas e campanhas UGC para registrar marcas, entregáveis, prazos e status.
- Agente pessoal com histórico por workspace e quota (30 mensagens no trial, 200 no pago); conteúdo de conversa não autoriza ações externas.
- Notificações internas de encerramento do trial, agendadas por Cron com deduplicação; leitura e pausa por workspace.
- Configurações de perfil e consentimento, exportação JSON do workspace e solicitação de exclusão com remoção do usuário Auth por tarefa agendada.
- Retenção automática opcional após 30 dias sem acesso vigente, com aviso no app sete dias antes, proteção de assinaturas ativas e tabela operacional para retenções legais; vem desativada até a aprovação e habilitação da política.
- Checkout recorrente de cartão no Asaas sandbox, confirmação via webhook autenticado, deduplicação, processamento assíncrono, cancelamento e tolerância de 3 dias para inadimplência.
- Migrações D1 versionadas para dados centrais, calendário, agente, consentimento de IA, planos editoriais, notificações, direitos de dados e cobrança.
- Cabeçalhos básicos de segurança, CSP sem scripts inline, validação de origem e limite de corpo nas rotas JSON.

## Desenvolvimento local

1. Instale Node.js e, nesta pasta, rode `npm install`.
2. Crie um projeto Supabase exclusivo para o Nivel Creator AI. Ative confirmação de e-mail e adicione `http://localhost:8787/auth/callback` às URLs de redirecionamento permitidas. Em Authentication → MFA, habilite TOTP e permita verificação de fatores; cada creator pode ativar a opção em Configurações → Segurança da conta.
3. Copie `.dev.vars.example` para `.dev.vars` e preencha `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `GEMINI_API_KEY` com credenciais próprias. Nunca coloque credenciais de serviço no navegador nem versionadas no Git.
4. Crie uma base D1 exclusiva: `npx wrangler d1 create nivel-creator`. Substitua `replace-with-your-d1-database-id` em `wrangler.jsonc` pelo `database_id` retornado.
5. Aplique o esquema local: `npm run db:local`.
6. Rode `npm run dev` e abra `http://localhost:8787`.

Crie também o bucket privado usado pela Biblioteca com `npx wrangler r2 bucket create nivel-creator-private`. A configuração não publica o bucket; uploads, downloads e exclusões passam pelo Worker autenticado. Os tipos são validados pela assinatura do conteúdo, não pelo nome ou cabeçalho enviado pelo navegador.

Para produção, configure a URL de callback do domínio final no Supabase, defina `SUPABASE_URL` e `SUPABASE_ANON_KEY` como secrets do Worker e aplique as migrações remotas conscientemente com `npx wrangler d1 migrations apply nivel-creator --remote`.

Para habilitar exclusão automática da conta, configure `SUPABASE_SECRET_KEY` como secret do Worker (`npx wrangler secret put SUPABASE_SECRET_KEY`). A chave é usada somente pelo Worker para chamar a operação administrativa de exclusão no Supabase Auth. Em desenvolvimento, a variável pode ser preenchida no `.dev.vars` local, que é ignorado pelo Git.

Para habilitar a conexão com Instagram, crie um app Meta com Instagram Login para contas profissionais e configure no Worker `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `INSTAGRAM_REDIRECT_URI`, `META_GRAPH_API_VERSION` e `INSTAGRAM_TOKEN_ENCRYPTION_KEY`. Cadastre exatamente a callback `/auth/instagram/callback` na configuração de OAuth do app. Gere a chave uma vez com `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`; mantenha-a em Workers Secrets em produção e faça backup seguro, pois perdê-la impede a leitura dos tokens já criptografados. Solicite as permissões `instagram_business_basic` e `instagram_business_manage_insights`; o acesso de creators externos requer modo Live e a análise de permissões da Meta. A sincronização roda pelo Cron depois da conexão.

Para testar cobrança em sandbox, preencha também `ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN`, e configure `/webhooks/asaas` no painel Asaas com o mesmo token.

O template de confirmação do Supabase deve enviar o link para `/auth/callback` com `token_hash` e `type=email`. O template de recuperação usa o mesmo callback com `type=recovery`. A rota valida o token no provedor e só então cria os cookies da sessão.

## Referência de implementação

Supabase recomenda validar JWTs com `getClaims` ou validar o token no Auth server com `getUser`; este Worker usa a validação do Auth server. Isso mantém a chave de assinatura fora do código do produto e detecta sessões revogadas no provedor.

## Próximas etapas do produto

- Revisar e aprovar o app Meta, validar a conexão e a compatibilidade das métricas na conta sandbox/desenvolvedor; a implementação depende dessas permissões e não publica conteúdo.
- Aprovisionar e configurar os recursos reais de Supabase, D1 e Gemini para o ambiente de beta.
- E-mail transacional para notificações continua desativado até configurar um provedor e preferências de envio.
- Varredura antimalware e política operacional de retenção dos objetos R2.
- Asaas: conectar e validar conta sandbox, reconciliação diária e fluxo de Pix; a implementação atual só oferece recorrência por cartão em sandbox.
- MFA obrigatório para administradores (MFA opcional para creators e enforcement AAL2 de sessões opt-in já estão implementados), aprovação jurídica da política de retenção, backups restauráveis, orçamento diário global de IA/circuit breaker e observabilidade operacional. Os rate limits do Worker são distribuídos por localização Cloudflare e permissivos; não substituem orçamento financeiro nem controle global exato.
- Revisão jurídica, LGPD, segurança e testes descritos na especificação mestre.

Não existe conexão com a conta Asaas ou Nivel Studio, OAuth do Instagram, publicação automática ou provisionamento de infraestrutura remota por este código. As migrações ainda não foram aplicadas.

Os namespaces `2026101501`, `2026101502` e `2026101503` dos rate limiters precisam ser exclusivos nesta conta Cloudflare; altere-os se já estiverem em uso por outro Worker. Os limites são contadores rápidos por localização, conforme a API do Cloudflare, e as quotas transacionais no D1 continuam sendo o controle de consumo por ciclo. O terceiro namespace limita tentativas de MFA; o Supabase Auth também aplica seus limites próprios.

Creators podem cadastrar mais de um autenticador TOTP para reduzir o risco de perder acesso. O app ainda não oferece códigos de recuperação. MFA obrigatório por papel administrativo depende de um fluxo de administração e de uma política de papéis definida.

A migração `0010_workspace_retention.sql` adiciona a fila e os bloqueios de retenção. `DATA_RETENTION_ENABLED` vem como `false`; só altere para `true` após aprovar a política de privacidade e confirmar a cobertura de retenção legal. A rotina exige D1, Supabase Auth administrativo e o bucket R2 configurados. Retenções legais podem ser registradas por operações em `workspace_retention_holds`; não existe endpoint público para criar ou remover esses bloqueios.

Para idempotência, o Asaas mantém o identificador, hash e horário do evento; os payloads operacionais e o conteúdo da fila são apagados 30 dias após o processamento concluído ou falho.
