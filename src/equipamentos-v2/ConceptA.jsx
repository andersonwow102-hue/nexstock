import { useEffect, useRef } from "react";
import {
  CategoryIcon,
  EmptyState,
  FilterButton,
  Icon,
  Pagination,
  PositionStamp,
  SearchField,
  StatusBadge,
  TraceList,
  usePagedItems,
} from "./shared.jsx";
import { positionOf } from "./model.js";
import "./concept-a.css";

const FILTER_LABELS = {
  category: "Categoria",
  position: "Posição",
  status: "Estado",
  state: "Estado",
  manager: "Gerente",
  point: "Ponto",
};

const FILTER_VALUE_LABELS = {
  internal: "Estoque interno",
  point: "Em pontos",
  manager: "Com gerentes",
  repair: "Conserto",
};

const LEDGER_DATE_FORMAT = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function firstValue(source, keys, fallback = "") {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return fallback;
}

function itemName(item) {
  return firstValue(item, ["name", "nome", "label", "identifier", "id"], "Equipamento sem nome");
}

function itemCode(item) {
  return firstValue(item, ["identifier", "code", "patrimonio", "id"], "REGISTRO");
}

function itemCategory(item) {
  return firstValue(item, ["category", "categoria"], "Sem categoria");
}

function itemStatus(item) {
  return firstValue(item, ["status", "state", "estado"], "Não informado");
}

function linkOf(item) {
  return firstValue(positionOf(item), ["detail"], "Base operacional");
}

function responsibleOf(item) {
  return firstValue(item, ["responsible", "responsavel", "managerName", "manager", "gerenteResponsavel"], "Não informado");
}

function movementOf(item) {
  const event = item?.lastMovement || item?.history?.[0] || item?.trace?.[0];
  if (!event) return { label: "Sem movimentação", date: "—" };
  if (typeof event === "string") return { label: event, date: "—" };
  const rawDate = firstValue(event, ["date", "data", "timestamp", "when", "at"], "");
  let date = "—";
  if (rawDate) {
    const parsedDate = new Date(rawDate);
    date = Number.isNaN(parsedDate.getTime()) ? String(rawDate) : LEDGER_DATE_FORMAT.format(parsedDate);
  }
  return {
    label: firstValue(event, ["label", "typeLabel", "tipo", "title"], "Movimentação registrada"),
    date,
  };
}

function positionLabel(item) {
  const position = positionOf(item);
  if (typeof position === "string") return position;
  return firstValue(position, ["label", "name", "position", "type"], "Posição não informada");
}

