import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(new URL('../supabase/migrations/202608241000_pontos_ciclo_operacional.sql', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('./App.jsx', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('./PointsPage.jsx', import.meta.url), 'utf8');
const db = fs.readFileSync(new URL('./db.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('./PointsCommandFlow.css', import.meta.url), 'utf8');
const uxHarness = fs.readFileSync(new URL('./ux-scroll-qa/UxScrollQaApp.jsx', import.meta.url), 'utf8');
const expenses = fs.readFileSync(new URL('./pointsExpenses.js', import.meta.url), 'utf8');
const pointsPreview = fs.readFileSync(new URL('./PointsOperationsPreviewApp.jsx', import.meta.url), 'utf8');
const pointsPreviewState = fs.readFileSync(new URL('./pointsPreviewState.js', import.meta.url), 'utf8');

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

test('frontend de Pontos não oferece exclusão física nem automação de encerramento', () => {
  assert.doesNotMatch(page, /\bexcluirPonto\b/);
  assert.doesNotMatch(page, /\b(?:excluirHandler|disponibilizarEquipamentosEExcluirPonto|podeExcluirPonto|setExcluindo)\b/);
  assert.doesNotMatch(page, /Disponibilizar e excluir|Excluir ponto|Confirmar exclusão/);
  assert.doesNotMatch(uxHarness, /Excluir ponto|Disponibilizar e excluir/);
  assert.match(db, /export async function excluirPonto\(id\)/);
});

test('ciclo formal mantém decisão bloqueada e encaminha movimentação manual', () => {
  const inicioFila = page.indexOf('function PainelSolicitacoesStatusPonto');
  const fimFila = page.indexOf('function PainelSolicitacoesModalidade', inicioFila);
  const fila = page.slice(inicioFila, fimFila);
  const inicioCiclo = page.indexOf('async function enviarSolicitacaoDesativacao');
  const fimCiclo = page.indexOf('const ABAS', inicioCiclo);
  const ciclo = page.slice(inicioCiclo, fimCiclo);

  assert.ok(inicioFila >= 0 && fimFila > inicioFila, 'fila administrativa do ciclo não encontrada');
  assert.ok(inicioCiclo >= 0 && fimCiclo > inicioCiclo, 'handlers do ciclo formal não encontrados');
  assert.match(fila, /disabled=\{vinculados\.length>0\}/);
  assert.match(fila, /Use o fluxo existente de Equipamentos/);
  assert.match(ciclo, /solicitarDesativacaoPonto/);
  assert.match(ciclo, /decidirDesativacaoPonto/);
  assert.match(ciclo, /reativarPonto/);
  assert.doesNotMatch(ciclo, /salvarEquipamento|onEquipamentosChange|equipamentos\.map/);
});

test('Operations Ledger preserva paginação e aplica filtros derivados em memória', () => {
  assert.match(page, /const POR_PAGINA=25/);
  assert.match(page, /filtroSituacao/);
  assert.match(page, /filtroVinculo/);
  assert.match(page, /filtroSituacao==="desativado"\?dados\.desativado:!dados\.desativado/);
  assert.match(page, /filtroVinculo==="com"\?dados\.vinculados\.length>0:dados\.vinculados\.length===0/);
  assert.match(page, /pcf-route-chapter/);
  assert.match(page, /capitulo\.pontos\.length/);
});

test('exportações recebem todos os resultados filtrados e não somente a página', () => {
  assert.match(page, /onExportExcel\(ordenados\)/);
  assert.match(page, /onExportPDF\(ordenados\)/);
  assert.match(page, /const visiveis=ordenados\.slice/);
  assert.doesNotMatch(page, /onExportExcel\(visiveis\)|onExportPDF\(visiveis\)/);
});

test('histórico formal é somente leitura, localizado e falha sem derrubar a página', () => {
  const inicio = db.indexOf('export async function carregarHistoricoStatusPonto');
  const fim = db.indexOf('export async function solicitarDesativacaoPonto', inicio);
  const consulta = db.slice(inicio, fim);
  assert.ok(inicio >= 0 && fim > inicio, 'consulta do histórico formal não encontrada');
  assert.match(consulta, /from\('historico_status_pontos'\)/);
  assert.match(consulta, /eq\('ponto_id', id\)/);
  assert.match(consulta, /order\('criado_em', \{ ascending: false \}\)/);
  assert.match(consulta, /limit\(50\)/);
  assert.doesNotMatch(consulta, /\.insert\(|\.update\(|\.delete\(|\.rpc\(/);
  assert.match(db, /motivo: normalizeFreeText\(row\.motivo \|\| ''\)/);
  assert.match(page, /historicoFormalCacheRef/);
  assert.match(page, /historicoFormalPendentesRef/);
  assert.match(page, /historicoFormalRequestRef/);
  assert.match(page, /status:"error"/);
  assert.match(page, /Tentar novamente/);
  assert.match(page, /Histórico de cadastro/);
});

test('sheet de Pontos usa breakpoint único e limpa seleção obsoleta', () => {
  assert.match(page, /PONTOS_DOSSIE_SHEET_QUERY = "\(max-width: 1360px\)"/);
  assert.match(page, /pontoSelecionadoId!==null&&pontoSelecionadoAtivoId===null/);
  assert.match(page, /acquireMainScrollLock\(\)/);
  assert.match(page, /event\.key==="Escape"/);
  assert.match(page, /focoAntesDossieRef/);
  assert.match(page, /PontosDossiePortal/);
  assert.match(css, /@media \(max-width: 1360px\)/);
  assert.match(css, /max-height:\s*min\(88dvh, 760px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test('rejeição permanece evento contextual e não recebe semântica destrutiva', () => {
  assert.match(page, /desativacao_rejeitada: "Solicitação rejeitada"/);
  assert.match(css, /is-desativacao_rejeitada[\s\S]*?var\(--pcf-warning\)/);
  const inicioRastro = page.indexOf('className="pcf-folio-section pcf-operational-trace"');
  const fimRastro = page.indexOf('className="pcf-folio-section pcf-folio-administration"', inicioRastro);
  assert.doesNotMatch(page.slice(inicioRastro, fimRastro), /tone="danger"|pcf-danger/);
});

test('Expenses Explorer reutiliza o escopo atual e permanece invisível para operador', () => {
  assert.match(page, /operador \? Promise\.resolve\(\[\]\) : carregarDespesasMensais\(\)/);
  assert.match(page, /const mostrarDespesas = !operador/);
  assert.match(page, /despesasEscopo = mostrarDespesas/);
  assert.match(page, /totalDespesasCompetencia = despesasVisiveis/);
  assert.match(page, /verDespesas&&mostrarDespesas&&<PointExpensesModal/);
  assert.match(page, /mostrarDespesas&&<button type="button" className="pcf-register-finance"/);
  assert.doesNotMatch(expenses, /carregarDespesasMensais|supabase|\.rpc\(|\.insert\(|\.update\(|\.delete\(/);
});

test('entrada financeira abre uma análise consolidada acessível', () => {
  assert.match(page, /aria-haspopup="dialog"/);
  assert.match(page, /aria-expanded=\{despesasAbertas\}/);
  assert.match(page, /aria-controls="pcf-expenses-explorer"/);
  assert.match(page, /ExpensesExplorerPortal/);
  assert.match(page, /element\.inert = true/);
  assert.doesNotMatch(page, /element\.setAttribute\("aria-hidden", "true"\)/);
  assert.match(page, /title="Despesas da rede"/);
  assert.match(page, /closeLabel="Fechar despesas da rede"/);
  assert.match(page, /OperationModal/);
});

test('Explorer separa Rotas e Pontos e preserva transição, busca e detalhe real', () => {
  const inicio = page.indexOf('export function PointExpensesModal');
  const fim = page.indexOf('// ─── ABA: Visão Geral', inicio);
  const explorer = page.slice(inicio, fim);
  assert.ok(inicio >= 0 && fim > inicio, 'Expenses Explorer não encontrado');
  assert.match(explorer, /role="tablist"/);
  assert.match(explorer, />Rotas<\/button>/);
  assert.match(explorer, />Pontos<\/button>/);
  assert.match(explorer, /setPerspectiva\("pontos"\)/);
  assert.match(explorer, /setRotaSelecionada\(rota\)/);
  assert.match(explorer, /const alterarCompetencia = valor => \{[\s\S]*?setPerspectiva\("rotas"\)[\s\S]*?setRotaSelecionada\("Todas"\)[\s\S]*?setSituacaoSelecionada\("todos"\)[\s\S]*?setBusca\(""\)/);
  assert.match(explorer, /Despesa do gerente \$\{formatarReais\(item\.totalGerente\)\}/);
  assert.match(explorer, /type="search"/);
  assert.match(explorer, /Todos <b>/);
  assert.match(explorer, /Com despesas <b>/);
  assert.match(explorer, /Sem despesas <b>/);
  assert.match(explorer, /listarDespesasPonto/);
  assert.match(explorer, /onAbrirDespesaPonto\(pontoSelecionado, competencia\)/);
  assert.match(explorer, /voltarPontosRef\.current\?\.focus/);
  assert.match(explorer, /focoOrigemExplorerRef/);
  assert.doesNotMatch(explorer, /carregarDespesasMensais|salvarDespesaMensal|excluirDespesaMensal|\.rpc\(/);
});

test('Explorer tem workspace responsivo e valores financeiros neutros', () => {
  assert.match(css, /\.pcf-expenses-explorer\s*\{[\s\S]*?width:\s*min\(1180px/);
  assert.match(css, /\.pcf-expenses-route-row/);
  assert.match(css, /\.pcf-expenses-point-row/);
  assert.match(css, /@media \(max-width: 680px\)[\s\S]*?\.pcf-expenses-explorer[\s\S]*?max-height:\s*min\(92dvh, 820px\)/);
  assert.match(css, /calc\(14px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  const inicio = css.indexOf('.points-command-flow .pcf-expenses-route-value strong');
  const fim = css.indexOf('.points-command-flow .pcf-expenses-points-context', inicio);
  assert.match(css.slice(inicio, fim), /color:\s*var\(--pcf-text\)/);
  assert.doesNotMatch(css.slice(inicio, fim), /pcf-success|state-success|verde/);
});

test('acabamento de Pontos usa profundidade mineral, seleção fria e motion finito', () => {
  assert.match(css, /--pcf-accent:\s*#3d8f95/);
  assert.match(css, /--pcf-champagne:\s*#bba883/);
  assert.match(css, /--pcf-depth-2:/);
  assert.match(css, /--pcf-motion-hover:\s*140ms/);
  assert.match(css, /--pcf-motion-overlay:\s*280ms/);
  assert.match(css, /\.pcf-record\.is-selected[\s\S]*?var\(--pcf-accent-wash\)/);
  assert.match(css, /\.pcf-expenses-route-share/);
  assert.match(css, /@keyframes pcf-workspace-in/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test('preview local cobre Light, Dark e perspectivas abertas sem backend', () => {
  assert.match(pointsPreview, /resolverEstadoPreviewPontos/);
  assert.match(pointsPreview, /pontoSelecionadoInicialId=\{estadoInicial\.pontoSelecionadoId\}/);
  assert.match(pointsPreview, /pontoSelecionadoInicialId=\{estadoInicial\.pontoDespesasId\}/);
  assert.match(pointsPreviewState, /new Set\(\["routes", "points", "detail"\]\)/);
  assert.match(pointsPreviewState, /idsPermitidos\.has\(id\)/);
  assert.match(pointsPreview, /PointExpensesModal/);
  assert.match(pointsPreview, /DESPESAS_PREVIEW/);
  assert.match(pointsPreview, /TOTAL_DESPESAS_PREVIEW/);
  assert.match(pointsPreview, /Fixture local · zero escrita/);
  assert.doesNotMatch(pointsPreview, /carregarDespesasMensais|salvarDespesaMensal|excluirDespesaMensal/);
});
