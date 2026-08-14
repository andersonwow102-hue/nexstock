# DEVEDORES — concorrência real da Fase 2

Executar somente em Supabase local descartável, nunca em ambiente remoto. Cada cenário exige duas conexões PostgreSQL independentes e `ON_ERROR_STOP=1`.

## Ordem obrigatória dos locks

Toda RPC que altera estado financeiro deve bloquear, nesta ordem:

1. `devedores_dividas`;
2. `devedores_negociacoes`;
3. `devedores_pagamentos`, quando aplicável;
4. `devedores_parcelas`, quando aplicável.

## Pagamentos concorrentes

1. Criar negociação ativa com saldo fictício de R$ 100,00.
2. Nas conexões A e B, iniciar transações como o mesmo operador e usar a mesma versão.
3. A registra R$ 70,00 e mantém a transação aberta.
4. B tenta registrar R$ 70,00 e deve aguardar o lock.
5. Confirmar A. B deve falhar com SQLSTATE `40001`.
6. Confirmar saldo de R$ 30,00, um pagamento e uma trilha financeira.

## Negociações concorrentes

1. Usar dívida sem negociação.
2. A e B chamam `devedores_criar_negociacao` com a mesma versão e chaves diferentes.
3. Apenas uma confirma; a outra falha com SQLSTATE `40001` depois do lock.
4. Deve existir uma única negociação ativa.

## Idempotência concorrente

1. Repetir a mesma chamada em duas conexões com o mesmo usuário, chave e payload.
2. Ambas devem retornar o mesmo identificador.
3. Deve existir um único efeito financeiro.
4. Repetir a chave com payload diferente deve falhar com SQLSTATE `22023`.

## Substituição simultânea com pagamento

1. Criar negociação ativa sem pagamentos.
2. A inicia a substituição e mantém a transação aberta após a RPC.
3. B tenta pagar a negociação antiga.
4. B deve aguardar a dívida, sem deadlock `40P01`.
5. Após A confirmar, B deve falhar porque a negociação antiga deixou de estar ativa.
6. Deve restar uma negociação ativa, uma substituída e nenhum pagamento incoerente.
