import {
  ActionSet,
  ExpenseDisclosure,
  MoneyField,
  MoneyOutput,
  RouteMeta,
  StatusMark,
} from "./shared.jsx";
import { formatMoney } from "./model.js";
import "./variant-a1.css";

function ResultLine({ label, value, sign = "", emphasis = false, adjustment = false }) {
  return (
    <div className={`a1__result-line${emphasis ? " is-emphasis" : ""}${adjustment ? " is-adjustment" : ""}`}>
      <dt>{label}</dt>
      <dd>{sign && <span aria-hidden="true">{sign}</span>}{formatMoney(value)}</dd>
    </div>
  );
}

export default function VariantA1({ workspace }) {
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
  const totalDeductions = totals.consolidatedExpenses + totals.managerCommission;

  return (
    <section className={`v2-concept a1${sent ? " is-sent" : ""}`} data-stage={stage} aria-labelledby="a1-title">
      <header className="a1__context">
        <div className="a1__heading">
          <span className="v2-eyebrow">Conferência financeira</span>
          <h1 id="a1-title">Fechamento</h1>
        </div>

        <div className="a1__route">
          <span>Rota em conferência</span>
          <strong>{route.name}</strong>
          <small>{route.manager}</small>
          <RouteMeta route={route} />
        </div>

        <div className="a1__competence">
          <span>Competência</span>
          <strong>{fixture.competenceLabel}</strong>
        </div>

        <div className="a1__state">
          <span>Estado</span>
          <StatusMark>{sent ? "Enviado ao gerente" : fixture.status}</StatusMark>
        </div>

        <button type="button" className="a1__context-action" onClick={openRoute}>Alterar contexto</button>
      </header>

      <div className="a1__desk">
        <main className="a1__workspace" aria-label="Lançamentos e conferência">
          <header className="a1__section-heading">
            <div>
              <span className="v2-eyebrow">Lançamentos</span>
              <h2>Movimento por modalidade</h2>
            </div>
            <p>Entrada, comissão e saída editáveis. Saldo calculado automaticamente.</p>
          </header>

          <section className="a1__ledger" aria-label="Linhas financeiras por modalidade">
            {totals.modalities.map((modality) => {
              const current = values[modality.id] || {};
              const automatic = modality.commissionRate !== null;

              return (
                <article className="a1__financial-unit" key={modality.id}>
                  <header className="a1__unit-heading">
                    <h3>{modality.name}</h3>
                    <span>{modality.rule}</span>
                  </header>

                  <div className="a1__unit-values">
                    <MoneyField
                      className="a1__metric"
                      label="Entrada"
                      value={current.entry}
                      onChange={(value) => updateValue(modality.id, "entry", value)}
                    />
                    {automatic ? (
                      <MoneyOutput
                        className="a1__metric is-calculated"
                        label="Comissão"
                        value={modality.commission}
                        helper="Pela regra da modalidade"
                      />
                    ) : (
                      <MoneyField
                        className="a1__metric"
                        label="Comissão"
                        value={current.commission}
                        onChange={(value) => updateValue(modality.id, "commission", value)}
                        helper="Informada manualmente"
                      />
                    )}
                    <MoneyField
                      className="a1__metric"
                      label="Saída"
                      value={current.exit}
                      onChange={(value) => updateValue(modality.id, "exit", value)}
                    />
                    <div className="a1__balance-zone">
                      <MoneyOutput
                        className="a1__balance"
                        label="Saldo"
                        value={modality.balance}
                        helper="Resultado da modalidade"
                      />
                    </div>
                  </div>
                </article>
              );
            })}
          </section>

          <ExpenseDisclosure workspace={workspace} className="a1__expenses" />

          <section className="a1__conference" aria-labelledby="a1-conference-title">
            <div className="a1__conference-copy">
              <span className="v2-eyebrow">Conferência</span>
              <h2 id="a1-conference-title">A rota fecha sem divergências</h2>
              <p>O repasse considera despesas, ajustes e comissão do gerente.</p>
            </div>

            <div className="a1__equation" aria-label="Composição do valor a repassar">
              <span>
                <small>Saldo bruto</small>
                <strong>{formatMoney(totals.grossBalance)}</strong>
              </span>
              <b aria-hidden="true">−</b>
              <span>
                <small>Deduções</small>
                <strong>{formatMoney(totalDeductions)}</strong>
              </span>
              <b aria-hidden="true">=</b>
              <span className="is-result">
                <small>A repassar</small>
                <strong>{formatMoney(totals.toTransfer)}</strong>
              </span>
            </div>

            <button type="button" onClick={() => setStage(4)} disabled={stage >= 4}>
              {stage >= 4 ? "Resultado conferido" : "Conferir resultado"}
            </button>
          </section>
        </main>

        <aside className="a1__result" aria-labelledby="a1-result-title">
          <header className="a1__result-heading">
            <div>
              <span className="v2-eyebrow">Resultado da rota</span>
              <h2 id="a1-result-title">{route.name}</h2>
              <small>{route.manager} · {fixture.competenceLabel}</small>
            </div>
            <StatusMark>{sent ? "Enviado" : fixture.status}</StatusMark>
          </header>

          <section className="a1__result-group" aria-labelledby="a1-movement-title">
            <h3 id="a1-movement-title">Movimento</h3>
            <dl>
              <ResultLine label="Entradas" value={totals.entries} />
              <ResultLine label="Comissões" value={totals.commissions} sign="− " />
              <ResultLine label="Saídas" value={totals.exits} sign="− " />
              <ResultLine label="Saldo bruto" value={totals.grossBalance} emphasis />
            </dl>
          </section>

          <section className="a1__result-group" aria-labelledby="a1-adjustments-title">
            <h3 id="a1-adjustments-title">Despesas e ajustes</h3>
            <dl>
              <ResultLine label="Despesas registradas" value={totals.registeredExpenses} sign="− " />
              <ResultLine label="Crédito Play Bet" value={totals.playBet} sign="+ " adjustment />
              <ResultLine label="Ajuda de custo" value={totals.costAid} sign="− " />
              {totals.extraCommission > 0 && <ResultLine label="Comissão extra" value={totals.extraCommission} sign="− " />}
              <ResultLine label="Despesas consolidadas" value={totals.consolidatedExpenses} emphasis />
            </dl>
          </section>

          <section className="a1__result-group is-manager" aria-labelledby="a1-manager-title">
            <h3 id="a1-manager-title">Resultado gerencial</h3>
            <dl>
              <ResultLine label="Após despesas" value={totals.afterExpenses} />
              <ResultLine label="Comissão do gerente" value={totals.managerCommission} sign="− " />
            </dl>
          </section>

          <div className="a1__transfer">
            <span>A repassar</span>
            <output aria-live="polite">{formatMoney(totals.toTransfer)}</output>
            <small>{sent ? "Prestação enviada ao gerente" : "Valor final da rota"}</small>
          </div>

          <div className="a1__actions">
            <ActionSet workspace={workspace} />
          </div>
        </aside>
      </div>
    </section>
  );
}
