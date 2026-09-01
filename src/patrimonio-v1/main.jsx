import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import PatrimonioHarnessApp from "./PatrimonioHarnessApp.jsx";
import { createLabelDocument, savePdfDocument } from "./patrimonioPdf.js";
import "./patrimonio-v1.css";

async function downloadLabels(request) {
  const labels = request.labels.map((label) => ({
    code: label.patrimonyCode,
    publicId: label.publicId,
  }));
  const document = await createLabelDocument(labels);
  savePdfDocument(document, `${request.batchId}-etiquetas-ficticias.pdf`);
}

const harness = import.meta.env.DEV ? (
  <StrictMode>
    <PatrimonioHarnessApp onPdfRequest={downloadLabels} />
  </StrictMode>
) : null;

createRoot(document.getElementById("patrimonio-v1-root")).render(harness);
