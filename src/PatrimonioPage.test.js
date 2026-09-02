import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("./PatrimonioPage.jsx", import.meta.url), "utf8");
const db = readFileSync(new URL("./db.js", import.meta.url), "utf8");
const app = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");

test("integra Patrimônio como subárea de Equipamentos", () => {
  assert.match(app, /\{id:"patrimonio",label:"Patrimônio",icone:"tag"\}/);
  assert.match(app, /abaEquip==="patrimonio"/);
  assert.match(app, /<PatrimonioPage [^>]*perfilAtual=\{perfilAtual\}/);
});

test("carrega somente fontes patrimoniais de leitura", () => {
  for (const source of [
    "equipamento_categorias",
    "patrimonio_campanhas_resumo_v",
    "patrimonio_lotes_resumo_v",
    "patrimonio_operacional_v",
    "patrimonio_eventos",
  ]) assert.match(db, new RegExp(`from\\('${source}'\\)\\.select`));
  assert.doesNotMatch(db.slice(db.indexOf("carregarPatrimonioLeitura"), db.indexOf("export async function carregarEquipamentos")), /\.insert\(|\.update\(|\.delete\(|\.rpc\(/);
});

test("mantém mutações patrimoniais fechadas e estado vazio contextual", () => {
  assert.match(page, /const MUTATIONS_ENABLED = false/);
  assert.match(page, /Patrimônio ainda não iniciado\./);
  assert.match(page, /A estrutura está pronta\. A implantação começa quando uma campanha for criada\./);
  assert.match(page, /disabled=\{!MUTATIONS_ENABLED\}/);
  assert.doesNotMatch(page, /\.rpc\(|nextval|fixtures/i);
});

test("preview do componente real é DEV-only e não consulta produção", () => {
  const preview = readFileSync(new URL("./patrimonio-real-preview/main.jsx", import.meta.url), "utf8");
  assert.match(preview, /if \(import\.meta\.env\.DEV\)/);
  assert.match(preview, /loadData=\{loadEmpty\}/);
  assert.doesNotMatch(preview, /supabase|\.rpc\(|\.insert\(|\.update\(|\.delete\(/i);
});
