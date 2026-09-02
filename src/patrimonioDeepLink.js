export const PATRIMONIO_PUBLIC_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
export const PATRIMONIO_ROUTE_PREFIX = "/patrimonio";
export const PATRIMONIO_GENERIC_MESSAGE = "Patrimônio não encontrado ou indisponível para seu acesso.";

export const PATRIMONIO_STATES = Object.freeze({
  disponivel: {
    label: "Disponível",
    title: "Etiqueta pronta para ativação",
    description: "Esta identidade ainda não está vinculada a um equipamento.",
  },
  vinculado: {
    label: "Vinculado",
    title: "Etiqueta vinculada",
    description: "O vínculo foi registrado e a aplicação física continua pendente.",
  },
  aplicado: {
    label: "Aplicado",
    title: "Etiqueta aplicada",
    description: "A aplicação física foi registrada e aguarda conferência independente.",
  },
  conferido: {
    label: "Conferido",
    title: "Patrimônio conferido",
    description: "A identidade física foi conferida no equipamento vinculado.",
  },
  anulado: {
    label: "Anulado",
    title: "Patrimônio anulado",
    description: "Esta identidade permanece somente para consulta histórica.",
  },
  baixado: {
    label: "Baixado",
    title: "Patrimônio baixado",
    description: "O ciclo operacional foi encerrado e o histórico permanece preservado.",
  },
});

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}

export function parsePatrimonioRoute(pathname = "/") {
  const normalizedPath = String(pathname || "/").replace(/\/{2,}/g, "/");
  const segments = normalizedPath.split("/").filter(Boolean);
  if (segments[0] !== "patrimonio") return null;

  const publicId = segments.length === 2 ? safeDecode(segments[1]) : "";
  return {
    kind: "patrimonio",
    pathname: normalizedPath,
    publicId,
    valid: segments.length === 2 && PATRIMONIO_PUBLIC_ID_PATTERN.test(publicId),
  };
}

export function normalizePatrimonioRecord(row) {
  if (!row || typeof row !== "object") return null;
  const publicId = String(row.public_id || row.publicId || "");
  const state = String(row.situacao || row.state || "").toLowerCase();
  if (!PATRIMONIO_PUBLIC_ID_PATTERN.test(publicId) || !PATRIMONIO_STATES[state]) return null;

  return {
    publicId,
    code: String(row.codigo || row.code || ""),
    state,
    origin: String(row.origem || row.origin || ""),
    equipmentId: row.equipamento_id ?? row.equipmentId ?? null,
    equipmentName: String(row.equipamento_nome || row.equipmentName || ""),
    equipmentCategory: String(row.equipamento_categoria || row.equipmentCategory || ""),
    equipmentStatus: String(row.equipamento_status || row.equipmentStatus || ""),
    equipmentLocation: String(row.equipamento_localizacao || row.equipmentLocation || ""),
    batchCode: String(row.lote_codigo || row.batchCode || ""),
    campaignCode: String(row.campanha_codigo || row.campaignCode || ""),
    legacyReferences: Array.isArray(row.referencias_anteriores || row.legacyReferences)
      ? (row.referencias_anteriores || row.legacyReferences)
      : [],
  };
}

export async function resolvePatrimonioWithClient(client, publicId) {
  if (!PATRIMONIO_PUBLIC_ID_PATTERN.test(String(publicId || ""))) return null;
  if (!client || typeof client.rpc !== "function") {
    const error = new Error("Consulta patrimonial indisponível.");
    error.code = "PATRIMONIO_LOOKUP_UNAVAILABLE";
    throw error;
  }

  const { data, error } = await client.rpc("patrimonio_resolver_public_id", {
    p_public_id: publicId,
  });
  if (error) {
    const lookupError = new Error("Consulta patrimonial indisponível.");
    lookupError.code = "PATRIMONIO_LOOKUP_UNAVAILABLE";
    throw lookupError;
  }

  const row = Array.isArray(data) ? data[0] : data;
  return normalizePatrimonioRecord(row);
}

export function patrimonioViewModel({
  authenticated,
  route,
  status = "ready",
  record = null,
  role = "consulta",
} = {}) {
  if (!route) return { kind: "not-patrimonio" };
  if (!authenticated) {
    return {
      kind: "login",
      disclosure: false,
      preserveDestination: true,
      message: "Entre para continuar ao destino protegido.",
    };
  }
  if (status === "loading") return { kind: "loading", disclosure: false };
  if (status === "error") {
    return {
      kind: "error",
      disclosure: false,
      message: "Não foi possível consultar o patrimônio agora. Tente novamente.",
    };
  }
  if (!route.valid || !record || !PATRIMONIO_STATES[record.state]) {
    return { kind: "unavailable", disclosure: false, message: PATRIMONIO_GENERIC_MESSAGE };
  }

  const state = PATRIMONIO_STATES[record.state];
  const canActivate = record.state === "disponivel" && ["administrador", "operador"].includes(role);
  return {
    kind: "resolved",
    disclosure: true,
    record,
    state,
    canActivate,
    activationDenied: record.state === "disponivel" && !canActivate,
    canSeeGlobalCatalog: false,
  };
}
