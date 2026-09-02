import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { compactPublicId, createPatrimonyFixture } from "./fixtures.js";
import {
  PUBLIC_ID_PATTERN,
  buildFinalReportJob,
  buildLabelPrintJob,
  buildQrPayload,
  buildRegistrationLabelPrintJob,
  buildRouteReportJob,
} from "./integrationPoints.js";
import {
  activeLabelForEquipment,
  batchProgress,
  bindFreeLabel,
  campaignProgress,
  candidateEquipments,
  confirmLabel,
  correctBindingBeforeVerification,
  deepLinkState,
  filterInventory,
  generateFreeLabelBatch,
  inventorySummary,
  markLabelApplied,
  nextNpNumber,
  prepareBatchPreview,
  resolveLabelByCode,
  simulateEquipmentRegistration,
} from "./model.js";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = path.resolve(CURRENT_DIR, "../..");
const read = (file) => readFile(path.join(CURRENT_DIR, file), "utf8");

function generateBatch(state = createPatrimonyFixture(), options = {}) {
  const preview = prepareBatchPreview(state, {
    quantity: 3,
    contextId: "bar-savio",
    idempotencyKey: "test-free-labels-001",
    ...options,
  });
  return generateFreeLabelBatch(state, preview);
}

test("snapshot local preserva 488 equipamentos e a classificação auditada", () => {
  const state = createPatrimonyFixture();
  const eligible = state.equipments.filter((equipment) => equipment.eligible);
  const machines = state.equipments.filter((equipment) => !equipment.eligible);
  const legacy = state.equipments.filter((equipment) => equipment.legacyCode);
  const review = state.equipments.filter((equipment) => equipment.position.type === "review");

  assert.equal(state.equipments.length, 488);
  assert.equal(eligible.length, 454);
  assert.equal(machines.length, 34);
  assert.equal(machines.every((equipment) => equipment.category === "Máquina de Brindes"), true);
  assert.equal(legacy.length, 66);
  assert.equal(machines.filter((equipment) => equipment.legacyCode).length, 8);
  assert.equal(review.length, 8);
  assert.equal(new Set(state.equipments.map((equipment) => equipment.id)).size, 488);
  assert.equal(new Set(state.equipments.map((equipment) => equipment.technicalId)).size, 488);
});

test("campanha congela somente pertença e não duplica posição operacional", () => {
  const state = createPatrimonyFixture();
  const members = new Set(state.campaign.memberIds);

  assert.equal(members.size, 454);
  assert.equal(state.equipments.every((equipment) => members.has(equipment.id) === equipment.eligible), true);
  assert.equal(Object.hasOwn(state.campaign, "positions"), false);
  assert.equal(Object.hasOwn(state.campaign, "equipmentSnapshots"), false);
  assert.equal(state.campaign.note.includes("somente a pertença"), true);

  const moved = {
    ...state,
    equipments: state.equipments.map((equipment) => equipment.id === "eq-0100"
      ? { ...equipment, position: { ...equipment.position, label: "Posição atualizada" } }
      : equipment),
  };
  assert.deepEqual(moved.campaign.memberIds, state.campaign.memberIds);
  assert.equal(moved.equipments.find((equipment) => equipment.id === "eq-0100").position.label, "Posição atualizada");
});

test("resumo separa equipamentos da campanha, referências legadas e etiquetas", () => {
  const state = createPatrimonyFixture();
  assert.deepEqual(inventorySummary(state), {
    totalEquipment: 488,
    campaignEquipment: 454,
    nonPatrimonial: 34,
    legacyReferences: 66,
    withoutNp: 440,
    withNp: 14,
    availableLabels: 3,
    bound: 2,
    applied: 2,
    verified: 10,
    annulled: 1,
    review: 8,
    emitted: 18,
  });
  assert.deepEqual(campaignProgress(state), {
    total: 454,
    withoutNp: 440,
    withNp: 14,
    applied: 12,
    verified: 10,
    withNpPercent: 3,
    appliedPercent: 3,
    verifiedPercent: 2,
  });
  const future = simulateEquipmentRegistration(state, {
    name: "Terminal fora do snapshot",
    category: "Terminais",
    idempotencyKey: "campaign-progress-future",
  });
  const appliedFuture = markLabelApplied(future.state, future.labels[0].id);
  assert.deepEqual(campaignProgress(appliedFuture.state), campaignProgress(state));
});

