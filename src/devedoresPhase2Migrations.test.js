import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(projectRoot, "supabase", "migrations");
const files = readdirSync(migrationsDir)
  .filter((name) => /^20260814\d{4}_devedores_fase2_.*\.sql$/.test(name))
  .sort();
const sql = files.map((name) => readFileSync(join(migrationsDir, name), "utf8")).join("\n");

test("fase 2 possui migrations pequenas e ordenadas", () => {
  assert.deepEqual(files, [
    "202608140900_devedores_fase2_estruturas.sql",
    "202608140910_devedores_fase2_calculos.sql",
    "202608140920_devedores_fase2_rls.sql",
    "202608140930_devedores_fase2_rpc_negociacoes.sql",
    "202608140940_devedores_fase2_rpc_pagamentos.sql",
    "202608140950_devedores_fase2_rpc_admin.sql",
    "202608141000_devedores_fase2_grants.sql",
  ]);
});

test("fase 2 permanece isolada das tabelas operacionais", () => {
  assert.doesNotMatch(sql, /references\s+public\.(?!devedores_)/i);
  assert.doesNotMatch(sql, /(?:insert\s+into|update|delete\s+from)\s+public\.(?!devedores_)/i);
  assert.doesNotMatch(sql, /(?:pontos|equipamentos|fechamentos|despesas_mensais|pix_envios)/i);
});

test("escrita financeira ocorre somente por RPC protegida", () => {
  for (const rpc of [
    "devedores_criar_negociacao",
    "devedores_substituir_negociacao",
    "devedores_registrar_pagamento",
    "devedores_estornar_pagamento",
    "devedores_corrigir_negociacao_admin",
  ]) {
    assert.match(sql, new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${rpc}`, "i"));
  }
  assert.match(sql, /security\s+definer/gi);
  assert.match(sql, /private\.devedores_identidade_atual\(\)/gi);
  assert.doesNotMatch(sql, /grant\s+(?:insert|update|delete|all)\s+on\s+table\s+public\.devedores_/i);
  assert.doesNotMatch(sql, /policy[\s\S]{0,120}for\s+(?:insert|update|delete)/i);
});

test("pagamentos e estornos sao append-only, idempotentes e auditados", () => {
  assert.match(sql, /create\s+table\s+public\.devedores_pagamentos\b/i);
  assert.match(sql, /create\s+table\s+public\.devedores_pagamentos_estornos\b/i);
  assert.match(sql, /unique\s*\(registrado_por,\s*idempotencia\)/i);
  assert.match(sql, /unique\s*\(estornado_por,\s*idempotencia\)/i);
  assert.match(sql, /pagamento_id\s+bigint\s+not\s+null\s+unique/i);
  assert.match(sql, /insert\s+into\s+public\.devedores_historico/gi);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.devedores_(?:pagamentos|pagamentos_estornos)/i);
  assert.doesNotMatch(sql, /update\s+public\.devedores_pagamentos\b/i);
});

test("calculos derivados ignoram pagamentos estornados", () => {
  assert.match(sql, /create\s+view\s+public\.devedores_dividas_resumo/i);
  assert.match(sql, /create\s+view\s+public\.devedores_parcelas_resumo/i);
  assert.match(sql, /left\s+join\s+public\.devedores_pagamentos_estornos/gi);
  assert.match(sql, /where\s+e\.id\s+is\s+null/gi);
  assert.match(sql, /'quitada'/i);
  assert.match(sql, /'vencida'/i);
});

test("concorrencia usa locks, versao e idempotencia", () => {
  assert.match(sql, /for\s+update/gi);
  assert.match(sql, /p_versao_esperada/gi);
  assert.match(sql, /errcode\s*=\s*'40001'/gi);
  assert.match(sql, /idempotencia\s+uuid\s+not\s+null/gi);
  assert.match(sql, /uma negociacao ativa|negociacoes_ativa_uidx/i);
  assert.match(sql, /idempotencia_payload\s+jsonb\s+not\s+null/gi);
  assert.match(sql, /reutilizada com dados diferentes/gi);
});

test("consulta e usuarios sem perfil nao recebem escrita", () => {
  assert.match(sql, /p\.perfil\s+in\s*\('operador',\s*'administrador',\s*'consulta'\)/gi);
  assert.doesNotMatch(sql, /v_identidade\.perfil\s+in\s*\([^)]*consulta/i);
  assert.doesNotMatch(sql, /grant\s+execute[^;]+to\s+anon/i);
});

test("valores, datas e vencimentos rejeitam estados nao finitos", () => {
  assert.match(sql, /'NaN'::numeric/gi);
  assert.match(sql, /'Infinity'::numeric/gi);
  assert.match(sql, /isfinite\(/gi);
  assert.match(sql, /America\/Sao_Paulo/gi);
});

test("security definer fixa search_path e revoga execucao publica imediatamente", () => {
  const definers = [...sql.matchAll(/security\s+definer\s+set\s+search_path\s*=\s*([^\n]+)/gi)];
  assert.ok(definers.length >= 8);
  for (const match of definers) assert.match(match[1], /^pg_catalog,\s*public,\s*private,\s*pg_temp/i);
  for (const rpc of [
    "devedores_criar_negociacao",
    "devedores_substituir_negociacao",
    "devedores_registrar_pagamento",
    "devedores_estornar_pagamento",
    "devedores_corrigir_negociacao_admin",
  ]) {
    assert.match(sql, new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${rpc}[^;]+from\\s+public,\\s*anon`, "i"));
  }
});

test("views usam invoker e sequences nao sao expostas", () => {
  assert.equal((sql.match(/with\s*\(security_invoker\s*=\s*true\)/gi) || []).length, 2);
  for (const sequence of ["negociacoes", "parcelas", "pagamentos", "pagamentos_estornos"]) {
    assert.match(sql, new RegExp(`revoke\\s+all\\s+on\\s+sequence\\s+public\\.devedores_${sequence}_id_seq\\s+from\\s+public,\\s*anon,\\s*authenticated`, "i"));
  }
  assert.doesNotMatch(sql, /grant\s+(?:usage|select|update|all)\s+on\s+(?:sequence|all\s+sequences)/i);
});

test("campos internos de idempotencia nao recebem select", () => {
  assert.doesNotMatch(sql, /grant\s+select\s+on\s+table\s+public\.devedores_(?:negociacoes|pagamentos|pagamentos_estornos)/i);
  assert.doesNotMatch(sql, /grant\s+select\s*\([^)]*idempotencia/gi);
});

test("exclusão administrativa é aditiva e auditável", () => {
  const migration = readFileSync(join(migrationsDir, "202608251000_devedores_exclusao_administrativa.sql"), "utf8");
  for (const trecho of ["excluido_em", "motivo_exclusao", "devedores_excluir_administrativamente", "exclusao_administrativa", "security_invoker = true", "devedores_bloquear_registro_excluido"]) {
    assert.match(migration, new RegExp(trecho));
  }
  assert.doesNotMatch(migration, /on delete cascade/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.devedores_/i);
});
