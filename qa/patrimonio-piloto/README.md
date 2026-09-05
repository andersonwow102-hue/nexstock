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

O alias `neptera.vercel.app` foi confirmado na listagem Vercel do projeto. O acesso
externo sem sessão redireciona ao login Vercel. A resolução completa via navegador
externo permanece dependente desse acesso; nenhuma configuração de proteção foi alterada.

Prévia DEV sem acesso ao banco: `/patrimonio-real-preview.html?cenario=piloto&tema=claro`.
Ela usa exclusivamente o snapshot auditado. A tela operacional continua usando loadData real.

Sem push, deploy ou registro de impressão. Aguardando aprovação do PDF pelo Anderson.
