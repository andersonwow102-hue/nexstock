export const HISTORY_PAGE_SIZE = 35;

export const HISTORY_MODULE_META = Object.freeze({
  equipment: Object.freeze({
    id: "equipment",
    label: "Equipamentos",
    source: "historico_equipamentos",
  }),
  point: Object.freeze({
    id: "point",
    label: "Pontos",
    source: "historico_pontos",
  }),
});

export const HISTORY_EVENT_TYPE_META = Object.freeze({
  cadastro: Object.freeze({ label: "Cadastro", severity: "neutral" }),
  edicao: Object.freeze({ label: "Edição", severity: "neutral" }),
  exclusao: Object.freeze({ label: "Exclusão", severity: "critical" }),
  entrada: Object.freeze({ label: "Entrada", severity: "neutral" }),
  saida: Object.freeze({ label: "Saída", severity: "attention" }),
  conserto: Object.freeze({ label: "Conserto", severity: "attention" }),
  retorno: Object.freeze({ label: "Retorno", severity: "neutral" }),
  defeito: Object.freeze({ label: "Defeito", severity: "attention" }),
  disponivel: Object.freeze({ label: "Disponível", severity: "neutral" }),
  baixa: Object.freeze({ label: "Baixa", severity: "critical" }),
  ponto: Object.freeze({ label: "Enviado ao ponto", severity: "neutral" }),
  envio_gerente: Object.freeze({ label: "Enviado ao gerente", severity: "neutral" }),
  recebimento_gerente: Object.freeze({ label: "Recebido pelo gerente", severity: "neutral" }),
});

const EMPTY_MARKERS = new Set(["", "-", "—", "n/a", "null", "undefined"]);
const SENSITIVE_OBSERVATION = /\b(?:pix|chave\s+pix|nota\s+fiscal|arquivo|anexo|forma\s+(?:de\s+)?pagamento|valor\s+(?:do\s+)?conserto|comprovante)\b|data\s*:\s*image/i;
const SAFE_SUMMARIES = new Map([
  ["equipamento cadastrado", "Equipamento cadastrado"],
  ["dados atualizados", "Dados atualizados"],
  ["item removido", "Item removido"],
  ["ponto cadastrado", "Ponto cadastrado"],
  ["ponto editado", "Ponto editado"],
  ["ponto cadastrado durante inclusao de equipamento", "Ponto cadastrado durante inclusão de equipamento"],
  ["gerente solicitou avaliacao do operador", "Gerente solicitou avaliação do operador"],
  ["administracao solicitou avaliacao do operador", "Administração solicitou avaliação do operador"],
  ["operador aprovou e encaminhou para conserto", "Operador aprovou e encaminhou para conserto"],
  ["administracao confirmou o pagamento do conserto", "Administração confirmou o pagamento do conserto"],
  ["disponibilizar", "Disponibilização registrada"],
]);

function cleanText(value, maximumLength = 240) {
  if (value === null || value === undefined) return null;
  const withoutControls = [...String(value)]
    .map(character => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127 ? " " : character;
    })
    .join("");
  const cleaned = withoutControls
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximumLength);
  return EMPTY_MARKERS.has(cleaned.toLocaleLowerCase("pt-BR")) ? null : cleaned;
}

function searchKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

function isJsonLike(value) {
  const text = String(value || "").trim();
  if (!text || (!text.startsWith("[") && !text.startsWith("{"))) return false;
  try {
    JSON.parse(text);
    return true;
  } catch {
    return /[}\]]$/.test(text) || /"[^"\n]+"\s*:/.test(text);
  }
}

function safeStructuredValue(value) {
  const cleaned = cleanText(value);
  if (!cleaned || isJsonLike(cleaned) || SENSITIVE_OBSERVATION.test(cleaned)) return null;
  return cleaned;
}

function normalizeTimestamp(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const timestamp = cleanText(value, 80);
  return timestamp && !Number.isNaN(new Date(timestamp).getTime()) ? timestamp : null;
}

function safeEventType(value) {
  const type = searchKey(value).replace(/\s+/g, "_");
  return /^[a-z0-9_-]{1,64}$/.test(type) ? type : "unknown";
}

function humanizeEventType(value) {
  const words = String(value || "unknown").replace(/[_-]+/g, " ");
  return words.charAt(0).toLocaleUpperCase("pt-BR") + words.slice(1);
}

function eventMeta(eventType) {
  return HISTORY_EVENT_TYPE_META[eventType] || Object.freeze({
    label: humanizeEventType(eventType),
    severity: "neutral",
  });
}

