import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  PATRIMONIO_GENERIC_MESSAGE,
  PATRIMONIO_STATES,
  parsePatrimonioRoute,
  patrimonioViewModel,
  resolvePatrimonioWithClient,
} from "./patrimonioDeepLink.js";

const root = new URL("../", import.meta.url);
const publicId = "AbCdEf0123456789_-WXYZ";

function read(path) {
  return fs.readFileSync(new URL(path, root), "utf8");
}

function row(state = "disponivel") {
  return {
    public_id: publicId,
    codigo: "PAT-2026-000001",
    situacao: state,
    origem: "campanha",
    equipamento_id: state === "disponivel" ? null : 42,
    equipamento_nome: state === "disponivel" ? null : "Terminal 042",
    equipamento_categoria: state === "disponivel" ? null : "Terminal",
    equipamento_status: state === "disponivel" ? null : "Em uso",
    equipamento_localizacao: state === "disponivel" ? null : "Ponto Vale Azul",
    lote_codigo: "LOT-2026-0001",
  };
}

test("rota patrimonial aceita somente o token opaco URL-safe de 22 caracteres", () => {
  const route = parsePatrimonioRoute(`/patrimonio/${publicId}`);
  assert.deepEqual(route, {
    kind: "patrimonio",
    pathname: `/patrimonio/${publicId}`,
    publicId,
    valid: true,
  });
  assert.equal(parsePatrimonioRoute(`/patrimonio/${publicId}/`)?.valid, true);
  assert.equal(parsePatrimonioRoute("/patrimonio/curto")?.valid, false);
  assert.equal(parsePatrimonioRoute(`/patrimonio/${publicId}/extra`)?.valid, false);
  assert.equal(parsePatrimonioRoute("/equipamentos"), null);
});

test("pré-login preserva destino sem revelar existência ou estado", () => {
  const route = parsePatrimonioRoute(`/patrimonio/${publicId}`);
  const view = patrimonioViewModel({ authenticated: false, route, record: row("conferido") });
  assert.deepEqual(view, {
    kind: "login",
    disclosure: false,
    preserveDestination: true,
    message: "Entre para continuar ao destino protegido.",
  });
  assert.doesNotMatch(view.message, /PAT-|conferido|equipamento/i);
});

test("resolver usa apenas RPC autenticada e normaliza todos os estados do contrato", async () => {
  for (const state of Object.keys(PATRIMONIO_STATES)) {
    const calls = [];
    const client = {
      rpc: async (name, args) => {
        calls.push({ name, args });
        return { data: [row(state)], error: null };
      },
    };
    const result = await resolvePatrimonioWithClient(client, publicId);
    assert.deepEqual(calls, [{
      name: "patrimonio_resolver_public_id",
      args: { p_public_id: publicId },
    }]);
    assert.equal(result.publicId, publicId);
    assert.equal(result.state, state);
    assert.equal(result.code, "PAT-2026-000001");
  }
});

test("token inválido não consulta backend e indisponibilidade falha fechada", async () => {
  let calls = 0;
  const client = { rpc: async () => { calls += 1; return { data: [], error: null }; } };
  assert.equal(await resolvePatrimonioWithClient(client, "invalido"), null);
  assert.equal(calls, 0);

  await assert.rejects(
    resolvePatrimonioWithClient({ rpc: async () => ({ data: null, error: { code: "42883" } }) }, publicId),
    (error) => error.code === "PATRIMONIO_LOOKUP_UNAVAILABLE" && !error.message.includes(publicId),
  );
});

test("inexistente, fora do escopo e token inválido recebem a mesma resposta neutra", async () => {
  const validRoute = parsePatrimonioRoute(`/patrimonio/${publicId}`);
  const invalidRoute = parsePatrimonioRoute("/patrimonio/invalido");
  const emptyResult = await resolvePatrimonioWithClient({
    rpc: async () => ({ data: [], error: null }),
  }, publicId);
  assert.equal(emptyResult, null);

  const outsideScope = patrimonioViewModel({ authenticated: true, route: validRoute, record: emptyResult });
  const invalid = patrimonioViewModel({ authenticated: true, route: invalidRoute, record: null });
  assert.equal(outsideScope.kind, "unavailable");
  assert.equal(invalid.kind, "unavailable");
  assert.equal(outsideScope.message, PATRIMONIO_GENERIC_MESSAGE);
  assert.equal(invalid.message, PATRIMONIO_GENERIC_MESSAGE);
});

test("ativação disponível respeita perfil e nunca libera catálogo global", () => {
  const route = parsePatrimonioRoute(`/patrimonio/${publicId}`);
  const record = {
    publicId,
    code: "PAT-2026-000001",
    state: "disponivel",
  };

  for (const role of ["administrador", "operador"]) {
    const view = patrimonioViewModel({ authenticated: true, route, record, role });
    assert.equal(view.kind, "resolved");
    assert.equal(view.canActivate, true);
    assert.equal(view.activationDenied, false);
    assert.equal(view.canSeeGlobalCatalog, false);
  }

  for (const role of ["gerente", "consulta", ""]) {
    const view = patrimonioViewModel({ authenticated: true, route, record, role });
    assert.equal(view.kind, "resolved");
    assert.equal(view.canActivate, false);
    assert.equal(view.activationDenied, true);
    assert.equal(view.canSeeGlobalCatalog, false);
  }
});

test("App integra a rota antes do Sistema e o login não interpola o identificador", () => {
  const app = read("src/App.jsx");
  const login = app.slice(app.indexOf("function TelaLogin"), app.indexOf("function ModalAlterarSenha"));
  const appRoot = app.slice(app.indexOf("export default function App"), app.indexOf("function Sistema"));

  assert.match(app, /import PatrimonioDeepLinkPage from "\.\/PatrimonioDeepLinkPage\.jsx"/);
  assert.match(app, /import \{ parsePatrimonioRoute \} from "\.\/patrimonioDeepLink\.js"/);
  assert.match(login, /Após entrar, você continuará para o destino protegido solicitado\./);
  assert.doesNotMatch(login, /publicId|route\.public|PAT-/);
  assert.ok(appRoot.indexOf("if(!logado)") < appRoot.indexOf("if(rotaPatrimonio)"));
  assert.ok(appRoot.indexOf("if(rotaPatrimonio)") < appRoot.indexOf("return<Sistema"));
  assert.match(appRoot, /addEventListener\("popstate",atualizarRota\)/);
});

test("refresh direto, URL copiada e PWA preservam a rota sem interceptar mutações", () => {
  const config = JSON.parse(read("vercel.json"));
  const worker = read("public/sw.js");
  const manifest = JSON.parse(read("public/manifest.webmanifest"));
  const page = read("src/PatrimonioDeepLinkPage.jsx");

  assert.ok(config.rewrites.some((route) => route.source === "/patrimonio/:publicId" && route.destination === "/index.html"));
  assert.ok(config.rewrites.some((route) => route.source === "/patrimonio" && route.destination === "/index.html"));
  assert.match(worker, /event\.request\.method !== 'GET'/);
  assert.match(worker, /event\.request\.mode === 'navigate'[\s\S]*networkFirst\(event\.request, '\/'\)/);
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.start_url, "/");
  assert.match(page, /<a href="\/\?modulo=equipamentos">Voltar ao sistema<\/a>/);
  assert.match(page, /<button type="button" disabled/);
  assert.doesNotMatch(page, /patrimonio_(?:vincular|aplicar|conferir|anular|baixar)/);
  assert.doesNotMatch(page, /localStorage|sessionStorage/);
});
