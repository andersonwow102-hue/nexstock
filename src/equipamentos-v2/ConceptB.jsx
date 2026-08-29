import { useEffect, useMemo } from "react";
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
import { needsAction, positionOf } from "./model.js";
import "./concept-b.css";

const POSITION_RAIL = [
  { value: "", count: "total", label: "Todos", icon: "layers" },
  { value: "internal", count: "internal", label: "Interno", icon: "warehouse" },
  { value: "point", count: "point", label: "Ponto", icon: "pin" },
  { value: "manager", count: "manager", label: "Gerente", icon: "user" },
  { value: "repair", count: "repair", label: "Conserto", icon: "repair" },
];

const MOVEMENT_DATE = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const FILTER_LABELS = {
  category: "Categoria",
  status: "Estado",
  position: "Posição",
  manager: "Gerente",
  point: "Ponto",
};

function movementOf(item) {
  const event = item?.history?.[0];
  if (!event) return { label: "Sem movimentação registrada", detail: "—", when: "—" };
  const date = new Date(event.at);
  return {
    label: event.label,
    detail: event.detail,
    when: Number.isNaN(date.getTime()) ? "—" : MOVEMENT_DATE.format(date),
  };
}

function linkOf(item) {
  const position = positionOf(item);
  if (position.key === "point") return item.localizacao;
  if (position.groupKey === "manager" || position.key === "manager") return item.gerenteResponsavel;
  if (position.key === "repair") return item.responsavel;
  return "Base operacional";
}

function custodyOf(item) {
  if (!item) return [];
  const position = positionOf(item);
  const previousEvent = item.history?.[1];
  const stages = [
    {
      key: "origin",
      eyebrow: "Origem registrada",
      label: previousEvent?.label || "Entrada na base",
      detail: previousEvent?.detail || "Registro inicial do equipamento",
      icon: "box",
    },
    {
      key: "current",
      eyebrow: "Posição atual",
      label: position.label,
      detail: position.detail,
      icon: position.icon,
      current: true,
    },
  ];
  if (item.nextDestination) {
    stages.push({
      key: "destination",
      eyebrow: "Destino informado",
      label: item.nextDestination,
      detail: "Transferência aguardando confirmação",
      icon: "transfer",
      pending: true,
    });
  }
  return stages;
}

function CommandRow({ item, selected, onOpen, onKeyboard }) {
  const position = positionOf(item);
  const action = needsAction(item);
  const movement = movementOf(item);
  return (
    <button
      aria-current={selected ? "true" : undefined}
      className={`ev-concept-b__asset${selected ? " is-selected" : ""}${action ? " requires-action" : ""}`}
      data-ev-b-row="true"
      onClick={() => onOpen(item)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onOpen(item);
          return;
        }
        onKeyboard(event);
      }}
      type="button"
    >
      <span className="ev-concept-b__category-mark"><CategoryIcon category={item.categoria} size={21} /></span>
      <span className="ev-concept-b__identity">
        <small>{item.code}</small>
        <strong>{item.nome}</strong>
        <span>{item.categoria}</span>
      </span>
      <PositionStamp compact item={item} />
      <span className="ev-concept-b__link">
        <small>Vínculo</small>
        <strong>{linkOf(item)}</strong>
      </span>
      <span className="ev-concept-b__condition">
        {action ? <><small>{action.label}</small><strong>{action.detail}</strong></> : <StatusBadge status={item.status} />}
      </span>
      <span className="ev-concept-b__movement">
        <small>{movement.when}</small>
        <strong>{movement.label}</strong>
        <span>{movement.detail}</span>
      </span>
      <span className="ev-concept-b__open"><Icon name="chevron" size={17} /></span>
      <span className="ev-concept-b__position-mobile"><Icon name={position.icon} size={14} />{position.label}</span>
    </button>
  );
}

