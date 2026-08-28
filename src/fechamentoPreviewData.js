const MODALIDADES_PREVIEW = [
  { id: "90-da-sorte", nome: "90 da Sorte", comissao: 0.1, descricao: "10% de comissão" },
  { id: "viapix", nome: "Viapix", comissao: null, descricao: "Comissão preenchida manualmente" },
  { id: "lotobanca", nome: "Lotobanca", comissao: 0.2, descricao: "20% de comissão" },
];

export const FECHAMENTO_PREVIEW_SCENARIOS = [
  { id: "A", nome: "Rota vazia", descricao: "Sem lançamentos ou despesas" },
  { id: "B", nome: "Preenchimento parcial", descricao: "Lançamentos ainda em curso" },
  { id: "C", nome: "Pronto para revisão", descricao: "Rascunho completo e salvo" },
  { id: "D", nome: "Pronto para envio", descricao: "Conferência concluída localmente" },
  { id: "E", nome: "Já enviado", descricao: "Gerente visualizou e confirmou" },
];

const VALORES_CENARIOS = {
  A: {
    "90-da-sorte": { entrada: "", comissao: "", saida: "", comissaoAutomatica: true },
    viapix: { entrada: "", comissao: "", saida: "", comissaoAutomatica: false },
    lotobanca: { entrada: "", comissao: "", saida: "", comissaoAutomatica: true },
  },
  B: {
    "90-da-sorte": { entrada: "12000,00", comissao: "", saida: "6500,00", comissaoAutomatica: true },
    viapix: { entrada: "6800,00", comissao: "540,00", saida: "", comissaoAutomatica: false },
    lotobanca: { entrada: "", comissao: "", saida: "", comissaoAutomatica: true },
  },
  C: {
    "90-da-sorte": { entrada: "24800,00", comissao: "", saida: "16200,00", comissaoAutomatica: true },
    viapix: { entrada: "17400,00", comissao: "1392,00", saida: "10500,00", comissaoAutomatica: false },
    lotobanca: { entrada: "11900,00", comissao: "", saida: "7300,00", comissaoAutomatica: true },
  },
  D: {
    "90-da-sorte": { entrada: "32750,00", comissao: "", saida: "21400,00", comissaoAutomatica: true },
    viapix: { entrada: "22640,00", comissao: "1811,20", saida: "13900,00", comissaoAutomatica: false },
    lotobanca: { entrada: "14800,00", comissao: "", saida: "9050,00", comissaoAutomatica: true },
  },
  E: {
    "90-da-sorte": { entrada: "35120,00", comissao: "", saida: "22600,00", comissaoAutomatica: true },
    viapix: { entrada: "24100,00", comissao: "1928,00", saida: "14750,00", comissaoAutomatica: false },
    lotobanca: { entrada: "16280,00", comissao: "", saida: "9880,00", comissaoAutomatica: true },
  },
};

const STATUS_CENARIOS = {
  A: { classe: "pendente", titulo: "Sem lançamentos", descricao: "Rota vazia", texto: "Nenhum valor foi lançado neste recorte." },
  B: { classe: "pendente", titulo: "Em preenchimento", descricao: "Lançamentos parciais", texto: "Há valores parciais ainda não salvos." },
  C: { classe: "rascunho", titulo: "Rascunho salvo", descricao: "Pronto para revisar", texto: "Rascunho salvo localmente e disponível para conferência." },
  D: { classe: "rascunho", titulo: "Pronto para envio", descricao: "Conferência concluída", texto: "A mesa foi conferida e aguarda publicação para o gerente." },
  E: { classe: "confirmado", titulo: "Confirmado", descricao: "Gerente confirmou", texto: "Gerente visualizou o PDF e confirmou os valores simulados." },
};

const CORES_ROTAS = [
  { bg: "rgba(77,142,240,0.15)", color: "#6c9ff0", border: "rgba(77,142,240,0.34)" },
  { bg: "rgba(34,211,122,0.13)", color: "#69ba85", border: "rgba(34,211,122,0.3)" },
  { bg: "rgba(168,85,247,0.13)", color: "#ad86df", border: "rgba(168,85,247,0.3)" },
  { bg: "rgba(236,72,153,0.12)", color: "#d77aa8", border: "rgba(236,72,153,0.28)" },
  { bg: "rgba(245,197,66,0.12)", color: "#c8a758", border: "rgba(245,197,66,0.28)" },
];

