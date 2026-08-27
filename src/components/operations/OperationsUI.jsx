import { Children, cloneElement, createElement, isValidElement, useEffect, useId, useRef } from "react";
import "./OperationsUI.css";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function syncModalLayers() {
  if (typeof document === "undefined") return;
  const layers = [...document.querySelectorAll("[data-so-modal-layer='true']")];
  const topLayer = layers.at(-1);

  layers.forEach((layer) => {
    const isTopLayer = layer === topLayer;
    const dialog = layer.querySelector("[role='dialog'], [role='alertdialog']");
    if (isTopLayer) layer.removeAttribute("aria-hidden");
    else layer.setAttribute("aria-hidden", "true");
    if (dialog) dialog.setAttribute("aria-modal", isTopLayer ? "true" : "false");
  });
}

const ICON_PATHS = {
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></>,
  filter: <><path d="M4 6h16M7 12h10M10 18h4" /></>,
  close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  chevronLeft: <><path d="m14.5 6-6 6 6 6" /></>,
  chevronRight: <><path d="m9.5 6 6 6-6 6" /></>,
  chevronDown: <><path d="m6 9 6 6 6-6" /></>,
  eye: <><path d="M3 12s3.4-6 9-6 9 6 9 6-3.4 6-9 6-9-6-9-6Z" /><circle cx="12" cy="12" r="2.5" /></>,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M18 7l-1 13H7L6 7M10 11v5M14 11v5" /></>,
  warning: <><path d="M12 3 2.8 19a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L12 3Z" /><path d="M12 9v5M12 18h.01" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.6 2.6L16 9" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4.5 21a7.5 7.5 0 0 1 15 0" /></>,
  receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
  money: <><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5h-5a2 2 0 0 0 0 4h3a2 2 0 0 1 0 4h-5M12 6.5v11" /></>,
  file: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></>,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.1 8.5A7 7 0 0 1 18.5 7M17.9 15.5A7 7 0 0 1 5.5 17" /></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></>,
  dots: <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></>,
};

const STATUS_TONES = {
  aberta: "info",
  negociada: "info",
  parcialmente_paga: "warning",
  pendente: "warning",
  vencida: "danger",
  excluida: "danger",
  excluído: "danger",
  erro: "danger",
  quitada: "success",
  paga: "success",
  concluida: "success",
  concluído: "success",
  ativa: "success",
};

function classes(...values) {
  return values.filter(Boolean).join(" ");
}

function renderIcon(icon, title) {
  if (!icon) return null;
  return typeof icon === "string" ? <OperationIcon name={icon} title={title} /> : icon;
}

function headingTag(level, fallback = 2) {
  const normalized = Number(level);
  return `h${normalized >= 1 && normalized <= 6 ? normalized : fallback}`;
}

function statusTone(status, explicitTone) {
  if (explicitTone) return explicitTone;
  return STATUS_TONES[String(status || "").trim().toLocaleLowerCase("pt-BR")] || "neutral";
}

function rowKey(row, index, getRowKey) {
  if (getRowKey) return getRowKey(row, index);
  return row?.id ?? row?.key ?? index;
}

export function OperationIcon({ name = "file", size = 18, className = "", title = "", strokeWidth = 1.8 }) {
  return (
    <svg
      className={classes("so-icon", className)}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : "true"}
      aria-label={title || undefined}
      role={title ? "img" : undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {ICON_PATHS[name] || ICON_PATHS.file}
    </svg>
  );
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  leading,
  actions,
  children,
  className = "",
  compact = false,
  headingLevel = 1,
  titleId,
  ...props
}) {
  const generatedTitleId = useId();
  const resolvedTitleId = titleId || generatedTitleId;
  const heading = title
    ? createElement(headingTag(headingLevel, 1), { id: resolvedTitleId }, title)
    : null;

  return (
    <header
      className={classes("so-page-header", compact && "so-page-header--compact", className)}
      aria-labelledby={title ? resolvedTitleId : undefined}
      {...props}
    >
      <div className="so-page-header__main">
        {leading ? <div className="so-page-header__leading">{leading}</div> : null}
        <div className="so-page-header__identity">
          {eyebrow ? <span className="so-page-header__eyebrow">{eyebrow}</span> : null}
          {heading}
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="so-page-header__actions">{actions}</div> : null}
      {children ? <div className="so-page-header__extra">{children}</div> : null}
    </header>
  );
}

