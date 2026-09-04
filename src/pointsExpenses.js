import { rotaCanonica } from "./pointsData.js";
import { isManagerExpense } from "./expenseScope.js";

const normalizarBusca = valor =>
  String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR");

const competenciaDaDespesa = despesa => String(despesa?.competencia || "").slice(0, 7);

export const valorDespesa = despesa => Number(despesa?.valorReal || despesa?.valorPrevisto || 0);

export function resumoDespesaPontoMes(ponto, despesas = [], competencia = "") {
  const total = despesas
    .filter(despesa =>
      Number(despesa.pontoId) === Number(ponto.id)
      && competenciaDaDespesa(despesa) === competencia
    )
    .reduce((soma, despesa) => soma + valorDespesa(despesa), 0);

  return {
    possuiDespesa: total > 0 ? "sim" : "nao",
    valorDespesa: total,
  };
}

export function aplicarResumoDespesaMes(pontos = [], despesas = [], competencia = "") {
  return pontos.map(ponto => ({
    ...ponto,
    ...resumoDespesaPontoMes(ponto, despesas, competencia),
  }));
}

export function pontoTemDespesa(ponto) {
  return ponto?.possuiDespesa === "sim" && Number(ponto?.valorDespesa) > 0;
}

export function criarAnaliseDespesasRede({ pontos = [], despesas = [], competencia = "" } = {}) {
  const pontosCompetencia = aplicarResumoDespesaMes(pontos, despesas, competencia);
  const despesasCompetencia = despesas.filter(despesa => competenciaDaDespesa(despesa) === competencia);
  const despesasGerentes = despesasCompetencia.filter(isManagerExpense);
  const totalPontos = pontosCompetencia.reduce(
    (soma, ponto) => soma + (Number(ponto.valorDespesa) || 0),
    0
  );
  const totalGerentes = despesasGerentes.reduce(
    (soma, despesa) => soma + valorDespesa(despesa),
    0
  );
  const rotas = new Map();

  pontosCompetencia.forEach(ponto => {
    const rota = rotaCanonica(ponto.gerente) || "Sem rota";
    const atual = rotas.get(rota) || {
      rota,
      totalPontos: 0,
      totalGerente: 0,
      total: 0,
      pontos: 0,
      comDespesa: 0,
      semDespesa: 0,
      despesasGerente: [],
    };

    atual.totalPontos += Number(ponto.valorDespesa) || 0;
    atual.pontos += 1;
    if (pontoTemDespesa(ponto)) atual.comDespesa += 1;
    else atual.semDespesa += 1;
    rotas.set(rota, atual);
  });

  despesasGerentes.forEach(despesa => {
    const rota = rotaCanonica(despesa.rota) || despesa.rota || "Sem rota";
    const atual = rotas.get(rota) || {
      rota,
      totalPontos: 0,
      totalGerente: 0,
      total: 0,
      pontos: 0,
      comDespesa: 0,
      semDespesa: 0,
      despesasGerente: [],
    };

    atual.totalGerente += valorDespesa(despesa);
    atual.despesasGerente.push(despesa);
    rotas.set(rota, atual);
  });

  const resumoRotas = [...rotas.values()]
    .map(item => ({ ...item, total: item.totalPontos + item.totalGerente }))
    .sort((a, b) => b.total - a.total || a.rota.localeCompare(b.rota, "pt-BR"));

  return {
    pontosCompetencia,
    despesasGerentes,
    resumoRotas,
    totalPontos,
    totalGerentes,
    totalGeral: totalPontos + totalGerentes,
  };
}

export function filtrarPontosDespesasRede({
  pontos = [],
  rota = "Todas",
  situacao = "todos",
  busca = "",
} = {}) {
  const termo = normalizarBusca(busca);

  return pontos
    .filter(ponto => rota === "Todas" || (rotaCanonica(ponto.gerente) || "Sem rota") === rota)
    .filter(ponto =>
      situacao === "todos"
      || (situacao === "com" ? pontoTemDespesa(ponto) : !pontoTemDespesa(ponto))
    )
    .filter(ponto => {
      if (!termo) return true;
      return [
        ponto.nomeFantasia,
        ponto.nomeDono,
        ponto.telefone,
        rotaCanonica(ponto.gerente) || "Sem rota",
      ].some(valor => normalizarBusca(valor).includes(termo));
    })
    .sort((a, b) =>
      (Number(b.valorDespesa) || 0) - (Number(a.valorDespesa) || 0)
      || String(a.nomeFantasia || "").localeCompare(String(b.nomeFantasia || ""), "pt-BR")
    );
}

export function listarDespesasPonto({ despesas = [], pontoId, competencia = "" } = {}) {
  return despesas
    .filter(despesa =>
      Number(despesa.pontoId) === Number(pontoId)
      && competenciaDaDespesa(despesa) === competencia
    )
    .sort((a, b) =>
      String(a.descricao || "").localeCompare(String(b.descricao || ""), "pt-BR")
    );
}
