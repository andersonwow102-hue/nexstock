import logo90DaSorte from "./assets/modalidade-90-da-sorte.png";
import logoViapix from "./assets/modalidade-viapix.png";
import logoLotobanca from "./assets/modalidade-lotobanca.png";
import { useState, useEffect, useMemo, useRef } from "react";
import "./App.css";
import PointsPage, { PointFormModal } from "./PointsPage.jsx";
import ManagementPage from "./ManagementPage.jsx";
import LoginManagerPage from "./LoginManagerPage.jsx";
import DevedoresPage from "./DevedoresPage.jsx";
import DashboardPage from "./DashboardPage.jsx";
import FechamentoWorkbench from "./FechamentoWorkbench.jsx";
import EquipmentInventoryLedger from "./EquipmentInventoryLedger.jsx";
import HistoricoTimelinePage from "./HistoricoTimelinePage.jsx";
import PatrimonioDeepLinkPage from "./PatrimonioDeepLinkPage.jsx";
import { parsePatrimonioRoute } from "./patrimonioDeepLink.js";
import { permissoesDevedores } from "./devedoresUtils.js";
import { GERENTES, MODALIDADES, ROTAS_POR_GERENTE, GERENTE_CORES, gerenteDaRota, rotaCanonica, rotaPermitidaAoPerfil, rotaPertenceAoGerente } from "./pointsData.js";
import { limparRecuperacao, recuperacaoIniciada, supabase } from "./supabase.js";
import { exportarCsvSeguro } from "./csvExport.js";
import { expenseBelongsToManager, expenseBelongsToRoute, isManagerExpense } from "./expenseScope.js";
import { FilterBar, Modal as OperationModal, OperationIcon } from "./components/operations/OperationsUI.jsx";
import { acquireMainScrollLock } from "./components/operations/mainScrollLock.js";
import { handleMainScrollKey } from "./components/operations/mainScrollNavigation.js";
import PwaInstallControl from "./components/pwa/PwaInstallControl.jsx";
import {
  carregarEquipamentos, salvarEquipamento, excluirEquipamento,
  carregarHistoricoEquipamentos, adicionarHistoricoEquipamento,
  carregarPontos, salvarPonto, adicionarHistoricoPonto, carregarHistoricoPontos,
  carregarPerfilAtual, resolverEmailPorLogin, carregarDespesasMensais,
  carregarMensagensInternas, enviarMensagemInterna, marcarMensagensInternasLidas,
  carregarPixEnvios, enviarPixParaGerente,
  carregarFechamentosRotas, salvarFechamentoRota, finalizarPrestacaoRota,
  carregarProrrogacoesDespesas, salvarProrrogacaoDespesa, encerrarProrrogacaoDespesa,
  registrarVisualizacaoFechamento, confirmarFechamentoGerente,
  carregarGerenteModalidadeAcessos, salvarGerenteModalidadeAcesso, excluirGerenteModalidadeAcesso,
  carregarModalidadeApps, enviarModalidadeApp, obterLinkDownloadModalidadeApp,
} from "./db.js";
import "./styles/foundations.css";
import "./styles/command-flow.css";
import "./FechamentoCommandFlow.css";
import "./FechamentoWorkbench.css";

const NEPTERA = Object.freeze({
  nome: "NEPTERA",
  descritor: "Plataforma Operacional Integrada",
  autoria: "Anderion Labs",
  simbolo: "/brand/neptera/neptera-symbol.png",
  simboloCompacto: "/brand/neptera/icons/neptera-favicon-48.png",
  icone: "/brand/neptera/neptera-app-icon.png",
  iconeNotificacao: "/brand/neptera/icons/neptera-app-icon-192.png",
  logoHorizontalEscuro: "/brand/neptera/neptera-logo-horizontal-dark.png",
  logoHorizontalClaro: "/brand/neptera/neptera-logo-horizontal-light.png",
});

const MODULO_PARA_ABA = Object.freeze({
  dashboard: "dashboard",
  equipamentos: "itens",
  pontos: "pontos",
  devedores: "devedores",
  "buscar-gerentes": "buscar-gerentes",
  senhas: "senhas",
  fechamento: "fechamento",
  "prestacao-de-conta": "prestacao-gerente",
  "central-de-acessos": "gestao",
  "gerenciar-logins": "logins",
  historico: "historico",
});
const ABA_PARA_MODULO = Object.freeze(Object.fromEntries(Object.entries(MODULO_PARA_ABA).map(([modulo,aba])=>[aba,modulo])));

function abaInicialDaUrl() {
  if(typeof window==="undefined")return "dashboard";
  return MODULO_PARA_ABA[new URLSearchParams(window.location.search).get("modulo")]||"dashboard";
}

function atualizarUrlDoModulo(aba,{substituir=false}={}) {
  if(typeof window==="undefined"||!ABA_PARA_MODULO[aba])return;
  const url=new URL(window.location.href);
  url.searchParams.set("modulo",ABA_PARA_MODULO[aba]);
  window.history[substituir?"replaceState":"pushState"]({modulo:ABA_PARA_MODULO[aba]},"",`${url.pathname}${url.search}${url.hash}`);
}

const CATEGORIAS = ["Televisões","Terminais","Impressoras","Tablets","Carregadores","Máquina de Brindes","Totens","Noteiro","PDV Touchscreen"];
const STATUS_LISTA = ["Disponível","Em rota","Em conserto"];
const ICONES = {"Televisões":"tv","Terminais":"terminal","Impressoras":"printer","Tablets":"tablet","Carregadores":"plug","Máquina de Brindes":"gift","Totens":"tower","Noteiro":"banknote","PDV Touchscreen":"receipt"};
const STATUS_CFG = {
  "Disponível": {cor:"status-disponivel"},
  "Em rota":    {cor:"status-em-rota"},
  "Em conserto":{cor:"status-conserto"},
};
const TIPOS_MOV = [
  {id:"ponto",     label:"Enviar para Ponto",   icone:"mapPin",novoStatus:"Em rota",     exigePonto:true },
  {id:"gerente",   label:"Enviar p/ Gerente",   icone:"user",novoStatus:"Em rota",  exigePonto:false},
  {id:"conserto",  label:"Enviar p/ Conserto",  icone:"wrench",novoStatus:"Em conserto",exigePonto:false},
  {id:"disponivel",label:"Disponibilizar",       icone:"check",novoStatus:"Disponível",  exigePonto:false},
];
const HIST_CFG = {
  "cadastro":  {cor:"hist-cadastro",  icone:"plus",label:"Cadastro" },
  "edicao":    {cor:"hist-edicao",    icone:"edit",label:"Edição"   },
  "exclusao":  {cor:"hist-exclusao",  icone:"trash",label:"Exclusão" },
  "entrada":   {cor:"hist-entrada",   icone:"plus",label:"Entrada"  },
  "saida":     {cor:"hist-saida",     icone:"minus",label:"Saída"    },
  "conserto":  {cor:"hist-conserto",  icone:"wrench",label:"Conserto" },
  "retorno":   {cor:"hist-retorno",   icone:"check",label:"Retorno"  },
  "defeito":   {cor:"hist-defeito",   icone:"warning",label:"Defeito"  },
  "disponivel":{cor:"hist-disponivel",icone:"check",label:"Disponível"},
  "baixa":     {cor:"hist-baixa",     icone:"arrowDown",label:"Baixa"    },
  "ponto":     {cor:"hist-rota",      icone:"mapPin",label:"Enviado ao ponto"},
  "envio_gerente": {cor:"hist-rota",  icone:"package",label:"Enviado ao gerente"},
  "recebimento_gerente": {cor:"hist-entrada", icone:"check",label:"Recebido pelo gerente"},
};

const HIST_ICONES = {
  cadastro: "plus",
  edicao: "edit",
  exclusao: "trash",
  entrada: "plus",
  saida: "minus",
  conserto: "wrench",
  retorno: "checkCircle",
  defeito: "warning",
  disponivel: "checkCircle",
  baixa: "arrowDown",
  ponto: "mapPin",
  envio_gerente: "package",
  recebimento_gerente: "checkCircle",
};

function Icon({ name, className = "", title = "", size = 18 }) {
  return <OperationIcon className={`app-icon ${className}`.trim()} name={name} size={size} title={title} />;
}

function ModuleHeader({ eyebrow, title, subtitle, onMenu, menuOpen = false, actions = null, className = "" }) {
  return (
    <header className={`cf-page-head ${className}`.trim()}>
      <div className="cf-page-head__identity">
        <button className="btn-hamburguer" onClick={onMenu} type="button" aria-label={menuOpen?"Fechar navegação":"Abrir navegação"} aria-controls="stock-on-primary-navigation" aria-expanded={menuOpen}><Icon name="menu" /></button>
        <div className="cf-page-head__copy"><span className="cf-page-head__eyebrow">{eyebrow}</span><h1>{title}</h1><p>{subtitle}</p></div>
      </div>
      {actions&&<div className="cf-page-head__actions">{actions}</div>}
    </header>
  );
}

function padronizarNomenclaturaEquipamento(t){
  return String(t||"").trim().replace(/\s+/g," ").toUpperCase();
}

const TRANSFERENCIA_GERENTE = {
  aguardando: "aguardando_confirmacao",
  recebido: "recebido",
};
const formVazio={nome:"",categoria:CATEGORIAS[0],quantidade:1,status:"Disponível",minimo:5,observacao:"",localizacao:"",responsavel:"",patrimonio:"",dataCadastro:"",gerenteResponsavel:"",transferenciaStatus:"",transferenciaEnviadaEm:"",transferenciaRecebidaEm:""};
const movVazio={tipoId:"ponto",ponto:"",gerente:"",responsavel:"",observacao:"",defeito:"",assistencia:"",previsao:"",dataRetirada:"",formaPagamento:"PIX",notaFiscalNome:"",notaFiscalArquivo:"",consertoPix:"",consertoValor:""};
const ITENS_POR_PAGINA=12;
const agora=()=>new Date().toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});
const hoje=()=>new Date().toISOString().slice(0,10);

function linhasDetalheHistorico(texto){
  const detalhes=String(texto||"").trim();
  if(!detalhes) return ["Sem detalhe registrado."];
  return detalhes
    .split("|")
    .map(linha=>linha.trim())
    .filter(Boolean);
}

function HistoricoDetalhes({ texto }){
  const linhas=linhasDetalheHistorico(texto);
  return (
    <ul className="historico-detalhes-lista">
      {linhas.map((linha,idx)=><li key={`${linha}-${idx}`}>{linha}</li>)}
    </ul>
  );
}
const isoAgora=()=>new Date().toISOString();
const formatarMoedaPDF=valor=>Number(valor||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const normalizarTexto=v=>String(v||"").trim().normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
function comPrazo(promise, descricao, tempo=15000) {
  return Promise.race([
    promise,
    new Promise((_, rejeitar)=>setTimeout(()=>rejeitar(new Error(`Tempo excedido ao carregar ${descricao}.`)),tempo)),
  ]);
}
function ordenarEquipamentos(lista){
  return [...lista].sort((a,b)=>{
    const categoriaA=CATEGORIAS.indexOf(a.categoria);
    const categoriaB=CATEGORIAS.indexOf(b.categoria);
    if(categoriaA!==categoriaB)return categoriaA-categoriaB;
    return a.nome.localeCompare(b.nome, "pt-BR", {numeric:true});
  });
}
function ordenarPontos(lista){
  return [...lista].sort((a,b)=>
    (a.gerente||"").localeCompare(b.gerente||"", "pt-BR") ||
    a.nomeFantasia.localeCompare(b.nomeFantasia, "pt-BR")
  );
}

const Auth={ deslogar:async()=>{ await supabase.auth.signOut(); } };

function validarItem(f){
  if(!f.nome.trim())       return"Nome do equipamento é obrigatório.";
  if(!f.categoria)         return"Categoria é obrigatória.";
  if(!f.status)            return"Status é obrigatório.";
  if(!padronizarNomenclaturaEquipamento(f.nome)) return"Nomenclatura do equipamento é obrigatória.";
  return null;
}
function validarMov(mov,tipo,perfil=""){
  if(tipo.exigePonto&&!mov.ponto)return"Selecione o ponto de destino.";
  if(tipo.id==="conserto"&&!mov.defeito.trim())return"Descreva o defeito antes de enviar o equipamento para conserto.";
  if(tipo.id==="conserto"&&perfil==="operador"){
    if(!String(mov.formaPagamento||"").trim())return"Informe a forma de pagamento do conserto.";
    if(mov.formaPagamento==="PIX"&&!String(mov.consertoPix||"").trim())return"Informe a chave PIX do conserto.";
    if(Number(mov.consertoValor||0)<=0)return"Informe o valor do conserto.";
  }
  return null;
}

function textoLocalizacaoEquipamento(item){
  if(item.localizacao)return item.localizacao;
  if(item.gerenteResponsavel&&item.transferenciaStatus===TRANSFERENCIA_GERENTE.aguardando)return`Enviado para ${item.gerenteResponsavel}`;
  if(item.gerenteResponsavel&&item.transferenciaStatus===TRANSFERENCIA_GERENTE.recebido)return`Estoque de ${item.gerenteResponsavel}`;
  return"Sem ponto";
}

function posicaoVisualEquipamento(item){
  if(item.status==="Em conserto")return{label:"Conserto",detail:item.consertoAssistencia||"Assistência não informada",icon:"wrench"};
  if(item.localizacao)return{label:"Em ponto",detail:item.localizacao,icon:"mapPin"};
  if(item.gerenteResponsavel&&item.transferenciaStatus===TRANSFERENCIA_GERENTE.aguardando)return{label:"Em transferência",detail:item.gerenteResponsavel,icon:"route"};
  if(item.gerenteResponsavel)return{label:"Com gerente",detail:item.gerenteResponsavel,icon:"user"};
  return{label:"Estoque interno",detail:"Base operacional",icon:"package"};
}

function identificadorVisualEquipamento(item){
  return String(item.patrimonio||item.id||"").trim();
}

function vinculoVisualEquipamento(item){
  if(item.gerenteResponsavel)return item.gerenteResponsavel;
  if(item.localizacao)return"Sem gerente vinculado";
  return"Sem vínculo ativo";
}

function LocalizacaoGerenteCell({ item }) {
  const ponto = item.localizacao || "";
  const gerente = item.gerenteResponsavel || "";
  return (
    <div className="localizacao-gerente-cell">
      <span><strong>Ponto:</strong> {ponto || "Sem ponto"}</span>
      {gerente&&<span><strong>Gerente:</strong> {gerente}</span>}
      {!ponto&&gerente&&item.transferenciaStatus===TRANSFERENCIA_GERENTE.recebido&&<small>Em estoque do gerente</small>}
      {!ponto&&gerente&&item.transferenciaStatus===TRANSFERENCIA_GERENTE.aguardando&&<small>Aguardando confirmação</small>}
    </div>
  );
}

function baixarJSON(nomeArquivo, dados){
  const url=URL.createObjectURL(new Blob([JSON.stringify(dados,null,2)],{type:"application/json"}));
  const link=document.createElement("a");
  link.href=url;link.download=nomeArquivo;document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function chaveBackupPerfil(perfil){
  return `stockon_backup_obrigatorio_${perfil?.userId||perfil?.loginNome||perfil?.nome||"usuario"}`;
}
function registrarBackupPerfil(perfil){
  const agoraISO=isoAgora();
  try{localStorage.setItem(chaveBackupPerfil(perfil),agoraISO);}catch{}
  return agoraISO;
}
function slugArquivoBackup(texto){
  return String(texto||"stock-on").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,40)||"stock-on";
}

async function gerarPDF(configuracao) {
  const { gerarRelatorioPDF } = await import("./pdfReports.js");
  return gerarRelatorioPDF(configuracao);
}

async function exportarEquipamentosExcel(itens){
  const dados=itens.map(i=>({
    "Nome":i.nome,"Categoria":i.categoria,
    "Status":i.status,"Ponto / Localização":i.localizacao||"—",
    "Responsável":i.responsavel||"—",
    "Observação":i.observacao||"—","Data Cadastro":i.dataCadastro||"—",
  }));
  exportarCsvSeguro(dados,`equipamentos_${hoje()}.csv`);
}

async function exportarEquipamentosPDF(itens){
  const ordenados=ordenarEquipamentos(itens);
  await gerarPDF({
    titulo:"Relatório de Equipamentos",
    descricao:"Inventário operacional e localização atual dos equipamentos",
    nomeArquivo:`neptera_equipamentos_${hoje()}.pdf`,
    total:itens.length,
    resumo:[
      {label:"Cadastrados",valor:itens.length},
      {label:"Disponíveis",valor:itens.filter(i=>i.status==="Disponível").length,destaque:[5,150,82]},
      {label:"Em rota",valor:itens.filter(i=>i.status==="Em rota").length,destaque:[37,99,235]},
      {label:"Em conserto",valor:itens.filter(i=>i.status==="Em conserto").length,destaque:[201,125,0]},
    ],
    colunas:["Equipamento","Categoria","Status","Ponto / Localização","Responsável"],
    linhas:ordenados.map(i=>[i.nome,i.categoria,i.status,i.localizacao||"Sem ponto",i.responsavel||"-"]),
  });
}

async function exportarHistoricoExcel(historico){
  const dados=historico.map(h=>({
    "Tipo":HIST_CFG[h.tipo]?.label||h.tipo,"Equipamento":h.itemNome,"Categoria":h.categoria,
    "Qtd Antes":h.qtdAntes,"Qtd Depois":h.qtdDepois,
    "Responsável":h.responsavel||"—","Observação":h.observacao||"—","Data":h.data,
  }));
  exportarCsvSeguro(dados,`historico_equipamentos_${hoje()}.csv`);
}

async function exportarHistoricoPDF(historico){
  await gerarPDF({
    titulo:"Histórico de Equipamentos",
    descricao:"Rastreabilidade de cadastros e movimentações operacionais",
    nomeArquivo:`neptera_historico_equipamentos_${hoje()}.pdf`,
    total:historico.length,
    resumo:[
      {label:"Movimentações",valor:historico.length},
      {label:"Envios a ponto",valor:historico.filter(h=>h.tipo==="ponto").length,destaque:[37,99,235]},
      {label:"Cadastros",valor:historico.filter(h=>h.tipo==="cadastro").length,destaque:[5,150,82]},
    ],
    colunas:["Tipo","Equipamento","Categoria","Responsável","Detalhe","Data"],
    linhas:historico.map(h=>[HIST_CFG[h.tipo]?.label||h.tipo,h.itemNome,h.categoria,h.responsavel||"-",h.observacao||"-",h.data]),
  });
}

function formatarDataHoraTimeline(timestamp, fallback = "") {
  if(!timestamp)return fallback||"—";
  const data = new Date(timestamp);
  if(Number.isNaN(data.getTime()))return fallback||"—";
  return data.toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});
}

async function exportarTimelineExcel(eventos){
  const dados=eventos.map(evento=>({
    "Data e hora":formatarDataHoraTimeline(evento.timestamp,evento.legacyDate),
    "Módulo":evento.moduleLabel||evento.module||"—",
    "Ação":evento.eventLabel||evento.title||evento.eventType||"—",
    "Entidade":evento.entity?.name||"—",
    "Responsável operacional":evento.responsible||"—",
    "Origem":evento.origin||"—",
    "Destino":evento.destination||"—",
    "Resumo":evento.summary||"—",
  }));
  exportarCsvSeguro(dados,`historico_operacional_${hoje()}.csv`);
}

async function exportarTimelinePDF(eventos){
  await gerarPDF({
    titulo:"Histórico operacional",
    descricao:"Recorte pesquisado e filtrado de Equipamentos e Pontos",
    nomeArquivo:`neptera_historico_operacional_${hoje()}.pdf`,
    total:eventos.length,
    resumo:[
      {label:"Eventos",valor:eventos.length},
      {label:"Equipamentos",valor:eventos.filter(evento=>evento.module==="equipment").length,destaque:[46,116,123]},
      {label:"Pontos",valor:eventos.filter(evento=>evento.module==="point").length,destaque:[145,123,88]},
    ],
    colunas:["Data e hora","Módulo","Ação","Entidade","Contexto"],
    linhas:eventos.map(evento=>[
      formatarDataHoraTimeline(evento.timestamp,evento.legacyDate),
      evento.moduleLabel||evento.module||"—",
      evento.eventLabel||evento.title||evento.eventType||"—",
      evento.entity?.name||"—",
      [evento.origin&&`Origem: ${evento.origin}`,evento.destination&&`Destino: ${evento.destination}`,evento.responsible&&`Responsável: ${evento.responsible}`,evento.summary].filter(Boolean).join(" · ")||"—",
    ]),
  });
}

function RelatoriosPage({ itens, pontos, historico, historicoPontos, perfilAtual }) {
  const gerentes = [...new Set([...GERENTES, ...pontos.map(p=>gerenteDaRota(p.gerente)).filter(Boolean)])].sort((a,b)=>a.localeCompare(b));
  const [gerenteSelecionado, setGerenteSelecionado] = useState("");
  const gerente = gerentes.includes(gerenteSelecionado) ? gerenteSelecionado : gerentes[0]||"";
  const disponiveis = itens.filter(i=>i.status==="Disponível");
  const despesas = lista => lista.reduce((total,p)=>total+(p.possuiDespesa==="sim"?Number(p.valorDespesa||0):0),0);
  const emConserto = itens.filter(i=>i.status==="Em conserto");
  const pendentesConfirmacao = itens.filter(i=>i.transferenciaStatus===TRANSFERENCIA_GERENTE.aguardando);
  const terminaisDisponiveis = itens.filter(i=>i.categoria==="Terminais"&&i.status==="Disponível").length;
  const pontosComEquipamento = new Set(itens.filter(i=>i.localizacao).map(i=>normalizarTexto(i.localizacao)));
  const pontosSemEquipamento = pontos.filter(p=>!pontosComEquipamento.has(normalizarTexto(p.nomeFantasia)));
  const historicoRecente = historico.slice(0, 6);
  const rankingGerentes = gerentes.map(nome=>{
    const listaPontos = pontos.filter(p=>rotaPertenceAoGerente(p.gerente,nome));
    const locais = new Set(listaPontos.map(p=>normalizarTexto(p.nomeFantasia)));
    const listaEquipamentos = itens.filter(i=>locais.has(normalizarTexto(i.localizacao))||normalizarTexto(i.gerenteResponsavel)===normalizarTexto(nome));
    const pendentes = itens.filter(i=>normalizarTexto(i.gerenteResponsavel)===normalizarTexto(nome)&&i.transferenciaStatus===TRANSFERENCIA_GERENTE.aguardando).length;
    return {nome, pontos:listaPontos.length, equipamentos:listaEquipamentos.length, pendentes, despesas:despesas(listaPontos)};
  }).sort((a,b)=>b.pendentes-a.pendentes||b.equipamentos-a.equipamentos||a.nome.localeCompare(b.nome));
  const pontosGerente = pontos.filter(p=>rotaPertenceAoGerente(p.gerente,gerente));
  const locaisGerente = new Set(pontosGerente.map(p=>p.nomeFantasia));
  const equipamentosGerente = itens.filter(i=>locaisGerente.has(i.localizacao));
  const linhasEquipamentos = lista => ordenarEquipamentos(lista).map(i=>[
    i.nome, i.categoria, i.status, i.localizacao||"Sem ponto", i.responsavel||"-",
  ]);
  const linhasPontos = lista => ordenarPontos(lista).map(p=>[
    p.nomeFantasia, p.nomeDono, rotaCanonica(p.gerente),
    itens.filter(i=>i.localizacao===p.nomeFantasia).length,
    p.possuiDespesa==="sim"?formatarMoedaPDF(p.valorDespesa):"",
  ]);

  async function gerarCompleto() {
    await gerarPDF({
      titulo:"Relatório Geral",
      descricao:"Visão completa da operação, equipamentos e pontos cadastrados",
      nomeArquivo:`neptera_relatorio_geral_${hoje()}.pdf`,
      total:itens.length+pontos.length,
      resumo:[
        {label:"Equipamentos",valor:itens.length},
        {label:"Disponíveis",valor:disponiveis.length,destaque:[5,150,82]},
        {label:"Em rota",valor:itens.filter(i=>i.status==="Em rota").length,destaque:[37,99,235]},
        {label:"Em conserto",valor:itens.filter(i=>i.status==="Em conserto").length,destaque:[201,125,0]},
        {label:"Pontos",valor:pontos.length},
        {label:"Despesas",valor:formatarMoedaPDF(despesas(pontos)),destaque:[201,125,0]},
      ],
      secoes:[
        {
          titulo:"Equipamentos",
          colunas:["Equipamento","Categoria","Status","Ponto / Localização","Responsável"],
          linhas:linhasEquipamentos(itens),
        },
        {
          titulo:"Pontos",
          colunas:["Nome Fantasia","Dono","Gerente","Equipamentos","Valor da despesa"],
          linhas:linhasPontos(pontos),
        },
      ],
    });
  }

  async function gerarPontos() {
    await gerarPDF({
      titulo:"Relatório de Pontos",
      descricao:"Pontos cadastrados, gerentes, equipamentos vinculados e despesas",
      nomeArquivo:`neptera_pontos_${hoje()}.pdf`,
      total:pontos.length,
      resumo:[
        {label:"Pontos",valor:pontos.length},
        {label:"Com despesa",valor:pontos.filter(p=>p.possuiDespesa==="sim").length,destaque:[201,125,0]},
        {label:"Sem despesa",valor:pontos.filter(p=>p.possuiDespesa!=="sim").length,destaque:[5,150,82]},
        {label:"Despesa total",valor:formatarMoedaPDF(despesas(pontos)),destaque:[201,125,0]},
      ],
      colunas:["Nome Fantasia","Dono","Gerente","Equipamentos","Valor da despesa"],
      linhas:linhasPontos(pontos),
    });
  }

  async function gerarDisponiveis() {
    await gerarPDF({
      titulo:"Equipamentos Disponíveis",
      descricao:"Equipamentos prontos para serem enviados a um ponto",
      nomeArquivo:`neptera_disponiveis_${hoje()}.pdf`,
      total:disponiveis.length,
      resumo:[
        {label:"Disponíveis",valor:disponiveis.length,destaque:[5,150,82]},
        ...CATEGORIAS.map(categoria=>({
          label:categoria,
          valor:disponiveis.filter(i=>i.categoria===categoria).length,
        })),
      ],
      colunas:["Equipamento","Categoria","Status","Ponto / Localização","Responsável"],
      linhas:linhasEquipamentos(disponiveis),
    });
  }

  async function gerarPorGerente() {
    await gerarPDF({
      titulo:`Relatório do Gerente - ${gerente}`,
      descricao:"Pontos sob responsabilidade e equipamentos atualmente vinculados",
      nomeArquivo:`neptera_gerente_${gerente.toLowerCase().replace(/\s+/g,"-")}_${hoje()}.pdf`,
      total:pontosGerente.length+equipamentosGerente.length,
      resumo:[
        {label:"Gerente",valor:gerente},
        {label:"Pontos",valor:pontosGerente.length},
        {label:"Equipamentos",valor:equipamentosGerente.length,destaque:[37,99,235]},
        {label:"Despesas",valor:formatarMoedaPDF(despesas(pontosGerente)),destaque:[201,125,0]},
      ],
      secoes:[
        {
          titulo:`Pontos de ${gerente}`,
          colunas:["Nome Fantasia","Dono","Gerente","Equipamentos","Valor da despesa"],
          linhas:linhasPontos(pontosGerente),
        },
        {
          titulo:"Equipamentos nos pontos do gerente",
          colunas:["Equipamento","Categoria","Status","Ponto / Localização","Responsável"],
          linhas:linhasEquipamentos(equipamentosGerente),
        },
      ],
    });
  }

  function exportarBackup() {
    baixarJSON(`stock-on_backup_${hoje()}.json`, {
      sistema:"Stock-ON",
      geradoEm:agora(),
      equipamentos:itens,
      pontos,
      historicoEquipamentos:historico,
      historicoPontos,
    });
  }

  return(
    <div className="relatorios-painel">
      <section className="relatorios-intro">
        <div>
          <span className="dash-kicker">Central operacional</span>
          <h2>O que precisa de atenção agora?</h2>
          <p>Um painel rápido para ver pendências, rotas, estoque e gerar documentos quando precisar prestar conta.</p>
        </div>
        <div className="relatorios-resumo">
          <strong>{itens.length}</strong><small>equipamentos</small>
          <strong>{pontos.length}</strong><small>pontos</small>
        </div>
      </section>

      <section className="central-kpis">
        <article className={`central-kpi ${pendentesConfirmacao.length?"central-kpi-alerta":""}`}>
          <span><Icon name="mail" /></span>
          <div><strong>{pendentesConfirmacao.length}</strong><small>envios aguardando gerente</small></div>
        </article>
        <article className="central-kpi">
          <span><Icon name="monitor" /></span>
          <div><strong>{terminaisDisponiveis}</strong><small>terminais disponíveis</small></div>
        </article>
        <article className="central-kpi">
          <span><Icon name="wrench" /></span>
          <div><strong>{emConserto.length}</strong><small>equipamentos em conserto</small></div>
        </article>
        <article className="central-kpi">
          <span><Icon name="mapPin" /></span>
          <div><strong>{pontosSemEquipamento.length}</strong><small>pontos sem equipamento vinculado</small></div>
        </article>
      </section>

      <section className="central-grid">
        <article className="central-card central-card-prioridade">
          <div className="central-card-topo">
            <span className="dash-kicker">Prioridades</span>
            <strong>Ação imediata</strong>
          </div>
          {pendentesConfirmacao.length===0&&emConserto.length===0
            ?<p className="dash-vazio">Sem pendências críticas no momento. Operação respirando bem.</p>
            :<div className="central-lista">
              {pendentesConfirmacao.slice(0,4).map(item=><div key={item.id} className="central-item">
                <span><Icon name="mail" /></span><div><strong>{item.nome}</strong><small>Aguardando confirmação de {item.gerenteResponsavel||"gerente"}</small></div>
              </div>)}
              {emConserto.slice(0,3).map(item=><div key={item.id} className="central-item">
                <span><Icon name="wrench" /></span><div><strong>{item.nome}</strong><small>{item.nome} está em conserto</small></div>
              </div>)}
            </div>}
        </article>

        <article className="central-card">
          <div className="central-card-topo">
            <span className="dash-kicker">Gerentes</span>
            <strong>Rotas e carteira</strong>
          </div>
          {rankingGerentes.length===0
            ?<p className="dash-vazio">Nenhum gerente cadastrado ainda.</p>
            :<div className="central-lista">
              {rankingGerentes.slice(0,5).map(g=><div key={g.nome} className="central-item central-item-gerente">
                <span><Icon name="user" /></span>
                <div><strong>{g.nome}</strong><small>{g.pontos} pontos · {g.equipamentos} equipamentos · {formatarMoedaPDF(g.despesas)}</small></div>
                {g.pendentes>0&&<em>{g.pendentes} pend.</em>}
              </div>)}
            </div>}
        </article>

        <article className="central-card">
          <div className="central-card-topo">
            <span className="dash-kicker">Checklist</span>
            <strong>Conferência do dia</strong>
          </div>
          <div className="central-checklist">
            <label><input type="checkbox" readOnly checked={pendentesConfirmacao.length===0}/> Confirmar envios pendentes</label>
            <label><input type="checkbox" readOnly checked={pontosSemEquipamento.length===0}/> Revisar pontos sem equipamento</label>
            <label><input type="checkbox" readOnly checked={emConserto.length===0}/> Acompanhar itens em conserto</label>
          </div>
        </article>

        <article className="central-card">
          <div className="central-card-topo">
            <span className="dash-kicker">Movimento</span>
            <strong>Últimas ações</strong>
          </div>
          {historicoRecente.length===0
            ?<p className="dash-vazio">Nenhum histórico registrado.</p>
            :<div className="central-lista">
              {historicoRecente.map(h=><div key={h.id} className="central-item">
                <span><Icon name={HIST_ICONES[h.tipo] || "fileText"} /></span><div><strong>{h.itemNome}</strong><small>{HIST_CFG[h.tipo]?.label||h.tipo} · {h.data}</small></div>
              </div>)}
            </div>}
        </article>
      </section>

      <div className="secao-titulo-linha"><span>Exportações e backup</span></div>
      <section className="relatorios-grid">
        <article className="relatorio-card relatorio-destaque">
          <span className="relatorio-icone"><Icon name="fileText"/></span>
          <h3>Tudo</h3>
          <p>Resumo geral, lista de equipamentos e lista de pontos em um único PDF.</p>
          <button className="btn-primario" onClick={gerarCompleto}>Gerar PDF completo</button>
        </article>
        <article className="relatorio-card">
          <span className="relatorio-icone"><Icon name="package"/></span>
          <h3>Equipamentos</h3>
          <p>Inventário completo com status e localização atual.</p>
          <button className="btn-secundario" onClick={()=>exportarEquipamentosPDF(itens)}>Gerar equipamentos</button>
        </article>
        <article className="relatorio-card">
          <span className="relatorio-icone"><Icon name="mapPin"/></span>
          <h3>Pontos</h3>
          <p>Estabelecimentos, despesas, gerentes e quantidade de equipamentos.</p>
          <button className="btn-secundario" onClick={gerarPontos}>Gerar pontos</button>
        </article>
        <article className="relatorio-card">
          <span className="relatorio-icone"><Icon name="check"/></span>
          <h3>Disponíveis</h3>
          <p>Somente os {disponiveis.length} equipamentos disponíveis para envio.</p>
          <button className="btn-secundario" onClick={gerarDisponiveis}>Gerar disponíveis</button>
        </article>
        <article className="relatorio-card relatorio-gerente">
          <span className="relatorio-icone"><Icon name="user"/></span>
          <h3>Por gerente</h3>
          <p>Veja os pontos e equipamentos ligados a uma pessoa responsável.</p>
          <select className="select-filtro" value={gerente} onChange={e=>setGerenteSelecionado(e.target.value)}>
            {gerentes.length===0
              ?<option value="">Nenhum gerente cadastrado</option>
              :gerentes.map(nome=><option key={nome} value={nome}>{nome}</option>)}
          </select>
          <button className="btn-secundario" onClick={gerarPorGerente} disabled={!gerente}>Gerar por gerente</button>
        </article>
        {perfilAtual?.perfil==="administrador"&&<article className="relatorio-card relatorio-backup">
          <span className="relatorio-icone"><Icon name="database"/></span>
          <h3>Backup completo</h3>
          <p>Baixa equipamentos, pontos e históricos em arquivo de segurança para guardar fora do sistema.</p>
          <button className="btn-secundario" onClick={exportarBackup}>Baixar backup</button>
        </article>}
      </section>
    </div>
  );
}

function BuscaGlobalSearch({ consulta, onConsulta, itens, pontos, historico, onVerEquipamento, onAbrirPontos }) {
  const containerRef=useRef(null);
  const termo=consulta.trim().toLowerCase();
  const equipamentos=termo?itens.filter(i=>[i.nome,i.categoria,i.status,i.localizacao,i.responsavel].some(v=>(v||"").toLowerCase().includes(termo))).slice(0,6):[];
  const pontosEncontrados=termo?pontos.filter(p=>[p.nomeFantasia,p.nomeDono,p.gerente,rotaCanonica(p.gerente),gerenteDaRota(p.gerente),p.telefone,...p.modalidades].some(v=>(v||"").toLowerCase().includes(termo))).slice(0,6):[];
  const movimentos=termo?historico.filter(h=>[h.itemNome,h.categoria,h.tipo,h.responsavel,h.observacao].some(v=>(v||"").toLowerCase().includes(termo))).slice(0,6):[];
  const totalResultados=equipamentos.length+pontosEncontrados.length+movimentos.length;
  useEffect(()=>{
    if(!termo)return undefined;
    function fecharAoClicarFora(evento){
      if(containerRef.current&&!containerRef.current.contains(evento.target))onConsulta("");
    }
    document.addEventListener("pointerdown",fecharAoClicarFora);
    return()=>document.removeEventListener("pointerdown",fecharAoClicarFora);
  },[onConsulta,termo]);
  return(
    <div className="busca-topo-wrap" ref={containerRef} role="search" aria-label="Busca global" onKeyDown={evento=>{if(evento.key==="Escape"&&termo){evento.preventDefault();onConsulta("");}}}>
      <label className="sr-only" htmlFor="neptera-global-search-input">Buscar em equipamentos, pontos e movimentações</label>
      <div className="busca-topo-control">
        <Icon name="search"/>
        <input id="neptera-global-search-input" className="busca-topo-input" type="search" autoComplete="off" placeholder="Buscar no NEPTERA" value={consulta} onChange={e=>onConsulta(e.target.value)} aria-expanded={Boolean(termo)} aria-controls="neptera-global-search-results"/>
        {consulta&&<button type="button" className="busca-topo-clear" onClick={()=>onConsulta("")} aria-label="Limpar busca global"><Icon name="close"/></button>}
      </div>
      {termo&&(
        <div className="busca-topo-resultados" id="neptera-global-search-results" role="region" aria-label={`${totalResultados} resultado${totalResultados===1?"":"s"} na busca global`} aria-live="polite">
          <div className="busca-topo-head">
            <strong>Busca geral</strong>
            <button type="button" onClick={()=>onConsulta("")}>Limpar</button>
          </div>
          {totalResultados===0?<p className="busca-topo-vazio">Nenhum resultado encontrado.</p>:<>
            {equipamentos.length>0&&<section><span>Equipamentos</span>{equipamentos.map(i=><button key={i.id} className="busca-topo-item" type="button" onClick={()=>{onVerEquipamento(i);onConsulta("");}}><strong>{i.nome}</strong><small>{i.status} · {i.localizacao||"Sem ponto"}</small></button>)}</section>}
            {pontosEncontrados.length>0&&<section><span>Pontos</span>{pontosEncontrados.map(p=><button key={p.id} className="busca-topo-item" type="button" onClick={()=>{onAbrirPontos();onConsulta("");}}><strong>{p.nomeFantasia}</strong><em>{rotaCanonica(p.gerente)}</em><small>{p.telefone||"Sem telefone"}</small></button>)}</section>}
            {movimentos.length>0&&<section><span>Movimentações</span>{movimentos.map(h=><div key={h.id} className="busca-topo-item busca-topo-item-fixo"><strong>{h.itemNome}</strong><em>{HIST_CFG[h.tipo]?.label||h.tipo}</em><small>{h.data}</small></div>)}</section>}
          </>}
        </div>
      )}
    </div>
  );
}

