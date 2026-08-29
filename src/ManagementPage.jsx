import { useEffect, useMemo, useState } from "react";
import {
  carregarPerfis, salvarPerfil, redefinirAcessoUsuario, excluirAcessoUsuario, gerenciarLogins,
} from "./db.js";
import { GERENTES, ROTAS_POR_GERENTE } from "./pointsData.js";
import { FilterBar, Modal, OperationIcon } from "./components/operations/OperationsUI.jsx";
import { useResponsiveSheet } from "./components/operations/useResponsiveSheet.js";
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
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [usuarioSelecionadoId, setUsuarioSelecionadoId] = useState("");
  const [dossieAberto, setDossieAberto] = useState(false);
  const [senhaAcessoVisivel, setSenhaAcessoVisivel] = useState(false);
  const [senhaNovoVisivel, setSenhaNovoVisivel] = useState(false);
  const [feedbackCredencial, setFeedbackCredencial] = useState(null);
  const administrador = perfilAtual?.perfil === "administrador";
  const adminMaster = ehAdminMaster(perfilAtual);
  const { panelProps: dossieProps, backdropProps: dossieBackdropProps } = useResponsiveSheet({
    open: dossieAberto,
    onClose: () => setDossieAberto(false),
  });

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
    setDossieAberto(false);
    setUsuarioAcesso(item);
    setFormAcesso({ novoEmail: "", novaSenha: "", confirmacao: "" });
    setSenhaAcessoVisivel(false);
    setFeedbackCredencial(null);
    setErro("");
  }

  function abrirNovoLogin() {
    const senha = senhaAleatoria();
    setDossieAberto(false);
    setFormNovo({ email: "", loginNome: "", perfil: "gerente", gerenteNome: "", rotasPermitidas: [], senha, confirmar: senha });
    setSenhaNovoVisivel(false);
    setFeedbackCredencial(null);
    setErro("");
    setModalNovo(true);
  }

  function fecharRedefinicaoAcesso() {
    setUsuarioAcesso(null);
    setSenhaAcessoVisivel(false);
    setFeedbackCredencial(null);
  }

  function fecharNovoLogin() {
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
      fecharNovoLogin();
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
      fecharRedefinicaoAcesso();
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

  const usuarioSelecionado = useMemo(
    () => perfis.find(perfil => perfil.userId === usuarioSelecionadoId) || perfisFiltrados[0] || null,
    [perfis, perfisFiltrados, usuarioSelecionadoId],
  );

  useEffect(() => {
    if (!perfisFiltrados.length) return;
    if (!perfisFiltrados.some(perfil => perfil.userId === usuarioSelecionadoId)) {
      setUsuarioSelecionadoId(perfisFiltrados[0].userId);
    }
  }, [perfisFiltrados, usuarioSelecionadoId]);

  const filtrosAtivos = filtroPerfil === "todos" ? 0 : 1;
  const rotasSelecionadas = usuarioSelecionado?.rotasPermitidas?.length
    ? usuarioSelecionado.rotasPermitidas
    : rotasPadrao(usuarioSelecionado?.gerenteNome);

  return (
    <div className="gestao-page acessos-page admin-command-flow admin-command-flow--access">
      <header className="admin-cf-page-bar" aria-label="Resumo e ações da Central de Acessos">
        <div className="admin-cf-inline-counts" aria-label="Resumo dos acessos">
          <span><strong>{perfis.length}</strong> usuários</span>
          <span><strong>{totalAdministradores}</strong> admin</span>
          <span><strong>{totalGerentes}</strong> gerentes</span>
          <span><strong>{totalConsulta}</strong> consulta</span>
          <span className="admin-cf-session-chip"><OperationIcon name="shieldKey" size={13} />{adminMaster ? "Master" : perfilAtual?.perfil || "consulta"}</span>
        </div>
        <div className="admin-cf-head-actions">
          <button className="btn-secundario" onClick={recarregarPerfis} disabled={!administrador || carregando}>
            <OperationIcon name="refresh" size={16} />{carregando ? "Atualizando..." : "Atualizar"}
          </button>
          <button className="btn-primario" onClick={abrirNovoLogin} disabled={!administrador}>
            <OperationIcon name="plus" size={16} />Novo login
          </button>
        </div>
      </header>

      {mensagem && (
        <div className="admin-cf-feedback" role="status">
          <OperationIcon name="info" size={18} />
          <span>{mensagem}</span>
          <button type="button" onClick={() => setMensagem("")} aria-label="Fechar mensagem"><OperationIcon name="close" size={16} /></button>
        </div>
      )}

      <FilterBar
        className="admin-cf-filter-bar"
        ariaLabel="Busca e filtros do diretório de acessos"
        activeCount={filtrosAtivos}
        secondaryOpen={filtrosAbertos}
        onSecondaryToggle={setFiltrosAbertos}
        secondaryLabel="Filtros"
        onClear={() => setFiltroPerfil("todos")}
        onApply={() => setFiltrosAbertos(false)}
        primary={(
          <label className="admin-cf-search-field">
            <span className="admin-cf-visually-hidden">Buscar acessos</span>
            <OperationIcon name="search" size={17} />
            <input className="input-busca" type="search" placeholder="Buscar usuário, gerente, perfil ou rota" value={busca} onChange={e => setBusca(e.target.value)} />
          </label>
        )}
        secondary={(
          <label className="admin-cf-filter-field">
            <span>Perfil</span>
            <select className="select-filtro" value={filtroPerfil} onChange={e => setFiltroPerfil(e.target.value)}>
              <option value="todos">Todos os perfis</option>
              {perfisDisponiveis.map(perfil => <option key={perfil.valor} value={perfil.valor}>{perfil.label}</option>)}
            </select>
          </label>
        )}
        chips={filtrosAtivos ? (
          <button type="button" className="admin-cf-filter-chip" onClick={() => setFiltroPerfil("todos")}>
            Perfil: {perfilLabel[filtroPerfil]} <OperationIcon name="close" size={12} />
          </button>
        ) : null}
      />

      {!administrador ? (
        <section className="admin-cf-panel">
          <div className="admin-cf-state admin-cf-state--denied"><OperationIcon name="lock" size={22} /><strong>Acesso restrito</strong><p>Somente um administrador pode alterar permissões dos usuários.</p></div>
        </section>
      ) : (
        <section className="admin-cf-master-detail admin-cf-access-workspace">
          <div className="admin-cf-panel admin-cf-directory" aria-labelledby="access-ledger-title">
            <header className="admin-cf-panel-head admin-cf-directory-head">
              <div><span className="admin-cf-section-code">Diretório</span><h3 id="access-ledger-title">Usuários</h3></div>
              <span className="admin-cf-compact-count"><strong>{perfisFiltrados.length}</strong> de {perfis.length}</span>
            </header>
            {adminMaster && <div className="admin-cf-directory-alert"><OperationIcon name="warning" size={14} />Exclusões removem perfil e login. Seu próprio acesso permanece protegido.</div>}
            {carregando ? (
              <div className="admin-cf-loading admin-cf-loading--directory" role="status" aria-label="Carregando acessos">
                {[0, 1, 2, 3].map(item => <span key={item}><i /><i /><i /></span>)}
              </div>
            ) : perfisFiltrados.length === 0 ? (
              <div className="admin-cf-state admin-cf-state--compact"><OperationIcon name="search" size={20} /><strong>Nenhum acesso encontrado</strong><p>Ajuste a busca ou o filtro de perfil.</p></div>
            ) : (
              <div className="admin-cf-access-list">
                {perfisFiltrados.map(p => {
                  const perfilAtualItem = p.perfil || "consulta";
                  const escopo = perfilAtualItem === "gerente"
                    ? p.gerenteNome || "Gerente não vinculado"
                    : perfilDescricao[perfilAtualItem] || "Permissão personalizada";
                  return (
                    <button
                      className={`admin-cf-access-row ${usuarioSelecionado?.userId === p.userId ? "is-selected" : ""}`}
                      key={p.userId}
                      type="button"
                      aria-pressed={usuarioSelecionado?.userId === p.userId}
                      onClick={() => { setUsuarioSelecionadoId(p.userId); setDossieAberto(true); }}
                    >
                      <span className={`acesso-avatar perfil-${perfilAtualItem}`}>{String(p.nome || "?").slice(0, 1).toUpperCase()}</span>
                      <span className="admin-cf-access-row-copy">
                        <strong>{p.nome}</strong>
                        <small>{p.loginNome || p.nome}</small>
                      </span>
                      <span className="admin-cf-access-row-scope"><small>Escopo</small><strong>{escopo}</strong></span>
                      <span className={`admin-cf-profile admin-cf-profile--${perfilAtualItem}`}>{p.userId === perfilAtual.userId ? "Sessão atual" : perfilLabel[perfilAtualItem]}</span>
                      <OperationIcon name="arrowRight" size={15} />
                    </button>
                  );
                })}
              </div>
            )}
            <footer className="admin-cf-panel-note"><OperationIcon name="info" size={15} /><p>Novos usuários começam como apenas consulta. Alterações do dossiê são salvas ao selecionar.</p></footer>
          </div>

          <button {...dossieBackdropProps} className={`admin-cf-sheet-backdrop ${dossieAberto ? "is-open" : ""}`} />
          <aside {...dossieProps} className={`admin-cf-panel admin-cf-dossier admin-cf-access-dossier ${dossieAberto ? "is-open" : ""}`} aria-label="Dossiê do acesso selecionado">
            {!usuarioSelecionado ? (
              <div className="admin-cf-state admin-cf-state--dossier"><OperationIcon name="user" size={22} /><strong>Selecione uma identidade</strong><p>Perfil, escopo e ações aparecerão aqui.</p></div>
            ) : (
              <>
                <header className="admin-cf-dossier-head">
                  <span className={`acesso-avatar perfil-${usuarioSelecionado.perfil || "consulta"}`}>{String(usuarioSelecionado.nome || "?").slice(0, 1).toUpperCase()}</span>
                  <div><span className="admin-cf-section-code">Identidade selecionada</span><h3>{usuarioSelecionado.nome}</h3><small>{usuarioSelecionado.loginNome || usuarioSelecionado.nome}</small></div>
                  <button type="button" className="admin-cf-icon-button admin-cf-sheet-close" data-sheet-autofocus="true" onClick={() => setDossieAberto(false)} aria-label="Fechar dossiê"><OperationIcon name="close" size={17} /></button>
                </header>

                <div className="admin-cf-dossier-section">
                  <div className="admin-cf-dossier-section-title"><span>Permissão</span><small>Salva ao selecionar</small></div>
                  <label className="admin-cf-filter-field">
                    <span>Perfil</span>
                    <select value={usuarioSelecionado.perfil} disabled={usuarioSelecionado.userId === perfilAtual.userId} title={usuarioSelecionado.userId === perfilAtual.userId ? "Seu próprio perfil permanece administrador para evitar perda de acesso." : ""} onChange={e => alterarPerfil(usuarioSelecionado, e.target.value)}>
                      {perfisDisponiveis.map(perfil => <option key={perfil.valor} value={perfil.valor}>{perfil.label}</option>)}
                    </select>
                  </label>
                  <p className="admin-cf-dossier-copy">{perfilDescricao[usuarioSelecionado.perfil || "consulta"] || "Permissão personalizada"}</p>
                </div>

                <div className="admin-cf-dossier-section">
                  <div className="admin-cf-dossier-section-title"><span>Escopo operacional</span><small>{usuarioSelecionado.perfil === "gerente" ? `${rotasSelecionadas.length} rota${rotasSelecionadas.length === 1 ? "" : "s"}` : perfilLabel[usuarioSelecionado.perfil || "consulta"]}</small></div>
                  {usuarioSelecionado.perfil === "gerente" ? (
                    <>
                      <label className="admin-cf-filter-field">
                        <span>Gerente vinculado</span>
                        <select value={usuarioSelecionado.gerenteNome || ""} onChange={e => alterarGerente(usuarioSelecionado, e.target.value)}>
                          <option value="">Vincular gerente...</option>
                          {GERENTES.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                      </label>
                      {usuarioSelecionado.gerenteNome && (
                        <div className="rota-chips" aria-label={`Rotas de ${usuarioSelecionado.gerenteNome}`}>
                          {rotasPadrao(usuarioSelecionado.gerenteNome).map(rota => (
                            <button key={rota} type="button" className={rotasSelecionadas.includes(rota) ? "ativo" : ""} aria-pressed={rotasSelecionadas.includes(rota)} onClick={() => alterarRotas(usuarioSelecionado, rota)}>{rota}</button>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <dl className="admin-cf-dossier-facts">
                      <div><dt>Alcance</dt><dd>{perfilLabel[usuarioSelecionado.perfil || "consulta"]}</dd></div>
                      <div><dt>Regra</dt><dd>{perfilDescricao[usuarioSelecionado.perfil || "consulta"]}</dd></div>
                    </dl>
                  )}
                </div>

                <div className="admin-cf-dossier-section admin-cf-security-actions">
                  <div className="admin-cf-dossier-section-title"><span>Segurança</span><small>{usuarioSelecionado.userId === perfilAtual.userId ? "Sessão atual" : "Ações administrativas"}</small></div>
                  <button className="btn-secundario btn-acesso" onClick={() => abrirRedefinirAcesso(usuarioSelecionado)}><OperationIcon name="edit" size={15} />{usuarioSelecionado.userId === perfilAtual.userId ? "Regularizar e-mail" : "Redefinir acesso"}</button>
                  {adminMaster && usuarioSelecionado.userId !== perfilAtual.userId && (
                    <button className="btn-danger-outline btn-acesso" onClick={() => excluirAcesso(usuarioSelecionado)}><OperationIcon name="trash" size={15} />Excluir acesso</button>
                  )}
                </div>
              </>
            )}
          </aside>
        </section>
      )}

      {usuarioAcesso && (
        <Modal open title="Redefinir acesso" subtitle="Credencial protegida" onClose={fecharRedefinicaoAcesso} size="sm" className="admin-cf-modal" overlayClassName="admin-cf-modal-layer">
            <form onSubmit={confirmarRedefinicaoAcesso}>
              <div className="modal-body">
                <p className="senha-texto">Usuário atual: <strong>{usuarioAcesso.nome}</strong>. Informe o e-mail de login e uma senha provisória. Pode ser um e-mail interno do sistema ou um e-mail real.</p>
                {erro && <div className="erro-msg admin-cf-inline-message" role="alert"><OperationIcon name="warning" size={17} /><span>{erro}</span></div>}
                {feedbackCredencial && <div className={`admin-cf-credential-feedback ${feedbackCredencial.tipo === "erro" ? "is-error" : ""}`} role={feedbackCredencial.tipo === "erro" ? "alert" : "status"}><OperationIcon name={feedbackCredencial.tipo === "erro" ? "warning" : "check"} size={16} /><span>{feedbackCredencial.texto}</span></div>}
                <div className="campo"><label>Novo e-mail de login *</label><input type="email" placeholder="joao@stockon.com" value={formAcesso.novoEmail} onChange={e => setFormAcesso({ ...formAcesso, novoEmail: e.target.value })} autoFocus /></div>
                <div className="campo"><label htmlFor="management-reset-password">Senha provisória *</label><div className="admin-cf-password-control"><input id="management-reset-password" type={senhaAcessoVisivel ? "text" : "password"} autoComplete="new-password" placeholder="Mínimo de 10 caracteres" value={formAcesso.novaSenha} onChange={e => { setFeedbackCredencial(null); setFormAcesso({ ...formAcesso, novaSenha: e.target.value }); }} /><span className="admin-cf-password-actions"><button type="button" className="admin-cf-password-action" aria-label={senhaAcessoVisivel ? "Ocultar senha provisória" : "Revelar senha provisória"} aria-pressed={senhaAcessoVisivel} onClick={() => setSenhaAcessoVisivel(visivel => !visivel)}><OperationIcon name={senhaAcessoVisivel ? "eyeOff" : "eye"} size={16} /></button><button type="button" className="admin-cf-password-action" aria-label="Copiar senha provisória" disabled={!formAcesso.novaSenha} onClick={() => copiarSenhaCredencial(formAcesso.novaSenha)}><OperationIcon name="copy" size={16} /></button></span></div></div>
                <div className="campo"><label>Confirmar senha *</label><input type={senhaAcessoVisivel ? "text" : "password"} autoComplete="new-password" value={formAcesso.confirmacao} onChange={e => setFormAcesso({ ...formAcesso, confirmacao: e.target.value })} /></div>
              </div>
              <div className="modal-footer"><button type="button" className="btn-secundario" onClick={fecharRedefinicaoAcesso}>Cancelar</button><button type="submit" className="btn-primario" disabled={salvandoAcesso}>{salvandoAcesso ? "Salvando..." : "Atualizar acesso"}</button></div>
            </form>
        </Modal>
      )}

      {modalNovo && (
        <Modal open title="Novo login" subtitle="Nova identidade" onClose={fecharNovoLogin} size="sm" className="admin-cf-modal" overlayClassName="admin-cf-modal-layer">
            <form onSubmit={criarLogin}>
              <div className="modal-body">
                <p className="senha-texto">Crie o login interno do usuário, defina a senha provisória e marque rotas quando for um gerente. O domínio fica travado em <strong>@stockon.com</strong>.</p>
                {erro && <div className="erro-msg admin-cf-inline-message" role="alert"><OperationIcon name="warning" size={17} /><span>{erro}</span></div>}
                {feedbackCredencial && <div className={`admin-cf-credential-feedback ${feedbackCredencial.tipo === "erro" ? "is-error" : ""}`} role={feedbackCredencial.tipo === "erro" ? "alert" : "status"}><OperationIcon name={feedbackCredencial.tipo === "erro" ? "warning" : "check"} size={16} /><span>{feedbackCredencial.texto}</span></div>}
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
                <div className="campo"><label htmlFor="management-new-password">Senha provisória *</label><div className="admin-cf-password-control"><input id="management-new-password" type={senhaNovoVisivel ? "text" : "password"} autoComplete="new-password" value={formNovo.senha} onChange={e => { setFeedbackCredencial(null); setFormNovo({ ...formNovo, senha: e.target.value }); }} /><span className="admin-cf-password-actions"><button type="button" className="admin-cf-password-action" aria-label={senhaNovoVisivel ? "Ocultar senha provisória" : "Revelar senha provisória"} aria-pressed={senhaNovoVisivel} onClick={() => setSenhaNovoVisivel(visivel => !visivel)}><OperationIcon name={senhaNovoVisivel ? "eyeOff" : "eye"} size={16} /></button><button type="button" className="admin-cf-password-action" aria-label="Copiar senha provisória" disabled={!formNovo.senha} onClick={() => copiarSenhaCredencial(formNovo.senha)}><OperationIcon name="copy" size={16} /></button></span></div></div>
                <div className="campo"><label>Confirmar senha *</label><input type={senhaNovoVisivel ? "text" : "password"} autoComplete="new-password" value={formNovo.confirmar} onChange={e => setFormNovo({ ...formNovo, confirmar: e.target.value })} /></div>
                <button type="button" className="btn-secundario" onClick={() => {
                  const senha = senhaAleatoria();
                  setFeedbackCredencial(null);
                  setFormNovo(prev => ({ ...prev, senha, confirmar: senha }));
                }}><OperationIcon name="refresh" size={15} />Gerar outra senha provisória</button>
              </div>
              <div className="modal-footer"><button type="button" className="btn-secundario" onClick={fecharNovoLogin}>Cancelar</button><button type="submit" className="btn-primario" disabled={salvandoAcesso}>{salvandoAcesso ? "Criando..." : "Criar login"}</button></div>
            </form>
        </Modal>
      )}
    </div>
  );
}
