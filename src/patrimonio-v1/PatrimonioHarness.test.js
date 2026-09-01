import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createPatrimonyFixture } from "./fixtures.js";
import { buildLabelPrintJob, buildQrPayload } from "./integrationPoints.js";
import {
  batchProgress,
  filterInventory,
  generateSimulatedBatch,
  inventorySummary,
  markDeployment,
  nextNpNumber,
  prepareBatchPreview,
  resolveAssetByCode,
} from "./model.js";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = path.resolve(CURRENT_DIR, "../..");
const read = (file) => readFile(path.join(CURRENT_DIR, file), "utf8");

test("fixture fictícia preserva os totais patrimoniais aprovados", () => {
  const items = createPatrimonyFixture();
  const summary = inventorySummary(items);

  assert.equal(items.length, 488);
  assert.deepEqual(summary, {
    total: 488,
    eligible: 454,
    withPatrimony: 66,
    eligibleWithPatrimony: 58,
    eligibleWithoutPatrimony: 396,
    ready: 388,
    review: 8,
    legacy: 66,
    np: 0,
    npEmitted: 0,
    npApplied: 0,
    npVerified: 0,
    nonPatrimonial: 34,
  });
  assert.equal(items.some((item) => item.patrimonyCode.startsWith("NP-")), false);
  assert.equal(new Set(items.map((item) => item.id)).size, 488);
  assert.equal(new Set(items.map((item) => item.publicId)).size, 488);
});

test("as 34 Máquinas de Brindes ficam fora da nova faixa, com 8 legados e 26 sem código", () => {
  const fixture = createPatrimonyFixture();
  const machines = fixture.filter((item) => item.eligibility === "non_asset");
  assert.equal(machines.length, 34);
  assert.equal(fixture.filter((item) => item.category === "Máquina de Brindes").length, 34);
  assert.ok(machines.every((item) => item.category === "Máquina de Brindes"));
  assert.equal(machines.filter((item) => item.patrimonyKind === "legacy").length, 8);
  assert.equal(machines.filter((item) => !item.patrimonyCode).length, 26);
});

test("busca do Inventory Ledger cobre patrimônio e ID técnico terciário", () => {
  const items = createPatrimonyFixture();
  const legacy = items.find((item) => item.patrimonyCode === "LEG-EQP-0007");
  assert.equal(filterInventory(items, {}, "LEG-EQP-0007")[0].id, legacy.id);
  assert.equal(filterInventory(items, {}, legacy.technicalId)[0].id, legacy.id);
  assert.ok(filterInventory(items, { patrimony: "missing" }, "").length > 0);
  assert.ok(filterInventory(items, { patrimony: "legacy" }, "").every((item) => item.patrimonyKind === "legacy"));
});

test("preview mostra incluídos, exclusões e começa a sequência em NP-000001", () => {
  const preview = prepareBatchPreview(createPatrimonyFixture(), {}, "", 24);
  assert.equal(preview.scopeCount, 488);
  assert.equal(preview.included.length, 24);
  assert.equal(preview.excluded.length, 464);
  assert.equal(preview.rangeLabel, "NP-000001 — NP-000024");
  assert.deepEqual(preview.excludedCounts, {
    alreadyCoded: 58,
    review: 8,
    legacy: 0,
    nonPatrimonial: 34,
    beyondLimit: 364,
    other: 0,
  });
});

test("geração simulada é idempotente e não renumera uma confirmação repetida", () => {
  const source = createPatrimonyFixture();
  const preview = prepareBatchPreview(source, {}, "", 24);
  const generated = generateSimulatedBatch({ items: source, batches: [] }, preview);
  const repeated = generateSimulatedBatch({ items: generated.items, batches: generated.batches }, preview);

  assert.equal(generated.batch.id, "PAT-202609-0001");
  assert.equal(generated.batch.rangeLabel, "NP-000001 — NP-000024");
  assert.equal(generated.batches.length, 1);
  assert.equal(repeated.reused, true);
  assert.equal(repeated.batches.length, 1);
  assert.equal(nextNpNumber(generated.items), 25);
  assert.equal(inventorySummary(generated.items).npEmitted, 24);
});

