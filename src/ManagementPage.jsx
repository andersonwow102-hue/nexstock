import { useEffect, useState } from "react";
import {
  carregarPerfis, salvarPerfil, redefinirAcessoUsuario, excluirAcessoUsuario,
} from "./db.js";

const MASTER_ADMIN_EMAILS = ["andersonwow102@gmail.com", "anderson@nexstock.com"];

function ehAdminMaster(perfilAtual) {
  if (perfilAtual?.perfil !== "administrador") return false;
  const identidades = [perfilAtual.nome, perfilAtual.loginNome].filter(Boolean).map(v => String(v).trim().toLowerCase());
  return identidades.some(v => MASTER_ADMIN_EMAILS.includes(v));
}

export default function ManagementPage({ perfilAtual, onPerfilAtualChange }) {
  const [perfis, setPerfis] = useState([]);
  const [usuarioAcesso, setUsuarioAcesso] = useState(null);
  const [formAcesso, setFormAcesso] = useState({ novoEmail: "", novaSenha: "", confirmacao: "" });
  const [salvandoAcesso, setSalvandoAcesso] = useState(false);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [carregando, setCarregando] = useState(true);
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
      await salvarPerfil({ ...item, perfil: novoPerfil });
      const atualizados = perfis.map(p => p.userId === item.userId ? { ...p, perfil: novoPerfil } : p);
      setPerfis(atualizados);
      if (item.userId === perfilAtual.userId) onPerfilAtualChange?.({ ...perfilAtual, perfil: novoPerfil });
      setMensagem("Permissão atualizada.");
    } catch (e) {
      setMensagem(`Não foi possível alterar a permissão: ${e.message}`);
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
    if (formAcesso.novaSenha.length < 8) {
      setErro("A senha provisória precisa ter pelo menos 8 caracteres.");
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
        <article><span>👥</span><small>Usuários</small><strong>{perfis.length}</strong></article>
        <article><span>🛡️</span><small>Administradores</small><strong>{totalAdministradores}</strong></article>
        <article><span>🧑‍💼</span><small>Gerentes</small><strong>{totalGerentes}</strong></article>
        <article><span>👁️</span><small>Consultas</small><strong>{totalConsulta}</strong></article>
      </section>

      <section className="secao acessos-painel">
        <div className="acessos-topo">
          <div>
            <h2 className="secao-titulo">Perfis de acesso</h2>
            <p>Administrador configura tudo. Operador cadastra e movimenta. Gerente vê apenas sua carteira. Consulta apenas visualiza e exporta.</p>
            {adminMaster && <small className="acessos-master-aviso">Modo master ativo: você pode excluir acessos que não sejam o seu próprio login.</small>}
          </div>
          <button className="btn-secundario" onClick={recarregarPerfis} disabled={!administrador || carregando}>
            {carregando ? "Atualizando..." : "Atualizar lista"}
          </button>
        </div>

        {!administrador ? (
          <p className="permissao-aviso">Somente um administrador pode alterar permissões dos usuários.</p>
        ) : carregando ? (
          <p className="tabela-vazia">Carregando acessos...</p>
        ) : (
          <div className="acessos-lista">
            {perfis.map(p => (
              <div className="acesso-item" key={p.userId}>
                <div className="acesso-identidade">
                  <span className={`acesso-avatar perfil-${p.perfil || "consulta"}`}>{String(p.nome || "?").slice(0, 1).toUpperCase()}</span>
                  <div>
                    <strong>{p.nome}</strong>
                    <small>{p.userId === perfilAtual.userId ? "Você" : "Usuário cadastrado"}</small>
                  </div>
                </div>
                <div className="acesso-controles">
                  <select value={p.perfil} disabled={p.userId === perfilAtual.userId} title={p.userId === perfilAtual.userId ? "Seu próprio perfil permanece administrador para evitar perda de acesso." : ""} onChange={e => alterarPerfil(p, e.target.value)}>
                    <option value="administrador">Administrador</option>
                    <option value="operador">Operador</option>
                    <option value="gerente">Gerente</option>
                    <option value="consulta">Apenas consulta</option>
                  </select>
                  <button className="btn-secundario btn-acesso" onClick={() => abrirRedefinirAcesso(p)}>{p.userId === perfilAtual.userId ? "Regularizar meu e-mail" : "Redefinir acesso"}</button>
                  {adminMaster && p.userId !== perfilAtual.userId && (
                    <button className="btn-danger-outline btn-acesso" onClick={() => excluirAcesso(p)}>Excluir acesso</button>
                  )}
                </div>
              </div>
            ))}
            {perfis.length === 0 && <p className="tabela-vazia">Nenhum usuário encontrado.</p>}
          </div>
        )}
        <p className="acessos-nota">Novos usuários começam como apenas consulta. Para permitir recuperação de senha, use um e-mail real ao criar ou redefinir o acesso. Seu próprio perfil não pode ser rebaixado nesta tela.</p>
      </section>

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
    </div>
  );
}
