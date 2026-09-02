# NEPTERA — Patrimônio Fase 1 · Marco A

## Status e limite desta entrega

O Marco A deixa a arquitetura local pronta para revisão. Ele **não autoriza**
homologação ou produção. Nesta execução:

- nenhuma migration foi aplicada no Supabase remoto;
- nenhuma variável de ambiente, RLS remota ou dado real foi alterado;
- nenhum NP real foi emitido;
- nenhum código legado foi importado;
- nenhum órfão de localização foi corrigido;
- nenhum push ou deploy faz parte do marco.

As migrations são estruturais: ao serem apenas versionadas, não fazem backfill,
não criam campanha, lote, patrimônio ou evento e não consomem a sequência NP.

Documentos complementares:

- [matrizes de domínio, estados e acesso](./patrimonio-fase1-matrizes.md);
- [runbooks operacionais e de incidente](./patrimonio-fase1-runbooks.md).

## Base auditada usada pelas fixtures

| Recorte | Quantidade | Tratamento |
| --- | ---: | --- |
| Equipamentos totais | 488 | Base fictícia equivalente ao snapshot auditado |
| Categorias patrimoniáveis | 454 | Membros da campanha inicial |
| Máquina de Brindes | 34 | Não recebe novo `NP-*` |
| Referências anteriores | 66 | Campo separado da identidade NP |
| Legados em Máquina de Brindes | 8 | Preservados, sem torná-las patrimoniáveis |
| Localizações órfãs | 8 | Entram na campanha/meta como revisão logística; não recebem vínculo até correção pelo fluxo oficial de movimentação |

Os 454 IDs da campanha, inclusive os oito em revisão logística, formam um
snapshot **somente de pertença**. Nome,
status, vínculo e posição não são congelados na campanha: a posição exibida deve
continuar vindo do módulo Equipamentos. Esse limite evita transformar campanha
em uma segunda fonte de verdade logística.

## Decisões canônicas

### Identidade patrimonial

- `NP-000001` é o primeiro número da série real quando a sequência virgem for
  usada em ambiente autorizado.
- A numeração é global, monotônica, não cíclica e nunca reutilizada.
- Lacunas após falha ou rollback são aceitáveis; renumerar é proibido.
- O NP canônico e a referência anterior são campos diferentes. Um equipamento
  pode exibir ambos sem sobrescrever o legado.
- Um patrimônio ativo tem no máximo um equipamento e um equipamento tem no
  máximo um patrimônio ativo.
- Um registro baixado ou anulado permanece histórico e não libera seu número.

### Identificador público e QR

O contrato escolhido usa `public_id` opaco e compacto, com 22 caracteres
URL-safe e aproximadamente 128 bits de entropia no backend real. O harness usa
tokens determinísticos apenas para tornar os testes reproduzíveis.

| Opção | Comprimento do identificador | Entropia | Leitura física do QR | Decisão |
| --- | ---: | ---: | --- | --- |
| UUID textual | 36 caracteres | 122–128 bits, conforme a versão | mais módulos para o mesmo tamanho impresso | descartado para a etiqueta |
| Base64url compacto | 22 caracteres | 128 bits | menos denso, mantendo margem de segurança equivalente | escolhido |

O identificador compacto só é aceitável se vier de gerador criptográfico no
backend; reduzir caracteres por truncamento, contador ou hash previsível é
proibido. Entre `/p/<public_id>` e `/patrimonio/<public_id>`, foi escolhida a
segunda rota: ela é autoexplicativa para suporte e operação, e o pequeno custo
de caracteres não justifica perder clareza no endereço permanente.

Formato do deep link:

```text
https://neptera.vercel.app/patrimonio/<public_id>
```

O QR contém somente essa rota. Não contém NP, ID do equipamento, nome, posição,
credencial ou outro dado operacional. A rota deve exigir autenticação antes de
consultar o patrimônio, preservar o destino durante o login e responder de modo
genérico quando o item não existir ou não estiver no escopo do usuário.

### Campanha e lote medem coisas diferentes

- **Campanha** mede quais equipamentos pertencem ao esforço de implantação.
- **Lote** mede identidades/etiquetas físicas e seu progresso.
- Gerar um lote cria etiquetas livres com `equipamento_id = NULL`.
- O relatório de rota pode listar equipamentos candidatos, mas não pré-associa
  um NP a cada linha.
- O vínculo definitivo ocorre somente no uso do QR/código em campo.

## Fluxos oficiais

### Equipamento já existente

```text
campanha/snapshot de pertença
  → preparar quantidade/contexto do lote
  → confirmar e gerar NP + public_id livres
  → imprimir etiqueta
  → ler QR e autenticar
  → escolher contexto e equipamento elegível
  → vincular atomicamente
  → aplicar fisicamente
  → conferir por segunda leitura
```

