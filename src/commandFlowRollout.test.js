import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const srcDir = path.dirname(fileURLToPath(import.meta.url));

function read(relativePath) {
  return fs.readFileSync(path.join(srcDir, relativePath), "utf8");
}

function filesRecursively(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const absolutePath = path.join(directory, entry.name);
    return entry.isDirectory() ? filesRecursively(absolutePath) : [absolutePath];
  });
}

function assertMarkers(source, markers, surface) {
  for (const marker of markers) {
    assert.ok(source.includes(marker), `${surface} perdeu o marcador estrutural: ${marker}`);
  }
}

function importPaths(source) {
  return [...source.matchAll(/from\s+["']([^"']+)["']/g)].map(match => match[1]);
}

function isBackendPath(importPath) {
  return /(?:^|\/)(?:db|supabase|[^/]*api)\.js$/i.test(importPath);
}

const app = read("App.jsx");
const appCss = read("App.css");
const foundations = read("styles/foundations.css");
const commandFlowCss = read("styles/command-flow.css");
const operationsUi = read("components/operations/OperationsUI.jsx");
const responsiveSheet = read("components/operations/useResponsiveSheet.js");
const mainScrollLock = read("components/operations/mainScrollLock.js");
const dashboard = read("DashboardPage.jsx");
const dashboardCss = read("DashboardPage.css");
const points = read("PointsPage.jsx");
const pointsCss = read("PointsCommandFlow.css");
const management = read("ManagementPage.jsx");
const loginManager = read("LoginManagerPage.jsx");
const adminCss = read("AdminCommandFlow.css");
const devedores = read("DevedoresPage.jsx");
const devedoresCss = read("DevedoresPage.css");
const fechamentoWorkbench = read("FechamentoWorkbench.jsx");
const fechamentoWorkbenchCss = read("FechamentoWorkbench.css");
const equipmentInventoryLedger = read("EquipmentInventoryLedger.jsx");
const equipmentInventoryLedgerCss = read("EquipmentInventoryLedger.css");
const historicoTimeline = read("HistoricoTimelinePage.jsx");
const historicoTimelineCss = read("HistoricoTimeline.css");

test("fundações e shell Command Flow são globais e mantêm o drawer acessível", () => {
  assertMarkers(app, [
    'import "./styles/foundations.css"',
    'import "./styles/command-flow.css"',
    "operations-shell command-flow-shell module-${aba}",
    'id="stock-on-primary-navigation"',
    "inert={drawerContextual&&!sidebarAberta?true:undefined}",
    'aria-label="Módulos do NEPTERA"',
    'className="sidebar-utilities"',
  ], "App shell");

  assertMarkers(foundations, [
    "--font-sans:",
    "--surface-canvas:",
    "--surface-navigation:",
    "--brand-action:",
    ".tema-claro",
    "@media (prefers-reduced-motion: reduce)",
  ], "fundações");

  assertMarkers(commandFlowCss, [
    ".command-flow-shell {",
    ".command-flow-shell .sidebar {",
    ".command-flow-shell .nav-item.active {",
    ".command-flow-shell .sidebar-utilities {",
    ".command-flow-shell .main {",
    "@media (max-width: 1024px)",
    "@media (prefers-reduced-motion: reduce)",
  ], "shell CSS");
});

