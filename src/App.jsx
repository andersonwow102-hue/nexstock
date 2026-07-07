import logo from "./assets/stock-on-dark.png";
import logoLight from "./assets/stock-on-light.png";
import logo90DaSorte from "./assets/modalidade-90-da-sorte.png";
import logoViapix from "./assets/modalidade-viapix.png";
import logoLotobanca from "./assets/modalidade-lotobanca.png";
import { useState, useEffect, useMemo, useRef } from "react";
import "./App.css";
import PointsPage, { PointFormModal } from "./PointsPage.jsx";
import ManagementPage from "./ManagementPage.jsx";
import LoginManagerPage from "./LoginManagerPage.jsx";
import { GERENTES, MODALIDADES, ROTAS_POR_GERENTE, GERENTE_CORES, gerenteDaRota, rotaCanonica, rotaPermitidaAoPerfil, rotaPertenceAoGerente } from "./pointsData.js";
import { limparRecuperacao, recuperacaoIniciada, supabase } from "./supabase.js";
import { getMensagemMotivacionalDoDia } from "./motivationalMessages.js";
import { exportarCsvSeguro } from "./csvExport.js";
import {
  carregarEquipamentos, salvarEquipamento, excluirEquipamento,
  carregarHistoricoEquipamentos, adicionarHistoricoEquipamento, limparHistoricoEquipamentos,
  carregarPontos, salvarPonto, adicionarHistoricoPonto, carregarHistoricoPontos,
  carregarPerfilAtual, resolverEmailPorLogin, carregarDespesasMensais,
  carregarMensagensInternas, enviarMensagemInterna, marcarMensagensInternasLidas,
  carregarPixEnvios, enviarPixParaGerente,
  carregarFechamentosRotas, salvarFechamentoRota, finalizarPrestacaoRota,
  registrarVisualizacaoFechamento, confirmarFechamentoGerente,
  carregarGerenteModalidadeAcessos, salvarGerenteModalidadeAcesso, excluirGerenteModalidadeAcesso,
  carregarModalidadeApps, enviarModalidadeApp, obterLinkDownloadModalidadeApp,
} from "./db.js";

const CATEGORIAS = ["Televisões","Terminais","Impressoras","Tablets","Carregadores","Máquina de Brindes","Totens","Noteiro","PDV Touchscreen"];
const STATUS_LISTA = ["Disponível","Em rota","Em conserto"];
const ICONES = {"Televisões":"📺","Terminais":"🖥️","Impressoras":"🖨️","Tablets":"📱","Carregadores":"🔌","Máquina de Brindes":"🎁","Totens":"🗼","Noteiro":"💵","PDV Touchscreen":"🧾"};
const MINIMO_CATEGORIA = 5;
const CATEGORIA_COM_ALERTA = "Terminais";
const STATUS_CFG = {
  "Disponível": {cor:"status-disponivel"},
  "Em rota":    {cor:"status-em-rota"},
  "Em conserto":{cor:"status-conserto"},
};
const TIPOS_MOV = [
  {id:"ponto",     label:"Enviar para Ponto",   icone:"📍",novoStatus:"Em rota",     exigePonto:true },
  {id:"gerente",   label:"Enviar p/ Gerente",   icone:"🧑‍💼",novoStatus:"Em rota",  exigePonto:false},
  {id:"conserto",  label:"Enviar p/ Conserto",  icone:"🔧",novoStatus:"Em conserto",exigePonto:false},
  {id:"disponivel",label:"Disponibilizar",       icone:"✅",novoStatus:"Disponível",  exigePonto:false},
];
const HIST_CFG = {
  "cadastro":  {cor:"hist-cadastro",  icone:"🆕",label:"Cadastro" },
  "edicao":    {cor:"hist-edicao",    icone:"✏️",label:"Edição"   },
  "exclusao":  {cor:"hist-exclusao",  icone:"🗑️",label:"Exclusão" },
  "entrada":   {cor:"hist-entrada",   icone:"➕",label:"Entrada"  },
  "saida":     {cor:"hist-saida",     icone:"➖",label:"Saída"    },
  "conserto":  {cor:"hist-conserto",  icone:"🔧",label:"Conserto" },
  "retorno":   {cor:"hist-retorno",   icone:"✅",label:"Retorno"  },
  "defeito":   {cor:"hist-defeito",   icone:"❌",label:"Defeito"  },
  "disponivel":{cor:"hist-disponivel",icone:"🟢",label:"Disponível"},
  "baixa":     {cor:"hist-baixa",     icone:"⬇️",label:"Baixa"    },
  "ponto":     {cor:"hist-rota",      icone:"📍",label:"Enviado ao ponto"},
  "envio_gerente": {cor:"hist-rota",  icone:"📦",label:"Enviado ao gerente"},
  "recebimento_gerente": {cor:"hist-entrada", icone:"✅",label:"Recebido pelo gerente"},
};

const ICON_PATHS = {
  dashboard: <><rect x="3" y="3" width="7" height="8" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="15" width="7" height="6" rx="1.5"/></>,
  package: <><path d="m21 8-9-5-9 5 9 5 9-5Z"/><path d="m3 8 9 5 9-5"/><path d="M12 13v8"/><path d="M5 10.2v6.6L12 21l7-4.2v-6.6"/></>,
  mapPin: <><path d="M12 21s7-5.1 7-11a7 7 0 1 0-14 0c0 5.9 7 11 7 11Z"/><circle cx="12" cy="10" r="2.4"/></>,
  fileText: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/><path d="M9 13h6"/><path d="M9 17h6"/><path d="M9 9h2"/></>,
  checkCircle: <><circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.2 2.2 4.8-5.1"/></>,
  key: <><circle cx="7.5" cy="14.5" r="3.5"/><path d="m10 12 9-9"/><path d="m15 7 2 2"/><path d="m17 5 2 2"/></>,
  shieldKey: <><path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6l-7-3Z"/><circle cx="10" cy="12" r="2"/><path d="m12 12 4 4"/><path d="m14 14 1.5-1.5"/></>,
  lock: <><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><path d="M12 14v2"/></>,
  history: <><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></>,
  monitor: <><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></>,
  wrench: <><path d="M14.7 6.3a4 4 0 0 0 5 5L11 20a2.1 2.1 0 0 1-3-3l8.7-8.7a4 4 0 0 1-2-2Z"/><path d="m6 18-2 2"/></>,
  user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
  warning: <><path d="M12 3 2.8 19a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L12 3Z"/><path d="M12 9v5"/><path d="M12 18h.01"/></>,
  edit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></>,
  trash: <><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/></>,
  plus: <><circle cx="12" cy="12" r="9"/><path d="M12 8v8"/><path d="M8 12h8"/></>,
  minus: <><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></>,
  arrowDown: <><path d="M12 3v14"/><path d="m6 11 6 6 6-6"/><path d="M5 21h14"/></>,
  download: <><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></>,
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

function Icon({ name, className = "", title = "" }) {
  return (
    <svg className={`app-icon ${className}`.trim()} viewBox="0 0 24 24" aria-hidden={title ? undefined : "true"} role={title ? "img" : undefined}>
      {title ? <title>{title}</title> : null}
      {ICON_PATHS[name] || ICON_PATHS.fileText}
    </svg>
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
    return (a.patrimonio||"").localeCompare(b.patrimonio||"", "pt-BR", {numeric:true}) || a.nome.localeCompare(b.nome, "pt-BR");
  });
}
function ordenarPontos(lista){
  return [...lista].sort((a,b)=>
    (a.gerente||"").localeCompare(b.gerente||"", "pt-BR") ||
    a.nomeFantasia.localeCompare(b.nomeFantasia, "pt-BR")
  );
}

const Auth={ deslogar:async()=>{ await supabase.auth.signOut(); } };

