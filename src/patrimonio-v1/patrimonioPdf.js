import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable/es";
import QRCode from "qrcode";

const A4 = Object.freeze({ width: 210, height: 297 });
const COLORS = Object.freeze({
  navy: [7, 24, 44],
  teal: [22, 109, 112],
  tealSoft: [222, 239, 238],
  copper: [166, 83, 56],
  copperSoft: [249, 237, 232],
  ink: [29, 40, 55],
  muted: [89, 103, 120],
  line: [199, 210, 220],
  panel: [246, 248, 250],
  warning: [151, 69, 43],
  white: [255, 255, 255],
});

export const SAMPLE_QR_ORIGIN = "https://example.invalid";
export const PUBLIC_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export const DEFAULT_LABEL_SETTINGS = Object.freeze({
  pageWidth: A4.width,
  pageHeight: A4.height,
  marginX: 8,
  marginY: 12,
  labelWidth: 63,
  labelHeight: 35,
  gapX: 2.5,
  gapY: 3,
});

const ARTIFACT_CONTRACTS = Object.freeze({
  labels: "neptera.patrimonio.free-labels.sample.v2",
  calibration: "neptera.patrimonio.calibration.sample.v2",
  route: "neptera.patrimonio.route-report.sample.v2",
  final: "neptera.patrimonio.final-report.sample.v2",
});

