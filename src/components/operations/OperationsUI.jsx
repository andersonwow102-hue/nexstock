import { Children, cloneElement, createElement, isValidElement, useEffect, useId, useRef } from "react";
import "./OperationsUI.css";
import { acquireMainScrollLock } from "./mainScrollLock.js";

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
  dashboard: <><rect x="3" y="3" width="7" height="8" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="15" width="7" height="6" rx="1.5" /></>,
  package: <><path d="m21 8-9-5-9 5 9 5 9-5Z" /><path d="m3 8 9 5 9-5M12 13v8M5 10.2v6.6L12 21l7-4.2v-6.6" /></>,
  mapPin: <><path d="M12 21s7-5.1 7-11a7 7 0 1 0-14 0c0 5.9 7 11 7 11Z" /><circle cx="12" cy="10" r="2.4" /></>,
  route: <><circle cx="6" cy="18" r="2" /><circle cx="18" cy="6" r="2" /><path d="M8 18h2a4 4 0 0 0 4-4v-4a4 4 0 0 1 4-4" /></>,
  transfer: <><path d="M5 8h14" /><path d="m15 4 4 4-4 4" /><path d="M19 16H5" /><path d="m9 12-4 4 4 4" /></>,
  key: <><circle cx="7.5" cy="14.5" r="3.5" /><path d="m10 12 9-9M15 7l2 2M17 5l2 2" /></>,
  shield: <><path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6l-7-3Z" /></>,
  shieldKey: <><path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6l-7-3Z" /><circle cx="10" cy="12" r="2" /><path d="m12 12 4 4M14 14l1.5-1.5" /></>,
  history: <><path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  monitor: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>,
  terminal: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m7 9 3 3-3 3M13 15h4" /></>,
  wrench: <><path d="M14.7 6.3a4 4 0 0 0 5 5L11 20a2.1 2.1 0 0 1-3-3l8.7-8.7a4 4 0 0 1-2-2Z" /><path d="m6 18-2 2" /></>,
  download: <><path d="M12 3v12m-5-5 5 5 5-5M5 21h14" /></>,
  upload: <><path d="M12 21V9m-5 5 5-5 5 5M5 3h14" /></>,
  database: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7" /></>,
  logOut: <><path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5M14 8l4 4-4 4M9 12h9" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <><path d="M20.5 15.2A8.5 8.5 0 0 1 8.8 3.5 8.5 8.5 0 1 0 20.5 15.2Z" /></>,
  spreadsheet: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 9v12M15 9v12M9 15h12" /></>,
  pdf: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" /><path d="M14 3v5h5M8 16v-4h2a1.5 1.5 0 0 1 0 3H8m5 1v-4h1.5a2 2 0 0 1 0 4H13m5 0v-4h3" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></>,
  arrowRight: <><path d="M5 12h14m-6-6 6 6-6 6" /></>,
  arrowDown: <><path d="M12 3v14m-6-6 6 6 6-6M5 21h14" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
  externalLink: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></>,
  tv: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="m8 3 4 3 4-3M8 22h8" /></>,
  printer: <><path d="M7 9V3h10v6M7 18H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M7 14h10v7H7zM17 12h.01" /></>,
  tablet: <><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M10 18h4" /></>,
  plug: <><path d="M8 3v5M16 3v5M6 8h12v2a6 6 0 0 1-12 0V8ZM12 16v5" /></>,
  gift: <><path d="M3 9h18v12H3zM2 5h20v4H2zM12 5v16" /><path d="M12 5H8.5A2.5 2.5 0 1 1 11 2.5V5Zm0 0h3.5A2.5 2.5 0 1 0 13 2.5V5Z" /></>,
  tower: <><path d="M9 21h6L13 5h-2L9 21ZM7 21h10M8.5 13h7M10 8h4" /></>,
  banknote: <><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M7 9H6v1M17 15h1v-1" /></>,
  building: <><path d="M4 21V4h10v17M14 9h6v12M8 8h2M8 12h2M8 16h2M17 13h1M17 17h1M2 21h20" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></>,
  activity: <><path d="M3 12h4l2-7 4 14 2-7h6" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  minus: <><path d="M5 12h14" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></>,
  filter: <><path d="M4 6h16M7 12h10M10 18h4" /></>,
  close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  chevronLeft: <><path d="m14.5 6-6 6 6 6" /></>,
  chevronRight: <><path d="m9.5 6 6 6-6 6" /></>,
  chevronDown: <><path d="m6 9 6 6 6-6" /></>,
  eye: <><path d="M3 12s3.4-6 9-6 9 6 9 6-3.4 6-9 6-9-6-9-6Z" /><circle cx="12" cy="12" r="2.5" /></>,
  eyeOff: <><path d="m3 3 18 18" /><path d="M10.6 6.2A9.5 9.5 0 0 1 12 6c5.6 0 9 6 9 6a15.8 15.8 0 0 1-2.2 3.1M6.1 6.1C4.1 7.7 3 12 3 12s3.4 6 9 6a9.4 9.4 0 0 0 3.1-.5" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>,
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
  fileText: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" /><path d="M14 3v5h5M9 13h6M9 17h6M9 9h2" /></>,
  checkCircle: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.6 2.6L16 9" /></>,
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
    const releaseScrollLock = acquireMainScrollLock();
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
      releaseScrollLock();
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
  title,
  description,
  primary,
  secondary,
  chips,
  actions,
  children,
  activeCount = 0,
  secondaryOpen = false,
  onSecondaryToggle,
  secondaryLabel = "Filtros",
  onClear,
  clearLabel = "Limpar filtros",
  onApply,
  applyLabel = "Aplicar filtros",
  className = "",
  ariaLabel = "Filtros",
  ariaHidden,
  inert,
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

    const mobileSheet = window.matchMedia?.("(max-width: 760px)").matches;
    const releaseScrollLock = mobileSheet ? acquireMainScrollLock() : () => {};

    return () => {
      window.cancelAnimationFrame(animationFrame);
      releaseScrollLock();
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
    <section className={classes("so-filter-bar", className)} aria-label={ariaLabel} aria-hidden={ariaHidden} inert={inert}>
      {title || description ? (
        <header className="so-filter-bar__header">
          <div>
            {title ? <h2>{title}</h2> : null}
            {description ? <p>{description}</p> : null}
          </div>
        </header>
      ) : null}
      <div className="so-filter-bar__primary">
        {primary || children}
        {secondary && onSecondaryToggle ? (
          <Button
            variant="secondary"
            className="so-filter-bar__toggle"
            leadingIcon="filter"
            aria-expanded={secondaryOpen}
            aria-controls={secondaryId}
            aria-label={`${secondaryLabel}${activeCount ? `, ${activeCount} ativo${activeCount === 1 ? "" : "s"}` : ""}`}
            onClick={() => onSecondaryToggle(!secondaryOpen)}
          >
            {secondaryLabel}{activeCount ? ` · ${activeCount}` : ""}
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
              <span>{activeCount} ativo{activeCount === 1 ? "" : "s"}</span>
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
