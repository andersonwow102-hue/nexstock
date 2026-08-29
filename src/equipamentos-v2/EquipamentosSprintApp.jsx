import { useEffect, useMemo, useRef, useState } from "react";
import ConceptA from "./ConceptA.jsx";
import ConceptB from "./ConceptB.jsx";
import ConceptC from "./ConceptC.jsx";
import {
  CATEGORIES,
  MANAGERS,
  POINTS,
  STATUSES,
  activeFilterEntries,
  createEquipmentFixture,
  filterEquipment,
  needsAction,
  positionOf,
  simulateMovement,
  summaryCounts,
} from "./model.js";
import { CategoryIcon, Icon, TraceList } from "./shared.jsx";

const CONCEPTS = {
  A: { name: "Inventory Ledger", component: ConceptA },
  B: { name: "Asset Command", component: ConceptB },
  C: { name: "Position Workspace", component: ConceptC },
};

const EMPTY_FILTERS = { category: "", status: "", position: "", manager: "", point: "" };

function readParams() {
  const params = new URLSearchParams(window.location.search);
  const concept = params.get("conceito")?.toUpperCase();
  const theme = params.get("tema")?.toLowerCase();
  const scale = Number(params.get("scale"));
  const state = params.get("estado")?.toLowerCase();
  return {
    concept: CONCEPTS[concept] ? concept : "A",
    theme: theme === "escuro" ? "escuro" : "claro",
    scale: scale === 150 ? 150 : 40,
    demoState: ["dados", "vazio", "carregando", "erro"].includes(state) ? state : "dados",
  };
}

function updateParams({ concept, theme, scale, demoState }) {
  const params = new URLSearchParams(window.location.search);
  params.set("conceito", concept);
  params.set("tema", theme);
  if (scale === 150) params.set("scale", "150");
  else params.delete("scale");
  if (demoState !== "dados") params.set("estado", demoState);
  else params.delete("estado");
  window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
}

