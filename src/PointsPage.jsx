import { useState, useEffect } from "react";
import {
  GERENTES, GERENTE_CORES, MODALIDADES, ROTAS, ROTAS_POR_GERENTE,
  formatarReais, parseMoeda, agoraStr, pontoFormVazio, validarPonto,
  gerenteDaRota, rotaCanonica, rotaPermitidaAoPerfil, rotasPermitidasDoPerfil,
} from "./pointsData.js";
import {
  carregarPontos, salvarPonto, excluirPonto, carregarHistoricoPontos, adicionarHistoricoPonto, salvarEquipamento,
  carregarDespesasMensais, salvarDespesaMensal, excluirDespesaMensal,
  carregarSolicitacoesModalidade, criarSolicitacaoModalidade, concluirSolicitacaoModalidade,
} from "./db.js";

const partesDataLocal=()=>{
  const d = new Date();
  const ano = d.getFullYear();
  const mes = String(d.getMonth()+1).padStart(2,"0");
  const dia = String(d.getDate()).padStart(2,"0");
  return { ano, mes, dia };
};
const hoje=()=>{
  const { ano, mes, dia } = partesDataLocal();
  return `${ano}-${mes}-${dia}`;
};
const competenciaAtual=()=>{
  const { ano, mes } = partesDataLocal();
  return `${ano}-${mes}`;
};
const diaAtual=()=>Number(partesDataLocal().dia);
const mesLabel=data=>new Date(`${String(data||"").slice(0,7)}-02T00:00:00`).toLocaleDateString("pt-BR",{month:"2-digit",year:"numeric"});
const valorDespesa=d=>Number(d.valorReal || d.valorPrevisto || 0);
const gerentePodeLancarDespesas=()=>diaAtual()>=10;
const slugArquivo=t=>String(t||"geral").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"");

const MODALIDADE_COR = {
  "Viapix":             "badge-mod-viapix",
  "90 da Sorte":        "badge-mod-90sorte",
  "Play Bet":           "badge-mod-playbet",
  "Máquina de Brindes": "badge-mod-brindes",
  "Jogo do Bicho":      "badge-mod-bicho",
  "Lotobanca":          "badge-mod-lotobanca",
};

function BadgeModalidade({ m }) {
  return <span className={`badge-modalidade ${MODALIDADE_COR[m]||"badge-mod-viapix"}`}>{m}</span>;
}

export function BadgeGerente({ gerente }) {
  const rota = rotaCanonica(gerente);
  const c = GERENTE_CORES[rota] || { bg:"rgba(107,122,153,0.15)", color:"#6b7a99", border:"rgba(107,122,153,0.3)" };
  return (
    <span style={{ display:"inline-block", background:c.bg, color:c.color, border:`1px solid ${c.border}`,
      fontSize:"11px", fontWeight:700, padding:"3px 10px", borderRadius:"20px", whiteSpace:"nowrap" }}>
      {rota || gerente}
    </span>
  );
}

// ── Exportar Excel Pontos ─────────────────────────────────────────────────────
async function gerarPDF(configuracao) {
  const { gerarRelatorioPDF } = await import("./pdfReports.js");
  return gerarRelatorioPDF(configuracao);
}

async function exportarPontosExcel(pontos){
  const XLSX = await import("xlsx");
  const dados = pontos.map(p=>({
    "Nome Fantasia":  p.nomeFantasia,
    "Nome do Dono":   p.nomeDono,
    "Telefone":       p.telefone,
    "Rota":           rotaCanonica(p.gerente),
    "Modalidades":    p.modalidades.join(", "),
    "Valor Despesa":  p.possuiDespesa==="sim"?p.valorDespesa:"",
    "Observação":     p.observacao||"—",
  }));
  const ws = XLSX.utils.json_to_sheet(dados);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Pontos");
  XLSX.writeFile(wb, `pontos_${hoje()}.xlsx`);
}

// ── Exportar PDF Pontos ───────────────────────────────────────────────────────
async function exportarPontosPDF(pontos){
  const ordenados=[...pontos].sort((a,b)=>
    (a.gerente||"").localeCompare(b.gerente||"", "pt-BR") ||
    a.nomeFantasia.localeCompare(b.nomeFantasia, "pt-BR")
  );
  const totalDespesas=pontos.reduce((total,p)=>total+(p.possuiDespesa==="sim"?Number(p.valorDespesa||0):0),0);
  await gerarPDF({
    titulo:"Relatório de Pontos",
    descricao:"Estabelecimentos cadastrados, responsáveis e despesas",
    nomeArquivo:`stock-on_pontos_${hoje()}.pdf`,
    total:pontos.length,
    resumo:[
      {label:"Pontos",valor:pontos.length},
      {label:"Com despesa",valor:pontos.filter(p=>p.possuiDespesa==="sim").length,destaque:[201,125,0]},
      {label:"Sem despesa",valor:pontos.filter(p=>p.possuiDespesa!=="sim").length,destaque:[5,150,82]},
      {label:"Despesa total",valor:formatarReais(totalDespesas),destaque:[201,125,0]},
    ],
    colunas:["Nome Fantasia","Dono","Telefone","Rota","Modalidades","Valor"],
    linhas:ordenados.map(p=>[
      p.nomeFantasia,
      p.nomeDono,
      p.telefone,
      rotaCanonica(p.gerente),
      p.modalidades.join(", "),
      p.possuiDespesa==="sim"?formatarReais(p.valorDespesa):"",
    ]),
  });
}

// ── Exportar Excel Histórico Pontos ───────────────────────────────────────────
async function exportarHistoricoPontosExcel(historico){
  const XLSX = await import("xlsx");
  const dados = historico.map(h=>({
    "Tipo":          h.tipo==="cadastro"?"Cadastro":h.tipo==="edicao"?"Edição":"Exclusão",
    "Nome Fantasia": h.nome,
    "Gerente":       h.gerente,
    "Observação":    h.observacao||"—",
    "Data":          h.data,
  }));
  const ws = XLSX.utils.json_to_sheet(dados);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Histórico Pontos");
  XLSX.writeFile(wb, `historico_pontos_${hoje()}.xlsx`);
}

// ── Exportar PDF Histórico Pontos ─────────────────────────────────────────────
async function exportarHistoricoPontosPDF(historico){
  await gerarPDF({
    titulo:"Histórico de Pontos",
    descricao:"Registro de cadastros, alterações e exclusões de pontos",
    nomeArquivo:`stock-on_historico_pontos_${hoje()}.pdf`,
    total:historico.length,
    resumo:[
      {label:"Movimentações",valor:historico.length},
      {label:"Cadastros",valor:historico.filter(h=>h.tipo==="cadastro").length,destaque:[5,150,82]},
      {label:"Edições",valor:historico.filter(h=>h.tipo==="edicao").length,destaque:[37,99,235]},
      {label:"Exclusões",valor:historico.filter(h=>h.tipo==="exclusao").length,destaque:[201,48,48]},
    ],
    colunas:["Tipo","Nome Fantasia","Gerente","Observação","Data"],
    linhas:historico.map(h=>[
      h.tipo==="cadastro"?"Cadastro":h.tipo==="edicao"?"Edição":"Exclusão",
      h.nome,
      h.gerente,
      h.observacao||"-",
      h.data,
    ]),
  });
}