test("referência anterior permanece separada do NP canônico", () => {
  const state = createPatrimonyFixture();
  const equipment = state.equipments.find((item) => item.id === "eq-0001");
  const label = activeLabelForEquipment(state.labels, equipment.id);

  assert.equal(equipment.legacyCode, "LEG-EQP-0001");
  assert.equal(label.code, "NP-000008");
  assert.notEqual(equipment.legacyCode, label.code);
  assert.equal(state.equipments.filter((item) => item.category === "Máquina de Brindes")
    .every((item) => !activeLabelForEquipment(state.labels, item.id)), true);
});

test("Inventory Ledger busca sem acento e filtra identidade, posição e revisão", () => {
  const state = createPatrimonyFixture();
  assert.equal(filterInventory(state, {}, "savio").every((equipment) => equipment.position.label === "Bar do Sávio"), true);
  assert.equal(filterInventory(state, {}, "NP-000008")[0].id, "eq-0001");
  assert.equal(filterInventory(state, {}, "LEG-EQP-0001")[0].id, "eq-0001");
  assert.equal(filterInventory(state, { patrimony: "legacy" }).every((equipment) => equipment.legacyCode), true);
  assert.equal(filterInventory(state, { patrimony: "review" }).length, 8);
  assert.equal(filterInventory(state, { patrimony: "non_asset" }).length, 34);
  assert.equal(candidateEquipments(state, "bar-savio").every((equipment) => (
    equipment.eligible
    && equipment.position.id === "bar-savio"
    && !activeLabelForEquipment(state.labels, equipment.id)
  )), true);
  const directCandidate = candidateEquipments(state, "").find((equipment) => equipment.legacyCode);
  assert.equal(candidateEquipments(state, "", directCandidate.legacyCode).some((equipment) => equipment.id === directCandidate.id), true);
  assert.equal(candidateEquipments(state, "", directCandidate.position.label).some((equipment) => equipment.id === directCandidate.id), true);
});

test("preview estima sequência sem selecionar nem pré-associar equipamento", () => {
  const pristine = { ...createPatrimonyFixture(), labels: [], batches: [], nextBatchNumber: 1 };
  const preview = prepareBatchPreview(pristine, {
    quantity: 4,
    contextId: "estoque",
    idempotencyKey: "preview-pristine-001",
  });

  assert.equal(nextNpNumber(pristine.labels), 1);
  assert.deepEqual(preview.estimated, ["NP-000001", "NP-000002", "NP-000003", "NP-000004"]);
  assert.equal(preview.estimateLabel, "NP-000001 — NP-000004");
  assert.equal(preview.demand >= 0, true);
  assert.equal(preview.excess, Math.max(0, preview.quantity - preview.demand));
  assert.equal(Object.hasOwn(preview, "equipmentIds"), false);
  assert.equal(Object.hasOwn(preview, "equipments"), false);
});

test("geração cria etiquetas livres e repete a mesma chave sem consumir nova faixa", () => {
  const source = createPatrimonyFixture();
  const preview = prepareBatchPreview(source, {
    quantity: 5,
    contextId: "bar-savio",
    idempotencyKey: "batch-idempotent-001",
  });
  const generated = generateFreeLabelBatch(source, preview);
  const repeated = generateFreeLabelBatch(generated.state, preview);
  const generatedLabels = generated.state.labels.filter((label) => generated.batch.labelIds.includes(label.id));

  assert.equal(generated.replayed, false);
  assert.equal(generated.batch.id, "PAT-202609-0004");
  assert.deepEqual(generatedLabels.map((label) => label.code), [
    "NP-000019", "NP-000020", "NP-000021", "NP-000022", "NP-000023",
  ]);
  assert.equal(generatedLabels.every((label) => label.state === "disponivel" && label.equipmentId === null), true);
  assert.equal(repeated.replayed, true);
  assert.equal(repeated.batch.id, generated.batch.id);
  assert.equal(repeated.state.labels.length, generated.state.labels.length);
  assert.equal(nextNpNumber(repeated.state.labels), 24);
});

test("lote preparado recebe identidades livres apenas na confirmação", () => {
  const state = createPatrimonyFixture();
  const prepared = state.batches.find((batch) => batch.id === "PAT-202609-0002");
  assert.equal(prepared.labelIds.length, 0);
  const preview = prepareBatchPreview(state, {
    batchId: prepared.id,
    quantity: 2,
    contextId: prepared.context.id,
    idempotencyKey: "prepared-batch-001",
  });
  const generated = generateFreeLabelBatch(state, preview);

  assert.equal(generated.batch.id, prepared.id);
  assert.equal(generated.batch.labelIds.length, 2);
  assert.equal(generated.state.batches.length, state.batches.length);
  assert.equal(generated.state.labels.filter((label) => generated.batch.labelIds.includes(label.id))
    .every((label) => label.equipmentId === null), true);
});

