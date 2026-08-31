import { useEffect, useId, useMemo, useState } from "react";
import { OperationIcon } from "./components/operations/OperationsUI.jsx";
import {
  filterHistoryEvents,
  groupHistoryEvents,
  HISTORY_PAGE_SIZE,
  normalizeHistoryEvents,
  paginateHistoryEvents,
} from "./historicoTimeline.js";
import "./HistoricoTimeline.css";

const PERIOD_OPTIONS = [
  { value: "today", label: "Hoje" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "all", label: "Tudo" },
];

const MODULE_OPTIONS = [
  { value: "all", label: "Todos os módulos" },
  { value: "equipment", label: "Equipamentos" },
  { value: "point", label: "Pontos" },
];

const TIME_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function classes(...values) {
  return values.filter(Boolean).join(" ");
}

function safeDomId(value) {
  return String(value || "event").replace(/[^a-zA-Z0-9_-]/g, "-");
}

function displayValue(value) {
  if (value === null || value === undefined || value === "") return "Não informado";
  return String(value);
}

function eventTime(event) {
  if (!event.timestamp) return event.legacyDate || "Horário indisponível";
  const date = new Date(event.timestamp);
  if (Number.isNaN(date.getTime())) return event.legacyDate || "Horário indisponível";
  return TIME_FORMATTER.format(date);
}

function moduleIcon(module) {
  return module === "point" ? "mapPin" : "package";
}

function detailRows(event) {
  const rows = [];

  if (event.actor) rows.push({ key: "actor", label: "Executor", value: event.actor });
  if (event.responsible) rows.push({ key: "responsible", label: "Responsável operacional", value: event.responsible });
  if (event.origin) rows.push({ key: "origin", label: "Origem", value: event.origin });
  if (event.destination) rows.push({ key: "destination", label: "Destino", value: event.destination });

  for (const detail of Array.isArray(event.details) ? event.details : []) {
    if (!detail || !detail.label || detail.value === null || detail.value === undefined || detail.value === "") continue;
    rows.push({
      key: detail.key || `${detail.label}:${detail.value}`,
      label: detail.label,
      value: detail.value,
    });
  }

  return rows.filter((row, index, allRows) => (
    allRows.findIndex((candidate) => candidate.label === row.label && String(candidate.value) === String(row.value)) === index
  ));
}

function eventContext(event) {
  if (event.origin && event.destination) return `${event.origin} → ${event.destination}`;
  return event.context || event.summary || event.entity?.category || "";
}