function finitePositive(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function plain(value, fallback = "-") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function normalizeNp(code) {
  const normalized = String(code || "").trim().toUpperCase();
  if (!/^NP-(?:\d{6}|TESTE(?:-\d{3})?)$/.test(normalized)) {
    throw new TypeError("Código NP inválido para o artefato patrimonial de amostra.");
  }
  return normalized;
}

function npOrder(code) {
  const match = String(code || "").match(/(\d+)$/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function normalizePublicId(publicId) {
  const normalized = String(publicId || "").trim();
  if (!PUBLIC_ID_PATTERN.test(normalized)) {
    throw new TypeError("public_id compacto de 22 caracteres é obrigatório para o QR patrimonial.");
  }
  return normalized;
}

function isInvalidSampleOrigin(origin) {
  try {
    return new URL(origin).hostname.endsWith(".invalid");
  } catch {
    return false;
  }
}

function requireInvalidSampleOrigin(origin) {
  if (!isInvalidSampleOrigin(origin)) {
    throw new TypeError("Artefatos locais de amostra devem usar um domínio .invalid e nunca produção.");
  }
  return origin;
}

export function normalizeLabelSettings(settings = {}) {
  const normalized = {
    pageWidth: finitePositive(settings.pageWidth, DEFAULT_LABEL_SETTINGS.pageWidth),
    pageHeight: finitePositive(settings.pageHeight, DEFAULT_LABEL_SETTINGS.pageHeight),
    marginX: Math.max(0, Number(settings.marginX ?? DEFAULT_LABEL_SETTINGS.marginX) || 0),
    marginY: Math.max(0, Number(settings.marginY ?? DEFAULT_LABEL_SETTINGS.marginY) || 0),
    labelWidth: finitePositive(settings.labelWidth, DEFAULT_LABEL_SETTINGS.labelWidth),
    labelHeight: finitePositive(settings.labelHeight, DEFAULT_LABEL_SETTINGS.labelHeight),
    gapX: Math.max(0, Number(settings.gapX ?? DEFAULT_LABEL_SETTINGS.gapX) || 0),
    gapY: Math.max(0, Number(settings.gapY ?? DEFAULT_LABEL_SETTINGS.gapY) || 0),
  };

  const usableWidth = normalized.pageWidth - (normalized.marginX * 2);
  const usableHeight = normalized.pageHeight - (normalized.marginY * 2);
  const columns = Math.floor((usableWidth + normalized.gapX) / (normalized.labelWidth + normalized.gapX));
  const rows = Math.floor((usableHeight + normalized.gapY) / (normalized.labelHeight + normalized.gapY));
  if (columns < 1 || rows < 1) {
    throw new RangeError("As dimensões da etiqueta não cabem na página configurada.");
  }

  return { ...normalized, columns, rows, labelsPerPage: columns * rows };
}

export function calculateLabelPlacements(count, settings = {}) {
  const resolved = normalizeLabelSettings(settings);
  return Array.from({ length: Math.max(0, Number(count) || 0) }, (_, index) => {
    const slot = index % resolved.labelsPerPage;
    const column = slot % resolved.columns;
    const row = Math.floor(slot / resolved.columns);
    return {
      index,
      page: Math.floor(index / resolved.labelsPerPage) + 1,
      column,
      row,
      x: resolved.marginX + column * (resolved.labelWidth + resolved.gapX),
      y: resolved.marginY + row * (resolved.labelHeight + resolved.gapY),
      width: resolved.labelWidth,
      height: resolved.labelHeight,
    };
  });
}

export function buildAssetDeepLink(publicId, origin = SAMPLE_QR_ORIGIN) {
  const normalizedId = normalizePublicId(publicId);
  const base = new URL(origin);
  base.pathname = `/patrimonio/${normalizedId}`;
  base.search = "";
  base.hash = "";
  return base.toString();
}

export async function createAssetQr(publicId, options = {}) {
  const payload = buildAssetDeepLink(publicId, options.origin || SAMPLE_QR_ORIGIN);
  const dataUrl = await QRCode.toDataURL(payload, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: options.width || 360,
    color: { dark: "#07182cff", light: "#ffffffff" },
  });
  return { payload, dataUrl };
}

function createDocument(options = {}) {
  const doc = new jsPDF({
    orientation: options.orientation || "portrait",
    unit: "mm",
    format: options.format || "a4",
    compress: true,
  });
  doc.setProperties({
    title: plain(options.title, "NEPTERA - Artefato patrimonial de amostra"),
    subject: "AMOSTRA - NAO UTILIZAR - Patrimônio NEPTERA",
    author: "NEPTERA - Ambiente local",
    creator: "NEPTERA Patrimônio Fase 1 - Harness local",
    keywords: "AMOSTRA, NAO UTILIZAR, patrimonio, NEPTERA",
  });
  return doc;
}

function attachArtifactContract(doc, metadata) {
  Object.defineProperty(doc, "nepteraArtifact", {
    configurable: false,
    enumerable: false,
    writable: false,
    value: Object.freeze({ sample: true, ...metadata }),
  });
  return doc;
}

function drawSampleBand(doc, label = "AMOSTRA - NAO UTILIZAR") {
  const width = doc.internal.pageSize.getWidth();
  doc.setFillColor(...COLORS.copperSoft);
  doc.rect(0, 0, width, 7.4, "F");
  doc.setTextColor(...COLORS.warning);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.2);
  doc.text(label, width / 2, 4.8, { align: "center" });
}

function drawSheetFooter(doc, details = "QR de teste em domínio inválido") {
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  doc.setDrawColor(...COLORS.line);
  doc.setLineWidth(0.2);
  doc.line(8, height - 7.4, width - 8, height - 7.4);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.muted);
  doc.setFontSize(6.3);
  doc.text(details, 8, height - 3.9);
  doc.text(`Página ${doc.internal.getCurrentPageInfo().pageNumber}`, width - 8, height - 3.9, { align: "right" });
}

function drawLabelFrame(doc, x, y, settings, tone = COLORS.line) {
  doc.setDrawColor(...tone);
  doc.setLineWidth(0.25);
  doc.roundedRect(x, y, settings.labelWidth, settings.labelHeight, 1.8, 1.8, "S");
}

