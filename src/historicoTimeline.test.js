import test from "node:test";
import assert from "node:assert/strict";

import {
  HISTORY_PAGE_SIZE,
  filterHistoryEvents,
  groupHistoryEvents,
  normalizeEquipmentHistory,
  normalizeHistoryEvents,
  normalizePointHistory,
  paginateHistoryEvents,
  sanitizeHistoryObservation,
  sortHistoryEvents,
} from "./historicoTimeline.js";

function localTimestamp(year, month, day, hour = 12, minute = 0) {
  return new Date(year, month - 1, day, hour, minute).toISOString();
}

test("normaliza Equipamentos com ID namespaced, timestamp canônico e sem inventar ator", () => {
  const timestamp = "2026-08-31T12:30:00.000Z";
  const [event] = normalizeEquipmentHistory([{
    id: 17,
    tipo: "ponto",
    itemId: 91,
    itemNome: "Terminal 0142",
    categoria: "Terminais",
    qtdAntes: 1,
    qtdDepois: 1,
    responsavel: "Caio Nobre",
    observacao: "Destino: Vale Azul",
    data: "31/08/2026, 09:30",
    createdAt: timestamp,
  }]);

  assert.equal(event.id, "equipment:17");
  assert.equal(event.source, "historico_equipamentos");
  assert.equal(event.module, "equipment");
  assert.equal(event.timestamp, timestamp);
  assert.equal(event.legacyDate, "31/08/2026, 09:30");
  assert.deepEqual(event.entity, { id: 91, name: "Terminal 0142", kind: "equipment", category: "Terminais" });
  assert.equal(event.actor, null);
  assert.equal(event.responsible, "Caio Nobre");
  assert.equal(event.destination, "Vale Azul");
  assert.equal(event.title, "Terminal 0142 enviado ao ponto");
  assert.deepEqual(event.rawRef, { source: "historico_equipamentos", id: 17 });
});

test("normaliza Pontos sem tratar gerente como executor", () => {
  const [event] = normalizePointHistory({
    id: 17,
    tipo: "edicao",
    nome: "São José",
    gerente: "Márcia Silva",
    observacao: "Ponto editado",
    created_at: "2026-08-31T11:00:00-03:00",
  });

  assert.equal(event.id, "point:17");
  assert.equal(event.source, "historico_pontos");
  assert.equal(event.moduleLabel, "Pontos");
  assert.equal(event.actor, null);
  assert.equal(event.responsible, "Márcia Silva");
  assert.equal(event.title, "Cadastro de São José atualizado");
  assert.equal(event.summary, "Ponto editado");
});

test("combina as fontes com IDs independentes e ordena pelo timestamp real em DESC", () => {
  const result = normalizeHistoryEvents({
    equipmentHistory: [
      { id: 1, tipo: "cadastro", itemNome: "Antigo", createdAt: "2026-08-01T23:59:59Z" },
      { id: 2, tipo: "edicao", itemNome: "Novo", createdAt: "2026-08-31T00:00:00Z" },
      { id: 3, tipo: "edicao", itemNome: "Sem data", data: "31/12/2099, 23:59" },
    ],
    pointHistory: [
      { id: 1, tipo: "cadastro", nome: "Intermediário", createdAt: "2026-08-15T08:00:00Z" },
    ],
  });

  assert.deepEqual(result.map(event => event.id), ["equipment:2", "point:1", "equipment:1", "equipment:3"]);
  assert.equal(result.at(-1).timestamp, null, "data formatada não deve virar timestamp canônico");
});

test("sortHistoryEvents é imutável e preserva empate de timestamp", () => {
  const original = [
    { id: "a", timestamp: "2026-08-31T10:00:00Z" },
    { id: "b", timestamp: "2026-08-31T10:00:00Z" },
    { id: "c", timestamp: "2026-08-31T11:00:00Z" },
  ];
  const sorted = sortHistoryEvents(original);
  assert.deepEqual(sorted.map(event => event.id), ["c", "a", "b"]);
  assert.deepEqual(original.map(event => event.id), ["a", "b", "c"]);
});

