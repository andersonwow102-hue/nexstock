# Patrimônio Fase 1 — Matrizes de domínio, estados e acesso

Este documento é a referência de revisão do Marco A. A implementação executável
continua sendo o conjunto de migrations e testes SQL; divergência entre esta
matriz e o código é bloqueio de homologação.

## 1. Responsabilidade das entidades

| Entidade | Mede/guarda | Não deve guardar |
| --- | --- | --- |
| Categoria | Nome canônico e elegibilidade patrimonial | Sequência, posição ou ator |
| Campanha | Esforço de implantação e snapshot de IDs membros | Posição atual congelada |
| Item de campanha | Pertença e resolução do equipamento no esforço | NP pré-reservado |
| Lote | Quantidade de etiquetas, contexto logístico e progresso | Seleção definitiva de equipamentos |
| Patrimônio | NP, `public_id`, estado físico e vínculo atual/histórico | Referência anterior sobrescrita |
| Referência anterior | Código legado literal, origem e equipamento | Estado físico fictício |
| Evento | Transição, motivo, snapshots e autoria do backend | Edição destrutiva |
| Idempotência | Operação, chave, fingerprint do payload e resultado | Regra de autorização |
| Equipamento | Nome, categoria, situação e posição operacional atual | Snapshot logístico duplicado na campanha |

### Matriz física de tabelas e views

| Objeto | Finalidade / fonte de verdade | Política de `DELETE` | RLS / exposição |
| --- | --- | --- | --- |
| `equipamento_categorias` | Catálogo canônico de categoria e elegibilidade patrimonial. | Referências usam `RESTRICT`; remoção não faz parte do fluxo operacional. | Leitura autenticada para os quatro perfis; sem DML cliente. |
| `patrimonio_campanhas` | Cabeçalho, meta e ciclo do snapshot de implantação. | Trigger impede exclusão física. | Leitura de administrador/operador; escrita só por RPC. |
| `patrimonio_campanha_equipamentos` | Pertença histórica do equipamento e sua resolução na campanha. | Trigger impede exclusão; FK para equipamento usa `SET NULL` mantendo o ID snapshot. | Leitura de administrador/operador; escrita só por RPC. |
| `patrimonio_lotes` | Quantidade, contexto logístico e estado de cada lote de etiquetas. | Trigger impede exclusão física. | Leitura de administrador/operador; escrita só por RPC. |
| `equipamentos_patrimonio` | Fonte canônica de NP, `public_id`, vínculo e marcos físicos. | Trigger e FKs `RESTRICT`; anulação/baixa substituem exclusão. | Administrador/operador; gerente apenas no escopo do equipamento. Sem DML cliente. |
| `equipamentos_patrimonio_legados` | Referências anteriores literais, separadas do NP. | Trigger impede exclusão física. | Mesmo escopo do patrimônio associado; escrita só pela importação RPC. |
| `patrimonio_operacoes_idempotentes` | Fingerprint e resultado de mutações para replay seguro. | Trigger impede exclusão; retenção futura ainda será definida. | Sem policy ou `SELECT` cliente; uso interno das RPCs. |
| `patrimonio_eventos` | Trilha patrimonial append-only, com autoria e snapshots backend. | Trigger bloqueia `UPDATE` e `DELETE`. | Administrador/operador; gerente somente no escopo. Colunas internas não são mutáveis. |
| `patrimonio_operacional_v` | Leitura consolidada de identidade, equipamento, localização atual e legado. | View somente leitura. | `security_invoker`; herda RLS das fontes. |
| `patrimonio_lotes_resumo_v` | Agregados derivados por estado de etiqueta em cada lote. | View somente leitura. | `security_invoker`; recorte de administrador/operador. |
| `patrimonio_campanhas_resumo_v` | Progresso derivado de membros/resoluções da campanha. | View somente leitura. | `security_invoker`; recorte de administrador/operador. |

## 2. Invariantes

