import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const read = (file) => readFile(path.join(CURRENT_DIR, file), "utf8");

test("preview de Equipamentos usa o ledger verdadeiro e permanece isolado de infraestrutura", async () => {
  const source = await read("EquipamentosPreviewApp.jsx");

  assert.match(source, /from "\.\/EquipmentInventoryLedger\.jsx"/);
  assert.match(source, /<EquipmentInventoryLedger/);
  for (const forbidden of [
    "./App.jsx",
    "./db.js",
    "./supabase.js",
    "./monitoring.js",
    "@sentry",
    "@supabase",
    "fetch(",
    "localStorage",
    "sessionStorage",
    "serviceWorker",
  ]) {
    assert.equal(source.includes(forbidden), false, `preview encostou em recurso proibido: ${forbidden}`);
  }
  assert.match(source, /data-preview-mode="safe-local"/);
  assert.match(source, /nenhum backend conectado/i);
  assert.match(source, /nenhum dado foi alterado/i);
});

test("fixture local usa contrato real, nomes próprios e paginação produtiva de 12", async () => {
  const source = await read("EquipamentosPreviewApp.jsx");
  const itemIds = [...source.matchAll(/id: "eq-local-\d+"/g)];

  assert.equal(itemIds.length, 16);
  assert.match(source, /const PAGE_SIZE = 12/);
  for (const field of ["nome", "categoria", "status", "localizacao", "responsavel", "patrimonio", "gerenteResponsavel", "transferenciaStatus"]) {
    assert.match(source, new RegExp(`${field}:`));
  }
  for (const status of ["Disponível", "Em rota", "Em conserto"]) assert.match(source, new RegExp(status));
  for (const transfer of ["aguardando_confirmacao", "recebido"]) assert.match(source, new RegExp(transfer));
  for (const category of ["Televisões", "Terminais", "Impressoras", "Tablets", "Carregadores", "Máquina de Brindes", "Totens", "Noteiro", "PDV Touchscreen"]) {
    assert.match(source, new RegExp(category));
  }
  assert.match(source, /Ponto Vila Serena/);
  assert.doesNotMatch(source, /Ponto Alameda|Ana Ribeiro|Caio Nobre/);
});

test("preview expõe temas, rota, filtros, posições, ações e navegação acessível", async () => {
  const source = await read("EquipamentosPreviewApp.jsx");
  const main = await read("main.jsx");

  assert.match(source, /data-preview-route="\/equipamentos"/);
  assert.match(source, /\?preview=equipamentos&tema=claro/);
  assert.match(source, /\?preview=equipamentos&tema=escuro/);
  assert.match(source, /useResponsiveSheet\(\{/);
  assert.match(source, /mediaQuery: "\(max-width: 1320px\)"/);
  assert.match(source, /onKeyDown=\{handleMainScrollKey\}/);
  for (const marker of ["Estoque interno", "Em pontos", "Com gerentes", "Conserto", "Lista", "Resumo", "Rastro"]) {
    assert.match(source, new RegExp(marker));
  }
  for (const action of ["Excel", "PDF", "Novo equipamento", "Movimentar", "Ficha consultada", "Edição aberta", "Exclusão revisada"]) {
    assert.match(source, new RegExp(action));
  }
  assert.match(main, /import\.meta\.env\.DEV && parametros\.get\("preview"\) === "equipamentos"/);
  assert.match(main, /import\("\.\/EquipamentosPreviewApp\.jsx"\)/);
  assert.match(main, /previewEquipamentos \? iniciarPreviewEquipamentos\(\)/);
});
