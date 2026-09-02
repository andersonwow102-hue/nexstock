# NEPTERA — handoff do Patrimônio

Atualizado em 2026-09-02. Este documento é a fonte autossuficiente para retomada. Ele descreve o estado **local** do Marco A; não autoriza produção.

## 1. Estado e limites

- Branch de trabalho: `codex/refinar-pix-fechamento`.
- Marco alcançado: **A — arquitetura local**, visualmente aprovado e formalizado tecnicamente neste handoff.
- Não houve migration patrimonial remota, campanha real, lote real, NP real, importação real de legado ou correção real de localização.
- O P0 da seção 12 foi corrigido e provado localmente em 2026-09-02; ainda é obrigatória aprovação explícita antes de discutir ou executar o Marco B.
- Proibido sem nova autorização explícita: push, deploy, escrita no Supabase, migration remota, alteração de produção, criação de campanha/NP real ou importação de legado.

Arquivos normativos complementares: `docs/patrimonio-fase1.md`, `docs/patrimonio-fase1-matrizes.md` e `docs/patrimonio-fase1-runbooks.md`. Em divergência, o SQL atual e os testes prevalecem; este handoff registra as decisões posteriores de produto e o bloqueio conhecido.

## 2. Decisão funcional central

### Equipamentos existentes

Todos os equipamentos de categoria patrimoniável devem receber **novo patrimônio NEPTERA**, mesmo quando já possuem código legado. A única exceção é **Máquina de Brindes**, que não recebe NP novo. Códigos legados ficam somente como referência histórica e não consomem a sequência NEPTERA.

### Equipamentos novos

O cadastro de novo equipamento patrimoniável deve ser atômico: equipamento + NP + `public_id`/QR + vínculo patrimonial na mesma transação. Máquina de Brindes continua sem NP. O contrato local está em `public.patrimonio_cadastrar_equipamentos`; o app real ainda não usa esse fluxo.

## 3. Campanha, lote e fluxo físico aprovado

**Campanha** congela o universo de equipamentos que precisam da implantação, sem congelar localização. **Lote** é uma remessa controlada de etiquetas/NPs livres. O administrador escolhe contexto planejado, quantidade e nome amigável. Exemplo aprovado: demanda da rota Queixo = 100; lote `Queixo — Etapa 1` = 25. O contexto não pré-associa etiquetas a rota/equipamento. Quantidade parcial é normal; excesso exige confirmação explícita.

Fluxo para existentes:

`campanha → lote → gerar NPs/QRs livres → imprimir → pegar etiqueta → escanear QR → autenticar → escolher contexto atual → escolher equipamento → revisar → vincular → colar → confirmar aplicação → conferir → concluído`

Movimentação posterior altera somente a posição operacional: NP, QR e `public_id` permanecem. O QR resolve sempre os dados e a localização atuais autorizados.

## 4. Estados e integridade

### Estados persistidos

- Patrimônio (`equipamentos_patrimonio.situacao`): `disponivel → vinculado → aplicado → conferido`; terminais `anulado` e `baixado`.
- Lote: `preparado → gerado → em_uso → concluido`; `cancelado` só antes da geração.
- Campanha: `ativa → concluida` ou `cancelada`.
- Item da campanha: `pendente → conferido` ou `excecao`; exceções tipadas: `equipamento_excluido`, `equipamento_baixado`, `inelegivel`, `outro`.

`revisao`, divergência de posição, etiqueta pendente, contexto e demais chamadas de atenção de UX são **derivações** de dados atuais/snapshots; não são novos estados de `equipamentos_patrimonio`. A associação de campanha preserva `equipamento_id_snapshot`; o trabalho físico usa a posição atual.

### Regras invariantes

