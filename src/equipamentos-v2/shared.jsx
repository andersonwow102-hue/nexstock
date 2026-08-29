import { useEffect, useMemo, useState } from "react";
import { positionOf } from "./model.js";

const ICON_PATHS = {
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></>,
  filter: <><path d="M3 5h18L14 13v6l-4 2v-8Z" /></>,
  warehouse: <><path d="M3 10 12 4l9 6v10H3Z" /><path d="M7 20v-7h10v7M8 9h.01M12 9h.01M16 9h.01" /></>,
  pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
  user: <><circle cx="12" cy="8" r="3.5" /><path d="M5 21a7 7 0 0 1 14 0" /></>,
  repair: <><path d="m14.5 6.5 3-3a4 4 0 0 1-5 5L6 15l-2 5 5-2 6.5-6.5a4 4 0 0 1 5-5l-3 3" /></>,
  transfer: <><path d="M4 7h15m0 0-4-4m4 4-4 4M20 17H5m0 0 4 4m-4-4 4-4" /></>,
  history: <><path d="M4 5v5h5" /><path d="M5.5 16a8 8 0 1 0-.7-8" /><path d="M12 7v5l3 2" /></>,
  arrow: <><path d="M5 12h14m-5-5 5 5-5 5" /></>,
  chevron: <path d="m9 18 6-6-6-6" />,
  close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  box: <><path d="m4 7 8-4 8 4-8 4Z" /><path d="m4 7 8 4 8-4v10l-8 4-8-4ZM12 11v10" /></>,
  monitor: <><rect x="3" y="4" width="18" height="12" rx="1.5" /><path d="M8 20h8m-4-4v4" /></>,
  terminal: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="m7 8 3 3-3 3m6 0h4" /></>,
  printer: <><path d="M7 9V3h10v6M7 18H4V9h16v9h-3M7 14h10v7H7Z" /><path d="M17 12h.01" /></>,
  tablet: <><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M11 18h2" /></>,
  charger: <><path d="M9 3v6m6-6v6M7 9h10v3a5 5 0 0 1-10 0Zm5 8v4" /></>,
  gift: <><path d="M3 10h18v11H3ZM2 6h20v4H2ZM12 6v15" /><path d="M12 6H8.5a2.5 2.5 0 1 1 0-5C11 1 12 6 12 6Zm0 0h3.5a2.5 2.5 0 1 0 0-5C13 1 12 6 12 6Z" /></>,
  kiosk: <><path d="M7 3h10v13H7Z" /><path d="M9 21h6m-3-5v5M10 7h4" /></>,
  cash: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 9h4m-4 3h3m6-3h1m-1 3h1m-1 3h1" /></>,
  card: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M2 9h20M6 15h4" /></>,
  move: <><path d="M12 2v20m0-20-3 3m3-3 3 3M12 22l-3-3m3 3 3-3M2 12h20M2 12l3-3m-3 3 3 3m17-3-3-3m3 3-3 3" /></>,
  alert: <><path d="M12 3 2.5 20h19Z" /><path d="M12 9v5m0 3h.01" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M19 5l-1.5 1.5m-11 11L5 19" /></>,
  moon: <path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z" />,
  list: <><path d="M9 6h12M9 12h12M9 18h12" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></>,
  command: <><path d="M8 3a3 3 0 0 0 0 6h8a3 3 0 1 0 0-6 3 3 0 0 0-3 3v12a3 3 0 1 0 3-3H8a3 3 0 1 0 0 6 3 3 0 0 0 3-3V6a3 3 0 1 0-3 3" /></>,
  layers: <><path d="m3 8 9-5 9 5-9 5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>,
  dots: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
  external: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" /></>,
};

export function Icon({ name, size = 20, className = "", title }) {
  return (
    <svg
      aria-hidden={title ? undefined : "true"}
      aria-label={title}
      className={`ev-icon ${className}`}
      fill="none"
      height={size}
      role={title ? "img" : undefined}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.65"
      viewBox="0 0 24 24"
      width={size}
    >
      {title ? <title>{title}</title> : null}
      {ICON_PATHS[name] || ICON_PATHS.box}
    </svg>
  );
}

