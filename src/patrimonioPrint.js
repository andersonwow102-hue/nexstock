import { PATRIMONIO_PUBLIC_ID_PATTERN } from "./patrimonioDeepLink.js";

// Temporary pilot base: verified public production domain, without Vercel SSO.
// Independent of preview/deployment URLs. NEPTERA authentication and RLS still apply.
export const PATRIMONIO_QR_ORIGIN = "https://nexstock-delta.vercel.app";

export function isBatchFullyGenerated(batch) {
  return Boolean(batch?.id && ["gerado", "em_uso", "concluido"].includes(batch.situacao)
    && Number.isInteger(Number(batch.quantidade)) && Number(batch.quantidade) > 0
    && Number(batch.geradas) === Number(batch.quantidade));
}

export function persistedBatchLabels(batch, records) {
  if (!isBatchFullyGenerated(batch)) throw new Error("O lote ainda não está totalmente gerado.");
  const labels = records.filter((record) => record.lote_origem_id === batch.id);
  if (labels.length !== Number(batch.quantidade)) throw new Error("Leitura incompleta do lote. Atualize os dados antes de gerar o PDF.");
  const codes = new Set();
  const ids = new Set();
  for (const label of labels) {
    if (!/^NP-\d{6}$/.test(label.codigo) || !PATRIMONIO_PUBLIC_ID_PATTERN.test(label.public_id)
      || codes.has(label.codigo) || ids.has(label.public_id)) {
      throw new Error("Identidades patrimoniais inválidas ou duplicadas. PDF não gerado.");
    }
    codes.add(label.codigo);
    ids.add(label.public_id);
  }
  return labels.map(({ codigo, public_id }) => ({ codigo, public_id }))
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
}

export async function createPersistedBatchPdf(batch, records) {
  const labels = persistedBatchLabels(batch, records);
  const [{ jsPDF }, { default: QRCode }] = await Promise.all([import("jspdf"), import("qrcode")]);
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  doc.setProperties({ title: `NEPTERA - ${batch.codigo} - Etiquetas`, subject: "Identidades patrimoniais persistidas", author: "NEPTERA" });
  for (let i = 0; i < labels.length; i += 1) {
    if (i && i % 21 === 0) doc.addPage();
    const slot = i % 21;
    const x = 8 + (slot % 3) * 65.5;
    const y = 12 + Math.floor(slot / 3) * 38;
    const label = labels[i];
    const url = `${PATRIMONIO_QR_ORIGIN}/patrimonio/${label.public_id}`;
    const qr = await QRCode.toDataURL(url, { errorCorrectionLevel: "M", margin: 4, width: 480 });
    doc.setDrawColor(170); doc.setLineWidth(0.2); doc.roundedRect(x, y, 63, 35, 1.5, 1.5);
    doc.setTextColor(7, 24, 44); doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text("NEPTERA", x + 3, y + 6);
    doc.setFontSize(7); doc.text("PATRIMÔNIO", x + 3, y + 12);
    doc.setFont("courier", "bold"); doc.setFontSize(12); doc.text(label.codigo, x + 3, y + 21);
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.3); doc.text("Identidade patrimonial", x + 3, y + 29);
    doc.addImage(qr, "PNG", x + 37, y + 7, 24, 24);
    doc.link(x + 37, y + 7, 24, 24, { url });
  }
  return doc;
}
