import { useEffect, useMemo, useState } from "react";
import EquipmentInventoryLedger from "./EquipmentInventoryLedger.jsx";
import {
  Button,
  FilterBar,
  OperationIcon,
} from "./components/operations/OperationsUI.jsx";
import { handleMainScrollKey } from "./components/operations/mainScrollNavigation.js";
import { useResponsiveSheet } from "./components/operations/useResponsiveSheet.js";
import "./styles/foundations.css";
import "./styles/command-flow.css";

const PAGE_SIZE = 12;

const CATEGORIES = [
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

const STATUSES = ["Disponível", "Em rota", "Em conserto"];

const CATEGORY_ICONS = {
  Televisões: "tv",
  Terminais: "monitor",
  Impressoras: "printer",
  Tablets: "tablet",
  Carregadores: "plug",
  "Máquina de Brindes": "gift",
  Totens: "monitor",
  Noteiro: "banknote",
  "PDV Touchscreen": "monitor",
};

const EQUIPAMENTOS_PREVIEW_FIXTURE = Object.freeze([
  { id: "eq-local-801", nome: "TV RECEPÇÃO LESTE", categoria: "Televisões", status: "Em rota", localizacao: "Ponto Vila Serena", responsavel: "Núcleo Operacional", patrimonio: "NP-801", dataCadastro: "12/05/2026", gerenteResponsavel: "Bruna Moraes", transferenciaStatus: "", observacao: "Painel principal da recepção." },
  { id: "eq-local-802", nome: "TERMINAL OPERAÇÃO 04", categoria: "Terminais", status: "Disponível", localizacao: "", responsavel: "Base Central", patrimonio: "NP-802", dataCadastro: "14/05/2026", gerenteResponsavel: "", transferenciaStatus: "", observacao: "Pronto para nova alocação." },
  { id: "eq-local-803", nome: "IMPRESSORA CUPOM 07", categoria: "Impressoras", status: "Em conserto", localizacao: "", responsavel: "Oficina Técnica", patrimonio: "NP-803", dataCadastro: "17/05/2026", gerenteResponsavel: "", transferenciaStatus: "", consertoAssistencia: "Oficina Técnica Horizonte", consertoDefeito: "Falha intermitente no corte", observacao: "Diagnóstico em andamento." },
  { id: "eq-local-804", nome: "TABLET ROTA 12", categoria: "Tablets", status: "Disponível", localizacao: "", responsavel: "Bruna Moraes", patrimonio: "NP-804", dataCadastro: "19/05/2026", gerenteResponsavel: "Bruna Moraes", transferenciaStatus: "recebido", observacao: "Sob custódia da gerente." },
  { id: "eq-local-805", nome: "CARREGADOR USB-C 21", categoria: "Carregadores", status: "Em rota", localizacao: "Ponto Jardim Imperial", responsavel: "Equipe de Campo", patrimonio: "NP-805", dataCadastro: "22/05/2026", gerenteResponsavel: "", transferenciaStatus: "", observacao: "Kit de apoio do caixa." },
  { id: "eq-local-806", nome: "MÁQUINA DE BRINDES SUL", categoria: "Máquina de Brindes", status: "Em rota", localizacao: "", responsavel: "Alex", patrimonio: "NP-806", dataCadastro: "24/05/2026", gerenteResponsavel: "Alex", transferenciaStatus: "aguardando_confirmacao", transferenciaEnviadaEm: "28/08/2026 16:20", observacao: "Envio aguardando aceite." },
  { id: "eq-local-807", nome: "TOTEM ATENDIMENTO 05", categoria: "Totens", status: "Em rota", localizacao: "Ponto Estação Norte", responsavel: "Equipe de Campo", patrimonio: "NP-807", dataCadastro: "26/05/2026", gerenteResponsavel: "", transferenciaStatus: "", observacao: "Autoatendimento em operação." },
  { id: "eq-local-808", nome: "NOTEIRO CAIXA 03", categoria: "Noteiro", status: "Disponível", localizacao: "", responsavel: "Base Central", patrimonio: "NP-808", dataCadastro: "29/05/2026", gerenteResponsavel: "", transferenciaStatus: "", observacao: "Revisado e disponível." },
  { id: "eq-local-809", nome: "PDV TOUCHSCREEN 09", categoria: "PDV Touchscreen", status: "Disponível", localizacao: "", responsavel: "Helena Prado", patrimonio: "NP-809", dataCadastro: "02/06/2026", gerenteResponsavel: "Helena Prado", transferenciaStatus: "recebido", observacao: "Estoque de contingência da rota." },
  { id: "eq-local-810", nome: "TV PAINEL 11", categoria: "Televisões", status: "Disponível", localizacao: "", responsavel: "Base Central", patrimonio: "NP-810", dataCadastro: "05/06/2026", gerenteResponsavel: "", transferenciaStatus: "", observacao: "Aguardando definição de ponto." },
  { id: "eq-local-811", nome: "TERMINAL GUICHÊ 08", categoria: "Terminais", status: "Em rota", localizacao: "Ponto Mercado das Flores", responsavel: "Equipe de Campo", patrimonio: "NP-811", dataCadastro: "08/06/2026", gerenteResponsavel: "", transferenciaStatus: "", observacao: "Terminal do segundo guichê." },
  { id: "eq-local-812", nome: "IMPRESSORA TÉRMICA 15", categoria: "Impressoras", status: "Disponível", localizacao: "", responsavel: "Base Central", patrimonio: "NP-812", dataCadastro: "11/06/2026", gerenteResponsavel: "", transferenciaStatus: "", observacao: "Reserva operacional." },
  { id: "eq-local-813", nome: "TABLET CONFERÊNCIA 06", categoria: "Tablets", status: "Em conserto", localizacao: "", responsavel: "Oficina Técnica", patrimonio: "NP-813", dataCadastro: "15/06/2026", gerenteResponsavel: "", transferenciaStatus: "", consertoAssistencia: "Laboratório Nova Era", consertoDefeito: "Tela sem resposta", observacao: "Aguardando conclusão técnica." },
  { id: "eq-local-814", nome: "CARREGADOR LIGHTNING 18", categoria: "Carregadores", status: "Disponível", localizacao: "", responsavel: "Rafael Siqueira", patrimonio: "NP-814", dataCadastro: "18/06/2026", gerenteResponsavel: "Rafael Siqueira", transferenciaStatus: "recebido", observacao: "Kit recebido e conferido." },
  { id: "eq-local-815", nome: "TOTEM AUTOATENDIMENTO 02", categoria: "Totens", status: "Em rota", localizacao: "Ponto Parque do Sol", responsavel: "Equipe de Campo", patrimonio: "NP-815", dataCadastro: "21/06/2026", gerenteResponsavel: "", transferenciaStatus: "", observacao: "Operação regular." },
  { id: "eq-local-816", nome: "PDV BALCÃO 13", categoria: "PDV Touchscreen", status: "Disponível", localizacao: "", responsavel: "Base Central", patrimonio: "NP-816", dataCadastro: "25/06/2026", gerenteResponsavel: "", transferenciaStatus: "", observacao: "Homologado para a próxima rota." },
]);

const HISTORICO_PREVIEW_FIXTURE = Object.freeze([
  { id: "hist-local-901", itemId: "eq-local-806", itemNome: "MÁQUINA DE BRINDES SUL", categoria: "Máquina de Brindes", tipo: "envio_gerente", responsavel: "Alex", observacao: "Enviado para gerente: Alex", data: "28/08/2026 às 16:20", executadoPorNomeSnapshot: "Anderson Costa", executadoPorPerfilSnapshot: "administrador" },
  { id: "hist-local-902", itemId: "eq-local-803", itemNome: "IMPRESSORA CUPOM 07", categoria: "Impressoras", tipo: "conserto", responsavel: "Operação", observacao: "Encaminhado à Oficina Técnica Horizonte", data: "28/08/2026 14:05" },
  { id: "hist-local-903", itemId: "eq-local-815", itemNome: "TOTEM AUTOATENDIMENTO 02", categoria: "Totens", tipo: "ponto", responsavel: "Equipe de Campo", observacao: "Vinculado ao Ponto Parque do Sol", data: "28/08/2026 11:42" },
  { id: "hist-local-904", itemId: "eq-local-804", itemNome: "TABLET ROTA 12", categoria: "Tablets", tipo: "recebimento_gerente", responsavel: "Bruna Moraes", observacao: "Equipamento recebido por Bruna Moraes", data: "27/08/2026 às 18:10", executadoPorNomeSnapshot: "Bruna Moraes", executadoPorPerfilSnapshot: "gerente" },
  { id: "hist-local-905", itemId: "eq-local-811", itemNome: "TERMINAL GUICHÊ 08", categoria: "Terminais", tipo: "ponto", responsavel: "Equipe de Campo", observacao: "Vinculado ao Ponto Mercado das Flores", data: "27/08/2026 15:26" },
  { id: "hist-local-906", itemId: "eq-local-813", itemNome: "TABLET CONFERÊNCIA 06", categoria: "Tablets", tipo: "conserto", responsavel: "Operação", observacao: "Encaminhado ao Laboratório Nova Era", data: "27/08/2026 10:18" },
  { id: "hist-local-907", itemId: "eq-local-809", itemNome: "PDV TOUCHSCREEN 09", categoria: "PDV Touchscreen", tipo: "recebimento_gerente", responsavel: "Helena Prado", observacao: "Recebimento confirmado", data: "26/08/2026 17:03" },
  { id: "hist-local-908", itemId: "eq-local-807", itemNome: "TOTEM ATENDIMENTO 05", categoria: "Totens", tipo: "ponto", responsavel: "Equipe de Campo", observacao: "Vinculado ao Ponto Estação Norte", data: "26/08/2026 13:51" },
  { id: "hist-local-909", itemId: "eq-local-814", itemNome: "CARREGADOR LIGHTNING 18", categoria: "Carregadores", tipo: "recebimento_gerente", responsavel: "Rafael Siqueira", observacao: "Recebimento confirmado", data: "25/08/2026 17:38" },
  { id: "hist-local-910", itemId: "eq-local-805", itemNome: "CARREGADOR USB-C 21", categoria: "Carregadores", tipo: "ponto", responsavel: "Equipe de Campo", observacao: "Vinculado ao Ponto Jardim Imperial", data: "25/08/2026 09:22" },
  { id: "hist-local-911", itemId: "eq-local-801", itemNome: "TV RECEPÇÃO LESTE", categoria: "Televisões", tipo: "ponto", responsavel: "Núcleo Operacional", observacao: "Vinculado ao Ponto Vila Serena", data: "24/08/2026 16:47" },
  { id: "hist-local-912", itemId: "eq-local-802", itemNome: "TERMINAL OPERAÇÃO 04", categoria: "Terminais", tipo: "retorno", responsavel: "Base Central", observacao: "Retornado ao estoque interno", data: "23/08/2026 12:30" },
  { id: "hist-local-913", itemId: "eq-local-808", itemNome: "NOTEIRO CAIXA 03", categoria: "Noteiro", tipo: "disponivel", responsavel: "Base Central", observacao: "Revisão concluída", data: "22/08/2026 14:10" },
  { id: "hist-local-914", itemId: "eq-local-810", itemNome: "TV PAINEL 11", categoria: "Televisões", tipo: "cadastro", responsavel: "Administração", observacao: "Equipamento incluído na base", data: "21/08/2026 10:04" },
  { id: "hist-local-915", itemId: "eq-local-812", itemNome: "IMPRESSORA TÉRMICA 15", categoria: "Impressoras", tipo: "retorno", responsavel: "Base Central", observacao: "Retorno conferido", data: "20/08/2026 16:55" },
  { id: "hist-local-916", itemId: "eq-local-816", itemNome: "PDV BALCÃO 13", categoria: "PDV Touchscreen", tipo: "cadastro", responsavel: "Administração", observacao: "Equipamento homologado", data: "19/08/2026 11:12" },
  { id: "hist-local-917", itemId: "eq-local-806", itemNome: "MÁQUINA DE BRINDES SUL", categoria: "Máquina de Brindes", tipo: "envio_gerente", responsavel: "Alex", observacao: "Enviado para gerente: Alex", data: "14/08/2026 às 10:15" },
  { id: "hist-local-918", itemId: "eq-local-806", itemNome: "MÁQUINA DE BRINDES SUL", categoria: "Máquina de Brindes", tipo: "retorno", responsavel: "Base Central", observacao: "Retornado ao estoque interno", data: "12/08/2026 às 17:40", executadoPorNomeSnapshot: "Operador Local", executadoPorPerfilSnapshot: "operador" },
  { id: "hist-local-919", itemId: "eq-local-806", itemNome: "MÁQUINA DE BRINDES SUL", categoria: "Máquina de Brindes", tipo: "conserto", responsavel: "Assistência Técnica", observacao: "Encaminhado para avaliação técnica", data: "11/08/2026 às 14:22", executadoPorNomeSnapshot: "Operador Local", executadoPorPerfilSnapshot: "operador" },
  { id: "hist-local-920", itemId: "eq-local-806", itemNome: "MÁQUINA DE BRINDES SUL", categoria: "Máquina de Brindes", tipo: "ponto", responsavel: "Equipe de Campo", observacao: "Destino: Ponto Vila Serena", data: "08/08/2026 às 09:06", executadoPorNomeSnapshot: "Anderson Costa", executadoPorPerfilSnapshot: "administrador" },
  { id: "hist-local-921", itemId: "eq-local-806", itemNome: "MÁQUINA DE BRINDES SUL", categoria: "Máquina de Brindes", tipo: "edicao", responsavel: "—", observacao: "Dados atualizados", data: "07/08/2026 às 16:48", executadoPorNomeSnapshot: "Anderson Costa", executadoPorPerfilSnapshot: "administrador" },
  { id: "hist-local-922", itemId: "eq-local-806", itemNome: "MÁQUINA DE BRINDES SUL", categoria: "Máquina de Brindes", tipo: "cadastro", responsavel: "—", observacao: "Equipamento cadastrado", data: "05/08/2026 às 08:30", executadoPorNomeSnapshot: "Anderson Costa", executadoPorPerfilSnapshot: "administrador" },
]);

const HISTORY_META = {
  cadastro: { label: "Cadastro", icon: "plus" },
  edicao: { label: "Equipamento atualizado", icon: "edit" },
  conserto: { label: "Conserto", icon: "wrench" },
  disponivel: { label: "Disponível", icon: "check" },
  envio_gerente: { label: "Envio a gerente", icon: "route" },
  ponto: { label: "Movido para ponto", icon: "mapPin" },
  recebimento_gerente: { label: "Recebido por gerente", icon: "check" },
  retorno: { label: "Retorno à base", icon: "package" },
};

const PREVIEW_STYLES = `
  .equipment-preview { min-height: 100vh; color: var(--text-default); background: var(--surface-canvas); }
  .equipment-preview__topbar { position: sticky; z-index: 120; top: 0; display: flex; min-height: 66px; align-items: center; justify-content: space-between; gap: 24px; padding: 10px clamp(16px, 3vw, 42px); background: color-mix(in srgb, var(--surface-navigation) 94%, transparent); border-bottom: 1px solid var(--border-subtle); backdrop-filter: blur(16px); }
  .equipment-preview__brand { display: flex; min-width: 0; align-items: center; gap: 12px; }
  .equipment-preview__mark { display: block; width: 36px; height: 36px; object-fit: contain; }
  .equipment-preview__brand div { display: grid; gap: 2px; }
  .equipment-preview__brand strong { color: var(--text-strong); font: 750 14px/1 var(--font-sans); letter-spacing: .14em; }
  .equipment-preview__brand span, .equipment-preview__safe { color: var(--text-muted); font: 650 9px/1.3 var(--font-mono); letter-spacing: .06em; text-transform: uppercase; }
  .equipment-preview__theme { display: flex; align-items: center; gap: 4px; padding: 3px; background: var(--surface-subtle); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); }
  .equipment-preview__theme a { display: inline-flex; min-height: 44px; align-items: center; justify-content: center; padding: 8px 12px; color: var(--text-muted); border-radius: 3px; font-size: 10px; text-decoration: none; }
  .equipment-preview__theme a[aria-current='true'] { color: var(--text-strong); background: var(--surface-panel); box-shadow: var(--shadow-xs); }
  .equipment-preview__main { display: grid; width: 100%; max-width: 1760px; min-height: calc(100vh - 66px); align-content: start; gap: 14px; margin: 0 auto; padding: 22px clamp(16px, 3vw, 42px) 48px; overflow: auto; }
  .equipment-preview__heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; padding-bottom: 12px; border-bottom: 1px solid var(--border-subtle); }
  .equipment-preview__heading-copy { display: grid; gap: 4px; }
  .equipment-preview__heading-copy span { color: var(--brand-action-vivid); font: 650 9px/1.25 var(--font-mono); letter-spacing: .08em; text-transform: uppercase; }
  .equipment-preview__heading h1 { margin: 0; color: var(--text-strong); font: 720 clamp(24px, 2.3vw, 34px)/1 var(--font-sans); letter-spacing: -.025em; }
  .equipment-preview__heading p { margin: 2px 0 0; color: var(--text-muted); font-size: 11px; }
  .equipment-preview__actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 7px; }
  .equipment-preview__actions .so-button { min-height: 44px; }
  .equipment-preview__actions .equip-cf-export-utility { padding-inline: 10px; color: var(--text-muted); background: transparent; border-color: transparent; box-shadow: none; font-size: 10.5px; font-weight: 600; }
  .equipment-preview__actions .equip-cf-export-utility:hover, .equipment-preview__actions .equip-cf-export-utility:focus-visible { color: var(--text-strong); background: var(--surface-hover); border-color: var(--border-subtle); }
  .equipment-preview__notice { display: flex; min-height: 40px; align-items: center; gap: 9px; padding: 9px 12px; color: var(--text-default); background: var(--state-info-surface); border-left: 3px solid var(--brand-action); font-size: 11px; }
  .equipment-preview__notice strong { color: var(--text-strong); }
  .equipment-preview__tab-panel { display: grid; min-width: 0; gap: 12px; }
  .equipment-preview > .equipment-preview__main { animation: none; }
  .equipment-preview .equip-cf-view-switch button, .equipment-preview .equip-cf-filterbar .so-filter-bar__toggle { min-height: 44px; }
  .equipment-preview .equip-cf-position-strip { min-height: 58px; }
  .equipment-preview .equip-cf-search { min-height: 44px; }
  .equipment-preview .equip-cf-search input { min-height: 42px; }
  .equipment-preview__summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-block: 1px solid var(--border-subtle); }
  .equipment-preview__summary article { display: grid; gap: 7px; min-height: 96px; padding: 18px; border-right: 1px solid var(--border-subtle); }
  .equipment-preview__summary article:nth-child(3n) { border-right: 0; }
  .equipment-preview__summary span { color: var(--text-muted); font: 650 9px/1.2 var(--font-mono); text-transform: uppercase; }
  .equipment-preview__summary strong { color: var(--text-strong); font: 720 28px/1 var(--font-mono); }
  .equipment-preview__summary small { color: var(--text-muted); font-size: 10px; }
  .equipment-preview__trace { margin: 0; padding: 0; list-style: none; border-top: 1px solid var(--border-subtle); }
  .equipment-preview__trace li { display: grid; grid-template-columns: 30px minmax(180px, .8fr) minmax(220px, 1.3fr) 150px; gap: 12px; align-items: center; min-height: 62px; padding: 10px 12px; border-bottom: 1px solid var(--border-subtle); }
  .equipment-preview__trace-icon { display: grid; width: 28px; height: 28px; place-items: center; color: var(--brand-action-vivid); background: var(--surface-subtle); }
  .equipment-preview__trace strong { color: var(--text-strong); font-size: 11px; }
  .equipment-preview__trace span, .equipment-preview__trace time { color: var(--text-muted); font-size: 10px; }
  .equipment-preview__trace-detail { display: grid; gap: 4px; }
  .equipment-preview__trace-detail small { color: var(--text-disabled); font-size: 9px; }
  .equipment-preview__trace time { font-family: var(--font-mono); }
  @media (max-width: 760px) {
    .equipment-preview__topbar, .equipment-preview__heading { align-items: flex-start; }
    .equipment-preview__topbar { flex-direction: column; gap: 10px; }
    .equipment-preview__theme { align-self: stretch; }
    .equipment-preview__theme a { flex: 1; text-align: center; }
    .equipment-preview__heading { flex-direction: column; }
    .equipment-preview__actions { width: 100%; justify-content: stretch; }
    .equipment-preview__actions .so-button { flex: 1; }
    .equipment-preview__summary { grid-template-columns: 1fr; }
    .equipment-preview__summary article, .equipment-preview__summary article:nth-child(3n) { border-right: 0; border-bottom: 1px solid var(--border-subtle); }
    .equipment-preview__trace li { grid-template-columns: 30px minmax(0, 1fr); }
    .equipment-preview__trace li > span:last-of-type, .equipment-preview__trace time { grid-column: 2; }
  }
  @media (prefers-reduced-motion: reduce) { .equipment-preview *, .equipment-preview *::before, .equipment-preview *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; animation-duration: .01ms !important; } }
`;

function normalized(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function positionOf(item) {
  if (item.status === "Em conserto") {
    return { key: "conserto", label: "Conserto", detail: item.consertoAssistencia || "Assistência técnica", icon: "wrench" };
  }
  if (item.localizacao) return { key: "pontos", label: "Em ponto", detail: item.localizacao, icon: "mapPin" };
  if (item.gerenteResponsavel && item.transferenciaStatus === "aguardando_confirmacao") {
    return { key: "gerentes", label: "Em transferência", detail: item.gerenteResponsavel, icon: "route" };
  }
  if (item.gerenteResponsavel) return { key: "gerentes", label: "Com gerente", detail: item.gerenteResponsavel, icon: "user" };
  return { key: "interno", label: "Estoque interno", detail: "Base NEPTERA", icon: "package" };
}

function stateOf(item) {
  const detail = item.transferenciaStatus === "aguardando_confirmacao"
    ? "Aguardando confirmação"
    : item.transferenciaStatus === "recebido" && item.gerenteResponsavel
      ? "Recebido pelo gerente"
      : "";
  const className = item.status === "Disponível"
    ? "status-disponivel"
    : item.status === "Em rota" ? "status-em-rota" : "status-conserto";
  return { label: item.status, className, detail };
}

function linkOf(item) {
  if (item.gerenteResponsavel) return item.gerenteResponsavel;
  if (item.localizacao) return "Sem gerente vinculado";
  return "Sem vínculo ativo";
}

function scopeOf(item) {
  return positionOf(item).key;
}

function latestEventFor(item) {
  return HISTORICO_PREVIEW_FIXTURE.find((event) => event.itemId === item.id) || null;
}

function countsOf(items) {
  return items.reduce((counts, item) => {
    counts.total += 1;
    counts[scopeOf(item)] += 1;
    return counts;
  }, { total: 0, interno: 0, pontos: 0, gerentes: 0, conserto: 0 });
}

function themeFromLocation() {
  if (typeof window === "undefined") return "escuro";
  return new URLSearchParams(window.location.search).get("tema") === "claro" ? "claro" : "escuro";
}

export default function EquipamentosPreviewApp() {
  const [activeView, setActiveView] = useState("lista");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Todas");
  const [status, setStatus] = useState("Todos");
  const [scope, setScope] = useState("todos");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState("eq-local-806");
  const [dossierOpen, setDossierOpen] = useState(false);
  const [notice, setNotice] = useState("Prévia local pronta. Todos os comandos permanecem simulados em memória.");
  const theme = themeFromLocation();
  const light = theme === "claro";

  const filteredItems = useMemo(() => EQUIPAMENTOS_PREVIEW_FIXTURE.filter((item) => {
    if (category !== "Todas" && item.categoria !== category) return false;
    if (status !== "Todos" && item.status !== status) return false;
    if (scope !== "todos" && scopeOf(item) !== scope) return false;
    const term = normalized(query);
    if (!term) return true;
    return [item.nome, item.patrimonio, item.id, item.categoria, item.responsavel, item.localizacao, item.gerenteResponsavel]
      .some((value) => normalized(value).includes(term));
  }), [category, query, scope, status]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const pageItems = filteredItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const selectedItem = filteredItems.find((item) => item.id === selectedId) || null;
  const globalCounts = useMemo(() => countsOf(EQUIPAMENTOS_PREVIEW_FIXTURE), []);
  const activeFilterCount = Number(category !== "Todas") + Number(status !== "Todos") + Number(scope !== "todos");

  const closeDossier = () => setDossierOpen(false);
  const sheet = useResponsiveSheet({
    open: dossierOpen,
    onClose: closeDossier,
    mediaQuery: "(max-width: 1320px)",
    initialFocusSelector: "[data-equip-dossier-autofocus='true']",
  });

  useEffect(() => {
    if (selectedItem || filteredItems.length === 0) return;
    setSelectedId(filteredItems[0].id);
    setDossierOpen(false);
  }, [filteredItems, selectedItem]);

  useEffect(() => {
    if (page <= totalPages) return;
    setPage(totalPages);
  }, [page, totalPages]);

  function announce(action, item) {
    const subject = item?.nome ? ` · ${item.nome}` : "";
    setNotice(`${action}${subject}. Simulação segura: nenhum dado foi alterado.`);
  }

  function chooseScope(nextScope) {
    setScope(nextScope);
    setPage(1);
    setDossierOpen(false);
  }

  function selectItem(item) {
    setSelectedId(item.id);
    setFiltersOpen(false);
    if (sheet.isSheet) setDossierOpen(true);
  }

  function changePage(nextPage) {
    const safePage = Math.max(1, Math.min(totalPages, nextPage));
    setPage(safePage);
    setSelectedId(filteredItems[(safePage - 1) * PAGE_SIZE]?.id || null);
    setDossierOpen(false);
  }

  const rows = pageItems.map((item, index) => {
    const latest = latestEventFor(item);
    const meta = latest ? HISTORY_META[latest.tipo] : null;
    const pending = item.transferenciaStatus === "aguardando_confirmacao";
    const repair = item.status === "Em conserto";
    const primaryLabel = repair ? "Completar" : pending ? "Confirmar" : "Movimentar";
    return {
      id: item.id,
      source: item,
      register: String((page - 1) * PAGE_SIZE + index + 1).padStart(3, "0"),
      name: item.nome,
      identifier: item.patrimonio || `#${item.id}`,
      category: item.categoria,
      position: positionOf(item),
      link: linkOf(item),
      manager: item.gerenteResponsavel || "",
      responsible: item.responsavel || "—",
      state: stateOf(item),
      movement: latest ? { label: meta?.label || latest.tipo, date: latest.data } : null,
      attention: repair || pending,
      selected: selectedId === item.id,
      primaryAction: {
        label: primaryLabel,
        icon: repair ? "wrench" : pending ? "check" : "route",
        onClick: () => announce(primaryLabel, item),
      },
      canEdit: true,
      canDelete: true,
    };
  });

  const selectedRow = rows.find((row) => row.id === selectedId) || null;
  const selectedHistory = selectedItem
    ? HISTORICO_PREVIEW_FIXTURE.filter((event) => event.itemId === selectedItem.id).map((event) => ({
        id: event.id,
        icon: HISTORY_META[event.tipo]?.icon || "file",
        label: HISTORY_META[event.tipo]?.label || event.tipo,
        detail: event.observacao,
        contextLabel: event.tipo === "recebimento_gerente" ? "Recebido por" : event.tipo === "envio_gerente" || event.tipo === "ponto" ? "Destino" : "",
        contextValue: event.tipo === "recebimento_gerente"
          ? event.responsavel
          : event.observacao.match(/(?:gerente|destino):\s*([^|]+)/i)?.[1]?.trim() || "",
        actor: event.executadoPorNomeSnapshot
          ? `${event.executadoPorNomeSnapshot} · ${event.executadoPorPerfilSnapshot === "administrador" ? "Administrador" : event.executadoPorPerfilSnapshot === "operador" ? "Operador" : "Gerente"}`
          : "Autor não registrado",
        actorKnown: Boolean(event.executadoPorNomeSnapshot),
        date: event.data,
      }))
    : [];

  const categorySummary = CATEGORIES.map((name) => {
    const items = EQUIPAMENTOS_PREVIEW_FIXTURE.filter((item) => item.categoria === name);
    return {
      name,
      total: items.length,
      available: items.filter((item) => item.status === "Disponível").length,
      route: items.filter((item) => item.status === "Em rota").length,
      repair: items.filter((item) => item.status === "Em conserto").length,
    };
  });

  const scopeOptions = [
    ["todos", "Base cadastrada", "todos os registros", globalCounts.total],
    ["interno", "Estoque interno", "prontos na base", globalCounts.interno],
    ["pontos", "Em pontos", "em operação", globalCounts.pontos],
    ["gerentes", "Com gerentes", "estoque ou transferência", globalCounts.gerentes],
    ["conserto", "Conserto", "em assistência", globalCounts.conserto],
  ];

  return (
    <div
      className={`app operations-shell command-flow-shell module-itens equipment-preview${light ? " tema-claro" : ""}`}
      data-preview-mode="safe-local"
      data-preview-route="/equipamentos"
      onKeyDown={sheet.panelProps.onKeyDown}
    >
      <style>{PREVIEW_STYLES}</style>

      <header className="equipment-preview__topbar">
        <div className="equipment-preview__brand">
          <img className="equipment-preview__mark" src="/brand/neptera/icons/neptera-favicon-48.png" alt="" aria-hidden="true" />
          <div>
            <strong>NEPTERA</strong>
            <span>Equipamentos · preview seguro</span>
          </div>
        </div>
        <span className="equipment-preview__safe">DEV local · nenhum backend conectado</span>
        <nav className="equipment-preview__theme" aria-label="Tema da prévia">
          <a href="?preview=equipamentos&tema=claro" aria-current={light ? "true" : undefined}>Claro</a>
          <a href="?preview=equipamentos&tema=escuro" aria-current={!light ? "true" : undefined}>Escuro</a>
        </nav>
      </header>

      <main className="main equipment-preview__main" onKeyDown={handleMainScrollKey} tabIndex={-1}>
        <section className="equipment-preview__heading" aria-labelledby="equipment-preview-title">
          <div className="equipment-preview__heading-copy">
            <span>Equipamentos / situação atual</span>
            <h1 id="equipment-preview-title">Equipamentos</h1>
            <p>Veja onde cada equipamento está, com quem está e o que aconteceu por último.</p>
          </div>
          <div className="equipment-preview__actions">
            <Button className="equip-cf-export-utility" size="sm" leadingIcon="spreadsheet" onClick={() => announce("Excel preparado localmente")}>Excel</Button>
            <Button className="equip-cf-export-utility" size="sm" leadingIcon="pdf" onClick={() => announce("PDF preparado localmente")}>PDF</Button>
            <Button size="sm" variant="primary" leadingIcon="plus" onClick={() => announce("Novo equipamento aberto")}>Novo equipamento</Button>
          </div>
        </section>

        <div className="equipment-preview__notice" role="status" aria-live="polite">
          <OperationIcon name="shield" size={16} />
          <span><strong>Ambiente isolado.</strong> {notice}</span>
        </div>

        <div className="equip-cf-control-line">
          <nav className="equip-cf-view-switch" aria-label="Visualização de equipamentos">
            {[["lista", "Lista"], ["resumo", "Resumo por situação"], ["rastro", "Movimentações"]].map(([value, label]) => (
              <button key={value} type="button" className={activeView === value ? "is-active" : ""} onClick={() => setActiveView(value)} aria-current={activeView === value ? "page" : undefined}>{label}</button>
            ))}
          </nav>
          <span className="equip-cf-control-context"><strong>{EQUIPAMENTOS_PREVIEW_FIXTURE.length}</strong> registros simulados</span>
        </div>

        <section className="equip-cf-position-strip" aria-label="Recortes de posição">
          {scopeOptions.map(([value, label, helper, count]) => (
            <button key={value} type="button" className={`${scope === value ? "is-active" : ""}${value === "conserto" && count ? " is-attention" : ""}`} aria-pressed={scope === value} onClick={() => chooseScope(value)}>
              <span>{label}</span><strong>{count}</strong><small>{helper}</small>
            </button>
          ))}
        </section>

        {activeView === "lista" ? (
          <section className="equip-cf-list equipment-preview__tab-panel" aria-label="Lista de equipamentos">
            <FilterBar
              className="equip-cf-filterbar"
              ariaHidden={sheet.isSheet && dossierOpen ? "true" : undefined}
              inert={sheet.isSheet && dossierOpen ? true : undefined}
              ariaLabel="Consulta de equipamentos"
              activeCount={activeFilterCount}
              secondaryOpen={filtersOpen}
              onSecondaryToggle={setFiltersOpen}
              onClear={() => { setCategory("Todas"); setStatus("Todos"); chooseScope("todos"); }}
              onApply={() => setFiltersOpen(false)}
              primary={<>
                <div className="equip-cf-search">
                  <label className="so-visually-hidden" htmlFor="equipment-preview-search">Buscar por equipamento, patrimônio, categoria, ponto ou gerente</label>
                  <OperationIcon name="search" size={16} />
                  <input id="equipment-preview-search" type="search" placeholder="Buscar equipamento, patrimônio, ponto ou gerente" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
                  {query ? <button type="button" aria-label="Limpar busca" onClick={() => { setQuery(""); setPage(1); }}><OperationIcon name="close" size={14} /></button> : null}
                </div>
                <span className="equip-cf-result-count" aria-live="polite"><strong>{filteredItems.length}</strong> resultado{filteredItems.length === 1 ? "" : "s"}</span>
              </>}
              secondary={<>
                <label><span>Escopo operacional</span><select value={scope} onChange={(event) => chooseScope(event.target.value)}><option value="todos">Todos</option><option value="interno">Estoque interno</option><option value="pontos">Em pontos</option><option value="gerentes">Com gerentes</option><option value="conserto">Conserto</option></select></label>
                <label><span>Categoria</span><select value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }}><option value="Todas">Todas as categorias</option>{CATEGORIES.map((name) => <option key={name}>{name}</option>)}</select></label>
                <label><span>Situação</span><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="Todos">Todas as situações</option>{STATUSES.map((name) => <option key={name}>{name}</option>)}</select></label>
              </>}
              chips={activeFilterCount ? <>
                {scope !== "todos" ? <button type="button" onClick={() => chooseScope("todos")}>{scopeOptions.find(([value]) => value === scope)?.[1]}<OperationIcon name="close" size={12} /></button> : null}
                {category !== "Todas" ? <button type="button" onClick={() => { setCategory("Todas"); setPage(1); }}>{category}<OperationIcon name="close" size={12} /></button> : null}
                {status !== "Todos" ? <button type="button" onClick={() => { setStatus("Todos"); setPage(1); }}>{status}<OperationIcon name="close" size={12} /></button> : null}
              </> : null}
            />

            <EquipmentInventoryLedger
              rows={rows}
              selected={selectedRow}
              history={selectedHistory}
              total={filteredItems.length}
              page={page}
              totalPages={totalPages}
              pageSize={PAGE_SIZE}
              onPageChange={changePage}
              onSelect={selectItem}
              onCloseDossier={closeDossier}
              onExecuteDossier={(action) => { action(); if (sheet.isSheet) closeDossier(); }}
              onOpenDetail={(item) => announce("Ficha consultada", item)}
              onEdit={(item) => announce("Edição aberta", item)}
              onDelete={(item) => announce("Exclusão revisada", item)}
              onOpenHistory={(item) => { announce("Movimentações consultadas", item); setActiveView("rastro"); closeDossier(); }}
              dossierSheet={sheet.isSheet}
              dossierOpen={dossierOpen}
              dossierRef={sheet.panelRef}
              iconByCategory={CATEGORY_ICONS}
              emptyDescription="Ajuste a busca ou remova um filtro para consultar outros registros."
            />
          </section>
        ) : null}

        {activeView === "resumo" ? (
          <section className="equipment-preview__tab-panel" aria-labelledby="equipment-preview-summary">
            <header className="equip-cf-section-head"><div><span className="cf-kicker">Composição da base</span><h2 id="equipment-preview-summary">Resumo por categoria</h2></div><span>Dados locais do mesmo cenário.</span></header>
            <div className="equipment-preview__summary">
              {categorySummary.map((item) => <article key={item.name}><span>{item.name}</span><strong>{item.total}</strong><small>{item.available} disponíveis · {item.route} em rota · {item.repair} em conserto</small></article>)}
            </div>
          </section>
        ) : null}

        {activeView === "rastro" ? (
          <section className="equipment-preview__tab-panel" aria-labelledby="equipment-preview-trace">
            <header className="equip-cf-section-head"><div><span className="cf-kicker">Movimentações</span><h2 id="equipment-preview-trace">Histórico dos equipamentos</h2></div><span>{HISTORICO_PREVIEW_FIXTURE.length} eventos simulados</span></header>
            <ol className="equipment-preview__trace">
              {HISTORICO_PREVIEW_FIXTURE.map((event) => <li key={event.id}><span className="equipment-preview__trace-icon"><OperationIcon name={HISTORY_META[event.tipo]?.icon || "file"} size={15} /></span><strong>{HISTORY_META[event.tipo]?.label || event.tipo}<br /><span>{event.itemNome}</span></strong><span className="equipment-preview__trace-detail">{event.observacao}<small>{event.executadoPorNomeSnapshot?`Realizado por ${event.executadoPorNomeSnapshot}`:"Autor não registrado"}</small></span><time>{event.data}</time></li>)}
            </ol>
          </section>
        ) : null}
      </main>
    </div>
  );
}