export function PageIntro({
  eyebrow,
  title,
  description,
  meta,
  actions,
  children,
  className = "",
  headingLevel = 2,
  ariaLabel,
  ...props
}) {
  const titleId = useId();
  const heading = title
    ? createElement(headingTag(headingLevel), { id: titleId }, title)
    : null;

  return (
    <section
      className={classes("so-page-intro", className)}
      aria-labelledby={title ? titleId : undefined}
      aria-label={!title ? ariaLabel : undefined}
      {...props}
    >
      <div className="so-page-intro__copy">
        {eyebrow ? <span className="so-page-intro__eyebrow">{eyebrow}</span> : null}
        {heading}
        {description ? <p>{description}</p> : null}
        {meta ? <div className="so-page-intro__meta">{meta}</div> : null}
      </div>
      {actions ? <div className="so-page-intro__actions">{actions}</div> : null}
      {children ? <div className="so-page-intro__content">{children}</div> : null}
    </section>
  );
}

export function Section({
  as: Element = "section",
  title,
  description,
  actions,
  children,
  className = "",
  variant = "plain",
  headingLevel = 2,
  ariaLabel,
  ...props
}) {
  const titleId = useId();
  const heading = title
    ? createElement(headingTag(headingLevel), { id: titleId }, title)
    : null;

  return (
    <Element
      className={classes("so-section", `so-section--${variant}`, className)}
      aria-labelledby={title ? titleId : undefined}
      aria-label={!title ? ariaLabel : undefined}
      {...props}
    >
      {title || description || actions ? (
        <header className="so-section__header">
          <div>
            {heading}
            {description ? <p>{description}</p> : null}
          </div>
          {actions ? <div className="so-section__actions">{actions}</div> : null}
        </header>
      ) : null}
      <div className="so-section__content">{children}</div>
    </Element>
  );
}

