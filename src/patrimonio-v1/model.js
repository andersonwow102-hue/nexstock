import {
  BATCH_CREATION_SCENARIOS,
  CATEGORIES,
  ELIGIBLE_CATEGORIES,
  OPERATING_CONTEXTS,
  compactPublicId,
  createBatchCreationScenario,
  createPatrimonyFixture,
  createQueixoBatchFixture,
  formatNp,
} from "./fixtures.js";

export {
  BATCH_CREATION_SCENARIOS,
  CATEGORIES,
  ELIGIBLE_CATEGORIES,
  OPERATING_CONTEXTS,
  createBatchCreationScenario,
  createPatrimonyFixture,
  createQueixoBatchFixture,
  formatNp,
};

export const LABEL_STATES = Object.freeze({
  disponivel: "Disponível",
  vinculado: "Vinculado · etiqueta pendente",
  aplicado: "Aplicado · aguarda conferência",
  conferido: "Conferido",
  anulado: "Anulado",
  baixado: "Baixado",
});

export const INVENTORY_FILTERS = Object.freeze([
  { value: "all", label: "Todos" },
  { value: "conferido", label: "NP conferido" },
  { value: "pendente", label: "NP pendente" },
  { value: "missing", label: "Sem NP" },
  { value: "legacy", label: "Com referência anterior" },
  { value: "non_asset", label: "Não patrimoniável" },
  { value: "review", label: "Revisão logística" },
]);

export const BATCH_GENERATION_ERRORS = Object.freeze({
  CONFIRMATION_REQUIRED: "Confirme que os patrimônios serão permanentes antes de gerar o lote.",
  EXCESS_CONFIRMATION_REQUIRED: "Confirme separadamente a geração de etiquetas acima da demanda atual.",
  IDEMPOTENCY_CONFLICT: "A chave desta geração já foi usada com outros dados.",
});

export const BATCH_QUANTITY_LIMITS = Object.freeze({ min: 1, max: 500 });

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function pad(value, size) {
  return String(value).padStart(size, "0");
}

function eventId(type, reference, index) {
  return `evt-${type}-${reference}-${index}`;
}

function appendEvent(state, event) {
  const createdAt = event.createdAt || new Date().toISOString();
  const nextEvent = {
    id: event.id || eventId(event.type, event.labelId || event.equipmentId || "global", state.events.length + 1),
    actor: "Operador local fictício",
    ...event,
    createdAt,
  };
  return { ...state, events: [...state.events, nextEvent] };
}

function idempotencyReplay(state, key, fingerprint) {
  if (!key) return null;
  const record = state.idempotency?.[key];
  if (!record) return null;
  return record.fingerprint === fingerprint
    ? { record }
    : { conflict: true };
}

function recordIdempotency(state, key, fingerprint, result) {
  if (!key) return state;
  return {
    ...state,
    idempotency: {
      ...(state.idempotency || {}),
      [key]: { fingerprint, result },
    },
  };
}

export function activeLabelForEquipment(labels, equipmentId) {
  return labels.find((label) => label.equipmentId === equipmentId && !["anulado", "baixado"].includes(label.state)) || null;
}

export function labelForEquipment(labels, equipmentId) {
  return activeLabelForEquipment(labels, equipmentId)
    || labels.find((label) => label.equipmentId === equipmentId) || null;
}

export function nextNpNumber(labels) {
  return labels.length ? Math.max(...labels.map((label) => label.number)) + 1 : 1;
}

export function equipmentPatrimonyState(equipment, labels) {
  if (!equipment.eligible) return equipment.legacyCode ? "non_asset_legacy" : "non_asset";
  const label = activeLabelForEquipment(labels, equipment.id);
  const historical = labelForEquipment(labels, equipment.id);
  if (!label && historical?.state === "baixado") return "baixado";
  if (!label) return equipment.position.type === "review" ? "review" : "missing";
  if (label.state === "conferido") return "conferido";
  return "pendente";
}

