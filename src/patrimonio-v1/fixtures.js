export const CATEGORIES = Object.freeze([
  "Televisões",
  "Terminais",
  "Impressoras",
  "Tablets",
  "Carregadores",
  "Máquina de Brindes",
  "Totens",
  "Noteiro",
  "PDV Touchscreen",
]);

export const ELIGIBLE_CATEGORIES = Object.freeze(
  CATEGORIES.filter((category) => category !== "Máquina de Brindes"),
);

export const OPERATING_CONTEXTS = Object.freeze([
  { id: "estoque", label: "Estoque interno", type: "stock", route: "Base" },
  { id: "bar-savio", label: "Bar do Sávio", type: "point", route: "Rota Norte", manager: "Caio Nobre" },
  { id: "ponto-aurora", label: "Ponto Aurora", type: "point", route: "Rota Sul", manager: "Lia Martins" },
  { id: "gerente-caio", label: "Com Caio Nobre", type: "manager", route: "Rota Norte", manager: "Caio Nobre" },
  { id: "conserto", label: "Em conserto", type: "repair", route: "Oficina" },
  { id: "transferencia", label: "Em transferência", type: "transfer", route: "Em trânsito" },
  { id: "rota-queixo", label: "Rota Queixo", type: "route", route: "Queixo" },
]);

export const BATCH_CREATION_SCENARIOS = Object.freeze({
  total: Object.freeze({
    id: "total",
    label: "Demanda total",
    contextId: "estoque",
    friendlyName: "Estoque interno — Piloto",
    demand: 18,
    quantity: 18,
  }),
  partial: Object.freeze({
    id: "partial",
    label: "Lote parcial",
    contextId: "rota-queixo",
    friendlyName: "Queixo — Etapa 1",
    demand: 100,
    quantity: 25,
  }),
  excess: Object.freeze({
    id: "excess",
    label: "Excesso sob confirmação",
    contextId: "bar-savio",
    friendlyName: "Bar do Sávio — Etapa 1",
    demand: 2,
    quantity: 5,
    excess: 3,
  }),
});

const CATEGORY_NAMES = Object.freeze({
  Televisões: "TV Operacional",
  Terminais: "Terminal Operacional",
  Impressoras: "Impressora de Cupom",
  Tablets: "Tablet de Rota",
  Carregadores: "Carregador USB-C",
  "Máquina de Brindes": "Máquina de Brindes",
  Totens: "Totem de Atendimento",
  Noteiro: "Noteiro Operacional",
  "PDV Touchscreen": "PDV Touchscreen",
});

const TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789_-";

function pad(value, size) {
  return String(value).padStart(size, "0");
}

export function formatNp(number) {
  return `NP-${pad(number, 6)}`;
}

export function compactPublicId(seed) {
  let value = (Number(seed) || 1) * 2654435761;
  let token = "";
  for (let index = 0; index < 22; index += 1) {
    value = (value ^ (value << 13)) >>> 0;
    value = (value ^ (value >>> 17)) >>> 0;
    value = (value ^ (value << 5)) >>> 0;
    token += TOKEN_ALPHABET[value % TOKEN_ALPHABET.length];
  }
  return token;
}

function contextFor(index) {
  if (index >= 446 && index < 454) {
    return {
      id: `revisao-${index - 445}`,
      label: `Localização sem correspondência ${index - 445}`,
      type: "review",
      route: "Revisão logística",
    };
  }
  const ordinal = index + 1;
  if (ordinal <= 19) return OPERATING_CONTEXTS[0];
  if ((ordinal >= 59 && ordinal <= 62) || (ordinal >= 64 && ordinal <= 74)) return OPERATING_CONTEXTS[1];
  if (ordinal >= 100 && ordinal <= 199) return OPERATING_CONTEXTS[6];
  if (index < 199) return OPERATING_CONTEXTS[2];
  if (index < 230) return OPERATING_CONTEXTS[3];
  if (index < 244) return OPERATING_CONTEXTS[4];
  if (index < 254) return OPERATING_CONTEXTS[5];
  return index % 2 ? OPERATING_CONTEXTS[2] : OPERATING_CONTEXTS[3];
}