function drawLabel(doc, label, qrDataUrl, placement, settings) {
  const { x, y } = placement;
  drawLabelFrame(doc, x, y, settings);
  const padding = Math.max(3, Math.min(4.4, settings.labelHeight * 0.11));
  const qrSize = Math.min(settings.labelHeight - (padding * 2), settings.labelWidth * 0.31);
  const qrX = x + settings.labelWidth - padding - qrSize;
  const qrY = y + (settings.labelHeight - qrSize) / 2;
  const contentWidth = Math.max(26, qrX - x - (padding * 2));

  doc.setFillColor(...COLORS.navy);
  doc.roundedRect(x, y, settings.labelWidth, 6.5, 1.8, 1.8, "F");
  doc.rect(x, y + 4.2, settings.labelWidth, 2.3, "F");
  doc.setTextColor(...COLORS.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(Math.max(7, Math.min(10, settings.labelHeight * 0.24)));
  doc.text("NEPTERA", x + padding, y + 4.5);

  doc.setTextColor(...COLORS.copper);
  doc.setFontSize(Math.max(5.4, Math.min(7.2, settings.labelHeight * 0.16)));
  doc.text("PATRIMONIO", x + padding, y + 11.5);

  doc.setTextColor(...COLORS.ink);
  doc.setFont("courier", "bold");
  const code = normalizeNp(label.code);
  let codeSize = Math.max(10, Math.min(17, settings.labelHeight * 0.39));
  doc.setFontSize(codeSize);
  while (codeSize > 8 && doc.getTextWidth(code) > contentWidth) {
    codeSize -= 0.5;
    doc.setFontSize(codeSize);
  }
  doc.text(code, x + padding, y + 21.1);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.muted);
  doc.setFontSize(5.7);
  doc.text("Identidade patrimonial", x + padding, y + settings.labelHeight - 5.1);
  doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize, undefined, "FAST");
}

function normalizeFreeLabels(labels) {
  if (!Array.isArray(labels) || labels.length === 0) {
    throw new TypeError("Informe ao menos uma etiqueta fictícia.");
  }
  return labels.map((label) => {
    if (label?.equipmentId || label?.equipment || label?.legacyReference || label?.currentPosition) {
      throw new TypeError("A folha de implantação aceita somente etiquetas livres, sem associação a equipamento.");
    }
    return {
      code: normalizeNp(label?.code || label?.patrimonyCode),
      publicId: normalizePublicId(label?.publicId),
    };
  }).sort((left, right) => npOrder(left.code) - npOrder(right.code));
}

export async function createLabelDocument(labels = [], settings = {}, options = {}) {
  const normalizedLabels = normalizeFreeLabels(labels);
  const resolved = normalizeLabelSettings(settings);
  const qrOrigin = requireInvalidSampleOrigin(options.qrOrigin || SAMPLE_QR_ORIGIN);
  const orientation = resolved.pageWidth > resolved.pageHeight ? "landscape" : "portrait";
  const doc = createDocument({
    orientation,
    format: [resolved.pageWidth, resolved.pageHeight],
    title: "NEPTERA - Etiquetas patrimoniais livres - AMOSTRA",
  });
  const placements = calculateLabelPlacements(normalizedLabels.length, resolved);
  const pageCount = Math.ceil(normalizedLabels.length / resolved.labelsPerPage);

  for (let page = 1; page <= pageCount; page += 1) {
    if (page > 1) doc.addPage([resolved.pageWidth, resolved.pageHeight], orientation);
    drawSampleBand(doc);
    drawSheetFooter(doc, `${plain(options.batchId, "LOTE-AMOSTRA")} - QR inválido - ${resolved.labelWidth} x ${resolved.labelHeight} mm`);
  }

  for (let index = 0; index < normalizedLabels.length; index += 1) {
    const label = normalizedLabels[index];
    const placement = placements[index];
    doc.setPage(placement.page);
    const { dataUrl } = await createAssetQr(label.publicId, { origin: qrOrigin });
    drawLabel(doc, label, dataUrl, placement, resolved);
  }

  return attachArtifactContract(doc, {
    type: "labels",
    contract: ARTIFACT_CONTRACTS.labels,
    count: normalizedLabels.length,
    codes: normalizedLabels.map((label) => label.code),
    publicIds: normalizedLabels.map((label) => label.publicId),
    qrOrigin,
    settings: resolved,
    placements,
  });
}