export function inventorySummary(state) {
  const campaignIds = new Set(state.campaign.memberIds);
  const summary = {
    totalEquipment: state.equipments.length,
    campaignEquipment: campaignIds.size,
    nonPatrimonial: 0,
    legacyReferences: 0,
    withoutNp: 0,
    withNp: 0,
    availableLabels: 0,
    bound: 0,
    applied: 0,
    verified: 0,
    annulled: 0,
    review: 0,
    emitted: state.labels.length,
  };
  for (const equipment of state.equipments) {
    if (!equipment.eligible) summary.nonPatrimonial += 1;
    if (equipment.legacyCode) summary.legacyReferences += 1;
    if (equipment.position.type === "review") summary.review += 1;
    if (campaignIds.has(equipment.id)) {
      if (activeLabelForEquipment(state.labels, equipment.id)) summary.withNp += 1;
      else summary.withoutNp += 1;
    }
  }
  for (const label of state.labels) {
    if (label.state === "disponivel") summary.availableLabels += 1;
    if (label.state === "vinculado") summary.bound += 1;
    if (label.state === "aplicado") summary.applied += 1;
    if (label.state === "conferido") summary.verified += 1;
    if (label.state === "anulado") summary.annulled += 1;
  }
  return summary;
}

export function campaignProgress(state) {
  const summary = inventorySummary(state);
  const memberIds = new Set(state.campaign.memberIds);
  const campaignLabels = state.labels.filter((label) => label.equipmentId && memberIds.has(label.equipmentId));
  const applied = campaignLabels.filter((label) => ["aplicado", "conferido"].includes(label.state)).length;
  const verified = campaignLabels.filter((label) => label.state === "conferido").length;
  const total = Math.max(1, summary.campaignEquipment);
  return {
    total: summary.campaignEquipment,
    withoutNp: summary.withoutNp,
    withNp: summary.withNp,
    applied,
    verified,
    withNpPercent: Math.round((summary.withNp / total) * 100),
    appliedPercent: Math.round((applied / total) * 100),
    verifiedPercent: Math.round((verified / total) * 100),
  };
}

export function batchLabels(state, batch) {
  if (!batch) return [];
  const ids = new Set(batch.labelIds);
  return state.labels.filter((label) => ids.has(label.id));
}

export function batchProgress(state, batch) {
  const labels = batchLabels(state, batch);
  const counts = { total: labels.length, available: 0, bound: 0, applied: 0, verified: 0, annulled: 0 };
  for (const label of labels) {
    if (label.state === "disponivel") counts.available += 1;
    if (label.state === "vinculado") counts.bound += 1;
    if (label.state === "aplicado") counts.applied += 1;
    if (label.state === "conferido") counts.verified += 1;
    if (label.state === "anulado") counts.annulled += 1;
  }
  counts.resolved = counts.verified + counts.annulled;
  counts.percent = counts.total ? Math.round((counts.resolved / counts.total) * 100) : 0;
  return counts;
}

export function filterInventory(state, filters = {}, query = "") {
  const needle = normalize(query);
  return state.equipments.filter((equipment) => {
    const patrimonyState = equipmentPatrimonyState(equipment, state.labels);
    const label = labelForEquipment(state.labels, equipment.id);
    if (filters.category && equipment.category !== filters.category) return false;
    if (filters.position && equipment.position.type !== filters.position) return false;
    if (filters.patrimony && filters.patrimony !== "all") {
      if (filters.patrimony === "legacy" && !equipment.legacyCode) return false;
      else if (filters.patrimony === "non_asset" && !patrimonyState.startsWith("non_asset")) return false;
      else if (!["legacy", "non_asset"].includes(filters.patrimony) && patrimonyState !== filters.patrimony) return false;
    }
    if (!needle) return true;
    return normalize([
      equipment.name,
      equipment.technicalId,
      equipment.category,
      equipment.position.label,
      equipment.position.route,
      equipment.position.manager,
      equipment.legacyCode,
      label?.code,
    ].join(" ")).includes(needle);
  });
}

