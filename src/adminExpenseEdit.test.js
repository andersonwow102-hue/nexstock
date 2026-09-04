import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync(new URL("../supabase/migrations/202609021200_despesas_admin_edicao_auditada.sql", import.meta.url), "utf8");
const db = fs.readFileSync(new URL("./db.js", import.meta.url), "utf8");
const points = fs.readFileSync(new URL("./PointsPage.jsx", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
const fechamento = fs.readFileSync(new URL("./FechamentoWorkbench.jsx", import.meta.url), "utf8");

test("edição administrativa é backend-first, transacional e preserva competência", () => {
  assert.match(migration, /create table public\.despesas_mensais_edicoes/);
  assert.match(migration, /security definer[\s\S]*set search_path = ''/);
  assert.match(migration, /private\.perfil_atual\(\) <> 'administrador'/);
  assert.match(migration, /where id = p_despesa_id\s+for update/);
  assert.match(migration, /update public\.despesas_mensais[\s\S]*returning \* into v_depois/);
  assert.match(migration, /insert into public\.despesas_mensais_edicoes/);
  assert.match(migration, /after update on public\.despesas_mensais[\s\S]*private\.auditar_edicao_despesa_mensal_admin\(\)/);
  assert.doesNotMatch(migration, /set\s+competencia\s*=/i);
  assert.doesNotMatch(migration, /system_logs/i);
});

test("trilha específica é somente leitura para administrador e sem DML autenticado", () => {
  assert.match(migration, /for select[\s\S]*private\.perfil_atual\(\) = 'administrador'/);
  assert.match(migration, /revoke all on table public\.despesas_mensais_edicoes from public, anon, authenticated/);
  assert.match(migration, /grant select on table public\.despesas_mensais_edicoes to authenticated/);
  assert.doesNotMatch(migration, /perfil_atual\(\)\s+in\s+\([^)]*gerente/i);
});

test("frontend usa a RPC e expõe Editar sem mudar handlers de gerente", () => {
  assert.match(db, /\.rpc\('editar_despesa_mensal_admin'/);
  assert.match(points, /edicaoAdministrativa:true/);
  assert.match(points, /edicoesAdministrativas\?editarDespesaMensalAdmin\(linha\):salvarDespesaMensal\(linha\)/);
  assert.match(points, /"Editar"/);
  assert.match(fechamento, /despesas\.onEditar\(item\)/);
  assert.match(app, /onDespesasChange\?\.\(despesas\.map/);
  assert.match(app, /Competência preservada/);
});

test("Explorer separa despesa própria do gerente e reutiliza a edição auditada", () => {
  assert.match(points, /Despesa do gerente/);
  assert.match(points, /Despesas dos pontos/);
  assert.match(points, /onAbrirDespesaGerente\(despesa, competencia\)/);
  assert.match(points, /somenteEdicaoExistente/);
  assert.match(points, /edicaoInicialId=\{despesaGerenteAdmin\.id\}/);
  assert.match(points, /onSalvar=\{async\(\.\.\.args\)=>\{await salvarDespesasPonto\(\.\.\.args\)/);
});
