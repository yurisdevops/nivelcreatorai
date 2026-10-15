# Nivel Creator AI

Aplicação SaaS independente para creators. Este projeto vive em sua própria pasta e não importa código nem recursos do `landing-pages`.

## O que está implementado

- Painel responsivo com tema azul-marinho e violeta baseado nas referências visuais fornecidas.
- Painel com quatro métricas vindas dos snapshots mais recentes, estado vazio quando ausentes, origem/período/sincronização e próximas ações derivadas de diagnósticos salvos.
- Cadastro, login, confirmação de e-mail e logout via Supabase Auth. O Worker guarda os tokens em cookies `HttpOnly`, `Secure` e `SameSite=Lax`; a página não lê esses tokens.
- MFA TOTP via Supabase Auth: creators podem ativar por opção; memberships com papel `admin` precisam manter ao menos um autenticador e usar sessão AAL2 nas APIs privadas. O Auth do Supabase valida o token antes de o Worker ler o nível de garantia.
- Verificação da sessão consultando o endpoint autenticado do Supabase antes de autorizar operações privadas.
- Recuperação de senha sem revelar se um e-mail tem conta; a troca usa a sessão curta emitida pelo fluxo de recuperação do Supabase.
- Provisionamento idempotente de usuário, workspace, membership, perfil e trial de 168 horas depois da confirmação do e-mail.
- Perfil e consentimento versionado para processamento de briefings, métricas autorizadas e contexto pelo Gemini; geração fica bloqueada até o consentimento, que pode ser retirado no perfil.
- Estúdio Criativo com geração de roteiros via Gemini, briefings limitados e tratados como conteúdo não confiável, saída estruturada validada e roteiros salvos no workspace.
- Reserva de quota por ciclo antes da chamada de IA (10 roteiros no trial e 60 por ciclo pago); falhas liberam a reserva e roteiros persistidos consomem a quota.
- Orçamento global atômico de IA por dia UTC no D1: cada chamada reserva o custo máximo permitido pela entrada limitada a 64.000 bytes e pelos tokens de saída; ao atingir o limite, novas gerações param até o próximo dia. O custo estimado usa o uso retornado pelo Gemini e fica registrado no workspace.
- Circuit breaker global do Gemini: após cinco falhas consecutivas, suspende novas chamadas por cinco minutos e só libera o tráfego depois de uma chamada de prova bem-sucedida. Chamadas simultâneas não passam pelo estado semiaberto, e uma prova interrompida pode ser recuperada após 45 segundos.
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
- Checkout recorrente de cartão e Pix avulso por ciclo mensal no Asaas sandbox. O Pix não cria renovação; só ativa acesso após webhook autenticado que confirma checkout pago, valor e modalidade. Eventos são deduplicados e processados em fila; uma conciliação diária consulta assinaturas e cobranças para recuperar atualizações perdidas. Cartão mantém cancelamento e tolerância de 3 dias para inadimplência.
- Migrações D1 versionadas para dados centrais, calendário, agente, consentimento de IA, planos editoriais, notificações, direitos de dados, cobrança, retenção e orçamento global de IA.
- Cabeçalhos básicos de segurança, CSP sem scripts inline, validação de origem e limite de corpo nas rotas JSON.

## Desenvolvimento local

1. Instale Node.js e, nesta pasta, rode `npm install`.
2. Crie um projeto Supabase exclusivo para o Nivel Creator AI. Ative confirmação de e-mail e adicione `http://localhost:8787/auth/callback` às URLs de redirecionamento permitidas. Em Authentication → MFA, habilite TOTP e permita verificação de fatores; creators podem ativar em Configurações → Segurança da conta. Um usuário cujo papel em `memberships` seja `admin` será encaminhado para cadastrar TOTP no próximo login.
3. Copie `.dev.vars.example` para `.dev.vars` e preencha `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `GEMINI_API_KEY` com credenciais próprias. Nunca coloque credenciais de serviço no navegador nem versionadas no Git.
4. Crie uma base D1 exclusiva: `npx wrangler d1 create nivel-creator`. Substitua `replace-with-your-d1-database-id` em `wrangler.jsonc` pelo `database_id` retornado.
5. Aplique o esquema local: `npm run db:local` (inclui o controle global diário de IA).
6. Rode `npm run dev` e abra `http://localhost:8787`.

Rode `npm test` para executar os testes BOLA entre workspaces, validação de assinatura/tamanho/nome de arquivo e os testes de cobrança, entitlement e entrega de notificações disponíveis no projeto.

Crie também o bucket privado usado pela Biblioteca com `npx wrangler r2 bucket create nivel-creator-private`. A configuração não publica o bucket; uploads, downloads e exclusões passam pelo Worker autenticado. Os tipos são validados pela assinatura do conteúdo, não pelo nome ou cabeçalho enviado pelo navegador.

Para produção, configure a URL de callback do domínio final no Supabase, defina `SUPABASE_URL` e `SUPABASE_ANON_KEY` como secrets do Worker e aplique as migrações remotas conscientemente com `npx wrangler d1 migrations apply nivel-creator --remote`.

Para habilitar exclusão automática da conta, configure `SUPABASE_SECRET_KEY` como secret do Worker (`npx wrangler secret put SUPABASE_SECRET_KEY`). A chave é usada somente pelo Worker para chamar a operação administrativa de exclusão no Supabase Auth. Em desenvolvimento, a variável pode ser preenchida no `.dev.vars` local, que é ignorado pelo Git.

