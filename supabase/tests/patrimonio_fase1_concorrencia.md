# Patrimônio Fase 1 — roteiro local de concorrência

Este roteiro complementa `patrimonio_fase1_rls.sql`. Um único bloco SQL não
consegue provar espera entre transações independentes. Execute apenas em um
Supabase local descartável, nunca no remoto. Use dois terminais `psql` com
`ON_ERROR_STOP=1` e dados fictícios. Recrie o banco ao terminar, porque
`nextval()` não volta com `ROLLBACK`.

## Pré-condições

1. Aplique `bootstrap_patrimonio_local.sql` se o banco local estiver vazio.
2. Aplique as migrations `202609010900` a `202609011010`.
3. Crie um administrador fictício, um ponto válido e um equipamento fictício
   de categoria `Terminais`, sem `patrimonio`.
4. Como administrador autenticado, prepare dois lotes diferentes contendo o
   mesmo `equipamento_id`; não gere nenhum deles ainda.

Guarde os UUIDs como `LOTE_A` e `LOTE_B`. Use chaves de idempotência distintas.

## Disputa pelo mesmo equipamento

Sessão A:

```sql
begin;
select set_config('request.jwt.claim.sub', 'UUID_ADMIN_FICTICIO', true);
set local role authenticated;
select public.patrimonio_gerar_lote('LOTE_A', 'UUID_IDEMPOTENCIA_A');
-- Mantenha a transação aberta antes do COMMIT.
```

Sessão B, enquanto A permanece aberta:

```sql
begin;
select set_config('request.jwt.claim.sub', 'UUID_ADMIN_FICTICIO', true);
set local role authenticated;
select public.patrimonio_gerar_lote('LOTE_B', 'UUID_IDEMPOTENCIA_B');
```

Resultado esperado: B aguarda o lock da linha de `equipamentos`. Faça `commit`
em A. B então falha com `23505` antes de chamar `nextval()`, porque passa a ver
o patrimônio ativo criado por A. Finalize B com `rollback`.

Confirme em uma terceira sessão:

```sql
select equipamento_id, count(*) filter (
  where situacao not in ('baixado', 'anulado')
) as ativos
from public.equipamentos_patrimonio
group by equipamento_id
having count(*) filter (
  where situacao not in ('baixado', 'anulado')
) > 1;
```

A consulta deve retornar zero linhas. A sequência deve ter avançado somente
pela geração vencedora.

## Mesma chave de idempotência em paralelo

Prepare um terceiro lote fictício. Nas duas sessões, chame
`patrimonio_gerar_lote` para esse mesmo lote, pelo mesmo usuário e com a mesma
chave. A segunda sessão deve aguardar o advisory lock e depois retornar o mesmo
`lote_id`, sem novo evento, novo registro canônico ou novo número.

Repita usando a mesma chave mas payload/alvo diferente. Depois da espera, a
segunda chamada deve falhar com `22023`.

## Falha após reserva e lacunas

A atomicidade de linhas e espelhos é transacional; a sequência PostgreSQL não
é. Para testar uma falha posterior a `nextval()` sem alterar código de produção,
use um clone local instrumentado com um trigger de teste que lance exceção no
segundo `UPDATE public.equipamentos` da geração. Resultado esperado:

- zero linhas do lote em `equipamentos_patrimonio`;
- nenhum espelho alterado em `equipamentos.patrimonio`;
- lote ainda `preparado`;
- números eventualmente consumidos viram lacunas e nunca são reutilizados.

Remova o trigger de teste descartando/recriando o banco local; não transforme
essa instrumentação em migration.

