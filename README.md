# Nivel Creator AI

Aplicação SaaS independente para creators. Este projeto vive em sua própria pasta e não importa código nem recursos do `landing-pages`.

## O que está implementado

- Painel responsivo com tema azul-marinho e violeta baseado nas referências visuais fornecidas.
- Onboarding em quatro passos para conexão opcional do Instagram, nicho, objetivo/tom de voz e consentimento separado para uso da IA; é possível concluir o perfil sem conectar a rede social.
- Painel com quatro métricas vindas dos snapshots mais recentes, estado vazio quando ausentes, origem/período/sincronização e próximas ações derivadas de diagnósticos salvos.
- Cadastro, login, confirmação de e-mail e logout via Supabase Auth. O Worker guarda os tokens em cookies `HttpOnly`, `Secure` e `SameSite=Lax`; a página não lê esses tokens.
- MFA TOTP via Supabase Auth: creators podem ativar por opção; memberships com papel `admin` precisam manter ao menos um autenticador e usar sessão AAL2 nas APIs privadas. O Auth do Supabase valida o token antes de o Worker ler o nível de garantia.
- Verificação da sessão consultando o endpoint autenticado do Supabase antes de autorizar operações privadas.
- Recuperação de senha sem revelar se um e-mail tem conta; a troca usa a sessão curta emitida pelo fluxo de recuperação do Supabase.
- Provisionamento idempotente de usuário, workspace, membership, perfil e trial de 168 horas depois da confirmação do e-mail.
- Perfil e consentimento versionado para processamento de briefings, métricas autorizadas e contexto pelo Gemini; geração fica bloqueada até o consentimento, que pode ser retirado no perfil.
- Estúdio Criativo com geração de roteiros via Gemini, briefings limitados e tratados como conteúdo não confiável, saída estruturada validada com checklist de gravação e roteiros salvos no workspace.
- Reserva de quota por ciclo antes da chamada de IA (10 roteiros no trial e 30 por ciclo pago); falhas liberam a reserva e roteiros persistidos consomem a quota.
- Roteador de modelos por tarefa: agente pessoal usa Gemini 3.5 Flash-Lite por padrão; roteiros, diagnósticos e planos usam Gemini 3.8 Flash. Modelos simples e complexos podem ser substituídos por ambiente.
- Orçamento global atômico de IA por dia UTC no D1: cada chamada reserva o custo máximo permitido pela entrada limitada a 64.000 bytes e pelos tokens de saída, usando a tarifa da rota selecionada; ao atingir o limite, novas gerações param até o próximo dia. O custo estimado usa o uso retornado pelo Gemini e fica registrado no workspace.
- Circuit breaker global do Gemini: após cinco falhas consecutivas, suspende novas chamadas por cinco minutos e só libera o tráfego depois de uma chamada de prova bem-sucedida. Chamadas simultâneas não passam pelo estado semiaberto, e uma prova interrompida pode ser recuperada após 45 segundos.
- Limites de borda para tentativas de acesso (30/minuto por rota e IP) e gerações de IA (8/minuto por workspace e rota); eles complementam as quotas do banco e não servem como contabilidade global exata.
- Lista de roteiros privada por workspace, com limite de consulta e sem credenciais de IA expostas ao navegador.
- Diagnóstico com quota (2 no trial, 8 no pago), que exige métricas com fonte e período e não inventa score quando os dados não existem.
- Conexão de conta profissional pelo Instagram Login da Meta, state OAuth de uso único, consentimento de insights separado do consentimento de IA, token AES-GCM vinculado ao workspace e renovação preventiva.
- Captura diária de alcance, visualizações, interações, visitas ao perfil e seguidores pela API oficial; métricas não retornadas para uma conta ou permissão ficam marcadas como indisponíveis.
- Biblioteca privada em R2, com verificação de assinatura e varredura ClamAV em Worker/Container privado antes de gravar o arquivo, limite de 25 MB por upload, quota atômica de 250 MB no trial e 2 GB no plano pago, downloads autenticados e exclusão com trilha de auditoria.
- Planejamento editorial semanal via Gemini, histórico privado, sugestões revisáveis, envio idempotente da pauta ao calendário e quota de 1 plano no trial e 4 por ciclo pago.
- Calendário privado com fluxo de conteúdo em etapas e campanhas UGC para registrar marcas, entregáveis, prazos e status.
- Agente pessoal com histórico por workspace e quota (30 mensagens no trial, 200 no pago); respostas citam métricas disponíveis do próprio workspace com período e origem; conteúdo de conversa não autoriza ações externas.
- Notificações internas de encerramento do trial, agendadas por Cron com deduplicação; leitura e pausa por workspace.
- Configurações de perfil e consentimento, exportação JSON do workspace e solicitação de exclusão com remoção do usuário Auth por tarefa agendada.
- Retenção automática opcional após 30 dias sem acesso vigente, com aviso no app sete dias antes, proteção de assinaturas ativas e tabela operacional para retenções legais; vem desativada até a aprovação e habilitação da política.
- Checkout recorrente de cartão e Pix avulso por ciclo mensal no Asaas sandbox. O Pix não cria renovação; só ativa acesso após webhook autenticado que confirma checkout pago, valor e modalidade. Eventos são deduplicados e processados em fila; uma conciliação diária consulta assinaturas e cobranças para recuperar atualizações perdidas. Cartão mantém cancelamento e tolerância de 3 dias para inadimplência.
- Migrações D1 versionadas para dados centrais, calendário, agente, consentimento de IA, planos editoriais, notificações, direitos de dados, cobrança, retenção e orçamento global de IA.
- Cabeçalhos básicos de segurança, CSP sem scripts inline, validação de origem e limite de corpo nas rotas JSON.

