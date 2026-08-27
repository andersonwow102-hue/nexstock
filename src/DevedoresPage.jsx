import { useEffect, useMemo, useRef, useState } from "react";
import * as api from "./devedoresApi.js";
import {
  centavosDeEntrada, criarChaveIdempotencia, criarControleRequisicoes, formatarDataCivil,
  formatarMoedaBR, hojeEmSaoPaulo, mensagemErroDevedores,
  permissoesDevedores, preverParcelas, situacaoApresentacao,
} from "./devedoresUtils.js";
import {
  ActionBar,
  Button,
  DataTable,
  EmptyState,
  FeedbackBanner,
  Field,
  FilterBar,
  FloatingActionSafeArea,
  KpiCard,
  KpiGrid,
  MobileRecordCard,
  Modal as OperationsModal,
  PageIntro,
  Pagination,
  SelectField,
  Skeleton,
  StatusBadge,
} from "./components/operations/OperationsUI.jsx";
import "./DevedoresPage.css";

const POR_PAGINA = 20;
const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
const moeda = valor => formatarMoedaBR(valor);
const limpo = valor => String(valor || "").trim();
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

function Detalhe({ item, detalhe, permissao, carregando, erro, onFechar, onRecarregar, onAcao }) {
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
      <section className="dev-dossie-trilho dev-progresso" aria-label={`Progresso da dívida: ${percentual.toLocaleString("pt-BR")}%`}><header><div><span>Trilho de liquidação</span><b>{totalParcelas?`${parcelasQuitadas} de ${totalParcelas} parcelas quitadas`:`${percentual.toLocaleString("pt-BR")}% concluído`}</b></div><strong>{percentual.toLocaleString("pt-BR")}%</strong></header><div className="dev-progresso-trilha" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={percentual}><span style={{width:`${percentual}%`}}/></div>{totalParcelas>0&&<div className="dev-progresso-etapas" aria-hidden="true">{detalhe.parcelas.map(p=>{const quitada=Number(p.saldo)<=0||["paga","quitada"].includes(p.situacao);return <span key={p.id} className={quitada?"concluida":""}>{p.numero}</span>})}</div>}</section>
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

export default function DevedoresPage({ perfilAtual }) {
  const permissao=permissoesDevedores(perfilAtual?.perfil,perfilAtual?.perfilReal===true);
  const controleDetalhe=useRef(criarControleRequisicoes()).current;
  const filtrosVazios={situacao:"",modalidade:"",gerente:"",forma:"",marcador:"",periodo:"",cadastro:"ativos"};
  const [dados,setDados]=useState({itens:[],modalidades:[],limiteAtingido:false}),[carregando,setCarregando]=useState(true),[erro,setErro]=useState(""),[busca,setBusca]=useState(""),[filtros,setFiltros]=useState(filtrosVazios),[filtrosRascunho,setFiltrosRascunho]=useState(filtrosVazios),[maisFiltros,setMaisFiltros]=useState(false),[resumoExpandido,setResumoExpandido]=useState(false),[ordenacao,setOrdenacao]=useState("atualizado"),[pagina,setPagina]=useState(1),[item,setItem]=useState(null),[detalhe,setDetalhe]=useState(null),[detalheErro,setDetalheErro]=useState(""),[detalheCarregando,setDetalheCarregando]=useState(false),[acao,setAcao]=useState(null),[pagamentoEstorno,setPagamentoEstorno]=useState(null);
  const carregar=async()=>{setCarregando(true);setErro("");try{const resultado=await api.carregarDevedores();setDados(resultado);return resultado;}catch(e){setErro(mensagemErroDevedores(e));return null;}finally{setCarregando(false);}};
  useEffect(()=>{if(permissao.acessar)carregar();else setCarregando(false);},[permissao.acessar]);
  const abrirDetalhe=async(alvo=item)=>{if(!alvo)return;const requisicao=controleDetalhe.iniciar();setItem(alvo);setDetalheCarregando(true);setDetalheErro("");try{const resultado=await api.carregarDetalheDevedor(alvo.id);if(controleDetalhe.vigente(requisicao))setDetalhe(resultado);}catch(e){if(controleDetalhe.vigente(requisicao))setDetalheErro(mensagemErroDevedores(e));}finally{if(controleDetalhe.vigente(requisicao))setDetalheCarregando(false);}};
  const concluirAcao=async()=>{setAcao(null);setPagamentoEstorno(null);const atualizados=await carregar();const atualizado=atualizados?.itens.find(registro=>String(registro.id)===String(item?.id));if(atualizado)await abrirDetalhe(atualizado);};
  const gerentes=useMemo(()=>[...new Set(dados.itens.map(i=>i.relatorio.gerente_nome_snapshot).filter(Boolean))].sort(),[dados.itens]);
  const normalizarBusca=valor=>String(valor||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-BR");
  const filtrados=useMemo(()=>{const termo=normalizarBusca(busca);return dados.itens.filter(i=>{const r=i.relatorio,s=i.resumo,excluido=Boolean(r.excluido_em),alvo=normalizarBusca([r.nome,r.nome_fantasia,r.telefone,r.cidade,r.gerente_nome_snapshot].join(" "));return !(filtros.cadastro==="ativos"&&excluido)&&!(filtros.cadastro==="excluidos"&&!excluido)&&!(termo&&!alvo.includes(termo))&&!(filtros.situacao&&s.situacao!==filtros.situacao)&&!(filtros.modalidade&&String(i.modalidade_id)!==filtros.modalidade)&&!(filtros.gerente&&r.gerente_nome_snapshot!==filtros.gerente)&&!(filtros.forma&&s.forma_pagamento!==filtros.forma)&&!(filtros.marcador==="vencidas"&&s.situacao!=="vencida")&&!(filtros.marcador==="quitadas"&&s.situacao!=="quitada")&&!(filtros.periodo&&!String(i.data_registro).startsWith(filtros.periodo));}).sort((a,b)=>ordenacao==="nome"?a.relatorio.nome.localeCompare(b.relatorio.nome,"pt-BR"):ordenacao==="saldo"?Number(b.resumo.saldo_restante)-Number(a.resumo.saldo_restante):String(b.atualizado_em).localeCompare(String(a.atualizado_em)));},[dados.itens,busca,filtros,ordenacao]);
  useEffect(()=>setPagina(1),[busca,filtros,ordenacao]); const paginas=Math.max(1,Math.ceil(filtrados.length/POR_PAGINA)),exibidos=filtrados.slice((pagina-1)*POR_PAGINA,pagina*POR_PAGINA);
  const kpis=useMemo(()=>dados.itens.filter(i=>!i.relatorio.excluido_em).reduce((a,i)=>{const r=i.resumo;a.original+=Number(r.valor_original||0);a.negociado+=Number(r.valor_negociado||0);a.pago+=Number(r.total_pago||0);a.saldo+=Number(r.saldo_restante||0);if(r.situacao==="quitada")a.quitadas++;else a.abertas++;if(r.situacao==="vencida")a.vencidas++;return a;},{abertas:0,original:0,negociado:0,pago:0,saldo:0,vencidas:0,quitadas:0}),[dados.itens]);
  const filtrosAtivos=Object.entries(filtros).filter(([campo,valor])=>Boolean(valor)&&!(campo==="cadastro"&&valor==="ativos")).length;
  const limparFiltros=()=>{setBusca("");setFiltros(filtrosVazios);setFiltrosRascunho(filtrosVazios);setPagina(1);};
  const removerFiltro=campo=>{const proximos={...filtros,[campo]:""};setFiltros(proximos);setFiltrosRascunho(proximos);setPagina(1);};
  const statusVisual=registro=>{const excluido=Boolean(registro.relatorio.excluido_em);return { chave:excluido?"excluida":registro.resumo.situacao, rotulo:excluido?"Excluído administrativamente":situacaoApresentacao(registro.resumo.situacao) };};
  const colunasTabela=[
    {id:"devedor",header:"Devedor",width:"27%",render:i=><div className="dev-identidade"><b>{i.relatorio.nome_fantasia||i.relatorio.nome}</b><small>{i.relatorio.nome} · {i.relatorio.cidade}/{i.relatorio.estado}</small></div>},
    {id:"gerente",header:"Gerente",render:i=>i.relatorio.gerente_nome_snapshot},
    {id:"modalidade",header:"Modalidade",render:i=>i.modalidade_nome_snapshot},
    {id:"situacao",header:"Situação",render:i=>{const status=statusVisual(i);return <StatusBadge status={status.chave} className={`dev-situacao dev-situacao-${status.chave}`}>{status.rotulo}</StatusBadge>;}},
    {id:"original",header:"Original",numeric:true,align:"right",render:i=>moeda(i.resumo.valor_original)},
    {id:"pago",header:"Pago",numeric:true,align:"right",render:i=>moeda(i.resumo.total_pago)},
    {id:"saldo",header:"Saldo",numeric:true,align:"right",render:i=><b>{moeda(i.resumo.saldo_restante)}</b>},
    {id:"acoes",header:<span className="so-visually-hidden">Ações</span>,align:"right",width:"104px",render:i=><Button variant="secondary" size="sm" className="btn-secundario" leadingIcon="eye" onClick={()=>abrirDetalhe(i)}>Abrir</Button>},
  ];
  if(!permissao.acessar)return <Estado tipo="erro">O módulo Devedores exige um perfil real autorizado.</Estado>;
  return <div className="dev-page operations-theme">
    <PageIntro
      className="dev-hero dev-hero-compacto"
      eyebrow="Carteira de recebíveis"
      description="Acompanhe saldos, acordos e recebimentos em uma única fila operacional."
      ariaLabel="Visão geral da carteira de devedores"
      actions={<>{permissao.somenteLeitura&&<StatusBadge tone="neutral" dot={false} className="dev-readonly">Somente leitura</StatusBadge>}{permissao.cadastrar&&<Button variant="primary" className="btn-primario" leadingIcon="plus" onClick={()=>setAcao("novo")}>Cadastrar devedor</Button>}</>}
    />
    {erro&&<Estado tipo="erro" acao={<button className="btn-secundario" onClick={carregar}>Tentar novamente</button>}>{erro}</Estado>}
    <div className={`dev-kpi-shell ${resumoExpandido?"dev-kpis-expandido":""}`}>
      {carregando?<Skeleton variant="kpi" lines={7} label="Carregando indicadores..." className="dev-kpi-skeleton"/>:<><KpiGrid className="dev-kpis dev-kpis-v2" ariaLabel="Resumo de devedores">
        <KpiCard className="dev-kpi-saldo dev-kpi-principal dev-kpi-saldo-dominante" label="Saldo atual" value={moeda(kpis.saldo)} helper={`${kpis.abertas} em aberto`} emphasis/>
        <KpiCard className="dev-kpi-pago dev-kpi-principal dev-kpi-pago-forte" label="Total pago" value={moeda(kpis.pago)} helper={`${kpis.quitadas} quitadas`} tone="success"/>
        <div className="dev-kpi-cluster" role="presentation">
          <KpiCard className="dev-kpi-aberto dev-kpi-principal" label="Em aberto" value={kpis.abertas} tone="info"/>
          <KpiCard className="dev-kpi-vencido dev-kpi-principal" label="Vencidas" value={kpis.vencidas} tone="danger"/>
          <KpiCard className="dev-kpi-quitado dev-kpi-principal" label="Quitadas" value={kpis.quitadas} tone="success"/>
        </div>
        <div className="dev-kpi-rodape" role="presentation">
          <KpiCard className="dev-kpi-secundario" label="Total original" value={moeda(kpis.original)}/>
          <KpiCard className="dev-kpi-secundario" label="Total negociado" value={moeda(kpis.negociado)}/>
        </div>
      </KpiGrid>
      <Button variant="secondary" size="sm" className="dev-kpis-toggle btn-secundario" onClick={()=>setResumoExpandido(v=>!v)}>{resumoExpandido?"Ocultar indicadores":"Ver indicadores"}</Button></>}
    </div>
    <FilterBar
      className="dev-filtros"
      description="Refine a carteira sem perder o contexto da operação."
      activeCount={filtrosAtivos}
      secondaryLabel="Mais filtros"
      applyLabel="Aplicar filtros"
      secondaryOpen={maisFiltros}
      onSecondaryToggle={setMaisFiltros}
      onClear={(busca||filtrosAtivos>0)?limparFiltros:undefined}
      onApply={()=>{setFiltros({...filtrosRascunho,situacao:filtros.situacao});setPagina(1);setMaisFiltros(false);}}
      primary={<div className="dev-filtros-essenciais"><Field label="Busca" className="dev-filtro-busca"><input inputMode="search" placeholder="Buscar por nome, fantasia, telefone, cidade ou gerente" value={busca} onChange={e=>setBusca(e.target.value)}/></Field><SelectField label="Situação" value={filtros.situacao} onChange={e=>{const valor=e.target.value;setFiltros({...filtros,situacao:valor});setFiltrosRascunho({...filtrosRascunho,situacao:valor});}}><option value="">Todas as situações</option>{["aberta","negociada","parcialmente_paga","vencida","quitada"].map(s=><option key={s} value={s}>{situacaoApresentacao(s)}</option>)}</SelectField></div>}
      secondary={<div className="dev-filtros-grid">
        <SelectField label="Modalidade" value={filtrosRascunho.modalidade} onChange={e=>setFiltrosRascunho({...filtrosRascunho,modalidade:e.target.value})}><option value="">Todas as modalidades</option>{dados.modalidades.map(m=><option key={m.id} value={m.id}>{m.nome}</option>)}</SelectField>
        <SelectField label="Gerente responsável" value={filtrosRascunho.gerente} onChange={e=>setFiltrosRascunho({...filtrosRascunho,gerente:e.target.value})}><option value="">Todos os gerentes</option>{gerentes.map(g=><option key={g}>{g}</option>)}</SelectField>
        <SelectField label="Forma de pagamento" value={filtrosRascunho.forma} onChange={e=>setFiltrosRascunho({...filtrosRascunho,forma:e.target.value})}><option value="">À vista ou parcelada</option><option value="vista">À vista</option><option value="parcelada">Parcelada</option></SelectField>
        <SelectField label="Marcador" value={filtrosRascunho.marcador} onChange={e=>setFiltrosRascunho({...filtrosRascunho,marcador:e.target.value})}><option value="">Todos os registros</option><option value="vencidas">Somente vencidas</option><option value="quitadas">Somente quitadas</option></SelectField>
        <Field label="Mês de registro"><input type="month" value={filtrosRascunho.periodo} onChange={e=>setFiltrosRascunho({...filtrosRascunho,periodo:e.target.value})}/></Field>
        {permissao.excluirAdministrativamente&&<SelectField label="Cadastros" value={filtrosRascunho.cadastro} onChange={e=>setFiltrosRascunho({...filtrosRascunho,cadastro:e.target.value})}><option value="ativos">Operacionais</option><option value="excluidos">Excluídos</option><option value="todos">Todos</option></SelectField>}
        <SelectField label="Ordenar por" value={ordenacao} onChange={e=>setOrdenacao(e.target.value)}><option value="atualizado">Mais recentes</option><option value="nome">Nome</option><option value="saldo">Maior saldo</option></SelectField>
      </div>}
      chips={filtrosAtivos>0?<div className="dev-filtros-ativos">{Object.entries(filtros).filter(([campo,valor])=>valor&&!(campo==="cadastro"&&valor==="ativos")).map(([campo,valor])=><button type="button" key={campo} onClick={()=>removerFiltro(campo)} aria-label={`Remover filtro ${campo}`}>{campo}: {valor}<span aria-hidden="true">×</span></button>)}</div>:null}
    />
    {dados.limiteAtingido&&<Estado tipo="aviso">A consulta atingiu o limite seguro de 1.000 registros. Refine os filtros.</Estado>}
    {carregando?<Skeleton variant="ledger" lines={5} label="Carregando devedores..." className="dev-page-skeleton"/>:!exibidos.length?<EmptyState className="dev-estado dev-estado-vazio" title="Nenhum devedor encontrado para os filtros informados." description="Ajuste os critérios de busca ou limpe os filtros para consultar toda a carteira." action={(busca||filtrosAtivos>0)?<Button variant="secondary" onClick={limparFiltros}>Limpar filtros</Button>:null}/>:<>
      <DataTable className="dev-tabela-wrap" tableClassName="dev-tabela" columns={colunasTabela} rows={exibidos} getRowKey={i=>i.id} caption="Carteira de devedores"/>
      <div className="dev-cards">{exibidos.map(i=>{const status=statusVisual(i),excluido=status.chave==="excluida",quitada=i.resumo.situacao==="quitada",tone=excluido||status.chave==="vencida"?"danger":quitada?"success":status.chave==="parcialmente_paga"?"warning":"info";return <MobileRecordCard key={i.id} className={`${excluido?"dev-card-excluido":quitada?"dev-card-quitado":"dev-card-pendente"} dev-card-${status.chave}`} tone={tone} title={i.relatorio.nome_fantasia||i.relatorio.nome} subtitle={`${i.modalidade_nome_snapshot} · Gerente ${i.relatorio.gerente_nome_snapshot}`} badge={<StatusBadge status={status.chave} className={`dev-situacao dev-situacao-${status.chave}`}>{status.rotulo}</StatusBadge>} highlightLabel={excluido?"Histórico preservado":quitada?"Dívida quitada":"Saldo pendente"} highlightValue={moeda(i.resumo.saldo_restante)} details={[{label:"Valor original",value:moeda(i.resumo.valor_original),numeric:true},{label:"Valor pago",value:moeda(i.resumo.total_pago),numeric:true}]} onOpen={()=>abrirDetalhe(i)} openLabel={`Abrir detalhes de ${i.relatorio.nome_fantasia||i.relatorio.nome}`} actions={<Button variant="secondary" size="sm" className="btn-secundario" leadingIcon="eye" onClick={()=>abrirDetalhe(i)}>Ver detalhes</Button>}/>})}</div>
    </>}
    <Pagination className="dev-paginacao" page={pagina} totalPages={paginas} totalItems={filtrados.length} summary={`Página ${pagina} de ${paginas} · ${filtrados.length} registro(s)`} onPageChange={setPagina}/>
    {item&&<Detalhe item={item} detalhe={detalhe} permissao={permissao} carregando={detalheCarregando} erro={detalheErro} onFechar={()=>{controleDetalhe.invalidar();setItem(null);setDetalhe(null);setDetalheErro("");setDetalheCarregando(false);}} onRecarregar={()=>abrirDetalhe(item)} onAcao={(nome,pagamento)=>{setPagamentoEstorno(pagamento||null);setAcao(nome);}}/>}
    {acao==="novo"&&<CadastroForm modalidades={dados.modalidades} onCancelar={()=>setAcao(null)} onConcluir={async()=>{setAcao(null);await carregar();}}/>}{acao==="cadastro"&&<CadastroForm item={item} modalidades={dados.modalidades} admin={perfilAtual.perfil==="administrador"} onCancelar={()=>setAcao(null)} onConcluir={concluirAcao}/>} {acao==="negociar"&&<NegociacaoForm item={item} detalhe={detalhe} modo="criar" onCancelar={()=>setAcao(null)} onConcluir={concluirAcao}/>} {acao==="substituir"&&<NegociacaoForm item={item} detalhe={detalhe} modo="substituir" onCancelar={()=>setAcao(null)} onConcluir={concluirAcao}/>} {acao==="corrigir-negociacao"&&<NegociacaoForm item={item} detalhe={detalhe} modo="corrigir" onCancelar={()=>setAcao(null)} onConcluir={concluirAcao}/>} {acao==="pagar"&&<PagamentoForm item={item} detalhe={detalhe} onCancelar={()=>setAcao(null)} onConcluir={concluirAcao}/>} {acao==="estornar"&&<EstornoForm pagamento={pagamentoEstorno} negociacao={detalhe.negociacoes.find(n=>n.situacao==="ativa")||detalhe.negociacoes[0]} onCancelar={()=>setAcao(null)} onConcluir={concluirAcao}/>} {acao==="excluir"&&<ExclusaoForm item={item} onCancelar={()=>setAcao(null)} onConcluir={concluirAcao}/>}
  </div>;
}
