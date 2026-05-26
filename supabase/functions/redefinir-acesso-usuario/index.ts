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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return resposta({ error: "Metodo nao permitido." }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return resposta({ error: "Acesso nao autenticado." }, 401);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return resposta({ error: "Configuracao segura indisponivel." }, 500);

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const token = authHeader.replace("Bearer ", "");
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return resposta({ error: "Sessao invalida." }, 401);

  const { data: perfil } = await admin
    .from("perfis")
    .select("perfil")
    .eq("user_id", authData.user.id)
    .maybeSingle();
  if (perfil?.perfil !== "administrador") return resposta({ error: "Somente administrador pode redefinir acessos." }, 403);

  const { userId, novoEmail, novaSenha } = await req.json();
  const email = String(novoEmail || "").trim().toLowerCase();
  const senha = String(novaSenha || "");
  if (!userId) return resposta({ error: "Usuario nao informado." }, 400);
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
  if (profileError) return resposta({ error: "Login atualizado, mas nao foi possivel atualizar a exibicao do usuario." }, 500);

  return resposta({ ok: true, email });
});