Vincular, aplicar e conferir são operações e eventos independentes. Confirmar
sem aplicação anterior é inválido. A posição esperada é conferida no vínculo;
uma divergência não é “corrigida” pelo Patrimônio: ela volta ao fluxo oficial de
movimentação de Equipamentos.

### Equipamento futuro

```text
cadastro do equipamento
  → se a categoria for patrimoniável:
      criar NP + public_id e vincular na mesma transação
  → etiqueta pendente
  → imprimir
  → aplicar
  → conferir
```

Não existe sucesso parcial: falha na identidade patrimonial desfaz também o
cadastro do equipamento daquela transação. Cadastro múltiplo segue a mesma
regra. `Máquina de Brindes` cria somente o equipamento e não consulta nem
consome a sequência NP.

## Modelo lógico

As migrations locais organizam as responsabilidades em seis grupos:

1. catálogo de categorias e regra de elegibilidade;
2. sequência global de NP e sequência de lote;
3. campanhas e membros do snapshot de pertença;
4. lotes e identidades livres originadas pelo lote;
5. identidade canônica, referências anteriores e integração com Equipamentos;
6. eventos append-only, idempotência, RPCs, RLS e grants.

Os nomes e assinaturas efetivos devem sempre ser conferidos no diff das
migrations. Nenhum cliente deve depender de escrita direta nas tabelas.

### Matriz nominal das migrations

A ordem abaixo é obrigatória. Todas são **aditivas** e não possuem `down`
automático: antes de existir dado real, uma reversão técnica deve remover os
objetos na ordem inversa; depois de qualquer homologação, reversão passa a
exigir plano explícito de preservação e nunca deve apagar histórico.

| Ordem / arquivo | Objetivo e objetos principais | Dependências | Reversibilidade e impacto local |
| --- | --- | --- | --- |
| `202609010900_patrimonio_catalogo.sql` | Cria `equipamento_categorias` e semeia o catálogo fechado de nove categorias, incluindo a regra não patrimoniável de Máquina de Brindes. | Tabelas existentes não são alteradas. | Reversível apenas enquanto não houver referências. Único seed estático; não toca equipamentos reais. |
| `202609010910_patrimonio_sequencia.sql` | Cria as sequences privadas `patrimonio_np_seq` e `patrimonio_lote_seq`, globais, monotônicas e sem ciclo. | Nenhuma dependência patrimonial anterior. | Pode ser removida antes de uso. Criar a sequence não consome NP; lacunas futuras são válidas e não reversíveis por renumeração. |
| `202609010920_patrimonio_lotes.sql` | Cria campanhas, itens do snapshot de pertença e lotes, com índices e invariantes de situação/quantidade/autoria. | Catálogo; `equipamentos`; identidade de usuários já existente. | Tabelas nascem vazias; sem campanha, lote ou associação real. Remover somente em ordem inversa e sem dados. |
| `202609010930_equipamentos_patrimonio.sql` | Cria gerador criptográfico do `public_id`, identidade NP canônica, vínculo opcional ao equipamento, índices de unicidade ativa e referências legadas separadas. | Catálogo, lotes/campanhas, sequences, `equipamentos` e `pgcrypto`. | Não importa legado nem cria NP. Após identidades reais, rollback destrutivo é proibido. |
| `202609010940_patrimonio_eventos_protecao.sql` | Cria idempotência, eventos append-only, validações de alvo/transição e triggers que vedam escrita direta no domínio patrimonial, `DELETE`, mudança indevida de categoria e alteração direta do legado. | Todas as tabelas anteriores e contexto privado de execução. | Pode ser retirada antes do uso; após eventos reais, eles devem ser preservados. Impacto: endurece o domínio novo, sem backfill e sem bloquear antecipadamente o cadastro legado atual. |
| `202609010950_patrimonio_rpc_geracao.sql` | Cria helpers privados e RPCs de campanha, preparação/geração/impressão de lote, importação controlada de legado e cadastro atômico de equipamentos. | Proteções/eventos, sequences, perfis e tabelas operacionais existentes. | Funções podem ser substituídas/retiradas antes da integração. Nenhuma é executada pela migration. |
| `202609011000_patrimonio_rpc_fluxo.sql` | Cria RPCs de vínculo, correção, aplicação, conferência, reimpressão, anulação, baixa, exceções e conclusão/cancelamento de lote/campanha. | Helpers e RPCs da etapa anterior. | Funções são reversíveis antes do consumo; estados/eventos produzidos futuramente não podem ser apagados para “voltar”. |
| `202609011010_patrimonio_rls_grants.sql` | Ativa RLS, cria políticas, views operacionais, resolução autenticada do deep link e grants mínimos por função. | Todas as tabelas/RPCs; `auth.uid()`, perfis, gerentes, pontos e equipamentos existentes. | Políticas/grants/views podem ser substituídos. Impacto: fecha acesso direto e expõe somente leitura/RPC autorizada. |

O conjunto não contém backfill operacional, criação de campanha/lote, emissão de
NP ou importação de referência anterior. O `INSERT` do primeiro arquivo é
somente o catálogo estrutural fechado; nenhuma linha de equipamento, patrimônio
ou evento é criada.