function validarItem(f,itens=[],itemId=null,{ exigirPatrimonio=true } = {}){
  if(!f.nome.trim())       return"Nome do equipamento é obrigatório.";
  if(!f.categoria)         return"Categoria é obrigatória.";
  if(!f.status)            return"Status é obrigatório.";
  if(!padronizarNomenclaturaEquipamento(f.nome)) return"Nomenclatura do equipamento é obrigatória.";
  if(exigirPatrimonio&&!padronizarNomenclaturaEquipamento(f.patrimonio)) return"Código / Patrimônio é obrigatório.";
  const patrimonio=padronizarNomenclaturaEquipamento(f.patrimonio);
  if(patrimonio&&itens.some(i=>i.id!==itemId&&(i.patrimonio||"").trim().toUpperCase()===patrimonio)) return`Código duplicado: o patrimônio ${patrimonio} já está cadastrado.`;
  return null;
}
function validarMov(mov,tipo,perfil=""){
  if(tipo.exigePonto&&!mov.ponto)return"Selecione o ponto de destino.";
  if(tipo.id==="conserto"&&!mov.defeito.trim())return"Descreva o defeito antes de enviar o equipamento para conserto.";
  if(tipo.id==="conserto"&&perfil==="operador"){
    if(!mov.notaFiscalArquivo)return"Anexe a foto da nota fiscal antes de enviar para conserto.";
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
    "Patrimônio":i.patrimonio||"—","Nome":i.nome,"Categoria":i.categoria,
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
    nomeArquivo:`stock-on_equipamentos_${hoje()}.pdf`,
    total:itens.length,
    resumo:[
      {label:"Cadastrados",valor:itens.length},
      {label:"Disponíveis",valor:itens.filter(i=>i.status==="Disponível").length,destaque:[5,150,82]},
      {label:"Em rota",valor:itens.filter(i=>i.status==="Em rota").length,destaque:[37,99,235]},
      {label:"Em conserto",valor:itens.filter(i=>i.status==="Em conserto").length,destaque:[201,125,0]},
    ],
    colunas:["Patrimônio","Equipamento","Categoria","Status","Ponto / Localização","Responsável"],
    linhas:ordenados.map(i=>[i.patrimonio||"-",i.nome,i.categoria,i.status,i.localizacao||"Sem ponto",i.responsavel||"-"]),
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
    nomeArquivo:`stock-on_historico_equipamentos_${hoje()}.pdf`,
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

function RelatoriosPage({ itens, pontos, historico, historicoPontos, perfilAtual }) {
  const gerentes = [...new Set([...GERENTES, ...pontos.map(p=>gerenteDaRota(p.gerente)).filter(Boolean)])].sort((a,b)=>a.localeCompare(b));
  const [gerenteSelecionado, setGerenteSelecionado] = useState("");
  const gerente = gerentes.includes(gerenteSelecionado) ? gerenteSelecionado : gerentes[0]||"";
  const disponiveis = itens.filter(i=>i.status==="Disponível");
  const despesas = lista => lista.reduce((total,p)=>total+(p.possuiDespesa==="sim"?Number(p.valorDespesa||0):0),0);
  const emConserto = itens.filter(i=>i.status==="Em conserto");
  const pendentesConfirmacao = itens.filter(i=>i.transferenciaStatus===TRANSFERENCIA_GERENTE.aguardando);
  const terminaisDisponiveis = itens.filter(i=>i.categoria===CATEGORIA_COM_ALERTA&&i.status==="Disponível").length;
  const alertaTerminais = Math.max(0, MINIMO_CATEGORIA-terminaisDisponiveis);
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
    i.patrimonio||"-", i.nome, i.categoria, i.status, i.localizacao||"Sem ponto", i.responsavel||"-",
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
      nomeArquivo:`stock-on_relatorio_geral_${hoje()}.pdf`,
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
          colunas:["Patrimônio","Equipamento","Categoria","Status","Ponto / Localização","Responsável"],
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
      nomeArquivo:`stock-on_pontos_${hoje()}.pdf`,
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
      nomeArquivo:`stock-on_disponiveis_${hoje()}.pdf`,
      total:disponiveis.length,
      resumo:[
        {label:"Disponíveis",valor:disponiveis.length,destaque:[5,150,82]},
        ...CATEGORIAS.map(categoria=>({
          label:categoria,
          valor:disponiveis.filter(i=>i.categoria===categoria).length,
        })),
      ],
      colunas:["Patrimônio","Equipamento","Categoria","Status","Ponto / Localização","Responsável"],
      linhas:linhasEquipamentos(disponiveis),
    });
  }

  async function gerarPorGerente() {
    await gerarPDF({
      titulo:`Relatório do Gerente - ${gerente}`,
      descricao:"Pontos sob responsabilidade e equipamentos atualmente vinculados",
      nomeArquivo:`stock-on_gerente_${gerente.toLowerCase().replace(/\s+/g,"-")}_${hoje()}.pdf`,
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
          colunas:["Patrimônio","Equipamento","Categoria","Status","Ponto / Localização","Responsável"],
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
          <p>Um painel rápido para ver pendências, rotas, estoque crítico e gerar documentos quando precisar prestar conta.</p>
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
        <article className={alertaTerminais?"central-kpi central-kpi-alerta":"central-kpi"}>
          <span><Icon name="monitor" /></span>
          <div><strong>{terminaisDisponiveis}</strong><small>terminais disponíveis{alertaTerminais?` · faltam ${alertaTerminais}`:""}</small></div>
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
          {pendentesConfirmacao.length===0&&emConserto.length===0&&alertaTerminais===0
            ?<p className="dash-vazio">Sem pendências críticas no momento. Operação respirando bem.</p>
            :<div className="central-lista">
              {pendentesConfirmacao.slice(0,4).map(item=><div key={item.id} className="central-item">
                <span><Icon name="mail" /></span><div><strong>{item.patrimonio||item.nome}</strong><small>Aguardando confirmação de {item.gerenteResponsavel||"gerente"}</small></div>
              </div>)}
              {alertaTerminais>0&&<div className="central-item">
                <span><Icon name="warning" /></span><div><strong>Terminais abaixo do mínimo</strong><small>{terminaisDisponiveis} disponíveis de {MINIMO_CATEGORIA} necessários</small></div>
              </div>}
              {emConserto.slice(0,3).map(item=><div key={item.id} className="central-item">
                <span><Icon name="wrench" /></span><div><strong>{item.patrimonio||item.nome}</strong><small>{item.nome} está em conserto</small></div>
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
            <label><input type="checkbox" readOnly checked={alertaTerminais===0}/> Manter terminais acima do mínimo</label>
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
          <span className="relatorio-icone">📑</span>
          <h3>Tudo</h3>
          <p>Resumo geral, lista de equipamentos e lista de pontos em um único PDF.</p>
          <button className="btn-primario" onClick={gerarCompleto}>Gerar PDF completo</button>
        </article>
        <article className="relatorio-card">
          <span className="relatorio-icone">📦</span>
          <h3>Equipamentos</h3>
          <p>Inventário completo com status e localização atual.</p>
          <button className="btn-secundario" onClick={()=>exportarEquipamentosPDF(itens)}>Gerar equipamentos</button>
        </article>
        <article className="relatorio-card">
          <span className="relatorio-icone">📍</span>
          <h3>Pontos</h3>
          <p>Estabelecimentos, despesas, gerentes e quantidade de equipamentos.</p>
          <button className="btn-secundario" onClick={gerarPontos}>Gerar pontos</button>
        </article>
        <article className="relatorio-card">
          <span className="relatorio-icone">✅</span>
          <h3>Disponíveis</h3>
          <p>Somente os {disponiveis.length} equipamentos disponíveis para envio.</p>
          <button className="btn-secundario" onClick={gerarDisponiveis}>Gerar disponíveis</button>
        </article>
        <article className="relatorio-card relatorio-gerente">
          <span className="relatorio-icone">👤</span>
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
          <span className="relatorio-icone">💾</span>
          <h3>Backup completo</h3>
          <p>Baixa equipamentos, pontos e históricos em arquivo de segurança para guardar fora do sistema.</p>
          <button className="btn-secundario" onClick={exportarBackup}>Baixar backup</button>
        </article>}
      </section>
    </div>
  );
}

function BuscaGlobalSearch({ consulta, onConsulta, itens, pontos, historico, onVerEquipamento, onAbrirPontos }) {
  const termo=consulta.trim().toLowerCase();
  const equipamentos=termo?itens.filter(i=>[i.patrimonio,i.nome,i.categoria,i.status,i.localizacao,i.responsavel].some(v=>(v||"").toLowerCase().includes(termo))).slice(0,6):[];
  const pontosEncontrados=termo?pontos.filter(p=>[p.nomeFantasia,p.nomeDono,p.gerente,rotaCanonica(p.gerente),gerenteDaRota(p.gerente),p.telefone,...p.modalidades].some(v=>(v||"").toLowerCase().includes(termo))).slice(0,6):[];
  const movimentos=termo?historico.filter(h=>[h.itemNome,h.categoria,h.tipo,h.responsavel,h.observacao].some(v=>(v||"").toLowerCase().includes(termo))).slice(0,6):[];
  const totalResultados=equipamentos.length+pontosEncontrados.length+movimentos.length;
  return(
    <div className="busca-topo-wrap">
      <input className="busca-topo-input" type="text" placeholder="Buscar geral..." value={consulta} onChange={e=>onConsulta(e.target.value)}/>
      {termo&&(
        <div className="busca-topo-resultados">
          <div className="busca-topo-head">
            <strong>Busca geral</strong>
            <button type="button" onClick={()=>onConsulta("")}>Limpar</button>
          </div>
          {totalResultados===0?<p className="busca-topo-vazio">Nenhum resultado encontrado.</p>:<>
            {equipamentos.length>0&&<section><span>Equipamentos</span>{equipamentos.map(i=><button key={i.id} className="busca-topo-item" type="button" onClick={()=>{onVerEquipamento(i);onConsulta("");}}><strong>{i.patrimonio}</strong><em>{i.nome}</em><small>{i.status} · {i.localizacao||"Sem ponto"}</small></button>)}</section>}
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
    acc[modalidade.id] = { entrada: "", comissao: "", saida: "" };
    return acc;
  }, {});
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

function chaveAppModalidade(modalidade, appTipo = "padrao") {
  return `${modalidade}::${appTipo || "padrao"}`;
}

function SenhasModalidadesPage({ perfilAtual, acessos = [], apps = [], onAcessosChange, onAppsChange }) {
  const administrador = perfilAtual?.perfil === "administrador";
  const gerenteAtual = perfilAtual?.perfil === "gerente" ? (perfilAtual.gerenteNome || perfilAtual.nome || "") : "";
  const [form, setForm] = useState({ gerente: GERENTES[0] || "", modalidade: MODALIDADES[0] || "", login: "", senha: "", link: "", observacao: "" });
  const [appForm, setAppForm] = useState({ modalidade: MODALIDADES[0] || "", appTipo: "terminal", arquivo: null });
  const [senhasVisiveis, setSenhasVisiveis] = useState({});
  const [salvando, setSalvando] = useState(false);
  const [enviandoApp, setEnviandoApp] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const acessosVisiveis = administrador ? acessos : acessos.filter(a => normalizarTexto(a.gerente) === normalizarTexto(gerenteAtual));
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
      alert(`${label} copiado.`);
    } catch {
      alert(`${label}: ${texto}`);
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
      setAppForm({ modalidade: appForm.modalidade, appTipo: appForm.appTipo, arquivo: null });
      e.currentTarget.reset();
      setOk("APK enviado para download dos gerentes.");
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
    <section className="secao senhas-page">
      <div className="senhas-hero">
        <div>
          <span className="dash-kicker">Acesso das modalidades</span>
          <h2>{administrador ? "Senhas e apps dos gerentes" : "Minhas senhas e apps"}</h2>
          <p>{administrador ? "Cadastre login, senha, link e APK por modalidade." : "Consulte os acessos liberados pela administração."}</p>
        </div>
        <span className="perfil-selo perfil-administrador">{administrador ? "Administração" : "Gerente"}</span>
      </div>

      {(erro||ok)&&<div className={erro?"erro-box":"sucesso-box"}>{erro||ok}</div>}

      {administrador&&(
        <div className="senhas-admin-grid">
          <form className="senhas-form-card" onSubmit={salvarAcesso}>
            <div>
              <span className="dash-kicker">Login de gerente</span>
              <h3>Cadastrar acesso</h3>
            </div>
            <div className="campos-duplos">
              <label>Gerente<select value={form.gerente} onChange={e=>setForm({...form,gerente:e.target.value})}>{GERENTES.map(g=><option key={g}>{g}</option>)}</select></label>
              <label>Modalidade<select value={form.modalidade} onChange={e=>setForm({...form,modalidade:e.target.value})}>{MODALIDADES.map(m=><option key={m}>{m}</option>)}</select></label>
            </div>
            <div className="campos-duplos">
              <label>Login<input value={form.login} onChange={e=>setForm({...form,login:e.target.value})} placeholder="Usuário, e-mail ou código"/></label>
              <label>Senha<input value={form.senha} onChange={e=>setForm({...form,senha:e.target.value})} placeholder="Senha da modalidade"/></label>
            </div>
            <label>Link da plataforma<input value={form.link} onChange={e=>setForm({...form,link:e.target.value})} placeholder="https://..."/></label>
            <label>Observação<input value={form.observacao} onChange={e=>setForm({...form,observacao:e.target.value})} placeholder="Instrução rápida para o gerente"/></label>
            <button className="btn-primario" disabled={salvando}>{salvando?"Salvando...":"Salvar acesso"}</button>
          </form>

          <form className="senhas-form-card" onSubmit={enviarApp}>
            <div>
              <span className="dash-kicker">Apps Android</span>
              <h3>Upload do APK</h3>
            </div>
            <label>Modalidade<select value={appForm.modalidade} onChange={e=>{
              const modalidade = e.target.value;
              const tipoAtualValido = APP_TIPOS_90_DA_SORTE.some(tipo => tipo.id === appForm.appTipo);
              setAppForm({...appForm,modalidade,appTipo:modalidade==="90 da Sorte"?(tipoAtualValido?appForm.appTipo:"terminal"):"padrao"});
            }}>{MODALIDADES.map(m=><option key={m}>{m}</option>)}</select></label>
            {appForm.modalidade==="90 da Sorte"&&(
              <label>Tipo do APK<select value={appForm.appTipo} onChange={e=>setAppForm({...appForm,appTipo:e.target.value})}>{APP_TIPOS_90_DA_SORTE.map(tipo=><option key={tipo.id} value={tipo.id}>{tipo.label}</option>)}</select></label>
            )}
            <label>Arquivo APK<input type="file" accept=".apk,application/vnd.android.package-archive,application/octet-stream" onChange={e=>setAppForm({...appForm,arquivo:e.target.files?.[0]||null})}/></label>
            <p className="campo-hint">O arquivo fica disponível para download dos gerentes logados.</p>
            <button className="btn-primario" disabled={enviandoApp}>{enviandoApp?"Enviando...":"Enviar APK"}</button>
          </form>
        </div>
      )}

      <div className="senhas-conteudo-grid">
        <section className="senhas-lista-card">
          <div className="senhas-section-head">
            <div>
              <span className="dash-kicker">Senhas</span>
              <h3>{administrador ? "Acessos cadastrados" : "Acessos liberados para você"}</h3>
            </div>
          </div>
          {acessosVisiveis.length===0
            ?<p className="dash-vazio">Nenhum login de modalidade cadastrado ainda.</p>
            :<div className="senhas-card-lista">
              {acessosVisiveis.map(acesso=>{
                const chave = acesso.id || `${acesso.gerente}-${acesso.modalidade}`;
                const visivel = Boolean(senhasVisiveis[chave]);
                return (
                  <article className="senha-modalidade-card" key={chave}>
                    <div className="senha-card-topo">
                      <div><strong>{acesso.modalidade}</strong><span>{acesso.gerente}</span></div>
                      {administrador&&<div className="senha-card-acoes"><button type="button" onClick={()=>selecionarAcesso(acesso)}>Editar</button><button type="button" onClick={()=>excluirAcesso(acesso)}>Excluir</button></div>}
                    </div>
                    <div className="senha-info-row"><span>Login</span><button type="button" onClick={()=>copiar(acesso.login,"Login")}>{acesso.login || "Não informado"}</button></div>
                    <div className="senha-info-row"><span>Senha</span><button type="button" onClick={()=>copiar(acesso.senha,"Senha")}>{visivel ? (acesso.senha || "Não informada") : "••••••••"}</button></div>
                    <button className="btn-secundario senha-revelar" type="button" onClick={()=>setSenhasVisiveis(v=>({...v,[chave]:!visivel}))}>{visivel?"Ocultar senha":"Mostrar senha"}</button>
                    {acesso.link&&<button className="btn-secundario senha-link" type="button" onClick={()=>window.open(acesso.link,"_blank","noopener,noreferrer")}>Abrir plataforma</button>}
                    {acesso.observacao&&<p>{acesso.observacao}</p>}
                  </article>
                );
              })}
            </div>}
        </section>

        <section className="senhas-lista-card">
          <div className="senhas-section-head">
            <div>
              <span className="dash-kicker">Downloads</span>
              <h3>Apps das modalidades</h3>
            </div>
          </div>
          <div className="apps-download-lista">
            {MODALIDADES.map(modalidade=>{
              if (modalidade === "90 da Sorte") {
                return (
                  <article className="app-download-card app-download-card-grupo" key={modalidade}>
                    <div className="app-download-grupo-head">
                      <strong>{modalidade}</strong>
                      <span>Downloads separados para TV e Terminal</span>
                    </div>
                    <div className="app-download-sublista">
                      {APP_TIPOS_90_DA_SORTE.map(tipo=>{
                        const app = appsPorModalidade.get(chaveAppModalidade(modalidade, tipo.id));
                        return (
                          <div className={`app-download-opcao ${app?"disponivel":""}`} key={tipo.id}>
                            <div><strong>{tipo.label}</strong>{app?<span>{app.appNome} · {formatarTamanhoArquivo(app.tamanho)}</span>:<span>Nenhum APK enviado</span>}</div>
                            <button className="btn-secundario" type="button" disabled={!app} onClick={()=>baixarApp(app)}>Baixar</button>
                          </div>
                        );
                      })}
                    </div>
                  </article>
                );
              }
              const app = appsPorModalidade.get(chaveAppModalidade(modalidade));
              return (
                <article className={`app-download-card ${app?"disponivel":""}`} key={modalidade}>
                  <div><strong>{modalidade}</strong>{app?<span>{app.appNome} · {formatarTamanhoArquivo(app.tamanho)}</span>:<span>Nenhum APK enviado</span>}</div>
                  <button className="btn-secundario" type="button" disabled={!app} onClick={()=>baixarApp(app)}>Baixar app</button>
                </article>
              );
            })}
          </div>
        </section>
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
      return idsPontosRota.has(Number(d.pontoId)) &&
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
  const fechamentosDaRota = fechamentosRotas.filter(filtroFechamentoGerente);
  const fechamentoEnviado = fechamentosDaRota.length > 0;
  const fechamentoEnviadoEm = fechamentosDaRota.map(f=>f.enviadoEm || f.atualizadoEm).filter(Boolean).sort().at(-1) || "";
  const fechamentoFinalizadoEm = fechamentosDaRota.map(f=>f.finalizadoEm).filter(Boolean).sort().at(-1) || "";
  const fechamentoVisualizadoEm = fechamentosDaRota.map(f=>f.gerenteVisualizadoEm).filter(Boolean).sort().at(-1) || "";
  const fechamentoConfirmadoEm = fechamentosDaRota.map(f=>f.gerenteConfirmadoEm).filter(Boolean).sort().at(-1) || "";
  const saldoBruto = calculosModalidades.reduce((s,m)=>s+m.saldoBruto,0);
  const totalDespesas = despesasRota.reduce((s,d)=>s+valorDespesaPrestacao(d),0);
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
    const linhasDespesas = despesasRota.map(d => [
      d.ponto?.nomeFantasia || `Ponto ${d.pontoId}`,
      d.descricao || "Despesa sem descrição",
      formatarMesPrestacao(mesDespesaPrestacao(d.competencia)),
      diaDespesaPrestacao(d.criadoEm) ? formatarDiaPrestacao(diaDespesaPrestacao(d.criadoEm)) : "-",
      formatarMoedaPDF(valorDespesaPrestacao(d)),
      d.observacao || "-",
    ]);
    const pdfGerado = await gerarPDF({
      titulo: `Prestação de Conta - ${gerenteNome}`,
      descricao: `${rotaAtiva ? `Rota ${rotaAtiva}` : "Todas as rotas"} | ${periodoPrestacaoLabel(competencia,dia)}`,
      nomeArquivo: `stock-on_prestacao-gerente_${slugArquivoBackup(gerenteNome)}_${slugArquivoBackup(rotaAtiva||"todas")}_${competencia||"todos"}${dia?`_${dia}`:""}.pdf`,
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
        { label: "Saldo a repassar", valor: formatarMoedaPDF(saldoRepassar), destaque: [79,70,229] },
      ],
      secoes: [
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
        {
          titulo: "Histórico de despesas",
          colunas: ["Ponto","Descrição","Mês","Data","Valor","Observação"],
          linhas: linhasDespesas.length ? linhasDespesas : [["-","Nenhuma despesa lançada neste recorte","-","-","R$ 0,00","-"]],
          rodape: ["","","","Total",formatarMoedaPDF(totalDespesas),""],
          estilosColunas: {
            0: { cellWidth: 38 },
            1: { cellWidth: 58 },
            2: { cellWidth: 30 },
            3: { cellWidth: 25 },
            4: { cellWidth: 28, halign: "right" },
          },
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
        <label>Dia<input type="date" value={dia} onChange={e=>{setDia(e.target.value);if(e.target.value)setCompetencia(e.target.value.slice(0,7));}}/></label>
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
          <label>Dia específico<input type="date" value={dia} onChange={e=>{setDia(e.target.value);if(e.target.value)setCompetencia(e.target.value.slice(0,7));}}/></label>
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
                  <span>✓</span>
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

function FechamentoPage({ pontos = [], itens = [], despesas = [], pixEnvios = [], onPixEnviosChange }) {
  const [cartaoPix,setCartaoPix]=useState(null);
  const [pixEnvio,setPixEnvio]=useState({gerente:GERENTES[0]||"",rota:"",mensagem:""});
  const [pixErro,setPixErro]=useState("");
  const [pixOk,setPixOk]=useState("");
  const [pixSalvando,setPixSalvando]=useState(false);
  const [gerenteSelecionado,setGerenteSelecionado]=useState("");
  const [rotaSelecionada,setRotaSelecionada]=useState("");
  const [competenciaFechamento,setCompetenciaFechamento]=useState(hoje().slice(0,7));
  const [diaFechamento,setDiaFechamento]=useState("");
  const [fechamentosRotas,setFechamentosRotas]=useState([]);
  const [fechamentoValores,setFechamentoValores]=useState(criarFechamentoVazio);
  const [fechamentoOk,setFechamentoOk]=useState("");
  const [fechamentoErro,setFechamentoErro]=useState("");
  const [fechamentoSalvando,setFechamentoSalvando]=useState(false);
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
      .filter(d => idsPontos.has(Number(d.pontoId)))
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
        .filter(d => idsPontos.has(Number(d.pontoId)))
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
    .filter(d => idsPontosDetalhe.has(Number(d.pontoId)))
    .map(d => ({ ...d, ponto: pontosDetalhe.find(p => Number(p.id) === Number(d.pontoId)) }))
    .sort((a,b)=>
      String(a.ponto?.nomeFantasia||"").localeCompare(String(b.ponto?.nomeFantasia||""), "pt-BR") ||
      String(a.descricao||"").localeCompare(String(b.descricao||""), "pt-BR")
    );
  const equipamentosDetalhe = itens.filter(i =>
    nomesPontosDetalhe.has(i.localizacao) ||
    normalizarTexto(i.gerenteResponsavel) === normalizarTexto(gerenteSelecionado) ||
    (rotaDetalheAtiva && normalizarTexto(i.gerenteResponsavel) === normalizarTexto(rotaDetalheAtiva))
  );
  const modalidadesDaRota = modalidadesFechamentoPara(gerenteSelecionado, rotaDetalheAtiva);
  const totalDetalheSistema = despesasDetalhe.reduce((s,d)=>s+valorDespesaPrestacao(d),0);
  const totalDetalhe = totalDetalheSistema;
  const mediaPorPonto = pontosDetalhe.length ? totalDetalhe / pontosDetalhe.length : 0;
  const calculosModalidades = modalidadesDaRota.map(modalidade => {
    const valores = fechamentoValores[modalidade.id] || {};
    const entrada = numeroFechamento(valores.entrada);
    const comissao = modalidade.comissao === null
      ? numeroFechamento(valores.comissao)
      : entrada * modalidade.comissao;
    const saida = numeroFechamento(valores.saida);
    const saldoBruto = entrada - comissao - saida;
    return { ...modalidade, entrada, comissaoCalculada: comissao, saida, saldoBruto };
  });
  const saldoBrutoFechamento = calculosModalidades.reduce((s,m)=>s+m.saldoBruto,0);
  const saldoFinalFechamento = saldoBrutoFechamento - totalDetalhe;
  const comissaoGerenteFechamento = Math.max(0, saldoFinalFechamento) * 0.10;
  const saldoRepassarFechamento = saldoFinalFechamento - comissaoGerenteFechamento;
  const competenciaStatusFechamento = competenciaFechamento || hoje().slice(0,7);
  const diaStatusFechamento = diaFechamento || "";
  const fechamentosDetalheStatus = fechamentosRotas.filter(f =>
    f.gerente === gerenteSelecionado &&
    f.rota === rotaDetalheAtiva &&
    f.competencia === competenciaStatusFechamento &&
    (f.dia || "") === diaStatusFechamento
  );
  const fechamentoDetalheEnviadoEm = fechamentosDetalheStatus.map(f=>f.enviadoEm || f.atualizadoEm).filter(Boolean).sort().at(-1) || "";
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
      : "Ainda não enviado ao gerente";

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
    const enviado = registros.map(f => f.enviadoEm || f.atualizadoEm).filter(Boolean).sort().at(-1);

    if (finalizado) return { classe: "finalizado", titulo: "Finalizado", descricao: new Date(finalizado).toLocaleString("pt-BR") };
    if (confirmado) return { classe: "confirmado", titulo: "Confirmado", descricao: new Date(confirmado).toLocaleString("pt-BR") };
    if (visualizado) return { classe: "visualizado", titulo: "Visualizado", descricao: "Aguardando confirmação" };
    if (enviado) return { classe: "enviado", titulo: "Enviado", descricao: "Aguardando gerente" };
    return { classe: "pendente", titulo: "Sem envio", descricao: "Pronto para lançar" };
  }

  useEffect(()=>{
    let ativo=true;
    carregarFechamentosRotas()
      .then(lista=>{ if(ativo) setFechamentosRotas(lista); })
      .catch(err=>{ if(ativo) setFechamentoErro(err.message||"Não foi possível carregar os fechamentos."); });
    return ()=>{ativo=false;};
  },[]);

  useEffect(()=>{
    const modalidadesAtivas = modalidadesFechamentoPara(gerenteSelecionado, rotaDetalheAtiva);
    const vazio = criarFechamentoVazio(modalidadesAtivas);
    if(!gerenteSelecionado || !rotaDetalheAtiva){
      setFechamentoValores(vazio);
      return;
    }
    const competencia = competenciaFechamento || hoje().slice(0,7);
    const dia = diaFechamento || "";
    fechamentosRotas
      .filter(f =>
        f.gerente === gerenteSelecionado &&
        f.rota === rotaDetalheAtiva &&
        f.competencia === competencia &&
        (f.dia || "") === dia
      )
      .forEach(f => {
        const modalidadeAtual = modalidadesAtivas.find(m => [m.id, ...(m.legacyIds || [])].includes(f.modalidade));
        if (!modalidadeAtual) return;
        vazio[modalidadeAtual.id] = {
          entrada: textoFechamentoSalvo(f.entrada),
          comissao: textoFechamentoSalvo(f.comissao),
          saida: textoFechamentoSalvo(f.saida),
        };
      });
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

  async function salvarFechamentoSelecionado() {
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
        saida: m.saida,
        saldoBruto: m.saldoBruto,
      }));
      const salvos = await salvarFechamentoRota({
        gerente: gerenteSelecionado,
        rota: rotaDetalheAtiva,
        competencia,
        dia: diaFechamento || "",
        modalidades: modalidadesParaSalvar,
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
      setFechamentoOk(`Fechamento enviado para ${gerenteSelecionado} · ${rotaDetalheAtiva}. O gerente já pode abrir a Prestação de Conta e baixar o PDF dessa rota.`);
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
      .filter(d => idsPontos.has(Number(d.pontoId)))
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

  async function baixarFechamentoPDF(tipo = "rota", visualizar = false) {
    if (!gerenteSelecionado) {
      window.alert("Selecione um gerente/rota para gerar o PDF.");
      return;
    }

    async function gerarPDFDaRota(rota, visualizarRota = false) {
      if (!rota) return;
      const modalidades = calculosDaRota(rota);
      const despesasRota = despesasDaRota(rota);
      const totalBruto = modalidades.reduce((s,m)=>s+m.saldoBruto,0);
      const totalDespesas = despesasRota.reduce((s,d)=>s+valorDespesaPrestacao(d),0);
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
      const linhasDespesas = despesasRota.map(d => [
        rota,
        d.ponto?.nomeFantasia || `Ponto ${d.pontoId}`,
        d.descricao || "Despesa sem descrição",
        formatarMesPrestacao(mesDespesaPrestacao(d.competencia)),
        formatarMoedaPDF(valorDespesaPrestacao(d)),
      ]);
      await gerarPDF({
        titulo: `Fechamento - ${gerenteSelecionado} · ${rota}`,
        descricao: `Prestação de contas individual da rota | ${periodoPrestacaoLabel(competenciaFechamento,diaFechamento)}`,
        nomeArquivo: `stock-on_fechamento_${slugArquivoBackup(gerenteSelecionado)}_${slugArquivoBackup(rota)}_${competenciaFechamento || "todos"}${diaFechamento?`_${diaFechamento}`:""}.pdf`,
        visualizar: visualizarRota,
        total: 1,
        resumo: [
          { label: "Gerente", valor: gerenteSelecionado },
          { label: "Rota", valor: rota },
          { label: "Saldo bruto", valor: formatarMoedaPDF(totalBruto), destaque: [37,99,235] },
          { label: "Despesas", valor: formatarMoedaPDF(totalDespesas), destaque: [220,38,38] },
          { label: "Saldo final", valor: formatarMoedaPDF(saldoFinal), destaque: [5,150,105] },
          { label: "Comissão gerente", valor: formatarMoedaPDF(comissaoGerente), destaque: [201,125,0] },
          { label: "Saldo a repassar", valor: formatarMoedaPDF(saldoRepassar), destaque: [79,70,229] },
        ],
        secoes: [
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
          {
            titulo: "Histórico de despesas",
            colunas: ["Rota","Ponto","Descrição","Mês","Valor"],
            linhas: linhasDespesas.length ? linhasDespesas : [[rota,"-","Nenhuma despesa lançada neste recorte","-","R$ 0,00"]],
            rodape: ["","","","Total das despesas",formatarMoedaPDF(totalDespesas)],
            estilosColunas: {
              0: { cellWidth: 30 },
              1: { cellWidth: 72 },
              2: { cellWidth: 64 },
              3: { cellWidth: 48 },
              4: { cellWidth: 38, halign: "right" },
            },
          },
        ],
      });
    }

    const rotasPDF = tipo === "gerente" ? rotasDetalhe.filter(Boolean) : [rotaDetalheAtiva].filter(Boolean);
    if (rotasPDF.length === 0) {
      window.alert("Selecione uma rota para gerar o PDF.");
      return;
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

  return (
    <section className="secao fechamento-page">
      <div className="fechamento-hero">
        <div>
          <span className="dash-kicker">Fechamento por rota</span>
          <h2>Controle de fechamento dos gerentes</h2>
          <p>Área especial para acompanhar rotas, pontos, equipamentos e despesas antes do fechamento.</p>
        </div>
        <span className="perfil-selo perfil-administrador">Especial</span>
      </div>
      <div className="fechamento-filtros">
        <div className="campo">
          <label>Mês do fechamento</label>
          <input type="month" value={competenciaFechamento} onChange={e=>{setCompetenciaFechamento(e.target.value);setDiaFechamento("");}}/>
        </div>
        <div className="campo">
          <label>Dia de lançamento</label>
          <input type="date" value={diaFechamento} onChange={e=>{setDiaFechamento(e.target.value);if(e.target.value)setCompetenciaFechamento(e.target.value.slice(0,7));}}/>
        </div>
        <button className="btn-secundario" type="button" onClick={()=>{setCompetenciaFechamento(hoje().slice(0,7));setDiaFechamento("");}}>
          Limpar dia
        </button>
        <div className="fechamento-periodo-info">
          <span>Recorte atual</span>
          <strong>{periodoPrestacaoLabel(competenciaFechamento,diaFechamento)}</strong>
        </div>
      </div>
      <section className="fechamento-lista-seletor">
        <div>
          <span className="dash-kicker">Seleção do fechamento</span>
          <h3>Escolha gerente e rota</h3>
          <p>Use a lista para abrir somente a rota que será conferida e salva.</p>
        </div>
        <div className="fechamento-rota-picker" role="listbox" aria-label="Gerente e rota do fechamento">
          <span>Gerentes e rotas</span>
          <div className="fechamento-rota-lista">
            {dadosRotas.map(g=>{
              const ativo = gerenteSelecionado === g.gerente && rotaSelecionada === g.rota;
              const status = statusDaRotaFechamento(g);
              return (
                <button
                  key={`${g.gerente}-${g.rota}`}
                  className={`fechamento-rota-card ${ativo ? "ativo" : ""} ${status.classe}`}
                  type="button"
                  onClick={()=>selecionarRotaFechamento(g)}
                  style={{"--gerente-cor":g.cor?.color,"--gerente-bg":g.cor?.bg,"--gerente-border":g.cor?.border}}
                  aria-selected={ativo}
                >
                  <span className="fechamento-rota-avatar">{g.gerente.slice(0,1).toUpperCase()}</span>
                  <span className="fechamento-rota-info">
                    <strong>{g.gerente}</strong>
                    <small>{g.rota}</small>
                  </span>
                  <span className="fechamento-rota-metricas">
                    <b>{formatarMoedaPDF(g.totalDespesas)}</b>
                    <small>{g.pontos} ponto{g.pontos!==1?"s":""} · {g.equipamentos} equip.</small>
                  </span>
                  <span className="fechamento-rota-status">
                    <b>{status.titulo}</b>
                    <small>{status.descricao}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        {gerenteSelecionado&&(
          <div className="fechamento-lista-resumo" style={{"--gerente-cor":gerenteDetalhe?.cor?.color,"--gerente-bg":gerenteDetalhe?.cor?.bg,"--gerente-border":gerenteDetalhe?.cor?.border}}>
            <strong>{gerenteSelecionado}</strong>
            <span>{rotaDetalheAtiva}</span>
            <small>{pontosDetalhe.length} ponto{pontosDetalhe.length!==1?"s":""} · {equipamentosDetalhe.length} equipamento{equipamentosDetalhe.length!==1?"s":""}</small>
          </div>
        )}
      </section>
      {gerenteSelecionado&&(
        <section
          className="fechamento-detalhe"
          style={{
            "--gerente-cor":gerenteDetalhe?.cor?.color,
            "--gerente-bg":gerenteDetalhe?.cor?.bg,
            "--gerente-border":gerenteDetalhe?.cor?.border,
          }}
        >
          <div className="fechamento-detalhe-head">
            <div>
              <span className="dash-kicker">Demonstrativo administrativo</span>
              <h3>{gerenteSelecionado}{rotaDetalheAtiva?` · ${rotaDetalheAtiva}`:""}</h3>
              <p>Resumo refinado da rota selecionada para fechamento em {periodoPrestacaoLabel(competenciaFechamento,diaFechamento).toLowerCase()}.</p>
              <small className="fechamento-envio-hint">Após clicar em Enviar ao gerente, este fechamento fica disponível no login do gerente em Prestação de Conta.</small>
              {!fechamentoDetalheConfirmadoEm&&(
                <div className={`fechamento-status-envio ${fechamentoDetalheEnviadoEm ? "enviado" : ""}`}>
                  <span>{fechamentoDetalheVisualizadoEm
                    ?"PDF visualizado"
                    :fechamentoDetalheEnviadoEm?"Aguardando gerente":"Aguardando envio"}</span>
                  <strong>{fechamentoDetalheStatusTexto}</strong>
                </div>
              )}
              {fechamentoDetalheConfirmadoEm&&(
                <div className="fechamento-confirmado-destaque">
                  <span>✓</span>
                  <div>
                    <strong>{fechamentoDetalheFinalizadoEm ? "Prestação finalizada" : "Gerente confirmou este fechamento"}</strong>
                    <small>{fechamentoDetalheFinalizadoEm
                      ? `Finalizada em ${new Date(fechamentoDetalheFinalizadoEm).toLocaleString("pt-BR")} após confirmação do gerente.`
                      : `Confirmação registrada em ${new Date(fechamentoDetalheConfirmadoEm).toLocaleString("pt-BR")}. A prestação já pode ser finalizada.`}</small>
                  </div>
                </div>
              )}
            </div>
            {rotasDetalhe.length>1&&(
              <label className="fechamento-rota-select">
                <span>Trocar rota</span>
                <select value={rotaDetalheAtiva} onChange={e=>setRotaSelecionada(e.target.value)}>
                  {rotasDetalhe.map(rota=><option key={rota} value={rota}>{rota}</option>)}
                </select>
              </label>
            )}
          </div>
          <div className="fechamento-kpis">
            <article className="kpi-bruto"><i>📈</i><span>Saldo bruto</span><strong>{formatarMoedaPDF(saldoBrutoFechamento)}</strong><small>Entrada menos comissão e saída</small></article>
            <article className="kpi-despesas"><i>🧾</i><span>Despesas contabilizadas</span><strong>{formatarMoedaPDF(totalDetalhe)}</strong><small>Puxado automaticamente das despesas</small></article>
            <article className="kpi-final"><i>💎</i><span>Saldo final</span><strong>{formatarMoedaPDF(saldoFinalFechamento)}</strong><small>Saldo bruto menos despesas</small></article>
            <article className="kpi-comissao"><i>🏆</i><span>Comissão gerente 10%</span><strong>{formatarMoedaPDF(comissaoGerenteFechamento)}</strong><small>Calculado sobre o saldo final</small></article>
            <article className="kpi-repassar"><i>💳</i><span>Saldo final a repassar</span><strong>{formatarMoedaPDF(saldoRepassarFechamento)}</strong><small>Saldo final menos comissão do gerente</small></article>
          </div>
          <div className="fechamento-operacao-box">
            <div className="fechamento-operacao-head">
              <div>
                <span className="dash-kicker">Lançamento do fechamento</span>
                <h4>Entradas, comissões e saídas por modalidade</h4>
              </div>
              <small>{pontosDetalhe.length} ponto{pontosDetalhe.length!==1?"s":""} · {equipamentosDetalhe.length} equipamento{equipamentosDetalhe.length!==1?"s":""} · média de despesas {formatarMoedaPDF(mediaPorPonto)}</small>
            </div>
            <div className="fechamento-modalidades-grid">
              {calculosModalidades.map(m=>(
                <article className="fechamento-modalidade-card" key={m.id}>
                  <div className="fechamento-modalidade-topo">
                    <div className="fechamento-modalidade-marca">{m.nome.slice(0,2).toUpperCase()}</div>
                    <div>
                      <strong>{m.nome}</strong>
                      <span>{m.descricao}</span>
                    </div>
                    <b>{formatarMoedaPDF(m.saldoBruto)}</b>
                  </div>
                  <div className="fechamento-campos-grid">
                    <label>Entrada<input type="text" inputMode="decimal" value={fechamentoValores[m.id]?.entrada||""} onChange={e=>alterarFechamentoModalidade(m.id,"entrada",e.target.value)} placeholder="R$ 0,00"/></label>
                    <label>Comissão<input type="text" inputMode="decimal" value={m.comissao===null?(fechamentoValores[m.id]?.comissao||""):formatarMoedaPDF(m.comissaoCalculada)} onChange={e=>alterarFechamentoModalidade(m.id,"comissao",e.target.value)} disabled={m.comissao!==null} placeholder="R$ 0,00"/></label>
                    <label>Saída<input type="text" inputMode="decimal" value={fechamentoValores[m.id]?.saida||""} onChange={e=>alterarFechamentoModalidade(m.id,"saida",e.target.value)} placeholder="R$ 0,00"/></label>
                  </div>
                </article>
              ))}
            </div>
            {(fechamentoErro||fechamentoOk)&&<div className={fechamentoErro?"erro-box":"sucesso-box"}>{fechamentoErro||fechamentoOk}</div>}
            <div className="fechamento-salvar-linha">
              <p>Enviar publica este fechamento no acesso do gerente. Ele verá somente a rota dele na Prestação de Conta e poderá baixar o PDF por lá.</p>
              <div className="fechamento-acoes">
                <button className="btn-secundario fechamento-pdf-btn" type="button" onClick={()=>baixarFechamentoPDF("rota", true)}>Visualizar rota atual</button>
                <button className="btn-secundario fechamento-pdf-btn" type="button" onClick={()=>baixarFechamentoPDF("rota")}>Baixar rota atual</button>
                <button className="btn-secundario fechamento-pdf-btn" type="button" onClick={()=>baixarFechamentoPDF("gerente")}>Baixar todas as rotas</button>
                <button className="btn-secundario fechamento-finalizar-btn" type="button" onClick={marcarPrestacaoFinalizada} disabled={!fechamentoDetalheConfirmadoEm || Boolean(fechamentoDetalheFinalizadoEm) || fechamentoSalvando}>
                  {fechamentoDetalheFinalizadoEm
                    ?"Prestação finalizada"
                    :fechamentoDetalheConfirmadoEm
                      ?"Marcar prestação finalizada"
                      :"Aguardando confirmação do gerente"}
                </button>
                <button className="fechamento-save-btn" type="button" onClick={salvarFechamentoSelecionado} disabled={fechamentoSalvando}>{fechamentoSalvando?"Enviando...":"Enviar ao gerente"}</button>
              </div>
            </div>
          </div>
          <div className="fechamento-despesas-box">
            <div className="fechamento-despesas-head">
              <strong>Despesas da conferência</strong>
              <span>{despesasDetalhe.length} lançamento{despesasDetalhe.length!==1?"s":""}</span>
            </div>
            {despesasDetalhe.length===0?(
              <p className="dash-vazio">Nenhuma despesa encontrada para este recorte.</p>
            ):despesasDetalhe.map(d=>(
              <article className="fechamento-despesa-card" key={d.id}>
                <div>
                  <strong>{d.ponto?.nomeFantasia || `Ponto ${d.pontoId}`}</strong>
                  <span>{d.descricao || "Despesa sem descrição"}</span>
                </div>
                <small>{formatarMesPrestacao(mesDespesaPrestacao(d.competencia))}</small>
                <b>{formatarMoedaPDF(valorDespesaPrestacao(d))}</b>
              </article>
            ))}
          </div>
        </section>
      )}
      <div className="pix-admin-panel">
        <div className="pix-admin-head">
          <div>
            <span className="dash-kicker">PIX reservado</span>
            <h3>Cartões PIX para prestação de contas</h3>
            <p>Escolha um cartão, selecione o gerente/rota e envie o aviso PIX direto para ele.</p>
          </div>
          <span className="perfil-selo perfil-administrador">{PIX_CARTOES_PADRAO.length} cartões</span>
        </div>
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
    </section>
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
      pontoNome: ponto?.nomeFantasia || `Ponto ${d.pontoId}`,
      dono: ponto?.nomeDono || "",
      gerente: ponto?.gerente || "Sem gerente",
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
        nomeArquivo:`stock-on_prestacao_${slugArquivoBackup(gerenteSelecionadoPDF)}_${competencia||"todos"}${dia?`_${dia}`:""}.pdf`,
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
        nomeArquivo:`stock-on_prestacao_por-gerente_${competencia||"todos"}${dia?`_${dia}`:""}.pdf`,
        total:despesasFiltradas.length,
        resumo:resumoPrestacaoPDF(despesasFiltradas, "Todos os gerentes"),
        secoes,
      });
      return;
    }
    await gerarPDF({
      titulo:"Prestação de Contas Geral",
      descricao:`Conferência geral das despesas lançadas | ${periodoPrestacaoLabel(competencia,dia)}`,
      nomeArquivo:`stock-on_prestacao_geral_${competencia||"todos"}${dia?`_${dia}`:""}.pdf`,
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
          <span>🔎</span>
          <div>
            <strong>Filtros da conferência</strong>
            <small>Escolha o período, gerente ou pesquise por ponto/descrição.</small>
          </div>
        </div>
        <div className="campo">
          <label>Mês da prestação</label>
          <button type="button" className="periodo-trigger" onClick={abrirSeletorMes}>
            <span>{formatarMesPrestacao(competencia)}</span>
            <small>📅 Escolher</small>
          </button>
        </div>
        <div className="campo">
          <label>Dia do lançamento</label>
          <button type="button" className="periodo-trigger" onClick={abrirSeletorDia}>
            <span>{formatarDiaPrestacao(dia)}</span>
            <small>📆 Escolher</small>
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
        <div className="prestacao-pdf-icone">📄</div>
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
          <button className="btn-primario" onClick={()=>baixarPrestacaoPDF("geral")}>📄 PDF geral</button>
          <button className="btn-secundario" onClick={()=>baixarPrestacaoPDF("gerente")} disabled={!gerenteSelecionadoPDF}>👤 PDF do gerente</button>
          <button className="btn-secundario" onClick={()=>baixarPrestacaoPDF("todos-gerentes")}>📚 PDF por gerentes</button>
        </div>
      </section>

      {seletorPeriodo==="mes"&&(
        <div className="modal-overlay periodo-overlay" onClick={()=>setSeletorPeriodo(null)}>
          <div className="modal modal-periodo" onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <h3>Escolher mês da prestação</h3>
              <button className="modal-fechar" onClick={()=>setSeletorPeriodo(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="periodo-ano-controle">
                <button type="button" className="btn-secundario" onClick={()=>setAnoMesPicker(a=>a-1)}>← Ano anterior</button>
                <strong>{anoMesPicker}</strong>
                <button type="button" className="btn-secundario" onClick={()=>setAnoMesPicker(a=>a+1)}>Próximo ano →</button>
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
              <button className="modal-fechar" onClick={()=>setSeletorPeriodo(null)}>✕</button>
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
                  ← Mês anterior
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
                  Próximo mês →
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
        <button className={aba==="geral"?"ativo":""} onClick={()=>setAba("geral")}>💰 Valor geral</button>
        <button className={aba==="gerentes"?"ativo":""} onClick={()=>setAba("gerentes")}>👤 Gerente por gerente</button>
        <button className={aba==="todos"?"ativo":""} onClick={()=>setAba("todos")}>📋 Todos os lançamentos</button>
      </div>

      {aba==="geral"&&(
        <>
          <section className="prestacao-kpis">
            <article className="prestacao-kpi-total"><span>💰</span><small>Total filtrado</small><strong>{formatarMoedaPDF(totalGeral)}</strong></article>
            <article><span>🧾</span><small>Lançamentos</small><strong>{despesasFiltradas.length}</strong></article>
            <article><span>👤</span><small>Gerentes</small><strong>{gerentesComDespesa}</strong></article>
            <article><span>📍</span><small>Pontos</small><strong>{pontosComDespesa}</strong></article>
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

function FichaEquipamento({ item, historico, onFechar, onEditar, onMovimentar, onCompletarConserto, onConfirmarPagamento, podeEditar, perfilAtual }) {
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
    <div className="modal-overlay" onClick={onFechar}>
      <div className="modal modal-ficha" onClick={e=>e.stopPropagation()}>
        <div className="modal-header"><h3>Ficha do Equipamento</h3><button className="modal-fechar" onClick={onFechar}>✕</button></div>
        <div className="modal-body">
          <div className="ficha-cabecalho">
            <div><span className="equip-codigo">{item.patrimonio}</span><h2>{ICONES[item.categoria]} {item.nome}</h2></div>
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
              {operador&&emConserto&&(
                <button className="btn-primario ficha-conserto-acao" type="button" disabled={pagamentoSolicitado} onClick={()=>{onFechar();onCompletarConserto(item);}}>
                  {pagamentoSolicitado?"Aguardando pagamento do admin":pagamentoPago?"Concluir conserto":"Completar dados do conserto"}
                </button>
              )}
              {admin&&emConserto&&pagamentoSolicitado&&(
                <button className="btn-primario ficha-conserto-acao" type="button" onClick={()=>onConfirmarPagamento(item)}>Confirmar pagamento realizado</button>
              )}
              {admin&&emConserto&&!pagamentoSolicitado&&(
                <p className="ficha-conserto-aviso">Administração apenas acompanha. O operador é responsável por nota, PIX, valor e retorno do conserto.</p>
              )}
            </div>
          )}
          <h4 className="ficha-subtitulo">Linha do tempo</h4>
          <div className="ficha-historico">
            {movimentos.length===0?<p className="dash-vazio">Nenhuma movimentação registrada.</p>:movimentos.map(h=><div className="ficha-evento" key={h.id}><span className={`badge-hist ${HIST_CFG[h.tipo]?.cor||""}`}>{HIST_CFG[h.tipo]?.label||h.tipo}</span><div><strong>{h.observacao||"Sem detalhe"}</strong><small>{h.data} · {h.responsavel||"-"}</small></div></div>)}
          </div>
        </div>
        {podeEditar&&!(admin&&emConserto)&&<div className="modal-footer">
          <button className="btn-secundario" onClick={()=>{onFechar();onEditar(item);}}>Editar</button>
          <button className="btn-primario" onClick={()=>{onFechar();onMovimentar(item);}}>Movimentar</button>
        </div>}
      </div>
      {notaAberta&&(
        <div className="nota-preview-overlay" onClick={e=>{e.stopPropagation();setNotaAberta(false);}}>
          <div className="nota-preview-modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <h3>Nota fiscal do conserto</h3>
              <button className="modal-fechar" onClick={()=>setNotaAberta(false)}>✕</button>
            </div>
            <div className="nota-preview-corpo">
              <img src={item.consertoNotaArquivo} alt={`Nota fiscal ${item.consertoNotaNome||item.nome}`}/>
            </div>
            <div className="modal-footer">
              <a className="btn-secundario" href={item.consertoNotaArquivo} download={item.consertoNotaNome||"nota-fiscal-conserto.jpg"}>Baixar imagem</a>
              <button className="btn-primario" onClick={()=>setNotaAberta(false)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
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
      new Notification(`Stock-ON • ${autor}`, {
        body: ultima.mensagem,
        icon: "/icons/stock-on-192.png",
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
            <button onClick={()=>setAberto(false)}>✕</button>
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
function TelaLogin({onLogin, avisoInicial="", mensagemInicial=""}){
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
      <div className="login-card">
        <div className="login-logo"><img src={logo} alt="Stock-ON" className="login-logo-img"/></div>
        <div className="login-titulo">Acesso Restrito</div>
        <div className="login-subtitulo">Entre com suas credenciais para continuar</div>
        <form className="login-form" onSubmit={tentar}>
          {erro&&<div className="login-erro">🔒 {erro}</div>}
          {mensagem&&<div className="login-sucesso">✅ {mensagem}</div>}
          <div className="campo"><label>Login ou e-mail</label><input type="text" placeholder="ex: beu ou seu@email.com" value={identificador} onChange={e=>setIdentificador(e.target.value)} autoFocus/></div>
          <div className="campo"><label>Senha</label>
            <div className="input-senha-wrapper">
              <input type={visivel?"text":"password"} placeholder="Digite sua senha" value={senha} onChange={e=>setSenha(e.target.value)}/>
              <button type="button" className="btn-ver-senha" onClick={()=>setVisivel(!visivel)}>{visivel?"🙈":"👁️"}</button>
            </div>
          </div>
          <button type="submit" className="btn-login" disabled={carregando||!identificador||!senha}>{carregando?"Entrando...":"Entrar →"}</button>
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
        <div className="login-rodape">Stock-ON · Controle Inteligente de Equipamentos</div>
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
      <div className="login-card">
        <div className="login-logo"><img src={logo} alt="Stock-ON" className="login-logo-img"/></div>
        <div className="login-titulo">Cadastrar Nova Senha</div>
        <div className="login-subtitulo">Crie uma senha nova para continuar</div>
        <form className="login-form" onSubmit={salvar}>
          {erro&&<div className="login-erro">🔒 {erro}</div>}
          <div className="campo"><label>Nova senha</label><input type="password" placeholder="Mínimo de 10 caracteres" value={novaSenha} onChange={e=>setNovaSenha(e.target.value)} autoFocus/></div>
          <div className="campo"><label>Confirmar nova senha</label><input type="password" value={confirmacao} onChange={e=>setConfirmacao(e.target.value)}/></div>
          <button type="submit" className="btn-login" disabled={carregando||!novaSenha||!confirmacao}>{carregando?"Salvando...":"Salvar nova senha"}</button>
        </form>
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
    <div className="modal-overlay" onClick={onFechar}>
      <div className="modal modal-pequeno" onClick={e=>e.stopPropagation()}>
        <div className="modal-header"><h3>Alterar Minha Senha</h3><button className="modal-fechar" onClick={onFechar}>✕</button></div>
        {sucesso?(
          <>
            <div className="modal-body">
              <div className="senha-sucesso">✅ Senha alterada com sucesso.</div>
              <p className="senha-texto">Na próxima entrada, use a nova senha cadastrada.</p>
            </div>
            <div className="modal-footer"><button className="btn-primario" onClick={onFechar}>Fechar</button></div>
          </>
        ):(
          <form onSubmit={salvar}>
            <div className="modal-body">
              <p className="senha-texto">Esta alteração vale somente para o seu próprio login.</p>
              {erro&&<div className="erro-msg">⚠️ {erro}</div>}
              <div className="campo"><label>Senha atual *</label><input type="password" value={senhaAtual} onChange={e=>setSenhaAtual(e.target.value)} autoFocus/></div>
              <div className="campo"><label>Nova senha *</label><input type="password" placeholder="Mínimo de 10 caracteres" value={novaSenha} onChange={e=>setNovaSenha(e.target.value)}/></div>
              <div className="campo"><label>Confirmar nova senha *</label><input type="password" value={confirmacao} onChange={e=>setConfirmacao(e.target.value)}/></div>
            </div>
            <div className="modal-footer"><button type="button" className="btn-secundario" onClick={onFechar}>Cancelar</button><button type="submit" className="btn-primario" disabled={salvando}>{salvando?"Salvando...":"Alterar senha"}</button></div>
          </form>
        )}
      </div>
    </div>
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

function avatarLendario(nome) {
  const base = nomeBaseGerente(nome);
  const avatares = {
    alex: { titulo:"Arqueiro Azul", classe:"avatar-alex" },
    maynarden: { titulo:"Guardião Central", classe:"avatar-maynarden" },
    yago: { titulo:"Cavaleiro das Rotas", classe:"avatar-yago" },
    vitor: { titulo:"Titã da América", classe:"avatar-vitor" },
    eliana: { titulo:"Estrela Neon", classe:"avatar-eliana" },
    queixo: { titulo:"Escudo Dourado", classe:"avatar-queixo" },
    wene: { titulo:"Falcão Rubi", classe:"avatar-wene" },
    joão: { titulo:"Nobre Solar", classe:"avatar-joao" },
    joao: { titulo:"Nobre Solar", classe:"avatar-joao" },
    beu: { titulo:"Capitão Turquesa", classe:"avatar-beu" },
    gavião: { titulo:"Xerife das Rotas", classe:"avatar-gaviao" },
    gaviao: { titulo:"Xerife das Rotas", classe:"avatar-gaviao" },
  };
  const chave = normalizarTexto(base);
  return avatares[chave] || { titulo:"Herói do Estoque", classe:"avatar-estoque" };
}

// ── App principal ─────────────────────────────────────────────────────────────
export default function App(){
  const [logado,setLogado]=useState(false);
  const [verificando,setVerificando]=useState(true);
  const [erroSessao,setErroSessao]=useState("");
  const [mensagemLogin,setMensagemLogin]=useState("");
  const [recuperandoSenha,setRecuperandoSenha]=useState(()=>recuperacaoIniciada());

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

  if(verificando)return(
    <div className="login-page sessao-verificando">
      <div className="loading-dots"><span/><span/><span/></div>
      <p>Preparando acesso...</p>
    </div>
  );
  if(recuperandoSenha)return<TelaNovaSenha onConcluir={()=>{limparRecuperacao();setRecuperandoSenha(false);setLogado(false);setMensagemLogin("Senha alterada com sucesso. Entre com sua nova senha.");}}/>;
  if(!logado)return<TelaLogin avisoInicial={erroSessao} mensagemInicial={mensagemLogin} onLogin={()=>{setMensagemLogin("");setLogado(true);}}/>;
  return<Sistema onLogout={async()=>{await Auth.deslogar();setLogado(false);}}/>;
}

// ── Sistema ───────────────────────────────────────────────────────────────────
function Sistema({onLogout}){
  const [itens,setItens]           =useState([]);
  const [historico,setHistorico]   =useState([]);
  const [pontos,setPontos]         =useState([]);
  const [historicoPontos,setHistoricoPontos]=useState([]);
  const [despesasBackup,setDespesasBackup]=useState([]);
  const [pixEnvios,setPixEnvios]=useState([]);
  const [senhasModalidades,setSenhasModalidades]=useState([]);
  const [modalidadeApps,setModalidadeApps]=useState([]);
  const [carregando,setCarregando] =useState(true);
  const [erroCarregamento,setErroCarregamento]=useState("");
  const [tentativaCarga,setTentativaCarga]=useState(0);
  const [aba,setAba]               =useState("dashboard");
  const [abaEquip,setAbaEquip]     =useState("lista");
  const [filtroCatEquip,setFiltroCatEquip]=useState("Todas");
  const [modalForm,setModalForm]   =useState(false);
  const [modalPontoRapido,setModalPontoRapido]=useState(false);
  const [modalMov,setModalMov]     =useState(null);
  const [itemEdit,setItemEdit]     =useState(null);
  const [form,setForm]             =useState(formVazio);
  const [mov,setMov]               =useState(movVazio);
  const [erroForm,setErroForm]     =useState("");
  const [erroMov,setErroMov]       =useState("");
  const [filtroSt,setFiltroSt]     =useState("Todos");
  const [filtroEscopoEquip,setFiltroEscopoEquip]=useState("todos");
  const [busca,setBusca]           =useState("");
  const [excluindo,setExcluindo]   =useState(null);
  const [histFCat,setHistFCat]     =useState("Todas");
  const [histFTipo,setHistFTipo]   =useState("Todos");
  const [histBusca,setHistBusca]   =useState("");
  const [confirmLogout,setConfirmLogout]=useState(false);
  const [modalSenha,setModalSenha]=useState(false);
  const [alertaEstoqueAtivo,setAlertaEstoqueAtivo]=useState(false);
  const [temaClaro,setTemaClaro]   =useState(()=>{try{return localStorage.getItem("sc_tema")==="claro";}catch{return false;}});
  const [sidebarAberta,setSidebarAberta]=useState(false);
  const [itemDetalhe,setItemDetalhe]=useState(null);
  const [buscaGlobal,setBuscaGlobal]=useState("");
  const [paginaItens,setPaginaItens]=useState(1);
  const [gerenteConsulta,setGerenteConsulta]=useState("");
  const [perfilAtual,setPerfilAtual]=useState({userId:"",nome:"",perfil:"consulta",emailTemporario:false,emailTemporarioExpiraEm:""});

  useEffect(()=>{
    let ativo=true;
    async function init(){
      setCarregando(true);
      setErroCarregamento("");
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
          comPrazo(carregarHistoricoEquipamentos(),"o histórico de equipamentos"),
          comPrazo(carregarHistoricoPontos(),"o histórico de pontos"),
          comPrazo(carregarPerfilAtual(),"seu perfil de acesso"),
          comPrazo(carregarDespesasMensais(),"as despesas mensais"),
          comPrazo(carregarPixEnvios(),"os avisos PIX"),
          comPrazo(carregarGerenteModalidadeAcessos(),"as senhas das modalidades"),
          comPrazo(carregarModalidadeApps(),"os apps das modalidades"),
        ]);
        if(!ativo)return;
        if(complementos[0].status==="fulfilled")setHistorico(complementos[0].value);
        if(complementos[1].status==="fulfilled")setHistoricoPontos(complementos[1].value);
        if(complementos[2].status==="fulfilled")setPerfilAtual(complementos[2].value);
        if(complementos[3].status==="fulfilled")setDespesasBackup(complementos[3].value);
        if(complementos[4].status==="fulfilled")setPixEnvios(complementos[4].value);
        if(complementos[5].status==="fulfilled")setSenhasModalidades(complementos[5].value);
        if(complementos[6].status==="fulfilled")setModalidadeApps(complementos[6].value);
      }catch(e){
        if(!ativo)return;
        setErroCarregamento(e.message||"Não foi possível buscar os dados do sistema.");
        setCarregando(false);
      }
    }
    init();
    return()=>{ativo=false;};
  },[tentativaCarga]);

  function toggleTema(){const n=!temaClaro;setTemaClaro(n);try{localStorage.setItem("sc_tema",n?"claro":"escuro");}catch{}}
  function fecharSidebar(){setSidebarAberta(false);}
  function navegar(novaAba){setAba(novaAba);fecharSidebar();}

  const mensagemDoDia=getMensagemMotivacionalDoDia();
  const podeEditar=perfilAtual.perfil==="administrador"||perfilAtual.perfil==="operador";
  const administrador=perfilAtual.perfil==="administrador";
  const operador=perfilAtual.perfil==="operador";
  const gerentesChat=[...new Set([
    ...GERENTES,
    ...pontos.map(p=>gerenteDaRota(p.gerente)).filter(Boolean),
  ])].sort((a,b)=>a.localeCompare(b,"pt-BR"));
  const gerenteAtual=perfilAtual.perfil==="gerente"?(perfilAtual.gerenteNome||perfilAtual.nome||""):"";
  const gerenteAtualKey=normalizarTexto(gerenteAtual);
  const podeCadastrarEquipamento=podeEditar||perfilAtual.perfil==="gerente";
  const exigirPatrimonioEquipamento=perfilAtual.perfil!=="gerente";
  const gerenteNomeBase=nomeBaseGerente(gerenteAtual);
  const gerenteAvatar=avatarLendario(gerenteAtual);
  const gerentesOperacionais=[...new Set([
    ...GERENTES,
    ...pontos.map(p=>gerenteDaRota(p.gerente)).filter(Boolean),
    ...itens.map(i=>i.gerenteResponsavel).filter(Boolean),
  ])].sort((a,b)=>a.localeCompare(b,"pt-BR"));
  const pontosOperacionais=gerenteAtual?pontos.filter(p=>rotaPermitidaAoPerfil(p.gerente, perfilAtual)):pontos;
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
  const historicoPontosOperacional=gerenteAtual?historicoPontos.filter(h=>pontosOperacionaisNomes.has(h.nome)):historicoPontos;
  const recebimentosPendentes=gerenteAtual?itensOperacionais.filter(i=>normalizarTexto(i.gerenteResponsavel)===gerenteAtualKey&&i.transferenciaStatus===TRANSFERENCIA_GERENTE.aguardando):[];
  const podeMovimentarEquipamento=item=>podeEditar||(
    perfilAtual.perfil==="gerente"&&
    normalizarTexto(item.gerenteResponsavel)===gerenteAtualKey&&
    item.transferenciaStatus===TRANSFERENCIA_GERENTE.recebido
  );
  const despesasOperacionais=operador
    ?[]
    :gerenteAtual
    ?despesasBackup.filter(d=>pontosOperacionais.some(p=>p.id===d.pontoId))
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
  const totalConserto  =itensOperacionais.filter(i=>i.status==="Em conserto").length;
  const consertosPendentes=itensOperacionais
    .filter(i=>i.status==="Em conserto")
    .sort((a,b)=>(b.consertoSolicitadoEm||"").localeCompare(a.consertoSolicitadoEm||""));
  const pagamentosConsertoPendentes=itensOperacionais
    .filter(i=>i.status==="Em conserto"&&statusPagamentoConserto(i)==="solicitado")
    .sort((a,b)=>(b.consertoPagamentoSolicitadoEm||b.consertoSolicitadoEm||"").localeCompare(a.consertoPagamentoSolicitadoEm||a.consertoSolicitadoEm||""));

  const alertas = [CATEGORIA_COM_ALERTA].map(cat=>{
    const totalDisp=(gerenteAtual?itensOperacionais:estoqueInterno).filter(i=>i.categoria===cat&&i.status==="Disponível").length;
    return{categoria:cat,totalDisponivel:totalDisp,faltam:MINIMO_CATEGORIA-totalDisp};
  }).filter(a=>a.totalDisponivel<MINIMO_CATEGORIA);
  const alertasVisiveis = gerenteAtual ? [] : alertas;

  const porCategoria=CATEGORIAS.map(cat=>{
    const ci=(gerenteAtual?itensOperacionais:estoqueInterno).filter(i=>i.categoria===cat);
    const totalDisp=ci.filter(i=>i.status==="Disponível").length;
    return{categoria:cat,total:ci.length,qtdItens:ci.length,
      disponivel:totalDisp,
      emRota:ci.filter(i=>i.status==="Em rota").length,
      conserto:ci.filter(i=>i.status==="Em conserto").length,
      alertaBaixo:cat===CATEGORIA_COM_ALERTA&&totalDisp<MINIMO_CATEGORIA,
    };
  });
  const inconsistencias=itensOperacionais.filter(item=>
    item.status!=="Em conserto"&&(
      !padronizarNomenclaturaEquipamento(item.nome)||(exigirPatrimonioEquipamento&&!padronizarNomenclaturaEquipamento(item.patrimonio))
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
  const equipamentosConsultaSemPonto=equipamentosDoGerenteConsulta.filter(i=>!i.localizacao);

  const filtroCatEquipAtivo=gerenteAtual?"Todas":filtroCatEquip;
  const itensFiltrados=itensOperacionais.filter(i=>{
    const mC=filtroCatEquipAtivo==="Todas"||i.categoria===filtroCatEquipAtivo;
    const mS=filtroSt==="Todos"||i.status===filtroSt;
    const mE=gerenteAtual||filtroEscopoEquip==="todos"||
      (filtroEscopoEquip==="interno"&&i.status==="Disponível"&&!i.localizacao&&!i.gerenteResponsavel)||
      (filtroEscopoEquip==="pontos"&&i.status==="Em rota"&&Boolean(i.localizacao))||
      (filtroEscopoEquip==="gerentes"&&Boolean(i.gerenteResponsavel)&&!i.localizacao)||
      (filtroEscopoEquip==="conserto"&&i.status==="Em conserto");
    const q=busca.toLowerCase();
    const mB=!busca||[i.nome,i.patrimonio,i.responsavel,i.localizacao,i.gerenteResponsavel].some(f=>(f||"").toLowerCase().includes(q));
    return mC&&mS&&mE&&mB;
  });
  const itensOrdenados=ordenarEquipamentos(itensFiltrados);
  const totalPaginasItens=Math.max(1,Math.ceil(itensOrdenados.length/ITENS_POR_PAGINA));
  const itensPagina=itensOrdenados.slice((paginaItens-1)*ITENS_POR_PAGINA,paginaItens*ITENS_POR_PAGINA);
  const histFiltrado=historicoOperacional.filter(h=>{
    const mC=histFCat==="Todas"||h.categoria===histFCat;
    const mT=histFTipo==="Todos"||h.tipo===histFTipo;
    const q=histBusca.toLowerCase();
    const mB=!histBusca||[h.itemNome,h.responsavel,h.observacao].some(f=>(f||"").toLowerCase().includes(q));
    return mC&&mT&&mB;
  });

  useEffect(()=>{setPaginaItens(1);},[busca,filtroSt,filtroCatEquip,filtroEscopoEquip]);
  useEffect(()=>{
    if(gerenteAtual&&filtroSt==="Em conserto")setFiltroSt("Todos");
  },[gerenteAtual,filtroSt]);
  useEffect(()=>{
    if(!gerenteConsulta&&gerentesOperacionais.length)setGerenteConsulta(gerentesOperacionais[0]);
  },[gerenteConsulta,gerentesOperacionais]);
  useEffect(()=>{if(paginaItens>totalPaginasItens)setPaginaItens(totalPaginasItens);},[paginaItens,totalPaginasItens]);

  function abrirNovo(){
    if(!podeCadastrarEquipamento)return;
    setItemEdit(null);
    setForm({
      ...formVazio,
      quantidade:1,
      dataCadastro:hoje(),
      minimo:5,
      responsavel:gerenteAtual||"",
      gerenteResponsavel:gerenteAtual||"",
      transferenciaStatus:gerenteAtual?TRANSFERENCIA_GERENTE.recebido:"",
      transferenciaRecebidaEm:gerenteAtual?isoAgora():"",
    });
    setErroForm("");setModalForm(true);
  }
  function abrirEditar(i){if(!podeMovimentarEquipamento(i))return;setItemEdit(i);setForm({...i});setErroForm("");setModalForm(true);}
  function fecharForm(){setModalForm(false);}
  function abrirMov(item){
    if(!podeMovimentarEquipamento(item))return;
    const inconsistencia=validarItem(item,itens,item.id,{exigirPatrimonio:exigirPatrimonioEquipamento});
    if(inconsistencia){window.alert(`Corrija o cadastro antes de movimentar este equipamento. ${inconsistencia}`);return;}
    setModalMov(item);setMov({...movVazio,ponto:item.localizacao||"",gerente:item.gerenteResponsavel||""});setErroMov("");
  }
  function abrirConsertoOperador(item){
    if(perfilAtual.perfil!=="operador"||item.status!=="Em conserto")return;
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
  function fecharMov(){setModalMov(null);}

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
    const ff={
      ...form,
      nome:padronizarNomenclaturaEquipamento(form.nome),
      patrimonio:padronizarNomenclaturaEquipamento(form.patrimonio),
      quantidade:1,
      minimo:5,
      localizacao,
      dataCadastro:form.dataCadastro||hoje(),
      responsavel:gerenteAtual?gerenteAtual:form.responsavel,
      gerenteResponsavel:gerenteAtual?gerenteAtual:(form.gerenteResponsavel||""),
      transferenciaStatus:gerenteAtual?TRANSFERENCIA_GERENTE.recebido:(form.transferenciaStatus||""),
      transferenciaRecebidaEm:gerenteAtual?(form.transferenciaRecebidaEm||isoAgora()):(form.transferenciaRecebidaEm||""),
    };
    const erro=validarItem(ff,itens,itemEdit?.id,{exigirPatrimonio:exigirPatrimonioEquipamento});if(erro){setErroForm(erro);return;}
    if(ff.status==="Em rota"&&!ff.localizacao){setErroForm("Selecione o ponto onde este equipamento ficará.");return;}
    if(itemEdit){
      await salvarEquipamento({...ff,id:itemEdit.id});
      setItens(itens.map(i=>i.id===itemEdit.id?{...ff,id:itemEdit.id}:i));
      const d=[];
      if(itemEdit.status!==ff.status)d.push(`Status: ${itemEdit.status}→${ff.status}`);
      const h={id:Date.now(),tipo:"edicao",itemId:itemEdit.id,itemNome:ff.nome,categoria:ff.categoria,qtdAntes:itemEdit.quantidade,qtdDepois:ff.quantidade,responsavel:"—",observacao:d.length?d.join(" | "):"Dados atualizados",data:agora()};
      await adicionarHistoricoEquipamento(h);setHistorico(prev=>[h,...prev]);
    }else{
      const itemNovo={...ff};
      const novoId=await salvarEquipamento(itemNovo);
      if(!novoId){setErroForm("Não foi possível salvar o equipamento no banco.");return;}
      setItens(prev=>[...prev,{...itemNovo,id:novoId}]);
      const h={id:Date.now(),tipo:"cadastro",itemId:novoId,itemNome:ff.nome,categoria:ff.categoria,qtdAntes:0,qtdDepois:1,responsavel:"—",observacao:`Patrimônio: ${itemNovo.patrimonio}`,data:agora()};
      await adicionarHistoricoEquipamento(h);setHistorico(prev=>[h,...prev]);
    }
    fecharForm();
  }

  async function confirmarRecebimento(item){
    if(!gerenteAtual||normalizarTexto(item.gerenteResponsavel)!==gerenteAtualKey)return;
    const upd={...item,status:"Disponível",localizacao:"",responsavel:gerenteAtual,transferenciaStatus:TRANSFERENCIA_GERENTE.recebido,transferenciaRecebidaEm:isoAgora()};
    await salvarEquipamento(upd);
    setItens(prev=>prev.map(i=>i.id===item.id?upd:i));
    const h={id:Date.now(),tipo:"recebimento_gerente",itemId:item.id,itemNome:item.nome,categoria:item.categoria,qtdAntes:1,qtdDepois:1,responsavel:gerenteAtual,observacao:`Equipamento recebido por ${gerenteAtual}`,data:agora()};
    await adicionarHistoricoEquipamento(h);setHistorico(prev=>[h,...prev]);
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
    const h={id:Date.now(),tipo:"cadastro",nome:novoPonto.nomeFantasia,gerente:novoPonto.gerente,observacao:"Ponto cadastrado durante inclusão de equipamento",data:agora()};
    await adicionarHistoricoPonto(h);
    setHistoricoPontos(prev=>[h,...prev]);
    setModalPontoRapido(false);
  }

  async function excluir(id){
    if(!podeEditar)return;
    const item=itens.find(i=>i.id===id);
    await excluirEquipamento(id);
    setItens(prev=>prev.filter(i=>i.id!==id));
    const h={id:Date.now(),tipo:"exclusao",itemId:id,itemNome:item.nome,categoria:item.categoria,qtdAntes:item.quantidade,qtdDepois:0,responsavel:"—",observacao:"Item removido",data:agora()};
    await adicionarHistoricoEquipamento(h);setHistorico(prev=>[h,...prev]);
    setExcluindo(null);
  }

  async function confirmarMov(){
    if(!modalMov||!podeMovimentarEquipamento(modalMov))return;
    const tipo=TIPOS_MOV.find(t=>t.id===mov.tipoId);
    const erro=validarMov(mov,tipo,perfilAtual.perfil);if(erro){setErroMov(erro);return;}
    if(tipo.id==="gerente"&&!mov.gerente){setErroMov("Selecione o gerente que vai receber este equipamento.");return;}
    setErroMov("");
    try {
      const localizacao=tipo.id==="ponto"?mov.ponto:tipo.id==="conserto"?"Em conserto":"";
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
        consertoPagamentoStatus: gerenteAtual ? "comunicado" : perfilAtual.perfil==="operador" ? "solicitado" : (modalMov.consertoPagamentoStatus||""),
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
      const upd=tipo.id==="gerente"
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
          ?(gerenteAtual?`Gerente comunicou defeito para operação | Defeito: ${mov.defeito}`:perfilAtual.perfil==="operador"?`Operador registrou conserto e solicitou pagamento ao financeiro | Defeito: ${mov.defeito}`:`Atualização de conserto | Defeito: ${mov.defeito}`)
          :tipo.id==="gerente"
            ?`Enviado para gerente: ${mov.gerente}`
            :tipo.label;
      const informacoesConserto=tipo.id==="conserto"?[
        mov.formaPagamento&&!gerenteAtual&&`Forma de pagamento: ${mov.formaPagamento}`,
        mov.consertoPix&&!gerenteAtual&&mov.formaPagamento==="PIX"&&`PIX conserto: ${mov.consertoPix}`,
        mov.consertoValor&&!gerenteAtual&&`Valor conserto: ${formatarMoedaPDF(mov.consertoValor)}`,
        mov.notaFiscalNome&&!gerenteAtual&&`Nota fiscal: ${mov.notaFiscalNome}`,
      ]:[];
      const h={id:Date.now(),tipo:tipo.id==="gerente"?"envio_gerente":tipo.id,itemId:modalMov.id,itemNome:modalMov.nome,categoria:modalMov.categoria,qtdAntes:1,qtdDepois:1,responsavel:mov.responsavel||mov.gerente||"—",observacao:[detalhe,...informacoesConserto,mov.observacao].filter(Boolean).join(" | "),data:agora()};
      await adicionarHistoricoEquipamento(h);setHistorico(prev=>[h,...prev]);
      if(tipo.id==="conserto"&&gerenteAtual) window.alert("Equipamento comunicado à administração. A operação foi avisada para buscar o equipamento.");
      if(tipo.id==="conserto"&&perfilAtual.perfil==="operador") window.alert("Solicitação de pagamento enviada ao financeiro. A administração já pode conferir e confirmar o pagamento.");
      fecharMov();
    } catch (err) {
      setErroMov(err?.message ? `Não foi possível confirmar: ${err.message}` : "Não foi possível confirmar a movimentação.");
    }
  }

  async function confirmarPagamentoConserto(item){
    if(perfilAtual.perfil!=="administrador"||statusPagamentoConserto(item)!=="solicitado")return;
    const ok=window.confirm(`Confirmar pagamento do conserto de ${item.patrimonio||item.nome} no valor de ${formatarMoedaPDF(item.consertoValor||0)}?`);
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
    };
    await adicionarHistoricoEquipamento(h);
    setHistorico(prev=>[h,...prev]);
    window.alert("Pagamento confirmado e registrado na linha do tempo do equipamento.");
  }

  async function baixarBackupObrigatorio(){
    const geradoEm=isoAgora();
    const escopo=perfilAtual.perfil==="gerente"?`gerente-${gerenteAtual||perfilAtual.nome}`:"completo";
    const titulo=perfilAtual.perfil==="gerente"
      ?`Backup do Gerente - ${gerenteAtual||perfilAtual.nome}`
      :"Backup Completo Stock-ON";
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
          ["Sistema","Stock-ON"],
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
        colunas:["Patrimônio","Equipamento","Categoria","Status","Ponto / Localização","Gerente"],
        linhas:ordenarEquipamentos(itensOperacionais).map(i=>[
          i.patrimonio||"-",
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
            ponto?.nomeFantasia||`Ponto ${d.pontoId}`,
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
      nomeArquivo:`stock-on_backup_${slugArquivoBackup(escopo)}_${hoje()}.pdf`,
      total:itensOperacionais.length+pontosOperacionais.length+despesasOperacionais.length+historicoOperacional.length+historicoPontosOperacional.length,
      resumo:resumoBackup,
      secoes:secoesBackup,
    });
    registrarBackupPerfil(perfilAtual);
  }

  async function limparHistorico(){
    if(!administrador)return;
    if(!window.confirm("Limpar todo o histórico?"))return;
    await limparHistoricoEquipamentos();setHistorico([]);
  }

  const tipoMovSel=TIPOS_MOV.find(t=>t.id===mov.tipoId);
  const ABAS_EQUIP=[
    {id:"lista",label:`📦 Todos (${itensOperacionais.length})`},
    {id:"resumo",label:"📊 Resumo por Status"},
    {id:"historico",label:`📋 Histórico (${historicoOperacional.length})`},
  ];

  if(carregando){
    return(
      <div className={`app${temaClaro?" tema-claro":""}`} style={{display:"flex",alignItems:"center",justifyContent:"center",background:"var(--bg-base)",minHeight:"100vh"}}>
        <div style={{textAlign:"center",display:"flex",flexDirection:"column",alignItems:"center",gap:"24px",animation:"slideIn 0.4s ease"}}>
          <div style={{position:"relative",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div style={{position:"absolute",width:"120px",height:"120px",border:"2px solid var(--border)",borderTop:"2px solid var(--accent)",borderRadius:"50%",animation:"spin 1s linear infinite"}}/>
            <img src={temaClaro?logoLight:logo} alt="Stock-ON" style={{height:"70px",width:"auto",objectFit:"contain",filter:"drop-shadow(0 0 20px rgba(255,179,0,0.35))",animation:"pulse-logo 2s ease-in-out infinite"}}/>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:"8px",alignItems:"center"}}>
            <div style={{fontSize:"18px",fontWeight:"700",color:"var(--txt-primary)",letterSpacing:"-0.3px"}}>Stock-ON</div>
            <div style={{fontSize:"13px",color:"var(--txt-secondary)"}}>Carregando o sistema...</div>
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
          <img src={temaClaro?logoLight:logo} alt="Stock-ON"/>
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
    <div className={`app${temaClaro?" tema-claro":""}`}>
      <div className={`sidebar-overlay ${sidebarAberta?"ativo":""}`} onClick={fecharSidebar}/>

      <aside className={`sidebar ${sidebarAberta?"aberta":""}`}>
        <div className="sidebar-logo">
          <img src={temaClaro?logoLight:logo} alt="Stock-ON" className="logo-sidebar-emblem"/>
        </div>
        <BuscaGlobalSearch consulta={buscaGlobal} onConsulta={setBuscaGlobal} itens={itensOperacionais} pontos={pontosOperacionais} historico={historico} onVerEquipamento={setItemDetalhe} onAbrirPontos={()=>navegar("pontos")}/>
        <nav className="sidebar-nav">
          <span className="nav-section-label">Principal</span>
          <button className={`nav-item ${aba==="dashboard"?"active":""}`} onClick={()=>navegar("dashboard")}><Icon name="dashboard" className="nav-icon" /> Dashboard</button>
          <button className={`nav-item ${aba==="itens"?"active":""}`}     onClick={()=>navegar("itens")}><Icon name="package" className="nav-icon" /> Equipamentos</button>
          <button className={`nav-item ${aba==="pontos"?"active":""}`}    onClick={()=>navegar("pontos")}><Icon name="mapPin" className="nav-icon" /> Pontos</button>
          {(administrador||operador)&&<button className={`nav-item ${aba==="buscar-gerentes"?"active":""}`} onClick={()=>navegar("buscar-gerentes")}><Icon name="user" className="nav-icon" /> Buscar Gerentes</button>}
          {gerenteAtual&&<button className={`nav-item ${aba==="prestacao-gerente"?"active":""}`} onClick={()=>navegar("prestacao-gerente")}><Icon name="fileText" className="nav-icon" /> Prestação de Conta</button>}
          {(administrador||gerenteAtual)&&<button className={`nav-item ${aba==="senhas"?"active":""}`} onClick={()=>navegar("senhas")}><Icon name="shieldKey" className="nav-icon" /> Senhas</button>}
          {administrador&&<button className={`nav-item ${aba==="fechamento"?"active":""}`} onClick={()=>navegar("fechamento")}><Icon name="checkCircle" className="nav-icon" /> Fechamento</button>}
          {administrador&&<button className={`nav-item ${aba==="gestao"?"active":""}`} onClick={()=>navegar("gestao")}><Icon name="key" className="nav-icon" /> Central de Acessos</button>}
          {administrador&&<button className={`nav-item ${aba==="logins"?"active":""}`} onClick={()=>navegar("logins")}><Icon name="lock" className="nav-icon" /> Gerenciar Logins</button>}
          <button className={`nav-item ${aba==="historico"?"active":""}`} onClick={()=>navegar("historico")}>
            <Icon name="history" className="nav-icon" /> Histórico
            {historicoOperacional.length>0&&<span className="nav-badge">{historicoOperacional.length>99?"99+":historicoOperacional.length}</span>}
          </button>
        </nav>
        <div className="sidebar-footer">
          {alertasVisiveis.length>0&&(
            <button className="sidebar-alerta sidebar-alerta-btn" onClick={()=>{setAlertaEstoqueAtivo(true);navegar("itens");setAbaEquip("lista");setFiltroSt("Todos");setFiltroCatEquip("Todas");setBusca("");}}>
              ⚠️ Terminais em alerta
              <span className="sidebar-alerta-arrow">→</span>
            </button>
          )}
          <div className="sidebar-perfil">
            <span>Acesso atual</span>
            <strong>{perfilAtual.perfil}</strong>
          </div>
          <button className="btn-tema" onClick={toggleTema}>
            <span>{temaClaro?"☀️ Tema Claro":"🌙 Tema Escuro"}</span>
            <div className={`tema-toggle ${temaClaro?"ativo":""}`}/>
          </button>
          {["administrador","operador","gerente"].includes(perfilAtual.perfil)&&(
            <button className="btn-senha" onClick={baixarBackupObrigatorio}>💾 Baixar backup</button>
          )}
          <a className="btn-senha sidebar-app-download" href="/downloads/stock-on.apk" download="Stock-ON.apk">
            <Icon name="download" className="nav-icon" /> Baixar aplicativo
          </a>
          <button className="btn-senha" onClick={()=>setModalSenha(true)}>🔒 Alterar minha senha</button>
          <button className="btn-logout" onClick={()=>setConfirmLogout(true)}>🚪 Sair do sistema</button>
          <div className="sidebar-version">Stock-ON v1.0 · Supabase ☁️</div>
        </div>
      </aside>

      <main className="main">
        {perfilAtual.emailTemporario&&(
          <div className={`email-temp-banner ${prazoEmailTemporario(perfilAtual.emailTemporarioExpiraEm)==="vencido"?"email-temp-vencido":""}`}>
            <strong>Login com e-mail temporário</strong>
            <span>Este acesso precisa ser atualizado para um e-mail real pelo administrador. Prazo: {prazoEmailTemporario(perfilAtual.emailTemporarioExpiraEm)}.</span>
          </div>
        )}
        {perfilAtual.perfil==="gerente"&&(
          <section className="gerente-welcome">
            <div className={`gerente-avatar ${gerenteAvatar.classe}`}>
              <span className="gerente-avatar-aura"/>
              <span className="gerente-hero" aria-hidden="true">
                <span className="hero-cape"/>
                <span className="hero-body"/>
                <span className="hero-head">
                  <span className="hero-mask"/>
                  <span className="hero-eye hero-eye-left"/>
                  <span className="hero-eye hero-eye-right"/>
                </span>
                <span className="hero-emblem"/>
              </span>
            </div>
            <div>
              <span className="gerente-welcome-kicker">Acesso do gerente</span>
              <h2>Bem-vindo, {gerenteNomeBase}</h2>
              <p>{gerenteAvatar.titulo} · seus pontos, equipamentos e despesas estão filtrados para sua carteira.</p>
            </div>
          </section>
        )}
        {aba==="dashboard"&&(<>
          <header className="topbar">
            <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
              <button className="btn-hamburguer" onClick={()=>setSidebarAberta(!sidebarAberta)}>☰</button>
              <div><h1 className="page-title">Dashboard</h1><p className="page-sub">Visão geral do estoque</p></div>
            </div>
            <img src={temaClaro?logoLight:logo} alt="Stock-ON" className="logo-topbar"/>
          </header>
          <div className="painel-dashboard">
            <section className="dash-mensagem-compacta">
              <span>Mensagem do dia</span>
              <q>{mensagemDoDia}</q>
            </section>

            <section className="dash-indicadores">
              <button className="dash-kpi kpi-total" onClick={()=>{navegar("itens");setFiltroEscopoEquip("todos");setFiltroSt("Todos");}}><span>Cadastrados</span><strong>{totalGeral}</strong><small>equipamentos</small></button>
              <button className="dash-kpi kpi-disponivel" onClick={()=>{navegar("itens");setFiltroEscopoEquip(gerenteAtual?"todos":"interno");setFiltroSt("Disponível");}}><span>{gerenteAtual?"Disponíveis":"Estoque interno"}</span><strong>{totalDisponivel}</strong><small>{gerenteAtual?"prontos para envio":"admin/operação"}</small></button>
              <button className="dash-kpi kpi-rota" onClick={()=>{navegar("itens");setFiltroEscopoEquip(gerenteAtual?"todos":"pontos");setFiltroSt("Em rota");}}><span>Em pontos</span><strong>{totalEmRota}</strong><small>nas rotas</small></button>
              {!gerenteAtual&&<button className="dash-kpi kpi-gerentes" onClick={()=>{navegar("itens");setFiltroEscopoEquip("gerentes");setFiltroSt("Todos");}}><span>Com gerentes</span><strong>{totalComGerentes}</strong><small>estoque/transferência</small></button>}
              {!gerenteAtual&&<button className="dash-kpi kpi-conserto" onClick={()=>{navegar("itens");setFiltroEscopoEquip("conserto");setFiltroSt("Em conserto");}}><span>Conserto</span><strong>{totalConserto}</strong><small>fora de operação</small></button>}
            </section>

            <div className="dash-conteudo">
              <section className="secao dash-categorias">
                <h2 className="secao-titulo">{gerenteAtual?"Disponibilidade por Categoria":"Estoque interno por Categoria"}</h2>
                <div className="dash-lista-categorias">
                  {porCategoria.map(c=>{
                    const percentual=c.total?Math.round((c.disponivel/c.total)*100):0;
                    const mostrarAlertaCategoria=!gerenteAtual&&c.alertaBaixo;
                    return(
                      <button key={c.categoria} className={`dash-categoria ${mostrarAlertaCategoria?"em-alerta":""}`}
                        onClick={()=>{navegar("itens");setFiltroCatEquip(c.categoria);setAbaEquip("lista");}}>
                        <span className="dash-cat-icone">{ICONES[c.categoria]}</span>
                        <span className="dash-cat-info">
                          <strong>{c.categoria}</strong>
                          <span className="dash-barra"><i style={{width:`${percentual}%`}}/></span>
                        </span>
                        <span className="dash-cat-numeros"><strong>{c.disponivel}</strong> / {c.total}<small> disponíveis</small></span>
                        {mostrarAlertaCategoria&&<span className="dash-aviso">Baixo</span>}
                      </button>
                    );
                  })}
                </div>
              </section>

              <div className="dash-lateral">
                <section className={`secao dash-atencao ${alertasVisiveis.length===0?"ok":""}`}>
                  <h2 className="secao-titulo">Atenção</h2>
                  {alertasVisiveis.length===0
                    ?<p className="dash-vazio">Tudo certo: Terminais dentro do estoque mínimo.</p>
                    :alertasVisiveis.map(a=>(
                      <button key={a.categoria} className="dash-alerta" onClick={()=>{navegar("itens");setFiltroCatEquip(a.categoria);setAbaEquip("lista");}}>
                        <span>{ICONES[a.categoria]}</span>
                        <strong>{a.categoria}</strong>
                        <small>faltam {a.faltam}</small>
                      </button>
                    ))}
                </section>
                <section className="secao dash-pontos">
                  <div className="dash-titulo-acao"><h2 className="secao-titulo">Pontos Ativos</h2><button className="btn-link" onClick={()=>navegar("pontos")}>Ver todos</button></div>
                  {pontosComEquipamentos.length===0
                    ?<p className="dash-vazio">Nenhum equipamento está ligado a um ponto.</p>
                    :pontosComEquipamentos.slice(0,5).map(p=>(
                      <div key={p.id} className="dash-ponto-linha"><span>📍 {p.nomeFantasia}</span><strong>{p.totalEquipamentos}</strong></div>
                    ))}
                </section>
              </div>
            </div>

            {historicoOperacional.length>0&&(
              <section className="secao dash-historico">
                <div className="tabela-header">
                  <h2 className="secao-titulo" style={{margin:0}}>Movimentações Recentes</h2>
                  <button className="btn-link" onClick={()=>navegar("historico")}>Ver todas →</button>
                </div>
                <div className="tabela-wrapper">
                  <table className="tabela">
                    <thead><tr><th>Movimento</th><th>Equipamento</th><th>Detalhe</th><th>Data</th></tr></thead>
                    <tbody>
                      {historicoOperacional.slice(0,5).map(h=>{
                        const cfg=HIST_CFG[h.tipo]||{cor:"",icone:"•",label:h.tipo};
                        return(<tr key={h.id}>
                          <td><span className={`badge-hist ${cfg.cor}`}>{cfg.icone} {cfg.label}</span></td>
                          <td className="td-nome">{ICONES[h.categoria]} {h.itemNome}</td>
                          <td className="td-obs">{h.observacao||"—"}</td>
                          <td className="td-minimo" style={{whiteSpace:"nowrap"}}>{h.data}</td>
                        </tr>);
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="dash-historico-mobile-lista">
                  {historicoOperacional.slice(0,5).map(h=>{
                    const cfg=HIST_CFG[h.tipo]||{cor:"",icone:"•",label:h.tipo};
                    return(
                      <article className="historico-mobile-card dash-historico-mobile-card" key={`dash-mobile-${h.id}`}>
                        <div className="historico-mobile-topo">
                          <span className={`badge-hist ${cfg.cor}`}>{cfg.icone} {cfg.label}</span>
                          <small>{h.data}</small>
                        </div>
                        <strong>{ICONES[h.categoria]} {h.itemNome}</strong>
                        <div className="historico-mobile-meta">
                          <span>{h.categoria}</span>
                          <span>Antes: {h.qtdAntes}</span>
                          <span>Depois: {h.qtdDepois}</span>
                        </div>
                        <HistoricoDetalhes texto={h.observacao}/>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        </>)}

        {aba==="itens"&&(<>
          <header className="topbar">
            <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
              <button className="btn-hamburguer" onClick={()=>setSidebarAberta(!sidebarAberta)}>☰</button>
              <div><h1 className="page-title">Equipamentos</h1><p className="page-sub">Cadastro e movimentações</p></div>
            </div>
            <div style={{display:"flex",gap:"8px"}}>
              <button className="btn-secundario" onClick={()=>exportarEquipamentosExcel(itensOperacionais)}>📊 Excel</button>
              <button className="btn-secundario" onClick={()=>exportarEquipamentosPDF(itensOperacionais)}>📄 PDF</button>
              {podeCadastrarEquipamento&&<button className="btn-primario" onClick={abrirNovo}>+ Novo</button>}
            </div>
          </header>
          <div className="equip-navegacao">
            <span className="equip-filtro-label">Visualizar</span>
            <div className="points-abas equip-abas">
            {ABAS_EQUIP.map(a=>(
              <button key={a.id} className={`points-aba-btn ${abaEquip===a.id?"points-aba-ativa":""}`} onClick={()=>setAbaEquip(a.id)}>{a.label}</button>
            ))}
            </div>
            {!gerenteAtual&&(<>
              <span className="equip-filtro-label">Escopo</span>
              <div className="equip-categorias equip-escopos">
                {[
                  ["todos","Todos"],
                  ["interno","Estoque interno"],
                  ["pontos","Em pontos"],
                  ["gerentes","Com gerentes"],
                  ["conserto","Conserto"],
                ].map(([id,label])=>(
                  <button key={id} className={`points-aba-btn ${filtroEscopoEquip===id?"points-aba-ativa":""}`} onClick={()=>{setFiltroEscopoEquip(id);setAbaEquip("lista");}}>
                    {label}
                  </button>
                ))}
              </div>
              <span className="equip-filtro-label">Categoria</span>
              <div className="equip-categorias">
                {["Todas",...CATEGORIAS].map(cat=>(
                  <button key={cat} className={`points-aba-btn ${filtroCatEquip===cat?"points-aba-ativa":""}`}
                    onClick={()=>{setFiltroCatEquip(cat);setAbaEquip("lista");}}>
                    {cat==="Todas"?"Todas":ICONES[cat]+" "+cat}
                  </button>
                ))}
              </div>
            </>)}
          </div>

          {alertaEstoqueAtivo&&alertasVisiveis.length>0&&(
            <div className="alerta-estoque-banner">
              <div className="alerta-banner-header">
                <div className="alerta-banner-titulo">
                  <span className="alerta-banner-emoji">🚨</span>
                  <strong>Terminais com estoque abaixo do mínimo!</strong>
                  <span className="alerta-banner-pulse"/>
                </div>
                <button className="alerta-banner-fechar" onClick={()=>setAlertaEstoqueAtivo(false)}>✕</button>
              </div>
              <div className="alerta-banner-itens">
                {alertasVisiveis.map(a=>(
                  <div key={a.categoria} className="alerta-banner-item">
                    <span className="alerta-banner-icone">{ICONES[a.categoria]}</span>
                    <div className="alerta-banner-info">
                      <span className="alerta-banner-nome">{a.categoria}</span>
                      <span className="alerta-banner-detalhe">
                        Disponível: <strong style={{color:"var(--vermelho)"}}>{a.totalDisponivel}</strong>
                        &nbsp;·&nbsp;Mínimo: <strong>{MINIMO_CATEGORIA}</strong>
                        &nbsp;·&nbsp;Faltam: <strong style={{color:"var(--vermelho)"}}>{a.faltam}</strong> un.
                      </span>
                    </div>
                    <div className="alerta-banner-acoes">
                      <button className="btn-alerta-editar" onClick={()=>{setFiltroCatEquip(a.categoria);setAbaEquip("lista");setAlertaEstoqueAtivo(false);}}>🔍 Ver categoria</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {abaEquip==="lista"&&(
            <section className="secao equip-lista">
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
                          <strong>{ICONES[item.categoria]} {item.patrimonio||item.nome}</strong>
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
                  ⚠️ {inconsistencias.length} equipamento{inconsistencias.length!==1?"s":""} com cadastro inconsistente. Preencha {exigirPatrimonioEquipamento?"nome e código/patrimônio":"nome"} antes de novas movimentações:
                  <strong>{inconsistencias.map(i=>i.patrimonio||i.nome).join(", ")}</strong>
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
                        <strong>{item.patrimonio||item.nome}</strong>
                        <span>{formatarMoedaPDF(item.consertoValor||0)} · {item.consertoFormaPagamento||"Forma não informada"}</span>
                        {item.consertoAssistencia&&<small>Assistência: {item.consertoAssistencia}</small>}
                        <em>Confirmar pagamento</em>
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
                        <strong>{item.patrimonio||item.nome}</strong>
                        <span>{item.gerenteResponsavel?`Enviado por ${item.gerenteResponsavel}`:"Enviado para operação"}</span>
                        {item.consertoDefeito&&<small>Defeito: {item.consertoDefeito}</small>}
                      </button>
                    ))}
                  </div>
                </section>
              )}
              <div className="tabela-header">
                <div className="equip-titulo">
                  <h2>Equipamentos cadastrados</h2>
                  <p>{itensFiltrados.length} resultado{itensFiltrados.length!==1?"s":""} encontrado{itensFiltrados.length!==1?"s":""}</p>
                </div>
                <div className="filtros equip-filtros">
                  <input className="input-busca" type="text" placeholder="Buscar nome, código, ponto ou gerente..." value={busca} onChange={e=>setBusca(e.target.value)}/>
                  <select className="select-filtro" value={filtroSt} onChange={e=>setFiltroSt(e.target.value)}>
                    <option value="Todos">Todos os status</option>
                    {statusListaVisivel.map(s=><option key={s}>{s}</option>)}
                  </select>
                  {(filtroCatEquip!=="Todas"||filtroSt!=="Todos"||filtroEscopoEquip!=="todos"||busca)&&(
                    <button className="btn-limpar" onClick={()=>{setFiltroCatEquip("Todas");setFiltroSt("Todos");setFiltroEscopoEquip("todos");setBusca("");}}>✕ Limpar</button>
                  )}
                </div>
              </div>
              <div className="tabela-wrapper equip-tabela">
                <table className="tabela tabela-equipamentos">
                  <thead><tr><th>Patrimônio</th><th>Equipamento</th><th>Categoria</th><th>Status</th><th>Ponto / Gerente</th><th>Movimentar</th><th>⚙️</th></tr></thead>
                  <tbody>
                    {itensFiltrados.length===0?<tr><td colSpan={7} className="tabela-vazia">Nenhum item encontrado.</td></tr>
                    :itensPagina.map(item=>{
                      const totalCat=itens.filter(i=>i.categoria===item.categoria&&i.status==="Disponível").length;
                      const emAlerta=item.categoria===CATEGORIA_COM_ALERTA&&totalCat<MINIMO_CATEGORIA;
                      const pendente=item.transferenciaStatus===TRANSFERENCIA_GERENTE.aguardando;
                      const recebido=item.transferenciaStatus===TRANSFERENCIA_GERENTE.recebido&&item.gerenteResponsavel&&!item.localizacao;
                      const emConserto=item.status==="Em conserto";
                      const pagamentoConserto=statusPagamentoConserto(item);
                      return(
                        <tr key={item.id} className={[emAlerta?"row-alerta":"",emConserto?"row-conserto":""].filter(Boolean).join(" ")}>
                          <td className="td-minimo">{item.patrimonio||"—"}</td>
                          <td className="td-nome">{ICONES[item.categoria]} {item.nome}</td>
                          <td><span className="badge-cat">{item.categoria}</span></td>
                          <td>
                            <span className={`badge-status ${STATUS_CFG[item.status]?.cor||""}`}>{item.status}</span>
                            {emConserto&&<span className="badge-conserto-operacao">Aguardando operador/admin</span>}
                            {pendente&&<span className="badge-transferencia">Aguardando confirmação</span>}
                            {recebido&&<span className="badge-transferencia badge-transferencia-ok">Estoque do gerente</span>}
                          </td>
                          <td><LocalizacaoGerenteCell item={item}/></td>
                          <td>
                            {operador&&emConserto?<button className="btn-movimentar btn-conserto-operador" disabled={pagamentoConserto==="solicitado"} title={pagamentoConserto==="solicitado"?"Aguardando pagamento do admin":""} onClick={()=>abrirConsertoOperador(item)}>🔧 {pagamentoConserto==="pago"?"Concluir":"Completar"}</button>:
                              pendente&&gerenteAtual?<button className="btn-movimentar" onClick={()=>confirmarRecebimento(item)}>✅ Confirmar</button>:
                              podeMovimentarEquipamento(item)?<button className="btn-movimentar" onClick={()=>abrirMov(item)}>📦 Movimentar</button>:<span className="td-obs">Consulta</span>}
                          </td>
                          <td className="td-acoes">
                            <button className="btn-editar" onClick={()=>setItemDetalhe(item)} title="Ficha">🔎</button>
                            {podeMovimentarEquipamento(item)&&<button className="btn-editar" onClick={()=>abrirEditar(item)}>✏️</button>}
                            {podeEditar&&<button className="btn-excluir" onClick={()=>setExcluindo(item.id)}>🗑️</button>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="equip-cards">
                {itensFiltrados.length===0?<div className="tabela-vazia">Nenhum item encontrado.</div>
                :itensPagina.map(item=>(
                  <article className={`equip-card ${item.status==="Em conserto"?"equip-card-conserto":""}`} key={item.id}>
                    <div className="equip-card-topo">
                      <div><span className="equip-codigo">{item.patrimonio||"—"}</span><h3>{ICONES[item.categoria]} {item.nome}</h3></div>
                      <span className={`badge-status ${STATUS_CFG[item.status]?.cor||""}`}>{item.status}</span>
                    </div>
                    {item.status==="Em conserto"&&<span className="badge-conserto-operacao">Aguardando operador/admin</span>}
                    {item.status==="Em conserto"&&item.consertoDefeito&&<p className="equip-card-defeito">Defeito: {item.consertoDefeito}</p>}
                    {item.transferenciaStatus===TRANSFERENCIA_GERENTE.aguardando&&<span className="badge-transferencia">Aguardando confirmação</span>}
                    {item.transferenciaStatus===TRANSFERENCIA_GERENTE.recebido&&item.gerenteResponsavel&&!item.localizacao&&<span className="badge-transferencia badge-transferencia-ok">Estoque do gerente</span>}
                    <div className="equip-card-meta">
                      <span className="badge-cat">{item.categoria}</span>
                      <span>📍 {textoLocalizacaoEquipamento(item)}</span>
                      {item.gerenteResponsavel&&<span>👤 {item.gerenteResponsavel}</span>}
                    </div>
                    <div className="equip-card-acoes">
                      {operador&&item.status==="Em conserto"?<button className="btn-movimentar btn-conserto-operador" disabled={statusPagamentoConserto(item)==="solicitado"} title={statusPagamentoConserto(item)==="solicitado"?"Aguardando pagamento do admin":""} onClick={()=>abrirConsertoOperador(item)}>🔧 {statusPagamentoConserto(item)==="pago"?"Concluir conserto":"Completar conserto"}</button>:
                        item.transferenciaStatus===TRANSFERENCIA_GERENTE.aguardando&&gerenteAtual?<button className="btn-movimentar" onClick={()=>confirmarRecebimento(item)}>✅ Confirmar recebido</button>:podeMovimentarEquipamento(item)&&<button className="btn-movimentar" onClick={()=>abrirMov(item)}>📦 Movimentar</button>}
                      <button className="btn-editar" onClick={()=>setItemDetalhe(item)} title="Ficha">🔎 Ficha</button>
                      {podeMovimentarEquipamento(item)&&<button className="btn-editar" onClick={()=>abrirEditar(item)} title="Editar">✏️ Editar</button>}
                      {podeEditar&&<button className="btn-excluir" onClick={()=>setExcluindo(item.id)} title="Excluir">🗑️</button>}
                    </div>
                  </article>
                ))}
              </div>
              {itensFiltrados.length>ITENS_POR_PAGINA&&(
                <div className="paginacao">
                  <button className="btn-secundario" disabled={paginaItens===1} onClick={()=>setPaginaItens(p=>p-1)}>Anterior</button>
                  <span>Página <strong>{paginaItens}</strong> de <strong>{totalPaginasItens}</strong> · {itensFiltrados.length} itens</span>
                  <button className="btn-secundario" disabled={paginaItens===totalPaginasItens} onClick={()=>setPaginaItens(p=>p+1)}>Próxima</button>
                </div>
              )}
            </section>
          )}

          {abaEquip==="resumo"&&(
            <div style={{display:"flex",flexDirection:"column",gap:"20px"}}>
              <section className="secao">
                <h2 className="secao-titulo">Resumo Geral</h2>
                <div className="resumo-grid">
                  <div className="resumo-card resumo-total"><div className="resumo-num">{totalGeral}</div><div className="resumo-label">Equipamentos</div></div>
                  <div className="resumo-card resumo-disponivel"><div className="resumo-num">{totalDisponivel}</div><div className="resumo-label">Disponíveis</div></div>
                  <div className="resumo-card resumo-uso"><div className="resumo-num">{totalEmRota}</div><div className="resumo-label">Em Rota</div></div>
                  {!gerenteAtual&&<div className="resumo-card resumo-conserto"><div className="resumo-num">{totalConserto}</div><div className="resumo-label">Em Conserto</div></div>}
                  <div className={`resumo-card ${alertasVisiveis.length>0?"resumo-alerta-ativo":""}`}><div className="resumo-num">{alertasVisiveis.length}</div><div className="resumo-label">Alertas</div></div>
                </div>
              </section>
              <section className="secao">
                <h2 className="secao-titulo">Por Categoria</h2>
                <div className="cat-detalhe-grid">
                  {porCategoria.map(c=>(
                    <div key={c.categoria} className={`cat-detalhe-card ${c.alertaBaixo?"cat-detalhe-alerta":""}`}
                      onClick={()=>{setFiltroCatEquip(c.categoria);setAbaEquip("lista");}}>
                      <div className="cat-detalhe-header">
                        <span className="cat-detalhe-icone">{ICONES[c.categoria]}</span>
                        <div style={{flex:1,minWidth:0}}>
                          <div className="cat-detalhe-nome">{c.categoria}</div>
                          <div className="cat-detalhe-registros">{c.qtdItens} registro{c.qtdItens!==1?"s":""}</div>
                          {!gerenteAtual&&c.alertaBaixo&&<div className="cat-detalhe-badge-alerta">⚠ Estoque Baixo</div>}
                        </div>
                        <div className="cat-detalhe-total">
                          <span className="cat-total-num">{c.total}</span>
                          <span className="cat-total-label">equipamentos</span>
                        </div>
                      </div>
                      <div className="cat-detalhe-status">
                        {c.disponivel>0&&<div className="cat-st-linha cat-st-disp"><span>✅ Disponível</span><strong>{c.disponivel}</strong></div>}
                        {c.emRota>0&&   <div className="cat-st-linha cat-st-uso"> <span>📍 Em rota</span>   <strong>{c.emRota}</strong></div>}
                        {!gerenteAtual&&c.conserto>0&& <div className="cat-st-linha cat-st-con"> <span>🔧 Conserto</span>  <strong>{c.conserto}</strong></div>}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {abaEquip==="historico"&&(
            <section className="secao">
              <div className="tabela-header">
                <h2 className="secao-titulo" style={{margin:0}}>Histórico de Equipamentos</h2>
                <div style={{display:"flex",gap:"8px"}}>
                  <button className="btn-secundario" onClick={()=>exportarHistoricoExcel(historicoOperacional)}>📊 Excel</button>
                  <button className="btn-secundario" onClick={()=>exportarHistoricoPDF(historicoOperacional)}>📄 PDF</button>
                </div>
              </div>
              {historicoOperacional.length===0
                ?<div className="hist-vazio"><div className="hist-vazio-icone">📋</div><div>Nenhuma movimentação registrada.</div></div>
                :<>
                  <div className="historico-mobile-lista historico-equip-mobile-lista">
                    {historicoOperacional.map(h=>{
                      const cfg=HIST_CFG[h.tipo]||{cor:"",icone:"•",label:h.tipo};
                      return(
                        <article className="historico-mobile-card" key={`equip-hist-mobile-${h.id}`}>
                          <div className="historico-mobile-topo">
                            <span className={`badge-hist ${cfg.cor}`}>{cfg.icone} {cfg.label}</span>
                            <small>{h.data}</small>
                          </div>
                          <strong>{ICONES[h.categoria]} {h.itemNome}</strong>
                          <div className="historico-mobile-meta">
                            <span>{h.categoria}</span>
                            <span>Antes: {h.qtdAntes}</span>
                            <span>Depois: {h.qtdDepois}</span>
                          </div>
                          <HistoricoDetalhes texto={h.observacao}/>
                        </article>
                      );
                    })}
                  </div>
                  <div className="tabela-wrapper historico-equip-desktop-tabela">
                    <table className="tabela">
                      <thead><tr><th>Tipo</th><th>Equipamento</th><th>Categoria</th><th>Antes</th><th>Depois</th><th>Observação</th><th>Data</th></tr></thead>
                      <tbody>
                        {historicoOperacional.map(h=>{
                          const cfg=HIST_CFG[h.tipo]||{cor:"",icone:"•",label:h.tipo};
                          return(<tr key={h.id}>
                            <td><span className={`badge-hist ${cfg.cor}`}>{cfg.icone} {cfg.label}</span></td>
                            <td className="td-nome">{ICONES[h.categoria]} {h.itemNome}</td>
                            <td><span className="badge-cat">{h.categoria}</span></td>
                            <td className="td-minimo">{h.qtdAntes}</td>
                            <td className="td-minimo">{h.qtdDepois}</td>
                            <td className="td-obs" style={{maxWidth:"200px"}}>{h.observacao}</td>
                            <td className="td-minimo" style={{whiteSpace:"nowrap"}}>{h.data}</td>
                          </tr>);
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              }
            </section>
          )}
        </>)}

        {aba==="pontos"&&(
          <>
          <header className="topbar">
              <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
                <button className="btn-hamburguer" onClick={()=>setSidebarAberta(!sidebarAberta)}>☰</button>
                <div><h1 className="page-title">Pontos</h1><p className="page-sub">Gerenciamento de pontos</p></div>
              </div>
            </header>
          <PointsPage equipamentos={itensOperacionais} podeEditar={podeEditar} perfilAtual={perfilAtual} onPontosChange={setPontos} onEquipamentosChange={setItens} onHistoricoChange={setHistoricoPontos}/>
          </>
        )}

        {aba==="buscar-gerentes"&&(administrador||operador)&&(<>
          <header className="topbar">
            <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
              <button className="btn-hamburguer" onClick={()=>setSidebarAberta(!sidebarAberta)}>â˜°</button>
              <div><h1 className="page-title">Buscar Gerentes</h1><p className="page-sub">Pontos, equipamentos e pendÃªncias por responsÃ¡vel</p></div>
            </div>
          </header>
          <div className="consulta-gerentes-page">
            <section className="consulta-gerentes-hero">
              <div>
                <span className="gestao-kicker">Consulta operacional</span>
                <h2>Pesquisar tudo sobre um gerente</h2>
                <p>Selecione um gerente para visualizar pontos, equipamentos nos pontos, estoque sob responsabilidade dele e consertos vinculados.</p>
              </div>
              <label className="consulta-gerentes-select">
                <span>Gerente</span>
                <select value={gerenteConsultaAtivo} onChange={e=>setGerenteConsulta(e.target.value)}>
                  {gerentesOperacionais.length===0&&<option value="">Nenhum gerente encontrado</option>}
                  {gerentesOperacionais.map(g=><option key={g} value={g}>{g}</option>)}
                </select>
              </label>
            </section>

            <section className="consulta-gerentes-resumo">
              <div className="consulta-kpi"><span>Pontos</span><strong>{pontosDoGerenteConsulta.length}</strong><small>vinculados</small></div>
              <div className="consulta-kpi"><span>Equipamentos</span><strong>{equipamentosDoGerenteConsulta.length}</strong><small>total localizado</small></div>
              <div className="consulta-kpi"><span>Nos pontos</span><strong>{equipamentosConsultaEmPontos.length}</strong><small>em operaÃ§Ã£o</small></div>
              <div className="consulta-kpi"><span>Com gerente</span><strong>{equipamentosConsultaSemPonto.length}</strong><small>sem ponto</small></div>
              <div className="consulta-kpi consulta-kpi-alerta"><span>Conserto</span><strong>{equipamentosConsultaConserto.length}</strong><small>fora de operaÃ§Ã£o</small></div>
            </section>

            <div className="consulta-gerentes-grid">
              <section className="secao consulta-gerentes-card">
                <div className="tabela-header">
                  <h2 className="secao-titulo" style={{margin:0}}>Pontos do gerente</h2>
                  <span className="consulta-contador">{pontosDoGerenteConsulta.length}</span>
                </div>
                <div className="consulta-lista">
                  {pontosDoGerenteConsulta.length===0?<div className="tabela-vazia">Nenhum ponto encontrado para este gerente.</div>:
                    ordenarPontos(pontosDoGerenteConsulta).map(ponto=>{
                      const qtd=itens.filter(i=>normalizarTexto(i.localizacao)===normalizarTexto(ponto.nomeFantasia)).length;
                      return(
                        <article key={ponto.id} className="consulta-ponto-item">
                          <div>
                            <strong>{ponto.nomeFantasia}</strong>
                            <span>{ponto.gerente||"Rota nÃ£o informada"} Â· {ponto.telefone||"sem telefone"}</span>
                          </div>
                          <em>{qtd} equip.</em>
                        </article>
                      );
                    })
                  }
                </div>
              </section>

              <section className="secao consulta-gerentes-card consulta-equipamentos-card">
                <div className="tabela-header">
                  <h2 className="secao-titulo" style={{margin:0}}>Equipamentos localizados</h2>
                  <span className="consulta-contador">{equipamentosDoGerenteConsulta.length}</span>
                </div>
                <div className="consulta-equipamentos-lista">
                  {equipamentosDoGerenteConsulta.length===0?<div className="tabela-vazia">Nenhum equipamento localizado para este gerente.</div>:
                    ordenarEquipamentos(equipamentosDoGerenteConsulta).map(item=>(
                      <article key={item.id} className={`consulta-equipamento-item ${item.status==="Em conserto"?"em-conserto":""}`}>
                        <div className="consulta-equipamento-main">
                          <span className="consulta-patrimonio">{item.patrimonio||"Sem cÃ³digo"}</span>
                          <strong>{ICONES[item.categoria]} {item.nome}</strong>
                          <small>{textoLocalizacaoEquipamento(item)}</small>
                        </div>
                        <div className="consulta-equipamento-meta">
                          <span className="badge-cat">{item.categoria}</span>
                          <span className={`badge-status ${STATUS_CFG[item.status]?.cor||""}`}>{item.status}</span>
                          {item.gerenteResponsavel&&<span className="badge-transferencia badge-transferencia-ok">{item.gerenteResponsavel}</span>}
                        </div>
                        <button className="btn-editar" onClick={()=>setItemDetalhe(item)}>Ficha</button>
                      </article>
                    ))
                  }
                </div>
              </section>
            </div>
          </div>
        </>)}

        {aba==="senhas"&&(administrador||gerenteAtual)&&(<>
          <header className="topbar">
            <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
              <button className="btn-hamburguer" onClick={()=>setSidebarAberta(!sidebarAberta)}>☰</button>
              <div><h1 className="page-title">Senhas</h1><p className="page-sub">Logins das modalidades e downloads dos apps</p></div>
            </div>
          </header>
          <SenhasModalidadesPage
            perfilAtual={perfilAtual}
            acessos={senhasModalidades}
            apps={modalidadeApps}
            onAcessosChange={setSenhasModalidades}
            onAppsChange={setModalidadeApps}
          />
        </>)}

        {aba==="prestacao-gerente"&&gerenteAtual&&(<>
          <header className="topbar topbar-prestacao-gerente">
            <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
              <button className="btn-hamburguer" onClick={()=>setSidebarAberta(!sidebarAberta)}>☰</button>
              <div><h1 className="page-title">Prestação de Conta</h1><p className="page-sub">PDF, PIX e conferência enviados pela administração</p></div>
            </div>
          </header>
          <PrestacaoGerentePage
            gerenteAtual={gerenteAtual}
            pontos={pontosOperacionais}
            itens={itensOperacionais}
            despesas={despesasOperacionais}
            pixEnvios={pixEnvios}
            onCopiarPix={copiarPixAviso}
          />
        </>)}

        {aba==="fechamento"&&administrador&&(<>
          <header className="topbar">
            <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
              <button className="btn-hamburguer" onClick={()=>setSidebarAberta(!sidebarAberta)}>☰</button>
              <div><h1 className="page-title">Fechamento</h1><p className="page-sub">Rotas, gerentes e conferência operacional</p></div>
            </div>
          </header>
          <FechamentoPage
            pontos={pontos}
            itens={itens}
            despesas={despesasBackup}
            pixEnvios={pixEnvios}
            onPixEnviosChange={setPixEnvios}
          />
        </>)}

        {aba==="gestao"&&administrador&&(<>
          <header className="topbar">
            <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
              <button className="btn-hamburguer" onClick={()=>setSidebarAberta(!sidebarAberta)}>☰</button>
              <div><h1 className="page-title">Central de Acessos</h1><p className="page-sub">Usuários, permissões e redefinição de login</p></div>
            </div>
          </header>
          <ManagementPage perfilAtual={perfilAtual} onPerfilAtualChange={setPerfilAtual}/>
        </>)}

        {aba==="logins"&&(<>
          <header className="topbar">
            <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
              <button className="btn-hamburguer" onClick={()=>setSidebarAberta(!sidebarAberta)}>☰</button>
              <div><h1 className="page-title">Gerenciar Logins</h1><p className="page-sub">Área exclusiva do administrador</p></div>
            </div>
          </header>
          <LoginManagerPage perfilAtual={perfilAtual} historico={historicoOperacional} historicoPontos={historicoPontosOperacional} onPerfilAtualChange={setPerfilAtual}/>
        </>)}

        {aba==="historico"&&(<>
          <header className="topbar">
            <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
              <button className="btn-hamburguer" onClick={()=>setSidebarAberta(!sidebarAberta)}>☰</button>
              <div><h1 className="page-title">Histórico</h1><p className="page-sub">{historicoOperacional.length} movimentação{historicoOperacional.length!==1?"ões":""} registrada{historicoOperacional.length!==1?"s":""}</p></div>
            </div>
            <div style={{display:"flex",gap:"8px"}}>
              {historicoOperacional.length>0&&<>
                <button className="btn-secundario" onClick={()=>exportarHistoricoExcel(historicoOperacional)}>📊 Excel</button>
                <button className="btn-secundario" onClick={()=>exportarHistoricoPDF(historicoOperacional)}>📄 PDF</button>
              </>}
              {administrador&&historico.length>0&&<button className="btn-danger-outline" onClick={limparHistorico}>🗑️ Limpar</button>}
            </div>
          </header>
          <section className="secao">
            <div className="tabela-header">
              <div className="filtros">
                <input className="input-busca" type="text" placeholder="🔍 Equipamento..." value={histBusca} onChange={e=>setHistBusca(e.target.value)}/>
                <select className="select-filtro" value={histFCat} onChange={e=>setHistFCat(e.target.value)}>
                  <option value="Todas">Todas as categorias</option>
                  {CATEGORIAS.map(c=><option key={c}>{c}</option>)}
                </select>
                <select className="select-filtro" value={histFTipo} onChange={e=>setHistFTipo(e.target.value)}>
                  <option value="Todos">Todos os tipos</option>
                  {Object.entries(HIST_CFG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                </select>
                {(histFCat!=="Todas"||histFTipo!=="Todos"||histBusca)&&(
                  <button className="btn-limpar" onClick={()=>{setHistFCat("Todas");setHistFTipo("Todos");setHistBusca("");}}>✕ Limpar</button>
                )}
              </div>
            </div>
            {histFiltrado.length===0
              ?<div className="hist-vazio"><div className="hist-vazio-icone">📋</div><div>Nenhuma movimentação encontrada.</div></div>
              :<>
                <div className="historico-mobile-lista">
                  {histFiltrado.map(h=>{
                    const cfg=HIST_CFG[h.tipo]||{cor:"",icone:"•",label:h.tipo};
                    return(
                      <article className="historico-mobile-card" key={`mobile-${h.id}`}>
                        <div className="historico-mobile-topo">
                          <span className={`badge-hist ${cfg.cor}`}>{cfg.icone} {cfg.label}</span>
                          <small>{h.data}</small>
                        </div>
                        <strong>{ICONES[h.categoria]} {h.itemNome}</strong>
                        <div className="historico-mobile-meta">
                          <span>{h.categoria}</span>
                          <span>Antes: {h.qtdAntes}</span>
                          <span>Depois: {h.qtdDepois}</span>
                        </div>
                        <HistoricoDetalhes texto={h.observacao}/>
                      </article>
                    );
                  })}
                </div>
                <div className="tabela-wrapper historico-desktop-tabela">
                  <table className="tabela">
                    <thead><tr><th>Tipo</th><th>Equipamento</th><th>Categoria</th><th>Antes</th><th>Depois</th><th>Observação</th><th>Data</th></tr></thead>
                    <tbody>
                      {histFiltrado.map(h=>{
                        const cfg=HIST_CFG[h.tipo]||{cor:"",icone:"•",label:h.tipo};
                        return(<tr key={h.id}>
                          <td><span className={`badge-hist ${cfg.cor}`}>{cfg.icone} {cfg.label}</span></td>
                          <td className="td-nome">{ICONES[h.categoria]} {h.itemNome}</td>
                          <td><span className="badge-cat">{h.categoria}</span></td>
                          <td className="td-minimo">{h.qtdAntes}</td>
                          <td className="td-minimo">{h.qtdDepois}</td>
                          <td className="td-obs" style={{maxWidth:"200px"}}>{h.observacao}</td>
                          <td className="td-minimo" style={{whiteSpace:"nowrap"}}>{h.data}</td>
                        </tr>);
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            }
          </section>
        </>)}
      </main>

      {modalForm&&(
        <div className="modal-overlay">
          <div className="modal modal-largo" onClick={e=>e.stopPropagation()}>
            <div className="modal-header"><h3>{itemEdit?"Editar Equipamento":"Novo Equipamento"}</h3><button className="modal-fechar" onClick={fecharForm}>✕</button></div>
            <div className="modal-body">
              {erroForm&&<div className="erro-msg">⚠️ {erroForm}</div>}
              <div className="campos-duplos">
                <div className="campo"><label>Nome do Equipamento *</label>
                  <input type="text" placeholder='Ex: TV HQ 32 BALCÃO' value={form.nome} onChange={e=>setForm({...form,nome:e.target.value.toUpperCase()})}/>
                  <span className="campo-hint">Obrigatório. Será salvo em CAIXA ALTA para manter o padrão.</span></div>
                {exigirPatrimonioEquipamento&&(
                  <div className="campo"><label>Código / Patrimônio *</label>
                    <input type="text" placeholder="Ex: TV-SALA-001" value={form.patrimonio} onChange={e=>setForm({...form,patrimonio:e.target.value.toUpperCase()})}/>
                    <span className="campo-hint">Campo exclusivo da administração. O sistema bloqueia duplicados.</span></div>
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
                    {statusListaVisivel.map(s=><option key={s}>{s}</option>)}
                  </select></div>
              </div>
              {form.status==="Em rota"&&(
                <div className="campo ponto-destino-form">
                  <label>Ponto onde ficará o equipamento *</label>
                  <div className="ponto-destino-linha">
                    <select value={form.localizacao} onChange={e=>setForm({...form,localizacao:e.target.value})}>
                      <option value="">Selecione um ponto...</option>
                      {pontosOperacionais.map(p=><option key={p.id} value={p.nomeFantasia}>{p.nomeFantasia}</option>)}
                    </select>
                    <button type="button" className="btn-secundario" onClick={()=>setModalPontoRapido(true)}>+ Criar ponto agora</button>
                  </div>
                  <span className="campo-hint">Ao salvar, o equipamento já ficará vinculado ao ponto escolhido.</span>
                </div>
              )}
              {(administrador||operador)&&(
                <div className="campo-info-minimo">🔒 Alerta operacional somente para <strong>Terminais com menos de 5 disponíveis</strong></div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-secundario" onClick={fecharForm}>Cancelar</button>
              <button className="btn-primario" onClick={salvarItem}>{itemEdit?"Salvar Alterações":"Adicionar"}</button>
            </div>
          </div>
        </div>
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
        <div className="modal-overlay" onClick={fecharMov}>
          <div className="modal modal-largo" onClick={e=>e.stopPropagation()}>
            <div className="modal-header"><h3>📍 Movimentar Equipamento</h3><button className="modal-fechar" onClick={fecharMov}>✕</button></div>
            <div className="modal-body">
              <div className="mov-item-info">
                <div className="mov-item-nome">{ICONES[modalMov.categoria]} {modalMov.nome}</div>
                <div className="mov-item-meta">
                  <span className="badge-cat">{modalMov.categoria}</span>
                  <span className={`badge-status ${STATUS_CFG[modalMov.status]?.cor||""}`}>{modalMov.status}</span>
                  <span className="mov-item-qtd">Local atual: <strong>{modalMov.localizacao||"Sem ponto"}</strong></span>
                  {modalMov.patrimonio&&<span className="mov-item-pat">{modalMov.patrimonio}</span>}
                </div>
              </div>
              {erroMov&&<div className="erro-msg">⚠️ {erroMov}</div>}
              <div className="campo">
                <label>Tipo de Movimentação *</label>
                <div className="tipos-mov-grid">
                  {TIPOS_MOV.filter(t=>podeEditar||t.id!=="gerente").map(t=>(
                    <button key={t.id} className={`tipo-mov-btn ${mov.tipoId===t.id?"tipo-mov-ativo":""}`} onClick={()=>setMov({...mov,tipoId:t.id})}>
                      <span className="tipo-mov-icone">{t.icone}</span>
                      <span className="tipo-mov-label">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              {tipoMovSel?.exigePonto&&(
                <div className="campo">
                  <label>Ponto de destino *</label>
                  <select value={mov.ponto} onChange={e=>setMov({...mov,ponto:e.target.value})}>
                    <option value="">Selecione um ponto...</option>
                    {pontosOperacionais.map(p=><option key={p.id} value={p.nomeFantasia}>{p.nomeFantasia}</option>)}
                  </select>
                  {pontosOperacionais.length===0&&<span className="campo-hint">Cadastre um ponto antes de enviar o equipamento.</span>}
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
                    {gerenteAtual&&<span className="campo-hint">Este envio comunica a administração para o operador buscar o equipamento. O operador registra nota fiscal, forma de pagamento, valor e PIX quando receber.</span>}
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
                        <p>{perfilAtual.perfil==="operador"?"Obrigatório para operador antes de enviar o equipamento.":"Somente o operador registra nota, PIX e valor do conserto."}</p>
                      </div>
                      <div className="campos-duplos">
                        <div className="campo">
                          <label>Foto da nota fiscal {perfilAtual.perfil==="operador"?"*":""}</label>
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
              <div className="mov-status-resultado">Novo status: <span className={`badge-status ${STATUS_CFG[tipoMovSel.novoStatus]?.cor||""}`}>{tipoMovSel.novoStatus}</span></div>
              <div className="campos-duplos">
                <div className="campo"><label>Responsável</label><input type="text" placeholder="Ex: Carlos" value={mov.responsavel} onChange={e=>setMov({...mov,responsavel:e.target.value})}/></div>
                <div className="campo"><label>Observação</label><input type="text" placeholder="Motivo..." value={mov.observacao} onChange={e=>setMov({...mov,observacao:e.target.value})}/></div>
              </div>
            </div>
            <div className="modal-footer"><button className="btn-secundario" onClick={fecharMov}>Cancelar</button><button className="btn-primario" onClick={confirmarMov}>Confirmar</button></div>
          </div>
        </div>
      )}

      {excluindo&&(
        <div className="modal-overlay" onClick={()=>setExcluindo(null)}>
          <div className="modal modal-pequeno" onClick={e=>e.stopPropagation()}>
            <div className="modal-header"><h3>Confirmar Exclusão</h3><button className="modal-fechar" onClick={()=>setExcluindo(null)}>✕</button></div>
            <div className="modal-body"><p style={{color:"#94a3b8",lineHeight:"1.6"}}>Tem certeza que deseja excluir este equipamento?</p></div>
            <div className="modal-footer"><button className="btn-secundario" onClick={()=>setExcluindo(null)}>Cancelar</button><button className="btn-danger" onClick={()=>excluir(excluindo)}>Excluir</button></div>
          </div>
        </div>
      )}

      {itemDetalhe&&(
        <FichaEquipamento
          item={itemDetalhe}
          historico={historico}
          onFechar={()=>setItemDetalhe(null)}
          onEditar={abrirEditar}
          onMovimentar={abrirMov}
          onCompletarConserto={abrirConsertoOperador}
          onConfirmarPagamento={confirmarPagamentoConserto}
          podeEditar={podeMovimentarEquipamento(itemDetalhe)}
          perfilAtual={perfilAtual}
        />
      )}

      {confirmLogout&&(
        <div className="modal-overlay" onClick={()=>setConfirmLogout(false)}>
          <div className="modal modal-pequeno" onClick={e=>e.stopPropagation()}>
            <div className="modal-header"><h3>Sair do Sistema</h3><button className="modal-fechar" onClick={()=>setConfirmLogout(false)}>✕</button></div>
            <div className="modal-body"><p style={{color:"#94a3b8",lineHeight:"1.6"}}>Tem certeza que deseja sair?</p></div>
            <div className="modal-footer"><button className="btn-secundario" onClick={()=>setConfirmLogout(false)}>Cancelar</button><button className="btn-danger" onClick={onLogout}>Sair</button></div>
          </div>
        </div>
      )}

      {modalSenha&&<ModalAlterarSenha onFechar={()=>setModalSenha(false)}/>}
      <ChatInterno perfilAtual={perfilAtual} gerentes={gerentesChat}/>
    </div>
  );
}
