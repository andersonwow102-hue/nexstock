import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const app = read("./App.jsx");
const db = read("./db.js");
const pointsPage = read("./PointsPage.jsx");
const page = read("./HistoricoTimelinePage.jsx");
const css = read("./HistoricoTimeline.css");
const preview = read("./HistoricoTimelinePreviewApp.jsx");
const main = read("./main.jsx");

test("mapper preserva timestamp canônico e modo estrito sem mudar a consulta", () => {
  assert.match(db, /carregarHistoricoEquipamentos\(\{ strict = false \} = \{\}\)/);
  assert.match(db, /carregarHistoricoPontos\(\{ strict = false \} = \{\}\)/);
  assert.equal((db.match(/createdAt: h\.created_at \|\| null/g) || []).length, 2);
  assert.match(db, /\.from\('historico_equipamentos'\)[\s\S]*?\.select\('\*'\)[\s\S]*?\.order\('created_at', \{ ascending: false \}\)/);
  assert.match(db, /\.from\('historico_pontos'\)[\s\S]*?\.select\('\*'\)[\s\S]*?\.order\('created_at', \{ ascending: false \}\)/);
  assert.match(app, /carregarHistoricoEquipamentos\(\{strict:true\}\)/);
  assert.match(app, /carregarHistoricoPontos\(\{strict:true\}\)/);
  assert.match(pointsPage, /carregarHistoricoPontos\(\{ strict: true \}\)/);
  assert.match(pointsPage, /onHistoricoLoadError\?\.\(histResult\.failed\)/);
  assert.match(app, /onHistoricoLoadError=\{failed=>setErrosHistorico/);
  assert.match(page, /if \(!event\.timestamp\) return event\.legacyDate \|\| "Horário indisponível"/);
  assert.equal((app.match(/formatarDataHoraTimeline\(evento\.timestamp,evento\.legacyDate\)/g) || []).length, 2);
});

test("Histórico diferencia falha de vazio e exporta o recorte filtrado", () => {
  assert.match(page, /\{loadError \? \(/);
  assert.match(page, /filteredEvents\.length === 0/);
  assert.match(page, /onExportExcel\?\.\(filteredEvents\)/);
  assert.match(page, /onExportPdf\?\.\(filteredEvents\)/);
  assert.match(app, /onExportExcel=\{exportarTimelineExcel\}/);
  assert.match(app, /onExportPdf=\{exportarTimelinePDF\}/);
});

test("UI remove limpeza operacional e não recupera dossiê lateral", () => {
  assert.doesNotMatch(app, /limparHistoricoEquipamentos|function limparHistorico\(|Limpar todo o histórico/);
  assert.doesNotMatch(page, /Limpar histórico|dossiê|useResponsiveSheet/i);
  assert.match(page, /history-timeline__event-details/);
  assert.match(page, /aria-expanded=\{expanded\}/);
  assert.match(page, /history-timeline__event-trigger--static/);
  assert.match(page, /dateTime=\{event\.timestamp \|\| undefined\}/);
});

test("Time Spine possui período, filtros confiáveis, paginação e responsividade", () => {
  for (const marker of ["today", "7d", "30d", "all", "equipment", "point", "eventType", "HISTORY_PAGE_SIZE"]) {
    assert.ok(page.includes(marker), `marcador ausente: ${marker}`);
  }
  assert.match(css, /\.history-timeline__event::before/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /@media \(max-width: 420px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test("preview do Histórico é dev-only, local e reproduz estados aprovados", () => {
  assert.match(main, /import\.meta\.env\.DEV && parametros\.get\("preview"\) === "historico"/);
  assert.match(main, /previewHistorico \? iniciarPreviewHistorico\(\)/);
  assert.match(preview, /Fixture isolada/);
  assert.match(preview, /Zero escrita/);
  assert.match(preview, /viewport === "mobile"/);
  assert.match(preview, /initialExpandedId/);
  assert.match(preview, /initialFiltersOpen/);
  assert.doesNotMatch(preview, /supabase|db\.js|fetch\(|localStorage|sessionStorage/i);
});
