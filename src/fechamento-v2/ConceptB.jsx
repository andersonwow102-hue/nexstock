import {
  ActionSet,
  ExpenseDisclosure,
  MoneyField,
  MoneyOutput,
  RouteMeta,
  StatusMark,
} from "./shared.jsx";
import { formatMoney, STEPS } from "./model.js";
import "./concept-b.css";

function StageHeading({ stage, title, children, aside = null }) {
  return (
    <header className="b-stage-heading">
      <div>
        <span className="v2-eyebrow">{String(stage).padStart(2, "0")} · {STEPS[stage - 1].label}</span>
        <h2 tabIndex="-1" id={`b-stage-title-${stage}`}>{title}</h2>
        {children && <p>{children}</p>}
      </div>
      {aside}
    </header>
  );
}

function StageProgress({ stage, onChange }) {
  return (
    <nav className="b-progress" aria-label="Etapas do fechamento">
      <ol>
        {STEPS.map((step) => (
          <li key={step.id} className={step.id === stage ? "is-current" : step.id < stage ? "is-complete" : "is-next"}>
            <button type="button" aria-current={step.id === stage ? "step" : undefined} onClick={() => onChange(step.id)}>
              <span aria-hidden="true">{String(step.id).padStart(2, "0")}</span>
              <strong>{step.label}</strong>
            </button>
          </li>
        ))}
      </ol>
      <label className="b-progress-mobile">
        <span><b>{String(stage).padStart(2, "0")}</b> de 05</span>
        <select value={stage} onChange={(event) => onChange(Number(event.target.value))} aria-label="Etapa atual">
          {STEPS.map((step) => <option key={step.id} value={step.id}>{step.label}</option>)}
        </select>
      </label>
    </nav>
  );
}

function StageActions({ back, next, onStage, onSave, nextLabel = "Continuar" }) {
  return (
    <footer className="b-stage-actions">
      {back && <button type="button" className="v2-button v2-button-quiet" onClick={() => onStage(back)}>Voltar</button>}
      {onSave && <button type="button" className="v2-button v2-button-secondary" onClick={onSave}>Salvar rascunho</button>}
      {next && <button type="button" className="v2-button v2-button-primary" onClick={() => onStage(next)}>{nextLabel}</button>}
    </footer>
  );
}

function PeriodStage({ workspace, onStage }) {
  return (
    <section className="b-stage b-choice-stage" aria-labelledby="b-stage-title-1">
      <StageHeading stage={1} title="Escolha a competência">O período escolhido vira contexto compacto nas próximas etapas.</StageHeading>
      <div className="b-period-line">
        <label>
          <span className="v2-field-label">Competência</span>
          <input type="month" value={workspace.fixture.competence} readOnly aria-readonly="true" />
        </label>
        <span><small>Leitura atual</small><strong>{workspace.fixture.competenceLabel}</strong></span>
      </div>
      <StageActions next={2} onStage={onStage} nextLabel="Continuar para rota" />
    </section>
  );
}

function RouteStage({ workspace, onStage }) {
  const { route, openRoute } = workspace;
  return (
    <section className="b-stage b-choice-stage" aria-labelledby="b-stage-title-2">
      <StageHeading stage={2} title="Confirme a rota">Somente a rota selecionada acompanha o lançamento financeiro.</StageHeading>
      <div className="b-route-line">
        <span><small>Rota selecionada</small><strong>{route.name}</strong><em>{route.manager}</em></span>
        <RouteMeta route={route} />
        <StatusMark>{route.state}</StatusMark>
        <button type="button" className="v2-button v2-button-secondary" onClick={openRoute}>Alterar rota</button>
      </div>
      <StageActions back={1} next={3} onStage={onStage} nextLabel="Abrir lançamentos" />
    </section>
  );
}

function SettlementRail({ workspace, onStage }) {
  const { totals, act } = workspace;
  const terms = [
    ["Entradas", totals.entries, ""],
    ["Comissões", totals.commissions, "−"],
    ["Saídas", totals.exits, "−"],
    ["Ajustes", totals.consolidatedExpenses, "−"],
    ["Gerente", totals.managerCommission, "−"],
  ];
  return (
    <aside className="b-settlement-rail" aria-label="Resultado financeiro persistente">
      <div className="b-settlement-equation">
        {terms.map(([label, value, sign]) => (
          <span key={label}><small>{sign} {label}</small><b>{formatMoney(value)}</b></span>
        ))}
      </div>
      <div className="b-settlement-result"><small>A repassar</small><strong>{formatMoney(totals.toTransfer)}</strong></div>
      <div className="b-settlement-actions">
        <button type="button" className="v2-button v2-button-quiet" onClick={() => act("save")}>Salvar</button>
        <button type="button" className="v2-button v2-button-primary" onClick={() => onStage(4)}>Conferir resultado</button>
      </div>
    </aside>
  );
}