function splitObservation(value) {
  const observation = String(value || "").trim();
  if (!observation || isJsonLike(observation)) return [];
  return observation
    .split("|")
    .map(segment => cleanText(segment))
    .filter(Boolean);
}

function addDetail(details, key, label, value) {
  if (!value || details.some(detail => detail.key === key && detail.value === value)) return;
  details.push({ key, label, value });
}

/**
 * Interpreta apenas fragmentos com semântica operacional conhecida.
 * O retorno deliberadamente não inclui a observação original nem fragmentos descartados.
 */
export function sanitizeHistoryObservation(value) {
  const result = { summary: null, origin: null, destination: null, details: [] };

  for (const segment of splitObservation(value)) {
    if (SENSITIVE_OBSERVATION.test(segment) || isJsonLike(segment)) continue;

    const normalized = searchKey(segment);
    const knownSummary = SAFE_SUMMARIES.get(normalized);
    if (knownSummary) {
      if (!result.summary) result.summary = knownSummary;
      continue;
    }

    const fieldMatch = segment.match(/^([^:]{2,32}):\s*(.+)$/);
    if (!fieldMatch) continue;
    const field = searchKey(fieldMatch[1]);
    const safeValue = safeStructuredValue(fieldMatch[2]);
    if (!safeValue) continue;

    if (field === "origem") {
      result.origin = safeValue;
      continue;
    }
    if (field === "destino" || field === "enviado para gerente") {
      result.destination = safeValue;
      continue;
    }
    if (field === "status") {
      addDetail(result.details, "status", "Status", safeValue);
      continue;
    }
    if (field === "defeito") {
      addDetail(result.details, "defect", "Defeito", safeValue);
      continue;
    }
    if (field === "assistencia") {
      addDetail(result.details, "service", "Assistência", safeValue);
      continue;
    }
    if (field === "previsao") {
      addDetail(result.details, "forecast", "Previsão", safeValue);
      continue;
    }
    if (field === "data de retirada") {
      addDetail(result.details, "pickup-date", "Data de retirada", safeValue);
    }
  }

  return result;
}

function equipmentTitle(eventType, entityName) {
  const titles = {
    cadastro: `${entityName} cadastrado`,
    edicao: `${entityName} atualizado`,
    exclusao: `${entityName} removido`,
    entrada: `Entrada registrada para ${entityName}`,
    saida: `Saída registrada para ${entityName}`,
    conserto: `Registro de conserto de ${entityName}`,
    retorno: `${entityName} retornou à operação`,
    defeito: `Defeito registrado em ${entityName}`,
    disponivel: `${entityName} disponibilizado`,
    baixa: `${entityName} baixado`,
    ponto: `${entityName} enviado ao ponto`,
    envio_gerente: `${entityName} enviado ao gerente`,
    recebimento_gerente: `${entityName} recebido pelo gerente`,
  };
  return titles[eventType] || `Evento registrado para ${entityName}`;
}

function pointTitle(eventType, entityName) {
  const titles = {
    cadastro: `Ponto ${entityName} cadastrado`,
    edicao: `Cadastro de ${entityName} atualizado`,
  };
  return titles[eventType] || `Evento registrado para ${entityName}`;
}

function quantityDetail(before, after) {
  if (before === null || before === undefined || after === null || after === undefined) return null;
  const numericBefore = Number(before);
  const numericAfter = Number(after);
  if (!Number.isFinite(numericBefore) || !Number.isFinite(numericAfter) || numericBefore === numericAfter) return null;
  return { key: "quantity", label: "Quantidade", value: `${numericBefore} → ${numericAfter}` };
}

function trustedEquipmentActor(record) {
  const name = cleanText(
    record?.executadoPorNomeSnapshot ?? record?.executado_por_nome_snapshot,
    160,
  );
  if (!name) return null;
  const profile = cleanText(
    record?.executadoPorPerfilSnapshot ?? record?.executado_por_perfil_snapshot,
    80,
  );
  if (!profile) return name;
  const profileLabel = profile.charAt(0).toLocaleUpperCase("pt-BR") + profile.slice(1).toLocaleLowerCase("pt-BR");
  return `${name} · ${profileLabel}`;
}