function countValue(counts, keys, fallback = 0) {
  const value = firstValue(counts, keys, fallback);
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function activeFiltersOf(filters) {
  return Object.entries(filters || {}).filter(([, value]) => {
    if (value === undefined || value === null || value === "") return false;
    return !["all", "todos", "todas"].includes(String(value).toLowerCase());
  });
}

export default function ConceptA({ workspace }) {
  const {
    items = [],
    selected,
    select,
    counts = {},
    filters = {},
    setFilter,
    query = "",
    setQuery,
    activeFilterCount = 0,
    openFilters,
    openMovement,
    openHistory,
    openDetail,
    detailOpen = false,
    closeDetail,
    announce,
    scale = 40,
  } = workspace;

  const { page, totalPages, pageItems, setPage, total } = usePagedItems(items, 20);
  const selectorRefs = useRef([]);
  const activeFilters = activeFiltersOf(filters);

  useEffect(() => {
    if (!detailOpen) return undefined;
    function closeOnEscape(event) {
      if (event.key === "Escape") closeDetail();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [closeDetail, detailOpen]);

  const metrics = [
    { label: "Base", value: countValue(counts, ["total", "all"], total) },
    { label: "Estoque interno", value: countValue(counts, ["internal", "interno", "stock"]) },
    { label: "Em pontos", value: countValue(counts, ["point", "points", "pontos", "atPoints"]) },
    { label: "Com gerentes", value: countValue(counts, ["manager", "managers", "gerentes", "withManagers"]) },
    { label: "Conserto", value: countValue(counts, ["repair", "conserto", "repairs"]) },
  ];

  function selectWithKeyboard(event, index, item) {
    if (event.key === "Enter") {
      event.preventDefault();
      openDetail(item);
      return;
    }
    if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
    event.preventDefault();
    const delta = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = Math.max(0, Math.min(pageItems.length - 1, index + delta));
    const nextItem = pageItems[nextIndex];
    if (!nextItem || nextIndex === index) return;
    select(nextItem);
    selectorRefs.current[nextIndex]?.focus({ preventScroll: true });
  }

  function clearFilter(key) {
    setFilter(key, "");
  }

  const dossierPosition = selected ? positionLabel(selected) : "";
  const dossierMovement = selected ? movementOf(selected) : null;
  const dossierEvents = selected?.history || selected?.trace || [];

  return (
    <section className="ev-concept-a" aria-labelledby="ev-a-title">
      <header className="ev-concept-a__topbar">
        <div className="ev-concept-a__title">
          <span>Inventário operacional</span>
          <div>
            <h1 id="ev-a-title">Equipamentos</h1>
            <small>{scale} registros simulados · livro de posição</small>
          </div>
        </div>

        <div className="ev-concept-a__commands">
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Buscar equipamento, categoria, ponto ou gerente"
            label="Buscar no inventário de equipamentos"
          />
          <FilterButton count={activeFilterCount} onClick={openFilters} expanded={false} />
          <button
            className="ev-concept-a__new"
            type="button"
            onClick={() => announce?.("Novo equipamento aberto apenas como simulação.")}
          >
            <Icon name="plus" size={17} />
            <span>Novo equipamento</span>
          </button>
        </div>
      </header>

      <dl className="ev-concept-a__ruler" aria-label="Resumo operacional">
        {metrics.map((metric) => (
          <div key={metric.label}>
            <dt>{metric.label}</dt>
            <dd>{metric.value}</dd>
          </div>
        ))}
        <div className="ev-concept-a__ruler-note">
          <dt>Leitura atual</dt>
          <dd>{total} no recorte</dd>
        </div>
      </dl>

      {activeFilters.length > 0 && (
        <div className="ev-concept-a__chips" aria-label="Filtros ativos">
          {activeFilters.map(([key, value]) => (
            <button type="button" key={key} onClick={() => clearFilter(key)}>
              <span>{FILTER_LABELS[key] || key}: {FILTER_VALUE_LABELS[value] || String(value)}</span>
              <Icon name="close" size={13} />
            </button>
          ))}
        </div>
      )}

      <div className={`ev-concept-a__workspace ${detailOpen ? "is-detail-open" : ""}`}>
        <main className="ev-concept-a__ledger" aria-label="Livro operacional de equipamentos">
          <div className="ev-concept-a__ledger-scroll">
            <div className="ev-concept-a__ledger-head" aria-hidden="true">
              <span>Reg.</span>
              <span>Equipamento</span>
              <span>Categoria</span>
              <span>Posição</span>
              <span>Vínculo</span>
              <span>Estado</span>
              <span>Última movimentação</span>
              <span>Ação</span>
            </div>

            <div className="ev-concept-a__rows" role="list" aria-label={`${total} equipamentos encontrados`}>
              {pageItems.length === 0 ? (
                <EmptyState
                  title="Nenhum equipamento neste recorte"
                  description="Limpe a busca ou remova um filtro para consultar outros registros."
                />
              ) : pageItems.map((item, index) => {
                const isSelected = selected?.id === item.id;
                const lastMovement = movementOf(item);
                return (
                  <article
                    className={`ev-concept-a__row ${isSelected ? "is-selected" : ""}`}
                    key={item.id}
                    role="listitem"
                  >
                    <span className="ev-concept-a__register" aria-hidden="true">
                      {String((page - 1) * 20 + index + 1).padStart(3, "0")}
                    </span>
                    <button
                      className="ev-concept-a__identity"
                      type="button"
                      ref={(node) => { selectorRefs.current[index] = node; }}
                      aria-pressed={isSelected}
                      aria-label={`Selecionar ${itemName(item)}, ${itemCategory(item)}`}
                      onClick={() => openDetail(item)}
                      onKeyDown={(event) => selectWithKeyboard(event, index, item)}
                    >
                      <CategoryIcon category={itemCategory(item)} />
                      <span>
                        <strong>{itemName(item)}</strong>
                        <small>{itemCode(item)}</small>
                      </span>
                    </button>
                    <span className="ev-concept-a__category" data-label="Categoria">{itemCategory(item)}</span>
                    <span className="ev-concept-a__position" data-label="Posição">
                      <PositionStamp item={item} compact />
                    </span>
                    <span className="ev-concept-a__link" data-label="Vínculo">{linkOf(item)}</span>
                    <span className="ev-concept-a__state" data-label="Estado">
                      <StatusBadge status={itemStatus(item)} />
                    </span>
                    <span className="ev-concept-a__movement" data-label="Última movimentação">
                      <strong>{lastMovement.label}</strong>
                      <small>{lastMovement.date}</small>
                    </span>
                    <button
                      className="ev-concept-a__move"
                      type="button"
                      onClick={() => openMovement(item)}
                      aria-label={`Movimentar ${itemName(item)}`}
                    >
                      <Icon name="transfer" size={16} />
                      <span>Movimentar</span>
                    </button>
                  </article>
                );
              })}
            </div>
          </div>

          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            onChange={setPage}
          />
        </main>

        <button
          className="ev-concept-a__backdrop"
          type="button"
          tabIndex={detailOpen ? 0 : -1}
          aria-hidden={!detailOpen}
          aria-label="Fechar dossiê"
          onClick={closeDetail}
        />

        <aside
          className="ev-concept-a__dossier"
          aria-label="Dossiê do equipamento selecionado"
          aria-hidden={!selected || undefined}
        >
          {selected ? (
            <>
              <header className="ev-concept-a__dossier-head">
                <button
                  className="ev-concept-a__dossier-close"
                  type="button"
                  onClick={closeDetail}
                  aria-label="Fechar dossiê"
                >
                  <Icon name="close" size={17} />
                </button>
                <CategoryIcon category={itemCategory(selected)} />
                <div>
                  <span>Dossiê operacional</span>
                  <h2>{itemName(selected)}</h2>
                  <p>{itemCode(selected)} · {itemCategory(selected)}</p>
                </div>
                <StatusBadge status={itemStatus(selected)} />
              </header>

              <div className="ev-concept-a__dossier-body">
                <section className="ev-concept-a__current" aria-labelledby="ev-a-current-position">
                  <span id="ev-a-current-position">Posição atual</span>
                  <strong>{dossierPosition}</strong>
                  <small>{linkOf(selected)}</small>
                </section>

                <dl className="ev-concept-a__facts">
                  <div><dt>Estado</dt><dd>{itemStatus(selected)}</dd></div>
                  <div><dt>Vínculo</dt><dd>{linkOf(selected)}</dd></div>
                  <div><dt>Responsável</dt><dd>{responsibleOf(selected)}</dd></div>
                  <div><dt>Último registro</dt><dd>{dossierMovement?.date || "—"}</dd></div>
                </dl>

                <div className="ev-concept-a__dossier-actions">
                  <button type="button" className="is-primary" onClick={() => openMovement(selected)}>
                    <Icon name="transfer" size={17} />
                    Movimentar
                  </button>
                  <button type="button" onClick={() => openDetail(selected)}>
                    <Icon name="external" size={16} />
                    Abrir ficha
                  </button>
                </div>

                <section className="ev-concept-a__trace" aria-labelledby="ev-a-trace-title">
                  <header>
                    <div>
                      <span>Rastro recente</span>
                      <h3 id="ev-a-trace-title">Movimentações</h3>
                    </div>
                    <button type="button" onClick={() => openHistory(selected)}>Ver histórico</button>
                  </header>
                  <TraceList events={dossierEvents} limit={5} />
                </section>
              </div>
            </>
          ) : (
            <EmptyState
              title="Selecione um registro"
              description="O dossiê acompanha a linha escolhida no ledger."
            />
          )}
        </aside>
      </div>
    </section>
  );
}
