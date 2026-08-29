import { useEffect, useMemo, useState } from "react";
import { OperationIcon } from "./components/operations/OperationsUI.jsx";
import "./DashboardPage.css";

function useReducedMotion() {
  const [reduzir, setReduzir] = useState(() => (
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  ));

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const consulta = window.matchMedia("(prefers-reduced-motion: reduce)");
    const atualizar = () => setReduzir(consulta.matches);
    atualizar();
    consulta.addEventListener?.("change", atualizar);
    return () => consulta.removeEventListener?.("change", atualizar);
  }, []);

  return reduzir;
}

function AnimatedNumber({ value, animate }) {
  const numero = Number(value) || 0;
  const reduzirMovimento = useReducedMotion();
  const [exibido, setExibido] = useState(animate && !reduzirMovimento ? 0 : numero);

  useEffect(() => {
    if (!animate || reduzirMovimento) {
      setExibido(numero);
      return undefined;
    }

    let quadro = 0;
    const inicio = performance.now();
    const duracao = 620;
    const atualizar = instante => {
      const progresso = Math.min((instante - inicio) / duracao, 1);
      const saida = 1 - Math.pow(1 - progresso, 3);
      setExibido(Math.round(numero * saida));
      if (progresso < 1) quadro = window.requestAnimationFrame(atualizar);
    };
    quadro = window.requestAnimationFrame(atualizar);
    return () => window.cancelAnimationFrame(quadro);
  }, [animate, numero, reduzirMovimento]);

  return exibido.toLocaleString("pt-BR");
}

function rotuloPerfil(perfil) {
  const rotulos = {
    administrador: "Administração",
    operador: "Operação",
    gerente: "Gerência",
    consulta: "Consulta",
  };
  return rotulos[perfil] || perfil || "Consulta";
}

function resumoHistorico(texto) {
  return String(texto || "")
    .split("|")
    .map(parte => parte.trim())
    .filter(Boolean)
    .join(" · ") || "Sem detalhe registrado.";
}

function dataHoraHistorico(valor) {
  const texto = String(valor || "").trim();
  const civil = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  if (civil) return `${civil[3]}-${civil[2]}-${civil[1]}${civil[4] ? `T${civil[4]}:${civil[5]}` : ""}`;
  return /^\d{4}-\d{2}-\d{2}/.test(texto) ? texto : undefined;
}

function tomHistorico(tipo) {
  if (["exclusao", "defeito", "baixa"].includes(tipo)) return "risk";
  if (["entrada", "retorno", "disponivel", "recebimento_gerente"].includes(tipo)) return "success";
  if (["conserto", "saida", "ponto", "envio_gerente"].includes(tipo)) return "attention";
  return "neutral";
}

