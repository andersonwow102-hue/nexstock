import { useEffect, useMemo, useRef, useState } from "react";
import { handleMainScrollKey } from "../components/operations/mainScrollNavigation.js";

const MODULES = [
  ["pontos", "Pontos"],
  ["gerentes", "Buscar Gerentes"],
  ["fechamento", "Fechamento"],
  ["acessos", "Central de Acessos"],
  ["logins", "Gerenciar Logins"],
  ["historico", "Histórico"],
];

const MANAGERS = Array.from({ length: 18 }, (_, index) => `Gerente ${String(index + 1).padStart(2, "0")}`);
const POINTS = Array.from({ length: 252 }, (_, index) => ({
  id: index + 1,
  name: `Ponto operacional ${String(index + 1).padStart(3, "0")}`,
  route: `Rota ${String((index % 12) + 1).padStart(2, "0")}`,
  equipment: 2 + (index % 7),
}));
const USERS = Array.from({ length: 50 }, (_, index) => ({
  id: index + 1,
  name: `Usuário de QA ${String(index + 1).padStart(2, "0")}`,
  role: index % 7 === 0 ? "Administrador" : index % 3 === 0 ? "Consulta" : "Gerente",
}));
const HISTORY = Array.from({ length: 500 }, (_, index) => ({
  id: index + 1,
  item: `Equipamento ${String(index + 1).padStart(3, "0")}`,
  event: index % 4 === 0 ? "Movimentação" : index % 3 === 0 ? "Edição" : "Conferência",
}));

function QaHeading({ eyebrow, title, description }) {
  return <header className="cf-page-head uxqa-heading"><div className="cf-page-head__identity"><div className="cf-page-head__copy"><span className="cf-page-head__eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div></div></header>;
}

function LastMarker({ children }) {
  return <div className="uxqa-last" data-qa-last="true">{children}</div>;
}

function PointsFixture() {
  const visible = POINTS.slice(0, 25);
  return <section className="points-command-flow uxqa-points">
    <QaHeading eyebrow="Rede operacional · fixture local" title="Pontos" description="25 registros visíveis de uma base simulada com 252 pontos." />
    <div className="pcf-master-detail">
      <div className="pcf-master-pane">
        <div className="pcf-ledger-columns" aria-hidden="true"><span>Ponto / responsável</span><span>Rota</span><span>Serviços</span><span>Equip.</span><span>Situação</span></div>
        <div className="pcf-records" aria-label="Pontos simulados">
          {visible.map(point => <button type="button" className="pcf-record" key={point.id}>
            <span className="pcf-record-identity"><strong>{point.name}</strong><small>Responsável local · (62) 3000-0000</small></span>
            <span><b className="uxqa-route">{point.route}</b></span>
            <span className="pcf-record-count"><b>3</b><small>operando</small></span>
            <span className="pcf-record-count"><b>{point.equipment}</b><small>vinculados</small></span>
            <span className="pcf-record-state"><b>Ativo</b><span aria-hidden="true">›</span></span>
          </button>)}
        </div>
        <div className="uxqa-pagination"><button type="button" disabled>Anterior</button><span>Página 1 de 11 · 252 pontos</span><button type="button">Próxima</button></div>
      </div>
      <aside className="pcf-dossier">
        <header className="pcf-dossier-header"><div className="pcf-dossier-monogram">P1</div><div><span className="pcf-eyebrow">Dossiê do ponto</span><h3>Ponto operacional 001</h3><small>Rota 01</small></div></header>
        <div className="pcf-dossier-status"><b>Operação ativa</b></div>
        <div className="uxqa-facts">{Array.from({ length: 8 }, (_, index) => <div key={index}><small>Indicador {index + 1}</small><strong>{index + 2} registros</strong></div>)}</div>
        <section className="pcf-dossier-history"><header><span>Rastro recente</span><b>4</b></header><ol>{Array.from({ length: 4 }, (_, index) => <li key={index}><span><strong>Movimentação auditada</strong><small>28/08/2026</small></span></li>)}</ol></section>
        <div className="pcf-dossier-actions"><button type="button" className="pcf-button pcf-button--secondary">Acessos</button><button type="button" className="pcf-button pcf-button--secondary">Despesas</button><button type="button" className="pcf-button pcf-button--secondary">Editar</button><button type="button" className="pcf-button pcf-button--warning">Solicitar desativação</button></div>
        <LastMarker>Fim do dossiê de Pontos alcançável</LastMarker>
      </aside>
    </div>
  </section>;
}