function drawMillimeterRuler(doc, x, y, width) {
  doc.setDrawColor(...COLORS.muted);
  doc.setTextColor(...COLORS.muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.5);
  doc.line(x, y, x + width, y);
  for (let mm = 0; mm <= width; mm += 1) {
    const major = mm % 10 === 0;
    const medium = mm % 5 === 0;
    const tick = major ? 3.2 : medium ? 2.1 : 1.1;
    doc.line(x + mm, y, x + mm, y + tick);
    if (major) doc.text(String(mm), x + mm, y + 5.4, { align: "center" });
  }
}

export async function createCalibrationDocument(settings = {}, options = {}) {
  const resolved = normalizeLabelSettings(settings);
  const qrOrigin = requireInvalidSampleOrigin(options.qrOrigin || SAMPLE_QR_ORIGIN);
  const doc = createDocument({ title: "NEPTERA - Calibração de etiquetas - AMOSTRA" });
  const sampleId = options.publicId || "Calibracao_NEPTERA_001";
  const { dataUrl } = await createAssetQr(sampleId, { origin: qrOrigin, width: 280 });

  drawSampleBand(doc, "AMOSTRA - NAO UTILIZAR COMO PATRIMONIO");
  doc.setTextColor(...COLORS.ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Calibração de etiqueta A4", 14, 20);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.muted);
  doc.setFontSize(9);
  doc.text("Imprima em escala 100%. Meça os contornos antes de usar papel adesivo.", 14, 26);
  doc.setFillColor(...COLORS.copperSoft);
  doc.roundedRect(14, 31, 182, 14, 2, 2, "F");
  doc.setTextColor(...COLORS.warning);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("NP-TESTE-001 - QR SEM VALIDADE - NAO COLAR EM EQUIPAMENTO", 105, 39.7, { align: "center" });

  const variants = [
    { name: "Pequena", width: 50, height: 28 },
    { name: "Média", width: resolved.labelWidth, height: resolved.labelHeight },
    { name: "Grande", width: 78, height: 42 },
  ];
  let y = 55;
  variants.forEach((variant) => {
    doc.setTextColor(...COLORS.ink);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(`${variant.name} - ${variant.width} x ${variant.height} mm`, 14, y);
    y += 4;
    const placement = { x: 14, y, width: variant.width, height: variant.height };
    drawLabelFrame(doc, placement.x, placement.y, { labelWidth: variant.width, labelHeight: variant.height }, COLORS.teal);
    doc.setFillColor(...COLORS.navy);
    doc.rect(placement.x, placement.y, variant.width, 6, "F");
    doc.setTextColor(...COLORS.white);
    doc.setFontSize(7.4);
    doc.text("NEPTERA", placement.x + 3, placement.y + 4.1);
    doc.setTextColor(...COLORS.copper);
    doc.setFontSize(5.6);
    doc.text("PATRIMONIO", placement.x + 3, placement.y + 11);
    doc.setTextColor(...COLORS.ink);
    doc.setFont("courier", "bold");
    doc.setFontSize(Math.min(13, variant.height * 0.32));
    doc.text("NP-TESTE-001", placement.x + 3, placement.y + 18.5);
    const qrSize = Math.min(variant.height - 7, 25);
    doc.addImage(dataUrl, "PNG", placement.x + variant.width - qrSize - 2.5, placement.y + (variant.height - qrSize) / 2, qrSize, qrSize, undefined, "FAST");
    drawMillimeterRuler(doc, 14 + variant.width + 10, placement.y + 4, Math.min(80, variant.width));
    doc.setTextColor(...COLORS.muted);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.2);
    doc.text("Confira largura, altura, nitidez do NP e leitura do QR.", 14 + variant.width + 10, placement.y + 16);
    y += variant.height + 13;
  });

  drawSheetFooter(doc, "Folha de calibração - domínio example.invalid - nenhuma identidade real");
  return attachArtifactContract(doc, {
    type: "calibration",
    contract: ARTIFACT_CONTRACTS.calibration,
    qrOrigin,
    variants,
  });
}

