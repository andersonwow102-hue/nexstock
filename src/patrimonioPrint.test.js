import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { isBatchFullyGenerated, persistedBatchLabels, createPersistedBatchPdf, PATRIMONIO_QR_ORIGIN } from "./patrimonioPrint.js";
import { parsePatrimonioRoute, patrimonioViewModel, resolvePatrimonioWithClient } from "./patrimonioDeepLink.js";

const batch = { id: "batch-a", codigo: "PAT-TEST", situacao: "gerado", quantidade: 2, geradas: 2 };
const records = [
  { lote_origem_id: "batch-a", codigo: "NP-000042", public_id: "abcdefghijklmnopqrstuv" },
  { lote_origem_id: "batch-a", codigo: "NP-000010", public_id: "ABCDEFGHIJKLMNOPQRSTUV" },
];
test("QR piloto usa somente domínio público verificado de produção", () => {
  assert.equal(PATRIMONIO_QR_ORIGIN, "https://nexstock-delta.vercel.app");
});

test("cinco destinos auditados sobrevivem à transição de autenticação sem divulgar dados antes do login", async () => {
  const { records: audited } = JSON.parse(readFileSync(new URL("../qa/patrimonio-piloto/audit.json", import.meta.url))).rows[0];
  for (const [index, record] of audited.entries()) {
    const destination = new URL(`/patrimonio/${record.public_id}`, PATRIMONIO_QR_ORIGIN);
    const route = parsePatrimonioRoute(destination.pathname);
    const before = patrimonioViewModel({ authenticated: false, route, record });
    assert.equal(before.kind, "login");
    assert.equal(before.disclosure, false);
    assert.equal(before.preserveDestination, true);
    assert.equal(before.record, undefined);
    // Simulates the auth state transition; the live resolver is checked separately in READ ONLY SQL.
    const resolved = await resolvePatrimonioWithClient({ rpc: async (name, args) => {
      assert.equal(name, "patrimonio_resolver_public_id");
      assert.equal(args.p_public_id, route.publicId);
      return { data: [record], error: null };
    } }, route.publicId);
    for (const role of ["administrador", "gerente"]) {
      const after = patrimonioViewModel({ authenticated: true, route, record: resolved, role });
      assert.equal(after.kind, "resolved");
      assert.equal(after.record.code, `NP-${String(index + 1).padStart(6, "0")}`);
      assert.equal(after.record.publicId, route.publicId);
    }
  }
});
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
