# Continuação do Nivel Creator AI

Este arquivo registra o ponto de parada para continuar o trabalho em outro computador. O Nivel Creator AI é um repositório separado; o projeto `landing-pages` não deve ser movido nem alterado para continuar esta implementação.

## Estado verificado na retomada — 15/10/2026

- A interface foi ajustada para uso prioritário em celulares: navegação inferior com atalhos, menu completo, alvos de toque maiores e ajustes para telas estreitas. A prévia local está acessível em `http://127.0.0.1:8789/`; ainda falta conferir em um telefone real.
- `.dev.vars` existe e continua ignorado pelo Git. A URL aponta para o projeto Supabase deste produto e a chave local está no formato publishable. O provedor está configurado para Vertex AI; uma chave API restrita ao método `PredictionService.GenerateContent` foi criada e guardada somente em `.dev.vars`. As chamadas de geração ainda não foram exercitadas.
- O Google Cloud CLI acessa a conta ativa `yuri.souza.ys@gmail.com`; ADC funciona, o projeto `project-38cc0da1-19e8-40bf-9f6` está ativo, tem faturamento vinculado e a API Vertex AI está habilitada. O saldo/crédito restante não foi consultado. O secret ainda não foi configurado no Worker Cloudflare e não houve deploy.
- `FILE_SCANNER_SECRET` está preenchido em `.dev.vars` e `scanner/.dev.vars`, tem pelo menos 32 bytes e os dois valores coincidem. O terminal desta sessão não encontra `docker.exe` nem o executável do Docker Desktop nos caminhos usuais; ainda não foi possível construir/iniciar o scanner aqui.
- O projeto Supabase `lonfsobzzwmzyqjdgrjx` está `ACTIVE_HEALTHY`. Com a sessão atual, `/api/auth/mfa/status` respondeu com sucesso e informou que não há MFA ativado nem exigência administrativa para este usuário. Não reproduzi a falha antiga de consulta de autenticação adicional. Confirmação de e-mail, callbacks e templates precisam ser conferidos no painel antes de aceitar novos usuários.
- A conta Cloudflare conectada contém a D1 `nivel-creator` com as 15 migrações esperadas e o bucket `nivel-creator-private`. Os Workers `nivel-creator-ai` e `nivel-creator-file-scanner` ainda não aparecem publicados. O Wrangler 4.151.0 está instalado, mas a sessão CLI deste terminal não está autenticada; a conexão Cloudflare via MCP está ativa.
- As credenciais locais de Meta/Instagram e Asaas sandbox ainda estão vazias. São integrações opcionais para o núcleo manual e para a experimentação com IA, mas necessárias para validar métricas reais, checkout e cobranças. Nenhum Worker foi publicado nesta retomada.

### Próxima sequência recomendada

1. Iniciar a sessão local do Wrangler e validar geração de roteiro, plano, diagnóstico e agente com o teto diário já configurado. Depois, configurar a chave como secret do Worker e publicar somente após revisar os demais itens de produção.
2. Tornar o Docker CLI acessível ao terminal e iniciar o scanner; validar upload, bloqueio de arquivo infectado e falha segura quando o scanner não responder.
3. Fazer o fluxo de cadastro/login/recuperação com um endereço controlado e confirmar no painel Supabase os templates e URLs para o domínio escolhido.
4. Somente depois, com as credenciais correspondentes, validar Meta e Asaas sandbox. Fazer revisão de backup restaurável, custos de Containers, retenção/LGPD, observabilidade e domínio/redirects antes de abrir beta ou produção.

## Estado no momento da passagem

- Repositório: `https://github.com/yurisdevops/nivelcreatorai.git`
- Branch: `main`
- Commit imediatamente anterior a este documento: `f6b4c15` (`Document Supabase project provisioning status`). Este arquivo será enviado em um commit seguinte.
- O push desse commit foi concluído. A pasta de trabalho estava limpa depois do envio.
- Supabase: projeto `Nivel Creator AI`, organização `gruponivel`, região São Paulo (`sa-east-1`), plano Free. URL: `https://lonfsobzzwmzyqjdgrjx.supabase.co`.
- Antes de aceitar novos usuários, conferir no painel do Supabase a confirmação de e-mail, as URLs de callback, a verificação TOTP e os templates de confirmação/recuperação; o estado de MFA da sessão local foi validado na retomada abaixo.
- A Data API do Supabase foi deixada desativada: os dados da aplicação ficam na D1; o Supabase é usado para Auth.
- D1 `nivel-creator` e R2 privado `nivel-creator-private` existem na Cloudflare. As 15 migrações D1 remotas foram verificadas.
- Worker principal e Worker scanner ainda não foram publicados. O scanner usa Cloudflare Containers `standard-1` e precisa de Docker ou ambiente compatível; confirme o plano/custos antes de publicar.
- Nenhuma credencial foi colocada no Git. `.dev.vars` e `.env` são ignorados pelo Git.

## Preparar o outro computador

No PowerShell:

```powershell
git clone https://github.com/yurisdevops/nivelcreatorai.git
Set-Location nivelcreatorai
git switch main
git pull --ff-only origin main
node --version
npm --version
npm ci
```

Use Node.js 22 ou superior. Para verificar o ponto de partida:

```powershell
git status --short --branch
git log -1 --oneline
```

## Retomar a configuração local

