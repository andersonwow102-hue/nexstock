import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icons.jsx";
import {
  buildFinalReportJob,
  buildLabelPrintJob,
  buildQrPayload,
  buildRegistrationLabelPrintJob,
  buildRouteReportJob,
} from "./integrationPoints.js";
import {
  CATEGORIES,
  BATCH_CREATION_SCENARIOS,
  INVENTORY_FILTERS,
  LABEL_STATES,
  OPERATING_CONTEXTS,
  activeLabelForEquipment,
  batchDemand,
  batchLabels,
  batchProgress,
  bindFreeLabel,
  campaignProgress,
  candidateEquipments,
  confirmLabel,
  createPatrimonyFixture,
  createQueixoBatchFixture,
  equipmentPatrimonyState,
  filterInventory,
  formatNp,
  generateFreeLabelBatch,
  inventorySummary,
  labelForEquipment,
  markBatchPrinted,
  markLabelApplied,
  prepareBatchPreview,
  resolveLabelByCode,
  simulateEquipmentRegistration,
  suggestBatchName,
} from "./model.js";

const MODES = Object.freeze([
  { value: "overview", label: "Visão geral", icon: "campaign" },
  { value: "batches", label: "Lotes", icon: "layers" },
  { value: "deployment", label: "Implantação", icon: "deploy" },
]);

const SCENARIOS = Object.freeze([
  { value: "campanha", label: "Campanha inicial", mode: "overview" },
  { value: "ledger", label: "Inventory Ledger", mode: "overview" },
  { value: "dossie", label: "Dossiê", mode: "overview", equipmentId: "eq-0001" },
  { value: "legado", label: "Legado + NP", mode: "overview", equipmentId: "eq-0001" },
  { value: "maquina", label: "Máquina de Brindes", mode: "overview", equipmentId: "eq-0455" },
  { value: "novo", label: "Cadastro novo", mode: "overview" },
  { value: "multiplo", label: "Cadastro múltiplo", mode: "overview" },
  { value: "lotes", label: "Lotes", mode: "batches" },
  { value: "lote_aberto", label: "Lote aberto", mode: "batches" },
  { value: "lote_novo_total", label: "Novo lote · demanda total", mode: "batches", batchComposer: "total" },
  { value: "lote_novo_queixo", label: "Novo lote · Queixo", mode: "batches", batchComposer: "partial" },
  { value: "lote_confirmacao", label: "Confirmação · Queixo", mode: "batches", batchPreview: "partial" },
  { value: "lote_criado", label: "Lote criado · Queixo", mode: "batches", showcaseBatch: true },
  { value: "lote_dossie", label: "Dossiê · Queixo", mode: "batches", showcaseBatch: true },
  { value: "lote_excesso", label: "Novo lote · excesso", mode: "batches", batchComposer: "excess" },
  { value: "lote_mobile", label: "Novo lote · mobile", mode: "batches", batchComposer: "partial" },
  { value: "ativacao", label: "Ativação mobile", mode: "deployment", step: "scan", labelId: "pat-000001" },
  { value: "bar_savio", label: "Bar do Sávio", mode: "deployment", step: "equipment", labelId: "pat-000001", contextId: "bar-savio" },
  { value: "aplicacao", label: "Aplicação", mode: "deployment", step: "apply", labelId: "pat-000004" },
  { value: "conferencia", label: "Conferência", mode: "deployment", step: "verify", labelId: "pat-000006" },
  { value: "concluido", label: "Concluído", mode: "deployment", step: "complete", labelId: "pat-000008" },
  { value: "divergencia", label: "Divergência", mode: "deployment", step: "divergence", labelId: "pat-000004" },
  { value: "vazio", label: "Estado vazio", mode: "overview" },
  { value: "erro", label: "Estado de erro", mode: "overview" },
]);

const BATCH_STATUS = Object.freeze({
  preparado: "Preparado",
  gerado: "Etiquetas geradas",
  em_uso: "Em implantação",
  concluido: "Concluído",
  cancelado: "Cancelado",
});

const CONTEXT_TYPES = Object.freeze([
  { value: "stock", label: "Estoque interno", icon: "box" },
  { value: "route", label: "Rota", icon: "route" },
  { value: "point", label: "Ponto", icon: "pin" },
  { value: "manager", label: "Com gerente", icon: "user" },
  { value: "repair", label: "Conserto", icon: "wrench" },
  { value: "transfer", label: "Transferência", icon: "deploy" },
]);

const STEP_LABELS = Object.freeze([
  ["scan", "Etiqueta"],
  ["context", "Contexto"],
  ["equipment", "Equipamento"],
  ["apply", "Aplicação"],
  ["verify", "Conferência"],
  ["complete", "Concluído"],
]);

const DIALOG_FOCUSABLE = "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex='-1'])";

function batchName(batch) {
  return batch?.friendlyName || batch?.name || batch?.context?.label || "Lote sem nome";
}

function scenarioDraft(kind = "partial") {
  const preset = BATCH_CREATION_SCENARIOS[kind] || BATCH_CREATION_SCENARIOS.partial;
  const context = OPERATING_CONTEXTS.find((item) => item.id === preset.contextId) || OPERATING_CONTEXTS[0];
  return {
    contextType: context.type,
    contextId: context.id,
    quantity: String(preset.quantity),
    friendlyName: preset.friendlyName,
    nameEdited: false,
  };
}

function defaultBatchDraft(state) {
  const context = OPERATING_CONTEXTS[0];
  const demand = batchDemand(state, context.id);
  return {
    contextType: context.type,
    contextId: context.id,
    quantity: demand ? String(demand) : "",
    friendlyName: suggestBatchName(state, context.id),
    nameEdited: false,
  };
}

