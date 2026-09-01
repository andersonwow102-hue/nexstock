export const CATEGORIES = Object.freeze([
  "Televisões",
  "Terminais",
  "Impressoras",
  "Tablets",
  "Carregadores",
  "Máquina de Brindes",
  "Totens",
  "Noteiro",
  "PDV Touchscreen",
]);

const ELIGIBLE_CATEGORIES = CATEGORIES.filter((category) => category !== "Máquina de Brindes");

const CATEGORY_NAMES = Object.freeze({
  Televisões: "TV Operacional",
  Terminais: "Terminal Operacional",
  Impressoras: "Impressora de Cupom",
  Tablets: "Tablet de Rota",
  Carregadores: "Carregador USB-C",
  "Máquina de Brindes": "Máquina de Brindes",
  Totens: "Totem de Atendimento",
  Noteiro: "Noteiro Operacional",
  "PDV Touchscreen": "PDV Touchscreen",
});

const LOCATIONS = Object.freeze([
  "Base NEPTERA",
  "Ponto Modelo Norte",
  "Ponto Modelo Sul",
  "Rota Piloto Leste",
  "Oficina Técnica",
]);

const ORPHAN_LOCATIONS = Object.freeze([
  "Ponto Fictício Órfão A",
  "Ponto Fictício Órfão B",
  "Ponto Fictício Órfão C",
  "Ponto Fictício Órfão D",
  "Ponto Fictício Órfão E",
  "Ponto Fictício Órfão F",
]);

function pad(value, size) {
  return String(value).padStart(size, "0");
}

export function formatNp(number) {
  return `NP-${pad(number, 6)}`;
}

function baseAsset(index, overrides = {}) {
  const ordinal = index + 1;
  const category = ELIGIBLE_CATEGORIES[index % ELIGIBLE_CATEGORIES.length];
  return {
    id: `eq-fixture-${pad(ordinal, 4)}`,
    publicId: `00000000-0000-4000-8000-${pad(ordinal, 12)}`,
    technicalId: `TEC-EQP-${pad(ordinal, 6)}`,
    name: `${CATEGORY_NAMES[category]} ${pad(ordinal, 3)}`,
    category,
    location: LOCATIONS[index % LOCATIONS.length],
    patrimonyCode: "",
    patrimonyKind: "missing",
    eligibility: "eligible",
    readiness: "ready",
    batchId: "",
    deploymentState: "pendente",
    note: "Apto para receber código NP.",
    ...overrides,
  };
}

export function createPatrimonyFixture() {
  const eligible = Array.from({ length: 454 }, (_, index) => {
    if (index < 58) {
      return baseAsset(index, {
        patrimonyCode: `LEG-EQP-${pad(index + 1, 4)}`,
        patrimonyKind: "legacy",
        readiness: "coded",
        batchId: "IMPORTAÇÃO-LEGADO",
        deploymentState: "legado",
        note: "Código legado preservado; este registro não consome a sequência NP.",
      });
    }
    if (index >= 446) {
      return baseAsset(index, {
        location: ORPHAN_LOCATIONS[(index - 446) % ORPHAN_LOCATIONS.length],
        readiness: "review",
        note: "Localização sem correspondência em Pontos.",
      });
    }
    return baseAsset(index);
  });

  const prizeMachines = Array.from({ length: 34 }, (_, offset) => {
    const index = 454 + offset;
    const hasLegacyCode = offset < 8;
    return baseAsset(index, {
      name: `Máquina de Brindes ${pad(offset + 1, 2)}`,
      category: "Máquina de Brindes",
      location: offset % 3 ? "Base NEPTERA" : "Oficina Técnica",
      patrimonyCode: hasLegacyCode ? `LEG-MAQ-${pad(offset + 1, 3)}` : "",
      patrimonyKind: hasLegacyCode ? "legacy" : "non_asset",
      eligibility: "non_asset",
      readiness: hasLegacyCode ? "legacy" : "non_asset",
      batchId: hasLegacyCode ? "IMPORTAÇÃO-LEGADO" : "",
      deploymentState: hasLegacyCode ? "legado" : "fora_escopo",
      note: hasLegacyCode
        ? "Código legado preservado; categoria excluída da nova política patrimonial."
        : "Máquina de Brindes sem código e fora da nova política patrimonial.",
    });
  });

  return [...eligible, ...prizeMachines];
}