## Desenvolvimento local

1. Instale Node.js 22 ou superior e, nesta pasta, rode `npm install`.
2. O projeto Supabase exclusivo `Nivel Creator AI` já foi criado na organização `gruponivel`, região South America (São Paulo) e plano Free. A URL é `https://lonfsobzzwmzyqjdgrjx.supabase.co`. Antes de aceitar novos usuários, confirme no painel do Auth a confirmação de e-mail, a URL `http://localhost:8787/auth/callback`, os templates de confirmação/recuperação e a verificação TOTP. A sessão local foi validada; `/api/auth/mfa/status` respondeu corretamente e indicou MFA opcional e não ativado para o usuário atual. Creators podem ativar MFA em Configurações → Segurança da conta. Um usuário cujo papel em `memberships` seja `admin` será encaminhado para cadastrar TOTP no próximo login.
3. Copie `.dev.vars.example` para `.dev.vars` e preencha `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `GEMINI_API_KEY` com credenciais próprias. O provedor configurado é o Gemini no Vertex AI do Google Cloud; use uma chave API restrita ao método `aiplatform.googleapis.com / PredictionService.GenerateContent`. Nunca coloque credenciais de serviço no navegador nem versionadas no Git.
4. A base D1 remota exclusiva `nivel-creator` e o bucket R2 privado `nivel-creator-private` já foram provisionados para este projeto; o `database_id` está registrado em `wrangler.jsonc`. As 15 migrações foram aplicadas à D1 remota. Para desenvolvimento local, rode `npm run db:local`.
5. Aplique o esquema local: `npm run db:local` (inclui o controle global diário de IA).
6. Configure e inicie o Worker do scanner em `scanner/` antes do app. O scanner usa Docker e uma instância Cloudflare Container `standard-1` (4 GiB de memória) com a imagem oficial ClamAV; em desenvolvimento, rode `npx wrangler dev --config scanner/wrangler.jsonc` com Docker disponível. A publicação ainda depende de Docker CLI e daemon acessíveis.
7. Gere um segredo aleatório de pelo menos 32 bytes e configure o mesmo valor como `FILE_SCANNER_SECRET` no `.dev.vars` do app e em `scanner/.dev.vars`. Em produção, use `npx wrangler secret put FILE_SCANNER_SECRET` para cada Worker.
8. Rode `npm run dev` e abra `http://localhost:8787`.

Rode `npm test` para executar os testes de sessão/MFA/CSRF, BOLA entre workspaces, validação de assinatura/tamanho/nome e varredura de arquivo, prompt injection no briefing e no perfil do agente, concorrência e liberação de quotas, destinos de rede permitidos, SQL injection no nome do arquivo e os testes de cobrança, entitlement e entrega de notificações disponíveis no projeto.

O workflow de CI também executa `npm audit`, Gitleaks sobre o histórico do Git, CodeQL para JavaScript/TypeScript, migrations D1 locais e dry-runs dos Workers; o CodeQL publica resultados no Security tab do GitHub.

