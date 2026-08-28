import {
  ActionSet,
  ExpenseDisclosure,
  MoneyField,
  MoneyOutput,
  RouteMeta,
  StatusMark,
} from "./shared.jsx";
import { formatMoney } from "./model.js";
import "./concept-a.css";

function ProofRow({ label, value, sign = "", className = "" }) {
  return (
    <div className={`concept-a__proof-row ${className}`.trim()}>
      <dt>{label}</dt>
      <dd>{sign && <span aria-hidden="true">{sign}</span>}{formatMoney(value)}</dd>
    </div>
  );
}

export default function ConceptA({ workspace }) {
  const {
    fixture,
    route,
    values,
    totals,
    stage,
    sent,
    setStage,
    openRoute,
    updateValue,
  } = workspace;
  const deductions = totals.consolidatedExpenses + totals.managerCommission;

  return (
    <section className={`v2-concept concept-a${sent ? " is-sent" : ""}`} data-stage={stage} aria-labelledby="concept-a-title">
      <header className="concept-a__context">
        <div className="concept-a__title">
          <span className="v2-eyebrow">Conferência financeira</span>
          <h1 id="concept-a-title">Fechamento</h1>
        </div>
        <div className="concept-a__route">
          <strong>{route.name}</strong>
          <span>{route.manager}</span>
          <RouteMeta route={route} />
        </div>
        <div className="concept-a__competence">
          <span>Competência</span>
          <strong>{fixture.competenceLabel}</strong>
        </div>
        <StatusMark>{sent ? "Enviado ao gerente" : fixture.status}</StatusMark>
        <button type="button" className="concept-a__context-action" onClick={openRoute}>Alterar contexto</button>
      </header>

      <div className="concept-a__desk">
        <main className="concept-a__work" aria-label="Lançamentos e conferência">
          <div className="concept-a__section-head">
            <div>
              <span className="v2-eyebrow">Lançamentos</span>
              <h2>Movimento por modalidade</h2>
            </div>
            <span>3 modalidades · valores em reais</span>
          </div>

          <section className="concept-a__ledger" aria-label="Linhas financeiras por modalidade">
            {totals.modalities.map((modality) => {
              const current = values[modality.id] || {};
              const automatic = modality.commissionRate !== null;
              return (
                <article className="concept-a__financial-line" key={modality.id}>
                  <header>
                    <h3>{modality.name}</h3>
                    <span>{modality.rule}</span>
                  </header>
                  <div className="concept-a__line-values">
                    <MoneyField
                      className="concept-a__metric"
                      label="Entrada"
                      value={current.entry}
                      onChange={(value) => updateValue(modality.id, "entry", value)}
                    />
                    {automatic ? (
                      <MoneyOutput className="concept-a__metric is-calculated" label="Comissão" value={modality.commission} helper="Calculada pela regra" />
                    ) : (
                      <MoneyField
                        className="concept-a__metric"
                        label="Comissão"
                        value={current.commission}
                        onChange={(value) => updateValue(modality.id, "commission", value)}
                        helper="Informada manualmente"
                      />
                    )}
                    <MoneyField
                      className="concept-a__metric"
                      label="Saída"
                      value={current.exit}
                      onChange={(value) => updateValue(modality.id, "exit", value)}
                    />
                    <div className="concept-a__balance-spine">
                      <MoneyOutput className="concept-a__balance" label="Saldo" value={modality.balance} helper="Calculado" />
                    </div>
                  </div>
                </article>
              );
            })}
          </section>

          <ExpenseDisclosure workspace={workspace} className="concept-a__expenses" />

          <section className="concept-a__closing" aria-labelledby="concept-a-closing-title">
            <div className="concept-a__closing-copy">
              <span className="v2-eyebrow">Conferência</span>
              <h2 id="concept-a-closing-title">A rota fecha sem divergências</h2>
              <button type="button" onClick={() => setStage(4)} disabled={stage >= 4}>
                {stage >= 4 ? "Resultado conferido" : "Conferir resultado"}
              </button>
            </div>
            <div className="concept-a__equation" aria-label="Equação final da rota">
              <span><small>Saldo bruto</small><strong>{formatMoney(totals.grossBalance)}</strong></span>
              <b aria-hidden="true">−</b>
              <span><small>Despesas e comissão</small><strong>{formatMoney(deductions)}</strong></span>
              <b aria-hidden="true">=</b>
              <span className="is-result"><small>Repasse</small><strong>{formatMoney(totals.toTransfer)}</strong></span>
            </div>
          </section>
        </main>

        <aside className="concept-a__result" aria-labelledby="concept-a-result-title">
          <header>
            <span className="v2-eyebrow">Resultado da rota</span>
            <h2 id="concept-a-result-title">{route.name}</h2>
            <small>{route.manager} · {fixture.competenceLabel}</small>
          </header>

          <dl className="concept-a__proof">
            <ProofRow label="Entradas" value={totals.entries} />
            <ProofRow label="Comissões" value={totals.commissions} sign="− " />
            <ProofRow label="Saídas" value={totals.exits} sign="− " />
            <ProofRow label="Saldo bruto" value={totals.grossBalance} className="is-subtotal" />
            <ProofRow label="Despesas registradas" value={totals.registeredExpenses} sign="− " />
            <ProofRow label="Crédito Play Bet" value={totals.playBet} sign="+ " className="is-adjustment" />
            <ProofRow label="Ajuda de custo" value={totals.costAid} sign="− " />
            {totals.extraCommission > 0 && <ProofRow label="Comissão extra" value={totals.extraCommission} sign="− " />}
            <ProofRow label="Após despesas" value={totals.afterExpenses} className="is-subtotal" />
            <ProofRow label="Comissão do gerente" value={totals.managerCommission} sign="− " />
          </dl>

          <div className="concept-a__expense-total">
            <span>Despesas consolidadas</span>
            <strong>{formatMoney(totals.consolidatedExpenses)}</strong>
          </div>

          <div className="concept-a__transfer">
            <span>A repassar</span>
            <output aria-live="polite">{formatMoney(totals.toTransfer)}</output>
            <small>{sent ? "Prestação enviada ao gerente" : "Valor final da rota"}</small>
          </div>

          <div className="concept-a__actions">
            <ActionSet workspace={workspace} />
          </div>
        </aside>
      </div>
    </section>
  );
}