test("vínculo rejeita posição divergente, categoria inelegível e duplo vínculo", () => {
  const generated = generateBatch();
  const labelId = generated.batch.labelIds[0];
  const candidate = candidateEquipments(generated.state, "bar-savio")[0];
  const machine = generated.state.equipments.find((equipment) => !equipment.eligible);

  assert.equal(bindFreeLabel(generated.state, {
    labelId,
    equipmentId: candidate.id,
    expectedLocation: "Posição desatualizada",
  }).code, "LOCATION_CHANGED");
  assert.equal(bindFreeLabel(generated.state, {
    labelId,
    equipmentId: machine.id,
    expectedLocation: machine.position.label,
  }).code, "EQUIPMENT_NOT_ELIGIBLE");

  const bound = bindFreeLabel(generated.state, {
    labelId,
    equipmentId: candidate.id,
    expectedLocation: candidate.position.label,
    idempotencyKey: "bind-transition-001",
  });
  assert.equal(bound.ok, true);
  assert.equal(bound.label.state, "vinculado");
  assert.equal(bound.label.equipmentId, candidate.id);
  const replayed = bindFreeLabel(bound.state, {
    labelId,
    equipmentId: candidate.id,
    expectedLocation: candidate.position.label,
    idempotencyKey: "bind-transition-001",
  });
  assert.equal(replayed.ok, true);
  assert.equal(replayed.replayed, true);
  assert.equal(replayed.state.events.length, bound.state.events.length);
  assert.equal(bindFreeLabel(bound.state, {
    labelId,
    equipmentId: candidate.id,
    expectedLocation: "Outro local",
    idempotencyKey: "bind-transition-001",
  }).code, "IDEMPOTENCY_CONFLICT");
  assert.equal(bindFreeLabel(bound.state, { labelId, equipmentId: candidate.id }).code, "LABEL_NOT_AVAILABLE");
});

test("vincular, aplicar e conferir são transições independentes e idempotentes", () => {
  const generated = generateBatch();
  const labelId = generated.batch.labelIds[0];
  const candidate = candidateEquipments(generated.state, "bar-savio")[0];
  const bound = bindFreeLabel(generated.state, {
    labelId,
    equipmentId: candidate.id,
    expectedLocation: candidate.position.label,
  });

  assert.equal(confirmLabel(bound.state, { labelId, input: bound.label.code }).code, "NOT_APPLIED");
  const applied = markLabelApplied(bound.state, labelId);
  assert.equal(applied.ok, true);
  assert.equal(applied.replayed, false);
  assert.equal(applied.label.state, "aplicado");
  assert.equal(markLabelApplied(applied.state, labelId).replayed, true);
  assert.equal(confirmLabel(applied.state, { labelId, input: "NP-999999" }).code, "CODE_MISMATCH");

  const verified = confirmLabel(applied.state, { labelId, input: applied.label.code.slice(-4), method: "codigo" });
  assert.equal(verified.ok, true);
  assert.equal(verified.label.state, "conferido");
  assert.equal(verified.label.verificationMethod, "codigo");
  assert.equal(confirmLabel(verified.state, { labelId, input: applied.label.code }).replayed, true);
});

test("resolução aceita código completo ou finais 4/6 e não adivinha entrada curta", () => {
  const labels = createPatrimonyFixture().labels;
  assert.equal(resolveLabelByCode(labels, "NP-000008").label.id, "pat-000008");
  assert.equal(resolveLabelByCode(labels, "0008").label.id, "pat-000008");
  assert.equal(resolveLabelByCode(labels, "000008").label.id, "pat-000008");
  assert.equal(resolveLabelByCode(labels, "008").status, "invalid");
  assert.equal(resolveLabelByCode(labels, "9999").status, "not_found");
});

