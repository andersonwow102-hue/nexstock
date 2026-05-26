import { useState, useEffect } from "react";
import { GERENTES, GERENTE_CORES, MODALIDADES, formatarReais, parseMoeda, agoraStr, pontoFormVazio, validarPonto } from "./pointsData.js";
import { carregarPontos, salvarPonto, excluirPonto, carregarHistoricoPontos, adicionarHistoricoPonto, salvarEquipamento } from "./db.js";

const hoje=()=>new Date().toISOString().slice(0,10);

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
  const c = GERENTE_CORES[gerente] || { bg:"rgba(107,122,153,0.15)", color:"#6b7a99", border:"rgba(107,122,153,0.3)" };
  return (
    <span style={{ display:"inline-block", background:c.bg, color:c.color, border:`1px solid ${c.border}`,
      fontSize:"11px", fontWeight:700, padding:"3px 10px", borderRadius:"20px", whiteSpace:"nowrap" }}>
      {gerente}
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
    "Gerente":        p.gerente,
    "Modalidades":    p.modalidades.join(", "),
    "Possui Despesa": p.possuiDespesa==="sim"?"Sim":"Não",
    "Valor Despesa":  p.possuiDespesa==="sim"?p.valorDespesa:0,
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
    colunas:["Nome Fantasia","Dono","Telefone","Gerente","Modalidades","Despesa","Valor"],
    linhas:ordenados.map(p=>[
      p.nomeFantasia,
      p.nomeDono,
      p.telefone,
      p.gerente,
      p.modalidades.join(", "),
      p.possuiDespesa==="sim"?"Sim":"Não",
      p.possuiDespesa==="sim"?formatarReais(p.valorDespesa):"-",
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
export function PointFormModal({ ponto, pontos=[], equipamentos=[], onSalvar, onFechar, mostrarEquipamentos=true }) {
  const [form, setForm] = useState(ponto ? {...ponto,
    valorDespesa: ponto.valorDespesa ? mascaraMoeda(String(Math.round(ponto.valorDespesa*100))) : ""
  } : {...pontoFormVazio});
  const [equipamentosSelecionados, setEquipamentosSelecionados] = useState(
    equipamentos.filter(i=>ponto&&i.localizacao===ponto.nomeFantasia).map(i=>i.id)
  );
  const [erro, setErro] = useState("");
  const equipamentosDisponiveis = equipamentos.filter(item=>
    !item.localizacao || (ponto && item.localizacao===ponto.nomeFantasia)
  );

  function toggleModalidade(m) {
    setForm({...form, modalidades: form.modalidades.includes(m)
      ? form.modalidades.filter(x=>x!==m)
      : [...form.modalidades, m]});
  }

  function salvar() {
    const e = validarPonto(form);
    if (e) { setErro(e); return; }
    const nome=form.nomeFantasia.trim().toLowerCase();
    if(pontos.some(p=>p.id!==ponto?.id&&p.nomeFantasia.trim().toLowerCase()===nome)){
      setErro("Já existe um ponto com este nome. Use um nome diferente para não confundir a localização dos equipamentos.");
      return;
    }
    onSalvar({...form, valorDespesa: form.possuiDespesa==="sim" ? parseMoeda(form.valorDespesa) : 0}, equipamentosSelecionados);
  }

  return (
    <div className="modal-overlay" onClick={onFechar}>
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
            <div className="campo"><label>Gerente Responsável *</label>
              <select value={form.gerente} onChange={e=>setForm({...form,gerente:e.target.value})}>
                <option value="">Selecione...</option>
                {GERENTES.map(g=><option key={g} value={g}>{g}</option>)}
              </select></div>
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
          <div className="campo">
            <label>Possui Despesa? *</label>
            <div className="despesa-opcoes">
              <label className={`despesa-opcao ${form.possuiDespesa==="sim"?"despesa-ativa":""}`}>
                <input type="radio" name="desp" value="sim" checked={form.possuiDespesa==="sim"} onChange={()=>setForm({...form,possuiDespesa:"sim"})}/> ✅ Sim
              </label>
              <label className={`despesa-opcao ${form.possuiDespesa==="nao"?"despesa-ativa":""}`}>
                <input type="radio" name="desp" value="nao" checked={form.possuiDespesa==="nao"} onChange={()=>setForm({...form,possuiDespesa:"nao",valorDespesa:""})}/> ❌ Não
              </label>
            </div>
          </div>
          {form.possuiDespesa==="sim"&&(
            <div className="campo"><label>Valor da Despesa *</label>
              <input type="text" placeholder="R$ 0,00" value={form.valorDespesa} onChange={e=>setForm({...form,valorDespesa:mascaraMoeda(e.target.value)})}/></div>
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
              <thead><tr><th>Nome Fantasia</th><th>Dono</th><th>Gerente</th><th>Telefone</th><th>Valor</th></tr></thead>
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
function AbaPontos({ pontos, equipamentos, filtroDespesa, onLimparFiltro, onEditar, onExcluir, onExportExcel, onExportPDF, podeEditar }) {
  const [busca, setBusca] = useState("");
  const [filtroGerente, setFiltroGerente] = useState("Todos");
  const [pagina, setPagina] = useState(1);
  const POR_PAGINA=10;
  const filtrados = pontos.filter(p=>{
    const q=busca.toLowerCase();
    const vinculados=equipamentos.filter(i=>i.localizacao===p.nomeFantasia);
    const mB=!busca||[p.nomeFantasia,p.nomeDono,p.telefone,p.gerente,...vinculados.map(i=>i.patrimonio)].some(f=>(f||"").toLowerCase().includes(q));
    const mD=filtroDespesa==="todos"||p.possuiDespesa===filtroDespesa;
    return mB&&mD&&(filtroGerente==="Todos"||p.gerente===filtroGerente);
  });
  const ordenados=[...filtrados].sort((a,b)=>(a.gerente||"").localeCompare(b.gerente||"","pt-BR")||a.nomeFantasia.localeCompare(b.nomeFantasia,"pt-BR"));
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
          <input className="input-busca" type="text" placeholder="🔍 Nome, dono, gerente..." value={busca} onChange={e=>setBusca(e.target.value)}/>
          <select className="select-filtro" value={filtroGerente} onChange={e=>setFiltroGerente(e.target.value)}>
            <option value="Todos">Todos os gerentes</option>
            {GERENTES.map(g=><option key={g} value={g}>{g}</option>)}
          </select>
          {(busca||filtroGerente!=="Todos"||filtroDespesa!=="todos")&&<button className="btn-limpar" onClick={()=>{setBusca("");setFiltroGerente("Todos");onLimparFiltro();}}>✕ Limpar</button>}
          <button className="btn-secundario" onClick={onExportExcel}>📊 Excel</button>
          <button className="btn-secundario" onClick={onExportPDF}>📄 PDF</button>
        </div>
      </div>
      <div className="tabela-wrapper pontos-tabela">
        <table className="tabela">
          <thead><tr><th>Nome Fantasia</th><th>Equipamentos</th><th>Dono</th><th>Telefone</th><th>Gerente</th><th>Modalidades</th><th>Despesa</th><th>Valor</th><th>⚙️</th></tr></thead>
          <tbody>
            {filtrados.length===0
              ?<tr><td colSpan={9} className="tabela-vazia">Nenhum ponto encontrado.</td></tr>
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
                  <td><span className={`badge-status ${p.possuiDespesa==="sim"?"status-defeito":"status-disponivel"}`}>{p.possuiDespesa==="sim"?"Sim":"Não"}</span></td>
                  <td className={p.possuiDespesa==="sim"?"qtd-baixa":"td-minimo"}>{p.possuiDespesa==="sim"?formatarReais(p.valorDespesa):"—"}</td>
                  <td className="td-acoes">
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
                <span className={`badge-status ${p.possuiDespesa==="sim"?"status-defeito":"status-disponivel"}`}>{p.possuiDespesa==="sim"?"Com despesa":"Sem despesa"}</span>
              </div>
              <div className="ponto-card-linha"><span>Gerente</span><BadgeGerente gerente={p.gerente}/></div>
              <div className="ponto-card-linha"><span>Modalidades</span><div className="modalidades-badges">{p.modalidades.map(m=><BadgeModalidade key={m} m={m}/>)}</div></div>
              <div className="ponto-card-linha"><span>Equipamentos</span><div className="equipamentos-ponto">{vinculados.length? vinculados.map(i=><span key={i.id} className="badge-cat">{i.patrimonio||i.nome}</span>) : <span className="td-obs">Nenhum</span>}</div></div>
              {p.possuiDespesa==="sim"&&<div className="ponto-card-valor">{formatarReais(p.valorDespesa)}</div>}
              <div className="ponto-card-acoes">
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

// ─── ABA: Análise de Despesas ─────────────────────────────────────────────────
function AbaAnalise({ pontos }) {
  if (pontos.length===0) return <div className="hist-vazio"><div className="hist-vazio-icone">📊</div><div>Nenhum dado para analisar ainda.</div></div>;

  const porGerente = GERENTES.map(g=>{
    const pts=pontos.filter(p=>p.gerente===g);
    const totalDespesa=pts.filter(p=>p.possuiDespesa==="sim").reduce((s,p)=>s+(p.valorDespesa||0),0);
    return{gerente:g,total:pts.length,totalDespesa};
  }).filter(g=>g.totalDespesa>0).sort((a,b)=>b.totalDespesa-a.totalDespesa);

  const totalGeral=porGerente.reduce((s,g)=>s+g.totalDespesa,0);
  const alertas50=porGerente.filter(g=>(g.totalDespesa/totalGeral)>=0.5);
  const rankingPontos=[...pontos].filter(p=>p.possuiDespesa==="sim"&&p.valorDespesa>0).sort((a,b)=>b.valorDespesa-a.valorDespesa);
  const lider=porGerente[0];

  if (!lider) return <div className="hist-vazio"><div className="hist-vazio-icone">💰</div><div>Nenhum ponto com despesa cadastrado.</div></div>;

  const c=GERENTE_CORES[lider.gerente]||{color:"#f05252",border:"rgba(240,82,82,0.3)"};

  return(
    <div style={{display:"flex",flexDirection:"column",gap:"20px"}}>
      <section className="secao">
        <h2 className="secao-titulo">🚨 Gerente com maior despesa</h2>
        <div className="alerta-gerente-card" style={{borderColor:c.border}}>
          <div className="alerta-gerente-topo">
            <span className="alerta-gerente-icone">🚨</span>
            <div>
              <div className="alerta-gerente-titulo">Gerente com maior despesa acumulada</div>
              <BadgeGerente gerente={lider.gerente}/>
            </div>
            <div className="alerta-gerente-valor" style={{color:c.color}}>{formatarReais(lider.totalDespesa)}</div>
          </div>
          <div className="alerta-gerente-texto">
            O gerente <strong style={{color:c.color}}>{lider.gerente}</strong> possui{" "}
            <strong>{lider.total}</strong> ponto{lider.total!==1?"s":""} instalado{lider.total!==1?"s":""}, com um total de{" "}
            <strong style={{color:c.color}}>{formatarReais(lider.totalDespesa)}</strong> em despesas —
            representando <strong style={{color:c.color}}>{Math.round((lider.totalDespesa/totalGeral)*100)}%</strong> do total ({formatarReais(totalGeral)}).
          </div>
          <div className="alerta-gerente-aviso">⚠️ Gerente com despesa elevada — verificar situação com o mesmo.</div>
        </div>
      </section>

      {alertas50.length>0&&(
        <section className="secao">
          <h2 className="secao-titulo">🔴 Concentração crítica (≥ 50%)</h2>
          {alertas50.map(g=>{
            const pct=Math.round((g.totalDespesa/totalGeral)*100);
            const cg=GERENTE_CORES[g.gerente]||{color:"#f05252"};
            return(
              <div key={g.gerente} className="alerta-50-card">
                <div className="alerta-50-topo">
                  <span>🔴</span>
                  <strong>Concentração crítica detectada</strong>
                  <span className="alerta-50-pct" style={{color:cg.color}}>{pct}% do total</span>
                </div>
                <div className="alerta-50-texto">
                  <BadgeGerente gerente={g.gerente}/>{" "}
                  concentra <strong style={{color:cg.color}}>{pct}%</strong> de todas as despesas com{" "}
                  <strong>{formatarReais(g.totalDespesa)}</strong> em {g.total} ponto{g.total!==1?"s":""}.
                </div>
              </div>
            );
          })}
        </section>
      )}

      <section className="secao">
        <h2 className="secao-titulo">📊 Ranking por Gerente</h2>
        <div className="alerta-gerente-card">
          <div className="alerta-gerente-ranking">
            {porGerente.map((g,i)=>{
              const pct=Math.round((g.totalDespesa/totalGeral)*100);
              const cg=GERENTE_CORES[g.gerente]||{color:"var(--amarelo)"};
              return(
                <div key={g.gerente} className="ranking-linha">
                  <span className="ranking-pos">#{i+1}</span>
                  <BadgeGerente gerente={g.gerente}/>
                  <span className="ranking-pts">{g.total} ponto{g.total!==1?"s":""}</span>
                  <div className="ranking-bar-wrap"><div className="ranking-bar" style={{width:`${pct}%`,background:cg.color}}/></div>
                  <span className="ranking-pct" style={{color:cg.color}}>{pct}%</span>
                  <span className="ranking-val" style={{color:cg.color}}>{formatarReais(g.totalDespesa)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {rankingPontos.length>0&&(
        <section className="secao">
          <h2 className="secao-titulo">🏪 Ranking de Pontos por Despesa</h2>
          <div className="alerta-gerente-card">
            <div className="ranking-pontos-lista">
              {rankingPontos.map((p,i)=>{
                const cg=GERENTE_CORES[p.gerente]||{color:"var(--amarelo)"};
                const pct=Math.round((p.valorDespesa/totalGeral)*100);
                const alto=pct>=30;
                return(
                  <div key={p.id} className={`ranking-ponto-item ${alto?"ranking-ponto-alto":""}`}>
                    <span className="ranking-pos">#{i+1}</span>
                    <div className="ranking-ponto-info">
                      <span className="ranking-ponto-nome">🏪 {p.nomeFantasia}</span>
                      <BadgeGerente gerente={p.gerente}/>
                    </div>
                    <div className="ranking-bar-wrap">
                      <div className="ranking-bar" style={{width:`${Math.min(pct*2,100)}%`,background:alto?"var(--vermelho)":cg.color}}/>
                    </div>
                    <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,fontSize:"13px",textAlign:"right",color:alto?"var(--vermelho)":cg.color}}>
                      {formatarReais(p.valorDespesa)}{alto&&<span className="ranking-tag-alto"> ⚠️</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

// ─── ABA: Gerentes ────────────────────────────────────────────────────────────
function AbaGerentes({ pontos }) {
  const porGerente = GERENTES.map(g=>({
    gerente:g,
    total:pontos.filter(p=>p.gerente===g).length,
    comDespesa:pontos.filter(p=>p.gerente===g&&p.possuiDespesa==="sim").length,
    totalDespesa:pontos.filter(p=>p.gerente===g).reduce((s,p)=>s+(p.valorDespesa||0),0),
  })).filter(g=>g.total>0).sort((a,b)=>b.total-a.total);

  const porModalidade = MODALIDADES.map(m=>({
    modalidade:m,
    total:pontos.filter(p=>p.modalidades.includes(m)).length,
  })).filter(m=>m.total>0).sort((a,b)=>b.total-a.total);

  return(
    <div className="pontos-grid-inferior">
      <section className="secao">
        <h2 className="secao-titulo">👤 Por Gerente</h2>
        {porGerente.length===0
          ?<div className="hist-vazio"><div className="hist-vazio-icone">👤</div><div>Nenhum dado.</div></div>
          :<div className="tabela-wrapper">
            <table className="tabela">
              <thead><tr><th>Gerente</th><th>Pontos</th><th>C/ Despesa</th><th>Total Despesas</th></tr></thead>
              <tbody>
                {porGerente.map(g=>(
                  <tr key={g.gerente}>
                    <td><BadgeGerente gerente={g.gerente}/></td>
                    <td className="qtd-normal">{g.total}</td>
                    <td className="td-minimo">{g.comDespesa}</td>
                    <td className={g.totalDespesa>0?"qtd-baixa":"td-minimo"}>{g.totalDespesa>0?formatarReais(g.totalDespesa):"—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        }
      </section>
      <section className="secao">
        <h2 className="secao-titulo">🎮 Por Modalidade</h2>
        {porModalidade.length===0
          ?<div className="hist-vazio"><div className="hist-vazio-icone">🎮</div><div>Nenhum dado.</div></div>
          :<div className="tabela-wrapper">
            <table className="tabela">
              <thead><tr><th>Modalidade</th><th>Pontos</th></tr></thead>
              <tbody>
                {porModalidade.map(m=>(
                  <tr key={m.modalidade}>
                    <td><BadgeModalidade m={m.modalidade}/></td>
                    <td className="qtd-normal">{m.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        }
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
export default function PointsPage({ equipamentos=[], podeEditar=false, onPontosChange, onEquipamentosChange, onHistoricoChange }) {
  const [pontos,     setPontos]    = useState([]);
  const [historico,  setHistorico] = useState([]);
  const [loading,    setLoading]   = useState(true);
  const [abaInterna, setAbaInterna]= useState("geral");
  const [modalForm,  setModalForm] = useState(false);
  const [pontoEdit,  setPontoEdit] = useState(null);
  const [excluindo,  setExcluindo] = useState(null);
  const [verDespesas,setVerDespesas]=useState(false);
  const [filtroDespesa,setFiltroDespesa]=useState("todos");

  useEffect(()=>{
    async function carregar(){
      setLoading(true);
      const [pts, hist] = await Promise.all([carregarPontos(), carregarHistoricoPontos()]);
      setPontos(pts); onPontosChange?.(pts); setHistorico(hist); onHistoricoChange?.(hist); setLoading(false);
    }
    carregar();
  },[]);

  async function salvarPontoHandler(form, equipamentosSelecionados){
    if(!podeEditar)return;
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
    }catch(e){console.error("Erro ao salvar ponto:",e);}
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

  const ABAS = [
    {id:"geral",    label:"📊 Visão Geral"},
    {id:"pontos",   label:`🏪 Pontos (${pontos.length})`},
    {id:"analise",  label:"💰 Análise de Despesas"},
    {id:"gerentes", label:"👤 Gerentes & Modalidades"},
    {id:"historico",label:`📋 Histórico (${historico.length})`},
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
        <p>Consulte estabelecimentos, despesas e equipamentos vinculados.</p>
        {podeEditar&&<button className="btn-primario" onClick={()=>{setPontoEdit(null);setModalForm(true);}}>+ Novo Ponto</button>}
      </div>

      <div className="points-abas">
        {ABAS.map(a=>(
          <button key={a.id} className={`points-aba-btn ${abaInterna===a.id?"points-aba-ativa":""}`}
            onClick={()=>{setAbaInterna(a.id);if(a.id==="pontos")setFiltroDespesa("todos");}}>
            {a.label}
          </button>
        ))}
      </div>

      {loading&&(
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",padding:"60px",gap:"12px",color:"var(--txt-secondary)"}}>
          <div className="loading-dots"><span/><span/><span/></div>
          <span>Carregando pontos...</span>
        </div>
      )}

      {!loading&&(<>
        {abaInterna==="geral"    &&<AbaVisaoGeral pontos={pontos} podeEditar={podeEditar} onVerDespesas={()=>setVerDespesas(true)} onNovoClick={()=>setModalForm(true)} onAbrirPontos={abrirPontosFiltrados}/>}
        {abaInterna==="pontos"   &&<AbaPontos pontos={pontos} equipamentos={equipamentos} podeEditar={podeEditar} filtroDespesa={filtroDespesa} onLimparFiltro={()=>setFiltroDespesa("todos")} onEditar={p=>{setPontoEdit(p);setModalForm(true);}} onExcluir={setExcluindo}
            onExportExcel={()=>exportarPontosExcel(pontos)} onExportPDF={()=>exportarPontosPDF(pontos)}/>}
        {abaInterna==="analise"  &&<AbaAnalise pontos={pontos}/>}
        {abaInterna==="gerentes" &&<AbaGerentes pontos={pontos}/>}
        {abaInterna==="historico"&&<AbaHistorico historico={historico}
            onExportExcel={()=>exportarHistoricoPontosExcel(historico)} onExportPDF={()=>exportarHistoricoPontosPDF(historico)}/>}
      </>)}

      {modalForm&&podeEditar&&<PointFormModal ponto={pontoEdit} pontos={pontos} equipamentos={equipamentos} onSalvar={salvarPontoHandler} onFechar={()=>{setModalForm(false);setPontoEdit(null);}}/>}
      {verDespesas&&<PointExpensesModal pontos={pontos} onFechar={()=>setVerDespesas(false)}/>}

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
