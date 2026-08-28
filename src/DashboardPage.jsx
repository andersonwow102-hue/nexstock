import { useEffect, useMemo, useState } from "react";
import "./DashboardPage.css";

const DASHBOARD_ICON_PATHS = {
  menu: <><path d="M4 7h16M4 12h16M4 17h16"/></>,
  package: <><path d="m20 8-8-4-8 4 8 4 8-4Z"/><path d="M4 8v8l8 4 8-4V8M12 12v8"/></>,
  map: <><path d="M12 21s6-4.7 6-10a6 6 0 1 0-12 0c0 5.3 6 10 6 10Z"/><circle cx="12" cy="11" r="2"/></>,
  history: <><path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.7"/><path d="M4 4v4.7h4.7M12 8v4l2.8 1.8"/></>,
  arrow: <><path d="M5 12h14M14 7l5 5-5 5"/></>,
  stock: <><path d="M5 19V9M12 19V5M19 19v-7"/><path d="M3 19h18"/></>,
  route: <><circle cx="5" cy="17" r="2"/><circle cx="19" cy="7" r="2"/><path d="M7 17h3a3 3 0 0 0 3-3v-4a3 3 0 0 1 3-3h1"/></>,
  manager: <><circle cx="12" cy="8" r="3"/><path d="M6 20a6 6 0 0 1 12 0"/><path d="M18 4v4M16 6h4"/></>,
  repair: <><path d="M14.5 6.5a4 4 0 0 0 4.8 4.8L11 19.6a2.1 2.1 0 0 1-3-3l8.3-8.3a4 4 0 0 1-1.8-1.8Z"/><path d="m6.5 18.5-2 2"/></>,
  check: <><circle cx="12" cy="12" r="9"/><path d="m8 12 2.6 2.6L16.5 9"/></>,
};

function DashboardIcon({ name, size = 18 }) {
  return (
    <svg aria-hidden="true" className="dash-cf-icon" fill="none" height={size} viewBox="0 0 24 24" width={size}>
      {DASHBOARD_ICON_PATHS[name] || DASHBOARD_ICON_PATHS.stock}
    </svg>
  );
}

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

function PositionNode({ activeTone = "", detail, icon, label, onClick, value, animate }) {
  return (
    <button
      aria-label={`${label}: ${value}. ${detail}`}
      className={`dash-cf-position-node${activeTone ? ` is-${activeTone}` : ""}`}
      onClick={onClick}
      type="button"
    >
      <span className="dash-cf-node-marker"><DashboardIcon name={icon}/></span>
      <span className="dash-cf-node-copy">
        <small>{label}</small>
        <strong><AnimatedNumber animate={animate} value={value}/></strong>
        <span>{detail}</span>
      </span>
      <DashboardIcon name="arrow" size={15}/>
    </button>
  );
}

