import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = path.join(ROOT, "supabase", "migrations");
const BASELINE = "202606130800_legacy_schema_baseline.sql";

test("baseline legado precede todo o historico versionado e nao contem DML operacional", async () => {
  const migrations = (await readdir(MIGRATIONS)).filter((name) => name.endsWith(".sql")).sort();
  assert.equal(migrations[0], BASELINE);

  const sql = await readFile(path.join(MIGRATIONS, BASELINE), "utf8");
  assert.match(sql, /create function public\.perfil_atual\(\)/i);
  assert.match(sql, /create function public\.gerente_atual\(\)/i);
  assert.match(sql, /create table if not exists public\.equipamentos/i);
  assert.match(sql, /create table if not exists public\.pontos/i);
  assert.doesNotMatch(sql, /insert\s+into\s+public\.(equipamentos|pontos|historico_|despesas_|mensagens_)/i);
});

test("migration que privatiza helpers encontra o contrato criado pela baseline", async () => {
  const baseline = await readFile(path.join(MIGRATIONS, BASELINE), "utf8");
  const privatization = await readFile(path.join(MIGRATIONS, "202606211630_private_rls_helpers.sql"), "utf8");

  for (const helper of ["perfil_atual", "gerente_atual"]) {
    assert.match(baseline, new RegExp(`function public\\.${helper}\\(\\)`, "i"));
    assert.match(privatization, new RegExp(`alter function public\\.${helper}\\(\\) set schema private`, "i"));
  }
});
