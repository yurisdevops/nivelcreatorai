# Backup e recuperação

Este procedimento cobre os dados do `nivel-creator-ai`: D1 (`nivel-creator`) e objetos privados no R2 (`nivel-creator-private`). A restauração de D1 é destrutiva e substitui o estado atual; execute-a apenas durante um incidente autorizado e com o horário do incidente registrado.

## Estado e limites atuais

- D1 Time Travel é automático. O período de recuperação é de até 7 dias no Workers Free ou 30 dias no Workers Paid. Confirme o plano e o tipo de armazenamento da base antes de contar com esse recurso.
- R2 não é recuperado por uma restauração de D1. Faça cópia independente dos objetos e mantenha a chave original, `workspace_id`, tamanho e SHA-256 para verificar integridade.
- A aplicação grava `sha256` na linha de `files` e nos metadados R2. Use esse valor para validar os objetos recuperados.
- O `wrangler.jsonc` contém um identificador de D1 configurado para `nivel-creator`. Antes de qualquer comando remoto, confirme no painel Cloudflare que a conta, o nome e o ID correspondem ao ambiente pretendido; não presuma que o arquivo sozinho comprova o estado remoto.

## Preparação operacional

1. Configure o D1 de produção e confirme o nome e o ID no painel Cloudflare. Não copie um ID de staging para produção.
2. Mantenha uma cópia periódica do D1 fora do próprio banco e da conta de produção, criptografada e com acesso restrito. A documentação Cloudflare descreve exportar D1 para R2 por API/Workflows; para independência de conta, replique os exports para um destino externo.
3. Copie periodicamente os objetos do prefixo `private/` para um destino independente. Preserve as chaves e registre um manifesto com chave, tamanho, hash e data. Nunca configure lifecycle de expiração no bucket ativo sem revisar a retenção aprovada.
4. Guarde os exports e manifestos por pelo menos 30 dias, ou pelo prazo maior aprovado na política de retenção. As cópias devem ter criptografia e credenciais diferentes das credenciais de produção.
5. A cada trimestre, restaure os exports e objetos em recursos isolados de staging. Verifique as linhas e hashes, faça downloads autenticados de amostra e registre duração, divergências e responsável. Um backup sem teste de restauração não conta como validado.

## Recuperar D1 via Time Travel

Use a versão de Wrangler instalada pelo projeto (`npx wrangler --version`) e confirme o ambiente/conta antes de executar qualquer comando remoto. D1 Time Travel exige uma base no backend de produção (`version: production` em `wrangler d1 info`) e está disponível até 7 dias no Workers Free ou 30 dias no Workers Paid.

1. Interrompa temporariamente alterações de dados no app e anote o horário UTC em que o problema começou.
2. Inspecione o ponto atual e o ponto anterior ao incidente:

   ```powershell
   npx wrangler d1 info nivel-creator
   npx wrangler d1 time-travel info nivel-creator
   npx wrangler d1 time-travel info nivel-creator --timestamp="<HORARIO_UTC_ANTES_DO_INCIDENTE>"
   ```

   Substitua o timestamp pelo horário UTC escolhido. Confirme que a saída mostra o banco esperado e um bookmark anterior à alteração indevida.

3. Registre o bookmark e obtenha aprovação operacional para o restore. O comando seguinte substitui o banco em produção:

   ```powershell
   npx wrangler d1 time-travel restore nivel-creator --bookmark="BOOKMARK_CONFIRMADO"
   ```

4. Guarde o `previous_bookmark` informado pelo restore. Ele permite desfazer a operação caso o ponto escolhido esteja incorreto.
5. Aplique apenas migrações que sejam posteriores ao ponto restaurado e necessárias para o código que será servido. Confira a tabela `d1_migrations` e o histórico do Git antes de aplicar migrações.
6. Compare contagens e registros essenciais com o export/manifesto mais recente. Confirme workspaces, memberships, arquivos, assinaturas, direitos de dados e eventos de cobrança.

## Recuperar objetos R2

1. Mantenha uploads e exclusões pausados até a consistência entre D1 e R2 ser confirmada.
2. Recupere o objeto pela chave original a partir da cópia independente. Se a cópia não tiver todos os objetos, gere uma lista dos `r2_key` referenciados por `files` e compare com o manifesto do backup.
3. Reenvie os objetos ausentes ao bucket privado, preservando a chave `private/<workspace_id>/<file_id>`, `content_type`, `workspace_id` e `sha256`.
4. Calcule SHA-256 de cada objeto recuperado e compare com `files.sha256` e com o manifesto. Não reabra downloads de arquivos com hash divergente ou ausente.
5. Se o D1 restaurado apontar para objetos apagados depois do ponto de recuperação, recupere esses objetos antes de reabrir a biblioteca. Se existirem objetos sem linha correspondente no D1, mantenha-os em quarentena operacional para investigação e remoção segundo a política aprovada.

## Critérios para reabrir o serviço

- Migrações e versão de código são compatíveis com o D1 restaurado.
- Arquivos referenciados no D1 existem no R2 e os hashes conferem.
- Login, autorização por workspace, leitura da biblioteca e fluxo de cobrança foram verificados em staging ou por operações controladas.
- Logs do Worker foram revisados para erros do restore; nenhum dado pessoal ou token deve ser incluído em logs operacionais.
- Foram registrados o ponto restaurado, a duração, as verificações executadas e as divergências restantes.

## Referências oficiais

- [D1 Time Travel e backups](https://developers.cloudflare.com/d1/reference/time-travel/)
- [Comandos Wrangler para D1](https://developers.cloudflare.com/d1/wrangler-commands/)
- [Exportar e salvar D1 em R2 com Workflows](https://developers.cloudflare.com/workflows/examples/backup-d1/)
- [Logs do Workers](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)

