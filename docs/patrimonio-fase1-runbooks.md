# Patrimônio Fase 1 — Runbooks controlados

Todos os procedimentos deste documento param antes de homologação/produção.
Onde houver referência a banco, ela significa **instância local descartável**.
Nunca reutilizar credenciais, URL ou dados do Supabase remoto em um ensaio.

## 1. Preflight local

### Objetivo

Comprovar que o Marco A é estrutural, reproduzível e não emite dados ao aplicar
as migrations.

### Checklist

1. Confirmar branch e `git status --short --branch`.
2. Confirmar que não há segredo ou arquivo `.env` novo no diff.
3. Inspecionar todas as migrations patrimoniais em ordem.
4. Procurar DML/backfill: `INSERT`, `UPDATE`, `DELETE`, `COPY` e chamadas de RPC.
   Exceções devem ser somente catálogo estrutural explicitamente auditado, nunca
   equipamento, campanha, lote, NP ou evento real.
5. Criar banco local descartável com o bootstrap mínimo.
6. Aplicar migrations uma única vez.
7. Verificar que sequência NP está virgem e tabelas operacionais estão vazias.
8. Executar testes de regras/RLS e concorrência.
9. Descartar a instância local ao fim.

### Comandos de validação de frontend

```powershell
npm test -- src/patrimonio-v1/PatrimonioHarness.test.js
npm test
npm run lint
npm run build
git diff --check
git status --short --branch
```

Os comandos SQL exatos estão documentados nos próprios arquivos em
`supabase/tests`. Eles exigem confirmação explícita de ambiente local.

## 2. Criar campanha inicial

> Futuro runbook de homologação. Não executar no Marco A.

1. Reconciliar o relatório-base: 488 total, 454 elegíveis, 34 Máquinas de
   Brindes, 66 referências anteriores e 8 órfãos.
2. Garantir operacionalmente que nenhuma campanha de implantação conflitante já
   existe. O schema não presume nem impõe unicidade global de campanha ativa.
3. Gerar uma chave idempotente nova e registrar solicitante/data no plano de
   mudança.
4. Criar a campanha por RPC administrativa.
5. Validar que os membros são IDs de equipamento elegível e que nenhuma posição
   foi copiada para o snapshot.
6. Conferir totais por categoria e lista de exclusões.
7. Exportar evidência de leitura; não gerar lote automaticamente.

### Parada obrigatória

Se o snapshot não tiver exatamente o universo aprovado para o ambiente, cancelar
o piloto antes de qualquer geração. Não corrigir posição dentro da campanha.

## 3. Preparar e gerar lote de etiquetas livres

1. Escolher campanha ativa, quantidade pequena e contexto logístico.
2. Exibir somente estimativa da faixa; nenhum número é reservado no preview.
3. Confirmar que o lote preparado tem zero identidades.
4. Fazer revisão por segunda pessoa: quantidade, impressora, papel e contexto.
5. Confirmar geração uma única vez com chave idempotente.
6. Validar quantidade criada, unicidade de NP/`public_id` e
   `equipamento_id = NULL` em todas as etiquetas.
7. Registrar a faixa efetiva retornada pelo backend; não confiar na estimativa.
8. Se houver falha, repetir com a mesma chave e o mesmo payload antes de criar
   outra solicitação.

### Proibido

- pré-associar equipamentos ao lote;
- renumerar lacunas;
- gerar uma segunda faixa “para compensar” sem reconciliar a primeira;
- cancelar/apagar um lote depois que identidades foram geradas.

## 4. Imprimir e calibrar

1. Gerar folha de calibração marcada como amostra/não usar.
2. Imprimir em escala 100%, sem “ajustar à página”.
3. Medir margens, largura, altura, gap e alinhamento em milímetros.
4. Ler todos os QRs da folha de calibração em dispositivo de teste.
5. Aprovar material/adesivo antes das etiquetas do piloto.
6. Gerar PDF de etiquetas livres; conferir que ele não contém equipamento ou
   posição.
7. Registrar impressão do lote por RPC.
8. Em reimpressão, informar motivo e preservar o evento anterior.
9. Destruir fisicamente folhas de ensaio inválidas conforme o procedimento local.

Uma impressão jamais muda vínculo, aplicação ou conferência.

## 5. Implantar etiqueta em equipamento existente

1. Ler o QR/código da etiqueta livre.
2. Se não autenticado, concluir login e retornar ao mesmo `public_id`.
3. Confirmar que nenhuma informação patrimonial foi exibida antes do login.
4. Selecionar o contexto físico atual.
5. Buscar e selecionar equipamento elegível, membro da campanha e ainda sem NP
   ativo.
6. Comparar nome, ID técnico, categoria e posição atual.
7. Confirmar vínculo; o backend revalida posição esperada sob lock.
8. Aplicar fisicamente a etiqueta correta.
9. Registrar “aplicada” em operação separada.
10. Fazer segunda leitura do código completo ou finais permitidos.
11. Conferir; abrir dossiê e confirmar NP, referência anterior e posição atual.

### “Fazer depois”

Pausar não pode avançar o estado. O item continua na fila correspondente e pode
ser retomado pelo deep link.

## 6. Cadastrar equipamento futuro

> Este runbook só começa depois de um cutover coordenado, ainda não autorizado:
> todos os consumidores reais do cadastro precisam usar a RPC e o caminho de
> `INSERT` legado deve ser vedado no mesmo rollout. As migrations do Marco A,
> isoladamente, não ativam NP automático no formulário atual.