function Segment({ label, value, options, onChange, compact = false }) {
  const refs = useRef([]);
  function handleKeyDown(event, index) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (index + direction + options.length) % options.length;
    const next = options[nextIndex];
    onChange(next.value);
    refs.current[nextIndex]?.focus();
  }
  return (
    <div className={`ev-lab-segment${compact ? " is-compact" : ""}`}>
      <span className="ev-lab-segment__label">{label}</span>
      <div aria-label={label} role="radiogroup">
        {options.map((option, index) => (
          <button
            aria-checked={value === option.value}
            className={value === option.value ? "is-active" : ""}
            key={option.value}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            ref={(node) => { refs.current[index] = node; }}
            role="radio"
            tabIndex={value === option.value ? 0 : -1}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ShellNavigation() {
  const items = [
    ["command", "Central"],
    ["box", "Equipamentos"],
    ["pin", "Pontos"],
    ["user", "Gerentes"],
    ["layers", "Fechamento"],
    ["history", "Histórico"],
  ];
  return (
    <aside className="ev-shell-navigation" aria-label="Contexto visual do produto">
      <div className="ev-brand-lockup">
        <img alt="" src="/brand/neptera/icons/neptera-favicon-48.png" />
        <span><strong>NEPTERA</strong><small>OPERAÇÃO INTEGRADA</small></span>
      </div>
      <nav aria-label="Módulos ilustrativos">
        <span className="ev-shell-navigation__caption">OPERAÇÃO</span>
        {items.map(([icon, label]) => (
          <span aria-current={label === "Equipamentos" ? "page" : undefined} className={label === "Equipamentos" ? "is-current" : ""} key={label}>
            <Icon name={icon} size={18} />
            <span>{label}</span>
          </span>
        ))}
      </nav>
      <div className="ev-shell-navigation__footer">
        <span className="ev-user-mark">AC</span>
        <span><small>VISUALIZAÇÃO</small><strong>Administrador</strong></span>
      </div>
    </aside>
  );
}

function SelectField({ label, value, onChange, children }) {
  return (
    <label className="ev-select-field">
      <span>{label}</span>
      <select onChange={(event) => onChange(event.target.value)} value={value}>{children}</select>
    </label>
  );
}

function FilterPanel({ open, filters, onChange, onClose, onClear }) {
  const panelRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const first = panelRef.current?.querySelector("select");
    first?.focus();
    function closeOnEscape(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="ev-overlay ev-overlay--filter" onMouseDown={(event) => event.target === event.currentTarget && onClose()} role="presentation">
      <aside aria-label="Filtros de equipamentos" aria-modal="true" className="ev-filter-panel" ref={panelRef} role="dialog">
        <header>
          <div><small>RECORTE OPERACIONAL</small><h2>Filtros</h2></div>
          <button aria-label="Fechar filtros" onClick={onClose} type="button"><Icon name="close" /></button>
        </header>
        <div className="ev-filter-panel__fields">
          <SelectField label="Categoria" onChange={(value) => onChange("category", value)} value={filters.category}>
            <option value="">Todas as categorias</option>
            {CATEGORIES.map((category) => <option key={category}>{category}</option>)}
          </SelectField>
          <SelectField label="Estado" onChange={(value) => onChange("status", value)} value={filters.status}>
            <option value="">Todos os estados</option>
            {STATUSES.map((status) => <option key={status}>{status}</option>)}
          </SelectField>
          <SelectField label="Posição" onChange={(value) => onChange("position", value)} value={filters.position}>
            <option value="">Todas as posições</option>
            <option value="internal">Estoque interno</option>
            <option value="point">Em ponto</option>
            <option value="manager">Com gerente / em transferência</option>
            <option value="repair">Em conserto</option>
          </SelectField>
          <SelectField label="Gerente" onChange={(value) => onChange("manager", value)} value={filters.manager}>
            <option value="">Todos os gerentes</option>
            {MANAGERS.map((manager) => <option key={manager}>{manager}</option>)}
          </SelectField>
          <SelectField label="Ponto" onChange={(value) => onChange("point", value)} value={filters.point}>
            <option value="">Todos os pontos</option>
            {POINTS.map((point) => <option key={point}>{point}</option>)}
          </SelectField>
        </div>
        <footer>
          <button className="ev-button ev-button--quiet" onClick={onClear} type="button">Limpar filtros</button>
          <button className="ev-button ev-button--primary" onClick={onClose} type="button">Aplicar recorte</button>
        </footer>
      </aside>
    </div>
  );
}

function destinationOptions(type) {
  if (type === "point") return POINTS;
  if (type === "manager") return MANAGERS;
  if (type === "repair") return ["Assistência parceira", "Bancada técnica interna"];
  return [];
}

function MovementDialog({ item, onClose, onConfirm }) {
  const [step, setStep] = useState(1);
  const [type, setType] = useState("point");
  const [destination, setDestination] = useState(POINTS[0]);
  const [note, setNote] = useState("");
  const dialogRef = useRef(null);
  const origin = positionOf(item);
  const options = destinationOptions(type);

  useEffect(() => {
    if (!item) return undefined;
    dialogRef.current?.querySelector("button")?.focus();
    function closeOnEscape(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [item, onClose]);

  useEffect(() => {
    setDestination(destinationOptions(type)[0] || "");
  }, [type]);

  if (!item) return null;
  const destinationLabel = type === "internal" ? "Estoque interno" : destination;
  const canContinue = type === "internal" || Boolean(destination);
  return (
    <div className="ev-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()} role="presentation">
      <section aria-labelledby="movement-title" aria-modal="true" className="ev-movement-dialog" ref={dialogRef} role="dialog">
        <header>
          <div><small>MOVIMENTAÇÃO SIMULADA</small><h2 id="movement-title">Alterar posição</h2></div>
          <button aria-label="Fechar movimentação" onClick={onClose} type="button"><Icon name="close" /></button>
        </header>
        <ol className="ev-stepper" aria-label="Etapas da movimentação">
          {["Equipamento", "Origem", "Destino", "Confirmar"].map((label, index) => (
            <li className={index <= step ? "is-active" : ""} key={label}><span>{index + 1}</span>{label}</li>
          ))}
        </ol>
        <div className="ev-movement-dialog__body">
          {step === 1 ? (
            <div className="ev-movement-origin">
              <span className="ev-category-mark"><CategoryIcon category={item.categoria} size={24} /></span>
              <div><small>{item.code} · {item.categoria}</small><h3>{item.nome}</h3></div>
              <div className="ev-movement-origin__position"><small>ORIGEM ATUAL</small><strong>{origin.label}</strong><span>{origin.detail}</span></div>
            </div>
          ) : null}
          {step === 2 ? (
            <div className="ev-movement-destination">
              <div className="ev-movement-types" aria-label="Tipo de destino" role="radiogroup">
                {[
                  ["point", "pin", "Ponto"],
                  ["manager", "user", "Gerente"],
                  ["repair", "repair", "Conserto"],
                  ["internal", "warehouse", "Estoque interno"],
                ].map(([value, icon, label]) => (
                  <button aria-checked={type === value} className={type === value ? "is-active" : ""} key={value} onClick={() => setType(value)} role="radio" type="button">
                    <Icon name={icon} /><span>{label}</span>
                  </button>
                ))}
              </div>
              {options.length ? (
                <SelectField label={type === "point" ? "Ponto de destino" : type === "manager" ? "Gerente de destino" : "Responsável técnico"} onChange={setDestination} value={destination}>
                  {options.map((option) => <option key={option}>{option}</option>)}
                </SelectField>
              ) : (
                <div className="ev-internal-return"><Icon name="warehouse" /><span>O equipamento retornará à base operacional.</span></div>
              )}
              <label className="ev-text-field"><span>Nota da movimentação <small>(opcional)</small></span><textarea onChange={(event) => setNote(event.target.value)} placeholder="Contexto operacional" rows="3" value={note} /></label>
            </div>
          ) : null}
          {step === 3 ? (
            <div className="ev-movement-review">
              <small>CONFIRA ANTES DE REGISTRAR</small>
              <div><span>Equipamento</span><strong>{item.code} · {item.nome}</strong></div>
              <div><span>Origem</span><strong>{origin.label} / {origin.detail}</strong></div>
              <div><span>Destino</span><strong>{destinationLabel}</strong></div>
              {note ? <div><span>Nota</span><strong>{note}</strong></div> : null}
              <p><Icon name="check" size={17} /> Esta simulação atualiza lista, dossiê e histórico somente nesta sessão.</p>
            </div>
          ) : null}
        </div>
        <footer>
          <button className="ev-button ev-button--quiet" onClick={step === 1 ? onClose : () => setStep(step - 1)} type="button">{step === 1 ? "Cancelar" : "Voltar"}</button>
          {step < 3 ? (
            <button className="ev-button ev-button--primary" disabled={!canContinue} onClick={() => setStep(step + 1)} type="button">Continuar <Icon name="arrow" size={16} /></button>
          ) : (
            <button className="ev-button ev-button--primary" onClick={() => onConfirm({ type, destination, note, responsible: "Administração" })} type="button">Confirmar movimentação</button>
          )}
        </footer>
      </section>
    </div>
  );
}

function HistoryDialog({ item, onClose }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    if (!item) return undefined;
    dialogRef.current?.querySelector("button")?.focus();
    function closeOnEscape(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [item, onClose]);
  if (!item) return null;
  return (
    <div className="ev-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()} role="presentation">
      <section aria-labelledby="history-title" aria-modal="true" className="ev-history-dialog" ref={dialogRef} role="dialog">
        <header>
          <div><small>RASTRO DO EQUIPAMENTO</small><h2 id="history-title">Histórico completo</h2><p>{item.code} · {item.nome}</p></div>
          <button aria-label="Fechar histórico" onClick={onClose} type="button"><Icon name="close" /></button>
        </header>
        <div className="ev-history-dialog__body"><TraceList events={item.history} limit={50} /></div>
        <footer><button className="ev-button ev-button--primary" onClick={onClose} type="button">Concluir leitura</button></footer>
      </section>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="ev-demo-state ev-demo-state--loading" aria-live="polite" aria-busy="true">
      <header><span /><div><i /><i /></div></header>
      {Array.from({ length: 7 }, (_, index) => <div className="ev-skeleton-row" key={index}><i /><span /><span /><span /></div>)}
      <p>Carregando leitura operacional simulada…</p>
    </div>
  );
}

function ErrorState({ retry }) {
  return (
    <div className="ev-demo-state ev-demo-state--error" role="alert">
      <span><Icon name="alert" size={26} /></span>
      <small>ESTADO DE EXCEÇÃO</small>
      <h2>Não foi possível montar a leitura</h2>
      <p>Este erro é apenas uma demonstração visual do harness. Nenhuma fonte real foi consultada.</p>
      <button className="ev-button ev-button--primary" onClick={retry} type="button">Tentar novamente</button>
    </div>
  );
}

export default function EquipamentosSprintApp() {
  const initial = useMemo(() => readParams(), []);
  const [concept, setConcept] = useState(initial.concept);
  const [theme, setTheme] = useState(initial.theme);
  const [scale, setScale] = useState(initial.scale);
  const [demoState, setDemoState] = useState(initial.demoState);
  const [items, setItems] = useState(() => createEquipmentFixture(initial.scale));
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [movementItem, setMovementItem] = useState(null);
  const [historyItem, setHistoryItem] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [toast, setToast] = useState("");
  const mainRef = useRef(null);

  useEffect(() => updateParams({ concept, theme, scale, demoState }), [concept, theme, scale, demoState]);

  useEffect(() => {
    setItems(createEquipmentFixture(scale));
    setSelectedId(null);
    setDetailOpen(false);
  }, [scale]);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    function handlePaging(event) {
      if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName) || event.altKey || event.ctrlKey || event.metaKey) return;
      const main = mainRef.current;
      if (!main || !["PageDown", "PageUp", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const behavior = reduced ? "auto" : "smooth";
      if (event.key === "Home") main.scrollTo({ top: 0, behavior });
      else if (event.key === "End") main.scrollTo({ top: main.scrollHeight, behavior });
      else main.scrollBy({ top: (event.key === "PageDown" ? 1 : -1) * main.clientHeight * 0.82, behavior });
    }
    window.addEventListener("keydown", handlePaging);
    return () => window.removeEventListener("keydown", handlePaging);
  }, []);

  const filtered = useMemo(() => filterEquipment(items, filters, query), [items, filters, query]);
  const visibleItems = demoState === "vazio" ? [] : filtered;
  const selected = visibleItems.find((item) => item.id === selectedId)
    || (concept === "B" ? visibleItems.find((item) => needsAction(item)) : visibleItems[0])
    || null;
  const counts = useMemo(() => summaryCounts(items), [items]);
  const activeEntries = useMemo(() => activeFilterEntries(filters), [filters]);
  const ActiveConcept = CONCEPTS[concept].component;

  function setFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function changeConcept(nextConcept) {
    setConcept(nextConcept);
    const next = nextConcept === "B" ? items.find((item) => needsAction(item)) : items[0];
    setSelectedId(next?.id || null);
    setDetailOpen(false);
  }

  function select(item) {
    setSelectedId(item?.id || null);
    if (item) setAnnouncement(`${item.code}, ${item.nome}, selecionado.`);
  }

  function openDetail(item) {
    select(item);
    setDetailOpen(true);
  }

  function confirmMovement(movement) {
    const result = simulateMovement(items, movementItem.id, movement);
    setItems(result.items);
    setSelectedId(result.item.id);
    setMovementItem(null);
    setAnnouncement(`${result.item.code} movimentado para ${positionOf(result.item).detail}.`);
    setToast("Movimentação registrada apenas nesta sessão do harness.");
  }

  function resetFilters() {
    setFilters(EMPTY_FILTERS);
    setQuery("");
  }

  const workspace = {
    items: visibleItems,
    selected,
    select,
    counts,
    filters,
    setFilter,
    query,
    setQuery,
    activeFilterCount: activeEntries.length,
    openFilters: () => setFiltersOpen(true),
    openMovement: (item) => setMovementItem(item),
    openHistory: (item) => setHistoryItem(item),
    openDetail,
    detailOpen,
    closeDetail: () => setDetailOpen(false),
    announce: setAnnouncement,
    scale,
  };

  return (
    <div className="equipamentos-v2-app" data-concept={concept} data-scale={scale} data-theme={theme}>
      <ShellNavigation />
      <div className="ev-shell-stage">
        <header className="ev-lab-bar">
          <div className="ev-lab-bar__context"><span>LAB / EQUIPAMENTOS</span><strong>{concept} — {CONCEPTS[concept].name}</strong></div>
          <div className="ev-lab-bar__controls">
            <Segment label="Conceito" onChange={changeConcept} options={Object.entries(CONCEPTS).map(([value, item]) => ({ value, label: value }))} value={concept} />
            <Segment label="Tema" onChange={setTheme} options={[{ value: "claro", label: "Claro" }, { value: "escuro", label: "Escuro" }]} value={theme} />
            <Segment compact label="Massa" onChange={setScale} options={[{ value: 40, label: "40" }, { value: 150, label: "150" }]} value={scale} />
            <Segment compact label="Estado" onChange={setDemoState} options={[{ value: "dados", label: "Dados" }, { value: "vazio", label: "Vazio" }, { value: "carregando", label: "Carga" }, { value: "erro", label: "Erro" }]} value={demoState} />
          </div>
        </header>
        <main className="ev-main" ref={mainRef} tabIndex="-1">
          {demoState === "carregando" ? <LoadingState /> : demoState === "erro" ? <ErrorState retry={() => setDemoState("dados")} /> : <ActiveConcept workspace={workspace} />}
          <p className="ev-harness-note"><Icon name="command" size={14} /> Harness isolado · sem autenticação, backend, Supabase ou persistência.</p>
        </main>
      </div>
      <FilterPanel filters={filters} onChange={setFilter} onClear={resetFilters} onClose={() => setFiltersOpen(false)} open={filtersOpen} />
      <MovementDialog item={movementItem} onClose={() => setMovementItem(null)} onConfirm={confirmMovement} />
      <HistoryDialog item={historyItem ? items.find((item) => item.id === historyItem.id) || historyItem : null} onClose={() => setHistoryItem(null)} />
      <div aria-live="polite" className="ev-visually-hidden">{announcement}</div>
      {toast ? <div className="ev-toast" role="status"><Icon name="check" size={17} />{toast}</div> : null}
    </div>
  );
}
