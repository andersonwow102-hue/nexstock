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
import { GERENTES, ROTAS_POR_GERENTE, GERENTE_CORES, gerenteDaRota, rotaCanonica, rotaPermitidaAoPerfil, rotaPertenceAoGerente } from "./pointsData.js";
import { limparRecuperacao, recuperacaoIniciada, supabase } from "./supabase.js";
import { getMensagemMotivacionalDoDia } from "./motivationalMessages.js";
import {
  carregarEquipamentos, salvarEquipamento, excluirEquipamento,
  carregarHistoricoEquipamentos, adicionarHistoricoEquipamento, limparHistoricoEquipamentos,
  carregarPontos, salvarPonto, adicionarHistoricoPonto, carregarHistoricoPontos,
  carregarPerfilAtual, resolverEmailPorLogin, carregarDespesasMensais,
  carregarMensagensInternas, enviarMensagemInterna, marcarMensagensInternasLidas,
  carregarPixEnvios, enviarPixParaGerente,
  carregarFechamentosRotas, salvarFechamentoRota,
} from "./db.js";

const CATEGORIAS = ["Televisões","Terminais","Impressoras","Tablets","Carregadores","Totens","Noteiro","PDV Touchscreen"];
const STATUS_LISTA = ["Disponível","Em rota","Em conserto"];
const ICONES = {"Televisões":"📺","Terminais":"🖥️","Impressoras":"🖨️","Tablets":"📱","Carregadores":"🔌","Totens":"🗼","Noteiro":"💵","PDV Touchscreen":"🧾"};
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

function padronizarNomenclaturaEquipamento(t){
  return String(t||"").trim().replace(/\s+/g," ").toUpperCase();
}