| Código | Invariante | Proteção esperada |
| --- | --- | --- |
| I-01 | NP global é único e nunca reutilizado | sequence + unique |
| I-02 | `public_id` é único, opaco e não é credencial | geração backend + unique + autenticação/RLS |
| I-03 | Etiqueta gerada por lote nasce livre | `equipamento_id NULL` no estado disponível |
| I-04 | Equipamento tem no máximo um patrimônio ativo | índice único parcial/lock |
| I-05 | Patrimônio ativo vincula no máximo um equipamento | FK + transição serializada |
| I-06 | Máquina de Brindes não recebe NP novo | catálogo canônico + validação RPC |
| I-07 | Legado não ocupa o namespace NP | tabela/coluna separada + validação literal |
| I-08 | Aplicação exige vínculo | máquina de estados |
| I-09 | Conferência exige aplicação e código esperado | máquina de estados + comparação backend |
| I-10 | Baixa exige patrimônio conferido | máquina de estados |
| I-11 | Evento não é atualizado ou excluído | trigger/grants append-only |
| I-12 | Autor vem da sessão | `auth.uid()` + snapshot do perfil |
| I-13 | Campanha congela pertença, não posição | schema sem snapshot de localização operacional |
| I-14 | DELETE do equipamento é bloqueado após histórico patrimonial | FK `ON DELETE RESTRICT` |
| I-15 | Repetição idempotente não produz novo efeito | chave + fingerprint + resultado persistido |

## 3. Estados da campanha

| Estado | Entrada | Saídas válidas | Observação |
| --- | --- | --- | --- |
| `ativa` | criação administrativa com snapshot | `concluida`, `cancelada` | aceita novos lotes |
| `concluida` | todos os membros resolvidos conforme regra | nenhuma | terminal |
| `cancelada` | cancelamento administrativo motivado | nenhuma | não apaga lotes/NP/eventos |

Resoluções de item de campanha:

| Resolução | Significado |
| --- | --- |
| `pendente` | equipamento ainda não conferido nem justificado |
| `conferido` | implantação física confirmada |
| `excecao` | item encerrado por decisão administrativa motivada |

## 4. Estados do lote

| Estado | O que existe | Transição permitida |
| --- | --- | --- |
| `preparado` | quantidade/contexto; nenhum NP consumido | gerar ou cancelar |
| `gerado` | faixa efetivamente criada em etiquetas livres | registrar impressão/usar |
| `em_uso` | implantação iniciada | continuar, concluir quando resolvido |
| `concluido` | todas as etiquetas resolvidas | terminal |
| `cancelado` | somente lote preparado e sem NP gerado | terminal |

Cancelar lote nunca devolve números. Depois da geração, identidades não
desaparecem: devem seguir para uso, anulação motivada ou baixa quando aplicável.

## 5. Estados do patrimônio/etiqueta

| Estado | Equipamento | Operações válidas | Próximo estado |
| --- | --- | --- | --- |
| `disponivel` | `NULL` | imprimir/reimprimir, vincular, anular | `vinculado` ou `anulado` |
| `vinculado` | obrigatório | corrigir vínculo antes da conferência, aplicar, reimprimir | `aplicado` |
| `aplicado` | obrigatório | corrigir com retorno controlado, conferir, reimprimir | `conferido` |
| `conferido` | obrigatório | reimprimir, baixar | `baixado` |
| `anulado` | histórico opcional | leitura/auditoria | terminal |
| `baixado` | vínculo histórico preservado | leitura/auditoria | terminal |

### Transições proibidas importantes

- `disponivel → aplicado` sem vínculo;
- `vinculado → conferido` sem aplicação;
- `aplicado → conferido` com código divergente;
- `conferido → vinculado` por edição direta;
- `anulado/baixado → disponivel`;
- qualquer transição por `UPDATE` direto do cliente.

## 6. Fluxo físico e eventos

| Operação | Pré-condição | Evento esperado | Idempotente |
| --- | --- | --- | --- |
| Criar campanha | administrador; nenhuma campanha conflitante | campanha criada | sim |
| Preparar lote | campanha ativa; quantidade válida | lote preparado | sim |
| Gerar lote | lote preparado | um evento por NP + evento do lote | sim |
| Registrar impressão | lote gerado/em uso | impressão/reimpressão | sim por chamada |
| Vincular etiqueta | etiqueta livre + equipamento elegível no snapshot + posição esperada | patrimônio vinculado | sim |
| Corrigir vínculo | antes da conferência + motivo | vínculo corrigido | sim |
| Aplicar | patrimônio vinculado | etiqueta aplicada | sim |
| Conferir | patrimônio aplicado + segunda leitura correta | patrimônio conferido | sim |
| Reimprimir | justificativa quando exigida | etiqueta reimpressa | sim |
| Anular | estado permitido + motivo | patrimônio anulado | sim |
| Baixar | conferido + motivo | patrimônio baixado | sim |
| Concluir lote | todas as identidades resolvidas | lote concluído | sim |
| Resolver exceção | administrador + motivo/classificação | item de campanha em exceção | sim |
| Concluir campanha | nenhum item pendente | campanha concluída | sim |