function keepDialogFocus(event, root) {
  if (event.key !== "Tab" || !root) return;
  const focusable = [...root.querySelectorAll(DIALOG_FOCUSABLE)].filter((element) => !element.hidden);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function initialParams() {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("modo");
  const scenario = params.get("cenario");
  return {
    mode: MODES.some((item) => item.value === mode) ? mode : "overview",
    theme: params.get("tema") === "escuro" ? "escuro" : "claro",
    scenario: SCENARIOS.some((item) => item.value === scenario) ? scenario : "campanha",
  };
}

function syncParams({ mode, theme, scenario }) {
  const params = new URLSearchParams(window.location.search);
  params.set("modo", mode);
  params.set("tema", theme);
  params.set("cenario", scenario);
  window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
}

function RovingTabs({ label, value, options, onChange }) {
  const refs = useRef([]);
  function onKeyDown(event, index) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const target = event.key === "Home"
      ? 0
      : event.key === "End"
        ? options.length - 1
        : (index + (event.key === "ArrowLeft" ? -1 : 1) + options.length) % options.length;
    onChange(options[target].value);
    refs.current[target]?.focus();
  }
  return (
    <div aria-label={label} className="pv-roving-tabs" role="tablist">
      {options.map((option, index) => (
        <button
          aria-controls={`pv-panel-${option.value}`}
          aria-selected={value === option.value}
          className={value === option.value ? "is-active" : ""}
          id={`pv-tab-${option.value}`}
          key={option.value}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => onKeyDown(event, index)}
          ref={(node) => { refs.current[index] = node; }}
          role="tab"
          tabIndex={value === option.value ? 0 : -1}
          type="button"
        >
          <Icon name={option.icon} size={17} />
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}

function DevBar({ scenario, onScenario, theme, onTheme }) {
  return (
    <header className="pv-devbar">
      <div className="pv-brand">
        <img alt="" src="/brand/neptera/icons/neptera-favicon-48.png" />
        <span><strong>NEPTERA</strong><small>CONTROLE PATRIMONIAL · MARCO A</small></span>
      </div>
      <div className="pv-local-seal"><Icon name="shield" size={15} /><span>DEV-ONLY · FIXTURES · SEM BACKEND</span></div>
      <div className="pv-lab-controls">
        <label><span>Cenário</span><select aria-label="Cenário do harness" onChange={(event) => onScenario(event.target.value)} value={scenario}>{SCENARIOS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <div aria-label="Tema" className="pv-theme-switch" role="group">
          <button aria-pressed={theme === "claro"} onClick={() => onTheme("claro")} title="Tema claro" type="button"><Icon name="sun" size={15} /><span>Claro</span></button>
          <button aria-pressed={theme === "escuro"} onClick={() => onTheme("escuro")} title="Tema escuro" type="button"><Icon name="moon" size={15} /><span>Escuro</span></button>
        </div>
      </div>
    </header>
  );
}

function PageHead({ onPrepare }) {
  return (
    <section className="pv-page-head">
      <div>
        <p>EQUIPAMENTOS <span>/</span> CONTROLE PATRIMONIAL</p>
        <h1>Patrimônio</h1>
        <span>Geração, impressão, implantação e conferência da identidade física.</span>
      </div>
      <button className="pv-button pv-button--primary" onClick={onPrepare} type="button"><Icon name="plus" />Novo lote</button>
    </section>
  );
}

function SummaryStrip({ state }) {
  const summary = inventorySummary(state);
  const metrics = [
    [summary.campaignEquipment, "Campanha", "snapshot histórico"],
    [summary.withoutNp, "Sem NP", "equipamentos"],
    [summary.withNp, "Com NP", "vinculados"],
    [summary.availableLabels, "Disponíveis", "etiquetas livres"],
    [summary.bound, "Pendentes", "para aplicar"],
    [summary.applied, "Aplicados", "para conferir"],
    [summary.verified, "Conferidos", "implantados"],
    [summary.legacyReferences, "Legados", `${summary.nonPatrimonial} não patrim.`],
  ];
  return <section aria-label="Resumo patrimonial" className="pv-summary-strip">{metrics.map(([value, label, detail]) => <div key={label}><strong>{value}</strong><span>{label}</span><small>{detail}</small></div>)}</section>;
}

function CampaignBoard({ state, onScenario }) {
  const progress = campaignProgress(state);
  const summary = inventorySummary(state);
  return (
    <div className="pv-campaign-layout">
      <section className="pv-campaign-board" aria-labelledby="campaign-title">
        <header><div><small>CAMPANHA ATIVA · {state.campaign.code}</small><h2 id="campaign-title">{state.campaign.name}</h2><p>{state.campaign.note}</p></div><span className="pv-status is-active">Em implantação</span></header>
        <div className="pv-campaign-spine" aria-label="Progressão da campanha">
          <article><span>01</span><div><small>SNAPSHOT</small><strong>{progress.total}</strong><p>equipamentos patrimoniáveis</p></div></article>
          <article><span>02</span><div><small>IDENTIDADE</small><strong>{progress.withNp}</strong><p>com NP vinculado</p></div><i style={{ "--progress": `${progress.withNpPercent}%` }} /></article>
          <article><span>03</span><div><small>APLICAÇÃO</small><strong>{progress.applied}</strong><p>etiquetas no equipamento</p></div><i style={{ "--progress": `${progress.appliedPercent}%` }} /></article>
          <article><span>04</span><div><small>CONFERÊNCIA</small><strong>{progress.verified}</strong><p>implantados</p></div><i style={{ "--progress": `${progress.verifiedPercent}%` }} /></article>
        </div>
        <footer><span><Icon name="info" size={16} />A campanha mede equipamentos. Os {summary.emitted} patrimônios emitidos são controlados separadamente.</span><button onClick={() => onScenario("lotes")} type="button">Abrir lotes <Icon name="chevron" size={14} /></button></footer>
      </section>
      <aside className="pv-decision-queue" aria-labelledby="queue-title">
        <header><small>PRÓXIMA AÇÃO</small><h2 id="queue-title">Fila operacional</h2></header>
        <button onClick={() => onScenario("ativacao")} type="button"><span className="is-teal"><Icon name="qr" /></span><div><strong>{summary.availableLabels} etiquetas livres</strong><small>Vincular por QR ou código</small></div><Icon name="chevron" /></button>
        <button onClick={() => onScenario("aplicacao")} type="button"><span><Icon name="tag" /></span><div><strong>{summary.bound} aguardam aplicação</strong><small>Vínculo concluído; falta o físico</small></div><Icon name="chevron" /></button>
        <button onClick={() => onScenario("conferencia")} type="button"><span className="is-green"><Icon name="check" /></span><div><strong>{summary.applied} aguardam conferência</strong><small>Segunda leitura independente</small></div><Icon name="chevron" /></button>
        <button onClick={() => onScenario("divergencia")} type="button"><span className="is-amber"><Icon name="alert" /></span><div><strong>{summary.review} revisões logísticas</strong><small>Corrigir pela movimentação oficial</small></div><Icon name="chevron" /></button>
      </aside>
    </div>
  );
}

function PatrimonyMark({ equipment, label }) {
  if (!equipment.eligible) return <span className="pv-code-badge is-non_asset">Não patrimoniável</span>;
  if (!label) return <span className="pv-code-badge is-missing">Patrimônio pendente</span>;
  return <span className={`pv-code-badge is-${label.state}`}><strong>{label.code}</strong><small>{LABEL_STATES[label.state]}</small></span>;
}

function InventoryLedger({ state, onSelect, focusMode = "all" }) {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState({ patrimony: focusMode === "legacy" ? "legacy" : "all", category: "", position: "" });
  const [page, setPage] = useState(1);
  const searchRef = useRef(null);
  const filtered = useMemo(() => filterInventory(state, filters, query), [state, filters, query]);
  const pageSize = 12;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => setPage(1), [query, filters]);
  useEffect(() => {
    setFilters((current) => ({ ...current, patrimony: focusMode === "legacy" ? "legacy" : "all" }));
  }, [focusMode]);
  useEffect(() => {
    function focusSearch(event) {
      const tagName = event.target?.tagName;
      if (event.key !== "/" || ["INPUT", "SELECT", "TEXTAREA"].includes(tagName)) return;
      event.preventDefault();
      searchRef.current?.focus();
    }
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);
  function changeFilter(key, value) { setFilters((current) => ({ ...current, [key]: value })); }
  return (
    <section className="pv-ledger" aria-labelledby="inventory-ledger-title">
      <header className="pv-ledger-head"><div><small>FONTE OPERACIONAL · EQUIPAMENTOS</small><h2 id="inventory-ledger-title">Inventory Ledger</h2></div><span><strong>{filtered.length}</strong> na visão atual</span></header>
      <div className="pv-ledger-toolbar">
        <label className="pv-search"><span className="pv-sr-only">Buscar</span><Icon name="search" /><input onChange={(event) => setQuery(event.target.value)} placeholder="Buscar NP, equipamento, ID ou referência anterior" ref={searchRef} value={query} /><kbd>/</kbd></label>
        <label><span>Patrimônio</span><select onChange={(event) => changeFilter("patrimony", event.target.value)} value={filters.patrimony}>{INVENTORY_FILTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label><span>Categoria</span><select onChange={(event) => changeFilter("category", event.target.value)} value={filters.category}><option value="">Todas</option>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
        <label><span>Posição</span><select onChange={(event) => changeFilter("position", event.target.value)} value={filters.position}><option value="">Todas</option><option value="stock">Estoque</option><option value="point">Ponto</option><option value="manager">Gerente</option><option value="repair">Conserto</option><option value="transfer">Transferência</option><option value="review">Revisão</option></select></label>
      </div>
      <div className="pv-ledger-scroll">
        <table>
          <thead><tr><th>Equipamento</th><th>Patrimônio NEPTERA</th><th>Referência anterior</th><th>Posição atual</th><th>Situação</th><th><span className="pv-sr-only">Ação</span></th></tr></thead>
          <tbody>{rows.map((equipment) => {
            const label = labelForEquipment(state.labels, equipment.id);
            const situation = equipmentPatrimonyState(equipment, state.labels);
            return <tr key={equipment.id}><td data-label="Equipamento"><strong>{equipment.name}</strong><small>{equipment.technicalId} · {equipment.category}</small></td><td data-label="Patrimônio"><PatrimonyMark equipment={equipment} label={label} /></td><td data-label="Referência anterior"><strong>{equipment.legacyCode || "—"}</strong><small>{equipment.legacyCode ? "Histórico preservado" : "Sem referência"}</small></td><td data-label="Posição atual"><strong>{equipment.position.label}</strong><small>{equipment.position.route}{equipment.position.manager ? ` · ${equipment.position.manager}` : ""}</small></td><td data-label="Situação"><span className={`pv-state is-${situation}`}>{situation === "review" ? "Revisão logística" : equipment.status}</span><small>{situation === "missing" ? "Sem NP" : situation === "pendente" ? "Trabalho físico pendente" : situation === "conferido" ? "Identidade conferida" : "Catálogo"}</small></td><td><button aria-label={`Abrir dossiê de ${equipment.name}`} className="pv-row-action" onClick={() => onSelect(equipment.id)} type="button">Dossiê <Icon name="chevron" size={15} /></button></td></tr>;
          })}</tbody>
        </table>
      </div>
      <footer className="pv-pagination"><span>Página {page} de {pages}</span><div><button disabled={page === 1} onClick={() => setPage((value) => value - 1)} type="button">Anterior</button><button disabled={page === pages} onClick={() => setPage((value) => value + 1)} type="button">Próxima</button></div></footer>
    </section>
  );
}

function Dossier({ state, equipmentId, onClose, onQr }) {
  const closeRef = useRef(null);
  const dialogRef = useRef(null);
  const equipment = state.equipments.find((item) => item.id === equipmentId);
  const label = equipment ? labelForEquipment(state.labels, equipment.id) : null;
  const events = label ? state.events.filter((event) => event.labelId === label.id).slice(-4).reverse() : [];
  useEffect(() => {
    if (!equipment) return undefined;
    const previousFocus = document.activeElement;
    closeRef.current?.focus();
    function handleKey(event) {
      if (event.key === "Escape") onClose();
      else keepDialogFocus(event, dialogRef.current);
    }
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      previousFocus?.focus?.();
    };
  }, [equipment, onClose]);
  if (!equipment) return null;
  return (
    <div className="pv-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()} role="presentation">
      <aside aria-labelledby="pv-dossier-title" aria-modal="true" className="pv-dossier" ref={dialogRef} role="dialog">
        <header><div><small>DOSSIÊ DO EQUIPAMENTO</small><h2 id="pv-dossier-title">{equipment.name}</h2><p>{equipment.technicalId} · {equipment.category}</p></div><button aria-label="Fechar dossiê" onClick={onClose} ref={closeRef} type="button"><Icon name="close" /></button></header>
        <section className="pv-dossier-identity"><small>IDENTIDADE PATRIMONIAL</small><PatrimonyMark equipment={equipment} label={label} /><dl><div><dt>Origem</dt><dd>{label ? label.origin === "cadastro" ? "Cadastro" : "Implantação inicial" : "—"}</dd></div><div><dt>Etiqueta</dt><dd>{label ? LABEL_STATES[label.state] : "Não emitida"}</dd></div><div><dt>Lote</dt><dd>{label?.batchId || "—"}</dd></div><div><dt>Referência anterior</dt><dd>{equipment.legacyCode || "—"}</dd></div></dl></section>
        <section className="pv-dossier-position"><small>POSIÇÃO OPERACIONAL · FONTE EQUIPAMENTOS</small><h3>{equipment.position.label}</h3><p>{equipment.position.route}{equipment.position.manager ? ` · ${equipment.position.manager}` : ""}</p><span><Icon name="route" />Movimentações não alteram NP ou QR.</span></section>
        <section className="pv-dossier-history"><small>HISTÓRICO PATRIMONIAL</small>{events.length ? <ol>{events.map((event) => <li key={event.id}><i /><span><strong>{event.title}</strong><small>{event.actor} · {new Date(event.createdAt).toLocaleDateString("pt-BR")}</small></span></li>)}</ol> : <p>Nenhum evento patrimonial para este equipamento.</p>}</section>
        <footer><button className="pv-button" disabled={!label} onClick={() => label && onQr(label)} type="button"><Icon name="qr" />Abrir QR</button><button className="pv-button pv-button--primary" onClick={onClose} type="button">Concluir leitura</button></footer>
      </aside>
    </div>
  );
}

function NewBatchComposer({ state, draft, onDraft, onReview, onClose }) {
  const titleRef = useRef(null);
  const dialogRef = useRef(null);
  const closeHandlerRef = useRef(onClose);
  const contexts = OPERATING_CONTEXTS.filter((item) => item.type === draft.contextType);
  const context = OPERATING_CONTEXTS.find((item) => item.id === draft.contextId) || contexts[0];
  const demand = context ? batchDemand(state, context.id) : 0;
  const quantity = Number(draft.quantity);
  const quantityIsValid = Number.isInteger(quantity) && quantity >= 1 && quantity <= 500;
  const excess = quantityIsValid ? Math.max(0, quantity - demand) : 0;
  const shortfall = quantityIsValid ? Math.max(0, demand - quantity) : 0;
  const coverage = demand > 0 && quantityIsValid ? Math.min(100, Math.round((quantity / demand) * 100)) : 0;

  useEffect(() => {
    closeHandlerRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousFocus = document.activeElement;
    titleRef.current?.focus();
    function handleKey(event) {
      if (event.key === "Escape") closeHandlerRef.current();
      else keepDialogFocus(event, dialogRef.current);
    }
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      previousFocus?.focus?.();
    };
  }, []);

  function selectContextType(contextType) {
    const nextContext = OPERATING_CONTEXTS.find((item) => item.type === contextType);
    if (!nextContext) return;
    onDraft({
      ...draft,
      contextType,
      contextId: nextContext.id,
      friendlyName: suggestBatchName(state, nextContext.id),
      nameEdited: false,
    });
  }

  function selectContext(contextId) {
    onDraft({
      ...draft,
      contextId,
      friendlyName: suggestBatchName(state, contextId),
      nameEdited: false,
    });
  }

  function submit(event) {
    event.preventDefault();
    if (!context || !quantityIsValid || !draft.friendlyName.trim()) return;
    onReview({
      batchId: draft.batchId,
      contextId: context.id,
      quantity,
      friendlyName: draft.friendlyName.trim(),
      demandAtCreation: demand,
    });
  }

  return (
    <div className="pv-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()} role="presentation">
      <section aria-labelledby="pv-composer-title" aria-modal="true" className="pv-batch-composer" ref={dialogRef} role="dialog">
        <header>
          <div><small>NOVO LOTE · PLANEJAMENTO</small><h2 id="pv-composer-title" ref={titleRef} tabIndex="-1">Defina o trabalho desta etapa</h2><p>O contexto organiza a implantação. As etiquetas continuam livres até o vínculo.</p></div>
          <button aria-label="Fechar novo lote" onClick={onClose} type="button"><Icon name="close" /></button>
        </header>
        <form onSubmit={submit}>
          <section className="pv-composer-context" aria-labelledby="pv-context-title">
            <span className="pv-composer-step">01</span>
            <div className="pv-composer-section-head"><small>CONTEXTO PLANEJADO</small><h3 id="pv-context-title">Onde esta etapa será trabalhada?</h3></div>
            <div className="pv-campaign-readonly"><Icon name="campaign" size={16} /><span><small>CAMPANHA · SOMENTE LEITURA</small><strong>{state.campaign.name}</strong></span></div>
            <div aria-label="Tipo de contexto" className="pv-context-type-grid" role="group">
              {CONTEXT_TYPES.filter((type) => OPERATING_CONTEXTS.some((item) => item.type === type.value)).map((type) => (
                <button aria-pressed={draft.contextType === type.value} key={type.value} onClick={() => selectContextType(type.value)} type="button"><Icon name={type.icon} size={17} /><span>{type.label}</span></button>
              ))}
            </div>
            <label className="pv-composer-field">
              <span>{CONTEXT_TYPES.find((item) => item.value === draft.contextType)?.label || "Contexto"}</span>
              <select onChange={(event) => selectContext(event.target.value)} required value={context?.id || ""}>
                {contexts.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <p className="pv-context-rule"><Icon name="info" size={15} />Planejamento não cria trava regional: cada NP permanece livre até ser vinculado.</p>
          </section>

          <section aria-labelledby="pv-demand-title" className="pv-demand-decision">
            <span className="pv-composer-step">02</span>
            <div className="pv-composer-section-head"><small>DEMANDA E QUANTIDADE</small><h3 id="pv-demand-title">Decida o tamanho do lote</h3></div>
            <div className="pv-demand-pair">
              <div className="pv-demand-current"><small>Equipamentos aguardando patrimônio neste contexto</small><strong>{demand}</strong><span>demanda atual</span></div>
              <Icon className="pv-demand-arrow" name="arrow" size={22} />
              <label className="pv-demand-quantity"><span>Quantidade de etiquetas a gerar</span><input aria-describedby="pv-quantity-guidance" inputMode="numeric" max="500" min="1" onChange={(event) => onDraft({ ...draft, quantity: event.target.value })} required type="number" value={draft.quantity} /><small>entre 1 e 500</small></label>
            </div>
            <div aria-hidden="true" className="pv-demand-meter"><span style={{ width: `${coverage}%` }} /></div>
            <div aria-live="polite" className={`pv-quantity-guidance${excess ? " is-excess" : ""}`} id="pv-quantity-guidance">
              {!quantityIsValid ? <><Icon name="info" /><span><strong>Informe uma quantidade válida.</strong><small>Use um número inteiro entre 1 e 500 etiquetas.</small></span></>
                : excess ? <><Icon name="alert" /><span><strong>Você está gerando {excess} etiqueta{excess > 1 ? "s" : ""} a mais que a demanda atual deste contexto.</strong><small>As etiquetas excedentes continuarão disponíveis e não serão vinculadas automaticamente.</small></span></>
                  : shortfall ? <><Icon name="info" /><span><strong>Este lote atenderá até {quantity} dos {demand} equipamentos atualmente pendentes.</strong><small>Você poderá continuar o mesmo contexto em outros lotes.</small></span></>
                    : <><Icon name="check" /><span><strong>{demand ? "A quantidade cobre a demanda atual deste contexto." : "Não há demanda pendente neste contexto."}</strong><small>{demand ? "Nada será gerado antes da confirmação." : "As etiquetas serão livres e exigirão confirmação de excesso."}</small></span></>}
            </div>
            <button className="pv-use-total" disabled={!demand || String(demand) === draft.quantity} onClick={() => onDraft({ ...draft, quantity: String(demand) })} type="button"><Icon name="check" size={15} />Usar demanda total · {demand}</button>
          </section>

          <section className="pv-composer-name" aria-labelledby="pv-name-title">
            <span className="pv-composer-step">03</span>
            <div className="pv-composer-section-head"><small>NOME DO LOTE</small><h3 id="pv-name-title">Dê um nome fácil de reconhecer</h3></div>
            <label className="pv-composer-field"><span>Nome amigável</span><input maxLength="80" onChange={(event) => onDraft({ ...draft, friendlyName: event.target.value, nameEdited: true })} required type="text" value={draft.friendlyName} /><small>O código PAT será gerado separadamente e continuará sendo a referência de auditoria.</small></label>
          </section>

          <section className="pv-composer-summary" aria-label="Resumo do novo lote">
            <span className="pv-composer-step">04</span>
            <div><small>RESUMO</small><strong>{draft.friendlyName.trim() || "Nome do lote"}</strong><p>{context?.label || "Selecione um contexto"} · {quantityIsValid ? `${quantity} etiqueta${quantity > 1 ? "s" : ""}` : "quantidade pendente"} · demanda {demand}</p></div>
          </section>

          <footer><button className="pv-button" onClick={onClose} type="button">Cancelar</button><button className="pv-button pv-button--primary" disabled={!context || !quantityIsValid || !draft.friendlyName.trim()} type="submit">Revisar geração <Icon name="arrow" size={16} /></button></footer>
        </form>
      </section>
    </div>
  );
}

function BatchPreview({ preview, confirmed, excessConfirmed, onConfirmed, onExcessConfirmed, onGenerate, onBack, onClose }) {
  const titleRef = useRef(null);
  const dialogRef = useRef(null);
  const closeHandlerRef = useRef(onClose);
  useEffect(() => {
    closeHandlerRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const previousFocus = document.activeElement;
    titleRef.current?.focus();
    function handleKey(event) {
      if (event.key === "Escape") closeHandlerRef.current();
      else keepDialogFocus(event, dialogRef.current);
    }
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      previousFocus?.focus?.();
    };
  }, []);
  return (
    <div className="pv-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()} role="presentation">
      <section aria-labelledby="pv-preview-title" aria-modal="true" className="pv-batch-preview" ref={dialogRef} role="dialog">
        <header><div><small>REVISÃO FINAL · IDENTIDADE PERMANENTE</small><h2 id="pv-preview-title" ref={titleRef} tabIndex="-1">Gerar {preview.quantity} patrimônios?</h2><p>Confira o planejamento antes de consumir a sequência NP.</p></div><button aria-label="Fechar confirmação" onClick={onClose} type="button"><Icon name="close" /></button></header>
        <div className="pv-preview-identity">
          <span><small>CAMPANHA</small><strong>{preview.campaignName}</strong></span>
          <span><small>LOTE</small><strong>{preview.friendlyName}</strong><code>{preview.batchId}</code></span>
          <span><small>CONTEXTO PLANEJADO</small><strong>{preview.context.label}</strong></span>
          <span><small>DEMANDA ATUAL</small><strong>{preview.demand} equipamentos</strong></span>
          <span><small>QUANTIDADE</small><strong>{preview.quantity} etiquetas</strong></span>
        </div>
        <div className="pv-preview-outcome"><Icon name="tag" size={24} /><span><small>O QUE ACONTECE AGORA</small><strong>Serão gerados {preview.quantity} patrimônios permanentes com QR Code.</strong><p>Eles permanecerão livres até serem vinculados aos equipamentos durante a implantação.</p></span></div>
        {preview.shortfall ? <div className="pv-preview-coverage"><Icon name="info" /><span><strong>Etapa parcial planejada</strong><small>Este lote atenderá até {preview.quantity} dos {preview.demand} equipamentos atualmente pendentes.</small></span></div> : null}
        {preview.excess ? <div className="pv-preview-excess" role="alert"><Icon name="alert" /><span><strong>Excesso sob confirmação · {preview.excess} etiqueta{preview.excess > 1 ? "s" : ""} excedente{preview.excess > 1 ? "s" : ""}</strong><small>Elas continuarão disponíveis e não serão vinculadas automaticamente.</small></span></div> : null}
        <div className="pv-preview-rule"><Icon name="alert" /><span><strong>Os códigos gerados serão permanentes e não serão reutilizados.</strong><small>Cancelar depois da geração não apaga identidades; cada etiqueta deverá ser usada, transferida ou anulada com motivo.</small></span></div>
        {preview.excess ? <label className="pv-explicit-confirm is-excess"><input checked={excessConfirmed} onChange={(event) => onExcessConfirmed(event.target.checked)} type="checkbox" /><span><strong>Confirmo a criação de {preview.excess} etiqueta{preview.excess > 1 ? "s" : ""} além da demanda deste contexto</strong><small>O excedente ficará livre para uso posterior.</small></span></label> : null}
        <label className="pv-explicit-confirm"><input checked={confirmed} onChange={(event) => onConfirmed(event.target.checked)} type="checkbox" /><span><strong>Confirmo a geração local de {preview.quantity} identidades fictícias permanentes</strong><small>Esta ação existe somente na memória do harness.</small></span></label>
        <div className="pv-preview-estimate"><span><small>FAIXA ESTIMADA · NÃO RESERVADA</small><strong>{preview.estimateLabel}</strong></span><p>Concorrência pode intercalar números. Documentos definitivos usam apenas identidades persistidas.</p></div>
        <footer><button className="pv-button" onClick={onBack} type="button">Voltar e editar</button><button className="pv-button pv-button--primary" disabled={!confirmed || (preview.excess > 0 && !excessConfirmed)} onClick={onGenerate} type="button"><Icon name="tag" />Gerar {preview.quantity} patrimônios</button></footer>
      </section>
    </div>
  );
}

function LabelState({ state }) {
  return <span className={`pv-label-state is-${state}`}>{LABEL_STATES[state]}</span>;
}

function BatchesView({ state, onState, selectedBatchId, onSelectedBatch, onPrepare, onArtifact, onDeploy }) {
  const batch = state.batches.find((item) => item.id === selectedBatchId) || state.batches[0];
  const labels = batchLabels(state, batch);
  const selectedProgress = batch ? batchProgress(state, batch) : null;
  const demandSnapshot = batch?.demandSnapshot ?? batch?.demandAtCreation;
  const currentDemand = batch?.context?.id ? batchDemand(state, batch.context.id) : null;
  async function artifact(type) {
    if (!batch) return;
    if (type === "labels") {
      const marked = markBatchPrinted(state, batch.id);
      onState(marked.state);
      await onArtifact(type, buildLabelPrintJob(marked.state, batch));
      return;
    }
    if (type === "route") await onArtifact(type, buildRouteReportJob(state, batch));
    if (type === "final") await onArtifact(type, buildFinalReportJob(state, batch));
    if (type === "calibration") await onArtifact(type, { sample: true, batchId: batch.id });
  }
  return (
    <section className="pv-batches-layout" aria-label="Lotes patrimoniais">
      <div className="pv-batches-main">
        <header><div><small>CONTROLE DE ETIQUETAS</small><h2>Lotes da campanha</h2><p>O lote mede identidades físicas; a campanha mede equipamentos.</p></div><button className="pv-button pv-button--primary" onClick={onPrepare} type="button"><Icon name="plus" />Novo lote</button></header>
        <div className="pv-batch-list">{state.batches.map((item) => {
          const progress = batchProgress(state, item);
          return <button aria-pressed={item.id === batch?.id} className={item.id === batch?.id ? "is-selected" : ""} key={item.id} onClick={() => onSelectedBatch(item.id)} type="button"><span className="pv-batch-list-identity"><strong>{batchName(item)}</strong><code>{item.id}</code><small>{item.context.label} · {BATCH_STATUS[item.status]}</small></span><div><b>{progress.total}</b><small>{progress.total === 1 ? "gerada" : "geradas"}</small></div><div><b>{progress.available}</b><small>disponíveis</small></div><div><b>{progress.bound}</b><small>{progress.bound === 1 ? "vinculada" : "vinculadas"}</small></div><div><b>{progress.applied}</b><small>{progress.applied === 1 ? "aplicada" : "aplicadas"}</small></div><div><b>{progress.verified}</b><small>{progress.verified === 1 ? "conferida" : "conferidas"}</small></div><i><span style={{ width: `${progress.percent}%` }} /></i></button>;
        })}</div>
        {batch ? <section className="pv-label-ledger"><header><div><small>LOTE ABERTO · {batch.id}</small><h3>{batchName(batch)}</h3></div><span>{labels.length || batch.plannedQuantity} {labels.length ? "identidades persistidas" : "planejadas"}</span></header>{labels.length ? <div className="pv-label-table"><div className="pv-label-table-head"><span>Patrimônio</span><span>Estado</span><span>Equipamento</span><span>Impressões</span></div>{labels.map((label) => { const equipment = state.equipments.find((item) => item.id === label.equipmentId); return <button key={label.id} onClick={() => onDeploy(label.id)} type="button"><code>{label.code}</code><LabelState state={label.state} /><span>{equipment?.name || "Sem vínculo"}<small>{equipment?.position.label || "Etiqueta livre"}</small></span><b>{label.printCount}</b><Icon name="chevron" size={15} /></button>; })}</div> : <div className="pv-batch-empty"><Icon name="tag" size={26} /><strong>Lote preparado; nenhuma identidade emitida</strong><span>Revise o planejamento antes de consumir a sequência NP.</span><button className="pv-button pv-button--primary" onClick={() => onPrepare(batch)} type="button">Revisar geração</button></div>}</section> : null}
      </div>
        {batch ? <aside className="pv-batch-inspector"><header><small>DOSSIÊ DO LOTE</small><h2>{batchName(batch)}</h2><code>{batch.id}</code><span className={`pv-status is-${batch.status}`}>{BATCH_STATUS[batch.status]}</span></header><dl><div><dt>Campanha</dt><dd>{state.campaign.name}</dd></div><div><dt>Contexto planejado</dt><dd>{batch.context.label}</dd></div><div><dt>Demanda na criação</dt><dd>{demandSnapshot ?? "—"}</dd></div>{demandSnapshot != null && currentDemand !== demandSnapshot ? <div><dt>Demanda atual</dt><dd>{currentDemand}</dd></div> : null}<div><dt>Quantidade planejada</dt><dd>{batch.plannedQuantity}</dd></div><div><dt>Realmente geradas</dt><dd>{selectedProgress.total}</dd></div><div><dt>Disponíveis</dt><dd>{selectedProgress.available}</dd></div><div><dt>Vinculadas</dt><dd>{selectedProgress.bound}</dd></div><div><dt>Aplicadas</dt><dd>{selectedProgress.applied}</dd></div><div><dt>Conferidas</dt><dd>{selectedProgress.verified}</dd></div><div><dt>Anuladas</dt><dd>{selectedProgress.annulled}</dd></div><div><dt>Impressões</dt><dd>{batch.printCount}</dd></div></dl><section><small>DOCUMENTOS FICTÍCIOS</small><button disabled={!labels.length} onClick={() => artifact("labels")} type="button"><Icon name="printer" />Etiquetas livres</button><button onClick={() => artifact("route")} type="button"><Icon name="route" />Roteiro sem associação</button><button onClick={() => artifact("calibration")} type="button"><Icon name="document" />Folha de calibração</button><button disabled={batch.status !== "concluido"} onClick={() => artifact("final")} type="button"><Icon name="check" />Relatório pós-implantação</button></section><footer><button className="pv-button pv-button--primary" disabled={!labels.length} onClick={() => onDeploy(labels.find((label) => label.state === "disponivel")?.id || labels[0]?.id)} type="button"><Icon name="play" />Continuar implantação</button></footer></aside> : null}
    </section>
  );
}

function ActivationStepper({ step }) {
  const normalizedStep = step === "confirm" ? "equipment" : step === "manual" ? "scan" : step;
  const current = Math.max(0, STEP_LABELS.findIndex(([id]) => id === normalizedStep));
  return <ol className="pv-activation-steps" aria-label="Etapas da implantação">{STEP_LABELS.map(([id, label], index) => <li className={index < current ? "is-done" : index === current ? "is-current" : ""} key={id}><i>{index < current ? <Icon name="check" size={12} /> : index + 1}</i><span>{label}</span></li>)}</ol>;
}

function ActivationFlow({ state, onState, initialStep, initialLabelId, initialContextId, onOpenDossier }) {
  const [step, setStep] = useState(initialStep || "scan");
  const [labelId, setLabelId] = useState(initialLabelId || "pat-000001");
  const [contextId, setContextId] = useState(initialContextId || "");
  const [equipmentId, setEquipmentId] = useState("");
  const [equipmentQuery, setEquipmentQuery] = useState("");
  const [globalEquipmentSearch, setGlobalEquipmentSearch] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const label = state.labels.find((item) => item.id === labelId) || state.labels.find((item) => item.state === "disponivel");
  const boundEquipment = state.equipments.find((item) => item.id === label?.equipmentId) || null;
  const candidates = candidateEquipments(state, globalEquipmentSearch ? "" : contextId, equipmentQuery);
  const visibleCandidates = globalEquipmentSearch && equipmentQuery.trim().length < 2
    ? []
    : contextId === "bar-savio" && !globalEquipmentSearch
    ? candidates.filter((item) => item.category === "Terminais").slice(0, 2)
    : candidates.slice(0, 6);
  const selectedEquipment = state.equipments.find((item) => item.id === equipmentId) || visibleCandidates[0] || boundEquipment;

  useEffect(() => {
    setStep(initialStep || "scan");
    setLabelId(initialLabelId || "pat-000001");
    setContextId(initialContextId || "");
    setEquipmentId("");
    setEquipmentQuery("");
    setGlobalEquipmentSearch(false);
    setManualCode("");
    setCode("");
    setMessage("");
  }, [initialStep, initialLabelId, initialContextId]);

  function chooseContext(context) {
    setContextId(context.id);
    setEquipmentId("");
    setEquipmentQuery("");
    setGlobalEquipmentSearch(false);
    setStep("equipment");
  }

  function resolveManualCode(event) {
    event.preventDefault();
    const result = resolveLabelByCode(state.labels, manualCode);
    if (result.status !== "found") {
      setMessage(result.status === "ambiguous"
        ? "Mais de uma etiqueta corresponde aos dígitos informados. Digite o código completo."
        : "Patrimônio não encontrado neste cenário local.");
      return;
    }
    setLabelId(result.label.id);
    setMessage("");
    setStep(result.label.state === "disponivel"
      ? "context"
      : result.label.state === "vinculado"
        ? "apply"
        : result.label.state === "aplicado"
          ? "verify"
          : result.label.state === "conferido"
            ? "complete"
            : "scan");
  }

  function bind() {
    const result = bindFreeLabel(state, {
      labelId: label.id,
      equipmentId: selectedEquipment.id,
      expectedLocation: selectedEquipment.position.label,
      idempotencyKey: `bind-${label.id}-${selectedEquipment.id}`,
    });
    if (!result.ok) { setMessage("Não foi possível concluir o vínculo neste estado."); return; }
    onState(result.state);
    setStep("apply");
    setMessage("");
  }

  function apply() {
    const result = markLabelApplied(state, label.id);
    if (!result.ok) { setMessage("A etiqueta precisa estar vinculada antes da aplicação."); return; }
    onState(result.state);
    setStep("verify");
    setMessage("");
  }

  function verify(event) {
    event.preventDefault();
    const result = confirmLabel(state, { labelId: label.id, input: code, method: "codigo" });
    if (!result.ok) { setMessage(result.code === "CODE_MISMATCH" ? `Código diferente do esperado: ${label.code}.` : "A aplicação precisa ser registrada primeiro."); return; }
    onState(result.state);
    setStep("complete");
    setMessage("");
  }

  const equipment = boundEquipment || selectedEquipment;
  return (
    <section className="pv-activation-shell" aria-labelledby="activation-title">
      <header className="pv-activation-head"><div><small>TRABALHO DE CAMPO · MOBILE-FIRST</small><h2 id="activation-title">Ativação patrimonial</h2><p>{label?.batchId || "Cadastro futuro"} · sem leitura de câmera interna</p></div><span><Icon name="shield" />Backend obrigatório para mutações</span></header>
      <ActivationStepper step={step === "divergence" ? "verify" : step} />
      <div className="pv-activation-workspace">
        <article className="pv-mobile-workcard">
          {step === "scan" ? <><small>ETIQUETA LIVRE</small><div className="pv-mobile-code"><Icon name="qr" size={42} /><span><strong>{label.code}</strong><em>Disponível para vinculação</em></span></div><p>O QR contém somente um identificador público aleatório. Equipamento e posição são resolvidos após autenticação.</p><button className="pv-button pv-button--primary" onClick={() => setStep("context")} type="button">Ativar patrimônio <Icon name="arrow" /></button><button className="pv-link-button" onClick={() => { setManualCode(""); setMessage(""); setStep("manual"); }} type="button">Usar código digitado</button></> : null}
          {step === "manual" ? <><small>LOCALIZAÇÃO MANUAL</small><h3>Digite o patrimônio</h3><p>Use o código completo ou os últimos 4/6 dígitos. Entradas ambíguas nunca são presumidas.</p><form onSubmit={resolveManualCode}><label><span>Código da etiqueta</span><input autoComplete="off" autoFocus onChange={(event) => setManualCode(event.target.value)} placeholder="NP-000001" value={manualCode} /></label><button className="pv-button pv-button--primary" type="submit">Continuar</button></form><button className="pv-link-button" onClick={() => { setMessage(""); setStep("scan"); }} type="button">Voltar ao QR</button></> : null}
          {step === "context" ? <><small>ONDE VOCÊ ESTÁ TRABALHANDO?</small><h3>Escolha o contexto atual</h3><p>A escolha reduz a lista; ela não muda a localização do equipamento.</p><div className="pv-context-grid">{OPERATING_CONTEXTS.map((context) => <button key={context.id} onClick={() => chooseContext(context)} type="button"><Icon name={context.type === "stock" ? "box" : context.type === "point" ? "pin" : context.type === "manager" ? "user" : context.type === "transfer" ? "route" : "wrench"} /><span><strong>{context.label}</strong><small>{context.route}</small></span><Icon name="chevron" size={15} /></button>)}</div></> : null}
          {step === "equipment" ? <><small>{contextId === "bar-savio" && !globalEquipmentSearch ? "BAR DO SÁVIO · CENÁRIO FICTÍCIO" : "EQUIPAMENTOS ELEGÍVEIS"}</small><h3>Qual equipamento receberá {label.code}?</h3><p>{globalEquipmentSearch ? "Busca direta em toda a base elegível; confira a posição antes de selecionar." : "Somente patrimoniáveis, sem NP e dentro do contexto atual."}</p><label className="pv-candidate-search"><span>{globalEquipmentSearch ? "Buscar em toda a base" : "Buscar neste contexto"}</span><div><Icon name="search" /><input onChange={(event) => { setEquipmentQuery(event.target.value); setEquipmentId(""); }} placeholder="Nome, ponto, ID ou referência anterior" value={equipmentQuery} /></div></label><button className="pv-search-scope" aria-pressed={globalEquipmentSearch} onClick={() => { setGlobalEquipmentSearch((value) => !value); setEquipmentId(""); setEquipmentQuery(""); }} type="button">{globalEquipmentSearch ? "Voltar ao contexto atual" : "Buscar em toda a base"}</button>{visibleCandidates.length ? <div className="pv-candidate-list">{visibleCandidates.map((candidate) => <button aria-pressed={selectedEquipment?.id === candidate.id} className={selectedEquipment?.id === candidate.id ? "is-selected" : ""} key={candidate.id} onClick={() => setEquipmentId(candidate.id)} type="button"><span><strong>{candidate.name}</strong><small>{candidate.category} · {candidate.technicalId} · {candidate.position.label}</small></span><em>{candidate.legacyCode || "Sem referência anterior"}</em><Icon name="check" /></button>)}</div> : <div className="pv-candidate-empty"><Icon name="search" /><span><strong>{globalEquipmentSearch && equipmentQuery.trim().length < 2 ? "Digite para buscar na base" : "Nenhum equipamento elegível"}</strong><small>{globalEquipmentSearch && equipmentQuery.trim().length < 2 ? "Informe ao menos 2 caracteres; nenhum resultado global é presumido." : "Revise a busca ou escolha outro contexto."}</small></span></div>}<button className="pv-button pv-button--primary" disabled={!selectedEquipment} onClick={() => setStep("confirm")} type="button">Revisar vínculo <Icon name="arrow" /></button><button className="pv-link-button" onClick={() => setStep("context")} type="button">Trocar local</button></> : null}
          {step === "confirm" ? <><small>CONFIRMAÇÃO FORTE</small><h3>Vincular {label.code}</h3><div className="pv-binding-card"><span><Icon name="box" /><strong>{selectedEquipment.name}</strong><small>{selectedEquipment.category} · {selectedEquipment.technicalId}</small></span><dl><div><dt>Onde está</dt><dd>{selectedEquipment.position.label}</dd></div><div><dt>Referência anterior</dt><dd>{selectedEquipment.legacyCode || "Nenhuma"}</dd></div><div><dt>Patrimônio atual</dt><dd>Nenhum</dd></div></dl></div><button className="pv-button pv-button--primary" onClick={bind} type="button">Vincular {label.code}</button><button className="pv-link-button" onClick={() => setStep("equipment")} type="button">Voltar à seleção</button></> : null}
          {step === "apply" ? <><small>APLICAÇÃO FÍSICA</small><h3>Etiqueta aplicada?</h3><div className="pv-physical-pair"><span><Icon name="tag" /><strong>{label.code}</strong><small>{LABEL_STATES[label.state]}</small></span><Icon name="arrow" /><span><Icon name="box" /><strong>{equipment?.name}</strong><small>{equipment?.position.label}</small></span></div><p>Confirme somente depois de colar a etiqueta no equipamento indicado.</p><button className="pv-button pv-button--primary" onClick={apply} type="button">Confirmar aplicação</button><button className="pv-link-button" onClick={() => setMessage("Vínculo preservado; a aplicação continua pendente para retomada.")} type="button">Fazer depois</button></> : null}
          {step === "verify" ? <><small>SEGUNDA LEITURA</small><h3>Conferir patrimônio</h3><div className="pv-expected-code"><span>ESPERADO</span><strong>{label.code}</strong><small>{equipment?.name}</small></div><form onSubmit={verify}><label><span>Código da etiqueta aplicada</span><input autoComplete="off" onChange={(event) => setCode(event.target.value)} placeholder={label.code} value={code} /></label><button className="pv-button pv-button--primary" type="submit">Conferir patrimônio</button></form><p>O código completo ou os últimos 4/6 dígitos são aceitos somente porque existe um patrimônio esperado específico.</p></> : null}
          {step === "complete" ? <><span className="pv-complete-mark"><Icon name="check" size={30} /></span><small>IMPLANTAÇÃO CONCLUÍDA</small><h3>{label.code}</h3><p>Identidade física conferida. Movimentações futuras alteram apenas a posição do equipamento.</p><div className="pv-complete-equipment"><strong>{equipment?.name}</strong><span>{equipment?.category}</span><small><Icon name="pin" size={14} />{equipment?.position.label}</small></div><button className="pv-button pv-button--primary" onClick={() => equipment && onOpenDossier(equipment.id)} type="button">Abrir equipamento</button><button className="pv-link-button" onClick={() => { const next = state.labels.find((item) => item.state === "disponivel"); if (next) setLabelId(next.id); setStep("scan"); }} type="button">Próxima etiqueta</button></> : null}
          {step === "divergence" ? <><span className="pv-divergence-mark"><Icon name="alert" size={28} /></span><small>DIVERGÊNCIA OPERACIONAL</small><h3>Localização divergente</h3><p>O equipamento foi encontrado em outro ponto. O patrimônio não pode corrigir esse dado silenciosamente.</p><dl className="pv-divergence-pair"><div><dt>Sistema</dt><dd>{equipment?.position.label || "Estoque interno"}</dd></div><Icon name="arrow" /><div><dt>Encontrado</dt><dd>Ponto Horizonte</dd></div></dl><button className="pv-button pv-button--primary" onClick={() => setMessage("No app real, esta ação encaminha ao fluxo oficial de movimentação de Equipamentos.")} type="button"><Icon name="route" />Corrigir movimentação</button><small className="pv-operation-note">Ação demonstrativa: reutiliza o fluxo real de Equipamentos.</small></> : null}
          {message ? <div className="pv-inline-warning" role="alert"><Icon name="alert" />{message}</div> : null}
        </article>
        <aside className="pv-field-context"><small>CONTEXTO DA OPERAÇÃO</small><dl><div><dt>Patrimônio</dt><dd>{label?.code}</dd></div><div><dt>Estado</dt><dd>{label ? LABEL_STATES[label.state] : "—"}</dd></div><div><dt>Contexto</dt><dd>{OPERATING_CONTEXTS.find((item) => item.id === contextId)?.label || "Ainda não escolhido"}</dd></div><div><dt>Equipamento</dt><dd>{equipment?.name || "Ainda não escolhido"}</dd></div><div><dt>Referência anterior</dt><dd>{equipment?.legacyCode || "—"}</dd></div></dl><section><Icon name="info" /><p>Vínculo, aplicação e conferência são eventos separados e idempotentes.</p></section></aside>
      </div>
    </section>
  );
}

function RegistrationContract({ state, onState, onQr, onArtifact, multiple = false }) {
  const [result, setResult] = useState(null);
  const quantity = multiple ? 3 : 1;
  const category = multiple ? "Terminais" : "Televisões";
  function register() {
    const next = simulateEquipmentRegistration(state, {
      name: multiple ? "Terminal novo" : "TV nova",
      category,
      quantity,
      idempotencyKey: `cadastro-${multiple ? "multiplo" : "unitario"}-${category}-${quantity}`,
    });
    if (next.ok) { onState(next.state); setResult(next); }
  }
  return (
    <section className="pv-registration-contract">
      <header><div><small>CONTRATO FUTURO · NÃO INTEGRADO AO APP REAL</small><h2>{multiple ? "Cadastro em quantidade" : "Novo equipamento"}</h2><p>Equipamento e identidade patrimonial nascem na mesma transação.</p></div><span className="pv-status">DEV-only</span></header>
      <div className="pv-registration-grid"><section><label><span>Nome</span><input readOnly value={multiple ? "Terminal novo" : "TV nova"} /></label><label><span>Categoria</span><select disabled value={category}><option>{category}</option></select></label><label><span>Quantidade</span><input readOnly value={quantity} /></label><div className="pv-registration-preview"><span><Icon name="box" /><strong>{quantity} equipamento{quantity > 1 ? "s" : ""}</strong></span><Icon name="arrow" /><span><Icon name="tag" /><strong>{quantity} patrimônio{quantity > 1 ? "s" : ""}</strong></span></div><p>Os números são apenas estimados antes do commit. Máquina de Brindes criaria equipamentos sem consumir a sequência.</p><button className="pv-button pv-button--primary" onClick={register} type="button">Cadastrar {multiple ? quantity : "equipamento"}</button></section><aside><small>RESULTADO ATÔMICO</small>{result ? <><span className="pv-complete-mark"><Icon name="check" /></span><h3>{result.equipments.length} cadastrado{result.equipments.length > 1 ? "s" : ""}</h3><ol>{result.equipments.map((equipment, index) => { const label = result.labels[index]; return <li key={equipment.id}><span><strong>{equipment.name}</strong><small>{equipment.technicalId}</small></span><code>{label?.code || "Sem NP"}</code>{label ? <button aria-label={`Abrir QR de ${label.code}`} className="pv-registration-qr" onClick={() => onQr(label)} type="button"><Icon name="qr" size={15} /></button> : null}</li>; })}</ol><button className="pv-button" disabled={!result.labels.length} onClick={() => onArtifact("labels", buildRegistrationLabelPrintJob(result.labels))} type="button"><Icon name="printer" />Imprimir etiquetas</button></> : <><Icon name="layers" size={32} /><h3>Aguardando confirmação</h3><p>Nenhum sucesso parcial é apresentado se a transação falhar.</p></>}</aside></div>
    </section>
  );
}

function DemoState({ error }) {
  return <section className={`pv-demo-state${error ? " is-error" : ""}`} role={error ? "alert" : undefined}><span><Icon name={error ? "alert" : "ledger"} size={28} /></span><small>HARNESS LOCAL</small><h2>{error ? "Não foi possível montar a leitura" : "Sem registros neste estado"}</h2><p>{error ? "Falha explícita; o sistema não apresenta erro como vazio." : "A estrutura permanece disponível sem inventar dados."}</p></section>;
}

function QrDialog({ data, onClose }) {
  const closeRef = useRef(null);
  const dialogRef = useRef(null);
  useEffect(() => {
    if (!data) return undefined;
    const previousFocus = document.activeElement;
    closeRef.current?.focus();
    function handleKey(event) {
      if (event.key === "Escape") onClose();
      else keepDialogFocus(event, dialogRef.current);
    }
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      previousFocus?.focus?.();
    };
  }, [data, onClose]);
  if (!data) return null;
  return <div className="pv-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()} role="presentation"><section aria-labelledby="pv-qr-title" aria-modal="true" className="pv-qr-preview" ref={dialogRef} role="dialog"><header><div><small>QR FICTÍCIO · NÃO OPERACIONAL</small><h2 id="pv-qr-title">{data.label.code}</h2></div><button aria-label="Fechar QR" onClick={onClose} ref={closeRef} type="button"><Icon name="close" /></button></header>{data.dataUrl ? <img alt={`QR fictício de ${data.label.code}`} src={data.dataUrl} /> : <div className="pv-qr-placeholder"><Icon name="qr" size={90} /></div>}<code>{data.payload}</code><p>O payload não contém NP, equipamento, posição ou credencial.</p><footer><button className="pv-button pv-button--primary" onClick={onClose} type="button">Concluir leitura</button></footer></section></div>;
}

export default function PatrimonioHarnessApp({ onArtifactRequest, onQrRequest } = {}) {
  const initial = useMemo(() => initialParams(), []);
  const [state, setState] = useState(() => createPatrimonyFixture());
  const [mode, setMode] = useState(initial.mode);
  const [theme, setTheme] = useState(initial.theme);
  const [scenario, setScenario] = useState(initial.scenario);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState("");
  const [selectedBatchId, setSelectedBatchId] = useState(state.activeBatchId);
  const [deploymentLabelId, setDeploymentLabelId] = useState("");
  const [batchComposerOpen, setBatchComposerOpen] = useState(false);
  const [batchDraft, setBatchDraft] = useState(() => defaultBatchDraft(state));
  const [preview, setPreview] = useState(null);
  const [previewConfirmed, setPreviewConfirmed] = useState(false);
  const [excessConfirmed, setExcessConfirmed] = useState(false);
  const [toast, setToast] = useState("");
  const [qr, setQr] = useState(null);
  const scenarioConfig = SCENARIOS.find((item) => item.value === scenario) || SCENARIOS[0];

  useEffect(() => syncParams({ mode, theme, scenario }), [mode, theme, scenario]);
  useEffect(() => {
    setMode(scenarioConfig.mode);
    if (scenarioConfig.equipmentId) setSelectedEquipmentId(scenarioConfig.equipmentId);
    if (scenarioConfig.batchId) setSelectedBatchId(scenarioConfig.batchId);
    if (scenarioConfig.showcaseBatch) {
      const showcase = createQueixoBatchFixture();
      setState(showcase);
      setSelectedBatchId(showcase.activeBatchId);
      setBatchComposerOpen(false);
      setPreview(null);
    } else if (scenarioConfig.batchComposer) {
      const base = createPatrimonyFixture();
      setState(base);
      setSelectedBatchId(base.activeBatchId);
      setBatchDraft(scenarioDraft(scenarioConfig.batchComposer));
      setBatchComposerOpen(true);
      setPreview(null);
    } else if (scenarioConfig.batchPreview) {
      const base = createPatrimonyFixture();
      const preset = BATCH_CREATION_SCENARIOS[scenarioConfig.batchPreview];
      setState(base);
      setBatchDraft(scenarioDraft(scenarioConfig.batchPreview));
      setBatchComposerOpen(false);
      setPreview(prepareBatchPreview(base, {
        contextId: preset.contextId,
        quantity: preset.quantity,
        friendlyName: preset.friendlyName,
        demandAtCreation: preset.demand,
        idempotencyKey: `scenario-preview-${preset.id}`,
      }));
      setPreviewConfirmed(false);
      setExcessConfirmed(false);
    } else {
      setBatchComposerOpen(false);
      setPreview(null);
    }
  }, [scenarioConfig]);
  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  function openComposer(batch) {
    if (batch?.id) {
      setBatchDraft({
        batchId: batch.id,
        contextType: batch.context.type,
        contextId: batch.context.id,
        quantity: String(batch.plannedQuantity),
        friendlyName: batchName(batch),
        nameEdited: true,
      });
    } else {
      setBatchDraft(defaultBatchDraft(state));
    }
    setPreview(null);
    setBatchComposerOpen(true);
  }

  function reviewBatch(options) {
    setPreview(prepareBatchPreview(state, options));
    setPreviewConfirmed(false);
    setExcessConfirmed(false);
    setBatchComposerOpen(false);
  }

  function generate() {
    const result = generateFreeLabelBatch(state, preview, { confirmed: previewConfirmed, excessConfirmed });
    if (!result.ok) {
      setToast(result.error || "Revise as confirmações antes de gerar o lote.");
      return;
    }
    setState(result.state);
    setSelectedBatchId(result.batch.id);
    setPreview(null);
    setPreviewConfirmed(false);
    setExcessConfirmed(false);
    setScenario("lote_aberto");
    setToast(result.replayed ? "Requisição repetida: nenhum patrimônio duplicado." : `${result.batch.labelIds.length} patrimônios fictícios gerados.`);
  }

  async function artifact(type, payload) {
    try {
      await onArtifactRequest?.(type, payload);
      setToast(`Documento fictício preparado: ${type}.`);
    } catch {
      setToast("Não foi possível preparar o documento fictício.");
    }
  }

  function deploy(labelId) {
    const label = state.labels.find((item) => item.id === labelId);
    setDeploymentLabelId(labelId);
    setScenario(label?.state === "aplicado" ? "conferencia" : label?.state === "conferido" ? "concluido" : label?.state === "vinculado" ? "aplicacao" : "ativacao");
  }

  function chooseScenario(value) {
    setDeploymentLabelId("");
    setSelectedEquipmentId("");
    setScenario(value);
  }

  async function openQr(label) {
    const payload = buildQrPayload(label);
    setSelectedEquipmentId("");
    try {
      const result = await onQrRequest?.(label, payload);
      setQr({ label, payload, dataUrl: result?.dataUrl });
    } catch {
      setQr({ label, payload, dataUrl: "" });
    }
  }

  const showRegistration = scenario === "novo" || scenario === "multiplo";
  const showDemo = scenario === "vazio" || scenario === "erro";

  return (
    <div className="patrimonio-v1-app" data-harness="safe-local" data-theme={theme}>
      <a className="pv-skip-link" href="#pv-main">Ir para o conteúdo</a>
      <DevBar onScenario={chooseScenario} onTheme={setTheme} scenario={scenario} theme={theme} />
      <main id="pv-main">
        <PageHead onPrepare={openComposer} />
        <div className="pv-safety-note"><Icon name="shield" /><span><strong>Marco A isolado.</strong> Nenhum Supabase remoto, dado real, migration remota ou NP operacional.</span></div>
        <RovingTabs label="Áreas do controle patrimonial" onChange={(value) => { setMode(value); chooseScenario(value === "overview" ? "campanha" : value === "batches" ? "lotes" : "ativacao"); }} options={MODES} value={mode} />
        {!showDemo ? <SummaryStrip state={state} /> : null}
        <div aria-labelledby={`pv-tab-${mode}`} className="pv-content" id={`pv-panel-${mode}`} role="tabpanel">
          {showDemo ? <DemoState error={scenario === "erro"} /> : mode === "overview" ? <>{showRegistration ? <RegistrationContract multiple={scenario === "multiplo"} onArtifact={artifact} onQr={openQr} onState={setState} state={state} /> : <><CampaignBoard onScenario={chooseScenario} state={state} /><InventoryLedger focusMode={scenario === "legado" ? "legacy" : "all"} onSelect={setSelectedEquipmentId} state={state} /></>}</> : mode === "batches" ? <BatchesView onArtifact={artifact} onDeploy={deploy} onPrepare={openComposer} onSelectedBatch={setSelectedBatchId} onState={setState} selectedBatchId={selectedBatchId} state={state} /> : <ActivationFlow initialContextId={scenarioConfig.contextId} initialLabelId={deploymentLabelId || scenarioConfig.labelId} initialStep={scenarioConfig.step} onOpenDossier={setSelectedEquipmentId} onState={setState} state={state} />}
        </div>
      </main>
      <footer className="pv-footer"><span><Icon name="keyboard" />Setas alternam áreas · Esc fecha painéis · ações vivem só na memória</span><strong>HARNESS DEV · PATRIMÔNIO FASE 1</strong></footer>
      {selectedEquipmentId ? <Dossier equipmentId={selectedEquipmentId} onClose={() => setSelectedEquipmentId("")} onQr={openQr} state={state} /> : null}
      {batchComposerOpen ? <NewBatchComposer draft={batchDraft} onClose={() => setBatchComposerOpen(false)} onDraft={setBatchDraft} onReview={reviewBatch} state={state} /> : null}
      {preview ? <BatchPreview confirmed={previewConfirmed} excessConfirmed={excessConfirmed} onBack={() => { setPreview(null); setBatchComposerOpen(true); }} onClose={() => setPreview(null)} onConfirmed={setPreviewConfirmed} onExcessConfirmed={setExcessConfirmed} onGenerate={generate} preview={preview} /> : null}
      <QrDialog data={qr} onClose={() => setQr(null)} />
      {toast ? <div aria-live="polite" className="pv-toast"><Icon name="check" />{toast}</div> : null}
    </div>
  );
}