test("OperationIcon é o catálogo compartilhado e o Dashboard não recria mapas SVG", () => {
  assert.match(operationsUi, /const ICON_PATHS\s*=\s*\{/);
  assert.match(operationsUi, /export function OperationIcon\(/);

  for (const icon of [
    "dashboard", "package", "mapPin", "history", "shieldKey", "sun", "moon",
    "database", "logOut", "tv", "printer", "tablet", "banknote", "warning",
    "minus", "eyeOff",
  ]) {
    assert.match(operationsUi, new RegExp(`\\b${icon}:\\s*<>`), `ícone compartilhado ausente: ${icon}`);
  }

  assert.match(app, /function Icon\([\s\S]*?<OperationIcon/);
  assert.doesNotMatch(app, /const\s+(?:APP_)?ICON_PATHS\s*=/);
  assert.match(dashboard, /import \{ OperationIcon \} from "\.\/components\/operations\/OperationsUI\.jsx"/);
  assert.doesNotMatch(dashboard, /(?:DASHBOARD_)?ICON_PATHS|function\s+DashboardIcon|<svg\b/);
});

test("shell expõe navegação direta, busca global acessível e utilidades hierarquizadas", () => {
  assertMarkers(app, [
    "MODULO_PARA_ABA",
    "ABA_PARA_MODULO",
    "abaInicialDaUrl",
    "atualizarUrlDoModulo",
    'window.addEventListener("popstate"',
    "perfilCarregado",
    "abaPermitida",
    'aba==="logins"&&administrador',
    'role="search"',
    'htmlFor="neptera-global-search-input"',
    'aria-controls="neptera-global-search-results"',
    'aria-current={aba==="dashboard"?"page":undefined}',
    "sidebar-close",
    "abrirForaDoDrawer",
    "sidebar-utility-theme",
    "sidebar-utility-danger",
  ], "Shell navegável");
  assertMarkers(commandFlowCss, [
    ".command-flow-shell .busca-topo-control",
    ".command-flow-shell .busca-topo-resultados",
    ".command-flow-shell .sidebar-close",
    ".command-flow-shell .sidebar-utility-theme",
  ], "Shell CSS");
  assert.match(commandFlowCss, /@media \(max-width: 1024px\)[\s\S]*?\.command-flow-shell \.busca-topo-resultados \{[\s\S]*?position:\s*static;[\s\S]*?width:\s*100%;/);
  assert.match(app, /<OperationModal title="Sair do sistema"[\s\S]*?role="alertdialog"/);
  assert.match(app, /function ModalAlterarSenha[\s\S]*?<OperationModal/);
  assert.doesNotMatch(app, /gerente-welcome|avatarLendario/);
  assert.doesNotMatch(appCss, /animation:[^;]*(?:gerente|financeiro|prestacao|pulse-bg|confirmacao)[^;]*infinite/i);
  assertMarkers(mainScrollLock, [
    "new WeakMap()",
    "tokens: new Set()",
    'style.overflowY = "hidden"',
    "current.tokens.size",
  ], "Scroll lock compartilhado");
  for (const source of [app, points, operationsUi, responsiveSheet]) {
    assert.doesNotMatch(source, /document\.documentElement\.style\.overflow|querySelector\(["']\.main["']\).*style\.overflow/s);
  }
});

test("tema claro global preserva base quente e Pontos usa acabamento mineral autorizado", () => {
  assertMarkers(foundations, [
    "--surface-canvas: #f3f3f1",
    "--surface-navigation: #f8f8f6",
    "--surface-panel: #fffefb",
    "--border-subtle: #d9dad5",
    "--brand-action-vivid: #9c4b33",
    "--text-strong: #242724",
    "--text-muted: #626963",
    "--text-disabled: #626963",
  ], "Tema claro intermediário");
  assert.doesNotMatch(foundations, /--surface-canvas:\s*#f2eee7|--surface-panel:\s*#fffdf8/);
  assert.match(pointsCss, /\.app\.tema-claro \.points-command-flow\s*\{[\s\S]*?--pcf-canvas:\s*#f1f3f0/);
  assert.match(pointsCss, /\.app\.tema-claro \.points-command-flow\s*\{[\s\S]*?--pcf-accent:\s*#2e747b/);
  assert.match(pointsCss, /--pcf-dim:\s*#7b8582/);
});

test("fluxo vertical mantém um único scroll principal e overlays somente onde necessários", () => {
  assert.match(commandFlowCss, /\.app\.command-flow-shell\s*\{[\s\S]*?height:\s*100dvh;[\s\S]*?overflow:\s*hidden;/);
  assert.match(commandFlowCss, /\.command-flow-shell \.main\s*\{[\s\S]*?min-height:\s*0;[\s\S]*?overflow-y:\s*auto;[\s\S]*?overscroll-behavior-y:\s*auto;/);
  assert.match(app, /if\(aba!=="itens"\|\|!dossieEquipamentoSheet\|\|!dossieEquipamentoAberto\)return undefined/);
  assert.match(app, /function navegar\(novaAba\)[\s\S]*?setDossieEquipamentoAberto\(false\);/);
  assert.doesNotMatch(historicoTimelineCss, /position:\s*fixed/);
  assert.match(points, /acquireMainScrollLock/);
  assert.match(adminCss, /@media \(max-width: 900px\)[\s\S]*?\.admin-command-flow \.admin-cf-dossier,[\s\S]*?position:\s*fixed;/);
  assert.match(fechamentoWorkbenchCss, /data-composition="final-a1-a3"\] \.fechamento-summary\s*\{[\s\S]*?position:\s*sticky;[\s\S]*?top:\s*14px;/);
  assert.match(fechamentoWorkbenchCss, /@media \(max-width: 1240px\)/);
});

test("Dashboard preserva mesa operacional, drill-downs e escopo visual próprio", () => {
  assertMarkers(dashboard, [
    "stock-dashboard",
    "dash-cf-commandbar",
    "dash-cf-position-manifest",
    "dash-cf-attention",
    "dash-cf-category-ledger",
    "dash-cf-points-ledger",
    "dash-cf-changes",
    'aria-controls="stock-on-primary-navigation"',
    "onSelecionarCategoria",
    "onSelecionarConserto",
    "onSelecionarDisponiveis",
    "onSelecionarGerentes",
    "onSelecionarPontos",
    "onSelecionarTotal",
  ], "Dashboard");

  assertMarkers(dashboardCss, [
    ".app.dashboard-shell {",
    "--dash-cf-bg: var(--surface-canvas)",
    "--dash-cf-copper: var(--brand-action)",
    "@media (max-width: 760px)",
    "@media (prefers-reduced-motion: reduce)",
  ], "Dashboard CSS");
  assert.doesNotMatch(dashboardCss, /\.app\.dashboard-shell\s*>\s*\.sidebar/);
});

test("Equipamentos mantém comando compacto, posição, ledger, progressão e dossiê", () => {
  assertMarkers(app, [
    'aba==="itens"',
    "equip-cf-head",
    "equip-cf-control-line",
    "equip-cf-position-strip",
    "equip-cf-filterbar",
    "equip-cf-export-utility",
    "EquipmentInventoryLedger",
    "linhasEquipamentosLedger",
    "historicoEquipamentoLedger",
    "acaoPrimariaEquipamento",
    'item.consertoAssistencia||"Assistência não informada"',
    'aria-label="Fluxo da movimentação: origem, ação e destino"',
    "<span>Origem</span>",
    "<span>Movimentação</span>",
    "<span>Destino</span>",
    "equip-cf-form-modal",
    'title="Ficha do equipamento"',
  ], "Equipamentos real");
  assert.doesNotMatch(app, /item\.consertoAssistencia\|\|item\.responsavel/, "Conserto não deve usar responsável genérico como localização técnica");
  assertMarkers(equipmentInventoryLedger, [
    "equipment-inventory-ledger__workspace",
    "equipment-inventory-ledger__ledger",
    "equipment-inventory-ledger__row",
    "equipment-inventory-ledger__current",
    "equipment-inventory-ledger__dossier",
    "equipment-inventory-ledger__grid",
    "Última movimentação",
    "onExecuteDossier",
    "onOpenDetail",
    "onEdit",
    "onDelete",
    "onOpenHistory",
  ], "Inventory Ledger compartilhado");
  assert.doesNotMatch(equipmentInventoryLedger, /\b(?:cf-empty|cf-ledger|cf-dossier|equip-cf-(?:workspace|ledger|row|flow|dossier))\b/, "Inventory Ledger deve permanecer isolado do CSS legado");
  assertMarkers(commandFlowCss, [
    ".equip-cf-control-line",
    ".equip-cf-position-strip",
    ".equip-cf-filterbar",
    ".equip-cf-export-utility",
    "button + button::before",
    "is-manager-scope button:nth-child(n+4)",
    ".app.command-flow-shell.module-itens .equip-cf-position-note",
  ], "Equipamentos shell CSS");
  assertMarkers(equipmentInventoryLedgerCss, [
    "--equipment-ledger-dossier: clamp(350px, 29vw, 380px)",
    "--equipment-ledger-rule:",
    "--equipment-ledger-row: 70px",
    ".equipment-inventory-ledger__row:where(:hover, .is-selected, :focus-within)",
    "@media (min-width: 1600px)",
    "@media (hover: none), (pointer: coarse)",
    "min-width: 728px",
    "@media (max-width: 1320px)",
    "@media (max-width: 780px)",
    "@media (prefers-reduced-motion: reduce)",
    "max-height: calc(100dvh - 28px)",
    "overscroll-behavior: contain",
    "scrollbar-gutter: stable",
  ], "Inventory Ledger CSS");
  assert.equal(importPaths(equipmentInventoryLedger).some(isBackendPath), false, "Inventory Ledger visual não deve importar backend");

  const listStart = app.indexOf('<section className="equip-lista equip-cf-list">');
  const filterStart = app.indexOf("<FilterBar", listStart);
  const ledgerStart = app.indexOf("<EquipmentInventoryLedger", listStart);
  const operationalQueuesStart = app.indexOf("recebimentosPendentes.length", listStart);
  assert.ok(listStart >= 0 && filterStart > listStart && ledgerStart > filterStart && operationalQueuesStart > ledgerStart,
    "busca e Inventory Ledger devem preceder as filas operacionais");
});

test("Pontos mantém leitura da rede, ledger territorial e dossiê", () => {
  assertMarkers(points, [
    'import "./PointsCommandFlow.css"',
    "points-command-flow",
    "pcf-command-header",
    "pcf-overview",
    "pcf-workbench",
    "pcf-master-detail",
    "pcf-records",
    "pcf-dossier",
    "Modal as OperationModal",
    "pcf-operation-modal",
    "blocked={enviando}",
  ], "Pontos");
  assert.doesNotMatch(points, /<div className="modal-overlay"/, "Pontos não deve recriar overlays modais legados");
  assertMarkers(pointsCss, [
    ".points-command-flow {",
    ".points-command-flow .pcf-command-header",
    ".points-command-flow .pcf-workbench",
    ".points-command-flow .pcf-dossier",
    ".points-command-flow .pcf-operation-modal",
    "@media (max-width: 900px)",
    "@media (prefers-reduced-motion: reduce)",
  ], "Pontos CSS");
  assert.match(pointsCss, /@media \(max-width: 760px\)[\s\S]*?\.points-command-flow \.pcf-operation-modal \.so-modal__close[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;/);
});

test("Buscar Gerentes preserva seleção e alterna um ledger por vez", () => {
  assertMarkers(app, [
    'aba==="buscar-gerentes"',
    "consulta-cf-head",
    "consulta-cf-page",
    "consulta-cf-rail",
    "consulta-cf-manager-list",
    'aria-label="Buscar gerente"',
    "consulta-cf-position",
    "consulta-cf-view-switch",
    'role="group"',
    "consultaGerenteVisao",
    'consultaGerenteVisao==="pontos"?',
    'setConsultaEquipFiltro(atual=>atual==="pontos"?"todos":"pontos")',
    'setConsultaEquipFiltro(atual=>atual==="gerente"?"todos":"gerente")',
    'setConsultaEquipFiltro(atual=>atual==="conserto"?"todos":"conserto")',
    "consulta-cf-equipment-filters",
    "consulta-cf-points-ledger",
    "consulta-cf-equipment-ledger",
    "consulta-cf-dossier",
  ], "Buscar Gerentes");
  assertMarkers(commandFlowCss, [
    ".consulta-cf-page",
    ".consulta-cf-rail",
    ".consulta-cf-ledgers",
    ".consulta-cf-dossier",
    ".consulta-cf-view-switch",
    ".consulta-cf-equipment-filters",
    "@media (max-width: 1360px)",
    "@media (max-width: 900px)",
    ".consulta-cf-mobile-select { display: grid;",
  ], "Buscar Gerentes CSS");
  assert.doesNotMatch(commandFlowCss, /\.consulta-cf-manager-list\s*\{[^}]*max-height:\s*calc\(/);
});

test("Senhas preserva navegação por necessidade, editores, ledger e distribuição de aplicativos", () => {
  assertMarkers(app, [
    'aba==="senhas"',
    "senhas-cf-page",
    "senhas-cf-commandline",
    "senhas-cf-layout",
    "senhas-cf-filterbar",
    "filtrosCredenciaisAbertos",
    "acessosFiltrados",
    'areaAtiva==="credenciais"',
    "senhas-cf-access-editor",
    "senhas-cf-app-editor",
    "senhas-cf-ledger",
    "senhas-cf-access-list",
    "senhas-cf-downloads",
  ], "Senhas");
  assertMarkers(commandFlowCss, [
    ".senhas-cf-page",
    ".senhas-cf-commandline",
    ".senhas-cf-layout",
    ".senhas-cf-filterbar",
    ".senhas-cf-workspace",
    ".senhas-cf-access-list",
  ], "Senhas CSS");
  assert.match(app, /<span>Senha<\/span><input type="password" autoComplete="off"/);
  assert.match(app, /role=\{erro\?"alert":"status"\}/);
});

test("Histórico usa Chronological Ledger, filtros recolhidos e detalhe inline", () => {
  assertMarkers(app, [
    'aba==="historico"',
    "HistoricoTimelinePage",
    "equipmentHistory={historicoOperacional}",
    "pointHistory={historicoPontosOperacional}",
    "loadError={erroHistorico}",
  ], "Histórico");
  assertMarkers(historicoTimeline, [
    "Histórico operacional",
    "history-timeline__period",
    "history-timeline__secondary-filters",
    "history-timeline__chapter",
    "history-timeline__spine",
    "history-timeline__event-details",
    "aria-expanded",
    "filteredEvents",
  ], "Chronological Ledger");
  assertMarkers(historicoTimelineCss, [
    ".history-timeline__chapter-head",
    ".history-timeline__event::before",
    ".history-timeline__event-details",
    "@media (max-width: 760px)",
    "@media (prefers-reduced-motion: reduce)",
  ], "Chronological Ledger CSS");
  assert.doesNotMatch(historicoTimeline, /Limpar histórico|dossiê/i);
  assert.doesNotMatch(app, /limparHistoricoEquipamentos|function limparHistorico\(/);
});

test("Central de Acessos e Logins compartilham a arquitetura administrativa", () => {
  assertMarkers(management, [
    'import "./AdminCommandFlow.css"',
    "admin-command-flow--access",
    "admin-cf-page-bar",
    "admin-cf-filter-bar",
    "admin-cf-access-workspace",
    "admin-cf-directory",
    "admin-cf-dossier",
    "useResponsiveSheet",
    "data-sheet-autofocus",
    "admin-cf-password-control",
    "copiarSenhaCredencial",
    "senhaAcessoVisivel",
  ], "Central de Acessos");
  assertMarkers(loginManager, [
    'import "./AdminCommandFlow.css"',
    "admin-command-flow--logins",
    "admin-cf-page-bar",
    "admin-cf-filter-bar",
    "admin-cf-master-detail",
    "admin-cf-dossier",
    "useResponsiveSheet",
    "data-sheet-autofocus",
    "estadoConta",
    "Temporário",
    "admin-cf-password-control",
    "copiarSenhaCredencial",
    "senhaEdicaoVisivel",
  ], "Gerenciar Logins");
  assertMarkers(adminCss, [
    ".admin-command-flow {",
    ".admin-cf-page-bar",
    ".admin-cf-filter-bar",
    ".admin-cf-master-detail",
    ".admin-cf-dossier",
    ".admin-cf-password-action",
    ".admin-cf-credential-feedback",
    ".admin-command-flow .login-manager-grid",
    "@media (max-width: 860px)",
    "@media (prefers-reduced-motion: reduce)",
  ], "Admin CSS");

  assertMarkers(responsiveSheet, [
    "FOCUSABLE_SELECTOR",
    "matchMedia",
    'event.key === "Escape"',
    "previousFocus",
    "acquireMainScrollLock",
    "inert:",
  ], "Sheet responsivo compartilhado");
  assert.doesNotMatch(management, /Senha provisória \*<\/label><input type="text"/);
  assert.doesNotMatch(loginManager, /(?:Nova senha|Senha provisória|Confirmar senha) \*<\/label><input type="text"/);
  assert.match(management, /setDossieAberto\(false\);[\s\S]*?setUsuarioAcesso\(item\)/);
  assert.match(loginManager, /setDossieAberto\(false\);[\s\S]*?setModalSenha\(usuario\)/);
  assert.match(management, /aria-pressed=\{senha(?:Acesso|Novo)Visivel\}/);
  assert.match(loginManager, /aria-pressed=\{senha(?:Edicao|Novo)Visivel\}/);
  assert.match(adminCss, /@media \(max-width: 760px\)[\s\S]*?\.admin-cf-password-action\s*\{[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;/);
});

test("Devedores aprovado mantém rail, command bar, ledger e dossiê", () => {
  assertMarkers(devedores, [
    "dev-command-flow",
    "dev-cf-rail",
    "dev-cf-command-bar",
    "dev-cf-queues",
    "dev-cf-workspace",
    "dev-cf-ledger-shell",
    "dev-cf-ledger",
    "dev-cf-dossier",
  ], "Devedores");
  assertMarkers(devedoresCss, [
    ".dev-command-flow {",
    ".dev-cf-command-bar",
    ".dev-cf-ledger-shell",
    ".dev-cf-dossier",
    "@media (prefers-reduced-motion: reduce)",
  ], "Devedores CSS");
});

test("Fechamento conserva suas regras em progressão estrutural responsiva", () => {
  assertMarkers(app, [
    'aba==="fechamento"',
    "<FechamentoModule",
    "<FechamentoPage",
    "<FechamentoWorkbench",
  ], "Integração do Fechamento");
  assertMarkers(fechamentoWorkbench, [
    'className="secao fechamento-page"',
    'data-layout="workbench"',
    "fechamento-progress",
    "fechamento-step-label",
    "fechamento-section-label",
    "fechamento-summary",
    "fechamento-matriz",
    "fechamento-publicacao",
    "aria-current",
    "aria-live",
    "inert={!revisaoAberta",
  ], "Mesa de conferência do Fechamento");
  assert.doesNotMatch(app, /<div className="fechamento-hero">/);
  assert.doesNotMatch(fechamentoWorkbench, /fechamento-hero/);
  assert.match(appCss, /\.fechamento-page\s*\{/);
  assert.match(appCss, /@media \(max-width: 760px\)[\s\S]*?\.fechamento-page/);
  assert.match(fechamentoWorkbenchCss, /\.fechamento-page\[data-layout="workbench"\]/);
  assert.match(fechamentoWorkbenchCss, /@media \(max-width: 900px\)/);
  assert.match(fechamentoWorkbenchCss, /@media \(prefers-reduced-motion: reduce\)/);

  const dedicatedCssFiles = fs.readdirSync(srcDir)
    .filter(file => /(?:fechamento|closing).*\.css$/i.test(file));
  for (const file of dedicatedCssFiles) {
    const source = read(file);
    assert.match(source, /(?:fechamento|closing)/i, `${file} perdeu seu escopo`);
    assert.match(source, /@media \(max-width:/, `${file} não possui reinterpretação responsiva`);
  }
});

test("JSX do produto não usa emojis como iconografia nem recupera a Diretriz rejeitada", () => {
  const jsxFiles = filesRecursively(srcDir).filter(file => file.endsWith(".jsx"));
  const residues = [];

  for (const file of jsxFiles) {
    const source = fs.readFileSync(file, "utf8");
    const relativePath = path.relative(srcDir, file).replaceAll("\\", "/");
    source.split(/\r?\n/).forEach((line, index) => {
      if (/\p{Extended_Pictographic}/u.test(line)) residues.push(`${relativePath}:${index + 1}: emoji`);
      if (/Diretriz do dia/i.test(line)) residues.push(`${relativePath}:${index + 1}: direção rejeitada`);
    });
  }

  assert.deepEqual(residues, []);
});

test("componentes visuais mantêm apenas os caminhos backend já estabelecidos", () => {
  const approvedBackendImports = new Map([
    ["App.jsx", ["./db.js", "./supabase.js"]],
    ["DashboardPage.jsx", []],
    ["PointsPage.jsx", ["./db.js"]],
    ["LoginManagerPage.jsx", ["./db.js"]],
    ["ManagementPage.jsx", ["./db.js"]],
    ["DevedoresPage.jsx", ["./devedoresApi.js"]],
  ]);

  for (const [file, approved] of approvedBackendImports) {
    const actual = importPaths(read(file)).filter(isBackendPath).sort();
    assert.deepEqual(actual, [...approved].sort(), `${file} alterou seus caminhos de backend`);
  }
});
