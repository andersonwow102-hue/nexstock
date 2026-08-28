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
const dashboard = read("DashboardPage.jsx");
const dashboardCss = read("DashboardPage.css");
const points = read("PointsPage.jsx");
const pointsCss = read("PointsCommandFlow.css");
const management = read("ManagementPage.jsx");
const loginManager = read("LoginManagerPage.jsx");
const adminCss = read("AdminCommandFlow.css");
const devedores = read("DevedoresPage.jsx");
const devedoresCss = read("DevedoresPage.css");

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
  ]) {
    assert.match(operationsUi, new RegExp(`\\b${icon}:\\s*<>`), `ícone compartilhado ausente: ${icon}`);
  }

  assert.match(app, /function Icon\([\s\S]*?<OperationIcon/);
  assert.doesNotMatch(app, /const\s+(?:APP_)?ICON_PATHS\s*=/);
  assert.match(dashboard, /import \{ OperationIcon \} from "\.\/components\/operations\/OperationsUI\.jsx"/);
  assert.doesNotMatch(dashboard, /(?:DASHBOARD_)?ICON_PATHS|function\s+DashboardIcon|<svg\b/);
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
    "equip-cf-workspace",
    "equip-cf-ledger",
    "equip-cf-row",
    "equip-cf-flow",
    "equip-cf-dossier",
  ], "Equipamentos");
  assertMarkers(commandFlowCss, [
    ".equip-cf-control-line",
    ".equip-cf-position-strip",
    ".equip-cf-filterbar",
    ".equip-cf-workspace",
    ".equip-cf-ledger",
    ".equip-cf-dossier",
  ], "Equipamentos CSS");
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
  ], "Pontos");
  assertMarkers(pointsCss, [
    ".points-command-flow {",
    ".points-command-flow .pcf-command-header",
    ".points-command-flow .pcf-workbench",
    ".points-command-flow .pcf-dossier",
    "@media (max-width: 900px)",
    "@media (prefers-reduced-motion: reduce)",
  ], "Pontos CSS");
});

test("Buscar Gerentes preserva seleção, ledgers de responsabilidade e dossiê", () => {
  assertMarkers(app, [
    'aba==="buscar-gerentes"',
    "consulta-cf-head",
    "consulta-cf-page",
    "consulta-cf-rail",
    "consulta-cf-manager-list",
    "consulta-cf-position",
    "consulta-cf-points-ledger",
    "consulta-cf-equipment-ledger",
    "consulta-cf-dossier",
  ], "Buscar Gerentes");
  assertMarkers(commandFlowCss, [
    ".consulta-cf-page",
    ".consulta-cf-rail",
    ".consulta-cf-ledgers",
    ".consulta-cf-dossier",
  ], "Buscar Gerentes CSS");
});

test("Senhas preserva navegação por necessidade, editores, ledger e distribuição de aplicativos", () => {
  assertMarkers(app, [
    'aba==="senhas"',
    "senhas-cf-page",
    "senhas-cf-commandline",
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
    ".senhas-cf-workspace",
    ".senhas-cf-access-list",
  ], "Senhas CSS");
});

test("Histórico preserva filtros recolhidos, ledger responsivo e dossiê do evento", () => {
  assertMarkers(app, [
    'aba==="historico"',
    "historico-cf-page",
    "historico-cf-filterbar",
    "filtrosHistoricoAbertos",
    "historico-cf-workspace",
    "historico-cf-ledger",
    "historico-cf-row",
    "historico-cf-dossier",
  ], "Histórico");
  assertMarkers(commandFlowCss, [
    ".historico-cf-page",
    ".historico-cf-filterbar",
    ".historico-cf-workspace",
    ".historico-cf-dossier",
  ], "Histórico CSS");
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
  ], "Central de Acessos");
  assertMarkers(loginManager, [
    'import "./AdminCommandFlow.css"',
    "admin-command-flow--logins",
    "admin-cf-page-bar",
    "admin-cf-filter-bar",
    "admin-cf-master-detail",
    "admin-cf-dossier",
  ], "Gerenciar Logins");
  assertMarkers(adminCss, [
    ".admin-command-flow {",
    ".admin-cf-page-bar",
    ".admin-cf-filter-bar",
    ".admin-cf-master-detail",
    ".admin-cf-dossier",
    ".admin-command-flow .login-manager-grid",
    "@media (max-width: 860px)",
    "@media (prefers-reduced-motion: reduce)",
  ], "Admin CSS");
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
    "<FechamentoPage",
    'className="secao fechamento-page"',
    "fechamento-progress",
    "fechamento-step-label",
    "fechamento-section-label",
  ], "Fechamento");
  assert.doesNotMatch(app, /<div className="fechamento-hero">/);
  assert.match(appCss, /\.fechamento-page\s*\{/);
  assert.match(appCss, /@media \(max-width: 760px\)[\s\S]*?\.fechamento-page/);

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
