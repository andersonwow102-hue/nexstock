import { CATEGORIES, formatNp } from "./fixtures.js";

export { CATEGORIES, createPatrimonyFixture, formatNp } from "./fixtures.js";

export const PATRIMONY_FILTERS = Object.freeze([
  { value: "all", label: "Todos" },
  { value: "np", label: "NP" },
  { value: "legacy", label: "Legado" },
  { value: "missing", label: "Sem patrimônio" },
  { value: "non_asset", label: "Não patrimoniável" },
]);

function pad(value, size) {
  return String(value).padStart(size, "0");
}

export function inventorySummary(items) {
  return items.reduce((summary, item) => {
    const eligible = item.eligibility === "eligible";
    const withPatrimony = Boolean(item.patrimonyCode);
    summary.total += 1;
    if (eligible) summary.eligible += 1;
    if (withPatrimony) summary.withPatrimony += 1;
    if (eligible && withPatrimony) summary.eligibleWithPatrimony += 1;
    if (eligible && !withPatrimony) summary.eligibleWithoutPatrimony += 1;
    if (eligible && !withPatrimony && item.readiness === "ready") summary.ready += 1;
    if (eligible && !withPatrimony && item.readiness === "review") summary.review += 1;
    if (item.patrimonyKind === "legacy") summary.legacy += 1;
    if (item.patrimonyKind === "np") summary.np += 1;
    if (item.patrimonyKind === "np" && item.deploymentState === "etiqueta_pendente") summary.npEmitted += 1;
    if (item.patrimonyKind === "np" && item.deploymentState === "aplicado") summary.npApplied += 1;
    if (item.patrimonyKind === "np" && item.deploymentState === "conferido") summary.npVerified += 1;
    if (item.eligibility === "non_asset") summary.nonPatrimonial += 1;
    return summary;
  }, {
    total: 0,
    eligible: 0,
    withPatrimony: 0,
    eligibleWithPatrimony: 0,
    eligibleWithoutPatrimony: 0,
    ready: 0,
    review: 0,
    legacy: 0,
    np: 0,
    npEmitted: 0,
    npApplied: 0,
    npVerified: 0,
    nonPatrimonial: 0,
  });
}

export function patrimonyClass(item) {
  if (item.patrimonyKind === "np") return "np";
  if (item.patrimonyKind === "legacy") return "legacy";
  if (item.patrimonyKind === "non_asset") return "non_asset";
  return "missing";
}

function normalizeSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

export function filterInventory(items, filters = {}, query = "") {
  const needle = normalizeSearch(query);
  return items.filter((item) => {
    if (filters.category && item.category !== filters.category) return false;
    if (filters.patrimony && filters.patrimony !== "all" && patrimonyClass(item) !== filters.patrimony) return false;
    if (filters.readiness && filters.readiness !== "all" && item.readiness !== filters.readiness) return false;
    if (!needle) return true;
    const haystack = normalizeSearch([
      item.name,
      item.category,
      item.location,
      item.patrimonyCode,
      item.technicalId,
      item.batchId,
    ].join(" "));
    return haystack.includes(needle);
  });
}

export function nextNpNumber(items) {
  const used = items
    .map((item) => /^NP-(\d{6})$/.exec(item.patrimonyCode || ""))
    .filter(Boolean)
    .map((match) => Number(match[1]));
  return used.length ? Math.max(...used) + 1 : 1;
}

function exclusionReason(item) {
  if (item.eligibility === "non_asset") return "nonPatrimonial";
  if (item.eligibility === "legacy") return "legacy";
  if (item.patrimonyCode) return "alreadyCoded";
  if (item.readiness === "review") return "review";
  return "other";
}

export function prepareBatchPreview(items, filters = {}, query = "", limit = 24) {
  const scope = filterInventory(items, filters, query);
  const candidates = scope.filter((item) => item.eligibility === "eligible" && !item.patrimonyCode && item.readiness === "ready");
  const included = candidates.slice(0, Math.max(1, Number(limit) || 24));
  const includedIds = new Set(included.map((item) => item.id));
  const excluded = scope.filter((item) => !includedIds.has(item.id));
  const excludedCounts = excluded.reduce((counts, item) => {
    const reason = candidates.includes(item) ? "beyondLimit" : exclusionReason(item);
    counts[reason] += 1;
    return counts;
  }, { alreadyCoded: 0, review: 0, legacy: 0, nonPatrimonial: 0, beyondLimit: 0, other: 0 });
  const rangeStart = nextNpNumber(items);
  const rangeEnd = included.length ? rangeStart + included.length - 1 : rangeStart;
  const signature = `${included.map((item) => item.id).join(".")}|${rangeStart}|${rangeEnd}`;
  return {
    scopeCount: scope.length,
    included,
    excluded,
    excludedCounts,
    rangeStart,
    rangeEnd,
    rangeLabel: included.length ? `${formatNp(rangeStart)} — ${formatNp(rangeEnd)}` : "Sem faixa disponível",
    signature,
  };
}

