import { createClient } from "npm:@supabase/supabase-js@2";

const MASTER_ADMIN_EMAILS = new Set(["andersonwow102@gmail.com", "anderson@nexstock.com"]);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function resposta(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function erroPerfilGerente(errorMessage: string) {
  const msg = String(errorMessage || "").toLowerCase();
  if (msg.includes("gerente_nome")) {
    return "O banco ainda nao tem a coluna gerente_nome. Execute o SQL supabase/perfil_gerente_e_despesas.sql no Supabase e tente novamente.";
  }
  if (msg.includes("email_temporario")) {
    return "O banco ainda nao tem os campos de e-mail temporario. Execute o SQL supabase/perfil_gerente_e_despesas.sql no Supabase e tente novamente.";
  }
  if (msg.includes("login_nome")) {
    return "O banco ainda nao tem o campo login_nome. Execute o SQL supabase/perfil_gerente_e_despesas.sql no Supabase e tente novamente.";
  }
  if (msg.includes("rotas_permitidas")) {
    return "O banco ainda nao tem o campo rotas_permitidas. Execute a migracao de rotas permitidas no Supabase e tente novamente.";
  }
  if (msg.includes("perfis_perfil_check") || msg.includes("check constraint")) {
    return "O banco ainda nao aceita o perfil Gerente. Execute o SQL supabase/perfil_gerente_e_despesas.sql no Supabase e tente novamente.";
  }
  return "";
}

async function carregarPerfis(admin: ReturnType<typeof createClient>) {
  const consulta = await admin
    .from("perfis")
    .select("user_id,nome,perfil,gerente_nome,rotas_permitidas,login_nome,email_temporario,email_temporario_expira_em,criado_em");

  if (!consulta.error) return { data: consulta.data || [], error: null };
  if (!String(consulta.error.message || "").includes("gerente_nome") && !String(consulta.error.message || "").includes("rotas_permitidas") && !String(consulta.error.message || "").includes("email_temporario") && !String(consulta.error.message || "").includes("login_nome")) return { data: [], error: consulta.error };

  const fallback = await admin
    .from("perfis")
    .select("user_id,nome,perfil,criado_em");
  return {
    data: (fallback.data || []).map((p) => ({ ...p, gerente_nome: "", rotas_permitidas: [], login_nome: "", email_temporario: false, email_temporario_expira_em: null })),
    error: fallback.error,
  };
}

async function exigirAdmin(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return { error: resposta({ error: "Acesso nao autenticado." }, 401) };

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return { error: resposta({ error: "Configuracao segura indisponivel." }, 500) };

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const token = authHeader.replace("Bearer ", "");
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return { error: resposta({ error: "Sessao invalida." }, 401) };

  const { data: perfil } = await admin
    .from("perfis")
    .select("perfil,nome,login_nome")
    .eq("user_id", authData.user.id)
    .maybeSingle();
  if (perfil?.perfil !== "administrador") return { error: resposta({ error: "Somente administrador pode gerenciar logins." }, 403) };

  const emailAutenticado = String(authData.user.email || "").trim().toLowerCase();
  return { admin, usuarioAtual: authData.user, master: MASTER_ADMIN_EMAILS.has(emailAutenticado) };
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return resposta({ error: "Metodo nao permitido." }, 405);

    const contexto = await exigirAdmin(req);
    if (contexto.error) return contexto.error;
    const { admin, usuarioAtual, master } = contexto;
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "listar");

    if (action === "listar") {
      const { data: authUsers, error: authError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (authError) return resposta({ error: authError.message }, 400);

      const { data: perfis, error: perfisError } = await carregarPerfis(admin);
      if (perfisError) return resposta({ error: perfisError.message }, 400);

      const mapaPerfis = new Map((perfis || []).map((p) => [p.user_id, p]));
      const agora = Date.now();
      const usuarios = (authUsers.users || []).map((user) => {
        const perfil = mapaPerfis.get(user.id);
        const bloqueadoAte = user.banned_until || "";
        const bloqueado = Boolean(bloqueadoAte && new Date(bloqueadoAte).getTime() > agora);
        return {
          userId: user.id,
          email: user.email || perfil?.nome || "sem-email",
          nome: perfil?.nome || user.email || "Usuario",
          perfil: perfil?.perfil || "consulta",
          gerenteNome: perfil?.gerente_nome || "",
          rotasPermitidas: perfil?.rotas_permitidas || [],
          loginNome: perfil?.login_nome || "",
          emailTemporario: Boolean(perfil?.email_temporario),
          emailTemporarioExpiraEm: perfil?.email_temporario_expira_em || "",
          criadoEm: user.created_at || perfil?.criado_em || "",
          ultimoAcesso: user.last_sign_in_at || "",
          bloqueado,
          bloqueadoAte,
          status: bloqueado ? "bloqueado" : "ativo",
        };
      }).sort((a, b) => String(a.email).localeCompare(String(b.email)));

      return resposta({ usuarios });
    }

    if (action === "criar") {
      const email = String(body.email || "").trim().toLowerCase();
      const loginNome = String(body.loginNome || "").trim().toLowerCase();
      const senha = String(body.senha || "");
      const perfilNovo = String(body.perfil || "consulta");
      const gerenteNome = String(body.gerenteNome || "").trim();
      const rotasPermitidas = Array.isArray(body.rotasPermitidas) ? body.rotasPermitidas.map((r) => String(r || "").trim()).filter(Boolean) : [];
      const emailTemporario = Boolean(body.emailTemporario);

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return resposta({ error: "Informe um e-mail verdadeiro." }, 400);
      if (!/^[a-z0-9._-]{3,30}$/.test(loginNome)) return resposta({ error: "Informe um login com 3 a 30 caracteres. Use letras, numeros, ponto, traco ou underline." }, 400);
      if (senha.length < 10) return resposta({ error: "A senha precisa ter ao menos 10 caracteres." }, 400);
      if (!["administrador", "operador", "gerente", "consulta"].includes(perfilNovo)) return resposta({ error: "Perfil invalido." }, 400);
      if (perfilNovo === "gerente" && !gerenteNome) return resposta({ error: "Informe o gerente vinculado a este login." }, 400);

      const { data: criado, error: createError } = await admin.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
        user_metadata: { name: email },
      });
      if (createError) return resposta({ error: createError.message }, 400);
      if (!criado.user) return resposta({ error: "Usuario criado nao retornou identificacao." }, 500);

      const expiraEm = null;
      const { error: perfilError } = await admin
        .from("perfis")
        .upsert({
          user_id: criado.user.id,
          nome: email,
          login_nome: loginNome,
          perfil: perfilNovo,
          gerente_nome: perfilNovo === "gerente" ? gerenteNome : "",
          rotas_permitidas: perfilNovo === "gerente" ? rotasPermitidas : [],
          email_temporario: emailTemporario,
          email_temporario_expira_em: expiraEm,
        }, { onConflict: "user_id" });
      if (perfilError) {
        await admin.auth.admin.deleteUser(criado.user.id);
        const dica = erroPerfilGerente(perfilError.message);
        if (String(perfilError.message || "").toLowerCase().includes("duplicate")) return resposta({ error: "Este login de entrada ja esta em uso. Escolha outro." }, 400);
        return resposta({ error: dica || `Login nao foi criado porque o perfil nao pode ser salvo: ${perfilError.message}` }, 400);
      }

      return resposta({ ok: true, userId: criado.user.id, mensagem: "Novo login criado com sucesso." });
    }

    const userId = String(body.userId || "");
    if (!userId) return resposta({ error: "Usuario nao informado." }, 400);

    if (action === "bloquear" || action === "desbloquear") {
      if (userId === usuarioAtual.id && action === "bloquear") return resposta({ error: "Voce nao pode bloquear o proprio administrador logado." }, 400);
      const { error } = await admin.auth.admin.updateUserById(userId, {
        ban_duration: action === "bloquear" ? "876000h" : "none",
      });
      if (error) return resposta({ error: error.message }, 400);
      return resposta({ ok: true, mensagem: action === "bloquear" ? "Login bloqueado." : "Login desbloqueado." });
    }

    if (action === "excluir") {
      if (!master) return resposta({ error: "Somente o administrador master pode excluir acessos." }, 403);
      if (userId === usuarioAtual.id) return resposta({ error: "Voce nao pode excluir o proprio administrador master logado." }, 400);

      const { data: perfilAlvo } = await admin
        .from("perfis")
        .select("nome,perfil")
        .eq("user_id", userId)
        .maybeSingle();

      const { error: authDeleteError } = await admin.auth.admin.deleteUser(userId);
      if (authDeleteError) return resposta({ error: authDeleteError.message }, 400);

      const { error: perfilError } = await admin.from("perfis").delete().eq("user_id", userId);
      if (perfilError) return resposta({ error: `Login excluido, mas o perfil nao foi removido: ${perfilError.message}` }, 500);

      return resposta({ ok: true, mensagem: `Acesso ${perfilAlvo?.nome || userId} excluido com sucesso.` });
    }

    if (action === "perfil") {
      const perfil = String(body.perfil || "");
      const gerenteNome = String(body.gerenteNome || "").trim();
      const rotasPermitidas = Array.isArray(body.rotasPermitidas) ? body.rotasPermitidas.map((r) => String(r || "").trim()).filter(Boolean) : [];
      if (!["administrador", "operador", "gerente", "consulta"].includes(perfil)) return resposta({ error: "Perfil invalido." }, 400);
      if (perfil === "gerente" && !gerenteNome) return resposta({ error: "Informe o gerente vinculado a este login." }, 400);
      const { error } = await admin.from("perfis").update({ perfil, gerente_nome: perfil === "gerente" ? gerenteNome : "", rotas_permitidas: perfil === "gerente" ? rotasPermitidas : [] }).eq("user_id", userId);
      if (error) return resposta({ error: erroPerfilGerente(error.message) || error.message }, 400);
      return resposta({ ok: true, mensagem: "Perfil atualizado." });
    }

    if (action === "redefinir") {
      const email = String(body.novoEmail || "").trim().toLowerCase();
      const loginNome = String(body.loginNome || "").trim().toLowerCase();
      const senha = String(body.novaSenha || "");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return resposta({ error: "Informe um e-mail verdadeiro." }, 400);
      if (!/^[a-z0-9._-]{3,30}$/.test(loginNome)) return resposta({ error: "Informe um login com 3 a 30 caracteres. Use letras, numeros, ponto, traco ou underline." }, 400);
      if (senha.length < 10) return resposta({ error: "A senha precisa ter ao menos 10 caracteres." }, 400);

      const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
        email,
        password: senha,
        email_confirm: true,
      });
      if (updateError) return resposta({ error: updateError.message }, 400);

      const { error: profileError } = await admin
        .from("perfis")
        .update({ nome: email, login_nome: loginNome, email_temporario: false, email_temporario_expira_em: null })
        .eq("user_id", userId);
      if (profileError) {
        if (String(profileError.message || "").toLowerCase().includes("duplicate")) return resposta({ error: "Este login de entrada ja esta em uso. Escolha outro." }, 400);
        return resposta({ error: "Login atualizado, mas nao foi possivel atualizar o perfil." }, 500);
      }
      return resposta({ ok: true, mensagem: "Login, e-mail e senha atualizados." });
    }

    return resposta({ error: "Acao nao reconhecida." }, 400);
  } catch (error) {
    return resposta({ error: error instanceof Error ? error.message : "Erro interno na funcao gerenciar-logins." }, 500);
  }
});
