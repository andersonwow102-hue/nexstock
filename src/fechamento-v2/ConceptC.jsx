import {
  ActionSet,
  ExpenseDisclosure,
  MoneyField,
  MoneyOutput,
  RouteMeta,
  StatusMark,
} from "./shared.jsx";
import { formatMoney } from "./model.js";
import "./concept-c.css";

const FLOW = [
  { number: 1, label: "Dados da rota", id: "concept-c-route" },
  { number: 2, label: "Lançamentos", id: "concept-c-entries" },
  { number: 3, label: "Despesas e ajustes", id: "concept-c-expenses" },
  { number: 4, label: "Resultado", id: "concept-c-result" },
  { number: 5, label: "Publicação", id: "concept-c-publication" },
];

function stageClass(number, activeStage, sent) {
  if (sent || number < activeStage) return "is-complete";
  if (number === activeStage) return "is-current";
  return "is-next";
}

function FlowSection({ number, title, id, activeStage, sent, aside = null, children }) {
  const state = stageClass(number, activeStage, sent);

  return (
    <section className={`concept-c-section ${state}`} id={id} aria-labelledby={`${id}-title`}>
      <div className="concept-c-marker" aria-hidden="true">
        <span>{String(number).padStart(2, "0")}</span>
      </div>
      <div className="concept-c-section-body">
        <header className="concept-c-section-head">
          <div>
            <span className="v2-eyebrow">Etapa {String(number).padStart(2, "0")}</span>
            <h2 id={`${id}-title`}>{title}</h2>
          </div>
          {aside}
        </header>
        {children}
      </div>
    </section>
  );
}

function ProofRow({ label, value, operator = "", subtotal = false }) {
  return (
    <div className={subtotal ? "is-subtotal" : ""}>
      <dt>{label}</dt>
      <dd>{operator && <span aria-hidden="true">{operator}</span>}{formatMoney(value)}</dd>
    </div>
  );
}

