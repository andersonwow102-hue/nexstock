import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  createCalibrationDocument,
  createLabelDocument,
  createLogisticsDocument,
  DEFAULT_LABEL_SETTINGS,
} from "./patrimonioPdf.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(currentDir, "../../output/pdf");

export const SAMPLE_LABELS = Object.freeze([
  { code: "NP-000001", publicId: "73000000-0000-4000-8000-000000000001" },
  { code: "NP-000002", publicId: "73000000-0000-4000-8000-000000000002" },
  { code: "NP-000003", publicId: "73000000-0000-4000-8000-000000000003" },
  { code: "NP-000004", publicId: "73000000-0000-4000-8000-000000000004" },
  { code: "NP-000005", publicId: "73000000-0000-4000-8000-000000000005" },
  { code: "NP-000006", publicId: "73000000-0000-4000-8000-000000000006" },
]);

export const SAMPLE_LOGISTICS = Object.freeze([
  {
    title: "Em ponto - Rota Modelo Norte",
    point: "Ponto Modelo Aurora",
    route: "Rota Modelo Norte",
    responsible: "Responsavel Ficticio A",
    phone: "(00) 00000-0001",
    rows: [
      { code: "NP-000001", equipment: "Terminal Operacional 001", category: "Terminais", state: "Etiqueta pendente" },
      { code: "NP-000002", equipment: "TV Operacional 002", category: "Televisoes", state: "Aplicada", applied: true },
    ],
  },
  {
    title: "Com gerente",
    responsible: "Gerente Ficticio B",
    rows: [{ code: "NP-000003", equipment: "Tablet de Rota 003", category: "Tablets", state: "Conferida", applied: true, confirmed: true }],
  },
  {
    title: "Estoque interno",
    rows: [{ code: "NP-000004", equipment: "Impressora de Cupom 004", category: "Impressoras", state: "Etiqueta pendente" }],
  },
  {
    title: "Em transferencia",
    rows: [{ code: "NP-000005", equipment: "Carregador USB-C 005", category: "Carregadores", state: "Aguardando recebimento" }],
  },
  {
    title: "Em conserto",
    rows: [{ code: "NP-000006", equipment: "PDV Touchscreen 006", category: "PDV Touchscreen", state: "Em conserto" }],
  },
  {
    title: "Revisao necessaria - sem etiqueta gerada",
    rows: [{ code: "", equipment: "Terminal Operacional 007", category: "Terminais", state: "Localizacao invalida" }],
  },
]);

async function writePdf(filename, doc) {
  const content = Buffer.from(doc.output("arraybuffer"));
  await writeFile(path.join(outputDir, filename), content);
}

await mkdir(outputDir, { recursive: true });
await writePdf("neptera-etiquetas-patrimonio-ficticias.pdf", await createLabelDocument(SAMPLE_LABELS, DEFAULT_LABEL_SETTINGS));
await writePdf("neptera-calibracao-etiquetas-a4.pdf", createCalibrationDocument(DEFAULT_LABEL_SETTINGS));
await writePdf("neptera-relatorio-logistico-ficticio.pdf", createLogisticsDocument(SAMPLE_LOGISTICS));

