import { withSupabase } from "jsr:@supabase/server@^1";

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    try {
      const solicitanteId = ctx.userClaims?.id;

      if (!solicitanteId) {
        return Response.json({ error: "Sessao invalida." }, { status: 401 });
      }

      const { data: perfil, error: erroPerfil } = await ctx.supabaseAdmin
        .from("perfis")
        .select("perfil")
        .eq("user_id", solicitanteId)
        .maybeSingle();

      if (erroPerfil || perfil?.perfil !== "administrador") {
        return Response.json(
          { error: "Somente administrador pode redefinir acessos." },
          { status: 403 }
        );
      }

      const { userId, novoEmail, novaSenha } = await req.json();
      const email = String(novoEmail || "").trim().toLowerCase();
      const senha = String(novaSenha || "");

      if (!userId) {
        return Response.json({ error: "Usuario nao informado." }, { status: 400 });
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return Response.json(
          { error: "Informe um e-mail verdadeiro." },
          { status: 400 }
        );
      }

      if (/@(nexstock|stockon)\.com$/i.test(email)) {
        return Response.json(
          { error: "Informe um e-mail real que receba mensagens." },
          { status: 400 }
        );
      }

      if (senha.length < 10) {
        return Response.json(
          { error: "A senha precisa ter ao menos 10 caracteres." },
          { status: 400 }
        );
      }

      const { error: erroAuth } =
        await ctx.supabaseAdmin.auth.admin.updateUserById(userId, {
          email,
          password: senha,
          email_confirm: true,
        });

      if (erroAuth) {
        return Response.json({ error: erroAuth.message }, { status: 400 });
      }

      const { error: erroNome } = await ctx.supabaseAdmin
        .from("perfis")
        .update({ nome: email })
        .eq("user_id", userId);

      if (erroNome) {
        return Response.json(
          { error: "Login atualizado, mas o nome nao foi atualizado." },
          { status: 500 }
        );
      }

      return Response.json({ ok: true, email });
    } catch {
      return Response.json(
        { error: "Nao foi possivel redefinir o acesso." },
        { status: 500 }
      );
    }
  }),
};