## 7. Matriz de RPCs públicas

Todas as mutações abaixo são `SECURITY DEFINER`, usam `search_path` fixo,
reconstroem autoria com `auth.uid()` e falham quando a chave idempotente é
reutilizada com payload diferente. O `GRANT EXECUTE` para `authenticated` não
substitui a checagem de perfil e escopo dentro de cada função.

| RPC | Finalidade | Perfis | Parâmetros | Retorno | Idempotência | Locks / constraints relevantes |
| --- | --- | --- | --- | --- | --- | --- |
| `patrimonio_criar_campanha` | Criar campanha e congelar somente a pertença dos equipamentos elegíveis, incluindo órfãos em revisão logística. | Administrador | `nome text`, `idempotencia uuid` | `uuid` da campanha | Chave + fingerprint | Mesmo corte para contagem/materialização, com `SHARE LOCK` em equipamentos/pontos; código e PK únicos; não congela posição. |
| `patrimonio_preparar_lote` | Registrar intenção de quantidade/contexto sem consumir NP. | Administrador | `campanha_id uuid`, `quantidade integer`, `contexto text`, `confirmar_excesso boolean`, `idempotencia uuid` | `uuid` do lote | Chave + fingerprint | `FOR UPDATE` na campanha; pendências e reservas saem do mesmo snapshot; excesso exige confirmação explícita; lote/código únicos. |
| `patrimonio_gerar_lote` | Consumir a sequence e criar identidades livres do lote. | Administrador | `lote_id uuid`, `idempotencia uuid` | `jsonb` com lote/faixa gerada | Chave + fingerprint | `FOR UPDATE` no lote; sequence monotônica; uniques de NP, sequência e `public_id`; geração única por lote. |
| `patrimonio_registrar_impressao_lote` | Marcar impressão/reimpressão do lote e autoria. | Administrador, Operador | `lote_id uuid`, `idempotencia uuid` | `uuid` do lote | Chave + fingerprint | `FOR UPDATE` no lote; exige lote gerado/em uso. |
| `patrimonio_importar_legado` | Copiar referência anterior literal para estrutura separada. | Administrador | `equipamento_id bigint`, `codigo text`, `idempotencia uuid` | `bigint` do legado | Chave + fingerprint | Lock do equipamento; unique normalizado por equipamento; não consome NP nem altera `equipamentos.patrimonio`. |
| `patrimonio_cadastrar_equipamentos` | Criar um ou vários equipamentos futuros e, quando patrimoniáveis, NP já vinculado na mesma transação. | Administrador, Operador, Gerente no escopo | `dados jsonb`, `quantidade integer`, `idempotencia uuid` | `jsonb` com equipamentos/NPs | Chave + fingerprint do lote de cadastro | Transação única; catálogo fechado; sequence/uniques; Máquina de Brindes não consome NP. Integração no cadastro real fica para rollout posterior. |
| `patrimonio_vincular_etiqueta` | Vincular etiqueta livre a equipamento do snapshot na posição esperada. | Administrador, Operador | `patrimonio_public_id text`, `equipamento_id bigint`, `posicao_esperada jsonb`, `idempotencia uuid` | `text` com NP | Chave + fingerprint | Locks de patrimônio/equipamento; índice único parcial por equipamento; compara posição atual no backend. |
| `patrimonio_corrigir_vinculo` | Corrigir etiqueta colada no equipamento errado antes da conferência. | Administrador | `patrimonio_public_id text`, `novo_equipamento_id bigint`, `motivo text`, `idempotencia uuid` | `text` com NP | Chave + fingerprint | Locks ordenados de patrimônio/equipamentos; motivo obrigatório; `aplicado` retorna controladamente a `vinculado`; conferido é imutável. |
| `patrimonio_aplicar_etiqueta` | Confirmar aplicação física depois do vínculo. | Administrador, Operador | `patrimonio_public_id text`, `idempotencia uuid` | `text` com NP | Chave + fingerprint | `FOR UPDATE` no patrimônio; só `vinculado → aplicado`. |
| `patrimonio_conferir_etiqueta` | Registrar segunda leitura independente do conjunto etiqueta/equipamento. | Administrador, Operador | `patrimonio_public_id text`, `equipamento_id_esperado bigint`, `identificador_lido text`, `metodo text`, `idempotencia uuid` | `text` com NP | Chave + fingerprint | `FOR UPDATE`; exige `aplicado`, mesmo equipamento e identificador lido válido; só então `conferido`. |
| `patrimonio_reimprimir_etiqueta` | Auditar reimpressão excepcional de uma identidade. | Administrador, Operador | `patrimonio_public_id text`, `motivo text`, `idempotencia uuid` | `text` com NP | Chave + fingerprint | Lock do patrimônio; motivo obrigatório; não muda identidade/vínculo. |
| `patrimonio_anular` | Encerrar NP inválido sem reutilizá-lo. | Administrador | `patrimonio_public_id text`, `motivo text`, `idempotencia uuid` | `text` com NP | Chave + fingerprint | Lock do patrimônio; motivo; transição terminal; código permanece reservado. |
| `patrimonio_baixar` | Dar baixa lógica mantendo vínculo e histórico. | Administrador | `patrimonio_public_id text`, `motivo text`, `idempotencia uuid` | `text` com NP | Chave + fingerprint | Lock do patrimônio; somente conferido; transição terminal e sem `DELETE`. |
| `patrimonio_resolver_item_campanha_excecao` | Encerrar membro do snapshot por exceção classificada e motivada. | Administrador | `campanha_item_id uuid`, `tipo text`, `motivo text`, `idempotencia uuid` | `uuid` do item | Chave + fingerprint | `FOR UPDATE` no item; tipos fechados; resolução não remove o snapshot. |
| `patrimonio_concluir_lote` | Fechar lote quando todas as identidades estiverem resolvidas. | Administrador | `lote_id uuid`, `idempotencia uuid` | `uuid` do lote | Chave + fingerprint | `FOR UPDATE`; quantidade criada deve coincidir e nenhuma identidade pode ficar pendente. |
| `patrimonio_cancelar_lote` | Cancelar somente intenção ainda sem NP gerado. | Administrador | `lote_id uuid`, `motivo text`, `idempotencia uuid` | `uuid` do lote | Chave + fingerprint | `FOR UPDATE`; somente `preparado` e sem identidade criada; não devolve números. |
| `patrimonio_concluir_campanha` | Encerrar campanha quando nenhum membro do snapshot estiver pendente. | Administrador | `campanha_id uuid`, `idempotencia uuid` | `uuid` da campanha | Chave + fingerprint | `FOR UPDATE`; todos os itens precisam estar `conferido` ou `excecao`. |
| `patrimonio_cancelar_campanha` | Cancelar campanha ativa sem apagar histórico, lotes ou NPs. | Administrador | `campanha_id uuid`, `motivo text`, `idempotencia uuid` | `uuid` da campanha | Chave + fingerprint | `FOR UPDATE`; motivo obrigatório; estado terminal. |
| `patrimonio_resolver_public_id` | Resolver deep link autenticado sem tratar QR como credencial. | Administrador, Operador; Gerente em resposta neutra/escopo | `public_id text` | Tabela com estado e dossiê permitido | Não se aplica; somente leitura `STABLE` | `SECURITY DEFINER` fail-closed; token URL-safe de 22 caracteres; inexistente/fora do escopo retorna vazio; gerente não recebe lote/campanha. |

