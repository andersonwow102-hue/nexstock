import logo from "./assets/stock-on-dark.png";
import logoLight from "./assets/stock-on-light.png";
import { useState, useEffect } from "react";
import "./App.css";
import PointsPage from "./PointsPage.jsx";
import { supabase } from "./supabase.js";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  carregarEquipamentos, salvarEquipamento, excluirEquipamento,
  carregarHistoricoEquipamentos, adicionarHistoricoEquipamento, limparHistoricoEquipamentos,
} from "./db.js";

const CATEGORIAS = ["Televisões","Terminais","Impressoras","Tablets","Carregadores"];
const STATUS_LISTA = ["Disponível","Em uso","Velho","Com defeito","Em conserto","Descartado"];
const ICONES = {"Televisões":"📺","Terminais":"🖥️","Impressoras":"🖨️","Tablets":"📱","Carregadores":"🔌"};
const MINIMO_CATEGORIA = 5;
const STATUS_CFG = {
  "Disponível": {cor:"status-disponivel"},
  "Em uso":     {cor:"status-em-uso"},
  "Velho":      {cor:"status-velho"},
  "Com defeito":{cor:"status-defeito"},
  "Em conserto":{cor:"status-conserto"},
  "Descartado": {cor:"status-descartado"},
};
const TIPOS_MOV = [
  {id:"entrada",   label:"Entrada",            icone:"➕",alteraStatus:false,novoStatus:null,          alteraQtd:true, sentido:1 },
  {id:"saida",     label:"Saída",              icone:"➖",alteraStatus:false,novoStatus:null,          alteraQtd:true, sentido:-1},
  {id:"conserto",  label:"Enviar p/ Conserto", icone:"🔧",alteraStatus:true, novoStatus:"Em conserto", alteraQtd:false,sentido:0 },
  {id:"retorno",   label:"Retorno do Conserto",icone:"✅",alteraStatus:true, novoStatus:"Disponível",  alteraQtd:false,sentido:0 },
  {id:"defeito",   label:"Marcar Defeito",     icone:"❌",alteraStatus:true, novoStatus:"Com defeito", alteraQtd:false,sentido:0 },
  {id:"disponivel",label:"Disponibilizar",     icone:"🟢",alteraStatus:true, novoStatus:"Disponível",  alteraQtd:false,sentido:0 },
  {id:"baixa",     label:"Baixa / Descartar",  icone:"🗑️",alteraStatus:true, novoStatus:"Descartado",  alteraQtd:true, sentido:-1},
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
const movVazio={tipoId:"entrada",quantidade:1,responsavel:"",localizacao:"",observacao:""};
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
function validarMov(mov,item,tipo){
  if(tipo.alteraQtd&&mov.quantidade<1)return"Quantidade deve ser pelo menos 1.";
  if(tipo.sentido===-1&&mov.quantidade>item.quantidade)return`Saída (${mov.quantidade}) maior que estoque (${item.quantidade}).`;
  return null;
}

function exportarEquipamentosExcel(itens){
  const dados=itens.map(i=>({
    "Patrimônio":i.patrimonio||"—","Nome":i.nome,"Categoria":i.categoria,
    "Quantidade":i.quantidade,"Status":i.status,
    "Responsável":i.responsavel||"—","Localização":i.localizacao||"—",
    "Observação":i.observacao||"—","Data Cadastro":i.dataCadastro||"—",
  }));
  const ws=XLSX.utils.json_to_sheet(dados);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,"Equipamentos");
  XLSX.writeFile(wb,`equipamentos_${hoje()}.xlsx`);
}