function valorDespesaPrestacao(despesa) {
  return Number(despesa.valorReal || despesa.valorPrevisto || 0);
}

function perfilBancoPix(banco = "") {
  const b = normalizarTexto(banco);
  if (b.includes("dig")) return { nome: "Digio", icone: "D", classe: "pix-banco-digio" };
  if (b.includes("neon")) return { nome: "Neon", icone: "neon", classe: "pix-banco-neon" };
  if (b.includes("nu pagamentos") || b.includes("nubank") || b === "nu") return { nome: "Nu", icone: "Nu", classe: "pix-banco-nu" };
  if (b.includes("bradesco")) return { nome: "Bradesco", icone: "B", classe: "pix-banco-bradesco" };
  if (b.includes("itau") || b.includes("itaú")) return { nome: "Itaú", icone: "I", classe: "pix-banco-itau" };
  if (b.includes("santander")) return { nome: "Santander", icone: "S", classe: "pix-banco-santander" };
  if (b.includes("caixa")) return { nome: "Caixa", icone: "Cx", classe: "pix-banco-caixa" };
  if (b.includes("brasil")) return { nome: "Banco do Brasil", icone: "BB", classe: "pix-banco-bb" };
  return { nome: banco || "Banco", icone: "PIX", classe: "pix-banco-outro" };
}

const PIX_CARTOES_PADRAO = [
  { id:"pix-digio-anderson", banco:"Banco Digío S.A.", nome:"Anderson", tipo:"Aleatória", chave:"b1dcb47f-2859-4688-836c-419b056361ba", visual:{ nome:"Digio", icone:"digio", classe:"pix-banco-digio" } },
  { id:"pix-nu-albertino", banco:"Nu Pagamentos S.A", nome:"Albertino", tipo:"Aleatória", chave:"4c0bb510-b006-4e61-a753-7cc0e9e3d391", visual:{ nome:"Nu", icone:"Nu", classe:"pix-banco-nu" } },
  { id:"pix-neon-sabrina", banco:"Neon Pagamentos S.A", nome:"Sabrina", tipo:"Aleatória", chave:"7aeaf6f5-d457-4b21-b0d3-2cb2956ea7fa", visual:{ nome:"Neon", icone:"neon", classe:"pix-banco-neon" } },
];

function pixDentroDoPrazo(aviso) {
  return Boolean(aviso?.pixChave);
}

const FECHAMENTO_CORES = ["Alex", "Central/Uibai", "Lapão", "América Dourada", "Eliana", "Queixo", "Wene", "João Luis", "Beu"];
const MODALIDADES_FECHAMENTO = [
  { id: "90-da-sorte", nome: "90 da Sorte", comissao: 0.10, descricao: "10% de comissão", logo: logo90DaSorte },
  { id: "viapix", nome: "Viapix", comissao: null, descricao: "Comissão preenchida manualmente", logo: logoViapix },
  { id: "lotobanca", nome: "Lotobanca", comissao: 0.20, descricao: "20% de comissão", logo: logoLotobanca },
];

function modalidadesFechamentoPara(gerente="", rota="") {
  const yago = normalizarTexto(gerente) === "yago";
  const ibitita = normalizarTexto(rota).includes("ibitita");
  if (yago && ibitita) {
    return [
      { ...MODALIDADES_FECHAMENTO[0], legacyIds:[...(MODALIDADES_FECHAMENTO[0].legacyIds || [])] },
      { ...MODALIDADES_FECHAMENTO[1], legacyIds:["viapix"] },
      {
        id: "viapix-lem",
        nome: "Viapix/LEM",
        comissao: null,
        descricao: "Comissão preenchida manualmente",
        logo: logoViapix,
        legacyIds:[],
      },
      { ...MODALIDADES_FECHAMENTO[2], legacyIds:[...(MODALIDADES_FECHAMENTO[2].legacyIds || [])] },
    ];
  }
  return MODALIDADES_FECHAMENTO.map(m => ({ ...m, legacyIds:[...(m.legacyIds || [])] }));
}

function criarFechamentoVazio(modalidades = MODALIDADES_FECHAMENTO) {
  return modalidades.reduce((acc, modalidade) => {
    acc[modalidade.id] = {
      entrada: "",
      comissao: "",
      saida: "",
      comissaoAutomatica: modalidade.comissao !== null,
      percentualComissao: modalidade.comissao !== null ? String(modalidade.comissao * 100) : "",
    };
    return acc;
  }, {});
}

function competenciaFechamentoPadrao() {
  const data = new Date();
  data.setDate(1);
  data.setMonth(data.getMonth() - 1);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
}

function numeroFechamento(valor) {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;
  const texto = String(valor || "")
    .trim()
    .replace(/[^\d,.-]/g, "");
  if (!texto) return 0;
  const ultimoPonto = texto.lastIndexOf(".");
  const ultimaVirgula = texto.lastIndexOf(",");
  let normalizado = texto;

  if (ultimoPonto >= 0 && ultimaVirgula >= 0) {
    normalizado = ultimoPonto > ultimaVirgula
      ? texto.replace(/,/g, "")
      : texto.replace(/\./g, "").replace(",", ".");
  } else if (ultimaVirgula >= 0) {
    normalizado = texto.replace(/\./g, "").replace(",", ".");
  } else if (ultimoPonto >= 0) {
    const decimais = texto.length - ultimoPonto - 1;
    normalizado = decimais > 0 && decimais <= 2 ? texto : texto.replace(/\./g, "");
  }

  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : 0;
}

function textoFechamentoSalvo(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero.toFixed(2) : "";
}

function textoMoedaFechamento(valor) {
  return formatarMoedaPDF(numeroFechamento(valor));
}

function permiteComissaoExtra(gerente, rota) {
  if (normalizarTexto(gerente) !== "yago") return false;
  return ["miroros", "ibitita"].includes(normalizarTexto(rota));
}

function encontrarFechamentoDaModalidade(lista, modalidade, filtro) {
  const ids = [modalidade.id, ...(modalidade.legacyIds || [])];
  return lista.find(f => filtro(f) && ids.includes(f.modalidade));
}

function corFechamento(gerente) {
  const rotas = ROTAS_POR_GERENTE[gerente] || [];
  const chave = rotas[0] || gerente || FECHAMENTO_CORES[0];
  return GERENTE_CORES[chave] || GERENTE_CORES[FECHAMENTO_CORES[0]] || { bg:"rgba(37,99,235,0.12)", color:"#2563eb", border:"rgba(37,99,235,0.28)" };
}

function formatarTamanhoArquivo(bytes) {
  const total = Number(bytes) || 0;
  if (total < 1024) return `${total} B`;
  if (total < 1024 * 1024) return `${(total / 1024).toFixed(1)} KB`;
  return `${(total / (1024 * 1024)).toFixed(1)} MB`;
}

const APP_TIPOS_90_DA_SORTE = [
  { id: "tv", label: "APK da TV" },
  { id: "terminal", label: "APK do Terminal" },
];

const MODALIDADES_SEM_APP = new Set(["Play Bet", "Máquina de Brindes", "Jogo do Bicho"]);

function chaveAppModalidade(modalidade, appTipo = "padrao") {
  return `${modalidade}::${appTipo || "padrao"}`;
}