function makeEquipment(index, overrides = {}) {
  const ordinal = index + 1;
  const category = ELIGIBLE_CATEGORIES[index % ELIGIBLE_CATEGORIES.length];
  const context = contextFor(index);
  return {
    id: `eq-${pad(ordinal, 4)}`,
    databaseId: ordinal,
    technicalId: `EQ-${pad(ordinal, 6)}`,
    name: `${CATEGORY_NAMES[category]} ${pad(ordinal, 3)}`,
    category,
    eligible: true,
    legacyCode: index < 58 ? `LEG-EQP-${pad(ordinal, 4)}` : "",
    position: { ...context },
    status: context.type === "repair" ? "Em conserto" : "Em rota",
    campaignState: context.type === "review" ? "review" : "pending",
    note: context.type === "review"
      ? "Localização textual precisa ser resolvida pelo fluxo oficial de movimentação."
      : "Equipamento incluído no snapshot fictício da campanha inicial.",
    ...overrides,
  };
}

function makePrizeMachine(offset) {
  const ordinal = 455 + offset;
  const context = offset % 3 === 0 ? OPERATING_CONTEXTS[4] : OPERATING_CONTEXTS[0];
  return makeEquipment(454 + offset, {
    id: `eq-${pad(ordinal, 4)}`,
    databaseId: ordinal,
    technicalId: `EQ-${pad(ordinal, 6)}`,
    name: `Máquina de Brindes ${pad(offset + 1, 2)}`,
    category: "Máquina de Brindes",
    eligible: false,
    legacyCode: offset < 8 ? `LEG-MAQ-${pad(offset + 1, 3)}` : "",
    position: { ...context },
    status: context.type === "repair" ? "Em conserto" : "Disponível",
    campaignState: "outside",
    note: offset < 8
      ? "Referência anterior preservada; a categoria continua não patrimoniável."
      : "Categoria não patrimoniável conforme catálogo canônico.",
  });
}

function makeLabel(number, state, equipmentId = null, overrides = {}) {
  const now = "2026-09-01T12:00:00.000Z";
  return {
    id: `pat-${pad(number, 6)}`,
    number,
    code: formatNp(number),
    publicId: compactPublicId(number),
    origin: "implantacao",
    campaignId: "camp-implantacao-neptera",
    batchId: number <= 12 ? "PAT-202609-0001" : "PAT-202609-0003",
    state,
    equipmentId,
    createdAt: now,
    boundAt: equipmentId ? now : null,
    appliedAt: ["aplicado", "conferido"].includes(state) ? now : null,
    verifiedAt: state === "conferido" ? now : null,
    annulledAt: state === "anulado" ? now : null,
    printCount: state === "anulado" ? 1 : 2,
    ...overrides,
  };
}

function createLabels() {
  return [
    makeLabel(1, "disponivel"),
    makeLabel(2, "disponivel"),
    makeLabel(3, "disponivel"),
    makeLabel(4, "vinculado", "eq-0059"),
    makeLabel(5, "vinculado", "eq-0060"),
    makeLabel(6, "aplicado", "eq-0061"),
    makeLabel(7, "aplicado", "eq-0062"),
    makeLabel(8, "conferido", "eq-0001"),
    makeLabel(9, "conferido", "eq-0064"),
    makeLabel(10, "conferido", "eq-0065"),
    makeLabel(11, "conferido", "eq-0066"),
    makeLabel(12, "anulado", null, { annulmentReason: "Amostra física danificada no ensaio local." }),
    ...Array.from({ length: 6 }, (_, offset) => makeLabel(13 + offset, "conferido", `eq-${pad(67 + offset, 4)}`)),
  ];
}

function createEvents(labels) {
  return labels.flatMap((label, index) => {
    const base = [{
      id: `evt-${label.id}-gerado`,
      labelId: label.id,
      type: "patrimonio_gerado",
      title: "Patrimônio gerado",
      actor: "Anderion Operações",
      createdAt: `2026-09-01T${String(8 + (index % 6)).padStart(2, "0")}:00:00.000Z`,
    }];
    if (label.equipmentId) base.push({ ...base[0], id: `evt-${label.id}-vinculo`, type: "patrimonio_vinculado", title: "Vinculado ao equipamento" });
    if (label.appliedAt) base.push({ ...base[0], id: `evt-${label.id}-aplicado`, type: "etiqueta_aplicada", title: "Etiqueta aplicada" });
    if (label.verifiedAt) base.push({ ...base[0], id: `evt-${label.id}-conferido`, type: "patrimonio_conferido", title: "Conferência concluída" });
    return base;
  });
}