### Gate de integração do cadastro futuro

A RPC de cadastro atômico está pronta e testada, mas o formulário real de
Equipamentos continua deliberadamente fora do Marco A. Enquanto esse consumidor
não for migrado, o `INSERT` legado em `equipamentos` permanece compatível e pode
criar um equipamento patrimoniável sem NP. Portanto, “ativar cadastro futuro
com NP automático” exige um cutover coordenado em etapa posterior: migrar todos
os consumidores para `patrimonio_cadastrar_equipamentos`, adicionar a vedação
do caminho legado no mesmo rollout e executar novamente a regressão completa.
Aplicar apenas estas migrations não equivale a ativar esse contrato.

## Segurança, autoria e concorrência

- Clientes autenticados recebem somente leitura compatível com seu papel e
  execução das RPCs explicitamente concedidas.
- `anon` não recebe leitura patrimonial nem execução operacional.
- Tabelas, sequences e helpers privados não aceitam DML direto de clientes.
- RPCs `SECURITY DEFINER` usam `search_path` fixo, validam o papel atual e
  derivam autoria de `auth.uid()` e do perfil persistido.
- O frontend nunca envia executor, nome de ator ou timestamp confiável.
- Eventos são append-only; correções geram eventos compensatórios.
- Chaves idempotentes são vinculadas à operação e ao payload. Repetição idêntica
  devolve o resultado existente; reutilização com payload diferente falha.
- Locks de linha e restrições únicas protegem lote, identidade livre e
  equipamento em disputas concorrentes.
- Exclusão física do equipamento é bloqueada depois que houver identidade
  patrimonial histórica; o ciclo passa a usar baixa, nunca `DELETE`.

A matriz detalhada está em `patrimonio-fase1-matrizes.md`.

## Harness local

O preview `patrimonio-v1.html` é um laboratório DEV-only. Ele mantém tudo em
memória, usa fixtures e não importa Supabase, autenticação, App real, câmera,
storage ou serviço de rede.

As três áreas superiores são:

1. **Visão geral** — campanha, fila de ação, Inventory Ledger e dossiê;
2. **Lotes** — preparação, geração livre, impressão e artefatos;
3. **Implantação** — leitura, contexto, equipamento, vínculo, aplicação e
   conferência.

O seletor local cobre campanha, ledger, dossiê, legado + NP, Máquina de Brindes,
cadastro simples/múltiplo, lote aberto, ativação mobile, Bar do Sávio,
aplicação, conferência, concluído, divergência, vazio e erro. Light/Dark,
teclado, foco visível e `prefers-reduced-motion` fazem parte do contrato.

O build de produção não deve tornar o harness navegável. O gate de isolamento
confere proteção por `import.meta.env.DEV` e ausência do HTML de preview no
artefato final.

## Artefatos SAMPLE

Os PDFs locais são deliberadamente inválidos para operação real e devem trazer
marcação visível de amostra:

- etiquetas livres, sem equipamento ou posição;
- folha de calibração, marcada como não utilizável;
- relatório de rota pré-associação, sem NP por equipamento;
- relatório final pós-implantação, com a associação que realmente ocorreu.

Antes de piloto, material, dimensões, margens, escala da impressora e leitura do
QR precisam ser calibrados fisicamente.

## Gates para sair do Marco A

Todos os gates abaixo são locais e não promovem o schema:

1. revisar o diff e confirmar que não há DML operacional/backfill além do seed
   estrutural explícito do catálogo;
2. iniciar banco local descartável e aplicar o bootstrap mínimo;
3. aplicar migrations em ordem e verificar sequência virgem;
4. executar testes SQL de regras, RLS e concorrência;
5. executar testes JS específicos, suíte completa, lint e build;
6. executar `git diff --check` e auditoria de segredos/debug;
7. validar harness em Light/Dark e breakpoints aprovados;
8. renderizar cada PDF para PNG e revisar visualmente;
9. aprovar formalmente schema, políticas, papel por operação e runbooks;
10. somente em prompt posterior planejar homologação controlada.

## Dívidas e decisões futuras

Não resolver no Marco A:

- migrar localização textual para `ponto_id` canônico;
- reconciliar fisicamente os 66 códigos anteriores;
- resolver os 8 órfãos pelo módulo Equipamentos;
- integrar scanner/câmera real e tratamento offline;
- integrar Global Search e o App real;
- definir baixa contábil/fiscal além do ciclo patrimonial técnico;
- calibrar impressora, papel e material definitivos;
- definir retenção e exportação legal dos eventos;
- decidir quando e como remover o espelho de compatibilidade legado;
- elaborar rollout gradual após homologação.

## Critério de encerramento

Marco A termina com arquitetura, harness, testes, documentação e artefatos
locais revisáveis. Ele não termina com migration remota, dados reais, campanha
real, piloto físico, push ou deploy.
