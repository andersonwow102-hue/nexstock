import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createAssetQr } from "./patrimonioPdf.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(currentDir, "../../output/qr");
const publicId = "73000000-0000-4000-8000-000000000001";
const { dataUrl } = await createAssetQr(publicId, { width: 720 });

await mkdir(outputDir, { recursive: true });
await writeFile(
  path.join(outputDir, "neptera-patrimonio-qr-ficticio.png"),
  Buffer.from(dataUrl.split(",")[1], "base64"),
);
