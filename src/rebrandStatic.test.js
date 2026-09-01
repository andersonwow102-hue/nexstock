import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import crypto from "node:crypto";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const raiz = new URL("../", import.meta.url);

function arquivo(caminho) {
  return new URL(caminho, raiz);
}

function ler(caminho) {
  return fs.readFileSync(arquivo(caminho), "utf8");
}

function lerJson(caminho) {
  return JSON.parse(ler(caminho));
}

function sha256(caminho) {
  return crypto.createHash("sha256").update(fs.readFileSync(arquivo(caminho))).digest("hex").toUpperCase();
}

function dimensoesPng(caminho) {
  const conteudo = fs.readFileSync(arquivo(caminho));
  const assinatura = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(conteudo.subarray(0, 8).equals(assinatura), `${caminho} precisa ser um PNG válido`);
  assert.equal(conteudo.subarray(12, 16).toString("ascii"), "IHDR", `${caminho} não possui IHDR na posição esperada`);
  return [conteudo.readUInt32BE(16), conteudo.readUInt32BE(20)];
}

function assertSemMarcaLegadaVisivel(caminho, identificadoresPermitidos = []) {
  let conteudo = ler(caminho);
  for (const identificador of identificadoresPermitidos) {
    conteudo = conteudo.split(identificador).join("");
  }
  const residuos = conteudo
    .split(/\r?\n/)
    .map((linha, indice) => ({ linha: indice + 1, texto: linha.trim() }))
    .filter(({ texto }) => /stock(?:-|_|\s)?on/i.test(texto));
  assert.deepEqual(residuos, [], `${caminho} ainda contém identidade Stock-On não classificada`);
}

test("masters NEPTERA copiados preservam bytes e dimensões oficiais", () => {
  const masters = [
    ["public/brand/neptera/neptera-logo-vertical.png", 1230, 1278, "57CDE987C9FE451D76E60471C18771CD8F0D87BD5340C9681113750BA76D8788"],
    ["public/brand/neptera/neptera-logo-horizontal-dark.png", 2172, 724, "8CA6FE5972F41A4FF5914DE6DF1030ED3C7FF660989693621F1470305632EB4A"],
    ["public/brand/neptera/neptera-logo-horizontal-light.png", 1915, 821, "48AA7DD0657D12BADA9232A3E1044412A3CAEF4A59CA98C9A179D41BC0F69F4B"],
    ["public/brand/neptera/neptera-symbol.png", 1254, 1254, "D27204E927A8522D800C02022466B38EB539AE6A165C3C1ED6AF700EB5327AC4"],
    ["public/brand/neptera/neptera-symbol-light.png", 1254, 1254, "7CEDD994C0CBFE19BFEE24CCC8A1BD4E0BB907999CC0F58055AE5A9B07118409"],
    ["public/brand/neptera/neptera-app-icon.png", 1254, 1254, "8A72E2E80961E4243FD29DAFB61AE88E51E2F5FE7659A2258B31AA99FA35F61C"],
    ["public/brand/neptera/neptera-splash.png", 1024, 1536, "A2AC179E68E8E119C42494678800392BDD62D6FEA963C609B2E26CE291D206AB"],
  ];

  for (const [caminho, largura, altura, hash] of masters) {
    assert.ok(fs.existsSync(arquivo(caminho)), `master ausente: ${caminho}`);
    assert.deepEqual(dimensoesPng(caminho), [largura, altura], `dimensão alterada: ${caminho}`);
    assert.equal(sha256(caminho), hash, `master oficial foi recomprimido ou modificado: ${caminho}`);
  }
});

test("derivados web possuem nomes previsíveis e dimensões exatas", () => {
  const derivados = [
    ["public/brand/neptera/icons/neptera-favicon-16.png", 16],
    ["public/brand/neptera/icons/neptera-favicon-32.png", 32],
    ["public/brand/neptera/icons/neptera-favicon-48.png", 48],
    ["public/brand/neptera/icons/neptera-apple-touch-icon-180.png", 180],
    ["public/brand/neptera/icons/neptera-app-icon-192.png", 192],
    ["public/brand/neptera/icons/neptera-app-icon-512.png", 512],
    ["public/brand/neptera/icons/neptera-app-icon-maskable-512.png", 512],
  ];

  for (const [caminho, tamanho] of derivados) {
    assert.ok(fs.existsSync(arquivo(caminho)), `derivado ausente: ${caminho}`);
    assert.deepEqual(dimensoesPng(caminho), [tamanho, tamanho], `dimensão incorreta: ${caminho}`);
  }
});

