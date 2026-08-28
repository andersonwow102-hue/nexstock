import { useMemo, useState } from "react";
import { OperationIcon } from "./components/operations/OperationsUI.jsx";
import FechamentoWorkbench from "./FechamentoWorkbench.jsx";
import {
  calcularFechamentoPreview,
  criarFechamentoPreview,
  FECHAMENTO_PREVIEW_SCENARIOS,
  formatarMoedaPreview,
  numeroFechamentoPreview,
} from "./fechamentoPreviewData.js";
import "./styles/foundations.css";
import "./FechamentoWorkbench.css";

const ETAPAS = ["Período", "Rota", "Lançamentos", "Conferência", "Envio"];

function Icon({ name, size = 17 }) {
  return <OperationIcon name={name} size={size} />;
}

function textoMoeda(valor) {
  return formatarMoedaPreview(numeroFechamentoPreview(valor));
}

function periodoLabel(competencia, dia) {
  if (dia) return new Date(`${dia}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  const [ano, mes] = String(competencia || "").split("-");
  if (!ano || !mes) return "Sem período";
  return new Date(Number(ano), Number(mes) - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function mesAnterior() {
  const data = new Date();
  data.setDate(1);
  data.setMonth(data.getMonth() - 1);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
}

function FechamentoPreviewScenario({ fixture, prazosAbertos, onFecharPrazos }) {
  const [competencia, setCompetencia] = useState(fixture.competencia);
  const [dia, setDia] = useState(fixture.dia);
  const [gerente, setGerente] = useState(fixture.gerente);
  const [rota, setRota] = useState(fixture.rota);
  const [valores, setValores] = useState(fixture.valores);
  const [playBet, setPlayBet] = useState(fixture.ajustes.playBet ? String(fixture.ajustes.playBet).replace(".", ",") : "");
  const [ajudaCusto, setAjudaCusto] = useState(fixture.ajustes.ajudaCusto ? String(fixture.ajustes.ajudaCusto).replace(".", ",") : "");
  const [comissaoExtra, setComissaoExtra] = useState(fixture.ajustes.comissaoExtra ? String(fixture.ajustes.comissaoExtra).replace(".", ",") : "");
  const [status, setStatus] = useState(fixture.status);
  const [etapa, setEtapa] = useState(fixture.etapa);
  const [etapaConcluida, setEtapaConcluida] = useState(fixture.etapaConcluida);
  const [feedback, setFeedback] = useState({ erro: "", sucesso: "" });
  const [prazoMensagem, setPrazoMensagem] = useState("");

  const despesasSistema = fixture.despesas.reduce((soma, item) => soma + Number(item.valorReal || item.valorPrevisto || 0), 0);
  const calculo = useMemo(() => calcularFechamentoPreview({
    valores,
    despesasSistema,
    playBet: numeroFechamentoPreview(playBet),
    ajudaCusto: numeroFechamentoPreview(ajudaCusto),
    comissaoExtra: numeroFechamentoPreview(comissaoExtra),
  }), [ajudaCusto, comissaoExtra, despesasSistema, playBet, valores]);

  const rotas = useMemo(() => fixture.rotas.map((item) => item.gerente === gerente && item.rota === rota ? { ...item, status, totalDespesas: despesasSistema } : item), [despesasSistema, fixture.rotas, gerente, rota, status]);
  const rotaSelecionada = rotas.find((item) => item.gerente === gerente && item.rota === rota) || rotas[0];
  const rotasDoGerente = rotas.filter((item) => item.gerente === gerente).map((item) => item.rota);

  function alterarModalidade(modalidadeId, campo, valor) {
    setValores((atual) => ({ ...atual, [modalidadeId]: { ...(atual[modalidadeId] || {}), [campo]: valor } }));
    setFeedback({ erro: "", sucesso: "" });
  }

  function selecionarRota(item) {
    setGerente(item.gerente);
    setRota(item.rota);
    setStatus(item.status);
    setEtapa(item.status?.classe === "finalizado" || item.status?.classe === "enviado" || item.status?.classe === "confirmado" ? 5 : item.status?.classe === "rascunho" ? 4 : 3);
    setEtapaConcluida(item.status?.classe === "finalizado");
    setFeedback({ erro: "", sucesso: "" });
  }

  function salvarLocal() {
    const novoStatus = { classe: "rascunho", titulo: "Rascunho salvo", descricao: "Simulação em memória", texto: "Rascunho salvo somente nesta prévia local." };
    setStatus(novoStatus);
    setEtapa(4);
    setFeedback({ erro: "", sucesso: "Prévia local: rascunho atualizado apenas em memória." });
  }

  function enviarLocal() {
    const novoStatus = { classe: "enviado", titulo: "Enviado", descricao: "Aguardando gerente simulado", texto: "Publicação simulada concluída; nenhum dado saiu do navegador." };
    setStatus(novoStatus);
    setEtapa(5);
    setFeedback({ erro: "", sucesso: "Prévia local: envio simulado sem rede, banco ou notificação." });
  }

  function finalizarLocal() {
    const novoStatus = { classe: "finalizado", titulo: "Finalizado", descricao: "Prestação simulada concluída", texto: "Conclusão registrada somente na memória desta prévia." };
    setStatus(novoStatus);
    setEtapa(5);
    setEtapaConcluida(true);
    setFeedback({ erro: "", sucesso: "Prévia local: prestação marcada como finalizada em memória." });
  }

  const prazoConteudo = (
    <div className="prorrogacao-despesas-conteudo">
      <div className="prorrogacao-despesas-head"><div><p>Teste o encaixe do controle sem criar ou alterar prorrogações reais.</p></div></div>
      <div className="prorrogacao-despesas-form">
        <div className="campo"><label>Gerente</label><select defaultValue="Marina Valente"><option>Marina Valente</option><option>Caio Nobre</option></select></div>
        <div className="campo"><label>Competência</label><input type="month" defaultValue={competencia} /></div>
        <div className="campo"><label>Prazo final</label><input type="datetime-local" defaultValue={`${competencia}-28T20:00`} /></div>
        <button className="btn-primario" type="button" onClick={() => setPrazoMensagem("Prazo simulado liberado apenas nesta prévia.")}>Liberar prazo</button>
      </div>
      {prazoMensagem && <div className="sucesso-box" role="status">{prazoMensagem}</div>}
    </div>
  );

  const pixSimulado = (
    <details className="pix-admin-panel fechamento-pix-secondary">
      <summary><span><span className="dash-kicker">Ferramenta secundária</span><strong>Cartões PIX para prestação de contas</strong></span><b>Simulação local</b></summary>
      <div className="fechamento-pix-content"><p className="fechamento-vazio">A área permanece recolhida na mesa principal. Chaves e avisos reais não são carregados nesta prévia.</p></div>
    </details>
  );

  return (
    <FechamentoWorkbench
      etapas={ETAPAS}
      etapaAtual={etapa}
      etapaConcluida={etapaConcluida}
      periodo={{
        competencia,
        dia,
        maxCompetencia: new Date().toISOString().slice(0, 7),
        label: periodoLabel(competencia, dia),
        onCompetenciaChange: (valor) => { setCompetencia(valor || mesAnterior()); setDia(""); },
        onDiaChange: (valor) => { setDia(valor); if (valor) setCompetencia(valor.slice(0, 7)); },
        onMesAnterior: () => { setCompetencia(mesAnterior()); setDia(""); },
      }}
      rotas={rotas}
      selecao={{
        gerente,
        rota,
        pontos: rotaSelecionada?.pontos || 0,
        equipamentos: rotaSelecionada?.equipamentos || 0,
        rotasDisponiveis: rotasDoGerente,
        status,
        onSelecionar: selecionarRota,
        onTrocarRota: (novaRota) => selecionarRota(rotas.find((item) => item.gerente === gerente && item.rota === novaRota) || rotaSelecionada),
      }}
      financeiro={{
        modalidades: calculo.modalidades,
        valores,
        totais: calculo.totais,
        formatarMoeda: formatarMoedaPreview,
        onAlterarModalidade: alterarModalidade,
        onFormatarComissao: (modalidadeId) => alterarModalidade(modalidadeId, "comissao", textoMoeda(valores[modalidadeId]?.comissao)),
      }}
      ajustes={{
        playBet: { valor: playBet, numero: numeroFechamentoPreview(playBet), onChange: setPlayBet, onBlur: () => setPlayBet(textoMoeda(playBet)) },
        ajudaCusto: { valor: ajudaCusto, numero: numeroFechamentoPreview(ajudaCusto), onChange: setAjudaCusto, onBlur: () => setAjudaCusto(textoMoeda(ajudaCusto)) },
        comissaoExtra: { permitida: true, valor: comissaoExtra, numero: numeroFechamentoPreview(comissaoExtra), onChange: setComissaoExtra, onBlur: () => setComissaoExtra(textoMoeda(comissaoExtra)) },
      }}
      despesas={{ grupos: fixture.gruposDespesas, quantidadeLancamentos: fixture.despesas.length }}
      feedback={feedback}
      acoes={{
        salvando: false,
        isEnviado: ["enviado", "visualizado", "confirmado", "finalizado"].includes(status.classe),
        isConfirmado: status.classe === "confirmado",
        isFinalizado: status.classe === "finalizado",
        onSalvar: salvarLocal,
        onEnviar: enviarLocal,
        onFinalizar: finalizarLocal,
        onVisualizar: () => setFeedback({ erro: "", sucesso: "Prévia local: visualização de PDF simulada." }),
        onBaixarRota: () => setFeedback({ erro: "", sucesso: "Prévia local: download da rota simulado." }),
        onBaixarGerente: () => setFeedback({ erro: "", sucesso: "Prévia local: downloads do gerente simulados." }),
      }}
      prazos={{ aberto: prazosAbertos, onFechar: onFecharPrazos, conteudo: prazoConteudo }}
      secondaryTools={pixSimulado}
    />
  );
}

export default function FechamentoPreviewApp() {
  const parametros = new URLSearchParams(window.location.search);
  const inicial = parametros.get("cenario")?.toUpperCase();
  const cenarioInicial = FECHAMENTO_PREVIEW_SCENARIOS.some((item) => item.id === inicial) ? inicial : "D";
  const [cenarioId, setCenarioId] = useState(cenarioInicial);
  const [temaClaro, setTemaClaro] = useState(parametros.get("tema") === "claro");
  const [prazosAbertos, setPrazosAbertos] = useState(false);
  const fixture = useMemo(() => criarFechamentoPreview(cenarioId), [cenarioId]);

  function trocarCenario(novoId) {
    setCenarioId(novoId);
    const url = new URL(window.location.href);
    url.searchParams.set("preview", "fechamento");
    url.searchParams.set("cenario", novoId);
    window.history.replaceState({}, "", url);
  }

  function trocarTema() {
    setTemaClaro((atual) => {
      const proximo = !atual;
      const url = new URL(window.location.href);
      url.searchParams.set("tema", proximo ? "claro" : "escuro");
      window.history.replaceState({}, "", url);
      return proximo;
    });
  }

  return (
    <div className={`app operations-shell command-flow-shell module-fechamento fechamento-preview-app${temaClaro ? " tema-claro" : ""}`}>
      <aside className="fechamento-preview-rail" aria-label="Contexto da prévia local">
        <div className="fechamento-preview-brand"><img src="/brand/neptera/icons/neptera-favicon-48.png" alt="" /><span><strong>NEPTERA</strong><small>Ambiente de design</small></span></div>
        <nav className="fechamento-preview-nav" aria-label="Módulo em avaliação"><span>Controle</span><div><Icon name="checkCircle" /> Fechamento</div></nav>
        <p className="fechamento-preview-rail-note">Esta entrada DEV não carrega autenticação, perfil, dados operacionais, banco ou Supabase.</p>
      </aside>
      <main className="fechamento-preview-main">
        <div className="fechamento-preview-toolbar">
          <div className="fechamento-preview-toolbar-copy"><span className="fechamento-preview-badge">PRÉVIA LOCAL · DADOS SIMULADOS</span><strong>{fixture.cenario.nome}</strong></div>
          <label className="fechamento-preview-scenario"><span>Cenário de QA</span><select value={cenarioId} onChange={(event) => trocarCenario(event.target.value)}>{FECHAMENTO_PREVIEW_SCENARIOS.map((cenario) => <option key={cenario.id} value={cenario.id}>{cenario.id} — {cenario.nome}</option>)}</select></label>
          <button type="button" onClick={trocarTema} aria-label={`Ativar tema ${temaClaro ? "escuro" : "claro"}`}><Icon name={temaClaro ? "moon" : "sun"} /><span>{temaClaro ? "Escuro" : "Claro"}</span></button>
        </div>
        <header className="fechamento-preview-module-head"><div><span>Reconciliação operacional</span><h1>Fechamento</h1><p>Conferência, prova do resultado e publicação por rota.</p></div><button type="button" aria-expanded={prazosAbertos} onClick={() => setPrazosAbertos((atual) => !atual)}><Icon name="calendar" /><span>Prazos de despesas</span></button></header>
        <FechamentoPreviewScenario key={cenarioId} fixture={fixture} prazosAbertos={prazosAbertos} onFecharPrazos={() => setPrazosAbertos(false)} />
      </main>
    </div>
  );
}