async function exportarHistoricoDespesasPDF({ linhas, competencia, busca }) {
  const total = linhas.reduce((s,d)=>s+d.valor,0);
  const pontos = new Set(linhas.map(d=>d.pontoNome)).size;
  const gerentes = new Set(linhas.map(d=>d.gerente)).size;
  const colunas = ["Ponto","Rota","Descrição","Valor","Mês","Data","Observação"];
  const grupos = [...new Set(linhas.map(d=>d.gerente || "Sem gerente"))].sort((a,b)=>a.localeCompare(b,"pt-BR"));
  await gerarPDF({
    titulo:"Histórico de Despesas",
    descricao:`Conferência mensal dos lançamentos por ponto e gerente${busca?` | Busca: ${busca}`:""}`,
    nomeArquivo:`stock-on_historico-despesas_${competencia||"todos"}_${slugArquivo(busca||"geral")}.pdf`,
    total:linhas.length,
    resumo:[
      {label:"Total",valor:formatarReais(total),destaque:[222,147,0]},
      {label:"Lançamentos",valor:linhas.length},
      {label:"Pontos",valor:pontos},
      {label:"Rotas",valor:gerentes},
      {label:"Mês",valor:competencia?mesLabel(`${competencia}-01`):"Todos"},
    ],
    secoes:grupos.map(gerente=>{
      const lista = linhas.filter(d=>(d.gerente || "Sem gerente")===gerente);
      const subtotal = lista.reduce((s,d)=>s+d.valor,0);
      return {
        titulo:`${gerente} | ${formatarReais(subtotal)} | ${lista.length} lançamento${lista.length!==1?"s":""}`,
        colunas,
        linhas:lista.map(d=>[
          d.pontoNome,
          d.gerente || "-",
          d.descricao || "-",
          formatarReais(d.valor),
          mesLabel(d.competencia),
          d.criadoEm ? new Date(d.criadoEm).toLocaleDateString("pt-BR") : "-",
          d.observacao || "-",
        ]),
      };
    }),
  });
}