## 8. Matriz de acesso

`✓` permitido; `escopo` permitido somente no recorte operacional já autorizado;
`—` não permitido.

| Capacidade | Administrador | Operador | Gerente | Consulta | Anônimo |
| --- | :---: | :---: | :---: | :---: | :---: |
| Ler catálogo | ✓ | ✓ | ✓ | ✓ | — |
| Ler campanha/lotes agregados | ✓ | ✓ | — | — | — |
| Ler patrimônio/legado/eventos | ✓ | ✓ | escopo | — | — |
| Resolver deep link | ✓ | ✓ | escopo | — | — |
| Criar/concluir/cancelar campanha | ✓ | — | — | — | — |
| Preparar/gerar/cancelar/concluir lote | ✓ | — | — | — | — |
| Registrar impressão | ✓ | ✓ | — | — | — |
| Vincular/aplicar/conferir | ✓ | ✓ | — | — | — |
| Corrigir vínculo | ✓ | — | — | — | — |
| Importar legado | ✓ | — | — | — | — |
| Anular/baixar/resolver exceção | ✓ | — | — | — | — |
| Cadastrar equipamento futuro | ✓ | ✓ | escopo | — | — |
| DML direto em tabelas/sequences | — | — | — | — | — |

O grant de uma RPC para `authenticated` não concede a operação por si só. Cada
RPC revalida papel, escopo e pré-condições no backend.