export default function DashboardPage({
  gerenteAtual = "",
  gerenteNomeBase = "",
  historicoConfig = {},
  historicoOperacional = [],
  iconesCategorias = {},
  mensagemDoDia = "",
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
  const maiorCategoria = Math.max(1, ...porCategoria.map(item => Number(item.total) || 0));

  const prioridade = useMemo(() => {
    if (!gerente && solicitacoesConsertoPendentes.length > 0) {
      return {
        tone: "risk",
        eyebrow: operador ? "Ação requerida" : "Atenção operacional",
        title: operador ? "Validar solicitações de conserto" : "Acompanhar solicitações de conserto",
        text: `${solicitacoesConsertoPendentes.length} ${solicitacoesConsertoPendentes.length === 1 ? "solicitação aguarda" : "solicitações aguardam"} validação do perfil operador.`,
        value: solicitacoesConsertoPendentes.length,
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
        action: "Abrir posição",
        onClick: onSelecionarConserto,
      };
    }
    if (gerente && totalGeral > 0 && totalDisponivel === 0) {
      return {
        tone: "attention",
        eyebrow: "Próxima leitura",
        title: "Revisar disponibilidade da carteira",
        text: "Não há equipamento disponível no recorte atual.",
        value: 0,
        action: "Ver equipamentos",
        onClick: onSelecionarDisponiveis,
      };
    }
    if (gerente && totalEmRota > 0) {
      return {
        tone: "neutral",
        eyebrow: "Próxima leitura",
        title: "Acompanhar operação em rota",
        text: `${totalEmRota} ${totalEmRota === 1 ? "equipamento está" : "equipamentos estão"} em circulação na sua carteira.`,
        value: totalEmRota,
        action: "Abrir recorte",
        onClick: onSelecionarPontos,
      };
    }
    return {
      tone: "success",
      eyebrow: "Posição estável",
      title: totalGeral ? "Nenhuma fila crítica agora" : "Base sem equipamentos neste recorte",
      text: totalGeral ? "A leitura atual não apresenta solicitação urgente de conserto." : "Cadastros futuros aparecerão automaticamente nesta central.",
      value: totalGeral,
      action: "Abrir equipamentos",
      onClick: onAbrirEquipamentos,
    };
  }, [gerente, onAbrirEquipamentos, onSelecionarConserto, onSelecionarDisponiveis, onSelecionarPontos, operador, solicitacoesConsertoPendentes.length, totalConserto, totalDisponivel, totalEmRota, totalGeral]);

  useEffect(() => {
    if (!animarEntrada || !onEntradaConcluida) return undefined;
    const espera = window.setTimeout(() => onEntradaConcluida(true), 900);
    return () => window.clearTimeout(espera);
  }, [animarEntrada, onEntradaConcluida]);

  return (
    <div className={`stock-dashboard${animarEntrada ? " dash-cf-entering" : ""}`}>
      <header className="dash-cf-commandbar">
        <div className="dash-cf-title-group">
          {onAbrirMenu ? (
            <button
              aria-controls="stock-on-primary-navigation"
              aria-expanded={menuAberto}
              aria-label="Abrir navegação principal do Stock-On"
              className="dash-cf-menu"
              onClick={onAbrirMenu}
              type="button"
            >
              <DashboardIcon name="menu" size={20}/>
            </button>
          ) : null}
          <div>
            <span className="dash-cf-eyebrow">Stock-On / controle operacional</span>
            <h1>Central de posição</h1>
            <p>{gerente ? `Carteira de ${gerenteNomeBase || gerenteAtual}` : "Leitura unificada do estoque e das movimentações"}</p>
          </div>
        </div>

        <nav aria-label="Atalhos do Dashboard" className="dash-cf-shortcuts">
          <button aria-label="Abrir equipamentos" onClick={onAbrirEquipamentos} title="Equipamentos" type="button"><DashboardIcon name="package"/><span>Equipamentos</span></button>
          <button aria-label="Abrir pontos" onClick={onAbrirPontos} title="Pontos" type="button"><DashboardIcon name="map"/><span>Pontos</span></button>
          <button aria-label="Abrir histórico" onClick={onAbrirHistorico} title="Histórico" type="button"><DashboardIcon name="history"/><span>Histórico</span></button>
        </nav>

        <div className="dash-cf-profile" aria-label={`Perfil atual: ${rotuloPerfil(perfilAtual.perfil)}`}>
          <span>{String(perfilAtual.nome || gerenteNomeBase || perfilAtual.perfil || "U").trim().charAt(0).toUpperCase()}</span>
          <div><small>Acesso atual</small><strong>{rotuloPerfil(perfilAtual.perfil)}</strong></div>
        </div>
      </header>

      <div className="dash-cf-canvas">
        <section aria-label="Contexto do turno" className="dash-cf-briefing">
          <span className="dash-cf-briefing-label">Diretriz do dia</span>
          <q>{mensagemDoDia}</q>
          <span className="dash-cf-briefing-context">{gerente ? "Recorte da carteira" : "Base operacional completa"}</span>
        </section>

        <section aria-labelledby="dash-cf-position-title" className="dash-cf-position-board">
          <div className="dash-cf-section-heading">
            <div>
              <span className="dash-cf-eyebrow">Mapa de posição</span>
              <h2 id="dash-cf-position-title">Onde o estoque está agora</h2>
            </div>
            <p>Selecione uma posição para abrir o recorte correspondente.</p>
          </div>

          <div className="dash-cf-position-layout">
            <button
              aria-label={`Abrir todos os equipamentos: ${totalGeral} cadastrados`}
              className="dash-cf-total"
              onClick={onSelecionarTotal}
              type="button"
            >
              <span className="dash-cf-total-icon"><DashboardIcon name="stock" size={21}/></span>
              <small>Base cadastrada</small>
              <strong><AnimatedNumber animate={animarEntrada} value={totalGeral}/></strong>
              <span>equipamentos no recorte</span>
              <i><span>Abrir base</span><DashboardIcon name="arrow" size={15}/></i>
            </button>

            <div className="dash-cf-position-track">
              <PositionNode activeTone="available" animate={animarEntrada} detail={gerente ? "prontos para envio" : "no estoque interno"} icon="package" label={gerente ? "Disponíveis" : "Estoque interno"} onClick={onSelecionarDisponiveis} value={totalDisponivel}/>
              <PositionNode animate={animarEntrada} detail="em operação nas rotas" icon="route" label="Em pontos" onClick={onSelecionarPontos} value={totalEmRota}/>
              {!gerente ? <PositionNode animate={animarEntrada} detail="estoque ou transferência" icon="manager" label="Com gerentes" onClick={onSelecionarGerentes} value={totalComGerentes}/> : null}
              {!gerente ? <PositionNode activeTone={totalConserto ? "attention" : ""} animate={animarEntrada} detail={`${solicitacoesConsertoPendentes.length} aguardando operador`} icon="repair" label="Conserto" onClick={onSelecionarConserto} value={totalConserto}/> : null}
            </div>
          </div>
        </section>

        <div className="dash-cf-workspace">
          <section aria-labelledby="dash-cf-category-title" className="dash-cf-ledger dash-cf-category-panel">
            <div className="dash-cf-section-heading dash-cf-section-heading-compact">
              <div>
                <span className="dash-cf-eyebrow">Saúde por categoria</span>
                <h2 id="dash-cf-category-title">{gerente ? "Disponibilidade da carteira" : "Composição do estoque interno"}</h2>
              </div>
              <span className="dash-cf-count">{porCategoria.length} categorias</span>
            </div>
            <div className="dash-cf-category-header" aria-hidden="true">
              <span>Categoria</span><span>Posição</span><span>Disponível / total</span>
            </div>
            <div className="dash-cf-category-list">
              {porCategoria.map(item => {
                const percentual = item.total ? Math.round((item.disponivel / item.total) * 100) : 0;
                const largura = gerente ? percentual : Math.round((item.total / maiorCategoria) * 100);
                return (
                  <button
                    aria-label={`${item.categoria}: ${item.disponivel} disponíveis de ${item.total}. Abrir categoria.`}
                    className="dash-cf-category-row"
                    key={item.categoria}
                    onClick={() => onSelecionarCategoria?.(item.categoria)}
                    type="button"
                  >
                    <span className="dash-cf-category-name"><i aria-hidden="true">{iconesCategorias[item.categoria] || "•"}</i><strong>{item.categoria}</strong></span>
                    <span className="dash-cf-category-rail"><i style={{ width: `${largura}%` }}/></span>
                    <span className="dash-cf-category-values"><strong>{item.disponivel}</strong><span>/ {item.total}</span><DashboardIcon name="arrow" size={14}/></span>
                  </button>
                );
              })}
            </div>
          </section>

          <aside className="dash-cf-side" aria-label="Prioridade e pontos em operação">
            <section className={`dash-cf-priority is-${prioridade.tone}`}>
              <div className="dash-cf-priority-top">
                <span><DashboardIcon name={prioridade.tone === "success" ? "check" : prioridade.tone === "risk" ? "repair" : "route"}/></span>
                <strong>{prioridade.eyebrow}</strong>
                <b><AnimatedNumber animate={animarEntrada} value={prioridade.value}/></b>
              </div>
              <h2>{prioridade.title}</h2>
              <p>{prioridade.text}</p>
              <button onClick={prioridade.onClick} type="button"><span>{prioridade.action}</span><DashboardIcon name="arrow" size={15}/></button>
            </section>

            <section aria-labelledby="dash-cf-points-title" className="dash-cf-points">
              <div className="dash-cf-section-heading dash-cf-section-heading-compact">
                <div>
                  <span className="dash-cf-eyebrow">Rede em operação</span>
                  <h2 id="dash-cf-points-title">Pontos com equipamentos</h2>
                </div>
                <button onClick={onAbrirPontos} type="button">Ver todos <DashboardIcon name="arrow" size={14}/></button>
              </div>
              {pontosComEquipamentos.length === 0 ? (
                <div className="dash-cf-empty dash-cf-empty-compact">
                  <DashboardIcon name="map" size={21}/>
                  <p>Nenhum equipamento está ligado a um ponto.</p>
                </div>
              ) : (
                <ol className="dash-cf-point-list">
                  {pontosComEquipamentos.slice(0, 5).map((ponto, indice) => (
                    <li key={ponto.id}>
                      <span>{String(indice + 1).padStart(2, "0")}</span>
                      <div><strong>{ponto.nomeFantasia}</strong><small>{ponto.totalEquipamentos === 1 ? "1 equipamento" : `${ponto.totalEquipamentos} equipamentos`}</small></div>
                      <b>{ponto.totalEquipamentos}</b>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </aside>
        </div>

        <section aria-labelledby="dash-cf-history-title" className="dash-cf-ledger dash-cf-history">
          <div className="dash-cf-section-heading dash-cf-section-heading-compact">
            <div>
              <span className="dash-cf-eyebrow">Rastro operacional</span>
              <h2 id="dash-cf-history-title">Movimentações recentes</h2>
            </div>
            <button onClick={onAbrirHistorico} type="button">Abrir histórico <DashboardIcon name="arrow" size={14}/></button>
          </div>

          {movimentos.length === 0 ? (
            <div className="dash-cf-empty">
              <DashboardIcon name="history" size={23}/>
              <div><strong>Nenhuma movimentação registrada</strong><p>As próximas alterações de equipamentos aparecerão neste rastro.</p></div>
            </div>
          ) : (
            <>
              <div className="dash-cf-history-table">
                <table>
                  <caption className="dash-cf-sr-only">Cinco movimentações operacionais mais recentes</caption>
                  <thead><tr><th>Movimento</th><th>Equipamento</th><th>Detalhe</th><th>Data</th></tr></thead>
                  <tbody>
                    {movimentos.map((item, indice) => {
                      const config = historicoConfig[item.tipo] || { label: item.tipo || "Movimento" };
                      return (
                        <tr key={item.id || `${item.itemNome}-${indice}`}>
                          <td><span className={`dash-cf-event is-${tomHistorico(item.tipo)}`}>{config.label}</span></td>
                          <td><strong>{iconesCategorias[item.categoria] || "•"} {item.itemNome}</strong><small>{item.categoria}</small></td>
                          <td title={resumoHistorico(item.observacao)}>{resumoHistorico(item.observacao)}</td>
                          <td><time dateTime={dataHoraHistorico(item.data)}>{item.data}</time></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="dash-cf-history-cards">
                {movimentos.map((item, indice) => {
                  const config = historicoConfig[item.tipo] || { label: item.tipo || "Movimento" };
                  return (
                    <article key={`mobile-${item.id || `${item.itemNome}-${indice}`}`}>
                      <div><span className={`dash-cf-event is-${tomHistorico(item.tipo)}`}>{config.label}</span><time dateTime={dataHoraHistorico(item.data)}>{item.data}</time></div>
                      <strong>{iconesCategorias[item.categoria] || "•"} {item.itemNome}</strong>
                      <div className="dash-cf-history-meta">
                        <span>{item.categoria}</span>
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