Para habilitar a conexão com Instagram, crie um app Meta com Instagram Login para contas profissionais e configure no Worker `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `INSTAGRAM_REDIRECT_URI`, `META_GRAPH_API_VERSION` e `INSTAGRAM_TOKEN_ENCRYPTION_KEY`. Cadastre exatamente a callback `/auth/instagram/callback` na configuração de OAuth do app. Gere a chave uma vez com `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`; mantenha-a em Workers Secrets em produção e faça backup seguro, pois perdê-la impede a leitura dos tokens já criptografados. Solicite as permissões `instagram_business_basic` e `instagram_business_manage_insights`; o acesso de creators externos requer modo Live e a análise de permissões da Meta. A sincronização roda pelo Cron depois da conexão.

Para testar cobrança em sandbox, preencha também `ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN`, e configure `/webhooks/asaas` no painel Asaas com o mesmo token. O checkout de cartão cria uma assinatura recorrente após a jornada do pagador; o checkout Pix é avulso e exige novo pagamento em cada ciclo. Em ambos, o app ativa o acesso só depois do webhook autenticado.

O template de confirmação do Supabase deve enviar o link para `/auth/callback` com `token_hash` e `type=email`. O template de recuperação usa o mesmo callback com `type=recovery`. A rota valida o token no provedor e só então cria os cookies da sessão.

## Referência de implementação

Supabase recomenda validar JWTs com `getClaims` ou validar o token no Auth server com `getUser`; este Worker usa a validação do Auth server. Isso mantém a chave de assinatura fora do código do produto e detecta sessões revogadas no provedor.

## Próximas etapas do produto

- Revisar e aprovar o app Meta, validar a conexão e a compatibilidade das métricas na conta sandbox/desenvolvedor; a implementação depende dessas permissões e não publica conteúdo.
- Aprovisionar e configurar os recursos reais de Supabase, D1 e Gemini para o ambiente de beta.
- E-mail transacional de lembretes usa o binding Cloudflare Email Service e só envia após opt-in. Configure `EMAIL_FROM_ADDRESS`/`EMAIL_FROM_NAME`, habilite um domínio de envio na conta Cloudflare e aplique a migração `0014_transactional_notification_email.sql`. O Email Sending está em beta e requer Workers Paid.
- Varredura antimalware e política operacional de retenção dos objetos R2.
- Asaas: conectar e validar conta sandbox e avaliar Pix Automático. O Pix disponível é avulso e precisa ser pago novamente a cada ciclo.
- Aprovação jurídica da política de retenção, backups restauráveis e observabilidade operacional. Os rate limits do Worker são distribuídos por localização Cloudflare e permissivos; não substituem o teto global diário nem servem como contabilidade exata.
- Revisão jurídica, LGPD, segurança e testes descritos na especificação mestre.

O procedimento operacional atual para backup e recuperação de D1/R2 está em [`docs/backup-and-restore.md`](docs/backup-and-restore.md). A documentação não significa que a infraestrutura remota já foi configurada nem que uma restauração real foi validada.

Não existe conexão com a conta Asaas ou Nivel Studio, OAuth do Instagram, publicação automática ou provisionamento de infraestrutura remota por este código. As migrações ainda não foram aplicadas.

Os namespaces `2026101501`, `2026101502` e `2026101503` dos rate limiters precisam ser exclusivos nesta conta Cloudflare; altere-os se já estiverem em uso por outro Worker. Os limites são contadores rápidos por localização, conforme a API do Cloudflare, e as quotas transacionais no D1 continuam sendo o controle de consumo por ciclo. O terceiro namespace limita tentativas de MFA; o Supabase Auth também aplica seus limites próprios.

Creators podem cadastrar mais de um autenticador TOTP para reduzir o risco de perder acesso. O app ainda não oferece códigos de recuperação. A política obrigatória vale quando o papel `admin` já está atribuído na membership; a atribuição de papéis administrativos deve ser feita por operação confiável no banco e não há tela pública para isso.

`AI_DAILY_BUDGET_USD` define o teto global em dólares por dia UTC. `GEMINI_INPUT_USD_PER_MILLION` e `GEMINI_OUTPUT_USD_PER_MILLION` devem refletir o maior preço aplicável ao modelo e nível de serviço configurados; os padrões usam os preços de texto padrão do Gemini 3.8 Flash previstos para 2027, acima dos valores promocionais vigentes até 31/12/2026. Atualize os preços quando o provedor mudar sua tabela. O limite é estimado pelo uso de tokens retornado pelo Gemini; confira a fatura do provedor antes de produção. Reservas de chamadas interrompidas sem metadados mantêm o teto reservado até o fim do dia UTC.

A migração `0010_workspace_retention.sql` adiciona a fila e os bloqueios de retenção. `0011_global_ai_budget.sql` cria o ledger atômico do teto diário e `0012_gemini_circuit_breaker.sql` adiciona o circuit breaker do provedor. `DATA_RETENTION_ENABLED` vem como `false`; só altere para `true` após aprovar a política de privacidade e confirmar a cobertura de retenção legal. A rotina exige D1, Supabase Auth administrativo e o bucket R2 configurados. Retenções legais podem ser registradas por operações em `workspace_retention_holds`; não existe endpoint público para criar ou remover esses bloqueios.

A migração `0014_transactional_notification_email.sql` adiciona entrega idempotente com lease e retry limitado para lembretes transacionais do trial. A opção por e-mail fica desabilitada até que o binding e um remetente válido sejam configurados; ela não envia campanhas nem conteúdo de criação.

Para idempotência, o Asaas mantém o identificador, hash e horário do evento; os payloads operacionais e o conteúdo da fila são apagados 30 dias após o processamento concluído ou falho.