export function candidateEquipments(state, contextId, query = "") {
  const campaignIds = new Set(state.campaign.memberIds);
  const needle = normalize(query);
  return state.equipments.filter((equipment) => {
    if (!equipment.eligible || !campaignIds.has(equipment.id)) return false;
    if (activeLabelForEquipment(state.labels, equipment.id)) return false;
    if (contextId && equipment.position.id !== contextId) return false;
    if (!needle) return true;
    return normalize([equipment.name, equipment.technicalId, equipment.legacyCode, equipment.position.label].join(" ")).includes(needle);
  });
}

export function operatingContext(contextId) {
  if (contextId === undefined) return OPERATING_CONTEXTS[0];
  const context = OPERATING_CONTEXTS.find((item) => item.id === contextId);
  if (!context) throw new RangeError(`Contexto operacional inválido: ${String(contextId)}`);
  return context;
}

export function batchDemand(state, contextId) {
  return candidateEquipments(state, operatingContext(contextId).id).length;
}

export function suggestBatchName(state, contextId) {
  const context = operatingContext(contextId);
  const baseName = context.type === "route" ? context.label.replace(/^Rota\s+/i, "") : context.label;
  const existingCount = state.batches.filter((batch) => batch.context?.id === context.id).length;
  if (context.type === "stock" && existingCount === 0) return `${baseName} — Piloto`;
  return `${baseName} — Etapa ${existingCount + 1}`;
}

export function normalizeBatchQuantity(value = 18) {
  if (!["number", "string"].includes(typeof value) || (typeof value === "string" && !value.trim())) {
    throw new RangeError(
      `Quantidade de etiquetas deve ser um número inteiro entre ${BATCH_QUANTITY_LIMITS.min} e ${BATCH_QUANTITY_LIMITS.max}.`,
    );
  }
  const quantity = Number(value);
  if (!Number.isInteger(quantity)
    || quantity < BATCH_QUANTITY_LIMITS.min
    || quantity > BATCH_QUANTITY_LIMITS.max) {
    throw new RangeError(
      `Quantidade de etiquetas deve ser um número inteiro entre ${BATCH_QUANTITY_LIMITS.min} e ${BATCH_QUANTITY_LIMITS.max}.`,
    );
  }
  return quantity;
}

export function validateBatchGeneration(preview, confirmation = false) {
  const normalized = typeof confirmation === "object" && confirmation !== null
    ? confirmation
    : { confirmed: confirmation === true, excessConfirmed: false };
  if (normalized.confirmed !== true) {
    return {
      ok: false,
      code: "CONFIRMATION_REQUIRED",
      error: BATCH_GENERATION_ERRORS.CONFIRMATION_REQUIRED,
    };
  }
  if (preview?.excess > 0 && normalized.excessConfirmed !== true) {
    return {
      ok: false,
      code: "EXCESS_CONFIRMATION_REQUIRED",
      error: BATCH_GENERATION_ERRORS.EXCESS_CONFIRMATION_REQUIRED,
    };
  }
  return { ok: true };
}

function batchGenerationFingerprint(preview) {
  return JSON.stringify({
    operation: "generate_batch",
    batchId: preview.batchId,
    campaignId: preview.campaignId,
    quantity: preview.quantity,
    contextId: preview.context?.id,
    friendlyName: preview.friendlyName,
    demandAtCreation: preview.demandAtCreation,
  });
}

