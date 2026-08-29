export const CATEGORIES = [
  "Televisões",
  "Terminais",
  "Impressoras",
  "Tablets",
  "Carregadores",
  "Máquina de Brindes",
  "Totens",
  "Noteiro",
  "PDV Touchscreen",
];

export const STATUSES = ["Disponível", "Em rota", "Em conserto"];

export const POINTS = [
  "Ponto Alameda",
  "Ponto Bela Vista",
  "Ponto Estação",
  "Ponto Horizonte",
  "Ponto Jardim",
  "Ponto Mercado",
  "Ponto Praça Norte",
  "Ponto Vale Azul",
];

export const MANAGERS = [
  "Ana Ribeiro",
  "Caio Nobre",
  "Elisa Monteiro",
  "Jonas Freire",
  "Lívia Campos",
  "Rafael Duarte",
];

const CATEGORY_CODES = {
  Televisões: "TV",
  Terminais: "TRM",
  Impressoras: "IMP",
  Tablets: "TAB",
  Carregadores: "CRG",
  "Máquina de Brindes": "BRD",
  Totens: "TOT",
  Noteiro: "NOT",
  "PDV Touchscreen": "PDV",
};

const CATEGORY_NAMES = {
  Televisões: "Monitor de operação",
  Terminais: "Terminal operacional",
  Impressoras: "Impressora térmica",
  Tablets: "Tablet de atendimento",
  Carregadores: "Base carregadora",
  "Máquina de Brindes": "Módulo de brindes",
  Totens: "Totem de consulta",
  Noteiro: "Módulo noteiro",
  "PDV Touchscreen": "PDV touchscreen",
};

const POSITION_SEQUENCE = ["point", "point", "point", "point", "internal", "internal", "internal", "manager", "manager_pending", "repair"];

function pad(value, size = 4) {
  return String(value).padStart(size, "0");
}

function fixtureDate(index, offset = 0) {
  const day = ((index * 3 + offset) % 27) + 1;
  const month = ((index + offset) % 7) + 1;
  return `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(8 + (index % 9)).padStart(2, "0")}:20:00.000Z`;
}

function movementEntry(index, label, detail, type = "edicao", offset = 0) {
  return {
    id: `hist-${index}-${offset}-${type}`,
    type,
    label,
    detail,
    actor: index % 2 === 0 ? "Administração" : "Operação",
    at: fixtureDate(index, offset),
  };
}

function baseEquipment(index) {
  const number = index + 1;
  const categoria = CATEGORIES[index % CATEGORIES.length];
  const positionSeed = POSITION_SEQUENCE[index % POSITION_SEQUENCE.length];
  const point = POINTS[index % POINTS.length];
  const manager = MANAGERS[index % MANAGERS.length];
  const code = `${CATEGORY_CODES[categoria]}-${pad(number)}`;
  const common = {
    id: `equipment-${pad(number, 3)}`,
    code,
    nome: `${CATEGORY_NAMES[categoria]} ${pad(number, 2)}`,
    categoria,
    quantidade: 1,
    minimo: 0,
    observacao: number % 6 === 0 ? "Etiqueta revisada na última conferência." : "",
    patrimonio: "",
    responsavel: index % 3 === 0 ? "Equipe de campo" : "Administração",
    dataCadastro: fixtureDate(index, 2),
    localizacao: "",
    gerenteResponsavel: "",
    transferenciaStatus: "",
    consertoDefeito: "",
    nextDestination: "",
  };

  if (positionSeed === "point") {
    return {
      ...common,
      status: "Em rota",
      localizacao: point,
      history: [
        movementEntry(index, "Posicionado no ponto", point, "ponto", 1),
        movementEntry(index, "Equipamento cadastrado", "Entrada na base operacional", "cadastro", 2),
      ],
    };
  }

  if (positionSeed === "manager_pending") {
    return {
      ...common,
      status: "Em rota",
      gerenteResponsavel: manager,
      transferenciaStatus: "aguardando_confirmacao",
      nextDestination: `Custódia de ${manager}`,
      history: [
        movementEntry(index, "Envio ao gerente", `Confirmação aguardada de ${manager}`, "envio_gerente", 1),
        movementEntry(index, "Saída do estoque interno", "Movimentação registrada", "saida", 2),
      ],
    };
  }

  if (positionSeed === "manager") {
    return {
      ...common,
      status: "Disponível",
      gerenteResponsavel: manager,
      transferenciaStatus: "recebido",
      history: [
        movementEntry(index, "Recebido pelo gerente", `Custódia confirmada por ${manager}`, "recebimento_gerente", 1),
        movementEntry(index, "Envio ao gerente", manager, "envio_gerente", 2),
      ],
    };
  }

  if (positionSeed === "repair") {
    return {
      ...common,
      status: "Em conserto",
      consertoDefeito: index % 2 === 0 ? "Falha intermitente de alimentação" : "Leitura instável no periférico",
      responsavel: "Assistência parceira",
      history: [
        movementEntry(index, "Enviado para conserto", "Diagnóstico técnico em andamento", "conserto", 1),
        movementEntry(index, "Defeito registrado", index % 2 === 0 ? "Alimentação" : "Periférico", "defeito", 2),
      ],
    };
  }

  return {
    ...common,
    status: "Disponível",
    history: [
      movementEntry(index, "Disponível no estoque interno", "Conferência concluída", "disponivel", 1),
      movementEntry(index, "Equipamento cadastrado", "Entrada na base operacional", "cadastro", 2),
    ],
  };
}