function HistoryEvent({ event, expanded, onToggle, detailsId }) {
  const rows = detailRows(event);
  const hasDetails = rows.length > 0;
  const context = eventContext(event);
  const eventBody = (
    <>
      <time dateTime={event.timestamp || undefined}>{eventTime(event)}</time>
      <span className="history-timeline__spine" aria-hidden="true"><i /></span>
      <span className="history-timeline__event-copy">
        <span className="history-timeline__event-meta">
          <span className="history-timeline__module">
            <OperationIcon name={moduleIcon(event.module)} size={14} />
            {event.moduleLabel}
          </span>
          <span>{event.eventLabel}</span>
        </span>
        <strong>{event.title}</strong>
        <span className="history-timeline__entity">{event.entity?.name || "Registro operacional"}</span>
        {context ? <span className="history-timeline__context">{context}</span> : null}
      </span>
      {hasDetails ? (
        <span className="history-timeline__disclosure" aria-hidden="true">
          <OperationIcon name="chevronDown" size={18} />
        </span>
      ) : null}
    </>
  );

  return (
    <li
      className={classes(
        "history-timeline__event",
        `history-timeline__event--${event.module}`,
        `history-timeline__event--${event.severity || "neutral"}`,
        expanded && "is-expanded",
      )}
    >
      {hasDetails ? (
        <button
          type="button"
          className="history-timeline__event-trigger"
          aria-expanded={expanded}
          aria-controls={detailsId}
          aria-label={`${event.title}. ${expanded ? "Recolher" : "Ver"} detalhes`}
          onClick={onToggle}
        >
          {eventBody}
        </button>
      ) : (
        <div className="history-timeline__event-trigger history-timeline__event-trigger--static">
          {eventBody}
        </div>
      )}

      {hasDetails ? (
        <div id={detailsId} className="history-timeline__event-details" hidden={!expanded}>
          <div className="history-timeline__detail-inner">
            <span className="history-timeline__detail-label">Detalhes registrados</span>
            <dl>
              {rows.map((row) => (
                <div key={row.key}>
                  <dt>{row.label}</dt>
                  <dd>{displayValue(row.value)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      ) : null}
    </li>
  );
}

export default function HistoricoTimelinePage({
  equipmentHistory = [],
  pointHistory = [],
  loadError = null,
  onMenu,
  menuOpen = false,
  onExportExcel,
  onExportPdf,
  initialQuery = "",
  initialPeriod = "30d",
  initialModule = "all",
  initialEventType = "all",
  initialFiltersOpen = false,
  initialExpandedId = null,
}) {
  const titleId = useId();
  const filtersId = useId();
  const searchId = useId();
  const [now, setNow] = useState(() => new Date());
  const [query, setQuery] = useState(initialQuery);
  const [period, setPeriod] = useState(initialPeriod);
  const [module, setModule] = useState(initialModule);
  const [eventType, setEventType] = useState(initialEventType);
  const [filtersOpen, setFiltersOpen] = useState(initialFiltersOpen);
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState(initialExpandedId);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const events = useMemo(
    () => normalizeHistoryEvents({ equipmentHistory, pointHistory }),
    [equipmentHistory, pointHistory],
  );

  const eventTypeOptions = useMemo(() => {
    const labels = new Map();
    for (const event of events) {
      if (module !== "all" && event.module !== module) continue;
      if (event.eventType && !labels.has(event.eventType)) labels.set(event.eventType, event.eventLabel || event.eventType);
    }
    return [...labels.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [events, module]);

  const filteredEvents = useMemo(
    () => filterHistoryEvents(events, { query, period, module, eventType, now }),
    [events, query, period, module, eventType, now],
  );

  const pagination = useMemo(
    () => paginateHistoryEvents(filteredEvents, page, { pageSize: HISTORY_PAGE_SIZE }),
    [filteredEvents, page],
  );

  const chapters = useMemo(
    () => groupHistoryEvents(pagination.items, { now, locale: "pt-BR" }),
    [pagination.items, now],
  );

  const moduleTotals = useMemo(() => filteredEvents.reduce((totals, event) => {
    if (event.module === "equipment") totals.equipment += 1;
    if (event.module === "point") totals.point += 1;
    return totals;
  }, { equipment: 0, point: 0 }), [filteredEvents]);

  const activeSecondaryFilters = Number(module !== "all") + Number(eventType !== "all");
  const hasExportableEvents = filteredEvents.length > 0;

  const resetPageContext = () => {
    setPage(1);
    setExpandedId(null);
  };

  const changeQuery = (value) => {
    setQuery(value);
    resetPageContext();
  };

  const changePeriod = (value) => {
    setPeriod(value);
    resetPageContext();
  };

  const changeModule = (value) => {
    setModule(value);
    setEventType("all");
    resetPageContext();
  };

  const changeEventType = (value) => {
    setEventType(value);
    resetPageContext();
  };

  const clearSecondaryFilters = () => {
    setModule("all");
    setEventType("all");
    resetPageContext();
  };

  const goToPage = (nextPage) => {
    setPage(Math.max(1, Math.min(pagination.totalPages, nextPage)));
    setExpandedId(null);
  };

  return (
    <section className="history-timeline" aria-labelledby={titleId}>
      <header className="history-timeline__header">
        <div className="history-timeline__identity">
          {onMenu ? (
            <button
              type="button"
              className="history-timeline__menu"
              aria-label={menuOpen ? "Fechar navegação" : "Abrir navegação"}
              aria-controls="stock-on-primary-navigation"
              aria-expanded={menuOpen}
              onClick={onMenu}
            >
              <OperationIcon name="menu" size={20} />
            </button>
          ) : null}
          <div>
            <span className="history-timeline__eyebrow">Rastro operacional</span>
            <h1 id={titleId}>Histórico operacional</h1>
            <p>Equipamentos e Pontos</p>
          </div>
        </div>

        <div className="history-timeline__exports" aria-label="Exportar eventos do recorte atual">
          <button type="button" disabled={!hasExportableEvents || !onExportExcel} onClick={() => onExportExcel?.(filteredEvents)}>
            <OperationIcon name="spreadsheet" size={16} />
            Excel
          </button>
          <button type="button" disabled={!hasExportableEvents || !onExportPdf} onClick={() => onExportPdf?.(filteredEvents)}>
            <OperationIcon name="pdf" size={16} />
            PDF
          </button>
        </div>
      </header>

      <div className="history-timeline__controls" aria-label="Consulta do histórico">
        <div className="history-timeline__control-line">
          <div className="history-timeline__search">
            <OperationIcon name="search" size={17} />
            <label className="sr-only" htmlFor={searchId}>Buscar no histórico operacional</label>
            <input
              id={searchId}
              type="text"
              inputMode="search"
              role="searchbox"
              value={query}
              placeholder="Buscar entidade, origem, destino ou evento"
              onChange={(event) => changeQuery(event.target.value)}
            />
            {query ? (
              <button type="button" aria-label="Limpar busca" onClick={() => changeQuery("")}>
                <OperationIcon name="close" size={15} />
              </button>
            ) : null}
          </div>

          <div className="history-timeline__period" aria-label="Período">
            {PERIOD_OPTIONS.map((option) => (
              <button
                type="button"
                key={option.value}
                className={period === option.value ? "is-active" : ""}
                aria-pressed={period === option.value}
                onClick={() => changePeriod(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            className={classes("history-timeline__filter-toggle", filtersOpen && "is-open")}
            aria-expanded={filtersOpen}
            aria-controls={filtersId}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <OperationIcon name="filter" size={16} />
            Filtros{activeSecondaryFilters ? ` · ${activeSecondaryFilters}` : ""}
          </button>
        </div>

        <div id={filtersId} className="history-timeline__secondary-filters" hidden={!filtersOpen}>
          <label>
            <span>Módulo</span>
            <select value={module} onChange={(event) => changeModule(event.target.value)}>
              {MODULE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label>
            <span>Tipo de evento</span>
            <select value={eventType} onChange={(event) => changeEventType(event.target.value)}>
              <option value="all">Todos os tipos</option>
              {eventTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          {activeSecondaryFilters ? (
            <button type="button" className="history-timeline__clear-filters" onClick={clearSecondaryFilters}>
              Limpar filtros
            </button>
          ) : null}
        </div>

        <p className="history-timeline__summary" aria-live="polite">
          <strong>{filteredEvents.length}</strong> evento{filteredEvents.length === 1 ? "" : "s"} no período
          <span aria-hidden="true">·</span>
          {moduleTotals.equipment} Equipamento{moduleTotals.equipment === 1 ? "" : "s"}
          <span aria-hidden="true">·</span>
          {moduleTotals.point} Ponto{moduleTotals.point === 1 ? "" : "s"}
        </p>
      </div>

      {loadError ? (
        <section className={classes("history-timeline__state", "history-timeline__state--error", events.length && "history-timeline__state--partial")} role="alert">
          <OperationIcon name="warning" size={24} />
          <div>
            <h2>{events.length ? "Parte do histórico não foi carregada" : "Não foi possível carregar o histórico"}</h2>
            <p>{loadError}</p>
          </div>
        </section>
      ) : null}

      {filteredEvents.length === 0 ? (!loadError ? (
        <section className="history-timeline__state" role="status" aria-live="polite">
          <OperationIcon name="history" size={26} />
          <div>
            <h2>{events.length ? "Nenhum evento neste recorte" : "Nenhum evento registrado"}</h2>
            <p>{events.length ? "Ajuste a busca, o período ou os filtros secundários." : "Os eventos de Equipamentos e Pontos aparecerão aqui quando forem registrados."}</p>
          </div>
        </section>
      ) : null) : (
        <div className="history-timeline__ledger">
          {chapters.map((chapter) => (
            <section className="history-timeline__chapter" key={chapter.key} aria-labelledby={`history-chapter-${safeDomId(chapter.key)}`}>
              <header className="history-timeline__chapter-head">
                <h2 id={`history-chapter-${safeDomId(chapter.key)}`}>
                  <span>{chapter.label}</span>
                  {chapter.dateLabel && chapter.dateLabel !== chapter.label ? <small>{chapter.dateLabel}</small> : null}
                </h2>
                <strong>{chapter.count} evento{chapter.count === 1 ? "" : "s"}</strong>
              </header>
              <ol className="history-timeline__events">
                {chapter.events.map((event) => {
                  const detailsId = `history-details-${safeDomId(event.id)}`;
                  return (
                    <HistoryEvent
                      key={event.id}
                      event={event}
                      detailsId={detailsId}
                      expanded={expandedId === event.id}
                      onToggle={() => setExpandedId((current) => current === event.id ? null : event.id)}
                    />
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}

      {pagination.totalPages > 1 ? (
        <nav className="history-timeline__pagination" aria-label="Páginas do histórico">
          <button type="button" disabled={pagination.page <= 1} onClick={() => goToPage(pagination.page - 1)}>
            <OperationIcon name="chevronLeft" size={17} />
            Anterior
          </button>
          <span aria-live="polite">
            Página <strong>{pagination.page}</strong> de {pagination.totalPages}
            <small>{pagination.startIndex + 1}–{pagination.endIndex + 1} de {pagination.totalItems}</small>
          </span>
          <button type="button" disabled={pagination.page >= pagination.totalPages} onClick={() => goToPage(pagination.page + 1)}>
            Próxima
            <OperationIcon name="chevronRight" size={17} />
          </button>
        </nav>
      ) : null}
    </section>
  );
}