function drawReportHeader(doc, title, description, eyebrow) {
  const width = doc.internal.pageSize.getWidth();
  doc.setFillColor(...COLORS.navy);
  doc.rect(0, 0, width, 30, "F");
  doc.setFillColor(...COLORS.teal);
  doc.rect(0, 29.3, width, 0.7, "F");
  doc.setTextColor(...COLORS.tealSoft);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.2);
  doc.text(plain(eyebrow, "PATRIMONIO NEPTERA"), 12, 8.2);
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(15);
  doc.text(title, 12, 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.4);
  doc.text(description, 12, 22.4);
  doc.setFillColor(...COLORS.copperSoft);
  doc.roundedRect(width - 70, 8, 58, 11, 1.5, 1.5, "F");
  doc.setTextColor(...COLORS.warning);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.2);
  doc.text("AMOSTRA - NAO UTILIZAR", width - 41, 14.8, { align: "center" });
}

function drawReportFooter(doc, note) {
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  doc.setDrawColor(...COLORS.line);
  doc.setLineWidth(0.2);
  doc.line(12, height - 10, width - 12, height - 10);
  doc.setTextColor(...COLORS.muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.8);
  doc.text(note, 12, height - 5.8);
  doc.text(`Página ${doc.internal.getCurrentPageInfo().pageNumber}`, width - 12, height - 5.8, { align: "right" });
}

function drawReportMeta(doc, items, startY = 36) {
  const width = doc.internal.pageSize.getWidth();
  const available = width - 24;
  const normalized = items.filter((item) => item?.value);
  const cellWidth = available / Math.max(1, normalized.length);
  normalized.forEach((item, index) => {
    const x = 12 + index * cellWidth;
    doc.setTextColor(...COLORS.muted);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.2);
    doc.text(String(item.label).toUpperCase(), x, startY);
    doc.setTextColor(...COLORS.ink);
    doc.setFontSize(8.2);
    doc.text(doc.splitTextToSize(plain(item.value), cellWidth - 4).slice(0, 2), x, startY + 4.2);
  });
  return startY + 11;
}

function addReportPageChrome(doc, header, footerNote) {
  drawReportHeader(doc, header.title, header.description, header.eyebrow);
  drawReportFooter(doc, footerNote);
}

function drawFinalSampleNotice(doc) {
  const width = doc.internal.pageSize.getWidth();
  doc.setFillColor(...COLORS.copperSoft);
  doc.rect(0, 30, width, 10, "F");
  doc.setDrawColor(...COLORS.copper);
  doc.setLineWidth(0.3);
  doc.line(0, 39.7, width, 39.7);
  doc.setTextColor(...COLORS.warning);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text(
    "AMOSTRA / NAO UTILIZAR - DOCUMENTO SEM VALIDADE OPERACIONAL",
    width / 2,
    36.4,
    { align: "center" },
  );
}

function addFinalReportPageChrome(doc, header, footerNote) {
  addReportPageChrome(doc, header, footerNote);
  drawFinalSampleNotice(doc);
}

function reportTable(doc, options) {
  autoTable(doc, {
    startY: options.startY,
    head: [options.head],
    body: options.body,
    theme: "grid",
    margin: { left: 12, right: 12, top: options.marginTop || 36, bottom: 15 },
    styles: {
      fontSize: options.fontSize || 7,
      cellPadding: options.cellPadding || 2.2,
      textColor: COLORS.ink,
      lineColor: COLORS.line,
      lineWidth: 0.14,
      valign: "middle",
      overflow: "linebreak",
    },
    headStyles: { fillColor: COLORS.navy, textColor: COLORS.white, fontStyle: "bold", lineColor: COLORS.navy },
    alternateRowStyles: { fillColor: COLORS.panel },
    columnStyles: options.columnStyles,
    didDrawPage: options.didDrawPage,
  });
}

function normalizeRouteRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    if (row?.patrimonyCode || row?.code || row?.publicId) {
      throw new TypeError("O roteiro pré-implantação não pode conter associação NP ou public_id.");
    }
    return {
      equipment: plain(row?.equipment),
      category: plain(row?.category),
      legacyReference: plain(row?.legacyReference, "Sem referência"),
      currentPosition: plain(row?.currentPosition),
      applied: Boolean(row?.applied),
      verified: Boolean(row?.verified ?? row?.confirmed),
    };
  });
}

export function createRouteReportDocument(job = {}) {
  const rows = normalizeRouteRows(job.rows);
  const doc = createDocument({
    orientation: "landscape",
    title: "NEPTERA - Roteiro de implantação - AMOSTRA",
  });
  const header = {
    eyebrow: "ROTEIRO DE CAMPO - SEM PRE-ASSOCIACAO NP",
    title: "Roteiro de implantação patrimonial",
    description: "Lista de equipamentos pendentes. A identidade NP será preenchida somente durante a ativação física.",
  };
  const footer = "Documento fictício para apoio manual. O papel preenchido não altera o sistema.";
  addReportPageChrome(doc, header, footer);
  const startY = drawReportMeta(doc, [
    { label: "Campanha", value: job.campaign || "Implantação Patrimonial NEPTERA 2026" },
    { label: "Recorte", value: job.context || job.point || "Rota de amostra" },
    { label: "Lote", value: job.batchId || "PAT-AMOSTRA" },
    { label: "Responsável", value: job.responsible || "Operador fictício" },
  ]);

  reportTable(doc, {
    startY,
    head: ["Equipamento", "Categoria", "Referência anterior", "Posição atual", "NP aplicado", "Aplicado", "Conferido"],
    body: rows.length ? rows.map((row) => [
      row.equipment,
      row.category,
      row.legacyReference,
      row.currentPosition,
      "________________",
      row.applied ? "X" : "[  ]",
      row.verified ? "X" : "[  ]",
    ]) : [["Nenhum equipamento no recorte", "-", "-", "-", "-", "-", "-"]],
    columnStyles: {
      0: { cellWidth: 55 },
      1: { cellWidth: 35 },
      2: { cellWidth: 38 },
      3: { cellWidth: 62 },
      4: { cellWidth: 34, font: "courier" },
      5: { cellWidth: 23, halign: "center" },
      6: { cellWidth: 26, halign: "center" },
    },
    didDrawPage: ({ pageNumber }) => {
      if (pageNumber > 1) addReportPageChrome(doc, header, footer);
    },
  });

  return attachArtifactContract(doc, {
    type: "route",
    contract: ARTIFACT_CONTRACTS.route,
    rowCount: rows.length,
    hasPreAssociation: false,
  });
}

function normalizeFinalRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => ({
    patrimonyCode: normalizeNp(row?.patrimonyCode || row?.code),
    equipment: plain(row?.equipment),
    category: plain(row?.category),
    currentPosition: plain(row?.currentPosition),
    legacyReference: plain(row?.legacyReference, "Sem referência"),
    state: plain(row?.state, "Conferido"),
    appliedBy: plain(row?.appliedBy, "Operador fictício"),
    appliedAt: plain(row?.appliedAt, "-"),
    verifiedBy: plain(row?.verifiedBy || row?.confirmedBy, "Operador fictício"),
    verifiedAt: plain(row?.verifiedAt || row?.confirmedAt, "-"),
  })).sort((left, right) => npOrder(left.patrimonyCode) - npOrder(right.patrimonyCode));
}