export function generateSimulatedBatch({ items, batches }, preview) {
  const existing = batches.find((batch) => batch.signature === preview.signature);
  if (existing) return { items, batches, batch: existing, reused: true };
  if (!preview.included.length) return { items, batches, batch: null, reused: false };

  const assignments = new Map(preview.included.map((item, index) => [item.id, formatNp(preview.rangeStart + index)]));
  const batchId = `PAT-202609-${pad(batches.length + 1, 4)}`;
  const nextItems = items.map((item) => assignments.has(item.id) ? {
    ...item,
    patrimonyCode: assignments.get(item.id),
    patrimonyKind: "np",
    readiness: "coded",
    batchId,
    deploymentState: "etiqueta_pendente",
    note: "Código reservado em lote simulado; aguardando aplicação física.",
  } : item);
  const batch = {
    id: batchId,
    signature: preview.signature,
    itemIds: preview.included.map((item) => item.id),
    rangeStart: preview.rangeStart,
    rangeEnd: preview.rangeEnd,
    rangeLabel: preview.rangeLabel,
    status: "labels_pending",
    createdLabel: "01/09/2026 · ensaio local",
  };
  return { items: nextItems, batches: [...batches, batch], batch, reused: false };
}

export function updateBatchStatus(batches, batchId, status) {
  return batches.map((batch) => batch.id === batchId ? { ...batch, status } : batch);
}

function codeComparable(value) {
  return normalizeSearch(value).replace(/[\s_]/g, "-");
}

export function resolveAssetByCode(items, input, allowedIds = null) {
  const raw = codeComparable(input);
  if (!raw) return { status: "invalid", matches: [] };
  const allowed = allowedIds ? new Set(allowedIds) : null;
  const pool = items.filter((item) => item.patrimonyCode && (!allowed || allowed.has(item.id)));
  const exact = pool.filter((item) => codeComparable(item.patrimonyCode) === raw);
  if (exact.length === 1) return { status: "found", item: exact[0], matches: exact };
  if (exact.length > 1) return { status: "ambiguous", matches: exact };

  const digits = raw.replace(/\D/g, "");
  if (![4, 6].includes(digits.length)) return { status: "invalid", matches: [] };
  const matches = pool.filter((item) => item.patrimonyCode.replace(/\D/g, "").endsWith(digits));
  if (matches.length === 1) return { status: "found", item: matches[0], matches };
  return { status: matches.length ? "ambiguous" : "not_found", matches };
}

export function markDeployment(items, itemId, action) {
  let changed = false;
  const nextItems = items.map((item) => {
    if (item.id !== itemId) return item;
    if (action === "apply" && ["aplicado", "conferido"].includes(item.deploymentState)) return item;
    if (action === "verify" && item.deploymentState === "conferido") return item;
    if (action === "verify" && item.deploymentState !== "aplicado") return item;
    changed = true;
    return {
      ...item,
      deploymentState: action === "verify" ? "conferido" : "aplicado",
      note: action === "verify"
        ? "Etiqueta conferida no fluxo local de implantação."
        : "Etiqueta marcada como aplicada no fluxo local de implantação.",
    };
  });
  return { items: nextItems, changed };
}

export function batchProgress(items, batch) {
  if (!batch) return { total: 0, pending: 0, applied: 0, verified: 0, appliedPercent: 0, verifiedPercent: 0 };
  const ids = new Set(batch.itemIds);
  const batchItems = items.filter((item) => ids.has(item.id));
  const applied = batchItems.filter((item) => ["aplicado", "conferido"].includes(item.deploymentState)).length;
  const verified = batchItems.filter((item) => item.deploymentState === "conferido").length;
  const total = batchItems.length;
  return {
    total,
    pending: total - applied,
    applied,
    verified,
    appliedPercent: total ? Math.round((applied / total) * 100) : 0,
    verifiedPercent: total ? Math.round((verified / total) * 100) : 0,
  };
}

export function batchItems(items, batch) {
  if (!batch) return [];
  const ids = new Set(batch.itemIds);
  return items.filter((item) => ids.has(item.id));
}