function exportarEquipamentosPDF(itens){
  const doc=new jsPDF({orientation:"landscape"});
  doc.setFontSize(16);doc.text("Stock-ON — Relatório de Equipamentos",14,15);
  doc.setFontSize(10);doc.text(`Gerado em: ${agora()}   Total: ${itens.length} itens`,14,22);
  autoTable(doc,{startY:27,
    head:[["Patrimônio","Nome","Categoria","Qtd","Status","Responsável","Localização"]],
    body:itens.map(i=>[i.patrimonio||"—",i.nome,i.categoria,i.quantidade,i.status,i.responsavel||"—",i.localizacao||"—"]),
    styles:{fontSize:8},headStyles:{fillColor:[30,41,59]},
  });
  doc.save(`equipamentos_${hoje()}.pdf`);
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

function exportarHistoricoPDF(historico){
  const doc=new jsPDF({orientation:"landscape"});
  doc.setFontSize(16);doc.text("Stock-ON — Histórico de Equipamentos",14,15);
  doc.setFontSize(10);doc.text(`Gerado em: ${agora()}   Total: ${historico.length} registros`,14,22);
  autoTable(doc,{startY:27,
    head:[["Tipo","Equipamento","Categoria","Antes","Depois","Responsável","Observação","Data"]],
    body:historico.map(h=>[HIST_CFG[h.tipo]?.label||h.tipo,h.itemNome,h.categoria,h.qtdAntes,h.qtdDepois,h.responsavel||"—",h.observacao||"—",h.data]),
    styles:{fontSize:8},headStyles:{fillColor:[30,41,59]},
  });
  doc.save(`historico_equipamentos_${hoje()}.pdf`);
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
  const [carregando,setCarregando] =useState(true);
  const [aba,setAba]               =useState("dashboard");
  const [abaEquip,setAbaEquip]     =useState("lista");
  const [filtroCatEquip,setFiltroCatEquip]=useState("Todas");
  const [modalForm,setModalForm]   =useState(false);
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
      const [eq,hist]=await Promise.all([carregarEquipamentos(),carregarHistoricoEquipamentos()]);
      setItens(eq);setHistorico(hist);setCarregando(false);
    }
    init();
  },[]);

  function toggleTema(){const n=!temaClaro;setTemaClaro(n);try{localStorage.setItem("sc_tema",n?"claro":"escuro");}catch{}}
  function fecharSidebar(){setSidebarAberta(false);}
  function navegar(novaAba){setAba(novaAba);fecharSidebar();}

  const totalGeral     =itens.reduce((s,i)=>s+i.quantidade,0);
  const totalDisponivel=itens.filter(i=>i.status==="Disponível").reduce((s,i)=>s+i.quantidade,0);
  const totalEmUso     =itens.filter(i=>i.status==="Em uso").reduce((s,i)=>s+i.quantidade,0);
  const totalDefeito   =itens.filter(i=>i.status==="Com defeito").reduce((s,i)=>s+i.quantidade,0);
  const totalConserto  =itens.filter(i=>i.status==="Em conserto").reduce((s,i)=>s+i.quantidade,0);

  const alertas = CATEGORIAS.map(cat=>{
    const totalDisp=itens.filter(i=>i.categoria===cat&&i.status==="Disponível").reduce((s,i)=>s+i.quantidade,0);
    return{categoria:cat,totalDisponivel:totalDisp,faltam:MINIMO_CATEGORIA-totalDisp};
  }).filter(a=>a.totalDisponivel<MINIMO_CATEGORIA);

  const porCategoria=CATEGORIAS.map(cat=>{
    const ci=itens.filter(i=>i.categoria===cat);
    const totalDisp=ci.filter(i=>i.status==="Disponível").reduce((s,i)=>s+i.quantidade,0);
    return{categoria:cat,total:ci.reduce((s,i)=>s+i.quantidade,0),qtdItens:ci.length,
      disponivel:totalDisp,
      emUso:ci.filter(i=>i.status==="Em uso").reduce((s,i)=>s+i.quantidade,0),
      defeito:ci.filter(i=>i.status==="Com defeito").reduce((s,i)=>s+i.quantidade,0),
      conserto:ci.filter(i=>i.status==="Em conserto").reduce((s,i)=>s+i.quantidade,0),
      velho:ci.filter(i=>i.status==="Velho").reduce((s,i)=>s+i.quantidade,0),
      alertaBaixo:totalDisp<MINIMO_CATEGORIA,
    };
  });

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
  function abrirMov(item){setModalMov(item);setMov({...movVazio});setErroMov("");}
  function fecharMov(){setModalMov(null);}

  async function salvarItem(){
    const ff={...form,nome:padronizarNome(form.nome),quantidade:itemEdit?form.quantidade:1,minimo:5,dataCadastro:form.dataCadastro||hoje()};
    const erro=validarItem(ff);if(erro){setErroForm(erro);return;}
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
    const erro=validarMov(mov,modalMov,tipo);if(erro){setErroMov(erro);return;}
    const qtdAntes=modalMov.quantidade;
    let qtdDepois=qtdAntes,novoStatus=modalMov.status;
    if(tipo.alteraQtd)    qtdDepois=qtdAntes+(tipo.sentido*mov.quantidade);
    if(tipo.alteraStatus) novoStatus=tipo.novoStatus;
    const upd={...modalMov,quantidade:qtdDepois,status:novoStatus};
    await salvarEquipamento(upd);
    setItens(prev=>prev.map(i=>i.id===modalMov.id?upd:i));
    const h={id:Date.now(),tipo:tipo.id,itemId:modalMov.id,itemNome:modalMov.nome,categoria:modalMov.categoria,qtdAntes,qtdDepois,responsavel:mov.responsavel||"—",observacao:mov.observacao||tipo.label,data:agora()};
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
            <img src={temaClaro?logoLight:logo} alt="Stock-ON" style={{height:"70px",width:"auto",objectFit:"contain",filter:"drop-shadow(0 0 20px rgba(59,111,212,0.4))",animation:"pulse-logo 2s ease-in-out infinite"}}/>
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
          <div className="dashboard-grid">
            <div className="dashboard-col">
              <section className="secao">
                <h2 className="secao-titulo">Resumo Geral</h2>
                <div className="resumo-grid">
                  <div className="resumo-card resumo-total"><div className="resumo-num">{totalGeral}</div><div className="resumo-label">Total Unidades</div></div>
                  <div className="resumo-card resumo-disponivel clickable" onClick={()=>{navegar("itens");setFiltroSt("Disponível");}}><div className="resumo-num">{totalDisponivel}</div><div className="resumo-label">Disponíveis</div></div>
                  <div className="resumo-card resumo-uso clickable" onClick={()=>{navegar("itens");setFiltroSt("Em uso");}}><div className="resumo-num">{totalEmUso}</div><div className="resumo-label">Em Uso</div></div>
                  <div className="resumo-card resumo-defeito clickable" onClick={()=>{navegar("itens");setFiltroSt("Com defeito");}}><div className="resumo-num">{totalDefeito}</div><div className="resumo-label">Com Defeito</div></div>
                  <div className="resumo-card resumo-conserto clickable" onClick={()=>{navegar("itens");setFiltroSt("Em conserto");}}><div className="resumo-num">{totalConserto}</div><div className="resumo-label">Em Conserto</div></div>
                  <div className={`resumo-card ${alertas.length>0?"resumo-alerta-ativo":""}`}><div className="resumo-num">{alertas.length}</div><div className="resumo-label">Alertas</div></div>
                </div>
              </section>
              {alertas.length>0&&(
                <section className="secao">
                  <h2 className="secao-titulo">⚠️ Estoque Baixo por Categoria</h2>
                  <div className="alertas-section">
                    {alertas.map(a=>(
                      <div key={a.categoria} className="alerta-card">
                        <span className="alerta-icon">{ICONES[a.categoria]}</span>
                        <div className="alerta-info">
                          <div className="alerta-nome"><strong>{a.categoria}</strong><span className="badge-cat">Categoria</span></div>
                          <div className="alerta-detalhe">
                            Disponível: <strong style={{color:"var(--vermelho)"}}>{a.totalDisponivel}</strong>
                            &nbsp;·&nbsp;Mínimo: {MINIMO_CATEGORIA}
                            &nbsp;·&nbsp;Faltam: <strong style={{color:"var(--vermelho)"}}>{a.faltam}</strong> un.
                          </div>
                        </div>
                        <div className="alerta-acoes">
                          <button className="btn-alerta-editar" onClick={()=>{navegar("itens");setFiltroCatEquip(a.categoria);setAbaEquip("lista");}}>🔍 Ver</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
            <div className="dashboard-col">
              <section className="secao">
                <h2 className="secao-titulo">Por Categoria</h2>
                <div className="cat-detalhe-grid">
                  {porCategoria.map(c=>(
                    <div key={c.categoria} className={`cat-detalhe-card ${c.alertaBaixo?"cat-detalhe-alerta":""}`}
                      onClick={()=>{navegar("itens");setFiltroCatEquip(c.categoria);setAbaEquip("lista");}}>
                      <div className="cat-detalhe-header">
                        <span className="cat-detalhe-icone">{ICONES[c.categoria]}</span>
                        <div style={{flex:1,minWidth:0}}>
                          <div className="cat-detalhe-nome">{c.categoria}</div>
                          <div className="cat-detalhe-registros">{c.qtdItens} registro{c.qtdItens!==1?"s":""}</div>
                          {c.alertaBaixo&&<div className="cat-detalhe-badge-alerta">⚠ Estoque Baixo</div>}
                        </div>
                        <div className="cat-detalhe-total">
                          <span className="cat-total-num">{c.total}</span>
                          <span className="cat-total-label">unidades</span>
                        </div>
                      </div>
                      <div className="cat-detalhe-status">
                        {c.disponivel>0&&<div className="cat-st-linha cat-st-disp"><span>✅ Disponível</span><strong>{c.disponivel}</strong></div>}
                        {c.emUso>0&&    <div className="cat-st-linha cat-st-uso"> <span>🔵 Em uso</span>   <strong>{c.emUso}</strong></div>}
                        {c.defeito>0&&  <div className="cat-st-linha cat-st-def"> <span>❌ Defeito</span>   <strong>{c.defeito}</strong></div>}
                        {c.conserto>0&& <div className="cat-st-linha cat-st-con"> <span>🔧 Conserto</span>  <strong>{c.conserto}</strong></div>}
                        {c.velho>0&&    <div className="cat-st-linha cat-st-vel"> <span>⚪ Velho</span>     <strong>{c.velho}</strong></div>}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
            {historico.length>0&&(
              <div className="dashboard-full">
                <section className="secao">
                  <div className="tabela-header">
                    <h2 className="secao-titulo" style={{margin:0}}>Últimas Movimentações</h2>
                    <button className="btn-link" onClick={()=>navegar("historico")}>Ver todas →</button>
                  </div>
                  <div className="tabela-wrapper">
                    <table className="tabela">
                      <thead><tr><th>Tipo</th><th>Equipamento</th><th>Categoria</th><th>Antes</th><th>Depois</th><th>Data</th></tr></thead>
                      <tbody>
                        {historico.slice(0,8).map(h=>{
                          const cfg=HIST_CFG[h.tipo]||{cor:"",icone:"•",label:h.tipo};
                          return(<tr key={h.id}>
                            <td><span className={`badge-hist ${cfg.cor}`}>{cfg.icone} {cfg.label}</span></td>
                            <td className="td-nome">{ICONES[h.categoria]} {h.itemNome}</td>
                            <td><span className="badge-cat">{h.categoria}</span></td>
                            <td className="td-minimo">{h.qtdAntes}</td>
                            <td className="td-minimo">{h.qtdDepois}</td>
                            <td className="td-minimo" style={{whiteSpace:"nowrap"}}>{h.data}</td>
                          </tr>);
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
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
          <div className="points-abas">
            {ABAS_EQUIP.map(a=>(
              <button key={a.id} className={`points-aba-btn ${abaEquip===a.id?"points-aba-ativa":""}`} onClick={()=>setAbaEquip(a.id)}>{a.label}</button>
            ))}
            <div style={{marginLeft:"auto",display:"flex",gap:"6px",flexWrap:"wrap"}}>
              {["Todas",...CATEGORIAS].map(cat=>(
                <button key={cat} className={`points-aba-btn ${filtroCatEquip===cat?"points-aba-ativa":""}`}
                  style={{minWidth:"auto",padding:"8px 10px",fontSize:"11.5px"}}
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
            <section className="secao">
              <div className="tabela-header">
                <h2 className="secao-titulo" style={{margin:0}}>Itens <span className="badge-count">{itensFiltrados.length}</span></h2>
                <div className="filtros">
                  <input className="input-busca" type="text" placeholder="🔍 Nome, patrimônio..." value={busca} onChange={e=>setBusca(e.target.value)}/>
                  <select className="select-filtro" value={filtroSt} onChange={e=>setFiltroSt(e.target.value)}>
                    <option value="Todos">Todos os status</option>
                    {STATUS_LISTA.map(s=><option key={s}>{s}</option>)}
                  </select>
                  {(filtroCatEquip!=="Todas"||filtroSt!=="Todos"||busca)&&(
                    <button className="btn-limpar" onClick={()=>{setFiltroCatEquip("Todas");setFiltroSt("Todos");setBusca("");}}>✕ Limpar</button>
                  )}
                </div>
              </div>
              <div className="tabela-wrapper">
                <table className="tabela">
                  <thead><tr><th>Patrimônio</th><th>Equipamento</th><th>Categoria</th><th>Qtd</th><th>Status</th><th>Movimentar</th><th>⚙️</th></tr></thead>
                  <tbody>
                    {itensFiltrados.length===0?<tr><td colSpan={7} className="tabela-vazia">Nenhum item encontrado.</td></tr>
                    :itensFiltrados.map(item=>{
                      const totalCat=itens.filter(i=>i.categoria===item.categoria&&i.status==="Disponível").reduce((s,i)=>s+i.quantidade,0);
                      const emAlerta=totalCat<MINIMO_CATEGORIA;
                      return(
                        <tr key={item.id} className={emAlerta?"row-alerta":""}>
                          <td className="td-minimo">{item.patrimonio||"—"}</td>
                          <td className="td-nome">{ICONES[item.categoria]} {item.nome}</td>
                          <td><span className="badge-cat">{item.categoria}</span></td>
                          <td className={emAlerta?"qtd-baixa":"qtd-normal"}>{item.quantidade}</td>
                          <td><span className={`badge-status ${STATUS_CFG[item.status]?.cor||""}`}>{item.status}</span></td>
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
            </section>
          )}

          {abaEquip==="resumo"&&(
            <div style={{display:"flex",flexDirection:"column",gap:"20px"}}>
              <section className="secao">
                <h2 className="secao-titulo">Resumo Geral</h2>
                <div className="resumo-grid">
                  <div className="resumo-card resumo-total"><div className="resumo-num">{totalGeral}</div><div className="resumo-label">Total Unidades</div></div>
                  <div className="resumo-card resumo-disponivel"><div className="resumo-num">{totalDisponivel}</div><div className="resumo-label">Disponíveis</div></div>
                  <div className="resumo-card resumo-uso"><div className="resumo-num">{totalEmUso}</div><div className="resumo-label">Em Uso</div></div>
                  <div className="resumo-card resumo-defeito"><div className="resumo-num">{totalDefeito}</div><div className="resumo-label">Com Defeito</div></div>
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
                          <span className="cat-total-label">unidades</span>
                        </div>
                      </div>
                      <div className="cat-detalhe-status">
                        {c.disponivel>0&&<div className="cat-st-linha cat-st-disp"><span>✅ Disponível</span><strong>{c.disponivel}</strong></div>}
                        {c.emUso>0&&    <div className="cat-st-linha cat-st-uso"> <span>🔵 Em uso</span>   <strong>{c.emUso}</strong></div>}
                        {c.defeito>0&&  <div className="cat-st-linha cat-st-def"> <span>❌ Defeito</span>   <strong>{c.defeito}</strong></div>}
                        {c.conserto>0&& <div className="cat-st-linha cat-st-con"> <span>🔧 Conserto</span>  <strong>{c.conserto}</strong></div>}
                        {c.velho>0&&    <div className="cat-st-linha cat-st-vel"> <span>⚪ Velho</span>     <strong>{c.velho}</strong></div>}
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
            <PointsPage/>
          </>
        )}

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
                  <select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>
                    {STATUS_LISTA.map(s=><option key={s}>{s}</option>)}
                  </select></div>
              </div>
              {itemEdit&&(
                <div className="campo" style={{maxWidth:"50%"}}>
                  <label>Quantidade</label>
                  <input type="number" min="0" value={form.quantidade} onChange={e=>setForm({...form,quantidade:parseInt(e.target.value)||0})}/>
                </div>
              )}
              {!itemEdit&&(
                <div className="campo-info-minimo">📦 Cada equipamento é cadastrado com <strong>1 unidade</strong>. Use movimentações para ajustar.</div>
              )}
              <div className="campo-info-minimo">🔒 Estoque mínimo por categoria: <strong>5 unidades disponíveis</strong></div>
            </div>
            <div className="modal-footer">
              <button className="btn-secundario" onClick={fecharForm}>Cancelar</button>
              <button className="btn-primario" onClick={salvarItem}>{itemEdit?"Salvar Alterações":"Adicionar"}</button>
            </div>
          </div>
        </div>
      )}

      {modalMov&&(
        <div className="modal-overlay" onClick={fecharMov}>
          <div className="modal modal-largo" onClick={e=>e.stopPropagation()}>
            <div className="modal-header"><h3>📦 Movimentação de Estoque</h3><button className="modal-fechar" onClick={fecharMov}>✕</button></div>
            <div className="modal-body">
              <div className="mov-item-info">
                <div className="mov-item-nome">{ICONES[modalMov.categoria]} {modalMov.nome}</div>
                <div className="mov-item-meta">
                  <span className="badge-cat">{modalMov.categoria}</span>
                  <span className={`badge-status ${STATUS_CFG[modalMov.status]?.cor||""}`}>{modalMov.status}</span>
                  <span className="mov-item-qtd">Estoque: <strong style={{color:"var(--verde)"}}>{modalMov.quantidade}</strong></span>
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
              {tipoMovSel?.alteraQtd&&(
                <div className="campo">
                  <label>Quantidade *</label>
                  <input type="number" min="1" value={mov.quantidade} onChange={e=>setMov({...mov,quantidade:parseInt(e.target.value)||1})}/>
                  {tipoMovSel.sentido===-1&&<span className="campo-hint">Após saída: <strong>{Math.max(0,modalMov.quantidade-mov.quantidade)}</strong> unidades</span>}
                  {tipoMovSel.sentido===1 &&<span className="campo-hint">Após entrada: <strong>{modalMov.quantidade+mov.quantidade}</strong> unidades</span>}
                </div>
              )}
              {tipoMovSel?.alteraStatus&&<div className="mov-status-resultado">Novo status: <span className={`badge-status ${STATUS_CFG[tipoMovSel.novoStatus]?.cor||""}`}>{tipoMovSel.novoStatus}</span></div>}
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
