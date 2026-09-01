import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAssetDeepLink,
  createAssetQr,
  createCalibrationDocument,
  createLabelDocument,
  createLogisticsDocument,
  normalizeLabelSettings,
} from "./patrimonioPdf.js";

const UUID = "73000000-0000-4000-8000-000000000001";

test("QR patrimonial usa somente o deep link publico esperado", async () => {
  const link = buildAssetDeepLink(UUID);
  assert.equal(link, `https://neptera.vercel.app/?modulo=equipamentos&ativo=${UUID}`);
  assert.doesNotMatch(link, /technical|gerente|ponto|localizacao|status/i);
  const qr = await createAssetQr(UUID, { width: 96 });
  assert.equal(qr.payload, link);
  assert.match(qr.dataUrl, /^data:image\/png;base64,/);
});

test("public_id invalido nao produz etiqueta", () => {
  assert.throws(() => buildAssetDeepLink("403"), /public_id invalido/i);
});

test("configuracao em milimetros calcula a grade sem scroll ou recorte", () => {
  const settings = normalizeLabelSettings({ labelWidth: 63, labelHeight: 35, marginX: 8, marginY: 10, gapX: 2.5, gapY: 3 });
  assert.equal(settings.columns, 3);
  assert.equal(settings.rows, 7);
  assert.equal(settings.labelsPerPage, 21);
  assert.throws(() => normalizeLabelSettings({ labelWidth: 500 }), /nao cabem/i);
});

test("documentos ficticios de etiqueta, calibracao e logistica sao gerados", async () => {
  const labelDoc = await createLabelDocument([{ code: "NP-000001", publicId: UUID }]);
  const calibrationDoc = createCalibrationDocument();
  const logisticsDoc = createLogisticsDocument([{ title: "Revisao necessaria", rows: [{ equipment: "Terminal Ficticio", state: "Localizacao invalida" }] }]);
  assert.ok(labelDoc.output("arraybuffer").byteLength > 1000);
  assert.ok(calibrationDoc.output("arraybuffer").byteLength > 1000);
  assert.ok(logisticsDoc.output("arraybuffer").byteLength > 1000);
});

test("folha de etiquetas preserva A4 em lotes com mais de uma pagina", async () => {
  const labels = Array.from({ length: 22 }, (_, index) => ({
    code: `NP-${String(index + 1).padStart(6, "0")}`,
    publicId: `73000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  }));
  const doc = await createLabelDocument(labels);
  assert.equal(doc.getNumberOfPages(), 2);
  assert.deepEqual(doc.getPageInfo(1).pageContext.mediaBox, doc.getPageInfo(2).pageContext.mediaBox);
});