const CATEGORY_ICONS = {
  Televisões: "monitor",
  Terminais: "terminal",
  Impressoras: "printer",
  Tablets: "tablet",
  Carregadores: "charger",
  "Máquina de Brindes": "gift",
  Totens: "kiosk",
  Noteiro: "cash",
  "PDV Touchscreen": "card",
};

export function CategoryIcon({ category, size = 20 }) {
  return <Icon name={CATEGORY_ICONS[category] || "box"} size={size} />;
}

export function StatusBadge({ status }) {
  const tone = status === "Em conserto" ? "repair" : status === "Em rota" ? "route" : "available";
  return <span className={`ev-status ev-status--${tone}`}>{status}</span>;
}

export function PositionStamp({ item, compact = false }) {
  const position = positionOf(item);
  return (
    <span className={`ev-position-stamp${compact ? " is-compact" : ""}`}>
      <span className="ev-position-stamp__icon"><Icon name={position.icon} size={compact ? 14 : 16} /></span>
      <span>
        <strong>{position.label}</strong>
        {!compact ? <small>{position.detail}</small> : null}
      </span>
    </span>
  );
}

export function SearchField({ value, onChange, placeholder = "Buscar equipamentos", label = "Buscar" }) {
  return (
    <label className="ev-search-field">
      <span className="ev-visually-hidden">{label}</span>
      <Icon name="search" size={18} />
      <input
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type="search"
        value={value}
      />
      {value ? (
        <button aria-label="Limpar busca" onClick={() => onChange("")} type="button">
          <Icon name="close" size={16} />
        </button>
      ) : null}
    </label>
  );
}

export function FilterButton({ count = 0, onClick, expanded = false }) {
  return (
    <button aria-expanded={expanded} className={`ev-filter-button${count ? " has-filters" : ""}`} onClick={onClick} type="button">
      <Icon name="filter" size={17} />
      <span>Filtros</span>
      {count ? <span className="ev-filter-button__count">{count}</span> : null}
    </button>
  );
}

export function EmptyState({ title = "Nenhum equipamento encontrado", description = "Ajuste a busca ou remova os filtros ativos.", action }) {
  return (
    <div className="ev-empty-state" role="status">
      <span className="ev-empty-state__icon"><Icon name="search" size={24} /></span>
      <strong>{title}</strong>
      <p>{description}</p>
      {action}
    </div>
  );
}

const DATE_FORMAT = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function TraceList({ events = [], limit = 4 }) {
  const visibleEvents = events.slice(0, limit);
  if (!visibleEvents.length) return <p className="ev-trace-empty">Nenhuma movimentação registrada.</p>;
  return (
    <ol className="ev-trace-list">
      {visibleEvents.map((event, index) => (
        <li key={event.id || `${event.label}-${index}`}>
          <span className="ev-trace-list__node" aria-hidden="true" />
          <div>
            <strong>{event.label}</strong>
            <p>{event.detail}</p>
            <small>{DATE_FORMAT.format(new Date(event.at))} · {event.actor}</small>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Pagination({ page, totalPages, total, onChange }) {
  if (totalPages <= 1) {
    return <span className="ev-pagination__summary">{total} registros</span>;
  }
  return (
    <nav aria-label="Paginação dos equipamentos" className="ev-pagination">
      <span className="ev-pagination__summary">{total} registros</span>
      <div>
        <button aria-label="Página anterior" disabled={page <= 1} onClick={() => onChange(page - 1)} type="button">
          <Icon name="chevron" className="is-back" size={16} />
        </button>
        <span><strong>{page}</strong> / {totalPages}</span>
        <button aria-label="Próxima página" disabled={page >= totalPages} onClick={() => onChange(page + 1)} type="button">
          <Icon name="chevron" size={16} />
        </button>
      </div>
    </nav>
  );
}

// A página do harness mantém o hook junto aos componentes utilitários para uma API única entre conceitos.
// eslint-disable-next-line react-refresh/only-export-components
export function usePagedItems(items, pageSize) {
  const [page, setPage] = useState(1);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  useEffect(() => {
    setPage(1);
  }, [items, pageSize]);

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  return { page, totalPages, pageItems, setPage, total };
}
