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

function textoSeguro(value: unknown, limite = 900) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limite);
}

function montarResumo(body: Record<string, unknown>) {
  const erro = (body.erro && typeof body.erro === "object" ? body.erro : {}) as Record<string, unknown>;
  const contexto = (body.contexto && typeof body.contexto === "object" ? body.contexto : {}) as Record<string, unknown>;
  const linhas = [
    "Stock-ON: alerta operacional",
    `Nivel: ${textoSeguro(body.nivel || "erro", 80)}`,
    `Categoria: ${textoSeguro(body.categoria || "frontend", 80)}`,
    `Acao: ${textoSeguro(body.acao || "", 120)}`,
    `Mensagem: ${textoSeguro(body.mensagem || erro.mensagem || "Erro capturado")}`,
    `Erro: ${textoSeguro(erro.nome || "")} ${textoSeguro(erro.mensagem || "")}`.trim(),
    `Tela: ${textoSeguro(contexto.url || "", 160)}`,
    `Horario: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Bahia" })}`,
  ].filter(Boolean);
  return linhas.join("\n");
}

async function enviarEmail(assunto: string, texto: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const destino = Deno.env.get("ALERT_EMAIL_TO");
  if (!apiKey || !destino) return { skipped: true, provider: "email" };

  const from = Deno.env.get("ALERT_EMAIL_FROM") || "Stock-ON <onboarding@resend.dev>";
  const to = destino.split(",").map((item) => item.trim()).filter(Boolean);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject: assunto,
      text: texto,
    }),
  });

  if (!res.ok) return { ok: false, provider: "email", status: res.status, body: await res.text() };
  return { ok: true, provider: "email" };
}

async function enviarWhatsapp(texto: string) {
  const token = Deno.env.get("WHATSAPP_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  const destino = Deno.env.get("ALERT_WHATSAPP_TO");
  if (!token || !phoneNumberId || !destino) return { skipped: true, provider: "whatsapp" };

  const res = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: destino.replace(/\D/g, ""),
      type: "text",
      text: { preview_url: false, body: texto.slice(0, 3500) },
    }),
  });

  if (!res.ok) return { ok: false, provider: "whatsapp", status: res.status, body: await res.text() };
  return { ok: true, provider: "whatsapp" };
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return resposta({ error: "Metodo nao permitido." }, 405);

    const body = await req.json().catch(() => ({}));
    const resumo = montarResumo(body);
    const assunto = `[Stock-ON] ${textoSeguro(body.nivel || "erro", 30)} em ${textoSeguro(body.acao || "operacao", 80)}`;
    const resultados = await Promise.allSettled([
      enviarEmail(assunto, resumo),
      enviarWhatsapp(resumo),
    ]);

    return resposta({
      ok: true,
      resultados: resultados.map((item) => item.status === "fulfilled" ? item.value : { ok: false, error: String(item.reason) }),
    });
  } catch (error) {
    return resposta({ error: error instanceof Error ? error.message : "Falha ao enviar alerta." }, 500);
  }
});
