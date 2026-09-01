import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable/es";
import QRCode from "qrcode";

const A4 = Object.freeze({ width: 210, height: 297 });
const COLORS = Object.freeze({
  navy: [10, 28, 52],
  blue: [24, 112, 238],
  copper: [166, 83, 56],
  ink: [30, 38, 54],
  muted: [91, 103, 120],
  line: [205, 212, 222],
  panel: [246, 248, 251],
  warning: [139, 98, 40],
});

export const DEFAULT_LABEL_SETTINGS = Object.freeze({
  pageWidth: A4.width,
  pageHeight: A4.height,
  marginX: 8,
  marginY: 10,
  labelWidth: 63,
  labelHeight: 35,
  gapX: 2.5,
  gapY: 3,
});

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function finitePositive(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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
    throw new RangeError("As dimensoes da etiqueta nao cabem na pagina configurada.");
  }

  return { ...normalized, columns, rows, labelsPerPage: columns * rows };
}

export function buildAssetDeepLink(publicId, origin = "https://neptera.vercel.app") {
  const normalizedId = String(publicId || "").trim();
  if (!UUID_PATTERN.test(normalizedId)) throw new TypeError("public_id invalido para o QR patrimonial.");
  const url = new URL("/", origin);
  url.searchParams.set("modulo", "equipamentos");
  url.searchParams.set("ativo", normalizedId);
  return url.toString();
}

export async function createAssetQr(publicId, options = {}) {
  const payload = buildAssetDeepLink(publicId, options.origin);
  const dataUrl = await QRCode.toDataURL(payload, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: options.width || 360,
    color: { dark: "#071426ff", light: "#ffffffff" },
  });
  return { payload, dataUrl };
}

function createPortraitDocument(settings) {
  return new jsPDF({
    orientation: settings.pageWidth > settings.pageHeight ? "landscape" : "portrait",
    unit: "mm",
    format: [settings.pageWidth, settings.pageHeight],
    compress: true,
  });
}

function labelPosition(index, settings) {
  const slot = index % settings.labelsPerPage;
  const column = slot % settings.columns;
  const row = Math.floor(slot / settings.columns);
  return {
    x: settings.marginX + column * (settings.labelWidth + settings.gapX),
    y: settings.marginY + row * (settings.labelHeight + settings.gapY),
  };
}

function drawLabelFrame(doc, x, y, settings, tone = COLORS.line) {
  doc.setDrawColor(...tone);
  doc.setLineWidth(0.25);
  doc.roundedRect(x, y, settings.labelWidth, settings.labelHeight, 1.8, 1.8, "S");
}

function drawLabel(doc, label, qrDataUrl, x, y, settings) {
  drawLabelFrame(doc, x, y, settings);
  const padding = Math.max(3, Math.min(4.4, settings.labelHeight * 0.11));
  const qrSize = Math.min(settings.labelHeight - (padding * 2), settings.labelWidth * 0.31);
  const qrX = x + settings.labelWidth - padding - qrSize;
  const qrY = y + (settings.labelHeight - qrSize) / 2;
  const contentWidth = Math.max(26, qrX - x - (padding * 2));

  doc.setFillColor(...COLORS.navy);
  doc.roundedRect(x, y, settings.labelWidth, 6.5, 1.8, 1.8, "F");
  doc.rect(x, y + 4.2, settings.labelWidth, 2.3, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(Math.max(7, Math.min(10, settings.labelHeight * 0.24)));
  doc.text("NEPTERA", x + padding, y + 4.5);
  doc.setTextColor(...COLORS.copper);
  doc.setFontSize(Math.max(5.4, Math.min(7.2, settings.labelHeight * 0.16)));
  doc.text("PATRIMONIO", x + padding, y + 11.6);

  doc.setTextColor(...COLORS.ink);
  doc.setFont("courier", "bold");
  const code = String(label.code || "SEM CODIGO").toUpperCase();
  let codeSize = Math.max(10, Math.min(17, settings.labelHeight * 0.39));
  doc.setFontSize(codeSize);
  while (codeSize > 8 && doc.getTextWidth(code) > contentWidth) {
    codeSize -= 0.5;
    doc.setFontSize(codeSize);
  }
  doc.text(code, x + padding, y + 21.2);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.muted);
  doc.setFontSize(5.8);
  const note = doc.splitTextToSize("Identificador publico - ambiente local", contentWidth);
  doc.text(note.slice(0, 2), x + padding, y + settings.labelHeight - 5.2);
  doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize, undefined, "FAST");
}

export async function createLabelDocument(labels = [], settings = {}) {
  if (!Array.isArray(labels) || labels.length === 0) throw new TypeError("Informe ao menos uma etiqueta ficticia.");
  const resolved = normalizeLabelSettings(settings);
  const doc = createPortraitDocument(resolved);

  for (let index = 0; index < labels.length; index += 1) {
    if (index > 0 && index % resolved.labelsPerPage === 0) {
      doc.addPage(
        [resolved.pageWidth, resolved.pageHeight],
        resolved.pageWidth > resolved.pageHeight ? "landscape" : "portrait",
      );
    }
    const label = labels[index];
    const { dataUrl } = await createAssetQr(label.publicId, { origin: label.origin });
    const { x, y } = labelPosition(index, resolved);
    drawLabel(doc, label, dataUrl, x, y, resolved);
  }

  return doc;
}