- NP nunca é reutilizado; gaps de sequence são válidos.
- Frontend não gera NP nem escolhe `public_id`.
- `public_id` é opaco, aleatório, URL-safe, não enumerável e tem 22 caracteres; QR não é autenticação.
- Patrimônio pertence ao equipamento físico; localização é mutável; NP é permanente.
- Legado e campanha não consomem sequência NP. Preparar lote também não consome.
- Só geração efetiva de lote e cadastro patrimoniável consomem NP; a aplicação deve usar os valores retornados, nunca reconstruir faixa por aritmética.
- Reimpressão não cria NP. Movimentação não altera NP.
- DELETE não pode liberar identidade: FKs `RESTRICT`, triggers anti-DELETE e índices únicos preservam vínculo e histórico.
- Escritas patrimoniais ocorrem por RPC com contexto interno; eventos são append-only; autoria é snapshot do backend.

## 5. Arquitetura SQL local

### Migrations, em ordem

1. `202609010900_patrimonio_catalogo.sql`: catálogo `equipamento_categorias` e elegibilidade patrimonial.
2. `202609010910_patrimonio_sequencia.sql`: sequences privadas de NP e lote.
3. `202609010920_patrimonio_lotes.sql`: campanhas, snapshot de equipamentos e lotes.
4. `202609010930_equipamentos_patrimonio.sql`: identidade NEPTERA e legados históricos.
5. `202609010940_patrimonio_eventos_protecao.sql`: idempotência, eventos, validações e triggers protetores.
6. `202609010950_patrimonio_rpc_geracao.sql`: criação/preparação/geração/impressão/importação/cadastro.
7. `202609011000_patrimonio_rpc_fluxo.sql`: vínculo, aplicação, conferência e desfechos.
8. `202609011010_patrimonio_rls_grants.sql`: RLS, views, resolução por `public_id`, grants/revokes.

### Objetos

Tabelas: `equipamento_categorias`, `patrimonio_campanhas`, `patrimonio_campanha_equipamentos`, `patrimonio_lotes`, `equipamentos_patrimonio`, `equipamentos_patrimonio_legados`, `patrimonio_operacoes_idempotentes`, `patrimonio_eventos`. Dependências existentes: `equipamentos`, `pontos`, `perfis`, `auth.users` e helpers `private.perfil_atual()`/`private.gerente_atual()`.

Views: `patrimonio_operacional_v`, `patrimonio_lotes_resumo_v`, `patrimonio_campanhas_resumo_v`.

Sequences: explícitas `patrimonio_np_seq` (1..999999, sem cycle) e `patrimonio_lote_seq`; identities criam `equipamentos_patrimonio_id_seq`, `equipamentos_patrimonio_legados_id_seq` e `patrimonio_eventos_id_seq`. Todas têm uso direto revogado.

Índices: `equipamento_categorias_nome_normalizado_uidx`; `patrimonio_campanha_equipamentos_atual_uidx`, `patrimonio_campanha_equipamentos_resolucao_idx`; `patrimonio_campanhas_situacao_idx`, `patrimonio_lotes_campanha_idx`; `equipamentos_patrimonio_equipamento_ativo_uidx`, `equipamentos_patrimonio_campanha_item_ativo_uidx`, `equipamentos_patrimonio_lote_idx`, `equipamentos_patrimonio_equipamento_historico_idx`, `equipamentos_patrimonio_legados_equipamento_idx`; `patrimonio_eventos_campanha_idx`, `patrimonio_eventos_lote_idx`, `patrimonio_eventos_patrimonio_idx`, `patrimonio_eventos_equipamento_idx`. PKs/uniques também indexam IDs, códigos, números, `public_id`, campanha+snapshot e idempotência autor+chave.

Constraints nomeadas: `equipamento_categorias_{codigo,nome,ordem}_check`; `patrimonio_campanhas_{codigo,nome,situacao,quantidade,versao,autoria,conclusao,cancelamento}_check`; `patrimonio_campanha_equipamentos_{snapshot,resolucao,desfecho}_check`; `patrimonio_lotes_{codigo,situacao,quantidade,excesso,contexto,impressoes,versao,autoria,geracao,conclusao,cancelamento,marcos}_check`; `equipamentos_patrimonio_public_id_key`, `_public_id_check`, `_codigo_key`, `_numero_key`, e `equipamentos_patrimonio_{numero,codigo,origem,origem_dados,situacao,autoria,vinculo_autoria,aplicacao_autoria,conferencia_autoria,reimpressoes,versao,marcos_ordem,baixa,anulacao,estado_dados}_check`; `equipamentos_patrimonio_legados_{equipamento,codigo,fonte,autoria}_check`; `patrimonio_operacoes_{operacao,payload,resultado}_check`; `patrimonio_eventos_{evento,alvo,equipamento,motivo,detalhes,autoria}_check` e `patrimonio_eventos_idempotencia_fk`. FKs usam `RESTRICT` para identidade/histórico; equipamento em snapshot/evento pode virar `NULL` mantendo ID snapshot.