test("aplicação e conferência são etapas separadas e aceitam código completo ou finais 4/6", () => {
  const source = createPatrimonyFixture();
  const preview = prepareBatchPreview(source, {}, "", 12);
  const generated = generateSimulatedBatch({ items: source, batches: [] }, preview);
  const firstId = generated.batch.itemIds[0];

  assert.equal(resolveAssetByCode(generated.items, "NP-000001", generated.batch.itemIds).item.id, firstId);
  assert.equal(resolveAssetByCode(generated.items, "0001", generated.batch.itemIds).item.id, firstId);
  assert.equal(resolveAssetByCode(generated.items, "000001", generated.batch.itemIds).item.id, firstId);
  assert.equal(resolveAssetByCode(generated.items, "001", generated.batch.itemIds).status, "invalid");

  const applied = markDeployment(generated.items, firstId, "apply");
  assert.equal(applied.changed, true);
  assert.deepEqual(batchProgress(applied.items, generated.batch), { total: 12, pending: 11, applied: 1, verified: 0, appliedPercent: 8, verifiedPercent: 0 });
  const verified = markDeployment(applied.items, firstId, "verify");
  assert.equal(verified.changed, true);
  assert.equal(batchProgress(verified.items, generated.batch).verified, 1);
  assert.equal(markDeployment(verified.items, firstId, "verify").changed, false);
});

test("contrato QR contém somente o deep link canônico com public_id UUID", () => {
  const item = createPatrimonyFixture()[0];
  const payload = buildQrPayload(item);
  assert.equal(payload, `https://neptera.vercel.app/?modulo=equipamentos&ativo=${item.publicId}`);
  assert.equal(payload.includes(item.technicalId), false);
  assert.equal(payload.includes(item.patrimonyCode), false);

  const generated = generateSimulatedBatch({ items: createPatrimonyFixture(), batches: [] }, prepareBatchPreview(createPatrimonyFixture(), {}, "", 1));
  const job = buildLabelPrintJob(generated.batch, generated.items);
  assert.equal(job.labels.length, 1);
  assert.match(job.labels[0].publicId, /^[0-9a-f-]{36}$/i);
  assert.equal(job.labels[0].qrPayload, `https://neptera.vercel.app/?modulo=equipamentos&ativo=${job.labels[0].qrPayload.split("ativo=")[1]}`);
  assert.match(job.labels[0].qrPayload, /ativo=[0-9a-f-]{36}$/i);
});

test("harness permanece isolado de app real, rede, persistência e captura", async () => {
  const files = ["fixtures.js", "model.js", "integrationPoints.js", "Icons.jsx", "PatrimonioHarnessApp.jsx", "main.jsx"];
  const source = (await Promise.all(files.map(read))).join("\n");
  for (const forbidden of ["@supabase", "createClient(", "fetch(", "localStorage", "sessionStorage", "mediaDevices", "getUserMedia", "../App", "./App.jsx", "serviceWorker"]) {
    assert.equal(source.includes(forbidden), false, `referência proibida encontrada: ${forbidden}`);
  }
  assert.match(source, /data-harness="safe-local"/);
  assert.match(source, /onPdfRequest\?\./);
  assert.match(source, /onQrRequest\?\./);
});

test("entrada dedicada expõe três modos, temas, estados e confirmação explícita", async () => {
  const html = await readFile(path.join(PROJECT_DIR, "patrimonio-v1.html"), "utf8");
  const app = await read("PatrimonioHarnessApp.jsx");
  assert.match(html, /noindex,nofollow/);
  assert.match(html, /src\/patrimonio-v1\/main\.jsx/);
  assert.match(html, /neptera-favicon-48\.png/);
  for (const mode of ["Visão geral", "Lotes", "Implantação"]) assert.match(app, new RegExp(mode));
  for (const state of ["dados", "vazio", "erro"]) assert.match(app, new RegExp(state));
  assert.match(app, /tema/);
  assert.match(app, /Confirmo a geração simulada desta faixa/);
  assert.match(app, /Aplicar etiqueta/);
  assert.match(app, /Conferir etiqueta/);
});

test("estilos preservam foco, mobile e movimento reduzido", async () => {
  const css = await read("patrimonio-v1.css");
  assert.match(css, /focus-visible/);
  assert.match(css, /@media \(max-width: 780px\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /--pv-action:\s*#a65338/);
  assert.match(css, /--pv-green:\s*#2f7252/);
  assert.match(css, /--pv-amber:\s*#79591f/);
});