export function prepareBatchPreview(state, options = {}) {
  const batch = options.batchId ? state.batches.find((item) => item.id === options.batchId) : null;
  const quantity = normalizeBatchQuantity(options.quantity === undefined ? batch?.plannedQuantity : options.quantity);
  const start = nextNpNumber(state.labels);
  const estimated = Array.from({ length: quantity }, (_, index) => formatNp(start + index));
  const context = operatingContext(options.contextId === undefined ? batch?.context?.id : options.contextId);
  const demand = batchDemand(state, context.id);
  const requestedName = String(options.friendlyName || options.name || batch?.friendlyName || batch?.name || "").trim();
  const friendlyName = requestedName || suggestBatchName(state, context.id);
  const requestedDemandSnapshot = Number(options.demandAtCreation ?? batch?.demandSnapshot);
  const demandAtCreation = Number.isFinite(requestedDemandSnapshot) && requestedDemandSnapshot >= 0
    ? Math.floor(requestedDemandSnapshot)
    : demand;
  const excess = Math.max(0, quantity - demand);
  const shortfall = Math.max(0, demand - quantity);
  return {
    idempotencyKey: options.idempotencyKey || `preview-${batch?.id || state.nextBatchNumber}-${quantity}-${context.id}`,
    batchId: batch?.id || `PAT-202609-${pad(state.nextBatchNumber, 4)}`,
    campaignId: state.campaign.id,
    campaignName: state.campaign.name,
    name: friendlyName,
    friendlyName,
    quantity,
    context,
    demand,
    demandAtCreation,
    demandSnapshot: demandAtCreation,
    excess,
    shortfall,
    usesTotalDemand: demand > 0 && quantity === demand,
    requiresExcessConfirmation: excess > 0,
    estimated,
    estimateLabel: quantity === 1 ? estimated[0] : `${estimated[0]} — ${estimated.at(-1)}`,
  };
}

export function generateFreeLabelBatch(state, preview, confirmation = false) {
  const generationFingerprint = batchGenerationFingerprint(preview);
  const replay = state.batches.find((batch) => batch.generationKey === preview.idempotencyKey);
  if (replay) {
    if (replay.generationFingerprint && replay.generationFingerprint !== generationFingerprint) {
      return {
        state,
        batch: replay,
        replayed: false,
        ok: false,
        code: "IDEMPOTENCY_CONFLICT",
        error: BATCH_GENERATION_ERRORS.IDEMPOTENCY_CONFLICT,
      };
    }
    return { state, batch: replay, replayed: true, ok: true };
  }
  const batchIndex = state.batches.findIndex((batch) => batch.id === preview.batchId);
  const existingBatch = state.batches[batchIndex];
  if (existingBatch && existingBatch.labelIds.length) return { state, batch: existingBatch, replayed: true, ok: true };
  const validation = validateBatchGeneration(preview, confirmation);
  if (!validation.ok) return { state, batch: existingBatch || null, replayed: false, ...validation };

  const start = nextNpNumber(state.labels);
  const labels = Array.from({ length: preview.quantity }, (_, offset) => {
    const number = start + offset;
    return {
      id: `pat-${pad(number, 6)}`,
      number,
      code: formatNp(number),
      publicId: compactPublicId(number),
      origin: "implantacao",
      campaignId: preview.campaignId,
      batchId: preview.batchId,
      state: "disponivel",
      equipmentId: null,
      createdAt: new Date().toISOString(),
      boundAt: null,
      appliedAt: null,
      verifiedAt: null,
      annulledAt: null,
      printCount: 0,
    };
  });
  const batch = {
    id: preview.batchId,
    name: preview.friendlyName,
    friendlyName: preview.friendlyName,
    campaignId: preview.campaignId,
    status: "gerado",
    plannedQuantity: preview.quantity,
    demandSnapshot: preview.demandAtCreation,
    labelIds: labels.map((label) => label.id),
    context: preview.context,
    createdAt: existingBatch?.createdAt || new Date().toISOString(),
    printCount: existingBatch?.printCount || 0,
    generationKey: preview.idempotencyKey,
    generationFingerprint,
  };
  const batches = batchIndex >= 0
    ? state.batches.map((item, index) => index === batchIndex ? batch : item)
    : [...state.batches, batch];
  let nextState = {
    ...state,
    labels: [...state.labels, ...labels],
    batches,
    activeBatchId: batch.id,
    nextBatchNumber: batchIndex >= 0 ? state.nextBatchNumber : state.nextBatchNumber + 1,
  };
  for (const label of labels) {
    nextState = appendEvent(nextState, { type: "patrimonio_gerado", title: "Patrimônio livre gerado", labelId: label.id, batchId: batch.id });
  }
  return { state: nextState, batch, replayed: false, ok: true };
}

