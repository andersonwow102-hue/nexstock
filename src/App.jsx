import logo from "./assets/stock-on-dark.png";
import logoLight from "./assets/stock-on-light.png";
import { useState, useEffect } from "react";
import "./App.css";
import PointsPage, { PointFormModal } from "./PointsPage.jsx";
import { supabase } from "./supabase.js";
import * as XLSX from "xlsx";
import { gerarRelatorioPDF } from "./pdfReports.js";
import { getMensagemMotivacionalDoDia } from "./motivationalMessages.js";
import {
  carregarEquipamentos, salvarEquipamento, excluirEquipamento,
  carregarHistoricoEquipamentos, adicionarHistoricoEquipamento, limparHistoricoEquipamentos,
  carregarPontos, salvarPonto, adicionarHistoricoPonto,
} from "./db.js";

const CATEGORIAS = ["Televisões","Terminais","Impressoras","Tablets","Carregadores"];
const STATUS_LISTA = ["Disponível","Em rota","Em conserto"];
const ICONES = {"Televisões":"📺","Terminais":"🖥️","Impressoras":"🖨️","Tablets":"📱","Carregadores":"🔌"};
const MINIMO_CATEGORIA = 5;
const STATUS_CFG = {
  "Disponível": {cor:"status-disponivel"},
  "Em rota":    {cor:"status-em-rota"},
  "Em conserto":{cor:"status-conserto"},
};
const TIPOS_MOV = [
  {id:"ponto",     label:"Enviar para Ponto",   icone:"📍",novoStatus:"Em rota",     exigePonto:true },
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
};

const PALAVRAS_MAIUSCULAS=["LG","POS","USB","USB-C","TV","LED","LCD","OLED","QLED","HP","IBM","CPU","GPS","HD","SSD","RAM","HDMI","VGA","PC","65W","45W","20W","4K","8K"];
function padronizarNome(t){
  if(!t)return"";
  return t.trim().replace(/\s+/g," ").split(" ").map(p=>{
    const u=p.toUpperCase();
    if(PALAVRAS_MAIUSCULAS.includes(u))return u;
    if(p.includes("-"))return p.split("-").map(x=>PALAVRAS_MAIUSCULAS.includes(x.toUpperCase())?x.toUpperCase():x.charAt(0).toUpperCase()+x.slice(1).toLowerCase()).join("-");
    return p.charAt(0).toUpperCase()+p.slice(1).toLowerCase();
  }).join(" ");
}

const PREFIXO_CAT={"Televisões":"TV","Terminais":"TRM","Impressoras":"IMP","Tablets":"TAB","Carregadores":"CAR"};
function gerarPatrimonio(cat,itens){
  const pref=PREFIXO_CAT[cat]||"EQP";
  const nums=itens.filter(i=>i.categoria===cat&&i.patrimonio).map(i=>{const m=i.patrimonio.match(/(\d+)$/);return m?parseInt(m[1]):0;});
  const prox=nums.length>0?Math.max(...nums)+1:1;
  return`${pref}-${String(prox).padStart(3,"0")}`;
}

const formVazio={nome:"",categoria:CATEGORIAS[0],quantidade:1,status:"Disponível",minimo:5,observacao:"",localizacao:"",responsavel:"",patrimonio:"",dataCadastro:""};
const movVazio={tipoId:"ponto",ponto:"",responsavel:"",observacao:""};
const agora=()=>new Date().toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});
const hoje=()=>new Date().toISOString().slice(0,10);

const Auth={ deslogar:async()=>{ await supabase.auth.signOut(); } };

function validarItem(f){
  if(!f.nome.trim())       return"Nome do equipamento é obrigatório.";
  if(!f.categoria)         return"Categoria é obrigatória.";
  if(!f.status)            return"Status é obrigatório.";
  if(!f.patrimonio.trim()) return"Código / Patrimônio é obrigatório.";
  return null;
}
function validarMov(mov,tipo){
  if(tipo.exigePonto&&!mov.ponto)return"Selecione o ponto de destino.";
  return null;
}

function exportarEquipamentosExcel(itens){
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
  await gerarRelatorioPDF({
    titulo:"Relatório de Equipamentos",
    descricao:"Inventário operacional e localização atual dos equipamentos",
    nomeArquivo:`stock-on_equipamentos_${hoje()}.pdf`,
    total:itens.length,
    colunas:["Patrimônio","Equipamento","Categoria","Status","Ponto / Localização","Responsável"],
    linhas:itens.map(i=>[i.patrimonio||"-",i.nome,i.categoria,i.status,i.localizacao||"Sem ponto",i.responsavel||"-"]),
  });
}

