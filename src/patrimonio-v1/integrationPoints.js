import { batchLabels } from "./model.js";

export const PUBLIC_LOOKUP_BASE = "https://neptera.vercel.app/patrimonio";
export const PUBLIC_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export function buildQrPayload(label, publicLookupBaseUrl = PUBLIC_LOOKUP_BASE) {
  const publicId = typeof label === "string" ? label : label?.publicId;
  if (!PUBLIC_ID_PATTERN.test(publicId || "")) {
    throw new TypeError("public_id compacto de 128 bits é obrigatório para montar o deep link patrimonial.");
  }
  return `${publicLookupBaseUrl.replace(/\/$/, "")}/${publicId}`;
}

/**
 * Etiquetas livres não carregam nome, posição ou equipamento. O vínculo é
 * resolvido no backend quando o QR permanente é usado.
 */
export function buildLabelPrintJob(state, batch, labelIds = null, options = {}) {
  if (!batch) return null;
  const selected = labelIds ? new Set(labelIds) : null;
  const labels = batchLabels(state, batch)
    .filter((label) => !selected || selected.has(label.id))
    .filter((label) => label.state !== "anulado")
    .map((label) => ({
      labelId: label.id,
      patrimonyCode: label.code,
      publicId: label.publicId,
      qrPayload: buildQrPayload(label, options.publicLookupBaseUrl),
      state: label.state,
    }));
  return {
    contract: "neptera.patrimonio.free-labels.v2",
    sample: true,
    batchId: batch.id,
    campaignId: batch.campaignId,
    labels,
  };
}

export function buildRouteReportJob(state, batch) {
  if (!batch) return null;
  const campaignMembers = new Set(state.campaign.memberIds);
  const occupiedEquipmentIds = new Set(
    state.labels
      .filter((label) => label.equipmentId && !["anulado", "baixado"].includes(label.state))
      .map((label) => label.equipmentId),
  );
  const candidates = state.equipments
    .filter((equipment) => equipment.eligible)
    .filter((equipment) => campaignMembers.has(equipment.id))
    .filter((equipment) => !occupiedEquipmentIds.has(equipment.id))
    .filter((equipment) => equipment.position.id === batch.context.id)
    .map((equipment) => ({
      equipmentId: equipment.id,
      equipment: equipment.name,
      category: equipment.category,
      currentPosition: equipment.position.label,
      legacyReference: equipment.legacyCode || "—",
      applied: false,
      verified: false,
    }));
  return {
    contract: "neptera.patrimonio.route-report.v2",
    sample: true,
    batchId: batch.id,
    campaign: state.campaign.name,
    context: batch.context.label,
    rows: candidates,
  };
}

export function buildRegistrationLabelPrintJob(labels, options = {}) {
  return {
    contract: "neptera.patrimonio.registration-labels.v2",
    sample: true,
    batchId: "CADASTRO-FUTURO-AMOSTRA",
    labels: labels.map((label) => ({
      labelId: label.id,
      patrimonyCode: label.code,
      publicId: label.publicId,
      qrPayload: buildQrPayload(label, options.publicLookupBaseUrl),
      state: label.state,
    })),
  };
}

export function buildFinalReportJob(state, batch) {
  if (!batch || batch.status !== "concluido") return null;
  const labels = batchLabels(state, batch).filter((label) => label.equipmentId);
  return {
    contract: "neptera.patrimonio.final-report.v2",
    sample: true,
    batchId: batch.id,
    campaign: state.campaign.name,
    rows: labels.map((label) => {
      const equipment = state.equipments.find((item) => item.id === label.equipmentId);
      return {
        patrimonyCode: label.code,
        equipment: equipment?.name || "Equipamento histórico",
        category: equipment?.category || "—",
        currentPosition: equipment?.position.label || "—",
        legacyReference: equipment?.legacyCode || "—",
        state: label.state,
      };
    }),
  };
}
