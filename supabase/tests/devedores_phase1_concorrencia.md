# DEVEDORES — teste local de concorrência da Fase 1

Este roteiro exige PostgreSQL/Supabase local descartável, com as migrations aplicadas. Não deve ser executado em produção. Use duas sessões `psql` com `ON_ERROR_STOP` habilitado e dados exclusivamente fictícios.

## Preparação

1. Cadastre uma dívida fictícia com a RPC da Fase 1.
2. Consulte o identificador do relatório e sua versão atual.
3. Abra duas conexões locais autenticadas como o mesmo gerente responsável.

## Conexão A

1. Inicie uma transação.
2. Leia e anote a versão do relatório.
3. Execute `devedores_corrigir_relatorio_gerente` com essa versão.
4. Confirme a transação.

## Conexão B

1. Antes da confirmação de A, inicie uma transação e leia a mesma versão original.
2. Depois da confirmação de A, execute a correção usando a versão antiga.
3. A chamada deve falhar com SQLSTATE `40001`.
4. Reverta a transação.

## Verificação

- O relatório e `relatorio_snapshot` devem conter somente os dados confirmados pela conexão A.
- A versão deve ter sido incrementada apenas uma vez.
- O histórico deve conter apenas o evento confirmado por A.
- A tentativa rejeitada de B não pode criar histórico nem alteração parcial.

O teste sequencial de stale version em `devedores_phase1_rls.sql` valida o contrato de versão, mas não substitui este teste com duas conexões reais.
