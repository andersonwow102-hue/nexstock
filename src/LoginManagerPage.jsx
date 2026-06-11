import { useEffect, useMemo, useState } from "react";
import { gerenciarLogins } from "./db.js";
import { GERENTES } from "./pointsData.js";

const perfisDisponiveis = [
  { valor: "administrador", label: "Administrador" },
  { valor: "operador", label: "Operador" },
  { valor: "gerente", label: "Gerente" },
  { valor: "consulta", label: "Apenas consulta" },
];

function formatarData(data) {
  if (!data) return "Nunca acessou";
  return new Date(data).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function diasRestantes(data) {
  if (!data) return "";
  const diff = new Date(data).getTime() - Date.now();
  if (diff <= 0) return "vencido";
  const dias = Math.ceil(diff / 86400000);
  return `${dias} dia${dias !== 1 ? "s" : ""}`;
}

function gerarEmailTemporario(perfil, gerenteNome) {
  const base = perfil === "gerente" && gerenteNome ? gerenteNome : perfil || "usuario";
  const limpo = base.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "usuario";
  const codigo = Math.random().toString(36).slice(2, 8);
  return `${limpo}-${Date.now().toString(36)}-${codigo}@temporario.stockon.app`;
}

function gerarLoginSugerido(perfil, gerenteNome, email = "") {
  const base = perfil === "gerente" && gerenteNome ? gerenteNome : email.split("@")[0] || perfil || "usuario";
  return base.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
}

function senhaAleatoria() {
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const numeros = "23456789";
  const simbolos = "@#$%";
  const base = `${letras}${numeros}${simbolos}`;
  let senha = "";
  for (let i = 0; i < 12; i += 1) senha += base[Math.floor(Math.random() * base.length)];
  return `${senha}${numeros[Math.floor(Math.random() * numeros.length)]}${simbolos[Math.floor(Math.random() * simbolos.length)]}`;
}

function historicoDoUsuario(usuario, historico, historicoPontos) {
  const termos = [usuario.email, usuario.nome].filter(Boolean).map(t => t.toLowerCase());
  if (termos.length === 0) return [];
  const eventosEquip = historico
    .filter(h => termos.some(t => [h.responsavel, h.observacao, h.itemNome].some(campo => (campo || "").toLowerCase().includes(t))))
    .map(h => ({ id: `e-${h.id}`, tipo: "Equipamento", acao: h.tipo, detalhe: `${h.itemNome || "Equipamento"} · ${h.observacao || "Sem detalhe"}`, data: h.data }));
  const eventosPonto = historicoPontos
    .filter(h => termos.some(t => [h.gerente, h.observacao, h.nome].some(campo => (campo || "").toLowerCase().includes(t))))
    .map(h => ({ id: `p-${h.id}`, tipo: "Ponto", acao: h.tipo, detalhe: `${h.nome || "Ponto"} · ${h.observacao || "Sem detalhe"}`, data: h.data }));
  return [...eventosEquip, ...eventosPonto].slice(0, 12);
}

export default function LoginManagerPage({ perfilAtual, historico = [], historicoPontos = [], onPerfilAtualChange }) {
  const [usuarios, setUsuarios] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [usuarioSelecionado, setUsuarioSelecionado] = useState(null);
  const [modalSenha, setModalSenha] = useState(null);
  const [formSenha, setFormSenha] = useState({ email: "", loginNome: "", senha: "", confirmar: "" });
  const [modalNovo, setModalNovo] = useState(false);
  const [formNovo, setFormNovo] = useState({ email: "", loginNome: "", perfil: "consulta", gerenteNome: "", senha: "", confirmar: "", emailTemporario: false });
  const administrador = perfilAtual?.perfil === "administrador";

  async function carregar() {
    if (!administrador) return;
    setCarregando(true);
    setErro("");
    try {
      const resposta = await gerenciarLogins({ action: "listar" });
      setUsuarios(resposta.usuarios || []);
    } catch (e) {
      setErro(`Não foi possível carregar os logins: ${e.message}`);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); }, [administrador]);

  const usuariosFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return usuarios;
    return usuarios.filter(u => [u.email, u.nome, u.loginNome, u.perfil, u.gerenteNome, u.status].some(campo => (campo || "").toLowerCase().includes(q)));
  }, [usuarios, busca]);

  async function alterarPerfil(usuario, perfil, gerenteNome = usuario.gerenteNome || "") {
    try {
      const gerenteFinal = perfil === "gerente" ? gerenteNome : "";
      const resposta = await gerenciarLogins({ action: "perfil", userId: usuario.userId, perfil, gerenteNome: gerenteFinal });
      setUsuarios(prev => prev.map(u => u.userId === usuario.userId ? { ...u, perfil, gerenteNome: gerenteFinal } : u));
      if (usuario.userId === perfilAtual.userId) onPerfilAtualChange?.({ ...perfilAtual, perfil, gerenteNome: gerenteFinal });
      setMensagem(resposta.mensagem || "Perfil atualizado.");
    } catch (e) {
      setErro(`Não foi possível alterar o perfil: ${e.message}`);
    }
  }

  async function alternarBloqueio(usuario) {
    const bloquear = !usuario.bloqueado;
    if (usuario.userId === perfilAtual.userId && bloquear) {
      setErro("Você não pode bloquear o próprio administrador logado.");
      return;
    }
    const texto = bloquear ? "bloquear" : "desbloquear";
    if (!window.confirm(`Deseja ${texto} o acesso de ${usuario.email}?`)) return;
    try {
      const resposta = await gerenciarLogins({ action: bloquear ? "bloquear" : "desbloquear", userId: usuario.userId });
      setMensagem(resposta.mensagem || `Usuário ${bloquear ? "bloqueado" : "desbloqueado"}.`);
      await carregar();
    } catch (e) {
      setErro(`Não foi possível ${texto}: ${e.message}`);
    }
  }

  function abrirSenha(usuario, gerar = false) {
    const senha = gerar ? senhaAleatoria() : "";
    setModalSenha(usuario);
    setFormSenha({ email: usuario.email || "", loginNome: usuario.loginNome || "", senha, confirmar: senha });
    setErro("");
  }

  function abrirNovoLogin() {
    const senha = senhaAleatoria();
    setFormNovo({ email: "", loginNome: "", perfil: "consulta", gerenteNome: "", senha, confirmar: senha, emailTemporario: false });
    setErro("");
    setModalNovo(true);
  }

  function alternarEmailTemporario() {
    setFormNovo(prev => {
      const emailTemporario = !prev.emailTemporario;
      return {
        ...prev,
        emailTemporario,
        email: emailTemporario ? gerarEmailTemporario(prev.perfil, prev.gerenteNome) : "",
        loginNome: emailTemporario ? (prev.loginNome || gerarLoginSugerido(prev.perfil, prev.gerenteNome, prev.email)) : prev.loginNome,
      };
    });
  }

  async function criarLogin(e) {
    e.preventDefault();
    const email = formNovo.email.trim().toLowerCase();
    const loginNome = formNovo.loginNome.trim().toLowerCase();
    if (!email || !email.includes("@") || !email.includes(".")) { setErro("Informe um e-mail verdadeiro para o novo login."); return; }
    if (!/^[a-z0-9._-]{3,30}$/.test(loginNome)) { setErro("Informe um login simples com 3 a 30 caracteres. Use letras, números, ponto, traço ou underline."); return; }
    if (!formNovo.emailTemporario && /@(nexstock|stockon)\.com$/i.test(email)) { setErro("Use um e-mail real, como Gmail ou Outlook, para permitir recuperação de senha."); return; }
    if (formNovo.perfil === "gerente" && !formNovo.gerenteNome) { setErro("Selecione qual gerente este login representa."); return; }
    if (formNovo.senha.length < 8) { setErro("A senha provisória precisa ter pelo menos 8 caracteres."); return; }
    if (formNovo.senha !== formNovo.confirmar) { setErro("A confirmação da senha está diferente."); return; }
    try {
      const resposta = await gerenciarLogins({
        action: "criar",
        email,
        loginNome,
        senha: formNovo.senha,
        perfil: formNovo.perfil,
        gerenteNome: formNovo.perfil === "gerente" ? formNovo.gerenteNome : "",
        emailTemporario: formNovo.emailTemporario,
      });
      setMensagem(resposta.mensagem || "Novo login criado.");
      setModalNovo(false);
      await carregar();
    } catch (e) {
      setErro(`Não foi possível criar o login: ${e.message}`);
    }
  }

  async function salvarSenha(e) {
    e.preventDefault();
    const email = formSenha.email.trim().toLowerCase();
    const loginNome = formSenha.loginNome.trim().toLowerCase();
    if (!email || !email.includes("@") || !email.includes(".")) { setErro("Informe um e-mail verdadeiro."); return; }
    if (!/^[a-z0-9._-]{3,30}$/.test(loginNome)) { setErro("Informe um login simples com 3 a 30 caracteres. Use letras, números, ponto, traço ou underline."); return; }
    if (formSenha.senha.length < 8) { setErro("A nova senha precisa ter pelo menos 8 caracteres."); return; }
    if (formSenha.senha !== formSenha.confirmar) { setErro("A confirmação da senha está diferente."); return; }
    try {
      const resposta = await gerenciarLogins({
        action: "redefinir",
        userId: modalSenha.userId,
        novoEmail: email,
        loginNome,
        novaSenha: formSenha.senha,
      });
      setMensagem(resposta.mensagem || "Acesso atualizado.");
      setModalSenha(null);
      await carregar();
    } catch (e) {
      setErro(`Não foi possível atualizar o acesso: ${e.message}`);
    }
  }

  if (!administrador) {
    return (
      <section className="secao login-manager">
        <h2 className="secao-titulo">Gerenciador de Logins</h2>
        <p className="permissao-aviso">Esta área aparece somente para administrador.</p>
      </section>
    );
  }

  return (
    <div className="login-manager">
      <section className="gestao-intro login-manager-hero">
        <div>
          <span className="gestao-kicker">Segurança administrativa</span>
          <h2>Gerenciador de logins</h2>
          <p>Veja usuários criados, altere senha, gere senha provisória, bloqueie acesso e acompanhe sinais de uso.</p>
        </div>
        <span className="perfil-selo perfil-administrador">Somente admin</span>
      </section>

      {(mensagem || erro) && (
        <div className={erro ? "erro-msg" : "gestao-mensagem"}>
          {erro || mensagem}
          <button onClick={() => { setMensagem(""); setErro(""); }}>✕</button>
        </div>
      )}

      <section className="secao login-manager-toolbar">
        <input className="input-busca" placeholder="Buscar por e-mail, nome, perfil ou status..." value={busca} onChange={e => setBusca(e.target.value)} />
        <div className="login-toolbar-actions">
          <button className="btn-secundario" onClick={carregar}>Atualizar lista</button>
          <button className="btn-primario" onClick={abrirNovoLogin}>+ Novo login</button>
        </div>
      </section>

      <section className="login-manager-grid">
        <div className="secao login-users">
          <div className="tabela-header">
            <h2 className="secao-titulo" style={{ margin: 0 }}>Logins cadastrados</h2>
            <span className="badge-cat">{usuariosFiltrados.length} usuário{usuariosFiltrados.length !== 1 ? "s" : ""}</span>
          </div>
          {carregando ? <p className="tabela-vazia">Carregando logins...</p> : usuariosFiltrados.length === 0 ? <p className="tabela-vazia">Nenhum login encontrado.</p> : (
            <div className="login-users-list">
              {usuariosFiltrados.map(usuario => (
                <article key={usuario.userId} className={`login-user-card ${usuarioSelecionado?.userId === usuario.userId ? "ativo" : ""} ${usuario.bloqueado ? "bloqueado" : ""}`}>
                  <button className="login-user-main" onClick={() => setUsuarioSelecionado(usuario)}>
                    <span className="login-avatar">{(usuario.email || "?").slice(0, 1).toUpperCase()}</span>
                    <span>
                      <strong>{usuario.email}</strong>
                      <small>{usuario.bloqueado ? "Bloqueado" : "Ativo"} · Login: {usuario.loginNome || "não definido"} · {usuario.emailTemporario ? `E-mail temporário: ${diasRestantes(usuario.emailTemporarioExpiraEm)} · ` : ""}{usuario.perfil === "gerente" && usuario.gerenteNome ? `Gerente: ${usuario.gerenteNome} · ` : ""}Último acesso: {formatarData(usuario.ultimoAcesso)}</small>
                    </span>
                  </button>
                  <div className="login-user-actions">
                    <select value={usuario.perfil} onChange={e => alterarPerfil(usuario, e.target.value)}>
                      {perfisDisponiveis.map(p => <option key={p.valor} value={p.valor}>{p.label}</option>)}
                    </select>
                    {usuario.perfil === "gerente" && (
                      <select value={usuario.gerenteNome || ""} onChange={e => alterarPerfil(usuario, "gerente", e.target.value)}>
                        <option value="">Vincular gerente...</option>
                        {GERENTES.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    )}
                    <button className="btn-secundario" onClick={() => abrirSenha(usuario)}>Editar acesso</button>
                    <button className="btn-secundario" onClick={() => abrirSenha(usuario, true)}>Gerar senha</button>
                    <button className={usuario.bloqueado ? "btn-secundario" : "btn-danger-outline"} onClick={() => alternarBloqueio(usuario)}>
                      {usuario.bloqueado ? "Desbloquear" : "Bloquear"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <aside className="secao login-detail">
          {!usuarioSelecionado ? (
            <div className="hist-vazio">
              <div className="hist-vazio-icone">🔐</div>
              <div>Selecione um login para ver detalhes.</div>
            </div>
          ) : (
            <>
              <div className="login-detail-header">
                <h2>{usuarioSelecionado.email}</h2>
                <span className={`perfil-selo perfil-${usuarioSelecionado.perfil}`}>{usuarioSelecionado.perfil}</span>
              </div>
              <div className="login-stats">
                <article><small>Status</small><strong>{usuarioSelecionado.bloqueado ? "Bloqueado" : "Ativo"}</strong></article>
                <article><small>Login de entrada</small><strong>{usuarioSelecionado.loginNome || "Não definido"}</strong></article>
                <article><small>Gerente vinculado</small><strong>{usuarioSelecionado.perfil === "gerente" ? usuarioSelecionado.gerenteNome || "Não vinculado" : "Não se aplica"}</strong></article>
                <article><small>E-mail temporário</small><strong>{usuarioSelecionado.emailTemporario ? `Sim · ${diasRestantes(usuarioSelecionado.emailTemporarioExpiraEm)}` : "Não"}</strong></article>
                <article><small>Criado em</small><strong>{formatarData(usuarioSelecionado.criadoEm)}</strong></article>
                <article><small>Último acesso</small><strong>{formatarData(usuarioSelecionado.ultimoAcesso)}</strong></article>
              </div>
              <h3 className="login-subtitle">Histórico do login</h3>
              <div className="login-history">
                <div className="login-history-item">
                  <strong>Login cadastrado</strong>
                  <span>{formatarData(usuarioSelecionado.criadoEm)}</span>
                </div>
                {usuarioSelecionado.ultimoAcesso && (
                  <div className="login-history-item">
                    <strong>Último acesso registrado pelo Supabase</strong>
                    <span>{formatarData(usuarioSelecionado.ultimoAcesso)}</span>
                  </div>
                )}
                {historicoDoUsuario(usuarioSelecionado, historico, historicoPontos).map(evento => (
                  <div key={evento.id} className="login-history-item">
                    <strong>{evento.tipo} · {evento.acao}</strong>
                    <span>{evento.detalhe}</span>
                    <small>{evento.data}</small>
                  </div>
                ))}
                <p className="acessos-nota">As ações aparecem aqui quando ficam registradas no histórico operacional do sistema. O Supabase também informa criação, bloqueio e último acesso.</p>
              </div>
            </>
          )}
        </aside>
      </section>

      {modalSenha && (
        <div className="modal-overlay" onClick={() => setModalSenha(null)}>
          <div className="modal modal-pequeno" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>Editar acesso</h3><button className="modal-fechar" onClick={() => setModalSenha(null)}>✕</button></div>
            <form onSubmit={salvarSenha}>
              <div className="modal-body">
                <p className="senha-texto">Usuário: <strong>{modalSenha.email}</strong>. Como administrador, você pode trocar o e-mail e definir uma nova senha.</p>
                {erro && <div className="erro-msg">⚠️ {erro}</div>}
                <div className="campo"><label>Login de entrada *</label><input type="text" value={formSenha.loginNome} onChange={e => setFormSenha({ ...formSenha, loginNome: e.target.value.toLowerCase() })} /></div>
                <div className="campo"><label>E-mail de login *</label><input type="email" value={formSenha.email} onChange={e => setFormSenha({ ...formSenha, email: e.target.value })} /></div>
                <div className="campo"><label>Nova senha *</label><input type="text" value={formSenha.senha} onChange={e => setFormSenha({ ...formSenha, senha: e.target.value })} /></div>
                <div className="campo"><label>Confirmar senha *</label><input type="text" value={formSenha.confirmar} onChange={e => setFormSenha({ ...formSenha, confirmar: e.target.value })} /></div>
                <button type="button" className="btn-secundario" onClick={() => {
                  const senha = senhaAleatoria();
                  setFormSenha(prev => ({ ...prev, senha, confirmar: senha }));
                }}>Gerar outra senha provisória</button>
              </div>
              <div className="modal-footer"><button type="button" className="btn-secundario" onClick={() => setModalSenha(null)}>Cancelar</button><button type="submit" className="btn-primario">Salvar acesso</button></div>
            </form>
          </div>
        </div>
      )}

      {modalNovo && (
        <div className="modal-overlay" onClick={() => setModalNovo(false)}>
          <div className="modal modal-pequeno" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>Novo login</h3><button className="modal-fechar" onClick={() => setModalNovo(false)}>✕</button></div>
            <form onSubmit={criarLogin}>
              <div className="modal-body">
                <p className="senha-texto">Crie um acesso novo para sócio ou funcionário. Se ainda não souber o e-mail real, use um temporário por até 3 dias.</p>
                {erro && <div className="erro-msg">⚠️ {erro}</div>}
                <div className="campo">
                  <label>E-mail de login *</label>
                  <input type="email" placeholder="socio@gmail.com" value={formNovo.email} readOnly={formNovo.emailTemporario} onChange={e => setFormNovo(prev => ({ ...prev, email: e.target.value, emailTemporario: false, loginNome: prev.loginNome || gerarLoginSugerido(prev.perfil, prev.gerenteNome, e.target.value) }))} autoFocus />
                </div>
                <div className="campo"><label>Login de entrada *</label><input type="text" placeholder="ex: beu" value={formNovo.loginNome} onChange={e => setFormNovo({ ...formNovo, loginNome: e.target.value.toLowerCase() })} /></div>
                <button type="button" className={`btn-secundario ${formNovo.emailTemporario ? "btn-temp-ativo" : ""}`} onClick={alternarEmailTemporario}>
                  {formNovo.emailTemporario ? "Usando e-mail temporário" : "Criar e-mail temporário"}
                </button>
                {formNovo.emailTemporario && <p className="acessos-nota">Este login fica marcado como temporário e precisa ser atualizado para um e-mail real em até 3 dias.</p>}
                <div className="campo"><label>Perfil *</label><select value={formNovo.perfil} onChange={e => {
                  const perfil = e.target.value;
                  setFormNovo(prev => ({ ...prev, perfil, gerenteNome: perfil === "gerente" ? prev.gerenteNome : "", email: prev.emailTemporario ? gerarEmailTemporario(perfil, prev.gerenteNome) : prev.email, loginNome: prev.loginNome || gerarLoginSugerido(perfil, prev.gerenteNome, prev.email) }));
                }}>
                  {perfisDisponiveis.map(p => <option key={p.valor} value={p.valor}>{p.label}</option>)}
                </select></div>
                {formNovo.perfil === "gerente" && (
                  <div className="campo"><label>Gerente vinculado *</label><select value={formNovo.gerenteNome} onChange={e => {
                    const gerenteNome = e.target.value;
                    setFormNovo(prev => ({ ...prev, gerenteNome, email: prev.emailTemporario ? gerarEmailTemporario(prev.perfil, gerenteNome) : prev.email, loginNome: prev.loginNome || gerarLoginSugerido(prev.perfil, gerenteNome, prev.email) }));
                  }}>
                    <option value="">Selecione o gerente...</option>
                    {GERENTES.map(g => <option key={g} value={g}>{g}</option>)}
                  </select></div>
                )}
                <div className="campo"><label>Senha provisória *</label><input type="text" value={formNovo.senha} onChange={e => setFormNovo({ ...formNovo, senha: e.target.value })} /></div>
                <div className="campo"><label>Confirmar senha *</label><input type="text" value={formNovo.confirmar} onChange={e => setFormNovo({ ...formNovo, confirmar: e.target.value })} /></div>
                <button type="button" className="btn-secundario" onClick={() => {
                  const senha = senhaAleatoria();
                  setFormNovo(prev => ({ ...prev, senha, confirmar: senha }));
                }}>Gerar outra senha provisória</button>
              </div>
              <div className="modal-footer"><button type="button" className="btn-secundario" onClick={() => setModalNovo(false)}>Cancelar</button><button type="submit" className="btn-primario">Criar login</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