Triggers: `patrimonio_campanhas_{somente_rpc,transicao,sem_exclusao}`; `patrimonio_campanha_equipamentos_{somente_rpc,transicao,sem_exclusao}`; `patrimonio_lotes_{somente_rpc,transicao,sem_exclusao}`; `equipamentos_patrimonio_{somente_rpc,transicao,sem_exclusao}`; `equipamentos_patrimonio_legados_{somente_rpc,sem_exclusao}`; `patrimonio_operacoes_{somente_rpc,sem_exclusao}`; `patrimonio_eventos_{somente_rpc,alvo_coerente,append_only}`; `patrimonio_cadastro_equipamento_atomico`; `patrimonio_campo_legado_somente_leitura`.

Eventos permitidos, append-only: `campanha_criada`, `campanha_item_excecao`, `campanha_concluida`, `campanha_cancelada`, `lote_preparado`, `lote_gerado`, `lote_impresso`, `lote_iniciado`, `lote_concluido`, `lote_cancelado`, `patrimonio_gerado`, `patrimonio_vinculado`, `vinculo_corrigido`, `etiqueta_aplicada`, `patrimonio_conferido`, `etiqueta_reimpressa`, `patrimonio_anulado`, `patrimonio_baixado`, `legado_importado`, `equipamento_cadastrado_com_patrimonio`, `equipamento_cadastrado_sem_patrimonio`.

### RPCs públicas

Todas são `SECURITY DEFINER`, usam idempotência `(autor_user_id, chave)` + fingerprint do payload e locks/constraints adequados. Retentativa igual devolve resultado; mesma chave com payload diferente falha.

| RPC | Entrada / retorno | Perfil e concorrência |
|---|---|---|
| `patrimonio_criar_campanha` | `(nome text, idempotencia uuid) → uuid` | admin; mesmo corte para contar/materializar, locks em equipamentos/pontos; código/PK únicos. |
| `patrimonio_preparar_lote` | `(campanha_id uuid, quantidade integer, contexto text, confirmar_excesso boolean, idempotencia uuid) → jsonb` | admin; lock da campanha; 1..500; snapshot do saldo pendente global; excesso explícito. **SQL local ainda não persiste nome amigável nem contexto estruturado/demanda por contexto.** |
| `patrimonio_gerar_lote` | `(lote_id uuid, idempotencia uuid) → jsonb` | admin; lock de lote + sequence; retorna identidades efetivamente geradas. |
| `patrimonio_registrar_impressao_lote` | `(lote_id uuid, idempotencia uuid) → jsonb` | admin; lock do lote; incrementa impressão sem NP novo. |
| `patrimonio_importar_legado` | `(equipamento_id bigint, codigo_legado text, idempotencia uuid) → bigint` | admin; locks/uniques; histórico apenas, sem sequence NP. Não executar sem autorização futura. |
| `patrimonio_cadastrar_equipamentos` | `(equipamento jsonb, quantidade integer, idempotencia uuid) → jsonb` | admin/operador/gerente conforme regras; advisory/row locks + sequence; atômico; Máquina de Brindes sem NP. |
| `patrimonio_vincular_etiqueta` | `(public_id text, equipamento_id bigint, contexto jsonb, idempotencia uuid) → text` | admin/operador/gerente no escopo; locks patrimônio/equipamento/item; disponível→vinculado. |
| `patrimonio_corrigir_vinculo` | `(public_id text, equipamento_id bigint, motivo text, idempotencia uuid) → text` | admin; locks; preserva trilha. |
| `patrimonio_aplicar_etiqueta` | `(public_id text, idempotencia uuid) → text` | admin/operador; lock; vinculado→aplicado. |
| `patrimonio_conferir_etiqueta` | `(public_id text, equipamento_id bigint, localizacao text, observacao text, idempotencia uuid) → text` | admin/operador; locks e validação da identidade/posição; aplicado→conferido e resolve item. |
| `patrimonio_reimprimir_etiqueta` | `(public_id text, motivo text, idempotencia uuid) → text` | admin; lock; mesmo NP/public_id. |
| `patrimonio_anular` | `(public_id text, motivo text, idempotencia uuid) → text` | admin; lock; terminal, sem reutilização. |
| `patrimonio_baixar` | `(public_id text, motivo text, idempotencia uuid) → text` | admin; lock; somente conferido, terminal. |
| `patrimonio_resolver_item_campanha_excecao` | `(item_id uuid, tipo text, motivo text, idempotencia uuid) → uuid` | admin; lock; fecha item como exceção auditada. |
| `patrimonio_concluir_lote` / `patrimonio_cancelar_lote` | `(uuid, [motivo text], idempotencia uuid) → uuid` | admin; `FOR UPDATE`; só desfecho coerente. |
| `patrimonio_concluir_campanha` / `patrimonio_cancelar_campanha` | `(uuid, [motivo text], idempotencia uuid) → uuid` | admin; `FOR UPDATE`; todos itens resolvidos para conclusão. |
| `patrimonio_resolver_public_id` | `(public_id text) → table` | authenticated; leitura com RLS/escopo, não autentica pelo QR. |