function exportarHistoricoExcel(historico){
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
  await gerarRelatorioPDF({
    titulo:"Histórico de Equipamentos",
    descricao:"Rastreabilidade de cadastros e movimentações operacionais",
    nomeArquivo:`stock-on_historico_equipamentos_${hoje()}.pdf`,
    total:historico.length,
    colunas:["Tipo","Equipamento","Categoria","Responsável","Detalhe","Data"],
    linhas:historico.map(h=>[HIST_CFG[h.tipo]?.label||h.tipo,h.itemNome,h.categoria,h.responsavel||"-",h.observacao||"-",h.data]),
  });
}

function RelatoriosPage({ itens, pontos }) {
  const gerentes = [...new Set(pontos.map(p=>p.gerente).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  const [gerenteSelecionado, setGerenteSelecionado] = useState("");
  const gerente = gerentes.includes(gerenteSelecionado) ? gerenteSelecionado : gerentes[0]||"";
  const disponiveis = itens.filter(i=>i.status==="Disponível");
  const pontosGerente = pontos.filter(p=>p.gerente===gerente);
  const locaisGerente = new Set(pontosGerente.map(p=>p.nomeFantasia));
  const equipamentosGerente = itens.filter(i=>locaisGerente.has(i.localizacao));
  const formatarValor = valor => Number(valor||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
  const linhasEquipamentos = lista => lista.map(i=>[
    i.patrimonio||"-", i.nome, i.categoria, i.status, i.localizacao||"Sem ponto", i.responsavel||"-",
  ]);
  const linhasPontos = lista => lista.map(p=>[
    p.nomeFantasia, p.nomeDono, p.gerente,
    itens.filter(i=>i.localizacao===p.nomeFantasia).length,
    p.possuiDespesa==="sim"?"Sim":"Não",
    p.possuiDespesa==="sim"?formatarValor(p.valorDespesa):"-",
  ]);

  async function gerarCompleto() {
    await gerarRelatorioPDF({
      titulo:"Relatório Geral",
      descricao:"Visão completa da operação, equipamentos e pontos cadastrados",
      nomeArquivo:`stock-on_relatorio_geral_${hoje()}.pdf`,
      total:itens.length+pontos.length,
      secoes:[
        {
          titulo:"Resumo operacional",
          colunas:["Indicador","Quantidade"],
          linhas:[
            ["Equipamentos cadastrados", itens.length],
            ["Equipamentos disponíveis", disponiveis.length],
            ["Equipamentos em rota", itens.filter(i=>i.status==="Em rota").length],
            ["Equipamentos em conserto", itens.filter(i=>i.status==="Em conserto").length],
            ["Pontos cadastrados", pontos.length],
          ],
        },
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
    await gerarRelatorioPDF({
      titulo:"Relatório de Pontos",
      descricao:"Pontos cadastrados, gerentes, equipamentos vinculados e despesas",
      nomeArquivo:`stock-on_pontos_${hoje()}.pdf`,
      total:pontos.length,
      colunas:["Nome Fantasia","Dono","Gerente","Equipamentos","Despesa","Valor"],
      linhas:linhasPontos(pontos),
    });
  }

  async function gerarDisponiveis() {
    await gerarRelatorioPDF({
      titulo:"Equipamentos Disponíveis",
      descricao:"Equipamentos prontos para serem enviados a um ponto",
      nomeArquivo:`stock-on_disponiveis_${hoje()}.pdf`,
      total:disponiveis.length,
      colunas:["Patrimônio","Equipamento","Categoria","Status","Ponto / Localização","Responsável"],
      linhas:linhasEquipamentos(disponiveis),
    });
  }

  async function gerarPorGerente() {
    await gerarRelatorioPDF({
      titulo:`Relatório do Gerente - ${gerente}`,
      descricao:"Pontos sob responsabilidade e equipamentos atualmente vinculados",
      nomeArquivo:`stock-on_gerente_${gerente.toLowerCase().replace(/\s+/g,"-")}_${hoje()}.pdf`,
      total:pontosGerente.length+equipamentosGerente.length,
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

  return(
    <div className="relatorios-painel">
      <section className="relatorios-intro">
        <div>
          <span className="dash-kicker">Exportação rápida</span>
          <h2>Escolha o relatório que precisa enviar</h2>
          <p>Todos os documentos saem em PDF com a identidade Stock-ON e os dados atualizados do sistema.</p>
        </div>
        <div className="relatorios-resumo">
          <strong>{itens.length}</strong><small>equipamentos</small>
          <strong>{pontos.length}</strong><small>pontos</small>
        </div>
      </section>

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
      </section>
    </div>
  );
}

// ── Login ─────────────────────────────────────────────────────────────────────
function TelaLogin({onLogin}){
  const [email,setEmail]=useState("");
  const [senha,setSenha]=useState("");
  const [erro,setErro]=useState("");
  const [visivel,setVisivel]=useState(false);
  const [carregando,setCarregando]=useState(false);

  async function tentar(e){
    e.preventDefault();setCarregando(true);setErro("");
    const {error}=await supabase.auth.signInWithPassword({email,password:senha});
    setCarregando(false);
    if(error){setErro("Email ou senha incorretos.");setSenha("");}
    else{onLogin();}
  }
  return(
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo"><img src={logo} alt="Stock-ON" className="login-logo-img"/></div>
        <div className="login-titulo">Acesso Restrito</div>
        <div className="login-subtitulo">Entre com suas credenciais para continuar</div>
        <form className="login-form" onSubmit={tentar}>
          {erro&&<div className="login-erro">🔒 {erro}</div>}
          <div className="campo"><label>Email</label><input type="email" placeholder="seu@email.com" value={email} onChange={e=>setEmail(e.target.value)} autoFocus/></div>
          <div className="campo"><label>Senha</label>
            <div className="input-senha-wrapper">
              <input type={visivel?"text":"password"} placeholder="Digite sua senha" value={senha} onChange={e=>setSenha(e.target.value)}/>
              <button type="button" className="btn-ver-senha" onClick={()=>setVisivel(!visivel)}>{visivel?"🙈":"👁️"}</button>
            </div>
          </div>
          <button type="submit" className="btn-login" disabled={carregando||!email||!senha}>{carregando?"Entrando...":"Entrar →"}</button>
        </form>
        <div className="login-rodape">Stock-ON · Controle Inteligente de Equipamentos</div>
      </div>
    </div>
  );
}

// ── App principal ─────────────────────────────────────────────────────────────
export default function App(){
  const [logado,setLogado]=useState(false);
  const [verificando,setVerificando]=useState(true);

  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session}})=>{
      setLogado(!!session);setVerificando(false);
    });
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_,session)=>{
      setLogado(!!session);
    });
    return()=>subscription.unsubscribe();
  },[]);

  if(verificando)return null;
  if(!logado)return<TelaLogin onLogin={()=>setLogado(true)}/>;
  return<Sistema onLogout={async()=>{await Auth.deslogar();setLogado(false);}}/>;
}

// ── Sistema ───────────────────────────────────────────────────────────────────
function Sistema({onLogout}){
  const [itens,setItens]           =useState([]);
  const [historico,setHistorico]   =useState([]);
  const [pontos,setPontos]         =useState([]);
  const [carregando,setCarregando] =useState(true);
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
  const [alertaEstoqueAtivo,setAlertaEstoqueAtivo]=useState(false);
  const [temaClaro,setTemaClaro]   =useState(()=>{try{return localStorage.getItem("sc_tema")==="claro";}catch{return false;}});
  const [sidebarAberta,setSidebarAberta]=useState(false);

  useEffect(()=>{
    async function init(){
      setCarregando(true);
      const [eq,hist,pts]=await Promise.all([carregarEquipamentos(),carregarHistoricoEquipamentos(),carregarPontos()]);
      setItens(eq);setHistorico(hist);setPontos(pts);setCarregando(false);
    }
    init();
  },[]);

  function toggleTema(){const n=!temaClaro;setTemaClaro(n);try{localStorage.setItem("sc_tema",n?"claro":"escuro");}catch{}}
  function fecharSidebar(){setSidebarAberta(false);}
  function navegar(novaAba){setAba(novaAba);fecharSidebar();}

  const totalGeral     =itens.length;
  const totalDisponivel=itens.filter(i=>i.status==="Disponível").length;
  const totalEmRota    =itens.filter(i=>i.status==="Em rota").length;
  const totalConserto  =itens.filter(i=>i.status==="Em conserto").length;

  const alertas = CATEGORIAS.map(cat=>{
    const totalDisp=itens.filter(i=>i.categoria===cat&&i.status==="Disponível").length;
    return{categoria:cat,totalDisponivel:totalDisp,faltam:MINIMO_CATEGORIA-totalDisp};
  }).filter(a=>a.totalDisponivel<MINIMO_CATEGORIA);

  const porCategoria=CATEGORIAS.map(cat=>{
    const ci=itens.filter(i=>i.categoria===cat);
    const totalDisp=ci.filter(i=>i.status==="Disponível").length;
    return{categoria:cat,total:ci.length,qtdItens:ci.length,
      disponivel:totalDisp,
      emRota:ci.filter(i=>i.status==="Em rota").length,
      conserto:ci.filter(i=>i.status==="Em conserto").length,
      alertaBaixo:totalDisp<MINIMO_CATEGORIA,
    };
  });
  const pontosComEquipamentos=pontos.map(p=>({
    ...p,
    totalEquipamentos:itens.filter(i=>i.localizacao===p.nomeFantasia).length,
  })).filter(p=>p.totalEquipamentos>0).sort((a,b)=>b.totalEquipamentos-a.totalEquipamentos);
  const mensagemDoDia=getMensagemMotivacionalDoDia();

  const itensFiltrados=itens.filter(i=>{
    const mC=filtroCatEquip==="Todas"||i.categoria===filtroCatEquip;
    const mS=filtroSt==="Todos"||i.status===filtroSt;
    const q=busca.toLowerCase();
    const mB=!busca||[i.nome,i.patrimonio,i.responsavel,i.localizacao].some(f=>(f||"").toLowerCase().includes(q));
    return mC&&mS&&mB;
  });
  const histFiltrado=historico.filter(h=>{
    const mC=histFCat==="Todas"||h.categoria===histFCat;
    const mT=histFTipo==="Todos"||h.tipo===histFTipo;
    const q=histBusca.toLowerCase();
    const mB=!histBusca||[h.itemNome,h.responsavel,h.observacao].some(f=>(f||"").toLowerCase().includes(q));
    return mC&&mT&&mB;
  });

  function abrirNovo(){
    const cat=CATEGORIAS[0];
    setItemEdit(null);
    setForm({...formVazio,quantidade:1,dataCadastro:hoje(),patrimonio:gerarPatrimonio(cat,itens),minimo:5});
    setErroForm("");setModalForm(true);
  }
  function abrirEditar(i){setItemEdit(i);setForm({...i});setErroForm("");setModalForm(true);}
  function fecharForm(){setModalForm(false);}
  function abrirMov(item){setModalMov(item);setMov({...movVazio,ponto:item.localizacao||""});setErroMov("");}
  function fecharMov(){setModalMov(null);}

  async function salvarItem(){
    const localizacao=form.status==="Em rota"?form.localizacao:form.status==="Em conserto"?"Em conserto":"";
    const ff={...form,nome:padronizarNome(form.nome),quantidade:1,minimo:5,localizacao,dataCadastro:form.dataCadastro||hoje()};
    const erro=validarItem(ff);if(erro){setErroForm(erro);return;}
    if(ff.status==="Em rota"&&!ff.localizacao){setErroForm("Selecione o ponto onde este equipamento ficará.");return;}
    if(itemEdit){
      await salvarEquipamento({...ff,id:itemEdit.id});
      setItens(itens.map(i=>i.id===itemEdit.id?{...ff,id:itemEdit.id}:i));
      const d=[];
      if(itemEdit.status!==ff.status)d.push(`Status: ${itemEdit.status}→${ff.status}`);
      const h={id:Date.now(),tipo:"edicao",itemId:itemEdit.id,itemNome:ff.nome,categoria:ff.categoria,qtdAntes:itemEdit.quantidade,qtdDepois:ff.quantidade,responsavel:"—",observacao:d.length?d.join(" | "):"Dados atualizados",data:agora()};
      await adicionarHistoricoEquipamento(h);setHistorico(prev=>[h,...prev]);
    }else{
      const novoId=await salvarEquipamento(ff);
      setItens(prev=>[...prev,{...ff,id:novoId}]);
      const h={id:Date.now(),tipo:"cadastro",itemId:novoId,itemNome:ff.nome,categoria:ff.categoria,qtdAntes:0,qtdDepois:1,responsavel:"—",observacao:`Patrimônio: ${ff.patrimonio}`,data:agora()};
      await adicionarHistoricoEquipamento(h);setHistorico(prev=>[h,...prev]);
    }
    fecharForm();
  }

  async function salvarPontoRapido(ponto){
    const novoId=await salvarPonto(ponto);
    if(!novoId){setErroForm("Não foi possível cadastrar o ponto. Tente novamente.");return;}
    const novoPonto={...ponto,id:novoId};
    setPontos(prev=>[...prev,novoPonto]);
    setForm(prev=>({...prev,status:"Em rota",localizacao:novoPonto.nomeFantasia}));
    const h={id:Date.now(),tipo:"cadastro",nome:novoPonto.nomeFantasia,gerente:novoPonto.gerente,observacao:"Ponto cadastrado durante inclusão de equipamento",data:agora()};
    await adicionarHistoricoPonto(h);
    setModalPontoRapido(false);
  }

  async function excluir(id){
    const item=itens.find(i=>i.id===id);
    await excluirEquipamento(id);
    setItens(prev=>prev.filter(i=>i.id!==id));
    const h={id:Date.now(),tipo:"exclusao",itemId:id,itemNome:item.nome,categoria:item.categoria,qtdAntes:item.quantidade,qtdDepois:0,responsavel:"—",observacao:"Item removido",data:agora()};
    await adicionarHistoricoEquipamento(h);setHistorico(prev=>[h,...prev]);
    setExcluindo(null);
  }

  async function confirmarMov(){
    const tipo=TIPOS_MOV.find(t=>t.id===mov.tipoId);
    const erro=validarMov(mov,tipo);if(erro){setErroMov(erro);return;}
    const localizacao=tipo.id==="ponto"?mov.ponto:tipo.id==="conserto"?"Em conserto":"";
    const upd={...modalMov,quantidade:1,status:tipo.novoStatus,localizacao,responsavel:mov.responsavel||modalMov.responsavel};
    await salvarEquipamento(upd);
    setItens(prev=>prev.map(i=>i.id===modalMov.id?upd:i));
    const detalhe=tipo.id==="ponto"?`Destino: ${mov.ponto}`:tipo.label;
    const h={id:Date.now(),tipo:tipo.id,itemId:modalMov.id,itemNome:modalMov.nome,categoria:modalMov.categoria,qtdAntes:1,qtdDepois:1,responsavel:mov.responsavel||"—",observacao:[detalhe,mov.observacao].filter(Boolean).join(" | "),data:agora()};
    await adicionarHistoricoEquipamento(h);setHistorico(prev=>[h,...prev]);
    fecharMov();
  }

  async function limparHistorico(){
    if(!window.confirm("Limpar todo o histórico?"))return;
    await limparHistoricoEquipamentos();setHistorico([]);
  }

  const tipoMovSel=TIPOS_MOV.find(t=>t.id===mov.tipoId);
  const ABAS_EQUIP=[
    {id:"lista",label:`📦 Todos (${itens.length})`},
    {id:"resumo",label:"📊 Resumo por Status"},
    {id:"historico",label:`📋 Histórico (${historico.length})`},
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

  return(
    <div className={`app${temaClaro?" tema-claro":""}`}>
      <div className={`sidebar-overlay ${sidebarAberta?"ativo":""}`} onClick={fecharSidebar}/>

      <aside className={`sidebar ${sidebarAberta?"aberta":""}`}>
        <div className="sidebar-logo">
          <img src={temaClaro?logoLight:logo} alt="Stock-ON" className="logo-sidebar-emblem"/>
        </div>
        <nav className="sidebar-nav">
          <span className="nav-section-label">Principal</span>
          <button className={`nav-item ${aba==="dashboard"?"active":""}`} onClick={()=>navegar("dashboard")}><span>📊</span> Dashboard</button>
          <button className={`nav-item ${aba==="itens"?"active":""}`}     onClick={()=>navegar("itens")}><span>📦</span> Equipamentos</button>
          <button className={`nav-item ${aba==="pontos"?"active":""}`}    onClick={()=>navegar("pontos")}><span>📍</span> Pontos</button>
          <button className={`nav-item ${aba==="relatorios"?"active":""}`} onClick={()=>navegar("relatorios")}><span>📄</span> Relatórios</button>
          <button className={`nav-item ${aba==="historico"?"active":""}`} onClick={()=>navegar("historico")}>
            <span>📋</span> Histórico
            {historico.length>0&&<span className="nav-badge">{historico.length>99?"99+":historico.length}</span>}
          </button>
        </nav>
        <div className="sidebar-footer">
          {alertas.length>0&&(
            <button className="sidebar-alerta sidebar-alerta-btn" onClick={()=>{setAlertaEstoqueAtivo(true);navegar("itens");setAbaEquip("lista");setFiltroSt("Todos");setFiltroCatEquip("Todas");setBusca("");}}>
              ⚠️ {alertas.length} categoria{alertas.length>1?"s":""} em alerta
              <span className="sidebar-alerta-arrow">→</span>
            </button>
          )}
          <button className="btn-tema" onClick={toggleTema}>
            <span>{temaClaro?"☀️ Tema Claro":"🌙 Tema Escuro"}</span>
            <div className={`tema-toggle ${temaClaro?"ativo":""}`}/>
          </button>
          <button className="btn-logout" onClick={()=>setConfirmLogout(true)}>🚪 Sair do sistema</button>
          <div className="sidebar-version">Stock-ON v1.0 · Supabase ☁️</div>
        </div>
      </aside>

      <main className="main">
        {aba==="dashboard"&&(<>
          <header className="topbar">
            <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
              <button className="btn-hamburguer" onClick={()=>setSidebarAberta(!sidebarAberta)}>☰</button>
              <div><h1 className="page-title">Dashboard</h1><p className="page-sub">Visão geral do estoque</p></div>
            </div>
            <img src={temaClaro?logoLight:logo} alt="Stock-ON" className="logo-topbar"/>
          </header>
          <div className="painel-dashboard">
            <section className="dash-hero">
              <div>
                <span className="dash-kicker">Controle operacional</span>
                <h2>Onde está cada equipamento?</h2>
                <p>Acompanhe disponibilidade, equipamentos em pontos e itens em conserto em uma única tela.</p>
                <div className="dash-biscoito"><span>Mensagem do dia</span><q>{mensagemDoDia}</q></div>
              </div>
              <div className="dash-acoes">
                <button className="btn-primario" onClick={()=>navegar("itens")}>Ver equipamentos</button>
                <button className="btn-secundario" onClick={()=>navegar("pontos")}>Ver pontos</button>
              </div>
            </section>

            <section className="dash-indicadores">
              <button className="dash-kpi kpi-total" onClick={()=>navegar("itens")}><span>Cadastrados</span><strong>{totalGeral}</strong><small>equipamentos</small></button>
              <button className="dash-kpi kpi-disponivel" onClick={()=>{navegar("itens");setFiltroSt("Disponível");}}><span>Disponíveis</span><strong>{totalDisponivel}</strong><small>prontos para envio</small></button>
              <button className="dash-kpi kpi-rota" onClick={()=>{navegar("itens");setFiltroSt("Em rota");}}><span>Em pontos</span><strong>{totalEmRota}</strong><small>em operação</small></button>
              <button className="dash-kpi kpi-conserto" onClick={()=>{navegar("itens");setFiltroSt("Em conserto");}}><span>Conserto</span><strong>{totalConserto}</strong><small>fora de operação</small></button>
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
                    ?<p className="dash-vazio">Tudo certo: nenhuma categoria está abaixo do mínimo.</p>
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

            {historico.length>0&&(
              <section className="secao dash-historico">
                <div className="tabela-header">
                  <h2 className="secao-titulo" style={{margin:0}}>Movimentações Recentes</h2>
                  <button className="btn-link" onClick={()=>navegar("historico")}>Ver todas →</button>
                </div>
                <div className="tabela-wrapper">
                  <table className="tabela">
                    <thead><tr><th>Movimento</th><th>Equipamento</th><th>Detalhe</th><th>Data</th></tr></thead>
                    <tbody>
                      {historico.slice(0,5).map(h=>{
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
              <button className="btn-secundario" onClick={()=>exportarEquipamentosExcel(itens)}>📊 Excel</button>
              <button className="btn-secundario" onClick={()=>exportarEquipamentosPDF(itens)}>📄 PDF</button>
              <button className="btn-primario" onClick={abrirNovo}>+ Novo</button>
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
                  <strong>{alertas.length} categoria{alertas.length>1?"s":""} com estoque abaixo do mínimo!</strong>
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
              <div className="tabela-header">
                <div className="equip-titulo">
                  <h2>Equipamentos cadastrados</h2>
                  <p>{itensFiltrados.length} resultado{itensFiltrados.length!==1?"s":""} encontrado{itensFiltrados.length!==1?"s":""}</p>
                </div>
                <div className="filtros equip-filtros">
                  <input className="input-busca" type="text" placeholder="Buscar nome, código ou ponto..." value={busca} onChange={e=>setBusca(e.target.value)}/>
                  <select className="select-filtro" value={filtroSt} onChange={e=>setFiltroSt(e.target.value)}>
                    <option value="Todos">Todos os status</option>
                    {STATUS_LISTA.map(s=><option key={s}>{s}</option>)}
                  </select>
                  {(filtroCatEquip!=="Todas"||filtroSt!=="Todos"||busca)&&(
                    <button className="btn-limpar" onClick={()=>{setFiltroCatEquip("Todas");setFiltroSt("Todos");setBusca("");}}>✕ Limpar</button>
                  )}
                </div>
              </div>
              <div className="tabela-wrapper equip-tabela">
                <table className="tabela tabela-equipamentos">
                  <thead><tr><th>Patrimônio</th><th>Equipamento</th><th>Categoria</th><th>Status</th><th>Ponto / Localização</th><th>Movimentar</th><th>⚙️</th></tr></thead>
                  <tbody>
                    {itensFiltrados.length===0?<tr><td colSpan={7} className="tabela-vazia">Nenhum item encontrado.</td></tr>
                    :itensFiltrados.map(item=>{
                      const totalCat=itens.filter(i=>i.categoria===item.categoria&&i.status==="Disponível").length;
                      const emAlerta=totalCat<MINIMO_CATEGORIA;
                      return(
                        <tr key={item.id} className={emAlerta?"row-alerta":""}>
                          <td className="td-minimo">{item.patrimonio||"—"}</td>
                          <td className="td-nome">{ICONES[item.categoria]} {item.nome}</td>
                          <td><span className="badge-cat">{item.categoria}</span></td>
                          <td><span className={`badge-status ${STATUS_CFG[item.status]?.cor||""}`}>{item.status}</span></td>
                          <td className="td-obs">{item.localizacao||"Sem ponto"}</td>
                          <td><button className="btn-movimentar" onClick={()=>abrirMov(item)}>📦 Movimentar</button></td>
                          <td className="td-acoes">
                            <button className="btn-editar" onClick={()=>abrirEditar(item)}>✏️</button>
                            <button className="btn-excluir" onClick={()=>setExcluindo(item.id)}>🗑️</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="equip-cards">
                {itensFiltrados.length===0?<div className="tabela-vazia">Nenhum item encontrado.</div>
                :itensFiltrados.map(item=>(
                  <article className="equip-card" key={item.id}>
                    <div className="equip-card-topo">
                      <div><span className="equip-codigo">{item.patrimonio||"—"}</span><h3>{ICONES[item.categoria]} {item.nome}</h3></div>
                      <span className={`badge-status ${STATUS_CFG[item.status]?.cor||""}`}>{item.status}</span>
                    </div>
                    <div className="equip-card-meta">
                      <span className="badge-cat">{item.categoria}</span>
                      <span>📍 {item.localizacao||"Sem ponto"}</span>
                    </div>
                    <div className="equip-card-acoes">
                      <button className="btn-movimentar" onClick={()=>abrirMov(item)}>📦 Movimentar</button>
                      <button className="btn-editar" onClick={()=>abrirEditar(item)} title="Editar">✏️ Editar</button>
                      <button className="btn-excluir" onClick={()=>setExcluindo(item.id)} title="Excluir">🗑️</button>
                    </div>
                  </article>
                ))}
              </div>
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
                  <div className="resumo-card resumo-conserto"><div className="resumo-num">{totalConserto}</div><div className="resumo-label">Em Conserto</div></div>
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
                        {c.conserto>0&& <div className="cat-st-linha cat-st-con"> <span>🔧 Conserto</span>  <strong>{c.conserto}</strong></div>}
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
                  <button className="btn-secundario" onClick={()=>exportarHistoricoExcel(historico)}>📊 Excel</button>
                  <button className="btn-secundario" onClick={()=>exportarHistoricoPDF(historico)}>📄 PDF</button>
                </div>
              </div>
              {historico.length===0
                ?<div className="hist-vazio"><div className="hist-vazio-icone">📋</div><div>Nenhuma movimentação registrada.</div></div>
                :<div className="tabela-wrapper">
                  <table className="tabela">
                    <thead><tr><th>Tipo</th><th>Equipamento</th><th>Categoria</th><th>Antes</th><th>Depois</th><th>Observação</th><th>Data</th></tr></thead>
                    <tbody>
                      {historico.map(h=>{
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
            <PointsPage equipamentos={itens} onPontosChange={setPontos} onEquipamentosChange={setItens}/>
          </>
        )}

        {aba==="relatorios"&&(<>
          <header className="topbar">
            <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
              <button className="btn-hamburguer" onClick={()=>setSidebarAberta(!sidebarAberta)}>☰</button>
              <div><h1 className="page-title">Relatórios</h1><p className="page-sub">Central de PDFs profissionais</p></div>
            </div>
          </header>
          <RelatoriosPage itens={itens} pontos={pontos}/>
        </>)}

        {aba==="historico"&&(<>
          <header className="topbar">
            <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
              <button className="btn-hamburguer" onClick={()=>setSidebarAberta(!sidebarAberta)}>☰</button>
              <div><h1 className="page-title">Histórico</h1><p className="page-sub">{historico.length} movimentação{historico.length!==1?"ões":""} registrada{historico.length!==1?"s":""}</p></div>
            </div>
            <div style={{display:"flex",gap:"8px"}}>
              {historico.length>0&&<>
                <button className="btn-secundario" onClick={()=>exportarHistoricoExcel(historico)}>📊 Excel</button>
                <button className="btn-secundario" onClick={()=>exportarHistoricoPDF(historico)}>📄 PDF</button>
              </>}
              {historico.length>0&&<button className="btn-danger-outline" onClick={limparHistorico}>🗑️ Limpar</button>}
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
        <div className="modal-overlay" onClick={fecharForm}>
          <div className="modal modal-largo" onClick={e=>e.stopPropagation()}>
            <div className="modal-header"><h3>{itemEdit?"Editar Equipamento":"Novo Equipamento"}</h3><button className="modal-fechar" onClick={fecharForm}>✕</button></div>
            <div className="modal-body">
              {erroForm&&<div className="erro-msg">⚠️ {erroForm}</div>}
              <div className="campos-duplos">
                <div className="campo"><label>Nome do Equipamento *</label>
                  <input type="text" placeholder='Ex: tv samsung 55' value={form.nome} onChange={e=>setForm({...form,nome:e.target.value})}/>
                  <span className="campo-hint">Formatado automaticamente ao salvar</span></div>
                <div className="campo"><label>Código / Patrimônio *</label>
                  <input type="text" placeholder="Ex: TV-001" value={form.patrimonio} onChange={e=>setForm({...form,patrimonio:e.target.value})}/>
                  {!itemEdit&&<span className="campo-hint">✨ Gerado automaticamente</span>}</div>
              </div>
              <div className="campos-duplos">
                <div className="campo"><label>Categoria *</label>
                  <select value={form.categoria} onChange={e=>{
                    const c=e.target.value;
                    setForm({...form,categoria:c,patrimonio:!itemEdit?gerarPatrimonio(c,itens):form.patrimonio});
                  }}>{CATEGORIAS.map(c=><option key={c}>{c}</option>)}</select></div>
                <div className="campo"><label>Status *</label>
                  <select value={form.status} onChange={e=>{
                    const status=e.target.value;
                    setForm({...form,status,localizacao:status==="Em rota"?form.localizacao:""});
                  }}>
                    {STATUS_LISTA.map(s=><option key={s}>{s}</option>)}
                  </select></div>
              </div>
              {form.status==="Em rota"&&(
                <div className="campo ponto-destino-form">
                  <label>Ponto onde ficará o equipamento *</label>
                  <div className="ponto-destino-linha">
                    <select value={form.localizacao} onChange={e=>setForm({...form,localizacao:e.target.value})}>
                      <option value="">Selecione um ponto...</option>
                      {pontos.map(p=><option key={p.id} value={p.nomeFantasia}>{p.nomeFantasia}</option>)}
                    </select>
                    <button type="button" className="btn-secundario" onClick={()=>setModalPontoRapido(true)}>+ Criar ponto agora</button>
                  </div>
                  <span className="campo-hint">Ao salvar, o equipamento já ficará vinculado ao ponto escolhido.</span>
                </div>
              )}
              <div className="campo-info-minimo">🔒 Alerta de estoque por categoria: <strong>menos de 5 equipamentos disponíveis</strong></div>
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
          equipamentos={[]}
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
                  {TIPOS_MOV.map(t=>(
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
                    {pontos.map(p=><option key={p.id} value={p.nomeFantasia}>{p.nomeFantasia}</option>)}
                  </select>
                  {pontos.length===0&&<span className="campo-hint">Cadastre um ponto antes de enviar o equipamento.</span>}
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

      {confirmLogout&&(
        <div className="modal-overlay" onClick={()=>setConfirmLogout(false)}>
          <div className="modal modal-pequeno" onClick={e=>e.stopPropagation()}>
            <div className="modal-header"><h3>Sair do Sistema</h3><button className="modal-fechar" onClick={()=>setConfirmLogout(false)}>✕</button></div>
            <div className="modal-body"><p style={{color:"#94a3b8",lineHeight:"1.6"}}>Tem certeza que deseja sair?</p></div>
            <div className="modal-footer"><button className="btn-secundario" onClick={()=>setConfirmLogout(false)}>Cancelar</button><button className="btn-danger" onClick={onLogout}>Sair</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
