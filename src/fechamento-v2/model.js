export const CONCEPTS = [
  { id: "A", name: "Conference Desk" },
  { id: "B", name: "Financial Focus" },
  { id: "C", name: "Route Workflow" },
];

export const STEPS = [
  { id: 1, label: "Período" },
  { id: 2, label: "Rota" },
  { id: 3, label: "Lançamentos" },
  { id: 4, label: "Conferência" },
  { id: 5, label: "Envio" },
];

export const FIXTURE = {
  competence: "2026-07",
  competenceLabel: "Julho de 2026",
  status: "Pronto para revisão",
  routes: [
    { id: "vale-azul", name: "Vale Azul", manager: "Caio Nobre", points: 7, equipment: 19, state: "Pronto para revisão" },
    { id: "circuito-norte", name: "Circuito Norte", manager: "Marina Valente", points: 3, equipment: 5, state: "Rascunho salvo" },
    { id: "serra-clara", name: "Serra Clara", manager: "Lívia Prado", points: 4, equipment: 11, state: "Em preenchimento" },
  ],
  modalities: [
    { id: "90-da-sorte", name: "90 da Sorte", rule: "10% automática", commissionRate: 0.1, entry: 24800, commission: 2480, exit: 16200 },
    { id: "viapix", name: "ViaPix", rule: "Comissão manual", commissionRate: null, entry: 17400, commission: 1392, exit: 10500 },
    { id: "lotobanca", name: "Lotobanca", rule: "20% automática", commissionRate: 0.2, entry: 11900, commission: 2380, exit: 7300 },
  ],
  expenses: [
    { id: "manutencao", name: "Manutenção de terminal", source: "Estação Cedro", value: 840 },
    { id: "deslocamento", name: "Deslocamento operacional", source: "Ponto Horizonte", value: 1120 },
    { id: "apoio", name: "Apoio de rota", source: "Caio Nobre", value: 900 },
  ],
  adjustments: { playBet: 350, costAid: 180, extraCommission: 0 },
};

export function createInitialValues() {
  return Object.fromEntries(FIXTURE.modalities.map((item) => [
    item.id,
    { entry: item.entry, commission: item.commission, exit: item.exit },
  ]));
}

export function createInitialAdjustments() {
  return { ...FIXTURE.adjustments };
}

export function parseMoney(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const cleaned = String(value ?? "").trim().replace(/[^\d,.-]/g, "");
  if (!cleaned) return 0;
  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");
  let normalized = cleaned;
  if (lastDot >= 0 && lastComma >= 0) {
    normalized = lastDot > lastComma ? cleaned.replace(/,/g, "") : cleaned.replace(/\./g, "").replace(",", ".");
  } else if (lastComma >= 0) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (lastDot >= 0 && cleaned.length - lastDot - 1 > 2) {
    normalized = cleaned.replace(/\./g, "");
  }
  const number = Number(normalized);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

export function formatMoney(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatMoneyInput(value) {
  return Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function calculateFinancials(values, adjustments) {
  const modalities = FIXTURE.modalities.map((item) => {
    const current = values[item.id] || {};
    const entry = parseMoney(current.entry);
    const commission = item.commissionRate === null ? parseMoney(current.commission) : entry * item.commissionRate;
    const exit = parseMoney(current.exit);
    return { ...item, entry, commission, exit, balance: entry - commission - exit };
  });
  const entries = modalities.reduce((sum, item) => sum + item.entry, 0);
  const commissions = modalities.reduce((sum, item) => sum + item.commission, 0);
  const exits = modalities.reduce((sum, item) => sum + item.exit, 0);
  const grossBalance = modalities.reduce((sum, item) => sum + item.balance, 0);
  const registeredExpenses = FIXTURE.expenses.reduce((sum, item) => sum + item.value, 0);
  const playBet = parseMoney(adjustments.playBet);
  const costAid = parseMoney(adjustments.costAid);
  const extraCommission = parseMoney(adjustments.extraCommission);
  const consolidatedExpenses = Math.max(0, registeredExpenses - playBet + costAid + extraCommission);
  const afterExpenses = grossBalance - consolidatedExpenses;
  const managerCommission = Math.max(0, afterExpenses) * 0.1;
  const toTransfer = afterExpenses - managerCommission;
  return {
    modalities,
    entries,
    commissions,
    exits,
    grossBalance,
    registeredExpenses,
    playBet,
    costAid,
    extraCommission,
    consolidatedExpenses,
    afterExpenses,
    managerCommission,
    toTransfer,
  };
}