function AssetGroup({ eyebrow, title, items, selected, onOpen, tone = "default" }) {
  if (!items.length) return null;

  function moveSelection(event) {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    const rows = [...event.currentTarget.closest(".ev-concept-b__group").querySelectorAll("[data-ev-b-row]")];
    const currentIndex = rows.indexOf(event.currentTarget);
    const nextIndex = event.key === "ArrowDown"
      ? Math.min(rows.length - 1, currentIndex + 1)
      : Math.max(0, currentIndex - 1);
    rows[nextIndex]?.focus();
    if (nextIndex !== currentIndex) rows[nextIndex]?.click();
  }

  return (
    <section className={`ev-concept-b__group is-${tone}`} aria-labelledby={`ev-b-${tone}-title`}>
      <header>
        <span><small>{eyebrow}</small><h3 id={`ev-b-${tone}-title`}>{title}</h3></span>
        <strong>{items.length}</strong>
      </header>
      <div className="ev-concept-b__rows" role="list">
        {items.map((item) => (
          <CommandRow
            item={item}
            key={item.id}
            onKeyboard={moveSelection}
            onOpen={onOpen}
            selected={selected?.id === item.id}
          />
        ))}
      </div>
    </section>
  );
}

function CommandPanel({ item, detailOpen, closeDetail, openDetail, openHistory, openMovement }) {
  useEffect(() => {
    if (!detailOpen) return undefined;
    function closeOnEscape(event) {
      if (event.key === "Escape") closeDetail();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [closeDetail, detailOpen]);

  if (!item) return null;
  const position = positionOf(item);
  const action = needsAction(item);
  const custody = custodyOf(item);
  return (
    <>
      <button
        aria-label="Fechar painel do equipamento"
        className={`ev-concept-b__panel-backdrop${detailOpen ? " is-visible" : ""}`}
        onClick={closeDetail}
        type="button"
      />
      <aside className={`ev-concept-b__panel${detailOpen ? " is-open" : ""}`} aria-labelledby="ev-b-panel-title">
        <button aria-label="Fechar detalhe" className="ev-concept-b__panel-close" onClick={closeDetail} type="button">
          <Icon name="close" size={19} />
        </button>
        <header className="ev-concept-b__panel-head">
          <span className="ev-concept-b__panel-kicker">Painel de comando</span>
          <div className="ev-concept-b__panel-identity">
            <span><CategoryIcon category={item.categoria} size={27} /></span>
            <div><small>{item.code} · {item.categoria}</small><h2 id="ev-b-panel-title">{item.nome}</h2></div>
          </div>
          <div className="ev-concept-b__panel-state"><StatusBadge status={item.status} /><PositionStamp item={item} /></div>
        </header>

        {action ? (
          <section className="ev-concept-b__attention" aria-label="Situação que requer ação">
            <Icon name={action.key === "repair" ? "repair" : "transfer"} size={18} />
            <span><small>Requer ação</small><strong>{action.label}</strong><p>{action.detail}</p></span>
          </section>
        ) : null}

        <section className="ev-concept-b__custody" aria-labelledby="ev-b-custody-title">
          <header><span><small>Movimentação</small><h3 id="ev-b-custody-title">Trilho de custódia</h3></span><Icon name="transfer" size={18} /></header>
          <ol>
            {custody.map((stage) => (
              <li className={`${stage.current ? "is-current" : ""}${stage.pending ? " is-pending" : ""}`} key={stage.key}>
                <span className="ev-concept-b__custody-node"><Icon name={stage.icon} size={15} /></span>
                <div><small>{stage.eyebrow}</small><strong>{stage.label}</strong><p>{stage.detail}</p></div>
              </li>
            ))}
          </ol>
        </section>

        <section className="ev-concept-b__facts" aria-label="Responsabilidade e vínculo">
          <div><small>Responsável</small><strong>{item.responsavel || "Administração"}</strong></div>
          <div><small>Vínculo atual</small><strong>{linkOf(item)}</strong></div>
          {item.consertoDefeito ? <div className="is-wide"><small>Registro técnico</small><strong>{item.consertoDefeito}</strong></div> : null}
        </section>

        <section className="ev-concept-b__trace">
          <header><span><small>Rastro</small><h3>Últimos eventos</h3></span><button onClick={() => openHistory(item)} type="button">Histórico completo</button></header>
          <TraceList events={item.history} limit={3} />
        </section>

        <footer className="ev-concept-b__panel-actions">
          <button className="is-primary" onClick={() => openMovement(item)} type="button"><Icon name="move" size={17} />Movimentar equipamento</button>
          <div>
            <button onClick={() => openHistory(item)} type="button"><Icon name="history" size={16} />Ver histórico</button>
            <button onClick={() => openDetail(item)} type="button"><Icon name="external" size={16} />Abrir ficha</button>
          </div>
        </footer>
      </aside>
    </>
  );
}

export default function ConceptB({ workspace }) {
  const {
    items,
    selected,
    select,
    counts,
    filters,
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

  const orderedItems = useMemo(() => [...items].sort((a, b) => Number(Boolean(needsAction(b))) - Number(Boolean(needsAction(a)))), [items]);
  const { page, totalPages, pageItems, setPage, total } = usePagedItems(orderedItems, 24);
  const actionItems = pageItems.filter((item) => needsAction(item));
  const trackedItems = pageItems.filter((item) => !needsAction(item));
  const current = selected || pageItems[0] || null;
  const activeFilters = Object.entries(filters).filter(([, value]) => Boolean(value));

  function openItem(item) {
    select(item);
    openDetail(item);
    announce?.(`${item.code} aberto no painel de comando.`);
  }

  return (
    <section className="ev-concept-b" aria-labelledby="ev-b-title">
      <header className="ev-concept-b__command">
        <div className="ev-concept-b__heading">
          <small>Asset Command</small>
          <h2 id="ev-b-title">Posição que exige decisão</h2>
          <p>Custódia, condição e próxima movimentação sem criar prioridades artificiais.</p>
        </div>
        <div className="ev-concept-b__tools">
          <SearchField label="Buscar por equipamento, categoria, ponto, gerente ou identificador" onChange={setQuery} placeholder="Buscar equipamento, ponto ou gerente" value={query} />
          <FilterButton count={activeFilterCount} expanded={false} onClick={openFilters} />
        </div>
        <dl className="ev-concept-b__summary" aria-label="Resumo operacional">
          <div><dt>Base</dt><dd>{counts.total}</dd></div>
          <div className="is-attention"><dt>Requer ação</dt><dd>{counts.attention}</dd></div>
          <div><dt>Em pontos</dt><dd>{counts.point}</dd></div>
          <div><dt>Internos</dt><dd>{counts.internal}</dd></div>
          <div><dt>Massa</dt><dd>{scale}</dd></div>
        </dl>
      </header>

      {activeFilters.length ? (
        <div className="ev-concept-b__chips" aria-label="Filtros ativos">
          {activeFilters.map(([key, value]) => (
            <button key={key} onClick={() => setFilter(key, "")} type="button">
              <span>{FILTER_LABELS[key] || key}</span><strong>{value}</strong><Icon name="close" size={13} />
            </button>
          ))}
        </div>
      ) : null}

      <div className="ev-concept-b__workspace">
        <nav className="ev-concept-b__rail" aria-label="Posição operacional">
          <span className="ev-concept-b__rail-label">Posição</span>
          {POSITION_RAIL.map((item) => {
            const active = (filters.position || "") === item.value;
            return (
              <button aria-current={active ? "true" : undefined} className={active ? "is-active" : ""} key={item.value || "all"} onClick={() => setFilter("position", item.value)} type="button">
                <Icon name={item.icon} size={17} />
                <span>{item.label}</span>
                <strong>{counts[item.count]}</strong>
              </button>
            );
          })}
          <span className="ev-concept-b__rail-note"><Icon name="command" size={14} />Recortes por posição real</span>
        </nav>

        <main className="ev-concept-b__main">
          <div className="ev-concept-b__ledger-head" aria-hidden="true">
            <span>Equipamento</span><span>Posição</span><span>Vínculo</span><span>Condição</span><span>Último movimento</span>
          </div>
          {pageItems.length ? (
            <>
              <AssetGroup eyebrow="Transferência ou conserto" items={actionItems} onOpen={openItem} selected={current} title="Requer ação" tone="attention" />
              <AssetGroup eyebrow="Posição conhecida" items={trackedItems} onOpen={openItem} selected={current} title="Em acompanhamento" tone="tracked" />
              <Pagination onChange={setPage} page={page} total={total} totalPages={totalPages} />
            </>
          ) : (
            <EmptyState
              action={query ? <button className="ev-button ev-button--quiet" onClick={() => setQuery("")} type="button">Limpar busca</button> : null}
              description="Revise a busca ou remova os filtros para recuperar a leitura operacional."
              title="Nenhum ativo neste recorte"
            />
          )}
        </main>

        <CommandPanel
          closeDetail={closeDetail}
          detailOpen={detailOpen}
          item={current}
          openDetail={openDetail}
          openHistory={openHistory}
          openMovement={openMovement}
        />
      </div>
    </section>
  );
}