### Grants e RLS

- `anon` e `public`: sem acesso patrimonial; sequences e tabelas revogadas.
- `authenticated`/`service_role`: `SELECT` nas tabelas de catálogo/campanha/lote/patrimônio; operações idempotentes não são expostas; eventos diretos só a `service_role`.
- `authenticated`: `SELECT` nas três views e `EXECUTE` apenas nas RPCs públicas listadas. Não há DML direto concedido nas tabelas operacionais.
- Policies: `equipamento_categorias_ler`; `patrimonio_campanhas_ler`; `patrimonio_campanha_equipamentos_ler`; `patrimonio_lotes_ler`; `equipamentos_patrimonio_ler`; `equipamentos_patrimonio_legados_ler`; `patrimonio_eventos_ler`.
- Admin/operador têm leitura operacional ampla; gerente lê apenas equipamento/rota própria via `private.patrimonio_gerente_pode_ver_equipamento`; consulta não recebe dados patrimoniais operacionais além do explicitamente permitido pela policy. Mutações continuam restritas pelas RPCs e seus checks de perfil.

## 6. Frontend, harness e artefatos

- Harness DEV: `patrimonio-v1.html`, `src/patrimonio-v1/main.jsx`, `PatrimonioHarnessApp.jsx`, `model.js`, `fixtures.js`, `integrationPoints.js`, `Icons.jsx`, `patrimonio-v1.css`.
- Isolamento: `main.jsx` só importa/renderiza o harness sob `import.meta.env.DEV`; o HTML não integra o fluxo normal de produção.
- Testes: `PatrimonioHarness.test.js` (modelo/UX/isolamento), `patrimonioPdf.test.js`, `src/patrimonioDeepLink.test.js`; SQL em `supabase/tests/patrimonio_fase1_rls.sql`, `patrimonio_fase1_concorrencia.sql` e bootstrap descartável `bootstrap_patrimonio_local.sql`.
- PDF/QR: `patrimonioPdf.js`, `generateArtifacts.mjs`, `generateQrArtifact.mjs`; amostras marcadas **AMOSTRA/NÃO UTILIZAR** em `output/pdf` e `output/qr`; previews aprovados em `output/previews/patrimonio-*`.
- Deep link real mínimo: `src/patrimonioDeepLink.js`, `PatrimonioDeepLinkPage.jsx/.css`, integração em `App.jsx` e `db.js`; rota `/patrimonio/:public_id`, exige login e resolve por RPC. A ativação real permanece desabilitada no Marco A.
- O módulo Patrimônio completo, campanhas, lotes e cadastro patrimonial **não estão integrados ao app real**. O harness trabalha só em memória/fixtures. PDFs e contratos operacionais ainda são amostras locais.