export function Button({
  type = "button",
  variant = "secondary",
  size = "md",
  leadingIcon,
  trailingIcon,
  loading = false,
  loadingLabel = "Processando…",
  fullWidth = false,
  className = "",
  disabled = false,
  children,
  ...props
}) {
  return (
    <button
      type={type}
      className={classes(
        "so-button",
        `so-button--${variant}`,
        `so-button--${size}`,
        fullWidth && "so-button--full",
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <span className="so-button__spinner" aria-hidden="true" /> : renderIcon(leadingIcon)}
      <span className="so-button__label">{loading ? loadingLabel : children}</span>
      {!loading ? renderIcon(trailingIcon) : null}
    </button>
  );
}

export function IconButton({
  type = "button",
  icon,
  children,
  variant = "ghost",
  size = "md",
  className = "",
  label,
  title,
  ...props
}) {
  const accessibleLabel = label || props["aria-label"];

  return (
    <button
      type={type}
      className={classes("so-icon-button", `so-icon-button--${variant}`, `so-icon-button--${size}`, className)}
      aria-label={accessibleLabel}
      title={title || accessibleLabel}
      {...props}
    >
      {renderIcon(icon) || children}
    </button>
  );
}

export function Field({
  id,
  label,
  required = false,
  hint,
  error,
  labelAction,
  children,
  className = "",
}) {
  const generatedId = useId();
  const childItems = Children.toArray(children);
  const controlIndex = childItems.findIndex((child) => {
    if (!isValidElement(child)) return false;
    if (childItems.length === 1) return true;
    return typeof child.type === "string" && ["input", "select", "textarea"].includes(child.type);
  });
  const sourceControl = controlIndex >= 0 ? childItems[controlIndex] : null;
  const childId = sourceControl?.props.id;
  const controlId = id || childId || generatedId;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [
    sourceControl?.props["aria-describedby"],
    hintId,
    errorId,
  ].filter(Boolean).join(" ") || undefined;

  const renderedChildren = childItems.map((child, index) => index === controlIndex
    ? cloneElement(child, {
        id: controlId,
        className: classes("so-field__control", child.props.className),
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : child.props["aria-invalid"],
        "aria-required": required ? true : child.props["aria-required"],
      })
    : child);
  const control = renderedChildren.length === 1 ? renderedChildren[0] : renderedChildren;

  return (
    <div className={classes("so-field", error && "so-field--error", className)}>
      <div className="so-field__label-row">
        <label htmlFor={controlId}>
          {label}
          {required ? <><span className="so-field__required" aria-hidden="true"> *</span><span className="so-visually-hidden"> obrigatório</span></> : null}
        </label>
        {labelAction ? <span className="so-field__label-action">{labelAction}</span> : null}
      </div>
      {control}
      {hint ? <span className="so-field__hint" id={hintId}>{hint}</span> : null}
      {error ? <span className="so-field__error" id={errorId} role="alert">{error}</span> : null}
    </div>
  );
}

export function SelectField({
  id,
  label,
  required = false,
  hint,
  error,
  labelAction,
  options = [],
  placeholder,
  placeholderDisabled = false,
  children,
  className = "",
  selectClassName = "",
  ...selectProps
}) {
  const generatedId = useId();
  const controlId = id || generatedId;

  return (
    <Field
      id={controlId}
      label={label}
      required={required}
      hint={hint}
      error={error}
      labelAction={labelAction}
      className={className}
    >
      <select className={selectClassName} required={required || undefined} {...selectProps}>
        {placeholder !== undefined ? <option value="" disabled={placeholderDisabled}>{placeholder}</option> : null}
        {children || options.map((option, index) => {
          const normalized = option && typeof option === "object"
            ? option
            : { value: option, label: option };
          return (
            <option
              key={`${String(normalized.value)}-${index}`}
              value={normalized.value}
              disabled={normalized.disabled}
            >
              {normalized.label ?? normalized.value}
            </option>
          );
        })}
      </select>
    </Field>
  );
}

export function Modal({
  open = true,
  title,
  subtitle,
  children,
  footer,
  onClose,
  blocked = false,
  closeOnBackdrop = true,
  closeOnEscape = true,
  showClose = true,
  closeLabel = "Fechar",
  size = "md",
  className = "",
  overlayClassName = "",
  initialFocusRef,
  ariaLabel,
  role = "dialog",
}) {
  const dialogRef = useRef(null);
  const previousFocusRef = useRef(null);
  const titleId = useId();
  const subtitleId = useId();

  useEffect(() => {
    if (!open) return undefined;

    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    syncModalLayers();

    const animationFrame = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      const preferredTarget = initialFocusRef?.current
        || dialog.querySelector("[data-so-autofocus='true'], [autofocus]")
        || dialog.querySelector(`.so-modal__body ${FOCUSABLE_SELECTOR}`)
        || dialog.querySelector(`.so-modal__footer ${FOCUSABLE_SELECTOR}`)
        || dialog.querySelector(FOCUSABLE_SELECTOR)
        || dialog;
      preferredTarget.focus({ preventScroll: true });
    });

    return () => {
      window.cancelAnimationFrame(animationFrame);
      const previousFocus = previousFocusRef.current;
      window.requestAnimationFrame(() => {
        syncModalLayers();
        if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      });
    };
  }, [initialFocusRef, open]);

  if (!open) return null;

  const close = (event) => {
    if (!blocked) onClose?.(event);
  };

  const handleBackdrop = (event) => {
    if (event.target === event.currentTarget && closeOnBackdrop) close(event);
  };

  const handleKeyDown = (event) => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (event.key === "Escape") {
      event.stopPropagation();
      if (closeOnEscape && !blocked) {
        event.preventDefault();
        onClose?.(event);
      }
      return;
    }

    if (event.key !== "Tab") return;

    const focusable = [...dialog.querySelectorAll(FOCUSABLE_SELECTOR)]
      .filter((element) => element.getAttribute("aria-hidden") !== "true");

    if (!focusable.length) {
      event.preventDefault();
      dialog.focus({ preventScroll: true });
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && (active === first || !dialog.contains(active))) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  };

  return (
    <div
      className={classes("so-modal-overlay", overlayClassName)}
      onMouseDown={handleBackdrop}
      data-so-modal-layer="true"
    >
      <section
        ref={dialogRef}
        className={classes("so-modal", `so-modal--${size}`, className)}
        role={role}
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={subtitle ? subtitleId : undefined}
        aria-label={!title ? ariaLabel : undefined}
        aria-busy={blocked || undefined}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <header className="so-modal__header">
          <div>
            {title ? <h2 id={titleId}>{title}</h2> : null}
            {subtitle ? <p id={subtitleId}>{subtitle}</p> : null}
          </div>
          {showClose && onClose ? (
            <IconButton
              icon="close"
              label={closeLabel}
              className="so-modal__close"
              onClick={close}
              disabled={blocked}
            />
          ) : null}
        </header>
        <div className="so-modal__body">{children}</div>
        {footer !== undefined && footer !== null ? <footer className="so-modal__footer">{footer}</footer> : null}
      </section>
    </div>
  );
}