test("correção de vínculo exige motivo e encerra após conferência", () => {
  const state = createPatrimonyFixture();
  const replacement = candidateEquipments(state, "bar-savio")[0];
  assert.equal(correctBindingBeforeVerification(state, {
    labelId: "pat-000004",
    equipmentId: replacement.id,
    reason: "não",
  }).code, "REASON_REQUIRED");
  const corrected = correctBindingBeforeVerification(state, {
    labelId: "pat-000004",
    equipmentId: replacement.id,
    reason: "Equipamento físico divergente",
  });
  assert.equal(corrected.ok, true);
  assert.equal(corrected.state.labels.find((label) => label.id === "pat-000004").equipmentId, replacement.id);
  assert.equal(correctBindingBeforeVerification(state, {
    labelId: "pat-000008",
    equipmentId: replacement.id,
    reason: "Tentativa após conferência",
  }).code, "CORRECTION_BLOCKED");
});

test("cadastro futuro cria equipamento e NP vinculados no mesmo resultado local", () => {
  const state = createPatrimonyFixture();
  const startNp = nextNpNumber(state.labels);
  const created = simulateEquipmentRegistration(state, {
    name: "Terminal novo",
    category: "Terminais",
    quantity: 3,
    idempotencyKey: "future-registration-001",
  });

  assert.equal(created.ok, true);
  assert.equal(created.patrimonial, true);
  assert.equal(created.equipments.length, 3);
  assert.equal(created.labels.length, 3);
  assert.deepEqual(created.labels.map((label) => label.number), [startNp, startNp + 1, startNp + 2]);
  assert.equal(created.labels.every((label, index) => (
    label.origin === "cadastro"
    && label.state === "vinculado"
    && label.equipmentId === created.equipments[index].id
    && label.batchId === null
    && label.campaignId === null
  )), true);
  assert.equal(created.state.equipments.length, state.equipments.length + 3);
  assert.equal(created.state.labels.length, state.labels.length + 3);
  const replayed = simulateEquipmentRegistration(created.state, {
    name: "Terminal novo",
    category: "Terminais",
    quantity: 3,
    idempotencyKey: "future-registration-001",
  });
  assert.equal(replayed.replayed, true);
  assert.equal(replayed.state.equipments.length, created.state.equipments.length);
  assert.equal(replayed.labels.length, 3);
  assert.equal(simulateEquipmentRegistration(created.state, {
    name: "Terminal divergente",
    category: "Terminais",
    quantity: 3,
    idempotencyKey: "future-registration-001",
  }).code, "IDEMPOTENCY_CONFLICT");
});

test("Máquina de Brindes pode ser cadastrada sem consumir NP", () => {
  const state = createPatrimonyFixture();
  const before = nextNpNumber(state.labels);
  const created = simulateEquipmentRegistration(state, {
    name: "Máquina nova",
    category: "Máquina de Brindes",
    quantity: 2,
  });

  assert.equal(created.ok, true);
  assert.equal(created.patrimonial, false);
  assert.equal(created.equipments.length, 2);
  assert.equal(created.labels.length, 0);
  assert.equal(nextNpNumber(created.state.labels), before);
  assert.equal(created.equipments.every((equipment) => !equipment.eligible), true);
});

test("public_id compacto é único, opaco e forma rota QR sem dados operacionais", () => {
  const state = createPatrimonyFixture();
  const ids = state.labels.map((label) => label.publicId);
  assert.equal(ids.every((publicId) => PUBLIC_ID_PATTERN.test(publicId)), true);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(compactPublicId(1).length, 22);

  const label = state.labels[0];
  const payload = buildQrPayload(label);
  assert.equal(payload, `https://neptera.vercel.app/patrimonio/${label.publicId}`);
  assert.equal(payload.includes(label.code), false);
  assert.equal(payload.includes("eq-"), false);
  assert.throws(() => buildQrPayload("uuid-nao-e-o-contrato"), /public_id compacto/);
});