function ManagersFixture() {
  const [view, setView] = useState("pontos");
  const entries = view === "pontos" ? POINTS.slice(0, 37) : POINTS.slice(0, 25);
  return <>
    <QaHeading eyebrow="Consulta operacional · fixture local" title="Gerentes" description="Responsabilidade e pendências em um único recorte." />
    <div className="consulta-cf-page">
      <aside className="consulta-cf-rail"><div className="consulta-cf-search"><input type="search" placeholder="Buscar gerente" aria-label="Buscar gerente" /></div><div className="consulta-cf-manager-list">{MANAGERS.map((manager, index) => <button type="button" className={index === 0 ? "is-active" : ""} key={manager}><span className="consulta-cf-avatar">G</span><span><strong>{manager}</strong><small>{12 + index} pontos · {36 + index} equipamentos</small></span><span>›</span></button>)}</div><label className="consulta-cf-mobile-select"><span>Gerente</span><select defaultValue={MANAGERS[0]}>{MANAGERS.map(manager => <option key={manager}>{manager}</option>)}</select></label></aside>
      <div className="consulta-cf-main">
        <section className="consulta-cf-position"><div className="consulta-cf-position-copy"><span>Gerente em foco</span><strong>Gerente 01</strong><p>37 pontos · 84 equipamentos · 2 com gerente · 0 conserto</p></div><div className="consulta-cf-view-switch"><button type="button" aria-pressed={view === "pontos"} className={view === "pontos" ? "is-active" : ""} onClick={() => setView("pontos")}>Pontos</button><button type="button" aria-pressed={view === "equipamentos"} className={view === "equipamentos" ? "is-active" : ""} onClick={() => setView("equipamentos")}>Equipamentos</button></div></section>
        {view === "equipamentos" && <nav className="consulta-cf-equipment-filters"><button className="is-active" type="button">Todos <b>84</b></button><button type="button">Nos pontos <b>82</b></button><button type="button">Com gerente <b>2</b></button><button type="button">Conserto <b>0</b></button></nav>}
        <div className="consulta-cf-ledgers"><section className={`cf-ledger ${view === "pontos" ? "consulta-cf-points-ledger" : "consulta-cf-equipment-ledger"}`}><header><div><span className="cf-kicker">Visão ativa</span><h2>{view === "pontos" ? "Pontos vinculados" : "Equipamentos localizados"}</h2></div><b>{view === "pontos" ? 37 : 84}</b></header>{entries.map((entry, index) => <article key={entry.id}><span className="consulta-cf-line-icon">{view === "pontos" ? "P" : "E"}</span><span><strong>{view === "pontos" ? entry.name : `Equipamento ${String(index + 1).padStart(3, "0")}`}</strong><small>{entry.route} · vínculo auditado</small></span>{view === "pontos" ? <><span className="consulta-cf-point-state">Ativo</span><b>{entry.equipment}<small> equip.</small></b></> : <><span className="badge-cat">Terminal</span><span className="badge-status">Em rota</span><button type="button" className="btn-editar">Ficha</button></>}</article>)}<LastMarker>Fim da lista ativa de Gerentes alcançável</LastMarker></section></div>
      </div>
      <aside className="cf-dossier consulta-cf-dossier"><div className="cf-dossier__head"><span className="cf-kicker">Dossiê de responsabilidade</span><h2>Gerente 01</h2></div><div className="cf-dossier__body"><div className="consulta-cf-dossier-state"><span className="consulta-cf-avatar">✓</span><span><small>Prioridade atual</small><strong>Posição acompanhada</strong></span></div><div className="consulta-cf-dossier-focus"><small>Visão ativa</small><strong>{view === "pontos" ? 37 : 84}</strong><span>{view === "pontos" ? "pontos sob esta responsabilidade" : "equipamentos localizados"}</span></div><p className="consulta-cf-dossier-note">Cobertura simulada sem qualquer conexão com dados reais.</p></div></aside>
    </div>
  </>;
}

