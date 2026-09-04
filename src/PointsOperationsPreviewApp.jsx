import { useEffect, useMemo, useRef, useState } from "react";
import { AbaPontos, PointExpensesModal, PointMonthlyExpensesModal } from "./PointsPage.jsx";
import { Modal as OperationModal, OperationIcon } from "./components/operations/OperationsUI.jsx";
import { handleMainScrollKey } from "./components/operations/mainScrollNavigation.js";
import { aplicarResumoDespesaMes, valorDespesa } from "./pointsExpenses.js";
import { resolverEstadoPreviewPontos } from "./pointsPreviewState.js";
import "./App.css";
import "./styles/foundations.css";
import "./styles/command-flow.css";

const ROTAS_PREVIEW = ["Central/Uibai", "Jussara", "Lapão", "Mirorós", "Ibititá", "América Dourada"];
const NOMES_PREVIEW = ["Vale Azul", "Posto Central", "Jardim Imperial", "Estação Norte", "Mercado das Flores", "Parque do Sol", "Vila Serena", "Nova Esperança", "Portal do Sertão", "Praça da Matriz"];

const PONTOS_BASE_PREVIEW = Object.freeze(Array.from({ length: 42 }, (_, index) => ({
  id: index + 1,
  nomeFantasia: index===1?"TABERNA BEER":`${NOMES_PREVIEW[index % NOMES_PREVIEW.length]} ${String(Math.floor(index / NOMES_PREVIEW.length) + 1).padStart(2, "0")}`,
  nomeDono: ["Caio Nobre", "Lívia Andrade", "Rafael Lima", "Bruna Moraes"][index % 4],
  telefone: `(74) 9${String(8200 + index).padStart(4, "0")}-${String(1100 + index).padStart(4, "0")}`,
  gerente: ROTAS_PREVIEW[index % ROTAS_PREVIEW.length],
  modalidades: ["Viapix", "90 da Sorte", ...(index % 3 === 0 ? ["Play Bet"] : []), ...(index % 4 === 0 ? ["Lotobanca"] : [])],
  observacao: index % 7 === 0 ? "Unidade com acompanhamento operacional reforçado nesta competência." : "",
  situacaoOperacional: index % 13 === 0 ? "desativado" : "ativo",
  versaoOperacional: 1 + (index % 3),
})));

const DESPESAS_PREVIEW = Object.freeze([
  ...PONTOS_BASE_PREVIEW.flatMap((ponto, index) => {
    if (index % 4 === 0) return [];
    const total = 320 + index * 17 - ([37, 41].includes(index) ? 390 : 0);
    const operacional = Math.round(total * 0.64);
    return [
      { id: `expense-${ponto.id}-1`, pontoId: ponto.id, competencia: "2026-08-01", descricao: "Operação da unidade", tipo: "operacional", valorReal: operacional, valorPrevisto: operacional, observacao: "" },
      { id: `expense-${ponto.id}-2`, pontoId: ponto.id, competencia: "2026-08-01", descricao: "Apoio local", tipo: "apoio", valorReal: total - operacional, valorPrevisto: total - operacional, observacao: index % 5 === 0 ? "Lançamento conferido no fechamento local." : "" },
    ];
  }),
  { id: "manager-expense-1", pontoId: null, gerente: "Caio Nobre", rota: "Jussara", competencia: "2026-08-01", descricao: "Deslocamento de rota", tipo: "operacional", valorReal: 390, valorPrevisto: 390, observacao: "" },
  { id: "manager-expense-2", pontoId: null, gerente: "Bruna Moraes", rota: "América Dourada", competencia: "2026-08-01", descricao: "Apoio de operação", tipo: "operacional", valorReal: 390, valorPrevisto: 390, observacao: "" },
]);

const PONTOS_PREVIEW = Object.freeze(aplicarResumoDespesaMes(PONTOS_BASE_PREVIEW, DESPESAS_PREVIEW, "2026-08"));
const TOTAL_DESPESAS_PREVIEW = DESPESAS_PREVIEW.reduce((soma, despesa) => soma + valorDespesa(despesa), 0);

const EQUIPAMENTOS_PREVIEW = Object.freeze(PONTOS_PREVIEW.flatMap((ponto, index) => index % 5 === 0 ? [] : Array.from({ length: 1 + (index % 3) }, (_, equipmentIndex) => ({
  id: `point-equipment-${ponto.id}-${equipmentIndex}`,
  nome: ponto.id===2?["TV HQ", "POS AMARELO"][equipmentIndex]:["Terminal Delta", "Impressora Epson", "Tablet Samsung"][equipmentIndex],
  categoria: ponto.id===2?["Televisões", "Terminais"][equipmentIndex]:["Terminais", "Impressoras", "Tablets"][equipmentIndex],
  patrimonio: `NP-${String(ponto.id * 10 + equipmentIndex).padStart(4, "0")}`,
  status: "Em rota",
  localizacao: ponto.nomeFantasia,
}))));