1. No painel Supabase do projeto acima, configure Authentication:
   - habilite confirmação de e-mail;
   - inclua `http://localhost:8787/auth/callback` na lista de URLs de redirecionamento permitidas;
   - habilite TOTP em Authentication → Multi-Factor e permita verificação dos fatores;
   - ajuste os templates de confirmação e recuperação para usarem `/auth/callback`, com `token_hash` e `type=email` ou `type=recovery`.
2. No Supabase, copie a chave **publishable** do projeto. O app espera essa chave na variável `SUPABASE_ANON_KEY`; não use chave `secret` ou `service_role` nessa variável.
3. Crie o arquivo local de variáveis e preencha as chaves fora do Git:

```powershell
Copy-Item .dev.vars.example .dev.vars
notepad .dev.vars
```

Preencha pelo menos `SUPABASE_URL=https://lonfsobzzwmzyqjdgrjx.supabase.co`, `SUPABASE_ANON_KEY` com a chave publishable e `GEMINI_API_KEY` com uma chave do Gemini. `SUPABASE_SECRET_KEY` é opcional e só é usada no fluxo administrativo de exclusão de conta. Não compartilhe nem versione os arquivos de variáveis.

4. Faça login na Cloudflare para o Wrangler e prepare o banco local:

```powershell
npx wrangler login
npm run db:local
```

5. Gere um segredo aleatório para comunicação app/scanner e coloque **o mesmo valor** em `FILE_SCANNER_SECRET` nos dois arquivos locais `.dev.vars` e `scanner/.dev.vars`:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
notepad .dev.vars
New-Item -ItemType File -Force scanner/.dev.vars
notepad scanner/.dev.vars
```

Em `.dev.vars`, defina `FILE_SCANNER_SECRET` com o valor gerado; em `scanner/.dev.vars`, inclua somente `FILE_SCANNER_SECRET=` com esse mesmo valor. Assim, o scanner não recebe as demais chaves do app. Nunca cole a saída do gerador no chat ou em arquivos versionados.

6. Com Docker instalado e iniciado, rode o scanner em um terminal e o app em outro:

```powershell
npx wrangler dev --config scanner/wrangler.jsonc
```

```powershell
npm run dev
```

Abra `http://localhost:8787`. Se o scanner local precisar construir a imagem ClamAV, aguarde a inicialização das assinaturas antes de validar uploads.

## Publicação e etapas restantes

Antes do beta, conferir variáveis e segredos disponíveis e completar as integrações externas. Os seguintes comandos são para quando houver decisão de publicar; não publicar Workers incompletos sem todos os segredos e serviços exigidos:

```powershell
# Confirmar identidade/acesso e recursos Cloudflare
npx wrangler whoami
npx wrangler d1 info nivel-creator
npx wrangler r2 bucket list

# Publicar scanner e app (scanner primeiro; Containers requer plano/recursos compatíveis)
npx wrangler deploy --config scanner/wrangler.jsonc
npx wrangler secret put FILE_SCANNER_SECRET --config scanner/wrangler.jsonc
npx wrangler secret put FILE_SCANNER_SECRET
npx wrangler deploy
```

Antes do deploy, configure os demais Worker Secrets necessários ao ambiente escolhido. Entre os pendentes estão Gemini, Meta/Instagram, Asaas sandbox e, opcionalmente, a chave Supabase administrativa para exclusão de conta. O app Meta ainda não foi aprovado/conectado; Asaas e Nivel Studio também não estão conectados. Configure os limites e URLs de callback de produção antes de abrir acesso externo.

O Wrangler solicita o valor de cada secret no terminal; rode apenas os comandos correspondentes às integrações que já estiverem configuradas:

```powershell
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_ANON_KEY
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put FILE_SCANNER_SECRET
# Opcional: exclusão administrativa de conta
npx wrangler secret put SUPABASE_SECRET_KEY
# Integração Meta/Instagram
npx wrangler secret put INSTAGRAM_APP_ID
npx wrangler secret put INSTAGRAM_APP_SECRET
npx wrangler secret put INSTAGRAM_REDIRECT_URI
npx wrangler secret put META_GRAPH_API_VERSION
npx wrangler secret put INSTAGRAM_TOKEN_ENCRYPTION_KEY
# Asaas sandbox
npx wrangler secret put ASAAS_API_KEY
npx wrangler secret put ASAAS_WEBHOOK_TOKEN
```

Os secrets acima são do Worker principal. O scanner também precisa do mesmo `FILE_SCANNER_SECRET`, configurado para ele com `npx wrangler secret put FILE_SCANNER_SECRET --config scanner/wrangler.jsonc`. Não use credenciais de produção do Asaas no sandbox e não coloque valores desses secrets neste documento.

Não reaplique as migrações remotas automaticamente: as 15 já estão aplicadas. Se precisar conferir o estado antes de qualquer alteração:

```powershell
npx wrangler d1 migrations list nivel-creator --remote
```

## Gates ainda não concluídos

- Validar configuração real do Supabase Auth, cadastro, confirmação, recuperação de senha e MFA.
- Configurar e validar Gemini e scanner com credenciais locais.
- Testes completos de ponta a ponta nos navegadores e dispositivos suportados; testes de carga e restauração real de backup.
- Revisão jurídica/LGPD, política de retenção e segurança operacional.
- Aprovação do app Meta, conexão real e validação de métricas; validar Asaas sandbox.
- Revisar plano/custos e segredos antes de qualquer publicação de Workers/Containers.

O projeto não está pronto para produção. O README contém o guia funcional e `docs/backup-and-restore.md` descreve o procedimento de recuperação a validar.
