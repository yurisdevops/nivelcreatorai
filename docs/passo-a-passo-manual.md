# Passo a passo: o que só você pode fazer

Atualizado em 19/10/2026. Faça na ordem. Nenhuma chave deve ser colada no chat nem em arquivos: sempre use o comando `npx wrangler secret put ...` no terminal da pasta `nivelcreatorai` e cole a chave quando ele pedir.

As telas da Meta e do Google mudam de vez em quando. Se algum nome de botão estiver diferente, procure pelo nome mais parecido.

## 1. Alerta de gastos no Google Cloud (5 minutos)

1. Abra https://console.cloud.google.com/billing e escolha a conta de faturamento do projeto.
2. Menu **Orçamentos e alertas** → **Criar orçamento**.
3. Nome: `Nivel Creator IA`. Valor: R$ 50 por mês (pode ajustar).
4. Alertas em 50%, 90% e 100%, enviados para o seu e-mail.

O app já tem um teto próprio de US$ 3 por dia; o alerta é a segunda proteção.

## 2. Instagram: criar o app na Meta (20 a 30 minutos)

### 2.1 Criar o app

1. Entre em https://developers.facebook.com com a sua conta do Facebook e clique em **Meus apps** → **Criar app**.
2. Nome do app: `Nível Creator IA`. E-mail de contato: `contato@nivelstudio.com.br`.
3. Caso de uso: escolha a opção de **Instagram** (gerenciar mensagens e conteúdo no Instagram). Se pedir o tipo, escolha **Empresa**.
4. Conclua a criação.

### 2.2 Configurar o login do Instagram

1. No painel do app, abra **Instagram** → **Configuração da API com login do Instagram** (API setup with Instagram login).
2. Anote o **ID do app do Instagram** e o **Chave secreta do app do Instagram**. Não mande para ninguém.
3. Em **Configurar o login comercial do Instagram** (Set up Instagram business login) → **Configurações de login comercial**:
   - **URIs de redirecionamento do OAuth**: `https://creator.nivelstudio.com.br/auth/instagram/callback`
   - **URL de cancelamento de autorização**: `https://creator.nivelstudio.com.br/privacidade`
   - **URL de solicitação de exclusão de dados**: `https://creator.nivelstudio.com.br/privacidade#exclusao-de-dados`
4. Salve.

### 2.3 Dados básicos do app

Em **Configurações do app** → **Básico**:

- URL da Política de Privacidade: `https://creator.nivelstudio.com.br/privacidade`
- URL dos Termos de Serviço: `https://creator.nivelstudio.com.br/termos`
- Ícone: pode usar a estrela roxa (eu te mando o arquivo se precisar).
- Categoria: Negócios e páginas (ou a mais próxima).

### 2.4 Testadores (para usar antes da aprovação da Meta)

1. Em **Funções do app** → **Funções** → **Testadores do Instagram**, adicione o @ da sua conta profissional e o dos criadores do beta.
2. Cada pessoa aceita o convite no app do Instagram: **Configurações** → **Apps e sites** → **Convites de testador**.
3. A conta precisa ser **profissional** (Criador de conteúdo ou Empresa).

### 2.5 Guardar as chaves no servidor

No terminal da pasta do projeto, rode um comando de cada vez e cole o valor quando ele pedir:

```
npx wrangler secret put INSTAGRAM_APP_ID
npx wrangler secret put INSTAGRAM_APP_SECRET
npx wrangler secret put META_GRAPH_API_VERSION
```

No último, digite a versão da API que aparece no painel da Meta, no formato `v24.0` (o painel mostra a versão atual no topo das páginas de API).

O endereço de retorno e a chave de criptografia dos tokens eu já deixei configurados no servidor.

Depois disso, me avise: eu testo a conexão com a sua conta e ligo as métricas por Reel.

### 2.6 Mais tarde: revisão da Meta (para abrir a qualquer criador)

Só quando o beta mostrar que vale a pena. Exige verificação de empresa (pode ser como pessoa física em alguns casos, a Meta vai indicar), um vídeo mostrando o uso das permissões e a revisão do app. Eu preparo o roteiro do vídeo e os textos.

## 3. E-mails do login saindo com o seu domínio (15 minutos)

Hoje o Supabase manda os e-mails de confirmação pelo servidor padrão dele, que tem limite baixo por hora e às vezes cai no spam.

1. Crie uma conta grátis em https://resend.com e adicione o domínio `nivelstudio.com.br`. Ele vai mostrar alguns registros de DNS.
2. Adicione esses registros na Cloudflare (painel do domínio `nivelstudio.com.br` → **DNS**). Se preferir, me avise que eu adiciono por você.
3. No Resend, crie uma **API key** de envio.
4. No Supabase: **Authentication** → **Emails** → **SMTP Settings** → ative **Custom SMTP**:
   - Host: `smtp.resend.com` · Porta: `465` · Usuário: `resend`
   - Senha: a API key do Resend (cole direto no Supabase)
   - Remetente: `nao-responda@nivelstudio.com.br` · Nome: `Nível Creator`

## 4. Segurança das suas contas (10 minutos)

Ative a verificação em duas etapas em: Cloudflare, Supabase, Google Cloud, GitHub, Meta (Facebook) e Resend. Quem acessar qualquer uma delas consegue mexer no app inteiro.

## 5. Começar o beta

1. Divulgue `https://creator.nivelstudio.com.br/lista?ref=instagram` (troque o final para cada lugar onde divulgar).
2. Veja quem entrou: `npm run waitlist:list`
3. Aprove de 5 a 10 pessoas: `npm run beta:aprovar -- email1@exemplo.com email2@exemplo.com`
4. Mande para elas o link `https://creator.nivelstudio.com.br/entrar` e peça para criarem a conta com o mesmo e-mail.