function SenhasModalidadesPage({ perfilAtual, acessos = [], apps = [], onAcessosChange, onAppsChange }) {
  const administrador = perfilAtual?.perfil === "administrador";
  const gerenteAtual = perfilAtual?.perfil === "gerente" ? (perfilAtual.gerenteNome || perfilAtual.nome || "") : "";
  const [form, setForm] = useState({ gerente: GERENTES[0] || "", modalidade: MODALIDADES[0] || "", login: "", senha: "", link: "", observacao: "" });
  const [appForm, setAppForm] = useState({ modalidade: MODALIDADES[0] || "", appTipo: "terminal", arquivo: null, linkExterno: "" });
  const [senhasVisiveis, setSenhasVisiveis] = useState({});
  const [salvando, setSalvando] = useState(false);
  const [enviandoApp, setEnviandoApp] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [areaAtiva, setAreaAtiva] = useState("credenciais");
  const [buscaCredencial, setBuscaCredencial] = useState("");
  const [filtroGerenteCredencial, setFiltroGerenteCredencial] = useState("todos");
  const [filtroModalidadeCredencial, setFiltroModalidadeCredencial] = useState("todas");
  const [filtrosCredenciaisAbertos, setFiltrosCredenciaisAbertos] = useState(false);
  const acessosVisiveis = administrador ? acessos : acessos.filter(a => normalizarTexto(a.gerente) === normalizarTexto(gerenteAtual));
  const gerentesComAcesso = [...new Set(acessosVisiveis.map(acesso=>acesso.gerente).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt-BR"));
  const modalidadesComAcesso = [...new Set(acessosVisiveis.map(acesso=>acesso.modalidade).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt-BR"));
  const acessosFiltrados = useMemo(()=>{
    const termo=normalizarTexto(buscaCredencial);
    return acessosVisiveis.filter(acesso=>{
      if(administrador&&filtroGerenteCredencial!=="todos"&&acesso.gerente!==filtroGerenteCredencial)return false;
      if(filtroModalidadeCredencial!=="todas"&&acesso.modalidade!==filtroModalidadeCredencial)return false;
      if(!termo)return true;
      return [acesso.gerente,acesso.modalidade,acesso.login,acesso.observacao].some(valor=>normalizarTexto(valor).includes(termo));
    });
  },[acessosVisiveis,administrador,buscaCredencial,filtroGerenteCredencial,filtroModalidadeCredencial]);
  const filtrosAtivosCredenciais=(administrador&&filtroGerenteCredencial!=="todos"?1:0)+(filtroModalidadeCredencial!=="todas"?1:0);
  const appsPorModalidade = new Map(apps.map(app => [chaveAppModalidade(app.modalidade, app.appTipo), app]));

  function selecionarAcesso(acesso) {
    setForm({
      gerente: acesso.gerente || GERENTES[0] || "",
      modalidade: acesso.modalidade || MODALIDADES[0] || "",
      login: acesso.login || "",
      senha: acesso.senha || "",
      link: acesso.link || "",
      observacao: acesso.observacao || "",
      id: acesso.id,
    });
    setOk("");
    setErro("");
  }

  async function copiar(texto, label) {
    if (!texto) return;
    try {
      await navigator.clipboard.writeText(texto);
      setErro("");
      setOk(`${label} copiado.`);
    } catch {
      setOk("");
      setErro(`Não foi possível copiar ${label.toLowerCase()}.`);
    }
  }

  async function salvarAcesso(e) {
    e.preventDefault();
    if (!administrador) return;
    setErro("");
    setOk("");
    setSalvando(true);
    try {
      const salvo = await salvarGerenteModalidadeAcesso(form);
      onAcessosChange?.([
        salvo,
        ...acessos.filter(a => Number(a.id) !== Number(salvo.id) && !(normalizarTexto(a.gerente) === normalizarTexto(salvo.gerente) && a.modalidade === salvo.modalidade)),
      ]);
      setForm({ gerente: form.gerente, modalidade: form.modalidade, login: "", senha: "", link: "", observacao: "" });
      setOk("Senha da modalidade salva.");
    } catch (err) {
      setErro(err.message || "Não foi possível salvar a senha.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluirAcesso(acesso) {
    if (!administrador || !acesso?.id) return;
    if (!window.confirm(`Excluir acesso de ${acesso.gerente} em ${acesso.modalidade}?`)) return;
    setErro("");
    setOk("");
    try {
      await excluirGerenteModalidadeAcesso(acesso.id);
      onAcessosChange?.(acessos.filter(a => Number(a.id) !== Number(acesso.id)));
      setOk("Acesso removido.");
    } catch (err) {
      setErro(err.message || "Não foi possível remover o acesso.");
    }
  }

  async function enviarApp(e) {
    e.preventDefault();
    if (!administrador) return;
    setErro("");
    setOk("");
    setEnviandoApp(true);
    try {
      const salvo = await enviarModalidadeApp(appForm);
      const atualizados = await carregarModalidadeApps();
      onAppsChange?.(atualizados.length ? atualizados : [salvo, ...apps.filter(app => chaveAppModalidade(app.modalidade, app.appTipo) !== chaveAppModalidade(salvo.modalidade, salvo.appTipo))]);
      setAppForm({ modalidade: appForm.modalidade, appTipo: appForm.appTipo, arquivo: null, linkExterno: "" });
      e.currentTarget.reset();
      setOk(appForm.linkExterno.trim() ? "Link do app salvo para download dos gerentes." : "APK enviado para download dos gerentes.");
    } catch (err) {
      setErro(err.message || "Não foi possível enviar o APK.");
    } finally {
      setEnviandoApp(false);
    }
  }

  async function baixarApp(app) {
    try {
      const url = await obterLinkDownloadModalidadeApp(app);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      alert(err.message || "Não foi possível baixar o app.");
    }
  }

  return (
    <section className="senhas-page senhas-cf-page">
      <div className="senhas-cf-commandline">
        <nav aria-label="Área do cofre operacional">
          <button type="button" className={areaAtiva==="credenciais"?"is-active":""} aria-current={areaAtiva==="credenciais"?"page":undefined} onClick={()=>setAreaAtiva("credenciais")}><Icon name="shieldKey"/><span>Credenciais</span><b>{acessosVisiveis.length}</b></button>
          <button type="button" className={areaAtiva==="aplicativos"?"is-active":""} aria-current={areaAtiva==="aplicativos"?"page":undefined} onClick={()=>setAreaAtiva("aplicativos")}><Icon name="download"/><span>Aplicativos</span><b>{apps.length}</b></button>
        </nav>
        <span className="senhas-cf-scope"><small>Escopo atual</small><strong>{administrador ? "Administração" : gerenteAtual}</strong></span>
      </div>

      {(erro||ok)&&<div className={`senhas-cf-feedback ${erro?"is-error":"is-success"}`} role={erro?"alert":"status"}><Icon name={erro?"warning":"check"}/><span>{erro||ok}</span></div>}

      <div className={`senhas-cf-layout is-${areaAtiva} ${administrador?"has-admin":""}`}>
        <div className={`senhas-cf-workspace is-${areaAtiva}`}>
          {areaAtiva==="credenciais"&&<>
            <FilterBar
              className="senhas-cf-filterbar"
              ariaLabel="Filtrar credenciais"
              activeCount={filtrosAtivosCredenciais}
              secondaryOpen={filtrosCredenciaisAbertos}
              onSecondaryToggle={setFiltrosCredenciaisAbertos}
              onClear={()=>{
                setFiltroGerenteCredencial("todos");
                setFiltroModalidadeCredencial("todas");
              }}
              primary={<>
                <div className="senhas-cf-search">
                  <label className="sr-only" htmlFor="senhas-cf-search-input">Buscar credencial</label>
                  <Icon name="search"/>
                  <input id="senhas-cf-search-input" type="search" value={buscaCredencial} onChange={e=>setBuscaCredencial(e.target.value)} placeholder="Buscar gerente, modalidade ou login"/>
                  {buscaCredencial&&<button type="button" onClick={()=>setBuscaCredencial("")} aria-label="Limpar busca"><Icon name="close"/></button>}
                </div>
                <span className="senhas-cf-result-count"><strong>{acessosFiltrados.length}</strong><span>de {acessosVisiveis.length}</span></span>
              </>}
              secondary={<>
                {administrador&&<label className="senhas-cf-filter-field"><span>Gerente</span><select value={filtroGerenteCredencial} onChange={e=>setFiltroGerenteCredencial(e.target.value)}><option value="todos">Todos os gerentes</option>{gerentesComAcesso.map(gerente=><option key={gerente} value={gerente}>{gerente}</option>)}</select></label>}
                <label className="senhas-cf-filter-field"><span>Modalidade</span><select value={filtroModalidadeCredencial} onChange={e=>setFiltroModalidadeCredencial(e.target.value)}><option value="todas">Todas as modalidades</option>{modalidadesComAcesso.map(modalidade=><option key={modalidade} value={modalidade}>{modalidade}</option>)}</select></label>
              </>}
              chips={filtrosAtivosCredenciais>0?<>
                {administrador&&filtroGerenteCredencial!=="todos"&&<button type="button" className="senhas-cf-filter-chip" onClick={()=>setFiltroGerenteCredencial("todos")}><span>Gerente: {filtroGerenteCredencial}</span><Icon name="close"/></button>}
                {filtroModalidadeCredencial!=="todas"&&<button type="button" className="senhas-cf-filter-chip" onClick={()=>setFiltroModalidadeCredencial("todas")}><span>Modalidade: {filtroModalidadeCredencial}</span><Icon name="close"/></button>}
              </>:null}
            />
            <section className="senhas-cf-ledger">
              <header><div><span className="cf-kicker">Credenciais</span><h3>{administrador?"Acessos cadastrados":"Acessos liberados para você"}</h3></div><b>{acessosFiltrados.length}</b></header>
              {acessosFiltrados.length===0?<div className="cf-empty"><Icon name="key"/><strong>Nenhuma credencial encontrada</strong><span>{acessosVisiveis.length?"Ajuste a busca ou remova os filtros ativos.":"As credenciais aparecerão aqui quando forem liberadas."}</span></div>:<div className="senhas-cf-access-list">
            {acessosFiltrados.map(acesso=>{
              const chave=acesso.id||`${acesso.gerente}-${acesso.modalidade}`;
              const visivel=Boolean(senhasVisiveis[chave]);
              return <article key={chave} className={form.id===acesso.id?"is-selected":""}>
                <span className="senhas-cf-record-icon"><Icon name="shieldKey"/></span>
                <div className="senhas-cf-record-id"><strong>{acesso.modalidade}</strong><small>{acesso.gerente}</small>{acesso.observacao&&<p>{acesso.observacao}</p>}</div>
                <div className="senhas-cf-secret"><span>Login</span><button type="button" onClick={()=>copiar(acesso.login,"Login")} aria-label={`Copiar login de ${acesso.modalidade}`}><Icon name="copy"/>{acesso.login||"Não informado"}</button></div>
                <div className="senhas-cf-secret"><span>Senha</span><button type="button" onClick={()=>copiar(acesso.senha,"Senha")} aria-label={`Copiar senha de ${acesso.modalidade}`}><Icon name="copy"/>{visivel?(acesso.senha||"Não informada"):"••••••••"}</button></div>
                <div className="senhas-cf-record-actions">
                  <button type="button" className="btn-secundario" onClick={()=>setSenhasVisiveis(v=>({...v,[chave]:!visivel}))}><Icon name={visivel?"eyeOff":"eye"}/>{visivel?"Ocultar":"Mostrar"}</button>
                  {acesso.link&&<button className="btn-secundario" type="button" onClick={()=>window.open(acesso.link,"_blank","noopener,noreferrer")}><Icon name="externalLink"/>Abrir</button>}
                  {administrador&&<button className="btn-secundario" type="button" onClick={()=>selecionarAcesso(acesso)}><Icon name="edit"/>Editar</button>}
                  {administrador&&<button className="btn-danger-outline" type="button" onClick={()=>excluirAcesso(acesso)} aria-label={`Excluir acesso de ${acesso.gerente} em ${acesso.modalidade}`}><Icon name="trash"/></button>}
                </div>
              </article>;
            })}
              </div>}
            </section>
          </>}

          {areaAtiva==="aplicativos"&&<section className="senhas-cf-downloads">
            <header><div><span className="cf-kicker">Distribuição</span><h3>Apps das modalidades</h3></div><Icon name="download"/></header>
            <div className="senhas-cf-app-list">
            {MODALIDADES.filter(modalidade=>!MODALIDADES_SEM_APP.has(modalidade)).map(modalidade=>{
              if(modalidade==="90 da Sorte")return <article className="is-group" key={modalidade}><div className="senhas-cf-app-id"><span className="senhas-cf-record-icon"><Icon name="monitor"/></span><span><strong>{modalidade}</strong><small>TV e Terminal</small></span></div><div className="senhas-cf-app-variants">{APP_TIPOS_90_DA_SORTE.map(tipo=>{const app=appsPorModalidade.get(chaveAppModalidade(modalidade,tipo.id));return <div key={tipo.id} className={app?"is-available":""}><span><strong>{tipo.label}</strong><small>{app?`${app.appNome}${app.downloadUrl?" · Link externo":` · ${formatarTamanhoArquivo(app.tamanho)}`}`:"Nenhum APK enviado"}</small></span><button className="btn-secundario" type="button" disabled={!app} onClick={()=>baixarApp(app)}><Icon name="download"/>Baixar</button></div>;})}</div></article>;
              const app=appsPorModalidade.get(chaveAppModalidade(modalidade));
              return <article className={app?"is-available":""} key={modalidade}><div className="senhas-cf-app-id"><span className="senhas-cf-record-icon"><Icon name="terminal"/></span><span><strong>{modalidade}</strong><small>{app?`${app.appNome}${app.downloadUrl?" · Link externo":` · ${formatarTamanhoArquivo(app.tamanho)}`}`:"Nenhum APK enviado"}</small></span></div><button className="btn-secundario" type="button" disabled={!app} onClick={()=>baixarApp(app)}><Icon name="download"/>Baixar app</button></article>;
            })}
            </div>
          </section>}
        </div>

        {administrador&&(
          <div className={`senhas-cf-admin is-${areaAtiva}`}>
            {areaAtiva==="credenciais"&&<form className="senhas-cf-panel senhas-cf-access-editor" onSubmit={salvarAcesso}>
              <header><span className="senhas-cf-panel-icon"><Icon name="key"/></span><div><span className="cf-kicker">Identidade → modalidade</span><h3>{form.id?"Editar acesso":"Cadastrar acesso"}</h3><p>O registro é salvo apenas ao confirmar.</p></div></header>
              <div className="senhas-cf-fields">
                <label><span>Gerente</span><select value={form.gerente} onChange={e=>setForm({...form,gerente:e.target.value})}>{GERENTES.map(g=><option key={g}>{g}</option>)}</select></label>
                <label><span>Modalidade</span><select value={form.modalidade} onChange={e=>setForm({...form,modalidade:e.target.value})}>{MODALIDADES.map(m=><option key={m}>{m}</option>)}</select></label>
                <label><span>Login</span><input value={form.login} onChange={e=>setForm({...form,login:e.target.value})} placeholder="Usuário, e-mail ou código"/></label>
                <label><span>Senha</span><input type="password" autoComplete="off" value={form.senha} onChange={e=>setForm({...form,senha:e.target.value})} placeholder="Senha da modalidade"/></label>
                <label className="is-wide"><span>Link da plataforma</span><input value={form.link} onChange={e=>setForm({...form,link:e.target.value})} placeholder="https://..."/></label>
                <label className="is-wide"><span>Observação</span><input value={form.observacao} onChange={e=>setForm({...form,observacao:e.target.value})} placeholder="Instrução rápida para o gerente"/></label>
              </div>
              <footer><span><Icon name="info"/> Login e senha permanecem ocultos no ledger até a revelação explícita.</span><button className="btn-primario" disabled={salvando}><Icon name="check"/>{salvando?"Salvando...":"Salvar acesso"}</button></footer>
            </form>}

            {areaAtiva==="aplicativos"&&<form className="senhas-cf-panel senhas-cf-app-editor" onSubmit={enviarApp}>
              <header><span className="senhas-cf-panel-icon"><Icon name="download"/></span><div><span className="cf-kicker">Distribuição Android</span><h3>Disponibilizar aplicativo</h3><p>Arquivo local ou link público, nunca os dois.</p></div></header>
              <div className="senhas-cf-fields">
                <label className="is-wide"><span>Modalidade</span><select value={appForm.modalidade} onChange={e=>{const modalidade=e.target.value;const tipoAtualValido=APP_TIPOS_90_DA_SORTE.some(tipo=>tipo.id===appForm.appTipo);setAppForm({...appForm,modalidade,appTipo:modalidade==="90 da Sorte"?(tipoAtualValido?appForm.appTipo:"terminal"):"padrao"});}}>{MODALIDADES.map(m=><option key={m}>{m}</option>)}</select></label>
                {appForm.modalidade==="90 da Sorte"&&<label className="is-wide"><span>Tipo do APK</span><select value={appForm.appTipo} onChange={e=>setAppForm({...appForm,appTipo:e.target.value})}>{APP_TIPOS_90_DA_SORTE.map(tipo=><option key={tipo.id} value={tipo.id}>{tipo.label}</option>)}</select></label>}
                <label className="is-wide"><span>Arquivo APK</span><input type="file" accept=".apk,application/vnd.android.package-archive,application/octet-stream" onChange={e=>setAppForm({...appForm,arquivo:e.target.files?.[0]||null})}/></label>
                <div className="senhas-cf-or"><span>ou</span></div>
                <label className="is-wide"><span>Link externo do APK</span><input type="url" value={appForm.linkExterno} onChange={e=>setAppForm({...appForm,linkExterno:e.target.value})} placeholder="https://drive.google.com/..."/></label>
              </div>
              <footer><span><Icon name="info"/> Escolha um arquivo ou cole um link público para download.</span><button className="btn-primario" disabled={enviandoApp}><Icon name="upload"/>{enviandoApp?"Salvando...":"Salvar APK ou link"}</button></footer>
            </form>}
          </div>
        )}
      </div>
    </section>
  );
}

function PrestacaoGerentePage({ gerenteAtual = "", pontos = [], itens = [], despesas = [], pixEnvios = [], onCopiarPix }) {
  const gerenteNome = gerenteDaRota(gerenteAtual) || gerenteAtual;
  const rotasGerente = ROTAS_POR_GERENTE[gerenteNome] || (rotaCanonica(gerenteAtual) ? [rotaCanonica(gerenteAtual)] : []);
  const [competencia,setCompetencia]=useState(hoje().slice(0,7));
  const [dia,setDia]=useState("");
  const [rotaSelecionada,setRotaSelecionada]=useState(rotasGerente[0]||"");
  const [fechamentosRotas,setFechamentosRotas]=useState([]);
  const [erro,setErro]=useState("");
  const [confirmacaoOk,setConfirmacaoOk]=useState("");
  const [confirmando,setConfirmando]=useState(false);

  useEffect(()=>{
    if(rotasGerente.length && !rotasGerente.includes(rotaSelecionada)){
      setRotaSelecionada(rotasGerente[0]);
    }
  },[gerenteNome, rotasGerente.join("|")]);

  useEffect(()=>{
    let ativo=true;
    carregarFechamentosRotas()
      .then(lista=>{ if(ativo) setFechamentosRotas(lista); })
      .catch(err=>{ if(ativo) setErro(err.message||"Não foi possível carregar a prestação."); });
    return ()=>{ativo=false;};
  },[]);

  const rotaAtiva = rotaSelecionada || rotasGerente[0] || "";
  const pontosRota = pontos.filter(p => !rotaAtiva || rotaCanonica(p.gerente) === rotaAtiva);
  const idsPontosRota = new Set(pontosRota.map(p=>Number(p.id)));
  const despesasRota = despesas
    .filter(d => {
      const mes = mesDespesaPrestacao(d.competencia);
      const data = diaDespesaPrestacao(d.criadoEm);
      return expenseBelongsToRoute(d, gerenteNome, rotaAtiva, idsPontosRota) &&
        (!competencia || mes === competencia) &&
        (!dia || data === dia);
    })
    .map(d => ({ ...d, ponto: pontosRota.find(p => Number(p.id) === Number(d.pontoId)) }))
    .sort((a,b)=>
      String(a.ponto?.nomeFantasia||"").localeCompare(String(b.ponto?.nomeFantasia||""), "pt-BR") ||
      String(a.descricao||"").localeCompare(String(b.descricao||""), "pt-BR")
    );

  const modalidadesDaRota = modalidadesFechamentoPara(gerenteNome, rotaAtiva);
  const filtroFechamentoGerente = f =>
    normalizarTexto(f.gerente) === normalizarTexto(gerenteNome) &&
    (!rotaAtiva || f.rota === rotaAtiva) &&
    f.competencia === competencia &&
    (f.dia || "") === (dia || "");
  const calculosModalidades = modalidadesDaRota.map(modalidade => {
    const salvo = encontrarFechamentoDaModalidade(fechamentosRotas, modalidade, filtroFechamentoGerente);
    const entrada = Number(salvo?.entrada || 0);
    const comissao = Number(salvo?.comissao || 0);
    const saida = Number(salvo?.saida || 0);
    const saldoBruto = Number(salvo?.saldoBruto ?? salvo?.saldo_bruto ?? entrada - comissao - saida);
    return { ...modalidade, entrada, comissaoCalculada: comissao, saida, saldoBruto };
  });
  const fechamentosDaRota = fechamentosRotas.filter(f=>filtroFechamentoGerente(f)&&Boolean(f.enviadoEm));
  const fechamentoEnviado = fechamentosDaRota.length > 0;
  const fechamentoEnviadoEm = fechamentosDaRota.map(f=>f.enviadoEm || f.atualizadoEm).filter(Boolean).sort().at(-1) || "";
  const fechamentoFinalizadoEm = fechamentosDaRota.map(f=>f.finalizadoEm).filter(Boolean).sort().at(-1) || "";
  const fechamentoVisualizadoEm = fechamentosDaRota.map(f=>f.gerenteVisualizadoEm).filter(Boolean).sort().at(-1) || "";
  const fechamentoConfirmadoEm = fechamentosDaRota.map(f=>f.gerenteConfirmadoEm).filter(Boolean).sort().at(-1) || "";
  const saldoBruto = calculosModalidades.reduce((s,m)=>s+m.saldoBruto,0);
  const totalDespesasBrutas = despesasRota.reduce((s,d)=>s+valorDespesaPrestacao(d),0);
  const subtracaoPlayBet = Math.max(0, Number(fechamentosDaRota[0]?.subtrairDespesasPlayBet) || 0);
  const ajudaCusto = Math.max(0, Number(fechamentosDaRota[0]?.ajudaCusto) || 0);
  const comissaoExtraPermitida = permiteComissaoExtra(gerenteNome, rotaAtiva);
  const comissaoExtra = comissaoExtraPermitida ? Math.max(0, Number(fechamentosDaRota[0]?.comissaoExtra) || 0) : 0;
  const totalDespesas = Math.max(0, totalDespesasBrutas - subtracaoPlayBet + ajudaCusto + comissaoExtra);
  const saldoFinal = saldoBruto - totalDespesas;
  const comissaoGerente = Math.max(0, saldoFinal) * 0.10;
  const saldoRepassar = saldoFinal - comissaoGerente;
  const avisosPixGerente = [...pixEnvios]
    .filter(aviso =>
      normalizarTexto(aviso.gerente) === normalizarTexto(gerenteNome) &&
      pixDentroDoPrazo(aviso)
    )
    .sort((a,b)=>new Date(b.enviadoEm||0)-new Date(a.enviadoEm||0));
  const pixAvisoAtual = avisosPixGerente.find(aviso => aviso.rota && aviso.rota === rotaAtiva) ||
    avisosPixGerente.find(aviso => !aviso.rota) ||
    null;
  const bancoPix = perfilBancoPix(pixAvisoAtual?.pixBanco);

  function aplicarInteracaoFechamento(atualizados) {
    setFechamentosRotas(atual => [
      ...atual.filter(f => !filtroFechamentoGerente(f)),
      ...atualizados,
    ]);
  }

  async function baixarPDFGerente(visualizar=false) {
    setErro("");
    setConfirmacaoOk("");
    const janelaVisualizacao = visualizar ? window.open("", "_blank") : null;
    if(visualizar&&janelaVisualizacao){
      janelaVisualizacao.document.write("<title>Gerando PDF...</title><body style='font-family:Arial,sans-serif;padding:24px;color:#0f2348'>Gerando PDF do fechamento...</body>");
      janelaVisualizacao.document.close();
    }
    const linhasResumo = [[
      rotaAtiva || "Todas",
      formatarMoedaPDF(saldoBruto),
      formatarMoedaPDF(totalDespesas),
      formatarMoedaPDF(saldoFinal),
      formatarMoedaPDF(comissaoGerente),
      formatarMoedaPDF(saldoRepassar),
    ]];
    const linhasModalidades = calculosModalidades
      .filter(m => m.entrada || m.comissaoCalculada || m.saida || m.saldoBruto)
      .map(m => [
        m.nome,
        formatarMoedaPDF(m.entrada),
        formatarMoedaPDF(m.comissaoCalculada),
        formatarMoedaPDF(m.saida),
        formatarMoedaPDF(m.saldoBruto),
      ]);
    const pdfGerado = await gerarPDF({
      titulo: `Prestação de Conta - ${gerenteNome}`,
      descricao: `${rotaAtiva ? `Rota ${rotaAtiva}` : "Todas as rotas"} | ${periodoPrestacaoLabel(competencia,dia)}`,
      nomeArquivo: `neptera_prestacao-gerente_${slugArquivoBackup(gerenteNome)}_${slugArquivoBackup(rotaAtiva||"todas")}_${competencia||"todos"}${dia?`_${dia}`:""}.pdf`,
      total: despesasRota.length,
      visualizar,
      janelaVisualizacao,
      resumo: [
        { label: "Gerente", valor: gerenteNome },
        { label: "Rota", valor: rotaAtiva || "Todas" },
        { label: "Saldo bruto", valor: formatarMoedaPDF(saldoBruto), destaque: [37,99,235] },
        { label: "Despesas", valor: formatarMoedaPDF(totalDespesas), destaque: [220,38,38] },
        { label: "Saldo final", valor: formatarMoedaPDF(saldoFinal), destaque: [5,150,105] },
        { label: "Comissão gerente", valor: formatarMoedaPDF(comissaoGerente), destaque: [201,125,0] },
        { label: "Saldo a repassar para a administraÃ§Ã£o", valor: formatarMoedaPDF(saldoRepassar), destaque: saldoRepassar < 0 ? [220,38,38] : [79,70,229], principal: true, negativo: saldoRepassar < 0 },
      ],
      secoes: [
        {
          titulo: "Ajuste de despesas",
          colunas: ["Despesas lan\u00e7adas pelo gerente","Despesas Play Bet","Ajuda de Custo",...(comissaoExtraPermitida?["Comiss\u00e3o Extra"]:[]),"Despesas finais"],
          linhas: [[formatarMoedaPDF(totalDespesasBrutas),formatarMoedaPDF(subtracaoPlayBet),formatarMoedaPDF(ajudaCusto),...(comissaoExtraPermitida?[formatarMoedaPDF(comissaoExtra)]:[]),formatarMoedaPDF(totalDespesas)]],
        },
        {
          titulo: "Entradas, comissões e saídas por modalidade",
          colunas: ["Modalidade","Entrada","Comissão","Saída / Prêmios","Saldo bruto"],
          linhas: linhasModalidades.length ? linhasModalidades : [["Sem lançamento","R$ 0,00","R$ 0,00","R$ 0,00","R$ 0,00"]],
        },
        {
          titulo: "Resumo financeiro",
          colunas: ["Rota","Saldo bruto","Despesas","Saldo final","Comissão gerente","Saldo a repassar"],
          linhas: linhasResumo,
        },
      ],
    });
    if(!pdfGerado)return;
    if(visualizar && fechamentoEnviado && !fechamentoVisualizadoEm){
      try{
        const atualizados = await registrarVisualizacaoFechamento({
          gerente: gerenteNome,
          rota: rotaAtiva,
          competencia,
          dia: dia || "",
        });
        aplicarInteracaoFechamento(atualizados);
        setConfirmacaoOk("PDF visualizado. Agora confirme o fechamento após conferir os valores.");
      }catch(err){
        setErro(err.message||"O PDF abriu, mas não foi possível registrar a visualização.");
      }
    }
  }

  async function confirmarConferenciaGerente() {
    setErro("");
    setConfirmacaoOk("");
    if(!fechamentoVisualizadoEm){
      setErro("Visualize o PDF antes de confirmar o fechamento.");
      return;
    }
    if(!window.confirm("Confirma que você conferiu os valores deste fechamento?"))return;
    setConfirmando(true);
    try{
      const atualizados = await confirmarFechamentoGerente({
        gerente: gerenteNome,
        rota: rotaAtiva,
        competencia,
        dia: dia || "",
      });
      aplicarInteracaoFechamento(atualizados);
      setConfirmacaoOk("Fechamento confirmado. A administração já pode visualizar sua confirmação.");
    }catch(err){
      setErro(err.message||"Não foi possível confirmar o fechamento.");
    }finally{
      setConfirmando(false);
    }
  }

  return (
    <section className="secao fechamento-page prestacao-gerente-page">
      <div className="fechamento-hero prestacao-gerente-hero">
        <div>
          <span className="dash-kicker">Conferência do gerente</span>
          <h2>Prestação de conta</h2>
          <p>Confira o fechamento enviado pela administração e baixe o PDF para validar sua rota.</p>
        </div>
        <span className="badge-cat">Somente sua carteira</span>
      </div>

      <div className="fechamento-filtros prestacao-filtros-desktop">
        <label>Mês<input type="month" value={competencia} onChange={e=>{setCompetencia(e.target.value);setDia("");}}/></label>
        <label>Rota
          <select value={rotaAtiva} onChange={e=>setRotaSelecionada(e.target.value)}>
            {rotasGerente.map(rota=><option key={rota} value={rota}>{rota}</option>)}
          </select>
        </label>
        <button className="btn-secundario" type="button" onClick={()=>{setCompetencia(hoje().slice(0,7));setDia("");}}>Mês atual</button>
      </div>

      <details className="prestacao-filtros-mobile">
        <summary>
          <div>
            <small>Período e rota</small>
            <strong>{periodoPrestacaoLabel(competencia,dia)} · {rotaAtiva||"Sem rota"}</strong>
          </div>
          <span>Ajustar</span>
        </summary>
        <div className="prestacao-filtros-mobile-corpo">
          <label>Mês<input type="month" value={competencia} onChange={e=>{setCompetencia(e.target.value);setDia("");}}/></label>
          <label>Rota
            <select value={rotaAtiva} onChange={e=>setRotaSelecionada(e.target.value)}>
              {rotasGerente.map(rota=><option key={rota} value={rota}>{rota}</option>)}
            </select>
          </label>
          <button className="btn-secundario" type="button" onClick={()=>{setCompetencia(hoje().slice(0,7));setDia("");}}>Usar mês atual</button>
        </div>
      </details>

      {pixAvisoAtual ? (
        <section className="pix-recebido-wrap prestacao-pix-box">
          <article className={`pix-credit-card pix-recebido-credit ${bancoPix.classe}`}>
            <div className="pix-card-top">
              <span className="pix-chip"/>
              <span className="pix-contactless">≋</span>
              <strong>{bancoPix.nome}</strong>
            </div>
            <div className="pix-card-brand">{bancoPix.icone}</div>
            <div className="pix-card-info">
              <strong>{pixAvisoAtual.pixNome}</strong>
              <span>{pixAvisoAtual.pixBanco}</span>
              <small>{pixAvisoAtual.pixTipo}: {pixAvisoAtual.pixChave}</small>
            </div>
          </article>
          <div className="pix-recebido-info">
            <span className="dash-kicker">PIX da administração</span>
            <h2>Chave PIX para este fechamento</h2>
            <p>{pixAvisoAtual.mensagem || "A administração enviou uma chave PIX para você usar nesta prestação de conta."}</p>
            {pixAvisoAtual.rota&&<span className="badge-cat">Rota {pixAvisoAtual.rota}</span>}
            <button className="btn-pix-premium" type="button" onClick={()=>onCopiarPix?.(pixAvisoAtual.pixChave)}>
              <span>Copiar chave PIX</span>
              <small>Para prestação de contas</small>
            </button>
          </div>
        </section>
      ) : (
        <div className="info-box">Nenhuma chave PIX enviada pela administração para sua prestação de conta.</div>
      )}

      {erro&&<div className="erro-box">{erro}</div>}
      {confirmacaoOk&&<div className="sucesso-box">{confirmacaoOk}</div>}
      <div className="prestacao-pdf-recebido">
        <div>
          <span className="dash-kicker">PDF do fechamento</span>
          <h3>{fechamentoEnviado ? "Fechamento enviado pelo administrativo" : "Nenhum PDF enviado ainda"}</h3>
          <p>{fechamentoEnviado ? `${gerenteNome}${rotaAtiva?` · ${rotaAtiva}`:""} | ${periodoPrestacaoLabel(competencia,dia)}` : "Aguarde o administrativo enviar o fechamento desta rota."}</p>
          {fechamentoEnviado&&(
            <div className="prestacao-status-lista">
              <span>Enviado em: <strong>{fechamentoEnviadoEm ? new Date(fechamentoEnviadoEm).toLocaleString("pt-BR") : "Data não informada"}</strong></span>
              <span>Status: <strong>{fechamentoFinalizadoEm
                ?`Finalizado em ${new Date(fechamentoFinalizadoEm).toLocaleString("pt-BR")}`
                :fechamentoConfirmadoEm
                  ?`Confirmado em ${new Date(fechamentoConfirmadoEm).toLocaleString("pt-BR")}`
                  :fechamentoVisualizadoEm
                    ?`PDF visualizado em ${new Date(fechamentoVisualizadoEm).toLocaleString("pt-BR")}`
                    :"Aguardando visualização do PDF"}</strong></span>
            </div>
          )}
        </div>
        <div className="prestacao-pdf-botoes">
          <button className="btn-secundario" type="button" disabled={!fechamentoEnviado} onClick={()=>baixarPDFGerente(true)}>Visualizar PDF</button>
          <button className="fechamento-save-btn" type="button" disabled={!fechamentoEnviado} onClick={()=>baixarPDFGerente(false)}>Baixar PDF</button>
          {fechamentoEnviado&&(
            <div className={`prestacao-confirmacao-acao ${fechamentoConfirmadoEm?"confirmada":""}`}>
              {fechamentoConfirmadoEm&&(
                <div className="prestacao-confirmado-banner">
                  <span aria-hidden="true"><Icon name="check"/></span>
                  <div>
                    <strong>Fechamento confirmado com sucesso</strong>
                    <small>Sua conferência foi registrada e enviada para a administração.</small>
                  </div>
                </div>
              )}
              <button className="btn-confirmar-fechamento" type="button" onClick={confirmarConferenciaGerente}
                disabled={!fechamentoVisualizadoEm||Boolean(fechamentoConfirmadoEm)||Boolean(fechamentoFinalizadoEm)||confirmando}>
                {fechamentoConfirmadoEm?"Fechamento confirmado":confirmando?"Confirmando...":"Confirmar fechamento"}
              </button>
              <small>{fechamentoConfirmadoEm
                ?`Sua confirmação foi registrada em ${new Date(fechamentoConfirmadoEm).toLocaleString("pt-BR")}.`
                :fechamentoVisualizadoEm
                  ?"Confirme somente depois de revisar todos os valores."
                  :"Visualize o PDF para liberar a confirmação."}</small>
            </div>
          )}
        </div>
      </div>
      {fechamentoEnviado&&(
        <div className="prestacao-pdf-resumo">
          <article><span>Saldo a repassar</span><strong>{formatarMoedaPDF(saldoRepassar)}</strong></article>
          <article><span>Comissão gerente</span><strong>{formatarMoedaPDF(comissaoGerente)}</strong></article>
          <article><span>Despesas</span><strong>{formatarMoedaPDF(totalDespesas)}</strong></article>
        </div>
      )}
      {!fechamentoEnviado&&(
        <div className="info-box">Quando o administrativo enviar o fechamento, o PDF aparecerá aqui para visualização e download.</div>
      )}
      {/* A área do gerente mostra apenas o PDF recebido; os campos de lançamento ficam restritos ao administrativo. */}
    </section>
  );
}

function FechamentoModule({ onMenu, menuOpen, ...pageProps }) {
  const [prazosAbertos, setPrazosAbertos] = useState(false);
  return <>
    <ModuleHeader
      eyebrow="Reconciliação operacional"
      title="Fechamento"
      subtitle="Conferência, prova do resultado e publicação por rota."
      onMenu={onMenu}
      menuOpen={menuOpen}
      actions={<button className="btn-secundario" type="button" aria-expanded={prazosAbertos} onClick={()=>setPrazosAbertos(atual=>!atual)}><Icon name="calendar"/> Prazos de despesas</button>}
    />
    <FechamentoPage {...pageProps} prazosAbertos={prazosAbertos} onFecharPrazos={()=>setPrazosAbertos(false)}/>
  </>;
}

function FechamentoPage({ pontos = [], itens = [], despesas = [], pixEnvios = [], onPixEnviosChange, prazosAbertos = false, onFecharPrazos }) {
  const [cartaoPix,setCartaoPix]=useState(null);
  const [pixEnvio,setPixEnvio]=useState({gerente:GERENTES[0]||"",rota:"",mensagem:""});
  const [pixErro,setPixErro]=useState("");
  const [pixOk,setPixOk]=useState("");
  const [pixSalvando,setPixSalvando]=useState(false);
  const [gerenteSelecionado,setGerenteSelecionado]=useState("");
  const [rotaSelecionada,setRotaSelecionada]=useState("");
  const [competenciaFechamento,setCompetenciaFechamento]=useState(competenciaFechamentoPadrao);
  const [diaFechamento,setDiaFechamento]=useState("");
  const [fechamentosRotas,setFechamentosRotas]=useState([]);
  const [fechamentoValores,setFechamentoValores]=useState(criarFechamentoVazio);
  const [subtrairDespesasPlayBet,setSubtrairDespesasPlayBet]=useState("");
  const [ajudaCusto,setAjudaCusto]=useState("");
  const [comissaoExtra,setComissaoExtra]=useState("");
  const [fechamentoOk,setFechamentoOk]=useState("");
  const [fechamentoErro,setFechamentoErro]=useState("");
  const [fechamentoSalvando,setFechamentoSalvando]=useState(false);
  const [prorrogacoesDespesas,setProrrogacoesDespesas]=useState([]);
  const [prorrogacaoForm,setProrrogacaoForm]=useState(()=>{
    const limite=new Date(Date.now()+24*60*60*1000);
    const local=new Date(limite.getTime()-limite.getTimezoneOffset()*60000).toISOString().slice(0,16);
    return {gerente:GERENTES[0]||"",competencia:hoje().slice(0,7),expiraEm:local};
  });
  const [prorrogacaoErro,setProrrogacaoErro]=useState("");
  const [prorrogacaoOk,setProrrogacaoOk]=useState("");
  const [prorrogacaoSalvando,setProrrogacaoSalvando]=useState(false);
  const despesasFechamento = despesas.filter(d => {
    const mes = mesDespesaPrestacao(d.competencia);
    const dia = diaDespesaPrestacao(d.criadoEm);
    return (!competenciaFechamento || mes === competenciaFechamento) && (!diaFechamento || dia === diaFechamento);
  });
  const dadosGerentes = GERENTES.map(gerente => {
    const rotas = ROTAS_POR_GERENTE[gerente] || [];
    const pontosGerente = pontos.filter(p => rotaPertenceAoGerente(p.gerente, gerente));
    const nomesPontos = new Set(pontosGerente.map(p => p.nomeFantasia));
    const equipamentos = itens.filter(i =>
      nomesPontos.has(i.localizacao) ||
      normalizarTexto(i.gerenteResponsavel) === normalizarTexto(gerente) ||
      rotaPertenceAoGerente(i.gerenteResponsavel, gerente)
    );
    const idsPontos = new Set(pontosGerente.map(p => Number(p.id)));
    const totalDespesas = despesasFechamento
      .filter(d => idsPontos.has(Number(d.pontoId)) || expenseBelongsToManager(d, gerente))
      .reduce((s,d)=>s+valorDespesaPrestacao(d),0);
    return { gerente, rotas, pontos:pontosGerente.length, equipamentos:equipamentos.length, totalDespesas, cor:corFechamento(gerente) };
  });
  const dadosRotas = GERENTES.flatMap(gerente => {
    const rotas = ROTAS_POR_GERENTE[gerente] || [];
    return rotas.map(rota => {
      const cor = GERENTE_CORES[rota] || corFechamento(gerente);
      const pontosRota = pontos.filter(p => rotaCanonica(p.gerente) === rota);
      const nomesPontos = new Set(pontosRota.map(p => p.nomeFantasia));
      const idsPontos = new Set(pontosRota.map(p => Number(p.id)));
      const equipamentos = itens.filter(i =>
        nomesPontos.has(i.localizacao) ||
        normalizarTexto(i.gerenteResponsavel) === normalizarTexto(gerente) ||
        normalizarTexto(i.gerenteResponsavel) === normalizarTexto(rota)
      );
      const totalDespesas = despesasFechamento
        .filter(d => expenseBelongsToRoute(d, gerente, rota, idsPontos))
        .reduce((s,d)=>s+valorDespesaPrestacao(d),0);
      return { gerente, rota, pontos:pontosRota.length, equipamentos:equipamentos.length, totalDespesas, cor };
    });
  });
  const rotasEnvio=ROTAS_POR_GERENTE[pixEnvio.gerente]||[];
  const gerenteDetalhe = dadosGerentes.find(g => g.gerente === gerenteSelecionado);
  const rotasDetalhe = gerenteDetalhe?.rotas || [];
  const rotaDetalheAtiva = rotaSelecionada || (rotasDetalhe.length === 1 ? rotasDetalhe[0] : "");
  const pontosDetalhe = gerenteSelecionado
    ? pontos.filter(p => rotaDetalheAtiva ? rotaCanonica(p.gerente) === rotaDetalheAtiva : false)
    : [];
  const idsPontosDetalhe = new Set(pontosDetalhe.map(p => Number(p.id)));
  const nomesPontosDetalhe = new Set(pontosDetalhe.map(p => p.nomeFantasia));
  const despesasDetalhe = despesasFechamento
    .filter(d => expenseBelongsToRoute(d, gerenteSelecionado, rotaDetalheAtiva, idsPontosDetalhe))
    .map(d => ({ ...d, ponto: pontosDetalhe.find(p => Number(p.id) === Number(d.pontoId)) }))
    .sort((a,b)=>
      String(a.ponto?.nomeFantasia||"").localeCompare(String(b.ponto?.nomeFantasia||""), "pt-BR") ||
      String(a.descricao||"").localeCompare(String(b.descricao||""), "pt-BR")
    );
  const despesasDetalheAgrupadas = [...despesasDetalhe.reduce((grupos,d)=>{
    const despesaGerente = expenseBelongsToManager(d, gerenteSelecionado);
    const chave = despesaGerente
      ? `gerente:${normalizarTexto(d.gerente)}:${normalizarTexto(d.rota)}`
      : `ponto:${Number(d.pontoId)}`;
    const grupo = grupos.get(chave) || {
      chave,
      nome: d.ponto?.nomeFantasia || (despesaGerente ? `Despesa pessoal de ${d.gerente || gerenteSelecionado}` : `Ponto ${d.pontoId}`),
      lancamentos: [],
      meses: new Set(),
      modalidades: new Set(),
      total: 0,
    };
    grupo.lancamentos.push(d);
    grupo.meses.add(formatarMesPrestacao(mesDespesaPrestacao(d.competencia)));
    if (!despesaGerente) {
      (Array.isArray(d.ponto?.modalidades) ? d.ponto.modalidades : []).forEach(modalidade=>grupo.modalidades.add(modalidade));
    }
    grupo.total += valorDespesaPrestacao(d);
    grupos.set(chave, grupo);
    return grupos;
  },new Map()).values()];
  const equipamentosDetalhe = itens.filter(i =>
    nomesPontosDetalhe.has(i.localizacao) ||
    normalizarTexto(i.gerenteResponsavel) === normalizarTexto(gerenteSelecionado) ||
    (rotaDetalheAtiva && normalizarTexto(i.gerenteResponsavel) === normalizarTexto(rotaDetalheAtiva))
  );
  const modalidadesDaRota = modalidadesFechamentoPara(gerenteSelecionado, rotaDetalheAtiva);
  const totalDetalheSistema = despesasDetalhe.reduce((s,d)=>s+valorDespesaPrestacao(d),0);
  const subtracaoPlayBetFechamento = Math.max(0, numeroFechamento(subtrairDespesasPlayBet));
  const ajudaCustoFechamento = Math.max(0, numeroFechamento(ajudaCusto));
  const comissaoExtraPermitida = permiteComissaoExtra(gerenteSelecionado, rotaDetalheAtiva);
  const comissaoExtraFechamento = comissaoExtraPermitida ? Math.max(0, numeroFechamento(comissaoExtra)) : 0;
  const totalDetalhe = Math.max(0, totalDetalheSistema - subtracaoPlayBetFechamento + ajudaCustoFechamento + comissaoExtraFechamento);
  const mediaPorPonto = pontosDetalhe.length ? totalDetalhe / pontosDetalhe.length : 0;
  const calculosModalidades = modalidadesDaRota.map(modalidade => {
    const valores = fechamentoValores[modalidade.id] || {};
    const entrada = numeroFechamento(valores.entrada);
    const comissao = modalidade.comissao === null
      ? numeroFechamento(valores.comissao)
      : valores.comissaoAutomatica !== false
        ? entrada * modalidade.comissao
        : numeroFechamento(valores.comissao);
    const saida = numeroFechamento(valores.saida);
    const saldoBruto = entrada - comissao - saida;
    return { ...modalidade, entrada, comissaoCalculada: comissao, saida, saldoBruto };
  });
  const saldoBrutoFechamento = calculosModalidades.reduce((s,m)=>s+m.saldoBruto,0);
  const saldoFinalFechamento = saldoBrutoFechamento - totalDetalhe;
  const comissaoGerenteFechamento = Math.max(0, saldoFinalFechamento) * 0.10;
  const saldoRepassarFechamento = saldoFinalFechamento - comissaoGerenteFechamento;
  const totalEntradasFechamento = calculosModalidades.reduce((s,m)=>s+m.entrada,0);
  const totalComissoesFechamento = calculosModalidades.reduce((s,m)=>s+m.comissaoCalculada,0);
  const totalSaidasFechamento = calculosModalidades.reduce((s,m)=>s+m.saida,0);
  const competenciaStatusFechamento = competenciaFechamento || hoje().slice(0,7);
  const diaStatusFechamento = diaFechamento || "";
  const fechamentosDetalheStatus = fechamentosRotas.filter(f =>
    f.gerente === gerenteSelecionado &&
    f.rota === rotaDetalheAtiva &&
    f.competencia === competenciaStatusFechamento &&
    (f.dia || "") === diaStatusFechamento
  );
  const fechamentoDetalheEnviadoEm = fechamentosDetalheStatus.map(f=>f.enviadoEm).filter(Boolean).sort().at(-1) || "";
  const fechamentoDetalheFinalizadoEm = fechamentosDetalheStatus.map(f=>f.finalizadoEm).filter(Boolean).sort().at(-1) || "";
  const fechamentoDetalheVisualizadoEm = fechamentosDetalheStatus.map(f=>f.gerenteVisualizadoEm).filter(Boolean).sort().at(-1) || "";
  const fechamentoDetalheConfirmadoEm = fechamentosDetalheStatus.map(f=>f.gerenteConfirmadoEm).filter(Boolean).sort().at(-1) || "";
  const fechamentoDetalheStatusTexto = fechamentoDetalheFinalizadoEm
    ? `Prestação finalizada em ${new Date(fechamentoDetalheFinalizadoEm).toLocaleString("pt-BR")}`
    : fechamentoDetalheConfirmadoEm
      ? `Gerente confirmou em ${new Date(fechamentoDetalheConfirmadoEm).toLocaleString("pt-BR")}`
      : fechamentoDetalheVisualizadoEm
        ? `Gerente visualizou o PDF em ${new Date(fechamentoDetalheVisualizadoEm).toLocaleString("pt-BR")} e ainda não confirmou`
    : fechamentoDetalheEnviadoEm
      ? `Enviado em ${new Date(fechamentoDetalheEnviadoEm).toLocaleString("pt-BR")} · aguardando o gerente visualizar`
      : fechamentosDetalheStatus.length
        ? "Rascunho salvo · ainda não enviado ao gerente"
        : "Ainda não enviado ao gerente";
  const etapasFechamento = ["Competência", "Rota", "Lançamentos", "Conferência", "Envio"];
  const etapaFechamento = fechamentoDetalheFinalizadoEm
    ? 6
    : (fechamentoDetalheEnviadoEm || fechamentoDetalheConfirmadoEm)
      ? 5
      : fechamentosDetalheStatus.length
        ? 4
        : gerenteSelecionado
          ? 3
          : 2;

  function statusDaRotaFechamento({ gerente, rota }) {
    const registros = fechamentosRotas.filter(f =>
      f.gerente === gerente &&
      f.rota === rota &&
      f.competencia === competenciaStatusFechamento &&
      (f.dia || "") === diaStatusFechamento
    );
    const finalizado = registros.map(f => f.finalizadoEm).filter(Boolean).sort().at(-1);
    const confirmado = registros.map(f => f.gerenteConfirmadoEm).filter(Boolean).sort().at(-1);
    const visualizado = registros.map(f => f.gerenteVisualizadoEm).filter(Boolean).sort().at(-1);
    const enviado = registros.map(f => f.enviadoEm).filter(Boolean).sort().at(-1);

    if (finalizado) return { classe: "finalizado", titulo: "Finalizado", descricao: new Date(finalizado).toLocaleString("pt-BR") };
    if (confirmado) return { classe: "confirmado", titulo: "Confirmado", descricao: new Date(confirmado).toLocaleString("pt-BR") };
    if (visualizado) return { classe: "visualizado", titulo: "Visualizado", descricao: "Aguardando confirmação" };
    if (enviado) return { classe: "enviado", titulo: "Enviado", descricao: "Aguardando gerente" };
    if (registros.length) return { classe: "rascunho", titulo: "Rascunho", descricao: "Salvo no sistema" };
    return { classe: "pendente", titulo: "Sem envio", descricao: "Pronto para lançar" };
  }

  useEffect(()=>{
    let ativo=true;
    Promise.all([carregarFechamentosRotas(),carregarProrrogacoesDespesas()])
      .then(([lista,prorrogacoes])=>{ if(ativo){setFechamentosRotas(lista);setProrrogacoesDespesas(prorrogacoes);} })
      .catch(err=>{ if(ativo) setFechamentoErro(err.message||"Não foi possível carregar os fechamentos."); });
    return ()=>{ativo=false;};
  },[]);

  async function salvarProrrogacao() {
    setProrrogacaoErro("");
    setProrrogacaoOk("");
    if(!prorrogacaoForm.gerente||!prorrogacaoForm.competencia||!prorrogacaoForm.expiraEm){
      setProrrogacaoErro("Informe gerente, competência e prazo final.");
      return;
    }
    const expiraEm=new Date(prorrogacaoForm.expiraEm);
    if(Number.isNaN(expiraEm.getTime())||expiraEm.getTime()<=Date.now()){
      setProrrogacaoErro("O prazo final deve ser posterior ao horário atual.");
      return;
    }
    setProrrogacaoSalvando(true);
    try{
      const salva=await salvarProrrogacaoDespesa({...prorrogacaoForm,expiraEm:expiraEm.toISOString()});
      setProrrogacoesDespesas(prev=>[salva,...prev.filter(item=>item.id!==salva.id)]);
      setProrrogacaoOk(`Prazo liberado para ${salva.gerente}.`);
    }catch(err){
      setProrrogacaoErro(err.message||"Não foi possível liberar o prazo.");
    }finally{
      setProrrogacaoSalvando(false);
    }
  }

  async function encerrarProrrogacao(item) {
    if(!window.confirm(`Encerrar agora o prazo de ${item.gerente}?`))return;
    setProrrogacaoErro("");
    setProrrogacaoOk("");
    try{
      await encerrarProrrogacaoDespesa(item.id);
      setProrrogacoesDespesas(prev=>prev.map(registro=>registro.id===item.id?{...registro,ativo:false}:registro));
      setProrrogacaoOk(`Prazo de ${item.gerente} encerrado.`);
    }catch(err){
      setProrrogacaoErro(err.message||"Não foi possível encerrar o prazo.");
    }
  }

  useEffect(()=>{
    const modalidadesAtivas = modalidadesFechamentoPara(gerenteSelecionado, rotaDetalheAtiva);
    const vazio = criarFechamentoVazio(modalidadesAtivas);
    if(!gerenteSelecionado || !rotaDetalheAtiva){
      setFechamentoValores(vazio);
      setSubtrairDespesasPlayBet("");
      setAjudaCusto("");
      setComissaoExtra("");
      return;
    }
    const competencia = competenciaFechamento || hoje().slice(0,7);
    const dia = diaFechamento || "";
    const registrosDoFechamento = fechamentosRotas.filter(f =>
        f.gerente === gerenteSelecionado &&
        f.rota === rotaDetalheAtiva &&
        f.competencia === competencia &&
        (f.dia || "") === dia
      );
    registrosDoFechamento.forEach(f => {
        const modalidadeAtual = modalidadesAtivas.find(m => [m.id, ...(m.legacyIds || [])].includes(f.modalidade));
        if (!modalidadeAtual) return;
        vazio[modalidadeAtual.id] = {
          entrada: textoFechamentoSalvo(f.entrada),
          comissao: textoFechamentoSalvo(f.comissao),
          saida: textoFechamentoSalvo(f.saida),
          comissaoAutomatica: modalidadeAtual.comissao !== null ? f.comissaoAutomatica !== false : false,
          percentualComissao: modalidadeAtual.comissao !== null
            ? textoFechamentoSalvo(f.percentualComissao || modalidadeAtual.comissao * 100)
            : "",
        };
      });
    setSubtrairDespesasPlayBet(textoMoedaFechamento(registrosDoFechamento[0]?.subtrairDespesasPlayBet));
    setAjudaCusto(textoMoedaFechamento(registrosDoFechamento[0]?.ajudaCusto));
    setComissaoExtra(textoMoedaFechamento(registrosDoFechamento[0]?.comissaoExtra));
    setFechamentoValores(vazio);
    setFechamentoOk("");
    setFechamentoErro("");
  },[gerenteSelecionado, rotaDetalheAtiva, competenciaFechamento, diaFechamento, fechamentosRotas]);

  function selecionarRotaFechamento(g) {
    setGerenteSelecionado(g.gerente);
    setRotaSelecionada(g.rota);
  }

  function alterarFechamentoModalidade(modalidadeId, campo, valor) {
    setFechamentoValores(atual => ({
      ...atual,
      [modalidadeId]: {
        ...(atual[modalidadeId] || {}),
        [campo]: valor,
      },
    }));
  }

  async function salvarFechamentoSelecionado(enviarAoGerente = false) {
    setFechamentoOk("");
    setFechamentoErro("");
    if(!gerenteSelecionado || !rotaDetalheAtiva){
      setFechamentoErro("Selecione uma rota para salvar o fechamento.");
      return;
    }
    setFechamentoSalvando(true);
    try{
      const competencia = competenciaFechamento || hoje().slice(0,7);
      const modalidadesParaSalvar = calculosModalidades.map(m => ({
        modalidade: m.id,
        entrada: m.entrada,
        comissao: m.comissaoCalculada,
        comissaoAutomatica: m.comissao === null ? false : fechamentoValores[m.id]?.comissaoAutomatica !== false,
        percentualComissao: m.comissao === null
          ? 0
          : fechamentoValores[m.id]?.comissaoAutomatica !== false
            ? m.comissao * 100
            : 0,
        saida: m.saida,
        saldoBruto: m.saldoBruto,
      }));
      const salvos = await salvarFechamentoRota({
        gerente: gerenteSelecionado,
        rota: rotaDetalheAtiva,
        competencia,
        dia: diaFechamento || "",
        modalidades: modalidadesParaSalvar,
        enviarAoGerente,
        subtrairDespesasPlayBet: subtracaoPlayBetFechamento,
        ajudaCusto: ajudaCustoFechamento,
        comissaoExtra: comissaoExtraFechamento,
      });
      setFechamentosRotas(atual => [
        ...atual.filter(f =>
          !(
            f.gerente === gerenteSelecionado &&
            f.rota === rotaDetalheAtiva &&
            f.competencia === competencia &&
            (f.dia || "") === (diaFechamento || "")
          )
        ),
        ...salvos,
      ]);
      setFechamentoOk(enviarAoGerente
        ? `Fechamento enviado para ${gerenteSelecionado} · ${rotaDetalheAtiva}. O gerente já pode abrir a Prestação de Conta e baixar o PDF dessa rota.`
        : `Fechamento de ${gerenteSelecionado} · ${rotaDetalheAtiva} salvo como rascunho. O gerente ainda não tem acesso.`);
    }catch(err){
      setFechamentoErro(err.message||"Não foi possível salvar o fechamento.");
    }finally{
      setFechamentoSalvando(false);
    }
  }

  async function marcarPrestacaoFinalizada() {
    setFechamentoOk("");
    setFechamentoErro("");
    if(!gerenteSelecionado || !rotaDetalheAtiva){
      setFechamentoErro("Selecione uma rota para finalizar a prestação.");
      return;
    }
    if(!fechamentoDetalheEnviadoEm){
      setFechamentoErro("Envie o fechamento ao gerente antes de finalizar a prestação.");
      return;
    }
    if(!fechamentoDetalheConfirmadoEm){
      setFechamentoErro("Aguarde o gerente visualizar e confirmar o fechamento antes de finalizar a prestação.");
      return;
    }
    setFechamentoSalvando(true);
    try{
      const atualizados = await finalizarPrestacaoRota({
        gerente: gerenteSelecionado,
        rota: rotaDetalheAtiva,
        competencia: competenciaStatusFechamento,
        dia: diaStatusFechamento,
      });
      setFechamentosRotas(atual => [
        ...atual.filter(f =>
          !(
            f.gerente === gerenteSelecionado &&
            f.rota === rotaDetalheAtiva &&
            f.competencia === competenciaStatusFechamento &&
            (f.dia || "") === diaStatusFechamento
          )
        ),
        ...atualizados,
      ]);
      setFechamentoOk(`Prestação de contas finalizada para ${gerenteSelecionado} · ${rotaDetalheAtiva}.`);
    }catch(err){
      setFechamentoErro(err.message||"Não foi possível finalizar a prestação.");
    }finally{
      setFechamentoSalvando(false);
    }
  }

  function despesasDaRota(rota) {
    const pontosRota = pontos.filter(p => rotaCanonica(p.gerente) === rota);
    const idsPontos = new Set(pontosRota.map(p => Number(p.id)));
    return despesasFechamento
      .filter(d => expenseBelongsToRoute(d, gerenteSelecionado, rota, idsPontos))
      .map(d => ({ ...d, ponto: pontosRota.find(p => Number(p.id) === Number(d.pontoId)), rota }));
  }

  function calculosDaRota(rota) {
    if (gerenteSelecionado && rota === rotaDetalheAtiva) return calculosModalidades;
    const competencia = competenciaFechamento || hoje().slice(0,7);
    const dia = diaFechamento || "";
    return modalidadesFechamentoPara(gerenteSelecionado, rota).map(modalidade => {
      const salvo = encontrarFechamentoDaModalidade(fechamentosRotas, modalidade, f =>
        f.gerente === gerenteSelecionado &&
        f.rota === rota &&
        f.competencia === competencia &&
        (f.dia || "") === dia
      );
      const entrada = Number(salvo?.entrada || 0);
      const comissao = Number(salvo?.comissao || 0);
      const saida = Number(salvo?.saida || 0);
      const saldoBruto = Number(salvo?.saldoBruto ?? salvo?.saldo_bruto ?? entrada - comissao - saida);
      return { ...modalidade, entrada, comissaoCalculada: comissao, saida, saldoBruto };
    });
  }

  function subtracaoPlayBetDaRota(rota) {
    if (rota === rotaDetalheAtiva) return subtracaoPlayBetFechamento;
    const competencia = competenciaFechamento || hoje().slice(0,7);
    const registro = fechamentosRotas.find(f =>
      f.gerente === gerenteSelecionado &&
      f.rota === rota &&
      f.competencia === competencia &&
      (f.dia || "") === (diaFechamento || "")
    );
    return Math.max(0, Number(registro?.subtrairDespesasPlayBet) || 0);
  }

  function ajudaCustoDaRota(rota) {
    if (rota === rotaDetalheAtiva) return ajudaCustoFechamento;
    const competencia = competenciaFechamento || hoje().slice(0,7);
    const registro = fechamentosRotas.find(f =>
      f.gerente === gerenteSelecionado &&
      f.rota === rota &&
      f.competencia === competencia &&
      (f.dia || "") === (diaFechamento || "")
    );
    return Math.max(0, Number(registro?.ajudaCusto) || 0);
  }

  function comissaoExtraDaRota(rota) {
    if (!permiteComissaoExtra(gerenteSelecionado, rota)) return 0;
    if (rota === rotaDetalheAtiva) return comissaoExtraFechamento;
    const competencia = competenciaFechamento || hoje().slice(0,7);
    const registro = fechamentosRotas.find(f =>
      f.gerente === gerenteSelecionado &&
      f.rota === rota &&
      f.competencia === competencia &&
      (f.dia || "") === (diaFechamento || "")
    );
    return Math.max(0, Number(registro?.comissaoExtra) || 0);
  }

  async function baixarFechamentoPDF(tipo = "rota", visualizar = false) {
    if (!gerenteSelecionado) {
      window.alert("Selecione um gerente/rota para gerar o PDF.");
      return;
    }

    const rotasPDF = tipo === "gerente" ? rotasDetalhe.filter(Boolean) : [rotaDetalheAtiva].filter(Boolean);
    if (rotasPDF.length === 0) {
      window.alert("Selecione uma rota para gerar o PDF.");
      return;
    }

    const janelaVisualizacao = visualizar && tipo === "rota" ? window.open("", "_blank") : null;
    if (visualizar && tipo === "rota" && !janelaVisualizacao) {
      window.alert("O navegador bloqueou a nova janela. Libere pop-ups para visualizar o PDF.");
      return;
    }
    if (janelaVisualizacao) {
      janelaVisualizacao.document.write("<title>Gerando PDF...</title><body style='font-family:Arial,sans-serif;padding:24px;color:#0f2348'>Gerando PDF do fechamento...</body>");
      janelaVisualizacao.document.close();
    }

    async function gerarPDFDaRota(rota, visualizarRota = false) {
      if (!rota) return;
      const modalidades = calculosDaRota(rota);
      const despesasRota = despesasDaRota(rota);
      const totalBruto = modalidades.reduce((s,m)=>s+m.saldoBruto,0);
      const totalDespesasBrutas = despesasRota.reduce((s,d)=>s+valorDespesaPrestacao(d),0);
      const subtracaoPlayBet = subtracaoPlayBetDaRota(rota);
      const ajudaCustoRota = ajudaCustoDaRota(rota);
      const comissaoExtraPermitidaRota = permiteComissaoExtra(gerenteSelecionado, rota);
      const comissaoExtraRota = comissaoExtraDaRota(rota);
      const totalDespesas = Math.max(0, totalDespesasBrutas - subtracaoPlayBet + ajudaCustoRota + comissaoExtraRota);
      const saldoFinal = totalBruto - totalDespesas;
      const comissaoGerente = Math.max(0, saldoFinal) * 0.10;
      const saldoRepassar = saldoFinal - comissaoGerente;
      const linhasResumo = [[
        rota,
        formatarMoedaPDF(totalBruto),
        formatarMoedaPDF(totalDespesas),
        formatarMoedaPDF(saldoFinal),
        formatarMoedaPDF(comissaoGerente),
        formatarMoedaPDF(saldoRepassar),
      ]];
      const linhasModalidades = modalidades
        .filter(m => m.entrada || m.comissaoCalculada || m.saida || m.saldoBruto)
        .map(m => [
          rota,
          m.nome,
          formatarMoedaPDF(m.entrada),
          formatarMoedaPDF(m.comissaoCalculada),
          formatarMoedaPDF(m.saida),
          formatarMoedaPDF(m.saldoBruto),
        ]);
      await gerarPDF({
        titulo: `Fechamento - ${gerenteSelecionado} · ${rota}`,
        descricao: `Prestação de contas individual da rota | ${periodoPrestacaoLabel(competenciaFechamento,diaFechamento)}`,
        nomeArquivo: `neptera_fechamento_${slugArquivoBackup(gerenteSelecionado)}_${slugArquivoBackup(rota)}_${competenciaFechamento || "todos"}${diaFechamento?`_${diaFechamento}`:""}.pdf`,
        visualizar: visualizarRota,
        janelaVisualizacao: visualizarRota ? janelaVisualizacao : null,
        total: 1,
        resumo: [
          { label: "Gerente", valor: gerenteSelecionado },
          { label: "Rota", valor: rota },
          { label: "Saldo bruto", valor: formatarMoedaPDF(totalBruto), destaque: [37,99,235] },
          { label: "Despesas", valor: formatarMoedaPDF(totalDespesas), destaque: [220,38,38] },
          { label: "Saldo final", valor: formatarMoedaPDF(saldoFinal), destaque: [5,150,105] },
          { label: "Comissão gerente", valor: formatarMoedaPDF(comissaoGerente), destaque: [201,125,0] },
          { label: "Saldo a repassar para a administraÃ§Ã£o", valor: formatarMoedaPDF(saldoRepassar), destaque: saldoRepassar < 0 ? [220,38,38] : [79,70,229], principal: true, negativo: saldoRepassar < 0 },
        ],
        secoes: [
          {
            titulo: "Ajuste de despesas",
            colunas: ["Despesas lan\u00e7adas pelo gerente","Despesas Play Bet","Ajuda de Custo",...(comissaoExtraPermitidaRota?["Comiss\u00e3o Extra"]:[]),"Despesas finais"],
            linhas: [[formatarMoedaPDF(totalDespesasBrutas),formatarMoedaPDF(subtracaoPlayBet),formatarMoedaPDF(ajudaCustoRota),...(comissaoExtraPermitidaRota?[formatarMoedaPDF(comissaoExtraRota)]:[]),formatarMoedaPDF(totalDespesas)]],
          },
          {
            titulo: "Entradas, comissões e saídas por modalidade",
            colunas: ["Rota","Modalidade","Entrada","Comissão","Saída / Prêmios","Saldo bruto"],
            linhas: linhasModalidades.length ? linhasModalidades : [[rota,"Sem lançamentos","R$ 0,00","R$ 0,00","R$ 0,00","R$ 0,00"]],
          },
          {
            titulo: "Resumo financeiro da rota",
            colunas: ["Rota","Saldo bruto","Despesas","Saldo final","Comissão gerente","Saldo a repassar"],
            linhas: linhasResumo,
          },
        ],
      });
    }

    for (const rota of rotasPDF) {
      await gerarPDFDaRota(rota, visualizar && tipo === "rota");
    }
  }

  async function enviarAvisoPix(e){
    e.preventDefault();
    setPixErro("");
    setPixOk("");
    if(!cartaoPix){
      setPixErro("Escolha um cartão PIX para enviar.");
      return;
    }
    setPixSalvando(true);
    try{
      const envio=await enviarPixParaGerente({
        chave:cartaoPix,
        gerente:pixEnvio.gerente,
        rota:pixEnvio.rota,
        mensagem:pixEnvio.mensagem,
      });
      onPixEnviosChange?.([envio,...pixEnvios]);
      setPixEnvio(v=>({...v,mensagem:""}));
      setCartaoPix(null);
      setPixOk(`Aviso PIX enviado para ${envio.gerente}${envio.rota?` · ${envio.rota}`:""}.`);
    }catch(err){
      setPixErro(err.message||"Não foi possível enviar o aviso PIX.");
    }finally{
      setPixSalvando(false);
    }
  }

  const statusSelecionadoWorkbench = {
    ...statusDaRotaFechamento({ gerente: gerenteSelecionado, rota: rotaDetalheAtiva }),
    texto: fechamentoDetalheStatusTexto,
  };
  const prazoConteudo = (
    <div className="prorrogacao-despesas-conteudo">
      <div className="prorrogacao-despesas-head">
        <div>
          <span className="dash-kicker">Controle de prazos</span>
          <h3>Prorrogação para lançamento de despesas</h3>
          <p>Libere uma competência fechada para um gerente por prazo determinado.</p>
        </div>
      </div>
      <div className="prorrogacao-despesas-form">
        <div className="campo">
          <label>Gerente</label>
          <select value={prorrogacaoForm.gerente} onChange={e=>setProrrogacaoForm(prev=>({...prev,gerente:e.target.value}))}>
            {GERENTES.map(gerente=><option key={gerente} value={gerente}>{gerente}</option>)}
          </select>
        </div>
        <div className="campo">
          <label>Competência</label>
          <input type="month" value={prorrogacaoForm.competencia} onChange={e=>setProrrogacaoForm(prev=>({...prev,competencia:e.target.value}))}/>
        </div>
        <div className="campo">
          <label>Prazo final</label>
          <input type="datetime-local" value={prorrogacaoForm.expiraEm} onChange={e=>setProrrogacaoForm(prev=>({...prev,expiraEm:e.target.value}))}/>
        </div>
        <button className="btn-primario" type="button" onClick={salvarProrrogacao} disabled={prorrogacaoSalvando}>{prorrogacaoSalvando?"Salvando...":"Liberar prazo"}</button>
      </div>
      {prorrogacaoErro&&<div className="erro-box">{prorrogacaoErro}</div>}
      {prorrogacaoOk&&<div className="sucesso-box">{prorrogacaoOk}</div>}
      {prorrogacoesDespesas.length>0&&(
        <div className="prorrogacao-despesas-lista">
          {prorrogacoesDespesas.map(item=>{
            const vigente=item.ativo&&Date.parse(item.expiraEm)>Date.now();
            return <article key={item.id}>
              <div><strong>{item.gerente}</strong><span>{formatarMesPrestacao(item.competencia)}</span></div>
              <div><small>Prazo final</small><strong>{new Date(item.expiraEm).toLocaleString("pt-BR")}</strong></div>
              <span className={`prorrogacao-status ${vigente?"vigente":"encerrada"}`}>{vigente?"Vigente":"Encerrada"}</span>
              {vigente&&<button className="btn-secundario" type="button" onClick={()=>encerrarProrrogacao(item)}>Encerrar</button>}
            </article>;
          })}
        </div>
      )}
    </div>
  );
  const pixConteudo = (
    <details className="pix-admin-panel fechamento-pix-secondary">
      <summary><span><span className="dash-kicker">Ferramenta secundária</span><strong>Cartões PIX para prestação de contas</strong></span><b>{PIX_CARTOES_PADRAO.length} cartões</b></summary>
      <div className="fechamento-pix-content">
        {(pixErro||pixOk)&&<div className={pixErro?"erro-box":"sucesso-box"}>{pixErro||pixOk}</div>}
        <div className="pix-card-grid">
          {PIX_CARTOES_PADRAO.map(chave=>{
            const banco=chave.visual||perfilBancoPix(chave.banco);
            return <article className={`pix-credit-card ${banco.classe}`} key={chave.id}>
              <div className="pix-card-top">
                <span className="pix-chip"/>
                <span className="pix-contactless">)))</span>
                <strong>{banco.nome}</strong>
              </div>
              <button className="pix-send-link" type="button" onClick={()=>setCartaoPix(chave)}>Enviar para o gerente</button>
              <div className="pix-card-brand">{banco.icone}</div>
              <div className="pix-card-info">
                <strong>{chave.nome}</strong>
                <span>{chave.banco}</span>
                <small>{chave.tipo}: {chave.chave}</small>
              </div>
            </article>;
          })}
        </div>
        {cartaoPix&&(
          <form className="pix-send-panel" onSubmit={enviarAvisoPix}>
            <div>
              <span className="dash-kicker">Enviar PIX</span>
              <h4>{cartaoPix.nome} · {perfilBancoPix(cartaoPix.banco).nome}</h4>
              <p>{cartaoPix.tipo}: {cartaoPix.chave}</p>
            </div>
            <label>Gerente<select value={pixEnvio.gerente} onChange={e=>setPixEnvio({gerente:e.target.value,rota:"",mensagem:pixEnvio.mensagem})}>{GERENTES.map(g=><option key={g}>{g}</option>)}</select></label>
            <label>Rota<select value={pixEnvio.rota} onChange={e=>setPixEnvio({...pixEnvio,rota:e.target.value})}><option value="">Todas as rotas</option>{rotasEnvio.map(r=><option key={r}>{r}</option>)}</select></label>
            <label>Mensagem<textarea value={pixEnvio.mensagem} onChange={e=>setPixEnvio({...pixEnvio,mensagem:e.target.value})} placeholder="Ex: use esta chave para prestar conta deste fechamento."/></label>
            <div className="pix-send-actions">
              <button className="btn-ghost" type="button" onClick={()=>setCartaoPix(null)}>Cancelar</button>
              <button className="btn-primary" disabled={pixSalvando}>{pixSalvando?"Enviando...":"Enviar aviso PIX"}</button>
            </div>
          </form>
        )}
        <div className="pix-listas-grid pix-lista-envios">
          <section>
            <h4>Últimos avisos enviados</h4>
            {pixEnvios.length===0?<p className="dash-vazio">Nenhum aviso PIX enviado ainda.</p>:pixEnvios.slice(0,6).map(envio=>{
              const banco=perfilBancoPix(envio.pixBanco);
              return <article className="pix-chave-card" key={envio.id}>
                <span className={`pix-banco-logo ${banco.classe}`}>{banco.icone}</span>
                <div><strong>{envio.gerente}{envio.rota?` · ${envio.rota}`:""}</strong><span>{banco.nome} · {envio.pixNome} · {envio.pixTipo}</span><small>{envio.enviadoEm?new Date(envio.enviadoEm).toLocaleString("pt-BR"):"Agora"}</small></div>
              </article>;
            })}
          </section>
        </div>
      </div>
    </details>
  );

  return (
    <FechamentoWorkbench
      etapas={etapasFechamento}
      etapaAtual={Math.min(etapaFechamento,5)}
      etapaConcluida={etapaFechamento>5}
      periodo={{
        competencia: competenciaFechamento,
        dia: diaFechamento,
        maxCompetencia: hoje().slice(0,7),
        label: periodoPrestacaoLabel(competenciaFechamento,diaFechamento),
        onCompetenciaChange: valor=>{setCompetenciaFechamento(valor||competenciaFechamentoPadrao());setDiaFechamento("");},
        onDiaChange: valor=>{setDiaFechamento(valor);if(valor)setCompetenciaFechamento(valor.slice(0,7));},
        onMesAnterior: ()=>{setCompetenciaFechamento(competenciaFechamentoPadrao());setDiaFechamento("");},
      }}
      rotas={dadosRotas.map(item=>({...item,status:statusDaRotaFechamento(item)}))}
      selecao={{
        gerente: gerenteSelecionado,
        rota: rotaDetalheAtiva,
        pontos: pontosDetalhe.length,
        equipamentos: equipamentosDetalhe.length,
        rotasDisponiveis: rotasDetalhe,
        status: statusSelecionadoWorkbench,
        onSelecionar: selecionarRotaFechamento,
        onTrocarRota: setRotaSelecionada,
      }}
      financeiro={{
        modalidades: calculosModalidades,
        valores: fechamentoValores,
        totais: {
          entradas: totalEntradasFechamento,
          comissoes: totalComissoesFechamento,
          saidas: totalSaidasFechamento,
          saldoBruto: saldoBrutoFechamento,
          despesasSistema: totalDetalheSistema,
          despesasFinais: totalDetalhe,
          saldoFinal: saldoFinalFechamento,
          comissaoGerente: comissaoGerenteFechamento,
          saldoRepassar: saldoRepassarFechamento,
        },
        formatarMoeda: formatarMoedaPDF,
        onAlterarModalidade: alterarFechamentoModalidade,
        onFormatarComissao: modalidadeId=>alterarFechamentoModalidade(modalidadeId,"comissao",textoMoedaFechamento(fechamentoValores[modalidadeId]?.comissao)),
      }}
      ajustes={{
        playBet: {
          valor: subtrairDespesasPlayBet,
          numero: subtracaoPlayBetFechamento,
          onChange: setSubtrairDespesasPlayBet,
          onBlur: ()=>setSubtrairDespesasPlayBet(textoMoedaFechamento(subtrairDespesasPlayBet)),
        },
        ajudaCusto: {
          valor: ajudaCusto,
          numero: ajudaCustoFechamento,
          onChange: setAjudaCusto,
          onBlur: ()=>setAjudaCusto(textoMoedaFechamento(ajudaCusto)),
        },
        comissaoExtra: {
          permitida: comissaoExtraPermitida,
          valor: comissaoExtra,
          numero: comissaoExtraFechamento,
          onChange: setComissaoExtra,
          onBlur: ()=>setComissaoExtra(textoMoedaFechamento(comissaoExtra)),
        },
      }}
      despesas={{grupos:despesasDetalheAgrupadas,quantidadeLancamentos:despesasDetalhe.length}}
      feedback={{erro:fechamentoErro,sucesso:fechamentoOk}}
      acoes={{
        salvando: fechamentoSalvando,
        isEnviado: Boolean(fechamentoDetalheEnviadoEm),
        isConfirmado: Boolean(fechamentoDetalheConfirmadoEm),
        isFinalizado: Boolean(fechamentoDetalheFinalizadoEm),
        onSalvar: ()=>salvarFechamentoSelecionado(false),
        onEnviar: ()=>salvarFechamentoSelecionado(true),
        onFinalizar: marcarPrestacaoFinalizada,
        onVisualizar: ()=>baixarFechamentoPDF("rota",true),
        onBaixarRota: ()=>baixarFechamentoPDF("rota"),
        onBaixarGerente: ()=>baixarFechamentoPDF("gerente"),
      }}
      prazos={{aberto:prazosAbertos,onFechar:onFecharPrazos,conteudo:prazoConteudo}}
      secondaryTools={pixConteudo}
    />
  );
}

function mesDespesaPrestacao(data) {
  return String(data || "").slice(0, 7);
}

function diaDespesaPrestacao(data) {
  if (!data) return "";
  const dt = new Date(data);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toISOString().slice(0, 10);
}

const MESES_PRESTACAO = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

function formatarMesPrestacao(valor) {
  if (!valor) return "Todos os meses";
  const [ano, mes] = String(valor).split("-");
  const nomeMes = MESES_PRESTACAO[Number(mes) - 1];
  return nomeMes && ano ? `${nomeMes.toLowerCase()} de ${ano}` : "Selecionar mês";
}

function formatarDiaPrestacao(valor) {
  if (!valor) return "Todos os dias";
  const [ano, mes, dia] = String(valor).split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : "Selecionar dia";
}

function periodoPrestacaoLabel(mes, dia) {
  if (dia) return `Dia ${formatarDiaPrestacao(dia)}`;
  if (mes) return `Mês ${formatarMesPrestacao(mes)}`;
  return "Todos os períodos";
}

function diasDoMesPrestacao(anoMes) {
  const [anoTxt, mesTxt] = String(anoMes || hoje().slice(0, 7)).split("-");
  const ano = Number(anoTxt);
  const mes = Number(mesTxt);
  if (!ano || !mes) return [];
  const total = new Date(ano, mes, 0).getDate();
  const primeiroDia = new Date(ano, mes - 1, 1).getDay();
  const vazios = Array.from({ length: primeiroDia }, () => null);
  const dias = Array.from({ length: total }, (_, i) => `${anoTxt}-${String(mes).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`);
  return [...vazios, ...dias];
}

function PrestacaoContasPage({ pontos = [], despesas = [] }) {
  const [aba, setAba] = useState("geral");
  const [competencia, setCompetencia] = useState(hoje().slice(0, 7));
  const [dia, setDia] = useState("");
  const [busca, setBusca] = useState("");
  const [gerenteFiltro, setGerenteFiltro] = useState("Todos");
  const [seletorPeriodo, setSeletorPeriodo] = useState(null);
  const [anoMesPicker, setAnoMesPicker] = useState(Number(hoje().slice(0, 4)));
  const [mesDiaPicker, setMesDiaPicker] = useState(hoje().slice(0, 7));
  const [gerentePDF, setGerentePDF] = useState("Todos");

  const pontoPorId = useMemo(() => new Map(pontos.map(p => [Number(p.id), p])), [pontos]);
  const gerentes = useMemo(() => [...new Set(pontos.map(p => p.gerente).filter(Boolean))].sort((a,b)=>a.localeCompare(b, "pt-BR")), [pontos]);

  const despesasDetalhadas = useMemo(() => despesas.map(d => {
    const ponto = pontoPorId.get(Number(d.pontoId));
    return {
      ...d,
      pontoNome: ponto?.nomeFantasia || (isManagerExpense(d) ? "Despesa do gerente" : `Ponto ${d.pontoId}`),
      dono: ponto?.nomeDono || "",
      gerente: ponto?.gerente || d.gerente || "Sem gerente",
      valor: valorDespesaPrestacao(d),
      mes: mesDespesaPrestacao(d.competencia),
      diaLancamento: diaDespesaPrestacao(d.criadoEm),
    };
  }), [despesas, pontoPorId]);

  const despesasFiltradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return despesasDetalhadas.filter(d => {
      const bateMes = !competencia || d.mes === competencia;
      const bateDia = !dia || d.diaLancamento === dia;
      const bateGerente = gerenteFiltro === "Todos" || d.gerente === gerenteFiltro;
      const bateBusca = !q || [d.pontoNome, d.dono, d.gerente, d.descricao, d.observacao].some(v => String(v || "").toLowerCase().includes(q));
      return bateMes && bateDia && bateGerente && bateBusca;
    }).sort((a,b)=>
      String(a.gerente).localeCompare(String(b.gerente), "pt-BR") ||
      String(a.pontoNome).localeCompare(String(b.pontoNome), "pt-BR") ||
      String(a.descricao).localeCompare(String(b.descricao), "pt-BR")
    );
  }, [despesasDetalhadas, competencia, dia, gerenteFiltro, busca]);

  const totalGeral = despesasFiltradas.reduce((s,d)=>s+d.valor,0);
  const pontosComDespesa = new Set(despesasFiltradas.map(d=>d.pontoId)).size;
  const gerentesComDespesa = new Set(despesasFiltradas.map(d=>d.gerente)).size;
  const porGerente = gerentes.map(gerente => {
    const lista = despesasFiltradas.filter(d => d.gerente === gerente);
    const total = lista.reduce((s,d)=>s+d.valor,0);
    return {
      gerente,
      total,
      despesas: lista.length,
      pontos: new Set(lista.map(d=>d.pontoId)).size,
      maiorDespesa: lista.reduce((maior,d)=>d.valor>maior.valor?d:maior,{valor:0,pontoNome:"-"}),
    };
  }).filter(g=>g.despesas>0).sort((a,b)=>b.total-a.total);
  const gerentesComLancamento = porGerente.map(g=>g.gerente);
  const gerenteSelecionadoPDF = gerentePDF==="Todos" ? (gerenteFiltro==="Todos"?"":gerenteFiltro) : gerentePDF;

  function limparFiltros() {
    setCompetencia(hoje().slice(0, 7));
    setDia("");
    setBusca("");
    setGerenteFiltro("Todos");
    setGerentePDF("Todos");
  }

  function abrirSeletorMes() {
    setAnoMesPicker(Number((competencia || hoje().slice(0, 7)).slice(0, 4)));
    setSeletorPeriodo("mes");
  }

  function selecionarMes(numeroMes) {
    const novoMes = `${anoMesPicker}-${String(numeroMes).padStart(2, "0")}`;
    setCompetencia(novoMes);
    setDia("");
    setSeletorPeriodo(null);
  }

  function abrirSeletorDia() {
    setMesDiaPicker((dia || competencia || hoje()).slice(0, 7));
    setSeletorPeriodo("dia");
  }

  function selecionarDia(novoDia) {
    setDia(novoDia);
    setCompetencia(novoDia.slice(0, 7));
    setSeletorPeriodo(null);
  }

  function linhasPrestacaoPDF(lista) {
    return lista.map(d=>[
      d.gerente||"-",
      d.pontoNome||"-",
      d.descricao||"-",
      d.mes?formatarMesPrestacao(d.mes):"-",
      d.diaLancamento?formatarDiaPrestacao(d.diaLancamento):"-",
      formatarMoedaPDF(d.valor),
      d.observacao||"-",
    ]);
  }

  function resumoPrestacaoPDF(lista, tituloEscopo) {
    return [
      {label:"Escopo",valor:tituloEscopo},
      {label:"Período",valor:periodoPrestacaoLabel(competencia,dia)},
      {label:"Total",valor:formatarMoedaPDF(lista.reduce((s,d)=>s+d.valor,0)),destaque:[201,125,0]},
      {label:"Lançamentos",valor:lista.length},
      {label:"Gerentes",valor:new Set(lista.map(d=>d.gerente)).size,destaque:[37,99,235]},
      {label:"Pontos",valor:new Set(lista.map(d=>d.pontoId)).size,destaque:[5,150,82]},
    ];
  }

  async function baixarPrestacaoPDF(tipo) {
    if (despesasFiltradas.length===0) {
      window.alert("Nenhuma despesa encontrada para gerar o PDF.");
      return;
    }
    const colunas = ["Gerente","Ponto","Descrição","Mês","Data","Valor","Observação"];
    if (tipo==="gerente") {
      if (!gerenteSelecionadoPDF) {
        window.alert("Selecione um gerente com lançamentos para gerar o PDF.");
        return;
      }
      const lista = despesasFiltradas.filter(d=>d.gerente===gerenteSelecionadoPDF);
      await gerarPDF({
        titulo:`Prestação de Contas - ${gerenteSelecionadoPDF}`,
        descricao:`Conferência individual do gerente | ${periodoPrestacaoLabel(competencia,dia)}`,
        nomeArquivo:`neptera_prestacao_${slugArquivoBackup(gerenteSelecionadoPDF)}_${competencia||"todos"}${dia?`_${dia}`:""}.pdf`,
        total:lista.length,
        resumo:resumoPrestacaoPDF(lista, gerenteSelecionadoPDF),
        colunas,
        linhas:linhasPrestacaoPDF(lista),
      });
      return;
    }
    if (tipo==="todos-gerentes") {
      const secoes = porGerente.map(g=>{
        const lista = despesasFiltradas.filter(d=>d.gerente===g.gerente);
        return {
          titulo:`Gerente: ${g.gerente} | Total: ${formatarMoedaPDF(g.total)}`,
          colunas,
          linhas:linhasPrestacaoPDF(lista),
        };
      });
      await gerarPDF({
        titulo:"Prestação de Contas por Gerente",
        descricao:`PDF separado por seções de gerente | ${periodoPrestacaoLabel(competencia,dia)}`,
        nomeArquivo:`neptera_prestacao_por-gerente_${competencia||"todos"}${dia?`_${dia}`:""}.pdf`,
        total:despesasFiltradas.length,
        resumo:resumoPrestacaoPDF(despesasFiltradas, "Todos os gerentes"),
        secoes,
      });
      return;
    }
    await gerarPDF({
      titulo:"Prestação de Contas Geral",
      descricao:`Conferência geral das despesas lançadas | ${periodoPrestacaoLabel(competencia,dia)}`,
      nomeArquivo:`neptera_prestacao_geral_${competencia||"todos"}${dia?`_${dia}`:""}.pdf`,
      total:despesasFiltradas.length,
      resumo:resumoPrestacaoPDF(despesasFiltradas, gerenteFiltro==="Todos"?"Geral":gerenteFiltro),
      ...(porGerente.length ? { secoes: porGerente.map(g=>{
        const lista = despesasFiltradas.filter(d=>d.gerente===g.gerente);
        return {
          titulo:`Gerente: ${g.gerente} | Total: ${formatarMoedaPDF(g.total)}`,
          colunas,
          linhas:linhasPrestacaoPDF(lista),
        };
      }) } : { colunas, linhas: linhasPrestacaoPDF(despesasFiltradas) }),
    });
  }

  return (
    <div className="prestacao-page">
      <section className="gestao-intro prestacao-intro">
        <div className="prestacao-faixas" aria-hidden="true">
          <span></span><span></span><span></span><span></span>
        </div>
        <div className="prestacao-intro-texto">
          <span className="gestao-kicker">Área administrativa</span>
          <h2>Prestação de contas dos gerentes</h2>
          <p>Conferência individual e geral das despesas lançadas por ponto, gerente, mês e dia.</p>
        </div>
        <div className="prestacao-intro-resumo">
          <span className="perfil-selo perfil-administrador">Somente Administrador</span>
          <strong>{formatarMoedaPDF(totalGeral)}</strong>
          <small>{despesasFiltradas.length} lançamento{despesasFiltradas.length!==1?"s":""} no recorte atual</small>
        </div>
      </section>

      <section className="prestacao-filtros">
        <div className="prestacao-filtros-titulo">
          <span><Icon name="search"/></span>
          <div>
            <strong>Filtros da conferência</strong>
            <small>Escolha o período, gerente ou pesquise por ponto/descrição.</small>
          </div>
        </div>
        <div className="campo">
          <label>Mês da prestação</label>
          <button type="button" className="periodo-trigger" onClick={abrirSeletorMes}>
            <span>{formatarMesPrestacao(competencia)}</span>
            <small><Icon name="calendar"/> Escolher</small>
          </button>
        </div>
        <div className="campo">
          <label>Dia do lançamento</label>
          <button type="button" className="periodo-trigger" onClick={abrirSeletorDia}>
            <span>{formatarDiaPrestacao(dia)}</span>
            <small><Icon name="calendar"/> Escolher</small>
          </button>
        </div>
        <div className="campo">
          <label>Gerente</label>
          <select value={gerenteFiltro} onChange={e=>setGerenteFiltro(e.target.value)}>
            <option value="Todos">Todos os gerentes</option>
            {gerentes.map(g=><option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div className="campo prestacao-busca">
          <label>Buscar</label>
          <input type="text" placeholder="Ponto, gerente, descrição..." value={busca} onChange={e=>setBusca(e.target.value)} />
        </div>
        <button className="btn-secundario" onClick={limparFiltros}>Limpar</button>
      </section>

      <section className="prestacao-pdf-box">
        <div className="prestacao-pdf-icone"><Icon name="pdf"/></div>
        <div className="prestacao-pdf-info">
          <span className="gestao-kicker">Backup físico</span>
          <h3>Baixar prestação em PDF</h3>
          <p>Use os filtros acima para escolher mês, dia, gerente ou busca. O PDF será gerado exatamente com esse recorte.</p>
        </div>
        <div className="prestacao-pdf-acoes">
          <select value={gerentePDF} onChange={e=>setGerentePDF(e.target.value)}>
            <option value="Todos">Selecionar gerente</option>
            {gerentesComLancamento.map(g=><option key={g} value={g}>{g}</option>)}
          </select>
          <button className="btn-primario" onClick={()=>baixarPrestacaoPDF("geral")}><Icon name="pdf"/> PDF geral</button>
          <button className="btn-secundario" onClick={()=>baixarPrestacaoPDF("gerente")} disabled={!gerenteSelecionadoPDF}><Icon name="user"/> PDF do gerente</button>
          <button className="btn-secundario" onClick={()=>baixarPrestacaoPDF("todos-gerentes")}><Icon name="users"/> PDF por gerentes</button>
        </div>
      </section>

      {seletorPeriodo==="mes"&&(
        <div className="modal-overlay periodo-overlay" onClick={()=>setSeletorPeriodo(null)}>
          <div className="modal modal-periodo" onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <h3>Escolher mês da prestação</h3>
              <button className="modal-fechar" onClick={()=>setSeletorPeriodo(null)} aria-label="Fechar"><Icon name="close"/></button>
            </div>
            <div className="modal-body">
              <div className="periodo-ano-controle">
                <button type="button" className="btn-secundario" onClick={()=>setAnoMesPicker(a=>a-1)}><Icon name="chevronLeft"/> Ano anterior</button>
                <strong>{anoMesPicker}</strong>
                <button type="button" className="btn-secundario" onClick={()=>setAnoMesPicker(a=>a+1)}>Próximo ano <Icon name="chevronRight"/></button>
              </div>
              <div className="periodo-meses-grid">
                {MESES_PRESTACAO.map((mesNome, idx) => {
                  const valor = `${anoMesPicker}-${String(idx + 1).padStart(2, "0")}`;
                  return (
                    <button
                      key={mesNome}
                      type="button"
                      className={competencia===valor?"ativo":""}
                      onClick={()=>selecionarMes(idx + 1)}
                    >
                      {mesNome}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-secundario" onClick={()=>setSeletorPeriodo(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {seletorPeriodo==="dia"&&(
        <div className="modal-overlay periodo-overlay" onClick={()=>setSeletorPeriodo(null)}>
          <div className="modal modal-periodo" onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <h3>Escolher dia do lançamento</h3>
              <button className="modal-fechar" onClick={()=>setSeletorPeriodo(null)} aria-label="Fechar"><Icon name="close"/></button>
            </div>
            <div className="modal-body">
              <div className="periodo-ano-controle">
                <button
                  type="button"
                  className="btn-secundario"
                  onClick={()=>setMesDiaPicker(m=>{
                    const [ano, mes] = m.split("-").map(Number);
                    return new Date(ano, mes - 2, 1).toISOString().slice(0, 7);
                  })}
                >
                  <Icon name="chevronLeft"/> Mês anterior
                </button>
                <strong>{formatarMesPrestacao(mesDiaPicker)}</strong>
                <button
                  type="button"
                  className="btn-secundario"
                  onClick={()=>setMesDiaPicker(m=>{
                    const [ano, mes] = m.split("-").map(Number);
                    return new Date(ano, mes, 1).toISOString().slice(0, 7);
                  })}
                >
                  Próximo mês <Icon name="chevronRight"/>
                </button>
              </div>
              <div className="periodo-semana-grid">
                {["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"].map(diaSemana=><span key={diaSemana}>{diaSemana}</span>)}
              </div>
              <div className="periodo-dias-grid">
                {diasDoMesPrestacao(mesDiaPicker).map((valor, idx) => valor ? (
                  <button
                    key={valor}
                    type="button"
                    className={dia===valor?"ativo":""}
                    onClick={()=>selecionarDia(valor)}
                  >
                    {Number(valor.slice(8, 10))}
                  </button>
                ) : <span key={`vazio-${idx}`} />)}
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-secundario" onClick={()=>{setDia("");setSeletorPeriodo(null);}}>Ver todos os dias</button>
              <button type="button" className="btn-secundario" onClick={()=>setSeletorPeriodo(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      <div className="gestao-abas prestacao-abas">
        <button className={aba==="geral"?"ativo":""} onClick={()=>setAba("geral")}><Icon name="money"/> Valor geral</button>
        <button className={aba==="gerentes"?"ativo":""} onClick={()=>setAba("gerentes")}><Icon name="user"/> Gerente por gerente</button>
        <button className={aba==="todos"?"ativo":""} onClick={()=>setAba("todos")}><Icon name="receipt"/> Todos os lançamentos</button>
      </div>

      {aba==="geral"&&(
        <>
          <section className="prestacao-kpis">
            <article className="prestacao-kpi-total"><span><Icon name="money"/></span><small>Total filtrado</small><strong>{formatarMoedaPDF(totalGeral)}</strong></article>
            <article><span><Icon name="receipt"/></span><small>Lançamentos</small><strong>{despesasFiltradas.length}</strong></article>
            <article><span><Icon name="user"/></span><small>Gerentes</small><strong>{gerentesComDespesa}</strong></article>
            <article><span><Icon name="mapPin"/></span><small>Pontos</small><strong>{pontosComDespesa}</strong></article>
          </section>
          <section className="secao">
            <h2 className="secao-titulo">Resumo por gerente</h2>
            {porGerente.length===0 ? <p className="tabela-vazia">Nenhuma despesa encontrada para os filtros atuais.</p> : (
              <div className="prestacao-gerentes-grid">
                {porGerente.map(g=>(
                  <button key={g.gerente} className="prestacao-gerente-card" onClick={()=>{setGerenteFiltro(g.gerente);setAba("gerentes");}}>
                    <div className="prestacao-gerente-avatar">{g.gerente.slice(0,1).toUpperCase()}</div>
                    <span>{g.gerente}</span>
                    <strong>{formatarMoedaPDF(g.total)}</strong>
                    <small>{g.despesas} lançamento{g.despesas!==1?"s":""} · {g.pontos} ponto{g.pontos!==1?"s":""}</small>
                    <div className="prestacao-gerente-barra"><i style={{width:`${Math.max(8, Math.min(100, totalGeral ? (g.total/totalGeral)*100 : 0))}%`}} /></div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {aba==="gerentes"&&(
        <section className="secao">
          <h2 className="secao-titulo">Prestação individual por gerente</h2>
          {porGerente.length===0 ? <p className="tabela-vazia">Nenhum gerente com despesa nos filtros atuais.</p> : (
            <div className="prestacao-gerente-lista">
              {porGerente.map(g=>(
                <article key={g.gerente} className="prestacao-gerente-detalhe">
                  <div className="prestacao-gerente-topo">
                    <div>
                      <span className="gestao-kicker">Gerente</span>
                      <h3>{g.gerente}</h3>
                    </div>
                    <strong>{formatarMoedaPDF(g.total)}</strong>
                  </div>
                  <div className="prestacao-mini-kpis">
                    <span>{g.despesas} despesas</span>
                    <span>{g.pontos} pontos</span>
                    <span>Maior: {g.maiorDespesa.pontoNome}</span>
                  </div>
                  <div className="tabela-wrapper">
                    <table className="tabela">
                      <thead><tr><th>Ponto</th><th>Descrição</th><th>Mês</th><th>Data</th><th>Valor</th><th>Observação</th></tr></thead>
                      <tbody>
                        {despesasFiltradas.filter(d=>d.gerente===g.gerente).map(d=>(
                          <tr key={d.id}>
                            <td className="td-nome">{d.pontoNome}</td>
                            <td>{d.descricao||"-"}</td>
                            <td className="td-minimo">{d.mes||"-"}</td>
                            <td className="td-minimo">{d.diaLancamento||"-"}</td>
                            <td className="qtd-baixa">{formatarMoedaPDF(d.valor)}</td>
                            <td className="td-obs">{d.observacao||"-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {aba==="todos"&&(
        <section className="secao">
          <div className="tabela-header">
            <h2 className="secao-titulo" style={{margin:0}}>Todos os lançamentos</h2>
            <strong className="prestacao-total-inline">{formatarMoedaPDF(totalGeral)}</strong>
          </div>
          {despesasFiltradas.length===0 ? <p className="tabela-vazia">Nenhuma despesa encontrada.</p> : (
            <div className="tabela-wrapper">
              <table className="tabela">
                <thead><tr><th>Gerente</th><th>Ponto</th><th>Descrição</th><th>Mês</th><th>Data</th><th>Valor</th><th>Observação</th></tr></thead>
                <tbody>
                  {despesasFiltradas.map(d=>(
                    <tr key={d.id}>
                      <td><span className="badge-cat">{d.gerente}</span></td>
                      <td className="td-nome">{d.pontoNome}</td>
                      <td>{d.descricao||"-"}</td>
                      <td className="td-minimo">{d.mes||"-"}</td>
                      <td className="td-minimo">{d.diaLancamento||"-"}</td>
                      <td className="qtd-baixa">{formatarMoedaPDF(d.valor)}</td>
                      <td className="td-obs">{d.observacao||"-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function statusPagamentoConserto(item){
  if(item.consertoPagamentoStatus)return item.consertoPagamentoStatus;
  if(item.consertoPagamentoConfirmadoEm)return"pago";
  if(item.consertoPix||item.consertoFormaPagamento||Number(item.consertoValor||0)>0||item.consertoNotaArquivo||item.consertoNotaNome)return"solicitado";
  if(item.consertoDefeito)return"comunicado";
  return"";
}

function solicitacaoConsertoPendente(item){
  return statusPagamentoConserto(item)==="comunicado";
}

function rotuloPerfilHistorico(perfil){
  const valor=String(perfil||"").trim();
  return valor?valor.charAt(0).toLocaleUpperCase("pt-BR")+valor.slice(1).toLocaleLowerCase("pt-BR"):"";
}

function dataLegivelHistoricoEquipamento(evento){
  const data=String(evento?.data||"").trim();
  if(data)return data.replace(/,\s*/," às ");
  const instante=new Date(evento?.createdAt||"");
  return Number.isNaN(instante.getTime())?"Data não informada":instante.toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"}).replace(/,\s*/," às ");
}

function apresentacaoHistoricoEquipamento(evento){
  const observacao=String(evento?.observacao||"").trim();
  const autorNome=String(evento?.executadoPorNomeSnapshot||"").trim();
  const autorPerfil=rotuloPerfilHistorico(evento?.executadoPorPerfilSnapshot);
  const titulos={
    cadastro:"Equipamento cadastrado",
    edicao:"Equipamento atualizado",
    exclusao:"Equipamento excluído",
    ponto:"Enviado para ponto",
    envio_gerente:"Enviado para gerente",
    recebimento_gerente:"Recebido pelo gerente",
    conserto:"Movimentação de conserto",
    disponivel:"Equipamento disponibilizado",
    retorno:"Retornado do conserto",
    entrada:"Entrada registrada",
    saida:"Saída registrada",
    defeito:"Defeito registrado",
    baixa:"Baixa registrada",
  };
  let contextoLabel="";
  let contextoValor="";
  if(evento?.tipo==="envio_gerente"){
    contextoLabel="Destino";
    contextoValor=observacao.match(/enviado para gerente:\s*([^|]+)/i)?.[1]?.trim()||"";
  }else if(evento?.tipo==="recebimento_gerente"){
    contextoLabel="Recebido por";
    contextoValor=String(evento?.responsavel||"").trim();
  }else if(evento?.tipo==="ponto"){
    contextoLabel="Destino";
    contextoValor=observacao.match(/destino:\s*([^|]+)/i)?.[1]?.trim()||"";
  }
  const observacaoNormalizada=observacao.toLocaleLowerCase("pt-BR");
  const detalheRedundante=(contextoValor&&observacaoNormalizada.includes(contextoValor.toLocaleLowerCase("pt-BR")))
    ||(evento?.tipo==="cadastro"&&/equipamento (cadastrado|incluído)/i.test(observacao));
  return{
    titulo:titulos[evento?.tipo]||HIST_CFG[evento?.tipo]?.label||evento?.tipo||"Movimentação registrada",
    contextoLabel,
    contextoValor,
    autorNome,
    autorPerfil,
    autorTexto:autorNome?`${autorNome}${autorPerfil?` · ${autorPerfil}`:""}`:"Autor não registrado",
    data:dataLegivelHistoricoEquipamento(evento),
    detalhe:detalheRedundante?"":observacao,
  };
}

function FichaEquipamento({ item, historico, onFechar, onEditar, onMovimentar, onCompletarConserto, onConfirmarPagamento, podeEditar, somenteLeitura=false, perfilAtual }) {
  const [notaAberta,setNotaAberta]=useState(false);
  const movimentos=historico.filter(h=>h.itemId===item.id);
  const operador=perfilAtual?.perfil==="operador";
  const admin=perfilAtual?.perfil==="administrador";
  const emConserto=item.status==="Em conserto";
  const pagamentoStatus=statusPagamentoConserto(item);
  const consertoComDadosOperador=pagamentoStatus==="solicitado"||pagamentoStatus==="pago";
  const pagamentoSolicitado=pagamentoStatus==="solicitado";
  const pagamentoPago=pagamentoStatus==="pago";
  return(
    <>
      <OperationModal
        title="Ficha do equipamento"
        subtitle={`${item.nome} · ${item.categoria}`}
        onClose={onFechar}
        size="lg"
        className="modal-ficha"
        footer={podeEditar&&!somenteLeitura&&!(admin&&emConserto)?<><button className="btn-secundario" type="button" onClick={()=>{onFechar();onEditar(item);}}>Editar</button><button className="btn-primario" type="button" onClick={()=>{onFechar();onMovimentar(item);}}>Movimentar</button></>:null}
      >
        <div className="modal-body">
          <div className="ficha-cabecalho">
            <div><h2><OperationIcon className="ficha-equipamento-icone" name={ICONES[item.categoria]} size={24}/><span>{item.nome}</span></h2></div>
            <span className={`badge-status ${STATUS_CFG[item.status]?.cor||""}`}>{item.status}</span>
          </div>
          <div className="ficha-dados">
            <div><small>Categoria</small><strong>{item.categoria}</strong></div>
            <div><small>Local atual</small><strong>{textoLocalizacaoEquipamento(item)}</strong></div>
            <div><small>Responsável</small><strong>{item.responsavel||"-"}</strong></div>
            {item.gerenteResponsavel&&<div><small>Gerente vinculado</small><strong>{item.gerenteResponsavel}</strong></div>}
            {item.transferenciaStatus===TRANSFERENCIA_GERENTE.aguardando&&<div><small>Recebimento</small><strong>Aguardando confirmação</strong></div>}
            <div><small>Cadastro</small><strong>{item.dataCadastro||"-"}</strong></div>
          </div>
          {(item.consertoDefeito||item.consertoPix||item.consertoValor||item.consertoNotaArquivo)&&(
            <div className="ficha-conserto-card">
              <div>
                <span className="dash-kicker">{consertoComDadosOperador?"Solicitação de pagamento do conserto":"Comunicado para conserto"}</span>
                <h4>{consertoComDadosOperador?"Dados enviados pelo operador":"Aguardando o operador completar os dados"}</h4>
              </div>
              <div className="ficha-conserto-grid">
                <div><small>Defeito</small><strong>{item.consertoDefeito||"-"}</strong></div>
                <div><small>Valor</small><strong>{formatarMoedaPDF(item.consertoValor||0)}</strong></div>
                <div><small>Forma</small><strong>{item.consertoFormaPagamento||"-"}</strong></div>
                <div className="ficha-conserto-pix"><small>PIX / Detalhe</small><strong>{item.consertoPix||"-"}</strong></div>
                <div><small>Status financeiro</small><strong>{pagamentoPago?"Pago":pagamentoSolicitado?"Aguardando pagamento":"Aguardando operador"}</strong></div>
                <div><small>Nota fiscal</small><strong>{item.consertoNotaNome||"-"}</strong></div>
              </div>
              {item.consertoNotaArquivo&&(
                <button className="btn-secundario" type="button" onClick={()=>setNotaAberta(true)}>Visualizar nota fiscal</button>
              )}
              {operador&&(emConserto||pagamentoStatus==="comunicado")&&!somenteLeitura&&(
                <button className="btn-primario ficha-conserto-acao" type="button" disabled={pagamentoSolicitado} onClick={()=>{onFechar();onCompletarConserto(item);}}>
                  {pagamentoSolicitado?"Aguardando pagamento do admin":pagamentoPago?"Concluir conserto":pagamentoStatus==="comunicado"?"Analisar e aprovar conserto":"Completar dados do conserto"}
                </button>
              )}
              {admin&&emConserto&&pagamentoSolicitado&&!somenteLeitura&&(
                <button className="btn-primario ficha-conserto-acao" type="button" onClick={()=>onConfirmarPagamento(item)}>Confirmar pagamento realizado</button>
              )}
              {admin&&emConserto&&(!pagamentoSolicitado||somenteLeitura)&&(
                <p className="ficha-conserto-aviso">Administração apenas acompanha. O operador é responsável por nota, PIX, valor e retorno do conserto.</p>
              )}
            </div>
          )}
          <h4 className="ficha-subtitulo">Linha do tempo</h4>
          <div className="ficha-historico">
            {movimentos.length===0?<p className="dash-vazio">Nenhuma movimentação registrada.</p>:movimentos.map(h=>{
              const evento=apresentacaoHistoricoEquipamento(h);
              return <article className="ficha-evento" key={h.id}>
                <span className={`badge-hist ${HIST_CFG[h.tipo]?.cor||""}`}>{HIST_CFG[h.tipo]?.label||h.tipo}</span>
                <div className="ficha-evento-conteudo">
                  <strong className="ficha-evento-titulo">{evento.titulo}</strong>
                  {evento.contextoValor&&<dl className="ficha-evento-contexto"><div><dt>{evento.contextoLabel}</dt><dd>{evento.contextoValor}</dd></div></dl>}
                  <div className={`ficha-evento-autoria${evento.autorNome?"":" is-unknown"}`}><small>{evento.autorNome?"Realizado por":"Autoria"}</small><b>{evento.autorTexto}</b></div>
                  <time>{evento.data}</time>
                  {evento.detalhe&&<p>{evento.detalhe}</p>}
                </div>
              </article>;
            })}
          </div>
        </div>
      </OperationModal>
      {notaAberta&&(
        <OperationModal title="Nota fiscal do conserto" subtitle={item.consertoNotaNome||item.nome} onClose={()=>setNotaAberta(false)} size="xl" className="nota-preview-modal" overlayClassName="nota-preview-overlay" footer={<><a className="btn-secundario" href={item.consertoNotaArquivo} download={item.consertoNotaNome||"nota-fiscal-conserto.jpg"}>Baixar imagem</a><button className="btn-primario" type="button" onClick={()=>setNotaAberta(false)}>Fechar</button></>}>
            <div className="nota-preview-corpo">
              <img src={item.consertoNotaArquivo} alt={`Nota fiscal ${item.consertoNotaNome||item.nome}`}/>
            </div>
        </OperationModal>
      )}
    </>
  );
}

function formatarHoraMensagem(data) {
  if (!data) return "";
  const dt = new Date(data);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" });
}

function pareceEmail(valor) {
  return String(valor || "").includes("@");
}

function notificacaoDisponivel() {
  return typeof window !== "undefined" && "Notification" in window;
}

const CHAT_OPERADOR = "Operador";

function ChatInterno({ perfilAtual, gerentes = [] }) {
  const [aberto, setAberto] = useState(false);
  const [mensagens, setMensagens] = useState([]);
  const [gerenteSelecionado, setGerenteSelecionado] = useState("");
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [arrastandoChat, setArrastandoChat] = useState(false);
  const [posicaoChat, setPosicaoChat] = useState(()=>{
    try {
      const salvo = JSON.parse(localStorage.getItem("stockon_chat_posicao") || "null");
      return salvo && Number.isFinite(salvo.x) && Number.isFinite(salvo.y) ? salvo : null;
    } catch {
      return null;
    }
  });
  const [permissaoNotificacao, setPermissaoNotificacao] = useState(()=>notificacaoDisponivel() ? Notification.permission : "unsupported");
  const [apelidoAdmin, setApelidoAdmin] = useState(()=>{
    try{return localStorage.getItem("stockon_chat_apelido_admin") || "Administração";}catch{return "Administração";}
  });
  const notificacoesIniciadas = useRef(false);
  const ultimoIdNotificado = useRef(0);
  const chatDrag = useRef({ativo:false,movido:false,dx:0,dy:0});
  const admin = perfilAtual?.perfil === "administrador";
  const operadorChat = perfilAtual?.perfil === "operador";
  const centralChat = admin || operadorChat;
  const gerenteAtual = perfilAtual?.perfil==="gerente" ? (perfilAtual.gerenteNome || perfilAtual.nome || "") : "";
  const gerentesDisponiveis = useMemo(() => [...new Set(gerentes.filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt-BR")), [gerentes]);
  const conversasDisponiveis = useMemo(() => {
    const lista = [CHAT_OPERADOR, ...gerentesDisponiveis.filter(g => normalizarTexto(g) !== normalizarTexto(CHAT_OPERADOR))];
    return [...new Set(lista)];
  }, [gerentesDisponiveis]);
  const gerenteConversa = centralChat ? gerenteSelecionado : gerenteAtual;
  const rotuloConversa = id => operadorChat && id === CHAT_OPERADOR ? "Administração" : id;
  const apelidoAdminFinal = apelidoAdmin.trim() || "Administração";
  const mensagensDaConversa = mensagens;
  const totalMensagens = mensagensDaConversa.length;
  const ultimaMensagem = mensagensDaConversa[mensagensDaConversa.length - 1];

  useEffect(()=>{
    try{localStorage.setItem("stockon_chat_apelido_admin", apelidoAdminFinal);}catch{}
  },[apelidoAdminFinal]);

  function limitarPosicaoChat(x, y) {
    const margem = 10;
    const tamanho = 62;
    const largura = window.innerWidth || document.documentElement.clientWidth || 360;
    const altura = window.innerHeight || document.documentElement.clientHeight || 640;
    return {
      x: Math.min(Math.max(margem, x), Math.max(margem, largura - tamanho - margem)),
      y: Math.min(Math.max(margem, y), Math.max(margem, altura - tamanho - margem)),
    };
  }

  function iniciarArrastoChat(e) {
    if (aberto || e.button > 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    chatDrag.current = {
      ativo: true,
      movido: false,
      sx: e.clientX,
      sy: e.clientY,
      dx: e.clientX - rect.left,
      dy: e.clientY - rect.top,
    };
    setArrastandoChat(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function moverChat(e) {
    if (!chatDrag.current.ativo) return;
    const nova = limitarPosicaoChat(e.clientX - chatDrag.current.dx, e.clientY - chatDrag.current.dy);
    if (Math.abs(e.clientX - chatDrag.current.sx) > 5 || Math.abs(e.clientY - chatDrag.current.sy) > 5) {
      chatDrag.current.movido = true;
    }
    setPosicaoChat(nova);
  }

  function finalizarArrastoChat() {
    if (!chatDrag.current.ativo) return;
    setArrastandoChat(false);
    chatDrag.current.ativo = false;
    if (posicaoChat) {
      try { localStorage.setItem("stockon_chat_posicao", JSON.stringify(posicaoChat)); } catch {}
    }
    setTimeout(()=>{ chatDrag.current.movido = false; }, 80);
  }

  useEffect(() => {
    if (centralChat && !gerenteSelecionado && conversasDisponiveis.length > 0) setGerenteSelecionado(conversasDisponiveis[0]);
  }, [centralChat, gerenteSelecionado, conversasDisponiveis]);

  async function carregar() {
    if (!gerenteConversa) return;
    const dados = await carregarMensagensInternas(gerenteConversa);
    setMensagens(dados);
  }

  useEffect(() => {
    if (!gerenteConversa) return;
    let ativo = true;
    async function atualizar() {
      const dados = await carregarMensagensInternas(gerenteConversa);
      if (ativo) setMensagens(dados);
    }
    atualizar();
    const timer = setInterval(atualizar, aberto ? 8000 : 20000);
    return () => { ativo = false; clearInterval(timer); };
  }, [gerenteConversa, aberto]);

  useEffect(() => {
    if (!aberto || !perfilAtual?.userId) return;
    const ids = mensagens
      .filter(m => m.remetenteId !== perfilAtual.userId && !m.lidaEm)
      .map(m => m.id);
    if (ids.length) marcarMensagensInternasLidas({ ids });
  }, [aberto, mensagens, perfilAtual?.userId]);

  const mensagensNaoLidas = mensagens.filter(m => m.remetenteId !== perfilAtual?.userId && !m.lidaEm).length;
  const resumoGerentes = useMemo(() => {
    return conversasDisponiveis.map(gerente => {
      const lista = gerente === gerenteConversa ? mensagens : [];
      const naoLidas = lista.filter(m => m.remetenteId !== perfilAtual?.userId && !m.lidaEm).length;
      const ultima = lista[lista.length - 1];
      return { gerente, naoLidas, ultima };
    });
  }, [conversasDisponiveis, gerenteConversa, mensagens, perfilAtual?.userId]);

  useEffect(() => {
    if (!perfilAtual?.userId || !notificacaoDisponivel()) return;
    const maiorId = mensagens.reduce((maior, m) => Math.max(maior, Number(m.id) || 0), 0);
    if (!notificacoesIniciadas.current) {
      ultimoIdNotificado.current = maiorId;
      notificacoesIniciadas.current = true;
      return;
    }
    const novas = mensagens.filter(m =>
      Number(m.id) > ultimoIdNotificado.current &&
      m.remetenteId !== perfilAtual.userId
    );
    if (maiorId > ultimoIdNotificado.current) ultimoIdNotificado.current = maiorId;
    if (!novas.length || Notification.permission !== "granted") return;
    if (aberto && !document.hidden) return;
    const ultima = novas[novas.length - 1];
    const autor = ultima.remetentePerfil === "gerente"
      ? (ultima.gerenteNome || "Gerente")
      : (pareceEmail(ultima.remetenteNome) ? "Administração" : (ultima.remetenteNome || "Administração"));
    try {
      new Notification(`NEPTERA • ${autor}`, {
        body: ultima.mensagem,
        icon: NEPTERA.iconeNotificacao,
        tag: `stock-on-chat-${gerenteConversa || "geral"}`,
      });
    } catch {}
  }, [mensagens, perfilAtual?.userId, aberto, gerenteConversa]);

  async function ativarNotificacoes() {
    setErro("");
    if (!notificacaoDisponivel()) {
      setErro("Este navegador não permite notificações do sistema.");
      setPermissaoNotificacao("unsupported");
      return;
    }
    const permissao = await Notification.requestPermission();
    setPermissaoNotificacao(permissao);
    if (permissao !== "granted") setErro("Permissão de notificação não foi liberada no navegador.");
  }

  async function enviar(e) {
    e.preventDefault();
    setErro("");
    if (!gerenteConversa) { setErro("Selecione um contato para iniciar a conversa."); return; }
    setEnviando(true);
    try {
      const nova = await enviarMensagemInterna({
        perfilAtual: {
          ...perfilAtual,
          nome: admin ? apelidoAdminFinal : operadorChat ? (perfilAtual.nome || perfilAtual.loginNome || CHAT_OPERADOR) : gerenteConversa,
        },
        gerenteNome: gerenteConversa,
        destinoTipo: admin
          ? (gerenteConversa===CHAT_OPERADOR ? "operador" : "gerente")
          : operadorChat && gerenteConversa!==CHAT_OPERADOR
            ? "gerente"
            : "administracao",
        mensagem: texto,
      });
      setMensagens(prev => [...prev, nova]);
      setTexto("");
      await carregar();
    } catch (err) {
      setErro(err.message || "Não foi possível enviar a mensagem.");
    } finally {
      setEnviando(false);
    }
  }

  if (!["administrador","operador","gerente"].includes(perfilAtual?.perfil)) return null;

  return (
    <div
      className={`chat-flutuante ${aberto ? "aberto" : ""}`}
      style={!aberto && posicaoChat ? {left:`${posicaoChat.x}px`,top:`${posicaoChat.y}px`,right:"auto",bottom:"auto"} : undefined}
    >
      {!aberto && (
        <button
          className={`chat-bolha ${arrastandoChat ? "arrastando" : ""}`}
          onPointerDown={iniciarArrastoChat}
          onPointerMove={moverChat}
          onPointerUp={finalizarArrastoChat}
          onPointerCancel={finalizarArrastoChat}
          onClick={()=>{ if (!chatDrag.current.movido) setAberto(true); }}
          title="Abrir chat interno"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8 8 0 0 1-8 8H7l-4 3v-5.4A8 8 0 1 1 21 12Z"/><path d="M8 11h8"/><path d="M8 15h5"/></svg>
          {mensagensNaoLidas>0 && <span>{mensagensNaoLidas>9?"9+":mensagensNaoLidas}</span>}
        </button>
      )}
      {aberto && (
        <section className="chat-painel">
          <header className="chat-header">
            <div>
              <span>{centralChat ? "Central de conversas" : "Canal com a administração"}</span>
              <strong>Chat interno</strong>
            </div>
            <button onClick={()=>setAberto(false)} aria-label="Fechar"><Icon name="close"/></button>
          </header>
          <div className={`chat-corpo ${centralChat ? "chat-admin" : "chat-gerente-mode"}`}>
            {centralChat && (
              <aside className="chat-conversas">
                {admin && (
                  <div className="chat-apelido">
                    <label>Assinar como</label>
                    <input type="text" value={apelidoAdmin} onChange={e=>setApelidoAdmin(e.target.value)} placeholder="Administração" />
                  </div>
                )}
                <span className="chat-divisor">Conversas</span>
                <div className="chat-conversas-lista">
                  {resumoGerentes.length===0 ? (
                    <p>Nenhum contato encontrado.</p>
                  ) : resumoGerentes.map(item => (
                    <button key={item.gerente} type="button" className={item.gerente===gerenteConversa ? "ativo" : ""} onClick={()=>setGerenteSelecionado(item.gerente)}>
                      <span>{String(rotuloConversa(item.gerente)).slice(0,1).toUpperCase()}</span>
                      <div>
                        <strong>{rotuloConversa(item.gerente)}</strong>
                        <small>{item.gerente===gerenteConversa && ultimaMensagem ? ultimaMensagem.mensagem : "Abrir conversa"}</small>
                      </div>
                      {item.naoLidas>0 && <em>{item.naoLidas>9?"9+":item.naoLidas}</em>}
                    </button>
                  ))}
                </div>
              </aside>
            )}
            <div className="chat-thread">
              {centralChat && (
                <div className="chat-mobile-seletor">
                  <label>Conversar com</label>
                  <select value={gerenteSelecionado} onChange={e=>setGerenteSelecionado(e.target.value)}>
                    {resumoGerentes.map(item => (
                      <option key={item.gerente} value={item.gerente}>{rotuloConversa(item.gerente)}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="chat-contexto">
                <div className="chat-contexto-avatar">{String(rotuloConversa(gerenteConversa) || "A").slice(0,1).toUpperCase()}</div>
                <div>
                  <span>{centralChat ? "Conversa com" : "Atendimento interno"}</span>
                  <strong>{centralChat ? (rotuloConversa(gerenteConversa) || "Selecione um contato") : "Administração"}</strong>
                  <small>{totalMensagens} mensagem{totalMensagens!==1?"s":""}{ultimaMensagem ? ` · última ${formatarHoraMensagem(ultimaMensagem.criadoEm)}` : ""}</small>
                </div>
              </div>
              {!centralChat && <div className="chat-gerente-fixo"><span>Gerente vinculado</span><strong>{gerenteConversa||"Sem gerente vinculado"}</strong></div>}
              {permissaoNotificacao!=="granted" && (
                <div className="chat-notificacao">
                  <span>Receber aviso quando chegar mensagem</span>
                  <button type="button" onClick={ativarNotificacoes}>
                    {permissaoNotificacao==="denied" ? "Bloqueado" : "Ativar"}
                  </button>
                </div>
              )}
              <div className="chat-lista">
                {!gerenteConversa ? (
                  <p className="chat-vazio">Selecione um contato para ver a conversa.</p>
                ) : mensagensDaConversa.length===0 ? (
                  <p className="chat-vazio">Nenhuma mensagem ainda. Use este canal para deixar tudo registrado.</p>
                ) : mensagensDaConversa.map(m => {
                  const minha = m.remetenteId === perfilAtual.userId;
                  const nomeExibido = minha
                    ? "Você"
                    : m.remetentePerfil==="gerente"
                      ? (m.gerenteNome || m.remetenteNome || "Gerente")
                      : (pareceEmail(m.remetenteNome) ? "Administração" : (m.remetenteNome || "Administração"));
                  return (
                    <article key={m.id} className={`chat-msg ${minha ? "minha" : ""}`}>
                      <div>
                        <strong>{nomeExibido}</strong>
                        <small>{formatarHoraMensagem(m.criadoEm)}</small>
                      </div>
                      <p>{m.mensagem}</p>
                    </article>
                  );
                })}
              </div>
              {erro && <div className="chat-erro">{erro}</div>}
              <form className="chat-form" onSubmit={enviar}>
                <textarea value={texto} onChange={e=>setTexto(e.target.value)} placeholder={gerenteConversa ? "Digite sua mensagem..." : "Selecione uma conversa para enviar"} maxLength={2000}/>
                <button className="btn-primario" disabled={enviando || !texto.trim() || !gerenteConversa}>{enviando ? "Enviando..." : "Enviar"}</button>
              </form>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

// ── Login ─────────────────────────────────────────────────────────────────────
function MarcaLogin(){
  return(
    <section className="login-brand-stage" aria-label="NEPTERA, Plataforma Operacional Integrada, by Anderion Labs">
      <div className="login-brand-plate">
        <picture>
          <source media="(prefers-color-scheme: light)" srcSet={NEPTERA.logoHorizontalEscuro}/>
          <img src={NEPTERA.logoHorizontalClaro} alt="NEPTERA — Plataforma Operacional Integrada, by Anderion Labs"/>
        </picture>
      </div>
      <div className="login-brand-copy">
        <strong>Integra. Gerencia. Evolui.</strong>
        <p>Uma visão contínua da operação, do estoque aos recebíveis.</p>
      </div>
    </section>
  );
}

function TelaLogin({onLogin, avisoInicial="", mensagemInicial="", destinoProtegido=false}){
  const [identificador,setIdentificador]=useState("");
  const [senha,setSenha]=useState("");
  const [erro,setErro]=useState(avisoInicial);
  const [mensagem,setMensagem]=useState(mensagemInicial);
  const [visivel,setVisivel]=useState(false);
  const [carregando,setCarregando]=useState(false);
  const [recuperacaoAberta,setRecuperacaoAberta]=useState(false);
  const [emailConfirmado,setEmailConfirmado]=useState(false);

  async function tentar(e){
    e.preventDefault();setCarregando(true);setErro("");
    let email=identificador.trim().toLowerCase();
    try{
      if(!email.includes("@")){
        const encontrado=await resolverEmailPorLogin(email);
        if(!encontrado){
          setCarregando(false);
          setErro("Login não encontrado. Confira o nome de login informado.");
          setSenha("");
          return;
        }
        email=encontrado;
      }
    }catch{
      setCarregando(false);
      setErro("Não foi possível localizar este login agora. Tente novamente.");
      return;
    }
    const {error}=await supabase.auth.signInWithPassword({email,password:senha});
    setCarregando(false);
    if(error){setErro("Login ou senha incorretos.");setSenha("");}
    else{onLogin();}
  }

  async function recuperarSenha() {
    setErro("");
    setMensagem("");
    if(!identificador.trim()||!identificador.includes("@")){setErro("Para recuperar senha, informe o e-mail real completo.");return;}
    if(/@(nexstock|stockon)\.com$/i.test(identificador.trim())){
      setErro("Este login foi criado apenas no app e não recebe e-mail. Peça ao administrador para trocar seu acesso por um e-mail verdadeiro.");
      return;
    }
    if(!emailConfirmado){setErro("Confirme que este e-mail existe e recebe mensagens antes de continuar.");return;}
    setCarregando(true);
    const {error}=await supabase.auth.resetPasswordForEmail(identificador.trim(), { redirectTo: window.location.origin });
    setCarregando(false);
    if(error){setErro("Não foi possível enviar a recuperação agora. Tente novamente.");return;}
    setMensagem("Enviamos um link para seu e-mail real. Abra-o para cadastrar uma nova senha.");
    setRecuperacaoAberta(false);
    setEmailConfirmado(false);
  }

  return(
    <div className="login-page">
      <div className="login-shell">
        <MarcaLogin/>
        <div className="login-card">
          <div className="login-access-label">Ambiente protegido</div>
          <div className="login-titulo">Acesso à plataforma</div>
          <div className="login-subtitulo">Entre com suas credenciais para continuar.</div>
          {destinoProtegido&&<div className="login-destino-protegido" role="status"><Icon name="lock" className="login-status-icon"/><span>Após entrar, você continuará para o destino protegido solicitado.</span></div>}
          <form className="login-form" onSubmit={tentar}>
            {erro&&<div className="login-erro"><Icon name="lock" className="login-status-icon"/><span>{erro}</span></div>}
            {mensagem&&<div className="login-sucesso"><Icon name="checkCircle" className="login-status-icon"/><span>{mensagem}</span></div>}
            <div className="campo"><label>Login ou e-mail</label><input type="text" placeholder="ex: beu ou seu@email.com" value={identificador} onChange={e=>setIdentificador(e.target.value)} autoFocus/></div>
            <div className="campo"><label>Senha</label>
              <div className="input-senha-wrapper">
                <input type={visivel?"text":"password"} placeholder="Digite sua senha" value={senha} onChange={e=>setSenha(e.target.value)}/>
                <button type="button" className="btn-ver-senha" aria-label={visivel?"Ocultar senha":"Mostrar senha"} onClick={()=>setVisivel(!visivel)}><Icon name={visivel?"eyeOff":"eye"}/></button>
              </div>
            </div>
            <button type="submit" className="btn-login" disabled={carregando||!identificador||!senha}>{carregando?"Entrando...":<>Entrar <Icon name="arrowRight"/></>}</button>
            <button type="button" className="btn-esqueci" disabled={carregando} onClick={()=>{setRecuperacaoAberta(!recuperacaoAberta);setErro("");setMensagem("");}}>Esqueci minha senha</button>
            {recuperacaoAberta&&<div className="recuperacao-box">
              <strong>Recuperação somente por e-mail real</strong>
              <p>O e-mail usado no login precisa possuir caixa de entrada. Se ele foi criado apenas dentro do app, peça ao administrador para trocar seu acesso por um e-mail verdadeiro.</p>
              <label className="recuperacao-check">
                <input type="checkbox" checked={emailConfirmado} onChange={e=>setEmailConfirmado(e.target.checked)}/>
                Confirmo que tenho acesso à caixa de entrada deste e-mail.
              </label>
              <button type="button" className="btn-secundario btn-recuperar" disabled={carregando||!emailConfirmado} onClick={recuperarSenha}>{carregando?"Enviando...":"Enviar link de recuperação"}</button>
            </div>}
          </form>
        </div>
        </div>
    </div>
  );
}

function TelaNovaSenha({onConcluir}) {
  const [novaSenha,setNovaSenha]=useState("");
  const [confirmacao,setConfirmacao]=useState("");
  const [erro,setErro]=useState("");
  const [carregando,setCarregando]=useState(false);

  async function salvar(e) {
    e.preventDefault();
    setErro("");
    if(novaSenha.length<10){setErro("A nova senha precisa ter pelo menos 10 caracteres.");return;}
    if(novaSenha!==confirmacao){setErro("A confirmação da senha está diferente.");return;}
    setCarregando(true);
    const {error}=await supabase.auth.updateUser({password:novaSenha});
    setCarregando(false);
    if(error){setErro("Não foi possível cadastrar a nova senha. Solicite outro link de recuperação.");return;}
    await supabase.auth.signOut();
    onConcluir();
  }

  return(
    <div className="login-page">
      <div className="login-shell">
        <MarcaLogin/>
        <div className="login-card">
          <div className="login-access-label">Segurança da conta</div>
          <div className="login-titulo">Cadastrar nova senha</div>
          <div className="login-subtitulo">Crie uma senha nova para continuar.</div>
          <form className="login-form" onSubmit={salvar}>
            {erro&&<div className="login-erro"><Icon name="lock" className="login-status-icon"/><span>{erro}</span></div>}
            <div className="campo"><label>Nova senha</label><input type="password" placeholder="Mínimo de 10 caracteres" value={novaSenha} onChange={e=>setNovaSenha(e.target.value)} autoFocus/></div>
            <div className="campo"><label>Confirmar nova senha</label><input type="password" value={confirmacao} onChange={e=>setConfirmacao(e.target.value)}/></div>
            <button type="submit" className="btn-login" disabled={carregando||!novaSenha||!confirmacao}>{carregando?"Salvando...":"Salvar nova senha"}</button>
          </form>
        </div>
      </div>
    </div>
  );
}

function ModalAlterarSenha({onFechar}) {
  const [senhaAtual,setSenhaAtual]=useState("");
  const [novaSenha,setNovaSenha]=useState("");
  const [confirmacao,setConfirmacao]=useState("");
  const [erro,setErro]=useState("");
  const [sucesso,setSucesso]=useState(false);
  const [salvando,setSalvando]=useState(false);

  async function salvar(e) {
    e.preventDefault();
    setErro("");
    if(!senhaAtual){setErro("Informe sua senha atual.");return;}
    if(novaSenha.length<10){setErro("A nova senha precisa ter pelo menos 10 caracteres.");return;}
    if(novaSenha!==confirmacao){setErro("A confirmação da nova senha está diferente.");return;}
    if(novaSenha===senhaAtual){setErro("A nova senha deve ser diferente da senha atual.");return;}
    setSalvando(true);
    const {data:{user}}=await supabase.auth.getUser();
    if(!user?.email){setSalvando(false);setErro("Não foi possível identificar o e-mail deste login.");return;}
    const {error:erroSenhaAtual}=await supabase.auth.signInWithPassword({email:user.email,password:senhaAtual});
    if(erroSenhaAtual){setSalvando(false);setErro("A senha atual informada está incorreta.");return;}
    const {error}=await supabase.auth.updateUser({password:novaSenha});
    setSalvando(false);
    if(error){
      setErro(error.message.toLowerCase().includes("password")?"Não foi possível alterar. Confira sua senha atual e tente novamente.":"Não foi possível alterar a senha agora.");
      return;
    }
    setSucesso(true);
  }

  return(
    <OperationModal
      title="Alterar minha senha"
      subtitle={sucesso?"Atualização concluída":"Esta alteração vale somente para o seu próprio login."}
      onClose={onFechar}
      blocked={salvando}
      size="sm"
      footer={sucesso
        ?<button className="btn-primario" type="button" onClick={onFechar}>Fechar</button>
        :<><button type="button" className="btn-secundario" onClick={onFechar}>Cancelar</button><button type="submit" form="alterar-minha-senha-form" className="btn-primario" disabled={salvando}>{salvando?"Salvando...":"Alterar senha"}</button></>}
    >
      {sucesso?(
        <div className="modal-body">
          <div className="senha-sucesso" role="status"><Icon name="check"/> Senha alterada com sucesso.</div>
          <p className="senha-texto">Na próxima entrada, use a nova senha cadastrada.</p>
        </div>
      ):(
        <form id="alterar-minha-senha-form" onSubmit={salvar}>
          <div className="modal-body">
            {erro&&<div className="erro-msg" role="alert"><Icon name="warning"/> {erro}</div>}
            <div className="campo"><label>Senha atual *</label><input type="password" autoComplete="current-password" value={senhaAtual} onChange={e=>setSenhaAtual(e.target.value)} data-so-autofocus="true"/></div>
            <div className="campo"><label>Nova senha *</label><input type="password" autoComplete="new-password" placeholder="Mínimo de 10 caracteres" value={novaSenha} onChange={e=>setNovaSenha(e.target.value)}/></div>
            <div className="campo"><label>Confirmar nova senha *</label><input type="password" autoComplete="new-password" value={confirmacao} onChange={e=>setConfirmacao(e.target.value)}/></div>
          </div>
        </form>
      )}
    </OperationModal>
  );
}

function prazoEmailTemporario(data) {
  if (!data) return "sem data limite configurada";
  const diff = new Date(data).getTime() - Date.now();
  if (diff <= 0) return "vencido";
  const dias = Math.ceil(diff / 86400000);
  return `${dias} dia${dias !== 1 ? "s" : ""}`;
}

function nomeBaseGerente(nome) {
  return String(nome || "Gerente").trim().split(/\s+/)[0] || "Gerente";
}

// ── App principal ─────────────────────────────────────────────────────────────
export default function App(){
  const [logado,setLogado]=useState(false);
  const [verificando,setVerificando]=useState(true);
  const [erroSessao,setErroSessao]=useState("");
  const [mensagemLogin,setMensagemLogin]=useState("");
  const [recuperandoSenha,setRecuperandoSenha]=useState(()=>recuperacaoIniciada());
  const [revisaoLocalizacao,setRevisaoLocalizacao]=useState(0);
  const rotaPatrimonio=useMemo(
    ()=>parsePatrimonioRoute(typeof window==="undefined"?"/":window.location.pathname),
    [revisaoLocalizacao],
  );

  useEffect(()=>{
    let ativo=true;
    comPrazo(supabase.auth.getSession(),"seu login",8000)
      .then(({data:{session}})=>{
        if(!ativo)return;
        setLogado(!!session);
        setVerificando(false);
      })
      .catch(()=>{
        if(!ativo)return;
        setErroSessao("Não foi possível recuperar seu acesso salvo. Informe seu e-mail e senha novamente.");
        setLogado(false);
        setVerificando(false);
      });
    const {data:{subscription}}=supabase.auth.onAuthStateChange((evento,session)=>{
      if(!ativo)return;
      if(evento==="PASSWORD_RECOVERY"){setRecuperandoSenha(true);setVerificando(false);return;}
      setLogado(!!session);
      setVerificando(false);
      if(session)setErroSessao("");
    });
    return()=>{ativo=false;subscription.unsubscribe();};
  },[]);

  useEffect(()=>{
    const atualizarRota=()=>setRevisaoLocalizacao(valor=>valor+1);
    window.addEventListener("popstate",atualizarRota);
    return()=>window.removeEventListener("popstate",atualizarRota);
  },[]);

  if(verificando)return(
    <div className="login-page sessao-verificando">
      <img src={NEPTERA.simbolo} alt="NEPTERA"/>
      <div className="loading-dots"><span/><span/><span/></div>
      <p>Preparando acesso à plataforma...</p>
    </div>
  );
  if(recuperandoSenha)return<TelaNovaSenha onConcluir={()=>{limparRecuperacao();setRecuperandoSenha(false);setLogado(false);setMensagemLogin("Senha alterada com sucesso. Entre com sua nova senha.");}}/>;
  if(!logado)return<TelaLogin avisoInicial={erroSessao} mensagemInicial={mensagemLogin} destinoProtegido={Boolean(rotaPatrimonio)} onLogin={()=>{setMensagemLogin("");setLogado(true);}}/>;
  const sair=async()=>{await Auth.deslogar();setLogado(false);};
  if(rotaPatrimonio)return<PatrimonioDeepLinkPage route={rotaPatrimonio} onLogout={sair}/>;
  return<Sistema onLogout={sair}/>;
}

// ── Sistema ───────────────────────────────────────────────────────────────────
function Sistema({onLogout}){
  const [itens,setItens]           =useState([]);
  const [historico,setHistorico]   =useState([]);
  const [pontos,setPontos]         =useState([]);
  const [historicoPontos,setHistoricoPontos]=useState([]);
  const [errosHistorico,setErrosHistorico]=useState({equipment:false,point:false});
  const [despesasBackup,setDespesasBackup]=useState([]);
  const [pixEnvios,setPixEnvios]=useState([]);
  const [senhasModalidades,setSenhasModalidades]=useState([]);
  const [modalidadeApps,setModalidadeApps]=useState([]);
  const [carregando,setCarregando] =useState(true);
  const [erroCarregamento,setErroCarregamento]=useState("");
  const [tentativaCarga,setTentativaCarga]=useState(0);
  const [aba,setAba]               =useState(abaInicialDaUrl);
  const [abaEquip,setAbaEquip]     =useState("lista");
  const [filtroCatEquip,setFiltroCatEquip]=useState("Todas");
  const [modalForm,setModalForm]   =useState(false);
  const [modalPontoRapido,setModalPontoRapido]=useState(false);
  const [modalMov,setModalMov]     =useState(null);
  const [contextoMovPonto,setContextoMovPonto]=useState(null);
  const [itemEdit,setItemEdit]     =useState(null);
  const [form,setForm]             =useState(formVazio);
  const [mov,setMov]               =useState(movVazio);
  const [erroForm,setErroForm]     =useState("");
  const [erroMov,setErroMov]       =useState("");
  const [filtroSt,setFiltroSt]     =useState("Todos");
  const [filtroEscopoEquip,setFiltroEscopoEquip]=useState("todos");
  const [busca,setBusca]           =useState("");
  const [filtrosEquipAbertos,setFiltrosEquipAbertos]=useState(false);
  const [excluindo,setExcluindo]   =useState(null);
  const [confirmLogout,setConfirmLogout]=useState(false);
  const [modalSenha,setModalSenha]=useState(false);
  const [temaClaro,setTemaClaro]   =useState(()=>{try{return localStorage.getItem("sc_tema")==="claro";}catch{return false;}});
  const [sidebarAberta,setSidebarAberta]=useState(false);
  const [navegacaoCompacta,setNavegacaoCompacta]=useState(()=>typeof window!=="undefined"&&window.matchMedia?.("(max-width: 1024px)").matches);
  const [dashboardApresentado,setDashboardApresentado]=useState(false);
  const sidebarRef=useRef(null);
  const mainRef=useRef(null);
  const focoAntesSidebarRef=useRef(null);
  const [itemDetalhe,setItemDetalhe]=useState(null);
  const [itemDetalheSomenteLeitura,setItemDetalheSomenteLeitura]=useState(false);
  const [equipamentoFocoId,setEquipamentoFocoId]=useState(null);
  const [dossieEquipamentoAberto,setDossieEquipamentoAberto]=useState(false);
  const [dossieEquipamentoSheet,setDossieEquipamentoSheet]=useState(()=>typeof window!=="undefined"&&window.matchMedia?.("(max-width: 1320px)").matches);
  const dossieEquipamentoRef=useRef(null);
  const focoAntesDossieEquipamentoRef=useRef(null);
  const [buscaGlobal,setBuscaGlobal]=useState("");
  const [paginaItens,setPaginaItens]=useState(1);
  const [gerenteConsulta,setGerenteConsulta]=useState("");
  const [consultaGerenteVisao,setConsultaGerenteVisao]=useState("pontos");
  const [consultaEquipFiltro,setConsultaEquipFiltro]=useState("todos");
  const [buscaGerenteConsulta,setBuscaGerenteConsulta]=useState("");
  const [paginaGerenteConsulta,setPaginaGerenteConsulta]=useState(1);
  const [perfilAtual,setPerfilAtual]=useState({userId:"",nome:"",perfil:"consulta",perfilReal:false,emailTemporario:false,emailTemporarioExpiraEm:""});
  const [perfilCarregado,setPerfilCarregado]=useState(false);
  const [avisoPrazoDespesas,setAvisoPrazoDespesas]=useState(null);
  useEffect(()=>{
    let ativo=true;
    async function init(){
      setCarregando(true);
      setPerfilCarregado(false);
      setErroCarregamento("");
      setErrosHistorico({equipment:false,point:false});
      try{
        const [eq,pts]=await Promise.all([
          comPrazo(carregarEquipamentos(),"os equipamentos"),
          comPrazo(carregarPontos(),"os pontos"),
        ]);
        if(!ativo)return;
        setItens(eq);
        setPontos(pts);
        setCarregando(false);
        const complementos=await Promise.allSettled([
          comPrazo(carregarHistoricoEquipamentos({strict:true}),"o histórico de equipamentos"),
          comPrazo(carregarHistoricoPontos({strict:true}),"o histórico de pontos"),
          comPrazo(carregarPerfilAtual(),"seu perfil de acesso"),
          comPrazo(carregarDespesasMensais(),"as despesas mensais"),
          comPrazo(carregarPixEnvios(),"os avisos PIX"),
          comPrazo(carregarGerenteModalidadeAcessos(),"as senhas das modalidades"),
          comPrazo(carregarModalidadeApps(),"os apps das modalidades"),
        ]);
        if(!ativo)return;
        if(complementos[0].status==="fulfilled")setHistorico(complementos[0].value);else setHistorico([]);
        if(complementos[1].status==="fulfilled")setHistoricoPontos(complementos[1].value);else setHistoricoPontos([]);
        setErrosHistorico({
          equipment:complementos[0].status==="rejected",
          point:complementos[1].status==="rejected",
        });
        if(complementos[2].status==="fulfilled")setPerfilAtual(complementos[2].value);
        if(complementos[3].status==="fulfilled")setDespesasBackup(complementos[3].value);
        if(complementos[4].status==="fulfilled")setPixEnvios(complementos[4].value);
        if(complementos[5].status==="fulfilled")setSenhasModalidades(complementos[5].value);
        if(complementos[6].status==="fulfilled")setModalidadeApps(complementos[6].value);
        setPerfilCarregado(true);
      }catch(e){
        if(!ativo)return;
        setErroCarregamento(e.message||"Não foi possível buscar os dados do sistema.");
        setCarregando(false);
        setPerfilCarregado(true);
      }
    }
    init();
    return()=>{ativo=false;};
  },[tentativaCarga]);

  function toggleTema(){const n=!temaClaro;setTemaClaro(n);try{localStorage.setItem("sc_tema",n?"claro":"escuro");}catch{}}
  useEffect(()=>{
    if(typeof window==="undefined"||!window.matchMedia)return undefined;
    const consulta=window.matchMedia("(max-width: 1024px)");
    const atualizar=()=>setNavegacaoCompacta(consulta.matches);
    atualizar();
    consulta.addEventListener?.("change",atualizar);
    return()=>consulta.removeEventListener?.("change",atualizar);
  },[]);
  useEffect(()=>{
    if(typeof window==="undefined"||!window.matchMedia)return undefined;
    const consulta=window.matchMedia("(max-width: 1320px)");
    const atualizar=()=>{
      setDossieEquipamentoSheet(consulta.matches);
    };
    atualizar();
    consulta.addEventListener?.("change",atualizar);
    return()=>consulta.removeEventListener?.("change",atualizar);
  },[]);
  function restaurarFocoSidebar(){
    const alvo=focoAntesSidebarRef.current;
    focoAntesSidebarRef.current=null;
    if(alvo instanceof HTMLElement)window.requestAnimationFrame(()=>alvo.focus());
  }
  function fecharSidebar(restaurarFoco=true){
    setSidebarAberta(false);
    if(restaurarFoco&&drawerContextual)restaurarFocoSidebar();
  }
  function alternarSidebarContextual(){
    if(sidebarAberta){fecharSidebar();return;}
    focoAntesSidebarRef.current=document.activeElement;
    setSidebarAberta(true);
  }
  function abrirForaDoDrawer(abrir){
    if(!drawerContextual||!sidebarAberta){abrir();return;}
    const alvo=focoAntesSidebarRef.current;
    focoAntesSidebarRef.current=null;
    setSidebarAberta(false);
    window.requestAnimationFrame(()=>{
      if(alvo instanceof HTMLElement&&alvo.isConnected)alvo.focus({preventScroll:true});
      abrir();
    });
  }
  function navegar(novaAba){
    const mesmaAba=novaAba===aba;
    setDossieEquipamentoAberto(false);
    setAba(novaAba);
    atualizarUrlDoModulo(novaAba,{substituir:mesmaAba});
    fecharSidebar(mesmaAba);
    window.requestAnimationFrame(()=>{
      if(!mainRef.current)return;
      mainRef.current.scrollTop=0;
      mainRef.current.focus({preventScroll:true});
    });
  }

  const podeEditar=perfilAtual.perfil==="administrador"||perfilAtual.perfil==="operador";
  const administrador=perfilAtual.perfil==="administrador";
  const operador=perfilAtual.perfil==="operador";
  const acessoDevedores=permissoesDevedores(perfilAtual.perfil,perfilAtual.perfilReal===true).acessar;
  const drawerDevedores=aba==="devedores"&&acessoDevedores;
  const drawerDashboard=aba==="dashboard"&&navegacaoCompacta;
  const drawerContextual=drawerDevedores||drawerDashboard||navegacaoCompacta;
  useEffect(()=>{
    function acompanharHistoricoDoNavegador(){
      setDossieEquipamentoAberto(false);
      setAba(abaInicialDaUrl());
      setSidebarAberta(false);
      window.requestAnimationFrame(()=>{
        if(!mainRef.current)return;
        mainRef.current.scrollTop=0;
        mainRef.current.focus({preventScroll:true});
      });
    }
    window.addEventListener("popstate",acompanharHistoricoDoNavegador);
    return()=>window.removeEventListener("popstate",acompanharHistoricoDoNavegador);
  },[]);
  useEffect(()=>{
    if(!drawerContextual||!sidebarAberta)return undefined;
    const painel=sidebarRef.current;
    if(!painel)return undefined;
    const seletor='button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focaveis=()=>Array.from(painel.querySelectorAll(seletor)).filter(elemento=>elemento.getClientRects().length>0);
    const primeiro=painel.querySelector('.nav-item.active')||focaveis()[0];
    window.requestAnimationFrame(()=>primeiro?.focus());
    function controlarTeclado(evento){
      if(evento.key==="Escape"){
        evento.preventDefault();
        setSidebarAberta(false);
        restaurarFocoSidebar();
        return;
      }
      if(evento.key!=="Tab")return;
      const itens=focaveis();
      if(!itens.length){evento.preventDefault();painel.focus();return;}
      const primeiroItem=itens[0];
      const ultimoItem=itens[itens.length-1];
      if(evento.shiftKey&&document.activeElement===primeiroItem){evento.preventDefault();ultimoItem.focus();}
      else if(!evento.shiftKey&&document.activeElement===ultimoItem){evento.preventDefault();primeiroItem.focus();}
    }
    document.addEventListener("keydown",controlarTeclado);
    return()=>document.removeEventListener("keydown",controlarTeclado);
  },[drawerContextual,sidebarAberta]);
  useEffect(()=>{
    if(aba==="dashboard"&&!navegacaoCompacta&&sidebarAberta)setSidebarAberta(false);
  },[aba,navegacaoCompacta,sidebarAberta]);
  useEffect(()=>{
    const metaTema=document.querySelector('meta[name="theme-color"]');
    if(!metaTema)return;
    const cor=temaClaro?"#f1f3f0":"#111412";
    metaTema.setAttribute("content",cor);
  },[aba,acessoDevedores,temaClaro]);
  const gerentesChat=[...new Set([
    ...GERENTES,
    ...pontos.map(p=>gerenteDaRota(p.gerente)).filter(Boolean),
  ])].sort((a,b)=>a.localeCompare(b,"pt-BR"));
  const gerenteAtual=perfilAtual.perfil==="gerente"?(perfilAtual.gerenteNome||perfilAtual.nome||""):"";
  const gerenteAtualKey=normalizarTexto(gerenteAtual);
  useEffect(()=>{
    if(!perfilCarregado)return;
    const abaPermitida=["dashboard","itens","pontos","historico"].includes(aba)
      ||(aba==="devedores"&&acessoDevedores)
      ||(aba==="buscar-gerentes"&&(administrador||operador))
      ||(aba==="senhas"&&(administrador||Boolean(gerenteAtual)))
      ||(aba==="fechamento"&&administrador)
      ||(aba==="prestacao-gerente"&&Boolean(gerenteAtual))
      ||(aba==="gestao"&&administrador)
      ||(aba==="logins"&&administrador);
    if(abaPermitida)return;
    setAba("dashboard");
    atualizarUrlDoModulo("dashboard",{substituir:true});
  },[aba,acessoDevedores,administrador,gerenteAtual,operador,perfilCarregado]);
  useEffect(()=>{
    function verificarAviso(){
      if(!gerenteAtual){setAvisoPrazoDespesas(null);return;}
      const agora=new Date();
      if(agora.getDate()<27){setAvisoPrazoDespesas(null);return;}
      const ano=agora.getFullYear();
      const mes=agora.getMonth();
      const dia=agora.getDate();
      const dataChave=`${ano}-${String(mes+1).padStart(2,"0")}-${String(dia).padStart(2,"0")}`;
      const chave=`stockon_aviso_prazo_despesas_${normalizarTexto(gerenteAtual)}_${dataChave}`;
      try{if(localStorage.getItem(chave)==="ciente")return;}catch{}
      const ultimoDia=new Date(ano,mes+1,0).getDate();
      const competencia=new Date(ano,mes,1).toLocaleDateString("pt-BR",{month:"long",year:"numeric"});
      setAvisoPrazoDespesas({chave,ultimoDia,competencia});
    }
    verificarAviso();
    const intervalo=window.setInterval(verificarAviso,60*1000);
    return()=>window.clearInterval(intervalo);
  },[gerenteAtual]);
  function confirmarAvisoPrazoDespesas(){
    if(avisoPrazoDespesas?.chave){try{localStorage.setItem(avisoPrazoDespesas.chave,"ciente");}catch{}}
    setAvisoPrazoDespesas(null);
  }
  const podeCadastrarEquipamento=podeEditar||perfilAtual.perfil==="gerente";
  const gerenteNomeBase=nomeBaseGerente(gerenteAtual);
  const gerentesOperacionais=[...new Set([
    ...GERENTES,
    ...pontos.map(p=>gerenteDaRota(p.gerente)).filter(Boolean),
    ...itens.map(i=>i.gerenteResponsavel).filter(Boolean),
  ])].sort((a,b)=>a.localeCompare(b,"pt-BR"));
  const pontosOperacionais=gerenteAtual?pontos.filter(p=>rotaPermitidaAoPerfil(p.gerente, perfilAtual)):pontos;
  const pontosDestinoOperacional=pontosOperacionais.filter(p=>p.situacaoOperacional!=="desativado");
  const pontosOperacionaisNomes=new Set(pontosOperacionais.map(p=>p.nomeFantasia));
  const itensOperacionaisBase=gerenteAtual
    ?itens.filter(i=>pontosOperacionaisNomes.has(i.localizacao)||normalizarTexto(i.gerenteResponsavel)===gerenteAtualKey)
    :itens;
  const itensOperacionais=gerenteAtual
    ?itensOperacionaisBase.filter(i=>i.status!=="Em conserto")
    :itensOperacionaisBase;
  const statusListaVisivel=gerenteAtual?STATUS_LISTA.filter(s=>s!=="Em conserto"):STATUS_LISTA;
  const itensOperacionaisIds=new Set(itensOperacionais.map(i=>i.id));
  const itensOperacionaisNomes=new Set(itensOperacionais.map(i=>i.nome));
  const historicoOperacional=gerenteAtual?historico.filter(h=>itensOperacionaisIds.has(h.itemId)||itensOperacionaisNomes.has(h.itemNome)):historico;
  const ultimoEventoEquipamento=useMemo(()=>{
    const porId=new Map();
    const porNome=new Map();
    historicoOperacional.forEach(evento=>{
      if(evento.itemId!=null&&!porId.has(String(evento.itemId)))porId.set(String(evento.itemId),evento);
      if(evento.itemNome&&!porNome.has(evento.itemNome))porNome.set(evento.itemNome,evento);
    });
    return{porId,porNome};
  },[historicoOperacional]);
  const historicoPontosOperacional=gerenteAtual?historicoPontos.filter(h=>pontosOperacionaisNomes.has(h.nome)):historicoPontos;
  const fontesHistoricoComFalha=[errosHistorico.equipment&&"Equipamentos",errosHistorico.point&&"Pontos"].filter(Boolean);
  const erroHistorico=fontesHistoricoComFalha.length
    ?`Não foi possível carregar o histórico de ${fontesHistoricoComFalha.join(" e ")}. Recarregue a página para tentar novamente.`
    :"";
  const recebimentosPendentes=gerenteAtual?itensOperacionais.filter(i=>normalizarTexto(i.gerenteResponsavel)===gerenteAtualKey&&i.transferenciaStatus===TRANSFERENCIA_GERENTE.aguardando):[];
  const podeMovimentarEquipamento=item=>solicitacaoConsertoPendente(item)
    ?operador
    :podeEditar||(
    perfilAtual.perfil==="gerente"&&
    normalizarTexto(item.gerenteResponsavel)===gerenteAtualKey&&
    item.transferenciaStatus===TRANSFERENCIA_GERENTE.recebido
  );
  const despesasOperacionais=operador
    ?[]
    :gerenteAtual
    ?despesasBackup.filter(d=>pontosOperacionais.some(p=>p.id===d.pontoId)||expenseBelongsToManager(d, gerenteAtual))
    :despesasBackup;

  async function copiarPixAviso(chave){
    try{
      await navigator.clipboard.writeText(chave);
      alert("Chave PIX copiada.");
    }catch{
      alert(`Chave PIX: ${chave}`);
    }
  }

  const estoqueInterno=itensOperacionais.filter(i=>i.status==="Disponível"&&!i.localizacao&&!i.gerenteResponsavel);
  const estoqueGerentes=itensOperacionais.filter(i=>i.status==="Disponível"&&!i.localizacao&&i.gerenteResponsavel);
  const equipamentosEmPontos=itensOperacionais.filter(i=>i.status==="Em rota"&&i.localizacao);
  const equipamentosEmTransitoGerente=itensOperacionais.filter(i=>i.status==="Em rota"&&!i.localizacao&&i.gerenteResponsavel);
  const totalGeral     =itensOperacionais.length;
  const totalDisponivel=gerenteAtual?itensOperacionais.filter(i=>i.status==="Disponível").length:estoqueInterno.length;
  const totalEmRota    =gerenteAtual?itensOperacionais.filter(i=>i.status==="Em rota").length:equipamentosEmPontos.length;
  const totalComGerentes=estoqueGerentes.length+equipamentosEmTransitoGerente.length;
  const solicitacoesConsertoPendentes=itensOperacionais
    .filter(solicitacaoConsertoPendente)
    .sort((a,b)=>(b.consertoSolicitadoEm||"").localeCompare(a.consertoSolicitadoEm||""));
  const totalConserto  =itensOperacionais.filter(i=>i.status==="Em conserto"||solicitacaoConsertoPendente(i)).length;
  const consertosPendentes=itensOperacionais
    .filter(i=>i.status==="Em conserto"&&!solicitacaoConsertoPendente(i))
    .sort((a,b)=>(b.consertoSolicitadoEm||"").localeCompare(a.consertoSolicitadoEm||""));
  const pagamentosConsertoPendentes=itensOperacionais
    .filter(i=>i.status==="Em conserto"&&statusPagamentoConserto(i)==="solicitado")
    .sort((a,b)=>(b.consertoPagamentoSolicitadoEm||b.consertoSolicitadoEm||"").localeCompare(a.consertoPagamentoSolicitadoEm||a.consertoSolicitadoEm||""));

  const porCategoria=CATEGORIAS.map(cat=>{
    const ci=(gerenteAtual?itensOperacionais:estoqueInterno).filter(i=>i.categoria===cat);
    const totalDisp=ci.filter(i=>i.status==="Disponível").length;
    return{categoria:cat,total:ci.length,qtdItens:ci.length,
      disponivel:totalDisp,
      emRota:ci.filter(i=>i.status==="Em rota").length,
      conserto:ci.filter(i=>i.status==="Em conserto").length,
    };
  });
  const inconsistencias=itensOperacionais.filter(item=>
    item.status!=="Em conserto"&&(
      !padronizarNomenclaturaEquipamento(item.nome)
    )
  );
  const pontosComEquipamentos=pontosOperacionais.map(p=>({
    ...p,
    totalEquipamentos:itensOperacionais.filter(i=>i.localizacao===p.nomeFantasia).length,
  })).filter(p=>p.totalEquipamentos>0).sort((a,b)=>b.totalEquipamentos-a.totalEquipamentos);

  const gerenteConsultaAtivo=gerenteConsulta||gerentesOperacionais[0]||"";
  const gerenteConsultaKey=normalizarTexto(gerenteConsultaAtivo);
  const pontosDoGerenteConsulta=gerenteConsultaAtivo?pontos.filter(p=>
    rotaPertenceAoGerente(p.gerente, gerenteConsultaAtivo)||
    normalizarTexto(gerenteDaRota(p.gerente))===gerenteConsultaKey||
    normalizarTexto(p.gerente)===gerenteConsultaKey
  ):[];
  const pontosConsultaNomes=new Set(pontosDoGerenteConsulta.map(p=>normalizarTexto(p.nomeFantasia)));
  const equipamentosDoGerenteConsulta=gerenteConsultaAtivo?itens.filter(i=>
    pontosConsultaNomes.has(normalizarTexto(i.localizacao))||
    normalizarTexto(i.gerenteResponsavel)===gerenteConsultaKey
  ):[];
  const equipamentosConsultaEmPontos=equipamentosDoGerenteConsulta.filter(i=>Boolean(i.localizacao));
  const equipamentosConsultaConserto=equipamentosDoGerenteConsulta.filter(i=>i.status==="Em conserto");
  const equipamentosConsultaSemPonto=equipamentosDoGerenteConsulta.filter(i=>!i.localizacao&&i.status!=="Em conserto");
  const equipamentosConsultaExibidos=consultaEquipFiltro==="gerente"
    ?equipamentosConsultaSemPonto
    :consultaEquipFiltro==="conserto"
      ?equipamentosConsultaConserto
      :consultaEquipFiltro==="pontos"
        ?equipamentosConsultaEmPontos
        :equipamentosDoGerenteConsulta;
  const gerentesConsultaFiltrados=gerentesOperacionais.filter(nome=>normalizarTexto(nome).includes(normalizarTexto(buscaGerenteConsulta)));
  const equipamentosConsultaOrdenados=ordenarEquipamentos(equipamentosConsultaExibidos);
  const itensPorPaginaGerenteConsulta=25;
  const totalPaginasGerenteConsulta=Math.max(1,Math.ceil(equipamentosConsultaOrdenados.length/itensPorPaginaGerenteConsulta));
  const equipamentosConsultaPagina=equipamentosConsultaOrdenados.slice((paginaGerenteConsulta-1)*itensPorPaginaGerenteConsulta,paginaGerenteConsulta*itensPorPaginaGerenteConsulta);
  const tituloEquipamentosConsulta=consultaEquipFiltro==="gerente"
    ?"Equipamentos com o gerente"
    :consultaEquipFiltro==="conserto"
      ?"Consertos encaminhados ao operador"
      :consultaEquipFiltro==="pontos"
        ?"Equipamentos nos pontos"
        :"Equipamentos localizados";
  useEffect(()=>{setPaginaGerenteConsulta(1);},[gerenteConsultaAtivo,consultaEquipFiltro]);

  const filtroCatEquipAtivo=filtroCatEquip;
  const itensFiltrados=itensOperacionais.filter(i=>{
    const mC=filtroCatEquipAtivo==="Todas"||i.categoria===filtroCatEquipAtivo;
    const mS=filtroSt==="Todos"||i.status===filtroSt;
    const mE=filtroEscopoEquip==="todos"||
      (filtroEscopoEquip==="interno"&&i.status==="Disponível"&&!i.localizacao&&(!i.gerenteResponsavel||Boolean(gerenteAtual)))||
      (filtroEscopoEquip==="pontos"&&i.status==="Em rota"&&Boolean(i.localizacao))||
      (filtroEscopoEquip==="gerentes"&&Boolean(i.gerenteResponsavel)&&!i.localizacao)||
      (filtroEscopoEquip==="conserto"&&(i.status==="Em conserto"||solicitacaoConsertoPendente(i)));
    const q=busca.toLowerCase();
    const mB=!busca||[i.nome,i.patrimonio,i.id,i.categoria,i.responsavel,i.localizacao,i.gerenteResponsavel].some(f=>String(f||"").toLowerCase().includes(q));
    return mC&&mS&&mE&&mB;
  });
  const itensOrdenados=ordenarEquipamentos(itensFiltrados);
  const totalPaginasItens=Math.max(1,Math.ceil(itensOrdenados.length/ITENS_POR_PAGINA));
  const itensPagina=itensOrdenados.slice((paginaItens-1)*ITENS_POR_PAGINA,paginaItens*ITENS_POR_PAGINA);
  const equipamentoFoco=itensPagina.find(item=>item.id===equipamentoFocoId)||null;
  const historicoEquipamentoFoco=equipamentoFoco
    ?historicoOperacional.filter(evento=>evento.itemId===equipamentoFoco.id||evento.itemNome===equipamentoFoco.nome).slice(0,5)
    :[];
  const filtrosEquipAtivos=(filtroSt!=="Todos"?1:0)+(filtroCatEquip!=="Todas"?1:0)+(filtroEscopoEquip!=="todos"?1:0);
  const rotuloEscopoEquip={interno:"Estoque interno",pontos:"Em pontos",gerentes:"Com gerentes",conserto:"Conserto"}[filtroEscopoEquip]||"Todos";

  useEffect(()=>{setPaginaItens(1);},[busca,filtroSt,filtroCatEquip,filtroEscopoEquip]);
  useEffect(()=>{
    if(gerenteAtual&&filtroSt==="Em conserto")setFiltroSt("Todos");
  },[gerenteAtual,filtroSt]);
  useEffect(()=>{
    if(!gerenteConsulta&&gerentesOperacionais.length)setGerenteConsulta(gerentesOperacionais[0]);
  },[gerenteConsulta,gerentesOperacionais]);
  useEffect(()=>{setConsultaEquipFiltro("todos");},[gerenteConsultaAtivo]);
  useEffect(()=>{if(paginaItens>totalPaginasItens)setPaginaItens(totalPaginasItens);},[paginaItens,totalPaginasItens]);
  useEffect(()=>{
    if(!equipamentoFocoId||equipamentoFoco)return;
    setEquipamentoFocoId(null);
    setDossieEquipamentoAberto(false);
  },[equipamentoFoco,equipamentoFocoId]);
  useEffect(()=>{
    if(aba!=="itens"||!dossieEquipamentoSheet||!dossieEquipamentoAberto)return undefined;
    const painel=dossieEquipamentoRef.current;
    if(!painel)return undefined;
    const seletor='button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focaveis=()=>Array.from(painel.querySelectorAll(seletor)).filter(elemento=>elemento.getClientRects().length>0);
    const liberarScroll=acquireMainScrollLock();
    const quadro=window.requestAnimationFrame(()=>{
      const alvo=painel.querySelector("[data-equip-dossier-autofocus='true']")||focaveis()[0]||painel;
      alvo.focus({preventScroll:true});
    });
    function controlarTeclado(evento){
      if(evento.key==="Escape"){
        evento.preventDefault();
        evento.stopPropagation();
        setDossieEquipamentoAberto(false);
        return;
      }
      if(evento.key!=="Tab")return;
      const itensFocaveis=focaveis();
      if(!itensFocaveis.length){evento.preventDefault();painel.focus({preventScroll:true});return;}
      const primeiro=itensFocaveis[0];
      const ultimo=itensFocaveis[itensFocaveis.length-1];
      const ativo=document.activeElement;
      if(evento.shiftKey&&(ativo===primeiro||!painel.contains(ativo))){evento.preventDefault();ultimo.focus({preventScroll:true});}
      else if(!evento.shiftKey&&(ativo===ultimo||!painel.contains(ativo))){evento.preventDefault();primeiro.focus({preventScroll:true});}
    }
    document.addEventListener("keydown",controlarTeclado);
    return()=>{
      window.cancelAnimationFrame(quadro);
      document.removeEventListener("keydown",controlarTeclado);
      liberarScroll();
      const alvo=focoAntesDossieEquipamentoRef.current;
      focoAntesDossieEquipamentoRef.current=null;
      if(alvo instanceof HTMLElement&&alvo.isConnected)window.requestAnimationFrame(()=>alvo.focus({preventScroll:true}));
    };
  },[aba,dossieEquipamentoAberto,dossieEquipamentoSheet,equipamentoFocoId]);
  useEffect(()=>{
    if(aba!=="itens"||dossieEquipamentoSheet||!dossieEquipamentoAberto)return undefined;
    function controlarEscape(evento){
      if(evento.key!=="Escape")return;
      evento.preventDefault();
      fecharDossieEquipamento();
    }
    document.addEventListener("keydown",controlarEscape);
    return()=>document.removeEventListener("keydown",controlarEscape);
  },[aba,dossieEquipamentoAberto,dossieEquipamentoSheet]);
  function selecionarEquipamentoFoco(item,gatilho){
    setEquipamentoFocoId(item.id);
    setFiltrosEquipAbertos(false);
    focoAntesDossieEquipamentoRef.current=gatilho instanceof HTMLElement?gatilho:document.activeElement;
    setDossieEquipamentoAberto(true);
  }
  function fecharDossieEquipamento(){
    const alvo=focoAntesDossieEquipamentoRef.current;
    setDossieEquipamentoAberto(false);
    setEquipamentoFocoId(null);
    if(!dossieEquipamentoSheet&&alvo instanceof HTMLElement&&alvo.isConnected)window.requestAnimationFrame(()=>alvo.focus({preventScroll:true}));
  }
  function executarAcaoDossieEquipamento(acao){
    if(!dossieEquipamentoSheet){acao();return;}
    const alvo=focoAntesDossieEquipamentoRef.current;
    focoAntesDossieEquipamentoRef.current=null;
    setDossieEquipamentoAberto(false);
    window.requestAnimationFrame(()=>{
      if(alvo instanceof HTMLElement&&alvo.isConnected)alvo.focus({preventScroll:true});
      acao();
    });
  }
  function abrirNovo(){
    if(!podeCadastrarEquipamento)return;
    setItemEdit(null);
    const inicial={
      ...formVazio,
      quantidade:1,
      dataCadastro:hoje(),
      minimo:5,
      responsavel:gerenteAtual||"",
      gerenteResponsavel:gerenteAtual||"",
      transferenciaStatus:gerenteAtual?TRANSFERENCIA_GERENTE.recebido:"",
      transferenciaRecebidaEm:gerenteAtual?isoAgora():"",
    };
    setForm(inicial);
    setErroForm("");setModalForm(true);
  }
  function abrirFichaEquipamento(item, somenteLeitura=false){
    setItemDetalheSomenteLeitura(somenteLeitura);
    setItemDetalhe(item);
  }
  function abrirEditar(i){if(!podeMovimentarEquipamento(i))return;setItemEdit(i);setForm({...i,quantidade:1});setErroForm("");setModalForm(true);}
  function fecharForm(){setModalForm(false);}
  function abrirMov(item,contexto=null){
    if(!podeMovimentarEquipamento(item))return;
    const inconsistencia=validarItem(item);
    if(inconsistencia){window.alert(`Corrija o cadastro antes de movimentar este equipamento. ${inconsistencia}`);return;}
    setContextoMovPonto(contexto?.ponto||null);
    setModalMov(item);setMov({...movVazio,ponto:item.localizacao||"",gerente:item.gerenteResponsavel||""});setErroMov("");
  }
  function abrirConsertoOperador(item){
    if(perfilAtual.perfil!=="operador"||(item.status!=="Em conserto"&&!solicitacaoConsertoPendente(item)))return;
    const pagamento=statusPagamentoConserto(item);
    if(pagamento==="solicitado"){
      window.alert("Aguardando a administração confirmar o pagamento para concluir este conserto.");
      return;
    }
    setModalMov(item);
    setMov({
      ...movVazio,
      tipoId:pagamento==="pago"?"disponivel":"conserto",
      ponto:item.localizacao||"",
      gerente:item.gerenteResponsavel||"",
      defeito:item.consertoDefeito||"",
      assistencia:item.consertoAssistencia||"",
      previsao:item.consertoPrevisao||"",
      dataRetirada:item.consertoRetiradaEm||"",
      formaPagamento:item.consertoFormaPagamento||"PIX",
      consertoPix:item.consertoPix||"",
      consertoValor:item.consertoValor||"",
      notaFiscalNome:item.consertoNotaNome||"",
      notaFiscalArquivo:item.consertoNotaArquivo||"",
    });
    setErroMov("");
  }
  function fecharMov(){setModalMov(null);setContextoMovPonto(null);}

  function anexarNotaFiscalConserto(arquivo){
    if(!arquivo)return;
    setErroMov("");
    if(!arquivo.type.startsWith("image/")){
      setErroMov("Anexe uma imagem da nota fiscal.");
      return;
    }
    if(arquivo.size>3*1024*1024){
      setErroMov("A foto da nota fiscal deve ter até 3 MB.");
      return;
    }
    const leitor=new FileReader();
    leitor.onload=()=>setMov(prev=>({...prev,notaFiscalNome:arquivo.name,notaFiscalArquivo:String(leitor.result||"")}));
    leitor.onerror=()=>setErroMov("Não foi possível ler a foto da nota fiscal.");
    leitor.readAsDataURL(arquivo);
  }

  async function salvarItem(){
    if(!podeCadastrarEquipamento){setErroForm("Seu perfil permite somente consulta.");return;}
    if(itemEdit&&!podeMovimentarEquipamento(itemEdit)){setErroForm("Este equipamento ainda não está liberado para seu perfil.");return;}
    const localizacao=form.status==="Em rota"?form.localizacao:form.status==="Em conserto"?"Em conserto":"";
    const quantidadeCadastro=itemEdit?1:Math.max(1,Math.min(100,Number(form.quantidade)||1));
    const ff={
      ...form,
      nome:padronizarNomenclaturaEquipamento(form.nome),
      patrimonio:itemEdit?padronizarNomenclaturaEquipamento(form.patrimonio):"",
      quantidade:1,
      minimo:5,
      localizacao,
      dataCadastro:form.dataCadastro||hoje(),
      responsavel:gerenteAtual?gerenteAtual:form.responsavel,
      gerenteResponsavel:gerenteAtual?gerenteAtual:(form.gerenteResponsavel||""),
      transferenciaStatus:gerenteAtual?TRANSFERENCIA_GERENTE.recebido:(form.transferenciaStatus||""),
      transferenciaRecebidaEm:gerenteAtual?(form.transferenciaRecebidaEm||isoAgora()):(form.transferenciaRecebidaEm||""),
    };
    const erro=validarItem(ff);if(erro){setErroForm(erro);return;}
    if(ff.status==="Em rota"&&!ff.localizacao){setErroForm("Selecione o ponto onde este equipamento ficará.");return;}
    if(ff.status==="Em rota"&&!pontosDestinoOperacional.some(p=>p.nomeFantasia===ff.localizacao)){
      setErroForm("Selecione um ponto ativo para receber o equipamento.");return;
    }
    if(itemEdit){
      await salvarEquipamento({...ff,id:itemEdit.id});
      setItens(itens.map(i=>i.id===itemEdit.id?{...ff,id:itemEdit.id}:i));
      const d=[];
      if(itemEdit.status!==ff.status)d.push(`Status: ${itemEdit.status}→${ff.status}`);
      const h={id:Date.now(),tipo:"edicao",itemId:itemEdit.id,itemNome:ff.nome,categoria:ff.categoria,qtdAntes:itemEdit.quantidade,qtdDepois:ff.quantidade,responsavel:"—",observacao:d.length?d.join(" | "):"Dados atualizados",data:agora(),createdAt:isoAgora()};
      const registrado=await adicionarHistoricoEquipamento(h);setHistorico(prev=>[registrado||h,...prev]);
    }else{
      const novos=[];
      const historicos=[];
      for(let idx=0;idx<quantidadeCadastro;idx+=1){
        const itemNovo={...ff,patrimonio:"",quantidade:1};
        const novoId=await salvarEquipamento(itemNovo);
        if(!novoId){setErroForm("Não foi possível salvar todos os equipamentos no banco.");return;}
        novos.push({...itemNovo,id:novoId});
        historicos.push({id:Date.now()+idx,tipo:"cadastro",itemId:novoId,itemNome:ff.nome,categoria:ff.categoria,qtdAntes:0,qtdDepois:1,responsavel:"—",observacao:"Equipamento cadastrado",data:agora(),createdAt:isoAgora()});
      }
      setItens(prev=>[...prev,...novos]);
      const historicosRegistrados=[];
      for(const h of historicos)historicosRegistrados.push(await adicionarHistoricoEquipamento(h)||h);
      setHistorico(prev=>[...historicosRegistrados,...prev]);
    }
    fecharForm();
  }

  async function confirmarRecebimento(item){
    if(!gerenteAtual||normalizarTexto(item.gerenteResponsavel)!==gerenteAtualKey)return;
    const upd={...item,status:"Disponível",localizacao:"",responsavel:gerenteAtual,transferenciaStatus:TRANSFERENCIA_GERENTE.recebido,transferenciaRecebidaEm:isoAgora()};
    await salvarEquipamento(upd);
    setItens(prev=>prev.map(i=>i.id===item.id?upd:i));
    const h={id:Date.now(),tipo:"recebimento_gerente",itemId:item.id,itemNome:item.nome,categoria:item.categoria,qtdAntes:1,qtdDepois:1,responsavel:gerenteAtual,observacao:`Equipamento recebido por ${gerenteAtual}`,data:agora(),createdAt:isoAgora()};
    const registrado=await adicionarHistoricoEquipamento(h);setHistorico(prev=>[registrado||h,...prev]);
  }

  async function salvarPontoRapido(ponto){
    if(!(podeEditar||gerenteAtual)){setErroForm("Seu perfil permite somente consulta.");return;}
    if(gerenteAtual&&!rotaPermitidaAoPerfil(ponto.gerente, perfilAtual)){
      setErroForm("Selecione uma rota liberada para seu acesso.");
      return;
    }
    let novoId;
    try{
      novoId=await salvarPonto(ponto);
    }catch(err){
      const msg=String(err?.message||"").toLowerCase();
      if(msg.includes("duplicate")||msg.includes("unique")||msg.includes("pontos_nome_fantasia")){
        setErroForm("Já existe um ponto com este nome em outra rota. Escolha um nome diferente.");
        return;
      }
      setErroForm("Não foi possível cadastrar o ponto. Tente novamente.");
      return;
    }
    if(!novoId){setErroForm("Não foi possível cadastrar o ponto. Tente novamente.");return;}
    const novoPonto={...ponto,id:novoId};
    setPontos(prev=>[...prev,novoPonto]);
    setForm(prev=>({...prev,status:"Em rota",localizacao:novoPonto.nomeFantasia}));
    const h={id:Date.now(),tipo:"cadastro",nome:novoPonto.nomeFantasia,gerente:novoPonto.gerente,observacao:"Ponto cadastrado durante inclusão de equipamento",data:agora(),createdAt:isoAgora()};
    await adicionarHistoricoPonto(h);
    setHistoricoPontos(prev=>[h,...prev]);
    setModalPontoRapido(false);
  }

  async function excluir(id){
    if(!podeEditar)return;
    const item=itens.find(i=>i.id===id);
    await excluirEquipamento(id);
    setItens(prev=>prev.filter(i=>i.id!==id));
    const h={id:Date.now(),tipo:"exclusao",itemId:id,itemNome:item.nome,categoria:item.categoria,qtdAntes:item.quantidade,qtdDepois:0,responsavel:"—",observacao:"Item removido",data:agora(),createdAt:isoAgora()};
    const registrado=await adicionarHistoricoEquipamento(h);setHistorico(prev=>[registrado||h,...prev]);
    setExcluindo(null);
  }

  async function confirmarMov(){
    if(!modalMov||!podeMovimentarEquipamento(modalMov))return;
    const tipo=TIPOS_MOV.find(t=>t.id===mov.tipoId);
    const erro=validarMov(mov,tipo,perfilAtual.perfil);if(erro){setErroMov(erro);return;}
    if(tipo.id==="gerente"&&!mov.gerente){setErroMov("Selecione o gerente que vai receber este equipamento.");return;}
    if(tipo.id==="ponto"&&!pontosDestinoOperacional.some(p=>p.nomeFantasia===mov.ponto)){
      setErroMov("Selecione um ponto ativo para receber o equipamento.");return;
    }
    setErroMov("");
    try {
      const apenasSolicitarConserto=tipo.id==="conserto"&&perfilAtual.perfil!=="operador";
      const localizacao=apenasSolicitarConserto?modalMov.localizacao:tipo.id==="ponto"?mov.ponto:tipo.id==="conserto"?"Em conserto":"";
      const dadosConserto=tipo.id==="conserto"?{
        consertoDefeito: mov.defeito.trim(),
        consertoAssistencia: "",
        consertoPrevisao: "",
        consertoFormaPagamento: gerenteAtual ? "" : String(mov.formaPagamento||"").trim(),
        consertoRetiradaEm: "",
        consertoPix: gerenteAtual ? "" : String(mov.consertoPix||"").trim(),
        consertoValor: gerenteAtual ? 0 : Number(mov.consertoValor||0),
        consertoNotaNome: gerenteAtual ? "" : (mov.notaFiscalNome || ""),
        consertoNotaArquivo: gerenteAtual ? "" : (mov.notaFiscalArquivo || ""),
        consertoSolicitadoEm: isoAgora(),
        consertoSolicitadoPor: perfilAtual.userId || "",
        consertoPagamentoStatus: apenasSolicitarConserto ? "comunicado" : "solicitado",
        consertoPagamentoSolicitadoEm: perfilAtual.perfil==="operador" ? isoAgora() : (modalMov.consertoPagamentoSolicitadoEm||""),
        consertoPagamentoSolicitadoPor: perfilAtual.perfil==="operador" ? (perfilAtual.userId || "") : (modalMov.consertoPagamentoSolicitadoPor||""),
        consertoPagamentoConfirmadoEm: modalMov.consertoPagamentoConfirmadoEm||"",
        consertoPagamentoConfirmadoPor: modalMov.consertoPagamentoConfirmadoPor||"",
        consertoComunicadoPorGerente: Boolean(gerenteAtual),
      }:{};
      const limparConserto=tipo.id==="disponivel"||tipo.id==="ponto"||tipo.id==="gerente"?{
        consertoDefeito: "",
        consertoAssistencia: "",
        consertoPrevisao: "",
        consertoPix: "",
        consertoValor: 0,
        consertoNotaNome: "",
        consertoNotaArquivo: "",
        consertoSolicitadoEm: "",
        consertoSolicitadoPor: "",
        consertoFormaPagamento: "",
        consertoRetiradaEm: "",
        consertoPagamentoStatus: "",
        consertoPagamentoSolicitadoEm: "",
        consertoPagamentoSolicitadoPor: "",
        consertoPagamentoConfirmadoEm: "",
        consertoPagamentoConfirmadoPor: "",
        consertoComunicadoPorGerente: false,
      }:{};
      const upd=apenasSolicitarConserto
        ?{...modalMov,quantidade:1,status:modalMov.status,localizacao:modalMov.localizacao,responsavel:modalMov.responsavel,gerenteResponsavel:modalMov.gerenteResponsavel,transferenciaStatus:modalMov.transferenciaStatus}
        :tipo.id==="gerente"
        ?{...modalMov,quantidade:1,status:"Em rota",localizacao:"",responsavel:mov.responsavel||mov.gerente,gerenteResponsavel:mov.gerente,transferenciaStatus:TRANSFERENCIA_GERENTE.aguardando,transferenciaEnviadaEm:isoAgora(),transferenciaRecebidaEm:""}
        :tipo.id==="disponivel"&&!gerenteAtual
          ?{...modalMov,quantidade:1,status:tipo.novoStatus,localizacao:"",responsavel:mov.responsavel||modalMov.responsavel,gerenteResponsavel:"",transferenciaStatus:"",transferenciaEnviadaEm:"",transferenciaRecebidaEm:""}
          :{...modalMov,quantidade:1,status:tipo.novoStatus,localizacao,responsavel:mov.responsavel||modalMov.responsavel||gerenteAtual,transferenciaStatus:modalMov.transferenciaStatus,gerenteResponsavel:gerenteAtual||modalMov.gerenteResponsavel};
      const equipamentoAtualizado={...upd,...limparConserto,...dadosConserto};
      await salvarEquipamento(equipamentoAtualizado);
      setItens(prev=>prev.map(i=>i.id===modalMov.id?equipamentoAtualizado:i));
      const detalhe=tipo.id==="ponto"
        ?`Destino: ${mov.ponto}`
        :tipo.id==="conserto"
          ?(apenasSolicitarConserto?`${gerenteAtual?"Gerente":"Administração"} solicitou avaliação do operador | Defeito: ${mov.defeito}`:`Operador aprovou e encaminhou para conserto | Defeito: ${mov.defeito}`)
          :tipo.id==="gerente"
            ?`Enviado para gerente: ${mov.gerente}`
            :tipo.label;
      const informacoesConserto=tipo.id==="conserto"?[
        mov.formaPagamento&&!gerenteAtual&&`Forma de pagamento: ${mov.formaPagamento}`,
        mov.consertoPix&&!gerenteAtual&&mov.formaPagamento==="PIX"&&`PIX conserto: ${mov.consertoPix}`,
        mov.consertoValor&&!gerenteAtual&&`Valor conserto: ${formatarMoedaPDF(mov.consertoValor)}`,
        mov.notaFiscalNome&&!gerenteAtual&&`Nota fiscal: ${mov.notaFiscalNome}`,
      ]:[];
      const h={id:Date.now(),tipo:tipo.id==="gerente"?"envio_gerente":tipo.id,itemId:modalMov.id,itemNome:modalMov.nome,categoria:modalMov.categoria,qtdAntes:1,qtdDepois:1,responsavel:mov.responsavel||mov.gerente||"—",observacao:[detalhe,...informacoesConserto,mov.observacao].filter(Boolean).join(" | "),data:agora(),createdAt:isoAgora()};
      const registrado=await adicionarHistoricoEquipamento(h);setHistorico(prev=>[registrado||h,...prev]);
      if(tipo.id==="conserto"&&apenasSolicitarConserto) window.alert("Solicitação enviada ao operador. O equipamento só entrará em conserto após a aprovação dele.");
      if(tipo.id==="conserto"&&perfilAtual.perfil==="operador") window.alert("Solicitação de pagamento enviada ao financeiro. A administração já pode conferir e confirmar o pagamento.");
      fecharMov();
    } catch (err) {
      setErroMov(err?.message ? `Não foi possível confirmar: ${err.message}` : "Não foi possível confirmar a movimentação.");
    }
  }

  async function confirmarPagamentoConserto(item){
    if(perfilAtual.perfil!=="administrador"||statusPagamentoConserto(item)!=="solicitado")return;
    const ok=window.confirm(`Confirmar pagamento do conserto de ${item.nome} no valor de ${formatarMoedaPDF(item.consertoValor||0)}?`);
    if(!ok)return;
    const atualizado={
      ...item,
      consertoPagamentoStatus:"pago",
      consertoPagamentoConfirmadoEm:isoAgora(),
      consertoPagamentoConfirmadoPor:perfilAtual.userId||"",
    };
    await salvarEquipamento(atualizado);
    setItens(prev=>prev.map(i=>i.id===item.id?atualizado:i));
    setItemDetalhe(atualizado);
    const h={
      id:Date.now(),
      tipo:"conserto",
      itemId:item.id,
      itemNome:item.nome,
      categoria:item.categoria,
      qtdAntes:1,
      qtdDepois:1,
      responsavel:perfilAtual.nome||"Administração",
      observacao:`Administração confirmou o pagamento do conserto | Valor: ${formatarMoedaPDF(item.consertoValor||0)} | Forma: ${item.consertoFormaPagamento||"-"}`,
      data:agora(),
      createdAt:isoAgora(),
    };
    const registrado=await adicionarHistoricoEquipamento(h);
    setHistorico(prev=>[registrado||h,...prev]);
    window.alert("Pagamento confirmado e registrado na linha do tempo do equipamento.");
  }

  async function baixarBackupObrigatorio(){
    const geradoEm=isoAgora();
    const escopo=perfilAtual.perfil==="gerente"?`gerente-${gerenteAtual||perfilAtual.nome}`:"completo";
    const titulo=perfilAtual.perfil==="gerente"
      ?`Backup do Gerente - ${gerenteAtual||perfilAtual.nome}`
      :"Backup Completo NEPTERA";
    const podeVerDespesasBackup=!operador;
    const resumoBackup=[
      {label:"Equipamentos",valor:itensOperacionais.length,destaque:[37,99,235]},
      {label:"Pontos",valor:pontosOperacionais.length,destaque:[15,35,72]},
      ...(podeVerDespesasBackup?[{label:"Despesas",valor:despesasOperacionais.length,destaque:[222,147,0]}]:[]),
      {label:"Mov. Equip.",valor:historicoOperacional.length,destaque:[5,150,82]},
      {label:"Mov. Pontos",valor:historicoPontosOperacional.length,destaque:[100,116,139]},
      {label:"Frequência",valor:"Opcional",destaque:[222,147,0]},
    ];
    const secoesBackup=[
      {
        titulo:"Resumo do backup",
        colunas:["Campo","Informação"],
        linhas:[
          ["Sistema","NEPTERA"],
          ["Gerado em",new Date(geradoEm).toLocaleString("pt-BR")],
          ["Perfil",perfilAtual.perfil||"-"],
          ["Usuário",perfilAtual.nome||perfilAtual.loginNome||"-"],
          ["Login",perfilAtual.loginNome||"-"],
          ["Gerente vinculado",perfilAtual.gerenteNome||gerenteAtual||"-"],
          ["Escopo",perfilAtual.perfil==="gerente"?"Somente dados deste gerente":"Dados completos disponíveis ao perfil"],
        ],
      },
      {
        titulo:"Equipamentos",
        colunas:["Equipamento","Categoria","Status","Ponto / Localização","Gerente"],
        linhas:ordenarEquipamentos(itensOperacionais).map(i=>[
          i.nome||"-",
          i.categoria||"-",
          i.status||"-",
          textoLocalizacaoEquipamento(i),
          i.gerenteResponsavel||"-",
        ]),
      },
      {
        titulo:"Pontos",
        colunas:podeVerDespesasBackup?["Ponto","Dono","Telefone","Gerente","Valor da despesa"]:["Ponto","Dono","Telefone","Gerente"],
        linhas:ordenarPontos(pontosOperacionais).map(p=>[
          p.nomeFantasia||"-",
          p.nomeDono||"-",
          p.telefone||"-",
          p.gerente||"-",
          ...(podeVerDespesasBackup?[p.possuiDespesa==="sim"?formatarMoedaPDF(p.valorDespesa||0):""]:[]),
        ]),
      },
      ...(podeVerDespesasBackup?[{
        titulo:"Despesas mensais",
        colunas:["Ponto","Mês","Descrição","Previsto","Real","Observação"],
        linhas:despesasOperacionais.map(d=>{
          const ponto=pontosOperacionais.find(p=>p.id===d.pontoId);
          return [
            ponto?.nomeFantasia||(isManagerExpense(d)?"Despesa do gerente":`Ponto ${d.pontoId}`),
            d.competencia?new Date(d.competencia).toLocaleDateString("pt-BR",{month:"2-digit",year:"numeric",timeZone:"UTC"}):"-",
            d.descricao||"-",
            formatarMoedaPDF(d.valorPrevisto||0),
            formatarMoedaPDF(d.valorReal||0),
            d.observacao||"-",
          ];
        }),
      }]:[]),
      {
        titulo:"Histórico de equipamentos",
        colunas:["Tipo","Equipamento","Categoria","Responsável","Observação","Data"],
        linhas:historicoOperacional.map(h=>[
          HIST_CFG[h.tipo]?.label||h.tipo||"-",
          h.itemNome||"-",
          h.categoria||"-",
          h.responsavel||"-",
          h.observacao||"-",
          h.data||"-",
        ]),
      },
      {
        titulo:"Histórico de pontos",
        colunas:["Tipo","Ponto","Gerente","Observação","Data"],
        linhas:historicoPontosOperacional.map(h=>[
          h.tipo||"-",
          h.nome||"-",
          h.gerente||"-",
          h.observacao||"-",
          h.data||"-",
        ]),
      },
    ];
    await gerarPDF({
      titulo,
      descricao:`Arquivo opcional de segurança emitido para ${perfilAtual.nome||perfilAtual.loginNome||perfilAtual.perfil}. Guarde fora do sistema quando desejar.`,
      nomeArquivo:`neptera_backup_${slugArquivoBackup(escopo)}_${hoje()}.pdf`,
      total:itensOperacionais.length+pontosOperacionais.length+despesasOperacionais.length+historicoOperacional.length+historicoPontosOperacional.length,
      resumo:resumoBackup,
      secoes:secoesBackup,
    });
    registrarBackupPerfil(perfilAtual);
  }

  function acaoPrimariaEquipamento(item){
    const pendente=item.transferenciaStatus===TRANSFERENCIA_GERENTE.aguardando;
    const emConserto=item.status==="Em conserto";
    const consertoAguardandoOperador=solicitacaoConsertoPendente(item);
    const pagamentoConserto=statusPagamentoConserto(item);
    if(operador&&(emConserto||consertoAguardandoOperador))return{
      label:consertoAguardandoOperador?"Analisar":pagamentoConserto==="pago"?"Concluir":"Completar",
      icon:"wrench",
      disabled:pagamentoConserto==="solicitado",
      title:pagamentoConserto==="solicitado"?"Aguardando pagamento da administração":"",
      onClick:()=>abrirConsertoOperador(item),
    };
    if(pendente&&gerenteAtual)return{label:"Confirmar",icon:"check",onClick:()=>confirmarRecebimento(item)};
    if(podeMovimentarEquipamento(item))return{label:"Movimentar",icon:"transfer",purpose:"move",onClick:()=>abrirMov(item)};
    return{label:"Consultar",icon:"eye",purpose:"detail",onClick:()=>abrirFichaEquipamento(item)};
  }

  function modeloLedgerEquipamento(item,indice){
    const evento=ultimoEventoEquipamento.porId.get(String(item.id))||ultimoEventoEquipamento.porNome.get(item.nome)||null;
    const detalhesEstado=[];
    if(solicitacaoConsertoPendente(item))detalhesEstado.push("Aguardando operador");
    if(item.transferenciaStatus===TRANSFERENCIA_GERENTE.aguardando)detalhesEstado.push("Aguardando confirmação");
    if(item.transferenciaStatus===TRANSFERENCIA_GERENTE.recebido&&item.gerenteResponsavel&&!item.localizacao)detalhesEstado.push("Recebido pelo gerente");
    return{
      id:item.id,
      source:item,
      register:String((paginaItens-1)*ITENS_POR_PAGINA+indice+1).padStart(3,"0"),
      name:item.nome,
      identifier:identificadorVisualEquipamento(item),
      category:item.categoria,
      position:posicaoVisualEquipamento(item),
      link:vinculoVisualEquipamento(item),
      manager:item.gerenteResponsavel||"",
      responsible:item.responsavel||"—",
      state:{label:item.status,className:STATUS_CFG[item.status]?.cor||"",detail:detalhesEstado.join(" · ")},
      movement:evento?{label:HIST_CFG[evento.tipo]?.label||evento.tipo||"—",date:evento.data||"—"}:null,
      attention:item.status==="Em conserto"||solicitacaoConsertoPendente(item),
      selected:equipamentoFoco?.id===item.id,
      primaryAction:acaoPrimariaEquipamento(item),
      canEdit:podeMovimentarEquipamento(item),
      canDelete:podeEditar,
    };
  }

  const linhasEquipamentosLedger=itensPagina.map(modeloLedgerEquipamento);
  const equipamentoFocoLedger=linhasEquipamentosLedger.find(linha=>linha.id===equipamentoFoco?.id)||null;
  const historicoEquipamentoLedger=historicoEquipamentoFoco.map(evento=>{
    const apresentacao=apresentacaoHistoricoEquipamento(evento);
    return{
      id:evento.id,
      icon:(HIST_CFG[evento.tipo]||{icone:"file"}).icone,
      label:apresentacao.titulo,
      detail:apresentacao.detalhe,
      contextLabel:apresentacao.contextoLabel,
      contextValue:apresentacao.contextoValor,
      actor:apresentacao.autorTexto,
      actorKnown:Boolean(apresentacao.autorNome),
      date:apresentacao.data,
    };
  });

  const tipoMovSel=TIPOS_MOV.find(t=>t.id===mov.tipoId);
  const acaoMovimentacao=tipoMovSel?.id==="conserto"&&perfilAtual.perfil!=="operador"?"Solicitar conserto":tipoMovSel?.label||"Definir ação";
  const destinoMovimentacao=tipoMovSel?.id==="ponto"
    ?mov.ponto||"Selecione um ponto"
    :tipoMovSel?.id==="gerente"
      ?mov.gerente||"Selecione um gerente"
      :tipoMovSel?.id==="conserto"
        ?perfilAtual.perfil==="operador"?"Conserto":"Análise do operador"
        :tipoMovSel?.id==="disponivel"
          ?gerenteAtual?`Estoque de ${gerenteAtual}`:"Estoque interno"
          :"A definir";
  const ABAS_EQUIP=[
    {id:"lista",label:`Equipamentos (${itensOperacionais.length})`,icone:"package"},
    {id:"resumo",label:"Resumo por situação",icone:"activity"},
    {id:"historico",label:`Movimentações (${historicoOperacional.length})`,icone:"history"},
  ];

  if(carregando){
    return(
      <div className={`app neptera-loading-page${temaClaro?" tema-claro":""}`}>
        <div className="neptera-loading-card">
          <div className="neptera-loading-mark">
            <span aria-hidden="true"/>
            <img src={NEPTERA.simbolo} alt="NEPTERA"/>
          </div>
          <div className="neptera-loading-copy">
            <strong>{NEPTERA.nome}</strong>
            <span>{NEPTERA.descritor}</span>
            <small>Carregando o ambiente operacional...</small>
          </div>
          <div className="loading-dots"><span/><span/><span/></div>
        </div>
      </div>
    );
  }

  if(erroCarregamento){
    return(
      <div className={`app${temaClaro?" tema-claro":""} carga-erro-page`}>
        <div className="carga-erro-card">
          <img src={temaClaro?NEPTERA.logoHorizontalEscuro:NEPTERA.logoHorizontalClaro} alt="NEPTERA — Plataforma Operacional Integrada"/>
          <h2>Não foi possível carregar o sistema</h2>
          <p>{erroCarregamento}</p>
          <p className="carga-erro-dica">Verifique sua internet e tente novamente. Se continuar, envie uma foto desta mensagem.</p>
          <div>
            <button className="btn-primario" onClick={()=>setTentativaCarga(t=>t+1)}>Tentar novamente</button>
            <button className="btn-secundario" onClick={onLogout}>Voltar ao login</button>
          </div>
        </div>
      </div>
    );
  }

  return(
    <div className={`app operations-shell command-flow-shell module-${aba}${temaClaro?" tema-claro":""}${aba==="dashboard"?" dashboard-shell":""}`}>
      <div className={`sidebar-overlay ${sidebarAberta?"ativo":""}`} onClick={fecharSidebar}/>

      <aside aria-hidden={drawerContextual&&!sidebarAberta?true:undefined} aria-label={drawerContextual?"Navegação principal do NEPTERA":undefined} aria-modal={drawerContextual&&sidebarAberta?"true":undefined} className={`sidebar ${sidebarAberta?"aberta":""}`} id="stock-on-primary-navigation" inert={drawerContextual&&!sidebarAberta?true:undefined} ref={sidebarRef} role={drawerContextual?"dialog":undefined} tabIndex={drawerContextual?-1:undefined}>
        <div className="sidebar-logo">
          <img src={NEPTERA.simboloCompacto} alt="" aria-hidden="true" className="logo-sidebar-emblem"/>
          <strong className="sidebar-brand-name">{NEPTERA.nome}</strong>
          {drawerContextual&&<button className="sidebar-close" type="button" onClick={()=>fecharSidebar()} aria-label="Fechar navegação"><Icon name="close"/></button>}
        </div>
        <BuscaGlobalSearch consulta={buscaGlobal} onConsulta={setBuscaGlobal} itens={itensOperacionais} pontos={pontosOperacionais} historico={historicoOperacional} onVerEquipamento={item=>abrirForaDoDrawer(()=>setItemDetalhe(item))} onAbrirPontos={()=>navegar("pontos")}/>
        <nav className="sidebar-nav" aria-label="Módulos do NEPTERA">
          <span className="nav-section-label">Operação</span>
          <button type="button" className={`nav-item ${aba==="dashboard"?"active":""}`} aria-current={aba==="dashboard"?"page":undefined} onClick={()=>navegar("dashboard")}><Icon name="dashboard" className="nav-icon" /> Dashboard</button>
          <button type="button" className={`nav-item ${aba==="itens"?"active":""}`} aria-current={aba==="itens"?"page":undefined} onClick={()=>navegar("itens")}><Icon name="package" className="nav-icon" /> Equipamentos</button>
          <button type="button" className={`nav-item ${aba==="pontos"?"active":""}`} aria-current={aba==="pontos"?"page":undefined} onClick={()=>navegar("pontos")}><Icon name="mapPin" className="nav-icon" /> Pontos</button>
          {acessoDevedores&&<button type="button" className={`nav-item ${aba==="devedores"?"active":""}`} aria-current={aba==="devedores"?"page":undefined} onClick={()=>navegar("devedores")}><Icon name="fileText" className="nav-icon" /> Devedores</button>}
          {(administrador||operador)&&<button type="button" className={`nav-item ${aba==="buscar-gerentes"?"active":""}`} aria-current={aba==="buscar-gerentes"?"page":undefined} onClick={()=>navegar("buscar-gerentes")}><Icon name="user" className="nav-icon" /> Buscar Gerentes</button>}

          {(gerenteAtual||administrador)&&<span className="nav-section-label">Controle</span>}
          {gerenteAtual&&<button type="button" className={`nav-item ${aba==="prestacao-gerente"?"active":""}`} aria-current={aba==="prestacao-gerente"?"page":undefined} onClick={()=>navegar("prestacao-gerente")}><Icon name="fileText" className="nav-icon" /> Prestação de Conta</button>}
          {(administrador||gerenteAtual)&&<button type="button" className={`nav-item ${aba==="senhas"?"active":""}`} aria-current={aba==="senhas"?"page":undefined} onClick={()=>navegar("senhas")}><Icon name="shieldKey" className="nav-icon" /> Senhas</button>}
          {administrador&&<button type="button" className={`nav-item ${aba==="fechamento"?"active":""}`} aria-current={aba==="fechamento"?"page":undefined} onClick={()=>navegar("fechamento")}><Icon name="checkCircle" className="nav-icon" /> Fechamento</button>}

          {administrador&&<span className="nav-section-label">Administração</span>}
          {administrador&&<button type="button" className={`nav-item ${aba==="gestao"?"active":""}`} aria-current={aba==="gestao"?"page":undefined} onClick={()=>navegar("gestao")}><Icon name="key" className="nav-icon" /> Central de Acessos</button>}
          {administrador&&<button type="button" className={`nav-item ${aba==="logins"?"active":""}`} aria-current={aba==="logins"?"page":undefined} onClick={()=>navegar("logins")}><Icon name="lock" className="nav-icon" /> Gerenciar Logins</button>}

          <span className="nav-section-label">Registros</span>
          <button type="button" className={`nav-item ${aba==="historico"?"active":""}`} aria-current={aba==="historico"?"page":undefined} onClick={()=>navegar("historico")}>
            <Icon name="history" className="nav-icon" /> Histórico
            {historicoOperacional.length+historicoPontosOperacional.length>0&&<span className="nav-badge">{historicoOperacional.length+historicoPontosOperacional.length>99?"99+":historicoOperacional.length+historicoPontosOperacional.length}</span>}
          </button>
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-perfil">
            <span className="sidebar-profile-mark" aria-hidden="true"><Icon name="user" size={16}/></span>
            <span><small>{perfilAtual.perfil}</small><strong>{perfilAtual.nome||perfilAtual.loginNome||"Usuário NEPTERA"}</strong></span>
          </div>
          <div className="sidebar-utilities" aria-label="Utilidades da conta">
            <button className="sidebar-utility sidebar-utility-theme" onClick={toggleTema} type="button" aria-pressed={temaClaro} aria-label={temaClaro?"Usar tema escuro":"Usar tema claro"}>
              <Icon name={temaClaro?"sun":"moon"} />
              <span>{temaClaro?"Tema claro":"Tema escuro"}</span>
              <span className={`tema-toggle ${temaClaro?"ativo":""}`} aria-hidden="true"/>
            </button>
            {["administrador","operador","gerente"].includes(perfilAtual.perfil)&&(
              <button className="sidebar-utility sidebar-utility-backup" onClick={baixarBackupObrigatorio} type="button"><Icon name="database" /><span>Baixar backup</span></button>
            )}
            <PwaInstallControl icon={<Icon name="download" />} />
            <button className="sidebar-utility sidebar-utility-password" onClick={()=>abrirForaDoDrawer(()=>setModalSenha(true))} type="button"><Icon name="lock" /><span>Alterar minha senha</span></button>
            <button className="sidebar-utility sidebar-utility-danger" onClick={()=>abrirForaDoDrawer(()=>setConfirmLogout(true))} type="button"><Icon name="logOut" /><span>Sair do sistema</span></button>
          </div>
          <div className="sidebar-version">NEPTERA v1.0 · by Anderion Labs</div>
        </div>
      </aside>

      <main className="main" onKeyDown={handleMainScrollKey} ref={mainRef} tabIndex={-1}>
        {perfilAtual.emailTemporario&&(
          <div className={`email-temp-banner ${prazoEmailTemporario(perfilAtual.emailTemporarioExpiraEm)==="vencido"?"email-temp-vencido":""}`}>
            <strong>Login interno do sistema</strong>
            <span>Este acesso usa um e-mail interno apenas para autenticação. Se precisar trocar a senha, solicite ao administrador.</span>
          </div>
        )}
        {aba==="dashboard"&&(
          <DashboardPage
            animarEntrada={!dashboardApresentado}
            gerenteAtual={gerenteAtual}
            gerenteNomeBase={gerenteNomeBase}
            historicoConfig={HIST_CFG}
            historicoOperacional={historicoOperacional}
            menuAberto={sidebarAberta}
            onAbrirEquipamentos={()=>navegar("itens")}
            onAbrirHistorico={()=>navegar("historico")}
            onAbrirMenu={alternarSidebarContextual}
            onAbrirPontos={()=>navegar("pontos")}
            onEntradaConcluida={setDashboardApresentado}
            onSelecionarCategoria={categoria=>{navegar("itens");setFiltroCatEquip(categoria);setAbaEquip("lista");}}
            onSelecionarConserto={()=>{navegar("itens");setFiltroEscopoEquip("conserto");setFiltroSt("Todos");}}
            onSelecionarDisponiveis={()=>{navegar("itens");setFiltroEscopoEquip(gerenteAtual?"todos":"interno");setFiltroSt("Disponível");}}
            onSelecionarGerentes={()=>{navegar("itens");setFiltroEscopoEquip("gerentes");setFiltroSt("Todos");}}
            onSelecionarPontos={()=>{navegar("itens");setFiltroEscopoEquip(gerenteAtual?"todos":"pontos");setFiltroSt("Em rota");}}
            onSelecionarTotal={()=>{navegar("itens");setFiltroEscopoEquip("todos");setFiltroSt("Todos");}}
            perfilAtual={perfilAtual}
            pontosComEquipamentos={pontosComEquipamentos}
            porCategoria={porCategoria}
            solicitacoesConsertoPendentes={solicitacoesConsertoPendentes}
            totalComGerentes={totalComGerentes}
            totalConserto={totalConserto}
            totalDisponivel={totalDisponivel}
            totalEmRota={totalEmRota}
            totalGeral={totalGeral}
          />
        )}

        {aba==="itens"&&(<>
          <header className="cf-page-head equip-cf-head">
            <div className="cf-page-head__identity">
              <button className="btn-hamburguer" onClick={alternarSidebarContextual} type="button" aria-label={sidebarAberta?"Fechar navegação":"Abrir navegação"} aria-controls="stock-on-primary-navigation" aria-expanded={sidebarAberta}><Icon name="menu" /></button>
              <div className="cf-page-head__copy"><span className="cf-page-head__eyebrow">Controle de equipamentos</span><h1>Equipamentos</h1><p>Veja onde cada equipamento está, com quem está e o que aconteceu por último.</p></div>
            </div>
            <div className="cf-page-head__actions">
              <button className="btn-secundario equip-cf-export-utility" onClick={()=>exportarEquipamentosExcel(itensOperacionais)}><Icon name="spreadsheet" /> Excel</button>
              <button className="btn-secundario equip-cf-export-utility" onClick={()=>exportarEquipamentosPDF(itensOperacionais)}><Icon name="pdf" /> PDF</button>
              {podeCadastrarEquipamento&&<button className="btn-primario" onClick={abrirNovo}><Icon name="plus" /> Novo equipamento</button>}
            </div>
          </header>
          <div className="equip-cf-control-line">
            <nav className="equip-cf-view-switch" aria-label="Visualização de equipamentos">
              {ABAS_EQUIP.map(a=>(
                <button key={a.id} type="button" aria-current={abaEquip===a.id?"page":undefined} className={abaEquip===a.id?"is-active":""} onClick={()=>setAbaEquip(a.id)}><Icon name={a.icone}/><span>{a.label}</span></button>
              ))}
            </nav>
            <span className="equip-cf-control-context"><strong>{totalGeral}</strong> registros na base</span>
          </div>

          <nav className={`equip-cf-position-strip${gerenteAtual?" is-manager-scope":""}`} aria-label="Onde os equipamentos estão agora">
            <button type="button" aria-pressed={abaEquip==="lista"&&filtroEscopoEquip==="todos"} className={abaEquip==="lista"&&filtroEscopoEquip==="todos"?"is-active":""} onClick={()=>{setFiltroEscopoEquip("todos");setAbaEquip("lista");}}><span data-mobile-label="Base">Base</span><strong>{totalGeral}</strong><small>todos os registros</small></button>
            <button type="button" aria-pressed={abaEquip==="lista"&&filtroEscopoEquip==="interno"} className={abaEquip==="lista"&&filtroEscopoEquip==="interno"?"is-active":""} onClick={()=>{setFiltroEscopoEquip("interno");setAbaEquip("lista");}}><span data-mobile-label={gerenteAtual?"Disponíveis":"Estoque"}>{gerenteAtual?"Disponíveis":"Estoque interno"}</span><strong>{totalDisponivel}</strong><small>prontos para alocação</small></button>
            <button type="button" aria-pressed={abaEquip==="lista"&&filtroEscopoEquip==="pontos"} className={abaEquip==="lista"&&filtroEscopoEquip==="pontos"?"is-active":""} onClick={()=>{setFiltroEscopoEquip("pontos");setAbaEquip("lista");}}><span data-mobile-label="Em pontos">Em pontos</span><strong>{totalEmRota}</strong><small>em operação</small></button>
            {!gerenteAtual&&<button type="button" aria-pressed={abaEquip==="lista"&&filtroEscopoEquip==="gerentes"} className={abaEquip==="lista"&&filtroEscopoEquip==="gerentes"?"is-active":""} onClick={()=>{setFiltroEscopoEquip("gerentes");setAbaEquip("lista");}}><span data-mobile-label="Com gerentes">Com gerentes</span><strong>{totalComGerentes}</strong><small>sob responsabilidade</small></button>}
            <button type="button" aria-pressed={abaEquip==="lista"&&filtroEscopoEquip==="conserto"} className={`is-attention ${abaEquip==="lista"&&filtroEscopoEquip==="conserto"?"is-active":""}`} onClick={()=>{setFiltroEscopoEquip("conserto");setAbaEquip("lista");}}><span data-mobile-label="Conserto">Conserto</span><strong>{totalConserto}</strong><small>{solicitacoesConsertoPendentes.length?`${solicitacoesConsertoPendentes.length} aguardando análise`:"fila operacional"}</small></button>
            <span className="equip-cf-position-note"><small>Leitura atual</small><strong>{itensFiltrados.length} no recorte</strong></span>
          </nav>

          {abaEquip==="lista"&&(
            <section className="equip-lista equip-cf-list">
              <FilterBar
                className="equip-cf-filterbar"
                ariaHidden={dossieEquipamentoSheet&&dossieEquipamentoAberto?"true":undefined}
                inert={dossieEquipamentoSheet&&dossieEquipamentoAberto?true:undefined}
                ariaLabel="Consulta de equipamentos"
                activeCount={filtrosEquipAtivos}
                secondaryOpen={filtrosEquipAbertos}
                onSecondaryToggle={setFiltrosEquipAbertos}
                onClear={()=>{setFiltroCatEquip("Todas");setFiltroSt("Todos");setFiltroEscopoEquip("todos");}}
                primary={<>
                  <div className="equip-cf-search"><label className="sr-only" htmlFor="equip-cf-search-input">Buscar por equipamento, patrimônio, categoria, ponto ou gerente</label><Icon name="search"/><input id="equip-cf-search-input" type="search" placeholder="Buscar equipamento, patrimônio, ponto ou gerente" value={busca} onChange={e=>setBusca(e.target.value)}/>{busca&&<button type="button" aria-label="Limpar busca" onClick={()=>setBusca("")}><Icon name="close"/></button>}</div>
                  <span className="equip-cf-result-count" aria-live="polite"><strong>{itensFiltrados.length}</strong> resultado{itensFiltrados.length!==1?"s":""}</span>
                </>}
                secondary={<>
                  <label><span>Escopo operacional</span><select value={filtroEscopoEquip} onChange={e=>setFiltroEscopoEquip(e.target.value)}><option value="todos">Todos</option><option value="interno">{gerenteAtual?"Disponíveis":"Estoque interno"}</option><option value="pontos">Em pontos</option>{!gerenteAtual&&<option value="gerentes">Com gerentes</option>}<option value="conserto">Conserto</option></select></label>
                  <label><span>Categoria</span><select value={filtroCatEquip} onChange={e=>setFiltroCatEquip(e.target.value)}><option value="Todas">Todas as categorias</option>{CATEGORIAS.map(c=><option key={c}>{c}</option>)}</select></label>
                  <label><span>Situação</span><select value={filtroSt} onChange={e=>setFiltroSt(e.target.value)}><option value="Todos">Todas as situações</option>{statusListaVisivel.map(s=><option key={s}>{s}</option>)}</select></label>
                </>}
                chips={filtrosEquipAtivos>0?<>
                  {filtroEscopoEquip!=="todos"&&<button type="button" onClick={()=>setFiltroEscopoEquip("todos")}>{rotuloEscopoEquip}<Icon name="close"/></button>}
                  {filtroCatEquip!=="Todas"&&<button type="button" onClick={()=>setFiltroCatEquip("Todas")}>{filtroCatEquip}<Icon name="close"/></button>}
                  {filtroSt!=="Todos"&&<button type="button" onClick={()=>setFiltroSt("Todos")}>{filtroSt}<Icon name="close"/></button>}
                </>:null}
              />
              <EquipmentInventoryLedger
                rows={linhasEquipamentosLedger}
                selected={equipamentoFocoLedger}
                history={historicoEquipamentoLedger}
                total={itensFiltrados.length}
                page={paginaItens}
                totalPages={totalPaginasItens}
                pageSize={ITENS_POR_PAGINA}
                onPageChange={setPaginaItens}
                onSelect={selecionarEquipamentoFoco}
                onCloseDossier={fecharDossieEquipamento}
                onExecuteDossier={executarAcaoDossieEquipamento}
                onOpenDetail={abrirFichaEquipamento}
                onEdit={abrirEditar}
                onDelete={item=>setExcluindo(item.id)}
                onOpenHistory={()=>setAbaEquip("historico")}
                dossierSheet={dossieEquipamentoSheet}
                dossierOpen={dossieEquipamentoAberto}
                dossierRef={dossieEquipamentoRef}
                iconByCategory={ICONES}
                emptyDescription="Ajuste a busca ou remova um filtro para consultar outros registros."
              />
              {recebimentosPendentes.length>0&&(
                <div className="recebimentos-pendentes">
                  <div>
                    <span className="recebimentos-kicker">Recebimento de equipamentos</span>
                    <h2>{recebimentosPendentes.length} enviado{recebimentosPendentes.length!==1?"s":""} aguardando confirmação</h2>
                    <p>Confirme somente quando o equipamento estiver em suas mãos. Depois ele entra no seu estoque disponível para movimentar.</p>
                  </div>
                  <div className="recebimentos-lista">
                    {recebimentosPendentes.map(item=>(
                      <article key={item.id} className="recebimento-card">
                        <div>
                          <strong><Icon name={ICONES[item.categoria]} /> {item.nome}</strong>
                          <small>{item.nome} · enviado pela administração</small>
                        </div>
                        <button className="btn-primario" onClick={()=>confirmarRecebimento(item)}>Confirmar recebido</button>
                      </article>
                    ))}
                  </div>
                </div>
              )}
              {inconsistencias.length>0&&(
                <div className="erro-msg alerta-inconsistencia">
                  <Icon name="warning" /> {inconsistencias.length} equipamento{inconsistencias.length!==1?"s":""} com cadastro inconsistente. Preencha o nome antes de novas movimentações:
                  <strong>{inconsistencias.map(i=>i.nome).join(", ")}</strong>
                </div>
              )}
              {administrador&&pagamentosConsertoPendentes.length>0&&(
                <section className="conserto-operacao-banner conserto-financeiro-banner">
                  <div className="conserto-operacao-topo">
                    <div>
                      <span><i className="financeiro-pulse" /> Financeiro do conserto</span>
                      <h2>{pagamentosConsertoPendentes.length} pagamento{pagamentosConsertoPendentes.length!==1?"s":""} aguardando confirmação</h2>
                    </div>
                  </div>
                  <div className="conserto-operacao-lista">
                    {pagamentosConsertoPendentes.slice(0,4).map(item=>(
                      <button key={item.id} type="button" className="conserto-operacao-item financeiro-pendente-item" onClick={()=>setItemDetalhe(item)}>
                        <strong>{item.nome}</strong>
                        <span>{formatarMoedaPDF(item.consertoValor||0)} · {item.consertoFormaPagamento||"Forma não informada"}</span>
                        {item.consertoAssistencia&&<small>Assistência: {item.consertoAssistencia}</small>}
                        <em>Confirmar pagamento</em>
                      </button>
                    ))}
                  </div>
                </section>
              )}
              {operador&&solicitacoesConsertoPendentes.length>0&&(
                <section className="conserto-operacao-banner conserto-aprovacao-banner">
                  <div className="conserto-operacao-topo">
                    <div>
                      <span><Icon name="wrench" /> Aprovação obrigatória do operador</span>
                      <h2>{solicitacoesConsertoPendentes.length} solicitação{solicitacoesConsertoPendentes.length!==1?"ões":""} aguardando análise</h2>
                    </div>
                    <button className="btn-secundario" onClick={()=>{setFiltroEscopoEquip("conserto");setFiltroSt("Todos");}}>Ver solicitações</button>
                  </div>
                  <div className="conserto-operacao-lista">
                    {solicitacoesConsertoPendentes.slice(0,6).map(item=>(
                      <button key={item.id} type="button" className="conserto-operacao-item conserto-aprovacao-item" onClick={()=>abrirConsertoOperador(item)}>
                        <strong>{item.nome}</strong>
                        <span>{item.gerenteResponsavel?`Solicitado por ${item.gerenteResponsavel}`:"Solicitado pela administração"}</span>
                        <small>Problema: {item.consertoDefeito||"Não informado"}</small>
                        <em>Analisar e aprovar</em>
                      </button>
                    ))}
                  </div>
                </section>
              )}
              {operador&&consertosPendentes.length>0&&(
                <section className="conserto-operacao-banner">
                  <div className="conserto-operacao-topo">
                    <div>
                      <span>Fila de conserto</span>
                      <h2>{consertosPendentes.length} equipamento{consertosPendentes.length!==1?"s":""} aguardando operação</h2>
                    </div>
                    <button className="btn-secundario" onClick={()=>setFiltroSt("Em conserto")}>Ver somente consertos</button>
                  </div>
                  <div className="conserto-operacao-lista">
                    {consertosPendentes.slice(0,4).map(item=>(
                      <button key={item.id} type="button" className="conserto-operacao-item" onClick={()=>setItemDetalhe(item)}>
                        <strong>{item.nome}</strong>
                        <span>{item.gerenteResponsavel?`Enviado por ${item.gerenteResponsavel}`:"Enviado para operação"}</span>
                        {item.consertoDefeito&&<small>Defeito: {item.consertoDefeito}</small>}
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </section>
          )}

          {abaEquip==="resumo"&&(
            <section className="equip-cf-summary" aria-labelledby="equip-summary-title">
              <header className="equip-cf-section-head"><div><span className="cf-kicker">Composição da base</span><h2 id="equip-summary-title">Resumo por categoria</h2></div><span>Selecione uma linha para ver os equipamentos correspondentes.</span></header>
              <div className="cf-ledger equip-cf-category-ledger">
                <div className="cf-ledger__head equip-cf-category-grid" aria-hidden="true"><span>Categoria</span><span>Registros</span><span>Disponíveis</span><span>Em rota</span>{!gerenteAtual&&<span>Conserto</span>}<span>Abrir</span></div>
                {porCategoria.map(c=>(
                  <button key={c.categoria} type="button" className="cf-ledger__row equip-cf-category-grid" onClick={()=>{setFiltroCatEquip(c.categoria);setAbaEquip("lista");}}>
                    <span className="equip-cf-category-name"><span className="equip-cf-category-icon"><Icon name={ICONES[c.categoria]}/></span><strong>{c.categoria}</strong></span>
                    <span><strong>{c.total}</strong><small>{c.qtdItens===1?"registro":"registros"}</small></span>
                    <span><strong>{c.disponivel}</strong><small>prontos</small></span>
                    <span><strong>{c.emRota}</strong><small>em operação</small></span>
                    {!gerenteAtual&&<span className={c.conserto?"is-attention":""}><strong>{c.conserto}</strong><small>na fila</small></span>}
                    <Icon name="arrowRight"/>
                  </button>
                ))}
              </div>
            </section>
          )}

          {abaEquip==="historico"&&(
            <section className="equip-cf-history" aria-labelledby="equip-history-title">
              <header className="equip-cf-section-head">
                <div><span className="cf-kicker">Movimentações</span><h2 id="equip-history-title">Histórico dos equipamentos</h2><small>{historicoOperacional.length} evento{historicoOperacional.length!==1?"s":""}</small></div>
                <div className="equip-cf-section-actions">
                  <button className="btn-secundario" onClick={()=>exportarHistoricoExcel(historicoOperacional)}><Icon name="spreadsheet" /> Excel</button>
                  <button className="btn-secundario" onClick={()=>exportarHistoricoPDF(historicoOperacional)}><Icon name="pdf" /> PDF</button>
                </div>
              </header>
              {historicoOperacional.length===0
                ?<div className="cf-empty equip-cf-history-empty"><Icon name="history"/><span>Nenhuma movimentação registrada.</span></div>
                :<div className="cf-ledger equip-cf-history-ledger">
                  <div className="cf-ledger__head equip-cf-history-grid" aria-hidden="true"><span>Evento</span><span>Equipamento</span><span>Variação</span><span>Registro</span></div>
                  {historicoOperacional.map(h=>{const cfg=HIST_CFG[h.tipo]||{cor:"",icone:"file",label:h.tipo};const evento=apresentacaoHistoricoEquipamento(h);return <article className="cf-ledger__row equip-cf-history-grid" key={h.id}>
                    <span className={`badge-hist ${cfg.cor}`}><Icon name={cfg.icone}/>{cfg.label}</span>
                    <span className="equip-cf-history-subject"><span className="equip-cf-category-icon"><Icon name={ICONES[h.categoria]}/></span><span><strong>{h.itemNome}</strong><small>{h.categoria}</small></span></span>
                    <span className="equip-cf-history-delta"><b>{h.qtdAntes}</b><Icon name="arrowRight"/><b>{h.qtdDepois}</b></span>
                    <div className="equip-cf-history-record"><HistoricoDetalhes texto={h.observacao}/><small>{evento.autorNome?`Realizado por ${evento.autorTexto}`:"Autor não registrado"}</small><time>{evento.data}</time></div>
                  </article>;})}
                </div>
              }
            </section>
          )}
        </>)}

        {aba==="pontos"&&(
          <PointsPage equipamentos={itensOperacionais} podeEditar={podeEditar} perfilAtual={perfilAtual} onPontosChange={setPontos} onEquipamentosChange={setItens} onHistoricoChange={lista=>setHistoricoPontos(lista.map(evento=>Object.hasOwn(evento,"createdAt")?evento:{...evento,createdAt:isoAgora()}))} onHistoricoLoadError={failed=>setErrosHistorico(current=>({...current,point:failed}))} onDespesasChange={setDespesasBackup} onEditarEquipamento={abrirEditar} onMovimentarEquipamento={abrirMov} podeMovimentarEquipamento={podeMovimentarEquipamento} onExcluirEquipamento={setExcluindo} onAbrirMenu={alternarSidebarContextual}/>
        )}

        {aba==="devedores"&&acessoDevedores&&(
          <DevedoresPage perfilAtual={perfilAtual} menuAberto={sidebarAberta} onAbrirMenu={alternarSidebarContextual}/>
        )}

        {aba==="buscar-gerentes"&&(administrador||operador)&&(<>
          <header className="cf-page-head consulta-cf-head">
            <div className="cf-page-head__identity">
              <button className="btn-hamburguer" onClick={alternarSidebarContextual} type="button" aria-label={sidebarAberta?"Fechar navegação":"Abrir navegação"} aria-controls="stock-on-primary-navigation" aria-expanded={sidebarAberta}><Icon name="menu" /></button>
              <div className="cf-page-head__copy"><span className="cf-page-head__eyebrow">Consulta operacional</span><h1>Gerentes</h1><p>Responsabilidade, posição e pendências em um único recorte.</p></div>
            </div>
          </header>
          <div className="consulta-cf-page">
            <aside className="consulta-cf-rail" aria-label="Lista de gerentes">
              <div className="consulta-cf-search"><Icon name="search" /><input type="search" aria-label="Buscar gerente" placeholder="Buscar gerente" value={buscaGerenteConsulta} onChange={e=>setBuscaGerenteConsulta(e.target.value)} /></div>
              <div className="consulta-cf-manager-list">
                {gerentesConsultaFiltrados.length===0?<div className="cf-empty"><Icon name="user"/><span>Nenhum gerente neste filtro.</span></div>:gerentesConsultaFiltrados.map(nome=>{
                  const pontosQtd=pontos.filter(p=>rotaPertenceAoGerente(p.gerente,nome)).length;
                  const itensQtd=itens.filter(i=>normalizarTexto(i.gerenteResponsavel)===normalizarTexto(nome)||pontos.some(p=>rotaPertenceAoGerente(p.gerente,nome)&&normalizarTexto(p.nomeFantasia)===normalizarTexto(i.localizacao))).length;
                  return <button key={nome} type="button" className={gerenteConsultaAtivo===nome?"is-active":""} aria-pressed={gerenteConsultaAtivo===nome} onClick={()=>setGerenteConsulta(nome)}><span className="consulta-cf-avatar"><Icon name="user"/></span><span><strong>{nome}</strong><small>{pontosQtd} pontos · {itensQtd} equipamentos</small></span><Icon name="chevronRight"/></button>;
                })}
              </div>
              <label className="consulta-cf-mobile-select"><span>Gerente</span><select value={gerenteConsultaAtivo} onChange={e=>setGerenteConsulta(e.target.value)}>{gerentesOperacionais.length===0&&<option value="">Nenhum gerente encontrado</option>}{gerentesOperacionais.map(g=><option key={g} value={g}>{g}</option>)}</select></label>
            </aside>

            <div className="consulta-cf-main">
              <section className="consulta-cf-position" aria-label="Posição do gerente">
                <div className="consulta-cf-position-copy">
                  <span>Gerente em foco</span>
                  <strong>{gerenteConsultaAtivo||"Sem seleção"}</strong>
                  <p>{pontosDoGerenteConsulta.length} pontos · {equipamentosDoGerenteConsulta.length} equipamentos · {equipamentosConsultaSemPonto.length} com gerente · {equipamentosConsultaConserto.length} conserto</p>
                </div>
                <div className="consulta-cf-view-switch" role="group" aria-label="Conteúdo do gerente">
                  <button type="button" aria-pressed={consultaGerenteVisao==="pontos"} className={consultaGerenteVisao==="pontos"?"is-active":""} onClick={()=>setConsultaGerenteVisao("pontos")}><Icon name="mapPin"/> Pontos</button>
                  <button type="button" aria-pressed={consultaGerenteVisao==="equipamentos"} className={consultaGerenteVisao==="equipamentos"?"is-active":""} onClick={()=>setConsultaGerenteVisao("equipamentos")}><Icon name="package"/> Equipamentos</button>
                </div>
              </section>

              {consultaGerenteVisao==="equipamentos"&&<nav className="consulta-cf-equipment-filters" aria-label="Filtros dos equipamentos do gerente">
                <button type="button" aria-pressed={consultaEquipFiltro==="todos"} className={consultaEquipFiltro==="todos"?"is-active":""} onClick={()=>setConsultaEquipFiltro("todos")}>Todos <b>{equipamentosDoGerenteConsulta.length}</b></button>
                <button type="button" aria-pressed={consultaEquipFiltro==="pontos"} className={consultaEquipFiltro==="pontos"?"is-active":""} onClick={()=>setConsultaEquipFiltro(atual=>atual==="pontos"?"todos":"pontos")}>Nos pontos <b>{equipamentosConsultaEmPontos.length}</b></button>
                <button type="button" aria-pressed={consultaEquipFiltro==="gerente"} className={consultaEquipFiltro==="gerente"?"is-active":""} onClick={()=>setConsultaEquipFiltro(atual=>atual==="gerente"?"todos":"gerente")}>Com gerente <b>{equipamentosConsultaSemPonto.length}</b></button>
                <button type="button" aria-pressed={consultaEquipFiltro==="conserto"} className={`is-attention ${consultaEquipFiltro==="conserto"?"is-active":""}`} onClick={()=>setConsultaEquipFiltro(atual=>atual==="conserto"?"todos":"conserto")}>Conserto <b>{equipamentosConsultaConserto.length}</b></button>
              </nav>}

              <div className="consulta-cf-ledgers" data-view={consultaGerenteVisao}>
                {consultaGerenteVisao==="pontos"?<section className="cf-ledger consulta-cf-points-ledger" id="consulta-gerente-pontos">
                  <header><div><span className="cf-kicker">Posição territorial</span><h2>Pontos vinculados</h2></div><b>{pontosDoGerenteConsulta.length}</b></header>
                  {pontosDoGerenteConsulta.length===0?<div className="cf-empty"><Icon name="mapPin"/><span>Nenhum ponto encontrado para este gerente.</span></div>:ordenarPontos(pontosDoGerenteConsulta).map(ponto=>{
                    const qtd=itens.filter(i=>normalizarTexto(i.localizacao)===normalizarTexto(ponto.nomeFantasia)).length;
                    return <article key={ponto.id}><span className="consulta-cf-line-icon"><Icon name="mapPin"/></span><span><strong>{ponto.nomeFantasia}</strong><small>{ponto.gerente||"Rota não informada"} · {ponto.telefone||"sem telefone"}</small></span><span className={`consulta-cf-point-state ${ponto.situacaoOperacional==="desativado"?"is-off":""}`}>{ponto.situacaoOperacional==="desativado"?"Desativado":"Ativo"}</span><b>{qtd}<small> equip.</small></b></article>;
                  })}
                </section>:<section className="cf-ledger consulta-cf-equipment-ledger" id="consulta-gerente-equipamentos">
                  <header><div><span className="cf-kicker">{tituloEquipamentosConsulta}</span><h2>Equipamentos localizados</h2></div><b>{equipamentosConsultaExibidos.length}</b></header>
                  {consultaEquipFiltro==="conserto"&&<p className="consulta-filtro-nota">Encaminhados ao operador; abra a ficha para conferir defeito e andamento.</p>}
                  {consultaEquipFiltro==="gerente"&&<p className="consulta-filtro-nota">Sob responsabilidade do gerente e ainda sem vínculo com ponto.</p>}
                  {equipamentosConsultaExibidos.length===0?<div className="cf-empty"><Icon name="package"/><span>Nenhum equipamento encontrado neste filtro.</span></div>:equipamentosConsultaPagina.map(item=>(
                    <article key={item.id} className={item.status==="Em conserto"?"is-attention":""}>
                      <span className="consulta-cf-line-icon"><Icon name={ICONES[item.categoria]}/></span>
                      <span><strong>{item.nome}</strong><small>{textoLocalizacaoEquipamento(item)}</small></span>
                      <span className="badge-cat">{item.categoria}</span>
                      <span className={`badge-status ${STATUS_CFG[item.status]?.cor||""}`}>{item.status}</span>
                      <button className="btn-editar" type="button" onClick={()=>abrirFichaEquipamento(item,true)} aria-label={`Abrir ficha de ${item.nome}`}><Icon name="eye"/> Ficha</button>
                    </article>
                  ))}
                  {equipamentosConsultaExibidos.length>itensPorPaginaGerenteConsulta&&<div className="consulta-cf-pagination"><button className="btn-secundario" disabled={paginaGerenteConsulta===1} onClick={()=>setPaginaGerenteConsulta(p=>p-1)}>Anterior</button><span>{paginaGerenteConsulta} / {totalPaginasGerenteConsulta}</span><button className="btn-secundario" disabled={paginaGerenteConsulta===totalPaginasGerenteConsulta} onClick={()=>setPaginaGerenteConsulta(p=>p+1)}>Próxima</button></div>}
                </section>}
              </div>
            </div>

            <aside className="cf-dossier consulta-cf-dossier">
              <div className="cf-dossier__head"><span className="cf-kicker">Dossiê de responsabilidade</span><h2>{gerenteConsultaAtivo||"Sem gerente"}</h2></div>
              <div className="cf-dossier__body">
                <div className="consulta-cf-dossier-state"><Icon name={equipamentosConsultaConserto.length?"warning":"check"}/><span><small>Prioridade atual</small><strong>{equipamentosConsultaConserto.length?`${equipamentosConsultaConserto.length} em conserto`:equipamentosConsultaSemPonto.length?`${equipamentosConsultaSemPonto.length} sem ponto`:"Posição acompanhada"}</strong></span></div>
                <dl><div><dt>Pontos</dt><dd>{pontosDoGerenteConsulta.length}</dd></div><div><dt>Equipamentos</dt><dd>{equipamentosDoGerenteConsulta.length}</dd></div><div><dt>Nos pontos</dt><dd>{equipamentosConsultaEmPontos.length}</dd></div><div><dt>Com gerente</dt><dd>{equipamentosConsultaSemPonto.length}</dd></div><div><dt>Conserto</dt><dd>{equipamentosConsultaConserto.length}</dd></div></dl>
                <p className="consulta-cf-dossier-note">A consulta usa apenas vínculos de rota, ponto e responsabilidade já registrados no NEPTERA.</p>
              </div>
            </aside>
          </div>
        </>)}

        {aba==="senhas"&&(administrador||gerenteAtual)&&(<>
          <ModuleHeader eyebrow="Credenciais e distribuição" title="Senhas" subtitle="Logins das modalidades e aplicativos liberados por perfil." onMenu={alternarSidebarContextual} menuOpen={sidebarAberta}/>
          <SenhasModalidadesPage
            perfilAtual={perfilAtual}
            acessos={senhasModalidades}
            apps={modalidadeApps}
            onAcessosChange={setSenhasModalidades}
            onAppsChange={setModalidadeApps}
          />
        </>)}

        {aba==="prestacao-gerente"&&gerenteAtual&&(<>
          <ModuleHeader eyebrow="Conferência financeira" title="Prestação de Conta" subtitle="PDF, PIX e conferência enviados pela administração." onMenu={alternarSidebarContextual} menuOpen={sidebarAberta} className="topbar-prestacao-gerente"/>
          <PrestacaoGerentePage
            gerenteAtual={gerenteAtual}
            pontos={pontosOperacionais}
            itens={itensOperacionais}
            despesas={despesasOperacionais}
            pixEnvios={pixEnvios}
            onCopiarPix={copiarPixAviso}
          />
        </>)}

        {aba==="fechamento"&&administrador&&(
          <FechamentoModule
            onMenu={alternarSidebarContextual}
            menuOpen={sidebarAberta}
            pontos={pontos}
            itens={itens}
            despesas={despesasBackup}
            pixEnvios={pixEnvios}
            onPixEnviosChange={setPixEnvios}
          />
        )}

        {aba==="gestao"&&administrador&&(<>
          <ModuleHeader eyebrow="Identidade e escopo" title="Central de Acessos" subtitle="Usuários, permissões e redefinição de login." onMenu={alternarSidebarContextual} menuOpen={sidebarAberta}/>
          <ManagementPage perfilAtual={perfilAtual} onPerfilAtualChange={setPerfilAtual}/>
        </>)}

        {aba==="logins"&&administrador&&(<>
          <ModuleHeader eyebrow="Diretório administrativo" title="Gerenciar Logins" subtitle="Controle exclusivo da administração." onMenu={alternarSidebarContextual} menuOpen={sidebarAberta}/>
          <LoginManagerPage perfilAtual={perfilAtual} historico={historicoOperacional} historicoPontos={historicoPontosOperacional} onPerfilAtualChange={setPerfilAtual}/>
        </>)}

        {aba==="historico"&&(
          <HistoricoTimelinePage
            equipmentHistory={historicoOperacional}
            pointHistory={historicoPontosOperacional}
            loadError={erroHistorico}
            onMenu={alternarSidebarContextual}
            menuOpen={sidebarAberta}
            onExportExcel={exportarTimelineExcel}
            onExportPdf={exportarTimelinePDF}
          />
        )}
      </main>

      {modalForm&&(
        <OperationModal
          title={itemEdit?"Editar equipamento":"Novo equipamento"}
          subtitle="Identificação, categoria e posição operacional"
          onClose={fecharForm}
          size="lg"
          className="equip-cf-form-modal"
          footer={<><button className="btn-secundario" type="button" onClick={fecharForm}>Cancelar</button><button className="btn-primario" type="button" onClick={salvarItem}>{itemEdit?"Salvar alterações":Number(form.quantidade)>1?`Adicionar ${Number(form.quantidade)||1} unidades`:"Adicionar"}</button></>}
        >
            <div className="modal-body">
              {erroForm&&<div className="erro-msg" role="alert"><Icon name="warning"/> {erroForm}</div>}
              <div className="campos-duplos">
                <div className="campo"><label>Nome do Equipamento *</label>
                  <input type="text" placeholder='Ex: TV HQ 32 BALCÃO' value={form.nome} onChange={e=>setForm({...form,nome:e.target.value.toUpperCase()})}/>
                  <span className="campo-hint">Obrigatório. Será salvo em CAIXA ALTA para manter o padrão.</span></div>
                {!itemEdit&&(
                  <div className="campo"><label>Quantidade *</label>
                    <input type="number" min="1" max="100" value={form.quantidade} onChange={e=>setForm({...form,quantidade:e.target.value})}/>
                    <span className="campo-hint">Cada unidade será cadastrada separadamente.</span></div>
                )}
              </div>
              <div className="campos-duplos">
                <div className="campo"><label>Categoria *</label>
                  <select value={form.categoria} onChange={e=>{
                    const c=e.target.value;
                    setForm({...form,categoria:c});
                  }}>{CATEGORIAS.map(c=><option key={c}>{c}</option>)}</select></div>
                <div className="campo"><label>Status *</label>
                  <select value={form.status} onChange={e=>{
                    const status=e.target.value;
                    setForm({...form,status,localizacao:status==="Em rota"?form.localizacao:""});
                  }}>
                    {(operador?statusListaVisivel:statusListaVisivel.filter(s=>s!=="Em conserto")).map(s=><option key={s}>{s}</option>)}
                  </select></div>
              </div>
              {form.status==="Em rota"&&(
                <div className="campo ponto-destino-form">
                  <label>Ponto onde ficará o equipamento *</label>
                  <div className="ponto-destino-linha">
                    <select value={form.localizacao} onChange={e=>setForm({...form,localizacao:e.target.value})}>
                      <option value="">Selecione um ponto...</option>
                      {pontosDestinoOperacional.map(p=><option key={p.id} value={p.nomeFantasia}>{p.nomeFantasia}</option>)}
                    </select>
                    <button type="button" className="btn-secundario" onClick={()=>setModalPontoRapido(true)}>+ Criar ponto agora</button>
                  </div>
                  <span className="campo-hint">Ao salvar, o equipamento já ficará vinculado ao ponto escolhido.</span>
                </div>
              )}
              {(administrador||operador)&&(
                <div className="campo-info-minimo"><Icon name="lock"/> Alerta operacional somente para <strong>Terminais com menos de 5 disponíveis</strong></div>
              )}
            </div>
        </OperationModal>
      )}

      {modalPontoRapido&&(
        <PointFormModal
          ponto={null}
          pontos={pontos}
          equipamentos={[]}
          perfilAtual={perfilAtual}
          mostrarEquipamentos={false}
          onSalvar={salvarPontoRapido}
          onFechar={()=>setModalPontoRapido(false)}
        />
      )}

      {modalMov&&(
        <OperationModal
          open
          title="Movimentar equipamento"
          subtitle={`${modalMov.nome} · ${modalMov.categoria}${contextoMovPonto?.nomeFantasia?` · vinculado a ${contextoMovPonto.nomeFantasia}`:""}`}
          onClose={fecharMov}
          size="lg"
          className="equip-cf-movement-modal"
          overlayClassName="equip-cf-movement-overlay"
          footer={<><button className="btn-secundario" type="button" onClick={fecharMov}>Cancelar</button><button className="btn-primario" type="button" onClick={confirmarMov}>{tipoMovSel.id==="conserto"&&perfilAtual.perfil!=="operador"?"Enviar solicitação ao operador":"Confirmar movimentação"}</button></>}
        >
              <div className="equip-cf-movement-subject">
                <span className="equip-cf-category-icon"><Icon name={ICONES[modalMov.categoria]} size={20}/></span>
                <span><small>Equipamento selecionado</small><strong>{modalMov.nome}</strong></span>
                <span className={`badge-status ${STATUS_CFG[modalMov.status]?.cor||""}`}>{modalMov.status}</span>
              </div>
              <div className="equip-cf-movement-path" aria-label="Fluxo da movimentação: origem, ação e destino">
                <div className="equip-cf-movement-step">
                  <span>Origem</span>
                  <strong>{textoLocalizacaoEquipamento(modalMov)}</strong>
                  <small>Posição atual</small>
                </div>
                <span className="equip-cf-movement-arrow" aria-hidden="true"><Icon name="arrowRight"/></span>
                <div className="equip-cf-movement-step is-action">
                  <span>Movimentação</span>
                  <strong>{acaoMovimentacao}</strong>
                  <small>{tipoMovSel?.novoStatus||modalMov.status}</small>
                </div>
                <span className="equip-cf-movement-arrow" aria-hidden="true"><Icon name="arrowRight"/></span>
                <div className="equip-cf-movement-step is-destination">
                  <span>Destino</span>
                  <strong aria-live="polite">{destinoMovimentacao}</strong>
                  <small>Posição após confirmar</small>
                </div>
              </div>
              {erroMov&&<div className="erro-msg"><Icon name="warning"/> {erroMov}</div>}
              <div className="campo">
                <label>Tipo de Movimentação *</label>
                <div className="tipos-mov-grid">
                  {TIPOS_MOV.filter(t=>podeEditar||t.id!=="gerente").map(t=>(
                    <button key={t.id} type="button" aria-pressed={mov.tipoId===t.id} className={`tipo-mov-btn ${mov.tipoId===t.id?"tipo-mov-ativo":""}`} onClick={()=>setMov({...mov,tipoId:t.id})}>
                      <span className="tipo-mov-icone"><Icon name={t.icone}/></span>
                      <span className="tipo-mov-label">{t.id==="conserto"&&!operador?"Solicitar Conserto":t.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              {tipoMovSel?.exigePonto&&(
                <div className="campo">
                  <label>Ponto de destino *</label>
                  <select value={mov.ponto} onChange={e=>setMov({...mov,ponto:e.target.value})}>
                    <option value="">Selecione um ponto...</option>
                    {pontosDestinoOperacional.map(p=><option key={p.id} value={p.nomeFantasia}>{p.nomeFantasia}</option>)}
                  </select>
                  {pontosDestinoOperacional.length===0&&<span className="campo-hint">Cadastre ou reative um ponto antes de enviar o equipamento.</span>}
                </div>
              )}
              {tipoMovSel?.id==="gerente"&&(
                <div className="campo">
                  <label>Gerente que vai receber *</label>
                  <select value={mov.gerente} onChange={e=>setMov({...mov,gerente:e.target.value,responsavel:e.target.value})}>
                    <option value="">Selecione o gerente...</option>
                    {GERENTES.map(g=><option key={g} value={g}>{g}</option>)}
                  </select>
                  <span className="campo-hint">O item ficará como enviado aguardando confirmação no acesso deste gerente.</span>
                </div>
              )}
              {tipoMovSel?.id==="conserto"&&(
                <div className="conserto-campos">
                  <div className="campo">
                    <label>Defeito identificado *</label>
                    <textarea placeholder="Ex: tela apagando, fonte queimada..." rows={2} value={mov.defeito} onChange={e=>setMov({...mov,defeito:e.target.value})}/>
                    {perfilAtual.perfil!=="operador"&&<span className="campo-hint">Esta ação apenas envia a descrição do problema ao operador. O equipamento mantém o status e o local atuais até o operador analisar e aprovar o conserto.</span>}
                  </div>
                  {!gerenteAtual&&(
                    <div className="campos-duplos">
                      {perfilAtual.perfil==="operador"&&<div className="campo"><label>Forma de pagamento *</label><select value={mov.formaPagamento} onChange={e=>setMov({...mov,formaPagamento:e.target.value,consertoPix:e.target.value==="PIX"?mov.consertoPix:""})}><option value="PIX">PIX</option><option value="Dinheiro">Dinheiro</option><option value="Cartão">Cartão</option><option value="Boleto">Boleto</option><option value="Outro">Outro</option></select></div>}
                    </div>
                  )}
                  {perfilAtual.perfil!=="gerente"&&(
                    <div className={`conserto-fiscal-card ${perfilAtual.perfil!=="operador"?"conserto-fiscal-bloqueado":""}`}>
                      <div>
                        <span className="dash-kicker">Dados fiscais do conserto</span>
                        <p>{perfilAtual.perfil==="operador"?"A foto da nota fiscal é opcional. Informe o valor e os dados de pagamento para aprovar.":"Somente o operador registra nota, PIX e valor do conserto."}</p>
                      </div>
                      <div className="campos-duplos">
                        <div className="campo">
                          <label>Foto da nota fiscal (opcional)</label>
                          <input type="file" accept="image/*" disabled={perfilAtual.perfil!=="operador"} onChange={e=>anexarNotaFiscalConserto(e.target.files?.[0])}/>
                          {mov.notaFiscalNome&&<span className="campo-hint">Anexado: {mov.notaFiscalNome}</span>}
                          {mov.notaFiscalArquivo&&<button className="btn-link-mini" type="button" onClick={()=>window.open(mov.notaFiscalArquivo,"_blank","noopener,noreferrer")}>Visualizar nota anexada</button>}
                        </div>
                        <div className="campo">
                          <label>Valor do conserto {perfilAtual.perfil==="operador"?"*":""}</label>
                          <input type="number" min="0" step="0.01" placeholder="Ex: 150,00" disabled={perfilAtual.perfil!=="operador"} value={mov.consertoValor} onChange={e=>setMov({...mov,consertoValor:e.target.value})}/>
                        </div>
                      </div>
                      <div className="campo">
                        <label>{mov.formaPagamento==="PIX"?"Chave PIX do conserto *":"Detalhe do pagamento"}</label>
                        <input type="text" placeholder={mov.formaPagamento==="PIX"?"Digite a chave PIX informada na nota/assistência":"Ex: pago em dinheiro, máquina, boleto..."} disabled={perfilAtual.perfil!=="operador"||mov.formaPagamento!=="PIX"} value={mov.consertoPix} onChange={e=>setMov({...mov,consertoPix:e.target.value})}/>
                        {mov.formaPagamento!=="PIX"&&<span className="campo-hint">PIX não é obrigatório quando a forma de pagamento for {mov.formaPagamento||"outra"}.</span>}
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="mov-status-resultado">{tipoMovSel.id==="conserto"&&perfilAtual.perfil!=="operador"
                ?<>Destino da solicitação: <span className="badge-conserto-operacao">Aguardando aprovação do operador</span></>
                :<>Novo status: <span className={`badge-status ${STATUS_CFG[tipoMovSel.novoStatus]?.cor||""}`}>{tipoMovSel.novoStatus}</span></>}</div>
              <div className="campos-duplos">
                <div className="campo"><label>Responsável</label><input type="text" placeholder="Ex: Carlos" value={mov.responsavel} onChange={e=>setMov({...mov,responsavel:e.target.value})}/></div>
                <div className="campo"><label>Observação</label><input type="text" placeholder="Motivo..." value={mov.observacao} onChange={e=>setMov({...mov,observacao:e.target.value})}/></div>
              </div>
        </OperationModal>
      )}

      {excluindo&&(
        <OperationModal title="Excluir equipamento" subtitle="Esta ação remove o registro selecionado." role="alertdialog" size="sm" onClose={()=>setExcluindo(null)} footer={<><button className="btn-secundario" type="button" onClick={()=>setExcluindo(null)}>Cancelar</button><button className="btn-danger" type="button" onClick={()=>excluir(excluindo)}>Excluir</button></>}>
          <p className="senha-texto">Tem certeza que deseja excluir este equipamento?</p>
        </OperationModal>
      )}

      {itemDetalhe&&(
        <FichaEquipamento
          item={itemDetalhe}
          historico={historico}
          onFechar={()=>{setItemDetalhe(null);setItemDetalheSomenteLeitura(false);}}
          onEditar={abrirEditar}
          onMovimentar={abrirMov}
          onCompletarConserto={abrirConsertoOperador}
          onConfirmarPagamento={confirmarPagamentoConserto}
          podeEditar={podeMovimentarEquipamento(itemDetalhe)}
          somenteLeitura={itemDetalheSomenteLeitura}
          perfilAtual={perfilAtual}
        />
      )}

      {confirmLogout&&(
        <OperationModal title="Sair do sistema" subtitle="Sua sessão será encerrada neste dispositivo." role="alertdialog" size="sm" onClose={()=>setConfirmLogout(false)} footer={<><button className="btn-secundario" type="button" onClick={()=>setConfirmLogout(false)}>Cancelar</button><button className="btn-danger" type="button" onClick={onLogout}>Sair</button></>}>
          <p className="senha-texto">Tem certeza que deseja sair?</p>
        </OperationModal>
      )}

      {avisoPrazoDespesas&&(
        <OperationModal ariaLabel="Prazo de lançamento de despesas" role="alertdialog" size="sm" className="aviso-prazo-despesas" overlayClassName="aviso-prazo-overlay" showClose={false} closeOnBackdrop={false} closeOnEscape={false} onClose={confirmarAvisoPrazoDespesas} footer={<button className="btn-primario" type="button" onClick={confirmarAvisoPrazoDespesas}>Li e estou ciente</button>}>
            <div className="aviso-prazo-faixa">Prazo de lançamento se encerrando</div>
            <div className="modal-body">
              <h3>Conclua as despesas de {avisoPrazoDespesas.competencia}</h3>
              <p>Todos os lançamentos devem ser concluídos até o dia {avisoPrazoDespesas.ultimoDia}, às 23:59.</p>
              <p>Após o fechamento do mês, novas despesas ficarão bloqueadas e não poderão ser incluídas posteriormente.</p>
              <div className="aviso-prazo-responsabilidade">
                Despesas não registradas dentro do prazo não serão consideradas no fechamento. A omissão será tratada como falta de comprometimento operacional, e eventual prejuízo ficará sob responsabilidade do gerente.
              </div>
            </div>
        </OperationModal>
      )}

      {modalSenha&&<ModalAlterarSenha onFechar={()=>setModalSenha(false)}/>}
      <ChatInterno perfilAtual={perfilAtual} gerentes={gerentesChat}/>
    </div>
  );
}