export function createEquipmentFixture(scale = 40) {
  const normalizedScale = Number(scale) === 150 ? 150 : 40;
  return Array.from({ length: normalizedScale }, (_, index) => baseEquipment(index));
}

export function positionOf(item) {
  if (!item) {
    return { key: "internal", label: "Estoque interno", detail: "Base operacional", icon: "warehouse" };
  }

  if (item.status === "Em conserto") {
    return {
      key: "repair",
      label: "Em conserto",
      detail: item.responsavel || "Assistência técnica",
      icon: "repair",
    };
  }

  if (item.localizacao) {
    return { key: "point", label: "Em ponto", detail: item.localizacao, icon: "pin" };
  }

  if (item.gerenteResponsavel && item.transferenciaStatus === "aguardando_confirmacao") {
    return {
      key: "manager_pending",
      groupKey: "manager",
      label: "Em transferência",
      detail: `Para ${item.gerenteResponsavel}`,
      icon: "transfer",
    };
  }

  if (item.gerenteResponsavel) {
    return {
      key: "manager",
      label: "Com gerente",
      detail: item.gerenteResponsavel,
      icon: "user",
    };
  }

  return { key: "internal", label: "Estoque interno", detail: "Base operacional", icon: "warehouse" };
}

export function needsAction(item) {
  if (!item) return null;
  if (item.transferenciaStatus === "aguardando_confirmacao") {
    return { key: "confirmation", label: "Confirmação pendente", detail: `Aguardando ${item.gerenteResponsavel}` };
  }
  if (item.status === "Em conserto") {
    return { key: "repair", label: "Acompanhar conserto", detail: item.consertoDefeito || "Diagnóstico em andamento" };
  }
  return null;
}

export function summaryCounts(items) {
  return items.reduce(
    (counts, item) => {
      const position = positionOf(item);
      counts.total += 1;
      if (position.key === "internal") counts.internal += 1;
      if (position.key === "point") counts.point += 1;
      if (position.groupKey === "manager" || position.key === "manager") counts.manager += 1;
      if (position.key === "repair") counts.repair += 1;
      if (needsAction(item)) counts.attention += 1;
      return counts;
    },
    { total: 0, internal: 0, point: 0, manager: 0, repair: 0, attention: 0 },
  );
}

function searchable(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function filterEquipment(items, filters = {}, query = "") {
  const needle = searchable(query);
  return items.filter((item) => {
    const position = positionOf(item);
    const haystack = searchable(
      [
        item.code,
        item.id,
        item.nome,
        item.categoria,
        item.localizacao,
        item.gerenteResponsavel,
        item.responsavel,
      ].join(" "),
    );
    const positionKey = position.groupKey || position.key;
    return (
      (!needle || haystack.includes(needle)) &&
      (!filters.category || item.categoria === filters.category) &&
      (!filters.status || item.status === filters.status) &&
      (!filters.position || positionKey === filters.position) &&
      (!filters.manager || item.gerenteResponsavel === filters.manager) &&
      (!filters.point || item.localizacao === filters.point)
    );
  });
}

function movementLabel(type) {
  return {
    point: "Posicionado no ponto",
    manager: "Envio ao gerente",
    repair: "Enviado para conserto",
    internal: "Retorno ao estoque interno",
  }[type];
}

export function simulateMovement(items, id, movement, now = "2026-07-31T15:40:00.000Z") {
  let updatedItem = null;
  let event = null;
  const updatedItems = items.map((item) => {
    if (item.id !== id) return item;
    const type = movement.type;
    const destination = movement.destination || "";
    const detail = movement.note || destination || "Base operacional";
    event = {
      id: `hist-${item.id}-${now}`,
      type: type === "manager" ? "envio_gerente" : type === "point" ? "ponto" : type === "repair" ? "conserto" : "retorno",
      label: movementLabel(type),
      detail,
      actor: movement.responsible || "Administração",
      at: now,
    };
    const next = {
      ...item,
      localizacao: "",
      gerenteResponsavel: "",
      transferenciaStatus: "",
      consertoDefeito: "",
      nextDestination: "",
      responsavel: movement.responsible || item.responsavel,
      history: [event, ...(item.history || [])],
    };
    if (type === "point") {
      next.status = "Em rota";
      next.localizacao = destination;
    } else if (type === "manager") {
      next.status = "Em rota";
      next.gerenteResponsavel = destination;
      next.transferenciaStatus = "aguardando_confirmacao";
      next.nextDestination = `Custódia de ${destination}`;
    } else if (type === "repair") {
      next.status = "Em conserto";
      next.responsavel = destination || movement.responsible || "Assistência parceira";
      next.consertoDefeito = movement.note || "Diagnóstico técnico solicitado";
    } else {
      next.status = "Disponível";
    }
    updatedItem = next;
    return next;
  });
  return { items: updatedItems, item: updatedItem, event };
}

export function activeFilterEntries(filters = {}) {
  const labels = {
    category: "Categoria",
    status: "Estado",
    position: "Posição",
    manager: "Gerente",
    point: "Ponto",
  };
  return Object.entries(filters)
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => ({ key, label: labels[key], value }));
}