## 7. UX de lotes aprovada (não redesenhar)

O composer mostra contexto planejado, demanda daquele contexto, quantidade escolhida, opção de usar demanda total ou parcial, alerta/segunda confirmação de excesso, nome amigável e código PAT como metadado secundário. A confirmação deixa explícita a geração irreversível. A lista e o dossiê mostram progresso, contexto, demanda snapshot, quantidade/excedente, autoria e ações; layout responsivo foi aprovado em desktop/tablet/mobile, Light/Dark.

Importante: isso é hoje um **contrato do modelo/harness**, não todo o contrato SQL. O SQL atual guarda `contexto text`, limite 300, e `saldo_pendente_no_preparo` global; não guarda `friendly_name`, contexto tipado/referenciado nem demanda específica do contexto. Antes do app real, o Marco B precisa decidir uma migration/RPC aditiva (ou revisar as migrations ainda não publicadas) para alinhar esse contrato sem inventar associação técnica de etiqueta à rota.

## 8. Preflight histórico de produção

Referência histórica já levantada, **não constante** e não reconfirmada nesta formalização: 488 equipamentos; 454 patrimoniáveis; 34 Máquinas de Brindes; 66 códigos legados; 58 patrimoniáveis com legado; 396 patrimoniáveis sem código; 388 aptos; 8 em revisão de localização; nenhum `NP-*`; `NP-000001` livre naquele momento.

Antes de rollout, reconfirmar tudo em transação/read-only. Não inferir que os mesmos números continuam válidos.

## 9. Dívida conhecida: oito localizações órfãs

No preflight havia 8 equipamentos patrimoniáveis cuja localização não correspondia com segurança ao cadastro operacional. Eles entram como revisão logística, não recebem associação aproximada/fuzzy por nome. Corrigir futuramente pelo fluxo oficial de Equipamentos, com autoria e histórico, antes ou durante implantação controlada.

## 10. Evidências locais e validações já concluídas

- Banco patrimonial isolado: `supabase/tests/bootstrap_patrimonio_local.sql` + somente as oito migrations patrimoniais; documentação de RLS/concorrência em `supabase/tests/patrimonio_fase1_concorrencia.md`.
- Último estado frontend validado antes deste handoff: Patrimônio 28/28; suíte completa 269/269; lint e build aprovados; `git diff --check` aprovado (apenas avisos de EOL CRLF); QA Light/Dark e desktop/tablet/mobile aprovado.
- Essas provas não substituem reconstrução histórica completa nem upgrade equivalente à produção, bloqueados pelo P0 abaixo.

## 11. Git no encerramento

Antes deste documento, HEAD local era `ca46749` (`backup automatico antes de edicoes`), branch `codex/refinar-pix-fechamento`, 5 commits à frente de `origin/codex/refinar-pix-fechamento`. Checkpoints locais consecutivos relevantes: `5d571a6`, `e6a8fab`, `9bd329d`, `58f1922`, `ca46749`; remoto observado em `8b046b6`. O checkpoint desta sessão preservou os cinco arquivos do refinamento aprovado de lotes: `PatrimonioHarness.test.js`, `PatrimonioHarnessApp.jsx`, `fixtures.js`, `model.js`, `patrimonio-v1.css`.

O hash final pode mudar ao incorporar este handoff ao mesmo checkpoint local. Não houve push.

## 12. P0 — reconstrução histórica (corrigido localmente)

O diretório `supabase/migrations` não contém a migration de fundação do schema legado que já existia quando o histórico versionado começou. A primeira migration, `202606130900_fechamentos_rotas.sql`, cria uma policy que chama `public.perfil_atual()`, mas nenhuma migration anterior cria essa função (nem a base completa, como `perfis`). Em banco vazio, a execução falha nessa referência e interrompe a cadeia.

