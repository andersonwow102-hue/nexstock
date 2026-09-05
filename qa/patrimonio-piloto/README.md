# Patrimônio — impressão piloto local

Auditoria de produção em 2026-09-04/05, somente por SELECT, projeto Supabase `alxqpzbvbajsqsfngwko`.
O snapshot `audit.json` documenta o lote PAT-202609-0001, Piloto Estoque — Etapa 1.
Cinco identidades persistidas: NP-000001 a NP-000005. Estado: gerado, 5 disponíveis,
0 vinculadas, 0 aplicadas, 0 conferidas, 0 impressões. Nenhum dado de produção foi alterado.

## Resultado

- Dossiê distingue lote preparado e totalmente gerado e mostra o contador de impressões.
- A ação Imprimir etiquetas relê as fontes autorizadas e baixa um PDF local.
- PDF usa exclusivamente os códigos e public_ids persistidos do lote selecionado.
- Leitura parcial, IDs inválidos ou identidades duplicadas impedem a geração.
- Gerar ou baixar o PDF não chama RPC de geração, impressão ou qualquer escrita.
- Etiquetas A4, 63 × 35 mm, QR 24 mm incluindo margem branca de quatro módulos.
- Artefato: `output/pdf/NEPTERA_PAT-202609-0001_PILOTO_REAL.pdf`.

## Validação

- 285 testes Node passaram; testes específicos em src/patrimonioPrint.test.js.
- Lint passou sem erros; `git diff --check` passou.
- PDF renderizado com Poppler e inspecionado visualmente, sem cortes ou sobreposição.
- ZXing decodificou os 5 QRs da página renderizada, comparados ao snapshot do banco.
- Os 5 links embutidos no PDF e os textos de cada etiqueta também foram conferidos.
- Resolvedor real `patrimonio_resolver_public_id`: 5 resultados corretos em transação
  READ ONLY, contexto de administrador apenas na sessão, encerrada por ROLLBACK.
- QA do componente real em 1440 × 1000 e 390 × 844: geração local, estado de sucesso,
  contador zero e ausência de overflow horizontal. Temas claro e escuro.
- Build passou, com aviso de tamanho de chunks já existente na aplicação.

Para repetir o QA de decodificação: instalar zxing-cpp em tmp/pdfs/qa-deps,
renderizar o PDF com `pdftoppm -scale-to 2100 -png -singlefile` em
tmp/pdfs/piloto-preview e executar `python qa/patrimonio-piloto/qa-pdf.py`.
O ambiente Python precisa de Pillow e pypdf. A dependência temporária foi removida após o QA.

## Correção da base pública do QR

Base anterior: `https://neptera.vercel.app`, constante em src/patrimonioPrint.js,
independente de variável de ambiente, preview ou URL de deployment.
O projeto tem `ssoProtection.deploymentType = all_except_custom_domains`.
O alias adicional neptera.vercel.app não consta na lista de domínios de produção;
os cinco caminhos retornavam HTTP 302 para vercel.com/sso-api.

Base temporária: `https://nexstock-delta.vercel.app`, domínio verificado de produção
do mesmo projeto, sem gitBranch, sem customEnvironmentId e sem redirect.
Os cinco caminhos retornam HTTP 200 com título NEPTERA. Todos foram abertos no
navegador sem sessão e mostraram login NEPTERA, aviso de retorno e URL preservada,
sem NP ou dados operacionais na tela. Nenhuma proteção ou configuração Vercel mudou.

O login atual usa signInWithPassword e atualiza o estado de autenticação sem navegar
para outra URL. App mantém rotaPatrimonio e, autenticado, monta PatrimonioDeepLinkPage
antes do Sistema. Não foi necessário alterar App, autenticação, RLS ou rewrites.
O retorno foi validado por testes de contrato/transição de autenticação para os cinco
destinos. Não foi executado login com senha real no navegador.
O resolvedor de produção foi validado para os cinco códigos no contexto de gerente
em transação READ ONLY seguida de ROLLBACK: código/ID corretos, estado disponível,
equipamento nulo e lote oculto. Sem autenticação, o resolvedor retornou zero resultados.

PDF regenerado no mesmo caminho, preservando layout, NPs e public_ids. ZXing leu os
cinco QRs do PDF renderizado e confirmou a nova base; os cinco links PDF coincidem.
Hash de códigos/IDs/lote do banco coincide com o snapshot aprovado.
Consulta final: 5 disponíveis, 0 vinculadas, 0 aplicadas, 0 conferidas, 0 impressões,
0 eventos de impressão e patrimonio_np_seq.last_value = 5.

Testes relevantes de deep link/autenticação, Patrimônio e QR/PDF passaram.
Lint, build e git diff --check passaram. Nenhum teste de despesas foi executado.

Classificação: READY para a correção local de base pública. O novo PDF usa um endereço
já acessível em produção; ele não depende de deploy. Para o gerador da aplicação
adotar a base temporária, publicar futuramente o frontend com src/patrimonioPrint.js
atualizado, incluindo a implementação de impressão local ainda não publicada.
Não há alteração de variáveis de ambiente, domínio, Deployment Protection ou banco.

Prévia DEV sem acesso ao banco: `/patrimonio-real-preview.html?cenario=piloto&tema=claro`.
Ela usa exclusivamente o snapshot auditado. A tela operacional continua usando loadData real.

Sem push, deploy ou registro de impressão. Parado após entregar a correção local.
