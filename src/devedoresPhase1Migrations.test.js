import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(projectRoot, "supabase", "migrations");
const phase1Files = readdirSync(migrationsDir)
  .filter((name) => /^20260813\d{4}_devedores_.*\.sql$/.test(name))
  .sort();
const sqlByFile = new Map(
  phase1Files.map((name) => [name, readFileSync(join(migrationsDir, name), "utf8")]),
);
const allSql = [...sqlByFile.values()].join("\n").toLowerCase();
const localBootstrap = readFileSync(
  join(projectRoot, "supabase", "tests", "bootstrap_perfis_local.sql"),
  "utf8",
);
const phase1RlsTest = readFileSync(
  join(projectRoot, "supabase", "tests", "devedores_phase1_rls.sql"),
  "utf8",
);

test("fase 1 possui migrations pequenas na ordem aprovada", () => {
  assert.deepEqual(phase1Files, [
    "202608130900_devedores_modalidades.sql",
    "202608130910_devedores_relatorios_dividas.sql",
    "202608130920_devedores_historico.sql",
    "202608130930_devedores_helpers_privados.sql",
    "202608130940_devedores_rls_leitura.sql",
    "202608130950_devedores_rpc_cadastro.sql",
    "202608131000_devedores_rpc_correcao_gerente.sql",
    "202608131010_devedores_rpc_correcao_admin.sql",
    "202608131020_devedores_grants_hardening.sql",
  ]);
});

test("migrations nao alteram tabelas operacionais", () => {
  const forbiddenTargets = [
    "fechamentos_rotas", "despesas_mensais", "pix_chaves", "pix_envios",
    "pontos", "equipamentos", "consertos_equipamentos", "historico_equipamentos",
    "historico_pontos", "mensagens_internas", "prorrogacoes_despesas",
  ];
  for (const table of forbiddenTargets) {
    assert.doesNotMatch(allSql, new RegExp(`(?:insert\\s+into|update|delete\\s+from|alter\\s+table|create\\s+trigger[^;]*on)\\s+(?:public\\.)?${table}\\b`, "i"));
  }
});

test("dominio nao cria estruturas de fases futuras", () => {
  assert.doesNotMatch(allSql, /create\s+table\s+(?:public\.)?devedores_(?:negociacoes|parcelas|pagamentos|transferencias)/i);
  assert.doesNotMatch(allSql, /\b(?:quitacao|estorno|renegociacao)\b/i);
});

test("tabelas possuem RLS e escrita direta permanece revogada", () => {
  for (const table of ["devedores_modalidades", "devedores_relatorios", "devedores_dividas", "devedores_historico"]) {
    assert.match(allSql, new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, "i"));
    assert.match(allSql, new RegExp(`revoke\\s+all\\s+on\\s+public\\.${table}\\s+from\\s+public,\\s*anon,\\s*authenticated`, "i"));
    assert.match(allSql, new RegExp(`grant\\s+select\\s+on\\s+public\\.${table}\\s+to\\s+authenticated`, "i"));
  }
  assert.doesNotMatch(allSql, /grant\s+(?:insert|update|delete|all)[^;]*devedores_/i);
});