function LaunchStage({ workspace, onStage }) {
  const { totals, values, updateValue, route } = workspace;
  return (
    <section className="b-stage b-launch-stage" aria-labelledby="b-stage-title-3">
      <StageHeading stage={3} title="Valores da rota" aside={<RouteMeta route={route} />}>Entrada, comissão, saída e saldo permanecem visíveis em uma única folha.</StageHeading>
      <nav className="b-modality-index" aria-label="Ir para modalidade">
        {totals.modalities.map((item) => <a key={item.id} href={`#b-${item.id}`}><span>{item.name}</span><b>{formatMoney(item.balance)}</b></a>)}
      </nav>
      <div className="b-ledger-sheet">
        {totals.modalities.map((item) => {
          const current = values[item.id] || {};
          const automatic = item.commissionRate !== null;
          return (
            <article id={`b-${item.id}`} className={`b-ledger-band${item.balance < 0 ? " is-negative" : ""}`} key={item.id}>
              <header><div><h3>{item.name}</h3><span>{item.rule}</span></div><small>{automatic ? "Comissão calculada pela entrada" : "Comissão informada manualmente"}</small></header>
              <div className="b-ledger-grid">
                <MoneyField label="Entrada" value={current.entry} onChange={(value) => updateValue(item.id, "entry", value)} />
                {automatic
                  ? <MoneyOutput label="Comissão" value={item.commission} helper={`${Math.round(item.commissionRate * 100)}% automática`} />
                  : <MoneyField label="Comissão" value={current.commission} onChange={(value) => updateValue(item.id, "commission", value)} helper="Valor manual" />}
                <MoneyField label="Saída" value={current.exit} onChange={(value) => updateValue(item.id, "exit", value)} />
                <MoneyOutput label="Saldo" value={item.balance} helper="Entrada − comissão − saída" className="b-balance" />
              </div>
            </article>
          );
        })}
      </div>
      <SettlementRail workspace={workspace} onStage={onStage} />
    </section>
  );
}

function ProofRow({ phase = "", label, value, sign = "", subtotal = false }) {
  return (
    <div className={`b-proof-row${subtotal ? " is-subtotal" : ""}`}>
      <dt><small>{phase}</small><span>{label}</span></dt>
      <dd><i aria-hidden="true">{sign}</i><b>{formatMoney(value)}</b></dd>
    </div>
  );
}

function ReviewStage({ workspace, onStage }) {
  const { totals, route, act } = workspace;
  return (
    <section className="b-stage b-review-stage" aria-labelledby="b-stage-title-4">
      <StageHeading stage={4} title="Prova do resultado" aside={<RouteMeta route={route} />}>Leia o fechamento como uma equação antes de publicar.</StageHeading>
      <dl className="b-proof-ledger">
        <ProofRow phase="Antes" label="Entradas" value={totals.entries} />
        <ProofRow phase="Depois" label="Comissões" value={totals.commissions} sign="−" />
        <ProofRow label="Saídas" value={totals.exits} sign="−" />
        <ProofRow label="Saldo bruto" value={totals.grossBalance} subtotal />
      </dl>
      <div className="b-proof-expenses"><span className="b-phase-label">Ajustes</span><ExpenseDisclosure workspace={workspace} compact /></div>
      <dl className="b-proof-ledger b-proof-ledger-final">
        <ProofRow label="Após despesas" value={totals.afterExpenses} subtotal />
        <ProofRow label={`Comissão de ${route.manager} · 10%`} value={totals.managerCommission} sign="−" />
      </dl>
      <div className="b-proof-result"><span><small>Resultado</small><strong>A repassar</strong></span><output aria-live="polite">{formatMoney(totals.toTransfer)}</output></div>
      <StageActions back={3} next={5} onStage={onStage} onSave={() => act("save")} nextLabel="Ir para envio" />
    </section>
  );
}

function SendStage({ workspace, onStage }) {
  const { route, totals, sent } = workspace;
  return (
    <section className="b-stage b-send-stage" aria-labelledby="b-stage-title-5">
      <StageHeading stage={5} title="Envio ao gerente">Resultado, destinatário e ações finais permanecem no mesmo plano.</StageHeading>
      <div className="b-send-layout">
        <div className="b-send-result"><small>Valor confirmado</small><output>{formatMoney(totals.toTransfer)}</output><StatusMark>{sent ? "Enviado ao gerente" : "Pronto para envio"}</StatusMark></div>
        <div className="b-send-detail">
          <dl><div><dt>Destino</dt><dd>{route.manager}</dd></div><div><dt>Rota</dt><dd>{route.name}</dd></div><div><dt>Competência</dt><dd>{workspace.fixture.competenceLabel}</dd></div></dl>
          <ActionSet workspace={workspace} />
          <button type="button" className="b-back-link" onClick={() => onStage(4)}>Voltar à conferência</button>
        </div>
      </div>
    </section>
  );
}

export default function ConceptB({ workspace }) {
  const { fixture, route, stage, sent, setStage, openRoute } = workspace;
  function changeStage(next) {
    setStage(next);
    window.requestAnimationFrame(() => document.getElementById(`b-stage-title-${next}`)?.focus({ preventScroll: true }));
    window.scrollTo({ top: 0 });
  }

  return (
    <main className="v2-concept concept-b">
      <header className="b-context-bar">
        <div className="b-context-title"><span className="v2-eyebrow">Reconciliação operacional</span><h1>Fechamento</h1></div>
        <div className="b-context-data"><span><small>Competência</small><strong>{fixture.competenceLabel}</strong></span><span><small>Rota e gerente</small><strong>{route.name}</strong><em>{route.manager}</em></span><RouteMeta route={route} /></div>
        <StatusMark>{sent ? "Enviado ao gerente" : fixture.status}</StatusMark>
        <button type="button" className="b-route-change" onClick={openRoute}>Alterar rota</button>
      </header>
      <StageProgress stage={stage} onChange={changeStage} />
      <div className="b-focus-frame">
        {stage === 1 && <PeriodStage workspace={workspace} onStage={changeStage} />}
        {stage === 2 && <RouteStage workspace={workspace} onStage={changeStage} />}
        {stage === 3 && <LaunchStage workspace={workspace} onStage={changeStage} />}
        {stage === 4 && <ReviewStage workspace={workspace} onStage={changeStage} />}
        {stage === 5 && <SendStage workspace={workspace} onStage={changeStage} />}
      </div>
    </main>
  );
}