export function numeroFechamentoPreview(valor) {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;
  const texto = String(valor || "").trim().replace(/[^\d,.-]/g, "");
  if (!texto) return 0;
  const ultimoPonto = texto.lastIndexOf(".");
  const ultimaVirgula = texto.lastIndexOf(",");
  let normalizado = texto;
  if (ultimoPonto >= 0 && ultimaVirgula >= 0) {
    normalizado = ultimoPonto > ultimaVirgula ? texto.replace(/,/g, "") : texto.replace(/\./g, "").replace(",", ".");
  } else if (ultimaVirgula >= 0) {
    normalizado = texto.replace(/\./g, "").replace(",", ".");
  } else if (ultimoPonto >= 0) {
    const decimais = texto.length - ultimoPonto - 1;
    normalizado = decimais > 0 && decimais <= 2 ? texto : texto.replace(/\./g, "");
  }
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : 0;
}

export function calcularFechamentoPreview({ valores, despesasSistema = 0, playBet = 0, ajudaCusto = 0, comissaoExtra = 0 }) {
  const modalidades = MODALIDADES_PREVIEW.map((modalidade) => {
    const registro = valores[modalidade.id] || {};
    const entrada = numeroFechamentoPreview(registro.entrada);
    const comissaoCalculada = modalidade.comissao === null
      ? numeroFechamentoPreview(registro.comissao)
      : registro.comissaoAutomatica !== false
        ? entrada * modalidade.comissao
        : numeroFechamentoPreview(registro.comissao);
    const saida = numeroFechamentoPreview(registro.saida);
    return { ...modalidade, entrada, comissaoCalculada, saida, saldoBruto: entrada - comissaoCalculada - saida };
  });
  const entradas = modalidades.reduce((soma, item) => soma + item.entrada, 0);
  const comissoes = modalidades.reduce((soma, item) => soma + item.comissaoCalculada, 0);
  const saidas = modalidades.reduce((soma, item) => soma + item.saida, 0);
  const saldoBruto = modalidades.reduce((soma, item) => soma + item.saldoBruto, 0);
  const despesasFinais = Math.max(0, despesasSistema - Math.max(0, playBet) + Math.max(0, ajudaCusto) + Math.max(0, comissaoExtra));
  const saldoFinal = saldoBruto - despesasFinais;
  const comissaoGerente = Math.max(0, saldoFinal) * 0.1;
  const saldoRepassar = saldoFinal - comissaoGerente;
  return { modalidades, totais: { entradas, comissoes, saidas, saldoBruto, despesasSistema, despesasFinais, saldoFinal, comissaoGerente, saldoRepassar } };
}

function competenciaAnterior(dataReferencia = new Date()) {
  const data = new Date(dataReferencia);
  data.setDate(1);
  data.setMonth(data.getMonth() - 1);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
}

function despesasDoCenario(id, competencia) {
  if (id === "A") return [];
  const base = [
    { id: "sim-despesa-1", pontoId: "sim-ponto-1", competencia, descricao: "Manutenção de terminal", valorReal: id === "B" ? 240 : 840, criadoEm: `${competencia}-12T13:00:00.000Z` },
    { id: "sim-despesa-2", pontoId: "sim-ponto-2", competencia, descricao: "Deslocamento operacional", valorReal: id === "B" ? 380 : 1120, criadoEm: `${competencia}-14T16:20:00.000Z` },
  ];
  if (id !== "B") base.push({ id: "sim-despesa-3", pontoId: null, gerente: "Marina Valente", rota: "Circuito Norte", competencia, descricao: "Apoio de rota", valorReal: 900, criadoEm: `${competencia}-18T11:10:00.000Z` });
  return base;
}

function gruposDespesas(despesas, pontos) {
  const pontoPorId = new Map(pontos.map((ponto) => [ponto.id, ponto]));
  return [...despesas.reduce((grupos, despesa) => {
    const ponto = pontoPorId.get(despesa.pontoId);
    const chave = ponto ? `ponto:${ponto.id}` : "gerente:marina:circuito-norte";
    const grupo = grupos.get(chave) || { chave, nome: ponto?.nomeFantasia || "Despesa operacional de Marina", lancamentos: [], meses: new Set(), modalidades: new Set(), total: 0 };
    grupo.lancamentos.push(despesa);
    grupo.meses.add("competência simulada");
    (ponto?.modalidades || []).forEach((modalidade) => grupo.modalidades.add(modalidade));
    grupo.total += Number(despesa.valorReal || 0);
    grupos.set(chave, grupo);
    return grupos;
  }, new Map()).values()];
}