function ClosingFixture() {
  const modalities = ["90 da Sorte", "Via Pix", "Lotobanca", "Raspadinha", "Bicho", "Loteria", "Bolão", "Premiação"];
  return <section className="secao fechamento-page" data-layout="workbench" data-visual="a3-executive" data-composition="final-a1-a3">
    <QaHeading eyebrow="Conferência financeira · fixture local" title="Fechamento" description="Composição FINAL com valores locais invariáveis." />
    <section className="fechamento-contexto"><div className="fechamento-contexto-identidade"><small>Rota</small><strong>Vale Azul</strong></div><label><small>Responsável</small><input value="Caio Nobre" readOnly /></label><label><small>Competência</small><input value="Julho de 2026" readOnly /></label><span className="fechamento-contexto-status">Pronto para revisão</span></section>
    <div className="fechamento-workspace">
      <div className="fechamento-workspace-main"><section className="fechamento-lancamentos"><div className="fc-section-head"><div><span className="fechamento-section-label">Movimento por modalidade</span><h2>Conferência dos lançamentos</h2></div></div><div className="fechamento-matriz"><div className="fechamento-matriz-body">{modalities.map((mode, index) => <article className="fechamento-matriz-row" key={mode}><div className="fechamento-modalidade"><strong>{mode}</strong><small>{10 + index}% automática</small></div><label className="fechamento-valor-campo"><span>Entrada</span><b>R$ 24.800</b></label><label className="fechamento-valor-campo"><span>Comissão</span><b>R$ 2.480</b></label><label className="fechamento-valor-campo"><span>Saída</span><b>R$ 16.200</b></label><output className="fechamento-saldo-output"><span>Saldo</span><b>R$ 6.120</b></output></article>)}</div></div></section><section className="fechamento-revisao is-open"><div className="fc-section-head"><div><span className="fechamento-section-label">Despesas e ajustes</span><h2>Conferência complementar</h2></div></div><div className="fechamento-revisao-conteudo uxqa-review">{Array.from({ length: 8 }, (_, index) => <div key={index}><span>Lançamento {index + 1}</span><strong>R$ {120 + index * 35},00</strong></div>)}</div></section></div>
      <aside className="fechamento-summary is-open"><div className="fechamento-summary-body"><header className="fechamento-decision-head"><span>Coluna de decisão</span><h2>Parecer da rota</h2><div><small>Rota</small><strong>Vale Azul</strong></div></header><div className="fechamento-summary-base"><span><small>Responsável</small><b>Caio Nobre</b></span><span><small>Competência</small><b>Julho de 2026</b></span></div><div className="fechamento-decision-state"><small>Estado</small><strong>Pronto para revisão</strong></div><ol className="fechamento-decision-ladder">{["Rascunho", "Revisão", "Aprovação", "Envio", "Enviado"].map((step, index) => <li className={index < 2 ? "is-complete" : index === 2 ? "is-current" : ""} key={step}><span /><small>{step}</small></li>)}</ol><section className="fechamento-decision-group"><span className="fechamento-section-label">Composição do resultado</span><dl className="fechamento-summary-ledger">{["Entradas", "Saídas", "Despesas", "Ajustes", "Após despesas", "Comissão do gerente"].map((label, index) => <div key={label}><dt>{label}</dt><dd>{index === 3 ? "+ R$ 300" : `R$ ${28 - index * 3}.000`}</dd></div>)}</dl></section><div className="fechamento-summary-result"><span>Resultado final</span><strong className="fc-money">R$ 18.420</strong><small>Valor a repassar após a conferência.</small></div><section className="fechamento-publicacao"><button type="button" className="fc-primary-action">Aprovar fechamento</button><div className="fechamento-secondary-actions"><button type="button" className="fc-secondary-action">Salvar rascunho</button><button type="button" className="fc-secondary-action">Baixar PDF</button></div></section><LastMarker>Última ação do Fechamento alcançável</LastMarker></div></aside>
    </div>
  </section>;
}

