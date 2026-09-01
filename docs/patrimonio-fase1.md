# NEPTERA — Patrimônio Fase 1

## Limite desta entrega

Esta fase é exclusivamente local. As migrations não foram aplicadas em projeto
Supabase remoto, nenhum código patrimonial real foi gerado, nenhum legado foi
importado e nenhuma localização órfã foi corrigida.

O snapshot operacional aprovado permanece apenas como referência de projeto:

- 488 equipamentos;
- 454 de categorias patrimoniáveis;
- 34 Máquinas de Brindes não patrimoniáveis para novas emissões;
- 66 códigos legados preservados, sendo 8 em Máquinas de Brindes;
- 396 patrimoniáveis sem código;
- 388 prontos para lote e 8 em revisão por localização órfã;
- nova série ainda virgem: `NP-000001`.

## Contrato canônico

- `equipamento_categorias`: catálogo fechado das nove categorias atuais.
- `patrimonio_lotes`: lote permanente, código `PAT-AAAAMM-NNNN`, marcos e
  snapshots de autoria.
- `patrimonio_lote_equipamentos`: seleção e snapshots validados; preparar não
  consome a sequência NP.
- `equipamentos_patrimonio`: fonte de verdade permanente; no máximo um registro
  ativo por equipamento e FK `ON DELETE RESTRICT` depois que o patrimônio existe.
- `patrimonio_eventos`: trilha append-only, com autoria derivada da sessão.
- `patrimonio_np_seq`: sequência não cíclica iniciada em 1. Saltos são válidos e
  números consumidos nunca retornam.

`equipamentos.patrimonio` permanece somente como espelho de compatibilidade. As
RPCs patrimoniais são as únicas responsáveis por alterá-lo.

## Permissões

| Perfil | Leitura | Mutação patrimonial |
| --- | --- | --- |
| Administrador | escopo completo | ciclo completo por RPC |
| Operador | escopo completo | aplicar e conferir |
| Gerente | somente equipamentos já visíveis no seu estoque/rotas | nenhuma |
| Consulta | nenhuma nesta fase, preservando a policy vigente de Equipamentos | nenhuma |
| Anônimo | nenhuma | nenhuma |

Não há `INSERT`, `UPDATE`, `DELETE` ou uso direto das sequences para clientes.
As funções `SECURITY DEFINER` usam `search_path` fixo e extraem identidade de
`auth.uid()` + `perfis`; o frontend não fornece executor.

Os testes locais incluem uma suíte transacional de regras/RLS e um roteiro SQL
executável com duas conexões `dblink`, cobrindo disputa pelo mesmo equipamento,
idempotência paralela e cancelamento concorrente após aplicação. Uma falha
instrumentada depois de `nextval()` comprova rollback atômico e lacunas sem
reutilização.

## Regras de implantação

- Máquina de Brindes nunca recebe novo `NP-*`.
- Um legado só pode ser importado quando já existe literalmente no espelho do
  equipamento; caixa e conteúdo são preservados e o namespace `NP-999999` é
  reservado à geração.
- Importar legado não inventa aplicação nem conferência física.
- Localização é validada contra Ponto somente quando o equipamento está
  efetivamente `Em rota` com localização preenchida.
- O lote confirmado contém apenas itens válidos e é gerado de forma atômica.
- Aplicação e conferência são operações e eventos separados.
- Patrimônio baixado ou anulado continua armazenado e seu código nunca é
  reutilizado.

## Harness e artefatos

O harness `patrimonio-v1.html` é uma entrada isolada por
`import.meta.env.DEV`. Ele usa 488 fixtures equivalentes ao snapshot, mantém
tudo em memória e não importa Supabase, autenticação ou o aplicativo real.

Os geradores locais produzem:

- folha A4 de etiquetas configurável em milímetros;
- folha A4 de calibração;
- relatório logístico A4 sem cidade;
- QR contendo apenas o deep link público por `public_id`.

## Riscos residuais antes de homologação

1. O vínculo operacional com Ponto ainda depende do nome textual de
   `equipamentos.localizacao`; a migração futura para `ponto_id` deve ser um
   projeto separado.
2. A invariável de ownership entre tabelas e funções `SECURITY DEFINER` deve ser
   verificada no ambiente alvo antes de aplicar as migrations.
3. Lotes mistos exigem atenção ao recorte de leitura do gerente; as policies da
   Fase 1 não devem expor agregados de rotas fora do seu escopo.
4. Lacunas na sequência podem ocorrer após falhas posteriores a `nextval()` e
   são intencionais.
5. Dimensões, material e impressora das etiquetas precisam ser calibrados com a
   folha A4 antes de qualquer piloto.
6. Os 66 códigos legados não têm conferência física presumida; importação e
   validação devem ser etapas distintas.
7. Cadastro automático, cadastro em quantidade, Global Search e scanner interno
   permanecem fora desta fase.
8. A UX geral de exclusão física ainda precisa evoluir para Baixa patrimonial;
   a FK já impede apagar equipamento depois que o registro canônico existir.

## Plano controlado do piloto

1. Reexecutar bootstrap, migrations, testes RLS e concorrência em banco local
   descartável, partindo das sequences virgens.
2. Revisar o diff SQL e aprovar formalmente schema, RPCs e matriz de acesso.
3. Aplicar somente em homologação e confirmar que nenhum backfill ocorre.
4. Fazer dry-run dos 66 legados; importar apenas após reconciliar literalmente
   cada código e manter todos como `legado`, sem marcos físicos inventados.
5. Resolver separadamente os 8 órfãos e auditar novamente os 388 elegíveis.
6. Calibrar papel/impressora e escolher um lote piloto pequeno e explícito,
   cobrindo categorias e posições distintas, sem Máquina de Brindes.
7. Gerar, imprimir, aplicar e conferir o piloto com relatório logístico; comparar
   sistema, etiqueta e equipamento físico antes de concluir o lote.
8. Auditar eventos, autoria, espelho, busca, baixa e bloqueio de DELETE.
9. Somente após aceite do piloto, planejar lotes graduais para o restante da base.

Nenhuma dessas etapas de homologação ou produção faz parte da Fase 1 local.