export function markBatchPrinted(state, batchId, labelIds = null) {
  const batch = state.batches.find((item) => item.id === batchId);
  if (!batch) return { state, changed: false, error: "Lote não encontrado." };
  const allowed = new Set(labelIds || batch.labelIds);
  const labels = state.labels.map((label) => allowed.has(label.id) && batch.labelIds.includes(label.id)
    ? { ...label, printCount: label.printCount + 1 }
    : label);
  const batches = state.batches.map((item) => item.id === batchId
    ? { ...item, printCount: item.printCount + 1, lastPrintedAt: new Date().toISOString() }
    : item);
  const nextState = appendEvent({ ...state, labels, batches }, {
    type: batch.printCount ? "etiquetas_reimpressas" : "etiquetas_impressas",
    title: batch.printCount ? "Etiquetas reimpressas" : "Etiquetas impressas",
    batchId,
  });
  return { state: nextState, changed: true };
}

export function bindFreeLabel(state, { labelId, equipmentId, expectedLocation, idempotencyKey }) {
  const fingerprint = JSON.stringify({ operation: "bind", labelId, equipmentId, expectedLocation: expectedLocation || null });
  const replay = idempotencyReplay(state, idempotencyKey, fingerprint);
  if (replay?.conflict) return { state, ok: false, code: "IDEMPOTENCY_CONFLICT" };
  if (replay?.record) {
    return {
      state,
      ok: true,
      replayed: true,
      label: state.labels.find((item) => item.id === replay.record.result.labelId),
      equipment: state.equipments.find((item) => item.id === replay.record.result.equipmentId),
    };
  }
  const label = state.labels.find((item) => item.id === labelId);
  const equipment = state.equipments.find((item) => item.id === equipmentId);
  if (!label || label.state !== "disponivel") return { state, ok: false, code: "LABEL_NOT_AVAILABLE" };
  if (!equipment || !equipment.eligible) return { state, ok: false, code: "EQUIPMENT_NOT_ELIGIBLE" };
  if (activeLabelForEquipment(state.labels, equipmentId)) return { state, ok: false, code: "EQUIPMENT_ALREADY_BOUND" };
  if (!state.campaign.memberIds.includes(equipmentId)) return { state, ok: false, code: "OUTSIDE_CAMPAIGN" };
  if (expectedLocation && expectedLocation !== equipment.position.label) return { state, ok: false, code: "LOCATION_CHANGED" };
  const now = new Date().toISOString();
  const labels = state.labels.map((item) => item.id === labelId
    ? { ...item, state: "vinculado", equipmentId, boundAt: now }
    : item);
  let nextState = appendEvent({ ...state, labels }, {
    type: "patrimonio_vinculado",
    title: "Patrimônio vinculado",
    labelId,
    equipmentId,
  });
  nextState = recordIdempotency(nextState, idempotencyKey, fingerprint, { labelId, equipmentId });
  return { state: nextState, ok: true, replayed: false, label: labels.find((item) => item.id === labelId), equipment };
}

export function markLabelApplied(state, labelId) {
  const label = state.labels.find((item) => item.id === labelId);
  if (!label) return { state, ok: false, code: "NOT_FOUND" };
  if (["aplicado", "conferido"].includes(label.state)) return { state, ok: true, replayed: true, label };
  if (label.state !== "vinculado") return { state, ok: false, code: "NOT_BOUND" };
  const labels = state.labels.map((item) => item.id === labelId
    ? { ...item, state: "aplicado", appliedAt: new Date().toISOString() }
    : item);
  return {
    state: appendEvent({ ...state, labels }, { type: "etiqueta_aplicada", title: "Etiqueta aplicada", labelId, equipmentId: label.equipmentId }),
    ok: true,
    replayed: false,
    label: labels.find((item) => item.id === labelId),
  };
}

