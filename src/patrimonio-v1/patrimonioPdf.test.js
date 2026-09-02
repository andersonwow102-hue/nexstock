import assert from "node:assert/strict";
import test from "node:test";
import { compactPublicId } from "./fixtures.js";
import {
  buildAssetDeepLink,
  calculateLabelPlacements,
  createArtifactDocument,
  createAssetQr,
  createCalibrationDocument,
  createFinalReportDocument,
  createLabelDocument,
  createRouteReportDocument,
  normalizeLabelSettings,
  SAMPLE_QR_ORIGIN,
} from "./patrimonioPdf.js";

const PUBLIC_ID = compactPublicId(900001);

function bufferSize(doc) {
  return doc.output("arraybuffer").byteLength;
}

test("QR patrimonial preserva a rota estável com public_id compacto", async () => {
  const link = buildAssetDeepLink(PUBLIC_ID);
  assert.equal(link, `${SAMPLE_QR_ORIGIN}/patrimonio/${PUBLIC_ID}`);
  assert.doesNotMatch(link, /equipment|technical|gerente|ponto|localizacao|status/i);
  const productionContract = buildAssetDeepLink(PUBLIC_ID, "https://neptera.vercel.app");
  assert.equal(productionContract, `https://neptera.vercel.app/patrimonio/${PUBLIC_ID}`);
  const qr = await createAssetQr(PUBLIC_ID, { width: 96 });
  assert.equal(qr.payload, link);
  assert.match(qr.dataUrl, /^data:image\/png;base64,/);
});

test("UUID legado ou identificador curto não produz QR do novo contrato", () => {
  assert.throws(
    () => buildAssetDeepLink("73000000-0000-4000-8000-000000000001"),
    /22 caracteres/i,
  );
  assert.throws(() => buildAssetDeepLink("403"), /22 caracteres/i);
});

test("configuração em milímetros calcula grade A4 e posições sem recorte", () => {
  const settings = normalizeLabelSettings({
    labelWidth: 63,
    labelHeight: 35,
    marginX: 8,
    marginY: 12,
    gapX: 2.5,
    gapY: 3,
  });
  assert.equal(settings.columns, 3);
  assert.equal(settings.rows, 7);
  assert.equal(settings.labelsPerPage, 21);
  const placements = calculateLabelPlacements(22, settings);
  assert.equal(placements.at(-1).page, 2);
  placements.forEach((placement) => {
    assert.ok(placement.x >= settings.marginX);
    assert.ok(placement.y >= settings.marginY);
    assert.ok(placement.x + placement.width <= settings.pageWidth - settings.marginX + 0.001);
    assert.ok(placement.y + placement.height <= settings.pageHeight - settings.marginY + 0.001);
  });
  assert.throws(() => normalizeLabelSettings({ labelWidth: 500 }), /não cabem/i);
});

test("folha de implantação contém somente etiquetas livres e usa domínio inválido", async () => {
  const labels = [12, 4, 9].map((number) => ({
    code: `NP-${String(900000 + number).padStart(6, "0")}`,
    publicId: compactPublicId(900000 + number),
  }));
  const doc = await createLabelDocument(labels);
  assert.equal(doc.nepteraArtifact.type, "labels");
  assert.equal(doc.nepteraArtifact.count, 3);
  assert.deepEqual(doc.nepteraArtifact.codes, ["NP-900004", "NP-900009", "NP-900012"]);
  assert.equal(doc.nepteraArtifact.qrOrigin, SAMPLE_QR_ORIGIN);
  assert.ok(bufferSize(doc) > 2500);
  await assert.rejects(
    createLabelDocument([{ ...labels[0], equipment: "Terminal fictício" }]),
    /somente etiquetas livres/i,
  );
  await assert.rejects(
    createLabelDocument(labels, {}, { qrOrigin: "https://neptera.vercel.app" }),
    /domínio \.invalid/i,
  );
});

test("folha de etiquetas preserva A4 em lotes maiores e mantém gaps reais", async () => {
  const labels = Array.from({ length: 24 }, (_, index) => ({
    code: `NP-${String(900001 + index).padStart(6, "0")}`,
    publicId: compactPublicId(900001 + index),
  }));
  const doc = await createLabelDocument(labels);
  assert.equal(doc.getNumberOfPages(), 2);
  assert.equal(doc.nepteraArtifact.placements.length, 24);
  assert.equal(doc.nepteraArtifact.codes[0], "NP-900001");
  assert.equal(doc.nepteraArtifact.codes.at(-1), "NP-900024");
  assert.deepEqual(doc.getPageInfo(1).pageContext.mediaBox, doc.getPageInfo(2).pageContext.mediaBox);
});

