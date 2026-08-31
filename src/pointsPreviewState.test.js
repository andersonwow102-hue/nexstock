import test from "node:test";
import assert from "node:assert/strict";
import { resolverEstadoPreviewPontos } from "./pointsPreviewState.js";

const ids = [1, 2, 3];

test("preview neutro usa Light e não abre contexto ativo", () => {
  assert.deepEqual(resolverEstadoPreviewPontos("?preview=pontos", ids), {
    tema: "light",
    despesas: null,
    despesasAbertas: false,
    perspectivaDespesas: "pontos",
    pontoDespesasId: null,
    pontoSelecionadoId: null,
  });
});

test("preview seleciona somente um ponto pertencente à fixture", () => {
  assert.equal(resolverEstadoPreviewPontos("?selected=2", ids).pontoSelecionadoId, 2);
  assert.equal(resolverEstadoPreviewPontos("?selected=999", ids).pontoSelecionadoId, null);
  assert.equal(resolverEstadoPreviewPontos("?selected=2x", ids).pontoSelecionadoId, null);
});

test("preview aceita apenas estados financeiros conhecidos", () => {
  assert.equal(resolverEstadoPreviewPontos("?expenses=routes", ids).perspectivaDespesas, "rotas");
  assert.equal(resolverEstadoPreviewPontos("?expenses=points", ids).perspectivaDespesas, "pontos");
  assert.equal(resolverEstadoPreviewPontos("?expenses=unknown", ids).despesasAbertas, false);
});

test("detalhe financeiro exige um ponto válido e degrada para Pontos", () => {
  const detalhe = resolverEstadoPreviewPontos("?expenses=detail&point=2", ids);
  assert.equal(detalhe.pontoDespesasId, 2);
  assert.equal(detalhe.perspectivaDespesas, "pontos");
  const invalido = resolverEstadoPreviewPontos("?expenses=detail&point=999", ids);
  assert.equal(invalido.despesas, "points");
  assert.equal(invalido.pontoDespesasId, null);
});

test("Expenses tem precedência sobre seleção e preserva tema Dark", () => {
  const estado = resolverEstadoPreviewPontos("?theme=dark&selected=2&expenses=routes", ids);
  assert.equal(estado.tema, "dark");
  assert.equal(estado.pontoSelecionadoId, null);
  assert.equal(estado.despesasAbertas, true);
});