Há uma segunda prova do mesmo buraco: `202606211630_private_rls_helpers.sql` tenta executar `ALTER FUNCTION public.perfil_atual() SET SCHEMA private` e o equivalente para `public.gerente_atual()`, embora nenhuma migration histórica versionada tenha criado esses helpers. Eles aparecem apenas em scripts/bootstrap fora da cadeia normal, como `supabase/setup_profissional.sql` ou `supabase/tests/bootstrap_patrimonio_local.sql`; esses arquivos não são migrations de produção e não podem ser pressupostos por `supabase db reset`.

Consequência: o repositório não prova `banco vazio → todas as migrations históricas → Patrimônio`. Ficam bloqueados o reset/rebuild histórico completo, a prova de upgrade reproduzível a partir da cadeia versionada e, por consequência, a certificação integral de testes SQL/RLS/concorrência no schema completo. O bootstrap patrimonial prova apenas o subsistema isolado.

Correção local: `202606130800_legacy_schema_baseline.sql` foi adicionada antes da primeira migration histórica. Ela materializa somente a fundação legada ausente, não contém DML operacional, é idempotente e não modifica migrations publicadas. Em base já evoluída, preserva os helpers privados e não recria `public.perfil_atual()`/`public.gerente_atual()`; grants são explícitos e limitados às sete tabelas legadas.

Provas locais em bancos PostgreSQL descartáveis:

- rebuild vazio: 71 migrations aplicadas em ordem; zero campanha, lote ou patrimônio; `patrimonio_np_seq = 1, is_called = false`; somente os dois helpers privados ao final;
- upgrade equivalente: hashes de `private.perfil_atual()` e `private.gerente_atual()` permaneceram idênticos, dados sentinela ficaram 1/1/1, nenhum helper público foi recriado, oito migrations patrimoniais aplicadas e sequência NP permaneceu virgem;
- SQL RLS e concorrência patrimonial passaram após adaptar suas fixtures ao trigger histórico de criação automática de perfil.

Riscos remanescentes: a equivalência foi construída com `bootstrap_patrimonio_local.sql`, não com dump remoto; nenhuma consulta remota foi feita. Antes do Marco B, comparar a baseline com um schema dump/read-only formalmente autorizado, validar a tabela de histórico de migrations remota e decidir como registrar a baseline retroativa sem reaplicação indesejada. A baseline não deve ser enviada remotamente por simples `db push` sem esse plano.

## 13. Marcos

- **A — arquitetura local:** concluída visualmente; formalização técnica registrada; P0 corrigido e provado somente localmente.
- **B — migrations patrimoniais em produção:** não iniciado.
- **C — campanha real/snapshot:** não iniciado.
- **D — primeiro lote e primeiro NP real:** não iniciado.
- **E — piloto físico:** não iniciado.
- **F — rollout progressivo:** não iniciado.

Não avançamos além do Marco A.

## 14. Ordem obrigatória da próxima sessão

1. Ler este arquivo integralmente.
2. Auditar Git, branch, HEAD, ahead/behind e working tree.
3. Não tocar produção.
4. Auditar a correção local do P0 e suas provas de reconstrução/upgrade.
5. Sob autorização específica e somente leitura, comparar a baseline com o schema e o histórico de migrations remotos antes de qualquer Marco B.
6. Definir o tratamento seguro da migration retroativa; não executar remotamente nesta etapa.
7. Reexecutar testes patrimoniais SQL e frontend.
8. Reexecutar suíte completa, lint, build e `git diff --check`.
9. Apresentar evidências, riscos e diff.
10. Parar para aprovação. Somente depois discutir Marco B.

Checklist de compreensão: este arquivo registra a decisão funcional, o contrato local, os objetos reais, as divergências harness×SQL, os dados históricos que exigem reconfirmação, o P0, as proibições e o próximo passo. Nenhuma instrução depende do conteúdo da conversa que o originou.