const TRANSFERENCIA_GERENTE = {
  aguardando: "aguardando_confirmacao",
  recebido: "recebido",
};
const formVazio={nome:"",categoria:CATEGORIAS[0],quantidade:1,status:"Disponível",minimo:5,observacao:"",localizacao:"",responsavel:"",patrimonio:"",dataCadastro:"",gerenteResponsavel:"",transferenciaStatus:"",transferenciaEnviadaEm:"",transferenciaRecebidaEm:""};
const movVazio={tipoId:"ponto",ponto:"",gerente:"",responsavel:"",observacao:"",defeito:"",assistencia:"",previsao:"",notaFiscalNome:"",notaFiscalArquivo:"",consertoPix:"",consertoValor:""};
const ITENS_POR_PAGINA=12;
const agora=()=>new Date().toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});
const hoje=()=>new Date().toISOString().slice(0,10);
const isoAgora=()=>new Date().toISOString();
const formatarMoedaPDF=valor=>Number(valor||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const normalizarTexto=v=>String(v||"").trim().toLowerCase();
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

function validarItem(f,itens=[],itemId=null){
  if(!f.nome.trim())       return"Nome do equipamento é obrigatório.";
  if(!f.categoria)         return"Categoria é obrigatória.";
  if(!f.status)            return"Status é obrigatório.";
  if(!padronizarNomenclaturaEquipamento(f.nome)) return"Nomenclatura do equipamento é obrigatória.";
  if(!padronizarNomenclaturaEquipamento(f.patrimonio)) return"Código / Patrimônio é obrigatório.";
  const patrimonio=padronizarNomenclaturaEquipamento(f.patrimonio);
  if(itens.some(i=>i.id!==itemId&&(i.patrimonio||"").trim().toUpperCase()===patrimonio)) return`Código duplicado: o patrimônio ${patrimonio} já está cadastrado.`;
  return null;
}
function validarMov(mov,tipo,perfil=""){
  if(tipo.exigePonto&&!mov.ponto)return"Selecione o ponto de destino.";
  if(tipo.id==="conserto"&&!mov.defeito.trim())return"Descreva o defeito antes de enviar o equipamento para conserto.";
  if(tipo.id==="conserto"&&perfil==="operador"){
    if(!mov.notaFiscalArquivo)return"Anexe a foto da nota fiscal antes de enviar para conserto.";
    if(!String(mov.consertoPix||"").trim())return"Informe a chave PIX do conserto.";
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
  const XLSX=await import("xlsx");
  const dados=itens.map(i=>({
    "Patrimônio":i.patrimonio||"—","Nome":i.nome,"Categoria":i.categoria,
    "Status":i.status,"Ponto / Localização":i.localizacao||"—",
    "Responsável":i.responsavel||"—",
    "Observação":i.observacao||"—","Data Cadastro":i.dataCadastro||"—",
  }));
  const ws=XLSX.utils.json_to_sheet(dados);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,"Equipamentos");
  XLSX.writeFile(wb,`equipamentos_${hoje()}.xlsx`);
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
  const XLSX=await import("xlsx");
  const dados=historico.map(h=>({
    "Tipo":HIST_CFG[h.tipo]?.label||h.tipo,"Equipamento":h.itemNome,"Categoria":h.categoria,
    "Qtd Antes":h.qtdAntes,"Qtd Depois":h.qtdDepois,
    "Responsável":h.responsavel||"—","Observação":h.observacao||"—","Data":h.data,
  }));
  const ws=XLSX.utils.json_to_sheet(dados);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,"Histórico");
  XLSX.writeFile(wb,`historico_equipamentos_${hoje()}.xlsx`);
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
    p.possuiDespesa==="sim"?"Sim":"Não",
    p.possuiDespesa==="sim"?formatarMoedaPDF(p.valorDespesa):"-",
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
          colunas:["Nome Fantasia","Dono","Gerente","Equipamentos","Despesa","Valor"],
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
      colunas:["Nome Fantasia","Dono","Gerente","Equipamentos","Despesa","Valor"],
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
          colunas:["Nome Fantasia","Dono","Gerente","Equipamentos","Despesa","Valor"],
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
          <span>📨</span>
          <div><strong>{pendentesConfirmacao.length}</strong><small>envios aguardando gerente</small></div>
        </article>
        <article className={alertaTerminais?"central-kpi central-kpi-alerta":"central-kpi"}>
          <span>💻</span>
          <div><strong>{terminaisDisponiveis}</strong><small>terminais disponíveis{alertaTerminais?` · faltam ${alertaTerminais}`:""}</small></div>
        </article>
        <article className="central-kpi">
          <span>🔧</span>
          <div><strong>{emConserto.length}</strong><small>equipamentos em conserto</small></div>
        </article>
        <article className="central-kpi">
          <span>📍</span>
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
                <span>📨</span><div><strong>{item.patrimonio||item.nome}</strong><small>Aguardando confirmação de {item.gerenteResponsavel||"gerente"}</small></div>
              </div>)}
              {alertaTerminais>0&&<div className="central-item">
                <span>⚠️</span><div><strong>Terminais abaixo do mínimo</strong><small>{terminaisDisponiveis} disponíveis de {MINIMO_CATEGORIA} necessários</small></div>
              </div>}
              {emConserto.slice(0,3).map(item=><div key={item.id} className="central-item">
                <span>🔧</span><div><strong>{item.patrimonio||item.nome}</strong><small>{item.nome} está em conserto</small></div>
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
                <span>👤</span>
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
                <span>{HIST_CFG[h.tipo]?.icone||"📋"}</span><div><strong>{h.itemNome}</strong><small>{HIST_CFG[h.tipo]?.label||h.tipo} · {h.data}</small></div>
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

function BuscaGlobalPage({ consulta, onConsulta, itens, pontos, historico, onVerEquipamento, onAbrirPontos }) {
  const termo=consulta.trim().toLowerCase();
  const equipamentos=termo?itens.filter(i=>[i.patrimonio,i.nome,i.categoria,i.status,i.localizacao,i.responsavel].some(v=>(v||"").toLowerCase().includes(termo))):[];
  const pontosEncontrados=termo?pontos.filter(p=>[p.nomeFantasia,p.nomeDono,p.gerente,rotaCanonica(p.gerente),gerenteDaRota(p.gerente),p.telefone,...p.modalidades].some(v=>(v||"").toLowerCase().includes(termo))):[];
  const movimentos=termo?historico.filter(h=>[h.itemNome,h.categoria,h.tipo,h.responsavel,h.observacao].some(v=>(v||"").toLowerCase().includes(termo))).slice(0,20):[];
  return(
    <div className="busca-global-page">
      <section className="busca-global-hero">
        <span className="dash-kicker">Pesquisa geral</span>
        <h2>Encontre qualquer informação rapidamente</h2>
        <input className="input-busca busca-global-input" autoFocus type="text" placeholder="Digite patrimônio, ponto, gerente, status ou responsável..." value={consulta} onChange={e=>onConsulta(e.target.value)}/>
      </section>
      {!termo
        ?<div className="hist-vazio"><div className="hist-vazio-icone">🔎</div><div>Digite alguma informação para pesquisar em todo o sistema.</div></div>
        :<div className="busca-resultados">
          <section className="secao busca-bloco">
            <h2 className="secao-titulo">Equipamentos <span className="badge-count">{equipamentos.length}</span></h2>
            {equipamentos.length===0?<p className="dash-vazio">Nenhum equipamento encontrado.</p>:equipamentos.map(i=><button key={i.id} className="busca-item" onClick={()=>onVerEquipamento(i)}><strong>{i.patrimonio}</strong><span>{i.nome}</span><small>{i.status} · {i.localizacao||"Sem ponto"}</small></button>)}
          </section>
          <section className="secao busca-bloco">
            <h2 className="secao-titulo">Pontos <span className="badge-count">{pontosEncontrados.length}</span></h2>
            {pontosEncontrados.length===0?<p className="dash-vazio">Nenhum ponto encontrado.</p>:pontosEncontrados.map(p=><button key={p.id} className="busca-item" onClick={onAbrirPontos}><strong>{p.nomeFantasia}</strong><span>{rotaCanonica(p.gerente)}</span><small>{p.telefone}</small></button>)}
          </section>
          <section className="secao busca-bloco">
            <h2 className="secao-titulo">Movimentações <span className="badge-count">{movimentos.length}</span></h2>
            {movimentos.length===0?<p className="dash-vazio">Nenhuma movimentação encontrada.</p>:movimentos.map(h=><div key={h.id} className="busca-item sem-clique"><strong>{h.itemNome}</strong><span>{HIST_CFG[h.tipo]?.label||h.tipo}</span><small>{h.data}</small></div>)}
          </section>
        </div>}
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

function formatarPrazoPix() {
  return "sem expiração";
}

const FECHAMENTO_CORES = ["Alex", "Central/Uibai", "Lapão", "América Dourada", "Eliana", "Queixo", "Wene", "João Luis", "Beu"];
const MODALIDADES_FECHAMENTO = [
  { id: "90-da-sorte", nome: "90 da Sorte", comissao: 0.10, descricao: "10% de comissão", logo: logo90DaSorte },
  { id: "viapix", nome: "Viapix", comissao: null, descricao: "Comissão preenchida manualmente", logo: logoViapix },
  { id: "lotobanca", nome: "Agência Rio", comissao: 0.20, descricao: "Lotobanca · 20% de comissão", logo: logoLotobanca },
];

function criarFechamentoVazio() {
  return MODALIDADES_FECHAMENTO.reduce((acc, modalidade) => {
    acc[modalidade.id] = { entrada: "", comissao: "", saida: "" };
    return acc;
  }, {});
}

function numeroFechamento(valor) {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;
  return Number(String(valor || "").replace(/\./g, "").replace(",", ".")) || 0;
}

function corFechamento(gerente) {
  const rotas = ROTAS_POR_GERENTE[gerente] || [];
  const chave = rotas[0] || gerente || FECHAMENTO_CORES[0];
  return GERENTE_CORES[chave] || GERENTE_CORES[FECHAMENTO_CORES[0]] || { bg:"rgba(37,99,235,0.12)", color:"#2563eb", border:"rgba(37,99,235,0.28)" };
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
  const totalDetalhe = despesasDetalhe.reduce((s,d)=>s+valorDespesaPrestacao(d),0);
  const mediaPorPonto = pontosDetalhe.length ? totalDetalhe / pontosDetalhe.length : 0;
  const calculosModalidades = MODALIDADES_FECHAMENTO.map(modalidade => {
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

  useEffect(()=>{
    let ativo=true;
    carregarFechamentosRotas()
      .then(lista=>{ if(ativo) setFechamentosRotas(lista); })
      .catch(err=>{ if(ativo) setFechamentoErro(err.message||"Não foi possível carregar os fechamentos."); });
    return ()=>{ativo=false;};
  },[]);

  useEffect(()=>{
    const vazio = criarFechamentoVazio();
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
        vazio[f.modalidade] = {
          entrada: String(f.entrada || ""),
          comissao: String(f.comissao || ""),
          saida: String(f.saida || ""),
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
      const salvos = await salvarFechamentoRota({
        gerente: gerenteSelecionado,
        rota: rotaDetalheAtiva,
        competencia,
        dia: diaFechamento || "",
        modalidades: calculosModalidades.map(m => ({
          modalidade: m.id,
          entrada: m.entrada,
          comissao: m.comissaoCalculada,
          saida: m.saida,
          saldoBruto: m.saldoBruto,
        })),
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
      setFechamentoOk("Fechamento salvo com sucesso.");
    }catch(err){
      setFechamentoErro(err.message||"Não foi possível salvar o fechamento.");
    }finally{
      setFechamentoSalvando(false);
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
      <div className="prestacao-gerentes-grid">
        {dadosRotas.map(g=>(
          <button
            key={`${g.gerente}-${g.rota}`}
            type="button"
            className={`prestacao-gerente-card fechamento-card fechamento-card-click ${gerenteSelecionado===g.gerente&&rotaSelecionada===g.rota?"ativo":""}`}
            style={{"--gerente-cor":g.cor.color,"--gerente-bg":g.cor.bg,"--gerente-border":g.cor.border}}
            onClick={()=>selecionarRotaFechamento(g)}
          >
            <div className="prestacao-gerente-avatar">{g.gerente.slice(0,1).toUpperCase()}</div>
            <span>{g.gerente}</span>
            <strong>{formatarMoedaPDF(g.totalDespesas)}</strong>
            <small>{g.pontos} ponto{g.pontos!==1?"s":""} · {g.equipamentos} equipamento{g.equipamentos!==1?"s":""}</small>
            <div className="modalidades-badges">
              <span className="badge-cat">{g.rota}</span>
            </div>
          </button>
        ))}
      </div>
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
            </div>
            {rotasDetalhe.length>1&&(
              <div className="fechamento-rota-tabs">
                {rotasDetalhe.map(rota=>(
                  <button key={rota} type="button" className={rotaDetalheAtiva===rota?"ativo":""} onClick={()=>setRotaSelecionada(rota)}>{rota}</button>
                ))}
              </div>
            )}
          </div>
          <div className="fechamento-kpis">
            <article className="kpi-bruto"><i>📈</i><span>Saldo bruto</span><strong>{formatarMoedaPDF(saldoBrutoFechamento)}</strong><small>Entrada menos comissão e saída</small></article>
            <article className="kpi-despesas"><i>🧾</i><span>Despesas do sistema</span><strong>{formatarMoedaPDF(totalDetalhe)}</strong><small>Puxado automaticamente das despesas</small></article>
            <article className="kpi-final"><i>💎</i><span>Saldo final</span><strong>{formatarMoedaPDF(saldoFinalFechamento)}</strong><small>Saldo bruto menos despesas</small></article>
            <article className="kpi-comissao"><i>🏆</i><span>Comissão gerente 10%</span><strong>{formatarMoedaPDF(comissaoGerenteFechamento)}</strong><small>Calculado sobre o saldo final</small></article>
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
                    <div className="fechamento-modalidade-logo">
                      <img src={m.logo} alt={m.nome} />
                    </div>
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
              <p>O saldo final é o saldo bruto menos as despesas já lançadas no sistema. A comissão do gerente é 10% do saldo final.</p>
              <button className="fechamento-save-btn" type="button" onClick={salvarFechamentoSelecionado} disabled={fechamentoSalvando}>{fechamentoSalvando?"Salvando...":"Salvar fechamento"}</button>
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

function FichaEquipamento({ item, historico, onFechar, onEditar, onMovimentar, podeEditar }) {
  const movimentos=historico.filter(h=>h.itemId===item.id||h.itemNome===item.nome);
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
          <h4 className="ficha-subtitulo">Linha do tempo</h4>
          <div className="ficha-historico">
            {movimentos.length===0?<p className="dash-vazio">Nenhuma movimentação registrada.</p>:movimentos.map(h=><div className="ficha-evento" key={h.id}><span className={`badge-hist ${HIST_CFG[h.tipo]?.cor||""}`}>{HIST_CFG[h.tipo]?.label||h.tipo}</span><div><strong>{h.observacao||"Sem detalhe"}</strong><small>{h.data} · {h.responsavel||"-"}</small></div></div>)}
          </div>
        </div>
        {podeEditar&&<div className="modal-footer">
          <button className="btn-secundario" onClick={()=>{onFechar();onEditar(item);}}>Editar</button>
          <button className="btn-primario" onClick={()=>{onFechar();onMovimentar(item);}}>Movimentar</button>
        </div>}
      </div>
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

function ChatInterno({ perfilAtual, gerentes = [] }) {
  const [aberto, setAberto] = useState(false);
  const [mensagens, setMensagens] = useState([]);
  const [gerenteSelecionado, setGerenteSelecionado] = useState("");
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [permissaoNotificacao, setPermissaoNotificacao] = useState(()=>notificacaoDisponivel() ? Notification.permission : "unsupported");
  const [apelidoAdmin, setApelidoAdmin] = useState(()=>{
    try{return localStorage.getItem("stockon_chat_apelido_admin") || "Administração";}catch{return "Administração";}
  });
  const notificacoesIniciadas = useRef(false);
  const ultimoIdNotificado = useRef(0);
  const admin = ["administrador","operador"].includes(perfilAtual?.perfil);
  const gerenteAtual = perfilAtual?.perfil==="gerente" ? (perfilAtual.gerenteNome || perfilAtual.nome || "") : "";
  const gerentesDisponiveis = useMemo(() => [...new Set(gerentes.filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt-BR")), [gerentes]);
  const gerenteConversa = admin ? gerenteSelecionado : gerenteAtual;
  const apelidoAdminFinal = apelidoAdmin.trim() || "Administração";

  useEffect(()=>{
    try{localStorage.setItem("stockon_chat_apelido_admin", apelidoAdminFinal);}catch{}
  },[apelidoAdminFinal]);

  useEffect(() => {
    if (admin && !gerenteSelecionado && gerentesDisponiveis.length > 0) setGerenteSelecionado(gerentesDisponiveis[0]);
  }, [admin, gerenteSelecionado, gerentesDisponiveis]);

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
        icon: "/icons/icon-192.png",
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
    if (!gerenteConversa) { setErro("Selecione um gerente para iniciar a conversa."); return; }
    setEnviando(true);
    try {
      const nova = await enviarMensagemInterna({
        perfilAtual: {
          ...perfilAtual,
          nome: admin ? apelidoAdminFinal : gerenteConversa,
        },
        gerenteNome: gerenteConversa,
        destinoTipo: admin ? "gerente" : "administracao",
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
    <div className={`chat-flutuante ${aberto ? "aberto" : ""}`}>
      {!aberto && (
        <button className="chat-bolha" onClick={()=>setAberto(true)} title="Abrir chat interno">
          💬
          {mensagensNaoLidas>0 && <span>{mensagensNaoLidas>9?"9+":mensagensNaoLidas}</span>}
        </button>
      )}
      {aberto && (
        <section className="chat-painel">
          <header className="chat-header">
            <div>
              <span>{admin ? "Administração" : "Canal com a administração"}</span>
              <strong>Chat interno</strong>
            </div>
            <button onClick={()=>setAberto(false)}>✕</button>
          </header>
          {admin && (
            <div className="chat-gerente">
              <label>Conversa com</label>
              <select value={gerenteSelecionado} onChange={e=>setGerenteSelecionado(e.target.value)}>
                {gerentesDisponiveis.length===0 && <option value="">Nenhum gerente encontrado</option>}
                {gerentesDisponiveis.map(g=><option key={g} value={g}>{g}</option>)}
              </select>
              <label>Seu apelido no chat</label>
              <input type="text" value={apelidoAdmin} onChange={e=>setApelidoAdmin(e.target.value)} placeholder="Ex: Anderson, Administração, Central..." />
            </div>
          )}
          {!admin && <div className="chat-gerente chat-gerente-fixo"><span>Gerente</span><strong>{gerenteConversa||"Sem gerente vinculado"}</strong></div>}
          {permissaoNotificacao!=="granted" && (
            <div className="chat-notificacao">
              <span>🔔 Receber aviso no celular quando chegar mensagem</span>
              <button type="button" onClick={ativarNotificacoes}>
                {permissaoNotificacao==="denied" ? "Bloqueado" : "Ativar"}
              </button>
            </div>
          )}
          <div className="chat-lista">
            {!gerenteConversa ? (
              <p className="chat-vazio">Selecione um gerente para ver a conversa.</p>
            ) : mensagens.length===0 ? (
              <p className="chat-vazio">Nenhuma mensagem ainda. Use este canal para deixar tudo registrado.</p>
            ) : mensagens.map(m => {
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
            <textarea value={texto} onChange={e=>setTexto(e.target.value)} placeholder="Digite sua mensagem..." maxLength={2000}/>
            <button className="btn-primario" disabled={enviando || !texto.trim()}>{enviando ? "Enviando..." : "Enviar"}</button>
          </form>
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
    if(novaSenha.length<8){setErro("A nova senha precisa ter pelo menos 8 caracteres.");return;}
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
          <div className="campo"><label>Nova senha</label><input type="password" placeholder="Mínimo de 8 caracteres" value={novaSenha} onChange={e=>setNovaSenha(e.target.value)} autoFocus/></div>
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
    if(novaSenha.length<8){setErro("A nova senha precisa ter pelo menos 8 caracteres.");return;}
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
              <div className="campo"><label>Nova senha *</label><input type="password" placeholder="Mínimo de 8 caracteres" value={novaSenha} onChange={e=>setNovaSenha(e.target.value)}/></div>
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
        ]);
        if(!ativo)return;
        if(complementos[0].status==="fulfilled")setHistorico(complementos[0].value);
        if(complementos[1].status==="fulfilled")setHistoricoPontos(complementos[1].value);
        if(complementos[2].status==="fulfilled")setPerfilAtual(complementos[2].value);
        if(complementos[3].status==="fulfilled")setDespesasBackup(complementos[3].value);
        if(complementos[4].status==="fulfilled")setPixEnvios(complementos[4].value);
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
  const gerentesChat=[...new Set([
    ...GERENTES,
    ...pontos.map(p=>gerenteDaRota(p.gerente)).filter(Boolean),
  ])].sort((a,b)=>a.localeCompare(b,"pt-BR"));
  const gerenteAtual=perfilAtual.perfil==="gerente"?(perfilAtual.gerenteNome||perfilAtual.nome||""):"";
  const gerenteAtualKey=normalizarTexto(gerenteAtual);
  const podeCadastrarEquipamento=podeEditar||perfilAtual.perfil==="gerente";
  const gerenteNomeBase=nomeBaseGerente(gerenteAtual);
  const gerenteAvatar=avatarLendario(gerenteAtual);
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
  const despesasOperacionais=gerenteAtual
    ?despesasBackup.filter(d=>pontosOperacionais.some(p=>p.id===d.pontoId))
    :despesasBackup;
  const gerentePixNome=gerenteDaRota(gerenteAtual)||gerenteAtual;
  const pixAvisoAtual=gerenteAtual?pixEnvios.find(aviso=>
    normalizarTexto(aviso.gerente)===normalizarTexto(gerentePixNome)&&
    pixDentroDoPrazo(aviso)
  ):null;

  async function copiarPixAviso(chave){
    try{
      await navigator.clipboard.writeText(chave);
      alert("Chave PIX copiada.");
    }catch{
      alert(`Chave PIX: ${chave}`);
    }
  }

  const totalGeral     =itensOperacionais.length;
  const totalDisponivel=itensOperacionais.filter(i=>i.status==="Disponível").length;
  const totalEmRota    =itensOperacionais.filter(i=>i.status==="Em rota").length;
  const totalConserto  =itensOperacionais.filter(i=>i.status==="Em conserto").length;

  const alertas = [CATEGORIA_COM_ALERTA].map(cat=>{
    const totalDisp=itensOperacionais.filter(i=>i.categoria===cat&&i.status==="Disponível").length;
    return{categoria:cat,totalDisponivel:totalDisp,faltam:MINIMO_CATEGORIA-totalDisp};
  }).filter(a=>a.totalDisponivel<MINIMO_CATEGORIA);

  const porCategoria=CATEGORIAS.map(cat=>{
    const ci=itensOperacionais.filter(i=>i.categoria===cat);
    const totalDisp=ci.filter(i=>i.status==="Disponível").length;
    return{categoria:cat,total:ci.length,qtdItens:ci.length,
      disponivel:totalDisp,
      emRota:ci.filter(i=>i.status==="Em rota").length,
      conserto:ci.filter(i=>i.status==="Em conserto").length,
      alertaBaixo:cat===CATEGORIA_COM_ALERTA&&totalDisp<MINIMO_CATEGORIA,
    };
  });
  const inconsistencias=itensOperacionais.filter(item=>
    !padronizarNomenclaturaEquipamento(item.nome)||!padronizarNomenclaturaEquipamento(item.patrimonio)
  );
  const pontosComEquipamentos=pontosOperacionais.map(p=>({
    ...p,
    totalEquipamentos:itensOperacionais.filter(i=>i.localizacao===p.nomeFantasia).length,
  })).filter(p=>p.totalEquipamentos>0).sort((a,b)=>b.totalEquipamentos-a.totalEquipamentos);

  const itensFiltrados=itensOperacionais.filter(i=>{
    const mC=filtroCatEquip==="Todas"||i.categoria===filtroCatEquip;
    const mS=filtroSt==="Todos"||i.status===filtroSt;
    const q=busca.toLowerCase();
    const mB=!busca||[i.nome,i.patrimonio,i.responsavel,i.localizacao,i.gerenteResponsavel].some(f=>(f||"").toLowerCase().includes(q));
    return mC&&mS&&mB;
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

  useEffect(()=>{setPaginaItens(1);},[busca,filtroSt,filtroCatEquip]);
  useEffect(()=>{
    if(gerenteAtual&&filtroSt==="Em conserto")setFiltroSt("Todos");
  },[gerenteAtual,filtroSt]);
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
    const inconsistencia=validarItem(item,itens,item.id);
    if(inconsistencia){window.alert(`Corrija o cadastro antes de movimentar este equipamento. ${inconsistencia}`);return;}
    setModalMov(item);setMov({...movVazio,ponto:item.localizacao||"",gerente:item.gerenteResponsavel||""});setErroMov("");
  }
  function fecharMov(){setModalMov(null);}

  function anexarNotaFiscalConserto(arquivo){
    if(!arquivo)return;
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
    const erro=validarItem(ff,itens,itemEdit?.id);if(erro){setErroForm(erro);return;}
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
    const localizacao=tipo.id==="ponto"?mov.ponto:tipo.id==="conserto"?"Em conserto":"";
    const upd=tipo.id==="gerente"
      ?{...modalMov,quantidade:1,status:"Em rota",localizacao:"",responsavel:mov.responsavel||mov.gerente,gerenteResponsavel:mov.gerente,transferenciaStatus:TRANSFERENCIA_GERENTE.aguardando,transferenciaEnviadaEm:isoAgora(),transferenciaRecebidaEm:""}
      :tipo.id==="disponivel"&&!gerenteAtual
        ?{...modalMov,quantidade:1,status:tipo.novoStatus,localizacao:"",responsavel:mov.responsavel||modalMov.responsavel,gerenteResponsavel:"",transferenciaStatus:"",transferenciaEnviadaEm:"",transferenciaRecebidaEm:""}
        :{...modalMov,quantidade:1,status:tipo.novoStatus,localizacao,responsavel:mov.responsavel||modalMov.responsavel,transferenciaStatus:modalMov.transferenciaStatus,gerenteResponsavel:modalMov.gerenteResponsavel};
    await salvarEquipamento(upd);
    setItens(prev=>prev.map(i=>i.id===modalMov.id?upd:i));
    const detalhe=tipo.id==="ponto"?`Destino: ${mov.ponto}`:tipo.id==="conserto"?`Defeito: ${mov.defeito}`:tipo.id==="gerente"?`Enviado para gerente: ${mov.gerente}`:tipo.label;
    const informacoesConserto=tipo.id==="conserto"?[
      mov.assistencia&&`Assistência: ${mov.assistencia}`,
      mov.previsao&&`Previsão: ${mov.previsao}`,
      mov.consertoPix&&`PIX conserto: ${mov.consertoPix}`,
      mov.consertoValor&&`Valor conserto: ${formatarMoedaPDF(mov.consertoValor)}`,
      mov.notaFiscalNome&&`Nota fiscal: ${mov.notaFiscalNome}`,
    ]:[];
    const h={id:Date.now(),tipo:tipo.id==="gerente"?"envio_gerente":tipo.id,itemId:modalMov.id,itemNome:modalMov.nome,categoria:modalMov.categoria,qtdAntes:1,qtdDepois:1,responsavel:mov.responsavel||mov.gerente||"—",observacao:[detalhe,...informacoesConserto,mov.observacao].filter(Boolean).join(" | "),data:agora()};
    if(tipo.id==="conserto"&&mov.notaFiscalArquivo){
      try{
        localStorage.setItem(`stockon_nota_conserto_${h.id}`,JSON.stringify({
          itemId:modalMov.id,
          itemNome:modalMov.nome,
          arquivoNome:mov.notaFiscalNome,
          arquivo:mov.notaFiscalArquivo,
          pix:mov.consertoPix,
          valor:mov.consertoValor,
          criadoEm:isoAgora(),
        }));
      }catch{}
    }
    await adicionarHistoricoEquipamento(h);setHistorico(prev=>[h,...prev]);
    fecharMov();
  }

  async function baixarBackupObrigatorio(){
    const geradoEm=isoAgora();
    const escopo=perfilAtual.perfil==="gerente"?`gerente-${gerenteAtual||perfilAtual.nome}`:"completo";
    const titulo=perfilAtual.perfil==="gerente"
      ?`Backup do Gerente - ${gerenteAtual||perfilAtual.nome}`
      :"Backup Completo Stock-ON";
    await gerarPDF({
      titulo,
      descricao:`Arquivo opcional de segurança emitido para ${perfilAtual.nome||perfilAtual.loginNome||perfilAtual.perfil}. Guarde fora do sistema quando desejar.`,
      nomeArquivo:`stock-on_backup_${slugArquivoBackup(escopo)}_${hoje()}.pdf`,
      total:itensOperacionais.length+pontosOperacionais.length+despesasOperacionais.length+historicoOperacional.length+historicoPontosOperacional.length,
      resumo:[
        {label:"Equipamentos",valor:itensOperacionais.length,destaque:[37,99,235]},
        {label:"Pontos",valor:pontosOperacionais.length,destaque:[15,35,72]},
        {label:"Despesas",valor:despesasOperacionais.length,destaque:[222,147,0]},
        {label:"Mov. Equip.",valor:historicoOperacional.length,destaque:[5,150,82]},
        {label:"Mov. Pontos",valor:historicoPontosOperacional.length,destaque:[100,116,139]},
        {label:"Frequência",valor:"Opcional",destaque:[222,147,0]},
      ],
      secoes:[
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
          colunas:["Ponto","Dono","Telefone","Gerente","Despesa","Valor"],
          linhas:ordenarPontos(pontosOperacionais).map(p=>[
            p.nomeFantasia||"-",
            p.nomeDono||"-",
            p.telefone||"-",
            p.gerente||"-",
            p.possuiDespesa==="sim"?"Sim":"Não",
            formatarMoedaPDF(p.valorDespesa||0),
          ]),
        },
        {
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
        },
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
      ],
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
        <nav className="sidebar-nav">
          <span className="nav-section-label">Principal</span>
          <button className={`nav-item ${aba==="dashboard"?"active":""}`} onClick={()=>navegar("dashboard")}><span className="nav-icon">📊</span> Dashboard</button>
          <button className={`nav-item ${aba==="itens"?"active":""}`}     onClick={()=>navegar("itens")}><span className="nav-icon">📦</span> Equipamentos</button>
          <button className={`nav-item ${aba==="pontos"?"active":""}`}    onClick={()=>navegar("pontos")}><span className="nav-icon">📍</span> Pontos</button>
          <button className={`nav-item ${aba==="busca"?"active":""}`}      onClick={()=>navegar("busca")}><span className="nav-icon">🔎</span> Busca Geral</button>
          {administrador&&<button className={`nav-item ${aba==="fechamento"?"active":""}`} onClick={()=>navegar("fechamento")}><span className="nav-icon">✅</span> Fechamento</button>}
          {podeEditar&&<button className={`nav-item ${aba==="gestao"?"active":""}`} onClick={()=>navegar("gestao")}><span className="nav-icon">🔑</span> Central de Acessos</button>}
          {administrador&&<button className={`nav-item ${aba==="logins"?"active":""}`} onClick={()=>navegar("logins")}><span className="nav-icon">🔐</span> Gerenciar Logins</button>}
          <button className={`nav-item ${aba==="historico"?"active":""}`} onClick={()=>navegar("historico")}>
            <span className="nav-icon">📋</span> Histórico
            {historicoOperacional.length>0&&<span className="nav-badge">{historicoOperacional.length>99?"99+":historicoOperacional.length}</span>}
          </button>
        </nav>
        <div className="sidebar-footer">
          {pixAvisoAtual&&(
            <section className={`sidebar-pix-card ${perfilBancoPix(pixAvisoAtual.pixBanco).classe}`}>
              <div className="sidebar-pix-topo">
                <span>PIX recebido</span>
                <strong>{formatarPrazoPix(pixAvisoAtual.enviadoEm)}</strong>
              </div>
              <div className="sidebar-pix-banco">
                <span>{perfilBancoPix(pixAvisoAtual.pixBanco).icone}</span>
                <div>
                  <strong>{pixAvisoAtual.pixNome}</strong>
                  <small>{perfilBancoPix(pixAvisoAtual.pixBanco).nome}</small>
                </div>
              </div>
              {pixAvisoAtual.rota&&<em>Rota {pixAvisoAtual.rota}</em>}
              <p>{pixAvisoAtual.pixTipo}: {pixAvisoAtual.pixChave}</p>
              <button type="button" onClick={()=>copiarPixAviso(pixAvisoAtual.pixChave)}>Copiar chave PIX</button>
            </section>
          )}
          {alertas.length>0&&(
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
              <button className="dash-kpi kpi-total" onClick={()=>navegar("itens")}><span>Cadastrados</span><strong>{totalGeral}</strong><small>equipamentos</small></button>
              <button className="dash-kpi kpi-disponivel" onClick={()=>{navegar("itens");setFiltroSt("Disponível");}}><span>Disponíveis</span><strong>{totalDisponivel}</strong><small>prontos para envio</small></button>
              <button className="dash-kpi kpi-rota" onClick={()=>{navegar("itens");setFiltroSt("Em rota");}}><span>Em pontos</span><strong>{totalEmRota}</strong><small>em operação</small></button>
              {!gerenteAtual&&<button className="dash-kpi kpi-conserto" onClick={()=>{navegar("itens");setFiltroSt("Em conserto");}}><span>Conserto</span><strong>{totalConserto}</strong><small>fora de operação</small></button>}
            </section>

            <div className="dash-conteudo">
              <section className="secao dash-categorias">
                <h2 className="secao-titulo">Disponibilidade por Categoria</h2>
                <div className="dash-lista-categorias">
                  {porCategoria.map(c=>{
                    const percentual=c.total?Math.round((c.disponivel/c.total)*100):0;
                    return(
                      <button key={c.categoria} className={`dash-categoria ${c.alertaBaixo?"em-alerta":""}`}
                        onClick={()=>{navegar("itens");setFiltroCatEquip(c.categoria);setAbaEquip("lista");}}>
                        <span className="dash-cat-icone">{ICONES[c.categoria]}</span>
                        <span className="dash-cat-info">
                          <strong>{c.categoria}</strong>
                          <span className="dash-barra"><i style={{width:`${percentual}%`}}/></span>
                        </span>
                        <span className="dash-cat-numeros"><strong>{c.disponivel}</strong> / {c.total}<small> disponíveis</small></span>
                        {c.alertaBaixo&&<span className="dash-aviso">Baixo</span>}
                      </button>
                    );
                  })}
                </div>
              </section>

              <div className="dash-lateral">
                <section className={`secao dash-atencao ${alertas.length===0?"ok":""}`}>
                  <h2 className="secao-titulo">Atenção</h2>
                  {alertas.length===0
                    ?<p className="dash-vazio">Tudo certo: Terminais dentro do estoque mínimo.</p>
                    :alertas.map(a=>(
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
            <span className="equip-filtro-label">Categoria</span>
            <div className="equip-categorias">
              {["Todas",...CATEGORIAS].map(cat=>(
                <button key={cat} className={`points-aba-btn ${filtroCatEquip===cat?"points-aba-ativa":""}`}
                  onClick={()=>{setFiltroCatEquip(cat);setAbaEquip("lista");}}>
                  {cat==="Todas"?"Todas":ICONES[cat]+" "+cat}
                </button>
              ))}
            </div>
          </div>

          {alertaEstoqueAtivo&&alertas.length>0&&(
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
                {alertas.map(a=>(
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
                  ⚠️ {inconsistencias.length} equipamento{inconsistencias.length!==1?"s":""} com cadastro inconsistente. Preencha nome e código/patrimônio antes de novas movimentações:
                  <strong>{inconsistencias.map(i=>i.patrimonio||i.nome).join(", ")}</strong>
                </div>
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
                  {(filtroCatEquip!=="Todas"||filtroSt!=="Todos"||busca)&&(
                    <button className="btn-limpar" onClick={()=>{setFiltroCatEquip("Todas");setFiltroSt("Todos");setBusca("");}}>✕ Limpar</button>
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
                      return(
                        <tr key={item.id} className={emAlerta?"row-alerta":""}>
                          <td className="td-minimo">{item.patrimonio||"—"}</td>
                          <td className="td-nome">{ICONES[item.categoria]} {item.nome}</td>
                          <td><span className="badge-cat">{item.categoria}</span></td>
                          <td>
                            <span className={`badge-status ${STATUS_CFG[item.status]?.cor||""}`}>{item.status}</span>
                            {pendente&&<span className="badge-transferencia">Aguardando confirmação</span>}
                            {recebido&&<span className="badge-transferencia badge-transferencia-ok">Estoque do gerente</span>}
                          </td>
                          <td><LocalizacaoGerenteCell item={item}/></td>
                          <td>
                            {pendente&&gerenteAtual?<button className="btn-movimentar" onClick={()=>confirmarRecebimento(item)}>✅ Confirmar</button>:
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
                  <article className="equip-card" key={item.id}>
                    <div className="equip-card-topo">
                      <div><span className="equip-codigo">{item.patrimonio||"—"}</span><h3>{ICONES[item.categoria]} {item.nome}</h3></div>
                      <span className={`badge-status ${STATUS_CFG[item.status]?.cor||""}`}>{item.status}</span>
                    </div>
                    {item.transferenciaStatus===TRANSFERENCIA_GERENTE.aguardando&&<span className="badge-transferencia">Aguardando confirmação</span>}
                    {item.transferenciaStatus===TRANSFERENCIA_GERENTE.recebido&&item.gerenteResponsavel&&!item.localizacao&&<span className="badge-transferencia badge-transferencia-ok">Estoque do gerente</span>}
                    <div className="equip-card-meta">
                      <span className="badge-cat">{item.categoria}</span>
                      <span>📍 {textoLocalizacaoEquipamento(item)}</span>
                      {item.gerenteResponsavel&&<span>👤 {item.gerenteResponsavel}</span>}
                    </div>
                    <div className="equip-card-acoes">
                      {item.transferenciaStatus===TRANSFERENCIA_GERENTE.aguardando&&gerenteAtual?<button className="btn-movimentar" onClick={()=>confirmarRecebimento(item)}>✅ Confirmar recebido</button>:podeMovimentarEquipamento(item)&&<button className="btn-movimentar" onClick={()=>abrirMov(item)}>📦 Movimentar</button>}
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
                  <div className={`resumo-card ${alertas.length>0?"resumo-alerta-ativo":""}`}><div className="resumo-num">{alertas.length}</div><div className="resumo-label">Alertas</div></div>
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
                          {c.alertaBaixo&&<div className="cat-detalhe-badge-alerta">⚠ Estoque Baixo</div>}
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
                :<div className="tabela-wrapper">
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

        {aba==="busca"&&(<>
          <header className="topbar">
            <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
              <button className="btn-hamburguer" onClick={()=>setSidebarAberta(!sidebarAberta)}>☰</button>
              <div><h1 className="page-title">Busca Geral</h1><p className="page-sub">Patrimônios, pontos, gerentes, status e movimentações</p></div>
            </div>
          </header>
          <BuscaGlobalPage consulta={buscaGlobal} onConsulta={setBuscaGlobal} itens={itensOperacionais} pontos={pontosOperacionais} historico={historico} onVerEquipamento={setItemDetalhe} onAbrirPontos={()=>navegar("pontos")}/>
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

        {aba==="gestao"&&(<>
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
              :<div className="tabela-wrapper">
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
                <div className="campo"><label>Código / Patrimônio *</label>
                  <input type="text" placeholder="Ex: TV-SALA-001" value={form.patrimonio} onChange={e=>setForm({...form,patrimonio:e.target.value.toUpperCase()})}/>
                  <span className="campo-hint">Você define a nomenclatura. O sistema bloqueia duplicados.</span></div>
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
              <div className="campo-info-minimo">🔒 Alerta operacional somente para <strong>Terminais com menos de 5 disponíveis</strong></div>
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
                  </div>
                  <div className="campos-duplos">
                    <div className="campo"><label>Assistência / Técnico</label><input type="text" placeholder="Ex: Assistência Central" value={mov.assistencia} onChange={e=>setMov({...mov,assistencia:e.target.value})}/></div>
                    <div className="campo"><label>Previsão de retorno</label><input type="date" value={mov.previsao} onChange={e=>setMov({...mov,previsao:e.target.value})}/></div>
                  </div>
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
                        </div>
                        <div className="campo">
                          <label>Valor do conserto {perfilAtual.perfil==="operador"?"*":""}</label>
                          <input type="number" min="0" step="0.01" placeholder="Ex: 150,00" disabled={perfilAtual.perfil!=="operador"} value={mov.consertoValor} onChange={e=>setMov({...mov,consertoValor:e.target.value})}/>
                        </div>
                      </div>
                      <div className="campo">
                        <label>Chave PIX do conserto {perfilAtual.perfil==="operador"?"*":""}</label>
                        <input type="text" placeholder="Digite a chave PIX informada na nota/assistência" disabled={perfilAtual.perfil!=="operador"} value={mov.consertoPix} onChange={e=>setMov({...mov,consertoPix:e.target.value})}/>
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
          podeEditar={podeMovimentarEquipamento(itemDetalhe)}
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