function normalizeEquipmentRecord(record, index) {
  const moduleMeta = HISTORY_MODULE_META.equipment;
  const sourceId = record?.id ?? null;
  const eventType = safeEventType(record?.tipo ?? record?.eventType);
  const meta = eventMeta(eventType);
  const name = cleanText(record?.itemNome ?? record?.item_nome, 160) || "Equipamento sem identificação";
  const category = cleanText(record?.categoria, 120);
  const responsible = cleanText(record?.responsavel, 160);
  const sanitized = sanitizeHistoryObservation(record?.observacao);
  const quantity = quantityDetail(record?.qtdAntes ?? record?.qtd_antes, record?.qtdDepois ?? record?.qtd_depois);
  const details = quantity ? [...sanitized.details, quantity] : [...sanitized.details];
  const timestamp = normalizeTimestamp(record?.timestamp ?? record?.createdAt ?? record?.created_at);
  const destination = sanitized.destination;
  const origin = sanitized.origin;

  return {
    id: `equipment:${sourceId ?? `unidentified-${index}`}`,
    source: moduleMeta.source,
    sourceId,
    module: moduleMeta.id,
    moduleLabel: moduleMeta.label,
    timestamp,
    legacyDate: cleanText(record?.data, 80),
    eventType,
    eventLabel: meta.label,
    title: equipmentTitle(eventType, name),
    entity: {
      id: record?.itemId ?? record?.item_id ?? null,
      name,
      kind: "equipment",
      ...(category ? { category } : {}),
    },
    actor: trustedEquipmentActor(record),
    responsible,
    origin,
    destination,
    context: origin && destination
      ? `${origin} → ${destination}`
      : destination
        ? `Destino: ${destination}`
        : origin
          ? `Origem: ${origin}`
          : null,
    summary: sanitized.summary,
    details,
    severity: meta.severity,
    rawRef: { source: moduleMeta.source, id: sourceId },
  };
}

function normalizePointRecord(record, index) {
  const moduleMeta = HISTORY_MODULE_META.point;
  const sourceId = record?.id ?? null;
  const eventType = safeEventType(record?.tipo ?? record?.eventType);
  const meta = eventMeta(eventType);
  const name = cleanText(record?.nome ?? record?.name, 160) || "Ponto sem identificação";
  const responsible = cleanText(record?.gerente ?? record?.responsavel, 160);
  const sanitized = sanitizeHistoryObservation(record?.observacao);
  const timestamp = normalizeTimestamp(record?.timestamp ?? record?.createdAt ?? record?.created_at);

  return {
    id: `point:${sourceId ?? `unidentified-${index}`}`,
    source: moduleMeta.source,
    sourceId,
    module: moduleMeta.id,
    moduleLabel: moduleMeta.label,
    timestamp,
    legacyDate: cleanText(record?.data, 80),
    eventType,
    eventLabel: meta.label,
    title: pointTitle(eventType, name),
    entity: { id: record?.pontoId ?? record?.ponto_id ?? null, name, kind: "point" },
    actor: null,
    responsible,
    origin: sanitized.origin,
    destination: sanitized.destination,
    context: sanitized.origin && sanitized.destination
      ? `${sanitized.origin} → ${sanitized.destination}`
      : sanitized.destination
        ? `Destino: ${sanitized.destination}`
        : sanitized.origin
          ? `Origem: ${sanitized.origin}`
          : null,
    summary: sanitized.summary,
    details: [...sanitized.details],
    severity: meta.severity,
    rawRef: { source: moduleMeta.source, id: sourceId },
  };
}

function asRecords(value) {
  if (Array.isArray(value)) return value;
  return value === null || value === undefined ? [] : [value];
}

export function normalizeEquipmentHistory(records = []) {
  return asRecords(records).map(normalizeEquipmentRecord);
}

export function normalizePointHistory(records = []) {
  return asRecords(records).map(normalizePointRecord);
}

export function sortHistoryEvents(events = []) {
  return [...events].sort((left, right) => {
    const leftTime = left?.timestamp ? new Date(left.timestamp).getTime() : Number.NaN;
    const rightTime = right?.timestamp ? new Date(right.timestamp).getTime() : Number.NaN;
    const leftValid = Number.isFinite(leftTime);
    const rightValid = Number.isFinite(rightTime);
    if (leftValid && rightValid) return rightTime - leftTime;
    if (leftValid) return -1;
    if (rightValid) return 1;
    return 0;
  });
}

export function normalizeHistoryEvents(input = {}, positionalPointHistory = []) {
  const objectSignature = !Array.isArray(input) && input && typeof input === "object";
  const equipmentHistory = objectSignature ? input.equipmentHistory || [] : input;
  const pointHistory = objectSignature ? input.pointHistory || [] : positionalPointHistory;
  return sortHistoryEvents([
    ...normalizeEquipmentHistory(equipmentHistory),
    ...normalizePointHistory(pointHistory),
  ]);
}