// ─── Máscaras ─────────────────────────────────────────────────────────────────
function mascaraTelefone(v) {
  const d = v.replace(/\D/g,"").slice(0,11);
  if (d.length<=2)  return `(${d}`;
  if (d.length<=6)  return `(${d.slice(0,2)}) ${d.slice(2)}`;
  if (d.length<=10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
}
function mascaraMoeda(v) {
  const d = v.replace(/\D/g,"");
  if (!d) return "";
  return (parseInt(d,10)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
}

// ─── Modal Formulário ─────────────────────────────────────────────────────────
export function PointFormModal({ ponto, pontos=[], equipamentos=[], perfilAtual, onSalvar, onFechar, mostrarEquipamentos=true }) {
  const gerenteDoPerfil = perfilAtual?.perfil==="gerente" ? (perfilAtual.gerenteNome || perfilAtual.nome || "") : "";
  const rotasDoPerfil = gerenteDoPerfil ? rotasPermitidasDoPerfil(perfilAtual) : [];
  const primeiraRotaPermitida = rotasDoPerfil[0] || "";
  const [form, setForm] = useState(ponto ? {...ponto,
    gerente: rotaCanonica(ponto.gerente),
    possuiDespesa: "nao",
    valorDespesa: ""
  } : {...pontoFormVazio, gerente: primeiraRotaPermitida, possuiDespesa: "nao", valorDespesa: ""});
  const [gerenteSelecionado, setGerenteSelecionado] = useState(() => gerenteDaRota(ponto?.gerente) || gerenteDoPerfil || "");
  const [equipamentosSelecionados, setEquipamentosSelecionados] = useState(
    equipamentos.filter(i=>ponto&&i.localizacao===ponto.nomeFantasia).map(i=>i.id)
  );
  const [erro, setErro] = useState("");
  const gerentesFormulario = gerenteDoPerfil ? [gerenteDoPerfil] : GERENTES;
  const rotasFormulario = gerenteDoPerfil ? rotasDoPerfil : (ROTAS_POR_GERENTE[gerenteSelecionado] || []);
  const equipamentosDisponiveis = equipamentos.filter(item=>
    !item.localizacao || (ponto && item.localizacao===ponto.nomeFantasia)
  );

  function toggleModalidade(m) {
    setForm({...form, modalidades: form.modalidades.includes(m)
      ? form.modalidades.filter(x=>x!==m)
      : [...form.modalidades, m]});
  }

  async function salvar() {
    const e = validarPonto(form);
    if (e) { setErro(e); return; }
    const nome=form.nomeFantasia.trim().toLowerCase();
    if(pontos.some(p=>p.id!==ponto?.id&&p.nomeFantasia.trim().toLowerCase()===nome)){
      setErro("Já existe um ponto com este nome. Use um nome diferente para não confundir a localização dos equipamentos.");
      return;
    }
    setErro("");
    try {
      await onSalvar({...form, possuiDespesa: "nao", valorDespesa: 0}, equipamentosSelecionados);
    } catch (err) {
      const msg = String(err?.message || "").toLowerCase();
      if (msg.includes("duplicate") || msg.includes("unique") || msg.includes("pontos_nome_fantasia")) {
        setErro("Já existe um ponto com este nome em outra rota. Use um nome diferente para evitar troca de rota ou localização errada.");
        return;
      }
      setErro(`Não foi possível salvar o ponto. Motivo: ${err?.message || "verifique os dados e tente novamente."}`);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal modal-largo" onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <h3>{ponto?"Editar Ponto":"Novo Ponto"}</h3>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>
        <div className="modal-body">
          {erro&&<div className="erro-msg">⚠️ {erro}</div>}
          <div className="campos-duplos">
            <div className="campo"><label>Nome Fantasia *</label>
              <input type="text" placeholder="Ex: Bar do Zé" value={form.nomeFantasia} onChange={e=>setForm({...form,nomeFantasia:e.target.value})}/></div>
            <div className="campo"><label>Nome do Dono *</label>
              <input type="text" placeholder="Ex: José Silva" value={form.nomeDono} onChange={e=>setForm({...form,nomeDono:e.target.value})}/></div>
          </div>
          <div className="campos-duplos">
            <div className="campo"><label>Telefone *</label>
              <input type="text" placeholder="(00) 00000-0000" value={form.telefone} onChange={e=>setForm({...form,telefone:mascaraTelefone(e.target.value)})}/></div>
            <div className="campo"><label>Gerente *</label>
              <select value={gerenteSelecionado} disabled={Boolean(gerenteDoPerfil)} onChange={e=>{setGerenteSelecionado(e.target.value);setForm({...form,gerente:""});}}>
                <option value="">Selecione o gerente...</option>
                {gerentesFormulario.map(g=><option key={g} value={g}>{g}</option>)}
              </select></div>
          </div>
          <div className="campo">
            <label>Rota *</label>
            <select value={form.gerente} disabled={!gerenteSelecionado} onChange={e=>setForm({...form,gerente:e.target.value})}>
              <option value="">{gerenteSelecionado ? "Selecione a rota..." : "Selecione um gerente primeiro..."}</option>
              {rotasFormulario.map(rota=><option key={rota} value={rota}>{rota}</option>)}
            </select>
            {gerenteSelecionado && rotasFormulario.length===0&&(
              <span className="campo-hint">Este gerente ainda não possui rota cadastrada.</span>
            )}
          </div>
          <div className="campo">
            <label>Modalidades * (selecione uma ou mais)</label>
            <div className="modalidades-grid">
              {MODALIDADES.map(m=>(
                <label key={m} className={`modalidade-item ${form.modalidades.includes(m)?"modalidade-ativa":""}`}>
                  <input type="checkbox" checked={form.modalidades.includes(m)} onChange={()=>toggleModalidade(m)}/>{m}
                </label>
              ))}
            </div>
          </div>
          {mostrarEquipamentos&&(
            <div className="campo">
              <label>Equipamentos disponíveis para este ponto</label>
              {equipamentosDisponiveis.length===0
                ?<span className="campo-hint">Nenhum equipamento livre. Para trocar de ponto, use a aba Movimentar.</span>
                :<div className="modalidades-grid">
                  {equipamentosDisponiveis.map(item=>(
                    <label key={item.id} className={`modalidade-item ${equipamentosSelecionados.includes(item.id)?"modalidade-ativa":""}`}>
                      <input type="checkbox" checked={equipamentosSelecionados.includes(item.id)} onChange={()=>setEquipamentosSelecionados(prev=>prev.includes(item.id)?prev.filter(id=>id!==item.id):[...prev,item.id])}/>
                      {item.patrimonio||item.nome}
                    </label>
                  ))}
                </div>}
              <span className="campo-hint">Equipamentos que já estão em outro ponto só podem ser transferidos em Movimentar.</span>
            </div>
          )}
          <div className="campo"><label>Observação</label>
            <textarea placeholder="Informações adicionais..." rows={2} value={form.observacao} onChange={e=>setForm({...form,observacao:e.target.value})}/></div>
        </div>
        <div className="modal-footer">
          <button className="btn-secundario" onClick={onFechar}>Cancelar</button>
          <button className="btn-primario" onClick={salvar}>{ponto?"Salvar Alterações":"Adicionar Ponto"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal Despesas ───────────────────────────────────────────────────────────
function PointExpensesModal({ pontos, onFechar }) {
  const comDespesa = [...pontos].filter(p=>p.possuiDespesa==="sim"&&p.valorDespesa>0).sort((a,b)=>b.valorDespesa-a.valorDespesa);
  const total = comDespesa.reduce((s,p)=>s+p.valorDespesa,0);
  return (
    <div className="modal-overlay" onClick={onFechar}>
      <div className="modal modal-largo" onClick={e=>e.stopPropagation()}>
        <div className="modal-header"><h3>💰 Despesas dos Pontos</h3><button className="modal-fechar" onClick={onFechar}>✕</button></div>
        <div className="modal-body">
          <div className="despesas-total-banner">Total Geral: <strong>{formatarReais(total)}</strong></div>
          <div className="tabela-wrapper">
            <table className="tabela">
              <thead><tr><th>Nome Fantasia</th><th>Dono</th><th>Rota</th><th>Telefone</th><th>Valor</th></tr></thead>
              <tbody>
                {comDespesa.length===0
                  ?<tr><td colSpan={5} className="tabela-vazia">Nenhum ponto com despesa.</td></tr>
                  :comDespesa.map(p=>(
                    <tr key={p.id}>
                      <td className="td-nome">🏪 {p.nomeFantasia}</td>
                      <td className="td-obs">{p.nomeDono}</td>
                      <td><BadgeGerente gerente={p.gerente}/></td>
                      <td className="td-obs">{p.telefone}</td>
                      <td style={{color:"var(--verde)",fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>{formatarReais(p.valorDespesa)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="modal-footer"><button className="btn-primario" onClick={onFechar}>Fechar</button></div>
      </div>
    </div>
  );
}

// ─── ABA: Visão Geral ─────────────────────────────────────────────────────────
function AbaVisaoGeral({ pontos, onVerDespesas, onNovoClick, onAbrirPontos, podeEditar }) {
  const totalPontos   = pontos.length;
  const comDespesa    = pontos.filter(p=>p.possuiDespesa==="sim").length;
  const semDespesa    = pontos.filter(p=>p.possuiDespesa==="nao").length;
  const totalDespesas = pontos.reduce((s,p)=>s+(p.valorDespesa||0),0);

  return (
    <>
      <section className="secao">
        <h2 className="secao-titulo">Resumo Geral</h2>
        <div className="ponto-resumo-grid">
          <button className="resumo-card resumo-total clickable" onClick={()=>onAbrirPontos("todos")}><div className="resumo-num">{totalPontos}</div><div className="resumo-label">Total de Pontos</div><small>Ver todos</small></button>
          <button className="resumo-card resumo-disponivel clickable" onClick={()=>onAbrirPontos("nao")}><div className="resumo-num">{semDespesa}</div><div className="resumo-label">Sem Despesa</div><small>Mostrar lista</small></button>
          <button className="resumo-card resumo-defeito clickable" onClick={()=>onAbrirPontos("sim")}><div className="resumo-num">{comDespesa}</div><div className="resumo-label">Com Despesa</div><small>Mostrar lista</small></button>
          <button className="resumo-card resumo-conserto ponto-despesa-card clickable" onClick={onVerDespesas}>
            <div className="resumo-num" style={{fontSize:"18px"}}>{formatarReais(totalDespesas)}</div>
            <div className="resumo-label">💰 Total Despesas</div><small>Ver detalhes</small>
          </button>
        </div>
      </section>
      {pontos.length===0&&(
        <div className="hist-vazio">
          <div className="hist-vazio-icone">📍</div>
          <div>Nenhum ponto cadastrado ainda.</div>
          {podeEditar&&<button className="btn-primario" style={{marginTop:"8px"}} onClick={onNovoClick}>+ Cadastrar primeiro ponto</button>}
        </div>
      )}
    </>
  );
}

// ─── ABA: Pontos Cadastrados ───────────────────────────────────────────────────
function AbaPontos({ pontos, equipamentos, busca, onLimparBusca, filtroDespesa, onLimparFiltro, onEditar, onExcluir, onDespesas, onSolicitarModalidade, onExportExcel, onExportPDF, podeEditar, podeEditarDespesas, podeSolicitarModalidade }) {
  const [filtroGerente, setFiltroGerente] = useState("Todos");
  const [pagina, setPagina] = useState(1);
  const POR_PAGINA=10;
  const filtrados = pontos.filter(p=>{
    const q=busca.toLowerCase();
    const vinculados=equipamentos.filter(i=>i.localizacao===p.nomeFantasia);
    const mB=!busca||[p.nomeFantasia,p.nomeDono,p.telefone,p.gerente,rotaCanonica(p.gerente),gerenteDaRota(p.gerente),...vinculados.map(i=>i.patrimonio)].some(f=>(f||"").toLowerCase().includes(q));
    const mD=filtroDespesa==="todos"||p.possuiDespesa===filtroDespesa;
    return mB&&mD&&(filtroGerente==="Todos"||rotaCanonica(p.gerente)===filtroGerente);
  });
  const ordenados=[...filtrados].sort((a,b)=>rotaCanonica(a.gerente).localeCompare(rotaCanonica(b.gerente),"pt-BR")||a.nomeFantasia.localeCompare(b.nomeFantasia,"pt-BR"));
  const totalPaginas=Math.max(1,Math.ceil(ordenados.length/POR_PAGINA));
  const paginaAtual=Math.min(pagina,totalPaginas);
  const visiveis=ordenados.slice((paginaAtual-1)*POR_PAGINA,paginaAtual*POR_PAGINA);
  useEffect(()=>setPagina(1),[busca,filtroGerente,filtroDespesa]);
  const tituloFiltro=filtroDespesa==="sim"?"Com despesa":filtroDespesa==="nao"?"Sem despesa":"Todos";

  return (
    <section className="secao pontos-lista">
      <div className="tabela-header">
        <h2 className="secao-titulo" style={{margin:0}}>Pontos: {tituloFiltro} <span className="badge-count">{filtrados.length}</span></h2>
        <div className="filtros">
          <select className="select-filtro" value={filtroGerente} onChange={e=>setFiltroGerente(e.target.value)}>
            <option value="Todos">Todas as rotas</option>
            {ROTAS.map(r=><option key={r} value={r}>{r}</option>)}
          </select>
          {(busca||filtroGerente!=="Todos"||filtroDespesa!=="todos")&&<button className="btn-limpar" onClick={()=>{onLimparBusca();setFiltroGerente("Todos");onLimparFiltro();}}>✕ Limpar</button>}
          <button className="btn-secundario" onClick={onExportExcel}>📊 Excel</button>
          <button className="btn-secundario" onClick={onExportPDF}>📄 PDF</button>
        </div>
      </div>
      <div className="tabela-wrapper pontos-tabela">
        <table className="tabela">
          <thead><tr><th>Nome Fantasia</th><th>Equipamentos</th><th>Dono</th><th>Telefone</th><th>Rota</th><th>Modalidades</th><th>Valor da despesa</th><th>⚙️</th></tr></thead>
          <tbody>
            {filtrados.length===0
              ?<tr><td colSpan={8} className="tabela-vazia">Nenhum ponto encontrado.</td></tr>
              :visiveis.map(p=>{
                const vinculados=equipamentos.filter(i=>i.localizacao===p.nomeFantasia);
                return <tr key={p.id}>
                  <td className="td-nome">🏪 {p.nomeFantasia}</td>
                  <td>
                    {vinculados.length===0
                      ?<span className="td-obs">Nenhum</span>
                      :<div className="equipamentos-ponto">{vinculados.map(i=><span key={i.id} className="badge-cat">{i.patrimonio||i.nome}</span>)}</div>}
                  </td>
                  <td className="td-obs">{p.nomeDono}</td>
                  <td className="td-obs">{p.telefone}</td>
                  <td><BadgeGerente gerente={p.gerente}/></td>
                  <td><div className="modalidades-badges">{p.modalidades.map(m=><BadgeModalidade key={m} m={m}/>)}</div></td>
                  <td className={p.possuiDespesa==="sim"?"qtd-baixa":"td-minimo"}>{p.possuiDespesa==="sim"?formatarReais(p.valorDespesa):""}</td>
                  <td className="td-acoes">
                    {podeSolicitarModalidade&&<button className="btn-editar btn-solicitar-modalidade" onClick={()=>onSolicitarModalidade(p)} title="Solicitar bloqueio ou desbloqueio">🚨</button>}
                    {podeEditarDespesas&&<button className="btn-editar" onClick={()=>onDespesas(p)} title="Despesas mensais">💰</button>}
                    {podeEditar&&<button className="btn-editar" onClick={()=>onEditar(p)} title="Editar">✏️</button>}
                    {podeEditar&&<button className="btn-excluir" onClick={()=>onExcluir(p.id)} title="Excluir">🗑️</button>}
                  </td>
                </tr>;
              })}
          </tbody>
        </table>
      </div>
      <div className="ponto-cards">
        {filtrados.length===0?<div className="tabela-vazia">Nenhum ponto encontrado.</div>
        :visiveis.map(p=>{
          const vinculados=equipamentos.filter(i=>i.localizacao===p.nomeFantasia);
          return(
            <article className="ponto-card" key={p.id}>
              <div className="ponto-card-topo">
                <div><h3>🏪 {p.nomeFantasia}</h3><p>{p.nomeDono} · {p.telefone}</p></div>
                {p.possuiDespesa==="sim"&&<span className="badge-status status-defeito">Despesa lançada</span>}
              </div>
              <div className="ponto-card-linha"><span>Rota</span><BadgeGerente gerente={p.gerente}/></div>
              <div className="ponto-card-linha"><span>Modalidades</span><div className="modalidades-badges">{p.modalidades.map(m=><BadgeModalidade key={m} m={m}/>)}</div></div>
              <div className="ponto-card-linha"><span>Equipamentos</span><div className="equipamentos-ponto">{vinculados.length? vinculados.map(i=><span key={i.id} className="badge-cat">{i.patrimonio||i.nome}</span>) : <span className="td-obs">Nenhum</span>}</div></div>
              {p.possuiDespesa==="sim"&&<div className="ponto-card-valor">{formatarReais(p.valorDespesa)}</div>}
              <div className="ponto-card-acoes">
                {podeSolicitarModalidade&&<button className="btn-editar btn-solicitar-modalidade" onClick={()=>onSolicitarModalidade(p)}>🚨 Solicitar ação</button>}
                {podeEditarDespesas&&<button className="btn-editar" onClick={()=>onDespesas(p)}>💰 Despesas</button>}
                {podeEditar&&<button className="btn-editar" onClick={()=>onEditar(p)}>✏️ Editar</button>}
                {podeEditar&&<button className="btn-excluir" onClick={()=>onExcluir(p.id)}>🗑️ Excluir</button>}
              </div>
            </article>
          );
        })}
      </div>
      {filtrados.length>POR_PAGINA&&(
        <div className="paginacao">
          <button className="btn-secundario" disabled={paginaAtual===1} onClick={()=>setPagina(p=>p-1)}>Anterior</button>
          <span>Página <strong>{paginaAtual}</strong> de <strong>{totalPaginas}</strong> · {filtrados.length} pontos</span>
          <button className="btn-secundario" disabled={paginaAtual===totalPaginas} onClick={()=>setPagina(p=>p+1)}>Próxima</button>
        </div>
      )}
    </section>
  );
}

function PointMonthlyExpensesModal({ ponto, despesas = [], onSalvar, onRemover, onFechar, podeEditar, perfilAtual }) {
  const gerente = perfilAtual?.perfil === "gerente";
  const [competencia, setCompetencia] = useState(competenciaAtual());
  const criarLinha = () => ({ id:null, descricao:"", valor:"", observacao:"" });
  const [linhas, setLinhas] = useState([]);
  const [erro, setErro] = useState("");
  const mesAtual = competenciaAtual();
  const gerenteNoMesAtual = !gerente || competencia === mesAtual;
  const gerenteDentroPrazo = !gerente || gerentePodeLancarDespesas();
  const podeEditarAgora = podeEditar && gerenteNoMesAtual && gerenteDentroPrazo;
  const despesasMes = despesas.filter(d => Number(d.pontoId) === Number(ponto.id) && String(d.competencia || "").slice(0,7) === competencia);

  useEffect(() => {
    const base = despesas
      .filter(d => Number(d.pontoId) === Number(ponto.id) && String(d.competencia || "").slice(0,7) === competencia)
      .map(d => ({
        id:d.id, descricao:d.descricao || "",
        valor:valorDespesa(d) ? mascaraMoeda(String(Math.round(valorDespesa(d)*100))) : "",
        observacao:d.observacao || "",
      }));
    setLinhas(base.length ? [...base, criarLinha()] : [criarLinha(), criarLinha(), criarLinha(), criarLinha()]);
    setErro("");
  }, [ponto.id, competencia, despesas]);

  const totalMes = linhas.reduce((s,l)=>s+parseMoeda(l.valor),0);

  function alterarLinha(index, campo, valor) {
    setLinhas(prev => prev.map((linha,i)=>i===index?{...linha,[campo]:valor}:linha));
  }

  async function removerLinha(index) {
    if (!podeEditarAgora) return;
    const linha = linhas[index];
    if (linha.id && !window.confirm("Remover esta despesa mensal?")) return;
    if (linha.id) await onRemover?.(linha.id);
    setLinhas(prev => {
      const novas = prev.filter((_,i)=>i!==index);
      return novas.length ? novas : [criarLinha()];
    });
  }

  async function salvar() {
    if (gerente && competencia !== mesAtual) {
      setErro("Gerente só pode lançar despesas do mês atual. Meses anteriores ficam disponíveis apenas para conferência do administrador.");
      return;
    }
    if (gerente && !gerenteDentroPrazo) {
      setErro("As despesas do mês só podem ser lançadas do dia 10 até o último dia do mês.");
      return;
    }
    const validas = linhas
      .map(l => ({...l, descricao:l.descricao.trim(), observacao:String(l.observacao||"").trim(), valorNumero:parseMoeda(l.valor)}))
      .filter(l => l.descricao || l.valorNumero>0 || l.observacao);
    const erroLinha = validas.find(l => !l.descricao || l.valorNumero<=0);
    if (erroLinha) { setErro("Preencha descrição e valor somente nas linhas que deseja salvar. Linhas vazias podem ficar em branco."); return; }
    try {
      await onSalvar(ponto, competencia, validas.map(l => ({
        ...l,
        tipo:"fixa",
        pontoId:ponto.id,
        competencia:`${competencia}-01`,
        valorPrevisto:l.valorNumero,
        valorReal:l.valorNumero,
      })));
    } catch (e) {
      setErro(e?.message || "Não foi possível salvar as despesas. Tente novamente.");
    }
  }

  return (
    <div className="modal-overlay" onClick={onFechar}>
      <div className="modal modal-extra-largo" onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <h3>💰 Despesas mensais · {ponto.nomeFantasia}</h3>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>
        <div className="modal-body">
          {erro&&<div className="erro-msg">⚠️ {erro}</div>}
          {gerente&&(
            <div className={podeEditarAgora?"acessos-nota":"erro-msg"}>
              {podeEditarAgora
                ? "Você está lançando as despesas do mês atual. O envio fica liberado do dia 10 até o último dia do mês."
                : "Despesa bloqueada para gerente: só é possível lançar o mês atual entre o dia 10 e o último dia do mês."}
            </div>
          )}
          <div className="despesa-planilha-topo">
            <div className="campo despesa-mes-campo">
              <label>📅 Mês de referência</label>
              <input type="month" value={competencia} min={gerente?mesAtual:undefined} max={gerente?mesAtual:undefined} disabled={gerente} onChange={e=>setCompetencia(e.target.value)}/>
              <small>{gerente?"Gerente lança somente o mês atual.":"Clique no campo para escolher o mês."}</small>
            </div>
            <div className="despesas-total-banner">Total do mês: <strong>{formatarReais(totalMes)}</strong></div>
          </div>
          <div className="tabela-wrapper despesa-planilha">
            <table className="tabela">
              <thead><tr><th>Descrição</th><th>Valor</th><th>Observação</th><th></th></tr></thead>
              <tbody>
                {linhas.map((linha,index)=>(
                  <tr key={`${linha.id||"nova"}-${index}`}>
                    <td><input value={linha.descricao} disabled={!podeEditarAgora} placeholder="Ex: Internet" onChange={e=>alterarLinha(index,"descricao",e.target.value)}/></td>
                    <td><input value={linha.valor} disabled={!podeEditarAgora} placeholder="R$ 0,00" onChange={e=>alterarLinha(index,"valor",mascaraMoeda(e.target.value))}/></td>
                    <td><input value={linha.observacao} disabled={!podeEditarAgora} placeholder="Opcional" onChange={e=>alterarLinha(index,"observacao",e.target.value)}/></td>
                    <td>{podeEditarAgora&&<button className="btn-remover-linha" title="Remover linha" onClick={()=>removerLinha(index)}>×</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {podeEditarAgora&&<button className="btn-secundario" onClick={()=>setLinhas(prev=>[...prev,criarLinha()])}>+ Adicionar linha</button>}
          {despesasMes.length===0&&<p className="acessos-nota">Nenhuma despesa lançada para este ponto neste mês. Preencha como uma planilha e salve.</p>}
        </div>
        <div className="modal-footer">
          <button className="btn-secundario" onClick={onFechar}>Fechar</button>
          {podeEditarAgora&&<button className="btn-primario" onClick={salvar}>Salvar despesas</button>}
        </div>
      </div>
    </div>
  );
}

function SolicitacaoModalidadeModal({ ponto, perfilAtual, onSalvar, onFechar }) {
  const modalidades = ponto.modalidades?.length ? ponto.modalidades : MODALIDADES;
  const [acao, setAcao] = useState("bloquear");
  const [modalidade, setModalidade] = useState(modalidades[0] || "");
  const [detalhe, setDetalhe] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function salvar() {
    setErro("");
    if (!modalidade) { setErro("Selecione a modalidade."); return; }
    if (!detalhe.trim()) { setErro("Informe o cambista, usuário ou motivo da solicitação."); return; }
    setEnviando(true);
    try {
      await onSalvar({ ponto, perfilAtual, modalidade, acao, detalhe });
      onFechar();
    } catch (e) {
      setErro(e?.message || "Não foi possível enviar a solicitação.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onFechar}>
      <div className="modal modal-pequeno solicitacao-modalidade-modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <h3>🚨 Solicitar ação na modalidade</h3>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>
        <div className="modal-body">
          {erro&&<div className="erro-msg">⚠️ {erro}</div>}
          <div className="solicitacao-ponto-resumo">
            <small>Ponto</small>
            <strong>{ponto.nomeFantasia}</strong>
            <span>{rotaCanonica(ponto.gerente)}</span>
          </div>
          <div className="campo">
            <label>Ação solicitada *</label>
            <select value={acao} onChange={e=>setAcao(e.target.value)}>
              <option value="bloquear">Bloquear</option>
              <option value="desbloquear">Desbloquear</option>
            </select>
          </div>
          <div className="campo">
            <label>Modalidade *</label>
            <select value={modalidade} onChange={e=>setModalidade(e.target.value)}>
              {modalidades.map(m=><option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="campo">
            <label>Detalhe para o admin *</label>
            <textarea
              rows={4}
              value={detalhe}
              onChange={e=>setDetalhe(e.target.value)}
              placeholder="Ex: desbloquear o cambista João no Viapix / usuário 123..."
            />
          </div>
          <p className="acessos-nota">
            Essa solicitação não altera o ponto nem a modalidade no Stock-ON. Ela apenas avisa o administrador para fazer a ação na plataforma externa.
          </p>
        </div>
        <div className="modal-footer">
          <button className="btn-secundario" onClick={onFechar}>Cancelar</button>
          <button className="btn-primario" disabled={enviando} onClick={salvar}>{enviando?"Enviando...":"Enviar solicitação"}</button>
        </div>
      </div>
    </div>
  );
}

function formatarDataSolicitacao(data) {
  if (!data) return "-";
  const dt = new Date(data);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" });
}

function PainelSolicitacoesModalidade({ solicitacoes, onConcluir }) {
  const pendentes = solicitacoes.filter(s=>s.status==="pendente");
  if (!pendentes.length) return null;
  return (
    <section className="solicitacoes-modalidade-panel">
      <div className="solicitacoes-panel-head">
        <div>
          <span>Central de avisos</span>
          <h3>Solicitações de bloqueio/desbloqueio</h3>
          <p>O gerente abriu um pedido para o admin agir na plataforma da modalidade.</p>
        </div>
        <strong>{pendentes.length} pendente{pendentes.length!==1?"s":""}</strong>
      </div>
      <div className="solicitacoes-grid">
        {pendentes.map(s=>(
          <article key={s.id} className={`solicitacao-card solicitacao-${s.acao}`}>
            <div className="solicitacao-card-top">
              <span>{s.acao==="bloquear"?"Bloquear":"Desbloquear"}</span>
              <small>{formatarDataSolicitacao(s.criadoEm)}</small>
            </div>
            <h4>{s.modalidade}</h4>
            <p><strong>{s.pontoNome}</strong> · {rotaCanonica(s.rota)}</p>
            <p>Gerente: <strong>{s.gerente}</strong></p>
            <blockquote>{s.detalhe}</blockquote>
            <button className="btn-secundario" onClick={()=>onConcluir(s.id)}>Marcar como resolvido</button>
          </article>
        ))}
      </div>
    </section>
  );
}

// ─── ABA: Histórico de Despesas ───────────────────────────────────────────────
function AbaHistoricoDespesas({ pontos, despesas, administrador=false }) {
  const [competencia, setCompetencia] = useState(administrador ? "" : competenciaAtual());
  const [busca, setBusca] = useState("");
  const pontoPorId = new Map(pontos.map(p=>[Number(p.id),p]));
  const linhas = despesas
    .filter(d=>pontoPorId.has(Number(d.pontoId)))
    .map(d=>{
      const ponto = pontoPorId.get(Number(d.pontoId));
      return {
        ...d,
        pontoNome:ponto?.nomeFantasia || "Ponto removido",
        gerente:rotaCanonica(ponto?.gerente) || "Sem rota",
        valor:valorDespesa(d),
      };
    })
    .filter(d=>{
      const q = busca.trim().toLowerCase();
      const bateMes = !competencia || String(d.competencia || "").slice(0,7) === competencia;
      const bateBusca = !q || [d.pontoNome,d.gerente,d.descricao,d.observacao,formatarReais(d.valor)].some(v=>String(v||"").toLowerCase().includes(q));
      return bateMes && bateBusca;
    })
    .sort((a,b)=>
      String(b.competencia).localeCompare(String(a.competencia)) ||
      String(a.gerente).localeCompare(String(b.gerente),"pt-BR") ||
      String(a.pontoNome).localeCompare(String(b.pontoNome),"pt-BR") ||
      String(b.criadoEm).localeCompare(String(a.criadoEm))
    );
  const total = linhas.reduce((s,d)=>s+valorDespesa(d),0);
  const totalPontos = new Set(linhas.map(d=>d.pontoNome)).size;
  const totalGerentes = new Set(linhas.map(d=>d.gerente)).size;
  const meses = [...new Set(despesas.map(d=>String(d.competencia||"").slice(0,7)).filter(Boolean))].sort((a,b)=>b.localeCompare(a));
  const baixarPDF = () => {
    if (linhas.length===0) {
      window.alert("Nenhuma despesa encontrada para gerar o PDF.");
      return;
    }
    exportarHistoricoDespesasPDF({ linhas, competencia, busca });
  };
  return(
    <div style={{display:"flex",flexDirection:"column",gap:"20px"}}>
      <section className="secao">
        <div className="tabela-header">
          <div>
            <h2 className="secao-titulo" style={{margin:0}}>Histórico de Despesas</h2>
            <p className="td-obs">Filtre por mês, ponto, gerente, descrição ou valor.</p>
          </div>
          <button className="btn-primario" onClick={baixarPDF}>📄 Gerar PDF</button>
        </div>
        <div className="filtros historico-despesas-filtros">
          <input className="input-busca" type="text" placeholder="🔍 Buscar ponto, gerente, descrição..." value={busca} onChange={e=>setBusca(e.target.value)}/>
          <input className="select-filtro" type="month" value={competencia} onChange={e=>setCompetencia(e.target.value)} list="meses-despesas"/>
          <datalist id="meses-despesas">
            {meses.map(m=><option key={m} value={m}>{mesLabel(`${m}-01`)}</option>)}
          </datalist>
          {administrador&&<button className="btn-secundario" onClick={()=>setCompetencia("")}>Todos os meses</button>}
          {(busca||competencia)&&<button className="btn-limpar" onClick={()=>{setBusca("");setCompetencia(administrador?"":competenciaAtual());}}>✕ Limpar</button>}
        </div>
      </section>
      <section className="secao">
        <div className="ponto-resumo-grid">
          <div className="resumo-card resumo-conserto"><div className="resumo-num" style={{fontSize:"18px"}}>{formatarReais(total)}</div><div className="resumo-label">Total Filtrado</div></div>
          <div className="resumo-card resumo-total"><div className="resumo-num">{linhas.length}</div><div className="resumo-label">Lançamentos</div></div>
          <div className="resumo-card resumo-uso"><div className="resumo-num">{totalPontos}</div><div className="resumo-label">Pontos</div></div>
          <div className="resumo-card resumo-disponivel"><div className="resumo-num">{totalGerentes}</div><div className="resumo-label">Gerentes</div></div>
        </div>
      </section>
      <section className="secao">
        <div className="tabela-wrapper">
          <table className="tabela">
            <thead><tr><th>Ponto</th><th>Rota</th><th>Descrição</th><th>Valor</th><th>Mês</th><th>Data</th><th>Observação</th></tr></thead>
            <tbody>
              {linhas.length===0
                ?<tr><td colSpan={7} className="tabela-vazia">Nenhuma despesa encontrada para os filtros atuais.</td></tr>
                :linhas.map(d=>(
                  <tr key={d.id}>
                    <td className="td-nome">🏪 {d.pontoNome}</td>
                    <td><BadgeGerente gerente={d.gerente}/></td>
                    <td>{d.descricao || "—"}</td>
                    <td className="qtd-baixa">{formatarReais(d.valor)}</td>
                    <td className="td-minimo">{mesLabel(d.competencia)}</td>
                    <td className="td-obs">{d.criadoEm ? new Date(d.criadoEm).toLocaleDateString("pt-BR") : "—"}</td>
                    <td className="td-obs">{d.observacao || "—"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ─── ABA: Histórico ───────────────────────────────────────────────────────────
function AbaHistorico({ historico, onExportExcel, onExportPDF }) {
  const HIST_CFG_P = {
    "cadastro":{ cor:"hist-cadastro", icone:"🆕", label:"Cadastro" },
    "edicao":  { cor:"hist-edicao",   icone:"✏️", label:"Edição"   },
    "exclusao":{ cor:"hist-exclusao", icone:"🗑️", label:"Exclusão" },
  };
  return(
    <section className="secao">
      <div className="tabela-header">
        <h2 className="secao-titulo" style={{margin:0}}>📋 Histórico de Pontos</h2>
        <div style={{display:"flex",gap:"8px"}}>
          <button className="btn-secundario" onClick={onExportExcel}>📊 Excel</button>
          <button className="btn-secundario" onClick={onExportPDF}>📄 PDF</button>
        </div>
      </div>
      {historico.length===0
        ?<div className="hist-vazio"><div className="hist-vazio-icone">📋</div><div>Nenhuma movimentação registrada.</div></div>
        :<div className="tabela-wrapper">
          <table className="tabela">
            <thead><tr><th>Tipo</th><th>Nome Fantasia</th><th>Gerente</th><th>Observação</th><th>Data</th></tr></thead>
            <tbody>
              {historico.map(h=>{
                const cfg=HIST_CFG_P[h.tipo]||{cor:"",icone:"•",label:h.tipo};
                return(<tr key={h.id}>
                  <td><span className={`badge-hist ${cfg.cor}`}>{cfg.icone} {cfg.label}</span></td>
                  <td className="td-nome">🏪 {h.nome}</td>
                  <td><BadgeGerente gerente={h.gerente}/></td>
                  <td className="td-obs">{h.observacao}</td>
                  <td className="td-minimo" style={{whiteSpace:"nowrap"}}>{h.data}</td>
                </tr>);
              })}
            </tbody>
          </table>
        </div>
      }
    </section>
  );
}

// ─── PointsPage Principal ─────────────────────────────────────────────────────
export default function PointsPage({ equipamentos=[], podeEditar=false, perfilAtual, onPontosChange, onEquipamentosChange, onHistoricoChange }) {
  const [pontos,     setPontos]    = useState([]);
  const [historico,  setHistorico] = useState([]);
  const [despesas,   setDespesas]  = useState([]);
  const [solicitacoes,setSolicitacoes]=useState([]);
  const [loading,    setLoading]   = useState(true);
  const [abaInterna, setAbaInterna]= useState("geral");
  const [modalForm,  setModalForm] = useState(false);
  const [pontoEdit,  setPontoEdit] = useState(null);
  const [excluindo,  setExcluindo] = useState(null);
  const [verDespesas,setVerDespesas]=useState(false);
  const [pontoDespesas,setPontoDespesas]=useState(null);
  const [pontoSolicitacao,setPontoSolicitacao]=useState(null);
  const [filtroDespesa,setFiltroDespesa]=useState("todos");
  const [buscaPontos,setBuscaPontos]=useState("");

  useEffect(()=>{
    async function carregar(){
      setLoading(true);
      const [pts, hist, desp, solic] = await Promise.all([carregarPontos(), carregarHistoricoPontos(), carregarDespesasMensais(), carregarSolicitacoesModalidade()]);
      setPontos(pts); onPontosChange?.(pts); setHistorico(hist); onHistoricoChange?.(hist); setDespesas(desp); setSolicitacoes(solic); setLoading(false);
    }
    carregar();
  },[]);

  const gerenteAtual = perfilAtual?.perfil === "gerente" ? (perfilAtual.gerenteNome || perfilAtual.nome || "") : "";
  const pontosVisiveis = gerenteAtual ? pontos.filter(p=>rotaPermitidaAoPerfil(p.gerente, perfilAtual)) : pontos;
  const nomesPontosVisiveis = new Set(pontosVisiveis.map(p=>p.nomeFantasia));
  const equipamentosVisiveis = gerenteAtual ? equipamentos.filter(i=>nomesPontosVisiveis.has(i.localizacao)) : equipamentos;
  const despesasVisiveis = despesas.filter(d=>
    pontosVisiveis.some(p=>Number(p.id)===Number(d.pontoId)) &&
    (!gerenteAtual || String(d.competencia || "").slice(0,7) === competenciaAtual())
  );
  const gerentePodeCriarPonto = perfilAtual?.perfil === "gerente";
  const podeCriarPonto = podeEditar || gerentePodeCriarPonto;
  const podeEditarDespesas = podeEditar || perfilAtual?.perfil === "gerente";
  const podeSolicitarModalidade = perfilAtual?.perfil === "gerente";
  const administrador = perfilAtual?.perfil === "administrador";

  async function salvarPontoHandler(form, equipamentosSelecionados){
    if(pontoEdit && !podeEditar)return;
    if(!pontoEdit && !podeCriarPonto)return;
    if(gerentePodeCriarPonto && !rotaPermitidaAoPerfil(form.gerente, perfilAtual)) {
      window.alert("Selecione uma rota liberada para seu acesso.");
      return;
    }
    try{
      if(pontoEdit){
        await salvarPonto({...form,id:pontoEdit.id});
        const atualizados=pontos.map(p=>p.id===pontoEdit.id?{...form,id:pontoEdit.id}:p);
        setPontos(atualizados);onPontosChange?.(atualizados);
      }else{
        const novoId=await salvarPonto(form);
        const atualizados=[...pontos,{...form,id:novoId}];
        setPontos(atualizados);onPontosChange?.(atualizados);
      }
      const nomeAnterior=pontoEdit?.nomeFantasia;
      const idsPermitidos=new Set(equipamentos.filter(item=>!item.localizacao||item.localizacao===nomeAnterior).map(item=>item.id));
      const idsSelecionados=new Set(equipamentosSelecionados.filter(id=>idsPermitidos.has(id)));
      const equipamentosAtualizados=equipamentos.map(item=>{
        if(idsSelecionados.has(item.id)) return {...item,quantidade:1,status:"Em rota",localizacao:form.nomeFantasia};
        if(nomeAnterior&&item.localizacao===nomeAnterior) return {...item,quantidade:1,status:"Disponível",localizacao:""};
        return item;
      });
      const alterados=equipamentosAtualizados.filter((item,index)=>item.status!==equipamentos[index].status||item.localizacao!==equipamentos[index].localizacao);
      await Promise.all(alterados.map(item=>salvarEquipamento(item)));
      if(alterados.length>0) onEquipamentosChange?.(equipamentosAtualizados);
      const h={id:Date.now(),tipo:pontoEdit?"edicao":"cadastro",nome:form.nomeFantasia,gerente:form.gerente,observacao:pontoEdit?"Ponto editado":"Ponto cadastrado",data:agoraStr()};
      await adicionarHistoricoPonto(h);
      setHistorico(prev=>{const atualizados=[h,...prev];onHistoricoChange?.(atualizados);return atualizados;});
      setModalForm(false);setPontoEdit(null);
    }catch(e){console.error("Erro ao salvar ponto:",e); throw e;}
  }

  async function excluirHandler(id){
    if(!podeEditar)return;
    const p=pontos.find(x=>x.id===id);
    const vinculados=equipamentos.filter(item=>item.localizacao===p.nomeFantasia);
    if(vinculados.length>0)return;
    try{
      await excluirPonto(id);
      const atualizados=pontos.filter(x=>x.id!==id);
      setPontos(atualizados);onPontosChange?.(atualizados);
      const h={id:Date.now(),tipo:"exclusao",nome:p.nomeFantasia,gerente:p.gerente,observacao:"Ponto removido",data:agoraStr()};
      await adicionarHistoricoPonto(h);
      setHistorico(prev=>{const atualizados=[h,...prev];onHistoricoChange?.(atualizados);return atualizados;});
      setExcluindo(null);
    }catch(e){console.error("Erro ao excluir ponto:",e);}
  }

  async function salvarDespesasPonto(ponto, competencia, linhas) {
    if(!podeEditarDespesas)return;
    if(gerenteAtual && competencia !== competenciaAtual()) {
      window.alert("Gerente só pode lançar despesas do mês atual.");
      return;
    }
    if(gerenteAtual && !gerentePodeLancarDespesas()) {
      window.alert("As despesas do mês só podem ser lançadas do dia 10 até o último dia do mês.");
      return;
    }
    try{
      await Promise.all(linhas.map(linha=>salvarDespesaMensal(linha)));
      const atualizadas = await carregarDespesasMensais();
      setDespesas(atualizadas);
      const totalMes = atualizadas
        .filter(d=>Number(d.pontoId)===Number(ponto.id)&&String(d.competencia||"").slice(0,7)===competencia)
        .reduce((s,d)=>s+valorDespesa(d),0);
      const pontoAtualizado = {...ponto, possuiDespesa: totalMes>0?"sim":"nao", valorDespesa: totalMes};
      await salvarPonto(pontoAtualizado);
      const pontosAtualizados = pontos.map(p=>p.id===ponto.id?pontoAtualizado:p);
      setPontos(pontosAtualizados); onPontosChange?.(pontosAtualizados);
      setPontoDespesas(null);
    }catch(e){
      console.error("Erro ao salvar despesas do ponto:",e);
      throw e;
    }
  }

  async function removerDespesaPonto(id) {
    if(!podeEditarDespesas)return;
    try{
      await excluirDespesaMensal(id);
      setDespesas(prev=>prev.filter(d=>Number(d.id)!==Number(id)));
    }catch(e){console.error("Erro ao remover despesa mensal:",e);}
  }

  async function salvarSolicitacaoModalidade(payload) {
    const nova = await criarSolicitacaoModalidade(payload);
    setSolicitacoes(prev=>[nova,...prev]);
  }

  async function concluirSolicitacao(id) {
    try {
      const atualizada = await concluirSolicitacaoModalidade(id);
      setSolicitacoes(prev=>prev.map(s=>Number(s.id)===Number(id)?atualizada:s));
    } catch (e) {
      window.alert(e?.message || "Não foi possível concluir a solicitação.");
    }
  }

  const ABAS = [
    {id:"geral",    label:"📊 Visão Geral"},
    {id:"pontos",   label:`🏪 Pontos (${pontosVisiveis.length})`},
    {id:"analise",  label:"💰 Histórico de Despesas"},
  ];
  function abrirPontosFiltrados(filtro){
    setFiltroDespesa(filtro);
    setAbaInterna("pontos");
  }
  const pontoExcluindo=pontos.find(p=>p.id===excluindo);
  const equipamentosNoPonto=pontoExcluindo?equipamentos.filter(i=>i.localizacao===pontoExcluindo.nomeFantasia):[];

  return(
    <div className="points-page">
      <div className="points-toolbar">
        <input
          className="input-busca points-busca-topo"
          type="text"
          placeholder="🔍 Digite qualquer coisa: ponto, dono, telefone, gerente ou patrimônio..."
          value={buscaPontos}
          onChange={e=>{setBuscaPontos(e.target.value);if(e.target.value.trim())setAbaInterna("pontos");}}
        />
        <p>Consulte estabelecimentos, despesas e equipamentos vinculados.</p>
        {podeCriarPonto&&<button className="btn-primario" onClick={()=>{setPontoEdit(null);setModalForm(true);}}>+ Novo Ponto</button>}
      </div>

      <div className="points-abas">
        {ABAS.map(a=>(
          <button key={a.id} className={`points-aba-btn ${abaInterna===a.id?"points-aba-ativa":""}`}
            onClick={()=>{setAbaInterna(a.id);if(a.id==="pontos")setFiltroDespesa("todos");}}>
            {a.label}
          </button>
        ))}
      </div>

      {administrador&&<PainelSolicitacoesModalidade solicitacoes={solicitacoes} onConcluir={concluirSolicitacao}/>}

      {loading&&(
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",padding:"60px",gap:"12px",color:"var(--txt-secondary)"}}>
          <div className="loading-dots"><span/><span/><span/></div>
          <span>Carregando pontos...</span>
        </div>
      )}

      {!loading&&(<>
        {abaInterna==="geral"    &&<AbaVisaoGeral pontos={pontosVisiveis} podeEditar={podeCriarPonto} onVerDespesas={()=>setVerDespesas(true)} onNovoClick={()=>setModalForm(true)} onAbrirPontos={abrirPontosFiltrados}/>}
        {abaInterna==="pontos"   &&<AbaPontos pontos={pontosVisiveis} equipamentos={equipamentosVisiveis} busca={buscaPontos} onLimparBusca={()=>setBuscaPontos("")} podeEditar={podeEditar} podeEditarDespesas={podeEditarDespesas} podeSolicitarModalidade={podeSolicitarModalidade} filtroDespesa={filtroDespesa} onLimparFiltro={()=>setFiltroDespesa("todos")} onEditar={p=>{setPontoEdit(p);setModalForm(true);}} onExcluir={setExcluindo} onDespesas={setPontoDespesas} onSolicitarModalidade={setPontoSolicitacao}
            onExportExcel={()=>exportarPontosExcel(pontosVisiveis)} onExportPDF={()=>exportarPontosPDF(pontosVisiveis)}/>}
        {abaInterna==="analise"  &&<AbaHistoricoDespesas pontos={pontosVisiveis} despesas={despesasVisiveis} administrador={administrador}/>}
      </>)}

      {modalForm&&(podeEditar||(!pontoEdit&&podeCriarPonto))&&<PointFormModal ponto={pontoEdit} pontos={pontos} equipamentos={equipamentos} perfilAtual={perfilAtual} onSalvar={salvarPontoHandler} onFechar={()=>{setModalForm(false);setPontoEdit(null);}}/>}
      {verDespesas&&<PointExpensesModal pontos={pontosVisiveis} onFechar={()=>setVerDespesas(false)}/>}
      {pontoDespesas&&<PointMonthlyExpensesModal ponto={pontoDespesas} despesas={despesasVisiveis} podeEditar={podeEditarDespesas} perfilAtual={perfilAtual} onSalvar={salvarDespesasPonto} onRemover={removerDespesaPonto} onFechar={()=>setPontoDespesas(null)}/>}
      {pontoSolicitacao&&podeSolicitarModalidade&&<SolicitacaoModalidadeModal ponto={pontoSolicitacao} perfilAtual={perfilAtual} onSalvar={salvarSolicitacaoModalidade} onFechar={()=>setPontoSolicitacao(null)}/>}

      {excluindo&&(
        <div className="modal-overlay" onClick={()=>setExcluindo(null)}>
          <div className="modal modal-pequeno" onClick={e=>e.stopPropagation()}>
            <div className="modal-header"><h3>Confirmar Exclusão</h3><button className="modal-fechar" onClick={()=>setExcluindo(null)}>✕</button></div>
            <div className="modal-body">
              {equipamentosNoPonto.length>0
                ?<div className="erro-msg">⚠️ Este ponto não pode ser excluído porque possui {equipamentosNoPonto.length} equipamento{equipamentosNoPonto.length!==1?"s":""} vinculado{equipamentosNoPonto.length!==1?"s":""}: <strong>{equipamentosNoPonto.map(i=>i.patrimonio||i.nome).join(", ")}</strong>. Movimente primeiro para outro ponto ou disponibilize o equipamento.</div>
                :<p style={{color:"#94a3b8",lineHeight:"1.6"}}>Tem certeza que deseja excluir este ponto?</p>}
            </div>
            <div className="modal-footer">
              <button className="btn-secundario" onClick={()=>setExcluindo(null)}>Cancelar</button>
              {equipamentosNoPonto.length===0&&<button className="btn-danger" onClick={()=>excluirHandler(excluindo)}>Excluir</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
