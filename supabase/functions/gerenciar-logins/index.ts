import { createClient } from "npm:@supabase/supabase-js@2";

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
    .select("perfil")
    .eq("user_id", authData.user.id)
    .maybeSingle();
  if (perfil?.perfil !== "administrador") return { error: resposta({ error: "Somente administrador pode gerenciar logins." }, 403) };

  return { admin, usuarioAtual: authData.user };
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return resposta({ error: "Metodo nao permitido." }, 405);

    const contexto = await exigirAdmin(req);
    if (contexto.error) return contexto.error;
    const { admin, usuarioAtual } = contexto;
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "listar");

    if (action === "listar") {
      const { data: authUsers, error: authError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (authError) return resposta({ error: authError.message }, 400);

      const { data: perfis, error: perfisError } = await admin
        .from("perfis")
        .select("user_id,nome,perfil,criado_em");
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
      const senha = String(body.senha || "");
      const perfilNovo = String(body.perfil || "consulta");

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return resposta({ error: "Informe um e-mail verdadeiro." }, 400);
      if (/@(nexstock|stockon)\.com$/i.test(email)) return resposta({ error: "Informe um e-mail real que receba mensagens." }, 400);
      if (senha.length < 8) return resposta({ error: "A senha precisa ter ao menos 8 caracteres." }, 400);
      if (!["administrador", "operador", "consulta"].includes(perfilNovo)) return resposta({ error: "Perfil invalido." }, 400);

      const { data: criado, error: createError } = await admin.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
        user_metadata: { name: email },
      });
      if (createError) return resposta({ error: createError.message }, 400);
      if (!criado.user) return resposta({ error: "Usuario criado nao retornou identificacao." }, 500);

      const { error: perfilError } = await admin
        .from("perfis")
        .upsert({ user_id: criado.user.id, nome: email, perfil: perfilNovo }, { onConflict: "user_id" });
      if (perfilError) return resposta({ error: "Login criado, mas nao foi possivel salvar o perfil." }, 500);

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

    if (action === "perfil") {
      const perfil = String(body.perfil || "");
      if (!["administrador", "operador", "consulta"].includes(perfil)) return resposta({ error: "Perfil invalido." }, 400);
      const { error } = await admin.from("perfis").update({ perfil }).eq("user_id", userId);
      if (error) return resposta({ error: error.message }, 400);
      return resposta({ ok: true, mensagem: "Perfil atualizado." });
    }

    if (action === "redefinir") {
      const email = String(body.novoEmail || "").trim().toLowerCase();
      const senha = String(body.novaSenha || "");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return resposta({ error: "Informe um e-mail verdadeiro." }, 400);
      if (/@(nexstock|stockon)\.com$/i.test(email)) return resposta({ error: "Informe um e-mail real que receba mensagens." }, 400);
      if (senha.length < 8) return resposta({ error: "A senha precisa ter ao menos 8 caracteres." }, 400);

      const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
        email,
        password: senha,
        email_confirm: true,
      });
      if (updateError) return resposta({ error: updateError.message }, 400);

      const { error: profileError } = await admin
        .from("perfis")
        .update({ nome: email })
        .eq("user_id", userId);
      if (profileError) return resposta({ error: "Login atualizado, mas nao foi possivel atualizar o perfil." }, 500);
      return resposta({ ok: true, mensagem: "Login, e-mail e senha atualizados." });
    }

    return resposta({ error: "Acao nao reconhecida." }, 400);
  } catch (error) {
    return resposta({ error: error instanceof Error ? error.message : "Erro interno na funcao gerenciar-logins." }, 500);
  }
});