export default function ConceptC({ workspace }) {
  const {
    fixture,
    route,
    values,
    totals,
    stage,
    sent,
    setStage,
    openRoute,
    toggleExpenses,
    updateValue,
    updateAdjustment,
  } = workspace;
  const activeStage = Math.max(1, Math.min(5, Number(stage) || 1));
  const statusText = sent ? "Enviado ao gerente" : fixture.status;
  const expenseWorkspace = {
    ...workspace,
    toggleExpenses: () => {
      setStage(3);
      toggleExpenses();
    },
    updateAdjustment: (field, value) => {
      setStage(3);
      updateAdjustment(field, value);
    },
  };

  function goToStep(number, id) {
    setStage(number);
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(id)?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }

  function changeValue(modalityId, field, value) {
    setStage(2);
    updateValue(modalityId, field, value);
  }

  function changeRoute() {
    setStage(1);
    openRoute();
  }

  return (
    <main className="v2-concept concept-c" aria-labelledby="concept-c-title">
      <article className="concept-c-document">
        <header className="concept-c-document-head">
          <div className="concept-c-identity">
            <span className="v2-eyebrow">Fechamento · {fixture.competenceLabel}</span>
            <h1 id="concept-c-title">{route.name}</h1>
            <p>{route.manager}</p>
            <RouteMeta route={route} />
          </div>
          <div className="concept-c-context-actions">
            <StatusMark>{statusText}</StatusMark>
            <button type="button" className="concept-c-change-route" onClick={changeRoute}>Alterar rota</button>
          </div>
        </header>

        <nav className="concept-c-index" aria-label="Seções do documento de fechamento">
          {FLOW.map((item) => {
            const state = stageClass(item.number, activeStage, sent);
            return (
              <button
                type="button"
                key={item.id}
                className={state}
                aria-current={state === "is-current" ? "step" : undefined}
                onClick={() => goToStep(item.number, item.id)}
              >
                <span>{String(item.number).padStart(2, "0")}</span>
                <strong>{item.label}</strong>
              </button>
            );
          })}
        </nav>

        <div className="concept-c-flow">
          <FlowSection number={1} title="Dados da rota" id="concept-c-route" activeStage={activeStage} sent={sent} aside={<StatusMark>{statusText}</StatusMark>}>
            <dl className="concept-c-route-ledger">
              <div><dt>Rota</dt><dd>{route.name}</dd></div>
              <div><dt>Responsável</dt><dd>{route.manager}</dd></div>
              <div><dt>Competência</dt><dd>{fixture.competenceLabel}</dd></div>
              <div><dt>Base operacional</dt><dd><RouteMeta route={route} /></dd></div>
            </dl>
            <button type="button" className="concept-c-inline-action" onClick={changeRoute}>Alterar rota ou responsável</button>
          </FlowSection>

          <FlowSection
            number={2}
            title="Lançamentos"
            id="concept-c-entries"
            activeStage={activeStage}
            sent={sent}
            aside={<span className="concept-c-section-total">{formatMoney(totals.grossBalance)}<small>saldo bruto</small></span>}
          >
            <div className="concept-c-modalities">
              {totals.modalities.map((modality) => {
                const current = values[modality.id] || {};
                const manualCommission = modality.commissionRate === null;
                return (
                  <article className="concept-c-modality" key={modality.id}>
                    <header>
                      <h3>{modality.name}</h3>
                      <span>{modality.rule}</span>
                    </header>
                    <div className="concept-c-modality-ledger">
                      <MoneyField label="Entrada" value={current.entry} onChange={(value) => changeValue(modality.id, "entry", value)} />
                      {manualCommission ? (
                        <MoneyField label="Comissão" value={current.commission} onChange={(value) => changeValue(modality.id, "commission", value)} helper="Preenchimento manual" />
                      ) : (
                        <MoneyOutput label="Comissão" value={modality.commission} helper={modality.rule} className="is-calculated" />
                      )}
                      <MoneyField label="Saída" value={current.exit} onChange={(value) => changeValue(modality.id, "exit", value)} />
                      <MoneyOutput label="Saldo" value={modality.balance} helper="Entrada − comissão − saída" className="concept-c-balance" />
                    </div>
                  </article>
                );
              })}
            </div>
          </FlowSection>

          <FlowSection
            number={3}
            title="Despesas e ajustes"
            id="concept-c-expenses"
            activeStage={activeStage}
            sent={sent}
            aside={<span className="concept-c-section-total">{formatMoney(totals.consolidatedExpenses)}<small>consolidadas</small></span>}
          >
            <ExpenseDisclosure workspace={expenseWorkspace} className="concept-c-expense-ledger" />
          </FlowSection>

          <FlowSection number={4} title="Resultado" id="concept-c-result" activeStage={activeStage} sent={sent}>
            <dl className="concept-c-proof" aria-label="Prova financeira do fechamento">
              <ProofRow label="Entradas" value={totals.entries} />
              <ProofRow label="Comissões" value={totals.commissions} operator="−" />
              <ProofRow label="Saídas" value={totals.exits} operator="−" />
              <ProofRow label="Saldo bruto" value={totals.grossBalance} subtotal />
              <ProofRow label="Despesas consolidadas" value={totals.consolidatedExpenses} operator="−" />
              <ProofRow label="Após despesas" value={totals.afterExpenses} subtotal />
              <ProofRow label="Comissão do gerente" value={totals.managerCommission} operator="−" />
              <div className="concept-c-final-result">
                <dt>Valor a repassar</dt>
                <dd><output aria-live="polite">{formatMoney(totals.toTransfer)}</output></dd>
              </div>
            </dl>
            <button type="button" className="concept-c-inline-action" onClick={() => goToStep(5, "concept-c-publication")}>Revisar publicação</button>
          </FlowSection>

          <FlowSection number={5} title="Publicação" id="concept-c-publication" activeStage={activeStage} sent={sent} aside={<StatusMark>{statusText}</StatusMark>}>
            <div className="concept-c-publication-ledger">
              <dl>
                <div><dt>Destino</dt><dd>{route.manager}</dd></div>
                <div><dt>Rota</dt><dd>{route.name}</dd></div>
                <div><dt>Competência</dt><dd>{fixture.competenceLabel}</dd></div>
                <div><dt>Valor a repassar</dt><dd>{formatMoney(totals.toTransfer)}</dd></div>
              </dl>
              <p>{sent ? "Publicação simulada concluída neste harness local." : "O envio disponibiliza este fechamento e sua conferência ao gerente da rota."}</p>
            </div>
            <div className="concept-c-publication-actions">
              <ActionSet workspace={workspace} />
            </div>
          </FlowSection>
        </div>
      </article>
    </main>
  );
}