export function StatusBadge({ status, tone, label, children, dot = true, className = "", ...props }) {
  const resolvedTone = statusTone(status, tone);
  const content = children ?? label ?? status;

  return (
    <span className={classes("so-status-badge", `so-status-badge--${resolvedTone}`, className)} {...props}>
      {dot ? <span className="so-status-badge__dot" aria-hidden="true" /> : null}
      <span>{content}</span>
    </span>
  );
}

export function KpiGrid({ children, className = "", ariaLabel = "Indicadores", ...props }) {
  return (
    <section className={classes("so-kpi-grid", className)} aria-label={ariaLabel} role="list" {...props}>
      {children}
    </section>
  );
}

export function KpiCard({
  label,
  value,
  helper,
  icon,
  tone = "neutral",
  emphasis = false,
  className = "",
  ...props
}) {
  return (
    <article
      className={classes("so-kpi-card", `so-kpi-card--${tone}`, emphasis && "so-kpi-card--emphasis", className)}
      role="listitem"
      {...props}
    >
      <div className="so-kpi-card__label">
        {icon ? <span className="so-kpi-card__icon" aria-hidden="true">{renderIcon(icon)}</span> : null}
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      {helper ? <small>{helper}</small> : null}
    </article>
  );
}

export function Skeleton({
  variant = "table",
  lines = 4,
  label = "Carregando conteúdo",
  className = "",
}) {
  const resolvedVariant = String(variant || "table").trim().toLowerCase() || "table";
  const resolvedLines = Math.max(1, Math.floor(Number(lines) || 4));

  return (
    <div
      className={classes("so-skeleton", `so-skeleton--${resolvedVariant}`, className)}
      aria-busy="true"
      role="status"
    >
      <span className="so-visually-hidden">{label}</span>
      <div className="so-skeleton-block" aria-hidden="true">
        {Array.from({ length: resolvedLines }, (_, index) => (
          <span
            className={classes("so-skeleton-line", `so-skeleton-line--${resolvedVariant}`)}
            key={`${resolvedVariant}-${index}`}
          />
        ))}
      </div>
    </div>
  );
}

