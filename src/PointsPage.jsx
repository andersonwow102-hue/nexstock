import { useState, useEffect, useRef } from "react";
import {
  GERENTES, MODALIDADES, ROTAS, ROTAS_POR_GERENTE,
  formatarReais, parseMoeda, agoraStr, pontoFormVazio, validarPonto,
  gerenteDaRota, rotaCanonica, rotaPermitidaAoPerfil, rotasPermitidasDoPerfil,
} from "./pointsData.js";
import {
  carregarPontos, salvarPonto, carregarHistoricoPontos, adicionarHistoricoPonto, salvarEquipamento,
  carregarDespesasMensais, salvarDespesaMensal, excluirDespesaMensal,
  carregarProrrogacoesDespesas,
  carregarSolicitacoesModalidade, criarSolicitacaoModalidade, concluirSolicitacaoModalidade,
  carregarSolicitacoesStatusPonto, solicitarDesativacaoPonto, decidirDesativacaoPonto, reativarPonto,
  carregarPontoModalidadeAcessos, salvarPontoModalidadeAcessos,
} from "./db.js";
import { EmptyState, FilterBar, Modal as OperationModal, OperationIcon, Pagination, StatusBadge } from "./components/operations/OperationsUI.jsx";
import { acquireMainScrollLock } from "./components/operations/mainScrollLock.js";
import { exportarCsvSeguro } from "./csvExport.js";
import { expenseBelongsToManager, isManagerExpense } from "./expenseScope.js";
import "./PointsCommandFlow.css";

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
const normalizarGerenteExcecao=valor=>String(valor||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLocaleLowerCase("pt-BR");
const encontrarProrrogacaoAtiva=(prorrogacoes,gerente,competencia)=>(prorrogacoes||[]).find(item=>
  item.ativo&&
  normalizarGerenteExcecao(item.gerente)===normalizarGerenteExcecao(gerente)&&
  item.competencia===competencia&&
  Date.parse(item.expiraEm)>Date.now()
);
const formatarPrazoProrrogacao=valor=>new Date(valor).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"});
function useProrrogacaoDespesa(prorrogacoes,gerente,competencia) {
  const [ativa,setAtiva]=useState(()=>encontrarProrrogacaoAtiva(prorrogacoes,gerente,competencia)||null);
  useEffect(()=>{
    const prorrogacao=encontrarProrrogacaoAtiva(prorrogacoes,gerente,competencia)||null;
    setAtiva(prorrogacao);
    if(!prorrogacao)return undefined;
    const restante=Date.parse(prorrogacao.expiraEm)-Date.now();
    if(restante<=0)return undefined;
    const timer=window.setTimeout(()=>setAtiva(null),restante);
    return()=>window.clearTimeout(timer);
  },[prorrogacoes,gerente,competencia]);
  return ativa;
}
const slugArquivo=t=>String(t||"geral").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"");
const normalizarNomeFantasia = valor =>
  String(valor || "").trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR");
const pontoPossuiPlayBet = ponto =>
  (ponto?.modalidades || []).some(modalidade =>
    String(modalidade || "").replace(/\s+/g, "").toLocaleLowerCase("pt-BR") === "playbet"
  );

function PlayBetBadge({ ponto }) {
  if (!pontoPossuiPlayBet(ponto)) return null;
  return <span className="playbet-destaque" title="Modalidade Play Bet">PLAY BET</span>;
}

function resumoDespesaPontoMes(ponto, despesas=[], competencia=competenciaAtual()) {
  const total = despesas
    .filter(d => Number(d.pontoId) === Number(ponto.id) && String(d.competencia || "").slice(0, 7) === competencia)
    .reduce((s, d) => s + valorDespesa(d), 0);
  return { possuiDespesa: total > 0 ? "sim" : "nao", valorDespesa: total };
}

function aplicarResumoDespesaMes(pontos=[], despesas=[], competencia=competenciaAtual()) {
  return pontos.map(p => ({ ...p, ...resumoDespesaPontoMes(p, despesas, competencia) }));
}

const MODALIDADE_COR = {
  "Viapix":             "badge-mod-viapix",
  "90 da Sorte":        "badge-mod-90sorte",
  "Play Bet":           "badge-mod-playbet",
  "Máquina de Brindes": "badge-mod-brindes",
  "Jogo do Bicho":      "badge-mod-bicho",
  "Lotobanca":          "badge-mod-lotobanca",
};

function timestampSolicitacao(s) {
  const raw = s?.concluidoEm || s?.criadoEm || "";
  const t = raw ? new Date(raw).getTime() : 0;
  return Number.isNaN(t) ? 0 : t;
}

function modalidadesBloqueadasDoPonto(ponto, solicitacoes=[]) {
  return (ponto?.modalidades || []).filter(modalidade=>{
    const eventos = solicitacoes
      .filter(s=>
        s.status === "concluida" &&
        Number(s.pontoId) === Number(ponto.id) &&
        s.modalidade === modalidade &&
        (s.acao === "bloquear" || s.acao === "desbloquear")
      )
      .sort((a,b)=>timestampSolicitacao(a)-timestampSolicitacao(b));
    return eventos[eventos.length-1]?.acao === "bloquear";
  });
}

function BadgeModalidade({ m, bloqueada=false }) {
  return (
    <span className={`badge-modalidade ${MODALIDADE_COR[m]||"badge-mod-viapix"} ${bloqueada?"badge-modalidade-bloqueada":""}`}>
      {m}{bloqueada&&<em>Bloqueado</em>}
    </span>
  );
}

function acessosDoPonto(acessos=[], pontoId) {
  return acessos.filter(acesso => Number(acesso.pontoId) === Number(pontoId));
}

