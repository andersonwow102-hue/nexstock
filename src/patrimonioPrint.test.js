import assert from "node:assert/strict";
import test from "node:test";
import { isBatchFullyGenerated, persistedBatchLabels, createPersistedBatchPdf, PATRIMONIO_QR_ORIGIN } from "./patrimonioPrint.js";
import { parsePatrimonioRoute } from "./patrimonioDeepLink.js";

const batch = { id: "batch-a", codigo: "PAT-TEST", situacao: "gerado", quantidade: 2, geradas: 2 };
const records = [
  { lote_origem_id: "batch-a", codigo: "NP-000042", public_id: "abcdefghijklmnopqrstuv" },
  { lote_origem_id: "batch-a", codigo: "NP-000010", public_id: "ABCDEFGHIJKLMNOPQRSTUV" },
];
test("impressão exige lote totalmente gerado", () => {
  for (const situacao of ["preparado", "cancelado", "", undefined]) assert.equal(isBatchFullyGenerated({ ...batch, situacao }), false);
  assert.equal(isBatchFullyGenerated({ ...batch, geradas: 1 }), false);
  assert.equal(isBatchFullyGenerated({ ...batch, quantidade: 0, geradas: 0 }), false);
  assert.equal(isBatchFullyGenerated(batch), true);
});
test("usa exclusivamente códigos persistidos do lote sem sintetizar faixas", () => {
  const source = structuredClone(records);
  const result = persistedBatchLabels(batch, [...records, { ...records[0], lote_origem_id: "outro" }]);
  assert.deepEqual(result.map((r) => r.codigo), ["NP-000010", "NP-000042"]);
  assert.deepEqual(records, source);
});
test("bloqueia leitura parcial, duplicação e public_id inválido", () => {
  assert.throws(() => persistedBatchLabels(batch, records.slice(0, 1)), /incompleta/);
  assert.throws(() => persistedBatchLabels(batch, [records[0], records[0]]), /duplicadas/);
  assert.throws(() => persistedBatchLabels(batch, [records[0], { ...records[1], public_id: "" }]), /inválidas/);
  assert.throws(() => persistedBatchLabels({ ...batch, situacao: "preparado" }, records), /totalmente/);
});
test("PDF usa deep links reais com IDs persistidos e não modifica a entrada", async () => {
  const before = JSON.stringify({ batch, records });
  const doc = await createPersistedBatchPdf(batch, records);
  const pdf = doc.output();
  for (const record of records) {
    const url = `${PATRIMONIO_QR_ORIGIN}/patrimonio/${record.public_id}`;
    assert.ok(pdf.includes(url));
    assert.equal(parsePatrimonioRoute(new URL(url).pathname).publicId, record.public_id);
  }
  assert.equal(doc.getNumberOfPages(), 1);
  assert.equal(JSON.stringify({ batch, records }), before);
});
