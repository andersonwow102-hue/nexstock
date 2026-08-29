import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  CATEGORIES,
  STATUSES,
  createEquipmentFixture,
  filterEquipment,
  needsAction,
  positionOf,
  simulateMovement,
  summaryCounts,
} from "./model.js";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = path.resolve(CURRENT_DIR, "../..");

test("fixture preserva categorias e estados reais nas escalas de QA", () => {
  const expectedCategories = [
    "Televisões",
    "Terminais",
    "Impressoras",
    "Tablets",
    "Carregadores",
    "Máquina de Brindes",
    "Totens",
    "Noteiro",
    "PDV Touchscreen",
  ];
  assert.deepEqual(CATEGORIES, expectedCategories);
  assert.deepEqual(STATUSES, ["Disponível", "Em rota", "Em conserto"]);
  for (const scale of [40, 150]) {
    const items = createEquipmentFixture(scale);
    assert.equal(items.length, scale);
    assert.deepEqual(new Set(items.map((item) => item.categoria)), new Set(expectedCategories));
    assert.equal(new Set(items.map((item) => item.id)).size, scale);
    assert.equal(new Set(items.map((item) => item.code)).size, scale);
  }
});

test("posição e estado permanecem dimensões distintas", () => {
  const items = createEquipmentFixture(40);
  const counts = summaryCounts(items);
  assert.deepEqual(counts, { total: 40, internal: 12, point: 16, manager: 8, repair: 4, attention: 8 });
  const managerStock = items.find((item) => item.transferenciaStatus === "recebido");
  assert.equal(managerStock.status, "Disponível");
  assert.equal(positionOf(managerStock).key, "manager");
  const pending = items.find((item) => item.transferenciaStatus === "aguardando_confirmacao");
  assert.equal(positionOf(pending).groupKey, "manager");
  assert.equal(needsAction(pending).key, "confirmation");
  const repair = items.find((item) => item.status === "Em conserto");
  assert.equal(positionOf(repair).key, "repair");
  assert.equal(needsAction(repair).key, "repair");
});

test("busca cobre equipamento, categoria, ponto, gerente e identificador", () => {
  const items = createEquipmentFixture(40);
  const sample = items[0];
  assert.ok(filterEquipment(items, {}, sample.code).some((item) => item.id === sample.id));
  assert.ok(filterEquipment(items, {}, "televisoes").length > 0);
  assert.ok(filterEquipment(items, {}, "Ponto Alameda").length > 0);
  assert.ok(filterEquipment(items, {}, "Ana Ribeiro").length > 0);
  assert.equal(filterEquipment(items, {}, "registro inexistente").length, 0);
});

test("filtros operacionais combinam categoria, estado e posição", () => {
  const items = createEquipmentFixture(150);
  const result = filterEquipment(items, { category: "Tablets", status: "Em rota", position: "point" }, "");
  assert.ok(result.length > 0);
  assert.ok(result.every((item) => item.categoria === "Tablets"));
  assert.ok(result.every((item) => item.status === "Em rota"));
  assert.ok(result.every((item) => positionOf(item).key === "point"));
});

test("movimentação simulada atualiza registro e rastro sem mutar a origem", () => {
  const original = createEquipmentFixture(40);
  const source = original[4];
  const beforeHistory = source.history.length;
  const pointResult = simulateMovement(original, source.id, { type: "point", destination: "Ponto Vale Azul", note: "Reposição" });
  assert.equal(original[4].localizacao, "");
  assert.equal(pointResult.item.localizacao, "Ponto Vale Azul");
  assert.equal(pointResult.item.status, "Em rota");
  assert.equal(pointResult.item.history.length, beforeHistory + 1);

  const managerResult = simulateMovement(pointResult.items, source.id, { type: "manager", destination: "Caio Nobre" });
  assert.equal(managerResult.item.transferenciaStatus, "aguardando_confirmacao");
  assert.equal(positionOf(managerResult.item).key, "manager_pending");

  const repairResult = simulateMovement(managerResult.items, source.id, { type: "repair", destination: "Assistência parceira", note: "Falha de alimentação" });
  assert.equal(repairResult.item.status, "Em conserto");
  assert.equal(repairResult.item.consertoDefeito, "Falha de alimentação");

  const internalResult = simulateMovement(repairResult.items, source.id, { type: "internal" });
  assert.equal(internalResult.item.status, "Disponível");
  assert.equal(positionOf(internalResult.item).key, "internal");
});

test("harness permanece isolado de app real, rede e persistência", async () => {
  const files = (await readdir(CURRENT_DIR)).filter((file) => /\.(jsx|js)$/.test(file) && !file.endsWith(".test.js"));
  const source = (await Promise.all(files.map((file) => readFile(path.join(CURRENT_DIR, file), "utf8")))).join("\n");
  for (const forbidden of ["@supabase", "createClient(", "localStorage", "sessionStorage", "fetch(", "../App", "./App"] ) {
    assert.equal(source.includes(forbidden), false, `referência proibida encontrada: ${forbidden}`);
  }
  assert.match(source, /simulateMovement/);
  assert.match(source, /createEquipmentFixture/);
});

test("entrada dedicada expõe conceitos, temas, escala e marca oficial", async () => {
  const html = await readFile(path.join(PROJECT_DIR, "equipamentos-v2.html"), "utf8");
  const app = await readFile(path.join(CURRENT_DIR, "EquipamentosSprintApp.jsx"), "utf8");
  assert.match(html, /noindex,nofollow/);
  assert.match(html, /neptera-favicon-48\.png/);
  assert.match(html, /src\/equipamentos-v2\/main\.jsx/);
  for (const concept of ["Inventory Ledger", "Asset Command", "Position Workspace"]) assert.match(app, new RegExp(concept));
  assert.match(app, /scale === 150/);
  for (const state of ["vazio", "carregando", "erro"]) assert.match(app, new RegExp(state));
});

test("conceitos declaram assinaturas e adaptação de movimento reduzido", async () => {
  const expected = [
    ["concept-a.css", /ledger|lombada|register/i],
    ["concept-b.css", /command|cust[oó]dia|rail/i],
    ["concept-c.css", /workspace|now|context/i],
  ];
  for (const [file, signature] of expected) {
    const css = await readFile(path.join(CURRENT_DIR, file), "utf8");
    assert.match(css, signature);
    assert.match(css, /prefers-reduced-motion/);
  }
});