test("sanitiza observação por whitelist sem expor pagamento, PIX, nota, arquivo ou JSON", () => {
  const sanitized = sanitizeHistoryObservation([
    "Operador aprovou e encaminhou para conserto",
    "Defeito: tela apagada",
    "Destino: Assistência Central",
    "Forma de pagamento: PIX",
    "PIX conserto: chave-secreta",
    "Valor conserto: R$ 740,00",
    "Nota fiscal: nota-123.jpg",
    "Arquivo: data:image/png;base64,SECRETO",
    '{"token":"nao-expor"}',
    "texto livre desconhecido e secreto",
  ].join(" | "));

  assert.equal(sanitized.summary, "Operador aprovou e encaminhou para conserto");
  assert.equal(sanitized.destination, "Assistência Central");
  assert.deepEqual(sanitized.details, [{ key: "defect", label: "Defeito", value: "tela apagada" }]);
  const serialized = JSON.stringify(sanitized).toLocaleLowerCase("pt-BR");
  for (const forbidden of ["chave-secreta", "740", "nota-123", "secreto", "token", "data:image", "forma de pagamento"]) {
    assert.doesNotMatch(serialized, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  const paymentConfirmation = sanitizeHistoryObservation(
    "Administração confirmou o pagamento do conserto | Valor: R$ 740,00 | Forma: PIX",
  );
  assert.equal(paymentConfirmation.summary, "Administração confirmou o pagamento do conserto");
  assert.doesNotMatch(JSON.stringify(paymentConfirmation), /740|pix|forma/i);
});

test("normaliza apenas detalhes conhecidos e omite observação bruta do contrato", () => {
  const [event] = normalizeEquipmentHistory([{
    id: 3,
    tipo: "edicao",
    itemNome: "Terminal",
    qtdAntes: 1,
    qtdDepois: 2,
    observacao: "Status: Disponível→Em rota | dado arbitrário que não deve aparecer",
    createdAt: "2026-08-31T10:00:00Z",
  }]);

  assert.equal("observation" in event, false);
  assert.equal("observacao" in event, false);
  assert.deepEqual(event.details, [
    { key: "status", label: "Status", value: "Disponível→Em rota" },
    { key: "quantity", label: "Quantidade", value: "1 → 2" },
  ]);
  assert.doesNotMatch(JSON.stringify(event), /dado arbitrário/i);
});

test("busca é acento-insensível e usa somente campos normalizados seguros", () => {
  const events = normalizeHistoryEvents({
    equipmentHistory: [{
      id: 1,
      tipo: "ponto",
      itemNome: "Televisão São Bento",
      responsavel: "Márcia",
      observacao: "Destino: Vale Açu | PIX conserto: segredo-buscavel",
      createdAt: "2026-08-31T10:00:00Z",
    }],
    pointHistory: [{
      id: 2,
      tipo: "cadastro",
      nome: "Jussara",
      gerente: "Caio",
      observacao: "Ponto cadastrado",
      createdAt: "2026-08-31T09:00:00Z",
    }],
  });

  assert.deepEqual(filterHistoryEvents(events, { query: "televisao sao marcia vale acu" }).map(event => event.id), ["equipment:1"]);
  assert.deepEqual(filterHistoryEvents(events, { query: "equipamentos enviado" }).map(event => event.id), ["equipment:1"]);
  assert.deepEqual(filterHistoryEvents(events, { query: "segredo-buscavel" }), []);
});

test("filtra módulo e tipo sem reordenar o resultado", () => {
  const events = normalizeHistoryEvents({
    equipmentHistory: [
      { id: 1, tipo: "cadastro", itemNome: "A", createdAt: "2026-08-31T10:00:00Z" },
      { id: 2, tipo: "edicao", itemNome: "B", createdAt: "2026-08-31T09:00:00Z" },
    ],
    pointHistory: [{ id: 3, tipo: "cadastro", nome: "C", createdAt: "2026-08-31T08:00:00Z" }],
  });

  assert.deepEqual(filterHistoryEvents(events, { module: "point" }).map(event => event.id), ["point:3"]);
  assert.deepEqual(filterHistoryEvents(events, { module: "equipment", eventType: "cadastro" }).map(event => event.id), ["equipment:1"]);
  assert.deepEqual(filterHistoryEvents(events, { module: ["point", "equipment"], eventType: "cadastro" }).map(event => event.id), ["equipment:1", "point:3"]);
});

test("períodos usam limites de dias do calendário no timezone local", () => {
  const now = new Date(2026, 7, 31, 15, 30);
  const events = [
    { id: "today", timestamp: localTimestamp(2026, 8, 31, 0, 1) },
    { id: "seven-start", timestamp: localTimestamp(2026, 8, 25, 0, 0) },
    { id: "seven-out", timestamp: localTimestamp(2026, 8, 24, 23, 59) },
    { id: "thirty-start", timestamp: localTimestamp(2026, 8, 2, 0, 0) },
    { id: "thirty-out", timestamp: localTimestamp(2026, 8, 1, 23, 59) },
    { id: "unknown", timestamp: null },
  ];

  assert.deepEqual(filterHistoryEvents(events, { period: "today", now }).map(event => event.id), ["today"]);
  assert.deepEqual(filterHistoryEvents(events, { period: "7d", now }).map(event => event.id), ["today", "seven-start"]);
  assert.deepEqual(filterHistoryEvents(events, { period: "30d", now }).map(event => event.id), ["today", "seven-start", "seven-out", "thirty-start"]);
  assert.equal(filterHistoryEvents(events, { period: "all", now }).length, events.length);
});

test("agrupa Hoje, Ontem e data completa usando timestamp e timezone locais", () => {
  const now = new Date(2026, 7, 31, 12, 0);
  const events = [
    { id: "older", timestamp: localTimestamp(2026, 8, 20, 18, 0) },
    { id: "today-late", timestamp: localTimestamp(2026, 8, 31, 11, 0) },
    { id: "yesterday", timestamp: localTimestamp(2026, 8, 30, 23, 59) },
    { id: "today-early", timestamp: localTimestamp(2026, 8, 31, 1, 0) },
    { id: "unknown", timestamp: null },
  ];
  const groups = groupHistoryEvents(events, { now, locale: "pt-BR" });

  assert.deepEqual(groups.map(group => group.key), ["2026-08-31", "2026-08-30", "2026-08-20", "unknown"]);
  assert.equal(groups[0].label, "Hoje");
  assert.equal(groups[0].count, 2);
  assert.deepEqual(groups[0].events.map(event => event.id), ["today-late", "today-early"]);
  assert.equal(groups[1].label, "Ontem");
  assert.match(groups[2].dateLabel, /20/);
  assert.equal(groups[3].label, "Data indisponível");
});

test("pagina 35 eventos, aplica clamp e não mistura paginação com exportação filtrada", () => {
  const filteredEvents = Array.from({ length: 73 }, (_, index) => ({ id: index + 1 }));
  assert.equal(HISTORY_PAGE_SIZE, 35);

  const second = paginateHistoryEvents(filteredEvents, 2);
  assert.equal(second.page, 2);
  assert.equal(second.pageSize, 35);
  assert.equal(second.totalItems, 73);
  assert.equal(second.totalPages, 3);
  assert.equal(second.items.length, 35);
  assert.equal(second.items[0].id, 36);
  assert.equal(second.items.at(-1).id, 70);

  const clamped = paginateHistoryEvents(filteredEvents, 99);
  assert.equal(clamped.page, 3);
  assert.deepEqual(clamped.items.map(event => event.id), [71, 72, 73]);

  const reset = paginateHistoryEvents(filteredEvents.slice(0, 4), { page: 1 });
  assert.equal(reset.page, 1);
  assert.equal(reset.items.length, 4);
  assert.equal(filteredEvents.length, 73, "o conjunto filtrado para exportação permanece independente da página visual");
});

test("severidade só deriva de tipos operacionais conhecidos", () => {
  const events = normalizeEquipmentHistory([
    { id: 1, tipo: "exclusao", itemNome: "A", createdAt: "2026-08-31T10:00:00Z" },
    { id: 2, tipo: "defeito", itemNome: "B", createdAt: "2026-08-31T09:00:00Z" },
    { id: 3, tipo: "evento_legado", itemNome: "C", createdAt: "2026-08-31T08:00:00Z" },
  ]);
  assert.deepEqual(events.map(event => event.severity), ["critical", "attention", "neutral"]);
});
