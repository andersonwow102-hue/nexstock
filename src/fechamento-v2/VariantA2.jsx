import {
  ActionSet,
  ExpenseDisclosure,
  MoneyField,
  RouteMeta,
  StatusMark,
} from "./shared.jsx";
import { formatMoney } from "./model.js";
import "./variant-a2.css";

function numericMoney(value) {
  return formatMoney(value).replace(/^R\$\s*/, "");
}

function FinancialReadout({ label, value, helper = "", balance = false }) {
  return (
    <div className={`variant-a2__readout${balance ? " is-balance" : ""}`}>
      <span className="v2-field-label">{label}</span>
      <output aria-label={`${label}: ${formatMoney(value)}`} aria-live="polite">
        <span aria-hidden="true">R$</span>
        <strong>{numericMoney(value)}</strong>
      </output>
      {helper && <small>{helper}</small>}
    </div>
  );
}

function ResultLine({ label, value, sign = "", emphasis = false, adjustment = false }) {
  return (
    <div
      className={`variant-a2__result-line${emphasis ? " is-emphasis" : ""}${adjustment ? " is-adjustment" : ""}`}
    >
      <dt>{label}</dt>
      <dd>{sign && <span aria-hidden="true">{sign}</span>}{formatMoney(value)}</dd>
    </div>
  );
}

export default function VariantA2({ workspace }) {
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

  return (
    <section
      className={`v2-concept variant-a2${sent ? " is-sent" : ""}`}
      data-stage={stage}
      aria-labelledby="variant-a2-title"
    >
      <header className="variant-a2__context">
        <div className="variant-a2__title">
          <span className="v2-eyebrow">Conferência financeira</span>
          <h1 id="variant-a2-title">Fechamento</h1>
        </div>

        <div className="variant-a2__route">
          <span>Rota selecionada</span>
          <strong>{route.name}</strong>
          <small>{route.manager}</small>
          <RouteMeta route={route} />
        </div>

        <div className="variant-a2__competence">
          <span>Competência</span>
          <strong>{fixture.competenceLabel}</strong>
        </div>

        <StatusMark>{sent ? "Enviado ao gerente" : fixture.status}</StatusMark>
        <button type="button" className="variant-a2__context-action" onClick={openRoute}>Alterar contexto</button>
      </header>

      <div className="variant-a2__desk">
        <main className="variant-a2__work" aria-label="Lançamentos e conferência">
          <div className="variant-a2__section-head">
            <div>
              <span className="v2-eyebrow">Lançamentos</span>
              <h2>Movimento por modalidade</h2>
            </div>
            <span>3 modalidades · valores em reais</span>
          </div>

          <section className="variant-a2__ledger" aria-label="Blocos financeiros por modalidade">
            {totals.modalities.map((modality) => {
              const current = values[modality.id] || {};
              const automatic = modality.commissionRate !== null;

              return (
                <article className="variant-a2__modality" key={modality.id}>
                  <header>
                    <div>
                      <h3>{modality.name}</h3>
                      <span>{modality.rule}</span>
                    </div>
                    <small>Entrada − comissão − saída = saldo</small>
                  </header>

                  <div className="variant-a2__values">
                    <MoneyField
                      className="variant-a2__field"
                      label="Entrada"
                      value={current.entry}
                      onChange={(value) => updateValue(modality.id, "entry", value)}
                    />

                    {automatic ? (
                      <FinancialReadout
                        label="Comissão"
                        value={modality.commission}
                        helper="Calculada pela regra"
                      />
                    ) : (
                      <MoneyField
                        className="variant-a2__field"
                        label="Comissão"
                        value={current.commission}
                        onChange={(value) => updateValue(modality.id, "commission", value)}
                        helper="Informada manualmente"
                      />
                    )}

                    <MoneyField
                      className="variant-a2__field"
                      label="Saída"
                      value={current.exit}
                      onChange={(value) => updateValue(modality.id, "exit", value)}
                    />

                    <FinancialReadout
                      label="Saldo"
                      value={modality.balance}
                      helper="Resultado da modalidade"
                      balance
                    />
                  </div>
                </article>
              );
            })}
          </section>

          <ExpenseDisclosure workspace={workspace} className="variant-a2__expenses" />

          <section className="variant-a2__review" aria-labelledby="variant-a2-review-title">
            <div>
              <span className="v2-eyebrow">Conferência</span>
              <h2 id="variant-a2-review-title">Valores prontos para revisão</h2>
              <p>Saldo, despesas e comissão do gerente fecham sem divergências.</p>
            </div>
            <div className="variant-a2__review-result">
              <span>Repasse calculado</span>
              <output>{formatMoney(totals.toTransfer)}</output>
              <button type="button" onClick={() => setStage(4)} disabled={stage >= 4}>
                {stage >= 4 ? "Resultado conferido" : "Conferir resultado"}
              </button>
            </div>
          </section>
        </main>

        <aside className="variant-a2__result" aria-labelledby="variant-a2-result-title">
          <header>
            <span className="v2-eyebrow">Resultado da rota</span>
            <h2 id="variant-a2-result-title">{route.name}</h2>
            <small>{route.manager} · {fixture.competenceLabel}</small>
          </header>

          <section className="variant-a2__result-group" aria-labelledby="variant-a2-movement-title">
            <h3 id="variant-a2-movement-title">Movimento</h3>
            <dl>
              <ResultLine label="Entradas" value={totals.entries} />
              <ResultLine label="Comissões" value={totals.commissions} sign="− " />
              <ResultLine label="Saídas" value={totals.exits} sign="− " />
              <ResultLine label="Saldo bruto" value={totals.grossBalance} emphasis />
            </dl>
          </section>

          <section className="variant-a2__result-group" aria-labelledby="variant-a2-adjustments-title">
            <h3 id="variant-a2-adjustments-title">Despesas e ajustes</h3>
            <dl>
              <ResultLine label="Despesas registradas" value={totals.registeredExpenses} sign="− " />
              <ResultLine label="Crédito Play Bet" value={totals.playBet} sign="+ " adjustment />
              <ResultLine label="Ajuda de custo" value={totals.costAid} sign="− " />
              {totals.extraCommission > 0 && <ResultLine label="Comissão extra" value={totals.extraCommission} sign="− " />}
              <ResultLine label="Despesas consolidadas" value={totals.consolidatedExpenses} emphasis />
            </dl>
          </section>

          <section className="variant-a2__result-group is-last" aria-labelledby="variant-a2-manager-title">
            <h3 id="variant-a2-manager-title">Resultado líquido</h3>
            <dl>
              <ResultLine label="Após despesas" value={totals.afterExpenses} />
              <ResultLine label="Comissão do gerente" value={totals.managerCommission} sign="− " />
            </dl>
          </section>

          <div className="variant-a2__transfer">
            <span>A repassar</span>
            <output aria-label={`A repassar: ${formatMoney(totals.toTransfer)}`} aria-live="polite">
              <small aria-hidden="true">R$</small>
              <strong>{numericMoney(totals.toTransfer)}</strong>
            </output>
            <p>{sent ? "Prestação enviada ao gerente" : "Valor final da rota"}</p>
          </div>

          <div className="variant-a2__actions">
            <ActionSet workspace={workspace} />
          </div>
        </aside>
      </div>
    </section>
  );
}
