import { batchItems } from "./model.js";

export const PUBLIC_LOOKUP_BASE = "https://neptera.vercel.app/?modulo=equipamentos";

/**
 * Fronteira local e serializável para o futuro adaptador de PDF.
 * O harness não importa biblioteca de documento e não inicia download.
 */
export function buildLabelPrintJob(batch, items, { publicLookupBaseUrl = PUBLIC_LOOKUP_BASE } = {}) {
  if (!batch) return null;
  return {
    contract: "neptera.patrimonio.labels.v1",
    batchId: batch.id,
    rangeLabel: batch.rangeLabel,
    labels: batchItems(items, batch).map((item) => ({
      equipmentId: item.id,
      technicalId: item.technicalId,
      patrimonyCode: item.patrimonyCode,
      publicId: item.publicId,
      displayName: item.name,
      qrPayload: buildQrPayload(item, publicLookupBaseUrl),
    })),
  };
}

/**
 * Payload estável para o futuro gerador de QR; nenhum bitmap é criado aqui.
 */
export function buildQrPayload(item, publicLookupBaseUrl = PUBLIC_LOOKUP_BASE) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.publicId || "")) {
    throw new TypeError("public_id UUID é obrigatório para montar o deep link patrimonial.");
  }
  const separator = publicLookupBaseUrl.includes("?") ? "&" : "?";
  return `${publicLookupBaseUrl}${separator}ativo=${encodeURIComponent(item.publicId)}`;
}