function localDayStart(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function localDayKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function matchesFilter(value, filter) {
  const selected = Array.isArray(filter) ? filter : [filter];
  const active = selected.map(searchKey).filter(entry => entry && entry !== "all" && entry !== "todos");
  return active.length === 0 || active.includes(searchKey(value));
}

function isInsidePeriod(timestamp, period, now) {
  const normalizedPeriod = searchKey(period || "all");
  if (!normalizedPeriod || normalizedPeriod === "all" || normalizedPeriod === "todos") return true;

  const dayCounts = { today: 1, hoje: 1, "7d": 7, "7": 7, "30d": 30, "30": 30 };
  const dayCount = dayCounts[normalizedPeriod];
  if (!dayCount || !timestamp) return false;

  const eventDate = new Date(timestamp);
  const todayStart = localDayStart(now);
  if (Number.isNaN(eventDate.getTime()) || !todayStart) return false;
  const start = new Date(todayStart.getTime());
  start.setDate(start.getDate() - (dayCount - 1));
  const tomorrowStart = new Date(todayStart.getTime());
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  return eventDate >= start && eventDate < tomorrowStart;
}

function historySearchText(event) {
  const safeDetails = Array.isArray(event?.details)
    ? event.details.flatMap(detail => [detail?.label, detail?.value])
    : [];
  return searchKey([
    event?.module,
    event?.moduleLabel,
    event?.eventType,
    event?.eventLabel,
    event?.title,
    event?.entity?.name,
    event?.entity?.category,
    event?.actor,
    event?.responsible,
    event?.origin,
    event?.destination,
    event?.context,
    event?.summary,
    ...safeDetails,
  ].filter(Boolean).join(" "));
}

export function filterHistoryEvents(events = [], filters = {}) {
  const {
    query = "",
    period = "all",
    module = "all",
    eventType = "all",
    now = new Date(),
  } = filters;
  const tokens = searchKey(query).split(" ").filter(Boolean);

  return events.filter(event => {
    if (!matchesFilter(event?.module, module) || !matchesFilter(event?.eventType, eventType)) return false;
    if (!isInsidePeriod(event?.timestamp, period, now)) return false;
    if (tokens.length === 0) return true;
    const haystack = historySearchText(event);
    return tokens.every(token => haystack.includes(token));
  });
}

function formatGroupDate(date, locale) {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function groupHistoryEvents(events = [], options = {}) {
  const { now = new Date(), locale = "pt-BR" } = options;
  const todayKey = localDayKey(now);
  const yesterday = localDayStart(now);
  if (yesterday) yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = localDayKey(yesterday);
  const groups = [];
  const byKey = new Map();

  for (const event of sortHistoryEvents(events)) {
    const date = event?.timestamp ? new Date(event.timestamp) : null;
    const key = date && !Number.isNaN(date.getTime()) ? localDayKey(date) : "unknown";
    let group = byKey.get(key);
    if (!group) {
      const relativeLabel = key === todayKey ? "Hoje" : key === yesterdayKey ? "Ontem" : null;
      const dateLabel = key === "unknown" ? "" : formatGroupDate(date, locale);
      group = {
        key,
        label: key === "unknown" ? "Data indisponível" : relativeLabel || dateLabel,
        dateLabel,
        title: key === "unknown"
          ? "Data indisponível"
          : relativeLabel
            ? `${relativeLabel} · ${dateLabel}`
            : dateLabel,
        count: 0,
        events: [],
      };
      byKey.set(key, group);
      groups.push(group);
    }
    group.events.push(event);
    group.count += 1;
  }

  return groups;
}

export function paginateHistoryEvents(events = [], requestedPage = 1, options = {}) {
  const pageOptions = typeof requestedPage === "object" && requestedPage !== null ? requestedPage : options;
  const pageInput = typeof requestedPage === "object" && requestedPage !== null ? requestedPage.page : requestedPage;
  const parsedPageSize = Number(pageOptions.pageSize ?? HISTORY_PAGE_SIZE);
  const pageSize = Number.isInteger(parsedPageSize) && parsedPageSize > 0 ? parsedPageSize : HISTORY_PAGE_SIZE;
  const totalItems = events.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const numericPage = Number(pageInput);
  const page = Math.min(totalPages, Math.max(1, Number.isFinite(numericPage) ? Math.trunc(numericPage) : 1));
  const startIndex = (page - 1) * pageSize;
  const items = events.slice(startIndex, startIndex + pageSize);

  return {
    items,
    page,
    pageSize,
    totalItems,
    totalPages,
    startIndex,
    endIndex: items.length ? startIndex + items.length - 1 : -1,
  };
}
