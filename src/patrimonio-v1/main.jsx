const rootElement = document.getElementById("patrimonio-v1-root");

async function bootstrapDevelopmentHarness() {
  const [reactModule, reactDomModule, appModule, pdfModule, qrModule] = await Promise.all([
    import("react"),
    import("react-dom/client"),
    import("./PatrimonioHarnessApp.jsx"),
    import("./patrimonioPdf.js"),
    import("qrcode"),
    import("./patrimonio-v1.css"),
  ]);
  const qrApi = qrModule.default || qrModule;

  async function downloadArtifact(type, payload) {
    const document = await pdfModule.createArtifactDocument(type, payload);
    const filename = pdfModule.artifactFilename(type, payload);
    pdfModule.savePdfDocument(document, filename);
  }

  async function prepareQr(_label, payload) {
    const dataUrl = await qrApi.toDataURL(payload, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 360,
    });
    return { dataUrl };
  }

  reactDomModule.createRoot(rootElement).render(
    reactModule.createElement(
      reactModule.StrictMode,
      null,
      reactModule.createElement(appModule.default, {
        onArtifactRequest: downloadArtifact,
        onQrRequest: prepareQr,
      }),
    ),
  );
}

if (import.meta.env.DEV && rootElement) {
  bootstrapDevelopmentHarness().catch(() => {
    rootElement.textContent = "Não foi possível iniciar o harness local de Patrimônio.";
  });
} else if (rootElement) {
  rootElement.replaceChildren();
}
