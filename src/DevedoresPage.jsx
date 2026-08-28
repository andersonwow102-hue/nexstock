import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as api from "./devedoresApi.js";
import {
  centavosDeEntrada, criarChaveIdempotencia, criarControleRequisicoes, formatarDataCivil,
  formatarMoedaBR, hojeEmSaoPaulo, mensagemErroDevedores,
  permissoesDevedores, preverParcelas, situacaoApresentacao,
} from "./devedoresUtils.js";
import {
  ActionBar,
  Button,
  EmptyState,
  FeedbackBanner,
  Field,
  FloatingActionSafeArea,
  Modal as OperationsModal,
  Pagination,
  Skeleton,
  StatusBadge,
} from "./components/operations/OperationsUI.jsx";
import "./DevedoresPage.css";

const POR_PAGINA = 20;
const FILTROS_VAZIOS = Object.freeze({situacao:"",modalidade:"",gerente:"",forma:"",marcador:"",periodo:"",cadastro:"ativos"});
const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
const FILAS_OPERACIONAIS = [
  {id:"all",rotulo:"Toda carteira",descricao:"Posição financeira completa",icone:"portfolio"},
  {id:"vencidas",rotulo:"Vencidas",descricao:"Saldo que exige tratamento",icone:"bolt"},
  {id:"sem-negociacao",rotulo:"Sem negociação",descricao:"Dívidas ainda sem acordo",icone:"phone"},
  {id:"em-acordo",rotulo:"Em acordo",descricao:"Negociadas ou em liquidação",icone:"follow"},
  {id:"quitadas",rotulo:"Quitadas",descricao:"Liquidações concluídas",icone:"check"},
];
const ESTAGIOS_LIQUIDACAO = ["Registrada","Negociada","Em liquidação","Quitada"];
const moeda = valor => formatarMoedaBR(valor);
const limpo = valor => String(valor || "").trim();
const normalizarBusca = valor => String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
const perfilResponsavel = perfil => ({
  administrador: "ADMIN",
  operador: "OPERADOR",
  gerente: "GERENTE",
  consulta: "CONSULTA",
}[String(perfil || "").trim().toLowerCase()] || "SISTEMA");
const mascaraTelefone = valor => {
  const d = String(valor || "").replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

function IconeFluxo({nome,size=18}) {
  const caminhos={
    search:<><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></>,
    portfolio:<><rect x="3.5" y="6.5" width="17" height="13" rx="1.5"/><path d="M8 6.5V4h8v2.5M3.5 11h17M9 14.5h6"/></>,
    bolt:<path d="m13 2.5-8 11.7h7.2l-1.1 7.3 7.9-11.6h-7.1z"/>,
    phone:<path d="M7.1 3.7 4.4 5.8c.5 6.7 4.9 11.1 11.7 11.7l2.2-2.7-3.9-2-1.7 1.7c-2.4-.9-4.3-2.8-5.2-5.2l1.7-1.7z"/>,
    follow:<><path d="M4 12a8 8 0 0 1 13.7-5.6L20 9"/><path d="M20 4v5h-5M20 12a8 8 0 0 1-13.7 5.6L4 15"/><path d="M4 20v-5h5"/></>,
    check:<path d="m5 12 4 4L19 6"/>,
    filter:<><path d="M4 6h16M7 12h10M10 18h4"/></>,
    arrow:<><path d="M4 12h16M15 7l5 5-5 5"/></>,
    close:<><path d="m6 6 12 12M18 6 6 18"/></>,
    debt:<><rect x="5" y="3" width="14" height="18" rx="1"/><path d="M8 8h8M8 12h8M8 16h4"/></>,
    trace:<><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></>,
    clock:<><circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.8 1.7"/></>,
    money:<><path d="M4 6.5h14a2 2 0 0 1 2 2v9H4z"/><path d="M4 6.5 16 4v2.5M15 12h5"/></>,
    menu:<><path d="M4 7h16M4 12h16M4 17h16"/></>,
    plus:<><path d="M12 5v14M5 12h14"/></>,
  };
  return <svg aria-hidden="true" className="dev-cf-icon" fill="none" height={size} viewBox="0 0 24 24" width={size}><g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.65">{caminhos[nome]||caminhos.portfolio}</g></svg>;
}

const registroExcluido=registro=>Boolean(registro?.relatorio?.excluido_em||registro?.resumo?.excluido_em);
const temNegociacao=registro=>Boolean(registro?.resumo?.negociacao_id||["negociada","parcialmente_paga"].includes(registro?.resumo?.situacao));

function filaDoRegistro(registro) {
  if(registroExcluido(registro))return "excluidas";
  if(registro.resumo?.situacao==="quitada")return "quitadas";
  if(registro.resumo?.situacao==="vencida")return "vencidas";
  if(temNegociacao(registro))return "em-acordo";
  return "sem-negociacao";
}

function contextoDoRegistro(registro,permissao) {
  const situacao=registroExcluido(registro)?"excluida":registro.resumo?.situacao||"aberta";
  if(situacao==="excluida")return {tom:"risk",rotulo:"Histórico preservado",acao:"Consultar histórico"};
  if(situacao==="quitada")return {tom:"success",rotulo:"Liquidação concluída",acao:"Conferir liquidação"};
  if(situacao==="vencida")return {tom:"risk",rotulo:"Saldo vencido",acao:"Tratar posição vencida"};
  if(temNegociacao(registro))return {tom:"copper",rotulo:"Acordo em curso",acao:permissao.pagar?"Registrar recebimento":"Acompanhar acordo"};
  return {tom:"neutral",rotulo:"Sem negociação",acao:permissao.negociar?"Registrar negociação":"Acompanhar posição"};
}

function estagioDoRegistro(registro) {
  const resumo=registro?.resumo||{};
  if(resumo.situacao==="quitada")return 3;
  if(Number(resumo.total_pago)>0||resumo.situacao==="parcialmente_paga")return 2;
  if(temNegociacao(registro))return 1;
  return 0;
}

function TrilhoFluxo({registro,expandido=false,confirmado=false}) {
  const estagio=estagioDoRegistro(registro);
  const percentual=Math.max(0,Math.min(100,Number(registro?.resumo?.evolucao_percentual||0)));
  return <ol aria-label={`Progressão real da dívida: ${ESTAGIOS_LIQUIDACAO[estagio]}, ${percentual.toLocaleString("pt-BR")}% liquidado`} className={`dev-cf-track${expandido?" dev-cf-track-expanded":""}${confirmado?" is-confirmed":""}`} style={{"--dev-cf-stage-progress":estagio/3,"--dev-cf-progress":percentual/100}}>
    {ESTAGIOS_LIQUIDACAO.map((rotulo,indice)=><li className={indice<estagio?"is-done":indice===estagio?"is-current":"is-upcoming"} key={rotulo}><span aria-hidden="true"/>{expandido&&<div><small>{String(indice+1).padStart(2,"0")}</small><strong>{rotulo}</strong><em>{indice<estagio?"Concluída":indice===estagio?"Posição atual":"Posterior"}</em></div>}</li>)}
  </ol>;
}

function limitarFoco(event,container) {
  if(event.key!=="Tab"||!container)return;
  const controles=[...container.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[href],[tabindex]:not([tabindex="-1"])')].filter(no=>!no.hasAttribute("hidden"));
  if(!controles.length)return;
  const primeiro=controles[0],ultimo=controles[controles.length-1];
  if(event.shiftKey&&document.activeElement===primeiro){event.preventDefault();ultimo.focus();}
  else if(!event.shiftKey&&document.activeElement===ultimo){event.preventDefault();primeiro.focus();}
}

function Estado({ tipo, children, acao }) {
  if (tipo === "vazio" || tipo === "carregando") {
    return <EmptyState className={`dev-estado dev-estado-${tipo}`} icon={tipo === "carregando" ? "clock" : "search"} title={children} action={acao}/>;
  }
  const tone = { erro: "danger", aviso: "warning", sucesso: "success", info: "info" }[tipo] || "info";
  return <FeedbackBanner className={`dev-estado dev-estado-${tipo}`} tone={tone} action={acao}>{children}</FeedbackBanner>;
}

function Modal({ titulo, subtitulo, children, onFechar, footer, largo, bloqueado = false }) {
  return <OperationsModal
    title={titulo}
    subtitle={subtitulo}
    onClose={onFechar}
    blocked={bloqueado}
    size={largo ? "xl" : "md"}
    overlayClassName="dev-modal-fundo"
    className={`dev-modal ${largo ? "dev-modal-largo" : ""}`}
    footer={footer ? <FloatingActionSafeArea><ActionBar className="dev-modal-acoes">{footer}</ActionBar></FloatingActionSafeArea> : null}
  >
    <div className="dev-modal-corpo">{children}</div>
  </OperationsModal>;
}

function Campo({ label, obrigatorio, className = "", children }) {
  return <Field className={`dev-campo ${className}`} label={label} required={obrigatorio}>{children}</Field>;
}

function CadastroForm({ item, modalidades, admin, onCancelar, onConcluir }) {
  const rel = item?.relatorio || {};
  const [form, setForm] = useState({
    tipo: rel.tipo || "pessoa", nome: rel.nome || "", nomeFantasia: rel.nome_fantasia || "",
    endereco: rel.endereco || "", numero: rel.numero || "", complemento: rel.complemento || "",
    bairro: rel.bairro || "", cidade: rel.cidade || "", estado: rel.estado || "BA",
    telefone: rel.telefone || "", observacoesCadastrais: rel.observacoes_cadastrais || "",
    valorOriginal: item?.valor_original || "", modalidadeId: item?.modalidade_id || "",
    dataRegistro: item?.data_registro || hojeEmSaoPaulo(), observacoesOriginais: item?.observacoes_originais || "", motivo: "",
  });
  const [erro, setErro] = useState(""); const [enviando, setEnviando] = useState(false); const [confirmando, setConfirmando] = useState(false);
  const alterar = (campo, valor) => setForm(atual => ({ ...atual, [campo]: valor }));
  const salvar = async () => {
    if (![form.nome, form.endereco, form.numero, form.cidade, form.estado, form.telefone].every(limpo)) return setErro("Preencha todos os campos obrigatórios do cadastro.");
    if (form.telefone.replace(/\D/g, "").length < 10) return setErro("Informe um telefone válido com DDD.");
    if (!item && (!form.modalidadeId || centavosDeEntrada(form.valorOriginal) <= 0)) return setErro("Informe modalidade e valor original válidos.");
    if (admin && item && limpo(form.motivo).length < 5) return setErro("Informe um motivo administrativo com pelo menos 5 caracteres.");
    if (!confirmando) return setConfirmando(true);
    setEnviando(true); setErro("");
    try {
      const dados = { ...form, valorOriginalCentavos: centavosDeEntrada(form.valorOriginal), relatorioId: rel.id, dividaId: item?.id, versaoRelatorio: rel.versao, versaoDivida: item?.versao };
      if (!item) await api.cadastrarDevedor(dados);
      else if (admin) await api.corrigirCadastroAdmin(dados);
      else await api.corrigirCadastroGerente(dados);
      await onConcluir();
    } catch (e) { setErro(mensagemErroDevedores(e)); setConfirmando(false); } finally { setEnviando(false); }
  };
  return <Modal titulo={item ? "Corrigir cadastro" : "Cadastrar devedor"} subtitulo={admin ? "A correção administrativa ficará no histórico." : "Cadastro e dívida original."} onFechar={onCancelar} bloqueado={enviando} largo footer={<><button className="btn-secundario" disabled={enviando} onClick={onCancelar}>Cancelar</button><button className="btn-primario" disabled={enviando} onClick={salvar}>{enviando ? "Processando..." : confirmando ? "Confirmar" : "Revisar"}</button></>}>
    {erro && <Estado tipo="erro">{erro}</Estado>}{confirmando && <Estado tipo="aviso">Confira os dados antes de confirmar. A ação ficará registrada no histórico.</Estado>}
    <div className="dev-form-grid">
      <Campo label="Tipo" obrigatorio><select value={form.tipo} onChange={e=>alterar("tipo",e.target.value)} disabled={item&&!admin}><option value="pessoa">Pessoa</option><option value="ponto">Ponto comercial</option></select></Campo>
      <Campo label="Nome do devedor" obrigatorio><input value={form.nome} onChange={e=>alterar("nome",e.target.value)}/></Campo>
      <Campo label="Nome fantasia"><input value={form.nomeFantasia} onChange={e=>alterar("nomeFantasia",e.target.value)}/></Campo>
      <Campo label="Telefone" obrigatorio><input inputMode="tel" value={mascaraTelefone(form.telefone)} onChange={e=>alterar("telefone",mascaraTelefone(e.target.value))}/></Campo>
      <Campo label="Endereço" obrigatorio className="dev-span-2"><input value={form.endereco} onChange={e=>alterar("endereco",e.target.value)}/></Campo>
      <Campo label="Número" obrigatorio><input value={form.numero} onChange={e=>alterar("numero",e.target.value)}/></Campo>
      <Campo label="Complemento"><input value={form.complemento} onChange={e=>alterar("complemento",e.target.value)}/></Campo>
      <Campo label="Bairro"><input value={form.bairro} onChange={e=>alterar("bairro",e.target.value)}/></Campo>
      <Campo label="Cidade" obrigatorio><input value={form.cidade} onChange={e=>alterar("cidade",e.target.value)}/></Campo>
      <Campo label="UF" obrigatorio><select value={form.estado} onChange={e=>alterar("estado",e.target.value)}>{UFS.map(uf=><option key={uf}>{uf}</option>)}</select></Campo>
      <Campo label="Valor original" obrigatorio><input inputMode="decimal" value={form.valorOriginal} disabled={item&&!admin} placeholder="R$ 0,00" onChange={e=>alterar("valorOriginal",e.target.value)}/></Campo>
      <Campo label="Modalidade" obrigatorio><select value={form.modalidadeId} disabled={item&&!admin} onChange={e=>alterar("modalidadeId",e.target.value)}><option value="">Selecione</option>{modalidades.map(m=><option value={m.id} key={m.id}>{m.nome}</option>)}</select></Campo>
      <Campo label="Data do registro" obrigatorio><input type="date" value={form.dataRegistro} disabled={item&&!admin} onChange={e=>alterar("dataRegistro",e.target.value)}/></Campo>
      <Campo label="Observações cadastrais" className="dev-span-2"><textarea rows="2" value={form.observacoesCadastrais} onChange={e=>alterar("observacoesCadastrais",e.target.value)}/></Campo>
      <Campo label="Observações da dívida" className="dev-span-2"><textarea rows="2" value={form.observacoesOriginais} disabled={item&&!admin} onChange={e=>alterar("observacoesOriginais",e.target.value)}/></Campo>
      {admin&&item&&<Campo label="Motivo da correção" obrigatorio className="dev-span-2"><textarea rows="2" value={form.motivo} onChange={e=>alterar("motivo",e.target.value)}/></Campo>}
    </div>
  </Modal>;
}

function NegociacaoForm({ item, detalhe, modo, onCancelar, onConcluir }) {
  const ativa = detalhe.negociacoes.find(n => n.situacao === "ativa") || detalhe.negociacoes[0];
  const inicial = modo === "criar" ? null : ativa;
  const [form,setForm]=useState({formaPagamento:inicial?.forma_pagamento||"vista",valor:inicial?.valor_negociado||item.valor_original,dataPrevista:inicial?.data_prevista_quitacao||hojeEmSaoPaulo(),quantidadeParcelas:inicial?.quantidade_parcelas||2,primeiroVencimento:inicial?.primeiro_vencimento||hojeEmSaoPaulo(),observacoes:inicial?.observacoes||"",motivo:""});
  const [erro,setErro]=useState(""); const [enviando,setEnviando]=useState(false); const [confirmando,setConfirmando]=useState(false); const [idempotencia]=useState(criarChaveIdempotencia);
  const parcelas=useMemo(()=>preverParcelas(form.valor,Number(form.quantidadeParcelas),form.primeiroVencimento),[form.valor,form.quantidadeParcelas,form.primeiroVencimento]);
  const salvar=async()=>{
    if(centavosDeEntrada(form.valor)<=0)return setErro("Informe um valor negociado válido.");
    if(form.formaPagamento==="parcelada"&&!parcelas.length)return setErro("Revise quantidade, valor e primeiro vencimento.");
    if(modo!=="criar"&&limpo(form.motivo).length<5)return setErro("Informe o motivo da alteração.");
    if(!confirmando)return setConfirmando(true);
    setEnviando(true);setErro("");
    try { const dados={dividaId:item.id,versaoEsperada:modo==="criar"?item.versao:ativa?.versao,formaPagamento:form.formaPagamento,valorCentavos:centavosDeEntrada(form.valor),dataPrevista:form.dataPrevista,quantidadeParcelas:form.quantidadeParcelas,primeiroVencimento:form.primeiroVencimento,observacoes:form.observacoes,motivo:form.motivo,idempotencia}; if(modo==="substituir")await api.substituirNegociacao(dados);else if(modo==="corrigir")await api.corrigirNegociacaoAdmin(dados);else await api.criarNegociacao(dados);await onConcluir(); }
    catch(e){setErro(mensagemErroDevedores(e));setConfirmando(false);}finally{setEnviando(false);}
  };
  return <Modal titulo={modo==="criar"?"Registrar negociação":modo==="substituir"?"Substituir negociação":"Corrigir negociação"} subtitulo="Os valores definitivos serão calculados e validados pelo banco." onFechar={onCancelar} bloqueado={enviando} largo footer={<><button className="btn-secundario" disabled={enviando} onClick={onCancelar}>Cancelar</button><button className="btn-primario" disabled={enviando} onClick={salvar}>{enviando?"Processando...":confirmando?"Confirmar negociação":"Revisar negociação"}</button></>}>
    {erro&&<Estado tipo="erro">{erro}</Estado>}{confirmando&&<Estado tipo="aviso">Confirme a forma, o valor e os vencimentos. Esta operação ficará no histórico.</Estado>}
    <div className="dev-form-grid"><Campo label="Forma de pagamento" obrigatorio><select value={form.formaPagamento} onChange={e=>setForm({...form,formaPagamento:e.target.value})}><option value="vista">À vista</option><option value="parcelada">Parcelada</option></select></Campo><Campo label="Valor negociado" obrigatorio><input inputMode="decimal" value={form.valor} onChange={e=>setForm({...form,valor:e.target.value})}/></Campo>
    {form.formaPagamento==="vista"?<Campo label="Data prevista" obrigatorio><input type="date" value={form.dataPrevista} onChange={e=>setForm({...form,dataPrevista:e.target.value})}/></Campo>:<><Campo label="Quantidade de parcelas" obrigatorio><input type="number" min="1" max="240" value={form.quantidadeParcelas} onChange={e=>setForm({...form,quantidadeParcelas:e.target.value})}/></Campo><Campo label="Primeiro vencimento" obrigatorio><input type="date" value={form.primeiroVencimento} onChange={e=>setForm({...form,primeiroVencimento:e.target.value})}/></Campo></>}
    <Campo label="Observação" className="dev-span-2"><textarea rows="2" value={form.observacoes} onChange={e=>setForm({...form,observacoes:e.target.value})}/></Campo>{modo!=="criar"&&<Campo label="Motivo" obrigatorio className="dev-span-2"><textarea rows="2" value={form.motivo} onChange={e=>setForm({...form,motivo:e.target.value})}/></Campo>}</div>
    {form.formaPagamento==="parcelada"&&<div className="dev-previa"><h3>Prévia das parcelas</h3><p>Prévia ilustrativa. A composição final será retornada pelo banco.</p><div>{parcelas.map(p=><span key={p.numero}><b>{p.numero}ª</b> {moeda(Number(p.valor))}<small>{formatarDataCivil(p.vencimento)}</small></span>)}</div></div>}
  </Modal>;
}

function PagamentoForm({ item, detalhe, onCancelar, onConcluir }) {
  const ativa=detalhe.negociacoes.find(n=>n.situacao==="ativa")||detalhe.negociacoes[0], parcelada=ativa?.forma_pagamento==="parcelada", abertas=detalhe.parcelas.filter(p=>Number(p.saldo)>0);
  const [form,setForm]=useState({parcelaId:parcelada?(abertas[0]?.id||""):"",valor:"",dataPagamento:hojeEmSaoPaulo(),observacao:""}); const [erro,setErro]=useState(""); const [enviando,setEnviando]=useState(false); const [confirmando,setConfirmando]=useState(false); const [idempotencia]=useState(criarChaveIdempotencia);
  const parcelaSelecionada=abertas.find(p=>String(p.id)===String(form.parcelaId)), saldoDisponivel=parcelada?Number(parcelaSelecionada?.saldo||0):Number(detalhe.resumo?.saldo_restante||0), valorRecebido=centavosDeEntrada(form.valor)/100, acimaDoSaldo=valorRecebido>saldoDisponivel, estimado=Math.max(0,Number(detalhe.resumo?.saldo_restante||0)-valorRecebido);
  const salvar=async()=>{if(!ativa)return setErro("Não existe negociação ativa.");if(parcelada&&!form.parcelaId)return setErro("Selecione a parcela.");if(centavosDeEntrada(form.valor)<=0)return setErro("Informe o valor recebido.");if(acimaDoSaldo)return setErro("O valor recebido não pode ultrapassar o saldo disponível.");if(!confirmando)return setConfirmando(true);setEnviando(true);setErro("");try{await api.registrarPagamento({negociacaoId:ativa.id,parcelaId:form.parcelaId||null,versaoEsperada:ativa.versao,valorCentavos:centavosDeEntrada(form.valor),dataPagamento:form.dataPagamento,observacao:form.observacao,idempotencia});await onConcluir();}catch(e){setErro(mensagemErroDevedores(e));setConfirmando(false);}finally{setEnviando(false);}};
  return <Modal titulo="Registrar pagamento" subtitulo="Pagamentos parciais e integrais são validados pelo banco." onFechar={onCancelar} bloqueado={enviando} footer={<><button className="btn-secundario" disabled={enviando} onClick={onCancelar}>Cancelar</button><button className="btn-primario" disabled={enviando||acimaDoSaldo} onClick={salvar}>{enviando?"Registrando pagamento...":confirmando?"Confirmar pagamento":"Revisar pagamento"}</button></>}>
    {erro&&<Estado tipo="erro">{erro}</Estado>}{confirmando&&<Estado tipo="aviso">Confira devedor, parcela, valor, data e saldo projetado antes de confirmar.</Estado>}<div className="dev-saldo-previo"><span>Saldo disponível <b>{moeda(saldoDisponivel)}</b></span><span>Saldo projetado <b>{moeda(estimado)}</b></span></div><div className="dev-form-grid dev-form-uma-coluna">{parcelada&&<Campo label="Parcela" obrigatorio><select value={form.parcelaId} onChange={e=>setForm({...form,parcelaId:e.target.value})}>{abertas.map(p=><option key={p.id} value={p.id}>{p.numero}ª parcela · saldo {moeda(p.saldo)} · {formatarDataCivil(p.vencimento)}</option>)}</select></Campo>}<Campo label="Valor recebido" obrigatorio><input inputMode="decimal" value={form.valor} aria-invalid={acimaDoSaldo} onChange={e=>setForm({...form,valor:e.target.value})}/>{acimaDoSaldo&&<small className="dev-campo-erro">Valor acima do saldo disponível.</small>}</Campo><Campo label="Data do pagamento" obrigatorio><input type="date" value={form.dataPagamento} onChange={e=>setForm({...form,dataPagamento:e.target.value})}/></Campo><Campo label="Observação"><textarea rows="2" value={form.observacao} onChange={e=>setForm({...form,observacao:e.target.value})}/></Campo></div>
    {confirmando&&<section className="dev-confirmacao"><h3>Resumo do pagamento</h3><dl><div><dt>Devedor</dt><dd>{item.relatorio.nome_fantasia||item.relatorio.nome}</dd></div><div><dt>Parcela</dt><dd>{parcelaSelecionada?`${parcelaSelecionada.numero}ª parcela`:"Pagamento à vista"}</dd></div><div><dt>Valor</dt><dd>{moeda(valorRecebido)}</dd></div><div><dt>Data</dt><dd>{formatarDataCivil(form.dataPagamento)}</dd></div><div><dt>Saldo projetado</dt><dd>{moeda(estimado)}</dd></div></dl></section>}
  </Modal>;
}

function EstornoForm({ pagamento, negociacao, onCancelar, onConcluir }) {
  const [motivo,setMotivo]=useState(""),[erro,setErro]=useState(""),[enviando,setEnviando]=useState(false),[confirmando,setConfirmando]=useState(false),[idempotencia]=useState(criarChaveIdempotencia);
  const salvar=async()=>{if(limpo(motivo).length<5)return setErro("Informe o motivo do estorno com pelo menos 5 caracteres.");if(!confirmando)return setConfirmando(true);setEnviando(true);try{await api.estornarPagamento({pagamentoId:pagamento.id,versaoEsperada:negociacao.versao,motivo,idempotencia});await onConcluir();}catch(e){setErro(mensagemErroDevedores(e));setConfirmando(false);}finally{setEnviando(false);}};
  return <Modal titulo="Estornar pagamento" subtitulo={`Pagamento de ${moeda(pagamento.valor)} em ${formatarDataCivil(pagamento.data_pagamento)}.`} onFechar={onCancelar} bloqueado={enviando} footer={<><button className="btn-secundario" disabled={enviando} onClick={onCancelar}>Cancelar</button><button className="btn-danger" disabled={enviando} onClick={salvar}>{enviando?"Processando...":confirmando?"Confirmar estorno":"Revisar estorno"}</button></>}>
    {erro&&<Estado tipo="erro">{erro}</Estado>}<Estado tipo="aviso">O pagamento não será apagado. O motivo ficará no histórico.</Estado><Campo label="Motivo do estorno" obrigatorio><textarea rows="3" value={motivo} onChange={e=>setMotivo(e.target.value)}/></Campo>
  </Modal>;
}

function ExclusaoForm({ item, onCancelar, onConcluir }) {
  const [motivo,setMotivo]=useState(""),[confirmando,setConfirmando]=useState(false),[enviando,setEnviando]=useState(false),[erro,setErro]=useState("");
  const salvar=async()=>{if(limpo(motivo).length<5)return setErro("Informe o motivo da exclusão com pelo menos 5 caracteres.");if(!confirmando)return setConfirmando(true);setEnviando(true);setErro("");try{await api.excluirDevedorAdministrativamente({dividaId:item.id,versaoEsperada:item.versao,motivo});await onConcluir();}catch(e){setErro(mensagemErroDevedores(e));setConfirmando(false);}finally{setEnviando(false);}};
  return <Modal titulo="Excluir devedor" subtitulo={item.relatorio.nome_fantasia||item.relatorio.nome} onFechar={onCancelar} bloqueado={enviando} footer={<><button className="btn-secundario" disabled={enviando} onClick={onCancelar}>Cancelar</button><button className="btn-danger" disabled={enviando} onClick={salvar}>{enviando?"Excluindo...":confirmando?"Confirmar exclusão":"Revisar exclusão"}</button></>}>
    {erro&&<Estado tipo="erro">{erro}</Estado>}<Estado tipo="aviso">Esta ação removerá o devedor da operação e dos indicadores, mas preservará negociações, parcelas, pagamentos e histórico financeiro para auditoria.</Estado><Campo label="Motivo da exclusão" obrigatorio><textarea rows="4" maxLength="1000" value={motivo} onChange={e=>setMotivo(e.target.value)}/></Campo>{confirmando&&<Estado tipo="aviso">Confirme somente se este cadastro deve deixar a operação. A ação não apaga o histórico financeiro.</Estado>}
  </Modal>;
}

function Detalhe({ item, detalhe, permissao, carregando, erro, confirmado, onFechar, onRecarregar, onAcao }) {
  if(item)return <Modal titulo={item.relatorio.nome_fantasia||item.relatorio.nome} subtitulo="Dossiê contextual da dívida" onFechar={onFechar} largo>
    <div className="dev-cf-mobile-dossier"><DossieDesktop item={item} detalhe={detalhe} permissao={permissao} carregando={carregando} erro={erro} confirmado={confirmado} onRecarregar={onRecarregar} onAcao={onAcao}/></div>
  </Modal>;
  if(carregando)return <Modal titulo="Detalhes da dívida" onFechar={onFechar}>
    <Skeleton variant="detail" lines={7} label="Carregando detalhes..." className="dev-detail-skeleton"/>
  </Modal>;
  if(erro)return <Modal titulo="Detalhes da dívida" onFechar={onFechar}><Estado tipo="erro" acao={<button className="btn-secundario" onClick={onRecarregar}>Tentar novamente</button>}>{erro}</Estado></Modal>;
  const rel=item.relatorio,res=detalhe.resumo||item.resumo,excluido=Boolean(rel.excluido_em||res.excluido_em),ativa=detalhe.negociacoes.find(n=>n.situacao==="ativa")||detalhe.negociacoes[0],proxima=detalhe.parcelas.filter(p=>Number(p.saldo)>0).sort((a,b)=>String(a.vencimento).localeCompare(String(b.vencimento)))[0],estornados=new Set(detalhe.estornos.map(e=>String(e.pagamento_id)));
  const percentual=Math.max(0,Math.min(100,Number(res.evolucao_percentual||0))),parcelasQuitadas=detalhe.parcelas.filter(p=>Number(p.saldo)<=0||["paga","quitada"].includes(p.situacao)).length,totalParcelas=detalhe.parcelas.length;
  return <Modal titulo={rel.nome_fantasia||rel.nome} subtitulo={`${rel.nome} · ${rel.gerente_nome_snapshot}`} onFechar={onFechar} largo footer={<button className="btn-secundario" onClick={onFechar}>Fechar</button>}>
    <div className="dev-dossie">
      {excluido&&<section className="dev-exclusao-aviso"><strong>EXCLUÍDO ADMINISTRATIVAMENTE</strong><span>{rel.motivo_exclusao}</span><small>Por {rel.excluido_por_nome_snapshot} em {new Date(rel.excluido_em).toLocaleString("pt-BR")}</small></section>}
      <section className="dev-dossie-cabecalho" aria-label="Posição financeira da dívida">
        <div className="dev-dossie-identidade">
          <span>Saldo atual</span>
          <strong className="dev-dossie-saldo">{moeda(res.saldo_restante)}</strong>
          <div className="dev-dossie-meta dev-detalhe-topo"><StatusBadge status={excluido?"excluida":res.situacao} className={`dev-situacao dev-situacao-${excluido?"excluida":res.situacao}`}>{excluido?"Excluído administrativamente":situacaoApresentacao(res.situacao)}</StatusBadge><span>{item.modalidade_nome_snapshot}</span><span>{rel.telefone}</span></div>
        </div>
        <div className="dev-dossie-resumo dev-resumo"><div><span>Valor original</span><b>{moeda(res.valor_original)}</b></div><div><span>Valor negociado</span><b>{moeda(res.valor_negociado)}</b></div><div><span>Total pago</span><b>{moeda(res.total_pago)}</b></div><div><span>Evolução</span><b>{percentual.toLocaleString("pt-BR")}%</b></div><div><span>Próximo vencimento</span><b>{proxima?formatarDataCivil(proxima.vencimento):"—"}</b></div></div>
      </section>
      <section className="dev-dossie-trilho dev-progresso" aria-label={`Progresso da dívida: ${percentual.toLocaleString("pt-BR")}%`}><header><div><span>Trilho de liquidação</span><b>{totalParcelas?`${parcelasQuitadas} de ${totalParcelas} parcelas quitadas`:`${percentual.toLocaleString("pt-BR")}% concluído`}</b></div><strong>{percentual.toLocaleString("pt-BR")}%</strong></header><div aria-label={`${percentual.toLocaleString("pt-BR")}% da dívida liquidada`} className="dev-progresso-trilha" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={percentual}><span style={{width:`${percentual}%`}}/></div>{totalParcelas>0&&<div className="dev-progresso-etapas" aria-hidden="true">{detalhe.parcelas.map(p=>{const quitada=Number(p.saldo)<=0||["paga","quitada"].includes(p.situacao);return <span key={p.id} className={quitada?"concluida":""}>{p.numero}</span>})}</div>}</section>
      {!excluido&&<ActionBar className="dev-acoes dev-acoes-operacionais dev-dossie-acoes" align="start">{permissao.corrigirCadastro&&<Button variant="secondary" className="btn-secundario" leadingIcon="edit" onClick={()=>onAcao("cadastro")}>Corrigir cadastro</Button>}{permissao.negociar&&!ativa&&<Button variant="primary" className="btn-primario" leadingIcon="plus" onClick={()=>onAcao("negociar")}>Nova negociação</Button>}{permissao.substituirNegociacao&&ativa&&<Button variant="secondary" className="btn-secundario" onClick={()=>onAcao("substituir")}>Substituir negociação</Button>}{permissao.corrigirAdministrativamente&&ativa&&<Button variant="secondary" className="btn-secundario" leadingIcon="edit" onClick={()=>onAcao("corrigir-negociacao")}>Corrigir negociação</Button>}{permissao.pagar&&ativa&&Number(res.saldo_restante)>0&&<Button variant="primary" className="btn-primario" leadingIcon="money" onClick={()=>onAcao("pagar")}>Registrar pagamento</Button>}{permissao.excluirAdministrativamente&&<Button variant="danger-outline" className="btn-danger-outline" leadingIcon="trash" onClick={()=>onAcao("excluir")}>Excluir devedor</Button>}</ActionBar>}
      {permissao.somenteLeitura&&<Estado tipo="info">Acesso somente leitura. Todos os dados e o histórico estão disponíveis.</Estado>}
      <div className="dev-dossie-grid">
        <div className="dev-dossie-principal">
          <section className="dev-bloco dev-dossie-cadastro"><h3>Cadastro e dívida original</h3><dl><div><dt>Endereço</dt><dd>{[rel.endereco,rel.numero,rel.complemento,rel.bairro,rel.cidade,rel.estado].filter(Boolean).join(", ")}</dd></div><div><dt>Registro</dt><dd>{formatarDataCivil(item.data_registro)}</dd></div><div><dt>Observações</dt><dd>{item.observacoes_originais||"Sem observações"}</dd></div></dl></section>
          <section className="dev-bloco dev-dossie-negociacao"><h3>Negociação</h3>{ativa?<dl><div><dt>Forma</dt><dd>{ativa.forma_pagamento==="vista"?"À vista":"Parcelada"}</dd></div><div><dt>Valor</dt><dd>{moeda(ativa.valor_negociado)}</dd></div><div><dt>Responsável</dt><dd className="dev-responsavel">{perfilResponsavel(ativa.criado_por_perfil_snapshot)}</dd></div></dl>:<p>Nenhuma negociação registrada.</p>}</section>
          <section className="dev-bloco dev-dossie-parcelas"><h3>Parcelas</h3><div className="dev-parcelas">{detalhe.parcelas.length?detalhe.parcelas.map(p=>{const original=Number(p.valor_original??p.valor??0),saldo=Number(p.saldo||0),pago=Number(p.valor_pago??Math.max(0,original-saldo)),quitada=saldo<=0||["paga","quitada"].includes(p.situacao);return <article key={p.id} className={`dev-parcela dev-parcela-${p.situacao} ${quitada?"dev-parcela-concluida":""}`}><header><div><b>{p.numero}ª parcela</b>{quitada&&<small>Parcela quitada</small>}</div><StatusBadge status={quitada?"quitada":p.situacao} className={`dev-situacao dev-situacao-${p.situacao}`}>{quitada?"Quitada":situacaoApresentacao(p.situacao)}</StatusBadge></header><dl><div><dt>Vencimento</dt><dd>{formatarDataCivil(p.vencimento)}</dd></div><div><dt>Valor original</dt><dd>{moeda(original)}</dd></div><div><dt>Valor pago</dt><dd>{moeda(pago)}</dd></div><div><dt>Saldo</dt><dd className={saldo>0?"dev-valor-pendente":"dev-valor-quitado"}>{moeda(saldo)}</dd></div></dl></article>}):<p>Sem parcelas.</p>}</div></section>
        </div>
        <aside className="dev-dossie-rail" aria-label="Movimentações e histórico">
          <section className="dev-bloco dev-dossie-pagamentos"><h3>Pagamentos</h3><div className="dev-lista-interna">{detalhe.pagamentos.length?detalhe.pagamentos.map(p=><article key={p.id} className={estornados.has(String(p.id))?"dev-item-estornado":""}><div><b>{moeda(p.valor)}</b><span>{formatarDataCivil(p.data_pagamento)} · {p.registrado_por_nome_snapshot}</span></div>{permissao.estornar&&!estornados.has(String(p.id))&&<button className="btn-danger-outline" onClick={()=>onAcao("estornar",p)}>Estornar</button>}</article>):<p>Nenhum pagamento registrado.</p>}</div></section>
          <section className="dev-bloco dev-dossie-estornos"><h3>Estornos</h3><div className="dev-lista-interna">{detalhe.estornos.length?detalhe.estornos.map(e=><article key={e.id}><div><b>{e.motivo}</b><span>{e.estornado_por_nome_snapshot} · {new Date(e.estornado_em).toLocaleString("pt-BR")}</span></div></article>):<p>Nenhum estorno registrado.</p>}</div></section>
          <section className="dev-bloco dev-dossie-historico"><h3>Histórico completo</h3><div className="dev-linha-tempo">{detalhe.historico.map(h=><article key={h.id}><span/><div><b>{h.acao.replaceAll("_"," ")}</b><small>{h.usuario_nome_snapshot} · {new Date(h.criado_em).toLocaleString("pt-BR")}</small>{h.motivo&&<p>{h.motivo}</p>}</div></article>)}</div></section>
        </aside>
      </div>
    </div>
  </Modal>;
}

function DossieDesktop({item,detalhe,permissao,carregando,erro,confirmado,onRecarregar,onAcao}) {
  const [aba,setAba]=useState("divida");
  const tabDividaRef=useRef(null);
  const tabRastroRef=useRef(null);
  useEffect(()=>setAba("divida"),[item?.id]);

  if(!item)return <aside aria-label="Dossiê da dívida" className="dev-cf-dossier dev-cf-dossier-empty"><span><IconeFluxo nome="search" size={21}/></span><h2>Selecione uma dívida</h2><p>O dossiê permanente mostrará posição financeira, acordo, parcelas e histórico.</p></aside>;
  if(carregando)return <aside aria-label={`Carregando dossiê de ${item.relatorio.nome_fantasia||item.relatorio.nome}`} className="dev-cf-dossier"><Skeleton variant="detail" lines={7} label="Carregando detalhes..." className="dev-detail-skeleton"/></aside>;
  if(erro)return <aside aria-label={`Falha ao carregar dossiê de ${item.relatorio.nome_fantasia||item.relatorio.nome}`} className="dev-cf-dossier"><div className="dev-cf-dossier-error"><Estado tipo="erro" acao={<button className="btn-secundario" onClick={onRecarregar}>Tentar novamente</button>}>{erro}</Estado></div></aside>;
  if(!detalhe)return <aside aria-label="Dossiê indisponível" className="dev-cf-dossier dev-cf-dossier-empty"><h2>Dossiê indisponível</h2><p>Selecione novamente o registro para carregar os detalhes.</p></aside>;

  const rel=item.relatorio,res=detalhe.resumo||item.resumo,excluido=Boolean(rel.excluido_em||res.excluido_em);
  const ativa=detalhe.negociacoes.find(n=>n.situacao==="ativa")||detalhe.negociacoes[0];
  const proxima=detalhe.parcelas.filter(p=>Number(p.saldo)>0).sort((a,b)=>String(a.vencimento).localeCompare(String(b.vencimento)))[0];
  const estornados=new Set(detalhe.estornos.map(e=>String(e.pagamento_id)));
  const percentual=Math.max(0,Math.min(100,Number(res.evolucao_percentual||0)));
  const parcelasQuitadas=detalhe.parcelas.filter(p=>Number(p.saldo)<=0||["paga","quitada"].includes(p.situacao)).length;
  const totalParcelas=detalhe.parcelas.length;
  const registroAtual={...item,resumo:res};
  const contexto=contextoDoRegistro(registroAtual,permissao);
  const principal=excluido||res.situacao==="quitada"?null:permissao.pagar&&ativa&&Number(res.saldo_restante)>0?{chave:"pagar",rotulo:"Registrar pagamento",apoio:"Confirmar um recebimento nesta negociação"}:permissao.negociar&&!ativa&&Number(res.saldo_restante)>0?{chave:"negociar",rotulo:"Registrar negociação",apoio:"Criar a primeira condição para esta dívida"}:null;
  const moverAba=event=>{
    if(!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;
    event.preventDefault();
    const proxima=event.key==="ArrowLeft"||event.key==="Home"?"divida":"rastro";
    setAba(proxima);
    window.requestAnimationFrame(()=>(proxima==="divida"?tabDividaRef:tabRastroRef).current?.focus());
  };

  return <aside aria-label={`Dossiê de ${rel.nome_fantasia||rel.nome}`} className={`dev-cf-dossier dev-cf-dossier-ready${confirmado?" is-confirmed":""}`}>
    <div className="dev-cf-dossier-scroll">
      {excluido&&<section className="dev-exclusao-aviso"><strong>EXCLUÍDO ADMINISTRATIVAMENTE</strong><span>{rel.motivo_exclusao}</span><small>Por {rel.excluido_por_nome_snapshot} em {new Date(rel.excluido_em).toLocaleString("pt-BR")}</small></section>}
      <section className={`dev-cf-next dev-cf-next-${contexto.tom}`}>
        <header><span>{principal?"Próximo movimento autorizado":"Necessidade operacional"}</span><StatusBadge status={excluido?"excluida":res.situacao} className={`dev-situacao dev-situacao-${excluido?"excluida":res.situacao}`}>{excluido?"Excluído administrativamente":situacaoApresentacao(res.situacao)}</StatusBadge></header>
        <small>{contexto.rotulo}</small>
        <h2>{principal?.rotulo||contexto.acao}</h2>
        <p>{principal?.apoio||(permissao.somenteLeitura?"Acesso integral ao dossiê em modo somente leitura.":"A posição pode ser consultada sem gerar uma nova movimentação.")}</p>
        {principal&&<button className="dev-cf-primary-action" onClick={()=>onAcao(principal.chave)} type="button"><span><IconeFluxo nome={principal.chave==="pagar"?"money":principal.chave==="negociar"?"follow":"debt"}/><span><strong>{principal.rotulo}</strong><small>A operação abrirá sua revisão real</small></span></span><IconeFluxo nome="arrow"/></button>}
        {confirmado&&<div aria-live="polite" className="dev-cf-confirmed"><IconeFluxo nome="check" size={15}/><strong>Operação confirmada e posição recarregada.</strong></div>}
      </section>

      <section className="dev-cf-account" aria-label="Posição financeira da dívida">
        <div><span>Conta selecionada</span><h3>{rel.nome_fantasia||rel.nome}</h3><p>{rel.nome} · {rel.cidade}/{rel.estado}</p></div>
        <div><span>Saldo atual</span><strong>{moeda(res.saldo_restante)}</strong><small>{item.modalidade_nome_snapshot}</small></div>
      </section>
      <dl className="dev-cf-financial-line"><div><dt>Valor original</dt><dd>{moeda(res.valor_original)}</dd></div><div><dt>Negociado</dt><dd>{moeda(res.valor_negociado)}</dd></div><div><dt>Total pago</dt><dd>{moeda(res.total_pago)}</dd></div><div><dt>Próximo vencimento</dt><dd>{proxima?formatarDataCivil(proxima.vencimento):"—"}</dd></div></dl>

      <section className="dev-cf-progress" aria-label={`Progresso da dívida: ${percentual.toLocaleString("pt-BR")}%`}>
        <header><div><span>Trilho de liquidação</span><strong>{ESTAGIOS_LIQUIDACAO[estagioDoRegistro(registroAtual)]}</strong></div><small>{totalParcelas?`${parcelasQuitadas} de ${totalParcelas} parcelas quitadas · `:""}<b>{percentual.toLocaleString("pt-BR")}%</b></small></header>
        <TrilhoFluxo confirmado={confirmado} expandido registro={registroAtual}/>
        <div aria-label={`${percentual.toLocaleString("pt-BR")}% da dívida liquidada`} className="dev-progresso-trilha" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={percentual}><span style={{width:`${percentual}%`}}/></div>
      </section>

      {!excluido&&<ActionBar className="dev-acoes dev-acoes-operacionais dev-cf-secondary-actions" align="start">
        {permissao.corrigirCadastro&&principal?.chave!=="cadastro"&&<Button variant="secondary" className="btn-secundario" leadingIcon="edit" onClick={()=>onAcao("cadastro")}>Corrigir cadastro</Button>}
        {permissao.negociar&&!ativa&&principal?.chave!=="negociar"&&<Button variant="primary" className="btn-primario" leadingIcon="plus" onClick={()=>onAcao("negociar")}>Nova negociação</Button>}
        {permissao.substituirNegociacao&&ativa&&<Button variant="secondary" className="btn-secundario" onClick={()=>onAcao("substituir")}>Substituir negociação</Button>}
        {permissao.corrigirAdministrativamente&&ativa&&<Button variant="secondary" className="btn-secundario" leadingIcon="edit" onClick={()=>onAcao("corrigir-negociacao")}>Corrigir negociação</Button>}
        {permissao.pagar&&ativa&&Number(res.saldo_restante)>0&&principal?.chave!=="pagar"&&<Button variant="primary" className="btn-primario" leadingIcon="money" onClick={()=>onAcao("pagar")}>Registrar pagamento</Button>}
        {permissao.excluirAdministrativamente&&<Button variant="danger-outline" className="btn-danger-outline" leadingIcon="trash" onClick={()=>onAcao("excluir")}>Excluir devedor</Button>}
      </ActionBar>}
      {permissao.somenteLeitura&&<Estado tipo="info">Acesso somente leitura. Todos os dados e o histórico estão disponíveis.</Estado>}

      <div className="dev-cf-tabs" role="tablist" aria-label="Conteúdo do dossiê">
        <button aria-controls="dev-cf-debt-panel" aria-selected={aba==="divida"} id="dev-cf-debt-tab" onClick={()=>setAba("divida")} onKeyDown={moverAba} ref={tabDividaRef} role="tab" tabIndex={aba==="divida"?0:-1} type="button"><IconeFluxo nome="debt" size={17}/> Dívida</button>
        <button aria-controls="dev-cf-trace-panel" aria-selected={aba==="rastro"} id="dev-cf-trace-tab" onClick={()=>setAba("rastro")} onKeyDown={moverAba} ref={tabRastroRef} role="tab" tabIndex={aba==="rastro"?0:-1} type="button"><IconeFluxo nome="trace" size={17}/> Rastro operacional</button>
      </div>

      {aba==="divida"?<div aria-labelledby="dev-cf-debt-tab" className="dev-cf-tab-panel" id="dev-cf-debt-panel" role="tabpanel">
        <section className="dev-bloco dev-dossie-cadastro"><h3>Cadastro e dívida original</h3><dl><div><dt>Endereço</dt><dd>{[rel.endereco,rel.numero,rel.complemento,rel.bairro,rel.cidade,rel.estado].filter(Boolean).join(", ")}</dd></div><div><dt>Responsável</dt><dd>{rel.gerente_nome_snapshot}</dd></div><div><dt>Registro</dt><dd>{formatarDataCivil(item.data_registro)}</dd></div><div><dt>Telefone</dt><dd>{rel.telefone}</dd></div><div><dt>Observações</dt><dd>{item.observacoes_originais||"Sem observações"}</dd></div></dl></section>
        <section className="dev-bloco dev-dossie-negociacao"><h3>Negociação</h3>{ativa?<dl><div><dt>Forma</dt><dd>{ativa.forma_pagamento==="vista"?"À vista":"Parcelada"}</dd></div><div><dt>Valor</dt><dd>{moeda(ativa.valor_negociado)}</dd></div><div><dt>Responsável</dt><dd className="dev-responsavel">{perfilResponsavel(ativa.criado_por_perfil_snapshot)}</dd></div></dl>:<p>Nenhuma negociação registrada.</p>}</section>
        <section className="dev-bloco dev-dossie-parcelas"><h3>Parcelas</h3><div className="dev-parcelas">{detalhe.parcelas.length?detalhe.parcelas.map(p=>{const original=Number(p.valor_original??p.valor??0),saldo=Number(p.saldo||0),pago=Number(p.valor_pago??Math.max(0,original-saldo)),quitada=saldo<=0||["paga","quitada"].includes(p.situacao);return <article key={p.id} className={`dev-parcela dev-parcela-${p.situacao} ${quitada?"dev-parcela-concluida":""}`}><header><div><b>{p.numero}ª parcela</b>{quitada&&<small>Parcela quitada</small>}</div><StatusBadge status={quitada?"quitada":p.situacao} className={`dev-situacao dev-situacao-${p.situacao}`}>{quitada?"Quitada":situacaoApresentacao(p.situacao)}</StatusBadge></header><dl><div><dt>Vencimento</dt><dd>{formatarDataCivil(p.vencimento)}</dd></div><div><dt>Original</dt><dd>{moeda(original)}</dd></div><div><dt>Pago</dt><dd>{moeda(pago)}</dd></div><div><dt>Saldo</dt><dd className={saldo>0?"dev-valor-pendente":"dev-valor-quitado"}>{moeda(saldo)}</dd></div></dl></article>}):<p>Sem parcelas.</p>}</div></section>
        <section className="dev-bloco dev-dossie-pagamentos"><h3>Pagamentos</h3><div className="dev-lista-interna">{detalhe.pagamentos.length?detalhe.pagamentos.map(p=><article key={p.id} className={estornados.has(String(p.id))?"dev-item-estornado":""}><div><b>{moeda(p.valor)}</b><span>{formatarDataCivil(p.data_pagamento)} · {p.registrado_por_nome_snapshot}</span></div>{permissao.estornar&&!estornados.has(String(p.id))&&<button className="btn-danger-outline" onClick={()=>onAcao("estornar",p)}>Estornar</button>}</article>):<p>Nenhum pagamento registrado.</p>}</div></section>
        <section className="dev-bloco dev-dossie-estornos"><h3>Estornos</h3><div className="dev-lista-interna">{detalhe.estornos.length?detalhe.estornos.map(e=><article key={e.id}><div><b>{e.motivo}</b><span>{e.estornado_por_nome_snapshot} · {new Date(e.estornado_em).toLocaleString("pt-BR")}</span></div></article>):<p>Nenhum estorno registrado.</p>}</div></section>
      </div>:<div aria-labelledby="dev-cf-trace-tab" className="dev-cf-tab-panel" id="dev-cf-trace-panel" role="tabpanel"><section className="dev-bloco dev-dossie-historico"><h3>Histórico completo</h3><div className="dev-linha-tempo">{detalhe.historico.length?detalhe.historico.map(h=><article key={h.id}><span/><div><b>{h.acao.replaceAll("_"," ")}</b><small>{h.usuario_nome_snapshot} · {new Date(h.criado_em).toLocaleString("pt-BR")}</small>{h.motivo&&<p>{h.motivo}</p>}</div></article>):<p>Nenhum movimento registrado.</p>}</div></section></div>}
    </div>
  </aside>;
}

export default function DevedoresPage({ perfilAtual, onAbrirMenu, menuAberto = false }) {
  const permissao=useMemo(
    ()=>permissoesDevedores(perfilAtual?.perfil,perfilAtual?.perfilReal===true),
    [perfilAtual?.perfil,perfilAtual?.perfilReal],
  );
  const [controleDetalhe]=useState(criarControleRequisicoes);
  const rowRefs=useRef(new Map());
  const ledgerShellRef=useRef(null);
  const ledgerScrollRef=useRef(null);
  const bridgeFrameRef=useRef(null);
  const ultimoGatilhoRef=useRef(null);
  const buscaRef=useRef(null);
  const commandRef=useRef(null);
  const filtrosRef=useRef(null);
  const filtroFecharRef=useRef(null);
  const filtroGatilhoRef=useRef(null);
  const confirmacaoTimerRef=useRef(null);

  const [dados,setDados]=useState({itens:[],modalidades:[],limiteAtingido:false});
  const [carregando,setCarregando]=useState(true);
  const [erro,setErro]=useState("");
  const [busca,setBusca]=useState("");
  const [buscaFocada,setBuscaFocada]=useState(false);
  const [indiceBusca,setIndiceBusca]=useState(0);
  const [filtros,setFiltros]=useState({...FILTROS_VAZIOS});
  const [filtrosRascunho,setFiltrosRascunho]=useState({...FILTROS_VAZIOS});
  const [maisFiltros,setMaisFiltros]=useState(false);
  const [fila,setFila]=useState("all");
  const [ordenacao,setOrdenacao]=useState("operacional");
  const [ordenacaoRascunho,setOrdenacaoRascunho]=useState("operacional");
  const [pagina,setPagina]=useState(1);
  const [focoLedgerId,setFocoLedgerId]=useState(null);
  const [item,setItem]=useState(null);
  const [detalhe,setDetalhe]=useState(null);
  const [detalheErro,setDetalheErro]=useState("");
  const [detalheCarregando,setDetalheCarregando]=useState(false);
  const [acao,setAcao]=useState(null);
  const [pagamentoEstorno,setPagamentoEstorno]=useState(null);
  const [confirmacao,setConfirmacao]=useState(null);
  const [ponteLedger,setPonteLedger]=useState({y:0,visivel:false});
  const [dossieCompacto,setDossieCompacto]=useState(
    ()=>typeof window!=="undefined"&&window.matchMedia("(max-width: 1240px)").matches,
  );
  const [filtroCompacto,setFiltroCompacto]=useState(
    ()=>typeof window!=="undefined"&&window.matchMedia("(max-width: 760px)").matches,
  );

  const carregar=useCallback(async()=>{
    setCarregando(true);
    setErro("");
    try{
      const resultado=await api.carregarDevedores();
      setDados(resultado);
      return resultado;
    }catch(e){
      setErro(mensagemErroDevedores(e));
      return null;
    }finally{
      setCarregando(false);
    }
  },[]);

  useEffect(()=>{
    if(permissao.acessar)void carregar();
    else setCarregando(false);
  },[carregar,permissao.acessar]);

  useEffect(()=>{
    const media=window.matchMedia("(max-width: 1240px)");
    const sincronizar=()=>setDossieCompacto(media.matches);
    sincronizar();
    media.addEventListener?.("change",sincronizar);
    return()=>media.removeEventListener?.("change",sincronizar);
  },[]);

  useEffect(()=>{
    const media=window.matchMedia("(max-width: 760px)");
    const sincronizar=()=>setFiltroCompacto(media.matches);
    sincronizar();
    media.addEventListener?.("change",sincronizar);
    return()=>media.removeEventListener?.("change",sincronizar);
  },[]);

  useEffect(()=>{
    if(maisFiltros)window.requestAnimationFrame(()=>filtroFecharRef.current?.focus());
  },[maisFiltros]);

  useEffect(()=>{
    const aoPressionar=event=>{
      const tag=event.target?.tagName?.toLowerCase();
      const digitando=["input","select","textarea"].includes(tag)||event.target?.isContentEditable;
      if(event.key==="/"&&!digitando&&!maisFiltros&&!acao&&!menuAberto&&!(dossieCompacto&&item)){
        event.preventDefault();
        buscaRef.current?.focus();
      }
      if(event.key==="Escape"&&maisFiltros){
        setMaisFiltros(false);
        window.requestAnimationFrame(()=>filtroGatilhoRef.current?.focus());
      }
    };
    window.addEventListener("keydown",aoPressionar);
    return()=>window.removeEventListener("keydown",aoPressionar);
  },[acao,dossieCompacto,item,maisFiltros,menuAberto]);

  useEffect(()=>()=>window.clearTimeout(confirmacaoTimerRef.current),[]);

  const abrirDetalhe=useCallback(async(alvo,gatilho=null)=>{
    if(!alvo)return;
    if(gatilho)ultimoGatilhoRef.current=gatilho;
    const requisicao=controleDetalhe.iniciar();
    setItem(alvo);
    setDetalhe(null);
    setDetalheCarregando(true);
    setDetalheErro("");
    try{
      const resultado=await api.carregarDetalheDevedor(alvo.id);
      if(controleDetalhe.vigente(requisicao)){setDetalhe(resultado);return true;}
    }catch(e){
      if(controleDetalhe.vigente(requisicao))setDetalheErro(mensagemErroDevedores(e));
      return false;
    }finally{
      if(controleDetalhe.vigente(requisicao))setDetalheCarregando(false);
    }
    return false;
  },[controleDetalhe]);

  const fecharDetalhe=()=>{
    controleDetalhe.invalidar();
    setItem(null);
    setDetalhe(null);
    setDetalheErro("");
    setDetalheCarregando(false);
    window.requestAnimationFrame(()=>ultimoGatilhoRef.current?.focus());
  };

  const registrarConfirmacao=(id,tipo,sincronizada=true)=>{
    const mensagens={
      cadastro:"Cadastro atualizado",
      novo:"Devedor cadastrado",
      negociar:"Negociação registrada",
      substituir:"Negociação substituída",
      "corrigir-negociacao":"Negociação corrigida",
      pagar:"Pagamento registrado",
      estornar:"Pagamento estornado",
      excluir:"Devedor excluído administrativamente",
    };
    setConfirmacao({id:id||null,tipo,sincronizada,mensagem:sincronizada?(mensagens[tipo]||"Operação concluída"):"Operação confirmada; a posição ainda precisa ser recarregada."});
    window.clearTimeout(confirmacaoTimerRef.current);
    confirmacaoTimerRef.current=window.setTimeout(()=>setConfirmacao(null),3200);
  };

  const concluirAcao=async(tipo)=>{
    const idAtual=item?.id;
    setAcao(null);
    setPagamentoEstorno(null);
    const atualizados=await carregar();
    if(!atualizados){registrarConfirmacao(null,tipo,false);return;}
    const atualizado=atualizados?.itens.find(registro=>String(registro.id)===String(idAtual));
    const sincronizada=atualizado?await abrirDetalhe(atualizado):false;
    if(!atualizado){setItem(null);setDetalhe(null);}
    registrarConfirmacao(sincronizada?atualizado.id:null,tipo,sincronizada);
  };

  const concluirNovo=async()=>{
    setAcao(null);
    await carregar();
    registrarConfirmacao(null,"novo");
  };

  const gerentes=useMemo(
    ()=>[...new Set(dados.itens.map(i=>i.relatorio.gerente_nome_snapshot).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt-BR")),
    [dados.itens],
  );

  const filasDisponiveis=useMemo(
    ()=>permissao.excluirAdministrativamente
      ?[...FILAS_OPERACIONAIS,{id:"excluidas",rotulo:"Excluídas",descricao:"Auditoria administrativa",icone:"trace"}]
      :FILAS_OPERACIONAIS,
    [permissao.excluirAdministrativamente],
  );

  const contagensFilas=useMemo(()=>{
    const contagens=Object.fromEntries(filasDisponiveis.map(opcao=>[opcao.id,0]));
    for(const registro of dados.itens){
      const chave=filaDoRegistro(registro);
      if(chave!=="excluidas")contagens.all=(contagens.all||0)+1;
      if(Object.hasOwn(contagens,chave))contagens[chave]+=1;
    }
    return contagens;
  },[dados.itens,filasDisponiveis]);

  const filtrarCarteira=useCallback((filtrosAtuais,filaAtual)=>{
    const termo=normalizarBusca(busca);
    const ordemFila={vencidas:0,"sem-negociacao":1,"em-acordo":2,quitadas:3,excluidas:4};
    return dados.itens
      .filter(i=>{
        const r=i.relatorio,s=i.resumo,excluido=registroExcluido(i);
        const alvo=normalizarBusca([r.nome,r.nome_fantasia,r.telefone,r.cidade,r.estado,r.gerente_nome_snapshot,i.modalidade_nome_snapshot].join(" "));
        return !(filtrosAtuais.cadastro==="ativos"&&excluido)
          &&!(filtrosAtuais.cadastro==="excluidos"&&!excluido)
          &&!(termo&&!alvo.includes(termo))
          &&!(filtrosAtuais.situacao&&s.situacao!==filtrosAtuais.situacao)
          &&!(filtrosAtuais.modalidade&&String(i.modalidade_id)!==filtrosAtuais.modalidade)
          &&!(filtrosAtuais.gerente&&r.gerente_nome_snapshot!==filtrosAtuais.gerente)
          &&!(filtrosAtuais.forma&&s.forma_pagamento!==filtrosAtuais.forma)
          &&!(filtrosAtuais.marcador==="vencidas"&&s.situacao!=="vencida")
          &&!(filtrosAtuais.marcador==="quitadas"&&s.situacao!=="quitada")
          &&!(filtrosAtuais.periodo&&!String(i.data_registro).startsWith(filtrosAtuais.periodo))
          &&!(filaAtual!=="all"&&filaDoRegistro(i)!==filaAtual);
      })
      .sort((a,b)=>{
        if(ordenacao==="nome")return a.relatorio.nome.localeCompare(b.relatorio.nome,"pt-BR");
        if(ordenacao==="saldo")return Number(b.resumo.saldo_restante)-Number(a.resumo.saldo_restante);
        if(ordenacao==="atualizado")return String(b.atualizado_em).localeCompare(String(a.atualizado_em));
        return (ordemFila[filaDoRegistro(a)]??9)-(ordemFila[filaDoRegistro(b)]??9)
          ||Number(b.resumo.saldo_restante)-Number(a.resumo.saldo_restante)
          ||String(b.atualizado_em).localeCompare(String(a.atualizado_em));
      });
  },[busca,dados.itens,ordenacao]);

  const filtrados=useMemo(()=>filtrarCarteira(filtros,fila),[fila,filtrarCarteira,filtros]);
  const filaRascunho=filtrosRascunho.cadastro==="excluidos"?"excluidas":fila==="excluidas"?"all":fila;
  const totalRascunho=useMemo(()=>filtrarCarteira(filtrosRascunho,filaRascunho).length,[filaRascunho,filtrarCarteira,filtrosRascunho]);
  const rascunhoAlterado=ordenacaoRascunho!==ordenacao||Object.keys(FILTROS_VAZIOS).some(campo=>filtrosRascunho[campo]!==filtros[campo]);

  useEffect(()=>setPagina(1),[busca,fila,filtros,ordenacao]);
  useEffect(()=>setIndiceBusca(0),[busca,fila,filtros,ordenacao]);

  const paginas=Math.max(1,Math.ceil(filtrados.length/POR_PAGINA));
  const exibidos=filtrados.slice((pagina-1)*POR_PAGINA,pagina*POR_PAGINA);
  const idsExibidos=exibidos.map(registro=>String(registro.id)).join("|");
  const primeiroExibido=exibidos[0]?.id??null;
  const resultadosComando=filtrados.slice(0,5);
  const filaAtual=filasDisponiveis.find(opcao=>opcao.id===fila)||filasDisponiveis[0];

  const atualizarPonteLedger=useCallback(()=>{
    window.cancelAnimationFrame(bridgeFrameRef.current);
    bridgeFrameRef.current=window.requestAnimationFrame(()=>{
      const shell=ledgerShellRef.current;
      const scroller=ledgerScrollRef.current;
      const linha=rowRefs.current.get(item?.id);
      if(!shell||!scroller||!linha||dossieCompacto){
        setPonteLedger(atual=>atual.visivel?{...atual,visivel:false}:atual);
        return;
      }
      const shellRect=shell.getBoundingClientRect();
      const scrollRect=scroller.getBoundingClientRect();
      const linhaRect=linha.getBoundingClientRect();
      const visivel=linhaRect.bottom>scrollRect.top+30&&linhaRect.top<scrollRect.bottom;
      const y=Math.round(linhaRect.top-shellRect.top+(linhaRect.height/2));
      setPonteLedger(atual=>atual.y===y&&atual.visivel===visivel?atual:{y,visivel});
    });
  },[dossieCompacto,item?.id]);

  useEffect(()=>{
    const scroller=ledgerScrollRef.current;
    atualizarPonteLedger();
    scroller?.addEventListener("scroll",atualizarPonteLedger,{passive:true});
    window.addEventListener("resize",atualizarPonteLedger);
    return()=>{
      scroller?.removeEventListener("scroll",atualizarPonteLedger);
      window.removeEventListener("resize",atualizarPonteLedger);
      window.cancelAnimationFrame(bridgeFrameRef.current);
    };
  },[atualizarPonteLedger,carregando,idsExibidos]);

  useEffect(()=>{
    if(pagina>paginas)setPagina(paginas);
  },[pagina,paginas]);

  useEffect(()=>{
    const ids=idsExibidos?idsExibidos.split("|"):[];
    setFocoLedgerId(atual=>ids.includes(String(atual))?atual:primeiroExibido);
  },[idsExibidos,primeiroExibido]);

  useEffect(()=>{
    if(!item||filtrados.some(registro=>String(registro.id)===String(item.id)))return;
    controleDetalhe.invalidar();
    setItem(null);
    setDetalhe(null);
    setDetalheErro("");
    setDetalheCarregando(false);
  },[controleDetalhe,filtrados,item]);

  const kpis=useMemo(()=>dados.itens.filter(i=>!registroExcluido(i)).reduce((a,i)=>{
    const r=i.resumo;
    a.original+=Number(r.valor_original||0);
    a.negociado+=Number(r.valor_negociado||0);
    a.pago+=Number(r.total_pago||0);
    a.saldo+=Number(r.saldo_restante||0);
    if(r.situacao==="quitada")a.quitadas++;
    else a.abertas++;
    if(r.situacao==="vencida")a.vencidas++;
    return a;
  },{abertas:0,original:0,negociado:0,pago:0,saldo:0,vencidas:0,quitadas:0}),[dados.itens]);

  const recuperacao=kpis.original?Math.min(100,(kpis.pago/kpis.original)*100):0;
  const filtrosAtivos=Object.entries(filtros).filter(([campo,valor])=>Boolean(valor)&&!(campo==="cadastro"&&valor==="ativos")).length;
  const totalContextos=(busca?1:0)+(fila!=="all"?1:0)+filtrosAtivos;

  const limparFiltros=()=>{
    const devolverFoco=maisFiltros;
    setBusca("");
    setFila("all");
    setFiltros({...FILTROS_VAZIOS});
    setFiltrosRascunho({...FILTROS_VAZIOS});
    setOrdenacao("operacional");
    setOrdenacaoRascunho("operacional");
    setPagina(1);
    setMaisFiltros(false);
    if(devolverFoco)window.requestAnimationFrame(()=>filtroGatilhoRef.current?.focus());
  };

  const removerFiltro=campo=>{
    const valor=campo==="cadastro"?"ativos":"";
    const proximos={...filtros,[campo]:valor};
    setFiltros(proximos);
    setFiltrosRascunho({...filtrosRascunho,[campo]:valor});
    if(campo==="cadastro"&&fila==="excluidas")setFila("all");
    setPagina(1);
  };

  const selecionarFila=id=>{
    setFila(id);
    if(id==="excluidas"){
      setFiltros(atual=>({...atual,cadastro:"excluidos"}));
      setFiltrosRascunho(atual=>({...atual,cadastro:"excluidos"}));
    }else if(fila==="excluidas"){
      setFiltros(atual=>({...atual,cadastro:"ativos"}));
      setFiltrosRascunho(atual=>({...atual,cadastro:"ativos"}));
    }
    setPagina(1);
  };

  const aplicarFiltros=()=>{
    const proximos={...filtrosRascunho};
    setFiltros(proximos);
    setOrdenacao(ordenacaoRascunho);
    if(proximos.cadastro==="excluidos")setFila("excluidas");
    else if(fila==="excluidas")setFila("all");
    setPagina(1);
    setMaisFiltros(false);
    window.requestAnimationFrame(()=>filtroGatilhoRef.current?.focus());
  };

  const fecharFiltros=()=>{
    setMaisFiltros(false);
    setFiltrosRascunho({...filtros});
    setOrdenacaoRascunho(ordenacao);
    window.requestAnimationFrame(()=>filtroGatilhoRef.current?.focus());
  };

  const selecionarResultado=registro=>{
    setBuscaFocada(false);
    setFocoLedgerId(registro.id);
    void abrirDetalhe(registro,buscaRef.current);
    window.requestAnimationFrame(()=>rowRefs.current.get(registro.id)?.scrollIntoView({block:"nearest"}));
  };

  const teclaComando=event=>{
    if(event.key==="Escape"){setBuscaFocada(false);return;}
    if(!["ArrowDown","ArrowUp","Enter"].includes(event.key)||!resultadosComando.length)return;
    event.preventDefault();
    if(event.key==="ArrowDown")setIndiceBusca(indice=>Math.min(resultadosComando.length-1,indice+1));
    else if(event.key==="ArrowUp")setIndiceBusca(indice=>Math.max(0,indice-1));
    else selecionarResultado(resultadosComando[indiceBusca]||resultadosComando[0]);
  };

  const teclaLedger=(event,registro,indice)=>{
    if(event.key==="Enter"||event.key===" "){
      event.preventDefault();
      void abrirDetalhe(registro,event.currentTarget);
      return;
    }
    if(!["ArrowDown","ArrowUp","Home","End","PageDown","PageUp"].includes(event.key))return;
    event.preventDefault();
    const salto=Math.max(1,Math.floor((event.currentTarget.parentElement?.clientHeight||600)/76));
    const proximo=event.key==="Home"?0:event.key==="End"?exibidos.length-1:event.key==="ArrowDown"?Math.min(exibidos.length-1,indice+1):event.key==="ArrowUp"?Math.max(0,indice-1):event.key==="PageDown"?Math.min(exibidos.length-1,indice+salto):Math.max(0,indice-salto);
    const proximoId=exibidos[proximo]?.id;
    setFocoLedgerId(proximoId);
    rowRefs.current.get(proximoId)?.focus();
  };

  const statusVisual=registro=>{
    const excluido=registroExcluido(registro);
    return {chave:excluido?"excluida":registro.resumo.situacao,rotulo:excluido?"Excluído administrativamente":situacaoApresentacao(registro.resumo.situacao)};
  };

  const chips=[
    busca?{id:"busca",rotulo:`Busca · “${busca}”`,limpar:()=>setBusca("")}:null,
    fila!=="all"?{id:"fila",rotulo:`Fila · ${filaAtual.rotulo}`,limpar:()=>selecionarFila("all")}:null,
    filtros.situacao?{id:"situacao",rotulo:`Situação · ${situacaoApresentacao(filtros.situacao)}`,limpar:()=>removerFiltro("situacao")}:null,
    filtros.modalidade?{id:"modalidade",rotulo:`Modalidade · ${dados.modalidades.find(m=>String(m.id)===String(filtros.modalidade))?.nome||filtros.modalidade}`,limpar:()=>removerFiltro("modalidade")}:null,
    filtros.gerente?{id:"gerente",rotulo:`Gerente · ${filtros.gerente}`,limpar:()=>removerFiltro("gerente")}:null,
    filtros.forma?{id:"forma",rotulo:`Pagamento · ${filtros.forma==="vista"?"à vista":"parcelado"}`,limpar:()=>removerFiltro("forma")}:null,
    filtros.marcador?{id:"marcador",rotulo:`Marcador · ${filtros.marcador}`,limpar:()=>removerFiltro("marcador")}:null,
    filtros.periodo?{id:"periodo",rotulo:`Registro · ${filtros.periodo}`,limpar:()=>removerFiltro("periodo")}:null,
    filtros.cadastro!=="ativos"?{id:"cadastro",rotulo:`Cadastros · ${filtros.cadastro||"todos"}`,limpar:()=>removerFiltro("cadastro")}:null,
  ].filter(Boolean);

  if(!permissao.acessar)return <div className="dev-page dev-command-flow"><Estado tipo="erro">O módulo Devedores exige um perfil real autorizado.</Estado></div>;

  const detalheConfirmado=Boolean(confirmacao?.sincronizada&&confirmacao?.id&&item&&String(confirmacao.id)===String(item.id));

  return <div className="dev-page dev-command-flow">
    <aside aria-label="Contexto e exposição da carteira" className="dev-cf-rail">
      <div className="dev-cf-rail-brand"><span aria-hidden="true"><i/><i/><i/><i/></span><div><strong>Stock-On</strong><small>Comando de recebíveis</small></div>{onAbrirMenu&&<button aria-controls="stock-on-primary-navigation" aria-expanded={menuAberto} aria-label="Abrir navegação principal do Stock-On" onClick={onAbrirMenu} type="button"><IconeFluxo nome="menu" size={16}/></button>}</div>
      <section aria-label="Exposição ativa" className="dev-cf-exposure">
        <div><span><i aria-hidden="true"/>Exposição ativa</span><small>{kpis.abertas} abertas</small></div>
        <strong>{moeda(kpis.saldo)}</strong>
        <p><span>Recuperado</span><b>{recuperacao.toLocaleString("pt-BR",{maximumFractionDigits:1})}%</b></p>
        <div aria-label={`${recuperacao.toLocaleString("pt-BR",{maximumFractionDigits:1})}% recuperado`} className="dev-cf-meter"><i style={{"--dev-cf-meter":recuperacao/100}}/></div>
        <dl><div><dt>Original</dt><dd>{moeda(kpis.original)}</dd></div><div><dt>Negociado</dt><dd>{moeda(kpis.negociado)}</dd></div><div><dt>Recebido</dt><dd>{moeda(kpis.pago)}</dd></div></dl>
      </section>
      <nav aria-label="Filas por necessidade operacional" className="dev-cf-queues" style={{"--dev-cf-queue-index":Math.max(0,filasDisponiveis.findIndex(opcao=>opcao.id===fila))}}>
        <p>Fluxo operacional</p>
        {filasDisponiveis.map(opcao=><button aria-label={`${opcao.rotulo}, ${contagensFilas[opcao.id]||0} registros. ${opcao.descricao}`} aria-pressed={fila===opcao.id} className={fila===opcao.id?"is-active":""} key={opcao.id} onClick={()=>selecionarFila(opcao.id)} type="button"><span><IconeFluxo nome={opcao.icone}/></span><span><strong>{opcao.rotulo}</strong><small>{opcao.descricao}</small></span><b key={`${opcao.id}-${contagensFilas[opcao.id]||0}`}>{contagensFilas[opcao.id]||0}</b></button>)}
      </nav>
      <div className="dev-cf-rail-footer">
        {permissao.cadastrar&&<button className="dev-cf-register" onClick={()=>setAcao("novo")} type="button"><IconeFluxo nome="plus" size={17}/> Cadastrar devedor</button>}
        <span><i aria-hidden="true"/>{perfilAtual.perfil}</span>
        <small>{permissao.somenteLeitura?"Carteira em modo somente leitura":"Ações condicionadas ao perfil real"}</small>
      </div>
    </aside>

    <section aria-label="Carteira de recebíveis" className="dev-cf-stage">
      <header className="dev-cf-command-bar">
        {onAbrirMenu&&<button aria-controls="stock-on-primary-navigation" aria-expanded={menuAberto} aria-label="Abrir menu principal" className="dev-cf-menu" onClick={onAbrirMenu} type="button"><IconeFluxo nome="menu"/></button>}
        <div className="dev-cf-title"><span>Carteira de recebíveis</span><h1>Cobrança em fluxo</h1></div>
        <div className={`dev-cf-command${buscaFocada?" is-open":""}`} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setBuscaFocada(false);}} ref={commandRef}>
          <div className="dev-cf-search"><IconeFluxo nome="search" size={20}/><input aria-activedescendant={buscaFocada&&resultadosComando.length?`dev-cf-option-${indiceBusca}`:undefined} aria-autocomplete="list" aria-controls="dev-cf-results" aria-expanded={buscaFocada} aria-keyshortcuts="/" aria-label="Buscar por nome, fantasia, telefone, cidade ou gerente" onChange={event=>setBusca(event.target.value)} onFocus={()=>setBuscaFocada(true)} onKeyDown={teclaComando} placeholder="Buscar por nome, fantasia, telefone, cidade ou gerente" ref={buscaRef} role="combobox" type="search" value={busca}/><kbd>/</kbd></div>
          <div aria-label="Resultados da busca operacional" className="dev-cf-results" id="dev-cf-results" role="listbox"><header><span>{busca?"Resultados na carteira":"Prioridades derivadas"}</span><small>↑↓ navegar · Enter abrir</small></header>{resultadosComando.length?resultadosComando.map((registro,indice)=>{const contexto=contextoDoRegistro(registro,permissao);return <button aria-selected={indiceBusca===indice} className={indiceBusca===indice?"is-active":""} id={`dev-cf-option-${indice}`} key={registro.id} onClick={()=>selecionarResultado(registro)} onMouseEnter={()=>setIndiceBusca(indice)} role="option" tabIndex={-1} type="button"><span><strong>{registro.relatorio.nome_fantasia||registro.relatorio.nome}</strong><small>{contexto.rotulo} · {registro.relatorio.gerente_nome_snapshot}</small></span><b>{moeda(registro.resumo.saldo_restante)}</b><IconeFluxo nome="arrow" size={15}/></button>}):<div className="dev-cf-no-result"><strong>Nenhum devedor encontrado.</strong><span>Ajuste a busca ou limpe os filtros para recuperar a carteira.</span></div>}</div>
        </div>
        <button aria-controls="dev-cf-filter-panel" aria-expanded={maisFiltros} aria-label={totalContextos?`Abrir filtros, ${totalContextos} contextos ativos`:"Abrir filtros"} className={`dev-cf-filter-launch${totalContextos?" has-active":""}`} onClick={()=>{if(!maisFiltros){setFiltrosRascunho({...filtros});setOrdenacaoRascunho(ordenacao);}setMaisFiltros(aberto=>!aberto);}} ref={filtroGatilhoRef} type="button"><IconeFluxo nome="filter"/><span>Filtros</span>{totalContextos?<b>{totalContextos}</b>:null}</button>
        <div aria-atomic="true" aria-live="polite" className="dev-cf-state" role="status"><span><i aria-hidden="true"/>{carregando?"Carregando":"Carteira carregada"}</span><strong>{filtrados.length}</strong><small>visíveis</small></div>
      </header>

      <section aria-label="Contexto e filtros ativos" className={`dev-cf-context-strip${!chips.length?" is-idle":""}`}>
        <div><IconeFluxo nome={filaAtual.icone} size={16}/><span>{filaAtual.rotulo}</span><b>{filtrados.length}</b></div>
        <div className="dev-cf-chips">{chips.length?chips.map(chip=><button className="dev-cf-chip" key={chip.id} onClick={chip.limpar} type="button">{chip.rotulo}<IconeFluxo nome="close" size={13}/></button>):<span>Ordenação por necessidade operacional</span>}</div>
        {chips.length?<button className="dev-cf-clear" onClick={limparFiltros} type="button">Limpar tudo</button>:null}
      </section>

      <nav aria-label="Filas operacionais no celular" className="dev-cf-mobile-queues">{filasDisponiveis.map(opcao=><button aria-pressed={fila===opcao.id} className={fila===opcao.id?"is-active":""} key={opcao.id} onClick={()=>selecionarFila(opcao.id)} type="button"><IconeFluxo nome={opcao.icone} size={16}/><span>{opcao.rotulo}</span><b>{contagensFilas[opcao.id]||0}</b></button>)}</nav>

      <section aria-label="Resumo financeiro da carteira" className="dev-cf-mobile-exposure"><span>Exposição <strong>{moeda(kpis.saldo)}</strong></span><span>Negociado <b>{moeda(kpis.negociado)}</b></span><span>Recuperado <b>{recuperacao.toLocaleString("pt-BR",{maximumFractionDigits:1})}%</b></span></section>

      <button aria-hidden={!maisFiltros} aria-label="Fechar filtros" className={`dev-cf-filter-scrim${maisFiltros?" is-open":""}`} onClick={fecharFiltros} tabIndex={maisFiltros?0:-1} type="button"/>
      <aside aria-hidden={!maisFiltros} aria-labelledby="dev-cf-filter-title" aria-modal={filtroCompacto?"true":undefined} className={`dev-cf-filter-panel${maisFiltros?" is-open":""}`} id="dev-cf-filter-panel" inert={!maisFiltros?true:undefined} onKeyDown={event=>{if(event.key==="Escape"){event.preventDefault();fecharFiltros();}else if(filtroCompacto)limitarFoco(event,filtrosRef.current);}} ref={filtrosRef} role="dialog">
        <header><div><span>Refinar operação</span><h2 id="dev-cf-filter-title">Filtros da carteira</h2></div><button aria-label="Fechar filtros" onClick={fecharFiltros} ref={filtroFecharRef} type="button"><IconeFluxo nome="close"/></button></header>
        <div className="dev-cf-filter-scroll">
          <fieldset><legend>Situação financeira</legend><select aria-label="Situação financeira" value={filtrosRascunho.situacao} onChange={event=>setFiltrosRascunho(atual=>({...atual,situacao:event.target.value}))}><option value="">Todas as situações</option>{["aberta","negociada","parcialmente_paga","vencida","quitada"].map(s=><option key={s} value={s}>{situacaoApresentacao(s)}</option>)}</select></fieldset>
          <fieldset><legend>Modalidade</legend><select aria-label="Modalidade" value={filtrosRascunho.modalidade} onChange={event=>setFiltrosRascunho(atual=>({...atual,modalidade:event.target.value}))}><option value="">Todas as modalidades</option>{dados.modalidades.map(m=><option key={m.id} value={m.id}>{m.nome}</option>)}</select></fieldset>
          <fieldset><legend>Gerente responsável</legend><select aria-label="Gerente responsável" value={filtrosRascunho.gerente} onChange={event=>setFiltrosRascunho(atual=>({...atual,gerente:event.target.value}))}><option value="">Todos os gerentes</option>{gerentes.map(g=><option key={g}>{g}</option>)}</select></fieldset>
          <fieldset><legend>Forma de pagamento</legend><select aria-label="Forma de pagamento" value={filtrosRascunho.forma} onChange={event=>setFiltrosRascunho(atual=>({...atual,forma:event.target.value}))}><option value="">À vista ou parcelada</option><option value="vista">À vista</option><option value="parcelada">Parcelada</option></select></fieldset>
          <fieldset><legend>Marcador</legend><select aria-label="Marcador" value={filtrosRascunho.marcador} onChange={event=>setFiltrosRascunho(atual=>({...atual,marcador:event.target.value}))}><option value="">Todos os registros</option><option value="vencidas">Somente vencidas</option><option value="quitadas">Somente quitadas</option></select></fieldset>
          <fieldset><legend>Mês de registro</legend><input aria-label="Mês de registro" type="month" value={filtrosRascunho.periodo} onChange={event=>setFiltrosRascunho(atual=>({...atual,periodo:event.target.value}))}/></fieldset>
          {permissao.excluirAdministrativamente&&<fieldset><legend>Cadastros</legend><select aria-label="Cadastros" value={filtrosRascunho.cadastro} onChange={event=>setFiltrosRascunho(atual=>({...atual,cadastro:event.target.value}))}><option value="ativos">Operacionais</option><option value="excluidos">Excluídos</option><option value="todos">Todos</option></select></fieldset>}
          <fieldset><legend>Ordenar por</legend><select aria-label="Ordenar por" value={ordenacaoRascunho} onChange={event=>setOrdenacaoRascunho(event.target.value)}><option value="operacional">Necessidade operacional</option><option value="atualizado">Mais recentes</option><option value="nome">Nome</option><option value="saldo">Maior saldo</option></select></fieldset>
        </div>
        <footer><button className="btn-secundario" disabled={!totalContextos&&!rascunhoAlterado} onClick={limparFiltros} type="button">Limpar filtros</button><button className="btn-primario" onClick={aplicarFiltros} type="button">Ver {totalRascunho} {totalRascunho===1?"registro":"registros"}<IconeFluxo nome="arrow" size={15}/></button></footer>
      </aside>

      {erro&&<div className="dev-cf-stage-feedback"><Estado tipo="erro" acao={<button className="btn-secundario" onClick={carregar}>Tentar novamente</button>}>{erro}</Estado></div>}
      {dados.limiteAtingido&&<div className="dev-cf-stage-feedback"><Estado tipo="aviso">A consulta atingiu o limite seguro de 1.000 registros. Refine os filtros.</Estado></div>}

      <div className="dev-cf-workspace">
        <section aria-label="Lista financeira" className="dev-cf-ledger-shell" ref={ledgerShellRef}>
          <header className="dev-cf-ledger-caption"><div><span>Fila priorizada</span><strong>{filaAtual.rotulo}</strong></div><p><b>{filtrados.length}</b> {filtrados.length===1?"registro pronto":"registros prontos"} para decisão</p><span><IconeFluxo nome="portfolio" size={14}/> Página {pagina}/{paginas}</span></header>
          <span aria-hidden="true" className={`dev-cf-ledger-position${ponteLedger.visivel?" is-visible":""}${detalheConfirmado?" is-confirmed":""}`} style={{"--dev-cf-ledger-y":`${ponteLedger.y}px`}}><i/></span>
          <div className="dev-cf-ledger-scroll" ref={ledgerScrollRef}>
            <div aria-hidden="true" className="dev-cf-ledger-head"><span>Conta</span><span>Financeiro</span><span>Necessidade · próxima ação</span><span>Progressão</span></div>
            {carregando?<div aria-label="Carregando devedores..." className="dev-cf-ledger-skeleton" role="status">{Array.from({length:7},(_,indice)=><div key={indice}><i/><i/><i/><i/></div>)}</div>:exibidos.length?<div aria-label="Contas priorizadas" className="dev-cf-ledger" role="listbox">{exibidos.map((registro,indice)=>{
              const status=statusVisual(registro),contexto=contextoDoRegistro(registro,permissao),selecionado=String(item?.id)===String(registro.id),confirmado=Boolean(confirmacao?.sincronizada&&String(confirmacao?.id)===String(registro.id));
              return <div aria-label={`${registro.relatorio.nome_fantasia||registro.relatorio.nome}, saldo ${moeda(registro.resumo.saldo_restante)}, ${contexto.rotulo}`} aria-selected={selecionado} className={`dev-cf-row dev-cf-row-${contexto.tom}${selecionado?" is-selected":""}${confirmado?" is-confirmed":""}`} key={registro.id} onClick={event=>{setFocoLedgerId(registro.id);void abrirDetalhe(registro,event.currentTarget);}} onFocus={()=>setFocoLedgerId(registro.id)} onKeyDown={event=>teclaLedger(event,registro,indice)} ref={no=>{if(no)rowRefs.current.set(registro.id,no);else rowRefs.current.delete(registro.id);}} role="option" tabIndex={String(focoLedgerId)===String(registro.id)?0:-1}>
                <span className="dev-cf-account-cell"><strong>{registro.relatorio.nome_fantasia||registro.relatorio.nome}</strong><small>{registro.relatorio.nome} · {registro.relatorio.cidade}/{registro.relatorio.estado}</small><em className={`dev-financial-status dev-financial-status-${status.chave}`}>{status.rotulo}</em></span>
                <span className="dev-cf-balance-cell"><strong>{moeda(registro.resumo.saldo_restante)}</strong><small>Original {moeda(registro.resumo.valor_original)} · pago {moeda(registro.resumo.total_pago)}</small></span>
                <span className="dev-cf-need-cell"><b>{contexto.rotulo}</b><strong>{contexto.acao}</strong><small>{registro.modalidade_nome_snapshot} · {registro.relatorio.gerente_nome_snapshot}</small></span>
                <span className="dev-cf-track-cell"><TrilhoFluxo confirmado={confirmado} registro={registro}/></span>
                <span aria-hidden="true" className="dev-cf-row-open"><IconeFluxo nome="arrow" size={14}/></span>
              </div>;
            })}</div>:<div className="dev-cf-empty"><span>Nenhum devedor encontrado para os filtros informados.</span><p>Ajuste os critérios de busca ou limpe os filtros para consultar toda a carteira.</p><button className="btn-secundario" onClick={limparFiltros} type="button">Limpar filtros</button></div>}
          </div>
          <Pagination className="dev-paginacao dev-cf-pagination" page={pagina} totalPages={paginas} totalItems={filtrados.length} summary={`Página ${pagina} de ${paginas} · ${filtrados.length} registro(s)`} onPageChange={setPagina}/>
        </section>

        {!dossieCompacto&&<DossieDesktop key={item?.id||"dossie-vazio"} item={item} detalhe={detalhe} permissao={permissao} carregando={detalheCarregando} erro={detalheErro} confirmado={detalheConfirmado} onRecarregar={()=>abrirDetalhe(item)} onAcao={(nome,pagamento)=>{setPagamentoEstorno(pagamento||null);setAcao(nome);}}/>}
      </div>
    </section>

    {permissao.cadastrar&&<button aria-label="Cadastrar devedor" className="dev-cf-mobile-register" onClick={()=>setAcao("novo")} type="button"><IconeFluxo nome="plus" size={17}/><span>Cadastrar devedor</span></button>}

    {dossieCompacto&&item&&<Detalhe item={item} detalhe={detalhe} permissao={permissao} carregando={detalheCarregando} erro={detalheErro} confirmado={detalheConfirmado} onFechar={fecharDetalhe} onRecarregar={()=>abrirDetalhe(item)} onAcao={(nome,pagamento)=>{setPagamentoEstorno(pagamento||null);setAcao(nome);}}/>}

    {acao==="novo"&&<CadastroForm modalidades={dados.modalidades} onCancelar={()=>setAcao(null)} onConcluir={concluirNovo}/>}
    {acao==="cadastro"&&<CadastroForm item={item} modalidades={dados.modalidades} admin={perfilAtual.perfil==="administrador"} onCancelar={()=>setAcao(null)} onConcluir={()=>concluirAcao("cadastro")}/>}
    {acao==="negociar"&&<NegociacaoForm item={item} detalhe={detalhe} modo="criar" onCancelar={()=>setAcao(null)} onConcluir={()=>concluirAcao("negociar")}/>}
    {acao==="substituir"&&<NegociacaoForm item={item} detalhe={detalhe} modo="substituir" onCancelar={()=>setAcao(null)} onConcluir={()=>concluirAcao("substituir")}/>}
    {acao==="corrigir-negociacao"&&<NegociacaoForm item={item} detalhe={detalhe} modo="corrigir" onCancelar={()=>setAcao(null)} onConcluir={()=>concluirAcao("corrigir-negociacao")}/>}
    {acao==="pagar"&&<PagamentoForm item={item} detalhe={detalhe} onCancelar={()=>setAcao(null)} onConcluir={()=>concluirAcao("pagar")}/>}
    {acao==="estornar"&&<EstornoForm pagamento={pagamentoEstorno} negociacao={detalhe.negociacoes.find(n=>n.situacao==="ativa")||detalhe.negociacoes[0]} onCancelar={()=>setAcao(null)} onConcluir={()=>concluirAcao("estornar")}/>}
    {acao==="excluir"&&<ExclusaoForm item={item} onCancelar={()=>setAcao(null)} onConcluir={()=>concluirAcao("excluir")}/>}

    <div aria-atomic="true" aria-live="polite" className={`dev-cf-toast${confirmacao?" is-visible":""}${confirmacao&&!confirmacao.sincronizada?" is-warning":""}`} role="status"><span aria-hidden="true"><IconeFluxo nome={confirmacao?.sincronizada?"check":"clock"} size={15}/></span>{confirmacao?.mensagem}</div>
  </div>;
}