export function createCalibrationDocument(settings = {}) {
  const resolved = normalizeLabelSettings(settings);
  const doc = createPortraitDocument(resolved);
  doc.setTextColor(...COLORS.ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("NEPTERA - Folha de calibracao patrimonial", resolved.marginX, 6.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.muted);
  doc.setFontSize(6.5);
  doc.text("Imprima em escala 100%. Meça os contornos antes de usar etiquetas adesivas.", resolved.marginX, 8.8);

  for (let index = 0; index < resolved.labelsPerPage; index += 1) {
    const { x, y } = labelPosition(index, resolved);
    drawLabelFrame(doc, x, y, resolved, COLORS.blue);
    doc.setDrawColor(...COLORS.copper);
    doc.setLineWidth(0.18);
    doc.line(x - 1.5, y, x + 2.2, y);
    doc.line(x, y - 1.5, x, y + 2.2);
    doc.setTextColor(...COLORS.muted);
    doc.setFont("courier", "normal");
    doc.setFontSize(6.2);
    doc.text(`${resolved.labelWidth.toFixed(1)} x ${resolved.labelHeight.toFixed(1)} mm`, x + 3, y + 5);
    doc.text(`slot ${String(index + 1).padStart(2, "0")}`, x + 3, y + resolved.labelHeight - 3);
  }
  return doc;
}

function drawReportHeader(doc, title, description) {
  const width = doc.internal.pageSize.getWidth();
  doc.setFillColor(...COLORS.navy);
  doc.rect(0, 0, width, 28, "F");
  doc.setFillColor(...COLORS.copper);
  doc.rect(0, 27.4, width, 0.6, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("NEPTERA", 12, 11);
  doc.setFontSize(12);
  doc.text(title, 12, 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text(description, 12, 23.5);
}

function reportFooter(doc) {
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  doc.setDrawColor(...COLORS.line);
  doc.line(12, height - 10, width - 12, height - 10);
  doc.setTextColor(...COLORS.muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text("Documento ficticio para validacao local - nenhum patrimonio real gerado", 12, height - 6);
  doc.text(`Pagina ${doc.internal.getNumberOfPages()}`, width - 12, height - 6, { align: "right" });
}

export function createLogisticsDocument(sections = []) {
  if (!Array.isArray(sections) || sections.length === 0) throw new TypeError("Informe secoes logisticas ficticias.");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  const pageHeight = doc.internal.pageSize.getHeight();
  drawReportHeader(doc, "Relatorio logistico patrimonial", "Implantacao, aplicacao e conferencia das etiquetas fisicas.");
  let cursorY = 35;

  sections.forEach((section) => {
    const rows = Array.isArray(section.rows) ? section.rows : [];
    if (cursorY > pageHeight - 34) {
      doc.addPage("a4", "landscape");
      drawReportHeader(doc, "Relatorio logistico patrimonial", "Continuidade do recorte ficticio de implantacao.");
      cursorY = 35;
    }

    doc.setTextColor(...COLORS.copper);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.text(String(section.title || "Sem grupo"), 12, cursorY);
    cursorY += 4.4;

    const meta = [
      section.point ? `Ponto: ${section.point}` : "",
      section.route ? `Rota: ${section.route}` : "",
      section.responsible ? `Responsavel: ${section.responsible}` : "",
      section.phone ? `Telefone: ${section.phone}` : "",
    ].filter(Boolean).join("  |  ");
    if (meta) {
      doc.setTextColor(...COLORS.muted);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.2);
      doc.text(meta, 12, cursorY);
      cursorY += 4;
    }

    autoTable(doc, {
      startY: cursorY,
      head: [["Patrimonio", "Equipamento", "Categoria", "Situacao", "Aplicado", "Conferido"]],
      body: rows.map((row) => [
        row.code || "SEM ETIQUETA",
        row.equipment || "-",
        row.category || "-",
        row.state || "-",
        row.applied ? "X" : "[ ]",
        row.confirmed ? "X" : "[ ]",
      ]),
      theme: "grid",
      margin: { left: 12, right: 12, bottom: 15 },
      styles: { fontSize: 7.4, cellPadding: 2.2, textColor: COLORS.ink, lineColor: COLORS.line, lineWidth: 0.18 },
      headStyles: { fillColor: COLORS.navy, textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: COLORS.panel },
      columnStyles: { 0: { font: "courier", fontStyle: "bold", cellWidth: 30 }, 4: { halign: "center", cellWidth: 18 }, 5: { halign: "center", cellWidth: 19 } },
      didDrawPage: () => reportFooter(doc),
    });
    cursorY = doc.lastAutoTable.finalY + 9;
  });
  return doc;
}

export function savePdfDocument(doc, filename) {
  if (!doc || typeof doc.save !== "function") throw new TypeError("Documento PDF invalido.");
  doc.save(filename);
}
