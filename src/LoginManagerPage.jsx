import { useEffect, useMemo, useState } from "react";
import { gerenciarLogins } from "./db.js";
import { GERENTES } from "./pointsData.js";
import { FilterBar, Modal, OperationIcon } from "./components/operations/OperationsUI.jsx";
import { useResponsiveSheet } from "./components/operations/useResponsiveSheet.js";
import "./AdminCommandFlow.css";

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
  const maiusculas = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const minusculas = "abcdefghijkmnopqrstuvwxyz";
  const numeros = "23456789";
  const simbolos = "@#$%";
  const base = `${maiusculas}${minusculas}${numeros}${simbolos}`;
  const sortear = conjunto => conjunto[crypto.getRandomValues(new Uint32Array(1))[0] % conjunto.length];
  const caracteres = [sortear(maiusculas), sortear(minusculas), sortear(numeros), sortear(simbolos)];
  while (caracteres.length < 16) caracteres.push(sortear(base));
  for (let i = caracteres.length - 1; i > 0; i -= 1) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [caracteres[i], caracteres[j]] = [caracteres[j], caracteres[i]];
  }
  return caracteres.join("");
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
  const [filtroPerfil, setFiltroPerfil] = useState("todos");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [dossieAberto, setDossieAberto] = useState(false);
  const [usuarioSelecionado, setUsuarioSelecionado] = useState(null);
  const [modalSenha, setModalSenha] = useState(null);
  const [formSenha, setFormSenha] = useState({ email: "", loginNome: "", senha: "", confirmar: "" });
  const [modalNovo, setModalNovo] = useState(false);
  const [formNovo, setFormNovo] = useState({ email: "", loginNome: "", perfil: "consulta", gerenteNome: "", senha: "", confirmar: "", emailTemporario: false });
  const [senhaEdicaoVisivel, setSenhaEdicaoVisivel] = useState(false);
  const [senhaNovoVisivel, setSenhaNovoVisivel] = useState(false);
  const [feedbackCredencial, setFeedbackCredencial] = useState(null);
  const administrador = perfilAtual?.perfil === "administrador";
  const { panelProps: dossieProps, backdropProps: dossieBackdropProps } = useResponsiveSheet({
    open: dossieAberto,
    onClose: () => setDossieAberto(false),
  });

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
    return usuarios
      .filter(usuario => filtroPerfil === "todos" || usuario.perfil === filtroPerfil)
      .filter(usuario => {
        if (filtroEstado === "ativos") return !usuario.bloqueado;
        if (filtroEstado === "bloqueados") return usuario.bloqueado;
        if (filtroEstado === "temporarios") return usuario.emailTemporario;
        return true;
      })
      .filter(u => !q || [u.email, u.nome, u.loginNome, u.perfil, u.gerenteNome, u.status].some(campo => (campo || "").toLowerCase().includes(q)));
  }, [usuarios, busca, filtroEstado, filtroPerfil]);

  useEffect(() => {
    if (!usuarios.length) {
      setUsuarioSelecionado(null);
      return;
    }
    setUsuarioSelecionado(atual => usuarios.find(usuario => usuario.userId === atual?.userId) || usuarios[0]);
  }, [usuarios]);

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
    setDossieAberto(false);
    setModalSenha(usuario);
    setFormSenha({ email: usuario.email || "", loginNome: usuario.loginNome || "", senha, confirmar: senha });
    setSenhaEdicaoVisivel(false);
    setFeedbackCredencial(null);
    setErro("");
  }

  function abrirNovoLogin() {
    const senha = senhaAleatoria();
    setDossieAberto(false);
    setFormNovo({ email: "", loginNome: "", perfil: "consulta", gerenteNome: "", senha, confirmar: senha, emailTemporario: false });
    setSenhaNovoVisivel(false);
    setFeedbackCredencial(null);
    setErro("");
    setModalNovo(true);
  }

  function fecharModalSenha() {
    setModalSenha(null);
    setSenhaEdicaoVisivel(false);
    setFeedbackCredencial(null);
  }

  function fecharModalNovo() {
    setModalNovo(false);
    setSenhaNovoVisivel(false);
    setFeedbackCredencial(null);
  }

  async function copiarSenhaCredencial(senha) {
    if (!senha) {
      setFeedbackCredencial({ tipo: "erro", texto: "Informe ou gere uma senha antes de copiar." });
      return;
    }
    try {
      await navigator.clipboard.writeText(senha);
      setFeedbackCredencial({ tipo: "sucesso", texto: "Senha copiada. O valor não será exibido nesta mensagem." });
    } catch {
      setFeedbackCredencial({ tipo: "erro", texto: "Não foi possível copiar a senha neste navegador." });
    }
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
    if (formNovo.perfil === "gerente" && !formNovo.gerenteNome) { setErro("Selecione qual gerente este login representa."); return; }
    if (formNovo.senha.length < 10) { setErro("A senha provisória precisa ter pelo menos 10 caracteres."); return; }
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
      fecharModalNovo();
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
    if (formSenha.senha.length < 10) { setErro("A nova senha precisa ter pelo menos 10 caracteres."); return; }
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
      fecharModalSenha();
      await carregar();
    } catch (e) {
      setErro(`Não foi possível atualizar o acesso: ${e.message}`);
    }
  }

  const totalAtivos = usuarios.filter(usuario => !usuario.bloqueado).length;
  const totalBloqueados = usuarios.filter(usuario => usuario.bloqueado).length;
  const totalTemporarios = usuarios.filter(usuario => usuario.emailTemporario).length;
  const filtrosAtivos = Number(filtroPerfil !== "todos") + Number(filtroEstado !== "todos");

  if (!administrador) {
    return (
      <section className="login-manager admin-command-flow admin-cf-state admin-cf-state--denied">
        <OperationIcon name="lock" size={24} />
        <h2>Gerenciador de logins</h2>
        <p>Esta área aparece somente para administrador.</p>
      </section>
    );
  }

  return (
    <div className="login-manager admin-command-flow admin-command-flow--logins">
      <header className="admin-cf-page-bar" aria-label="Resumo e ações de Gerenciar Logins">
        <div className="admin-cf-inline-counts" aria-label="Resumo dos logins">
          <span><strong>{usuarios.length}</strong> identidades</span>
          <span><strong>{totalAtivos}</strong> ativos</span>
          <span><strong>{totalBloqueados}</strong> bloqueados</span>
          <span><strong>{totalTemporarios}</strong> temporários</span>
          <span className="admin-cf-session-chip"><OperationIcon name="lock" size={13} />Admin</span>
        </div>
        <div className="admin-cf-head-actions">
          <button className="btn-secundario" onClick={carregar}><OperationIcon name="refresh" size={16} />Atualizar</button>
          <button className="btn-primario" onClick={abrirNovoLogin}><OperationIcon name="plus" size={16} />Novo login</button>
        </div>
      </header>

      {(mensagem || erro) && (
        <div className={`admin-cf-feedback ${erro ? "admin-cf-feedback--error" : ""}`} role={erro ? "alert" : "status"}>
          <OperationIcon name={erro ? "warning" : "check"} size={18} />
          <span>{erro || mensagem}</span>
          <button type="button" onClick={() => { setMensagem(""); setErro(""); }} aria-label="Fechar mensagem"><OperationIcon name="close" size={16} /></button>
        </div>
      )}

      <FilterBar
        className="admin-cf-filter-bar"
        ariaLabel="Busca e filtros do diretório de logins"
        activeCount={filtrosAtivos}
        secondaryOpen={filtrosAbertos}
        onSecondaryToggle={setFiltrosAbertos}
        secondaryLabel="Filtros"
        onClear={() => { setFiltroPerfil("todos"); setFiltroEstado("todos"); }}
        onApply={() => setFiltrosAbertos(false)}
        primary={(
          <label className="admin-cf-search-field">
            <span className="admin-cf-visually-hidden">Buscar logins</span>
            <OperationIcon name="search" size={17} />
            <input className="input-busca" type="search" placeholder="Buscar e-mail, login, nome ou gerente" value={busca} onChange={e => setBusca(e.target.value)} />
          </label>
        )}
        secondary={(
          <>
            <label className="admin-cf-filter-field">
              <span>Perfil</span>
              <select value={filtroPerfil} onChange={e => setFiltroPerfil(e.target.value)}>
                <option value="todos">Todos os perfis</option>
                {perfisDisponiveis.map(perfil => <option key={perfil.valor} value={perfil.valor}>{perfil.label}</option>)}
              </select>
            </label>
            <label className="admin-cf-filter-field">
              <span>Estado</span>
              <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
                <option value="todos">Todos os estados</option>
                <option value="ativos">Ativos</option>
                <option value="bloqueados">Bloqueados</option>
                <option value="temporarios">E-mail temporário</option>
              </select>
            </label>
          </>
        )}
        chips={filtrosAtivos ? (
          <>
            {filtroPerfil !== "todos" && <button type="button" className="admin-cf-filter-chip" onClick={() => setFiltroPerfil("todos")}>Perfil: {perfisDisponiveis.find(perfil => perfil.valor === filtroPerfil)?.label} <OperationIcon name="close" size={12} /></button>}
            {filtroEstado !== "todos" && <button type="button" className="admin-cf-filter-chip" onClick={() => setFiltroEstado("todos")}>Estado: {{ ativos: "Ativos", bloqueados: "Bloqueados", temporarios: "Temporários" }[filtroEstado]} <OperationIcon name="close" size={12} /></button>}
          </>
        ) : null}
      />

      <section className="login-manager-grid admin-cf-master-detail">
        <div className="login-users admin-cf-panel admin-cf-directory" aria-labelledby="login-directory-title">
          <header className="admin-cf-panel-head admin-cf-directory-head">
            <div><span className="admin-cf-section-code">Identidades</span><h3 id="login-directory-title">Logins cadastrados</h3></div>
            <span className="admin-cf-compact-count">{usuariosFiltrados.length} registro{usuariosFiltrados.length !== 1 ? "s" : ""}</span>
          </header>
          {carregando ? (
            <div className="admin-cf-loading admin-cf-loading--cards" role="status" aria-label="Carregando logins">{[0, 1, 2, 3].map(item => <span key={item}><i /><i /><i /></span>)}</div>
          ) : usuariosFiltrados.length === 0 ? (
            <div className="admin-cf-state admin-cf-state--compact"><OperationIcon name="search" size={20} /><strong>Nenhum login encontrado</strong><p>Revise a busca ou os filtros.</p></div>
          ) : (
            <div className="login-users-list">
              {usuariosFiltrados.map(usuario => {
                const estadoConta = usuario.bloqueado ? "blocked" : usuario.emailTemporario ? "temporary" : "active";
                const estadoLabel = usuario.bloqueado ? "Bloqueado" : usuario.emailTemporario ? "Temporário" : "Ativo";
                return (
                <article key={usuario.userId} className={`login-user-card ${usuarioSelecionado?.userId === usuario.userId ? "ativo" : ""} ${usuario.bloqueado ? "bloqueado" : ""}`}>
                  <button className="login-user-main" type="button" aria-pressed={usuarioSelecionado?.userId === usuario.userId} onClick={() => { setUsuarioSelecionado(usuario); setDossieAberto(true); }}>
                    <span className="login-avatar">{(usuario.email || "?").slice(0, 1).toUpperCase()}</span>
                    <span className="login-user-copy">
                      <strong>{usuario.nome || usuario.loginNome || usuario.email}</strong>
                      <small>{usuario.loginNome || "login não definido"} · {usuario.email}{usuario.perfil === "gerente" && usuario.gerenteNome ? ` · ${usuario.gerenteNome}` : ""}</small>
                    </span>
                    <span className={`admin-cf-profile admin-cf-profile--${usuario.perfil}`}>{perfisDisponiveis.find(perfil => perfil.valor === usuario.perfil)?.label || usuario.perfil}</span>
                    <span className={`admin-cf-status admin-cf-status--${estadoConta}`}><i />{estadoLabel}</span>
                    <OperationIcon name="arrowRight" size={15} />
                  </button>
                </article>
                );
              })}
            </div>
          )}
        </div>

        <button {...dossieBackdropProps} className={`admin-cf-sheet-backdrop ${dossieAberto ? "is-open" : ""}`} />
        <aside {...dossieProps} className={`login-detail admin-cf-panel admin-cf-dossier ${dossieAberto ? "is-open" : ""}`} aria-label="Dossiê do login selecionado">
          {!usuarioSelecionado ? (
            <div className="admin-cf-state admin-cf-state--dossier">
              <span><OperationIcon name="lock" size={22} /></span>
              <strong>Selecione uma identidade</strong>
              <p>O dossiê lateral mostrará estado, vínculo e referências de atividade.</p>
            </div>
          ) : (
            <>
              <div className="login-detail-header">
                <span className="login-avatar login-detail-avatar">{(usuarioSelecionado.email || "?").slice(0, 1).toUpperCase()}</span>
                <div><span className="admin-cf-section-code">Identidade selecionada</span><h2>{usuarioSelecionado.nome || usuarioSelecionado.loginNome || usuarioSelecionado.email}</h2><small>{usuarioSelecionado.loginNome || "Login não definido"} · {usuarioSelecionado.email}</small></div>
                <span className={`admin-cf-profile admin-cf-profile--${usuarioSelecionado.perfil}`}>{usuarioSelecionado.perfil}</span>
                <button type="button" className="admin-cf-icon-button admin-cf-sheet-close" data-sheet-autofocus="true" onClick={() => setDossieAberto(false)} aria-label="Fechar dossiê"><OperationIcon name="close" size={17} /></button>
              </div>
              <div className="login-stats">
                <article><small>Status</small><strong className={usuarioSelecionado.bloqueado ? "admin-cf-text-danger" : "admin-cf-text-success"}>{usuarioSelecionado.bloqueado ? "Bloqueado" : usuarioSelecionado.emailTemporario ? "Temporário" : "Ativo"}</strong></article>
                <article><small>Login de entrada</small><strong>{usuarioSelecionado.loginNome || "Não definido"}</strong></article>
                <article><small>Gerente vinculado</small><strong>{usuarioSelecionado.perfil === "gerente" ? usuarioSelecionado.gerenteNome || "Não vinculado" : "Não se aplica"}</strong></article>
                <article><small>E-mail temporário</small><strong>{usuarioSelecionado.emailTemporario ? `Sim · ${diasRestantes(usuarioSelecionado.emailTemporarioExpiraEm)}` : "Não"}</strong></article>
                <article><small>Criado em</small><strong>{formatarData(usuarioSelecionado.criadoEm)}</strong></article>
                <article><small>Último acesso</small><strong>{formatarData(usuarioSelecionado.ultimoAcesso)}</strong></article>
              </div>
              <div className="admin-cf-dossier-section admin-cf-login-permissions">
                <div className="admin-cf-dossier-section-title"><span>Permissão e vínculo</span><small>Salva ao selecionar</small></div>
                <label className="admin-cf-filter-field"><span>Perfil</span><select value={usuarioSelecionado.perfil} onChange={e => alterarPerfil(usuarioSelecionado, e.target.value)}>{perfisDisponiveis.map(p => <option key={p.valor} value={p.valor}>{p.label}</option>)}</select></label>
                {usuarioSelecionado.perfil === "gerente" && (
                  <label className="admin-cf-filter-field"><span>Gerente</span><select value={usuarioSelecionado.gerenteNome || ""} onChange={e => alterarPerfil(usuarioSelecionado, "gerente", e.target.value)}><option value="">Vincular gerente...</option>{GERENTES.map(g => <option key={g} value={g}>{g}</option>)}</select></label>
                )}
              </div>
              <div className="admin-cf-dossier-section admin-cf-security-actions">
                <div className="admin-cf-dossier-section-title"><span>Ações de acesso</span><small>Credencial protegida</small></div>
                <div className="admin-cf-dossier-action-grid">
                  <button className="btn-secundario" onClick={() => abrirSenha(usuarioSelecionado)}><OperationIcon name="edit" size={14} />Editar acesso</button>
                  <button className="btn-secundario" onClick={() => abrirSenha(usuarioSelecionado, true)}><OperationIcon name="refresh" size={14} />Gerar senha</button>
                  <button className={usuarioSelecionado.bloqueado ? "btn-secundario" : "btn-danger-outline"} onClick={() => alternarBloqueio(usuarioSelecionado)}><OperationIcon name={usuarioSelecionado.bloqueado ? "check" : "lock"} size={14} />{usuarioSelecionado.bloqueado ? "Desbloquear" : "Bloquear"}</button>
                </div>
              </div>
              <div className="login-subtitle"><span className="admin-cf-section-code">Referências</span><h3>Atividade associada</h3><p>Correlação informativa; não substitui uma trilha de auditoria de segurança.</p></div>
              <div className="login-history">
                <div className="login-history-item">
                  <span aria-hidden="true"><OperationIcon name="plus" size={13} /></span>
                  <div>
                  <strong>Login cadastrado</strong>
                  <small>{formatarData(usuarioSelecionado.criadoEm)}</small>
                  </div>
                </div>
                {usuarioSelecionado.ultimoAcesso && (
                  <div className="login-history-item">
                    <span aria-hidden="true"><OperationIcon name="clock" size={13} /></span>
                    <div>
                    <strong>Último acesso registrado pelo Supabase</strong>
                    <small>{formatarData(usuarioSelecionado.ultimoAcesso)}</small>
                    </div>
                  </div>
                )}
                {historicoDoUsuario(usuarioSelecionado, historico, historicoPontos).map(evento => (
                  <div key={evento.id} className="login-history-item">
                    <span aria-hidden="true"><OperationIcon name="file" size={13} /></span>
                    <div>
                    <strong>{evento.tipo} · {evento.acao}</strong>
                    <span>{evento.detalhe}</span>
                    <small>{evento.data}</small>
                    </div>
                  </div>
                ))}
                <p className="acessos-nota"><OperationIcon name="info" size={15} />As ações aparecem quando nomes ou e-mails correspondem ao histórico operacional. Criação e último acesso vêm do Supabase.</p>
              </div>
            </>
          )}
        </aside>
      </section>

      {modalSenha && (
        <Modal open title="Editar acesso" subtitle="Credencial protegida" onClose={fecharModalSenha} size="sm" className="admin-cf-modal" overlayClassName="admin-cf-modal-layer">
            <form onSubmit={salvarSenha}>
              <div className="modal-body">
                <p className="senha-texto">Usuário: <strong>{modalSenha.email}</strong>. Como administrador, você pode trocar o e-mail e definir uma nova senha.</p>
                {erro && <div className="erro-msg admin-cf-inline-message" role="alert"><OperationIcon name="warning" size={17} /><span>{erro}</span></div>}
                {feedbackCredencial && <div className={`admin-cf-credential-feedback ${feedbackCredencial.tipo === "erro" ? "is-error" : ""}`} role={feedbackCredencial.tipo === "erro" ? "alert" : "status"}><OperationIcon name={feedbackCredencial.tipo === "erro" ? "warning" : "check"} size={16} /><span>{feedbackCredencial.texto}</span></div>}
                <div className="campo"><label>Login de entrada *</label><input type="text" value={formSenha.loginNome} onChange={e => setFormSenha({ ...formSenha, loginNome: e.target.value.toLowerCase() })} /></div>
                <div className="campo"><label>E-mail de login *</label><input type="email" value={formSenha.email} onChange={e => setFormSenha({ ...formSenha, email: e.target.value })} /></div>
                <div className="campo"><label htmlFor="login-manager-edit-password">Nova senha *</label><div className="admin-cf-password-control"><input id="login-manager-edit-password" type={senhaEdicaoVisivel ? "text" : "password"} autoComplete="new-password" value={formSenha.senha} onChange={e => { setFeedbackCredencial(null); setFormSenha({ ...formSenha, senha: e.target.value }); }} /><span className="admin-cf-password-actions"><button type="button" className="admin-cf-password-action" aria-label={senhaEdicaoVisivel ? "Ocultar nova senha" : "Revelar nova senha"} aria-pressed={senhaEdicaoVisivel} onClick={() => setSenhaEdicaoVisivel(visivel => !visivel)}><OperationIcon name={senhaEdicaoVisivel ? "eyeOff" : "eye"} size={16} /></button><button type="button" className="admin-cf-password-action" aria-label="Copiar nova senha" disabled={!formSenha.senha} onClick={() => copiarSenhaCredencial(formSenha.senha)}><OperationIcon name="copy" size={16} /></button></span></div></div>
                <div className="campo"><label>Confirmar senha *</label><input type={senhaEdicaoVisivel ? "text" : "password"} autoComplete="new-password" value={formSenha.confirmar} onChange={e => setFormSenha({ ...formSenha, confirmar: e.target.value })} /></div>
                <button type="button" className="btn-secundario" onClick={() => {
                  const senha = senhaAleatoria();
                  setFeedbackCredencial(null);
                  setFormSenha(prev => ({ ...prev, senha, confirmar: senha }));
                }}><OperationIcon name="refresh" size={15} />Gerar outra senha provisória</button>
              </div>
              <div className="modal-footer"><button type="button" className="btn-secundario" onClick={fecharModalSenha}>Cancelar</button><button type="submit" className="btn-primario">Salvar acesso</button></div>
            </form>
        </Modal>
      )}

      {modalNovo && (
        <Modal open title="Novo login" subtitle="Nova identidade" onClose={fecharModalNovo} size="sm" className="admin-cf-modal" overlayClassName="admin-cf-modal-layer">
            <form onSubmit={criarLogin}>
              <div className="modal-body">
                <p className="senha-texto">Crie um acesso novo para sócio ou funcionário. Você pode usar um e-mail interno do app quando não precisar de recuperação por caixa de entrada.</p>
                {erro && <div className="erro-msg admin-cf-inline-message" role="alert"><OperationIcon name="warning" size={17} /><span>{erro}</span></div>}
                {feedbackCredencial && <div className={`admin-cf-credential-feedback ${feedbackCredencial.tipo === "erro" ? "is-error" : ""}`} role={feedbackCredencial.tipo === "erro" ? "alert" : "status"}><OperationIcon name={feedbackCredencial.tipo === "erro" ? "warning" : "check"} size={16} /><span>{feedbackCredencial.texto}</span></div>}
                <div className="campo">
                  <label>E-mail de login *</label>
                  <input type="email" placeholder="socio@gmail.com" value={formNovo.email} readOnly={formNovo.emailTemporario} onChange={e => setFormNovo(prev => ({ ...prev, email: e.target.value, emailTemporario: false, loginNome: prev.loginNome || gerarLoginSugerido(prev.perfil, prev.gerenteNome, e.target.value) }))} autoFocus />
                </div>
                <div className="campo"><label>Login de entrada *</label><input type="text" placeholder="ex: operador" value={formNovo.loginNome} onChange={e => setFormNovo({ ...formNovo, loginNome: e.target.value.toLowerCase() })} /><small className="campo-hint">Pode entrar digitando só <strong>{formNovo.loginNome || (formNovo.perfil === "operador" ? "operador" : "beu")}</strong>, sem escrever o e-mail completo.</small></div>
                <button type="button" className={`btn-secundario ${formNovo.emailTemporario ? "btn-temp-ativo" : ""}`} onClick={alternarEmailTemporario}>
                  {formNovo.emailTemporario ? "Usando e-mail interno" : "Criar e-mail interno"}
                </button>
                {formNovo.emailTemporario && <p className="acessos-nota">Este login usa um e-mail interno apenas para autenticação. A senha pode ser trocada pelo administrador quando necessário.</p>}
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
                <div className="campo"><label htmlFor="login-manager-new-password">Senha provisória *</label><div className="admin-cf-password-control"><input id="login-manager-new-password" type={senhaNovoVisivel ? "text" : "password"} autoComplete="new-password" value={formNovo.senha} onChange={e => { setFeedbackCredencial(null); setFormNovo({ ...formNovo, senha: e.target.value }); }} /><span className="admin-cf-password-actions"><button type="button" className="admin-cf-password-action" aria-label={senhaNovoVisivel ? "Ocultar senha provisória" : "Revelar senha provisória"} aria-pressed={senhaNovoVisivel} onClick={() => setSenhaNovoVisivel(visivel => !visivel)}><OperationIcon name={senhaNovoVisivel ? "eyeOff" : "eye"} size={16} /></button><button type="button" className="admin-cf-password-action" aria-label="Copiar senha provisória" disabled={!formNovo.senha} onClick={() => copiarSenhaCredencial(formNovo.senha)}><OperationIcon name="copy" size={16} /></button></span></div></div>
                <div className="campo"><label>Confirmar senha *</label><input type={senhaNovoVisivel ? "text" : "password"} autoComplete="new-password" value={formNovo.confirmar} onChange={e => setFormNovo({ ...formNovo, confirmar: e.target.value })} /></div>
                <button type="button" className="btn-secundario" onClick={() => {
                  const senha = senhaAleatoria();
                  setFeedbackCredencial(null);
                  setFormNovo(prev => ({ ...prev, senha, confirmar: senha }));
                }}><OperationIcon name="refresh" size={15} />Gerar outra senha provisória</button>
              </div>
              <div className="modal-footer"><button type="button" className="btn-secundario" onClick={fecharModalNovo}>Cancelar</button><button type="submit" className="btn-primario">Criar login</button></div>
            </form>
        </Modal>
      )}
    </div>
  );
}