export function BadgeGerente({ gerente }) {
  const rota = rotaCanonica(gerente);
  return (
    <span className="pcf-route-badge">
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
  const dados = pontos.map(p=>({
    "Nome Fantasia":  p.nomeFantasia,
    "Nome do Dono":   p.nomeDono,
    "Telefone":       p.telefone,
    "Rota":           rotaCanonica(p.gerente),
    "Modalidades":    p.modalidades.join(", "),
    "Valor Despesa":  p.possuiDespesa==="sim"?p.valorDespesa:"",
    "Observação":     p.observacao||"—",
  }));
  exportarCsvSeguro(dados, `pontos_${hoje()}.csv`);
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
    nomeArquivo:`neptera_pontos_${hoje()}.pdf`,
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
  const dados = historico.map(h=>({
    "Tipo":          h.tipo==="cadastro"?"Cadastro":h.tipo==="edicao"?"Edição":"Exclusão",
    "Nome Fantasia": h.nome,
    "Gerente":       h.gerente,
    "Observação":    h.observacao||"—",
    "Data":          h.data,
  }));
  exportarCsvSeguro(dados, `historico_pontos_${hoje()}.csv`);
}

// ── Exportar PDF Histórico Pontos ─────────────────────────────────────────────
async function exportarHistoricoPontosPDF(historico){
  await gerarPDF({
    titulo:"Histórico de Pontos",
    descricao:"Registro de cadastros, alterações e exclusões de pontos",
    nomeArquivo:`neptera_historico_pontos_${hoje()}.pdf`,
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
    nomeArquivo:`neptera_historico-despesas_${competencia||"todos"}_${slugArquivo(busca||"geral")}.pdf`,
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
export function PointFormModal({ ponto, pontos=[], equipamentos=[], perfilAtual, acessos=[], podeEditarAcessos=false, onSalvar, onFechar, mostrarEquipamentos=true, onEditarEquipamento, onExcluirEquipamento }) {
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
    mostrarEquipamentos ? equipamentos.filter(i=>ponto&&i.localizacao===ponto.nomeFantasia).map(i=>i.id) : []
  );
  const [acessosForm, setAcessosForm] = useState(() => Object.fromEntries(
    acessos.map(acesso => [acesso.modalidade, {
      login: acesso.login || "",
      senha: acesso.senha || "",
      observacao: acesso.observacao || "",
    }])
  ));
  const [erro, setErro] = useState("");
  const gerentesFormulario = gerenteDoPerfil ? [gerenteDoPerfil] : GERENTES;
  const rotasFormulario = gerenteDoPerfil ? rotasDoPerfil : (ROTAS_POR_GERENTE[gerenteSelecionado] || []);
  const equipamentosDisponiveis = equipamentos.filter(item=>
    !item.localizacao || (ponto && item.localizacao===ponto.nomeFantasia)
  );
  const podeGerenciarEquipamentos = perfilAtual?.perfil === "administrador" && mostrarEquipamentos;

  function toggleModalidade(m) {
    setForm({...form, modalidades: form.modalidades.includes(m)
      ? form.modalidades.filter(x=>x!==m)
      : [...form.modalidades, m]});
  }

  function alterarAcesso(modalidade, campo, valor) {
    setAcessosForm(atual => ({
      ...atual,
      [modalidade]: {
        ...(atual[modalidade] || { login: "", senha: "", observacao: "" }),
        [campo]: valor,
      },
    }));
  }

  async function salvar() {
    const formNormalizado = { ...form, nomeFantasia: normalizarNomeFantasia(form.nomeFantasia) };
    const e = validarPonto(formNormalizado);
    if (e) { setErro(e); return; }
    const nome=formNormalizado.nomeFantasia.trim().toLowerCase();
    if(pontos.some(p=>p.id!==ponto?.id&&p.nomeFantasia.trim().toLowerCase()===nome)){
      setErro("Já existe um ponto com este nome. Use um nome diferente para não confundir a localização dos equipamentos.");
      return;
    }
    setErro("");
    try {
      const acessosParaSalvar = podeEditarAcessos
        ? formNormalizado.modalidades.map(modalidade => ({ modalidade, ...(acessosForm[modalidade] || {}) }))
        : null;
      await onSalvar({...formNormalizado, possuiDespesa: "nao", valorDespesa: 0}, mostrarEquipamentos ? equipamentosSelecionados : [], acessosParaSalvar);
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
    <OperationModal
      open
      title={ponto?"Editar Ponto":"Novo Ponto"}
      onClose={onFechar}
      closeLabel="Fechar formulário"
      closeOnBackdrop={false}
      size="lg"
      className="pcf-operation-modal modal-largo"
      overlayClassName="pcf-operation-modal-overlay"
      footer={<>
        <button className="btn-secundario" type="button" onClick={onFechar}>Cancelar</button>
        <button className="btn-primario" type="button" onClick={salvar}>{ponto?"Salvar Alterações":"Adicionar Ponto"}</button>
      </>}
    >
          {erro&&<div className="erro-msg" role="alert"><OperationIcon name="warning" size={17}/><span>{erro}</span></div>}
          <div className="campos-duplos">
            <div className="campo"><label>Nome Fantasia *</label>
              <input type="text" data-so-autofocus="true" placeholder="Ex: BAR DO ZÉ" value={form.nomeFantasia} onChange={e=>setForm({...form,nomeFantasia:e.target.value.toLocaleUpperCase("pt-BR")})}/></div>
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
          {podeEditarAcessos&&ponto?.id&&(
            <div className="campo ponto-acessos-editor">
              <div className="ponto-acessos-editor-head">
                <div>
                  <label>Acessos das modalidades</label>
                  <span className="campo-hint">Somente o administrador cadastra. O gerente apenas consulta dentro do ponto.</span>
                </div>
              </div>
              {form.modalidades.length===0
                ?<div className="info-box">Selecione uma modalidade para liberar campos de login e senha.</div>
                :<div className="ponto-acessos-editor-lista">
                  {form.modalidades.map(modalidade=>(
                    <section className="ponto-acesso-editor-card" key={modalidade}>
                      <strong>{modalidade}</strong>
                      <div className="campos-duplos">
                        <div className="campo">
                          <label>Login</label>
                          <input type="text" placeholder="Usuário, e-mail ou código" value={acessosForm[modalidade]?.login||""} onChange={e=>alterarAcesso(modalidade,"login",e.target.value)}/>
                        </div>
                        <div className="campo">
                          <label>Senha</label>
                          <input type="text" placeholder="Senha da modalidade" value={acessosForm[modalidade]?.senha||""} onChange={e=>alterarAcesso(modalidade,"senha",e.target.value)}/>
                        </div>
                      </div>
                      <div className="campo">
                        <label>Observação</label>
                        <input type="text" placeholder="Ex: usar no app, painel ou suporte" value={acessosForm[modalidade]?.observacao||""} onChange={e=>alterarAcesso(modalidade,"observacao",e.target.value)}/>
                      </div>
                    </section>
                  ))}
                </div>}
            </div>
          )}
          {mostrarEquipamentos&&(
            <div className="campo">
              <label>Equipamentos disponíveis para este ponto</label>
              {equipamentosDisponiveis.length===0
                ?<span className="campo-hint">Nenhum equipamento livre. Para trocar de ponto, use a aba Movimentar.</span>
                :<div className="modalidades-grid ponto-equipamentos-grid">
                  {equipamentosDisponiveis.map(item=>{
                    const selecionado = equipamentosSelecionados.includes(item.id);
                    return (
                      <div key={item.id} className={`modalidade-item ponto-equipamento-item ${selecionado?"modalidade-ativa":""}`}>
                        <label className="ponto-equipamento-check">
                          <input type="checkbox" checked={selecionado} onChange={()=>setEquipamentosSelecionados(prev=>prev.includes(item.id)?prev.filter(id=>id!==item.id):[...prev,item.id])}/>
                          <span>{item.nome}</span>
                        </label>
                        {podeGerenciarEquipamentos&&(
                          <div className="ponto-equipamento-acoes">
                            <button
                              type="button"
                              className="btn-editar"
                              onClick={()=>{
                                onFechar();
                                onEditarEquipamento?.(item);
                              }}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              className="btn-excluir"
                              onClick={()=>{
                                onFechar();
                                onExcluirEquipamento?.(item.id);
                              }}
                            >
                              Excluir do estoque
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>}
              <span className="campo-hint">Equipamentos que já estão em outro ponto só podem ser transferidos em Movimentar.</span>
            </div>
          )}
          <div className="campo"><label>Observação</label>
            <textarea placeholder="Informações adicionais..." rows={2} value={form.observacao} onChange={e=>setForm({...form,observacao:e.target.value})}/></div>
    </OperationModal>
  );
}

function PointAccessModal({ ponto, acessos=[], onFechar }) {
  const [senhasVisiveis, setSenhasVisiveis] = useState({});

  async function copiar(texto, label) {
    if (!texto) return;
    try {
      await navigator.clipboard.writeText(texto);
      window.alert(`${label} copiado.`);
    } catch {
      window.alert(`${label}: ${texto}`);
    }
  }

  return (
    <OperationModal
      open
      title="Acessos do ponto"
      subtitle={ponto.nomeFantasia}
      onClose={onFechar}
      closeLabel="Fechar acessos"
      closeOnBackdrop={false}
      size="md"
      className="pcf-operation-modal ponto-acessos-modal"
      overlayClassName="pcf-operation-modal-overlay"
      footer={<button className="btn-primario" type="button" data-so-autofocus="true" onClick={onFechar}>Fechar</button>}
    >
          {acessos.length===0
            ?<div className="info-box">Nenhum acesso cadastrado para as modalidades deste ponto.</div>
            :<div className="ponto-acessos-lista">
              {acessos.map(acesso=>{
                const senhaVisivel = Boolean(senhasVisiveis[acesso.id || acesso.modalidade]);
                const chave = acesso.id || acesso.modalidade;
                return (
                  <article className="ponto-acesso-card" key={chave}>
                    <div className="ponto-acesso-card-topo">
                      <strong>{acesso.modalidade}</strong>
                      <span>Acesso operacional</span>
                    </div>
                    <div className="ponto-acesso-linha">
                      <span>Login</span>
                      <button type="button" onClick={()=>copiar(acesso.login, "Login")}>{acesso.login || "Não informado"}</button>
                    </div>
                    <div className="ponto-acesso-linha">
                      <span>Senha</span>
                      <button type="button" onClick={()=>copiar(acesso.senha, "Senha")}>{senhaVisivel ? (acesso.senha || "Não informada") : "••••••••"}</button>
                    </div>
                    <button className="btn-secundario ponto-acesso-revelar" type="button" onClick={()=>setSenhasVisiveis(atual=>({...atual,[chave]:!senhaVisivel}))}>
                      {senhaVisivel ? "Ocultar senha" : "Mostrar senha"}
                    </button>
                    {acesso.observacao&&<p>{acesso.observacao}</p>}
                  </article>
                );
              })}
            </div>}
    </OperationModal>
  );
}

// ─── Modal Despesas ───────────────────────────────────────────────────────────
function PointExpensesModal({ pontos, despesas = [], competenciaInicial = competenciaAtual(), permitirSelecionarCompetencia = false, onFechar }) {
  const mesAtual = competenciaAtual();
  const [competencia, setCompetencia] = useState(competenciaInicial);
  const [pontoSelecionado, setPontoSelecionado] = useState(null);
  const [rotaSelecionada, setRotaSelecionada] = useState("Todas");
  const [situacaoSelecionada, setSituacaoSelecionada] = useState("com");
  const pontosCompetencia = aplicarResumoDespesaMes(pontos, despesas, competencia);
  const pontoTemDespesa = p=>p.possuiDespesa==="sim"&&Number(p.valorDespesa)>0;
  const despesasPessoais = despesas
    .filter(d=>isManagerExpense(d)&&String(d.competencia||"").slice(0,7)===competencia);
  const totalDespesasPontos = pontosCompetencia.reduce((s,p)=>s+(Number(p.valorDespesa)||0),0);
  const totalDespesasPessoais = despesasPessoais.reduce((s,d)=>s+valorDespesa(d),0);
  const resumoRotas = [...pontosCompetencia.reduce((mapa,p)=>{
    const rota = rotaCanonica(p.gerente) || "Sem rota";
    const atual = mapa.get(rota) || { rota, totalPontos:0, totalGerente:0, total:0, pontos:0, comDespesa:0, semDespesa:0 };
    atual.totalPontos += Number(p.valorDespesa) || 0;
    atual.pontos += 1;
    if (pontoTemDespesa(p)) atual.comDespesa += 1;
    else atual.semDespesa += 1;
    mapa.set(rota, atual);
    return mapa;
  },new Map()).values()];
  despesasPessoais.forEach(d=>{
    const rota = rotaCanonica(d.rota) || d.rota || "Sem rota";
    const atual = resumoRotas.find(item=>item.rota===rota) || { rota, totalPontos:0, totalGerente:0, total:0, pontos:0, comDespesa:0, semDespesa:0 };
    atual.totalGerente += valorDespesa(d);
    if (!resumoRotas.includes(atual)) resumoRotas.push(atual);
  });
  resumoRotas.forEach(item=>{item.total=item.totalPontos+item.totalGerente;});
  resumoRotas.sort((a,b)=>b.total-a.total||a.rota.localeCompare(b.rota,"pt-BR"));
  const pontosDaRota = rotaSelecionada==="Todas"
    ?pontosCompetencia
    :pontosCompetencia.filter(p=>(rotaCanonica(p.gerente)||"Sem rota")===rotaSelecionada);
  const pontosFiltrados = pontosDaRota
    .filter(p=>situacaoSelecionada==="todos"||(situacaoSelecionada==="com"?pontoTemDespesa(p):!pontoTemDespesa(p)))
    .sort((a,b)=>(Number(b.valorDespesa)||0)-(Number(a.valorDespesa)||0)||a.nomeFantasia.localeCompare(b.nomeFantasia,"pt-BR"));
  const despesasPessoaisDaRota = rotaSelecionada==="Todas"
    ? despesasPessoais
    : despesasPessoais.filter(d=>(rotaCanonica(d.rota)||d.rota||"Sem rota")===rotaSelecionada);
  const totalPontosFiltrado = pontosDaRota.reduce((s,p)=>s+(Number(p.valorDespesa)||0),0);
  const totalPessoalFiltrado = despesasPessoaisDaRota.reduce((s,d)=>s+valorDespesa(d),0);
  const totalFiltrado = totalPontosFiltrado+totalPessoalFiltrado;
  const totalComDespesa = pontosDaRota.filter(pontoTemDespesa).length;
  const totalSemDespesa = pontosDaRota.length-totalComDespesa;
  const despesasDoPonto = pontoSelecionado
    ? despesas
      .filter(d=>Number(d.pontoId)===Number(pontoSelecionado.id)&&String(d.competencia||"").slice(0,7)===competencia)
      .sort((a,b)=>String(a.descricao||"").localeCompare(String(b.descricao||""),"pt-BR"))
    : [];
  const alterarCompetencia = valor => {
    setCompetencia(valor || mesAtual);
    setPontoSelecionado(null);
    setRotaSelecionada("Todas");
    setSituacaoSelecionada("com");
  };
  return (
    <OperationModal
      open
      title={<><OperationIcon name="money"/>Despesas dos pontos</>}
      onClose={onFechar}
      closeLabel="Fechar despesas"
      size="lg"
      className="pcf-operation-modal modal-despesas-pontos"
      overlayClassName="pcf-operation-modal-overlay"
      footer={<button className="btn-primario" type="button" data-so-autofocus="true" onClick={onFechar}>Fechar</button>}
    >
          {permitirSelecionarCompetencia&&(
            <label className="despesas-competencia-filtro">
              <span>Mês de referência</span>
              <input type="month" value={competencia} max={mesAtual} onChange={e=>alterarCompetencia(e.target.value)}/>
            </label>
          )}
          <div className="despesas-total-banner">{pontoSelecionado?"Total do ponto":rotaSelecionada==="Todas"?"Total Geral":"Total da rota"}: <strong>{formatarReais(pontoSelecionado?.valorDespesa??totalFiltrado)}</strong></div>
          {!pontoSelecionado&&(
            <div className="despesas-origem-resumo">
              <span><small>Despesas dos pontos</small><strong>{formatarReais(totalPontosFiltrado)}</strong></span>
              <span><small>Despesas pessoais dos gerentes</small><strong>{formatarReais(totalPessoalFiltrado)}</strong></span>
            </div>
          )}
          {pontoSelecionado ? (
            <section className="despesas-ponto-detalhe">
              <button type="button" className="btn-secundario despesas-voltar" onClick={()=>setPontoSelecionado(null)}><OperationIcon name="chevronLeft"/> Voltar aos pontos</button>
              <div className="despesas-ponto-detalhe-head">
                <div><span>Ponto selecionado</span><h4>{pontoSelecionado.nomeFantasia} <PlayBetBadge ponto={pontoSelecionado}/></h4><small>{pontoSelecionado.nomeDono} · {pontoSelecionado.telefone}</small></div>
                <BadgeGerente gerente={pontoSelecionado.gerente}/>
              </div>
              <div className="despesas-lancamentos">
                {despesasDoPonto.length===0
                  ?<p className="tabela-vazia">Não há lançamentos detalhados para este ponto em {mesLabel(`${competencia}-01`)}.</p>
                  :despesasDoPonto.map(d=>(
                    <article className="despesas-lancamento" key={d.id}>
                      <div><strong>{d.descricao||"Despesa sem descrição"}</strong>{d.observacao&&<small>{d.observacao}</small>}</div>
                      <b>{formatarReais(valorDespesa(d))}</b>
                    </article>
                  ))}
              </div>
            </section>
          ) : (
            <>
              <section className="despesas-rotas-filtro">
                <label>Filtrar por rota
                  <select value={rotaSelecionada} onChange={e=>setRotaSelecionada(e.target.value)}>
                    <option value="Todas">Todas as rotas — {formatarReais(totalDespesasPontos+totalDespesasPessoais)}</option>
                    {resumoRotas.map(item=><option key={item.rota} value={item.rota}>{item.rota} — {formatarReais(item.total)}</option>)}
                  </select>
                </label>
                <div className="despesas-rotas-ranking">
                  {resumoRotas.map((item,indice)=>(
                    <button type="button" className={rotaSelecionada===item.rota?"ativo":""} key={item.rota} onClick={()=>setRotaSelecionada(item.rota)}>
                      <span><i>{indice+1}º</i>{item.rota}</span>
                      <strong>{formatarReais(item.total)}</strong>
                      <small><em>{item.comDespesa} com despesa</em><em className="sem-despesa">{item.semDespesa} sem despesa</em></small>
                      {item.totalGerente>0&&<small className="despesas-gerente-sinal"><OperationIcon name="user" size={13}/>Gerente: {formatarReais(item.totalGerente)}</small>}
                    </button>
                  ))}
                </div>
                {despesasPessoaisDaRota.length>0&&(
                  <div className="despesas-gerentes-resumo">
                    <h4><OperationIcon name="user"/>Despesas pessoais dos gerentes</h4>
                    {despesasPessoaisDaRota.map(d=>(
                      <article key={d.id}>
                        <div><strong>{d.gerente||"Gerente"}</strong><small>{d.rota||"Sem rota"} · {d.descricao||"Despesa sem descrição"}</small></div>
                        <b>{formatarReais(valorDespesa(d))}</b>
                      </article>
                    ))}
                  </div>
                )}
                <div className="despesas-situacao-filtro" role="group" aria-label="Filtrar pontos pela situação da despesa">
                  <button type="button" className={situacaoSelecionada==="todos"?"ativo":""} onClick={()=>setSituacaoSelecionada("todos")}>Todos <b>{pontosDaRota.length}</b></button>
                  <button type="button" className={situacaoSelecionada==="com"?"ativo":""} onClick={()=>setSituacaoSelecionada("com")}>Com despesas <b>{totalComDespesa}</b></button>
                  <button type="button" className={`sem-despesa ${situacaoSelecionada==="sem"?"ativo":""}`} onClick={()=>setSituacaoSelecionada("sem")}>Sem despesas <b>{totalSemDespesa}</b></button>
                </div>
              </section>
              <div className="despesas-pontos-lista">
              {pontosFiltrados.length===0
                ?<p className="tabela-vazia">Nenhum ponto encontrado neste filtro.</p>
                :pontosFiltrados.map(p=>(
                  <button type="button" className="despesas-ponto-linha" key={p.id} onClick={()=>setPontoSelecionado(p)}>
                    <div><strong>{p.nomeFantasia} <PlayBetBadge ponto={p}/></strong><small>{p.nomeDono}</small></div>
                    <BadgeGerente gerente={p.gerente}/>
                    <b className={pontoTemDespesa(p)?"":"sem-despesa"}>{pontoTemDespesa(p)?formatarReais(p.valorDespesa):"Sem despesa"}</b>
                    <span aria-hidden="true">›</span>
                  </button>
                ))}
              </div>
            </>
          )}
    </OperationModal>
  );
}

// ─── ABA: Visão Geral ─────────────────────────────────────────────────────────
function AbaVisaoGeral({ pontos, despesas = [], competencia = competenciaAtual(), onVerDespesas, onAbrirPontos, mostrarDespesas=true }) {
  const totalPontos   = pontos.length;
  const comDespesa    = pontos.filter(p=>p.possuiDespesa==="sim").length;
  const semDespesa    = pontos.filter(p=>p.possuiDespesa==="nao").length;
  const ativos        = pontos.filter(p=>p.situacaoOperacional!=="desativado").length;
  const desativados   = totalPontos-ativos;
  const totalPontosDespesas = pontos.reduce((s,p)=>s+(p.valorDespesa||0),0);
  const totalGerentesDespesas = despesas
    .filter(d=>isManagerExpense(d)&&String(d.competencia||"").slice(0,7)===competencia)
    .reduce((s,d)=>s+valorDespesa(d),0);
  const totalDespesas = totalPontosDespesas+totalGerentesDespesas;

  return (
    <section className="pcf-overview pcf-network-pulse" aria-label="Posição atual da rede">
      <div className="pcf-pulse-context">
        <span>Rede agora</span>
        <small><OperationIcon name="clock" size={13}/>{mesLabel(`${competencia}-01`)}</small>
      </div>
      <button type="button" className="is-primary" onClick={()=>onAbrirPontos("todos")}>
        <strong>{totalPontos}</strong><span>Pontos</span><small>{ativos} ativos · {desativados} desativados</small>
      </button>
      {mostrarDespesas&&<>
        <button type="button" onClick={()=>onAbrirPontos("nao")}>
          <strong>{semDespesa}</strong><span>Sem despesa</span><small>Exigem conferência</small>
        </button>
        <button type="button" onClick={()=>onAbrirPontos("sim")}>
          <strong>{comDespesa}</strong><span>Com despesa</span><small>{formatarReais(totalPontosDespesas)}</small>
        </button>
        <button type="button" className="pcf-pulse-finance" onClick={onVerDespesas}>
          <strong>{formatarReais(totalDespesas)}</strong><span>Total da competência</span><small>{formatarReais(totalGerentesDespesas)} em gerentes</small>
        </button>
      </>}
    </section>
  );
}

// ─── ABA: Pontos Cadastrados ───────────────────────────────────────────────────
function AbaPontos({ pontos, equipamentos, historico=[], acessos=[], solicitacoes=[], solicitacoesStatus=[], busca, onBuscaChange, onLimparBusca, filtroDespesa, onFiltroDespesaChange, onLimparFiltro, onEditar, onDespesas, onSolicitarModalidade, onSolicitarDesativacao, onReativar, onVerAcessos, onExportExcel, onExportPDF, podeEditar, podeEditarDespesas, podeSolicitarModalidade, podeSolicitarDesativacao, podeReativar, mostrarDespesas=true }) {
  const [filtroGerente, setFiltroGerente] = useState("Todos");
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [pontoSelecionadoId, setPontoSelecionadoId] = useState(null);
  const [dossieEmSheet, setDossieEmSheet] = useState(()=>typeof window!=="undefined"&&window.matchMedia?.("(max-width: 1024px)").matches);
  const dossieRef = useRef(null);
  const focoAntesDossieRef = useRef(null);
  const POR_PAGINA=25;
  const filtrados = pontos.filter(p=>{
    const q=busca.toLowerCase();
    const vinculados=equipamentos.filter(i=>i.localizacao===p.nomeFantasia);
    const mB=!busca||[p.nomeFantasia,p.nomeDono,p.telefone,p.gerente,rotaCanonica(p.gerente),gerenteDaRota(p.gerente),...vinculados.map(i=>i.nome)].some(f=>(f||"").toLowerCase().includes(q));
    const mD=!mostrarDespesas||filtroDespesa==="todos"||p.possuiDespesa===filtroDespesa;
    return mB&&mD&&(filtroGerente==="Todos"||rotaCanonica(p.gerente)===filtroGerente);
  });
  const ordenados=[...filtrados].sort((a,b)=>rotaCanonica(a.gerente).localeCompare(rotaCanonica(b.gerente),"pt-BR")||a.nomeFantasia.localeCompare(b.nomeFantasia,"pt-BR"));
  const totalPaginas=Math.max(1,Math.ceil(ordenados.length/POR_PAGINA));
  const paginaAtual=Math.min(pagina,totalPaginas);
  const visiveis=ordenados.slice((paginaAtual-1)*POR_PAGINA,paginaAtual*POR_PAGINA);
  useEffect(()=>setPagina(1),[busca,filtroGerente,filtroDespesa]);
  useEffect(()=>{
    if(typeof window==="undefined"||!window.matchMedia)return undefined;
    const consulta=window.matchMedia("(max-width: 1024px)");
    const atualizar=()=>setDossieEmSheet(consulta.matches);
    atualizar();
    consulta.addEventListener?.("change",atualizar);
    return()=>consulta.removeEventListener?.("change",atualizar);
  },[]);
  const dadosOperacionais = ponto => {
    const vinculados=equipamentos.filter(i=>i.localizacao===ponto.nomeFantasia);
    const bloqueadas=modalidadesBloqueadasDoPonto(ponto, solicitacoes);
    const totalAcessos=acessosDoPonto(acessos, ponto.id).length;
    const desativado=ponto.situacaoOperacional==="desativado";
    const desativacaoPendente=solicitacoesStatus.some(s=>Number(s.pontoId)===Number(ponto.id)&&s.status==="pendente");
    const nomeNormalizado=String(ponto.nomeFantasia||"").trim().toLocaleLowerCase("pt-BR");
    const rastros=historico.filter(item=>String(item.nome||"").trim().toLocaleLowerCase("pt-BR")===nomeNormalizado).slice(0,4);
    return { vinculados, bloqueadas, totalAcessos, desativado, desativacaoPendente, rastros };
  };
  const pontoSelecionado=visiveis.find(p=>Number(p.id)===Number(pontoSelecionadoId))||null;
  const selecionado=pontoSelecionado?dadosOperacionais(pontoSelecionado):null;
  const filtrosAtivos=(filtroGerente!=="Todos"?1:0)+(mostrarDespesas&&filtroDespesa!=="todos"?1:0);
  const limparFiltrosSecundarios=()=>{
    setFiltroGerente("Todos");
    onLimparFiltro();
  };
  const limparTudo=()=>{
    onLimparBusca();
    limparFiltrosSecundarios();
  };
  const chipsFiltros=filtrosAtivos>0?<>
    {filtroGerente!=="Todos"&&<button type="button" className="pcf-filter-chip" onClick={()=>setFiltroGerente("Todos")} aria-label={`Remover filtro de rota ${filtroGerente}`}>Rota: {filtroGerente}<OperationIcon name="close" size={13}/></button>}
    {mostrarDespesas&&filtroDespesa!=="todos"&&<button type="button" className="pcf-filter-chip" onClick={onLimparFiltro} aria-label="Remover filtro de despesa">{filtroDespesa==="sim"?"Com despesa":"Sem despesa"}<OperationIcon name="close" size={13}/></button>}
  </>:null;

  useEffect(()=>{
    if(!pontoSelecionadoId||!dossieEmSheet)return undefined;
    const painel=dossieRef.current;
    if(!painel)return undefined;
    const trigger=focoAntesDossieRef.current||document.querySelector(`[data-ponto-id="${pontoSelecionadoId}"]`);
    const seletor='button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focaveis=()=>Array.from(painel.querySelectorAll(seletor)).filter(elemento=>elemento.getClientRects().length>0);
    const liberarScroll=acquireMainScrollLock();
    const frame=window.requestAnimationFrame(()=>{
      const alvo=painel.querySelector("[data-pcf-dossier-autofocus='true']")||focaveis()[0]||painel;
      alvo.focus({preventScroll:true});
    });
    function controlarTeclado(event){
      if(event.key==="Escape"){
        event.preventDefault();
        event.stopPropagation();
        setPontoSelecionadoId(null);
        return;
      }
      if(event.key!=="Tab")return;
      const itens=focaveis();
      if(!itens.length){event.preventDefault();painel.focus({preventScroll:true});return;}
      const primeiro=itens[0];
      const ultimo=itens[itens.length-1];
      const ativo=document.activeElement;
      if(event.shiftKey&&(ativo===primeiro||!painel.contains(ativo))){event.preventDefault();ultimo.focus({preventScroll:true});}
      else if(!event.shiftKey&&(ativo===ultimo||!painel.contains(ativo))){event.preventDefault();primeiro.focus({preventScroll:true});}
    }
    document.addEventListener("keydown",controlarTeclado);
    return()=>{
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown",controlarTeclado);
      liberarScroll();
      focoAntesDossieRef.current=null;
      if(trigger?.isConnected)window.requestAnimationFrame(()=>trigger.focus({preventScroll:true}));
    };
  },[dossieEmSheet,pontoSelecionadoId]);
  function selecionarPonto(ponto,gatilho){
    if(dossieEmSheet)focoAntesDossieRef.current=gatilho instanceof HTMLElement?gatilho:document.activeElement;
    setPontoSelecionadoId(ponto.id);
  }
  function fecharDossie(){setPontoSelecionadoId(null);}
  function executarAcaoDossie(acao){
    if(!dossieEmSheet){acao();return;}
    const gatilho=focoAntesDossieRef.current;
    focoAntesDossieRef.current=null;
    setPontoSelecionadoId(null);
    window.requestAnimationFrame(()=>{
      if(gatilho instanceof HTMLElement&&gatilho.isConnected)gatilho.focus({preventScroll:true});
      acao();
    });
  }

  return (
    <section className="pcf-workbench" aria-labelledby="pcf-ledger-title">
      <FilterBar
        className="pcf-filter-command"
        ariaHidden={dossieEmSheet&&pontoSelecionado?"true":undefined}
        inert={dossieEmSheet&&pontoSelecionado?true:undefined}
        title={null}
        ariaLabel="Busca e filtros da rede de pontos"
        primary={<div className="pcf-command-search">
          <label className="pcf-visually-hidden" htmlFor="pcf-point-search-input">Buscar pontos</label>
          <OperationIcon name="search" size={17}/>
          <input
            id="pcf-point-search-input"
            type="search"
            placeholder="Buscar ponto, responsável, telefone, rota ou equipamento"
            value={busca}
            onChange={e=>onBuscaChange(e.target.value)}
          />
          {busca&&<button type="button" onClick={onLimparBusca} aria-label="Limpar busca"><OperationIcon name="close" size={15}/></button>}
        </div>}
        secondary={<>
          <label className="pcf-select-control">
            <span>Rota</span>
            <select value={filtroGerente} onChange={e=>setFiltroGerente(e.target.value)}>
              <option value="Todos">Todas as rotas</option>
              {ROTAS.map(r=><option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          {mostrarDespesas&&<label className="pcf-select-control">
            <span>Despesa na competência</span>
            <select value={filtroDespesa} onChange={e=>onFiltroDespesaChange(e.target.value)}>
              <option value="todos">Todas as situações</option>
              <option value="sim">Com despesa</option>
              <option value="nao">Sem despesa</option>
            </select>
          </label>}
        </>}
        activeCount={filtrosAtivos}
        secondaryOpen={filtrosAbertos}
        onSecondaryToggle={setFiltrosAbertos}
        secondaryLabel="Filtros"
        onClear={limparFiltrosSecundarios}
        clearLabel="Limpar filtros"
        chips={chipsFiltros}
      />

      <header className="pcf-ledger-toolbar" aria-hidden={dossieEmSheet&&pontoSelecionado?"true":undefined} inert={dossieEmSheet&&pontoSelecionado?true:undefined}>
        <div>
          <span className="pcf-eyebrow">Rede operacional</span>
          <h2 id="pcf-ledger-title">Pontos encontrados<span>{filtrados.length}</span></h2>
        </div>
        <div className="pcf-ledger-tools">
          <button type="button" className="pcf-icon-action" onClick={onExportExcel} aria-label="Exportar pontos em CSV" title="Exportar CSV"><OperationIcon name="file"/></button>
          <button type="button" className="pcf-icon-action" onClick={onExportPDF} aria-label="Exportar pontos em PDF" title="Exportar PDF"><OperationIcon name="receipt"/></button>
        </div>
      </header>

      {filtrados.length===0 ? (
        <EmptyState
          className="pcf-empty"
          icon="search"
          title="Nenhum ponto encontrado"
          description="Revise a busca ou os filtros para voltar à rede."
          action={(busca||filtrosAtivos>0)?<button type="button" className="pcf-button pcf-button--secondary" onClick={limparTudo}>Limpar busca e filtros</button>:null}
        />
      ) : (
        <div className="pcf-master-detail">
          <div className="pcf-master-pane" inert={dossieEmSheet&&pontoSelecionado?true:undefined} aria-hidden={dossieEmSheet&&pontoSelecionado?"true":undefined}>
            <div className={`pcf-ledger-columns ${mostrarDespesas?"has-expense":""}`} aria-hidden="true">
              <span>Ponto / responsável</span><span>Rota</span><span>Serviços</span><span>Equip.</span>{mostrarDespesas&&<span>Despesa</span>}<span>Situação</span>
            </div>
            <div className="pcf-records" aria-label="Pontos encontrados">
              {visiveis.map(p=>{
                const dados=dadosOperacionais(p);
                const selecionadoAtual=Number(pontoSelecionado?.id)===Number(p.id);
                const modalidadesAtivas=(p.modalidades||[]).filter(m=>!dados.bloqueadas.includes(m));
                return <button
                  type="button"
                  key={p.id}
                  data-ponto-id={p.id}
                  className={`pcf-record ${mostrarDespesas?"has-expense":""} ${selecionadoAtual?"is-selected":""} ${dados.desativado?"is-disabled":""}`}
                  aria-pressed={selecionadoAtual}
                  aria-haspopup={dossieEmSheet?"dialog":undefined}
                  onClick={event=>selecionarPonto(p,event.currentTarget)}
                >
                  <span className="pcf-record-identity"><strong>{p.nomeFantasia}<PlayBetBadge ponto={p}/></strong><small>{p.nomeDono} · {p.telefone}</small></span>
                  <span><BadgeGerente gerente={p.gerente}/></span>
                  <span className="pcf-record-count"><b>{modalidadesAtivas.length}</b><small>{dados.bloqueadas.length?`${dados.bloqueadas.length} bloqueado${dados.bloqueadas.length!==1?"s":""}`:"operando"}</small></span>
                  <span className="pcf-record-count"><b>{dados.vinculados.length}</b><small>vinculados</small></span>
                  {mostrarDespesas&&<span className="pcf-record-money">{p.possuiDespesa==="sim"?formatarReais(p.valorDespesa):"—"}</span>}
                  <span className="pcf-record-state">
                    <StatusBadge className={dados.desativado?"ponto-status-desativado":""} tone={dados.desativado?"neutral":dados.desativacaoPendente?"warning":"success"} label={dados.desativado?"Desativado":dados.desativacaoPendente?"Pendente":"Ativo"}/>
                    <OperationIcon name="chevronRight" size={15}/>
                  </span>
                </button>;
              })}
            </div>
            {filtrados.length>POR_PAGINA&&<Pagination page={paginaAtual} totalPages={totalPaginas} totalItems={filtrados.length} itemLabel="pontos" onPageChange={setPagina} className="pcf-pagination"/>}
          </div>

          {dossieEmSheet&&pontoSelecionado&&selecionado&&<button type="button" className="pcf-dossier-backdrop" tabIndex={-1} aria-label="Fechar dossiê" onClick={fecharDossie}/>}
          {pontoSelecionado&&selecionado?<aside ref={dossieRef} className="pcf-dossier" role={dossieEmSheet?"dialog":undefined} aria-modal={dossieEmSheet?"true":undefined} aria-labelledby="pcf-dossier-title" tabIndex={dossieEmSheet?-1:undefined}>
            <header className="pcf-dossier-header">
              <div className="pcf-dossier-monogram" aria-hidden="true">{String(pontoSelecionado.nomeFantasia||"P").trim().slice(0,2)}</div>
              <div>
                <span className="pcf-eyebrow">Dossiê do ponto</span>
                <h3 id="pcf-dossier-title">{pontoSelecionado.nomeFantasia}<PlayBetBadge ponto={pontoSelecionado}/></h3>
                <BadgeGerente gerente={pontoSelecionado.gerente}/>
              </div>
              <button type="button" className="pcf-dossier-close" data-pcf-dossier-autofocus="true" onClick={fecharDossie} aria-label="Fechar dossiê"><OperationIcon name="close" size={18}/></button>
            </header>

            <div className="pcf-dossier-status">
              <StatusBadge tone={selecionado.desativado?"neutral":"success"} label={selecionado.desativado?"Operação desativada":"Operação ativa"}/>
              {selecionado.desativacaoPendente&&<StatusBadge tone="warning" label="Desativação pendente"/>}
              {selecionado.bloqueadas.length>0&&<StatusBadge tone="danger" label={`${selecionado.bloqueadas.length} serviço${selecionado.bloqueadas.length!==1?"s":""} bloqueado${selecionado.bloqueadas.length!==1?"s":""}`}/>}
            </div>

            <dl className="pcf-contact-strip">
              <div><dt>Responsável</dt><dd>{pontoSelecionado.nomeDono}</dd></div>
              <div><dt>Telefone</dt><dd>{pontoSelecionado.telefone}</dd></div>
            </dl>

            <div className="pcf-operational-spine">
              <section>
                <span className="pcf-spine-node"><OperationIcon name="check" size={15}/></span>
                <div><small>Situação</small><strong>{selecionado.desativado?"Fora dos seletores ativos":"Disponível na operação"}</strong></div>
              </section>
              <section>
                <span className="pcf-spine-node"><OperationIcon name="file" size={15}/></span>
                <div><small>Serviços</small><strong>{(pontoSelecionado.modalidades||[]).length} cadastrados</strong><div className="modalidades-badges">{(pontoSelecionado.modalidades||[]).map(m=><BadgeModalidade key={m} m={m} bloqueada={selecionado.bloqueadas.includes(m)}/>)}</div></div>
              </section>
              <section>
                <span className="pcf-spine-node"><OperationIcon name="refresh" size={15}/></span>
                <div><small>Equipamentos</small><strong>{selecionado.vinculados.length?`${selecionado.vinculados.length} no ponto`:"Nenhum vinculado"}</strong>{selecionado.vinculados.length>0&&<ul>{selecionado.vinculados.map(i=><li key={i.id}>{i.nome}</li>)}</ul>}</div>
              </section>
              {mostrarDespesas&&<section>
                <span className="pcf-spine-node"><OperationIcon name="money" size={15}/></span>
                <div><small>Despesa da competência</small><strong>{pontoSelecionado.possuiDespesa==="sim"?formatarReais(pontoSelecionado.valorDespesa):"Sem lançamento"}</strong></div>
              </section>}
            </div>

            {pontoSelecionado.observacao&&<div className="pcf-dossier-note"><span>Observação</span><p>{pontoSelecionado.observacao}</p></div>}

            <section className="pcf-dossier-history" aria-label="Histórico recente do ponto">
              <header><span>Rastro recente</span><b>{selecionado.rastros.length}</b></header>
              {selecionado.rastros.length>0?<ol>{selecionado.rastros.map(item=><li key={item.id}><OperationIcon name={item.tipo==="cadastro"?"plus":item.tipo==="edicao"?"edit":"trash"} size={13}/><span><strong>{item.observacao||item.tipo}</strong><small>{item.data||"Data não informada"}</small></span></li>)}</ol>:<p>Nenhuma movimentação registrada para este ponto.</p>}
            </section>

            <div className="pcf-dossier-actions" aria-label="Ações do ponto">
              {selecionado.totalAcessos>0&&<button type="button" className="pcf-button pcf-button--secondary" onClick={()=>executarAcaoDossie(()=>onVerAcessos?.(pontoSelecionado))}><OperationIcon name="lock"/>Acessos ({selecionado.totalAcessos})</button>}
              {podeSolicitarModalidade&&<button type="button" className="pcf-button pcf-button--secondary" onClick={()=>executarAcaoDossie(()=>onSolicitarModalidade(pontoSelecionado))}><OperationIcon name="warning"/>Bloquear / liberar</button>}
              {podeEditarDespesas&&<button type="button" className="pcf-button pcf-button--secondary" onClick={()=>executarAcaoDossie(()=>onDespesas(pontoSelecionado))}><OperationIcon name="money"/>Despesas</button>}
              {podeEditar&&<button type="button" className="pcf-button pcf-button--secondary" onClick={()=>executarAcaoDossie(()=>onEditar(pontoSelecionado))}><OperationIcon name="edit"/>Editar</button>}
              {podeSolicitarDesativacao&&!selecionado.desativado&&!selecionado.desativacaoPendente&&<button type="button" className="pcf-button pcf-button--warning" onClick={()=>executarAcaoDossie(()=>onSolicitarDesativacao(pontoSelecionado))}><OperationIcon name="clock"/>Solicitar desativação</button>}
              {podeReativar&&selecionado.desativado&&<button type="button" className="pcf-button pcf-button--primary" onClick={()=>executarAcaoDossie(()=>onReativar(pontoSelecionado))}><OperationIcon name="refresh"/>Reativar ponto</button>}
            </div>
          </aside>:<aside className="pcf-dossier pcf-dossier--empty" aria-label="Dossiê do ponto"><OperationIcon name="mapPin" size={20}/><span>Selecione um ponto na rede para abrir o dossiê.</span></aside>}
        </div>
      )}
    </section>
  );
}

function PointMonthlyExpensesModal({ ponto=null, gerenteDespesa="", rotasGerente=[], despesas = [], prorrogacoes = [], competenciaInicial=competenciaAtual(), onSalvar, onRemover, onFechar, podeEditar, perfilAtual }) {
  const gerente = perfilAtual?.perfil === "gerente";
  const despesaDoGerente = Boolean(gerenteDespesa);
  const [rota, setRota] = useState(rotasGerente[0] || "");
  const [competencia, setCompetencia] = useState(competenciaInicial);
  const criarLinha = () => ({ id:null, descricao:"", valor:"", observacao:"" });
  const [linhas, setLinhas] = useState([]);
  const [erro, setErro] = useState("");
  const mesAtual = competenciaAtual();
  const nomeGerentePerfil = perfilAtual?.gerenteNome || perfilAtual?.nome || gerenteDespesa;
  const prorrogacaoAtiva = useProrrogacaoDespesa(prorrogacoes,nomeGerentePerfil,competencia);
  const gerenteNoMesAtual = !gerente || competencia === mesAtual;
  const gerenteDentroPrazo = !gerente || gerentePodeLancarDespesas();
  const podeEditarAgora = podeEditar && ((gerenteNoMesAtual && gerenteDentroPrazo) || Boolean(prorrogacaoAtiva));
  const consultandoMesAnterior = gerente && competencia !== mesAtual;
  const competenciaTexto = new Date(`${competencia}-02T12:00:00`).toLocaleDateString("pt-BR", { month:"long", year:"numeric" });
  const pertenceAoContexto = d => despesaDoGerente
    ? expenseBelongsToManager(d, gerenteDespesa) && (!rota || d.rota === rota)
    : Number(d.pontoId) === Number(ponto?.id);
  const despesasMes = despesas.filter(d => pertenceAoContexto(d) && String(d.competencia || "").slice(0,7) === competencia);

  useEffect(() => {
    const despesasDoMes = despesas
      .filter(d => pertenceAoContexto(d) && String(d.competencia || "").slice(0,7) === competencia);
    const base = despesasDoMes
      .map(d => ({
        id:d.id, descricao:d.descricao || "",
        valor:valorDespesa(d) ? mascaraMoeda(String(Math.round(valorDespesa(d)*100))) : "",
        observacao:d.observacao || "",
      }));
    setLinhas(gerente && competencia !== mesAtual && !prorrogacaoAtiva
      ? base
      : base.length ? [...base, criarLinha()] : [criarLinha(), criarLinha(), criarLinha(), criarLinha()]);
    setErro("");
  }, [ponto?.id, gerenteDespesa, rota, competencia, despesas, prorrogacaoAtiva]);

  const totalBrutoMes = linhas.reduce((s,l)=>s+parseMoeda(l.valor),0);
  const totalMes = Math.max(0, totalBrutoMes);

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
    if (gerente && competencia !== mesAtual && !prorrogacaoAtiva) {
      setErro("Gerente só pode lançar despesas do mês atual. Meses anteriores ficam disponíveis apenas para conferência do administrador.");
      return;
    }
    if (gerente && !gerenteDentroPrazo && !prorrogacaoAtiva) {
      setErro("As despesas do mês só podem ser lançadas do dia 10 até o último dia do mês.");
      return;
    }
    const validas = linhas
      .map(l => ({...l, descricao:l.descricao.trim(), observacao:String(l.observacao||"").trim(), valorNumero:parseMoeda(l.valor)}))
      .filter(l => l.descricao || l.valorNumero>0 || l.observacao);
    const erroLinha = validas.find(l => !l.descricao || l.valorNumero<=0);
    if (erroLinha) { setErro("Preencha descrição e valor somente nas linhas que deseja salvar. Linhas vazias podem ficar em branco."); return; }
    try {
      const payload = validas.map(l => ({
        ...l,
        tipo:"fixa",
        pontoId:despesaDoGerente ? null : ponto.id,
        gerente:despesaDoGerente ? gerenteDespesa : "",
        rota:despesaDoGerente ? rota : "",
        competencia:`${competencia}-01`,
        valorPrevisto:l.valorNumero,
        valorReal:l.valorNumero,
      }));
      await onSalvar(despesaDoGerente ? { gerente:gerenteDespesa, rota } : ponto, competencia, payload);
    } catch (e) {
      setErro(e?.message || "Não foi possível salvar as despesas. Tente novamente.");
    }
  }

  return (
    <OperationModal
      open
      title={despesaDoGerente ? `Minhas despesas · ${gerenteDespesa}` : `Despesas mensais · ${ponto.nomeFantasia}`}
      onClose={onFechar}
      closeLabel="Fechar despesas mensais"
      size="xl"
      className="pcf-operation-modal modal-extra-largo"
      overlayClassName="pcf-operation-modal-overlay"
      footer={<>
        <button className="btn-secundario" type="button" data-so-autofocus="true" onClick={onFechar}>Fechar</button>
        {podeEditarAgora&&<button className="btn-primario" type="button" onClick={salvar}>Salvar despesas</button>}
      </>}
    >
          {erro&&<div className="erro-msg" role="alert"><OperationIcon name="warning" size={17}/><span>{erro}</span></div>}
          {prorrogacaoAtiva&&<div className="info-box despesa-excecao-aviso">Prazo disponível para esta competência: lançamentos permitidos até {formatarPrazoProrrogacao(prorrogacaoAtiva.expiraEm)}. Após esse horário, o mês será bloqueado automaticamente.</div>}
          {despesaDoGerente&&rotasGerente.length>1&&(
            <div className="campo despesa-rota-campo">
              <label>Rota da despesa</label>
              <select value={rota} onChange={e=>setRota(e.target.value)}>
                {rotasGerente.map(item=><option key={item} value={item}>{item}</option>)}
              </select>
              <small>A despesa será somada ao fechamento desta rota.</small>
            </div>
          )}
          <div className={`despesa-planilha-topo ${gerente?"despesa-planilha-topo-gerente":""}`}>
            {gerente?(
              <div className="despesa-gerente-periodo">
                <div className={`despesa-periodo-atual ${consultandoMesAnterior?"consulta":""} ${!consultandoMesAnterior&&!podeEditarAgora?"fechado":""}`}>
                  <span className="despesa-periodo-icone"><OperationIcon name="clock"/></span>
                  <div>
                    <small>{prorrogacaoAtiva?"Prazo disponível para lançamento":consultandoMesAnterior?"Consultando mês anterior":podeEditarAgora?"Lançamento do mês atual":"Mês atual · lançamento abre dia 10"}</small>
                    <strong>{competenciaTexto}</strong>
                  </div>
                  {consultandoMesAnterior&&<button type="button" onClick={()=>setCompetencia(mesAtual)}>Voltar ao atual</button>}
                </div>
                <details className="despesa-consulta-meses" open={consultandoMesAnterior||undefined}>
                  <summary>Consultar outro mês</summary>
                  <div className="campo despesa-mes-campo">
                    <label>Escolha um mês anterior</label>
                    <input type="month" value={competencia} max={mesAtual} onChange={e=>setCompetencia(e.target.value||mesAtual)}/>
                    <small>{prorrogacaoAtiva?`Esta competência pode ser editada até ${formatarPrazoProrrogacao(prorrogacaoAtiva.expiraEm)}.`:"Meses anteriores ficam disponíveis somente para consulta."}</small>
                  </div>
                </details>
              </div>
            ):(
              <div className="campo despesa-mes-campo">
                <label>Mês de referência</label>
                <input type="month" value={competencia} onChange={e=>setCompetencia(e.target.value)}/>
                <small>Clique no campo para escolher o mês.</small>
              </div>
            )}
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
                    <td>{podeEditarAgora&&<button className="btn-remover-linha" title="Remover linha" aria-label={`Remover linha ${index+1}`} onClick={()=>removerLinha(index)}><OperationIcon name="close"/></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="despesa-mobile-lista">
            {linhas.map((linha,index)=>(
              <article className="despesa-mobile-card" key={`mobile-${linha.id||"nova"}-${index}`}>
                <div className="despesa-mobile-card-head">
                  <span>Despesa {index + 1}</span>
                  {podeEditarAgora&&<button className="btn-remover-linha" title="Remover linha" aria-label={`Remover linha ${index+1}`} onClick={()=>removerLinha(index)}><OperationIcon name="close"/></button>}
                </div>
                <div className="campo">
                  <label>Descrição</label>
                  <input value={linha.descricao} disabled={!podeEditarAgora} placeholder="Ex: Internet, aluguel, energia" onChange={e=>alterarLinha(index,"descricao",e.target.value)}/>
                </div>
                <div className="campo">
                  <label>Valor</label>
                  <input value={linha.valor} disabled={!podeEditarAgora} placeholder="R$ 0,00" inputMode="decimal" onChange={e=>alterarLinha(index,"valor",mascaraMoeda(e.target.value))}/>
                </div>
                <div className="campo">
                  <label>Observação</label>
                  <input value={linha.observacao} disabled={!podeEditarAgora} placeholder="Opcional" onChange={e=>alterarLinha(index,"observacao",e.target.value)}/>
                </div>
              </article>
            ))}
          </div>
          {podeEditarAgora&&<button className="btn-secundario despesa-add-linha" onClick={()=>setLinhas(prev=>[...prev,criarLinha()])}>+ Adicionar mais despesas</button>}
          {despesasMes.length===0&&<p className="acessos-nota">{consultandoMesAnterior
            ?`Nenhuma despesa registrada em ${competenciaTexto}.`
            :despesaDoGerente
              ?"Nenhuma despesa própria lançada neste mês. Adicione uma despesa, informe o valor e salve."
              :"Nenhuma despesa lançada para este ponto neste mês. Adicione uma despesa, informe o valor e salve."}</p>}
    </OperationModal>
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
    if (!modalidade) { setErro("Selecione o serviço."); return; }
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
    <OperationModal
      open
      title={<><OperationIcon name="warning"/>Bloquear ou liberar serviço</>}
      onClose={onFechar}
      closeLabel="Fechar solicitação"
      blocked={enviando}
      size="sm"
      className="pcf-operation-modal solicitacao-modalidade-modal"
      overlayClassName="pcf-operation-modal-overlay"
      footer={<>
        <button className="btn-secundario" type="button" disabled={enviando} onClick={onFechar}>Cancelar</button>
        <button className="btn-primario" type="button" disabled={enviando} onClick={salvar}>{enviando?"Enviando...":"Enviar solicitação"}</button>
      </>}
    >
          {erro&&<div className="erro-msg" role="alert"><OperationIcon name="warning" size={17}/><span>{erro}</span></div>}
          <div className="solicitacao-ponto-resumo">
            <small>Ponto</small>
            <strong>{ponto.nomeFantasia}</strong>
            <span>{rotaCanonica(ponto.gerente)}</span>
          </div>
          <div className="campo">
            <label>Ação solicitada *</label>
            <select data-so-autofocus="true" value={acao} onChange={e=>setAcao(e.target.value)}>
              <option value="bloquear">Bloquear</option>
              <option value="desbloquear">Liberar</option>
            </select>
          </div>
          <div className="campo">
            <label>Serviço *</label>
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
            O pedido será enviado ao administrador, que fará o bloqueio ou a liberação na plataforma do serviço.
          </p>
    </OperationModal>
  );
}

function MotivoCicloPontoModal({ ponto, titulo, acaoLabel, onConfirmar, onFechar }) {
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  async function confirmar() {
    if (motivo.trim().length < 5) { setErro("Informe um motivo com pelo menos 5 caracteres."); return; }
    setEnviando(true); setErro("");
    try { await onConfirmar(motivo.trim()); onFechar(); }
    catch (e) { setErro(e?.message || "Não foi possível concluir a operação."); }
    finally { setEnviando(false); }
  }
  return <OperationModal
    open
    title={titulo}
    onClose={onFechar}
    closeLabel="Fechar operação"
    blocked={enviando}
    size="sm"
    className="pcf-operation-modal"
    overlayClassName="pcf-operation-modal-overlay"
    footer={<>
      <button className="btn-secundario" type="button" disabled={enviando} onClick={onFechar}>Cancelar</button>
      <button className="btn-primario" type="button" disabled={enviando} onClick={confirmar}>{enviando?"Processando...":acaoLabel}</button>
    </>}
  >
        <div className="solicitacao-ponto-resumo"><small>Ponto</small><strong>{ponto.nomeFantasia}</strong><span>{rotaCanonica(ponto.gerente)}</span></div>
        {titulo==="Solicitar desativação"&&<p className="campo-hint">Esta solicitação encerra a operação do ponto após aprovação administrativa. Ela não bloqueia nem desbloqueia modalidades.</p>}
        <label className="campo"><span>Motivo</span><textarea rows="4" value={motivo} onChange={e=>setMotivo(e.target.value)} maxLength="1000" data-so-autofocus="true"/></label>
        {erro&&<div className="erro-msg" role="alert">{erro}</div>}
  </OperationModal>;
}

function formatarDataSolicitacao(data) {
  if (!data) return "-";
  const dt = new Date(data);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" });
}

function mensagemErroCicloPonto(erro) {
  const original = String(erro?.message || "").trim();
  const mensagem = original.toLocaleLowerCase("pt-BR");
  if (mensagem.includes("remaneje") || mensagem.includes("equipamento") && mensagem.includes("vinculad")) {
    return "Ainda existem equipamentos vinculados. Movimente ou disponibilize todos antes de aprovar a desativação.";
  }
  if (mensagem.includes("já existe") || mensagem.includes("duplicate") || mensagem.includes("unique")) {
    return "Já existe uma solicitação de desativação pendente para este ponto.";
  }
  if (mensagem.includes("não está ativo")) return "O ponto já está desativado ou teve sua situação alterada.";
  if (mensagem.includes("não está desativado")) return "O ponto já está ativo.";
  if (mensagem.includes("foi alterado") || mensagem.includes("versão") || mensagem.includes("40001")) {
    return "Os dados do ponto foram atualizados por outro usuário. Recarregue a página e revise a solicitação.";
  }
  if (mensagem.includes("somente") || mensagem.includes("permiss") || mensagem.includes("fora do escopo") || mensagem.includes("42501")) {
    return "Seu perfil não possui permissão para executar esta operação.";
  }
  if (mensagem.includes("motivo") || mensagem.includes("5 caracteres") || mensagem.includes("22023")) {
    return "Informe um motivo válido com pelo menos 5 caracteres.";
  }
  return original || "Não foi possível concluir a operação.";
}

function PainelSolicitacoesStatusPonto({ solicitacoes, equipamentos, onDecidir }) {
  const pendentes = solicitacoes.filter(s=>s.status==="pendente");
  if (!pendentes.length) return null;
  return <section className="pcf-admin-queue solicitacoes-modalidade-panel solicitacoes-status-ponto-panel" aria-labelledby="pcf-status-queue-title">
    <div className="solicitacoes-panel-head"><div className="pcf-queue-title"><OperationIcon name="warning"/><div><span>Fila administrativa · ciclo do ponto</span><h3 id="pcf-status-queue-title">Pedidos de desativação</h3><p>A aprovação permanece bloqueada enquanto houver equipamentos vinculados.</p></div></div><strong>{pendentes.length} pendente{pendentes.length!==1?"s":""}</strong></div>
    <div className="solicitacoes-grid">{pendentes.map(s=>{
      const vinculados=equipamentos.filter(e=>String(e.localizacao||"").trim().toLowerCase()===String(s.pontoNome||"").trim().toLowerCase());
      return <article key={s.id} className="solicitacao-card solicitacao-desativar">
        <div className="solicitacao-card-top"><span>DESATIVAR PONTO</span><small>{formatarDataSolicitacao(s.solicitadoEm)}</small></div>
        <h4>{s.pontoNome}</h4><p>Gerente: <strong>{s.gerente}</strong></p><blockquote>{s.motivo}</blockquote>
        <StatusBadge tone="warning" label="Decisão pendente"/>
        {vinculados.length>0&&<div className="solicitacao-equipamentos"><strong>Equipamentos vinculados</strong><ul>{vinculados.map(e=><li key={e.id}>{e.nome}</li>)}</ul><small>Use o fluxo existente de Equipamentos para movimentar ou disponibilizar cada item.</small></div>}
        <div className="solicitacao-decisoes"><button className="pcf-button pcf-button--primary" disabled={vinculados.length>0} onClick={()=>onDecidir(s,true)}><OperationIcon name="check"/>Aprovar</button><button className="pcf-button pcf-button--danger" onClick={()=>onDecidir(s,false)}><OperationIcon name="close"/>Rejeitar</button></div>
      </article>;
    })}</div>
  </section>;
}

function PainelSolicitacoesModalidade({ solicitacoes, onConcluir }) {
  const pendentes = solicitacoes.filter(s=>s.status==="pendente");
  if (!pendentes.length) return null;
  return (
    <section className="pcf-admin-queue solicitacoes-modalidade-panel" aria-labelledby="pcf-service-queue-title">
      <div className="solicitacoes-panel-head">
        <div className="pcf-queue-title">
          <OperationIcon name="lock"/>
          <div>
            <span>Fila administrativa · serviços</span>
            <h3 id="pcf-service-queue-title">Bloqueios e liberações</h3>
            <p>Pedidos aguardando ação do administrador na plataforma da modalidade.</p>
          </div>
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
            <button className="pcf-button pcf-button--primary" onClick={()=>onConcluir(s.id)}><OperationIcon name="check"/>{s.acao==="bloquear"?"Concluir bloqueio":"Concluir liberação"}</button>
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
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
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
  const filtrosAtivos=competencia?1:0;
  const limparFiltros=()=>setCompetencia(administrador?"":competenciaAtual());
  const baixarPDF = () => {
    if (linhas.length===0) {
      window.alert("Nenhuma despesa encontrada para gerar o PDF.");
      return;
    }
    exportarHistoricoDespesasPDF({ linhas, competencia, busca });
  };
  return(
    <div className="historico-despesas-page">
      <section className="secao historico-despesas-controles">
        <div className="pcf-history-heading">
          <h2 className="secao-titulo">Histórico de despesas</h2>
          <button className="pcf-button pcf-button--primary" onClick={baixarPDF}><OperationIcon name="receipt"/>Gerar PDF</button>
        </div>
        <FilterBar
          className="pcf-filter-command"
          title={null}
          ariaLabel="Busca e filtros do histórico de despesas"
          primary={<div className="pcf-command-search">
            <label className="pcf-visually-hidden" htmlFor="pcf-expense-history-search-input">Buscar no histórico de despesas</label>
            <OperationIcon name="search" size={17}/>
            <input id="pcf-expense-history-search-input" type="search" placeholder="Buscar ponto, gerente, descrição ou valor" value={busca} onChange={e=>setBusca(e.target.value)}/>
            {busca&&<button type="button" onClick={()=>setBusca("")} aria-label="Limpar busca"><OperationIcon name="close" size={15}/></button>}
          </div>}
          secondary={<label className="pcf-select-control">
            <span>Competência</span>
            <input className="select-filtro" type="month" value={competencia} onChange={e=>setCompetencia(e.target.value)} list="meses-despesas"/>
            <datalist id="meses-despesas">
              {meses.map(m=><option key={m} value={m}>{mesLabel(`${m}-01`)}</option>)}
            </datalist>
          </label>}
          activeCount={filtrosAtivos}
          secondaryOpen={filtrosAbertos}
          onSecondaryToggle={setFiltrosAbertos}
          secondaryLabel="Filtros"
          onClear={limparFiltros}
          clearLabel="Limpar filtros"
          chips={competencia?<button type="button" className="pcf-filter-chip" onClick={limparFiltros} aria-label="Limpar competência">Competência: {mesLabel(`${competencia}-01`)}<OperationIcon name="close" size={13}/></button>:null}
        />
      </section>
      <section className="secao historico-despesas-resumo">
        <dl className="pcf-history-stats">
          <div><dt>Total filtrado</dt><dd>{formatarReais(total)}</dd></div>
          <div><dt>Lançamentos</dt><dd>{linhas.length}</dd></div>
          <div><dt>Pontos</dt><dd>{totalPontos}</dd></div>
          <div><dt>Gerentes</dt><dd>{totalGerentes}</dd></div>
        </dl>
      </section>
      <section className="secao historico-despesas-resultados">
        <div className="tabela-wrapper historico-despesas-tabela">
          <table className="tabela">
            <thead><tr><th>Ponto</th><th>Rota</th><th>Descrição</th><th>Valor</th><th>Mês</th><th>Data</th><th>Observação</th></tr></thead>
            <tbody>
              {linhas.length===0
                ?<tr><td colSpan={7} className="tabela-vazia">Nenhuma despesa encontrada para os filtros atuais.</td></tr>
                :linhas.map(d=>(
                  <tr key={d.id}>
                    <td className="td-nome">{d.pontoNome}</td>
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
        <div className="historico-despesas-mobile">
          {linhas.length===0
            ?<div className="historico-despesas-vazio">Nenhuma despesa encontrada para os filtros atuais.</div>
            :linhas.map(d=>(
              <article className="historico-despesa-card" key={`mobile-${d.id}`}>
                <div className="historico-despesa-card-topo">
                  <div className="historico-despesa-ponto">
                    <span>Ponto</span>
                    <strong>{d.pontoNome}</strong>
                  </div>
                  <strong className="historico-despesa-valor">{formatarReais(d.valor)}</strong>
                </div>
                <div className="historico-despesa-rota">
                  <BadgeGerente gerente={d.gerente}/>
                  <span>{mesLabel(d.competencia)}</span>
                </div>
                <div className="historico-despesa-descricao">
                  <span>Descrição</span>
                  <strong>{d.descricao || "Sem descrição"}</strong>
                </div>
                <div className="historico-despesa-meta">
                  <div>
                    <span>Data</span>
                    <strong>{d.criadoEm ? new Date(d.criadoEm).toLocaleDateString("pt-BR") : "—"}</strong>
                  </div>
                  <div>
                    <span>Observação</span>
                    <strong>{d.observacao || "Sem observação"}</strong>
                  </div>
                </div>
              </article>
            ))}
        </div>
      </section>
    </div>
  );
}

// ─── ABA: Histórico ───────────────────────────────────────────────────────────
function AbaHistorico({ historico, onExportExcel, onExportPDF }) {
  const HIST_CFG_P = {
    "cadastro":{ cor:"hist-cadastro", icone:"plus", label:"Cadastro" },
    "edicao":  { cor:"hist-edicao",   icone:"edit", label:"Edição"   },
    "exclusao":{ cor:"hist-exclusao", icone:"trash", label:"Exclusão" },
  };
  return(
    <section className="secao">
      <div className="tabela-header">
        <h2 className="secao-titulo" style={{margin:0}}>Histórico de pontos</h2>
        <div style={{display:"flex",gap:"8px"}}>
          <button className="pcf-button pcf-button--secondary" onClick={onExportExcel}><OperationIcon name="file"/>CSV</button>
          <button className="pcf-button pcf-button--secondary" onClick={onExportPDF}><OperationIcon name="receipt"/>PDF</button>
        </div>
      </div>
      {historico.length===0
        ?<EmptyState icon="file" title="Nenhuma movimentação registrada"/>
        :<div className="tabela-wrapper">
          <table className="tabela">
            <thead><tr><th>Tipo</th><th>Nome Fantasia</th><th>Gerente</th><th>Observação</th><th>Data</th></tr></thead>
            <tbody>
              {historico.map(h=>{
                const cfg=HIST_CFG_P[h.tipo]||{cor:"",icone:"file",label:h.tipo};
                return(<tr key={h.id}>
                  <td><span className={`badge-hist ${cfg.cor}`}><OperationIcon name={cfg.icone} size={13}/>{cfg.label}</span></td>
                  <td className="td-nome">{h.nome}</td>
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
export default function PointsPage({ equipamentos=[], podeEditar=false, perfilAtual, onPontosChange, onEquipamentosChange, onHistoricoChange, onDespesasChange, onEditarEquipamento, onExcluirEquipamento, onAbrirMenu }) {
  const [pontos,     setPontos]    = useState([]);
  const [historico,  setHistorico] = useState([]);
  const [despesas,   setDespesas]  = useState([]);
  const [prorrogacoes,setProrrogacoes]=useState([]);
  const [solicitacoes,setSolicitacoes]=useState([]);
  const [solicitacoesStatus,setSolicitacoesStatus]=useState([]);
  const [acessosModalidades,setAcessosModalidades]=useState([]);
  const [loading,    setLoading]   = useState(true);
  const [abaInterna, setAbaInterna]= useState("pontos");
  const [modalForm,  setModalForm] = useState(false);
  const [pontoEdit,  setPontoEdit] = useState(null);
  const [verDespesas,setVerDespesas]=useState(false);
  const [pontoDespesas,setPontoDespesas]=useState(null);
  const [despesasGerenteAbertas,setDespesasGerenteAbertas]=useState(false);
  const [pontoSolicitacao,setPontoSolicitacao]=useState(null);
  const [pontoDesativacao,setPontoDesativacao]=useState(null);
  const [pontoReativacao,setPontoReativacao]=useState(null);
  const [pontoAcessos,setPontoAcessos]=useState(null);
  const [filtroDespesa,setFiltroDespesa]=useState("todos");
  const [buscaPontos,setBuscaPontos]=useState("");
  const [competenciaDespesas,setCompetenciaDespesas]=useState(competenciaAtual());

  useEffect(()=>{
    async function carregar(){
      setLoading(true);
      const operador = perfilAtual?.perfil === "operador";
      const [pts, hist, desp, solic, solicStatus, acessos, prorrogacoesCarregadas] = await Promise.all([
        carregarPontos(),
        carregarHistoricoPontos(),
        operador ? Promise.resolve([]) : carregarDespesasMensais(),
        carregarSolicitacoesModalidade(),
        carregarSolicitacoesStatusPonto(),
        carregarPontoModalidadeAcessos(),
        operador ? Promise.resolve([]) : carregarProrrogacoesDespesas(),
      ]);
      setPontos(pts); onPontosChange?.(pts); setHistorico(hist); onHistoricoChange?.(hist); setDespesas(desp); setSolicitacoes(solic); setSolicitacoesStatus(solicStatus); setAcessosModalidades(acessos); setProrrogacoes(prorrogacoesCarregadas); setLoading(false);
    }
    carregar();
  },[perfilAtual?.perfil]);

  const gerenteAtual = perfilAtual?.perfil === "gerente" ? (perfilAtual.gerenteNome || perfilAtual.nome || "") : "";
  const prorrogacoesAtivasGerente = prorrogacoes.filter(item=>
    item.ativo&&normalizarGerenteExcecao(item.gerente)===normalizarGerenteExcecao(gerenteAtual)&&Date.parse(item.expiraEm)>Date.now()
  );
  const competenciasAnterioresPermitidas = [...new Set(prorrogacoesAtivasGerente.map(item=>item.competencia))]
    .filter(competencia=>competencia&&competencia!==competenciaAtual())
    .sort((a,b)=>b.localeCompare(a));
  const administrador = perfilAtual?.perfil === "administrador";
  const operador = perfilAtual?.perfil === "operador";
  const mostrarDespesas = !operador;
  const pontosVisiveisBase = gerenteAtual ? pontos.filter(p=>rotaPermitidaAoPerfil(p.gerente, perfilAtual)) : pontos;
  const despesasEscopo = mostrarDespesas
    ? despesas.filter(d=>
      pontosVisiveisBase.some(p=>Number(p.id)===Number(d.pontoId)) ||
      (administrador && isManagerExpense(d)) ||
      (gerenteAtual && expenseBelongsToManager(d, gerenteAtual))
    )
    : [];
  const pontosVisiveis = mostrarDespesas
    ? aplicarResumoDespesaMes(pontosVisiveisBase, despesasEscopo, competenciaDespesas)
    : pontosVisiveisBase.map(p=>({...p, possuiDespesa:"nao", valorDespesa:0}));
  const idsPontosAtuais = new Set(pontos.map(p=>Number(p.id)));
  const solicitacoesAtuais = solicitacoes.filter(s=>idsPontosAtuais.has(Number(s.pontoId)));
  const nomesPontosVisiveis = new Set(pontosVisiveis.map(p=>p.nomeFantasia));
  const equipamentosVisiveis = gerenteAtual ? equipamentos.filter(i=>nomesPontosVisiveis.has(i.localizacao)) : equipamentos;
  const despesasVisiveis = despesasEscopo;
  const gerentePodeCriarPonto = perfilAtual?.perfil === "gerente";
  const podeCriarPonto = administrador || gerentePodeCriarPonto;
  const podeEditarPonto = administrador || operador || (perfilAtual?.perfil === "gerente" && gerentePodeCriarPonto);
  const podeEditarDespesas = mostrarDespesas && (administrador || perfilAtual?.perfil === "gerente");
  const podeSolicitarModalidade = perfilAtual?.perfil === "gerente";
  const podeSolicitarDesativacao = perfilAtual?.perfil === "gerente";
  const podeReativar = administrador;
  const rotasDoGerente = gerenteAtual ? rotasPermitidasDoPerfil(perfilAtual) : [];

  useEffect(()=>{
    if(!mostrarDespesas && abaInterna==="analise") setAbaInterna("pontos");
    if(!mostrarDespesas && filtroDespesa!=="todos") setFiltroDespesa("todos");
  },[mostrarDespesas, abaInterna, filtroDespesa]);

  useEffect(()=>{
    if(competenciaDespesas!==competenciaAtual()&&!competenciasAnterioresPermitidas.includes(competenciaDespesas)) {
      setCompetenciaDespesas(competenciaAtual());
    }
  },[competenciaDespesas, competenciasAnterioresPermitidas]);

  async function salvarPontoHandler(form, equipamentosSelecionados, acessosParaSalvar=null){
    if(pontoEdit && !podeEditarPonto)return;
    if(!pontoEdit && !podeCriarPonto)return;
    if(gerentePodeCriarPonto && !rotaPermitidaAoPerfil(form.gerente, perfilAtual)) {
      window.alert("Selecione uma rota liberada para seu acesso.");
      return;
    }
    try{
      let pontoId = pontoEdit?.id || null;
      if(pontoEdit){
        await salvarPonto({...form,id:pontoEdit.id});
        const atualizados=pontos.map(p=>p.id===pontoEdit.id?{...form,id:pontoEdit.id}:p);
        setPontos(atualizados);onPontosChange?.(atualizados);
      }else{
        const novoId=await salvarPonto(form);
        pontoId = novoId;
        const atualizados=[...pontos,{...form,id:novoId}];
        setPontos(atualizados);onPontosChange?.(atualizados);
      }
      if(administrador && pontoId && Array.isArray(acessosParaSalvar)){
        const salvos = await salvarPontoModalidadeAcessos(pontoId, acessosParaSalvar);
        setAcessosModalidades(prev=>[
          ...prev.filter(acesso=>Number(acesso.pontoId)!==Number(pontoId)),
          ...salvos,
        ]);
      }
      if(administrador){
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
      }
      const h={id:Date.now(),tipo:pontoEdit?"edicao":"cadastro",nome:form.nomeFantasia,gerente:form.gerente,observacao:pontoEdit?"Ponto editado":"Ponto cadastrado",data:agoraStr()};
      await adicionarHistoricoPonto(h);
      setHistorico(prev=>{const atualizados=[h,...prev];onHistoricoChange?.(atualizados);return atualizados;});
      setModalForm(false);setPontoEdit(null);
    }catch(e){console.error("Erro ao salvar ponto:",e); throw e;}
  }

  async function salvarDespesasPonto(ponto, competencia, linhas) {
    if(!podeEditarDespesas)return;
    const prorrogacaoAtiva = encontrarProrrogacaoAtiva(prorrogacoes,gerenteAtual,competencia);
    if(gerenteAtual && competencia !== competenciaAtual() && !prorrogacaoAtiva) {
      window.alert("Gerente só pode lançar despesas do mês atual.");
      return;
    }
    if(gerenteAtual && !gerentePodeLancarDespesas() && !prorrogacaoAtiva) {
      window.alert("As despesas do mês só podem ser lançadas do dia 10 até o último dia do mês.");
      return;
    }
    try{
      await Promise.all(linhas.map(linha=>salvarDespesaMensal(linha)));
      const atualizadas = await carregarDespesasMensais();
      setDespesas(atualizadas);
      onDespesasChange?.(atualizadas);
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

  async function salvarDespesasGerente(contexto, competencia, linhas) {
    if(!gerenteAtual || !podeEditarDespesas)return;
    const prorrogacaoAtiva = encontrarProrrogacaoAtiva(prorrogacoes,gerenteAtual,competencia);
    if(competencia !== competenciaAtual() && !prorrogacaoAtiva) {
      window.alert("Gerente só pode lançar despesas do mês atual.");
      return;
    }
    if(!gerentePodeLancarDespesas() && !prorrogacaoAtiva) {
      window.alert("As despesas do mês só podem ser lançadas do dia 10 até o último dia do mês.");
      return;
    }
    if(!contexto.rota || !rotasDoGerente.includes(contexto.rota)) {
      window.alert("Selecione uma rota liberada para seu acesso.");
      return;
    }
    await Promise.all(linhas.map(linha=>salvarDespesaMensal(linha)));
    const atualizadas = await carregarDespesasMensais();
    setDespesas(atualizadas);
    onDespesasChange?.(atualizadas);
    setDespesasGerenteAbertas(false);
  }

  async function removerDespesaPonto(id) {
    if(!podeEditarDespesas)return;
    try{
      await excluirDespesaMensal(id);
      setDespesas(prev=>{
        const atualizadas=prev.filter(d=>Number(d.id)!==Number(id));
        onDespesasChange?.(atualizadas);
        return atualizadas;
      });
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

  async function enviarSolicitacaoDesativacao(ponto, motivo) {
    try {
      const nova = await solicitarDesativacaoPonto({ pontoId:ponto.id, motivo });
      setSolicitacoesStatus(prev=>[nova,...prev.filter(s=>Number(s.id)!==Number(nova.id))]);
    } catch (e) {
      console.error("Erro ao solicitar desativação do ponto:", e);
      throw new Error(mensagemErroCicloPonto(e), { cause:e });
    }
  }

  async function decidirSolicitacaoDesativacao(solicitacao, aprovar) {
    let motivoDecisao = "";
    if (!aprovar) {
      motivoDecisao = window.prompt("Informe o motivo da rejeição:") || "";
      if (motivoDecisao.trim().length < 5) return;
    }
    try {
      const atualizada = await decidirDesativacaoPonto({ solicitacaoId:solicitacao.id, aprovar, motivoDecisao });
      setSolicitacoesStatus(prev=>prev.map(s=>Number(s.id)===Number(atualizada.id)?atualizada:s));
      if (aprovar) {
        const pts = await carregarPontos(); setPontos(pts); onPontosChange?.(pts);
      }
    } catch (e) {
      console.error("Erro ao decidir desativação do ponto:", e);
      window.alert(mensagemErroCicloPonto(e));
    }
  }

  async function confirmarReativacao(ponto, motivo) {
    try {
      const atualizado = await reativarPonto({ pontoId:ponto.id, motivo });
      const pts = pontos.map(p=>Number(p.id)===Number(atualizado.id)?atualizado:p);
      setPontos(pts); onPontosChange?.(pts);
    } catch (e) {
      console.error("Erro ao reativar ponto:", e);
      throw new Error(mensagemErroCicloPonto(e), { cause:e });
    }
  }

  const ABAS = [
    {id:"pontos",   label:"Rede", icon:"mapPin"},
    ...(mostrarDespesas ? [{id:"analise", label:"Histórico de despesas", icon:"receipt"}] : []),
  ];
  function abrirPontosFiltrados(filtro){
    setFiltroDespesa(filtro);
    setAbaInterna("pontos");
  }
  const pontosParaExportar = pontosVisiveis;
  const pendenciasServicos = solicitacoesAtuais.filter(s=>s.status==="pendente").length;
  const pendenciasCiclo = solicitacoesStatus.filter(s=>s.status==="pendente").length;

  return(
    <div className="points-page points-command-flow operations-theme">
      <header className="pcf-command-header">
        <div className="pcf-command-title">
          {onAbrirMenu&&<button className="pcf-menu-button" type="button" aria-label="Abrir navegação" onClick={onAbrirMenu}><OperationIcon name="menu"/></button>}
          <div>
            <h1>Pontos</h1>
            <span className="pcf-command-context">{pontosVisiveis.length} na rede · competência {mesLabel(`${competenciaDespesas}-01`)}</span>
          </div>
        </div>
        <div className="pcf-command-actions">
          {administrador&&(pendenciasServicos+pendenciasCiclo)>0&&<span className="pcf-pending-summary"><OperationIcon name="warning" size={15}/>{pendenciasServicos+pendenciasCiclo} na fila administrativa</span>}
          {gerenteAtual&&<button className="pcf-button pcf-button--secondary" onClick={()=>setDespesasGerenteAbertas(true)}><OperationIcon name="money"/>Minhas despesas</button>}
          {podeCriarPonto&&<button className="pcf-button pcf-button--primary" onClick={()=>{setPontoEdit(null);setModalForm(true);}}><OperationIcon name="plus"/>Novo ponto</button>}
        </div>
      </header>

      {prorrogacoesAtivasGerente.map(prorrogacao=>(
        <div className="pcf-deadline-banner despesa-excecao-aviso" key={prorrogacao.id} role="status">
          <OperationIcon name="clock"/><span>Prazo para lançamento de <strong>{mesLabel(prorrogacao.competencia)}</strong>: disponível até {formatarPrazoProrrogacao(prorrogacao.expiraEm)}.</span>
        </div>
      ))}

      {gerenteAtual&&competenciasAnterioresPermitidas.length>0&&(
        <div className="despesas-competencia-operacional">
          <label htmlFor="competencia-despesas-gerente"><OperationIcon name="clock" size={14}/>Mês dos lançamentos</label>
          <select
            id="competencia-despesas-gerente"
            value={competenciaDespesas}
            onChange={e=>{setCompetenciaDespesas(e.target.value);setFiltroDespesa("todos");}}
          >
            <option value={competenciaAtual()}>{mesLabel(`${competenciaAtual()}-01`)}</option>
            {competenciasAnterioresPermitidas.map(competencia=><option key={competencia} value={competencia}>{mesLabel(`${competencia}-01`)}</option>)}
          </select>
          <small>Selecione o mês antes de consultar os pontos ou lançar despesas.</small>
        </div>
      )}

      <nav className="points-abas" aria-label="Visualização de pontos">
        {ABAS.map(a=>(
          <button key={a.id} className={`points-aba-btn ${abaInterna===a.id?"points-aba-ativa":""}`}
            aria-current={abaInterna===a.id?"page":undefined}
            onClick={()=>{setAbaInterna(a.id);if(a.id==="pontos")setFiltroDespesa("todos");}}>
            <OperationIcon name={a.icon} size={15}/>{a.label}
          </button>
        ))}
      </nav>

      {administrador&&<PainelSolicitacoesModalidade solicitacoes={solicitacoesAtuais} onConcluir={concluirSolicitacao}/>}
      {administrador&&<PainelSolicitacoesStatusPonto solicitacoes={solicitacoesStatus} equipamentos={equipamentos} onDecidir={decidirSolicitacaoDesativacao}/>}

      {loading&&(
        <div className="pcf-loading" role="status">
          <div className="loading-dots"><span/><span/><span/></div>
          <span>Carregando pontos...</span>
        </div>
      )}

      {!loading&&(<>
        {abaInterna==="pontos"&&<div className="pcf-network-view">
          <AbaVisaoGeral pontos={pontosVisiveis} despesas={despesasVisiveis} competencia={competenciaDespesas} mostrarDespesas={mostrarDespesas} onVerDespesas={()=>setVerDespesas(true)} onAbrirPontos={abrirPontosFiltrados}/>
          <AbaPontos pontos={pontosVisiveis} equipamentos={equipamentosVisiveis} historico={historico} acessos={acessosModalidades} solicitacoes={solicitacoesAtuais} solicitacoesStatus={solicitacoesStatus} busca={buscaPontos} onBuscaChange={setBuscaPontos} onLimparBusca={()=>setBuscaPontos("")} podeEditar={podeEditarPonto} podeEditarDespesas={podeEditarDespesas} podeSolicitarModalidade={podeSolicitarModalidade} podeSolicitarDesativacao={podeSolicitarDesativacao} podeReativar={podeReativar} mostrarDespesas={mostrarDespesas} filtroDespesa={filtroDespesa} onFiltroDespesaChange={setFiltroDespesa} onLimparFiltro={()=>setFiltroDespesa("todos")} onEditar={p=>{setPontoEdit(p);setModalForm(true);}} onDespesas={setPontoDespesas} onSolicitarModalidade={setPontoSolicitacao} onSolicitarDesativacao={setPontoDesativacao} onReativar={setPontoReativacao} onVerAcessos={setPontoAcessos}
            onExportExcel={()=>exportarPontosExcel(pontosParaExportar)} onExportPDF={()=>exportarPontosPDF(pontosParaExportar)}/>
        </div>}
        {abaInterna==="analise"  &&<AbaHistoricoDespesas pontos={pontosVisiveis} despesas={despesasVisiveis} administrador={administrador}/>}
      </>)}

      {modalForm&&((pontoEdit&&podeEditarPonto)||(!pontoEdit&&podeCriarPonto))&&<PointFormModal ponto={pontoEdit} pontos={pontos} equipamentos={equipamentos} perfilAtual={perfilAtual} acessos={pontoEdit?acessosDoPonto(acessosModalidades,pontoEdit.id):[]} podeEditarAcessos={administrador&&Boolean(pontoEdit?.id)} mostrarEquipamentos={administrador} onEditarEquipamento={onEditarEquipamento} onExcluirEquipamento={onExcluirEquipamento} onSalvar={salvarPontoHandler} onFechar={()=>{setModalForm(false);setPontoEdit(null);}}/>}
      {verDespesas&&mostrarDespesas&&<PointExpensesModal pontos={pontosVisiveisBase} despesas={despesasVisiveis} competenciaInicial={competenciaDespesas} permitirSelecionarCompetencia={administrador} onFechar={()=>setVerDespesas(false)}/>}
      {pontoDespesas&&<PointMonthlyExpensesModal ponto={pontoDespesas} despesas={despesasVisiveis} prorrogacoes={prorrogacoes} competenciaInicial={competenciaDespesas} podeEditar={podeEditarDespesas} perfilAtual={perfilAtual} onSalvar={salvarDespesasPonto} onRemover={removerDespesaPonto} onFechar={()=>setPontoDespesas(null)}/>}
      {despesasGerenteAbertas&&gerenteAtual&&<PointMonthlyExpensesModal gerenteDespesa={gerenteAtual} rotasGerente={rotasDoGerente} despesas={despesasVisiveis} prorrogacoes={prorrogacoes} competenciaInicial={competenciaDespesas} podeEditar={podeEditarDespesas} perfilAtual={perfilAtual} onSalvar={salvarDespesasGerente} onRemover={removerDespesaPonto} onFechar={()=>setDespesasGerenteAbertas(false)}/>}
      {pontoSolicitacao&&podeSolicitarModalidade&&<SolicitacaoModalidadeModal ponto={pontoSolicitacao} perfilAtual={perfilAtual} onSalvar={salvarSolicitacaoModalidade} onFechar={()=>setPontoSolicitacao(null)}/>}
      {pontoDesativacao&&podeSolicitarDesativacao&&<MotivoCicloPontoModal ponto={pontoDesativacao} titulo="Solicitar desativação" acaoLabel="Enviar solicitação" onConfirmar={motivo=>enviarSolicitacaoDesativacao(pontoDesativacao,motivo)} onFechar={()=>setPontoDesativacao(null)}/>}
      {pontoReativacao&&podeReativar&&<MotivoCicloPontoModal ponto={pontoReativacao} titulo="Reativar ponto" acaoLabel="Reativar" onConfirmar={motivo=>confirmarReativacao(pontoReativacao,motivo)} onFechar={()=>setPontoReativacao(null)}/>}
      {pontoAcessos&&<PointAccessModal ponto={pontoAcessos} acessos={acessosDoPonto(acessosModalidades,pontoAcessos.id)} onFechar={()=>setPontoAcessos(null)}/>}
    </div>
  );
}
