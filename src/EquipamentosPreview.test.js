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
  assert.match(source, /command-flow-shell module-itens equipment-preview/);
  assert.match(source, /className="equip-cf-export-utility"/);
  assert.match(source, /\.equipment-preview__actions \.equip-cf-export-utility/);
  assert.match(source, /\?preview=equipamentos&tema=claro/);
  assert.match(source, /\?preview=equipamentos&tema=escuro/);
  assert.match(source, /useResponsiveSheet\(\{/);
  assert.match(source, /mediaQuery: "\(max-width: 1320px\)"/);
  assert.match(source, /onKeyDown=\{handleMainScrollKey\}/);
  for (const marker of ["Estoque interno", "Em pontos", "Com gerentes", "Conserto", "Lista", "Resumo por situação", "Movimentações"]) {
    assert.match(source, new RegExp(marker));
  }
  for (const action of ["Excel", "PDF", "Novo equipamento", "Movimentar", "Ficha consultada", "Edição aberta", "Exclusão revisada"]) {
    assert.match(source, new RegExp(action));
  }
  assert.match(main, /import\.meta\.env\.DEV && parametros\.get\("preview"\) === "equipamentos"/);
  assert.match(main, /import\("\.\/EquipamentosPreviewApp\.jsx"\)/);
  assert.match(main, /previewEquipamentos \? iniciarPreviewEquipamentos\(\)/);
});

test("preview cobre autoria nova, legado sem autor, recebimento e histórico longo", async () => {
  const source = await read("EquipamentosPreviewApp.jsx");

  assert.match(source, /Enviado para gerente: Alex/);
  assert.match(source, /executadoPorNomeSnapshot: "Anderson Costa"/);
  assert.match(source, /executadoPorPerfilSnapshot: "administrador"/);
  assert.match(source, /Autor não registrado/);
  assert.match(source, /tipo: "recebimento_gerente"[\s\S]*?executadoPorPerfilSnapshot: "gerente"/);
  assert.ok([...source.matchAll(/itemId: "eq-local-806"/g)].length >= 7, "fixture precisa forçar scroll no dossiê");
});

test("desktop abre inspector flutuante somente após seleção e mantém sheets responsivos", async () => {
  const preview = await read("EquipamentosPreviewApp.jsx");
  const ledger = await read("EquipmentInventoryLedger.jsx");
  const css = await read("EquipmentInventoryLedger.css");
  const app = await read("App.jsx");

  assert.match(ledger, /const inspectorOpen = Boolean\(dossierOpen && selectedRow\)/);
  assert.match(ledger, /\{inspectorOpen \? <aside/);
  assert.doesNotMatch(ledger, /Selecione um equipamento/);
  assert.match(css, /@media \(min-width: 1321px\)[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(css, /@media \(min-width: 1321px\)[\s\S]*?position:\s*fixed;[\s\S]*?overflow-y:\s*auto/);
  assert.match(css, /equipment-ledger-inspector-in var\(--motion-emphasized, 220ms\)/);
  assert.match(css, /@media \(max-width: 1320px\)[\s\S]*?equipment-inventory-ledger__backdrop/);
  assert.match(preview, /setDossierOpen\(true\)/);
  assert.match(app, /setEquipamentoFocoId\(null\)/);
  assert.match(app, /if\(evento\.key!=="Escape"\)return/);
});

test("ação Movimentar usa transferência clara sem alterar ícones de posição ou histórico", async () => {
  const preview = await read("EquipamentosPreviewApp.jsx");
  const ledger = await read("EquipmentInventoryLedger.jsx");
  const css = await read("EquipmentInventoryLedger.css");
  const app = await read("App.jsx");
  const operations = await read("components/operations/OperationsUI.jsx");

  assert.match(operations, /transfer:\s*<>[\s\S]*?M5 8h14[\s\S]*?M19 16H5/);
  assert.match(app, /label:"Movimentar",icon:"transfer",purpose:"move",onClick:\(\)=>abrirMov\(item\)/);
  assert.match(preview, /icon: repair \? "wrench" : pending \? "check" : "transfer"/);
  assert.match(ledger, /primaryAction\.purpose === "move" && "is-transfer"/);
  assert.match(css, /button\.is-transfer:hover:not\(:disabled\)[\s\S]*?var\(--equipment-transfer-surface\)/);
  assert.match(css, /button\.is-transfer:focus-visible:not\(:disabled\)[\s\S]*?outline: 2px solid var\(--equipment-transfer\)/);
  assert.match(css, /\.is-primary\.is-transfer[\s\S]*?background: var\(--equipment-transfer\)/);
  assert.match(preview, /icon: "route"/);
  assert.match(app, /icon:"route"/);
});