test("metadata do navegador expõe apenas a identidade pública NEPTERA", () => {
  const index = ler("index.html");
  assert.match(index, /<title>NEPTERA<\/title>/);
  assert.match(index, /name="apple-mobile-web-app-title"\s+content="NEPTERA"/);
  assert.match(index, /name="description"\s+content="(?:NEPTERA\s*[-—•]\s*)?Plataforma Operacional Integrada"/);
  for (const [tamanho, nome] of [[16, "neptera-favicon-16.png"], [32, "neptera-favicon-32.png"], [48, "neptera-favicon-48.png"]]) {
    const link = new RegExp(`<link(?=[^>]*rel="(?:shortcut )?icon")(?=[^>]*sizes="${tamanho}x${tamanho}")(?=[^>]*href="/brand/neptera/icons/${nome}")[^>]*>`);
    assert.match(index, link, `favicon ${tamanho}x${tamanho} ausente no index`);
  }
  assert.match(index, /<link(?=[^>]*rel="apple-touch-icon")(?=[^>]*sizes="180x180")(?=[^>]*href="\/brand\/neptera\/icons\/neptera-apple-touch-icon-180\.png")[^>]*>/);
  assertSemMarcaLegadaVisivel("index.html");
});

test("manifest e service worker publicam somente os ícones NEPTERA", () => {
  const manifest = lerJson("public/manifest.webmanifest");
  assert.equal(manifest.name, "NEPTERA");
  assert.equal(manifest.short_name, "NEPTERA");
  assert.equal(manifest.description, "Plataforma Operacional Integrada");
  assert.ok(/^#[0-9a-f]{6}$/i.test(manifest.theme_color));
  assert.ok(/^#[0-9a-f]{6}$/i.test(manifest.background_color));

  const esperados = [
    ["192x192", "any", "/brand/neptera/icons/neptera-app-icon-192.png"],
    ["512x512", "any", "/brand/neptera/icons/neptera-app-icon-512.png"],
    ["512x512", "maskable", "/brand/neptera/icons/neptera-app-icon-maskable-512.png"],
  ];
  for (const [sizes, purpose, src] of esperados) {
    assert.ok(manifest.icons.some((icone) => icone.sizes === sizes && icone.purpose === purpose && icone.src === src), `ícone ausente no manifest: ${src}`);
  }
  assertSemMarcaLegadaVisivel("public/manifest.webmanifest");

  const serviceWorker = ler("public/sw.js");
  assert.match(serviceWorker, /neptera/i);
  for (const [, , src] of esperados) assert.ok(serviceWorker.includes(src), `asset fora do precache: ${src}`);
  assert.doesNotMatch(serviceWorker, /\/icons\/stock-on-(?:192|512|maskable-512)\.png/i);
});

test("login, shell, loading e notificações usam a hierarquia pública NEPTERA", () => {
  const app = ler("src/App.jsx");
  const main = ler("src/main.jsx");
  for (const texto of ["NEPTERA", "Plataforma Operacional Integrada", "by Anderion Labs"]) {
    assert.ok(app.includes(texto), `App não apresenta: ${texto}`);
  }
  assert.match(app, /alt="NEPTERA"/);
  assert.match(app, /new Notification\([\s\S]{0,100}NEPTERA/);
  assert.match(app, /iconeNotificacao:\s*"\/brand\/neptera\/icons\/neptera-app-icon-192\.png"/);
  assert.match(app, /icon:\s*NEPTERA\.iconeNotificacao/);
  assert.match(app, /simboloCompacto:\s*"\/brand\/neptera\/icons\/neptera-favicon-48\.png"/);
  assert.doesNotMatch(app, /\.\/assets\/stock-on-(?:dark|light)\.png/);

  const login = app.slice(app.indexOf("function MarcaLogin"), app.indexOf("function ModalAlterarSenha"));
  assert.doesNotMatch(login, /Comando operacional integrado|Identidade e produto por/);
  for (const emoji of ["🔒", "✅", "👁️", "🙈"]) {
    assert.ok(!login.includes(emoji), `login rebrandizado ainda usa emoji como iconografia: ${emoji}`);
  }
  assert.match(login, /<Icon name=\{visivel\?"eyeOff":"eye"\}\/>/);

  const sidebar = app.slice(app.indexOf('<aside aria-hidden={drawerContextual'), app.indexOf('<main className="main">'));
  assert.match(sidebar, /src=\{NEPTERA\.simboloCompacto\}/);
  assert.match(sidebar, /className="sidebar-brand-name">\{NEPTERA\.nome\}/);
  assert.doesNotMatch(sidebar, /NEPTERA\.logoHorizontal/, "sidebar compacta não deve carregar o lockup horizontal completo");
  assert.match(main, /NEPTERA/);
  assertSemMarcaLegadaVisivel("src/main.jsx");
});

test("PDFs e arquivos exportados recebem o nome público NEPTERA", () => {
  const pdf = ler("src/pdfReports.js");
  assert.match(pdf, /\/brand\/neptera\/neptera-(?:logo[^"']*|symbol)\.png/i);
  assert.match(pdf, /doc\.text\("NEPTERA"/);
  assert.match(pdf, /NEPTERA\s*\|\s*Plataforma Operacional Integrada/);
  assertSemMarcaLegadaVisivel("src/pdfReports.js");

  const pontos = ler("src/PointsPage.jsx");
  for (const prefixo of ["neptera_pontos_", "neptera_historico_pontos_", "neptera_historico-despesas_"]) {
    assert.ok(pontos.includes(prefixo), `exportação de Pontos sem prefixo público: ${prefixo}`);
  }
  assertSemMarcaLegadaVisivel("src/PointsPage.jsx");
});

test("Dashboard e Devedores trocam somente a identidade institucional", () => {
  for (const caminho of ["src/DashboardPage.jsx", "src/DevedoresPage.jsx"]) {
    const pagina = ler(caminho);
    assert.match(pagina, /NEPTERA/);
    assert.match(pagina, /aria-controls="stock-on-primary-navigation"/);
    assertSemMarcaLegadaVisivel(caminho, ["stock-on-primary-navigation"]);
  }
});

test("resíduos Stock-On em App ficam limitados às categorias B e C documentadas", () => {
  const categoriaBIdentificadoresTecnicos = [
    "stockon_backup_obrigatorio_",
    "stockon_chat_posicao",
    "stockon_chat_apelido_admin",
    "stockon_aviso_prazo_despesas_",
    "stock-on-chat",
    "stock-on-primary-navigation",
    "(nexstock|stockon)",
    'texto||"stock-on"',
    '||"stock-on";',
  ];
  const categoriaCCompatibilidadeLegada = [
    "/downloads/stock-on.apk",
    "Stock-ON.apk",
    "`stock-on_backup_",
    'sistema:"Stock-ON"',
  ];
  assertSemMarcaLegadaVisivel("src/App.jsx", [
    ...categoriaBIdentificadoresTecnicos,
    ...categoriaCCompatibilidadeLegada,
  ]);
});

test("identificadores Android, login e persistência permanecem compatíveis", () => {
  const twa = lerJson("android/twa-manifest.json");
  assert.equal(twa.packageId, "com.stockon.app");
  assert.equal(twa.name, "NEPTERA");
  assert.equal(twa.launcherName, "NEPTERA");
  assert.equal(twa.appVersionName, "1.0.0");
  assert.equal(twa.signingKey.path, "./stock-on-release.keystore");
  assert.equal(twa.signingKey.alias, "stockon");
  assert.match(twa.iconUrl, /\/brand\/neptera\/icons\/neptera-app-icon-512\.png$/);
  assert.match(twa.maskableIconUrl, /\/brand\/neptera\/icons\/neptera-app-icon-maskable-512\.png$/);

  const gradle = ler("android/app/build.gradle");
  assert.match(gradle, /applicationId:\s*'com\.stockon\.app'/);
  assert.match(gradle, /namespace\s+"com\.stockon\.app"/);
  assert.match(gradle, /applicationId\s+"com\.stockon\.app"/);
  assert.match(gradle, /name:\s*'NEPTERA'/);
  assert.match(gradle, /launcherName:\s*'NEPTERA'/);
  assert.match(ler("android/app/src/main/AndroidManifest.xml"), /package="com\.stockon\.app"/);
  assert.equal(lerJson("android/assetlinks.json")[0].target.package_name, "com.stockon.app");
  assert.equal(lerJson("public/.well-known/assetlinks.json")[0].target.package_name, "com.stockon.app");

  const manifestEmbutido = lerJson("android/app/src/main/res/raw/web_app_manifest.json");
  assert.equal(manifestEmbutido.name, "NEPTERA");
  assert.equal(manifestEmbutido.short_name, "NEPTERA");

  const app = ler("src/App.jsx");
  for (const chave of ["stockon_backup_obrigatorio_", "stockon_chat_posicao", "stockon_chat_apelido_admin", "stockon_aviso_prazo_despesas_"]) {
    assert.ok(app.includes(chave), `chave técnica removida: ${chave}`);
  }
  assert.match(app, /@\(nexstock\|stockon\)\\\.com/);
  assert.match(ler("src/supabase.js"), /stockon_recuperacao_senha/);
  assert.match(ler("src/ManagementPage.jsx"), /@stockon\.com/);
  assert.equal(lerJson("package.json").name, "sistema-stock-on");
});

test("lote de rebranding não altera Supabase nem sua configuração", () => {
  // O contrato dos mappers de leitura pode evoluir em trabalhos posteriores.
  // A proteção permanente do rebranding permanece sobre infraestrutura,
  // migrations e configuração do cliente Supabase.
  const protegidos = ["supabase", "src/supabase.js"];
  const alterados = execFileSync("git", ["status", "--porcelain", "--untracked-files=all", "--", ...protegidos], {
    cwd: arquivo("."),
    encoding: "utf8",
  })
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((linha) => !/supabase\/migrations\/202608311940_equipamentos_historico_autoria\.sql$/.test(linha))
    .filter((linha) => !/supabase\/tests\/equipamentos_historico_autoria\.sql$/.test(linha))
    .join("\n");
  assert.equal(alterados, "", `arquivos protegidos alterados neste lote:\n${alterados}`);

  const db = ler("src/db.js");
  assert.match(db, /\.from\('historico_equipamentos'\)[\s\S]*?\.select\('\*'\)[\s\S]*?\.order\('created_at', \{ ascending: false \}\)[\s\S]*?\.limit\(1000\)/);
  assert.match(db, /\.from\('historico_pontos'\)[\s\S]*?\.select\('\*'\)[\s\S]*?\.order\('created_at', \{ ascending: false \}\)[\s\S]*?\.limit\(500\)/);
});
