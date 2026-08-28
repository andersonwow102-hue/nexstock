import { useEffect, useMemo, useState } from "react";
import {
  carregarPerfis, salvarPerfil, redefinirAcessoUsuario, excluirAcessoUsuario, gerenciarLogins,
} from "./db.js";
import { GERENTES, ROTAS_POR_GERENTE } from "./pointsData.js";
import { OperationIcon } from "./components/operations/OperationsUI.jsx";
import "./AdminCommandFlow.css";

const MASTER_ADMIN_EMAILS = ["andersonwow102@gmail.com", "anderson@nexstock.com"];
const perfisDisponiveis = [
  { valor: "administrador", label: "Administrador" },
  { valor: "operador", label: "Operador" },
  { valor: "gerente", label: "Gerente" },
  { valor: "consulta", label: "Apenas consulta" },
];
const perfilLabel = Object.fromEntries(perfisDisponiveis.map(p => [p.valor, p.label]));
const perfilDescricao = {
  administrador: "Acesso total ao sistema",
  operador: "Movimenta e edita operação",
  gerente: "Carteira e rotas vinculadas",
  consulta: "Visualização e exportações",
};

function ehAdminMaster(perfilAtual) {
  if (perfilAtual?.perfil !== "administrador") return false;
  return MASTER_ADMIN_EMAILS.includes(String(perfilAtual.email || "").trim().toLowerCase());
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

function gerarLoginSugerido(perfil, gerenteNome, email = "") {
  const base = perfil === "gerente" && gerenteNome ? gerenteNome : email.split("@")[0] || perfil || "usuario";
  return base.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
}

function rotasPadrao(gerenteNome) {
  return ROTAS_POR_GERENTE[gerenteNome] || [];
}

function normalizarLoginInterno(valor) {
  return String(valor || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/@.*$/, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);
}

export default function ManagementPage({ perfilAtual, onPerfilAtualChange }) {
  const [perfis, setPerfis] = useState([]);
  const [usuarioAcesso, setUsuarioAcesso] = useState(null);
  const [modalNovo, setModalNovo] = useState(false);
  const [formAcesso, setFormAcesso] = useState({ novoEmail: "", novaSenha: "", confirmacao: "" });
  const [formNovo, setFormNovo] = useState({ email: "", loginNome: "", perfil: "gerente", gerenteNome: "", rotasPermitidas: [], senha: "", confirmar: "" });
  const [salvandoAcesso, setSalvandoAcesso] = useState(false);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroPerfil, setFiltroPerfil] = useState("todos");
  const administrador = perfilAtual?.perfil === "administrador";
  const adminMaster = ehAdminMaster(perfilAtual);

  async function recarregarPerfis() {
    if (!administrador) return;
    setPerfis(await carregarPerfis());
  }

  useEffect(() => {
    async function carregar() {
      setCarregando(true);
      await recarregarPerfis();
      setCarregando(false);
    }
    carregar();
  }, [administrador]);

  async function alterarPerfil(item, novoPerfil) {
    try {
      const gerenteNome = novoPerfil === "gerente" ? item.gerenteNome || "" : "";
      const rotasPermitidas = novoPerfil === "gerente" ? item.rotasPermitidas || rotasPadrao(gerenteNome) : [];
      await salvarPerfil({ ...item, perfil: novoPerfil, gerenteNome, rotasPermitidas });
      const atualizados = perfis.map(p => p.userId === item.userId ? { ...p, perfil: novoPerfil, gerenteNome, rotasPermitidas } : p);
      setPerfis(atualizados);
      if (item.userId === perfilAtual.userId) onPerfilAtualChange?.({ ...perfilAtual, perfil: novoPerfil, gerenteNome, rotasPermitidas });
      setMensagem("Permissão atualizada.");
    } catch (e) {
      setMensagem(`Não foi possível alterar a permissão: ${e.message}`);
    }
  }

  async function alterarGerente(item, gerenteNome) {
    const rotasPermitidas = rotasPadrao(gerenteNome);
    try {
      await salvarPerfil({ ...item, perfil: "gerente", gerenteNome, rotasPermitidas });
      setPerfis(perfis.map(p => p.userId === item.userId ? { ...p, gerenteNome, rotasPermitidas } : p));
      if (item.userId === perfilAtual.userId) onPerfilAtualChange?.({ ...perfilAtual, gerenteNome, rotasPermitidas });
      setMensagem("Gerente e rotas atualizados.");
    } catch (e) {
      setMensagem(`Não foi possível alterar o gerente: ${e.message}`);
    }
  }

  async function alterarRotas(item, rota) {
    const rotasAtuais = item.rotasPermitidas?.length ? item.rotasPermitidas : rotasPadrao(item.gerenteNome);
    const rotasPermitidas = rotasAtuais.includes(rota)
      ? rotasAtuais.filter(r => r !== rota)
      : [...rotasAtuais, rota];
    if (rotasPermitidas.length === 0) {
      setMensagem("O gerente precisa ter pelo menos uma rota marcada.");
      return;
    }
    try {
      await salvarPerfil({ ...item, perfil: "gerente", rotasPermitidas });
      setPerfis(perfis.map(p => p.userId === item.userId ? { ...p, rotasPermitidas } : p));
      if (item.userId === perfilAtual.userId) onPerfilAtualChange?.({ ...perfilAtual, rotasPermitidas });
      setMensagem("Rotas do gerente atualizadas.");
    } catch (e) {
      setMensagem(`Não foi possível salvar as rotas: ${e.message}`);
    }
  }

  async function excluirAcesso(item) {
    if (!adminMaster) {
      setMensagem("Somente o administrador master pode excluir acessos.");
      return;
    }
    if (item.userId === perfilAtual.userId) {
      setMensagem("Você não pode excluir o próprio acesso master logado.");
      return;
    }
    const confirmar = window.confirm(`Excluir definitivamente o acesso de ${item.nome}?\n\nEssa ação remove o perfil e o login do Supabase Auth. Use somente quando tiver certeza.`);
    if (!confirmar) return;
    try {
      const resposta = await excluirAcessoUsuario({ userId: item.userId });
      setMensagem(resposta?.mensagem || "Acesso excluído com sucesso.");
      await recarregarPerfis();
    } catch (e) {
      setMensagem(`Não foi possível excluir o acesso: ${e.message}`);
    }
  }

  function abrirRedefinirAcesso(item) {
    setUsuarioAcesso(item);
    setFormAcesso({ novoEmail: "", novaSenha: "", confirmacao: "" });
    setErro("");
  }

  function abrirNovoLogin() {
    const senha = senhaAleatoria();
    setFormNovo({ email: "", loginNome: "", perfil: "gerente", gerenteNome: "", rotasPermitidas: [], senha, confirmar: senha });
    setErro("");
    setModalNovo(true);
  }

  async function criarLogin(e) {
    e.preventDefault();
    setErro("");
    const loginNome = normalizarLoginInterno(formNovo.loginNome || formNovo.email || formNovo.gerenteNome);
    const email = `${loginNome}@stockon.com`;
    if (!/^[a-z0-9._-]{3,30}$/.test(loginNome)) { setErro("Informe um login simples com 3 a 30 caracteres. Use letras, números, ponto, traço ou underline."); return; }
    if (formNovo.perfil === "gerente" && !formNovo.gerenteNome) { setErro("Selecione qual gerente este login representa."); return; }
    if (formNovo.perfil === "gerente" && formNovo.rotasPermitidas.length === 0) { setErro("Marque pelo menos uma rota para este gerente."); return; }
    if (formNovo.senha.length < 10) { setErro("A senha provisória precisa ter pelo menos 10 caracteres."); return; }
    if (formNovo.senha !== formNovo.confirmar) { setErro("A confirmação da senha está diferente."); return; }
    try {
      setSalvandoAcesso(true);
      const resposta = await gerenciarLogins({
        action: "criar",
        email,
        loginNome,
        senha: formNovo.senha,
        perfil: formNovo.perfil,
        gerenteNome: formNovo.perfil === "gerente" ? formNovo.gerenteNome : "",
        rotasPermitidas: formNovo.perfil === "gerente" ? formNovo.rotasPermitidas : [],
        emailTemporario: false,
      });
      const listaAtualizada = await carregarPerfis();
      const criado = listaAtualizada.find(p => [p.nome, p.loginNome].some(v => String(v || "").toLowerCase() === email || String(v || "").toLowerCase() === loginNome));
      if (criado && formNovo.perfil === "gerente") {
        await salvarPerfil({ ...criado, perfil: "gerente", gerenteNome: formNovo.gerenteNome, rotasPermitidas: formNovo.rotasPermitidas });
      }
      setModalNovo(false);
      setMensagem(resposta?.mensagem || "Novo login criado.");
      setPerfis(await carregarPerfis());
    } catch (e) {
      setErro(`Não foi possível criar o login: ${e.message}`);
    } finally {
      setSalvandoAcesso(false);
    }
  }

  async function confirmarRedefinicaoAcesso(e) {
    e.preventDefault();
    setErro("");
    const email = formAcesso.novoEmail.trim().toLowerCase();
    if (!email || !email.includes("@") || !email.includes(".")) {
      setErro("Informe o e-mail verdadeiro que o usuário consegue acessar.");
      return;
    }
    if (formAcesso.novaSenha.length < 10) {
      setErro("A senha provisória precisa ter pelo menos 10 caracteres.");
      return;
    }
    if (formAcesso.novaSenha !== formAcesso.confirmacao) {
      setErro("A confirmação da senha está diferente.");
      return;
    }
    try {
      setSalvandoAcesso(true);
      await redefinirAcessoUsuario({ userId: usuarioAcesso.userId, novoEmail: email, novaSenha: formAcesso.novaSenha });
      await recarregarPerfis();
      setUsuarioAcesso(null);
      setMensagem(`Acesso atualizado. O novo login de ${email} já pode ser utilizado.`);
    } catch (e) {
      const texto = e.message.toLowerCase();
      const indisponivel = texto.includes("function") || texto.includes("failed to send");
      setErro(indisponivel
        ? "A função segura de redefinição ainda não foi ativada no Supabase."
        : `Não foi possível redefinir o acesso: ${e.message}`);
    } finally {
      setSalvandoAcesso(false);
    }
  }

  const totalAdministradores = perfis.filter(p => p.perfil === "administrador").length;
  const totalGerentes = perfis.filter(p => p.perfil === "gerente").length;
  const totalConsulta = perfis.filter(p => p.perfil === "consulta").length;
  const perfisFiltrados = useMemo(() => {
    const termo = busca.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    return [...perfis]
      .filter(p => filtroPerfil === "todos" || p.perfil === filtroPerfil)
      .filter(p => {
        if (!termo) return true;
        return [p.nome, p.loginNome, p.perfil, p.gerenteNome, ...(p.rotasPermitidas || [])]
          .some(v => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(termo));
      })
      .sort((a, b) => (a.perfil || "").localeCompare(b.perfil || "", "pt-BR") || (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
  }, [busca, filtroPerfil, perfis]);

  return (
    <div className="gestao-page acessos-page admin-command-flow admin-command-flow--access">
      <section className="admin-cf-hero" aria-labelledby="access-command-title">
        <div className="admin-cf-hero-mark" aria-hidden="true"><OperationIcon name="lock" size={22} /></div>
        <div className="admin-cf-hero-copy">
          <span className="admin-cf-kicker">Central de acessos</span>
          <h2 id="access-command-title">Controle de identidade e escopo</h2>
          <p>Administre cada usuário pela sequência operacional: identidade, perfil, alcance e ações de segurança.</p>
        </div>
        <div className="admin-cf-session">
          <span>Sessão atual</span>
          <strong><OperationIcon name="user" size={14} />{perfilAtual?.perfil || "consulta"}</strong>
          <small>{adminMaster ? "Privilégio master ativo" : "Privilégio administrativo"}</small>
        </div>
      </section>

      {mensagem && (
        <div className="admin-cf-feedback" role="status">
          <OperationIcon name="info" size={18} />
          <span>{mensagem}</span>
          <button type="button" onClick={() => setMensagem("")} aria-label="Fechar mensagem"><OperationIcon name="close" size={16} /></button>
        </div>
      )}

      <section className="admin-cf-posture" aria-label="Distribuição dos acessos">
        <article><span><OperationIcon name="user" size={18} /></span><div><small>Usuários</small><strong>{perfis.length}</strong></div></article>
        <article><span><OperationIcon name="lock" size={18} /></span><div><small>Administradores</small><strong>{totalAdministradores}</strong></div></article>
        <article><span><OperationIcon name="file" size={18} /></span><div><small>Gerentes</small><strong>{totalGerentes}</strong></div></article>
        <article><span><OperationIcon name="eye" size={18} /></span><div><small>Consultas</small><strong>{totalConsulta}</strong></div></article>
      </section>

      <section className="admin-cf-panel" aria-labelledby="access-ledger-title">
        <header className="admin-cf-panel-head">
          <div>
            <span className="admin-cf-section-code">Diretório operacional</span>
            <h3 id="access-ledger-title">Perfis de acesso</h3>
            <p>Alterações de perfil, gerente e rota são aplicadas assim que você seleciona uma opção.</p>
            {adminMaster && <small className="admin-cf-master-note"><OperationIcon name="warning" size={15} />Modo master: exclusões removem perfil e login, exceto o seu próprio acesso.</small>}
          </div>
          <div className="admin-cf-head-actions">
            <button className="btn-secundario" onClick={recarregarPerfis} disabled={!administrador || carregando}>
              <OperationIcon name="refresh" size={16} />{carregando ? "Atualizando..." : "Atualizar lista"}
            </button>
            <button className="btn-primario" onClick={abrirNovoLogin} disabled={!administrador}>
              <OperationIcon name="plus" size={16} />Novo login
            </button>
          </div>
        </header>

        <div className="admin-cf-command-bar">
          <label className="admin-cf-search-field">
            <span className="admin-cf-visually-hidden">Buscar acessos</span>
            <OperationIcon name="search" size={17} />
            <input className="input-busca" type="search" placeholder="Buscar usuário, gerente, perfil ou rota" value={busca} onChange={e => setBusca(e.target.value)} />
          </label>
          <label className="admin-cf-filter-field">
            <span>Perfil</span>
            <select className="select-filtro" value={filtroPerfil} onChange={e => setFiltroPerfil(e.target.value)}>
              <option value="todos">Todos os perfis</option>
              {perfisDisponiveis.map(perfil => <option key={perfil.valor} value={perfil.valor}>{perfil.label}</option>)}
            </select>
          </label>
          <span className="admin-cf-result-count"><strong>{perfisFiltrados.length}</strong> de {perfis.length} acessos</span>
        </div>

        {!administrador ? (
          <div className="admin-cf-state admin-cf-state--denied"><OperationIcon name="lock" size={22} /><strong>Acesso restrito</strong><p>Somente um administrador pode alterar permissões dos usuários.</p></div>
        ) : carregando ? (
          <div className="admin-cf-loading" role="status" aria-label="Carregando acessos">
            {[0, 1, 2].map(item => <span key={item}><i /><i /><i /><i /></span>)}
          </div>
        ) : (
          <div className="admin-cf-ledger">
            <div className="admin-cf-ledger-head" aria-hidden="true"><span>Identidade</span><span>Perfil</span><span>Escopo operacional</span><span>Ações</span></div>
            <div className="acessos-lista admin-cf-ledger-body">
              {perfisFiltrados.map(p => {
                const perfilAtualItem = p.perfil || "consulta";
                const rotasAtivas = p.rotasPermitidas?.length ? p.rotasPermitidas : rotasPadrao(p.gerenteNome);
                return (
                  <article className={`acesso-item admin-cf-ledger-row admin-cf-profile-row--${perfilAtualItem}`} key={p.userId}>
                    <div className="acesso-identidade admin-cf-identity">
                      <span className={`acesso-avatar perfil-${perfilAtualItem}`}>{String(p.nome || "?").slice(0, 1).toUpperCase()}</span>
                      <div>
                        <strong>{p.nome}</strong>
                        <small>{p.loginNome || p.nome}</small>
                        <span className={`admin-cf-profile admin-cf-profile--${perfilAtualItem}`}>{p.userId === perfilAtual.userId ? "Sessão atual" : perfilLabel[perfilAtualItem]}</span>
                      </div>
                    </div>
                    <div className="acesso-permissao admin-cf-cell">
                      <label>Perfil <small>Salva ao selecionar</small></label>
                      <select value={p.perfil} disabled={p.userId === perfilAtual.userId} title={p.userId === perfilAtual.userId ? "Seu próprio perfil permanece administrador para evitar perda de acesso." : ""} onChange={e => alterarPerfil(p, e.target.value)}>
                        {perfisDisponiveis.map(perfil => <option key={perfil.valor} value={perfil.valor}>{perfil.label}</option>)}
                      </select>
                      <small>{perfilDescricao[perfilAtualItem] || "Permissão personalizada"}</small>
                    </div>
                    <div className="acesso-controles admin-cf-cell admin-cf-scope">
                      {p.perfil === "gerente" ? (
                        <div className="acesso-rotas-box">
                          <label>Gerente vinculado <small>Salva ao selecionar</small></label>
                          <select value={p.gerenteNome || ""} onChange={e => alterarGerente(p, e.target.value)}>
                            <option value="">Vincular gerente...</option>
                            {GERENTES.map(g => <option key={g} value={g}>{g}</option>)}
                          </select>
                          {p.gerenteNome && (
                            <div className="rota-chips" aria-label={`Rotas de ${p.gerenteNome}`}>
                              {rotasPadrao(p.gerenteNome).map(rota => (
                                <button key={rota} type="button" className={rotasAtivas.includes(rota) ? "ativo" : ""} aria-pressed={rotasAtivas.includes(rota)} onClick={() => alterarRotas(p, rota)}>{rota}</button>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="acesso-escopo">
                          <label>Alcance</label>
                          <strong>{perfilLabel[perfilAtualItem]}</strong>
                          <small>{perfilDescricao[perfilAtualItem]}</small>
                        </div>
                      )}
                    </div>
                    <div className="acesso-acoes admin-cf-row-actions">
                      <button className="btn-secundario btn-acesso" onClick={() => abrirRedefinirAcesso(p)}><OperationIcon name="edit" size={15} />{p.userId === perfilAtual.userId ? "Regularizar e-mail" : "Redefinir acesso"}</button>
                      {adminMaster && p.userId !== perfilAtual.userId && (
                        <button className="btn-danger-outline btn-acesso" onClick={() => excluirAcesso(p)}><OperationIcon name="trash" size={15} />Excluir acesso</button>
                      )}
                    </div>
                  </article>
                );
              })}
              {perfisFiltrados.length === 0 && (
                <div className="admin-cf-state"><OperationIcon name="search" size={22} /><strong>Nenhum acesso encontrado</strong><p>Ajuste a busca ou o filtro de perfil para ampliar o diretório.</p></div>
              )}
            </div>
          </div>
        )}
        <footer className="admin-cf-panel-note"><OperationIcon name="info" size={16} /><p>Novos usuários começam como apenas consulta. Seu próprio perfil não pode ser rebaixado nesta tela.</p></footer>
      </section>

      {usuarioAcesso && (
        <div className="modal-overlay admin-cf-modal-layer">
          <div className="modal modal-pequeno admin-cf-modal" role="dialog" aria-modal="true" aria-labelledby="access-reset-title" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><div><span className="admin-cf-section-code">Credencial protegida</span><h3 id="access-reset-title">Redefinir acesso</h3></div><button type="button" className="modal-fechar admin-cf-icon-button" onClick={() => setUsuarioAcesso(null)} aria-label="Fechar redefinição de acesso"><OperationIcon name="close" size={18} /></button></div>
            <form onSubmit={confirmarRedefinicaoAcesso}>
              <div className="modal-body">
                <p className="senha-texto">Usuário atual: <strong>{usuarioAcesso.nome}</strong>. Informe o e-mail de login e uma senha provisória. Pode ser um e-mail interno do sistema ou um e-mail real.</p>
                {erro && <div className="erro-msg admin-cf-inline-message" role="alert"><OperationIcon name="warning" size={17} /><span>{erro}</span></div>}
                <div className="campo"><label>Novo e-mail de login *</label><input type="email" placeholder="joao@stockon.com" value={formAcesso.novoEmail} onChange={e => setFormAcesso({ ...formAcesso, novoEmail: e.target.value })} autoFocus /></div>
                <div className="campo"><label>Senha provisória *</label><input type="password" placeholder="Mínimo de 10 caracteres" value={formAcesso.novaSenha} onChange={e => setFormAcesso({ ...formAcesso, novaSenha: e.target.value })} /></div>
                <div className="campo"><label>Confirmar senha *</label><input type="password" value={formAcesso.confirmacao} onChange={e => setFormAcesso({ ...formAcesso, confirmacao: e.target.value })} /></div>
              </div>
              <div className="modal-footer"><button type="button" className="btn-secundario" onClick={() => setUsuarioAcesso(null)}>Cancelar</button><button type="submit" className="btn-primario" disabled={salvandoAcesso}>{salvandoAcesso ? "Salvando..." : "Atualizar acesso"}</button></div>
            </form>
          </div>
        </div>
      )}

      {modalNovo && (
        <div className="modal-overlay admin-cf-modal-layer">
          <div className="modal modal-pequeno admin-cf-modal" role="dialog" aria-modal="true" aria-labelledby="access-new-title" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><div><span className="admin-cf-section-code">Nova identidade</span><h3 id="access-new-title">Novo login</h3></div><button type="button" className="modal-fechar admin-cf-icon-button" onClick={() => setModalNovo(false)} aria-label="Fechar criação de login"><OperationIcon name="close" size={18} /></button></div>
            <form onSubmit={criarLogin}>
              <div className="modal-body">
                <p className="senha-texto">Crie o login interno do usuário, defina a senha provisória e marque rotas quando for um gerente. O domínio fica travado em <strong>@stockon.com</strong>.</p>
                {erro && <div className="erro-msg admin-cf-inline-message" role="alert"><OperationIcon name="warning" size={17} /><span>{erro}</span></div>}
                <div className="campo">
                  <label>Nome do login *</label>
                  <div className="login-interno-input">
                    <input type="text" placeholder="ex: beu" value={formNovo.loginNome} onChange={e => setFormNovo({ ...formNovo, loginNome: normalizarLoginInterno(e.target.value) })} autoFocus />
                    <span>@stockon.com</span>
                  </div>
                  <small className="campo-hint">Este acesso entra digitando só <strong>{formNovo.loginNome || (formNovo.perfil === "operador" ? "operador" : "beu")}</strong> ou o login completo <strong>{formNovo.loginNome || (formNovo.perfil === "operador" ? "operador" : "beu")}@stockon.com</strong>.</small>
                </div>
                <div className="campo"><label>Perfil *</label><select value={formNovo.perfil} onChange={e => {
                  const perfil = e.target.value;
                  setFormNovo(prev => ({ ...prev, perfil, gerenteNome: perfil === "gerente" ? prev.gerenteNome : "", rotasPermitidas: perfil === "gerente" ? prev.rotasPermitidas : [], loginNome: prev.loginNome || gerarLoginSugerido(perfil, prev.gerenteNome, prev.email) }));
                }}>
                  {perfisDisponiveis.map(p => <option key={p.valor} value={p.valor}>{p.label}</option>)}
                </select></div>
                {formNovo.perfil === "gerente" && (
                  <>
                    <div className="campo"><label>Gerente vinculado *</label><select value={formNovo.gerenteNome} onChange={e => {
                      const gerenteNome = e.target.value;
                      setFormNovo(prev => ({ ...prev, gerenteNome, rotasPermitidas: rotasPadrao(gerenteNome), loginNome: prev.loginNome || gerarLoginSugerido(prev.perfil, gerenteNome, prev.email) }));
                    }}>
                      <option value="">Selecione o gerente...</option>
                      {GERENTES.map(g => <option key={g} value={g}>{g}</option>)}
                    </select></div>
                    {formNovo.gerenteNome && (
                      <div className="campo">
                        <label>Rotas liberadas *</label>
                        <div className="rota-chips rota-chips-modal">
                          {rotasPadrao(formNovo.gerenteNome).map(rota => (
                            <button key={rota} type="button" className={formNovo.rotasPermitidas.includes(rota) ? "ativo" : ""} aria-pressed={formNovo.rotasPermitidas.includes(rota)} onClick={() => setFormNovo(prev => {
                              const lista = prev.rotasPermitidas.includes(rota) ? prev.rotasPermitidas.filter(r => r !== rota) : [...prev.rotasPermitidas, rota];
                              return { ...prev, rotasPermitidas: lista };
                            })}>{rota}</button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
                <div className="campo"><label>Senha provisória *</label><input type="text" value={formNovo.senha} onChange={e => setFormNovo({ ...formNovo, senha: e.target.value })} /></div>
                <div className="campo"><label>Confirmar senha *</label><input type="text" value={formNovo.confirmar} onChange={e => setFormNovo({ ...formNovo, confirmar: e.target.value })} /></div>
                <button type="button" className="btn-secundario" onClick={() => {
                  const senha = senhaAleatoria();
                  setFormNovo(prev => ({ ...prev, senha, confirmar: senha }));
                }}><OperationIcon name="refresh" size={15} />Gerar outra senha provisória</button>
              </div>
              <div className="modal-footer"><button type="button" className="btn-secundario" onClick={() => setModalNovo(false)}>Cancelar</button><button type="submit" className="btn-primario" disabled={salvandoAcesso}>{salvandoAcesso ? "Criando..." : "Criar login"}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