## 9. RLS e autoria

### Leitura

- administrador e operador enxergam o domínio operacional completo;
- gerente enxerga somente identidades, legados e eventos ligados a equipamentos
  que já pertencem ao seu recorte de gerente/rotas;
- gerente não recebe agregados de campanha/lote que possam revelar outro
  recorte;
- consulta não recebe o domínio patrimonial operacional nesta fase, exceto o
  catálogo já autorizado;
- anônimo não lê nenhuma identidade ou evento.

### Escrita

- tabelas e sequences começam com `REVOKE ALL` para papéis cliente;
- não existem policies de `INSERT`, `UPDATE` ou `DELETE` de cliente;
- mutações passam por RPCs `SECURITY DEFINER` com `search_path` fixo;
- helpers privados não são executáveis por papéis cliente;
- a tabela de idempotência não é legível pelo cliente;
- eventos não aceitam edição ou exclusão, inclusive por RPC operacional.

### Autoria

Cada evento preserva `user_id`, nome e perfil como snapshots derivados no
backend. Valores de formulário como `responsavel` ou `gerente_responsavel` são
dados de negócio, não prova de autoria.

## 10. Idempotência e locks

| Situação concorrente | Resultado esperado |
| --- | --- |
| Mesma chave + mesmo payload | mesmo resultado, nenhum novo NP/evento |
| Mesma chave + payload diferente | erro de conflito |
| Dois vínculos para a mesma etiqueta | apenas um vence |
| Duas etiquetas para o mesmo equipamento | apenas um patrimônio ativo vence |
| Duas gerações do mesmo lote | apenas uma faixa é criada |
| Aplicar enquanto outro cancela lote | lock serializa; cancelamento incompatível falha |
| Falha depois de consumir sequence | transação volta; lacuna pode permanecer; número não volta |

As RPCs devem travar a menor unidade capaz de preservar a invariável: campanha,
lote, patrimônio e/ou equipamento. Locks não substituem índices únicos.

## 11. Matriz de privacidade dos artefatos

| Artefato | NP | `public_id`/QR | Equipamento | Posição | Marcação SAMPLE |
| --- | :---: | :---: | :---: | :---: | :---: |
| Etiqueta livre | ✓ | ✓ | — | — | ✓ |
| Calibração | amostra | amostra | — | — | ✓, “não usar” |
| Relatório de rota | — | — | ✓ | atual | ✓ |
| Relatório final | ✓ | opcional conforme necessidade | ✓ | atual | ✓ |

## 12. Matriz de validação local

| Gate | Evidência mínima |
| --- | --- |
| Schema | migrations aplicam em banco local vazio |
| Zero DML | sequences virgens e tabelas operacionais vazias após migration |
| Regras/RLS | suíte SQL transacional passa para todos os papéis |
| Concorrência | roteiro de duas conexões passa |
| Modelo JS | testes de fixtures, lote livre, vínculo e cadastro atômico passam |
| Isolamento | harness sem Supabase/rede/storage e protegido por DEV |
| Build | preview não aparece no artefato de produção |
| UX | Light/Dark, teclado, foco, reduced motion e breakpoints aprovados |
| PDF | quatro tipos gerados, renderizados em PNG e inspecionados |
| Git | `git diff --check` limpo e nenhum segredo/debug |
