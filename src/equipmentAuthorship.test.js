import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(CURRENT_DIR, "..");
const readRoot = (file) => readFile(path.join(ROOT, file), "utf8");
const readSrc = (file) => readFile(path.join(CURRENT_DIR, file), "utf8");

test("migration de autoria é aditiva, backend-first e não contém backfill", async () => {
  const migration = await readRoot("supabase/migrations/202608311940_equipamentos_historico_autoria.sql");

  for (const column of [
    "executado_por_user_id",
    "executado_por_nome_snapshot",
    "executado_por_perfil_snapshot",
  ]) assert.match(migration, new RegExp(`add column if not exists ${column}`));

  assert.match(migration, /before insert on public\.historico_equipamentos/i);
  assert.match(migration, /v_user_id uuid := auth\.uid\(\)/i);
  assert.match(migration, /new\.executado_por_user_id := null/i);
  assert.match(migration, /new\.executado_por_user_id := v_user_id/i);
  assert.match(migration, /executado_por_user_id = auth\.uid\(\)/i);
  assert.match(migration, /on delete set null/i);
  assert.doesNotMatch(migration, /update\s+public\.historico_equipamentos/i);
  for (const forbidden of ["origem_tipo", "destino_tipo", "contexto jsonb", "recebedor_nome_snapshot"]) {
    assert.equal(migration.includes(forbidden), false, `migration ampliou escopo com ${forbidden}`);
  }
});

test("teste SQL cobre perfis, falsificação, snapshots, conta removida e legado", async () => {
  const sql = await readRoot("supabase/tests/equipamentos_historico_autoria.sql");

  for (const marker of [
    "Anderson Costa",
    "Operador Local",
    "Alex Gestor",
    "Nome Falsificado",
    "Gerente conseguiu gravar tipo proibido",
    "Exclusao da conta apagou o snapshot historico",
    "Registro legado recebeu autoria inventada",
    "rollback;",
  ]) assert.match(sql, new RegExp(marker));
});

test("frontend consome autoria devolvida pelo backend e não envia executor", async () => {
  const db = await readSrc("db.js");
  const app = await readSrc("App.jsx");

  assert.match(db, /executadoPorUserId: h\.executado_por_user_id \|\| null/);
  assert.match(db, /executadoPorNomeSnapshot: h\.executado_por_nome_snapshot \|\| null/);
  assert.match(db, /executadoPorPerfilSnapshot: h\.executado_por_perfil_snapshot \|\| null/);
  const insertPayload = db.slice(db.indexOf("export async function adicionarHistoricoEquipamento"), db.indexOf("export async function limparHistoricoEquipamentos"));
  assert.doesNotMatch(insertPayload, /executado_por_/);
  assert.match(insertPayload, /\.select\(\)\.single\(\)/);
  assert.match(app, /Autor não registrado/);
  assert.match(app, /Realizado por/);
  assert.doesNotMatch(app, /Realizado por[^\n]*responsavel/);
});

test("microcopy e contrato de scroll do dossiê permanecem claros e responsivos", async () => {
  const component = await readSrc("EquipmentInventoryLedger.jsx");
  const css = await readSrc("EquipmentInventoryLedger.css");

  for (const label of ["Nº", "Onde está", "Com quem", "Situação", "Detalhes do equipamento", "Onde está agora", "Últimas movimentações", "Ver detalhes"]) {
    assert.match(component, new RegExp(label));
  }
  assert.match(css, /max-height: calc\(100dvh - 28px\)/);
  assert.match(css, /overflow-x: hidden/);
  assert.match(css, /overflow-y: auto/);
  assert.match(css, /overscroll-behavior: contain/);
  assert.match(css, /scrollbar-gutter: stable/);
  assert.match(css, /@media \(max-width: 1320px\)/);
  assert.match(css, /@media \(max-width: 780px\)/);
});
