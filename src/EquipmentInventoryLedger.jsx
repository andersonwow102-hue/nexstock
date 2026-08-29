import { useId, useRef } from "react";
import { OperationIcon } from "./components/operations/OperationsUI.jsx";
import "./EquipmentInventoryLedger.css";

function classes(...values) {
  return values.filter(Boolean).join(" ");
}

function display(value) {
  return value === undefined || value === null || value === "" ? "—" : value;
}

function selectedRowOf(rows, selected) {
  if (selected !== undefined && selected !== null) {
    const selectedId = typeof selected === "object" ? selected.id : selected;
    const matchedRow = rows.find((row) => (
      row === selected
      || row.source === selected
      || row.id === selectedId
    ));
    if (matchedRow) return matchedRow;
    if (typeof selected === "object" && ("position" in selected || "state" in selected)) return selected;
  }
  return rows.find((row) => row.selected) || null;
}

function categoryIconOf(iconByCategory, row) {
  if (typeof iconByCategory === "function") return iconByCategory(row.category, row) || "package";
  return iconByCategory?.[row.category] || "package";
}

export default function EquipmentInventoryLedger({
  rows = [],
  selected = null,
  history = [],
  total = 0,
  page = 1,
  totalPages = 1,
  pageSize = 20,
  onPageChange,
  onSelect,
  onCloseDossier,
  onExecuteDossier,
  onOpenDetail,
  onEdit,
  onDelete,
  onOpenHistory,
  dossierSheet = false,
  dossierOpen = false,
  dossierRef,
  iconByCategory = {},
  emptyDescription = "—",
}) {
  const rowButtonRefs = useRef([]);
  const dossierTitleId = useId();
  const selectedRow = selectedRowOf(rows, selected);
  const sheetOpen = Boolean(dossierSheet && dossierOpen && selectedRow);
  const resolvedTotal = Number.isFinite(Number(total)) ? Number(total) : rows.length;
  const resolvedPage = Math.max(1, Number(page) || 1);
  const resolvedTotalPages = Math.max(1, Number(totalPages) || 1);
  const resolvedPageSize = Math.max(1, Number(pageSize) || rows.length || 1);
  const firstVisible = resolvedTotal > 0 ? ((resolvedPage - 1) * resolvedPageSize) + 1 : 0;
  const lastVisible = Math.min(resolvedTotal, firstVisible + rows.length - 1);

  function executeDossier(action) {
    if (typeof action !== "function") return;
    if (typeof onExecuteDossier === "function") onExecuteDossier(action);
    else action();
  }

  function selectRow(row, trigger) {
    onSelect?.(row.source, trigger);
  }

  function handleRowKeyDown(event, index, row) {
    if (event.key === "Enter") {
      event.preventDefault();
      selectRow(row, event.currentTarget);
      return;
    }

    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const direction = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = Math.max(0, Math.min(rows.length - 1, index + direction));
    if (nextIndex === index) return;
    const nextTrigger = rowButtonRefs.current[nextIndex];
    nextTrigger?.focus({ preventScroll: true });
  }

  return (
    <section className="equipment-inventory-ledger" aria-label="Inventário operacional de equipamentos">
      <div className={classes(
        "equipment-inventory-ledger__workspace",
        sheetOpen && "is-detail-open",
      )}>
        <div
          className="equipment-inventory-ledger__ledger"
          role="region"
          aria-label="Livro operacional de equipamentos"
          aria-hidden={sheetOpen ? "true" : undefined}
          inert={sheetOpen ? true : undefined}
        >
          <div className="equipment-inventory-ledger__scroll">
            <div
              className="equipment-inventory-ledger__grid equipment-inventory-ledger__head"
              aria-hidden="true"
            >
              <span>Linha</span>
              <span>Equipamento</span>
              <span>Categoria</span>
              <span>Posição</span>
              <span>Vínculo</span>
              <span>Estado</span>
              <span>Última movimentação</span>
              <span>Ação</span>
            </div>

            <div
              className="equipment-inventory-ledger__rows"
              role="list"
              aria-label={`${resolvedTotal} equipamento${resolvedTotal === 1 ? "" : "s"}`}
            >
              {rows.length === 0 ? (
                <div className="equipment-inventory-ledger__empty">
                  <OperationIcon name="search" size={21} />
                  <strong>Nenhum equipamento neste recorte</strong>
                  <span>{emptyDescription}</span>
                </div>
              ) : rows.map((row, index) => {
                const rowSelected = Boolean(row.selected || selectedRow?.id === row.id);
                const position = row.position || {};
                const state = row.state || {};
                const movement = row.movement || {};
                const primaryAction = row.primaryAction;
                return (
                  <article
                    className={classes(
                      "equipment-inventory-ledger__grid",
                      "equipment-inventory-ledger__row",
                      rowSelected && "is-selected",
                      row.attention && "is-attention",
                    )}
                    key={row.id}
                    role="listitem"
                  >
                    <span className="equipment-inventory-ledger__register" aria-label={`Registro ${display(row.register)}`}>
                      {display(row.register)}
                    </span>

                    <button
                      className="equipment-inventory-ledger__identity"
                      type="button"
                      ref={(node) => { rowButtonRefs.current[index] = node; }}
                      aria-pressed={rowSelected}
                      aria-haspopup={dossierSheet ? "dialog" : undefined}
                      aria-label={`Selecionar ${display(row.name)}`}
                      onClick={(event) => selectRow(row, event.currentTarget)}
                      onKeyDown={(event) => handleRowKeyDown(event, index, row)}
                    >
                      <span className="equipment-inventory-ledger__category-icon" aria-hidden="true">
                        <OperationIcon name={categoryIconOf(iconByCategory, row)} size={18} />
                      </span>
                      <span>
                        <strong>{display(row.name)}</strong>
                        <small>{display(row.identifier)}</small>
                      </span>
                    </button>

                    <span
                      className="equipment-inventory-ledger__category"
                      data-label="Categoria"
                      aria-label={`Categoria: ${display(row.category)}`}
                    >
                      {display(row.category)}
                    </span>

                    <span
                      className="equipment-inventory-ledger__position"
                      data-label="Posição"
                      aria-label={`Posição: ${display(position.label)}${position.detail ? `, ${position.detail}` : ""}`}
                    >
                      <span className="equipment-inventory-ledger__position-icon" aria-hidden="true">
                        <OperationIcon name={position.icon || "package"} size={15} />
                      </span>
                      <span>
                        <strong>{display(position.label)}</strong>
                        {position.detail ? <small>{position.detail}</small> : null}
                      </span>
                    </span>

                    <span
                      className="equipment-inventory-ledger__link"
                      data-label="Vínculo"
                      aria-label={`Vínculo: ${display(row.link)}`}
                    >
                      {display(row.link)}
                    </span>

                    <span
                      className="equipment-inventory-ledger__state"
                      data-label="Estado"
                      aria-label={`Estado: ${display(state.label)}${state.detail ? `, ${state.detail}` : ""}`}
                    >
                      <span className={classes("equipment-inventory-ledger__state-badge", state.className)}>
                        {display(state.label)}
                      </span>
                      {state.detail ? <small>{state.detail}</small> : null}
                    </span>

                    <span
                      className="equipment-inventory-ledger__movement"
                      data-label="Última movimentação"
                      aria-label={`Última movimentação: ${display(movement.label)}, ${display(movement.date)}`}
                    >
                      <strong>{display(movement.label)}</strong>
                      <small>{display(movement.date)}</small>
                    </span>

                    <span className="equipment-inventory-ledger__row-action">
                      {primaryAction ? (
                        <button
                          type="button"
                          disabled={primaryAction.disabled}
                          title={primaryAction.title}
                          aria-label={`${display(primaryAction.label)}: ${display(row.name)}`}
                          onClick={primaryAction.onClick}
                        >
                          {primaryAction.icon ? <OperationIcon name={primaryAction.icon} size={15} /> : null}
                          <span>{display(primaryAction.label)}</span>
                        </button>
                      ) : <span aria-hidden="true">—</span>}
                    </span>
                  </article>
                );
              })}
            </div>
          </div>

          <footer className="equipment-inventory-ledger__pagination">
            <span>
              {resolvedTotal > 0 ? `${firstVisible}–${lastVisible} de ` : ""}
              <strong>{resolvedTotal}</strong> registro{resolvedTotal === 1 ? "" : "s"}
            </span>
            {resolvedTotalPages > 1 ? (
              <nav aria-label="Paginação dos equipamentos">
                <button
                  type="button"
                  aria-label="Página anterior"
                  disabled={resolvedPage <= 1 || typeof onPageChange !== "function"}
                  onClick={() => onPageChange?.(resolvedPage - 1)}
                >
                  <OperationIcon name="chevronLeft" size={16} />
                </button>
                <span><strong>{resolvedPage}</strong> / {resolvedTotalPages}</span>
                <button
                  type="button"
                  aria-label="Próxima página"
                  disabled={resolvedPage >= resolvedTotalPages || typeof onPageChange !== "function"}
                  onClick={() => onPageChange?.(resolvedPage + 1)}
                >
                  <OperationIcon name="chevronRight" size={16} />
                </button>
              </nav>
            ) : null}
          </footer>
        </div>

        {sheetOpen ? (
          <button
            className="equipment-inventory-ledger__backdrop"
            type="button"
            tabIndex={-1}
            aria-label="Fechar dossiê do equipamento"
            onClick={onCloseDossier}
          />
        ) : null}

        <aside
          className={classes(
            "equipment-inventory-ledger__dossier",
            sheetOpen && "is-sheet-open",
          )}
          ref={dossierRef}
          role={dossierSheet ? "dialog" : undefined}
          aria-modal={sheetOpen ? "true" : undefined}
          aria-labelledby={selectedRow ? dossierTitleId : undefined}
          aria-label={selectedRow ? undefined : "Dossiê do equipamento selecionado"}
          aria-hidden={dossierSheet && !sheetOpen ? "true" : undefined}
          inert={dossierSheet && !sheetOpen ? true : undefined}
          tabIndex={dossierSheet ? -1 : undefined}
        >
          {selectedRow ? (
            <>
              <header className="equipment-inventory-ledger__dossier-head">
                <button
                  className="equipment-inventory-ledger__dossier-close"
                  type="button"
                  data-equip-dossier-autofocus="true"
                  onClick={onCloseDossier}
                  aria-label="Fechar dossiê"
                >
                  <OperationIcon name="close" size={17} />
                </button>
                <span className="equipment-inventory-ledger__category-icon" aria-hidden="true">
                  <OperationIcon name={categoryIconOf(iconByCategory, selectedRow)} size={20} />
                </span>
                <div>
                  <span>Dossiê operacional</span>
                  <h2 id={dossierTitleId}>{display(selectedRow.name)}</h2>
                  <p>{display(selectedRow.identifier)} · {display(selectedRow.category)}</p>
                </div>
                <span className={classes(
                  "equipment-inventory-ledger__state-badge",
                  selectedRow.state?.className,
                )}>
                  {display(selectedRow.state?.label)}
                </span>
              </header>

              <div className="equipment-inventory-ledger__dossier-body">
                <section className="equipment-inventory-ledger__current" aria-label="Posição atual">
                  <span>Posição atual</span>
                  <strong>{display(selectedRow.position?.label)}</strong>
                  <small>{display(selectedRow.position?.detail)}</small>
                </section>

                <dl className="equipment-inventory-ledger__facts">
                  <div>
                    <dt>Estado</dt>
                    <dd>{display(selectedRow.state?.label)}</dd>
                  </div>
                  {!selectedRow.manager ? (
                    <div>
                      <dt>Vínculo</dt>
                      <dd>{display(selectedRow.link)}</dd>
                    </div>
                  ) : null}
                  {selectedRow.manager ? (
                    <div>
                      <dt>Gerente</dt>
                      <dd>{selectedRow.manager}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>Responsável</dt>
                    <dd>{display(selectedRow.responsible)}</dd>
                  </div>
                  <div>
                    <dt>Último registro</dt>
                    <dd>{display(selectedRow.movement?.date)}</dd>
                  </div>
                </dl>

                <div className="equipment-inventory-ledger__dossier-actions">
                  {selectedRow.primaryAction ? (
                    <button
                      className="is-primary"
                      type="button"
                      disabled={selectedRow.primaryAction.disabled}
                      title={selectedRow.primaryAction.title}
                      onClick={() => executeDossier(selectedRow.primaryAction.onClick)}
                    >
                      {selectedRow.primaryAction.icon ? (
                        <OperationIcon name={selectedRow.primaryAction.icon} size={17} />
                      ) : null}
                      {display(selectedRow.primaryAction.label)}
                    </button>
                  ) : null}

                  <div className="equipment-inventory-ledger__utilities">
                    {typeof onOpenDetail === "function" && selectedRow.primaryAction?.purpose !== "detail" ? (
                      <button type="button" onClick={() => executeDossier(() => onOpenDetail(selectedRow.source))}>
                        <OperationIcon name="fileText" size={15} />
                        Abrir ficha
                      </button>
                    ) : null}
                    {selectedRow.canEdit && typeof onEdit === "function" ? (
                      <button type="button" onClick={() => executeDossier(() => onEdit(selectedRow.source))}>
                        <OperationIcon name="edit" size={15} />
                        Editar
                      </button>
                    ) : null}
                    {selectedRow.canDelete && typeof onDelete === "function" ? (
                      <button
                        className="is-danger"
                        type="button"
                        onClick={() => executeDossier(() => onDelete(selectedRow.source))}
                      >
                        <OperationIcon name="trash" size={15} />
                        Excluir
                      </button>
                    ) : null}
                  </div>
                </div>

                <section className="equipment-inventory-ledger__trace" aria-labelledby={`${dossierTitleId}-trace`}>
                  <header>
                    <div>
                      <span>Rastro recente</span>
                      <h3 id={`${dossierTitleId}-trace`}>Movimentações</h3>
                    </div>
                    {typeof onOpenHistory === "function" ? (
                      <button
                        type="button"
                        onClick={() => executeDossier(() => onOpenHistory(selectedRow.source))}
                      >
                        Ver histórico
                      </button>
                    ) : null}
                  </header>

                  {history.length > 0 ? (
                    <ol>
                      {history.map((event, index) => (
                        <li key={event.id ?? `${index}-${event.label || "evento"}`}>
                          <span className="equipment-inventory-ledger__trace-node" aria-hidden="true">
                            {event.icon ? <OperationIcon name={event.icon} size={13} /> : null}
                          </span>
                          <span>
                            <strong>{display(event.label)}</strong>
                            {event.detail ? <p>{event.detail}</p> : null}
                            <small>{display(event.date)}</small>
                          </span>
                        </li>
                      ))}
                    </ol>
                  ) : <p className="equipment-inventory-ledger__trace-empty">Nenhuma movimentação registrada.</p>}
                </section>
              </div>
            </>
          ) : (
            <div className="equipment-inventory-ledger__dossier-empty">
              <OperationIcon name="package" size={22} />
              <strong>Selecione um equipamento</strong>
              <span>O dossiê acompanha o registro escolhido no ledger.</span>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