const SOLICITACOES_STATUS_PREVIEW = Object.freeze([
  { id: "status-local-1", pontoId: 2, pontoNome: PONTOS_PREVIEW[1].nomeFantasia, status: "pendente", motivo: "Encerramento das atividades no endereço atual.", solicitante: "Caio Nobre", solicitadoEm: "2026-09-01T09:31:00-03:00" },
  { id: "status-local-2", pontoId: 6, pontoNome: PONTOS_PREVIEW[5].nomeFantasia, status: "pendente", solicitadoEm: "2026-08-27T09:40:00-03:00" },
]);

const HISTORICO_PREVIEW = Object.freeze(PONTOS_PREVIEW.slice(0, 8).map((ponto, index) => ({
  id: `legacy-${index}`,
  tipo: index % 2 ? "edicao" : "cadastro",
  nome: ponto.nomeFantasia,
  observacao: index % 2 ? "Contato operacional atualizado" : "Ponto cadastrado",
  data: "28/08/2026 11:30",
})));

const ACESSOS_PREVIEW = Object.freeze(PONTOS_PREVIEW.slice(0, 9).map((ponto, index) => ({ id: `access-${index}`, pontoId: ponto.id })));

async function carregarCicloPreview(pontoId) {
  return [
    { id: `cycle-${pontoId}-1`, pontoId, acao: "desativacao_rejeitada", motivo: "Operação mantida após revisão administrativa da solicitação.", perfil: "administrador", criadoEm: "2026-08-28T16:30:00-03:00" },
    { id: `cycle-${pontoId}-2`, pontoId, acao: "reativacao", motivo: "Unidade liberada para retornar à rede operacional.", perfil: "administrador", criadoEm: "2026-07-18T10:15:00-03:00" },
  ];
}

function MovementPreviewModal({ contexto, erro, onClose, onConfirmar }) {
  if(!contexto)return null;
  const { item, ponto }=contexto;
  return <OperationModal open title="Movimentar equipamento" subtitle={`${item.nome} · ${item.categoria} · vinculado a ${ponto.nomeFantasia}`} onClose={onClose} size="lg" className="equip-cf-movement-modal" overlayClassName="equip-cf-movement-overlay" footer={<><button className="btn-secundario" type="button" onClick={onClose}>Cancelar</button><button className="btn-primario" type="button" onClick={()=>onConfirmar(item)}>Confirmar movimentação</button></>}>
    <div className="equip-cf-movement-subject"><span><small>Equipamento selecionado</small><strong>{item.nome}</strong></span><span className="badge-status">{item.status}</span></div>
    <div className="equip-cf-movement-path" aria-label="Fluxo simulado da movimentação: origem, ação e destino">
      <div className="equip-cf-movement-step"><span>Origem</span><strong>{ponto.nomeFantasia}</strong><small>Posição atual</small></div>
      <span className="equip-cf-movement-arrow" aria-hidden="true"><OperationIcon name="arrowRight"/></span>
      <div className="equip-cf-movement-step is-action"><span>Movimentação</span><strong>Disponibilizar</strong><small>Fluxo local seguro</small></div>
      <span className="equip-cf-movement-arrow" aria-hidden="true"><OperationIcon name="arrowRight"/></span>
      <div className="equip-cf-movement-step is-destination"><span>Destino</span><strong>Estoque interno</strong><small>Disponível após confirmar</small></div>
    </div>
    {erro&&<div className="erro-msg"><OperationIcon name="warning"/> {erro}</div>}
    <div className="points-preview-notice" role="note">Simulação DEV isolada. No sistema real, este acionador usa o modal e o handler oficiais de Equipamentos.</div>
  </OperationModal>;
}

