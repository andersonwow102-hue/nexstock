import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

const parametros = new URLSearchParams(window.location.search);
const previewFechamento = import.meta.env.DEV && parametros.get("preview") === "fechamento";
const raiz = createRoot(document.getElementById("root"));

function renderizar(conteudo) {
  raiz.render(<StrictMode>{conteudo}</StrictMode>);
}

async function iniciarPreviewFechamento() {
  const { default: FechamentoPreviewApp } = await import("./FechamentoPreviewApp.jsx");
  renderizar(<FechamentoPreviewApp />);
}

async function iniciarAplicacao() {
  const [{ default: App }, Sentry, monitoring] = await Promise.all([
    import("./App.jsx"),
    import("@sentry/react"),
    import("./monitoring.js"),
  ]);

  monitoring.setupSentry();

  window.addEventListener("error", (event) => {
    monitoring.registrarErroOperacional(event.error || new Error(event.message), {
      categoria: "frontend",
      acao: "erro_global",
      mensagem: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason instanceof Error ? event.reason : new Error(String(event.reason || "Promise rejeitada"));
    monitoring.registrarErroOperacional(reason, {
      categoria: "frontend",
      acao: "promise_rejeitada",
      mensagem: reason.message,
    });
  });

  renderizar(
    <Sentry.ErrorBoundary fallback={<div className="app-fallback-error">O NEPTERA encontrou um erro inesperado. Atualize a página e tente novamente.</div>}>
      <App />
    </Sentry.ErrorBoundary>,
  );

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }
}

(previewFechamento ? iniciarPreviewFechamento() : iniciarAplicacao()).catch((erro) => {
  console.error("Falha ao iniciar o NEPTERA:", erro);
  renderizar(<div className="app-fallback-error">Não foi possível iniciar o NEPTERA. Atualize a página e tente novamente.</div>);
});