function AccessFixture({ logins = false }) {
  return <div className={`admin-command-flow ${logins ? "admin-command-flow--logins" : "admin-command-flow--access"}`}>
    <QaHeading eyebrow="Diretório administrativo · fixture local" title={logins ? "Gerenciar Logins" : "Central de Acessos"} description="50 identidades locais para validar a altura total do diretório." />
    <header className="admin-cf-page-bar"><div className="admin-cf-inline-counts"><span><strong>50</strong> usuários</span><span><strong>7</strong> admin</span><span><strong>31</strong> gerentes</span></div><div className="admin-cf-head-actions"><button type="button" className="btn-secundario">Atualizar</button><button type="button" className="btn-primario">Novo login</button></div></header>
    <section className={logins ? "admin-cf-master-detail login-manager-grid" : "admin-cf-master-detail admin-cf-access-workspace"}>
      <div className="admin-cf-panel admin-cf-directory"><header className="admin-cf-panel-head admin-cf-directory-head"><div><span className="admin-cf-section-code">Diretório</span><h3>Usuários</h3></div><span className="admin-cf-compact-count"><strong>50</strong> de 50</span></header><div className={logins ? "login-users-list" : "admin-cf-access-list"}>{USERS.map((user, index) => logins ? <article className={`login-user-card ${index === 0 ? "ativo" : ""}`} key={user.id}><button type="button" className="login-user-main"><span className="acesso-avatar">{user.name[0]}</span><span className="admin-cf-access-row-copy"><strong>{user.name}</strong><small>login.qa.{user.id}</small></span><span className="admin-cf-profile">{user.role}</span><span className="admin-cf-status">Ativo</span><span>›</span></button></article> : <button type="button" className={`admin-cf-access-row ${index === 0 ? "is-selected" : ""}`} key={user.id}><span className="acesso-avatar">{user.name[0]}</span><span className="admin-cf-access-row-copy"><strong>{user.name}</strong><small>login.qa.{user.id}</small></span><span className="admin-cf-access-row-scope"><small>Escopo</small><strong>Rota {(index % 12) + 1}</strong></span><span className="admin-cf-profile">{user.role}</span><span>›</span></button>)}</div><LastMarker>Registro 50 alcançável</LastMarker></div>
      <aside className={logins ? "admin-cf-panel login-detail" : "admin-cf-panel admin-cf-dossier"}><header className="admin-cf-dossier-head"><span className="acesso-avatar">U</span><div><span className="admin-cf-section-code">Identidade selecionada</span><h3>Usuário de QA 01</h3><small>login.qa.1</small></div></header>{Array.from({ length: 7 }, (_, index) => <section className="admin-cf-dossier-section" key={index}><div className="admin-cf-dossier-section-title"><span>Grupo {index + 1}</span><small>fixture local</small></div><p className="admin-cf-dossier-copy">Permissão, escopo e estado de segurança apresentados sem chamadas externas.</p></section>)}<div className="admin-cf-dossier-section admin-cf-security-actions"><button type="button" className="btn-primario">Salvar configuração</button><button type="button" className="btn-secundario">Redefinir acesso</button><button type="button" className="btn-danger-outline">Bloquear identidade</button></div><LastMarker>Última ação administrativa alcançável</LastMarker></aside>
    </section>
  </div>;
}