function comparableCode(value) {
  return normalize(value).replace(/[\s_]/g, "-");
}

export function confirmLabel(state, { labelId, input, method = "codigo" }) {
  const label = state.labels.find((item) => item.id === labelId);
  if (!label) return { state, ok: false, code: "NOT_FOUND" };
  if (label.state === "conferido") return { state, ok: true, replayed: true, label };
  if (label.state !== "aplicado") return { state, ok: false, code: "NOT_APPLIED" };
  const expected = comparableCode(label.code);
  const received = comparableCode(input);
  const digits = received.replace(/\D/g, "");
  const matches = received === expected || ([4, 6].includes(digits.length) && expected.replace(/\D/g, "").endsWith(digits));
  if (!matches) return { state, ok: false, code: "CODE_MISMATCH" };
  const labels = state.labels.map((item) => item.id === labelId
    ? { ...item, state: "conferido", verifiedAt: new Date().toISOString(), verificationMethod: method }
    : item);
  return {
    state: appendEvent({ ...state, labels }, { type: "patrimonio_conferido", title: "Patrimônio conferido", labelId, equipmentId: label.equipmentId, method }),
    ok: true,
    replayed: false,
    label: labels.find((item) => item.id === labelId),
  };
}

export function resolveLabelByCode(labels, input) {
  const raw = comparableCode(input);
  if (!raw) return { status: "invalid", matches: [] };
  const exact = labels.filter((label) => comparableCode(label.code) === raw);
  if (exact.length === 1) return { status: "found", label: exact[0], matches: exact };
  const digits = raw.replace(/\D/g, "");
  if (![4, 6].includes(digits.length)) return { status: "invalid", matches: [] };
  const matches = labels.filter((label) => label.code.replace(/\D/g, "").endsWith(digits));
  if (matches.length === 1) return { status: "found", label: matches[0], matches };
  return { status: matches.length ? "ambiguous" : "not_found", matches };
}

export function correctBindingBeforeVerification(state, { labelId, equipmentId, reason }) {
  const label = state.labels.find((item) => item.id === labelId);
  const equipment = state.equipments.find((item) => item.id === equipmentId);
  if (!label || !["vinculado", "aplicado"].includes(label.state)) return { state, ok: false, code: "CORRECTION_BLOCKED" };
  if (!equipment?.eligible || activeLabelForEquipment(state.labels, equipmentId)) return { state, ok: false, code: "EQUIPMENT_NOT_AVAILABLE" };
  if (String(reason || "").trim().length < 5) return { state, ok: false, code: "REASON_REQUIRED" };
  const previousEquipmentId = label.equipmentId;
  const labels = state.labels.map((item) => item.id === labelId
    ? { ...item, equipmentId, state: "vinculado", appliedAt: null, verifiedAt: null, boundAt: new Date().toISOString() }
    : item);
  return {
    state: appendEvent({ ...state, labels }, {
      type: "vinculo_corrigido",
      title: "Vínculo patrimonial corrigido",
      labelId,
      equipmentId,
      previousEquipmentId,
      reason: String(reason).trim(),
    }),
    ok: true,
  };
}