Crie também o bucket privado usado pela Biblioteca com `npx wrangler r2 bucket create nivel-creator-private`. A configuração não publica o bucket; uploads, downloads e exclusões passam pelo Worker autenticado. O app valida a assinatura do conteúdo e encaminha cada upload para o service binding privado do scanner, que consulta o ClamAV antes de permitir qualquer gravação em R2. Se o scanner estiver ausente, indisponível ou retornar uma resposta inválida, o upload falha fechado. O app não envia o conteúdo do arquivo a um fornecedor externo de antivírus.

Faça o primeiro deploy do scanner com `npx wrangler deploy --config scanner/wrangler.jsonc` a partir da raiz do projeto. Configure o segredo no app com `npx wrangler secret put FILE_SCANNER_SECRET` e no scanner com `npx wrangler secret put FILE_SCANNER_SECRET --config scanner/wrangler.jsonc`; depois faça o deploy do app com `npx wrangler deploy`. O scanner não publica `workers.dev` nem rota pública; o app o alcança pelo service binding. O deploy de Containers exige Docker ou mecanismo compatível e pode levar alguns minutos para provisionar. Use `standard-1` ou maior: a base de assinaturas e o `clamd` precisam de memória suficiente. A imagem oficial inicia a atualização diária das assinaturas; aguarde o socket local do `clamd` estar pronto antes de aceitar uploads.

Para produção, configure a URL de callback do domínio final no Supabase, defina `SUPABASE_URL` e `SUPABASE_ANON_KEY` como secrets do Worker e aplique as migrações remotas conscientemente com `npx wrangler d1 migrations apply nivel-creator --remote`.

Para habilitar a geração por Gemini no Vertex AI em produção, configure uma chave API com restrição ao método `aiplatform.googleapis.com / PredictionService.GenerateContent` como secret do Worker: `npx wrangler secret put GEMINI_API_KEY`. `GEMINI_PROVIDER`, `GOOGLE_CLOUD_PROJECT` e `GOOGLE_CLOUD_LOCATION` são variáveis sem segredo definidas em `wrangler.jsonc`; não faça deploy enquanto o secret não estiver definido.

Para habilitar exclusão automática da conta, configure `SUPABASE_SECRET_KEY` como secret do Worker (`npx wrangler secret put SUPABASE_SECRET_KEY`). A chave é usada somente pelo Worker para chamar a operação administrativa de exclusão no Supabase Auth. Em desenvolvimento, a variável pode ser preenchida no `.dev.vars` local, que é ignorado pelo Git.