test("calibração apresenta três tamanhos e nunca usa URL de produção", async () => {
  const doc = await createCalibrationDocument();
  assert.equal(doc.nepteraArtifact.type, "calibration");
  assert.equal(doc.nepteraArtifact.variants.length, 3);
  assert.equal(doc.nepteraArtifact.qrOrigin, SAMPLE_QR_ORIGIN);
  assert.ok(bufferSize(doc) > 2500);
});

test("roteiro de implantação não aceita pré-associação NP ou public_id", () => {
  const document = createRouteReportDocument({
    campaign: "Campanha fictícia",
    context: "Bar do Sávio - amostra",
    rows: [{
      equipment: "Terminal amarelo fictício",
      category: "Terminais",
      legacyReference: "TER-TESTE-004",
      currentPosition: "Bar do Sávio",
    }],
  });
  assert.equal(document.nepteraArtifact.type, "route");
  assert.equal(document.nepteraArtifact.hasPreAssociation, false);
  assert.equal(document.nepteraArtifact.rowCount, 1);
  assert.ok(bufferSize(document) > 2500);
  assert.throws(
    () => createRouteReportDocument({ rows: [{ equipment: "Terminal", patrimonyCode: "NP-900001" }] }),
    /não pode conter associação NP/i,
  );
  assert.throws(
    () => createRouteReportDocument({ rows: [{ equipment: "Terminal", publicId: PUBLIC_ID }] }),
    /não pode conter associação NP/i,
  );
});

test("relatório final pós-implantação ordena associações reais com gaps", () => {
  const document = createFinalReportDocument({
    rows: [
      { patrimonyCode: "NP-900019", equipment: "TV fictícia", category: "Televisões", currentPosition: "Bar do Sávio", state: "Conferido" },
      { patrimonyCode: "NP-900003", equipment: "Terminal fictício", category: "Terminais", currentPosition: "Estoque interno", state: "Conferido" },
    ],
  });
  assert.equal(document.nepteraArtifact.type, "final");
  assert.equal(document.nepteraArtifact.sampleNotice, "AMOSTRA / NAO UTILIZAR");
  assert.deepEqual(document.nepteraArtifact.codes, ["NP-900003", "NP-900019"]);
  assert.equal(document.nepteraArtifact.rowCount, 2);
  assert.ok(document.nepteraArtifact.columns.includes("category"));
  assert.ok(document.nepteraArtifact.columns.includes("currentPosition"));
  assert.equal(document.nepteraArtifact.categoryCount, 2);
  assert.equal(document.nepteraArtifact.currentPositionCount, 2);
  assert.ok(bufferSize(document) > 2500);
});

test("dispatcher cria exatamente os quatro contratos de artefato do harness", async () => {
  const labels = await createArtifactDocument("labels", {
    batchId: "PAT-AMOSTRA",
    labels: [{ patrimonyCode: "NP-900001", publicId: PUBLIC_ID }],
  });
  const calibration = await createArtifactDocument("calibration");
  const route = await createArtifactDocument("route", { rows: [] });
  const final = await createArtifactDocument("final", { rows: [] });
  assert.deepEqual(
    [labels, calibration, route, final].map((doc) => doc.nepteraArtifact.type),
    ["labels", "calibration", "route", "final"],
  );
  await assert.rejects(createArtifactDocument("desconhecido"), /tipo de artefato patrimonial desconhecido/i);
});

test("relatórios extensos paginam em A4 paisagem sem perder o contrato", () => {
  const routeRows = Array.from({ length: 72 }, (_, index) => ({
    equipment: `Equipamento fictício ${index + 1}`,
    category: "Terminais",
    legacyReference: index % 2 ? "Sem referência" : `LEG-TESTE-${index + 1}`,
    currentPosition: "Ponto fictício de rota",
  }));
  const finalRows = routeRows.map((row, index) => ({
    patrimonyCode: `NP-${String(900101 + index).padStart(6, "0")}`,
    equipment: row.equipment,
    legacyReference: row.legacyReference,
    state: "Conferido",
    appliedBy: "Operador de teste",
    appliedAt: "01/09/2026 10:00",
    verifiedBy: "Supervisor de teste",
    verifiedAt: "01/09/2026 10:05",
  }));
  const route = createRouteReportDocument({ rows: routeRows });
  const final = createFinalReportDocument({ rows: finalRows });
  assert.ok(route.getNumberOfPages() > 1);
  assert.ok(final.getNumberOfPages() > 1);
  [route, final].forEach((doc) => {
    for (let page = 1; page <= doc.getNumberOfPages(); page += 1) {
      const box = doc.getPageInfo(page).pageContext.mediaBox;
      assert.ok(box.topRightX > box.topRightY, "relatório deve permanecer em A4 paisagem");
    }
  });
});