export function simulateEquipmentRegistration(state, { name, category, quantity = 1, idempotencyKey }) {
  const count = Math.max(1, Math.min(100, Number(quantity) || 1));
  if (!CATEGORIES.includes(category)) return { state, ok: false, code: "UNKNOWN_CATEGORY" };
  const normalizedName = String(name || category).trim();
  const fingerprint = JSON.stringify({ operation: "register", name: normalizedName, category, quantity: count });
  const replay = idempotencyReplay(state, idempotencyKey, fingerprint);
  if (replay?.conflict) return { state, ok: false, code: "IDEMPOTENCY_CONFLICT" };
  if (replay?.record) {
    const equipmentIds = new Set(replay.record.result.equipmentIds);
    const labelIds = new Set(replay.record.result.labelIds);
    return {
      state,
      ok: true,
      replayed: true,
      equipments: state.equipments.filter((item) => equipmentIds.has(item.id)),
      labels: state.labels.filter((item) => labelIds.has(item.id)),
      patrimonial: replay.record.result.patrimonial,
    };
  }
  const patrimonial = ELIGIBLE_CATEGORIES.includes(category);
  const startEquipment = state.equipments.length + 1;
  const startNp = nextNpNumber(state.labels);
  const createdAt = new Date().toISOString();
  const equipments = Array.from({ length: count }, (_, offset) => ({
    id: `eq-${pad(startEquipment + offset, 4)}`,
    databaseId: startEquipment + offset,
    technicalId: `EQ-${pad(startEquipment + offset, 6)}`,
    name: `${normalizedName} ${count > 1 ? pad(offset + 1, 2) : ""}`.trim(),
    category,
    eligible: patrimonial,
    legacyCode: "",
    position: { ...OPERATING_CONTEXTS[0] },
    status: "Disponível",
    campaignState: "continuous",
    note: patrimonial ? "Cadastro futuro: NP criado e vinculado na mesma transação fictícia." : "Categoria não patrimoniável.",
  }));
  const labels = patrimonial ? equipments.map((equipment, offset) => {
    const number = startNp + offset;
    return {
      id: `pat-${pad(number, 6)}`,
      number,
      code: formatNp(number),
      publicId: compactPublicId(number),
      origin: "cadastro",
      campaignId: null,
      batchId: null,
      state: "vinculado",
      equipmentId: equipment.id,
      createdAt,
      boundAt: createdAt,
      appliedAt: null,
      verifiedAt: null,
      annulledAt: null,
      printCount: 0,
    };
  }) : [];
  let nextState = { ...state, equipments: [...state.equipments, ...equipments], labels: [...state.labels, ...labels] };
  for (const equipment of equipments) {
    nextState = appendEvent(nextState, { type: "equipamento_cadastrado", title: "Equipamento cadastrado", equipmentId: equipment.id });
  }
  for (const label of labels) {
    nextState = appendEvent(nextState, { type: "patrimonio_cadastro", title: "NP gerado e vinculado no cadastro", labelId: label.id, equipmentId: label.equipmentId });
  }
  nextState = recordIdempotency(nextState, idempotencyKey, fingerprint, {
    equipmentIds: equipments.map((item) => item.id),
    labelIds: labels.map((item) => item.id),
    patrimonial,
  });
  return { state: nextState, ok: true, replayed: false, equipments, labels, patrimonial };
}

export function deepLinkState(state, publicId, { authenticated = true, role = "administrador", managerName } = {}) {
  if (!authenticated) return { screen: "login", preserveDestination: true, disclosure: false };
  const label = state.labels.find((item) => item.publicId === publicId);
  if (!label) return { screen: "not_found", message: "Patrimônio não encontrado ou indisponível para seu acesso." };
  if (role === "consulta") return { screen: "forbidden", disclosure: false };
  if (label.state === "disponivel") {
    return ["administrador", "operador"].includes(role)
      ? { screen: "activate", label }
      : { screen: "forbidden", disclosure: false };
  }
  const equipment = state.equipments.find((item) => item.id === label.equipmentId) || null;
  if (role === "gerente" && (!equipment || !managerName || equipment.position.manager !== managerName)) {
    return { screen: "forbidden", disclosure: false };
  }
  if (!["administrador", "operador", "gerente"].includes(role)) return { screen: "forbidden", disclosure: false };
  return { screen: label.state, label, equipment };
}
