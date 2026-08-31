const ESTADOS_DESPESAS_PREVIEW = new Set(["routes", "points", "detail"]);

function idPermitido(valor, idsPermitidos) {
  const id = Number(valor);
  return Number.isSafeInteger(id) && idsPermitidos.has(id) ? id : null;
}

export function resolverEstadoPreviewPontos(search, ids = []) {
  const params = search instanceof URLSearchParams
    ? search
    : new URLSearchParams(String(search || "").replace(/^\?/, ""));
  const idsPermitidos = new Set(ids.map(Number).filter(Number.isSafeInteger));
  const despesasSolicitadas = String(params.get("expenses") || "").toLowerCase();
  let despesas = ESTADOS_DESPESAS_PREVIEW.has(despesasSolicitadas) ? despesasSolicitadas : null;
  let pontoDespesasId = despesas === "detail" ? idPermitido(params.get("point"), idsPermitidos) : null;

  if (despesas === "detail" && pontoDespesasId === null) despesas = "points";

  return {
    tema: params.get("theme") === "dark" ? "dark" : "light",
    despesas,
    despesasAbertas: Boolean(despesas),
    perspectivaDespesas: despesas === "routes" ? "rotas" : "pontos",
    pontoDespesasId,
    pontoSelecionadoId: despesas ? null : idPermitido(params.get("selected"), idsPermitidos),
  };
}