function iconeCategoria(categoria) {
  const nome = String(categoria || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");

  if (nome.includes("televis")) return "tv";
  if (nome.includes("impressor")) return "printer";
  if (nome.includes("tablet")) return "tablet";
  if (nome.includes("carregador")) return "plug";
  if (nome.includes("brinde")) return "gift";
  if (nome.includes("totem")) return "tower";
  if (nome.includes("noteiro")) return "banknote";
  if (nome.includes("terminal")) return "terminal";
  if (nome.includes("pdv")) return "receipt";
  return "package";
}

function PositionMetric({ animate, detail, icon, label, onClick, tone = "", value }) {
  return (
    <button
      aria-label={`${label}: ${value}. ${detail}`}
      className={`dash-cf-position-cell${tone ? ` is-${tone}` : ""}`}
      onClick={onClick}
      type="button"
    >
      <span className="dash-cf-position-icon"><OperationIcon name={icon} size={18}/></span>
      <span className="dash-cf-position-copy">
        <small>{label}</small>
        <strong><AnimatedNumber animate={animate} value={value}/></strong>
        <span>{detail}</span>
      </span>
      <OperationIcon className="dash-cf-position-arrow" name="chevronRight" size={15}/>
    </button>
  );
}

export default function DashboardPage({
  gerenteAtual = "",
  gerenteNomeBase = "",
  historicoConfig = {},
  historicoOperacional = [],
  menuAberto = false,
  onAbrirEquipamentos,
  onAbrirHistorico,
  onAbrirMenu,
  onAbrirPontos,
  onEntradaConcluida,
  onSelecionarCategoria,
  onSelecionarConserto,
  onSelecionarDisponiveis,
  onSelecionarGerentes,
  onSelecionarPontos,
  onSelecionarTotal,
  perfilAtual = {},
  pontosComEquipamentos = [],
  porCategoria = [],
  solicitacoesConsertoPendentes = [],
  totalComGerentes = 0,
  totalConserto = 0,
  totalDisponivel = 0,
  totalEmRota = 0,
  totalGeral = 0,
  animarEntrada = false,
}) {
  const gerente = Boolean(gerenteAtual);
  const operador = perfilAtual.perfil === "operador";
  const movimentos = historicoOperacional.slice(0, 5);
  const nomePerfil = String(perfilAtual.nome || gerenteNomeBase || perfilAtual.perfil || "U").trim();

  const prioridade = useMemo(() => {
    if (!gerente && solicitacoesConsertoPendentes.length > 0) {
      const quantidade = solicitacoesConsertoPendentes.length;
      return {
        tone: "risk",
        eyebrow: operador ? "Ação requerida" : "Atenção requerida",
        title: operador ? "Validar solicitações de conserto" : "Acompanhar solicitações de conserto",
        text: `${quantidade} ${quantidade === 1 ? "solicitação aguarda" : "solicitações aguardam"} validação do perfil operador.`,
        value: quantidade,
        measure: quantidade === 1 ? "solicitação" : "solicitações",
        action: operador ? "Revisar fila" : "Ver posição",
        onClick: onSelecionarConserto,
      };
    }
    if (!gerente && totalConserto > 0) {
      return {
        tone: "attention",
        eyebrow: "Acompanhamento",
        title: "Monitorar ativos em conserto",
        text: `${totalConserto} ${totalConserto === 1 ? "equipamento exige" : "equipamentos exigem"} acompanhamento operacional.`,
        value: totalConserto,
        measure: totalConserto === 1 ? "ativo" : "ativos",
        action: "Abrir posição",
        onClick: onSelecionarConserto,
      };
    }
    if (gerente && totalGeral > 0 && totalDisponivel === 0) {
      return {
        tone: "attention",
        eyebrow: "Disponibilidade",
        title: "Revisar disponibilidade da carteira",
        text: "Não há equipamento disponível no recorte atual.",
        value: 0,
        measure: "disponíveis",
        action: "Ver equipamentos",
        onClick: onSelecionarDisponiveis,
      };
    }
    if (gerente && totalEmRota > 0) {
      return {
        tone: "neutral",
        eyebrow: "Operação em curso",
        title: "Acompanhar equipamentos em rota",
        text: `${totalEmRota} ${totalEmRota === 1 ? "equipamento está" : "equipamentos estão"} em circulação na sua carteira.`,
        value: totalEmRota,
        measure: "em rota",
        action: "Abrir recorte",
        onClick: onSelecionarPontos,
      };
    }
    return {
      tone: "success",
      eyebrow: "Posição estável",
      title: totalGeral ? "Nenhuma fila crítica agora" : "Base sem equipamentos neste recorte",
      text: totalGeral ? "A leitura atual não apresenta solicitação urgente de conserto." : "Cadastros futuros aparecerão automaticamente nesta central.",
      value: 0,
      measure: "filas críticas",
      action: "Abrir equipamentos",
      onClick: onAbrirEquipamentos,
    };
  }, [gerente, onAbrirEquipamentos, onSelecionarConserto, onSelecionarDisponiveis, onSelecionarPontos, operador, solicitacoesConsertoPendentes.length, totalConserto, totalDisponivel, totalEmRota, totalGeral]);

  useEffect(() => {
    if (!animarEntrada || !onEntradaConcluida) return undefined;
    const espera = window.setTimeout(() => onEntradaConcluida(true), 900);
    return () => window.clearTimeout(espera);
  }, [animarEntrada, onEntradaConcluida]);

  const iconePrioridade = prioridade.tone === "success" ? "check" : prioridade.tone === "neutral" ? "refresh" : "warning";

  return (
    <div className={`stock-dashboard${animarEntrada ? " dash-cf-entering" : ""}`}>
      <header className="dash-cf-commandbar">
        <div className="dash-cf-title-group">
          {onAbrirMenu ? (
            <button
              aria-controls="stock-on-primary-navigation"
              aria-expanded={menuAberto}
              aria-label="Abrir navegação principal da NEPTERA"
              className="dash-cf-menu"
              onClick={onAbrirMenu}
              type="button"
            >
              <OperationIcon name="menu" size={20}/>
            </button>
          ) : null}
          <div>
            <span className="dash-cf-eyebrow">NEPTERA / central de posição</span>
            <h1>Dashboard</h1>
          </div>
        </div>

        <nav aria-label="Atalhos do Dashboard" className="dash-cf-shortcuts">
          <button aria-label="Abrir equipamentos" onClick={onAbrirEquipamentos} title="Equipamentos" type="button"><OperationIcon name="package"/><span>Equipamentos</span></button>
          <button aria-label="Abrir pontos" onClick={onAbrirPontos} title="Pontos" type="button"><OperationIcon name="mapPin"/><span>Pontos</span></button>
          <button aria-label="Abrir histórico" onClick={onAbrirHistorico} title="Histórico" type="button"><OperationIcon name="history"/><span>Histórico</span></button>
        </nav>

        <div className="dash-cf-profile" aria-label={`Perfil atual: ${rotuloPerfil(perfilAtual.perfil)}`}>
          <span>{nomePerfil.charAt(0).toUpperCase()}</span>
          <div><small>Acesso atual</small><strong>{rotuloPerfil(perfilAtual.perfil)}</strong></div>
        </div>
      </header>

      <div className="dash-cf-canvas">
        <section aria-labelledby="dash-cf-position-title" className="dash-cf-position-strip">
          <header className="dash-cf-section-heading dash-cf-position-heading">
            <div>
              <span className="dash-cf-eyebrow">Leitura imediata</span>
              <h2 id="dash-cf-position-title">Posição agora</h2>
            </div>
            <span className="dash-cf-position-scope">{gerente ? `Carteira · ${gerenteNomeBase || gerenteAtual}` : "Base operacional completa"}</span>
          </header>

          <div className={`dash-cf-position-manifest${gerente ? " is-manager" : ""}`}>
            <button
              aria-label={`Abrir todos os equipamentos: ${totalGeral} cadastrados`}
              className="dash-cf-position-total"
              onClick={onSelecionarTotal}
              type="button"
            >
              <span className="dash-cf-position-icon"><OperationIcon name="receipt" size={19}/></span>
              <span className="dash-cf-position-copy">
                <small>Base total</small>
                <strong><AnimatedNumber animate={animarEntrada} value={totalGeral}/></strong>
                <span>equipamentos no recorte</span>
              </span>
              <OperationIcon className="dash-cf-position-arrow" name="chevronRight" size={15}/>
            </button>

            <PositionMetric animate={animarEntrada} detail={gerente ? "prontos para envio" : "no estoque interno"} icon="check" label={gerente ? "Disponíveis" : "Estoque interno"} onClick={onSelecionarDisponiveis} tone="available" value={totalDisponivel}/>
            <PositionMetric animate={animarEntrada} detail="em operação nas rotas" icon="refresh" label="Em pontos" onClick={onSelecionarPontos} value={totalEmRota}/>
            {!gerente ? <PositionMetric animate={animarEntrada} detail="sob responsabilidade externa" icon="user" label="Com gerentes" onClick={onSelecionarGerentes} value={totalComGerentes}/> : null}
            {!gerente ? <PositionMetric animate={animarEntrada} detail={`${solicitacoesConsertoPendentes.length} aguardando validação`} icon="warning" label="Em conserto" onClick={onSelecionarConserto} tone={totalConserto ? "attention" : ""} value={totalConserto}/> : null}
          </div>
        </section>

        <div className="dash-cf-workbench">
          <section aria-labelledby="dash-cf-attention-title" className={`dash-cf-attention is-${prioridade.tone}`}>
            <span className="dash-cf-attention-icon"><OperationIcon name={iconePrioridade} size={18}/></span>
            <div className="dash-cf-attention-body">
              <span>Decisão do turno · {prioridade.eyebrow}</span>
              <h2 id="dash-cf-attention-title">{prioridade.title}</h2>
              <p>{prioridade.text}</p>
            </div>
            <div className="dash-cf-attention-count" aria-label={`${prioridade.value} ${prioridade.measure}`}>
              <strong><AnimatedNumber animate={animarEntrada} value={prioridade.value}/></strong>
              <span>{prioridade.measure}</span>
            </div>
            <button onClick={prioridade.onClick} type="button"><span>{prioridade.action}</span><OperationIcon name="chevronRight" size={15}/></button>
            <dl className="dash-cf-attention-facts">
              {gerente ? (
                <>
                  <div><dt>Disponíveis</dt><dd>{totalDisponivel}</dd></div>
                  <div><dt>Em rota</dt><dd>{totalEmRota}</dd></div>
                </>
              ) : (
                <>
                  <div><dt>Solicitações</dt><dd>{solicitacoesConsertoPendentes.length}</dd></div>
                  <div><dt>Em conserto</dt><dd>{totalConserto}</dd></div>
                </>
              )}
            </dl>
          </section>

          <div className="dash-cf-ledger-zone">
            <section aria-labelledby="dash-cf-category-title" className="dash-cf-ledger dash-cf-category-ledger">
              <header className="dash-cf-section-heading dash-cf-section-heading-compact">
                <div>
                  <span className="dash-cf-eyebrow">Disponibilidade</span>
                  <h2 id="dash-cf-category-title">{gerente ? "Categorias da carteira" : "Estoque interno por categoria"}</h2>
                </div>
                <span className="dash-cf-count">{porCategoria.length} categorias</span>
              </header>
              <div className="dash-cf-category-list">
                {porCategoria.length ? porCategoria.map(item => {
                  const total = Number(item.total) || 0;
                  const disponivel = Number(item.disponivel) || 0;
                  const percentual = total ? Math.min(100, Math.round((disponivel / total) * 100)) : 0;
                  return (
                    <button
                      aria-label={`${item.categoria}: ${disponivel} disponíveis de ${total}. Abrir categoria.`}
                      className="dash-cf-category-row"
                      key={item.categoria}
                      onClick={() => onSelecionarCategoria?.(item.categoria)}
                      type="button"
                    >
                      <span className="dash-cf-category-name"><i aria-hidden="true"><OperationIcon name={iconeCategoria(item.categoria)} size={15}/></i><strong>{item.categoria}</strong></span>
                      <span className="dash-cf-category-values"><strong>{disponivel}</strong><span>/ {total}</span><OperationIcon name="chevronRight" size={14}/></span>
                      <span className="dash-cf-category-meter" aria-hidden="true"><i style={{ width: `${percentual}%` }}/></span>
                    </button>
                  );
                }) : (
                  <div className="dash-cf-empty dash-cf-empty-compact"><OperationIcon name="file" size={21}/><p>Nenhuma categoria disponível neste recorte.</p></div>
                )}
              </div>
            </section>

            <section aria-labelledby="dash-cf-points-title" className="dash-cf-ledger dash-cf-points-ledger">
              <header className="dash-cf-section-heading dash-cf-section-heading-compact">
                <div>
                  <span className="dash-cf-eyebrow">Rede ativa</span>
                  <h2 id="dash-cf-points-title">Pontos em operação</h2>
                </div>
                <button onClick={onAbrirPontos} type="button">Abrir rede <OperationIcon name="chevronRight" size={14}/></button>
              </header>
              {pontosComEquipamentos.length === 0 ? (
                <div className="dash-cf-empty dash-cf-empty-compact"><OperationIcon name="info" size={21}/><p>Nenhum equipamento está ligado a um ponto.</p></div>
              ) : (
                <ol className="dash-cf-point-list">
                  {pontosComEquipamentos.slice(0, 5).map((ponto, indice) => (
                    <li key={ponto.id || `${ponto.nomeFantasia}-${indice}`}>
                      <span>{String(indice + 1).padStart(2, "0")}</span>
                      <div><strong>{ponto.nomeFantasia}</strong><small>{ponto.totalEquipamentos === 1 ? "1 equipamento" : `${ponto.totalEquipamentos} equipamentos`}</small></div>
                      <b>{ponto.totalEquipamentos}</b>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        </div>

        <section aria-labelledby="dash-cf-changes-title" className="dash-cf-ledger dash-cf-changes">
          <header className="dash-cf-section-heading dash-cf-section-heading-compact">
            <div>
              <span className="dash-cf-eyebrow">Rastro operacional</span>
              <h2 id="dash-cf-changes-title">Mudanças recentes</h2>
            </div>
            <button onClick={onAbrirHistorico} type="button">Abrir histórico <OperationIcon name="chevronRight" size={14}/></button>
          </header>

          {movimentos.length === 0 ? (
            <div className="dash-cf-empty"><OperationIcon name="clock" size={22}/><div><strong>Nenhuma movimentação registrada</strong><p>As próximas alterações de equipamentos aparecerão neste rastro.</p></div></div>
          ) : (
            <>
              <div className="dash-cf-changes-table">
                <table>
                  <caption className="dash-cf-sr-only">Cinco mudanças operacionais mais recentes</caption>
                  <thead><tr><th>Movimento</th><th>Equipamento</th><th>Detalhe</th><th>Data</th></tr></thead>
                  <tbody>
                    {movimentos.map((item, indice) => {
                      const config = historicoConfig[item.tipo] || { label: item.tipo || "Movimento" };
                      return (
                        <tr key={item.id || `${item.itemNome}-${indice}`}>
                          <td><span className={`dash-cf-event is-${tomHistorico(item.tipo)}`}>{config.label}</span></td>
                          <td><span className="dash-cf-equipment"><OperationIcon name={iconeCategoria(item.categoria)} size={15}/><span><strong>{item.itemNome}</strong><small>{item.categoria || "Sem categoria"}</small></span></span></td>
                          <td title={resumoHistorico(item.observacao)}>{resumoHistorico(item.observacao)}</td>
                          <td><time dateTime={dataHoraHistorico(item.data)}>{item.data}</time></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="dash-cf-change-records">
                {movimentos.map((item, indice) => {
                  const config = historicoConfig[item.tipo] || { label: item.tipo || "Movimento" };
                  return (
                    <article key={`mobile-${item.id || `${item.itemNome}-${indice}`}`}>
                      <div><span className={`dash-cf-event is-${tomHistorico(item.tipo)}`}>{config.label}</span><time dateTime={dataHoraHistorico(item.data)}>{item.data}</time></div>
                      <strong><OperationIcon name={iconeCategoria(item.categoria)} size={15}/>{item.itemNome}</strong>
                      <div className="dash-cf-history-meta">
                        <span>{item.categoria || "Sem categoria"}</span>
                        {item.qtdAntes !== undefined ? <span>Antes: {item.qtdAntes}</span> : null}
                        {item.qtdDepois !== undefined ? <span>Depois: {item.qtdDepois}</span> : null}
                      </div>
                      <p>{resumoHistorico(item.observacao)}</p>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