test("consulta recebe leitura global sem politica de escrita", () => {
  const rls = sqlByFile.get("202608130940_devedores_rls_leitura.sql");
  assert.match(rls, /exists\s*\(\s*select\s+1\s+from\s+public\.perfis/i);
  assert.match(rls, /p\.user_id\s*=\s*auth\.uid\(\)/i);
  assert.match(rls, /p\.perfil\s+in\s*\(\s*'operador',\s*'administrador',\s*'consulta'\s*\)/i);
  assert.doesNotMatch(rls, /private\.perfil_atual\(\)/i);
  assert.doesNotMatch(allSql, /create\s+policy[^;]+for\s+(?:insert|update|delete|all)[^;]+consulta/is);
});

test("todas as policies exigem perfil real e gerente usa UUID da sessao", () => {
  const rls = sqlByFile.get("202608130940_devedores_rls_leitura.sql");
  const policies = rls.match(/create policy[\s\S]*?;/gi) || [];
  assert.equal(policies.length, 4);
  for (const policy of policies) {
    assert.match(policy, /exists\s*\(\s*select\s+1\s+from\s+public\.perfis/i);
    assert.match(policy, /p\.user_id\s*=\s*auth\.uid\(\)/i);
  }
  assert.match(rls, /p\.perfil\s*=\s*'gerente'\s+and\s+gerente_responsavel_id\s*=\s*p\.user_id/i);
});

test("RPCs mutaveis validam perfil, autenticacao e usam search_path fixo", () => {
  for (const name of [
    "devedores_cadastrar_relatorio_divida",
    "devedores_corrigir_relatorio_gerente",
    "devedores_corrigir_fase1_admin",
  ]) {
    const migration = [...sqlByFile.values()].find((sql) => sql.includes(`function public.${name}`));
    assert.ok(migration, `migration da RPC ${name} ausente`);
    assert.match(migration, /security definer/i);
    assert.match(migration, /set search_path = public, private, pg_temp/i);
    assert.match(migration, /auth\.uid\(\) is null/i);
    assert.match(migration, /v_identidade\.user_id is null/i);
    assert.match(migration, /v_identidade\.perfil is distinct from/i);
    assert.doesNotMatch(migration, /v_identidade\.perfil\s*<>/i);
    assert.doesNotMatch(migration, /insert\s+into\s+public\.(?!devedores_)/i);
    assert.doesNotMatch(migration, /update\s+public\.(?!devedores_)/i);
    assert.doesNotMatch(migration, /delete\s+from/i);
  }
});

test("cadastro deriva gerente e criador da sessao", () => {
  const sql = sqlByFile.get("202608130950_devedores_rpc_cadastro.sql");
  assert.match(sql, /auth\.uid\(\)/i);
  assert.match(sql, /private\.devedores_identidade_atual\(\)/i);
  assert.doesNotMatch(sql, /p_(?:gerente|criador|responsavel)/i);
});

test("correcoes exigem versao e auditoria", () => {
  for (const file of [
    "202608131000_devedores_rpc_correcao_gerente.sql",
    "202608131010_devedores_rpc_correcao_admin.sql",
  ]) {
    const sql = sqlByFile.get(file);
    assert.match(sql, /versao/i);
    assert.match(sql, /insert into public\.devedores_historico/i);
    assert.match(sql, /dados_anteriores/i);
    assert.match(sql, /dados_novos/i);
    assert.doesNotMatch(sql, /to_jsonb\s*\(\s*v_(?:anterior|novo|relatorio_anterior|relatorio_novo|divida_anterior|divida_nova)\s*\)/i);
  }
});

test("snapshot cadastral atualiza nas duas correcoes", () => {
  for (const file of [
    "202608131000_devedores_rpc_correcao_gerente.sql",
    "202608131010_devedores_rpc_correcao_admin.sql",
  ]) {
    const sql = sqlByFile.get(file);
    assert.match(sql, /v_snapshot\s*:=\s*jsonb_build_object/i);
    assert.match(sql, /relatorio_snapshot\s*=\s*v_snapshot/i);
  }
});

test("correcoes rejeitam operacao sem mudanca", () => {
  for (const file of [
    "202608131000_devedores_rpc_correcao_gerente.sql",
    "202608131010_devedores_rpc_correcao_admin.sql",
  ]) {
    assert.match(sqlByFile.get(file), /nenhuma alteracao/i);
  }
});

test("modalidade precisa estar ativa no cadastro e na correcao administrativa", () => {
  for (const file of [
    "202608130950_devedores_rpc_cadastro.sql",
    "202608131010_devedores_rpc_correcao_admin.sql",
  ]) {
    assert.match(sqlByFile.get(file), /devedores_modalidades\s+where\s+id\s*=\s*p_modalidade_id\s+and\s+ativo/i);
  }
});

test("historico vincula entidade e identificador de forma coerente", () => {
  const sql = sqlByFile.get("202608130920_devedores_historico.sql");
  assert.match(sql, /entidade\s*=\s*'relatorio'\s+and\s+entidade_id\s*=\s*relatorio_id/i);
  assert.match(sql, /entidade\s*=\s*'divida'\s+and\s+entidade_id\s*=\s*divida_id/i);
});

test("banco limita payloads textuais da fase 1", () => {
  const schemaSql = [
    sqlByFile.get("202608130900_devedores_modalidades.sql"),
    sqlByFile.get("202608130910_devedores_relatorios_dividas.sql"),
    sqlByFile.get("202608130920_devedores_historico.sql"),
  ].join("\n");
  for (const field of ["nome_fantasia", "complemento", "bairro", "observacoes_cadastrais", "observacoes_originais", "motivo"]) {
    assert.match(schemaSql, new RegExp(`${field}[^;]*char_length`, "is"));
  }
});

test("testes estaticos sao contratos textuais, nao execucao PostgreSQL", () => {
  assert.ok(phase1Files.length > 0);
});

test("roteiro de RLS prepara perfis sem depender de trigger de autenticacao", () => {
  assert.match(phase1RlsTest, /insert\s+into\s+public\.perfis[\s\S]*v_manager_a[\s\S]*v_consulta/i);
  assert.match(phase1RlsTest, /delete\s+from\s+public\.perfis\s+where\s+user_id\s*=\s*v_sem_perfil/i);
  assert.match(phase1RlsTest, /request\.jwt\.claim\.sub',\s*v_sem_perfil::text/i);
  assert.doesNotMatch(phase1RlsTest, /trigger\s+local\s+nao\s+criou\s+perfil/i);
  assert.match(phase1RlsTest, /rollback\s*;\s*$/i);
});

test("bootstrap local reproduz o contrato real de perfis sem virar migration", () => {
  assert.match(localBootstrap, /BOOTSTRAP EXCLUSIVO PARA TESTE LOCAL DESCARTAVEL/i);
  assert.match(localBootstrap, /perfil text not null default 'consulta'/i);
  assert.match(localBootstrap, /perfil in \('administrador', 'operador', 'gerente', 'consulta'\)/i);
  assert.match(localBootstrap, /rotas_permitidas text\[\] not null default '\{\}'::text\[\]/i);
  assert.match(localBootstrap, /create or replace function private\.perfil_atual\(\)/i);
  assert.match(localBootstrap, /create or replace function private\.gerente_atual\(\)/i);
  assert.match(localBootstrap, /create trigger criar_perfil_ao_cadastrar_usuario/i);
  assert.match(localBootstrap, /new\.raw_user_meta_data->>'name'/i);
  assert.doesNotMatch(localBootstrap, /devedores_/i);
});
