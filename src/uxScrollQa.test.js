import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("./ux-scroll-qa/UxScrollQaApp.jsx", import.meta.url), "utf8");
const entry = readFileSync(new URL("./ux-scroll-qa/main.jsx", import.meta.url), "utf8");
const html = readFileSync(new URL("../ux-scroll-qa.html", import.meta.url), "utf8");
const historyPage = readFileSync(new URL("./HistoricoTimelinePage.jsx", import.meta.url), "utf8");
const historyContract = readFileSync(new URL("./historicoTimeline.js", import.meta.url), "utf8");
const source = `${app}\n${entry}\n${html}`;

test("harness crítico de UX é local, isolado e sem caminhos de escrita", () => {
  assert.doesNotMatch(source, /supabase|db\.js|fetch\(|localStorage|sessionStorage/i);
  assert.doesNotMatch(source, /from\s+["'](?:\.\/|\.\.\/)(?:App|PointsPage|FechamentoWorkbench)\.jsx["']/);
  assert.match(source, /Fixture isolada · zero escrita/);
});

test("fixtures cobrem os volumes auditados sem alterar a paginação visual", () => {
  assert.match(app, /Array\.from\(\{ length: 252 \}/);
  assert.match(app, /Array\.from\(\{ length: 50 \}/);
  assert.match(app, /Array\.from\(\{ length: 500 \}/);
  assert.match(app, /HistoricoTimelinePage/);
  assert.match(historyPage, /paginateHistoryEvents\(filteredEvents, page/);
  assert.match(historyContract, /HISTORY_PAGE_SIZE = 35/);
  assert.match(app, /<option value="20">20<\/option><option value="100">100<\/option><option value="500">500<\/option>/);
});

test("todos os módulos possuem marcador final e Gerentes monta um ledger por vez", () => {
  for (const module of ["pontos", "gerentes", "fechamento", "acessos", "logins", "historico"]) {
    assert.match(app, new RegExp(`\\["${module}",`));
  }
  assert.match(app, /data-qa-last="true"/);
  assert.match(app, /consultaGerenteVisao|view === "pontos"/);
  assert.match(app, /view === "pontos" \? <><span className="consulta-cf-point-state"/);
});