export function criarFechamentoPreview(cenarioId = "D", dataReferencia = new Date()) {
  const id = FECHAMENTO_PREVIEW_SCENARIOS.some((cenario) => cenario.id === cenarioId) ? cenarioId : "D";
  const competencia = competenciaAnterior(dataReferencia);
  const pontos = [
    { id: "sim-ponto-1", nomeFantasia: "Estação Cedro", gerente: "Circuito Norte", modalidades: ["90 da Sorte", "Viapix"] },
    { id: "sim-ponto-2", nomeFantasia: "Ponto Horizonte", gerente: "Circuito Norte", modalidades: ["Lotobanca", "Viapix"] },
    { id: "sim-ponto-3", nomeFantasia: "Casa Aurora", gerente: "Circuito Norte", modalidades: ["90 da Sorte", "Lotobanca"] },
  ];
  const equipamentos = [
    { id: "sim-equip-1", nome: "Terminal Cedro 01", localizacao: "Estação Cedro", status: "Em rota" },
    { id: "sim-equip-2", nome: "Impressora Horizonte", localizacao: "Ponto Horizonte", status: "Em rota" },
    { id: "sim-equip-3", nome: "Tablet Aurora", localizacao: "Casa Aurora", status: "Em rota" },
    { id: "sim-equip-4", nome: "Terminal Cedro 02", localizacao: "Estação Cedro", status: "Em rota" },
    { id: "sim-equip-5", nome: "Noteiro Aurora", localizacao: "Casa Aurora", status: "Em rota" },
  ];
  const despesas = despesasDoCenario(id, competencia);
  const ajustes = id === "A" || id === "B"
    ? { playBet: 0, ajudaCusto: 0, comissaoExtra: 0 }
    : id === "C"
      ? { playBet: 350, ajudaCusto: 180, comissaoExtra: 0 }
      : { playBet: 420, ajudaCusto: 220, comissaoExtra: 150 };
  const valores = structuredClone(VALORES_CENARIOS[id]);
  const despesasSistema = despesas.reduce((soma, item) => soma + Number(item.valorReal || item.valorPrevisto || 0), 0);
  const status = { ...STATUS_CENARIOS[id] };
  const agoraSimulado = `${competencia}-28T18:45:00.000Z`;
  if (id === "E") {
    status.enviadoEm = `${competencia}-28T17:20:00.000Z`;
    status.visualizadoEm = `${competencia}-28T18:05:00.000Z`;
    status.confirmadoEm = agoraSimulado;
  }

  const rotas = [
    { gerente: "Marina Valente", rota: "Circuito Norte", pontos: pontos.length, equipamentos: equipamentos.length, totalDespesas: despesasSistema, cor: CORES_ROTAS[0], status },
    { gerente: "Caio Nobre", rota: "Vale Azul", pontos: 7, equipamentos: 19, totalDespesas: 1740, cor: CORES_ROTAS[1], status: { classe: "pendente", titulo: "Sem envio", descricao: "Pronto para lançar" } },
    { gerente: "Lívia Prado", rota: "Serra Clara", pontos: 4, equipamentos: 11, totalDespesas: 2980, cor: CORES_ROTAS[2], status: { classe: "rascunho", titulo: "Rascunho", descricao: "Salvo no sistema" } },
    { gerente: "Rafael Luz", rota: "Linha Horizonte", pontos: 9, equipamentos: 27, totalDespesas: 4130, cor: CORES_ROTAS[3], status: { classe: "enviado", titulo: "Enviado", descricao: "Aguardando gerente" } },
    { gerente: "Nina Campos", rota: "Polo Central", pontos: 6, equipamentos: 16, totalDespesas: 2210, cor: CORES_ROTAS[4], status: { classe: "finalizado", titulo: "Finalizado", descricao: "Prestação concluída" } },
  ];

  return {
    id,
    cenario: FECHAMENTO_PREVIEW_SCENARIOS.find((item) => item.id === id),
    competencia,
    dia: "",
    gerente: "Marina Valente",
    rota: "Circuito Norte",
    pontos,
    equipamentos,
    despesas,
    gruposDespesas: gruposDespesas(despesas, pontos),
    valores,
    ajustes,
    rotas,
    status,
    etapa: id === "A" || id === "B" ? 3 : id === "C" || id === "D" ? 4 : 5,
    etapaConcluida: false,
  };
}

export function formatarMoedaPreview(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
