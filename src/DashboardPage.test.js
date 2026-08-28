import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const pagina = fs.readFileSync(new URL("./DashboardPage.jsx", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("./DashboardPage.css", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("./App.jsx", import.meta.url), "utf8");

test("Dashboard permanece isolado da camada de dados e de mutações", () => {
  assert.doesNotMatch(pagina, /supabase|\.\/db\.js|fetch\(|axios|insert\(|update\(|delete\(/i);
  assert.match(app, /import DashboardPage from "\.\/DashboardPage\.jsx"/);
  assert.match(app, /aba==="dashboard"&&\(\s*<DashboardPage/);
});

test("Dashboard recebe apenas métricas reais já derivadas pelo Sistema", () => {
  for (const propriedade of [
    "totalGeral",
    "totalDisponivel",
    "totalEmRota",
    "totalComGerentes",
    "totalConserto",
    "solicitacoesConsertoPendentes",
    "porCategoria",
    "pontosComEquipamentos",
    "historicoOperacional",
  ]) {
    assert.match(app, new RegExp(`${propriedade}=\\{${propriedade}\\}`), `prop ausente: ${propriedade}`);
  }
  assert.doesNotMatch(pagina, /Math\.random|mock|fixture|exemplo|estimad[oa]/i);
});

test("drill-downs preservam os contratos funcionais do Dashboard anterior", () => {
  assert.match(app, /onSelecionarTotal=\{\(\)=>\{navegar\("itens"\);setFiltroEscopoEquip\("todos"\);setFiltroSt\("Todos"\);\}\}/);
  assert.match(app, /onSelecionarDisponiveis=\{\(\)=>\{navegar\("itens"\);setFiltroEscopoEquip\(gerenteAtual\?"todos":"interno"\);setFiltroSt\("Disponível"\);\}\}/);
  assert.match(app, /onSelecionarPontos=\{\(\)=>\{navegar\("itens"\);setFiltroEscopoEquip\(gerenteAtual\?"todos":"pontos"\);setFiltroSt\("Em rota"\);\}\}/);
  assert.match(app, /onSelecionarGerentes=\{\(\)=>\{navegar\("itens"\);setFiltroEscopoEquip\("gerentes"\);setFiltroSt\("Todos"\);\}\}/);
  assert.match(app, /onSelecionarConserto=\{\(\)=>\{navegar\("itens"\);setFiltroEscopoEquip\("conserto"\);setFiltroSt\("Todos"\);\}\}/);
  assert.match(app, /onSelecionarCategoria=\{categoria=>\{navegar\("itens"\);setFiltroCatEquip\(categoria\);setAbaEquip\("lista"\);\}\}/);
});

test("arquitetura visual organiza posição, próxima ação e rastro sem grade genérica de cards", () => {
  for (const termo of [
    "Central de posição",
    "Onde o estoque está agora",
    "Saúde por categoria",
    "Próxima leitura",
    "Pontos com equipamentos",
    "Movimentações recentes",
  ]) {
    assert.ok(pagina.includes(termo), `ausente: ${termo}`);
  }
  assert.match(pagina, /className="dash-cf-position-track"/);
  assert.match(pagina, /className="dash-cf-ledger dash-cf-category-panel"/);
  assert.doesNotMatch(css, /linear-gradient|radial-gradient/);
});

test("interface mantém variação operacional por gerente", () => {
  assert.match(pagina, /const gerente = Boolean\(gerenteAtual\)/);
  assert.match(pagina, /const operador = perfilAtual\.perfil === "operador"/);
  assert.match(pagina, /\{!gerente \? <PositionNode[\s\S]*?label="Com gerentes"/);
  assert.match(pagina, /\{!gerente \? <PositionNode[\s\S]*?label="Conserto"/);
  assert.match(pagina, /gerente \? "Disponibilidade da carteira" : "Composição do estoque interno"/);
  assert.match(pagina, /Carteira de \$\{gerenteNomeBase \|\| gerenteAtual\}/);
  assert.match(pagina, /title: operador \? "Validar solicitações de conserto" : "Acompanhar solicitações de conserto"/);
  assert.match(pagina, /onClick: onSelecionarPontos/);
});

test("estados vazios e sem urgência permanecem explícitos", () => {
  assert.match(pagina, /Nenhum equipamento está ligado a um ponto/);
  assert.match(pagina, /Nenhuma movimentação registrada/);
  assert.match(pagina, /Nenhuma fila crítica agora/);
  assert.match(pagina, /Base sem equipamentos neste recorte/);
});

test("menu mobile possui contrato de diálogo, Escape, trap e restauração de foco", () => {
  assert.match(pagina, /aria-controls="stock-on-primary-navigation"/);
  assert.match(pagina, /aria-expanded=\{menuAberto\}/);
  assert.match(app, /const drawerDashboard=aba==="dashboard"&&navegacaoCompacta/);
  assert.match(app, /const drawerContextual=drawerDevedores\|\|drawerDashboard/);
  assert.match(app, /evento\.key==="Escape"/);
  assert.match(app, /ultimoItem\.focus\(\)/);
  assert.match(app, /restaurarFocoSidebar\(\)/);
  assert.match(app, /inert=\{drawerContextual&&!sidebarAberta\?true:undefined\}/);
});

test("temas Command Flow usam carbono, mineral e cobre com escopo próprio", () => {
  assert.match(css, /\.app\.dashboard-shell\s*\{/);
  assert.match(css, /--dash-cf-bg: #101216/);
  assert.match(css, /--dash-cf-copper: #a65f52/);
  assert.match(css, /\.app\.tema-claro\.dashboard-shell/);
  assert.match(css, /--dash-cf-bg: #f4f3ef/);
  assert.match(css, /\.stock-dashboard/);
  assert.doesNotMatch(css, /\.secao\s*[,{]|\.tabela\s*[,{]|\.topbar\s*[,{]/);
});

test("responsividade mantém densidade desktop e reinterpreta tablet e mobile", () => {
  for (const largura of [1240, 1024, 760, 480]) {
    assert.match(css, new RegExp(`@media \\(max-width: ${largura}px\\)`), `breakpoint ausente: ${largura}`);
  }
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.dash-cf-position-track[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.dash-cf-history-table\s*\{\s*display: none/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.dash-cf-history-cards\s*\{\s*display: grid/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /height: 100dvh/);
  assert.match(css, /@media \(max-width: 1024px\)[\s\S]*?\.app\.dashboard-shell > \.sidebar/);
});

test("movimento é finito, roda só na primeira visita e respeita preferência reduzida", () => {
  assert.match(app, /const \[dashboardApresentado,setDashboardApresentado\]=useState\(false\)/);
  assert.match(app, /animarEntrada=\{!dashboardApresentado\}/);
  assert.match(app, /onEntradaConcluida=\{setDashboardApresentado\}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(css, /animation[^;]*infinite/);
  assert.match(pagina, /matchMedia\?\.\("\(prefers-reduced-motion: reduce\)"\)/);
});

test("controles principais possuem alvo móvel e foco visível", () => {
  assert.match(css, /\.dash-cf-menu[\s\S]*?height: 44px[\s\S]*?width: 44px/);
  assert.match(css, /\.stock-dashboard button:focus-visible/);
  assert.match(pagina, /aria-label="Atalhos do Dashboard"/);
  for (const rotulo of ["Abrir equipamentos", "Abrir pontos", "Abrir histórico"]) {
    assert.match(pagina, new RegExp(`aria-label="${rotulo}"`));
  }
  assert.match(pagina, /<caption className="dash-cf-sr-only">/);
  assert.match(pagina, /<time dateTime=\{dataHoraHistorico\(item\.data\)\}>/);
  assert.match(pagina, /className="dash-cf-history-meta"/);
});
