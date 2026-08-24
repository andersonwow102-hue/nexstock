import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(new URL('../supabase/migrations/202608241000_pontos_ciclo_operacional.sql', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('./App.jsx', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('./PointsPage.jsx', import.meta.url), 'utf8');
const db = fs.readFileSync(new URL('./db.js', import.meta.url), 'utf8');

test('ciclo de pontos é aditivo e preserva o padrão operacional atual', () => {
  assert.match(migration, /situacao_operacional text not null default 'ativo'/);
  assert.match(migration, /check \(situacao_operacional in \('ativo', 'desativado'\)\)/);
  assert.doesNotMatch(migration, /delete from public\.pontos/i);
  assert.doesNotMatch(migration, /update public\.despesas_mensais/i);
  assert.doesNotMatch(migration, /update public\.equipamentos/i);
});

test('solicitação, decisão e reativação usam RPCs protegidas', () => {
  for (const fn of ['solicitar_desativacao_ponto', 'decidir_desativacao_ponto', 'reativar_ponto']) {
    assert.match(migration, new RegExp(`security definer[\\s\\S]+?set search_path = public, private, pg_temp[\\s\\S]+?${fn}|${fn}[\\s\\S]+?security definer[\\s\\S]+?set search_path = public, private, pg_temp`));
    assert.match(migration, new RegExp(`revoke all on function public\\.${fn}`));
  }
  assert.match(migration, /private\.perfil_atual\(\) <> 'gerente'/);
  assert.match(migration, /private\.perfil_atual\(\) <> 'administrador'/);
  assert.match(migration, /where id = p_solicitacao_id for update/);
  assert.match(migration, /where id = v_solicitacao\.ponto_id for update/);
});

test('aprovação repete a trava de equipamentos no banco', () => {
  assert.match(migration, /from public\.equipamentos e/);
  assert.match(migration, /lower\(btrim\(e\.localizacao\)\) = lower\(btrim\(v_ponto\.nome_fantasia\)\)/);
  assert.match(migration, /Remaneje ou disponibilize os equipamentos antes de desativar/);
  assert.match(page, /Use o fluxo existente de Equipamentos/);
  assert.match(migration, /for key share/);
  assert.match(migration, /Não é permitido vincular equipamento a um ponto desativado/);
});

test('despesas posteriores são bloqueadas sem recalcular histórico', () => {
  assert.match(migration, /before insert or update of ponto_id, competencia on public\.despesas_mensais/);
  assert.match(migration, /date_trunc\('month', new\.competencia::date\) > date_trunc\('month', v_desativado_em/);
  assert.doesNotMatch(migration, /set\s+(valor_real|valor_previsto|possui_despesa|valor_despesa)/i);
});

test('auditoria é imutável e não usa cascade', () => {
  assert.match(migration, /create table if not exists public\.historico_status_pontos/);
  assert.match(migration, /ponto_id bigint not null references public\.pontos\(id\) on delete restrict/);
  assert.match(migration, /revoke insert, update, delete on public\.solicitacoes_status_ponto, public\.historico_status_pontos from authenticated/);
  assert.match(migration, /estado_anterior/);
  assert.match(migration, /estado_posterior/);
});

test('interface distingue modalidade bloqueada de ponto desativado', () => {
  assert.match(page, /ponto-status-desativado/);
  assert.match(page, /Solicitar desativação/);
  assert.match(page, /Reativar ponto/);
  assert.match(page, /PainelSolicitacoesModalidade/);
  assert.match(page, /PainelSolicitacoesStatusPonto/);
  assert.match(db, /\.rpc\('solicitar_desativacao_ponto'/);
  assert.match(db, /\.rpc\('decidir_desativacao_ponto'/);
  assert.match(db, /\.rpc\('reativar_ponto'/);
});

test('pontos desativados não aparecem como destinos operacionais de equipamento', () => {
  assert.match(app, /pontosDestinoOperacional=pontosOperacionais\.filter\(p=>p\.situacaoOperacional!=="desativado"\)/);
  assert.match(app, /pontosDestinoOperacional\.map\(p=><option/g);
  assert.match(app, /Selecione um ponto ativo para receber o equipamento\./);
  assert.doesNotMatch(app, /pontosOperacionais\.map\(p=><option/);
});

test('interface evita solicitação duplicada e traduz erros do ciclo do ponto', () => {
  assert.match(page, /desativacaoPendente/);
  assert.match(page, /Desativação pendente/);
  assert.match(page, /mensagemErroCicloPonto/);
  assert.match(page, /encerramento operacional|encerra a operação do ponto/);
});