export default function PointsOperationsPreviewApp() {
  const params=useMemo(()=>new URLSearchParams(window.location.search),[]);
  const estadoInicial=useMemo(()=>resolverEstadoPreviewPontos(params,PONTOS_PREVIEW.map(ponto=>ponto.id)),[params]);
  const [light,setLight]=useState(estadoInicial.tema==="light");
  const [despesasAbertas,setDespesasAbertas]=useState(false);
  const [despesasPreview,setDespesasPreview]=useState(()=>DESPESAS_PREVIEW.map(item=>({...item})));
  const [despesaGerenteAdmin,setDespesaGerenteAdmin]=useState(null);
  const [perspectivaDespesas,setPerspectivaDespesas]=useState(estadoInicial.perspectivaDespesas);
  const cenario=String(params.get("cenario")||"").toLowerCase();
  const [busca,setBusca]=useState(cenario==="single"?"Posto Central 01":"");
  const [filtroDespesa,setFiltroDespesa]=useState("todos");
  const [equipamentosPreview,setEquipamentosPreview]=useState(()=>EQUIPAMENTOS_PREVIEW.map(item=>({...item})));
  const [solicitacoesPreview,setSolicitacoesPreview]=useState(()=>SOLICITACOES_STATUS_PREVIEW.map(item=>({...item})));
  const [movimentacaoPreview,setMovimentacaoPreview]=useState(null);
  const [erroMovPreview,setErroMovPreview]=useState("");
  const [pedidoDossiePreview,setPedidoDossiePreview]=useState(null);
  const [notice,setNotice]=useState("Prévia local segura · nenhuma ação grava dados.");
  const mainRef=useRef(null);

  useEffect(()=>{
    const next=new URL(window.location.href);
    next.searchParams.set("preview","pontos");
    next.searchParams.set("theme",light?"light":"dark");
    window.history.replaceState(null,"",next);
  },[light]);

  useEffect(()=>{
    if(estadoInicial.despesasAbertas)setDespesasAbertas(true);
  },[estadoInicial.despesasAbertas]);

  const simular=mensagem=>setNotice(mensagem);
  const confirmarMovimentacaoPreview=item=>{
    if(params.get("movimento")==="erro"){
      setErroMovPreview("Não foi possível confirmar a movimentação simulada. O vínculo e a decisão permanecem inalterados.");
      return;
    }
    setEquipamentosPreview(lista=>lista.map(atual=>atual.id===item.id?{...atual,localizacao:"",status:"Disponível"}:atual));
    setMovimentacaoPreview(null);
    setErroMovPreview("");
    setNotice(`${item.nome} movimentado na simulação local. O vínculo foi removido sem gravar dados.`);
  };
  const pendenciasPreview=solicitacoesPreview.filter(item=>item.status==="pendente");
  const abrirDossiePendenciaPreview=()=>{
    const solicitacao=pendenciasPreview[0];
    if(!solicitacao)return;
    setPedidoDossiePreview(atual=>({pontoId:solicitacao.pontoId,revisao:(atual?.revisao||0)+1}));
    setNotice(`Dossiê local de ${solicitacao.pontoNome} aberto. Nenhum dado real foi acessado.`);
  };
  const decidirPreview=(solicitacao,aprovar)=>{
    if(!aprovar){
      const motivo=window.prompt("Informe o motivo da rejeição:")||"";
      if(motivo.trim().length<5){setNotice("A rejeição simulada exige um motivo com pelo menos 5 caracteres.");return;}
    }
    setSolicitacoesPreview(lista=>lista.map(item=>item.id===solicitacao.id?{...item,status:aprovar?"aprovada":"rejeitada"}:item));
    setNotice(aprovar?"Desativação aprovada somente na simulação local.":"Solicitação rejeitada somente na simulação local.");
  };

  return <div className={`app operations-shell command-flow-shell points-preview-shell${light?" tema-claro":""}`}>
    <aside className="sidebar points-preview-sidebar">
      <div className="sidebar-logo"><span className="points-preview-mark">N</span><strong className="sidebar-brand-name">NEPTERA</strong></div>
      <nav className="sidebar-nav" aria-label="Prévia de Pontos"><span className="nav-section-label">Checkpoint visual</span><button type="button" className="nav-item active" aria-current="page"><OperationIcon name="mapPin"/>Pontos</button></nav>
      <div className="sidebar-footer"><button type="button" className="sidebar-utility sidebar-utility-theme" onClick={()=>setLight(valor=>!valor)} aria-pressed={light}><span>{light?"Tema claro":"Tema escuro"}</span><span className={`tema-toggle ${light?"ativo":""}`}/></button><small className="sidebar-version">Fixture local · zero escrita</small></div>
    </aside>
    <main className="main" ref={mainRef} tabIndex={-1} onKeyDown={handleMainScrollKey}>
      <div className="points-page points-command-flow operations-theme">
        <header className="pcf-command-header">
          <div className="pcf-command-title"><button className="pcf-menu-button" type="button" aria-label="Abrir navegação simulada" onClick={()=>simular("Navegação mobile preservada no shell real.")}><OperationIcon name="menu"/></button><div><h1>Pontos</h1><span className="pcf-command-context">42 na rede · competência 08/2026</span></div></div>
          <div className="pcf-command-actions"><span className="pcf-pending-summary pcf-pending-summary--desktop"><OperationIcon name="warning" size={15}/>{pendenciasPreview.length} na fila administrativa</span>{pendenciasPreview.length>0&&<button type="button" className="pcf-pending-cycle-trigger" onClick={abrirDossiePendenciaPreview} aria-haspopup="dialog" aria-label={`Abrir ${pendenciasPreview.length} ${pendenciasPreview.length===1?"pendência":"pendências"} de desativação`}><OperationIcon name="warning" size={16}/><span>Pendências</span><strong>{pendenciasPreview.length}</strong><OperationIcon name="chevronRight" size={16}/></button>}<button type="button" className="pcf-button pcf-button--primary" onClick={()=>simular("Cadastro simulado; nenhum dado foi gravado.")}><OperationIcon name="plus"/>Novo ponto</button></div>
        </header>
        <div className="points-preview-notice" role="status">{notice}</div>
         <AbaPontos pontos={PONTOS_PREVIEW} equipamentos={equipamentosPreview} historico={HISTORICO_PREVIEW} acessos={ACESSOS_PREVIEW} solicitacoes={[]} solicitacoesStatus={solicitacoesPreview} competencia="2026-08" busca={busca} onBuscaChange={setBusca} onLimparBusca={()=>setBusca("")} filtroDespesa={filtroDespesa} onFiltroDespesaChange={setFiltroDespesa} onLimparFiltro={()=>setFiltroDespesa("todos")} totalDespesasCompetencia={TOTAL_DESPESAS_PREVIEW} despesasAbertas={despesasAbertas} pontoSelecionadoInicialId={estadoInicial.pontoSelecionadoId} pedidoDossie={pedidoDossiePreview} filtroPendenciaInicial={cenario==="pendencias"?"pendente":"todos"} onEditar={()=>simular("Edição simulada.")} onDespesas={()=>simular("Despesas simuladas.")} onSolicitarModalidade={()=>simular("Solicitação de modalidade simulada.")} onSolicitarDesativacao={()=>simular("Solicitação de desativação simulada.")} onDecidirDesativacao={decidirPreview} onMovimentarEquipamento={(item,contexto)=>{setErroMovPreview("");setMovimentacaoPreview({item,ponto:contexto.ponto});}} onReativar={()=>simular("Reativação simulada.")} onVerAcessos={()=>simular("Acessos simulados.")} onVerDespesas={()=>{setPerspectivaDespesas("rotas");setDespesasAbertas(true);}} onExportExcel={itens=>simular(`CSV simulado com ${itens.length} resultado(s) filtrado(s).`)} onExportPDF={itens=>simular(`PDF simulado com ${itens.length} resultado(s) filtrado(s).`)} onCarregarHistoricoFormal={carregarCicloPreview} podeVerHistoricoFormal podeEditar podeEditarDespesas podeSolicitarModalidade podeSolicitarDesativacao podeDecidirDesativacao podeReativar mostrarDespesas/>
      </div>
    </main>
    {despesasAbertas&&<PointExpensesModal pontos={PONTOS_BASE_PREVIEW} despesas={despesasPreview} competenciaInicial="2026-08" permitirSelecionarCompetencia perspectivaInicial={perspectivaDespesas} pontoSelecionadoInicialId={estadoInicial.pontoDespesasId} podeEditar suspenso={Boolean(despesaGerenteAdmin)} onAbrirDespesaPonto={ponto=>simular(`Lançamentos de ${ponto.nomeFantasia} preservados no fluxo real.`)} onAbrirDespesaGerente={despesa=>setDespesaGerenteAdmin(despesa)} onFechar={()=>setDespesasAbertas(false)}/>}
    {despesaGerenteAdmin&&<PointMonthlyExpensesModal gerenteDespesa={despesaGerenteAdmin.gerente} rotasGerente={[despesaGerenteAdmin.rota]} despesas={despesasPreview} competenciaInicial="2026-08" edicaoInicialId={despesaGerenteAdmin.id} somenteEdicaoExistente podeEditar perfilAtual={{perfil:"administrador",nome:"Admin local"}} onSalvar={async(_contexto,_competencia,linhas)=>{const atualizada=linhas[0];setDespesasPreview(lista=>lista.map(item=>item.id===atualizada.id?{...item,...atualizada}:item));setDespesaGerenteAdmin(null);setNotice("Despesa do gerente atualizada somente na fixture DEV.");}} onFechar={()=>setDespesaGerenteAdmin(null)}/>}
    <MovementPreviewModal contexto={movimentacaoPreview} erro={erroMovPreview} onClose={()=>{setMovimentacaoPreview(null);setErroMovPreview("");}} onConfirmar={confirmarMovimentacaoPreview}/>
  </div>;
}