export function createFinalReportDocument(job = {}) {
  const rows = normalizeFinalRows(job.rows);
  const doc = createDocument({
    orientation: "landscape",
    title: "NEPTERA - Relatório pós-implantação - AMOSTRA",
  });
  const header = {
    eyebrow: "DOCUMENTACAO FINAL - POS-IMPLANTACAO",
    title: "Relatório final de implantação",
    description: "Associação consolidada após vínculo, aplicação física e conferência.",
  };
  const footer = "AMOSTRA - NAO UTILIZAR - Documento fictício sem public_id, URL de QR, e-mail ou IDs de usuário.";
  addFinalReportPageChrome(doc, header, footer);
  const startY = drawReportMeta(doc, [
    { label: "Campanha", value: job.campaign || "Implantação Patrimonial NEPTERA 2026" },
    { label: "Recorte", value: job.context || "Bar do Sávio - amostra" },
    { label: "Lote", value: job.batchId || "PAT-AMOSTRA" },
    { label: "Resultado", value: `${rows.length} associações documentadas` },
  ], 46);

  reportTable(doc, {
    startY,
    marginTop: 48,
    fontSize: 5.8,
    cellPadding: 1.9,
    head: ["NP", "Equipamento", "Categoria", "Posição atual", "Referência anterior", "Estado", "Aplicado por", "Aplicado em", "Conferido por", "Conferido em"],
    body: rows.length ? rows.map((row) => [
      row.patrimonyCode,
      row.equipment,
      row.category,
      row.currentPosition,
      row.legacyReference,
      row.state,
      row.appliedBy,
      row.appliedAt,
      row.verifiedBy,
      row.verifiedAt,
    ]) : [["-", "Nenhuma associação concluída", "-", "-", "-", "-", "-", "-", "-", "-"]],
    columnStyles: {
      0: { cellWidth: 22, font: "courier", fontStyle: "bold" },
      2: { cellWidth: 24 },
      3: { cellWidth: 32 },
      4: { cellWidth: 26 },
      5: { cellWidth: 22 },
      6: { cellWidth: 27 },
      7: { cellWidth: 29 },
      8: { cellWidth: 27 },
      9: { cellWidth: 29 },
    },
    didDrawPage: ({ pageNumber }) => {
      if (pageNumber > 1) addFinalReportPageChrome(doc, header, footer);
    },
  });

  return attachArtifactContract(doc, {
    type: "final",
    contract: ARTIFACT_CONTRACTS.final,
    sampleNotice: "AMOSTRA / NAO UTILIZAR",
    rowCount: rows.length,
    codes: rows.map((row) => row.patrimonyCode),
    columns: ["patrimonyCode", "equipment", "category", "currentPosition", "legacyReference", "state", "appliedBy", "appliedAt", "verifiedBy", "verifiedAt"],
    categoryCount: rows.filter((row) => row.category !== "-").length,
    currentPositionCount: rows.filter((row) => row.currentPosition !== "-").length,
  });
}

export async function createArtifactDocument(type, payload = {}) {
  switch (type) {
    case "labels":
    case "free-labels":
      return createLabelDocument(
        (payload.labels || []).map((label) => ({
          code: label.code || label.patrimonyCode,
          publicId: label.publicId,
        })),
        payload.settings,
        { batchId: payload.batchId, qrOrigin: payload.qrOrigin || SAMPLE_QR_ORIGIN },
      );
    case "calibration":
      return createCalibrationDocument(payload.settings, { qrOrigin: payload.qrOrigin || SAMPLE_QR_ORIGIN });
    case "route":
      return createRouteReportDocument(payload);
    case "final":
      return createFinalReportDocument(payload);
    default:
      throw new TypeError(`Tipo de artefato patrimonial desconhecido: ${plain(type, "vazio")}.`);
  }
}

export function artifactFilename(type, payload = {}) {
  const batch = String(payload.batchId || "amostra").toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  const names = {
    labels: `neptera-${batch}-etiquetas-livres-amostra.pdf`,
    "free-labels": `neptera-${batch}-etiquetas-livres-amostra.pdf`,
    calibration: "neptera-calibracao-a4-amostra.pdf",
    route: `neptera-${batch}-roteiro-implantacao-amostra.pdf`,
    final: `neptera-${batch}-relatorio-final-amostra.pdf`,
  };
  return names[type] || "neptera-patrimonio-amostra.pdf";
}

export function savePdfDocument(doc, filename) {
  if (!doc || typeof doc.save !== "function") throw new TypeError("Documento PDF inválido.");
  doc.save(filename);
}
