import { useId, useState, useSyncExternalStore } from "react";
import {
  consumePwaInstallPrompt,
  getPwaInstallSnapshot,
  subscribePwaInstall,
} from "./pwaInstallCoordinator.js";
import { PWA_INSTALL_STATES } from "./pwaInstallState.js";
import "./PwaInstallControl.css";

const COPY_BY_STATE = {
  [PWA_INSTALL_STATES.AVAILABLE]: {
    label: "Instalar NEPTERA",
    help: "Instalação segura confirmada pelo navegador.",
  },
  [PWA_INSTALL_STATES.INSTALLED]: {
    label: "NEPTERA instalada",
    help: "Este dispositivo já está usando o modo instalado.",
  },
  [PWA_INSTALL_STATES.UNAVAILABLE]: {
    label: "Instalar NEPTERA",
    help: "Use o menu do navegador e escolha “Instalar aplicativo” ou “Adicionar à tela inicial”.",
  },
};

export default function PwaInstallControl({ icon = null, diagnosticState = null }) {
  const helpId = useId();
  const installSnapshot = useSyncExternalStore(
    subscribePwaInstall,
    getPwaInstallSnapshot,
    getPwaInstallSnapshot,
  );
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");

  const forcedState = import.meta.env.DEV && Object.values(PWA_INSTALL_STATES).includes(diagnosticState)
    ? diagnosticState
    : null;
  const state = forcedState || installSnapshot.state;
  const copy = COPY_BY_STATE[state];

  async function install() {
    if (busy || state === PWA_INSTALL_STATES.INSTALLED) return;

    if (state === PWA_INSTALL_STATES.UNAVAILABLE) {
      setFeedback(copy.help);
      return;
    }

    if (forcedState && installSnapshot.state !== PWA_INSTALL_STATES.AVAILABLE) {
      setFeedback("Prévia DEV: o prompt nativo só aparece quando o navegador confirma a instalação.");
      return;
    }

    setBusy(true);
    setFeedback("");
    try {
      const choice = await consumePwaInstallPrompt();
      setFeedback(choice.outcome === "accepted"
        ? "Instalação aceita. Conclua a confirmação exibida pelo navegador."
        : "Instalação cancelada. Você pode tentar novamente pelo menu do navegador.");
    } catch {
      setFeedback("Não foi possível abrir o instalador. Use a opção de instalação do navegador.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pwa-install-control" data-pwa-install-state={state}>
      <button
        aria-label={state === PWA_INSTALL_STATES.INSTALLED ? "NEPTERA instalada" : "Instalar aplicativo NEPTERA"}
        aria-describedby={helpId}
        className="sidebar-utility sidebar-app-install"
        disabled={busy || state === PWA_INSTALL_STATES.INSTALLED}
        onClick={install}
        type="button"
      >
        {icon}
        <span>{busy ? "Abrindo instalador…" : copy.label}</span>
      </button>
      <p aria-live="polite" className="pwa-install-help" id={helpId}>{feedback || copy.help}</p>
    </div>
  );
}
