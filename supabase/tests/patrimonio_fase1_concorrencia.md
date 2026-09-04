# Patrimônio Fase 1 — concorrência local

`patrimonio_fase1_concorrencia.sql` é o teste executável complementar à suíte
RLS. Ele usa `dblink` para manter duas transações independentes e deve rodar
somente em PostgreSQL local descartável, nunca no Supabase remoto.

## Pré-condições

1. Crie um banco local vazio.
2. Aplique `bootstrap_patrimonio_local.sql`.
3. Aplique, em ordem, as migrations `202609010900` a `202609021100`.
4. Execute o script com a trava explícita:

```powershell
psql -v ON_ERROR_STOP=1 -v patrimonio_local_confirmado=1 `
  -v patrimonio_dblink_conn="host=127.0.0.1 port=5432" `
  -d patrimonio_concurrency `
  -f supabase/tests/patrimonio_fase1_concorrencia.sql
```

O teste grava somente usuários, equipamentos e operações fictícias no banco
local e remove os helpers temporários ao final. Descarte o banco depois da
execução, pois sequências PostgreSQL não revertem `nextval()`.

## Garantias exercitadas

- dois preparos concorrentes não podem reservar quantidade superior à meta do
  snapshot da campanha;
- o corte da campanha bloqueia cadastro concorrente durante contagem e
  materialização, mantendo `quantidade_snapshot` igual ao número de membros;
- o perdedor da reserva falha antes de consumir número de lote;
- duas gerações com a mesma chave aguardam o advisory lock, retornam o mesmo
  JSON e não duplicam NPs nem eventos;
- duas etiquetas livres não podem ser vinculadas ao mesmo equipamento ativo;
- a etiqueta perdedora permanece `disponivel` e nenhum número NP adicional é
  consumido;
- o mesmo NP livre não pode ser vinculado simultaneamente a dois equipamentos;
- dois cadastros patrimoniáveis simultâneos criam equipamento + NP de forma
  atômica, sem colisão de número, código ou `public_id`;
- geração de lote e cadastro futuro concorrentes compartilham a mesma sequência
  NP global, sem namespace paralelo nem reutilização;
- cancelamento e geração do mesmo lote são serializados pelo lock da linha;
- após o cancelamento vencer, a geração falha sem criar etiqueta nem avançar a
  sequência NP.

O resultado final esperado é:

```text
OK: reservas, idempotencia, vinculos, cadastros, sequencia e cancelamento concorrentes validados.
```
