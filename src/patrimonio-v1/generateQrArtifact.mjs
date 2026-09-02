import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { compactPublicId } from "./fixtures.js";
import { createAssetQr, SAMPLE_QR_ORIGIN } from "./patrimonioPdf.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(currentDir, "../../output/qr");
const publicId = compactPublicId(900001);
const { dataUrl, payload } = await createAssetQr(publicId, {
  origin: SAMPLE_QR_ORIGIN,
  width: 720,
});

await mkdir(outputDir, { recursive: true });
await writeFile(
  path.join(outputDir, "neptera-patrimonio-qr-amostra-invalido.png"),
  Buffer.from(dataUrl.split(",")[1], "base64"),
);

console.info(`QR de amostra gerado para ${payload}.`);
