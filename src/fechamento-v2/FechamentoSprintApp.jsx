import { useEffect, useMemo, useState } from "react";
import VariantFinal from "./VariantFinal.jsx";
import {
  calculateFinancials,
  createInitialAdjustments,
  createInitialValues,
  FIXTURE,
} from "./model.js";

function initialQuery() {
  const params = new URLSearchParams(window.location.search);
  return {
    light: (params.get("tema") || "claro").toLowerCase() !== "escuro",
  };
}

function updateQuery(light) {
  const url = new URL(window.location.href);
  url.searchParams.delete("conceito");
  url.searchParams.delete("concept");
  url.searchParams.delete("variation");
  url.searchParams.set("variacao", "FINAL");
  url.searchParams.set("tema", light ? "claro" : "escuro");
  window.history.replaceState({}, "", url);
}

function RouteDrawer({ current, onSelect, onClose }) {
  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="v2-drawer-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="v2-route-drawer" role="dialog" aria-modal="true" aria-labelledby="v2-route-title">
        <header>
          <div><small>Contexto progressivo</small><h2 id="v2-route-title">Alterar rota</h2></div>
          <button type="button" className="v2-close" onClick={onClose} aria-label="Fechar seleção de rota">×</button>
        </header>
        <p>A lista aparece somente durante a escolha. Os valores de QA permanecem iguais nesta direção final.</p>
        <div className="v2-route-options">
          {FIXTURE.routes.map((route) => (
            <button type="button" key={route.id} className={route.id === current.id ? "is-selected" : ""} onClick={() => onSelect(route)}>
              <span><strong>{route.name}</strong><small>{route.manager}</small></span>
              <span><b>{route.points} pt.</b><small>{route.equipment} equip.</small></span>
              <em>{route.id === current.id ? "Selecionada" : "Selecionar"}</em>
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}

export default function FechamentoSprintApp() {
  const query = useMemo(() => initialQuery(), []);
  const [light, setLight] = useState(query.light);
  const [values, setValues] = useState(createInitialValues);
  const [adjustments, setAdjustments] = useState(createInitialAdjustments);
  const [route, setRoute] = useState(FIXTURE.routes[0]);
  const [stage, setStage] = useState(3);
  const [routeOpen, setRouteOpen] = useState(false);
  const [expensesOpen, setExpensesOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [toast, setToast] = useState("");
  const totals = useMemo(() => calculateFinancials(values, adjustments), [adjustments, values]);

  useEffect(() => {
    updateQuery(light);
  }, [light]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function chooseTheme(nextLight) {
    setLight(nextLight);
  }

  function updateValue(modalityId, field, value) {
    setValues((current) => ({ ...current, [modalityId]: { ...current[modalityId], [field]: value } }));
  }

  function updateAdjustment(field, value) {
    setAdjustments((current) => ({ ...current, [field]: value }));
  }

  function selectRoute(next) {
    setRoute(next);
    setRouteOpen(false);
    setToast(`Rota alterada para ${next.name}; valores de QA preservados.`);
  }

  function act(action) {
    const messages = {
      save: "Rascunho simulado salvo somente na memória do harness.",
      preview: "Visualização simulada pronta; nenhum PDF real foi gerado.",
      export: "Exportação simulada; nenhum arquivo real foi criado.",
      send: `Envio simulado para ${route.manager}; nenhuma notificação saiu do navegador.`,
    };
    if (action === "send") {
      setSent(true);
      setStage(5);
    }
    setToast(messages[action] || "Ação simulada no harness.");
  }

  const workspace = {
    fixture: FIXTURE,
    route,
    values,
    adjustments,
    totals,
    stage,
    sent,
    expensesOpen,
    setStage,
    openRoute: () => setRouteOpen(true),
    toggleExpenses: () => setExpensesOpen((current) => !current),
    updateValue,
    updateAdjustment,
    act,
  };

  return (
    <div className={`app operations-shell fechamento-v2-app${light ? " tema-claro" : ""}`} data-variation="FINAL">
      <header className="v2-labbar">
        <div className="v2-lab-brand">
          <img src="/brand/neptera/icons/neptera-favicon-48.png" alt="" />
          <span><strong>NEPTERA</strong><small>Fechamento · direção final</small></span>
        </div>
        <div className="v2-final-badge" aria-label="Direção final: A1 Refined com coluna de decisão do A3 Executive">
          <b>FINAL</b>
          <span>A1 Refined + Parecer A3</span>
        </div>
        <div className="v2-theme-switch" role="group" aria-label="Selecionar tema">
          <button type="button" className={light ? "is-active" : ""} aria-pressed={light} onClick={() => chooseTheme(true)}>Claro</button>
          <button type="button" className={!light ? "is-active" : ""} aria-pressed={!light} onClick={() => chooseTheme(false)}>Escuro</button>
        </div>
      </header>
      <VariantFinal workspace={workspace} />
      {routeOpen && <RouteDrawer current={route} onSelect={selectRoute} onClose={() => setRouteOpen(false)} />}
      {toast && <div className="v2-toast" role="status">{toast}</div>}
    </div>
  );
}
