import {
  ExpenseDisclosure,
  MoneyField,
  MoneyOutput,
  RouteMeta,
} from "./shared.jsx";
import { formatMoney, OPERATIONAL_STATES } from "./model.js";
import "./variant-a3.css";

function DecisionRow({ label, value, sign = "", detail = "", accent = false }) {
  return (
    <div className={`variant-a3__decision-row${accent ? " is-accent" : ""}`}>
      <dt>
        <span>{label}</span>
        {detail && <small>{detail}</small>}
      </dt>
      <dd>{sign && <span aria-hidden="true">{sign}</span>}{formatMoney(value)}</dd>
    </div>
  );
}

function DecisionActions({ workspace }) {
  const { sent, act } = workspace;
  return (
    <div className="variant-a3__action-block">
      <span className="v2-eyebrow">Ação principal</span>
      <button type="button" className="v2-button v2-button-primary" onClick={() => act("send")} disabled={sent}>
        {sent ? "Enviado ao gerente" : "Enviar ao gerente"}
      </button>
      <button type="button" className="v2-button v2-button-secondary" onClick={() => act("save")}>Salvar rascunho</button>
      <div className="variant-a3__utilities" aria-label="Utilidades do fechamento">
        <button type="button" onClick={() => act("preview")}>Visualizar</button>
        <span aria-hidden="true" />
        <button type="button" onClick={() => act("export")}>Exportar</button>
      </div>
    </div>
  );
}

export default function VariantA3({ workspace }) {
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
  const statusIndex = sent ? 3 : stage >= 4 ? 2 : stage >= 3 ? 1 : 0;
  const activeStatus = OPERATIONAL_STATES[statusIndex];
  const netAdjustments = totals.playBet - totals.costAid - totals.extraCommission;

  return (
    <section className={`v2-concept variant-a3${sent ? " is-sent" : ""}`} aria-labelledby="variant-a3-title">
      <header className="variant-a3__context">
        <div className="variant-a3__heading">
          <span className="v2-eyebrow">Conferência financeira</span>
          <h1 id="variant-a3-title">Fechamento</h1>
        </div>
        <div className="variant-a3__route-context">
          <span>Rota em conferência</span>
          <strong>{route.name}</strong>
          <small>{route.manager}</small>
          <RouteMeta route={route} />
        </div>
        <div className="variant-a3__competence">
          <span>Competência</span>
          <strong>{fixture.competenceLabel}</strong>
        </div>
        <button type="button" className="variant-a3__context-action" onClick={openRoute}>Alterar contexto</button>
      </header>

      <div className="variant-a3__desk">
        <main className="variant-a3__work" aria-label="Lançamentos e conferência">
          <div className="variant-a3__section-head">
            <div>
              <span className="v2-eyebrow">Lançamentos</span>
              <h2>Movimento por modalidade</h2>
            </div>
            <p>Entrada, comissão e saída formam o saldo de cada operação.</p>
          </div>

          <section className="variant-a3__ledger" aria-label="Linhas financeiras por modalidade">
            {totals.modalities.map((modality) => {
              const current = values[modality.id] || {};
              const automatic = modality.commissionRate !== null;
              return (
                <article className="variant-a3__financial-line" key={modality.id}>
                  <header>
                    <h3>{modality.name}</h3>
                    <span>{modality.rule}</span>
                  </header>
                  <div className="variant-a3__line-values">
                    <MoneyField
                      className="variant-a3__metric"
                      label="Entrada"
                      value={current.entry}
                      onChange={(value) => updateValue(modality.id, "entry", value)}
                    />
                    {automatic ? (
                      <MoneyOutput className="variant-a3__metric is-calculated" label="Comissão" value={modality.commission} helper="Pela regra da modalidade" />
                    ) : (
                      <MoneyField
                        className="variant-a3__metric"
                        label="Comissão"
                        value={current.commission}
                        onChange={(value) => updateValue(modality.id, "commission", value)}
                        helper="Informada manualmente"
                      />
                    )}
                    <MoneyField
                      className="variant-a3__metric"
                      label="Saída"
                      value={current.exit}
                      onChange={(value) => updateValue(modality.id, "exit", value)}
                    />
                    <MoneyOutput className="variant-a3__balance" label="Saldo" value={modality.balance} helper="Resultado da modalidade" />
                  </div>
                </article>
              );
            })}
          </section>

          <ExpenseDisclosure workspace={workspace} className="variant-a3__expenses" />

          <section className="variant-a3__review" aria-labelledby="variant-a3-review-title">
            <div>
              <span className="v2-eyebrow">Conferência</span>
              <h2 id="variant-a3-review-title">Valores consistentes para decisão</h2>
              <p>O saldo da rota considera despesas, ajustes e comissão do gerente.</p>
            </div>
            <button type="button" onClick={() => setStage(4)} disabled={stage >= 4}>
              {stage >= 4 ? "Pronto para envio" : "Concluir revisão"}
            </button>
          </section>
        </main>

        <aside className="variant-a3__decision" aria-labelledby="variant-a3-decision-title">
          <header>
            <span className="v2-eyebrow">Coluna de decisão</span>
            <h2 id="variant-a3-decision-title">Parecer da rota</h2>
          </header>

          <section className="variant-a3__identity" aria-label="Rota e estado">
            <div>
              <span>Rota</span>
              <strong>{route.name}</strong>
              <small>{route.manager} · {fixture.competenceLabel}</small>
            </div>
            <div>
              <span>Estado</span>
              <strong>{activeStatus}</strong>
              <small>{route.points} pontos · {route.equipment} equipamentos</small>
            </div>
          </section>

          <ol className="variant-a3__status-ladder" aria-label={`Estado operacional: ${activeStatus}`}>
            {OPERATIONAL_STATES.map((status, index) => (
              <li
                key={status}
                className={`${index < statusIndex ? "is-complete " : ""}${index === statusIndex ? "is-current" : ""}`.trim()}
                aria-current={index === statusIndex ? "step" : undefined}
              >
                <span aria-hidden="true" />
                <small>{status}</small>
              </li>
            ))}
          </ol>

          <section className="variant-a3__composition" aria-labelledby="variant-a3-composition-title">
            <h3 id="variant-a3-composition-title">Composição do resultado</h3>
            <dl>
              <DecisionRow label="Entradas" value={totals.entries} sign="+ " />
              <DecisionRow label="Saídas" value={totals.exits} sign="− " detail={`Comissões: ${formatMoney(totals.commissions)}`} />
              <DecisionRow label="Despesas" value={totals.registeredExpenses} sign="− " detail="3 lançamentos registrados" />
              <DecisionRow label="Ajustes" value={Math.abs(netAdjustments)} sign={netAdjustments >= 0 ? "+ " : "− "} detail="Créditos e ajuda de custo" accent />
            </dl>
            <div className="variant-a3__manager-proof">
              <span>Após despesas</span>
              <strong>{formatMoney(totals.afterExpenses)}</strong>
              <small>Comissão do gerente − {formatMoney(totals.managerCommission)}</small>
            </div>
          </section>

          <div className="variant-a3__final">
            <span>Resultado final</span>
            <output aria-live="polite">{formatMoney(totals.toTransfer)}</output>
            <small>{sent ? `Enviado para ${route.manager}` : "Valor a repassar ao gerente"}</small>
          </div>

          <DecisionActions workspace={workspace} />
        </aside>
      </div>
    </section>
  );
}
