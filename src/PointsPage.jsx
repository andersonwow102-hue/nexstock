import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { GERENTES, GERENTE_CORES, MODALIDADES, formatarReais, parseMoeda, agoraStr, pontoFormVazio, validarPonto } from "./pointsData.js";
import { carregarPontos, salvarPonto, excluirPonto, carregarHistoricoPontos, adicionarHistoricoPonto, salvarEquipamento } from "./db.js";

const hoje=()=>new Date().toISOString().slice(0,10);
const agora=()=>new Date().toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});

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
function exportarPontosExcel(pontos){
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
function exportarPontosPDF(pontos){
  const doc = new jsPDF({orientation:"landscape"});
  doc.setFontSize(16);
  doc.text("Stock-ON - Relatório de Pontos", 14, 15);
  doc.setFontSize(10);
  doc.text(`Gerado em: ${agora()}   Total: ${pontos.length} pontos`, 14, 22);
  autoTable(doc,{
    startY: 27,
    head:[["Nome Fantasia","Dono","Telefone","Gerente","Modalidades","Despesa","Valor"]],
    body: pontos.map(p=>[
      p.nomeFantasia,
      p.nomeDono,
      p.telefone,
      p.gerente,
      p.modalidades.join(", "),
      p.possuiDespesa==="sim"?"Sim":"Não",
      p.possuiDespesa==="sim"?formatarReais(p.valorDespesa):"—",
    ]),
    styles:{fontSize:8},
    headStyles:{fillColor:[30,41,59]},
  });
  doc.save(`pontos_${hoje()}.pdf`);
}

// ── Exportar Excel Histórico Pontos ───────────────────────────────────────────
function exportarHistoricoPontosExcel(historico){
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
function exportarHistoricoPontosPDF(historico){
  const doc = new jsPDF({orientation:"landscape"});
  doc.setFontSize(16);
  doc.text("Stock-ON - Histórico de Pontos", 14, 15);
  doc.setFontSize(10);
  doc.text(`Gerado em: ${agora()}   Total: ${historico.length} registros`, 14, 22);
  autoTable(doc,{
    startY: 27,
    head:[["Tipo","Nome Fantasia","Gerente","Observação","Data"]],
    body: historico.map(h=>[
      h.tipo==="cadastro"?"Cadastro":h.tipo==="edicao"?"Edição":"Exclusão",
      h.nome,
      h.gerente,
      h.observacao||"—",
      h.data,
    ]),
    styles:{fontSize:8},
    headStyles:{fillColor:[30,41,59]},
  });
  doc.save(`historico_pontos_${hoje()}.pdf`);
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
function PointFormModal({ ponto, equipamentos, onSalvar, onFechar }) {
  const [form, setForm] = useState(ponto ? {...ponto,
    valorDespesa: ponto.valorDespesa ? mascaraMoeda(String(Math.round(ponto.valorDespesa*100))) : ""
  } : {...pontoFormVazio});
  const [equipamentosSelecionados, setEquipamentosSelecionados] = useState(
    equipamentos.filter(i=>ponto&&i.localizacao===ponto.nomeFantasia).map(i=>i.id)
  );
  const [erro, setErro] = useState("");

  function toggleModalidade(m) {
    setForm({...form, modalidades: form.modalidades.includes(m)
      ? form.modalidades.filter(x=>x!==m)
      : [...form.modalidades, m]});
  }

  function salvar() {
    const e = validarPonto(form);
    if (e) { setErro(e); return; }
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
          <div className="campo">
            <label>Equipamentos neste ponto</label>
            {equipamentos.length===0
              ?<span className="campo-hint">Nenhum equipamento cadastrado ainda.</span>
              :<div className="modalidades-grid">
                {equipamentos.map(item=>(
                  <label key={item.id} className={`modalidade-item ${equipamentosSelecionados.includes(item.id)?"modalidade-ativa":""}`}>
                    <input type="checkbox" checked={equipamentosSelecionados.includes(item.id)} onChange={()=>setEquipamentosSelecionados(prev=>prev.includes(item.id)?prev.filter(id=>id!==item.id):[...prev,item.id])}/>
                    {item.patrimonio||item.nome}
                    {item.localizacao&&item.localizacao!==ponto?.nomeFantasia&&<span className="campo-hint"> - atual: {item.localizacao}</span>}
                  </label>
                ))}
              </div>}
          </div>
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
function AbaVisaoGeral({ pontos, onVerDespesas, onNovoClick }) {
  const totalPontos   = pontos.length;
  const comDespesa    = pontos.filter(p=>p.possuiDespesa==="sim").length;
  const semDespesa    = pontos.filter(p=>p.possuiDespesa==="nao").length;
  const totalDespesas = pontos.reduce((s,p)=>s+(p.valorDespesa||0),0);

  return (
    <>
      <section className="secao">
        <h2 className="secao-titulo">Resumo Geral</h2>
        <div className="resumo-grid">
          <div className="resumo-card resumo-total"><div className="resumo-num">{totalPontos}</div><div className="resumo-label">Total de Pontos</div></div>
          <div className="resumo-card resumo-disponivel"><div className="resumo-num">{semDespesa}</div><div className="resumo-label">Sem Despesa</div></div>
          <div className="resumo-card resumo-defeito"><div className="resumo-num">{comDespesa}</div><div className="resumo-label">Com Despesa</div></div>
          <div className="resumo-card resumo-conserto ponto-despesa-card clickable" onClick={onVerDespesas}>
            <div className="resumo-num" style={{fontSize:"18px"}}>{formatarReais(totalDespesas)}</div>
            <div className="resumo-label">💰 Total Despesas <span style={{fontSize:"10px",opacity:0.7}}>(clique)</span></div>
          </div>
        </div>
      </section>
      {pontos.length===0&&(
        <div className="hist-vazio">
          <div className="hist-vazio-icone">📍</div>
          <div>Nenhum ponto cadastrado ainda.</div>
          <button className="btn-primario" style={{marginTop:"8px"}} onClick={onNovoClick}>+ Cadastrar primeiro ponto</button>
        </div>
      )}
    </>
  );
}

// ─── ABA: Pontos Cadastrados ───────────────────────────────────────────────────
function AbaPontos({ pontos, equipamentos, onEditar, onExcluir, onExportExcel, onExportPDF }) {
  const [busca, setBusca] = useState("");
  const [filtroGerente, setFiltroGerente] = useState("Todos");
  const filtrados = pontos.filter(p=>{
    const q=busca.toLowerCase();
    const vinculados=equipamentos.filter(i=>i.localizacao===p.nomeFantasia);
    const mB=!busca||[p.nomeFantasia,p.nomeDono,p.telefone,p.gerente,...vinculados.map(i=>i.patrimonio)].some(f=>(f||"").toLowerCase().includes(q));
    return mB&&(filtroGerente==="Todos"||p.gerente===filtroGerente);
  });

  return (
    <section className="secao">
      <div className="tabela-header">
        <h2 className="secao-titulo" style={{margin:0}}>Pontos <span className="badge-count">{filtrados.length}</span></h2>
        <div className="filtros">
          <input className="input-busca" type="text" placeholder="🔍 Nome, dono, gerente..." value={busca} onChange={e=>setBusca(e.target.value)}/>
          <select className="select-filtro" value={filtroGerente} onChange={e=>setFiltroGerente(e.target.value)}>
            <option value="Todos">Todos os gerentes</option>
            {GERENTES.map(g=><option key={g} value={g}>{g}</option>)}
          </select>
          {(busca||filtroGerente!=="Todos")&&<button className="btn-limpar" onClick={()=>{setBusca("");setFiltroGerente("Todos");}}>✕ Limpar</button>}
          <button className="btn-secundario" onClick={onExportExcel}>📊 Excel</button>
          <button className="btn-secundario" onClick={onExportPDF}>📄 PDF</button>
        </div>
      </div>
      <div className="tabela-wrapper">
        <table className="tabela">
          <thead><tr><th>Nome Fantasia</th><th>Equipamentos</th><th>Dono</th><th>Telefone</th><th>Gerente</th><th>Modalidades</th><th>Despesa</th><th>Valor</th><th>⚙️</th></tr></thead>
          <tbody>
            {filtrados.length===0
              ?<tr><td colSpan={9} className="tabela-vazia">Nenhum ponto encontrado.</td></tr>
              :filtrados.map(p=>{
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
                    <button className="btn-editar" onClick={()=>onEditar(p)} title="Editar">✏️</button>
                    <button className="btn-excluir" onClick={()=>onExcluir(p.id)} title="Excluir">🗑️</button>
                  </td>
                </tr>;
              })}
          </tbody>
        </table>
      </div>
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
export default function PointsPage({ equipamentos=[], onPontosChange, onEquipamentosChange }) {
  const [pontos,     setPontos]    = useState([]);
  const [historico,  setHistorico] = useState([]);
  const [loading,    setLoading]   = useState(true);
  const [abaInterna, setAbaInterna]= useState("geral");
  const [modalForm,  setModalForm] = useState(false);
  const [pontoEdit,  setPontoEdit] = useState(null);
  const [excluindo,  setExcluindo] = useState(null);
  const [verDespesas,setVerDespesas]=useState(false);

  useEffect(()=>{
    async function carregar(){
      setLoading(true);
      const [pts, hist] = await Promise.all([carregarPontos(), carregarHistoricoPontos()]);
      setPontos(pts); onPontosChange?.(pts); setHistorico(hist); setLoading(false);
    }
    carregar();
  },[]);

  async function salvarPontoHandler(form, equipamentosSelecionados){
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
      const idsSelecionados=new Set(equipamentosSelecionados);
      const nomeAnterior=pontoEdit?.nomeFantasia;
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
      setHistorico(prev=>[h,...prev]);
      setModalForm(false);setPontoEdit(null);
    }catch(e){console.error("Erro ao salvar ponto:",e);}
  }

  async function excluirHandler(id){
    const p=pontos.find(x=>x.id===id);
    try{
      await excluirPonto(id);
      const atualizados=pontos.filter(x=>x.id!==id);
      setPontos(atualizados);onPontosChange?.(atualizados);
      const h={id:Date.now(),tipo:"exclusao",nome:p.nomeFantasia,gerente:p.gerente,observacao:"Ponto removido",data:agoraStr()};
      await adicionarHistoricoPonto(h);
      setHistorico(prev=>[h,...prev]);
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

  return(
    <div className="points-page">
      <header className="topbar">
        <div><h1 className="page-title">Pontos</h1><p className="page-sub">Gerenciamento de pontos da empresa</p></div>
        <button className="btn-primario" onClick={()=>{setPontoEdit(null);setModalForm(true);}}>+ Novo Ponto</button>
      </header>

      <div className="points-abas">
        {ABAS.map(a=>(
          <button key={a.id} className={`points-aba-btn ${abaInterna===a.id?"points-aba-ativa":""}`}
            onClick={()=>setAbaInterna(a.id)}>
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
        {abaInterna==="geral"    &&<AbaVisaoGeral pontos={pontos} onVerDespesas={()=>setVerDespesas(true)} onNovoClick={()=>setModalForm(true)}/>}
        {abaInterna==="pontos"   &&<AbaPontos pontos={pontos} equipamentos={equipamentos} onEditar={p=>{setPontoEdit(p);setModalForm(true);}} onExcluir={setExcluindo}
            onExportExcel={()=>exportarPontosExcel(pontos)} onExportPDF={()=>exportarPontosPDF(pontos)}/>}
        {abaInterna==="analise"  &&<AbaAnalise pontos={pontos}/>}
        {abaInterna==="gerentes" &&<AbaGerentes pontos={pontos}/>}
        {abaInterna==="historico"&&<AbaHistorico historico={historico}
            onExportExcel={()=>exportarHistoricoPontosExcel(historico)} onExportPDF={()=>exportarHistoricoPontosPDF(historico)}/>}
      </>)}

      {modalForm&&<PointFormModal ponto={pontoEdit} equipamentos={equipamentos} onSalvar={salvarPontoHandler} onFechar={()=>{setModalForm(false);setPontoEdit(null);}}/>}
      {verDespesas&&<PointExpensesModal pontos={pontos} onFechar={()=>setVerDespesas(false)}/>}

      {excluindo&&(
        <div className="modal-overlay" onClick={()=>setExcluindo(null)}>
          <div className="modal modal-pequeno" onClick={e=>e.stopPropagation()}>
            <div className="modal-header"><h3>Confirmar Exclusão</h3><button className="modal-fechar" onClick={()=>setExcluindo(null)}>✕</button></div>
            <div className="modal-body"><p style={{color:"#94a3b8",lineHeight:"1.6"}}>Tem certeza que deseja excluir este ponto?</p></div>
            <div className="modal-footer">
              <button className="btn-secundario" onClick={()=>setExcluindo(null)}>Cancelar</button>
              <button className="btn-danger" onClick={()=>excluirHandler(excluindo)}>Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
