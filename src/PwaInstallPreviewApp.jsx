import { useEffect, useState } from "react";
import { OperationIcon } from "./components/operations/OperationsUI.jsx";
import PwaInstallControl from "./components/pwa/PwaInstallControl.jsx";
import { PWA_INSTALL_STATES } from "./components/pwa/pwaInstallState.js";
import "./PwaInstallPreview.css";

const STATE_OPTIONS = new Set(Object.values(PWA_INSTALL_STATES));

function requestedState() {
  const value = new URLSearchParams(window.location.search).get("estado");
  return STATE_OPTIONS.has(value) ? value : PWA_INSTALL_STATES.UNAVAILABLE;
}

export default function PwaInstallPreviewApp() {
  const [manifest, setManifest] = useState(null);
  const [manifestStatus, setManifestStatus] = useState("Carregando manifesto…");
  const state = requestedState();

  useEffect(() => {
    const controller = new AbortController();
    fetch("/manifest.webmanifest", { cache: "no-store", signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => {
        setManifest(data);
        setManifestStatus("Manifesto carregado e validável pelo navegador");
      })
      .catch((error) => {
        if (error.name !== "AbortError") setManifestStatus("Manifesto indisponível nesta prévia");
      });
    return () => controller.abort();
  }, []);

  if (!import.meta.env.DEV) return null;

  return (
    <main className="pwa-preview" data-preview-mode="safe-local" data-preview-route="/manifest.webmanifest">
      <div className="pwa-preview__shell">
        <header>
          <p className="pwa-preview__eyebrow">Diagnóstico DEV · PWA</p>
          <h1>Instalação NEPTERA</h1>
          <p>Prévia isolada do manifesto e dos estados do instalador nativo.</p>
        </header>

        <section className="pwa-preview__card" aria-labelledby="pwa-preview-title">
          <img
            alt="Ícone oficial do aplicativo NEPTERA"
            className="pwa-preview__icon"
            src="/brand/neptera/icons/neptera-app-icon-192.png"
          />
          <div>
            <p className="pwa-preview__eyebrow" id="pwa-preview-title">{manifestStatus}</p>
            <dl className="pwa-preview__facts">
              <div><dt>name</dt><dd>{manifest?.name || "NEPTERA"}</dd></div>
              <div><dt>short_name</dt><dd>{manifest?.short_name || "NEPTERA"}</dd></div>
              <div><dt>id</dt><dd>{manifest?.id || "/"}</dd></div>
              <div><dt>ícone</dt><dd>{manifest?.icons?.[0]?.src || "/brand/neptera/icons/neptera-app-icon-192.png"}</dd></div>
            </dl>
            <PwaInstallControl
              diagnosticState={state}
              icon={<OperationIcon name="download" size={18} />}
            />
          </div>
        </section>

        <nav aria-label="Estados simulados do instalador" className="pwa-preview__states">
          <a href="?preview=pwa&estado=available">Prompt disponível</a>
          <a href="?preview=pwa&estado=installed">Já instalado</a>
          <a href="?preview=pwa&estado=unavailable">Indisponível</a>
        </nav>

        <p className="pwa-preview__note">
          Somente DEV. Nenhum APK é baixado e nenhuma escrita é feita no banco. O prompt real continua sob controle do navegador.
        </p>
      </div>
    </main>
  );
}
