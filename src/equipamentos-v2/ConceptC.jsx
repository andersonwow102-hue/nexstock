import { useEffect, useMemo, useState } from "react";
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
import "./concept-c.css";

const POSITION_KICKERS = {
  internal: "AGORA / ESTOQUE",
  point: "AGORA / PONTO",
  manager: "AGORA / GERENTE",
  manager_pending: "AGORA / TRANSFERÊNCIA",
  repair: "AGORA / CONSERTO",
};

const FILTER_LABELS = {
  category: "Categoria",
  status: "Estado",
  position: "Posição",
  manager: "Gerente",
  point: "Ponto",
};

function useCompactDetail() {
  const [compact, setCompact] = useState(() => (
    typeof window !== "undefined" && Boolean(window.matchMedia?.("(max-width: 1024px)").matches)
  ));

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const query = window.matchMedia("(max-width: 1024px)");
    const update = () => setCompact(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  return compact;
}

function Fact({ label, children }) {
  return (
    <div className="ev-c__fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function PositionPath({ item }) {
  const position = positionOf(item);
  const previous = [...(item.history || [])].slice(0, 2).reverse();
  const steps = [
    ...previous.map((event) => ({
      id: event.id,
      label: event.label,
      detail: event.detail,
      current: false,
    })),
    {
      id: `now-${item.id}`,
      label: position.label,
      detail: position.detail,
      current: true,
    },
  ];

  return (
    <ol className="ev-c__path" aria-label="Trajeto factual do equipamento">
      {steps.map((step) => (
        <li key={step.id} className={step.current ? "is-current" : ""}>
          <span className="ev-c__path-node" aria-hidden="true" />
          <span>
            <small>{step.current ? "Posição atual" : "Movimentação registrada"}</small>
            <strong>{step.label}</strong>
            <em>{step.detail}</em>
          </span>
        </li>
      ))}
    </ol>
  );
}

export default function ConceptC({ workspace }) {
  const {
    items,
    selected,
    select,
    counts = {},
    filters = {},
    setFilter,
    query,
    setQuery,
    activeFilterCount,
    openFilters,
    openMovement,
    openHistory,
    openDetail,
    detailOpen,
    closeDetail,
    announce,
    scale,
  } = workspace;
  const compactDetail = useCompactDetail();
  const {
    page,
    totalPages,
    pageItems,
    setPage,
    total,
  } = usePagedItems(items, 16);

  const activeFilters = useMemo(
    () => Object.entries(filters).filter(([, value]) => Boolean(value)),
    [filters],
  );
  const selectedInView = items.find((item) => item.id === selected?.id);
  const current = selectedInView || pageItems[0] || null;
  const currentPosition = positionOf(current);
  const positionKicker = POSITION_KICKERS[currentPosition.key] || "AGORA / POSIÇÃO";

  const summary = [
    { label: "Base", value: counts.total ?? total },
    { label: "Estoque", value: counts.internal ?? 0 },
    { label: "Pontos", value: counts.point ?? 0 },
    { label: "Gerentes", value: counts.manager ?? 0 },
    { label: "Conserto", value: counts.repair ?? 0 },
  ];

  function choose(item, { open = false } = {}) {
    select(item);
    announce?.(`${item.code} selecionado. ${positionOf(item).label}: ${positionOf(item).detail}.`);
    if (open || compactDetail) openDetail(item);
  }

  function handleRecordKeyDown(event, index, item) {
    if (event.key === "Escape" && detailOpen) {
      event.preventDefault();
      closeDetail();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      choose(item, { open: true });
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const direction = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = Math.max(0, Math.min(pageItems.length - 1, index + direction));
    const nextItem = pageItems[nextIndex];
    if (!nextItem || nextIndex === index) return;
    select(nextItem);
    announce?.(`${nextItem.code} selecionado.`);
    const records = event.currentTarget.closest("[role='listbox']")?.querySelectorAll("[role='option']");
    records?.[nextIndex]?.focus({ preventScroll: true });
  }

  function handleDetailKeyDown(event) {
    if (!compactDetail || !detailOpen) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeDetail();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...event.currentTarget.querySelectorAll(
      "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
    )].filter((element) => element.getClientRects().length > 0);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  }

  return (
    <section className="ev-concept-c" aria-labelledby="ev-c-title">
      <header className="ev-c__header">
        <div className="ev-c__heading">
          <span>Position workspace · escala {scale}</span>
          <h1 id="ev-c-title">Equipamentos em contexto</h1>
          <p>Leia a posição, consulte o rastro e decida o próximo movimento.</p>
        </div>

        <div className="ev-c__tools">
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Buscar equipamento, categoria, ponto, gerente ou código"
            label="Buscar equipamentos"
          />
          <FilterButton count={activeFilterCount} onClick={openFilters} expanded={false} />
        </div>

        <dl className="ev-c__summary" aria-label="Composição da base simulada">
          {summary.map((entry) => (
            <div key={entry.label}>
              <dt>{entry.label}</dt>
              <dd>{entry.value}</dd>
            </div>
          ))}
        </dl>

        {activeFilters.length > 0 && (
          <div className="ev-c__chips" aria-label="Filtros ativos">
            {activeFilters.map(([key, value]) => (
              <button
                type="button"
                key={key}
                onClick={() => {
                  setFilter(key, "");
                  announce?.(`${FILTER_LABELS[key] || key} removido dos filtros.`);
                }}
              >
                <span>{FILTER_LABELS[key] || key}</span>
                <strong>{value}</strong>
                <Icon name="close" />
              </button>
            ))}
          </div>
        )}
      </header>

      <div className="ev-c__workspace">
        <section className="ev-c__collection" aria-labelledby="ev-c-collection-title">
          <header className="ev-c__collection-head">
            <div>
              <span>Ativos no recorte</span>
              <h2 id="ev-c-collection-title">Posição atual</h2>
            </div>
            <p><strong>{total}</strong> equipamento{total === 1 ? "" : "s"}</p>
          </header>

          {pageItems.length === 0 ? (
            <EmptyState
              title="Nenhum equipamento neste recorte"
              description="Ajuste a busca ou remova um filtro para voltar à posição operacional."
            />
          ) : (
            <div className="ev-c__list" role="listbox" aria-label="Equipamentos encontrados">
              {pageItems.map((item, index) => {
                const active = current?.id === item.id;
                return (
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`ev-c__record${active ? " is-selected" : ""}`}
                    key={item.id}
                    onClick={() => choose(item)}
                    onDoubleClick={() => choose(item, { open: true })}
                    onKeyDown={(event) => handleRecordKeyDown(event, index, item)}
                  >
                    <span className="ev-c__category-mark"><CategoryIcon category={item.categoria} size={21} /></span>
                    <span className="ev-c__record-identity">
                      <small>{item.code}</small>
                      <strong>{item.nome}</strong>
                      <em>{item.categoria}</em>
                    </span>
                    <span className="ev-c__record-position">
                      <PositionStamp item={item} compact />
                      <small>{positionOf(item).detail}</small>
                      <StatusBadge status={item.status} />
                    </span>
                    <Icon className="ev-c__record-arrow" name="chevron" />
                  </button>
                );
              })}
            </div>
          )}

          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            onChange={setPage}
          />
        </section>

        {compactDetail && detailOpen && (
          <button
            type="button"
            className="ev-c__detail-backdrop"
            tabIndex={-1}
            aria-label="Fechar contexto do equipamento"
            onClick={closeDetail}
          />
        )}

        <aside
          className={`ev-c__context${detailOpen ? " is-open" : ""}`}
          role={compactDetail ? "dialog" : "complementary"}
          aria-modal={compactDetail && detailOpen ? "true" : undefined}
          aria-hidden={compactDetail && !detailOpen ? "true" : undefined}
          inert={compactDetail && !detailOpen ? true : undefined}
          aria-labelledby={current ? "ev-c-context-title" : undefined}
          onKeyDown={handleDetailKeyDown}
        >
          {current ? (
            <>
              <button
                type="button"
                className="ev-c__context-close"
                onClick={closeDetail}
                aria-label="Fechar contexto"
                autoFocus={compactDetail && detailOpen}
              >
                <Icon name="close" />
              </button>

              <header className="ev-c__context-head">
                <div className="ev-c__asset-mark">
                  <span className="ev-c__category-mark"><CategoryIcon category={current.categoria} size={24} /></span>
                  <span>
                    <small>{current.code}</small>
                    <strong id="ev-c-context-title">{current.nome}</strong>
                    <em>{current.categoria}</em>
                  </span>
                </div>
                <StatusBadge status={current.status} />
              </header>

              <section className="ev-c__now" aria-labelledby="ev-c-now-title">
                <span>{positionKicker}</span>
                <div>
                  <Icon name={currentPosition.icon} />
                  <h2 id="ev-c-now-title">{currentPosition.detail}</h2>
                </div>
                <p>{currentPosition.label}</p>
              </section>

              <dl className="ev-c__facts">
                <Fact label="Estado"><StatusBadge status={current.status} /></Fact>
                <Fact label="Vínculo">{current.localizacao || current.gerenteResponsavel || "Base operacional"}</Fact>
                <Fact label="Responsável">{current.responsavel || "Não informado"}</Fact>
              </dl>

              <section className="ev-c__path-section" aria-labelledby="ev-c-path-title">
                <header>
                  <span>Posição, sem inferências</span>
                  <h3 id="ev-c-path-title">Caminho registrado</h3>
                </header>
                <PositionPath item={current} />
              </section>

              <section className="ev-c__trace" aria-labelledby="ev-c-trace-title">
                <header>
                  <div>
                    <span>Rastro recente</span>
                    <h3 id="ev-c-trace-title">O que aconteceu</h3>
                  </div>
                  <button type="button" onClick={() => openHistory(current)}>Ver histórico</button>
                </header>
                <TraceList events={current.history || []} limit={4} />
              </section>

              <footer className="ev-c__actions">
                <button type="button" className="ev-c__action-secondary" onClick={() => openHistory(current)}>
                  <Icon name="history" /> Histórico
                </button>
                <button type="button" className="ev-c__action-primary" onClick={() => openMovement(current)}>
                  Movimentar equipamento <Icon name="arrow" />
                </button>
              </footer>
            </>
          ) : (
            <EmptyState
              title="Selecione um equipamento"
              description="O contexto de posição e o rastro aparecerão neste espaço."
            />
          )}
        </aside>
      </div>
    </section>
  );
}
