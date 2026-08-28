import { useEffect, useId, useState } from "react";
import { FIXTURE, formatMoney, formatMoneyInput, parseMoney } from "./model.js";

export function MoneyField({ label, value, onChange, helper = "", className = "" }) {
  const id = useId();
  const [draft, setDraft] = useState(formatMoneyInput(value));

  useEffect(() => {
    setDraft(formatMoneyInput(value));
  }, [value]);

  function commit() {
    const next = parseMoney(draft);
    onChange(next);
    setDraft(formatMoneyInput(next));
  }

  return (
    <label className={`v2-money-field ${className}`.trim()} htmlFor={id}>
      <span className="v2-field-label">{label}</span>
      <span className="v2-input-shell">
        <span aria-hidden="true">R$</span>
        <input
          id={id}
          inputMode="decimal"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
        />
      </span>
      {helper && <small>{helper}</small>}
    </label>
  );
}

export function MoneyOutput({ label, value, helper = "", className = "" }) {
  return (
    <div className={`v2-money-output ${className}`.trim()}>
      <span className="v2-field-label">{label}</span>
      <output aria-live="polite">{formatMoney(value)}</output>
      {helper && <small>{helper}</small>}
    </div>
  );
}

export function ExpenseDisclosure({ workspace, className = "", compact = false }) {
  const { totals, expensesOpen, toggleExpenses, adjustments, updateAdjustment } = workspace;
  return (
    <section className={`v2-expense-disclosure ${compact ? "is-compact" : ""} ${className}`.trim()}>
      <button type="button" className="v2-expense-trigger" aria-expanded={expensesOpen} onClick={toggleExpenses}>
        <span>
          <small>Despesas e ajustes</small>
          <strong>{FIXTURE.expenses.length} lançamentos registrados</strong>
        </span>
        <span>
          <strong>{formatMoney(totals.consolidatedExpenses)}</strong>
          <small>{expensesOpen ? "Recolher" : "Expandir"}</small>
        </span>
      </button>
      {expensesOpen && (
        <div className="v2-expense-body">
          <div className="v2-expense-list" aria-label="Despesas registradas">
            {FIXTURE.expenses.map((expense) => (
              <div key={expense.id}>
                <span><strong>{expense.name}</strong><small>{expense.source}</small></span>
                <b>{formatMoney(expense.value)}</b>
              </div>
            ))}
          </div>
          <div className="v2-adjustment-grid">
            <MoneyField label="Crédito Play Bet" value={adjustments.playBet} onChange={(value) => updateAdjustment("playBet", value)} helper="Reduz as despesas" />
            <MoneyField label="Ajuda de custo" value={adjustments.costAid} onChange={(value) => updateAdjustment("costAid", value)} helper="Soma às despesas" />
            <MoneyField label="Comissão extra" value={adjustments.extraCommission} onChange={(value) => updateAdjustment("extraCommission", value)} helper="Ajuste autorizado" />
          </div>
          <div className="v2-expense-proof">
            <span>Registradas {formatMoney(totals.registeredExpenses)}</span>
            <span>− Play Bet {formatMoney(totals.playBet)}</span>
            <span>+ Ajuda {formatMoney(totals.costAid)}</span>
            <strong>Consolidadas {formatMoney(totals.consolidatedExpenses)}</strong>
          </div>
        </div>
      )}
    </section>
  );
}

export function ActionSet({ workspace, compact = false, includeSend = true }) {
  return (
    <div className={`v2-action-set ${compact ? "is-compact" : ""}`}>
      <button type="button" className="v2-button v2-button-secondary" onClick={() => workspace.act("save")}>Salvar rascunho</button>
      <button type="button" className="v2-button v2-button-quiet" onClick={() => workspace.act("preview")}>Visualizar</button>
      <button type="button" className="v2-button v2-button-quiet" onClick={() => workspace.act("export")}>Exportar</button>
      {includeSend && <button type="button" className="v2-button v2-button-primary" onClick={() => workspace.act("send")}>{workspace.sent ? "Enviado para o gerente" : "Enviar ao gerente"}</button>}
    </div>
  );
}

export function StatusMark({ children = "Pronto para revisão" }) {
  return <span className="v2-status"><span aria-hidden="true" />{children}</span>;
}

export function RouteMeta({ route }) {
  return <span className="v2-route-meta">{route.points} pontos <i aria-hidden="true">·</i> {route.equipment} equipamentos</span>;
}
