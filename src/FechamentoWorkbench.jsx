import { useEffect, useMemo, useRef, useState } from "react";
import { OperationIcon } from "./components/operations/OperationsUI.jsx";

const PRIORIDADE_STATUS = {
  pendente: 0,
  rascunho: 1,
  visualizado: 2,
  enviado: 3,
  confirmado: 4,
  finalizado: 5,
};

function Icon({ name, size = 17 }) {
  return <OperationIcon name={name} size={size} />;
}

function normalizarBusca(valor = "") {
  return String(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

function iconeStatus(classe = "") {
  if (classe === "finalizado" || classe === "confirmado") return "checkCircle";
  if (classe === "visualizado") return "eye";
  if (classe === "enviado") return "arrowRight";
  if (classe === "rascunho") return "fileText";
  return "clock";
}

function sinalResultado(valor) {
  if (Number(valor) > 0) return "is-positive";
  if (Number(valor) < 0) return "is-negative";
  return "is-zero";
}

function semPrefixoMoeda(valor) {
  return String(valor || "").replace(/^R\$\s?/, "");
}

function Money({ value, formatar, className = "" }) {
  return <span className={`fc-money ${sinalResultado(value)} ${className}`.trim()}>{formatar(value)}</span>;
}

function etapaClasse(numero, etapaAtual, etapaConcluida) {
  if (etapaConcluida || numero < etapaAtual) return "is-complete";
  if (numero === etapaAtual) return "is-current";
  return "is-future";
}

export default function FechamentoWorkbench({
  etapas = [],
  etapaAtual = 2,
  etapaConcluida = false,
  periodo,
  rotas = [],
  selecao,
  financeiro,
  ajustes,
  despesas,
  feedback,
  acoes,
  prazos,
  secondaryTools = null,
}) {
  const [buscaRota, setBuscaRota] = useState("");
  const [revisaoAberta, setRevisaoAberta] = useState(etapaAtual >= 4);
  const [resumoMobileAberto, setResumoMobileAberto] = useState(false);
  const resumoMobileToggleRef = useRef(null);

  useEffect(() => {
    if (etapaAtual >= 4) setRevisaoAberta(true);
  }, [etapaAtual]);

  useEffect(() => {
    if (!resumoMobileAberto) return undefined;
    function fecharResumoComEscape(event) {
      if (event.key !== "Escape" || !window.matchMedia("(max-width: 900px)").matches) return;
      setResumoMobileAberto(false);
      window.requestAnimationFrame(() => resumoMobileToggleRef.current?.focus());
    }
    document.addEventListener("keydown", fecharResumoComEscape);
    return () => document.removeEventListener("keydown", fecharResumoComEscape);
  }, [resumoMobileAberto]);

  const rotasVisiveis = useMemo(() => {
    const termo = normalizarBusca(buscaRota);
    return [...rotas]
      .filter((item) => !termo || normalizarBusca(`${item.gerente} ${item.rota} ${item.status?.titulo}`).includes(termo))
      .sort((a, b) => {
        const prioridadeA = PRIORIDADE_STATUS[a.status?.classe] ?? 9;
        const prioridadeB = PRIORIDADE_STATUS[b.status?.classe] ?? 9;
        return prioridadeA - prioridadeB || String(a.rota).localeCompare(String(b.rota), "pt-BR");
      });
  }, [buscaRota, rotas]);

  const formatar = financeiro?.formatarMoeda || ((valor) => String(valor ?? 0));
  const totais = financeiro?.totais || {};
  const modalidades = financeiro?.modalidades || [];
  const rotaAtiva = Boolean(selecao?.gerente && selecao?.rota);
  const statusAtual = selecao?.status || { classe: "pendente", titulo: "Sem envio", descricao: "Selecione uma rota" };

  function irParaEtapa(numero) {
    if (numero === 4) setRevisaoAberta(true);
    if (numero === 5 && rotaAtiva) setResumoMobileAberto(true);
    const destinos = {
      1: "fechamento-periodo",
      2: "fechamento-rotas",
      3: rotaAtiva ? "fechamento-lancamentos" : "fechamento-rotas",
      4: rotaAtiva ? "fechamento-revisao" : "fechamento-rotas",
      5: rotaAtiva ? "fechamento-publicacao" : "fechamento-rotas",
    };
    window.requestAnimationFrame(() => {
      const destino = document.getElementById(destinos[numero]);
      if (numero === 2 && destino instanceof HTMLDetailsElement) destino.open = true;
      const reduzirMovimento = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
      destino?.scrollIntoView({ behavior: reduzirMovimento ? "auto" : "smooth", block: "start" });
    });
  }

  return (
    <section className="secao fechamento-page" data-layout="workbench" data-visual="a3-executive" data-composition="final-a1-a3">
      <nav className="fechamento-progress" aria-label="Progressão do fechamento">
        <ol>
          {etapas.map((etapa, indice) => {
            const numero = indice + 1;
            const classe = etapaClasse(numero, etapaAtual, etapaConcluida);
            return (
              <li key={etapa} className={classe}>
                <button
                  type="button"
                  onClick={() => irParaEtapa(numero)}
                  aria-current={numero === etapaAtual ? "step" : undefined}
                  aria-label={`${String(numero).padStart(2, "0")} ${etapa}${classe === "is-complete" ? ", concluída" : classe === "is-current" ? ", etapa atual" : ""}`}
                >
                  <span>{classe === "is-complete" ? <Icon name="check" size={15} /> : String(numero).padStart(2, "0")}</span>
                  <strong>{etapa}</strong>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {prazos?.aberto && (
        <section className="fechamento-prazos-drawer" aria-label="Configuração de prazos para despesas">
          <header>
            <div>
              <span className="fechamento-step-label"><b>Ferramenta</b> Prazos de despesas</span>
              <h2>Liberação excepcional de competência</h2>
            </div>
            <button type="button" className="fc-icon-button" onClick={prazos.onFechar} aria-label="Fechar configuração de prazos"><Icon name="close" /></button>
          </header>
          {prazos.conteudo}
        </section>
      )}

      <section className="fechamento-contexto" id="fechamento-periodo" aria-labelledby="fechamento-periodo-titulo">
        <div className="fechamento-contexto-identidade">
          <span className="fechamento-step-label"><b>01</b> Período</span>
          <strong id="fechamento-periodo-titulo">{periodo?.label}</strong>
        </div>
        <label>
          <span>Competência</span>
          <input
            type="month"
            value={periodo?.competencia || ""}
            max={periodo?.maxCompetencia}
            onChange={(event) => periodo?.onCompetenciaChange?.(event.target.value)}
          />
        </label>
        <label>
          <span>Dia opcional</span>
          <input type="date" value={periodo?.dia || ""} onChange={(event) => periodo?.onDiaChange?.(event.target.value)} />
        </label>
        <button className="fc-text-action" type="button" onClick={periodo?.onMesAnterior}>
          <Icon name="history" size={15} /> Mês anterior
        </button>
        <div className={`fechamento-contexto-status ${statusAtual.classe}`}>
          <Icon name={iconeStatus(statusAtual.classe)} />
          <span><small>{rotaAtiva ? `${selecao.gerente} · ${selecao.rota}` : "Nenhuma rota selecionada"}</small><strong>{statusAtual.titulo}</strong></span>
        </div>
      </section>

      <details className={`fechamento-rotas ${rotaAtiva ? "has-selection" : ""}`} id="fechamento-rotas" open={!rotaAtiva} aria-labelledby="fechamento-rotas-titulo">
        <summary className="fc-section-head">
          <div>
            <span className="fechamento-step-label"><b>02</b> Rota</span>
            <h2 id="fechamento-rotas-titulo">{rotaAtiva ? `${selecao.rota} · ${selecao.gerente}` : "Fila operacional"}</h2>
            {rotaAtiva && <p>{statusAtual.titulo} · {selecao.pontos} ponto{selecao.pontos !== 1 ? "s" : ""} · {selecao.equipamentos} equipamento{selecao.equipamentos !== 1 ? "s" : ""}</p>}
          </div>
          <span className="fechamento-rota-summary-action">{rotaAtiva ? "Alterar rota" : `${rotasVisiveis.length} rota${rotasVisiveis.length !== 1 ? "s" : ""}`} <Icon name="chevronDown" size={15} /></span>
        </summary>

        <div className="fechamento-rotas-body" aria-labelledby="fechamento-rotas-titulo">
          <label className="fechamento-rota-busca">
            <span className="fc-sr-only">Buscar gerente, rota ou status</span>
            <Icon name="search" size={16} />
            <input value={buscaRota} onChange={(event) => setBuscaRota(event.target.value)} placeholder="Buscar gerente, rota ou status" />
            {buscaRota && <button type="button" onClick={() => setBuscaRota("")} aria-label="Limpar busca"><Icon name="close" size={14} /></button>}
          </label>

          <div className="fechamento-rota-ledger" role="listbox" aria-label="Gerentes e rotas do fechamento">
            <div className="fechamento-rota-ledger-head" aria-hidden="true">
              <span>Rota e responsável</span><span>Despesas</span><span>Base</span><span>Situação</span>
            </div>
            <div className="fechamento-rota-ledger-body">
              {rotasVisiveis.map((item) => {
                const ativa = selecao?.gerente === item.gerente && selecao?.rota === item.rota;
                const status = item.status || {};
                return (
                  <button
                    key={`${item.gerente}-${item.rota}`}
                    className={`fechamento-rota-row ${ativa ? "is-selected" : ""} status-${status.classe || "pendente"}`}
                    type="button"
                    role="option"
                    aria-selected={ativa}
                    onClick={(event) => {
                      selecao?.onSelecionar?.(item);
                      event.currentTarget.closest("details")?.removeAttribute("open");
                    }}
                    style={{ "--gerente-cor": item.cor?.color, "--gerente-bg": item.cor?.bg, "--gerente-border": item.cor?.border }}
                  >
                    <span className="fechamento-rota-nome"><i aria-hidden="true">{String(item.rota || "R").slice(0, 2).toUpperCase()}</i><span><strong>{item.rota}</strong><small>{item.gerente}</small></span></span>
                    <span className="fechamento-rota-valor"><small>Despesas</small><b>{formatar(item.totalDespesas)}</b></span>
                    <span className="fechamento-rota-base"><small>Base</small><b>{item.pontos} pt.</b><em>{item.equipamentos} equip.</em></span>
                    <span className={`fechamento-rota-state ${status.classe || "pendente"}`}><Icon name={iconeStatus(status.classe)} size={16} /><span><b>{status.titulo}</b><small>{status.descricao}</small></span></span>
                    <Icon name="chevronRight" size={16} />
                  </button>
                );
              })}
              {rotasVisiveis.length === 0 && <p className="fechamento-vazio">Nenhuma rota corresponde à busca.</p>}
            </div>
          </div>
        </div>
      </details>

      {rotaAtiva ? (
        <div className="fechamento-workspace">
          <div className="fechamento-workspace-main">
            <section className="fechamento-lancamentos" id="fechamento-lancamentos" aria-labelledby="fechamento-lancamentos-titulo">
              <header className="fc-section-head fechamento-lancamentos-head">
                <div>
                  <span className="fechamento-step-label"><b>03</b> Lançamentos</span>
                  <h2 id="fechamento-lancamentos-titulo">Movimento por modalidade</h2>
                </div>
                <div className="fechamento-lancamentos-meta">
                  <p>Entrada, comissão e saída editáveis. Saldo calculado automaticamente.</p>
                  {selecao.rotasDisponiveis?.length > 1 && (
                    <label className="fechamento-trocar-rota"><span>Trocar rota</span><select value={selecao.rota} onChange={(event) => selecao.onTrocarRota?.(event.target.value)}>{selecao.rotasDisponiveis.map((rota) => <option key={rota} value={rota}>{rota}</option>)}</select></label>
                  )}
                </div>
              </header>

              <div className="fechamento-matriz" role="table" aria-label="Entradas, comissões, saídas e saldos por modalidade">
                <div className="fechamento-matriz-head" role="row">
                  <span role="columnheader">Modalidade</span><span role="columnheader">Entrada</span><span role="columnheader">Comissão</span><span role="columnheader">Saída</span><span role="columnheader">Saldo</span><span role="columnheader">Regra</span>
                </div>
                <div className="fechamento-matriz-body" role="rowgroup">
                  {modalidades.map((modalidade) => {
                    const valores = financeiro.valores?.[modalidade.id] || {};
                    const automatica = modalidade.comissao !== null && valores.comissaoAutomatica !== false;
                    const comissaoEditavel = modalidade.comissao === null || !automatica;
                    const idBase = `fechamento-${String(modalidade.id).replace(/[^a-z0-9-]/gi, "-")}`;
                    return (
                      <div className="fechamento-matriz-row" role="row" key={modalidade.id}>
                        <div className="fechamento-modalidade" role="rowheader"><span aria-hidden="true">{modalidade.nome.slice(0, 2).toUpperCase()}</span><div><strong>{modalidade.nome}</strong><small>{modalidade.descricao}</small></div></div>
                        <label className="fechamento-valor-campo" data-label="Entrada" role="cell" htmlFor={`${idBase}-entrada`}><span>R$</span><input id={`${idBase}-entrada`} type="text" inputMode="decimal" value={valores.entrada || ""} onChange={(event) => financeiro.onAlterarModalidade?.(modalidade.id, "entrada", event.target.value)} placeholder="0,00" aria-label={`Entrada de ${modalidade.nome}`} /></label>
                        <label className={`fechamento-valor-campo ${automatica ? "is-calculated" : ""}`} data-label="Comissão" role="cell" htmlFor={`${idBase}-comissao`}><span>R$</span><input id={`${idBase}-comissao`} type="text" inputMode="decimal" value={comissaoEditavel ? semPrefixoMoeda(valores.comissao) : semPrefixoMoeda(formatar(modalidade.comissaoCalculada))} onChange={(event) => financeiro.onAlterarModalidade?.(modalidade.id, "comissao", event.target.value)} onBlur={() => comissaoEditavel && financeiro.onFormatarComissao?.(modalidade.id)} disabled={!comissaoEditavel} placeholder="0,00" aria-label={`Comissão de ${modalidade.nome}`} /></label>
                        <label className="fechamento-valor-campo" data-label="Saída" role="cell" htmlFor={`${idBase}-saida`}><span>R$</span><input id={`${idBase}-saida`} type="text" inputMode="decimal" value={valores.saida || ""} onChange={(event) => financeiro.onAlterarModalidade?.(modalidade.id, "saida", event.target.value)} placeholder="0,00" aria-label={`Saída de ${modalidade.nome}`} /></label>
                        <output className={`fechamento-saldo-output ${sinalResultado(modalidade.saldoBruto)}`} data-label="Saldo" role="cell" htmlFor={`${idBase}-entrada ${idBase}-comissao ${idBase}-saida`} aria-live="polite"><small>Saldo</small><Money key={`${modalidade.id}-${modalidade.saldoBruto}`} value={modalidade.saldoBruto} formatar={formatar} /></output>
                        <div className="fechamento-regra" role="cell">
                          {modalidade.comissao === null ? <span className="is-manual"><Icon name="edit" size={14} /> Manual</span> : (
                            <div className="fechamento-regra-toggle" role="group" aria-label={`Regra de comissão de ${modalidade.nome}`}>
                              <button type="button" className={automatica ? "is-active" : ""} aria-pressed={automatica} onClick={() => financeiro.onAlterarModalidade?.(modalidade.id, "comissaoAutomatica", true)}>Auto <b>{Math.round(modalidade.comissao * 100)}%</b></button>
                              <button type="button" className={!automatica ? "is-active" : ""} aria-pressed={!automatica} onClick={() => financeiro.onAlterarModalidade?.(modalidade.id, "comissaoAutomatica", false)}>Manual</button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="fechamento-lancamentos-foot">
                <span><Icon name="info" size={15} /> O saldo é calculado; somente entrada, comissão manual e saída são editáveis.</span>
                <button type="button" className="fc-secondary-action" onClick={() => { setRevisaoAberta(true); irParaEtapa(4); }}>Conferir resultado <Icon name="arrowRight" size={15} /></button>
              </div>
            </section>

            <section className={`fechamento-revisao ${revisaoAberta ? "is-open" : ""}`} id="fechamento-revisao" aria-labelledby="fechamento-revisao-titulo">
              <header className="fc-section-head">
                <div><span className="fechamento-step-label"><b>04</b> Conferência</span><h2 id="fechamento-revisao-titulo">Despesas e ajustes</h2></div>
                <button type="button" className="fc-disclosure" aria-expanded={revisaoAberta} aria-controls="fechamento-revisao-conteudo" onClick={() => setRevisaoAberta((atual) => !atual)}>{revisaoAberta ? "Recolher" : "Abrir conferência"}<Icon name="chevronDown" size={15} /></button>
              </header>
              <div className="fechamento-review-teaser" aria-label="Composição do resultado final">
                <span><small>Saldo bruto</small><Money value={totais.saldoBruto} formatar={formatar} /></span>
                <b aria-hidden="true">−</b>
                <span><small>Despesas</small><Money value={totais.despesasFinais} formatar={formatar} /></span>
                <b aria-hidden="true">−</b>
                <span><small>Comissão do gerente</small><Money value={totais.comissaoGerente} formatar={formatar} /></span>
                <b aria-hidden="true">=</b>
                <span className="is-result"><small>Resultado final</small><Money value={totais.saldoRepassar} formatar={formatar} /></span>
              </div>

              <div className="fechamento-revisao-conteudo" id="fechamento-revisao-conteudo" aria-hidden={!revisaoAberta} inert={!revisaoAberta ? true : undefined}>
                <div className="fechamento-despesas-ledger">
                  <header><div><span>Despesas registradas</span><strong>{formatar(totais.despesasSistema)}</strong></div><small>{despesas?.grupos?.length || 0} grupo{despesas?.grupos?.length !== 1 ? "s" : ""} · {despesas?.quantidadeLancamentos || 0} lançamento{despesas?.quantidadeLancamentos !== 1 ? "s" : ""}</small></header>
                  {(despesas?.grupos || []).length === 0 ? <p className="fechamento-vazio">Nenhuma despesa encontrada neste recorte.</p> : despesas.grupos.map((grupo) => (
                    <article key={grupo.chave}>
                      <span><strong>{grupo.nome}</strong><small>{grupo.lancamentos.map((item) => item.descricao || "Despesa sem descrição").join(" · ")}</small></span>
                      <span className="fechamento-despesa-contexto"><small>{[...grupo.meses].join(", ")}</small>{grupo.modalidades.size > 0 && <em>{[...grupo.modalidades].join(", ")}</em>}</span>
                      <b>{formatar(grupo.total)}</b>
                    </article>
                  ))}
                </div>

                <div className="fechamento-ajustes-ledger">
                  <header><span>Ajustes aplicados</span><strong>{formatar(totais.despesasFinais)}</strong></header>
                  <label><span><strong>Despesas Play Bet</strong><small>Abatimento das despesas registradas</small></span><i>−</i><span className="fechamento-ajuste-input"><b>R$</b><input type="text" inputMode="decimal" value={semPrefixoMoeda(ajustes?.playBet?.valor)} onChange={(event) => ajustes?.playBet?.onChange?.(event.target.value)} onBlur={ajustes?.playBet?.onBlur} placeholder="0,00" aria-label="Subtrair despesas da Play Bet" /></span></label>
                  <label><span><strong>Ajuda de custo</strong><small>Acréscimo às despesas da rota</small></span><i>+</i><span className="fechamento-ajuste-input"><b>R$</b><input type="text" inputMode="decimal" value={semPrefixoMoeda(ajustes?.ajudaCusto?.valor)} onChange={(event) => ajustes?.ajudaCusto?.onChange?.(event.target.value)} onBlur={ajustes?.ajudaCusto?.onBlur} placeholder="0,00" aria-label="Ajuda de custo" /></span></label>
                  {ajustes?.comissaoExtra?.permitida && <label><span><strong>Comissão extra</strong><small>Acréscimo permitido para esta rota</small></span><i>+</i><span className="fechamento-ajuste-input"><b>R$</b><input type="text" inputMode="decimal" value={semPrefixoMoeda(ajustes.comissaoExtra.valor)} onChange={(event) => ajustes.comissaoExtra.onChange?.(event.target.value)} onBlur={ajustes.comissaoExtra.onBlur} placeholder="0,00" aria-label="Comissão extra" /></span></label>}
                  <div className="fechamento-ajustes-total"><span>Despesas consolidadas</span><Money value={totais.despesasFinais} formatar={formatar} /></div>
                </div>
              </div>
            </section>

          </div>

          <aside
            className={`fechamento-summary ${resumoMobileAberto ? "is-open" : ""}`}
            data-status={statusAtual.classe}
            aria-label="Coluna de decisão do fechamento"
          >
            <button ref={resumoMobileToggleRef} className="fechamento-summary-mobile-toggle" type="button" aria-expanded={resumoMobileAberto} aria-controls="fechamento-summary-panel" onClick={() => setResumoMobileAberto((atual) => !atual)}>
              <span><small>Resultado final</small><Money value={totais.saldoRepassar} formatar={formatar} /></span><Icon name="chevronDown" />
            </button>
            <div className="fechamento-summary-body" id="fechamento-summary-panel">
              <header className="fechamento-decision-head">
                <span>Coluna de decisão</span>
                <div><strong>Parecer da rota</strong><span className={`fechamento-publicacao-status ${statusAtual.classe}`}><Icon name={iconeStatus(statusAtual.classe)} /><b>{statusAtual.titulo}</b></span></div>
                <h2>{selecao.rota}</h2>
                <small>{selecao.gerente} · {periodo?.label}</small>
              </header>
              <div className="fechamento-summary-base"><span><small>Pontos</small><b>{selecao.pontos}</b></span><span><small>Equipamentos</small><b>{selecao.equipamentos}</b></span></div>

              <section className={`fechamento-decision-state ${statusAtual.classe}`} aria-label="Estado operacional real">
                <span>Estado operacional</span>
                <strong>{statusAtual.titulo}</strong>
                <small>{statusAtual.texto || statusAtual.descricao}</small>
                <ol className="fechamento-decision-ladder" aria-label={`Progressão real do fechamento: ${etapas[etapaAtual - 1] || statusAtual.titulo}`}>
                  {etapas.map((etapa, indice) => {
                    const numero = indice + 1;
                    const classe = etapaClasse(numero, etapaAtual, etapaConcluida);
                    return <li key={etapa} className={classe} aria-current={numero === etapaAtual ? "step" : undefined}><span aria-hidden="true" /><small>{etapa}</small></li>;
                  })}
                </ol>
              </section>

              <section className="fechamento-decision-group" aria-labelledby="fechamento-decision-composicao">
                <h3 id="fechamento-decision-composicao">Composição do resultado</h3>
                <dl className="fechamento-summary-ledger">
                  <div><dt><span>Entradas</span></dt><dd>+ {formatar(totais.entradas)}</dd></div>
                  <div><dt><span>Saídas</span><small>Comissões: {formatar(totais.comissoes)}</small></dt><dd>− {formatar(totais.saidas)}</dd></div>
                  <div className="is-informative"><dt><span>Despesas registradas</span><small>{despesas?.quantidadeLancamentos || 0} lançamento{despesas?.quantidadeLancamentos !== 1 ? "s" : ""} · base antes dos ajustes</small></dt><dd>{formatar(totais.despesasSistema)}</dd></div>
                  <div className="is-adjustment">
                    <dt><span>Ajustes</span><small>Valores informados antes da consolidação</small></dt>
                    <dd className="fechamento-adjustment-values">
                      <span>+ {formatar(ajustes?.playBet?.numero || 0)}</span>
                      <span>− {formatar(ajustes?.ajudaCusto?.numero || 0)}</span>
                      {ajustes?.comissaoExtra?.permitida && <span>− {formatar(ajustes.comissaoExtra.numero || 0)}</span>}
                    </dd>
                  </div>
                  <div className="is-subtotal"><dt><span>Despesas consolidadas</span><small>Dedução real após os ajustes aplicáveis</small></dt><dd>− {formatar(totais.despesasFinais)}</dd></div>
                </dl>
                <div className="fechamento-decision-manager-proof">
                  <span>Após despesas</span>
                  <strong>{formatar(totais.saldoFinal)}</strong>
                  <small>Comissão do gerente − {formatar(totais.comissaoGerente)}</small>
                </div>
              </section>

              <div className={`fechamento-summary-result ${sinalResultado(totais.saldoRepassar)}`}><span>Resultado final</span><Money value={totais.saldoRepassar} formatar={formatar} /><small>Valor a repassar ao gerente</small></div>

              <section className="fechamento-publicacao" id="fechamento-publicacao" aria-labelledby="fechamento-publicacao-titulo">
                <div className="fechamento-publicacao-copy">
                  <span className="fechamento-section-label"><span>05</span><strong>Ação principal</strong></span>
                  <h2 id="fechamento-publicacao-titulo" className="fc-sr-only">Publicação da prestação</h2>
                  <p>{acoes?.isEnviado ? "Uma nova publicação reinicia o ciclo de visualização e confirmação." : `Destino: ${selecao.gerente} · ${selecao.rota}`}</p>
                </div>
                <div className="fechamento-publicacao-actions">
                  {acoes?.isFinalizado ? (
                    <button type="button" className="fc-primary-action is-complete" disabled><Icon name="checkCircle" /> Prestação finalizada</button>
                  ) : acoes?.isConfirmado ? (
                    <button type="button" className="fc-primary-action" onClick={acoes.onFinalizar} disabled={acoes.salvando}><Icon name="checkCircle" /> {acoes.salvando ? "Finalizando..." : "Finalizar prestação"}</button>
                  ) : (
                    <button type="button" className="fc-primary-action" onClick={acoes?.onEnviar} disabled={acoes?.salvando}><Icon name="arrowRight" /> {acoes?.salvando ? "Processando..." : acoes?.isEnviado ? "Reenviar atualização" : `Enviar para ${selecao.gerente}`}</button>
                  )}
                  <div className="fechamento-secondary-actions">
                    <button type="button" className="fc-secondary-action" onClick={acoes?.onSalvar} disabled={acoes?.salvando}><Icon name="fileText" /> {acoes?.salvando ? "Salvando..." : "Salvar rascunho"}</button>
                    <button type="button" className="fc-secondary-action" onClick={acoes?.onVisualizar}><Icon name="eye" /> Visualizar PDF</button>
                  </div>
                  <details className="fechamento-downloads">
                    <summary><Icon name="download" /> Downloads <Icon name="chevronDown" size={14} /></summary>
                    <div><button type="button" onClick={acoes?.onBaixarRota}>Baixar rota atual</button><button type="button" onClick={acoes?.onBaixarGerente}>Baixar todas as rotas</button></div>
                  </details>
                </div>
                {(feedback?.erro || feedback?.sucesso) && <div className={feedback.erro ? "erro-box" : "sucesso-box"} role="status">{feedback.erro || feedback.sucesso}</div>}
              </section>
            </div>
          </aside>
        </div>
      ) : (
        <section className="fechamento-empty-workbench" aria-label="Aguardando seleção de rota"><Icon name="route" size={22} /><span><strong>Selecione uma rota para abrir a mesa de conferência.</strong><small>Período e fila permanecem disponíveis acima.</small></span></section>
      )}

      {secondaryTools}
    </section>
  );
}
