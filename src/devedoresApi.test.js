import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const fonte = readFileSync(new URL("./devedoresApi.js", import.meta.url), "utf8");

test("camada de devedores nao faz escrita direta", () => {
  assert.doesNotMatch(fonte, /\.from\(["']devedores_[^)]*\)[\s\S]{0,180}\.(?:insert|update|delete|upsert)\s*\(/i);
  assert.equal((fonte.match(/supabase\.rpc\(/g) || []).length, 9);
  assert.match(fonte, /devedores_excluir_administrativamente/);
});

test("camada nao referencia modulos operacionais ou segredo administrativo", () => {
  assert.doesNotMatch(fonte, /(?:equipamentos|fechamentos|despesas_mensais|pix_|pontos)/i);
  assert.doesNotMatch(fonte, /service_role|SUPABASE_SERVICE/i);
});

test("consultas usam colunas explicitas e limite de crescimento", () => {
  assert.doesNotMatch(fonte, /\.select\(["']\*["']\)/);
  assert.match(fonte, /LIMITE_SEGURO\s*=\s*1000/);
  assert.match(fonte, /\.limit\(LIMITE_SEGURO\)/);
});
