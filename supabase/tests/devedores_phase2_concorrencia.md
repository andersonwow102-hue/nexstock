# DEVEDORES — concorrência real da Fase 2

Executar somente no Supabase local descartável, nunca em ambiente remoto. O teste usa duas conexões PostgreSQL independentes.

## Pagamentos concorrentes

1. Criar uma negociação ativa com saldo fictício de R$ 100,00.
2. Nas conexões A e B, iniciar transações como o mesmo operador e ler a mesma versão.
3. A registra R$ 70,00 e mantém a transação aberta.
4. B tenta registrar R$ 70,00 com a mesma versão; deve aguardar o lock.
5. Confirmar A. B deve falhar com SQLSTATE `40001` e não criar pagamento ou histórico.
6. Confirmar saldo R$ 30,00 e apenas um pagamento válido.

## Negociações concorrentes

1. Usar uma dívida fictícia sem negociação.
2. A e B chamam `devedores_criar_negociacao` com a mesma versão e chaves diferentes.
3. Apenas uma chamada pode confirmar. A outra deve falhar após o lock por versão ou negociação ativa.
4. Confirmar uma única negociação ativa, parcelas de uma única negociação e uma única trilha de auditoria confirmada.

## Idempotência concorrente

1. Repetir a mesma chamada em duas conexões com o mesmo usuário e chave de idempotência.
2. Ambas devem convergir para o mesmo identificador ou uma delas deve aguardar e então recuperar o registro existente.
3. Nunca podem existir dois efeitos financeiros para a mesma chave.
