const normalizar = valor =>
  String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR");

export function isManagerExpense(despesa) {
  return !despesa?.pontoId && Boolean(despesa?.gerente);
}

export function expenseBelongsToManager(despesa, gerente) {
  return isManagerExpense(despesa) && normalizar(despesa.gerente) === normalizar(gerente);
}

export function expenseBelongsToRoute(despesa, gerente, rota, pointIds = new Set()) {
  if (pointIds.has(Number(despesa?.pontoId))) return true;
  return expenseBelongsToManager(despesa, gerente) &&
    (!rota || normalizar(despesa.rota) === normalizar(rota));
}
