import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const pagina = fs.readFileSync(new URL("./DevedoresPage.jsx", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("./DevedoresPage.css", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
const db = fs.readFileSync(new URL("./db.js", import.meta.url), "utf8");

test("menu depende de perfil real autorizado", () => {
  assert.match(app, /permissoesDevedores\(perfilAtual\.perfil,perfilAtual\.perfilReal===true\)/);
  assert.match(app, /acessoDevedores&&<button[^>]+devedores/);
  assert.match(db, /perfilReal: true/);
  assert.match(db, /perfilReal: false/);
});

test("interface separa ações por permissão", () => {
  for (const permissao of ["cadastrar", "corrigirCadastro", "negociar", "pagar", "estornar", "somenteLeitura"]) {
    assert.match(pagina, new RegExp(`permissao\\.${permissao}`));
  }
  assert.match(pagina, /Acesso somente leitura/);
});

test("fluxos usam RPCs pela camada isolada e protegem duplo envio", () => {
  assert.match(pagina, /api\.cadastrarDevedor/);
  assert.match(pagina, /api\.criarNegociacao/);
  assert.match(pagina, /api\.registrarPagamento/);
  assert.match(pagina, /api\.estornarPagamento/);
  assert.match(pagina, /disabled=\{enviando\}/);
  assert.match(pagina, /useState\(criarChaveIdempotencia\)/);
});

test("cadastro envia os tipos aceitos pelo contrato SQL", () => {
  assert.match(pagina, /option value="pessoa">Pessoa/);
  assert.match(pagina, /option value="ponto">Ponto comercial/);
  assert.doesNotMatch(pagina, /pessoa_fisica|pessoa_juridica/);
});

test("detalhe reabre com a versao atualizada depois de uma acao", () => {
  assert.match(pagina, /const atualizados=await carregar\(\)/);
  assert.match(pagina, /abrirDetalhe\(atualizado\)/);
});

test("lista possui busca, filtros, estados e paginação segura", () => {
  for (const termo of ["Buscar por nome", "Todas as situações", "Todas as modalidades", "Todos os gerentes", "Somente vencidas", "Somente quitadas", "Página"]) {
    assert.ok(pagina.includes(termo), `ausente: ${termo}`);
  }
  assert.match(pagina, /Carregando devedores/);
  assert.match(pagina, /Nenhum devedor encontrado/);
});

test("responsividade troca tabela por cards sem rolagem horizontal obrigatória", () => {
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /\.dev-tabela-wrap\{display:none\}/);
  assert.match(css, /\.dev-cards\{display:grid/);
  assert.match(css, /\.dev-modal-fundo\{padding:0/);
});

test("operador possui fluxo mobile com filtros, parcelas e pagamento seguro", () => {
  for (const termo of ["Mais filtros", "Aplicar filtros", "Saldo pendente", "Registrar pagamento", "Saldo projetado", "Registrando pagamento...", "Resumo do pagamento"]) {
    assert.ok(pagina.includes(termo), `ausente: ${termo}`);
  }
  assert.match(pagina, /acimaDoSaldo/);
  assert.match(pagina, /dev-parcelas/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /width: 100vw/);
});

test("datas civis e prévia de parcelas usam utilitários dedicados", () => {
  assert.match(pagina, /formatarDataCivil/);
  assert.match(pagina, /preverParcelas/);
  assert.match(pagina, /Prévia ilustrativa/);
});