export function createPatrimonyFixture() {
  const equipments = [
    ...Array.from({ length: 454 }, (_, index) => makeEquipment(index)),
    ...Array.from({ length: 34 }, (_, index) => makePrizeMachine(index)),
  ];
  const labels = createLabels();
  const campaign = {
    id: "camp-implantacao-neptera",
    code: "CAMP-2026-01",
    name: "Implantação NEPTERA",
    status: "ativa",
    memberIds: equipments.filter((equipment) => equipment.eligible).map((equipment) => equipment.id),
    capturedAt: "2026-09-01T08:00:00.000Z",
    note: "Snapshot fictício: somente a pertença é histórica; posição e situação continuam atuais.",
  };
  const batches = [
    {
      id: "PAT-202609-0001",
      name: "Estoque interno — Piloto",
      friendlyName: "Estoque interno — Piloto",
      campaignId: campaign.id,
      status: "em_uso",
      plannedQuantity: 12,
      demandSnapshot: 18,
      labelIds: labels.filter((label) => label.batchId === "PAT-202609-0001").map((label) => label.id),
      context: { ...OPERATING_CONTEXTS[0] },
      createdAt: "2026-09-01T08:30:00.000Z",
      printCount: 2,
    },
    {
      id: "PAT-202609-0002",
      name: "Queixo — Etapa 1",
      friendlyName: "Queixo — Etapa 1",
      campaignId: campaign.id,
      status: "preparado",
      plannedQuantity: 25,
      demandSnapshot: 100,
      labelIds: [],
      context: { ...OPERATING_CONTEXTS[6] },
      createdAt: "2026-09-01T09:10:00.000Z",
      printCount: 0,
    },
    {
      id: "PAT-202609-0003",
      name: "Bar do Sávio — Concluído",
      friendlyName: "Bar do Sávio — Concluído",
      campaignId: campaign.id,
      status: "concluido",
      plannedQuantity: 6,
      demandSnapshot: 8,
      labelIds: labels.filter((label) => label.batchId === "PAT-202609-0003").map((label) => label.id),
      context: { ...OPERATING_CONTEXTS[1] },
      createdAt: "2026-09-01T10:00:00.000Z",
      printCount: 1,
    },
  ];
  return {
    campaign,
    equipments,
    labels,
    batches,
    events: createEvents(labels),
    idempotency: {},
    activeBatchId: "PAT-202609-0001",
    nextBatchNumber: 4,
  };
}

const BATCH_SCENARIO_ALIASES = Object.freeze({
  "demanda-total": "total",
  estoque: "total",
  parcial: "partial",
  queixo: "partial",
  excesso: "excess",
  "bar-savio": "excess",
});

export function createBatchCreationScenario(kind = "partial") {
  const key = BATCH_SCENARIO_ALIASES[kind] || kind;
  const scenario = BATCH_CREATION_SCENARIOS[key];
  if (!scenario) throw new RangeError(`Cenário de criação de lote desconhecido: ${kind}`);
  return {
    state: createPatrimonyFixture(),
    scenario: { ...scenario },
    options: {
      contextId: scenario.contextId,
      quantity: scenario.quantity,
      friendlyName: scenario.friendlyName,
      demandAtCreation: scenario.demand,
      idempotencyKey: `fixture-batch-${scenario.id}-001`,
    },
  };
}

export function createQueixoBatchFixture() {
  const state = createPatrimonyFixture();
  const scenario = BATCH_CREATION_SCENARIOS.partial;
  const batchId = "PAT-202609-0004";
  const candidateIds = state.equipments
    .filter((equipment) => equipment.position.id === scenario.contextId)
    .slice(0, 7)
    .map((equipment) => equipment.id);
  const showcaseLabels = Array.from({ length: scenario.quantity }, (_, offset) => {
    const number = 19 + offset;
    if (offset < 18) return makeLabel(number, "disponivel", null, { batchId, printCount: 1 });
    if (offset < 22) return makeLabel(number, "vinculado", candidateIds[offset - 18], { batchId, printCount: 1 });
    if (offset < 24) return makeLabel(number, "aplicado", candidateIds[offset - 18], { batchId, printCount: 1 });
    return makeLabel(number, "conferido", candidateIds[offset - 18], { batchId, printCount: 1 });
  });
  const batch = {
    id: batchId,
    name: scenario.friendlyName,
    friendlyName: scenario.friendlyName,
    campaignId: state.campaign.id,
    status: "em_uso",
    plannedQuantity: scenario.quantity,
    demandSnapshot: scenario.demand,
    labelIds: showcaseLabels.map((label) => label.id),
    context: { ...OPERATING_CONTEXTS[6] },
    createdAt: "2026-09-01T11:00:00.000Z",
    printCount: 1,
    generationKey: "fixture-batch-partial-showcase-001",
  };
  return {
    ...state,
    labels: [...state.labels, ...showcaseLabels],
    batches: [...state.batches.filter((item) => item.id !== "PAT-202609-0002"), batch],
    events: [...state.events, ...createEvents(showcaseLabels)],
    activeBatchId: batch.id,
    nextBatchNumber: 5,
  };
}