Para habilitar a conexão com Instagram, crie um app Meta com Instagram Login para contas profissionais e configure no Worker `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `INSTAGRAM_REDIRECT_URI`, `META_GRAPH_API_VERSION` e `INSTAGRAM_TOKEN_ENCRYPTION_KEY`. Cadastre exatamente a callback `/auth/instagram/callback` na configuração de OAuth do app. Gere a chave uma vez com `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`; mantenha-a em Workers Secrets em produção e faça backup seguro, pois perdê-la impede a leitura dos tokens já criptografados. Solicite as permissões `instagram_business_basic` e `instagram_business_manage_insights`; o acesso de creators externos requer modo Live e a análise de permissões da Meta. A sincronização roda pelo Cron depois da conexão.

Para testar cobrança em sandbox, preencha também `ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN`, e configure `/webhooks/asaas` no painel Asaas com o mesmo token. O checkout de cartão cria uma assinatura recorrente após a jornada do pagador; o checkout Pix é avulso e exige novo pagamento em cada ciclo. Em ambos, o app ativa o acesso só depois do webhook autenticado.

O template de confirmação do Supabase deve enviar o link para `/auth/callback` com `token_hash` e `type=email`. O template de recuperação usa o mesmo callback com `type=recovery`. A rota valida o token no provedor e só então cria os cookies da sessão.

## Referência de implementação

Supabase recomenda validar JWTs com `getClaims` ou validar o token no Auth server com `getUser`; este Worker usa a validação do Auth server. Isso mantém a chave de assinatura fora do código do produto e detecta sessões revogadas no provedor.

## Próximas etapas do produto

- Revisar e aprovar o app Meta, validar a conexão e a compatibilidade das métricas na conta sandbox/desenvolvedor; a implementação depende dessas permissões e não publica conteúdo.
- Concluir a configuração do Auth no projeto Supabase provisionado e adicionar as credenciais localmente; configurar a chave restrita de Vertex AI para o ambiente de beta.
- E-mail transacional de lembretes usa o binding Cloudflare Email Service e só envia após opt-in. Configure `EMAIL_FROM_ADDRESS`/`EMAIL_FROM_NAME`, habilite um domínio de envio na conta Cloudflare e aplique a migração `0014_transactional_notification_email.sql`. O Email Sending está em beta e requer Workers Paid.
- Política operacional de retenção dos objetos R2.
- Asaas: conectar e validar conta sandbox e avaliar Pix Automático. O Pix disponível é avulso e precisa ser pago novamente a cada ciclo.
- Aprovação jurídica da política de retenção, backups restauráveis e observabilidade operacional. Os rate limits do Worker são distribuídos por localização Cloudflare e permissivos; não substituem o teto global diário nem servem como contabilidade exata.
- Revisão jurídica, LGPD, segurança e testes descritos na especificação mestre.

O procedimento operacional atual para backup e recuperação de D1/R2 está em [`docs/backup-and-restore.md`](docs/backup-and-restore.md). A D1 e o R2 exclusivos do Nivel Creator AI já existem na Cloudflare e as 15 migrações foram verificadas; o Worker, o scanner e a restauração real ainda não foram validados.

O fluxo de OAuth do Instagram está implementado, mas o app Meta ainda não foi aprovado nem conectado a uma conta real. Não há conexão com a conta Asaas ou Nivel Studio e o produto não publica conteúdo automaticamente. O projeto exclusivo do Supabase foi criado, mas as configurações de Auth e as credenciais do Worker ainda não foram concluídas. A D1 e o bucket R2 exclusivos estão provisionados e as 15 migrações estão aplicadas à D1 local e à D1 remota.

Os namespaces `2026101501`, `2026101502` e `2026101503` dos rate limiters precisam ser exclusivos nesta conta Cloudflare; altere-os se já estiverem em uso por outro Worker. Os limites são contadores rápidos por localização, conforme a API do Cloudflare, e as quotas transacionais no D1 continuam sendo o controle de consumo por ciclo. O terceiro namespace limita tentativas de MFA; o Supabase Auth também aplica seus limites próprios.

Creators podem cadastrar mais de um autenticador TOTP para reduzir o risco de perder acesso. O app ainda não oferece códigos de recuperação. A política obrigatória vale quando o papel `admin` já está atribuído na membership; a atribuição de papéis administrativos deve ser feita por operação confiável no banco e não há tela pública para isso.

`AI_DAILY_BUDGET_USD` define o teto global em dólares por dia UTC. O agente usa `GEMINI_SIMPLE_MODEL` (padrão `gemini-3.5-flash-lite`) e suas tarifas `GEMINI_SIMPLE_INPUT_USD_PER_MILLION` / `GEMINI_SIMPLE_OUTPUT_USD_PER_MILLION`; roteiros, diagnósticos e planos usam `GEMINI_COMPLEX_MODEL` ou o fallback legado `GEMINI_MODEL`, com `GEMINI_INPUT_USD_PER_MILLION` e `GEMINI_OUTPUT_USD_PER_MILLION`. Os padrões são conservadores para o modelo complexo e refletem as tarifas padrão previstas para 2027; os preços de Flash-Lite são a referência consultada em 15/10/2026. Consulte a [tabela oficial de preços do Gemini no Google Cloud](https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing) e atualize modelo e tarifas juntos antes de produção. Ao substituir o modelo simples, configure as duas tarifas simples; sem elas, novas chamadas do agente são bloqueadas para evitar subestimar o custo. O limite é estimado pelo uso de tokens retornado pelo Gemini; confira a fatura do provedor. Reservas de chamadas interrompidas sem metadados mantêm o teto reservado até o fim do dia UTC.

A migração `0010_workspace_retention.sql` adiciona a fila e os bloqueios de retenção. `0011_global_ai_budget.sql` cria o ledger atômico do teto diário e `0012_gemini_circuit_breaker.sql` adiciona o circuit breaker do provedor. `DATA_RETENTION_ENABLED` vem como `false`; só altere para `true` após aprovar a política de privacidade e confirmar a cobertura de retenção legal. A rotina exige D1, Supabase Auth administrativo e o bucket R2 configurados. Retenções legais podem ser registradas por operações em `workspace_retention_holds`; não existe endpoint público para criar ou remover esses bloqueios.

A migração `0014_transactional_notification_email.sql` adiciona entrega idempotente com lease e retry limitado para lembretes transacionais do trial. A opção por e-mail fica desabilitada até que o binding e um remetente válido sejam configurados; ela não envia campanhas nem conteúdo de criação.

Para idempotência, o Asaas mantém o identificador, hash e horário do evento; os payloads operacionais e o conteúdo da fila são apagados 30 dias após o processamento concluído ou falho.
