import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { compactPublicId } from "./fixtures.js";
import {
  createCalibrationDocument,
  createFinalReportDocument,
  createLabelDocument,
  createRouteReportDocument,
  DEFAULT_LABEL_SETTINGS,
} from "./patrimonioPdf.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(currentDir, "../../output/pdf");

export const SAMPLE_LABELS = Object.freeze(
  Array.from({ length: 18 }, (_, index) => ({
    code: `NP-${String(900001 + index).padStart(6, "0")}`,
    publicId: compactPublicId(900001 + index),
  })),
);

export const SAMPLE_ROUTE_REPORT = Object.freeze({
  sample: true,
  campaign: "Implantação Patrimonial NEPTERA 2026 - AMOSTRA",
  batchId: "PAT-TESTE-0001",
  context: "Bar do Sávio - cenário fictício",
  responsible: "Operador de teste",
  rows: [
    {
      equipment: "Terminal Amarelo Fictício",
      category: "Terminais",
      legacyReference: "TER-TESTE-004",
      currentPosition: "Bar do Sávio",
    },
    {
      equipment: "Terminal Verde Fictício",
      category: "Terminais",
      legacyReference: "Sem referência",
      currentPosition: "Bar do Sávio",
    },
    {
      equipment: "TV Operacional Fictícia",
      category: "Televisões",
      legacyReference: "TV-TESTE-012",
      currentPosition: "Bar do Sávio",
    },
  ],
});

export const SAMPLE_FINAL_REPORT = Object.freeze({
  sample: true,
  campaign: "Implantação Patrimonial NEPTERA 2026 - AMOSTRA",
  batchId: "PAT-TESTE-0001",
  context: "Bar do Sávio - cenário fictício",
  rows: [
    {
      patrimonyCode: "NP-900001",
      equipment: "Terminal Amarelo Fictício",
      category: "Terminais",
      currentPosition: "Bar do Sávio",
      legacyReference: "TER-TESTE-004",
      state: "Conferido",
      appliedBy: "Operador de teste",
      appliedAt: "01/09/2026 09:14",
      verifiedBy: "Supervisor de teste",
      verifiedAt: "01/09/2026 09:17",
    },
    {
      patrimonyCode: "NP-900003",
      equipment: "Terminal Verde Fictício",
      category: "Terminais",
      currentPosition: "Bar do Sávio",
      legacyReference: "Sem referência",
      state: "Conferido",
      appliedBy: "Operador de teste",
      appliedAt: "01/09/2026 09:22",
      verifiedBy: "Supervisor de teste",
      verifiedAt: "01/09/2026 09:25",
    },
    {
      patrimonyCode: "NP-900007",
      equipment: "TV Operacional Fictícia",
      category: "Televisões",
      currentPosition: "Bar do Sávio",
      legacyReference: "TV-TESTE-012",
      state: "Conferido",
      appliedBy: "Operador de teste",
      appliedAt: "01/09/2026 09:31",
      verifiedBy: "Supervisor de teste",
      verifiedAt: "01/09/2026 09:34",
    },
  ],
});

async function writePdf(filename, doc) {
  const content = Buffer.from(doc.output("arraybuffer"));
  await writeFile(path.join(outputDir, filename), content);
}

await mkdir(outputDir, { recursive: true });
await writePdf(
  "neptera-etiquetas-livres-amostra.pdf",
  await createLabelDocument(SAMPLE_LABELS, DEFAULT_LABEL_SETTINGS, { batchId: "PAT-TESTE-0001" }),
);
await writePdf(
  "neptera-calibracao-a4-amostra.pdf",
  await createCalibrationDocument(DEFAULT_LABEL_SETTINGS),
);
await writePdf(
  "neptera-roteiro-implantacao-amostra.pdf",
  createRouteReportDocument(SAMPLE_ROUTE_REPORT),
);
await writePdf(
  "neptera-relatorio-final-amostra.pdf",
  createFinalReportDocument(SAMPLE_FINAL_REPORT),
);

console.info(`Quatro artefatos PDF de amostra foram gerados em ${outputDir}.`);
