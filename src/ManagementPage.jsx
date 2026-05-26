import { useEffect, useMemo, useState } from "react";
import { formatarReais } from "./pointsData.js";
import {
  carregarDespesasMensais, salvarDespesaMensal, excluirDespesaMensal,
  carregarPerfis, salvarPerfil, redefinirAcessoUsuario,
} from "./db.js";

const competenciaAtual = () => new Date().toISOString().slice(0, 7);
const despesaVazia = () => ({
  id: null, pontoId: "", competencia: `${competenciaAtual()}-01`,
  descricao: "", tipo: "fixa", valorPrevisto: "", valorReal: "", observacao: "",
});

function mesInput(data) {
  return (data || `${competenciaAtual()}-01`).slice(0, 7);
}

function nomePonto(pontos, id) {
  return pontos.find(p => Number(p.id) === Number(id))?.nomeFantasia || "Ponto não encontrado";
}

export default function ManagementPage({ pontos = [], perfilAtual, onPerfilAtualChange }) {
  const [aba, setAba] = useState("despesas");
  const [despesas, setDespesas] = useState([]);
  const [perfis, setPerfis] = useState([]);
  const [competencia, setCompetencia] = useState(competenciaAtual());
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(despesaVazia());
  const [usuarioAcesso, setUsuarioAcesso] = useState(null);
  const [formAcesso, setFormAcesso] = useState({ novoEmail: "", novaSenha: "", confirmacao: "" });
  const [salvandoAcesso, setSalvandoAcesso] = useState(false);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [carregando, setCarregando] = useState(true);
  const podeEditar = perfilAtual?.perfil === "administrador" || perfilAtual?.perfil === "operador";
  const administrador = perfilAtual?.perfil === "administrador";

  async function recarregarDespesas() {
    setDespesas(await carregarDespesasMensais());
  }

  async function recarregarPerfis() {
    if (administrador) setPerfis(await carregarPerfis());
  }

  useEffect(() => {
    async function carregar() {
      setCarregando(true);
      await Promise.all([recarregarDespesas(), recarregarPerfis()]);
      setCarregando(false);
    }
    carregar();
  }, [administrador]);

  const filtradas = useMemo(() => despesas.filter(d => mesInput(d.competencia) === competencia), [despesas, competencia]);
  const previsto = filtradas.reduce((total, d) => total + d.valorPrevisto, 0);
  const realizado = filtradas.reduce((total, d) => total + d.valorReal, 0);
  const alertas = filtradas.filter(d => d.valorPrevisto > 0 && Math.abs(d.valorReal - d.valorPrevisto) > Math.max(20, d.valorPrevisto * 0.1));

  function abrirNovo() {
    setForm({ ...despesaVazia(), competencia: `${competencia}-01` });
    setErro("");
    setModal(true);
  }

  function abrirEdicao(despesa) {
    setForm({ ...despesa });
    setErro("");
    setModal(true);
  }

  async function confirmarDespesa() {
    if (!form.pontoId) { setErro("Selecione o ponto desta despesa."); return; }
    if (!form.descricao.trim()) { setErro("Informe a descrição, por exemplo Internet ou Aluguel."); return; }
    if (Number(form.valorPrevisto) <= 0) { setErro("Informe o valor previsto maior que zero."); return; }
    try {
      await salvarDespesaMensal({ ...form, competencia: `${mesInput(form.competencia)}-01` });
      await recarregarDespesas();
      setModal(false);
      setMensagem("Despesa mensal salva com sucesso.");
    } catch (e) {
      setErro(e.message.includes("duplicate") ? "Já existe esta despesa para esse ponto neste mês." : `Não foi possível salvar: ${e.message}`);
    }
  }

  async function removerDespesa(id) {
    if (!window.confirm("Excluir esta despesa mensal?")) return;
    try {
      await excluirDespesaMensal(id);
      await recarregarDespesas();
      setMensagem("Despesa removida.");
    } catch (e) {
      setMensagem(`Não foi possível excluir: ${e.message}`);
    }
  }

  async function alterarPerfil(item, novoPerfil) {
    try {
      await salvarPerfil({ ...item, perfil: novoPerfil });
      const atualizados = perfis.map(p => p.userId === item.userId ? { ...p, perfil: novoPerfil } : p);
      setPerfis(atualizados);
      if (item.userId === perfilAtual.userId) onPerfilAtualChange?.({ ...perfilAtual, perfil: novoPerfil });
      setMensagem("Permissão atualizada.");
    } catch (e) {
      setMensagem(`Não foi possível alterar a permissão: ${e.message}`);
    }
  }

  function abrirRedefinirAcesso(item) {
    setUsuarioAcesso(item);
    setFormAcesso({ novoEmail: "", novaSenha: "", confirmacao: "" });
    setErro("");
  }

  async function confirmarRedefinicaoAcesso(e) {
    e.preventDefault();
    setErro("");
    const email = formAcesso.novoEmail.trim().toLowerCase();
    if (!email || !email.includes("@") || !email.includes(".")) { setErro("Informe o e-mail verdadeiro que o usuário consegue acessar."); return; }
    if (/@(nexstock|stockon)\.com$/i.test(email)) { setErro("Este domínio é usado apenas como login interno. Informe Gmail, Outlook ou outro e-mail real."); return; }
    if (formAcesso.novaSenha.length < 8) { setErro("A senha provisória precisa ter pelo menos 8 caracteres."); return; }
    if (formAcesso.novaSenha !== formAcesso.confirmacao) { setErro("A confirmação da senha está diferente."); return; }
    try {
      setSalvandoAcesso(true);
      await redefinirAcessoUsuario({ userId: usuarioAcesso.userId, novoEmail: email, novaSenha: formAcesso.novaSenha });
      await recarregarPerfis();
      setUsuarioAcesso(null);
      setMensagem(`Acesso atualizado. O novo login de ${email} já pode ser utilizado.`);
    } catch (e) {
      const indisponivel = e.message.toLowerCase().includes("function") || e.message.toLowerCase().includes("failed to send");
      setErro(indisponivel
        ? "A função segura de redefinição ainda não foi ativada no Supabase."
        : `Não foi possível redefinir o acesso: ${e.message}`);
    } finally {
      setSalvandoAcesso(false);
    }
  }

  return (
    <div className="gestao-page">
      <section className="gestao-intro">
        <div>
          <span className="gestao-kicker">Controle Administrativo</span>
          <h2>Despesas mensais e acessos</h2>
          <p>Registre custos fixos, acompanhe desvios e defina quem pode alterar o sistema.</p>
        </div>
        <span className={`perfil-selo perfil-${perfilAtual?.perfil || "consulta"}`}>{perfilAtual?.perfil || "consulta"}</span>
      </section>

      <div className="gestao-abas">
        <button className={aba === "despesas" ? "ativo" : ""} onClick={() => setAba("despesas")}>💰 Despesas Mensais</button>
        <button className={aba === "acessos" ? "ativo" : ""} onClick={() => setAba("acessos")}>🔐 Usuários & Permissões</button>
      </div>

      {mensagem && <div className="gestao-mensagem">{mensagem}<button onClick={() => setMensagem("")}>✕</button></div>}

      {aba === "despesas" && (
        <>
          <section className="gestao-toolbar">
            <div className="campo gestao-mes">
              <label>Mês analisado</label>
              <input type="month" value={competencia} onChange={e => setCompetencia(e.target.value)} />
            </div>
            {podeEditar && <button className="btn-primario" onClick={abrirNovo}>+ Nova despesa</button>}
          </section>

          <section className="gestao-resumo">
            <article><small>PREVISTO</small><strong>{formatarReais(previsto)}</strong></article>
            <article><small>REALIZADO</small><strong>{formatarReais(realizado)}</strong></article>
            <article className={alertas.length ? "com-alerta" : ""}><small>FORA DO PADRÃO</small><strong>{alertas.length}</strong></article>
          </section>

          {alertas.length > 0 && (
            <section className="despesa-alertas">
              <h3>⚠️ Atenção: despesas fora do padrão esperado</h3>
              {alertas.map(d => (
                <div key={d.id}>
                  <strong>{nomePonto(pontos, d.pontoId)} · {d.descricao}</strong>
                  <span>Previsto {formatarReais(d.valorPrevisto)} · Real {formatarReais(d.valorReal)} · Diferença {formatarReais(d.valorReal - d.valorPrevisto)}</span>
                </div>
              ))}
            </section>
          )}

          <section className="secao gestao-tabela">
            {carregando ? <p className="tabela-vazia">Carregando despesas...</p> : filtradas.length === 0 ? (
              <p className="tabela-vazia">Nenhuma despesa registrada para este mês.</p>
            ) : (
              <div className="tabela-wrapper">
                <table className="tabela">
                  <thead><tr><th>Ponto</th><th>Descrição</th><th>Tipo</th><th>Previsto</th><th>Real</th><th>Diferença</th><th>⚙️</th></tr></thead>
                  <tbody>{filtradas.map(d => {
                    const fora = alertas.some(a => a.id === d.id);
                    return (
                      <tr key={d.id} className={fora ? "row-alerta" : ""}>
                        <td className="td-nome">{nomePonto(pontos, d.pontoId)}</td>
                        <td>{d.descricao}</td>
                        <td><span className="badge-cat">{d.tipo === "fixa" ? "Fixa" : "Variável"}</span></td>
                        <td>{formatarReais(d.valorPrevisto)}</td>
                        <td>{formatarReais(d.valorReal)}</td>
                        <td className={fora ? "valor-alerta" : ""}>{formatarReais(d.valorReal - d.valorPrevisto)}</td>
                        <td className="td-acoes">{podeEditar && <>
                          <button className="btn-editar" onClick={() => abrirEdicao(d)}>✏️</button>
                          <button className="btn-excluir" onClick={() => removerDespesa(d.id)}>🗑️</button>
                        </>}</td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {aba === "acessos" && (
        <section className="secao acessos-painel">
          <h2 className="secao-titulo">Perfis de acesso</h2>
          <div className="acessos-explicacao">
            <strong>Administrador</strong> configura tudo. <strong>Operador</strong> cadastra e movimenta. <strong>Consulta</strong> apenas visualiza e exporta.
          </div>
          {!administrador ? (
            <p className="permissao-aviso">Somente um administrador pode alterar permissões dos usuários.</p>
          ) : (
            <div className="acessos-lista">
              {perfis.map(p => (
                <div className="acesso-item" key={p.userId}>
                  <div><strong>{p.nome}</strong><small>{p.userId === perfilAtual.userId ? "Você" : "Usuário cadastrado"}</small></div>
                  <div className="acesso-controles">
                    <select value={p.perfil} disabled={p.userId === perfilAtual.userId} title={p.userId === perfilAtual.userId ? "Seu próprio perfil permanece administrador para evitar perda de acesso." : ""} onChange={e => alterarPerfil(p, e.target.value)}>
                      <option value="administrador">Administrador</option>
                      <option value="operador">Operador</option>
                      <option value="consulta">Apenas consulta</option>
                    </select>
                    <button className="btn-secundario btn-acesso" onClick={() => abrirRedefinirAcesso(p)}>{p.userId === perfilAtual.userId ? "Regularizar meu e-mail" : "Redefinir acesso"}</button>
                  </div>
                </div>
              ))}
              {perfis.length === 0 && <p className="tabela-vazia">Nenhum usuário encontrado.</p>}
            </div>
          )}
          <p className="acessos-nota">Novos usuários começam como apenas consulta. Para permitir recuperação de senha, use um e-mail real ao criar ou redefinir o acesso. Seu próprio perfil não pode ser rebaixado nesta tela.</p>
        </section>
      )}

      {usuarioAcesso && (
        <div className="modal-overlay" onClick={() => setUsuarioAcesso(null)}>
          <div className="modal modal-pequeno" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>Redefinir Acesso</h3><button className="modal-fechar" onClick={() => setUsuarioAcesso(null)}>✕</button></div>
            <form onSubmit={confirmarRedefinicaoAcesso}>
              <div className="modal-body">
                <p className="senha-texto">Usuário atual: <strong>{usuarioAcesso.nome}</strong>. Troque para um e-mail que realmente receba mensagens e informe uma senha provisória. O e-mail passará a ser o novo login.</p>
                {erro && <div className="erro-msg">⚠️ {erro}</div>}
                <div className="campo"><label>Novo e-mail verdadeiro *</label><input type="email" placeholder="socio@gmail.com" value={formAcesso.novoEmail} onChange={e => setFormAcesso({ ...formAcesso, novoEmail: e.target.value })} autoFocus /></div>
                <div className="campo"><label>Senha provisória *</label><input type="password" placeholder="Mínimo de 8 caracteres" value={formAcesso.novaSenha} onChange={e => setFormAcesso({ ...formAcesso, novaSenha: e.target.value })} /></div>
                <div className="campo"><label>Confirmar senha *</label><input type="password" value={formAcesso.confirmacao} onChange={e => setFormAcesso({ ...formAcesso, confirmacao: e.target.value })} /></div>
              </div>
              <div className="modal-footer"><button type="button" className="btn-secundario" onClick={() => setUsuarioAcesso(null)}>Cancelar</button><button type="submit" className="btn-primario" disabled={salvandoAcesso}>{salvandoAcesso ? "Salvando..." : "Atualizar acesso"}</button></div>
            </form>
          </div>
        </div>
      )}

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal modal-largo" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>{form.id ? "Editar despesa mensal" : "Nova despesa mensal"}</h3><button className="modal-fechar" onClick={() => setModal(false)}>✕</button></div>
            <div className="modal-body">
              {erro && <div className="erro-msg">⚠️ {erro}</div>}
              <div className="campos-duplos">
                <div className="campo"><label>Ponto *</label><select value={form.pontoId} onChange={e => setForm({ ...form, pontoId: e.target.value })}>
                  <option value="">Selecione um ponto...</option>
                  {pontos.map(p => <option key={p.id} value={p.id}>{p.nomeFantasia}</option>)}
                </select></div>
                <div className="campo"><label>Mês *</label><input type="month" value={mesInput(form.competencia)} onChange={e => setForm({ ...form, competencia: `${e.target.value}-01` })} /></div>
              </div>
              <div className="campos-duplos">
                <div className="campo"><label>Descrição *</label><input placeholder="Ex: Internet, aluguel..." value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} /></div>
                <div className="campo"><label>Tipo *</label><select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}><option value="fixa">Fixa</option><option value="variavel">Variável</option></select></div>
              </div>
              <div className="campos-duplos">
                <div className="campo"><label>Valor previsto *</label><input type="number" min="0" step="0.01" value={form.valorPrevisto} onChange={e => setForm({ ...form, valorPrevisto: e.target.value })} /></div>
                <div className="campo"><label>Valor realizado *</label><input type="number" min="0" step="0.01" value={form.valorReal} onChange={e => setForm({ ...form, valorReal: e.target.value })} /></div>
              </div>
              <div className="campo"><label>Observação</label><textarea rows={2} value={form.observacao} onChange={e => setForm({ ...form, observacao: e.target.value })} /></div>
            </div>
            <div className="modal-footer"><button className="btn-secundario" onClick={() => setModal(false)}>Cancelar</button><button className="btn-primario" onClick={confirmarDespesa}>Salvar despesa</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