1. Preencher os mesmos dados válidos do cadastro real de Equipamentos.
2. O backend deriva elegibilidade do catálogo; o frontend não decide.
3. Para categoria patrimoniável, executar cadastro + NP + vínculo na mesma RPC e
   mesma transação.
4. Validar que a resposta contém todos os equipamentos solicitados e exatamente
   um patrimônio vinculado por equipamento.
5. Se a categoria for Máquina de Brindes, validar que nenhum NP foi criado e que
   a sequência permaneceu inalterada.
6. Imprimir, aplicar e conferir depois; o cadastro atômico não inventa esses
   marcos físicos.

Em falha, não apresentar sucesso parcial e não repetir com nova chave até
consultar o resultado da chave original.

## 7. Divergência de posição

Sintoma: o equipamento físico está em posição diferente da leitura atual do
sistema ou a RPC retorna mudança concorrente de localização.

1. Não forçar o vínculo.
2. Registrar a divergência operacional fora do patrimônio.
3. Usar o fluxo oficial `ORIGEM → MOVIMENTAÇÃO → DESTINO` de Equipamentos.
4. Recarregar o candidato e revalidar posição.
5. Retomar o vínculo com nova leitura atualizada.

Patrimônio não altera localização diretamente.

## 8. Vínculo incorreto antes da conferência

1. Isolar a etiqueta e os dois equipamentos envolvidos.
2. Confirmar que o patrimônio está apenas `vinculado` ou `aplicado`.
3. Administrador registra correção com motivo suficiente.
4. O backend preserva equipamento anterior no evento e volta ao marco físico
   compatível.
5. Se a etiqueta já foi aplicada no equipamento errado, removê-la fisicamente
   conforme material/procedimento e registrar nova aplicação.
6. Fazer conferência independente.

Depois de `conferido`, não usar correção simples. Abrir incidente e avaliar baixa
ou operação compensatória formal.

## 9. Anulação, baixa e reimpressão

### Anulação

Usar para identidade que não deve mais entrar em operação, com motivo e estado
permitido. O número e evento permanecem. Nunca excluir a linha.

### Baixa

Usar somente para patrimônio conferido, por administrador e com motivo. O
equipamento e a identidade continuam rastreáveis historicamente.

### Reimpressão

Reimpressão não cria novo NP. Registrar motivo quando exigido, incrementar a
contagem e conferir se a etiqueta antiga precisa ser inutilizada fisicamente.

## 10. Concluir lote e campanha

### Lote

1. Reconciliar total gerado com disponível/vinculado/aplicado/conferido/anulado.
2. Resolver todos os itens; nenhuma etiqueta pode ficar sem destino conhecido.
3. Comparar amostra física, sistema e eventos.
4. Concluir por RPC administrativa idempotente.
5. Gerar o relatório final pós-implantação somente do lote concluído.

### Campanha

1. Conferir que nenhum membro permanece pendente.
2. Revisar exceções administrativas e motivos.
3. Confirmar que cada equipamento elegível tem NP conferido ou exceção formal.
4. Concluir por RPC administrativa.
5. Arquivar relatório final e evidências conforme política futura de retenção.

## 11. Incidente operacional

### Primeiros 15 minutos

1. Parar novas gerações e impressões do lote afetado.
2. Não apagar, editar diretamente ou renumerar nada.
3. Registrar horário, usuário, lote, NP/public_id e ação tentada.
4. Preservar mensagem/SQLSTATE e chave idempotente sem expor segredo.
5. Consultar eventos e estado atual em modo somente leitura.

### Classificação

| Classe | Exemplo | Conduta |
| --- | --- | --- |
| UI/local | preview não renderiza | manter backend intocado; reproduzir com fixture |
| Impressão | QR ilegível/desalinhado | bloquear folha; calibrar; registrar reimpressão |
| Concorrência | etiqueta/equipamento já usado | recarregar; não trocar chave cegamente |
| Logística | posição divergente | fluxo oficial de movimentação |
| Integridade | associação/evento inesperado | congelar lote e escalar para auditoria SQL |
| Segurança | acesso fora do escopo | revogar sessão quando autorizado e auditar RLS |

### Encerramento

O incidente só fecha após reconciliar identidade, equipamento, estado físico,
eventos e material impresso. A correção deve ser forward-only e auditável.

## 12. Rollback e recuperação

### Marco A local

- parar o processo;
- preservar o diff e logs;
- descartar apenas o banco local identificado como temporário;
- recriar do bootstrap e reaplicar migrations;
- corrigir por nova edição versionada, sem `git reset --hard` ou apagamento de
  trabalho.

### Após eventual homologação

Schema patrimonial com identidades emitidas não admite rollback destrutivo.
Usar migration corretiva para frente, bloquear novas operações e preservar
NPs/eventos. Não diminuir sequence, não reaproveitar lacunas e não apagar
identidades.

### Produção

Não existe runbook de produção aprovado neste marco. Qualquer implantação,
rollback, alteração de RLS ou operação de dados exige prompt e plano separados.

## 13. Evidências para aprovação

Entregar sem dados reais:

- hash do checkpoint local;
- lista de migrations e confirmação de zero DML operacional;
- resultados dos testes JS/SQL, lint, build e `git diff --check`;
- matriz de papéis revisada;
- screenshots Light/Dark e breakpoints;
- PDFs SAMPLE e PNGs renderizados;
- riscos/dívidas mantidos;
- confirmação explícita de nenhum push, deploy, migration remota ou dado real.