export function DataTable({
  columns = [],
  rows = [],
  getRowKey,
  onRowClick,
  rowClassName,
  caption,
  captionVisible = false,
  ariaLabel,
  empty = "Nenhum registro encontrado.",
  className = "",
  tableClassName = "",
}) {
  const handleRowClick = (event, row, index) => {
    if (!onRowClick || event.target.closest?.("button, a, input, select, textarea")) return;
    onRowClick(row, index, event);
  };

  const handleRowKeyDown = (event, row, index) => {
    if (!onRowClick || (event.key !== "Enter" && event.key !== " ")) return;
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    onRowClick(row, index, event);
  };

  return (
    <div className={classes("so-data-table-shell", className)}>
      <table className={classes("so-data-table", tableClassName)} aria-label={!caption ? ariaLabel : undefined}>
        {caption ? <caption className={captionVisible ? "so-data-table__caption" : "so-visually-hidden"}>{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((column, index) => (
              <th
                key={column.id || column.key || index}
                scope="col"
                className={classes(column.headerClassName, column.hideBelow && `so-col-hide-${column.hideBelow}`)}
                style={column.width ? { width: column.width } : undefined}
                data-align={column.align || undefined}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row, index) => {
            const resolvedRowClass = typeof rowClassName === "function" ? rowClassName(row, index) : rowClassName;
            return (
              <tr
                key={rowKey(row, index, getRowKey)}
                className={classes(onRowClick && "so-data-table__row--interactive", resolvedRowClass)}
                tabIndex={onRowClick ? 0 : undefined}
                onClick={onRowClick ? (event) => handleRowClick(event, row, index) : undefined}
                onKeyDown={onRowClick ? (event) => handleRowKeyDown(event, row, index) : undefined}
              >
                {columns.map((column, columnIndex) => {
                  const key = column.id || column.key || columnIndex;
                  const value = column.render
                    ? column.render(row, index)
                    : row?.[column.accessor || column.key];
                  return (
                    <td
                      key={key}
                      className={classes(column.className, column.hideBelow && `so-col-hide-${column.hideBelow}`)}
                      data-align={column.align || undefined}
                      data-numeric={column.numeric || undefined}
                    >
                      {value}
                    </td>
                  );
                })}
              </tr>
            );
          }) : (
            <tr>
              <td className="so-data-table__empty" colSpan={Math.max(columns.length, 1)}>{empty}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function MobileRecordCard({
  title,
  subtitle,
  badge,
  highlightLabel,
  highlightValue,
  details = [],
  actions,
  children,
  onOpen,
  openLabel,
  tone = "neutral",
  className = "",
  ...props
}) {
  return (
    <article className={classes("so-mobile-record-card", `so-mobile-record-card--${tone}`, onOpen && "so-mobile-record-card--interactive", className)} {...props}>
      {onOpen ? (
        <button
          type="button"
          className="so-mobile-record-card__hit-area"
          onClick={onOpen}
          aria-label={openLabel || `Abrir ${String(title || "registro")}`}
        />
      ) : null}
      <header className="so-mobile-record-card__header">
        <div>
          <strong>{title}</strong>
          {subtitle ? <span>{subtitle}</span> : null}
        </div>
        {badge ? <div className="so-mobile-record-card__badge">{badge}</div> : null}
      </header>
      {highlightLabel || highlightValue ? (
        <div className="so-mobile-record-card__highlight">
          {highlightLabel ? <span>{highlightLabel}</span> : null}
          {highlightValue ? <strong>{highlightValue}</strong> : null}
        </div>
      ) : null}
      {details.length ? (
        <dl className="so-mobile-record-card__details">
          {details.map((detail, index) => (
            <div key={detail.id || detail.label || index}>
              <dt>{detail.label}</dt>
              <dd className={detail.numeric ? "so-numeric" : undefined}>{detail.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {children ? <div className="so-mobile-record-card__content">{children}</div> : null}
      {actions ? <div className="so-mobile-record-card__actions">{actions}</div> : null}
    </article>
  );
}

export function FilterBar({
  title = "Pesquisar e filtrar",
  description,
  primary,
  secondary,
  chips,
  actions,
  children,
  activeCount = 0,
  secondaryOpen = false,
  onSecondaryToggle,
  secondaryLabel = "Mais filtros",
  onClear,
  clearLabel = "Limpar filtros",
  onApply,
  applyLabel = "Aplicar filtros",
  className = "",
  ariaLabel = "Filtros",
}) {
  const secondaryId = useId();
  const secondaryTitleId = useId();
  const secondaryPanelRef = useRef(null);
  const previousSecondaryFocusRef = useRef(null);
  const hasFooter = actions || onClear || onApply;

  useEffect(() => {
    if (!secondaryOpen) return undefined;
    previousSecondaryFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    const animationFrame = window.requestAnimationFrame(() => {
      const panel = secondaryPanelRef.current;
      const preferredTarget = panel?.querySelector(FOCUSABLE_SELECTOR) || panel;
      preferredTarget?.focus({ preventScroll: true });
    });

    return () => {
      window.cancelAnimationFrame(animationFrame);
      const previousFocus = previousSecondaryFocusRef.current;
      if (previousFocus?.isConnected) {
        window.requestAnimationFrame(() => previousFocus.focus({ preventScroll: true }));
      }
    };
  }, [secondaryOpen]);

  const handleSecondaryKeyDown = (event) => {
    if (!secondaryOpen) return;
    const panel = secondaryPanelRef.current;
    if (!panel) return;

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onSecondaryToggle?.(false);
      return;
    }

    if (event.key !== "Tab") return;
    const focusable = [...panel.querySelectorAll(FOCUSABLE_SELECTOR)]
      .filter((element) => element.getAttribute("aria-hidden") !== "true");
    if (!focusable.length) {
      event.preventDefault();
      panel.focus({ preventScroll: true });
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !panel.contains(active))) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  };

  return (
    <section className={classes("so-filter-bar", className)} aria-label={ariaLabel}>
      <header className="so-filter-bar__header">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {onClear ? <Button variant="ghost" size="sm" onClick={onClear}>{clearLabel}</Button> : null}
      </header>
      <div className="so-filter-bar__primary">
        {primary || children}
        {secondary && onSecondaryToggle ? (
          <Button
            variant="secondary"
            className="so-filter-bar__toggle"
            leadingIcon="filter"
            aria-expanded={secondaryOpen}
            aria-controls={secondaryId}
            onClick={() => onSecondaryToggle(!secondaryOpen)}
          >
            {secondaryLabel}{activeCount ? ` (${activeCount})` : ""}
          </Button>
        ) : null}
      </div>
      {secondary ? (
        <div
          ref={secondaryPanelRef}
          id={secondaryId}
          className={classes("so-filter-bar__secondary", secondaryOpen && "is-open")}
          role={secondaryOpen ? "dialog" : undefined}
          aria-modal={secondaryOpen || undefined}
          aria-labelledby={secondaryOpen ? secondaryTitleId : undefined}
          tabIndex={secondaryOpen ? -1 : undefined}
          onKeyDown={handleSecondaryKeyDown}
        >
          <div className="so-filter-bar__secondary-header">
            <div>
              <strong id={secondaryTitleId}>{secondaryLabel}</strong>
              <span>{activeCount} ativo(s)</span>
            </div>
            {onSecondaryToggle ? <IconButton icon="close" label="Fechar filtros" onClick={() => onSecondaryToggle(false)} /> : null}
          </div>
          <div className="so-filter-bar__secondary-fields">{secondary}</div>
          {hasFooter ? (
            <footer className="so-filter-bar__footer">
              {actions || <>
                {onClear ? <Button variant="secondary" onClick={onClear}>{clearLabel}</Button> : null}
                {onApply ? <Button variant="primary" onClick={onApply}>{applyLabel}</Button> : null}
              </>}
            </footer>
          ) : null}
        </div>
      ) : null}
      {chips ? <div className="so-filter-bar__chips" aria-label="Filtros ativos">{chips}</div> : null}
    </section>
  );
}

export function EmptyState({
  icon = "search",
  title = "Nenhum registro encontrado",
  description,
  action,
  children,
  className = "",
  ...props
}) {
  return (
    <section className={classes("so-empty-state", className)} role="status" aria-live="polite" {...props}>
      {icon ? <span className="so-empty-state__icon" aria-hidden="true">{renderIcon(icon)}</span> : null}
      <div>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
        {children}
      </div>
      {action ? <div className="so-empty-state__action">{action}</div> : null}
    </section>
  );
}

export function FeedbackBanner({
  tone = "info",
  title,
  children,
  action,
  onDismiss,
  dismissLabel = "Fechar aviso",
  icon,
  className = "",
  role,
  ...props
}) {
  const iconName = icon || ({ success: "check", warning: "warning", danger: "warning", error: "warning", info: "info" }[tone] || "info");
  const resolvedTone = tone === "error" ? "danger" : tone;
  const resolvedRole = role || (resolvedTone === "danger" ? "alert" : "status");

  return (
    <div className={classes("so-feedback-banner", `so-feedback-banner--${resolvedTone}`, className)} role={resolvedRole} {...props}>
      <span className="so-feedback-banner__icon" aria-hidden="true">{renderIcon(iconName)}</span>
      <div className="so-feedback-banner__content">
        {title ? <strong>{title}</strong> : null}
        {children ? <div>{children}</div> : null}
      </div>
      {action ? <div className="so-feedback-banner__action">{action}</div> : null}
      {onDismiss ? <IconButton icon="close" label={dismissLabel} size="sm" onClick={onDismiss} /> : null}
    </div>
  );
}

export function Pagination({
  page = 1,
  totalPages = 1,
  totalItems,
  onPageChange,
  previousLabel = "Anterior",
  nextLabel = "Próxima",
  itemLabel = "registro(s)",
  summary,
  className = "",
  disabled = false,
}) {
  const normalizedTotal = Math.max(1, Number(totalPages) || 1);
  const normalizedPage = Math.min(normalizedTotal, Math.max(1, Number(page) || 1));
  const status = summary || `Página ${normalizedPage} de ${normalizedTotal}${totalItems === undefined ? "" : ` · ${totalItems} ${itemLabel}`}`;

  return (
    <nav className={classes("so-pagination", className)} aria-label="Paginação">
      <span className="so-pagination__status" aria-live="polite" aria-atomic="true">{status}</span>
      <div className="so-pagination__actions">
        <Button
          variant="secondary"
          size="sm"
          leadingIcon="chevronLeft"
          disabled={disabled || normalizedPage <= 1}
          onClick={() => onPageChange?.(normalizedPage - 1)}
        >
          {previousLabel}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          trailingIcon="chevronRight"
          disabled={disabled || normalizedPage >= normalizedTotal}
          onClick={() => onPageChange?.(normalizedPage + 1)}
        >
          {nextLabel}
        </Button>
      </div>
    </nav>
  );
}

export function ActionBar({
  children,
  primary,
  secondary,
  align = "end",
  sticky = false,
  className = "",
  ...props
}) {
  return (
    <div className={classes("so-action-bar", `so-action-bar--${align}`, sticky && "so-action-bar--sticky", className)} {...props}>
      {secondary ? <div className="so-action-bar__secondary">{secondary}</div> : null}
      {children ? <div className="so-action-bar__content">{children}</div> : null}
      {primary ? <div className="so-action-bar__primary">{primary}</div> : null}
    </div>
  );
}

export function FloatingActionSafeArea({ children, className = "", sticky = false, ...props }) {
  return (
    <div className={classes("so-floating-action-safe-area", sticky && "so-floating-action-safe-area--sticky", className)} {...props}>
      {children}
    </div>
  );
}
