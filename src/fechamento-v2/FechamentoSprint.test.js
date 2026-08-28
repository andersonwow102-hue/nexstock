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
  assert.equal(totals.entries, 54100);
  assert.equal(totals.commissions, 6252);
  assert.equal(totals.exits, 34000);
  assert.equal(totals.grossBalance, 13848);
  assert.equal(totals.registeredExpenses, 2860);
  assert.equal(totals.consolidatedExpenses, 2690);
  assert.equal(totals.toTransfer, 10042.2);
});

test("harness possui entrada própria e três conceitos independentes", () => {
  const html = read("fechamento-v2.html");
  const app = read("src/fechamento-v2/FechamentoSprintApp.jsx");
  assert.match(html, /src\/fechamento-v2\/main\.jsx/);
  assert.doesNotMatch(html, /manifest\.webmanifest|serviceWorker/i);
  for (const concept of ["ConceptA", "ConceptB", "ConceptC"]) assert.match(app, new RegExp(concept));
  assert.match(app, /searchParams\.set\("conceito"/);
  assert.match(app, /searchParams\.set\("tema"/);
});

test("harness não importa backend, Supabase ou o Fechamento real", () => {
  const files = [
    "src/fechamento-v2/main.jsx",
    "src/fechamento-v2/model.js",
    "src/fechamento-v2/shared.jsx",
    "src/fechamento-v2/FechamentoSprintApp.jsx",
    "src/fechamento-v2/ConceptA.jsx",
    "src/fechamento-v2/ConceptB.jsx",
    "src/fechamento-v2/ConceptC.jsx",
  ];
  const combined = files.map(read).join("\n");
  assert.doesNotMatch(combined, /supabase|@sentry|FechamentoWorkbench|\/rest\/v1|fetch\s*\(/i);
});
