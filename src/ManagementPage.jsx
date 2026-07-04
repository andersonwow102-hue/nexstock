import { useEffect, useMemo, useState } from "react";
import {
  carregarPerfis, salvarPerfil, redefinirAcessoUsuario, excluirAcessoUsuario, gerenciarLogins,
} from "./db.js";
import { GERENTES, ROTAS_POR_GERENTE } from "./pointsData.js";

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

function AccessIcon({ type }) {
  const paths = {
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-5"/></>,
    route: <><circle cx="6" cy="18" r="3"/><circle cx="18" cy="6" r="3"/><path d="M9 18h3a6 6 0 0 0 6-6V9"/></>,
    eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="3"/></>,
  };
  return <svg className="acesso-svg" viewBox="0 0 24 24" aria-hidden="true">{paths[type] || paths.users}</svg>;
}

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
    if (/@(nexstock|stockon)\.com$/i.test(email)) {
      setErro("Este domínio é usado apenas como login interno. Informe Gmail, Outlook ou outro e-mail real.");
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
    <div className="gestao-page acessos-page">
      <section className="gestao-intro acessos-intro">
        <div>
          <span className="gestao-kicker">Central de acessos</span>
          <h2>Controle de usuários e permissões</h2>
          <p>Defina quem administra, opera, consulta ou acessa somente a carteira de gerente.</p>
        </div>
        <span className={`perfil-selo perfil-${perfilAtual?.perfil || "consulta"}`}>{perfilAtual?.perfil || "consulta"}</span>
      </section>

      {mensagem && <div className="gestao-mensagem">{mensagem}<button onClick={() => setMensagem("")}>✕</button></div>}

      <section className="acessos-resumo">
        <article><span><AccessIcon type="users" /></span><small>Usuários</small><strong>{perfis.length}</strong></article>
        <article><span><AccessIcon type="shield" /></span><small>Administradores</small><strong>{totalAdministradores}</strong></article>
        <article><span><AccessIcon type="route" /></span><small>Gerentes</small><strong>{totalGerentes}</strong></article>
        <article><span><AccessIcon type="eye" /></span><small>Consultas</small><strong>{totalConsulta}</strong></article>
      </section>

      <section className="secao acessos-painel">
        <div className="acessos-topo">
          <div>
            <h2 className="secao-titulo">Perfis de acesso</h2>
            <p>Administrador configura tudo. Operador cadastra e movimenta. Gerente vê apenas sua carteira. Consulta apenas visualiza e exporta.</p>
            {adminMaster && <small className="acessos-master-aviso">Modo master ativo: você pode excluir acessos que não sejam o seu próprio login.</small>}
          </div>
          <div className="acessos-acoes-topo">
            <button className="btn-secundario" onClick={recarregarPerfis} disabled={!administrador || carregando}>
              {carregando ? "Atualizando..." : "Atualizar lista"}
            </button>
            <button className="btn-primario" onClick={abrirNovoLogin} disabled={!administrador}>+ Novo login</button>
          </div>
        </div>
        <div className="acessos-filtros">
          <input className="input-busca" type="search" placeholder="Buscar usuário, gerente, perfil ou rota..." value={busca} onChange={e => setBusca(e.target.value)} />
          <select className="select-filtro" value={filtroPerfil} onChange={e => setFiltroPerfil(e.target.value)}>
            <option value="todos">Todos os perfis</option>
            {perfisDisponiveis.map(perfil => <option key={perfil.valor} value={perfil.valor}>{perfil.label}</option>)}
          </select>
          <span>{perfisFiltrados.length} de {perfis.length} acessos</span>
        </div>

        {!administrador ? (
          <p className="permissao-aviso">Somente um administrador pode alterar permissões dos usuários.</p>
        ) : carregando ? (
          <p className="tabela-vazia">Carregando acessos...</p>
        ) : (
          <div className="acessos-lista">
            {perfisFiltrados.map(p => {
              const perfilAtualItem = p.perfil || "consulta";
              const rotasAtivas = p.rotasPermitidas?.length ? p.rotasPermitidas : rotasPadrao(p.gerenteNome);
              return (
              <div className="acesso-item" key={p.userId}>
                <div className="acesso-identidade">
                  <span className={`acesso-avatar perfil-${perfilAtualItem}`}>{String(p.nome || "?").slice(0, 1).toUpperCase()}</span>
                  <div>
                    <strong>{p.nome}</strong>
                    <small>{p.loginNome || p.nome}</small>
                    <span className={`acesso-status perfil-${perfilAtualItem}`}>{p.userId === perfilAtual.userId ? "Você" : perfilLabel[perfilAtualItem]}</span>
                  </div>
                </div>
                <div className="acesso-permissao">
                  <label>Perfil</label>
                  <select value={p.perfil} disabled={p.userId === perfilAtual.userId} title={p.userId === perfilAtual.userId ? "Seu próprio perfil permanece administrador para evitar perda de acesso." : ""} onChange={e => alterarPerfil(p, e.target.value)}>
                    {perfisDisponiveis.map(perfil => <option key={perfil.valor} value={perfil.valor}>{perfil.label}</option>)}
                  </select>
                  <small>{perfilDescricao[perfilAtualItem] || "Permissão personalizada"}</small>
                </div>
                <div className="acesso-controles">
                  {p.perfil === "gerente" && (
                    <div className="acesso-rotas-box">
                      <label>Gerente vinculado</label>
                      <select value={p.gerenteNome || ""} onChange={e => alterarGerente(p, e.target.value)}>
                        <option value="">Vincular gerente...</option>
                        {GERENTES.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                      {p.gerenteNome && (
                        <div className="rota-chips">
                          {rotasPadrao(p.gerenteNome).map(rota => {
                            return (
                              <button key={rota} type="button" className={rotasAtivas.includes(rota) ? "ativo" : ""} onClick={() => alterarRotas(p, rota)}>
                                {rota}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                  {p.perfil !== "gerente" && (
                    <div className="acesso-escopo">
                      <label>Escopo</label>
                      <strong>{perfilLabel[perfilAtualItem]}</strong>
                      <small>{perfilDescricao[perfilAtualItem]}</small>
                    </div>
                  )}
                </div>
                <div className="acesso-acoes">
                  <button className="btn-secundario btn-acesso" onClick={() => abrirRedefinirAcesso(p)}>{p.userId === perfilAtual.userId ? "Regularizar meu e-mail" : "Redefinir acesso"}</button>
                  {adminMaster && p.userId !== perfilAtual.userId && (
                    <button className="btn-danger-outline btn-acesso" onClick={() => excluirAcesso(p)}>Excluir acesso</button>
                  )}
                </div>
              </div>
            );})}
            {perfisFiltrados.length === 0 && <p className="tabela-vazia">Nenhum usuário encontrado com os filtros atuais.</p>}
          </div>
        )}
        <p className="acessos-nota">Novos usuários começam como apenas consulta. Para permitir recuperação de senha, use um e-mail real ao criar ou redefinir o acesso. Seu próprio perfil não pode ser rebaixado nesta tela.</p>
      </section>

      {usuarioAcesso && (
        <div className="modal-overlay">
          <div className="modal modal-pequeno" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>Redefinir Acesso</h3><button className="modal-fechar" onClick={() => setUsuarioAcesso(null)}>✕</button></div>
            <form onSubmit={confirmarRedefinicaoAcesso}>
              <div className="modal-body">
                <p className="senha-texto">Usuário atual: <strong>{usuarioAcesso.nome}</strong>. Troque para um e-mail que realmente receba mensagens e informe uma senha provisória. O e-mail passará a ser o novo login.</p>
                {erro && <div className="erro-msg">⚠️ {erro}</div>}
                <div className="campo"><label>Novo e-mail verdadeiro *</label><input type="email" placeholder="socio@gmail.com" value={formAcesso.novoEmail} onChange={e => setFormAcesso({ ...formAcesso, novoEmail: e.target.value })} autoFocus /></div>
                <div className="campo"><label>Senha provisória *</label><input type="password" placeholder="Mínimo de 10 caracteres" value={formAcesso.novaSenha} onChange={e => setFormAcesso({ ...formAcesso, novaSenha: e.target.value })} /></div>
                <div className="campo"><label>Confirmar senha *</label><input type="password" value={formAcesso.confirmacao} onChange={e => setFormAcesso({ ...formAcesso, confirmacao: e.target.value })} /></div>
              </div>
              <div className="modal-footer"><button type="button" className="btn-secundario" onClick={() => setUsuarioAcesso(null)}>Cancelar</button><button type="submit" className="btn-primario" disabled={salvandoAcesso}>{salvandoAcesso ? "Salvando..." : "Atualizar acesso"}</button></div>
            </form>
          </div>
        </div>
      )}

      {modalNovo && (
        <div className="modal-overlay">
          <div className="modal modal-pequeno" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>Novo login</h3><button className="modal-fechar" onClick={() => setModalNovo(false)}>✕</button></div>
            <form onSubmit={criarLogin}>
              <div className="modal-body">
                <p className="senha-texto">Crie o login interno do usuário, defina a senha provisória e marque rotas quando for um gerente. O domínio fica travado em <strong>@stockon.com</strong>.</p>
                {erro && <div className="erro-msg">⚠️ {erro}</div>}
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
                            <button key={rota} type="button" className={formNovo.rotasPermitidas.includes(rota) ? "ativo" : ""} onClick={() => setFormNovo(prev => {
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
                }}>Gerar outra senha provisória</button>
              </div>
              <div className="modal-footer"><button type="button" className="btn-secundario" onClick={() => setModalNovo(false)}>Cancelar</button><button type="submit" className="btn-primario" disabled={salvandoAcesso}>{salvandoAcesso ? "Criando..." : "Criar login"}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
