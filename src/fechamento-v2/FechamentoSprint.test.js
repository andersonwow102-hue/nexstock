import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateFinancials, createInitialAdjustments, createInitialValues, FIXTURE } from "./model.js";

const ROOT = new URL("../../", import.meta.url);

function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), "utf8");
}

test("fixture V2 mantém o cenário financeiro solicitado", () => {
  const totals = calculateFinancials(createInitialValues(), createInitialAdjustments());
  assert.equal(FIXTURE.routes[0].name, "Vale Azul");
  assert.equal(FIXTURE.routes[0].manager, "Caio Nobre");
  assert.equal(FIXTURE.routes[0].points, 7);
  assert.equal(FIXTURE.routes[0].equipment, 19);
  assert.equal(FIXTURE.competenceLabel, "Julho de 2026");
  assert.equal(FIXTURE.status, "Pronto para revisão");
  assert.deepEqual(
    FIXTURE.modalities.map(({ name, entry, commission, exit }) => ({ name, entry, commission, exit })),
    [
      { name: "90 da Sorte", entry: 24800, commission: 2480, exit: 16200 },
      { name: "ViaPix", entry: 17400, commission: 1392, exit: 10500 },
      { name: "Lotobanca", entry: 11900, commission: 2380, exit: 7300 },
    ],
  );
  assert.equal(totals.entries, 54100);
  assert.equal(totals.commissions, 6252);
  assert.equal(totals.exits, 34000);
  assert.equal(totals.grossBalance, 13848);
  assert.equal(totals.registeredExpenses, 2860);
  assert.equal(totals.consolidatedExpenses, 2690);
  assert.equal(totals.afterExpenses, 11158);
  assert.equal(totals.managerCommission, 1115.8);
  assert.equal(totals.toTransfer, 10042.2);
  assert.deepEqual(FIXTURE.adjustments, { playBet: 350, costAid: 180, extraCommission: 0 });
  assert.deepEqual(
    FIXTURE.expenses.map(({ name, source, value }) => ({ name, source, value })),
    [
      { name: "Manutenção de terminal", source: "Estação Cedro", value: 840 },
      { name: "Deslocamento operacional", source: "Ponto Horizonte", value: 1120 },
      { name: "Apoio de rota", source: "Caio Nobre", value: 900 },
    ],
  );
});

test("harness possui entrada própria e uma única direção final", () => {
  const html = read("fechamento-v2.html");
  const app = read("src/fechamento-v2/FechamentoSprintApp.jsx");
  assert.match(html, /src\/fechamento-v2\/main\.jsx/);
  assert.doesNotMatch(html, /manifest\.webmanifest|serviceWorker/i);
  assert.match(app, /import VariantFinal from "\.\/VariantFinal\.jsx"/);
  assert.doesNotMatch(app, /import VariantA[123]/);
  assert.doesNotMatch(app, /ConceptA|ConceptB|ConceptC/);
  assert.match(app, /<VariantFinal workspace=\{workspace\}/);
  assert.match(app, /searchParams\.set\("variacao", "FINAL"\)/);
  assert.match(app, /searchParams\.set\("tema"/);
  assert.doesNotMatch(app, /VARIATIONS\.map|v2-concept-switch/);
});

test("direção final preserva a mesa A1 e transplanta somente o parecer A3", () => {
  const final = read("src/fechamento-v2/VariantFinal.jsx");
  for (const a1Part of ["a1__context", "a1__financial-unit", "a1__expenses", "a1__conference"]) {
    assert.match(final, new RegExp(a1Part));
  }
  for (const a3Part of ["variant-a3__decision", "variant-a3__identity", "variant-a3__status-ladder", "variant-a3__composition", "variant-a3__final", "variant-a3__action-block"]) {
    assert.match(final, new RegExp(a3Part));
  }
  assert.doesNotMatch(final, /a1__result|variant-a3__financial-line|variant-a3__review/);
});

test("harness não importa backend, Supabase ou o Fechamento real", () => {
  const files = [
    "src/fechamento-v2/main.jsx",
    "src/fechamento-v2/model.js",
    "src/fechamento-v2/shared.jsx",
    "src/fechamento-v2/FechamentoSprintApp.jsx",
    "src/fechamento-v2/VariantA1.jsx",
    "src/fechamento-v2/VariantA2.jsx",
    "src/fechamento-v2/VariantA3.jsx",
    "src/fechamento-v2/VariantFinal.jsx",
  ];
  const combined = files.map(read).join("\n");
  assert.doesNotMatch(combined, /supabase|@sentry|FechamentoWorkbench|\/rest\/v1|fetch\s*\(/i);
});