test("deep link exige login, respeita papel/escopo e cobre estados patrimoniais", () => {
  const state = createPatrimonyFixture();
  const available = state.labels.find((label) => label.state === "disponivel");
  const bound = state.labels.find((label) => label.state === "vinculado");
  const applied = state.labels.find((label) => label.state === "aplicado");
  const linkedInManagerScope = state.labels.find((label) => label.id === "pat-000009");
  const annulled = state.labels.find((label) => label.state === "anulado");
  const lowered = {
    ...state,
    labels: [...state.labels, {
      ...linkedInManagerScope,
      id: "pat-baixado",
      publicId: "BBBBBBBBBBBBBBBBBBBBBB",
      state: "baixado",
      equipmentId: "eq-0073",
    }],
  };

  assert.deepEqual(deepLinkState(state, available.publicId, { authenticated: false }), {
    screen: "login",
    preserveDestination: true,
    disclosure: false,
  });
  assert.equal(deepLinkState(state, available.publicId, { role: "administrador" }).screen, "activate");
  assert.deepEqual(deepLinkState(state, available.publicId, { role: "gerente", managerName: "Caio Nobre" }), {
    screen: "forbidden",
    disclosure: false,
  });
  assert.deepEqual(deepLinkState(state, available.publicId, { role: "consulta" }), {
    screen: "forbidden",
    disclosure: false,
  });
  assert.equal(deepLinkState(state, bound.publicId, { role: "operador" }).screen, "vinculado");
  assert.equal(deepLinkState(state, applied.publicId, { role: "operador" }).screen, "aplicado");
  const resolved = deepLinkState(state, linkedInManagerScope.publicId, { role: "gerente", managerName: "Caio Nobre" });
  assert.equal(resolved.screen, "conferido");
  assert.equal(resolved.equipment.id, linkedInManagerScope.equipmentId);
  assert.deepEqual(deepLinkState(state, linkedInManagerScope.publicId, { role: "gerente", managerName: "Outra pessoa" }), {
    screen: "forbidden",
    disclosure: false,
  });
  assert.equal(deepLinkState(state, annulled.publicId, { role: "administrador" }).screen, "anulado");
  assert.equal(deepLinkState(lowered, "BBBBBBBBBBBBBBBBBBBBBB", { role: "administrador" }).screen, "baixado");
  assert.deepEqual(deepLinkState(state, "AAAAAAAAAAAAAAAAAAAAAA"), {
    screen: "not_found",
    message: "Patrimônio não encontrado ou indisponível para seu acesso.",
  });
});

test("impressão de etiquetas livres não carrega equipamento, nome ou posição", () => {
  const generated = generateBatch();
  const job = buildLabelPrintJob(generated.state, generated.batch);

  assert.equal(job.contract, "neptera.patrimonio.free-labels.v2");
  assert.equal(job.sample, true);
  assert.equal(job.labels.length, 3);
  assert.equal(job.labels.every((label) => PUBLIC_ID_PATTERN.test(label.publicId)), true);
  for (const label of job.labels) {
    assert.deepEqual(Object.keys(label).sort(), ["labelId", "patrimonyCode", "publicId", "qrPayload", "state"].sort());
    assert.equal(label.qrPayload, `https://neptera.vercel.app/patrimonio/${label.publicId}`);
  }
  assert.equal(JSON.stringify(job).includes("equipmentId"), false);
  assert.equal(JSON.stringify(job).includes("currentPosition"), false);
});

test("relatório de rota é pré-associação e relatório final é pós-implantação", () => {
  const state = createPatrimonyFixture();
  const batch = state.batches.find((item) => item.id === "PAT-202609-0001");
  const completedBatch = state.batches.find((item) => item.id === "PAT-202609-0003");
  const future = simulateEquipmentRegistration(state, {
    name: "Equipamento futuro fora da campanha",
    category: "Terminais",
    idempotencyKey: "route-report-future",
  });
  const route = buildRouteReportJob(future.state, batch);
  const final = buildFinalReportJob(state, completedBatch);
  const campaignMembers = new Set(state.campaign.memberIds);
  const activeEquipmentIds = new Set(
    future.state.labels
      .filter((label) => label.equipmentId && !["anulado", "baixado"].includes(label.state))
      .map((label) => label.equipmentId),
  );

  assert.equal(route.contract, "neptera.patrimonio.route-report.v2");
  assert.equal(route.sample, true);
  assert.equal(route.rows.length > 0, true);
  assert.equal(route.rows.every((row) => !Object.hasOwn(row, "patrimonyCode") && !Object.hasOwn(row, "publicId")), true);
  assert.equal(route.rows.every((row) => campaignMembers.has(row.equipmentId)), true);
  assert.equal(route.rows.every((row) => !activeEquipmentIds.has(row.equipmentId)), true);
  assert.equal(route.rows.some((row) => row.equipmentId === future.equipments[0].id), false);
  assert.equal(final.contract, "neptera.patrimonio.final-report.v2");
  assert.equal(final.sample, true);
  assert.equal(final.rows.length, completedBatch.labelIds.length);
  assert.equal(final.rows.every((row) => /^NP-\d{6}$/.test(row.patrimonyCode)), true);
  assert.equal(final.rows.every((row) => row.category && row.currentPosition), true);
  assert.equal(final.rows.every((row) => row.state === "conferido"), true);
  assert.equal(buildFinalReportJob(state, batch), null);
});