function HistoryFixture() {
  const [size, setSize] = useState(500);
  const visible = HISTORY.slice(0, Math.min(size, 35));
  return <section className="historico-cf-page">
    <QaHeading eyebrow="Rastro operacional · fixture local" title="Histórico" description={`${size} eventos simulados, com paginação preservada em 35 por página.`} />
    <div className="cf-command-bar historico-cf-command"><div className="historico-cf-command-title"><strong>Volume de QA</strong><small>Sem dados reais</small></div><label>Registros <select value={size} onChange={event => setSize(Number(event.target.value))}><option value="20">20</option><option value="100">100</option><option value="500">500</option></select></label></div>
    <div className="historico-cf-workspace"><div className="cf-ledger historico-cf-ledger"><div className="cf-ledger__head historico-cf-grid"><span>Evento</span><span>Objeto</span><span>Responsável</span><span>Variação</span><span>Quando</span></div>{visible.map(entry => <article className="cf-ledger__row historico-cf-grid historico-cf-row" key={entry.id}><span className="historico-cf-event"><strong>{entry.event}</strong></span><button type="button" className="historico-cf-object"><span><strong>{entry.item}</strong><small>Terminal</small></span></button><span className="historico-cf-owner">Operador de QA</span><span className="historico-cf-delta"><b>0</b><span>→</span><b>1</b></span><time>28/08/2026 21:30</time></article>)}<div className="historico-cf-pagination"><button type="button" disabled>Anterior</button><span>Página 1 de {Math.ceil(size / 35)}</span><button type="button">Próxima</button></div><LastMarker>Rodapé do Histórico alcançável</LastMarker></div><aside className="cf-dossier historico-cf-dossier"><div className="cf-dossier__head"><span className="cf-kicker">Evento selecionado</span><div className="historico-cf-dossier-event"><span><h2>Conferência</h2><p>28/08/2026</p></span></div></div><div className="cf-dossier__body"><div className="historico-cf-subject"><span className="consulta-cf-avatar">E</span><span><small>Objeto</small><strong>Equipamento 001</strong><em>Terminal</em></span></div><dl><div><dt>Responsável</dt><dd>Operador de QA</dd></div><div><dt>Quantidade anterior</dt><dd>0</dd></div><div><dt>Quantidade posterior</dt><dd>1</dd></div></dl></div></aside></div>
  </section>;
}

function ModuleFixture({ module }) {
  if (module === "pontos") return <PointsFixture />;
  if (module === "gerentes") return <ManagersFixture />;
  if (module === "fechamento") return <ClosingFixture />;
  if (module === "acessos") return <AccessFixture />;
  if (module === "logins") return <AccessFixture logins />;
  return <HistoryFixture />;
}

export default function UxScrollQaApp() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const initialModule = MODULES.some(([value]) => value === params.get("module")) ? params.get("module") : "pontos";
  const [module, setModule] = useState(initialModule);
  const [light, setLight] = useState(params.get("theme") !== "dark");
  const mainRef = useRef(null);

  useEffect(() => {
    const next = new URL(window.location.href);
    next.searchParams.set("module", module);
    next.searchParams.set("theme", light ? "light" : "dark");
    window.history.replaceState(null, "", next);
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
      mainRef.current.focus({ preventScroll: true });
    }
  }, [light, module]);

  return <div className={`app operations-shell command-flow-shell uxqa-shell module-${module}${light ? " tema-claro" : ""}`}>
    <aside className="sidebar uxqa-sidebar"><div className="sidebar-logo"><span className="uxqa-mark">N</span><strong className="sidebar-brand-name">NEPTERA</strong></div><nav className="sidebar-nav" aria-label="Módulos de QA"><span className="nav-section-label">QA de rolagem</span>{MODULES.map(([value, label]) => <button type="button" className={`nav-item ${module === value ? "active" : ""}`} aria-current={module === value ? "page" : undefined} onClick={() => setModule(value)} key={value}><span className="uxqa-nav-dot" />{label}</button>)}</nav><div className="sidebar-footer"><button type="button" className="sidebar-utility sidebar-utility-theme" onClick={() => setLight(value => !value)} aria-pressed={light}><span>{light ? "Tema claro" : "Tema escuro"}</span><span className={`tema-toggle ${light ? "ativo" : ""}`} /></button><small className="sidebar-version">Fixture isolada · zero escrita</small></div></aside>
    <main className="main uxqa-main" onKeyDown={handleMainScrollKey} ref={mainRef} tabIndex={-1}><div className="uxqa-command"><span><b>QA LOCAL</b> · {MODULES.find(([value]) => value === module)?.[1]}</span><span>Role até o marcador final</span></div><ModuleFixture module={module} /></main>
  </div>;
}