test("etiquetas do cadastro futuro reutilizam o mesmo contrato seguro de QR", () => {
  const created = simulateEquipmentRegistration(createPatrimonyFixture(), {
    name: "Terminal futuro",
    category: "Terminais",
    quantity: 2,
    idempotencyKey: "registration-print-001",
  });
  const job = buildRegistrationLabelPrintJob(created.labels);

  assert.equal(job.contract, "neptera.patrimonio.registration-labels.v2");
  assert.equal(job.sample, true);
  assert.equal(job.labels.length, 2);
  assert.equal(job.labels.every((label) => PUBLIC_ID_PATTERN.test(label.publicId)), true);
  assert.equal(job.labels.every((label) => label.qrPayload.endsWith(`/${label.publicId}`)), true);
  assert.equal(JSON.stringify(job).includes("equipmentId"), false);
});

test("progresso do lote mede etiquetas e não equipamentos pré-selecionados", () => {
  const state = createPatrimonyFixture();
  const batch = state.batches.find((item) => item.id === "PAT-202609-0001");
  assert.deepEqual(batchProgress(state, batch), {
    total: 12,
    available: 3,
    bound: 2,
    applied: 2,
    verified: 4,
    annulled: 1,
    resolved: 5,
    percent: 42,
  });
  assert.equal(Object.hasOwn(batch, "equipmentIds"), false);
});

test("harness é local, isolado do app real e protegido por DEV", async () => {
  const isolatedFiles = ["fixtures.js", "model.js", "integrationPoints.js", "Icons.jsx", "PatrimonioHarnessApp.jsx"];
  const source = (await Promise.all(isolatedFiles.map(read))).join("\n");
  const main = await read("main.jsx");
  for (const forbidden of [
    "@supabase", "createClient(", "fetch(", "localStorage", "sessionStorage",
    "mediaDevices", "getUserMedia", "../App", "./App.jsx", "serviceWorker",
  ]) {
    assert.equal(source.includes(forbidden), false, `referência proibida encontrada: ${forbidden}`);
  }
  assert.match(source, /data-harness="safe-local"/);
  assert.match(source, /onArtifactRequest/);
  assert.match(source, /onQrRequest/);
  assert.match(main, /import\.meta\.env\.DEV/);
});

test("entrada dedicada expõe três áreas e cenários operacionais, sem quarta navegação", async () => {
  const html = await readFile(path.join(PROJECT_DIR, "patrimonio-v1.html"), "utf8");
  const app = await read("PatrimonioHarnessApp.jsx");
  assert.match(html, /noindex,nofollow/);
  assert.match(html, /src\/patrimonio-v1\/main\.jsx/);
  assert.doesNotMatch(html, /https?:\/\//, "o harness isolado não deve carregar recursos externos");
  for (const mode of ["Visão geral", "Lotes", "Implantação"]) assert.match(app, new RegExp(mode));
  for (const scenario of [
    "Campanha inicial", "Inventory Ledger", "Dossiê", "Legado + NP", "Máquina de Brindes",
    "Cadastro novo", "Cadastro múltiplo", "Lote aberto", "Ativação mobile", "Bar do Sávio",
    "Aplicação", "Conferência", "Concluído", "Divergência", "Estado vazio", "Estado de erro",
  ]) assert.equal(app.includes(scenario), true, `cenário ausente: ${scenario}`);
  assert.match(app, /Confirmo a geração local/);
  assert.match(app, /Excesso sob confirmação/);
  assert.match(app, /LOCALIZAÇÃO MANUAL/);
  assert.match(app, /Buscar em toda a base/);
  assert.match(app, /RESULTADO ATÔMICO/);
  assert.match(app, /A campanha mede equipamentos/);
});

test("estilos preservam foco, Light/Dark, mobile e movimento reduzido", async () => {
  const css = await read("patrimonio-v1.css");
  assert.match(css, /focus-visible/);
  assert.match(css, /data-theme="escuro"/);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /@media \(max-width: 820px\)/);
  assert.match(css, /@media \(max-width: 430px\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /--pv-teal:\s*#2e747b/);
  assert.match(css, /--pv-green:\s*#2f7655/);
  assert.match(css, /--pv-amber:\s*#9a681c/);
  const app = await read("PatrimonioHarnessApp.jsx");
  assert.match(app, /keepDialogFocus/);
  assert.match(app, /aria-labelledby="pv-qr-title"/);
});
